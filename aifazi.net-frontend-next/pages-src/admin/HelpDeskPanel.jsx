'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import api from '@/lib/api'
import { getSupabase } from '@/lib/supabase'
import { useToast } from '../../components/Toast'
import { useDialog } from '../../components/Dialog'
import { Select } from '../../core/ui.jsx'
import { usePausableInterval } from '../../hooks/usePausableInterval'
import { S, useIsMobile, PageHeader } from './shared'

const STATUS_MAP = {
  open:          { color: '#ff6b35', bg: 'rgba(255,107,53,0.1)',  border: 'rgba(255,107,53,0.35)'  },
  'in-progress': { color: '#00d4ff', bg: 'color-mix(in srgb, var(--cyan) 10%, transparent)',  border: 'color-mix(in srgb, var(--cyan) 35%, transparent)'   },
  pending:       { color: '#a855f7', bg: 'rgba(168,85,247,0.1)', border: 'rgba(168,85,247,0.35)'  },
  resolved:      { color: '#00ff88', bg: 'color-mix(in srgb, var(--green) 10%, transparent)',  border: 'color-mix(in srgb, var(--green) 35%, transparent)'   },
  closed:        { color: '#5a7a95', bg: 'rgba(90,122,149,0.1)', border: 'rgba(90,122,149,0.35)'  },
}
const PRIORITY_MAP = { critical: '#ff4757', high: '#ff6b35', medium: '#ffd700', low: '#00ff88' }

const tid  = t => t.id || t._id
const tkid = t => t.ticket_id || t.ticketId || '—'
const tcat = t => t.created_at || t.createdAt

function StatusBadge({ status }) {
  const s = STATUS_MAP[status] || STATUS_MAP.open
  return (
    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 2, padding: '3px 8px',
      color: s.color, background: s.bg, border: `1px solid ${s.border}`, borderRadius: 4, whiteSpace: 'nowrap' }}>
      {status.replace('-', ' ').toUpperCase()}
    </span>
  )
}

function PriorityBadge({ priority }) {
  const c = PRIORITY_MAP[priority] || '#888'
  return (
    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 2, padding: '2px 10px',
      color: '#fff', background: c, borderRadius: 4, fontWeight: 700 }}>
      {priority?.toUpperCase()}
    </span>
  )
}

// ── Message Bubble ─────────────────────────────────────────
function MessageBubble({ msg }) {
  const isStaff = msg.author_type === 'staff'
  const isSystem = msg.author_type === 'system'
  const isUser = msg.author_type === 'user'
  return (
    <div style={{ display: 'flex', justifyContent: isStaff ? 'flex-end' : 'flex-start', marginBottom: 10 }}>
      <div style={{
        maxWidth: '80%',
        background: isSystem ? 'rgba(168,85,247,0.08)' : isStaff ? 'color-mix(in srgb, var(--cyan) 6%, transparent)' : 'color-mix(in srgb, var(--green) 6%, transparent)',
        border: `1px solid ${
          isSystem ? 'rgba(168,85,247,0.2)' : isStaff ? 'color-mix(in srgb, var(--cyan) 20%, transparent)' : 'color-mix(in srgb, var(--green) 20%, transparent)'
        }`, borderRadius: 8, padding: '10px 14px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 2,
            color: isSystem ? '#a855f7' : isStaff ? 'var(--cyan)' : 'var(--green)', fontWeight: 700,
          }}>
            {isSystem ? 'SYSTEM' : isStaff ? 'STAFF' : 'USER'}
          </span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--muted)' }}>
            {msg.author_name}
          </span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--muted)', marginLeft: 'auto' }}>
            {msg.created_at ? new Date(msg.created_at).toLocaleString() : ''}
          </span>
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text)', lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {msg.message}
        </div>
      </div>
    </div>
  )
}

