'use client'
import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import api, { getAuthToken, setAccessToken, clearAuthTokens, clearLegacyTokens, setEffectiveAccess } from '@/lib/api'

/** @typedef {{ id?: string, _id?: string, username?: string, role?: string, email?: string, avatar?: string, banned?: boolean } | null} ForumUser */

const ForumContext = createContext({
  /** @type {ForumUser} */
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
  // H4 — memory-first, legacy localStorage keys honoured during transition.
  return getAuthToken()
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

function readCachedUser() {
  try {
    const cached = JSON.parse(sessionStorage.getItem(USER_CACHE_KEY) || 'null')
    if (cached?.user && Date.now() - cached.ts < USER_CACHE_TTL) return cached.user
  } catch {}
  return null
}

function writeCachedUser(user) {
  try { sessionStorage.setItem(USER_CACHE_KEY, JSON.stringify({ user, ts: Date.now() })) } catch {}
}

function clearCachedUser() {
  try { sessionStorage.removeItem(USER_CACHE_KEY) } catch {}
}

export function ForumProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [profileLoading, setProfileLoading] = useState(false)
  const hydrateRef = useRef(null)

  // Render quickly from token/cache, then verify.
  // H4 — cookie session first (HttpOnly auth_token). When the cookie works, the
  // in-memory access token is refilled from the refresh_token cookie and the
  // legacy localStorage tokens are removed. Pre-migration Bearer-only sessions
  // fall back to the stored token and are migrated to cookies via
  // /auth/session-migrate.
  const hydrate = useCallback(async () => {
    const token = getStoredToken()

    const cached = readCachedUser()
    const optimistic = cached || (token ? userFromToken(token) : null)
    if (optimistic) {
      setUser(optimistic)
      setLoading(false)
    }

    if (hydrateRef.current?.token === (token || '')) return hydrateRef.current.promise

    setProfileLoading(true)
    const promise = (async () => {
      // 1) Cookie session — no Authorization header, HttpOnly auth_token cookie.
      let cookieUser = null
      try {
        const r = await fetch('/api/auth/me', { credentials: 'include' })
        if (r.ok) cookieUser = await r.json()
      } catch {}

      if (cookieUser) {
        setUser(cookieUser)
        setEffectiveAccess(cookieUser)
        if (token) writeCachedUser(cookieUser)
        clearLegacyTokens()
        // Refill the in-memory access token from the refresh cookie so
        // getUsername()/getRole() keep working after a reload.
        if (!getAuthToken()) {
          try {
            const ref = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
            if (ref.ok) {
              const j = await ref.json()
              if (j.token) {
                setAccessToken(j.token)
                window.dispatchEvent(new Event('auth-change'))
              }
            }
          } catch {}
        }
        setLoading(false)
        setProfileLoading(false)
        return
      }

      // 2) Legacy Bearer-only session (pre-migration localStorage token).
      if (token) {
        try {
          const r = await api.get('/auth/me', { headers: { Authorization: `Bearer ${token}` } })
          setUser(r.data)
          setEffectiveAccess(r.data)
          writeCachedUser(r.data)
          try {
            await api.post('/auth/session-migrate', {}, { headers: { Authorization: `Bearer ${token}` } })
            clearLegacyTokens()
          } catch {}
          setLoading(false)
          setProfileLoading(false)
          return
        } catch (err) {
          const status = err?.response?.status
          if (status === 401 || status === 403 || !optimistic) {
            clearCachedUser()
            setUser(null)
          }
        }
      } else {
        clearCachedUser()
        setUser(null)
      }

      setLoading(false)
      setProfileLoading(false)
    })()

    hydrateRef.current = { token: token || '', promise }
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
    // H4 — memory only. The backend sets the HttpOnly cookies; nothing goes to localStorage.
    setAccessToken(token)
    clearLegacyTokens()
    clearCachedUser()
    setUser(userData || userFromToken(token))
    setLoading(false)
    window.dispatchEvent(new Event('auth-change'))
  }

  const logout = async () => {
    setAccessToken(null)
    clearCachedUser()
    // M8 — clear the HttpOnly auth cookies FIRST (await the backend logout so the
    // Set-Cookie deletes land before we dispatch auth-change / re-hydrate).
    // Without this the refresh_token/auth_token cookies survive logout and a
    // reload silently logs the user back in via /auth/me.
    try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }) } catch {}
    // revoke:false — the backend logout above already nulled the server-side
    // refresh token; don't fire a second /auth/logout.
    clearAuthTokens({ revoke: false })
    window.dispatchEvent(new Event('auth-change'))
    setUser(null)
    setLoading(false)
    setProfileLoading(false)
  }

  const refreshUser = async () => {
    setProfileLoading(true)
    try {
      const r = await api.get('/auth/me')
      setUser(r.data)
      writeCachedUser(r.data)
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
