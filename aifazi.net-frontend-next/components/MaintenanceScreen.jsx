'use client'
import { useState, useEffect } from 'react'

// ── Small helpers ─────────────────────────────────────────────────────────────
function Particle({ style }) {
  return <div style={{ position: 'absolute', width: 2, height: 2, borderRadius: '50%', background: 'rgba(0,212,255,0.35)', pointerEvents: 'none', ...style }} />
}

function ProgressBar({ value, color = '#f59e0b', label }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 2, color: 'var(--muted)' }}>{label}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color }}>{value}%</span>
      </div>
      <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: 2, background: `linear-gradient(90deg, ${color}, ${color}88)`, width: `${value}%`, transition: 'width 1.2s cubic-bezier(0.16,1,0.3,1)', boxShadow: `0 0 8px ${color}88` }} />
      </div>
    </div>
  )
}

// ── Status badge colours ──────────────────────────────────────────────────────
const STATUS_COLORS = {
  'MAINTENANCE': '#f59e0b',
  'UPDATING':    '#00d4ff',
  'COMING SOON': '#a855f7',
  'OFFLINE':     '#ef4444',
  'UPGRADING':   '#00ff88',
}

// ── Background patterns ───────────────────────────────────────────────────────
function BgPattern({ bgStyle, accentColor }) {
  const c = accentColor + '08'
  const c2 = accentColor + '04'
  if (bgStyle === 'clean') return null
  if (bgStyle === 'radial') return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
      background: `radial-gradient(ellipse at 50% 50%, ${accentColor}10 0%, transparent 70%)` }} />
  )
  if (bgStyle === 'dots') return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
      backgroundImage: `radial-gradient(circle, ${accentColor}20 1px, transparent 1px)`,
      backgroundSize: '32px 32px' }} />
  )
  if (bgStyle === 'matrix') return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      {Array.from({ length: 20 }).map((_, i) => (
        <div key={i} style={{ position: 'absolute', top: 0, left: `${i * 5}%`, width: 1, height: '100%',
          background: `linear-gradient(to bottom, transparent, ${accentColor}30, transparent)`,
          animation: `maint-matrix-fall ${2 + i * 0.3}s linear ${i * 0.1}s infinite` }} />
      ))}
    </div>
  )
  // default: grid
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
      backgroundImage: `linear-gradient(${c} 1px,transparent 1px),linear-gradient(90deg,${c} 1px,transparent 1px)`,
      backgroundSize: '40px 40px' }} />
  )
}

