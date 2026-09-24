/**
 * core/componentTokens.js — per-theme component styling tokens.
 *
 * Every theme family defines its OWN button / card / input / badge / bubble
 * look (colors, radius, borders, shadows) instead of components falling back
 * to one generic default. Tokens are plain data — no per-component switch
 * statements anywhere; consumers read the merged object or the CSS variables
 * it produces.
 *
 * Flow: getComponentTokens(themeId) deep-merges DEFAULT_TOKENS <- family
 * overrides <- per-theme id overrides (and resolves light-mode button text),
 * then either tokensToCssVars() exposes them as --comp-* variables under the
 * active [data-theme] (applied by providers.tsx via applyComponentTokens) or
 * resolveComponentTokens() bakes them against a static palette for admin
 * preview cards. All ~70 VALID_THEMES ids keep working: unknown ids fall
 * back to the defaults.
 */

import { LIGHT_THEMES } from './themeCatalog'

// ── Angular clip used by the cyber family (matches the generic .btn-primary) ─
const CLIP_ANGULAR = 'polygon(0 0,calc(100% - 12px) 0,100% 12px,100% 100%,12px 100%,0 calc(100% - 12px))'
const CLIP_SONIC = 'polygon(0 0,calc(100% - 14px) 0,100% 14px,100% 100%,14px 100%,0 calc(100% - 14px))'

// ── Component-token schema ────────────────────────────────────────────────────
// button { bg, text, textLight, border, radius, shadow, clip }
// card   { bg, border, radius, shadow }
// input  { bg, border, borderFocus, focus, radius }
// badge  { bg, text, border, radius }
// bubble { own, ownText, other, radius }
export const DEFAULT_TOKENS = {
  button: {
    bg: 'var(--green)',
    text: '#000000',
    textLight: '#ffffff',
    border: 'none',
    radius: '6px',
    shadow: 'var(--glow)',
    clip: CLIP_ANGULAR,
  },
  card: {
    bg: 'var(--bg2)',
    border: '1px solid var(--border)',
    radius: '12px',
    shadow: 'var(--shadow-card)',
  },
  input: {
    bg: 'var(--bg2)',
    border: '1px solid var(--border)',
    borderFocus: 'var(--green)',
    focus: '0 0 0 3px rgba(0,255,136,0.08)',
    radius: '6px',
  },
  badge: {
    bg: 'rgba(0,212,255,0.05)',
    text: 'var(--cyan)',
    border: '1px solid rgba(0,212,255,0.2)',
    radius: '3px',
  },
  bubble: {
    own: 'color-mix(in srgb, var(--green) 10%, transparent)',
    ownText: 'var(--text)',
    other: 'var(--bg3)',
    radius: '12px',
  },
}

// ── Theme id → family (covers every VALID_THEMES id; no renames) ─────────────
export const THEME_FAMILY_OF = {
  'cyber-dark': 'cyber', 'cyber-light': 'cyber', light: 'cyber',
  midnight: 'midnight', 'midnight-light': 'midnight',
  crimson: 'crimson', 'crimson-light': 'crimson',
  ocean: 'ocean', 'ocean-light': 'ocean',
  amber: 'amber', 'amber-light': 'amber',
  rose: 'rose', 'rose-light': 'rose',
  forest: 'forest', 'forest-light': 'forest',
  lava: 'lava', 'lava-light': 'lava',
  toxic: 'toxic', 'toxic-light': 'toxic',
  ice: 'ice',
  'glass-dark': 'glass', 'glass-light': 'glass',
  brutalist: 'brutalist', 'brutalist-dark': 'brutalist',
  synthwave: 'synthwave', 'synthwave-light': 'synthwave',
  paper: 'paper', 'paper-dark': 'paper',
  neumorph: 'neumorph', 'neumorph-dark': 'neumorph',
  terminal: 'terminal', 'terminal-light': 'terminal',
  macos: 'macos', 'macos-dark': 'macos',
  'neon-noir': 'neon-noir', 'neon-noir-light': 'neon-noir',
  pastel: 'pastel', 'pastel-dark': 'pastel',
  win95: 'win95', 'win95-dark': 'win95',
  aurora: 'aurora', 'aurora-light': 'aurora',
  'ember-dark': 'ember', 'ember-light': 'ember',
  'cobalt-dark': 'cobalt', 'cobalt-light': 'cobalt',
  'slate-dark': 'slate', 'slate-light': 'slate',
  'honey-dark': 'honey', 'honey-light': 'honey',
  'violet-dark': 'violet', 'violet-light': 'violet',
  'teal-dark': 'teal', 'teal-light': 'teal',
  mario: 'mario', 'mario-light': 'mario',
  minecraft: 'minecraft', 'minecraft-light': 'minecraft',
  sonic: 'sonic', 'sonic-light': 'sonic',
  pacman: 'pacman', 'pacman-light': 'pacman',
  dracula: 'dracula',
  nord: 'nord',
  'tokyo-night': 'tokyo-night',
  gruvbox: 'gruvbox',
  'solarized-dark': 'solarized-dark',
  monokai: 'monokai',
  catppuccin: 'catppuccin',
  'one-dark': 'one-dark',
}

