'use client'
import { useState, useEffect, useRef } from 'react'
import { Link } from '@/lib/router-compat'
import api from '@/lib/api'
import { useNow } from '@/hooks/useNow'
import {
  subscribeToPush,
  unsubscribeFromPush,
  isPushSupported,
  getPushPermission,
} from '@/lib/webPush.js'

/* ── push CTA chip rendered inside the dropdown footer ──────────────────── */
const PushCTA = ({ pushState, onEnable, onDisable }) => {
  if (pushState === 'unsupported') return null

  if (pushState === 'granted') return (
    <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--green)', letterSpacing: 1 }}>
        🔔 Push notifications ON
      </span>
      <button onClick={onDisable}
        style={{ background: 'none', border: '1px solid var(--border)', cursor: 'pointer',
          fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--muted)', letterSpacing: 1,
          padding: '3px 9px', borderRadius: 4, transition: 'all 0.15s' }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = '#ff4757'; e.currentTarget.style.color = '#ff4757' }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted)' }}>
        DISABLE
      </button>
    </div>
  )

  if (pushState === 'denied') return (
    <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)' }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#ff4757', letterSpacing: 1 }}>
        🔕 Notifications blocked — enable in browser settings
      </span>
    </div>
  )

  if (pushState === 'loading') return (
    <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)',
      fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', letterSpacing: 1 }}>
      ⏳ Requesting permission…
    </div>
  )

  // 'default' — show enable button
  return (
    <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)' }}>
      <button onClick={onEnable}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 7, padding: '8px 14px', borderRadius: 5, cursor: 'pointer', transition: 'all 0.18s',
          background: 'color-mix(in srgb, var(--green) 7%, transparent)', border: '1px solid color-mix(in srgb, var(--green) 30%, transparent)',
          color: 'var(--green)', fontFamily: 'var(--font-mono)', fontSize: 10,
          letterSpacing: 1.5, fontWeight: 700 }}
        onMouseEnter={e => { e.currentTarget.style.background = 'color-mix(in srgb, var(--green) 14%, transparent)'; e.currentTarget.style.boxShadow = '0 0 12px color-mix(in srgb, var(--green) 15%, transparent)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'color-mix(in srgb, var(--green) 7%, transparent)'; e.currentTarget.style.boxShadow = 'none' }}>
        🔔 ENABLE NOTIFICATIONS
      </button>
    </div>
  )
}

