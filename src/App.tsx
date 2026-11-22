import React, { useEffect } from 'react'
import { Toaster } from 'sonner'
import { StrataUEFI } from './shell/StrataUEFI'
import { useOsStore } from './state/osStore'
import { RealDebianDesktop } from './vm/RealDebianDesktop'

export const App: React.FC = () => {
  const bootPhase = useOsStore((s) => s.bootPhase)
  const hydratePreferences = useOsStore((s) => s.hydratePreferences)

  useEffect(() => {
    void hydratePreferences()
    document.documentElement.setAttribute('data-theme', 'dark')
    ;(window as unknown as Record<string, unknown>).__strata = {
      useOsStore,
    }
  }, [hydratePreferences])

  return (
    <main
      id="strata-os-root"
      className="relative h-screen w-screen overflow-hidden bg-[#0d1117] text-zinc-100 select-none"
    >
      <h1 className="sr-only">
        StrataOS — Real Debian 12 Bookworm (LXQt-panel + Openbox) X11 Virtual
        Machine in One Browser Tab
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

      {/* Optional StrataUEFI Firmware Utility & Lightweight unkernel CLI Recovery (?boot=uefi / ?boot=tty / F2) */}
      <StrataUEFI />

      {/* Default Boot Target: Real Debian 12 Bookworm + Openbox + LXQt-panel X11 VM */}
      {bootPhase === 'desktop' && <RealDebianDesktop />}
    </main>
  )
}

export default App
