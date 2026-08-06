'use client'
import { Link, useNavigate, useLocation } from '@/lib/router-compat'
import { getAuthToken, getRole } from '@/lib/api'
import { useState, useEffect, useRef } from 'react'
import LiveVisitorBadge from './LiveVisitorBadge'
import api from '@/lib/api'
import { getSiteSettings } from '@/lib/siteSettings'
import { isFiveMHost, fivemRoute, useFiveMRoute } from '@/lib/fivemRoutes'

// â”€â”€ Social icons â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const GitHubIcon   = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
const LinkedInIcon = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
const TwitterIcon  = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>

// â”€â”€ Animated status panel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function SystemStatus() {
  const services = [
    { label: 'API Server',     ok: true  },
    { label: 'Database',       ok: true  },
    { label: 'CDN / Media',    ok: true  },
    { label: 'Mail Service',   ok: true  },
    { label: 'Forum',          ok: true  },
  ]
  return (
    <div style={{
      background: 'color-mix(in srgb, var(--green) 3%, transparent)', border: '1px solid color-mix(in srgb, var(--green) 10%, transparent)',
      borderRadius: 8, padding: '14px 16px',
    }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 3, color: 'var(--cyan)', marginBottom: 10 }}>
        â—ˆ SYSTEM STATUS
      </div>
      {services.map(s => (
        <div key={s.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)' }}>{s.label}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: s.ok ? 'var(--green)' : '#ff4757',
              boxShadow: s.ok ? '0 0 6px var(--green)' : '0 0 6px #ff4757',
              animation: 'ftPulse 2s ease-in-out infinite',
            }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: s.ok ? 'var(--green)' : '#ff4757', letterSpacing: 1 }}>
              {s.ok ? 'UP' : 'DOWN'}
            </span>
          </div>
        </div>
      ))}
      <div suppressHydrationWarning style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid color-mix(in srgb, var(--green) 10%, transparent)', fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--muted)', letterSpacing: 1 }}>
        Last checked Â· {new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} UTC+4
      </div>
    </div>
  )
}

// â”€â”€ Skill / tech tag â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function TechBadge({ label, color }) {
  return (
    <span style={{
      fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 1,
      padding: '2px 8px', borderRadius: 3,
      background: `${color}10`, border: `1px solid ${color}30`, color,
    }}>{label}</span>
  )
}

// â”€â”€ Animated hexagon logo â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function FooterLogo() {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none" style={{ flexShrink: 0 }}>
      <polygon points="18,1 33,9.5 33,26.5 18,35 3,26.5 3,9.5"
        fill="none" stroke="var(--green)" strokeWidth="1.5" opacity="0.45"/>
      <polygon points="18,6 28,11.5 28,24.5 18,30 8,24.5 8,11.5"
        fill="var(--green)" opacity="0.05"/>
      <circle cx="3"  cy="9.5"  r="2" fill="var(--green)" opacity="0.5"/>
      <circle cx="33" cy="26.5" r="2" fill="var(--cyan)"  opacity="0.5"/>
      <line x1="11" y1="13" x2="25" y2="13" stroke="var(--green)" strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="18" y1="13" x2="18" y2="25" stroke="var(--green)" strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="25" y1="11" x2="25" y2="15" stroke="var(--cyan)" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

