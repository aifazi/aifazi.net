# aifazi.net Mobile — Full App Coverage + Redesign & Revamp Plan

Status of `apps/mobile` (Expo SDK 57, expo-router, React Native 0.86) vs the web app at the time of writing.
Goal: reach **full feature parity** with the web app and pay down the structural debt so the app is maintainable, themeable, and shippable.

---

## Current Strengths (keep)

- **Auth/API layer** — in-memory access token + SecureStore refresh token + single-flight 401 refresh + `auth-cleared` event. `src/lib/api.ts`, `src/lib/auth.tsx`.
- **Theme system** — 5-level priority chain, admin-lock, OS-sync, persisted choice; `src/theme.tsx` + `src/themes.ts`.
- **Overlay UI kit** — promise-based `alert`/`confirm`/`menu`/`loading`/`toast`; `src/components/overlay.tsx`.
- **Chat platform** — rooms, DMs, DM requests, 1:1 & room voice/video (LiveKit), E2EE via AES-GCM, reactions/replies/edit/delete, staff admin (bans/mutes/members/DMs/recent).
- **Self-update** — checksum-verified APK download/install (`src/lib/updates.ts`).
- **OAuth** — Discord/GitHub/Steam with native deep-link callback.

## Known Gaps vs Web (feature parity work)

| # | Area | Web has | Mobile currently | Work needed |
|---|------|---------|------------------|-------------|
| 1 | Help Desk | Create ticket, reply to ticket, staff console | Read-only ticket list in profile | Full ticket lifecycle (create + replies), staff console |
| 2 | Store | Checkout, orders, order tracking, subscriptions, delivery-agent portal | Browse, cart (no checkout), product detail/reviews | Checkout → orders → tracking; subscription upsell; staff/agent view |
| 3 | Forum | Search, pagination, sort (hot/new/top), categories browse | Hot-only, limit 20, no search/pagination | Search + sort + pagination + category browse ("hot" is default, sorted rows duplicated) |
| 4 | Status | Incidents rendering | `status.tsx` fetches incidents but never renders them | Render incident list/detail |
| 5 | Notifications | Web Push (VAPID) + in-app bell | None; no `expo-notifications`, no badge | Push tokens + in-app notification center + tab badges |
| 6 | Chat | WebSocket realtime + typing presence | 4s polling in chat-room/dm-thread/call | Move to realtime (Supabase Realtime or WS) |
| 7 | Tools | Network / file / SEO / DB GUI | None | Decide scope: port web tools or ship simplified native versions (file tools most mobile-native fit) |
| 8 | Deep links | Shareable content URLs | Only OAuth callback | Content deep links (store-item, blog-post, thread, dm) |

## Structural / Technical Debt (redesign & revamp work)

