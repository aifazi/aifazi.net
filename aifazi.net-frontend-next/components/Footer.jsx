'use client'
import { Link, useNavigate, useLocation } from '@/lib/router-compat'
import { getAuthToken, getRole } from '@/lib/api'
import { useState, useEffect, useRef } from 'react'
import LiveVisitorBadge from './LiveVisitorBadge'
import api from '@/lib/api'
import { getSiteSettings } from '@/lib/siteSettings'
import { isFiveMHost, fivemRoute, useFiveMRoute } from '@/lib/fivemRoutes'
import {
  GitHubIcon, LinkedInIcon, TwitterIcon, SystemStatus, TechBadge, FooterLogo, MiniNewsletter,
  FooterMinimal, FooterMagazine, FooterGlass, FooterSynthwave, FooterDarkCompact,
  FooterCommand, FooterDashboard, FooterPaper, FooterBrutal, FooterDock,
  FooterTerminal, FooterFiveM,
} from './footerStyles'

// ── Social icons ───────────────────────────────────────────────────────────────
export default function Footer() {
  const [hasAdminAccess, setHasAdminAccess] = useState(false)
  const [siteConfig, setSiteConfig] = useState({})
  const [footerStyle, setFooterStyle] = useState('cyber')
  const navigate  = useNavigate()
  const location  = useLocation()

  // FiveM-aware footer — active on /fivem/* routes and the fivem.aifazi.net host
  const [isFiveMHostState] = useState(() => isFiveMHost())
  const isFiveM = location.pathname.startsWith('/fivem') || isFiveMHostState

  useEffect(() => {
    const pkgOverride = (parsed) => {
      // Locked site design wins — ignore any stale per-user package while
      // the admin forces the global theme (mirror providers eff merge).
      if (parsed?.lockTheme) return null
      try {
        const cached = JSON.parse(localStorage.getItem('site-config-cache') || 'null')
        if (cached?.lockTheme) return null
      } catch {}
      try {
        const raw = localStorage.getItem('user-package')
        if (raw) {
          const pkg = JSON.parse(raw)
          if (pkg?.settings?.footerStyle) return pkg.settings.footerStyle
        }
      } catch {}
      return null
    }
    getSiteSettings().then(s => { if (s.footerStyle) setFooterStyle(pkgOverride(s) || s.footerStyle) }).catch(() => {})
    const onUpdate = (e) => {
      if (e.detail?.footerStyle) setFooterStyle(pkgOverride(e.detail) || e.detail.footerStyle)
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
    { label: 'Mobile App',    to: '/app'            },
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

  // ── FiveM footer (shares theme/socials, FiveM-specific content) ─────────────
  if (isFiveM) return <FooterFiveM socialLinks={socialLinks} year={year} />

  // ── Shared props for variant layouts ────────────────────────────────────────
  const sharedProps = { siteConfig, sectionLinks, platformLinks, socialLinks, hasAdminAccess, handleHashLink, year }
  if (footerStyle === 'minimal')      return <FooterMinimal     {...sharedProps} />
  if (footerStyle === 'magazine')     return <FooterMagazine    {...sharedProps} />
  if (footerStyle === 'glass')        return <FooterGlass       {...sharedProps} />
  if (footerStyle === 'synthwave')    return <FooterSynthwave   {...sharedProps} />
  if (footerStyle === 'dark-compact') return <FooterDarkCompact {...sharedProps} />
  if (footerStyle === 'command')      return <FooterCommand     {...sharedProps} />
  if (footerStyle === 'dashboard')    return <FooterDashboard   {...sharedProps} />
  if (footerStyle === 'paper')        return <FooterPaper       {...sharedProps} />
  if (footerStyle === 'brutal')       return <FooterBrutal      {...sharedProps} />
  if (footerStyle === 'dock')         return <FooterDock        {...sharedProps} />
  if (footerStyle === 'terminal')     return <FooterTerminal    {...sharedProps} />
  // ── Fallthrough: cyber (original full layout) ───────────────────────────────

  // Derived styles per footerStyle — MUST be declared before monoLink/colHead
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

  const monoLink = { color: fs.muted }
  const colHead = { color: fs.sub, borderBottom: `1px solid ${fs.border}` }

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

      {/* ── Decorative background grid ── */}
      <div aria-hidden style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
        backgroundImage: `radial-gradient(${fs.accent}08 1px, transparent 1px)`,
        backgroundSize: '28px 28px',
        animation: 'ftGrid 5s ease-in-out infinite',
      }} />

      {/* ── Glow blob ── */}
      <div aria-hidden style={{
        position: 'absolute', bottom: -80, left: '50%', transform: 'translateX(-50%)',
        width: 500, height: 200, borderRadius: '50%',
        background: 'radial-gradient(circle, color-mix(in srgb, var(--green) 6%, transparent) 0%, transparent 70%)',
        pointerEvents: 'none', zIndex: 0, animation: 'ftGlow 6s ease-in-out infinite',
      }} />

      {/* ── Top scanning line ── */}
      <div aria-hidden style={{ position: 'absolute', left: 0, right: 0, height: 1, zIndex: 1, pointerEvents: 'none',
        background: 'linear-gradient(90deg, transparent, color-mix(in srgb, var(--green) 25%, transparent), transparent)',
        animation: 'ftScan 8s linear infinite',
      }} />

      {/* ─── MAIN GRID ─────────────────────────────────────────────────────── */}
      <div className="ft-main" style={{
        position: 'relative', zIndex: 2,
        padding: 'clamp(32px,5vw,56px) clamp(16px,5vw,60px) 40px',
        display: 'grid',
        gridTemplateColumns: '2.2fr 1fr 1fr 1.3fr',
        gap: 48,
      }}>

        {/* COL 1 – Brand + newsletter ─────────────────────────────────── */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <FooterLogo />
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700, letterSpacing: 3, color: 'var(--text)', lineHeight: 1 }}>TANVIR</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 4, color: 'var(--green)', opacity: 0.75, marginTop: 3 }}>.DEV</div>
            </div>
          </div>

          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', lineHeight: 1.9, maxWidth: 290, marginBottom: 18 }}>
            Network Engineer &amp; Full-Stack Developer.<br />
            Building web infrastructure · UAE · Remote · Global
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
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, color: 'var(--muted)', marginBottom: 6 }}>
              ✉ GET UPDATES — no spam, ever
            </div>
            <MiniNewsletter />
          </div>
        </div>

        {/* COL 2 – Navigate ────────────────────────────────────────────── */}
        <div>
          <span className="ft-colhead" style={colHead}>NAVIGATE</span>
          {sectionLinks.map(({ label, hash }) => (
            <a key={hash} href={`/#${hash}`} className="ft-link"
              style={{ ...monoLink, transition: 'color 0.2s, padding-left 0.2s' }}
              onClick={e => handleHashLink(e, hash)}
            >{label}</a>
          ))}
        </div>

        {/* COL 3 – Platform ────────────────────────────────────────────── */}
        <div>
          <span className="ft-colhead" style={colHead}>PLATFORM</span>
          {platformLinks.map(({ label, to }) => (
            <Link key={to} to={to} className="ft-link"
              style={{ ...monoLink, transition: 'color 0.2s, padding-left 0.2s' }}
            >{label}</Link>
          ))}
          {hasAdminAccess && (
            <>
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                <span className="ft-colhead" style={{ ...colHead, fontSize: 11, marginBottom: 8 }}>ADMIN ACCESS</span>
                {[
                  { label: '⚡ Dashboard', to: '/admin' },
                  { label: '📋 Audit Log', to: '/admin' },
                  { label: '🎨 Themes',    to: '/admin' },
                ].map(({ label, to }) => (
                  <Link key={label} to={to} className="ft-link"
                    style={{ ...monoLink, fontSize: 11, transition: 'color 0.2s, padding-left 0.2s' }}
                  >{label}</Link>
                ))}
              </div>
            </>
          )}
        </div>

        {/* COL 4 – System status ───────────────────────────────────────── */}
        <div>
          <span className="ft-colhead" style={colHead}>SYSTEM</span>
          <SystemStatus />
        </div>
      </div>

      {/* ─── BOTTOM BAR ────────────────────────────────────────────────────── */}
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
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: fs.muted, letterSpacing: 1 }}>ALL SYSTEMS OPERATIONAL</span>
          </div>
          <span style={{ color: fs.border, fontSize: 11 }}>·</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: fs.muted, letterSpacing: 1 }}>UAE / GMT+4</span>
        </div>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: fs.muted, letterSpacing: 1 }}>
          © {year} <span style={{ color: fs.accent }}>tanvir@aifazi.net</span> · All rights reserved
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {['Privacy', 'Terms', 'Contact'].map(label => (
            <Link key={label} to="/contact"
              style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: fs.muted, letterSpacing: 1, textDecoration: 'none', transition: 'color 0.2s' }}
              onMouseEnter={e => e.currentTarget.style.color = fs.accent}
              onMouseLeave={e => e.currentTarget.style.color = fs.muted}
            >{label}</Link>
          ))}
          {hasAdminAccess && (
            <Link to="/admin"
              style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: fs.muted, letterSpacing: 2, opacity: 0.4, transition: 'opacity 0.3s', textDecoration: 'none' }}
              onMouseEnter={e => e.currentTarget.style.opacity = '1'}
              onMouseLeave={e => e.currentTarget.style.opacity = '0.4'}
            >ADMIN ↗</Link>
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
