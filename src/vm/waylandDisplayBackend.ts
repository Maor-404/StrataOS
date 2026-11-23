/**
 * Selectable Wayland Compositor Display Backend for StrataOS VM (`src/vm/waylandDisplayBackend.ts`)
 *
 * Bridges CheerpX's `cx.setKmsCanvas(...)` framebuffer updates directly into the
 * lock-free `SharedArrayBuffer` Wayland `wl_shm` + `waylandCompositor.worker.ts`
 * WebGPU compositor using fast 32-bit scanline dirty-band diffing so unchanged
 * desktop regions incur 0 bytes of GPU texture upload.
 *
 * Implements the same interface as `GpuDisplayPipeline` (`src/vm/gpuDisplay.ts`)
 * so `RealDebianDesktop` can switch seamlessly between backends (`?display=wayland`).
 */

import {
  SURFACE_FLAG_OPAQUE,
  SURFACE_FLAG_VISIBLE,
  WL_SHM_FORMAT_XBGR8888,
  createWaylandTransport,
  type ShmBufferAllocation,
  type WaylandCompositorTelemetry,
  type WaylandSharedTransport,
} from '../wayland/shmRing'
import type { DisplayPipelineState, VirtualKmsSurface } from './gpuDisplay'

type SyntheticListener = (event: unknown) => void

interface NavigatorWithKeyboardLock extends Navigator {
  keyboard?: {
    lock(keyCodes?: string[]): Promise<void>
    unlock(): void
  }
}

const LOCKED_LINUX_KEY_CODES = [
  'AltLeft',
  'AltRight',
  'Tab',
  'MetaLeft',
  'MetaRight',
  'KeyW',
  'KeyT',
  'KeyN',
  'KeyR',
  'Escape',
]

function hasNonBlackPixels(
  data: Uint8ClampedArray,
  width: number,
  height: number
): boolean {
  if (width <= 0 || height <= 0 || data.length < 16) return false
  const cols = 12
  const rows = 8
  for (let r = 0; r < rows; r++) {
    const y = Math.floor(((r + 0.5) / rows) * height)
    for (let c = 0; c < cols; c++) {
      const x = Math.floor(((c + 0.5) / cols) * width)
      const idx = (y * width + x) * 4
      if (data[idx] > 8 || data[idx + 1] > 8 || data[idx + 2] > 8) {
        return true
      }
    }
  }
  return false
}

export class WaylandDisplayBackend {
  private readonly canvas: HTMLCanvasElement
  private readonly worker: Worker
  private readonly transport: WaylandSharedTransport
  private readonly listeners = new Set<(state: DisplayPipelineState) => void>()
  private readonly kmsListeners = new Map<string, Set<SyntheticListener>>()
  private readonly cleanupDomListeners: Array<() => void> = []
  private readonly onFirstFrameCb?: () => void

  private readonly rootSurfaceId = 1
  private fbWidth: number
  private fbHeight: number
  private surfaceAlloc: ShmBufferAllocation | null = null
  private activePointerId: number | null = null
  private state: DisplayPipelineState

  public readonly virtualKmsSurface: VirtualKmsSurface

  constructor(
    canvas: HTMLCanvasElement,
    initialWidth: number,
    initialHeight: number,
    onFirstFrame?: () => void
  ) {
    this.canvas = canvas
    this.fbWidth = Math.max(1, Math.floor(initialWidth))
    this.fbHeight = Math.max(1, Math.floor(initialHeight))
    this.onFirstFrameCb = onFirstFrame

    const nav = navigator as NavigatorWithKeyboardLock
    this.state = {
      backend: 'initializing',
      adapterName: 'Wayland Surface Compositor',
      width: this.fbWidth,
      height: this.fbHeight,
      fps: 0,
      framesRendered: 0,
      sharedBufferActive: false,
      firstFramePainted: false,
      isFullscreen: false,
      keyboardLocked: false,
      keyboardLockSupported: typeof nav.keyboard?.lock === 'function',
    }

    // Allocate 20 MiB wl_shm SharedArrayBuffer pool (supports up to 4K KMS surfaces)
    this.transport = createWaylandTransport(20 * 1024 * 1024)
    this.state.sharedBufferActive = this.transport.shmPool.isShared

    const offscreen = canvas.transferControlToOffscreen()
    this.worker = new Worker(
      new URL('../wayland/waylandCompositor.worker.ts', import.meta.url),
      { type: 'module' }
    )

    this.worker.onmessage = (event: MessageEvent) => {
      const msg = event.data as {
        type?: string
        snapshot?: WaylandCompositorTelemetry
      }
      if (msg.type === 'telemetry' && msg.snapshot) {
        const snap = msg.snapshot
        this.state = {
          ...this.state,
          backend:
            snap.backend === 'webgpu'
              ? 'webgpu'
              : snap.backend === '2d-dirtyrect'
                ? '2d-imagebitmap'
                : 'initializing',
          adapterName: `Wayland (${snap.adapterName || snap.backend})`,
          width: this.fbWidth,
          height: this.fbHeight,
          fps: snap.fps,
          framesRendered: snap.totalCommits,
          sharedBufferActive: snap.sharedMemoryActive,
        }
        this.emit()
      }
    }

    this.worker.postMessage(
      {
        type: 'init',
        canvas: offscreen,
        width: this.fbWidth,
        height: this.fbHeight,
        dpr: 1,
        shmBuffer: this.transport.shmPool.buffer,
        commandBuffer: this.transport.commandRing.buffer,
        eventBuffer: this.transport.eventRing.buffer,
        showDamageOverlay: false,
      },
      [offscreen]
    )

    this.initRootSurface(this.fbWidth, this.fbHeight)
    this.virtualKmsSurface = this.createVirtualKmsSurface()
    this.bindInputListeners()
  }

