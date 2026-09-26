'use client'
import { useEffect, useState, useRef } from 'react'
import { useInlineEdit } from '../context/EditContext'
import { prefersReducedMotion } from '../core/useFocusTrap'
import createGlobe from 'cobe'

import DatacenterMode from './server-rack/DatacenterMode'
import DeployMode from './server-rack/DeployMode'
import MonitorMode from './server-rack/MonitorMode'
import ThreatMode from './server-rack/ThreatMode'
import NeuralNetMode from './server-rack/NeuralNetMode'
import PacketFlowMode from './server-rack/PacketFlowMode'
import AvatarMode from './server-rack/AvatarMode'

// ─────────────────────────────────────────────────────────────────────────────
//  ServerRackAnimation  —  multi-mode animated dashboard
//  Modes: DATACENTER · DEPLOY PIPELINE · SYSTEM MONITOR · THREAT MAP
// ─────────────────────────────────────────────────────────────────────────────

const MODES = [
  { id: 'datacenter', label: 'DATACENTER',   icon: '⬡' },
  { id: 'deploy',     label: 'DEPLOY',        icon: '▶' },
  { id: 'monitor',    label: 'SYS MONITOR',  icon: '◈' },
  { id: 'threat',     label: 'THREAT MAP',   icon: '◉' },
  { id: 'neural',     label: 'NEURAL NET',   icon: '◎' },
  { id: 'packets',    label: 'PACKET FLOW',  icon: '⟶' },
  { id: 'avatar',     label: 'AVATAR',       icon: '◐' },
  { id: 'globe',      label: 'GLOBE',        icon: '◑' },
]

export default function ServerRackAnimation() {
  // Persist the active mode globally — saved for all visitors via the content API
  const { value: savedMode, save: persistMode, isAdmin: canEditMode } = useInlineEdit('hero.animMode', 'datacenter')

  // Local state follows the saved value; also allows instant preview while in edit mode
  const [mode, setMode] = useState(() => (typeof savedMode === 'string' ? savedMode : 'datacenter'))
  const [tick, setTick] = useState(0)
  const [hovMode, setHovMode] = useState(null)
  const visibleRef = useRef(true)
  const containerRef = useRef(null)

  // Keep local mode in sync when the backend value changes (e.g. after another admin saves)
  const [prevSavedMode, setPrevSavedMode] = useState(savedMode)
  if (prevSavedMode !== savedMode) {
    setPrevSavedMode(savedMode)
    if (typeof savedMode === 'string' && savedMode !== mode) setMode(savedMode)
  }

  useEffect(() => {
    const el = containerRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const obs = new IntersectionObserver(([e]) => { visibleRef.current = e.isIntersecting }, { threshold: 0 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    const id = setInterval(() => {
      if (prefersReducedMotion()) return
      if (visibleRef.current) setTick(t => t + 1)
    }, 350)
    return () => clearInterval(id)
  }, [])

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', minHeight: 520, position: 'relative',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start',
      paddingTop: canEditMode ? 16 : 0 }}>

      {/* ── Mode Switcher — only visible in admin edit mode ── */}
      {canEditMode && (
      <div style={{ display: 'flex', gap: 4, marginBottom: 14, background: 'var(--bg2)',
        border: '1px solid var(--border)', borderRadius: 6, padding: 4, flexWrap: 'wrap',
        boxShadow: '0 2px 12px rgba(0,0,0,0.3)', position: 'relative' }}>
        {/* Admin-only hint badge */}
        <div style={{
          position: 'absolute', top: -9, left: '50%', transform: 'translateX(-50%)',
          fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2,
          color: 'var(--green)', background: 'var(--bg2)',
          border: '1px solid color-mix(in srgb, var(--green) 35%, transparent)', borderRadius: 10,
          padding: '1px 8px', whiteSpace: 'nowrap', pointerEvents: 'none',
        }}>✎ EDIT MODE — SELECT ANIMATION</div>
        {MODES.map(m => {
          const active = mode === m.id
          return (
            <button key={m.id}
              onClick={() => { setMode(m.id); persistMode(m.id) }}
              onMouseEnter={() => setHovMode(m.id)}
              onMouseLeave={() => setHovMode(null)}
              style={{
                fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2,
                padding: '6px 14px', cursor: 'pointer', borderRadius: 4,
                border: active ? '1px solid var(--cyan)' : '1px solid transparent',
                background: active ? 'color-mix(in srgb, var(--cyan) 10%, transparent)' : hovMode === m.id ? 'var(--bg3)' : 'transparent',
                color: active ? 'var(--cyan)' : 'var(--muted)',
                transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: active ? '0 0 10px color-mix(in srgb, var(--cyan) 15%, transparent)' : 'none',
              }}>
              <span style={{ fontSize: 11, color: active ? 'var(--cyan)' : 'var(--muted)' }}>{m.icon}</span>
              {m.label}
              {active && <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--cyan)',
                boxShadow: '0 0 6px var(--cyan)', display: 'inline-block' }}/>}
            </button>
          )
        })}
      </div>
      )}

      {/* ── Animation panel ── */}
      <div style={{ width: '100%', flex: 1, position: 'relative' }}>
        {mode === 'datacenter' && <DatacenterMode tick={tick} visibleRef={visibleRef}/>}
        {mode === 'deploy'     && <DeployMode     tick={tick} visibleRef={visibleRef}/>}
        {mode === 'monitor'    && <MonitorMode    tick={tick} visibleRef={visibleRef}/>}
        {mode === 'threat'     && <ThreatMode     tick={tick} visibleRef={visibleRef}/>}
        {mode === 'neural'     && <NeuralNetMode  visibleRef={visibleRef}/>}
        {mode === 'packets'    && <PacketFlowMode visibleRef={visibleRef}/>}
        {mode === 'avatar'     && <AvatarMode     visibleRef={visibleRef}/>}
        {mode === 'globe'      && <GlobeMode      visibleRef={visibleRef}/>}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  SHARED CSS
// ─────────────────────────────────────────────────────────────────────────────

// ── Globe section (COBE + VisitorHud) ─────────────────────────────────────────
function cssVar(name, fallback) {
  if (typeof window === 'undefined') return fallback
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}

const LIGHT_THEME_IDS = new Set([
  'light','cyber-light',
  'midnight-light','crimson-light','ocean-light','amber-light',
  'rose-light','forest-light','glass-light','synthwave-light',
  'terminal-light','neon-noir-light','aurora-light',
  'brutalist','paper','neumorph','macos','pastel','win95',
  // Additional light variants discovered in theme-library.css
  'cobalt-light','ember-light','honey-light','ice-light','lava-light',
  'mario-light','minecraft-light','pacman-light','slate-light','sonic-light',
  'teal-light','toxic-light','violet-light',
])

// Prefer luminance over the ID list so new themes stay in sync automatically.
function isLightFromLuminance(rgbCsv) {
  const p = String(rgbCsv || '').split(',').map(Number)
  if (p.length < 3 || p.some(n => !Number.isFinite(n))) return false
  // Rec. 709 relative luminance approximation on 0–255 channels
  return (0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]) > 140
}

function readGlobeTheme() {
  if (typeof window === 'undefined') return {
    cyanRgb: '0,212,255', greenRgb: '0,255,136', bgRgb: '0,12,28',
    isLight: false, textRgb: '200,216,232', mutedRgb: '107,130,150', orangeRgb: '255,107,53',
  }
  const themeAttr = document.documentElement.getAttribute('data-theme') || ''
  const hexToRgb = (hex, fb) => {
    if (!hex) return fb
    const m6 = hex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
    if (m6) return `${parseInt(m6[1],16)},${parseInt(m6[2],16)},${parseInt(m6[3],16)}`
    const m3 = hex.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i)
    if (m3) return `${parseInt(m3[1]+m3[1],16)},${parseInt(m3[2]+m3[2],16)},${parseInt(m3[3]+m3[3],16)}`
    const mr = hex.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i)
    if (mr) return `${mr[1]},${mr[2]},${mr[3]}`
    return fb
  }
  const rawBg = cssVar('--bg', '')
  const parsedBg = hexToRgb(rawBg, null)
  // Luminance of the real --bg wins; fall back to ID list / system preference.
  const isLight = parsedBg
    ? isLightFromLuminance(parsedBg)
    : (LIGHT_THEME_IDS.has(themeAttr) || (!themeAttr && window.matchMedia('(prefers-color-scheme: light)').matches))
  const read = (prop, darkDef, lightDef) => {
    const raw = cssVar(prop, '')
    return hexToRgb(raw || null, isLight ? lightDef : darkDef)
  }
  const cyanRgb   = read('--cyan',    '0,212,255',  '0,93,143')
  const greenRgb  = read('--green',   '0,255,136',  '0,110,56')
  const bgRgb      = (() => {
    if (!parsedBg) return isLight ? '200,214,228' : '0,12,28'
    const p = parsedBg.split(',').map(Number)
    return (p[0] + p[1] + p[2]) > 400 && !isLight ? '2,10,24' : parsedBg
  })()
  const textRgb    = read('--text',    '200,216,232', '10,21,32')
  const mutedRgb   = read('--muted',    '107,130,150', '74,100,120')
  const orangeRgb  = read('--orange',  '255,107,53',  '184,68,22')
  return { cyanRgb, greenRgb, bgRgb, isLight, textRgb, mutedRgb, orangeRgb }
}

