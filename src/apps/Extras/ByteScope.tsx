import { Pause, Play, Save, Sliders, Volume2 } from 'lucide-react'
import React, { useEffect, useRef, useState } from 'react'
import { kernelClient } from '../../kernel/kernelClient'

const BYTEBEAT_PRESETS = [
  {
    name: 'Viznut Classic 8-bit',
    formula: '(t * (t >> 5 | t >> 8)) >> (t >> 16)',
    sampleRate: 8000,
  },
  {
    name: 'Sierpinski Melody',
    formula: '(t * 5 & t >> 7) | (t * 3 & t >> 10)',
    sampleRate: 8000,
  },
  {
    name: 'Cyberpunk Arpeggio',
    formula: '((t * (t >> 8 | t >> 9) & 46 & t >> 8)) ^ (t & t >> 13 | t >> 6)',
    sampleRate: 11025,
  },
  {
    name: 'Harmonic Chiptune',
    formula: '(t * 9 & t >> 4) | (t * 5 & t >> 7) | (t * 3 & t / 1024) - 1',
    sampleRate: 8000,
  },
]

function evalBytebeatSample(formula: string, t: number): number {
  try {
    // Evaluate pure integer bitwise bytebeat expression
    const fn = new Function('t', 'Math', `return (${formula}) & 255;`)
    const val = Number(fn(t, Math))
    return Number.isFinite(val) ? val & 255 : 128
  } catch {
    return ((t * ((t >> 5) | (t >> 8))) >> (t >> 16)) & 255
  }
}

