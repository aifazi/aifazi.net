'use client'
import { useState, useEffect, useRef } from 'react'
import { useReveal } from '../hooks/useReveal'
import { EditableText } from '../context/EditContext'
import api, { getAuthToken } from '@/lib/api'

export default function Newsletter() {
  const headerRef = useReveal()
  const [email, setEmail]   = useState('')
  const [status, setStatus] = useState(null)
  const [msg, setMsg]       = useState('')
  const [subscribed, setSubscribed] = useState(false)
  const [checking, setChecking] = useState(true)
  const inputRef = useRef(null)

  useEffect(() => {
    const check = async () => {
      try {
        const token = getAuthToken()
        if (!token) { setChecking(false); return }
        const payload = JSON.parse(atob(token.split('.')[1]))
        const userEmail = payload.email || payload.sub
        if (!userEmail) { setChecking(false); return }
        const res = await api.post('/newsletter/subscribe', { email: userEmail, check: true })
        if (res.data?.subscribed) { setSubscribed(true); setEmail(userEmail) }
      } catch {}
      setChecking(false)
    }
    check()
  }, [])

  const submit = async (e) => {
    e.preventDefault()
    if (!email.trim()) return
    setStatus('loading')
    try {
      await api.post('/newsletter/subscribe', { email })
      setStatus('success')
    } catch (err) {
      const errMsg = err.response?.data?.error || ''
      if (errMsg.toLowerCase().includes('already subscribed') || errMsg.toLowerCase().includes('already')) {
        setSubscribed(true)
        setStatus('subscribed')
        setMsg('You are already subscribed.')
      } else {
        setStatus('error')
        setMsg(errMsg || 'Something went wrong.')
      }
    }
  }

  const unsubscribe = async () => {
    setStatus('loading')
    try {
      await api.delete('/newsletter/unsubscribe', { data: { email } })
      setSubscribed(false)
      setStatus(null)
      setMsg('')
    } catch (err) {
      setStatus('error')
      setMsg(err.response?.data?.error || 'Failed to unsubscribe.')
    }
  }

  return (
    <section id="newsletter" style={{ padding: '120px 60px', background: 'var(--bg)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', position: 'relative', zIndex: 1 }} className="newsletter-section">

      <div ref={headerRef} className="fade-up section-header">
        <span className="section-tag">07 /</span>
        <h2 className="section-title">Newsletter</h2>
        <div className="section-line" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 60, alignItems: 'center' }} className="newsletter-grid">

        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <div style={{ width: 28, height: 1, background: 'var(--green)' }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 4, color: 'var(--green)' }}>NEWSLETTER_v1.0</span>
          </div>
          <h3 style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 'clamp(20px, 2.5vw, 32px)', lineHeight: 1.2, marginBottom: 16, color: 'var(--text)' }}>
            <span style={{ color: 'var(--green)' }}>$</span> subscribe<br />
            <span style={{ color: 'var(--muted)', fontSize: '0.65em' }}>--channel=blog --no-spam</span>
          </h3>
          <p style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.8, fontFamily: 'var(--font-display)', marginBottom: 20 }}>
            <EditableText contentKey="newsletter.desc" defaultValue="Deep-dives on networking, security, cloud infrastructure, and real-world IT engineering. Published when there's something worth reading." multiline />
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {['✓  No spam. Ever.', '✓  One-click unsubscribe in every email.', '✓  New post → email goes out automatically.'].map((l, i) => (
              <div key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', letterSpacing: 1 }}>{l}</div>
            ))}
          </div>
        </div>

        <div className="terminal-panel newsletter-terminal">
          <div className="terminal-panel-header" style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 6 }}>
            {['#ff5f57','#ffbd2e','#28c840'].map((c, i) => (
              <div key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: c }} />
            ))}
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', letterSpacing: 2, marginLeft: 8 }}>visitor@aifazi.net — subscribe</span>
          </div>

          <div style={{ padding: '24px 24px 28px' }}>
            <div style={{ marginBottom: 16 }}>
              {[
                { prompt: true,  text: 'newsletter --subscribe' },
                { prompt: false, text: '> Initializing secure channel...' },
                { prompt: false, text: subscribed ? '> You are subscribed. Use the button below to manage.' : '> Enter your email to subscribe:' },
              ].map((line, i) => (
                <div key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: line.prompt ? 'var(--green)' : 'var(--muted)', lineHeight: 1.9 }}>
                  {line.prompt && <span style={{ color: 'var(--cyan)', marginRight: 8 }}>$</span>}
                  {line.text}
                </div>
              ))}
            </div>

            {status === 'success' ? (
              <div>
                {['> Validating address...', '> ✓ Subscribed successfully!', "> You'll hear from me on the next post."].map((line, i) => (
                  <div key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: i === 1 ? 'var(--green)' : 'var(--muted)', lineHeight: 2 }}>{line}</div>
                ))}
                <div style={{ marginTop: 14, display: 'flex', gap: 10 }}>
                  <button onClick={unsubscribe} disabled={status === 'loading'}
                    style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--muted)', color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 2, cursor: 'pointer', transition: 'all 0.2s' }}
                    onMouseEnter={e => { e.currentTarget.style.color = 'var(--red)'; e.currentTarget.style.borderColor = 'var(--red)' }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.borderColor = 'var(--muted)' }}
                  >
                    UNSUBSCRIBE
                  </button>
                </div>
              </div>
            ) : subscribed ? (
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--green)', lineHeight: 2 }}>
                  {'>'} ✓ Subscribed ({email})
                </div>
                <button onClick={unsubscribe} disabled={status === 'loading'}
                  style={{ marginTop: 14, padding: '8px 16px', background: 'transparent', border: '1px solid var(--muted)', color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 2, cursor: 'pointer', transition: 'all 0.2s' }}
                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--red)'; e.currentTarget.style.borderColor = 'var(--red)' }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.borderColor = 'var(--muted)' }}
                >
                  {status === 'loading' ? 'PROCESSING...' : '[ UNSUBSCRIBE ]'}
                </button>
              </div>
            ) : (
              <form onSubmit={submit}>
                <div className="terminal-prompt-row newsletter-prompt-row" style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
                  <span className="terminal-prompt-label" style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--cyan)', flexShrink: 0 }}>{'>'}</span>
                  <input
                    className="terminal-command-input newsletter-command-input"
                    ref={inputRef}
                    type="email" value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="your@email.com" required disabled={status === 'loading'}
                    style={{ flex: 1, color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: 13, caretColor: 'var(--green)' }}
                  />
                  <span className="terminal-cursor" style={{ display: 'inline-block', width: 8, height: 14, background: 'var(--green)', marginLeft: 4, animation: 'blink 1s step-end infinite' }} />
                </div>
                <button type="submit" disabled={status === 'loading'}
                  style={{ width: '100%', padding: '11px', background: 'transparent', border: '1px solid var(--green)', color: 'var(--green)', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 3, cursor: 'pointer', transition: 'all 0.2s' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--green)'; e.currentTarget.style.color = '#000' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--green)' }}
                >
                  {status === 'loading' ? 'SUBSCRIBING...' : '[ EXECUTE SUBSCRIBE ]'}
                </button>
                {status === 'error' && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--red)', marginTop: 8 }}>{'>'} ERROR: {msg}</div>}
              </form>
            )}
          </div>
        </div>
      </div>

      <style>{`@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }`}</style>
    </section>
  )
}
