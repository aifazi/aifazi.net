/** Convert a hex/rgb color to rgba with the given alpha. Passes rgba()/hsla() through unchanged. */
export function withAlpha(color: string | undefined, alpha: number): string {
  if (!color) return color ?? 'transparent'
  if (color.startsWith('rgba(') || color.startsWith('hsla(') || color === 'transparent') return color
  const rgb = color.match(/\d+/g)
  if (color.startsWith('rgb(') && rgb && rgb.length >= 3) {
    return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`
  }
  let hex = color.replace('#', '')
  if (hex.length === 3) hex = hex.split('').map((ch) => ch + ch).join('')
  if (hex.length !== 6) return color
  const n = parseInt(hex, 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return `rgba(${r},${g},${b},${alpha})`
}

/** Soft UI shadow that works on iOS + Android (elevation fallback). */
export const glowShadow = (size: number, opacity: number) => ({
  shadowColor: '#000',
  shadowOpacity: opacity,
  shadowRadius: size,
  shadowOffset: { width: 0, height: size / 2 || 4 },
  elevation: size / 3 || 4,
})

/**
 * Pick a near-black or near-white text color that clears WCAG AA (4.5:1)
 * against a solid background. Used for filled buttons whose label would
 * otherwise be invisible (e.g. the danger variant once rendered `c.danger`
 * text on a `c.danger` fill).
 */
export function contrastText(background: string): string {
  let r = 0
  let g = 0
  let b = 0
  const hex = (background || '').replace('#', '')
  if (hex.length >= 6) {
    const n = parseInt(hex.slice(0, 6), 16)
    r = (n >> 16) & 255
    g = (n >> 8) & 255
    b = n & 255
  } else {
    const m = (background || '').match(/\d+/g)
    if (m && m.length >= 3) {
      r = Number(m[0]); g = Number(m[1]); b = Number(m[2])
    }
  }
  const f = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  const l = 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
  // White only wins below this luminance; above it, dark text clears 4.5:1.
  return l > 0.2 ? '#0a0f14' : '#ffffff'
}

type ToneColors = {
  accent: string
  accent2: string
  warning: string
  success: string
  danger: string
  info: string
  sale: string
  star: string
  muted: string
}

/**
 * Map free-text status/ticket/order states to a semantic theme tone so status
 * chips render consistently in every theme instead of hardcoded hex.
 */
export function statusTone(text: string | undefined, c: ToneColors): string | undefined {
  const t = (text || '').toLowerCase()
  if (t === 'open' || t === 'active' || t === 'in-progress' || t === 'processing' || t === 'low' || t === 'accepted' || t === 'approved') return c.accent2
  if (t === 'resolved' || t === 'paid' || t === 'delivered' || t === 'success' || t === 'operational' || t === 'up' || t === 'online' || t === 'verified') return c.success
  if (t === 'pending' || t === 'sale' || t === 'shipped' || t === 'medium' || t === 'requested' || t === 'moderator' || t === 'admin') return c.star
  if (t === 'cancelled' || t === 'refunded' || t === 'blocked' || t === 'banned' || t === 'down' || t === 'outage' || t === 'rejected' || t === 'critical' || t === 'high') return c.danger
  if (t === 'closed' || t === 'muted') return c.muted
  if (t === 'warning' || t === 'partial' || t === 'degraded' || t === 'maintenance' || t === 'market') return c.warning
  return undefined
}