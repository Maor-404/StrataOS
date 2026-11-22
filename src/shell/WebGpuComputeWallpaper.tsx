import React, { useEffect, useRef } from 'react'
import { useOsStore } from '../state/osStore'

export const WebGpuComputeWallpaper: React.FC = () => {
  const enabled = useOsStore((s) => s.settings.webgpuWallpaperEnabled)
  const wallpaper = useOsStore((s) => s.settings.wallpaper)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  const shouldRender = enabled || wallpaper === 'webgpu-compute'

  useEffect(() => {
    if (!shouldRender) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animId = 0
    let t = 0

    const render = () => {
      t += 0.014
      const w = canvas.width
      const h = canvas.height
      const img = ctx.createImageData(w, h)
      const data = img.data

      for (let y = 0; y < h; y++) {
        const ny = y / h - 0.5
        for (let x = 0; x < w; x++) {
          const nx = x / w - 0.5
          const v1 = Math.sin(nx * 7.0 + t)
          const v2 = Math.cos(ny * 7.0 - t * 0.8)
          const v3 = Math.sin((nx + ny) * 5.0 + t * 0.5)
          const intensity = (v1 + v2 + v3 + 3) / 6

          const idx = (y * w + x) * 4
          data[idx] = Math.round(9 + intensity * 14)
          data[idx + 1] = Math.round(12 + intensity * 38)
          data[idx + 2] = Math.round(18 + intensity * 54)
          data[idx + 3] = 255
        }
      }

      ctx.putImageData(img, 0, 0)
      animId = requestAnimationFrame(render)
    }

    animId = requestAnimationFrame(render)
    return () => cancelAnimationFrame(animId)
  }, [shouldRender])

  if (!shouldRender) return null

  return (
    <canvas
      ref={canvasRef}
      width={160}
      height={90}
      className="pointer-events-none fixed inset-0 z-0 h-full w-full object-cover opacity-85"
    />
  )
}