// ── Per-family overrides (deltas over DEFAULT_TOKENS) ─────────────────────────
// Color families use var(--green)/var(--cyan) so light variants inherit their
// own palette; structural fields (radius/border/shadow/clip) are literal per
// family. Single-look families use literal brand colors.
export const FAMILY_TOKENS = {
  cyber: {},
  midnight: {
    button: { radius: '10px', shadow: '0 0 18px rgba(168,85,247,0.45)', clip: 'none' },
    card: { border: '1px solid rgba(168,85,247,0.35)', radius: '10px', shadow: '0 8px 32px rgba(0,0,0,0.55), 0 0 18px rgba(168,85,247,0.12)' },
    input: { borderFocus: '#a855f7', focus: '0 0 0 3px rgba(168,85,247,0.15)', radius: '10px' },
    badge: { bg: 'rgba(168,85,247,0.08)', text: '#a855f7', border: '1px solid rgba(168,85,247,0.35)', radius: '6px' },
    bubble: { radius: '14px' },
  },
  crimson: {
    button: { radius: '4px', shadow: '0 0 16px rgba(239,68,68,0.5)', clip: 'none' },
    card: { border: '2px solid rgba(239,68,68,0.35)', radius: '4px', shadow: '0 8px 28px rgba(0,0,0,0.55), 0 0 16px rgba(239,68,68,0.12)' },
    input: { borderFocus: '#ef4444', focus: '0 0 0 3px rgba(239,68,68,0.14)', radius: '4px' },
    badge: { bg: 'rgba(239,68,68,0.08)', text: '#ef4444', border: '1px solid rgba(239,68,68,0.4)', radius: '2px' },
    bubble: { radius: '8px' },
  },
  ocean: {
    button: { radius: '8px', shadow: '0 0 18px rgba(59,130,246,0.5)', clip: 'none' },
    card: { border: '1px solid rgba(59,130,246,0.35)', radius: '8px', shadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 18px rgba(59,130,246,0.12)' },
    input: { borderFocus: '#3b82f6', focus: '0 0 0 3px rgba(59,130,246,0.15)', radius: '8px' },
    badge: { bg: 'rgba(59,130,246,0.08)', text: '#3b82f6', border: '1px solid rgba(59,130,246,0.35)', radius: '999px' },
    bubble: { radius: '16px' },
  },
  amber: {
    button: { radius: '999px', shadow: '0 0 18px rgba(245,158,11,0.45)', clip: 'none' },
    card: { border: '1px solid rgba(245,158,11,0.35)', radius: '14px', shadow: '0 8px 28px rgba(0,0,0,0.5), 0 0 16px rgba(245,158,11,0.1)' },
    input: { borderFocus: '#f59e0b', focus: '0 0 0 3px rgba(245,158,11,0.15)', radius: '12px' },
    badge: { bg: 'rgba(245,158,11,0.1)', text: '#f59e0b', border: '1px solid rgba(245,158,11,0.4)', radius: '999px' },
    bubble: { radius: '16px' },
  },
  rose: {
    button: { radius: '18px', shadow: '0 4px 20px rgba(244,114,182,0.4)', clip: 'none' },
    card: { border: '1px solid rgba(244,114,182,0.35)', radius: '18px', shadow: '0 8px 30px rgba(0,0,0,0.45), 0 0 18px rgba(244,114,182,0.12)' },
    input: { borderFocus: '#f472b6', focus: '0 0 0 3px rgba(244,114,182,0.15)', radius: '12px' },
    badge: { bg: 'rgba(244,114,182,0.08)', text: '#f472b6', border: '1px solid rgba(244,114,182,0.4)', radius: '999px' },
    bubble: { radius: '18px' },
  },
  forest: {
    button: { radius: '8px', shadow: '0 0 16px rgba(74,222,128,0.4)', clip: 'none' },
    card: { border: '1px solid rgba(74,222,128,0.3)', radius: '8px', shadow: '0 8px 28px rgba(0,0,0,0.5), 0 0 16px rgba(74,222,128,0.1)' },
    input: { borderFocus: '#4ade80', focus: '0 0 0 3px rgba(74,222,128,0.14)', radius: '8px' },
    badge: { bg: 'rgba(74,222,128,0.08)', text: '#4ade80', border: '1px solid rgba(74,222,128,0.35)', radius: '6px' },
    bubble: { radius: '12px' },
  },
  lava: {
    button: { radius: '6px', shadow: '0 0 20px rgba(255,61,0,0.55)', clip: 'none' },
    card: { border: '1px solid rgba(255,61,0,0.4)', radius: '6px', shadow: '0 8px 32px rgba(0,0,0,0.6), 0 0 20px rgba(255,61,0,0.15)' },
    input: { borderFocus: '#ff3d00', focus: '0 0 0 3px rgba(255,61,0,0.16)', radius: '6px' },
    badge: { bg: 'rgba(255,61,0,0.1)', text: '#ff3d00', border: '1px solid rgba(255,61,0,0.4)', radius: '2px' },
    bubble: { own: 'color-mix(in srgb, var(--green) 14%, transparent)', radius: '10px' },
  },
  toxic: {
    button: { text: '#0a0a0a', textLight: '#1c2a06', radius: '0', shadow: '0 0 18px rgba(163,230,53,0.5)', clip: 'none' },
    card: { border: '1px solid rgba(163,230,53,0.4)', radius: '0', shadow: '0 0 24px rgba(163,230,53,0.12), 0 8px 28px rgba(0,0,0,0.6)' },
    input: { borderFocus: '#a3e635', focus: '0 0 0 3px rgba(163,230,53,0.16)', radius: '0' },
    badge: { bg: 'rgba(163,230,53,0.1)', text: '#a3e635', border: '1px solid rgba(163,230,53,0.4)', radius: '0' },
    bubble: { radius: '4px' },
  },
  ice: {
    button: { bg: '#0284c7', text: '#ffffff', textLight: '#ffffff', radius: '18px', shadow: '0 4px 20px rgba(2,132,199,0.35)', clip: 'none' },
    card: { bg: '#e3edf7', border: '1px solid rgba(2,132,199,0.3)', radius: '18px', shadow: '0 8px 28px rgba(2,132,199,0.14)' },
    input: { bg: '#ffffff', border: '1px solid rgba(2,132,199,0.35)', borderFocus: '#0284c7', focus: '0 0 0 3px rgba(2,132,199,0.16)', radius: '18px' },
    badge: { bg: 'rgba(2,132,199,0.08)', text: '#0284c7', border: '1px solid rgba(2,132,199,0.35)', radius: '999px' },
    bubble: { own: 'rgba(2,132,199,0.12)', ownText: '#0b1a2a', other: '#d8e6f2', radius: '18px' },
  },
  glass: {
    button: { bg: 'rgba(0,229,255,0.16)', text: '#d0e8ff', textLight: '#0e7490', border: '1px solid rgba(0,229,255,0.45)', radius: '16px', shadow: '0 0 18px rgba(0,229,255,0.25)', clip: 'none' },
    card: { bg: 'rgba(10,20,40,0.45)', border: '1px solid rgba(0,229,255,0.3)', radius: '16px', shadow: '0 8px 32px rgba(0,0,0,0.45)' },
    input: { bg: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.18)', borderFocus: '#00e5ff', focus: '0 0 0 3px rgba(0,229,255,0.18)', radius: '12px' },
    badge: { bg: 'rgba(0,229,255,0.08)', text: '#00e5ff', border: '1px solid rgba(0,229,255,0.3)', radius: '12px' },
    bubble: { own: 'color-mix(in srgb, var(--green) 14%, transparent)', other: 'color-mix(in srgb, var(--bg3) 55%, transparent)', radius: '16px' },
  },
  brutalist: {
    button: { bg: '#e8000d', text: '#f2f0ec', textLight: '#f2f0ec', border: '3px solid #000000', radius: '0', shadow: '5px 5px 0 #000000', clip: 'none' },
    card: { bg: '#e8e5df', border: '3px solid #000000', radius: '0', shadow: '5px 5px 0 #000000' },
    input: { bg: '#ffffff', border: '3px solid #000000', borderFocus: '#000000', focus: '4px 4px 0 #000000', radius: '0' },
    badge: { bg: '#000000', text: '#f2f0ec', border: '2px solid #000000', radius: '0' },
    bubble: { own: '#e8000d', ownText: '#f2f0ec', other: '#e8e5df', radius: '0' },
  },
  synthwave: {
    button: { bg: '#ff2d8b', text: '#ffffff', textLight: '#ffffff', radius: '0', shadow: '0 0 18px rgba(255,45,139,0.65)', clip: 'none' },
    card: { border: '1px solid rgba(255,45,139,0.45)', radius: '0', shadow: '0 0 24px rgba(255,45,139,0.2), 0 8px 30px rgba(0,0,0,0.7)' },
    input: { borderFocus: '#ff2d8b', focus: '0 0 0 3px rgba(255,45,139,0.2)', radius: '0' },
    badge: { bg: 'rgba(255,45,139,0.1)', text: '#ff2d8b', border: '1px solid rgba(255,45,139,0.4)', radius: '0' },
    bubble: { radius: '6px' },
  },
  paper: {
    button: { bg: '#c41a1a', text: '#ffffff', textLight: '#ffffff', radius: '3px', shadow: '0 2px 8px rgba(0,0,0,0.2)', clip: 'none' },
    card: { bg: '#ede8df', border: '1px solid rgba(0,0,0,0.25)', radius: '6px', shadow: '0 2px 16px rgba(0,0,0,0.1)' },
    input: { bg: '#fffdf8', border: '1px solid #d8c7b3', borderFocus: '#c41a1a', focus: '0 0 0 3px rgba(196,26,26,0.12)', radius: '2px' },
    badge: { bg: 'rgba(196,26,26,0.05)', text: '#c41a1a', border: '1px solid rgba(196,26,26,0.4)', radius: '3px' },
    bubble: { own: 'rgba(196,26,26,0.07)', ownText: '#1a1a1a', other: '#ede8df', radius: '6px' },
  },
  neumorph: {
    button: { bg: '#e0e5ec', text: '#6c63ff', textLight: '#6c63ff', radius: '50px', shadow: '5px 5px 12px #b0b8c4, -3px -3px 8px #ffffff', clip: 'none' },
    card: { bg: '#e8edf4', border: 'none', radius: '18px', shadow: '6px 6px 14px #b8bec8, -4px -4px 10px #ffffff' },
    input: { bg: '#e0e5ec', border: 'none', borderFocus: '#6c63ff', focus: 'inset 3px 3px 7px #b8bec8, inset -2px -2px 5px #ffffff', radius: '12px' },
    badge: { bg: '#e0e5ec', text: '#6c63ff', border: 'none', radius: '999px' },
    bubble: { own: '#e0e5ec', ownText: '#2d3748', other: '#e8edf4', radius: '18px' },
  },
  terminal: {
    button: { bg: 'transparent', text: '#33ff33', textLight: '#15803d', border: '1px solid #33ff33', radius: '0', shadow: 'none', clip: 'none' },
    card: { bg: '#0f0f0f', border: '1px solid rgba(51,255,51,0.3)', radius: '0', shadow: 'none' },
    input: { bg: '#050805', border: '1px solid rgba(51,255,51,0.45)', borderFocus: '#33ff33', focus: '0 0 12px rgba(51,255,51,0.25)', radius: '0' },
    badge: { bg: 'transparent', text: '#ffcc00', border: '1px solid rgba(255,204,0,0.5)', radius: '0' },
    bubble: { own: 'rgba(51,255,51,0.08)', ownText: '#33ff33', other: '#0f0f0f', radius: '0' },
  },
  macos: {
    button: { bg: '#0071e3', text: '#ffffff', textLight: '#ffffff', radius: '8px', shadow: '0 2px 8px rgba(0,113,227,0.35)', clip: 'none' },
    card: { bg: '#ffffff', border: '1px solid rgba(0,0,0,0.1)', radius: '18px', shadow: '0 4px 16px rgba(0,0,0,0.12)' },
    input: { bg: '#ffffff', border: '1px solid rgba(0,0,0,0.15)', borderFocus: '#0071e3', focus: '0 0 0 3px rgba(0,113,227,0.15)', radius: '8px' },
    badge: { bg: 'rgba(0,113,227,0.07)', text: '#0071e3', border: '1px solid rgba(0,113,227,0.28)', radius: '999px' },
    bubble: { own: 'rgba(0,113,227,0.1)', ownText: '#1d1d1f', other: '#ebebed', radius: '18px' },
  },
  'neon-noir': {
    button: { bg: '#ff6b35', text: '#000000', textLight: '#000000', radius: '2px', shadow: '0 0 20px rgba(255,107,53,0.5), 0 0 40px rgba(204,68,255,0.25)', clip: 'none' },
    card: { border: '1px solid rgba(204,68,255,0.3)', radius: '2px', shadow: '0 8px 40px rgba(0,0,0,0.8)' },
    input: { borderFocus: '#cc44ff', focus: '0 0 0 3px rgba(204,68,255,0.2)', radius: '2px' },
    badge: { bg: 'rgba(204,68,255,0.08)', text: '#cc44ff', border: '1px solid rgba(204,68,255,0.35)', radius: '2px' },
    bubble: { radius: '8px' },
  },
  pastel: {
    button: { bg: 'linear-gradient(135deg, #c084fc, #f9a8d4)', text: '#ffffff', textLight: '#ffffff', radius: '999px', shadow: '0 4px 14px rgba(192,132,252,0.4)', clip: 'none' },
    card: { bg: '#fff0fb', border: '1px solid rgba(192,132,252,0.3)', radius: '22px', shadow: '0 4px 20px rgba(192,132,252,0.15)' },
    input: { bg: '#ffffff', border: '1px solid rgba(192,132,252,0.35)', borderFocus: '#c084fc', focus: '0 0 0 3px rgba(192,132,252,0.18)', radius: '999px' },
    badge: { bg: 'rgba(192,132,252,0.1)', text: '#c084fc', border: '1px solid rgba(192,132,252,0.35)', radius: '999px' },
    bubble: { own: 'rgba(192,132,252,0.14)', ownText: '#3d1f5c', other: '#f5e8ff', radius: '20px' },
  },
  win95: {
    button: { bg: '#d4d0c8', text: '#000000', textLight: '#000000', border: '1px solid #808080', radius: '0', shadow: 'inset -1px -1px 0 #808080, inset 1px 1px 0 #ffffff, inset -2px -2px 0 #404040, inset 2px 2px 0 #dfdfdf', clip: 'none' },
    card: { bg: '#d4d0c8', border: 'none', radius: '0', shadow: 'inset -1px -1px 0 #808080, inset 1px 1px 0 #ffffff, inset -2px -2px 0 #404040, inset 2px 2px 0 #dfdfdf' },
    input: { bg: '#ffffff', border: '2px solid #808080', borderFocus: '#000080', focus: 'none', radius: '0' },
    badge: { bg: '#c0c0c0', text: '#000000', border: '1px solid #808080', radius: '0' },
    bubble: { own: '#d4d0c8', ownText: '#000000', other: '#c0c0c0', radius: '0' },
  },
  aurora: {
    button: { radius: '12px', shadow: '0 0 18px rgba(100,255,218,0.4)', clip: 'none' },
    card: { border: '1px solid rgba(100,255,218,0.3)', radius: '12px', shadow: '0 8px 32px rgba(0,0,0,0.55), 0 0 20px rgba(100,255,218,0.08)' },
    input: { borderFocus: '#64ffda', focus: '0 0 0 3px rgba(100,255,218,0.16)', radius: '12px' },
    badge: { bg: 'rgba(100,255,218,0.07)', text: '#64ffda', border: '1px solid rgba(100,255,218,0.3)', radius: '12px' },
    bubble: { radius: '14px' },
  },
  ember: {
    button: { radius: '4px', shadow: '0 0 18px rgba(255,87,34,0.5)', clip: 'none' },
    card: { border: '1px solid rgba(255,87,34,0.35)', radius: '4px', shadow: '0 8px 28px rgba(0,0,0,0.55), 0 0 18px rgba(255,87,34,0.12)' },
    input: { borderFocus: '#ff5722', focus: '0 0 0 3px rgba(255,87,34,0.16)', radius: '4px' },
    badge: { bg: 'rgba(255,87,34,0.09)', text: '#ff5722', border: '1px solid rgba(255,87,34,0.4)', radius: '4px' },
    bubble: { radius: '10px' },
  },
  cobalt: {
    button: { radius: '8px', shadow: '0 0 18px rgba(30,80,255,0.5)', clip: 'none' },
    card: { border: '1px solid rgba(30,80,255,0.35)', radius: '8px', shadow: '0 8px 30px rgba(0,0,0,0.55), 0 0 18px rgba(30,80,255,0.12)' },
    input: { borderFocus: '#1e50ff', focus: '0 0 0 3px rgba(30,80,255,0.16)', radius: '8px' },
    badge: { bg: 'rgba(30,80,255,0.09)', text: '#1e50ff', border: '1px solid rgba(30,80,255,0.4)', radius: '8px' },
    bubble: { radius: '12px' },
  },
  slate: {
    button: { text: '#0b0e12', radius: '6px', shadow: '0 2px 10px rgba(0,0,0,0.35)', clip: 'none' },
    card: { border: '1px solid rgba(148,163,184,0.3)', radius: '6px', shadow: '0 4px 18px rgba(0,0,0,0.35)' },
    input: { borderFocus: '#94a3b8', focus: '0 0 0 3px rgba(148,163,184,0.18)', radius: '6px' },
    badge: { bg: 'rgba(148,163,184,0.1)', text: '#94a3b8', border: '1px solid rgba(148,163,184,0.35)', radius: '4px' },
    bubble: { radius: '8px' },
  },
  honey: {
    button: { radius: '12px', shadow: '0 0 18px rgba(255,179,0,0.45)', clip: 'none' },
    card: { border: '1px solid rgba(255,179,0,0.35)', radius: '12px', shadow: '0 8px 28px rgba(0,0,0,0.5), 0 0 16px rgba(255,179,0,0.1)' },
    input: { borderFocus: '#ffb300', focus: '0 0 0 3px rgba(255,179,0,0.16)', radius: '12px' },
    badge: { bg: 'rgba(255,179,0,0.1)', text: '#ffb300', border: '1px solid rgba(255,179,0,0.4)', radius: '999px' },
    bubble: { radius: '14px' },
  },
  violet: {
    button: { radius: '14px', shadow: '0 0 18px rgba(139,92,246,0.5)', clip: 'none' },
    card: { border: '1px solid rgba(139,92,246,0.35)', radius: '14px', shadow: '0 8px 30px rgba(0,0,0,0.5), 0 0 18px rgba(139,92,246,0.12)' },
    input: { borderFocus: '#8b5cf6', focus: '0 0 0 3px rgba(139,92,246,0.16)', radius: '14px' },
    badge: { bg: 'rgba(139,92,246,0.09)', text: '#8b5cf6', border: '1px solid rgba(139,92,246,0.4)', radius: '999px' },
    bubble: { radius: '16px' },
  },
  teal: {
    button: { radius: '10px', shadow: '0 0 18px rgba(45,212,191,0.45)', clip: 'none' },
    card: { border: '1px solid rgba(45,212,191,0.35)', radius: '10px', shadow: '0 8px 28px rgba(0,0,0,0.5), 0 0 16px rgba(45,212,191,0.1)' },
    input: { borderFocus: '#2dd4bf', focus: '0 0 0 3px rgba(45,212,191,0.16)', radius: '10px' },
    badge: { bg: 'rgba(45,212,191,0.08)', text: '#2dd4bf', border: '1px solid rgba(45,212,191,0.35)', radius: '10px' },
    bubble: { radius: '12px' },
  },
  mario: {
    button: { bg: '#e52521', text: '#ffffff', textLight: '#ffffff', border: '2px solid #000000', radius: '0', shadow: '4px 4px 0 #000000', clip: 'none' },
    card: { border: '2px solid #000000', radius: '0', shadow: '4px 4px 0 rgba(0,0,0,0.45)' },
    input: { borderFocus: '#e52521', focus: '3px 3px 0 rgba(0,0,0,0.25)', radius: '0' },
    badge: { bg: '#e52521', text: '#ffffff', border: '1px solid #000000', radius: '0' },
    bubble: { own: 'rgba(229,37,33,0.14)', radius: '0' },
  },
  minecraft: {
    button: { bg: '#5ad427', text: '#141210', textLight: '#141210', border: '2px solid #000000', radius: '0', shadow: '4px 4px 0 #000000', clip: 'none' },
    card: { border: '2px solid #000000', radius: '0', shadow: '6px 6px 0 rgba(0,0,0,0.5)' },
    input: { borderFocus: '#5ad427', focus: '3px 3px 0 rgba(0,0,0,0.2)', radius: '0' },
    badge: { bg: '#5ad427', text: '#141210', border: '1px solid #000000', radius: '0' },
    bubble: { own: 'rgba(90,212,39,0.14)', radius: '0' },
  },
  sonic: {
    button: { bg: '#1e6fd9', text: '#ffffff', textLight: '#ffffff', border: '1px solid #f5d200', radius: '0', shadow: '0 0 16px rgba(30,111,217,0.6)', clip: CLIP_SONIC },
    card: { border: '1px solid rgba(30,111,217,0.45)', radius: '0', shadow: '0 8px 30px rgba(0,0,0,0.55), 0 0 18px rgba(30,111,217,0.15)' },
    input: { borderFocus: '#f5d200', focus: '0 0 0 3px rgba(245,210,0,0.18)', radius: '0' },
    badge: { bg: 'rgba(245,210,0,0.1)', text: '#f5d200', border: '1px solid rgba(245,210,0,0.45)', radius: '0' },
    bubble: { radius: '6px' },
  },
  pacman: {
    button: { bg: '#ffe000', text: '#1a0b00', textLight: '#1a0b00', radius: '0', shadow: '0 0 18px rgba(255,224,0,0.5)', clip: 'none' },
    card: { border: '1px solid rgba(255,224,0,0.4)', radius: '0', shadow: '0 0 24px rgba(255,224,0,0.1), 0 8px 28px rgba(0,0,0,0.6)' },
    input: { borderFocus: '#ffe000', focus: '0 0 0 3px rgba(255,224,0,0.18)', radius: '0' },
    badge: { bg: 'rgba(255,224,0,0.1)', text: '#ffe000', border: '1px solid rgba(255,224,0,0.4)', radius: '0' },
    bubble: { radius: '8px' },
  },
  dracula: {
    button: { bg: '#bd93f9', text: '#282a36', textLight: '#282a36', radius: '8px', shadow: '0 0 18px rgba(189,147,249,0.45)', clip: 'none' },
    card: { bg: '#2f3242', border: '1px solid rgba(189,147,249,0.35)', radius: '8px', shadow: '0 8px 30px rgba(0,0,0,0.55)' },
    input: { bg: '#2f3242', border: '1px solid rgba(189,147,249,0.3)', borderFocus: '#bd93f9', focus: '0 0 0 3px rgba(189,147,249,0.18)', radius: '8px' },
    badge: { bg: 'rgba(189,147,249,0.1)', text: '#bd93f9', border: '1px solid rgba(189,147,249,0.4)', radius: '8px' },
    bubble: { own: 'rgba(189,147,249,0.14)', ownText: '#f8f8f2', other: '#383c4e', radius: '12px' },
  },
  nord: {
    button: { bg: '#88c0d0', text: '#2e3440', textLight: '#2e3440', radius: '8px', shadow: '0 2px 12px rgba(136,192,208,0.35)', clip: 'none' },
    card: { bg: '#3b4252', border: '1px solid rgba(136,192,208,0.3)', radius: '8px', shadow: '0 8px 28px rgba(0,0,0,0.45)' },
    input: { bg: '#3b4252', border: '1px solid rgba(136,192,208,0.3)', borderFocus: '#88c0d0', focus: '0 0 0 3px rgba(136,192,208,0.18)', radius: '8px' },
    badge: { bg: 'rgba(136,192,208,0.1)', text: '#88c0d0', border: '1px solid rgba(136,192,208,0.35)', radius: '8px' },
    bubble: { own: 'rgba(136,192,208,0.14)', ownText: '#eceff4', other: '#434c5e', radius: '12px' },
  },
  'tokyo-night': {
    button: { bg: '#7aa2f7', text: '#1a1b26', textLight: '#1a1b26', radius: '6px', shadow: '0 0 18px rgba(122,162,247,0.5)', clip: 'none' },
    card: { bg: '#232433', border: '1px solid rgba(122,162,247,0.35)', radius: '6px', shadow: '0 8px 30px rgba(0,0,0,0.55)' },
    input: { bg: '#232433', border: '1px solid rgba(122,162,247,0.3)', borderFocus: '#7aa2f7', focus: '0 0 0 3px rgba(122,162,247,0.18)', radius: '6px' },
    badge: { bg: 'rgba(122,162,247,0.1)', text: '#7aa2f7', border: '1px solid rgba(122,162,247,0.4)', radius: '6px' },
    bubble: { own: 'rgba(122,162,247,0.14)', ownText: '#c0caf5', other: '#2a2d3f', radius: '10px' },
  },
  gruvbox: {
    button: { bg: '#fabd2f', text: '#282828', textLight: '#282828', radius: '4px', shadow: '0 0 14px rgba(250,189,47,0.4)', clip: 'none' },
    card: { bg: '#32302f', border: '1px solid rgba(250,189,47,0.3)', radius: '4px', shadow: '0 8px 28px rgba(0,0,0,0.5)' },
    input: { bg: '#32302f', border: '1px solid rgba(250,189,47,0.3)', borderFocus: '#fabd2f', focus: '0 0 0 3px rgba(250,189,47,0.16)', radius: '4px' },
    badge: { bg: 'rgba(250,189,47,0.1)', text: '#fabd2f', border: '1px solid rgba(250,189,47,0.4)', radius: '4px' },
    bubble: { own: 'rgba(250,189,47,0.12)', ownText: '#ebdbb2', other: '#3c3836', radius: '8px' },
  },
  'solarized-dark': {
    button: { bg: '#268bd2', text: '#ffffff', textLight: '#ffffff', radius: '4px', shadow: '0 0 14px rgba(38,139,210,0.45)', clip: 'none' },
    card: { bg: '#073642', border: '1px solid rgba(38,139,210,0.35)', radius: '4px', shadow: '0 8px 28px rgba(0,0,0,0.5)' },
    input: { bg: '#073642', border: '1px solid rgba(38,139,210,0.3)', borderFocus: '#268bd2', focus: '0 0 0 3px rgba(38,139,210,0.18)', radius: '4px' },
    badge: { bg: 'rgba(38,139,210,0.1)', text: '#268bd2', border: '1px solid rgba(38,139,210,0.4)', radius: '4px' },
    bubble: { own: 'rgba(38,139,210,0.14)', ownText: '#93a1a1', other: '#0d3c47', radius: '8px' },
  },
  monokai: {
    button: { bg: '#a6e22e', text: '#272822', textLight: '#272822', radius: '4px', shadow: '0 0 16px rgba(166,226,46,0.45)', clip: 'none' },
    card: { bg: '#32332d', border: '1px solid rgba(166,226,46,0.3)', radius: '4px', shadow: '0 8px 28px rgba(0,0,0,0.5)' },
    input: { bg: '#32332d', border: '1px solid rgba(166,226,46,0.3)', borderFocus: '#a6e22e', focus: '0 0 0 3px rgba(166,226,46,0.16)', radius: '4px' },
    badge: { bg: 'rgba(166,226,46,0.1)', text: '#a6e22e', border: '1px solid rgba(166,226,46,0.4)', radius: '4px' },
    bubble: { own: 'rgba(166,226,46,0.12)', ownText: '#f8f8f2', other: '#3b3d35', radius: '8px' },
  },
  catppuccin: {
    button: { bg: '#cba6f7', text: '#11111b', textLight: '#11111b', radius: '12px', shadow: '0 0 16px rgba(203,166,247,0.4)', clip: 'none' },
    card: { bg: '#181825', border: '1px solid rgba(203,166,247,0.3)', radius: '12px', shadow: '0 8px 30px rgba(0,0,0,0.55)' },
    input: { bg: '#181825', border: '1px solid rgba(203,166,247,0.3)', borderFocus: '#cba6f7', focus: '0 0 0 3px rgba(203,166,247,0.18)', radius: '12px' },
    badge: { bg: 'rgba(203,166,247,0.1)', text: '#cba6f7', border: '1px solid rgba(203,166,247,0.4)', radius: '999px' },
    bubble: { own: 'rgba(203,166,247,0.14)', ownText: '#cdd6f4', other: '#1e1e2e', radius: '14px' },
  },
  'one-dark': {
    button: { bg: '#61afef', text: '#282c34', textLight: '#282c34', radius: '6px', shadow: '0 0 14px rgba(97,175,239,0.4)', clip: 'none' },
    card: { bg: '#21252b', border: '1px solid rgba(97,175,239,0.3)', radius: '6px', shadow: '0 8px 28px rgba(0,0,0,0.5)' },
    input: { bg: '#21252b', border: '1px solid rgba(97,175,239,0.3)', borderFocus: '#61afef', focus: '0 0 0 3px rgba(97,175,239,0.16)', radius: '6px' },
    badge: { bg: 'rgba(97,175,239,0.1)', text: '#61afef', border: '1px solid rgba(97,175,239,0.4)', radius: '6px' },
    bubble: { own: 'rgba(97,175,239,0.14)', ownText: '#abb2bf', other: '#2c313c', radius: '10px' },
  },
}

// ── Sparse per-theme id overrides (highest priority, above the family) ───────
const THEME_OVERRIDES = {
  'terminal-light': {
    button: { border: '1px solid #15803d' },
    input: { border: '1px solid rgba(21,128,61,0.45)', borderFocus: '#15803d', focus: '0 0 12px rgba(21,128,61,0.25)' },
    badge: { text: '#15803d', border: '1px solid rgba(21,128,61,0.5)' },
    bubble: { ownText: '#15803d' },
  },
}

// ── Deep merge (mutates target; arrays replaced, objects merged) ─────────────
function mergeInto(target, source) {
  if (!source || typeof source !== 'object') return target
  for (const key of Object.keys(source)) {
    const value = source[key]
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if (!target[key] || typeof target[key] !== 'object' || Array.isArray(target[key])) target[key] = {}
      mergeInto(target[key], value)
    } else {
      target[key] = value
    }
  }
  return target
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

// ── Resolve the merged tokens for one theme id ───────────────────────────────
export function getComponentTokens(themeId) {
  const id = typeof themeId === 'string' && themeId ? themeId : 'cyber-dark'
  const family = THEME_FAMILY_OF[id]
  const tokens = clone(DEFAULT_TOKENS)
  if (family && FAMILY_TOKENS[family]) mergeInto(tokens, FAMILY_TOKENS[family])
  if (THEME_OVERRIDES[id]) mergeInto(tokens, THEME_OVERRIDES[id])
  // Light variants keep their own readable button text: an explicit textLight
  // wins; otherwise a var-driven accent bg pairs with white text while a
  // literal brand bg keeps the family's own text color.
  if (LIGHT_THEMES.includes(id)) {
    const entry = (family && FAMILY_TOKENS[family] && FAMILY_TOKENS[family].button) || {}
    if (entry.textLight) {
      tokens.button.text = entry.textLight
    } else if (/var\(--/.test(tokens.button.bg || '')) {
      tokens.button.text = '#ffffff'
    }
  }
  return tokens
}

// ── Tokens → CSS custom properties (set on <html>, scoped by [data-theme]) ───
export function tokensToCssVars(tokens) {
  return {
    '--comp-btn-bg': tokens.button.bg,
    '--comp-btn-text': tokens.button.text,
    '--comp-btn-border': tokens.button.border,
    '--comp-btn-radius': tokens.button.radius,
    '--comp-btn-shadow': tokens.button.shadow,
    '--comp-btn-clip': tokens.button.clip,
    '--comp-card-bg': tokens.card.bg,
    '--comp-card-border': tokens.card.border,
    '--comp-card-radius': tokens.card.radius,
    '--comp-card-shadow': tokens.card.shadow,
    '--comp-input-bg': tokens.input.bg,
    '--comp-input-border': tokens.input.border,
    '--comp-input-focus-border': tokens.input.borderFocus,
    '--comp-input-focus': tokens.input.focus,
    '--comp-input-radius': tokens.input.radius,
    '--comp-badge-bg': tokens.badge.bg,
    '--comp-badge-text': tokens.badge.text,
    '--comp-badge-border': tokens.badge.border,
    '--comp-badge-radius': tokens.badge.radius,
    '--comp-bubble-own': tokens.bubble.own,
    '--comp-bubble-own-text': tokens.bubble.ownText,
    '--comp-bubble-other': tokens.bubble.other,
    '--comp-bubble-radius': tokens.bubble.radius,
  }
}

// ── Client-side applier: writes the active theme's --comp-* vars ─────────────
// Idempotent — safe to call on every theme change. Guards SSR.
export function applyComponentTokens(themeId) {
  if (typeof document === 'undefined') return
  const vars = tokensToCssVars(getComponentTokens(themeId))
  const style = document.documentElement.style
  for (const key of Object.keys(vars)) style.setProperty(key, vars[key])
}

// ── Bake tokens against a static palette (admin preview cards) ───────────────
// Preview cards render outside the theme's [data-theme] scope, so var(--…)
// references would resolve to the viewer's own theme. This substitutes the
// target theme's palette (a THEME_DEFS entry) into every token string.
const PREVIEW_VAR_MAP = [
  ['var(--glow-cyan)', null], // handled via primary below
  ['var(--shadow-card)', '0 8px 24px rgba(0,0,0,0.35)'],
  ['var(--shadow-sm)', '0 2px 10px rgba(0,0,0,0.3)'],
  ['var(--glow)', null], // handled via primary below
  ['var(--green)', 'primary'],
  ['var(--cyan)', 'secondary'],
  ['var(--orange)', 'orange'],
  ['var(--red)', '#ff4757'],
  ['var(--purple)', 'secondary'],
  ['var(--bg2)', 'bg2'],
  ['var(--bg3)', 'bg3'],
  ['var(--bg)', 'bg'],
  ['var(--text2)', 'text'],
  ['var(--text)', 'text'],
  ['var(--muted)', 'muted'],
  ['var(--border)', 'border'],
]

export function resolveComponentTokens(tokens, palette) {
  const pal = palette && typeof palette === 'object' ? palette : {}
  const primary = pal.primary || '#00ff88'
  const substitute = value => {
    if (typeof value !== 'string') return value
    let out = value
    for (const [name, target] of PREVIEW_VAR_MAP) {
      if (!out.includes(name)) continue
      let replacement = target
      if (target === null) replacement = `0 0 12px ${primary}66`
      else if (target && pal[target] !== undefined) replacement = pal[target]
      else if (target && target.startsWith('#')) replacement = target
      else continue
      out = out.split(name).join(replacement)
    }
    return out
  }
  const walk = node => {
    if (typeof node === 'string') return substitute(node)
    if (node && typeof node === 'object' && !Array.isArray(node)) {
      const next = {}
      for (const key of Object.keys(node)) next[key] = walk(node[key])
      return next
    }
    return node
  }
  return walk(tokens)
}