// ── Style renderers ───────────────────────────────────────────────────────────
function StyleTerminal({ message, status, icon, returnTime, showProgress, progress, elapsed, dots, accentColor }) {
  return (
    <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', padding: '24px', maxWidth: 600, width: '100%' }}>
      {/* Badge */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 16px', background: accentColor + '14', border: `1px solid ${accentColor}40`, borderRadius: 20 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: accentColor, boxShadow: `0 0 8px ${accentColor}`, animation: 'maint-blink 1.4s infinite' }} />
          <span style={{ fontSize: 9, letterSpacing: 4, color: accentColor }}>{status}</span>
        </div>
      </div>
      {/* Icon */}
      <div style={{ position: 'relative', display: 'inline-block', marginBottom: 16 }}>
        <div style={{ width: 80, height: 80, borderRadius: '50%', margin: '0 auto', background: accentColor + '14', border: `1px solid ${accentColor}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 34, boxShadow: `0 0 40px ${accentColor}26`, animation: 'maint-pulse 2.5s ease-in-out infinite' }}>{icon}</div>
        <div style={{ position: 'absolute', inset: -8, borderRadius: '50%', border: `1px dashed ${accentColor}33`, animation: 'maint-spin-slow 12s linear infinite' }} />
      </div>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(28px,5vw,48px)', fontWeight: 800, letterSpacing: -1, marginBottom: 10, color: 'var(--text)', lineHeight: 1.1 }}>
        Down for<br /><span style={{ color: accentColor, textShadow: `0 0 30px ${accentColor}66` }}>Maintenance</span>
      </h1>
      <p style={{ fontSize: 13, lineHeight: 1.8, color: 'var(--muted)', margin: '0 auto 24px', maxWidth: 440 }}>{message}</p>
      {/* Terminal panel */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', marginBottom: 16, textAlign: 'left' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
          {['#ff5f56', '#ffbd2e', '#27c93f'].map(c => <div key={c} style={{ width: 9, height: 9, borderRadius: '50%', background: c }} />)}
          <span style={{ fontSize: 8, color: 'var(--muted)', letterSpacing: 2, marginLeft: 'auto' }}>maintenance.sh</span>
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 2 }}>
          <div><span style={{ color: 'var(--green)' }}>$</span> <span style={{ color: 'var(--cyan)' }}>status</span></div>
          <div style={{ paddingLeft: 16, color: accentColor, animation: 'maint-blink 1.4s infinite' }}>{status}</div>
          <div><span style={{ color: 'var(--green)' }}>$</span> <span style={{ color: 'var(--cyan)' }}>uptime</span></div>
          <div style={{ paddingLeft: 16, color: 'var(--text)' }}>{Math.floor(elapsed / 60)}m {elapsed % 60}s</div>
          <div><span style={{ color: 'var(--green)' }}>$</span> <span style={{ color: 'var(--cyan)' }}>echo{' '}</span><span style={{ color: 'var(--muted)' }}>"Working{'.'.repeat(dots)}"</span></div>
        </div>
      </div>
      {showProgress && <ProgressBar label="PROGRESS" value={progress} color={accentColor} />}
      {returnTime && (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', letterSpacing: 2, marginTop: 12 }}>
          ETA: <span style={{ color: accentColor }}>{returnTime}</span>
        </div>
      )}
    </div>
  )
}

function StyleMinimal({ message, status, icon, returnTime, showProgress, progress, accentColor }) {
  return (
    <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', padding: '40px 24px', maxWidth: 480, width: '100%' }}>
      <div style={{ fontSize: 64, marginBottom: 24 }}>{icon}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 6, color: accentColor, marginBottom: 16 }}>{status}</div>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(32px,6vw,56px)', fontWeight: 900, color: 'var(--text)', marginBottom: 16, letterSpacing: -2 }}>
        We'll be<br />back soon
      </h1>
      <p style={{ fontSize: 14, lineHeight: 1.8, color: 'var(--muted)', marginBottom: 32 }}>{message}</p>
      {showProgress && (
        <div style={{ height: 2, background: 'var(--border)', borderRadius: 1, overflow: 'hidden', marginBottom: 16 }}>
          <div style={{ height: '100%', background: accentColor, width: `${progress}%`, transition: 'width 1s ease', boxShadow: `0 0 8px ${accentColor}` }} />
        </div>
      )}
      {returnTime && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', letterSpacing: 2 }}>Back by {returnTime}</div>}
    </div>
  )
}

function StyleCyber({ message, status, icon, returnTime, showProgress, progress, elapsed, accentColor }) {
  return (
    <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', padding: '24px', maxWidth: 640, width: '100%' }}>
      {/* Glowing title */}
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 8, color: accentColor, marginBottom: 8, opacity: 0.7 }}>// SYSTEM ALERT</div>
      <h1 style={{ fontFamily: 'var(--font-mono)', fontSize: 'clamp(36px,6vw,68px)', fontWeight: 900, color: accentColor, textShadow: `0 0 20px ${accentColor}, 0 0 60px ${accentColor}44`, marginBottom: 8, letterSpacing: -1, lineHeight: 1 }}>
        {icon} {status}
      </h1>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--muted)', marginBottom: 24, letterSpacing: 2 }}>
        UPTIME: {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2,'0')}
      </div>
      <div style={{ background: 'rgba(0,0,0,0.4)', border: `1px solid ${accentColor}40`, padding: '20px', marginBottom: 20, borderRadius: 4 }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text)', lineHeight: 1.8, margin: 0 }}>{message}</p>
      </div>
      {showProgress && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 2, color: 'var(--muted)', marginBottom: 6 }}>
            <span>PROGRESS</span><span style={{ color: accentColor }}>{progress}%</span>
          </div>
          <div style={{ height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', background: `linear-gradient(90deg, ${accentColor}, ${accentColor}66)`, width: `${progress}%`, transition: 'width 1s ease', boxShadow: `0 0 12px ${accentColor}` }} />
          </div>
        </div>
      )}
      {returnTime && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: accentColor, letterSpacing: 3 }}>ETA // {returnTime}</div>}
    </div>
  )
}

function StyleGlitch({ message, status, icon, returnTime, showProgress, progress, accentColor }) {
  return (
    <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', padding: '24px', maxWidth: 560, width: '100%' }}>
      <div style={{ fontSize: 72, marginBottom: 12, animation: 'maint-glitch 3s ease-in-out infinite' }}>{icon}</div>
      <h1 style={{ fontFamily: 'var(--font-mono)', fontSize: 'clamp(40px,7vw,72px)', fontWeight: 900, color: accentColor, textShadow: `2px 0 ${accentColor}, -2px 0 #ff0088, 0 0 30px ${accentColor}88`, animation: 'maint-glitch-text 4s ease 2s infinite', marginBottom: 16, letterSpacing: -2 }}>
        {status}
      </h1>
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--muted)', lineHeight: 1.8, marginBottom: 24 }}>{message}</p>
      {showProgress && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 2, color: 'var(--muted)', marginBottom: 6 }}>
            <span>PROGRESS</span><span style={{ color: accentColor }}>{progress}%</span>
          </div>
          <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', background: `linear-gradient(90deg, ${accentColor}, ${accentColor}66)`, width: `${progress}%`, transition: 'width 1s ease', boxShadow: `0 0 10px ${accentColor}` }} />
          </div>
        </div>
      )}
      {returnTime && (
        <div style={{ display: 'inline-block', fontFamily: 'var(--font-mono)', fontSize: 10, color: accentColor, letterSpacing: 3, padding: '6px 18px', border: `1px solid ${accentColor}40`, animation: 'maint-blink 2s infinite' }}>
          ETA: {returnTime} MIN
        </div>
      )}
    </div>
  )
}

