// themePickerData.js — theme catalog for ThemePicker (extracted for size).
import { THEME_PACKAGES } from '../core/framework-styles.js'

const THEMES = [
  // ── COLOR VARIANTS ───────────────────────────────────────────────────────
  {
    id: 'cyber-dark', name: 'Cyber', tag: 'DARK', type: 'color', style: 'cyber',
    desc: 'Default hacker green',
    bg: '#060a0f', bg2: '#0b1118', bg3: '#111a24', primary: '#00ff88', secondary: '#00d4ff',
    text: '#c8d8e8', muted: '#6b8296', border: 'color-mix(in srgb, var(--cyan) 15%, transparent)',
  },
  {
    id: 'midnight', name: 'Midnight', tag: 'DARK', type: 'color', style: 'cyber',
    desc: 'Deep violet & pink',
    bg: '#08051a', bg2: '#0e0a24', bg3: '#16102e', primary: '#a855f7', secondary: '#ec4899',
    text: '#e2d9f3', muted: '#6b5a8a', border: 'rgba(168,85,247,0.18)',
  },
  {
    id: 'crimson', name: 'Crimson', tag: 'DARK', type: 'color', style: 'cyber',
    desc: 'Blood red & amber',
    bg: '#0f0608', bg2: '#1a0b0e', bg3: '#241014', primary: '#ef4444', secondary: '#f97316',
    text: '#f0d0d4', muted: '#8a6068', border: 'rgba(239,68,68,0.18)',
  },
  {
    id: 'ocean', name: 'Ocean', tag: 'DARK', type: 'color', style: 'cyber',
    desc: 'Electric blue & teal',
    bg: '#020d1a', bg2: '#061525', bg3: '#0b1f33', primary: '#3b82f6', secondary: '#06b6d4',
    text: '#c0d8f0', muted: '#4a6880', border: 'rgba(59,130,246,0.18)',
  },
  {
    id: 'amber', name: 'Amber', tag: 'DARK', type: 'color', style: 'cyber',
    desc: 'Warm gold & orange',
    bg: '#0f0a02', bg2: '#1a1405', bg3: '#241c08', primary: '#f59e0b', secondary: '#f97316',
    text: '#fef3c7', muted: '#927040', border: 'rgba(245,158,11,0.18)',
  },
  {
    id: 'rose', name: 'Rose', tag: 'DARK', type: 'color', style: 'cyber',
    desc: 'Soft pink & coral',
    bg: '#0f0609', bg2: '#1a0c12', bg3: '#24121a', primary: '#f472b6', secondary: '#fb7185',
    text: '#fde8f0', muted: '#8a6070', border: 'rgba(244,114,182,0.18)',
  },
  {
    id: 'forest', name: 'Forest', tag: 'DARK', type: 'color', style: 'cyber',
    desc: 'Jungle green & lime',
    bg: '#020b04', bg2: '#051508', bg3: '#091f0d', primary: '#4ade80', secondary: '#a3e635',
    text: '#d1fae5', muted: '#4a7858', border: 'rgba(74,222,128,0.15)',
  },
  {
    id: 'lava', name: 'Lava', tag: 'DARK', type: 'color', style: 'cyber',
    desc: 'Molten magma',
    bg: '#0a0502', bg2: '#140a04', bg3: '#1e0f06', primary: '#ff3d00', secondary: '#ff9100',
    text: '#ffe8d6', muted: '#8a5a40', border: 'rgba(255,61,0,0.2)',
  },
  {
    id: 'toxic', name: 'Toxic', tag: 'DARK', type: 'color', style: 'cyber',
    desc: 'Hazard acid',
    bg: '#060803', bg2: '#0b1005', bg3: '#121a08', primary: '#a3e635', secondary: '#ccff00',
    text: '#ecffc8', muted: '#6a7a3a', border: 'rgba(163,230,53,0.2)',
  },
  {
    id: 'ice', name: 'Ice', tag: 'LIGHT', type: 'color', style: 'cyber',
    desc: 'Arctic frost',
    bg: '#eef4fa', bg2: '#e3edf7', bg3: '#d8e6f2', primary: '#0284c7', secondary: '#0891b2',
    text: '#0b1a2a', muted: '#4a6a86', border: 'rgba(2,132,199,0.22)',
  },
  // ── DESIGN STYLE THEMES ──────────────────────────────────────────────────
  {
    id: 'glass-dark', name: 'Glass', tag: 'STYLE', type: 'design', style: 'glass',
    desc: 'Frosted glassmorphism',
    bg: '#04080f', bg2: 'rgba(10,18,32,0.45)', bg3: 'rgba(16,26,46,0.55)', primary: '#00e5ff', secondary: '#7b61ff',
    text: '#d0e8ff', muted: '#5a7898', border: 'rgba(0,229,255,0.22)',
  },
  {
    id: 'brutalist', name: 'Brutal', tag: 'LIGHT', type: 'design', style: 'brutalist',
    desc: 'Raw bold brutalism',
    bg: '#f2f0ec', bg2: '#e8e5df', bg3: '#dedad2', primary: '#e8000d', secondary: '#000000',
    text: '#000000', muted: '#555555', border: '#000000',
  },
  {
    id: 'synthwave', name: 'Synth', tag: 'STYLE', type: 'design', style: 'synthwave',
    desc: 'Retro 80s arcade',
    bg: '#0d0618', bg2: '#130828', bg3: '#180a30', primary: '#ff2d8b', secondary: '#00f0ff',
    text: '#f0d8ff', muted: '#7858a0', border: 'rgba(255,45,139,0.28)',
  },
  {
    id: 'paper', name: 'Paper', tag: 'LIGHT', type: 'design', style: 'paper',
    desc: 'Minimal editorial',
    bg: '#f5f0e8', bg2: '#ede8df', bg3: '#e4ddd3', primary: '#c41a1a', secondary: '#1a3a6c',
    text: '#1a1a1a', muted: '#6b6060', border: 'rgba(0,0,0,0.18)',
  },
  {
    id: 'neumorph', name: 'Neumorph', tag: 'STYLE', type: 'design', style: 'neumorph',
    desc: 'Soft 3D neumorphism',
    bg: '#e0e5ec', bg2: '#e8edf4', bg3: '#d6dbe4', primary: '#6c63ff', secondary: '#4ecdc4',
    text: '#2d3748', muted: '#718096', border: 'rgba(108,99,255,0.15)',
  },
  {
    id: 'terminal', name: 'Terminal', tag: 'STYLE', type: 'design', style: 'terminal',
    desc: 'Old-school DOS/CRT',
    bg: '#0a0a0a', bg2: '#0f0f0f', bg3: '#141414', primary: '#33ff33', secondary: '#ffcc00',
    text: '#33ff33', muted: '#228822', border: 'rgba(51,255,51,0.25)',
  },
  {
    id: 'macos', name: 'macOS', tag: 'LIGHT', type: 'design', style: 'macos',
    desc: 'Apple-inspired minimal',
    bg: '#f5f5f7', bg2: '#ffffff', bg3: '#ebebed', primary: '#0071e3', secondary: '#34aadc',
    text: '#1d1d1f', muted: '#86868b', border: 'rgba(0,0,0,0.12)',
  },
  {
    id: 'neon-noir', name: 'Neon Noir', tag: 'DARK', type: 'design', style: 'neon-noir',
    desc: 'Cinematic dark neon',
    bg: '#0a0a0e', bg2: '#10101a', bg3: '#16161f', primary: '#ff6b35', secondary: '#cc44ff',
    text: '#d8d0e0', muted: '#6a5a7a', border: 'rgba(204,68,255,0.2)',
  },
  {
    id: 'pastel', name: 'Pastel', tag: 'LIGHT', type: 'design', style: 'pastel',
    desc: 'Soft dreamy pastels',
    bg: '#fdf4ff', bg2: '#fff0fb', bg3: '#f5e8ff', primary: '#c084fc', secondary: '#f9a8d4',
    text: '#3d1f5c', muted: '#9d6db8', border: 'rgba(192,132,252,0.3)',
  },
  {
    id: 'win95', name: 'Win95', tag: 'STYLE', type: 'design', style: 'win95',
    desc: 'Classic Windows 95',
    bg: '#008080', bg2: '#c0c0c0', bg3: '#d4d0c8', primary: '#000080', secondary: '#ffffff',
    text: '#000000', muted: '#444444', border: '#808080',
  },
  {
    id: 'aurora', name: 'Aurora', tag: 'DARK', type: 'design', style: 'aurora',
    desc: 'Northern lights gradient',
    bg: '#050d1a', bg2: '#08142a', bg3: '#0c1c38', primary: '#64ffda', secondary: '#ff6fd8',
    text: '#cce8ff', muted: '#5a8099', border: 'rgba(100,255,218,0.2)',
  },
  // ── GAME THEMES ────────────────────────────────────────────────────────────
  {
    id: 'mario', name: 'Mario', tag: 'GAME', type: 'design', style: 'mario',
    desc: 'Warp-pipe red & coin gold',
    bg: '#0a0d1c', bg2: '#10142a', bg3: '#161a36', primary: '#e52521', secondary: '#ffd700',
    text: '#fdf6e3', muted: '#8a7f66', border: 'rgba(229,37,33,0.3)',
  },
  {
    id: 'minecraft', name: 'Minecraft', tag: 'GAME', type: 'design', style: 'minecraft',
    desc: 'Creeper green & blocky depth',
    bg: '#141210', bg2: '#1d1a17', bg3: '#262219', primary: '#5ad427', secondary: '#2a9dd6',
    text: '#d8d5c8', muted: '#6f6a5a', border: 'rgba(90,212,39,0.28)',
  },
  {
    id: 'sonic', name: 'Sonic', tag: 'GAME', type: 'design', style: 'sonic',
    desc: 'Speed blue & ring gold',
    bg: '#070d2b', bg2: '#0c1440', bg3: '#111a54', primary: '#1e6fd9', secondary: '#f5d200',
    text: '#e8f0ff', muted: '#5a6a9a', border: 'rgba(30,111,217,0.3)',
  },
  {
    id: 'pacman', name: 'Pac-Man', tag: 'GAME', type: 'design', style: 'pacman',
    desc: 'Arcade maze yellow & cyan',
    bg: '#05030f', bg2: '#0a0718', bg3: '#100b24', primary: '#ffe000', secondary: '#00cfff',
    text: '#f4f0ff', muted: '#5a5078', border: 'rgba(255,224,0,0.3)',
  },
  // ── EXPANSION PACK ─────────────────────────────────────────────────────────
  {
    id: 'ember-dark', name: 'Ember', tag: 'DARK', type: 'design', style: 'cyber',
    desc: 'Burnt orange on charcoal',
    bg: '#100605', bg2: '#1a0b07', bg3: '#241008', primary: '#ff5722', secondary: '#ff9800',
    text: '#ffe8dd', muted: '#8a5a44', border: 'rgba(255,87,34,0.22)',
  },
  {
    id: 'cobalt-dark', name: 'Cobalt', tag: 'DARK', type: 'design', style: 'cyber',
    desc: 'Deep blue & electric cyan',
    bg: '#050b1e', bg2: '#0a142f', bg3: '#101c40', primary: '#1e50ff', secondary: '#00c2ff',
    text: '#d6e2ff', muted: '#4a5a8a', border: 'rgba(30,80,255,0.22)',
  },
  {
    id: 'slate-dark', name: 'Slate', tag: 'DARK', type: 'design', style: 'cyber',
    desc: 'Minimal monochrome',
    bg: '#0b0e12', bg2: '#12161c', bg3: '#1a1f27', primary: '#94a3b8', secondary: '#cbd5e1',
    text: '#e2e8f0', muted: '#64748b', border: 'rgba(148,163,184,0.18)',
  },
  {
    id: 'honey-dark', name: 'Honey', tag: 'DARK', type: 'design', style: 'cyber',
    desc: 'Warm honey gold',
    bg: '#0d0a02', bg2: '#171205', bg3: '#211a08', primary: '#ffb300', secondary: '#ff8f00',
    text: '#fff3c4', muted: '#8a7020', border: 'rgba(255,179,0,0.22)',
  },
  {
    id: 'violet-dark', name: 'Violet', tag: 'DARK', type: 'design', style: 'cyber',
    desc: 'Violet & periwinkle',
    bg: '#0c0718', bg2: '#140c26', bg3: '#1c1238', primary: '#8b5cf6', secondary: '#c084fc',
    text: '#ede3ff', muted: '#6a5a9a', border: 'rgba(139,92,246,0.22)',
  },
  {
    id: 'teal-dark', name: 'Teal', tag: 'DARK', type: 'design', style: 'cyber',
    desc: 'Teal & mint',
    bg: '#031210', bg2: '#061c19', bg3: '#0a2823', primary: '#2dd4bf', secondary: '#5eead4',
    text: '#d5fff8', muted: '#3d6f66', border: 'rgba(45,212,191,0.22)',
  },
  {
    id: 'dracula', name: 'Dracula', tag: 'DARK', type: 'design', style: 'cyber',
    desc: 'Vampire purple & hot pink on plum black — the beloved editor theme.',
    bg: '#282a36', bg2: '#2f3242', bg3: '#383c4e', primary: '#bd93f9', secondary: '#ff79c6',
    text: '#f8f8f2', muted: '#7a86a8', border: 'rgba(189,147,249,0.22)',
  },
  {
    id: 'nord', name: 'Nord', tag: 'DARK', type: 'design', style: 'cyber',
    desc: 'Arctic frost blues on polar night — calm and clinical.',
    bg: '#2e3440', bg2: '#3b4252', bg3: '#434c5e', primary: '#88c0d0', secondary: '#81a1c1',
    text: '#eceff4', muted: '#7b88a0', border: 'rgba(136,192,208,0.2)',
  },
  {
    id: 'tokyo-night', name: 'Tokyo Night', tag: 'DARK', type: 'design', style: 'cyber',
    desc: 'Neon blue & violet glow on midnight indigo.',
    bg: '#1a1b26', bg2: '#232433', bg3: '#2a2d3f', primary: '#7aa2f7', secondary: '#bb9af7',
    text: '#c0caf5', muted: '#6a739d', border: 'rgba(122,162,247,0.22)',
  },
  {
    id: 'gruvbox', name: 'Gruvbox', tag: 'DARK', type: 'design', style: 'cyber',
    desc: 'Retro groove warm yellow & aqua on dark umber.',
    bg: '#282828', bg2: '#32302f', bg3: '#3c3836', primary: '#fabd2f', secondary: '#83a598',
    text: '#ebdbb2', muted: '#a89984', border: 'rgba(250,189,47,0.2)',
  },
  {
    id: 'solarized-dark', name: 'Solarized', tag: 'DARK', type: 'design', style: 'cyber',
    desc: 'Precision teal & blue on deep cyan-black.',
    bg: '#002b36', bg2: '#073642', bg3: '#0d3c47', primary: '#268bd2', secondary: '#2aa198',
    text: '#93a1a1', muted: '#6b7f87', border: 'rgba(38,139,210,0.22)',
  },
  {
    id: 'monokai', name: 'Monokai', tag: 'DARK', type: 'design', style: 'cyber',
    desc: 'Lime & hot pink on warm charcoal — the classic.',
    bg: '#272822', bg2: '#32332d', bg3: '#3b3d35', primary: '#a6e22e', secondary: '#66d9ef',
    text: '#f8f8f2', muted: '#8a8674', border: 'rgba(166,226,46,0.2)',
  },
  {
    id: 'catppuccin', name: 'Catppuccin', tag: 'DARK', type: 'design', style: 'cyber',
    desc: 'Pastel mauve & sky on espresso mocha.',
    bg: '#11111b', bg2: '#181825', bg3: '#1e1e2e', primary: '#cba6f7', secondary: '#89b4fa',
    text: '#cdd6f4', muted: '#7f849c', border: 'rgba(203,166,247,0.22)',
  },
  {
    id: 'one-dark', name: 'One Dark', tag: 'DARK', type: 'design', style: 'cyber',
    desc: 'Atom blue & purple on graphite — subdued and sharp.',
    bg: '#282c34', bg2: '#21252b', bg3: '#2c313c', primary: '#61afef', secondary: '#c678dd',
    text: '#abb2bf', muted: '#7f848e', border: 'rgba(97,175,239,0.2)',
  },
  // ── THEME PACKAGES ────────────────────────────────────────────────────────
  {
    id: 'pkg:holo-deck', name: 'Holo Deck', tag: 'STYLE', type: 'package', style: 'holo',
    desc: 'Holographic command surface — layered cyan glow, corner dialogs, holo boot.',
    bg: '#08121c', bg2: '#0c1a28', bg3: '#112236', primary: '#00e5ff', secondary: '#7b61ff',
    text: '#d0e8ff', muted: '#5a7898', border: 'rgba(0,229,255,0.22)',
    packageId: 'holo-deck',
  },
  {
    id: 'pkg:phosphor-terminal', name: 'Phosphor CRT', tag: 'STYLE', type: 'package', style: 'crt',
    desc: 'Green phosphor mainframe — CRT scanlines, matrix menus, blink-cursor boot.',
    bg: '#020604', bg2: '#04100a', bg3: '#071a0e', primary: '#33ff33', secondary: '#ccff00',
    text: '#c8ffc8', muted: '#2f7a3a', border: 'rgba(51,255,51,0.25)',
    packageId: 'phosphor-terminal',
  },
]

// ── Package lookup (settings sourced from THEME_PACKAGES registry) ────────────
const PACKAGE_LOOKUP = Object.fromEntries(THEME_PACKAGES.map(p => [p.id, p]))

export { THEMES, PACKAGE_LOOKUP }
