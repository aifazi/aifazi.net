import { Platform, TextStyle } from 'react-native'
import { Theme, ThemeFamily, ThemeId, themeFamily } from './themes'

/**
 * Shared cyber design tokens used across the mobile component kit so every
 * screen inherits the web app's visual language: monospace code font for all
 * micro-labels/buttons, wide tracking, uppercase treatment.
 *
 * The web loads Rajdhani + Share Tech Mono; on mobile we approximate with the
 * platform monospace (Menlo on iOS) which renders reliably without bundling
 * font assets.
 */
export const CODE_FONT = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default: 'monospace',
})

/** Base spacing scale (px). Screens default to `xxxl`; cards/rows use `md`/`xl`. */
export const SPACE = {
  xxs: 2,
  xs: 4,
  sm: 6,
  md: 8,
  lg: 10,
  xl: 12,
  xxl: 14,
  xxxl: 16,
  huge: 18,
  giant: 20,
  mega: 24,
  jumbo: 30,
  colossal: 40,
  page: 96,
} as const

/**
 * Shared font-size scale. Screens should prefer these over raw numbers so a
 * future global type scale / accessibility ramp can change in one place.
 */
export const FONT = {
  nano: 8,
  micro: 9,
  xs: 10,
  sm: 11,
  md: 12,
  body: 13,
  base: 14,
  card: 15,
  section: 16,
  lead: 18,
  h3: 20,
  h2: 22,
  h1: 24,
  title: 26,
} as const

export type TitleWeight = '600' | '700' | '800' | '900'

/**
 * Mono uppercase micro-label — the web's signature `.section-tag` / form-label
 * look: 9-11px code font, wide letter-spacing, uppercase.
 */
export function micro(size = 10, spacing = 2, weight: TitleWeight = '700'): TextStyle {
  return {
    fontFamily: CODE_FONT,
    fontSize: size,
    fontWeight: weight,
    letterSpacing: spacing,
    textTransform: 'uppercase',
  }
}

/** Button label: mono uppercase, bold, wide tracking (web `.btn-primary`). */
export function buttonLabel(fontSize = 13, spacing = 2.5): TextStyle {
  return {
    fontFamily: CODE_FONT,
    fontSize,
    fontWeight: '800',
    letterSpacing: spacing,
    textTransform: 'uppercase',
  }
}

/** Mono small tag used by badges/chips/status pills. */
export function tagLabel(size = 9, spacing = 1.5): TextStyle {
  return micro(size, spacing, '800')
}

export interface FrameworkStyles {
  family: ThemeFamily
  /** button corner radius — sharp families go 0, glass/paper get soft rounds */
  buttonRadius: number
  /** card/surface corner radius */
  radius: number
  /** hard offset shadow (brutalist) vs soft glow */
  hardShadow: boolean
  /** border width multiplier — brutalist/retro get thicker edges */
  borderWidth: number
  /** whether the chamfered corner notch is drawn on primary buttons */
  notch: boolean
  /** heavy glow behind accents (neon/synthwave) */
  glow: boolean
  /** letter-spacing for headings */
  headingSpacing: number
}

/**
 * UI personality kind — the design language a theme speaks on mobile. Several
 * themes share a kind (same family vibe) but every theme id gets its own
 * entry in THEME_PERSONALITIES below with exact tokens, so each of the 51
 * themes has a distinct, documented personality.
 */
export type ThemePersonalityKind =
  | 'cyber-command' // angular chamfered command-center: notch + glow (cyber family)
  | 'neon-glow' // sharp synthwave stage: square corners, heavy glow (neon family)
  | 'pill-round' // fully rounded pills: buttonRadius 999, soft surfaces
  | 'soft-round' // clay-like soft rounds: large (50) button radius, radius floor 14
  | 'glass-frost' // frosted translucent: radius floor 16 + BlurView in Card (ui.tsx)
  | 'aurora-soft' // soft radius + overlay emphasis (no blur primitive on RN — see below)
  | 'near-sharp' // tight 2px corners: angular noir without full brutalism
  | 'crt-mono' // CRT/mono flavor: mono type + sharp corners, hard offset shadow
  | 'brutal-sharp' // sharp/brutalist: radius 0, square buttons, hard shadow, bw 2
  | 'arcade-sharp' // retro arcade cabinet: hard shadow + thick borders, card keeps theme radius
  | 'paper-sharp' // editorial document: razor 0/0, flat, no shadow play
  | 'frost-pill' // icy pill: frosted-soft radius with fully round buttons
  | 'neutral-dark' // quiet default dark: neutral 8/5 geometry, color does the talking

