/**
 * themeLibraryData.js — pure data extracted from ThemeLibrary.jsx (god-file split).
 * Presentation components stay in ThemeLibrary.jsx.
 */

const ANIMATIONS = [
  // -- Entrance --------------------------------------------------------------
  { id: 'fadeUp',      name: 'Fade Up',        cat: 'entrance',    desc: 'Slide up from below',              use: 'Cards, sections, blog posts' },
  { id: 'fadeDown',    name: 'Fade Down',       cat: 'entrance',    desc: 'Fall in from above',               use: 'Dropdowns, notifications' },
  { id: 'fadeLeft',    name: 'Fade Left',       cat: 'entrance',    desc: 'Slide in from the left',           use: 'Sidebar panels, left blocks' },
  { id: 'fadeRight',   name: 'Fade Right',      cat: 'entrance',    desc: 'Slide in from the right',          use: 'Stats, skill bars, timeline' },
  { id: 'zoomIn',      name: 'Zoom In',         cat: 'entrance',    desc: 'Scale up from center',             use: 'Modals, popups, profile cards' },
  { id: 'flipIn',      name: 'Flip In',         cat: 'entrance',    desc: '3D Y-axis flip reveal',            use: 'Project cards, certifications' },
  { id: 'bounceIn',    name: 'Bounce In',       cat: 'entrance',    desc: 'Spring overshoot on entry',        use: 'Badges, toast messages' },
  // -- Attention -------------------------------------------------------------
  { id: 'pulse',       name: 'Pulse',           cat: 'attention',   desc: 'Breathing opacity effect',         use: 'Status dots, live indicators' },
  { id: 'glow-pulse',  name: 'Glow Pulse',      cat: 'attention',   desc: 'Neon glow breathing',              use: 'CTA buttons, active elements' },
  { id: 'float',       name: 'Float',           cat: 'attention',   desc: 'Gentle hover levitation',          use: 'Hero image, floating badges' },
  { id: 'shake',       name: 'Shake',           cat: 'attention',   desc: 'Error vibration',                  use: 'Form errors, failed actions' },
  { id: 'wiggle',      name: 'Wiggle',          cat: 'attention',   desc: 'Playful rotation sway',            use: 'Notification bell, icons' },
  { id: 'heartbeat',   name: 'Heartbeat',       cat: 'attention',   desc: 'Double-pulse scale',               use: 'Like buttons, health status' },
  // -- Loading ---------------------------------------------------------------
  { id: 'spin',        name: 'Spin',            cat: 'loading',     desc: 'Continuous rotation',              use: 'Spinners, loading icons' },
  { id: 'dots',        name: 'Bouncing Dots',   cat: 'loading',     desc: 'Three dots bounce in sequence',    use: 'Typing indicator, AI thinking' },
  { id: 'shimmer',     name: 'Shimmer',         cat: 'loading',     desc: 'Skeleton loading shimmer sweep',   use: 'Placeholder cards, content load' },
  { id: 'progressPulse', name: 'Progress Pulse', cat: 'loading',   desc: 'Indeterminate bar sweep',           use: 'Upload bars, page progress' },
  { id: 'ripple',      name: 'Ripple',          cat: 'loading',     desc: 'Expanding ring pulse',             use: 'Live status dot, online badge' },
  // -- Text / Hero -----------------------------------------------------------
  { id: 'glitch',      name: 'Glitch',          cat: 'text',        desc: 'RGB channel-offset glitch',        use: 'TANVIR hero name, logo glitch' },
  { id: 'neonFlicker', name: 'Neon Flicker',    cat: 'text',        desc: 'Random neon sign flicker',         use: 'AIFAZI green text, neon headings' },
  { id: 'typewriter',  name: 'Typewriter',      cat: 'text',        desc: 'Text types in char-by-char',       use: 'Hero taglines, terminal output' },
  { id: 'gradientFlow', name: 'Gradient Flow',  cat: 'text',        desc: 'Flowing color shift through text', use: 'Gradient name text, hero subtitle' },
  { id: 'letterPop',   name: 'Letter Pop',      cat: 'text',        desc: 'Letters stagger-pop in with delay', use: 'TANVIR / AIFAZI big text reveal' },
  // -- Background ------------------------------------------------------------
  { id: 'scanline',    name: 'Scan Line',       cat: 'background',  desc: 'Sci-fi CRT scanline sweep',        use: 'Terminal theme overlay' },
  { id: 'border',      name: 'Border Chase',    cat: 'background',  desc: 'Animated gradient border',         use: 'Cards, active inputs, CTAs' },
  { id: 'blink',       name: 'Cursor Blink',    cat: 'background',  desc: 'Terminal cursor blink',            use: 'Code blocks, terminal elements' },
  { id: 'ambientGlow', name: 'Ambient Glow',    cat: 'background',  desc: 'Soft radial glow pulse',           use: 'Hero bg, section highlights' },
  { id: 'gridPulse',   name: 'Grid Pulse',      cat: 'background',  desc: 'Dot grid breathes in and out',     use: 'Page backgrounds, sections' },
]

// -- Light theme IDs (used by smart toggle) ------------------------------------
const LIGHT_THEME_IDS = ['light', 'cyber-light', 'paper', 'neumorph', 'macos', 'pastel', 'win95', 'brutalist',
  'midnight-light','crimson-light','ocean-light','amber-light','rose-light','forest-light',
  'glass-light','synthwave-light','terminal-light','neon-noir-light','aurora-light',
  'mario-light','minecraft-light','sonic-light','pacman-light']