export const ByteScope: React.FC = () => {
  const [formula, setFormula] = useState(BYTEBEAT_PRESETS[0].formula)
  const [sampleRate, setSampleRate] = useState(8000)
  const [playing, setPlaying] = useState(false)
  const [volume, setVolume] = useState(0.25)
  const [statusMsg, setStatusMsg] = useState('ByteScope X-Y Lissajous Oscilloscope Ready')

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const tickRef = useRef<number>(0)

  // Real-time Oscilloscope + X-Y Lissajous visualizer (runs whether audio is muted or live)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animId = 0

    const renderScope = () => {
      const w = canvas.width
      const h = canvas.height
      ctx.fillStyle = 'rgba(9, 9, 11, 0.28)'
      ctx.fillRect(0, 0, w, h)

      // Subtle oscilloscope graticule lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(w / 2, 0)
      ctx.lineTo(w / 2, h)
      ctx.moveTo(0, h / 2)
      ctx.lineTo(w, h / 2)
      ctx.stroke()

      const baseT = tickRef.current
      tickRef.current += Math.round(sampleRate / 60)

      // Left half: Time-Domain Waveform
      ctx.strokeStyle = '#22d3ee'
      ctx.lineWidth = 1.6
      ctx.beginPath()
      const halfW = w * 0.52
      for (let i = 0; i < 256; i++) {
        const s = evalBytebeatSample(formula, baseT + i * 2)
        const x = 12 + (i / 255) * (halfW - 24)
        const y = h * 0.15 + ((255 - s) / 255) * (h * 0.7)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()

      // Right half: X-Y Lissajous Phase Scope
      ctx.strokeStyle = '#34d399'
      ctx.lineWidth = 1.4
      ctx.beginPath()
      const cx = w * 0.77
      const cy = h * 0.5
      const radius = Math.min(w * 0.18, h * 0.36)
      for (let i = 0; i < 220; i++) {
        const sX = (evalBytebeatSample(formula, baseT + i * 3) - 128) / 128
        const sY = (evalBytebeatSample(formula, baseT + i * 3 + 16) - 128) / 128
        const px = cx + sX * radius
        const py = cy + sY * radius
        if (i === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.stroke()

      animId = requestAnimationFrame(renderScope)
    }

    animId = requestAnimationFrame(renderScope)
    return () => cancelAnimationFrame(animId)
  }, [formula, sampleRate])

  // Optional Web Audio synthesis
  const toggleAudio = async () => {
    if (playing) {
      if (audioCtxRef.current) {
        await audioCtxRef.current.close().catch(() => {})
        audioCtxRef.current = null
      }
      setPlaying(false)
      setStatusMsg('Audio synthesis paused')
      return
    }

    try {
      const ctx = new AudioContext({ sampleRate })
      audioCtxRef.current = ctx
      const bufferSize = 2048
      const node = ctx.createScriptProcessor(bufferSize, 0, 1)
      let audioT = tickRef.current
      node.onaudioprocess = (ev) => {
        const out = ev.outputBuffer.getChannelData(0)
        for (let i = 0; i < out.length; i++) {
          const byteVal = evalBytebeatSample(formula, audioT++)
          out[i] = ((byteVal - 128) / 128) * volume
        }
      }
      node.connect(ctx.destination)
      setPlaying(true)
      setStatusMsg(`Synthesizing live Bytebeat @ ${sampleRate} Hz`)
    } catch (err) {
      setStatusMsg(`Audio error: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  useEffect(() => {
    return () => {
      void audioCtxRef.current?.close().catch(() => {})
    }
  }, [])

  const handleSavePatchToRoot = async () => {
    const content = `# StrataOS ByteScope Patch\nSAMPLERATE=${sampleRate}\nFORMULA=${formula}\n`
    await kernelClient.writeFileText('/root/bytebeat-patch.txt', content)
    setStatusMsg('Saved patch to /root/bytebeat-patch.txt on Linux ext4 FS')
  }

  return (
    <div className="flex h-full flex-col bg-[#121215] text-zinc-100 font-mono select-none">
      {/* Top Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-[#1c1c21] px-4 py-2 text-xs">
        <div className="flex items-center gap-2">
          <button
            id="bytescope-play-btn"
            onClick={() => void toggleAudio()}
            className={`inline-flex items-center gap-1.5 rounded px-3 py-1 font-semibold transition ${
              playing
                ? 'bg-amber-400 text-zinc-950'
                : 'bg-cyan-500 text-zinc-950 hover:bg-cyan-400'
            }`}
          >
            {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            {playing ? 'Stop Audio' : 'Start Audio Synth'}
          </button>

          <div className="flex items-center gap-1">
            {BYTEBEAT_PRESETS.map((p) => (
              <button
                key={p.name}
                onClick={() => {
                  setFormula(p.formula)
                  setSampleRate(p.sampleRate)
                }}
                className={`rounded border px-2 py-0.5 text-[11px] transition ${
                  formula === p.formula
                    ? 'border-cyan-400/50 bg-cyan-500/20 text-cyan-200'
                    : 'border-white/10 bg-zinc-900 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => void handleSavePatchToRoot()}
          className="inline-flex items-center gap-1 rounded border border-white/10 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-200 hover:bg-zinc-800"
        >
          <Save className="h-3.5 w-3.5 text-emerald-400" /> Save Patch to /root
        </button>
      </div>

      {/* Formula Bar */}
      <div className="flex items-center gap-2 border-b border-white/10 bg-[#121215] px-4 py-2 text-xs">
        <span className="text-cyan-400 font-bold">f(t) =</span>
        <input
          type="text"
          value={formula}
          onChange={(e) => setFormula(e.target.value)}
          className="flex-1 rounded border border-white/10 bg-[#09090b] px-3 py-1 font-mono text-xs text-emerald-300 focus:border-cyan-500 focus:outline-none select-text"
        />
      </div>

      {/* Dual Oscilloscope Canvas (Time-Domain + X-Y Lissajous) */}
      <div className="relative flex-1 bg-[#09090b] p-3 overflow-hidden">
        <canvas
          ref={canvasRef}
          width={680}
          height={320}
          className="h-full w-full rounded-xl border border-white/10 bg-[#09090b]"
        />
        <div className="pointer-events-none absolute top-5 left-6 text-[10px] uppercase tracking-wider text-cyan-400">
          CH1: Time-Domain PCM Waveform
        </div>
        <div className="pointer-events-none absolute top-5 right-8 text-[10px] uppercase tracking-wider text-emerald-400">
          CH2: X-Y Lissajous Phase Scope
        </div>
      </div>

      {/* Footer Sliders */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/10 bg-[#1c1c21] px-4 py-2 text-xs">
        <div className="flex items-center gap-6">
          <label className="flex items-center gap-2 text-zinc-300">
            <Sliders className="h-3.5 w-3.5 text-cyan-400" />
            <span>Clock ({sampleRate} Hz)</span>
            <select
              value={sampleRate}
              onChange={(e) => setSampleRate(Number(e.target.value))}
              className="rounded border border-white/10 bg-[#09090b] px-2 py-0.5 text-xs text-cyan-300"
            >
              <option value={8000}>8000 Hz</option>
              <option value={11025}>11025 Hz</option>
              <option value={22050}>22050 Hz</option>
              <option value={32000}>32000 Hz</option>
            </select>
          </label>

          <label className="flex items-center gap-2 text-zinc-300">
            <Volume2 className="h-3.5 w-3.5 text-emerald-400" />
            <span>Gain ({Math.round(volume * 100)}%)</span>
            <input
              type="range"
              min={0.05}
              max={0.8}
              step={0.05}
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              className="w-24 accent-emerald-400"
            />
          </label>
        </div>
        <span className="text-[11px] text-zinc-400">{statusMsg}</span>
      </div>
    </div>
  )
}
