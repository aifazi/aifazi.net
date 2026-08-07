'use client'
import { useState, useEffect } from 'react'
import api from '@/lib/api'
import { useForum } from '../../context/ForumContext'
import { Card, NeonButton, Badge, EmptyState } from '../../components/community'

const mix = (c, p) => `color-mix(in srgb, ${c} ${p}%, transparent)`
const G = 'var(--green)', C = 'var(--cyan)', R = 'var(--red)', Y = 'var(--orange)'

const statusBadge = s => {
  const map = { delivered: 'green', paid: 'green', completed: 'green', cancelled: 'red', refunded: 'red', shipped: 'purple', processing: 'cyan' }
  return map[s] || 'orange'
}

export default function AccountDashboard({ loginHref }) {
  const { user } = useForum()
  const [sub, setSub] = useState(null)
  const [orders, setOrders] = useState([])
  const [downloads, setDownloads] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [section, setSection] = useState('overview')

  useEffect(() => {
    if (!user) return
    Promise.all([
      api.get('/store/my-subscription').then(r => r.data || null).catch(() => null),
      api.get('/store/orders').then(r => r.data || []).catch(() => []),
      api.get('/store/downloads').then(r => r.data || []).catch(() => []),
    ]).then(([subData, ordersData, dlData]) => {
      setSub(subData)
      setOrders(ordersData || [])
      setDownloads(dlData || [])
    }).finally(() => setLoading(false))
  }, [user])

  const handleManage = async () => {
    try {
      const r = await api.post('/store/portal')
      if (r.data?.url) window.location.href = r.data.url
    } catch { setError('Could not open billing portal.') }
  }

  const handleCancel = async () => {
    if (!window.confirm('Cancel your subscription? Perks remain active until end of billing period.')) return
    try {
      await api.post('/store/cancel')
      const r = await api.get('/store/my-subscription').catch(() => null)
      setSub(r?.data || sub)
    } catch { setError('Cancel failed.') }
  }

  if (!user) return (
    <div style={{ textAlign: 'center', padding: '60px 24px' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>🔐</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', marginBottom: 16 }}>
        Sign in to access your account.
      </div>
      <NeonButton to={loginHref} variant="primary" size="md">Sign In</NeonButton>
    </div>
  )

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i} style={{ padding: 24 }}>
          <div className="community-skel" style={{ width: '40%', height: 18, marginBottom: 12 }} />
          <div className="community-skel" style={{ width: '100%', height: 8, marginBottom: 6 }} />
          <div className="community-skel" style={{ width: '60%', height: 8 }} />
        </Card>
      ))}
    </div>
  )

  const totalSpent = orders.reduce((sum, o) => sum + ((o.total_cents || 0) / 100), 0)
  const activeSub = sub?.subscription
  const SECTIONS = [
    ['overview', '📊 Overview'],
    ['orders', '📦 Orders'],
    ['downloads', '⬇ Downloads'],
    ['subscription', '👑 Subscription'],
  ]

  const avatarSeed = user?.username || user?.email || 'User'

  return (
    <div>
      {error && (
        <div style={{ padding: '10px 16px', background: mix(R, 10), border: `1px solid ${mix(R, 25)}`, borderRadius: 10, color: R, fontSize: 12, fontFamily: 'var(--font-mono)', marginBottom: 20 }}>
          {error}
          <button onClick={() => setError('')} style={{ background: 'none', border: 'none', color: R, cursor: 'pointer', float: 'right' }}>✕</button>
        </div>
      )}

      {/* Profile Header */}
      <Card accent style={{ padding: 'clamp(22px, 3vw, 32px)', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
        <img
          src={user?.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(avatarSeed)}&backgroundColor=00ff88,00d4ff,a855f7&fontSize=40`}
          alt={user?.username || 'User'}
          style={{ width: 64, height: 64, borderRadius: '50%', border: '2px solid var(--green)', flexShrink: 0 }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>
              {user?.username || 'User'}
            </span>
            {user?.role && ['admin', 'moderator', 'staff'].includes(user.role) && (
              <Badge tone={user.role === 'admin' ? 'orange' : 'cyan'}>{user.role.toUpperCase()}</Badge>
            )}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', marginBottom: 8 }}>
            {user?.email || ''}
            {activeSub && <span style={{ marginLeft: 12, color: G, fontWeight: 700 }}>🎖 {activeSub.plan_name} — Level {activeSub.plan_level}</span>}
          </div>
          <div style={{ display: 'flex', gap: 16, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', flexWrap: 'wrap' }}>
            <span>🛒 {orders.length} order{orders.length !== 1 ? 's' : ''}</span>
            <span>⬇ {downloads.length} download{downloads.length !== 1 ? 's' : ''}</span>
            <span style={{ color: Y }}>💰 ${totalSpent.toFixed(2)} spent</span>
          </div>
        </div>
      </Card>

      {/* Section nav */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 28 }}>
        {SECTIONS.map(([k, label]) => (
          <button key={k} onClick={() => setSection(k)} className={`store-filter-pill ${section === k ? 'active' : ''}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ────────────────────────────────────────────── */}
      {section === 'overview' && (
        <>
          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 32 }}>
            <Card style={{ padding: 22, textAlign: 'center' }}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>📦</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 24, fontWeight: 700, color: G }}>{orders.length}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 2, color: 'var(--muted)', marginTop: 4 }}>ORDERS</div>
            </Card>
            <Card style={{ padding: 22, textAlign: 'center' }}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>⬇</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 24, fontWeight: 700, color: C }}>{downloads.length}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 2, color: 'var(--muted)', marginTop: 4 }}>DOWNLOADS</div>
            </Card>
            <Card style={{ padding: 22, textAlign: 'center' }}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>💰</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 24, fontWeight: 700, color: Y }}>${totalSpent.toFixed(2)}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 2, color: 'var(--muted)', marginTop: 4 }}>TOTAL SPENT</div>
            </Card>
            <Card style={{ padding: 22, textAlign: 'center' }}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>👑</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 24, fontWeight: 700, color: activeSub ? G : 'var(--muted)' }}>
                {activeSub ? 'Active' : 'None'}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 2, color: 'var(--muted)', marginTop: 4 }}>SUBSCRIPTION</div>
            </Card>
          </div>

          {/* Recent Orders */}
          <div style={{ marginBottom: 32 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 3, color: C }}>RECENT ORDERS</span>
              {orders.length > 6 && <button onClick={() => setSection('orders')} style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: G, background: 'none', border: 'none', cursor: 'pointer', letterSpacing: 1 }}>VIEW ALL →</button>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {orders.slice(0, 3).map(o => {
                const total = (o.total_cents || 0) / 100
                return (
                  <Card key={o.id} hover style={{ padding: '14px 18px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: C }}>#{o.order_number}</span>
                          <Badge tone={statusBadge(o.status)}>{(o.status || '').toUpperCase()}</Badge>
                        </div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', marginTop: 3 }}>
                          {new Date(o.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                          {(o.items || []).length > 0 && <> · {o.items.length} item{o.items.length !== 1 ? 's' : ''}</>}
                        </div>
                      </div>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>${total.toFixed(2)}</span>
                    </div>
                  </Card>
                )
              })}
              {orders.length === 0 && <div style={{ color: 'var(--muted)', fontSize: 12, padding: '16px 0' }}>No orders yet.</div>}
            </div>
          </div>

          {/* Downloads */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 3, color: C }}>DIGITAL DOWNLOADS</span>
              {downloads.length > 6 && <button onClick={() => setSection('downloads')} style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: G, background: 'none', border: 'none', cursor: 'pointer', letterSpacing: 1 }}>VIEW ALL →</button>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {downloads.slice(0, 3).map(d => (
                <Card key={d.id} hover style={{ padding: '14px 18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ fontSize: 22 }}>⬇</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{d.filename || d.product_name}</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
                        {d.downloads_used || 0} / {d.downloads_allowed || 5} downloads
                      </div>
                    </div>
                    <a href={`/api/store/downloads/${d.token}`} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                      <NeonButton variant="primary" size="sm">Download</NeonButton>
                    </a>
                  </div>
                </Card>
              ))}
              {downloads.length === 0 && <div style={{ color: 'var(--muted)', fontSize: 12, padding: '16px 0' }}>No downloads yet.</div>}
            </div>
          </div>
        </>
      )}

      {/* ── ORDERS ───────────────────────────────────────────────── */}
      {section === 'orders' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {orders.map(o => {
            const total = (o.total_cents || 0) / 100
            return (
              <Card key={o.id} hover style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: C }}>#{o.order_number}</span>
                      <Badge tone={statusBadge(o.status)}>{(o.status || '').toUpperCase()}</Badge>
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)' }}>
                      {new Date(o.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                      {(o.items || []).length > 0 && <> · {o.items.length} item{o.items.length !== 1 ? 's' : ''}</>}
                      {o.tracking_number && <> · 📦 Trackable</>}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>${total.toFixed(2)}</span>
                  </div>
                </div>
                {(o.items || []).length > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                    {o.items.map((it, i) => (
                      <span key={i} style={{ fontSize: 11, color: 'var(--text)', background: 'rgba(255,255,255,0.03)', padding: '3px 8px', borderRadius: 6, border: '1px solid var(--border)' }}>
                        {it.product_name} × {it.quantity}
                      </span>
                    ))}
                  </div>
                )}
                {(o.downloads || []).length > 0 && (
                  <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {o.downloads.map(d => (
                      <a key={d.id} href={`/api/store/downloads/${d.token}`} target="_blank" rel="noreferrer"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10, color: G, textDecoration: 'none', padding: '4px 10px', border: `1px solid ${mix(G, 22)}`, borderRadius: 6, fontFamily: 'var(--font-mono)' }}>
                        ⬇ {d.filename || d.product_name}
                      </a>
                    ))}
                  </div>
                )}
              </Card>
            )
          })}
          {orders.length === 0 && <EmptyState icon="📦" title="No orders yet" text="Your orders will appear here." />}
        </div>
      )}

      {/* ── DOWNLOADS ──────────────────────────────────────────────── */}
      {section === 'downloads' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {downloads.map(d => (
            <Card key={d.id} hover style={{ padding: '16px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 24 }}>⬇</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{d.filename || d.product_name || 'Download'}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', marginTop: 3 }}>
                    {d.downloads_used || 0} / {d.downloads_allowed || 5} downloads used
                    {d.last_downloaded_at && <> · Last: {new Date(d.last_downloaded_at).toLocaleDateString()}</>}
                  </div>
                </div>
                <a href={`/api/store/downloads/${d.token}`} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                  <NeonButton variant="primary" size="sm">Download</NeonButton>
                </a>
              </div>
            </Card>
          ))}
          {downloads.length === 0 && <EmptyState icon="⬇" title="No downloads yet" text="Digital purchases will appear here." />}
        </div>
      )}

      {/* ── SUBSCRIPTION ───────────────────────────────────────────── */}
      {section === 'subscription' && (
        <Card accent style={{ padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 3, color: 'var(--muted)' }}>SUBSCRIPTION</span>
              {activeSub ? (
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: 'var(--text)', marginTop: 6 }}>
                  {activeSub.plan_name} — Level {activeSub.plan_level || 0}
                </div>
              ) : (
                <div style={{ color: 'var(--muted)', fontSize: 14, marginTop: 6 }}>You don&apos;t have an active VIP subscription.</div>
              )}
            </div>
            {activeSub && <Badge tone={activeSub.status === 'active' ? 'green' : activeSub.status === 'past_due' ? 'red' : 'orange'}>{activeSub.status?.toUpperCase()}</Badge>}
          </div>
          {activeSub && (
            <>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', lineHeight: 1.7 }}>
                {activeSub.current_period_end && <div>Renews: {new Date(activeSub.current_period_end).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>}
                {activeSub.cancel_at_period_end && <div style={{ color: R }}>⚠ Cancels at end of billing period</div>}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
                <NeonButton variant="cyan" size="sm" onClick={handleManage}>Manage Billing</NeonButton>
                {!activeSub.cancel_at_period_end && (
                  <NeonButton variant="danger" size="sm" onClick={handleCancel}>Cancel</NeonButton>
                )}
              </div>
            </>
          )}
          {!activeSub && (
            <div style={{ marginTop: 8 }}>
              <NeonButton to="/?tab=vip" variant="primary" size="sm">View Plans</NeonButton>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