const THEME_DEFS = [
  // -- Color variants ----------------------------------------------------------
  { id: 'cyber-dark',  name: 'Cyber Dark',  tag: 'DARK',  type: 'color', desc: 'Default hacker aesthetic — deep black with neon green & cyan accents.',
    bg: '#060a0f', bg2: '#0b1118', bg3: '#111a24', primary: '#00ff88', secondary: '#00d4ff', orange: '#ff6b35', text: '#c8d8e8', muted: '#6b8296', border: 'color-mix(in srgb, var(--cyan) 15%, transparent)' },
  { id: 'cyber-light', name: 'Cyber Light', tag: 'LIGHT', type: 'color', desc: 'Clean muted slate — cyber family light mode.',
    bg: '#c8d4e0', bg2: '#bcc9d8', bg3: '#b0bece', primary: '#006e38', secondary: '#005d8f', orange: '#b84416', text: '#0a1520', muted: '#4a6478', border: 'rgba(0,93,143,0.28)' },
  { id: 'midnight',   name: 'Midnight',    tag: 'DARK',  type: 'design', desc: 'Deep violet & hot pink  moody and editorial.',
    bg: '#08051a', bg2: '#0e0a24', bg3: '#16102e', primary: '#a855f7', secondary: '#ec4899', orange: '#f97316', text: '#e2d9f3', muted: '#6b5a8a', border: 'rgba(168,85,247,0.18)' },
  { id: 'crimson',    name: 'Crimson',     tag: 'DARK',  type: 'design', desc: 'Blood red & ember orange  bold and aggressive.',
    bg: '#0f0608', bg2: '#1a0b0e', bg3: '#241014', primary: '#ef4444', secondary: '#f97316', orange: '#fb923c', text: '#f0d0d4', muted: '#8a6068', border: 'rgba(239,68,68,0.18)' },
  { id: 'ocean',      name: 'Ocean',       tag: 'DARK',  type: 'design', desc: 'Electric blue & teal  cool, deep, and immersive.',
    bg: '#020d1a', bg2: '#061525', bg3: '#0b1f33', primary: '#3b82f6', secondary: '#06b6d4', orange: '#f59e0b', text: '#c0d8f0', muted: '#4a6880', border: 'rgba(59,130,246,0.18)' },
  { id: 'amber',      name: 'Amber',       tag: 'DARK',  type: 'design', desc: 'Warm gold & orange  rich and glowing.',
    bg: '#0f0a02', bg2: '#1a1405', bg3: '#241c08', primary: '#f59e0b', secondary: '#f97316', orange: '#fb923c', text: '#fef3c7', muted: '#927040', border: 'rgba(245,158,11,0.18)' },
  { id: 'rose',       name: 'Rose',        tag: 'DARK',  type: 'design', desc: 'Soft pink & coral  elegant and expressive.',
    bg: '#0f0609', bg2: '#1a0c12', bg3: '#24121a', primary: '#f472b6', secondary: '#fb7185', orange: '#f97316', text: '#fde8f0', muted: '#8a6070', border: 'rgba(244,114,182,0.18)' },
  { id: 'forest',     name: 'Forest',      tag: 'DARK',  type: 'design', desc: 'Jungle green & lime  lush and organic.',
    bg: '#020b04', bg2: '#051508', bg3: '#091f0d', primary: '#4ade80', secondary: '#a3e635', orange: '#fb923c', text: '#d1fae5', muted: '#4a7858', border: 'rgba(74,222,128,0.15)' },
  { id: 'lava',       name: 'Lava',        tag: 'DARK',  type: 'design', desc: 'Molten magma  black with red-orange heat.',
    bg: '#0a0502', bg2: '#140a04', bg3: '#1e0f06', primary: '#ff3d00', secondary: '#ff9100', orange: '#ff6d00', text: '#ffe8d6', muted: '#8a5a40', border: 'rgba(255,61,0,0.2)' },
  { id: 'toxic',      name: 'Toxic',       tag: 'DARK',  type: 'design', desc: 'Hazard acid  near-black with venomous yellow-green.',
    bg: '#060803', bg2: '#0b1005', bg3: '#121a08', primary: '#a3e635', secondary: '#ccff00', orange: '#eab308', text: '#ecffc8', muted: '#6a7a3a', border: 'rgba(163,230,53,0.2)' },
  { id: 'ice',        name: 'Ice',         tag: 'LIGHT', type: 'design', desc: 'Arctic frost  pale blue with cool cyan accents.',
    bg: '#eef4fa', bg2: '#e3edf7', bg3: '#d8e6f2', primary: '#0284c7', secondary: '#0891b2', orange: '#ea580c', text: '#0b1a2a', muted: '#4a6a86', border: 'rgba(2,132,199,0.22)' },
  // -- Design styles -----------------------------------------------------------
  { id: 'glass-dark', name: 'Glass',       tag: 'STYLE', type: 'design', desc: 'Frosted glassmorphism  translucent depth layers.',
    bg: '#04080f', bg2: 'rgba(10,18,32,0.45)', bg3: 'rgba(16,26,46,0.55)', primary: '#00e5ff', secondary: '#7b61ff', orange: '#ff6b35', text: '#d0e8ff', muted: '#5a7898', border: 'rgba(0,229,255,0.22)' },
  { id: 'brutalist',  name: 'Brutal',      tag: 'STYLE', type: 'design', desc: 'Raw bold brutalism  thick borders, no shadows.',
    bg: '#f2f0ec', bg2: '#e8e5df', bg3: '#dedad2', primary: '#e8000d', secondary: '#000000', orange: '#ff6b00', text: '#000000', muted: '#555555', border: '#000000' },
  { id: 'synthwave',  name: 'Synth',       tag: 'STYLE', type: 'design', desc: 'Retro 80s arcade  neon pink & cyan on deep purple.',
    bg: '#0d0618', bg2: '#130828', bg3: '#180a30', primary: '#ff2d8b', secondary: '#00f0ff', orange: '#ff6b35', text: '#f0d8ff', muted: '#7858a0', border: 'rgba(255,45,139,0.28)' },
  { id: 'paper',      name: 'Paper',       tag: 'LIGHT', type: 'design', desc: 'Minimal editorial  ink on warm parchment.',
    bg: '#f5f0e8', bg2: '#ede8df', bg3: '#e4ddd3', primary: '#c41a1a', secondary: '#1a3a6c', orange: '#c87400', text: '#1a1a1a', muted: '#6b6060', border: 'rgba(0,0,0,0.18)' },
  { id: 'neumorph',   name: 'Neumorph',    tag: 'LIGHT', type: 'design', desc: 'Soft 3D neumorphism  clay-like raised surfaces.',
    bg: '#e0e5ec', bg2: '#e8edf4', bg3: '#d6dbe4', primary: '#6c63ff', secondary: '#4ecdc4', orange: '#f7b731', text: '#2d3748', muted: '#718096', border: 'rgba(108,99,255,0.15)' },
  { id: 'terminal',   name: 'Terminal',    tag: 'STYLE', type: 'design', desc: 'Old-school DOS/CRT  phosphor green on black.',
    bg: '#0a0a0a', bg2: '#0f0f0f', bg3: '#141414', primary: '#33ff33', secondary: '#ffcc00', orange: '#ff6600', text: '#33ff33', muted: '#228822', border: 'rgba(51,255,51,0.25)' },
  { id: 'macos',      name: 'macOS',       tag: 'LIGHT', type: 'design', desc: 'Apple-inspired  clean SF typography, subtle shadows.',
    bg: '#f5f5f7', bg2: '#ffffff', bg3: '#ebebed', primary: '#0071e3', secondary: '#34aadc', orange: '#ff9500', text: '#1d1d1f', muted: '#86868b', border: 'rgba(0,0,0,0.12)' },
  { id: 'neon-noir',  name: 'Neon Noir',   tag: 'DARK',  type: 'design', desc: 'Cinematic dark  orange & purple neon on near-black.',
    bg: '#0a0a0e', bg2: '#10101a', bg3: '#16161f', primary: '#ff6b35', secondary: '#cc44ff', orange: '#ff6b35', text: '#d8d0e0', muted: '#6a5a7a', border: 'rgba(204,68,255,0.2)' },
  { id: 'pastel',     name: 'Pastel',      tag: 'LIGHT', type: 'design', desc: 'Soft dreamy pastels  lilac, pink, and lavender.',
    bg: '#fdf4ff', bg2: '#fff0fb', bg3: '#f5e8ff', primary: '#c084fc', secondary: '#f9a8d4', orange: '#fbbf24', text: '#3d1f5c', muted: '#9d6db8', border: 'rgba(192,132,252,0.3)' },
  { id: 'win95',      name: 'Win95',       tag: 'STYLE', type: 'design', desc: 'Classic Windows 95  inset bevels and teal desktop.',
    bg: '#008080', bg2: '#c0c0c0', bg3: '#d4d0c8', primary: '#000080', secondary: '#ffffff', orange: '#804000', text: '#000000', muted: '#444444', border: '#808080' },
  { id: 'aurora',     name: 'Aurora',      tag: 'DARK',  type: 'design', desc: 'Northern lights  teal & pink gradient on deep navy.',
    bg: '#050d1a', bg2: '#08142a', bg3: '#0c1c38', primary: '#64ffda', secondary: '#ff6fd8', orange: '#f59e0b', text: '#cce8ff', muted: '#5a8099', border: 'rgba(100,255,218,0.2)' },
  { id: 'mario',      name: 'Mario',       tag: 'GAME',  type: 'design', desc: 'Warp-pipe red & coin gold on starry navy.',
    bg: '#0a0d1c', bg2: '#10142a', bg3: '#161a36', primary: '#e52521', secondary: '#ffd700', orange: '#f59e0b', text: '#fdf6e3', muted: '#8a7f66', border: 'rgba(229,37,33,0.3)' },
  { id: 'minecraft',  name: 'Minecraft',   tag: 'GAME',  type: 'design', desc: 'Creeper green & water blue with blocky depth.',
    bg: '#141210', bg2: '#1d1a17', bg3: '#262219', primary: '#5ad427', secondary: '#2a9dd6', orange: '#d97706', text: '#d8d5c8', muted: '#6f6a5a', border: 'rgba(90,212,39,0.28)' },
  { id: 'sonic',      name: 'Sonic',       tag: 'GAME',  type: 'design', desc: 'Speed blue & ring gold on deep navy.',
    bg: '#070d2b', bg2: '#0c1440', bg3: '#111a54', primary: '#1e6fd9', secondary: '#f5d200', orange: '#ff6b35', text: '#e8f0ff', muted: '#5a6a9a', border: 'rgba(30,111,217,0.3)' },
  { id: 'pacman',     name: 'Pac-Man',     tag: 'GAME',  type: 'design', desc: 'Arcade maze yellow & cyan on void black.',
    bg: '#05030f', bg2: '#0a0718', bg3: '#100b24', primary: '#ffe000', secondary: '#00cfff', orange: '#ff5c00', text: '#f4f0ff', muted: '#5a5078', border: 'rgba(255,224,0,0.3)' },
  // -- Expansion pack — 6 new families (dark + light) --------------------------
  { id: 'ember-dark',   name: 'Ember',      tag: 'DARK',  type: 'design', desc: 'Burnt orange on charcoal  hot and industrial.',
    bg: '#100605', bg2: '#1a0b07', bg3: '#241008', primary: '#ff5722', secondary: '#ff9800', orange: '#ffb74d', text: '#ffe8dd', muted: '#8a5a44', border: 'rgba(255,87,34,0.22)' },
  { id: 'ember-light',  name: 'Ember Light',tag: 'LIGHT', type: 'design', desc: 'Warm peach  the ember family light mode.',
    bg: '#fbe9e0', bg2: '#f5d9cb', bg3: '#efc9b8', primary: '#d84315', secondary: '#ef6c00', orange: '#e65100', text: '#2b1208', muted: '#8a5a44', border: 'rgba(216,67,21,0.22)' },
  { id: 'cobalt-dark',  name: 'Cobalt',     tag: 'DARK',  type: 'design', desc: 'Deep blue & electric cyan  precise and technical.',
    bg: '#050b1e', bg2: '#0a142f', bg3: '#101c40', primary: '#1e50ff', secondary: '#00c2ff', orange: '#ffb300', text: '#d6e2ff', muted: '#4a5a8a', border: 'rgba(30,80,255,0.22)' },
  { id: 'cobalt-light', name: 'Cobalt Light',tag: 'LIGHT',type: 'design', desc: 'Sky blue & cobalt  the cobalt family light mode.',
    bg: '#e9efff', bg2: '#dde7ff', bg3: '#d0ddfc', primary: '#0037c9', secondary: '#0077b6', orange: '#d98a00', text: '#0a1030', muted: '#5a6a9a', border: 'rgba(0,55,201,0.2)' },
  { id: 'slate-dark',   name: 'Slate',      tag: 'DARK',  type: 'design', desc: 'Minimal monochrome  quiet and professional.',
    bg: '#0b0e12', bg2: '#12161c', bg3: '#1a1f27', primary: '#94a3b8', secondary: '#cbd5e1', orange: '#f59e0b', text: '#e2e8f0', muted: '#64748b', border: 'rgba(148,163,184,0.18)' },
  { id: 'slate-light',  name: 'Slate Light',tag: 'LIGHT', type: 'design', desc: 'Light gray paper  the slate family light mode.',
    bg: '#f1f5f9', bg2: '#e2e8f0', bg3: '#cbd5e1', primary: '#334155', secondary: '#0f172a', orange: '#b45309', text: '#0f172a', muted: '#64748b', border: 'rgba(51,65,85,0.18)' },
  { id: 'honey-dark',   name: 'Honey',      tag: 'DARK',  type: 'design', desc: 'Warm gold & amber  sweet and glowing.',
    bg: '#0d0a02', bg2: '#171205', bg3: '#211a08', primary: '#ffb300', secondary: '#ff8f00', orange: '#ffc107', text: '#fff3c4', muted: '#8a7020', border: 'rgba(255,179,0,0.22)' },
  { id: 'honey-light',  name: 'Honey Light',tag: 'LIGHT', type: 'design', desc: 'Soft honey cream  the honey family light mode.',
    bg: '#fdf6e3', bg2: '#f7ecce', bg3: '#f0e0b8', primary: '#c47f00', secondary: '#8f5f00', orange: '#d98200', text: '#221800', muted: '#7a6520', border: 'rgba(196,127,0,0.2)' },
  { id: 'violet-dark',  name: 'Violet',     tag: 'DARK',  type: 'design', desc: 'Violet & periwinkle  dreamy and expressive.',
    bg: '#0c0718', bg2: '#140c26', bg3: '#1c1238', primary: '#8b5cf6', secondary: '#c084fc', orange: '#f59e0b', text: '#ede3ff', muted: '#6a5a9a', border: 'rgba(139,92,246,0.22)' },
  { id: 'violet-light', name: 'Violet Light',tag: 'LIGHT',type: 'design', desc: 'Lavender mist  the violet family light mode.',
    bg: '#f1eaff', bg2: '#e6dafc', bg3: '#d9c8fb', primary: '#6d28d9', secondary: '#9333ea', orange: '#c27800', text: '#1b0f3d', muted: '#6a5a9a', border: 'rgba(109,40,217,0.18)' },
  { id: 'teal-dark',    name: 'Teal',       tag: 'DARK',  type: 'design', desc: 'Teal & mint  calm and aquatic.',
    bg: '#031210', bg2: '#061c19', bg3: '#0a2823', primary: '#2dd4bf', secondary: '#5eead4', orange: '#fb923c', text: '#d5fff8', muted: '#3d6f66', border: 'rgba(45,212,191,0.22)' },
  { id: 'teal-light',   name: 'Teal Light', tag: 'LIGHT', type: 'design', desc: 'Fresh mint  the teal family light mode.',
    bg: '#e6fffb', bg2: '#d3f6f0', bg3: '#c0ede5', primary: '#0f766e', secondary: '#115e59', orange: '#c2410c', text: '#0a2a26', muted: '#3d6f66', border: 'rgba(15,118,110,0.2)' },
  // -- Iconic developer palettes -------------------------------------------------
  { id: 'dracula',   name: 'Dracula',      tag: 'DARK',  type: 'design', desc: 'Vampire purple & hot pink on plum black — the beloved editor theme.',
    bg: '#282a36', bg2: '#2f3242', bg3: '#383c4e', primary: '#bd93f9', secondary: '#ff79c6', orange: '#ffb86c', text: '#f8f8f2', muted: '#7a86a8', border: 'rgba(189,147,249,0.22)' },
  { id: 'nord',      name: 'Nord',         tag: 'DARK',  type: 'design', desc: 'Arctic frost blues on polar night — calm and clinical.',
    bg: '#2e3440', bg2: '#3b4252', bg3: '#434c5e', primary: '#88c0d0', secondary: '#81a1c1', orange: '#d08770', text: '#eceff4', muted: '#7b88a0', border: 'rgba(136,192,208,0.2)' },
  { id: 'tokyo-night', name: 'Tokyo Night', tag: 'DARK', type: 'design', desc: 'Neon blue & violet glow on midnight indigo.',
    bg: '#1a1b26', bg2: '#232433', bg3: '#2a2d3f', primary: '#7aa2f7', secondary: '#bb9af7', orange: '#ff9e64', text: '#c0caf5', muted: '#6a739d', border: 'rgba(122,162,247,0.22)' },
  { id: 'gruvbox',   name: 'Gruvbox',      tag: 'DARK',  type: 'design', desc: 'Retro groove warm yellow & aqua on dark umber.',
    bg: '#282828', bg2: '#32302f', bg3: '#3c3836', primary: '#fabd2f', secondary: '#83a598', orange: '#fe8019', text: '#ebdbb2', muted: '#a89984', border: 'rgba(250,189,47,0.2)' },
  { id: 'solarized-dark', name: 'Solarized', tag: 'DARK', type: 'design', desc: 'Precision teal & blue on deep cyan-black.',
    bg: '#002b36', bg2: '#073642', bg3: '#0d3c47', primary: '#268bd2', secondary: '#2aa198', orange: '#cb4b16', text: '#93a1a1', muted: '#6b7f87', border: 'rgba(38,139,210,0.22)' },
  { id: 'monokai',   name: 'Monokai',      tag: 'DARK',  type: 'design', desc: 'Lime & hot pink on warm charcoal — the classic.',
    bg: '#272822', bg2: '#32332d', bg3: '#3b3d35', primary: '#a6e22e', secondary: '#66d9ef', orange: '#fd971f', text: '#f8f8f2', muted: '#8a8674', border: 'rgba(166,226,46,0.2)' },
  { id: 'catppuccin', name: 'Catppuccin',  tag: 'DARK',  type: 'design', desc: 'Pastel mauve & sky on espresso mocha.',
    bg: '#11111b', bg2: '#181825', bg3: '#1e1e2e', primary: '#cba6f7', secondary: '#89b4fa', orange: '#fab387', text: '#cdd6f4', muted: '#7f849c', border: 'rgba(203,166,247,0.22)' },
  { id: 'one-dark',  name: 'One Dark',     tag: 'DARK',  type: 'design', desc: 'Atom blue & purple on graphite — subdued and sharp.',
    bg: '#282c34', bg2: '#21252b', bg3: '#2c313c', primary: '#61afef', secondary: '#c678dd', orange: '#d19a66', text: '#abb2bf', muted: '#7f848e', border: 'rgba(97,175,239,0.2)' },
]

