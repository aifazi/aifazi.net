/**
 * core/themeDesign.js — layered theme design system
 *
 * Themes own a COMPLETE design package (palette, component look, framework
 * preferences, custom CSS) that is scoped to the active [data-theme]. Global
 * admin framework settings (siteConfig.menuStyle, notifyStyle, …) stay on a
 * separate layer and are NEVER mutated by switching themes.
 *
 * Resolution order (highest wins) for the LOOK layer:
 *   1. themeCustom        (per-theme admin/user customization)
 *   2. theme design tokens (componentTokens + THEME_DESIGN[themeId])
 *   3. DEFAULT_TOKENS     (componentTokens baseline)
 *
 * Resolution order for the PATTERN layer (which structural variant):
 *   1. userPackage        (per-user package, only when theme is unlocked)
 *   2. globalFramework    (admin siteConfig — explicit pin)
 *   3. theme preference   (THEME_DESIGN[themeId].framework / THEME_FRAMEWORK)
 *
 * The PATTERN layer is resolved into an *effective* object at render time.
 * It is never written back into siteConfig, so admin settings survive every
 * theme switch. JSON import/export carries the full design package.
 */

import {
  getComponentTokens, tokensToCssVars, THEME_FAMILY_OF, DEFAULT_TOKENS,
} from './componentTokens'
import { THEME_FRAMEWORK } from './framework-styles'

// ── Framework pattern keys (the "which variant" layer) ────────────────────────
export const FRAMEWORK_PATTERN_KEYS = [
  'menuStyle', 'dialogStyle', 'inputStyle', 'surfaceStyle', 'notifyStyle',
  'buttonStyle', 'cardStyle', 'tableStyle', 'badgeStyle',
  'headerStyle', 'footerStyle', 'loadingScreenStyle',
]

// ── Component design keys (the "how it looks" layer) ─────────────────────────
export const COMPONENT_DESIGN_KEYS = [
  'button', 'card', 'input', 'badge', 'bubble', 'menu', 'dialog', 'notify',
  'alert', 'toast', 'table', 'tooltip', 'chip', 'progress',
]

/**
 * Per-theme full design packages. Each entry is optional — missing keys fall
 * back to componentTokens family defaults. `framework` holds the theme's
 * preferred structural patterns (soft suggestions, not hard overrides).
 */
export const THEME_DESIGN = {
  // Example shape:
  // 'crimson': {
  //   framework: { menu: 'command', notify: 'banner' },
  //   components: {
  //     button: { radius: '4px', shadow: '0 2px 0 #000' },
  //     menu:   { bg: 'var(--bg2)', border: '2px solid var(--red)' },
  //     notify: { accent: 'var(--red)', radius: '0px' },
  //     alert:  { dangerBg: 'color-mix(in srgb, var(--red) 12%, transparent)' },
  //   },
  //   css: '/* optional theme-scoped extra rules */',
  // },
}

// Default component design deltas layered under every theme
const DEFAULT_COMPONENT_DESIGN = {
  menu:   { bg: 'var(--bg2)', border: '1px solid var(--border)', radius: '8px', itemRadius: '4px' },
  dialog: { bg: 'var(--bg2)', border: '1px solid var(--border)', radius: '12px', shadow: 'var(--shadow-card)' },
  notify: { bg: 'var(--bg2)', border: '1px solid var(--border)', radius: '8px', accent: 'var(--green)' },
  alert:  {
    infoBg: 'color-mix(in srgb, var(--cyan) 10%, transparent)',
    successBg: 'color-mix(in srgb, var(--green) 10%, transparent)',
    warnBg: 'color-mix(in srgb, var(--orange) 12%, transparent)',
    dangerBg: 'color-mix(in srgb, var(--red) 12%, transparent)',
    radius: '8px',
  },
  toast:  { bg: 'var(--bg3)', radius: '8px', shadow: 'var(--shadow-sm)' },
  table:  { headBg: 'var(--bg3)', rowBorder: '1px solid var(--border)', radius: '8px' },
  tooltip:{ bg: 'var(--bg3)', text: 'var(--text)', radius: '4px' },
  chip:   { bg: 'color-mix(in srgb, var(--cyan) 10%, transparent)', text: 'var(--cyan)', radius: '999px' },
  progress: { track: 'var(--bg3)', fill: 'var(--green)', radius: '999px' },
}

