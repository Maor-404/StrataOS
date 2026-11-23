/**
 * Lock-Free Wayland Shared Memory & SPSC Ring-Buffer Protocol (`src/wayland/shmRing.ts`)
 *
 * Implements zero-copy shared memory transport (`SharedArrayBuffer` + `Atomics`)
 * between a Wayland guest/bridge producer and the dedicated WebGPU compositor Worker:
 *
 * 1. `ShmPixelPool` — Pre-allocated `wl_shm` pixel heap supporting `ARGB8888`, `XRGB8888`,
 *    `ABGR8888`, and `XBGR8888` buffers with 256-byte aligned strides for optimal GPU uploads.
 * 2. `CommandRingBuffer` — Lock-free SPSC producer -> compositor ring carrying surface
 *    lifecycle, `xdg_toplevel` geometry/stacking, `wl_surface.attach`, `damage_buffer`,
 *    and atomic `COMMIT` + `Atomics.notify` wakeups.
 * 3. `EventRingBuffer` — Lock-free SPSC compositor -> guest reverse ring carrying
 *    `FRAME_DONE` (`wl_callback.done`) and surface-local `wl_pointer`/`wl_keyboard` events.
 * 4. `CompositorTelemetryBuffer` — Shared atomic stats block for zero-GC HUD reads.
 */

export const WL_SHM_FORMAT_ARGB8888 = 0 // Little-endian [B, G, R, A] premultiplied alpha
export const WL_SHM_FORMAT_XRGB8888 = 1 // Little-endian [B, G, R, X] opaque
export const WL_SHM_FORMAT_ABGR8888 = 2 // Little-endian [R, G, B, A] premultiplied alpha
export const WL_SHM_FORMAT_XBGR8888 = 3 // Little-endian [R, G, B, X] opaque

export type WaylandShmFormat =
  | typeof WL_SHM_FORMAT_ARGB8888
  | typeof WL_SHM_FORMAT_XRGB8888
  | typeof WL_SHM_FORMAT_ABGR8888
  | typeof WL_SHM_FORMAT_XBGR8888

// Producer -> Compositor command opcodes
export const OP_CREATE_SURFACE = 1
export const OP_DESTROY_SURFACE = 2
export const OP_SET_TOPLEVEL = 3
export const OP_ATTACH_BUFFER = 4
export const OP_DAMAGE_BUFFER = 5
export const OP_COMMIT = 6
export const OP_SET_SURFACE_FLAGS = 7

// Surface behavior flags (bitmask)
export const SURFACE_FLAG_DRAGGABLE = 1 << 0
export const SURFACE_FLAG_OPAQUE = 1 << 1
export const SURFACE_FLAG_VISIBLE = 1 << 2

// Compositor -> Guest reverse event opcodes
export const EV_FRAME_DONE = 1
export const EV_POINTER_ENTER = 2
export const EV_POINTER_LEAVE = 3
export const EV_POINTER_MOTION = 4
export const EV_POINTER_BUTTON = 5
export const EV_POINTER_AXIS = 6
export const EV_KEYBOARD_KEY = 7
export const EV_SURFACE_MOVED = 8
export const EV_SURFACE_FOCUS = 9

// Command ring layout: 64-byte header + N * 64-byte slots (16 Int32 per slot)
const CMD_HEADER_INTS = 16
const CMD_SLOT_INTS = 16
export const CMD_DEFAULT_CAPACITY = 1024 // power of 2 -> 64 KiB

const CMD_IDX_HEAD = 0 // Consumer read index (monotonic)
const CMD_IDX_TAIL = 1 // Producer write index (monotonic)
const CMD_IDX_CAPACITY = 2
const CMD_IDX_NOTIFY = 3 // Incremented + Atomics.notify on COMMIT

// Reverse event ring layout: 64-byte header + N * 32-byte slots (8 Int32 per slot)
const EV_HEADER_INTS = 16
const EV_SLOT_INTS = 8
export const EV_DEFAULT_CAPACITY = 512 // power of 2 -> 16 KiB

const EV_IDX_HEAD = 0
const EV_IDX_TAIL = 1
const EV_IDX_CAPACITY = 2
const EV_IDX_NOTIFY = 3

// Inline title bytes stored inside SET_TOPLEVEL command slot (ints 6..15 -> 40 bytes)
const MAX_INLINE_TITLE_BYTES = 36