// Themes introduced in the latest expansion pack (flagged with a NEW badge).
// addedAt drives the 30-day auto-expiry; per-theme dismissal persists in
// localStorage (tl_new_cleared) via NEW_THEME_IDS.delete().
const NEW_THEME_ADDED_AT = {
  'ember-dark': '2026-09-01T00:00:00.000Z', 'ember-light': '2026-09-01T00:00:00.000Z',
  'cobalt-dark': '2026-09-01T00:00:00.000Z', 'cobalt-light': '2026-09-01T00:00:00.000Z',
  'slate-dark': '2026-09-01T00:00:00.000Z', 'slate-light': '2026-09-01T00:00:00.000Z',
  'honey-dark': '2026-09-01T00:00:00.000Z', 'honey-light': '2026-09-01T00:00:00.000Z',
  'violet-dark': '2026-09-01T00:00:00.000Z', 'violet-light': '2026-09-01T00:00:00.000Z',
  'teal-dark': '2026-09-01T00:00:00.000Z', 'teal-light': '2026-09-01T00:00:00.000Z',
  dracula: '2026-09-01T00:00:00.000Z', nord: '2026-09-01T00:00:00.000Z',
  'tokyo-night': '2026-09-01T00:00:00.000Z', gruvbox: '2026-09-01T00:00:00.000Z',
  'solarized-dark': '2026-09-01T00:00:00.000Z', monokai: '2026-09-01T00:00:00.000Z',
  catppuccin: '2026-09-01T00:00:00.000Z', 'one-dark': '2026-09-01T00:00:00.000Z',
}
const NEW_THEME_TTL_MS = 30 * 24 * 60 * 60 * 1000
function newThemeDaysLeft(id) {
  const at = Date.parse(NEW_THEME_ADDED_AT[id] || '')
  if (Number.isNaN(at)) return 0
  return Math.ceil((at + NEW_THEME_TTL_MS - Date.now()) / 86400000)
}
function isNewTheme(id) {
  if (!(id in NEW_THEME_ADDED_AT) || newThemeDaysLeft(id) <= 0) return false
  try {
    const cleared = JSON.parse(localStorage.getItem('tl_new_cleared') || '[]') || []
    if (cleared.includes(id)) return false
  } catch {}
  return true
}
// Set-compatible shim so existing .has/.delete/.size reads keep working.
const NEW_THEME_IDS = {
  has: (id) => isNewTheme(id),
  delete: (id) => {
    try {
      const cleared = JSON.parse(localStorage.getItem('tl_new_cleared') || '[]') || []
      if (!cleared.includes(id)) localStorage.setItem('tl_new_cleared', JSON.stringify([...cleared, id]))
    } catch {}
    return true
  },
  get size() { return Object.keys(NEW_THEME_ADDED_AT).filter(isNewTheme).length },
}

