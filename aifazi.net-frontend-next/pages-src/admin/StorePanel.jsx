'use client'
/**
 * StorePanel.jsx — full store management for staff: sales dashboard, products,
 * inventory, categories, orders, invoices, and quotes.
 */
import React, { useState, useEffect, useCallback } from 'react'
import api from '@/lib/api'
import { useToast } from '../../components/Toast'
import { PageHeader } from './shared'

const G   = '#00FF88'
const C   = '#00D4FF'
const R   = '#ff4757'
const Y   = '#facc15'
const O   = '#ff6b35'
const MONO = "var(--font-mono,'JetBrains Mono',monospace)"

const STATUS_COLORS = {
  pending: Y, paid: G, processing: C, shipped: '#a78bfa',
  delivered: G, cancelled: R, refunded: O,
  draft: 'var(--muted)', issued: C, void: R, approved: G, declined: R,
  converted: '#a78bfa', expired: 'var(--muted)',
}

function Badge({ color, children }) {
  return <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, fontFamily: MONO,
    background: `${color}18`, border: `1px solid ${color}40`, color,
    letterSpacing: .5, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{children}</span>
}

function StatusBadge({ status }) {
  return <Badge color={STATUS_COLORS[status] || 'var(--muted)'}>{status}</Badge>
}

function Btn({ onClick, color = G, children, disabled, danger, full, small }) {
  const c = danger ? R : color
  return <button onClick={onClick} disabled={disabled}
    style={{ background: 'transparent', border: `1px solid ${c}60`, color: c,
      padding: small ? '4px 10px' : '7px 14px', borderRadius: 6,
      fontSize: small ? 11 : 12, fontFamily: MONO, cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1, transition: 'all 0.14s', whiteSpace: 'nowrap',
      width: full ? '100%' : undefined }}>{children}</button>
}

function RelTime({ iso }) {
  if (!iso) return <span style={{ color: 'var(--muted)' }}>—</span>
  const diff = Math.floor((Date.now() - new Date(iso)) / 1000)
  const label = diff < 60 ? 'just now'
    : diff < 3600 ? `${Math.floor(diff / 60)}m ago`
    : diff < 86400 ? `${Math.floor(diff / 3600)}h ago`
    : new Date(iso).toLocaleDateString()
  return <span title={new Date(iso).toLocaleString()} style={{ color: 'var(--muted)', fontSize: 11 }}>{label}</span>
}

function money(cents) { return `$${((cents || 0) / 100).toFixed(2)}` }

function input(v, onChange, mono = true) {
  return <input value={v ?? ''} onChange={e => onChange(e.target.value)} style={{
    width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)',
    fontFamily: mono ? MONO : 'var(--font-display)', fontSize: mono ? 13 : 14, padding: '9px 12px',
    outline: 'none', borderRadius: 6, boxSizing: 'border-box',
  }} />
}

function numberInput(v, onChange) {
  return <input type="number" value={v ?? ''} onChange={e => onChange(Number(e.target.value) || 0)} style={{
    width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)',
    fontFamily: MONO, fontSize: 13, padding: '9px 12px', outline: 'none', borderRadius: 6, boxSizing: 'border-box',
  }} />
}

