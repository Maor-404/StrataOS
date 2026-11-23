/**
 * Dedicated WebGPU Wayland Surface Compositor Worker (`src/wayland/waylandCompositor.worker.ts`)
 *
 * Owns a transferred `OffscreenCanvas`, drains lock-free `SharedArrayBuffer` Wayland
 * surface commands, maintains per-surface `GPUTexture` caches, uploads ONLY clamped/merged
 * `DAMAGE_BUFFER` dirty rectangles via `queue.writeTexture`, composites all `xdg_toplevel`
 * surfaces sorted by `zIndex` in a single hardware `GPURenderPassEncoder` (premultiplied
 * alpha + nearest-neighbor integer pixel snapping), performs compositor-side hit-testing
 * and zero-latency window dragging, and emits `FRAME_DONE` (`wl_callback.done`) immediately
 * after `queue.submit()`.
 *
 * Automatically falls back to a dirty-rect `OffscreenCanvas` 2D compositor when hardware
 * WebGPU is unavailable or only a software fallback adapter exists.
 */

import {
  CommandRingBuffer,
  EventRingBuffer,
  OP_ATTACH_BUFFER,
  OP_COMMIT,
  OP_CREATE_SURFACE,
  OP_DAMAGE_BUFFER,
  OP_DESTROY_SURFACE,
  OP_SET_SURFACE_FLAGS,
  OP_SET_TOPLEVEL,
  SURFACE_FLAG_DRAGGABLE,
  SURFACE_FLAG_OPAQUE,
  SURFACE_FLAG_VISIBLE,
  WL_SHM_FORMAT_ARGB8888,
  WL_SHM_FORMAT_XBGR8888,
  WL_SHM_FORMAT_XRGB8888,
  type WaylandCommand,
  type WaylandCompositorTelemetry,
  type WaylandShmFormat,
} from './shmRing'

interface DamageRect {
  x: number
  y: number
  width: number
  height: number
}

interface PendingBufferState {
  shmOffset: number
  width: number
  height: number
  stride: number
  format: WaylandShmFormat
}

interface SurfaceGpuResource {
  id: number
  x: number
  y: number
  zIndex: number
  title: string
  flags: number
  focused: boolean

  // Committed buffer state
  shmOffset: number
  width: number
  height: number
  stride: number
  format: WaylandShmFormat
  hasCommittedBuffer: boolean

  // Pending double-buffered Wayland state (applied atomically on COMMIT)
  pendingBuffer: PendingBufferState | null
  pendingDamage: DamageRect[]

  // WebGPU cached per-surface texture & bind group (recreated ONLY on dimension/format change)
  texture: GpuTextureLike | null
  texWidth: number
  texHeight: number
  texFormat: string
  bindGroup: unknown

  // 2D dirty-rect fallback cached surface canvas
  canvas2d: OffscreenCanvas | null
  ctx2d: OffscreenCanvasRenderingContext2D | null
}

// Minimal WebGPU worker interfaces (keeps strict TS clean across DOM/WebWorker lib configs)
interface GpuBufferLike {
  destroy(): void
}

interface GpuTextureLike {
  createView(): unknown
  destroy(): void
}

interface GpuQueueLike {
  writeBuffer(buffer: GpuBufferLike, bufferOffset: number, data: ArrayBufferView): void
  writeTexture(
    destination: { texture: GpuTextureLike; origin?: { x: number; y: number; z: number } },
    data: ArrayBufferView,
    dataLayout: { offset?: number; bytesPerRow: number; rowsPerImage?: number },
    size: { width: number; height: number; depthOrArrayLayers?: number }
  ): void
  submit(commandBuffers: unknown[]): void
  onSubmittedWorkDone?: () => Promise<void>
}

interface GpuRenderPassLike {
  setPipeline(pipeline: unknown): void
  setBindGroup(index: number, bindGroup: unknown): void
  draw(
    vertexCount: number,
    instanceCount?: number,
    firstVertex?: number,
    firstInstance?: number
  ): void
  end(): void
}

interface GpuCommandEncoderLike {
  beginRenderPass(descriptor: unknown): GpuRenderPassLike
  finish(): unknown
}

interface GpuDeviceLike {
  queue: GpuQueueLike
  createBuffer(descriptor: { size: number; usage: number }): GpuBufferLike
  createShaderModule(descriptor: { code: string }): unknown
  createRenderPipeline(descriptor: unknown): { getBindGroupLayout(index: number): unknown }
  createSampler(descriptor: unknown): unknown
  createTexture(descriptor: unknown): GpuTextureLike
  createBindGroup(descriptor: unknown): unknown
  createCommandEncoder(): GpuCommandEncoderLike
  destroy(): void
  addEventListener?: (
    type: string,
    listener: (ev: { error?: { message?: string } }) => void
  ) => void
}

interface GpuAdapterLike {
  isFallbackAdapter?: boolean
  info?: {
    vendor?: string
    architecture?: string
    description?: string
    device?: string
    isFallbackAdapter?: boolean
  }
  requestDevice(): Promise<GpuDeviceLike>
}

interface GpuCanvasContextLike {
  configure(config: {
    device: GpuDeviceLike
    format: string
    alphaMode: 'opaque' | 'premultiplied'
  }): void
  getCurrentTexture(): GpuTextureLike
}

interface NavigatorGpuLike {
  requestAdapter(options?: { powerPreference?: string }): Promise<GpuAdapterLike | null>
  getPreferredCanvasFormat(): string
}

const GPUTEXTURE_USAGE_COPY_DST = 0x02
const GPUTEXTURE_USAGE_TEXTURE_BINDING = 0x04
const GPUBUFFER_USAGE_STORAGE = 0x80
const GPUBUFFER_USAGE_COPY_DST = 0x08

const MAX_INSTANCES = 128
const INSTANCE_FLOATS = 8 // rect.xywh (4) + viewport.xy (2) + opaqueFlag (1) + dpr (1)

/**
 * Hardware Wayland Surface Compositor WGSL Shader:
 * - Instanced textured quad pulled from a single GPU StorageBuffer (`surfaces[instance_index]`)
 * - Crisp integer pixel snapping in physical device coordinates
 * - Premultiplied ARGB8888 alpha compositing + XRGB8888 opaque override
 */