// ── Theme Style Library — built-in full-look templates ───────────────────────
// Each template is a complete "style" you can load onto any theme: fonts, glow,
// radius, border weight, background pattern/gradient and optional accent colors.
// Applied through the same themeCustom machinery as presets.
const STYLE_TEMPLATES = [
  { id: 'tpl-neon-rush', name: 'Neon Rush', tag: 'NEON', desc: 'High-voltage neon: punchy greens, tight radius, subtle grid backdrop.',
    swatch: ['#060a0f', '#00ff88', '#00d4ff'],
    draft: { fontDisplay: 'Orbitron', fontMono: 'Share Tech Mono', fontCode: 'Share Tech Mono', glow: 0.85, radius: 6, borderWidth: 1, bgPattern: 'grid', colors: { green: '#00ff88', cyan: '#00d4ff', purple: '#8b5cf6' } } },
  { id: 'tpl-glass-clean', name: 'Glass Clean', tag: 'MINIMAL', desc: 'Frosted, quiet surfaces — soft radius, no background texture.',
    swatch: ['#04080f', '#00e5ff', '#7b61ff'],
    draft: { fontDisplay: 'Outfit', fontMono: 'JetBrains Mono', fontCode: 'JetBrains Mono', glow: 0.35, radius: 18, borderWidth: 1, bgPattern: 'none' } },
  { id: 'tpl-retro-arcade', name: 'Retro Arcade', tag: 'RETRO', desc: '80s synthwave — neon pink/cyan over a deep gradient dusk.',
    swatch: ['#0d0618', '#ff2d8b', '#00f0ff'],
    draft: { fontDisplay: 'Orbitron', fontMono: 'Space Mono', fontCode: 'Space Mono', glow: 1, radius: 4, borderWidth: 2, bgPattern: 'none', bgGradientFrom: '#12001f', bgGradientTo: '#1a0033', bgGradientAngle: 160, colors: { purple: '#ff2d8b', cyan: '#00f0ff' } } },
  { id: 'tpl-brutal-edge', name: 'Brutal Edge', tag: 'BOLD', desc: 'Raw industrial — square corners, thick borders, zero glow.',
    swatch: ['#f2f0ec', '#e8000d', '#000000'],
    draft: { fontDisplay: 'Anton', fontMono: 'Space Mono', fontCode: 'Space Mono', glow: 0, radius: 0, borderWidth: 3, bgPattern: 'none' } },
  { id: 'tpl-cinematic', name: 'Cinematic Noir', tag: 'DRAMA', desc: 'Moody dark film — orange and purple neon on near-black.',
    swatch: ['#0a0a0e', '#ff6b35', '#cc44ff'],
    draft: { fontDisplay: 'Bebas Neue', fontMono: 'JetBrains Mono', fontCode: 'JetBrains Mono', glow: 0.55, radius: 10, borderWidth: 1, bgPattern: 'none', colors: { orange: '#ff6b35', purple: '#cc44ff' } } },
  { id: 'tpl-soft-pastel', name: 'Soft Pastel', tag: 'SOFT', desc: 'Airy and dreamy — light surfaces, generous rounding, gentle accents.',
    swatch: ['#fdf4ff', '#c084fc', '#f9a8d4'],
    draft: { fontDisplay: 'Quicksand', fontMono: 'DM Mono', fontCode: 'DM Mono', glow: 0.2, radius: 20, borderWidth: 1, bgPattern: 'none' } },
  { id: 'tpl-eco-glow', name: 'Eco Glow', tag: 'ORGANIC', desc: 'Jungle greens with a dotted backdrop and medium glow.',
    swatch: ['#020b04', '#4ade80', '#a3e635'],
    draft: { fontDisplay: 'Poppins', fontMono: 'JetBrains Mono', fontCode: 'JetBrains Mono', glow: 0.6, radius: 14, borderWidth: 1, bgPattern: 'dots', colors: { green: '#4ade80', cyan: '#a3e635' } } },
  { id: 'tpl-crt-terminal', name: 'CRT Terminal', tag: 'RETRO', desc: 'Phosphor green on black — matrix backdrop, near-square type.',
    swatch: ['#0a0a0a', '#33ff33', '#ffcc00'],
    draft: { fontDisplay: 'VT323', fontMono: 'VT323', fontCode: 'VT323', glow: 0.9, radius: 2, borderWidth: 1, bgPattern: 'matrix', colors: { green: '#33ff33', text: '#33ff33', muted: '#228822' } } },
  { id: 'tpl-pixel-pop', name: 'Pixel Pop', tag: 'ARCADE', desc: 'Chunky arcade lettering, blocky corners and a grid floor.',
    swatch: ['#0a0d1c', '#e52521', '#ffd700'],
    draft: { fontDisplay: 'Press Start 2P', fontMono: 'VT323', fontCode: 'VT323', glow: 0.7, radius: 0, borderWidth: 2, bgPattern: 'grid' } },
  { id: 'tpl-honey-glow', name: 'Honey Glow', tag: 'WARM', desc: 'Warm gold everywhere — display serif headings and amber accents.',
    swatch: ['#0d0a02', '#ffb300', '#ff8f00'],
    draft: { fontDisplay: 'Playfair Display', fontMono: 'JetBrains Mono', fontCode: 'JetBrains Mono', glow: 0.5, radius: 12, borderWidth: 1, bgPattern: 'none', colors: { green: '#ffb300', cyan: '#ff8f00', orange: '#ffc107' } } },
  { id: 'tpl-gold-editorial', name: 'Gold Editorial', tag: 'EDITORIAL', desc: 'Ink on parchment — serif body, warm paper, no glow.',
    swatch: ['#f5f0e8', '#c41a1a', '#1a3a6c'],
    draft: { fontDisplay: 'Libre Baskerville', fontMono: 'Courier Prime', fontCode: 'Courier Prime', glow: 0, radius: 8, borderWidth: 1, bgPattern: 'none' } },
  { id: 'tpl-ocean-deep', name: 'Ocean Deep', tag: 'CALM', desc: 'Electric blue and teal over a downward gradient — immersive and cool.',
    swatch: ['#020d1a', '#3b82f6', '#06b6d4'],
    draft: { fontDisplay: 'Raleway', fontMono: 'Fira Code', fontCode: 'Fira Code', glow: 0.7, radius: 10, borderWidth: 1, bgPattern: 'none', bgGradientFrom: '#020d1a', bgGradientTo: '#062b4a', bgGradientAngle: 150, colors: { green: '#3b82f6', cyan: '#06b6d4' } } },
  { id: 'tpl-midnight-oil', name: 'Midnight Oil', tag: 'CALM', desc: 'Deep navy with an amber glow — generous rounding over a subtle dot grid.',
    swatch: ['#0a1128', '#f5b301', '#ff8f00'],
    draft: { fontDisplay: 'Syne', fontMono: 'JetBrains Mono', fontCode: 'JetBrains Mono', glow: 0.6, radius: 18, borderWidth: 1, bgPattern: 'dots', colors: { green: '#f5b301', cyan: '#ff8f00', orange: '#ffb74d' } } },
  { id: 'tpl-paper-clean', name: 'Paper Clean', tag: 'EDITORIAL', desc: 'Crisp light editorial — serif display, flat surfaces, zero glow, no texture.',
    swatch: ['#faf9f6', '#1a1a1a', '#8a6d2f'],
    draft: { fontDisplay: 'Libre Baskerville', fontMono: 'Courier Prime', fontCode: 'Courier Prime', glow: 0, radius: 6, borderWidth: 1, bgPattern: 'none' } },
  { id: 'tpl-win95-chunky', name: 'Win95 Chunky', tag: 'RETRO', desc: 'Blocky desktop-nostalgia — grotesk headings, thick borders, grid floor, zero glow.',
    swatch: ['#000080', '#008080', '#c0c0c0'],
    draft: { fontDisplay: 'Space Grotesk', fontMono: 'DM Mono', fontCode: 'DM Mono', glow: 0, radius: 0, borderWidth: 3, bgPattern: 'grid', colors: { green: '#000080', cyan: '#008080', text: '#000000', muted: '#444444' } } },
  { id: 'tpl-scanline-ops', name: 'Scanline Ops', tag: 'RETRO', desc: 'Phosphor console ops — amber alerts over green-on-black with a matrix backdrop.',
    swatch: ['#0a0a0a', '#33ff33', '#ffcc00'],
    draft: { fontDisplay: 'VT323', fontMono: 'Share Tech Mono', fontCode: 'Share Tech Mono', glow: 0.9, radius: 2, borderWidth: 1, bgPattern: 'matrix', colors: { green: '#33ff33', cyan: '#ffcc00', text: '#33ff33', muted: '#228822' } } },
  { id: 'tpl-holo-frost', name: 'Holo Frost', tag: 'CALM', desc: 'Glacial holo sheen — cyan/violet accents, soft radius over a dotted frost.',
    swatch: ['#04080f', '#00e5ff', '#7b61ff'],
    draft: { fontDisplay: 'Outfit', fontMono: 'JetBrains Mono', fontCode: 'JetBrains Mono', glow: 0.45, radius: 18, borderWidth: 1, bgPattern: 'dots', colors: { green: '#00e5ff', cyan: '#7b61ff', purple: '#00e5ff' } } },
  { id: 'tpl-ink-ledger', name: 'Ink Ledger', tag: 'EDITORIAL', desc: 'Ledger red and navy ink — heavy display type, square cuts, no glow.',
    swatch: ['#f5f0e8', '#c41a1a', '#1a3a6c'],
    draft: { fontDisplay: 'Anton', fontMono: 'Courier Prime', fontCode: 'Courier Prime', glow: 0, radius: 0, borderWidth: 3, bgPattern: 'none', colors: { green: '#c41a1a', cyan: '#1a3a6c', orange: '#c87400' } } },
  { id: 'tpl-dusk-pastel', name: 'Dusk Terminal Pastel', tag: 'SOFT', desc: 'Pastel neon at dusk — lavender and mint over a violet-to-teal gradient.',
    swatch: ['#1a1033', '#c084fc', '#5eead4'],
    draft: { fontDisplay: 'Quicksand', fontMono: 'DM Mono', fontCode: 'DM Mono', glow: 0.3, radius: 20, borderWidth: 1, bgPattern: 'none', bgGradientFrom: '#1a1033', bgGradientTo: '#0d2b3a', bgGradientAngle: 155, colors: { green: '#c084fc', cyan: '#5eead4' } } },
]

