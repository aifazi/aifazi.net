'use client'
import { useState } from 'react'
import { useNavigate, useLocation } from '@/lib/router-compat'
import { useReveal } from '../hooks/useReveal'
import { EditableText } from '../context/EditContext'
import api from '@/lib/api'
import { Select } from '../core/ui.jsx'

export default function ContactPage() {
  const navigate  = useNavigate()
  const location  = useLocation()
  const headerRef = useReveal()
  const leftRef   = useReveal()
  const rightRef  = useReveal()

  // Where to go back after submission â€” passed via router state, or default to '/'
  const from = location.state?.from || '/'

  const [form, setForm]     = useState({ name: '', email: '', subject: '', message: '' })
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(false)
  const [sent, setSent]     = useState(false)

  const handleSubmit = async e => {
    e.preventDefault()
    setLoading(true); setStatus(null)
    try {
      await api.post('/contact', form)
      setSent(true)
      setForm({ name: '', email: '', subject: '', message: '' })
    } catch {
      setStatus({ type: 'error', msg: '> Failed to send. Please try again later.' })
    } finally { setLoading(false) }
  }

  if (sent) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 24, padding: 24, position: 'relative', zIndex: 1 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>âœ…</div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 700, marginBottom: 12 }}>Message Sent!</h2>
          <p style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: 13, marginBottom: 32 }}>
            I'll get back to you soon.
          </p>
          <button
            onClick={() => navigate(from)}
            className="btn-primary"
          >
            â† Go Back
          </button>
        </div>
      </div>
    )
  }

  return (
    <section style={{ position: 'relative', zIndex: 1, minHeight: '100vh' }} className="contact-page-section">
      <div ref={headerRef} className="fade-up section-header">
        <span className="section-tag">CONTACT /</span>
        <h2 className="section-title">Contact</h2>
        <div className="section-line" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: 80, alignItems: 'start', maxWidth: 1100, margin: '0 auto' }} className="contact-grid contact-page-grid">
        <div ref={leftRef} className="fade-up">
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700, marginBottom: 20 }}>
            <EditableText contentKey="contact.heading" defaultValue="Let's Work Together" />
          </h3>
          <p style={{ color: 'var(--muted)', lineHeight: 1.8, marginBottom: 40 }}>
            <EditableText contentKey="contact.subheading" defaultValue="Have a network challenge, IT project, or just want to talk infrastructure? I'm always open to new opportunities." multiline />
          </p>

          {[
            { icon: 'ðŸ“§', label: 'EMAIL',        key: 'contact.email',        def: 'tanvir@aifazi.net'       },
            { icon: 'ðŸŒ', label: 'WEBSITE',      key: 'contact.website',      def: 'aifazi.net'              },
            { icon: 'ðŸ“', label: 'AVAILABILITY', key: 'contact.availability', def: 'Remote / Worldwide'      },
            { icon: 'ðŸ’¼', label: 'LINKEDIN',     key: 'contact.linkedin',     def: 'linkedin.com/in/tanvir'  },
          ].map(item => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16, padding: 16, border: '1px solid var(--border)', background: 'var(--bg2)', transition: 'border-color 0.3s' }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--green) 30%, transparent)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
            >
              <div style={{ width: 40, height: 40, background: 'color-mix(in srgb, var(--green) 8%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>{item.icon}</div>
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', letterSpacing: 2, marginBottom: 4 }}>{item.label}</div>
                <div style={{ fontSize: 15, color: 'var(--text)' }}>
                  <EditableText contentKey={item.key} defaultValue={item.def} />
                </div>
              </div>
            </div>
          ))}

          <button onClick={() => navigate(from)} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2, background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)', padding: '10px 20px', cursor: 'pointer', marginTop: 8, transition: 'all 0.2s' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--green)'; e.currentTarget.style.color = 'var(--green)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted)' }}
          >â† Back</button>
        </div>

        <form ref={rightRef} className="fade-up" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }} className="contact-name-row">
            <div className="form-group">
              <label>Your Name</label>
              <input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder="John Doe" required />
            </div>
            <div className="form-group">
              <label>Email Address</label>
              <input type="email" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))} placeholder="john@company.com" required />
            </div>
          </div>

          <div className="form-group">
            <label>Subject</label>
            <Select value={form.subject} onChange={v => setForm(f => ({...f, subject: v}))}
              placeholder="Select a topic"
              options={[['', 'Select a topic'], ...['Network Design','Security Audit','Cloud Migration','Server Administration','General Inquiry'].map(o => [o, o])]} />
          </div>

          <div className="form-group">
            <label>Message</label>
            <textarea value={form.message} onChange={e => setForm(f => ({...f, message: e.target.value}))} rows={6} placeholder="Describe your project or inquiry..." required />
          </div>

          {status && (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, padding: '12px 16px', color: 'var(--orange)', border: '1px solid rgba(255,107,53,0.3)', background: 'rgba(255,107,53,0.05)' }}>
              {status.msg}
            </div>
          )}

          <button type="submit" className="btn-primary" disabled={loading} style={{ alignSelf: 'flex-start', opacity: loading ? 0.7 : 1 }}>
            {loading ? 'Sending...' : 'Send Message'}
          </button>
        </form>
      </div>

      <style>{`
        .contact-page-section { padding: 120px 60px 80px; }
        @media (max-width: 900px) {
          .contact-page-section { padding: 100px 24px 60px !important; }
          .contact-grid { grid-template-columns: 1fr !important; gap: 40px !important; }
        }
        @media (max-width: 600px) {
          .contact-page-section { padding: 80px 16px 48px !important; }
          .contact-name-row { grid-template-columns: 1fr !important; }
          .contact-submit-btn { width: 100% !important; align-self: stretch !important; }
        }
        @media (max-width: 480px) {
          .contact-page-section { padding: 72px 12px 40px !important; }
        }
      `}</style>
    </section>
  )
}
