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
  const [user, setUser] = useState(() => {
    if (typeof window === 'undefined') return null
    const token = getStoredToken()
    const cached = readCachedUser()
    return cached || (token ? userFromToken(token) : null)
  })
  const [loading, setLoading] = useState(() => {
    if (typeof window === 'undefined') return true
    const token = getStoredToken()
    const cached = readCachedUser()
    return cached || (token ? userFromToken(token) : null) ? false : true
  })
  const [profileLoading, setProfileLoading] = useState(false)
  const hydrateRef = useRef(null)

  // Render quickly from token/cache, then verify.
  // H4 — cookie session first (HttpOnly auth_token). When the cookie works, the
  // in-memory access token is refilled from the refresh_token cookie and the
  // legacy localStorage tokens are removed. Pre-migration Bearer-only sessions
  // fall back to the stored token and are migrated to cookies via
  // /auth/session-migrate.
  // Quiet-guest optimization: once a cookieless probe 401s, remember it for
  // this tab (sessionStorage) so repeat mounts don't re-fire /auth/me and spam
  // the console for logged-out visitors. Any auth signal clears the flag.
  const hydrate = useCallback(async () => {
    const token = getStoredToken()

    if (!token && typeof window !== 'undefined' && window.sessionStorage?.getItem('aifazi:no-session') === '1') {
      // Defer setState per react-compiler rules (no sync setState in effect path).
      setTimeout(() => {
        clearCachedUser()
        setUser(null)
        setLoading(false)
        setProfileLoading(false)
      }, 0)
      return
    }

    const cached = readCachedUser()
    const optimistic = cached || (token ? userFromToken(token) : null)

    if (hydrateRef.current?.token === (token || '')) return hydrateRef.current.promise

    // had-session (localStorage): this browser has logged in before. Lets a
    // failed cookie probe attempt one silent refresh (expired access + live
    // refresh cookie) instead of instantly showing logged-out.
    const markHadSession = () => { try { window.localStorage?.setItem('aifazi:had-session', '1') } catch {} }
    const clearHadSession = () => { try { window.localStorage?.removeItem('aifazi:had-session') } catch {} }
    const hadSession = () => {
      try { return window.localStorage?.getItem('aifazi:had-session') === '1' } catch { return false }
    }
    const markNoSession = () => { try { window.sessionStorage?.setItem('aifazi:no-session', '1') } catch {} }
    let probeNetFail = false
    const probeCookie = async () => {
      try {
        const r = await fetch('/api/auth/me', { credentials: 'include' })
        if (r.ok) return await r.json()
      } catch { probeNetFail = true }
      return null
    }
    // Silent refresh — must send a JSON content type or the backend CSRF gate
    // (cookies + POST without XHR/JSON/bearer) rejects it with 403.
    const tryRefresh = async () => {
      try {
        const ref = await fetch('/api/auth/refresh', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' }, body: '{}',
        })
        return ref.ok
      } catch { return false }
    }

    const promise = (async () => {
      await Promise.resolve()
      setProfileLoading(true)
      // 1) Cookie session — no Authorization header, HttpOnly auth_token cookie.
      let cookieUser = await probeCookie()
      // Access may have expired while the refresh cookie lives: one silent
      // refresh, then re-probe once. If that fails the session is truly dead.
      // Never flag offline (network failure) as logged-out.
      if (!cookieUser && !probeNetFail && hadSession()) {
        if (await tryRefresh()) {
          cookieUser = await probeCookie()
        } else {
          clearHadSession()
        }
      }

      if (cookieUser) {
        markHadSession()
        setUser(cookieUser)
        setEffectiveAccess(cookieUser)
        if (token) writeCachedUser(cookieUser)
        clearLegacyTokens()
        // Refill the in-memory access token from the refresh cookie so
        // getUsername()/getRole() keep working after a reload.
        if (!getAuthToken()) {
          try {
            const ref = await fetch('/api/auth/refresh', {
              method: 'POST', credentials: 'include',
              headers: { 'Content-Type': 'application/json' }, body: '{}',
            })
            if (ref.ok) {
              const j = await ref.json()
              if (j.token) setAccessToken(j.token)
            }
          } catch {}
        }
        // Always notify consumers (EditProvider, FloatingNav, …) that the
        // effective role is known now — even if the refresh above failed — so
        // the inline "Edit Site" entry appears as soon as an admin cookie
        // session is confirmed.
        window.dispatchEvent(new Event('auth-change'))
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
            // Dead token: the server rejected it, so drop it — otherwise every
            // mount re-probes with the same invalid token (401 console spam).
            // With no token left, remember the logged-out state for this tab.
            // Only flag on definite HTTP rejection, never on network failure.
            clearAuthTokens({ revoke: false })
            if (status === 401 || status === 403) {
              clearHadSession()
              markNoSession()
            }
          }
        }
      } else {
        clearCachedUser()
        setUser(null)
        // HTTP failure (not network): no session on this browser.
        if (!probeNetFail) markNoSession()
      }

      setLoading(false)
      setProfileLoading(false)
    })()

    hydrateRef.current = { token: token || '', promise }
    await promise
  }, [])

  useEffect(() => { hydrate() }, [hydrate])

  useEffect(() => {
    const onAuthChange = () => {
      try { window.sessionStorage?.removeItem('aifazi:no-session') } catch {}
      hydrate()
    }
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
    try { window.sessionStorage?.removeItem('aifazi:no-session') } catch {}
    try { window.localStorage?.setItem('aifazi:had-session', '1') } catch {}
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
    // CSRF gate (main.py): cookie POSTs need X-Requested-With or a JSON
    // content-type — a bare fetch gets 403 and the cookies survive, which is
    // exactly the "logout bounces back to admin / re-logs-in" loop.
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: '{}',
      })
    } catch {}
    // revoke:false — the backend logout above already nulled the server-side
    // refresh token; don't fire a second /auth/logout.
    clearAuthTokens({ revoke: false })
    try { window.sessionStorage?.setItem('aifazi:no-session', '1') } catch {}
    try { window.localStorage?.removeItem('aifazi:had-session') } catch {}
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
