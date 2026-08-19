/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  THEME CUSTOMIZATION — per-theme fonts, colors, glow & CSS.  ║
 * ║  Stored in site_config.settings under the `themeCustom` key: ║
 * ║    themeCustom: { "<themeId>": {                             ║
 * ║      fontDisplay, fontMono, fontCode, glow,                  ║
 * ║      radius, borderWidth, bgPattern, bgGradientFrom,         ║
 * ║      bgGradientTo, bgGradientAngle,                          ║
 * ║      colors: { bg, bg2, bg3, green, cyan, orange, red,      ║
 * ║                purple, text, text2, muted, link, border },   ║
 * ║      css: "<arbitrary CSS>"                                  ║
 * ║    } }                                                       ║
 * ║  Targeted overrides live under `themeCustomTargets`:         ║
 * ║    [{ id, name, themeId, draft, audience, active,           ║
 * ║       start, end }]                                          ║
 * ║  Applied by injecting a scoped <style> block so overrides    ║
 * ║  only apply when that theme is active.                       ║
 * ╚══════════════════════════════════════════════════════════════╝
 */
import { buildGoogleFontUrl, loadCustomFonts } from './fonts'
import { THEME_FAMILY_SIBLINGS, LIGHT_THEMES } from './themeCatalog'

// Neutral / mode-specific color tokens. Each theme's built-in block already
// defines the correct light and dark values, so a customization that is shared
// across a family's light + dark variants must never override them — otherwise
// toggling to light mode would inherit the dark background/text palette.
const MODE_NEUTRAL_TOKENS = new Set(['bg', 'bg2', 'bg3', 'text', 'text2', 'muted', 'border'])

// Returns a copy of a customization draft with the mode-neutral color tokens
// removed (accent colors, fonts, glow, radius, borders and background CSS are
// kept). Returns the original draft unchanged when nothing is stripped.
export function stripModeNeutralColors(draft) {
  if (!draft || typeof draft !== 'object') return draft
  const colors = draft.colors && typeof draft.colors === 'object' && !Array.isArray(draft.colors)
    ? { ...draft.colors }
    : undefined
  if (!colors) return draft
  let changed = false
  for (const k of MODE_NEUTRAL_TOKENS) {
    if (k in colors) { delete colors[k]; changed = true }
  }
  return changed ? { ...draft, colors } : draft
}

// ── Customizable core tokens ──────────────────────────────────────────────────
// key → maps to --<key> in globals.css. `def` is the dark-mode default used to
// prefill the admin pickers when a theme doesn't define a value.
export const CUSTOM_COLOR_TOKENS = [
  { key: 'bg',     label: 'Background',        def: '#060a0f' },
  { key: 'bg2',    label: 'Surface',           def: '#0b1118' },
  { key: 'bg3',    label: 'Elevated',          def: '#111a24' },
  { key: 'green',  label: 'Primary',           def: '#00ff88' },
  { key: 'cyan',   label: 'Secondary',         def: '#00d4ff' },
  { key: 'orange', label: 'Warning',           def: '#ff6b35' },
  { key: 'red',    label: 'Danger',            def: '#ff4757' },
  { key: 'purple', label: 'Accent',            def: '#7c5cbf' },
  { key: 'text',   label: 'Text',              def: '#c8d8e8' },
  { key: 'text2',  label: 'Text Secondary',    def: '#8aa0b4' },
  { key: 'muted',  label: 'Muted',             def: '#6b8296' },
  { key: 'link',   label: 'Link',              def: '#54a0ff' },
  { key: 'border', label: 'Border',            def: 'rgba(0,212,255,0.15)' },
]

