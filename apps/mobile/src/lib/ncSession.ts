/**
 * src/lib/ncSession.ts — Nextcloud session bootstrap for the Talk client.
 *
 * Verified live against cloud.aifazi.net (NC 34.0.3, Talk 24.0.5) on
 * 2026-10-03 — findings baked into this design:
 *  - The OCS `login/v1` endpoint no longer exists (HTTP 404): session
 *    bootstrap uses the standard HTML login form (`POST /login` with
 *    `user` / `pass` / `requesttoken`).
 *  - The login page embeds a guest CSRF token in the `<head>` tag
 *    (`data-requesttoken="..."`); the authenticated home page embeds the
 *    session's token in the same attribute.
 *  - OCS requests without a requesttoken are rejected with
 *    `412 "CSRF check failed"` (verified unauthenticated), so every OCS
 *    call below carries the session requesttoken.
 *  - Talk advertises `conversation-v4` + `signaling-v3` in the public
 *    capabilities (`GET /ocs/v2.php/apps/spreed/api/v4/room` answers 401
 *    when logged out — the v4 surface is live).
 *
 * The password MUST be a Nextcloud *app password* (Settings → Security →
 * App passwords). An app password is itself an accepted second factor, so
 * the twofactor_webauthn challenge is skipped. A regular 2FA-bound
 * password lands on the 2FA step instead of a session and is reported as
 * `two-factor-blocked`.
 *
 * Credentials reuse the SecureStore entries the CalDAV client already
 * stores (aifazi_caldav_* = the user's NC serverUrl/username/password).
 */
import { getCalDAVCredentials } from './caldav'

export interface NcCredentials {
  serverUrl: string
  username: string
  password: string
}

export interface NcSession {
  serverUrl: string
  username: string
  /** Combined `a=b; c=d` header value, or null when the native cookie jar holds the session. */
  cookie: string | null
  /** 'manual' = we send the Cookie header ourselves; 'native' = platform cookie storage does. */
  cookieMode: 'manual' | 'native'
  /** Session CSRF token for OCS requests (requesttoken). */
  requestToken: string | null
}

export class NcNotConfiguredError extends Error {
  constructor() {
    super('Nextcloud is not set up yet.')
    this.name = 'NcNotConfiguredError'
  }
}

export class NcLoginError extends Error {
  readonly kind: 'auth-failed' | 'two-factor-blocked' | 'network'
  constructor(kind: 'auth-failed' | 'two-factor-blocked' | 'network', message?: string) {
    super(message ?? `Nextcloud login failed (${kind})`)
    this.name = 'NcLoginError'
    this.kind = kind
  }
}

let session: NcSession | null = null
let loginPromise: Promise<NcSession> | null = null

/** Match the guest/session CSRF token the NC pages embed on the <head> tag. */
export function extractRequestToken(html: string): string | null {
  const head = /<head[^>]*data-requesttoken="([^"]+)"/.exec(html)
  if (head && head[1]) return head[1]
  const legacy =
    /name="requesttoken"\s+value="([^"]+)"/.exec(html) ??
    /value="([^"]+)"\s+name="requesttoken"/.exec(html)
  return legacy?.[1] ?? null
}

/** NC marks guest pages with `id="body-login"`; authenticated pages use `id="body"`. */
export function isGuestPage(html: string): boolean {
  return /<body[^>]*id="body-login"/.test(html)
}

interface CookiePair {
  name: string
  value: string
}

/**
 * RN fetch exposes response headers as-is (no browser forbidden-header
 * filtering), and duplicate Set-Cookie headers arrive either separately
 * (getSetCookie) or comma-joined (get('set-cookie')). Parse both.
 */
export function parseSetCookies(res: {
  headers: { getSetCookie?: () => string[]; get: (k: string) => string | null }
}): CookiePair[] {
  const headers = res.headers as { getSetCookie?: () => string[]; get: (k: string) => string | null }
  let raw: string[] = []
  try {
    if (typeof headers.getSetCookie === 'function') raw = headers.getSetCookie()
  } catch {
    raw = []
  }
  if (raw.length === 0) {
    const single = headers.get('set-cookie')
    if (single) {
      // Split joined Set-Cookie values on a comma that starts a new
      // `name=value` pair. NC cookie values are base64url/hex (no commas).
      raw = single.split(/,\s*(?=[^=,\s]+\s*=)/)
    }
  }
  const out: CookiePair[] = []
  for (const entry of raw) {
    const first = entry.split(';')[0]
    const eq = first.indexOf('=')
    if (eq <= 0) continue
    const name = first.slice(0, eq).trim()
    const value = first.slice(eq + 1).trim()
    if (name) out.push({ name, value })
  }
  return out
}