// ── Sales overview tab ─────────────────────────────────────────────────────────
function SalesTab({ data, onRefresh }) {
  const stats = data ? [
    { label: 'REVENUE', value: money(data.revenue_cents), color: G, sub: `${data.paid_orders_count} paid orders` },
    { label: 'REFUNDS', value: money(data.refund_cents), color: R, sub: 'all time' },
    { label: 'NET', value: money(data.net_revenue_cents), color: C, sub: 'after refunds' },
    { label: 'LOW STOCK', value: data.low_stock_count, color: data.low_stock_count > 0 ? O : G, sub: 'products below threshold' },
    { label: 'ORDERS', value: data.orders_count, color: 'var(--text)', sub: 'total placed' },
    { label: 'PENDING QUOTES', value: data.pending_quotes_count, color: Y, sub: 'awaiting reply' },
  ] : []
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        {stats.map(s => (
          <div key={s.label} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ fontFamily: MONO, fontSize: 8, letterSpacing: 3, color: 'var(--muted)', marginBottom: 10 }}>{s.label}</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 800, color: s.color, lineHeight: 1, marginBottom: 6 }}>{s.value}</div>
            <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)' }}>{s.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: 18 }}>
          <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 3, color: 'var(--muted)', marginBottom: 14 }}>TOP PRODUCTS BY UNITS SOLD</div>
          {(data?.top_products || []).length === 0 && <div style={{ color: 'var(--muted)', fontSize: 12 }}>No sales yet.</div>}
          {(data?.top_products || []).map(p => (
            <div key={p.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <span style={{ fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
              <span style={{ fontFamily: MONO, fontSize: 11, color: G }}>{p.units} × {money(p.revenue_cents)}</span>
            </div>
          ))}
        </div>

        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: 18 }}>
          <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 3, color: 'var(--muted)', marginBottom: 14 }}>LOW STOCK ALERTS</div>
          {(data?.low_stock || []).length === 0 && <div style={{ color: 'var(--muted)', fontSize: 12 }}>All stock levels healthy.</div>}
          {(data?.low_stock || []).map(p => (
            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)' }}>{p.sku || p.slug}</div>
              </div>
              <Badge color={O}>{p.stock_qty} left</Badge>
            </div>
          ))}
        </div>
      </div>

      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: 18 }}>
        <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 3, color: 'var(--muted)', marginBottom: 14 }}>RECENT ORDERS</div>
        {(data?.recent_orders || []).map(o => (
          <div key={o.order_number} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', flexWrap: 'wrap' }}>
            <span style={{ fontFamily: MONO, fontSize: 11, color: C }}>{o.order_number}</span>
            <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--muted)', flex: 1, textAlign: 'center' }}><RelTime iso={o.created_at} /></span>
            <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text)' }}>{money(o.total_cents)}</span>
            <StatusBadge status={o.status} />
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Products tab ───────────────────────────────────────────────────────────────
const EMPTY_PRODUCT = {
  slug: '', name: '', category_id: '', sku: '', description: '', price_cents: 0,
  compare_at_cents: null, image_url: '', type: 'digital', stock_qty: 0,
  low_stock_threshold: 5, track_inventory: true, active: true, featured: false, sort_order: 0,
}

function ProductsTab({ categories }) {
  const toast = useToast()
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)      // null = modal closed
  const [modalOpen, setModalOpen] = useState(false) // separate flag so null editing = closed
  const [form, setForm] = useState(EMPTY_PRODUCT)
  const [saving, setSaving] = useState(false)
  const [stockUpdating, setStockUpdating] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    api.get('/store/admin/products').then(r => setProducts(r.data || [])).catch(() => toast.error('Failed to load products'))
      .finally(() => setLoading(false))
  }, [toast])

  useEffect(load, [load])

  const startEdit = (p) => {
    setEditing(p?.id || null)
    setForm(p ? { ...EMPTY_PRODUCT, ...p, category_id: p.category_id || '' } : EMPTY_PRODUCT)
    setModalOpen(true)
  }

  const closeModal = () => { setModalOpen(false); setEditing(null) }

  const save = async () => {
    setSaving(true)
    try {
      const payload = { ...form }
      if (editing) await api.patch(`/store/admin/products/${editing}`, payload)
      else await api.post('/store/admin/products', payload)
      toast.success(editing ? 'Product updated' : 'Product created', { title: 'Saved' })
      closeModal()
      load()
    } catch (e) { toast.error(e.response?.data?.error || 'Failed to save product', { title: 'Error' }) }
    finally { setSaving(false) }
  }

  const remove = async (p) => {
    if (!window.confirm(`Delete ${p.name}?`)) return
    try { await api.delete(`/store/admin/products/${p.id}`); toast.success('Product deleted'); load() }
    catch (e) { toast.error(e.response?.data?.error || 'Delete failed', { title: 'Error' }) }
  }

  const setStock = async (p, delta) => {
    setStockUpdating(p.id)
    try {
      const qty = Math.max(0, (p.stock_qty || 0) + delta)
      await api.patch(`/store/admin/products/${p.id}/stock`, { stock_qty: qty })
      load()
    } catch (e) { toast.error(e.response?.data?.error || 'Stock update failed', { title: 'Error' }) }
    finally { setStockUpdating(null) }
  }

  const inp = (key, val) => setForm(f => ({ ...f, [key]: val }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <Btn onClick={() => startEdit(null)} color={C}>+ NEW PRODUCT</Btn>
        <Btn onClick={load} small>↻ REFRESH</Btn>
      </div>

      {modalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}>
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: 24, width: '100%', maxWidth: 680, maxHeight: '92vh', overflowY: 'auto' }}>
            <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 3, color: G, marginBottom: 18 }}>{editing ? 'EDIT PRODUCT' : 'NEW PRODUCT'}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 2, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 5 }}>Name *</label>
                {input(form.name, v => inp('name', v), false)}
              </div>
              <div>
                <label style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 2, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 5 }}>Slug *</label>
                {input(form.slug, v => inp('slug', v))}
              </div>
              <div>
                <label style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 2, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 5 }}>Category</label>
                <select value={form.category_id || ''} onChange={e => inp('category_id', e.target.value)} style={{ width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--font-display)', fontSize: 14, padding: '9px 12px', outline: 'none', borderRadius: 6, boxSizing: 'border-box' }}>
                  <option value="">— None —</option>
                  {(categories || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 2, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 5 }}>SKU</label>
                {input(form.sku, v => inp('sku', v))}
              </div>
              <div>
                <label style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 2, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 5 }}>Price (cents)</label>
                {numberInput(form.price_cents, v => inp('price_cents', v))}
              </div>
              <div>
                <label style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 2, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 5 }}>Compare-at price (cents)</label>
                <input type="number" value={form.compare_at_cents || ''} onChange={e => inp('compare_at_cents', e.target.value ? Number(e.target.value) : null)} style={{ width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: MONO, fontSize: 13, padding: '9px 12px', outline: 'none', borderRadius: 6, boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 2, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 5 }}>Type</label>
                <select value={form.type} onChange={e => inp('type', e.target.value)} style={{ width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--font-display)', fontSize: 14, padding: '9px 12px', outline: 'none', borderRadius: 6, boxSizing: 'border-box' }}>
                  <option value="physical">Physical</option>
                  <option value="digital">Digital</option>
                  <option value="service">Service</option>
                </select>
              </div>
              <div>
                <label style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 2, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 5 }}>Stock qty</label>
                {numberInput(form.stock_qty, v => inp('stock_qty', v))}
              </div>
              <div>
                <label style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 2, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 5 }}>Low-stock threshold</label>
                {numberInput(form.low_stock_threshold, v => inp('low_stock_threshold', v))}
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <label style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 2, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 5 }}>Description</label>
              <textarea value={form.description} onChange={e => inp('description', e.target.value)} rows={3} style={{ width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--font-display)', fontSize: 14, padding: '9px 12px', outline: 'none', borderRadius: 6, boxSizing: 'border-box', resize: 'vertical' }} />
            </div>
            <div style={{ marginTop: 12 }}>
              <label style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 2, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 5 }}>Image URL</label>
              {input(form.image_url, v => inp('image_url', v), false)}
            </div>
            <div style={{ display: 'flex', gap: 16, margin: '14px 0', flexWrap: 'wrap' }}>
              {[{ k: 'track_inventory', label: 'Track inventory' }, { k: 'active', label: 'Active (visible)' }, { k: 'featured', label: 'Featured' }].map(t => (
                <label key={t.k} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontFamily: MONO, fontSize: 11, color: 'var(--text)' }}>
                  <input type="checkbox" checked={!!form[t.k]} onChange={e => inp(t.k, e.target.checked)} style={{ accentColor: G }} /> {t.label}
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <Btn onClick={closeModal} color="var(--muted)">CANCEL</Btn>
              <Btn onClick={save} disabled={saving || !form.name || !form.slug} color={G}>{saving ? 'SAVING…' : 'SAVE PRODUCT'}</Btn>
            </div>
          </div>
        </div>
      )}

      {loading ? <div className="loader" /> : products.length === 0 ? (
        <div style={{ color: 'var(--muted)', fontFamily: MONO, fontSize: 12, padding: 30, textAlign: 'center', border: '1px dashed var(--border)', borderRadius: 8 }}>No products yet. Create your first one.</div>
      ) : (
        products.map(p => (
          <div key={p.id} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {p.image_url ? <img src={p.image_url} alt="" style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover', border: '1px solid var(--border)' }} /> : <div style={{ width: 44, height: 44, borderRadius: 8, background: 'var(--bg3)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🛒</div>}
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {p.name}
                {p.featured && <Badge color={Y}>★ featured</Badge>}
                {!p.active && <Badge color="var(--muted)">hidden</Badge>}
                {p.low_stock && <Badge color={O}>low stock</Badge>}
              </div>
              <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--muted)', marginTop: 3 }}>
                {p.slug} · {p.type} · {p.category || 'uncategorized'}
              </div>
            </div>
            <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 700, color: p.on_sale ? R : 'var(--text)', textAlign: 'right' }}>
              {money(p.price_cents)}
              {p.compare_at_cents > 0 && <div style={{ fontSize: 10, color: 'var(--muted)', textDecoration: 'line-through' }}>{money(p.compare_at_cents)}</div>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: MONO, fontSize: 12 }}>
              {p.track_inventory ? (
                <>
                  <Btn onClick={() => setStock(p, -1)} disabled={stockUpdating === p.id || p.stock_qty <= 0} small color={R}>−</Btn>
                  <span style={{ color: p.low_stock ? O : G, minWidth: 28, textAlign: 'center' }}>{p.stock_qty}</span>
                  <Btn onClick={() => setStock(p, 1)} disabled={stockUpdating === p.id} small color={G}>+</Btn>
                </>
              ) : <Badge color="var(--muted)">untracked</Badge>}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <Btn onClick={() => startEdit(p)} small color={C}>EDIT</Btn>
              <Btn onClick={() => remove(p)} small danger>DEL</Btn>
            </div>
          </div>
        ))
      )}
    </div>
  )
}

