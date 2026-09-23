/**
 * lib/api.ts — API client for Next.js
 * Drop-in replacement for utils/api.js
 * New token priority (matches documented contract + ensureAdminGate ordering):
 * admin > staff > auth > forum
 *
 * SECURITY: Access tokens are stored in memory ONLY — never written to
 * localStorage/sessionStorage (and never read back from them).
 * The HttpOnly refresh_token cookie keeps the user logged in across sessions.
 * Long-lived persistence is handled by the HttpOnly refresh_token cookie —
 * the interceptor below silently reissues a new access token on 401.
 */
import axios from 'axios'

// Always use relative /api so Next.js rewrites proxy requests to the backend.
// Using NEXT_PUBLIC_API_URL directly here would cause CORS errors because
// browser requests would bypass the Next.js proxy and hit the backend directly.
const BASE = '/api'

const api = axios.create({ baseURL: BASE, timeout: 15000 })

// H4 — the access token lives in memory only. It is NEVER written to
// localStorage/sessionStorage. Session persistence across reloads is handled by
// the HttpOnly refresh_token cookie (set by the backend on login) via the
// 401-refresh interceptor below and the cookie re-hydration in ForumContext.
let _memToken: string | null = null

/** Set (or clear) the in-memory access token. */
export function setAccessToken(token: string | null) {
  _memToken = token
}

/** Get the current access token from memory. */
export function getAuthToken(): string | null {
  return _memToken
}

/** Remove the legacy localStorage/sessionStorage token keys.
 *
 * NOTE: `aifazi_effective_role` / `aifazi_permissions` / `aifazi_username` are
 * deliberately NOT purged here — `setEffectiveAccess()` writes them during
 * session hydration and `getRole()`/`canEdit()`/`hasPermission()` read them to
 * gate the inline "Edit Site" UI. Wiping them here (right after a successful
 * /auth/me) left the role null on the public site, so admins could never enter
 * edit mode. Logout clears them via `clearAuthTokens()`.
 */
export function clearLegacyTokens() {
  if (typeof window === 'undefined') return
  localStorage.removeItem('auth_token')
  localStorage.removeItem('forum_token')
  localStorage.removeItem('admin_token')
  localStorage.removeItem('staff_token')
  localStorage.removeItem('refresh_token')
  sessionStorage.removeItem('forum_token')
  sessionStorage.removeItem('admin_token')
  sessionStorage.removeItem('staff_token')
  sessionStorage.removeItem('chat_token')
}

api.interceptors.request.use((config) => {
  // Pure HttpOnly cookie auth - no Authorization header
  // withCredentials: true sends HttpOnly cookies automatically
  config.withCredentials = true
  // Impersonation ("view as"): an explicit Bearer header wins over the
  // HttpOnly admin cookie in the backend's CookieHTTPBearer, so the admin
  // session underneath is never touched. Explicit per-request headers win.
  config.headers = config.headers || {}
  if (_impersonateToken && !(config.headers as Record<string, string>)['Authorization']) {
    ;(config.headers as Record<string, string>)['Authorization'] = `Bearer ${_impersonateToken}`
  }
  if (_impersonateToken) (config as any)._impersonated = true
  // CSRF: mark all state-changing requests so the backend can require this
  // header (a cross-site form/fetch cannot set custom headers without CORS
  // preflight, which the backend will not grant to foreign origins).
  const method = (config.method || 'get').toLowerCase()
  if (method === 'post' || method === 'put' || method === 'patch' || method === 'delete') {
    ;(config.headers as Record<string, string>)['X-Requested-With'] = 'XMLHttpRequest'
  }
  return config
})

