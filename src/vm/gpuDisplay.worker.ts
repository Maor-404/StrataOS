/**
 * Dedicated Display Render Worker (`OffscreenCanvas` + WebGPU Blitter + 2D ImageBitmap Fallback)
 *
 * Receives X11 framebuffer frames via a SharedArrayBuffer ring (or transferred ArrayBuffer)
 * and blits them at 60fps completely off the main thread so mouse/keyboard input stays
 * zero-jank even under heavy CheerpX JIT compilation.
 */

export type DisplayBackend = 'initializing' | 'webgpu' | '2d-imagebitmap'

export interface GpuDisplayTelemetry {
  backend: DisplayBackend
  adapterName: string
  width: number
  height: number
  fps: number
  framesRendered: number
  sharedBufferActive: boolean
}

interface GpuQueueLike {
  writeTexture(
    destination: { texture: unknown },
    data: ArrayBufferView,
    dataLayout: { bytesPerRow: number; rowsPerImage?: number },
    size: { width: number; height: number; depthOrArrayLayers?: number }
  ): void
  submit(commandBuffers: unknown[]): void
}

interface GpuTextureLike {
  createView(): unknown
  destroy(): void
}

interface GpuRenderPassLike {
  setPipeline(pipeline: unknown): void
  setBindGroup(index: number, bindGroup: unknown): void
  draw(vertexCount: number): void
  end(): void
}

interface GpuCommandEncoderLike {
  beginRenderPass(descriptor: unknown): GpuRenderPassLike
  finish(): unknown
}

interface GpuDeviceLike {
  queue: GpuQueueLike
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

const WGSL_BLIT_SHADER = /* wgsl */ `
struct VsOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) idx: u32) -> VsOut {
  var positions = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 3.0, -1.0),
    vec2<f32>(-1.0,  3.0)
  );
  var uvs = array<vec2<f32>, 3>(
    vec2<f32>(0.0,  1.0),
    vec2<f32>(2.0,  1.0),
    vec2<f32>(0.0, -1.0)
  );
  var out: VsOut;
  out.pos = vec4<f32>(positions[idx], 0.0, 1.0);
  out.uv = uvs[idx];
  return out;
}

@group(0) @binding(0) var fbSampler: sampler;
@group(0) @binding(1) var fbTexture: texture_2d<f32>;

@fragment
fn fs_main(in: VsOut) -> @location(0) vec4<f32> {
  return textureSample(fbTexture, fbSampler, in.uv);
}
`

const GPUTEXTURE_USAGE_TEXTURE_BINDING = 0x04
const GPUTEXTURE_USAGE_COPY_DST = 0x02

type WorkerMessage =
  | {
      type: 'init'
      canvas: OffscreenCanvas
      width: number
      height: number
      sharedCtrl: SharedArrayBuffer | null
      sharedPixels: SharedArrayBuffer | null
    }
  | {
      type: 'resize'
      width: number
      height: number
      sharedCtrl: SharedArrayBuffer | null
      sharedPixels: SharedArrayBuffer | null
    }
  | {
      type: 'frame'
    }
  | {
      type: 'frameBuffer'
      width: number
      height: number
      buffer: ArrayBuffer
    }
  | {
      type: 'dispose'
    }

let canvas: OffscreenCanvas | null = null
let fbWidth = 1024
let fbHeight = 768
let backend: DisplayBackend = 'initializing'
let adapterName = ''

// SharedArrayBuffer zero-copy frame transport
let ctrlView: Int32Array | null = null
let sharedPixelsView: Uint8ClampedArray | null = null
let lastRenderedSeq = 0

// Single reusable non-shared scratch buffer (WebGPU writeTexture & ImageData disallow SAB views)
let uploadScratch = new Uint8ClampedArray(0)
let alignedScratch = new Uint8ClampedArray(0)
let hasPendingTransferFrame = false

// WebGPU objects
let gpuDevice: GpuDeviceLike | null = null
let gpuCtx: GpuCanvasContextLike | null = null
let gpuFormat = 'bgra8unorm'
let gpuPipeline: { getBindGroupLayout(index: number): unknown } | null = null
let gpuSampler: unknown = null
let gpuTexture: GpuTextureLike | null = null
let gpuBindGroup: unknown = null

// 2D ImageBitmap fallback objects
let ctx2d: OffscreenCanvasRenderingContext2D | null = null
let blit2dInFlight = false

// Telemetry counters
let framesRendered = 0
let fpsWindowCount = 0
let fpsWindowStart = performance.now()
let currentFps = 0
let rafId: number | null = null
let disposed = false

function emitTelemetry(): void {
  const snapshot: GpuDisplayTelemetry = {
    backend,
    adapterName,
    width: fbWidth,
    height: fbHeight,
    fps: currentFps,
    framesRendered,
    sharedBufferActive: ctrlView !== null && sharedPixelsView !== null,
  }
  self.postMessage({ type: 'telemetry', snapshot })
}

function recreateWebGpuTexture(w: number, h: number): void {
  if (!gpuDevice || !gpuPipeline || !gpuSampler) return
  if (gpuTexture) {
    gpuTexture.destroy()
    gpuTexture = null
  }
  gpuTexture = gpuDevice.createTexture({
    size: { width: w, height: h, depthOrArrayLayers: 1 },
    format: 'rgba8unorm',
    usage: GPUTEXTURE_USAGE_TEXTURE_BINDING | GPUTEXTURE_USAGE_COPY_DST,
  })
  gpuBindGroup = gpuDevice.createBindGroup({
    layout: gpuPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: gpuSampler },
      { binding: 1, resource: gpuTexture.createView() },
    ],
  })
}