// ── Ticket Detail View (inline, not a popup) ────────────────
function TicketDetailView({ ticket, onBack, onSave }) {
  const toast = useToast()
  const [form, setForm] = useState({
    status: ticket.status,
    priority: ticket.priority,
    internal_note: ticket.internal_note || ticket.internalNote || '',
  })
  const [reply, setReply] = useState('')
  const [saving, setSaving] = useState(false)
  const [messages, setMessages] = useState(ticket.messages || [])
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const handleSave = async () => {
    setSaving(true)
    try {
      const payload = { ...form }
      if (reply.trim()) payload.message = reply.trim()
      const res = await api.put(`/helpdesk/admin/tickets/${tid(ticket)}`, payload)
      toast.success('Ticket updated', { title: 'Saved' })
      setReply('')
      if (res.data.messages) setMessages(res.data.messages)
      const detail = await api.get(`/helpdesk/admin/tickets/${tid(ticket)}`)
      setMessages(detail.data.messages || [])
      onSave(res.data)
    } catch (e) {
      toast.error(e.response?.data?.error || 'Save failed', { title: 'Error' })
    } finally { setSaving(false) }
  }

  const handleReply = async () => {
    if (!reply.trim()) return
    try {
      await api.post(`/helpdesk/admin/tickets/${tid(ticket)}/messages`, {
        message: reply.trim(),
        author_type: 'staff',
      })
      setReply('')
      const detail = await api.get(`/helpdesk/admin/tickets/${tid(ticket)}`)
      setMessages(detail.data.messages || [])
      toast.success('Reply added', { title: 'Sent' })
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to send reply')
    }
  }

  const inp = { background: 'var(--bg3)', border: '1px solid var(--border)',
    color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: 12, padding: '10px 12px',
    outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.2s' }
  const lbl = { display: 'block', fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 2,
    color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase' }

  const STATUSES = ['open', 'in-progress', 'pending', 'resolved', 'closed']
  const PRIORITIES = ['low', 'medium', 'high', 'critical']

  return (
    <div style={{ background: 'var(--bg)', border: '1px solid color-mix(in srgb, var(--cyan) 20%, transparent)', borderRadius: 8 }}>
      <div style={{ height: 2, background: 'linear-gradient(90deg, var(--cyan), var(--green))' }} />

      {/* Header */}
      <div style={{ padding: '16px 20px', background: 'var(--bg2)', borderBottom: '1px solid var(--border)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 3, color: 'var(--cyan)', marginBottom: 4 }}>TICKET DETAIL</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: 'var(--green)' }}>{tkid(ticket)}</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600, marginTop: 4 }}>{ticket.subject}</div>
        </div>
        <button onClick={onBack} style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 1,
          background: 'none', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer',
          borderRadius: 6, padding: '7px 14px' }}>
          ← BACK TO LIST
        </button>
      </div>

      {/* Meta */}
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)',
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {[['FROM', `${ticket.name} <${ticket.email}>`], ['CATEGORY', ticket.category],
          ['SUBMITTED', new Date(tcat(ticket)).toLocaleString()], ['TICKET ID', tkid(ticket)],
          ['MESSAGES', `${messages.length}`],
          ['PRIORITY', <PriorityBadge key="p" priority={ticket.priority} />],
        ].map(([k, v]) => (
          <div key={k}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 2, color: 'var(--muted)', marginBottom: 3 }}>{k}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text)' }}>{v}</div>
          </div>
        ))}
      </div>

      {/* Description */}
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.015)' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 2, color: 'var(--muted)', marginBottom: 8 }}>DESCRIPTION</div>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text)', lineHeight: 1.8, margin: 0, whiteSpace: 'pre-wrap' }}>{ticket.description}</p>
      </div>

      {/* Message Thread */}
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 2, color: 'var(--muted)', marginBottom: 12 }}>DISCUSSION THREAD</div>
        {messages.length === 0 ? (
          <div style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', padding: 20 }}>No messages yet</div>
        ) : (
          messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)
        )}
      </div>

      {/* Staff Reply */}
      <div style={{ padding: '14px 20px' }}>
        <label style={lbl}>ADD STAFF REPLY</label>
        <textarea value={reply} onChange={e => setReply(e.target.value)}
          placeholder="Type your reply to the user..."
          rows={3} style={{ ...inp, width: '100%', resize: 'vertical', lineHeight: 1.7, marginBottom: 10, borderRadius: 6 }}
          onFocus={e => e.target.style.borderColor = 'var(--cyan)'} onBlur={e => e.target.style.borderColor = 'var(--border)'} />
        <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <label style={{ ...lbl, fontSize: 7, marginBottom: 2 }}>STATUS</label>
              <Select value={form.status} onChange={v => set('status', v)}
                options={STATUSES.map(s => ({ value: s, label: s.replace('-', ' ').toUpperCase() }))} />
            </div>
            <div>
              <label style={{ ...lbl, fontSize: 7, marginBottom: 2 }}>PRIORITY</label>
              <Select value={form.priority} onChange={v => set('priority', v)}
                options={PRIORITIES.map(p => ({ value: p, label: p.toUpperCase() }))} />
            </div>
            <div>
              <label style={{ ...lbl, fontSize: 7, marginBottom: 2 }}>INTERNAL NOTE</label>
              <input value={form.internal_note} onChange={e => set('internal_note', e.target.value)}
                placeholder="Team note..." style={{ ...inp, fontSize: 11, padding: '6px 10px', borderRadius: 4, width: 200, borderColor: 'rgba(255,215,0,0.2)' }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button onClick={onBack} style={{ ...S.btn('transparent', 'var(--muted)'), border: '1px solid var(--border)', padding: '9px 14px', fontSize: 9 }}>CANCEL</button>
            <button onClick={handleSave} disabled={saving}
              style={{ ...S.btn(), padding: '9px 16px', fontSize: 9, opacity: saving ? 0.6 : 1 }}>
              {saving ? 'SAVING...' : reply.trim() ? '✓ SAVE & REPLY' : '✓ SAVE'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Settings Panel ─────────────────────────────────────────
function HelpDeskSettings() {
  const toast = useToast()
  const [config, setConfig] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setLoading(true)
    api.get('/helpdesk/admin/settings')
      .then(r => setConfig(r.data || {}))
      .catch(() => setConfig({}))
      .finally(() => setLoading(false))
  }, [])

  const set = (path, value) => {
    setConfig(prev => {
      const next = { ...prev }
      const keys = path.split('.')
      let obj = next
      for (let i = 0; i < keys.length - 1; i++) obj = obj[keys[i]] || (obj[keys[i]] = {})
      obj[keys[keys.length - 1]] = value
      return next
    })
  }

  const addCategory = () => {
    setConfig(prev => ({ ...prev, categories: [...(prev.categories || []), 'new-category'] }))
  }

  const removeCategory = idx => {
    setConfig(prev => ({ ...prev, categories: (prev.categories || []).filter((_, i) => i !== idx) }))
  }

  const addPriority = () => {
    setConfig(prev => ({
      ...prev,
      priorities: [...(prev.priorities || []), { value: 'new', label: 'New', color: '#888', eta: 'TBD' }],
    }))
  }

  const removePriority = idx => {
    setConfig(prev => ({ ...prev, priorities: (prev.priorities || []).filter((_, i) => i !== idx) }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.put('/helpdesk/admin/settings', { config })
      toast.success('Helpdesk settings saved', { title: 'Saved' })
    } catch (e) {
      toast.error(e.response?.data?.error || 'Save failed', { title: 'Error' })
    } finally { setSaving(false) }
  }

  const inp = { background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)',
    fontFamily: 'var(--font-mono)', fontSize: 12, padding: '8px 10px', outline: 'none',
    borderRadius: 4, boxSizing: 'border-box' }
  const lbl = { fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 2, color: 'var(--muted)', display: 'block', marginBottom: 4 }

  if (loading) return <div className="loader" />
  if (!config) return <div style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--orange)', padding: 40 }}>Failed to load settings</div>

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ marginBottom: 24 }}>
        <PageHeader eyebrow="CONFIGURATION" title="Helpdesk Settings"
          subtitle="Customize categories, priorities, auto-reply, and more"
          actions={
            <button onClick={handleSave} disabled={saving}
              style={{ ...S.btn(), fontSize: 10, padding: '9px 20px', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'SAVING...' : '✓ SAVE ALL SETTINGS'}
            </button>
          }
        />
      </div>

      {/* Statuses (read-only, always needed) */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '16px 20px', marginBottom: 16 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 2, color: 'var(--cyan)', marginBottom: 12 }}>TICKET STATUSES</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(config.statuses || ['open', 'in-progress', 'pending', 'resolved', 'closed']).map(s => (
            <span key={s} style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 1, padding: '4px 12px',
              background: 'color-mix(in srgb, var(--cyan) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--cyan) 20%, transparent)', borderRadius: 4, color: 'var(--cyan)' }}>
              {s.replace('-', ' ').toUpperCase()}
            </span>
          ))}
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', marginTop: 8 }}>
          Statuses are fixed. Use them in your workflow.
        </div>
      </div>

      {/* Categories */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '16px 20px', marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 2, color: 'var(--cyan)' }}>CATEGORIES</div>
          <button onClick={addCategory} style={{ fontFamily: 'var(--font-mono)', fontSize: 9, background: 'none', border: '1px solid color-mix(in srgb, var(--cyan) 30%, transparent)', color: 'var(--cyan)', borderRadius: 4, padding: '4px 10px', cursor: 'pointer' }}>+ ADD CATEGORY</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(config.categories || []).map((cat, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input value={cat} onChange={e => {
                const cats = [...(config.categories || [])]
                cats[i] = e.target.value
                set('categories', cats)
              }} style={{ ...inp, flex: 1 }} />
              <button onClick={() => removeCategory(i)} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--red)', background: 'none', border: '1px solid rgba(255,71,87,0.3)', borderRadius: 4, padding: '4px 10px', cursor: 'pointer' }}>✕</button>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 8 }}>
          <label style={lbl}>DEFAULT CATEGORY</label>
          <Select value={config.default_category || 'general'} onChange={v => set('default_category', v)}
            options={(config.categories || ['general']).map(c => ({ value: c, label: c.charAt(0).toUpperCase() + c.slice(1) }))} />
        </div>
      </div>

      {/* Priorities */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '16px 20px', marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 2, color: 'var(--cyan)' }}>PRIORITIES</div>
          <button onClick={addPriority} style={{ fontFamily: 'var(--font-mono)', fontSize: 9, background: 'none', border: '1px solid color-mix(in srgb, var(--cyan) 30%, transparent)', color: 'var(--cyan)', borderRadius: 4, padding: '4px 10px', cursor: 'pointer' }}>+ ADD PRIORITY</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(config.priorities || []).map((p, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input value={p.value} placeholder="value" style={{ ...inp, width: 110 }}
                onChange={e => {
                  const ps = [...(config.priorities || [])]
                  ps[i] = { ...ps[i], value: e.target.value }
                  set('priorities', ps)
                }} />
              <input value={p.label} placeholder="Label" style={{ ...inp, width: 100 }}
                onChange={e => {
                  const ps = [...(config.priorities || [])]
                  ps[i] = { ...ps[i], label: e.target.value }
                  set('priorities', ps)
                }} />
              <input value={p.color} placeholder="#hex" style={{ ...inp, width: 90, fontFamily: 'monospace' }}
                onChange={e => {
                  const ps = [...(config.priorities || [])]
                  ps[i] = { ...ps[i], color: e.target.value }
                  set('priorities', ps)
                }} />
              <input value={p.eta} placeholder="ETA text" style={{ ...inp, flex: 1 }}
                onChange={e => {
                  const ps = [...(config.priorities || [])]
                  ps[i] = { ...ps[i], eta: e.target.value }
                  set('priorities', ps)
                }} />
              <span style={{ width: 16, height: 16, borderRadius: '50%', background: p.color, flexShrink: 0, border: '1px solid rgba(255,255,255,0.1)' }} />
              <button onClick={() => removePriority(i)} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--red)', background: 'none', border: '1px solid rgba(255,71,87,0.3)', borderRadius: 4, padding: '4px 10px', cursor: 'pointer' }}>✕</button>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 8 }}>
          <label style={lbl}>DEFAULT PRIORITY</label>
          <Select value={config.default_priority || 'medium'} onChange={v => set('default_priority', v)}
            options={(config.priorities || []).map(p => ({ value: p.value, label: p.label }))} />
        </div>
      </div>

      {/* Auto-Close */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '16px 20px', marginBottom: 16 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 2, color: 'var(--cyan)', marginBottom: 12 }}>AUTO-CLOSE</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>Auto-close resolved tickets after</span>
          <input type="number" min={0} value={config.auto_close_days || 7}
            onChange={e => set('auto_close_days', parseInt(e.target.value) || 7)}
            style={{ ...inp, width: 70, textAlign: 'center' }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>days</span>
        </div>
      </div>

      {/* Auto-Response */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '16px 20px', marginBottom: 16 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 2, color: 'var(--cyan)', marginBottom: 12 }}>AUTO-RESPONSE</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <input type="checkbox" checked={config.auto_respond_enabled !== false}
            onChange={e => set('auto_respond_enabled', e.target.checked)}
            style={{ accentColor: 'var(--green)', width: 16, height: 16 }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text)' }}>Send auto-response on new ticket</span>
        </div>
        <textarea value={config.auto_respond_message || ''}
          onChange={e => set('auto_respond_message', e.target.value)}
          rows={3} style={{ ...inp, width: '100%', resize: 'vertical', lineHeight: 1.7 }}
          placeholder="Auto-response message..." />
      </div>

      {/* Attachments */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '16px 20px', marginBottom: 24 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 2, color: 'var(--cyan)', marginBottom: 12 }}>ATTACHMENTS</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <input type="checkbox" checked={config.allow_attachments === true}
            onChange={e => set('allow_attachments', e.target.checked)}
            style={{ accentColor: 'var(--green)', width: 16, height: 16 }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text)' }}>Allow file attachments</span>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <label style={lbl}>MAX ATTACHMENTS</label>
            <input type="number" min={0} value={config.max_attachments || 5}
              onChange={e => set('max_attachments', parseInt(e.target.value) || 5)}
              style={{ ...inp, width: 70 }} />
          </div>
          <div>
            <label style={lbl}>MAX FILE SIZE (MB)</label>
            <input type="number" min={0} value={config.max_file_size_mb || 10}
              onChange={e => set('max_file_size_mb', parseInt(e.target.value) || 10)}
              style={{ ...inp, width: 70 }} />
          </div>
        </div>
      </div>

      <button onClick={handleSave} disabled={saving}
        style={{ ...S.btn(), fontSize: 11, padding: '12px 28px', opacity: saving ? 0.6 : 1, marginBottom: 40 }}>
        {saving ? 'SAVING...' : '✓ SAVE ALL SETTINGS'}
      </button>
    </div>
  )
}