  private initRootSurface(w: number, h: number): void {
    const cmd = this.transport.commandRing
    if (!this.surfaceAlloc) {
      cmd.createSurface(this.rootSurfaceId)
      cmd.setSurfaceFlags(
        this.rootSurfaceId,
        SURFACE_FLAG_VISIBLE | SURFACE_FLAG_OPAQUE
      )
      cmd.setToplevel(this.rootSurfaceId, 0, 0, 0, 'Debian 12 KMS Surface')
    } else {
      this.transport.shmPool.free(this.surfaceAlloc)
      this.surfaceAlloc = null
    }

    const alloc = this.transport.shmPool.alloc(w, h, WL_SHM_FORMAT_XBGR8888)
    this.surfaceAlloc = alloc
    cmd.attachBuffer(
      this.rootSurfaceId,
      alloc.offset,
      alloc.width,
      alloc.height,
      alloc.stride,
      alloc.format
    )
  }

  public getState(): DisplayPipelineState {
    return { ...this.state }
  }

  public subscribe(listener: (state: DisplayPipelineState) => void): () => void {
    this.listeners.add(listener)
    listener(this.getState())
    return () => {
      this.listeners.delete(listener)
    }
  }

  private emit(): void {
    const snap = this.getState()
    for (const listener of this.listeners) {
      listener(snap)
    }
  }

  private handleResolutionChange(nextWidth: number, nextHeight: number): void {
    const w = Math.max(1, Math.floor(nextWidth))
    const h = Math.max(1, Math.floor(nextHeight))
    if (w === this.fbWidth && h === this.fbHeight) return

    this.fbWidth = w
    this.fbHeight = h
    this.initRootSurface(w, h)
    this.worker.postMessage({
      type: 'resize',
      width: w,
      height: h,
      dpr: 1,
    })
  }

  /**
   * Diff incoming KMS `ImageData` against the shared `wl_shm` buffer in 32-bit scanline
   * words, copying and emitting `DAMAGE_BUFFER` rectangles ONLY for dirty vertical bands.
   */
  private pushFrame(imageData: ImageData): void {
    if (imageData.width !== this.fbWidth || imageData.height !== this.fbHeight) {
      this.handleResolutionChange(imageData.width, imageData.height)
    }

    if (!this.state.firstFramePainted) {
      if (hasNonBlackPixels(imageData.data, imageData.width, imageData.height)) {
        this.state.firstFramePainted = true
        this.emit()
        this.onFirstFrameCb?.()
      }
    }

    const alloc = this.surfaceAlloc
    if (!alloc) return

    const srcU32 = new Uint32Array(
      imageData.data.buffer,
      imageData.data.byteOffset,
      imageData.width * imageData.height
    )
    const dstU32 = this.transport.shmPool.u32
    const dstBase = alloc.offset >>> 2
    const dstStride = alloc.stride >>> 2
    const w = alloc.width
    const h = alloc.height
    const cmd = this.transport.commandRing

    // Drain any old FRAME_DONE events so reverse ring never fills
    this.transport.eventRing.drain(() => {}, 64)

    let bandStart = -1
    let anyDirty = false

    for (let y = 0; y < h; y++) {
      const srcRow = y * w
      const dstRow = dstBase + y * dstStride
      let rowDirty = false

      for (let x = 0; x < w; x++) {
        const px = srcU32[srcRow + x]
        if (dstU32[dstRow + x] !== px) {
          dstU32[dstRow + x] = px
          rowDirty = true
        }
      }

      if (rowDirty) {
        if (bandStart === -1) bandStart = y
        anyDirty = true
      } else if (bandStart !== -1) {
        cmd.damageBuffer(this.rootSurfaceId, 0, bandStart, w, y - bandStart)
        bandStart = -1
      }
    }

    if (bandStart !== -1) {
      cmd.damageBuffer(this.rootSurfaceId, 0, bandStart, w, h - bandStart)
    }

    if (anyDirty) {
      cmd.commit(this.rootSurfaceId, performance.now())
    }
  }

