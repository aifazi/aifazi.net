// Curated mobile themes (curated subset of the web's 48 themes).
export type ThemeId =
  | 'cyber-dark'
  | 'terminal'
  | 'win95'
  | 'pacman'
  | 'light'
  | 'midnight'
  | 'synthwave'
  | 'ocean'
  | 'aurora'
  | 'neon-noir'
  | 'crimson'
  | 'forest'
  | 'toxic'
  | 'amber'
  | 'rose'
  | 'lava'
  | 'glass-dark'
  | 'macos'
  | 'pastel'
  | 'neumorph'
  | 'brutalist'

export interface ThemeColors {
  bg: string
  bg2: string
  bg3: string
  text: string
  text2: string
  muted: string
  accent: string // primary (green)
  accent2: string // secondary (cyan)
  danger: string
  border: string
  success: string
  warning: string
  info: string
  divider: string
  link: string // hyperlinks / markdown links
  sale: string // sale badges / call-to-action orange
  star: string // gold — stars, mod/admin accents, highlights
  onAccent: string // readable text sitting on top of `accent`
  overlay: string // scrim over content (dimmable backdrop)
}

export interface Theme {
  id: ThemeId
  name: string
  dark: boolean
  mono: boolean
  /** corner radius for cards/surfaces (web terminal panels are 8px; sharp themes 0) */
  radius: number
  /** corner radius for buttons/inputs (web default = angular chamfered, near 0) */
  buttonRadius: number
  colors: ThemeColors
}

