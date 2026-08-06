'use client'
import React, { useState, useEffect, useCallback } from 'react'
import api from '@/lib/api'
import { useToast } from '../../../components/Toast'
import { useDialog } from '../../../components/Dialog'

const MONO = "var(--font-mono,'JetBrains Mono',monospace)"
const G = '#00FF88', C = '#00D4FF', R = '#ff4757', Y = '#facc15', O = '#ff6b35'
const money = c => `$${((c || 0) / 100).toFixed(2)}`
const fmt = iso => iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'â€”'

const EMPTY = { product_id: '', name: '', subtitle: '', discount_percent: 10, starts_at: null, ends_at: null, active: true }

export default function DealsTab() {
  const toast = useToast()
  const { confirm } = useDialog()
  const [deals, setDeals] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      api.get('/store/admin/deals').then(r => setDeals(r.data || [])).catch(() => []),
      api.get('/store/admin/products').then(r => setProducts(r.data || [])).catch(() => []),
    ]).then(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const startNew = () => { setEditing('new'); setForm({ ...EMPTY, product_id: products[0]?.id || '' }) }
  const startEdit = d => {
    setEditing(d.id)
    setForm({ product_id: d.product_id, name: d.name || '', subtitle: d.subtitle || '', discount_percent: d.discount_percent || 0, starts_at: d.starts_at ? d.starts_at.slice(0, 16) : null, ends_at: d.ends_at ? d.ends_at.slice(0, 16) : null, active: !!d.active })
  }
  const cancel = () => { setEditing(null) }

  const save = async () => {
    if (!form.product_id) return toast.error('Pick a product')
    if (!form.name.trim()) return toast.error('Deal name is required')
    if (form.discount_percent < 0 || form.discount_percent > 100) return toast.error('Discount must be 0â€“100')
    const payload = {
      product_id: form.product_id,
      name: form.name.trim(),
      subtitle: form.subtitle,
      discount_percent: Number(form.discount_percent),
      starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
      ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
      active: form.active,
    }
    setSaving(true)
    try {
      if (editing === 'new') await api.post('/store/admin/deals', payload)
      else await api.patch(`/store/admin/deals/${editing}`, payload)
      toast.success(editing === 'new' ? 'Deal created' : 'Deal updated', { title: 'Flash Deals' })
      cancel(); load()
    } catch (err) { toast.error(err?.response?.data?.detail || 'Save failed', { title: 'Flash Deals' }) }
    finally { setSaving(false) }
  }

  const toggleActive = async d => {
    try { await api.patch(`/store/admin/deals/${d.id}`, { active: !d.active }); load() }
    catch { toast.error('Toggle failed') }
  }

  const remove = async d => {
    const ok = await confirm({ title: 'Delete Deal', message: `Delete "${d.name}"? The product price returns to normal.`, variant: 'danger', confirmLabel: 'DELETE' })
    if (!ok) return
    try { await api.delete(`/store/admin/deals/${d.id}`); toast.success('Deal deleted', { title: 'Flash Deals' }); load() }
    catch { toast.error('Delete failed') }
  }

  const input = { background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, padding: '9px 12px', fontFamily: MONO, fontSize: 12, outline: 'none', boxSizing: 'border-box' }

  const now = Date.now()

  return (
    <div>
      {editing && (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 2, color: 'var(--muted)', marginBottom: 12 }}>{editing === 'new' ? 'NEW FLASH DEAL' : 'EDIT FLASH DEAL'}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 10 }}>
            <div>
              <label style={{ fontFamily: MONO, fontSize: 8, letterSpacing: 2, color: 'var(--muted)' }}>PRODUCT</label>
              <select value={form.product_id} onChange={e => setForm({ ...form, product_id: e.target.value })} style={{ ...input, width: '100%' }}>
                {products.map(p => <option key={p.id} value={p.id}>{p.name} â€” {money(p.price_cents)}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontFamily: MONO, fontSize: 8, letterSpacing: 2, color: 'var(--muted)' }}>DEAL NAME</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Midnight Flash Sale" style={{ ...input, width: '100%' }} />
            </div>
            <div>
              <label style={{ fontFamily: MONO, fontSize: 8, letterSpacing: 2, color: 'var(--muted)' }}>DISCOUNT %</label>
              <input type="number" value={form.discount_percent} onChange={e => setForm({ ...form, discount_percent: Number(e.target.value) })} style={{ ...input, width: '100%' }} />
            </div>
            <div>
              <label style={{ fontFamily: MONO, fontSize: 8, letterSpacing: 2, color: 'var(--muted)' }}>STARTS</label>
              <input type="datetime-local" value={form.starts_at || ''} onChange={e => setForm({ ...form, starts_at: e.target.value })} style={{ ...input, width: '100%' }} />
            </div>
            <div>
              <label style={{ fontFamily: MONO, fontSize: 8, letterSpacing: 2, color: 'var(--muted)' }}>ENDS</label>
              <input type="datetime-local" value={form.ends_at || ''} onChange={e => setForm({ ...form, ends_at: e.target.value })} style={{ ...input, width: '100%' }} />
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <label style={{ fontFamily: MONO, fontSize: 8, letterSpacing: 2, color: 'var(--muted)' }}>SUBTITLE</label>
            <input value={form.subtitle} onChange={e => setForm({ ...form, subtitle: e.target.value })} placeholder="24 hours only â€” ends midnight" style={{ ...input, width: '100%' }} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontFamily: MONO, fontSize: 11, color: 'var(--muted)', cursor: 'pointer' }}>
            <input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} /> Active
          </label>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button onClick={save} disabled={saving} style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 1, padding: '9px 20px', background: 'rgba(255,107,53,.12)', border: '1px solid rgba(255,107,53,.5)', color: O, borderRadius: 6, cursor: saving ? 'not-allowed' : 'pointer' }}>{saving ? 'â€¦' : 'SAVE DEAL'}</button>
            <button onClick={cancel} style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 1, padding: '9px 16px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)', borderRadius: 6, cursor: 'pointer' }}>CANCEL</button>
          </div>
        </div>
      )}

      <div style={{ marginBottom: 14 }}>
        <button onClick={startNew} style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 1, padding: '9px 18px', background: 'rgba(255,107,53,.12)', border: '1px solid rgba(255,107,53,.5)', color: O, borderRadius: 6, cursor: 'pointer' }}>âš¡ + NEW DEAL</button>
      </div>

      {loading ? <div className="loader" /> : deals.length === 0 ? (
        <div style={{ color: 'var(--muted)', fontFamily: MONO, fontSize: 12, padding: 30, textAlign: 'center', border: '1px dashed var(--border)', borderRadius: 8 }}>No flash deals yet. Time-limited discounts show as countdown badges in the store.</div>
      ) : (
        deals.map(d => {
          const active = !!d.active
          const live = active && (!d.starts_at || new Date(d.starts_at) <= new Date()) && (!d.ends_at || new Date(d.ends_at) > new Date())
          const dealPrice = d.product_price_cents ? Math.round(d.product_price_cents * (100 - d.discount_percent) / 100) : null
          return (
            <div key={d.id} style={{ background: 'var(--bg2)', border: `1px solid ${active ? 'var(--border)' : 'rgba(255,255,255,.08)'}`, opacity: active ? 1 : 0.55, borderRadius: 10, padding: '12px 14px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: MONO, fontSize: 16 }}>âš¡</span>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{d.name}</div>
                <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)', marginTop: 2 }}>{d.product_name || d.product_id} Â· {d.discount_percent}% off</div>
                {d.subtitle && <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)' }}>{d.subtitle}</div>}
              </div>
              <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 1, padding: '2px 8px', borderRadius: 12, background: active ? (live ? 'color-mix(in srgb, var(--green) 8%, transparent)' : 'color-mix(in srgb, var(--cyan) 8%, transparent)') : 'rgba(255,71,87,.08)', border: `1px solid ${active ? (live ? 'color-mix(in srgb, var(--green) 30%, transparent)' : 'color-mix(in srgb, var(--cyan) 30%, transparent)') : 'rgba(255,71,87,.3)'}`, color: active ? (live ? G : C) : R }}>{active ? (live ? 'â— LIVE' : 'SCHEDULED') : 'PAUSED'}</span>
              {dealPrice && <span style={{ fontFamily: MONO, fontSize: 12 }}><s style={{ color: 'var(--muted)' }}>{money(d.product_price_cents)}</s> <span style={{ color: O, fontWeight: 700 }}>{money(dealPrice)}</span></span>}
              <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)', textAlign: 'right' }}>
                {d.starts_at ? `from ${fmt(d.starts_at)}` : 'no start'}
                <div>{d.ends_at ? `until ${fmt(d.ends_at)}` : 'no end'}</div>
              </div>
              <button onClick={() => toggleActive(d)} style={{ fontFamily: MONO, fontSize: 9, padding: '6px 10px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)', borderRadius: 6, cursor: 'pointer' }}>{active ? 'PAUSE' : 'ACTIVATE'}</button>
              <button onClick={() => startEdit(d)} style={{ fontFamily: MONO, fontSize: 9, padding: '6px 10px', background: 'color-mix(in srgb, var(--cyan) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--cyan) 40%, transparent)', color: C, borderRadius: 6, cursor: 'pointer' }}>EDIT</button>
              <button onClick={() => remove(d)} style={{ fontFamily: MONO, fontSize: 9, padding: '6px 10px', background: 'rgba(255,71,87,.1)', border: '1px solid rgba(255,71,87,.4)', color: R, borderRadius: 6, cursor: 'pointer' }}>DEL</button>
            </div>
          )
        })
      )}
    </div>
  )
}
