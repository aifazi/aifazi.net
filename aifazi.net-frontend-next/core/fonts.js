/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  FONT REGISTRY — All fonts managed here.                    ║
 * ║  Components never import Google Fonts directly.             ║
 * ║  Fonts are lazy-loaded on first theme switch.               ║
 * ║                                                              ║
 * ║  Usage:                                                      ║
 * ║    import { f, loadFontForTheme } from '@/core/ui'          ║
 * ║    style={{ fontFamily: f.display }}   // always theme-aware ║
 * ║    loadFontForTheme('synthwave')        // called by App.jsx ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

// ── CSS var font bridges ──────────────────────────────────────────────────────
// Always resolves to the current theme's font. Use these in components.
export const f = {
  display: 'var(--font-display)',
  mono:    'var(--font-mono)',
  code:    'var(--font-code)',
}

// ── Theme → Google Fonts query registry ──────────────────────────────────────
// null = system fonts only (no network request needed)
const REGISTRY = {
  // Default theme (Rajdhani + Share Tech Mono + Space Mono) loaded in index.html
  'cyber-dark': null,
  light:        null,

  // Theme-specific fonts lazy-loaded on first use
  terminal:    'family=VT323',
  synthwave:   'family=Orbitron:wght@400;600;700;900',
  brutalist:   'family=Anton',
  neumorph:    'family=Nunito:wght@300;400;600;700;800&family=DM+Mono:ital,wght@0,300;0,400;0,500;1,400',
  macos:       'family=JetBrains+Mono:wght@300;400;500;600',
  'neon-noir': 'family=Bebas+Neue&family=JetBrains+Mono:wght@300;400;500;600',
  pastel:      'family=Quicksand:wght@300;400;500;600;700&family=DM+Mono:ital,wght@0,300;0,400;0,500;1,400',
  paper:       'family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=Courier+Prime:ital,wght@0,400;0,700;1,400',
  aurora:      'family=Raleway:wght@300;400;600;700;800&family=Fira+Code:wght@300;400;500;600',
  midnight:    'family=Syne:wght@400;600;700;800&family=JetBrains+Mono:wght@300;400;500;600',
  'glass-dark':'family=Outfit:wght@300;400;600;700&family=JetBrains+Mono:wght@300;400;500',
  ocean:       'family=Raleway:wght@300;400;600;700;800&family=Fira+Code:wght@300;400;500;600',
  rose:        'family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=DM+Mono:wght@300;400;500',
  win95:       null, // Tahoma / MS Sans Serif — system only
  crimson:     null,
  amber:       null,
  forest:      null,
}

const _loaded = new Set()

// Load Google Fonts for a theme (idempotent — safe to call multiple times)
export function loadFontForTheme(themeId) {
  const query = REGISTRY[themeId]
  if (!query || _loaded.has(themeId)) return
  _loaded.add(themeId)
  const link = Object.assign(document.createElement('link'), {
    rel:  'stylesheet',
    href: `https://fonts.googleapis.com/css2?${query}&display=swap`,
  })
  document.head.appendChild(link)
}

// Check if fonts for a theme are already loaded
export function isFontLoaded(themeId) {
  return _loaded.has(themeId) || !REGISTRY[themeId]
}

// All registered theme IDs
export const FONT_THEMES = Object.keys(REGISTRY)
