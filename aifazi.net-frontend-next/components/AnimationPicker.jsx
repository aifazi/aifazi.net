'use client'
import { useState, useEffect, useRef } from 'react'
import { useEdit } from '../context/EditContext'
import {
  GSAP_ANIMATION_PRESETS,
  buildGsapAnimationValue,
  describeGsapAnimationValue,
  isGsapAnimationValue,
  parseGsapAnimationValue,
  useGsapAnimation,
} from '@/lib/animate'

// â”€â”€ Animation Library Definition â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export const ANIMATION_LIBRARY = [
  ...GSAP_ANIMATION_PRESETS.map(preset => ({
    id: preset.id,
    label: preset.label,
    category: 'GSAP',
    engine: 'gsap',
    defaults: preset.defaults,
    preview: preset.id.includes('float') ? 'float 2.8s ease-in-out infinite' : preset.id.includes('pulse') ? 'glow-pulse 1.6s ease-in-out infinite' : 'fadeUp 0.7s ease both',
    icon: preset.icon,
  })),
  // â”€â”€ Entrance â”€â”€
  { id: 'fadeUp',         label: 'Fade Up',         category: 'Entrance', css: 'fadeUp {dur}s {ease} {delay}s both', preview: 'fadeUp 0.7s ease both', icon: 'â†‘' },
  { id: 'fadeDown',       label: 'Fade Down',       category: 'Entrance', css: 'fadeDown {dur}s {ease} {delay}s both', preview: 'fadeDown 0.7s ease both', icon: 'â†“' },
  { id: 'fadeIn',         label: 'Fade In',         category: 'Entrance', css: 'fadeIn {dur}s {ease} {delay}s both', preview: 'fadeIn 0.7s ease both', icon: 'â—Ž' },
  { id: 'fadeLeft',       label: 'Fade Left',       category: 'Entrance', css: 'fadeLeft {dur}s {ease} {delay}s both', preview: 'fadeLeft 0.7s ease both', icon: 'â†' },
  { id: 'fadeRight',      label: 'Fade Right',      category: 'Entrance', css: 'fadeRight {dur}s {ease} {delay}s both', preview: 'fadeRight 0.7s ease both', icon: 'â†’' },
  { id: 'slideInLeft',    label: 'Slide In Left',   category: 'Entrance', css: 'slide-in-left {dur}s {ease} {delay}s both', preview: 'slide-in-left 0.7s ease both', icon: 'âŸµ' },
  { id: 'slideInRight',   label: 'Slide In Right',  category: 'Entrance', css: 'slide-in-right {dur}s {ease} {delay}s both', preview: 'slide-in-right 0.7s ease both', icon: 'âŸ¶' },
  { id: 'scaleUp',        label: 'Scale Up',        category: 'Entrance', css: 'counter-up {dur}s {ease} {delay}s both', preview: 'counter-up 0.6s ease both', icon: 'âŠ•' },
  // â”€â”€ Loop â”€â”€
  { id: 'float',          label: 'Float',           category: 'Loop',    css: 'float {dur}s ease-in-out {delay}s infinite', preview: 'float 6s ease-in-out infinite', icon: 'ã€°' },
  { id: 'blink',          label: 'Blink',           category: 'Loop',    css: 'blink {dur}s {ease} {delay}s infinite', preview: 'blink 1s ease infinite', icon: 'â—‰' },
  { id: 'pulse',          label: 'Pulse',           category: 'Loop',    css: 'pulse {dur}s ease-in-out {delay}s infinite', preview: 'pulse 2s ease-in-out infinite', icon: 'âŠ›' },
  { id: 'glowPulse',      label: 'Glow Pulse',      category: 'Loop',    css: 'glow-pulse {dur}s ease-in-out {delay}s infinite', preview: 'glow-pulse 2s ease-in-out infinite', icon: 'âœ¦' },
  { id: 'orbDrift',       label: 'Orb Drift',       category: 'Loop',    css: 'orb-drift {dur}s ease-in-out {delay}s infinite', preview: 'orb-drift 15s ease-in-out infinite', icon: 'â—Œ' },
  { id: 'gridDrift',      label: 'Grid Drift',      category: 'Loop',    css: 'gridDrift {dur}s linear {delay}s infinite', preview: 'gridDrift 20s linear infinite', icon: 'âŠž' },
  { id: 'shimmerLine',    label: 'Shimmer',         category: 'Loop',    css: 'shimmer-line {dur}s ease-in-out {delay}s infinite', preview: 'shimmer-line 3s ease-in-out infinite', icon: 'âŸ¿' },
  { id: 'borderChase',    label: 'Border Chase',    category: 'Loop',    css: 'border-chase {dur}s linear {delay}s infinite', preview: 'border-chase 4s linear infinite', icon: 'â–£' },
  // â”€â”€ FX â”€â”€
  { id: 'glitch1',        label: 'Glitch 1',        category: 'FX',      css: 'glitch-1 {dur}s {ease} {delay}s infinite', preview: 'glitch-1 4s ease 1s infinite', icon: 'â–“' },
  { id: 'glitch2',        label: 'Glitch 2',        category: 'FX',      css: 'glitch-2 {dur}s {ease} {delay}s infinite', preview: 'glitch-2 4s ease 2s infinite', icon: 'â–’' },
  { id: 'scanline',       label: 'Scanline',        category: 'FX',      css: 'scanline {dur}s linear {delay}s infinite', preview: 'scanline 8s linear infinite', icon: 'â‰¡' },
  { id: 'particleRise',   label: 'Particle Rise',   category: 'FX',      css: 'particle-rise {dur}s ease-out {delay}s infinite', preview: 'particle-rise 4s ease-out infinite', icon: 'Â·' },
  // â”€â”€ None â”€â”€
  { id: 'none',           label: 'None',            category: 'None',    css: 'none', preview: 'none', icon: 'âœ•' },
]