// ── Categories tab ─────────────────────────────────────────────────────────────
const EMPTY_CAT = { slug: '', name: '', icon: '🛒', description: '', scope: 'all', display_order: 0, active: true }

function CategoriesTab() {
  const toast = useToast()
  const [cats, setCats] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_CAT)
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    api.get('/store/admin/categories').then(r => setCats(r.data || [])).catch(() => toast.error('Failed to load categories'))
      .finally(() => setLoading(false))
  }, [toast])

  useEffect(load, [load])

  const save = async () => {
    setSaving(true)
    try {
      const payload = { ...form }
      if (editing) await api.patch(`/store/admin/categories/${editing}`, payload)
      else await api.post('/store/admin/categories', payload)
      toast.success('Category saved', { title: 'Saved' }); setEditing(null); load()
    } catch (e) { toast.error(e.response?.data?.error || 'Save failed', { title: 'Error' }) }
    finally { setSaving(false) }
  }

  const remove = async (c) => {
    if (!window.confirm(`Delete ${c.name}? Products in it will lose their category.`)) return
    try { await api.delete(`/store/admin/categories/${c.id}`); toast.success('Category deleted'); load() }
    catch (e) { toast.error(e.response?.data?.error || 'Delete failed', { title: 'Error' }) }
  }

  const inp = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {cats.map(c => (
          <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8 }}>
            <span style={{ fontSize: 16 }}>{c.icon}</span>
            <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600 }}>{c.name}</span>
            <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)' }}>{c.slug}</span>
            <Btn onClick={() => { setEditing(c.id); setForm({ ...EMPTY_CAT, ...c }) }} small color={C}>EDIT</Btn>
            <Btn onClick={() => remove(c)} small danger>×</Btn>
          </div>
        ))}
      </div>

      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: 18 }}>
        <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 3, color: C, marginBottom: 16 }}>{editing ? 'EDIT CATEGORY' : 'NEW CATEGORY'}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 2, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 5 }}>Name *</label>
            <input value={form.name} onChange={e => inp('name', e.target.value)} style={{ width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--font-display)', fontSize: 14, padding: '9px 12px', outline: 'none', borderRadius: 6, boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 2, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 5 }}>Slug *</label>
            <input value={form.slug} onChange={e => inp('slug', e.target.value)} style={{ width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: MONO, fontSize: 13, padding: '9px 12px', outline: 'none', borderRadius: 6, boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 2, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 5 }}>Icon (emoji)</label>
            <input value={form.icon} onChange={e => inp('icon', e.target.value)} style={{ width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--font-display)', fontSize: 14, padding: '9px 12px', outline: 'none', borderRadius: 6, boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 2, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 5 }}>Display order</label>
            <input type="number" value={form.display_order} onChange={e => inp('display_order', Number(e.target.value) || 0)} style={{ width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: MONO, fontSize: 13, padding: '9px 12px', outline: 'none', borderRadius: 6, boxSizing: 'border-box' }} />
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <label style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 2, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 5 }}>Description</label>
          <input value={form.description} onChange={e => inp('description', e.target.value)} style={{ width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--font-display)', fontSize: 14, padding: '9px 12px', outline: 'none', borderRadius: 6, boxSizing: 'border-box' }} />
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
          {editing && <Btn onClick={() => { setEditing(null); setForm(EMPTY_CAT) }} color="var(--muted)">CANCEL</Btn>}
          <Btn onClick={save} disabled={saving || !form.name || !form.slug} color={G}>{saving ? 'SAVING…' : editing ? 'SAVE CHANGES' : '+ ADD CATEGORY'}</Btn>
        </div>
      </div>
    </div>
  )
}