const WGSL_COMPOSITOR_SHADER = /* wgsl */ `
struct SurfaceInstance {
  rect: vec4<f32>,       // x, y, width, height in CSS logical pixels
  viewport: vec2<f32>,   // viewport width, height in CSS logical pixels
  opaqueFlag: f32,       // 1.0 = force alpha 1.0 (XRGB8888/XBGR8888), 0.0 = premultiplied ARGB
  dpr: f32,              // devicePixelRatio for physical pixel snapping
};

struct VsOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) opaqueFlag: f32,
};

@group(0) @binding(0) var<storage, read> instances: array<SurfaceInstance>;
@group(0) @binding(1) var surfaceSampler: sampler;
@group(1) @binding(0) var surfaceTex: texture_2d<f32>;

@vertex
fn vs_main(
  @builtin(vertex_index) vIdx: u32,
  @builtin(instance_index) iIdx: u32
) -> VsOut {
  var corners = array<vec2<f32>, 6>(
    vec2<f32>(0.0, 0.0),
    vec2<f32>(1.0, 0.0),
    vec2<f32>(0.0, 1.0),
    vec2<f32>(1.0, 0.0),
    vec2<f32>(1.0, 1.0),
    vec2<f32>(0.0, 1.0)
  );

  let inst = instances[iIdx];
  let corner = corners[vIdx];

  // Snap quad edges to exact physical device pixels
  let dpr = max(inst.dpr, 1.0);
  let snappedOrigin = floor(inst.rect.xy * dpr) / dpr;
  let snappedSize = floor(inst.rect.zw * dpr) / dpr;
  let px = snappedOrigin + corner * snappedSize;

  let ndcX = (px.x / max(inst.viewport.x, 1.0)) * 2.0 - 1.0;
  let ndcY = 1.0 - (px.y / max(inst.viewport.y, 1.0)) * 2.0;

  var out: VsOut;
  out.pos = vec4<f32>(ndcX, ndcY, 0.0, 1.0);
  out.uv = corner;
  out.opaqueFlag = inst.opaqueFlag;
  return out;
}

@fragment
fn fs_main(in: VsOut) -> @location(0) vec4<f32> {
  let sampled = textureSample(surfaceTex, surfaceSampler, in.uv);
  if (in.opaqueFlag > 0.5) {
    return vec4<f32>(sampled.rgb, 1.0);
  }
  return sampled;
}
`

/**
 * Optional Damage-Rect Overlay WGSL Shader (highlights uploaded wl_surface.damage_buffer rects).
 */
const WGSL_DAMAGE_SHADER = /* wgsl */ `
struct DamageQuad {
  rect: vec4<f32>,      // x, y, w, h in CSS pixels
  viewport: vec2<f32>,
  alpha: f32,
  _pad: f32,
};

struct VsOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) localUv: vec2<f32>,
  @location(1) sizePx: vec2<f32>,
  @location(2) alpha: f32,
};

@group(0) @binding(0) var<storage, read> quads: array<DamageQuad>;

@vertex
fn vs_main(
  @builtin(vertex_index) vIdx: u32,
  @builtin(instance_index) iIdx: u32
) -> VsOut {
  var corners = array<vec2<f32>, 6>(
    vec2<f32>(0.0, 0.0),
    vec2<f32>(1.0, 0.0),
    vec2<f32>(0.0, 1.0),
    vec2<f32>(1.0, 0.0),
    vec2<f32>(1.0, 1.0),
    vec2<f32>(0.0, 1.0)
  );
  let q = quads[iIdx];
  let c = corners[vIdx];
  let px = q.rect.xy + c * q.rect.zw;
  let ndcX = (px.x / max(q.viewport.x, 1.0)) * 2.0 - 1.0;
  let ndcY = 1.0 - (px.y / max(q.viewport.y, 1.0)) * 2.0;

  var out: VsOut;
  out.pos = vec4<f32>(ndcX, ndcY, 0.0, 1.0);
  out.localUv = c;
  out.sizePx = q.rect.zw;
  out.alpha = q.alpha;
  return out;
}

@fragment
fn fs_main(in: VsOut) -> @location(0) vec4<f32> {
  let px = in.localUv * in.sizePx;
  let border = 1.5;
  let onEdge =
    px.x < border ||
    px.y < border ||
    px.x > (in.sizePx.x - border) ||
    px.y > (in.sizePx.y - border);
  let a = select(in.alpha * 0.14, in.alpha * 0.9, onEdge);
  // Premultiplied cyan/crimson damage flash
  return vec4<f32>(0.22 * a, 0.85 * a, 0.98 * a, a);
}
`

interface DamageFlash {
  x: number
  y: number
  width: number
  height: number
  createdMs: number
}

type WorkerInboundMessage =
  | {
      type: 'init'
      canvas: OffscreenCanvas
      width: number
      height: number
      dpr: number
      shmBuffer: SharedArrayBuffer | ArrayBuffer
      commandBuffer: SharedArrayBuffer | ArrayBuffer
      eventBuffer: SharedArrayBuffer | ArrayBuffer
      showDamageOverlay?: boolean
    }
  | {
      type: 'resize'
      width: number
      height: number
      dpr: number
    }
  | {
      type: 'setDamageOverlay'
      enabled: boolean
    }
  | {
      type: 'pointer'
      kind: 'down' | 'move' | 'up' | 'leave'
      x: number
      y: number
      button: number
      timestampMs: number
    }
  | {
      type: 'wheel'
      x: number
      y: number
      deltaX: number
      deltaY: number
      timestampMs: number
    }
  | {
      type: 'keyboard'
      pressed: boolean
      keyCode: number
      modifiers: number
      charCode: number
      timestampMs: number
    }
  | {
      type: 'nudge'
    }
  | {
      type: 'dispose'
    }

const TITLEBAR_DRAG_HEIGHT = 32
const DAMAGE_FLASH_DURATION_MS = 260

let offscreen: OffscreenCanvas | null = null
let viewportWidth = 1280
let viewportHeight = 800
let dpr = 1
let backend: 'initializing' | 'webgpu' | '2d-dirtyrect' = 'initializing'
let adapterName = ''
let sharedMemoryActive = false

let shmBytes: Uint8Array<ArrayBufferLike> = new Uint8Array(0)
let shmIsShared = false
let commandRing: CommandRingBuffer | null = null
let eventRing: EventRingBuffer | null = null

const surfaces = new Map<number, SurfaceGpuResource>()
let topZIndex = 100
let hoveredSurfaceId = 0
let focusedSurfaceId = 0

