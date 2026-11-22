import { Eraser, Palette, Save, Trash2 } from 'lucide-react'
import React, { useEffect, useRef, useState } from 'react'
import { kernelClient } from '../../kernel/kernelClient'

const RETRO_PALETTE = [
  '#09090b',
  '#f4f4f5',
  '#22d3ee',
  '#34d399',
  '#fbbf24',
  '#f87171',
  '#60a5fa',
  '#c084fc',
  '#fb7185',
  '#a3e635',
  '#fb923c',
  '#38bdf8',
]

export const StrataPaint93: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [color, setColor] = useState('#22d3ee')
  const [brushSize, setBrushSize] = useState(6)
  const [fileName, setFileName] = useState('/root/artwork-93.png')
  const [statusMsg, setStatusMsg] = useState('StrataPaint 93 Pixel Studio Ready')
  const isDrawingRef = useRef(false)
  const lastPosRef = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#09090b'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Draw starter retro grid emblem
    ctx.strokeStyle = '#22d3ee'
    ctx.lineWidth = 2
    ctx.strokeRect(40, 40, 120, 80)
    ctx.fillStyle = '#34d399'
    ctx.font = '14px monospace'
    ctx.fillText('STRATA PAINT 93', 48, 85)
  }, [])

  const getCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    }
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    isDrawingRef.current = true
    const pos = getCoords(e)
    lastPosRef.current = pos
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(pos.x, pos.y, brushSize / 2, 0, Math.PI * 2)
    ctx.fill()
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx || !lastPosRef.current) return
    const pos = getCoords(e)
    ctx.strokeStyle = color
    ctx.lineWidth = brushSize
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y)
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
    lastPosRef.current = pos
  }

  const handlePointerUp = () => {
    isDrawingRef.current = false
    lastPosRef.current = null
  }

  const clearCanvas = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.fillStyle = '#09090b'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    setStatusMsg('Cleared canvas')
  }

  const savePngToLinuxRoot = async () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'))
    if (!blob) return
    const ab = await blob.arrayBuffer()
    const bytes = new Uint8Array(ab)
    await kernelClient.writeFileBytes(fileName, bytes)
    setStatusMsg(`Saved ${bytes.byteLength} bytes PNG to ${fileName} on Linux ext4 FS`)
  }

  return (
    <div className="flex h-full flex-col bg-[#121215] text-zinc-100 select-none">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-[#1c1c21] px-3 py-2 text-xs">
        <div className="flex items-center gap-1.5">
          <Palette className="h-4 w-4 text-cyan-400 mr-1" />
          {RETRO_PALETTE.map((hex) => (
            <button
              key={hex}
              onClick={() => setColor(hex)}
              style={{ backgroundColor: hex }}
              className={`h-5 w-5 rounded border transition ${
                color === hex ? 'border-white scale-110' : 'border-white/20'
              }`}
              title={hex}
            />
          ))}
          <button
            onClick={() => setColor('#09090b')}
            className="ml-1 inline-flex items-center gap-1 rounded border border-white/10 bg-zinc-900 px-2 py-0.5 text-[11px] text-zinc-300"
          >
            <Eraser className="h-3 w-3" /> Eraser
          </button>
          <input
            type="range"
            min={2}
            max={24}
            value={brushSize}
            onChange={(e) => setBrushSize(Number(e.target.value))}
            className="w-20 accent-cyan-400 ml-2"
            title="Brush size"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={fileName}
            onChange={(e) => setFileName(e.target.value)}
            className="w-44 rounded border border-white/10 bg-[#09090b] px-2 py-1 font-mono text-xs text-zinc-200"
          />
          <button
            id="paint93-save-png-btn"
            onClick={() => void savePngToLinuxRoot()}
            className="inline-flex items-center gap-1 rounded bg-emerald-500 px-2.5 py-1 text-xs font-semibold text-zinc-950 hover:bg-emerald-400"
          >
            <Save className="h-3.5 w-3.5" /> Save .png to /root
          </button>
          <button
            onClick={clearCanvas}
            className="inline-flex items-center gap-1 rounded border border-white/10 bg-zinc-900 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            <Trash2 className="h-3.5 w-3.5" /> Clear
          </button>
        </div>
      </div>

      {/* Drawing Canvas */}
      <div className="flex-1 flex items-center justify-center bg-[#09090b] p-3 overflow-hidden">
        <canvas
          ref={canvasRef}
          width={560}
          height={340}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          className="h-full w-full cursor-crosshair rounded-xl border border-white/10 bg-[#09090b] object-contain"
        />
      </div>

      <div className="flex items-center justify-between border-t border-white/10 bg-[#1c1c21] px-3 py-1 font-mono text-[11px] text-zinc-400">
        <span>{statusMsg}</span>
        <span>Brush: {brushSize}px • Color: {color}</span>
      </div>
    </div>
  )
}
