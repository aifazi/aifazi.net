'use client'
import { useState, useEffect } from 'react'
import { useParams, Link } from '@/lib/router-compat'
import api from '@/lib/api'
import { Card, Badge, NeonButton } from '../../components/community'

const G = 'var(--green)', C = 'var(--cyan)', R = 'var(--red)'

const statusColor = s => {
  const map = { delivered: G, paid: G, completed: G, cancelled: R, refunded: R, shipped: 'var(--purple)', processing: C }
  return map[s] || 'var(--orange)'
}

const STEPS = ['pending', 'paid', 'processing', 'shipped', 'delivered']

export default function OrderTrackingPage() {
  const { orderNumber } = useParams()
  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [delivery, setDelivery] = useState(null)

  useEffect(() => {
    if (!orderNumber) return
    Promise.all([
      api.get(`/store/track/${orderNumber}`),
      api.get(`/store/delivery/tracking/${orderNumber}`).catch(() => null),
    ]).then(([r, d]) => {
      setOrder(r.data || null)
      setDelivery(d?.data || null)
    }).catch(() => setError('Order not found or tracking is not available.'))
    .finally(() => setLoading(false))
  }, [orderNumber])

  if (loading) return (
    <div className="page-container community-page" style={{ zIndex: 1 }}>
      <div className="community-shell" style={{ textAlign: 'center', padding: '80px 24px' }}>
        <div className="community-skel" style={{ width: '40%', height: 24, margin: '0 auto 16px' }} />
        <div className="community-skel" style={{ width: '60%', height: 8, margin: '0 auto 8px' }} />
        <div className="community-skel" style={{ width: '100%', height: 6, marginTop: 32 }} />
      </div>
    </div>
  )

  if (error || !order) return (
    <div className="page-container community-page" style={{ zIndex: 1 }}>
      <div className="community-shell" style={{ textAlign: 'center', padding: '80px 24px' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>📦</div>
        <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--red)', marginBottom: 16, fontSize: 13 }}>{error || 'Order not found'}</div>
        <NeonButton to="/store" variant="ghost">← Back to Store</NeonButton>
      </div>
    </div>
  )

  const st = (order.status || 'pending').toLowerCase()
  const total = (order.total_cents || 0) / 100
  const currentStep = STEPS.indexOf(st)
  const progress = st === 'cancelled' || st === 'refunded' ? 0 : currentStep >= 0 ? ((currentStep + 1) / STEPS.length) * 100 : 50
  const color = statusColor(st)

  return (
    <div className="page-container community-page" style={{ zIndex: 1 }}>
      <div className="community-shell">
        <div style={{ maxWidth: 760, margin: '0 auto', paddingTop: 24 }}>
          {/* Header */}
          <Card accent style={{ padding: 'clamp(24px, 4vw, 40px)', marginBottom: 24, textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📦</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 3, color: 'var(--muted)', marginBottom: 8 }}>
              ORDER #{order.order_number}
            </div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(22px, 3vw, 32px)', fontWeight: 700, color: 'var(--text)', margin: '0 0 14px' }}>
              {order.items?.[0]?.product_name || 'Order'} — ${total.toFixed(2)}
            </h2>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Badge tone={st === 'delivered' ? 'green' : st === 'cancelled' ? 'red' : 'cyan'} glow>
                {st.toUpperCase()}
              </Badge>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)' }}>
                Placed {order.created_at ? new Date(order.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '—'}
              </span>
            </div>
          </Card>

          {/* Progress */}
          <Card style={{ padding: 24, marginBottom: 24 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 3, color: 'var(--muted)', marginBottom: 16 }}>DELIVERY PROGRESS</div>
            <div style={{ height: 8, background: 'var(--bg3)', borderRadius: 4, overflow: 'hidden', marginBottom: 16 }}>
              <div style={{ height: '100%', width: `${progress}%`, background: `linear-gradient(90deg, ${G}, ${C})`, borderRadius: 4, transition: 'width 0.6s ease', boxShadow: progress > 0 ? `0 0 12px ${color}` : 'none' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              {STEPS.map((step, i) => {
                const done = i < currentStep
                const current = i === currentStep && currentStep >= 0
                return (
                  <div key={step} style={{ textAlign: 'center', flex: 1 }}>
                    <div style={{
                      width: 14, height: 14, borderRadius: '50%', margin: '0 auto 6px',
                      background: done || current ? (done ? G : color) : 'var(--bg3)',
                      border: `3px solid ${done || current ? (done ? G : color) : 'var(--border)'}`,
                      boxShadow: done || current ? `0 0 10px ${done ? G : color}` : 'none',
                    }}>{done && <span style={{ fontSize: 8, lineHeight: '14px', color: '#000' }}>✓</span>}</div>
                    <div style={{
                      fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 1.5,
                      color: done || current ? G : 'var(--muted)',
                      textTransform: 'uppercase', fontWeight: current ? 700 : 400,
                    }}>
                      {step}
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>

          {/* Tracking info */}
          {(order.carrier || order.tracking_number) && (
            <Card style={{ padding: 24, marginBottom: 24 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 3, color: G, marginBottom: 8 }}>TRACKING NUMBER</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700, color: 'var(--text)', letterSpacing: 2, marginBottom: 6 }}>
                {order.tracking_number}
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                {order.carrier || 'Standard Shipping'}
                {order.tracking_url && (
                  <a href={order.tracking_url} target="_blank" rel="noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 12, color: C, textDecoration: 'none', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1 }}>
                    TRACK WITH CARRIER ↗
                  </a>
                )}
              </div>
            </Card>
          )}

          {/* Delivery Agent */}
          {delivery?.agent && (
            <Card style={{ padding: 24, marginBottom: 24 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 3, color: C, marginBottom: 14 }}>DELIVERY AGENT</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 48, height: 48, borderRadius: '50%', background: `linear-gradient(135deg, ${C}, ${G})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700, color: '#000', flexShrink: 0 }}>
                  {(delivery.agent.display_name || 'A')[0].toUpperCase()}
                </div>
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{delivery.agent.display_name}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', marginTop: 3 }}>
                    {delivery.agent.vehicle && <span>{delivery.agent.vehicle} · </span>}
                    <Badge tone={delivery.agent.status === 'available' ? 'green' : delivery.agent.status === 'busy' ? 'orange' : 'red'}>
                      {delivery.agent.status.toUpperCase()}
                    </Badge>
                  </div>
                  {delivery.assignment && (
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', marginTop: 4 }}>
                      {delivery.assignment.picked_up_at && <>Picked up {new Date(delivery.assignment.picked_up_at).toLocaleString()} · </>}
                      Status: {delivery.assignment.status.toUpperCase().replace('_', ' ')}
                    </div>
                  )}
                </div>
              </div>
            </Card>
          )}

          {/* Timeline */}
          {(order.events || []).length > 0 && (
            <Card style={{ padding: 24, marginBottom: 24 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 3, color: 'var(--muted)', marginBottom: 16 }}>STATUS TIMELINE</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {order.events.map((ev, i) => (
                  <div key={i} style={{ display: 'flex', gap: 12 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: G, flexShrink: 0, boxShadow: `0 0 6px ${G}` }} />
                      {i < order.events.length - 1 && <div style={{ width: 2, flex: 1, background: 'var(--border)', minHeight: 20 }} />}
                    </div>
                    <div style={{ paddingBottom: 16 }}>
                      <div style={{ color: 'var(--text)', fontWeight: 600, fontSize: 13 }}>{(ev.status || '').toUpperCase()}</div>
                      {ev.note && <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 3 }}>{ev.note}</div>}
                      <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--muted)', fontSize: 10, marginTop: 4 }}>
                        {ev.created_at ? new Date(ev.created_at).toLocaleString() : ''}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Items */}
          <Card style={{ padding: 24, marginBottom: 24 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 3, color: 'var(--muted)', marginBottom: 16 }}>ORDER ITEMS</div>
            {(order.items || []).map((it, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, padding: '8px 0', borderBottom: i < (order.items || []).length - 1 ? '1px solid var(--border)' : 'none' }}>
                <span>
                  <span style={{ color: 'var(--text)' }}>{it.product_name}</span>
                  <span style={{ color: 'var(--muted)', marginLeft: 6 }}>× {it.quantity}</span>
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--muted)' }}>${((it.line_total_cents || 0) / 100).toFixed(2)}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 700, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--text)' }}>Total</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: G }}>${total.toFixed(2)}</span>
            </div>
          </Card>

          {/* Downloads */}
          {(order.downloads || []).length > 0 && (
            <Card style={{ padding: 24, marginBottom: 24 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 3, color: 'var(--muted)', marginBottom: 16 }}>DIGITAL DOWNLOADS</div>
              <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
                Download links are only shown to the account owner. Sign in to your account and open this order to get your downloads.
              </div>
            </Card>
          )}

          <div style={{ textAlign: 'center', marginTop: 8, display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <NeonButton to="/store" variant="ghost">← Back to Store</NeonButton>
            <Link to="/helpdesk" style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1, color: 'var(--cyan)', textDecoration: 'none', padding: '10px 18px', border: '1px solid var(--border)', borderRadius: 8, display: 'inline-flex', alignItems: 'center' }}>Need help? → Help Desk</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
