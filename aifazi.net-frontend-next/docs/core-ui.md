# Core UI Framework

The `core/` directory contains a home-built, theme-aware design system. It provides pluggable **notifications**, **dialogs**, and **context menus** — each supporting multiple visual styles that the admin can switch from the Framework Library panel.

---

## Contents

- [Overview](#overview)
- [Setup](#setup)
- [Notifications (notify)](#notifications-notify)
- [Dialogs (dialog)](#dialogs-dialog)
- [Context Menu & Dropdown (menu)](#context-menu--dropdown-menu)
- [Design Tokens](#design-tokens)
- [Animation Utilities](#animation-utilities)
- [Font Utilities](#font-utilities)
- [Framework Styles](#framework-styles)

---

## Overview

All primitives are available from the single barrel export:

```js
import { notify, dialog, contextMenu, useUI } from '@/core/ui'
```

Or individually:

```js
import { notify }      from '@/core/notify'
import { dialog }      from '@/core/dialog'
import { contextMenu } from '@/core/menu'
```

The active visual style for each primitive is set by the admin in **Site Settings → Framework Library** and flows through `ThemeContext.siteConfig` → `Providers` → the individual provider components.

---

## Setup

`app/providers.tsx` sets up the provider tree automatically. No manual setup is needed in components.

If you need to use the framework outside of the main app (e.g. in a test harness or Storybook):

```jsx
import { UIProvider } from '@/core/ui'

<UIProvider frameworkConfig={{ menuStyle: 'cyber', notifyStyle: 'cyber', dialogStyle: 'cyber' }}>
  {children}
</UIProvider>
```

---

## Notifications (notify)

### Imperative (use anywhere — no hook required)

```js
import { notify } from '@/core/notify'

notify.success('Post saved!')
notify.error('Failed to upload image.')
notify.warning('Session expiring soon.')
notify.info('New message received.')
notify('Custom message', { type: 'info', duration: 5000 })
```

### Hook (inside React components)

```jsx
import { useNotify } from '@/core/notify'

const notify = useNotify()
notify.success('Done!')
```

### Or via `useUI`

```jsx
import { useUI } from '@/core/ui'

const { notify } = useUI()
notify.error('Something went wrong.')
```

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `type` | `'success' \| 'error' \| 'warning' \| 'info'` | `'info'` | Toast type |
| `duration` | `number` (ms) | `4000` | Auto-dismiss after this many ms. `0` = persistent |
| `action` | `{ label: string; onClick: () => void }` | — | Optional action button on the toast |

### Available Styles

Controlled by `siteConfig.notifyStyle`: `cyber`, `glass`, `brutalist`, `minimal`, `pill`, `card`, `retro`, `neon`, and more. Set in the admin Framework Library panel.

---

## Dialogs (dialog)

### Imperative (use anywhere — no hook required)

```js
import { dialog } from '@/core/dialog'

// Confirm dialog — returns true/false
const confirmed = await dialog.confirm({
  title: 'Delete post?',
  message: 'This action cannot be undone.',
  confirmText: 'Delete',
  cancelText: 'Cancel',
})
if (confirmed) { /* proceed */ }

// Alert dialog (no cancel button)
await dialog.alert({ title: 'Error', message: 'Upload failed.' })

// Prompt dialog — returns string or null
const value = await dialog.prompt({ title: 'Enter a name', placeholder: 'Name…' })
```

### Hook

```jsx
import { useDialog } from '@/core/dialog'

const dialog = useDialog()
const ok = await dialog.confirm({ title: 'Are you sure?' })
```

### Available Styles

Controlled by `siteConfig.dialogStyle`: `cyber`, `glass`, `brutalist`, `minimal`, `sheet`, `card`, `retro`, `neon`, and more.

---

## Context Menu & Dropdown (menu)

### Context Menu (right-click)

```jsx
import { useMenu } from '@/core/menu'

const { openContextMenu } = useMenu()

<div onContextMenu={e => openContextMenu(e, [
  { label: 'Edit',   icon: '✏️', onClick: handleEdit },
  { label: 'Delete', icon: '🗑️', onClick: handleDelete, danger: true },
  { separator: true },
  { label: 'Copy link', icon: '🔗', onClick: handleCopy },
])}>
  Right-click me
</div>
```

### Dropdown

```jsx
import { Dropdown } from '@/core/menu'

<Dropdown
  trigger={<button>Options ▾</button>}
  items={[
    { label: 'Profile', onClick: () => {} },
    { label: 'Logout',  onClick: handleLogout, danger: true },
  ]}
/>
```

### `MenuPanel` (custom panel)

```jsx
import { MenuPanel } from '@/core/menu'

<MenuPanel items={items} onClose={() => {}} />
```

### Available Styles

Controlled by `siteConfig.menuStyle`: `cyber`, `glass`, `brutalist`, `minimal`, `card`, `retro`, `neon`, and more.

---

## Design Tokens

`core/tokens.js` exports design token constants (colours, spacing, border radii, etc.) shared across components and the CSS variable system.

```js
import { colors, spacing, radius } from '@/core/tokens'
```

---

## Animation Utilities

`core/animations.js` exports animation helpers used by components and the Providers layer.

Animation speed and easing are also available as CSS variables set by the active animation preset (see [Theming → Animation Presets](./theming.md#animation-presets)):

```css
.card {
  transition: box-shadow var(--t) var(--ease);
}
```

---

## Font Utilities

`core/fonts.js` exports font-loading helpers and font stacks. The global `loadFontForTheme()` function in `providers.tsx` uses this to lazy-load theme-specific Google Fonts.

---

## Framework Styles

`core/framework-styles.js` exports per-style CSS-in-JS objects for notify, dialog, and menu. When the admin picks a style in the Framework Library, these objects are applied to the corresponding provider.
