'use client'
import React, { useState, useEffect, useCallback } from 'react'
import api from '@/lib/api'
import { useToast } from '../../../components/Toast'
import { useDialog } from '../../../components/Dialog'

const MONO = "var(--font-mono,'JetBrains Mono',monospace)"
const G = '#00FF88', C = '#00D4FF', R = '#ff4757', Y = '#facc15', O = '#ff6b35'
const fmt = iso => iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'
const STAT_COLORS = { pending: Y, approved: G, rejected: R }

function Stars({ n }) {
  return <span style={{ color: Y, fontSize: 11, letterSpacing: 1 }}>{'★'.repeat(Math.max(0, Math.min(5, n || 0)))}{'☆'.repeat(5 - Math.max(0, Math.min(5, n || 0)))}</span>
}

export default function ReviewsTab() {
  const toast = useToast()
  const { confirm } = useDialog()
  const [reviews, setReviews] = useState([])
  const [testimonials, setTestimonials] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [tab, setTab] = useState('reviews')
  const [testiForm, setTestiForm] = useState({ author_name: '', role: '', content: '', rating: 5, status: 'pending', display_order: 0 })
  const [editingT, setEditingT] = useState(null)
  const [savingT, setSavingT] = useState(false)

  const load = useCallback(() => {
    Promise.all([
      api.get('/store/admin/reviews').then(r => setReviews(r.data || [])).catch(() => []),
      api.get('/store/admin/testimonials').then(r => setTestimonials(r.data || [])).catch(() => []),
    ]).then(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const setStatus = async (r, status) => {
    try {
      await api.patch(`/store/admin/reviews/${r.id}`, { status })
      toast.success(`Review ${status}`, { title: 'Reviews' })
      load()
    } catch { toast.error('Moderation failed') }
  }

  const deleteReview = async r => {
    const ok = await confirm({ title: 'Delete Review', message: `Delete review by ${r.username}?`, variant: 'danger', confirmLabel: 'DELETE' })
    if (!ok) return
    try { await api.delete(`/store/admin/reviews/${r.id}`); toast.success('Review deleted', { title: 'Reviews' }); load() }
    catch { toast.error('Delete failed') }
  }

  const saveTestimonial = async () => {
    if (!testiForm.content.trim()) return toast.error('Content is required')
    setSavingT(true)
    try {
      if (editingT) await api.patch(`/store/admin/testimonials/${editingT}`, testiForm)
      else await api.post('/store/admin/testimonials', testiForm)
      toast.success(editingT ? 'Testimonial updated' : 'Testimonial created', { title: 'Testimonials' })
      setTestiForm({ author_name: '', role: '', content: '', rating: 5, status: 'pending', display_order: 0 })
      setEditingT(null); load()
    } catch (err) { toast.error(err?.response?.data?.detail || 'Save failed', { title: 'Testimonials' }) }
    finally { setSavingT(false) }
  }

  const editTestimonial = t => { setEditingT(t.id); setTestiForm({ author_name: t.author_name || '', role: t.role || '', content: t.content || '', rating: t.rating || 5, status: t.status || 'pending', display_order: t.display_order || 0 }) }

  const deleteTestimonial = async t => {
    const ok = await confirm({ title: 'Delete Testimonial', message: `Delete testimonial from ${t.author_name || '—'}?`, variant: 'danger', confirmLabel: 'DELETE' })
    if (!ok) return
    try { await api.delete(`/store/admin/testimonials/${t.id}`); toast.success('Testimonial deleted', { title: 'Testimonials' }); if (editingT === t.id) setEditingT(null); load() }
    catch { toast.error('Delete failed') }
  }

  const shown = reviews.filter(r => filter === 'all' || r.status === filter)
  const counts = reviews.reduce((a, r) => { a[r.status || 'pending'] = (a[r.status || 'pending'] || 0) + 1; return a }, {})

  const input = { background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, padding: '9px 12px', fontFamily: MONO, fontSize: 12, outline: 'none', boxSizing: 'border-box' }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button onClick={() => setTab('reviews')} style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 1, padding: '8px 16px', borderRadius: 20, cursor: 'pointer', background: tab === 'reviews' ? 'color-mix(in srgb, var(--green) 12%, transparent)' : 'transparent', color: tab === 'reviews' ? G : 'var(--muted)', border: `1px solid ${tab === 'reviews' ? 'color-mix(in srgb, var(--green) 40%, transparent)' : 'var(--border)'}` }}>PRODUCT REVIEWS ({reviews.length})</button>
        <button onClick={() => setTab('testimonials')} style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 1, padding: '8px 16px', borderRadius: 20, cursor: 'pointer', background: tab === 'testimonials' ? 'color-mix(in srgb, var(--cyan) 12%, transparent)' : 'transparent', color: tab === 'testimonials' ? C : 'var(--muted)', border: `1px solid ${tab === 'testimonials' ? 'color-mix(in srgb, var(--cyan) 40%, transparent)' : 'var(--border)'}` }}>TESTIMONIALS ({testimonials.length})</button>
      </div>

      {tab === 'reviews' && (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 2, color: 'var(--muted)' }}>MODERATION QUEUE</div>
            <div style={{ flex: 1 }} />
            {[['all', `ALL (${reviews.length})`], ['pending', `PENDING (${counts.pending || 0})`], ['approved', `APPROVED (${counts.approved || 0})`], ['rejected', `REJECTED (${counts.rejected || 0})`]].map(([v, l]) => (
              <button key={v} onClick={() => setFilter(v)} style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 1, padding: '5px 10px', borderRadius: 20, cursor: 'pointer', background: filter === v ? 'color-mix(in srgb, var(--green) 12%, transparent)' : 'transparent', color: filter === v ? G : 'var(--muted)', border: `1px solid ${filter === v ? 'color-mix(in srgb, var(--green) 40%, transparent)' : 'var(--border)'}` }}>{l}</button>
            ))}
          </div>

          {loading ? <div className="loader" /> : shown.length === 0 ? (
            <div style={{ color: 'var(--muted)', fontFamily: MONO, fontSize: 12, padding: 30, textAlign: 'center', border: '1px dashed var(--border)', borderRadius: 8 }}>No reviews in this filter.</div>
          ) : (
            shown.map(r => {
              const col = STAT_COLORS[r.status] || 'var(--muted)'
              return (
                <div key={r.id} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 1, padding: '2px 8px', borderRadius: 12, background: `${col}14`, border: `1px solid ${col}44`, color: col }}>{r.status.toUpperCase()}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{r.username || '—'}</span>
                    <Stars n={r.rating} />
                    <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)' }}>{r.product_name || r.product_id}</span>
                    <div style={{ flex: 1 }} />
                    <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)' }}>{fmt(r.created_at)}</span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {r.status !== 'approved' && <button onClick={() => setStatus(r, 'approved')} style={{ fontFamily: MONO, fontSize: 9, padding: '5px 10px', background: 'color-mix(in srgb, var(--green) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--green) 40%, transparent)', color: G, borderRadius: 6, cursor: 'pointer' }}>✓ APPROVE</button>}
                      {r.status !== 'rejected' && <button onClick={() => setStatus(r, 'rejected')} style={{ fontFamily: MONO, fontSize: 9, padding: '5px 10px', background: 'rgba(255,71,87,.1)', border: '1px solid rgba(255,71,87,.4)', color: R, borderRadius: 6, cursor: 'pointer' }}>✕ REJECT</button>}
                      <button onClick={() => deleteReview(r)} style={{ fontFamily: MONO, fontSize: 9, padding: '5px 10px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)', borderRadius: 6, cursor: 'pointer' }}>DEL</button>
                    </div>
                  </div>
                  {r.title && <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginTop: 8 }}>{r.title}</div>}
                  {r.body && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4, lineHeight: 1.5 }}>{r.body}</div>}
                </div>
              )
            })
          )}
        </>
      )}

      {tab === 'testimonials' && (
        <>
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
            <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 2, color: 'var(--muted)', marginBottom: 12 }}>{editingT ? 'EDIT TESTIMONIAL' : 'NEW TESTIMONIAL'}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10 }}>
              <div>
                <label style={{ fontFamily: MONO, fontSize: 8, letterSpacing: 2, color: 'var(--muted)' }}>AUTHOR</label>
                <input value={testiForm.author_name} onChange={e => setTestiForm({ ...testiForm, author_name: e.target.value })} placeholder="Jane Doe" style={{ ...input, width: '100%' }} />
              </div>
              <div>
                <label style={{ fontFamily: MONO, fontSize: 8, letterSpacing: 2, color: 'var(--muted)' }}>ROLE</label>
                <input value={testiForm.role} onChange={e => setTestiForm({ ...testiForm, role: e.target.value })} placeholder="Happy customer" style={{ ...input, width: '100%' }} />
              </div>
              <div>
                <label style={{ fontFamily: MONO, fontSize: 8, letterSpacing: 2, color: 'var(--muted)' }}>RATING</label>
                <input type="number" min="1" max="5" value={testiForm.rating} onChange={e => setTestiForm({ ...testiForm, rating: Math.max(1, Math.min(5, Number(e.target.value))) })} style={{ ...input, width: '100%' }} />
              </div>
              <div>
                <label style={{ fontFamily: MONO, fontSize: 8, letterSpacing: 2, color: 'var(--muted)' }}>STATUS</label>
                <select value={testiForm.status} onChange={e => setTestiForm({ ...testiForm, status: e.target.value })} style={{ ...input, width: '100%' }}>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
              <div>
                <label style={{ fontFamily: MONO, fontSize: 8, letterSpacing: 2, color: 'var(--muted)' }}>DISPLAY ORDER</label>
                <input type="number" value={testiForm.display_order} onChange={e => setTestiForm({ ...testiForm, display_order: Number(e.target.value) })} style={{ ...input, width: '100%' }} />
              </div>
            </div>
            <div style={{ marginTop: 10 }}>
              <label style={{ fontFamily: MONO, fontSize: 8, letterSpacing: 2, color: 'var(--muted)' }}>CONTENT</label>
              <textarea value={testiForm.content} onChange={e => setTestiForm({ ...testiForm, content: e.target.value })} placeholder="Amazing quality and lightning-fast delivery…" rows={3} style={{ ...input, width: '100%', resize: 'vertical' }} />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button onClick={saveTestimonial} disabled={savingT} style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 1, padding: '9px 20px', background: 'color-mix(in srgb, var(--cyan) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--cyan) 40%, transparent)', color: C, borderRadius: 6, cursor: savingT ? 'not-allowed' : 'pointer' }}>{savingT ? '…' : editingT ? 'UPDATE' : '+ CREATE'}</button>
              {editingT && <button onClick={() => { setEditingT(null); setTestiForm({ author_name: '', role: '', content: '', rating: 5, status: 'pending', display_order: 0 }) }} style={{ fontFamily: MONO, fontSize: 10, padding: '9px 16px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)', borderRadius: 6, cursor: 'pointer' }}>CANCEL</button>}
            </div>
          </div>

          {testimonials.length === 0 ? (
            <div style={{ color: 'var(--muted)', fontFamily: MONO, fontSize: 12, padding: 30, textAlign: 'center', border: '1px dashed var(--border)', borderRadius: 8 }}>No testimonials yet.</div>
          ) : (
            testimonials.map(t => (
              <div key={t.id} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <Stars n={t.rating} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{t.author_name || '—'}</span>
                  {t.role && <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)' }}>{t.role}</span>}
                  <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 1, padding: '2px 8px', borderRadius: 12, background: `${STAT_COLORS[t.status] || 'var(--muted)'}14`, border: `1px solid ${STAT_COLORS[t.status] || 'var(--muted)'}44`, color: STAT_COLORS[t.status] || 'var(--muted)' }}>{(t.status || 'pending').toUpperCase()}</span>
                  <div style={{ flex: 1 }} />
                  <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)' }}>order {t.display_order || 0}</span>
                  <button onClick={() => editTestimonial(t)} style={{ fontFamily: MONO, fontSize: 9, padding: '5px 10px', background: 'color-mix(in srgb, var(--cyan) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--cyan) 40%, transparent)', color: C, borderRadius: 6, cursor: 'pointer' }}>EDIT</button>
                  <button onClick={() => deleteTestimonial(t)} style={{ fontFamily: MONO, fontSize: 9, padding: '5px 10px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)', borderRadius: 6, cursor: 'pointer' }}>DEL</button>
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6, lineHeight: 1.5, fontStyle: 'italic' }}>&quot;{t.content}&quot;</div>
              </div>
            ))
          )}
        </>
      )}
    </div>
  )
}