export function cookiesToHeader(cookies: CookiePair[]): string | null {
  if (cookies.length === 0) return null
  return cookies.map((c) => `${c.name}=${c.value}`).join('; ')
}

/** Merge two generations of cookies; later pairs win per name. */
export function mergeCookies(base: CookiePair[], fresh: CookiePair[]): CookiePair[] {
  const byName = new Map<string, string>()
  for (const c of base) byName.set(c.name, c.value)
  for (const c of fresh) byName.set(c.name, c.value)
  return Array.from(byName.entries()).map(([name, value]) => ({ name, value }))
}

interface FetchLikeResponse {
  status: number
  ok: boolean
  url?: string
  headers: { getSetCookie?: () => string[]; get: (k: string) => string | null }
  text: () => Promise<string>
}

type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string; credentials?: string }) => Promise<FetchLikeResponse>

const fetchImpl: FetchLike = (url, init) =>
  fetch(url, { ...init, credentials: 'include' }) as Promise<FetchLikeResponse>

/**
 * Bootstrap a cookie session: guest page (token + guest cookie) →
 * POST /login → probe the home page. Returns the session on success and
 * throws NcLoginError otherwise.
 */
export async function performLogin(
  creds: NcCredentials,
  doFetch: FetchLike = fetchImpl,
): Promise<NcSession> {
  const base = creds.serverUrl.replace(/\/+$/, '')
  if (!/^https?:\/\//i.test(base)) throw new NcLoginError('auth-failed', 'Invalid Nextcloud URL')

  const loginPage = await doFetch(`${base}/login`)
  const guestCookies = parseSetCookies(loginPage)
  const guestToken = extractRequestToken(await loginPage.text())

  const form = new URLSearchParams()
  form.set('user', creds.username)
  form.set('pass', creds.password)
  if (guestToken) form.set('requesttoken', guestToken)

  let post: FetchLikeResponse
  try {
    post = await doFetch(`${base}/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...Object.fromEntries(guestCookies.length ? [['Cookie', cookiesToHeader(guestCookies)!]] : []),
      },
      body: form.toString(),
    })
  } catch (e) {
    throw new NcLoginError('network', e instanceof Error ? e.message : 'Could not reach Nextcloud')
  }

  const cookies = mergeCookies(guestCookies, parseSetCookies(post))
  const cookieHeader = cookiesToHeader(cookies)

  const probe = await doFetch(`${base}/`, {
    headers: cookieHeader ? { Cookie: cookieHeader } : {},
  })
  const html = await probe.text()

  if (isGuestPage(html)) {
    // Still the guest page after login: either the password was wrong or
    // the account demands an interactive 2FA step an app password cannot
    // satisfy.
    const twoFactor = /twofactor|two-factor|2fa|challenge/i.test(html)
    throw new NcLoginError(
      twoFactor ? 'two-factor-blocked' : 'auth-failed',
      twoFactor
        ? 'This Nextcloud account needs interactive 2FA. Use an app password (Settings → Security → App passwords) in Nextcloud Setup.'
        : 'Nextcloud rejected the credentials. Check the username and (app) password.',
    )
  }

  return {
    serverUrl: base,
    username: creds.username,
    cookie: cookieHeader,
    cookieMode: cookieHeader ? 'manual' : 'native',
    requestToken: extractRequestToken(html),
  }
}

/**
 * Get (or lazily bootstrap) the shared NC session. Single-flight:
 * concurrent callers share one login attempt.
 */
export async function getNcSession(opts?: { force?: boolean }): Promise<NcSession> {
  if (!opts?.force && session) return session
  if (loginPromise) return loginPromise
  loginPromise = (async () => {
    try {
      const creds = await getCalDAVCredentials()
      if (!creds) throw new NcNotConfiguredError()
      const s = await performLogin(creds)
      session = s
      return s
    } finally {
      loginPromise = null
    }
  })()
  return loginPromise
}

/** Drop the cached session (401 re-login path). */
export function invalidateSession(): void {
  session = null
}