// Bindable city nodes — `id` drives CSS Anchor Positioning labels.
const GLOBE_CITIES = [
  { id: 'nyc',  name: 'NEW YORK',   lat:  40.7, lng:  -74.0, hub: false, region: 'NA'  },
  { id: 'lon',  name: 'LONDON',     lat:  51.5, lng:   -0.1, hub: false, region: 'EU'  },
  { id: 'tyo',  name: 'TOKYO',      lat:  35.7, lng:  139.7, hub: false, region: 'APAC'},
  { id: 'dxb',  name: 'DUBAI',      lat:  25.2, lng:   55.3, hub: false, region: 'MEA' },
  { id: 'sin',  name: 'SINGAPORE',  lat:   1.3, lng:  103.8, hub: false, region: 'APAC'},
  { id: 'gru',  name: 'SAO PAULO',  lat: -23.5, lng:  -46.6, hub: false, region: 'LATAM'},
  { id: 'syd',  name: 'SYDNEY',     lat: -33.9, lng:  151.2, hub: false, region: 'APAC'},
  { id: 'cdg',  name: 'PARIS',      lat:  48.9, lng:    2.3, hub: false, region: 'EU'  },
  { id: 'bom',  name: 'MUMBAI',     lat:  19.1, lng:   72.9, hub: false, region: 'APAC'},
  { id: 'ruh',  name: 'RIYADH',     lat:  24.7, lng:   46.7, hub: true,  region: 'MEA' },
  { id: 'yyz',  name: 'TORONTO',    lat:  43.7, lng:  -79.4, hub: false, region: 'NA'  },
  { id: 'fra',  name: 'FRANKFURT',  lat:  50.1, lng:    8.7, hub: false, region: 'EU'  },
]

// Edge list [fromIdx, toIdx]; hub routes get a distinct arc color + label.
const GLOBE_CONNECTIONS = [
  { from: 0,  to: 1,  hub: false },
  { from: 1,  to: 7,  hub: false },
  { from: 0,  to: 10, hub: true  },
  { from: 1,  to: 11, hub: true  },
  { from: 2,  to: 8,  hub: false },
  { from: 3,  to: 9,  hub: true  },
  { from: 3,  to: 1,  hub: false },
  { from: 8,  to: 4,  hub: false },
  { from: 4,  to: 2,  hub: false },
  { from: 5,  to: 0,  hub: false },
  { from: 6,  to: 4,  hub: false },
  { from: 9,  to: 3,  hub: true  },
  { from: 11, to: 7,  hub: false },
  { from: 0,  to: 3,  hub: false },
  { from: 9,  to: 8,  hub: true  },
  { from: 2,  to: 6,  hub: false },
  { from: 9,  to: 1,  hub: true  },
  { from: 4,  to: 6,  hub: false },
]

// Progressive-enhancement gate for CSS Anchor Positioning labels.
function supportsCssAnchors() {
  if (typeof CSS === 'undefined' || !CSS.supports) return false
  return CSS.supports('anchor-name: --cobe-probe') || CSS.supports('position-anchor: --cobe-probe')
}

// Center a lat/lng in COBE's view (phi = longitude spin, theta = latitude tilt).
function cityToAngles(lat, lng) {
  return {
    phi: -lng * Math.PI / 180,
    theta: Math.max(-1.1, Math.min(1.1, lat * Math.PI / 180)),
  }
}

const GLOBE_MIN_ZOOM = 0.55
const GLOBE_MAX_ZOOM = 1.35
const GLOBE_BASE_RATIO = 0.36
const GLOBE_MAX_RATIO = 0.44

function clampGlobeZoom(value) {
  const safeMax = Math.max(0.8, Math.min(GLOBE_MAX_ZOOM, GLOBE_MAX_RATIO / GLOBE_BASE_RATIO))
  return Math.max(GLOBE_MIN_ZOOM, Math.min(safeMax, value))
}

function firstGeoValue(...values) {
  const found = values.find(v => v !== undefined && v !== null && String(v).trim() !== '')
  return found === undefined ? '—' : String(found).trim()
}

// Mask public IP: keep first two octets, hide the rest (87.201.x.x)
function maskIp(ip) {
  if (!ip || ip === '—') return '—'
  const parts = String(ip).split('.')
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.x.x`
  return String(ip).slice(0, 3) + '…'
}

/** HUD telemetry callout — reticle frame, location headline, fact chips, hover details. */
function VisitorHud({ visitor }) {
  const [open, setOpen] = useState(false)

  if (!visitor) {
    return (
      <div className="globe-visitor-shell" style={{
        position: 'absolute', bottom: 12, left: 14, zIndex: 3,
        pointerEvents: 'none',
      }}>
        <div className="globe-visitor-card" style={{
          borderRadius: 4, padding: '8px 12px',
          fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)',
          letterSpacing: 1.5,
        }}>
          <span style={{ color: 'var(--green)', marginRight: 8 }}>◉</span>
          LOCATING…
        </div>
      </div>
    )
  }

  const place = [visitor.city, visitor.country].filter(v => v && v !== '—').join(', ') || 'Unknown'
  const chips = [
    visitor.ipType && visitor.ipType !== '—' ? visitor.ipType : null,
    visitor.tz && visitor.tz !== '—' ? visitor.tz : null,
    visitor.asn && visitor.asn !== '—' ? visitor.asn : null,
  ].filter(Boolean)

  const details = [
    ['IP',        maskIp(visitor.ip)],
    ['LOCATION',  visitor.address || place],
    ['REGION',    visitor.region],
    ['COORDS',    visitor.lat !== '—' ? `${visitor.lat}°, ${visitor.lon}°` : '—'],
    ['TZ',        [visitor.tz, visitor.utc].filter(v => v && v !== '—').join(' ')],
    ['ISP',       visitor.org],
    ['NETWORK',   visitor.network],
  ].filter(([, v]) => v && v !== '—')

  const hasCoords = Number.isFinite(+visitor.lat) && Number.isFinite(+visitor.lon) && visitor.lat !== '—'

  return (
    <div
      className="globe-visitor-shell"
      data-anchored={hasCoords ? 'true' : undefined}
      style={{
        position: 'absolute',
        // Default corner placement; CSS anchor rules override via [data-anchored]
        bottom: 12,
        left: 14,
        zIndex: 4,
        maxWidth: 'calc(100% - 28px)',
      }}
    >
      <div
        className="globe-visitor-card"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        tabIndex={0}
        role="status"
        aria-label={`Visitor telemetry: ${place}`}
        style={{
          position: 'relative',
          borderRadius: 4,
          padding: '10px 14px 11px',
          minWidth: 220,
          maxWidth: 320,
          cursor: 'default',
          outline: 'none',
        }}
      >
        {/* Corner brackets — targeting reticle */}
        {[
          { top: -1, left: -1, borderTop: '1.5px solid var(--cyan)', borderLeft: '1.5px solid var(--cyan)' },
          { top: -1, right: -1, borderTop: '1.5px solid var(--cyan)', borderRight: '1.5px solid var(--cyan)' },
          { bottom: -1, left: -1, borderBottom: '1.5px solid var(--cyan)', borderLeft: '1.5px solid var(--cyan)' },
          { bottom: -1, right: -1, borderBottom: '1.5px solid var(--cyan)', borderRight: '1.5px solid var(--cyan)' },
        ].map((s, i) => (
          <span key={i} aria-hidden style={{
            position: 'absolute', width: 10, height: 10,
            pointerEvents: 'none', opacity: 0.85, ...s,
          }} />
        ))}

        {/* Status row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
          <span aria-hidden style={{
            width: 6, height: 6, borderRadius: '50%',
            background: 'var(--green)',
            boxShadow: '0 0 8px var(--green)',
            animation: 'hudPulse 1.8s ease-in-out infinite',
            flexShrink: 0,
          }} />
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 11,
            color: 'var(--green)', letterSpacing: 2, fontWeight: 700,
          }}>LIVE</span>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 11,
            color: 'var(--muted)', letterSpacing: 1.2, marginLeft: 'auto',
          }}>{visitor.updatedAt || 'NOW'}</span>
        </div>

        {/* Location headline */}
        <div style={{
          fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700,
          color: 'var(--text)', lineHeight: 1.2, letterSpacing: -0.2,
          marginBottom: 2, wordBreak: 'break-word',
        }}>
          {visitor.flag && visitor.flag !== '—' ? visitor.flag + ' ' : ''}{place}
        </div>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 11,
          color: 'var(--muted)', letterSpacing: 0.4, marginBottom: 8,
        }}>
          {maskIp(visitor.ip)}{visitor.ipType && visitor.ipType !== '—' ? ` · ${visitor.ipType}` : ''}
        </div>

        {/* Fact chips */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {chips.map(c => (
            <span key={c} style={{
              fontFamily: 'var(--font-mono)', fontSize: 11,
              color: 'var(--cyan)',
              background: 'color-mix(in srgb, var(--cyan) 10%, transparent)',
              border: '1px solid color-mix(in srgb, var(--cyan) 28%, transparent)',
              borderRadius: 3, padding: '2px 7px', letterSpacing: 0.3,
              whiteSpace: 'nowrap',
            }}>{c}</span>
          ))}
        </div>

        {/* Expanded details — hover / focus */}
        <div style={{
          display: 'grid',
          gridTemplateRows: open ? '1fr' : '0fr',
          transition: 'grid-template-rows 0.28s var(--ease-out, ease), opacity 0.22s ease',
          opacity: open ? 1 : 0,
          marginTop: open ? 9 : 0,
        }}>
          <div style={{ overflow: 'hidden' }}>
            <div style={{
              borderTop: '1px solid color-mix(in srgb, var(--cyan) 18%, transparent)',
              paddingTop: 8,
              display: 'grid', gridTemplateColumns: '64px minmax(0, 1fr)',
              columnGap: 8, rowGap: 3,
            }}>
              {details.map(([label, val]) => (
                <div key={label} style={{ display: 'contents' }}>
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: 11,
                    color: 'var(--muted)', letterSpacing: 1, lineHeight: 1.45,
                  }}>{label}</span>
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: 11,
                    color: 'var(--cyan)', fontWeight: 600, lineHeight: 1.45,
                    wordBreak: 'break-word',
                  }}>{val}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes hudPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.45; transform: scale(0.85); }
        }
        .globe-visitor-card:focus-visible {
          outline: 2px solid var(--green);
          outline-offset: 2px;
        }
        /* CSS Anchor Positioning — lock the HUD to the COBE visitor marker when
           the browser supports it; otherwise the shell stays bottom-left.
           !important beats the inline corner placement on the shell. */
        @supports (anchor-name: --cobe-visitor) {
          .globe-visitor-shell[data-anchored='true'] {
            position: absolute !important;
            position-anchor: --cobe-visitor;
            bottom: calc(anchor(top) + 10px) !important;
            left: anchor(center) !important;
            right: auto !important;
            top: auto !important;
            translate: -50% 0;
            opacity: var(--cobe-visible-visitor, 1);
            transition: opacity 0.3s ease;
            max-width: min(320px, calc(100% - 28px)) !important;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .globe-visitor-card span[style*="hudPulse"] { animation: none !important; }
        }
      `}</style>
    </div>
  )
}

