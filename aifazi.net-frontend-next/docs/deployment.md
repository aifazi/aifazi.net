# Deployment

This document covers deploying the frontend to Vercel, configuring environment variables, the CDN proxy, and required Supabase setup.

---

## Contents

- [Vercel Deployment](#vercel-deployment)
- [Environment Variables](#environment-variables)
- [CDN Proxy Setup](#cdn-proxy-setup)
- [Supabase Setup](#supabase-setup)
- [Security Headers](#security-headers)
- [Build & Runtime Notes](#build--runtime-notes)

---

## Vercel Deployment

The project is configured for zero-config Vercel deployment via `vercel.json`.

### Automatic (recommended)

1. Push the repository to GitHub.
2. Import the project at [vercel.com/new](https://vercel.com/new).
3. Vercel auto-detects Next.js and uses these settings from `vercel.json`:
   - **Build command:** `next build`
   - **Output directory:** `.next`
   - **Install command:** `npm install`
   - **Region:** `iad1` (US East — closest to the FastAPI backend)
4. Add all [environment variables](#environment-variables) in the Vercel dashboard under **Project → Settings → Environment Variables**.
5. Deploy.

### Manual CLI

```bash
npm i -g vercel
vercel login
vercel --prod
```

---

## Environment Variables

Set these in the Vercel dashboard (or in `.env.local` for local development).

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Yes | FastAPI backend base URL. Defaults to `https://api.aifazi.net` if not set. |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL (e.g. `https://xxxx.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anonymous key (safe to expose — row-level security enforced on the backend) |
| `NEXT_PUBLIC_SENTRY_DSN` | No | Sentry DSN for error reporting |
| `NEXT_PUBLIC_COMETCHAT_APP_ID` | No | CometChat App ID (from [app.cometchat.com](https://app.cometchat.com)) |
| `NEXT_PUBLIC_COMETCHAT_AUTH_KEY` | No | CometChat Auth Key |
| `NEXT_PUBLIC_COMETCHAT_REGION` | No | CometChat region (e.g. `us`) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | No | VAPID public key for Web Push notifications |
| `INTERNAL_API_SECRET` | Yes | Shared secret stamped on every `/api/*` request as `X-Internal-Token`. Must match `INTERNAL_API_SECRET` on the FastAPI backend. Generate: `openssl rand -hex 32` |

> **`NEXT_PUBLIC_*` variables** are embedded in the browser bundle. Never put secrets in them.  
> **`INTERNAL_API_SECRET`** is a server-side Edge Middleware variable — it is never sent to the browser.

---

## CDN Proxy Setup

The CDN proxy (`cdn.aifazi.net`) routes Cloudinary media through the Next.js Edge Middleware so URLs can be rewritten without exposing the Cloudinary cloud name to the browser.

### DNS Configuration

Add a CNAME record in your DNS provider (Cloudflare or registrar):

```
cdn.aifazi.net  CNAME  <your-vercel-app>.vercel.app
```

- If using Cloudflare: set the proxy to **DNS only (grey cloud)** — Cloudflare CDN should not sit in front of Vercel's edge.
- Add `cdn.aifazi.net` as a **Custom Domain** in the Vercel project settings.

### How it Works

1. A request arrives at `cdn.aifazi.net/image/upload/v1/photo.jpg`.
2. Edge Middleware detects the `cdn.aifazi.net` hostname.
3. It fetches the Cloudinary cloud name from `GET /api/admin/cdn/proxy-config` (cached 5 min).
4. It proxies the request to `https://res.cloudinary.com/<cloud>/image/upload/v1/photo.jpg`.
5. The response is returned with `cache-control: public, max-age=31536000, immutable`.

### Component Usage

Use the `cdnUrl()` or `mediaUrl()` helpers from `lib/api.ts` to generate CDN URLs:

```ts
import { cdnUrl, mediaUrl } from '@/lib/api'

// Rewrite a Cloudinary URL → CDN URL
cdnUrl('https://res.cloudinary.com/mycloud/image/upload/v1/foo.jpg')
// → 'https://cdn.aifazi.net/image/upload/v1/foo.jpg'
```

Or use relative `/cdn/` paths (handled by the Next.js rewrite):

```html
<img src="/cdn/image/upload/v1/foo.jpg" />
```

---

## Supabase Setup

Supabase is used exclusively for **Realtime subscriptions** (not as the primary database — that is managed by FastAPI/PostgreSQL).

### 1. Create a Supabase Project

Go to [supabase.com](https://supabase.com), create a project, and copy the **Project URL** and **anon key** into your environment variables.

### 2. Enable Realtime on Required Tables

Run the following SQL in the Supabase SQL editor:

```sql
-- Site settings live-sync
ALTER TABLE site_config    REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE site_config;

-- Blog posts live-sync
ALTER TABLE posts           REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE posts;

-- Banners/announcements live-sync
ALTER TABLE banners         REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE banners;

-- Chat
ALTER TABLE chat_messages   REPLICA IDENTITY FULL;
ALTER TABLE chat_rooms      REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE chat_rooms;

-- Admin contacts & staff activity
-- (these fire window events — tables must exist on the same Supabase project)
ALTER PUBLICATION supabase_realtime ADD TABLE contacts;
ALTER PUBLICATION supabase_realtime ADD TABLE staff_activity;
```

> **Without `REPLICA IDENTITY FULL`**, UPDATE and DELETE events will not fire on Supabase Realtime.

### 3. Verify

After enabling Realtime, open two browser tabs. Make a change in the admin (e.g. toggle maintenance mode) and confirm the change appears on the other tab within 1–2 seconds without a page refresh.

---

## Security Headers

`vercel.json` adds the following security headers to every response:

| Header | Value | Purpose |
|---|---|---|
| `X-Content-Type-Options` | `nosniff` | Prevents MIME-type sniffing |
| `X-Frame-Options` | `DENY` | Prevents clickjacking in iframes |
| `X-XSS-Protection` | `1; mode=block` | Legacy XSS filter (modern browsers ignore this in favour of CSP) |

---

## Build & Runtime Notes

### API Rewrites vs. vercel.json

All API proxying is done via `next.config.js` rewrites, **not** via `vercel.json` redirects. This is intentional: rewrites in `vercel.json` bypass Next.js Edge Middleware, which means the `X-Internal-Token` header would never be injected and the backend would reject the request.

### Build ID

The `BUILD_ID` environment variable is set at build time to `VERCEL_GIT_COMMIT_SHA` (or a timestamp). It is used as a cache-busting key for `localStorage` — the loading screen is shown once per build, then skipped on repeat visits/tabs.

```ts
// In providers.tsx
const BUILD_ID = process.env.BUILD_ID || 'dev'
if (localStorage.getItem('site-loaded') !== BUILD_ID) setLoading(true)
```

### Image Domains

`next.config.js` allows `next/image` to serve images from:
- `*.supabase.co` — Supabase Storage
- `api.dicebear.com` — avatar generation
- `res.cloudinary.com` — Cloudinary
- `cdn.aifazi.net` — the CDN proxy
- `*.aifazi.net` — all subdomains