// â”€â”€ Newsletter inline input â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function MiniNewsletter() {
  const [email, setEmail]   = useState('')
  const [status, setStatus] = useState(null) // null | 'ok' | 'err'

  const submit = async () => {
    if (!email.includes('@')) { setStatus('err'); return }
    try {
      await api.post('/newsletter/subscribe', { email })
      setStatus('ok')
    } catch {
      setStatus('err')
    }
  }

  if (status === 'ok') return (
    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--green)', letterSpacing: 1, padding: '8px 0' }}>
      âœ“ Subscribed â€” thank you!
    </div>
  )

  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
      <input
        value={email} onChange={e => setEmail(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && submit()}
        placeholder="your@email.com"
        style={{
          flex: 1, background: 'var(--bg3)', border: `1px solid ${status === 'err' ? 'rgba(255,71,87,0.5)' : 'var(--border)'}`,
          outline: 'none', padding: '7px 10px',
          fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text)',
          borderRadius: 4, minWidth: 0,
        }}
      />
      <button onClick={submit} style={{
        fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 1, padding: '7px 14px',
        background: 'var(--green)', color: '#000', border: 'none', cursor: 'pointer',
        borderRadius: 4, fontWeight: 700, transition: 'opacity 0.2s', flexShrink: 0,
      }}
        onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
        onMouseLeave={e => e.currentTarget.style.opacity = '1'}
      >
        SUB â†’
      </button>
    </div>
  )
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// â”€â”€ Layout variant renderers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function FooterMinimal({ siteConfig, sectionLinks, platformLinks, socialLinks, hasAdminAccess, handleHashLink, year }) {
  return (
    <footer style={{ borderTop: '1px solid var(--border)', background: 'var(--bg2)', position: 'relative', zIndex: 1 }}>
      <div style={{ padding: '20px 60px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <Link to="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="24" height="24" viewBox="0 0 36 36" fill="none">
            <polygon points="18,1 33,9.5 33,26.5 18,35 3,26.5 3,9.5" fill="none" stroke="var(--green)" strokeWidth="1.5" opacity="0.5"/>
            <line x1="11" y1="13" x2="25" y2="13" stroke="var(--green)" strokeWidth="2.5" strokeLinecap="round"/>
            <line x1="18" y1="13" x2="18" y2="25" stroke="var(--green)" strokeWidth="2.5" strokeLinecap="round"/>
          </svg>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, letterSpacing: 3, color: 'var(--text)' }}>TANVIR.DEV</span>
        </Link>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
          {sectionLinks.map(({ label, hash }) => (
            <a key={hash} href={`/#${hash}`} onClick={e => handleHashLink(e, hash)}
              style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', textDecoration: 'none', letterSpacing: 1, transition: 'color 0.2s' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--green)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--muted)'}
            >{label}</a>
          ))}
          <div style={{ width: 1, height: 14, background: 'var(--border)' }} />
          {platformLinks.slice(0, 4).map(({ label, to }) => (
            <Link key={to} to={to}
              style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', textDecoration: 'none', letterSpacing: 1, transition: 'color 0.2s' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--green)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--muted)'}
            >{label}</Link>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {socialLinks.map(({ href, icon, label }) => (
            <a key={label} href={href} target="_blank" rel="noopener noreferrer" title={label}
              style={{ color: 'var(--muted)', transition: 'color 0.2s' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--green)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--muted)'}
            >{icon}</a>
          ))}
          <div style={{ width: 1, height: 14, background: 'var(--border)' }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', letterSpacing: 1 }}>Â© {year} tanvir@aifazi.net</span>
        </div>
      </div>
      <style>{`@media(max-width:768px){footer>div{flex-direction:column;text-align:center;padding:20px 24px!important;}}`}</style>
    </footer>
  )
}

function FooterMagazine({ siteConfig, sectionLinks, platformLinks, socialLinks, hasAdminAccess, handleHashLink, year }) {
  return (
    <footer style={{ borderTop: '3px solid var(--green)', background: 'var(--bg)', position: 'relative', zIndex: 1, overflow: 'hidden' }}>
      <div style={{ padding: '48px 60px 0' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr', gap: 48, marginBottom: 32 }}>
          <div>
            <div style={{ fontFamily: 'Georgia, serif', fontSize: 54, fontWeight: 900, color: 'var(--text)', lineHeight: 1, letterSpacing: -2, marginBottom: 8 }}>
              TANVIR
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 5, color: 'var(--green)', marginBottom: 20, textTransform: 'uppercase' }}>
              Network Engineer Â· Developer
            </div>
            <p style={{ fontFamily: 'Georgia, serif', fontSize: 13, color: 'var(--muted)', lineHeight: 1.9, maxWidth: 280, fontStyle: 'italic', marginBottom: 20 }}>
              Building web infrastructure and digital experiences for clients worldwide.
            </p>
            {socialLinks.length > 0 && (
              <div style={{ display: 'flex', gap: 10 }}>
                {socialLinks.map(({ href, icon, label }) => (
                  <a key={label} href={href} target="_blank" rel="noopener noreferrer" title={label}
                    style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border)', color: 'var(--muted)', textDecoration: 'none', transition: 'all 0.2s' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--green)'; e.currentTarget.style.color = 'var(--green)' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted)' }}
                  >{icon}</a>
                ))}
              </div>
            )}
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 3, color: 'var(--cyan)', marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>NAVIGATE</div>
            {sectionLinks.map(({ label, hash }) => (
              <a key={hash} href={`/#${hash}`} onClick={e => handleHashLink(e, hash)}
                style={{ display: 'block', fontFamily: 'Georgia, serif', fontSize: 13, color: 'var(--muted)', textDecoration: 'none', lineHeight: 2.4, transition: 'color 0.2s' }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--muted)'}
              >{label}</a>
            ))}
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 3, color: 'var(--cyan)', marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>PLATFORM</div>
            {platformLinks.map(({ label, to }) => (
              <Link key={to} to={to}
                style={{ display: 'block', fontFamily: 'Georgia, serif', fontSize: 13, color: 'var(--muted)', textDecoration: 'none', lineHeight: 2.4, transition: 'color 0.2s' }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--muted)'}
              >{label}</Link>
            ))}
          </div>
        </div>
        <div style={{ height: 1, background: 'linear-gradient(90deg, var(--green), var(--cyan), transparent)', marginBottom: 16 }} />
      </div>
      <div style={{ padding: '14px 60px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', letterSpacing: 1 }}>
          Â© {year} <span style={{ color: 'var(--green)' }}>tanvir@aifazi.net</span> Â· All rights reserved
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', letterSpacing: 1 }}>UAE / GMT+4</span>
      </div>
    </footer>
  )
}

