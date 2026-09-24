/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  DESIGN TOKENS — Single source of truth for all UI values   ║
 * ║  Every component reads from here — NOTHING is hardcoded.    ║
 * ║                                                              ║
 * ║  Usage:                                                      ║
 * ║    import { t, VARIANTS, space, zIndex } from '@/core/ui'   ║
 * ║    style={{ color: t.green, fontFamily: t.fontMono }}        ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

// ── CSS custom property bridges ───────────────────────────────────────────────
// These are CSS var() strings — safe to use in any inline style.
// They automatically follow the active theme.
export const t = {
  // Backgrounds
  bg:          'var(--bg)',
  bg2:         'var(--bg2)',
  bg3:         'var(--bg3)',
  bg4:         'var(--bg4)',
  // Text
  text:        'var(--text)',
  text2:       'var(--text2)',
  muted:       'var(--muted)',
  link:        'var(--link)',
  // Accent colors
  green:       'var(--green)',
  cyan:        'var(--cyan)',
  orange:      'var(--orange)',
  red:         'var(--red)',
  purple:      'var(--purple)',
  // Borders
  border:      'var(--border)',
  border2:     'var(--border2)',
  // Effects
  glow:        'var(--glow)',
  glowCyan:    'var(--glow-cyan)',
  shadowCard:  'var(--shadow-card)',
  shadowSm:    'var(--shadow-sm)',
  // Per-theme component tokens (core/componentTokens.js) — follow the active
  // theme family; fallbacks preserve the baseline look before they apply.
  btnBg:       'var(--comp-btn-bg, var(--green))',
  btnText:     'var(--comp-btn-text, #000)',
  btnRadius:   'var(--comp-btn-radius, 6px)',
  btnShadow:   'var(--comp-btn-shadow, var(--glow))',
  cardBg:      'var(--comp-card-bg, var(--bg2))',
  cardBorder:  'var(--comp-card-border, var(--border))',
  cardRadius:  'var(--comp-card-radius, 12px)',
  cardShadow:  'var(--comp-card-shadow, var(--shadow-card))',
  inputBg:     'var(--comp-input-bg, var(--bg3))',
  inputBorder: 'var(--comp-input-border, var(--border))',
  inputFocus:  'var(--comp-input-focus, 0 0 0 2px rgba(0,212,255,0.10))',
  inputRadius: 'var(--comp-input-radius, 6px)',
  badgeBg:     'var(--comp-badge-bg, rgba(0,212,255,0.05))',
  badgeText:   'var(--comp-badge-text, var(--cyan))',
  badgeRadius: 'var(--comp-badge-radius, 3px)',
  bubbleOwn:   'var(--comp-bubble-own, color-mix(in srgb, var(--green) 10%, transparent))',
  bubbleOther: 'var(--comp-bubble-other, var(--bg3))',
  bubbleRadius:'var(--comp-bubble-radius, 12px)',
  // Typography
  fontDisplay: 'var(--font-display)',
  fontMono:    'var(--font-mono)',
  fontCode:    'var(--font-code)',
}

// ── Semantic variants ─────────────────────────────────────────────────────────
// Maps intent → visual config. All color values stay as CSS vars.
export const VARIANTS = {
  success: {
    color:  'var(--green)',
    bg:     'rgba(0,255,136,0.06)',
    border: 'rgba(0,255,136,0.25)',
    glow:   'rgba(0,255,136,0.3)',
    icon:   '✓',
    label:  'SUCCESS',
  },
  error: {
    color:  'var(--red)',
    bg:     'rgba(255,71,87,0.06)',
    border: 'rgba(255,71,87,0.25)',
    glow:   'rgba(255,71,87,0.3)',
    icon:   '✕',
    label:  'ERROR',
  },
  warning: {
    color:  'var(--orange)',
    bg:     'rgba(255,107,53,0.06)',
    border: 'rgba(255,107,53,0.25)',
    glow:   'rgba(255,107,53,0.3)',
    icon:   '⚠',
    label:  'WARNING',
  },
  info: {
    color:  'var(--cyan)',
    bg:     'rgba(0,212,255,0.06)',
    border: 'rgba(0,212,255,0.25)',
    glow:   'rgba(0,212,255,0.3)',
    icon:   'ℹ',
    label:  'INFO',
  },
  danger: {
    color:  'var(--red)',
    bg:     'rgba(255,71,87,0.06)',
    border: 'rgba(255,71,87,0.25)',
    glow:   'rgba(255,71,87,0.3)',
    icon:   '⚠',
    label:  'DANGER',
  },
}

// ── Spacing scale (px) ────────────────────────────────────────────────────────
export const space = {
  xs:   4,
  sm:   8,
  md:   16,
  lg:   24,
  xl:   32,
  '2xl': 48,
  '3xl': 64,
}

// ── Font size scale (px) ──────────────────────────────────────────────────────
export const fontSize = {
  xs:    10,
  sm:    11,
  base:  13,
  md:    14,
  lg:    16,
  xl:    18,
  '2xl': 22,
  '3xl': 28,
  '4xl': 36,
  '5xl': 48,
}

// ── Border radius scale (px) ──────────────────────────────────────────────────
export const radius = {
  none: 0,
  sm:   4,
  md:   8,
  lg:   12,
  xl:   16,
  full: 9999,
}

// ── Z-index scale ─────────────────────────────────────────────────────────────
export const zIndex = {
  base:     1,
  raised:   10,
  dropdown: 1000,
  sticky:   1100,
  overlay:  9990,
  modal:    9991,
  toast:    99999,
  cursor:   999999,
}
