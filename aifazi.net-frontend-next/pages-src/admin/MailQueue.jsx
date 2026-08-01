'use client'
import React, { useState, useEffect, useCallback, useRef } from 'react'
import DOMPurify from 'isomorphic-dompurify'
import api from '@/lib/api'
import { Checkbox } from '../../core/ui.jsx'

// H25 — Sanitize every email HTML body before rendering via dangerouslySetInnerHTML.
// The backend mail renderer interpolates user-controlled fields (ticket subject,
// username, application answers, contact name) into HTML templates via raw string
// replace, so a malicious user can slip <script>/<iframe>/<img onerror> into their
// own data — when the admin Mail Queue renders entry.html, that script executes
// in the admin context and can exfiltrate tokens / cookies via fetch('/admin/...').
const SAFE_HTML = { ALLOWED_TAGS: ['a','b','i','em','strong','p','br','div','span','h1','h2','h3','h4','h5','h6','ul','ol','li','table','tr','td','th','thead','tbody','style','img','hr','blockquote'], ALLOWED_ATTR: ['href','src','alt','title','target','rel','style','colspan','rowspan','color'], ALLOW_DATA_ATTR: false }
const _sanitize = (html) => html ? DOMPurify.sanitize(html, SAFE_HTML) : html

const C = {
  bg:'var(--bg)', bg2:'var(--bg2)', bg3:'var(--bg3)',
  border:'var(--border)', text:'var(--text)', muted:'var(--muted)',
  green:'#4ade80', red:'#f87171', cyan:'#22d3ee',
  yellow:'#fbbf24', orange:'#fb923c', purple:'#a78bfa',
  mono:"'JetBrains Mono','Fira Code',monospace",
  ui:"'Inter','Segoe UI',system-ui,sans-serif",
}

const STATUS_CFG = {
  pending:   { label:'PENDING',   bg:'rgba(251,191,36,0.1)',  border:'rgba(251,191,36,0.35)',  color:'#fbbf24' },
  sending:   { label:'SENDING',   bg:'rgba(34,211,238,0.1)',  border:'rgba(34,211,238,0.35)',  color:'#22d3ee' },
  sent:      { label:'SENT',      bg:'rgba(74,222,128,0.1)',  border:'rgba(74,222,128,0.35)',  color:'#4ade80' },
  delivered: { label:'DELIVERED', bg:'rgba(74,222,128,0.15)', border:'rgba(74,222,128,0.45)',  color:'#22c55e' },
  failed:    { label:'FAILED',    bg:'rgba(248,113,113,0.1)', border:'rgba(248,113,113,0.35)', color:'#f87171' },
  cancelled: { label:'CANCELLED', bg:'rgba(112,112,160,0.1)', border:'rgba(112,112,160,0.3)',  color:'#7070a0' },
  resent:    { label:'RESENT',    bg:'rgba(251,146,60,0.1)',  border:'rgba(251,146,60,0.35)',  color:'#fb923c' },
  retrying:  { label:'RETRYING',  bg:'rgba(251,146,60,0.15)', border:'rgba(251,146,60,0.4)',   color:'#fb923c' },
}

function Badge({ status }) {
  const s = STATUS_CFG[status] || STATUS_CFG.pending
  return (
    <span style={{
      fontFamily:C.mono, fontSize:9, letterSpacing:1.5, padding:'2px 8px',
      background:s.bg, border:`1px solid ${s.border}`, color:s.color,
      borderRadius:4, whiteSpace:'nowrap',
    }}>{s.label}</span>
  )
}

function Btn({ label, color='#22d3ee', onClick, disabled, small }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      fontFamily:C.mono, fontSize:small?9:10, letterSpacing:1.5,
      padding: small ? '4px 10px' : '8px 16px',
      background: disabled ? 'rgba(255,255,255,0.03)' : `${color}18`,
      border:`1px solid ${disabled ? C.border : color+'44'}`,
      color: disabled ? C.muted : color,
      cursor: disabled ? 'not-allowed' : 'pointer', borderRadius:4,
      transition:'all 0.15s', whiteSpace:'nowrap',
    }}>{label}</button>
  )
}