export const THEMES: Record<ThemeId, Theme> = {
  'cyber-dark': {
    id: 'cyber-dark',
    name: 'Cyber Dark',
    dark: true,
    mono: false,
    radius: 8,
    buttonRadius: 5,
    colors: {
      bg: '#060a0f',
      bg2: '#0b1118',
      bg3: '#111a24',
      text: '#c8d8e8',
      text2: '#8aa0b4',
      muted: '#7698b0',
      accent: '#00ff88',
      accent2: '#00d4ff',
      danger: '#ff4757',
      border: 'rgba(0,212,255,0.18)',
      success: '#22d968',
      warning: '#ffb43a',
      info: '#38b6ff',
      divider: 'rgba(140,190,230,0.10)',
      link: '#22d3ee',
      sale: '#ff6b35',
      star: '#ffd700',
      onAccent: '#001018',
      overlay: 'rgba(2,6,12,0.62)',
    },
  },
  terminal: {
    id: 'terminal',
    name: 'Terminal',
    dark: true,
    mono: true,
    radius: 0,
    buttonRadius: 0,
    colors: {
      bg: '#0a0a0a',
      bg2: '#0f0f0f',
      bg3: '#141414',
      text: '#33ff33',
      text2: '#2fd62f',
      muted: '#2fa02f',
      accent: '#33ff33',
      accent2: '#ffcc00',
      danger: '#ff6600',
      border: 'rgba(51,255,51,0.3)',
      success: '#33ff33',
      warning: '#ffcc00',
      info: '#66ddff',
      divider: 'rgba(51,255,51,0.14)',
      link: '#66ddff',
      sale: '#ff8c00',
      star: '#ffcc00',
      onAccent: '#000000',
      overlay: 'rgba(0,0,0,0.62)',
    },
  },
  win95: {
    id: 'win95',
    name: 'Win95',
    dark: false,
    mono: false,
    radius: 0,
    buttonRadius: 0,
    colors: {
      bg: '#008080',
      bg2: '#c0c0c0',
      bg3: '#d4d0c8',
      text: '#000000',
      text2: '#1a1a1a',
      muted: '#444444',
      accent: '#000080',
      accent2: '#000080',
      danger: '#8f0000',
      border: '#808080',
      success: '#005f00',
      warning: '#5f5f00',
      info: '#000080',
      divider: '#a6a6a6',
      link: '#000080',
      sale: '#9c2c00',
      star: '#5f5f00',
      onAccent: '#ffffff',
      overlay: 'rgba(0,0,0,0.5)',
    },
  },
  pacman: {
    id: 'pacman',
    name: 'Pac-Man',
    dark: true,
    mono: true,
    radius: 2,
    buttonRadius: 3,
    colors: {
      bg: '#05030f',
      bg2: '#0a0718',
      bg3: '#100b24',
      text: '#f4f0ff',
      text2: '#c0b8e8',
      muted: '#8b7fb8',
      accent: '#ffe000',
      accent2: '#00cfff',
      danger: '#ff5c00',
      border: 'rgba(255,224,0,0.3)',
      success: '#00ffb4',
      warning: '#ffb43a',
      info: '#00cfff',
      divider: 'rgba(255,224,0,0.14)',
      link: '#00cfff',
      sale: '#ff8a3c',
      star: '#ffe000',
      onAccent: '#141000',
      overlay: 'rgba(5,3,15,0.62)',
    },
  },
  light: {
    id: 'light',
    name: 'Light',
    dark: false,
    mono: false,
    radius: 12,
    buttonRadius: 8,
    colors: {
      bg: '#c8d4e0',
      bg2: '#bcc9d8',
      bg3: '#b0bece',
      text: '#0a1520',
      text2: '#2a4055',
      muted: '#3c5164',
      accent: '#006e38',
      accent2: '#004f7c',
      danger: '#8e001a',
      border: 'rgba(0,93,143,0.28)',
      success: '#0f6b36',
      warning: '#8f5300',
      info: '#075d8e',
      divider: 'rgba(10,21,32,0.14)',
      link: '#004f7c',
      sale: '#a35b00',
      star: '#7a6100',
      onAccent: '#ffffff',
      overlay: 'rgba(8,16,26,0.4)',
    },
  },
  midnight: {
    id: 'midnight',
    name: 'Midnight',
    dark: true,
    mono: false,
    radius: 10,
    buttonRadius: 6,
    colors: {
      bg: '#08051a',
      bg2: '#0e0a24',
      bg3: '#16102e',
      text: '#e2d9f3',
      text2: '#b6a7d9',
      muted: '#8f7db8',
      accent: '#a855f7',
      accent2: '#ec4899',
      danger: '#f43f5e',
      border: 'rgba(168,85,247,0.25)',
      success: '#34d399',
      warning: '#f59e0b',
      info: '#22d3ee',
      divider: 'rgba(168,85,247,0.12)',
      link: '#c084fc',
      sale: '#f59e0b',
      star: '#facc15',
      onAccent: '#0a0512',
      overlay: 'rgba(8,5,26,0.62)',
    },
  },
  synthwave: {
    id: 'synthwave',
    name: 'Synthwave',
    dark: true,
    mono: false,
    radius: 0,
    buttonRadius: 0,
    colors: {
      bg: '#0d0618',
      bg2: '#130828',
      bg3: '#180a30',
      text: '#f0d8ff',
      text2: '#d4b8f0',
      muted: '#9d7cc9',
      accent: '#ff2d8b',
      accent2: '#00f0ff',
      danger: '#ff3d5a',
      border: 'rgba(255,45,139,0.25)',
      success: '#00ffb4',
      warning: '#ffcc00',
      info: '#00f0ff',
      divider: 'rgba(255,45,139,0.14)',
      link: '#00f0ff',
      sale: '#ff9100',
      star: '#ffe000',
      onAccent: '#0f0620',
      overlay: 'rgba(13,6,24,0.62)',
    },
  },
  ocean: {
    id: 'ocean',
    name: 'Ocean',
    dark: true,
    mono: false,
    radius: 14,
    buttonRadius: 999,
    colors: {
      bg: '#020d1a',
      bg2: '#061525',
      bg3: '#0b1f33',
      text: '#c0d8f0',
      text2: '#8fb4d6',
      muted: '#6992b4',
      accent: '#3b82f6',
      accent2: '#06b6d4',
      danger: '#f87171',
      border: 'rgba(59,130,246,0.28)',
      success: '#34d399',
      warning: '#fbbf24',
      info: '#38bdf8',
      divider: 'rgba(59,130,246,0.12)',
      link: '#60a5fa',
      sale: '#fb923c',
      star: '#fde047',
      onAccent: '#03121f',
      overlay: 'rgba(2,13,26,0.6)',
    },
  },
  aurora: {
    id: 'aurora',
    name: 'Aurora',
    dark: true,
    mono: false,
    radius: 14,
    buttonRadius: 8,
    colors: {
      bg: '#050d1a',
      bg2: '#08142a',
      bg3: '#0c1c38',
      text: '#cce8ff',
      text2: '#9dc4e8',
      muted: '#6f9ab6',
      accent: '#64ffda',
      accent2: '#ff6fd8',
      danger: '#ff6b6b',
      border: 'rgba(100,255,218,0.22)',
      success: '#34d399',
      warning: '#ffd166',
      info: '#7dd3fc',
      divider: 'rgba(100,255,218,0.12)',
      link: '#64ffda',
      sale: '#ff9f68',
      star: '#ffd166',
      onAccent: '#001b16',
      overlay: 'rgba(5,13,26,0.6)',
    },
  },
  'neon-noir': {
    id: 'neon-noir',
    name: 'Neon Noir',
    dark: true,
    mono: false,
    radius: 2,
    buttonRadius: 2,
    colors: {
      bg: '#0a0a0e',
      bg2: '#10101a',
      bg3: '#16161f',
      text: '#d8d0e0',
      text2: '#b0a8c0',
      muted: '#8a78a6',
      accent: '#ff6b35',
      accent2: '#cc44ff',
      danger: '#ff4757',
      border: 'rgba(255,107,53,0.25)',
      success: '#3ddc84',
      warning: '#ffb43a',
      info: '#a78bfa',
      divider: 'rgba(255,107,53,0.12)',
      link: '#cc44ff',
      sale: '#ff6b35',
      star: '#ffd700',
      onAccent: '#140800',
      overlay: 'rgba(6,6,10,0.62)',
    },
  },
  crimson: {
    id: 'crimson',
    name: 'Crimson',
    dark: true,
    mono: false,
    radius: 8,
    buttonRadius: 5,
    colors: {
      bg: '#0f0608',
      bg2: '#1a0b0e',
      bg3: '#241014',
      text: '#f0d0d4',
      text2: '#d4a5ac',
      muted: '#ac7c86',
      accent: '#ef4444',
      accent2: '#f97316',
      danger: '#f87171',
      border: 'rgba(239,68,68,0.25)',
      success: '#34d399',
      warning: '#fbbf24',
      info: '#60a5fa',
      divider: 'rgba(239,68,68,0.12)',
      link: '#f87171',
      sale: '#fb923c',
      star: '#facc15',
      onAccent: '#1a0709',
      overlay: 'rgba(15,6,8,0.62)',
    },
  },
  forest: {
    id: 'forest',
    name: 'Forest',
    dark: true,
    mono: false,
    radius: 8,
    buttonRadius: 5,
    colors: {
      bg: '#020b04',
      bg2: '#051508',
      bg3: '#091f0d',
      text: '#d1fae5',
      text2: '#9ee6bd',
      muted: '#609b73',
      accent: '#4ade80',
      accent2: '#a3e635',
      danger: '#f87171',
      border: 'rgba(74,222,128,0.22)',
      success: '#4ade80',
      warning: '#facc15',
      info: '#38bdf8',
      divider: 'rgba(74,222,128,0.12)',
      link: '#86efac',
      sale: '#fb923c',
      star: '#fde047',
      onAccent: '#02150a',
      overlay: 'rgba(2,11,4,0.62)',
    },
  },
  toxic: {
    id: 'toxic',
    name: 'Toxic',
    dark: true,
    mono: false,
    radius: 8,
    buttonRadius: 5,
    colors: {
      bg: '#060803',
      bg2: '#0b1005',
      bg3: '#121a08',
      text: '#ecffc8',
      text2: '#c0e08a',
      muted: '#7d9448',
      accent: '#a3e635',
      accent2: '#ccff00',
      danger: '#ff5c5c',
      border: 'rgba(163,230,53,0.28)',
      success: '#a3e635',
      warning: '#ffd166',
      info: '#7dd3fc',
      divider: 'rgba(163,230,53,0.14)',
      link: '#ccff00',
      sale: '#fb923c',
      star: '#ffe000',
      onAccent: '#0a1200',
      overlay: 'rgba(6,8,3,0.62)',
    },
  },
  amber: {
    id: 'amber',
    name: 'Amber',
    dark: true,
    mono: false,
    radius: 8,
    buttonRadius: 5,
    colors: {
      bg: '#0f0a02',
      bg2: '#1a1405',
      bg3: '#241c08',
      text: '#fef3c7',
      text2: '#e0cf9e',
      muted: '#ab855c',
      accent: '#f59e0b',
      accent2: '#f97316',
      danger: '#ef4444',
      border: 'rgba(245,158,11,0.28)',
      success: '#4ade80',
      warning: '#fbbf24',
      info: '#38bdf8',
      divider: 'rgba(245,158,11,0.14)',
      link: '#fbbf24',
      sale: '#fb923c',
      star: '#fde047',
      onAccent: '#1a1202',
      overlay: 'rgba(15,10,2,0.62)',
    },
  },
  rose: {
    id: 'rose',
    name: 'Rose',
    dark: true,
    mono: false,
    radius: 14,
    buttonRadius: 999,
    colors: {
      bg: '#0f0609',
      bg2: '#1a0c12',
      bg3: '#24121a',
      text: '#fde8f0',
      text2: '#e0b6c8',
      muted: '#ac7c90',
      accent: '#f472b6',
      accent2: '#fb7185',
      danger: '#f43f5e',
      border: 'rgba(244,114,182,0.25)',
      success: '#34d399',
      warning: '#fbbf24',
      info: '#38bdf8',
      divider: 'rgba(244,114,182,0.12)',
      link: '#f9a8d4',
      sale: '#fb923c',
      star: '#fde047',
      onAccent: '#160811',
      overlay: 'rgba(15,6,9,0.62)',
    },
  },
  lava: {
    id: 'lava',
    name: 'Lava',
    dark: true,
    mono: false,
    radius: 8,
    buttonRadius: 5,
    colors: {
      bg: '#0a0502',
      bg2: '#140a04',
      bg3: '#1e0f06',
      text: '#ffe8d6',
      text2: '#e0c0a0',
      muted: '#ac7758',
      accent: '#ff3d00',
      accent2: '#ff9100',
      danger: '#ff3d00',
      border: 'rgba(255,61,0,0.28)',
      success: '#4ade80',
      warning: '#ffb43a',
      info: '#38bdf8',
      divider: 'rgba(255,61,0,0.14)',
      link: '#ff9100',
      sale: '#ff9100',
      star: '#ffcc00',
      onAccent: '#150602',
      overlay: 'rgba(10,5,2,0.62)',
    },
  },
  'glass-dark': {
    id: 'glass-dark',
    name: 'Glass Dark',
    dark: true,
    mono: false,
    radius: 16,
    buttonRadius: 8,
    colors: {
      bg: '#04080f',
      bg2: '#081019',
      bg3: '#0c1622',
      text: '#d0e8ff',
      text2: '#9fc0e8',
      muted: '#7a9cc4',
      accent: '#00e5ff',
      accent2: '#7b61ff',
      danger: '#ff5c7a',
      border: 'rgba(0,229,255,0.24)',
      success: '#2ee6a8',
      warning: '#ffcc66',
      info: '#38bdf8',
      divider: 'rgba(0,229,255,0.1)',
      link: '#00e5ff',
      sale: '#ff8a5c',
      star: '#ffe000',
      onAccent: '#001014',
      overlay: 'rgba(4,8,15,0.62)',
    },
  },
  macos: {
    id: 'macos',
    name: 'macOS',
    dark: false,
    mono: false,
    radius: 18,
    buttonRadius: 10,
    colors: {
      bg: '#f5f5f7',
      bg2: '#ececef',
      bg3: '#e2e2e7',
      text: '#1d1d1f',
      text2: '#3c3c43',
      muted: '#5d5d64',
      accent: '#0071e3',
      accent2: '#0068a8',
      danger: '#ff3b30',
      border: 'rgba(0,113,227,0.22)',
      success: '#34c759',
      warning: '#ff9500',
      info: '#007aff',
      divider: 'rgba(0,0,0,0.1)',
      link: '#0071e3',
      sale: '#ff8c42',
      star: '#ffb300',
      onAccent: '#ffffff',
      overlay: 'rgba(20,20,20,0.4)',
    },
  },
  pastel: {
    id: 'pastel',
    name: 'Pastel',
    dark: false,
    mono: false,
    radius: 22,
    buttonRadius: 50,
    colors: {
      bg: '#fdf4ff',
      bg2: '#f5e8fa',
      bg3: '#ecdbf5',
      text: '#3d1f5c',
      text2: '#5b3a7d',
      muted: '#7b4fa3',
      accent: '#9333ea',
      accent2: '#b23f74',
      danger: '#a51d38',
      border: 'rgba(192,132,252,0.3)',
      success: '#1f7a46',
      warning: '#b97f00',
      info: '#5b54c4',
      divider: 'rgba(192,132,252,0.14)',
      link: '#9333ea',
      sale: '#b45f10',
      star: '#8a5f08',
      onAccent: '#ffffff',
      overlay: 'rgba(61,31,92,0.35)',
    },
  },
  neumorph: {
    id: 'neumorph',
    name: 'Neumorph',
    dark: false,
    mono: false,
    radius: 18,
    buttonRadius: 50,
    colors: {
      bg: '#e0e5ec',
      bg2: '#d8dde4',
      bg3: '#cfd4dc',
      text: '#2d3748',
      text2: '#4a5568',
      muted: '#556170',
      accent: '#4a43a8',
      accent2: '#146864',
      danger: '#c02828',
      border: 'rgba(108,99,255,0.2)',
      success: '#26703f',
      warning: '#8a6410',
      info: '#155f8a',
      divider: 'rgba(0,0,0,0.08)',
      link: '#4a43a8',
      sale: '#b35e14',
      star: '#7e560a',
      onAccent: '#ffffff',
      overlay: 'rgba(45,55,72,0.35)',
    },
  },
  brutalist: {
    id: 'brutalist',
    name: 'Brutalist',
    dark: false,
    mono: false,
    radius: 0,
    buttonRadius: 0,
    colors: {
      bg: '#f2f0ec',
      bg2: '#e8e6e1',
      bg3: '#dcdad4',
      text: '#000000',
      text2: '#1a1a1a',
      muted: '#555555',
      accent: '#c8000b',
      accent2: '#000000',
      danger: '#c8000b',
      border: '#000000',
      success: '#005f00',
      warning: '#6d5a00',
      info: '#000080',
      divider: '#000000',
      link: '#0000ff',
      sale: '#c8000b',
      star: '#6d5a00',
      onAccent: '#ffffff',
      overlay: 'rgba(0,0,0,0.45)',
    },
  },
}

