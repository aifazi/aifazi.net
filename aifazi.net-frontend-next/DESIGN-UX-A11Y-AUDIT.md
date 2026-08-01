# AIFAZI RP — Design / UX / Accessibility Audit

Research-only audit of the Next.js frontend (`aifazi.net-frontend-next`). Findings reference `file:line`. Severity: HIGH / MEDIUM / LOW.

---

## 1. Design Tokens & Theme Consistency

**Good**
- Central `:root` tokens in `app/globals.css` (dark `#060a0f` base, `--green #00ff88`, `--cyan #00d4ff`, `--muted` deliberately bumped to `#6b8296` for ≥4.5:1 contrast) with per-theme overrides for 40+ themes (incl. light, cyber-light, midnight, paper, win95, pastel, macos…).
- `core/tokens.js` centralizes scales: `VARIANTS` (success/error/warning/info/danger), `space` (4–64px), `fontSize` (10–48px), `radius`, `zIndex` (1 → 999999).
- `app/layout.tsx` `LIGHT_THEME_LIST` (19 entries) + FOUC script (locked > user > global default > OS pref) + `followOsTheme` via `prefers-color-scheme` listener (documented in `Changelog.jsx:532`).
- Per-theme overrides for buttons, forms, cards, section typography across macos/brutalist/terminal/neumorph/pastel/win95/paper/neon-noir/synthwave/aurora/midnight.

**Issues**
- **HIGH** — `core/tokens.js:48-89`: `VARIANTS.bg/border/glow` hardcode neon rgba values (`rgba(0,255,136,0.06)` etc.), not theme-aware. On light themes (bg `#c8d4e0`) these tints are invisible and the fixed dark panels in `dialog.jsx` (terminal `#0a0f0a`:84, command `#070b12`:88, glass `rgba(10,20,30,0.8)`:85) stay dark → broken theming + contrast on light themes.
- **MEDIUM** — Hardcoded neon rgba backgrounds (`rgba(0,255,136,0.06/0.1)`, `rgba(0,212,255,…)`) repeated across `DatabaseGUI.jsx`, `PDFEditor.jsx`, `ForumThread.jsx`, `Navbar.jsx`, `MaintenanceScreen.jsx` (fixed hex) bypass the token system and break on non-dark themes.
- **MEDIUM** — `color-mix(in srgb, …)` used heavily (`Store.jsx:323`, `globals.css:332`) — needs Baseline 2023+ browsers; no fallback.

## 2. Accessibility

**Good**
- Global `:focus-visible { outline: 2px solid var(--green); outline-offset: 3px }` with `:focus:not(:focus-visible){outline:none}` (`globals.css:1192-1198`). win95 uses dotted outline (`:2143`).
- Dialog: `role="dialog"` + `aria-modal="true"` + `aria-labelledby="dlg-title"`, backdrop `role="presentation"`, Escape/Enter handling, autofocus of input/confirm (`core/dialog.jsx:105-106,52-57`).
- Menu: `role="menu"`/`aria-label`, `role="menuitem"` with tabIndex, `aria-disabled`, Enter/Space activation (`core/menu.jsx:70,89,93`).
- Notifications: `aria-live="polite"` + `aria-label="Notifications"` (`core/notify.jsx:446`); DateTimePicker `role="button" tabIndex={0}` (`core/DateTimePicker.jsx:124`).
- Global `prefers-reduced-motion` kill-switch (`globals.css:318-326`); `Cursor.jsx` respects it.
- Good `<img alt>` coverage; decorative imgs use `alt=""`; Store FAQ uses native `<details>/<summary>`.