// Compositor-side native window drag state (zero roundtrip to guest VM!)
let dragSurfaceId = 0
let dragOffsetX = 0
let dragOffsetY = 0

// Dirty-rect upload staging buffer (reused; avoids allocating per frame)
let dirtyUploadScratch = new Uint8Array(0)
let dirty2dScratch = new Uint8ClampedArray(0)

// WebGPU state
let gpuDevice: GpuDeviceLike | null = null
let gpuCtx: GpuCanvasContextLike | null = null
let gpuCanvasFormat = 'bgra8unorm'
let gpuPipeline: { getBindGroupLayout(index: number): unknown } | null = null
let gpuInstanceBuffer: GpuBufferLike | null = null
let gpuGlobalBindGroup: unknown = null
const instanceCpuData = new Float32Array(MAX_INSTANCES * INSTANCE_FLOATS)

// Damage visualization state
let showDamageOverlay = false
let gpuDamagePipeline: { getBindGroupLayout(index: number): unknown } | null = null
let gpuDamageBuffer: GpuBufferLike | null = null
let gpuDamageBindGroup: unknown = null
const damageCpuData = new Float32Array(MAX_INSTANCES * 8)
const activeDamageFlashes: DamageFlash[] = []

// 2D OffscreenCanvas fallback state
let mainCtx2d: OffscreenCanvasRenderingContext2D | null = null

// Frame scheduling & telemetry
let sceneDirty = true
const committedSurfacesThisFrame = new Set<number>()
let uploadedBytesThisFrame = 0
let damageRectsThisFrame = 0
let uploadedBytesAvg = 0
let lastUploadedBytesFrame = 0
let lastDamageRectsFrame = 0
let gpuPassTimeMs = 0
let inputToPhotonMs = 0
let pendingInputTsMs = 0
let totalCommits = 0
let frameCallbacksSent = 0
let fpsWindowFrames = 0
let fpsWindowStart = performance.now()
let currentFps = 0
let lastTelemetryEmitMs = 0
let rafId: number | null = null
let disposed = false

function isOpaqueFormat(format: WaylandShmFormat): boolean {
  return format === WL_SHM_FORMAT_XRGB8888 || format === WL_SHM_FORMAT_XBGR8888
}

function isBgraFormat(format: WaylandShmFormat): boolean {
  return format === WL_SHM_FORMAT_ARGB8888 || format === WL_SHM_FORMAT_XRGB8888
}

function gpuTextureFormatFor(format: WaylandShmFormat): string {
  return isBgraFormat(format) ? 'bgra8unorm' : 'rgba8unorm'
}

/**
 * Clamp and coalesce overlapping/adjacent `wl_surface.damage_buffer` rectangles
 * so we upload the minimal set of dirty pixels to the GPU.
 */
function mergeAndClampDamage(
  raw: DamageRect[],
  maxW: number,
  maxH: number
): DamageRect[] {
  if (raw.length === 0 || maxW <= 0 || maxH <= 0) return []

  const clamped: DamageRect[] = []
  for (let i = 0; i < raw.length; i++) {
    const r = raw[i]
    const x0 = Math.max(0, Math.min(maxW, Math.floor(r.x)))
    const y0 = Math.max(0, Math.min(maxH, Math.floor(r.y)))
    const x1 = Math.max(0, Math.min(maxW, Math.ceil(r.x + r.width)))
    const y1 = Math.max(0, Math.min(maxH, Math.ceil(r.y + r.height)))
    if (x1 > x0 && y1 > y0) {
      clamped.push({ x: x0, y: y0, width: x1 - x0, height: y1 - y0 })
    }
  }
  if (clamped.length <= 1) return clamped

  // If a client emits many tiny rects, merge overlapping/nearby ones greedily
  const merged: DamageRect[] = []
  for (let i = 0; i < clamped.length; i++) {
    const cur = clamped[i]
    let didMerge = false
    for (let j = 0; j < merged.length; j++) {
      const m = merged[j]
      const overlapX = cur.x <= m.x + m.width + 4 && m.x <= cur.x + cur.width + 4
      const overlapY = cur.y <= m.y + m.height + 4 && m.y <= cur.y + cur.height + 4
      if (overlapX && overlapY) {
        const nx0 = Math.min(m.x, cur.x)
        const ny0 = Math.min(m.y, cur.y)
        const nx1 = Math.max(m.x + m.width, cur.x + cur.width)
        const ny1 = Math.max(m.y + m.height, cur.y + cur.height)
        m.x = nx0
        m.y = ny0
        m.width = nx1 - nx0
        m.height = ny1 - ny0
        didMerge = true
        break
      }
    }
    if (!didMerge) {
      merged.push(cur)
    }
  }

  // Cap worst-case draw upload loop by unioning if > 24 disjoint rects
  if (merged.length > 24) {
    let minX = maxW
    let minY = maxH
    let maxX = 0
    let maxY = 0
    for (const m of merged) {
      if (m.x < minX) minX = m.x
      if (m.y < minY) minY = m.y
      if (m.x + m.width > maxX) maxX = m.x + m.width
      if (m.y + m.height > maxY) maxY = m.y + m.height
    }
    return [{ x: minX, y: minY, width: maxX - minX, height: maxY - minY }]
  }

  return merged
}

function ensureDirtyUploadScratch(byteLen: number): Uint8Array {
  if (dirtyUploadScratch.byteLength < byteLen) {
    dirtyUploadScratch = new Uint8Array(Math.max(byteLen, 64 * 1024))
  }
  return dirtyUploadScratch
}

function ensureSurfaceGpuTexture(surf: SurfaceGpuResource): boolean {
  if (!gpuDevice || !gpuPipeline) return false
  const targetFmt = gpuTextureFormatFor(surf.format)
  if (
    surf.texture &&
    surf.texWidth === surf.width &&
    surf.texHeight === surf.height &&
    surf.texFormat === targetFmt
  ) {
    return false
  }

  surf.texture?.destroy()
  surf.texture = gpuDevice.createTexture({
    size: { width: surf.width, height: surf.height, depthOrArrayLayers: 1 },
    format: targetFmt,
    usage: GPUTEXTURE_USAGE_TEXTURE_BINDING | GPUTEXTURE_USAGE_COPY_DST,
  })
  surf.texWidth = surf.width
  surf.texHeight = surf.height
  surf.texFormat = targetFmt
  surf.bindGroup = gpuDevice.createBindGroup({
    layout: gpuPipeline.getBindGroupLayout(1),
    entries: [{ binding: 0, resource: surf.texture.createView() }],
  })
  return true
}