export const DEFAULT_SHM_POOL_BYTES = 24 * 1024 * 1024 // 24 MiB wl_shm pixel heap

export function alignStride256(width: number): number {
  const raw = Math.max(1, Math.floor(width)) * 4
  return Math.ceil(raw / 256) * 256
}

export function createSharedOrArrayBuffer(
  byteLength: number
): SharedArrayBuffer | ArrayBuffer {
  if (
    typeof SharedArrayBuffer === 'function' &&
    globalThis.crossOriginIsolated
  ) {
    return new SharedArrayBuffer(byteLength)
  }
  return new ArrayBuffer(byteLength)
}

export interface ShmBufferAllocation {
  offset: number
  width: number
  height: number
  stride: number
  byteLength: number
  format: WaylandShmFormat
}

interface FreeBlock {
  offset: number
  size: number
}

/**
 * `wl_shm_pool` pixel heap over a `SharedArrayBuffer` with 256-byte aligned allocations.
 */
export class ShmPixelPool {
  public readonly buffer: SharedArrayBuffer | ArrayBuffer
  public readonly bytes: Uint8Array
  public readonly u32: Uint32Array
  public readonly byteLength: number
  public readonly isShared: boolean

  private freeList: FreeBlock[]

  constructor(bufferOrSize: SharedArrayBuffer | ArrayBuffer | number = DEFAULT_SHM_POOL_BYTES) {
    if (typeof bufferOrSize === 'number') {
      this.buffer = createSharedOrArrayBuffer(bufferOrSize)
    } else {
      this.buffer = bufferOrSize
    }
    this.byteLength = this.buffer.byteLength
    this.bytes = new Uint8Array(this.buffer)
    this.u32 = new Uint32Array(this.buffer)
    this.isShared =
      typeof SharedArrayBuffer === 'function' &&
      this.buffer instanceof SharedArrayBuffer
    this.freeList = [{ offset: 0, size: this.byteLength }]
  }

  public alloc(
    width: number,
    height: number,
    format: WaylandShmFormat = WL_SHM_FORMAT_ARGB8888
  ): ShmBufferAllocation {
    const w = Math.max(1, Math.floor(width))
    const h = Math.max(1, Math.floor(height))
    const stride = alignStride256(w)
    const size = Math.ceil((stride * h) / 256) * 256

    for (let i = 0; i < this.freeList.length; i++) {
      const blk = this.freeList[i]
      if (blk.size >= size) {
        const offset = blk.offset
        if (blk.size === size) {
          this.freeList.splice(i, 1)
        } else {
          blk.offset += size
          blk.size -= size
        }
        return { offset, width: w, height: h, stride, byteLength: size, format }
      }
    }

    throw new Error(
      `ShmPixelPool OOM: requested ${(size / 1048576).toFixed(2)} MiB out of ${(this.byteLength / 1048576).toFixed(1)} MiB`
    )
  }

  public free(alloc: ShmBufferAllocation): void {
    this.freeList.push({ offset: alloc.offset, size: alloc.byteLength })
    this.freeList.sort((a, b) => a.offset - b.offset)
    for (let i = 0; i < this.freeList.length - 1; ) {
      const cur = this.freeList[i]
      const next = this.freeList[i + 1]
      if (cur.offset + cur.size === next.offset) {
        cur.size += next.size
        this.freeList.splice(i + 1, 1)
      } else {
        i++
      }
    }
  }

  public getBufferBytes(alloc: ShmBufferAllocation): Uint8Array {
    return this.bytes.subarray(alloc.offset, alloc.offset + alloc.stride * alloc.height)
  }
}

export type WaylandCommand =
  | { op: typeof OP_CREATE_SURFACE; surfaceId: number }
  | { op: typeof OP_DESTROY_SURFACE; surfaceId: number }
  | {
      op: typeof OP_SET_TOPLEVEL
      surfaceId: number
      x: number
      y: number
      zIndex: number
      title: string
    }
  | {
      op: typeof OP_ATTACH_BUFFER
      surfaceId: number
      shmOffset: number
      width: number
      height: number
      stride: number
      format: WaylandShmFormat
    }
  | {
      op: typeof OP_DAMAGE_BUFFER
      surfaceId: number
      x: number
      y: number
      width: number
      height: number
    }
  | { op: typeof OP_COMMIT; surfaceId: number; submitTimeMs: number }
  | { op: typeof OP_SET_SURFACE_FLAGS; surfaceId: number; flags: number }

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

