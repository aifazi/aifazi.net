'use client'
import { useState, useRef, useEffect } from 'react'

const SYSTEM_PROMPT = `You are Tanvir Aifazi's AI assistant embedded on his personal portfolio website at aifazi.net. You help visitors learn about Tanvir's skills, experience, projects, and services.

About Tanvir:
- Name: Tanvir Aifazi
- Role: Network Engineer & IT Specialist with 5+ years of experience
- Specialties: Cisco, FortiGate, pfSense, AWS, Docker, Linux, BGP, OSPF, VPN, Zero Trust

- Projects: Enterprise network redesigns, Zero Trust VPN gateways, hybrid cloud migrations, ISP backbone networks, Docker self-hosted stacks, security audits
- Services: Network design & architecture, security hardening, cloud infrastructure, IT consulting
- Contact: tanvir@aifazi.net | Website: aifazi.net

Be friendly, concise, and professional. Answer questions about Tanvir's work, skills, and how to get in touch. For anything unrelated to Tanvir or networking/IT, politely redirect. Keep responses short (2-4 sentences max unless asked for detail).`

const WELCOME = "Hi! I'm Tanvir's AI assistant. Ask me anything about his skills, projects, services, or how to get in touch! 👋"

export default function ChatWidget() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([{ role: 'assistant', content: WELCOME }])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [pulse, setPulse] = useState(true)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (open) {
      setPulse(false)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open])

  const send = async (overrideText) => {
    const text = (overrideText !== undefined ? overrideText : input).trim()
    if (!text || loading) return
    setInput('')

    const userMsg = { role: 'user', content: text }
    // Keep at most 20 messages (10 exchanges) to avoid context overflow
    const history = [...messages, userMsg].slice(-20)
    setMessages(history)
    setLoading(true)

    try {
      const res = await fetch('/api/chat/ai/public', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system: SYSTEM_PROMPT,
          messages: history.map(m => ({ role: m.role, content: m.content })),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        const errMsg = data.detail === 'AI not configured' || data.error === 'AI not configured'
          ? "The AI key isn't configured yet. Email tanvir@aifazi.net directly!"
          : `Error: ${data.detail || data.error || 'Something went wrong.'}`
        setMessages(prev => [...prev, { role: 'assistant', content: errMsg }])
        return
      }
      const reply = data.reply || "Sorry, I couldn't connect right now. Try emailing tanvir@aifazi.net directly!"
      setMessages(prev => [...prev, { role: 'assistant', content: reply }])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: "Connection error. You can reach Tanvir directly at tanvir@aifazi.net!" }])
    } finally {
      setLoading(false)
    }
  }

  const handleKey = e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }
  return (
    <>
      {/* Floating button */}
      <div style={{ position: 'fixed', bottom: 28, right: 28, zIndex: 9000 }}>
        {/* Tooltip */}
        {!open && pulse && (
          <div style={{
            position: 'absolute', bottom: '110%', right: 0,
            background: 'var(--bg2)', border: '1px solid var(--green)',
            padding: '8px 14px', whiteSpace: 'nowrap',
            fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--green)',
            letterSpacing: 1, marginBottom: 4,
            animation: 'fadeUp 0.5s 1.5s both',
            boxShadow: '0 0 20px rgba(0,255,136,0.15)',
          }}>
            Chat with Tanvir's AI ✨
            <div style={{ position: 'absolute', bottom: -5, right: 20, width: 8, height: 8, background: 'var(--bg2)', border: '0 0 1px 1px solid var(--green)', transform: 'rotate(45deg)', borderRight: '1px solid var(--green)', borderBottom: '1px solid var(--green)' }} />
          </div>
        )}
        <button
          onClick={() => setOpen(o => !o)}
          style={{
            width: 54, height: 54, borderRadius: '50%',
            background: open ? 'var(--bg2)' : 'linear-gradient(135deg, var(--green), var(--cyan))',
            border: `2px solid ${open ? 'var(--green)' : 'transparent'}`,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, boxShadow: '0 4px 20px rgba(0,255,136,0.4)',
            transition: 'all 0.3s',
            animation: pulse && !open ? 'chat-pulse 2s ease-in-out infinite' : 'none',
          }}
        >
          {open ? '✕' : '💬'}
        </button>
      </div>

      {/* Chat window */}
      {open && (
        <div style={{
          position: 'fixed', bottom: 96, right: 28, zIndex: 8999,
          width: 340, height: 480,
          background: 'var(--bg2)', border: '1px solid var(--border)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5), 0 0 40px rgba(0,255,136,0.08)',
          display: 'flex', flexDirection: 'column',
          animation: 'slideUp 0.25s ease',
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            padding: '14px 16px', background: 'var(--bg3)',
            borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%',
              background: 'linear-gradient(135deg, rgba(0,255,136,0.2), rgba(0,212,255,0.2))',
              border: '1px solid var(--green)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18, flexShrink: 0,
            }}>🤖</div>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Tanvir's AI</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', animation: 'glow-pulse 2s infinite' }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--green)', letterSpacing: 1 }}>ONLINE</span>
              </div>
            </div>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {messages.map((msg, i) => (
              <div key={i} style={{
                display: 'flex',
                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
              }}>
                <div style={{
                  maxWidth: '80%', padding: '10px 14px',
                  background: msg.role === 'user'
                    ? 'linear-gradient(135deg, rgba(0,255,136,0.15), rgba(0,212,255,0.1))'
                    : 'var(--bg3)',
                  border: `1px solid ${msg.role === 'user' ? 'rgba(0,255,136,0.2)' : 'var(--border)'}`,
                  fontSize: 13, lineHeight: 1.6, color: 'var(--text)',
                  fontFamily: 'var(--font-display)',
                }}>
                  {msg.content}
                </div>
              </div>
            ))}
            {loading && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{ padding: '10px 16px', background: 'var(--bg3)', border: '1px solid var(--border)', display: 'flex', gap: 4, alignItems: 'center' }}>
                  {[0,1,2].map(i => (
                    <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', animation: `bounce 1s ${i * 0.15}s infinite` }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Quick questions */}
          {messages.length === 1 && (
            <div style={{ padding: '0 14px 10px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {['What are your skills?', 'Tell me about your projects', 'How to contact Tanvir?'].map(q => (
                <button key={q} onClick={() => send(q)}
                  style={{
                    fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 1,
                    padding: '5px 10px', background: 'transparent',
                    border: '1px solid var(--border)', color: 'var(--muted)',
                    cursor: 'pointer', transition: 'all 0.2s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--green)'; e.currentTarget.style.color = 'var(--green)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted)' }}
                >{q}</button>
              ))}
            </div>
          )}

          {/* Input */}
          <div style={{ padding: '10px 14px 14px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask me anything..."
              disabled={loading}
              style={{
                flex: 1, background: 'var(--bg3)', border: '1px solid var(--border)',
                borderRadius: 8,
                color: 'var(--text)', fontFamily: 'var(--font-display)',
                fontSize: 13, padding: '10px 14px', outline: 'none',
                transition: 'border-color 0.2s',
              }}
              onFocus={e => e.target.style.borderColor = 'var(--green)'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'}
            />
            <button
              onClick={send}
              disabled={loading || !input.trim()}
              style={{
                background: input.trim() && !loading ? 'var(--green)' : 'var(--bg3)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                color: input.trim() && !loading ? '#000' : 'var(--muted)',
                padding: '10px 14px', cursor: input.trim() && !loading ? 'pointer' : 'default',
                fontFamily: 'var(--font-mono)', fontSize: 12, transition: 'all 0.2s',
                flexShrink: 0,
              }}
            >→</button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes chat-pulse { 0%,100%{box-shadow:0 4px 20px rgba(0,255,136,0.3)} 50%{box-shadow:0 4px 30px rgba(0,255,136,0.7)} }
        @keyframes slideUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        @keyframes bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-5px)} }
      `}</style>
    </>
  )
}