// Merge a style template into a full customization draft (base keeps its theme
// defaults for any keys the template does not touch).
function applyTemplateToDraft(base, tpl) {
  const d = tpl?.draft || {}
  return {
    ...base,
    fontDisplay: d.fontDisplay || base.fontDisplay,
    fontMono: d.fontMono || base.fontMono,
    fontCode: d.fontCode || base.fontCode,
    glow: typeof d.glow === 'number' ? d.glow : base.glow,
    radius: typeof d.radius === 'number' ? d.radius : base.radius,
    borderWidth: typeof d.borderWidth === 'number' ? d.borderWidth : base.borderWidth,
    bgPattern: d.bgPattern || base.bgPattern,
    bgGradientFrom: d.bgGradientFrom || base.bgGradientFrom,
    bgGradientTo: d.bgGradientTo || base.bgGradientTo,
    bgGradientAngle: typeof d.bgGradientAngle === 'number' ? d.bgGradientAngle : base.bgGradientAngle,
    colors: { ...(base.colors || {}), ...(d.colors || {}) },
  }
}

function makeId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

function nowISO() {
  return new Date().toISOString()
}

const ANIM_CATEGORIES = [
  { id: 'ALL',        label: 'All',           color: 'var(--green)' },
  { id: 'entrance',   label: '🎬 Entrance',    color: '#64b5f6' },
  { id: 'attention',  label: '⚡ Attention',   color: '#ffb74d' },
  { id: 'loading',    label: '⏳ Loading',     color: '#ce93d8' },
  { id: 'text',       label: '📝 Text / Hero', color: '#80cbc4' },
  { id: 'background', label: '🎨 Background',  color: '#ef9a9a' },
]