/**
 * Lock-free SPSC Command & Damage Ring Buffer (Guest/Host Producer -> Compositor Worker).
 */
export class CommandRingBuffer {
  public readonly buffer: SharedArrayBuffer | ArrayBuffer
  public readonly capacity: number
  private readonly mask: number
  private readonly ctrl: Int32Array
  private readonly slots: Int32Array
  private readonly slotBytes: Uint8Array
  private readonly isShared: boolean

  constructor(bufferOrCapacity: SharedArrayBuffer | ArrayBuffer | number = CMD_DEFAULT_CAPACITY) {
    if (typeof bufferOrCapacity === 'number') {
      const cap = Math.max(64, 1 << Math.ceil(Math.log2(bufferOrCapacity)))
      const totalBytes = (CMD_HEADER_INTS + cap * CMD_SLOT_INTS) * 4
      this.buffer = createSharedOrArrayBuffer(totalBytes)
      this.capacity = cap
      this.ctrl = new Int32Array(this.buffer, 0, CMD_HEADER_INTS)
      this.ctrl[CMD_IDX_HEAD] = 0
      this.ctrl[CMD_IDX_TAIL] = 0
      this.ctrl[CMD_IDX_CAPACITY] = cap
      this.ctrl[CMD_IDX_NOTIFY] = 0
    } else {
      this.buffer = bufferOrCapacity
      this.ctrl = new Int32Array(this.buffer, 0, CMD_HEADER_INTS)
      this.capacity = this.ctrl[CMD_IDX_CAPACITY] || CMD_DEFAULT_CAPACITY
    }
    this.mask = this.capacity - 1
    this.slots = new Int32Array(this.buffer, CMD_HEADER_INTS * 4)
    this.slotBytes = new Uint8Array(this.buffer, CMD_HEADER_INTS * 4)
    this.isShared =
      typeof SharedArrayBuffer === 'function' &&
      this.buffer instanceof SharedArrayBuffer
  }

  private loadHead(): number {
    return this.isShared
      ? Atomics.load(this.ctrl, CMD_IDX_HEAD)
      : this.ctrl[CMD_IDX_HEAD]
  }

  private loadTail(): number {
    return this.isShared
      ? Atomics.load(this.ctrl, CMD_IDX_TAIL)
      : this.ctrl[CMD_IDX_TAIL]
  }

  private reserveSlot(): number {
    const tail = this.loadTail()
    const head = this.loadHead()
    if (tail - head >= this.capacity) {
      return -1
    }
    return tail
  }

  private publishTail(nextTail: number, notify: boolean): void {
    if (this.isShared) {
      Atomics.store(this.ctrl, CMD_IDX_TAIL, nextTail)
      if (notify) {
        Atomics.add(this.ctrl, CMD_IDX_NOTIFY, 1)
        Atomics.notify(this.ctrl, CMD_IDX_NOTIFY, 1)
      }
    } else {
      this.ctrl[CMD_IDX_TAIL] = nextTail
      if (notify) this.ctrl[CMD_IDX_NOTIFY]++
    }
  }

  public getNotifyCounter(): number {
    return this.isShared
      ? Atomics.load(this.ctrl, CMD_IDX_NOTIFY)
      : this.ctrl[CMD_IDX_NOTIFY]
  }

  public createSurface(surfaceId: number): boolean {
    const tail = this.reserveSlot()
    if (tail < 0) return false
    const base = (tail & this.mask) * CMD_SLOT_INTS
    this.slots[base] = OP_CREATE_SURFACE
    this.slots[base + 1] = surfaceId | 0
    this.publishTail(tail + 1, false)
    return true
  }

  public destroySurface(surfaceId: number): boolean {
    const tail = this.reserveSlot()
    if (tail < 0) return false
    const base = (tail & this.mask) * CMD_SLOT_INTS
    this.slots[base] = OP_DESTROY_SURFACE
    this.slots[base + 1] = surfaceId | 0
    this.publishTail(tail + 1, true)
    return true
  }

