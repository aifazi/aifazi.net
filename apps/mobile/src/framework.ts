import { Theme } from './themes'
import { frameworkStyles } from './design'
import { SiteConfig } from './lib/siteConfig'

/**
 * src/framework.ts — Mobile counterpart of the web frontend's
 * aifazi.net-frontend-next/core/framework-styles.js registry.
 *
 * The web lets the admin pick a per-element "framework style" (menu / notify /
 * dialog / input / surface), each chosen from a registry of style ids stored in
 * siteConfig (menuStyle, notifyStyle, dialogStyle, inputStyle, surfaceStyle,
 * notifyPosition). This module mirrors that registry and folds the admin's
 * choices into the mobile design tokens (corner radius, border weight, shadow,
 * glow). Unknown/absent ids fall back to the theme-derived framework style, so
 * behaviour is unchanged unless an admin actually set a field.
 */

/** Web framework style categories we honour on mobile (subset of the web's). */
export type ElementKey = 'menu' | 'notify' | 'dialog' | 'input' | 'surface'

export interface FrameworkSpec {
  /** corner radius for cards/surfaces */
  radius: number
  /** corner radius for buttons/inputs */
  buttonRadius: number
  /** border weight multiplier — heavy themes get thicker edges */
  borderWidth: number
  /** hard offset shadow (brutalist/retro) vs soft glow */
  hardShadow: boolean
  /** chamfered corner notch on primary buttons */
  notch: boolean
  /** heavy glow behind accents */
  glow: boolean
  /** alpha of element borders (higher = more visible/neon) */
  borderAlpha: number
  /** how translucent panel backgrounds are (0 = solid) */
  surfaceAlpha: number
}

/**
 * Map web style ids → mobile tokens. Kept intentionally compact: each id maps
 * to the most faithful subset of the tokens RN can express (radius, border,
 * shadow, glow, alpha). Repeat ids (cyber/glass/terminal/minimal/…) share one
 * spec; id-only aliases resolve by lookup.
 */