function uploadDirtyRectWebGpu(
  surf: SurfaceGpuResource,
  rect: DamageRect
): number {
  if (!gpuDevice || !surf.texture) return 0
  const rowBytes = rect.width * 4
  const uploadedBytes = rowBytes * rect.height

  // Direct zero-copy writeTexture when source is a non-shared ArrayBuffer;
  // for SharedArrayBuffer, copy ONLY the dirty rectangle rows into a tiny reusable
  // non-shared staging slice (WebGPU forbids SAB views in writeTexture).
  if (!shmIsShared && rect.x * 4 + rowBytes <= surf.stride) {
    gpuDevice.queue.writeTexture(
      { texture: surf.texture, origin: { x: rect.x, y: rect.y, z: 0 } },
      shmBytes,
      {
        offset: surf.shmOffset + rect.y * surf.stride + rect.x * 4,
        bytesPerRow: surf.stride,
        rowsPerImage: rect.height,
      },
      { width: rect.width, height: rect.height, depthOrArrayLayers: 1 }
    )
    return uploadedBytes
  }

  const alignedRowBytes = Math.ceil(rowBytes / 256) * 256
  const stagingBytesNeeded = alignedRowBytes * rect.height
  const scratch = ensureDirtyUploadScratch(stagingBytesNeeded)

  const srcStartBase = surf.shmOffset + rect.x * 4
  for (let row = 0; row < rect.height; row++) {
    const srcOff = srcStartBase + (rect.y + row) * surf.stride
    if (srcOff + rowBytes > shmBytes.byteLength) break
    scratch.set(
      shmBytes.subarray(srcOff, srcOff + rowBytes),
      row * alignedRowBytes
    )
  }

  gpuDevice.queue.writeTexture(
    { texture: surf.texture, origin: { x: rect.x, y: rect.y, z: 0 } },
    scratch.subarray(0, stagingBytesNeeded),
    {
      offset: 0,
      bytesPerRow: alignedRowBytes,
      rowsPerImage: rect.height,
    },
    { width: rect.width, height: rect.height, depthOrArrayLayers: 1 }
  )
  return uploadedBytes
}

function ensureSurface2dCanvas(surf: SurfaceGpuResource): boolean {
  if (
    surf.canvas2d &&
    surf.ctx2d &&
    surf.canvas2d.width === surf.width &&
    surf.canvas2d.height === surf.height
  ) {
    return false
  }
  surf.canvas2d = new OffscreenCanvas(surf.width, surf.height)
  surf.ctx2d = surf.canvas2d.getContext('2d', { alpha: true })
  return true
}

function uploadDirtyRect2d(surf: SurfaceGpuResource, rect: DamageRect): number {
  if (!surf.ctx2d) return 0
  const pixelCount = rect.width * rect.height
  const byteLen = pixelCount * 4
  if (dirty2dScratch.byteLength < byteLen) {
    dirty2dScratch = new Uint8ClampedArray(Math.max(byteLen, 64 * 1024))
  }

  const dst = new Uint8ClampedArray(dirty2dScratch.buffer, 0, byteLen)
  const bgra = isBgraFormat(surf.format)
  const opaque = isOpaqueFormat(surf.format) || (surf.flags & SURFACE_FLAG_OPAQUE) !== 0
  const srcStartBase = surf.shmOffset + rect.x * 4

  let dstIdx = 0
  for (let row = 0; row < rect.height; row++) {
    let srcIdx = srcStartBase + (rect.y + row) * surf.stride
    for (let col = 0; col < rect.width; col++) {
      if (bgra) {
        const b = shmBytes[srcIdx]
        const g = shmBytes[srcIdx + 1]
        const r = shmBytes[srcIdx + 2]
        const a = opaque ? 255 : shmBytes[srcIdx + 3]
        // Canvas 2D putImageData expects straight RGBA; un-premultiply if translucent
        if (!opaque && a > 0 && a < 255) {
          const inv = 255 / a
          dst[dstIdx] = Math.min(255, Math.round(r * inv))
          dst[dstIdx + 1] = Math.min(255, Math.round(g * inv))
          dst[dstIdx + 2] = Math.min(255, Math.round(b * inv))
          dst[dstIdx + 3] = a
        } else {
          dst[dstIdx] = r
          dst[dstIdx + 1] = g
          dst[dstIdx + 2] = b
          dst[dstIdx + 3] = a
        }
      } else {
        dst[dstIdx] = shmBytes[srcIdx]
        dst[dstIdx + 1] = shmBytes[srcIdx + 1]
        dst[dstIdx + 2] = shmBytes[srcIdx + 2]
        dst[dstIdx + 3] = opaque ? 255 : shmBytes[srcIdx + 3]
      }
      srcIdx += 4
      dstIdx += 4
    }
  }

  const imgData = new ImageData(new Uint8ClampedArray(dst), rect.width, rect.height)
  surf.ctx2d.putImageData(imgData, rect.x, rect.y)
  return byteLen
}

