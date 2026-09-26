'use client'
import { useState, useEffect, useCallback, useRef, useSyncExternalStore } from 'react'
import api from '@/lib/api'
import { notify } from '../core/notify.jsx'
import { useForum } from '../context/ForumContext'
import { Select } from '../core/ui.jsx'
import Clickable from '@/core/Clickable.jsx'
import { SkeletonList } from '@/core/Feedback'
import { getSupabase } from '@/lib/supabase'
import {
  StatusBadge, PriorityDot, PriorityBadge, MessageBubble, TicketDetail, SubmitTicket, CheckStatus, FAQS, FAQ,
} from './helpDeskParts'

const mono = { fontFamily: 'var(--font-mono)' }
const card = { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '20px 24px' }

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
        <div style={{ position: 'absolute', top: -60, right: -60, width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle, color-mix(in srgb, var(--cyan) 6%, transparent) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ ...mono, fontSize: 11, letterSpacing: 4, color: 'var(--cyan)', marginBottom: 10 }}>SUPPORT / TOOLS</div>
        <h1 style={{ fontSize: 40, fontWeight: 800, margin: '0 0 12px', lineHeight: 1.1 }}>
          🎫 Help Desk <span style={{ color: 'var(--cyan)' }}>&amp; Tickets</span>
        </h1>
        <p style={{ color: 'var(--muted)', fontSize: 15, maxWidth: 520, lineHeight: 1.7, margin: '0 0 28px' }}>
          Submit a support request, check on existing tickets, or browse the FAQ. We aim to respond to all issues as fast as possible.
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {STAT_CARDS.map(s => (
            <div key={s.label} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderTop: `2px solid ${s.color}`, borderRadius: 8, padding: '12px 18px', minWidth: 110 }}>
              <div style={{ ...mono, fontSize: 11, letterSpacing: 2, color: 'var(--muted)', marginBottom: 4 }}>{s.label}</div>
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
              background: tab === t.key ? 'color-mix(in srgb, var(--cyan) 12%, transparent)' : 'transparent',
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
                <div style={{ ...mono, fontSize: 11, letterSpacing: 3, color: 'var(--muted)', marginBottom: 14 }}>PRIORITY GUIDE</div>
                {[
                  { label: 'P1 Critical', color: '#ff4757', desc: 'System down / data loss' },
                  { label: 'P2 High',     color: '#ff6b35', desc: 'Major feature broken'    },
                  { label: 'P3 Medium',   color: '#ffd700', desc: 'Partial impact'           },
                  { label: 'P4 Low',      color: '#00ff88', desc: 'Minor / cosmetic'         },
                ].map(p => (
                  <div key={p.label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, boxShadow: `0 0 6px ${p.color}`, flexShrink: 0 }} />
                    <div>
                      <span style={{ ...mono, fontSize: 11, color: p.color, fontWeight: 700 }}>{p.label}</span>
                      <span style={{ ...mono, fontSize: 11, color: 'var(--muted)', marginLeft: 8 }}>{p.desc}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div style={card}>
                <div style={{ ...mono, fontSize: 11, letterSpacing: 3, color: 'var(--muted)', marginBottom: 14 }}>OTHER CHANNELS</div>
                {[
                  { icon: '💬', label: 'Live Chat', desc: 'Instant support', to: '/chat' },
                  { icon: '📧', label: 'Email', desc: 'contact@aifazi.net', href: 'mailto:contact@aifazi.net' },
                ].map(c => (
                  c.href ? (
                    <a key={c.label} href={c.href} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', textDecoration: 'none' }}>
                      <span style={{ fontSize: 18, flexShrink: 0 }}>{c.icon}</span>
                      <div>
                        <div style={{ ...mono, fontSize: 11, color: 'var(--text)', fontWeight: 600 }}>{c.label}</div>
                        <div style={{ ...mono, fontSize: 11, color: 'var(--muted)' }}>{c.desc}</div>
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
