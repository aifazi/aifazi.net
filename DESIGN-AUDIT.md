# aifazi.net — Product Design Audit

**Scope:** web frontend visual system, UX flows, consistency (code-grounded; no live screenshots this pass)  
**Related:** `DESIGN-UX-A11Y-AUDIT.md` (a11y/UX detail) · session type/focus/keyboard fixes

## 1. Brand & visual direction

**What works**
- Strong, coherent identity: cyber/terminal neon on deep ink (`#060a0f`, `--green #00ff88`, `--cyan #00d4ff`).
- Memorable “hacker / ops console” personality (terminal dialogs, mono labels, glow accents) fits FiveM + network-tools + store.
- 40+ themes (terminal, win95, paper, macos, synthwave…) is a differentiator and shows real craft.

**Gaps**
- Brand is **theme-dependent**. Default neon is sharp; several light themes (paper, macos, light) leak hardcoded neon rgba and dark dialog panels → looks unfinished on non-default skins.
- No single “hero brand moment” that is stable across themes (logo/mark is solid; marketing homepage is animation-heavy and less brand-distinct than Login).

**Recommendation:** Treat default **terminal-neon** as the brand lock. Other themes are skins of that system, not alternate brands. Fix light-theme leakage first.

## 2. Design system maturity

| Layer | Status | Notes |
|-------|--------|-------|
| Color tokens | Good | `:root` + `theme-library.css` + `componentTokens.js` |
| Type scale | Mixed | Body ~17px good; chrome labels historically 7–11px (worst raised to 11px) |
| Spacing / radius | Present | `core/tokens.js` scales |
| Components | Split brain | `core/ui.jsx`, `forms.jsx`, `dialog.jsx` **vs** page-local inline styles |
| Elevation / surface | Weak on light | `VARIANTS` + fixed dark panels don’t adapt |
| Motion | Strong but heavy | CSS kill-switch exists; JS loops partially gated |

**HIGH:** `core/tokens.js` `VARIANTS.bg/border/glow` hardcode neon tints — invisible or wrong on light themes.  
**HIGH:** `dialog.jsx` terminal/command/glass panels stay dark hex on light themes.  
**MEDIUM:** Pages reimplement buttons/cards with inline `rgba(0,255,136,…)` instead of tokens.

**Recommendation:** Map every semantic token (`--surface-2`, `--accent-soft`, `--danger-bg`) from the active theme; ban raw neon rgba in new code; make dialog surfaces `var(--bg2)` + `var(--border)`.

## 3. Typography & readability

- Display fonts (VT323, Bebas, Press Start…) are **personality** — correct for titles/labels, wrong for long body.
- Mono chrome labels at 8–10px were a systemic readability issue; ThemeLibrary floored to 11px — other pages still need the same floor.
- Blog body (15–17px / 1.6) is the quality bar.

**Recommendation:** Type roles: Display (theme font) · UI mono ≥11px · Body ≥15px. Never put paragraphs in VT323/Press Start.

## 4. Layout & information architecture

**Strengths**
- Clear top-level IA: Home · Blog · Forum · Store · Tools · Status · Profile · Admin.
- Admin is a real console (dense is appropriate).
- Command palette (⌘K) matches the brand.

**Issues**
- **Dual surfaces:** `/store` vs `/fivem/store`, `/whitelist` vs `/fivem/whitelist` — two UIs for the same job.
- **Density cliff:** marketing Home vs Admin/DatabaseGUI; few intermediate “app” layouts.
- Nested page-header patterns differ across Forum / Blog / Store.

**Recommendation:** One canonical Store and Whitelist (alias the other host). Shared `PageHeader` / `SectionTitle` / `EmptyState`.

## 5. UX flows (critical paths)

| Flow | Grade | Notes |
|------|-------|-------|
| Sign-in (password + OAuth + 2FA) | B+ | Polished; 2FA step clear |
| Browse blog / post | B+ | Good hierarchy; error + retry exists |
| Forum read/post | B | Solid; fetch-fail soft-redirects (inconsistent errors) |
| Store browse → cart | B | Cards work; promos keyboardable |
| Whitelist apply | B | Long form; progress could be stronger |
| Admin / DB console | C+ | Powerful; icon-only actions lack labels |
| Status page | B | Clear; good for trust |

**Error & empty states:** Blog is the model. Standardize: error card + retry + reference id.  
**Loading:** Prefer skeletons on content routes; theatrical boot for first session only.

## 6. Accessibility status

| Item | Status |
|------|--------|
| Dialog focus trap / unique ids | OK |
| Command palette `aria-modal` + trap | Fixed |
| Focus rings on terminal/palette inputs | Fixed |
| Clickable divs keyboard (Store/HelpDesk/DB/ForumAdmin) | Partial |
| Tiny type | Partial (ThemeLibrary + key chrome) |
| Remaining click-divs / icon-only buttons | Open |
| `VARIANTS` / dark dialogs on light themes | Open |

## 7. Theming system — product risk

40+ themes multiplies QA cost. Every hardcoded hex is a bug on N−1 themes.

**Recommendation:**
1. Certify 3 themes: `terminal` (brand), `light`, `paper`. QA gate = these three.
2. Other themes = community/custom (best-effort).
3. `componentTokens.js` must cover dialogs, toasts, inputs, badges, empty states.

## 8. Priority plan

| Pri | Work | Impact |
|----:|------|--------|
| 1 | Theme-aware `VARIANTS` + dialog surfaces | Trust + polish |
| 2 | Unify Store + Whitelist | IA clarity |
| 3 | Shared page chrome + ban raw neon rgba | Consistency |
| 4 | Type role floor across remaining pages | Readability |
| 5 | Certify 3 themes; freeze new themes | QA cost |
| 6 | Soften first-visit boot; skeletons elsewhere | Perceived speed |
| 7 | Remaining keyboard + `aria-label` sweep | A11y |

## 9. What is already excellent

- Identity is specific and memorable — not generic SaaS.
- Theme engine + Theme Library is ambitious and mostly well-built.
- Login and Blog show the quality bar.
- Core kit (`dialog`, `notify`, `menu`, `useFocusTrap`, `Clickable`) is the right foundation.

**Bottom line:** Visually bold and feature-rich; design debt is **system consistency** (light themes, dual surfaces), not lack of taste.
