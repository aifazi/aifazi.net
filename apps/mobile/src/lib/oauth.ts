import * as WebBrowser from 'expo-web-browser'
import * as Crypto from 'expo-crypto'
import { api } from './api'
import { API_BASE } from './getApiBase'

/**
 * OAuth login/signup for the native app.
 *
 * The backend handles each provider (Discord / GitHub / Steam) and, when started
 * with `?mobile=1`, redirects back to a deep link under OAUTH_REDIRECT_BASE
 * carrying a one-time exchange CODE in the URL fragment (H2/C6 — never the
 * tokens themselves). `expo-web-browser`'s auth session captures that redirect,
 * the URL is parsed here, and the code is exchanged for access + refresh tokens
 * via POST /auth/mobile/exchange, so no credential ever sits in a URL.
 * Requires a dev-client/production build that registers the `aifazi://` scheme
 * (not Expo Go).
 *
 * The app also issues a one-time `state` with the login URL; the backend
 * echoes it back in the fragment and this module rejects any redirect that
 * does not carry the exact state (fail closed).
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

/** What the deep-link fragment actually carries (H2/C6: a one-time code). */
type ParsedOAuthResult =
  | { ok: true; requires2fa: false; code: string; dest?: string; state?: string }
  | { ok: true; requires2fa: true; partialToken: string; username?: string }
  | { ok: false; cancelled: boolean; error?: string }

type Pending = { provider: OAuthProvider; resolve: (r: ParsedOAuthResult) => void }
let pending: Pending | null = null

/**
 * One-time OAuth `state` for deep-link verification. Generated fresh per
 * loginWithOAuth call (expo-crypto CSPRNG), sent to the backend, carried
 * through the HMAC-signed backend state, and echoed back in the redirect
 * fragment. Consumed/cleared on the first parseOAuthRedirect — never reused,
 * never logged. Fail closed: whenever a state was issued, the redirect must
 * carry the exact same state or the flow is rejected.
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
export function parseOAuthRedirect(rawUrl: string, provider: OAuthProvider): ParsedOAuthResult | null {
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
  // H2/C6 — the fragment carries a one-time code, never raw tokens.
  // The echoed state is returned so the exchanger can bind the code to it.
  if (params.code) {
    return {
      ok: true,
      requires2fa: false,
      code: params.code,
      dest: params.dest || undefined,
      state: params.state || undefined,
    }
  }
  const errKey = `${provider}_error`
  return { ok: false, cancelled: false, error: params[errKey] || 'unknown' }
}

/**
 * Exchange a one-time OAuth code (from the deep-link fragment) for access +
 * refresh tokens. H2/C6 — no token is ever present in the redirect URL.
 * The app state (validated echo) is sent along so the server binds the code
 * to this flow; an intercepted code alone is useless.
 */
export async function exchangeOAuthCode(
  code: string,
  state?: string,
): Promise<{ token: string; refreshToken: string; dest?: string }> {
  const res = await api.post('/auth/mobile/exchange', { code, state })
  const data = (res.data ?? {}) as { token?: string; refreshToken?: string; dest?: string }
  if (!data.token) throw new Error('Exchange failed — no token returned')
  return { token: data.token, refreshToken: data.refreshToken ?? '', dest: data.dest }
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
 * Resolves with tokens (after exchanging the one-time code) or an error;
 * never throws.
 */
export async function loginWithOAuth(provider: OAuthProvider): Promise<OAuthResult> {
  const state = await newOAuthState()
  return new Promise<OAuthResult>((resolve) => {
    // The deep link delivers a one-time code; complete the sign-in by
    // exchanging it server-side. 2FA and error results pass through as-is.
    const settle = (parsed: ParsedOAuthResult): void => {
      if (!parsed.ok || parsed.requires2fa) {
        resolve(parsed)
        return
      }
      // Prefer the server-signed dest over the fragment (route confusion);
      // fall back to the fragment when the server omits it.
      void exchangeOAuthCode(parsed.code, parsed.state)
        .then(({ token, refreshToken, dest }) => {
          resolve({ ok: true, requires2fa: false, token, refreshToken, dest: dest || parsed.dest })
        })
        .catch(() => {
          resolve({ ok: false, cancelled: false, error: 'exchange' })
        })
    }
    pending = { provider, resolve: settle }
    const url = `${API_BASE}${LOGIN_PATHS[provider]}?mobile=1&state=${encodeURIComponent(state)}`
    WebBrowser.openAuthSessionAsync(url, OAUTH_REDIRECT_BASE)
      .then((res: WebBrowser.WebBrowserAuthSessionResult) => {
        if (!pending) return // already completed via deep link
        if (res.type === 'success' && res.url) {
          pending = null
          settle(parseOAuthRedirect(res.url, provider) ?? { ok: false, cancelled: false, error: 'invalid_redirect' })
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