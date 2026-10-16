'use client'
import { useState, useEffect, useRef } from 'react'
import Clickable from '../../core/Clickable.jsx'
import { Input, Slider } from '@/core/forms'
import { Modal } from './ui'
import { HeaderPreviewSVG, FooterPreviewSVG } from './SiteSettings'
import { FRAMEWORK_CATEGORIES, DEFAULT_FRAMEWORK } from '../../core/framework-styles.js'
import { CUSTOM_COLOR_TOKENS } from '@/core/themeCustom'
import { parseThemeDesignPackage } from '@/core/themeDesign'
import { FwMenuPreview, FwNotifyPreview, FwDialogPreview, FwInputPreview, FwSurfacePreview, FwLoadingPreview, FwAnimPreview, _BG, _BG2, _BG3, _BD, _TX, _MT, _FM, _FD, _tag } from './themeLibraryPreviews'
import { THEME_DEFS, COLOR_LABELS, NEON_SWATCHES, PREVIEW_BG_PATTERNS, PREVIEW_BG_SIZES } from './themeLibraryData'

// Presentational parts + pure helpers for ThemeLibrary (extracted from that file).
// Luminance-based light detection (keeps package previews readable on any theme)
function isLightSurface(hex) {
  if (!hex) return false
  const m = String(hex).match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
  if (!m) return false
  const r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16)
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) > 140
}

const LIGHT_PACKAGE_THEMES = new Set([
  'paper', 'macos', 'brutalist', 'pastel', 'win95', 'neumorph', 'light', 'cyber-light',
])

function ThemePackageCard({ pkg, isActive, isCustomized, isSaving, onApply }) {
  const s = pkg.settings
  const isLight = LIGHT_PACKAGE_THEMES.has(s.globalTheme) || isLightSurface(pkg.previewBg)
  const text = isLight ? '#111827' : '#dbeafe'
  const muted = isLight ? '#6b7280' : '#7f95aa'
  const panel = isLight ? 'rgba(255,255,255,0.86)' : 'rgba(8,14,24,0.88)'
  const border = isLight ? 'rgba(17,24,39,0.18)' : 'rgba(255,255,255,0.12)'
  const badgeBg = isLight ? '#ffffff' : 'rgba(255,255,255,0.06)'
  return (
    <button
      onClick={() => onApply(pkg)}
      disabled={isSaving}
      className="tl-pkg-card"
      data-active={isActive ? 'true' : undefined}
      aria-pressed={isActive}
      style={{
        display: 'flex',
        flexDirection: 'column',
        padding: 0,
        textAlign: 'left',
        cursor: isSaving ? 'wait' : 'pointer',
        background: panel,
        border: `2px solid ${isActive ? pkg.accent : border}`,
        borderRadius: 12,
        overflow: 'hidden',
        boxShadow: isActive ? `0 0 28px ${pkg.accent}35, 0 18px 42px rgba(0,0,0,.32)` : '0 10px 28px rgba(0,0,0,.24)',
        transition: 'transform .18s var(--ease, ease), border-color .18s var(--ease, ease), box-shadow .18s var(--ease, ease)',
      }}
    >
      <div style={{ height: 210, width: '100%', background: pkg.previewBg, position: 'relative', overflow: 'hidden', borderBottom: `1px solid ${border}` }}>
        <div style={{ position: 'absolute', inset: 0, opacity: .5, backgroundImage: s.backgroundPattern === 'clean' ? 'none' : `linear-gradient(${pkg.accent}22 1px, transparent 1px), linear-gradient(90deg, ${pkg.accent}18 1px, transparent 1px)`, backgroundSize: s.backgroundPattern === 'circuit' ? '28px 28px' : '18px 18px' }} />
        <div style={{ position: 'absolute', inset: 12, display: 'grid', gridTemplateRows: '38px 1fr 30px', gap: 8 }}>
          <div style={{ background: badgeBg, border: `1px solid ${pkg.accent}55`, borderRadius: s.headerStyle === 'brutal' ? 0 : s.headerStyle === 'glass' ? 14 : 6, overflow: 'hidden' }}>
            <HeaderPreviewSVG id={s.headerStyle} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '92px 1fr', gap: 8, minHeight: 0 }}>
            <div style={{ display: 'grid', gridTemplateRows: '1fr 56px', gap: 8, minWidth: 0 }}>
              <div style={{ minHeight: 0, background: badgeBg, border: `1px solid ${border}`, borderRadius: s.menuStyle === 'arcade' || s.menuStyle === 'terminal' ? 0 : 8, padding: 8, overflow: 'hidden' }}>
                <FwMenuPreview id={s.menuStyle} />
              </div>
              <div style={{ minHeight: 0, background: badgeBg, border: `1px solid ${border}`, borderRadius: 8, padding: 7, overflow: 'hidden' }}>
                <FwLoadingPreview id={s.loadingScreenStyle} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateRows: '1fr 54px', gap: 8, minWidth: 0, minHeight: 0 }}>
              <div style={{ minHeight: 0, background: badgeBg, border: `1px solid ${border}`, borderRadius: s.surfaceStyle === 'brutalist' ? 0 : 8, overflow: 'hidden' }}>
                <FwSurfacePreview id={s.surfaceStyle} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, minHeight: 0 }}>
                <div style={{ minWidth: 0, background: badgeBg, border: `1px solid ${border}`, borderRadius: 8, padding: 7, overflow: 'hidden' }}>
                  <FwInputPreview id={s.inputStyle} />
                </div>
                <div style={{ minWidth: 0, background: badgeBg, border: `1px solid ${border}`, borderRadius: 8, padding: 7, overflow: 'hidden' }}>
                  <FwNotifyPreview id={s.notifyStyle} />
                </div>
              </div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px', gap: 8 }}>
            <div style={{ background: badgeBg, border: `1px solid ${border}`, borderRadius: 6, overflow: 'hidden' }}>
              <FooterPreviewSVG id={s.footerStyle} />
            </div>
            <div style={{ background: badgeBg, border: `1px solid ${border}`, borderRadius: 6, padding: 6, overflow: 'hidden' }}>
              <FwDialogPreview id={s.dialogStyle} />
            </div>
          </div>
        </div>
      </div>
      <div style={{ width: '100%', padding: 16, boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 7 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: _FD, fontSize: 17, fontWeight: 800, color: isActive ? pkg.accent : text }}>{pkg.name}</div>
            <div style={{ fontFamily: _FM, fontSize: 11, letterSpacing: 2, color: pkg.accent, marginTop: 2, textTransform: 'uppercase' }}>{pkg.mood}</div>
          </div>
          {isActive && <span style={{ ..._tag(pkg.accent), whiteSpace: 'nowrap' }}>{isCustomized ? 'CUSTOMIZED' : 'ACTIVE'}</span>}
        </div>
        <div style={{ fontFamily: _FM, fontSize: 11, color: muted, lineHeight: 1.6, minHeight: 34 }}>{pkg.desc}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 12 }}>
          {[s.globalTheme, s.headerStyle, s.menuStyle, s.dialogStyle, s.inputStyle, s.loadingScreenStyle].map((x, i) => (
            <span key={`${x}-${i}`} style={{ fontFamily: _FM, fontSize: 11, color: text, background: isLight ? '#f3f4f6' : 'rgba(255,255,255,.06)', border: `1px solid ${border}`, borderRadius: 999, padding: '3px 7px' }}>{x}</span>
          ))}
        </div>
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <span style={{ fontFamily: _FM, fontSize: 11, color: muted }}>{isSaving ? 'Applying package...' : 'Apply as starting point'}</span>
          <span style={{ fontFamily: _FM, fontSize: 11, color: isActive ? pkg.accent : '#000', background: isActive ? `${pkg.accent}18` : pkg.accent, border: `1px solid ${pkg.accent}`, borderRadius: 5, padding: '7px 11px', fontWeight: 800 }}>{isActive ? 'SELECTED' : 'APPLY'}</span>
        </div>
      </div>
    </button>
  )
}