function FooterGlass({ siteConfig, sectionLinks, platformLinks, socialLinks, hasAdminAccess, handleHashLink, year }) {
  return (
    <footer style={{ borderTop: '1px solid var(--border)', position: 'relative', zIndex: 1, overflow: 'hidden', background: 'var(--bg)', backdropFilter: 'blur(20px)' }}>
      <div aria-hidden style={{ position: 'absolute', top: -60, left: '20%', width: 400, height: 200, borderRadius: '50%', background: 'radial-gradient(circle,rgba(0,0,0,0) 0%,transparent 70%)', backgroundImage: 'radial-gradient(circle, var(--green) 0%, transparent 70%)', opacity: 0.05, pointerEvents: 'none' }} />
      <div style={{ position: 'relative', zIndex: 1, padding: '48px 60px 32px', display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 60 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <svg width="32" height="32" viewBox="0 0 36 36" fill="none">
              <polygon points="18,1 33,9.5 33,26.5 18,35 3,26.5 3,9.5" fill="none" stroke="var(--green)" strokeWidth="1.5" opacity="0.6"/>
              <line x1="11" y1="13" x2="25" y2="13" stroke="var(--green)" strokeWidth="2.5" strokeLinecap="round"/>
              <line x1="18" y1="13" x2="18" y2="25" stroke="var(--green)" strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, letterSpacing: 3, color: 'var(--text)', lineHeight: 1 }}>TANVIR</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 4, color: 'var(--green)', opacity: 0.7, marginTop: 3 }}>.DEV</div>
            </div>
          </div>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', lineHeight: 1.9, maxWidth: 320, marginBottom: 20 }}>
            Network Engineer &amp; Full-Stack Developer.<br/>Building web infrastructure Â· UAE Â· Remote
          </p>
          {socialLinks.length > 0 && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
              {socialLinks.map(({ href, icon, label }) => (
                <a key={label} href={href} target="_blank" rel="noopener noreferrer" title={label}
                  style={{ width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border)', color: 'var(--muted)', textDecoration: 'none', borderRadius: 8, transition: 'all 0.2s', background: 'var(--bg3)' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor='var(--green)'; e.currentTarget.style.color='var(--green)'; e.currentTarget.style.boxShadow='0 0 12px rgba(0,0,0,0.3)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.color='var(--muted)'; e.currentTarget.style.boxShadow='none' }}
                >{icon}</a>
              ))}
            </div>
          )}
          <LiveVisitorBadge />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 3, color: 'var(--cyan)', marginBottom: 14, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>NAVIGATE</div>
            {sectionLinks.map(({ label, hash }) => (
              <a key={hash} href={`/#${hash}`} onClick={e => handleHashLink(e, hash)}
                style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', textDecoration: 'none', lineHeight: 2.4, letterSpacing: 1, transition: 'color 0.2s' }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--green)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--muted)'}
              >{label}</a>
            ))}
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 3, color: 'var(--cyan)', marginBottom: 14, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>PLATFORM</div>
            {platformLinks.map(({ label, to }) => (
              <Link key={to} to={to}
                style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', textDecoration: 'none', lineHeight: 2.4, letterSpacing: 1, transition: 'color 0.2s' }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--green)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--muted)'}
              >{label}</Link>
            ))}
          </div>
        </div>
      </div>
      <div style={{ position: 'relative', zIndex: 1, padding: '12px 60px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, background: 'var(--bg3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', boxShadow: '0 0 8px var(--green)' }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', letterSpacing: 1 }}>ALL SYSTEMS OPERATIONAL</span>
        </div>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', letterSpacing: 1 }}>Â© {year} <span style={{ color: 'var(--green)' }}>tanvir@aifazi.net</span></span>
      </div>
    </footer>
  )
}

function FooterSynthwave({ siteConfig, sectionLinks, platformLinks, socialLinks, hasAdminAccess, handleHashLink, year }) {
  return (
    <footer style={{ borderTop: '2px solid var(--green)', background: 'var(--bg)', position: 'relative', zIndex: 1, overflow: 'hidden' }}>
      {/* Retro grid lines using theme colors */}
      <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(color-mix(in srgb, var(--green) 4%, transparent) 1px,transparent 1px),linear-gradient(90deg,color-mix(in srgb, var(--cyan) 4%, transparent) 1px,transparent 1px)', backgroundSize: '28px 28px', pointerEvents: 'none' }} />
      <div aria-hidden style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 80, background: 'linear-gradient(transparent, color-mix(in srgb, var(--green) 5%, transparent))', pointerEvents: 'none' }} />
      <div style={{ position: 'relative', zIndex: 1, padding: '48px 60px 0' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1fr 1fr', gap: 48, marginBottom: 32 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 36, fontWeight: 900, color: 'var(--text)', background: 'linear-gradient(135deg, var(--green), var(--cyan))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', lineHeight: 1, letterSpacing: -1, marginBottom: 6 }}>AIFAZI</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 4, color: 'var(--muted)', marginBottom: 18 }}>NETWORK ENGINEER Â· DEVELOPER</div>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', lineHeight: 1.9, maxWidth: 280, marginBottom: 20 }}>
              Building web infrastructure &amp; digital experiences. UAE Â· Remote Â· Global
            </p>
            {socialLinks.length > 0 && (
              <div style={{ display: 'flex', gap: 8 }}>
                {socialLinks.map(({ href, icon, label }) => (
                  <a key={label} href={href} target="_blank" rel="noopener noreferrer" title={label}
                    style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border)', color: 'var(--muted)', textDecoration: 'none', borderRadius: 4, transition: 'all 0.2s' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor='var(--green)'; e.currentTarget.style.color='var(--green)'; e.currentTarget.style.boxShadow='0 0 10px color-mix(in srgb, var(--green) 20%, transparent)' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.color='var(--muted)'; e.currentTarget.style.boxShadow='none' }}
                  >{icon}</a>
                ))}
              </div>
            )}
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 3, color: 'var(--cyan)', marginBottom: 14, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>NAVIGATE</div>
            {sectionLinks.map(({ label, hash }) => (
              <a key={hash} href={`/#${hash}`} onClick={e => handleHashLink(e, hash)}
                style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', textDecoration: 'none', lineHeight: 2.4, letterSpacing: 1, transition: 'color 0.2s' }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--green)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--muted)'}
              >{label}</a>
            ))}
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 3, color: 'var(--cyan)', marginBottom: 14, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>PLATFORM</div>
            {platformLinks.map(({ label, to }) => (
              <Link key={to} to={to}
                style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', textDecoration: 'none', lineHeight: 2.4, letterSpacing: 1, transition: 'color 0.2s' }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--green)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--muted)'}
              >{label}</Link>
            ))}
          </div>
        </div>
      </div>
      <div style={{ position: 'relative', zIndex: 1, padding: '12px 60px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, background: 'var(--bg3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', boxShadow: '0 0 8px var(--green)' }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', letterSpacing: 1 }}>ALL SYSTEMS OPERATIONAL Â· UAE / GMT+4</span>
        </div>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--green)', letterSpacing: 1 }}>Â© {year} tanvir@aifazi.net</span>
      </div>
    </footer>
  )
}