let _refreshing: Promise<any> | null = null
let _expiredDispatched = false

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config
    // Impersonated requests must never trigger the admin-cookie refresh or
    // wipe admin claims: an expired view-as token just ends the impersonation.
    if (err.response?.status === 401 && (original as any)?._impersonated) {
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('impersonation:expired'))
      return Promise.reject(err)
    }
    if (
      err.response?.status === 401 &&
      !original._retry &&
      !original.url?.includes('/auth/refresh') &&
      !original.url?.includes('/auth/login')
    ) {
      original._retry = true
      // Refresh uses HttpOnly cookie automatically via withCredentials
      try {
        if (!_refreshing) {
          _refreshing = axios
            .post(`${BASE}/auth/refresh`, {}, { withCredentials: true })
            .finally(() => { _refreshing = null })
        }
        await _refreshing
        // Cookies are refreshed by backend, just retry original request
        return api(original)
      } catch {
        // Soft clear: keep HttpOnly cookies for self-healing
        clearAuthTokens({ revoke: false })
        if (!_expiredDispatched) {
          _expiredDispatched = true
          window.dispatchEvent(new CustomEvent('auth:expired'))
          setTimeout(() => { _expiredDispatched = false }, 1000)
        }
        // P1-9 — global 401 UX: the refresh failed so the session is truly
        // dead. Toast + redirect to login (non-login routes only). The 2FA
        // verify flow is untouched: it handles its own 401 expired banner.
        if (typeof window !== 'undefined') {
          const path = window.location.pathname || ''
          const url = String(original.url || '')
          const isAuthFlow =
            path.startsWith('/login') ||
            path.startsWith('/auth/') ||
            path.startsWith('/forum/auth') ||
            url.includes('/auth/2fa') ||
            url.includes('/auth/login')
          if (!isAuthFlow && !path.startsWith('/login')) {
            try {
              window.dispatchEvent(new CustomEvent('app:toast', {
                detail: { type: 'error', message: 'Session expired, please sign in' },
              }))
            } catch {}
            try { sessionStorage.setItem('post_login_notice', 'Session expired, please sign in') } catch {}
            window.location.assign(`/login?next=${encodeURIComponent(path + window.location.search)}`)
          }
        }
      }
    }
    if (err.response?.status === 403) clearStaffClaims()
    return Promise.reject(err)
  }
)

export default api

// ── CDN config — read from env var, no HTTP call ────────────────────────────
// Cloud name is set in Vercel → Project Settings → Environment Variables.
// NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME  (client-visible)
// CLOUDINARY_CLOUD_NAME              (server-side route.ts)
interface CdnProxyConfig {
  provider?: string
  cloudinaryCloudName?: string
  customDomain?: string
}

const _cdnCfg: CdnProxyConfig = {
  provider: 'cloudinary',
  cloudinaryCloudName:
    (process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? '').trim() || undefined,
}

/** Returns the CDN proxy config derived from environment variables. */
export function getCdnConfig(): CdnProxyConfig { return _cdnCfg }

/** No-op — CDN proxy config is derived from env vars (NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME).
 * DB-backed provider creds are used server-side for uploads; cdnUrl() rewriting
 * will pick up a new cloud name only after redeploy. Dispatch an event so
 * MediaLibrary can re-render if needed. */
export function refreshCdnConfig(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('cdn-config-updated'))
}

/**
 * cdnUrl — rewrites a Cloudinary URL to go through the built-in Next.js CDN proxy.
 *
 * The proxy lives behind /cdn/[...path], which rewrites to the built-in
 * app/api/cdn/[...path]/route.ts without being forwarded to FastAPI.
 * It fetches from Cloudinary server-side, so the browser never hits res.cloudinary.com
 * directly — all media flows through your own domain with long-lived caching.
 *
 * Cloudinary URL:  https://res.cloudinary.com/<cloud>/image/upload/<path>
 * Proxied URL:     /cdn/image/upload/<path>   (relative — works on any domain)
 *
 * Falls back to the original Cloudinary URL if no cloud is configured.
 */
export function cdnUrl(url: string): string {
  if (!url) return ''
  // Already proxied
  if (url.startsWith('/cdn/')) return url
  if (url.startsWith('/api/cdn/')) return url.replace(/^\/api\/cdn/, '/cdn')
  // Rewrite res.cloudinary.com URLs to the local proxy
  const match = url.match(/https?:\/\/res\.cloudinary\.com\/[^/]+(\/.+)/)
  if (match) return `/cdn${match[1]}`
  return url
}

