/**
 * src/lib/sslPinning.ts — Certificate / public-key pinning (#11).
 *
 * STATUS: prepared, NOT active. Takes effect only after:
 *   1. `npx expo prebuild` (native module needs a dev client / EAS build —
 *      it does nothing in Expo Go; calls fall back to plain fetch there),
 *   2. an EAS production build + store release.
 *
 * Pins below are SPKI SHA-256 hashes of the live api.aifazi.net chain
 * (leaf + intermediates + root). Pinning validates ANY certificate in the
 * chain, so a leaf renewal with the same chain keeps working; a full CA
 * change requires an app update — that is the operational cost of pinning.
 *
 * ROTATION RUNBOOK (mandatory before any cert/CA change):
 *   1. Get the new chain's SPKI pins (scripts/get_ssl_pins.mjs pattern).
 *   2. ADD the new pins alongside the old ones here (never replace outright).
 *   3. Release an app update; wait until adoption > 80%.
 *   4. Switch the server certificate.
 *   5. Remove the retired pins in the next release.
 */

export const PINNED_HOSTS: Record<string, string[]> = {
  'api.aifazi.net': [
    // leaf (api.aifazi.net)
    'sha256/boAH2RgUdVzrKMPj3pKVN2W+3GN872/6f3ea0BgajaY=',
    // intermediate YR1 (backup if leaf rotates with a new key)
    'sha256/LoMHBotttiDko50Gi13uXW71eIy7LAttI+rYT8wXF4w=',
    // Root YR
    'sha256/fk6IOKit1ild5647BH06ujSIq5XbCgqlbYl6ANhhi88=',
    // ISRG Root X1 (chain anchor — survives intermediate rotation)
    'sha256/C5+lpZ7tcVwmwQIMcRtPbsQtWLABXhQzejna0wHFr8M=',
  ],
}

function getNativeFetch(): ((url: string, opts: any) => Promise<any>) | null {
  try {
    const mod = require('react-native-ssl-pinning')
    return typeof mod?.fetch === 'function' ? mod.fetch : null
  } catch {
    return null
  }
}

/** True when the native pinning module is linked (dev client / EAS build). */
export function isPinningAvailable(): boolean {
  return getNativeFetch() !== null
}

export interface PinnedRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  headers?: Record<string, string>
  body?: string
  timeoutInterval?: number
}

/**
 * fetch() with SPKI pinning for pinned hosts, plain fetch otherwise.
 * Falls back to plain fetch (with a __DEV__ warning) when the native module
 * is absent — e.g. Expo Go — so development never breaks.
 */
export async function pinnedFetch(url: string, options: PinnedRequestOptions = {}): Promise<Response> {
  const host = (() => {
    try {
      return new URL(url).hostname
    } catch {
      return ''
    }
  })()
  const pins = PINNED_HOSTS[host]
  const nativeFetch = getNativeFetch()

  if (!pins || !nativeFetch) {
    if (typeof __DEV__ !== 'undefined' && __DEV__ && pins && !nativeFetch) {
      console.warn('[sslPinning] native module absent (Expo Go?) — pinning skipped for', host)
    }
    return fetch(url, {
      method: options.method ?? 'GET',
      headers: options.headers,
      body: options.body,
    })
  }

  // react-native-ssl-pinning supports GET/POST/PUT/DELETE only.
  if (options.method === 'PATCH') {
    throw new Error('[sslPinning] PATCH not supported by the pinning transport; use PUT or extend the adapter')
  }
  const res = await nativeFetch(url, {
    method: options.method ?? 'GET',
    headers: options.headers,
    body: options.body,
    timeoutInterval: options.timeoutInterval ?? 15000,
    pkPinning: true,
    sslPinning: { certs: pins },
  })
  const text = await res.text()
  return new Response(text, { status: res.status, headers: res.headers as HeadersInit })
}