  public setToplevel(
    surfaceId: number,
    x: number,
    y: number,
    zIndex: number,
    title: string
  ): boolean {
    const tail = this.reserveSlot()
    if (tail < 0) return false
    const idx = tail & this.mask
    const base = idx * CMD_SLOT_INTS
    this.slots[base] = OP_SET_TOPLEVEL
    this.slots[base + 1] = surfaceId | 0
    this.slots[base + 2] = Math.round(x)
    this.slots[base + 3] = Math.round(y)
    this.slots[base + 4] = zIndex | 0

    const encoded = textEncoder.encode(title)
    const len = Math.min(MAX_INLINE_TITLE_BYTES, encoded.byteLength)
    this.slots[base + 5] = len
    const byteBase = (base + 6) * 4
    this.slotBytes.set(encoded.subarray(0, len), byteBase)

    this.publishTail(tail + 1, false)
    return true
  }

  public setSurfaceFlags(surfaceId: number, flags: number): boolean {
    const tail = this.reserveSlot()
    if (tail < 0) return false
    const base = (tail & this.mask) * CMD_SLOT_INTS
    this.slots[base] = OP_SET_SURFACE_FLAGS
    this.slots[base + 1] = surfaceId | 0
    this.slots[base + 2] = flags | 0
    this.publishTail(tail + 1, false)
    return true
  }

  public attachBuffer(
    surfaceId: number,
    shmOffset: number,
    width: number,
    height: number,
    stride: number,
    format: WaylandShmFormat
  ): boolean {
    const tail = this.reserveSlot()
    if (tail < 0) return false
    const base = (tail & this.mask) * CMD_SLOT_INTS
    this.slots[base] = OP_ATTACH_BUFFER
    this.slots[base + 1] = surfaceId | 0
    this.slots[base + 2] = shmOffset | 0
    this.slots[base + 3] = width | 0
    this.slots[base + 4] = height | 0
    this.slots[base + 5] = stride | 0
    this.slots[base + 6] = format | 0
    this.publishTail(tail + 1, false)
    return true
  }

  public damageBuffer(
    surfaceId: number,
    x: number,
    y: number,
    width: number,
    height: number
  ): boolean {
    const tail = this.reserveSlot()
    if (tail < 0) return false
    const base = (tail & this.mask) * CMD_SLOT_INTS
    this.slots[base] = OP_DAMAGE_BUFFER
    this.slots[base + 1] = surfaceId | 0
    this.slots[base + 2] = Math.floor(x)
    this.slots[base + 3] = Math.floor(y)
    this.slots[base + 4] = Math.ceil(width)
    this.slots[base + 5] = Math.ceil(height)
    this.publishTail(tail + 1, false)
    return true
  }

  public commit(surfaceId: number, submitTimeMs = performance.now()): boolean {
    const tail = this.reserveSlot()
    if (tail < 0) return false
    const base = (tail & this.mask) * CMD_SLOT_INTS
    this.slots[base] = OP_COMMIT
    this.slots[base + 1] = surfaceId | 0
    // Store timestamp in 10-microsecond units (fits signed 32-bit for ~5.9 hours)
    this.slots[base + 2] = Math.round(submitTimeMs * 100) | 0
    this.publishTail(tail + 1, true)
    return true
  }