export default function NotificationBell({ forumUser }) {
  const [notifications, setNotifications] = useState([])
  const [open,          setOpen]          = useState(false)
  const [loading,       setLoading]       = useState(false)
  const [badgeCount,    setBadgeCount]    = useState(0)
  // 'default' | 'granted' | 'denied' | 'unsupported' | 'loading'
  const [pushState,     setPushState]     = useState(() =>
    typeof window === 'undefined' || !isPushSupported() ? 'unsupported' : getPushPermission()
  )
  const dropdownRef = useRef(null)
  const now = useNow()

  const unreadCount = badgeCount

  /* ── notification fetch ────────────────────────────────────────────────── */
  const fetchNotifications = async () => {
    if (!forumUser || forumUser._staff) return
    setLoading(true)
    try {
      const res = await api.get('/forum/notifications')
      const list = res.data || []
      setNotifications(list)
      setBadgeCount(list.filter(n => !n.read).length)
    } catch { /* silently fail */ } finally { setLoading(false) }
  }

  /* ── lightweight unread-count poll (realtime badge sync) ───────────────── */
  const fetchUnread = async () => {
    if (!forumUser || forumUser._staff) return
    try {
      const res = await api.get('/forum/notifications/unread-count')
      if (typeof res.data?.count === 'number') setBadgeCount(res.data.count)
    } catch { /* silently fail */ }
  }

  useEffect(() => {
    const init = setTimeout(fetchNotifications, 0)
    const interval = setInterval(fetchNotifications, 30000)
    const unreadInterval = setInterval(fetchUnread, 10000)
    return () => { clearTimeout(init); clearInterval(interval); clearInterval(unreadInterval) }
  }, [forumUser])

  /* ── close on outside click ───────────────────────────────────────────── */
  useEffect(() => {
    const handler = e => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  /* ── mark read helpers ─────────────────────────────────────────────────── */
  const markAllRead = async () => {
    try {
      await api.post('/forum/notifications/read-all')
      setNotifications(prev => prev.map(n => ({ ...n, read: true })))
      setBadgeCount(0)
    } catch {}
  }

  const markRead = async id => {
    try {
      await api.post(`/forum/notifications/${id}/read`)
      setNotifications(prev => prev.map(n => n._id === id ? { ...n, read: true } : n))
      setBadgeCount(prev => Math.max(0, prev - 1))
    } catch {}
  }

  /* ── web push handlers ─────────────────────────────────────────────────── */
  const handleEnablePush = async () => {
    setPushState('loading')
    const result = await subscribeToPush(api)
    if (result.ok) {
      setPushState('granted')
    } else if (result.reason === 'denied') {
      setPushState('denied')
    } else {
      setPushState(getPushPermission())
    }
  }

  const handleDisablePush = async () => {
    setPushState('loading')
    await unsubscribeFromPush(api)
    setPushState('default')
  }

  const formatTime = date => {
    const diff = now - new Date(date).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1)  return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24)  return `${hrs}h ago`
    return `${Math.floor(hrs / 24)}d ago`
  }

  if (!forumUser || forumUser._staff) return null

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      {/* Bell button */}
      <button
        onClick={() => { setOpen(o => !o); if (!open) fetchNotifications() }}
        aria-label={`Notifications${unreadCount > 0 ? ` — ${unreadCount} unread` : ''}`}
        aria-haspopup="true" aria-expanded={open} title="Notifications"
        style={{ position: 'relative', padding: '5px 10px',
          background: open ? 'color-mix(in srgb, var(--green) 8%, transparent)' : 'var(--bg3)',
          border: `1px solid ${open ? 'color-mix(in srgb, var(--green) 30%, transparent)' : 'var(--border)'}`,
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.2s', color: unreadCount > 0 ? 'var(--green)' : 'var(--muted)' }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--green) 30%, transparent)'; e.currentTarget.style.color = 'var(--green)' }}
        onMouseLeave={e => { if (!open) { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = unreadCount > 0 ? 'var(--green)' : 'var(--muted)' } }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        {unreadCount > 0 && (
          <span style={{ position: 'absolute', top: -4, right: -4, minWidth: 16, height: 16,
            borderRadius: 8, background: 'var(--green)', color: '#000',
            fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px' }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)',
          width: 'min(320px, calc(100vw - 32px))', maxWidth: '100vw', maxHeight: 480,
          background: 'var(--bg2)', border: '1px solid var(--border)',
          boxShadow: '0 16px 48px rgba(0,0,0,0.4)', zIndex: 9999,
          display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Header */}
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, color: 'var(--green)' }}>
              NOTIFICATIONS {unreadCount > 0 && `(${unreadCount})`}
            </span>
            {unreadCount > 0 && (
              <button onClick={markAllRead}
                style={{ background: 'none', border: 'none', cursor: 'pointer',
                  fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)',
                  letterSpacing: 1, padding: '2px 6px', transition: 'color 0.2s' }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--green)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--muted)'}>
                MARK ALL READ
              </button>
            )}
          </div>

          {/* List */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {loading && notifications.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>LOADING...</div>
            ) : notifications.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center' }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>🔔</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', letterSpacing: 1 }}>NO NOTIFICATIONS YET</div>
              </div>
            ) : (
              notifications.map(notif => (
                <Link key={notif._id} to={notif.link || '/forum'}
                  onClick={() => { markRead(notif._id); setOpen(false) }}
                  style={{ display: 'block', padding: '14px 16px',
                    borderBottom: '1px solid var(--border)', textDecoration: 'none',
                    background: notif.read ? 'transparent' : 'color-mix(in srgb, var(--green) 3%, transparent)',
                    transition: 'background 0.2s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'color-mix(in srgb, var(--cyan) 5%, transparent)'}
                  onMouseLeave={e => e.currentTarget.style.background = notif.read ? 'transparent' : 'color-mix(in srgb, var(--green) 3%, transparent)'}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    {!notif.read && (
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', marginTop: 5, flexShrink: 0 }} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, color: 'var(--text)', lineHeight: 1.4, marginBottom: 4 }}>
                        {notif.message}
                      </div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)' }}>
                        {formatTime(notif.createdAt)}
                      </div>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>

          {/* Push CTA footer */}
          <PushCTA pushState={pushState} onEnable={handleEnablePush} onDisable={handleDisablePush} />
        </div>
      )}
    </div>
  )
}
