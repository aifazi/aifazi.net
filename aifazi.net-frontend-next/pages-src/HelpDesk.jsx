'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import api from '@/lib/api'
import { notify } from '../core/notify.jsx'
import { useForum } from '../context/ForumContext'
import { Select } from '../core/ui.jsx'
import { getSupabase } from '@/lib/supabase'

const mono = { fontFamily: 'var(--font-mono)' }
const card = { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '20px 24px' }

function StatusBadge({ status }) {
  const map = {
    open:        { color: '#ff6b35', bg: 'rgba(255,107,53,0.1)',  border: 'rgba(255,107,53,0.35)'  },
    'in-progress':{ color: '#00d4ff', bg: 'rgba(0,212,255,0.1)', border: 'rgba(0,212,255,0.35)'  },
    resolved:    { color: '#00ff88', bg: 'rgba(0,255,136,0.1)',  border: 'rgba(0,255,136,0.35)'  },
    closed:      { color: '#5a7a95', bg: 'rgba(90,122,149,0.1)', border: 'rgba(90,122,149,0.35)'  },
    pending:     { color: '#a855f7', bg: 'rgba(168,85,247,0.1)', border: 'rgba(168,85,247,0.35)'  },
  }
  const s = map[status] || map.open
  return (
    <span style={{ ...mono, fontSize: 9, letterSpacing: 2, padding: '3px 8px',
      color: s.color, background: s.bg, border: `1px solid ${s.border}`, borderRadius: 4 }}>
      {(status || 'open').toUpperCase().replace('-', ' ')}
    </span>
  )
}

function PriorityDot({ priority }) {
  const colors = { critical: '#ff4757', high: '#ff6b35', medium: '#ffd700', low: '#00ff88' }
  return (
    <span title={priority} style={{
      display: 'inline-block', width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
      background: colors[priority] || '#888', boxShadow: `0 0 5px ${colors[priority] || '#888'}88`,
    }} />
  )
}

function PriorityBadge({ priority }) {
  const colors = { critical: '#ff4757', high: '#ff6b35', medium: '#ffd700', low: '#00ff88' }
  return (
    <span style={{ ...mono, fontSize: 8, letterSpacing: 2, padding: '2px 10px',
      color: '#fff', background: colors[priority] || '#888', borderRadius: 4, fontWeight: 700 }}>
      {priority?.toUpperCase()}
    </span>
  )
}

const inputStyle = {
  width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)',
  color: 'var(--text)', ...mono, fontSize: 13, padding: '10px 14px',
  outline: 'none', borderRadius: 6, boxSizing: 'border-box', transition: 'border-color 0.2s',
}
const labelStyle = { ...mono, fontSize: 9, letterSpacing: 2, color: 'var(--muted)', display: 'block', marginBottom: 6 }

