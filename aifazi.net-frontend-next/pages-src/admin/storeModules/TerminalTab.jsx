'use client'
import React, { useState, useEffect, useCallback } from 'react'
import api from '@/lib/api'
import { useToast } from '../../../components/Toast'
import { useDialog } from '../../../components/Dialog'
import { usePausableInterval } from '../../../hooks/usePausableInterval'
import ScanCam from './ScanCam'

const MONO = "var(--font-mono,'JetBrains Mono',monospace)"
const G = '#00FF88', C = '#00D4FF', R = '#ff4757', Y = '#facc15', O = '#ff6b35'
const money = c => `$${((c || 0) / 100).toFixed(2)}`
const fmt = iso => iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'
const RISK = { normal: { c: G }, elevated: { c: O }, highest: { c: R }, low: { c: C } }

export default function TerminalTab() {
  const toast = useToast()
  const { confirm } = useDialog()
  const [payments, setPayments] = useState([])
  const [summary, setSummary] = useState(null)
  const [readers, setReaders] = useState([])
  const [locations, setLocations] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [lines, setLines] = useState([])
  const [order, setOrder] = useState(null)
  const [paying, setPaying] = useState(false)
  const [piInfo, setPiInfo] = useState(null)
  const [connToken, setConnToken] = useState(null)
  const [custName, setCustName] = useState('')
  const [loc, setLoc] = useState('')
  const [terminalErr, setTerminalErr] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    let terr = ''
    Promise.all([
      api.get('/store/admin/terminal/payments?limit=60').then(r => setPayments(r.data || [])).catch(() => []),
      api.get('/store/admin/terminal/summary').then(r => setSummary(r.data || null)).catch(() => null),
      api.get('/store/admin/terminal/readers').then(r => setReaders(r.data || [])).catch(e => {
        const d = e?.response?.data?.detail || ''
        if (e?.response?.status === 400 && d) terr = d
      }),
      api.get('/store/admin/terminal/locations').then(r => setLocations(r.data || [])).catch(e => {
        const d = e?.response?.data?.detail || ''
        if (e?.response?.status === 400 && d && !terr) terr = d
      }),
      api.get('/store/admin/products?limit=200').then(r => setProducts(r.data || [])).catch(() => []),
    ]).finally(() => { setTerminalErr(terr); setLoading(false) })
  }, [])

  useEffect(() => { load() }, [load])

  const scan = async code => {
    try {
      const r = await api.get(`/store/admin/inventory/lookup/${encodeURIComponent(code)}`)
      const it = r.data
      if (!it || !it.price_cents) return toast.error('Item has no sellable price', { title: 'POS' })
      setLines(prev => {
        const ex = prev.find(x => x.kind === it.kind && x.id === it.id)
        if (ex) return prev.map(x => x.id === ex.id ? { ...x, qty: x.qty + 1 } : x)
        return [...prev, { kind: it.kind, id: it.id, product_id: it.product_id, name: it.name, price_cents: it.price_cents, qty: 1 }]
      })
      toast.success(`+ ${it.name}`, { title: 'POS' })
    } catch (e) {
      toast.error('No product/variant matches that barcode', { title: 'POS' })
    }
  }

  const pickProduct = e => {
    const pid = e.target.value
    if (!pid) return
    const p = products.find(x => x.id === pid)
    setLines(prev => {
      const ex = prev.find(x => x.kind === 'product' && x.id === pid)
      if (ex) return prev.map(x => x.id === ex.id ? { ...x, qty: x.qty + 1 } : x)
      return [...prev, { kind: 'product', id: pid, product_id: pid, name: p.name, price_cents: p.price_cents, qty: 1 }]
    })
    e.target.value = ''
  }

  const subtotal = lines.reduce((a, l) => a + l.price_cents * l.qty, 0)

  const clear = () => { setLines([]); setOrder(null); setPiInfo(null) }

  const createOrder = async () => {
    if (!lines.length) return toast.error('Add at least one item', { title: 'POS' })
    setPaying(true)
    setOrder(null)
    try {
      const r = await api.post('/store/admin/terminal/orders', {
        items: lines.map(l => ({ product_id: l.product_id, variant_id: l.kind === 'variant' ? l.id : null, quantity: l.qty })),
        customer_name: custName, location_id: loc || null, notes: '',
      })
      const o = r.data
      setOrder(o)
      let pi = null
      try {
        const pres = await api.post('/store/admin/terminal/payment-intents', { order_id: o.order_id, capture_method: 'manual' })
        pi = pres.data
        setPiInfo(pi)
      } catch (err) {
        // Intent could not be created (e.g. Terminal not enabled) — void the
        // draft order so nothing lingers, and surface the real Stripe reason.
        await api.post(`/store/admin/terminal/void/${o.order_id}`).catch(() => {})
        setOrder(null)
        toast.error(err?.response?.data?.detail || 'Could not create a payment for this sale', { title: 'Terminal' })
        return
      }
      let tok = ''
      try {
        const tres = await api.post('/store/admin/terminal/connection-token')
        tok = tres.data?.secret || ''
      } catch (err) {
        toast.warning?.('Paid reader pairing may be limited — contact your Stripe admin.', { title: 'Terminal' })
      }
      setConnToken(tok)
      toast.success(`Ready to tap — ${money(o.total_cents)}`, { title: 'Terminal' })
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Could not create POS sale', { title: 'POS' })
    } finally { setPaying(false) }
  }

  const capture = async () => {
    if (!order) return
    const ok = await confirm({ title: 'Capture payment', message: `Charge ${money(order.total_cents)} on the NFC terminal? The card has been presented.`, variant: 'primary', confirmLabel: 'CAPTURE' })
    if (!ok) return
    setPaying(true)
    try {
      const r = await api.post(`/store/admin/terminal/capture/${order.order_id}`)
      toast.success(`Captured ${money(order.total_cents)}${r.data?.radar ? ` · Radar: ${r.data.radar}` : ''}`, { title: 'Terminal' })
      setPiInfo(null); setConnToken(null)
      clear(); load()
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Capture failed', { title: 'Terminal' })
    } finally { setPaying(false) }
  }

  const pollStatus = useCallback(async () => {
    if (!order || !piInfo?.payment_intent_id) return
    try {
      const r = await api.get(`/store/admin/terminal/payment-intents/${order.order_id}`)
      const status = r.data?.status
      if (status === 'succeeded' || status === 'requires_capture') {
        setPiInfo(prev => prev ? { ...prev, status } : prev)
        toast.success(status === 'succeeded' ? 'NFC card presented — ready to capture' : 'Payment authorized', { title: 'Terminal' })
      }
    } catch (e) {
      if (e?.response?.status !== 404) toast.error('Could not check terminal status', { title: 'Terminal' })
    }
  }, [order, piInfo, toast])

  usePausableInterval(pollStatus, (order && piInfo?.payment_intent_id) ? 2500 : null)

  const voidOrder = async () => {
    if (!order) return
    const ok = await confirm({ title: 'Void order', message: 'Cancel this POS order? Payment (if any) will be released.', variant: 'danger', confirmLabel: 'VOID' })
    if (!ok) return
    try {
      await api.post(`/store/admin/terminal/void/${order.order_id}`)
      toast.success('Order voided', { title: 'POS' })
      clear(); load()
    } catch (e) { toast.error('Void failed', { title: 'POS' }) }
  }

  const totalSales = summary?.total_sales_cents || 0
  const riskBadge = level => {
    const cfg = RISK[level] || { c: 'var(--muted)' }
    return <span style={{ fontFamily: MONO, fontSize: 8, letterSpacing: 1, padding: '2px 8px', borderRadius: 10, background: `${cfg.c}14`, border: `1px solid ${cfg.c}44`, color: cfg.c }}>{level?.toUpperCase() || 'UNKNOWN'}</span>
  }

  return (
    <div>
      {terminalErr && (
        <div style={{ background: 'rgba(255,71,87,.07)', border: '1px solid rgba(255,71,87,.4)', borderRadius: 10, padding: '12px 16px', marginBottom: 16, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 18 }}>⚠️</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 1, color: R, marginBottom: 4 }}>STRIPE TERMINAL NOT READY</div>
            <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--text)', lineHeight: 1.6 }}>{terminalErr}</div>
          </div>
          <button onClick={load} style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 1, padding: '6px 10px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)', borderRadius: 6, cursor: 'pointer' }}>↻ RETRY</button>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'IN-PERSON SALES', value: money(totalSales), color: G },
          { label: 'TRANSACTIONS', value: summary?.sale_count || 0, color: 'var(--text)' },
          { label: 'RADAR FLAGGED', value: summary?.flagged_count || 0, color: R },
          { label: 'PAIRED READERS', value: readers.length, color: C },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px' }}>
            <div style={{ fontFamily: MONO, fontSize: 8, letterSpacing: 2, color: 'var(--muted)' }}>{s.label}</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: s.color, marginTop: 4 }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px,420px) 1fr', gap: 16, alignItems: 'start', marginBottom: 18 }}>
        {/* New NFC sale */}
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: 14 }}>
          <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 2, color: C, marginBottom: 10 }}>NEW IN-PERSON SALE (NFC TAP)</div>

          <ScanCam onScan={scan} label="SCAN ITEMS" placeholder="Scan a barcode to add" />

          <div style={{ display: 'flex', gap: 8, margin: 10, marginTop: 12 }}>
            <select onChange={pickProduct} style={{ flex: 1, fontFamily: MONO, fontSize: 10, background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, padding: '8px 10px' }}>
              <option value="">Add from catalog…</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name} · {money(p.price_cents)}</option>)}
            </select>
            <input value={custName} onChange={e => setCustName(e.target.value)} placeholder="Customer (optional)" style={{ width: 140, fontFamily: MONO, fontSize: 10, background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, padding: '8px 10px' }} />
          </div>

          {lines.length === 0 ? (
            <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--muted)', padding: '20px 0', textAlign: 'center', border: '1px dashed var(--border)', borderRadius: 8 }}>No items — scan or add.</div>
          ) : (
            lines.map(l => (
              <div key={`${l.kind}-${l.id}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ flex: 1, minWidth: 120 }}>
                  <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text)' }}>{l.name}</div>
                  <div style={{ fontFamily: MONO, fontSize: 8, letterSpacing: 1, color: 'var(--muted)' }}>{l.kind.toUpperCase()}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <button onClick={() => setLines(lines.map(x => x.id === l.id ? { ...x, qty: Math.max(1, x.qty - 1) } : x))} style={{ fontFamily: MONO, fontSize: 11, color: 'var(--muted)', background: 'none', border: '1px solid var(--border)', borderRadius: 4, width: 24, cursor: 'pointer' }}>−</button>
                  <span style={{ fontFamily: MONO, fontSize: 11, minWidth: 24, textAlign: 'center' }}>{l.qty}</span>
                  <button onClick={() => setLines(lines.map(x => x.id === l.id ? { ...x, qty: x.qty + 1 } : x))} style={{ fontFamily: MONO, fontSize: 11, color: 'var(--muted)', background: 'none', border: '1px solid var(--border)', borderRadius: 4, width: 24, cursor: 'pointer' }}>+</button>
                </div>
                <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, minWidth: 70, textAlign: 'right' }}>{money(l.price_cents * l.qty)}</span>
                <button onClick={() => setLines(lines.filter(x => x.id !== l.id))} style={{ fontFamily: MONO, fontSize: 11, color: R, background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
              </div>
            ))
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <div>
              <div style={{ fontFamily: MONO, fontSize: 8, letterSpacing: 2, color: 'var(--muted)' }}>TOTAL</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 700, color: G }}>{money(subtotal)}</div>
            </div>
            <button onClick={createOrder} disabled={paying || !lines.length} style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 1.5, padding: '12px 22px', background: `${G}16`, border: `1px solid ${G}55`, color: G, borderRadius: 8, cursor: paying || !lines.length ? 'not-allowed' : 'pointer', opacity: lines.length ? 1 : 0.4 }}>
              {paying ? '…' : 'BEGIN NFC TAP'}
            </button>
          </div>
        </div>

        {/* Active order / terminal */}
        <div>
          {order ? (
            <div style={{ background: 'var(--bg2)', border: `1px solid ${piInfo?.status === 'succeeded' ? G : C}55`, borderRadius: 10, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 2, color: 'var(--muted)' }}>ACTIVE ORDER</div>
                  <div style={{ fontFamily: MONO, fontSize: 14, color: C, marginTop: 2 }}>{order.order_number} · {money(order.total_cents)}</div>
                </div>
                <button onClick={voidOrder} style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 1, padding: '6px 12px', background: 'rgba(255,71,87,.1)', border: '1px solid rgba(255,71,87,.4)', color: R, borderRadius: 6, cursor: 'pointer' }}>VOID</button>
              </div>

              <div style={{ marginTop: 14, border: '1px dashed var(--border)', borderRadius: 10, padding: 20, textAlign: 'center' }}>
                {piInfo?.status === 'succeeded' ? (
                  <>
                    <div style={{ fontSize: 34 }}>💳</div>
                    <div style={{ fontFamily: MONO, fontSize: 12, color: G, marginTop: 8 }}>NFC CARD PRESENTED — READY TO CAPTURE</div>
                    <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)', marginTop: 4 }}>{piInfo.payment_intent_id}</div>
                    <button onClick={capture} disabled={paying} style={{ marginTop: 14, fontFamily: MONO, fontSize: 11, letterSpacing: 1.5, padding: '12px 30px', background: `${G}16`, border: `1px solid ${G}55`, color: G, borderRadius: 8, cursor: paying ? 'wait' : 'pointer' }}>{paying ? 'CAPTURING…' : 'CAPTURE PAYMENT'}</button>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 34 }}>📲</div>
                    <div style={{ fontFamily: MONO, fontSize: 12, color: C, marginTop: 8 }}>WAITING FOR NFC TAP</div>
                    <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--muted)', marginTop: 6, wordBreak: 'break-all' }}>
                      {connToken ? `connection token: ${connToken.slice(0, 40)}…` : 'requesting terminal…'}
                    </div>
                    <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)', marginTop: 4 }}>Open the Stripe Reader app on the phone and present the card.</div>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 220, border: '1px dashed var(--border)', borderRadius: 10, fontFamily: MONO, fontSize: 11, color: 'var(--muted)', textAlign: 'center', padding: 20 }}>
              <div>
                <div style={{ fontSize: 30, marginBottom: 8 }}>📡</div>
                Phone acts as the NFC terminal via Stripe Terminal.<br />
                Scan items → <span style={{ color: G }}>Begin NFC tap</span> → present card → capture.
              </div>
            </div>
          )}

          {readers.length > 0 && (
            <div style={{ marginTop: 12, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
              <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 2, color: 'var(--muted)', marginBottom: 8 }}>PAIRED READERS</div>
              {readers.map(r => (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontFamily: MONO, fontSize: 10 }}>{r.label || r.id}</span>
                  <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 1, padding: '1px 6px', borderRadius: 10, background: `${G}14`, border: `1px solid ${G}44`, color: G }}>{r.status?.toUpperCase()}</span>
                  <div style={{ flex: 1 }} />
                  <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)' }}>{r.device_type || r.serial_number || ''}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* POS history with Radar */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
          <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 2, color: 'var(--muted)' }}>IN-PERSON TRANSACTIONS · STRIPE RADAR</span>
        </div>
        {loading ? <div className="loader" /> : payments.length === 0 ? (
          <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--muted)' }}>No card-present transactions yet.</div>
        ) : (
          payments.map(t => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
              <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text)' }}>{fmt(t.created_at)}</span>
              <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--muted)' }}>{t.order_id?.slice(0, 8)}</span>
              {riskBadge(t.risk_level)}
              <div style={{ flex: 1 }} />
              <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: G }}>{money(t.amount_cents)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
