'use client'
import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Link, useNavigate } from '@/lib/router-compat'
import api, { ensureAdminGate, getAuthToken } from '@/lib/api'
import { useForum } from '../context/ForumContext'
import { Select, useDialog } from '../core/ui.jsx'
import { useToast } from '../components/Toast'
import FiveMStatus from '@/components/FiveMStatus'
import { getSupabase } from '@/lib/supabase'

/* ─── Design tokens ──────────────────────────────────────────────────────── */
const M = { fontFamily: 'var(--font-mono)' }
const D = { fontFamily: 'var(--font-display)' }
const CLRS = {
  green:  'var(--green)',  cyan:  'var(--cyan)',
  red:    '#ff4757',       yellow:'#ffd700',
  purple: '#a855f7',       orange:'#ff6b35',
}
// Discord OAuth lives on the unified /api/auth router; Steam/GitHub keep their
// dedicated routers at /api/forum/auth/{steam,github}.
const oauthApiBase = (provider) => (provider === 'discord' ? '/auth/discord' : `/forum/auth/${provider}`)
const STAFF_PORTAL_ROLES = new Set(['admin', 'moderator', 'editor'])

function canAccessAdminPortal(user) {
  const perms = user?.permissions || user?.module_permissions || {}
  return STAFF_PORTAL_ROLES.has((user?.role || '').toLowerCase()) || !!user?._staff || !!user?.staff_account || Object.keys(perms).length > 0
}

function AdminPortalLink({ compact = false }) {
  const navigate = useNavigate()
  const toast = useToast()
  const openAdminPortal = async (event) => {
    event.preventDefault()
    const ready = await ensureAdminGate()
    if (!ready) {
      toast.error('Admin portal session could not be prepared. Please sign in again.', { title: 'Admin Portal' })
      navigate('/login?tab=signin&next=%2Fadmin')
      return
    }
    navigate('/admin')
  }
  return (
    <Link to="/admin" onClick={openAdminPortal} style={{
      ...M, fontSize: compact ? 8 : 10, letterSpacing: 2, fontWeight: 800,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      padding: compact ? '8px 12px' : '10px 16px',
      color: '#000', background: 'var(--green)', border: '1px solid var(--green)',
      borderRadius: 7, textDecoration: 'none', whiteSpace: 'nowrap',
      boxShadow: '0 0 18px rgba(0,255,136,0.16)',
    }}>
      ADMIN PORTAL
    </Link>
  )
}