// -- Background Animation -------------------------------------------------------
const ANIMATION_PATTERNS = [
  { id: 'none',          name: 'None',        icon: '∅', desc: 'No animated background',                preview: 'none' },
  { id: 'aurora-ribbons',name: 'Ribbons',     icon: '⌁', desc: 'Slow drifting aurora ribbons',          preview: 'gradient' },
  { id: 'contours',      name: 'Contours',    icon: '≋', desc: 'Animated hand-drawn flow lines',        preview: 'svg' },
  { id: 'flow-grid',     name: 'Flow Grid',   icon: '⌗', desc: 'Moving technical grid and light sweep', preview: 'linear-gradient' },
  { id: 'particle-field',name: 'Particles',   icon: '✦', desc: 'Floating star-like micro particles',    preview: 'radial' },
  { id: 'nebula',        name: 'Nebula',      icon: '🌌', desc: 'Slow-morphing cosmic gas clouds',      preview: 'radial-gradient' },
  { id: 'kaleidoscope',  name: 'Kaleidoscope',icon: '🕐', desc: 'Rotating geometric mandala',           preview: 'conic-gradient' },
  { id: 'glow-orbs',     name: 'Glow Orbs',   icon: '💫', desc: 'Floating soft light spheres',          preview: 'radial-gradient' },
  { id: 'gradient-mesh', name: 'Gradient Mesh',icon: '🎨', desc: 'Slow-morphing colored mesh gradient', preview: 'radial-gradient' },
  { id: 'bokeh',         name: 'Bokeh',       icon: '🌫️', desc: 'Soft blurred light circles',           preview: 'radial-gradient' },
  { id: 'shooting-stars',name: 'Shooting Stars', icon: '☄️', desc: 'Streaking light trails',             preview: 'linear-gradient' },
  { id: 'circuit-glow',  name: 'Circuit Glow',icon: '🟢', desc: 'Animated circuit board traces',        preview: 'svg' },
  { id: 'wave-lines',    name: 'Wave Lines',  icon: '〰️', desc: 'Layered flowing sine waves',           preview: 'svg' },
  { id: 'cyber-grid',    name: 'Cyber Grid',  icon: '🔳', desc: 'Perspective grid moving toward viewer',preview: 'linear-gradient' },
  { id: 'stardust',      name: 'Stardust',    icon: '🌟', desc: 'Slow-drifting twinkling starfield',    preview: 'radial' },
  { id: 'light-beams',   name: 'Light Beams', icon: '🔦', desc: 'Rotating conic light beams',           preview: 'conic-gradient' },
  { id: 'scan-sweep',    name: 'Scan Sweep',  icon: '📡', desc: 'Vertical light sweep over grid',       preview: 'linear-gradient' },
  { id: 'hex-flow',      name: 'Hex Flow',    icon: '⬡', desc: 'Flowing hexagon field',                preview: 'linear-gradient' },
  { id: 'matrix-rain',   name: 'Matrix Rain', icon: '🌧️', desc: 'Falling green code columns',           preview: 'grid' },
]

