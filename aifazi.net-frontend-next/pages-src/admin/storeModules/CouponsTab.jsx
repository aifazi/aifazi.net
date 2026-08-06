'use client'
import React, { useState, useEffect, useCallback } from 'react'
import api from '@/lib/api'
import { useToast } from '../../../components/Toast'
import { useDialog } from '../../../components/Dialog'

const MONO = "var(--font-mono,'JetBrains Mono',monospace)"
const G = '#00FF88', C = '#00D4FF', R = '#ff4757', Y = '#facc15'
const money = c => `$${((c || 0) / 100).toFixed(2)}`
const fmt = iso => iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

const EMPTY = { code: '', description: '', type: 'percent', value_cents: 0, value_percent: 10, min_subtotal_cents: 0, max_uses: 0, per_user_limit: 0, product_ids: [], category_id: null, active: true, starts_at: null, expires_at: null }

export default function CouponsTab() {
  const toast = useToast()
  const { confirm } = useDialog()
  const [coupons, setCoupons] = useState([])
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [pid, setPid] = useState('')
  const [cid, setCid] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      api.get('/store/admin/coupons').then(r => setCoupons(r.data || [])).catch(() => []),
      api.get('/store/admin/products').then(r => setProducts(r.data || [])).catch(() => []),
      api.get('/store/admin/categories').then(r => setCategories(r.data || [])).catch(() => []),
    ]).then(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const startNew = () => { setEditing('new'); setForm(EMPTY) }
  const startEdit = c => {
    setEditing(c.id)
    setForm({ code: c.code, description: c.description || '', type: c.type || 'percent', value_cents: c.value_cents || 0, value_percent: c.value_percent || 0, min_subtotal_cents: c.min_subtotal_cents || 0, max_uses: c.max_uses || 0, per_user_limit: c.per_user_limit || 0, product_ids: c.product_ids || [], category_id: c.category_id || null, active: !!c.active, starts_at: c.starts_at ? c.starts_at.slice(0, 16) : null, expires_at: c.expires_at ? c.expires_at.slice(0, 16) : null })
    setPid(''); setCid('')
  }
  const cancel = () => { setEditing(null) }

  const addProduct = () => {
    if (!pid) return
    if (!form.product_ids.includes(pid)) setForm({ ...form, product_ids: [...form.product_ids, pid] })
    setPid('')
  }
  const addCat = () => {
    if (!cid) return
    setForm({ ...form, category_id: cid })
    setCid('')
  }

  const buildPayload = () => ({
    code: form.code.trim().toUpperCase(),
    description: form.description,
    type: form.type,
    value_cents: form.type === 'fixed' ? Math.max(0, Math.round(Number(form.value_cents) || 0)) : 0,
    value_percent: form.type === 'percent' ? Math.max(0, Math.min(100, Math.round(Number(form.value_percent) || 0))) : 0,
    min_subtotal_cents: Number(form.min_subtotal_cents) || 0,
    max_uses: form.max_uses ? Number(form.max_uses) : 0,
    per_user_limit: form.per_user_limit ? Number(form.per_user_limit) : 0,
    product_ids: form.product_ids,
    category_id: form.category_id,
    active: form.active,
    starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
    expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
  })

  const save = async () => {
    if (!form.code.trim()) return toast.error('Code is required')
    if (form.type === 'percent' && (form.value_percent < 0 || form.value_percent > 100)) return toast.error('Percent must be 0–100')
    setSaving(true)
    try {
      if (editing === 'new') await api.post('/store/admin/coupons', buildPayload())
      else await api.patch(`/store/admin/coupons/${editing}`, buildPayload())
      toast.success(editing === 'new' ? 'Coupon created' : 'Coupon updated', { title: 'Coupons' })
      cancel(); load()
    } catch (err) { toast.error(err?.response?.data?.detail || 'Save failed', { title: 'Coupons' }) }
    finally { setSaving(false) }
  }

  const toggleActive = async c => {
    try {
      await api.patch(`/store/admin/coupons/${c.id}`, { active: !c.active })
      load()
    } catch { toast.error('Toggle failed') }
  }

  const remove = async c => {
    const ok = await confirm({ title: 'Delete Coupon', message: `Delete ${c.code}? Order history keeps its coupon reference.`, variant: 'danger', confirmLabel: 'DELETE' })
    if (!ok) return
    try { await api.delete(`/store/admin/coupons/${c.id}`); toast.success('Coupon deleted', { title: 'Coupons' }); load() }
    catch { toast.error('Delete failed') }
  }

  const input = { background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, padding: '9px 12px', fontFamily: MONO, fontSize: 12, outline: 'none', boxSizing: 'border-box' }

  return (
    <div>
      {editing ? (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 2, color: 'var(--muted)', marginBottom: 12 }}>{editing === 'new' ? 'NEW COUPON' : 'EDIT COUPON'}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 10 }}>
            <div>
              <label style={{ fontFamily: MONO, fontSize: 8, letterSpacing: 2, color: 'var(--muted)' }}>CODE</label>
              <input value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="SAVE20" style={{ ...input, width: '100%' }} />
            </div>
            <div>
              <label style={{ fontFamily: MONO, fontSize: 8, letterSpacing: 2, color: 'var(--muted)' }}>TYPE</label>
              <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} style={{ ...input, width: '100%' }}>
                <option value="percent">Percent %</option>
                <option value="fixed">Fixed $</option>
              </select>
            </div>
            <div>
              <label style={{ fontFamily: MONO, fontSize: 8, letterSpacing: 2, color: 'var(--muted)' }}>{form.type === 'percent' ? 'PERCENT (0–100)' : 'AMOUNT (CENTS)'}</label>
              <input type="number" value={form.type === 'percent' ? form.value_percent : form.value_cents} onChange={e => setForm(form.type === 'percent' ? { ...form, value_percent: Number(e.target.value) } : { ...form, value_cents: Number(e.target.value) })} style={{ ...input, width: '100%' }} />
            </div>
            <div>
              <label style={{ fontFamily: MONO, fontSize: 8, letterSpacing: 2, color: 'var(--muted)' }}>MIN SUBTOTAL (CENTS)</label>
              <input type="number" value={form.min_subtotal_cents} onChange={e => setForm({ ...form, min_subtotal_cents: Number(e.target.value) })} style={{ ...input, width: '100%' }} />
            </div>
            <div>
              <label style={{ fontFamily: MONO, fontSize: 8, letterSpacing: 2, color: 'var(--muted)' }}>MAX USES (0 = ∞)</label>
              <input type="number" value={form.max_uses} onChange={e => setForm({ ...form, max_uses: Number(e.target.value) })} style={{ ...input, width: '100%' }} />
            </div>
            <div>
              <label style={{ fontFamily: MONO, fontSize: 8, letterSpacing: 2, color: 'var(--muted)' }}>PER-USER LIMIT (0 = ∞)</label>
              <input type="number" value={form.per_user_limit} onChange={e => setForm({ ...form, per_user_limit: Number(e.target.value) })} style={{ ...input, width: '100%' }} />
            </div>
            <div>
              <label style={{ fontFamily: MONO, fontSize: 8, letterSpacing: 2, color: 'var(--muted)' }}>STARTS</label>
              <input type="datetime-local" value={form.starts_at || ''} onChange={e => setForm({ ...form, starts_at: e.target.value })} style={{ ...input, width: '100%' }} />
            </div>
            <div>
              <label style={{ fontFamily: MONO, fontSize: 8, letterSpacing: 2, color: 'var(--muted)' }}>EXPIRES</label>
              <input type="datetime-local" value={form.expires_at || ''} onChange={e => setForm({ ...form, expires_at: e.target.value })} style={{ ...input, width: '100%' }} />
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <label style={{ fontFamily: MONO, fontSize: 8, letterSpacing: 2, color: 'var(--muted)' }}>DESCRIPTION</label>
            <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="10% off for launch week" style={{ ...input, width: '100%' }} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
            <select value={pid} onChange={e => setPid(e.target.value)} style={{ ...input }}>
              <option value="">+ restrict to product…</option>
              {products.filter(p => !form.product_ids.includes(p.id)).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <button onClick={addProduct} disabled={!pid} style={{ fontFamily: MONO, fontSize: 10, padding: '8px 12px', background: 'color-mix(in srgb, var(--cyan) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--cyan) 40%, transparent)', color: C, borderRadius: 6, cursor: pid ? 'pointer' : 'not-allowed' }}>+ PRODUCT</button>
            <select value={cid} onChange={e => setCid(e.target.value)} style={{ ...input }}>
              <option value="">+ restrict to category…</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button onClick={addCat} disabled={!cid} style={{ fontFamily: MONO, fontSize: 10, padding: '8px 12px', background: 'rgba(250,204,21,.1)', border: '1px solid rgba(250,204,21,.4)', color: Y, borderRadius: 6, cursor: cid ? 'pointer' : 'not-allowed' }}>+ CATEGORY</button>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            {form.product_ids.map(id => { const p = products.find(x => x.id === id); return (
              <span key={id} style={{ fontFamily: MONO, fontSize: 10, padding: '4px 10px', background: 'color-mix(in srgb, var(--cyan) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--cyan) 30%, transparent)', color: C, borderRadius: 14, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {p?.name || id} <button onClick={() => setForm({ ...form, product_ids: form.product_ids.filter(x => x !== id) })} style={{ background: 'none', border: 'none', color: R, cursor: 'pointer', fontSize: 12 }}>✕</button>
              </span>
            )})}
            {form.category_id && (() => { const c = categories.find(x => x.id === form.category_id); return (
              <span style={{ fontFamily: MONO, fontSize: 10, padding: '4px 10px', background: 'rgba(250,204,21,.08)', border: '1px solid rgba(250,204,21,.3)', color: Y, borderRadius: 14, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                📂 {c?.name || form.category_id} <button onClick={() => setForm({ ...form, category_id: null })} style={{ background: 'none', border: 'none', color: R, cursor: 'pointer', fontSize: 12 }}>✕</button>
              </span>
            ) })()}
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontFamily: MONO, fontSize: 11, color: 'var(--muted)', cursor: 'pointer' }}>
            <input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} /> Active
          </label>

          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button onClick={save} disabled={saving} style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 1, padding: '9px 20px', background: 'color-mix(in srgb, var(--green) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--green) 40%, transparent)', color: G, borderRadius: 6, cursor: saving ? 'not-allowed' : 'pointer' }}>{saving ? '…' : 'SAVE COUPON'}</button>
            <button onClick={cancel} style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 1, padding: '9px 16px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)', borderRadius: 6, cursor: 'pointer' }}>CANCEL</button>
          </div>
        </div>
      ) : (
        <div style={{ marginBottom: 14 }}>
          <button onClick={startNew} style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 1, padding: '9px 18px', background: 'color-mix(in srgb, var(--green) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--green) 40%, transparent)', color: G, borderRadius: 6, cursor: 'pointer' }}>+ NEW COUPON</button>
        </div>
      )}

      {loading ? <div className="loader" /> : coupons.length === 0 ? (
        <div style={{ color: 'var(--muted)', fontFamily: MONO, fontSize: 12, padding: 30, textAlign: 'center', border: '1px dashed var(--border)', borderRadius: 8 }}>No coupons yet. Create one to start discounting.</div>
      ) : (
        coupons.map(c => {
          const active = !!c.active
          const val = c.type === 'percent' ? `${c.value_percent || 0}% OFF` : `${money(c.value_cents)} OFF`
          return (
            <div key={c.id} style={{ background: 'var(--bg2)', border: `1px solid ${active ? 'var(--border)' : 'rgba(255,255,255,.08)'}`, opacity: active ? 1 : 0.55, borderRadius: 10, padding: '12px 14px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, color: C, minWidth: 90 }}>🎟 {c.code}</div>
              <span style={{ fontFamily: MONO, fontSize: 10, padding: '2px 10px', borderRadius: 12, background: c.type === 'percent' ? 'rgba(250,204,21,.08)' : 'color-mix(in srgb, var(--cyan) 8%, transparent)', border: `1px solid ${c.type === 'percent' ? 'rgba(250,204,21,.3)' : 'color-mix(in srgb, var(--cyan) 30%, transparent)'}`, color: c.type === 'percent' ? Y : C }}>{val}</span>
              <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 1, padding: '2px 8px', borderRadius: 12, background: active ? 'color-mix(in srgb, var(--green) 8%, transparent)' : 'rgba(255,71,87,.08)', border: `1px solid ${active ? 'color-mix(in srgb, var(--green) 30%, transparent)' : 'rgba(255,71,87,.3)'}`, color: active ? G : R }}>{active ? 'ACTIVE' : 'PAUSED'}</span>
              {c.min_subtotal_cents > 0 && <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)' }}>min {money(c.min_subtotal_cents)}</span>}
              <div style={{ flex: 1 }} />
              <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)', textAlign: 'right' }}>
                {c.used_count || 0} / {c.max_uses || '∞'} uses
                <div>{c.expires_at ? `exp ${fmt(c.expires_at)}` : 'no expiry'}</div>
              </div>
              <button onClick={() => toggleActive(c)} style={{ fontFamily: MONO, fontSize: 9, padding: '6px 10px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)', borderRadius: 6, cursor: 'pointer' }}>{active ? 'PAUSE' : 'ACTIVATE'}</button>
              <button onClick={() => startEdit(c)} style={{ fontFamily: MONO, fontSize: 9, padding: '6px 10px', background: 'color-mix(in srgb, var(--cyan) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--cyan) 40%, transparent)', color: C, borderRadius: 6, cursor: 'pointer' }}>EDIT</button>
              <button onClick={() => remove(c)} style={{ fontFamily: MONO, fontSize: 9, padding: '6px 10px', background: 'rgba(255,71,87,.1)', border: '1px solid rgba(255,71,87,.4)', color: R, borderRadius: 6, cursor: 'pointer' }}>DEL</button>
            </div>
          )
        })
      )}
    </div>
  )
}