function deepMerge(base, override) {
  if (!override || typeof override !== 'object') return base
  const out = Array.isArray(base) ? [...base] : { ...base }
  for (const key of Object.keys(override)) {
    const a = out[key]
    const b = override[key]
    if (b && typeof b === 'object' && !Array.isArray(b) && a && typeof a === 'object' && !Array.isArray(a)) {
      out[key] = deepMerge(a, b)
    } else if (b !== undefined) {
      out[key] = b
    }
  }
  return out
}

/**
 * Resolve the full look-layer design for a theme (colors + all components).
 * Does not touch siteConfig — pure function.
 */
export function getThemeDesign(themeId) {
  const id = typeof themeId === 'string' && themeId ? themeId : 'cyber-dark'
  const base = getComponentTokens(id) // button/card/input/badge/bubble
  const extra = THEME_DESIGN[id]?.components || {}
  const components = deepMerge(
    deepMerge(DEFAULT_COMPONENT_DESIGN, extra),
    // Promote the core five into the components map so callers see one shape
    {
      button: base.button,
      card: base.card,
      input: base.input,
      badge: base.badge,
      bubble: base.bubble,
    },
  )
  return {
    themeId: id,
    family: THEME_FAMILY_OF[id] || 'cyber',
    components,
    framework: { ...(THEME_FRAMEWORK[id] || {}), ...(THEME_DESIGN[id]?.framework || {}) },
    css: THEME_DESIGN[id]?.css || '',
  }
}

/**
 * Resolve PATTERN layer without mutating anything.
 * Explicit global/package pins always win; theme preference fills gaps only.
 * @param {string} themeId
 * @param {{ globalFramework?: Record<string, any>, userPackage?: Record<string, any> | null, locked?: boolean }} [opts]
 * @returns {Record<string, string>} map of FRAMEWORK_PATTERN_KEYS → style id
 */
export function resolveFrameworkPatterns(themeId, opts = {}) {
  const globalFramework = opts.globalFramework || {}
  const userPackage = opts.userPackage || null
  const locked = !!opts.locked
  const themePref = { ...(THEME_FRAMEWORK[themeId] || {}), ...(THEME_DESIGN[themeId]?.framework || {}) }
  const pkg = locked ? {} : (userPackage || {})
  /** @type {Record<string, string>} */
  const out = {}
  // Map framework pattern keys to THEME_FRAMEWORK short names
  const shortOf = {
    menuStyle: 'menu', dialogStyle: 'dialog', inputStyle: 'input', surfaceStyle: 'surface',
    notifyStyle: 'notify', buttonStyle: 'button', cardStyle: 'card', tableStyle: 'table',
    badgeStyle: 'badge', headerStyle: 'header', footerStyle: 'footer', loadingScreenStyle: 'loading',
  }
  for (const key of FRAMEWORK_PATTERN_KEYS) {
    const short = shortOf[key] || key
    out[key] = pkg[key] || globalFramework[key] || themePref[short] || ''
  }
  return out
}

/**
 * Full effective design for the active theme — look + patterns.
 * Pure; safe to call every render.
 */
export function resolveThemeDesign(themeId, opts = {}) {
  const design = getThemeDesign(themeId)
  const patterns = resolveFrameworkPatterns(themeId, opts)
  return { ...design, patterns }
}

/** CSS vars for the look layer (merged tokens → --comp-* + new design vars). */
export function themeDesignToCssVars(design) {
  const core = tokensToCssVars({
    button: design.components.button,
    card: design.components.card,
    input: design.components.input,
    badge: design.components.badge,
    bubble: design.components.bubble,
  })
  const extra = {}
  const c = design.components
  if (c.menu) {
    extra['--comp-menu-bg'] = c.menu.bg
    extra['--comp-menu-border'] = c.menu.border
    extra['--comp-menu-radius'] = c.menu.radius
  }
  if (c.dialog) {
    extra['--comp-dialog-bg'] = c.dialog.bg
    extra['--comp-dialog-border'] = c.dialog.border
    extra['--comp-dialog-radius'] = c.dialog.radius
    extra['--comp-dialog-shadow'] = c.dialog.shadow
  }
  if (c.notify) {
    extra['--comp-notify-bg'] = c.notify.bg
    extra['--comp-notify-border'] = c.notify.border
    extra['--comp-notify-radius'] = c.notify.radius
    extra['--comp-notify-accent'] = c.notify.accent
  }
  if (c.alert) {
    extra['--comp-alert-info'] = c.alert.infoBg
    extra['--comp-alert-success'] = c.alert.successBg
    extra['--comp-alert-warn'] = c.alert.warnBg
    extra['--comp-alert-danger'] = c.alert.dangerBg
    extra['--comp-alert-radius'] = c.alert.radius
  }
  if (c.toast) {
    extra['--comp-toast-bg'] = c.toast.bg
    extra['--comp-toast-radius'] = c.toast.radius
  }
  if (c.chip) {
    extra['--comp-chip-bg'] = c.chip.bg
    extra['--comp-chip-text'] = c.chip.text
    extra['--comp-chip-radius'] = c.chip.radius
  }
  return { ...core, ...extra }
}