export const THEME_IDS: ThemeId[] = [
  'cyber-dark', 'light', 'terminal', 'win95', 'pacman',
  'midnight', 'synthwave', 'ocean', 'aurora', 'neon-noir',
  'crimson', 'forest', 'toxic', 'amber', 'rose', 'lava', 'glass-dark',
  'macos', 'pastel', 'neumorph', 'brutalist',
]

/**
 * Map the web's full theme registry (45 themes) down to the curated mobile set
 * so admin-set global/locked themes resolve to a sensible mobile counterpart.
 */
const WEB_THEME_MAP: Record<string, ThemeId> = {
  'cyber-dark': 'cyber-dark', 'cyber-light': 'light',
  light: 'light',
  midnight: 'midnight', 'midnight-light': 'light',
  crimson: 'crimson', 'crimson-light': 'light',
  ocean: 'ocean', 'ocean-light': 'light',
  amber: 'amber', 'amber-light': 'light',
  rose: 'rose', 'rose-light': 'light',
  forest: 'forest', 'forest-light': 'light',
  lava: 'lava', 'lava-light': 'light',
  toxic: 'toxic', 'toxic-light': 'light',
  ice: 'light',
  'glass-dark': 'glass-dark', 'glass-light': 'light',
  brutalist: 'brutalist', 'brutalist-dark': 'brutalist',
  synthwave: 'synthwave', 'synthwave-light': 'light',
  paper: 'light', 'paper-dark': 'light',
  neumorph: 'neumorph', 'neumorph-dark': 'neumorph',
  terminal: 'terminal', 'terminal-light': 'light',
  macos: 'macos', 'macos-dark': 'cyber-dark',
  'neon-noir': 'neon-noir', 'neon-noir-light': 'light',
  pastel: 'pastel', 'pastel-dark': 'cyber-dark',
  win95: 'win95', 'win95-dark': 'cyber-dark',
  aurora: 'aurora', 'aurora-light': 'light',
  mario: 'pacman', 'mario-light': 'light',
  minecraft: 'terminal', 'minecraft-light': 'light',
  sonic: 'cyber-dark', 'sonic-light': 'light',
  pacman: 'pacman', 'pacman-light': 'light',
}

