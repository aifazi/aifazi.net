'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import api from '@/lib/api'
import { authProviderLoginRoute } from '@/lib/authRoutes'
import { fivemRoute, useFiveMRoute } from '@/lib/fivemRoutes'

const G = '#00FF88'
const C = '#00D4FF'
const B = '#0f111a'

export default function FiveMLogin() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [nextHref, setNextHref] = useState('')

  const profileHref = useFiveMRoute('/profile')
  const homeHref = useFiveMRoute('/')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setNextHref(params.get('next') || profileHref)
    const token = localStorage.getItem('auth_token')
    if (token) router.replace(profileHref)
  }, [profileHref, router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password) { setError('Please enter your email and password.'); return }
    setLoading(true); setError('')
    try {
      const res = await api.post('/auth/login', { username: email, password })
      if (res.data?.token) localStorage.setItem('auth_token', res.data.token)
      window.dispatchEvent(new Event('auth-change'))
      router.push(nextHref || profileHref)
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      if (detail === 'Email not verified') {
        setError('Please verify your email before signing in.')
      } else {
        setError(detail || 'Invalid credentials.')
      }
    } finally { setLoading(false) }
  }

  return (
    <div style={{ minHeight: '100vh', color: 'var(--text)', fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 400, padding: 24 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>🏙️</div>
          <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: 2, background: `linear-gradient(135deg, ${G}, ${C})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>AIFAZI RP</h1>
          <p style={{ fontSize: 12, color: '#8b949e', letterSpacing: 2, marginTop: 4 }}>SIGN IN TO YOUR ACCOUNT</p>
        </div>

        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 28 }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {error && (
              <div style={{ fontSize: 12, color: '#ff4757', padding: '10px 14px', background: 'rgba(255,71,87,0.07)', border: '1px solid rgba(255,71,87,0.25)', borderRadius: 6 }}>{error}</div>
            )}

            <div>
              <label style={{ fontSize: 10, letterSpacing: 2, color: '#8b949e', display: 'block', marginBottom: 6 }}>EMAIL</label>
              <input type="email" placeholder="your@email.com" value={email} onChange={e => setEmail(e.target.value)} required
                style={{ width: '100%', padding: '12px 14px', background: `${B}`, border: '1px solid rgba(255,255,255,0.1)', color: '#c9d1d9', fontSize: 14, outline: 'none', borderRadius: 8, boxSizing: 'border-box' }} />
            </div>

            <div>
              <label style={{ fontSize: 10, letterSpacing: 2, color: '#8b949e', display: 'block', marginBottom: 6 }}>PASSWORD</label>
              <input type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required
                style={{ width: '100%', padding: '12px 14px', background: `${B}`, border: '1px solid rgba(255,255,255,0.1)', color: '#c9d1d9', fontSize: 14, outline: 'none', borderRadius: 8, boxSizing: 'border-box' }} />
            </div>

            <button type="submit" disabled={loading}
              style={{ padding: '14px', background: loading ? 'rgba(255,255,255,0.05)' : `linear-gradient(135deg, ${G}, ${C})`, color: loading ? '#8b949e' : '#000', fontWeight: 700, fontSize: 12, letterSpacing: 2, border: 'none', borderRadius: 8, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}>
              {loading ? 'SIGNING IN...' : 'SIGN IN'}
            </button>
          </form>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' }}>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
            <span style={{ fontSize: 10, color: '#8b949e', letterSpacing: 2 }}>OR</span>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button onClick={() => window.location.href = authProviderLoginRoute('discord', fivemRoute('/profile'))}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px', background: '#5865F2', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>
              CONTINUE WITH DISCORD
            </button>
            <button onClick={() => window.location.href = authProviderLoginRoute('steam', fivemRoute('/profile'))}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px', background: '#1b2838', color: '#fff', border: '1px solid #2a475e', borderRadius: 8, cursor: 'pointer', fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>
              SIGN IN WITH STEAM
            </button>
          </div>

          <p style={{ fontSize: 12, color: '#8b949e', textAlign: 'center', marginTop: 16 }}>
            No account?{' '}
            <a href="/forum/auth" style={{ color: C, textDecoration: 'none', fontWeight: 600 }}>Create one free</a>
          </p>
        </div>

        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <a href={homeHref} style={{ fontSize: 11, color: '#8b949e', textDecoration: 'none', letterSpacing: 1 }}>← BACK TO FIVEM</a>
        </div>
      </div>
    </div>
  )
}
