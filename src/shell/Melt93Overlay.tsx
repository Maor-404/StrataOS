import React, { useEffect, useRef } from 'react'
import { useOsStore } from '../state/osStore'

export const Melt93Overlay: React.FC = () => {
  const active = useOsStore((s) => s.melt93Active)
  const setActive = useOsStore((s) => s.setMelt93Active)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    if (!active) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setActive(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [active, setActive])

  useEffect(() => {
    if (!active) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const cols = 120
    const offsets = new Float32Array(cols).fill(0)
    let animId = 0

    const loop = () => {
      const w = canvas.width
      const h = canvas.height
      const colW = w / cols

      ctx.fillStyle = 'rgba(9, 9, 11, 0.08)'
      ctx.fillRect(0, 0, w, h)

      for (let i = 0; i < cols; i++) {
        offsets[i] = (offsets[i] + Math.random() * 6 + 1) % h
        const x = i * colW
        const y = offsets[i]
        ctx.fillStyle = i % 3 === 0 ? 'rgba(34, 211, 238, 0.45)' : 'rgba(52, 211, 153, 0.35)'
        ctx.fillRect(x, y, colW - 1, 18)
      }

      animId = requestAnimationFrame(loop)
    }

    animId = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(animId)
  }, [active])

  if (!active) return null

  return (
    <div
      onClick={() => setActive(false)}
      className="fixed inset-0 z-[9800] cursor-pointer overflow-hidden select-none"
    >
      <canvas ref={canvasRef} width={640} height={360} className="h-full w-full object-cover" />
      <div className="fixed top-12 left-1/2 -translate-x-1/2 rounded-xl border border-amber-500/40 bg-[#121215]/95 px-4 py-2 font-mono text-xs text-amber-300 shadow-2xl">
        [MELT93 CRT GLITCH ACTIVE] Press <kbd className="font-bold text-white">ESC</kbd> or Click Anywhere for Panic Exit
      </div>
    </div>
  )
}
