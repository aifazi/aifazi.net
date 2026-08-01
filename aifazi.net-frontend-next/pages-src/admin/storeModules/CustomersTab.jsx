'use client'
import React, { useState, useEffect, useCallback } from 'react'
import api from '@/lib/api'
import { useToast } from '../../../components/Toast'
import { useDialog } from '../../../components/Dialog'

const MONO = "var(--font-mono,'JetBrains Mono',monospace)"
const G = '#00FF88', C = '#00D4FF', R = '#ff4757', Y = '#facc15'
const money = c => `$${((c || 0) / 100).toFixed(2)}`
const fmt = iso => iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

const INP = { background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, padding: '9px 12px', fontFamily: MONO, fontSize: 12, outline: 'none', boxSizing: 'border-box' }

function Stat({ label, value, color = 'var(--muted)' }) {
  return (
    <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', minWidth: 120, flex: 1 }}>
      <div style={{ fontFamily: MONO, fontSize: 8, letterSpacing: 2, color: 'var(--muted)' }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color, marginTop: 4 }}>{value}</div>
    </div>
  )
}

export default function CustomersTab() {
  const toast = useToast()
  const { confirm } = useDialog()
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [openId, setOpenId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [note, setNote] = useState('')
  const [noteBusy, setNoteBusy] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    const q = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : ''
    api.get(`/store/admin/customers${q}`).then(r => setCustomers(r.data || []))
      .catch(() => toast.error('Failed to load customers'))
      .finally(() => setLoading(false))
  }, [search, toast])

  useEffect(() => { load() }, [load])

  const openDetail = async c => {
    setOpenId(c.id)
    try {
      const r = await api.get(`/store/admin/customers/${c.id}`)
      setDetail(r.data || {})
    } catch { setDetail({}) }
  }

  const addNote = async () => {
    if (!openId || !note.trim()) return
    setNoteBusy(true)
    try {
      await api.post(`/store/admin/customers/${openId}/notes`, { body: note.trim() })
      setNote('')
      const r = await api.get(`/store/admin/customers/${openId}`)
      setDetail(r.data || {})
      toast.success('Note added', { title: 'CRM' })
    } catch (err) { toast.error(err?.response?.data?.detail || 'Failed to add note') }
    finally { setNoteBusy(false) }
  }

  const delNote = async (userId, noteId) => {
    const ok = await confirm({ title: 'Delete Note', message: 'Remove this customer note?', variant: 'danger', confirmLabel: 'DELETE' })
    if (!ok) return
    try {
      await api.delete(`/store/admin/customers/${userId}/notes/${noteId}`)
      const r = await api.get(`/store/admin/customers/${userId}`)
      setDetail(r.data || {})
      toast.success('Note removed', { title: 'CRM' })
    } catch { toast.error('Failed to delete note') }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 260px', position: 'relative' }}>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by username or email…"
            style={{ ...INP, width: '100%', paddingLeft: 32 }} />
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, opacity: 0.5 }}>🔍</span>
        </div>
        <button onClick={load} style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 1, padding: '8px 14px', background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer', borderRadius: 6 }}>↻ REFRESH</button>
        <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--muted)' }}>{customers.length} customers</span>
      </div>

      {loading ? <div className="loader" /> : customers.length === 0 ? (
        <div style={{ color: 'var(--muted)', fontFamily: MONO, fontSize: 12, padding: 30, textAlign: 'center', border: '1px dashed var(--border)', borderRadius: 8 }}>No customers found.</div>
      ) : (
        customers.map(c => (
          <div key={c.id} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, marginBottom: 8, overflow: 'hidden' }}>
            <div onClick={() => openId === c.id ? setOpenId(null) : openDetail(c)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, cursor: 'pointer', flexWrap: 'wrap' }}>
              {c.avatar ? <img src={c.avatar} alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--border)' }} />
                : <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--bg3)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontFamily: MONO }}>{(c.username || '?').slice(0, 2).toUpperCase()}</div>}
              <div style={{ flex: 1, minWidth: 140 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {c.username}
                  {c.banned && <span style={{ fontFamily: MONO, fontSize: 8, padding: '1px 6px', borderRadius: 4, background: 'rgba(255,71,87,.1)', border: '1px solid rgba(255,71,87,.3)', color: R }}>BANNED</span>}
                  {c.role && c.role !== 'user' && <span style={{ fontFamily: MONO, fontSize: 8, padding: '1px 6px', borderRadius: 4, background: 'rgba(0,212,255,.1)', border: '1px solid rgba(0,212,255,.3)', color: C }}>{c.role.toUpperCase()}</span>}
                </div>
                <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{c.email || 'no email'} · joined {fmt(c.created_at)}</div>
              </div>
              <Stat label="ORDERS" value={c.orders_count} color="var(--text)" />
              <Stat label="SPENT" value={money(c.spent_cents)} color={G} />
              <span style={{ fontFamily: MONO, fontSize: 16, color: 'var(--muted)' }}>{openId === c.id ? '▾' : '▸'}</span>
            </div>

            {openId === c.id && detail && (
              <div style={{ padding: '0 14px 14px', borderTop: '1px solid var(--border)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, margin: '14px 0' }}>
                  <Stat label="PAID ORDERS" value={detail.customer?.orders_count ?? detail.orders?.length ?? 0} />
                  <Stat label="TOTAL SPEND" value={money(detail.spent_cents)} color={G} />
                  <Stat label="SUBSCRIPTIONS" value={detail.subscriptions?.length ?? 0} color={C} />
                  <Stat label="DOCUMENTS" value={detail.documents?.length ?? 0} color={Y} />
                </div>

                {detail.orders?.length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 2, color: 'var(--muted)', marginBottom: 8 }}>ORDERS ({detail.orders.length})</div>
                    {detail.orders.map(o => (
                      <div key={o.id} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: MONO, fontSize: 11, color: C }}>{o.order_number}</span>
                        <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 1, padding: '2px 8px', borderRadius: 12, background: 'rgba(0,255,136,.08)', border: '1px solid rgba(0,255,136,.3)', color: G }}>{o.status}</span>
                        <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--muted)' }}>{fmt(o.created_at)}</span>
                        {o.coupon_code && <span style={{ fontFamily: MONO, fontSize: 9, color: Y }}>🎟 {o.coupon_code}</span>}
                        <div style={{ flex: 1 }} />
                        <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700 }}>{money(o.total_cents)}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 2, color: 'var(--muted)', marginBottom: 8 }}>NOTES</div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <input value={note} onChange={e => setNote(e.target.value)} placeholder="Add an internal note…" style={{ ...INP, flex: 1 }} />
                    <button onClick={addNote} disabled={noteBusy || !note.trim()} style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 1, padding: '8px 16px', background: noteBusy || !note.trim() ? 'var(--bg3)' : 'rgba(0,255,136,.12)', border: '1px solid rgba(0,255,136,.4)', color: noteBusy || !note.trim() ? 'var(--muted)' : G, borderRadius: 6, cursor: noteBusy ? 'not-allowed' : 'pointer' }}>
                      {noteBusy ? '…' : '+ NOTE'}
                    </button>
                  </div>
                  {detail.notes?.length > 0 ? detail.notes.map(n => (
                    <div key={n.id} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px', marginBottom: 6, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>{n.body}</div>
                        <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)', marginTop: 3 }}>{n.staff_name || 'staff'} · {fmt(n.created_at)}</div>
                      </div>
                      <button onClick={() => delNote(c.id, n.id)} style={{ background: 'none', border: 'none', color: R, cursor: 'pointer', fontSize: 13 }}>✕</button>
                    </div>
                  )) : <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--muted)' }}>No notes yet.</div>}
                </div>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  )
}
