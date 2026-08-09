import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios'
import * as SecureStore from 'expo-secure-store'

export const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'https://api.aifazi.net'

// H4 — access token lives in MEMORY ONLY. On app restart it is gone; the refresh
// token (stored in SecureStore) reissues it automatically on the first 401.
// Persisting the access token to disk widens the exposure window if the device
// is compromised. The refresh token is the only long-lived secret persisted.
const TOKEN_KEY = 'aifazi_access_token' // retained only for legacy cleanup
const REFRESH_KEY = 'aifazi_refresh_token'

let accessToken: string | null = null
let refreshPromise: Promise<string | null> | null = null

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

async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise
  refreshPromise = (async () => {
    try {
      const refresh = await SecureStore.getItemAsync(REFRESH_KEY)
      if (!refresh) return null
      const res = await axios.post(`${API_BASE}/api/auth/refresh`, { refreshToken: refresh }, { timeout: 15000 })
      const { token, refreshToken } = res.data ?? {}
      if (token) {
        accessToken = token // memory only (H4)
        if (refreshToken) await SecureStore.setItemAsync(REFRESH_KEY, refreshToken)
        return token
      }
      return null
    } catch {
      return null
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
      const newToken = await refreshAccessToken()
      if (newToken) {
        original.headers = original.headers ?? {}
        original.headers.Authorization = `Bearer ${newToken}`
        return api(original)
      }
      await clearAuthTokens()
    }
    return Promise.reject(error)
  },
)

export async function setAuthTokens(access: string, refresh: string) {
  // Access token stays in memory only — never written to disk (H4).
  accessToken = access
  if (refresh) await SecureStore.setItemAsync(REFRESH_KEY, refresh)
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
 * reissue an access token now and return it; otherwise return null (logged out).
 */
export async function ensureSession(): Promise<string | null> {
  if (accessToken) return accessToken
  const hasRefresh = await SecureStore.getItemAsync(REFRESH_KEY)
  if (!hasRefresh) return null
  return refreshAccessToken()
}
