'use client'
import React, { useState, useEffect, useCallback } from 'react'
import api from '@/lib/api'
import { useToast } from '../../../components/Toast'
import { useDialog } from '../../../components/Dialog'
import ScanCam from './ScanCam'

const MONO = "var(--font-mono,'JetBrains Mono',monospace)"
const G = '#00FF88', C = '#00D4FF', R = '#ff4757', Y = '#facc15', O = '#ff6b35'
const fmt = iso => iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'â€”'

const OP = { receive: { label: 'RECEIVE', color: G, hint: 'Add stock into a location' }, issue: { label: 'ISSUE', color: O, hint: 'Remove stock from a location' }, transfer: { label: 'TRANSFER', color: C, hint: 'Move stock between locations' }, count: { label: 'CYCLE COUNT', color: Y, hint: 'Set the actual on-hand (audit)' } }

export default function InventoryTab() {
  const toast = useToast()
  const { confirm } = useDialog()
  const [locations, setLocations] = useState([])
  const [stock, setStock] = useState([])
  const [movements, setMovements] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [locFilter, setLocFilter] = useState('')
  const [showLocs, setShowLocs] = useState(false)
  const [locForm, setLocForm] = useState({ name: '', code: '', is_default: false })
  const [busy, setBusy] = useState(null)
  const [picked, setPicked] = useState(null)
  const [op, setOp] = useState('receive')
  const [opQty, setOpQty] = useState('1')
  const [opLoc, setOpLoc] = useState('')
  const [opTo, setOpTo] = useState('')
  const [note, setNote] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    const q = new URLSearchParams()
    if (search.trim()) q.set('search', search.trim())
    if (locFilter) q.set('location_id', locFilter)
    Promise.all([
      api.get('/store/admin/inventory/locations').then(r => setLocations(r.data || [])).catch(() => []),
      api.get(`/store/admin/inventory/stock?${q.toString()}`).then(r => setStock(r.data || [])).catch(() => []),
      api.get('/store/admin/inventory/movements?limit=60').then(r => setMovements(r.data || [])).catch(() => []),
    ]).finally(() => setLoading(false))
  }, [search, locFilter])

  useEffect(() => { load() }, [load])
  useEffect(() => { if (locFilter) setOpLoc(locFilter) }, [locFilter])

  const scan = async code => {
    try {
      const r = await api.get(`/store/admin/inventory/lookup/${encodeURIComponent(code)}`)
      setPicked(r.data)
      setOpLoc(r.data.locations?.[0]?.location_id || locFilter || locations[0]?.id || '')
      toast.success(`${r.data.name} (${r.data.kind})`, { title: 'Scanned' })
    } catch (e) {
      toast.error('No product/variant matches that barcode or SKU', { title: 'Scan' })
    }
  }

  const pickRow = row => {
    setPicked({ kind: row.variant_id ? 'variant' : 'product', id: row.variant_id || row.product_id, name: row.product_name, sku: row.sku, product_id: row.product_id, locations: [] })
    setOpLoc(row.location_id || locFilter || '')
    setOpQty('1')
  }

  const resetPicked = () => { setPicked(null); setOpQty('1') }

  const runOp = async () => {
    if (!picked) return toast.error('Scan or pick an item first')
    const qty = Number(opQty)
    if (!qty || qty <= 0) return toast.error('Enter a positive quantity')
    setBusy(op)
    const pid = picked.product_id
    const vid = picked.kind === 'variant' ? picked.id : null
    try {
      if (op === 'transfer') {
        if (!opLoc || !opTo) return toast.error('Pick source and destination locations')
        const r = await api.post('/store/admin/inventory/transfer', { product_id: pid, variant_id: vid, from_location_id: opLoc, to_location_id: opTo, quantity: qty, note })
        toast.success(`Moved ${r.data?.moved} units`, { title: 'Transfer' })
      } else {
        if (!opLoc) return toast.error('Pick a location')
        const r = await api.post(`/store/admin/inventory/${op}`, { product_id: pid, variant_id: vid, location_id: opLoc, quantity: qty, note })
        toast.success(`${op.toUpperCase()} ${qty} â†’ new on-hand ${r.data?.new_stock ?? r.data?.after}`, { title: 'Inventory' })
      }
      setNote(''); load()
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Operation failed', { title: 'Inventory' })
    } finally { setBusy(null) }
  }

  const saveLoc = async () => {
    if (!locForm.name.trim()) return toast.error('Name is required')
    setBusy('loc')
    try {
      await api.post('/store/admin/inventory/locations', { ...locForm, active: true, sort_order: 0 })
      toast.success('Location created', { title: 'Inventory' })
      setLocForm({ name: '', code: '', is_default: false })
      load()
    } catch (e) { toast.error(e?.response?.data?.detail || 'Failed', { title: 'Inventory' }) }
    finally { setBusy(null) }
  }

  const delLoc = async l => {
    const ok = await confirm({ title: `Delete ${l.name}`, message: 'Delete this location? Its stock quants will be removed.', variant: 'danger', confirmLabel: 'DELETE' })
    if (!ok) return
    try {
      await api.delete(`/store/admin/inventory/locations/${l.id}`)
      toast.success('Location deleted', { title: 'Inventory' })
      load()
    } catch (e) { toast.error(e?.response?.data?.detail || 'Failed', { title: 'Inventory' }) }
  }

  const totalUnits = stock.reduce((a, r) => a + (r.quantity || 0), 0)
  const totalRows = stock.length

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'LOCATIONS', value: locations.length, color: C },
          { label: 'STOCK ROWS', value: totalRows, color: 'var(--text)' },
          { label: 'TOTAL UNITS', value: totalUnits, color: G },
          { label: 'LOW STOCK', value: stock.filter(r => r.quantity <= 5 && r.quantity > 0).length, color: R },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px' }}>
            <div style={{ fontFamily: MONO, fontSize: 8, letterSpacing: 2, color: 'var(--muted)' }}>{s.label}</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: s.color, marginTop: 4 }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px,380px) 1fr', gap: 16, alignItems: 'start', marginBottom: 18 }}>
        {/* Scanner */}
        <div>
          <ScanCam onScan={scan} label="SCAN / LOOKUP ITEM" placeholder="Enter barcode or SKU" />
          {picked && (
            <div style={{ background: 'var(--bg2)', border: `1px solid ${G}44`, borderRadius: 10, padding: 12, marginTop: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 1, padding: '2px 8px', borderRadius: 12, background: `${G}14`, border: `1px solid ${G}44`, color: G }}>{picked.kind.toUpperCase()}</span>
                <button onClick={resetPicked} style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>âœ•</button>
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, marginTop: 6 }}>{picked.name}</div>
              <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)', marginTop: 2 }}>{picked.sku || 'no sku'} Â· in stock {picked.stock} units</div>
            </div>
          )}

          {/* Operation */}
          <div style={{ marginTop: 10 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              {Object.entries(OP).map(([k, v]) => (
                <button key={k} onClick={() => setOp(k)} style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 1, padding: '6px 10px', borderRadius: 6, cursor: 'pointer', background: op === k ? `${v.color}18` : 'transparent', color: op === k ? v.color : 'var(--muted)', border: `1px solid ${op === k ? `${v.color}50` : 'var(--border)'}` }}>{v.label}</button>
              ))}
            </div>
            <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
              <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 1, color: OP[op].color, marginBottom: 10 }}>{OP[op].hint}</div>
              {op !== 'transfer' ? (
                <select value={opLoc} onChange={e => setOpLoc(e.target.value)} style={{ width: '100%', fontFamily: MONO, fontSize: 10, background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, padding: '7px 10px', marginBottom: 8 }}>
                  <option value="">Locationâ€¦</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.name}{l.is_default ? ' (default)' : ''}</option>)}
                </select>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                  <select value={opLoc} onChange={e => setOpLoc(e.target.value)} style={{ fontFamily: MONO, fontSize: 10, background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, padding: '7px 10px' }}>
                    <option value="">Fromâ€¦</option>
                    {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                  <select value={opTo} onChange={e => setOpTo(e.target.value)} style={{ fontFamily: MONO, fontSize: 10, background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, padding: '7px 10px' }}>
                    <option value="">Toâ€¦</option>
                    {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={opQty} onChange={e => setOpQty(e.target.value)} type="number" min="1" placeholder="Qty" style={{ width: 90, fontFamily: MONO, fontSize: 12, background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, padding: '8px 10px' }} />
                <input value={note} onChange={e => setNote(e.target.value)} placeholder="Note (optional)" style={{ flex: 1, fontFamily: MONO, fontSize: 10, background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, padding: '8px 10px' }} />
              </div>
              <button onClick={runOp} disabled={busy} style={{ width: '100%', marginTop: 10, fontFamily: MONO, fontSize: 10, letterSpacing: 1.5, padding: '10px', background: `${OP[op].color}1a`, border: `1px solid ${OP[op].color}55`, color: OP[op].color, borderRadius: 6, cursor: busy ? 'wait' : 'pointer' }}>
                {busy ? 'â€¦' : `${OP[op].label} ${picked ? picked.name : 'ITEM'}`}
              </button>
            </div>
          </div>
        </div>

        {/* Stock by location */}
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter name / sku / barcodeâ€¦" style={{ flex: 1, minWidth: 180, fontFamily: MONO, fontSize: 11, background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, padding: '8px 12px' }} />
            <select value={locFilter} onChange={e => setLocFilter(e.target.value)} style={{ fontFamily: MONO, fontSize: 10, background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, padding: '8px 10px' }}>
              <option value="">All locations</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <button onClick={() => setShowLocs(v => !v)} style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 1, padding: '8px 12px', background: 'color-mix(in srgb, var(--cyan) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--cyan) 40%, transparent)', color: C, borderRadius: 6, cursor: 'pointer' }}>{showLocs ? 'HIDE LOCATIONS' : 'LOCATIONS'}</button>
          </div>

          {showLocs && (
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: 12, marginBottom: 12 }}>
              <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 2, color: C, marginBottom: 8 }}>WAREHOUSE LOCATIONS</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <input value={locForm.name} onChange={e => setLocForm({ ...locForm, name: e.target.value })} placeholder="Name (e.g. Backroom)" style={{ flex: 1, fontFamily: MONO, fontSize: 11, background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, padding: '8px 10px' }} />
                <input value={locForm.code} onChange={e => setLocForm({ ...locForm, code: e.target.value })} placeholder="Code" style={{ width: 90, fontFamily: MONO, fontSize: 11, background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, padding: '8px 10px' }} />
                <button onClick={saveLoc} disabled={busy === 'loc'} style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 1, padding: '8px 14px', background: `${G}14`, border: `1px solid ${G}44`, color: G, borderRadius: 6, cursor: busy === 'loc' ? 'wait' : 'pointer' }}>{busy === 'loc' ? 'â€¦' : '+ ADD'}</button>
              </div>
              {locations.map(l => (
                <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text)' }}>{l.name}</span>
                  {l.code && <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)' }}>{l.code}</span>}
                  {l.is_default && <span style={{ fontFamily: MONO, fontSize: 8, padding: '1px 6px', borderRadius: 10, background: `${G}14`, border: `1px solid ${G}44`, color: G }}>DEFAULT</span>}
                  <div style={{ flex: 1 }} />
                  {!l.is_default && <button onClick={() => delLoc(l)} style={{ fontFamily: MONO, fontSize: 9, color: R, background: 'none', border: 'none', cursor: 'pointer' }}>DEL</button>}
                </div>
              ))}
            </div>
          )}

          {loading ? <div className="loader" /> : stock.length === 0 ? (
            <div style={{ color: 'var(--muted)', fontFamily: MONO, fontSize: 12, padding: 30, textAlign: 'center', border: '1px dashed var(--border)', borderRadius: 8 }}>No stock rows â€” scan a barcode or add stock first.</div>
          ) : (
            stock.map(r => (
              <div key={r.id} onClick={() => pickRow(r)} style={{ cursor: 'pointer', background: 'var(--bg2)', border: `1px solid ${r.quantity <= 5 ? `${R}50` : 'var(--border)'}`, borderRadius: 10, padding: '10px 14px', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 150 }}>
                  <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text)' }}>{r.product_name}</div>
                  <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)', marginTop: 2 }}>{r.sku || 'â€”'}{r.barcode ? ` Â· ${r.barcode}` : ''}</div>
                </div>
                <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)' }}>{r.location_name}</span>
                <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: r.quantity <= 5 ? R : r.quantity === 0 ? 'var(--muted)' : G, minWidth: 40, textAlign: 'right' }}>{r.quantity}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Movements */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: 14 }}>
        <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 2, color: 'var(--muted)', marginBottom: 10 }}>RECENT MOVEMENTS (LEDGER)</div>
        {movements.length === 0 ? <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--muted)' }}>No movements yet.</div> : (
          movements.map(m => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
              <span style={{ fontFamily: MONO, fontSize: 10, color: m.change_qty < 0 ? R : G, fontWeight: 700, minWidth: 54 }}>{m.change_qty > 0 ? '+' : ''}{m.change_qty}</span>
              <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--text)' }}>{m.product_name}</span>
              <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 1, padding: '1px 6px', borderRadius: 10, background: 'color-mix(in srgb, var(--cyan) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--cyan) 30%, transparent)', color: C }}>{m.reason}</span>
              {m.from_location && <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)' }}>{m.from_location} â†’ {m.to_location || 'â€”'}</span>}
              <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)' }}>{fmt(m.created_at)}</span>
              <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)' }}>{m.actor}</span>
              {m.note && <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)', fontStyle: 'italic' }}>{m.note}</span>}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