function FwStyleCard({ item, isActive, onSelect, accentColor, category }) {
  return (
    <Clickable as="div"
      onClick={() => onSelect(item.id)}
      className="tl-style-card"
      data-active={isActive ? 'true' : undefined}
      style={{
        background: isActive ? `${accentColor}09` : _BG2,
        border: `2px solid ${isActive ? accentColor : _BD}`,
        borderRadius: 10,
        cursor: 'pointer',
        overflow: 'hidden',
        transition: 'all 0.18s cubic-bezier(0.16,1,0.3,1)',
        boxShadow: isActive
          ? `0 0 18px ${accentColor}28, 0 4px 16px rgba(0,0,0,0.3)`
          : '0 2px 8px rgba(0,0,0,0.2)',
        position: 'relative',
        transform: isActive ? 'translateY(-2px)' : 'translateY(0)',
      }}
    >
      {isActive && (
        <div
          aria-hidden
          style={{
            position: 'absolute', top: 7, right: 7, zIndex: 2,
            width: 18, height: 18, borderRadius: '50%', background: accentColor,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, color: '#000', fontWeight: 900,
          }}
        >✓</div>
      )}
      <div style={{
        height: 82, background: _BG, borderBottom: `1px solid ${_BD}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '10px 14px', overflow: 'hidden',
      }}>
        {category === 'menu' && <FwMenuPreview id={item.id} />}
        {category === 'notify' && <FwNotifyPreview id={item.id} />}
        {category === 'dialog' && <FwDialogPreview id={item.id} />}
        {category === 'input' && <FwInputPreview id={item.id} />}
        {category === 'surface' && <FwSurfacePreview id={item.id} />}
        {category === 'loading' && <FwLoadingPreview id={item.id} />}
        {category === 'animation' && <FwAnimPreview id={item.id} />}
      </div>
      <div style={{ padding: '10px 12px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
          {item.icon && <span style={{ fontSize: 13, opacity: 0.8 }}>{item.icon}</span>}
          <span style={{ fontFamily: _FM, fontSize: 11, fontWeight: 600, color: isActive ? accentColor : _TX, letterSpacing: 0.3 }}>{item.label}</span>
        </div>
        <div style={{ fontFamily: _FM, fontSize: 11, color: _MT, lineHeight: 1.5 }}>{item.desc}</div>
      </div>
    </Clickable>
  )
}
function FwCategorySection({ cat, draft, onSelect, isUnsaved }) {
  const activeId=draft[cat.configKey], cols=cat.id==='animation'?150:175
  return <section style={{ marginBottom:48 }}>
    <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
      <div style={{ width:38, height:38, borderRadius:8, background:`${cat.color}18`, border:`1px solid ${cat.color}44`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>{cat.icon}</div>
      <div style={{ flex:1, minWidth:0 }}><div style={{ fontFamily:_FD, fontSize:17, fontWeight:700, color:_TX, display:'flex', alignItems:'center', gap:8 }}>{cat.label}{cat.scope&&<span style={{ fontFamily:_FM, fontSize: 11, letterSpacing:1, color:_MT, border:`1px solid ${_BD}`, borderRadius:99, padding:'2px 8px' }}>({cat.scope})</span>}{isUnsaved&&<span style={_tag(cat.color)}>UNSAVED</span>}</div><div style={{ fontFamily:_FM, fontSize: 11, color:_MT, marginTop:1 }}>{cat.styles.length} variants — active: <span style={{ color:cat.color }}>{activeId}</span></div></div>
    </div>
    <div style={{ display:'grid', gridTemplateColumns:`repeat(auto-fill,minmax(${cols}px,1fr))`, gap:10 }}>
      {cat.styles.map(item=><FwStyleCard key={item.id} item={item} isActive={activeId===item.id} onSelect={id=>onSelect(cat.configKey,id)} accentColor={cat.color} category={cat.id}/>)}
    </div>
  </section>
}
function FwNavRail({ active, onNav, draft, siteConfig }) {
  return <div style={{ width:190, flexShrink:0 }}>
    <div style={{ fontFamily:_FM, fontSize: 11, letterSpacing:3, color:_MT, paddingBottom:8, marginBottom:4, borderBottom:`1px solid ${_BD}` }}>CATEGORIES</div>
    {FRAMEWORK_CATEGORIES.map(cat=>{
      const isActive=active===cat.id, changed=draft[cat.configKey]!==(siteConfig?.[cat.configKey]||DEFAULT_FRAMEWORK[cat.configKey])
      return <button key={cat.id} onClick={()=>onNav(cat.id)} className="tl-nav-item" data-active={isActive?'true':undefined} style={{ display:'flex', alignItems:'center', gap:8, width:'100%', padding:'10px', borderRadius:6, border:'none', background:isActive?`${cat.color}18`:'transparent', color:isActive?cat.color:_MT, cursor:'pointer', fontFamily:_FM, fontSize: 11, letterSpacing:0.5, transition:'all 0.12s', position:'relative', marginBottom:2, boxShadow:isActive?`inset 0 0 0 1px ${cat.color}40`:'none' }}>
        {isActive&&<span style={{ position:'absolute', left:0, top:'15%', bottom:'15%', width:2, borderRadius:'0 2px 2px 0', background:cat.color }}/>}
        <span style={{ fontSize:15, width:20, textAlign:'center' }}>{cat.icon}</span>
        <span style={{ flex:1, textAlign:'left' }}>{cat.label}</span>
        {changed&&<span style={{ width:6, height:6, borderRadius:'50%', background:cat.color, boxShadow:`0 0 5px ${cat.color}` }} aria-label="Unsaved changes" />}
      </button>
    })}
    <div style={{ marginTop:20, padding:'14px 12px', background:_BG3, border:`1px solid ${_BD}`, borderRadius:8 }}>
      <div style={{ fontFamily:_FM, fontSize: 11, letterSpacing:2, color:_MT, marginBottom:10 }}>CURRENT</div>
      {FRAMEWORK_CATEGORIES.map(cat=><div key={cat.id} style={{ display:'flex', justifyContent:'space-between', fontFamily:_FM, fontSize: 11, marginBottom:6, gap:6 }}><span style={{ color:_MT }}>{cat.label.split(' ')[0]}</span><span style={{ color:cat.color, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{draft[cat.configKey]}</span></div>)}
    </div>
  </div>
}


function ColorRow({ label, value, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
      <input type="color" value={value.startsWith('rgba') ? '#888888' : value}
        onChange={e => onChange(e.target.value)}
        style={{ width: 28, height: 28, padding: 2, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', borderRadius: 4 }} />
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', flex: '0 0 70px' }}>{label}</span>
      <Input value={value} onChange={(v) => onChange(v)}
        style={{ flex: 1, background: 'var(--bg3)', border: '1px solid var(--border)', outline: 'none', padding: '4px 8px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text)', borderRadius: 4 }} />
    </div>
  )
}

// ── Theme-styled font picker (replaces the native <select>) ───────────────────
// Custom dropdown matching the admin theme: groups uploaded + Google options,
// highlights the active choice, closes on outside click / Escape.
function FontPicker({ value, options, groups, placeholder = '↺ Theme default', onChange, dir = 'down', bare = false }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDoc = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onKey = e => { if (e.key === 'Escape' || e.keyCode === 27) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])

  const q = query.trim().toLowerCase()
  const list = options.filter(o => groups.includes(o.group) && (!q || String(o.label || '').toLowerCase().includes(q)))
  const sections = ['Uploaded', 'Display', 'Mono']
    .filter(g => groups.includes(g))
    .map(g => ({ g, items: list.filter(o => o.group === g) }))
    .filter(s => s.items.length > 0)

  return (
    <div ref={ref} style={{ position: 'relative', marginBottom: bare ? 0 : 14 }}>
      <button type="button" onClick={() => setOpen(o => !o)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: 'var(--bg3)', border: `1px solid ${open ? 'var(--green)' : 'var(--border)'}`, color: 'var(--text)', padding: '8px 10px', borderRadius: 6, fontFamily: 'var(--font-mono)', fontSize: 11, outline: 'none', cursor: 'pointer', transition: 'border-color 0.15s' }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: value ? `'${value}', sans-serif` : 'var(--font-mono)', fontSize: value ? 13 : 10, color: value ? 'var(--text)' : 'var(--muted)' }}>
          {value || placeholder}
        </span>
        <span style={{ color: open ? 'var(--green)' : 'var(--muted)', flexShrink: 0, fontSize: 11 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', zIndex: 60, left: 0, right: 0, ...(dir === 'up' ? { bottom: 'calc(100% + 6px)' } : { top: 'calc(100% + 6px)' }), background: 'var(--bg2)', border: '1px solid color-mix(in srgb, var(--green) 40%, transparent)', borderRadius: 8, boxShadow: '0 18px 40px rgba(0,0,0,0.5), 0 0 18px color-mix(in srgb, var(--green) 12%, transparent)', overflow: 'hidden' }}>
          <Input value={query} onChange={(v) => setQuery(v)} placeholder="🔍 Search fonts…"
            style={{ width: '100%', background: 'var(--bg)', border: 'none', borderBottom: '1px solid var(--border)', color: 'var(--text)', padding: '9px 12px', fontFamily: 'var(--font-mono)', fontSize: 11, outline: 'none' }} />
          <div style={{ maxHeight: 250, overflowY: 'auto' }}>
            {sections.length === 0 && (
              <div style={{ padding: '14px 12px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>No fonts match &quot;{query}&quot;.</div>
            )}
            {sections.map(({ g, items }) => (
              <div key={g}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, color: g === 'Uploaded' ? 'var(--purple)' : 'var(--muted)', padding: '8px 12px 4px', background: 'var(--bg)' }}>
                  {g === 'Uploaded' ? '⬆ UPLOADED' : `${g.toUpperCase()} · GOOGLE`}
                </div>
                {items.map(o => {
                  const active = value === o.id
                  return (
                    <button key={`${g}-${o.id}`} type="button"
                      onClick={() => { onChange(o.id); setOpen(false); setQuery('') }}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '7px 12px', background: active ? 'color-mix(in srgb, var(--green) 10%, transparent)' : 'transparent', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.03)', color: 'var(--text)', cursor: 'pointer' }}>
                      <span style={{ fontFamily: `'${o.label}', sans-serif`, fontSize: 14, width: 36, flexShrink: 0, color: active ? 'var(--green)' : 'var(--text)' }}>Aa</span>
                      <span style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.label}</span>
                      {active && <span style={{ color: 'var(--green)', fontSize: 11, flexShrink: 0 }}>✓</span>}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Interactive live-preview popup ────────────────────────────────────────────
// Shows a mini site (navbar, heading, body, buttons, card, code block) rendered
// with the draft token values. Hover an element to see which token it uses,
// click it to open the inspector bar at the bottom and change colors/fonts right
// from the preview. Every edit flows back into the customize draft (and the
// live left-side preview) via the callbacks.
function ColorEdit({ token, label, value, defaultValue, onColor }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <input type="color" value={String(value || '').startsWith('rgba') ? '#888888' : (value || '#000000')}
        onChange={e => onColor(token, e.target.value)}
        style={{ width: 26, height: 26, padding: 1, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', borderRadius: 4 }} />
      <div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1, color: 'var(--muted)' }}>{label.toUpperCase()}</div>
        <Input value={value || ''} onChange={(v) => onColor(token, v)}
          style={{ width: 128, background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '4px 8px', fontFamily: 'var(--font-mono)', fontSize: 11, outline: 'none', borderRadius: 4 }} />
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', maxWidth: 200 }}>
        {NEON_SWATCHES.map(s => (
          <button key={s} onClick={() => onColor(token, s)} title={s}
            style={{ width: 16, height: 16, borderRadius: 3, background: s, border: '1px solid var(--border)', cursor: 'pointer', padding: 0 }} />
        ))}
        <button onClick={() => onColor(token, defaultValue || '')} title="Reset to theme default"
          style={{ width: 16, height: 16, borderRadius: 3, border: '1px dashed var(--border)', cursor: 'pointer', padding: 0, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', background: 'transparent', lineHeight: 1 }}>↺</button>
      </div>
    </div>
  )
}

function PreviewTarget({ token, label, edit, hover, onHover, onEdit, children, style }) {
  const active = edit === token
  return (
    <span
      role="button"
      tabIndex={0}
      style={{ position: 'relative', display: 'inline-flex', cursor: 'pointer', borderRadius: 4, outline: 'none', boxShadow: active ? '0 0 0 2px color-mix(in srgb, var(--green) 60%, transparent)' : 'none', ...style }}
      onMouseEnter={() => onHover(token)}
      onMouseLeave={() => onHover(null)}
      onClick={e => { e.stopPropagation(); onEdit(token) }}
      onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); onEdit(token) } }}
    >
      {children}
      {(hover === token || active) && (
        <span style={{ position: 'absolute', top: -8, right: 0, transform: 'translateY(-100%)', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1, padding: '3px 8px', background: 'var(--bg)', border: '1px solid var(--green)', borderRadius: 4, color: 'var(--green)', pointerEvents: 'none', zIndex: 80, whiteSpace: 'nowrap' }}>
          {label} <span style={{ opacity: 0.7 }}>{active ? '· editing' : '✎'}</span>
        </span>
      )}
    </span>
  )
}

// ── WCAG contrast helpers (for the live preview inspector) ───────────────────
function parseColor(hex) {
  const h = String(hex || '').trim().replace(/^#/, '')
  if (h.length === 3) return { r: parseInt(h[0] + h[0], 16), g: parseInt(h[1] + h[1], 16), b: parseInt(h[2] + h[2], 16) }
  if (h.length === 6) return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) }
  return null
}
function relLum(c) {
  const f = v => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4) }
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b)
}
function contrastRatio(a, b) {
  const ca = parseColor(a), cb = parseColor(b)
  if (!ca || !cb) return null
  const la = relLum(ca), lb = relLum(cb)
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}
function mixHex(hex, target, amount) {
  const c = parseColor(hex); if (!c) return target
  const t = parseColor(target); if (!t) return hex
  const m = (a, b) => Math.round(a + (b - a) * amount)
  return `#${[m(c.r, t.r), m(c.g, t.g), m(c.b, t.b)].map(v => v.toString(16).padStart(2, '0')).join('')}`
}
function ContrastBadge({ fg, bg }) {
  const ratio = contrastRatio(fg, bg)
  if (!ratio) return <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>— no contrast data</span>
  const pass = ratio >= 4.5
  const large = ratio >= 3
  const color = pass ? 'var(--green)' : large ? 'var(--orange)' : 'var(--red)'
  return (
    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, padding: '3px 8px', borderRadius: 5, border: `1px solid color-mix(in srgb, ${color} 55%, transparent)`, color, background: 'color-mix(in srgb, var(--bg3) 60%, transparent)' }}>
      contrast {ratio.toFixed(2)}:1 · {pass ? 'AA ✓' : large ? 'AA (large) ~' : 'FAIL ✗'}
    </span>
  )
}

// Clipboard write with textarea/execCommand fallback (mirrors VpnPanel
// copyText). Resolves true on success, false when the user must copy manually.
async function copyWithFallback(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {}
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    ta.remove()
    return true
  } catch {
    return false
  }
}