// ── Orders tab ─────────────────────────────────────────────────────────────────
function OrdersTab() {
  const toast = useToast()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [detail, setDetail] = useState(null)
  const [expanded, setExpanded] = useState({})

  const load = useCallback(() => {
    setLoading(true)
    api.get('/store/admin/orders', { params: filter ? { status: filter } : {} })
      .then(r => setOrders(r.data || [])).catch(() => toast.error('Failed to load orders'))
      .finally(() => setLoading(false))
  }, [filter, toast])

  useEffect(load, [load])

  const setStatus = async (o, status) => {
    try {
      await api.patch(`/store/admin/orders/${o.id}/status`, { status })
      toast.success(`${o.order_number} → ${status}`, { title: 'Order updated' }); load()
    } catch (e) { toast.error(e.response?.data?.error || 'Update failed', { title: 'Error' }) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {['', 'pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'].map(s => (
          <button key={s} onClick={() => setFilter(s)} style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 1, padding: '6px 10px', borderRadius: 20, cursor: 'pointer',
            background: filter === s ? `${STATUS_COLORS[s] || G}20` : 'transparent', color: filter === s ? (STATUS_COLORS[s] || G) : 'var(--muted)',
            border: `1px solid ${filter === s ? (STATUS_COLORS[s] || G) : 'var(--border)'}`, textTransform: 'uppercase' }}>{s || 'all'}</button>
        ))}
      </div>

      {loading ? <div className="loader" /> : orders.length === 0 ? (
        <div style={{ color: 'var(--muted)', fontFamily: MONO, fontSize: 12, padding: 30, textAlign: 'center', border: '1px dashed var(--border)', borderRadius: 8 }}>No orders{filter ? ` with status "${filter}"` : ''}.</div>
      ) : orders.map(o => (
        <div key={o.id} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', flexWrap: 'wrap', cursor: 'pointer' }} onClick={() => setExpanded(e => ({ ...e, [o.id]: !e[o.id] }))}>
            <span style={{ fontFamily: MONO, fontSize: 12, color: C, fontWeight: 700 }}>{o.order_number}</span>
            <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--muted)' }}><RelTime iso={o.created_at} /></span>
            <span style={{ flex: 1 }} />
            <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--muted)' }}>{o.customer_name || o.customer_email || '—'}</span>
            <span style={{ fontFamily: MONO, fontSize: 13, color: 'var(--text)', fontWeight: 700 }}>{money(o.total_cents)}</span>
            <StatusBadge status={o.status} />
            <span style={{ color: 'var(--muted)', fontSize: 12 }}>{expanded[o.id] ? '▲' : '▼'}</span>
          </div>
          {expanded[o.id] && (
            <div style={{ borderTop: '1px solid var(--border)', padding: 14 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                {(o.items || []).map((it, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontFamily: MONO, fontSize: 11 }}>
                    <span style={{ color: 'var(--text)' }}>{it.product_name} × {it.quantity}</span>
                    <span style={{ color: 'var(--muted)' }}>{money(it.line_total_cents)}</span>
                  </div>
                ))}
              </div>
              {o.notes && <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--muted)', marginBottom: 10 }}>Notes: {o.notes}</div>}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {['processing', 'shipped', 'delivered', 'cancelled', 'refunded'].map(s => (
                  <Btn key={s} onClick={() => setStatus(o, s)} small color={STATUS_COLORS[s]} disabled={o.status === s}>{s.toUpperCase()}</Btn>
                ))}
                <Btn onClick={() => setDetail(o)} small color={C}>VIEW</Btn>
              </div>
            </div>
          )}
        </div>
      ))}

      {detail && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }} onClick={() => setDetail(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: 24, width: '100%', maxWidth: 560, maxHeight: '92vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontFamily: MONO, fontSize: 12, letterSpacing: 2, color: G }}>{detail.order_number}</div>
              <StatusBadge status={detail.status} />
            </div>
            <pre style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text)', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 320, overflowY: 'auto' }}>{JSON.stringify(detail, null, 2)}</pre>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
              <Btn onClick={() => setDetail(null)} color="var(--muted)">CLOSE</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Invoices tab ───────────────────────────────────────────────────────────────
function InvoicesTab() {
  const toast = useToast()
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    api.get('/store/admin/invoices').then(r => setInvoices(r.data || [])).catch(() => toast.error('Failed to load invoices'))
      .finally(() => setLoading(false))
  }, [toast])

  useEffect(load, [load])

  const markPaid = async (inv) => {
    try { await api.patch(`/store/admin/invoices/${inv.id}`, { status: 'paid' }); toast.success('Invoice marked paid'); load() }
    catch (e) { toast.error(e.response?.data?.error || 'Update failed', { title: 'Error' }) }
  }

  const remove = async (inv) => {
    if (!window.confirm(`Delete invoice ${inv.invoice_number}?`)) return
    try { await api.delete(`/store/admin/invoices/${inv.id}`); toast.success('Invoice deleted'); load() }
    catch (e) { toast.error(e.response?.data?.error || 'Delete failed', { title: 'Error' }) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {loading ? <div className="loader" /> : invoices.length === 0 ? (
        <div style={{ color: 'var(--muted)', fontFamily: MONO, fontSize: 12, padding: 30, textAlign: 'center', border: '1px dashed var(--border)', borderRadius: 8 }}>No invoices yet. They auto-create when paid orders complete.</div>
      ) : invoices.map(inv => (
        <div key={inv.id} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: MONO, fontSize: 12, color: C, fontWeight: 700 }}>{inv.invoice_number}</span>
          <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--muted)' }}>{inv.customer_name || inv.customer_email || '—'}</span>
          <span style={{ flex: 1 }} />
          <span style={{ fontFamily: MONO, fontSize: 13, color: 'var(--text)' }}>{money(inv.total_cents)}</span>
          <StatusBadge status={inv.status} />
          {inv.status !== 'paid' && <Btn onClick={() => markPaid(inv)} small color={G}>MARK PAID</Btn>}
          <Btn onClick={() => remove(inv)} small danger>DEL</Btn>
        </div>
      ))}
    </div>
  )
}