async function initWebGpu(offscreen: OffscreenCanvas): Promise<boolean> {
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
      console.warn('[gpuDisplay] WebGPU uncaptured error:', ev.error?.message ?? ev)
    })

    const context = offscreen.getContext('webgpu') as unknown as GpuCanvasContextLike | null
    if (!context) {
      device.destroy()
      return false
    }

    const format = nav.gpu.getPreferredCanvasFormat()
    gpuFormat = format
    context.configure({
      device,
      format,
      alphaMode: 'opaque',
    })

    const shaderModule = device.createShaderModule({ code: WGSL_BLIT_SHADER })
    const pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: shaderModule,
        entryPoint: 'vs_main',
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs_main',
        targets: [{ format }],
      },
      primitive: {
        topology: 'triangle-list',
      },
    })

    const sampler = device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
    })

    gpuDevice = device
    gpuCtx = context
    gpuPipeline = pipeline
    gpuSampler = sampler
    adapterName =
      adapter.info?.description ||
      adapter.info?.vendor ||
      adapter.info?.architecture ||
      'WebGPU Hardware Adapter'

    recreateWebGpuTexture(fbWidth, fbHeight)
    return true
  } catch {
    return false
  }
}

function init2dFallback(offscreen: OffscreenCanvas): void {
  ctx2d = offscreen.getContext('2d', {
    alpha: false,
    desynchronized: true,
  })
  adapterName = 'OffscreenCanvas 2D ImageBitmap'
}

function syncBuffers(
  width: number,
  height: number,
  sharedCtrl: SharedArrayBuffer | null,
  sharedPixels: SharedArrayBuffer | null
): void {
  fbWidth = Math.max(1, Math.floor(width))
  fbHeight = Math.max(1, Math.floor(height))

  if (canvas) {
    canvas.width = fbWidth
    canvas.height = fbHeight
  }

  const byteLen = fbWidth * fbHeight * 4
  if (uploadScratch.byteLength !== byteLen) {
    uploadScratch = new Uint8ClampedArray(byteLen)
  }

  const rowBytes = fbWidth * 4
  const alignedRowBytes = Math.ceil(rowBytes / 256) * 256
  if (alignedRowBytes !== rowBytes) {
    const alignedTotal = alignedRowBytes * fbHeight
    if (alignedScratch.byteLength !== alignedTotal) {
      alignedScratch = new Uint8ClampedArray(alignedTotal)
    }
  } else if (alignedScratch.byteLength !== 0) {
    alignedScratch = new Uint8ClampedArray(0)
  }

  if (sharedCtrl && sharedPixels && sharedPixels.byteLength >= byteLen) {
    ctrlView = new Int32Array(sharedCtrl)
    sharedPixelsView = new Uint8ClampedArray(sharedPixels, 0, byteLen)
    // Always start at 0 so frames written before init/resize completes are blitted immediately
    lastRenderedSeq = 0
  } else {
    ctrlView = null
    sharedPixelsView = null
  }

  if (backend === 'webgpu' && gpuCtx && gpuDevice) {
    gpuCtx.configure({
      device: gpuDevice,
      format: gpuFormat,
      alphaMode: 'opaque',
    })
    recreateWebGpuTexture(fbWidth, fbHeight)
  }
}

function recordFrameTiming(): void {
  framesRendered++
  fpsWindowCount++
  const now = performance.now()
  if (now - fpsWindowStart >= 1000) {
    currentFps = Math.round((fpsWindowCount * 1000) / (now - fpsWindowStart))
    fpsWindowCount = 0
    fpsWindowStart = now
    emitTelemetry()
  } else if (framesRendered === 1) {
    emitTelemetry()
  }
}