function FooterDarkCompact({ siteConfig, sectionLinks, platformLinks, socialLinks, hasAdminAccess, handleHashLink, year }) {
  const allLinks = [
    ...sectionLinks.map(l => ({ label: l.label, href: `/#${l.hash}`, isHash: true, hash: l.hash })),
    ...platformLinks.slice(0, 5).map(l => ({ label: l.label, href: l.to, isHash: false })),
  ]
  return (
    <footer style={{ borderTop: '1px solid var(--border)', background: 'var(--bg)', position: 'relative', zIndex: 1 }}>
      <div style={{ padding: '14px 60px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, borderBottom: '1px solid var(--border)' }}>
        <Link to="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <svg width="22" height="22" viewBox="0 0 36 36" fill="none">
            <polygon points="18,1 33,9.5 33,26.5 18,35 3,26.5 3,9.5" fill="none" stroke="var(--green)" strokeWidth="1.5" opacity="0.5"/>
            <line x1="11" y1="13" x2="25" y2="13" stroke="var(--green)" strokeWidth="2.5" strokeLinecap="round"/>
            <line x1="18" y1="13" x2="18" y2="25" stroke="var(--green)" strokeWidth="2.5" strokeLinecap="round"/>
          </svg>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: 3, color: 'var(--text)' }}>TANVIR.DEV</span>
        </Link>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center' }}>
          {allLinks.map((l, i) => l.isHash ? (
            <a key={i} href={l.href} onClick={e => handleHashLink(e, l.hash)}
              style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', textDecoration: 'none', letterSpacing: 1, transition: 'color 0.2s' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--green)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--muted)'}
            >{l.label}</a>
          ) : (
            <Link key={i} to={l.href}
              style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', textDecoration: 'none', letterSpacing: 1, transition: 'color 0.2s' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--green)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--muted)'}
            >{l.label}</Link>
          ))}
        </div>
        {socialLinks.length > 0 && (
          <div style={{ display: 'flex', gap: 6 }}>
            {socialLinks.map(({ href, icon, label }) => (
              <a key={label} href={href} target="_blank" rel="noopener noreferrer" title={label}
                style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border)', color: 'var(--muted)', textDecoration: 'none', borderRadius: 4, transition: 'all 0.2s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor='var(--green)'; e.currentTarget.style.color='var(--green)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.color='var(--muted)' }}
              >{icon}</a>
            ))}
          </div>
        )}
      </div>
      <div style={{ padding: '10px 60px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', boxShadow: '0 0 6px var(--green)' }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', letterSpacing: 1 }}>ALL SYSTEMS OPERATIONAL Â· UAE / GMT+4</span>
        </div>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', letterSpacing: 1 }}>
          Â© {year} <span style={{ color: 'var(--green)' }}>tanvir@aifazi.net</span>
        </span>
      </div>
    </footer>
  )
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// â”€â”€ FiveM footer (shown on /fivem/* routes and fivem.aifazi.net) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Shares the theme CSS vars, logo, and socials with the site chrome but
// presents FiveM-specific navigation, branding, and live server status.
function FooterFiveM({ socialLinks, year }) {
  const [status, setStatus] = useState(null)
  useEffect(() => {
    api.get('/fivem/status').then(r => setStatus(r.data || null)).catch(() => {})
  }, [])
  const online  = status?.status === 'online'
  const players = status?.players_online ?? status?.players_count ?? 0
  const max     = status?.max_players ?? 128

  const homeRoute      = fivemRoute('/')            // always the FiveM landing
  const connectRoute   = useFiveMRoute('/connect')
  const whitelistRoute = useFiveMRoute('/whitelist')
  const statusRoute    = useFiveMRoute('/status')
  const profileRoute   = useFiveMRoute('/profile')

  const navLinks = [
    { label: 'Connect',   to: connectRoute },
    { label: 'Whitelist', to: whitelistRoute },
    { label: 'Server Status', to: statusRoute },
    { label: 'Player Profile', to: profileRoute },
  ]

  const monoLink = {
    fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)',
    textDecoration: 'none', letterSpacing: 1, lineHeight: 2.3,
    transition: 'color 0.2s, padding-left 0.2s', display: 'block',
    background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left',
  }

  const onEnter = e => { e.currentTarget.style.color = 'var(--green)'; e.currentTarget.style.paddingLeft = '6px' }
  const onLeave = e => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.paddingLeft = '0' }

  return (
    <footer suppressHydrationWarning style={{ borderTop: '1px solid var(--border)', background: 'var(--bg2)', position: 'relative', zIndex: 1, overflow: 'hidden' }}>
      <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0, backgroundImage: 'radial-gradient(var(--green)08 1px, transparent 1px)', backgroundSize: '28px 28px' }} />
      <div aria-hidden style={{ position: 'absolute', bottom: -80, left: '50%', transform: 'translateX(-50%)', width: 500, height: 200, borderRadius: '50%', background: 'radial-gradient(circle, color-mix(in srgb, var(--green) 6%, transparent) 0%, transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />

      <div className="ftm5-grid" style={{ position: 'relative', zIndex: 1, padding: 'clamp(28px,4vw,44px) clamp(16px,5vw,60px) 32px', display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr 1.2fr', gap: 40 }}>
        {/* Brand */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <FooterLogo />
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700, letterSpacing: 3, color: 'var(--text)', lineHeight: 1 }}>AIFAZI</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 4, color: 'var(--green)', opacity: 0.75, marginTop: 3 }}>NEON OPS CITY</div>
            </div>
          </div>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', lineHeight: 1.9, maxWidth: 300, marginBottom: 18 }}>
            Serious QBX roleplay â€” Neon Ops City.<br />Whitelist, connect, and play.
          </p>
          {socialLinks.length > 0 && (
            <div style={{ display: 'flex', gap: 8 }}>
              {socialLinks.map(({ href, icon, label }) => (
                <a key={label} href={href} target="_blank" rel="noopener noreferrer" title={label}
                  style={{ width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border)', color: 'var(--muted)', textDecoration: 'none', borderRadius: 6, transition: 'all 0.2s' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--green)'; e.currentTarget.style.color = 'var(--green)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted)' }}
                >{icon}</a>
              ))}
            </div>
          )}
        </div>

        {/* Play */}
        <div>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 3, color: 'var(--cyan)', marginBottom: 14, paddingBottom: 8, borderBottom: '1px solid var(--border)', display: 'block' }}>PLAY</span>
          {navLinks.map(({ label, to }) => (
            <Link key={label} to={to} style={monoLink} onMouseEnter={onEnter} onMouseLeave={onLeave}>{label}</Link>
          ))}
        </div>

        {/* Community */}
        <div>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 3, color: 'var(--cyan)', marginBottom: 14, paddingBottom: 8, borderBottom: '1px solid var(--border)', display: 'block' }}>COMMUNITY</span>
          <Link to={homeRoute} style={monoLink} onMouseEnter={onEnter} onMouseLeave={onLeave}>Home</Link>
          <a href="https://discord.gg/aifazi" target="_blank" rel="noopener noreferrer" style={monoLink} onMouseEnter={onEnter} onMouseLeave={onLeave}>Discord</a>
          <Link to="/forms" style={monoLink} onMouseEnter={onEnter} onMouseLeave={onLeave}>Forms</Link>
          <Link to="/forum" style={monoLink} onMouseEnter={onEnter} onMouseLeave={onLeave}>Forum</Link>
        </div>

        {/* Server status */}
        <div>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 3, color: 'var(--cyan)', marginBottom: 14, paddingBottom: 8, borderBottom: '1px solid var(--border)', display: 'block' }}>SERVER</span>
          <div style={{ background: 'color-mix(in srgb, var(--green) 3%, transparent)', border: '1px solid color-mix(in srgb, var(--green) 10%, transparent)', borderRadius: 8, padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)' }}>STATUS</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: online ? 'var(--green)' : '#ff4757', boxShadow: online ? '0 0 6px var(--green)' : '0 0 6px #ff4757', animation: 'ftPulse 2s ease-in-out infinite', display: 'inline-block' }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: online ? 'var(--green)' : '#ff4757', letterSpacing: 1 }}>{online ? 'ONLINE' : 'OFFLINE'}</span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)' }}>PLAYERS</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--cyan)', letterSpacing: 1 }}>{players}/{max}</span>
            </div>
            <Link to={connectRoute} style={{ display: 'block', marginTop: 12, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 2, fontWeight: 700, padding: '8px 0', color: '#000', background: 'var(--green)', textDecoration: 'none', borderRadius: 5 }}>CONNECT NOW</Link>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div style={{ position: 'relative', zIndex: 1, padding: '12px clamp(16px,5vw,60px)', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, background: 'rgba(0,0,0,0.15)' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', letterSpacing: 1 }}>Â© {year} <span style={{ color: 'var(--green)' }}>AIFAZI RP</span> Â· Neon Ops City Â· All rights reserved</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', letterSpacing: 1 }}>UAE / GMT+4</span>
      </div>

      <style>{`
        @keyframes ftPulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @media (max-width: 900px) { .ftm5-grid { grid-template-columns: 1fr 1fr !important; } }
        @media (max-width: 560px) { .ftm5-grid { grid-template-columns: 1fr !important; } }
      `}</style>
    </footer>
  )
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
export default function Footer() {
  const [hasAdminAccess, setHasAdminAccess] = useState(false)
  const [siteConfig, setSiteConfig] = useState({})
  const [footerStyle, setFooterStyle] = useState('cyber')
  const navigate  = useNavigate()
  const location  = useLocation()

  // FiveM-aware footer â€” active on /fivem/* routes and the fivem.aifazi.net host
  const [isFiveMHostState, setIsFiveMHostState] = useState(false)
  useEffect(() => setIsFiveMHostState(isFiveMHost()), [])
  const isFiveM = location.pathname.startsWith('/fivem') || isFiveMHostState

  useEffect(() => {
    const pkgOverride = () => {
      try {
        const raw = localStorage.getItem('user-package')
        if (raw) {
          const pkg = JSON.parse(raw)
          if (pkg?.settings?.footerStyle) return pkg.settings.footerStyle
        }
      } catch {}
      return null
    }
    getSiteSettings().then(s => { if (s.footerStyle) setFooterStyle(pkgOverride() || s.footerStyle) }).catch(() => {})
    const onUpdate = (e) => {
      if (e.detail?.footerStyle) setFooterStyle(pkgOverride() || e.detail.footerStyle)
    }
    const onUserPkg = (e) => {
      // Re-read localStorage so a cleared package (empty settings event)
      // reverts to the site default instead of staying stuck on the package style.
      const fromPkg = pkgOverride()
      const fromEvent = e.detail?.settings?.footerStyle
      if (fromPkg || fromEvent) { setFooterStyle(fromPkg || fromEvent); return }
      getSiteSettings().then(s => { if (s.footerStyle) setFooterStyle(s.footerStyle) }).catch(() => {})
    }
    window.addEventListener('site-settings-updated', onUpdate)
    window.addEventListener('user-package-updated', onUserPkg)
    return () => {
      window.removeEventListener('site-settings-updated', onUpdate)
      window.removeEventListener('user-package-updated', onUserPkg)
    }
  }, [])

  useEffect(() => {
    const check = () => {
      const token = getAuthToken()
      const role  = token ? getRole() : null
      setHasAdminAccess(['admin', 'moderator', 'editor'].includes(role))
    }
    check()
    window.addEventListener('auth-change', check)
    window.addEventListener('storage', check)
    return () => {
      window.removeEventListener('auth-change', check)
      window.removeEventListener('storage', check)
    }
  }, [])

  useEffect(() => {
    api.get('/admin/site-settings').then(r => setSiteConfig(r.data || {})).catch(() => {})
  }, [])

  const handleHashLink = (e, hash) => {
    e.preventDefault()
    if (location.pathname === '/') {
      document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } else {
      navigate('/', { state: { scrollTo: hash } })
    }
  }

  const sectionLinks = [
    { label: 'About',       hash: 'about'       },
    { label: 'Experience',  hash: 'experience'  },
    { label: 'Skills',      hash: 'skills'      },
    { label: 'Projects',    hash: 'projects'    },
    { label: 'Contact',     hash: 'contact'     },
  ]

  const platformLinks = [
    { label: 'Blog',          to: '/blog'           },
    { label: 'Forum',         to: '/forum'          },
    { label: 'Network Tools', to: '/tools/network'  },
    { label: 'File Tools',    to: '/tools/files'    },
    { label: 'SEO Tools',     to: '/tools/seo'      },
    { label: 'Live Chat',     to: '/chat'           },
  ]

  const socialLinks = [
    siteConfig.github   && { href: siteConfig.github.startsWith('http') ? siteConfig.github : `https://github.com/${siteConfig.github}`,     icon: <GitHubIcon />,   label: 'GitHub'   },
    siteConfig.linkedin && { href: siteConfig.linkedin.startsWith('http') ? siteConfig.linkedin : `https://linkedin.com/in/${siteConfig.linkedin}`, icon: <LinkedInIcon />, label: 'LinkedIn' },
    siteConfig.twitter  && { href: siteConfig.twitter.startsWith('http') ? siteConfig.twitter : `https://x.com/${siteConfig.twitter}`,       icon: <TwitterIcon />,  label: 'Twitter'  },
  ].filter(Boolean)

  const year = new Date().getFullYear()

  // â”€â”€ FiveM footer (shares theme/socials, FiveM-specific content) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (isFiveM) return <FooterFiveM socialLinks={socialLinks} year={year} />

  // â”€â”€ Shared props for variant layouts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const sharedProps = { siteConfig, sectionLinks, platformLinks, socialLinks, hasAdminAccess, handleHashLink, year }
  if (footerStyle === 'minimal')      return <FooterMinimal     {...sharedProps} />
  if (footerStyle === 'magazine')     return <FooterMagazine    {...sharedProps} />
  if (footerStyle === 'glass')        return <FooterGlass       {...sharedProps} />
  if (footerStyle === 'synthwave')    return <FooterSynthwave   {...sharedProps} />
  if (footerStyle === 'dark-compact') return <FooterDarkCompact {...sharedProps} />
  // â”€â”€ Fallthrough: cyber (original full layout) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  // Derived styles per footerStyle â€” MUST be declared before monoLink/colHead
  // which reference fs.muted / fs.sub / fs.border. Declaring fs after those
  // caused a TDZ crash: "Cannot access 'w' before initialization" (minified).
  const FS = {
    cyber:        { bg: 'var(--bg2)', text: 'var(--text)', accent: 'var(--green)', sub: 'var(--cyan)', muted: 'var(--muted)', border: 'var(--border)', topBorder: '1px solid var(--border)' },
    minimal:      { bg: '#fafafa',    text: '#111',         accent: '#111',         sub: '#888',        muted: '#888',         border: '#e8e8e8',       topBorder: '1px solid #e8e8e8' },
    magazine:     { bg: '#0f0e0c',    text: '#f2f0ec',      accent: '#e8000d',      sub: '#666',        muted: '#555',         border: '#333',          topBorder: '3px solid #e8000d' },
    glass:        { bg: 'rgba(4,8,15,0.8)', text: '#d0e8ff', accent: '#00e5ff',   sub: '#7b61ff',     muted: '#5a7898',      border: 'rgba(0,229,255,0.15)', topBorder: '1px solid rgba(0,229,255,0.2)' },
    synthwave:    { bg: '#0d0618',    text: '#f0d8ff',      accent: '#ff2d8b',      sub: '#00f0ff',     muted: '#7858a0',      border: 'rgba(255,45,139,0.2)', topBorder: '2px solid transparent' },
    'dark-compact': { bg: '#090e14', text: '#c8d8e8',      accent: 'var(--green)', sub: 'var(--cyan)', muted: '#4a6478',      border: '#ffffff0d',     topBorder: '1px solid #ffffff0d' },
    command:      { bg: '#070b12',    text: '#dbeafe',      accent: '#38bdf8',      sub: '#a78bfa',     muted: '#64748b',      border: 'rgba(56,189,248,0.18)', topBorder: '1px solid rgba(56,189,248,0.3)' },
    dashboard:    { bg: '#07111a',    text: '#c8d8e8',      accent: '#38bdf8',      sub: '#00ff88',     muted: '#6b8296',      border: 'rgba(56,189,248,0.14)', topBorder: '1px solid rgba(56,189,248,0.24)' },
    paper:        { bg: '#f4eadc',    text: '#1f2937',      accent: '#1f2937',      sub: '#8b5e34',     muted: '#6b5b4b',      border: '#d8c7b3',       topBorder: '2px solid #1f2937' },
    brutal:       { bg: '#f2f0ec',    text: '#111111',      accent: '#111111',      sub: '#111111',     muted: '#333333',      border: '#111111',       topBorder: '6px solid #111111' },
    dock:         { bg: '#061018',    text: '#c8d8e8',      accent: 'var(--cyan)',  sub: 'var(--green)', muted: '#6b8296',     border: 'color-mix(in srgb, var(--cyan) 18%, transparent)', topBorder: '1px solid color-mix(in srgb, var(--cyan) 26%, transparent)' },
    terminal:     { bg: '#050805',    text: '#33ff33',      accent: '#33ff33',      sub: '#ffcc00',     muted: '#228822',      border: 'rgba(51,255,51,0.24)', topBorder: '1px solid rgba(51,255,51,0.35)' },
  }
  const fs = FS[footerStyle] || FS.cyber

  const monoLink = {
    fontFamily: 'var(--font-mono)', fontSize: 11, color: fs.muted,
    textDecoration: 'none', letterSpacing: 1, lineHeight: 2.3,
    transition: 'color 0.2s', display: 'block',
    background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left',
  }

  const colHead = {
    fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 3,
    color: fs.sub, marginBottom: 14, paddingBottom: 8,
    borderBottom: `1px solid ${fs.border}`, display: 'block',
  }

  return (
    <footer suppressHydrationWarning style={{ borderTop: fs.topBorder, background: fs.bg, position: 'relative', zIndex: 1, overflow: 'hidden' }}>

      <style>{`
        @keyframes ftPulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes ftScan  { 0%{top:-10%} 100%{top:110%} }
        @keyframes ftGrid  { 0%,100%{opacity:0.04} 50%{opacity:0.09} }
        @keyframes ftGlow  { 0%,100%{opacity:0.12} 50%{opacity:0.28} }

        .ft-link:hover { color: var(--green) !important; padding-left: 6px !important; }
        .ft-social:hover { border-color: var(--green) !important; color: var(--green) !important; background: color-mix(in srgb, var(--green) 6%, transparent) !important; }
      `}</style>

      {/* â”€â”€ Decorative background grid â”€â”€ */}
      <div aria-hidden style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
        backgroundImage: `radial-gradient(${fs.accent}08 1px, transparent 1px)`,
        backgroundSize: '28px 28px',
        animation: 'ftGrid 5s ease-in-out infinite',
      }} />

      {/* â”€â”€ Glow blob â”€â”€ */}
      <div aria-hidden style={{
        position: 'absolute', bottom: -80, left: '50%', transform: 'translateX(-50%)',
        width: 500, height: 200, borderRadius: '50%',
        background: 'radial-gradient(circle, color-mix(in srgb, var(--green) 6%, transparent) 0%, transparent 70%)',
        pointerEvents: 'none', zIndex: 0, animation: 'ftGlow 6s ease-in-out infinite',
      }} />

      {/* â”€â”€ Top scanning line â”€â”€ */}
      <div aria-hidden style={{ position: 'absolute', left: 0, right: 0, height: 1, zIndex: 1, pointerEvents: 'none',
        background: 'linear-gradient(90deg, transparent, color-mix(in srgb, var(--green) 25%, transparent), transparent)',
        animation: 'ftScan 8s linear infinite',
      }} />

      {/* â”€â”€â”€ MAIN GRID â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="ft-main" style={{
        position: 'relative', zIndex: 2,
        padding: 'clamp(32px,5vw,56px) clamp(16px,5vw,60px) 40px',
        display: 'grid',
        gridTemplateColumns: '2.2fr 1fr 1fr 1.3fr',
        gap: 48,
      }}>

        {/* COL 1 â€“ Brand + newsletter â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <FooterLogo />
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700, letterSpacing: 3, color: 'var(--text)', lineHeight: 1 }}>TANVIR</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 4, color: 'var(--green)', opacity: 0.75, marginTop: 3 }}>.DEV</div>
            </div>
          </div>

          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', lineHeight: 1.9, maxWidth: 290, marginBottom: 18 }}>
            Network Engineer &amp; Full-Stack Developer.<br />
            Building web infrastructure Â· UAE Â· Remote Â· Global
          </p>

          {/* Tech stack badges */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 20 }}>
            {[
              ['Node.js', 'var(--green)'], ['React', '#61dafb'], ['MongoDB', '#47a248'],
              ['Express', 'var(--muted)'], ['Cloudflare', '#f6821f'],
            ].map(([t, c]) => <TechBadge key={t} label={t} color={c} />)}
          </div>

          {/* Social row */}
          {socialLinks.length > 0 && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 22 }}>
              {socialLinks.map(({ href, icon, label }) => (
                <a key={label} href={href} target="_blank" rel="noopener noreferrer" title={label}
                  className="ft-social"
                  style={{
                    width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: '1px solid var(--border)', color: 'var(--muted)',
                    textDecoration: 'none', transition: 'all 0.2s', borderRadius: 6,
                  }}
                >{icon}</a>
              ))}
            </div>
          )}

          <LiveVisitorBadge />

          {/* Newsletter */}
          <div style={{ marginTop: 22 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 2, color: 'var(--muted)', marginBottom: 6 }}>
              âœ‰ GET UPDATES â€” no spam, ever
            </div>
            <MiniNewsletter />
          </div>
        </div>

        {/* COL 2 â€“ Navigate â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <div>
          <span style={colHead}>NAVIGATE</span>
          {sectionLinks.map(({ label, hash }) => (
            <a key={hash} href={`/#${hash}`} className="ft-link"
              style={{ ...monoLink, transition: 'color 0.2s, padding-left 0.2s' }}
              onClick={e => handleHashLink(e, hash)}
            >{label}</a>
          ))}
        </div>

        {/* COL 3 â€“ Platform â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <div>
          <span style={colHead}>PLATFORM</span>
          {platformLinks.map(({ label, to }) => (
            <Link key={to} to={to} className="ft-link"
              style={{ ...monoLink, transition: 'color 0.2s, padding-left 0.2s' }}
            >{label}</Link>
          ))}
          {hasAdminAccess && (
            <>
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                <span style={{ ...colHead, fontSize: 7, marginBottom: 8 }}>ADMIN ACCESS</span>
                {[
                  { label: 'âš¡ Dashboard', to: '/admin' },
                  { label: 'ðŸ“‹ Audit Log', to: '/admin' },
                  { label: 'ðŸŽ¨ Themes',    to: '/admin' },
                ].map(({ label, to }) => (
                  <Link key={label} to={to} className="ft-link"
                    style={{ ...monoLink, fontSize: 10, transition: 'color 0.2s, padding-left 0.2s' }}
                  >{label}</Link>
                ))}
              </div>
            </>
          )}
        </div>

        {/* COL 4 â€“ System status â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <div>
          <span style={colHead}>SYSTEM</span>
          <SystemStatus />
        </div>
      </div>

      {/* â”€â”€â”€ BOTTOM BAR â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div style={{
        position: 'relative', zIndex: 2,
        padding: 'clamp(10px,2vw,14px) clamp(16px,5vw,60px)',
        borderTop: `1px solid ${fs.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 12,
        background: 'rgba(0,0,0,0.15)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: fs.accent, animation: 'ftPulse 2s ease-in-out infinite', boxShadow: `0 0 8px ${fs.accent}` }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: fs.muted, letterSpacing: 1 }}>ALL SYSTEMS OPERATIONAL</span>
          </div>
          <span style={{ color: fs.border, fontSize: 10 }}>Â·</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: fs.muted, letterSpacing: 1 }}>UAE / GMT+4</span>
        </div>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: fs.muted, letterSpacing: 1 }}>
          Â© {year} <span style={{ color: fs.accent }}>tanvir@aifazi.net</span> Â· All rights reserved
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {['Privacy', 'Terms', 'Contact'].map(label => (
            <Link key={label} to="/contact"
              style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: fs.muted, letterSpacing: 1, textDecoration: 'none', transition: 'color 0.2s' }}
              onMouseEnter={e => e.currentTarget.style.color = fs.accent}
              onMouseLeave={e => e.currentTarget.style.color = fs.muted}
            >{label}</Link>
          ))}
          {hasAdminAccess && (
            <Link to="/admin"
              style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: fs.muted, letterSpacing: 2, opacity: 0.4, transition: 'opacity 0.3s', textDecoration: 'none' }}
              onMouseEnter={e => e.currentTarget.style.opacity = '1'}
              onMouseLeave={e => e.currentTarget.style.opacity = '0.4'}
            >ADMIN â†—</Link>
          )}
        </div>
      </div>

      <style>{`
        @media (max-width: 1100px) {
          .ft-main { grid-template-columns: 2fr 1fr 1fr !important; }
          .ft-main > div:last-child { display: none; }
        }
        @media (max-width: 820px) {
          .ft-main { grid-template-columns: 1fr 1fr !important; padding: 40px 24px 32px !important; gap: 32px !important; }
          .ft-main > div:first-child { grid-column: 1 / -1; }
        }
        @media (max-width: 520px) {
          .ft-main { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 768px) {
          footer > div:last-child { padding: 14px 24px !important; flex-direction: column !important; text-align: center; gap: 8px !important; }
        }
      `}</style>
    </footer>
  )
}