  /**
   * Drain up to `maxCount` pending commands on the compositor consumer side.
   */
  public drain(
    onCommand: (cmd: WaylandCommand) => void,
    maxCount = 512
  ): number {
    let head = this.loadHead()
    const tail = this.loadTail()
    let count = 0

    while (head < tail && count < maxCount) {
      const base = (head & this.mask) * CMD_SLOT_INTS
      const op = this.slots[base]
      const surfaceId = this.slots[base + 1]

      if (op === OP_CREATE_SURFACE) {
        onCommand({ op: OP_CREATE_SURFACE, surfaceId })
      } else if (op === OP_DESTROY_SURFACE) {
        onCommand({ op: OP_DESTROY_SURFACE, surfaceId })
      } else if (op === OP_SET_TOPLEVEL) {
        const len = Math.max(0, Math.min(MAX_INLINE_TITLE_BYTES, this.slots[base + 5]))
        const byteBase = (base + 6) * 4
        // Copy out of SAB because TextDecoder rejects SharedArrayBuffer views
        const tmp = new Uint8Array(len)
        tmp.set(this.slotBytes.subarray(byteBase, byteBase + len))
        onCommand({
          op: OP_SET_TOPLEVEL,
          surfaceId,
          x: this.slots[base + 2],
          y: this.slots[base + 3],
          zIndex: this.slots[base + 4],
          title: textDecoder.decode(tmp),
        })
      } else if (op === OP_ATTACH_BUFFER) {
        onCommand({
          op: OP_ATTACH_BUFFER,
          surfaceId,
          shmOffset: this.slots[base + 2],
          width: this.slots[base + 3],
          height: this.slots[base + 4],
          stride: this.slots[base + 5],
          format: this.slots[base + 6] as WaylandShmFormat,
        })
      } else if (op === OP_DAMAGE_BUFFER) {
        onCommand({
          op: OP_DAMAGE_BUFFER,
          surfaceId,
          x: this.slots[base + 2],
          y: this.slots[base + 3],
          width: this.slots[base + 4],
          height: this.slots[base + 5],
        })
      } else if (op === OP_COMMIT) {
        onCommand({
          op: OP_COMMIT,
          surfaceId,
          submitTimeMs: this.slots[base + 2] / 100,
        })
      } else if (op === OP_SET_SURFACE_FLAGS) {
        onCommand({
          op: OP_SET_SURFACE_FLAGS,
          surfaceId,
          flags: this.slots[base + 2],
        })
      }

      head++
      count++
    }

    if (count > 0) {
      if (this.isShared) {
        Atomics.store(this.ctrl, CMD_IDX_HEAD, head)
      } else {
        this.ctrl[CMD_IDX_HEAD] = head
      }
    }
    return count
  }
}

export type WaylandEvent =
  | { ev: typeof EV_FRAME_DONE; surfaceId: number; timestampMs: number }
  | {
      ev: typeof EV_POINTER_ENTER | typeof EV_POINTER_MOTION
      surfaceId: number
      localX: number
      localY: number
      timestampMs: number
    }
  | { ev: typeof EV_POINTER_LEAVE; surfaceId: number; timestampMs: number }
  | {
      ev: typeof EV_POINTER_BUTTON
      surfaceId: number
      button: number
      pressed: boolean
      localX: number
      localY: number
      timestampMs: number
    }
  | {
      ev: typeof EV_POINTER_AXIS
      surfaceId: number
      deltaX: number
      deltaY: number
      timestampMs: number
    }
  | {
      ev: typeof EV_KEYBOARD_KEY
      surfaceId: number
      keyCode: number
      pressed: boolean
      modifiers: number
      charCode: number
      timestampMs: number
    }
  | {
      ev: typeof EV_SURFACE_MOVED
      surfaceId: number
      x: number
      y: number
      zIndex: number
    }
  | { ev: typeof EV_SURFACE_FOCUS; surfaceId: number; focused: boolean }

/**
 * Reverse Lock-Free SPSC Ring (Compositor Worker -> Guest Client) for
 * `wl_callback.done` frame pacing and surface-local `wl_pointer` / `wl_keyboard` events.
 */
export class EventRingBuffer {
  public readonly buffer: SharedArrayBuffer | ArrayBuffer
  public readonly capacity: number
  private readonly mask: number
  private readonly ctrl: Int32Array
  private readonly slots: Int32Array
  private readonly isShared: boolean

  constructor(bufferOrCapacity: SharedArrayBuffer | ArrayBuffer | number = EV_DEFAULT_CAPACITY) {
    if (typeof bufferOrCapacity === 'number') {
      const cap = Math.max(64, 1 << Math.ceil(Math.log2(bufferOrCapacity)))
      const totalBytes = (EV_HEADER_INTS + cap * EV_SLOT_INTS) * 4
      this.buffer = createSharedOrArrayBuffer(totalBytes)
      this.capacity = cap
      this.ctrl = new Int32Array(this.buffer, 0, EV_HEADER_INTS)
      this.ctrl[EV_IDX_HEAD] = 0
      this.ctrl[EV_IDX_TAIL] = 0
      this.ctrl[EV_IDX_CAPACITY] = cap
      this.ctrl[EV_IDX_NOTIFY] = 0
    } else {
      this.buffer = bufferOrCapacity
      this.ctrl = new Int32Array(this.buffer, 0, EV_HEADER_INTS)
      this.capacity = this.ctrl[EV_IDX_CAPACITY] || EV_DEFAULT_CAPACITY
    }
    this.mask = this.capacity - 1
    this.slots = new Int32Array(this.buffer, EV_HEADER_INTS * 4)
    this.isShared =
      typeof SharedArrayBuffer === 'function' &&
      this.buffer instanceof SharedArrayBuffer
  }

