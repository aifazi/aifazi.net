# Theming

The site ships with **20+ themes** organised as dark/light pairs. The theme engine is entirely CSS-variable-based — switching a theme sets `data-theme` on `<html>` and all components update instantly.

---

## Contents

- [How Themes Work](#how-themes-work)
- [Available Themes](#available-themes)
- [Theme Priority & Selection Logic](#theme-priority--selection-logic)
- [Toggling Dark / Light](#toggling-dark--light)
- [Admin Controls](#admin-controls)
- [Animation Presets](#animation-presets)
- [Adding a New Theme](#adding-a-new-theme)

---

## How Themes Work

1. The active theme ID (e.g. `ocean`) is stored in `ThemeContext` (see `app/providers.tsx`).
2. A `useEffect` syncs it to the DOM:
   ```ts
   if (theme === 'cyber-dark') document.documentElement.removeAttribute('data-theme')
   else                        document.documentElement.setAttribute('data-theme', theme)
   ```
3. The global CSS in `app/globals.css` defines a `:root` block (cyber-dark defaults) and `[data-theme="ocean"] { ... }` override blocks for each other theme.
4. All components use CSS custom properties (`--bg`, `--text`, `--accent`, `--border`, etc.) so they automatically adapt.
5. The user's choice is persisted to `localStorage` under `site-theme`. A separate `site-theme-user-set` flag records whether the user *explicitly* chose a theme (vs. inheriting a default).

---

## Available Themes

| Theme ID | Description |
|---|---|
| `cyber-dark` | Default — dark cyberpunk (deep blue/teal) |
| `cyber-light` | Light cyberpunk |
| `midnight` | Deep navy with Inter font |
| `midnight-light` | Light navy |
| `crimson` | Dark red/blood |
| `crimson-light` | Light crimson |
| `ocean` | Dark ocean blue with Exo 2 font |
| `ocean-light` | Light ocean |
| `amber` | Dark amber/warm gold |
| `amber-light` | Light amber |
| `rose` | Dark rose/pink |
| `rose-light` | Light rose |
| `forest` | Dark forest green |
| `forest-light` | Light forest |
| `glass-dark` | Glassmorphism dark |
| `glass-light` | Glassmorphism light |
| `brutalist` | Brutalist design with IBM Plex Mono font |
| `brutalist-dark` | Dark brutalist |
| `synthwave` | 80s synthwave with Orbitron font |
| `synthwave-light` | Light synthwave |
| `paper` | Paper/print with Merriweather font |
| `paper-dark` | Dark paper |
| `neumorph` | Neumorphism with Nunito font |
| `neumorph-dark` | Dark neumorphism |
| `terminal` | Terminal green |
| `terminal-light` | Light terminal |
| `macos` | macOS-inspired |
| `macos-dark` | Dark macOS |
| `neon-noir` | Neon noir |
| `neon-noir-light` | Light neon noir |
| `pastel` | Soft pastel colours |
| `pastel-dark` | Dark pastel |
| `win95` | Windows 95 with VT323 font |
| `win95-dark` | Dark Windows 95 |
| `aurora` | Aurora borealis |
| `aurora-light` | Light aurora |

The `cyber-dark` theme has no `data-theme` attribute on `<html>` (it is the CSS default). All other themes set `data-theme="<id>"`.

---

## Theme Priority & Selection Logic

On every page load, the following priority order is applied (highest wins):

1. **Admin-locked theme** — if `siteConfig.lockTheme === true`, all users see `siteConfig.globalTheme` regardless of their own preference.
2. **User's explicit choice** — if `site-theme-user-set` is set in `localStorage`, their saved `site-theme` is restored.
3. **Site global default** — if the admin has set a `globalTheme` but not locked it, first-time / incognito visitors get that theme.
4. **OS preference** — `prefers-color-scheme: dark` → `cyber-dark`, `prefers-color-scheme: light` → `cyber-light`.
5. **Hardcoded default** — `cyber-dark`.

---

## Toggling Dark / Light

`toggleTheme()` switches within the same theme family using the pairs table:

```
cyber-dark  ↔  cyber-light
ocean       ↔  ocean-light
synthwave   ↔  synthwave-light
... etc.
```

Components (e.g. `ThemePicker`) call `setTheme(id)` to switch to any specific theme, or `toggleTheme()` for a one-click dark/light toggle.

```tsx
import { useTheme } from '@/app/providers'

const { theme, setTheme, toggleTheme } = useTheme()
```

---

## Admin Controls

The **Theme Library** admin panel (`pages-src/admin/ThemeLibrary.jsx`) provides:

- **Global Site Theme** — set the default theme for all visitors.
- **Lock Theme** — prevent users from changing the theme.
- **Follow OS Theme** — auto-switch based on `prefers-color-scheme` for all visitors.
- **Animation Preset** — choose the global animation speed/style.

These settings are saved to the backend and distributed to all connected clients via Supabase Realtime.

---

## Animation Presets

Animation speed and easing are driven by CSS custom properties set via `data-animation` on `<html>`:

| Preset | Duration | Easing | Description |
|---|---|---|---|
| `smooth` | 350ms | cubic-bezier(0.16,1,0.3,1) | Default — smooth spring |
| `snappy` | 120ms | cubic-bezier(0.4,0,0.2,1) | Fast Material-style |
| `bouncy` | 450ms | cubic-bezier(0.34,1.56,0.64,1) | Slight overshoot |
| `expressive` | 500ms | cubic-bezier(0.22,1.5,0.36,1) | More expressive spring |
| `reduced` | 200ms | cubic-bezier(0.4,0,0.2,1) | For reduced-motion preference |
| `elastic` | 500ms | cubic-bezier(0.68,-0.55,0.27,1.55) | Strong elastic |
| `cinematic` | 1200ms | cubic-bezier(0.25,0.1,0.25,1) | Slow, dramatic |
| `none` | 0ms | linear | No animation |

Use `--t` and `--ease` CSS variables in component styles to automatically inherit the active preset:

```css
.my-card {
  transition: transform var(--t) var(--ease);
}
```

---

## Adding a New Theme

1. **Add the CSS variables** block to `app/globals.css`:
   ```css
   [data-theme="my-theme"] {
     --bg: #...;
     --bg2: #...;
     --text: #...;
     --accent: #...;
     /* ... */
   }
   ```
2. **Register the ID** in `app/providers.tsx`:
   - Add to `VALID_THEMES` array.
   - Add to `LIGHT_THEMES` if it is a light theme.
   - Add a pair entry to `THEME_PAIRS` (e.g. `'my-theme': 'my-theme-light'`).
3. **Optional font** — add an entry to the `fontMap` inside `loadFontForTheme()` in `providers.tsx` if the theme uses a non-default font.
4. **Framework styles** — if the theme needs custom styles for `notify`/`dialog`/`menu`, add a style variant in `core/framework-styles.js`.
