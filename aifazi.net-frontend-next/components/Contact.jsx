'use client'
import { useState } from 'react'
import { useReveal } from '../hooks/useReveal'
import { EditableText } from '../context/EditContext'
import api from '@/lib/api'

const SUBJECTS = ['Network Design', 'Security Audit', 'Cloud Migration', 'Server Admin', 'General Inquiry']

function FieldError({ msg }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6, marginTop: 4,
      fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--red)',
      animation: 'fieldShake 0.35s ease-out',
    }}>
      <span style={{ fontSize: 10 }}>⚠</span> {msg}
    </div>
  )
}

export default function Contact() {
  const headerRef = useReveal()
  const leftRef = useReveal()
  const rightRef = useReveal()

  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' })
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState({})

  const validate = () => {
    const e = {}
    if (!form.name.trim())    e.name    = 'Please enter your name.'
    if (!form.email.trim())   e.email   = 'Please enter your email address.'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Please enter a valid email address.'
    if (!form.subject)        e.subject = 'Please select a subject.'
    if (!form.message.trim()) e.message = 'Please describe your project or inquiry.'
    return e
  }

  const handleSubmit = async e => {
    e.preventDefault()
    const errs = validate()
    setErrors(errs)
    if (Object.keys(errs).length) return
    setLoading(true); setStatus(null)
    try {
      await api.post('/contact', form)
      setStatus({ type: 'success', msg: '> Message sent successfully! I\'ll get back to you soon.' })
      setForm({ name: '', email: '', subject: '', message: '' })
      setErrors({})
    } catch {
      setStatus({ type: 'error', msg: '> Failed to send. Please try again later.' })
    } finally { setLoading(false) }
  }

  return (
    <section id="contact" style={{ padding: '120px 60px', position: 'relative', zIndex: 1 }}>
      <div ref={headerRef} className="fade-up section-header">
        <span className="section-tag">08 /</span>
        <h2 className="section-title">Contact</h2>
        <div className="section-line" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: 80, alignItems: 'start' }} className="contact-grid">
        <div ref={leftRef} className="fade-up">
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700, marginBottom: 20 }}>
            <EditableText contentKey="contact.heading" defaultValue="Let's Work Together" />
          </h3>
          <p style={{ color: 'var(--muted)', lineHeight: 1.8, marginBottom: 40 }}>
            <EditableText contentKey="contact.subheading" defaultValue="Have a network challenge, IT project, or just want to talk infrastructure? I'm always open to new opportunities." multiline />
          </p>

          {[
            { icon: '📧', label: 'EMAIL',        key: 'contact.email',        def: 'tanvir@aifazi.net'        },
            { icon: '🌐', label: 'WEBSITE',      key: 'contact.website',      def: 'aifazi.net'               },
            { icon: '📍', label: 'AVAILABILITY', key: 'contact.availability', def: 'Remote / Worldwide'       },
            { icon: '💼', label: 'LINKEDIN',     key: 'contact.linkedin',     def: 'linkedin.com/in/tanvir'   },
          ].map(item => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, padding: '10px 14px', border: '1px solid var(--border)', background: 'var(--bg2)', transition: 'border-color 0.2s' }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--green) 30%, transparent)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
            >
              <span style={{ fontSize: 14, flexShrink: 0 }}>{item.icon}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 2, color: 'var(--cyan)', flexShrink: 0, minWidth: 80 }}>{item.label}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <EditableText contentKey={item.key} defaultValue={item.def} />
              </span>
            </div>
          ))}
        </div>

        <form ref={rightRef} className="fade-up" onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {status?.type === 'success' ? (
            <div style={{ padding: '40px 32px', background: 'var(--bg2)', border: '1px solid color-mix(in srgb, var(--green) 30%, transparent)', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 8, background: 'color-mix(in srgb, var(--green) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--green) 30%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>✓</div>
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--green)', letterSpacing: 2 }}>MESSAGE SENT</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text)', marginTop: 2 }}>I'll get back to you soon.</div>
                </div>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', lineHeight: 1.8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                <div style={{ color: 'var(--cyan)' }}>&gt; echo $RESPONSE_TIME</div>
                <div style={{ paddingLeft: 16 }}>Typically within 24–48 hours.</div>
              </div>
              <button type="button" onClick={() => setStatus(null)}
                style={{ alignSelf: 'flex-start', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2, padding: '8px 18px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer', transition: 'all 0.2s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--green)'; e.currentTarget.style.color = 'var(--green)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted)' }}
              >+ SEND ANOTHER</button>
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="form-group">
                  <label><span style={{ color: 'var(--cyan)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>{'>'}</span> NAME</label>
                  <input name="name" value={form.name}
                    onChange={e => { setForm(f => ({...f, name: e.target.value})); if (errors.name) setErrors(p => ({...p, name: ''})) }}
                    placeholder="John Doe"
                    style={errors.name ? { borderColor: 'var(--red)', boxShadow: '0 0 0 2px rgba(255,71,87,0.1)' } : {}} />
                  {errors.name && <FieldError msg={errors.name} />}
                </div>
                <div className="form-group">
                  <label><span style={{ color: 'var(--cyan)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>{'>'}</span> EMAIL</label>
                  <input name="email" type="email" value={form.email}
                    onChange={e => { setForm(f => ({...f, email: e.target.value})); if (errors.email) setErrors(p => ({...p, email: ''})) }}
                    placeholder="john@company.com"
                    style={errors.email ? { borderColor: 'var(--red)', boxShadow: '0 0 0 2px rgba(255,71,87,0.1)' } : {}} />
                  {errors.email && <FieldError msg={errors.email} />}
                </div>
              </div>

              <div className="form-group">
                <label><span style={{ color: 'var(--cyan)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>{'>'}</span> SUBJECT</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
                  {SUBJECTS.map(s => (
                    <button key={s} type="button" onClick={() => { setForm(f => ({...f, subject: f.subject === s ? '' : s})); setErrors(p => ({...p, subject: ''})) }}
                      style={{
                        fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1,
                        padding: '6px 14px', cursor: 'pointer', transition: 'all 0.2s',
                        background: form.subject === s ? 'color-mix(in srgb, var(--green) 12%, transparent)' : 'transparent',
                        border: form.subject === s ? '1px solid var(--green)' : errors.subject ? '1px solid rgba(255,71,87,0.5)' : '1px solid var(--border)',
                        color: form.subject === s ? 'var(--green)' : 'var(--muted)',
                      }}
                      onMouseEnter={e => { if (form.subject !== s) { e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--green) 30%, transparent)'; e.currentTarget.style.color = 'var(--text)' } }}
                      onMouseLeave={e => { if (form.subject !== s) { e.currentTarget.style.borderColor = errors.subject ? 'rgba(255,71,87,0.5)' : 'var(--border)'; e.currentTarget.style.color = 'var(--muted)' } }}
                    >{s}</button>
                  ))}
                </div>
                {errors.subject && <FieldError msg={errors.subject} />}
              </div>

              <div className="form-group">
                <label><span style={{ color: 'var(--cyan)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>{'>'}</span> MESSAGE</label>
                <textarea name="message" value={form.message}
                  onChange={e => { setForm(f => ({...f, message: e.target.value})); if (errors.message) setErrors(p => ({...p, message: ''})) }}
                  rows={6} placeholder="Describe your project or inquiry..."
                  style={errors.message ? { borderColor: 'var(--red)', boxShadow: '0 0 0 2px rgba(255,71,87,0.1)' } : {}} />
                {errors.message && <FieldError msg={errors.message} />}
              </div>

              {status?.type === 'error' && (
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, padding: '12px 16px', color: 'var(--orange)', border: '1px solid rgba(255,107,53,0.3)', background: 'rgba(255,107,53,0.05)' }}>
                  {status.msg}
                </div>
              )}

              <button type="submit" className="btn-primary" disabled={loading} style={{ alignSelf: 'flex-start', opacity: loading ? 0.7 : 1 }}>
                {loading ? 'Sending...' : 'Send Message'}
              </button>
            </>
          )}
        </form>
      </div>

      <style>{`/* responsive handled by globals.css */`}</style>
    </section>
  )
}
