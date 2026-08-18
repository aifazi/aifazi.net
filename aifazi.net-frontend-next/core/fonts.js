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
// null = system fonts only (no network request needed).
// Variants (`-light` / `-dark`) map to their family so they get the same fonts.
const REGISTRY = {
  // Default theme (Rajdhani + Share Tech Mono + Space Mono) loaded in index.html
  'cyber-dark': null,
  'cyber-light': null,
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

  // Molten industrial
  lava:        'family=Anton&family=Space+Mono:wght@400;700',
  // Neon acid waste
  toxic:       'family=Orbitron:wght@400;700;900&family=Share+Tech+Mono',
  // Glacial frosted
  ice:         'family=Raleway:wght@300;500;700&family=Fira+Code:wght@400;500',
  // Eco jungle
  forest:      'family=Poppins:wght@400;600;700;800&family=JetBrains+Mono:wght@400;500',
  // Gothic blood
  crimson:     'family=Cinzel:wght@500;700;900&family=JetBrains+Mono:wght@400;500',
  // Vintage gold
  amber:       'family=Playfair+Display:wght@600;700;900&family=JetBrains+Mono:wght@400;500',

  // Game themes — pixel / arcade
  mario:       'family=Press+Start+2P&family=VT323',
  minecraft:   'family=Silkscreen:wght@400;700&family=VT323',
  sonic:       'family=Bungee&family=Space+Mono:wght@400;700',
  pacman:      'family=Press+Start+2P&family=VT323',

  // ── Family variants (bridge to base) ──
  'terminal-light':    'family=VT323',
  'synthwave-light':   'family=Orbitron:wght@400;600;700;900',
  'brutalist-dark':    'family=Anton',
  'neumorph-dark':     'family=Nunito:wght@300;400;600;700;800&family=DM+Mono:ital,wght@0,300;0,400;0,500;1,400',
  'macos-dark':        'family=JetBrains+Mono:wght@300;400;500;600',
  'neon-noir-light':   'family=Bebas+Neue&family=JetBrains+Mono:wght@300;400;500;600',
  'pastel-dark':       'family=Quicksand:wght@300;400;500;600;700&family=DM+Mono:ital,wght@0,300;0,400;0,500;1,400',
  'paper-dark':        'family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=Courier+Prime:ital,wght@0,400;0,700;1,400',
  'aurora-light':      'family=Raleway:wght@300;400;600;700;800&family=Fira+Code:wght@300;400;500;600',
  'midnight-light':    'family=Syne:wght@400;600;700;800&family=JetBrains+Mono:wght@300;400;500;600',
  'glass-light':       'family=Outfit:wght@300;400;600;700&family=JetBrains+Mono:wght@300;400;500',
  'ocean-light':       'family=Raleway:wght@300;400;600;700;800&family=Fira+Code:wght@300;400;500;600',
  'rose-light':        'family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=DM+Mono:wght@300;400;500',
  'forest-light':      'family=Poppins:wght@400;600;700;800&family=JetBrains+Mono:wght@400;500',
  'crimson-light':     'family=Cinzel:wght@500;700;900&family=JetBrains+Mono:wght@400;500',
  'amber-light':       'family=Playfair+Display:wght@600;700;900&family=JetBrains+Mono:wght@400;500',
  'mario-light':       'family=Press+Start+2P&family=VT323',
  'minecraft-light':   'family=Silkscreen:wght@400;700&family=VT323',
  'sonic-light':       'family=Bungee&family=Space+Mono:wght@400;700',
  'pacman-light':      'family=Press+Start+2P&family=VT323',
}

const _loadedUrls = new Set()

// URL for a theme's font stylesheet ('' if the theme uses system fonts only).
// Safe to call server-side — no DOM access.
export function themeFontUrl(themeId) {
  const query = REGISTRY[themeId]
  if (!query) return ''
  return `https://fonts.googleapis.com/css2?${query}&display=swap`
}

// themeId → font stylesheet URL for every font-backed theme. Used by the FOUC
// script so the active theme's typeface starts downloading during HTML parse
// (before React hydrates) — eliminating first-paint FOUT on theme load/toggle.
export function themeFontUrls() {
  const out = {}
  for (const [id, query] of Object.entries(REGISTRY)) {
    if (query) out[id] = `https://fonts.googleapis.com/css2?${query}&display=swap`
  }
  return out
}

// Load Google Fonts for a theme (idempotent — safe to call multiple times).
// Dedupes by URL, not theme id, so themes that share fonts (mario & pacman both
// use Press Start 2P, lava & brutalist both use Anton, …) only download once.
export function loadFontForTheme(themeId) {
  if (typeof document === 'undefined') return
  const url = themeFontUrl(themeId)
  if (!url || _loadedUrls.has(url)) return
  _loadedUrls.add(url)
  const link = Object.assign(document.createElement('link'), {
    rel: 'stylesheet',
    href: url,
  })
  document.head.appendChild(link)
}

// Check if fonts for a theme are already loaded
export function isFontLoaded(themeId) {
  const url = themeFontUrl(themeId)
  return !url || _loadedUrls.has(url)
}

// ── Custom font loading (theme customization) ────────────────────────────────
// Build a Google Fonts css2 URL from arbitrary family names (used by the admin
// per-theme font customizer). Request a broad weight range so display text and
// code both render correctly regardless of where the family is applied.
export function buildGoogleFontUrl(families) {
  const list = (families || []).map(f => (f || '').trim()).filter(Boolean)
  if (!list.length) return ''
  const q = list
    .map(fam => `family=${fam.replace(/ /g, '+')}:wght@300;400;500;600;700;800;900`)
    .join('&')
  return `https://fonts.googleapis.com/css2?${q}&display=swap`
}

// Load Google Fonts for arbitrary families (idempotent, deduped by URL).
export function loadCustomFonts(families) {
  if (typeof document === 'undefined') return
  const url = buildGoogleFontUrl(families)
  if (!url || _loadedUrls.has(url)) return
  _loadedUrls.add(url)
  const link = Object.assign(document.createElement('link'), {
    rel: 'stylesheet',
    href: url,
  })
  document.head.appendChild(link)
}

// All registered theme IDs
export const FONT_THEMES = Object.keys(REGISTRY)
