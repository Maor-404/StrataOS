/**
 * Synthetic Wayland Client & Stress Harness (`src/wayland/syntheticWaylandClient.ts`)
 *
 * Acts as an authentic multi-surface Wayland guest writing directly into the shared
 * `ShmPixelPool` (`wl_shm_pool`) and `CommandRingBuffer`, pacing frames via reverse
 * `EV_FRAME_DONE` (`wl_callback.done`) callbacks and consuming surface-local
 * `wl_pointer` / `wl_keyboard` events from `EventRingBuffer`:
 *
 *  - Surface 1 (zIndex 0, XRGB8888): Desktop wallpaper (uploaded once; 0 B/f idle)
 *  - Surface 2 (zIndex 10, ARGB8888): 60fps Wayland Terminal with tiny dirty-rect
 *    blinking cursor, live log stream, burst stress mode, and real keyboard input
 *  - Surface 3 (zIndex 20, ARGB8888): Premultiplied-alpha draggable interactive
 *    `wl_pointer` Paint & Input Inspector (draws with 20x20px dirty rects)
 */

import {
  EV_FRAME_DONE,
  EV_KEYBOARD_KEY,
  EV_POINTER_AXIS,
  EV_POINTER_BUTTON,
  EV_POINTER_ENTER,
  EV_POINTER_LEAVE,
  EV_POINTER_MOTION,
  EV_SURFACE_FOCUS,
  EV_SURFACE_MOVED,
  SURFACE_FLAG_DRAGGABLE,
  SURFACE_FLAG_OPAQUE,
  SURFACE_FLAG_VISIBLE,
  WL_SHM_FORMAT_ARGB8888,
  WL_SHM_FORMAT_XRGB8888,
  type ShmBufferAllocation,
  type WaylandEvent,
  type WaylandSharedTransport,
} from './shmRing'

export type WaylandStressMode = 'idle' | 'stream' | 'burst'

