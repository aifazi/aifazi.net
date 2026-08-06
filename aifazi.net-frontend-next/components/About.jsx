'use client'
import { useReveal } from '../hooks/useReveal'
import { useSplitTextReveal } from '../hooks/useSplitTextReveal'
import { EditableText } from '../context/EditContext'
import AboutTerminal from './AboutTerminal'

// â”€â”€ Compact Quick Info â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function QuickInfo() {
  const ref = useReveal()

  const items = [
    { icon: 'â—‡', label: 'NAME', value: 'about.qi.name', def: 'Tanvir Aifazi', color: 'var(--green)' },
    { icon: 'â—Ž', label: 'LOCATION', value: 'about.qi.location', def: 'UAE / Remote', color: 'var(--cyan)' },
    { icon: 'â¬¡', label: 'FOCUS', value: 'about.qi.spec', def: 'Network & Security', color: 'var(--green)' },
    { icon: 'â—ˆ', label: 'CERTS', value: 'about.qi.certs', def: 'CCNA, FortiGate, AWS', color: 'var(--cyan)' },
    { icon: 'â—‰', label: 'EXP', value: 'about.qi.exp', def: '5+ Years', color: 'var(--green)' },
    { icon: 'â—†', label: 'LANGUAGES', value: 'about.qi.langs', def: 'English, Bengali', color: 'var(--cyan)' },
  ]

  return (
    <div ref={ref} className="fade-up" style={{
      background: 'var(--bg2)',
      border: '1px solid var(--border)',
      overflow: 'hidden',
      position: 'relative',
    }}>
      {/* Top accent line */}
      <div style={{ height: 1, background: 'linear-gradient(90deg, var(--green), var(--cyan), transparent)' }} />

      {/* Compact 2-column grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
      }} className="qi-grid">
        {items.map(({ icon, label, value, def, color }, i) => (
          <div key={label} style={{
            padding: '12px 16px',
            borderBottom: i < items.length - 2 ? '1px solid rgba(255,255,255,0.03)' : 'none',
            borderRight: i % 2 === 0 ? '1px solid rgba(255,255,255,0.03)' : 'none',
            display: 'flex', alignItems: 'center', gap: 10,
            transition: 'background 0.2s',
          }}
            onMouseEnter={e => e.currentTarget.style.background = 'color-mix(in srgb, var(--green) 2%, transparent)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <span style={{
              color, fontSize: 12, fontFamily: 'var(--font-mono)',
              flexShrink: 0,
            }}>{icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: 8,
                letterSpacing: 2, color: 'var(--muted)',
                marginBottom: 2,
              }}>{label}</div>
              <div style={{
                fontFamily: 'var(--font-display)', fontSize: 13,
                fontWeight: 600, color: 'var(--text)',
                lineHeight: 1.3,
                overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                <EditableText contentKey={value} defaultValue={def} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <style>{`
        @media (max-width: 600px) {
          .qi-grid { grid-template-columns: 1fr !important; }
          .qi-grid > div { border-right: none !important; }
        }
      `}</style>
    </div>
  )
}

export default function About() {
  const headerRef = useReveal()
  const titleRef  = useSplitTextReveal({ staggerMs: 35, fromY: 28 })
  const textRef = useReveal()
  const termRef = useReveal()

  return (
    <section id="about" style={{ padding: '120px 60px', background: 'var(--bg2)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', position: 'relative', zIndex: 1 }} className="about-section">
      <div ref={headerRef} className="fade-up section-header">
        <span className="section-tag">01 /</span>
        <h2 ref={titleRef} className="section-title">About Me</h2>
        <div className="section-line" />
      </div>

      <div className="about-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 80, alignItems: 'start' }}>
        {/* Left: Terminal + Quick Info stacked */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* Terminal */}
          <div ref={termRef} className="fade-up">
            <AboutTerminal />
          </div>

          {/* Compact Quick Info */}
          <QuickInfo />
        </div>

        {/* Right: bio text */}
        <div ref={textRef} className="fade-up">
          {[
            { key: 'about.p1', def: "I'm Tanvir, a dedicated Network Engineer and IT Specialist with a passion for building robust, scalable, and secure infrastructure. I thrive at the intersection of complex systems and practical problem-solving." },
            { key: 'about.p2', def: "With hands-on experience in enterprise networking, server administration, cloud infrastructure, and cybersecurity, I deliver end-to-end IT solutions that businesses rely on." },
            { key: 'about.p3', def: "Whether it's architecting a multi-site VPN, hardening firewalls, or migrating workloads to the cloud â€” I bring precision and reliability to every project." },
          ].map(({ key, def }, i) => (
            <p key={key} style={{ color: 'var(--muted)', lineHeight: 1.8, marginBottom: 20, fontSize: i === 0 ? 19 : 17, opacity: i === 0 ? 1 : 0.85 }}>
              <EditableText contentKey={key} defaultValue={def} multiline />
            </p>
          ))}
        </div>
      </div>

      <style>{`/* responsive handled by globals.css */`}</style>
    </section>
  )
}
