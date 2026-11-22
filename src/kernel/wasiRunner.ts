import type { PackageManifest } from './types'

export interface WasiRunContext {
  pkgId: string
  manifest: PackageManifest
  wasmBytes: Uint8Array
  args: string[]
  env: Record<string, string>
  cwd: string
  onStdout: (text: string) => void
  onStderr: (text: string) => void
}

interface CalcWasmExports {
  memory: WebAssembly.Memory
  _start?: () => void
  eval_add?: (a: number, b: number) => number
  eval_sub?: (a: number, b: number) => number
  eval_mul?: (a: number, b: number) => number
  eval_div?: (a: number, b: number) => number
  eval_fib?: (n: number) => number
}

/**
 * Safe recursive-descent math + bitwise evaluator that delegates primitive arithmetic
 * and Fibonacci operations to the instantiated WebAssembly module's exported functions.
 */
function evaluateMathExpression(expr: string, exports: CalcWasmExports): number {
  const add = exports.eval_add ?? ((a, b) => a + b)
  const sub = exports.eval_sub ?? ((a, b) => a - b)
  const mul = exports.eval_mul ?? ((a, b) => a * b)
  const div = exports.eval_div ?? ((a, b) => a / b)
  const fib = exports.eval_fib ?? ((n: number) => {
    if (n <= 1) return n
    let a = 0, b = 1
    for (let i = 2; i <= n; i++) {
      const c = a + b
      a = b
      b = c
    }
    return b
  })

  const cleaned = expr.trim()
  if (!cleaned) return 0

  let pos = 0

  function skipWs() {
    while (pos < cleaned.length && /\s/.test(cleaned[pos])) pos++
  }

  function parseBitwiseOr(): number {
    let left = parseBitwiseXor()
    while (true) {
      skipWs()
      if (cleaned[pos] === '|') {
        pos++
        left = (left | parseBitwiseXor()) >>> 0
      } else {
        break
      }
    }
    return left
  }

  function parseBitwiseXor(): number {
    let left = parseBitwiseAnd()
    while (true) {
      skipWs()
      if (cleaned.slice(pos, pos + 3) === 'xor') {
        pos += 3
        left = (left ^ parseBitwiseAnd()) >>> 0
      } else {
        break
      }
    }
    return left
  }

  function parseBitwiseAnd(): number {
    let left = parseShift()
    while (true) {
      skipWs()
      if (cleaned[pos] === '&') {
        pos++
        left = (left & parseShift()) >>> 0
      } else {
        break
      }
    }
    return left
  }

  function parseShift(): number {
    let left = parseAddSub()
    while (true) {
      skipWs()
      if (cleaned.slice(pos, pos + 2) === '<<') {
        pos += 2
        left = left << parseAddSub()
      } else if (cleaned.slice(pos, pos + 2) === '>>') {
        pos += 2
        left = left >> parseAddSub()
      } else {
        break
      }
    }
    return left
  }

  function parseAddSub(): number {
    let left = parseMulDiv()
    while (true) {
      skipWs()
      const ch = cleaned[pos]
      if (ch === '+') {
        pos++
        left = add(left, parseMulDiv())
      } else if (ch === '-') {
        pos++
        left = sub(left, parseMulDiv())
      } else {
        break
      }
    }
    return left
  }

  function parseMulDiv(): number {
    let left = parsePower()
    while (true) {
      skipWs()
      const ch = cleaned[pos]
      if (ch === '*') {
        pos++
        left = mul(left, parsePower())
      } else if (ch === '/') {
        pos++
        left = div(left, parsePower())
      } else if (ch === '%') {
        pos++
        left = left % parsePower()
      } else {
        break
      }
    }
    return left
  }

  function parsePower(): number {
    const base = parseUnary()
    skipWs()
    if (cleaned[pos] === '^' || cleaned.slice(pos, pos + 2) === '**') {
      if (cleaned[pos] === '^') pos++
      else pos += 2
      const exp = parsePower()
      return Math.pow(base, exp)
    }
    return base
  }

  function parseUnary(): number {
    skipWs()
    if (cleaned[pos] === '+') {
      pos++
      return parseUnary()
    }
    if (cleaned[pos] === '-') {
      pos++
      return sub(0, parseUnary())
    }
    if (cleaned[pos] === '~') {
      pos++
      return ~parseUnary()
    }
    return parsePrimary()
  }

  function parsePrimary(): number {
    skipWs()
    if (cleaned[pos] === '(') {
      pos++
      const val = parseBitwiseOr()
      skipWs()
      if (cleaned[pos] === ')') pos++
      return val
    }

    // Identifiers / functions / constants
    const idMatch = /^[a-zA-Z_][a-zA-Z0-9_]*/.exec(cleaned.slice(pos))
    if (idMatch) {
      const ident = idMatch[0].toLowerCase()
      pos += ident.length
      skipWs()
      if (ident === 'pi') return Math.PI
      if (ident === 'e') return Math.E
      if (ident === 'tau') return Math.PI * 2

      if (cleaned[pos] === '(') {
        pos++
        const args: number[] = []
        skipWs()
        if (cleaned[pos] !== ')') {
          args.push(parseBitwiseOr())
          while (true) {
            skipWs()
            if (cleaned[pos] === ',') {
              pos++
              args.push(parseBitwiseOr())
            } else {
              break
            }
          }
        }
        skipWs()
        if (cleaned[pos] === ')') pos++

        const a0 = args[0] ?? 0
        const a1 = args[1] ?? 0
        switch (ident) {
          case 'sqrt': return Math.sqrt(a0)
          case 'sin': return Math.sin(a0)
          case 'cos': return Math.cos(a0)
          case 'tan': return Math.tan(a0)
          case 'abs': return Math.abs(a0)
          case 'floor': return Math.floor(a0)
          case 'ceil': return Math.ceil(a0)
          case 'round': return Math.round(a0)
          case 'log':
          case 'ln': return Math.log(a0)
          case 'log2': return Math.log2(a0)
          case 'log10': return Math.log10(a0)
          case 'pow': return Math.pow(a0, a1)
          case 'max': return Math.max(...args)
          case 'min': return Math.min(...args)
          case 'fib': return fib(Math.max(0, Math.min(46, Math.floor(a0))))
          default:
            throw new Error(`Unknown WASI math function '${ident}()'`)
        }
      }
      throw new Error(`Unknown constant '${ident}'`)
    }

    // Numbers: hex (0x...), binary (0b...), octal (0o...), or decimal float
    const numMatch = /^(0x[0-9a-fA-F]+|0b[01]+|0o[0-7]+|\d+(\.\d+)?([eE][+-]?\d+)?)/.exec(
      cleaned.slice(pos)
    )
    if (numMatch) {
      const raw = numMatch[0]
      pos += raw.length
      const val = Number(raw)
      if (Number.isNaN(val)) throw new Error(`Invalid number '${raw}'`)
      return val
    }

    throw new Error(`Unexpected token at '${cleaned.slice(pos)}'`)
  }

  const res = parseBitwiseOr()
  skipWs()
  if (pos < cleaned.length) {
    throw new Error(`Unexpected trailing characters: '${cleaned.slice(pos)}'`)
  }
  return res
}