/* ─── Shared micro-components ────────────────────────────────────────────── */
function Badge({ label, color = CLRS.cyan, icon }) {
  return (
    <span style={{ ...M, fontSize: 8, letterSpacing: 2, padding: '3px 9px',
      color, background: color + '18', border: `1px solid ${color}40`,
      borderRadius: 4, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      {icon && <span>{icon}</span>}{label}
    </span>
  )
}

function SectionCard({ title, tag, children, action, noPad }) {
  return (
    <div data-fun-drag style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.015)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {tag && <span style={{ ...M, fontSize: 7, letterSpacing: 3, color: CLRS.cyan }}>{tag}</span>}
          <span style={{ ...M, fontSize: 11, fontWeight: 700, color: 'var(--text)' }}>{title}</span>
        </div>
        {action}
      </div>
      <div style={noPad ? {} : { padding: '20px 20px' }}>{children}</div>
    </div>
  )
}

function Inp({ label, id, ...props }) {
  return (
    <div>
      {label && <label htmlFor={id} style={{ ...M, fontSize: 9, letterSpacing: 2, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>{label}</label>}
      <input id={id} {...props} style={{ width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)',
        color: 'var(--text)', ...M, fontSize: 12, padding: '10px 13px', borderRadius: 6,
        outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s', ...props.style }}
        onFocus={e => e.target.style.borderColor = 'var(--cyan)'}
        onBlur={e => e.target.style.borderColor = 'var(--border)'} />
    </div>
  )
}

function Btn({ children, color = CLRS.green, ghost, onClick, disabled, small, type = 'button' }) {
  const c = disabled ? 'var(--muted)' : color
  return (
    <button type={type} onClick={onClick} disabled={disabled} style={{
      ...M, fontSize: small ? 9 : 10, letterSpacing: 2, fontWeight: 700,
      padding: small ? '7px 14px' : '10px 22px', borderRadius: 6, cursor: disabled ? 'not-allowed' : 'pointer',
      background: disabled ? 'var(--bg3)' : ghost ? 'transparent' : c + '18',
      border: `1px solid ${disabled ? 'var(--border)' : c}`,
      color: disabled ? 'var(--muted)' : c, transition: 'all 0.15s', opacity: disabled ? 0.6 : 1,
    }}>{children}</button>
  )
}

function StatusMsg({ msg, type = 'success' }) {
  if (!msg) return null
  const ok = type === 'success'
  return (
    <div style={{ ...M, fontSize: 11, padding: '9px 13px', borderRadius: 6, marginTop: 10,
      color: ok ? CLRS.green : CLRS.red,
      background: ok ? 'rgba(0,255,136,0.06)' : 'rgba(255,71,87,0.06)',
      border: `1px solid ${ok ? 'rgba(0,255,136,0.25)' : 'rgba(255,71,87,0.25)'}` }}>
      {ok ? '✓  ' : '⚠  '}{msg}
    </div>
  )
}

function ago(d) {
  if (!d) return '—'
  const s = Math.floor((Date.now() - new Date(d)) / 1000)
  if (s < 60)    return `${s}s ago`
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return new Date(d).toLocaleDateString()
}

/* ─── Avatar ─────────────────────────────────────────────────────────────── */
function Avatar({ user, size = 80 }) {
  if (user?.avatar) return (
    <img src={user.avatar} alt={user.username} loading="lazy"
      style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover',
        border: '2px solid var(--border)', flexShrink: 0 }} />
  )
  const initials = (user?.username || '?')[0].toUpperCase()
  const hue = (user?.username || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 360
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: `hsl(${hue},60%,25%)`, border: `2px solid hsl(${hue},60%,40%)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: `hsl(${hue},80%,75%)`, fontWeight: 700, fontSize: size * 0.4, ...M }}>
      {initials}
    </div>
  )
}

/* ─── Ticket status helpers ──────────────────────────────────────────────── */
const STATUS_CFG = {
  open:         { color: CLRS.orange,  label: 'OPEN'        },
  'in-progress':{ color: CLRS.cyan,    label: 'IN PROGRESS' },
  resolved:     { color: CLRS.green,   label: 'RESOLVED'    },
  closed:       { color: '#5a7a95', label: 'CLOSED'      },
  pending:      { color: CLRS.purple,  label: 'PENDING'     },
}
const PRIORITY_CFG = {
  critical: { color: CLRS.red,    label: 'CRITICAL' },
  high:     { color: CLRS.orange, label: 'HIGH'     },
  medium:   { color: CLRS.yellow, label: 'MEDIUM'   },
  low:      { color: CLRS.green,  label: 'LOW'      },
}

function TicketCard({ t, onClick }) {
  const sc = STATUS_CFG[t.status]   || STATUS_CFG.open
  const pc = PRIORITY_CFG[t.priority] || PRIORITY_CFG.medium
  const tid = t.ticket_id || t.ticketId || (t.id || '').slice(-6).toUpperCase()
  return (
    <div className="ticket-card" onClick={onClick} style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden',
      marginBottom: 8, cursor: 'pointer', transition: 'border-color 0.15s',
      borderLeft: `3px solid ${sc.color}` }}
      onMouseEnter={e => e.currentTarget.style.borderColor = sc.color + '66'}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
      <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: pc.color,
          boxShadow: `0 0 5px ${pc.color}`, flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text)', minWidth: 120 }}>{t.subject}</span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
          <Badge label={sc.label} color={sc.color} />
          <Badge label={pc.label} color={pc.color} />
          <span style={{ ...M, fontSize: 9, color: 'var(--muted)' }}>{ago(t.created_at)}</span>
          <span style={{ ...M, fontSize: 10, color: 'var(--cyan)', marginLeft: 4 }}>VIEW →</span>
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

  useEffect(() => { loadTicket(false) }, [loadTicket])

  useEffect(() => {
    const refresh = () => loadTicket(true)
    const interval = setInterval(refresh, 10_000)
    const sb = getSupabase()
    if (!sb || !ticketId) return () => clearInterval(interval)

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
    <div style={{ ...M, fontSize: 10, color: 'var(--muted)', letterSpacing: 3, padding: 40, textAlign: 'center' }}>
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
          <div style={{ ...M, fontSize: 8, letterSpacing: 3, color: CLRS.cyan, marginBottom: 4 }}>TICKET DETAIL</div>
          <div style={{ ...M, fontSize: 13, fontWeight: 700, color: CLRS.green }}>#{ticket.ticket_id || (ticket.id || '').slice(-6).toUpperCase()}</div>
          <h3 style={{ fontSize: 15, fontWeight: 600, margin: '4px 0 0' }}>{ticket.subject}</h3>
        </div>
        <button onClick={onBack} style={{ ...M, fontSize: 9, letterSpacing: 1,
          background: 'none', border: '1px solid var(--border)', color: 'var(--muted)',
          cursor: 'pointer', borderRadius: 6, padding: '7px 14px' }}>
          ← BACK
        </button>
      </div>
      {/* Meta */}
      <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)',
        display: 'flex', gap: 16, flexWrap: 'wrap', ...M, fontSize: 10, color: 'var(--muted)' }}>
        <span>Category: <span style={{ color: 'var(--text)' }}>{ticket.category}</span></span>
        <span>Submitted: <span style={{ color: 'var(--text)' }}>{ticket.created_at ? new Date(ticket.created_at).toLocaleString() : ''}</span></span>
        <span>Messages: <span style={{ color: 'var(--text)' }}>{ticket.message_count || messages.length}</span></span>
        <span><Badge label={sc.label} color={sc.color} /></span>
        <span><Badge label={pc.label} color={pc.color} /></span>
      </div>
      {/* Description */}
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.015)' }}>
        <div style={{ ...M, fontSize: 8, letterSpacing: 2, color: 'var(--muted)', marginBottom: 8 }}>DESCRIPTION</div>
        <p style={{ ...M, fontSize: 11, color: 'var(--muted)', lineHeight: 1.8, margin: 0, whiteSpace: 'pre-wrap' }}>{ticket.description}</p>
      </div>
      {/* Message Thread */}
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ ...M, fontSize: 8, letterSpacing: 2, color: 'var(--muted)', marginBottom: 12 }}>DISCUSSION</div>
        {messages.length === 0 ? (
          <div style={{ textAlign: 'center', ...M, fontSize: 10, color: 'var(--muted)', padding: 20 }}>No messages yet</div>
        ) : messages.map(msg => {
          const isStaff = msg.author_type === 'staff'
          const isSystem = msg.author_type === 'system'
          return (
            <div key={msg.id} style={{ display: 'flex', justifyContent: isStaff ? 'flex-start' : 'flex-end', marginBottom: 10 }}>
              <div style={{ maxWidth: '80%', background: isSystem ? 'rgba(168,85,247,0.08)' : isStaff ? 'rgba(0,212,255,0.06)' : 'rgba(0,255,136,0.06)',
                border: `1px solid ${isSystem ? 'rgba(168,85,247,0.2)' : isStaff ? 'rgba(0,212,255,0.2)' : 'rgba(0,255,136,0.2)'}`,
                borderRadius: 10, padding: '10px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ ...M, fontSize: 8, letterSpacing: 2, color: isSystem ? CLRS.purple : isStaff ? CLRS.cyan : CLRS.green, fontWeight: 700 }}>
                    {isSystem ? 'SYSTEM' : isStaff ? 'STAFF' : 'YOU'}
                  </span>
                  <span style={{ ...M, fontSize: 8, color: 'var(--muted)' }}>{msg.author_name}</span>
                  <span style={{ ...M, fontSize: 8, color: 'var(--muted)', marginLeft: 'auto' }}>
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
          <label style={{ ...M, fontSize: 8, letterSpacing: 2, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>ADD A REPLY</label>
          <textarea value={reply} onChange={e => setReply(e.target.value)}
            placeholder="Type your message here..." rows={3}
            style={{ width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)',
              ...M, fontSize: 12, padding: '10px 14px', outline: 'none', borderRadius: 6, boxSizing: 'border-box',
              resize: 'vertical', lineHeight: 1.7, marginBottom: 10 }}
            onFocus={e => e.target.style.borderColor = CLRS.green}
            onBlur={e => e.target.style.borderColor = 'var(--border)'} />
          <button onClick={sendReply} disabled={sending || !reply.trim()} style={{
            ...M, fontSize: 9, letterSpacing: 2, padding: '9px 18px',
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
        <div style={{ ...M, fontSize: 10, color: 'var(--muted)', textAlign: 'center', padding: 12 }}>
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

  const loadTickets = useCallback(() => {
    if (!user?.email) { setLoading(false); return }
    api.get('/helpdesk/tickets/mine')
      .then(r => setTickets(Array.isArray(r.data) ? r.data : []))
      .catch(() => setTickets([]))
      .finally(() => setLoading(false))
  }, [user?.email])

  useEffect(() => { loadTickets() }, [loadTickets])

  useEffect(() => {
    setViewTicketId(initialTicketId || null)
  }, [initialTicketId])

  // Auto-sync polling
  useEffect(() => {
    if (viewTicketId) return
    const id = setInterval(loadTickets, 15_000)
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
    <div style={{ padding: '40px 0', textAlign: 'center', ...M, fontSize: 10, color: 'var(--muted)', letterSpacing: 3 }}>
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
            <div style={{ ...M, fontSize: 7, letterSpacing: 2, color: 'var(--muted)', marginBottom: 4 }}>{s.label}</div>
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
                ...M, fontSize: 8, letterSpacing: 1, padding: '4px 10px', borderRadius: 4, cursor: 'pointer',
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
            <Link to="/helpdesk" style={{ display: 'inline-block', marginTop: 14, ...M, fontSize: 10,
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
    if (!user?.id && !user?._id) { setLoading(false); return }
    const uid = user.id || user._id
    Promise.all([
      api.get(`/forum/users/${uid}/threads?limit=10`).catch(() => ({ data: [] })),
      api.get(`/forum/users/${uid}/replies?limit=10`).catch(() => ({ data: [] })),
    ]).then(([t, r]) => {
      setThreads(Array.isArray(t.data) ? t.data : t.data?.threads || [])
      setReplies(Array.isArray(r.data) ? r.data : r.data?.replies || [])
    }).finally(() => setLoading(false))
  }, [user?.id, user?._id])

  if (loading) return <div style={{ padding: '40px 0', textAlign: 'center', ...M, fontSize: 10, color: 'var(--muted)', letterSpacing: 3 }}>LOADING…</div>

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }} className="profile-act-grid">
      {/* Threads */}
      <SectionCard title="Recent Threads" tag="FORUM">
        {threads.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px 0', ...M, fontSize: 10, color: 'var(--muted)' }}>No threads yet</div>
        ) : threads.map(t => (
          <Link key={t.id || t._id} to={`/forum/thread/${t.id || t._id}`} style={{ textDecoration: 'none', display: 'block' }}>
            <div style={{ padding: '10px 0', borderBottom: '1px solid var(--border)', transition: 'opacity 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.opacity = '0.7'}
              onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
              <div style={{ ...M, fontSize: 9, color: 'var(--muted)' }}>{ago(t.created_at || t.createdAt)}</div>
            </div>
          </Link>
        ))}
      </SectionCard>

      {/* Replies */}
      <SectionCard title="Recent Replies" tag="FORUM">
        {replies.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px 0', ...M, fontSize: 10, color: 'var(--muted)' }}>No replies yet</div>
        ) : replies.map(r => (
          <div key={r.id || r._id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{r.content || r.body}</div>
            <div style={{ ...M, fontSize: 9, color: 'var(--muted)', marginTop: 3 }}>{ago(r.created_at || r.createdAt)}</div>
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
  const [status, setStatus] = useState(null)
  const [usernameCheck, setUsernameCheck] = useState({ state: 'idle', msg: '' })
  const [emailCheck, setEmailCheck] = useState({ state: 'idle', msg: '' })
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  // Sync form when real user data arrives (e.g. after /auth/me resolves)
  useEffect(() => {
    if (!user?.email) return
    setForm(p => {
      const next = { username: user?.username || '', email: user?.pending_email ? user.email : (user?.email || ''), bio: user?.bio || '', avatar: user?.avatar || '' }
      if (p.username === next.username && p.email === next.email && p.bio === next.bio && p.avatar === next.avatar) return p
      return next
    })
  }, [user?.email, user?.pending_email])

  useEffect(() => {
    const username = (form.username || '').trim()
    if (!username || username.toLowerCase() === String(user?.username || '').toLowerCase()) {
      setUsernameCheck({ state: 'idle', msg: '' })
      return
    }
    if (username.length < 3) {
      setUsernameCheck({ state: 'error', msg: 'Username must be at least 3 characters.' })
      return
    }
    setUsernameCheck({ state: 'checking', msg: 'Checking username...' })
    const timer = setTimeout(() => {
      api.get(`/auth/check-username?username=${encodeURIComponent(username)}`)
        .then(r => {
          setUsernameCheck(r.data?.available
            ? { state: 'ok', msg: 'Username is available.' }
            : { state: 'error', msg: r.data?.suggestion ? `Taken. Try ${r.data.suggestion}.` : 'Username is already taken.' })
        })
        .catch(() => setUsernameCheck({ state: 'error', msg: 'Could not check username.' }))
    }, 350)
    return () => clearTimeout(timer)
  }, [form.username, user?.username])

  useEffect(() => {
    const email = (form.email || '').trim()
    const current = String(user?.email || '').trim().toLowerCase()
    if (!email || email.toLowerCase() === current) {
      setEmailCheck({ state: 'idle', msg: '' })
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailCheck({ state: 'error', msg: 'Enter a valid email address.' })
      return
    }
    setEmailCheck({ state: 'checking', msg: 'Checking email...' })
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
  }, [form.email, user?.email])

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

  return (
    <SectionCard title="Edit Profile" tag="PROFILE">
      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 500 }}>
        <Inp label="USERNAME" id="pf-user" value={form.username} onChange={e => set('username', e.target.value)} placeholder="YourUsername" />
        {usernameCheck.msg && (
          <div style={{ ...M, fontSize: 9, color: usernameCheck.state === 'ok' ? CLRS.green : usernameCheck.state === 'checking' ? CLRS.cyan : CLRS.red, marginTop: -8 }}>
            {usernameCheck.msg}
          </div>
        )}
        {user?.pending_email ? (
          <div style={{ padding: '10px 14px', background: 'rgba(0,229,255,0.07)', border: '1px solid rgba(0,229,255,0.25)', borderRadius: 6, ...M, fontSize: 10, color: CLRS.cyan, lineHeight: 1.7 }}>
            📧 Verification pending for <strong>{user.pending_email}</strong>. Check your inbox (including spam).<br />
            Your email will change after you click the verification link in the email.
          </div>
        ) : (
          <>
            <Inp label="EMAIL" id="pf-email" type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="you@example.com" />
            {emailCheck.msg && (
              <div style={{ ...M, fontSize: 9, color: emailCheck.state === 'ok' ? CLRS.green : emailCheck.state === 'checking' ? CLRS.cyan : CLRS.red, marginTop: -8 }}>
                {emailCheck.msg}
              </div>
            )}
          </>
        )}
        <div>
          <label htmlFor="pf-bio" style={{ ...M, fontSize: 9, letterSpacing: 2, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>BIO</label>
          <textarea id="pf-bio" rows={3} value={form.bio} onChange={e => set('bio', e.target.value)}
            placeholder="Tell us about yourself…"
            style={{ width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)',
              ...M, fontSize: 12, padding: '10px 13px', borderRadius: 6, outline: 'none',
              boxSizing: 'border-box', resize: 'vertical', lineHeight: 1.7,
              transition: 'border-color 0.15s' }}
            onFocus={e => e.target.style.borderColor = 'var(--cyan)'}
            onBlur={e => e.target.style.borderColor = 'var(--border)'} />
        </div>
        <Inp label="AVATAR URL" id="pf-avatar" value={form.avatar} onChange={e => set('avatar', e.target.value)} placeholder="https://…/avatar.png" />
        {status && <StatusMsg msg={status.msg} type={status.type} />}
        <Btn type="submit" disabled={saving || usernameCheck.state === 'error' || usernameCheck.state === 'checking' || emailCheck.state === 'error' || emailCheck.state === 'checking'}>{saving ? 'SAVING…' : 'SAVE CHANGES'}</Btn>
      </form>
    </SectionCard>
  )
}


function ProfileSessionsPanel({ staffAccount }) {
  const dialog = useDialog()
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
    load()
    const beat = setInterval(() => api.post(`${base}/heartbeat`).then(load).catch(() => {}), 30000)
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
    const sec = Math.floor((Date.now() - new Date(d).getTime()) / 1000)
    if (sec < 60) return `${sec}s ago`
    if (sec < 3600) return `${Math.floor(sec/60)}m ago`
    if (sec < 86400) return `${Math.floor(sec/3600)}h ago`
    return new Date(d).toLocaleDateString()
  }
  return (
    <SectionCard title="Active Sessions" tag="SECURITY" action={sessions.length > 1 && <Btn small ghost color={CLRS.red} disabled={revoking==='all'} onClick={() => revoke(null, true)}>REVOKE OTHERS</Btn>}>
      {loading ? <div style={{ ...M, fontSize:10, color:'var(--muted)' }}>Loading sessions...</div> : sessions.length === 0 ? (
        <div style={{ ...M, fontSize:10, color:'var(--muted)', lineHeight:1.7 }}>No session history yet. Sessions are recorded on login and refreshed while you browse.</div>
      ) : sessions.map((sess, i) => (
        <div key={sess.id || i} style={{ display:'flex', gap:12, alignItems:'flex-start', padding:'10px 0', borderBottom:i < sessions.length - 1 ? '1px solid var(--border)' : 'none' }}>
          <div style={{ fontSize:18 }}>{sess.current ? '●' : '□'}</div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ ...M, fontSize:11, color:'var(--text)' }}>{sess.ip || 'Unknown IP'} {sess.current && <Badge label="THIS SESSION" color={CLRS.green} />}</div>
            <div style={{ ...M, fontSize:9, color:'var(--muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginTop:3 }}>{sess.user_agent || 'Unknown browser'}</div>
            <div style={{ ...M, fontSize:9, color:'var(--muted)', marginTop:3 }}>Last active {ago(sess.last_active)} · Login {sess.created_at ? new Date(sess.created_at).toLocaleString() : '—'}</div>
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
        <div style={{ ...M, fontSize:10, color:'var(--muted)' }}>Loading 2FA status...</div>
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
              {state.working && <div style={{ ...M, fontSize:10, color:'var(--muted)' }}>Generating QR code...</div>}
              {state.qr && (
                <>
                  <div style={{ ...M, fontSize:10, color:'var(--muted)', lineHeight:1.7 }}>Scan the QR code, then enter the current code from your app.</div>
                  <div style={{ background:'#fff', padding:12, borderRadius:8, alignSelf:'flex-start' }}>
                    <img src={state.qr} alt="2FA QR code" style={{ width:160, height:160, display:'block' }} />
                  </div>
                  {state.secret && <div style={{ ...M, fontSize:10, color:'var(--muted)', wordBreak:'break-all' }}>Manual key: <span style={{ color:CLRS.cyan, letterSpacing:1, userSelect:'all' }}>{state.secret}</span></div>}
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
              <div style={{ ...M, fontSize:10, color:CLRS.green }}>2FA is active. Your next login will require an authenticator code.</div>
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
  const [oauthStatus, setOauthStatus] = useState(null)
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
      window.location.href = r.data.url
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
    const params = new URLSearchParams(window.location.search)
    const provider = params.get('discord_error') ? 'Discord' : params.get('steam_error') ? 'Steam' : params.get('github_error') ? 'GitHub' : ''
    if (!provider) return
    const err = params.get('discord_error') || params.get('steam_error') || params.get('github_error')
    const messages = {
      duplicate: `${provider} is already linked to another user.`,
      link: `${provider} connect session expired. Please try again.`,
      identity_locked: 'Your active FiveM identity is locked. Contact staff to change OAuth accounts.',
    }
    setOauthStatus({ type: 'error', msg: messages[err] || `${provider} connect failed.` })
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
                  <div style={{ ...M, fontSize: 9, color: provider.linked ? provider.color : 'var(--muted)', marginTop: 3 }}>
                    {provider.linked ? `Connected as ${provider.username || provider.id}` : 'Not connected'}
                  </div>
                  {provider.linked && <div style={{ ...M, fontSize: 8, color: 'var(--muted)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis' }}>{provider.id}</div>}
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
        {identityLocked && <div style={{ ...M, fontSize: 9, color: CLRS.orange, padding: '8px 14px', background: 'rgba(255,107,53,0.07)', border: '1px solid rgba(255,107,53,0.25)', borderRadius: 6, marginTop: 8 }}>🔒 Your active FiveM identity is locked. Contact an admin or open a ticket to change OAuth accounts.</div>}
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
            <div style={{ ...M, fontSize: 9, color: CLRS.red }}>⚠  Passwords don't match</div>
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
              <div style={{ ...M, fontSize: 9, color: 'var(--muted)', marginTop: 3 }}>Sign out of your account on this device</div>
            </div>
            <Btn color={CLRS.orange} ghost onClick={async () => { await logout?.(); navigate('/login') }} small>SIGN OUT</Btn>
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
              <div style={{ ...M, fontSize: 7, letterSpacing: 2, color: 'var(--muted)', marginBottom: 4 }}>{k}</div>
              <div style={{ ...M, fontSize: 12, color: 'var(--text)' }}>{v}</div>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Ticket snapshot */}
      <SectionCard title="Helpdesk Tickets" tag="SUPPORT"
        action={<button type="button" onClick={() => onOpenTicket?.(null)} style={{ ...M, fontSize: 8, letterSpacing: 2, color: CLRS.cyan, textDecoration: 'none', background: 'none', border: 0, cursor: 'pointer' }}>VIEW ALL →</button>}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 16 }}>
          {[
            { label: 'TOTAL',    value: ticketStats.total,    color: CLRS.cyan   },
            { label: 'OPEN',     value: ticketStats.open,     color: CLRS.orange },
            { label: 'RESOLVED', value: ticketStats.resolved, color: CLRS.green  },
          ].map(s => (
            <div key={s.label} style={{ background: 'var(--bg3)', borderTop: `2px solid ${s.color}`,
              border: '1px solid var(--border)', borderRadius: 7, padding: '10px 12px', textAlign: 'center' }}>
              <div style={{ ...M, fontSize: 7, letterSpacing: 2, color: 'var(--muted)', marginBottom: 4 }}>{s.label}</div>
              <div style={{ ...M, fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>
        {recentTickets.length === 0
          ? <div style={{ ...M, fontSize: 10, color: 'var(--muted)', textAlign: 'center', padding: '14px 0' }}>No tickets yet</div>
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
const DISCORD_PURPLE = '#5865F2'
const STEAM_BLUE = '#1b2838'
const STEAM_LIGHT = '#00b4ff'
const GITHUB_COLOR = '#e6edf3'
const WL_STEPS = [
  { key: 'submitted',   label: 'Submitted',    icon: '📋' },
  { key: 'under_review',label: 'Under Review', icon: '🔍' },
  { key: 'approved',    label: 'Approved',     icon: '✅' },
  { key: 'active',      label: 'Active',       icon: '🎮' },
]
const WL_STATUS_MAP = {
  pending:  { step: 1, color: CLRS.yellow,  label: 'PENDING REVIEW'  },
  approved: { step: 2, color: CLRS.green,   label: 'APPROVED'        },
  denied:   { step: 1, color: CLRS.red,     label: 'DENIED'          },
  active:   { step: 3, color: CLRS.green,   label: 'ACTIVE'          },
  syncing:  { step: 2, color: CLRS.cyan,    label: 'SYNCING TO SERVER'},
  sync_failed: { step: 2, color: CLRS.red,  label: 'SYNC FAILED'     },
}

function FiveMTab({ user }) {
  const { refreshUser, logout } = useForum()
  const navigate = useNavigate()
  const dialog = useDialog()
  // status shape: { has_discord: bool, discord_id?, application: obj|null }
  const [status, setStatus]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [actionStatus, setActionStatus] = useState(null)
  const [actionLoading, setActionLoading] = useState('')
  const [formSubmissions, setFormSubmissions] = useState([])
  const [formsLoading, setFormsLoading] = useState(false)

  useEffect(() => {
    const token = getAuthToken()
    if (!token) { setLoading(false); return }
    setFormsLoading(true)
    api.get('/auth/discord/whitelist-status', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => setStatus(r.data))
      .catch(err => {
        const code = err?.response?.status
        if (code === 401) {
          setError('Session expired. Please sign in again.')
        } else if (code !== 404) {
          setError(err?.response?.data?.detail || 'Could not load whitelist status.')
        }
      })
      .finally(() => setLoading(false))
    api.get('/forms/my-submissions', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => setFormSubmissions(Array.isArray(r.data) ? r.data : (r.data?.submissions || [])))
      .catch(() => setFormSubmissions([]))
      .finally(() => setFormsLoading(false))
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('discord_error') === 'duplicate') {
      setActionStatus({ type: 'error', msg: 'That Discord account is already linked to another user.' })
      window.history.replaceState({}, '', window.location.pathname)
      return
    }
    if (params.get('discord_error') === 'link') {
      setActionStatus({ type: 'error', msg: 'Discord connect session expired. Please start from your profile again.' })
      window.history.replaceState({}, '', window.location.pathname)
      return
    }
    if (params.get('discord_error') === 'identity_locked' || params.get('steam_error') === 'identity_locked') {
      setActionStatus({ type: 'error', msg: 'Your player identity is active. Contact an admin or open a ticket to change Discord or Steam.' })
      window.history.replaceState({}, '', window.location.pathname)
      return
    }
    if (params.get('steam_error') === 'duplicate') {
      setActionStatus({ type: 'error', msg: 'That Steam account is already linked to another user.' })
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  if (loading) return (
    <div style={{ padding: '40px 0', textAlign: 'center', ...M, fontSize: 10, color: 'var(--muted)', letterSpacing: 3 }}>LOADING…</div>
  )

  // Derive values from the response shape.
  // status.discord_id is the authoritative source (from DB via /whitelist-status).
  // user.discord_id comes from /me — may be missing if backend was not yet updated.
  const wl              = status?.application ?? null
  const discordId       = status?.discord_id || user?.discord_id || null
  const discordUsername = user?.discord_username || wl?.discord_name || null
  const discordAvatar   = user?.discord_avatar || null
  const discordLinked   = status?.has_discord ?? !!discordId
  const steamId         = user?.steam_id || null
  const steamUsername   = user?.steam_username || null
  const steamAvatar     = user?.steam_avatar || null
  const steamHex        = user?.steam_hex || null
  const steamLinked     = !!steamId
  const hasPassword     = !!user?.has_password
  const identityLocked  = !!(
    user?.active_identity_locked ||
    status?.active_identity_locked ||
    wl?.display_status === 'active' ||
    (wl?.status === 'approved' && wl?.last_played_at)
  )
  const identityLockedMsg = 'Your player identity is active. Contact an admin or open a ticket to change Discord or Steam.'
  const discordAvatarUrl = (() => {
    if (!discordAvatar || !discordId) return ''
    const raw = String(discordAvatar)
    if (/^https?:\/\//i.test(raw)) return raw
    const ext = raw.startsWith('a_') ? 'gif' : 'png'
    return `https://cdn.discordapp.com/avatars/${discordId}/${raw}.${ext}?size=96`
  })()

  const refreshIdentities = async () => {
    await refreshUser?.()
    const token = getAuthToken()
    if (!token) return
    const r = await api.get('/auth/discord/whitelist-status', {
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => null)
    if (r?.data) setStatus(r.data)
  }

  const disconnectProvider = async provider => {
    setActionLoading(provider)
    setActionStatus(null)
    try {
      const route = provider === 'steam'
        ? `${oauthApiBase('steam')}/disconnect`
        : `${oauthApiBase('discord')}/disconnect`
      await api.delete(route)
      await refreshIdentities()
      setActionStatus({ type: 'success', msg: `${provider === 'steam' ? 'Steam' : 'Discord'} disconnected.` })
    } catch (err) {
      setActionStatus({ type: 'error', msg: err?.response?.data?.detail || `Could not disconnect ${provider}.` })
    } finally {
      setActionLoading('')
    }
  }

  const connectSteam = async () => {
    if (identityLocked) { setActionStatus({ type: 'error', msg: identityLockedMsg }); return }
    setActionLoading('steam-connect')
    setActionStatus(null)
    try {
      const r = await api.get(`${oauthApiBase('steam')}/connect-url?dest=${encodeURIComponent('/profile?tab=fivem')}`)
      window.location.href = r.data.url
    } catch (err) {
      setActionStatus({ type: 'error', msg: err?.response?.data?.detail || 'Could not start Steam connect.' })
      setActionLoading('')
    }
  }

  const connectDiscord = async () => {
    if (identityLocked) { setActionStatus({ type: 'error', msg: identityLockedMsg }); return }
    setActionLoading('discord-connect')
    setActionStatus(null)
    try {
      const r = await api.get(`${oauthApiBase('discord')}/connect-url?dest=${encodeURIComponent('/profile?tab=fivem')}`)
      window.location.href = r.data.url
    } catch (err) {
      setActionStatus({ type: 'error', msg: err?.response?.data?.detail || 'Could not start Discord connect.' })
      setActionLoading('')
    }
  }

  const deleteOAuthAccount = async () => {
    if (!await dialog.confirm({ title: 'Delete Account', message: 'Delete this OAuth-only account? This cannot be undone.', variant: 'danger', confirmLabel: 'DELETE' })) return
    setActionLoading('delete')
    setActionStatus(null)
    try {
      await api.delete('/auth/account')
      await logout?.()
      navigate('/login?account_deleted=1')
    } catch (err) {
      setActionStatus({ type: 'error', msg: err?.response?.data?.detail || 'Could not delete account.' })
      setActionLoading('')
    }
  }

  const providerAction = (provider, linked) => {
    if (!linked) return null
    if (identityLocked) {
      return <Btn color={CLRS.orange} ghost small disabled>LOCKED</Btn>
    }
    if (hasPassword) {
      return (
        <Btn
          color={CLRS.orange}
          ghost
          small
          disabled={actionLoading === provider}
          onClick={() => disconnectProvider(provider)}
        >
          {actionLoading === provider ? 'DISCONNECTING...' : 'DISCONNECT'}
        </Btn>
      )
    }
    return (
      <Btn
        color={CLRS.red}
        ghost
        small
        disabled={actionLoading === 'delete'}
        onClick={deleteOAuthAccount}
      >
        {actionLoading === 'delete' ? 'DELETING...' : 'DELETE ACCOUNT'}
      </Btn>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {actionStatus && <StatusMsg msg={actionStatus.msg} type={actionStatus.type} />}
      {identityLocked && <StatusMsg msg={identityLockedMsg} type="error" />}

      <SectionCard title="Server Status" tag="FIVEM">
        <FiveMStatus expanded />
      </SectionCard>

      {/* Discord connection card */}
      <SectionCard title="Discord Account" tag="IDENTITY">
        {discordLinked ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            {discordAvatarUrl ? (
              <img
                src={discordAvatarUrl}
                alt={discordUsername || 'Discord'}
                style={{ width: 44, height: 44, borderRadius: '50%', border: `2px solid ${DISCORD_PURPLE}60` }}
                onError={e => {
                  e.currentTarget.onerror = null
                  e.currentTarget.src = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(discordUsername || user.username || 'Discord')}`
                }}
              />
            ) : (
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: DISCORD_PURPLE + '30',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 18, fontWeight: 700 }}>
                {(discordUsername || user.username || '?')[0].toUpperCase()}
              </div>
            )}
            <div style={{ flex: 1 }}>
              <div style={{ ...M, fontSize: 12, color: 'var(--text)', fontWeight: 700 }}>{discordUsername || 'Discord Account'}</div>
              <div style={{ ...M, fontSize: 9, color: DISCORD_PURPLE, letterSpacing: 1, marginTop: 2 }}>DISCORD ID: {discordId || '—'}</div>
            </div>
            <Badge label="CONNECTED" color={CLRS.green} icon="✓" />
            {providerAction('discord', discordLinked)}
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ ...M, fontSize: 11, color: 'var(--text)', fontWeight: 700, marginBottom: 4 }}>Discord not linked</div>
              <div style={{ ...M, fontSize: 10, color: 'var(--muted)' }}>Link your Discord to apply for whitelist and access FiveM features.</div>
            </div>
            <button
              onClick={connectDiscord}
              disabled={actionLoading === 'discord-connect' || identityLocked}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: DISCORD_PURPLE, border: 'none', borderRadius: 8,
                padding: '10px 20px', color: '#fff', ...M, fontSize: 10, letterSpacing: 2,
                cursor: actionLoading === 'discord-connect' || identityLocked ? 'not-allowed' : 'pointer',
                opacity: actionLoading === 'discord-connect' || identityLocked ? 0.55 : 1,
                transition: 'opacity 0.15s',
              }}
              onMouseEnter={e => { if (actionLoading !== 'discord-connect') e.currentTarget.style.opacity = '0.85' }}
              onMouseLeave={e => { if (actionLoading !== 'discord-connect') e.currentTarget.style.opacity = '1' }}
            >
              <svg width="16" height="16" viewBox="0 0 71 55" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M60.1045 4.8978C55.5792 2.8214 50.7265 1.2916 45.6527 0.41542C45.5603 0.39851 45.468 0.44077 45.4204 0.52529C44.7963 1.6353 44.105 3.0834 43.6209 4.2216C38.1637 3.4046 32.7345 3.4046 27.3892 4.2216C26.905 3.0581 26.1886 1.6353 25.5617 0.52529C25.5141 0.44359 25.4218 0.40133 25.3294 0.41542C20.2584 1.2888 15.4057 2.8186 10.8776 4.8978C10.8384 4.9147 10.8048 4.9429 10.7825 4.9795C1.57795 18.7309 -0.943561 32.1443 0.293408 45.3914C0.299005 45.4562 0.335386 45.5182 0.385761 45.5576C6.45866 50.0174 12.3413 52.7249 18.1147 54.5195C18.2071 54.5477 18.305 54.5139 18.3638 54.4378C19.7295 52.5728 20.9469 50.6063 21.9907 48.5383C22.0523 48.4172 21.9935 48.2735 21.8676 48.2256C19.9366 47.4931 18.0979 46.6 16.3292 45.5858C16.1893 45.5041 16.1781 45.304 16.3068 45.2082C16.679 44.9293 17.0513 44.6391 17.4067 44.3461C17.471 44.2926 17.5606 44.2813 17.6362 44.3151C29.2558 49.6202 41.8354 49.6202 53.3179 44.3151C53.3935 44.2785 53.4831 44.2898 53.5502 44.3433C53.9057 44.6363 54.2779 44.9293 54.6529 45.2082C54.7816 45.304 54.7732 45.5041 54.6333 45.5858C52.8646 46.6197 51.0259 47.4931 49.0921 48.2228C48.9662 48.2707 48.9102 48.4172 48.9718 48.5383C50.038 50.6034 51.2554 52.5699 52.5959 54.435C52.6519 54.5139 52.7526 54.5477 52.845 54.5195C58.6464 52.7249 64.529 50.0174 70.6019 45.5576C70.6551 45.5182 70.6887 45.459 70.6943 45.3942C72.1747 30.0791 68.2147 16.7757 60.1968 4.9823C60.1772 4.9429 60.1437 4.9147 60.1045 4.8978ZM23.7259 37.3253C20.2276 37.3253 17.3451 34.1136 17.3451 30.1693C17.3451 26.225 20.1717 23.0133 23.7259 23.0133C27.308 23.0133 30.1626 26.2532 30.1066 30.1693C30.1066 34.1136 27.28 37.3253 23.7259 37.3253ZM47.3178 37.3253C43.8196 37.3253 40.9371 34.1136 40.9371 30.1693C40.9371 26.225 43.7636 23.0133 47.3178 23.0133C50.9 23.0133 53.7545 26.2532 53.6986 30.1693C53.6986 34.1136 50.9 37.3253 47.3178 37.3253Z" fill="white"/>
              </svg>
              {actionLoading === 'discord-connect' ? 'CONNECTING...' : 'CONNECT DISCORD'}
            </button>
          </div>
        )}
      </SectionCard>

      {/* Steam connection card */}
      <SectionCard title="Steam Account" tag="IDENTITY">
        {steamLinked ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            {steamAvatar ? (
              <img
                src={steamAvatar}
                alt={steamUsername || 'Steam'}
                style={{ width: 44, height: 44, borderRadius: '50%', border: `2px solid ${STEAM_LIGHT}60`, objectFit: 'cover' }}
              />
            ) : (
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: STEAM_BLUE,
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: STEAM_LIGHT, fontSize: 18, fontWeight: 700 }}>
                {(steamUsername || user.username || '?')[0].toUpperCase()}
              </div>
            )}
            <div style={{ flex: 1 }}>
              <div style={{ ...M, fontSize: 12, color: 'var(--text)', fontWeight: 700 }}>{steamUsername || 'Steam Account'}</div>
              <div style={{ ...M, fontSize: 9, color: STEAM_LIGHT, letterSpacing: 1, marginTop: 2 }}>STEAM ID: {steamId || '—'}</div>
              {steamHex && <div style={{ ...M, fontSize: 9, color: 'var(--muted)', letterSpacing: 1, marginTop: 2 }}>{steamHex}</div>}
            </div>
            <Badge label="CONNECTED" color={CLRS.green} icon="✓" />
            {providerAction('steam', steamLinked)}
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ ...M, fontSize: 11, color: 'var(--text)', fontWeight: 700, marginBottom: 4 }}>Steam not linked</div>
              <div style={{ ...M, fontSize: 10, color: 'var(--muted)' }}>Link Steam to keep your FiveM identifier attached to this account.</div>
            </div>
            <button
              onClick={connectSteam}
              disabled={actionLoading === 'steam-connect' || identityLocked}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: STEAM_BLUE, border: `1px solid ${STEAM_LIGHT}55`, borderRadius: 8,
                padding: '10px 20px', color: '#c7d5e0', ...M, fontSize: 10, letterSpacing: 2,
                cursor: actionLoading === 'steam-connect' || identityLocked ? 'not-allowed' : 'pointer', transition: 'opacity 0.15s',
                opacity: actionLoading === 'steam-connect' || identityLocked ? 0.6 : 1,
              }}
              onMouseEnter={e => { if (!e.currentTarget.disabled) e.currentTarget.style.opacity = '0.85' }}
              onMouseLeave={e => { if (!e.currentTarget.disabled) e.currentTarget.style.opacity = '1' }}
            >
              <svg width="16" height="16" viewBox="0 0 233 233" fill="#c7d5e0">
                <path d="M116.5 18C62.7 18 18.8 60.9 18 114.5l52.7 21.8a29.6 29.6 0 0 1 16.6-5c.6 0 1.2 0 1.8.1L112 99.8v-.5c0-21.8 17.7-39.5 39.5-39.5S191 77.5 191 99.3s-17.7 39.5-39.5 39.5l-31.6 23.1c0 .5.1 1 .1 1.5 0 16.4-13.3 29.7-29.7 29.7-14.4 0-26.4-10.3-29.2-23.9L4.4 148.6C14.7 195.8 56.5 231 106.5 231c2.6 0 5.2-.1 7.8-.2C175 227.4 223 176.5 223 115c0-53.7-43.8-97-106.5-97zm-26 152.2c-8.5 3.4-18.1-.7-21.4-9.2s.7-18.1 9.2-21.5l9.2-3.7a21.8 21.8 0 1 0 3 34.4zM151.5 127a27.7 27.7 0 1 1 0-55.4 27.7 27.7 0 0 1 0 55.4zm0-11.1a16.6 16.6 0 1 0 0-33.2 16.6 16.6 0 0 0 0 33.2z"/>
              </svg>
              {actionLoading === 'steam-connect' ? 'CONNECTING...' : 'CONNECT STEAM'}
            </button>
          </div>
        )}
      </SectionCard>

      {/* Whitelist application status */}
      <SectionCard title="Whitelist Application" tag="FIVEM">
        {error && (
          <div style={{ ...M, fontSize: 11, color: CLRS.red, padding: '10px 14px',
            background: 'rgba(255,71,87,0.07)', border: '1px solid rgba(255,71,87,0.25)', borderRadius: 6, marginBottom: 14 }}>
            ⚠  {error}
          </div>
        )}

        {!error && !wl && (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
            <div style={{ ...M, fontSize: 11, color: 'var(--muted)', marginBottom: 16 }}>No whitelist application found.</div>
            {discordLinked ? (
              <a href="/whitelist" style={{ display: 'inline-block', ...M, fontSize: 10, letterSpacing: 2,
                color: CLRS.green, padding: '9px 20px', border: `1px solid ${CLRS.green}55`, borderRadius: 7, textDecoration: 'none' }}>
                APPLY NOW →
              </a>
            ) : (
              <div style={{ ...M, fontSize: 10, color: 'var(--muted)' }}>Link your Discord first to apply.</div>
            )}
          </div>
        )}

        {wl && (() => {
          const playedAt = wl.last_played_at || wl.last_seen_at || wl.played_at || null
          const effectiveStatus = wl.display_status || (wl.status === 'approved' && playedAt ? 'active' : wl.status)
          const st = WL_STATUS_MAP[effectiveStatus] || WL_STATUS_MAP.pending
          const activeStep = st.step
          return (
            <div>
              {/* Progress stepper */}
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24, gap: 0 }}>
                {WL_STEPS.map((step, i) => {
                  const done = i < activeStep
                  const current = i === activeStep
                  const color = done || current ? (effectiveStatus === 'denied' && i === 1 ? CLRS.red : CLRS.green) : 'var(--border)'
                  return (
                    <React.Fragment key={step.key}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flex: 1 }}>
                        <div style={{ width: 36, height: 36, borderRadius: '50%',
                          background: done || current ? color + '20' : 'var(--bg3)',
                          border: `2px solid ${done || current ? color : 'var(--border)'}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 16, transition: 'all 0.3s',
                          boxShadow: current ? `0 0 12px ${color}55` : 'none',
                        }}>
                          {step.icon}
                        </div>
                        <div style={{ ...M, fontSize: 8, letterSpacing: 1,
                          color: done || current ? color : 'var(--muted)',
                          textAlign: 'center', maxWidth: 70 }}>
                          {step.label.toUpperCase()}
                        </div>
                      </div>
                      {i < WL_STEPS.length - 1 && (
                        <div style={{ flex: 1, height: 2, background: i < activeStep ? CLRS.green : 'var(--border)',
                          transition: 'background 0.3s', marginBottom: 22 }} />
                      )}
                    </React.Fragment>
                  )
                })}
              </div>

              {/* Status badge */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16,
                padding: '12px 16px', background: st.color + '10', border: `1px solid ${st.color}40`, borderRadius: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: st.color,
                  boxShadow: `0 0 8px ${st.color}`, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ ...M, fontSize: 11, color: st.color, fontWeight: 700, letterSpacing: 1 }}>{st.label}</div>
                  {wl.status === 'denied' && wl.denial_reason && (
                    <div style={{ ...M, fontSize: 10, color: 'var(--muted)', marginTop: 3 }}>Reason: {wl.denial_reason}</div>
                  )}
                  {effectiveStatus === 'active' && playedAt && (
                    <div style={{ ...M, fontSize: 10, color: 'var(--muted)', marginTop: 3 }}>
                      Last played {ago(playedAt)}{wl.last_played_name ? ` as ${wl.last_played_name}` : ''}
                    </div>
                  )}
                </div>
                {wl.submitted_at && (
                  <div style={{ ...M, fontSize: 9, color: 'var(--muted)' }}>Submitted {ago(wl.submitted_at)}</div>
                )}
              </div>

              {/* Application details */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }} className="profile-grid-2">
                {[
                  ['CHARACTER', wl.character_name || '—'],
                  ['FIVEM ID',  wl.fivem_id       || '—'],
                  ['DISCORD',   wl.discord_name   || '—'],
                  ['SERVER',    wl.txadmin_synced ? '✓ Synced' : '⏳ Pending'],
                  ['LAST PLAYED', playedAt ? new Date(playedAt).toLocaleString() : '—'],
                  ['PRIORITY',  Number(wl.priority_level || 0) > 0
                    ? `${wl.priority_tier || 'Priority'} (${wl.priority_level})${wl.priority_expires_at ? ' until ' + new Date(wl.priority_expires_at).toLocaleDateString() : ''}`
                    : '—'],
                ].map(([k, v]) => (
                  <div key={k} style={{ padding: '9px 12px', background: 'var(--bg3)', borderRadius: 6, border: '1px solid var(--border)' }}>
                    <div style={{ ...M, fontSize: 7, letterSpacing: 2, color: 'var(--muted)', marginBottom: 3 }}>{k}</div>
                    <div style={{ ...M, fontSize: 11, color: 'var(--text)' }}>{v}</div>
                  </div>
                ))}
              </div>

              {/* Re-apply if denied */}
              {wl.status === 'denied' && (
                <div style={{ marginTop: 16, textAlign: 'center' }}>
                  <a href="/whitelist" style={{ display: 'inline-block', ...M, fontSize: 10, letterSpacing: 2,
                    color: CLRS.cyan, padding: '9px 20px', border: `1px solid ${CLRS.cyan}55`, borderRadius: 7, textDecoration: 'none' }}>
                    SUBMIT NEW APPLICATION →
                  </a>
                </div>
              )}
            </div>
          )
        })()}
      </SectionCard>

      <SectionCard title="Applications" tag="FORMS">
        {formsLoading ? (
          <div style={{ ...M, fontSize: 10, color: 'var(--muted)', letterSpacing: 2, padding: '16px 0', textAlign: 'center' }}>LOADING APPLICATIONS...</div>
        ) : formSubmissions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '18px 0' }}>
            <div style={{ ...M, fontSize: 11, color: 'var(--muted)', marginBottom: 12 }}>No community applications submitted yet.</div>
            <a href="/forms" style={{ ...M, fontSize: 10, color: CLRS.cyan, letterSpacing: 2, textDecoration: 'none' }}>BROWSE FORMS {'->'}</a>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {formSubmissions.map(sub => {
              const stKey = sub.display_status || sub.status || 'pending'
              const st = WL_STATUS_MAP[stKey] || WL_STATUS_MAP.pending
              return (
                <div key={sub.id} style={{ padding: 13, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
                    <div>
                      <div style={{ ...M, fontSize: 12, color: 'var(--text)', fontWeight: 700 }}>{sub.form_title || sub.form_slug || 'Application'}</div>
                      <div style={{ ...M, fontSize: 9, color: 'var(--muted)', marginTop: 3 }}>Submitted {sub.created_at ? ago(sub.created_at) : '-'}</div>
                    </div>
                    <Badge label={st.label || stKey.toUpperCase()} color={st.color || CLRS.cyan} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 8 }}>
                    {[
                      ['STATUS', stKey],
                      ['ACTION', sub.action_status || 'not queued'],
                      ['LAST ACTIVE', sub.last_active_at ? `${ago(sub.last_active_at)}${sub.last_active_name ? ` as ${sub.last_active_name}` : ''}` : '-'],
                      ['REVIEW NOTE', sub.reviewer_note || '-'],
                    ].map(([k, v]) => (
                      <div key={k} style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, background: 'rgba(255,255,255,0.02)' }}>
                        <div style={{ ...M, fontSize: 7, letterSpacing: 2, color: 'var(--muted)', marginBottom: 3 }}>{k}</div>
                        <div style={{ ...M, fontSize: 10, color: 'var(--text)' }}>{v}</div>
                      </div>
                    ))}
                  </div>
                  {sub.action_sync_error && <StatusMsg msg={sub.action_sync_error} type="error" />}
                </div>
              )
            })}
          </div>
        )}
      </SectionCard>
    </div>
  )
}