export interface ThemePersonality {
  kind: ThemePersonalityKind
  /** button corner radius — mirrors the resolved frameworkStyles().buttonRadius */
  buttonRadius: number
  /** card/surface corner radius — mirrors the resolved frameworkStyles().radius */
  radius: number
  /** hard offset shadow (brutalist/retro) vs soft glow */
  hardShadow: boolean
  /** border width multiplier — brutalist/retro get thicker edges */
  borderWidth: number
  /** chamfered corner notch on primary buttons (cyber only) */
  notch: boolean
  /** heavy glow behind accents (neon/cyber) */
  glow: boolean
}

/**
 * Neutral fallback personality for unknown/future theme ids: quiet geometry
 * (radius 8 / buttonRadius 5, no shadow/notch/glow tricks) instead of
 * undefined — mirrors the web fallback. Mono defaults to false via
 * resolveTheme() in themes.ts.
 */
export const NEUTRAL_PERSONALITY: ThemePersonality = {
  kind: 'neutral-dark',
  buttonRadius: 5,
  radius: 8,
  hardShadow: false,
  borderWidth: 1,
  notch: false,
  glow: false,
}

/**
 * Per-theme UI personalities — exhaustive over ThemeId so tsc enforces
 * coverage when themes are added. Values equal the long-standing family
 * derivation (see frameworkStyles) so every pre-existing theme keeps its
 * exact current look; only the 11 ported themes needed verification (all
 * already sensible: paper 0/0 sharp, minecraft 0/0 mono, sonic pill-round,
 * ice frost-pill, honey/violet/teal pill-round, mario arcade-sharp,
 * ember/cobalt/slate neutral-dark).
 *
 * Justification per family:
 * - Sharp/brutalist (0/0 + hardShadow + bw 2): minecraft, brutalist/
 *   brutalist-dark, win95/win95-dark, terminal/terminal-light — blocky,
 *   terminal/retro hardware reads as square pixels and bevels.
 * - Pill/round (buttonRadius 999, soft radius): ocean/ocean-light,
 *   rose/rose-light, honey-dark, violet-dark, teal-dark, sonic — fluid,
 *   friendly, motion-brand themes want fully round affordances.
 * - Glass (radius floor 16 + BlurView in Card; aurora soft 14/8 + overlay
 *   emphasis): glass-dark/glass-light, macos/macos-dark blur for real via
 *   expo-blur; aurora/aurora-light have no blur primitive on RN so the
 *   personality leans on the soft radius + colors.overlay scrim instead.
 *   (frameworkStyles has no translucency/blur flags — surfaceAlpha/
 *   borderAlpha live only in the framework.ts admin-spec layer.)
 * - CRT/mono (mono type + sharp + hard shadow): terminal/terminal-light,
 *   pacman/pacman-light (pacman precedent: mono + tight 2px radius),
 *   minecraft (mono kept as ported). No other theme sets mono:true.
 * - Everything else preserves its current radius/buttonRadius.
 */