// ── Quotes tab ─────────────────────────────────────────────────────────────────
function QuotesTab() {
  const toast = useToast()
  const [quotes, setQuotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState({})

  const load = useCallback(() => {
    setLoading(true)
    api.get('/store/admin/quotes').then(r => setQuotes(r.data || [])).catch(() => toast.error('Failed to load quotes'))
      .finally(() => setLoading(false))
  }, [toast])

  useEffect(load, [load])

  const setStatus = async (q, status) => {
    try { await api.patch(`/store/admin/quotes/${q.id}`, { status }); toast.success(`Quote ${status}`); load() }
    catch (e) { toast.error(e.response?.data?.error || 'Update failed', { title: 'Error' }) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {loading ? <div className="loader" /> : quotes.length === 0 ? (
        <div style={{ color: 'var(--muted)', fontFamily: MONO, fontSize: 12, padding: 30, textAlign: 'center', border: '1px dashed var(--border)', borderRadius: 8 }}>No quote requests yet.</div>
      ) : quotes.map(q => (
        <div key={q.id} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', flexWrap: 'wrap', cursor: 'pointer' }} onClick={() => setExpanded(e => ({ ...e, [q.id]: !e[q.id] }))}>
            <span style={{ fontFamily: MONO, fontSize: 12, color: C, fontWeight: 700 }}>{q.quote_number}</span>
            <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--muted)' }}><RelTime iso={q.created_at} /></span>
            <span style={{ flex: 1 }} />
            <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--muted)' }}>{q.customer_name || q.customer_email || '—'}</span>
            <span style={{ fontFamily: MONO, fontSize: 13, color: 'var(--text)' }}>{money(q.total_cents)}</span>
            <StatusBadge status={q.status} />
            <span style={{ color: 'var(--muted)', fontSize: 12 }}>{expanded[q.id] ? '▲' : '▼'}</span>
          </div>
          {expanded[q.id] && (
            <div style={{ borderTop: '1px solid var(--border)', padding: 14 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                {(q.items || []).map((it, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontFamily: MONO, fontSize: 11 }}>
                    <span style={{ color: 'var(--text)' }}>{it.name} × {it.qty}</span>
                    <span style={{ color: 'var(--muted)' }}>{money(it.price_cents * it.qty)}</span>
                  </div>
                ))}
              </div>
              {q.notes && <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--muted)', marginBottom: 10 }}>Notes: {q.notes}</div>}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {['approved', 'converted', 'declined', 'expired'].map(s => (
                  <Btn key={s} onClick={() => setStatus(q, s)} small color={STATUS_COLORS[s]} disabled={q.status === s}>{s.toUpperCase()}</Btn>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Main panel ─────────────────────────────────────────────────────────────────
const TABS = [
  { key: 'sales', label: 'SALES', icon: '📈' },
  { key: 'products', label: 'PRODUCTS', icon: '📦' },
  { key: 'categories', label: 'CATEGORIES', icon: '🗂️' },
  { key: 'orders', label: 'ORDERS', icon: '🧾' },
  { key: 'invoices', label: 'INVOICES', icon: '📄' },
  { key: 'quotes', label: 'QUOTES', icon: '💬' },
]

export default function StorePanel() {
  const toast = useToast()
  const [tab, setTab] = useState('sales')
  const [sales, setSales] = useState(null)
  const [categories, setCategories] = useState([])
  const [salesLoading, setSalesLoading] = useState(true)

  const loadSales = useCallback(() => {
    setSalesLoading(true)
    api.get('/store/admin/sales').then(r => setSales(r.data || null)).catch(() => toast.error('Failed to load sales overview'))
      .finally(() => setSalesLoading(false))
  }, [toast])

  useEffect(() => {
    loadSales()
    api.get('/store/admin/categories').then(r => setCategories(r.data || [])).catch(() => {})
  }, [loadSales])

  return (
    <div>
      <PageHeader
        eyebrow="STORE"
        title="Store Management"
        subtitle="Products, inventory, orders, invoices, and quotes."
        actions={<button onClick={loadSales} style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 1, padding: '7px 14px', background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer', borderRadius: 6 }}>↻ REFRESH</button>}
      />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            fontFamily: MONO, fontSize: 10, letterSpacing: 1.5, padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
            background: tab === t.key ? `${G}14` : 'transparent', color: tab === t.key ? G : 'var(--muted)',
            border: `1px solid ${tab === t.key ? `${G}50` : 'var(--border)'}`, transition: 'all 0.14s',
          }}>{t.icon} {t.label}</button>
        ))}
      </div>

      {tab === 'sales' && (salesLoading ? <div className="loader" /> : <SalesTab data={sales} onRefresh={loadSales} />)}
      {tab === 'products' && <ProductsTab categories={categories} />}
      {tab === 'categories' && <CategoriesTab />}
      {tab === 'orders' && <OrdersTab />}
      {tab === 'invoices' && <InvoicesTab />}
      {tab === 'quotes' && <QuotesTab />}
    </div>
  )
}
