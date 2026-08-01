'use client'
import React, { useState, useEffect, useCallback } from 'react'
import api from '@/lib/api'
import { useToast } from '../../../components/Toast'
import { useDialog } from '../../../components/Dialog'

const MONO = "var(--font-mono,'JetBrains Mono',monospace)"
const G = '#00FF88', C = '#00D4FF', R = '#ff4757', Y = '#facc15', O = '#ff6b35'
const money = c => `$${((c || 0) / 100).toFixed(2)}`
const fmt = iso => iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'
const KIND_COLORS = { sale: G, refund: R, credit: C }

export default function PaymentsTab() {
  const toast = useToast()
  const { confirm } = useDialog()
  const [txns, setTxns] = useState([])
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [kind, setKind] = useState('all')
  const [orderFilter, setOrderFilter] = useState('all')
  const [refunding, setRefunding] = useState(null)

  const loadTxns = useCallback(() => {
    setLoading(true)
    const q = kind === 'all' ? '' : `?kind=${kind}`
    api.get(`/store/admin/transactions${q}`).then(r => setTxns(r.data || [])).catch(() => toast.error('Failed to load transactions'))
      .finally(() => setLoading(false))
  }, [kind, toast])

  const loadOrders = useCallback(() => {
    const q = orderFilter === 'all' ? '' : `?status=${orderFilter}`
    api.get(`/store/admin/orders${q}`).then(r => setOrders(r.data || [])).catch(() => {})
  }, [orderFilter])

  useEffect(() => { loadTxns() }, [loadTxns])
  useEffect(() => { loadOrders() }, [loadOrders])

  const refund = async o => {
    const ok = await confirm({ title: `Refund ${o.order_number}`, message: `Refund ${money(o.total_cents)} and restock items? This is recorded in the ledger.`, variant: 'danger', confirmLabel: 'REFUND' })
    if (!ok) return
    setRefunding(o.id)
    try {
      const r = await api.post(`/store/admin/orders/${o.id}/refund`)
      toast.success(`${money(r.data?.refund_cents)} refunded`, { title: 'Payments' })
      loadOrders(); loadTxns()
    } catch (err) { toast.error(err?.response?.data?.detail || 'Refund failed', { title: 'Payments' }) }
    finally { setRefunding(null) }
  }

  const saleSum = txns.filter(t => t.kind === 'sale').reduce((a, t) => a + (t.amount_cents || 0), 0)
  const refundSum = txns.filter(t => t.kind === 'refund').reduce((a, t) => a + (t.amount_cents || 0), 0)

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'SALES', value: money(saleSum), color: G },
          { label: 'REFUNDS', value: money(refundSum), color: R },
          { label: 'NET', value: money(saleSum - refundSum), color: C },
          { label: 'TXN COUNT', value: txns.length, color: 'var(--text)' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px' }}>
            <div style={{ fontFamily: MONO, fontSize: 8, letterSpacing: 2, color: 'var(--muted)' }}>{s.label}</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: s.color, marginTop: 4 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Refundable paid orders */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 2, color: 'var(--muted)' }}>REFUND A PAID ORDER</div>
          <select value={orderFilter} onChange={e => setOrderFilter(e.target.value)} style={{ fontFamily: MONO, fontSize: 10, background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, padding: '6px 10px' }}>
            <option value="all">All orders</option>
            <option value="paid">Paid</option>
            <option value="processing">Processing</option>
            <option value="shipped">Shipped</option>
            <option value="refunded">Refunded</option>
          </select>
        </div>
        {orders.length === 0 ? <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--muted)' }}>No orders.</div> : (
          <div style={{ display: 'grid', gap: 6 }}>
            {orders.map(o => (
              <div key={o.id} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: MONO, fontSize: 11, color: C }}>{o.order_number}</span>
                <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 1, padding: '2px 8px', borderRadius: 12, background: 'rgba(0,255,136,.08)', border: '1px solid rgba(0,255,136,.3)', color: G }}>{o.status}</span>
                <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--muted)' }}>{o.customer_name || '—'}</span>
                <div style={{ flex: 1 }} />
                <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700 }}>{money(o.total_cents)}</span>
                <button onClick={() => refund(o)} disabled={refunding === o.id || o.status === 'refunded'} style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 1, padding: '6px 12px', background: 'rgba(255,71,87,.1)', border: '1px solid rgba(255,71,87,.4)', color: o.status === 'refunded' ? 'var(--muted)' : R, borderRadius: 6, cursor: o.status === 'refunded' ? 'not-allowed' : 'pointer', opacity: o.status === 'refunded' ? 0.5 : 1 }}>
                  {o.status === 'refunded' ? 'REFUNDED' : refunding === o.id ? '…' : 'REFUND'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Transaction ledger */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        {[['all', 'ALL'], ['sale', 'SALES'], ['refund', 'REFUNDS'], ['credit', 'CREDITS']].map(([v, l]) => (
          <button key={v} onClick={() => setKind(v)} style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 1, padding: '6px 12px', borderRadius: 20, cursor: 'pointer', background: kind === v ? 'rgba(0,255,136,.12)' : 'transparent', color: kind === v ? G : 'var(--muted)', border: `1px solid ${kind === v ? 'rgba(0,255,136,.4)' : 'var(--border)'}` }}>{l}</button>
        ))}
      </div>

      {loading ? <div className="loader" /> : txns.length === 0 ? (
        <div style={{ color: 'var(--muted)', fontFamily: MONO, fontSize: 12, padding: 30, textAlign: 'center', border: '1px dashed var(--border)', borderRadius: 8 }}>No transactions yet.</div>
      ) : (
        txns.map(t => {
          const col = KIND_COLORS[t.kind] || 'var(--muted)'
          return (
            <div key={t.id} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 1, padding: '2px 8px', borderRadius: 12, background: `${col}14`, border: `1px solid ${col}44`, color: col, minWidth: 70, textAlign: 'center' }}>{t.kind.toUpperCase()}</span>
              <div style={{ flex: 1, minWidth: 140 }}>
                <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text)' }}>{t.customer || '—'}</div>
                <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)', marginTop: 2 }}>{fmt(t.created_at)}</div>
              </div>
              {t.order_id && <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)' }}>order {t.order_id.slice(0, 8)}</span>}
              {t.stripe_payment_intent_id && <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)' }}>pi_{t.stripe_payment_intent_id.slice(0, 12)}…</span>}
              <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: col, minWidth: 90, textAlign: 'right' }}>{t.kind === 'refund' ? '−' : '+'}{money(t.amount_cents)}</span>
            </div>
          )
        })
      )}
    </div>
  )
}
