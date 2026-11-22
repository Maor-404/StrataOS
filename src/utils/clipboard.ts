import { STRATA_CONFIG } from '../strata.config'
import type { AppId } from '../state/osStore'

function legacyCopy(text: string): boolean {
  const field = Object.assign(document.createElement('textarea'), { value: text })
  field.setAttribute('readonly', '')
  field.style.cssText = 'position:fixed;inset-block-start:0;opacity:0'
  document.body.append(field)
  field.select()
  try {
    return document.execCommand('copy')
  } finally {
    field.remove()
  }
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text) return false
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Fall through to legacy fallback
  }
  try {
    return legacyCopy(text)
  } catch {
    return false
  }
}

/**
 * Generates a shareable deep-link URL for the active StrataOS setup.
 * Uses the current origin when deployed (not localhost) or falls back to STRATA_CONFIG.liveDemoUrl.
 */
export function buildShareSetupUrl(focusedAppId?: AppId | null): { url: string; label: string } {
  const origin =
    typeof window !== 'undefined' &&
    window.location.origin.startsWith('http') &&
    !window.location.hostname.includes('localhost') &&
    window.location.hostname !== '127.0.0.1'
      ? window.location.origin
      : STRATA_CONFIG.liveDemoUrl

  if (!focusedAppId) {
    return { url: `${origin}/?app=webgpu`, label: 'StrataOS WebGPU Studio setup' }
  }

  if (focusedAppId.startsWith('wasm:')) {
    const pkgId = focusedAppId.slice(5)
    return { url: `${origin}/?install=${encodeURIComponent(pkgId)}`, label: `WASM app (${pkgId})` }
  }

  if (focusedAppId === 'gpu-studio') {
    return { url: `${origin}/?app=webgpu`, label: 'Strata GPU Studio' }
  }

  return {
    url: `${origin}/?app=${encodeURIComponent(focusedAppId)}`,
    label: `StrataOS (${focusedAppId})`,
  }
}