export function webThemeToMobile(id?: string | null): ThemeId {
  if (id && WEB_THEME_MAP[id]) return WEB_THEME_MAP[id]
  return 'cyber-dark'
}

/**
 * Web-style light/dark family pairs. Every curated mobile theme resolves to a
 * counterpart so the theme picker can offer a "toggle dark/light" action that
 * matches what the web's family switcher does.
 */
export const THEME_PAIRS: Record<ThemeId, ThemeId> = {
  'cyber-dark': 'light',
  light: 'cyber-dark',
  terminal: 'win95',
  win95: 'terminal',
  pacman: 'light',
  midnight: 'ocean',
  synthwave: 'neon-noir',
  ocean: 'midnight',
  aurora: 'ocean',
  'neon-noir': 'synthwave',
  crimson: 'light',
  forest: 'light',
  toxic: 'light',
  amber: 'light',
  rose: 'light',
  lava: 'light',
  'glass-dark': 'light',
  macos: 'light',
  pastel: 'cyber-dark',
  neumorph: 'cyber-dark',
  brutalist: 'light',
}

/**
 * Themes that are light-mode by default (used by the picker to decide whether
 * the toggle action should say "Dark" or "Light", and by theming for status bar
 * contrast). Mirrors web LIGHT_THEMES.
 */
