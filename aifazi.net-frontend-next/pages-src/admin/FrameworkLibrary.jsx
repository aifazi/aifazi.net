'use client'
/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  FRAMEWORK LIBRARY — Global UI Control Center                       ║
 * ║  Admin picks styles for every UI component. Applied site-wide.      ║
 * ║                                                                      ║
 * ║  Categories:                                                         ║
 * ║    • Menu Style         (6 variants)                                 ║
 * ║    • Notification Style (6 variants)                                 ║
 * ║    • Dialog Style       (6 variants)                                 ║
 * ║    • Loading Screen     (10 variants)                                ║
 * ║    • Animation Preset   (8 variants)                                 ║
 * ║                                                                      ║
 * ║  Every change is live-previewable before saving.                     ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */
import React, { useState, useEffect, useCallback, useRef } from 'react'
import api from '@/lib/api'
import { useTheme } from '@/app/providers'
import { useNotify } from '../../core/notify.jsx'
import { useDialog } from '../../core/dialog.jsx'
import { useIsMobile, PageHeader } from './shared'
import { clearSiteSettingsCache } from '@/lib/siteSettings'
import {
  MENU_STYLES, NOTIFY_STYLES, DIALOG_STYLES,
  LOADING_STYLES, ANIMATION_PRESETS,
  FRAMEWORK_CATEGORIES, DEFAULT_FRAMEWORK,
} from '../../core/framework-styles.js'

// ── Shorthand design tokens ───────────────────────────────────────────────────
const G   = 'var(--green)'
const CY  = 'var(--cyan)'
const BG  = 'var(--bg)'
const BG2 = 'var(--bg2)'
const BG3 = 'var(--bg3)'
const BD  = 'var(--border)'
const TX  = 'var(--text)'
const MT  = 'var(--muted)'
const FM  = 'var(--font-mono)'
const FD  = 'var(--font-display)'

const tag = (color) => ({
  fontFamily: FM, fontSize: 8, letterSpacing: 2,
  padding: '2px 8px', borderRadius: 3,
  border: `1px solid ${color}44`, color, background: `${color}12`,
})

// ─────────────────────────────────────────────────────────────────────────────
// LIVE PREVIEW COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

function MenuPreview({ id }) {
  const items = ['Dashboard', 'Settings', 'Logout']
  const conf = {
    cyber:    { bg: BG2, border: `1px solid rgba(0,255,136,0.3)`, color: G,  hover: 'rgba(0,255,136,0.06)', r: 4 },
    glass:    { bg: 'rgba(10,20,35,0.8)', border: '1px solid rgba(255,255,255,0.1)', color: TX, hover: 'rgba(255,255,255,0.07)', r: 10, bd: 'blur(16px)' },
    terminal: { bg: '#060a06', border: '1px solid #00ff8833', color: '#33ff33', hover: 'rgba(0,255,136,0.08)', r: 0 },
    minimal:  { bg: BG2, border: `1px solid ${BD}`, color: TX, hover: 'rgba(255,255,255,0.04)', r: 6 },
    neon:     { bg: BG, border: '1px solid rgba(0,212,255,0.6)', color: CY, hover: 'rgba(0,212,255,0.08)', r: 5, sh: '0 0 12px rgba(0,212,255,0.15)' },
    floating: { bg: BG2, border: 'none', color: TX, hover: 'rgba(255,255,255,0.06)', r: 14, sh: '0 12px 32px rgba(0,0,0,0.5)' },
  }
  const s = conf[id] || conf.cyber
  return (
    <div style={{ width: '100%', padding: '5px 3px', background: s.bg, border: s.border, borderRadius: s.r, backdropFilter: s.bd, boxShadow: s.sh, overflow: 'hidden' }}>
      {items.map((item, i) => (
        <div key={i} style={{ fontFamily: FM, fontSize: 9, color: s.color, padding: '5px 8px', borderRadius: Math.max(0, s.r - 2), background: i === 0 ? s.hover : 'transparent', display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ opacity: 0.5, fontSize: 8 }}>›</span>{item}
        </div>
      ))}
    </div>
  )
}