// Shared preset validation — the paste-JSON import and the .json file upload
// both funnel through here so files and pasted text accept the same shapes.
// Accepts preset exports, plain customizations, and full theme-design packages.
function parsePresetJson(text) {
  // Try the full theme-design package parser first (handles $schema / components / framework)
  try {
    const pkg = parseThemeDesignPackage(text)
    if (pkg.kind === 'design' && pkg.themeCustom) {
      return { name: String(pkg.name).slice(0, 60), draft: pkg.themeCustom, design: pkg }
    }
    if (pkg.themeCustom) {
      return { name: String(pkg.name).slice(0, 60), draft: pkg.themeCustom, design: pkg }
    }
    if (pkg.kind === 'preset' || pkg.kind === 'custom') {
      return { name: String(pkg.name).slice(0, 60), draft: pkg.themeCustom || {}, design: pkg }
    }
  } catch { /* fall through to legacy preset shape */ }
  const parsed = JSON.parse(String(text || '').trim())
  const draft = parsed?.draft || parsed
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) throw new Error('bad shape')
  const name = parsed?.name || 'Imported look'
  return { name: String(name).slice(0, 60), draft }
}

// Background patterns mirroring core/themeCustom.js BG_PATTERN_CSS (var(--bg) is the custom bg color in preview).
function CustomizePreviewModal({ open, onClose, draft, options, colorDefaults, onColor, onFont, onGlow, onRadius, onBorderWidth }) {
  const [edit, setEdit] = useState(null)
  const [hover, setHover] = useState(null)
  const [frame, setFrame] = useState('desktop')
  const [scheme, setScheme] = useState('dark')

  const colors = draft?.colors || {}
  const c = k => colors[k] || 'transparent'
  const glowVal = typeof draft?.glow === 'number' ? draft.glow : 0.5
  const glowPct = Math.max(0, Math.min(100, Math.round(glowVal * 60)))
  const radiusVal = typeof draft?.radius === 'number' ? draft.radius : 10
  const borderWVal = typeof draft?.borderWidth === 'number' ? draft.borderWidth : 1
  const bgStyle = (() => {
    if (draft?.bgGradientFrom || draft?.bgGradientTo) {
      const angle = typeof draft?.bgGradientAngle === 'number' ? draft.bgGradientAngle : 180
      return { backgroundImage: `linear-gradient(${angle}deg, ${draft.bgGradientFrom || '#0a0a12'}, ${draft.bgGradientTo || '#111827'})`, backgroundSize: '100% 100%' }
    }
    const pat = draft?.bgPattern
    if (pat && pat !== 'none' && PREVIEW_BG_PATTERNS[pat]) {
      return { backgroundImage: PREVIEW_BG_PATTERNS[pat], backgroundSize: PREVIEW_BG_SIZES[pat] }
    }
    return null
  })()
  const schemeVars = scheme === 'light'
    ? {
        '--bg':     mixHex(c('bg') || '#0b0e14', '#ffffff', 0.86),
        '--bg2':    mixHex(c('bg2') || '#11151d', '#ffffff', 0.9),
        '--bg3':    mixHex(c('bg3') || '#161b26', '#ffffff', 0.94),
        '--text':   mixHex(c('text') || '#e8ecf4', '#10142a', 0.88),
        '--text2':  mixHex(c('text2') || '#9aa3b5', '#1c2333', 0.8),
        '--muted':  mixHex(c('muted') || '#5b6478', '#39415a', 0.5),
        '--border': mixHex(c('border') || '#2a3140', '#c4cad6', 0.65),
      }
    : null
  const fD = draft?.fontDisplay ? `'${draft.fontDisplay}', 'Outfit', sans-serif` : 'var(--font-display)'
  const fM = draft?.fontMono ? `'${draft.fontMono}', 'JetBrains Mono', monospace` : 'var(--font-mono)'
  const fC = draft?.fontCode ? `'${draft.fontCode}', monospace` : 'var(--font-code)'
  const vars = {
    '--bg': c('bg'), '--bg2': c('bg2'), '--bg3': c('bg3'),
    '--green': c('green'), '--cyan': c('cyan'), '--orange': c('orange'),
    '--red': c('red'), '--purple': c('purple'), '--text': c('text'),
    '--text2': c('text2'), '--muted': c('muted'), '--link': c('link'), '--border': c('border'),
    '--glow': `0 0 20px color-mix(in srgb, var(--green) ${glowPct}%, transparent)`,
    '--glow-cyan': `0 0 20px color-mix(in srgb, var(--cyan) ${glowPct}%, transparent)`,
    '--radius': `${radiusVal}px`,
    '--border-w': `${borderWVal}px`,
  }

  const fontGroups = { fontDisplay: ['Display', 'Uploaded'], fontMono: ['Mono', 'Uploaded'], fontCode: ['Mono', 'Uploaded'] }
  const targetColor = edit && !fontGroups[edit] && edit !== 'surface' ? edit : null

  return (
    <Modal open={open} onClose={onClose} title="LIVE PREVIEW  change colors & fonts right here" width={760}>
      <div style={{ padding: 18, ...vars, ...schemeVars }}>
        {/* Toolbar — device frame + color scheme */}
        <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            {['desktop', 'mobile'].map(f => (
              <button key={f} onClick={() => setFrame(f)}
                style={{ padding: '6px 14px', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: 1, cursor: 'pointer', background: frame === f ? 'var(--green)' : 'transparent', color: frame === f ? '#000' : 'var(--muted)', border: 'none' }}>
                {f === 'desktop' ? '🖥 DESKTOP' : '📱 MOBILE'}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            {['dark', 'light'].map(s => (
              <button key={s} onClick={() => setScheme(s)}
                style={{ padding: '6px 14px', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: 1, cursor: 'pointer', background: scheme === s ? 'var(--purple)' : 'transparent', color: scheme === s ? '#000' : 'var(--muted)', border: 'none' }}>
                {s === 'dark' ? '🌙 DARK' : '☀ LIGHT'}
              </button>
            ))}
          </div>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1, color: 'var(--muted)' }}>
            <span style={{ color: 'var(--green)' }}>✎</span> Hover any element → click to edit below. Live-updates instantly.
            {scheme === 'light' && ' Light simulation blends the neutral tokens only — accents stay as configured.'}
          </span>
        </div>

        {/* Device frame */}
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <div style={{
            width: frame === 'mobile' ? 320 : '100%',
            border: `${borderWVal}px solid var(--border)`,
            borderRadius: frame === 'mobile' ? 24 : 10,
            overflow: 'hidden',
            padding: frame === 'mobile' ? 8 : 0,
            background: 'var(--bg)',
            ...(bgStyle || {}),
          }}>
            {frame === 'mobile' && (
              <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: 8 }}>
                <div style={{ width: 46, height: 5, borderRadius: 3, background: 'var(--border)' }} />
              </div>
            )}
            <div style={{ padding: frame === 'mobile' ? '4px 10px 14px' : 22 }}>
              {/* Navbar */}
              <PreviewTarget token="bg2" label="Navbar · bg2" edit={edit} hover={hover} onHover={setHover} onEdit={setEdit}
                style={{ width: '100%', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 14px', background: 'var(--bg2)', border: 'var(--border-w) solid var(--border)', borderRadius: 'var(--radius)', width: '100%' }}>
                  <PreviewTarget token="fontDisplay" label="Logo · display font" edit={edit} hover={hover} onHover={setHover} onEdit={setEdit}>
                    <span style={{ fontFamily: fD, fontWeight: 700, fontSize: 15, color: 'var(--text)', letterSpacing: 1 }}>◈ NEON<span style={{ color: 'var(--green)' }}>CITY</span></span>
                  </PreviewTarget>
                  {frame !== 'mobile' && (
                    <div style={{ display: 'flex', gap: 10 }}>
                      {['HOME', 'FORUM', 'STORE'].map(x => (
                        <PreviewTarget key={x} token="fontMono" label="Nav links · mono font" edit={edit} hover={hover} onHover={setHover} onEdit={setEdit}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1, color: x === 'HOME' ? 'var(--green)' : 'var(--muted)' }}>{x}</span>
                        </PreviewTarget>
                      ))}
                    </div>
                  )}
                </div>
              </PreviewTarget>

              {/* Heading */}
              <PreviewTarget token="fontDisplay" label="Heading · display font" edit={edit} hover={hover} onHover={setHover} onEdit={setEdit} style={{ display: 'block', marginBottom: 6 }}>
                <div style={{ fontFamily: fD, fontSize: frame === 'mobile' ? 20 : 26, fontWeight: 700, color: 'var(--text)' }}>Headline — display font</div>
              </PreviewTarget>

              {/* Subtitle */}
              <PreviewTarget token="fontMono" label="Subtitle · mono font" edit={edit} hover={hover} onHover={setHover} onEdit={setEdit} style={{ display: 'block', marginBottom: 12 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, color: 'var(--cyan)' }}>{'// SUBTITLE — mono font'}</div>
              </PreviewTarget>

              {/* Body */}
              <PreviewTarget token="fontMono" label="Body · mono font" edit={edit} hover={hover} onHover={setHover} onEdit={setEdit} style={{ display: 'block', marginBottom: 16 }}>
                <p style={{ fontFamily: fM, fontSize: 13, lineHeight: 1.7, color: 'var(--text2)', margin: 0 }}>
                  Body copy uses <PreviewTarget token="text" label="text" edit={edit} hover={hover} onHover={setHover} onEdit={setEdit}><span style={{ color: 'var(--text)' }}>text</span></PreviewTarget>, secondary uses{' '}
                  <PreviewTarget token="text2" label="text2" edit={edit} hover={hover} onHover={setHover} onEdit={setEdit}><span style={{ color: 'var(--text2)' }}>text2</span></PreviewTarget>, hints are{' '}
                  <PreviewTarget token="muted" label="muted" edit={edit} hover={hover} onHover={setHover} onEdit={setEdit}><span style={{ color: 'var(--muted)' }}>muted</span></PreviewTarget> and this is a{' '}
                  <PreviewTarget token="link" label="link" edit={edit} hover={hover} onHover={setHover} onEdit={setEdit}><a href="#" onClick={e => e.preventDefault()} style={{ color: 'var(--link)' }}>link</a></PreviewTarget>.
                </p>
              </PreviewTarget>

              {/* Buttons */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 18 }}>
                <PreviewTarget token="green" label="Primary · green" edit={edit} hover={hover} onHover={setHover} onEdit={setEdit}>
                  <span style={{ padding: '8px 16px', background: 'var(--green)', color: '#000', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: 2, borderRadius: 'var(--radius)', boxShadow: 'var(--glow)' }}>PRIMARY</span>
                </PreviewTarget>
                <PreviewTarget token="cyan" label="Secondary · cyan" edit={edit} hover={hover} onHover={setHover} onEdit={setEdit}>
                  <span style={{ padding: '8px 16px', background: 'var(--cyan)', color: '#000', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: 2, borderRadius: 'var(--radius)', boxShadow: 'var(--glow-cyan)' }}>SECONDARY</span>
                </PreviewTarget>
                <PreviewTarget token="red" label="Danger · red" edit={edit} hover={hover} onHover={setHover} onEdit={setEdit}>
                  <span style={{ padding: '8px 16px', background: 'transparent', border: 'var(--border-w) solid var(--red)', color: 'var(--red)', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, borderRadius: 'var(--radius)' }}>DANGER</span>
                </PreviewTarget>
              </div>

              {/* Card */}
              <PreviewTarget token="surface" label="Card · bg2 / bg3 / border / glow" edit={edit} hover={hover} onHover={setHover} onEdit={setEdit}
                style={{ width: '100%', marginBottom: 18 }}>
                <div style={{ background: 'var(--bg2)', border: 'var(--border-w) solid var(--border)', borderRadius: 'var(--radius)', padding: 16, boxShadow: 'var(--glow)', width: '100%' }}>
                  <PreviewTarget token="bg3" label="Elevated · bg3" edit={edit} hover={hover} onHover={setHover} onEdit={setEdit} style={{ display: 'block', width: '100%', marginBottom: 10 }}>
                    <div style={{ background: 'var(--bg3)', border: 'var(--border-w) solid var(--border)', borderRadius: 'var(--radius)', padding: 12 }}>
                      <PreviewTarget token="fontDisplay" label="Card title · display font" edit={edit} hover={hover} onHover={setHover} onEdit={setEdit} style={{ display: 'block', marginBottom: 3 }}>
                        <div style={{ fontFamily: fD, fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Card surface</div>
                      </PreviewTarget>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>bg2 = surface · bg3 = elevated · border = border · glow = glow</div>
                    </div>
                  </PreviewTarget>
                  <PreviewTarget token="fontMono" label="Code block · mono font" edit={edit} hover={hover} onHover={setHover} onEdit={setEdit} style={{ display: 'block', width: '100%' }}>
                    <div style={{ fontFamily: fM, fontSize: 11, lineHeight: 1.7, color: 'var(--text)', background: 'var(--bg)', border: 'var(--border-w) solid var(--border)', borderRadius: 'var(--radius)', padding: 12 }}>
                      <span style={{ color: 'var(--muted)' }}>$</span> deploy --prod&nbsp;&nbsp;<span style={{ color: 'var(--muted)' }}># mono font</span>
                      <br />const <span style={{ color: 'var(--green)' }}>glow</span> = <span style={{ color: 'var(--orange)' }}>true</span><span style={{ color: 'var(--muted)' }}>;</span>
                    </div>
                  </PreviewTarget>
                </div>
              </PreviewTarget>

              {/* Inline code + accents */}
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>
                Inline code:{' '}
                <PreviewTarget token="fontCode" label="Inline code · code font" edit={edit} hover={hover} onHover={setHover} onEdit={setEdit}>
                  <span style={{ fontFamily: fC, color: 'var(--purple)', background: 'var(--bg3)', border: 'var(--border-w) solid var(--border)', padding: '2px 6px', borderRadius: 'var(--radius)' }}>font-code</span>
                </PreviewTarget>{' '}· Accent:{' '}
                <PreviewTarget token="purple" label="Accent · purple" edit={edit} hover={hover} onHover={setHover} onEdit={setEdit}><span style={{ color: 'var(--purple)' }}>purple</span></PreviewTarget>{' '}· Warning:{' '}
                <PreviewTarget token="orange" label="Warning · orange" edit={edit} hover={hover} onHover={setHover} onEdit={setEdit}><span style={{ color: 'var(--orange)' }}>orange</span></PreviewTarget>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Inspector bar — docked to the bottom of the popup */}
      {edit && (
        <div style={{ position: 'sticky', bottom: 0, borderTop: '1px solid var(--border)', background: 'color-mix(in srgb, var(--bg) 94%, transparent)', backdropFilter: 'blur(8px)', padding: '14px 22px', display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          {edit === 'surface' ? (
            <div style={{ flex: 1, display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center' }}>
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1, color: 'var(--green)', marginBottom: 8 }}>CARD SURFACE</div>
                <ColorEdit token="bg2" label="Surface" value={colors.bg2 || ''} defaultValue={colorDefaults?.bg2} onColor={onColor} />
                <div style={{ height: 8 }} />
                <ColorEdit token="bg3" label="Elevated" value={colors.bg3 || ''} defaultValue={colorDefaults?.bg3} onColor={onColor} />
              </div>
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1, color: 'var(--muted)', marginBottom: 8 }}>BORDER & GLOW</div>
                <ColorEdit token="border" label="Border" value={colors.border || ''} defaultValue={colorDefaults?.border} onColor={onColor} />
                <div style={{ height: 8 }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1, color: 'var(--muted)' }}>GLOW</span>
                  <Slider min={0} max={1} step={0.05} value={glowVal}
                    onChange={(v) => onGlow(v)}
                    style={{ width: 110, accentColor: 'var(--green)', cursor: 'pointer' }} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--green)' }}>{glowPct}%</span>
                </div>
                <div style={{ height: 8 }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1, color: 'var(--muted)' }}>RADIUS</span>
                  <Slider min={0} max={28} step={1} value={radiusVal}
                    onChange={(v) => onRadius && onRadius(v)}
                    style={{ width: 90, accentColor: 'var(--purple)', cursor: 'pointer' }} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--purple)' }}>{radiusVal}px</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1, color: 'var(--muted)' }}>BORDER</span>
                  <Slider min={0} max={4} step={1} value={borderWVal}
                    onChange={(v) => onBorderWidth && onBorderWidth(v)}
                    style={{ width: 90, accentColor: 'var(--purple)', cursor: 'pointer' }} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--purple)' }}>{borderWVal}px</span>
                </div>
              </div>
            </div>
          ) : targetColor ? (
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1, color: 'var(--green)', marginBottom: 8 }}>{COLOR_LABELS[targetColor] || targetColor}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                <ColorEdit token={targetColor} label={COLOR_LABELS[targetColor] || targetColor} value={colors[targetColor] || ''} defaultValue={colorDefaults?.[targetColor]} onColor={onColor} />
                <ContrastBadge fg={colors[targetColor] || colorDefaults?.[targetColor]} bg={colors.bg || colorDefaults?.bg} />
              </div>
            </div>
          ) : fontGroups[edit] ? (
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1, color: 'var(--green)', marginBottom: 8 }}>{(edit === 'fontDisplay' ? 'Display font' : edit === 'fontMono' ? 'Mono font' : 'Code font')}</div>
              <FontPicker value={draft?.[edit] || ''} options={options} groups={fontGroups[edit]} dir="up" bare
                onChange={v => onFont(edit, v)} />
            </div>
          ) : null}
          <button onClick={() => setEdit(null)}
            style={{ padding: '8px 14px', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: 1, cursor: 'pointer', background: 'var(--green)', color: '#000', border: 'none', borderRadius: 6 }}>
            ✓ DONE
          </button>
        </div>
      )}
    </Modal>
  )
}