export const LIGHT_THEMES: ReadonlySet<string> = new Set([
  'light', 'win95', 'ocean-light', 'crimson-light', 'rose-light', 'amber-light',
  'forest-light', 'lava-light', 'toxic-light', 'glass-light', 'mario-light',
  'macos-light', 'pastel', 'neumorph-dark', 'brutalist-light', 'paper',
  'paper-dark', 'aurora-light', 'synthwave-light', 'neon-noir-light', 'ice',
])

/**
 * Framework / design language each theme belongs to — drives per-theme styling
 * of buttons, inputs, borders and shadows so mobile matches the web's families
 * (angular chamfered cyber, sharp brutalist, flat retro, round glass, etc).
 */
export type ThemeFamily = 'cyber' | 'brutalist' | 'retro' | 'glass' | 'paper' | 'dark' | 'neon' | 'sharp'

const THEME_FAMILIES: Record<ThemeId, ThemeFamily> = {
  'cyber-dark': 'cyber',
  light: 'cyber',
  midnight: 'dark',
  synthwave: 'neon',
  ocean: 'dark',
  aurora: 'dark',
  'neon-noir': 'dark',
  crimson: 'dark',
  forest: 'dark',
  toxic: 'dark',
  amber: 'dark',
  rose: 'dark',
  lava: 'dark',
  terminal: 'retro',
  win95: 'retro',
  pacman: 'retro',
  'glass-dark': 'glass',
  macos: 'glass',
  pastel: 'paper',
  neumorph: 'paper',
  brutalist: 'brutalist',
}

export function themeFamily(id: ThemeId): ThemeFamily {
  return THEME_FAMILIES[id] ?? 'dark'
}

/** Number of columns the theme gallery grid shows (web parity: 3 on mobile). */
export const THEME_GRID_COLUMNS = 3

/**
 * Theme action when the user toggles dark/light. If a theme has a real light or
 * dark counterpart in the curated set, we jump to it; otherwise fall back to
 * webThemeToMobile('cyber-light' / 'cyber-dark').
 */
export function toggleTheme(id: ThemeId): ThemeId {
  const pair = THEME_PAIRS[id]
  if (pair && THEMES[pair]) return pair
  return LIGHT_THEMES.has(id) ? 'cyber-dark' : 'light'
}