function NotifyPreview({ id }) {
  const g = G, cy = CY
  const previews = {
    cyber: (
      <div style={{ background: 'rgba(0,255,136,0.07)', border: '1px solid rgba(0,255,136,0.25)', padding: '9px 10px 9px 34px', position: 'relative', overflow: 'hidden', width: '100%' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: g }} />
        <div style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', fontFamily: FM, fontSize: 11, color: g }}>✓</div>
        <div style={{ fontFamily: FM, fontSize: 9, color: g, marginBottom: 1 }}>SUCCESS</div>
        <div style={{ fontFamily: FD, fontSize: 11, color: TX }}>Changes saved!</div>
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.03) 2px,rgba(0,0,0,0.03) 4px)' }} />
      </div>
    ),
    pill: (
      <div style={{ background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.25)', borderRadius: 999, padding: '7px 14px 7px 10px', display: 'flex', alignItems: 'center', gap: 7 }}>
        <span style={{ fontSize: 12, color: g }}>✓</span>
        <span style={{ fontFamily: FM, fontSize: 10, color: TX }}>Changes saved!</span>
      </div>
    ),
    minimal: (
      <div style={{ background: BG2, border: `1px solid ${BD}`, borderRadius: 7, padding: '9px 12px', width: '100%' }}>
        <div style={{ fontFamily: FM, fontSize: 8, color: g, letterSpacing: 1, marginBottom: 2 }}>SUCCESS</div>
        <div style={{ fontFamily: FD, fontSize: 11, color: TX }}>Changes saved!</div>
      </div>
    ),
    terminal: (
      <div style={{ background: '#0a0f0a', border: '1px solid rgba(0,255,136,0.3)', padding: '7px 10px', width: '100%' }}>
        <span style={{ fontFamily: FM, fontSize: 10, color: g, fontWeight: 700, marginRight: 6 }}>[SUCCESS]</span>
        <span style={{ fontFamily: FM, fontSize: 10, color: '#a0d0a0' }}>Saved!</span>
      </div>
    ),
    glass: (
      <div style={{ background: 'rgba(10,20,30,0.7)', border: '1px solid rgba(0,255,136,0.3)', borderRadius: 9, padding: '9px 10px 9px 34px', backdropFilter: 'blur(16px)', position: 'relative', width: '100%' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: g, borderRadius: '9px 0 0 9px' }} />
        <div style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: g }}>✓</div>
        <div style={{ fontFamily: FD, fontSize: 11, color: TX }}>Changes saved!</div>
      </div>
    ),
    banner: (
      <div style={{ background: 'rgba(0,255,136,0.07)', borderLeft: '3px solid ' + g, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 7, width: '100%' }}>
        <span style={{ fontSize: 10, color: g }}>✓</span>
        <span style={{ fontFamily: FM, fontSize: 10, color: TX }}>Site updated successfully.</span>
      </div>
    ),
  }
  return <div style={{ width: '100%' }}>{previews[id] || previews.cyber}</div>
}

function DialogPreview({ id }) {
  const red = 'var(--red)'
  const confs = {
    cyber:    { bg: BG2, border: '1px solid rgba(255,71,87,0.5)', r: 0, topBar: true },
    glass:    { bg: 'rgba(10,20,30,0.82)', border: '1px solid rgba(255,71,87,0.3)', r: 12, bd: 'blur(20px)' },
    terminal: { bg: '#0a0f0a', border: '1px solid rgba(255,71,87,0.5)', r: 4, titleBar: true },
    sheet:    { bg: BG2, border: `1px solid ${BD}`, r: '12px 12px 0 0', handle: true },
    minimal:  { bg: BG2, border: `1px solid ${BD}`, r: 10 },
    brutal:   { bg: BG, border: '3px solid rgba(255,71,87,0.8)', r: 0, sh: '4px 4px 0 rgba(255,71,87,0.7)' },
  }
  const s = confs[id] || confs.cyber
  return (
    <div style={{ width: '100%', background: s.bg, border: s.border, borderRadius: s.r, backdropFilter: s.bd, boxShadow: s.sh, overflow: 'hidden' }}>
      {s.topBar    && <div style={{ height: 2, background: `linear-gradient(90deg,${red},transparent)` }} />}
      {s.titleBar  && <div style={{ background: 'rgba(255,71,87,0.1)', borderBottom: '1px solid rgba(255,71,87,0.2)', padding: '4px 8px', display: 'flex', gap: 4 }}>{['#ff5f56','#ffbd2e','#27c93f'].map(c => <div key={c} style={{ width: 7, height: 7, borderRadius: '50%', background: c }} />)}</div>}
      {s.handle    && <div style={{ width: 24, height: 3, borderRadius: 3, background: MT, margin: '6px auto', opacity: 0.4 }} />}
      <div style={{ padding: '9px 11px 7px' }}>
        <div style={{ fontFamily: FM, fontSize: 7, color: red, letterSpacing: 2, marginBottom: 3 }}>⚠ DANGER</div>
        <div style={{ fontFamily: FD, fontSize: 12, fontWeight: 700, color: TX, marginBottom: 6, textTransform: id === 'brutal' ? 'uppercase' : 'none' }}>Delete post?</div>
        <div style={{ display: 'flex', borderTop: `${id === 'brutal' ? 2 : 1}px solid ${BD}` }}>
          <div style={{ flex: 1, padding: '6px 0', fontFamily: FM, fontSize: 8, color: MT, textAlign: 'center', borderRight: `1px solid ${BD}` }}>CANCEL</div>
          <div style={{ flex: 1, padding: '6px 0', fontFamily: FM, fontSize: 8, color: red, textAlign: 'center', fontWeight: 700, background: 'rgba(255,71,87,0.08)' }}>CONFIRM</div>
        </div>
      </div>
    </div>
  )
}

