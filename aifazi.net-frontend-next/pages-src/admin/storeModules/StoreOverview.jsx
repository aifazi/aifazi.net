'use client'
import React, { useState, useEffect, useCallback } from 'react'
import api from '@/lib/api'
import { useToast } from '../../../components/Toast'
import { useIsMobile } from '../shared'

const MONO = "var(--font-mono,'JetBrains Mono',monospace)"
const G = 'var(--green)'
const C = 'var(--cyan)'
const R = 'var(--red)'
const Y = '#ffd700'
const O = 'var(--orange)'
const money = c => `$${((c || 0) / 100).toFixed(2)}`
const fmt = iso => iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'

const STATUS_COLORS = {
  pending: Y, paid: G, processing: C, shipped: 'var(--purple)',
  delivered: G, cancelled: R, refunded: O,
}

function Stat({ label, value, color = 'var(--text)', sub, onClick }) {
  return (
    <div onClick={onClick} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px', cursor: onClick ? 'pointer' : 'default', transition: 'border-color 0.2s, transform 0.15s', position: 'relative', overflow: 'hidden' }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = color; e.currentTarget.style.transform = 'translateY(-2px)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'none' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${color}, transparent)` }} />
      <div style={{ fontFamily: MONO, fontSize: 8, letterSpacing: 2.5, color: 'var(--muted)', marginBottom: 8 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 800, color, lineHeight: 1, marginBottom: 6 }}>{value}</div>
      {sub && <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)' }}>{sub}</div>}
    </div>
  )
}

export default function StoreOverview({ onNavigate }) {
  const toast = useToast()
  const isMobile = useIsMobile()
  const [d, setD] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    api.get('/store/admin/sales').then(r => setD(r.data || null)).catch(() => toast.error('Failed to load store overview'))
      .finally(() => setLoading(false))
  }, [toast])

  useEffect(() => { load() }, [load])

  if (loading || !d) return <div className="loader" />

  const maxDay = Math.max(1, ...(d.revenue_by_day || []).map(x => x.revenue_cents))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Stat grid */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
        <Stat label="NET REVENUE" value={money(d.net_revenue_cents)} color={G} sub={`${money(d.revenue_cents)} sales − ${money(d.refund_cents)} refunds`} />
        <Stat label="PAID ORDERS" value={d.paid_orders_count} color={C} sub={`${d.orders_count} total placed`} />
        <Stat label="PRODUCTS" value={d.products_count} color="var(--text)" sub={`${d.low_stock_count} low stock`} onClick={() => onNavigate?.('products')} />
        <Stat label="PENDING QUOTES" value={d.pending_quotes_count} color={Y} sub="awaiting reply" onClick={() => onNavigate?.('quotes')} />
      </div>

      {/* Revenue chart */}
      {d.revenue_by_day?.length > 0 && (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 2, color: 'var(--muted)' }}>REVENUE · LAST 30 DAYS</div>
            <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)' }}>{d.revenue_by_day.length} days</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 110 }}>
            {d.revenue_by_day.map((x, i) => {
              const h = Math.max(3, Math.round((x.revenue_cents / maxDay) * 100))
              return (
                <div key={x.date} title={`${fmt(x.date)}: ${money(x.revenue_cents)}`} style={{ flex: 1, display: 'flex', alignItems: 'flex-end', height: '100%' }}>
                  <div style={{ width: '100%', height: `${h}%`, borderRadius: '3px 3px 0 0', background: `linear-gradient(180deg, ${G}, ${C})`, opacity: i === d.revenue_by_day.length - 1 ? 1 : 0.55 }} />
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16 }}>
        {/* Top products */}
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 18 }}>
          <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 3, color: 'var(--muted)', marginBottom: 14 }}>TOP PRODUCTS BY UNITS SOLD</div>
          {(d.top_products || []).length === 0 && <div style={{ color: 'var(--muted)', fontSize: 12 }}>No sales yet.</div>}
          {(d.top_products || []).map(p => (
            <div key={p.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <span style={{ fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
              <span style={{ fontFamily: MONO, fontSize: 11, color: G, whiteSpace: 'nowrap' }}>{p.units} × {money(p.revenue_cents)}</span>
            </div>
          ))}
        </div>

        {/* Low stock alerts */}
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 18 }}>
          <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 3, color: 'var(--muted)', marginBottom: 14 }}>LOW STOCK ALERTS</div>
          {(d.low_stock || []).length === 0 && <div style={{ color: 'var(--muted)', fontSize: 12 }}>All stock levels healthy.</div>}
          {(d.low_stock || []).map(p => (
            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)' }}>{p.sku || p.slug}</div>
              </div>
              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, fontFamily: MONO, background: 'color-mix(in srgb, var(--orange) 9%, transparent)', border: '1px solid color-mix(in srgb, var(--orange) 25%, transparent)', color: O, letterSpacing: 0.5, whiteSpace: 'nowrap' }}>{p.stock_qty} left</span>
            </div>
          ))}
        </div>
      </div>

      {/* Recent orders */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 3, color: 'var(--muted)' }}>RECENT ORDERS</div>
          <button onClick={() => onNavigate?.('orders')} style={{ background: 'none', border: '1px solid var(--border)', color: C, fontSize: 9, letterSpacing: 1, padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontFamily: MONO }}>VIEW ALL →</button>
        </div>
        {(d.recent_orders || []).map(o => {
          const stColor = STATUS_COLORS[o.status] || 'var(--muted)'
          return (
            <div key={o.order_number} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', flexWrap: 'wrap' }}>
              <span style={{ fontFamily: MONO, fontSize: 11, color: C }}>{o.order_number}</span>
              <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--muted)', flex: 1, textAlign: 'center' }}>{fmt(o.created_at)}</span>
              <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text)' }}>{money(o.total_cents)}</span>
              <span style={{ fontSize: 9, letterSpacing: 1, padding: '2px 8px', borderRadius: 12, border: `1px solid ${stColor}55`, color: stColor, fontWeight: 800 }}>{(o.status || '').toUpperCase()}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
