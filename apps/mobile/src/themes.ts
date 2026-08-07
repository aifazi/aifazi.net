// Curated mobile themes (subset of the web's 48 themes).
export type ThemeId = 'cyber-dark' | 'terminal' | 'win95' | 'pacman' | 'light'

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
}

export interface Theme {
  id: ThemeId
  name: string
  dark: boolean
  mono: boolean
  colors: ThemeColors
}

export const THEMES: Record<ThemeId, Theme> = {
  'cyber-dark': {
    id: 'cyber-dark',
    name: 'Cyber Dark',
    dark: true,
    mono: false,
    colors: {
      bg: '#060a0f',
      bg2: '#0b1118',
      bg3: '#111a24',
      text: '#c8d8e8',
      text2: '#8aa0b4',
      muted: '#6b8296',
      accent: '#00ff88',
      accent2: '#00d4ff',
      danger: '#ff4757',
      border: 'rgba(0,212,255,0.18)',
    },
  },
  terminal: {
    id: 'terminal',
    name: 'Terminal',
    dark: true,
    mono: true,
    colors: {
      bg: '#0a0a0a',
      bg2: '#0f0f0f',
      bg3: '#141414',
      text: '#33ff33',
      text2: '#2fd62f',
      muted: '#228822',
      accent: '#33ff33',
      accent2: '#ffcc00',
      danger: '#ff6600',
      border: 'rgba(51,255,51,0.3)',
    },
  },
  win95: {
    id: 'win95',
    name: 'Win95',
    dark: false,
    mono: false,
    colors: {
      bg: '#008080',
      bg2: '#c0c0c0',
      bg3: '#d4d0c8',
      text: '#000000',
      text2: '#1a1a1a',
      muted: '#444444',
      accent: '#000080',
      accent2: '#ffffff',
      danger: '#c00000',
      border: '#808080',
    },
  },
  pacman: {
    id: 'pacman',
    name: 'Pac-Man',
    dark: true,
    mono: true,
    colors: {
      bg: '#05030f',
      bg2: '#0a0718',
      bg3: '#100b24',
      text: '#f4f0ff',
      text2: '#c0b8e8',
      muted: '#5a5078',
      accent: '#ffe000',
      accent2: '#00cfff',
      danger: '#ff5c00',
      border: 'rgba(255,224,0,0.3)',
    },
  },
  light: {
    id: 'light',
    name: 'Light',
    dark: false,
    mono: false,
    colors: {
      bg: '#c8d4e0',
      bg2: '#bcc9d8',
      bg3: '#b0bece',
      text: '#0a1520',
      text2: '#2a4055',
      muted: '#4a6478',
      accent: '#006e38',
      accent2: '#005d8f',
      danger: '#b00020',
      border: 'rgba(0,93,143,0.28)',
    },
  },
}

export const THEME_IDS: ThemeId[] = ['cyber-dark', 'terminal', 'win95', 'pacman', 'light']
