'use client'
import React, { useState, useEffect, useCallback } from 'react'
import api from '@/lib/api'
import { useToast } from '../../../components/Toast'
import { useDialog } from '../../../components/Dialog'

const MONO = "var(--font-mono,'JetBrains Mono',monospace)"
const G = '#00FF88', C = '#00D4FF', R = '#ff4757', Y = '#facc15'
const money = c => `$${((c || 0) / 100).toFixed(2)}`

const EMPTY = { product_id: '', name: '', sku: '', barcode: '', price_cents: '', stock_qty: 0, attributes: '' }

export default function VariantsTab({ focusProductId }) {
  const toast = useToast()
  const { confirm } = useDialog()
  const [products, setProducts] = useState([])
  const [variants, setVariants] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [stockBusy, setStockBusy] = useState(false)
  const [stockQty, setStockQty] = useState('')
  const [fProduct, setFProduct] = useState(focusProductId || '')

  useEffect(() => {
    if (focusProductId) setFProduct(focusProductId)
  }, [focusProductId])

  const load = useCallback(() => {
    setLoading(true)
    const q = fProduct ? `?product_id=${encodeURIComponent(fProduct)}` : ''
    Promise.all([
      api.get('/store/admin/products').then(r => setProducts(r.data || [])).catch(() => []),
      api.get(`/store/admin/variants${q}`).then(r => setVariants(r.data || [])).catch(() => []),
    ]).then(() => setLoading(false))
  }, [fProduct])

  useEffect(() => { load() }, [load])

  const pname = id => products.find(p => p.id === id)?.name || id.slice(0, 8)

  const parseAttrs = s => {
    const out = {}
    s.split(',').map(x => x.trim()).filter(Boolean).forEach(kv => {
      const [k, ...rest] = kv.split(':')
      if (k) out[k.trim()] = rest.join(':').trim()
    })
    return out
  }

  const startNew = () => {
    setEditing('new')
    const first = products[0]
    setForm({ ...EMPTY, product_id: first?.id || '', price_cents: first?.price_cents ?? '' })
  }
  const startEdit = v => {
    setEditing(v.id)
    const attrs = v.attributes || {}
    setForm({ product_id: v.product_id, name: v.name || '', sku: v.sku || '', barcode: v.barcode || '', price_cents: v.price_cents ?? '', stock_qty: v.stock_qty ?? 0, attributes: Object.entries(attrs).map(([k, val]) => `${k}:${val}`).join(', ') })
    setStockQty(v.stock_qty ?? 0)
  }
  const cancel = () => { setEditing(null); setStockQty('') }

  const save = async () => {
    if (!form.product_id) return toast.error('Pick a product')
    if (!form.name.trim()) return toast.error('Variant name is required')
    const payload = {
      product_id: form.product_id,
      name: form.name.trim(),
      sku: form.sku.trim() || '',
      barcode: form.barcode.trim() || '',
      price_cents: Number(form.price_cents) || 0,
      stock_qty: Number(form.stock_qty) || 0,
      track_inventory: true,
      attributes: parseAttrs(form.attributes),
      image_url: '',
      active: true,
      sort_order: 0,
    }
    setSaving(true)
    try {
      if (editing === 'new') await api.post('/store/admin/variants', payload)
      else await api.patch(`/store/admin/variants/${editing}`, payload)
      toast.success(editing === 'new' ? 'Variant created' : 'Variant updated', { title: 'Variants' })
      cancel(); load()
    } catch (err) { toast.error(err?.response?.data?.detail || 'Save failed', { title: 'Variants' }) }
    finally { setSaving(false) }
  }

  const remove = async v => {
    const ok = await confirm({ title: 'Delete Variant', message: `Delete "${v.name}"? This does not delete orders that used it.`, variant: 'danger', confirmLabel: 'DELETE' })
    if (!ok) return
    try { await api.delete(`/store/admin/variants/${v.id}`); toast.success('Variant deleted', { title: 'Variants' }); load() }
    catch (err) { toast.error(err?.response?.data?.detail || 'Delete failed', { title: 'Variants' }) }
  }

  const setStock = async (v, qty) => {
    if (qty === null || qty === '') return
    const n = Math.max(0, Math.floor(Number(qty)))
    setStockBusy(v.id)
    try {
      await api.patch(`/store/admin/variants/${v.id}/stock`, { stock_qty: n })
      toast.success(`${v.name} â†’ ${n} in stock`, { title: 'Stock' })
      load()
    } catch (err) { toast.error(err?.response?.data?.detail || 'Stock update failed', { title: 'Stock' }) }
    finally { setStockBusy(false) }
  }

  const input = { background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, padding: '9px 12px', fontFamily: MONO, fontSize: 12, outline: 'none', boxSizing: 'border-box' }

  return (
    <div>
      {editing && (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 2, color: 'var(--muted)', marginBottom: 12 }}>{editing === 'new' ? 'NEW VARIANT' : 'EDIT VARIANT'}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10 }}>
            <div>
              <label style={{ fontFamily: MONO, fontSize: 8, letterSpacing: 2, color: 'var(--muted)' }}>PRODUCT</label>
              <select value={form.product_id} onChange={e => setForm({ ...form, product_id: e.target.value })} style={{ ...input, width: '100%' }}>
                {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontFamily: MONO, fontSize: 8, letterSpacing: 2, color: 'var(--muted)' }}>VARIANT NAME</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Size M Â· Color Red" style={{ ...input, width: '100%' }} />
            </div>
            <div>
              <label style={{ fontFamily: MONO, fontSize: 8, letterSpacing: 2, color: 'var(--muted)' }}>SKU</label>
              <input value={form.sku} onChange={e => setForm({ ...form, sku: e.target.value })} placeholder="SKU-001" style={{ ...input, width: '100%' }} />
            </div>
            <div>
              <label style={{ fontFamily: MONO, fontSize: 8, letterSpacing: 2, color: 'var(--muted)' }}>BARCODE (scan on phone)</label>
              <input value={form.barcode} onChange={e => setForm({ ...form, barcode: e.target.value })} placeholder="EAN / UPC" style={{ ...input, width: '100%' }} />
            </div>
            <div>
              <label style={{ fontFamily: MONO, fontSize: 8, letterSpacing: 2, color: 'var(--muted)' }}>PRICE (CENTS)</label>
              <input type="number" value={form.price_cents} onChange={e => setForm({ ...form, price_cents: Number(e.target.value) })} style={{ ...input, width: '100%' }} />
            </div>
            <div>
              <label style={{ fontFamily: MONO, fontSize: 8, letterSpacing: 2, color: 'var(--muted)' }}>STOCK</label>
              <input type="number" value={form.stock_qty} onChange={e => setForm({ ...form, stock_qty: Number(e.target.value) })} style={{ ...input, width: '100%' }} />
            </div>
            <div>
              <label style={{ fontFamily: MONO, fontSize: 8, letterSpacing: 2, color: 'var(--muted)' }}>ATTRIBUTES (key:value)</label>
              <input value={form.attributes} onChange={e => setForm({ ...form, attributes: e.target.value })} placeholder="Size:M, Color:Red" style={{ ...input, width: '100%' }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button onClick={save} disabled={saving} style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 1, padding: '9px 20px', background: 'color-mix(in srgb, var(--green) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--green) 40%, transparent)', color: G, borderRadius: 6, cursor: saving ? 'not-allowed' : 'pointer' }}>{saving ? 'â€¦' : 'SAVE VARIANT'}</button>
            <button onClick={cancel} style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 1, padding: '9px 16px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)', borderRadius: 6, cursor: 'pointer' }}>CANCEL</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <button onClick={startNew} style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 1, padding: '9px 18px', background: 'color-mix(in srgb, var(--green) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--green) 40%, transparent)', color: G, borderRadius: 6, cursor: 'pointer' }}>+ NEW VARIANT</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <select value={fProduct} onChange={e => setFProduct(e.target.value)} style={{ ...input, maxWidth: 260 }}>
            <option value="">All products</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--muted)' }}>{variants.length} variant{variants.length !== 1 ? 's' : ''}{fProduct ? ' shown' : ` across ${products.length} products`}</span>
        </div>
      </div>

      {loading ? <div className="loader" /> : variants.length === 0 ? (
        <div style={{ color: 'var(--muted)', fontFamily: MONO, fontSize: 12, padding: 30, textAlign: 'center', border: '1px dashed var(--border)', borderRadius: 8 }}>
          No variants yet. Variants let you sell sizes/colors of one product with separate stock &amp; pricing.
        </div>
      ) : (
        variants.map(v => {
          const stock = v.stock_qty ?? 0
          const low = stock <= 5 && stock > 0
          const out = stock <= 0
          return (
            <div key={v.id} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '11px 14px', marginBottom: 7, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: out ? R : low ? Y : G, boxShadow: `0 0 8px ${out ? R : low ? Y : G}` }} />
              <div style={{ flex: 1, minWidth: 150 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{v.name}</div>
                <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)', marginTop: 2 }}>{pname(v.product_id)} Â· {v.sku || 'no sku'} Â· {money(v.price_cents)}</div>
              </div>
              {Object.entries(v.attributes || {}).map(([k, val]) => (
                <span key={k} style={{ fontFamily: MONO, fontSize: 9, padding: '2px 8px', borderRadius: 12, background: 'color-mix(in srgb, var(--cyan) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--cyan) 30%, transparent)', color: C }}>{k}: {val}</span>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, color: out ? R : low ? Y : 'var(--text)', minWidth: 46, textAlign: 'right' }}>{stock}</span>
                {editing === v.id ? null : (
                  <>
                    <input type="number" value={stockQty} onChange={e => setStockQty(e.target.value)} style={{ ...input, width: 70, padding: '5px 8px' }} />
                    <button onClick={() => setStock(v, stockQty)} disabled={stockBusy === v.id} style={{ fontFamily: MONO, fontSize: 9, padding: '6px 10px', background: 'color-mix(in srgb, var(--green) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--green) 40%, transparent)', color: G, borderRadius: 6, cursor: 'pointer' }}>SET</button>
                  </>
                )}
              </div>
              <button onClick={() => startEdit(v)} style={{ fontFamily: MONO, fontSize: 9, padding: '6px 10px', background: 'color-mix(in srgb, var(--cyan) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--cyan) 40%, transparent)', color: C, borderRadius: 6, cursor: 'pointer' }}>EDIT</button>
              <button onClick={() => remove(v)} style={{ fontFamily: MONO, fontSize: 9, padding: '6px 10px', background: 'rgba(255,71,87,.1)', border: '1px solid rgba(255,71,87,.4)', color: R, borderRadius: 6, cursor: 'pointer' }}>DEL</button>
            </div>
          )
        })
      )}
    </div>
  )
}