// ── Theme customization helpers ──────────────────────────────────────────────
// Per-theme default color values (used to prefill the CUSTOMIZE pickers when
// the theme hasn't been customized yet).
function themeColorDefaults(themeId) {
  const def = THEME_DEFS.find(t => t.id === themeId) || THEME_DEFS[0]
  const byKey = Object.fromEntries(CUSTOM_COLOR_TOKENS.map(t => [t.key, t.def]))
  if (def) {
    byKey.bg     = def.bg     || byKey.bg
    byKey.bg2    = def.bg2    || byKey.bg2
    byKey.bg3    = def.bg3    || byKey.bg3
    byKey.green  = def.primary   || byKey.green
    byKey.cyan   = def.secondary || byKey.cyan
    byKey.orange = def.orange || byKey.orange
    byKey.text   = def.text   || byKey.text
    byKey.muted  = def.muted  || byKey.muted
    byKey.border = def.border || byKey.border
  }
  return byKey
}

// Style-template + preset helpers. Referenced by the preset/template flows
// below; defined here (module scope) after an extraction left them missing,
// which crashed template actions with `ReferenceError`.
const makeId = (prefix = 'id') => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
const nowISO = () => new Date().toISOString()
const applyTemplateToDraft = (draft, tpl) => {
  const d = (tpl && tpl.draft) || {}
  const base = draft && typeof draft === 'object' ? draft : {}
  return {
    ...base,
    ...d,
    colors: { ...((base.colors) || {}), ...((d.colors) || {}) },
  }
}