const CATEGORIES = ['All', 'GSAP', 'Entrance', 'Loop', 'FX', 'None']

const EASINGS = [
  { label: 'ease',        value: 'ease' },
  { label: 'ease-in',     value: 'ease-in' },
  { label: 'ease-out',    value: 'ease-out' },
  { label: 'ease-in-out', value: 'ease-in-out' },
  { label: 'linear',      value: 'linear' },
  { label: 'spring',      value: 'cubic-bezier(0.34,1.56,0.64,1)' },
  { label: 'bounce',      value: 'cubic-bezier(0.68,-0.55,0.265,1.55)' },
]

const GSAP_EASINGS = [
  { label: 'power3.out', value: 'power3.out' },
  { label: 'expo.out', value: 'expo.out' },
  { label: 'back.out', value: 'back.out(1.7)' },
  { label: 'elastic.out', value: 'elastic.out(1, 0.45)' },
  { label: 'sine.inOut', value: 'sine.inOut' },
  { label: 'steps(5)', value: 'steps(5)' },
  { label: 'none', value: 'none' },
]

// â”€â”€ Build final animation string from selection + params â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function buildAnimCSS(anim, params) {
  if (!anim || anim.id === 'none') return 'none'
  if (anim.engine === 'gsap') return buildGsapAnimationValue(anim.id, params)
  return anim.css
    .replace('{dur}',   params.duration)
    .replace('{ease}',  params.easing)
    .replace('{delay}', params.delay)
}

function LivePreviewElement({ animationValue, label, replayKey }) {
  const previewRef = useGsapAnimation(animationValue, [replayKey])
  const isGsap = isGsapAnimationValue(animationValue)
  return (
    <div
      ref={previewRef}
      key={replayKey}
      style={{
        fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
        color: 'var(--green)', letterSpacing: 2,
        animation: isGsap ? undefined : animationValue,
        padding: '4px 8px',
        border: '1px solid color-mix(in srgb, var(--green) 30%, transparent)',
        borderRadius: 3,
        whiteSpace: 'nowrap',
      }}
    >
      {label || 'ELEM'}
    </div>
  )
}