// -- Grid Overlay ---------------------------------------------------------------
const GRID_PATTERNS = [
  { id: 'clean',         name: 'None',       icon: '∅', desc: 'No grid overlay',                      preview: 'none' },
  { id: 'grid',          name: 'Grid',       icon: '▦', desc: 'Standard square grid',                 preview: 'var(--grid-line)' },
  { id: 'dots',          name: 'Dots',       icon: '●', desc: 'Polka dot grid',                       preview: 'radial' },
  { id: 'scanlines',     name: 'Scanlines',  icon: '▤', desc: 'Horizontal CRT scan lines',            preview: 'repeating-linear-gradient' },
  { id: 'circuit',       name: 'Circuit',    icon: '⚡', desc: 'Intersecting diagonal traces',          preview: 'repeating-linear-gradient' },
  { id: 'hexagons',      name: 'Hexagons',   icon: '⬡', desc: 'Honeycomb approximate grid',           preview: 'linear-gradient' },
  { id: 'matrix',        name: 'Matrix',     icon: '🌧️', desc: 'Vertical rain columns',                preview: 'grid' },
  { id: 'noise',         name: 'Noise',      icon: '▣', desc: 'Subtle film grain texture',            preview: 'url' },
  { id: 'radial',        name: 'Radial',     icon: '◎', desc: 'Fine dot scattering',                  preview: 'radial' },
  { id: 'waves',         name: 'Waves',      icon: '〰️', desc: 'Concentric ripple rings',              preview: 'radial-gradient' },
  { id: 'paper-doc',     name: 'Paper Doc',  icon: '📄', desc: 'Horizontal ruled line surface',        preview: 'linear-gradient' },
  { id: 'terminal',      name: 'Terminal',   icon: '💻', desc: 'Phosphor scanline surface',            preview: 'repeating-linear-gradient' },
  { id: 'neon-stage',    name: 'Neon Stage', icon: '🎭', desc: 'Dual-axis neon glow grid',             preview: 'linear-gradient' },
  { id: 'dashboard',     name: 'Dashboard',  icon: '📊', desc: 'Dense telemetry grid',                preview: 'linear-gradient' },
  { id: 'blueprint',     name: 'Blueprint',  icon: '📐', desc: 'Engineering blueprint double grid',    preview: 'linear-gradient' },
  { id: 'isometric',     name: 'Isometric',  icon: '📦', desc: 'Angled 3D tile grid',                 preview: 'linear-gradient' },
  { id: 'rhombus',       name: 'Rhombus',    icon: '◆', desc: 'Diamond weave grid',                   preview: 'linear-gradient' },
  { id: 'crosshatch',    name: 'Crosshatch', icon: '𝄳', desc: 'Tight diagonal hatch',                preview: 'repeating-linear-gradient' },
  { id: 'weave',         name: 'Weave',      icon: '🕸️', desc: 'Interlocking woven bands',             preview: 'repeating-linear-gradient' },
  { id: 'plus',          name: 'Plus',       icon: '✚', desc: 'Plus-sign tile pattern',               preview: 'linear-gradient' },
  { id: 'pixel',         name: 'Pixel',      icon: '👾', desc: 'Blocky pixelated grid',               preview: 'linear-gradient' },
  { id: 'corner',        name: 'Corner',     icon: '❐', desc: 'Bracket corner marks',                 preview: 'linear-gradient' },
  { id: 'fiber',         name: 'Fiber',      icon: '🔹', desc: 'Fiber-optic dots on traces',          preview: 'linear-gradient' },
  { id: 'polar',         name: 'Polar',      icon: '◎', desc: 'Concentric polar rings with axes',    preview: 'radial-gradient' },
]

