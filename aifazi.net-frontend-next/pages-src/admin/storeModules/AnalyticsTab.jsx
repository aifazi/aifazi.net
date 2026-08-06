'use client'
import React, { useState, useEffect, useCallback } from 'react'
import api from '@/lib/api'
import { useToast } from '../../../components/Toast'

const MONO = "var(--font-mono,'JetBrains Mono',monospace)"
const G = '#00FF88', C = '#00D4FF', R = '#ff4757', Y = '#facc15', O = '#ff6b35'
const money = c => `$${((c || 0) / 100).toFixed(2)}`
const fmt = iso => iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'â€”'

function Stat({ label, value, color = 'var(--text)', sub }) {
  return (
    <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 16px' }}>
      <div style={{ fontFamily: MONO, fontSize: 8, letterSpacing: 2, color: 'var(--muted)' }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700, color, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

export default function AnalyticsTab() {
  const toast = useToast()
  const [d, setD] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    api.get('/store/admin/sales').then(r => setD(r.data || null)).catch(() => toast.error('Failed to load analytics'))
      .finally(() => setLoading(false))
  }, [toast])

  useEffect(() => { load() }, [load])

  if (loading || !d) return <div className="loader" />

  const maxDay = Math.max(1, ...(d.revenue_by_day || []).map(x => x.revenue_cents))
  const convOrders = d.revenue_by_day?.length ? d.revenue_by_day[d.revenue_by_day.length - 1].orders : 0

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 10, marginBottom: 16 }}>
        <Stat label="NET REVENUE" value={money(d.net_revenue_cents)} color={G} sub={`${money(d.revenue_cents)} sales âˆ’ ${money(d.refund_cents)} refunds`} />
        <Stat label="PAID ORDERS" value={d.paid_orders_count} color="var(--text)" sub={`${d.orders_count} total`} />
        <Stat label="PRODUCTS" value={d.products_count} color={C} sub={`${d.low_stock_count} low stock`} />
        <Stat label="PENDING QUOTES" value={d.pending_quotes_count} color={Y} />
      </div>

      {/* 30-day revenue chart */}
      {d.revenue_by_day?.length > 0 ? (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 2, color: 'var(--muted)' }}>REVENUE Â· LAST 30 DAYS</div>
            <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)' }}>{d.revenue_by_day.length} days Â· {convOrders} orders today</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 120 }}>
            {d.revenue_by_day.map((x, i) => {
              const h = Math.max(3, Math.round((x.revenue_cents / maxDay) * 100))
              const isLast = i === d.revenue_by_day.length - 1
              return (
                <div key={x.date} title={`${fmt(x.date)}: ${money(x.revenue_cents)}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: '100%', height: h, background: isLast ? G : 'color-mix(in srgb, var(--green) 35%, transparent)', borderRadius: '3px 3px 0 0', minHeight: 3, boxShadow: isLast ? `0 0 12px ${G}55` : 'none' }} />
                  {isLast && <span style={{ fontFamily: MONO, fontSize: 7, color: 'var(--muted)', transform: 'rotate(-40deg)' }}>{money(x.revenue_cents)}</span>}
                </div>
              )
            })}
          </div>
        </div>
      ) : <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--muted)', padding: 16, textAlign: 'center', border: '1px dashed var(--border)', borderRadius: 8, marginBottom: 16 }}>No paid orders yet â€” revenue chart appears here.</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 12 }}>
        {/* Top products */}
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: 14 }}>
          <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 2, color: 'var(--muted)', marginBottom: 10 }}>TOP PRODUCTS</div>
          {d.top_products?.length === 0 ? <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--muted)' }}>No sales yet.</div> : (
            <div style={{ display: 'grid', gap: 6 }}>
              {d.top_products.map((p, i) => {
                const w = d.top_products[0]?.units ? Math.round((p.units / d.top_products[0].units) * 100) : 0
                return (
                  <div key={p.name} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{i + 1}. {p.name}</span>
                      <span style={{ fontFamily: MONO, fontSize: 10, color: G, whiteSpace: 'nowrap' }}>{money(p.revenue_cents)}</span>
                    </div>
                    <div style={{ height: 4, background: 'rgba(255,255,255,.06)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${w}%`, background: C, borderRadius: 2 }} />
                    </div>
                    <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)', marginTop: 4 }}>{p.units} units</div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Recent orders */}
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: 14 }}>
          <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 2, color: 'var(--muted)', marginBottom: 10 }}>RECENT ORDERS</div>
          {d.recent_orders?.length === 0 ? <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--muted)' }}>No orders yet.</div> : (
            <div style={{ display: 'grid', gap: 6 }}>
              {d.recent_orders.map(o => (
                <div key={o.order_number} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: MONO, fontSize: 10, color: C }}>{o.order_number}</span>
                  <span style={{ fontFamily: MONO, fontSize: 8, letterSpacing: 1, padding: '1px 7px', borderRadius: 10, background: 'color-mix(in srgb, var(--green) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--green) 30%, transparent)', color: G }}>{o.status}</span>
                  <div style={{ flex: 1 }} />
                  <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)' }}>{fmt(o.created_at)}</span>
                  <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700 }}>{money(o.total_cents)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Low stock strip */}
      {d.low_stock?.length > 0 && (
        <div style={{ background: 'var(--bg2)', border: '1px solid rgba(250,204,21,.25)', borderRadius: 10, padding: 14, marginTop: 12 }}>
          <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 2, color: Y, marginBottom: 8 }}>âš  LOW STOCK</div>
          <div style={{ display: 'grid', gap: 6 }}>
            {d.low_stock.map(p => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: MONO, fontSize: 10, color: 'var(--text)' }}>
                <span style={{ flex: 1 }}>{p.name}</span>
                <span style={{ color: R, fontWeight: 700 }}>{p.stock_qty || 0} left</span>
                <span style={{ color: 'var(--muted)' }}>thr {p.low_stock_threshold || 0}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