/* ─── Orders & Documents tab ─────────────────────────────────────────────── */
function OrdersDocumentsTab({ user }) {
  const toast = useToast()
  const [orders, setOrders] = useState([])
  const [ordersLoading, setOrdersLoading] = useState(true)
  const [detail, setDetail] = useState(null)
  const [docs, setDocs] = useState([])
  const [docsLoading, setDocsLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [docName, setDocName] = useState('')
  const [docCategory, setDocCategory] = useState('other')

  const statusColor = s =>
    s === 'delivered' || s === 'paid' ? CLRS.green
    : s === 'cancelled' || s === 'refunded' ? CLRS.red
    : s === 'shipped' ? CLRS.purple
    : s === 'processing' ? CLRS.cyan : CLRS.orange

  const inputStyle = {
    flex: 1, minWidth: 160, padding: '9px 12px', fontSize: 12, color: 'var(--text)',
    background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, outline: 'none',
  }
  const ghostBtn = {
    background: 'none', border: '1px solid var(--border)', color: 'var(--muted)',
    fontSize: 9, letterSpacing: 1, padding: '6px 10px', borderRadius: 5, cursor: 'pointer',
  }

  const loadOrders = () => {
    setOrdersLoading(true)
    api.get('/store/orders')
      .then(r => setOrders(Array.isArray(r.data) ? r.data : []))
      .catch(() => setOrders([]))
      .finally(() => setOrdersLoading(false))
  }
  const loadDocs = () => {
    setDocsLoading(true)
    api.get('/documents')
      .then(r => setDocs(Array.isArray(r.data) ? r.data : []))
      .catch(() => setDocs([]))
      .finally(() => setDocsLoading(false))
  }
  useEffect(() => { loadOrders(); loadDocs() }, [user?.id])

  const openDetail = async (o) => {
    try {
      const r = await api.get(`/store/orders/${o.order_number}`)
      setDetail(r.data || o)
    } catch { setDetail(o) }
  }

  const onUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const fd = new FormData()
    fd.append('file', file)
    if (docName.trim()) fd.append('name', docName.trim())
    fd.append('category', docCategory || 'other')
    try {
      await api.post('/documents', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      toast.success('Document uploaded')
      setDocName('')
      loadDocs()
    } catch (err) {
      toast.error(err?.response?.data?.detail || err?.response?.data?.error || 'Upload failed')
    } finally { setUploading(false); e.target.value = '' }
  }

  const onDelete = async (id) => {
    if (!window.confirm('Delete this document?')) return
    try {
      await api.delete(`/documents/${id}`)
      toast.success('Document deleted')
      loadDocs()
    } catch (err) { toast.error(err?.response?.data?.detail || 'Delete failed') }
  }

  const downloadDoc = async (id, name) => {
    try {
      const r = await api.get(`/documents/${id}/content`, { responseType: 'blob' })
      const url = URL.createObjectURL(r.data)
      const a = document.createElement('a')
      a.href = url; a.download = name || 'document'; a.click()
      setTimeout(() => URL.revokeObjectURL(url), 4000)
    } catch (err) { toast.error(err?.response?.data?.detail || 'Download failed') }
  }

  return (
    <div>
      <SectionCard title="My Orders" tag="ORDER TRACKER">
        {ordersLoading ? <div className="loader" /> : orders.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--muted)', padding: '8px 0' }}>No orders yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {orders.map(o => (
              <div key={o.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', cursor: 'pointer' }} onClick={() => openDetail(o)}>
                  <span style={{ ...M, fontSize: 11, color: CLRS.cyan, fontWeight: 700 }}>{o.order_number}</span>
                  <span style={{ fontSize: 10, color: 'var(--muted)' }}>{o.created_at ? new Date(o.created_at).toLocaleDateString() : ''}</span>
                  <span style={{ flex: 1 }} />
                  <span style={{ ...M, fontSize: 12, fontWeight: 800 }}>${(o.total_cents / 100).toFixed(2)}</span>
                  <span style={{ ...M, fontSize: 8, letterSpacing: 1.5, padding: '3px 10px', borderRadius: 12, border: `1px solid ${statusColor(o.status)}55`, color: statusColor(o.status), fontWeight: 800 }}>{(o.status || '').toUpperCase()}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                  {(o.items || []).map((it, i) => (
                    <span key={i} style={{ fontSize: 10, color: 'var(--muted)', background: 'rgba(255,255,255,0.03)', padding: '3px 8px', borderRadius: 5 }}>{it.product_name} × {it.quantity}</span>
                  ))}
                </div>
                {o.tracking_number && (
                  <div style={{ ...M, fontSize: 10, color: 'var(--muted)', marginTop: 8 }}>
                    📦 {o.carrier || 'Carrier'}: {o.tracking_number}
                    {o.tracking_url && <a href={o.tracking_url} target="_blank" rel="noreferrer" style={{ color: CLRS.cyan, marginLeft: 8 }}>TRACK ↗</a>}
                  </div>
                )}
                {(o.downloads || []).length > 0 && (
                  <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {o.downloads.map(d => (
                      <a key={d.id} href={`/api/store/downloads/${d.token}`} target="_blank" rel="noreferrer"
                        style={{ fontSize: 10, color: CLRS.green, border: `1px solid ${CLRS.green}40`, borderRadius: 5, padding: '4px 8px', textDecoration: 'none' }}>
                        ⬇ {d.filename || d.product_name} ({d.downloads_used}/{d.downloads_allowed})
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {detail && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }} onClick={() => setDetail(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ ...M, fontSize: 12, letterSpacing: 2, color: CLRS.green, fontWeight: 800 }}>{detail.order_number}</div>
              <span style={{ ...M, fontSize: 8, letterSpacing: 1.5, padding: '3px 10px', borderRadius: 12, border: `1px solid ${CLRS.cyan}55`, color: CLRS.cyan, fontWeight: 800 }}>{(detail.status || '').toUpperCase()}</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 12 }}>
              Placed {detail.created_at ? new Date(detail.created_at).toLocaleString() : '—'}
              {(detail.carrier || detail.tracking_number) && <div style={{ marginTop: 4 }}>📦 {detail.carrier || ''} {detail.tracking_number || ''}</div>}
            </div>
            <div style={{ ...M, fontSize: 7, letterSpacing: 2, color: CLRS.cyan, marginBottom: 6, fontWeight: 800 }}>STATUS TIMELINE</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
              {(detail.events || []).length === 0 ? (
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>No updates yet.</span>
              ) : detail.events.map((ev, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 11 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', marginTop: 4, background: CLRS.green, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ color: 'var(--text)', fontWeight: 700 }}>{(ev.status || '').toUpperCase()}</div>
                    {ev.note && <div style={{ color: 'var(--muted)', fontSize: 10 }}>{ev.note}</div>}
                    <div style={{ color: 'var(--muted)', fontSize: 9 }}>{ev.created_at ? new Date(ev.created_at).toLocaleString() : ''}</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ ...M, fontSize: 7, letterSpacing: 2, color: CLRS.cyan, marginBottom: 6, fontWeight: 800 }}>ITEMS</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
              {(detail.items || []).map((it, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                  <span style={{ color: 'var(--text)' }}>{it.product_name} × {it.quantity}</span>
                  <span style={{ color: 'var(--muted)' }}>${((it.line_total_cents || 0) / 100).toFixed(2)}</span>
                </div>
              ))}
            </div>
            <div style={{ ...M, fontSize: 7, letterSpacing: 2, color: CLRS.cyan, marginBottom: 6, fontWeight: 800 }}>DOWNLOADS</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
              {(detail.downloads || []).length === 0 ? (
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>None</span>
              ) : detail.downloads.map(d => (
                <a key={d.id} href={`/api/store/downloads/${d.token}`} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: CLRS.green, textDecoration: 'none' }}>
                  ⬇ {d.filename || d.product_name} ({d.downloads_used}/{d.downloads_allowed})
                </a>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setDetail(null)} style={ghostBtn}>CLOSE</button>
            </div>
          </div>
        </div>
      )}

      <SectionCard title="Documents" tag="PROFILE FILES" action={
        <label style={{ ...M, fontSize: 8, letterSpacing: 2, fontWeight: 800, padding: '8px 14px', color: '#000', background: 'var(--green)', borderRadius: 6, cursor: 'pointer' }}>
          {uploading ? 'UPLOADING…' : '+ UPLOAD'}
          <input type="file" hidden onChange={onUpload} />
        </label>
      }>
        <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          <input value={docName} onChange={e => setDocName(e.target.value)} placeholder="Document name (optional)" style={inputStyle} />
          <select value={docCategory} onChange={e => setDocCategory(e.target.value)} style={{ ...inputStyle, maxWidth: 140 }}>
            {['other', 'id', 'license', 'proof', 'contract'].map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        {docsLoading ? <div className="loader" /> : docs.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--muted)', padding: '8px 0' }}>No documents uploaded yet. Upload an ID, license or proof document above.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {docs.map(d => (
              <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px' }}>
                <span style={{ fontSize: 14 }}>📄</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: 'var(--text)', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</div>
                  <div style={{ fontSize: 9, color: 'var(--muted)' }}>
                    {d.category} · {d.mime_type} · {d.file_size ? (d.file_size / 1024).toFixed(1) + ' KB' : '—'} · {d.created_at ? new Date(d.created_at).toLocaleDateString() : ''}
                  </div>
                </div>
                <button onClick={() => downloadDoc(d.id, d.name)} style={ghostBtn}>⬇</button>
                <button onClick={() => onDelete(d.id)} style={{ ...ghostBtn, color: CLRS.red, borderColor: CLRS.red + '55' }}>✕</button>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  )
}

/* ─── Main ForumProfile page ─────────────────────────────────────────────── */
const TABS = [
  { key: 'overview',  label: '⊞ Overview',        },
  { key: 'tickets',   label: '🎫 My Tickets',     },
  { key: 'orders',    label: '🧾 Orders & Docs',  },
  { key: 'activity',  label: '💬 Forum Activity', },
  { key: 'fivem',     label: '🎮 FiveM',          },
  { key: 'edit',      label: '✎ Edit Profile',   },
  { key: 'security',  label: '🔒 Security',       },
]

export default function ForumProfile() {
  const { user: ctxUser, loading: forumLoading } = useForum()
  const navigate = useNavigate()
  const [user, setUser]     = useState(null)
  const [tickets, setTickets] = useState([])
  const [tab, setTab]       = useState(() => {
    if (typeof window === 'undefined') return 'overview'
    const params = new URLSearchParams(window.location.search)
    if (params.get('ticket')) return 'tickets'
    const requested = params.get('tab')
    return TABS.some(t => t.key === requested) ? requested : 'overview'
  })
  const [profileTicketId, setProfileTicketId] = useState(() => {
    if (typeof window === 'undefined') return null
    return new URLSearchParams(window.location.search).get('ticket')
  })
  const [loading, setLoading] = useState(true)
  const loadedTicketsForRef = useRef(null)

  useEffect(() => {
    if (forumLoading) return
    if (!ctxUser) { navigate('/login?tab=signin&next=%2Fprofile'); return }
    setUser(ctxUser)
    setLoading(false)
    // Load tickets for overview
    if (ctxUser.email && loadedTicketsForRef.current !== ctxUser.email) {
      loadedTicketsForRef.current = ctxUser.email
      api.get('/helpdesk/tickets/mine')
        .then(r => setTickets(Array.isArray(r.data) ? r.data : []))
        .catch(() => { loadedTicketsForRef.current = null })
    }
  }, [ctxUser, forumLoading, navigate])

  const updateProfileUrl = useCallback((nextTab, ticketId) => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (nextTab && nextTab !== 'overview') params.set('tab', nextTab)
    else params.delete('tab')
    if (ticketId) params.set('ticket', ticketId)
    else params.delete('ticket')
    const query = params.toString()
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`)
  }, [])

  const selectTab = useCallback((nextTab) => {
    setTab(nextTab)
    if (nextTab !== 'tickets') setProfileTicketId(null)
    updateProfileUrl(nextTab, nextTab === 'tickets' ? profileTicketId : null)
  }, [profileTicketId, updateProfileUrl])

  const openTicket = useCallback((ticketId) => {
    setTab('tickets')
    setProfileTicketId(ticketId || null)
    updateProfileUrl('tickets', ticketId || null)
  }, [updateProfileUrl])

  useEffect(() => {
    const onPop = () => {
      const params = new URLSearchParams(window.location.search)
      const requested = params.get('tab')
      const ticketId = params.get('ticket')
      setTab(ticketId ? 'tickets' : TABS.some(t => t.key === requested) ? requested : 'overview')
      setProfileTicketId(ticketId)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  if (loading || !user) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', ...M, fontSize: 10, letterSpacing: 3, color: 'var(--muted)' }}>LOADING PROFILE…</div>
  }

  const roleCfg = {
    admin:     { color: CLRS.red,    label: 'ADMIN'     },
    moderator: { color: CLRS.orange, label: 'MODERATOR' },
    editor:    { color: CLRS.purple, label: 'EDITOR'    },
    user:      { color: CLRS.cyan,   label: 'MEMBER'    },
    member:    { color: CLRS.cyan,   label: 'MEMBER'    },
  }
  const role = roleCfg[user.role] || { color: CLRS.cyan, label: (user.role || 'MEMBER').toUpperCase() }

  return (
    <div style={{ minHeight: '100vh', paddingTop: 80 }}>
      <style>{`
        .profile-act-grid  { grid-template-columns: 1fr 1fr !important; }
        .profile-grid-2    { grid-template-columns: 1fr 1fr !important; }
        @media (max-width: 900px) {
          .profile-layout   { grid-template-columns: 1fr !important; }
          .profile-act-grid { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 600px) {
          .profile-grid-2   { grid-template-columns: 1fr !important; }
          .profile-tabs-row { flex-direction: column !important; }
        }
      `}</style>

      {/* ── Hero banner ── */}
      <div style={{ borderBottom: '1px solid var(--border)', position: 'relative', overflow: 'hidden' }} className="profile-hero">
        {/* Grid bg */}
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(0,212,255,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(0,212,255,0.03) 1px,transparent 1px)', backgroundSize: '40px 40px', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: -80, right: -80, width: 320, height: 320, borderRadius: '50%', background: 'radial-gradient(circle,rgba(0,255,136,0.06) 0%,transparent 70%)', pointerEvents: 'none' }} />

        <div className="profile-hero-inner">
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 24, flexWrap: 'wrap', position: 'relative', zIndex: 1 }}>
            {/* Avatar */}
            <div style={{ position: 'relative' }}>
              <Avatar user={user} size={88} />
              <div style={{ position: 'absolute', bottom: 2, right: 2, width: 14, height: 14, borderRadius: '50%',
                background: CLRS.green, border: '2px solid var(--bg)', boxShadow: `0 0 6px ${CLRS.green}` }} />
            </div>

            {/* Info */}
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
                <h1 style={{ ...D, fontSize: 28, fontWeight: 800, margin: 0, letterSpacing: -0.5 }}>{user.username}</h1>
                <Badge label={role.label} color={role.color} />
              </div>
              {user.bio && <p style={{ ...M, fontSize: 11, color: 'var(--muted)', margin: 0, lineHeight: 1.6, maxWidth: 420 }}>{user.bio}</p>}
              <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
                <span style={{ ...M, fontSize: 9, color: 'var(--muted)' }}>📧 {user.email || '—'}</span>
                <span style={{ ...M, fontSize: 9, color: 'var(--muted)' }}>🕒 Last seen {ago(user.last_seen)}</span>
                <span style={{ ...M, fontSize: 9, color: 'var(--muted)' }}>📅 Joined {user.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}</span>
              </div>
            </div>

            {/* Quick stats */}
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              {[
                { label: 'TICKETS', value: tickets.length, color: CLRS.cyan   },
                { label: 'OPEN',    value: tickets.filter(t => t.status === 'open').length, color: CLRS.orange },
              ].map(s => (
                <div key={s.label} onClick={() => openTicket(null)} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', textAlign: 'center', cursor: 'pointer', transition: 'border-color 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = s.color}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
                  <div style={{ ...M, fontSize: 7, letterSpacing: 2, color: 'var(--muted)', marginBottom: 4 }}>{s.label}</div>
                  <div style={{ ...M, fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</div>
                </div>
              ))}
              {canAccessAdminPortal(user) && <AdminPortalLink compact />}
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 0, marginTop: 28, borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }} className="profile-tabs-row">
            {TABS.map(t => (
              <button key={t.key} onClick={() => selectTab(t.key)} style={{
                ...M, fontSize: 10, letterSpacing: 1, padding: '10px 18px', background: 'none', border: 'none',
                borderBottom: `2px solid ${tab === t.key ? 'var(--cyan)' : 'transparent'}`,
                color: tab === t.key ? 'var(--cyan)' : 'var(--muted)', cursor: 'pointer',
                transition: 'all 0.15s', whiteSpace: 'nowrap',
              }}>{t.label}</button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="profile-body">
        {tab === 'overview'  && <OverviewTab user={user} tickets={tickets} onOpenTicket={openTicket} />}
        {tab === 'tickets'   && <MyTicketsTab user={user} initialTicketId={profileTicketId} onTicketViewChange={openTicket} />}
        {tab === 'orders'    && <OrdersDocumentsTab user={user} />}
        {tab === 'activity'  && <ActivityTab user={user} />}
        {tab === 'fivem'     && <FiveMTab user={user} />}
        {tab === 'edit'      && <ProfileEditTab user={user} onUpdate={u => setUser(prev => ({ ...prev, ...u }))} />}
        {tab === 'security'  && <SecurityTab user={user} />}
      </div>

      <style>{`
        .profile-hero       { padding: 0; }
        .profile-hero-inner { padding: 44px 60px 0; max-width: 1200px; margin: 0 auto; }
        .profile-body       { max-width: 1200px; margin: 0 auto; padding: 32px 60px 80px; }
        @media (max-width: 900px) {
          .profile-hero-inner { padding: 32px 24px 0; }
          .profile-body       { padding: 24px 24px 60px; }
        }
        @media (max-width: 600px) {
          .profile-hero-inner { padding: 24px 16px 0; }
          .profile-body       { padding: 16px 16px 48px; }
        }
      `}</style>
    </div>
  )
}
