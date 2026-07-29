'use client'
import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import api from '@/lib/api'

const ForumContext = createContext({
  user: null,
  loading: true,
  profileLoading: false,
  authReady: false,
  login: () => {},
  logout: () => {},
  refreshUser: async () => {},
})

const STAFF_ROLES = new Set(['admin', 'moderator', 'editor', 'chat'])
const USER_CACHE_KEY = 'aifazi_forum_user_cache_v2'
const USER_CACHE_TTL = 45_000

function decodeToken(token) {
  try {
    const payload = token.split('.')[1]
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')))
  } catch {
    return null
  }
}

function getStoredToken() {
  if (typeof window === 'undefined') return null
  const token = localStorage.getItem('auth_token')
             || sessionStorage.getItem('forum_token')
             || sessionStorage.getItem('admin_token')
             || sessionStorage.getItem('staff_token')
             || localStorage.getItem('forum_token')
             || localStorage.getItem('admin_token')
             || localStorage.getItem('staff_token')
  if (!token) return null
  if (!localStorage.getItem('auth_token')) localStorage.setItem('auth_token', token)
  sessionStorage.removeItem('forum_token')
  sessionStorage.removeItem('admin_token')
  sessionStorage.removeItem('staff_token')
  localStorage.removeItem('forum_token')
  localStorage.removeItem('admin_token')
  localStorage.removeItem('staff_token')
  return token
}

function userFromToken(token) {
  const decoded = decodeToken(token)
  if (!decoded?.username || !decoded?.role) return null
  const isStaff = STAFF_ROLES.has(decoded.role)
  return {
    _id: decoded.id || null,
    id: decoded.id || null,
    username: decoded.username,
    role: decoded.role,
    avatar: '',
    _optimistic: true,
    _staff: isStaff,
    staff_account: isStaff,
    admin_access: decoded.role === 'admin',
  }
}

function readCachedUser(token) {
  try {
    const cached = JSON.parse(sessionStorage.getItem(USER_CACHE_KEY) || 'null')
    if (cached?.token === token && cached?.user && Date.now() - cached.ts < USER_CACHE_TTL) return cached.user
  } catch {}
  return null
}

function writeCachedUser(token, user) {
  try { sessionStorage.setItem(USER_CACHE_KEY, JSON.stringify({ token, user, ts: Date.now() })) } catch {}
}

function clearCachedUser() {
  try { sessionStorage.removeItem(USER_CACHE_KEY) } catch {}
}

export function ForumProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [profileLoading, setProfileLoading] = useState(false)
  const hydrateRef = useRef(null)

  // Render quickly from token/cache, then verify with /auth/verify.
  const hydrate = useCallback(async () => {
    const token = getStoredToken()

    if (!token) {
      clearCachedUser()
      setUser(null)
      setLoading(false)
      setProfileLoading(false)
      return
    }

    const cached = readCachedUser(token)
    const optimistic = cached || userFromToken(token)
    if (optimistic) {
      setUser(optimistic)
      setLoading(false)
    }

    if (hydrateRef.current?.token === token) return hydrateRef.current.promise

    setProfileLoading(true)
    const promise = api.get('/auth/me', {
      headers: { Authorization: `Bearer ${token}` }
    }).then(r => {
      setUser(r.data)
      writeCachedUser(token, r.data)
      setLoading(false)
      return r.data
    }).catch(err => {
      const status = err?.response?.status
      if (status === 401 || status === 403 || !optimistic) {
        localStorage.removeItem('auth_token')
        clearCachedUser()
        setUser(null)
      }
      setLoading(false)
    }).finally(() => {
      setProfileLoading(false)
      hydrateRef.current = null
    })
    hydrateRef.current = { token, promise }
    await promise
  }, [])

  useEffect(() => { hydrate() }, [hydrate])

  useEffect(() => {
    const onAuthChange = () => hydrate()
    window.addEventListener('auth-change', onAuthChange)
    window.addEventListener('storage', onAuthChange)
    window.addEventListener('auth:expired', onAuthChange)
    return () => {
      window.removeEventListener('auth-change', onAuthChange)
      window.removeEventListener('storage', onAuthChange)
      window.removeEventListener('auth:expired', onAuthChange)
    }
  }, [hydrate])

  const login = (token, userData) => {
    localStorage.setItem('auth_token', token)
    sessionStorage.removeItem('forum_token')
    sessionStorage.removeItem('admin_token')
    sessionStorage.removeItem('staff_token')
    localStorage.removeItem('forum_token')
    localStorage.removeItem('admin_token')
    localStorage.removeItem('staff_token')
    clearCachedUser()
    setUser(userData || userFromToken(token))
    setLoading(false)
    window.dispatchEvent(new Event('auth-change'))
  }

  const logout = () => {
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
    clearCachedUser()
    window.dispatchEvent(new Event('auth-change'))
    setUser(null)
    setLoading(false)
    setProfileLoading(false)
  }

  const refreshUser = async () => {
    const token = getStoredToken()
    if (!token) return
    setProfileLoading(true)
    try {
      const r = await api.get('/auth/me')
      setUser(r.data)
      writeCachedUser(token, r.data)
    } catch (err) {
      if ([401, 403].includes(err?.response?.status)) logout()
    } finally {
      setProfileLoading(false)
    }
  }

  return (
    <ForumContext.Provider value={{ user, loading, profileLoading, authReady: !loading, login, logout, refreshUser }}>
      {children}
    </ForumContext.Provider>
  )
}

export const useForum = () => useContext(ForumContext)
