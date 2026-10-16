'use client'
// Shared globe helpers/constants for ServerRackAnimation (extracted from that file).

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
// NOTE: single-arg CSS.supports() requires a full supports-condition —
// the declaration must be wrapped in parens, otherwise it always fails.
function supportsCssAnchors() {
  if (typeof CSS === 'undefined' || !CSS.supports) return false
  return CSS.supports('(anchor-name: --cobe-probe)') || CSS.supports('(position-anchor: --cobe-probe)')
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

// Shell-margin-aware zoom cap — COBE renders the disc with diameter ≈ scale ×
// canvas height, centered for offset [0, 0]. Clamp the effective scale so the
// disc stays inside the live shell (minus margin) instead of clipping one edge
// before the others at max scroll-zoom.
const GLOBE_SHELL_MARGIN_PX = 12
const GLOBE_CENTER_OFFSET = [0, 0]

function globeMaxScaleForDims(width, height) {
  if (!width || !height) return GLOBE_MAX_ZOOM * 0.92
  return Math.max(0.2, Math.min(
    (width - GLOBE_SHELL_MARGIN_PX * 2) / height,
    (height - GLOBE_SHELL_MARGIN_PX * 2) / height,
  ))
}

// Low-end guard: 1× backing store when the low tier is active or the device
// reports few cores / little RAM (guarded — these APIs don't exist everywhere).
function pickGlobeDpr(tier) {
  if (typeof window === 'undefined') return 1
  if (tier === 'low') return 1
  const nav = typeof navigator !== 'undefined' ? navigator : {}
  const cores = nav.hardwareConcurrency
  const mem = nav.deviceMemory
  if ((typeof cores === 'number' && cores <= 4) || (typeof mem === 'number' && mem <= 4)) return 1
  return Math.min(window.devicePixelRatio || 1, 2)
}

// Fit-with-margin: COBE's sphere spans ~0.8 world units and NDC-x scales with
// H/W, so tall/narrow shells clip left+right. Shrink the base scale to fit;
// landscape shells keep the exact 0.92 look (never upscale).
function globeFitBase(width, height) {
  if (!width || !height) return 0.92
  return Math.min(0.92, (width / height) * 1.02)
}

let _cachedWebglOk = null
// Probe WebGL on a throwaway canvas so the real canvas context is untouched.
function hasWebGL() {
  if (_cachedWebglOk !== null) return _cachedWebglOk
  if (typeof document === 'undefined') return true
  try {
    const probe = document.createElement('canvas')
    _cachedWebglOk = !!(probe.getContext('webgl2') || probe.getContext('webgl'))
  } catch {
    _cachedWebglOk = false
  }
  return _cachedWebglOk
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

function rgbToArr(rgbStr, fallback = '0,212,255') {
  const p = String(rgbStr || fallback).split(',').map(Number)
  const n = p.length >= 3 ? p : fallback.split(',').map(Number)
  return [n[0] / 255, n[1] / 255, n[2] / 255]
}

export { cssVar, LIGHT_THEME_IDS, isLightFromLuminance, readGlobeTheme, GLOBE_CITIES, GLOBE_CONNECTIONS, supportsCssAnchors, cityToAngles, GLOBE_MIN_ZOOM, GLOBE_MAX_ZOOM, GLOBE_BASE_RATIO, GLOBE_MAX_RATIO, clampGlobeZoom, GLOBE_SHELL_MARGIN_PX, GLOBE_CENTER_OFFSET, globeMaxScaleForDims, pickGlobeDpr, globeFitBase, hasWebGL, firstGeoValue, maskIp, rgbToArr }
