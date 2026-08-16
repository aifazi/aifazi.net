'use client'
import React, { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { useNavigate } from '@/lib/router-compat'
import api, { getRole, getUsername, clearAuthTokens, setEffectiveAccess, hasStaffAccess } from '@/lib/api'

// The dashboard shell (and all its sub-panels) only loads once staff access is verified.
const Dashboard = dynamic(() => import('./admin/Dashboard').then(m => m.default || m), { ssr: false })

// Read server-rendered user data synchronously for initial state. Only used as
// a fallback — AdminPage passes `serverUser` as a prop so the server render and
// client hydration compute the SAME initial state (reading the DOM here returns
// null on the server, which caused a guaranteed hydration mismatch / React #441).
function getServerUserData() {
  if (typeof window === 'undefined') return null
  const script = document.getElementById('admin-user-data')
  if (!script) return null
  try {
    return JSON.parse(script.textContent || '{}')
  } catch {
    return null
  }
}

export default function Admin({ serverUser: serverUserProp }) {
  const navigate  = useNavigate()
  const serverUser = serverUserProp || getServerUserData()
  const hasServerAuth = serverUser && serverUser.role && (serverUser.role !== 'user' || (serverUser.permissions && Object.keys(serverUser.permissions).length > 0))

  const [authed, setAuthed] = useState(hasServerAuth)
  const [checking, setChecking] = useState(!hasServerAuth)

  useEffect(() => {
    if (hasServerAuth) {
      // Server already verified - hydrate localStorage from server data.
      // `checking` already starts false when hasServerAuth, so no setState here.
      setEffectiveAccess(serverUser)
      return
    }

    // Fallback: verify via API if SSR data missing/invalid
    const verify = async () => {
      try {
        const verified = await api.get('/auth/verify')
        setEffectiveAccess(verified.data?.user)
        const role = verified.data?.user?.role || getRole()
        if ((role === 'user' || !role) && !hasStaffAccess()) { navigate('/profile', { replace: true }); setChecking(false); return }
        setAuthed(true)
      }
      catch {
        clearAuthTokens()
        navigate('/login?next=/admin', { replace: true })
      } finally { setChecking(false) }
    }
    verify()
  }, [])

  const handleLogout = async () => {
    try { await api.post('/auth/logout') } catch {}
    clearAuthTokens()
    navigate('/login', { replace: true, state: { signedOut: true } })
  }

  if (checking) return <div className="page-container"><div className="loader" /></div>

  // -- Unauthorized access page -----------------------------------------------
  if (!authed && !checking) {
    const username = getUsername()
    const role = getRole()
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 20, padding: 24 }}>
        <div style={{ fontSize: 64 }}>⚙️</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 3, color: '#ff4757', padding: '4px 14px', background: 'rgba(255,71,87,0.08)', border: '1px solid rgba(255,71,87,0.3)' }}>
          UNAUTHORIZED ACCESS
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 700, margin: 0, textAlign: 'center' }}>
          Access Denied
        </h1>
        <p style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: 11, textAlign: 'center', maxWidth: 380, lineHeight: 1.8 }}>
          {username
            ? <>Your account <span style={{ color: 'var(--cyan)' }}>{username}</span>{role ? <> ({role})</> : ''} does not have permission to access the admin panel.</>
            : <>You do not have permission to access the admin panel.</>}
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button onClick={() => navigate('/', { replace: true })} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, padding: '12px 24px', background: 'var(--green)', color: '#000', border: 'none', cursor: 'pointer', fontWeight: 700 }}>
            ← HOME
          </button>
          <button onClick={handleLogout} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, padding: '12px 24px', background: 'transparent', color: 'var(--muted)', border: '1px solid var(--border)', cursor: 'pointer' }}>
            LOGOUT
          </button>
        </div>
      </div>
    )
  }

  if (!authed) return null

  const role = getRole()

  // All staff/admin accounts now use the shared dashboard; permissions filter modules/actions.

  return <Dashboard onLogout={handleLogout} />
}