// -- Custom theme builder -------------------------------------------------------
const DEFAULT_CUSTOM = {
  id: 'custom', name: 'My Theme', tag: 'DARK', type: 'color',
  bg: '#060a0f', bg2: '#0b1118', bg3: '#111a24',
  primary: '#00ff88', secondary: '#00d4ff', orange: '#ff6b35',
  text: '#c8d8e8', muted: '#6b8296', border: 'color-mix(in srgb, var(--cyan) 15%, transparent)',
  desc: 'My custom theme',
}


const COLOR_LABELS = { bg: 'Background', bg2: 'Surface', bg3: 'Elevated', green: 'Primary', cyan: 'Secondary', orange: 'Warning', red: 'Danger', purple: 'Accent', text: 'Text', text2: 'Text Secondary', muted: 'Muted', link: 'Link', border: 'Border' }
const NEON_SWATCHES = ['#00ff88', '#00d4ff', '#ff4757', '#ff6b35', '#7c5cbf', '#54a0ff', '#c8d8e8', '#ffffff', '#0b1118', '#000000']


const PREVIEW_BG_PATTERNS = {
  grid:   'linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)',
  dots:   'radial-gradient(var(--border) 1.2px, transparent 1.6px)',
  matrix: 'linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px), radial-gradient(circle, var(--border) 1px, transparent 1.6px)',
}
const PREVIEW_BG_SIZES = {
  grid:   '34px 34px',
  dots:   '22px 22px',
  matrix: '34px 34px, 34px 34px, 22px 22px',
}


export {
  ANIMATIONS, LIGHT_THEME_IDS, THEME_DEFS, NEW_THEME_ADDED_AT, NEW_THEME_TTL_MS,
  NEW_THEME_IDS, isNewTheme, newThemeDaysLeft,
  STYLE_TEMPLATES, ANIM_CATEGORIES, ANIMATION_PATTERNS, GRID_PATTERNS,
  DEFAULT_CUSTOM, COLOR_LABELS, NEON_SWATCHES, PREVIEW_BG_PATTERNS, PREVIEW_BG_SIZES,
}
