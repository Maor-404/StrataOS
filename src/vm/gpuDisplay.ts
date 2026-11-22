/**
 * Zero-Jank Display Pipeline (`src/vm/gpuDisplay.ts`)
 *
 * - Transfers the full-viewport `<canvas>` to a dedicated Render Worker via
 *   `canvas.transferControlToOffscreen()`.
 * - Exposes a `VirtualKmsSurface` compatible with CheerpX's `cx.setKmsCanvas(...)`
 *   so CheerpX's `putImageData` calls write straight into a `SharedArrayBuffer`
 *   staging buffer (zero main-thread canvas painting!) and the worker blits via
 *   WebGPU (or 2D `ImageBitmap` fallback) at 60fps.
 * - Wires native Pointer Events (`setPointerCapture`) and Fullscreen Keyboard Lock API
 *   (`navigator.keyboard.lock`) so `Alt+Tab`, `Ctrl+W`, and `Super` reach Linux directly.
 */

import type { DisplayBackend, GpuDisplayTelemetry } from './gpuDisplay.worker'

export type { DisplayBackend, GpuDisplayTelemetry }

export interface DisplayPipelineState extends GpuDisplayTelemetry {
  firstFramePainted: boolean
  isFullscreen: boolean
  keyboardLocked: boolean
  keyboardLockSupported: boolean
}

type SyntheticListener = (event: unknown) => void

export interface VirtualKmsSurface {
  width: number
  height: number
  getContext(type: string, options?: unknown): {
    putImageData(imageData: ImageData, dx: number, dy: number): void
  }
  addEventListener(type: string, listener: SyntheticListener): void
  removeEventListener(type: string, listener: SyntheticListener): void
  getBoundingClientRect(): DOMRect
}

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

function hasNonBlackPixels(data: Uint8ClampedArray, width: number, height: number): boolean {
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

export class GpuDisplayPipeline {
  private readonly canvas: HTMLCanvasElement
  private readonly worker: Worker
  private readonly listeners = new Set<(state: DisplayPipelineState) => void>()
  private readonly kmsListeners = new Map<string, Set<SyntheticListener>>()

  private fbWidth: number
  private fbHeight: number
  private sharedCtrl: SharedArrayBuffer | null = null
  private sharedPixels: SharedArrayBuffer | null = null
  private ctrlView: Int32Array | null = null
  private pixelsView: Uint8ClampedArray | null = null
  private activePointerId: number | null = null

  private state: DisplayPipelineState

  private readonly onFirstFrameCb?: () => void
  private readonly cleanupDomListeners: Array<() => void> = []

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
      adapterName: '',
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

    this.allocateFrameBuffers(this.fbWidth, this.fbHeight)

    const offscreen = canvas.transferControlToOffscreen()
    this.worker = new Worker(
      new URL('./gpuDisplay.worker.ts', import.meta.url),
      { type: 'module' }
    )

    this.worker.onmessage = (event: MessageEvent) => {
      const msg = event.data as {
        type?: string
        snapshot?: GpuDisplayTelemetry
      }
      if (msg.type === 'telemetry' && msg.snapshot) {
        this.state = {
          ...this.state,
          ...msg.snapshot,
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
        sharedCtrl: this.sharedCtrl,
        sharedPixels: this.sharedPixels,
      },
      [offscreen]
    )

    this.virtualKmsSurface = this.createVirtualKmsSurface()
    this.bindInputListeners()
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

  private allocateFrameBuffers(width: number, height: number): void {
    const byteLen = width * height * 4
    if (
      typeof SharedArrayBuffer === 'function' &&
      globalThis.crossOriginIsolated
    ) {
      this.sharedCtrl = new SharedArrayBuffer(16)
      this.sharedPixels = new SharedArrayBuffer(byteLen)
      this.ctrlView = new Int32Array(this.sharedCtrl)
      this.pixelsView = new Uint8ClampedArray(this.sharedPixels)
      this.state.sharedBufferActive = true
    } else {
      this.sharedCtrl = null
      this.sharedPixels = null
      this.ctrlView = null
      this.pixelsView = null
      this.state.sharedBufferActive = false
    }
  }

  private handleResolutionChange(nextWidth: number, nextHeight: number): void {
    const w = Math.max(1, Math.floor(nextWidth))
    const h = Math.max(1, Math.floor(nextHeight))
    if (w === this.fbWidth && h === this.fbHeight) return

    this.fbWidth = w
    this.fbHeight = h
    this.allocateFrameBuffers(w, h)
    this.worker.postMessage({
      type: 'resize',
      width: w,
      height: h,
      sharedCtrl: this.sharedCtrl,
      sharedPixels: this.sharedPixels,
    })
  }

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

    if (this.ctrlView && this.pixelsView && this.pixelsView.byteLength === imageData.data.byteLength) {
      this.pixelsView.set(imageData.data)
      Atomics.add(this.ctrlView, 0, 1)
    } else {
      const copy = new Uint8ClampedArray(imageData.data)
      this.worker.postMessage(
        {
          type: 'frameBuffer',
          width: imageData.width,
          height: imageData.height,
          buffer: copy.buffer,
        },
        [copy.buffer]
      )
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

  /**
   * Wire native Pointer Events (`setPointerCapture`) on the visible `<canvas>` and forward
   * pixel-accurate mouse/touch/focus events to CheerpX's KMS input layer.
   */
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
        // ignore synthetic/unsupported capture
      }

      // Focus CheerpX's internal keyboard input surface cleanly
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

    const onFullscreenChange = () => {
      const inFs = Boolean(document.fullscreenElement)
      this.state.isFullscreen = inFs
      if (!inFs) {
        this.unlockKeyboard()
      }
      this.emit()
    }

    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointercancel', onPointerUp)
    canvas.addEventListener('contextmenu', onContextMenu)
    document.addEventListener('fullscreenchange', onFullscreenChange)

    this.cleanupDomListeners.push(
      () => canvas.removeEventListener('pointerdown', onPointerDown),
      () => canvas.removeEventListener('pointermove', onPointerMove),
      () => canvas.removeEventListener('pointerup', onPointerUp),
      () => canvas.removeEventListener('pointercancel', onPointerUp),
      () => canvas.removeEventListener('contextmenu', onContextMenu),
      () => document.removeEventListener('fullscreenchange', onFullscreenChange)
    )
  }

  /**
   * Enter fullscreen and engage the Keyboard Lock API so `Alt+Tab`, `Ctrl+W`, and `Super`
   * go straight to Linux instead of switching/closing browser tabs.
   */
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
    this.worker.postMessage({ type: 'dispose' })
    this.worker.terminate()
  }
}
