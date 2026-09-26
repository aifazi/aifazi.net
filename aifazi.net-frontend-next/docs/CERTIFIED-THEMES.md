# Certified Themes — QA Gate

**Rule:** PRs that touch shared UI must look correct in these **three** themes only. Other themes are best-effort/community.

| Theme id | Role | Why |
|----------|------|-----|
| `terminal` | Brand default | Neon identity (dark ink + green/cyan) |
| `light` | Light baseline | Catches dark-only assumptions |
| `paper` | Soft light / editorial | Catches font + border contrast issues |

## How to QA (5 minutes)

1. Run the app and switch theme via ThemePicker (or `localStorage.site-theme`).
2. Open: **Home**, **Login**, **Blog post**, **Store**, **Admin dashboard**, **one dialog** (confirm).
3. Check in each theme:
   - Body / muted text readable (≥4.5:1 where possible)
   - Dialogs, toasts, inputs use theme surfaces (not fixed black panels)
   - Focus ring visible on keyboard (`:focus-visible`)
   - No neon tints invisible on light backgrounds
4. If a change breaks only non-certified themes, still merge if the three pass.

## Component contracts (must stay theme-aware)

- `core/tokens.js` `t` / `VARIANTS` — `var(--*)` + `color-mix`, never fixed neon rgba
- `core/dialog.jsx` — `--comp-dialog-bg` / `var(--bg2)`
- Buttons / inputs — `--comp-btn-*` / `--comp-input-*` (`core/componentTokens.js`)

## Freeze

Do **not** add new themes until `componentTokens.js` covers dialogs, toasts, inputs, badges, empty states for the certified three.
