'use client'
import { useState, useEffect } from 'react'
import api from '@/lib/api'
import { Link } from '@/lib/router-compat'
import { useForum } from '../../context/ForumContext'
import { Card, NeonButton, Badge, EmptyState } from '../../components/community'

const mix = (c, p) => `color-mix(in srgb, ${c} ${p}%, transparent)`
const G = 'var(--green)', C = 'var(--cyan)', R = 'var(--red)', Y = 'var(--orange)', P = 'var(--purple)'

function DashboardOverview({ sub, orders, downloads }) {
  const activeSub = sub?.subscription
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 32 }}>
      <Card style={{ padding: 20, textAlign: 'center' }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>📦</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700, color: G }}>{orders.length}</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 2, color: 'var(--muted)', marginTop: 4 }}>ORDERS</div>
      </Card>
      <Card style={{ padding: 20, textAlign: 'center' }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>⬇</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700, color: C }}>{downloads.length}</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 2, color: 'var(--muted)', marginTop: 4 }}>DOWNLOADS</div>
      </Card>
      <Card style={{ padding: 20, textAlign: 'center' }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>👑</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700, color: activeSub ? G : 'var(--muted)' }}>{activeSub ? 'Active' : 'None'}</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 2, color: 'var(--muted)', marginTop: 4 }}>SUBSCRIPTION</div>
      </Card>
      <Card style={{ padding: 20, textAlign: 'center' }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>💰</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700, color: Y }}>
          ${orders.reduce((sum, o) => sum + ((o.total_cents || 0) / 100), 0).toFixed(2)}
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 2, color: 'var(--muted)', marginTop: 4 }}>TOTAL SPENT</div>
      </Card>
    </div>
  )
}

function SubscriptionCard({ sub, handleManage, handleCancel }) {
  const s = sub?.subscription
  if (!s) return (
    <Card style={{ padding: 24 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 3, color: 'var(--muted)', marginBottom: 14 }}>ACTIVE SUBSCRIPTION</div>
      <div style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 16 }}>
        You don't have an active VIP subscription.
      </div>
      <NeonButton to="/store" variant="primary" size="sm">View Plans</NeonButton>
    </Card>
  )

  const status = s.status
  const statusColor = status === 'active' || status === 'trialing' ? G : status === 'past_due' ? R : Y

  return (
    <Card style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 3, color: 'var(--muted)' }}>ACTIVE SUBSCRIPTION</span>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: 'var(--text)', marginTop: 6 }}>{s.plan_name} — Level {s.plan_level || 0}</div>
        </div>
        <Badge tone={status === 'active' ? 'green' : status === 'past_due' ? 'red' : 'orange'}>{status.toUpperCase()}</Badge>
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', lineHeight: 1.7 }}>
        {s.current_period_end && <div>Renews: {new Date(s.current_period_end).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>}
        {s.cancel_at_period_end && <div style={{ color: R }}>⚠ Cancels at end of billing period</div>}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
        <NeonButton variant="cyan" size="sm" onClick={handleManage}>Manage Billing</NeonButton>
        {!s.cancel_at_period_end && (
          <NeonButton variant="danger" size="sm" onClick={handleCancel}>Cancel</NeonButton>
        )}
      </div>
    </Card>
  )
}

const statusBadge = s => {
  const map = { delivered: 'green', paid: 'green', completed: 'green', cancelled: 'red', refunded: 'red', shipped: 'purple', processing: 'cyan' }
  return map[s] || 'orange'
}

function OrderHistory({ orders, openOrder }) {
  if (!orders.length) return (
    <EmptyState icon="📋" title="No orders yet" text="Your orders will appear here." />
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {orders.map(o => {
        const total = (o.total_cents || 0) / 100
        const st = (o.status || 'pending').toUpperCase()
        return (
          <Card key={o.id} hover style={{ padding: '16px 20px', cursor: 'pointer' }} onClick={() => openOrder(o)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: C }}>#{o.order_number}</span>
                  <Badge tone={statusBadge(o.status)}>{st}</Badge>
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)' }}>
                  {new Date(o.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                  {(o.items || []).length > 0 && <> · {o.items.length} item{o.items.length !== 1 ? 's' : ''}</>}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>${total.toFixed(2)}</div>
                {o.tracking_number && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', marginTop: 2 }}>📦 Trackable</div>}
              </div>
            </div>
          </Card>
        )
      })}
    </div>
  )
}

function DownloadsLibrary({ downloads }) {
  if (!downloads.length) return (
    <EmptyState icon="⬇" title="No downloads yet" text="Digital purchases will appear here." />
  )

  return (
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
            <a href={`/api/store/downloads/${d.token}`} target="_blank" rel="noreferrer"
              style={{ textDecoration: 'none' }}>
              <NeonButton variant="primary" size="sm">Download</NeonButton>
            </a>
          </div>
        </Card>
      ))}
    </div>
  )
}

