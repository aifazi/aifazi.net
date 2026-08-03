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

/** Set (or clear) the in-memory access token. Replaces localStorage persistence. */
export function setAccessToken(token: string | null) {
  _memToken = token
}

/** Remove the legacy localStorage/sessionStorage token keys after the cookie
 *  session has been proven to work. Keeps role/permission caches. */
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
  const token = getAuthToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  config.withCredentials = true
  return config
})

let _refreshing: Promise<any> | null = null
let _expiredDispatched = false

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config
    if (
      err.response?.status === 401 &&
      !original._retry &&
      !original.url?.includes('/auth/refresh') &&
      !original.url?.includes('/auth/login')
    ) {
      original._retry = true
      // #2 — refresh_token is now an HttpOnly cookie sent automatically by the browser.
      // We no longer read it from localStorage. The POST body is empty; the backend
      // reads the cookie from the request headers directly.
      try {
        if (!_refreshing) {
          _refreshing = axios
            .post(`${BASE}/auth/refresh`, {}, { withCredentials: true })
            .finally(() => { _refreshing = null })
        }
        const { data } = await _refreshing
        // H4 — keep the refreshed token in memory only (never localStorage).
        setAccessToken(data.token)
        original.headers.Authorization = `Bearer ${data.token}`
        return api(original)
      } catch {
        // Soft clear: keep the HttpOnly cookies + server session so a transient
        // refresh failure (network blip, cross-tab rotation race) self-heals on
        // the next hydrate instead of permanently logging the user out.
        clearAuthTokens({ revoke: false })
        if (!_expiredDispatched) {
          _expiredDispatched = true
          window.dispatchEvent(new CustomEvent('auth:expired'))
          setTimeout(() => { _expiredDispatched = false }, 1000)
        }
      }
    }
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

/** No-op — config is derived from env vars, not fetched at runtime. */
export function refreshCdnConfig(): void {}

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

export function mediaUrl(path: string): string {
  if (!path) return ''
  // Absolute Cloudinary URL — rewrite through CDN if custom domain is set
  if (path.includes('res.cloudinary.com')) return cdnUrl(path)
  // Already absolute (other provider) — return as-is
  if (path.startsWith('http')) return path
  return `${process.env.NEXT_PUBLIC_API_URL || ''}${path}`
}

function decodeToken(token: string): Record<string, any> | null {
  try { return JSON.parse(atob(token.split('.')[1])) } catch { return null }
}

export function getAuthToken(): string | null {
  // H4 — memory-only. No localStorage/sessionStorage reads. Session persistence
  // across reloads is handled by the HttpOnly refresh_token cookie via the
  // 401-refresh interceptor and ForumContext cookie re-hydration.
  return _memToken
}

/** @deprecated #2 — refresh_token is now an HttpOnly cookie set by the backend.
 *  Returns null — the browser sends the cookie automatically. */
export function getRefreshToken(): string | null {
  return null
}

export function getRole(): string | null {
  if (typeof window !== 'undefined') {
    const effective = localStorage.getItem('aifazi_effective_role')
    if (effective) return effective
  }
  const token = getAuthToken()
  if (!token) return null
  return decodeToken(token)?.role || null
}

export function getUsername(): string | null {
  const token = getAuthToken()
  if (!token) return null
  return decodeToken(token)?.username || null
}

export function getStoredPermissions(): Record<string, string[]> {
  if (typeof window === 'undefined') return {}
  try { return JSON.parse(localStorage.getItem('aifazi_permissions') || '{}') || {} } catch { return {} }
}

export function setEffectiveAccess(user: any) {
  if (typeof window === 'undefined' || !user) return
  if (user.role) localStorage.setItem('aifazi_effective_role', user.role)
  if (user.permissions || user.module_permissions) localStorage.setItem('aifazi_permissions', JSON.stringify(user.permissions || user.module_permissions || {}))
}

export function hasPermission(module: string, action = 'view') {
  const role = getRole()
  if (role === 'admin') return true
  const perms = getStoredPermissions()
  const actions = new Set([...(perms[module] || []), ...(perms['*'] || [])])
  return actions.has('manage') || actions.has(action)
}

export function isAdmin()        { return getRole() === 'admin' }
export function isModerator()    { return getRole() === 'moderator' }
export function isEditor()       { return getRole() === 'editor' }
export function isChatUser()     { return getRole() === 'chat' }
export function isUser()         { return getRole() === 'user' }
export function canEdit()        { return ['admin', 'editor'].includes(getRole() || '') || hasPermission('content.pages', 'edit') }
export function canModerate()    { return ['admin', 'moderator'].includes(getRole() || '') || hasPermission('community.forum', 'manage') }
export function hasStaffAccess() { return ['admin', 'moderator', 'editor', 'chat'].includes(getRole() || '') || Object.keys(getStoredPermissions()).length > 0 }

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
      return true
    } catch {}
  }
  if (storedTokens.length > 0) return false

  try {
    const res = await fetch('/api/auth/admin-gate-token', {
      method: 'GET',
      credentials: 'include',
    })
    return res.ok
  } catch {
    return false
  }
}

export function clearAuthTokens(opts?: { revoke?: boolean }) {
  if (typeof window === 'undefined') return
  _memToken = null
  localStorage.removeItem('auth_token')
  localStorage.removeItem('forum_token')
  localStorage.removeItem('admin_token')
  localStorage.removeItem('staff_token')
  localStorage.removeItem('refresh_token')
  sessionStorage.removeItem('forum_token')
  sessionStorage.removeItem('admin_token')
  sessionStorage.removeItem('staff_token')
  localStorage.removeItem('aifazi_effective_role')
  localStorage.removeItem('aifazi_permissions')
  // revoke (default) also calls /auth/logout, which deletes the HttpOnly cookies
  // AND nulls the server-side refresh token. For a failed background refresh this
  // is destructive: a transient failure (network blip, cross-tab rotation race)
  // would permanently kill a still-valid session. Pass { revoke: false } there so
  // the cookies survive and the next hydrate self-heals via /auth/me.
  if (opts?.revoke !== false) {
    void fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {})
  }
  window.dispatchEvent(new Event('auth-change'))
}

/** H4 — save the access token in memory only. The backend sets the HttpOnly
 *  refresh_token/auth_token cookies on login/refresh, so nothing sensitive is
 *  written to localStorage. The refreshToken parameter is intentionally ignored. */
export function saveTokens({ token, refreshToken: _ignored }: { token?: string; refreshToken?: string }) {
  setAccessToken(token ?? null)
}