| Area | Problem | Fix |
|------|---------|-----|
| **Blob files** | `profile.tsx` (1,091 lines) holds login + 2FA + theme picker + updater + 7 tab bodies; `channel-edit.tsx` (614) does 4 jobs; chat sheets duplicated between `chat-room.tsx` (816) and `dm-thread.tsx` (551) | Split into `src/screens/*` modules; extract shared chat message list + composer into one component; sub-views per concern |
| **Styling** | Only 5 files use `StyleSheet.create`; ~400 inline `style={{}}`; repeated idioms (`borderRadius: theme.mono ? 0 : X`, `fontFamily: mono`, `#001018`, `#22d3ee`…) | Move to shared primitives + semantic theme tokens; convert hot files to StyleSheet |
| **Icons** | Emoji/unicode used as icons (`🏠💬📝🗨️👤📷🔍←` etc.); `expo-symbols` installed but unused; can't be tinted/themed | Adopt an icon system (`expo-symbols` or `@expo/vector-icons`); build tinted `TabIcon`, `ActionIcon`, `BackButton` |
| **Theme tokens** | Semantic colors hardcoded in screens: link `#22d3ee`, sale `#ff6b35`, status amber `#ffb020`, danger-pink `#ff4757`, accent2 text `#001018` ×8 | Extend `themes.ts` palette with `link`, `sale`, `success`, `warning`, `info`, `onAccent`; replace hardcoded hex |
| **Duplicated code** | Category-filter pill groups copy-pasted in blog/forum/store; Chip private in profile; login+2FA duplicated (auth/login.tsx vs profile.tsx) | Shared `CategoryPills`/`Chip` component; single `LoginCard` incl. 2FA |
| **API config** | `https://api.aifazi.net` hardcoded in `api.ts` + `updates.ts`; zero `EXPO_PUBLIC_*` env usage; fragile `url.includes('/auth/login')` matching | `EXPO_PUBLIC_API_URL` / `EXPO_PUBLIC_RELEASE_URL`; extract auth-endpoint constants |
| **Types** | Pervasive `any` (theme `any`, `c: any`, `FormData` files, catch blocks) undermines `strict: true` | Type the theme hook return; API response types; shared error helper `apiErrorMessage(e)` |
| **State/**load boilerplate | Every data screen re-implements `load`/`onRefresh`/`useFocusEffect`/`RefreshControl` | Shared `useAsyncData` hook + `<Screen>` refresh wiring |
| **Missing primitives** | No ListItem, Badge, EmptyState, Skeleton, FormError | Add to `src/components/ui.tsx` |
| **Bugs** | `channel-edit.tsx` Invite header button is `onPress={() => {}}`; `status.tsx` drops incidents; home swallows all errors with empty catches | Fix individually |
| **Config** | `app.json` package `com.anonymous.aifazimobile`; `expo-updates` configured but never imported | Real package id; wire or remove updates config |
| **Tooling** | No lint, no typecheck script, no CI, no tests | `eslint` + `tsc --noEmit` scripts, GitHub Actions typecheck/lint, add Vitest for lib (api, encryption, color, updates) |
| **Realtime UX** | Push absent; unread not surfaced on Chat tab | Badge counts + push |

---

## Phased Roadmap

Recommended order — foundation first, then features, so new work is built on clean primitives.

### Phase 0 — Foundation & hygiene (small, high-leverage)
1. Env vars: `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_RELEASE_URL` in `src/lib/api.ts` + `src/lib/updates.ts`, `.env.example`, document in `.claude/`/README.
2. Install & wire `@expo/vector-icons` (Ionicons/Material) → tinted `TabIcon`, `ActionIcon`, `BackButton`; replace emoji in `(tabs)/_layout.tsx`, top bars, action buttons. (_expo-symbols is iOS-only SF Symbols_; cross-platform vector icons preferred.)
3. Extend `themes.ts` semantic palette (`link`, `sale`, `success`, `warning`, `info`, `onAccent`, `overlay`) + `useTheme()` typed return (eliminates `theme: any`).
4. Replace hardcoded hex in screens with theme tokens.
5. Shared primitives in `ui.tsx`: `ListItem`, `Badge`, `EmptyState`, `Skeleton`, `FormError`, `Chip`/`CategoryPills`.
6. Tooling: `eslint` config + `typecheck` script + GitHub Actions (lint/tsc). Fix `app.json` package id.
7. Fix quick bugs: `channel-edit` invite no-op, `status.tsx` incident rendering, home-screen error surfacing.

### Phase 1 — Refactor & consolidation
1. Split `profile.tsx` (1,091) into `src/screens/profile/{Overview,Security,Edit,App,Orders,Tickets,Activity,Documents}.tsx`.
2. Extract shared chat primitives from `chat-room.tsx`/`dm-thread.tsx` into `src/components/chat/{MessageList,Composer,Bubble,Reactions}.tsx`.
3. Refactor `channel-edit.tsx` into sub-views (RoomForm, Roles, Members, Permissions).
4. Convert hot inline-style files to `StyleSheet.create` + tokens; introduce `Border`/`Font` helpers for the `mono` idiom.
5. Shared `useAsyncData` hook + `<Screen>` refresh wiring; kill per-screen boilerplate.
6. Extract `LoginCard` (login + 2FA) shared by `auth/login.tsx` and `profile.tsx`.

### Phase 2 — Feature parity (close web gaps)
1. **Help Desk**: create ticket, reply to ticket, staff console (`/helpdesk/admin`).
2. **Store**: checkout (place order), orders list + tracking, subscription plans, staff/delivery-agent portal.
3. **Forum**: search, sort (new/top), pagination, category browse.
4. **Status**: incident list rendering.
5. **Notifications**: `expo-notifications`, device push-token to backend, in-app notification center, Chat-tab unread badges.

### Phase 3 — Realtime & distribution polish
1. Chat from polling → realtime (Supabase Realtime or WS), typing/presence.
2. Content deep links (`store-item`, `blog-post`, `forum-thread`, `dm-thread`) for share.
3. Push for new messages/mentions; group + badge in app.
4. Expand mobile theme set closer to web parity; polish floating tab bar w/ real icons + badge dot.
5. Store release: real package id, EAS builds, beta channel; wire `expo-updates`.

---

## Suggested first execution
**Phase 0 items 1–5 + 7** (env vars, icons, theme tokens, primitives, bug fixes) deliver the biggest visible quality jump with low risk; then **Phase 1** refactors, then **Phase 2** feature parity.