function handleCommand(cmd: WaylandCommand): void {
  if (cmd.op === OP_CREATE_SURFACE) {
    if (surfaces.has(cmd.surfaceId)) return
    surfaces.set(cmd.surfaceId, {
      id: cmd.surfaceId,
      x: 0,
      y: 0,
      zIndex: 0,
      title: `wl_surface#${cmd.surfaceId}`,
      flags: SURFACE_FLAG_VISIBLE,
      focused: false,
      shmOffset: 0,
      width: 0,
      height: 0,
      stride: 0,
      format: WL_SHM_FORMAT_ARGB8888,
      hasCommittedBuffer: false,
      pendingBuffer: null,
      pendingDamage: [],
      texture: null,
      texWidth: 0,
      texHeight: 0,
      texFormat: '',
      bindGroup: null,
      canvas2d: null,
      ctx2d: null,
    })
    sceneDirty = true
    return
  }

  if (cmd.op === OP_DESTROY_SURFACE) {
    const surf = surfaces.get(cmd.surfaceId)
    if (surf) {
      surf.texture?.destroy()
      surf.texture = null
      surf.bindGroup = null
      surf.canvas2d = null
      surf.ctx2d = null
      surfaces.delete(cmd.surfaceId)
      if (dragSurfaceId === cmd.surfaceId) dragSurfaceId = 0
      if (hoveredSurfaceId === cmd.surfaceId) hoveredSurfaceId = 0
      if (focusedSurfaceId === cmd.surfaceId) focusedSurfaceId = 0
      sceneDirty = true
    }
    return
  }

  const surf = surfaces.get(cmd.surfaceId)
  if (!surf) return

  if (cmd.op === OP_SET_TOPLEVEL) {
    // Do not overwrite user's live compositor-side drag position
    if (dragSurfaceId !== surf.id) {
      surf.x = cmd.x
      surf.y = cmd.y
    }
    surf.zIndex = cmd.zIndex
    if (cmd.zIndex > topZIndex) topZIndex = cmd.zIndex
    if (cmd.title) surf.title = cmd.title
    sceneDirty = true
  } else if (cmd.op === OP_SET_SURFACE_FLAGS) {
    surf.flags = cmd.flags
    sceneDirty = true
  } else if (cmd.op === OP_ATTACH_BUFFER) {
    surf.pendingBuffer = {
      shmOffset: cmd.shmOffset,
      width: cmd.width,
      height: cmd.height,
      stride: cmd.stride,
      format: cmd.format,
    }
  } else if (cmd.op === OP_DAMAGE_BUFFER) {
    if (cmd.width > 0 && cmd.height > 0) {
      surf.pendingDamage.push({
        x: cmd.x,
        y: cmd.y,
        width: cmd.width,
        height: cmd.height,
      })
    }
  } else if (cmd.op === OP_COMMIT) {
    totalCommits++
    let bufferChanged = false
    if (surf.pendingBuffer) {
      const pb = surf.pendingBuffer
      if (
        pb.width !== surf.width ||
        pb.height !== surf.height ||
        pb.format !== surf.format
      ) {
        bufferChanged = true
      }
      surf.shmOffset = pb.shmOffset
      surf.width = pb.width
      surf.height = pb.height
      surf.stride = pb.stride
      surf.format = pb.format
      surf.hasCommittedBuffer = pb.width > 0 && pb.height > 0
      surf.pendingBuffer = null
    }

    if (!surf.hasCommittedBuffer) {
      surf.pendingDamage.length = 0
      committedSurfacesThisFrame.add(surf.id)
      return
    }

    let recreated = false
    if (backend === 'webgpu') {
      recreated = ensureSurfaceGpuTexture(surf)
    } else if (backend === '2d-dirtyrect') {
      recreated = ensureSurface2dCanvas(surf)
    }

    let damageList: DamageRect[]
    if (recreated || bufferChanged) {
      damageList = [{ x: 0, y: 0, width: surf.width, height: surf.height }]
    } else {
      damageList = mergeAndClampDamage(surf.pendingDamage, surf.width, surf.height)
    }
    surf.pendingDamage.length = 0

    const nowMs = performance.now()
    for (let i = 0; i < damageList.length; i++) {
      const rect = damageList[i]
      const bytes =
        backend === 'webgpu'
          ? uploadDirtyRectWebGpu(surf, rect)
          : uploadDirtyRect2d(surf, rect)
      uploadedBytesThisFrame += bytes
      damageRectsThisFrame++

      if (showDamageOverlay && activeDamageFlashes.length < MAX_INSTANCES) {
        activeDamageFlashes.push({
          x: surf.x + rect.x,
          y: surf.y + rect.y,
          width: rect.width,
          height: rect.height,
          createdMs: nowMs,
        })
      }
    }

    committedSurfacesThisFrame.add(surf.id)
    if (damageList.length > 0 || recreated) {
      sceneDirty = true
    }
  }
}

function getSortedVisibleSurfaces(): SurfaceGpuResource[] {
  const list: SurfaceGpuResource[] = []
  for (const surf of surfaces.values()) {
    if (surf.hasCommittedBuffer && (surf.flags & SURFACE_FLAG_VISIBLE) !== 0) {
      list.push(surf)
    }
  }
  list.sort((a, b) => (a.zIndex !== b.zIndex ? a.zIndex - b.zIndex : a.id - b.id))
  return list
}

function hitTestSurface(x: number, y: number): SurfaceGpuResource | null {
  const sorted = getSortedVisibleSurfaces()
  for (let i = sorted.length - 1; i >= 0; i--) {
    const s = sorted[i]
    if (x >= s.x && x < s.x + s.width && y >= s.y && y < s.y + s.height) {
      return s
    }
  }
  return null
}

function focusAndRaiseSurface(surf: SurfaceGpuResource): void {
  const draggable = (surf.flags & SURFACE_FLAG_DRAGGABLE) !== 0
  if (focusedSurfaceId !== surf.id) {
    if (focusedSurfaceId > 0) {
      const prev = surfaces.get(focusedSurfaceId)
      if (prev) prev.focused = false
      eventRing?.pushSurfaceFocus(focusedSurfaceId, false)
    }
    focusedSurfaceId = surf.id
    surf.focused = true
    eventRing?.pushSurfaceFocus(surf.id, true)
  }

  if (draggable && surf.zIndex < topZIndex) {
    topZIndex++
    surf.zIndex = topZIndex
    eventRing?.pushSurfaceMoved(surf.id, surf.x, surf.y, surf.zIndex)
    sceneDirty = true
  }
}

