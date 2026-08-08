import { createContext, useContext, useEffect, useCallback, useState, ReactNode } from 'react'
import { api, setAuthTokens, clearAuthTokens, getAccessToken } from './api'

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

interface AuthCtx {
  user: AuthUser | null
  loading: boolean
  isAuthed: boolean
  login: (identifier: string, password: string) => Promise<void>
  register: (username: string, email: string, password: string) => Promise<string>
  logout: () => Promise<void>
  refresh: () => Promise<void>
  updateProfile: (patch: { username?: string; bio?: string; avatar?: string; email?: string }) => Promise<void>
  uploadAvatar: (file: UploadAvatarFile) => Promise<string>
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>
  deleteAccount: (password: string) => Promise<void>
  listSessions: () => Promise<any[]>
  revokeSession: (id: string) => Promise<void>
  revokeAllSessions: () => Promise<void>
  get2FAStatus: () => Promise<boolean>
  setup2FA: () => Promise<{ secret: string; otpauth_uri: string; qr_image?: string }>
  confirm2FA: (code: string) => Promise<void>
  disable2FA: (password: string, code?: string) => Promise<void>
}

const Ctx = createContext<AuthCtx>({
  user: null,
  loading: true,
  isAuthed: false,
  login: async () => {},
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
  confirm2FA: async () => {},
  disable2FA: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const tok = await getAccessToken()
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

  const login = useCallback(
    async (identifier: string, password: string) => {
      const res = await api.post('/auth/login', { username: identifier, password })
      const { token, refreshToken } = res.data ?? {}
      if (!token) throw new Error('Login failed — no token returned')
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

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    await api.post('/auth/change-password', { current_password: currentPassword, new_password: newPassword })
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
    await api.post('/auth/2fa/confirm', { code: code.replace(/\s/g, '') })
  }, [])

  const disable2FA = useCallback(async (password: string, code?: string) => {
    await api.post('/auth/2fa/disable', { password, code: code ? code.replace(/\s/g, '') : undefined })
  }, [])

  return (
    <Ctx.Provider
      value={{
        user,
        loading,
        isAuthed: !!user,
        login,
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
      }}
    >
      {children}
    </Ctx.Provider>
  )
}

export const useAuth = () => useContext(Ctx)