// ── Message Bubble ─────────────────────────────────────────
function MessageBubble({ msg }) {
  const isStaff = msg.author_type === 'staff'
  const isSystem = msg.author_type === 'system'
  const isUser = msg.author_type === 'user'
  return (
    <div style={{
      display: 'flex', justifyContent: isStaff ? 'flex-start' : 'flex-end', marginBottom: 12,
    }}>
      <div style={{
        maxWidth: '80%',
        background: isSystem ? 'rgba(168,85,247,0.08)' : isStaff ? 'rgba(0,212,255,0.06)' : 'rgba(0,255,136,0.06)',
        border: `1px solid ${
          isSystem ? 'rgba(168,85,247,0.2)' : isStaff ? 'rgba(0,212,255,0.2)' : 'rgba(0,255,136,0.2)'
        }`,
        borderRadius: 10, padding: '12px 16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{
            ...mono, fontSize: 9, letterSpacing: 2,
            color: isSystem ? '#a855f7' : isStaff ? 'var(--cyan)' : 'var(--green)',
            fontWeight: 700,
          }}>
            {isSystem ? 'SYSTEM' : isStaff ? 'STAFF' : 'YOU'}
          </span>
          <span style={{ ...mono, fontSize: 8, color: 'var(--muted)' }}>
            {msg.author_name}
          </span>
          <span style={{ ...mono, fontSize: 8, color: 'var(--muted)', marginLeft: 'auto' }}>
            {msg.created_at ? new Date(msg.created_at).toLocaleString() : ''}
          </span>
        </div>
        <div style={{
          ...mono, fontSize: 12, color: 'var(--text)', lineHeight: 1.7,
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}>
          {msg.message}
        </div>
      </div>
    </div>
  )
}

// ── Ticket Detail View ─────────────────────────────────────
function TicketDetail({ ticketId, onBack, accessEmail = '' }) {
  const { user } = useForum()
  const [ticket, setTicket] = useState(null)
  const [loading, setLoading] = useState(true)
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const [mounted, setMounted] = useState(false)
  const msgListRef = useRef(null)
  const [atBottom, setAtBottom] = useState(true)

  useEffect(() => { setMounted(true) }, [])

  const fetchTicket = useCallback(async () => {
    try {
      const r = await api.get(`/helpdesk/tickets/${ticketId}`)
      setTicket(r.data)
    } catch {}
  }, [ticketId])

  useEffect(() => {
    setLoading(true)
    fetchTicket().finally(() => setLoading(false))
  }, [fetchTicket])

  useEffect(() => {
    if (!ticket) return
    const id = setInterval(fetchTicket, 10_000)
    return () => clearInterval(id)
  }, [fetchTicket, ticket])

  // Supabase Realtime for ticket messages/status, with polling above as local fallback.
  // Only subscribed for an authenticated user — anon Realtime on helpdesk rows is
  // denied by RLS anyway, so gate it here too (defense in depth + fewer sockets).
  useEffect(() => {
    if (!mounted || !ticketId || !user) return
    const sb = getSupabase()
    if (!sb) return
    const channel = sb.channel(`helpdesk:${ticketId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'helpdesk_messages', filter: `ticket_id=eq.${ticketId}` },
        () => fetchTicket()
      )
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'helpdesk_tickets', filter: `id=eq.${ticketId}` },
        () => fetchTicket()
      )
      .subscribe()
    return () => { sb.removeChannel(channel) }
  }, [mounted, ticketId, fetchTicket])

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
      fetchTicket()
      setTimeout(() => msgListRef.current?.scrollTo({ top: msgListRef.current.scrollHeight, behavior: 'smooth' }), 100)
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

  if (loading) return <div style={{ ...card, textAlign: 'center', ...mono, fontSize: 10, color: 'var(--muted)', letterSpacing: 3, padding: 40 }}>LOADING...</div>
  if (!ticket) return <div style={{ ...card, textAlign: 'center', ...mono, fontSize: 11, color: 'var(--orange)' }}>Ticket not found</div>

  const STATUS_CFG = {
    open: { color: '#ff6b35', label: 'OPEN' },
    'in-progress': { color: '#00d4ff', label: 'IN PROGRESS' },
    resolved: { color: '#00ff88', label: 'RESOLVED' },
    closed: { color: '#5a7a95', label: 'CLOSED' },
    pending: { color: '#a855f7', label: 'PENDING' },
  }
  const sc = STATUS_CFG[ticket.status] || STATUS_CFG.open
  const messages = ticket.messages || []
  const canReply = ticket.status !== 'resolved' && ticket.status !== 'closed'

  return (
    <div>
      <button onClick={onBack} style={{
        ...mono, fontSize: 10, letterSpacing: 1, color: 'var(--cyan)',
        background: 'none', border: '1px solid rgba(0,212,255,0.2)', borderRadius: 6,
        padding: '8px 16px', cursor: 'pointer', marginBottom: 16,
      }}>
        ← BACK TO TICKETS
      </button>

      <div style={card}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <div>
            <div style={{ ...mono, fontSize: 9, letterSpacing: 3, color: 'var(--cyan)', marginBottom: 4 }}>
              TICKET #{ticket.ticket_id || (ticket.id || '').slice(-6).toUpperCase()}
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{ticket.subject}</h3>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <PriorityBadge priority={ticket.priority} />
            <StatusBadge status={ticket.status} />
          </div>
        </div>

        {/* Meta */}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', ...mono, fontSize: 10, color: 'var(--muted)', marginBottom: 16, padding: '10px 14px', background: 'var(--bg3)', borderRadius: 6 }}>
          <span>Category: <span style={{ color: 'var(--text)' }}>{ticket.category}</span></span>
          <span>Submitted: <span style={{ color: 'var(--text)' }}>{ticket.created_at ? new Date(ticket.created_at).toLocaleString() : ''}</span></span>
          <span>Messages: <span style={{ color: 'var(--text)' }}>{ticket.message_count || messages.length}</span></span>
          {ticket.responded_by && <span>Last reply: <span style={{ color: 'var(--cyan)' }}>{ticket.responded_by}</span></span>}
        </div>

        {/* Messages Thread */}
        <div style={{ marginBottom: canReply ? 16 : 0, position:'relative' }}>
          <div style={{ ...mono, fontSize: 9, letterSpacing: 3, color: 'var(--muted)', marginBottom: 12 }}>DISCUSSION</div>
          <div ref={msgListRef} onScroll={() => {
            if (!msgListRef.current) return
            const el = msgListRef.current
            setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 60)
          }} style={{ maxHeight: 400, overflowY: 'auto', paddingRight: 4, userSelect: 'text' }}>
            {messages.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 24, ...mono, fontSize: 10, color: 'var(--muted)' }}>No messages yet</div>
            ) : (
              messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)
            )}
          </div>
          {/* Scroll buttons */}
          <button onClick={() => msgListRef.current?.scrollTo({ top: 0, behavior: 'smooth' })} title="Scroll to top"
            style={{ position:'absolute', top:24, right:-4, width:26, height:26, borderRadius:'50%', border:'1px solid var(--border)',
              background:'rgba(0,0,0,0.7)', color:'var(--muted)', fontSize:11, cursor:'pointer', zIndex:5,
              display:'flex', alignItems:'center', justifyContent:'center', opacity:0.6 }}>↑</button>
          {!atBottom && <button onClick={() => msgListRef.current?.scrollTo({ top: msgListRef.current.scrollHeight, behavior: 'smooth' })} title="Scroll to bottom"
            style={{ position:'absolute', bottom: canReply ? 16 : 0, right:-4, width:26, height:26, borderRadius:'50%',
              border:'1px solid rgba(0,255,136,0.4)', background:'rgba(0,255,136,0.15)', color:'var(--green)', fontSize:11, cursor:'pointer', zIndex:5,
              display:'flex', alignItems:'center', justifyContent:'center' }}>↓</button>}
        </div>

        {/* Reply box */}
        {canReply && (
          <div>
            <label style={labelStyle}>ADD A REPLY</label>
            <textarea value={reply} onChange={e => setReply(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply() } }}
              placeholder="Type your message here... (Enter to send, Shift+Enter for new line)"
              rows={3} style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.7, marginBottom: 10 }}
              onFocus={e => e.target.style.borderColor = 'var(--green)'} onBlur={e => e.target.style.borderColor = 'var(--border)'} />
            <button onClick={sendReply} disabled={sending || !reply.trim()} style={{
              ...mono, fontSize: 10, letterSpacing: 2, padding: '10px 20px',
              background: sending || !reply.trim() ? 'var(--bg3)' : 'var(--green)',
              color: sending || !reply.trim() ? 'var(--muted)' : '#000',
              border: 'none', borderRadius: 6, cursor: sending || !reply.trim() ? 'not-allowed' : 'pointer',
              fontWeight: 700,
            }}>
              {sending ? 'SENDING...' : '↩ SEND REPLY'}
            </button>
          </div>
        )}
        {!canReply && (
          <div style={{ ...mono, fontSize: 10, color: 'var(--muted)', textAlign: 'center', padding: 12, background: 'var(--bg3)', borderRadius: 6 }}>
            This ticket is {ticket.status}. You cannot add more replies.
          </div>
        )}
      </div>
    </div>
  )
}

// ── Submit Ticket ──────────────────────────────────────────
function SubmitTicket({ onSuccess }) {
  const { user } = useForum()
  const [form, setForm] = useState({ name: '', email: '', subject: '', priority: 'medium', category: 'general', description: '' })
  const [sending, setSending] = useState(false)
  const [accountCreated, setAccountCreated] = useState(false)

  useEffect(() => {
    if (user) setForm(f => ({ ...f, name: user.username || f.name, email: user.email || f.email }))
  }, [user])

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const handleSubmit = async e => {
    e.preventDefault()
    if (!form.name || !form.email || !form.subject || !form.description) {
      notify.error('Please fill in all required fields', { title: 'Missing Fields' }); return
    }
    setSending(true)
    try {
      const payload = { ...form, user_id: user?._id || user?.id || null }
      const res = await api.post('/helpdesk/tickets', payload)
      if (res.data.account_created) {
        setAccountCreated(true)
        notify.success('Ticket submitted! An account was also created — check your email for login credentials.', { title: 'Ticket Created ✓', duration: 8000 })
      } else {
        notify.success("Your ticket has been submitted. We'll get back to you soon.", { title: 'Ticket Created ✓' })
      }
      setForm({ name: '', email: '', subject: '', priority: 'medium', category: 'general', description: '' })
      onSuccess?.(res.data.id || res.data.ticket_id, form.email)
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Failed to submit ticket'
      notify.error(msg, { title: 'Error' })
    } finally { setSending(false) }
  }

  return (
    <div style={card}>
      {accountCreated && (
        <div style={{ ...mono, fontSize: 11, color: '#00ff88', background: 'rgba(0,255,136,0.06)', border: '1px solid rgba(0,255,136,0.2)', borderRadius: 6, padding: '12px 16px', marginBottom: 20, lineHeight: 1.7 }}>
          ✓ An aifazi.net account was created with your email. Check your inbox for login credentials so you can track this ticket and future ones from your profile.
        </div>
      )}
      <div style={{ marginBottom: 20 }}>
        <div style={{ ...mono, fontSize: 9, letterSpacing: 3, color: 'var(--cyan)', marginBottom: 4 }}>SUBMIT A TICKET</div>
        <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Report an Issue</h3>
      </div>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }} className="helpdesk-form-row">
          <div>
            <label style={labelStyle}>YOUR NAME *</label>
            <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Tanvir Hasan" style={inputStyle}
              onFocus={e => e.target.style.borderColor = 'var(--cyan)'} onBlur={e => e.target.style.borderColor = 'var(--border)'} />
          </div>
          <div>
            <label style={labelStyle}>EMAIL *</label>
            <input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="you@example.com" style={inputStyle}
              onFocus={e => e.target.style.borderColor = 'var(--cyan)'} onBlur={e => e.target.style.borderColor = 'var(--border)'} />
          </div>
        </div>
        <div>
          <label style={labelStyle}>SUBJECT *</label>
          <input value={form.subject} onChange={e => set('subject', e.target.value)} placeholder="Brief description of the issue" style={inputStyle}
            onFocus={e => e.target.style.borderColor = 'var(--cyan)'} onBlur={e => e.target.style.borderColor = 'var(--border)'} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>CATEGORY</label>
            <Select value={form.category} onChange={v => set('category', v)}
              options={['general','hardware','software','network','account','other'].map(c => [c, c.charAt(0).toUpperCase() + c.slice(1)])} />
          </div>
          <div>
            <label style={labelStyle}>PRIORITY</label>
            <Select value={form.priority} onChange={v => set('priority', v)}
              options={['low','medium','high','critical'].map(p => [p, p.charAt(0).toUpperCase() + p.slice(1)])} />
          </div>
        </div>
        <div>
          <label style={labelStyle}>DESCRIPTION *</label>
          <textarea value={form.description} onChange={e => set('description', e.target.value)}
            placeholder="Describe the issue in detail — steps to reproduce, error messages, affected systems..."
            rows={5} style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.7 }}
            onFocus={e => e.target.style.borderColor = 'var(--cyan)'} onBlur={e => e.target.style.borderColor = 'var(--border)'} />
        </div>
        <button type="submit" disabled={sending} style={{
          ...mono, fontSize: 11, letterSpacing: 2, padding: '12px 24px',
          background: sending ? 'var(--bg3)' : 'var(--green)', color: sending ? 'var(--muted)' : '#000',
          border: 'none', borderRadius: 6, cursor: sending ? 'not-allowed' : 'pointer',
          fontWeight: 700, transition: 'all 0.2s', alignSelf: 'flex-start',
        }}>
          {sending ? 'SUBMITTING...' : '🎫 SUBMIT TICKET'}
        </button>
      </form>
    </div>
  )
}

// ── Check Tickets ─────────────────────────────────────────
function CheckStatus({ onViewTicket, onGuestEmail }) {
  const { user } = useForum()
  const [query, setQuery] = useState(user?.email || '')
  const [tickets, setTickets] = useState(null)
  const [loading, setLoading] = useState(false)
  const [autoLoaded, setAutoLoaded] = useState(false)
const [filterStatus, setFilterStatus] = useState('all')
  const [filterPriority, setFilterPriority] = useState('all')
  const [filterCategory, setFilterCategory] = useState('all')

  const loadTickets = useCallback(async email => {
    if (!user) return
    setLoading(true)
    try {
const params = new URLSearchParams()
    if (filterStatus !== 'all') params.set('status', filterStatus)
    if (filterPriority !== 'all') params.set('priority', filterPriority)
    if (filterCategory !== 'all') params.set('category', filterCategory)
      const url = `/helpdesk/tickets/mine${params.toString() ? `?${params}` : ''}`
      const res = await api.get(url)
      const data = Array.isArray(res.data) ? res.data : (res.data?.tickets || res.data?.data || [])
      setTickets(data)
    } catch {
      setTickets([])
    } finally { setLoading(false) }
  }, [user, filterStatus, filterPriority, filterCategory])

  useEffect(() => {
    if (user?.email && !autoLoaded) {
      setAutoLoaded(true)
    }
  }, [user?.email, autoLoaded])

  useEffect(() => {
    if (!autoLoaded) return
    loadTickets(user?.email || query)
  }, [autoLoaded, loadTickets, query, user?.email])

  useEffect(() => {
    if (!autoLoaded) return
    const id = setInterval(() => {
      const email = user?.email || query
      if (email || user) loadTickets(email)
    }, 15_000)
    return () => clearInterval(id)
  }, [autoLoaded, user, user?.email, query, loadTickets])

  const search = async e => {
    e.preventDefault()
    if (!user) return
    setAutoLoaded(true)
    await loadTickets(user.email || '')
  }

  const STATUS_CFG = {
    open:         { color: '#ff6b35', label: 'OPEN'        },
    'in-progress':{ color: '#00d4ff', label: 'IN PROGRESS' },
    resolved:     { color: '#00ff88', label: 'RESOLVED'    },
    closed:       { color: '#5a7a95', label: 'CLOSED'      },
    pending:      { color: '#a855f7', label: 'PENDING'     },
  }

  const priorityOptions = [
    ['all', 'ALL PRIORITY'],
    ['p1', 'P1 CRITICAL'],
    ['p2', 'P2 HIGH'],
    ['p3', 'P3 MEDIUM'],
    ['p4', 'P4 LOW'],
  ]
  const priorityToValue = { p1: 'critical', p2: 'high', p3: 'medium', p4: 'low' }
  const activePriority = priorityToValue[filterPriority] || filterPriority
  const ticketList = tickets || []
const filtered = ticketList.filter(t => (
    (filterStatus === 'all' || t.status === filterStatus) &&
    (filterPriority === 'all' || t.priority === activePriority) &&
    (filterCategory === 'all' || t.category === filterCategory)
  ))

  const CATEGORY_CFG = {
    general:     { label: 'GENERAL',     color: '#94a3b8' },
    billing:     { label: 'BILLING',     color: '#f59e0b' },
    technical:   { label: 'TECHNICAL',   color: '#3b82f6' },
    account:     { label: 'ACCOUNT',     color: '#8b5cf6' },
    bug:         { label: 'BUG REPORT',  color: '#ef4444' },
    feature:     { label: 'FEATURE',     color: '#00ff88' },
  }

  return (
    <div style={card}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ ...mono, fontSize: 9, letterSpacing: 3, color: 'var(--purple)', marginBottom: 4 }}>TICKET LOOKUP</div>
        <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
          {user ? `${user.username}'s Tickets` : 'Sign In to View Tickets'}
        </h3>
        {user && (
          <div style={{ ...mono, fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>
            Showing tickets for <span style={{ color: 'var(--cyan)' }}>{user.email}</span>
          </div>
        )}
        {!user && (
          <div style={{ ...mono, fontSize: 10, color: 'var(--muted)', marginTop: 4, lineHeight: 1.6 }}>
            You must be signed in to view your tickets. Sign in to see tickets associated with your account.
          </div>
        )}
      </div>

      {!user && (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
          <div style={{ ...mono, fontSize: 11, color: 'var(--muted)' }}>
            Sign in to view and manage your support tickets.
          </div>
        </div>
      )}

      {user && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
          <button onClick={() => setFilterStatus('all')} style={{
            ...mono, fontSize: 8, letterSpacing: 1, padding: '4px 10px',
            background: filterStatus === 'all' ? 'rgba(255,255,255,0.1)' : 'transparent',
            border: filterStatus === 'all' ? '1px solid rgba(255,255,255,0.2)' : '1px solid var(--border)',
            color: filterStatus === 'all' ? 'var(--text)' : 'var(--muted)',
            borderRadius: 4, cursor: 'pointer',
          }}>
            ALL · {ticketList.length}
          </button>
          {Object.entries(STATUS_CFG).map(([s, cfg]) => {
            const count = ticketList.filter(t => t.status === s).length
            return (
              <button key={s} onClick={() => setFilterStatus(s)} style={{
                ...mono, fontSize: 8, letterSpacing: 1, padding: '4px 10px',
                background: filterStatus === s ? cfg.color + '18' : 'transparent',
                border: `1px solid ${filterStatus === s ? cfg.color + '44' : 'var(--border)'}`,
                color: filterStatus === s ? cfg.color : 'var(--muted)',
                borderRadius: 4, cursor: 'pointer',
              }}>
                {cfg.label} · {count}
              </button>
            )
          })}
          {priorityOptions.map(([value, label]) => {
            const priValue = priorityToValue[value] || value
            const count = value === 'all' ? ticketList.length : ticketList.filter(t => t.priority === priValue).length
            const active = filterPriority === value || activePriority === value
            return (
              <button key={value} onClick={() => setFilterPriority(value)} style={{
                ...mono, fontSize: 8, letterSpacing: 1, padding: '4px 10px',
                background: active ? 'rgba(0,255,136,0.1)' : 'transparent',
                border: active ? '1px solid rgba(0,255,136,0.35)' : '1px solid var(--border)',
                color: active ? 'var(--green)' : 'var(--muted)',
                borderRadius: 4, cursor: 'pointer',
              }}>
{label} · {count}
              </button>
            )
          })}
          {Object.entries(CATEGORY_CFG).map(([key, cfg]) => {
            const count = ticketList.filter(t => t.category === key).length
            const active = filterCategory === key
            return (
              <button key={key} onClick={() => setFilterCategory(active ? 'all' : key)} style={{
                ...mono, fontSize: 8, letterSpacing: 1, padding: '4px 10px',
                background: active ? cfg.color + '18' : 'transparent',
                border: `1px solid ${active ? cfg.color + '44' : 'var(--border)'}`,
                color: active ? cfg.color : 'var(--muted)',
                borderRadius: 4, cursor: 'pointer',
              }}>
                {cfg.label} · {count}
              </button>
            )
          })}
        </div>
      )}

      {loading && <div style={{ textAlign: 'center', padding: '24px 0', ...mono, fontSize: 10, color: 'var(--muted)', letterSpacing: 3 }}>LOADING…</div>}

      {!loading && filtered.length > 0 && (
        <div style={{ marginTop: 4 }}>
          {filtered.map(t => {
            const sc = STATUS_CFG[t.status] || STATUS_CFG.open
            return (
              <div key={t.id} onClick={() => onViewTicket?.(t.id, '')}
                style={{ cursor: 'pointer', background: 'var(--bg3)', border: '1px solid var(--border)',
                  borderLeft: `3px solid ${sc.color}`, borderRadius: 8, padding: '14px 16px', marginBottom: 8,
                  transition: 'all 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = sc.color + '66'; e.currentTarget.style.background = 'var(--bg2)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg3)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <PriorityDot priority={t.priority} />
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{t.subject}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ ...mono, fontSize: 9, color: 'var(--muted)' }}>
                      {t.message_count || 0} msg
                    </span>
                    <StatusBadge status={t.status} />
                  </div>
                </div>
                <div style={{ ...mono, fontSize: 10, color: 'var(--muted)', marginTop: 8 }}>
                  #{t.ticket_id || (t.id || '').slice(-6).toUpperCase()} · {t.category || 'general'} · {t.created_at ? new Date(t.created_at).toLocaleDateString() : '—'}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {!loading && tickets !== null && filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📭</div>
          <div style={{ ...mono, fontSize: 11, color: 'var(--muted)' }}>
            No tickets match the selected filters.
          </div>
        </div>
      )}
    </div>
  )
}

// ── FAQ ────────────────────────────────────────────────────
const FAQS = [
  { q: 'How long does it take to respond?', a: 'Critical and High priority tickets are addressed within 4 hours. Medium within 1 business day. Low within 3 business days.' },
  { q: 'What counts as critical priority?', a: 'System outages, complete loss of service, security incidents, or anything blocking all users from working.' },
  { q: 'Can I reply to my ticket?', a: 'Yes — sign in and go to My Tickets to view and reply to your tickets.' },
  { q: 'What info should I include?', a: 'Device name, OS version, steps to reproduce the issue, any error messages, and what you were trying to do.' },
]

function FAQ() {
  const [open, setOpen] = useState(null)
  return (
    <div style={card}>
      <div style={{ ...mono, fontSize: 9, letterSpacing: 3, color: 'var(--yellow)', marginBottom: 16 }}>FAQ</div>
      {FAQS.map((item, i) => (
        <div key={i} style={{ borderBottom: i < FAQS.length - 1 ? '1px solid var(--border)' : 'none' }}>
          <button onClick={() => setOpen(open === i ? null : i)} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            width: '100%', padding: '14px 0', background: 'none', border: 'none',
            cursor: 'pointer', color: 'var(--text)', textAlign: 'left', gap: 10,
          }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{item.q}</span>
            <span style={{ ...mono, fontSize: 16, color: 'var(--muted)', flexShrink: 0, transform: open === i ? 'rotate(45deg)' : 'none', transition: 'transform 0.2s' }}>+</span>
          </button>
          {open === i && (
            <div style={{ ...mono, fontSize: 12, color: 'var(--muted)', lineHeight: 1.8, paddingBottom: 14 }}>{item.a}</div>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────
export default function HelpDesk() {
  const { user } = useForum()
  const [tab, setTab] = useState('submit')
  const [viewTicketId, setViewTicketId] = useState(null)
  const [guestTicketEmail, setGuestTicketEmail] = useState('')
  const [stats, setStats] = useState(null)

  useEffect(() => {
    api.get('/helpdesk/stats').then(r => setStats(r.data)).catch(() => {})
  }, [])

  const handleSuccess = (ticketId, email = '') => {
    setGuestTicketEmail(email)
    if (ticketId && user) {
      setViewTicketId(ticketId)
      setTab('status')
    } else {
      setTab('status')
    }
  }

  const STAT_CARDS = [
    { label: 'AVG RESPONSE', value: '< 4h',  color: 'var(--cyan)' },
    { label: 'RESOLVED',     value: stats?.resolvedToday ?? '—', color: 'var(--green)' },
    { label: 'OPEN TICKETS', value: stats?.openTickets ?? '—',   color: 'var(--orange)' },
    { label: 'IN PROGRESS',  value: stats?.inProgress ?? '—',    color: '#a855f7' },
  ]

  return (
    <div style={{ minHeight: '100vh', paddingTop: 80 }}>
      {/* Hero */}
      <div className="helpdesk-header" style={{ borderBottom: '1px solid var(--border)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -60, right: -60, width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,212,255,0.06) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ ...mono, fontSize: 9, letterSpacing: 4, color: 'var(--cyan)', marginBottom: 10 }}>SUPPORT / TOOLS</div>
        <h1 style={{ fontSize: 40, fontWeight: 800, margin: '0 0 12px', lineHeight: 1.1 }}>
          🎫 Help Desk <span style={{ color: 'var(--cyan)' }}>&amp; Tickets</span>
        </h1>
        <p style={{ color: 'var(--muted)', fontSize: 15, maxWidth: 520, lineHeight: 1.7, margin: '0 0 28px' }}>
          Submit a support request, check on existing tickets, or browse the FAQ. We aim to respond to all issues as fast as possible.
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {STAT_CARDS.map(s => (
            <div key={s.label} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderTop: `2px solid ${s.color}`, borderRadius: 8, padding: '12px 18px', minWidth: 110 }}>
              <div style={{ ...mono, fontSize: 7, letterSpacing: 2, color: 'var(--muted)', marginBottom: 4 }}>{s.label}</div>
              <div style={{ ...mono, fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="helpdesk-body" style={{ maxWidth: 1200, margin: '0 auto' }}>
        {/* Tabs */}
        <div className="helpdesk-tabs" style={{ display: 'flex', gap: 0, marginBottom: 28, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', width: 'fit-content', flexWrap: 'wrap' }}>
          {[
            { key: 'submit', label: '🎫 Submit Ticket' },
            { key: 'status', label: user ? '🔍 My Tickets' : '🔍 Find Ticket' },
            { key: 'faq',    label: '❓ FAQ' },
          ].map(t => (
            <button key={t.key} onClick={() => { setTab(t.key); setViewTicketId(null) }} style={{
              ...mono, fontSize: 11, letterSpacing: 1, padding: '10px 20px',
              background: tab === t.key ? 'rgba(0,212,255,0.12)' : 'transparent',
              color: tab === t.key ? 'var(--cyan)' : 'var(--muted)',
              border: 'none', borderRight: '1px solid var(--border)', cursor: 'pointer',
              fontWeight: tab === t.key ? 700 : 400, transition: 'all 0.15s',
            }}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="helpdesk-grid" style={{ display: 'grid', gridTemplateColumns: tab === 'faq' || viewTicketId ? '1fr' : '1fr 340px', gap: 24, alignItems: 'start' }}>
          {/* Main panel */}
          <div>
            {viewTicketId ? (
              <TicketDetail ticketId={viewTicketId} accessEmail={guestTicketEmail} onBack={() => setViewTicketId(null)} />
            ) : tab === 'submit' ? (
              <SubmitTicket onSuccess={handleSuccess} />
            ) : tab === 'status' ? (
              <CheckStatus onGuestEmail={setGuestTicketEmail} onViewTicket={(id, email) => { setGuestTicketEmail(email || ''); setViewTicketId(id) }} />
            ) : (
              <FAQ />
            )}
          </div>

          {/* Sidebar */}
          {tab !== 'faq' && !viewTicketId && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={card}>
                <div style={{ ...mono, fontSize: 9, letterSpacing: 3, color: 'var(--muted)', marginBottom: 14 }}>PRIORITY GUIDE</div>
                {[
                  { label: 'P1 Critical', color: '#ff4757', desc: 'System down / data loss' },
                  { label: 'P2 High',     color: '#ff6b35', desc: 'Major feature broken'    },
                  { label: 'P3 Medium',   color: '#ffd700', desc: 'Partial impact'           },
                  { label: 'P4 Low',      color: '#00ff88', desc: 'Minor / cosmetic'         },
                ].map(p => (
                  <div key={p.label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, boxShadow: `0 0 6px ${p.color}`, flexShrink: 0 }} />
                    <div>
                      <span style={{ ...mono, fontSize: 10, color: p.color, fontWeight: 700 }}>{p.label}</span>
                      <span style={{ ...mono, fontSize: 9, color: 'var(--muted)', marginLeft: 8 }}>{p.desc}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div style={card}>
                <div style={{ ...mono, fontSize: 9, letterSpacing: 3, color: 'var(--muted)', marginBottom: 14 }}>OTHER CHANNELS</div>
                {[
                  { icon: '💬', label: 'Live Chat', desc: 'Instant support', to: '/chat' },
                  { icon: '📧', label: 'Email', desc: 'contact@aifazi.net', href: 'mailto:contact@aifazi.net' },
                ].map(c => (
                  c.href ? (
                    <a key={c.label} href={c.href} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', textDecoration: 'none' }}>
                      <span style={{ fontSize: 18, flexShrink: 0 }}>{c.icon}</span>
                      <div>
                        <div style={{ ...mono, fontSize: 11, color: 'var(--text)', fontWeight: 600 }}>{c.label}</div>
                        <div style={{ ...mono, fontSize: 9, color: 'var(--muted)' }}>{c.desc}</div>
                      </div>
                    </a>
                  ) : null
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .helpdesk-header { padding: 56px 60px 40px; }
        .helpdesk-body   { padding: 32px 60px 80px; }
        @media (max-width: 900px) {
          .helpdesk-header { padding: 40px 24px 28px !important; }
          .helpdesk-body   { padding: 24px 24px 60px !important; }
          .helpdesk-grid   { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 768px) {
          .helpdesk-header { padding: 32px 16px 24px !important; }
          .helpdesk-body   { padding: 16px 16px 48px !important; }
          .helpdesk-tabs   { width: 100% !important; }
          .helpdesk-tabs button { flex: 1 !important; }
        }
        @media (max-width: 480px) {
          .helpdesk-header h1 { font-size: 26px !important; }
          .helpdesk-tabs button { padding: 8px 10px !important; font-size: 10px !important; }
          .helpdesk-form-row { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