export const THEME_PERSONALITIES: Record<ThemeId, ThemePersonality> = {
  // ── cyber-command: angular chamfered command-center ──
  'cyber-dark': { kind: 'cyber-command', buttonRadius: 5, radius: 8, hardShadow: false, borderWidth: 1, notch: true, glow: true },
  light: { kind: 'cyber-command', buttonRadius: 8, radius: 12, hardShadow: false, borderWidth: 1, notch: true, glow: true },
  // ── neon-glow: sharp synthwave stage ──
  synthwave: { kind: 'neon-glow', buttonRadius: 0, radius: 0, hardShadow: false, borderWidth: 1, notch: false, glow: true },
  'synthwave-light': { kind: 'neon-glow', buttonRadius: 0, radius: 0, hardShadow: false, borderWidth: 1, notch: false, glow: true },
  // ── pill-round: fully rounded pills ──
  ocean: { kind: 'pill-round', buttonRadius: 999, radius: 14, hardShadow: false, borderWidth: 1, notch: false, glow: false },
  'ocean-light': { kind: 'pill-round', buttonRadius: 999, radius: 14, hardShadow: false, borderWidth: 1, notch: false, glow: false },
  rose: { kind: 'pill-round', buttonRadius: 999, radius: 14, hardShadow: false, borderWidth: 1, notch: false, glow: false },
  'rose-light': { kind: 'pill-round', buttonRadius: 999, radius: 14, hardShadow: false, borderWidth: 1, notch: false, glow: false },
  sonic: { kind: 'pill-round', buttonRadius: 999, radius: 12, hardShadow: false, borderWidth: 1, notch: false, glow: false },
  'honey-dark': { kind: 'pill-round', buttonRadius: 999, radius: 12, hardShadow: false, borderWidth: 1, notch: false, glow: false },
  'violet-dark': { kind: 'pill-round', buttonRadius: 999, radius: 14, hardShadow: false, borderWidth: 1, notch: false, glow: false },
  'teal-dark': { kind: 'pill-round', buttonRadius: 999, radius: 14, hardShadow: false, borderWidth: 1, notch: false, glow: false },
  // ── soft-round: clay-like soft rounds (paper family floor) ──
  pastel: { kind: 'soft-round', buttonRadius: 50, radius: 14, hardShadow: false, borderWidth: 1, notch: false, glow: false },
  'pastel-dark': { kind: 'soft-round', buttonRadius: 50, radius: 14, hardShadow: false, borderWidth: 1, notch: false, glow: false },
  neumorph: { kind: 'soft-round', buttonRadius: 50, radius: 14, hardShadow: false, borderWidth: 1, notch: false, glow: false },
  'neumorph-dark': { kind: 'soft-round', buttonRadius: 50, radius: 14, hardShadow: false, borderWidth: 1, notch: false, glow: false },
  // ── glass-frost: frosted translucent (BlurView in Card) ──
  'glass-dark': { kind: 'glass-frost', buttonRadius: 8, radius: 16, hardShadow: false, borderWidth: 1, notch: false, glow: false },
  'glass-light': { kind: 'glass-frost', buttonRadius: 8, radius: 16, hardShadow: false, borderWidth: 1, notch: false, glow: false },
  macos: { kind: 'glass-frost', buttonRadius: 10, radius: 16, hardShadow: false, borderWidth: 1, notch: false, glow: false },
  'macos-dark': { kind: 'glass-frost', buttonRadius: 10, radius: 16, hardShadow: false, borderWidth: 1, notch: false, glow: false },
  // ── aurora-soft: soft radius + overlay emphasis (no RN blur) ──
  aurora: { kind: 'aurora-soft', buttonRadius: 8, radius: 14, hardShadow: false, borderWidth: 1, notch: false, glow: false },
  'aurora-light': { kind: 'aurora-soft', buttonRadius: 8, radius: 14, hardShadow: false, borderWidth: 1, notch: false, glow: false },
  // ── near-sharp: tight angular noir ──
  'neon-noir': { kind: 'near-sharp', buttonRadius: 2, radius: 2, hardShadow: false, borderWidth: 1, notch: false, glow: false },
  'neon-noir-light': { kind: 'near-sharp', buttonRadius: 2, radius: 2, hardShadow: false, borderWidth: 1, notch: false, glow: false },
  // ── crt-mono: mono type + sharp + hard shadow ──
  terminal: { kind: 'crt-mono', buttonRadius: 0, radius: 0, hardShadow: true, borderWidth: 2, notch: false, glow: false },
  'terminal-light': { kind: 'crt-mono', buttonRadius: 0, radius: 0, hardShadow: true, borderWidth: 2, notch: false, glow: false },
  pacman: { kind: 'crt-mono', buttonRadius: 0, radius: 2, hardShadow: true, borderWidth: 2, notch: false, glow: false },
  'pacman-light': { kind: 'crt-mono', buttonRadius: 0, radius: 2, hardShadow: true, borderWidth: 2, notch: false, glow: false },
  minecraft: { kind: 'crt-mono', buttonRadius: 0, radius: 0, hardShadow: true, borderWidth: 2, notch: false, glow: false },
  // ── brutal-sharp: sharp/brutalist ──
  brutalist: { kind: 'brutal-sharp', buttonRadius: 0, radius: 0, hardShadow: true, borderWidth: 2, notch: false, glow: false },
  'brutalist-dark': { kind: 'brutal-sharp', buttonRadius: 0, radius: 0, hardShadow: true, borderWidth: 2, notch: false, glow: false },
  win95: { kind: 'brutal-sharp', buttonRadius: 0, radius: 0, hardShadow: true, borderWidth: 2, notch: false, glow: false },
  'win95-dark': { kind: 'brutal-sharp', buttonRadius: 0, radius: 0, hardShadow: true, borderWidth: 2, notch: false, glow: false },
  // ── arcade-sharp: retro cabinet (buttons square, card keeps theme radius) ──
  mario: { kind: 'arcade-sharp', buttonRadius: 0, radius: 8, hardShadow: true, borderWidth: 2, notch: false, glow: false },
  // ── paper-sharp: editorial document ──
  paper: { kind: 'paper-sharp', buttonRadius: 0, radius: 0, hardShadow: false, borderWidth: 1, notch: false, glow: false },
  // ── frost-pill: icy pill ──
  ice: { kind: 'frost-pill', buttonRadius: 999, radius: 14, hardShadow: false, borderWidth: 1, notch: false, glow: false },
  // ── neutral-dark: quiet defaults, color does the talking ──
  midnight: { kind: 'neutral-dark', buttonRadius: 6, radius: 10, hardShadow: false, borderWidth: 1, notch: false, glow: false },
  'midnight-light': { kind: 'neutral-dark', buttonRadius: 6, radius: 10, hardShadow: false, borderWidth: 1, notch: false, glow: false },
  crimson: { kind: 'neutral-dark', buttonRadius: 5, radius: 8, hardShadow: false, borderWidth: 1, notch: false, glow: false },
  'crimson-light': { kind: 'neutral-dark', buttonRadius: 5, radius: 8, hardShadow: false, borderWidth: 1, notch: false, glow: false },
  forest: { kind: 'neutral-dark', buttonRadius: 5, radius: 8, hardShadow: false, borderWidth: 1, notch: false, glow: false },
  'forest-light': { kind: 'neutral-dark', buttonRadius: 5, radius: 8, hardShadow: false, borderWidth: 1, notch: false, glow: false },
  toxic: { kind: 'neutral-dark', buttonRadius: 5, radius: 8, hardShadow: false, borderWidth: 1, notch: false, glow: false },
  'toxic-light': { kind: 'neutral-dark', buttonRadius: 5, radius: 8, hardShadow: false, borderWidth: 1, notch: false, glow: false },
  amber: { kind: 'neutral-dark', buttonRadius: 5, radius: 8, hardShadow: false, borderWidth: 1, notch: false, glow: false },
  'amber-light': { kind: 'neutral-dark', buttonRadius: 5, radius: 8, hardShadow: false, borderWidth: 1, notch: false, glow: false },
  lava: { kind: 'neutral-dark', buttonRadius: 5, radius: 8, hardShadow: false, borderWidth: 1, notch: false, glow: false },
  'lava-light': { kind: 'neutral-dark', buttonRadius: 5, radius: 8, hardShadow: false, borderWidth: 1, notch: false, glow: false },
  'ember-dark': { kind: 'neutral-dark', buttonRadius: 5, radius: 8, hardShadow: false, borderWidth: 1, notch: false, glow: false },
  'cobalt-dark': { kind: 'neutral-dark', buttonRadius: 5, radius: 8, hardShadow: false, borderWidth: 1, notch: false, glow: false },
  'slate-dark': { kind: 'neutral-dark', buttonRadius: 5, radius: 8, hardShadow: false, borderWidth: 1, notch: false, glow: false },
}

/**
 * Look up a theme's personality by id. Unknown/future ids resolve to
 * NEUTRAL_PERSONALITY (radius 8 / buttonRadius 5, no tricks) instead of
 * undefined — defensive, mirrors the web fallback.
 */
export function themePersonality(id: string): ThemePersonality {
  return (THEME_PERSONALITIES as Record<string, ThemePersonality>)[id] ?? NEUTRAL_PERSONALITY
}

/**
 * Per-family (web "framework style") overrides so mobile mirrors the web's
 * design languages: angular chamfered cyber, sharp brutalist, flat retro,
 * translucent glass, soft paper/neumorph, glowing neon.
 */
export function frameworkStyles(theme: Theme): FrameworkStyles {
  const f = themeFamily(theme.id)
  const p = themePersonality(theme.id)
  return {
    family: f,
    buttonRadius: p.buttonRadius,
    radius: p.radius,
    hardShadow: p.hardShadow,
    borderWidth: p.borderWidth,
    notch: p.notch,
    glow: p.glow,
    headingSpacing: theme.mono ? 1 : f === 'cyber' ? 0.4 : 0.2,
  }
}