function SkeletonRow() {
  const shimmer = 'linear-gradient(90deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0.02) 100%)'
  return (
    <div style={{ display:'grid', gridTemplateColumns:'36px 1fr 1fr 100px 90px 130px 140px',
      padding:'11px 14px', borderBottom:`1px solid ${C.border}` }}>
      <div style={{ width:16, height:16, borderRadius:3, background:shimmer, backgroundSize:'200% 100%', animation:'shimmer 1.5s infinite' }} />
      {[140, 200, 70, 70, 100, 120].map((w,i) => (
        <div key={i} style={{ width:w, height:11, borderRadius:3, background:shimmer, backgroundSize:'200% 100%', animation:'shimmer 1.5s infinite' }} />
      ))}
    </div>
  )
}

function DetailDrawer({ entry, onClose }) {
  if (!entry) return null
  return (
    <div style={{
      position:'fixed', inset:0, zIndex:9999, display:'flex', alignItems:'flex-end',
      background:'rgba(0,0,0,0.6)',
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        width:'100%', maxWidth:740, margin:'0 auto', maxHeight:'80vh', overflow:'auto',
        background:C.bg2, border:`1px solid ${C.border}`, borderRadius:'12px 12px 0 0',
        padding:'28px 32px 40px',
      }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
          <div style={{ fontFamily:C.mono, fontSize:11, color:C.cyan, letterSpacing:2 }}>EMAIL DETAILS</div>
          <button onClick={onClose} style={{ background:'none', border:'none', color:C.muted, cursor:'pointer', fontSize:18 }}>✕</button>
        </div>
        <div style={{ display:'grid', gap:10 }}>
          {[
            ['To',       entry.to],
            ['Name',     entry.name || '—'],
            ['Subject',  entry.subject],
            ['Type',     entry.type],
            ['Status',   entry.status],
            ['Provider', entry.provider || '—'],
            ['Msg ID',   entry.providerMsgId || '—'],
            ['Sent At',  entry.sentAt ? new Date(entry.sentAt).toLocaleString() : '—'],
            ['Created',  entry.createdAt ? new Date(entry.createdAt).toLocaleString() : '—'],
            ['Attempts', entry.attempts ?? 1],
          ].map(([k,v]) => (
            <div key={k} style={{ display:'flex', gap:12 }}>
              <span style={{ fontFamily:C.mono, fontSize:10, color:C.muted, minWidth:72, letterSpacing:1 }}>{k.toUpperCase()}</span>
              <span style={{ fontFamily:C.mono, fontSize:11, color:C.text }}>{v}</span>
            </div>
          ))}
          {entry.error && (
            <div style={{ marginTop:8, padding:'14px 16px', background:'rgba(248,113,113,0.06)', border:'1px solid rgba(248,113,113,0.25)', borderRadius:6 }}>
              <div style={{ fontFamily:C.mono, fontSize:9, color:C.red, letterSpacing:2, marginBottom:8 }}>ERROR</div>
              <pre style={{ fontFamily:C.mono, fontSize:11, color:'#fca5a5', margin:0, whiteSpace:'pre-wrap', lineHeight:1.7 }}>{entry.error}</pre>
            </div>
          )}
          {entry.html && (
            <div style={{ marginTop:12 }}>
              <div style={{ fontFamily:C.mono, fontSize:9, color:C.muted, letterSpacing:2, marginBottom:8 }}>HTML PREVIEW</div>
              <div style={{ background:'white', borderRadius:6, padding:16, maxHeight:400, overflow:'auto' }}
                dangerouslySetInnerHTML={{ __html: _sanitize(entry.html) }} />
            </div>
          )}
          {entry.text && (
            <div style={{ marginTop:12 }}>
              <div style={{ fontFamily:C.mono, fontSize:9, color:C.muted, letterSpacing:2, marginBottom:8 }}>PLAIN TEXT</div>
              <pre style={{ fontFamily:C.mono, fontSize:11, color:C.text, margin:0, whiteSpace:'pre-wrap', lineHeight:1.6, background:'rgba(0,0,0,0.15)', borderRadius:6, padding:16 }}>{entry.text}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function MailQueue() {
  const [emails, setEmails]       = useState([])
  const [loading, setLoading]     = useState(true)
  const [stats, setStats]         = useState(null)
  const [filter, setFilter]       = useState('all')
  const [search, setSearch]       = useState('')
  const [page, setPage]           = useState(1)
  const [total, setTotal]         = useState(0)
  const [selected, setSelected]   = useState(new Set())
  const [acting, setActing]       = useState(null)
  const [processingStale, setProcessingStale] = useState(false)
  const [drawer, setDrawer]       = useState(null)
  const [expandId, setExpandId]   = useState(null)
  const [msg, setMsg]             = useState(null)
  const [syncing, setSyncing]     = useState(false)
  const pollRef = useRef(null)
  const PER_PAGE = 25

  const flash = (type, text) => { setMsg({ type, text }); setTimeout(() => setMsg(null), 6000) }

  const fetchStats = useCallback(async () => {
    try {
      const res = await api.get('/admin/mail/queue/stats')
      setStats(res.data)
    } catch { /* stats are non-critical */ }
  }, [])

  const fetchQueue = useCallback(async (isSync=false) => {
    if (isSync) setSyncing(true); else setLoading(true)
    try {
      const params = new URLSearchParams({
        page, limit: PER_PAGE,
        ...(filter !== 'all' && { status: filter }),
        ...(search && { search }),
      })
      const res = await api.get(`/admin/mail/queue?${params}`)
      const raw = res.data
      const list = Array.isArray(raw?.emails) ? raw.emails : []
      setEmails(list)
      setTotal(raw?.total ?? 0)
    } catch (e) {
      flash('err', `Failed to load queue: ${e.response?.data?.detail || e.message}`)
    } finally { if (isSync) setSyncing(false); else setLoading(false) }
  }, [page, filter, search])

  const processStale = async () => {
    setProcessingStale(true)
    try {
      const res = await api.post('/admin/mail/queue/process-pending')
      flash('ok', res.data.message || 'Processed')
      fetchQueue()
      fetchStats()
    } catch (e) {
      flash('err', e.response?.data?.detail || 'Failed to process stale items')
    } finally { setProcessingStale(false) }
  }

  useEffect(() => { fetchQueue(); fetchStats() }, [fetchQueue, fetchStats])

  useEffect(() => {
    pollRef.current = setInterval(() => { fetchQueue(true); fetchStats() }, 15000)
    return () => clearInterval(pollRef.current)
  }, [fetchQueue, fetchStats])

  const act = async (action, ids) => {
    const idArr = Array.isArray(ids) ? ids : [ids]
    idArr.forEach(id => setActing(id))
    try {
      await api.post('/admin/mail/queue/action', { action, ids: idArr })
      flash('ok', `${action.toUpperCase()} queued for ${idArr.length} email(s).`)
      fetchQueue()
      fetchStats()
      setSelected(new Set())
    } catch (e) {
      flash('err', e.response?.data?.detail || e.response?.data?.error || `${action} failed.`)
    } finally { setActing(null) }
  }

  const toggleSelect = id => setSelected(p => {
    const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n
  })
  const safeEmails = Array.isArray(emails) ? emails : []
  const toggleAll = () => setSelected(p => p.size === safeEmails.length ? new Set() : new Set(safeEmails.map(e => e.id)))
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE))
  const viableBulk = [...selected].filter(id => {
    const em = emails.find(e => e.id === id)
    return em && (em.status === 'failed' || em.status === 'pending' || em.status === 'sending')
  })

  const FILTERS = ['all','pending','sending','sent','delivered','failed','cancelled','resent','retrying']

  return (
    <div style={{ maxWidth:1100, paddingBottom:60 }}>
      <DetailDrawer entry={drawer} onClose={() => setDrawer(null)} />

      {/* Header */}
      <div style={{ marginBottom:24, display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:8, fontFamily:C.mono, fontSize:9, color:C.cyan, letterSpacing:4, marginBottom:8, textTransform:'uppercase' }}>
            <span style={{ width:14, height:2, background:'linear-gradient(90deg,#22d3ee,transparent)', borderRadius:2 }} />
            ADMIN · MAIL
          </div>
          <h2 style={{ fontFamily:'var(--font-display)', fontSize:26, fontWeight:700, margin:0, color:C.text, letterSpacing:-0.5, lineHeight:1.2 }}>Mail Queue</h2>
          <div style={{ fontFamily:C.ui, fontSize:12, color:C.muted, marginTop:6 }}>
            All outgoing system emails — delivery stats from every provider.
            {syncing && <span style={{ color:C.cyan, marginLeft:8, fontSize:11 }}>⟳ syncing</span>}
          </div>
        </div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
          {selected.size > 0 && viableBulk.length > 0 && (
            <>
              <Btn label={`↺ RESEND (${viableBulk.length})`} color={C.green}  onClick={() => act('resend', viableBulk)} />
              <Btn label={`✕ CANCEL (${viableBulk.length})`} color={C.red}    onClick={() => act('cancel', viableBulk)} />
            </>
          )}
          {selected.size > 0 && selected.size !== viableBulk.length && (
            <span style={{ fontFamily:C.mono, fontSize:9, color:C.muted }}>
              ({selected.size - viableBulk.length} not actionable)
            </span>
          )}
          <Btn label="↻ REFRESH" color={C.cyan} onClick={() => { fetchQueue(); fetchStats() }} />
          <Btn label="⟳ RETRY STALE" color={C.yellow} onClick={processStale} disabled={processingStale} />
        </div>
      </div>

      {/* Flash */}
      {msg && (
        <div style={{ padding:'12px 16px', marginBottom:16, fontFamily:C.mono, fontSize:11,
          background: msg.type==='ok' ? 'rgba(74,222,128,0.08)' : 'rgba(248,113,113,0.08)',
          border:`1px solid ${msg.type==='ok' ? 'rgba(74,222,128,0.3)' : 'rgba(248,113,113,0.3)'}`,
          color: msg.type==='ok' ? C.green : C.red, borderRadius:4,
        }}>{msg.text}</div>
      )}

      {/* Stats dashboard */}
      {stats && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(100px, 1fr))', gap:8, marginBottom:20 }}>
          {[
            { label:'DELIVERED', value:stats.delivered, color:C.green },
            { label:'SENT',      value:stats.sent,      color:C.cyan },
            { label:'PENDING',   value:stats.pending,   color:C.yellow },
            { label:'SENDING',   value:stats.sending,   color:'#22d3ee' },
            { label:'FAILED',    value:stats.failed,    color:C.red },
            { label:'RETRYING',  value:stats.retrying || 0, color:C.orange },
            { label:'CANCELLED', value:stats.cancelled, color:'#7070a0' },
            { label:'TOTAL',     value:stats.total,     color:C.text },
            { label:'TODAY',     value:stats.today,     color:C.purple },
          ].map(({ label, value, color }) => (
            <div key={label} style={{
              padding:'10px 14px', background:C.bg2, border:`1px solid ${C.border}`,
              borderRadius:8, display:'flex', flexDirection:'column', gap:4,
            }}>
              <span style={{ fontFamily:C.mono, fontSize:8, letterSpacing:2, color:C.muted }}>{label}</span>
              <span style={{ fontFamily:C.mono, fontSize:20, fontWeight:700, color }}>{value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap', alignItems:'center' }}>
        <div style={{ display:'flex', gap:2, background:C.bg2, border:`1px solid ${C.border}`, borderRadius:6, padding:3 }}>
          {FILTERS.map(f => (
            <button key={f} onClick={() => { setFilter(f); setPage(1) }} style={{
              fontFamily:C.mono, fontSize:9, letterSpacing:1.5, padding:'6px 12px',
              background: filter===f ? '#22d3ee22' : 'transparent',
              color: filter===f ? C.cyan : C.muted, border:'none', cursor:'pointer', borderRadius:4,
              transition:'all 0.15s', textTransform:'uppercase',
            }}>{f}</button>
          ))}
        </div>
        <div style={{ position:'relative', flex:1, minWidth:200 }}>
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="Search recipient, subject, type…"
            style={{ width:'100%', boxSizing:'border-box', padding:'8px 32px 8px 12px',
              fontFamily:C.mono, fontSize:11, background:C.bg2, border:`1px solid ${C.border}`,
              color:C.text, borderRadius:4, outline:'none' }} />
          {search && <button onClick={() => setSearch('')} style={{
            position:'absolute', right:8, top:'50%', transform:'translateY(-50%)',
            background:'none', border:'none', color:C.muted, cursor:'pointer', fontSize:14
          }}>✕</button>}
        </div>
      </div>

      {/* Table */}
      <div style={{ border:`1px solid ${C.border}`, borderRadius:8, overflow:'hidden' }}>
        <div style={{ display:'grid', gridTemplateColumns:'36px 1fr 1fr 100px 90px 130px 140px',
          padding:'10px 14px', background:C.bg2, borderBottom:`1px solid ${C.border}` }}>
          <Checkbox checked={selected.size === safeEmails.length && safeEmails.length > 0}
            onChange={toggleAll} style={{ width:24, height:24, padding:0, justifyContent:'center' }} />
          {['RECIPIENT','SUBJECT','TYPE','STATUS','SENT AT','ACTIONS'].map(h => (
            <div key={h} style={{ fontFamily:C.mono, fontSize:8, letterSpacing:2, color:C.muted }}>{h}</div>
          ))}
        </div>

        {loading ? (
          <div>{Array.from({length:6}, (_,i) => <SkeletonRow key={i} />)}</div>
        ) : safeEmails.length === 0 ? (
          <div style={{ padding:'48px 0', textAlign:'center', fontFamily:C.mono, fontSize:10, color:C.muted, letterSpacing:3 }}>
            NO EMAILS MATCH YOUR FILTER
          </div>
        ) : safeEmails.map((em, i) => {
          const isSel = selected.has(em.id)
          const isActing = acting === em.id
          const isExpanded = expandId === em.id
          return (
            <React.Fragment key={em.id}>
              <div style={{
                display:'grid', gridTemplateColumns:'36px 1fr 1fr 100px 90px 130px 140px',
                padding:'11px 14px', alignItems:'center',
                background: isSel ? 'rgba(34,211,238,0.04)' : i%2===0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                borderBottom:`1px solid ${C.border}`,
                borderLeft:`2px solid ${isSel ? C.cyan : 'transparent'}`,
                transition:'all 0.1s', cursor:'pointer',
              }} onClick={() => setExpandId(isExpanded ? null : em.id)}>
                <Checkbox checked={isSel} onChange={() => toggleSelect(em.id)}
                  style={{ width:24, height:24, padding:0, justifyContent:'center' }}
                  onClick={e => e.stopPropagation()} />
                <div style={{ overflow:'hidden' }}>
                  <div style={{ fontFamily:C.mono, fontSize:11, color:C.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{em.to}</div>
                  {em.name && <div style={{ fontFamily:C.mono, fontSize:9, color:C.muted }}>{em.name}</div>}
                </div>
                <div style={{ fontFamily:C.ui, fontSize:11, color:C.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', paddingRight:8 }}>{em.subject}</div>
                <div style={{ fontFamily:C.mono, fontSize:9, color:C.purple, letterSpacing:1 }}>{em.type?.toUpperCase()}</div>
                <Badge status={em.status} />
                <div style={{ fontFamily:C.mono, fontSize:9, color:C.muted }}>
                  {em.sentAt ? new Date(em.sentAt).toLocaleString('en-GB',{dateStyle:'short',timeStyle:'short'}) : '—'}
                </div>
                <div style={{ display:'flex', gap:4, flexWrap:'wrap' }} onClick={e => e.stopPropagation()}>
                  {['failed','pending','resent'].includes(em.status) && (
                    <Btn label="↺ RETRY"  color={C.green}  small onClick={() => act('resend',  em.id)} disabled={isActing} />
                  )}
                  {['failed','pending','sending'].includes(em.status) && (
                    <Btn label="✕"        color={C.red}    small onClick={() => act('cancel', em.id)} disabled={isActing} />
                  )}
                  {em.status === 'delivered' && (
                    <Btn label="↺ RESEND" color={C.muted}  small onClick={() => act('resend',  em.id)} disabled={isActing} />
                  )}
                  <Btn label="⊞ DETAIL" color={C.cyan} small onClick={() => setDrawer(em)} />
                </div>
              </div>
              {isExpanded && (
                <div style={{ padding:'14px 14px 14px 50px', background:'rgba(0,0,0,0.1)', borderBottom:`1px solid ${C.border}` }}>
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:6 }}>
                    <span style={{ fontFamily:C.mono, fontSize:9, color:C.muted }}>PROVIDER:</span>
                    <span style={{ fontFamily:C.mono, fontSize:9, color:C.text }}>{em.provider || '—'}</span>
                    <span style={{ fontFamily:C.mono, fontSize:9, color:C.muted, marginLeft:12 }}>MSG ID:</span>
                    <span style={{ fontFamily:C.mono, fontSize:9, color:C.text }}>{em.providerMsgId || '—'}</span>
                    <span style={{ fontFamily:C.mono, fontSize:9, color:C.muted, marginLeft:12 }}>ATTEMPTS:</span>
                    <span style={{ fontFamily:C.mono, fontSize:9, color:C.text }}>{em.attempts ?? 1}</span>
                    <span style={{ fontFamily:C.mono, fontSize:9, color:C.muted, marginLeft:12 }}>CREATED:</span>
                    <span style={{ fontFamily:C.mono, fontSize:9, color:C.text }}>{em.createdAt ? new Date(em.createdAt).toLocaleString() : '—'}</span>
                  </div>
                  {em.error && (
                    <div style={{ padding:'8px 10px', background:'rgba(248,113,113,0.06)', border:'1px solid rgba(248,113,113,0.2)', borderRadius:4 }}>
                      <pre style={{ fontFamily:C.mono, fontSize:10, color:'#fca5a5', margin:0, whiteSpace:'pre-wrap', lineHeight:1.5 }}>{em.error}</pre>
                    </div>
                  )}
                  {em.html && (
                    <details style={{ marginTop:8 }}>
                      <summary style={{ fontFamily:C.mono, fontSize:9, color:C.cyan, cursor:'pointer', letterSpacing:1 }}>HTML PREVIEW</summary>
                      <div style={{ marginTop:8, background:'white', borderRadius:6, padding:12, maxHeight:300, overflow:'auto' }}
                        dangerouslySetInnerHTML={{ __html: _sanitize(em.html) }} />
                    </details>
                  )}
                </div>
              )}
            </React.Fragment>
          )
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display:'flex', justifyContent:'center', gap:6, marginTop:16, flexWrap:'wrap' }}>
          <Btn label="← PREV" color={C.muted} small onClick={() => setPage(p => Math.max(1,p-1))} disabled={page===1} />
          {Array.from({length:Math.min(totalPages,20)}, (_,i) => i+1).map(p => (
            <button key={p} onClick={() => setPage(p)} style={{
              fontFamily:C.mono, fontSize:10, padding:'5px 10px',
              background: p===page ? C.cyan : 'transparent',
              color: p===page ? '#000' : C.muted,
              border:`1px solid ${p===page ? C.cyan : C.border}`,
              cursor:'pointer', borderRadius:4,
            }}>{p}</button>
          ))}
          <Btn label="NEXT →" color={C.muted} small onClick={() => setPage(p => Math.min(totalPages,p+1))} disabled={page===totalPages} />
        </div>
      )}
    </div>
  )
}
