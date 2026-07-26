'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import api from '@/lib/api'
import { useFiveMRoute } from '@/lib/fivemRoutes'

const G = '#00FF88'
const C = '#00D4FF'
const B = '#0f111a'
const R = '#ff4757'
const W = '#ff9f43'

export default function FiveMProfile() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [status, setStatus] = useState<any>(null)
  const [whitelist, setWhitelist] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const homeHref = useFiveMRoute('/')
  const loginHref = useFiveMRoute('/login')
  const whitelistHref = useFiveMRoute('/whitelist')
  const connectHref = useFiveMRoute('/connect')
  const formsHref = '/forms'

  useEffect(() => {
    const token = localStorage.getItem('auth_token')
    if (!token) { router.replace(loginHref); return }

    Promise.all([
      api.get('/auth/verify').catch(() => null),
      api.get('/fivem/status').catch(() => null),
      api.get('/fivem/whitelist/my-application').catch(() => null),
    ]).then(([userRes, statusRes, whitelistRes]) => {
      if (userRes?.data) setUser(userRes.data)
      if (statusRes?.data) setStatus(statusRes.data)
      if (whitelistRes?.data) setWhitelist(whitelistRes.data)
    }).finally(() => setLoading(false))
  }, [loginHref, router])

  async function handleLogout() {
    localStorage.removeItem('auth_token')
    window.dispatchEvent(new Event('auth-change'))
    router.push(homeHref)
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: B, color: '#c9d1d9', fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 11, color: '#8b949e', letterSpacing: 2 }}>LOADING...</div>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '60px 24px' }}>
        <a href={homeHref} style={{ fontSize: 12, color: '#8b949e', textDecoration: 'none', letterSpacing: 1 }}>← BACK TO FIVEM</a>

        <div style={{ marginTop: 24, display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          <div style={{ width: 72, height: 72, borderRadius: '50%', background: `linear-gradient(135deg, ${G}, ${C})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 800, color: '#000' }}>
            {user?.username?.[0]?.toUpperCase() || '?'}
          </div>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: 1 }}>{user?.username || 'Player'}</h1>
            <p style={{ fontSize: 12, color: '#8b949e', margin: '4px 0 0' }}>{user?.email || ''}</p>
          </div>
        </div>

        <div style={{ marginTop: 32, display: 'grid', gap: 16 }}>
          <div style={{ padding: 20, background: 'rgba(0,212,255,0.035)', border: '1px solid rgba(0,212,255,0.14)', borderRadius: 12 }}>
            <h2 style={{ fontSize: 11, letterSpacing: 2, color: C, margin: '0 0 16px' }}>FIVEM PLAYER PROFILE</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14 }}>
              <div>
                <div style={{ fontSize: 10, color: '#8b949e', letterSpacing: 1 }}>WHITELIST</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: whitelist?.status === 'approved' ? G : whitelist?.status === 'pending' ? W : R, marginTop: 4 }}>
                  {(whitelist?.display_status || whitelist?.status || 'NOT APPLIED').toUpperCase()}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: '#8b949e', letterSpacing: 1 }}>CHARACTER</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#c9d1d9', marginTop: 4 }}>{whitelist?.character_name || '-'}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: '#8b949e', letterSpacing: 1 }}>CONNECT ACCESS</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: whitelist?.status === 'approved' && status?.status === 'online' ? G : W, marginTop: 4 }}>
                  {whitelist?.status === 'approved' && status?.status === 'online' ? 'READY' : 'LOCKED'}
                </div>
              </div>
            </div>
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.06)', display: 'grid', gap: 8, fontSize: 12, color: '#8b949e' }}>
              <div>Discord: <span style={{ color: '#c9d1d9' }}>{whitelist?.discord_name || user?.discord_username || user?.username || '-'}</span></div>
              <div>FiveM ID: <span style={{ color: '#c9d1d9' }}>{whitelist?.fivem_id || '-'}</span></div>
              <div>Steam: <span style={{ color: '#c9d1d9' }}>{whitelist?.steam_hex || user?.steam_id || '-'}</span></div>
            </div>
          </div>

          <div style={{ padding: 20, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12 }}>
            <h2 style={{ fontSize: 11, letterSpacing: 2, color: G, margin: '0 0 16px' }}>SERVER STATUS</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12 }}>
              <div>
                <div style={{ fontSize: 10, color: '#8b949e', letterSpacing: 1 }}>STATUS</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: status?.status === 'online' ? G : '#ff4757', marginTop: 4 }}>
                  {status?.status === 'online' ? 'ONLINE' : 'OFFLINE'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: '#8b949e', letterSpacing: 1 }}>PLAYERS</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: C, marginTop: 4 }}>{status?.players_online ?? 0}/{status?.max_players ?? 48}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: '#8b949e', letterSpacing: 1 }}>UPTIME</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#c9d1d9', marginTop: 4 }}>{status?.uptime_label || '0m'}</div>
              </div>
            </div>
          </div>

          <div style={{ padding: 20, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12 }}>
            <h2 style={{ fontSize: 11, letterSpacing: 2, color: G, margin: '0 0 16px' }}>ACCOUNT</h2>
            <p style={{ margin: '0 0 14px', fontSize: 12, color: '#8b949e', lineHeight: 1.6 }}>
              Website account used for login and staff permissions. FiveM access is controlled by the player profile above.
            </p>
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: 13 }}>
                <span style={{ color: '#8b949e' }}>Username</span>
                <span>{user?.username || '-'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: 13 }}>
                <span style={{ color: '#8b949e' }}>Email</span>
                <span>{user?.email || '-'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: 13 }}>
                <span style={{ color: '#8b949e' }}>Role</span>
                <span style={{ color: user?.role === 'admin' ? G : C }}>{(user?.role || 'player').toUpperCase()}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 13 }}>
                <span style={{ color: '#8b949e' }}>Joined</span>
                <span>{user?.created_at ? new Date(user.created_at).toLocaleDateString() : '-'}</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <a href={whitelistHref} style={{ flex: 1, textAlign: 'center', padding: '14px', background: `linear-gradient(135deg, ${G}, ${C})`, color: '#000', fontWeight: 700, fontSize: 12, letterSpacing: 2, textDecoration: 'none', borderRadius: 8, minWidth: 160 }}>
              WHITELIST
            </a>
            <a href={formsHref} style={{ flex: 1, textAlign: 'center', padding: '14px', background: 'rgba(255,255,255,0.03)', color: '#c9d1d9', fontWeight: 700, fontSize: 12, letterSpacing: 2, textDecoration: 'none', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', minWidth: 160 }}>
              FORMS
            </a>
            <a href={connectHref} style={{ flex: 1, textAlign: 'center', padding: '14px', background: 'transparent', color: C, fontWeight: 700, fontSize: 12, letterSpacing: 2, textDecoration: 'none', borderRadius: 8, border: `1px solid ${C}44`, minWidth: 160 }}>
              CONNECT
            </a>
            <button onClick={handleLogout} style={{ flex: 1, padding: '14px', background: 'rgba(255,71,87,0.08)', color: '#ff4757', fontWeight: 700, fontSize: 12, letterSpacing: 2, border: '1px solid rgba(255,71,87,0.3)', borderRadius: 8, cursor: 'pointer', minWidth: 160 }}>
              SIGN OUT
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
