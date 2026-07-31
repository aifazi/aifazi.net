'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import api from '@/lib/api'
import { useForum } from '@/context/ForumContext'
import { useFiveMRoute, useFiveMLoginRoute } from '@/lib/fivemRoutes'

const G = '#00FF88'
const C = '#00D4FF'
const R = '#ff4757'
const W = '#ff9f43'

export default function FiveMProfile() {
  const router = useRouter()
  // Site-wide session (ForumContext) — same auth the navbar/footer and the
  // rest of the app use. The page previously re-implemented auth with the
  // memory-first getAuthToken(), which is empty right after a fresh page load
  // (cookie session), so logged-in users were bounced to /login.
  const { user, loading: authLoading, logout } = useForum()
  const [status, setStatus] = useState<any>(null)
  const [whitelist, setWhitelist] = useState<any>(null)
  const [dataLoading, setDataLoading] = useState(true)
  const homeHref = useFiveMRoute('/')
  const loginHref = useFiveMLoginRoute('/profile')
  const whitelistHref = useFiveMRoute('/whitelist')
  const connectHref = useFiveMRoute('/connect')
  const formsHref = useFiveMRoute('/forms')

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      router.replace(loginHref)
      return
    }
    let cancelled = false
    Promise.all([
      api.get('/fivem/status').catch(() => null),
      api.get('/fivem/whitelist/my-application').catch(() => null),
    ]).then(([statusRes, whitelistRes]) => {
      if (cancelled) return
      if (statusRes?.data) setStatus(statusRes.data)
      if (whitelistRes?.data) setWhitelist(whitelistRes.data)
    }).finally(() => { if (!cancelled) setDataLoading(false) })
    return () => { cancelled = true }
  }, [authLoading, user, loginHref, router])

  function handleLogout() {
    logout()
    router.push(homeHref)
  }

  if (authLoading) {
    return (
      <div style={{ minHeight: '100vh', color: 'var(--muted)', fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: 2 }}>LOADING...</div>
        </div>
      </div>
    )
  }

  // Not logged in — the effect above is redirecting to /login.
  if (!user) return null

  return (
    <div style={{ minHeight: '100vh', color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '80px 24px' }}>
        <a href={homeHref} style={{ fontSize: 12, color: 'var(--muted)', textDecoration: 'none', letterSpacing: 1 }}>← BACK TO FIVEM</a>

        <div style={{ marginTop: 24, display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          <div style={{ width: 72, height: 72, borderRadius: '50%', background: `linear-gradient(135deg, ${G}, ${C})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 800, color: '#000' }}>
            {user?.username?.[0]?.toUpperCase() || '?'}
          </div>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: 1 }}>{user?.username || 'Player'}</h1>
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: '4px 0 0' }}>{user?.email || ''}</p>
          </div>
        </div>

        <div style={{ marginTop: 32, display: 'grid', gap: 16 }}>
          <div style={{ padding: 20, background: 'color-mix(in srgb, var(--cyan) 5%, transparent)', border: '1px solid color-mix(in srgb, var(--cyan) 22%, transparent)', borderRadius: 12 }}>
            <h2 style={{ fontSize: 11, letterSpacing: 2, color: C, margin: '0 0 16px' }}>FIVEM PLAYER PROFILE</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14 }}>
              <div>
                <div style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: 1 }}>WHITELIST</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: whitelist?.status === 'approved' ? G : whitelist?.status === 'pending' ? W : R, marginTop: 4 }}>
                  {(whitelist?.display_status || whitelist?.status || 'NOT APPLIED').toUpperCase()}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: 1 }}>CHARACTER</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', marginTop: 4 }}>{whitelist?.character_name || '-'}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: 1 }}>CONNECT ACCESS</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: whitelist?.status === 'approved' && status?.status === 'online' ? G : W, marginTop: 4 }}>
                  {whitelist?.status === 'approved' && status?.status === 'online' ? 'READY' : 'LOCKED'}
                </div>
              </div>
            </div>
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)', display: 'grid', gap: 8, fontSize: 12, color: 'var(--muted)' }}>
              <div>Discord: <span style={{ color: 'var(--text)' }}>{whitelist?.discord_name || user?.discord_username || user?.username || '-'}</span></div>
              <div>FiveM ID: <span style={{ color: 'var(--text)' }}>{whitelist?.fivem_id || '-'}</span></div>
              <div>Steam: <span style={{ color: 'var(--text)' }}>{whitelist?.steam_hex || user?.steam_id || '-'}</span></div>
            </div>
          </div>

          <div style={{ padding: 20, background: 'color-mix(in srgb, var(--text) 3%, transparent)', border: '1px solid var(--border)', borderRadius: 12 }}>
            <h2 style={{ fontSize: 11, letterSpacing: 2, color: G, margin: '0 0 16px' }}>SERVER STATUS</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12 }}>
              <div>
                <div style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: 1 }}>STATUS</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: status?.status === 'online' ? G : R, marginTop: 4 }}>
                  {status?.status === 'online' ? 'ONLINE' : 'OFFLINE'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: 1 }}>PLAYERS</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: C, marginTop: 4 }}>{status?.players_online ?? 0}/{status?.max_players ?? 48}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: 1 }}>UPTIME</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginTop: 4 }}>{status?.uptime_label || '0m'}</div>
              </div>
            </div>
          </div>

          <div style={{ padding: 20, background: 'color-mix(in srgb, var(--text) 3%, transparent)', border: '1px solid var(--border)', borderRadius: 12 }}>
            <h2 style={{ fontSize: 11, letterSpacing: 2, color: G, margin: '0 0 16px' }}>ACCOUNT</h2>
            <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
              Website account used for login and staff permissions. FiveM access is controlled by the player profile above.
            </p>
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                <span style={{ color: 'var(--muted)' }}>Username</span>
                <span>{user?.username || '-'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                <span style={{ color: 'var(--muted)' }}>Email</span>
                <span>{user?.email || '-'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                <span style={{ color: 'var(--muted)' }}>Role</span>
                <span style={{ color: user?.role === 'admin' ? G : C }}>{(user?.role || 'player').toUpperCase()}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 13 }}>
                <span style={{ color: 'var(--muted)' }}>Joined</span>
                <span>{user?.created_at ? new Date(user.created_at).toLocaleDateString() : '-'}</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <a href={whitelistHref} style={{ flex: 1, textAlign: 'center', padding: '14px', background: `linear-gradient(135deg, ${G}, ${C})`, color: '#000', fontWeight: 700, fontSize: 12, letterSpacing: 2, textDecoration: 'none', borderRadius: 8, minWidth: 160 }}>
              WHITELIST
            </a>
            <a href={formsHref} style={{ flex: 1, textAlign: 'center', padding: '14px', background: 'color-mix(in srgb, var(--text) 4%, transparent)', color: 'var(--text)', fontWeight: 700, fontSize: 12, letterSpacing: 2, textDecoration: 'none', borderRadius: 8, border: '1px solid var(--border)', minWidth: 160 }}>
              FORMS
            </a>
            <a href={connectHref} style={{ flex: 1, textAlign: 'center', padding: '14px', background: 'transparent', color: C, fontWeight: 700, fontSize: 12, letterSpacing: 2, textDecoration: 'none', borderRadius: 8, border: `1px solid ${C}44`, minWidth: 160 }}>
              CONNECT
            </a>
            <button onClick={handleLogout} style={{ flex: 1, padding: '14px', background: 'color-mix(in srgb, var(--text) 4%, transparent)', color: R, fontWeight: 700, fontSize: 12, letterSpacing: 2, border: `1px solid ${R}55`, borderRadius: 8, cursor: 'pointer', minWidth: 160 }}>
              SIGN OUT
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
