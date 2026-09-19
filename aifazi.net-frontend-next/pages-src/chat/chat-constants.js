import { getAuthToken } from '@/lib/api'

export const T = {
  sidebar:   'var(--bg)',
  main:      'var(--bg)',
  bubble:    'var(--bg3)',
  bubbleOwn: 'color-mix(in srgb, var(--green) 10%, transparent)',
  input:     'var(--bg2)',
  border:    'var(--border)',
  accent:    'var(--green)',
  accentB:   'var(--cyan)',
  danger:    '#ff4757',
  warn:      '#ffd700',
  muted:     'var(--muted)',
  text:      'var(--text)',
  mono:      'var(--font-mono)',
  display:   'var(--font-display)',
}

export const PAL = ['#5865f2','#00d4ff','#00ff88','#ff6b35','#ff71ce','#ff4757','#ffd700','#a78bfa']

export const ENCRYPTED_PREFIX = 'ENC:'

export const ROLES = ['admin', 'moderator', 'editor', 'chat']

export const IMG_EXTS = /\.(png|jpg|jpeg|gif|webp|svg|bmp|avif|ico|tiff|tif)(\?.*)?$/i
export const VID_EXTS = /\.(mp4|webm|mov|ogg|mkv|avi)(\?.*)?$/i
export const AUD_EXTS = /\.(mp3|wav|ogg|flac|aac|m4a|wma|opus|weba)(\?.*)?$/i

export function parseJwt(t) {
  try {
    const part = t.split('.')[1]
    if (!part) return null
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)))
  } catch { return null }
}

export function getToken() {
  // H4 — memory-first via the central API client (cookie auth covers the rest).
  return getAuthToken()
}

export const fmt = d => new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

export const fmtDt = d => {
  const n = new Date(), dt = new Date(d)
  if (dt.toDateString() === n.toDateString()) return 'Today'
  const y = new Date(n)
  y.setDate(n.getDate() - 1)
  return dt.toDateString() === y.toDateString() ? 'Yesterday' : dt.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

// P0-6 — absolute timestamp with tz abbreviation for `title` attributes next
// to the relative Today/Yesterday/MMM d labels (displayed text unchanged).
export const fmtDtTitle = d => {
  try {
    return new Intl.DateTimeFormat([], {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
    }).format(new Date(d))
  } catch { return new Date(d).toLocaleString() }
}

export const fmtSz = b => {
  const n = parseInt(b)
  if (!n) return ''
  if (n < 1024) return n + ' B'
  if (n < 1048576) return (n / 1024).toFixed(1) + ' KB'
  return (n / 1048576).toFixed(1) + ' MB'
}

export function beep() {
  try {
    const c = new (window.AudioContext || window.webkitAudioContext)()
    const o = c.createOscillator(), g = c.createGain()
    o.connect(g)
    g.connect(c.destination)
    o.frequency.value = 880
    g.gain.setValueAtTime(0.1, c.currentTime)
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.2)
    o.start()
    o.stop(c.currentTime + 0.2)
  } catch {}
}

export function aCol(n = '') {
  let h = 0
  for (let i = 0; i < n.length; i++)
    h = (h * 31 + n.charCodeAt(i)) & 0xffffffff
  return PAL[Math.abs(h) % PAL.length]
}

export function isUuidLike(s) {
  return s && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]+$/i.test(s)
}

export function roleColor(role = 'member') {
  const r = String(role || 'member').toLowerCase()
  if (r === 'admin') return '#ff4757'
  if (r === 'moderator') return '#00d4ff'
  if (r === 'editor') return '#ffd700'
  if (r === 'chat') return '#a78bfa'
  return '#00ff88'
}

export function parseParticipantMetadata(value) {
  if (!value) return {}
  if (typeof value === 'object') return value
  try { return JSON.parse(value) } catch {}
  return String(value).split('&').reduce((acc, part) => {
    const [k, v] = part.split('=')
    if (k) acc[decodeURIComponent(k)] = decodeURIComponent(v || '')
    return acc
  }, {})
}