**Issues**
- **HIGH** — 49 `<div onClick>` without `role`/`tabIndex`/keyboard handling: `DatabaseGUI.jsx:296` (role select), `:685` (collection cards); `Store.jsx:576` (order cards), `:618-619` (modal backdrop); `HelpDesk.jsx:569` (ticket rows); `BlogPost.jsx:125/145` (video play/seek); `ForumAdmin.jsx` rows. None are keyboard-operable.
- **HIGH** — Dialog has **no focus trap** and **no focus restore** on close; `id="dlg-title"` is hardcoded (`core/dialog.jsx:106,133`) so multiple queued dialogs render duplicate IDs (`:212-214`) → invalid HTML + broken `aria-labelledby`.
- **MEDIUM** — Only 9 `aria-label` matches in the whole codebase. Most icon buttons (theme picker, close, trash, drag handles, chat actions) rely on `title`/nothing (`Navbar.jsx:75` is one of the few labelled).
- **MEDIUM** — All toasts use `aria-live="polite"` even for errors/warnings; banner + terminal containers omit `aria-label` (inconsistent with default container) (`core/notify.jsx:417,434,446`).
- **MEDIUM** — `outline:0 !important` on `.terminal-command-input` / `.command-palette-input` (`globals.css:568-592`) beats the global `:focus-visible` outline → **no keyboard focus indicator** on terminal/command inputs.
- **MEDIUM** — Command palette opens without `aria-modal`/focus trap; Tab can escape the overlay (`CommandPalette.jsx`).

## 3. Responsive / Mobile

**Good**
- `page-container` 16px padding + iOS input-zoom fix (16px inputs) at 768px (`globals.css`).
- Forum mobile rules: header column 480px, thread-title wrap 600px, `cat-nav-pills` horizontal scroll 600px, reply actions wrap 600px.
- `Store.jsx:24` uses `window.matchMedia`-based `useMobile()`; grids collapse to 1 column; admin `useIsMobile(768)` (in `admin/shared.jsx:64-72`) drives drawer sidebar (`Dashboard.jsx:461`).

**Issues**
- **MEDIUM** — Breakpoint drift: CSS uses 600/480/768/900px while JS hooks use 768px (`useIsMobile`) — mid-range behavior (e.g. 601–767px) can differ between global CSS and JS-driven layouts.
- **MEDIUM** — `forum-breadcrumb { font-size:9px !important }` at 480px (`globals.css`) — near-illegible and below comfortable tap-target size.
- **LOW** — Scattered per-file media queries (`Certifications.jsx:96-97`) rather than centralized breakpoints.

## 4. Typography & Readability

**Issues (this is the most pervasive problem)**
- **HIGH** — Pervasive tiny mono/UI type (7–11px) in content positions across the codebase:
  - 7px: `AnimationPicker.jsx` labels/badges (`:147,286,315,430`), `ServerRackAnimation.jsx:63` "EDIT MODE…"
  - 8px: `IconPicker.jsx`, `ForumThread.jsx:32-33` (role/posts), `EditContext.jsx`
  - 9px: `CommandPalette.jsx` (kbd/hints/footer), `forum-breadcrumb` CSS, `MaintenanceScreen.jsx` progress, `ChatWidget.jsx:142`, `Contact.jsx:85`, `Store.jsx:333/336` (POPULAR/ACTIVE badges), `dialog.jsx:116`
  - 10px: `Navbar.jsx` SIGN IN, `Blog.jsx:213-222` meta, `forum-thread-stats`, `shared.jsx` "PANEL CRASHED", `DatabaseGUI.jsx` empty states
- Below WCAG comfortable reading size, especially on mobile/HD-DPI. The 9px `!important` breadcrumb and 7–8px badges are the worst.
- **MEDIUM** — `--font-display` (VT323, Share Tech Mono, Bebas Neue) used for *body/paragraph* text in cards (`Blog.jsx:225`, `ForumThread.jsx:31`) — decorative faces at small sizes reduce legibility.
- **Good** — Body base 17px (`globals.css`), blog excerpts 15px/1.6, paragraph line-heights generally 1.5–1.7.

## 5. UX Patterns / Heavy Animation

**Good**
- `ServerRackAnimation.jsx:37-48`: IntersectionObserver pauses the 350ms tick when off-screen (`visibleRef`) — solid perf practice.
- `LoadingScreen.jsx` loaders are short-lived (~0.9–1.2s) with exit transitions; boot lines stagger at 80ms.
- Global reduced-motion CSS kill-switch; heavy hero animation lazy-loaded.

