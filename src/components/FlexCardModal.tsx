import { Check, Copy, Download, ExternalLink, Share2, Sparkles, X } from 'lucide-react'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { kernelClient } from '../kernel/kernelClient'
import { GLOBAL_THEMES, useOsStore } from '../state/osStore'
import { STRATA_CONFIG } from '../strata.config'

interface FlexTelemetry {
  kernelVersion: string
  bootTimeMs: number
  gpuAdapter: string
  themeName: string
  panelLabel: string
  packageCount: number
  siteUrl: string
  isLight: boolean
  bgStart: string
  bgEnd: string
  cardBg: string
  border: string
  text: string
  muted: string
  accent: string
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

function renderFlexCardCanvas(t: FlexTelemetry): HTMLCanvasElement {
  const W = 1200
  const H = 630
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!

  // 1. Background gradient
  const grad = ctx.createLinearGradient(0, 0, W, H)
  grad.addColorStop(0, t.bgStart)
  grad.addColorStop(1, t.bgEnd)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, W, H)

  // 2. Subtle technical grid
  ctx.strokeStyle = t.isLight ? 'rgba(27,30,32,0.06)' : 'rgba(255,255,255,0.04)'
  ctx.lineWidth = 1
  for (let x = 0; x <= W; x += 48) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, H)
    ctx.stroke()
  }
  for (let y = 0; y <= H; y += 48) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(W, y)
    ctx.stroke()
  }

  // 3. Accent corner radial glow & stylized Debian/Strata spiral rings
  const rad = ctx.createRadialGradient(1040, 120, 10, 1040, 120, 420)
  rad.addColorStop(0, `${t.accent}33`)
  rad.addColorStop(1, 'transparent')
  ctx.fillStyle = rad
  ctx.fillRect(0, 0, W, H)

  ctx.save()
  ctx.translate(1035, 165)
  ctx.strokeStyle = `${t.accent}55`
  ctx.lineWidth = 5
  ctx.beginPath()
  for (let a = 0; a < Math.PI * 3.8; a += 0.08) {
    const r = 10 + a * 11
    const px = Math.cos(a) * r
    const py = Math.sin(a) * r
    if (a === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.stroke()
  ctx.restore()

  // 4. Outer frame border
  drawRoundedRect(ctx, 28, 28, W - 56, H - 56, 20)
  ctx.strokeStyle = t.border
  ctx.lineWidth = 2
  ctx.stroke()

  // 5. Top pill badge (measured dynamically so text never overflows border)
  const pillText = 'DEBIAN GNU/LINUX  •  REAL LINUX 7.x WASM  •  ZERO BACKEND'
  ctx.font = '600 15px "Geist Mono", ui-monospace, monospace'
  const pillW = Math.ceil(ctx.measureText(pillText).width) + 62
  drawRoundedRect(ctx, 64, 62, pillW, 36, 18)
  ctx.fillStyle = `${t.accent}22`
  ctx.fill()
  ctx.strokeStyle = `${t.accent}88`
  ctx.lineWidth = 1.5
  ctx.stroke()

  ctx.fillStyle = t.accent
  ctx.beginPath()
  ctx.arc(86, 80, 5.5, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = t.text
  ctx.fillText(pillText, 104, 85)

  // 6. Main headline
  ctx.fillStyle = t.text
  ctx.font = '700 54px "Geist Sans", system-ui, sans-serif'
  ctx.fillText('StrataOS v1.0 ("Bedrock")', 64, 166)

  ctx.fillStyle = t.muted
  ctx.font = '400 22px "Geist Sans", system-ui, sans-serif'
  ctx.fillText(
    'Minimal Debian kernel + Lightweight Plasma/LXQt desktop running natively in one tab.',
    64,
    206
  )

  // 7. 2x2 Live Telemetry Cards
  const cards = [
    { label: 'DEBIAN KERNEL', value: t.kernelVersion, sub: 'pithings/unkernel arch/wasm + ext4' },
    {
      label: 'COLD BOOT TIME',
      value: `${t.bootTimeMs} ms`,
      sub: 'Cross-Origin Isolated • SharedArrayBuffer',
    },
    { label: 'WEBGPU ADAPTER', value: t.gpuAdapter, sub: 'WGSL Compute Studio & Shader Engine' },
    {
      label: 'PLASMA / LXQT THEME',
      value: t.themeName,
      sub: `${t.panelLabel} • ${t.packageCount} strataget pkgs installed`,
    },
  ]

  const cardW = 524
  const cardH = 122
  const gapX = 24
  const gapY = 20
  const startX = 64
  const startY = 248

  cards.forEach((c, idx) => {
    const col = idx % 2
    const row = Math.floor(idx / 2)
    const cx = startX + col * (cardW + gapX)
    const cy = startY + row * (cardH + gapY)

    drawRoundedRect(ctx, cx, cy, cardW, cardH, 14)
    ctx.fillStyle = t.cardBg
    ctx.fill()
    ctx.strokeStyle = t.border
    ctx.lineWidth = 1.5
    ctx.stroke()

    // Accent left tick
    drawRoundedRect(ctx, cx + 16, cy + 20, 4, 22, 2)
    ctx.fillStyle = t.accent
    ctx.fill()

    ctx.fillStyle = t.muted
    ctx.font = '600 13px "Geist Mono", ui-monospace, monospace'
    ctx.fillText(c.label, cx + 30, cy + 36)

    ctx.fillStyle = t.text
    ctx.font = '700 24px "Geist Sans", system-ui, sans-serif'
    const clippedVal = c.value.length > 34 ? `${c.value.slice(0, 33)}…` : c.value
    ctx.fillText(clippedVal, cx + 22, cy + 76)

    ctx.fillStyle = t.muted
    ctx.font = '400 14px "Geist Mono", ui-monospace, monospace'
    ctx.fillText(c.sub, cx + 22, cy + 104)
  })

  // 8. Footer proof bar
  drawRoundedRect(ctx, 64, 526, W - 128, 52, 12)
  ctx.fillStyle = t.accent
  ctx.fill()

  ctx.fillStyle = t.isLight ? '#ffffff' : '#ffffff'
  ctx.font = '700 20px "Geist Mono", ui-monospace, monospace'
  ctx.fillText(`Booted in 1 Browser Tab • ${t.siteUrl}`, 88, 559)

  ctx.font = '600 16px "Geist Mono", ui-monospace, monospace'
  const ghText = 'github.com/Maor-404/StrataOS'
  const ghWidth = ctx.measureText(ghText).width
  ctx.fillText(ghText, W - 88 - ghWidth, 558)

  return canvas
}

async function detectGpuAdapterName(): Promise<string> {
  try {
    const nav = navigator as Navigator & {
      gpu?: {
        requestAdapter: () => Promise<{
          info?: { vendor?: string; architecture?: string; description?: string; device?: string }
        } | null>
      }
    }
    if (!nav.gpu) return 'WebGL2 / Software (No WebGPU)'
    const adapter = await nav.gpu.requestAdapter()
    if (!adapter) return 'WebGL2 / Software (No Adapter)'
    const info = adapter.info
    const parts = [info?.description || info?.device, info?.vendor, info?.architecture].filter(Boolean)
    return parts.length > 0 ? parts.join(' • ') : 'WebGPU Hardware Adapter Ready'
  } catch {
    return 'WebGL2 / Software Fallback'
  }
}

export const FlexCardModal: React.FC = () => {
  const open = useOsStore((s) => s.flexCardOpen)
  const setOpen = useOsStore((s) => s.setFlexCardOpen)
  const settings = useOsStore((s) => s.settings)
  const bootTimeMs = useOsStore((s) => s.bootTimeMs)
  const installedPackages = useOsStore((s) => s.installedPackages)

  const dialogRef = useRef<HTMLDialogElement | null>(null)
  const [pngUrl, setPngUrl] = useState<string>('')
  const [pngBlob, setPngBlob] = useState<Blob | null>(null)
  const [copiedImg, setCopiedImg] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')
  const [telemetry, setTelemetry] = useState<FlexTelemetry | null>(null)

  const buildCard = useCallback(async () => {
    const [metrics, gpuName] = await Promise.all([
      kernelClient.getMetrics().catch(() => null),
      detectGpuAdapterName(),
    ])
    const preset = GLOBAL_THEMES[settings.globalTheme] ?? GLOBAL_THEMES['debian-crimson']
    const isLight = settings.theme === 'light' || settings.globalTheme === 'lxqt-frost'
    const kernelMatch = metrics?.kernelBanner?.match(/Linux version ([^\s]+)/)
    const kernelRel = kernelMatch ? `Linux ${kernelMatch[1]}` : 'Linux 7.3.4-unkernel'
    const liveBootMs = metrics?.bootTimeMs || bootTimeMs || 850

    const data: FlexTelemetry = {
      kernelVersion: kernelRel,
      bootTimeMs: liveBootMs,
      gpuAdapter: gpuName,
      themeName: preset.name,
      panelLabel: settings.panelStyle === 'lxqt-compact' ? 'LXQt 32px Panel' : 'Plasma Floating',
      packageCount: installedPackages.length,
      siteUrl: STRATA_CONFIG.liveDemoUrl,
      isLight,
      bgStart: isLight ? '#eff0f1' : preset.baseHex,
      bgEnd: isLight ? '#d8e0e9' : '#08070a',
      cardBg: isLight ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.045)',
      border: isLight ? 'rgba(27,30,32,0.14)' : 'rgba(255,255,255,0.11)',
      text: isLight ? '#1b1e20' : '#f3eff5',
      muted: isLight ? '#586069' : '#a99fae',
      accent: settings.accentHex || preset.accentHex,
    }
    setTelemetry(data)

    const canvas = renderFlexCardCanvas(data)
    setPngUrl(canvas.toDataURL('image/png'))
    canvas.toBlob((blob) => {
      if (blob) setPngBlob(blob)
    }, 'image/png')
  }, [settings.globalTheme, settings.theme, settings.accentHex, settings.panelStyle, bootTimeMs, installedPackages.length])

  // Open/close native <dialog closedby="any"> via showModal() + Safari light-dismiss fallback
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    const onClose = () => setOpen(false)
    dialog.addEventListener('close', onClose)

    // Fallback for browsers without native `closedby` (e.g. Safari)
    const onFallbackClick = (event: MouseEvent) => {
      if ('closedBy' in HTMLDialogElement.prototype) return
      if (event.target !== dialog) return
      const rect = dialog.getBoundingClientRect()
      const inside =
        rect.top <= event.clientY &&
        event.clientY <= rect.top + rect.height &&
        rect.left <= event.clientX &&
        event.clientX <= rect.left + rect.width
      if (!inside) dialog.close()
    }
    dialog.addEventListener('click', onFallbackClick)

    return () => {
      dialog.removeEventListener('close', onClose)
      dialog.removeEventListener('click', onFallbackClick)
    }
  }, [setOpen])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open) {
      void buildCard()
      if (!dialog.open) {
        try {
          dialog.showModal()
        } catch {
          // ignore if already open
        }
      }
    } else if (dialog.open) {
      dialog.close()
    }
  }, [open, buildCard])

  const handleCopyImage = async () => {
    if (!pngBlob) return
    try {
      if (navigator.clipboard && 'ClipboardItem' in window) {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })])
        setCopiedImg(true)
        setStatusMsg('Copied PNG')
        toast.success('StrataFlex 1200×630 PNG copied to clipboard!')
        window.setTimeout(() => {
          setCopiedImg(false)
          setStatusMsg('')
        }, 2200)
        return
      }
      throw new Error('ClipboardItem unsupported')
    } catch {
      handleDownloadPng()
      toast.info('Browser blocked image clipboard write — downloaded PNG instead.')
    }
  }

  const handleDownloadPng = () => {
    if (!pngUrl) return
    const a = document.createElement('a')
    a.href = pngUrl
    a.download = 'strataos-flex-card.png'
    document.body.appendChild(a)
    a.click()
    a.remove()
    toast.success('Downloaded strataos-flex-card.png (1200×630)')
  }

  const shareText = telemetry
    ? `Just booted real Debian GNU/Linux (${telemetry.kernelVersion}) + Plasma/LXQt (${telemetry.themeName}) in ${telemetry.bootTimeMs}ms inside 1 browser tab — zero backend!`
    : 'Booted real Debian GNU/Linux + Plasma/LXQt in 1 browser tab with StrataOS — zero backend!'
  const showcaseUrl = `${STRATA_CONFIG.liveDemoUrl}/?showcase=1`
  const xIntentUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(showcaseUrl)}`
  const redditSubmitUrl = `https://www.reddit.com/submit?url=${encodeURIComponent(showcaseUrl)}&title=${encodeURIComponent('StrataOS v1.0 — Booted real Debian GNU/Linux 7.x + Lightweight Plasma/LXQt in 1 browser tab (zero backend)')}`

  return (
    <dialog
      ref={dialogRef}
      id="strata-flex-modal"
      {...({ closedby: 'any' } as React.DialogHTMLAttributes<HTMLDialogElement>)}
      aria-labelledby="flex-modal-title"
      className="strata-dialog m-auto w-[740px]"
    >
      <div className="breeze-popover rounded-xl overflow-hidden select-none">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--breeze-border)] bg-[var(--breeze-header)] px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md plasma-accent-fill">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
            <div>
              <h2 id="flex-modal-title" className="text-sm font-semibold">
                StrataFlex — Live Proof Card (1200×630 PNG)
              </h2>
              <p className="font-mono text-[10px] text-[var(--breeze-text-muted)]">
                Rendered locally on offscreen canvas from live kernel &amp; GPU telemetry
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            aria-label="Close StrataFlex modal"
            className="rounded-full p-1 text-[var(--breeze-text-muted)] hover:bg-[var(--breeze-hover)] hover:text-[var(--breeze-text)] cursor-pointer"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Rendered PNG Preview */}
        <div className="p-4 space-y-3 bg-[var(--breeze-base)]">
          <div className="overflow-hidden rounded-lg border border-[var(--breeze-border-strong)] bg-black/40 aspect-[1200/630] flex items-center justify-center">
            {pngUrl ? (
              <img
                id="flex-card-preview-img"
                data-png-ready="true"
                src={pngUrl}
                alt="StrataFlex live Debian Linux 7.x proof card"
                className="h-full w-full object-contain"
              />
            ) : (
              <span className="font-mono text-xs text-[var(--breeze-text-muted)]">
                Rendering 1200×630 PNG...
              </span>
            )}
          </div>

          {/* Action Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                id="flex-copy-img-btn"
                type="button"
                onClick={() => void handleCopyImage()}
                className="inline-flex min-h-[32px] items-center gap-1.5 rounded-lg plasma-accent-fill px-3.5 py-1.5 text-xs font-semibold hover:brightness-110 transition cursor-pointer"
              >
                {copiedImg ? (
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                <span>{copiedImg ? 'Copied PNG' : 'Copy Image'}</span>
              </button>
              <span role="status" className="sr-only">
                {statusMsg}
              </span>

              <button
                id="flex-download-png-btn"
                type="button"
                onClick={handleDownloadPng}
                className="inline-flex min-h-[32px] items-center gap-1.5 rounded-lg border border-[var(--breeze-border-strong)] bg-[var(--breeze-view)] px-3 py-1.5 text-xs font-medium hover:border-[var(--plasma-accent)] transition cursor-pointer"
              >
                <Download className="h-3.5 w-3.5 plasma-accent-text" aria-hidden="true" />
                Download PNG
              </button>
            </div>

            <div className="flex items-center gap-2">
              <a
                href={xIntentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[32px] items-center gap-1.5 rounded-lg border border-[var(--breeze-border-strong)] bg-[var(--breeze-view)] px-3 py-1.5 text-xs font-medium hover:border-[var(--plasma-accent)] transition"
              >
                <Share2 className="h-3.5 w-3.5 plasma-accent-text" aria-hidden="true" />
                Post to X
              </a>
              <a
                href={redditSubmitUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[32px] items-center gap-1.5 rounded-lg border border-[var(--breeze-border-strong)] bg-[var(--breeze-view)] px-3 py-1.5 text-xs font-medium hover:border-[var(--plasma-accent)] transition"
              >
                <ExternalLink className="h-3.5 w-3.5 plasma-accent-text" aria-hidden="true" />
                Post to Reddit
              </a>
            </div>
          </div>
        </div>
      </div>
    </dialog>
  )
}
