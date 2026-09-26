'use client'
import { useState, useEffect } from 'react'
import { useTheme } from '@/app/providers'
import api from '@/lib/api'
import { clearSiteSettingsCache } from '@/lib/siteSettings'
import { HEADER_PRESETS, FOOTER_PRESETS, HeaderPreviewSVG, FooterPreviewSVG } from '../pages-src/admin/SiteSettings'
import { THEME_PACKAGES } from '../core/framework-styles.js'
import { notify } from '../core/notify.jsx'
import { THEMES, PACKAGE_LOOKUP } from './themePickerData'
import {
  flags, isLightTheme, radius, synthBg, auroraBg, noirBg, pastelBg, getExtraBg, getCardStyle,
  OverviewPreview, LoadingPreview, InputPreview, NotificationPreview,
  DialogPreview, ButtonsPreview, HeaderPreview, FooterPreview, CategoryPreview, getThemeFamily,
} from './themePickerPreviews'

const CATEGORIES = [
  { id: 'overview',      icon: '⊞', label: 'OVERVIEW' },
  { id: 'header',        icon: '▬', label: 'HEADER'   },
  { id: 'footer',        icon: '▤', label: 'FOOTER'   },
  { id: 'loading',       icon: '◌', label: 'LOADING'  },
  { id: 'input',         icon: '■', label: 'INPUT'    },
  { id: 'notification',  icon: '◉', label: 'NOTIFY'   },
  { id: 'dialog',        icon: '⬜', label: 'DIALOG'   },
  { id: 'buttons',       icon: '▶', label: 'BUTTONS'  },
]

// ── Helper: style flags ───────────────────────────────────────────────────────
function ThemeCard({ t, isActive, isSelected, onSelect }) {
  const [hover, setHover] = useState(false)
  const f = flags(t)

  const borderColor = isSelected
    ? t.primary
    : isActive
    ? `${t.primary}88`
    : hover
    ? `${t.primary}55`
    : f.isBrut || f.isWin95
    ? t.secondary
    : 'rgba(255,255,255,0.07)'

  const cardBg = f.isGlass ? 'rgba(10,18,32,0.5)' : f.isHolo ? 'rgba(8,18,32,0.72)' : f.isCrt ? '#020604' : t.bg
  const cardShadow = isSelected
    ? `0 0 16px ${t.primary}55, 0 4px 24px rgba(0,0,0,0.5)`
    : f.isBrut || f.isWin95
    ? `3px 3px 0 ${t.secondary}`
    : f.isNeumorph
    ? '5px 5px 12px #b8bec8, -5px -5px 12px #ffffff'
    : f.isGlass && hover
    ? `0 8px 32px rgba(0,229,255,0.2)`
    : hover
    ? `0 4px 20px rgba(0,0,0,0.35)`
    : '0 2px 8px rgba(0,0,0,0.2)'

  // Style badge colors
  const tagColors = {
    'DARK':  { bg: 'color-mix(in srgb, var(--green) 12%, transparent)',  border: 'color-mix(in srgb, var(--green) 30%, transparent)',  color: '#00ff88' },
    'LIGHT': { bg: 'rgba(255,220,50,0.12)', border: 'rgba(255,220,50,0.3)', color: '#ffd700' },
    'STYLE': { bg: 'rgba(168,85,247,0.12)', border: 'rgba(168,85,247,0.3)', color: '#c084fc' },
  }
  const tagColor = tagColors[t.tag] || tagColors['DARK']

  return (
    <button
      onClick={() => onSelect(t.id)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative', background: cardBg,
        border: `${f.isBrut || f.isWin95 ? '2' : '1.5'}px solid ${borderColor}`,
        borderRadius: f.isBrut || f.isTerm || f.isWin95 ? '0' : f.isGlass || f.isNeumorph || f.isPastel ? '12px' : '10px',
        padding: '11px', cursor: 'pointer', textAlign: 'left', width: '100%',
        transition: 'border-color 0.2s, transform 0.15s, box-shadow 0.2s',
        transform: hover && !isSelected ? 'translateY(-2px)' : 'none',
        boxShadow: cardShadow,
        ...(f.isGlass ? { backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' } : {}),
        ...(f.isSynth && isSelected ? { backgroundImage: `linear-gradient(135deg, ${t.bg}, ${t.bg2})` } : {}),
        ...(f.isAurora && isSelected ? { backgroundImage: auroraBg(t).backgroundImage } : {}),
      }}
    >
      {/* Selected checkmark */}
      {isSelected && (
        <div style={{ position: 'absolute', top: 7, right: 7, width: 16, height: 16,
          borderRadius: f.isBrut || f.isWin95 ? '0' : '50%',
          background: t.primary, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, color: '#000', fontWeight: 900,
        }}>✓</div>
      )}
      {isActive && !isSelected && (
        <div style={{ position: 'absolute', top: 7, right: 7, width: 6, height: 6, borderRadius: '50%',
          background: t.primary, boxShadow: `0 0 6px ${t.primary}`, animation: 'tpBlink 1.8s infinite',
        }}/>
      )}
      {/* Color swatches */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 9 }}>
        {[t.bg2, t.primary, t.secondary].map((c, i) => (
          <div key={i} style={{ width: 20, height: 20,
            borderRadius: f.isBrut || f.isWin95 || f.isTerm ? 0 : f.isPastel ? 10 : 5,
            background: c,
            border: f.isNeumorph ? 'none' : '1px solid rgba(255,255,255,0.08)',
            boxShadow: f.isSynth || f.isNoir || f.isAurora ? `0 0 6px ${c}55` : f.isNeumorph ? '2px 2px 4px #b8bec8, -1px -1px 3px #fff' : 'none',
          }}/>
        ))}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 3, paddingLeft: 3 }}>
          <div style={{ height: 3, borderRadius: 2, background: t.primary, width: '80%' }}/>
          <div style={{ height: 2, borderRadius: 2, background: 'rgba(255,255,255,0.12)', width: '55%' }}/>
        </div>
      </div>
      {/* Name + tags */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: 1,
          color: isSelected ? t.primary : 'rgba(255,255,255,0.82)',
        }}>{t.name}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1, padding: '1px 5px',
          borderRadius: f.isBrut || f.isWin95 ? 0 : 3,
          background: tagColor.bg, border: `1px solid ${tagColor.border}`, color: tagColor.color,
        }}>{t.tag}</span>
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'rgba(255,255,255,0.3)', lineHeight: 1.3 }}>{t.desc}</div>
    </button>
  )
}