/** Write the look layer to :root (theme-scoped via existing data-theme rules). */
export function applyThemeDesign(themeId, extraCustom = null) {
  if (typeof document === 'undefined') return
  const design = getThemeDesign(themeId)
  const merged = extraCustom
    ? { ...design, components: deepMerge(design.components, extraCustom) }
    : design
  const vars = themeDesignToCssVars(merged)
  const style = document.documentElement.style
  for (const key of Object.keys(vars)) style.setProperty(key, vars[key])
}

// ── JSON package import / export ─────────────────────────────────────────────
/**
 * Serialize a complete theme design package (look + patterns + custom) for
 * download / clipboard / drag-drop sharing.
 */
export function exportThemeDesignPackage(themeId, { themeCustom = null, name = null } = {}) {
  const design = getThemeDesign(themeId)
  return {
    $schema: 'aifazi-theme-design@1',
    name: name || design.themeId,
    themeId: design.themeId,
    family: design.family,
    exportedAt: new Date().toISOString(),
    // Look layer — full component design
    components: design.components,
    // Pattern layer — soft preferences (never override admin pins on import)
    framework: design.framework,
    // Optional per-theme customization (colors, fonts, glow, CSS)
    themeCustom: themeCustom || null,
    css: design.css || '',
  }
}

/**
 * Parse an imported theme design package. Accepts:
 *   - full package ({ $schema, components, framework, themeCustom, … })
 *   - plain theme-custom object ({ fontDisplay, colors, glow, … })
 *   - preset export ({ name, draft })
 * Throws on garbage.
 */
export function parseThemeDesignPackage(text) {
  let data
  try {
    data = typeof text === 'string' ? JSON.parse(text) : text
  } catch {
    throw new Error('Invalid JSON')
  }
  if (!data || typeof data !== 'object') throw new Error('Not an object')

  // Preset shape { name, draft }
  if (data.draft && !data.components) {
    return {
      kind: 'preset',
      name: data.name || 'Imported preset',
      themeCustom: data.draft,
      components: null,
      framework: null,
    }
  }
  // Theme-custom shape (colors/glow/fonts)
  if (data.colors || data.fontDisplay || data.glow !== undefined) {
    return {
      kind: 'custom',
      name: data.name || 'Imported customization',
      themeCustom: data,
      components: null,
      framework: null,
    }
  }
  // Full design package
  if (data.components || data.framework || data.$schema) {
    return {
      kind: 'design',
      name: data.name || data.themeId || 'Imported design',
      themeId: data.themeId || null,
      components: data.components || null,
      framework: data.framework || null,
      themeCustom: data.themeCustom || null,
      css: data.css || '',
    }
  }
  throw new Error('Unrecognized theme design shape')
}

/**
 * Apply an imported package onto a theme id via callbacks — never writes
 * siteConfig framework keys (patterns stay soft / scoped).
 */
export function applyThemeDesignPackage(pkg, themeId, {
  onComponents = null,
  onThemeCustom = null,
  onCss = null,
} = {}) {
  if (!pkg || typeof pkg !== 'object') return false
  if (pkg.components && typeof onComponents === 'function') {
    onComponents(themeId, pkg.components)
  }
  if (pkg.themeCustom && typeof onThemeCustom === 'function') {
    onThemeCustom(themeId, pkg.themeCustom)
  }
  if (pkg.css && typeof onCss === 'function') {
    onCss(themeId, pkg.css)
  }
  return true
}

export { DEFAULT_TOKENS, DEFAULT_COMPONENT_DESIGN }