// Compact crisp 5x7 ASCII bitmap font (32..126) for zero-DOM pixel rasterization into wl_shm
const FONT_5X7: Record<string, readonly number[]> = {
  ' ': [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
  '!': [0x04, 0x04, 0x04, 0x04, 0x04, 0x00, 0x04],
  '"': [0x0a, 0x0a, 0x00, 0x00, 0x00, 0x00, 0x00],
  '#': [0x0a, 0x1f, 0x0a, 0x0a, 0x1f, 0x0a, 0x00],
  '$': [0x04, 0x0f, 0x14, 0x0e, 0x05, 0x1e, 0x04],
  '%': [0x18, 0x19, 0x02, 0x04, 0x08, 0x13, 0x03],
  '&': [0x0c, 0x12, 0x14, 0x08, 0x15, 0x12, 0x0d],
  "'": [0x04, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00],
  '(': [0x02, 0x04, 0x08, 0x08, 0x08, 0x04, 0x02],
  ')': [0x08, 0x04, 0x02, 0x02, 0x02, 0x04, 0x08],
  '*': [0x00, 0x0a, 0x04, 0x1f, 0x04, 0x0a, 0x00],
  '+': [0x00, 0x04, 0x04, 0x1f, 0x04, 0x04, 0x00],
  ',': [0x00, 0x00, 0x00, 0x00, 0x04, 0x04, 0x08],
  '-': [0x00, 0x00, 0x00, 0x1f, 0x00, 0x00, 0x00],
  '.': [0x00, 0x00, 0x00, 0x00, 0x00, 0x0c, 0x0c],
  '/': [0x01, 0x01, 0x02, 0x04, 0x08, 0x10, 0x10],
  '0': [0x0e, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0e],
  '1': [0x04, 0x0c, 0x04, 0x04, 0x04, 0x04, 0x0e],
  '2': [0x0e, 0x11, 0x01, 0x02, 0x04, 0x08, 0x1f],
  '3': [0x1f, 0x02, 0x04, 0x02, 0x01, 0x11, 0x0e],
  '4': [0x02, 0x06, 0x0a, 0x12, 0x1f, 0x02, 0x02],
  '5': [0x1f, 0x10, 0x1e, 0x01, 0x01, 0x11, 0x0e],
  '6': [0x06, 0x08, 0x10, 0x1e, 0x11, 0x11, 0x0e],
  '7': [0x1f, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
  '8': [0x0e, 0x11, 0x11, 0x0e, 0x11, 0x11, 0x0e],
  '9': [0x0e, 0x11, 0x11, 0x0f, 0x01, 0x02, 0x0c],
  ':': [0x00, 0x0c, 0x0c, 0x00, 0x0c, 0x0c, 0x00],
  ';': [0x00, 0x04, 0x04, 0x00, 0x04, 0x04, 0x08],
  '<': [0x02, 0x04, 0x08, 0x10, 0x08, 0x04, 0x02],
  '=': [0x00, 0x00, 0x1f, 0x00, 0x1f, 0x00, 0x00],
  '>': [0x08, 0x04, 0x02, 0x01, 0x02, 0x04, 0x08],
  '?': [0x0e, 0x11, 0x01, 0x02, 0x04, 0x00, 0x04],
  '@': [0x0e, 0x11, 0x17, 0x15, 0x17, 0x10, 0x0e],
  A: [0x0e, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  B: [0x1e, 0x11, 0x11, 0x1e, 0x11, 0x11, 0x1e],
  C: [0x0e, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0e],
  D: [0x1c, 0x12, 0x11, 0x11, 0x11, 0x12, 0x1c],
  E: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x1f],
  F: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x10],
  G: [0x0e, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0f],
  H: [0x11, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  I: [0x0e, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0e],
  J: [0x07, 0x02, 0x02, 0x02, 0x02, 0x12, 0x0c],
  K: [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11],
  L: [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1f],
  M: [0x11, 0x1b, 0x15, 0x15, 0x11, 0x11, 0x11],
  N: [0x11, 0x19, 0x15, 0x13, 0x11, 0x11, 0x11],
  O: [0x0e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  P: [0x1e, 0x11, 0x11, 0x1e, 0x10, 0x10, 0x10],
  Q: [0x0e, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0d],
  R: [0x1e, 0x11, 0x11, 0x1e, 0x14, 0x12, 0x11],
  S: [0x0f, 0x10, 0x10, 0x0e, 0x01, 0x01, 0x1e],
  T: [0x1f, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
  U: [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  V: [0x11, 0x11, 0x11, 0x11, 0x11, 0x0a, 0x04],
  W: [0x11, 0x11, 0x11, 0x15, 0x15, 0x1b, 0x11],
  X: [0x11, 0x11, 0x0a, 0x04, 0x0a, 0x11, 0x11],
  Y: [0x11, 0x11, 0x0a, 0x04, 0x04, 0x04, 0x04],
  Z: [0x1f, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1f],
  '[': [0x0e, 0x08, 0x08, 0x08, 0x08, 0x08, 0x0e],
  '\\': [0x10, 0x10, 0x08, 0x04, 0x02, 0x01, 0x01],
  ']': [0x0e, 0x02, 0x02, 0x02, 0x02, 0x02, 0x0e],
  '^': [0x04, 0x0a, 0x11, 0x00, 0x00, 0x00, 0x00],
  _: [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x1f],
  '`': [0x08, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00],
  a: [0x00, 0x00, 0x0e, 0x01, 0x0f, 0x11, 0x0f],
  b: [0x10, 0x10, 0x1e, 0x11, 0x11, 0x11, 0x1e],
  c: [0x00, 0x00, 0x0e, 0x10, 0x10, 0x11, 0x0e],
  d: [0x01, 0x01, 0x0f, 0x11, 0x11, 0x11, 0x0f],
  e: [0x00, 0x00, 0x0e, 0x11, 0x1f, 0x10, 0x0e],
  f: [0x06, 0x09, 0x08, 0x1c, 0x08, 0x08, 0x08],
  g: [0x00, 0x0f, 0x11, 0x11, 0x0f, 0x01, 0x0e],
  h: [0x10, 0x10, 0x1e, 0x11, 0x11, 0x11, 0x11],
  i: [0x04, 0x00, 0x0c, 0x04, 0x04, 0x04, 0x0e],
  j: [0x02, 0x00, 0x06, 0x02, 0x02, 0x12, 0x0c],
  k: [0x10, 0x10, 0x12, 0x14, 0x18, 0x14, 0x12],
  l: [0x0c, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0e],
  m: [0x00, 0x00, 0x1a, 0x15, 0x15, 0x11, 0x11],
  n: [0x00, 0x00, 0x1e, 0x11, 0x11, 0x11, 0x11],
  o: [0x00, 0x00, 0x0e, 0x11, 0x11, 0x11, 0x0e],
  p: [0x00, 0x00, 0x1e, 0x11, 0x1e, 0x10, 0x10],
  q: [0x00, 0x00, 0x0f, 0x11, 0x0f, 0x01, 0x01],
  r: [0x00, 0x00, 0x16, 0x19, 0x10, 0x10, 0x10],
  s: [0x00, 0x00, 0x0f, 0x10, 0x0e, 0x01, 0x1e],
  t: [0x08, 0x08, 0x1c, 0x08, 0x08, 0x09, 0x06],
  u: [0x00, 0x00, 0x11, 0x11, 0x11, 0x13, 0x0d],
  v: [0x00, 0x00, 0x11, 0x11, 0x11, 0x0a, 0x04],
  w: [0x00, 0x00, 0x11, 0x11, 0x15, 0x15, 0x0a],
  x: [0x00, 0x00, 0x11, 0x0a, 0x04, 0x0a, 0x11],
  y: [0x00, 0x00, 0x11, 0x11, 0x0f, 0x01, 0x0e],
  z: [0x00, 0x00, 0x1f, 0x02, 0x04, 0x08, 0x1f],
  '{': [0x02, 0x04, 0x04, 0x08, 0x04, 0x04, 0x02],
  '|': [0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
  '}': [0x08, 0x04, 0x04, 0x02, 0x04, 0x04, 0x08],
  '~': [0x00, 0x00, 0x08, 0x15, 0x02, 0x00, 0x00],
}

/** Pack straight RGB + alpha (0..255) into Wayland premultiplied little-endian ARGB8888 [B,G,R,A]. */
function packPremulBgra(r: number, g: number, b: number, a = 255): number {
  if (a >= 255) {
    return ((255 << 24) | (r << 16) | (g << 8) | b) >>> 0
  }
  const scale = a / 255
  const pr = Math.round(r * scale) & 0xff
  const pg = Math.round(g * scale) & 0xff
  const pb = Math.round(b * scale) & 0xff
  return ((a << 24) | (pr << 16) | (pg << 8) | pb) >>> 0
}

function fillRectBgra(
  u32: Uint32Array,
  alloc: ShmBufferAllocation,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
  color: number
): void {
  const x0 = Math.max(0, Math.floor(rx))
  const y0 = Math.max(0, Math.floor(ry))
  const x1 = Math.min(alloc.width, Math.ceil(rx + rw))
  const y1 = Math.min(alloc.height, Math.ceil(ry + rh))
  if (x1 <= x0 || y1 <= y0) return

  const strideU32 = alloc.stride >>> 2
  const baseU32 = alloc.offset >>> 2
  for (let y = y0; y < y1; y++) {
    const rowOff = baseU32 + y * strideU32
    u32.fill(color, rowOff + x0, rowOff + x1)
  }
}

function drawTextBgra(
  u32: Uint32Array,
  alloc: ShmBufferAllocation,
  text: string,
  x: number,
  y: number,
  color: number,
  scale = 1
): { width: number; height: number } {
  const strideU32 = alloc.stride >>> 2
  const baseU32 = alloc.offset >>> 2
  const advance = 6 * scale
  let cx = Math.floor(x)
  const cy = Math.floor(y)

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const glyph = FONT_5X7[ch] ?? FONT_5X7[' ']
    for (let row = 0; row < 7; row++) {
      const bits = glyph[row]
      if (!bits) continue
      for (let col = 0; col < 5; col++) {
        if ((bits & (1 << (4 - col))) === 0) continue
        const px = cx + col * scale
        const py = cy + row * scale
        for (let sy = 0; sy < scale; sy++) {
          const yy = py + sy
          if (yy < 0 || yy >= alloc.height) continue
          const rowOff = baseU32 + yy * strideU32
          for (let sx = 0; sx < scale; sx++) {
            const xx = px + sx
            if (xx >= 0 && xx < alloc.width) {
              u32[rowOff + xx] = color
            }
          }
        }
      }
    }
    cx += advance
  }

  return { width: text.length * advance, height: 7 * scale }
}

function drawWindowChrome(
  u32: Uint32Array,
  alloc: ShmBufferAllocation,
  title: string,
  accentColor: number,
  bgColor: number,
  focused: boolean
): void {
  const border = focused ? accentColor : packPremulBgra(56, 68, 86, 240)
  const titleBg = focused
    ? packPremulBgra(22, 29, 40, 245)
    : packPremulBgra(17, 22, 31, 235)

  fillRectBgra(u32, alloc, 0, 0, alloc.width, alloc.height, bgColor)
  fillRectBgra(u32, alloc, 0, 0, alloc.width, 32, titleBg)
  fillRectBgra(u32, alloc, 0, 31, alloc.width, 1, packPremulBgra(48, 59, 76, 255))

  // 1px outer frame border
  fillRectBgra(u32, alloc, 0, 0, alloc.width, 1, border)
  fillRectBgra(u32, alloc, 0, alloc.height - 1, alloc.width, 1, border)
  fillRectBgra(u32, alloc, 0, 0, 1, alloc.height, border)
  fillRectBgra(u32, alloc, alloc.width - 1, 0, 1, alloc.height, border)

  // Window control dots (left decorative / drag indicator)
  fillRectBgra(u32, alloc, 12, 11, 10, 10, packPremulBgra(215, 10, 83, 255))
  fillRectBgra(u32, alloc, 28, 11, 10, 10, packPremulBgra(245, 158, 11, 255))
  fillRectBgra(u32, alloc, 44, 11, 10, 10, packPremulBgra(16, 185, 129, 255))

  drawTextBgra(
    u32,
    alloc,
    title,
    66,
    12,
    focused ? packPremulBgra(235, 242, 250, 255) : packPremulBgra(148, 163, 184, 255),
    1
  )
}

const BRUSH_COLORS = [
  { name: 'Cyan', color: packPremulBgra(56, 189, 248, 255) },
  { name: 'Crimson', color: packPremulBgra(215, 10, 83, 255) },
  { name: 'Emerald', color: packPremulBgra(52, 211, 153, 255) },
  { name: 'Amber', color: packPremulBgra(251, 191, 36, 255) },
  { name: 'Violet', color: packPremulBgra(167, 139, 250, 255) },
]

const SAMPLE_WAYLAND_LOGS = [
  'wl_shm_pool#4.create_buffer(640x380, ARGB8888) -> zero-copy SAB',
  'wl_surface#2.damage_buffer(x=12, y=312, 10x16) -> 0.64 KB upload',
  'xdg_toplevel#3 compositor-side drag -> 0 B GPU texture upload',
  'wl_callback#19.done(vsync) -> paced 16.6ms zero queue buildup',
  'webgpu::queue.writeTexture(subrect) -> partial bgra8unorm patch',
  'wl_pointer.motion(local=214,142) -> hit-tested inside worker',
  'wl_surface#1 wallpaper cached in GPUTexture -> 0 B/frame idle',
  'atomics::notify(cmd_ring_tail) -> lock-free SPSC commit flush',
]

export class SyntheticWaylandClient {
  private readonly transport: WaylandSharedTransport
  private viewportW: number
  private viewportH: number

  private readonly wallpaperId = 1
  private readonly terminalId = 2
  private readonly inspectorId = 3

  private wallpaperBuf: ShmBufferAllocation | null = null
  private terminalBuf: ShmBufferAllocation | null = null
  private inspectorBuf: ShmBufferAllocation | null = null

  private running = false
  private mode: WaylandStressMode = 'stream'
  private rafId: number | null = null

  // Frame-callback pacing flags (true = compositor signaled wl_callback.done)
  private terminalReadyForNext = true
  private inspectorReadyForNext = true

  // Terminal state
  private termFocused = true
  private termLines: string[] = [
    'StrataOS Wayland Surface Renderer (wl_shm + WebGPU)',
    '------------------------------------------------------------',
    'Surface #1: Desktop Wallpaper   [XRGB8888, 0 B/f idle]',
    'Surface #2: Strata Terminal     [ARGB8888, dirty-rect logs]',
    'Surface #3: Pointer Painter     [ARGB8888, alpha=90%, drag]',
    '',
    'Click any titlebar to drag natively at 60fps (0 B upload).',
    'Type here or switch Idle / 60fps Logs / Burst Stress above.',
  ]
  private termInput = ''
  private cursorVisible = true
  private lastBlinkMs = 0
  private lastLogMs = 0
  private logSeq = 0
  private burstTick = 0
  private termNeedsFullRedraw = false
  private termDirtyCursorOnly = false
  private termDirtyPrompt = false

  // Inspector / Paint window state
  private inspFocused = false
  private inspPointerInside = false
  private inspPointerDown = false
  private inspLocalX = 0
  private inspLocalY = 0
  private inspBrushIdx = 0
  private inspBrushRadius = 6
  private inspHeaderDirty = false
  private inspPendingBrushRects: Array<{ x: number; y: number; w: number; h: number }> = []
  private inspNeedsFullRedraw = false

  constructor(
    transport: WaylandSharedTransport,
    viewportW: number,
    viewportH: number,
    initialMode: WaylandStressMode = 'stream'
  ) {
    this.transport = transport
    this.viewportW = Math.max(640, Math.floor(viewportW))
    this.viewportH = Math.max(480, Math.floor(viewportH))
    this.mode = initialMode
  }

  public start(): void {
    if (this.running) return
    this.running = true
    this.initSurfaces()
    this.rafId = window.requestAnimationFrame(this.tick)
  }

  public stop(): void {
    this.running = false
    if (this.rafId !== null) {
      window.cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    this.destroySurfaces()
  }

  public setMode(next: WaylandStressMode): void {
    this.mode = next
    this.appendTermLine(`[mode] switched synthetic harness -> ${next.toUpperCase()}`)
    this.termNeedsFullRedraw = true
  }

  public getMode(): WaylandStressMode {
    return this.mode
  }

  public resizeViewport(w: number, h: number): void {
    const nw = Math.max(640, Math.floor(w))
    const nh = Math.max(480, Math.floor(h))
    if (nw === this.viewportW && nh === this.viewportH) return
    this.viewportW = nw
    this.viewportH = nh
    if (!this.running) return

    if (this.wallpaperBuf) {
      this.transport.shmPool.free(this.wallpaperBuf)
      this.wallpaperBuf = null
    }
    this.allocAndDrawWallpaper()
  }

  public resetWindowLayout(): void {
    if (!this.running) return
    const cmd = this.transport.commandRing
    const termX = Math.max(24, Math.min(72, Math.floor(this.viewportW * 0.05)))
    const termY = Math.max(72, Math.floor(this.viewportH * 0.14))
    const inspX = Math.max(
      termX + 180,
      Math.min(this.viewportW - 464, termX + 668)
    )
    const inspY = Math.max(96, Math.floor(this.viewportH * 0.19))

    cmd.setToplevel(this.terminalId, termX, termY, 10, 'StrataOS Wayland Terminal')
    cmd.setToplevel(this.inspectorId, inspX, inspY, 20, 'wl_pointer Painter (ARGB8888)')
    cmd.commit(this.terminalId)
    cmd.commit(this.inspectorId)
    this.inspNeedsFullRedraw = true
  }

  private initSurfaces(): void {
    const cmd = this.transport.commandRing

    // 1. Desktop Wallpaper Surface (XRGB8888, non-draggable, zIndex 0)
    cmd.createSurface(this.wallpaperId)
    cmd.setSurfaceFlags(
      this.wallpaperId,
      SURFACE_FLAG_VISIBLE | SURFACE_FLAG_OPAQUE
    )
    cmd.setToplevel(this.wallpaperId, 0, 0, 0, 'StrataOS Desktop')
    this.allocAndDrawWallpaper()

    // 2. Wayland Terminal Surface (ARGB8888, draggable, zIndex 10)
    const termX = Math.max(24, Math.min(72, Math.floor(this.viewportW * 0.05)))
    const termY = Math.max(72, Math.floor(this.viewportH * 0.14))
    cmd.createSurface(this.terminalId)
    cmd.setSurfaceFlags(
      this.terminalId,
      SURFACE_FLAG_VISIBLE | SURFACE_FLAG_DRAGGABLE
    )
    cmd.setToplevel(this.terminalId, termX, termY, 10, 'StrataOS Wayland Terminal')
    this.terminalBuf = this.transport.shmPool.alloc(640, 380, WL_SHM_FORMAT_ARGB8888)
    this.renderTerminalFull()
    cmd.attachBuffer(
      this.terminalId,
      this.terminalBuf.offset,
      this.terminalBuf.width,
      this.terminalBuf.height,
      this.terminalBuf.stride,
      this.terminalBuf.format
    )
    cmd.damageBuffer(this.terminalId, 0, 0, this.terminalBuf.width, this.terminalBuf.height)
    cmd.commit(this.terminalId)

    // 3. Premultiplied-Alpha Draggable Interactive Painter / Inspector Surface (zIndex 20)
    const inspX = Math.max(
      termX + 180,
      Math.min(this.viewportW - 464, termX + 668)
    )
    const inspY = Math.max(96, Math.floor(this.viewportH * 0.19))
    cmd.createSurface(this.inspectorId)
    cmd.setSurfaceFlags(
      this.inspectorId,
      SURFACE_FLAG_VISIBLE | SURFACE_FLAG_DRAGGABLE
    )
    cmd.setToplevel(this.inspectorId, inspX, inspY, 20, 'wl_pointer Painter (ARGB8888)')
    this.inspectorBuf = this.transport.shmPool.alloc(440, 320, WL_SHM_FORMAT_ARGB8888)
    this.renderInspectorFull()
    cmd.attachBuffer(
      this.inspectorId,
      this.inspectorBuf.offset,
      this.inspectorBuf.width,
      this.inspectorBuf.height,
      this.inspectorBuf.stride,
      this.inspectorBuf.format
    )
    cmd.damageBuffer(this.inspectorId, 0, 0, this.inspectorBuf.width, this.inspectorBuf.height)
    cmd.commit(this.inspectorId)
  }

  private destroySurfaces(): void {
    const cmd = this.transport.commandRing
    cmd.destroySurface(this.inspectorId)
    cmd.destroySurface(this.terminalId)
    cmd.destroySurface(this.wallpaperId)

    if (this.wallpaperBuf) {
      this.transport.shmPool.free(this.wallpaperBuf)
      this.wallpaperBuf = null
    }
    if (this.terminalBuf) {
      this.transport.shmPool.free(this.terminalBuf)
      this.terminalBuf = null
    }
    if (this.inspectorBuf) {
      this.transport.shmPool.free(this.inspectorBuf)
      this.inspectorBuf = null
    }
  }

  private allocAndDrawWallpaper(): void {
    const w = this.viewportW
    const h = this.viewportH
    const alloc = this.transport.shmPool.alloc(w, h, WL_SHM_FORMAT_XRGB8888)
    this.wallpaperBuf = alloc
    const u32 = this.transport.shmPool.u32
    const strideU32 = alloc.stride >>> 2
    const baseU32 = alloc.offset >>> 2

    // Subtle deep-slate radial gradient + precision 48px Wayland compositor grid
    const cx = w * 0.35
    const cy = h * 0.25
    const maxDist = Math.hypot(w, h) * 0.72
    for (let y = 0; y < h; y++) {
      const rowOff = baseU32 + y * strideU32
      const isGridY = y % 48 === 0
      const dy = y - cy
      for (let x = 0; x < w; x++) {
        const dx = x - cx
        const t = Math.max(0, 1 - Math.hypot(dx, dy) / maxDist)
        let r = 10 + Math.round(t * 18)
        let g = 14 + Math.round(t * 22)
        let b = 21 + Math.round(t * 36)
        if (isGridY || x % 48 === 0) {
          r += 7
          g += 10
          b += 14
        }
        u32[rowOff + x] = ((255 << 24) | (r << 16) | (g << 8) | b) >>> 0
      }
    }

    // Bottom architectural dock/strip inside wallpaper surface (never re-uploaded when idle)
    fillRectBgra(u32, alloc, 0, h - 34, w, 34, packPremulBgra(11, 15, 22, 255))
    fillRectBgra(u32, alloc, 0, h - 34, w, 1, packPremulBgra(34, 44, 60, 255))
    drawTextBgra(
      u32,
      alloc,
      'STRATAOS WAYLAND SURFACE COMPOSITOR  |  WL_SHM + ATOMICS SPSC + WEBGPU DIRTY-RECT BLITTER',
      18,
      h - 21,
      packPremulBgra(125, 145, 170, 255),
      1
    )

    const cmd = this.transport.commandRing
    cmd.attachBuffer(
      this.wallpaperId,
      alloc.offset,
      alloc.width,
      alloc.height,
      alloc.stride,
      alloc.format
    )
    cmd.damageBuffer(this.wallpaperId, 0, 0, alloc.width, alloc.height)
    cmd.commit(this.wallpaperId)
  }

  private renderTerminalFull(): void {
    const alloc = this.terminalBuf
    if (!alloc) return
    const u32 = this.transport.shmPool.u32

    drawWindowChrome(
      u32,
      alloc,
      'STRATAOS WAYLAND TERMINAL (wl_shm ARGB8888)',
      packPremulBgra(56, 189, 248, 255),
      packPremulBgra(12, 16, 23, 248),
      this.termFocused
    )

    const visibleLines = this.termLines.slice(-17)
    for (let i = 0; i < visibleLines.length; i++) {
      const line = visibleLines[i]
      const y = 46 + i * 16
      const color = line.startsWith('[mode]')
        ? packPremulBgra(56, 189, 248, 255)
        : line.startsWith('strata@')
          ? packPremulBgra(244, 114, 182, 255)
          : line.startsWith('  >')
            ? packPremulBgra(52, 211, 153, 255)
            : packPremulBgra(210, 222, 236, 255)
      drawTextBgra(u32, alloc, line.slice(0, 98), 14, y, color, 1)
    }

    this.drawPromptRow(u32, alloc)
  }

  private drawPromptRow(u32: Uint32Array, alloc: ShmBufferAllocation): void {
    const promptY = 342
    fillRectBgra(u32, alloc, 2, promptY - 4, alloc.width - 4, 24, packPremulBgra(12, 16, 23, 248))
    const prefix = 'strata@wayland:~$ '
    drawTextBgra(u32, alloc, prefix, 14, promptY, packPremulBgra(215, 10, 83, 255), 1)
    drawTextBgra(
      u32,
      alloc,
      this.termInput.slice(-64),
      14 + prefix.length * 6,
      promptY,
      packPremulBgra(235, 242, 250, 255),
      1
    )
    this.drawCursorOnly(u32, alloc)
  }

  private getCursorRect(): { x: number; y: number; w: number; h: number } {
    const prefixLen = 'strata@wayland:~$ '.length
    const textLen = Math.min(64, this.termInput.length)
    return {
      x: 14 + (prefixLen + textLen) * 6 + 2,
      y: 340,
      w: 8,
      h: 12,
    }
  }

  private drawCursorOnly(u32: Uint32Array, alloc: ShmBufferAllocation): void {
    const cur = this.getCursorRect()
    fillRectBgra(
      u32,
      alloc,
      cur.x,
      cur.y,
      cur.w,
      cur.h,
      this.cursorVisible
        ? packPremulBgra(215, 10, 83, 255)
        : packPremulBgra(12, 16, 23, 248)
    )
  }

  private renderInspectorFull(): void {
    const alloc = this.inspectorBuf
    if (!alloc) return
    const u32 = this.transport.shmPool.u32

    // Premultiplied translucent dark-glass surface (alpha 228/255 = ~89%)
    drawWindowChrome(
      u32,
      alloc,
      'WL_POINTER PAINTER (ALPHA 89%)',
      packPremulBgra(215, 10, 83, 255),
      packPremulBgra(15, 20, 30, 228),
      this.inspFocused
    )

    // Canvas grid inside inspector
    const padX = 12
    const padY = 66
    const cw = alloc.width - 24
    const ch = alloc.height - 78
    fillRectBgra(u32, alloc, padX, padY, cw, ch, packPremulBgra(9, 13, 20, 235))
    for (let gx = padX; gx < padX + cw; gx += 24) {
      fillRectBgra(u32, alloc, gx, padY, 1, ch, packPremulBgra(24, 32, 46, 220))
    }
    for (let gy = padY; gy < padY + ch; gy += 24) {
      fillRectBgra(u32, alloc, padX, gy, cw, 1, packPremulBgra(24, 32, 46, 220))
    }
    drawTextBgra(
      u32,
      alloc,
      'DRAG TITLEBAR (0 B UPLOAD) OR PAINT HERE (1.6 KB RECT)',
      padX + 10,
      padY + 12,
      packPremulBgra(100, 122, 148, 255),
      1
    )
    drawTextBgra(
      u32,
      alloc,
      'SCROLL WHEEL TO CYCLE BRUSH COLOR',
      padX + 10,
      padY + 26,
      packPremulBgra(78, 98, 122, 255),
      1
    )

    this.drawInspectorHeaderStrip(u32, alloc)
  }

  private drawInspectorHeaderStrip(u32: Uint32Array, alloc: ShmBufferAllocation): void {
    fillRectBgra(u32, alloc, 2, 34, alloc.width - 4, 28, packPremulBgra(16, 22, 32, 238))
    const brush = BRUSH_COLORS[this.inspBrushIdx]
    fillRectBgra(u32, alloc, 12, 42, 12, 12, brush.color)
    const status = this.inspPointerInside
      ? `LOCAL (${this.inspLocalX}, ${this.inspLocalY})  BRUSH: ${brush.name.toUpperCase()}  BTN: ${this.inspPointerDown ? 'DOWN' : 'UP'}`
      : `HOVER TO INSPECT WL_POINTER  |  BRUSH: ${brush.name.toUpperCase()}`
    drawTextBgra(u32, alloc, status, 32, 44, packPremulBgra(203, 213, 225, 255), 1)
  }

  private appendTermLine(line: string): void {
    this.termLines.push(line)
    if (this.termLines.length > 40) {
      this.termLines.splice(0, this.termLines.length - 40)
    }
  }

  private runTermCommand(raw: string): void {
    const cmd = raw.trim()
    this.appendTermLine(`strata@wayland:~$ ${cmd}`)
    if (!cmd) return
    if (cmd === 'help') {
      this.appendTermLine('  > Commands: help | uname | idle | stream | burst | clear')
    } else if (cmd === 'uname' || cmd === 'uname -a') {
      this.appendTermLine('  > Linux strataos 6.12-wayland-shm i386/wasm WebGPU Compositor')
    } else if (cmd === 'idle' || cmd === 'stream' || cmd === 'burst') {
      this.mode = cmd
      this.appendTermLine(`  > Stress mode set to ${cmd.toUpperCase()}`)
    } else if (cmd === 'clear') {
      this.termLines = ['StrataOS Wayland Terminal cleared.']
    } else {
      this.appendTermLine(`  > [wl_keyboard echo] "${cmd}" (${cmd.length} chars)`)
    }
  }

  private handleEvent = (ev: WaylandEvent): void => {
    if (ev.ev === EV_FRAME_DONE) {
      if (ev.surfaceId === this.terminalId) this.terminalReadyForNext = true
      if (ev.surfaceId === this.inspectorId) this.inspectorReadyForNext = true
      return
    }

    if (ev.ev === EV_SURFACE_FOCUS) {
      if (ev.surfaceId === this.terminalId) {
        this.termFocused = ev.focused
        this.termNeedsFullRedraw = true
      } else if (ev.surfaceId === this.inspectorId) {
        this.inspFocused = ev.focused
        this.inspHeaderDirty = true
      }
      return
    }

    if (ev.ev === EV_SURFACE_MOVED) {
      return
    }

    if (ev.surfaceId === this.inspectorId) {
      if (ev.ev === EV_POINTER_ENTER || ev.ev === EV_POINTER_MOTION) {
        this.inspPointerInside = true
        this.inspLocalX = ev.localX
        this.inspLocalY = ev.localY
        this.inspHeaderDirty = true
        if (this.inspPointerDown && ev.localY >= 66) {
          this.stampBrush(ev.localX, ev.localY)
        }
      } else if (ev.ev === EV_POINTER_LEAVE) {
        this.inspPointerInside = false
        this.inspPointerDown = false
        this.inspHeaderDirty = true
      } else if (ev.ev === EV_POINTER_BUTTON) {
        this.inspLocalX = ev.localX
        this.inspLocalY = ev.localY
        if (ev.button === 0) {
          this.inspPointerDown = ev.pressed
          if (ev.pressed && ev.localY >= 66) {
            this.stampBrush(ev.localX, ev.localY)
          }
        }
        this.inspHeaderDirty = true
      } else if (ev.ev === EV_POINTER_AXIS) {
        const dir = ev.deltaY >= 0 ? 1 : -1
        this.inspBrushIdx =
          (this.inspBrushIdx + dir + BRUSH_COLORS.length) % BRUSH_COLORS.length
        this.inspHeaderDirty = true
      }
      return
    }

    if (ev.surfaceId === this.terminalId && ev.ev === EV_KEYBOARD_KEY && ev.pressed) {
      if (ev.keyCode === 13) {
        const line = this.termInput
        this.termInput = ''
        this.runTermCommand(line)
        this.termNeedsFullRedraw = true
      } else if (ev.keyCode === 8) {
        if (this.termInput.length > 0) {
          this.termInput = this.termInput.slice(0, -1)
          this.termDirtyPrompt = true
        }
      } else if (ev.charCode >= 32 && ev.charCode <= 126) {
        this.termInput += String.fromCharCode(ev.charCode)
        this.termDirtyPrompt = true
      }
    }
  }

  private stampBrush(lx: number, ly: number): void {
    const alloc = this.inspectorBuf
    if (!alloc) return
    const r = this.inspBrushRadius
    const bx = Math.max(12, Math.min(alloc.width - 12 - r * 2, Math.floor(lx - r)))
    const by = Math.max(66, Math.min(alloc.height - 12 - r * 2, Math.floor(ly - r)))
    const size = r * 2
    const u32 = this.transport.shmPool.u32
    const color = BRUSH_COLORS[this.inspBrushIdx].color

    // Draw filled circle directly in wl_shm
    const strideU32 = alloc.stride >>> 2
    const baseU32 = alloc.offset >>> 2
    for (let dy = 0; dy < size; dy++) {
      const yy = by + dy
      const ry = dy - r + 0.5
      const rowOff = baseU32 + yy * strideU32
      for (let dx = 0; dx < size; dx++) {
        const rx = dx - r + 0.5
        if (rx * rx + ry * ry <= r * r) {
          u32[rowOff + bx + dx] = color
        }
      }
    }
    this.inspPendingBrushRects.push({ x: bx, y: by, w: size, h: size })
  }

  private tick = (nowMs: number): void => {
    if (!this.running) return

    // Drain reverse SPSC events (FRAME_DONE + wl_pointer + wl_keyboard)
    this.transport.eventRing.drain(this.handleEvent, 256)

    const cmd = this.transport.commandRing
    const u32 = this.transport.shmPool.u32

    // Update Terminal Surface (paced by EV_FRAME_DONE)
    if (this.terminalBuf && this.terminalReadyForNext) {
      const alloc = this.terminalBuf
      let committed = false

      if (this.termNeedsFullRedraw) {
        this.renderTerminalFull()
        cmd.damageBuffer(this.terminalId, 0, 0, alloc.width, alloc.height)
        cmd.commit(this.terminalId, nowMs)
        this.termNeedsFullRedraw = false
        this.termDirtyPrompt = false
        this.termDirtyCursorOnly = false
        committed = true
      } else if (this.termDirtyPrompt) {
        this.drawPromptRow(u32, alloc)
        cmd.damageBuffer(this.terminalId, 2, 336, alloc.width - 4, 28)
        cmd.commit(this.terminalId, nowMs)
        this.termDirtyPrompt = false
        this.termDirtyCursorOnly = false
        committed = true
      } else if (this.mode === 'burst') {
        // Stress mode: clear previous tiles and draw 12 disjoint 20x10 animated tiles in dedicated zone (y=212..320)
        const prevTick = this.burstTick
        this.burstTick++
        const bg = packPremulBgra(12, 16, 23, 248)
        for (let k = 0; k < 12; k++) {
          const ty = 212 + (k % 6) * 18
          if (prevTick > 0) {
            const oldX = 16 + ((k * 49 + prevTick * 4) % (alloc.width - 52))
            fillRectBgra(u32, alloc, oldX, ty, 22, 10, bg)
            cmd.damageBuffer(this.terminalId, oldX, ty, 22, 10)
          }
          const tx = 16 + ((k * 49 + this.burstTick * 4) % (alloc.width - 52))
          const hueColor = BRUSH_COLORS[(k + Math.floor(this.burstTick / 6)) % BRUSH_COLORS.length].color
          fillRectBgra(u32, alloc, tx, ty, 22, 10, hueColor)
          cmd.damageBuffer(this.terminalId, tx, ty, 22, 10)
        }
        cmd.commit(this.terminalId, nowMs)
        committed = true
      } else if (this.mode === 'stream' && nowMs - this.lastLogMs >= 85) {
        // 60fps-paced live streaming log in clean zone (y=192..320), patching ONLY 1 single 14px row!
        this.lastLogMs = nowMs
        const msg = SAMPLE_WAYLAND_LOGS[this.logSeq % SAMPLE_WAYLAND_LOGS.length]
        const rowSlot = this.logSeq % 8
        const rowY = 192 + rowSlot * 16
        const line = `[#${String(this.logSeq).padStart(4, '0')}] ${msg}`
        fillRectBgra(u32, alloc, 12, rowY - 2, alloc.width - 24, 14, packPremulBgra(12, 16, 23, 248))
        drawTextBgra(
          u32,
          alloc,
          line.slice(0, 96),
          14,
          rowY,
          rowSlot % 2 === 0
            ? packPremulBgra(165, 220, 250, 255)
            : packPremulBgra(140, 210, 185, 255),
          1
        )
        cmd.damageBuffer(this.terminalId, 12, rowY - 2, alloc.width - 24, 14)

        // Also animate blinking cursor inside the same commit
        if (nowMs - this.lastBlinkMs >= 420) {
          this.lastBlinkMs = nowMs
          this.cursorVisible = !this.cursorVisible
          this.drawCursorOnly(u32, alloc)
          const cur = this.getCursorRect()
          cmd.damageBuffer(this.terminalId, cur.x, cur.y, cur.w, cur.h)
        }
        cmd.commit(this.terminalId, nowMs)
        this.logSeq++
        committed = true
      } else if (nowMs - this.lastBlinkMs >= 420 || this.termDirtyCursorOnly) {
        // Idle mode: ONLY upload the 8x12 blinking cursor (~384 bytes!)
        this.lastBlinkMs = nowMs
        this.cursorVisible = !this.cursorVisible
        this.drawCursorOnly(u32, alloc)
        const cur = this.getCursorRect()
        cmd.damageBuffer(this.terminalId, cur.x, cur.y, cur.w, cur.h)
        cmd.commit(this.terminalId, nowMs)
        this.termDirtyCursorOnly = false
        committed = true
      }

      if (committed) {
        this.terminalReadyForNext = false
      }
    }

    // Update Inspector / Painter Surface (ONLY when pointer moved/painted — 0 B/f idle!)
    if (this.inspectorBuf && this.inspectorReadyForNext) {
      const alloc = this.inspectorBuf
      let committed = false
      if (this.inspNeedsFullRedraw) {
        this.renderInspectorFull()
        cmd.damageBuffer(this.inspectorId, 0, 0, alloc.width, alloc.height)
        cmd.commit(this.inspectorId, nowMs)
        this.inspNeedsFullRedraw = false
        this.inspHeaderDirty = false
        this.inspPendingBrushRects.length = 0
        committed = true
      } else if (this.inspHeaderDirty || this.inspPendingBrushRects.length > 0) {
        if (this.inspHeaderDirty) {
          this.drawInspectorHeaderStrip(u32, alloc)
          cmd.damageBuffer(this.inspectorId, 2, 34, alloc.width - 4, 28)
          this.inspHeaderDirty = false
        }
        for (let i = 0; i < this.inspPendingBrushRects.length; i++) {
          const r = this.inspPendingBrushRects[i]
          cmd.damageBuffer(this.inspectorId, r.x, r.y, r.w, r.h)
        }
        this.inspPendingBrushRects.length = 0
        cmd.commit(this.inspectorId, nowMs)
        committed = true
      }
      if (committed) {
        this.inspectorReadyForNext = false
      }
    }

    this.rafId = window.requestAnimationFrame(this.tick)
  }
}
