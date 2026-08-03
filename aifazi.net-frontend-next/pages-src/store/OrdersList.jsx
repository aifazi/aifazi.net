'use client'
import { Link } from '@/lib/router-compat'
import { Card, NeonButton, Badge } from '../../components/community'

const G = 'var(--green)', C = 'var(--cyan)', R = 'var(--red)', P = 'var(--purple)'
const Y = 'var(--orange)'
const mix = (c, p) => `color-mix(in srgb, ${c} ${p}%, transparent)`

const statusColor = s => s === 'delivered' || s === 'paid' ? G : s === 'cancelled' || s === 'refunded' ? R : s === 'shipped' ? P : s === 'processing' ? C : Y

export default function OrdersList({ orders, loading, user, loginHref, loadOrders, openOrder }) {
  if (!user) return (
    <div className="community-empty">
      <div className="community-empty-icon">🧾</div>
      <div className="community-empty-title">Sign in required</div>
      <p className="community-empty-text">Sign in to track your orders.</p>
      <div style={{ marginTop: 14 }}><NeonButton to={loginHref} variant="primary" size="sm">Sign In</NeonButton></div>
    </div>
  )

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i} style={{ padding: 20 }}>
          <div className="community-skel" style={{ width: '30%', height: 16, marginBottom: 12 }} />
          <div className="community-skel" style={{ width: '100%', height: 10, marginBottom: 6 }} />
          <div className="community-skel" style={{ width: '60%', height: 10 }} />
        </Card>
      ))}
    </div>
  )

  if (orders.length === 0) return (
    <div className="community-empty">
      <div className="community-empty-icon">📋</div>
      <div className="community-empty-title">No orders yet</div>
      <p className="community-empty-text">Head to Products to place your first one.</p>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {orders.map(o => {
        const st = (o.status || 'pending').toUpperCase()
        const color = statusColor(o.status)
        return (
          <Card key={o.id} hover className="store-order-card" style={{ '--hover-color': color, padding: 18, cursor: 'pointer' }} onClick={() => openOrder(o)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: C, fontWeight: 700 }}>{o.order_number}</span>
              <span style={{ fontSize: 10, color: 'var(--muted)' }}>{new Date(o.created_at).toLocaleDateString()}</span>
              <span style={{ flex: 1 }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>${(o.total_cents / 100).toFixed(2)}</span>
              <Badge tone={o.status === 'delivered' ? 'green' : o.status === 'cancelled' ? 'red' : 'cyan'}>{st}</Badge>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
              {(o.items || []).map((it, i) => (
                <span key={i} style={{ fontSize: 11, color: 'var(--text)', background: 'rgba(255,255,255,0.03)', padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)' }}>
                  {it.product_name} × {it.quantity}
                </span>
              ))}
            </div>
            {o.tracking_number && (
              <div style={{ marginTop: 10, fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
                📦 {o.carrier || 'Carrier'}: {o.tracking_number}
                {o.tracking_url && <a href={o.tracking_url} target="_blank" rel="noreferrer" style={{ color: C, marginLeft: 8 }}>TRACK ↗</a>}
              </div>
            )}
            {(o.downloads || []).length > 0 && (
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 2, color: G, fontWeight: 800 }}>DIGITAL DOWNLOADS</div>
                {o.downloads.map(d => (
                  <a key={d.id} href={`/api/store/downloads/${d.token}`} target="_blank" rel="noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, color: C, textDecoration: 'none', padding: '7px 12px', border: `1px solid ${mix(C, 25)}`, borderRadius: 8 }}>
                    ⬇ {d.filename || d.product_name} <span style={{ fontSize: 10, color: 'var(--muted)' }}>({d.downloads_used}/{d.downloads_allowed} used)</span>
                  </a>
                ))}
              </div>
            )}
          </Card>
        )
      })}
    </div>
  )
}
