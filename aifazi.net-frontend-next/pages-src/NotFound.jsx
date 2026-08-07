'use client'
import { useEffect, useRef, useState } from 'react'
import { Link } from '@/lib/router-compat'

const TERMINAL_LINES = [
  { text: '$ traceroute /requested-page', delay: 300 },
  { text: 'Tracing route to destination...', delay: 700, color: 'var(--muted)' },
  { text: 'Request timeout for icmp_seq 1', delay: 1100, color: 'var(--orange)' },
  { text: 'Request timeout for icmp_seq 2', delay: 1500, color: 'var(--orange)' },
  { text: 'Request timeout for icmp_seq 3', delay: 1900, color: 'var(--orange)' },
  { text: 'ERROR: Destination unreachable.', delay: 2300, color: 'var(--red)' },
  { text: '404: Page not found in routing table.', delay: 2700, color: 'var(--red)' },
]

function Particle({ index }) {
  const [style] = useState(() => ({
    position: 'absolute',
    width: Math.random() * 3 + 1 + 'px',
    height: Math.random() * 3 + 1 + 'px',
    borderRadius: '50%',
    background: index % 2 === 0 ? 'var(--green)' : 'var(--cyan)',
    left: Math.random() * 100 + '%',
    top: Math.random() * 100 + '%',
    '--drift': (Math.random() - 0.5) * 60 + 'px',
    animation: `particle-rise ${2 + Math.random() * 3}s ease-out ${Math.random() * 4}s infinite`,
    opacity: 0.6,
    pointerEvents: 'none',
  }))
  return <div style={style} />
}

export default function NotFound() {
  const [lines, setLines] = useState([])
  const [glitching, setGlitching] = useState(false)

  useEffect(() => {
    TERMINAL_LINES.forEach(line => {
      setTimeout(() => setLines(prev => [...prev, line]), line.delay)
    })

    // Random glitch triggers
    const glitchInterval = setInterval(() => {
      setGlitching(true)
      setTimeout(() => setGlitching(false), 200)
    }, 3000)

    return () => clearInterval(glitchInterval)
  }, [])

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: '120px 40px 80px',
      position: 'relative', overflow: 'hidden', zIndex: 1,
    }}>
      {/* Particles */}
      <div suppressHydrationWarning style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {Array.from({ length: 30 }).map((_, i) => <Particle key={i} index={i} />)}
      </div>

      {/* Glow orbs */}
      <div style={{
        position: 'absolute', width: 600, height: 600, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(255,71,87,0.06) 0%, transparent 70%)',
        top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        pointerEvents: 'none', animation: 'pulse 4s ease-in-out infinite'
      }} />

      <div style={{ textAlign: 'center', maxWidth: 720, position: 'relative', zIndex: 2 }}>
        {/* Big 404 with glitch */}
        <div style={{ position: 'relative', marginBottom: 16, display: 'inline-block' }}>
          <div style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(120px, 22vw, 220px)',
            fontWeight: 700,
            lineHeight: 0.9,
            letterSpacing: -8,
            color: 'transparent',
            WebkitTextStroke: glitching ? '2px var(--red)' : '2px var(--muted)',
            transition: 'WebkitTextStroke 0.1s',
            position: 'relative',
            animation: 'fadeUp 0.8s ease both',
            userSelect: 'none',
          }}
          data-text="404"
          className={glitching ? 'glitch' : ''}
          >
            404
          </div>
          {/* Reflection */}
          <div style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(120px, 22vw, 220px)',
            fontWeight: 700,
            lineHeight: 0.9,
            letterSpacing: -8,
            color: 'transparent',
            WebkitTextStroke: '1px rgba(100,120,140,0.15)',
            position: 'absolute', top: '100%', left: 0,
            transform: 'scaleY(-0.3)',
            transformOrigin: 'top',
            WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, transparent 80%)',
            userSelect: 'none',
          }}>404</div>
        </div>

        {/* Title */}
        <h1 style={{
          fontFamily: 'var(--font-display)', fontSize: 'clamp(24px, 4vw, 40px)',
          fontWeight: 700, marginBottom: 16, letterSpacing: -1,
          animation: 'fadeUp 0.8s 0.2s ease both', opacity: 0,
          animationFillMode: 'forwards'
        }}>
          <span style={{ color: 'var(--red)' }}>PACKET LOST</span> — Route Not Found
        </h1>

        <p style={{
          color: 'var(--muted)', fontSize: 17, maxWidth: 460, margin: '0 auto 40px',
          lineHeight: 1.7,
          animation: 'fadeUp 0.8s 0.4s ease both', opacity: 0,
          animationFillMode: 'forwards'
        }}>
          The page you&apos;re looking for doesn&apos;t exist in the routing table.
          It may have been moved, deleted, or never deployed.
        </p>

        {/* Terminal */}
        <div style={{
          background: 'var(--bg2)', border: '1px solid var(--border)',
          borderRadius: 4, overflow: 'hidden', marginBottom: 40,
          textAlign: 'left', maxWidth: 480, margin: '0 auto 40px',
          animation: 'fadeUp 0.8s 0.6s ease both', opacity: 0,
          animationFillMode: 'forwards',
          boxShadow: '0 0 30px rgba(255,71,87,0.08)'
        }}>
          <div style={{
            background: 'rgba(255,71,87,0.08)', padding: '10px 16px',
            display: 'flex', alignItems: 'center', gap: 8,
            borderBottom: '1px solid var(--border)'
          }}>
            {['#ff5f56','#ffbd2e','#27c93f'].map(c => (
              <div key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c }} />
            ))}
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', letterSpacing: 2, margin: '0 auto' }}>
              network-diagnostic.sh
            </span>
          </div>
          <div style={{ padding: '16px 20px', minHeight: 160 }}>
            {lines.map((line, i) => (
              <div key={i} style={{
                fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.9,
                color: line.color || 'var(--text)',
                animation: 'fadeUp 0.3s ease both'
              }}>{line.text}</div>
            ))}
            {lines.length < TERMINAL_LINES.length && (
              <span style={{
                display: 'inline-block', width: 7, height: 13,
                background: 'var(--muted)', animation: 'blink 0.8s infinite',
                verticalAlign: 'middle', marginTop: 4
              }} />
            )}
          </div>
        </div>

        {/* Actions */}
        <div style={{
          display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap',
          animation: 'fadeUp 0.8s 0.8s ease both', opacity: 0,
          animationFillMode: 'forwards'
        }}>
          <Link to="/" className="btn-primary">← Back to Home</Link>
          <Link to="/blog" className="btn-outline">Read Blog</Link>
          <Link to="/forum" className="btn-outline">Visit Forum</Link>
          <Link to="/tools" className="btn-outline">🛠️ Tools</Link>
          <Link to="/contact" className="btn-outline">Contact</Link>
        </div>

        {/* Error code */}
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)',
          letterSpacing: 3, marginTop: 48,
          animation: 'fadeIn 1s 1.2s ease both', opacity: 0,
          animationFillMode: 'forwards'
        }}>
          ERR_ROUTE_NOT_FOUND · HTTP 404 · tanvir@aifazi.net
        </div>
      </div>
    </div>
  )
}