// ── Curated Google Font options for the admin pickers ─────────────────────────
export const FONT_OPTIONS = [
  { id: 'Outfit',            label: 'Outfit',            group: 'Display' },
  { id: 'Inter',             label: 'Inter',             group: 'Display' },
  { id: 'Rajdhani',          label: 'Rajdhani',          group: 'Display' },
  { id: 'Orbitron',          label: 'Orbitron',          group: 'Display' },
  { id: 'Syne',              label: 'Syne',              group: 'Display' },
  { id: 'Bebas Neue',        label: 'Bebas Neue',        group: 'Display' },
  { id: 'Anton',             label: 'Anton',             group: 'Display' },
  { id: 'Cinzel',            label: 'Cinzel',            group: 'Display' },
  { id: 'Playfair Display',  label: 'Playfair Display',  group: 'Display' },
  { id: 'Poppins',           label: 'Poppins',           group: 'Display' },
  { id: 'Raleway',           label: 'Raleway',           group: 'Display' },
  { id: 'Quicksand',         label: 'Quicksand',         group: 'Display' },
  { id: 'Libre Baskerville', label: 'Libre Baskerville', group: 'Display' },
  { id: 'Bungee',            label: 'Bungee',            group: 'Display' },
  { id: 'Silkscreen',        label: 'Silkscreen',        group: 'Display' },
  { id: 'Press Start 2P',    label: 'Press Start 2P',    group: 'Display' },
  { id: 'Space Grotesk',     label: 'Space Grotesk',     group: 'Display' },
  { id: 'Sora',              label: 'Sora',              group: 'Display' },
  { id: 'Montserrat',        label: 'Montserrat',        group: 'Display' },
  { id: 'JetBrains Mono',    label: 'JetBrains Mono',    group: 'Mono' },
  { id: 'Fira Code',         label: 'Fira Code',         group: 'Mono' },
  { id: 'Space Mono',        label: 'Space Mono',        group: 'Mono' },
  { id: 'VT323',             label: 'VT323',             group: 'Mono' },
  { id: 'Share Tech Mono',   label: 'Share Tech Mono',   group: 'Mono' },
  { id: 'DM Mono',           label: 'DM Mono',           group: 'Mono' },
  { id: 'Courier Prime',     label: 'Courier Prime',     group: 'Mono' },
  { id: 'IBM Plex Mono',     label: 'IBM Plex Mono',     group: 'Mono' },
  { id: 'Roboto Mono',       label: 'Roboto Mono',       group: 'Mono' },
]

// ── Selector for a theme id ───────────────────────────────────────────────────
// cyber-dark is the no-attribute default → target :root. Everything else is
// scoped via its data-theme attribute so overrides never leak across themes.
export function themeSelector(themeId) {
  return themeId === 'cyber-dark' ? ':root' : `[data-theme="${themeId}"]`
}

// ── Uploaded font helpers ─────────────────────────────────────────────────────
// Uploaded fonts are mirrored into site_config.settings under `uploadedFonts`
// as [{ id, family, url, format, weight, style }]. `format` is the CSS format
// string (woff2/woff/truetype/opentype) emitted into @font-face src(). Family
// names come from the admin upload and are sanitized server-side.