function handlePointerMessage(
  msg: Extract<WorkerInboundMessage, { type: 'pointer' }>
): void {
  pendingInputTsMs = msg.timestampMs

  if (msg.kind === 'leave') {
    if (hoveredSurfaceId > 0) {
      eventRing?.pushPointerLeave(hoveredSurfaceId, msg.timestampMs)
      hoveredSurfaceId = 0
    }
    dragSurfaceId = 0
    return
  }

  // Zero-latency compositor-side window dragging (moves GPUTexture quad directly with 0 bytes uploaded!)
  if (dragSurfaceId > 0) {
    const dragged = surfaces.get(dragSurfaceId)
    if (msg.kind === 'move' && dragged) {
      const nextX = Math.max(-dragged.width + 64, Math.min(viewportWidth - 64, Math.round(msg.x - dragOffsetX)))
      const nextY = Math.max(0, Math.min(viewportHeight - 36, Math.round(msg.y - dragOffsetY)))
      if (nextX !== dragged.x || nextY !== dragged.y) {
        dragged.x = nextX
        dragged.y = nextY
        sceneDirty = true
        eventRing?.pushSurfaceMoved(dragged.id, dragged.x, dragged.y, dragged.zIndex)
      }
      return
    }
    if (msg.kind === 'up') {
      dragSurfaceId = 0
    }
  }

  const hit = hitTestSurface(msg.x, msg.y)
  const hitId = hit?.id ?? 0

  if (hitId !== hoveredSurfaceId) {
    if (hoveredSurfaceId > 0) {
      eventRing?.pushPointerLeave(hoveredSurfaceId, msg.timestampMs)
    }
    hoveredSurfaceId = hitId
    if (hit) {
      eventRing?.pushPointerEnter(hit.id, msg.x - hit.x, msg.y - hit.y, msg.timestampMs)
    }
  }

  if (!hit) return

  const localX = msg.x - hit.x
  const localY = msg.y - hit.y

  if (msg.kind === 'down') {
    focusAndRaiseSurface(hit)
    const isDraggable = (hit.flags & SURFACE_FLAG_DRAGGABLE) !== 0
    if (msg.button === 0 && isDraggable && localY >= 0 && localY < TITLEBAR_DRAG_HEIGHT) {
      dragSurfaceId = hit.id
      dragOffsetX = localX
      dragOffsetY = localY
      sceneDirty = true
    }
    eventRing?.pushPointerButton(hit.id, msg.button, true, localX, localY, msg.timestampMs)
  } else if (msg.kind === 'up') {
    eventRing?.pushPointerButton(hit.id, msg.button, false, localX, localY, msg.timestampMs)
  } else if (msg.kind === 'move') {
    eventRing?.pushPointerMotion(hit.id, localX, localY, msg.timestampMs)
  }
}

function handleWheelMessage(
  msg: Extract<WorkerInboundMessage, { type: 'wheel' }>
): void {
  pendingInputTsMs = msg.timestampMs
  const hit = hitTestSurface(msg.x, msg.y)
  if (!hit) return
  eventRing?.pushPointerAxis(hit.id, msg.deltaX, msg.deltaY, msg.timestampMs)
}

function handleKeyboardMessage(
  msg: Extract<WorkerInboundMessage, { type: 'keyboard' }>
): void {
  pendingInputTsMs = msg.timestampMs
  let targetId = focusedSurfaceId
  if (targetId <= 0) {
    const sorted = getSortedVisibleSurfaces()
    targetId = sorted.length > 0 ? sorted[sorted.length - 1].id : 0
  }
  if (targetId > 0) {
    eventRing?.pushKeyboardKey(
      targetId,
      msg.keyCode,
      msg.pressed,
      msg.modifiers,
      msg.charCode,
      msg.timestampMs
    )
  }
}

async function initWebGpu(canvas: OffscreenCanvas): Promise<boolean> {
  const nav = navigator as Navigator & { gpu?: NavigatorGpuLike }
  if (!nav.gpu) return false

  try {
    const adapter = (await nav.gpu.requestAdapter({
      powerPreference: 'high-performance',
    })) as GpuAdapterLike | null
    if (!adapter) return false

    const desc = [
      adapter.info?.description,
      adapter.info?.vendor,
      adapter.info?.architecture,
      adapter.info?.device,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    if (
      adapter.isFallbackAdapter ||
      adapter.info?.isFallbackAdapter ||
      desc.includes('swiftshader') ||
      desc.includes('llvmpipe')
    ) {
      return false
    }

    const device = await adapter.requestDevice()
    device.addEventListener?.('uncapturederror', (ev) => {
      console.warn('[waylandCompositor] WebGPU uncaptured error:', ev.error?.message ?? ev)
    })

    const context = canvas.getContext('webgpu') as unknown as GpuCanvasContextLike | null
    if (!context) {
      device.destroy()
      return false
    }

    const format = nav.gpu.getPreferredCanvasFormat()
    gpuCanvasFormat = format
    context.configure({
      device,
      format,
      alphaMode: 'opaque',
    })

    const surfaceShader = device.createShaderModule({ code: WGSL_COMPOSITOR_SHADER })
    const pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: surfaceShader, entryPoint: 'vs_main' },
      fragment: {
        module: surfaceShader,
        entryPoint: 'fs_main',
        targets: [
          {
            format,
            blend: {
              color: {
                srcFactor: 'one',
                dstFactor: 'one-minus-src-alpha',
                operation: 'add',
              },
              alpha: {
                srcFactor: 'one',
                dstFactor: 'one-minus-src-alpha',
                operation: 'add',
              },
            },
          },
        ],
      },
      primitive: { topology: 'triangle-list' },
    })

    const sampler = device.createSampler({
      magFilter: 'nearest',
      minFilter: 'nearest',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    })

    const instBuf = device.createBuffer({
      size: MAX_INSTANCES * INSTANCE_FLOATS * 4,
      usage: GPUBUFFER_USAGE_STORAGE | GPUBUFFER_USAGE_COPY_DST,
    })

    const globalBg = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: instBuf } },
        { binding: 1, resource: sampler },
      ],
    })

    // Optional damage rect overlay pipeline
    const dmgShader = device.createShaderModule({ code: WGSL_DAMAGE_SHADER })
    const dmgPipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: dmgShader, entryPoint: 'vs_main' },
      fragment: {
        module: dmgShader,
        entryPoint: 'fs_main',
        targets: [
          {
            format,
            blend: {
              color: {
                srcFactor: 'one',
                dstFactor: 'one-minus-src-alpha',
                operation: 'add',
              },
              alpha: {
                srcFactor: 'one',
                dstFactor: 'one-minus-src-alpha',
                operation: 'add',
              },
            },
          },
        ],
      },
      primitive: { topology: 'triangle-list' },
    })
    const dmgBuf = device.createBuffer({
      size: MAX_INSTANCES * 8 * 4,
      usage: GPUBUFFER_USAGE_STORAGE | GPUBUFFER_USAGE_COPY_DST,
    })
    const dmgBg = device.createBindGroup({
      layout: dmgPipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: dmgBuf } }],
    })

    gpuDevice = device
    gpuCtx = context
    gpuPipeline = pipeline
    gpuInstanceBuffer = instBuf
    gpuGlobalBindGroup = globalBg
    gpuDamagePipeline = dmgPipeline
    gpuDamageBuffer = dmgBuf
    gpuDamageBindGroup = dmgBg
    adapterName =
      adapter.info?.description ||
      adapter.info?.vendor ||
      adapter.info?.architecture ||
      'WebGPU Hardware Adapter'

    return true
  } catch {
    return false
  }
}

