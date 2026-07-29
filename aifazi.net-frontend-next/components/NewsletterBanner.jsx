'use client'
import { useState } from 'react'
import api from '@/lib/api'

export default function NewsletterBanner() {
  const [email, setEmail]   = useState('')
  const [status, setStatus] = useState(null)
  const [msg, setMsg]       = useState('')

  const submit = async (e) => {
    e.preventDefault()
    if (!email.trim()) return
    setStatus('loading')
    try {
      await api.post('/newsletter/subscribe', { email })
      setStatus('success')
      setEmail('')
    } catch (err) {
      setStatus('error')
      setMsg(err.response?.data?.error || 'Something went wrong.')
    }
  }

  return (
    <section style={{
      borderTop: '1px solid var(--border)',
      background: 'var(--bg2)',
      position: 'relative',
      zIndex: 1,
      overflow: 'hidden',
      padding: '80px 60px',
    }}>

      {/* Grid background */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: `
          linear-gradient(rgba(0,255,136,0.03) 1px, transparent 1px),
          linear-gradient(90deg, rgba(0,255,136,0.03) 1px, transparent 1px)
        `,
        backgroundSize: '40px 40px',
      }} />

      {/* Accent lines */}
      <div style={{ position: 'absolute', top: 0, left: 60, width: 120, height: 2, background: 'linear-gradient(90deg, var(--green), transparent)' }} />
      <div style={{ position: 'absolute', bottom: 0, right: 60, width: 120, height: 2, background: 'linear-gradient(270deg, var(--cyan), transparent)' }} />

      <div style={{
        maxWidth: 1100, margin: '0 auto',
        display: 'grid', gridTemplateColumns: '1fr 1fr',
        gap: 80, alignItems: 'center',
        position: 'relative', zIndex: 2,
      }} className="newsletter-grid">

        {/* Left — copy */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <div style={{ width: 28, height: 1, background: 'var(--green)' }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 4, color: 'var(--green)' }}>NEWSLETTER_v1.0</span>
          </div>

          <h2 style={{
            fontFamily: 'var(--font-mono)', fontWeight: 700,
            fontSize: 'clamp(22px, 3vw, 36px)',
            lineHeight: 1.2, marginBottom: 20, color: 'var(--text)',
          }}>
            <span style={{ color: 'var(--green)' }}>$</span> subscribe<br />
            <span style={{ color: 'var(--muted)', fontSize: '0.65em' }}>--channel=blog --no-spam</span>
          </h2>

          <p style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.8, fontFamily: 'var(--font-display)', marginBottom: 28 }}>
            Deep-dives on networking, security, cloud infrastructure, and real-world IT engineering.
            Published when there's something worth reading.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {['✓  No spam. Ever.', '✓  One-click unsubscribe in every email.', '✓  New post → email goes out automatically.'].map((line, i) => (
              <div key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', letterSpacing: 1 }}>{line}</div>
            ))}
          </div>
        </div>

        {/* Right — terminal-style form */}
        <div className="terminal-panel newsletter-terminal" style={{ position: 'relative' }}>

          {/* Terminal title bar */}
          <div className="terminal-panel-header" style={{
            padding: '10px 16px',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {['#ff5f57','#ffbd2e','#28c840'].map((c, i) => (
              <div key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: c }} />
            ))}
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', letterSpacing: 2, marginLeft: 8 }}>
              visitor@aifazi.net — subscribe
            </span>
          </div>

          <div style={{ padding: '28px 28px 32px' }}>
            {/* Fake terminal lines */}
            <div style={{ marginBottom: 20 }}>
              {[
                { prompt: true,  text: 'newsletter --subscribe' },
                { prompt: false, text: '> Initializing secure channel...' },
                { prompt: false, text: '> Enter your email to subscribe:' },
              ].map((line, i) => (
                <div key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: line.prompt ? 'var(--green)' : 'var(--muted)', lineHeight: 1.9 }}>
                  {line.prompt && <span style={{ color: 'var(--cyan)', marginRight: 8 }}>$</span>}
                  {line.text}
                </div>
              ))}
            </div>

            {status === 'success' ? (
              <div style={{ padding: '8px 0' }}>
                {['> Validating address...', '> ✓ Subscribed successfully!', '> You\'ll hear from me on the next post.'].map((line, i) => (
                  <div key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: i === 1 ? 'var(--green)' : 'var(--muted)', lineHeight: 2 }}>{line}</div>
                ))}
              </div>
            ) : (
              <form onSubmit={submit}>
                <div className="terminal-prompt-row newsletter-prompt-row" style={{
                  display: 'flex', alignItems: 'center',
                  marginBottom: 20,
                }}>
                  <span className="terminal-prompt-label" style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--cyan)', flexShrink: 0 }}>{'>'}</span>
                  <input
                    className="terminal-command-input newsletter-command-input"
                    type="email" value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    required disabled={status === 'loading'}
                    style={{
                      flex: 1, color: 'var(--text)', fontFamily: 'var(--font-mono)',
                      fontSize: 13, caretColor: 'var(--green)',
                    }}
                  />
                  <span className="terminal-cursor" style={{ display: 'inline-block', width: 8, height: 14, background: 'var(--green)', marginLeft: 4, animation: 'blink 1s step-end infinite' }} />
                </div>

                <button type="submit" disabled={status === 'loading'}
                  style={{
                    width: '100%', padding: '12px',
                    background: 'transparent', border: '1px solid var(--green)',
                    color: 'var(--green)', fontFamily: 'var(--font-mono)',
                    fontSize: 11, letterSpacing: 3, cursor: 'pointer', transition: 'all 0.2s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--green)'; e.currentTarget.style.color = '#000' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--green)' }}
                >
                  {status === 'loading' ? 'SUBSCRIBING...' : '[ EXECUTE SUBSCRIBE ]'}
                </button>

                {status === 'error' && (
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--red)', marginTop: 10 }}>
                    {'>'} ERROR: {msg}
                  </div>
                )}
              </form>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @media(max-width:768px){
          .newsletter-grid { grid-template-columns: 1fr !important; gap: 40px !important; }
          section { padding: 60px 20px !important; }
        }
      `}</style>
    </section>
  )
}
