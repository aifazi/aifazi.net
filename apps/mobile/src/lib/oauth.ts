import * as WebBrowser from 'expo-web-browser'
import * as Crypto from 'expo-crypto'
import { API_BASE } from './getApiBase'

/**
 * OAuth login/signup for the native app.
 *
 * The backend handles each provider (Discord / GitHub / Steam) and, when started
 * with `?mobile=1`, redirects back to a deep link under OAUTH_REDIRECT_BASE with
 * the access + refresh tokens in the URL fragment. `expo-web-browser`'s auth
 * session captures that redirect and the URL is parsed here, so the app never has
 * to read HttpOnly cookies. Requires a dev-client/production build that registers
 * the `aifazi://` scheme (not Expo Go).
 *
 * Completion: `loginWithOAuth` resolves from the `openAuthSessionAsync` promise.
 * On Android the same deep link can reach the app via expo-router's Linking
 * intent instead, so the callback route re-injects the URL through
 * `completeFromAuthRedirect` — a guarded, single-flight sink that never opens a
 * second browser.
 */

export type OAuthProvider = 'discord' | 'github' | 'steam'

/** Must match the backend MOBILE_AUTH_URL (routers/auth.py). Server-controlled. */
export const OAUTH_REDIRECT_BASE = 'aifazi:///oauth/callback'

const LOGIN_PATHS: Record<OAuthProvider, string> = {
  discord: '/api/auth/discord/login',
  github: '/api/forum/auth/github/login',
  steam: '/api/forum/auth/steam/login',
}

export type OAuthResult =
  | { ok: true; requires2fa: false; token: string; refreshToken: string; dest?: string }
  | { ok: true; requires2fa: true; partialToken: string; username?: string }
  | { ok: false; cancelled: boolean; error?: string }

type Pending = { provider: OAuthProvider; resolve: (r: OAuthResult) => void }
let pending: Pending | null = null

/**
 * One-time OAuth `state` for deep-link verification. Generated fresh per
 * loginWithOAuth call (expo-crypto CSPRNG), appended to the provider URL, and
 * consumed/cleared on the first parseOAuthRedirect — never reused, never
 * logged. Fail closed: whenever a state was issued, the redirect must carry
 * the exact same state or the flow is rejected.
 */
let oauthState: string | null = null

function clearOAuthState(): void {
  oauthState = null
}

async function newOAuthState(): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(16)
  const state = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  oauthState = state
  return state
}

function parseQuery(qs: string): Record<string, string> {
  const out: Record<string, string> = {}
  if (!qs) return out
  for (const pair of qs.split('&')) {
    if (!pair) continue
    const eq = pair.indexOf('=')
    if (eq >= 0) out[decodeURIComponent(pair.slice(0, eq))] = decodeURIComponent(pair.slice(eq + 1))
    else out[decodeURIComponent(pair)] = ''
  }
  return out
}

/**
 * Parse a backend OAuth redirect URL for a mobile flow. Returns null when the URL
 * isn't one of ours (e.g. the redirect target was the web site or another scheme),
 * so the app never consumes a link it didn't expect.
 */
export function parseOAuthRedirect(rawUrl: string, provider: OAuthProvider): OAuthResult | null {
  if (!rawUrl.startsWith(`${OAUTH_REDIRECT_BASE}/${provider}`)) return null
  const hashIdx = rawUrl.indexOf('#')
  const qIdx = rawUrl.indexOf('?')
  const frag = hashIdx >= 0 ? rawUrl.slice(hashIdx + 1) : ''
  const qs = qIdx >= 0 ? rawUrl.slice(qIdx + 1, hashIdx >= 0 ? hashIdx : undefined) : ''
  const params = { ...parseQuery(qs), ...parseQuery(frag) } // fragment wins

  // One-time state: consume immediately so it can never be replayed.
  // Fail closed — if we issued a state, the redirect must echo it exactly.
  const expected = oauthState
  clearOAuthState()
  if (expected && params.state !== expected) {
    return { ok: false, cancelled: false, error: 'state' }
  }

  if (params.twofa === 'forum' && params.partial_token) {
    return {
      ok: true,
      requires2fa: true,
      partialToken: params.partial_token,
      username: params.username || undefined,
    }
  }
  if (params.token) {
    return {
      ok: true,
      requires2fa: false,
      token: params.token,
      refreshToken: params.refresh ?? '',
      dest: params.dest || undefined,
    }
  }
  const errKey = `${provider}_error`
  return { ok: false, cancelled: false, error: params[errKey] || 'unknown' }
}

/** Single-flight completion: only resolves the session that is actually pending. */
export function completeFromAuthRedirect(rawUrl: string, provider: OAuthProvider) {
  const p = pending
  if (!p) return false
  if (p.provider !== provider) return false
  const result = parseOAuthRedirect(rawUrl, provider)
  if (!result) return false
  pending = null
  p.resolve(result)
  return true
}

/** Discard a pending OAuth session (e.g. flow abandoned). Clears state too. */
export function cancelPendingOAuth() {
  pending = null
  clearOAuthState()
}

/**
 * Start a provider OAuth flow from the native auth session browser.
 * Resolves with the parsed result; never throws.
 */
export async function loginWithOAuth(provider: OAuthProvider): Promise<OAuthResult> {
  const state = await newOAuthState()
  return new Promise<OAuthResult>((resolve) => {
    pending = { provider, resolve }
    const url = `${API_BASE}${LOGIN_PATHS[provider]}?mobile=1&state=${encodeURIComponent(state)}`
    WebBrowser.openAuthSessionAsync(url, OAUTH_REDIRECT_BASE)
      .then((res: WebBrowser.WebBrowserAuthSessionResult) => {
        if (!pending) return // already completed via deep link
        if (res.type === 'success' && res.url) {
          pending = null
          resolve(parseOAuthRedirect(res.url, provider) ?? { ok: false, cancelled: false, error: 'invalid_redirect' })
          return
        }
        // Browser closed without returning a URL. On Android the backend
        // redirect is often delivered as an app deep link while the browser
        // promise itself resolves to dismiss/cancel — so keep `pending` alive
        // for a short grace window to let the callback route re-inject the URL.
        setTimeout(() => {
          if (!pending) return // completed via deep link during the grace period
          cancelPendingOAuth()
          resolve({ ok: false, cancelled: true })
        }, 2000)
      })
      .catch(() => {
        if (!pending) return
        cancelPendingOAuth()
        resolve({ ok: false, cancelled: false, error: 'signin_failed' })
      })
  })
}