// ── Main Panel ─────────────────────────────────────────────
export default function HelpDeskPanel() {
  const toast = useToast()
  const { confirm } = useDialog()
  const isMobile = useIsMobile()
  const [tab, setTab] = useState('tickets')

  const [tickets, setTickets] = useState([])
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState(null)
  const [fStatus, setFStatus] = useState('all')
  const [fPriority, setFPriority] = useState('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const chanRef = useRef(null)

  const load = useCallback(async (p = 1) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: p, limit: 20 })
      if (fStatus !== 'all') params.set('status', fStatus)
      if (fPriority !== 'all') params.set('priority', fPriority)
      if (search.trim()) params.set('search', search.trim())
      const r = await api.get(`/helpdesk/admin/tickets?${params}`)
      const data = r.data.tickets || r.data.data || (Array.isArray(r.data) ? r.data : [])
      setTickets(data)
      setTotal(r.data.total || data.length)
      setPages(r.data.pages || 1)
      setPage(p)
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to load tickets', { title: 'Error' })
    } finally { setLoading(false) }
  }, [fStatus, fPriority, search])

  const loadStats = async () => {
    try { const r = await api.get('/helpdesk/admin/stats'); setStats(r.data) } catch {}
  }

  // Keep refs for realtime callbacks to avoid stale closures
  const pageRef = useRef(page)
  const selectedRef = useRef(selected)
  useEffect(() => { pageRef.current = page }, [page])
  useEffect(() => { selectedRef.current = selected }, [selected])

  useEffect(() => { load(1); loadStats() }, [fStatus, fPriority])
  useEffect(() => { if (!search) load(1) }, [search])

  // ── Realtime sync (mount once, use refs) ────────────────────
  useEffect(() => {
    const sb = getSupabase()
    if (!sb) return
    const ch = sb.channel('helpdesk-admin-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'helpdesk_tickets' }, () => {
        load(pageRef.current)
        loadStats()
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'helpdesk_messages' }, () => {
        const cur = selectedRef.current
        if (cur) {
          api.get(`/helpdesk/admin/tickets/${cur.id}`)
            .then(r => setSelected(r.data))
            .catch(() => {})
        }
        load(pageRef.current)
      })
      .subscribe()
    chanRef.current = ch
    return () => { sb.removeChannel(ch) }
  }, [load])

  // Polling fallback (also use ref for page)
  usePausableInterval(() => { load(pageRef.current); loadStats() }, 15000)

  const handleDelete = async (id, ticketId) => {
    const ok = await confirm({ title: `Delete Ticket ${ticketId}`,
      message: 'This will permanently delete the ticket.', variant: 'danger', confirmLabel: 'DELETE' })
    if (!ok) return
    try {
      await api.delete(`/helpdesk/admin/tickets/${id}`)
      setTickets(t => t.filter(x => tid(x) !== id))
      setTotal(n => n - 1)
      toast.success(`Ticket ${ticketId} deleted`, { title: 'Deleted' })
    } catch (e) { toast.error(e.response?.data?.error || 'Delete failed') }
  }

  const openTicket = async id => {
    try {
      const r = await api.get(`/helpdesk/admin/tickets/${id}`)
      setSelected(r.data)
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to load ticket')
    }
  }

  const quickStatus = async (ticket, status) => {
    try {
      const res = await api.put(`/helpdesk/admin/tickets/${tid(ticket)}`, { status })
      setTickets(t => t.map(x => tid(x) === tid(ticket) ? res.data : x))
      toast.success(`${tkid(ticket)} → ${status}`, { title: 'Updated' })
    } catch (e) { toast.error(e.response?.data?.error || 'Update failed') }
  }

  const ago = d => {
    if (!d) return '—'
    const s = Math.floor((Date.now() - new Date(d)) / 1000)
    if (s < 60) return `${s}s ago`
    if (s < 3600) return `${Math.floor(s / 60)}m ago`
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`
    return new Date(d).toLocaleDateString()
  }

  const STAT_ITEMS = stats ? [
    { label: 'TOTAL', value: stats.total, color: 'var(--cyan)' },
    { label: 'OPEN', value: stats.openTickets, color: '#ff6b35' },
    { label: 'IN PROGRESS', value: stats.inProgress, color: '#00d4ff' },
    { label: 'RESOLVED', value: stats.resolvedToday, color: 'var(--green)' },
    { label: 'CRITICAL', value: stats.critical, color: '#ff4757' },
  ] : []

  if (tab === 'settings') return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <button onClick={() => setTab('tickets')} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1, color: 'var(--cyan)', background: 'none', border: '1px solid color-mix(in srgb, var(--cyan) 20%, transparent)', borderRadius: 6, padding: '8px 16px', cursor: 'pointer' }}>
          ← BACK TO TICKETS
        </button>
      </div>
      <HelpDeskSettings />
    </div>
  )

  return (
    <div>
      <PageHeader
        eyebrow="SUPPORT"
        title="Help Desk Tickets"
        subtitle={`${total} ticket${total !== 1 ? 's' : ''} total`}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setTab('settings')}
              style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 1, padding: '7px 14px',
                background: 'color-mix(in srgb, var(--cyan) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--cyan) 30%, transparent)', color: 'var(--cyan)',
                cursor: 'pointer', borderRadius: 6 }}>
              ⚙ SETTINGS
            </button>
            <button onClick={() => { load(1); loadStats() }}
              style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 1, padding: '7px 14px',
                background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--muted)',
                cursor: 'pointer', borderRadius: 6 }}>
              ↻ REFRESH
            </button>
          </div>
        }
      />

      {STAT_ITEMS.length > 0 && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
          {STAT_ITEMS.map(s => (
            <div key={s.label} style={{ background: 'var(--bg2)', border: '1px solid var(--border)',
              borderTop: `2px solid ${s.color}`, borderRadius: 8, padding: '10px 16px', minWidth: 100 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 7, letterSpacing: 2, color: 'var(--muted)', marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value ?? '—'}</div>
            </div>
          ))}
        </div>
      )}

      {/* Selected ticket inline detail */}
      {selected ? (
        <TicketDetailView ticket={selected} onBack={() => { setSelected(null); load(page) }}
          onSave={updated => { setTickets(t => t.map(x => tid(x) === tid(updated) ? updated : x)); setSelected(updated) }} />
      ) : (<>
        {/* Filters */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: '1 1 220px' }}>
            <input value={search} onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && load(1)}
              placeholder="Search by name, email, subject, ID..."
              style={{ ...S.input, fontSize: 12, padding: '9px 12px 9px 30px', width: '100%', boxSizing: 'border-box' }} />
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 11, opacity: 0.4 }}>🔍</span>
            {search && <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 8,
              top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none',
              color: 'var(--muted)', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>✕</button>}
          </div>
          <div style={{ display: 'flex', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 4, overflow: 'hidden' }}>
            {[['all', 'All'], ['open', 'Open'], ['in-progress', 'Active'], ['pending', 'Pending'], ['resolved', 'Resolved'], ['closed', 'Closed']].map(([v, l]) => (
              <button key={v} onClick={() => setFStatus(v)} style={{ fontFamily: 'var(--font-mono)', fontSize: 8,
                letterSpacing: 1, padding: '7px 10px', cursor: 'pointer', border: 'none',
                borderRight: '1px solid var(--border)',
                background: fStatus === v ? 'color-mix(in srgb, var(--cyan) 12%, transparent)' : 'transparent',
                color: fStatus === v ? 'var(--cyan)' : 'var(--muted)' }}>{l}</button>
            ))}
          </div>
          <div style={{ width: 155 }}>
            <Select value={fPriority} onChange={setFPriority}
              options={[{ value: 'all', label: 'All Priorities' }, 'low', 'medium', 'high', 'critical'].map(p =>
                typeof p === 'string' ? { value: p, label: p.charAt(0).toUpperCase() + p.slice(1) } : p
              )} />
          </div>
        </div>

        {loading ? <div className="loader" /> : tickets.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
            No tickets found.{' '}
            {(fStatus !== 'all' || fPriority !== 'all' || search) && (
              <button onClick={() => { setFStatus('all'); setFPriority('all'); setSearch('') }}
                style={{ background: 'none', border: 'none', color: 'var(--green)', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}>
                Clear filters →
              </button>
            )}
          </div>
        ) : tickets.map(t => (
          <div key={tid(t)} style={{ ...S.card, cursor: 'pointer' }}
            onClick={() => openTicket(tid(t))}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--cyan) 25%, transparent)'; e.currentTarget.style.background = 'var(--bg)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg2)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
                  <PriorityBadge priority={t.priority} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 2, color: 'var(--green)', fontWeight: 700 }}>{tkid(t)}</span>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{t.subject}</span>
                  <StatusBadge status={t.status} />
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span>👤 {t.name}</span>
                  <span style={{ color: 'var(--cyan)' }}>{t.email}</span>
                  <span style={{ textTransform: 'capitalize' }}>📂 {t.category}</span>
                  <span>🕒 {ago(tcat(t))}</span>
                  {t.responded_by && <span style={{ color: 'var(--green)' }}>✓ {t.responded_by}</span>}
                  <span style={{ color: 'var(--muted)' }}>💬 {t.message_count || 0}</span>
                </div>
                {t.internal_note && (
                  <div style={{ marginTop: 6, fontFamily: 'var(--font-mono)', fontSize: 10, color: '#ffd700',
                    background: 'rgba(255,215,0,0.05)', border: '1px solid rgba(255,215,0,0.15)',
                    padding: '3px 10px', borderRadius: 4, display: 'inline-block' }}>
                    📝 {t.internal_note}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap', alignItems: 'flex-start' }}
                onClick={e => e.stopPropagation()}>
                {t.status === 'open' && (
                  <button onClick={() => quickStatus(t, 'in-progress')}
                    style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 1, padding: '5px 10px',
                      background: 'color-mix(in srgb, var(--cyan) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--cyan) 30%, transparent)',
                      color: '#00d4ff', cursor: 'pointer', borderRadius: 4 }}>START</button>
                )}
                {['open', 'in-progress', 'pending'].includes(t.status) && (
                  <button onClick={() => quickStatus(t, 'resolved')}
                    style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 1, padding: '5px 10px',
                      background: 'color-mix(in srgb, var(--green) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--green) 30%, transparent)',
                      color: 'var(--green)', cursor: 'pointer', borderRadius: 4 }}>RESOLVE</button>
                )}
                <button onClick={() => handleDelete(tid(t), tkid(t))}
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 1, padding: '5px 10px',
                    background: 'transparent', border: '1px solid rgba(255,71,87,0.3)',
                    color: 'var(--red)', cursor: 'pointer', borderRadius: 4 }}>DEL</button>
              </div>
            </div>
          </div>
        ))}

        {pages > 1 && (
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16, flexWrap: 'wrap' }}>
            <button onClick={() => load(page - 1)} disabled={page <= 1}
              style={{ fontFamily: 'var(--font-mono)', fontSize: 10, padding: '7px 14px', background: 'transparent',
                border: '1px solid var(--border)', color: page <= 1 ? 'var(--muted)' : 'var(--text)',
                cursor: page <= 1 ? 'not-allowed' : 'pointer' }}>← PREV</button>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', padding: '7px 14px' }}>
              Page {page} of {pages}
            </span>
            <button onClick={() => load(page + 1)} disabled={page >= pages}
              style={{ fontFamily: 'var(--font-mono)', fontSize: 10, padding: '7px 14px', background: 'transparent',
                border: '1px solid var(--border)', color: page >= pages ? 'var(--muted)' : 'var(--text)',
                cursor: page >= pages ? 'not-allowed' : 'pointer' }}>NEXT →</button>
          </div>
        )}
      </>)}
    </div>
  )
}
