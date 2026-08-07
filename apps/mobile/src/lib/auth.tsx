import { createContext, useContext, useEffect, useCallback, useState, ReactNode } from 'react'
import { api, setAuthTokens, clearAuthTokens, getAccessToken } from './api'

export interface AuthUser {
  id?: string
  username: string
  email?: string
  role?: string
  avatar?: string
  bio?: string
}

interface AuthCtx {
  user: AuthUser | null
  loading: boolean
  isAuthed: boolean
  login: (identifier: string, password: string) => Promise<void>
  register: (username: string, email: string, password: string) => Promise<string>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

const Ctx = createContext<AuthCtx>({
  user: null,
  loading: true,
  isAuthed: false,
  login: async () => {},
  register: async () => '',
  logout: async () => {},
  refresh: async () => {},
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

  return (
    <Ctx.Provider value={{ user, loading, isAuthed: !!user, login, register, logout, refresh }}>
      {children}
    </Ctx.Provider>
  )
}

export const useAuth = () => useContext(Ctx)
