import React, { useCallback, useEffect, useState } from 'react'
import { Toaster } from 'sonner'
import { StrataUEFI } from './shell/StrataUEFI'
import { useOsStore } from './state/osStore'
import { RealDebianDesktop } from './vm/RealDebianDesktop'
import { WaylandViewport } from './wayland/WaylandViewport'

function isWaylandLabLocation(): boolean {
  if (typeof window === 'undefined') return false
  const path = window.location.pathname.replace(/\/+$/, '')
  if (path === '/wayland-lab') return true
  const params = new URLSearchParams(window.location.search)
  return params.get('wayland-demo') === '1'
}

export const App: React.FC = () => {
  const bootPhase = useOsStore((s) => s.bootPhase)
  const setBootPhase = useOsStore((s) => s.setBootPhase)
  const hydratePreferences = useOsStore((s) => s.hydratePreferences)

  const [inWaylandLab, setInWaylandLab] = useState<boolean>(() =>
    isWaylandLabLocation()
  )

  useEffect(() => {
    void hydratePreferences()
    document.documentElement.setAttribute('data-theme', 'dark')
    ;(window as unknown as Record<string, unknown>).__strata = {
      useOsStore,
    }

    const onPopState = () => {
      setInWaylandLab(isWaylandLabLocation())
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [hydratePreferences])

  const handleOpenWaylandLab = useCallback(() => {
    window.history.pushState({}, '', '/wayland-lab')
    setInWaylandLab(true)
  }, [])

  const handleExitWaylandLab = useCallback(() => {
    window.history.pushState({}, '', '/')
    setInWaylandLab(false)
    setBootPhase('desktop')
  }, [setBootPhase])

  const handleOpenUefiFromWayland = useCallback(() => {
    window.history.pushState({}, '', '/?boot=uefi')
    setInWaylandLab(false)
    setBootPhase('uefi-setup')
  }, [setBootPhase])

  return (
    <main
      id="strata-os-root"
      className="relative h-screen w-screen overflow-hidden bg-[#0d1117] text-zinc-100 select-none"
    >
      <h1 className="sr-only">
        StrataOS — Real Debian 12 Bookworm (LXQt-panel + Openbox) X11 Virtual
        Machine & Low-Latency Wayland WebGPU Compositor
      </h1>

      <Toaster
        theme="dark"
        position="bottom-right"
        richColors
        toastOptions={{
          style: {
            background: '#161b22',
            border: '1px solid rgba(255,255,255,0.12)',
            color: '#e6edf3',
          },
        }}
      />

      {inWaylandLab ? (
        <WaylandViewport
          autoStartDemo
          onExitLab={handleExitWaylandLab}
          onOpenUefi={handleOpenUefiFromWayland}
        />
      ) : (
        <>
          {/* Optional StrataUEFI Firmware Utility & Lightweight unkernel CLI Recovery (?boot=uefi / ?boot=tty / F2) */}
          <StrataUEFI />

          {/* Default Boot Target: Real Debian 12 Bookworm + Openbox + LXQt-panel X11 VM */}
          {bootPhase === 'desktop' && (
            <RealDebianDesktop onOpenWaylandLab={handleOpenWaylandLab} />
          )}
        </>
      )}
    </main>
  )
}

export default App
