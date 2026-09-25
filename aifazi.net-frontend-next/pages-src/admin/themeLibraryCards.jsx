'use client'
import React from 'react'
import {
  FRAMEWORK_CATEGORIES, DEFAULT_FRAMEWORK,
} from '../../core/framework-styles.js'
import {
  HeaderPreviewSVG, FooterPreviewSVG,
} from './SiteSettings'
import {
  FwMenuPreview, FwNotifyPreview, FwDialogPreview,
  FwInputPreview, FwSurfacePreview, FwLoadingPreview, FwAnimPreview,
  _G, _CY, _BG, _BG2, _BG3, _BD, _TX, _MT, _FM, _FD, _tag,
} from './themeLibraryPreviews'

// Luminance-based light detection (keeps package previews readable on any theme)
export function isLightSurface(hex) {
  if (!hex) return false
  const m = String(hex).match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
  if (!m) return false
  const r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16)
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) > 140
}

export const LIGHT_PACKAGE_THEMES = new Set([
  'paper', 'macos', 'brutalist', 'pastel', 'win95', 'neumorph', 'light', 'cyber-light',
])

export function ThemePackageCard({ pkg, isActive, isCustomized, isSaving, onApply }) {
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

export function FwStyleCard({ item, isActive, onSelect, accentColor, category }) {
  return (
    <div
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
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect(item.id)
        }
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
    </div>
  )
}

export function FwCategorySection({ cat, draft, onSelect, isUnsaved }) {
  const activeId = draft[cat.configKey]
  const cols = cat.id === 'animation' ? 150 : 175
  return (
    <section style={{ marginBottom: 48 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div style={{ width: 38, height: 38, borderRadius: 8, background: `${cat.color}18`, border: `1px solid ${cat.color}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>{cat.icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: _FD, fontSize: 17, fontWeight: 700, color: _TX, display: 'flex', alignItems: 'center', gap: 8 }}>
            {cat.label}
            {cat.scope && <span style={{ fontFamily: _FM, fontSize: 11, letterSpacing: 1, color: _MT, border: `1px solid ${_BD}`, borderRadius: 99, padding: '2px 8px' }}>({cat.scope})</span>}
            {isUnsaved && <span style={_tag(cat.color)}>UNSAVED</span>}
          </div>
          <div style={{ fontFamily: _FM, fontSize: 11, color: _MT, marginTop: 1 }}>
            {cat.styles.length} variants — active: <span style={{ color: cat.color }}>{activeId}</span>
          </div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill,minmax(${cols}px,1fr))`, gap: 10 }}>
        {cat.styles.map(item => (
          <FwStyleCard key={item.id} item={item} isActive={activeId === item.id} onSelect={id => onSelect(cat.configKey, id)} accentColor={cat.color} category={cat.id} />
        ))}
      </div>
    </section>
  )
}

export function FwNavRail({ active, onNav, draft, siteConfig }) {
  return (
    <div style={{ width: 190, flexShrink: 0 }}>
      <div style={{ fontFamily: _FM, fontSize: 11, letterSpacing: 3, color: _MT, paddingBottom: 8, marginBottom: 4, borderBottom: `1px solid ${_BD}` }}>CATEGORIES</div>
      {FRAMEWORK_CATEGORIES.map(cat => {
        const isActive = active === cat.id
        const changed = draft[cat.configKey] !== (siteConfig?.[cat.configKey] || DEFAULT_FRAMEWORK[cat.configKey])
        return (
          <button
            key={cat.id}
            onClick={() => onNav(cat.id)}
            className="tl-nav-item"
            data-active={isActive ? 'true' : undefined}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px',
              borderRadius: 6, border: 'none',
              background: isActive ? `${cat.color}18` : 'transparent',
              color: isActive ? cat.color : _MT,
              cursor: 'pointer', fontFamily: _FM, fontSize: 11, letterSpacing: 0.5,
              transition: 'all 0.12s', position: 'relative', marginBottom: 2,
              boxShadow: isActive ? `inset 0 0 0 1px ${cat.color}40` : 'none',
            }}
          >
            {isActive && <span style={{ position: 'absolute', left: 0, top: '15%', bottom: '15%', width: 2, borderRadius: '0 2px 2px 0', background: cat.color }} />}
            <span style={{ fontSize: 15, width: 20, textAlign: 'center' }}>{cat.icon}</span>
            <span style={{ flex: 1, textAlign: 'left' }}>{cat.label}</span>
            {changed && <span style={{ width: 6, height: 6, borderRadius: '50%', background: cat.color, boxShadow: `0 0 5px ${cat.color}` }} aria-label="Unsaved changes" />}
          </button>
        )
      })}
      <div style={{ marginTop: 20, padding: '14px 12px', background: _BG3, border: `1px solid ${_BD}`, borderRadius: 8 }}>
        <div style={{ fontFamily: _FM, fontSize: 11, letterSpacing: 2, color: _MT, marginBottom: 10 }}>CURRENT</div>
        {FRAMEWORK_CATEGORIES.map(cat => (
          <div key={cat.id} style={{ display: 'flex', justifyContent: 'space-between', fontFamily: _FM, fontSize: 11, marginBottom: 6, gap: 6 }}>
            <span style={{ color: _MT }}>{cat.label.split(' ')[0]}</span>
            <span style={{ color: cat.color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{draft[cat.configKey]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
