'use client'
import React, { useState, useEffect, useCallback } from 'react'
import api from '@/lib/api'
import { useToast } from '../../../components/Toast'

const MONO = "var(--font-mono,'JetBrains Mono',monospace)"
const G = '#00FF88', C = '#00D4FF', R = '#ff4757', Y = '#facc15', O = '#ff6b35'
const fmt = iso => iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'â€”'
const REASON_COLORS = { sale: G, refund: C, adjustment: Y, order: O }

export default function StockLedgerTab() {
  const toast = useToast()
  const [low, setLow] = useState([])
  const [ledger, setLedger] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      api.get('/store/admin/low-stock').then(r => setLow(r.data || [])).catch(() => []),
      api.get('/store/admin/stock-ledger').then(r => setLedger(r.data || [])).catch(() => []),
    ]).then(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const shown = ledger.filter(l => filter === 'all' || (l.reason || 'adjustment') === filter)
  const reasons = [...new Set(ledger.map(l => l.reason || 'adjustment'))]

  return (
    <div>
      {/* Low stock alerts */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 2, color: 'var(--muted)' }}>âš  LOW-STOCK ALERTS</div>
          <span style={{ fontFamily: MONO, fontSize: 10, color: low.length ? Y : G }}>{low.length} item{low.length === 1 ? '' : 's'} low</span>
        </div>
        {low.length === 0 ? (
          <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--muted)', padding: '8px 0' }}>All stocked items above threshold. âœ“</div>
        ) : (
          <div style={{ display: 'grid', gap: 6 }}>
            {low.map(i => (
              <div key={i.kind + i.id} style={{ background: 'var(--bg3)', border: '1px solid rgba(250,204,21,.25)', borderRadius: 8, padding: '9px 12px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 1, padding: '2px 8px', borderRadius: 12, background: 'rgba(250,204,21,.1)', border: '1px solid rgba(250,204,21,.3)', color: Y }}>{i.kind.toUpperCase()}</span>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{i.name}</div>
                  <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)', marginTop: 2 }}>{i.sku || 'no sku'}</div>
                </div>
                <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: R }}>{i.stock_qty ?? 0} left</span>
                <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)' }}>threshold {i.low_stock_threshold ?? 0}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Ledger */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 2, color: 'var(--muted)' }}>STOCK LEDGER</div>
        <div style={{ flex: 1 }} />
        {['all', ...reasons].map(rsn => (
          <button key={rsn} onClick={() => setFilter(rsn)} style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 1, padding: '5px 10px', borderRadius: 20, cursor: 'pointer', background: filter === rsn ? 'color-mix(in srgb, var(--green) 12%, transparent)' : 'transparent', color: filter === rsn ? G : 'var(--muted)', border: `1px solid ${filter === rsn ? 'color-mix(in srgb, var(--green) 40%, transparent)' : 'var(--border)'}` }}>{rsn.toUpperCase()}</button>
        ))}
      </div>

      {loading ? <div className="loader" /> : shown.length === 0 ? (
        <div style={{ color: 'var(--muted)', fontFamily: MONO, fontSize: 12, padding: 30, textAlign: 'center', border: '1px dashed var(--border)', borderRadius: 8 }}>No stock movements recorded yet.</div>
      ) : (
        shown.map(l => {
          const col = REASON_COLORS[l.reason] || 'var(--muted)'
          return (
            <div key={l.id} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 13px', marginBottom: 5, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: col, minWidth: 55, textAlign: 'right' }}>{l.change_qty > 0 ? '+' : ''}{l.change_qty}</span>
              <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 1, padding: '2px 8px', borderRadius: 12, background: `${col}14`, border: `1px solid ${col}44`, color: col, minWidth: 80, textAlign: 'center' }}>{(l.reason || 'adjustment').toUpperCase()}</span>
              <div style={{ flex: 1, minWidth: 140 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{l.product_name || l.product_id || 'â€”'}</div>
                <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)', marginTop: 2 }}>{l.note || (l.ref_type === 'variant' ? 'variant update' : 'stock movement')} Â· {fmt(l.created_at)}</div>
              </div>
              <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)' }}>by {l.actor || 'system'}</span>
            </div>
          )
        })
      )}
    </div>
  )
}