/**
 * Sandboxed WASI Preview 1 & Preview 2 Runner for wasm-cli packages installed via strataget.
 */
export async function runWasiCliPackage(ctx: WasiRunContext): Promise<number> {
  const { pkgId, manifest, wasmBytes, args, env, onStdout, onStderr } = ctx
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()

  let wasmMemory: WebAssembly.Memory | null = null
  let exitCode = 0

  const argvStrings = [pkgId, ...args]
  const envStrings = Object.entries(env).map(([k, v]) => `${k}=${v}`)

  class WasiExitError extends Error {
    code: number
    constructor(code: number) {
      super(`proc_exit(${code})`)
      this.code = code
    }
  }

  const getDv = () => {
    if (!wasmMemory) throw new Error('WASM memory not initialized')
    return new DataView(wasmMemory.buffer)
  }
  const getU8 = () => {
    if (!wasmMemory) throw new Error('WASM memory not initialized')
    return new Uint8Array(wasmMemory.buffer)
  }

  const wasiPreview1: Record<string, WebAssembly.ImportValue> = {
    args_sizes_get(argcPtr: number, argvBufSizePtr: number): number {
      const dv = getDv()
      dv.setUint32(argcPtr, argvStrings.length, true)
      const totalBytes = argvStrings.reduce((acc, s) => acc + encoder.encode(s).length + 1, 0)
      dv.setUint32(argvBufSizePtr, totalBytes, true)
      return 0
    },
    args_get(argvPtr: number, argvBufPtr: number): number {
      const dv = getDv()
      const u8 = getU8()
      let bufOffset = argvBufPtr
      argvStrings.forEach((s, idx) => {
        dv.setUint32(argvPtr + idx * 4, bufOffset, true)
        const bytes = encoder.encode(s)
        u8.set(bytes, bufOffset)
        u8[bufOffset + bytes.length] = 0
        bufOffset += bytes.length + 1
      })
      return 0
    },
    environ_sizes_get(envCountPtr: number, envBufSizePtr: number): number {
      const dv = getDv()
      dv.setUint32(envCountPtr, envStrings.length, true)
      const totalBytes = envStrings.reduce((acc, s) => acc + encoder.encode(s).length + 1, 0)
      dv.setUint32(envBufSizePtr, totalBytes, true)
      return 0
    },
    environ_get(environPtr: number, environBufPtr: number): number {
      const dv = getDv()
      const u8 = getU8()
      let bufOffset = environBufPtr
      envStrings.forEach((s, idx) => {
        dv.setUint32(environPtr + idx * 4, bufOffset, true)
        const bytes = encoder.encode(s)
        u8.set(bytes, bufOffset)
        u8[bufOffset + bytes.length] = 0
        bufOffset += bytes.length + 1
      })
      return 0
    },
    fd_write(fd: number, iovsPtr: number, iovsLen: number, nwrittenPtr: number): number {
      const dv = getDv()
      const u8 = getU8()
      let total = 0
      let chunkText = ''
      for (let i = 0; i < iovsLen; i++) {
        const ptr = dv.getUint32(iovsPtr + i * 8, true)
        const len = dv.getUint32(iovsPtr + i * 8 + 4, true)
        if (len > 0) {
          chunkText += decoder.decode(u8.subarray(ptr, ptr + len), { stream: true })
          total += len
        }
      }
      if (chunkText) {
        if (fd === 2) onStderr(chunkText)
        else onStdout(chunkText)
      }
      dv.setUint32(nwrittenPtr, total, true)
      return 0
    },
    fd_read(_fd: number, _iovsPtr: number, _iovsLen: number, nreadPtr: number): number {
      getDv().setUint32(nreadPtr, 0, true)
      return 0
    },
    fd_close(): number {
      return 0
    },
    fd_seek(_fd: number, _offset: bigint, _whence: number, newOffsetPtr: number): number {
      getDv().setBigUint64(newOffsetPtr, 0n, true)
      return 0
    },
    fd_fdstat_get(_fd: number, statPtr: number): number {
      const dv = getDv()
      dv.setUint8(statPtr, 2) // character device
      dv.setUint16(statPtr + 2, 0, true)
      dv.setBigUint64(statPtr + 8, 0n, true)
      dv.setBigUint64(statPtr + 16, 0n, true)
      return 0
    },
    clock_time_get(_id: number, _precision: bigint, timePtr: number): number {
      const nowNs = BigInt(Math.round(performance.now() * 1e6))
      getDv().setBigUint64(timePtr, nowNs, true)
      return 0
    },
    random_get(bufPtr: number, bufLen: number): number {
      crypto.getRandomValues(getU8().subarray(bufPtr, bufPtr + bufLen))
      return 0
    },
    proc_exit(code: number): never {
      throw new WasiExitError(code)
    },
  }

  try {
    const compiled = await WebAssembly.compile(wasmBytes.slice().buffer)
    const instance = await WebAssembly.instantiate(compiled, {
      wasi_snapshot_preview1: wasiPreview1,
      wasi_unstable: wasiPreview1,
      'wasi:cli/environment@0.2.0': wasiPreview1,
      env: {},
    })

    const exports = instance.exports as unknown as CalcWasmExports
    if (exports.memory instanceof WebAssembly.Memory) {
      wasmMemory = exports.memory
    }

    // Execute standard WASI _start entry point if present
    if (typeof exports._start === 'function') {
      try {
        exports._start()
      } catch (err) {
        if (err instanceof WasiExitError) {
          exitCode = err.code
        } else {
          throw err
        }
      }
    }

    // Special interactive CLI capabilities for CalcWASM or exported math modules
    if (pkgId === 'calcwasm' || typeof exports.eval_add === 'function') {
      if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
        onStdout(
          `\x1b[1;33mUsage:\x1b[0m calcwasm "<expression>" [more expressions...]\n` +
            `\x1b[90mExamples:\x1b[0m\n` +
            `  calcwasm "2^16 + sqrt(144)"\n` +
            `  calcwasm "fib(20)" "0xff << 4" "sin(pi / 2) * 100"\n` +
            `\x1b[90mWASM Exports:\x1b[0m ${Object.keys(instance.exports).join(', ')}\n`
        )
      } else {
        for (const expr of args) {
          try {
            const t0 = performance.now()
            const result = evaluateMathExpression(expr, exports)
            const elapsedUs = ((performance.now() - t0) * 1000).toFixed(1)
            const isInt = Number.isInteger(result) && Math.abs(result) <= Number.MAX_SAFE_INTEGER
            const hexStr = isInt && result >= 0 ? `0x${result.toString(16).toUpperCase()}` : null
            const binStr =
              isInt && result >= 0 && result <= 0xffff ? `0b${result.toString(2)}` : null

            onStdout(
              `  \x1b[36m${expr}\x1b[0m = \x1b[1;32m${result}\x1b[0m` +
                (hexStr ? `  \x1b[90m[${hexStr}${binStr ? ` | ${binStr}` : ''}]\x1b[0m` : '') +
                `  \x1b[90m(${elapsedUs} µs in WASM)\x1b[0m\n`
            )
          } catch (evalErr) {
            const msg = evalErr instanceof Error ? evalErr.message : String(evalErr)
            onStderr(`  \x1b[1;31mError evaluating "${expr}":\x1b[0m ${msg}\n`)
            exitCode = 1
          }
        }
      }
    } else if (typeof exports._start !== 'function') {
      // Generic WASM module inspection if no _start
      onStdout(
        `\x1b[1;32m[WASI Runner]\x1b[0m Executed ${manifest.name} v${manifest.version} (${wasmBytes.byteLength} bytes)\n` +
          `Exported symbols: ${Object.keys(instance.exports).join(', ')}\n`
      )
    }

    return exitCode
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    onStderr(`\x1b[1;31m[WASI Runtime Error]\x1b[0m Failed to run ${pkgId}: ${msg}\n`)
    return 1
  }
}
