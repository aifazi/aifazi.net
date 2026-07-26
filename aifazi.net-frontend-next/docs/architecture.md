# Architecture

This document covers the overall design of the frontend codebase — directory layout, key patterns, and how data flows through the app.

---

## Contents

- [High-Level Overview](#high-level-overview)
- [Directory Structure](#directory-structure)
- [Routing Pattern: Thin App Router + Fat pages-src](#routing-pattern)
- [Global State (providers.tsx)](#global-state)
- [Request / Data Flow](#request--data-flow)
- [Edge Middleware](#edge-middleware)
- [Live Updates (Supabase Realtime)](#live-updates)

---

## High-Level Overview

```
Browser
  └─► Next.js App Router (app/)
        ├─ Edge Middleware (middleware.ts)  ← CDN proxy, auth guard, token injection
        ├─ Root Layout (app/layout.tsx)
        │    └─ <Providers> (app/providers.tsx)
        │         ├─ ThemeContext       — theme, site config
        │         ├─ ForumContext       — forum user auth
        │         ├─ EditContext        — inline editing
        │         ├─ NotifyProvider     — toast notifications
        │         ├─ DialogProvider     — modal dialogs
        │         └─ MenuProvider       — context menus
        └─ Page components (app/*/page.tsx)
             └─ Actual implementation in pages-src/
                  └─ Components (components/)
                       └─ API calls via lib/api.ts
                            └─► Next.js rewrite → FastAPI backend (api.aifazi.net)
```

---

## Directory Structure

| Path | Purpose |
|---|---|
| `app/` | Next.js App Router — one `page.tsx` per route. These are intentionally thin: they only export metadata and render the matching `pages-src/` component. |
| `pages-src/` | All real page implementations. Kept separate from `app/` so route files stay small and logic is easy to find and test. |
| `components/` | Reusable UI components. No business logic — only presentation and local interaction. |
| `core/` | Internal design-system primitives (notify, dialog, menu, tokens, animations). |
| `lib/` | Service clients (Axios, Supabase) and utilities (router compat, web push, site settings). |
| `context/` | React context providers for cross-cutting concerns (forum auth, edit mode). |
| `hooks/` | Custom React hooks (`useReveal` for scroll animations). |
| `middleware.ts` | Next.js Edge Middleware — runs before every request. |

---

## Routing Pattern

### Thin App Router + Fat `pages-src/`

Every route in `app/` follows the same pattern:

```tsx
// app/blog/page.tsx
export const metadata = { title: 'Blog | aifazi.net' }
export default function Page() {
  return <BlogClient />   // ← imported from pages-src/Blog.jsx
}
```

**Why?**  
- Keeps route files clean and focused on Next.js-specific concerns (metadata, dynamic flags).  
- All rendering logic lives in `pages-src/` — easy to read, move, or test.  
- Simplifies future migrations if the router changes again.

### Catch-All Admin Route

`app/admin/[[...slug]]/page.tsx` uses an optional catch-all segment so the full `/admin/*` tree is handled by a single route file, while the admin panel itself manages its own internal navigation.

---

## Global State

`app/providers.tsx` wraps the entire application and manages:

### ThemeContext
- Stores the active theme ID (e.g. `cyber-dark`, `ocean`, `synthwave`).
- Writes/reads from `localStorage` (`site-theme`, `site-theme-user-set`).
- Respects admin-locked themes via `siteConfig.lockTheme`.
- Falls back to OS `prefers-color-scheme` for first-time visitors.
- Exposes `setTheme(id)` and `toggleTheme()` (dark ↔ light within the same family).

### Site Config
- Fetched from `GET /api/admin/site-settings` via `lib/siteSettings.ts`.
- Cached in `localStorage` as `site-config-cache` for instant display on reload.
- Live-refreshed via:
  - Supabase Realtime (`site_config` table changes).
  - `window` event `site-settings-updated` (admin saves from the same tab).
  - Fallback polling every 30 seconds.
  - `visibilitychange` (user returns to the tab).

### Auth State
- `isAdmin` is derived by decoding the JWT from `sessionStorage` on mount.
- Re-evaluated on `auth-change` and `storage` window events.

### Context Stack (innermost → outermost)
```
ThemeContext
  NotifyProvider
    DialogProvider
      MenuProvider
        EditProvider
          ForumProvider
            {children}
```

---

## Request / Data Flow

All API calls use `lib/api.ts` (Axios), targeting relative `/api/*` paths.

```
Component
  │
  ├─ api.get('/blog/posts')
  │
  ▼
Next.js rewrite (next.config.js)
  /api/:path*  →  https://api.aifazi.net/api/:path*
  │
  ▼
Edge Middleware (middleware.ts)
  adds X-Internal-Token header
  │
  ▼
FastAPI backend (api.aifazi.net)
  validates X-Internal-Token
  returns JSON
  │
  ▼
Axios response interceptor (lib/api.ts)
  on 401: silently refreshes JWT via POST /api/auth/refresh (HttpOnly cookie)
  │
  ▼
Component receives data
```

### Token Priority

The Axios request interceptor selects the first available token from `sessionStorage`:

1. `admin_token` — full admin access
2. `staff_token` — moderator / editor access
3. `auth_token` — regular user
4. `forum_token` — forum-only user

---

## Edge Middleware

`middleware.ts` runs on every request (except static files) at the Vercel Edge.

### 1. CDN Proxy
Requests to `cdn.aifazi.net` are reverse-proxied to the configured Cloudinary cloud, with aggressive caching headers (`public, max-age=31536000, immutable`). The cloud name is fetched from the backend and cached in module scope for 5 minutes.

### 2. Admin Route Protection
`/admin*` requires an `admin_session` cookie. Without it the visitor is redirected to `/login?tab=signin&next=/admin`. This is a UX guard — the real security is the JWT check on every backend API call.

### 3. Internal Token Injection
Every `/api/*` request gets an `X-Internal-Token` header set to `INTERNAL_API_SECRET`. This lets the FastAPI backend reject requests that bypass the Next.js proxy entirely (e.g. direct `curl`).

---

## Live Updates

Supabase Realtime is used for push-based updates without polling:

| Table | What updates |
|---|---|
| `site_config` | Theme, maintenance mode, banners — all browsers refresh instantly when admin saves |
| `contacts` | Admin contact list — fires `contacts-updated` window event |
| `staff_activity` | Admin dashboard — fires `staff-activity-updated` window event |
| `chat_messages` | Chat pages |
| `chat_rooms` | Chat pages |
| `posts` | Blog page auto-refreshes when a post is published |
| `banners` | Site-wide announcement banner |

### Supabase Setup (run once)

```sql
-- Enable Realtime on required tables
ALTER TABLE site_config    REPLICA IDENTITY FULL;
ALTER TABLE chat_messages  REPLICA IDENTITY FULL;
ALTER TABLE chat_rooms     REPLICA IDENTITY FULL;
ALTER TABLE posts          REPLICA IDENTITY FULL;
ALTER TABLE banners        REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE site_config;
ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE chat_rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE posts;
ALTER PUBLICATION supabase_realtime ADD TABLE banners;
```

> Without `REPLICA IDENTITY FULL`, UPDATE and DELETE events will not fire.