  private pushRaw(
    ev: number,
    surfaceId: number,
    a: number,
    b: number,
    c: number,
    d: number,
    e: number
  ): boolean {
    const tail = this.isShared
      ? Atomics.load(this.ctrl, EV_IDX_TAIL)
      : this.ctrl[EV_IDX_TAIL]
    const head = this.isShared
      ? Atomics.load(this.ctrl, EV_IDX_HEAD)
      : this.ctrl[EV_IDX_HEAD]
    if (tail - head >= this.capacity) return false

    const base = (tail & this.mask) * EV_SLOT_INTS
    this.slots[base] = ev
    this.slots[base + 1] = surfaceId | 0
    this.slots[base + 2] = a | 0
    this.slots[base + 3] = b | 0
    this.slots[base + 4] = c | 0
    this.slots[base + 5] = d | 0
    this.slots[base + 6] = e | 0

    if (this.isShared) {
      Atomics.store(this.ctrl, EV_IDX_TAIL, tail + 1)
      Atomics.add(this.ctrl, EV_IDX_NOTIFY, 1)
      Atomics.notify(this.ctrl, EV_IDX_NOTIFY, 1)
    } else {
      this.ctrl[EV_IDX_TAIL] = tail + 1
      this.ctrl[EV_IDX_NOTIFY]++
    }
    return true
  }

  public pushFrameDone(surfaceId: number, timestampMs: number): boolean {
    return this.pushRaw(
      EV_FRAME_DONE,
      surfaceId,
      Math.round(timestampMs * 100),
      0,
      0,
      0,
      0
    )
  }

  public pushPointerEnter(
    surfaceId: number,
    localX: number,
    localY: number,
    timestampMs: number
  ): boolean {
    return this.pushRaw(
      EV_POINTER_ENTER,
      surfaceId,
      Math.round(localX),
      Math.round(localY),
      Math.round(timestampMs * 100),
      0,
      0
    )
  }

  public pushPointerLeave(surfaceId: number, timestampMs: number): boolean {
    return this.pushRaw(
      EV_POINTER_LEAVE,
      surfaceId,
      Math.round(timestampMs * 100),
      0,
      0,
      0,
      0
    )
  }

  public pushPointerMotion(
    surfaceId: number,
    localX: number,
    localY: number,
    timestampMs: number
  ): boolean {
    return this.pushRaw(
      EV_POINTER_MOTION,
      surfaceId,
      Math.round(localX),
      Math.round(localY),
      Math.round(timestampMs * 100),
      0,
      0
    )
  }

  public pushPointerButton(
    surfaceId: number,
    button: number,
    pressed: boolean,
    localX: number,
    localY: number,
    timestampMs: number
  ): boolean {
    return this.pushRaw(
      EV_POINTER_BUTTON,
      surfaceId,
      button,
      pressed ? 1 : 0,
      Math.round(localX),
      Math.round(localY),
      Math.round(timestampMs * 100)
    )
  }

  public pushPointerAxis(
    surfaceId: number,
    deltaX: number,
    deltaY: number,
    timestampMs: number
  ): boolean {
    return this.pushRaw(
      EV_POINTER_AXIS,
      surfaceId,
      Math.round(deltaX),
      Math.round(deltaY),
      Math.round(timestampMs * 100),
      0,
      0
    )
  }

  public pushKeyboardKey(
    surfaceId: number,
    keyCode: number,
    pressed: boolean,
    modifiers: number,
    charCode: number,
    timestampMs: number
  ): boolean {
    return this.pushRaw(
      EV_KEYBOARD_KEY,
      surfaceId,
      keyCode,
      pressed ? 1 : 0,
      modifiers,
      charCode,
      Math.round(timestampMs * 100)
    )
  }

