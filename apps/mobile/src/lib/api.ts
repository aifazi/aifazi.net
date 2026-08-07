import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios'
import * as SecureStore from 'expo-secure-store'

export const API_BASE = 'https://api.aifazi.net'

const TOKEN_KEY = 'aifazi_access_token'
const REFRESH_KEY = 'aifazi_refresh_token'

let accessToken: string | null = null
let refreshPromise: Promise<string | null> | null = null

export const api = axios.create({ baseURL: `${API_BASE}/api`, timeout: 15000 })

api.interceptors.request.use(async (config) => {
  const token = accessToken ?? (await SecureStore.getItemAsync(TOKEN_KEY))
  if (token) config.headers.Authorization = `Bearer ${token}`
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
        accessToken = token
        await SecureStore.setItemAsync(TOKEN_KEY, token)
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
  accessToken = access
  await SecureStore.setItemAsync(TOKEN_KEY, access)
  if (refresh) await SecureStore.setItemAsync(REFRESH_KEY, refresh)
}

export async function clearAuthTokens() {
  accessToken = null
  await SecureStore.deleteItemAsync(TOKEN_KEY)
  await SecureStore.deleteItemAsync(REFRESH_KEY)
}

export async function getAccessToken() {
  return accessToken ?? (await SecureStore.getItemAsync(TOKEN_KEY))
}

export async function getRefreshToken() {
  return SecureStore.getItemAsync(REFRESH_KEY)
}
