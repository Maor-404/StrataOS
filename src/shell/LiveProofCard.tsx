import { Award, CheckCircle2, Package, RefreshCw, Shield, Sparkles, Terminal, X } from 'lucide-react'
import React, { useState } from 'react'
import { toast } from 'sonner'
import { kernelClient } from '../kernel/kernelClient'
import { useOsStore } from '../state/osStore'

export const LiveProofCard: React.FC = () => {
  const bootPhase = useOsStore((s) => s.bootPhase)
  const dismissed = useOsStore((s) => s.proofCardDismissed)
  const dismissProofCard = useOsStore((s) => s.dismissProofCard)
  const kernelStatus = useOsStore((s) => s.kernelStatus)
  const installedPackages = useOsStore((s) => s.installedPackages)
  const openApp = useOsStore((s) => s.openApp)
  const setBootPhase = useOsStore((s) => s.setBootPhase)
  const setFlexCardOpen = useOsStore((s) => s.setFlexCardOpen)
  const editMode = useOsStore((s) => s.editMode)
  const panelPosition = useOsStore((s) => s.settings.panelPosition)

  const [checkedKernel, setCheckedKernel] = useState(false)
  const [installing, setInstalling] = useState(false)

  const isShowcase =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('showcase') === '1'

  if (bootPhase !== 'desktop' || dismissed || editMode || isShowcase) return null

  const hasPixelSynth = installedPackages.some((p) => p.id === 'pixelsynth')

  const handleStep1Kernel = () => {
    setCheckedKernel(true)
    openApp('terminal')
    setTimeout(() => {
      kernelClient.sendCommandToTerminal('stratafetch')
    }, 140)
    toast.success('Running stratafetch on Debian GNU/Linux 7.3')
  }

  const handleStep2Install = async () => {
    if (hasPixelSynth) {
      openApp('wasm:pixelsynth', { title: 'PixelSynth v1.0.0', icon: 'Sparkles' })
      return
    }
    setInstalling(true)
    try {
      const rec = await kernelClient.installPackage('pixelsynth')
      toast.success(`Installed ${rec.name} into /opt/strata/apps/pixelsynth`)
      openApp('wasm:pixelsynth', { title: `${rec.name} v${rec.version}`, icon: rec.icon })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Install failed')
    } finally {
      setInstalling(false)
    }
  }

  const handleStep3Reload = async () => {
    toast.info('Syncing ext4 disk to IndexedDB before reload...')
    try {
      await kernelClient.syncDisk()
    } catch {
      // ignore
    }
    window.location.reload()
  }

  return (
    <aside
      id="live-proof-card"
      aria-label="3-Click Live Proof"
      style={{
        top: panelPosition === 'top' ? '56px' : '16px',
      }}
      className="breeze-popover plasma-panel-blur fixed right-4 z-[7000] w-[320px] max-w-[calc(100vw-24px)] rounded-xl p-3.5 text-xs select-none"
    >
      <div className="flex items-start justify-between gap-2 border-b border-[var(--breeze-border)] pb-2">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md plasma-accent-fill">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
          <div>
            <div className="font-semibold text-[var(--breeze-text)]">
              3-Click Live Proof
            </div>
            <div className="font-mono text-[10px] text-[var(--breeze-text-muted)]">
              Debian 7.x + Plasma/LXQt • Zero Backend
            </div>
          </div>
        </div>
        <button
          id="dismiss-proof-card-btn"
          type="button"
          onClick={dismissProofCard}
          title="Dismiss permanently"
          aria-label="Dismiss 3-Click Live Proof card"
          className="rounded-md p-1 text-[var(--breeze-text-muted)] hover:bg-[var(--breeze-hover)] hover:text-[var(--breeze-text)] cursor-pointer"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      <ol className="mt-2.5 space-y-2">
        <li>
          <button
            type="button"
            onClick={handleStep1Kernel}
            className="flex w-full items-center gap-2.5 rounded-lg border border-[var(--breeze-border)] bg-[var(--breeze-base)]/80 px-2.5 py-2 text-left hover:border-[var(--plasma-accent)] transition duration-120 cursor-pointer"
          >
            {checkedKernel || kernelStatus === 'online' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
            ) : (
              <Terminal className="h-4 w-4 shrink-0 plasma-accent-text" aria-hidden="true" />
            )}
            <div className="min-w-0 flex-1">
              <div className="font-medium text-[var(--breeze-text)]">
                1. Run Debian stratafetch
              </div>
              <div className="truncate font-mono text-[10px] text-[var(--breeze-text-muted)]">
                stratafetch (live Linux 7.3 telemetry)
              </div>
            </div>
          </button>
        </li>

        <li>
          <button
            type="button"
            onClick={() => void handleStep2Install()}
            disabled={installing}
            className="flex w-full items-center gap-2.5 rounded-lg border border-[var(--breeze-border)] bg-[var(--breeze-base)]/80 px-2.5 py-2 text-left hover:border-[var(--plasma-accent)] disabled:opacity-60 transition duration-120 cursor-pointer"
          >
            {hasPixelSynth ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
            ) : (
              <Package className="h-4 w-4 shrink-0 plasma-accent-text" aria-hidden="true" />
            )}
            <div className="min-w-0 flex-1">
              <div className="font-medium text-[var(--breeze-text)]">
                2. {hasPixelSynth ? 'Launch PixelSynth (Installed)' : installing ? 'Installing PixelSynth...' : 'Install WASM App via strataget'}
              </div>
              <div className="truncate font-mono text-[10px] text-[var(--breeze-text-muted)]">
                strataget install pixelsynth
              </div>
            </div>
          </button>
        </li>

        <li className="flex gap-1.5">
          <button
            type="button"
            onClick={() => void handleStep3Reload()}
            className="flex flex-1 items-center gap-2 rounded-lg border border-[var(--breeze-border)] bg-[var(--breeze-base)]/80 px-2.5 py-2 text-left hover:border-[var(--plasma-accent)] transition duration-120 cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5 shrink-0 plasma-accent-text" aria-hidden="true" />
            <div className="min-w-0">
              <div className="font-medium text-[var(--breeze-text)]">3. Hard-Refresh Proof</div>
              <div className="truncate font-mono text-[10px] text-[var(--breeze-text-muted)]">
                Survives reload on ext4
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setBootPhase('uefi-setup')}
            title="Inspect StrataUEFI Firmware"
            className="flex flex-col items-center justify-center rounded-lg border border-[var(--breeze-border)] bg-[var(--breeze-base)]/80 px-2.5 py-1.5 text-[10px] font-mono text-[var(--breeze-text-muted)] hover:border-[var(--plasma-accent)] hover:text-[var(--breeze-text)] transition duration-120 cursor-pointer"
          >
            <Shield className="h-3.5 w-3.5 plasma-accent-text mb-0.5" aria-hidden="true" />
            UEFI
          </button>
        </li>
      </ol>

      {/* 1-Click StrataFlex Proof Card CTA */}
      <button
        id="proof-open-flex-btn"
        type="button"
        onClick={() => setFlexCardOpen(true)}
        className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg plasma-accent-fill py-1.5 text-xs font-semibold hover:brightness-110 transition duration-120 cursor-pointer"
      >
        <Award className="h-3.5 w-3.5" aria-hidden="true" />
        Export StrataFlex Proof Card (PNG)
      </button>
    </aside>
  )
}