/** True when a URL's hostname is exactly (or a subdomain of) res.cloudinary.com. */
function isCloudinaryHost(value: string): boolean {
  try {
    const host = new URL(value).hostname.toLowerCase()
    return host === 'res.cloudinary.com' || host.endsWith('.res.cloudinary.com')
  } catch {
    return false
  }
}

export function mediaUrl(path: string): string {
  if (!path) return ''
  // Absolute Cloudinary URL — rewrite through CDN if custom domain is set
  if (isCloudinaryHost(path)) return cdnUrl(path)
  // Already absolute (other provider) — return as-is
  if (path.startsWith('http')) return path
  // Relative paths stay relative so the browser goes through the Next.js
  // proxy (/api/* → backend, /cdn/* → CDN route) instead of hitting the
  // backend origin directly (CORS/session bypass). Keep signature.
  if (path.startsWith('/api/') || path.startsWith('/cdn/')) return path
  if (path.startsWith('/')) return `/api${path}`
  return `/api/${path}`
}

/** Get role from localStorage (set by /auth/verify) */
export function getRole(): string | null {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('aifazi_effective_role')
  }
  return null
}

/** Get username from localStorage (set by /auth/verify) */
export function getUsername(): string | null {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('aifazi_username')
  }
  return null
}

/** Get stored permissions from localStorage */
export function getStoredPermissions(): Record<string, string[]> {
  if (typeof window === 'undefined') return {}
  try { return JSON.parse(localStorage.getItem('aifazi_permissions') || '{}') || {} } catch { return {} }
}

/** Store role, username, permissions from /auth/verify response */
export function setEffectiveAccess(user: any) {
  if (typeof window === 'undefined' || !user) return
  if (user.role) localStorage.setItem('aifazi_effective_role', user.role)
  if (user.username) localStorage.setItem('aifazi_username', user.username)
  if (user.permissions || user.module_permissions) localStorage.setItem('aifazi_permissions', JSON.stringify(user.permissions || user.module_permissions || {}))
}

/** Check if user has permission for module/action */
export function hasPermission(module: string, action = 'view') {
  const role = getRole()
  if (role === 'admin') return true
  const perms = getStoredPermissions()
  const actions = new Set([...(perms[module] || []), ...(perms['*'] || [])])
  return actions.has('manage') || actions.has(action)
}

/** Role check helpers */
export function isAdmin()        { return getRole() === 'admin' }
export function isModerator()    { return getRole() === 'moderator' }
export function isEditor()       { return getRole() === 'editor' }
export function isChatUser()     { return getRole() === 'chat' }
export function isUser()         { return getRole() === 'user' }
export function canEdit()        { return ['admin', 'editor'].includes(getRole() || '') || hasPermission('content.pages', 'edit') }
export function canModerate()    { return ['admin', 'moderator'].includes(getRole() || '') || hasPermission('community.forum', 'manage') }
export function hasStaffAccess() { return ['admin', 'moderator', 'editor', 'chat'].includes(getRole() || '') || Object.keys(getStoredPermissions()).length > 0 }

/** Server-verified staff flag (P1-9 hardening).
 *
 * `hasStaffAccess()` alone reads client-editable localStorage. Staff UI must
 * additionally require this sessionStorage flag, which is set ONLY after a
 * server round-trip proves staff access (ensureAdminGate success or a
 * staff-role /auth/verify response) and cleared on logout/403. An attacker
 * editing localStorage in DevTools still cannot set this without passing the
 * server gate in the same tab session... (sessionStorage is tab-scoped and
 * the flag is only written on verified success).
 */
const STAFF_VERIFIED_KEY = 'aifazi_staff_verified'

export function isStaffVerified(): boolean {
  if (typeof window === 'undefined') return false
  try { return sessionStorage.getItem(STAFF_VERIFIED_KEY) === '1' } catch { return false }
}

export function markStaffVerified(): void {
  if (typeof window === 'undefined') return
  try { sessionStorage.setItem(STAFF_VERIFIED_KEY, '1') } catch {}
}

export function clearStaffVerified(): void {
  if (typeof window === 'undefined') return
  try { sessionStorage.removeItem(STAFF_VERIFIED_KEY) } catch {}
}