function LoadingPreview({ id }) {
  const g = '#00ff88'
  const cy = 'var(--cyan)'
  const previews = {
    terminal: (
      <div style={{ fontFamily: FM, fontSize: 8, color: g, textAlign: 'left', padding: '5px 7px', background: '#060a06', border: '1px solid rgba(0,255,136,0.2)', borderRadius: 3, width: '100%' }}>
        <div style={{ color: MT, marginBottom: 1 }}>{'>'} Initializing...</div>
        <div>{'>'} <span style={{ color: g }}>eth0: connected [OK]</span></div>
        <div style={{ display: 'flex', gap: 3, marginTop: 4, height: 2 }}>
          <div style={{ flex: 3, background: `linear-gradient(90deg,${g},${cy})`, borderRadius: 2 }} />
          <div style={{ flex: 2, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }} />
        </div>
      </div>
    ),
    minimal: (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7 }}>
        <div style={{ width: 26, height: 26, borderRadius: '50%', border: `1.5px solid transparent`, borderTopColor: g, borderBottomColor: cy, animation: 'fwSpin 1s linear infinite' }} />
        <div style={{ fontFamily: FM, fontSize: 8, color: MT, letterSpacing: 2 }}>LOADING</div>
      </div>
    ),
    glitch: (
      <div style={{ position: 'relative', fontFamily: FD, fontSize: 20, fontWeight: 700, letterSpacing: -1, userSelect: 'none', textAlign: 'center' }}>
        TANVIR<span style={{ color: g }}>.</span>
        <span style={{ position: 'absolute', inset: 0, color: cy, clipPath: 'polygon(0 0,100% 0,100% 40%,0 40%)', animation: 'fwGlitch 2s infinite', opacity: 0.6 }}>TANVIR.</span>
      </div>
    ),
    splash: (
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: FD, fontSize: 20, fontWeight: 700, letterSpacing: -1 }}>T<span style={{ color: g }}>.</span>TANVIR</div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginTop: 5 }}>
          {[0,1,2].map(i => <div key={i} style={{ width: 4, height: 4, borderRadius: '50%', background: g, animation: `fwBounce 0.8s ${i * 0.15}s ease-in-out infinite alternate` }} />)}
        </div>
      </div>
    ),
    matrix: (
      <div style={{ fontFamily: FM, fontSize: 9, color: g, textAlign: 'center', lineHeight: 1.5 }}>
        {['ＡＢＣＤ','ＨＩＪＫ','ＱＲＳＴ'].map((r, i) => <div key={i} style={{ opacity: 1 - i * 0.25 }}>{r}</div>)}
      </div>
    ),
    pulse: (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7 }}>
        <div style={{ position: 'relative', width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {[0,1].map(i => <div key={i} style={{ position: 'absolute', inset: i * 7, borderRadius: '50%', border: `1px solid ${i === 0 ? g : cy}`, animation: `fwPulse ${1.4 + i * 0.3}s ${i * 0.2}s ease-in-out infinite` }} />)}
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: g, boxShadow: `0 0 6px ${g}` }} />
        </div>
        <div style={{ fontFamily: FM, fontSize: 8, color: MT, letterSpacing: 2 }}>CONNECTING</div>
      </div>
    ),
    cyber: (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 2 }}>
          {Array.from({ length: 18 }, (_, i) => (
            <div key={i} style={{ width: 7, height: 7, borderRadius: 1, background: i < 11 ? cy : 'rgba(0,212,255,0.08)', border: `1px solid ${i < 11 ? 'rgba(0,212,255,0.7)' : 'rgba(0,212,255,0.12)'}`, boxShadow: i < 11 ? '0 0 4px rgba(0,212,255,0.5)' : 'none' }} />
          ))}
        </div>
        <div style={{ fontFamily: FM, fontSize: 7, color: MT, letterSpacing: 2 }}>BOOT SEQUENCE</div>
      </div>
    ),
    bars: (
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {[['KERNEL', 100, g], ['NETWORK', 72, cy], ['ASSETS', 45, g]].map(([l, p, c]) => (
          <div key={l}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: FM, fontSize: 7, color: MT, marginBottom: 2 }}>
              <span>{l}</span><span style={{ color: c }}>{p}%</span>
            </div>
            <div style={{ height: 2, background: 'rgba(255,255,255,0.06)', borderRadius: 1 }}>
              <div style={{ height: '100%', width: `${p}%`, background: `linear-gradient(90deg,${c},rgba(0,255,136,0.3))`, borderRadius: 1 }} />
            </div>
          </div>
        ))}
      </div>
    ),
    wave: (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 22 }}>
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} style={{ width: 4, borderRadius: 2, background: i % 2 === 0 ? g : cy, animation: `fwWave ${0.8 + i * 0.06}s ${i * 0.06}s ease-in-out infinite` }} />
          ))}
        </div>
        <div style={{ fontFamily: FM, fontSize: 8, color: MT, letterSpacing: 2 }}>LOADING</div>
      </div>
    ),
    neon: (
      <div style={{ textAlign: 'center', fontFamily: FD, fontSize: 18, fontWeight: 900, letterSpacing: 3, color: '#fff', animation: 'fwNeon 3s infinite', textShadow: `0 0 8px ${g},0 0 20px ${g}` }}>
        TANVIR
      </div>
    ),
    orbit: (
      <div style={{ position: 'relative', width: 54, height: 54, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {[{ r: 14, c: g, s: 5 }, { r: 22, c: cy, s: 4 }, { r: 28, c: 'rgba(0,255,136,0.5)', s: 3 }].map((o, i) => (
          <div key={i} style={{ position: 'absolute', width: o.r*2, height: o.r*2, borderRadius: '50%', border: `1px solid ${o.c}22` }} />
        ))}
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: g, boxShadow: `0 0 8px ${g}`, zIndex: 2 }} />
        <div style={{ position: 'absolute', width: 5, height: 5, borderRadius: '50%', background: g, boxShadow: `0 0 6px ${g}`, top: '20%', left: '72%', animation: 'fwSpin 1.2s linear infinite', transformOrigin: '-7px 10px' }} />
        <div style={{ position: 'absolute', width: 4, height: 4, borderRadius: '50%', background: cy, boxShadow: `0 0 6px ${cy}`, top: '10%', left: '15%', animation: 'fwSpin 1.8s linear infinite reverse', transformOrigin: '12px 16px' }} />
      </div>
    ),
    typewriter: (
      <div style={{ fontFamily: FD, fontSize: 16, fontWeight: 700, letterSpacing: -1, display: 'flex', alignItems: 'center', gap: 1 }}>
        {'TANVIR'.split('').map((ch, i) => (
          <span key={i} style={{ color: ch === '.' ? g : TX, animation: `fwBounce ${0.4 + i * 0.06}s ${i * 0.08}s ease-in-out infinite alternate` }}>{ch}</span>
        ))}
        <span style={{ display:'inline-block', width: 2, height: 14, background: g, marginLeft: 2, animation: 'fwBounce 0.7s steps(1) infinite' }} />
      </div>
    ),
    dna: (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'center' }}>
        {[0,1,2,3,4].map(i => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 0, width: 50, justifyContent: 'space-between', position: 'relative', height: 7 }}>
            <div style={{ position: 'absolute', inset: 0, margin: 'auto', height: 1, background: `linear-gradient(90deg,${i%2===0?g:cy},${i%2===0?cy:g})`, opacity: 0.5 }} />
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: i%2===0?g:cy, boxShadow: `0 0 5px ${i%2===0?g:cy}`, zIndex:1 }} />
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: i%2===0?cy:g, boxShadow: `0 0 5px ${i%2===0?cy:g}`, zIndex:1 }} />
          </div>
        ))}
      </div>
    ),
    countdown: (
      <div style={{ fontFamily: FD, fontSize: 28, fontWeight: 900, color: cy, textShadow: `0 0 12px ${cy}`, letterSpacing: -2, animation: 'fwPulse 1s ease-in-out infinite' }}>
        3
      </div>
    ),
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
      {previews[id] || previews.terminal}
    </div>
  )
}