function init2dFallback(canvas: OffscreenCanvas): void {
  mainCtx2d = canvas.getContext('2d', {
    alpha: false,
    desynchronized: true,
  })
  adapterName = 'OffscreenCanvas 2D Dirty-Rect Fallback'
}

function applyCanvasSize(w: number, h: number, nextDpr: number): void {
  viewportWidth = Math.max(1, Math.floor(w))
  viewportHeight = Math.max(1, Math.floor(h))
  dpr = Math.max(1, Math.min(3, nextDpr || 1))

  if (offscreen) {
    offscreen.width = Math.max(1, Math.round(viewportWidth * dpr))
    offscreen.height = Math.max(1, Math.round(viewportHeight * dpr))
  }

  if (backend === 'webgpu' && gpuCtx && gpuDevice) {
    gpuCtx.configure({
      device: gpuDevice,
      format: gpuCanvasFormat,
      alphaMode: 'opaque',
    })
  }
  sceneDirty = true
}

function renderFrameWebGpu(
  sorted: SurfaceGpuResource[],
  nowMs: number
): void {
  if (!gpuDevice || !gpuCtx || !gpuPipeline || !gpuInstanceBuffer || !gpuGlobalBindGroup) {
    return
  }

  const passStart = performance.now()
  const count = Math.min(sorted.length, MAX_INSTANCES)

  for (let i = 0; i < count; i++) {
    const s = sorted[i]
    const base = i * INSTANCE_FLOATS
    instanceCpuData[base] = s.x
    instanceCpuData[base + 1] = s.y
    instanceCpuData[base + 2] = s.width
    instanceCpuData[base + 3] = s.height
    instanceCpuData[base + 4] = viewportWidth
    instanceCpuData[base + 5] = viewportHeight
    instanceCpuData[base + 6] =
      isOpaqueFormat(s.format) || (s.flags & SURFACE_FLAG_OPAQUE) !== 0 ? 1.0 : 0.0
    instanceCpuData[base + 7] = dpr
  }

  if (count > 0) {
    gpuDevice.queue.writeBuffer(
      gpuInstanceBuffer,
      0,
      instanceCpuData.subarray(0, count * INSTANCE_FLOATS)
    )
  }

  // Prune & pack active damage overlay flashes
  let dmgCount = 0
  if (showDamageOverlay && activeDamageFlashes.length > 0 && gpuDamageBuffer) {
    for (let i = activeDamageFlashes.length - 1; i >= 0; i--) {
      const age = nowMs - activeDamageFlashes[i].createdMs
      if (age >= DAMAGE_FLASH_DURATION_MS) {
        activeDamageFlashes.splice(i, 1)
      }
    }
    dmgCount = Math.min(activeDamageFlashes.length, MAX_INSTANCES)
    for (let i = 0; i < dmgCount; i++) {
      const f = activeDamageFlashes[i]
      const base = i * 8
      damageCpuData[base] = f.x
      damageCpuData[base + 1] = f.y
      damageCpuData[base + 2] = f.width
      damageCpuData[base + 3] = f.height
      damageCpuData[base + 4] = viewportWidth
      damageCpuData[base + 5] = viewportHeight
      damageCpuData[base + 6] = Math.max(0, 1 - (nowMs - f.createdMs) / DAMAGE_FLASH_DURATION_MS)
      damageCpuData[base + 7] = 0
    }
    if (dmgCount > 0) {
      gpuDevice.queue.writeBuffer(
        gpuDamageBuffer,
        0,
        damageCpuData.subarray(0, dmgCount * 8)
      )
    }
  }

  const currentView = gpuCtx.getCurrentTexture().createView()
  const encoder = gpuDevice.createCommandEncoder()
  const pass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view: currentView,
        clearValue: { r: 0.04, g: 0.055, b: 0.075, a: 1.0 },
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
  })

  // Single hardware compositing render pass: draw all visible surfaces sorted by zIndex
  pass.setPipeline(gpuPipeline)
  pass.setBindGroup(0, gpuGlobalBindGroup)
  for (let i = 0; i < count; i++) {
    const s = sorted[i]
    if (!s.bindGroup) continue
    pass.setBindGroup(1, s.bindGroup)
    pass.draw(6, 1, 0, i)
  }

  if (dmgCount > 0 && gpuDamagePipeline && gpuDamageBindGroup) {
    pass.setPipeline(gpuDamagePipeline)
    pass.setBindGroup(0, gpuDamageBindGroup)
    pass.draw(6, dmgCount, 0, 0)
  }

  pass.end()
  gpuDevice.queue.submit([encoder.finish()])
  gpuPassTimeMs = performance.now() - passStart
}

function renderFrame2d(sorted: SurfaceGpuResource[], nowMs: number): void {
  if (!mainCtx2d || !offscreen) return
  const passStart = performance.now()

  mainCtx2d.save()
  mainCtx2d.setTransform(dpr, 0, 0, dpr, 0, 0)
  mainCtx2d.imageSmoothingEnabled = false
  mainCtx2d.fillStyle = '#0a0e14'
  mainCtx2d.fillRect(0, 0, viewportWidth, viewportHeight)

  for (let i = 0; i < sorted.length; i++) {
    const s = sorted[i]
    if (!s.canvas2d) continue
    const sx = Math.floor(s.x * dpr) / dpr
    const sy = Math.floor(s.y * dpr) / dpr
    mainCtx2d.drawImage(s.canvas2d, sx, sy, s.width, s.height)
  }

  if (showDamageOverlay && activeDamageFlashes.length > 0) {
    for (let i = activeDamageFlashes.length - 1; i >= 0; i--) {
      const f = activeDamageFlashes[i]
      const age = nowMs - f.createdMs
      if (age >= DAMAGE_FLASH_DURATION_MS) {
        activeDamageFlashes.splice(i, 1)
        continue
      }
      const alpha = Math.max(0, 1 - age / DAMAGE_FLASH_DURATION_MS)
      mainCtx2d.fillStyle = `rgba(56, 217, 250, ${(alpha * 0.16).toFixed(3)})`
      mainCtx2d.fillRect(f.x, f.y, f.width, f.height)
      mainCtx2d.strokeStyle = `rgba(56, 217, 250, ${(alpha * 0.92).toFixed(3)})`
      mainCtx2d.lineWidth = 1.5
      mainCtx2d.strokeRect(f.x + 0.5, f.y + 0.5, Math.max(1, f.width - 1), Math.max(1, f.height - 1))
    }
  }

  mainCtx2d.restore()
  gpuPassTimeMs = performance.now() - passStart
}