export async function ensureAdminGate(): Promise<boolean> {
  if (typeof window === 'undefined') return false

  const storedTokens = _memToken ? [_memToken] : []

  // H4 — the backend now accepts the HttpOnly auth_token cookie, so a plain
  // credentialed call works for cookie sessions too (no token needed).
  for (const token of storedTokens) {
    try {
      const res = await fetch('/api/auth/admin-gate-token', {
        method: 'GET',
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      if (!res.ok) continue
      markStaffVerified()
      return true
    } catch {}
  }

  // P1-4 — ALWAYS attempt a cookie-only fetch before returning false, even
  // when an in-memory token exists but was rejected above (the token may be
  // stale while the HttpOnly cookie session is still valid).
  try {
    const res = await fetch('/api/auth/admin-gate-token', {
      method: 'GET',
      credentials: 'include',
    })
    if (res.ok) markStaffVerified()
    return res.ok
  } catch {
    return false
  }
}

export function clearAuthTokens(opts?: { revoke?: boolean }) {
  if (typeof window === 'undefined') return
  _memToken = null
  clearStaffVerified()
  localStorage.removeItem('aifazi_effective_role')
  localStorage.removeItem('aifazi_permissions')
  localStorage.removeItem('aifazi_username')
  // revoke (default) also calls /auth/logout, which deletes the HttpOnly cookies
  // AND nulls the server-side refresh token. For a failed background refresh this
  // is destructive: a transient failure (network blip, cross-tab rotation race)
  // would permanently kill a still-valid session. Pass { revoke: false } there so
  // the cookies survive and the next hydrate self-heals via /auth/me.
  const done = () => window.dispatchEvent(new Event('auth-change'))
  if (opts?.revoke !== false) {
    // Await revocation BEFORE notifying: listeners re-hydrate on auth-change,
    // and must never observe (or act on) a session the server still honors.
    fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
    })
      .catch(() => {})
      .finally(done)
  } else {
    done()
  }
}

/** Drop cached staff claims without touching the session.

 * Called on HTTP 403: a demoted/revoked staffer keeps a stale
 * `aifazi_effective_role` in localStorage (cleared otherwise only at
 * logout), which gates staff UI. The backend remains the real enforcer;
 * this just stops the UI from offering actions that will 403.
 */
export function clearStaffClaims() {
  if (typeof window === 'undefined') return
  localStorage.removeItem('aifazi_effective_role')
  localStorage.removeItem('aifazi_permissions')
  clearStaffVerified()
  window.dispatchEvent(new Event('auth-change'))
}

/** Save access token in memory. Backend sets HttpOnly cookies on login/refresh. */
export function saveTokens({ token, refreshToken: _ignored }: { token?: string; refreshToken?: string }) {
  setAccessToken(token ?? null)
}

// ── User impersonation ("view as") ──────────────────────────────────────────
// The impersonated token lives in memory ONLY (like the access token) and is
// NEVER written to cookies/storage — saveTokens() only touches _memToken and
// HttpOnly cookies are JS-invisible, so the admin session survives untouched
// and clearing this token instantly restores it (no re-login needed).
let _impersonateToken: string | null = null
let _impersonateUsername: string | null = null

/** Set (or clear) the in-memory impersonation token. Admin token untouched. */
export function setImpersonationToken(token: string | null, username?: string | null) {
  _impersonateToken = token
  _impersonateUsername = token ? (username ?? null) : null
  // P0 — fan out so the global impersonation banner (providers.tsx) stays in
  // sync no matter which route started/ended the view-as session.
  if (typeof window !== 'undefined') {
    try { window.dispatchEvent(new CustomEvent('impersonation:changed')) } catch {}
  }
}

/** Get the current impersonation token from memory. */
export function getImpersonationToken(): string | null {
  return _impersonateToken
}

/** Username being impersonated (for the banner), or null. */
export function getImpersonationUsername(): string | null {
  return _impersonateUsername
}

/** True while a view-as session is active. */
export function isImpersonating(): boolean {
  return !!_impersonateToken
}