const SPECS: Record<string, FrameworkSpec> = {
  // Dark, angular, glowing command-center look.
  cyber: { radius: 8, buttonRadius: 5, borderWidth: 1, hardShadow: false, notch: true, glow: true, borderAlpha: 0.35, surfaceAlpha: 0 },
  // Frosted, translucent, soft rounded.
  glass: { radius: 18, buttonRadius: 10, borderWidth: 1, hardShadow: false, notch: false, glow: false, borderAlpha: 0.25, surfaceAlpha: 0.35 },
  // Green-on-black CLI.
  terminal: { radius: 0, buttonRadius: 0, borderWidth: 1, hardShadow: true, notch: false, glow: false, borderAlpha: 0.5, surfaceAlpha: 0 },
  // Clean, quiet, subtle shadow.
  minimal: { radius: 12, buttonRadius: 8, borderWidth: 1, hardShadow: false, notch: false, glow: false, borderAlpha: 0.18, surfaceAlpha: 0.05 },
  // Vivid, bright, glowing borders.
  neon: { radius: 8, buttonRadius: 4, borderWidth: 1, hardShadow: false, notch: false, glow: true, borderAlpha: 0.6, surfaceAlpha: 0 },
  // Large radius, deep floating shadows.
  floating: { radius: 20, buttonRadius: 12, borderWidth: 1, hardShadow: false, notch: false, glow: false, borderAlpha: 0.15, surfaceAlpha: 0.08 },
  // Chunky, hard-edged.
  brutal: { radius: 0, buttonRadius: 0, borderWidth: 2, hardShadow: true, notch: false, glow: false, borderAlpha: 1, surfaceAlpha: 0 },
  brutalist: { radius: 0, buttonRadius: 0, borderWidth: 2, hardShadow: true, notch: false, glow: false, borderAlpha: 1, surfaceAlpha: 0 },
  // Fully rounded pills.
  pill: { radius: 999, buttonRadius: 999, borderWidth: 1, hardShadow: false, notch: false, glow: false, borderAlpha: 0.3, surfaceAlpha: 0 },
  // Editorial document look.
  paper: { radius: 2, buttonRadius: 2, borderWidth: 1, hardShadow: false, notch: false, glow: false, borderAlpha: 0.5, surfaceAlpha: 0 },
  'paper-doc': { radius: 2, buttonRadius: 2, borderWidth: 1, hardShadow: false, notch: false, glow: false, borderAlpha: 0.45, surfaceAlpha: 0 },
  // Synthwave / luminous stage.
  'neon-stage': { radius: 0, buttonRadius: 0, borderWidth: 1, hardShadow: false, notch: false, glow: true, borderAlpha: 0.6, surfaceAlpha: 0 },
  // Flat product surfaces, low glow.
  'clean-app': { radius: 12, buttonRadius: 8, borderWidth: 1, hardShadow: false, notch: false, glow: false, borderAlpha: 0.15, surfaceAlpha: 0.04 },
  // Dense operations layout.
  dashboard: { radius: 6, buttonRadius: 4, borderWidth: 1, hardShadow: false, notch: false, glow: false, borderAlpha: 0.3, surfaceAlpha: 0.06 },
  // Holographic layered glow.
  holo: { radius: 16, buttonRadius: 8, borderWidth: 1, hardShadow: false, notch: false, glow: true, borderAlpha: 0.4, surfaceAlpha: 0.2 },
  // Minimal near-black surfaces.
  void: { radius: 6, buttonRadius: 4, borderWidth: 1, hardShadow: false, notch: false, glow: false, borderAlpha: 0.12, surfaceAlpha: 0 },
  // Utility aliases used by dialogs/notifies with no mobile-specific look.
  sheet: { radius: 0, buttonRadius: 0, borderWidth: 1, hardShadow: false, notch: false, glow: false, borderAlpha: 0.25, surfaceAlpha: 0.12 },
  split: { radius: 12, buttonRadius: 8, borderWidth: 1, hardShadow: false, notch: false, glow: false, borderAlpha: 0.25, surfaceAlpha: 0.06 },
  drawer: { radius: 16, buttonRadius: 8, borderWidth: 1, hardShadow: false, notch: false, glow: false, borderAlpha: 0.28, surfaceAlpha: 0.1 },
  banner: { radius: 0, buttonRadius: 0, borderWidth: 1, hardShadow: false, notch: false, glow: false, borderAlpha: 0.2, surfaceAlpha: 0 },
  float: { radius: 16, buttonRadius: 8, borderWidth: 1, hardShadow: false, notch: false, glow: true, borderAlpha: 0.3, surfaceAlpha: 0.08 },
  glitch: { radius: 0, buttonRadius: 0, borderWidth: 1, hardShadow: true, notch: false, glow: false, borderAlpha: 1, surfaceAlpha: 0 },
  inbox: { radius: 12, buttonRadius: 8, borderWidth: 1, hardShadow: false, notch: false, glow: false, borderAlpha: 0.18, surfaceAlpha: 0.06 },
  hud: { radius: 4, buttonRadius: 4, borderWidth: 1, hardShadow: false, notch: false, glow: false, borderAlpha: 0.35, surfaceAlpha: 0.1 },
  chip: { radius: 999, buttonRadius: 999, borderWidth: 1, hardShadow: false, notch: false, glow: false, borderAlpha: 0.3, surfaceAlpha: 0 },
  arcade: { radius: 4, buttonRadius: 4, borderWidth: 2, hardShadow: true, notch: false, glow: true, borderAlpha: 0.6, surfaceAlpha: 0 },
  matrix: { radius: 0, buttonRadius: 0, borderWidth: 1, hardShadow: false, notch: false, glow: true, borderAlpha: 0.5, surfaceAlpha: 0 },
  command: { radius: 8, buttonRadius: 6, borderWidth: 1, hardShadow: false, notch: false, glow: false, borderAlpha: 0.25, surfaceAlpha: 0.1 },
  rail: { radius: 0, buttonRadius: 0, borderWidth: 1, hardShadow: false, notch: false, glow: false, borderAlpha: 0.2, surfaceAlpha: 0.08 },
  crt: { radius: 0, buttonRadius: 0, borderWidth: 1, hardShadow: false, notch: false, glow: true, borderAlpha: 0.5, surfaceAlpha: 0 },
  'cyber-grid': { radius: 8, buttonRadius: 5, borderWidth: 1, hardShadow: false, notch: true, glow: true, borderAlpha: 0.3, surfaceAlpha: 0 },
  'glass-dock': { radius: 18, buttonRadius: 10, borderWidth: 1, hardShadow: false, notch: false, glow: false, borderAlpha: 0.22, surfaceAlpha: 0.35 },
}

function pickSpec(id: string | undefined, fallback: FrameworkSpec): FrameworkSpec {
  if (!id) return fallback
  return SPECS[id] ?? fallback
}

export interface ResolvedFramework {
  menu: FrameworkSpec
  notify: FrameworkSpec
  dialog: FrameworkSpec
  input: FrameworkSpec
  surface: FrameworkSpec
  /** web notifyPosition id (bottom-right, top-center, …) */
  notifyPosition?: string
}

/**
 * Resolve the admin's per-element framework choices from siteConfig against the
 * theme's baseline framework style. Any field not set (or an unknown id) falls
 * back to the theme-derived `frameworkStyles(theme)` spec so existing themes
 * keep their look unless an admin explicitly chose a web style.
 */
export function resolveFramework(theme: Theme, cfg: SiteConfig | null): ResolvedFramework {
  const base = frameworkStyles(theme)
  const fallback: FrameworkSpec = {
    radius: base.radius,
    buttonRadius: base.buttonRadius,
    borderWidth: base.borderWidth,
    hardShadow: base.hardShadow,
    notch: base.notch,
    glow: base.glow,
    borderAlpha: 0.3,
    surfaceAlpha: 0,
  }
  const f = cfg ?? {}
  return {
    menu: pickSpec(f.menuStyle as string | undefined, fallback),
    notify: pickSpec(f.notifyStyle as string | undefined, fallback),
    dialog: pickSpec(f.dialogStyle as string | undefined, fallback),
    input: pickSpec(f.inputStyle as string | undefined, fallback),
    surface: pickSpec(f.surfaceStyle as string | undefined, fallback),
    notifyPosition: typeof f.notifyPosition === 'string' ? f.notifyPosition : undefined,
  }
}
