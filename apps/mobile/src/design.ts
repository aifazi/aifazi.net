import { Platform, TextStyle } from 'react-native'
import { Theme, ThemeFamily, themeFamily } from './themes'

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
 * Per-family (web "framework style") overrides so mobile mirrors the web's
 * design languages: angular chamfered cyber, sharp brutalist, flat retro,
 * translucent glass, soft paper/neumorph, glowing neon.
 */
export function frameworkStyles(theme: Theme): FrameworkStyles {
  const f = themeFamily(theme.id)
  const sharp = f === 'brutalist' || f === 'retro' || f === 'cyber'
  return {
    family: f,
    buttonRadius:
      f === 'glass' || f === 'paper' ? Math.max(8, theme.buttonRadius)
      : f === 'brutalist' || f === 'retro' ? 0
      : theme.buttonRadius,
    radius: f === 'glass' ? 16 : f === 'paper' ? 14 : theme.radius,
    hardShadow: f === 'brutalist' || f === 'retro',
    borderWidth: f === 'brutalist' ? 2 : f === 'retro' ? 2 : 1,
    notch: f === 'cyber',
    glow: f === 'neon' || f === 'cyber',
    headingSpacing: theme.mono ? 1 : f === 'cyber' ? 0.4 : 0.2,
  }
}