function StyleComingSoon({ message, status, icon, returnTime, showProgress, progress, siteConfig, accentColor }) {
  return (
    <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', padding: '40px 24px', maxWidth: 540, width: '100%' }}>
      <div style={{ fontSize: 56, marginBottom: 20 }}>{icon}</div>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(36px,6vw,64px)', fontWeight: 900, color: 'var(--text)', marginBottom: 12, lineHeight: 1.1 }}>
        {siteConfig?.siteName || 'Coming Soon'}
      </h1>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 4, color: accentColor, marginBottom: 20 }}>{status}</div>
      <p style={{ fontSize: 14, lineHeight: 1.8, color: 'var(--muted)', marginBottom: 32, maxWidth: 400, margin: '0 auto 32px' }}>{message}</p>
      {showProgress && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', letterSpacing: 2, marginBottom: 8 }}>PROGRESS — {progress}%</div>
          <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 3, background: `linear-gradient(90deg, ${accentColor}, ${accentColor}88)`, width: `${progress}%`, transition: 'width 1s ease', boxShadow: `0 0 12px ${accentColor}` }} />
          </div>
        </div>
      )}
      {returnTime && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', letterSpacing: 2 }}>Launching {returnTime}</div>}
    </div>
  )
}

function StyleRetro({ message, status, icon, returnTime, showProgress, progress, elapsed, accentColor }) {
  return (
    <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', padding: '32px 24px', maxWidth: 580, width: '100%',
      border: `3px solid ${accentColor}`, boxShadow: `8px 8px 0 ${accentColor}40`, background: 'var(--bg)' }}>
      <div style={{ borderBottom: `2px solid ${accentColor}`, paddingBottom: 12, marginBottom: 20, fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
        <span style={{ color: accentColor, fontSize: 16 }}>{icon}</span>
        <span style={{ fontSize: 11, letterSpacing: 4, color: accentColor }}>{status}</span>
        <span style={{ color: accentColor, fontSize: 16 }}>{icon}</span>
      </div>
      <h1 style={{ fontFamily: 'var(--font-mono)', fontSize: 'clamp(28px,4vw,44px)', fontWeight: 900, color: 'var(--text)', marginBottom: 16, letterSpacing: 2, lineHeight: 1.2 }}>
        SYSTEM DOWN
      </h1>
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1.8, color: 'var(--muted)', marginBottom: 20 }}>{message}</p>
      {showProgress && (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', marginBottom: 16, textAlign: 'left' }}>
          <span style={{ color: accentColor }}>[{'█'.repeat(Math.floor(progress / 5))}{'░'.repeat(20 - Math.floor(progress / 5))}]</span> {progress}%
        </div>
      )}
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: accentColor, letterSpacing: 2 }}>
        UPTIME: {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}{returnTime ? ` | ETA: ${returnTime}` : ''}
      </div>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function MaintenanceScreen({
  message        = "We're performing scheduled upgrades to improve your experience. We'll be back online shortly.",
  style          = 'terminal',
  status         = 'MAINTENANCE',
  icon           = '⚙️',
  returnTime     = '',
  showProgress   = false,
  progress       = 0,
  showSocial     = true,
  bgStyle        = 'grid',
  siteConfig     = {},
}) {
  const [dots, setDots]     = useState(0)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const d = setInterval(() => setDots(p => (p + 1) % 4), 500)
    const e = setInterval(() => setElapsed(p => p + 1), 1000)
    return () => { clearInterval(d); clearInterval(e) }
  }, [])

  const accentColor = STATUS_COLORS[status] || '#f59e0b'

  const sharedProps = { message, status, icon, returnTime, showProgress, progress, elapsed, dots, accentColor, siteConfig }

  const particles = [
    { top:'12%', left:'8%' }, { top:'28%', left:'92%' }, { top:'55%', left:'4%' },
    { top:'70%', left:'95%' }, { top:'85%', left:'15%' }, { top:'18%', left:'78%' },
    { top:'42%', left:'88%' }, { top:'92%', left:'60%' }, { top:'6%', left:'50%' }, { top:'75%', left:'35%' },
  ]

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>

      {/* Background */}
      <BgPattern bgStyle={bgStyle} accentColor={accentColor} />

      {/* Ambient orbs */}
      <div style={{ position: 'absolute', width: 700, height: 700, borderRadius: '50%', background: `radial-gradient(circle,${accentColor}0f 0%,transparent 70%)`, top: '-15%', left: '-15%', pointerEvents: 'none', animation: 'maint-drift 12s ease-in-out infinite' }} />
      <div style={{ position: 'absolute', width: 500, height: 500, borderRadius: '50%', background: `radial-gradient(circle,rgba(0,212,255,0.05) 0%,transparent 70%)`, bottom: '-12%', right: '-12%', pointerEvents: 'none', animation: 'maint-drift 16s ease-in-out infinite reverse' }} />

      {/* Particles */}
      {particles.map((p, i) => <Particle key={i} style={{ top: p.top, left: p.left, animation: `maint-float ${4+i*0.5}s ease-in-out ${i*0.3}s infinite alternate` }} />)}

      {/* Corner accents */}
      {['tl','tr','bl','br'].map(pos => (
        <div key={pos} style={{ position: 'absolute',
          top:    pos.includes('t') ? 16 : 'auto', bottom: pos.includes('b') ? 16 : 'auto',
          left:   pos.includes('l') ? 16 : 'auto', right:  pos.includes('r') ? 16 : 'auto',
          width: 40, height: 40, pointerEvents: 'none',
          borderTop:    pos.includes('t') ? `1px solid ${accentColor}40` : 'none',
          borderBottom: pos.includes('b') ? `1px solid ${accentColor}40` : 'none',
          borderLeft:   pos.includes('l') ? `1px solid ${accentColor}40` : 'none',
          borderRight:  pos.includes('r') ? `1px solid ${accentColor}40` : 'none',
        }} />
      ))}

      {/* Content — style switch */}
      {style === 'minimal'     && <StyleMinimal     {...sharedProps} />}
      {style === 'cyber'       && <StyleCyber        {...sharedProps} />}
      {style === 'glitch'      && <StyleGlitch       {...sharedProps} />}
      {style === 'coming-soon' && <StyleComingSoon   {...sharedProps} />}
      {style === 'retro'       && <StyleRetro        {...sharedProps} />}
      {(style === 'terminal' || !['minimal','cyber','glitch','coming-soon','retro'].includes(style)) && <StyleTerminal {...sharedProps} />}

      {/* Social links (optional) */}
      {showSocial && (siteConfig.twitter || siteConfig.github || siteConfig.linkedin) && (
        <div style={{ position: 'absolute', bottom: 28, display: 'flex', gap: 12, zIndex: 2 }}>
          {siteConfig.twitter  && <a href={siteConfig.twitter}  target="_blank" rel="noopener" style={socialLink(accentColor)}>𝕏</a>}
          {siteConfig.github   && <a href={siteConfig.github}   target="_blank" rel="noopener" style={socialLink(accentColor)}>GH</a>}
          {siteConfig.linkedin && <a href={siteConfig.linkedin} target="_blank" rel="noopener" style={socialLink(accentColor)}>in</a>}
        </div>
      )}

      <style>{`
        @keyframes maint-drift      { 0%,100%{transform:translate(0,0)} 50%{transform:translate(24px,-18px)} }
        @keyframes maint-pulse      { 0%,100%{box-shadow:0 0 30px ${accentColor}26} 50%{box-shadow:0 0 55px ${accentColor}59} }
        @keyframes maint-spin       { to{transform:rotate(360deg)} }
        @keyframes maint-spin-slow  { to{transform:rotate(360deg)} }
        @keyframes maint-blink      { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes maint-float      { from{transform:translateY(0) scale(1)} to{transform:translateY(-12px) scale(1.5)} }
        @keyframes maint-glitch     { 0%,90%,100%{transform:none} 91%{transform:skewX(5deg)} 93%{transform:skewX(-5deg) translateX(4px)} 95%{transform:none} }
        @keyframes maint-glitch-text{ 0%,88%,100%{text-shadow:2px 0 currentColor,-2px 0 #ff0088} 89%{text-shadow:-4px 0 #ff0088,4px 0 currentColor} 91%{text-shadow:2px 0 currentColor,-2px 0 #ff0088} }
        @keyframes maint-matrix-fall{ 0%{opacity:0;transform:translateY(-100%)} 50%{opacity:1} 100%{opacity:0;transform:translateY(100%)} }
      `}</style>
    </div>
  )
}

const socialLink = (color) => ({
  fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1,
  color, border: `1px solid ${color}40`, padding: '5px 12px',
  textDecoration: 'none', borderRadius: 4, transition: 'all 0.2s',
})
