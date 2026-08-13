import { createContext, useContext, useEffect, useCallback, useState, ReactNode } from 'react'
import { api, setAuthTokens, clearAuthTokens, ensureSession, onAuthCleared } from './api'
import { loginWithOAuth as oauthLogin, OAuthProvider } from './oauth'

export interface AuthUser {
  id?: string
  _id?: string
  username: string
  email?: string
  role?: string
  avatar?: string
  bio?: string
  created_at?: string
  createdAt?: string
  last_seen?: string
  lastSeen?: string
  discord_username?: string
  steam_username?: string
  github_username?: string
  email_verified?: boolean
}

export interface UploadAvatarFile {
  uri: string
  name?: string
  type?: string
}

export interface LoginResult {
  requires2fa: boolean
  partialToken?: string
  username?: string
  /** true when the user closed the native auth browser without completing. */
  cancelled?: boolean
}

interface AuthCtx {
  user: AuthUser | null
  loading: boolean
  isAuthed: boolean
  login: (identifier: string, password: string) => Promise<LoginResult>
  loginWithOAuth: (provider: OAuthProvider) => Promise<LoginResult>
  verify2FA: (partialToken: string, code: string) => Promise<void>
  register: (username: string, email: string, password: string) => Promise<string>
  logout: () => Promise<void>
  refresh: () => Promise<void>
  updateProfile: (patch: { username?: string; bio?: string; avatar?: string; email?: string }) => Promise<void>
  uploadAvatar: (file: UploadAvatarFile) => Promise<string>
  changePassword: (currentPassword: string, newPassword: string, code?: string) => Promise<void>
  deleteAccount: (password: string) => Promise<void>
  listSessions: () => Promise<any[]>
  revokeSession: (id: string) => Promise<void>
  revokeAllSessions: () => Promise<void>
  get2FAStatus: () => Promise<boolean>
  setup2FA: () => Promise<{ secret: string; otpauth_uri: string; qr_image?: string }>
  confirm2FA: (code: string) => Promise<string[]>
  disable2FA: (password: string, code?: string) => Promise<void>
  regenerateRecoveryCodes: (password: string, code: string) => Promise<string[]>
}

