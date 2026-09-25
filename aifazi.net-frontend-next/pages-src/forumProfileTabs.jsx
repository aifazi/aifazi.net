'use client'
// forumProfileTabs.jsx — profile tabs & tickets (extracted).
import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Link, useNavigate } from '@/lib/router-compat'
import api, { ensureAdminGate } from '@/lib/api'
import { builtinAvatarEmoji, avatarUrl, UserAvatar, BUILTIN_AVATARS } from '@/lib/avatar'
import { Select, useDialog } from '../core/ui.jsx'
import { useToast } from '../components/Toast'
import { useNow } from '../hooks/useNow'
import FiveMStatus from '@/components/FiveMStatus'
import { getSupabase } from '@/lib/supabase'
import {
  M, D, CLRS, Badge, SectionCard, Inp, Btn, StatusMsg, ago, Avatar,
  STATUS_CFG, PRIORITY_CFG,
} from './forumProfileParts'

function TicketCard({ t, onClick }) {
  const sc = STATUS_CFG[t.status]   || STATUS_CFG.open
  const pc = PRIORITY_CFG[t.priority] || PRIORITY_CFG.medium
  const tid = t.ticket_id || t.ticketId || (t.id || '').slice(-6).toUpperCase()
  return (
    <div className="forum-ticket-card" onClick={onClick} style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden',
      marginBottom: 8, cursor: 'pointer', transition: 'border-color 0.15s',
      borderLeft: `3px solid ${sc.color}` }} role="button" tabIndex={0} onKeyDown={(e)=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); e.currentTarget.click() } }}>
      <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: pc.color,
          boxShadow: `0 0 5px ${pc.color}`, flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text)', minWidth: 120 }}>{t.subject}</span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
          <Badge label={sc.label} color={sc.color} />
          <Badge label={pc.label} color={pc.color} />
          <span style={{ ...M, fontSize: 11, color: 'var(--muted)' }}>{ago(t.created_at)}</span>
          <span style={{ ...M, fontSize: 11, color: 'var(--cyan)', marginLeft: 4 }}>VIEW →</span>
        </div>
      </div>
    </div>
  )
}