function OrderTracking({ order }) {
  if (!order) return null
  const total = (order.total_cents || 0) / 100
  const st = (order.status || 'pending')
  const STEPS = ['pending', 'paid', 'processing', 'shipped', 'delivered']
  const currentStep = STEPS.indexOf(st)
  const progress = st === 'cancelled' || st === 'refunded' ? 0 : currentStep >= 0 ? ((currentStep + 1) / STEPS.length) * 100 : 50

  return (
    <Card style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2, color: C }}>
          ORDER #{order.order_number}
        </span>
        <Badge tone={statusBadge(st)} glow>{(st).toUpperCase()}</Badge>
      </div>

      {/* Progress bar */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ height: 6, background: 'var(--bg3)', borderRadius: 3, overflow: 'hidden', marginBottom: 12 }}>
          <div style={{ height: '100%', width: `${progress}%`, background: st === 'cancelled' || st === 'refunded' ? R : `linear-gradient(90deg, ${G}, ${C})`, borderRadius: 3, transition: 'width 0.5s ease' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          {STEPS.map((step, i) => (
            <div key={step} style={{ textAlign: 'center', flex: 1 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', margin: '0 auto 4px',
                background: i <= currentStep && currentStep >= 0 ? G : 'var(--bg3)',
                border: `2px solid ${i <= currentStep && currentStep >= 0 ? G : 'var(--border)'}` }} />
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 7, letterSpacing: 1, color: i <= currentStep && currentStep >= 0 ? G : 'var(--muted)', textTransform: 'uppercase' }}>{step}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Timeline */}
      {(order.events || []).length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 2, color: 'var(--muted)', marginBottom: 10 }}>TIMELINE</div>
          {order.events.map((ev, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 8, fontSize: 12 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', marginTop: 4, background: G, flexShrink: 0 }} />
              <div>
                <span style={{ color: 'var(--text)', fontWeight: 600 }}>{(ev.status || '').toUpperCase()}</span>
                {ev.note && <span style={{ color: 'var(--muted)', marginLeft: 8 }}>{ev.note}</span>}
                <div style={{ color: 'var(--muted)', fontSize: 10 }}>{ev.created_at ? new Date(ev.created_at).toLocaleString() : ''}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tracking info */}
      {(order.carrier || order.tracking_number) && (
        <div style={{ padding: '12px 16px', background: 'rgba(0,255,136,0.04)', border: `1px solid ${mix(G, 18)}`, borderRadius: 10, marginBottom: 16 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 2, color: G, marginBottom: 4 }}>TRACKING</div>
          <div style={{ fontSize: 13, color: 'var(--text)' }}>
            {order.carrier || 'Carrier'}: {order.tracking_number}
            {order.tracking_url && <a href={order.tracking_url} target="_blank" rel="noreferrer" style={{ color: C, marginLeft: 8, fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1 }}>TRACK ↗</a>}
          </div>
        </div>
      )}

      {/* Items */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 2, color: 'var(--muted)', marginBottom: 10 }}>ITEMS</div>
        {(order.items || []).map((it, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '6px 0', borderBottom: i < (order.items || []).length - 1 ? '1px solid var(--border)' : 'none' }}>
            <span>{it.product_name} × {it.quantity}</span>
            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--muted)' }}>${((it.line_total_cents || 0) / 100).toFixed(2)}</span>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 700, marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
          <span>Total</span>
          <span style={{ fontFamily: 'var(--font-mono)', color: G }}>${total.toFixed(2)}</span>
        </div>
      </div>

      <NeonButton variant="ghost" size="sm" onClick={() => window.open(`/store/track/${order.order_number}`, '_blank')}>
        Share Tracking Link ↗
      </NeonButton>
    </Card>
  )
}

export default function AccountDashboard({ loginHref }) {
  const { user } = useForum()
  const [sub, setSub] = useState(null)
  const [orders, setOrders] = useState([])
  const [downloads, setDownloads] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeView, setActiveView] = useState('overview')
  const [detailOrder, setDetailOrder] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!user) { setLoading(false); return }
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

  const openOrderDetail = async (o) => {
    try {
      const r = await api.get(`/store/orders/${o.order_number}`)
      setDetailOrder(r.data || o)
    } catch { setDetailOrder(o) }
    setActiveView('tracking')
  }

  if (!user) return (
    <div style={{ textAlign: 'center', padding: '60px 24px' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>🔐</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', marginBottom: 16 }}>
        Sign in to access your account dashboard.
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

  const VIEWS = [
    ['overview', '📊 Overview'],
    ['orders', '📦 Orders'],
    ['downloads', '⬇ Downloads'],
    ['subscription', '👑 Subscription'],
  ]

  return (
    <div>
      {error && (
        <div style={{ padding: '10px 16px', background: mix(R, 10), border: `1px solid ${mix(R, 25)}`, borderRadius: 10, color: R, fontSize: 12, fontFamily: 'var(--font-mono)', marginBottom: 20 }}>
          {error}
          <button onClick={() => setError('')} style={{ background: 'none', border: 'none', color: R, cursor: 'pointer', float: 'right' }}>✕</button>
        </div>
      )}

      {/* Navigation pills */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 28 }}>
        {VIEWS.map(([k, label]) => (
          <button key={k} onClick={() => { setActiveView(k); setDetailOrder(null) }}
            className={`store-filter-pill ${activeView === k ? 'active' : ''}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Views */}
      {activeView === 'overview' && <DashboardOverview sub={sub} orders={orders} downloads={downloads} />}

      {activeView === 'subscription' && (
        <SubscriptionCard sub={sub} handleManage={handleManage} handleCancel={handleCancel} />
      )}

      {activeView === 'orders' && (
        <OrderHistory orders={orders} openOrder={openOrderDetail} />
      )}

      {activeView === 'downloads' && (
        <DownloadsLibrary downloads={downloads} />
      )}

      {activeView === 'tracking' && detailOrder && (
        <div>
          <button onClick={() => { setActiveView('orders'); setDetailOrder(null) }}
            style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: 1, marginBottom: 16 }}>
            ← Back to Orders
          </button>
          <OrderTracking order={detailOrder} />
        </div>
      )}
    </div>
  )
}