function _cssEsc(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

export function isUploadedFontFamily(family, uploadedFonts) {
  if (!family || !Array.isArray(uploadedFonts) || !uploadedFonts.length) return false
  const fam = String(family).trim().toLowerCase()
  return uploadedFonts.some(u => String(u?.family || '').trim().toLowerCase() === fam)
}

// @font-face rules for uploaded font entries whose family is actually used by a
// theme customization. One rule per entry so multiple weights/styles of the
// same family each get their own face.
export function buildFontFaceCss(uploadedFonts, usedFamilies = []) {
  if (!Array.isArray(uploadedFonts) || !uploadedFonts.length) return ''
  const used = usedFamilies.map(f => String(f || '').trim().toLowerCase()).filter(Boolean)
  const rules = []
  for (const u of uploadedFonts) {
    const family = String(u?.family || '').trim()
    if (!family || (used.length && !used.includes(family.toLowerCase()))) continue
    const url = String(u?.url || '').trim()
    if (!url) continue
    const format = String(u?.format || '').trim() || 'woff2'
    const weight = String(u?.weight || '400').trim() || '400'
    const style = String(u?.style || 'normal').trim() || 'normal'
    rules.push(
      `@font-face{font-family:'${_cssEsc(family)}';src:url('${_cssEsc(url)}') format('${format}');font-weight:${weight};font-style:${style};font-display:swap;}`
    )
  }
  return rules.join('\n')
}

// ── Pure CSS builder (server + client safe) ───────────────────────────────────
const BG_PATTERN_CSS = {
  grid:   `  background-image: linear-gradient(color-mix(in srgb, var(--cyan) 7%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--cyan) 7%, transparent) 1px, transparent 1px);\n  background-size: 34px 34px;`,
  dots:   `  background-image: radial-gradient(color-mix(in srgb, var(--cyan) 10%, transparent) 1px, transparent 1.5px);\n  background-size: 22px 22px;`,
  matrix: `  background-image: repeating-linear-gradient(0deg, color-mix(in srgb, var(--green) 6%, transparent) 0 1px, transparent 1px 3px);`,
}

export function buildThemeCustomCss(themeId, custom, uploadedFonts = []) {
  if (!custom || typeof custom !== 'object') return ''
  const sel = themeSelector(themeId)
  const lines = []

  const colors = custom.colors || {}
  for (const token of CUSTOM_COLOR_TOKENS) {
    const v = colors[token.key]
    if (v && typeof v === 'string') lines.push(`  --${token.key}: ${v};`)
  }

  if (typeof custom.radius === 'number' && !Number.isNaN(custom.radius)) {
    lines.push(`  --radius: ${Math.max(0, Math.min(48, Math.round(custom.radius)))}px;`)
  }
  if (typeof custom.borderWidth === 'number' && !Number.isNaN(custom.borderWidth)) {
    lines.push(`  --border-w: ${Math.max(0, Math.min(6, custom.borderWidth))}px;`)
  }

  const bgPattern = custom.bgPattern
  if (bgPattern === 'gradient') {
    const from = String(custom.bgGradientFrom || '').trim() || 'transparent'
    const to = String(custom.bgGradientTo || '').trim() || from
    const angle = typeof custom.bgGradientAngle === 'number' ? custom.bgGradientAngle : 180
    lines.push(`  background-image: linear-gradient(${angle}deg, ${from}, ${to});`)
  } else if (bgPattern && bgPattern !== 'none' && BG_PATTERN_CSS[bgPattern]) {
    lines.push(BG_PATTERN_CSS[bgPattern])
  }

  if (custom.fontDisplay && typeof custom.fontDisplay === 'string') {
    lines.push(`  --font-display: '${custom.fontDisplay}', 'Outfit', 'Inter', sans-serif;`)
  }
  if (custom.fontMono && typeof custom.fontMono === 'string') {
    lines.push(`  --font-mono: '${custom.fontMono}', 'Courier New', monospace;`)
  }
  if (custom.fontCode && typeof custom.fontCode === 'string') {
    lines.push(`  --font-code: '${custom.fontCode}', monospace;`)
  }

  // Glow intensity 0…1 → follows the theme's green/cyan (color-mix so it works
  // with any theme's accent, no rgba parsing needed).
  if (typeof custom.glow === 'number' && !Number.isNaN(custom.glow)) {
    const pct = Math.max(0, Math.min(100, Math.round(custom.glow * 60)))
    lines.push(`  --glow: 0 0 20px color-mix(in srgb, var(--green) ${pct}%, transparent);`)
    lines.push(`  --glow-cyan: 0 0 20px color-mix(in srgb, var(--cyan) ${pct}%, transparent);`)
  }

  const main = lines.length ? `${sel} {\n${lines.join('\n')}\n}` : ''

  // Arbitrary CSS ("and more"): accept either a full rule set or bare
  // declarations — declarations are auto-scoped to the theme selector.
  const css = (custom.css || '').trim()
  let extra = ''
  if (css) {
    extra = css.includes('{') ? css : `${sel} {\n${css}\n}`
  }

  // @font-face for any uploaded font used by this customization — emitted first
  // so the browser has the face before the theme block references the family.
  const used = [custom.fontDisplay, custom.fontMono, custom.fontCode].filter(Boolean)
  const faces = buildFontFaceCss(uploadedFonts, used)

  return [faces, main, extra].filter(Boolean).join('\n')
}

// ── Google Font URL for a theme's custom fonts (server + client safe) ─────────
// Uploaded families are excluded — they are served from the CDN via @font-face,
// not from Google Fonts.
export function themeCustomFontUrl(custom, uploadedFonts = []) {
  if (!custom || typeof custom !== 'object') return ''
  const families = [custom.fontDisplay, custom.fontMono, custom.fontCode]
    .filter(Boolean)
    .filter(f => !isUploadedFontFamily(f, uploadedFonts))
  return buildGoogleFontUrl(families)
}

// ── Targeted rollout resolution ───────────────────────────────────────────────
// Admin can publish targeted overrides (themeCustomTargets) for a theme: each
// has an audience (everyone / logged-in / anonymous), an optional start/end
// schedule and an active flag. The first match wins and overrides the base
// `themeCustom[themeId]`. Used by both the SSR layout and the client providers.
export function resolveThemeCustom(siteConfig, themeId, opts = {}) {
  const targets = Array.isArray(siteConfig?.themeCustomTargets) ? siteConfig.themeCustomTargets : []
  const now = Date.now()
  const match = targets.find(t => {
    if (!t || t.themeId !== themeId || t.active === false || !t.draft) return false
    if (t.start) { const s = new Date(t.start).getTime(); if (Number.isFinite(s) && s > now) return false }
    if (t.end) { const e = new Date(t.end).getTime(); if (Number.isFinite(e) && e < now) return false }
    const aud = t.audience || 'everyone'
    if (aud === 'everyone') return true
    return aud === 'logged-in' ? !!opts.loggedIn : !opts.loggedIn
  })
  if (match && match.draft && typeof match.draft === 'object') return match.draft
  const tc = siteConfig?.themeCustom
  const custom = tc && typeof tc === 'object' && !Array.isArray(tc) ? tc[themeId] : undefined
  if (custom) {
    // Light variants always keep their built-in neutral palette (bg/text/border)
    // so a mirrored or inherited dark-mode customization can never make light
    // mode render dark. Accent colors, fonts, glow, radius etc. still apply.
    if (THEME_FAMILY_SIBLINGS[themeId] && LIGHT_THEMES.includes(themeId)) {
      return stripModeNeutralColors(custom)
    }
    return custom
  }
  // A theme with no customization of its own inherits its family sibling's look
  // (e.g. customizing `pacman` also styles `pacman-light`) so light/dark mode
  // never silently drops the admin's applied settings.
  const sibling = THEME_FAMILY_SIBLINGS[themeId]
  if (sibling && tc && typeof tc === 'object' && !Array.isArray(tc)) {
    const sib = tc[sibling]
    if (sib && typeof sib === 'object' && !Array.isArray(sib)) {
      // Inherit the sibling's accents/fonts/radius but keep this variant's own
      // light/dark neutral palette (so light mode never turns dark).
      return stripModeNeutralColors(sib)
    }
  }
  return undefined
}

// ── Client-side applier ───────────────────────────────────────────────────────
// Injects/updates a single <style id="theme-custom-css"> in <head> and loads the
// custom fonts. Idempotent — safe to call on theme/config changes. `styleId`
// lets the admin CUSTOMIZE tab preview into a separate element so unsaved edits
// never clobber the persisted look applied by providers.
export function applyThemeCustom(themeId, custom, styleId = 'theme-custom-css', uploadedFonts = []) {
  if (typeof document === 'undefined') return
  const css = buildThemeCustomCss(themeId, custom, uploadedFonts)
  let el = document.getElementById(styleId)
  if (!css) {
    if (el) el.textContent = ''
    return
  }
  if (!el) {
    el = document.createElement('style')
    el.id = styleId
    document.head.appendChild(el)
  }
  el.textContent = css
  const families = [custom && custom.fontDisplay, custom && custom.fontMono, custom && custom.fontCode]
    .filter(Boolean)
    .filter(f => !isUploadedFontFamily(f, uploadedFonts))
  if (families.length) loadCustomFonts(families)
}

// ── Admin picker options ──────────────────────────────────────────────────────
// Merges uploaded fonts into the Google font options (uploads first) so the
// per-theme pickers can select either source. Uploaded families are grouped
// under "Uploaded".
export function combineFontOptions(uploadedFonts = []) {
  const uploads = (Array.isArray(uploadedFonts) ? uploadedFonts : [])
    .map(u => ({ id: String(u?.family || '').trim(), label: String(u?.family || '').trim(), group: 'Uploaded' }))
    .filter((opt, i, arr) => opt.id && arr.findIndex(o => o.id === opt.id) === i)
  return [...uploads, ...FONT_OPTIONS]
}

// Case-insensitive search across font labels and groups.
export function filterFontOptions(options, query) {
  const q = String(query || '').trim().toLowerCase()
  if (!q) return options
  return options.filter(o =>
    String(o.label || '').toLowerCase().includes(q) ||
    String(o.group || '').toLowerCase().includes(q)
  )
}