function AnimationPreview({ id }) {
  const [ping, setPing] = useState(false)
  const presets = {
    smooth:     { d: '0.35s', e: 'cubic-bezier(0.16,1,0.3,1)',      info: '0.35s · elastic' },
    snappy:     { d: '0.12s', e: 'cubic-bezier(0.4,0,0.2,1)',        info: '0.12s · crisp' },
    bouncy:     { d: '0.45s', e: 'cubic-bezier(0.34,1.56,0.64,1)',   info: '0.45s · spring' },
    expressive: { d: '0.5s',  e: 'cubic-bezier(0.22,1.5,0.36,1)',    info: '0.5s · dramatic' },
    reduced:    { d: '0.2s',  e: 'cubic-bezier(0.4,0,0.2,1)',        info: '0.2s · subtle' },
    elastic:    { d: '0.5s',  e: 'cubic-bezier(0.68,-0.55,0.27,1.55)', info: '0.5s · overshoot' },
    cinematic:  { d: '1.2s',  e: 'cubic-bezier(0.25,0.1,0.25,1)',    info: '1.2s · dramatic' },
    none:       { d: '0s',    e: 'linear',                            info: 'instant' },
  }
  const p = presets[id] || presets.smooth
  const color = 'var(--cyan)'
  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, width: '100%', cursor: 'pointer' }}
      title="Click to preview"
      onClick={() => { setPing(false); requestAnimationFrame(() => requestAnimationFrame(() => setPing(true))) }}
    >
      <div style={{
        width: 26, height: 26, borderRadius: '50%',
        background: 'rgba(0,212,255,0.18)',
        border: `2px solid ${color}`,
        transform: ping ? 'scale(1.5) translateY(-10px)' : 'scale(1) translateY(0)',
        opacity: id === 'none' ? (ping ? 0 : 1) : 1,
        transition: `transform ${p.d} ${p.e}, opacity ${p.d} ${p.e}`,
        boxShadow: `0 0 8px rgba(0,212,255,0.3)`,
      }}
        onTransitionEnd={() => setPing(false)}
      />
      <div style={{ fontFamily: FM, fontSize: 8, color: MT, letterSpacing: 1, textAlign: 'center' }}>{p.info}</div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLE CARD
