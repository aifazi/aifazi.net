'use client'
import { useState } from 'react'
import api from '@/lib/api'
import { Card, NeonButton, Badge } from '../components/community'

const G = 'var(--green)', C = 'var(--cyan)', R = 'var(--red)'
const mix = (c, p) => `color-mix(in srgb, ${c} ${p}%, transparent)`

const STEPS = ['pending', 'paid', 'processing', 'shipped', 'delivered']

export default function TrackOrderWidget() {
  const [orderNo, setOrderNo] = useState('')
  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLookup = async (e) => {
    e.preventDefault()
    if (!orderNo.trim()) return
    setLoading(true)
    setError('')
    setOrder(null)
    try {
      const r = await api.get(`/store/track/${orderNo.trim()}`)
      setOrder(r.data)
    } catch {
      setError('Order not found. Check the order number and try again.')
    } finally { setLoading(false) }
  }

  const st = (order?.status || 'pending').toLowerCase()
  const total = (order?.total_cents || 0) / 100
  const currentStep = STEPS.indexOf(st)
  const progress = st === 'cancelled' || st === 'refunded' ? 0 : currentStep >= 0 ? ((currentStep + 1) / STEPS.length) * 100 : 50

  return (
    <div>
      {/* Lookup form */}
      <Card style={{ padding: 20, marginBottom: 20 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 3, color: C, marginBottom: 12 }}>
          TRACK ORDER
        </div>
        <form onSubmit={handleLookup} style={{ display: 'flex', gap: 0 }}>
          <input
            value={orderNo}
            onChange={e => setOrderNo(e.target.value)}
            placeholder="Enter order number (e.g. ORD-...)"
            style={{
              flex: 1, background: 'var(--bg3)', border: '1px solid var(--border)',
              borderRadius: '10px 0 0 10px', color: 'var(--text)',
              fontFamily: 'var(--font-mono)', fontSize: 13, padding: '12px 16px', outline: 'none',
            }}
          />
          <NeonButton type="submit" variant="primary" size="md" disabled={loading}
            style={{ borderRadius: '0 10px 10px 0' }}>
            {loading ? '...' : 'Track'}
          </NeonButton>
        </form>
        {error && (
          <div style={{ marginTop: 12, fontSize: 12, color: R, fontFamily: 'var(--font-mono)' }}>{error}</div>
        )}
      </Card>

      {/* Result */}
      {order && (
        <Card accent style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: C, fontWeight: 700 }}>
              #{order.order_number}
            </span>
            <Badge tone={st === 'delivered' ? 'green' : st === 'cancelled' ? 'red' : 'cyan'} glow>
              {st.toUpperCase()}
            </Badge>
          </div>

          {/* Progress */}
          <div style={{ height: 6, background: 'var(--bg3)', borderRadius: 3, overflow: 'hidden', marginBottom: 10 }}>
            <div style={{ height: '100%', width: `${progress}%`, background: `linear-gradient(90deg, ${G}, ${C})`, borderRadius: 3, transition: 'width 0.5s' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
            {STEPS.map((step, i) => (
              <div key={step} style={{ textAlign: 'center', flex: 1 }}>
                <div style={{
                  width: 10, height: 10, borderRadius: '50%', margin: '0 auto 3px',
                  background: i <= currentStep && currentStep >= 0 ? G : 'var(--bg3)',
                  border: `2px solid ${i <= currentStep && currentStep >= 0 ? G : 'var(--border)'}`,
                }} />
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 7, letterSpacing: 1, color: i <= currentStep && currentStep >= 0 ? G : 'var(--muted)', textTransform: 'uppercase' }}>
                  {step}
                </div>
              </div>
            ))}
          </div>

          {/* Items */}
          {(order.items || []).length > 0 && (
            <div style={{ marginBottom: 12 }}>
              {(order.items || []).map((it, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0' }}>
                  <span>{it.product_name} × {it.quantity}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--muted)' }}>${((it.line_total_cents || 0) / 100).toFixed(2)}</span>
                </div>
              ))}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 6, marginTop: 4, fontWeight: 700, fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
                <span>Total</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: G }}>${total.toFixed(2)}</span>
              </div>
            </div>
          )}

          {/* Tracking info */}
          {(order.carrier || order.tracking_number) && (
            <div style={{ padding: '10px 14px', background: mix(G, 5), border: `1px solid ${mix(G, 18)}`, borderRadius: 8, marginTop: 12 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: G, letterSpacing: 2, marginBottom: 4 }}>TRACKING</div>
              <div style={{ fontSize: 13, color: 'var(--text)' }}>
                {order.carrier || 'Carrier'}: {order.tracking_number}
                {order.tracking_url && (
                  <a href={order.tracking_url} target="_blank" rel="noreferrer" style={{ color: C, marginLeft: 8, fontFamily: 'var(--font-mono)', fontSize: 10 }}>
                    TRACK ↗
                  </a>
                )}
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
