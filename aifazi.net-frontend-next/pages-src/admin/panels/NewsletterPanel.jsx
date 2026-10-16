'use client'
import { useState, useEffect, useCallback } from 'react'
import api from '@/lib/api'
import { useToast } from '../../../components/Toast'
import { useDialog } from '../../../components/Dialog'
import { Input, TextArea } from '../../../core/ui.jsx'
import { Pagination } from '../ui'

// Split out of AdminPanels.jsx - newsletter subscribers.
function NewsletterPanel() {
  const [subs, setSubs]               = useState([])
  const [subsTotal, setSubsTotal]     = useState(0)
  const [subsPage, setSubsPage]       = useState(1)
  const [loading, setLoading]         = useState(true)
  const [search, setSearch]           = useState('')
  const [broadcastOpen, setBroadcast] = useState(false)
  const [bSubject, setBSubject]       = useState('')
  const [bBody, setBBody]             = useState('')
  const [bSending, setBSending]       = useState(false)
  const [bPreview, setBPreview]       = useState(false)
  const toast    = useToast()
  const { confirm } = useDialog()

  const loadSubs = useCallback((page = 1) => {
    api.get(`/newsletter/subscribers?page=${page}&page_size=50`)
      .then(r => { const d = r.data; const items = Array.isArray(d) ? d : (d?.items || []); setSubs(items); setSubsTotal(Array.isArray(d) ? items.length : (d?.total ?? items.length)); setSubsPage(page) })
      .catch(() => setSubs([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { loadSubs() }, [loadSubs])

  const handleDelete = async email => {
    const ok = await confirm({ title: 'Remove Subscriber', message: `Remove ${email} from the newsletter?`, variant: 'danger', confirmLabel: 'REMOVE' })
    if (!ok) return
    try { await api.delete(`/newsletter/unsubscribe`, { data: { email } }); setSubs(s => s.filter(x => x.email !== email)); toast.success('Removed') } catch { toast.error('Failed') }
  }

  const handleBroadcast = async () => {
    if (!bSubject.trim() || !bBody.trim()) return
    const activeSubs = subs.filter(s => (s.status || 'active') === 'active')
    const ok = await confirm({ title: `Send to ${activeSubs.length} subscribers`, message: `This will send "${bSubject}" to all ${activeSubs.length} active subscribers. This cannot be undone.`, confirmLabel: 'SEND NOW' })
    if (!ok) return
    setBSending(true)
    try {
      // Backend route is POST /newsletter/send and expects { subject, html, text }
      await api.post('/newsletter/send', { subject: bSubject, html: bBody, text: bBody })
      toast.success(`Broadcast sent to ${activeSubs.length} subscribers`, { title: '📬 Broadcast' })
      setBroadcast(false); setBSubject(''); setBBody('')
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to send', { title: 'Error' }) }
    finally { setBSending(false) }
  }

  const exportCSV = () => {
    const rows = [['Email', 'Status', 'Subscribed'].join(','), ...subs.map(s => [s.email, s.status || 'active', s.createdAt?.slice(0,10) || ''].join(','))].join('\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([rows], { type: 'text/csv' })); a.download = 'newsletter-subscribers.csv'; a.click()
  }

  const filtered = subs.filter(s => !search || s.email?.toLowerCase().includes(search.toLowerCase()))
  const activeSubs = subs.filter(s => (s.status || 'active') === 'active')

  const T = {
    card: { background: 'var(--bg2)', border: '1px solid var(--border)', padding: '18px 20px', marginBottom: 16 },
    inp: { background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: 12, padding: '8px 12px', outline: 'none' },
  }

  return (
    <div>
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--cyan)', letterSpacing: 4, marginBottom: 6 }}>COMMUNITY</div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 700, margin: 0 }}>Newsletter</h2>
          <p style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: 11, marginTop: 6 }}>{subs.length} total · {activeSubs.length} active</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setBroadcast(true)} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1, padding: '8px 16px', background: 'color-mix(in srgb, var(--cyan) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--cyan) 30%, transparent)', color: 'var(--cyan)', cursor: 'pointer' }}>📢 BROADCAST</button>
          <button onClick={exportCSV} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1, padding: '8px 16px', background: 'color-mix(in srgb, var(--green) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--green) 30%, transparent)', color: 'var(--green)', cursor: 'pointer' }}>⬇️ EXPORT CSV</button>
        </div>
      </div>

      {/* Broadcast Modal */}
      {broadcastOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={e => e.target === e.currentTarget && setBroadcast(false)}>
          <div style={{ background: 'var(--bg)', border: '1px solid color-mix(in srgb, var(--cyan) 25%, transparent)', width: '100%', maxWidth: 620, boxShadow: '0 0 60px color-mix(in srgb, var(--cyan) 8%, transparent)', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ padding: '16px 20px', background: 'var(--bg2)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 3, color: 'var(--cyan)', marginBottom: 4 }}>NEWSLETTER BROADCAST</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text)' }}>Sending to <span style={{ color: 'var(--green)' }}>{activeSubs.length} active subscribers</span></div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button onClick={() => setBPreview(p => !p)}
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1, padding: '5px 12px', cursor: 'pointer', background: bPreview ? 'color-mix(in srgb, var(--cyan) 10%, transparent)' : 'var(--bg3)', border: `1px solid ${bPreview ? 'color-mix(in srgb, var(--cyan) 40%, transparent)' : 'var(--border)'}`, color: bPreview ? 'var(--cyan)' : 'var(--muted)', borderRadius: 4 }}>
                  {bPreview ? '✏️ EDIT' : '👁 PREVIEW'}
                </button>
                <button onClick={() => setBroadcast(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>✕</button>
              </div>
            </div>
            {/* Body */}
            <div style={{ padding: 20, flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {!bPreview ? (
                <>
                  <div>
                    <label style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>SUBJECT *</label>
                    <Input value={bSubject} onChange={v => setBSubject(v)} placeholder="Monthly Update — April 2026"
                      style={{ ...T.inp, width: '100%', boxSizing: 'border-box', padding: '10px 12px' }} />
                  </div>
                  <div>
                    <label style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>BODY *</label>
                    <TextArea value={bBody} onChange={v => setBBody(v)} rows={12} placeholder={'Hi there,\n\nHere is this month\'s update from aifazi.net...\n\nBest regards,\nTanvir'}
                      style={{ ...T.inp, width: '100%', boxSizing: 'border-box', resize: 'vertical', lineHeight: 1.7, padding: '10px 12px' }} />
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                      {bBody.trim().split(/\s+/).filter(Boolean).length} words · Plain text, line breaks preserved
                    </div>
                  </div>
                </>
              ) : (
                <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', padding: 24, fontFamily: 'var(--font-mono)', lineHeight: 1.8 }}>
                  <div style={{ fontSize: 11, letterSpacing: 3, color: 'var(--muted)', marginBottom: 8 }}>EMAIL PREVIEW</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
                    {bSubject || <span style={{ color: 'var(--muted)', fontStyle: 'italic' }}>(no subject)</span>}
                  </div>
                  <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13, color: 'var(--text)', margin: 0, fontFamily: 'var(--font-mono)' }}>{bBody || <span style={{ color: 'var(--muted)', fontStyle: 'italic' }}>(no body)</span>}</pre>
                  <div style={{ marginTop: 20, paddingTop: 12, borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--muted)' }}>— Sent from aifazi.net</div>
                </div>
              )}
            </div>
            {/* Footer */}
            <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10, flexShrink: 0 }}>
              <button onClick={() => setBroadcast(false)} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, padding: '9px 18px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer' }}>CANCEL</button>
              <button onClick={handleBroadcast} disabled={bSending || !bSubject.trim() || !bBody.trim()}
                style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, fontWeight: 700, padding: '9px 22px',
                  background: bSending ? 'var(--bg3)' : 'color-mix(in srgb, var(--cyan) 12%, transparent)', border: `1px solid ${bSending ? 'var(--border)' : 'color-mix(in srgb, var(--cyan) 40%, transparent)'}`,
                  color: bSending ? 'var(--muted)' : 'var(--cyan)', cursor: bSending ? 'not-allowed' : 'pointer',
                  opacity: (!bSubject.trim() || !bBody.trim()) ? 0.4 : 1 }}>
                {bSending ? 'SENDING…' : `📢 SEND TO ${activeSubs.length}`}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={T.card}>
        <Input value={search} onChange={v => setSearch(v)} placeholder="Search by email" style={{ ...T.inp, width: '100%', boxSizing: 'border-box', marginBottom: 16 }} />
        {loading ? <div className="loader" /> : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
            {search ? 'No results for that search.' : 'No subscribers yet.'}
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 6 }}>
            {filtered.map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--bg3)', border: '1px solid var(--border)' }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'color-mix(in srgb, var(--green) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--green) 30%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, flexShrink: 0 }}>
                  {s.email?.[0]?.toUpperCase() || '?'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.email}</div>
                  {s.createdAt && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>Joined {new Date(s.createdAt).toLocaleDateString()}</div>}
                </div>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, padding: '3px 8px', background: 'color-mix(in srgb, var(--green) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--green) 20%, transparent)', color: 'var(--green)', flexShrink: 0 }}>{(s.status || 'ACTIVE').toUpperCase()}</span>
                <a href={`mailto:${s.email}`} title={`Email ${s.email}`} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, padding: '4px 8px', background: 'transparent', border: '1px solid color-mix(in srgb, var(--cyan) 30%, transparent)', color: 'var(--cyan)', textDecoration: 'none', flexShrink: 0 }}>✉️</a>
                <button onClick={() => handleDelete(s.email)} aria-label={`Delete ${s.email}`} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, padding: '4px 8px', background: 'transparent', border: '1px solid rgba(255,71,87,0.3)', color: '#ff4757', cursor: 'pointer', flexShrink: 0 }}>🗑️</button>
              </div>
            ))}
          </div>
        )}
        <Pagination page={subsPage} total={subsTotal} pageSize={50}
          label={`${subsTotal} subscribers`} onChange={p => loadSubs(p)} />
      </div>
    </div>
  )
}

export { NewsletterPanel }
