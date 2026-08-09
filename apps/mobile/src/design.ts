import { Platform, TextStyle } from 'react-native'

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