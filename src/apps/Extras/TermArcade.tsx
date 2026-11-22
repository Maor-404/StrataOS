import { Gamepad2, Play, RotateCcw, Trophy } from 'lucide-react'
import React, { useEffect, useState } from 'react'
import { kernelClient } from '../../kernel/kernelClient'

const GRID_SIZE = 16

export const TermArcade: React.FC = () => {
  const [snake, setSnake] = useState<Array<{ x: number; y: number }>>([
    { x: 7, y: 8 },
    { x: 6, y: 8 },
    { x: 5, y: 8 },
  ])
  const [dir, setDir] = useState<{ x: number; y: number }>({ x: 1, y: 0 })
  const [food, setFood] = useState<{ x: number; y: number }>({ x: 11, y: 8 })
  const [running, setRunning] = useState(false)
  const [score, setScore] = useState(0)
  const [highScore, setHighScore] = useState(0)

  useEffect(() => {
    void kernelClient
      .readFileText('/root/arcade-highscore.txt')
      .then((t) => setHighScore(parseInt(t.trim(), 10) || 0))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => {
      setSnake((prev) => {
        const head = {
          x: (prev[0].x + dir.x + GRID_SIZE) % GRID_SIZE,
          y: (prev[0].y + dir.y + GRID_SIZE) % GRID_SIZE,
        }
        if (prev.some((seg) => seg.x === head.x && seg.y === head.y)) {
          setRunning(false)
          return prev
        }
        const next = [head, ...prev]
        if (head.x === food.x && head.y === food.y) {
          const newScore = score + 10
          setScore(newScore)
          if (newScore > highScore) {
            setHighScore(newScore)
            void kernelClient.writeFileText('/root/arcade-highscore.txt', String(newScore))
          }
          setFood({
            x: Math.floor(Math.random() * GRID_SIZE),
            y: Math.floor(Math.random() * GRID_SIZE),
          })
        } else {
          next.pop()
        }
        return next
      })
    }, 115)
    return () => clearInterval(timer)
  }, [running, dir, food, score, highScore])

  const resetGame = () => {
    setSnake([
      { x: 7, y: 8 },
      { x: 6, y: 8 },
      { x: 5, y: 8 },
    ])
    setDir({ x: 1, y: 0 })
    setScore(0)
    setRunning(true)
  }

  return (
    <div
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'ArrowUp' && dir.y === 0) setDir({ x: 0, y: -1 })
        else if (e.key === 'ArrowDown' && dir.y === 0) setDir({ x: 0, y: 1 })
        else if (e.key === 'ArrowLeft' && dir.x === 0) setDir({ x: -1, y: 0 })
        else if (e.key === 'ArrowRight' && dir.x === 0) setDir({ x: 1, y: 0 })
      }}
      className="flex h-full flex-col bg-[#121215] text-zinc-100 font-mono select-none focus:outline-none"
    >
      <div className="flex items-center justify-between border-b border-white/10 bg-[#1c1c21] px-4 py-2 text-xs">
        <div className="flex items-center gap-2">
          <Gamepad2 className="h-4 w-4 text-cyan-400" />
          <span className="font-bold">TermArcade — Kernel Grid Runner</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-cyan-300">SCORE: {score}</span>
          <span className="inline-flex items-center gap-1 text-amber-300">
            <Trophy className="h-3.5 w-3.5" /> HIGH: {highScore}
          </span>
          <button
            onClick={resetGame}
            className="inline-flex items-center gap-1 rounded bg-cyan-500 px-3 py-1 text-xs font-bold text-zinc-950 hover:bg-cyan-400"
          >
            {running ? <RotateCcw className="h-3 w-3" /> : <Play className="h-3 w-3" />}
            {running ? 'Restart' : 'Start Game'}
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center bg-[#09090b] p-4">
        <div
          className="grid gap-1 rounded-xl border border-white/10 bg-[#121215] p-3"
          style={{ gridTemplateColumns: `repeat(${GRID_SIZE}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: GRID_SIZE * GRID_SIZE }).map((_, idx) => {
            const x = idx % GRID_SIZE
            const y = Math.floor(idx / GRID_SIZE)
            const isHead = snake[0].x === x && snake[0].y === y
            const isBody = snake.slice(1).some((s) => s.x === x && s.y === y)
            const isFood = food.x === x && food.y === y
            return (
              <div
                key={idx}
                className={`h-4 w-4 rounded-sm ${
                  isHead
                    ? 'bg-cyan-400'
                    : isBody
                    ? 'bg-cyan-500/50'
                    : isFood
                    ? 'bg-emerald-400 animate-pulse'
                    : 'bg-zinc-900'
                }`}
              />
            )
          })}
        </div>
        <div className="mt-3 text-[11px] text-zinc-400">
          Use Arrow Keys to navigate • High scores persist to <code className="text-cyan-300">/root/arcade-highscore.txt</code>
        </div>
      </div>
    </div>
  )
}