const Ctx = createContext<AuthCtx>({
  user: null,
  loading: true,
  isAuthed: false,
  login: async () => ({ requires2fa: false }),
  loginWithOAuth: async () => ({ requires2fa: false }),
  verify2FA: async () => {},
  register: async () => '',
  logout: async () => {},
  refresh: async () => {},
  updateProfile: async () => {},
  uploadAvatar: async () => '',
  changePassword: async () => {},
  deleteAccount: async () => {},
  listSessions: async () => [],
  revokeSession: async () => {},
  revokeAllSessions: async () => {},
  get2FAStatus: async () => false,
  setup2FA: async () => ({ secret: '', otpauth_uri: '' }),
  confirm2FA: async () => [],
  disable2FA: async () => {},
  regenerateRecoveryCodes: async () => [],
})

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  banned: 'This account is banned.',
  state: 'Your sign-in link expired. Please try again.',
  identity_locked: 'Your player identity is active. Contact an admin to change it.',
  duplicate: 'This account is already linked to another user.',
  email_unverified: 'A matching account exists but its email is not verified.',
  missing: 'Account not found.',
  cfg: 'Sign-in is temporarily unavailable. Please try again.',
  db: 'Something went wrong. Please try again.',
  signin_failed: 'Could not reach the sign-in service. Please try again.',
  invalid_redirect: 'Sign-in returned an unexpected result. Please try again.',
  unknown: 'Sign-in failed. Please try again.',
  '1': 'The sign-in service rejected the request. Please try again.',
  '2': 'Could not reach the sign-in service. Please try again.',
  '3': 'Could not load your account. Please try again.',
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      // H4 — cold start: access token is memory-only. ensureSession() reissues
      // one from the SecureStore refresh token when present; otherwise logged out.
      const tok = await ensureSession()
      if (!tok) {
        setUser(null)
        return
      }
      const res = await api.get('/auth/me')
      const data = res.data
      setUser((data?.user ?? data) as AuthUser)
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    // If the token store is cleared while we're "logged in" (401 → refresh failed
    // → interceptor cleared storage), drop the stale user so screens route to login.
    return onAuthCleared(() => setUser(null))
  }, [])

  const login = useCallback(
    async (identifier: string, password: string) => {
      const res = await api.post('/auth/login', { username: identifier, password })
      const data = res.data ?? {}
      // 2FA users get a challenge instead of a token — surface it so the UI can
      // show a code step instead of failing with "no token returned".
      if (data.requires_2fa) {
        return {
          requires2fa: true,
          partialToken: data.partial_token as string,
          username: data?.user?.username || identifier,
        }
      }
      const { token, refreshToken } = data
      if (!token) throw new Error('Login failed — no token returned')
      await setAuthTokens(token, refreshToken ?? '')
      await refresh()
      return { requires2fa: false }
    },
    [refresh],
  )

  const loginWithOAuth = useCallback(
    async (provider: OAuthProvider): Promise<LoginResult> => {
      const res = await oauthLogin(provider)
      if (!res.ok) {
        if (res.cancelled) return { requires2fa: false, cancelled: true }
        throw new Error(OAUTH_ERROR_MESSAGES[res.error ?? 'unknown'] ?? 'Sign-in failed. Please try again.')
      }
      if (res.requires2fa) {
        return { requires2fa: true, partialToken: res.partialToken, username: res.username }
      }
      await setAuthTokens(res.token, res.refreshToken)
      await refresh()
      return { requires2fa: false }
    },
    [refresh],
  )

  const verify2FA = useCallback(
    async (partialToken: string, code: string) => {
      const res = await api.post('/auth/2fa/verify', {
        partial_token: partialToken,
        code: code.replace(/[\s-]/g, ''),
      })
      const { token, refreshToken } = res.data ?? {}
      if (!token) throw new Error('2FA verification failed — no token returned')
      await setAuthTokens(token, refreshToken ?? '')
      await refresh()
    },
    [refresh],
  )

  const register = useCallback(async (username: string, email: string, password: string) => {
    const res = await api.post('/auth/register', { username, email, password })
    return (res.data?.message as string) || 'Registered — check your email to verify your account.'
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout')
    } catch {}
    await clearAuthTokens()
    setUser(null)
  }, [])

  const updateProfile = useCallback(
    async (patch: { username?: string; bio?: string; avatar?: string; email?: string }) => {
      const res = await api.put('/auth/profile', patch)
      const data = res.data
      setUser((data?.user ?? data) as AuthUser)
    },
    [],
  )

  const uploadAvatar = useCallback(
    async (file: UploadAvatarFile) => {
      const fd = new FormData()
      fd.append('file', { uri: file.uri, name: file.name || 'avatar.jpg', type: file.type || 'image/jpeg' } as any)
      const res = await api.post('/auth/avatar', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      const url = res.data?.url
      if (!url) throw new Error('Upload failed — no URL returned')
      setUser((u) => (u ? { ...u, avatar: url } : u))
      return url
    },
    [],
  )

  const changePassword = useCallback(async (currentPassword: string, newPassword: string, code?: string) => {
    await api.post('/auth/change-password', { current_password: currentPassword, new_password: newPassword, code: code || '' })
  }, [])

  const deleteAccount = useCallback(async (password: string) => {
    await api.delete('/auth/account', { data: { password } })
    await clearAuthTokens()
    setUser(null)
  }, [])

  const listSessions = useCallback(async () => {
    const res = await api.get('/auth/sessions')
    const data = res.data
    return Array.isArray(data) ? data : Array.isArray(data?.sessions) ? data.sessions : []
  }, [])

  const revokeSession = useCallback(async (id: string) => {
    await api.delete(`/auth/sessions/${id}`)
  }, [])

  const revokeAllSessions = useCallback(async () => {
    await api.delete('/auth/sessions')
  }, [])

  const get2FAStatus = useCallback(async () => {
    const res = await api.get('/auth/2fa/status')
    return !!res.data?.enabled
  }, [])

  const setup2FA = useCallback(async () => {
    const res = await api.post('/auth/2fa/setup')
    return res.data
  }, [])

  const confirm2FA = useCallback(async (code: string) => {
    const res = await api.post('/auth/2fa/confirm', { code: code.replace(/\s/g, '') })
    return (res.data?.recovery_codes || []) as string[]
  }, [])

  const disable2FA = useCallback(async (password: string, code?: string) => {
    await api.post('/auth/2fa/disable', { password, code: code ? code.replace(/[\s-]/g, '') : undefined })
  }, [])

  const regenerateRecoveryCodes = useCallback(async (password: string, code: string) => {
    const res = await api.post('/auth/2fa/recovery-codes', { password, code: code.replace(/[\s-]/g, '') })
    return (res.data?.recovery_codes || []) as string[]
  }, [])

  return (
    <Ctx.Provider
      value={{
        user,
        loading,
        isAuthed: !!user,
        login,
        loginWithOAuth,
        verify2FA,
        register,
        logout,
        refresh,
        updateProfile,
        uploadAvatar,
        changePassword,
        deleteAccount,
        listSessions,
        revokeSession,
        revokeAllSessions,
        get2FAStatus,
        setup2FA,
        confirm2FA,
        disable2FA,
        regenerateRecoveryCodes,
      }}
    >
      {children}
    </Ctx.Provider>
  )
}

export const useAuth = () => useContext(Ctx)
