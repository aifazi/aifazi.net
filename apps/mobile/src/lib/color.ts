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