// ── Main ThemePicker Drawer ───────────────────────────────────────────────────
export default function ThemePicker({ open, onClose }) {
  const { theme, setTheme, siteConfig, refreshSiteConfig, isAdmin, userPackage, applyUserPackage, clearUserPackage } = useTheme()
  const isThemeLocked = !!(siteConfig?.lockTheme && siteConfig?.globalTheme)
  const [mounted, setMounted] = useState(() => open)
  const [pending, setPending] = useState(null)
  const [activeCategory, setActiveCategory] = useState('overview')
  const [filter, setFilter] = useState('ALL')
  const [styleFilter, setStyleFilter] = useState('ALL')

  // ── Admin global panel state ─────────────────────────────────────────────
  const [showAdminPanel, setShowAdminPanel] = useState(false)
  const [globalDraft, setGlobalDraft] = useState({
    globalTheme: '', lockTheme: false,
    loadingScreenStyle: 'terminal', animationPreset: 'smooth',
    maintenanceMode: false, maintenanceMessage: '',
    maintenanceStyle: 'terminal',
    maintenanceStatus: 'MAINTENANCE',
    maintenanceIcon: '⚙️',
    maintenanceReturnTime: '',
    maintenanceShowProgress: false,
    maintenanceProgress: 65,
    maintenanceShowSocial: false,
    maintenanceBgStyle: 'grid',
    headerStyle: 'cyber',
    footerStyle: 'cyber',
  })
  const [savingGlobal, setSavingGlobal] = useState(false)
  const [savedGlobal, setSavedGlobal] = useState(false)

  // Sync globalDraft with siteConfig whenever panel opens
  const [prevPanelOpen, setPrevPanelOpen] = useState(showAdminPanel)
  const [prevDraftCfg, setPrevDraftCfg] = useState(siteConfig)
  if ((prevPanelOpen !== showAdminPanel || prevDraftCfg !== siteConfig) && showAdminPanel && siteConfig) {
    setPrevPanelOpen(showAdminPanel)
    setPrevDraftCfg(siteConfig)
    setGlobalDraft({
        globalTheme:             siteConfig.globalTheme             || '',
        lockTheme:               siteConfig.lockTheme               || false,
        loadingScreenStyle:      siteConfig.loadingScreenStyle      || 'terminal',
        animationPreset:         siteConfig.animationPreset         || 'smooth',
        maintenanceMode:         siteConfig.maintenanceMode         || false,
        maintenanceMessage:      siteConfig.maintenanceMessage      || '',
        maintenanceStyle:        siteConfig.maintenanceStyle        || 'terminal',
        maintenanceStatus:       siteConfig.maintenanceStatus       || 'MAINTENANCE',
        maintenanceIcon:         siteConfig.maintenanceIcon         || '⚙️',
        maintenanceReturnTime:   siteConfig.maintenanceReturnTime   || '',
        maintenanceShowProgress: siteConfig.maintenanceShowProgress || false,
        maintenanceProgress:     siteConfig.maintenanceProgress     ?? 65,
        maintenanceShowSocial:   siteConfig.maintenanceShowSocial   || false,
        maintenanceBgStyle:      siteConfig.maintenanceBgStyle      || 'grid',
        headerStyle:             siteConfig.headerStyle             || 'cyber',
        footerStyle:             siteConfig.footerStyle             || 'cyber',
      })
  }

  const saveGlobalSettings = async () => {
    setSavingGlobal(true); setSavedGlobal(false)
    try {
      await api.put('/admin/site-settings', globalDraft)
      clearSiteSettingsCache()
      await refreshSiteConfig()
      // Dispatch event so Navbar/Footer re-fetch their styles immediately
      window.dispatchEvent(new CustomEvent('site-settings-updated', { detail: globalDraft }))
      setSavedGlobal(true)
      setTimeout(() => setSavedGlobal(false), 2500)
    } catch (e) { notify.error('Failed to save: ' + (e.response?.data?.error || e.message)) }
    finally { setSavingGlobal(false) }
  }

  const [prevOpen, setPrevOpen] = useState(open)
  if (prevOpen !== open) {
    setPrevOpen(open)
    if (open) {
      setMounted(true)
      setPending(null)
    }
  }

  useEffect(() => {
    if (open || !mounted) return
    const t = setTimeout(() => setMounted(false), 380)
    return () => clearTimeout(t)
  }, [open, mounted])

  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  if (!mounted) return null

  const activeTheme  = userPackage
    ? (THEMES.find(t => t.type === 'package' && t.packageId === userPackage.id) || THEMES.find(t => t.id === theme) || THEMES[0])
    : (THEMES.find(t => t.id === theme) || THEMES[0])
  const pendingTheme = THEMES.find(t => t.id === pending)
  const previewTheme = pendingTheme || activeTheme

  const colorThemes  = THEMES.filter(t => t.type === 'color')
  const designThemes = THEMES.filter(t => t.type === 'design')
  const packageThemes = THEMES.filter(t => t.type === 'package')

  const filteredThemes = THEMES.filter(t => {
    if (styleFilter === 'COLOR')   return t.type === 'color'
    if (styleFilter === 'DESIGN')  return t.type === 'design'
    if (styleFilter === 'PACKAGES') return t.type === 'package'
    if (filter === 'DARK')  return t.tag === 'DARK'
    if (filter === 'LIGHT') return t.tag === 'LIGHT'
    return true
  })

  const handleSelect = id => setPending(prev => prev === id ? null : id)
  const handleApply  = () => {
    if (!pending) return
    const item = THEMES.find(t => t.id === pending)
    if (item?.type === 'package') {
      const pkg = PACKAGE_LOOKUP[item.packageId]
      if (pkg) {
        applyUserPackage({ id: pkg.id, settings: pkg.settings })
        notify.success(`${pkg.name} applied for this browser. Admin global settings are untouched.`, { title: 'Theme Package' })
      }
    } else {
      if (userPackage) clearUserPackage()
      setTheme(pending)
    }
    setPending(null)
  }
  const handleCancel = () => setPending(null)

  return (
    <>
      <style>{`
        @keyframes tpBlink   { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes tpSpin    { to{transform:rotate(360deg)} }
        @keyframes tpSpinR   { to{transform:rotate(-360deg)} }
        @keyframes tpBounce  { from{transform:translateY(0)} to{transform:translateY(-6px)} }
        @keyframes tpShimmer {
          0%   { background-position: -200% 0; }
          100% { background-position:  200% 0; }
        }
        .tp-filter-btn:hover { border-color: var(--green) !important; color: var(--text) !important; }
        .tp-cat-btn:hover    { border-color: var(--green) !important; color: var(--text) !important; }
        .tp-close:hover      { border-color: var(--green) !important; color: var(--green) !important; }
        /*
         * .tp-drawer-chrome uses the active theme's CSS variables so the theme
         * library background and colors sync with whatever theme is applied.
         */
      `}</style>

      {/* Backdrop */}
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, zIndex: 998,
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
        opacity: open ? 1 : 0, transition: 'opacity 0.3s ease',
      }} role="button" tabIndex={0} onKeyDown={(e)=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); e.currentTarget.click() } }} />

      {/* Drawer
           CSS variables are set as INLINE styles so they win over any [data-theme="..."]
           cascade rule regardless of specificity — !important on custom props is unreliable. */}
      <div className="tp-drawer-chrome" style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 999,
        width: 380, borderLeft: '1px solid color-mix(in srgb, var(--cyan) 15%, transparent)',
        boxShadow: '-24px 0 60px rgba(0,0,0,0.7)',
        display: 'flex', flexDirection: 'column',
        transform: open ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.38s cubic-bezier(0.16,1,0.3,1)',
        /* ── Drawer follows the active theme's CSS variables (data-theme cascade) ── */
        background: 'var(--bg2)',
      }}>

        {/* ── Header ── */}
        <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="13.5" cy="6.5" r=".5" fill="var(--green)"/>
                <circle cx="17.5" cy="10.5" r=".5" fill="var(--green)"/>
                <circle cx="8.5" cy="7.5" r=".5" fill="var(--green)"/>
                <circle cx="6.5" cy="12.5" r=".5" fill="var(--green)"/>
                <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>
              </svg>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 4, color: 'var(--green)' }}>THEME LIBRARY</span>
            </div>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1, color: 'var(--muted)', margin: 0 }}>
              {isThemeLocked ? '🔒 THEME LOCKED BY ADMIN' : `${THEMES.filter(t => t.type !== 'package').length} THEMES + ${packageThemes.length} PACKAGES — SELECT THEN APPLY`}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {/* ── ADMIN ONLY: link to Admin Portal global settings ── */}
            {isAdmin && (
              <a href="/admin" onClick={onClose} title="Manage global theme & site settings in Admin Portal"
                style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer', padding: '4px 8px', borderRadius: 6, fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1, transition: 'all .15s', display: 'flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#f59e0b'; e.currentTarget.style.color = '#f59e0b' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted)' }}
              >
                ⚙ GLOBAL
                <span style={{ fontSize: 11, background: 'rgba(245,158,11,0.15)', color: '#f59e0b', padding: '1px 4px', borderRadius: 3, letterSpacing: 1 }}>ADMIN ↗</span>
              </a>
            )}
            <button className="tp-close" onClick={onClose}
              style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--muted)',
                cursor: 'pointer', width: 28, height: 28, borderRadius: 6,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, transition: 'all 0.15s' }} aria-label="Close">✕</button>
          </div>
        </div>

        {/* ── Component Category Tabs ── */}
        <div style={{ padding: '10px 14px 0', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, color: 'var(--muted)', marginBottom: 6 }}>PREVIEW CATEGORY</div>
          <div style={{ display: 'flex', gap: 3, overflowX: 'auto', paddingBottom: 10 }}>
            {CATEGORIES.map(cat => {
              const active = activeCategory === cat.id
              return (
                <button key={cat.id} className={active ? '' : 'tp-cat-btn'} onClick={() => setActiveCategory(cat.id)}
                  style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, padding: '5px 8px',
                    background: active ? 'var(--green)' : 'var(--bg3)',
                    border: `1px solid ${active ? 'var(--green)' : 'var(--border)'}`,
                    borderRadius: 6, cursor: 'pointer', transition: 'all 0.15s',
                    color: active ? '#000' : 'var(--muted)',
                  }}>
                  <span style={{ fontSize: 11 }}>{cat.icon}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1, fontWeight: active ? 700 : 400 }}>{cat.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Live Preview Panel ── */}
        <div style={{ margin: '10px 14px 0', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, color: 'var(--muted)' }}>
              PREVIEW — {previewTheme.name.toUpperCase()} ({previewTheme.style.toUpperCase()})
            </span>
            <div style={{ display: 'flex', gap: 4 }}>
              {[previewTheme.primary, previewTheme.secondary, previewTheme.bg].map((c, i) => (
                <div key={i} style={{ width: 10, height: 10, borderRadius: 3, background: c, border: '1px solid rgba(255,255,255,0.1)' }}/>
              ))}
            </div>
          </div>
          <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
            <CategoryPreview t={previewTheme} category={activeCategory} />
          </div>
        </div>

        {/* ── Type + Tag Filters ── */}
        <div style={{ padding: '10px 14px 0', flexShrink: 0 }}>
          {/* Type row */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, color: 'var(--muted)',
              display: 'flex', alignItems: 'center', marginRight: 2 }}>TYPE:</div>
            {['ALL', 'COLOR', 'DESIGN', 'PACKAGES'].map(f => {
              const active = styleFilter === f
              const countMap = { ALL: THEMES.length, COLOR: colorThemes.length, DESIGN: designThemes.length, PACKAGES: packageThemes.length }
              return (
                <button key={f} className={active ? '' : 'tp-filter-btn'}
                  onClick={() => { setStyleFilter(f); setFilter('ALL') }}
                  style={{ flex: 1, padding: '4px 4px',
                    background: active ? 'rgba(168,85,247,0.18)' : 'transparent',
                    border: `1px solid ${active ? '#c084fc' : 'var(--border)'}`,
                    borderRadius: 5, cursor: 'pointer', transition: 'all 0.15s',
                    fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1,
                    color: active ? '#c084fc' : 'var(--muted)', fontWeight: active ? 700 : 400,
                  }}>
                  {f} <span style={{ opacity: 0.5, fontSize: 11 }}>({countMap[f]})</span>
                </button>
              )
            })}
          </div>
          {/* Tag filter (hide in DESIGN / PACKAGES mode since those span all tags) */}
          {styleFilter !== 'DESIGN' && styleFilter !== 'PACKAGES' && (
            <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, color: 'var(--muted)',
                display: 'flex', alignItems: 'center', marginRight: 2 }}>TAG:</div>
              {['ALL', 'DARK', 'LIGHT'].map(f => {
                const active = filter === f
                return (
                  <button key={f} className={active ? '' : 'tp-filter-btn'} onClick={() => setFilter(f)}
                    style={{ flex: 1, padding: '4px 4px',
                      background: active ? `${activeTheme.primary}18` : 'transparent',
                      border: `1px solid ${active ? activeTheme.primary : 'var(--border)'}`,
                      borderRadius: 5, cursor: 'pointer', transition: 'all 0.15s',
                      fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1,
                      color: active ? 'var(--green)' : 'var(--muted)', fontWeight: active ? 700 : 400,
                    }}>{f}</button>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Theme Grid ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 14px 8px',
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, alignContent: 'start' }}>
          {filteredThemes.map(t => (
            <ThemeCard key={t.id} t={t}
              isActive={t.type === 'package'
                ? userPackage?.id === t.packageId
                : getThemeFamily(theme) === getThemeFamily(t.id)}
              isSelected={pending === t.id}
              onSelect={handleSelect}
            />
          ))}
          {filteredThemes.length === 0 && (
            <div style={{ gridColumn: '1/-1', padding: 24, textAlign: 'center',
              fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', letterSpacing: 2 }}>
              NO THEMES IN THIS FILTER
            </div>
          )}
        </div>

        {/* ── Footer: Status + Apply ── */}
        <div style={{ borderTop: '1px solid var(--border)', padding: '12px 14px', flexShrink: 0,
          display: 'flex', flexDirection: 'column', gap: 8 }}>

          {/* Active → Pending status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8,
            background: 'var(--bg3)', borderRadius: 8, padding: '8px 10px', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', gap: 3 }}>
              {[activeTheme.bg, activeTheme.primary, activeTheme.secondary].map((c, i) => (
                <div key={i} style={{ width: 10, height: 10, borderRadius: 3, background: c, border: '1px solid rgba(255,255,255,0.08)' }}/>
              ))}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text)', letterSpacing: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {activeTheme.name}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', letterSpacing: 1 }}>ACTIVE</div>
            </div>
            {pending && pendingTheme ? (
              <>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--green)', flexShrink: 0 }}>→</span>
                <div style={{ display: 'flex', gap: 3 }}>
                  {[pendingTheme.bg, pendingTheme.primary, pendingTheme.secondary].map((c, i) => (
                    <div key={i} style={{ width: 10, height: 10, borderRadius: 3, background: c, border: '1px solid rgba(255,255,255,0.08)' }}/>
                  ))}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: pendingTheme.primary, letterSpacing: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {pendingTheme.name}
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', letterSpacing: 1 }}>SELECTED</div>
                </div>
              </>
            ) : (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', letterSpacing: 1, opacity: 0.6 }}>
                ← pick a theme
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 8 }}>
            {pending && (
              <button onClick={handleCancel}
                style={{ flex: '0 0 72px', padding: '10px 0',
                  background: 'transparent', border: '1px solid var(--border)', borderRadius: 6,
                  fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, color: 'var(--muted)', cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor='var(--text)'; e.currentTarget.style.color='var(--text)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.color='var(--muted)' }}
              >CANCEL</button>
            )}
            <button onClick={(!pending || isThemeLocked) ? undefined : handleApply}
              style={{
                flex: 1, padding: '11px 0',
                background: (pending && !isThemeLocked)
                  ? `linear-gradient(135deg, ${pendingTheme?.primary || 'var(--green)'}, ${pendingTheme?.secondary || 'var(--cyan)'})`
                  : 'var(--bg3)',
                border: (pending && !isThemeLocked) ? 'none' : '1px solid var(--border)',
                borderRadius: 7, cursor: (pending && !isThemeLocked) ? 'pointer' : 'default',
                fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 3,
                color: (pending && !isThemeLocked) ? '#000' : 'var(--muted)', fontWeight: 800,
                transition: 'all 0.2s',
                boxShadow: (pending && !isThemeLocked) ? `0 0 24px ${pendingTheme?.primary || 'var(--green)'}55` : 'none',
                opacity: (pending && !isThemeLocked) ? 1 : 0.4,
              }}
              onMouseEnter={e => { if (pending && !isThemeLocked) e.currentTarget.style.transform = 'translateY(-1px)' }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'none' }}
            >
              {isThemeLocked
                ? '🔒 THEME LOCKED BY ADMIN'
                : pending
                ? `✓ APPLY ${pendingTheme?.name?.toUpperCase() || ''}`
                : 'SELECT A THEME ABOVE'}
            </button>
          </div>
        </div>

        {/* ── ADMIN GLOBAL SETTINGS PANEL ─────────────────────────────── */}
        {showAdminPanel && isAdmin && (
          <div className="tp-drawer-chrome" style={{
            position: 'fixed', top: 0, right: 0, bottom: 0,
            width: 380, zIndex: 1001,
            background: 'var(--bg)', display: 'flex', flexDirection: 'column',
            borderLeft: '2px solid rgba(245,158,11,0.4)',
            boxShadow: '-24px 0 60px rgba(0,0,0,0.85)',
            animation: 'tp-slide-in .25s cubic-bezier(0.16,1,0.3,1)',
          }}>
            <style>{`@keyframes tp-slide-in { from{opacity:0;transform:translateX(32px)} to{opacity:1;transform:none} }`}</style>

            {/* Panel header */}
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              <span style={{ fontSize: 16 }}>⚙</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: 3, color: '#f59e0b' }}>GLOBAL SETTINGS</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', letterSpacing: 1 }}>APPLIED TO ALL SITE VISITORS</div>
              </div>
              <button onClick={() => setShowAdminPanel(false)} style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer', borderRadius: 6, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>✕</button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '14px' }}>

              {/* ── 1. Global Theme ── */}
              <Section label="🎨 GLOBAL THEME" desc="Force a theme for all users visiting the site">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
                  <AdminThemeBtn id="" label="User's Choice" active={globalDraft.globalTheme === ''} onClick={() => setGlobalDraft(d => ({ ...d, globalTheme: '' }))} color="var(--muted)" />
                  {THEMES.filter(t => t.type !== 'package').map(t => (
                    <AdminThemeBtn key={t.id} id={t.id} label={t.name} active={globalDraft.globalTheme === t.id} onClick={() => setGlobalDraft(d => ({ ...d, globalTheme: t.id }))} color={t.primary} bg={t.bg2} />
                  ))}
                </div>
                <Toggle label="Lock theme (prevent user overrides)" checked={globalDraft.lockTheme} onChange={v => setGlobalDraft(d => ({ ...d, lockTheme: v }))} />
              </Section>

              {/* ── 2. Loading Screen Style ── */}
              <Section label="⏳ LOADING SCREEN" desc="Choose the loading animation users see on first visit">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {[
                    { id: 'terminal', label: 'Terminal', desc: 'Boot sequence'     },
                    { id: 'minimal',  label: 'Minimal',  desc: 'Clean spinner'     },
                    { id: 'glitch',   label: 'Glitch',   desc: 'Glitch text'       },
                    { id: 'matrix',   label: 'Matrix',   desc: 'Matrix rain'       },
                    { id: 'splash',   label: 'Splash',   desc: 'Brand reveal'      },
                    { id: 'pulse',    label: 'Pulse',    desc: 'Breathing ring'    },
                    { id: 'cyber',    label: 'Cyber',    desc: 'Hex grid boot'     },
                    { id: 'bars',     label: 'Bars',     desc: 'Progress bars'     },
                    { id: 'wave',     label: 'Wave',     desc: 'Wave sweep'        },
                    { id: 'neon',     label: 'Neon',     desc: 'Neon sign flicker' },
                  ].map(s => {
                    const active = globalDraft.loadingScreenStyle === s.id
                    return (
                      <button key={s.id} onClick={() => setGlobalDraft(d => ({ ...d, loadingScreenStyle: s.id }))}
                        style={{ padding: 0, display: 'flex', flexDirection: 'column', alignItems: 'stretch', background: active ? 'color-mix(in srgb, var(--green) 10%, transparent)' : 'var(--bg3)', border: `1px solid ${active ? 'var(--green)' : 'var(--border)'}`, borderRadius: 8, cursor: 'pointer', transition: 'all .15s', overflow: 'hidden', boxShadow: active ? '0 0 10px color-mix(in srgb, var(--green) 15%, transparent)' : 'none' }}>
                        {/* Mini animated preview */}
                        <div style={{ height: 48, background: '#060a0f', display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: `1px solid ${active ? 'color-mix(in srgb, var(--green) 30%, transparent)' : 'var(--border)'}`, overflow: 'hidden', position: 'relative' }}>
                          {s.id === 'terminal' && <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#33ff33' }}>&gt;_<span style={{ borderRight: '2px solid #33ff33', animation: 'tpBlink 1s step-end infinite', marginLeft: 2 }} /></span>}
                          {s.id === 'minimal'  && <div style={{ width: 22, height: 22, border: '3px solid #0a1118', borderTopColor: '#00ff88', borderRadius: '50%', animation: 'tpSpin 0.8s linear infinite' }} />}
                          {s.id === 'glitch'   && <span style={{ fontFamily: 'monospace', fontWeight: 900, fontSize: 15, color: '#fff', textShadow: '2px 0 #ff003c, -2px 0 #00eaff', animation: 'miniGlitch 2.5s infinite' }}>AI</span>}
                          {s.id === 'splash'   && <div style={{ textAlign: 'center' }}><div style={{ fontSize: 14, animation: 'miniZoomIn 1.8s ease-out infinite alternate' }}>⬡</div><div style={{ fontFamily: 'monospace', fontSize: 11, letterSpacing: 3, color: '#00ff88', marginTop: 1 }}>AIFAZI</div></div>}
                          {s.id === 'matrix'   && <div style={{ display: 'flex', gap: 3, fontFamily: 'monospace', fontSize: 11, color: '#00ff88' }}>{['1','0','1','0','1'].map((c,i) => <span key={i} style={{ animation: `miniDotBounce 1.2s ${i*0.15}s ease-in-out infinite`, display: 'inline-block' }}>{c}</span>)}</div>}
                          {s.id === 'pulse'    && <div style={{ position: 'relative', width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid #00ff88', animation: 'lsPulse 1.4s ease-in-out infinite' }} /><div style={{ position: 'absolute', inset: 7, borderRadius: '50%', border: '1px solid #00d4ff', animation: 'lsPulse 1.4s 0.3s ease-in-out infinite' }} /><div style={{ width: 5, height: 5, borderRadius: '50%', background: '#00ff88' }} /></div>}
                          {s.id === 'cyber'    && <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', width: 40, justifyContent: 'center' }}>{[...Array(9)].map((_,i) => <div key={i} style={{ width: 10, height: 10, border: '1px solid #00d4ff', borderRadius: 2, animation: `lsCyberHex 1.8s ${i*0.12}s ease-in-out infinite` }} />)}</div>}
                          {s.id === 'bars'     && <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 26 }}>{[0,0.15,0.3,0.45,0.6].map((d,i) => <div key={i} style={{ width: 4, borderRadius: 2, background: i%2===0?'#00ff88':'#00d4ff', animation: `lsBars 1.1s ${d}s ease-in-out infinite` }} />)}</div>}
                          {s.id === 'wave'     && <div style={{ width: 46, height: 4, background: '#0b1118', borderRadius: 3, overflow: 'hidden', position: 'relative' }}><div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg,transparent,#00ff88,#00d4ff,transparent)', animation: 'lsWave 1.4s linear infinite' }} /></div>}
                          {s.id === 'neon'     && <span style={{ fontFamily: 'monospace', fontWeight: 900, fontSize: 12, letterSpacing: 3, color: '#00ff88', animation: 'lsNeon 3s infinite' }}>NET</span>}
                        </div>
                        <div style={{ padding: '6px 6px 7px', textAlign: 'center' }}>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: active ? 'var(--green)' : 'var(--text)', letterSpacing: 1, marginBottom: 2 }}>{s.label}</div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>{s.desc}</div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </Section>

              {/* ── 3. Animation Preset ── */}
              <Section label="✨ ANIMATION PRESET" desc="Controls transition speed and easing across the whole site">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {[
                    { id: 'smooth',     label: 'Smooth',     desc: '0.35s elegant ease',   anim: 'apSmooth 1.8s ease infinite alternate' },
                    { id: 'snappy',     label: 'Snappy',     desc: '0.12s fast & crisp',   anim: 'apSnappy 0.8s ease infinite alternate' },
                    { id: 'bouncy',     label: 'Bouncy',     desc: '0.45s spring effect',  anim: 'apBouncy 1.4s ease infinite alternate' },
                    { id: 'expressive', label: 'Expressive', desc: 'Bold dramatic motion', anim: 'apExpressive 2s ease infinite alternate' },
                    { id: 'reduced',    label: 'Reduced',    desc: 'Subtle, accessible',   anim: 'apReduced 1.5s ease infinite alternate' },
                    { id: 'elastic',    label: 'Elastic',    desc: 'Overshoot & snap back',anim: 'apElastic 1.6s ease infinite alternate' },
                    { id: 'cinematic',  label: 'Cinematic',  desc: 'Slow dramatic ease',   anim: 'apCinematic 2.4s ease infinite alternate' },
                    { id: 'none',       label: 'None',       desc: 'No animations',        anim: null },
                  ].map(a => {
                    const active = globalDraft.animationPreset === a.id
                    return (
                      <button key={a.id} onClick={() => setGlobalDraft(d => ({ ...d, animationPreset: a.id }))}
                        style={{ padding: 0, display: 'flex', flexDirection: 'column', alignItems: 'stretch', background: active ? 'color-mix(in srgb, var(--cyan) 10%, transparent)' : 'var(--bg3)', border: `1px solid ${active ? 'var(--cyan)' : 'var(--border)'}`, borderRadius: 8, cursor: 'pointer', transition: 'all .15s', overflow: 'hidden', boxShadow: active ? '0 0 10px color-mix(in srgb, var(--cyan) 15%, transparent)' : 'none' }}>
                        <div style={{ height: 48, background: '#060a0f', display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: `1px solid ${active ? 'color-mix(in srgb, var(--cyan) 30%, transparent)' : 'var(--border)'}`, overflow: 'hidden' }}>
                          {a.id === 'none' ? (
                            <span style={{ fontFamily: 'monospace', fontSize: 18, color: '#6b8296' }}>—</span>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: 48, animation: a.anim }}>
                              <div style={{ height: 6, background: active ? '#00d4ff' : '#00ff88', borderRadius: 3, width: '100%', opacity: 0.85 }} />
                              <div style={{ height: 4, background: '#6b8296', borderRadius: 3, width: '75%', opacity: 0.5 }} />
                              <div style={{ height: 4, background: '#6b8296', borderRadius: 3, width: '50%', opacity: 0.35 }} />
                            </div>
                          )}
                        </div>
                        <div style={{ padding: '6px 6px 7px', textAlign: 'center' }}>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: active ? 'var(--cyan)' : 'var(--text)', letterSpacing: 1, marginBottom: 2 }}>{a.label}</div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>{a.desc}</div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </Section>

              {/* ── 4. Maintenance Mode ── */}
              <Section label="🔧 MAINTENANCE MODE" desc="Hides the site for all non-admin visitors">

                {/* Master toggle */}
                <div style={{ background: globalDraft.maintenanceMode ? 'rgba(245,158,11,0.06)' : 'var(--bg3)', border: `1px solid ${globalDraft.maintenanceMode ? 'rgba(245,158,11,0.35)' : 'var(--border)'}`, borderRadius: 8, padding: '10px 12px', marginBottom: 10, transition: 'all .2s' }}>
                  <Toggle label="Enable maintenance mode" checked={globalDraft.maintenanceMode} onChange={v => setGlobalDraft(d => ({ ...d, maintenanceMode: v }))} accent="#f59e0b" />
                  {globalDraft.maintenanceMode && (
                    <div style={{ marginTop: 8, fontFamily: 'var(--font-mono)', fontSize: 11, color: '#f59e0b', letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#f59e0b', display: 'inline-block', animation: 'tpBlink 1s infinite' }}/>
                      LIVE — VISITORS SEE MAINTENANCE PAGE
                    </div>
                  )}
                </div>

                {globalDraft.maintenanceMode && (<>

                  {/* ── Page Style ── */}
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, color: 'var(--muted)', marginBottom: 6 }}>PAGE STYLE</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 5, marginBottom: 12 }}>
                    {[
                      { id: 'terminal',    icon: '>_',  label: 'Terminal',    desc: 'Boot console' },
                      { id: 'cyber',       icon: '⬡',   label: 'Cyber',       desc: 'Grid & glow' },
                      { id: 'glitch',      icon: '▓',   label: 'Glitch',      desc: 'Corrupted fx' },
                      { id: 'minimal',     icon: '◌',   label: 'Minimal',     desc: 'Clean & quiet' },
                      { id: 'coming-soon', icon: '🚀',  label: 'Launch',      desc: 'Coming soon' },
                      { id: 'retro',       icon: '▶',   label: 'Retro',       desc: 'Pixel / 8-bit' },
                    ].map(s => {
                      const active = globalDraft.maintenanceStyle === s.id
                      return (
                        <button key={s.id} onClick={() => setGlobalDraft(d => ({ ...d, maintenanceStyle: s.id }))}
                          style={{ padding: '8px 6px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                            background: active ? 'rgba(245,158,11,0.12)' : 'var(--bg3)',
                            border: `1px solid ${active ? '#f59e0b' : 'var(--border)'}`,
                            borderRadius: 7, cursor: 'pointer', transition: 'all .15s' }}>
                          <span style={{ fontSize: 16, fontFamily: 'monospace' }}>{s.icon}</span>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: active ? '#f59e0b' : 'var(--text)', letterSpacing: 1 }}>{s.label}</span>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>{s.desc}</span>
                        </button>
                      )
                    })}
                  </div>

                  {/* ── Status Badge Type ── */}
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, color: 'var(--muted)', marginBottom: 6 }}>STATUS BADGE</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 12 }}>
                    {['MAINTENANCE', 'UPDATING', 'COMING SOON', 'OFFLINE', 'UPGRADING'].map(s => {
                      const active = globalDraft.maintenanceStatus === s
                      const colors = { MAINTENANCE: '#f59e0b', UPDATING: '#3b82f6', 'COMING SOON': '#a855f7', OFFLINE: '#ef4444', UPGRADING: '#06b6d4' }
                      const c = colors[s]
                      return (
                        <button key={s} onClick={() => setGlobalDraft(d => ({ ...d, maintenanceStatus: s }))}
                          style={{ padding: '4px 9px', background: active ? `${c}18` : 'transparent',
                            border: `1px solid ${active ? c : 'var(--border)'}`,
                            borderRadius: 4, cursor: 'pointer', transition: 'all .15s',
                            fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1,
                            color: active ? c : 'var(--muted)', fontWeight: active ? 700 : 400 }}>
                          {s}
                        </button>
                      )
                    })}
                  </div>

                  {/* ── Icon picker ── */}
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, color: 'var(--muted)', marginBottom: 6 }}>PAGE ICON</div>
                  <div style={{ display: 'flex', gap: 5, marginBottom: 12 }}>
                    {['⚙️','🔧','🚀','🛠️','⚡','🔒','🌐','💻'].map(ic => (
                      <button key={ic} onClick={() => setGlobalDraft(d => ({ ...d, maintenanceIcon: ic }))}
                        style={{ width: 32, height: 32, fontSize: 16, borderRadius: 6, cursor: 'pointer',
                          background: globalDraft.maintenanceIcon === ic ? 'rgba(245,158,11,0.15)' : 'var(--bg3)',
                          border: `1px solid ${globalDraft.maintenanceIcon === ic ? '#f59e0b' : 'var(--border)'}`,
                          transition: 'all .15s', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {ic}
                      </button>
                    ))}
                  </div>

                  {/* ── Background Style ── */}
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, color: 'var(--muted)', marginBottom: 6 }}>BACKGROUND PATTERN</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 5, marginBottom: 12 }}>
                    {[
                      { id: 'grid',   label: 'Grid',   preview: 'repeating-linear-gradient(0deg,#0d0 1px,transparent 20px),repeating-linear-gradient(90deg,#0d0 1px,transparent 20px)' },
                      { id: 'radial', label: 'Radial', preview: 'radial-gradient(circle at 50% 50%,#f59e0b22,transparent 70%)' },
                      { id: 'dots',   label: 'Dots',   preview: 'radial-gradient(circle,#fff2 1px,transparent 1px)' },
                      { id: 'clean',  label: 'Clean',  preview: 'none' },
                      { id: 'matrix', label: 'Matrix', preview: 'repeating-linear-gradient(180deg,#00ff0008 0px,#00ff0008 2px,transparent 2px,transparent 20px)' },
                    ].map(bg => {
                      const active = globalDraft.maintenanceBgStyle === bg.id
                      return (
                        <button key={bg.id} onClick={() => setGlobalDraft(d => ({ ...d, maintenanceBgStyle: bg.id }))}
                          style={{ padding: '0', height: 44, borderRadius: 6, cursor: 'pointer', overflow: 'hidden', position: 'relative',
                            border: `1.5px solid ${active ? '#f59e0b' : 'var(--border)'}`,
                            transition: 'all .15s' }}>
                          <div style={{ position: 'absolute', inset: 0, background: '#0a0f18', backgroundImage: bg.preview, backgroundSize: '20px 20px' }}/>
                          <span style={{ position: 'relative', fontFamily: 'var(--font-mono)', fontSize: 11, color: active ? '#f59e0b' : 'var(--muted)', letterSpacing: 1, display: 'block', textAlign: 'center', paddingTop: 26 }}>{bg.label}</span>
                        </button>
                      )
                    })}
                  </div>

                  {/* ── Progress bar ── */}
                  <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', marginBottom: 10 }}>
                    <Toggle label="Show progress bar" checked={globalDraft.maintenanceShowProgress} onChange={v => setGlobalDraft(d => ({ ...d, maintenanceShowProgress: v }))} accent="#f59e0b" />
                    {globalDraft.maintenanceShowProgress && (
                      <div style={{ marginTop: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', letterSpacing: 2 }}>PROGRESS</span>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#f59e0b', fontWeight: 700 }}>{globalDraft.maintenanceProgress}%</span>
                        </div>
                        <input type="range" min={0} max={100} value={globalDraft.maintenanceProgress}
                          onChange={e => setGlobalDraft(d => ({ ...d, maintenanceProgress: +e.target.value }))}
                          style={{ width: '100%', accentColor: '#f59e0b', cursor: 'pointer' }} />
                        <div style={{ height: 4, borderRadius: 2, background: 'var(--border)', marginTop: 4, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${globalDraft.maintenanceProgress}%`, background: 'linear-gradient(90deg,#f59e0b,#00d4ff)', borderRadius: 2, transition: 'width .2s' }}/>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* ── Expected return time ── */}
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', letterSpacing: 2, marginBottom: 5 }}>EXPECTED RETURN TIME</div>
                    <input value={globalDraft.maintenanceReturnTime} onChange={e => setGlobalDraft(d => ({ ...d, maintenanceReturnTime: e.target.value }))}
                      placeholder="e.g. Today at 6:00 PM UTC"
                      style={{ width: '100%', background: 'var(--bg3)', border: '1px solid rgba(245,158,11,0.3)', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: 11, padding: '8px 10px', borderRadius: 6, outline: 'none', boxSizing: 'border-box' }} />
                  </div>

                  {/* ── Social links visibility ── */}
                  <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', marginBottom: 10 }}>
                    <Toggle label="Show social links on maintenance page" checked={globalDraft.maintenanceShowSocial} onChange={v => setGlobalDraft(d => ({ ...d, maintenanceShowSocial: v }))} accent="#f59e0b" />
                  </div>

                  {/* ── Message ── */}
                  <div style={{ marginBottom: 4 }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', letterSpacing: 2, marginBottom: 5 }}>MAINTENANCE MESSAGE</div>
                    <textarea value={globalDraft.maintenanceMessage} onChange={e => setGlobalDraft(d => ({ ...d, maintenanceMessage: e.target.value }))} rows={3} placeholder="We are currently performing maintenance..."
                      style={{ width: '100%', background: 'var(--bg3)', border: '1px solid rgba(245,158,11,0.4)', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: 11, padding: '8px 10px', borderRadius: 6, resize: 'vertical', outline: 'none', boxSizing: 'border-box' }} />
                  </div>

                  {/* ── Live preview strip ── */}
                  <MaintenancePreviewStrip draft={globalDraft} />

                </>)}
              </Section>

              {/* ── 5. Header Style ── */}
              <Section label="▬ HEADER STYLE" desc="Navigation bar design applied to all site visitors">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {HEADER_PRESETS.map(p => {
                    const active = globalDraft.headerStyle === p.id
                    return (
                      <button key={p.id} onClick={() => setGlobalDraft(d => ({ ...d, headerStyle: p.id }))}
                        style={{
                          padding: 0, overflow: 'hidden', cursor: 'pointer', textAlign: 'left',
                          background: active ? 'color-mix(in srgb, var(--green) 7%, transparent)' : 'var(--bg3)',
                          border: `2px solid ${active ? 'var(--green)' : 'var(--border)'}`,
                          borderRadius: 8, transition: 'all .15s',
                          boxShadow: active ? '0 0 10px color-mix(in srgb, var(--green) 18%, transparent)' : 'none',
                        }}>
                        <div style={{ background: '#000', borderBottom: `1px solid ${active ? 'color-mix(in srgb, var(--green) 25%, transparent)' : 'var(--border)'}` }}>
                          <HeaderPreviewSVG id={p.id} />
                        </div>
                        <div style={{ padding: '5px 8px', display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: active ? 'var(--green)' : 'var(--text)', letterSpacing: 1 }}>{p.name}</span>
                          {active && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--green)', padding: '1px 4px', background: 'color-mix(in srgb, var(--green) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--green) 25%, transparent)' }}>✓ ACTIVE</span>}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </Section>

              {/* ── 6. Footer Style ── */}
              <Section label="▤ FOOTER STYLE" desc="Footer layout applied site-wide to all visitors">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {FOOTER_PRESETS.map(p => {
                    const active = globalDraft.footerStyle === p.id
                    return (
                      <button key={p.id} onClick={() => setGlobalDraft(d => ({ ...d, footerStyle: p.id }))}
                        style={{
                          padding: 0, overflow: 'hidden', cursor: 'pointer', textAlign: 'left',
                          background: active ? 'color-mix(in srgb, var(--green) 7%, transparent)' : 'var(--bg3)',
                          border: `2px solid ${active ? 'var(--green)' : 'var(--border)'}`,
                          borderRadius: 8, transition: 'all .15s',
                          boxShadow: active ? '0 0 10px color-mix(in srgb, var(--green) 18%, transparent)' : 'none',
                        }}>
                        <div style={{ background: '#000', borderBottom: `1px solid ${active ? 'color-mix(in srgb, var(--green) 25%, transparent)' : 'var(--border)'}` }}>
                          <FooterPreviewSVG id={p.id} />
                        </div>
                        <div style={{ padding: '5px 8px', display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: active ? 'var(--green)' : 'var(--text)', letterSpacing: 1 }}>{p.name}</span>
                          {active && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--green)', padding: '1px 4px', background: 'color-mix(in srgb, var(--green) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--green) 25%, transparent)' }}>✓ ACTIVE</span>}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </Section>
            </div>

            {/* Save button */}
            <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
              <button onClick={saveGlobalSettings} disabled={savingGlobal}
                style={{ width: '100%', padding: '12px', background: savedGlobal ? 'color-mix(in srgb, var(--green) 15%, transparent)' : 'rgba(245,158,11,0.15)', border: `1px solid ${savedGlobal ? 'var(--green)' : 'rgba(245,158,11,0.5)'}`, color: savedGlobal ? 'var(--green)' : '#f59e0b', borderRadius: 8, cursor: savingGlobal ? 'default' : 'pointer', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, fontWeight: 700, transition: 'all .2s' }}>
                {savingGlobal ? '⏳ SAVING...' : savedGlobal ? '✓ SAVED GLOBALLY' : '💾 SAVE FOR ALL USERS'}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

// ── Helpers for admin panel ───────────────────────────────────────────────────
function Section({ label, desc, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 3, color: 'var(--muted)', marginBottom: 3 }}>{label}</div>
      {desc && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', opacity: 0.6, marginBottom: 8, lineHeight: 1.5 }}>{desc}</div>}
      {children}
    </div>
  )
}

function Toggle({ label, checked, onChange, accent = 'var(--green)' }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
      <div onClick={() => onChange(!checked)}
        style={{ width: 36, height: 20, borderRadius: 10, background: checked ? accent : 'var(--bg3)', border: `1px solid ${checked ? accent : 'var(--border)'}`, position: 'relative', flexShrink: 0, cursor: 'pointer', transition: 'all .2s' }}>
        <div style={{ position: 'absolute', top: 2, left: checked ? 18 : 2, width: 14, height: 14, borderRadius: '50%', background: checked ? '#000' : 'var(--muted)', transition: 'left .2s' }} />
      </div>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: checked ? accent : 'var(--muted)', transition: 'color .2s' }}>{label}</span>
    </label>
  )
}

// ── Maintenance preview strip (mini mockup inside admin panel) ────────────────
function MaintenancePreviewStrip({ draft }) {
  const statusColors = {
    MAINTENANCE: '#f59e0b', UPDATING: '#3b82f6', 'COMING SOON': '#a855f7',
    OFFLINE: '#ef4444', UPGRADING: '#06b6d4',
  }
  const sc = statusColors[draft.maintenanceStatus] || '#f59e0b'

  const bgPatterns = {
    grid:   { backgroundImage: 'linear-gradient(color-mix(in srgb, var(--cyan) 4%, transparent) 1px,transparent 1px),linear-gradient(90deg,color-mix(in srgb, var(--cyan) 4%, transparent) 1px,transparent 1px)', backgroundSize: '16px 16px' },
    radial: { backgroundImage: `radial-gradient(ellipse at 50% 50%, ${sc}12 0%, transparent 70%)` },
    dots:   { backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)', backgroundSize: '10px 10px' },
    clean:  {},
    matrix: { backgroundImage: 'repeating-linear-gradient(180deg,rgba(0,255,0,0.04) 0px,rgba(0,255,0,0.04) 2px,transparent 2px,transparent 14px)' },
  }
  const bgPat = bgPatterns[draft.maintenanceBgStyle] || {}

  return (
    <div style={{ marginTop: 10, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, color: 'var(--muted)', padding: '5px 8px', background: 'var(--bg3)', borderBottom: '1px solid var(--border)' }}>
        ◉ LIVE PREVIEW
      </div>
      <div style={{ height: 120, background: '#060a0f', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', ...bgPat }}>
        <div style={{ textAlign: 'center', zIndex: 1, padding: '0 12px' }}>
          {/* icon */}
          <div style={{ fontSize: 22, marginBottom: 5 }}>{draft.maintenanceIcon}</div>
          {/* status badge */}
          <div style={{ display: 'inline-block', padding: '2px 8px', background: `${sc}15`, border: `1px solid ${sc}44`,
            borderRadius: 3, marginBottom: 6 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, color: sc }}>{draft.maintenanceStatus}</span>
          </div>
          {/* title bars */}
          <div style={{ height: 5, background: 'rgba(255,255,255,0.7)', borderRadius: 2, width: 100, margin: '0 auto 4px' }}/>
          <div style={{ height: 3, background: 'rgba(255,255,255,0.2)', borderRadius: 2, width: 140, margin: '0 auto 8px' }}/>
          {/* progress bar */}
          {draft.maintenanceShowProgress && (
            <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.1)', width: 140, margin: '0 auto 6px', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${draft.maintenanceProgress}%`, background: `linear-gradient(90deg,${sc},#00d4ff)`, borderRadius: 2 }}/>
            </div>
          )}
          {/* return time */}
          {draft.maintenanceReturnTime && (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: 1 }}>
              ⏱ {draft.maintenanceReturnTime}
            </div>
          )}
        </div>
        {/* style label badge */}
        <div style={{ position: 'absolute', top: 6, right: 6, padding: '2px 6px', background: 'rgba(0,0,0,0.6)',
          border: '1px solid var(--border)', borderRadius: 3 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase' }}>{draft.maintenanceStyle}</span>
        </div>
      </div>
    </div>
  )
}

function AdminThemeBtn({ id, label, active, onClick, color, bg }) {
  return (
    <button onClick={onClick} style={{ padding: '6px 8px', display: 'flex', alignItems: 'center', gap: 6, background: active ? `${color}15` : 'var(--bg3)', border: `1px solid ${active ? color : 'var(--border)'}`, borderRadius: 6, cursor: 'pointer', transition: 'all .15s', textAlign: 'left' }}>
      {bg && <div style={{ width: 12, height: 12, borderRadius: 3, background: bg, border: `2px solid ${color}`, flexShrink: 0 }} />}
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: active ? color : 'var(--muted)', fontWeight: active ? 700 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      {active && <span style={{ marginLeft: 'auto', color, fontSize: 11 }}>✓</span>}
    </button>
  )
}