  public pushSurfaceMoved(
    surfaceId: number,
    x: number,
    y: number,
    zIndex: number
  ): boolean {
    return this.pushRaw(
      EV_SURFACE_MOVED,
      surfaceId,
      Math.round(x),
      Math.round(y),
      zIndex,
      0,
      0
    )
  }

  public pushSurfaceFocus(surfaceId: number, focused: boolean): boolean {
    return this.pushRaw(EV_SURFACE_FOCUS, surfaceId, focused ? 1 : 0, 0, 0, 0, 0)
  }

  public drain(onEvent: (ev: WaylandEvent) => void, maxCount = 256): number {
    let head = this.isShared
      ? Atomics.load(this.ctrl, EV_IDX_HEAD)
      : this.ctrl[EV_IDX_HEAD]
    const tail = this.isShared
      ? Atomics.load(this.ctrl, EV_IDX_TAIL)
      : this.ctrl[EV_IDX_TAIL]
    let count = 0

    while (head < tail && count < maxCount) {
      const base = (head & this.mask) * EV_SLOT_INTS
      const ev = this.slots[base]
      const surfaceId = this.slots[base + 1]
      const a = this.slots[base + 2]
      const b = this.slots[base + 3]
      const c = this.slots[base + 4]
      const d = this.slots[base + 5]
      const e = this.slots[base + 6]

      if (ev === EV_FRAME_DONE) {
        onEvent({ ev: EV_FRAME_DONE, surfaceId, timestampMs: a / 100 })
      } else if (ev === EV_POINTER_ENTER || ev === EV_POINTER_MOTION) {
        onEvent({ ev, surfaceId, localX: a, localY: b, timestampMs: c / 100 })
      } else if (ev === EV_POINTER_LEAVE) {
        onEvent({ ev: EV_POINTER_LEAVE, surfaceId, timestampMs: a / 100 })
      } else if (ev === EV_POINTER_BUTTON) {
        onEvent({
          ev: EV_POINTER_BUTTON,
          surfaceId,
          button: a,
          pressed: b === 1,
          localX: c,
          localY: d,
          timestampMs: e / 100,
        })
      } else if (ev === EV_POINTER_AXIS) {
        onEvent({
          ev: EV_POINTER_AXIS,
          surfaceId,
          deltaX: a,
          deltaY: b,
          timestampMs: c / 100,
        })
      } else if (ev === EV_KEYBOARD_KEY) {
        onEvent({
          ev: EV_KEYBOARD_KEY,
          surfaceId,
          keyCode: a,
          pressed: b === 1,
          modifiers: c,
          charCode: d,
          timestampMs: e / 100,
        })
      } else if (ev === EV_SURFACE_MOVED) {
        onEvent({ ev: EV_SURFACE_MOVED, surfaceId, x: a, y: b, zIndex: c })
      } else if (ev === EV_SURFACE_FOCUS) {
        onEvent({ ev: EV_SURFACE_FOCUS, surfaceId, focused: a === 1 })
      }

      head++
      count++
    }

    if (count > 0) {
      if (this.isShared) {
        Atomics.store(this.ctrl, EV_IDX_HEAD, head)
      } else {
        this.ctrl[EV_IDX_HEAD] = head
      }
    }
    return count
  }
}

export interface WaylandCompositorTelemetry {
  backend: 'initializing' | 'webgpu' | '2d-dirtyrect'
  adapterName: string
  sharedMemoryActive: boolean
  viewportWidth: number
  viewportHeight: number
  dpr: number
  fps: number
  uploadedBytesFrame: number
  uploadedBytesAvg: number
  fullScreenBytes: number
  bandwidthSavedPct: number
  damageRectsFrame: number
  gpuPassTimeMs: number
  inputToPhotonMs: number
  surfaceCount: number
  focusedSurfaceId: number
  totalCommits: number
  frameCallbacksSent: number
}

export interface WaylandSharedTransport {
  shmPool: ShmPixelPool
  commandRing: CommandRingBuffer
  eventRing: EventRingBuffer
}

export function createWaylandTransport(
  shmPoolBytes = DEFAULT_SHM_POOL_BYTES
): WaylandSharedTransport {
  return {
    shmPool: new ShmPixelPool(shmPoolBytes),
    commandRing: new CommandRingBuffer(CMD_DEFAULT_CAPACITY),
    eventRing: new EventRingBuffer(EV_DEFAULT_CAPACITY),
  }
}
