'use client'
import React, { useState, useEffect } from 'react'
import { useNavigate } from '@/lib/router-compat'
import api, { isAdmin as checkIsAdmin, getRole, getUsername, clearAuthTokens, setEffectiveAccess, hasStaffAccess } from '@/lib/api'
import ForumAdmin from './ForumAdmin'
import AdminChat from './chat/AdminChat'
import Sidebar from './admin/Sidebar'
import Dashboard from './admin/Dashboard'
import { useIsMobile, PanelErrorBoundary } from './admin/shared'

function ModeratorPortal({ onLogout }) {
  const isMobile = useIsMobile()
  const username = getUsername()
  const [view, setView] = useState('forum')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const navItems = [
    { key: 'forum', label: '💬 Forum Admin' },
    { key: 'chat',  label: '🗨️ Chat'        },
  ]

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', zIndex: 10 }}>
      {isMobile && (
        <div style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px', height: 44, flexShrink: 0 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2, color: 'var(--muted)', textTransform: 'uppercase' }}>
            {navItems.find(n => n.key === view)?.label || 'MOD'}
          </span>
        </div>
      )}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {view === 'forum' && <div style={{ flex: 1, overflowY: 'auto' }}><ForumAdmin embedded /></div>}
        {view === 'chat' && <div style={{ flex: 1, minWidth: 0, display: 'flex', minHeight: 0, overflow: 'hidden', alignItems: 'stretch', height: '100%' }}><PanelErrorBoundary label="Chat"><AdminChat embedded /></PanelErrorBoundary></div>}
      </div>
    </div>
  )
}


// --- Mail Settings -------------------------------------------------------------

export default function Admin() {
  const navigate  = useNavigate()
  const [authed,   setAuthed]   = useState(false)
  const [checking, setChecking] = useState(true)
  const [accessDenied, setAccessDenied] = useState(false)

  useEffect(() => {
    const verify = async () => {
      // H4 — /auth/verify accepts the HttpOnly cookie, so no localStorage token
      // is required anymore. A 401 here means genuinely not authenticated.
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
    // Clear ALL tokens including refresh_token so silent re-auth cannot happen
    clearAuthTokens()
    navigate('/login', { replace: true, state: { signedOut: true } })
  }

  if (checking) return <div className="page-container"><div className="loader" /></div>

  // -- Unauthorized access page -----------------------------------------------
  if (accessDenied || (!authed && !checking)) {
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
            ? HOME
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