// â”€â”€ Preview Card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function PreviewCard({ anim, selected, onSelect }) {
  const [key, setKey] = useState(0)
  const isSelected = selected?.id === anim.id

  return (
    <button
      onClick={() => { onSelect(anim); setKey(k => k + 1) }}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
        padding: '10px 8px', cursor: 'pointer', textAlign: 'center',
        background: isSelected ? 'color-mix(in srgb, var(--green) 10%, transparent)' : 'var(--bg3)',
        border: `1px solid ${isSelected ? 'var(--green)' : 'var(--border)'}`,
        borderRadius: 8, transition: 'all 0.2s', width: '100%',
        boxShadow: isSelected ? '0 0 12px color-mix(in srgb, var(--green) 20%, transparent)' : 'none',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = isSelected ? 'var(--green)' : 'color-mix(in srgb, var(--green) 40%, transparent)'; setKey(k => k + 1) }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = isSelected ? 'var(--green)' : 'var(--border)' }}
    >
      {/* Preview box */}
      <div style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        <div
          key={key}
          style={{
            width: anim.id === 'none' ? 24 : 28,
            height: anim.id === 'none' ? 24 : 28,
            borderRadius: 4,
            background: isSelected ? 'var(--green)' : 'var(--bg2)',
            border: `1px solid ${isSelected ? 'var(--green)' : 'color-mix(in srgb, var(--green) 30%, transparent)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, color: isSelected ? '#000' : 'var(--green)',
            animation: anim.preview,
            boxShadow: isSelected ? '0 0 8px color-mix(in srgb, var(--green) 50%, transparent)' : 'none',
          }}
        >
          {anim.icon}
        </div>
      </div>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 1, color: isSelected ? 'var(--green)' : 'var(--muted)', lineHeight: 1.3 }}>
        {anim.label}
      </span>
      {anim.engine === 'gsap' && (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 7, letterSpacing: 1.5, color: isSelected ? '#000' : 'var(--cyan)', background: isSelected ? 'var(--green)' : 'color-mix(in srgb, var(--cyan) 8%, transparent)', padding: '1px 5px', borderRadius: 8 }}>
          GSAP
        </span>
      )}
      {isSelected && (
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', boxShadow: '0 0 6px var(--green)' }} />
      )}
    </button>
  )
}

// â”€â”€ Main AnimationPicker Drawer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function AnimationPicker() {
  const editCtx = useEdit()
  const open      = editCtx?.animPickerOpen    || false
  const target    = editCtx?.animPickerTarget  || null   // { key, label, currentAnim }
  const onApply   = editCtx?.applyAnimation    || (() => {})
  const onClose   = editCtx?.closeAnimPicker   || (() => {})

  const [category, setCategory]   = useState('All')
  const [selected, setSelected]   = useState(null)
  const [params, setParams]       = useState({ duration: 0.9, delay: 0, easing: 'ease' })
  const [mounted, setMounted]     = useState(false)
  const [previewKey, setPreviewKey] = useState(0)

  // Sync open state for mount/unmount
  useEffect(() => {
    if (open) { setMounted(true) }
    else { const t = setTimeout(() => setMounted(false), 360); return () => clearTimeout(t) }
  }, [open])

  // When target changes, pre-select current animation
  useEffect(() => {
    if (!target) return
    const rawCurrent = target.currentAnim
    const cur = typeof rawCurrent === 'string'
      ? rawCurrent
      : (typeof rawCurrent?.value === 'string' ? rawCurrent.value : '')
    if (!cur || cur === 'none') { setSelected(ANIMATION_LIBRARY.find(a => a.id === 'none')); return }
    const gsapCurrent = parseGsapAnimationValue(cur)
    if (gsapCurrent) {
      const match = ANIMATION_LIBRARY.find(a => a.id === gsapCurrent.id)
      if (match) {
        setSelected(match)
        setParams({
          duration: gsapCurrent.duration ?? match.defaults?.duration ?? 0.9,
          delay: gsapCurrent.delay ?? match.defaults?.delay ?? 0,
          easing: gsapCurrent.ease ?? match.defaults?.ease ?? 'power3.out',
        })
      }
      return
    }
    // Try to match by animation name
    const match = ANIMATION_LIBRARY.find(a => {
      const dashedId = a.id.replace(/([A-Z])/g, '-$1').toLowerCase()
      const cssName = typeof a.css === 'string' ? a.css.split(' ')[0] : ''
      return cur.includes(dashedId) || (cssName && cur.includes(cssName))
    })
    if (match) setSelected(match)
    // Parse duration and delay if present
    const parts = cur.split(' ')
    if (parts[1]) setParams(p => ({ ...p, duration: parseFloat(parts[1]) || 0.9 }))
    if (parts[3]) setParams(p => ({ ...p, delay:    parseFloat(parts[3]) || 0 }))
  }, [target])

  // Esc to close
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  if (!mounted) return null

  const filtered = category === 'All'
    ? ANIMATION_LIBRARY
    : ANIMATION_LIBRARY.filter(a => a.category === category)

  const finalCSS = selected ? buildAnimCSS(selected, params) : 'none'
  const finalLabel = isGsapAnimationValue(finalCSS) ? describeGsapAnimationValue(finalCSS) : finalCSS
  const easingOptions = selected?.engine === 'gsap' ? GSAP_EASINGS : EASINGS

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 99994,
          background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(3px)',
          opacity: open ? 1 : 0, transition: 'opacity 0.3s ease',
        }}
      />

      {/* Drawer â€” inline CSS vars override any data-theme cascade */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 99995,
        width: 360, borderLeft: '1px solid color-mix(in srgb, var(--cyan) 15%, transparent)',
        boxShadow: '-20px 0 60px rgba(0,0,0,0.7)',
        display: 'flex', flexDirection: 'column',
        transform: open ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.36s cubic-bezier(0.16,1,0.3,1)',
        '--green':  '#00ff88',
        '--cyan':   '#00d4ff',
        '--orange': '#ff6b35',
        '--red':    '#ff4757',
        '--bg':     '#060a0f',
        '--bg2':    '#0b1118',
        '--bg3':    '#111a24',
        '--text':   '#c8d8e8',
        '--muted':  '#6b8296',
        '--border': 'color-mix(in srgb, var(--cyan) 15%, transparent)',
        background: '#0b1118',
      }}>

        {/* â”€â”€ Header â”€â”€ */}
        <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 16 }}>âœ¨</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 4, color: 'var(--green)' }}>GSAP ANIMATION LIBRARY</span>
            </div>
            <button
              onClick={onClose}
              style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer', width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, transition: 'all 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--green)'; e.currentTarget.style.color = 'var(--green)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted)' }}
            >âœ•</button>
          </div>
          {target && (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', letterSpacing: 2, marginTop: 2 }}>
              TARGET: <span style={{ color: 'var(--cyan)' }}>{target.label?.toUpperCase() || target.key}</span>
              <span style={{ color: 'var(--green)', marginLeft: 8 }}>LIVE PREVIEW CANVAS</span>
            </div>
          )}
        </div>

        {/* â”€â”€ Live Preview â”€â”€ */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0, background: 'var(--bg3)' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 2, color: 'var(--muted)', marginBottom: 8 }}>LIVE PREVIEW</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 80, height: 48, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
              <LivePreviewElement animationValue={finalCSS} label={target?.label || 'ELEM'} replayKey={previewKey} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: selected ? 'var(--green)' : 'var(--muted)', letterSpacing: 1, marginBottom: 4 }}>
                {selected?.label || 'No animation selected'}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 7, color: 'var(--muted)', letterSpacing: 1, wordBreak: 'break-all', lineHeight: 1.6, opacity: 0.7 }}>
                {finalLabel}
              </div>
            </div>
            <button
              onClick={() => setPreviewKey(k => k + 1)}
              title="Replay preview"
              style={{ flexShrink: 0, width: 28, height: 28, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--muted)', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--green)'; e.currentTarget.style.color = 'var(--green)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted)' }}
            >â†º</button>
          </div>
        </div>

        {/* â”€â”€ Params â”€â”€ */}
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 2, color: 'var(--muted)', marginBottom: 8 }}>PARAMETERS</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {/* Duration */}
            <div>
              <label style={{ fontFamily: 'var(--font-mono)', fontSize: 7, letterSpacing: 2, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>DURATION</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input
                  type="range" min="0.1" max="10" step="0.1"
                  value={params.duration}
                  onChange={e => { setParams(p => ({ ...p, duration: parseFloat(e.target.value) })); setPreviewKey(k => k + 1) }}
                  style={{ flex: 1, accentColor: 'var(--green)', height: 2 }}
                />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--green)', minWidth: 24 }}>{params.duration}s</span>
              </div>
            </div>
            {/* Delay */}
            <div>
              <label style={{ fontFamily: 'var(--font-mono)', fontSize: 7, letterSpacing: 2, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>DELAY</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input
                  type="range" min="0" max="5" step="0.1"
                  value={params.delay}
                  onChange={e => { setParams(p => ({ ...p, delay: parseFloat(e.target.value) })); setPreviewKey(k => k + 1) }}
                  style={{ flex: 1, accentColor: 'var(--green)', height: 2 }}
                />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--cyan)', minWidth: 24 }}>{params.delay}s</span>
              </div>
            </div>
            {/* Easing */}
            <div>
              <label style={{ fontFamily: 'var(--font-mono)', fontSize: 7, letterSpacing: 2, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>EASING</label>
              <select
                value={params.easing}
                onChange={e => { setParams(p => ({ ...p, easing: e.target.value })); setPreviewKey(k => k + 1) }}
                style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: 8, padding: '3px 5px', borderRadius: 4, outline: 'none', cursor: 'pointer' }}
              >
                {easingOptions.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* â”€â”€ Category Tabs â”€â”€ */}
        <div style={{ padding: '8px 16px 0', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 4, overflowX: 'auto', paddingBottom: 8 }}>
            {CATEGORIES.map(cat => {
              const active = category === cat
              return (
                <button key={cat}
                  onClick={() => setCategory(cat)}
                  style={{
                    flexShrink: 0, padding: '4px 10px',
                    fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 1,
                    background: active ? 'var(--green)' : 'var(--bg3)',
                    border: `1px solid ${active ? 'var(--green)' : 'var(--border)'}`,
                    borderRadius: 6, cursor: 'pointer', transition: 'all 0.15s',
                    color: active ? '#000' : 'var(--muted)', fontWeight: active ? 700 : 400,
                  }}
                  onMouseEnter={e => { if (!active) { e.currentTarget.style.borderColor = 'var(--green)'; e.currentTarget.style.color = 'var(--text)' } }}
                  onMouseLeave={e => { if (!active) { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted)' } }}
                >{cat}</button>
              )
            })}
          </div>
        </div>

        {/* â”€â”€ Animation Grid â”€â”€ */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 16px 8px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
            {filtered.map(anim => (
              <PreviewCard
                key={anim.id}
                anim={anim}
                selected={selected}
                onSelect={a => {
                  setSelected(a)
                  if (a.engine === 'gsap') {
                    setParams({
                      duration: a.defaults?.duration ?? 0.9,
                      delay: a.defaults?.delay ?? 0,
                      easing: a.defaults?.ease ?? 'power3.out',
                    })
                  } else if (params.easing?.includes('.')) {
                    setParams(p => ({ ...p, easing: 'ease' }))
                  }
                  setPreviewKey(k => k + 1)
                }}
              />
            ))}
          </div>
        </div>

        {/* â”€â”€ Footer Apply â”€â”€ */}
        <div style={{ borderTop: '1px solid var(--border)', padding: '12px 16px', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <button
              onClick={onClose}
              style={{ flex: '0 0 80px', padding: '10px 0', background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 2, color: 'var(--muted)', cursor: 'pointer', transition: 'all 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--text)'; e.currentTarget.style.color = 'var(--text)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted)' }}
            >CANCEL</button>
            <button
              onClick={() => {
                if (target && selected) {
                  onApply(target.key, finalCSS)
                  onClose()
                }
              }}
              disabled={!selected}
              style={{
                flex: 1, padding: '10px 0',
                background: selected ? 'var(--green)' : 'var(--bg3)',
                border: `1px solid ${selected ? 'var(--green)' : 'var(--border)'}`,
                borderRadius: 6, fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2,
                color: selected ? '#000' : 'var(--muted)', fontWeight: 700, cursor: selected ? 'pointer' : 'default',
                transition: 'all 0.2s', boxShadow: selected ? '0 0 16px color-mix(in srgb, var(--green) 30%, transparent)' : 'none',
              }}
            >APPLY ANIMATION</button>
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 7, color: 'var(--muted)', letterSpacing: 1, textAlign: 'center', opacity: 0.6 }}>
            CHANGES STAGED â€” SAVE WITH DONE â†µ
          </div>
        </div>
      </div>
    </>
  )
}
