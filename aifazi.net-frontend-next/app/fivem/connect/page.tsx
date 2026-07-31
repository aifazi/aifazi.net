'use client'
import { useEffect, useState } from 'react'
import api from '@/lib/api'
import { useForum } from '@/context/ForumContext'
import { useFiveMLoginRoute, useFiveMRoute } from '@/lib/fivemRoutes'

const G = '#00FF88'
const C = '#00D4FF'
const R = '#ff4757'

export default function FiveMConnect() {
  const { user } = useForum()
  const [status, setStatus] = useState<any>(null)
  const [whitelistStatus, setWhitelistStatus] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState('')
  const [userRole, setUserRole] = useState('')
  const [cooldownUntil, setCooldownUntil] = useState(0)
  const [now, setNow] = useState(Date.now())
  const homeHref = useFiveMRoute('/')
  const loginHref = useFiveMLoginRoute('/connect')
  const whitelistHref = useFiveMRoute('/whitelist')
  const profileHref = useFiveMRoute('/profile')
  const formsHref = useFiveMRoute('/forms')

  useEffect(() => {
    Promise.all([
      api.get('/fivem/status').then(r => r.data || r).catch(() => ({})),
      user ? api.get('/fivem/whitelist/my-application').then(r => r.data || null).catch(() => null) : Promise.resolve(null),
    ]).then(([s, w]) => {
      setStatus(s)
      setWhitelistStatus(w)
    }).finally(() => setLoading(false))
  }, [user])

  useEffect(() => {
    const saved = Number(localStorage.getItem('fivem_connect_cooldown_until') || 0)
    if (saved > Date.now()) setCooldownUntil(saved)
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (user) {
      api.get('/auth/verify').then(r => setUserRole(r.data?.user?.role || r.data?.role || 'member')).catch(() => {})
    }
  }, [user])

  const isWhitelisted = whitelistStatus?.status === 'approved' || userRole === 'admin' || userRole === 'moderator'
  const online = status?.status === 'online'
  const cooldownLeft = Math.max(0, Math.ceil((cooldownUntil - now) / 1000))

  const handleConnect = async () => {
    if (cooldownLeft > 0) return
    setError('')
    setConnecting(true)
    try {
      const r = await api.post('/fivem/connect/token')
      if (!r.data?.token) { setError('Failed to generate connect session'); return }
      const connectUrl = r.data?.connect_url || 'https://cfx.re/join/o9g397'
      const until = Date.now() + 30_000
      setCooldownUntil(until)
      localStorage.setItem('fivem_connect_cooldown_until', String(until))
      window.open(connectUrl, '_blank')
      setConnecting(false)
    } catch (err: any) {
      const retryAfter = Number(err.response?.headers?.['retry-after'] || 0)
      if (retryAfter > 0) {
        const until = Date.now() + retryAfter * 1000
        setCooldownUntil(until)
        localStorage.setItem('fivem_connect_cooldown_until', String(until))
      }
      setError(err.response?.data?.detail || 'Connection failed')
    } finally {
      setConnecting(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '80px 24px' }}>
        <a href={homeHref} style={{ fontSize: 12, color: 'var(--muted)', textDecoration: 'none', letterSpacing: 1 }}>&#8592; BACK TO FIVEM</a>
        <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <a href={profileHref} style={{ padding: '8px 10px', border: `1px solid ${G}33`, color: G, textDecoration: 'none', borderRadius: 7, fontSize: 10, letterSpacing: 2, fontWeight: 800 }}>PROFILE</a>
          <a href={formsHref} style={{ padding: '8px 10px', border: '1px solid var(--border)', color: 'var(--muted)', textDecoration: 'none', borderRadius: 7, fontSize: 10, letterSpacing: 2, fontWeight: 800 }}>FORMS</a>
          <a href={whitelistHref} style={{ padding: '8px 10px', border: `1px solid ${C}33`, color: C, textDecoration: 'none', borderRadius: 7, fontSize: 10, letterSpacing: 2, fontWeight: 800 }}>WHITELIST</a>
        </div>

        {/* Header */}
        <div style={{ textAlign: 'center', marginTop: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>&#9654;</div>
          <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: 2, background: `linear-gradient(135deg, ${G}, ${C})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            CONNECT TO SERVER
          </h1>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 8 }}>
            You must be whitelisted and logged in to connect.
          </p>
        </div>

        {/* Server status */}
        <div style={{ marginTop: 32, padding: 20, borderRadius: 12, background: 'color-mix(in srgb, var(--text) 3%, transparent)', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: online ? G : R, display: 'inline-block', animation: online ? 'pulse 2s infinite' : 'none' }} />
            <span style={{ fontSize: 13, color: online ? G : R, fontWeight: 700, letterSpacing: 1 }}>
              {loading ? 'CHECKING...' : online ? 'SERVER ONLINE' : 'SERVER OFFLINE'}
            </span>
          </div>
          {online && (
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              Players: <span style={{ color: C }}>{status?.players_online ?? status?.players_count ?? 0}</span> / {status?.max_players || 128}
            </div>
          )}
        </div>

        {/* Requirements checklist */}
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 12, letterSpacing: 2, color: 'var(--muted)', marginBottom: 12 }}>REQUIREMENTS</div>
          {[
            { label: 'Logged in', ok: !!user, detail: !user ? 'Please log in first' : `@${user?.username || ''}` },
            { label: 'Whitelisted', ok: isWhitelisted, detail: !user ? '—' : isWhitelisted ? 'Approved' : whitelistStatus?.status === 'pending' ? 'Application pending' : 'Not applied' },
            { label: 'Server online', ok: online, detail: online ? 'Online' : 'Offline' },
            { label: 'Connect cooldown', ok: cooldownLeft === 0, detail: cooldownLeft ? `${cooldownLeft}s` : 'Ready' },
          ].map((req, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ width: 20, height: 20, borderRadius: '50%', background: req.ok ? `${G}22` : `${R}22`, color: req.ok ? G : R, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, flexShrink: 0 }}>
                {req.ok ? '✓' : '✗'}
              </span>
              <span style={{ fontSize: 13, color: req.ok ? 'var(--text)' : 'var(--muted)' }}>{req.label}</span>
              <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 'auto' }}>{req.detail}</span>
            </div>
          ))}
        </div>

        {/* Connect button */}
        <div style={{ marginTop: 32, textAlign: 'center' }}>
          {!user ? (
            <a href={loginHref} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '14px 32px', background: `linear-gradient(135deg, ${C}, ${G})`, color: '#000', fontWeight: 700, fontSize: 13, letterSpacing: 2, textDecoration: 'none', borderRadius: 8 }}>
              LOGIN TO CONNECT
            </a>
          ) : !isWhitelisted ? (
            <a href={whitelistHref} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '14px 32px', background: 'rgba(255,159,67,0.15)', color: '#ff9f43', fontWeight: 700, fontSize: 13, letterSpacing: 2, textDecoration: 'none', borderRadius: 8, border: '1px solid rgba(255,159,67,0.3)' }}>
              APPLY FOR WHITELIST
            </a>
          ) : (
            <button onClick={handleConnect} disabled={connecting || !online || cooldownLeft > 0}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '14px 32px', background: (connecting || !online || cooldownLeft > 0) ? 'color-mix(in srgb, var(--text) 6%, transparent)' : `linear-gradient(135deg, ${G}, ${C})`, color: (connecting || !online || cooldownLeft > 0) ? 'var(--muted)' : '#000', fontWeight: 700, fontSize: 13, letterSpacing: 2, border: 'none', borderRadius: 8, cursor: (connecting || !online || cooldownLeft > 0) ? 'default' : 'pointer' }}>
              {connecting ? 'CREATING WEBSITE SESSION...' : !online ? 'SERVER OFFLINE' : cooldownLeft > 0 ? `WAIT ${cooldownLeft}s` : '▶ CONNECT NOW'}
            </button>
          )}
          {error && <div style={{ marginTop: 12, fontSize: 12, color: R }}>{error}</div>}
        </div>

        {/* How it works */}
        <div style={{ marginTop: 40, padding: 20, borderRadius: 12, background: 'color-mix(in srgb, var(--cyan) 5%, transparent)', border: '1px solid color-mix(in srgb, var(--cyan) 18%, transparent)' }}>
          <div style={{ fontSize: 11, letterSpacing: 2, color: C, marginBottom: 8 }}>HOW CONNECTING WORKS</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.8 }}>
            <div><span style={{ color: C }}>1.</span> Click Connect — a short website-only session is generated for your account</div>
            <div><span style={{ color: C }}>2.</span> The FiveM server validates that session and your whitelist on join</div>
            <div><span style={{ color: C }}>3.</span> If whitelisted and not banned, you enter the server</div>
          </div>
        </div>
      </div>
      <style>{`@keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.4 } }`}</style>
    </div>
  )
}
