/**
 * ChatPromo — disabled.
 * Removed per UX request. Re-enable by restoring the original implementation.
 */
export default function ChatPromo() {
  return null
}

function _ChatPromo_disabled() {
  const { user } = useForum()
  const [visible, setVisible]   = useState(false)
  const [leaving, setLeaving]   = useState(false)
  const [pulse, setPulse]       = useState(true)

  useEffect(() => {
    // Don't show if dismissed this session
    if (sessionStorage.getItem('chat-promo-dismissed')) return
    // Delay appearance — don't be annoying on first render
    const t = setTimeout(() => setVisible(true), 3500)
    return () => clearTimeout(t)
  }, [])

  // Pulse the dot every few seconds
  useEffect(() => {
    const iv = setInterval(() => setPulse(p => !p), 2000)
    return () => clearInterval(iv)
  }, [])

  const dismiss = () => {
    setLeaving(true)
    sessionStorage.setItem('chat-promo-dismissed', '1')
    setTimeout(() => setVisible(false), 400)
  }

  if (!visible) return null

  const chatPath = user ? '/chat' : '/login?next=/chat'
  const hasAccess = user && ['admin','moderator','chat'].includes(user.role)

  return (
    <>
      <style>{`
        @keyframes chatPromoIn {
          from { opacity: 0; transform: translateY(16px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes chatPromoOut {
          from { opacity: 1; transform: translateY(0) scale(1); }
          to   { opacity: 0; transform: translateY(12px) scale(0.96); }
        }
        .chat-promo-card {
          animation: ${leaving ? 'chatPromoOut' : 'chatPromoIn'} 0.38s cubic-bezier(0.25,1,0.5,1) both;
        }
        @keyframes liveDotPulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(255,107,53,0.6); }
          50%      { box-shadow: 0 0 0 6px rgba(255,107,53,0); }
        }
        .live-dot { animation: liveDotPulse 2s ease infinite; }
        @media (max-width: 600px) {
          .chat-promo-card { display: none !important; }
        }
      `}</style>

      <div className="chat-promo-card" style={{
        position: 'fixed',
        right: 80, bottom: 32,
        width: 280,
        background: 'var(--bg2)',
        border: '1px solid rgba(255,107,53,0.35)',
        borderRadius: 8,
        boxShadow: '0 8px 40px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,107,53,0.1)',
        zIndex: 990,
        overflow: 'hidden',
      }}>
        {/* Accent top bar */}
        <div style={{ height: 3, background: 'linear-gradient(90deg, #ff6b35, #ff4757, #ff6b35)', backgroundSize: '200% 100%' }} />

        <div style={{ padding: '16px 18px' }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ position: 'relative', width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,107,53,0.12)', border: '1px solid rgba(255,107,53,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                💬
                <span className="live-dot" style={{ position: 'absolute', bottom: 0, right: 0, width: 10, height: 10, borderRadius: '50%', background: '#ff6b35', border: '2px solid var(--bg2)' }} />
              </div>
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--text)', letterSpacing: 1 }}>Live Community Chat</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ff6b35', display: 'inline-block' }} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#ff6b35', letterSpacing: 1 }}>LIVE NOW</span>
                </div>
              </div>
            </div>
            <button onClick={dismiss} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 14, padding: '2px 4px', lineHeight: 1, opacity: 0.6 }} title="Dismiss">✕</button>
          </div>

          {/* Body */}
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', lineHeight: 1.7, margin: '0 0 14px' }}>
            {hasAccess
              ? <>You have access! Join the <span style={{ color: 'var(--text)' }}>real-time chat</span> with voice, video, and file sharing.</>
              : user
                ? <>Your account doesn&apos;t have chat access yet. Request access to join the community.</>
                : <>Join the community chat — voice, video, screen share &amp; more. <span style={{ color: 'var(--text)' }}>Sign in to get access.</span></>
            }
          </p>

          {/* CTA */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {hasAccess ? (
              <Link to="/chat" onClick={dismiss} style={{
                flex: 1, display: 'block', textAlign: 'center',
                fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2, fontWeight: 700,
                padding: '9px 0', background: '#ff6b35', color: '#fff',
                textDecoration: 'none', borderRadius: 4,
              }}>
                JOIN CHAT →
              </Link>
            ) : user ? (
              <Link to="/profile" onClick={dismiss} style={{
                flex: 1, display: 'block', textAlign: 'center',
                fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2,
                padding: '9px 0', background: 'rgba(255,107,53,0.12)', color: '#ff6b35',
                border: '1px solid rgba(255,107,53,0.35)', textDecoration: 'none', borderRadius: 4,
              }}>
                REQUEST ACCESS
              </Link>
            ) : (
              <>
                <Link to="/login?next=/chat" onClick={dismiss} style={{
                  flex: 1, display: 'block', textAlign: 'center',
                  fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2, fontWeight: 700,
                  padding: '9px 0', background: '#ff6b35', color: '#fff',
                  textDecoration: 'none', borderRadius: 4,
                }}>
                  SIGN IN
                </Link>
                <Link to="/forum/register" onClick={dismiss} style={{
                  flex: 1, display: 'block', textAlign: 'center',
                  fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2,
                  padding: '9px 0', background: 'transparent', color: 'var(--muted)',
                  border: '1px solid var(--border)', textDecoration: 'none', borderRadius: 4,
                }}>
                  REGISTER
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
