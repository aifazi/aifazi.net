# aifazi.net — Frontend (Next.js)

Personal portfolio, blog, forum, live chat, admin panel and developer tools for **aifazi.net** — built with Next.js 14 App Router.

---

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [Available Scripts](#available-scripts)
- [Project Structure](#project-structure)
- [Documentation](#documentation)

---

## Overview

This repository is the **entire frontend** of aifazi.net. Key features:

| Feature | Description |
|---|---|
| **Portfolio** | Hero, About, Skills, Experience, Projects, Certifications, Services, Contact sections |
| **Blog** | Post listing and full post view, live-synced via Supabase Realtime |
| **Forum** | Categories, threads, user profiles, auth (register / login / password reset / email verify) |
| **Admin Panel** | Dashboard, post editor, site settings, theme/framework library, CDN settings, mail settings, help-desk, changelog |
| **Live Chat** | Powered by CometChat UI Kit (widget + full admin chat view) |
| **Developer Tools** | File tools (PDF, image, document, text), network tools, SEO tools, database GUI |
| **Help Desk** | Support ticket system |
| **Theming** | 20+ themes with dark/light pairs, admin-lockable, OS-preference-aware |
| **Notifications** | Web Push subscriptions (VAPID) + toast notifications |

---

## Tech Stack

| Technology | Purpose |
|---|---|
| [Next.js 14](https://nextjs.org) (App Router) | Framework — SSR, routing, Edge middleware |
| [React 18](https://react.dev) | UI rendering |
| [TypeScript](https://typescriptlang.org) | Types for `lib/`, `middleware.ts`, `app/` |
| [Supabase](https://supabase.com) | Postgres Realtime subscriptions (blog, site config, banners, contacts) |
| [Axios](https://axios-http.com) | HTTP client with automatic JWT refresh |
| [CometChat](https://cometchat.com) | Live chat UI kit |
| [Sentry](https://sentry.io) | Error monitoring |
| [Cloudinary](https://cloudinary.com) | Media storage, proxied through `cdn.aifazi.net` |
| [Vercel](https://vercel.com) | Hosting & deployment |
| [dompurify](https://github.com/cure53/DOMPurify) | HTML sanitisation for user-generated content (via `lib/sanitizeHtml.ts`; `isomorphic-dompurify` removed 2026-09-04 — its `jsdom` server path caused `ERR_REQUIRE_ESM` 500s) |

---

## Quick Start

### Prerequisites

- Node.js 18+
- `npm` (or `yarn` / `pnpm`)
- A running instance of the **aifazi.net FastAPI backend** (or use the default `https://api.aifazi.net`)
- Supabase project (for Realtime features)
- CometChat app (for chat features)

### Steps

```bash
# 1. Clone the repository
git clone https://github.com/aifazi/aifazi.net-frontend-next.git
cd aifazi.net-frontend-next

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.local.example .env.local
# Edit .env.local with your own values (see Environment Variables below)

# 4. Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Environment Variables

Copy `.env.local.example` to `.env.local` and fill in every value.

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Yes | Base URL of the FastAPI backend (e.g. `https://api.aifazi.net`) |
| `NEXT_PUBLIC_SITE_URL` | No | Public site root. Default `https://aifazi.net`; override to run on your own domain. All hardcoded deployment domains route through `lib/config.ts` |
| `NEXT_PUBLIC_CDN_URL` | No | CDN origin (`https://cdn.aifazi.net` default). On a single-domain deploy set it to your site URL |
| `NEXT_PUBLIC_STORE_URL` | No | Store origin (`https://store.aifazi.net` default). Set to your site URL on a single-domain deploy to disable the store subdomain redirect |
| `NEXT_PUBLIC_FIVEM_URL` | No | FiveM origin (`https://fivem.aifazi.net` default). Same single-domain rule |
| `NEXT_PUBLIC_STATUS_URL` | No | Status-page origin (`https://status.aifazi.net` default) |
| `NEXT_PUBLIC_DISCORD_URL` | No | Discord invite origin (`https://discord.aifazi.net` default) |
| `NEXT_PUBLIC_FIVEM_CONNECT` | No | FiveM game-server connect address shown on the status page (default `play.aifazi.net`) |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anonymous (public) key |
| `NEXT_PUBLIC_SENTRY_DSN` | No | Sentry DSN for error reporting |
| `NEXT_PUBLIC_COMETCHAT_APP_ID` | No | CometChat App ID |
| `NEXT_PUBLIC_COMETCHAT_AUTH_KEY` | No | CometChat Auth Key |
| `NEXT_PUBLIC_COMETCHAT_REGION` | No | CometChat region (e.g. `us`) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | No | VAPID public key for Web Push notifications |
| `INTERNAL_API_SECRET` | Yes | Shared secret stamped on every `/api/*` request by Edge middleware. Must match the backend's `INTERNAL_API_SECRET`. Generate with `openssl rand -hex 32` |

---

## Available Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start the development server at `http://localhost:3000` |
| `npm run build` | Build for production |
| `npm run start` | Start the production server (after `build`) |
| `npm run lint` | Run ESLint |

---

## Project Structure

```
/
├── app/                   # Next.js App Router — routing layer (thin page wrappers)
│   ├── layout.tsx         # Root layout: metadata, fonts, global providers
│   ├── providers.tsx      # All client-side global state (theme, auth, site config)
│   ├── page.tsx           # Home page
│   ├── blog/              # Blog list + [slug] dynamic post route
│   ├── forum/             # Forum: home, category, thread, auth, profile, admin
│   ├── admin/[[...slug]]/ # Catch-all admin panel route (protected by middleware)
│   ├── tools/             # Developer tools: files, db, network, seo
│   ├── chat/              # CometChat full-screen chat page
│   ├── helpdesk/          # Help desk
│   ├── login/             # Login / registration
│   ├── contact/           # Contact page
│   └── globals.css        # Global CSS & theme variables
│
├── pages-src/             # Actual page implementations (imported by app/ wrappers)
│   ├── Home.jsx
│   ├── Blog.jsx / BlogPost.jsx
│   ├── Forum*.jsx         # Forum pages
│   ├── Admin.jsx          # Admin panel entry
│   ├── admin/             # Admin sub-panels (Dashboard, PostEditor, Settings…)
│   ├── filetools/         # File tool views (PDF, Image, Document, Text)
│   └── tools/             # Shared tool helpers
│
├── components/            # ~40 reusable UI components
│   ├── Navbar, Footer, FloatingNav
│   ├── Hero, About, Skills, Experience, Projects, Certifications, Services, Contact
│   ├── ChatWidget, ChatPromo
│   ├── CommandPalette, Terminal, Cursor
│   ├── LoadingScreen, MaintenanceScreen
│   ├── ThemePicker, AnimationPicker
│   └── NotificationBell, LiveVisitorBadge, StatusBadge, Toast, Skeleton…
│
├── core/                  # Internal UI framework (design-system primitives)
│   ├── ui.jsx             # Barrel re-export for the whole framework
│   ├── notify.jsx         # Toast/notification system
│   ├── dialog.jsx         # Modal/confirm dialog
│   ├── menu.jsx           # Context menu & dropdown
│   ├── tokens.js          # Design tokens
│   ├── animations.js      # Animation presets
│   ├── fonts.js           # Font utilities
│   └── framework-styles.js# Per-theme style definitions
│
├── lib/                   # Service integrations & utilities
│   ├── api.ts             # Axios client with JWT auth + silent refresh
│   ├── supabase.ts        # Supabase browser client
│   ├── siteSettings.ts    # Site config fetch/cache
│   ├── router-compat.tsx  # react-router-dom → Next.js shim
│   └── webPush.js         # Web Push subscription helpers
│
├── context/
│   ├── EditContext.jsx    # Inline content editing state
│   └── ForumContext.jsx   # Forum user auth state
│
├── hooks/
│   └── useReveal.js       # IntersectionObserver scroll-reveal hook
│
├── middleware.ts           # Edge middleware: CDN proxy · admin auth · API token injection
├── next.config.js          # Next.js config — API/CDN rewrites, image domains
├── vercel.json             # Vercel deployment config & security headers
└── .env.local.example     # Environment variable template
```

---

## Documentation

Detailed documentation lives in the [`docs/`](./docs) folder:

| Document | Description |
|---|---|
| [Architecture](./docs/architecture.md) | Directory structure, patterns, data-flow diagram |
| [Theming](./docs/theming.md) | Theme system, available themes, customisation |
| [API & Auth](./docs/api-auth.md) | API client, JWT auth, token lifecycle, roles |
| [Admin Panel](./docs/admin.md) | Admin panel features, roles, route protection |
| [Core UI Framework](./docs/core-ui.md) | notify, dialog, menu — design-system primitives |
| [Deployment](./docs/deployment.md) | Vercel, environment variables, CDN proxy, Supabase setup |