// ─────────────────────────────────────────────────────────────────────────────
function StyleCard({ item, isActive, onSelect, accentColor, category }) {
  return (
    <div
      onClick={() => onSelect(item.id)}
      style={{
        background: isActive ? `${accentColor}09` : BG2,
        border: `2px solid ${isActive ? accentColor : BD}`,
        borderRadius: 10,
        cursor: 'pointer',
        overflow: 'hidden',
        transition: 'all 0.18s cubic-bezier(0.16,1,0.3,1)',
        boxShadow: isActive ? `0 0 18px ${accentColor}28, 0 4px 16px rgba(0,0,0,0.3)` : '0 2px 8px rgba(0,0,0,0.2)',
        position: 'relative',
        transform: isActive ? 'translateY(-2px)' : 'translateY(0)',
      }}
      onMouseEnter={e => { if (!isActive) { e.currentTarget.style.borderColor = `${accentColor}55`; e.currentTarget.style.transform = 'translateY(-2px)' } }}
      onMouseLeave={e => { if (!isActive) { e.currentTarget.style.borderColor = BD; e.currentTarget.style.transform = 'translateY(0)' } }}
    >
      {isActive && (
        <div style={{ position: 'absolute', top: 7, right: 7, zIndex: 2, width: 18, height: 18, borderRadius: '50%', background: accentColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#000', fontWeight: 900 }}>✓</div>
      )}
      {/* Preview */}
      <div style={{ height: 82, background: BG, borderBottom: `1px solid ${BD}`, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px 14px', overflow: 'hidden' }}>
        {category === 'menu'      && <MenuPreview      id={item.id} />}
        {category === 'notify'    && <NotifyPreview    id={item.id} />}
        {category === 'dialog'    && <DialogPreview    id={item.id} />}
        {category === 'loading'   && <LoadingPreview   id={item.id} />}
        {category === 'animation' && <AnimationPreview id={item.id} />}
      </div>
      {/* Label */}
      <div style={{ padding: '10px 12px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
          {item.icon && <span style={{ fontSize: 13, opacity: 0.8 }}>{item.icon}</span>}
          <span style={{ fontFamily: FM, fontSize: 11, fontWeight: 600, color: isActive ? accentColor : TX, letterSpacing: 0.3 }}>{item.label}</span>
        </div>
        <div style={{ fontFamily: FM, fontSize: 9, color: MT, lineHeight: 1.5 }}>{item.desc}</div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CATEGORY SECTION
// ─────────────────────────────────────────────────────────────────────────────
function CategorySection({ cat, draft, onSelect, isUnsaved }) {
  const activeId = draft[cat.configKey]
  const cols = cat.id === 'animation' ? 150 : 175
  return (
    <section id={`fw-${cat.id}`} style={{ marginBottom: 48, scrollMarginTop: 80 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div style={{ width: 38, height: 38, borderRadius: 8, background: `${cat.color}18`, border: `1px solid ${cat.color}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
          {cat.icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: FD, fontSize: 17, fontWeight: 700, color: TX, display: 'flex', alignItems: 'center', gap: 8 }}>
            {cat.label}
            {isUnsaved && (
              <span style={{ ...tag(cat.color), fontSize: 7, padding: '1px 6px' }}>UNSAVED</span>
            )}
          </div>
          <div style={{ fontFamily: FM, fontSize: 9, color: MT, letterSpacing: 0.5, marginTop: 1 }}>
            {cat.styles.length} variants — active: <span style={{ color: cat.color }}>{activeId}</span>
          </div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill,minmax(${cols}px,1fr))`, gap: 10 }}>
        {cat.styles.map(item => (
          <StyleCard
            key={item.id}
            item={item}
            isActive={activeId === item.id}
            onSelect={id => onSelect(cat.configKey, id)}
            accentColor={cat.color}
            category={cat.id}
          />
        ))}
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SIDEBAR NAV RAIL
// ─────────────────────────────────────────────────────────────────────────────
function NavRail({ active, onNav, draft, siteConfig }) {
  return (
    <div style={{ width: 190, flexShrink: 0 }}>
      <div style={{ fontFamily: FM, fontSize: 8, letterSpacing: 3, color: MT, padding: '0 0 8px', marginBottom: 4, borderBottom: `1px solid ${BD}` }}>CATEGORIES</div>
      {FRAMEWORK_CATEGORIES.map(cat => {
        const isActive = active === cat.id
        const changed = draft[cat.configKey] !== (siteConfig?.[cat.configKey] || DEFAULT_FRAMEWORK[cat.configKey])
        return (
          <button
            key={cat.id}
            onClick={() => onNav(cat.id)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 10px', borderRadius: 6, border: 'none', background: isActive ? `${cat.color}18` : 'transparent', color: isActive ? cat.color : MT, cursor: 'pointer', fontFamily: FM, fontSize: 10, letterSpacing: 0.5, transition: 'all 0.12s', position: 'relative', marginBottom: 2, boxShadow: isActive ? `inset 0 0 0 1px ${cat.color}40` : 'none' }}
            onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = TX } }}
            onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = MT } }}
          >
            {isActive && <span style={{ position: 'absolute', left: 0, top: '15%', bottom: '15%', width: 2, borderRadius: '0 2px 2px 0', background: cat.color }} />}
            <span style={{ fontSize: 15, width: 20, textAlign: 'center' }}>{cat.icon}</span>
            <span style={{ flex: 1, textAlign: 'left' }}>{cat.label}</span>
            {changed && <span style={{ width: 6, height: 6, borderRadius: '50%', background: cat.color, flexShrink: 0, boxShadow: `0 0 5px ${cat.color}` }} />}
          </button>
        )
      })}

      {/* Summary */}
      <div style={{ marginTop: 20, padding: '14px 12px', background: BG3, border: `1px solid ${BD}`, borderRadius: 8 }}>
        <div style={{ fontFamily: FM, fontSize: 8, letterSpacing: 2, color: MT, marginBottom: 10 }}>CURRENT</div>
        {FRAMEWORK_CATEGORIES.map(cat => (
          <div key={cat.id} style={{ display: 'flex', justifyContent: 'space-between', fontFamily: FM, fontSize: 9, marginBottom: 6, gap: 6 }}>
            <span style={{ color: MT }}>{cat.label.split(' ')[0]}</span>
            <span style={{ color: cat.color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right' }}>{draft[cat.configKey]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SAVE BAR
// ─────────────────────────────────────────────────────────────────────────────
function SaveBar({ hasChanges, saving, onSave, onReset }) {
  return (
    <div style={{
      position: 'sticky', bottom: 0, zIndex: 50,
      padding: '12px 0 4px',
      background: `linear-gradient(0deg, ${BG} 60%, transparent)`,
      display: 'flex', alignItems: 'center', gap: 10,
      opacity: hasChanges ? 1 : 0,
      pointerEvents: hasChanges ? 'auto' : 'none',
      transition: 'opacity 0.25s',
    }}>
      <div style={{ flex: 1, fontFamily: FM, fontSize: 10, color: MT }}>
        <span style={{ color: G }}>●</span> Unsaved changes
      </div>
      <button onClick={onReset} style={{ fontFamily: FM, fontSize: 10, letterSpacing: 1, padding: '8px 16px', background: 'transparent', border: `1px solid ${BD}`, color: MT, cursor: 'pointer', borderRadius: 6 }}>
        DISCARD
      </button>
      <button onClick={onSave} disabled={saving} style={{ fontFamily: FM, fontSize: 10, letterSpacing: 1, padding: '8px 22px', background: saving ? 'rgba(0,255,136,0.1)' : G, border: 'none', color: saving ? G : '#000', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', borderRadius: 6, transition: 'all 0.15s' }}>
        {saving ? 'APPLYING...' : '⬆  APPLY TO SITE'}
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────────────────────────────────────
export default function FrameworkLibrary() {
  const { siteConfig, refreshSiteConfig } = useTheme()
  const notify  = useNotify()
  const dlg     = useDialog()
  const isMobile = useIsMobile()

  const [draft, setDraft] = useState(() => ({
    menuStyle:          siteConfig?.menuStyle          || DEFAULT_FRAMEWORK.menuStyle,
    notifyStyle:        siteConfig?.notifyStyle        || DEFAULT_FRAMEWORK.notifyStyle,
    dialogStyle:        siteConfig?.dialogStyle        || DEFAULT_FRAMEWORK.dialogStyle,
    loadingScreenStyle: siteConfig?.loadingScreenStyle || DEFAULT_FRAMEWORK.loadingScreenStyle,
    animationPreset:    siteConfig?.animationPreset    || DEFAULT_FRAMEWORK.animationPreset,
  }))

  const [saving, setSaving]           = useState(false)
  const [activeSection, setActive]    = useState('loading')

  // Sync draft when siteConfig arrives / refreshes
  useEffect(() => {
    if (!siteConfig) return
    setDraft(prev => ({
      menuStyle:          siteConfig.menuStyle          || prev.menuStyle,
      notifyStyle:        siteConfig.notifyStyle        || prev.notifyStyle,
      dialogStyle:        siteConfig.dialogStyle        || prev.dialogStyle,
      loadingScreenStyle: siteConfig.loadingScreenStyle || prev.loadingScreenStyle,
      animationPreset:    siteConfig.animationPreset    || prev.animationPreset,
    }))
  }, [siteConfig])

  const hasChanges = FRAMEWORK_CATEGORIES.some(
    cat => draft[cat.configKey] !== (siteConfig?.[cat.configKey] || DEFAULT_FRAMEWORK[cat.configKey])
  )

  const handleSelect = useCallback((key, value) => {
    setDraft(prev => ({ ...prev, [key]: value }))
  }, [])

  const handleSave = useCallback(async () => {
    const payload = {
      menuStyle:          draft.menuStyle,
      notifyStyle:        draft.notifyStyle,
      dialogStyle:        draft.dialogStyle,
      loadingScreenStyle: draft.loadingScreenStyle,
      animationPreset:    draft.animationPreset,
    }
    setSaving(true)
    try {
      await api.put('/admin/site-settings', {
        ...siteConfig,
        ...payload,
      })
      if (draft.loadingScreenStyle) localStorage.setItem('loading-style',    draft.loadingScreenStyle)
      if (draft.animationPreset)    localStorage.setItem('animation-preset', draft.animationPreset)
      if (draft.menuStyle)          localStorage.setItem('menu-style',        draft.menuStyle)
      if (draft.notifyStyle)        localStorage.setItem('notify-style',      draft.notifyStyle)
      if (draft.dialogStyle)        localStorage.setItem('dialog-style',      draft.dialogStyle)
      clearSiteSettingsCache()
      window.dispatchEvent(new CustomEvent('site-settings-updated', { detail: payload }))
      await refreshSiteConfig()
      notify.success('Framework settings applied sitewide!', { title: 'Framework Library' })
    } catch (err) {
      notify.error(err?.response?.data?.error || 'Failed to save', { title: 'Error' })
    } finally {
      setSaving(false)
    }
  }, [draft, siteConfig, refreshSiteConfig, notify])

  const handleReset = useCallback(async () => {
    const ok = await dlg.confirm({
      title: 'Discard Changes',
      message: 'Reset all selections back to current live settings?',
      variant: 'warning',
      confirmLabel: 'DISCARD',
    })
    if (!ok) return
    setDraft({
      menuStyle:          siteConfig?.menuStyle          || DEFAULT_FRAMEWORK.menuStyle,
      notifyStyle:        siteConfig?.notifyStyle        || DEFAULT_FRAMEWORK.notifyStyle,
      dialogStyle:        siteConfig?.dialogStyle        || DEFAULT_FRAMEWORK.dialogStyle,
      loadingScreenStyle: siteConfig?.loadingScreenStyle || DEFAULT_FRAMEWORK.loadingScreenStyle,
      animationPreset:    siteConfig?.animationPreset    || DEFAULT_FRAMEWORK.animationPreset,
    })
  }, [siteConfig, dlg])

  const handleNav = useCallback((id) => {
    setActive(id)
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* ── Header ── */}
      <PageHeader
        eyebrow="DESIGN SYSTEM"
        title="Framework Library"
        subtitle="Control the visual style of every UI component sitewide — menus, notifications, dialogs, loading screens, and animations."
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => notify.info('Select a style in each category to preview it. Press "Apply to Site" to save globally.', { title: 'Framework Library', duration: 6000 })}
              style={{ fontFamily: FM, fontSize: 9, letterSpacing: 1, padding: '8px 14px', background: BG3, border: `1px solid ${BD}`, color: MT, cursor: 'pointer', borderRadius: 6 }}
            >ℹ️ HOW IT WORKS</button>
            {hasChanges && (
              <button onClick={handleSave} disabled={saving} style={{ fontFamily: FM, fontSize: 10, letterSpacing: 1, padding: '8px 20px', background: G, border: 'none', color: '#000', fontWeight: 700, cursor: 'pointer', borderRadius: 6 }}>
                {saving ? 'SAVING...' : '⬆  APPLY TO SITE'}
              </button>
            )}
          </div>
        }
      />

      {/* ── Status pill row ── */}
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 28 }}>
        {FRAMEWORK_CATEGORIES.map(cat => {
          const val = draft[cat.configKey]
          const live = siteConfig?.[cat.configKey] || DEFAULT_FRAMEWORK[cat.configKey]
          const changed = val !== live
          return (
            <button
              key={cat.id}
              onClick={() => handleNav(cat.id)}
              style={{
                fontFamily: FM, fontSize: 8, letterSpacing: 1,
                padding: '5px 12px', borderRadius: 99, cursor: 'pointer',
                background: changed ? `${cat.color}14` : 'transparent',
                border: `1px solid ${changed ? cat.color + '55' : BD}`,
                color: changed ? cat.color : MT,
                display: 'flex', alignItems: 'center', gap: 5,
                transition: 'all 0.15s',
              }}
            >
              <span style={{ fontSize: 12 }}>{cat.icon}</span>
              <span>{val}</span>
              {changed && <span style={{ fontSize: 7 }}>●</span>}
            </button>
          )
        })}
      </div>

      {/* ── Two-column body ── */}
      <div style={{ display: 'flex', gap: 32, flex: 1, minHeight: 0 }}>

        {/* Left nav rail — desktop only */}
        {!isMobile && (
          <div style={{ position: 'sticky', top: 0, alignSelf: 'flex-start', paddingTop: 2 }}>
            <NavRail active={activeSection} onNav={handleNav} draft={draft} siteConfig={siteConfig} />
          </div>
        )}

        {/* Right content — single active category only */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Mobile tab row */}
          {isMobile && (
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 20, paddingBottom: 4 }}>
              {FRAMEWORK_CATEGORIES.map(cat => {
                const isActive = cat.id === activeSection
                return (
                  <button key={cat.id} onClick={() => handleNav(cat.id)} style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 99, border: `1px solid ${isActive ? cat.color + '66' : BD}`, background: isActive ? `${cat.color}16` : BG3, color: isActive ? cat.color : MT, fontFamily: FM, fontSize: 9, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.12s' }}>
                    <span>{cat.icon}</span><span>{cat.label}</span>
                  </button>
                )
              })}
            </div>
          )}
          {FRAMEWORK_CATEGORIES.map(cat => (
            <div key={cat.id} style={{ display: cat.id === activeSection ? 'block' : 'none' }}>
              <CategorySection
                cat={cat}
                draft={draft}
                onSelect={handleSelect}
                isUnsaved={draft[cat.configKey] !== (siteConfig?.[cat.configKey] || DEFAULT_FRAMEWORK[cat.configKey])}
              />
            </div>
          ))}

          {/* Reset zone */}
          <section style={{ borderTop: `1px solid ${BD}`, paddingTop: 24, marginBottom: 60 }}>
            <div style={{ fontFamily: FM, fontSize: 8, letterSpacing: 3, color: 'rgba(255,71,87,0.7)', marginBottom: 12 }}>RESET</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontFamily: FD, fontSize: 14, fontWeight: 600, color: TX, marginBottom: 2 }}>Reset to Factory Defaults</div>
                <div style={{ fontFamily: FM, fontSize: 9, color: MT }}>Restore all framework styles to defaults: cyber / smooth / terminal</div>
              </div>
              <button
                onClick={async () => {
                  const ok = await dlg.confirm({
                    title: 'Reset Framework',
                    message: 'Set all styles back to cyber/smooth/terminal defaults and save immediately.',
                    variant: 'danger',
                    confirmLabel: 'RESET NOW',
                  })
                  if (!ok) return
                  const d = { ...DEFAULT_FRAMEWORK }
                  setDraft({ menuStyle: d.menuStyle, notifyStyle: d.notifyStyle, dialogStyle: d.dialogStyle, loadingScreenStyle: d.loadingScreenStyle, animationPreset: d.animationPreset })
                  try {
                    await api.put('/admin/site-settings', { ...siteConfig, ...d })
                    localStorage.setItem('loading-style', d.loadingScreenStyle)
                    localStorage.setItem('animation-preset', d.animationPreset)
                    clearSiteSettingsCache()
                    window.dispatchEvent(new CustomEvent('site-settings-updated', { detail: d }))
                    await refreshSiteConfig()
                    notify.success('Framework reset to defaults', { title: 'Reset' })
                  } catch {
                    notify.error('Failed to reset', { title: 'Error' })
                  }
                }}
                style={{ flexShrink: 0, fontFamily: FM, fontSize: 10, letterSpacing: 1, padding: '8px 18px', background: 'transparent', border: '1px solid rgba(255,71,87,0.4)', color: 'var(--red)', cursor: 'pointer', borderRadius: 6 }}
              >↺ RESET DEFAULTS</button>
            </div>
          </section>
        </div>
      </div>

      {/* Sticky save bar */}
      <SaveBar hasChanges={hasChanges} saving={saving} onSave={handleSave} onReset={handleReset} />

      {/* Animation keyframes */}
      <style>{`
        @keyframes fwSpin   { to { transform: rotate(360deg) } }
        @keyframes fwGlitch { 0%{transform:translate(0)} 30%{transform:translate(-3px,1px)} 60%{transform:translate(3px,-1px)} 90%{transform:translate(0)} }
        @keyframes fwBounce { from{transform:translateY(0)} to{transform:translateY(-6px)} }
        @keyframes fwPulse  { 0%,100%{transform:scale(1);opacity:0.45} 50%{transform:scale(1.18);opacity:1} }
        @keyframes fwWave   { 0%,100%{height:3px;opacity:0.4} 50%{height:20px;opacity:1} }
        @keyframes fwNeon   { 0%,100%{opacity:1;text-shadow:0 0 8px #00ff88,0 0 20px #00ff88} 45%{opacity:0.1;text-shadow:none} 50%{opacity:1;text-shadow:0 0 8px #00ff88,0 0 20px #00ff88} }
      `}</style>
    </div>
  )
}