function seedCustomDraft(themeId, saved) {
  const defaults = themeColorDefaults(themeId)
  return {
    fontDisplay: saved?.fontDisplay || '',
    fontMono:    saved?.fontMono    || '',
    fontCode:    saved?.fontCode    || '',
    glow:        typeof saved?.glow === 'number' ? saved.glow : 0.5,
    radius:      typeof saved?.radius === 'number' ? saved.radius : 10,
    borderWidth: typeof saved?.borderWidth === 'number' ? saved.borderWidth : 1,
    bgPattern:   saved?.bgPattern || 'none',
    bgGradientFrom:  saved?.bgGradientFrom || '',
    bgGradientTo:    saved?.bgGradientTo   || '',
    bgGradientAngle: typeof saved?.bgGradientAngle === 'number' ? saved.bgGradientAngle : 180,
    colors:      { ...defaults, ...(saved?.colors || {}) },
    css:         saved?.css || '',
  }
}

// Undo/redo history reducer for the CUSTOMIZE draft. State = { draft, undo, redo }.
function customHistReducer(state, action) {
  switch (action.type) {
    case 'apply': {
      const undo = [...state.undo, state.draft]
      if (undo.length > 50) undo.shift()
      return { draft: action.next, undo, redo: [] }
    }
    case 'undo': {
      if (!state.undo.length) return state
      return { draft: state.undo[state.undo.length - 1], undo: state.undo.slice(0, -1), redo: [...state.redo, state.draft] }
    }
    case 'redo': {
      if (!state.redo.length) return state
      return { draft: state.redo[state.redo.length - 1], undo: [...state.undo, state.draft], redo: state.redo.slice(0, -1) }
    }
    case 'reset': {
      return { draft: action.draft, undo: [], redo: [] }
    }
    default:
      return state
  }
}

function TabBtn({ id, label, active, onSelect }) {
  return (
    <button
      onClick={onSelect}
      role="tab"
      aria-selected={active}
      className="tl-tab-btn"
      data-active={active ? 'true' : undefined}
      style={{
        fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, padding: '9px 16px',
        background: active ? 'var(--green)' : 'transparent',
        color: active ? '#000' : 'var(--muted)',
        border: 'none', cursor: 'pointer', borderRadius: 8,
        transition: 'all 0.15s', fontWeight: active ? 700 : 400,
      }}
    >{label}</button>
  )
}

export { isLightSurface, LIGHT_PACKAGE_THEMES, ThemePackageCard, FwStyleCard, FwCategorySection, FwNavRail, ColorRow, FontPicker, ColorEdit, PreviewTarget, parseColor, relLum, contrastRatio, mixHex, ContrastBadge, copyWithFallback, parsePresetJson, CustomizePreviewModal, themeColorDefaults, makeId, nowISO, applyTemplateToDraft, seedCustomDraft, customHistReducer, TabBtn }