function blitWebGpu(): void {
  if (!gpuDevice || !gpuCtx || !gpuTexture || !gpuPipeline || !gpuBindGroup) return

  const rowBytes = fbWidth * 4
  const alignedRowBytes = Math.ceil(rowBytes / 256) * 256
  let srcData = uploadScratch
  if (alignedRowBytes !== rowBytes) {
    for (let y = 0; y < fbHeight; y++) {
      const srcOff = y * rowBytes
      alignedScratch.set(
        uploadScratch.subarray(srcOff, srcOff + rowBytes),
        y * alignedRowBytes
      )
    }
    srcData = alignedScratch
  }

  gpuDevice.queue.writeTexture(
    { texture: gpuTexture },
    srcData,
    { bytesPerRow: alignedRowBytes, rowsPerImage: fbHeight },
    { width: fbWidth, height: fbHeight, depthOrArrayLayers: 1 }
  )

  const currentView = gpuCtx.getCurrentTexture().createView()
  const encoder = gpuDevice.createCommandEncoder()
  const pass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view: currentView,
        clearValue: { r: 0.05, g: 0.07, b: 0.09, a: 1.0 },
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
  })
  pass.setPipeline(gpuPipeline)
  pass.setBindGroup(0, gpuBindGroup)
  pass.draw(3)
  pass.end()
  gpuDevice.queue.submit([encoder.finish()])
  recordFrameTiming()
}

function blit2dImageBitmap(): void {
  if (!ctx2d || !canvas || blit2dInFlight) return
  blit2dInFlight = true
  const frameCopy = new Uint8ClampedArray(uploadScratch)
  const imageData = new ImageData(frameCopy, fbWidth, fbHeight)

  void createImageBitmap(imageData)
    .then((bitmap) => {
      if (!disposed && ctx2d && canvas) {
        ctx2d.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
        recordFrameTiming()
      }
      bitmap.close()
    })
    .catch(() => {
      if (!disposed && ctx2d) {
        ctx2d.putImageData(imageData, 0, 0)
        recordFrameTiming()
      }
    })
    .finally(() => {
      blit2dInFlight = false
    })
}

function renderTick(): void {
  if (disposed) return

  let needsBlit = false

  if (ctrlView && sharedPixelsView) {
    const seq = Atomics.load(ctrlView, 0)
    if (seq !== lastRenderedSeq) {
      lastRenderedSeq = seq
      if (uploadScratch.byteLength === sharedPixelsView.byteLength) {
        uploadScratch.set(sharedPixelsView)
        needsBlit = true
      }
    }
  } else if (hasPendingTransferFrame) {
    hasPendingTransferFrame = false
    needsBlit = true
  }

  if (needsBlit) {
    if (backend === 'webgpu') {
      blitWebGpu()
    } else if (backend === '2d-imagebitmap') {
      blit2dImageBitmap()
    }
  }

  rafId = self.requestAnimationFrame(renderTick)
}

self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const msg = event.data

  if (msg.type === 'init') {
    disposed = false
    canvas = msg.canvas
    syncBuffers(msg.width, msg.height, msg.sharedCtrl, msg.sharedPixels)

    void initWebGpu(canvas).then((gpuOk) => {
      if (disposed || !canvas) return
      if (gpuOk) {
        backend = 'webgpu'
      } else {
        init2dFallback(canvas)
        backend = '2d-imagebitmap'
      }
      emitTelemetry()
      if (rafId === null) {
        rafId = self.requestAnimationFrame(renderTick)
      }
    })
  } else if (msg.type === 'resize') {
    syncBuffers(msg.width, msg.height, msg.sharedCtrl, msg.sharedPixels)
    emitTelemetry()
  } else if (msg.type === 'frameBuffer') {
    if (msg.width !== fbWidth || msg.height !== fbHeight) {
      syncBuffers(msg.width, msg.height, null, null)
    }
    const incoming = new Uint8ClampedArray(msg.buffer)
    if (incoming.byteLength === uploadScratch.byteLength) {
      uploadScratch.set(incoming)
      hasPendingTransferFrame = true
    }
  } else if (msg.type === 'dispose') {
    disposed = true
    if (rafId !== null) {
      self.cancelAnimationFrame(rafId)
      rafId = null
    }
    gpuTexture?.destroy()
    gpuDevice?.destroy()
    gpuTexture = null
    gpuDevice = null
    gpuCtx = null
    ctx2d = null
  }
}