function emitTelemetry(force = false): void {
  const now = performance.now()
  if (!force && now - lastTelemetryEmitMs < 120) return
  lastTelemetryEmitMs = now

  const fullScreenBytes = Math.max(1, viewportWidth * viewportHeight * 4)
  const savedPct = Math.max(
    0,
    Math.min(100, (1 - uploadedBytesAvg / fullScreenBytes) * 100)
  )

  const snapshot: WaylandCompositorTelemetry = {
    backend,
    adapterName,
    sharedMemoryActive,
    viewportWidth,
    viewportHeight,
    dpr,
    fps: currentFps,
    uploadedBytesFrame: lastUploadedBytesFrame,
    uploadedBytesAvg,
    fullScreenBytes,
    bandwidthSavedPct: savedPct,
    damageRectsFrame: lastDamageRectsFrame,
    gpuPassTimeMs,
    inputToPhotonMs,
    surfaceCount: surfaces.size,
    focusedSurfaceId,
    totalCommits,
    frameCallbacksSent,
  }
  self.postMessage({ type: 'telemetry', snapshot })
}

function compositorTick(): void {
  if (disposed) return

  const nowMs = performance.now()
  uploadedBytesThisFrame = 0
  damageRectsThisFrame = 0
  committedSurfacesThisFrame.clear()

  // Drain all queued lock-free Wayland surface & damage commands
  commandRing?.drain(handleCommand, 512)

  const hasActiveDamageFlashes =
    showDamageOverlay && activeDamageFlashes.length > 0

  if (sceneDirty || hasActiveDamageFlashes || committedSurfacesThisFrame.size > 0) {
    const sorted = getSortedVisibleSurfaces()

    if (backend === 'webgpu') {
      renderFrameWebGpu(sorted, nowMs)
    } else if (backend === '2d-dirtyrect') {
      renderFrame2d(sorted, nowMs)
    }

    // Immediately emit wl_callback.done (FRAME_DONE) after submit so Wayland clients pace directly to vsync
    const doneTs = performance.now()
    const doneEpochMs = performance.timeOrigin + doneTs
    if (committedSurfacesThisFrame.size > 0 && eventRing) {
      for (const sid of committedSurfacesThisFrame) {
        eventRing.pushFrameDone(sid, doneTs)
        frameCallbacksSent++
      }
    }

    if (pendingInputTsMs > 0) {
      const latency = doneEpochMs - pendingInputTsMs
      if (latency >= 0 && latency < 500) {
        inputToPhotonMs =
          inputToPhotonMs === 0 ? latency : inputToPhotonMs * 0.6 + latency * 0.4
      }
      pendingInputTsMs = 0
    }

    if (committedSurfacesThisFrame.size > 0) {
      lastUploadedBytesFrame = uploadedBytesThisFrame
      lastDamageRectsFrame = damageRectsThisFrame
    } else if (dragSurfaceId > 0) {
      // Native compositor drag moves cached GPUTexture quad with 0 B upload
      lastUploadedBytesFrame = 0
      lastDamageRectsFrame = 0
    }
    uploadedBytesAvg =
      uploadedBytesAvg === 0
        ? uploadedBytesThisFrame
        : uploadedBytesAvg * 0.85 + uploadedBytesThisFrame * 0.15

    sceneDirty = false
    fpsWindowFrames++
  }

  if (nowMs - fpsWindowStart >= 500) {
    currentFps = Math.round((fpsWindowFrames * 1000) / (nowMs - fpsWindowStart))
    fpsWindowFrames = 0
    fpsWindowStart = nowMs
    emitTelemetry(true)
  } else {
    emitTelemetry(false)
  }

  rafId = self.requestAnimationFrame(compositorTick)
}

self.onmessage = (event: MessageEvent<WorkerInboundMessage>) => {
  const msg = event.data

  if (msg.type === 'init') {
    disposed = false
    offscreen = msg.canvas
    shmBytes = new Uint8Array(msg.shmBuffer)
    shmIsShared =
      typeof SharedArrayBuffer === 'function' &&
      msg.shmBuffer instanceof SharedArrayBuffer
    sharedMemoryActive = shmIsShared
    commandRing = new CommandRingBuffer(msg.commandBuffer)
    eventRing = new EventRingBuffer(msg.eventBuffer)
    showDamageOverlay = Boolean(msg.showDamageOverlay)
    applyCanvasSize(msg.width, msg.height, msg.dpr)

    void initWebGpu(offscreen).then((gpuOk) => {
      if (disposed || !offscreen) return
      if (gpuOk) {
        backend = 'webgpu'
      } else {
        init2dFallback(offscreen)
        backend = '2d-dirtyrect'
      }
      sceneDirty = true
      emitTelemetry(true)
      if (rafId === null) {
        rafId = self.requestAnimationFrame(compositorTick)
      }
    })
  } else if (msg.type === 'resize') {
    applyCanvasSize(msg.width, msg.height, msg.dpr)
    emitTelemetry(true)
  } else if (msg.type === 'setDamageOverlay') {
    showDamageOverlay = msg.enabled
    if (!showDamageOverlay) activeDamageFlashes.length = 0
    sceneDirty = true
  } else if (msg.type === 'pointer') {
    handlePointerMessage(msg)
  } else if (msg.type === 'wheel') {
    handleWheelMessage(msg)
  } else if (msg.type === 'keyboard') {
    handleKeyboardMessage(msg)
  } else if (msg.type === 'nudge') {
    sceneDirty = true
  } else if (msg.type === 'dispose') {
    disposed = true
    if (rafId !== null) {
      self.cancelAnimationFrame(rafId)
      rafId = null
    }
    for (const surf of surfaces.values()) {
      surf.texture?.destroy()
    }
    surfaces.clear()
    gpuInstanceBuffer?.destroy()
    gpuDamageBuffer?.destroy()
    gpuDevice?.destroy()
    gpuInstanceBuffer = null
    gpuDamageBuffer = null
    gpuDevice = null
    gpuCtx = null
    mainCtx2d = null
  }
}