// ── COBE-based globe — full v2 feature surface ───────────────────────────────
function rgbToArr(rgbStr, fallback = '0,212,255') {
  const p = String(rgbStr || fallback).split(',').map(Number)
  const n = p.length >= 3 ? p : fallback.split(',').map(Number)
  return [n[0] / 255, n[1] / 255, n[2] / 255]
}

function GlobeMode({ visibleRef }) {
  const canvasRef = useRef()
  const wrapRef   = useRef()
  const globeRef  = useRef(null)
  const [visitor, setVisitor] = useState(null)
  const visitorRef = useRef(null)
  const [visitorTrail, setVisitorTrail] = useState([])
  const visitorTrailRef = useRef([])
  const [themeKey, setThemeKey] = useState(0)
  const themeRef = useRef(null)
  const [focusCity, setFocusCity] = useState(null)
  const [selectedNode, setSelectedNode] = useState(null)
  const [anchorsOk] = useState(() => supportsCssAnchors())
  const [latencyMs, setLatencyMs] = useState(12)
  const [autoRotate, setAutoRotate] = useState(true)
  const autoRotateRef = useRef(true)
  const [packetsOn, setPacketsOn] = useState(true)
  const packetsOnRef = useRef(true)
  const [routeLog, setRouteLog] = useState([])
  const routeLogRef = useRef([])
  const routeSyncRef = useRef(0)
  const [fps, setFps] = useState(60)
  const fpsRef = useRef({ samples: 0, last: 0, avg: 60 })
  const [perfTier, setPerfTier] = useState(() => {
    const cores = navigator.hardwareConcurrency || 4
    const dpr = window.devicePixelRatio || 1
    const small = Math.min(window.innerWidth, window.innerHeight) < 700
    if (cores <= 4 || small || dpr > 2.2) return 'low'
    if (cores <= 6) return 'med'
    return 'high'
  })
  const perfTierRef = useRef(perfTier)
  useEffect(() => { perfTierRef.current = perfTier }, [perfTier])
  const [themeTone, setThemeTone] = useState('dark')
  const [monitor, setMonitor] = useState(null)
  const radarRef = useRef()
  const stateRef  = useRef({
    phi: 0.55,
    theta: 0.18,
    velPhi: 0.0022,
    velPhiDamp: 0,
    velThetaDamp: 0,
    drag: null,
    zoom: 1.0,
    pinch: null,
    focusAnim: null,
    packetT: 0,
  })

  useEffect(() => { visitorRef.current = visitor }, [visitor])
  useEffect(() => { visitorTrailRef.current = visitorTrail }, [visitorTrail])
  useEffect(() => { autoRotateRef.current = autoRotate }, [autoRotate])
  useEffect(() => { packetsOnRef.current = packetsOn }, [packetsOn])

  // ── Fetch visitor geo info ────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false

    const parseVisitor = d => {
      if (!d || d.success === false) throw new Error('bad response')
      if (d.status && d.status !== 'success') throw new Error('bad response')

      const latRaw = d.latitude ?? d.lat
      const lonRaw = d.longitude ?? d.lon
      const city = firstGeoValue(d.city)
      const region = firstGeoValue(d.region, d.regionName, d.stateProv)
      const country = firstGeoValue(d.country_name, d.country, d.countryName)
      const postal = firstGeoValue(d.postal, d.zip)
      const addressParts = [city, region, postal, country].filter(v => v && v !== '—')

      return {
        ip:          firstGeoValue(d.ip, d.query, d.ipAddress),
        ipType:      firstGeoValue(d.type, d.version),
        city,
        region,
        country,
        countryCode: firstGeoValue(d.country_code, d.countryCode),
        flag:        firstGeoValue(d.flag?.emoji, d.country_flag_emoji),
        postal,
        address:     addressParts.length ? addressParts.join(', ') : '—',
        org:         firstGeoValue(d.connection?.isp, d.isp, d.org),
        network:     firstGeoValue(d.network, d.connection?.domain, d.asname),
        asn:         firstGeoValue(d.connection?.asn, d.asn, d.as),
        lat:         latRaw != null ? (+latRaw).toFixed(4) : '—',
        lon:         lonRaw != null ? (+lonRaw).toFixed(4) : '—',
        tz:          firstGeoValue(d.timezone?.id, d.timezone),
        utc:         firstGeoValue(d.timezone?.utc, d.utc_offset),
        currency:    firstGeoValue(d.currency?.code, d.currency),
        updatedAt:   new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }
    }

    const fetchJson = async url => {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 6500)
      try {
        const res = await fetch(url, { signal: controller.signal })
        if (!res.ok) throw new Error('geo lookup failed')
        return await res.json()
      } finally {
        clearTimeout(timer)
      }
    }

    const loadVisitorGeo = async () => {
      const sources = [
        'https://ipapi.co/json/',
        'https://ipwhois.app/json/',
      ]

      for (const url of sources) {
        try {
          const parsed = parseVisitor(await fetchJson(url))
          if (!cancelled) {
            setVisitor(parsed)
            // Keep a short trail of prior visits (this session) for ghost markers.
            if (Number.isFinite(+parsed.lat) && parsed.lat !== '—') {
              setVisitorTrail(prev => {
                const next = [{ lat: +parsed.lat, lon: +parsed.lon, id: `v${Date.now()}` }, ...prev]
                return next.slice(0, 5)
              })
            }
          }
          return
        } catch {
          // Try the next public geo provider.
        }
      }

      try {
        const ipOnly = await fetchJson('https://api64.ipify.org?format=json')
        if (!cancelled) setVisitor({ ip: ipOnly.ip || '—', city: '—', region: '—', country: '—', address: '—' })
      } catch {
        // Leave the loading label in place if every lookup is unavailable.
      }
    }

    loadVisitorGeo()
    return () => { cancelled = true }
  }, [])

  // ── Live latency ticker (cosmetic telemetry) ──
  useEffect(() => {
    const id = setInterval(() => {
      setLatencyMs(9 + Math.floor(Math.random() * 9))
    }, 2800)
    return () => clearInterval(id)
  }, [])

  // ── Real traffic feed — pull live service status when available ──
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch('/api/monitor/status', { credentials: 'same-origin' })
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled && data && Array.isArray(data.services)) {
          const ups = data.services.filter(s => s.status === 'up')
          const latencies = ups.map(s => s.latency_avg_ms ?? s.latency_ms).filter(n => Number.isFinite(n))
          const avg = latencies.length
            ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
            : null
          setMonitor({
            overall: data.overall || 'unknown',
            up: ups.length,
            total: data.services.length,
            avgMs: avg,
            uptime: ups.length && data.services.length
              ? (ups.length / data.services.length * 100).toFixed(2)
              : null,
          })
          if (avg != null) setLatencyMs(avg)
        }
      } catch { /* offline or endpoint unavailable — keep ticker values */ }
    }
    load()
    const id = setInterval(load, 45000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  // ── React to theme changes ──
  useEffect(() => {
    themeRef.current = readGlobeTheme()
    setThemeTone(themeRef.current.isLight ? 'light' : 'dark')
    const el = document.documentElement
    const obs = new MutationObserver(() => {
      themeRef.current = readGlobeTheme()
      setThemeTone(themeRef.current.isLight ? 'light' : 'dark')
      setThemeKey(k => k + 1)
    })
    obs.observe(el, { attributes: true, attributeFilter: ['data-theme', 'style'] })
    return () => obs.disconnect()
  }, [])

  // ── Mini radar — draw node azimuths on a tiny canvas ──
  useEffect(() => {
    const cv = radarRef.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    let raf = 0
    let sweep = 0
    const draw = () => {
      raf = requestAnimationFrame(draw)
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = 64, h = 64
      if (cv.width !== w * dpr) { cv.width = w * dpr; cv.height = h * dpr }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      const cx = w / 2, cy = h / 2, r = 26

      // Rings
      ctx.strokeStyle = 'rgba(0,212,255,0.18)'
      ctx.lineWidth = 1
      for (const rr of [r * 0.33, r * 0.66, r]) {
        ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.stroke()
      }
      // Crosshair
      ctx.beginPath()
      ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy)
      ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r)
      ctx.stroke()

      // Sweep
      sweep = (sweep + 0.025) % (Math.PI * 2)
      const grad = ctx.createConicGradient
        ? ctx.createConicGradient(sweep, cx, cy)
        : null
      if (grad) {
        grad.addColorStop(0, 'rgba(0,255,136,0.35)')
        grad.addColorStop(0.12, 'rgba(0,255,136,0)')
        grad.addColorStop(1, 'rgba(0,255,136,0)')
        ctx.fillStyle = grad
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill()
      }
      // Sweep line
      ctx.strokeStyle = 'rgba(0,255,136,0.55)'
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(cx + Math.cos(sweep) * r, cy + Math.sin(sweep) * r)
      ctx.stroke()

      // Node blips (azimuth from longitude, radius from |latitude|)
      const s = stateRef.current
      GLOBE_CITIES.forEach(c => {
        const az = (c.lng / 180) * Math.PI + s.phi
        const rad = (Math.abs(c.lat) / 90) * r * 0.92
        const x = cx + Math.cos(az) * rad
        const y = cy + Math.sin(az) * rad * 0.7
        const d = Math.hypot(x - cx, y - cy)
        if (d > r) return
        ctx.fillStyle = c.hub ? '#00ff88' : '#00d4ff'
        ctx.globalAlpha = c.hub ? 0.95 : 0.7
        ctx.beginPath(); ctx.arc(x, y, c.hub ? 2.4 : 1.5, 0, Math.PI * 2); ctx.fill()
        ctx.globalAlpha = 1
      })
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [])

  // ── Export node map as PNG ──
  const exportPng = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    try {
      const url = canvas.toDataURL('image/png')
      const a = document.createElement('a')
      a.href = url
      a.download = `globe-network-${new Date().toISOString().slice(0, 10)}.png`
      document.body.appendChild(a)
      a.click()
      a.remove()
    } catch { /* tainted canvas or unsupported */ }
  }

  // ── Recenter / reset view (chip + double-click) ──
  const recenterGlobe = () => {
    const s = stateRef.current
    s.focusAnim = { fromPhi: s.phi, fromTheta: s.theta, toPhi: 0.55, toTheta: 0.18, t0: 0, dur: 700 }
    s.zoom = 1
    s.velPhi = 0.0022
    s.velPhiDamp = 0
    setFocusCity(null)
    setSelectedNode(null)
  }

  // ── Animate to a city (focus recipe) ──
  const focusOnCity = (city) => {
    const s = stateRef.current
    const { phi, theta } = cityToAngles(city.lat, city.lng)
    // Shortest angular path for phi
    let toPhi = phi
    while (toPhi - s.phi > Math.PI) toPhi -= Math.PI * 2
    while (s.phi - toPhi > Math.PI) toPhi += Math.PI * 2
    s.focusAnim = {
      fromPhi: s.phi, fromTheta: s.theta,
      toPhi, toTheta: theta,
      t0: 0, // stamped on the first rAF tick
      dur: 900,
    }
    s.velPhi = 0
    s.velPhiDamp = 0
    setFocusCity(city.id)
    setSelectedNode(city)
  }

  // ── COBE globe instance (recreated on theme / visitor / resize / trail) ──
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || typeof createGlobe !== 'function') return
    if (!themeRef.current) themeRef.current = readGlobeTheme()

    const theme = themeRef.current
    const v = visitorRef.current
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    // COBE multiplies width/height by devicePixelRatio internally — pass CSS pixels.
    const rect = canvas.getBoundingClientRect()
    const width = Math.max(240, Math.floor(rect.width || wrapRef.current?.clientWidth || 480))
    const height = Math.max(240, Math.floor(rect.height || wrapRef.current?.clientHeight || 360))

    const cyan   = rgbToArr(theme.cyanRgb,  '0,212,255')
    const green  = rgbToArr(theme.greenRgb, '0,255,136')
    const orange = rgbToArr(theme.orangeRgb, '255,107,53')
    const bg     = rgbToArr(theme.bgRgb, '0,12,28')

    // Bindable markers — every city gets an id for CSS anchors + labels.
    // Keep nodes small and crisp; hub is only slightly larger.
    const markers = GLOBE_CITIES.map(c => ({
      id: c.id,
      location: [c.lat, c.lng],
      size: c.hub ? 0.072 : 0.038,
      color: c.hub ? green : cyan,
    }))

    // Ghost trail markers (prior visitor fixes this session)
    visitorTrailRef.current.forEach((t, i) => {
      markers.push({
        id: `trail-${i}`,
        location: [t.lat, t.lon],
        size: Math.max(0.014, 0.028 - i * 0.004),
        color: [orange[0] * 0.5, orange[1] * 0.5, orange[2] * 0.5],
      })
    })

    // Bindable arcs — per-route color, id for arc labels.
    // Non-hub routes use a dimmer cyan so the network reads as hierarchy, not spaghetti.
    const dimCyan = [cyan[0] * 0.55, cyan[1] * 0.55, cyan[2] * 0.55]
    const arcs = GLOBE_CONNECTIONS.map((e) => {
      const a = GLOBE_CITIES[e.from]
      const b = GLOBE_CITIES[e.to]
      return {
        id: `${a.id}-${b.id}`,
        from: [a.lat, a.lng],
        to:   [b.lat, b.lng],
        color: e.hub ? green : dimCyan,
      }
    })

    // Visitor marker + arc from the Riyadh hub (bindable via CSS anchors)
    const hasVisitor = v && Number.isFinite(+v.lat) && Number.isFinite(+v.lon) && v.lat !== '—'
    if (hasVisitor) {
      markers.push({
        location: [+v.lat, +v.lon],
        size: 0.085,
        color: orange,
        id: 'visitor',
      })
      const hub = GLOBE_CITIES.find(c => c.hub) || GLOBE_CITIES[9]
      arcs.push({
        id: 'visitor',
        from: [hub.lat, hub.lng],
        to:   [+v.lat, +v.lon],
        color: orange,
      })
    }

    // COBE maps a world-dot texture against baseColor — blend the theme's cyan
    // and green into the earth so land dots recolor with the active palette.
    // Near-black baseColor makes continents disappear; pure bg makes them grey.
    const mix = (a, b, t) => a + (b - a) * t
    const baseColor = theme.isLight
      ? [
          mix(0.62, cyan[0], 0.22),
          mix(0.68, cyan[1], 0.22),
          mix(0.74, green[2], 0.18),
        ]
      : [
          Math.max(0.12, mix(bg[0] * 0.4 + 0.1, cyan[0], 0.28)),
          Math.max(0.18, mix(bg[1] * 0.4 + 0.16, green[1], 0.22)),
          Math.max(0.24, mix(bg[2] * 0.4 + 0.2, cyan[2], 0.3)),
        ]

    const mapSamples = perfTier === 'low' ? 8000 : perfTier === 'med' ? 12000 : 16000

    const globe = createGlobe(canvas, {
      devicePixelRatio: dpr,
      width,
      height,
      phi: stateRef.current.phi,
      theta: stateRef.current.theta,
      dark: theme.isLight ? 0 : 1,
      diffuse: 1.15,
      scale: stateRef.current.zoom * 0.92,
      opacity: 1,
      mapSamples,
      mapBrightness: theme.isLight ? 4.2 : 5.6,
      mapBaseBrightness: 0.04,
      baseColor,
      markerColor: cyan,
      // Atmospheric glow follows the theme accent, not a fixed slate
      glowColor: theme.isLight
        ? [mix(0.55, cyan[0], 0.35), mix(0.65, cyan[1], 0.35), mix(0.75, green[2], 0.3)]
        : [mix(0.12, cyan[0], 0.45), mix(0.3, green[1], 0.35), mix(0.4, cyan[2], 0.5)],
      offset: [0, 0],
      markers,
      arcs,
      arcColor: green,
      arcWidth: 0.28,
      arcHeight: 0.18,
      markerElevation: 0.012,
      context: { antialias: true, alpha: true, powerPreference: 'default' },
    })

    globeRef.current = globe

    // Flight packets — great-circle interp along hub routes, live-updated markers.
    // Two directions per route: req (client→hub, orange/cyan) and res (hub→client, green).
    const baseMarkers = markers
    const scratchPackets = []
    const hubRoutes = GLOBE_CONNECTIONS.filter(e => e.hub).map(e => ({
      from: GLOBE_CITIES[e.from],
      to:   GLOBE_CITIES[e.to],
    }))
    // Always include visitor→hub as the primary realtime client route when available.
    const clientRoutes = []
    if (hasVisitor) {
      const hub = GLOBE_CITIES.find(c => c.hub) || GLOBE_CITIES[9]
      clientRoutes.push({
        from: { id: 'visitor', name: visitor?.city || 'CLIENT', lat: +v.lat, lng: +v.lon },
        to:   hub,
        client: true,
      })
    }
    const allRoutes = [...clientRoutes, ...hubRoutes]
    const packetCount = perfTier === 'low' ? 4 : 8
    const REQ_KINDS = ['GET /api', 'POST /auth', 'WS SYNC', 'GET /cdn', 'RPC CALL', 'GET /status']
    const packetSeeds = Array.from({ length: packetCount }, (_, i) => ({
      route: i % Math.max(1, allRoutes.length),
      t: (i / packetCount),
      speed: 0.0016 + (i % 3) * 0.0006,
      // Alternate request (toward hub) and response (away from hub)
      dir: i % 2 === 0 ? 1 : -1,
      kind: REQ_KINDS[i % REQ_KINDS.length],
      logged: false,
    }))

    // COBE v2 has no onRender — drive phi/theta/scale via globe.update() each frame.
    // Pause when the panel is off-screen (visibleRef) to save GPU.
    let raf = 0
    const frame = (now) => {
      raf = requestAnimationFrame(frame)
      if (visibleRef && visibleRef.current === false) return

      // ── FPS guard: rolling average, auto-downgrade quality if we drop ──
      const fr = fpsRef.current
      if (fr.last) {
        const dt = now - fr.last
        if (dt > 0 && dt < 200) {
          fr.samples = Math.min(60, fr.samples + 1)
          const inst = 1000 / dt
          fr.avg += (inst - fr.avg) * 0.08
        }
      }
      fr.last = now
      if (fr.samples === 30 || fr.samples === 60) {
        const rounded = Math.round(fr.avg)
        setFps(rounded)
        // Sustained < 40fps → step down a tier (high → med → low)
        if (rounded < 40 && perfTierRef.current === 'high') setPerfTier('med')
        else if (rounded < 28 && perfTierRef.current === 'med') setPerfTier('low')
      }

      const s = stateRef.current

      // Focus animation (ease-out cubic)
      if (s.focusAnim) {
        const fa = s.focusAnim
        if (!fa.t0) fa.t0 = now
        const t = Math.min(1, (now - fa.t0) / fa.dur)
        const e = 1 - Math.pow(1 - t, 3)
        s.phi = fa.fromPhi + (fa.toPhi - fa.fromPhi) * e
        s.theta = fa.fromTheta + (fa.toTheta - fa.fromTheta) * e
        if (t >= 1) {
          s.focusAnim = null
          s.velPhi = 0.0012
        }
      } else if (!s.drag) {
        if (autoRotateRef.current) s.phi += s.velPhi
        // Gentle theta settle toward current tilt target
        if (Math.abs(s.velThetaDamp) > 0.0001) {
          s.theta = Math.max(-1.1, Math.min(1.1, s.theta + s.velThetaDamp))
          s.velThetaDamp *= 0.92
        }
      }

      // Advance flight packets along great circles (client ⇄ server realtime routing).
      // Reuse scratch slot objects to avoid allocating a new markers list every frame.
      let nextMarkers = baseMarkers
      if (packetsOnRef.current && allRoutes.length) {
        packetSeeds.forEach((p, i) => {
          p.t += p.speed
          if (p.t > 1) {
            p.t -= 1
            // Log a completed hop to the live routing ticker
            const r = allRoutes[p.route]
            const fromName = p.dir === 1 ? r.from.name : r.to.name
            const toName   = p.dir === 1 ? r.to.name : r.from.name
            const entry = {
              id: `${i}-${Date.now()}`,
              kind: p.dir === 1 ? p.kind : '200 OK',
              from: fromName,
              to: toName,
              dir: p.dir,
              ms: 8 + Math.floor(Math.random() * 40),
            }
            routeLogRef.current = [entry, ...routeLogRef.current].slice(0, 6)
            // Throttle React state sync — the rAF loop owns the log; UI polls it
            if (now - routeSyncRef.current > 400) {
              routeSyncRef.current = now
              setRouteLog(routeLogRef.current)
            }
          }
          const r = allRoutes[p.route]
          // dir 1 = toward hub (request), -1 = away from hub (response)
          const a = p.dir === 1 ? r.from : r.to
          const b = p.dir === 1 ? r.to : r.from
          const lat = a.lat + (b.lat - a.lat) * p.t
          const lng = a.lng + (b.lng - a.lng) * p.t
          // Requests glow orange/cyan; responses glow green
          const color = p.dir === 1
            ? (r.client ? orange : cyan)
            : green
          const slot = scratchPackets[i] || (scratchPackets[i] = { id: `pkt-${i}`, location: [0, 0], size: 0.02, color: green })
          slot.location[0] = lat
          slot.location[1] = lng
          slot.size = r.client && p.dir === 1 ? 0.032 : 0.022
          slot.color = color
        })
        nextMarkers = baseMarkers.concat(scratchPackets.slice(0, packetSeeds.length))
      }

      try {
        globe.update({
          phi: s.phi,
          theta: s.theta,
          scale: s.zoom * 0.92,
          opacity: 1,
          markers: nextMarkers,
        })
      } catch { /* globe destroyed */ }
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      try { globe.destroy() } catch { /* already torn down */ }
      globeRef.current = null
    }
  }, [themeKey, visitor, perfTier])

  // ── ResizeObserver — resize the live globe (no full recreate) ──
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap || typeof ResizeObserver === 'undefined') return
    let t = 0
    let lastW = 0, lastH = 0
    const ro = new ResizeObserver(entries => {
      const r = entries[0]?.contentRect
      if (!r) return
      if (Math.abs(r.width - lastW) < 24 && Math.abs(r.height - lastH) < 24) return
      lastW = r.width; lastH = r.height
      clearTimeout(t)
      t = setTimeout(() => {
        const width = Math.max(240, Math.floor(r.width || wrap.clientWidth || 480))
        const height = Math.max(240, Math.floor(r.height || wrap.clientHeight || 360))
        const g = globeRef.current
        if (g) {
          try {
            // COBE accepts width/height updates without tearing down WebGL
            g.update({ width, height })
            return
          } catch { /* fall through to recreate */ }
        }
        setThemeKey(k => k + 1)
      }, 220)
    })
    ro.observe(wrap)
    return () => { clearTimeout(t); ro.disconnect() }
  }, [])

  // ── Pointer + keyboard (drag-rotate XYZ, pinch/wheel zoom, arrows) ──
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const s = stateRef.current

    const getXY = e => {
      const r = canvas.getBoundingClientRect()
      const src = e.touches ? e.touches[0] : e
      return { x: src.clientX - r.left, y: src.clientY - r.top }
    }

    const onDown = e => {
      const { x, y } = getXY(e)
      s.drag = { startX: x, startY: y, lastX: x, lastY: y, lastPhi: s.phi, lastTheta: s.theta }
      s.velPhiDamp = 0
      s.velThetaDamp = 0
      s.focusAnim = null
      canvas.style.cursor = 'grabbing'
    }
    const onMove = e => {
      if (e.touches && e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX
        const dy = e.touches[0].clientY - e.touches[1].clientY
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (!s.pinch) s.pinch = { dist0: dist, zoom0: s.zoom }
        else s.zoom = clampGlobeZoom(s.pinch.zoom0 * (dist / s.pinch.dist0))
        return
      }
      s.pinch = null
      const { x, y } = getXY(e)
      if (s.drag) {
        const dx = x - s.drag.lastX
        const dy = y - s.drag.lastY
        s.velPhiDamp = dx * 0.002
        s.phi = s.drag.lastPhi + (x - s.drag.startX) * 0.006
        s.theta = Math.max(-1.1, Math.min(1.1,
          s.drag.lastTheta + (y - s.drag.startY) * 0.004
        ))
        s.velThetaDamp = dy * 0.0015
        s.drag.lastX = x
        s.drag.lastY = y
      }
    }
    const onUp = () => {
      if (s.drag) {
        s.velPhi = Math.max(0.0004, Math.min(0.006, Math.abs(s.velPhiDamp))) * Math.sign(s.velPhiDamp || 1)
      }
      s.drag = null
      canvas.style.cursor = 'grab'
    }

    const onWheel = e => {
      e.preventDefault()
      s.zoom = clampGlobeZoom(s.zoom - e.deltaY * 0.0008)
    }

    const onKey = e => {
      const step = e.shiftKey ? 0.12 : 0.05
      if (e.key === 'ArrowLeft')  { s.phi -= step; s.focusAnim = null; e.preventDefault() }
      if (e.key === 'ArrowRight') { s.phi += step; s.focusAnim = null; e.preventDefault() }
      if (e.key === 'ArrowUp')    { s.theta = Math.min(1.1, s.theta + step); s.focusAnim = null; e.preventDefault() }
      if (e.key === 'ArrowDown')  { s.theta = Math.max(-1.1, s.theta - step); s.focusAnim = null; e.preventDefault() }
      if (e.key === '+' || e.key === '=') { s.zoom = clampGlobeZoom(s.zoom + 0.08) }
      if (e.key === '-' || e.key === '_') { s.zoom = clampGlobeZoom(s.zoom - 0.08) }
    }

    canvas.addEventListener('mousedown',  onDown)
    canvas.addEventListener('touchstart', onDown, { passive: true })
    window.addEventListener('mousemove',  onMove)
    window.addEventListener('touchmove',  onMove, { passive: true })
    window.addEventListener('mouseup',    onUp)
    window.addEventListener('touchend',   onUp)
    canvas.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('keydown', onKey)
    canvas.style.cursor = 'grab'
    canvas.tabIndex = 0
    canvas.setAttribute('role', 'application')
    canvas.setAttribute('aria-label', 'Interactive global network globe. Drag to rotate, scroll to zoom, arrow keys to pan.')

    return () => {
      canvas.removeEventListener('mousedown',  onDown)
      canvas.removeEventListener('touchstart', onDown)
      window.removeEventListener('mousemove',  onMove)
      window.removeEventListener('touchmove',  onMove)
      window.removeEventListener('mouseup',    onUp)
      window.removeEventListener('touchend',   onUp)
      canvas.removeEventListener('wheel',      onWheel)
      window.removeEventListener('keydown',    onKey)
    }
  }, [])

  const hasVisitorCoords = visitor && Number.isFinite(+visitor.lat) && visitor.lat !== '—'
  const arcCount = GLOBE_CONNECTIONS.length + (hasVisitorCoords ? 1 : 0)
  const nodeCount = GLOBE_CITIES.length + (hasVisitorCoords ? 1 : 0)
  const hubLinks = GLOBE_CONNECTIONS.filter(e => e.hub).length

  return (
    <div
      className="globe-network-shell"
      ref={wrapRef}
      data-globe-tone={themeTone}
      onDoubleClick={recenterGlobe}
      style={{
        width: '100%', height: '100%',
        position: 'relative', overflow: 'hidden',
        background: 'transparent',
      }}
    >
      {/* Top chrome — single flex row: title · controls · stats (collision-proof) */}
      <div className="globe-top-bar">
        <div className="globe-network-title" title="GLOBAL NETWORK · LIVE CONNECTION MAP">
          GLOBAL NETWORK · LIVE CONNECTION MAP
        </div>

        <div className="globe-mode-chips" role="toolbar" aria-label="Globe display controls">
          <button
            type="button"
            className={`globe-mode-chip${autoRotate ? ' is-on' : ''}`}
            onClick={() => setAutoRotate(v => !v)}
            aria-pressed={autoRotate}
            title={autoRotate ? 'Pause auto-rotate' : 'Resume auto-rotate'}
          >
            <span className="globe-mode-chip-dot" aria-hidden />
            {autoRotate ? 'AUTO' : 'LOCK'}
          </button>
          <button
            type="button"
            className={`globe-mode-chip${packetsOn ? ' is-on' : ''}`}
            onClick={() => setPacketsOn(v => !v)}
            aria-pressed={packetsOn}
            title={packetsOn ? 'Hide flight packets' : 'Show flight packets'}
          >
            <span className="globe-mode-chip-dot" aria-hidden />
            {packetsOn ? 'PKT' : 'OFF'}
          </button>
          <button
            type="button"
            className="globe-mode-chip"
            onClick={exportPng}
            title="Export node map as PNG"
          >
            <span className="globe-mode-chip-dot" aria-hidden />
            PNG
          </button>
          <button
            type="button"
            className="globe-mode-chip"
            onClick={recenterGlobe}
            title="Recenter globe (or double-click)"
          >
            <span className="globe-mode-chip-dot" aria-hidden />
            RECON
          </button>
        </div>

        <div className="globe-network-stats">
          {[
            { label: 'NODES',   value: `${nodeCount}`,   color: 'var(--cyan)'  },
            { label: 'ARCS',    value: `${arcCount}`,    color: 'var(--green)' },
            { label: 'LATENCY', value: `${latencyMs}ms`, color: 'var(--cyan)'  },
            { label: 'UPTIME',  value: monitor?.uptime ? `${monitor.uptime}%` : '99.99%', color: 'var(--green)' },
            { label: 'FPS',     value: `${fps}`,         color: fps < 30 ? 'var(--orange)' : 'var(--cyan)' },
          ].map(s => (
            <div key={s.label} className="globe-stat-row">
              <span className="globe-stat-label">{s.label}</span>
              <span className="globe-stat-value" style={{ color: s.color }}>{s.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Mini radar inset — node azimuths + sweep */}
      <div className="globe-radar" title="Node radar">
        <canvas ref={radarRef} width={64} height={64} aria-hidden />
        <div className="globe-radar-label">
          {monitor ? `${monitor.up}/${monitor.total} UP` : 'RADAR'}
        </div>
      </div>

      {/* Satellites ring — decorative orbiting edge nodes */}
      <div className="globe-sat-ring" aria-hidden>
        <span className="globe-sat s1" />
        <span className="globe-sat s2" />
        <span className="globe-sat s3" />
      </div>

      {/* COBE canvas — fills entire panel */}
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />

      {/* Hub live-badge pulse ring — anchored to Riyadh when CSS anchors exist */}
      {anchorsOk && (
        <div
          className="globe-hub-ring"
          style={{
            positionAnchor: '--cobe-ruh',
            opacity: 'var(--cobe-visible-ruh, 0)',
          }}
          aria-hidden
        />
      )}

      {/* Bindable city labels — CSS Anchor Positioning (Chrome 125+) */}
      {anchorsOk && (
        <div className="globe-label-layer" aria-hidden={false}>
          {GLOBE_CITIES.map(c => (
            <div
              key={c.id}
              className={`globe-city-label${c.hub ? ' is-hub' : ''}${focusCity === c.id ? ' is-focus' : ''}`}
              style={{
                positionAnchor: `--cobe-${c.id}`,
                opacity: `var(--cobe-visible-${c.id}, 0)`,
                filter: `blur(calc((1 - var(--cobe-visible-${c.id}, 0)) * 4px))`,
              }}
              onClick={() => focusOnCity(c)}
              role="button"
              tabIndex={-1}
            >
              {c.name}
              {c.hub && <span className="globe-city-hub-dot" />}
            </div>
          ))}

          {/* Hub-route arc labels */}
          {GLOBE_CONNECTIONS.filter(e => e.hub).map(e => {
            const a = GLOBE_CITIES[e.from]
            const b = GLOBE_CITIES[e.to]
            const id = `${a.id}-${b.id}`
            return (
              <div
                key={id}
                className="globe-arc-label"
                style={{
                  positionAnchor: `--cobe-arc-${id}`,
                  opacity: `var(--cobe-visible-arc-${id}, 0)`,
                  filter: `blur(calc((1 - var(--cobe-visible-arc-${id}, 0)) * 3px))`,
                }}
              >
                {a.id.toUpperCase()} → {b.id.toUpperCase()}
              </div>
            )
          })}
        </div>
      )}

      {/* City chip rail — works without CSS anchors; click to focus */}
      <div className="globe-city-rail" role="toolbar" aria-label="Focus a network node">
        {GLOBE_CITIES.filter(c => c.hub || ['nyc', 'lon', 'tyo', 'sin', 'dxb'].includes(c.id)).map(c => (
          <button
            key={c.id}
            type="button"
            className={`globe-city-chip${focusCity === c.id ? ' is-focus' : ''}${c.hub ? ' is-hub' : ''}`}
            onClick={() => focusOnCity(c)}
            title={`Focus ${c.name}`}
          >
            {c.hub && <span className="globe-city-hub-dot" />}
            {c.name}
          </button>
        ))}
      </div>

      {/* Node detail side panel */}
      {selectedNode && (
        <aside
          className="globe-node-panel"
          role="dialog"
          aria-label={`${selectedNode.name} node details`}
        >
          <header className="globe-node-panel-head">
            <div>
              <div className="globe-node-panel-title">
                {selectedNode.hub && <span className="globe-city-hub-dot" />}
                {selectedNode.name}
              </div>
              <div className="globe-node-panel-sub">
                {selectedNode.region} · {selectedNode.hub ? 'CORE HUB' : 'EDGE NODE'}
              </div>
            </div>
            <button
              type="button"
              className="globe-node-panel-close"
              onClick={() => { setSelectedNode(null); setFocusCity(null) }}
              aria-label="Close node details"
            >
              ✕
            </button>
          </header>

          <div className="globe-node-panel-grid">
            {[
              ['STATUS',   'ONLINE',           'ok'],
              ['LATENCY',  `${8 + (selectedNode.name.length * 3) % 22}ms`, 'ok'],
              ['LINKS',    `${GLOBE_CONNECTIONS.filter(e =>
                GLOBE_CITIES[e.from].id === selectedNode.id || GLOBE_CITIES[e.to].id === selectedNode.id
              ).length}`, 'ok'],
              ['LOAD',     `${28 + (selectedNode.name.charCodeAt(0) % 40)}%`, 'warn'],
              ['ROLE',     selectedNode.hub ? 'TRANSIT' : 'PEER', 'ok'],
              ['PROTO',    'COBE/QUIC',        'ok'],
            ].map(([label, val, tone]) => (
              <div key={label} className="globe-node-panel-row">
                <span>{label}</span>
                <strong data-tone={tone}>{val}</strong>
              </div>
            ))}
          </div>

          <div className="globe-node-panel-spark" aria-hidden>
            {Array.from({ length: 14 }, (_, i) => (
              <i key={i} style={{ height: `${28 + ((i * 17 + selectedNode.name.length * 5) % 52)}%` }} />
            ))}
          </div>
          <div className="globe-node-panel-foot">THROUGHPUT · LAST 60s</div>
        </aside>
      )}

      {/* Live routing ticker — client ⇄ server hops */}
      {routeLog.length > 0 && (
        <div className="globe-route-log" role="log" aria-live="polite" aria-label="Live routing hops">
          {routeLog.map((e, i) => (
            <div key={e.id} className="globe-route-log-row" style={{ opacity: 1 - i * 0.14 }}>
              <span className="globe-route-log-dir" data-dir={e.dir === 1 ? 'up' : 'down'}>
                {e.dir === 1 ? '▲' : '▼'}
              </span>
              <span className="globe-route-log-kind" data-dir={e.dir === 1 ? 'up' : 'down'}>{e.kind}</span>
              <span className="globe-route-log-path">
                {e.from} → {e.to}
              </span>
              <span className="globe-route-log-ms">{e.ms}ms</span>
            </div>
          ))}
        </div>
      )}

      {/* Visitor HUD — bottom-left (anchored to marker when CSS anchor positioning is available) */}
      <VisitorHud visitor={visitor} />

      <style>{`
        .globe-label-layer {
          position: absolute; inset: 0;
          pointer-events: none;
          z-index: 2;
        }
        .globe-city-label {
          position: absolute;
          bottom: anchor(top);
          left: anchor(center);
          translate: -50% 0;
          margin-bottom: 6px;
          font-family: var(--font-mono);
          font-size: 10px;
          letter-spacing: 1.5px;
          color: var(--cyan);
          white-space: nowrap;
          pointer-events: auto;
          cursor: pointer;
          padding: 2px 6px;
          border-radius: 3px;
          background: color-mix(in srgb, var(--bg) 55%, transparent);
          border: 1px solid color-mix(in srgb, var(--cyan) 18%, transparent);
          transition: opacity 0.35s ease, filter 0.35s ease, transform 0.2s ease, color 0.2s ease;
          user-select: none;
        }
        .globe-city-label:hover,
        .globe-city-label.is-focus {
          color: var(--green);
          border-color: color-mix(in srgb, var(--green) 45%, transparent);
          transform: translate(-50%, -2px) scale(1.06);
        }
        .globe-city-label.is-hub {
          color: var(--green);
          border-color: color-mix(in srgb, var(--green) 35%, transparent);
          font-weight: 700;
        }
        .globe-city-hub-dot {
          display: inline-block;
          width: 4px; height: 4px;
          border-radius: 50%;
          background: var(--green);
          box-shadow: 0 0 5px var(--green);
          margin-right: 4px;
          vertical-align: middle;
          animation: hudPulse 2s ease-in-out infinite;
          flex-shrink: 0;
        }
        .globe-hub-ring {
          position: absolute;
          position-anchor: --cobe-ruh;
          top: anchor(center);
          left: anchor(center);
          translate: -50% -50%;
          width: 18px; height: 18px;
          border-radius: 50%;
          border: 1.25px solid var(--green);
          box-shadow: 0 0 10px color-mix(in srgb, var(--green) 45%, transparent);
          pointer-events: none;
          z-index: 2;
          animation: hubRing 2.2s ease-out infinite;
        }
        @keyframes hubRing {
          0%   { transform: translate(-50%,-50%) scale(0.75); opacity: 0.9; }
          70%  { transform: translate(-50%,-50%) scale(1.55); opacity: 0; }
          100% { transform: translate(-50%,-50%) scale(0.75); opacity: 0; }
        }
        .globe-arc-label {
          position: absolute;
          bottom: anchor(top);
          left: anchor(center);
          translate: -50% 0;
          font-family: var(--font-mono);
          font-size: 9px;
          letter-spacing: 1.2px;
          color: var(--green);
          opacity: 0.7;
          white-space: nowrap;
          pointer-events: none;
          text-shadow: 0 0 8px color-mix(in srgb, var(--green) 40%, transparent);
          transition: opacity 0.35s ease;
        }
        /* ── Top chrome: flex row, title | controls | stats ── */
        .globe-top-bar {
          position: absolute;
          top: 0; left: 0; right: 0;
          z-index: 5;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          pointer-events: none;
        }
        .globe-top-bar > * { pointer-events: auto; }
        .globe-top-bar .globe-network-title {
          flex: 1 1 auto;
          min-width: 0;
          font-family: var(--font-mono);
          font-size: 11px;
          letter-spacing: 2.5px;
          color: var(--cyan);
          opacity: 0.62;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          pointer-events: none;
          text-shadow: 0 0 10px rgba(0,212,255,0.18);
        }
        .globe-top-bar .globe-mode-chips {
          position: static;
          display: flex;
          gap: 6px;
          flex: 0 0 auto;
        }
        .globe-top-bar .globe-network-stats {
          flex: 0 0 auto;
          display: flex;
          flex-direction: column;
          gap: 3px;
          align-items: flex-end;
          padding: 6px 8px;
          border-radius: 6px;
          background: rgba(0,0,0,0.08);
          border: 1px solid rgba(0,212,255,0.08);
          backdrop-filter: blur(6px);
          -webkit-backdrop-filter: blur(6px);
          pointer-events: none;
        }
        .globe-stat-row {
          display: flex;
          gap: 10px;
          align-items: center;
        }
        .globe-stat-label {
          font-family: var(--font-mono);
          font-size: 10px;
          color: var(--muted);
          letter-spacing: 2px;
        }
        .globe-stat-value {
          font-family: var(--font-mono);
          font-size: 11px;
          font-weight: 700;
        }
        .globe-mode-chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          height: 26px;
          padding: 0 10px;
          font-family: var(--font-mono);
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 1.6px;
          color: var(--muted);
          background: color-mix(in srgb, var(--bg) 62%, transparent);
          border: 1px solid color-mix(in srgb, var(--border) 55%, transparent);
          border-radius: 4px;
          cursor: pointer;
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          transition: color 0.18s ease, border-color 0.18s ease, background 0.18s ease, transform 0.12s ease;
          user-select: none;
          line-height: 1;
          flex-shrink: 0;
        }
        .globe-mode-chip-dot {
          width: 5px; height: 5px;
          border-radius: 50%;
          background: var(--muted);
          opacity: 0.55;
          transition: background 0.18s ease, box-shadow 0.18s ease, opacity 0.18s ease;
          flex-shrink: 0;
        }
        .globe-mode-chip.is-on {
          color: var(--green);
          border-color: color-mix(in srgb, var(--green) 38%, transparent);
          background: color-mix(in srgb, var(--green) 8%, color-mix(in srgb, var(--bg) 70%, transparent));
        }
        .globe-mode-chip.is-on .globe-mode-chip-dot {
          background: var(--green);
          opacity: 1;
          box-shadow: 0 0 6px var(--green);
        }
        .globe-mode-chip:hover {
          color: var(--cyan);
          border-color: color-mix(in srgb, var(--cyan) 40%, transparent);
          transform: translateY(-1px);
        }
        .globe-mode-chip:focus-visible {
          outline: 2px solid var(--cyan);
          outline-offset: 2px;
        }
        .globe-mode-chip:active {
          transform: translateY(0);
        }
        /* Mini radar inset */
        .globe-radar {
          position: absolute;
          left: 16px; top: 72px;
          z-index: 4;
          width: 64px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          pointer-events: none;
          opacity: 0.9;
        }
        .globe-radar canvas {
          display: block;
          width: 64px; height: 64px;
          border-radius: 50%;
          border: 1px solid color-mix(in srgb, var(--cyan) 22%, transparent);
          background: color-mix(in srgb, var(--bg) 55%, transparent);
          backdrop-filter: blur(4px);
          -webkit-backdrop-filter: blur(4px);
        }
        .globe-radar-label {
          font-family: var(--font-mono);
          font-size: 9px;
          letter-spacing: 1.2px;
          color: var(--muted);
          white-space: nowrap;
        }
        .globe-network-shell[data-globe-tone="light"] .globe-radar canvas {
          background: color-mix(in srgb, var(--bg2, #fff) 70%, transparent);
          border-color: color-mix(in srgb, var(--cyan) 28%, transparent);
        }
        .globe-sat-ring {
          position: absolute;
          inset: 12% 18%;
          pointer-events: none;
          z-index: 1;
          animation: satSpin 48s linear infinite;
        }
        .globe-sat {
          position: absolute;
          width: 4px; height: 4px;
          border-radius: 50%;
          background: var(--cyan);
          box-shadow: 0 0 8px var(--cyan);
          opacity: 0.55;
        }
        .globe-sat.s1 { top: 0; left: 50%; }
        .globe-sat.s2 { top: 50%; right: 0; }
        .globe-sat.s3 { bottom: 0; left: 28%; }
        @keyframes satSpin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        .globe-city-rail {
          position: absolute;
          left: 14px; right: 14px; bottom: 10px;
          z-index: 3;
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          pointer-events: none;
        }
        @supports (anchor-name: --x) {
          .globe-city-rail { display: none; }
        }
        .globe-city-chip {
          pointer-events: auto;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          height: 24px;
          padding: 0 8px;
          font-family: var(--font-mono);
          font-size: 10px;
          font-weight: 500;
          letter-spacing: 1.2px;
          color: var(--muted);
          background: color-mix(in srgb, var(--bg) 62%, transparent);
          border: 1px solid color-mix(in srgb, var(--border) 55%, transparent);
          border-radius: 4px;
          cursor: pointer;
          transition: color 0.18s ease, border-color 0.18s ease, transform 0.12s ease;
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          line-height: 1;
          white-space: nowrap;
        }
        .globe-city-chip:hover,
        .globe-city-chip.is-focus {
          color: var(--cyan);
          border-color: color-mix(in srgb, var(--cyan) 42%, transparent);
          transform: translateY(-1px);
        }
        .globe-city-chip:focus-visible {
          outline: 2px solid var(--cyan);
          outline-offset: 2px;
        }
        .globe-city-chip.is-hub {
          color: var(--green);
          border-color: color-mix(in srgb, var(--green) 38%, transparent);
        }
        .globe-city-chip .globe-city-hub-dot {
          width: 4px; height: 4px;
          margin-right: 0;
        }
        .globe-node-panel {
          position: absolute;
          top: 52px; right: 14px;
          width: min(240px, calc(100% - 28px));
          z-index: 5;
          border-radius: 6px;
          background: color-mix(in srgb, var(--bg) 82%, transparent);
          border: 1px solid color-mix(in srgb, var(--cyan) 22%, transparent);
          backdrop-filter: blur(10px);
          box-shadow: 0 12px 36px rgba(0,0,0,0.28);
          padding: 12px 12px 10px;
          font-family: var(--font-mono);
          animation: panelIn 0.22s ease;
        }
        @keyframes panelIn {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .globe-node-panel-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 8px;
          margin-bottom: 10px;
        }
        .globe-node-panel-title {
          font-family: var(--font-display);
          font-size: 15px;
          font-weight: 700;
          color: var(--text);
          letter-spacing: 0.3px;
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .globe-node-panel-sub {
          font-size: 10px;
          letter-spacing: 1.4px;
          color: var(--muted);
          margin-top: 2px;
        }
        .globe-node-panel-close {
          background: transparent;
          border: 1px solid transparent;
          color: var(--muted);
          font-size: 12px;
          cursor: pointer;
          padding: 2px 6px;
          border-radius: 3px;
          line-height: 1;
        }
        .globe-node-panel-close:hover {
          color: var(--orange);
          border-color: color-mix(in srgb, var(--orange) 35%, transparent);
        }
        .globe-node-panel-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 6px 10px;
        }
        .globe-node-panel-row {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .globe-node-panel-row span {
          font-size: 9px;
          letter-spacing: 1.4px;
          color: var(--muted);
        }
        .globe-node-panel-row strong {
          font-size: 12px;
          font-weight: 700;
          color: var(--cyan);
        }
        .globe-node-panel-row strong[data-tone="ok"]   { color: var(--green); }
        .globe-node-panel-row strong[data-tone="warn"] { color: var(--orange); }
        .globe-node-panel-spark {
          display: flex;
          align-items: flex-end;
          gap: 3px;
          height: 36px;
          margin-top: 12px;
          padding: 4px 2px;
          border-top: 1px solid color-mix(in srgb, var(--cyan) 14%, transparent);
        }
        .globe-node-panel-spark i {
          flex: 1;
          display: block;
          border-radius: 1px;
          background: linear-gradient(to top, color-mix(in srgb, var(--green) 55%, transparent), var(--cyan));
          opacity: 0.75;
          min-height: 4px;
        }
        .globe-node-panel-foot {
          margin-top: 6px;
          font-size: 9px;
          letter-spacing: 1.5px;
          color: var(--muted);
          text-align: right;
        }
        /* Live routing ticker */
        .globe-route-log {
          position: absolute;
          left: 14px; bottom: 52px;
          z-index: 4;
          display: flex;
          flex-direction: column;
          gap: 3px;
          pointer-events: none;
          max-width: min(340px, calc(100% - 28px));
        }
        .globe-route-log-row {
          display: flex;
          align-items: center;
          gap: 8px;
          font-family: var(--font-mono);
          font-size: 10px;
          letter-spacing: 0.6px;
          padding: 3px 8px;
          border-radius: 3px;
          background: color-mix(in srgb, var(--bg) 72%, transparent);
          border: 1px solid color-mix(in srgb, var(--cyan) 14%, transparent);
          backdrop-filter: blur(4px);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          animation: routeIn 0.28s ease;
        }
        @keyframes routeIn {
          from { opacity: 0; transform: translateX(-8px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        .globe-route-log-dir {
          font-size: 9px;
          line-height: 1;
          width: 12px;
          text-align: center;
        }
        .globe-route-log-dir[data-dir="up"]   { color: var(--orange); }
        .globe-route-log-dir[data-dir="down"] { color: var(--green); }
        .globe-route-log-kind {
          font-weight: 700;
          min-width: 64px;
        }
        .globe-route-log-kind[data-dir="up"]   { color: var(--cyan); }
        .globe-route-log-kind[data-dir="down"] { color: var(--green); }
        .globe-route-log-path {
          color: var(--muted);
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .globe-route-log-ms {
          color: var(--cyan);
          font-weight: 700;
          font-size: 10px;
        }
        /* Theme-tone sync — chrome adapts to real --bg luminance */
        .globe-network-shell[data-globe-tone="light"] .globe-route-log-row {
          background: color-mix(in srgb, var(--bg2, var(--bg)) 82%, transparent);
          border-color: color-mix(in srgb, var(--cyan) 20%, transparent);
          box-shadow: 0 6px 18px rgba(21,48,74,0.08);
        }
        .globe-network-shell[data-globe-tone="light"] .globe-hub-ring {
          box-shadow: 0 0 12px color-mix(in srgb, var(--green) 40%, transparent);
        }
        @media (max-width: 720px) {
          .globe-top-bar {
            flex-wrap: wrap;
            gap: 8px;
            padding: 10px 12px;
          }
          .globe-top-bar .globe-network-title {
            flex: 1 1 100%;
            letter-spacing: 1.5px;
            font-size: 10px;
          }
          .globe-top-bar .globe-network-stats {
            margin-left: auto;
          }
          .globe-arc-label { display: none; }
          .globe-city-label { font-size: 9px; letter-spacing: 1px; }
          .globe-node-panel { width: min(200px, calc(100% - 28px)); }
          .globe-sat-ring { display: none; }
          .globe-route-log { bottom: 52px; max-width: calc(100% - 28px); }
        }
        @media (prefers-reduced-motion: reduce) {
          .globe-hub-ring,
          .globe-sat-ring,
          .globe-city-hub-dot,
          .globe-route-log-row { animation: none !important; }
        }
      `}</style>
    </div>
  )
}
