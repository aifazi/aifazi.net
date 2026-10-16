'use client'
import { useState, useEffect } from 'react'
import api from '@/lib/api'
import { useIsMobile } from '../shared'
import { useNow } from '../../../hooks/useNow'
import { EmptyState } from '../ui'

// Split out of AdminPanels.jsx - platform stats.
function StatsPanel() {
  const now = useNow()
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const isMobile = useIsMobile()

  const load = async () => {
    try { const r = await api.get('/admin/stats'); setData(r.data) }
    catch { setError('Failed to load stats.') }
    finally { setLoading(false) }
  }
  useEffect(() => {
    const run = async () => { await load() }
    run()
  }, [])

  const fmt = n => (n ?? '').toLocaleString?.() ?? n
  const ago = d => { if (!d) return ''; const s = Math.floor((now - new Date(d)) / 1000); if (s < 60) return `${s}s ago`; if (s < 3600) return `${Math.floor(s/60)}m ago`; if (s < 86400) return `${Math.floor(s/3600)}h ago`; return `${Math.floor(s/86400)}d ago` }

  return (
    <div style={{ padding: isMobile ? 16 : 32 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--cyan)', letterSpacing: 4, marginBottom: 6 }}>ANALYTICS</div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: isMobile ? 22 : 28, fontWeight: 700, margin: 0 }}>Site Statistics</h2>
        </div>
        <button onClick={load} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1, padding: '8px 16px', background: 'color-mix(in srgb, var(--green) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--green) 30%, transparent)', color: 'var(--green)', cursor: 'pointer' }}>🔄 REFRESH</button>
      </div>

      {loading && <div className="loader" />}
      {error && <div style={{ color: '#ff4757', fontFamily: 'var(--font-mono)', fontSize: 12, padding: 24 }}>{error}</div>}

      {data && <>
        {/* Count tiles */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
          {[
            { label: 'Total Posts',      value: fmt(data.counts?.posts?.total),         sub: `${fmt(data.counts?.posts?.published)} live  ${fmt(data.counts?.posts?.drafts)} drafts`, color: '#00d4ff' },
            { label: 'Forum Users',      value: fmt(data.counts?.users?.total),          sub: `${fmt(data.counts?.users?.verified)} verified  ${fmt(data.counts?.users?.banned)} banned`, color: '#00ff88' },
            { label: 'Forum Threads',    value: fmt(data.counts?.forum?.threads),        sub: `${fmt(data.counts?.forum?.replies)} replies`, color: '#a78bfa' },
            { label: 'Newsletter Subs',  value: fmt(data.counts?.newsletter?.total),     sub: `${fmt(data.counts?.newsletter?.active)} active`, color: '#ff6b35' },
            { label: 'Chat Messages',    value: fmt(data.counts?.chat?.messages),        sub: 'all time', color: '#ffd700' },
            { label: 'Contact Messages', value: fmt(data.counts?.contacts),              sub: 'total received', color: '#00d4ff' },
            { label: 'Media Files',      value: fmt(data.counts?.media),                 sub: 'uploaded', color: '#00ff88' },
            { label: 'Staff Members',    value: fmt(data.counts?.staff),                 sub: 'with access', color: '#a78bfa' },
          ].map(c => (
            <div key={c.label} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', padding: '16px 18px', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${c.color}, transparent)` }} />
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 3, color: 'var(--muted)', marginBottom: 8 }}>{c.label.toUpperCase()}</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: isMobile ? 22 : 28, fontWeight: 800, color: c.color, lineHeight: 1 }}>{c.value}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{c.sub}</div>
            </div>
          ))}
        </div>

        {/* Today vs This Week */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16, marginBottom: 24 }}>
          {[
            { title: 'TODAY', d: data.today,   color: '#00ff88' },
            { title: 'THIS WEEK', d: data.week, color: '#00d4ff' },
          ].map(({ title, d, color }) => (
            <div key={title} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', padding: '18px 20px' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 3, color: 'var(--muted)', marginBottom: 14 }}>{title}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[['Posts', d?.posts], ['Users', d?.users], ['Threads', d?.threads], ['Messages', d?.messages]].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 11, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <span style={{ color: 'var(--muted)' }}>{k}</span>
                    <span style={{ color, fontWeight: 700 }}>{fmt(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Top Posts + Recent Users */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16, marginBottom: 24 }}>
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', padding: '18px 20px' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 3, color: 'var(--muted)', marginBottom: 14 }}>TOP POSTS BY VIEWS</div>
            {(data.topPosts || []).length === 0
              ? <EmptyState icon="📝" title="No posts yet" hint="Publish your first post to see it here." />
              : (data.topPosts || []).map((p, i) => (
              <div key={p._id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--green)', width: 16, textAlign: 'center', flexShrink: 0 }}>#{i+1}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--cyan)', flexShrink: 0 }}>{fmt(p.views)}</span>
              </div>
            ))}
          </div>
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', padding: '18px 20px' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 3, color: 'var(--muted)', marginBottom: 14 }}>RECENT USERS</div>
            {(data.recent?.users || []).length === 0
              ? <EmptyState icon="👤" title="No users yet" hint="New registrations will appear here." />
              : (data.recent?.users || []).map(u => (
              <div key={u._id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'color-mix(in srgb, var(--green) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--green) 30%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--green)', flexShrink: 0 }}>{u.username?.[0]?.toUpperCase()}</div>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text)', flex: 1 }}>{u.username}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>{ago(u.createdAt)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent contacts */}
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', padding: '18px 20px' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 3, color: 'var(--muted)', marginBottom: 14 }}>RECENT CONTACT MESSAGES</div>
          {(data.recent?.contacts || []).length === 0
            ? <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', textAlign: 'center', padding: 20 }}>No messages yet.</div>
            : (data.recent?.contacts || []).map(c => (
              <div key={c._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}  {c.subject || '(no subject)'}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--cyan)' }}>{c.email}</div>
                </div>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', flexShrink: 0 }}>{ago(c.createdAt)}</span>
              </div>
            ))
          }
        </div>
      </>}
    </div>
  )
}

export { StatsPanel }