**Issues**
- **MEDIUM** — Boot/loading screen delays first content ~1s+ on every visit; `MatrixLoader` runs a full-screen canvas rAF char-rain (`LoadingScreen.jsx:112-144`).
- **MEDIUM** — JS-driven loops are **not** gated on `prefers-reduced-motion` (CSS kill-switch only): `MatrixLoader` rAF, `ServerRackAnimation` `setInterval`, `RoamingRobot` — wasted work for reduced-motion users.
- **MEDIUM** — 49 hover-only interactions (`onMouseEnter/Leave` inline, e.g. `Blog.jsx:202`, `Store.jsx:329`, `dialog.jsx:151`) mean card affordance is mouse-dependent; keyboard users get the global outline but not the hover affordance.
- **LOW** — Inline `<style>` keyframe blocks duplicated in ~10 components (`ChatWidget.jsx:234`, `LoadingScreen.jsx`, `CommandPalette.jsx:231`, `AboutTerminal`) instead of centralized in `globals.css`.

## 6. Layout Consistency

**Good**
- Single root layout + `Providers`; Navbar/Footer/Cursor/FloatingNav/FunDragLayer shared across all routes; admin via `app/admin/[[...slug]]`.
- Consistent metadata templates (`%s | AIFAZI RP`, forums, etc.); `app/fivem/layout.tsx` is a bare shell reusing root chrome.

**Issues**
- **MEDIUM** — Dual implementations for overlapping surfaces: `/store` vs `/fivem/store`, `/whitelist` vs `/fivem/whitelist` — separate `pages-src` likely diverge in features/design over time.
- **MEDIUM** — Deeply nested inline styles + per-component `<style>` blocks produce visual drift across themes (fixed dark panels in `dialog.jsx`/`DatabaseGUI`/`PDFEditor` won't adapt to light themes).
- **LOW** — Import convention drift: relative paths (`../pages-src/admin/shared`) vs `@/` alias.

## 7. Empty / Error / Loading States

**Good (coverage is strong)**
- Skeletons: `BlogCardSkeleton` (Blog), `ThreadRowSkeleton` (WhitelistApply, ApplicationForms), Store card skeletons, `MailQueue SkeletonRow`, admin table skeletons.
- Empty states: Blog "No posts found." + Clear Search; Store (no plans / no products / empty cart / no orders); Dashboard (no posts/messages with Clear-filter / Create buttons); DBMonitor/DatabaseGUI/AdminPanels/ForumAdmin/FiveMPanel/MailQueue all have "No X" messages; CommandPalette "no commands".
- Errors: Blog "SERVER UNAVAILABLE" + RETRY; Contact inline error; `notify.error` across API failures; `PanelErrorBoundary`; `ErrorBoundary.jsx`; `helpdesk/error.tsx` + `global-error.tsx`; auth-callback error messages.

**Issues**
- **MEDIUM** — Route-level `loading.tsx` only for `forms` and `whitelist`; other heavy routes rely on client skeletons. `ForumThread.jsx:258` uses a generic `.loader` instead of a skeleton.
- **MEDIUM** — `ForumThread.jsx:147` silently `navigate('/forum')` on fetch failure — no error/retry UI, unlike Blog's explicit error+RETRY. Inconsistent error UX.
- **MEDIUM** — DBMonitor/DatabaseGUI empty-state text uses `color: var(--border)` (e.g. `DBMonitor.jsx:52`, `DatabaseGUI.jsx:1206`) — border color as text = near-invisible contrast.
- **LOW** — `ErrorBoundary.jsx:55` renders the raw error `<pre>` in production UI (leak + tiny 11px).

---

## Priority summary

| Priority | Area | Main evidence |
|---|---|---|
| HIGH | Non-keyboard-interactive `<div onClick>` (49) | §2 |
| HIGH | Dialog focus trap / focus restore / duplicate `id="dlg-title"` | §2 |
| HIGH | 7–11px type used for content labels | §4 |
| HIGH | `VARIANTS` + fixed dark panels not theme-aware (light themes) | §1 |
| MEDIUM | No focus ring on terminal/command inputs (`outline:0 !important`) | §2 |
| MEDIUM | Sparse aria-labels; polite live region for errors | §2 |
| MEDIUM | JS animations ignore `prefers-reduced-motion` | §5 |
| MEDIUM | Breakpoint drift (600/768); 9px breadcrumb | §3 |
| MEDIUM | ForumThread silent redirect vs Blog retry; `var(--border)` empty-state text | §7 |
| LOW | Inline duplicate keyframes; scattered media queries; import drift | §5, §6 |
