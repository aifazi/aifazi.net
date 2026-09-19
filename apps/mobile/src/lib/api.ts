import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios'
import * as SecureStore from 'expo-secure-store'
import { API_BASE } from './getApiBase'

export { API_BASE }

// TODO(transport-pinning): certificate pinning is NOT implemented. Plain TLS
// only — JS cannot truly pin (no access to the native TLS handshake), and no
// pinning mechanism exists in this project (no expo-network-security-config,
// OkHttp networkSecurityConfig, or TrustKit). A real fix needs a native
// config-plugin-provided pin set (prefer long-lived ISRG CA pins over leaf).
// The placeholder-pin stub (src/lib/cert-pinning.ts) was deleted; do not
// reintroduce placeholder pins.

// H4 — access token lives in MEMORY ONLY. On app restart it is gone; the refresh
// token (stored in SecureStore) reissues it automatically on the first 401.
// Persisting the access token to disk widens the exposure window if the device
// is compromised. The refresh token is the only long-lived secret persisted.
const TOKEN_KEY = 'aifazi_access_token' // retained only for legacy cleanup
const REFRESH_KEY = 'aifazi_refresh_token'

// Refresh tokens must not migrate to a new device via backup/restore and must
// be unavailable until the first unlock after boot.
const SECURE_STORE_OPTIONS = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
} as const

let accessToken: string | null = null
let refreshPromise: Promise<string> | null = null

/** Typed refresh failure: callers must distinguish revoked from network. */
export class RefreshFailedError extends Error {
  readonly kind: 'no-refresh' | 'revoked' | 'network'
  constructor(kind: 'no-refresh' | 'revoked' | 'network', message?: string) {
    super(message ?? `Token refresh failed (${kind})`)
    this.name = 'RefreshFailedError'
    this.kind = kind
  }
}

type AuthClearedListener = () => void
const authClearedListeners = new Set<AuthClearedListener>()

export function onAuthCleared(listener: AuthClearedListener): () => void {
  authClearedListeners.add(listener)
  return () => authClearedListeners.delete(listener)
}

function emitAuthCleared() {
  authClearedListeners.forEach((l) => l())
}

export const api = axios.create({ baseURL: `${API_BASE}/api`, timeout: 15000 })

api.interceptors.request.use(async (config) => {
  // Access token is memory-only (H4). If absent, attach nothing and let the
  // 401-refresh interceptor reissue via the SecureStore refresh token.
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`
  return config
})

interface RetriableConfig extends InternalAxiosRequestConfig {
  _retried?: boolean
}

async function refreshAccessToken(): Promise<string> {
  if (refreshPromise) return refreshPromise
  refreshPromise = (async () => {
    let refresh: string | null
    try {
      refresh = await SecureStore.getItemAsync(REFRESH_KEY)
    } catch {
      throw new RefreshFailedError('network', 'Could not read refresh token')
    }
    if (!refresh) throw new RefreshFailedError('no-refresh', 'No refresh token stored')
    // Refresh through the same axios instance config (baseURL/timeout) so
    // behavior matches every other call. The response interceptor below skips
    // /auth/refresh (isAuthCall), so this cannot recurse.
    try {
      const res = await api.post('/auth/refresh', { refreshToken: refresh })
      const { token, refreshToken } = res.data ?? {}
      if (!token) throw new RefreshFailedError('revoked', 'Refresh rejected by server')
      accessToken = token // memory only (H4)
      if (refreshToken) await SecureStore.setItemAsync(REFRESH_KEY, refreshToken, SECURE_STORE_OPTIONS)
      return token
    } catch (e) {
      if (e instanceof RefreshFailedError) throw e
      const status = axios.isAxiosError(e) ? e.response?.status : undefined
      // Distinct 401-on-refresh: the refresh token itself was rejected —
      // the session is revoked, not merely offline.
      if (status === 401) throw new RefreshFailedError('revoked', 'Refresh token revoked (401 on refresh)')
      throw new RefreshFailedError('network', 'Token refresh failed (network)')
    } finally {
      refreshPromise = null
    }
  })()
  return refreshPromise
}

api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const original = error.config as RetriableConfig | undefined
    const url = original?.url ?? ''
    const isAuthCall =
      url.includes('/auth/login') || url.includes('/auth/register') || url.includes('/auth/refresh')
    if (error.response?.status === 401 && original && !original._retried && !isAuthCall) {
      original._retried = true
      try {
        const newToken = await refreshAccessToken()
        original.headers = original.headers ?? {}
        original.headers.Authorization = `Bearer ${newToken}`
        return api(original)
      } catch (e) {
        // Log out ONLY when the session is actually revoked. Network errors
        // keep the session: surface the error so the UI can retry instead of
        // wiping stored credentials while offline.
        if (e instanceof RefreshFailedError && e.kind === 'revoked') {
          await clearAuthTokens()
        }
        return Promise.reject(e instanceof RefreshFailedError ? e : error)
      }
    }
    return Promise.reject(error)
  },
)

export async function setAuthTokens(access: string, refresh: string) {
  // Access token stays in memory only — never written to disk (H4).
  accessToken = access
  if (refresh) await SecureStore.setItemAsync(REFRESH_KEY, refresh, SECURE_STORE_OPTIONS)
  // Remove any legacy on-disk access token from an older app version.
  await SecureStore.deleteItemAsync(TOKEN_KEY)
}

export async function clearAuthTokens() {
  accessToken = null
  await SecureStore.deleteItemAsync(REFRESH_KEY)
  await SecureStore.deleteItemAsync(TOKEN_KEY)
  emitAuthCleared()
}

export async function getAccessToken(): Promise<string | null> {
  return accessToken
}

export async function getRefreshToken() {
  return SecureStore.getItemAsync(REFRESH_KEY)
}

/**
 * H4 — App-launch hydration. On cold start the access token is gone (memory
 * only), so /auth/me can't run yet. If a refresh token exists in SecureStore,
 * reissue an access token now and return it; return null when logged out
 * (no refresh token). Refresh failures propagate as RefreshFailedError
 * (revoked vs network) instead of collapsing to null.
 */
export async function ensureSession(): Promise<string | null> {
  if (accessToken) return accessToken
  let hasRefresh: string | null
  try {
    hasRefresh = await SecureStore.getItemAsync(REFRESH_KEY)
  } catch {
    throw new RefreshFailedError('network', 'Could not read refresh token')
  }
  if (!hasRefresh) return null
  return refreshAccessToken()
}
