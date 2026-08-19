/**
 * core/themeCatalog.js — single source of truth for the theme id space.
 *
 * VALID_THEMES / LIGHT_THEMES / THEME_PAIRS drive client theme state
 * (providers.tsx), the SSR/FOUC light-mode detection (app/layout.tsx), the
 * toggle behavior and every downstream consumer. Keep them HERE so the
 * catalog never drifts between files.
 *
 * The parallel catalogs in globals.css ([data-theme="..."] blocks),
 * core/fonts.js (REGISTRY), components/ThemePicker.jsx (THEMES) and
 * pages-src/admin/ThemeLibrary.jsx (THEME_DEFS) describe presentation
 * (colors/fonts/preview data); this module is the authoritative id list.
 */

export const VALID_THEMES = [
  'cyber-dark','cyber-light','light',
  'midnight','midnight-light',
  'crimson','crimson-light',
  'ocean','ocean-light',
  'amber','amber-light',
  'rose','rose-light',
  'forest','forest-light',
  'lava','lava-light','toxic','toxic-light','ice',
  'glass-dark','glass-light',
  'brutalist','brutalist-dark',
  'synthwave','synthwave-light',
  'paper','paper-dark',
  'neumorph','neumorph-dark',
  'terminal','terminal-light',
  'macos','macos-dark',
  'neon-noir','neon-noir-light',
  'pastel','pastel-dark',
  'win95','win95-dark',
  'aurora','aurora-light',
  'ember-dark','ember-light',
  'cobalt-dark','cobalt-light',
  'slate-dark','slate-light',
  'honey-dark','honey-light',
  'violet-dark','violet-light',
  'teal-dark','teal-light',
  'mario','mario-light',
  'minecraft','minecraft-light',
  'sonic','sonic-light',
  'pacman','pacman-light',
]

export const LIGHT_THEMES = [
  'light','cyber-light',
  'midnight-light','crimson-light','ocean-light','amber-light',
  'rose-light','forest-light','glass-light','synthwave-light',
  'terminal-light','neon-noir-light','aurora-light',
  'mario-light','minecraft-light','sonic-light','pacman-light',
  'lava-light','toxic-light',
  'ember-light','cobalt-light','slate-light','honey-light',
  'violet-light','teal-light',
  'ice',
  'brutalist','paper','neumorph','macos','pastel','win95',
]

// Dark ↔ Light pairs — toggle stays within the same theme family
export const THEME_PAIRS = {
  'cyber-dark':'cyber-light', 'cyber-light':'cyber-dark',
  'light':'cyber-dark',
  'midnight':'midnight-light', 'midnight-light':'midnight',
  'crimson':'crimson-light',   'crimson-light':'crimson',
  'ocean':'ocean-light',       'ocean-light':'ocean',
  'amber':'amber-light',       'amber-light':'amber',
  'rose':'rose-light',         'rose-light':'rose',
  'forest':'forest-light',     'forest-light':'forest',
  'lava':'lava-light',          'lava-light':'lava',
  'toxic':'toxic-light',        'toxic-light':'toxic',
  'glass-dark':'glass-light',  'glass-light':'glass-dark',
  'brutalist':'brutalist-dark','brutalist-dark':'brutalist',
  'synthwave':'synthwave-light','synthwave-light':'synthwave',
  'paper':'paper-dark',         'paper-dark':'paper',
  'neumorph':'neumorph-dark',   'neumorph-dark':'neumorph',
  'terminal':'terminal-light',  'terminal-light':'terminal',
  'macos':'macos-dark',         'macos-dark':'macos',
  'neon-noir':'neon-noir-light','neon-noir-light':'neon-noir',
  'pastel':'pastel-dark',       'pastel-dark':'pastel',
  'win95':'win95-dark',         'win95-dark':'win95',
  'aurora':'aurora-light',      'aurora-light':'aurora',
  'ember-dark':'ember-light',   'ember-light':'ember-dark',
  'cobalt-dark':'cobalt-light', 'cobalt-light':'cobalt-dark',
  'slate-dark':'slate-light',   'slate-light':'slate-dark',
  'honey-dark':'honey-light',   'honey-light':'honey-dark',
  'violet-dark':'violet-light', 'violet-light':'violet-dark',
  'teal-dark':'teal-light',     'teal-light':'teal-dark',
  'mario':'mario-light',        'mario-light':'mario',
  'minecraft':'minecraft-light','minecraft-light':'minecraft',
  'sonic':'sonic-light',        'sonic-light':'sonic',
  'pacman':'pacman-light',      'pacman-light':'pacman',
}

// Light ↔ dark sibling within the SAME family — THEME_PAIRS without the special
// standalone `light` ↔ `cyber-dark` pairing (so customizing `light` never leaks
// into the flagship cyber theme). Used to mirror per-family customization
// (fonts / colors / radius / borders) across a theme's light and dark variants.
export const THEME_FAMILY_SIBLINGS = Object.fromEntries(
  Object.entries(THEME_PAIRS).filter(([a, b]) => a !== 'light' && b !== 'light')
)