/* ─── Ticket Detail View (inline, with message thread + reply) ────────────── */
function TicketDetailView({ ticketId, user, onBack }) {
  const notify = useToast()
  const notifyRef = useRef(notify)
  const [ticket, setTicket] = useState(null)
  const [loading, setLoading] = useState(true)
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => { notifyRef.current = notify }, [notify])

  const loadTicket = useCallback((silent = false) => {
    if (!silent) setLoading(true)
    return api.get(`/helpdesk/tickets/${ticketId}`)
      .then(r => setTicket(r.data))
      .catch(() => {
        if (!silent) notifyRef.current.error('Failed to load ticket')
      })
      .finally(() => {
        if (!silent) setLoading(false)
      })
  }, [ticketId])

  useEffect(() => { void (async () => { await loadTicket(false) })() }, [loadTicket])

  useEffect(() => {
    const refresh = () => { if (!document.hidden) loadTicket(true) } // P2 — pause while tab hidden
    const interval = setInterval(refresh, 10_000)
    const sb = getSupabase()
    // Realtime on helpdesk rows is denied to anon by RLS — only subscribe for an
    // authenticated user (defense in depth + fewer sockets).
    if (!sb || !ticketId || !user) return () => clearInterval(interval)

    const channel = sb.channel(`profile-helpdesk:${ticketId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'helpdesk_messages', filter: `ticket_id=eq.${ticketId}` },
        refresh
      )
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'helpdesk_tickets', filter: `id=eq.${ticketId}` },
        refresh
      )
      .subscribe()

    return () => {
      clearInterval(interval)
      sb.removeChannel(channel)
    }
  }, [ticketId, loadTicket])

  const sendReply = async () => {
    if (!reply.trim()) return
    const text = reply.trim()
    const authorName = user?.username || ticket?.name || 'User'
    const tempId = `local-${Date.now()}`
    setTicket(prev => prev ? ({
      ...prev,
      message_count: (prev.message_count || prev.messages?.length || 0) + 1,
      messages: [
        ...(prev.messages || []),
        {
          id: tempId,
          author_type: 'user',
          author_name: authorName,
          message: text,
          created_at: new Date().toISOString(),
        },
      ],
    }) : prev)
    setSending(true)
    try {
      await api.post(`/helpdesk/tickets/${ticketId}/messages`, {
        message: text,
        author_type: 'user',
        author_name: authorName,
      })
      setReply(prev => prev === text ? '' : prev)
      loadTicket(true)
    } catch (err) {
      setReply(text)
      setTicket(prev => prev ? ({
        ...prev,
        message_count: Math.max(0, (prev.message_count || prev.messages?.length || 1) - 1),
        messages: (prev.messages || []).filter(msg => msg.id !== tempId),
      }) : prev)
      notify.error(err.response?.data?.error || 'Failed to send reply')
    } finally { setSending(false) }
  }

  if (loading) return (
    <div style={{ ...M, fontSize: 11, color: 'var(--muted)', letterSpacing: 3, padding: 40, textAlign: 'center' }}>
      LOADING TICKET…
    </div>
  )
  if (!ticket) return (
    <div style={{ ...M, fontSize: 11, color: CLRS.orange, padding: 40, textAlign: 'center' }}>Ticket not found</div>
  )

  const sc = STATUS_CFG[ticket.status] || STATUS_CFG.open
  const pc = PRIORITY_CFG[ticket.priority] || PRIORITY_CFG.medium
  const messages = ticket.messages || []
  const canReply = ticket.status !== 'resolved' && ticket.status !== 'closed'

  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ height: 2, background: `linear-gradient(90deg, ${CLRS.cyan}, ${CLRS.green})` }} />
      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ ...M, fontSize: 11, letterSpacing: 3, color: CLRS.cyan, marginBottom: 4 }}>TICKET DETAIL</div>
          <div style={{ ...M, fontSize: 13, fontWeight: 700, color: CLRS.green }}>#{ticket.ticket_id || (ticket.id || '').slice(-6).toUpperCase()}</div>
          <h3 style={{ fontSize: 15, fontWeight: 600, margin: '4px 0 0' }}>{ticket.subject}</h3>
        </div>
        <button onClick={onBack} style={{ ...M, fontSize: 11, letterSpacing: 1,
          background: 'none', border: '1px solid var(--border)', color: 'var(--muted)',
          cursor: 'pointer', borderRadius: 6, padding: '7px 14px' }}>
          ← BACK
        </button>
      </div>
      {/* Meta */}
      <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)',
        display: 'flex', gap: 16, flexWrap: 'wrap', ...M, fontSize: 11, color: 'var(--muted)' }}>
        <span>Category: <span style={{ color: 'var(--text)' }}>{ticket.category}</span></span>
        <span>Submitted: <span style={{ color: 'var(--text)' }}>{ticket.created_at ? new Date(ticket.created_at).toLocaleString() : ''}</span></span>
        <span>Messages: <span style={{ color: 'var(--text)' }}>{ticket.message_count || messages.length}</span></span>
        <span><Badge label={sc.label} color={sc.color} /></span>
        <span><Badge label={pc.label} color={pc.color} /></span>
      </div>
      {/* Description */}
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.015)' }}>
        <div style={{ ...M, fontSize: 11, letterSpacing: 2, color: 'var(--muted)', marginBottom: 8 }}>DESCRIPTION</div>
        <p style={{ ...M, fontSize: 11, color: 'var(--muted)', lineHeight: 1.8, margin: 0, whiteSpace: 'pre-wrap' }}>{ticket.description}</p>
      </div>
      {/* Message Thread */}
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ ...M, fontSize: 11, letterSpacing: 2, color: 'var(--muted)', marginBottom: 12 }}>DISCUSSION</div>
        {messages.length === 0 ? (
          <div style={{ textAlign: 'center', ...M, fontSize: 11, color: 'var(--muted)', padding: 20 }}>No messages yet</div>
        ) : messages.map(msg => {
          const isStaff = msg.author_type === 'staff'
          const isSystem = msg.author_type === 'system'
          return (
            <div key={msg.id} style={{ display: 'flex', justifyContent: isStaff ? 'flex-start' : 'flex-end', marginBottom: 10 }}>
              <div style={{ maxWidth: '80%', background: isSystem ? 'rgba(168,85,247,0.08)' : isStaff ? 'color-mix(in srgb, var(--cyan) 6%, transparent)' : 'color-mix(in srgb, var(--green) 6%, transparent)',
                border: `1px solid ${isSystem ? 'rgba(168,85,247,0.2)' : isStaff ? 'color-mix(in srgb, var(--cyan) 20%, transparent)' : 'color-mix(in srgb, var(--green) 20%, transparent)'}`,
                borderRadius: 10, padding: '10px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ ...M, fontSize: 11, letterSpacing: 2, color: isSystem ? CLRS.purple : isStaff ? CLRS.cyan : CLRS.green, fontWeight: 700 }}>
                    {isSystem ? 'SYSTEM' : isStaff ? 'STAFF' : 'YOU'}
                  </span>
                  <span style={{ ...M, fontSize: 11, color: 'var(--muted)' }}>{msg.author_name}</span>
                  <span style={{ ...M, fontSize: 11, color: 'var(--muted)', marginLeft: 'auto' }}>
                    {msg.created_at ? new Date(msg.created_at).toLocaleString() : ''}
                  </span>
                </div>
                <div style={{ ...M, fontSize: 11, color: 'var(--text)', lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {msg.message}
                </div>
              </div>
            </div>
          )
        })}
      </div>
      {/* Reply box */}
      {canReply && (
        <div style={{ padding: '14px 20px' }}>
          <label style={{ ...M, fontSize: 11, letterSpacing: 2, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>ADD A REPLY</label>
          <textarea value={reply} onChange={e => setReply(e.target.value)}
            placeholder="Type your message here..." rows={3}
            style={{ width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)',
              ...M, fontSize: 12, padding: '10px 14px', outline: 'none', borderRadius: 6, boxSizing: 'border-box',
              resize: 'vertical', lineHeight: 1.7, marginBottom: 10 }}
            onFocus={e => e.target.style.borderColor = CLRS.green}
            onBlur={e => e.target.style.borderColor = 'var(--border)'} />
          <button onClick={sendReply} disabled={sending || !reply.trim()} style={{
            ...M, fontSize: 11, letterSpacing: 2, padding: '9px 18px',
            background: sending || !reply.trim() ? 'var(--bg3)' : CLRS.green,
            color: sending || !reply.trim() ? 'var(--muted)' : '#000',
            border: 'none', borderRadius: 6, cursor: sending || !reply.trim() ? 'not-allowed' : 'pointer',
            fontWeight: 700,
          }}>
            {sending ? 'SENDING...' : '↩ SEND REPLY'}
          </button>
        </div>
      )}
      {!canReply && (
        <div style={{ ...M, fontSize: 11, color: 'var(--muted)', textAlign: 'center', padding: 12 }}>
          This ticket is {ticket.status}. You cannot add more replies.
        </div>
      )}
    </div>
  )
}

/* ─── My Tickets tab ─────────────────────────────────────────────────────── */
function MyTicketsTab({ user, initialTicketId, onTicketViewChange }) {
  const [tickets, setTickets]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [filter, setFilter]     = useState('all')
  const [catFilter, setCatFilter] = useState('all')
  const [sortBy, setSortBy]     = useState('newest')
  const [viewTicketId, setViewTicketId] = useState(initialTicketId || null)
  const [prevInitialTicketId, setPrevInitialTicketId] = useState(initialTicketId || null)
  if (prevInitialTicketId !== (initialTicketId || null)) {
    setPrevInitialTicketId(initialTicketId || null)
    setViewTicketId(initialTicketId || null)
  }

  const loadTickets = useCallback(() => {
    if (!user?.email) { setLoading(false); return }
    api.get('/helpdesk/tickets/mine')
      .then(r => setTickets(Array.isArray(r.data) ? r.data : []))
      .catch(() => setTickets([]))
      .finally(() => setLoading(false))
  }, [user?.email])

  useEffect(() => { void (async () => { await loadTickets() })() }, [loadTickets])

  // Auto-sync polling
  useEffect(() => {
    if (viewTicketId) return
    const id = setInterval(() => { if (!document.hidden) loadTickets() }, 15_000) // P2 — pause while tab hidden
    return () => clearInterval(id)
  }, [loadTickets, viewTicketId])

  const statuses = ['all', 'open', 'in-progress', 'pending', 'resolved', 'closed']
  const categories = ['all', ...new Set(tickets.map(t => t.category).filter(Boolean))]

  const filtered = tickets
    .filter(t => filter === 'all' || t.status === filter)
    .filter(t => catFilter === 'all' || t.category === catFilter)
    .sort((a, b) => {
      if (sortBy === 'newest') return new Date(b.created_at) - new Date(a.created_at)
      if (sortBy === 'oldest') return new Date(a.created_at) - new Date(b.created_at)
      if (sortBy === 'priority') {
        const o = { critical: 0, high: 1, medium: 2, low: 3 }
        return (o[a.priority] ?? 2) - (o[b.priority] ?? 2)
      }
      return 0
    })

  // Stats
  const stats = {
    total:    tickets.length,
    open:     tickets.filter(t => t.status === 'open').length,
    progress: tickets.filter(t => t.status === 'in-progress').length,
    resolved: tickets.filter(t => ['resolved','closed'].includes(t.status)).length,
  }

  if (loading) return (
    <div style={{ padding: '40px 0', textAlign: 'center', ...M, fontSize: 11, color: 'var(--muted)', letterSpacing: 3 }}>
      LOADING TICKETS…
    </div>
  )

  if (!user?.email) return (
    <div style={{ padding: '40px 20px', textAlign: 'center' }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>🎫</div>
      <div style={{ ...M, fontSize: 11, color: 'var(--muted)' }}>No email associated with your account.</div>
    </div>
  )

  return (
    <div>
      {/* Stat strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 20 }}>
        {[
          { label: 'TOTAL',    value: stats.total,    color: CLRS.cyan   },
          { label: 'OPEN',     value: stats.open,     color: CLRS.orange },
          { label: 'PROGRESS', value: stats.progress, color: CLRS.cyan   },
          { label: 'RESOLVED', value: stats.resolved, color: CLRS.green  },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--bg3)', border: '1px solid var(--border)',
            borderTop: `2px solid ${s.color}`, borderRadius: 8, padding: '12px 14px', textAlign: 'center' }}>
            <div style={{ ...M, fontSize: 11, letterSpacing: 2, color: 'var(--muted)', marginBottom: 4 }}>{s.label}</div>
            <div style={{ ...M, fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
        {/* Status filter */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {statuses.map(s => {
            const cfg = STATUS_CFG[s] || { color: 'var(--muted)', label: 'ALL' }
            const active = filter === s
            return (
              <button key={s} onClick={() => setFilter(s)} style={{
                ...M, fontSize: 11, letterSpacing: 1, padding: '4px 10px', borderRadius: 4, cursor: 'pointer',
                background: active ? cfg.color + '22' : 'transparent',
                border: `1px solid ${active ? cfg.color : 'var(--border)'}`,
                color: active ? cfg.color : 'var(--muted)', transition: 'all 0.12s',
              }}>{s === 'all' ? 'ALL' : cfg.label}</button>
            )
          })}
        </div>
        {/* Category filter */}
        {categories.length > 2 && (
          <div style={{ width: 180 }}>
            <Select value={catFilter} onChange={setCatFilter}
              options={categories.map(c => [c, c === 'all' ? 'All Categories' : c.charAt(0).toUpperCase() + c.slice(1)])} />
          </div>
        )}
        {/* Sort */}
        <div style={{ width: 160, marginLeft: 'auto' }}>
          <Select value={sortBy} onChange={setSortBy}
            options={[['newest', 'Newest first'], ['oldest', 'Oldest first'], ['priority', 'Priority']]} />
        </div>
      </div>

      {/* Ticket list or detail */}
      {viewTicketId ? (
        <TicketDetailView ticketId={viewTicketId} user={user} onBack={() => {
          setViewTicketId(null)
          onTicketViewChange?.(null)
        }} />
      ) : filtered.length === 0 ? (
        <div style={{ padding: '40px 0', textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📭</div>
          <div style={{ ...M, fontSize: 11, color: 'var(--muted)' }}>
            {tickets.length === 0 ? 'No tickets submitted yet.' : 'No tickets match the current filters.'}
          </div>
          {tickets.length === 0 && (
            <Link to="/helpdesk" style={{ display: 'inline-block', marginTop: 14, ...M, fontSize: 11,
              color: CLRS.cyan, letterSpacing: 2, textDecoration: 'none',
              padding: '8px 18px', border: `1px solid ${CLRS.cyan}55`, borderRadius: 6 }}>
              SUBMIT A TICKET →
            </Link>
          )}
        </div>
      ) : (
        filtered.map(t => (
          <TicketCard key={t.id || t.ticket_id} t={t} onClick={() => {
            setViewTicketId(t.id)
            onTicketViewChange?.(t.id)
          }} />
        ))
      )}
    </div>
  )
}

/* ─── Forum Activity tab ─────────────────────────────────────────────────── */
function ActivityTab({ user }) {
  const [threads, setThreads] = useState([])
  const [replies, setReplies] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void (async () => {
      if (!user?.id && !user?._id) { setLoading(false); return }
      const uid = user.id || user._id
      try {
        const [t, r] = await Promise.all([
          api.get(`/forum/users/${uid}/threads?limit=10`).catch(() => ({ data: [] })),
          api.get(`/forum/users/${uid}/replies?limit=10`).catch(() => ({ data: [] })),
        ])
        setThreads(Array.isArray(t.data) ? t.data : t.data?.threads || [])
        setReplies(Array.isArray(r.data) ? r.data : r.data?.replies || [])
      } finally {
        setLoading(false)
      }
    })()
  }, [user?.id, user?._id])

  if (loading) return <div style={{ padding: '40px 0', textAlign: 'center', ...M, fontSize: 11, color: 'var(--muted)', letterSpacing: 3 }}>LOADING…</div>

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }} className="profile-act-grid">
      {/* Threads */}
      <SectionCard title="Recent Threads" tag="FORUM">
        {threads.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px 0', ...M, fontSize: 11, color: 'var(--muted)' }}>No threads yet</div>
        ) : threads.map(t => (
          <Link key={t.id || t._id} to={`/forum/thread/${t.id || t._id}`} style={{ textDecoration: 'none', display: 'block' }}>
            <div className="forum-activity-link" style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
              <div style={{ ...M, fontSize: 11, color: 'var(--muted)' }}>{ago(t.created_at || t.createdAt)}</div>
            </div>
          </Link>
        ))}
      </SectionCard>

      {/* Replies */}
      <SectionCard title="Recent Replies" tag="FORUM">
        {replies.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px 0', ...M, fontSize: 11, color: 'var(--muted)' }}>No replies yet</div>
        ) : replies.map(r => (
          <div key={r.id || r._id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{r.content || r.body}</div>
            <div style={{ ...M, fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>{ago(r.created_at || r.createdAt)}</div>
          </div>
        ))}
      </SectionCard>
    </div>
  )
}

/* ─── Profile Edit tab ───────────────────────────────────────────────────── */
function ProfileEditTab({ user, onUpdate }) {
  const toast = useToast()
  const [form, setForm] = useState({ username: user?.username || '', email: user?.email || '', bio: user?.bio || '', avatar: user?.avatar || '' })
  const [saving, setSaving] = useState(false)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [status, setStatus] = useState(null)
  const [usernameCheck, setUsernameCheck] = useState({ state: 'idle', msg: '' })
  const [emailCheck, setEmailCheck] = useState({ state: 'idle', msg: '' })
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const userKey = `${user?.email ?? ''}|${user?.pending_email ?? ''}`
  const [prevUserKey, setPrevUserKey] = useState(userKey)
  if (prevUserKey !== userKey) {
    setPrevUserKey(userKey)
    if (user?.email) {
      setForm(p => {
        const next = { username: user?.username || '', email: user?.pending_email ? user.email : (user?.email || ''), bio: user?.bio || '', avatar: user?.avatar || '' }
        if (p.username === next.username && p.email === next.email && p.bio === next.bio && p.avatar === next.avatar) return p
        return next
      })
    }
  }

  const username = (form.username || '').trim()
  const usernameState = !username || username.toLowerCase() === String(user?.username || '').toLowerCase()
    ? 'idle'
    : username.length < 3
      ? 'short'
      : 'checking'
  const [prevUsernameState, setPrevUsernameState] = useState(usernameState)
  if (prevUsernameState !== usernameState) {
    setPrevUsernameState(usernameState)
    if (usernameState === 'idle') setUsernameCheck({ state: 'idle', msg: '' })
    else if (usernameState === 'short') setUsernameCheck({ state: 'error', msg: 'Username must be at least 3 characters.' })
    else setUsernameCheck({ state: 'checking', msg: 'Checking username...' })
  }

  useEffect(() => {
    if (usernameState === 'idle' || usernameState === 'short') return
    const timer = setTimeout(() => {
      // P0 — POST twin (no username in GET query strings); backend serves
      // both GET and POST, frontend uses POST only.
      api.post('/auth/check-username', { username })
        .then(r => {
          setUsernameCheck(r.data?.available
            ? { state: 'ok', msg: 'Username is available.' }
            : { state: 'error', msg: r.data?.suggestion ? `Taken. Try ${r.data.suggestion}.` : 'Username is already taken.' })
        })
        .catch(() => setUsernameCheck({ state: 'error', msg: 'Could not check username.' }))
    }, 350)
    return () => clearTimeout(timer)
  }, [username, usernameState])

  const email = (form.email || '').trim()
  const currentEmail = String(user?.email || '').trim().toLowerCase()
  const emailState = !email || email.toLowerCase() === currentEmail
    ? 'idle'
    : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      ? 'invalid'
      : 'checking'
  const [prevEmailState, setPrevEmailState] = useState(emailState)
  if (prevEmailState !== emailState) {
    setPrevEmailState(emailState)
    if (emailState === 'idle') setEmailCheck({ state: 'idle', msg: '' })
    else if (emailState === 'invalid') setEmailCheck({ state: 'error', msg: 'Enter a valid email address.' })
    else setEmailCheck({ state: 'checking', msg: 'Checking email...' })
  }

  useEffect(() => {
    if (emailState === 'idle' || emailState === 'invalid') return
    const timer = setTimeout(() => {
      api.get(`/auth/check-email?email=${encodeURIComponent(email)}`)
        .then(r => {
          setEmailCheck(r.data?.available
            ? { state: 'ok', msg: 'Email is available. Verification will be required.' }
            : { state: 'error', msg: 'Email is already in use.' })
        })
        .catch(err => setEmailCheck({ state: 'error', msg: err?.response?.data?.detail || 'Could not check email.' }))
    }, 350)
    return () => clearTimeout(timer)
  }, [email, emailState])

  const save = async e => {
    e.preventDefault()
    if (usernameCheck.state === 'error' || usernameCheck.state === 'checking' || emailCheck.state === 'error' || emailCheck.state === 'checking') return
    setSaving(true); setStatus(null)
    try {
      const res = await api.put('/auth/profile', form)
      onUpdate?.(res.data?.user || form)
      const msg = res.data?.email_verification_sent
        ? 'Profile updated. Check your inbox to verify the new email.'
        : 'Profile updated successfully.'
      setStatus({ type: 'success', msg })
      toast.success(msg, { title:'Profile' })
    } catch (err) {
      const msg = err?.response?.data?.detail || 'Update failed.'
      setStatus({ type: 'error', msg })
      toast.error(msg, { title:'Profile' })
    } finally { setSaving(false) }
  }

  const onAvatarUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarUploading(true); setStatus(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await api.post('/auth/avatar', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      const newUrl = res.data?.url
      if (newUrl) {
        set('avatar', newUrl)
        onUpdate?.({ ...form, avatar: newUrl })
        setStatus({ type: 'success', msg: 'Avatar uploaded. Save changes to keep it.' })
      }
    } catch (err) {
      setStatus({ type: 'error', msg: err?.response?.data?.detail || 'Avatar upload failed.' })
    } finally { setAvatarUploading(false); e.target.value = '' }
  }

  return (
    <SectionCard title="Edit Profile" tag="PROFILE">
      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 500 }}>
        <Inp label="USERNAME" id="pf-user" value={form.username} onChange={e => set('username', e.target.value)} placeholder="YourUsername" />
        {usernameCheck.msg && (
          <div style={{ ...M, fontSize: 11, color: usernameCheck.state === 'ok' ? CLRS.green : usernameCheck.state === 'checking' ? CLRS.cyan : CLRS.red, marginTop: -8 }}>
            {usernameCheck.msg}
          </div>
        )}
        {user?.pending_email ? (
          <div style={{ padding: '10px 14px', background: 'rgba(0,229,255,0.07)', border: '1px solid rgba(0,229,255,0.25)', borderRadius: 6, ...M, fontSize: 11, color: CLRS.cyan, lineHeight: 1.7 }}>
            📧 Verification pending for <strong>{user.pending_email}</strong>. Check your inbox (including spam).<br />
            Your email will change after you click the verification link in the email.
          </div>
        ) : (
          <>
            <Inp label="EMAIL" id="pf-email" type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="you@example.com" />
            {emailCheck.msg && (
              <div style={{ ...M, fontSize: 11, color: emailCheck.state === 'ok' ? CLRS.green : emailCheck.state === 'checking' ? CLRS.cyan : CLRS.red, marginTop: -8 }}>
                {emailCheck.msg}
              </div>
            )}
          </>
        )}
        <div>
          <label htmlFor="pf-bio" style={{ ...M, fontSize: 11, letterSpacing: 2, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>BIO</label>
          <textarea id="pf-bio" rows={3} value={form.bio} onChange={e => set('bio', e.target.value)}
            placeholder="Tell us about yourself…"
            style={{ width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)',
              ...M, fontSize: 12, padding: '10px 13px', borderRadius: 6, outline: 'none',
              boxSizing: 'border-box', resize: 'vertical', lineHeight: 1.7,
              transition: 'border-color 0.15s' }}
            onFocus={e => e.target.style.borderColor = 'var(--cyan)'}
            onBlur={e => e.target.style.borderColor = 'var(--border)'} />
        </div>
        <div>
          <label htmlFor="pf-avatar" style={{ ...M, fontSize: 11, letterSpacing: 2, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>AVATAR</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            {form.avatar ? (
              <UserAvatar avatar={form.avatar} name={form.username} size={56} imgStyle={{ border: '1px solid var(--border)' }} />
            ) : (
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--bg3)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', ...M, fontSize: 20, color: 'var(--muted)', flexShrink: 0 }}>?</div>
            )}
            <label htmlFor="pf-avatar-file" style={{ ...M, fontSize: 11, letterSpacing: 2, fontWeight: 800, padding: '8px 14px', color: '#000', background: 'var(--green)', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              {avatarUploading ? 'UPLOADING…' : '⤒ UPLOAD IMAGE'}
            </label>
            <span style={{ ...M, fontSize: 11, color: 'var(--muted)' }}>JPEG · PNG · GIF · WebP, max 5 MB,<br />or paste a URL below</span>
          </div>
          <input id="pf-avatar-file" type="file" accept="image/jpeg,image/png,image/gif,image/webp" hidden onChange={onAvatarUpload} />
        </div>
        <Inp label="AVATAR URL" id="pf-avatar" value={form.avatar} onChange={e => set('avatar', e.target.value)} placeholder="https://…/avatar.png" />
        <div style={{ marginTop: 10 }}>
          <label style={{ ...M, fontSize: 11, letterSpacing: 2, color: 'var(--muted)', display: 'block', marginBottom: 8 }}>BUILT-IN AVATARS</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {BUILTIN_AVATARS.map(a => {
              const active = form.avatar === `avatar:${a.key}`
              return (
                <button key={a.key} type="button" title={a.label} aria-label={a.label} onClick={() => set('avatar', `avatar:${a.key}`)}
                  style={{
                    width: 34, height: 34, borderRadius: 8, fontSize: 18, cursor: 'pointer', lineHeight: 1,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: active ? 'color-mix(in srgb, var(--green) 18%, transparent)' : 'var(--bg3)',
                    border: active ? '1px solid var(--green)' : '1px solid var(--border)',
                  }}>{a.icon}</button>
              )
            })}
            <button type="button" title="No built-in avatar" aria-label="Clear built-in avatar"
              onClick={() => { if (form.avatar?.startsWith('avatar:')) set('avatar', '') }}
              style={{
                width: 34, height: 34, borderRadius: 8, cursor: 'pointer', lineHeight: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)',
                background: 'var(--bg3)', border: '1px solid var(--border)',
              }}>✕</button>
          </div>
        </div>
        {status && <StatusMsg msg={status.msg} type={status.type} />}
        <Btn type="submit" disabled={saving || usernameCheck.state === 'error' || usernameCheck.state === 'checking' || emailCheck.state === 'error' || emailCheck.state === 'checking'}>{saving ? 'SAVING…' : 'SAVE CHANGES'}</Btn>
      </form>
    </SectionCard>
  )
}


function ProfileSessionsPanel({ staffAccount }) {
  const dialog = useDialog()
  const now = useNow()
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [revoking, setRevoking] = useState('')
  const base = '/auth/sessions'
  const load = useCallback(async () => {
    setLoading(true)
    try { const r = await api.get(base); setSessions(r.data?.sessions || []) }
    catch { setSessions([]) }
    finally { setLoading(false) }
  }, [base])
  useEffect(() => {
    void (async () => { await load() })()
    // P2 — heartbeat paused while the tab is hidden (session stays alive via
    // cookie expiry, not via background pings).
    const beat = setInterval(() => { if (!document.hidden) api.post(`${base}/heartbeat`).then(load).catch(() => {}) }, 30000)
    api.post(`${base}/heartbeat`).then(load).catch(() => {})
    return () => clearInterval(beat)
  }, [base, load])
  const revoke = async (id, all = false) => {
    const ok = await dialog.confirm({ title: all ? 'Revoke other sessions?' : 'Revoke session?', message: all ? 'Sign out every other device for this account.' : 'Sign out this device session.', variant:'danger', confirmLabel:'REVOKE' })
    if (!ok) return
    setRevoking(all ? 'all' : id)
    try { all ? await api.delete(base) : await api.delete(`${base}/${id}`); await load() }
    finally { setRevoking('') }
  }
  const ago = d => {
    if (!d) return '—'
    const sec = Math.floor((now - new Date(d).getTime()) / 1000)
    if (sec < 60) return `${sec}s ago`
    if (sec < 3600) return `${Math.floor(sec/60)}m ago`
    if (sec < 86400) return `${Math.floor(sec/3600)}h ago`
    return new Date(d).toLocaleDateString()
  }
  return (
    <SectionCard title="Active Sessions" tag="SECURITY" action={sessions.length > 1 && <Btn small ghost color={CLRS.red} disabled={revoking==='all'} onClick={() => revoke(null, true)}>REVOKE OTHERS</Btn>}>
      {loading ? <div style={{ ...M, fontSize: 11, color:'var(--muted)' }}>Loading sessions...</div> : sessions.length === 0 ? (
        <div style={{ ...M, fontSize: 11, color:'var(--muted)', lineHeight:1.7 }}>No session history yet. Sessions are recorded on login and refreshed while you browse.</div>
      ) : sessions.map((sess, i) => (
        <div key={sess.id || i} style={{ display:'flex', gap:12, alignItems:'flex-start', padding:'10px 0', borderBottom:i < sessions.length - 1 ? '1px solid var(--border)' : 'none' }}>
          <div style={{ fontSize:18 }}>{sess.current ? '●' : '□'}</div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ ...M, fontSize:11, color:'var(--text)' }}>{sess.ip || 'Unknown IP'} {sess.current && <Badge label="THIS SESSION" color={CLRS.green} />}</div>
            <div style={{ ...M, fontSize: 11, color:'var(--muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginTop:3 }}>{sess.user_agent || 'Unknown browser'}</div>
            <div style={{ ...M, fontSize: 11, color:'var(--muted)', marginTop:3 }}>Last active {ago(sess.last_active)} · Login {sess.created_at ? new Date(sess.created_at).toLocaleString() : '—'}</div>
          </div>
          {!sess.current && <Btn small ghost color={CLRS.red} disabled={revoking===sess.id} onClick={() => revoke(sess.id)}>REVOKE</Btn>}
        </div>
      ))}
    </SectionCard>
  )
}

function TwoFactorPanel({ user }) {
  const toast = useToast()
  const hasPassword = user?.has_password !== false
  const staffOnlyAccount = user?.account_source === 'staff' || user?.account_source === 'env_admin' || (!user?.id && user?._staff)
  const base = '/auth/2fa'
  const [state, setState] = useState({
    enabled: !!user?.two_factor_enabled,
    loading: true,
    step: null,
    qr: '',
    secret: '',
    code: '',
    password: '',
    working: false,
    error: '',
  })
  const set2fa = patch => setState(prev => ({ ...prev, ...patch }))

  useEffect(() => {
    let cancelled = false
    api.get(`${base}/status`)
      .then(r => { if (!cancelled) set2fa({ enabled: !!r.data?.enabled, loading: false }) })
      .catch(() => { if (!cancelled) set2fa({ loading: false }) })
    return () => { cancelled = true }
  }, [base])

  const cleanCode = () => state.code.replace(/\s/g, '')

  const startSetup = async () => {
    set2fa({ step: 'setup', working: true, error: '', code: '', qr: '', secret: '' })
    try {
      const r = await api.post(`${base}/setup`)
      set2fa({ qr: r.data?.qr_image || '', secret: r.data?.secret || '', working: false })
    } catch (err) {
      set2fa({ error: err?.response?.data?.detail || 'Could not start 2FA setup.', working: false, step: null })
    }
  }

  const confirmSetup = async () => {
    const code = cleanCode()
    if (code.length !== 6) { set2fa({ error: 'Enter the 6-digit code from your authenticator app.' }); return }
    set2fa({ working: true, error: '' })
    try {
      await api.post(`${base}/confirm`, { code })
      set2fa({ enabled: true, step: null, qr: '', secret: '', code: '', working: false })
      toast.success('Two-factor authentication is now active.', { title: '2FA Enabled' })
    } catch (err) {
      set2fa({ error: err?.response?.data?.detail || 'Invalid code.', working: false })
    }
  }

  const disable2fa = async () => {
    const code = cleanCode()
    if (hasPassword && !state.password) { set2fa({ error: 'Enter your current password.' }); return }
    if (code.length !== 6) { set2fa({ error: 'Enter the 6-digit code from your authenticator app.' }); return }
    set2fa({ working: true, error: '' })
    try {
      await api.post(`${base}/disable`, { password: state.password, code })
      set2fa({ enabled: false, step: null, password: '', code: '', working: false })
      toast.success('Two-factor authentication has been disabled.', { title: '2FA Disabled' })
    } catch (err) {
      set2fa({ error: err?.response?.data?.detail || 'Could not disable 2FA.', working: false })
    }
  }

  return (
    <SectionCard
      title="Two-Factor Authentication"
      tag="SECURITY"
      action={!state.loading && <Badge label={state.enabled ? 'ACTIVE' : 'DISABLED'} color={state.enabled ? CLRS.green : CLRS.red} />}
    >
      {state.loading ? (
        <div style={{ ...M, fontSize: 11, color:'var(--muted)' }}>Loading 2FA status...</div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:14, maxWidth:520 }}>
          <p style={{ ...M, fontSize:11, color:'var(--muted)', lineHeight:1.8, margin:0 }}>
            Protect your account with a 6-digit authenticator code. When enabled, password, Discord, and Steam sign-ins must pass this extra check before the site issues a session.
          </p>
          {state.error && <StatusMsg msg={state.error} type="error" />}

          {!state.enabled && !state.step && (
            <Btn onClick={startSetup}>ENABLE 2FA</Btn>
          )}

          {state.step === 'setup' && (
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              {state.working && <div style={{ ...M, fontSize: 11, color:'var(--muted)' }}>Generating QR code...</div>}
              {state.qr && (
                <>
                  <div style={{ ...M, fontSize: 11, color:'var(--muted)', lineHeight:1.7 }}>Scan the QR code, then enter the current code from your app.</div>
                  <div style={{ background:'#fff', padding:12, borderRadius:8, alignSelf:'flex-start' }}>
                    <img src={state.qr} alt="2FA QR code" style={{ width:160, height:160, display:'block' }} />
                  </div>
                  {state.secret && <div style={{ ...M, fontSize: 11, color:'var(--muted)', wordBreak:'break-all' }}>Manual key: <span style={{ color:CLRS.cyan, letterSpacing:1, userSelect:'all' }}>{state.secret}</span></div>}
                  <Inp label="AUTHENTICATOR CODE" id="twofa-confirm" inputMode="numeric" maxLength={7} value={state.code}
                    onChange={e => set2fa({ code: e.target.value.replace(/[^0-9 ]/g, ''), error: '' })}
                    placeholder="000 000" style={{ maxWidth:170, textAlign:'center', fontSize:16, letterSpacing:5 }} />
                  <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
                    <Btn disabled={state.working} onClick={confirmSetup}>{state.working ? 'VERIFYING...' : 'CONFIRM & ACTIVATE'}</Btn>
                    <Btn ghost color={CLRS.orange} onClick={() => set2fa({ step:null, qr:'', secret:'', code:'', error:'' })}>CANCEL</Btn>
                  </div>
                </>
              )}
            </div>
          )}

          {state.enabled && state.step !== 'disable' && (
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <div style={{ ...M, fontSize: 11, color:CLRS.green }}>2FA is active. Your next login will require an authenticator code.</div>
              <Btn ghost color={CLRS.red} onClick={() => set2fa({ step:'disable', error:'', code:'', password:'' })}>DISABLE 2FA</Btn>
            </div>
          )}

          {state.step === 'disable' && (
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              {hasPassword && (
                <Inp label="CURRENT PASSWORD" id="twofa-disable-pass" type="password" value={state.password}
                  onChange={e => set2fa({ password: e.target.value, error: '' })} autoComplete="current-password" style={{ maxWidth:320 }} />
              )}
              <Inp label="AUTHENTICATOR CODE" id="twofa-disable-code" inputMode="numeric" maxLength={7} value={state.code}
                onChange={e => set2fa({ code: e.target.value.replace(/[^0-9 ]/g, ''), error: '' })}
                placeholder="000 000" style={{ maxWidth:170, textAlign:'center', fontSize:16, letterSpacing:5 }} />
              <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
                <Btn disabled={state.working} color={CLRS.red} onClick={disable2fa}>{state.working ? 'DISABLING...' : 'CONFIRM DISABLE'}</Btn>
                <Btn ghost color={CLRS.orange} onClick={() => set2fa({ step:null, password:'', code:'', error:'' })}>CANCEL</Btn>
              </div>
            </div>
          )}
        </div>
      )}
    </SectionCard>
  )
}

/* ─── Security tab ───────────────────────────────────────────────────────── */
function SecurityTab({ user }) {
  const navigate = useNavigate()
  const { logout, refreshUser } = useForum()
  const dialog = useDialog()
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState(null)
  const [oauthStatus, setOauthStatus] = useState(() => {
    if (typeof window === 'undefined') return null
    const params = new URLSearchParams(window.location.search)
    const provider = params.get('discord_error') ? 'Discord' : params.get('steam_error') ? 'Steam' : params.get('github_error') ? 'GitHub' : ''
    if (!provider) return null
    const err = params.get('discord_error') || params.get('steam_error') || params.get('github_error')
    const messages = {
      duplicate: `${provider} is already linked to another user.`,
      link: `${provider} connect session expired. Please try again.`,
      identity_locked: 'Your active FiveM identity is locked. Contact staff to change OAuth accounts.',
    }
    return { type: 'error', msg: messages[err] || `${provider} connect failed.` }
  })
  const [oauthLoading, setOauthLoading] = useState('')
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const identityLocked = !!user?.active_identity_locked

  const changePassword = async e => {
    e.preventDefault()
    if (form.newPassword !== form.confirmPassword) { setStatus({ type: 'error', msg: 'Passwords do not match.' }); return }
    if (form.newPassword.length < 8) { setStatus({ type: 'error', msg: 'Password must be at least 8 characters.' }); return }
    setSaving(true); setStatus(null)
    try {
      const r = await api.post('/auth/change-password', { current_password: form.currentPassword, new_password: form.newPassword })
      setStatus({ type: 'success', msg: r.data?.bcrypt_hash ? 'Password hash generated. Update ADMIN_PASSWORD in Vercel to finish the admin password change.' : 'Password changed. You may need to sign in again.' })
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
    } catch (err) {
      setStatus({ type: 'error', msg: err?.response?.data?.detail || 'Failed to change password.' })
    } finally { setSaving(false) }
  }

  const connectProvider = async provider => {
    setOauthLoading(`${provider}-connect`)
    setOauthStatus(null)
    try {
      const r = await api.get(`${oauthApiBase(provider)}/connect-url?dest=${encodeURIComponent('/profile?tab=security')}`)
      // r.data.url is an absolute provider URL, so safeNextPath (same-origin
      // relative paths only) cannot guard it — use the host allowlist above.
      if (!safeOAuthRedirect(r.data.url)) navigate('/')
    } catch (err) {
      setOauthStatus({ type: 'error', msg: err?.response?.data?.detail || `Could not start ${provider} connect.` })
      setOauthLoading('')
    }
  }

  const disconnectProvider = async provider => {
    const labels = { steam: 'Steam', discord: 'Discord', github: 'GitHub' }
    const label = labels[provider] || provider
    if (!await dialog.confirm({
      title: `Disconnect ${label}`,
      message: `Disconnect this ${label} account from your profile?`,
      variant: 'danger',
      confirmLabel: 'DISCONNECT',
    })) return
    setOauthLoading(`${provider}-disconnect`)
    setOauthStatus(null)
    try {
      const route = `${oauthApiBase(provider)}/disconnect`
      await api.delete(route)
      await refreshUser?.()
      setOauthStatus({ type: 'success', msg: `${label} disconnected.` })
    } catch (err) {
      setOauthStatus({ type: 'error', msg: err?.response?.data?.detail || `Could not disconnect ${provider}.` })
    } finally {
      setOauthLoading('')
    }
  }

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const provider = params.get('discord_error') ? 'Discord' : params.get('steam_error') ? 'Steam' : params.get('github_error') ? 'GitHub' : ''
    if (!provider) return
    window.history.replaceState({}, '', window.location.pathname + '?tab=security')
  }, [])

  const oauthProviders = [
    {
      key: 'discord',
      label: 'Discord',
      color: DISCORD_PURPLE,
      linked: !!user?.discord_id,
      username: user?.discord_username,
      id: user?.discord_id,
      avatar: user?.discord_avatar,
    },
    {
      key: 'steam',
      label: 'Steam',
      color: STEAM_LIGHT,
      linked: !!user?.steam_id,
      username: user?.steam_username,
      id: user?.steam_id,
      avatar: user?.steam_avatar,
    },
    {
      key: 'github',
      label: 'GitHub',
      color: GITHUB_COLOR,
      linked: !!user?.github_id,
      username: user?.github_username,
      id: user?.github_id,
      avatar: user?.github_avatar,
    },
  ]

  return (
    <div>
      <SectionCard title="Connected Accounts" tag="OAUTH">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 12 }} className="profile-grid-2">
          {oauthProviders.map(provider => (
            <div key={provider.key} style={{ background: 'var(--bg3)', border: `1px solid ${provider.linked ? provider.color + '55' : 'var(--border)'}`, borderRadius: 8, padding: 14 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
                {provider.avatar ? (
                  <img src={provider.avatar} alt={provider.label} style={{ width: 42, height: 42, borderRadius: '50%', objectFit: 'cover', border: `1px solid ${provider.color}66` }} />
                ) : (
                  <div style={{ width: 42, height: 42, borderRadius: '50%', background: provider.color + '22', border: `1px solid ${provider.color}66`, display: 'flex', alignItems: 'center', justifyContent: 'center', ...M, color: provider.color, fontWeight: 800 }}>
                    {provider.label[0]}
                  </div>
                )}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ ...M, fontSize: 11, color: 'var(--text)', fontWeight: 800 }}>{provider.label}</div>
                  <div style={{ ...M, fontSize: 11, color: provider.linked ? provider.color : 'var(--muted)', marginTop: 3 }}>
                    {provider.linked ? `Connected as ${provider.username || provider.id}` : 'Not connected'}
                  </div>
                  {provider.linked && <div style={{ ...M, fontSize: 11, color: 'var(--muted)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis' }}>{provider.id}</div>}
                </div>
              </div>
              <Btn
                small
                ghost={provider.linked}
                color={provider.linked ? CLRS.red : provider.color}
                disabled={!!oauthLoading || identityLocked}
                onClick={() => provider.linked ? disconnectProvider(provider.key) : connectProvider(provider.key)}
              >
                {identityLocked && provider.linked ? 'LOCKED'
                  : oauthLoading === `${provider.key}-connect` || oauthLoading === `${provider.key}-disconnect`
                  ? 'WORKING...'
                  : provider.linked ? 'DISCONNECT' : `CONNECT ${provider.label.toUpperCase()}`}
              </Btn>
            </div>
          ))}
        </div>
        {identityLocked && <div style={{ ...M, fontSize: 11, color: CLRS.orange, padding: '8px 14px', background: 'rgba(255,107,53,0.07)', border: '1px solid rgba(255,107,53,0.25)', borderRadius: 6, marginTop: 8 }}>🔒 Your active FiveM identity is locked. Contact an admin or open a ticket to change OAuth accounts.</div>}
        {oauthStatus && <StatusMsg msg={oauthStatus.msg} type={oauthStatus.type} />}
      </SectionCard>

      {/* Change password */}
      <SectionCard title="Change Password" tag="SECURITY">
        <form onSubmit={changePassword} style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 420 }}>
          <Inp label="CURRENT PASSWORD" id="sec-cur" type="password" value={form.currentPassword} onChange={e => set('currentPassword', e.target.value)} autoComplete="current-password" />
          <Inp label="NEW PASSWORD" id="sec-new" type="password" value={form.newPassword} onChange={e => set('newPassword', e.target.value)} autoComplete="new-password" />
          <Inp label="CONFIRM NEW PASSWORD" id="sec-conf" type="password" value={form.confirmPassword} onChange={e => set('confirmPassword', e.target.value)} autoComplete="new-password"
            style={{ borderColor: form.confirmPassword && form.confirmPassword !== form.newPassword ? CLRS.red : undefined }} />
          {form.confirmPassword && form.confirmPassword !== form.newPassword && (
            <div style={{ ...M, fontSize: 11, color: CLRS.red }}>⚠  Passwords don&apos;t match</div>
          )}
          {status && <StatusMsg msg={status.msg} type={status.type} />}
          <Btn type="submit" disabled={saving}>{saving ? 'SAVING…' : 'CHANGE PASSWORD'}</Btn>
        </form>
      </SectionCard>

      <TwoFactorPanel user={user} />

      <ProfileSessionsPanel staffAccount={!!user?._staff} />

      {/* Sessions / danger */}
      <SectionCard title="Account Actions" tag="DANGER ZONE">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px',
            background: 'var(--bg3)', borderRadius: 7, border: '1px solid var(--border)', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <div style={{ ...M, fontSize: 11, color: 'var(--text)', fontWeight: 700 }}>Sign Out</div>
              <div style={{ ...M, fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>Sign out of your account on this device</div>
            </div>
            <Btn color={CLRS.orange} ghost onClick={async () => { await logout?.(); window.location.replace('/login') }} small>SIGN OUT</Btn>
          </div>
        </div>
      </SectionCard>
    </div>
  )
}

/* ─── Overview tab ───────────────────────────────────────────────────────── */
function OverviewTab({ user, tickets, onOpenTicket }) {
  const ticketStats = {
    total: tickets.length,
    open:  tickets.filter(t => t.status === 'open').length,
    resolved: tickets.filter(t => ['resolved','closed'].includes(t.status)).length,
  }
  const recentTickets = tickets.slice(0, 3)

  return (
    <div>
      {/* Account info */}
      <SectionCard title="Account Info" tag="PROFILE">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }} className="profile-grid-2">
          {[
            ['USERNAME',  user?.username || '—'],
            ['EMAIL',     user?.email    || '—'],
            ['ROLE',      (user?.role    || 'member').toUpperCase()],
            ['MEMBER SINCE', user?.created_at ? new Date(user.created_at).toLocaleDateString() : '—'],
            ['LAST SEEN', ago(user?.last_seen)],
            ['STATUS',    user?.banned ? '🚫 BANNED' : '✓ ACTIVE'],
          ].map(([k, v]) => (
            <div key={k} style={{ padding: '10px 14px', background: 'var(--bg3)', borderRadius: 6, border: '1px solid var(--border)' }}>
              <div style={{ ...M, fontSize: 11, letterSpacing: 2, color: 'var(--muted)', marginBottom: 4 }}>{k}</div>
              <div style={{ ...M, fontSize: 12, color: 'var(--text)' }}>{v}</div>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Ticket snapshot */}
      <SectionCard title="Helpdesk Tickets" tag="SUPPORT"
        action={<button type="button" onClick={() => onOpenTicket?.(null)} style={{ ...M, fontSize: 11, letterSpacing: 2, color: CLRS.cyan, textDecoration: 'none', background: 'none', border: 0, cursor: 'pointer' }}>VIEW ALL →</button>}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 16 }}>
          {[
            { label: 'TOTAL',    value: ticketStats.total,    color: CLRS.cyan   },
            { label: 'OPEN',     value: ticketStats.open,     color: CLRS.orange },
            { label: 'RESOLVED', value: ticketStats.resolved, color: CLRS.green  },
          ].map(s => (
            <div key={s.label} style={{ background: 'var(--bg3)', borderTop: `2px solid ${s.color}`,
              border: '1px solid var(--border)', borderRadius: 7, padding: '10px 12px', textAlign: 'center' }}>
              <div style={{ ...M, fontSize: 11, letterSpacing: 2, color: 'var(--muted)', marginBottom: 4 }}>{s.label}</div>
              <div style={{ ...M, fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>
        {recentTickets.length === 0
          ? <div style={{ ...M, fontSize: 11, color: 'var(--muted)', textAlign: 'center', padding: '14px 0' }}>No tickets yet</div>
          : recentTickets.map(t => <TicketCard key={t.id || t.ticket_id} t={t} onClick={() => onOpenTicket?.(t.id)} />)}
      </SectionCard>

      {/* Bio */}
      {user?.bio && (
        <SectionCard title="Bio" tag="ABOUT">
          <p style={{ ...M, fontSize: 12, color: 'var(--muted)', lineHeight: 1.8, margin: 0 }}>{user.bio}</p>
        </SectionCard>
      )}
    </div>
  )
}

/* ─── FiveM / Whitelist tab ─────────────────────────────────────────────── */

export {
  TicketCard, TicketDetailView, MyTicketsTab, ActivityTab, ProfileEditTab,
  ProfileSessionsPanel, TwoFactorPanel, SecurityTab, OverviewTab,
}