  private createVirtualKmsSurface(): VirtualKmsSurface {
    const self = this
    return {
      get width() {
        return self.fbWidth
      },
      set width(val: number) {
        self.handleResolutionChange(val, self.fbHeight)
      },
      get height() {
        return self.fbHeight
      },
      set height(val: number) {
        self.handleResolutionChange(self.fbWidth, val)
      },
      getContext() {
        return {
          putImageData(imageData: ImageData) {
            self.pushFrame(imageData)
          },
        }
      },
      addEventListener(type: string, listener: SyntheticListener) {
        let set = self.kmsListeners.get(type)
        if (!set) {
          set = new Set()
          self.kmsListeners.set(type, set)
        }
        set.add(listener)
      },
      removeEventListener(type: string, listener: SyntheticListener) {
        self.kmsListeners.get(type)?.delete(listener)
      },
      getBoundingClientRect() {
        return self.canvas.getBoundingClientRect()
      },
    }
  }

  private dispatchKmsEvent(type: string, eventObj: unknown): void {
    const set = this.kmsListeners.get(type)
    if (!set) return
    for (const listener of set) {
      listener(eventObj)
    }
  }

  private bindInputListeners(): void {
    const canvas = this.canvas

    const toSyntheticMouse = (type: string, e: PointerEvent) => ({
      type,
      clientX: e.clientX,
      clientY: e.clientY,
      pageX: e.pageX,
      pageY: e.pageY,
      button: e.button,
      buttons: e.buttons,
      timeStamp: e.timeStamp,
      currentTarget: canvas,
      preventDefault: () => e.preventDefault(),
    })

    const onPointerDown = (e: PointerEvent) => {
      e.preventDefault()
      try {
        canvas.setPointerCapture(e.pointerId)
        this.activePointerId = e.pointerId
      } catch {
        // ignore
      }
      this.dispatchKmsEvent('click', toSyntheticMouse('click', e))
      this.dispatchKmsEvent('mousedown', toSyntheticMouse('mousedown', e))
    }

    const onPointerMove = (e: PointerEvent) => {
      this.dispatchKmsEvent('mousemove', toSyntheticMouse('mousemove', e))
    }

    const onPointerUp = (e: PointerEvent) => {
      if (this.activePointerId === e.pointerId) {
        try {
          if (canvas.hasPointerCapture(e.pointerId)) {
            canvas.releasePointerCapture(e.pointerId)
          }
        } catch {
          // ignore
        }
        this.activePointerId = null
      }
      this.dispatchKmsEvent('mouseup', toSyntheticMouse('mouseup', e))
    }

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault()
      this.dispatchKmsEvent('contextmenu', e)
    }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      this.dispatchKmsEvent('wheel', {
        type: 'wheel',
        deltaX: e.deltaX,
        deltaY: e.deltaY,
        deltaZ: e.deltaZ,
        deltaMode: e.deltaMode,
        clientX: e.clientX,
        clientY: e.clientY,
        currentTarget: canvas,
        preventDefault: () => e.preventDefault(),
      })
    }

    const onFullscreenChange = () => {
      const inFs = Boolean(document.fullscreenElement)
      this.state.isFullscreen = inFs
      if (!inFs) this.unlockKeyboard()
      this.emit()
    }

    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointercancel', onPointerUp)
    canvas.addEventListener('contextmenu', onContextMenu)
    canvas.addEventListener('wheel', onWheel, { passive: false })
    document.addEventListener('fullscreenchange', onFullscreenChange)

    this.cleanupDomListeners.push(
      () => canvas.removeEventListener('pointerdown', onPointerDown),
      () => canvas.removeEventListener('pointermove', onPointerMove),
      () => canvas.removeEventListener('pointerup', onPointerUp),
      () => canvas.removeEventListener('pointercancel', onPointerUp),
      () => canvas.removeEventListener('contextmenu', onContextMenu),
      () => canvas.removeEventListener('wheel', onWheel),
      () => document.removeEventListener('fullscreenchange', onFullscreenChange)
    )
  }

  public async toggleFullscreen(container: HTMLElement): Promise<void> {
    if (document.fullscreenElement) {
      this.unlockKeyboard()
      await document.exitFullscreen().catch(() => {})
      return
    }
    await container.requestFullscreen()
    const nav = navigator as NavigatorWithKeyboardLock
    if (typeof nav.keyboard?.lock === 'function') {
      try {
        await nav.keyboard.lock(LOCKED_LINUX_KEY_CODES)
        this.state.keyboardLocked = true
        this.emit()
      } catch {
        this.state.keyboardLocked = false
        this.emit()
      }
    }
  }

  public unlockKeyboard(): void {
    const nav = navigator as NavigatorWithKeyboardLock
    if (typeof nav.keyboard?.unlock === 'function') {
      try {
        nav.keyboard.unlock()
      } catch {
        // ignore
      }
    }
    if (this.state.keyboardLocked) {
      this.state.keyboardLocked = false
      this.emit()
    }
  }

  public dispose(): void {
    this.unlockKeyboard()
    for (const cleanup of this.cleanupDomListeners) {
      cleanup()
    }
    this.cleanupDomListeners.length = 0
    this.kmsListeners.clear()
    this.listeners.clear()
    if (this.surfaceAlloc) {
      this.transport.commandRing.destroySurface(this.rootSurfaceId)
      this.transport.shmPool.free(this.surfaceAlloc)
      this.surfaceAlloc = null
    }
    this.worker.postMessage({ type: 'dispose' })
    this.worker.terminate()
  }
}
