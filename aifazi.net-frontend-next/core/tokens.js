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
