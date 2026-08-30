# aifazi.net Backend — FastAPI

The Python/FastAPI backend powering [aifazi.net](https://aifazi.net). It provides a REST API consumed exclusively by the Next.js frontend; all public traffic is expected to flow through Next.js middleware that injects an `X-Internal-Token` header.

---

## Table of Contents

- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Environment Variables](#environment-variables)
  - [Running Locally](#running-locally)
  - [Running with Docker](#running-with-docker)
- [Security Model](#security-model)
- [API Reference](#api-reference)
  - [Health](#health)
  - [Authentication — Staff](#authentication--staff)
  - [Blog](#blog)
  - [Portfolio](#portfolio)
  - [Forum Auth](#forum-auth)
  - [Forum](#forum)
  - [Notifications](#notifications)
  - [Chat (Supabase Realtime)](#chat-supabase-realtime)
  - [AI Chat](#ai-chat)
  - [Search](#search)
  - [Newsletter](#newsletter)
  - [Contact](#contact)
  - [Content / Content Aggregator](#content--content-aggregator)
  - [Upload](#upload)
  - [SEO Proxy](#seo-proxy)
  - [Sitemap & Robots](#sitemap--robots)
  - [Helpdesk](#helpdesk)
  - [Network Tools](#network-tools)
  - [File Tools](#file-tools)
  - [PDF Editor](#pdf-editor)
  - [Admin — Banners](#admin--banners)
  - [Admin — Site Settings](#admin--site-settings)
  - [Admin — Email Settings](#admin--email-settings)
  - [Admin — CDN Settings](#admin--cdn-settings)
  - [Admin — Stats](#admin--stats)
  - [Admin — Audit Log](#admin--audit-log)
  - [Admin — Backup](#admin--backup)
  - [Admin — Actions](#admin--actions)
  - [Cron](#cron)
- [Background Scheduler](#background-scheduler)
- [Deployment](#deployment)
  - [Railway (recommended)](#railway-recommended)
  - [Render](#render-recommended)
  - [Vercel (serverless)](#vercel-serverless)
- [Dependencies](#dependencies)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | [FastAPI](https://fastapi.tiangolo.com/) 0.111 |
| Server | [Uvicorn](https://www.uvicorn.org/) (ASGI) |
| Database | [Supabase](https://supabase.com/) (PostgreSQL via REST/SDK) |
| Auth | JWT (HS256) via `python-jose` + bcrypt |
| 2FA | TOTP via `pyotp` + QR via `qrcode` |
| AI | OpenAI (`gpt-4o-mini`, `gpt-4o`, `gpt-3.5-turbo`) |
| Email | `aiosmtplib` (async SMTP) |
| Scheduler | APScheduler (AsyncIOScheduler) |
| File Storage | AWS S3 / S3-compatible CDN via `boto3` |
| PDF | PyMuPDF |
| Monitoring | Sentry SDK |

---

## Project Structure

```
.
├── main.py                 # App entry point: lifespan, middleware, router mounting
├── database.py             # Supabase client (service role)
├── dependencies.py         # JWT auth helpers / FastAPI dependencies
├── requirements.txt
├── Dockerfile               # Production image (Railway)
├── railway.json             # Railway deployment config
├── render.yaml              # Render deployment config
├── vercel.json              # Vercel serverless config
├── .env.example
│
├── routers/                # One file per feature area
│   ├── auth.py             # Staff login, 2FA, token refresh, user management
│   ├── blog.py             # Blog posts CRUD
│   ├── portfolio.py        # Portfolio items CRUD
│   ├── forum.py            # Forum threads & replies
│   ├── notifications.py    # Forum notifications
│   ├── chat.py             # Chat rooms & messages (Supabase Realtime)
│   ├── chat_ai.py          # OpenAI chat (public widget + authenticated)
│   ├── search.py           # Full-text search
│   ├── newsletter.py       # Subscriber management & sending
│   ├── contact.py          # Contact form → email
│   ├── content.py          # Static/dynamic content pages
│   ├── content_aggregator.py # Content aggregation helpers
│   ├── upload.py           # File uploads (S3/CDN)
│   ├── seo_proxy.py        # SEO metadata proxy
│   ├── sitemap.py          # /sitemap.xml and /robots.txt
│   ├── helpdesk.py         # Helpdesk tickets
│   ├── network.py          # Network diagnostic tools
│   ├── file_tools.py       # Server-side file utilities
│   ├── pdf_editor.py       # PDF manipulation
│   ├── banners.py          # Site announcement banners
│   ├── site_settings.py    # Global site configuration
│   ├── email_settings.py   # SMTP / email configuration
│   ├── cdn_settings.py     # CDN / storage configuration
│   ├── stats.py            # Admin analytics & stats
│   ├── audit.py            # Audit log viewer
│   ├── backup.py           # Database backup
│   ├── admin_actions.py    # Bulk admin actions
│   └── cron.py             # Cron-triggered cleanup jobs
│
├── utils/
│   ├── scheduler.py        # APScheduler — auto-publishes scheduled posts
│   ├── audit.py            # Audit / auth-log helpers
│   └── email.py            # Async email send helper
│
├── api/
│   └── index.py            # Vercel serverless entry point
│
└── websocket/
    └── chat_ws.py          # (legacy; chat now uses Supabase Realtime)
```

---

## Getting Started

### Prerequisites

- Python 3.11+
- A [Supabase](https://supabase.com/) project (PostgreSQL)
- (Optional) OpenAI API key for AI chat
- (Optional) SMTP credentials for email features
- (Optional) AWS S3 or compatible bucket for file uploads

### Environment Variables

Copy `.env.example` to `.env` and fill in every value:

```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...          # Service-role key (bypasses RLS)

# Auth
PASETO_SECRET=your-paseto-secret             # 32+ char random string for PASETO v4 local tokens
ADMIN_USERNAME=admin
ADMIN_PASSWORD=$2b$12$...                 # bcrypt hash, or plain text for dev

# App
FRONTEND_URL=https://aifazi.net           # http://localhost:3000 for local dev
ENV=production                            # or "development"

# Optional integrations
OPENAI_API_KEY=sk-...
SENTRY_DSN=https://...@sentry.io/...

# Security
CRON_SECRET=<random-hex-32>              # Protects /api/cron/* endpoints
INTERNAL_API_SECRET=<random-hex-32>      # Must match Next.js INTERNAL_API_SECRET
```

> **Important:** `INTERNAL_API_SECRET` must be the same value configured in the Next.js middleware. All non-public API calls must include `X-Internal-Token: <secret>` — this blocks direct API access that bypasses Next.js.

### Running Locally

```bash
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

The API will be available at `http://localhost:8000`. Interactive docs are at `http://localhost:8000/docs` (Swagger UI) and `http://localhost:8000/redoc`.

### Running with Docker

```bash
docker build -t aifazi-backend .
docker run -p 8000:8000 --env-file .env aifazi-backend
```

---

## Security Model

| Feature | Details |
|---|---|
| **CORS** | Dynamic allow-list; production allows only `*.aifazi.net` subdomains |
| **Internal token gate** | All non-public routes require `X-Internal-Token` header matching `INTERNAL_API_SECRET` |
| **Rate limiting** | In-memory sliding-window per IP; stricter limits on auth/AI endpoints |
| **JWT** | HS256 tokens; refresh tokens validated against DB before reissue |
| **2FA** | TOTP (`pyotp`); QR code generated server-side |
| **Security headers** | HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy |
| **Sentry** | Error reporting with 10% trace sampling |

**Rate limits:**

| Endpoint | Limit |
|---|---|
| `POST /api/auth/login` | 5 / min |
| `POST /api/auth/register` | 10 / min |
| `POST /api/auth/2fa/verify` | 10 / min |
| `POST /api/chat/ai/public` | 10 / min |
| All other endpoints | 100 / min |

---

## API Reference

All routes are prefixed as shown. Unless stated otherwise, authenticated endpoints require a Bearer JWT token (`Authorization: Bearer <token>`).

### Health

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/health` | None | Returns `{"status": "OK"}` |

---

### Authentication — Staff

**Prefix:** `/api/auth`

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/login` | None | Admin/staff login; returns `access_token` + sets `refresh_token` cookie |
| `POST` | `/2fa/verify` | None | Verify TOTP code after login |
| `POST` | `/2fa/setup` | JWT | Generate TOTP secret + QR code |
| `POST` | `/2fa/enable` | JWT | Enable 2FA after verifying first code |
| `POST` | `/2fa/disable` | JWT | Disable 2FA |
| `POST` | `/refresh` | Cookie | Exchange refresh token for new access token |
| `POST` | `/logout` | JWT | Invalidate refresh token |
| `GET` | `/me` | JWT | Current user profile |
| `PUT` | `/me` | JWT | Update own username / email / password |
| `GET` | `/staff` | Admin | List all staff users |
| `POST` | `/staff` | Admin | Create staff user |
| `PUT` | `/staff/{id}` | Admin | Update staff user |
| `DELETE` | `/staff/{id}` | Admin | Delete staff user |

**Roles:** `admin`, `moderator`, `editor`, `chat`  
Staff helpers in `dependencies.py`:
- `get_current_user` — any valid JWT
- `require_admin` — `admin` only
- `require_staff` — `admin`, `moderator`, `editor`, `chat`
- `require_roles(*roles)` — custom role set

---

### Blog

**Prefix:** `/api/blog`

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `` | None | List published posts (paginated). Query params: `page`, `limit`, `category`, `tag`, `search`, `all` |
| `GET` | `/meta/categories` | None | List all distinct categories |
| `GET` | `/admin/all` | Staff | List all posts (published + drafts) |
| `GET` | `/{slug}` | None | Get single post by slug |
| `POST` | `/{slug}/view` | None | Increment view counter |
| `POST` | `` | Staff | Create post |
| `PUT` | `/{post_id}` | Staff | Update post |
| `DELETE` | `/{post_id}` | Staff | Delete post |

Posts support **scheduled publishing**: set `publish_at` to a future ISO datetime and `published: false`; the scheduler auto-publishes every 2 minutes.

---

### Portfolio

**Prefix:** `/api/portfolio`

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `` | None | List portfolio items |
| `GET` | `/{id}` | None | Get single item |
| `POST` | `` | Staff | Create item |
| `PUT` | `/{id}` | Staff | Update item |
| `DELETE` | `/{id}` | Staff | Delete item |

---

### Forum Auth

**Prefix:** `/api/auth` (unified — staff, forum users, and admin share one router)

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/register` | None | Register forum user |
| `POST` | `/login` | None | Forum user login; returns JWT |
| `POST` | `/refresh` | Cookie | Refresh forum access token |
| `POST` | `/logout` | JWT | Logout forum user |
| `POST` | `/forgot-password` | None | Send password reset email |
| `POST` | `/reset-password` | None | Reset password via token |
| `GET` | `/me` | JWT | Current forum user profile |
| `PUT` | `/profile` | JWT | Update profile |

Discord OAuth for forum login/connect is served at `/api/auth/discord/*`; Steam and GitHub keep their dedicated routers at `/api/forum/auth/steam/*` and `/api/forum/auth/github/*`.

---

### Forum

**Prefix:** `/api/forum`

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/threads` | None | List threads |
| `GET` | `/threads/{id}` | None | Get thread + replies |
| `POST` | `/threads` | Forum JWT | Create thread |
| `PUT` | `/threads/{id}` | Forum JWT | Edit thread (owner or mod) |
| `DELETE` | `/threads/{id}` | Forum JWT | Delete thread (owner or mod) |
| `POST` | `/threads/{id}/replies` | Forum JWT | Add reply |
| `PUT` | `/replies/{id}` | Forum JWT | Edit reply |
| `DELETE` | `/replies/{id}` | Forum JWT | Delete reply |

---

### Notifications

**Prefix:** `/api/forum/notifications`

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `` | Forum JWT | List notifications for current user |
| `POST` | `/read` | Forum JWT | Mark all as read |
| `POST` | `/{id}/read` | Forum JWT | Mark one as read |

---

### Chat (Supabase Realtime)

**Prefix:** `/api/chat`

Real-time messaging is handled by **Supabase Realtime** on the frontend. The REST endpoints manage rooms and message history.

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/rooms` | Staff | List chat rooms |
| `POST` | `/rooms` | Staff | Create room |
| `GET` | `/rooms/{id}/messages` | Staff | Fetch message history |

---

### AI Chat

**Prefix:** `/api/chat/ai`

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/public` | None | Public ChatWidget endpoint (rate-limited; uses `gpt-4o-mini`, max 400 tokens) |
| `POST` | `` | JWT | Authenticated AI chat; supports streaming (`stream: true`) and model selection |

**Request body:**

```json
{
  "messages": [{"role": "user", "content": "Hello"}],
  "system": "You are a helpful assistant.",
  "model": "gpt-4o-mini",
  "stream": false
}
```

Allowed models: `gpt-4o-mini`, `gpt-4o`, `gpt-3.5-turbo`

---

### Search

**Prefix:** `/api/search`

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `` | None | Search posts, portfolio items, and forum threads. Query param: `q` |

---

### Newsletter

**Prefix:** `/api/newsletter`

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/subscribe` | None | Subscribe with email |
| `POST` | `/unsubscribe` | None | Unsubscribe via token |
| `GET` | `/subscribers` | Admin | List subscribers |
| `POST` | `/send` | Admin | Send newsletter email to all subscribers |

When a blog post is published (manually or via scheduler), a newsletter is automatically sent to all subscribers.

---

### Contact

**Prefix:** `/api/contact`

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `` | None | Send contact form message via email |

---

### Content / Content Aggregator

**Prefix:** `/api/content`

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/{page_key}` | None | Get content block for a specific page |
| `PUT` | `/{page_key}` | Staff | Update content block |
| `GET` | `/aggregate` | None | Aggregated content from multiple sources |

---

### Upload

**Prefix:** `/api/upload`

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `` | Staff | Upload file to S3/CDN; returns public URL |
| `DELETE` | `` | Staff | Delete file from S3/CDN |

---

### SEO Proxy

**Prefix:** `/api/seo-proxy`

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `` | None | Proxy SEO metadata from external URLs (prevents CORS issues in Next.js) |

---

### Sitemap & Robots

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/sitemap.xml` | None | XML sitemap (blog + portfolio + static pages) |
| `GET` | `/robots.txt` | None | robots.txt |

---

### Helpdesk

**Prefix:** `/api/helpdesk`

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/tickets` | Staff | List support tickets |
| `POST` | `/tickets` | None | Submit a ticket |
| `PUT` | `/tickets/{id}` | Staff | Update ticket status / reply |
| `DELETE` | `/tickets/{id}` | Staff | Delete ticket |

---

### Network Tools

**Prefix:** `/api/network`

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/ping` | Staff | Ping a host |
| `GET` | `/dns` | Staff | DNS lookup |
| `GET` | `/whois` | Staff | WHOIS lookup |

---

### File Tools

**Prefix:** `/api/file-tools`

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/convert` | Staff | Convert file format |
| `POST` | `/compress` | Staff | Compress image or file |

---

### PDF Editor

**Prefix:** `/api/pdf-editor`

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/merge` | Staff | Merge multiple PDFs |
| `POST` | `/split` | Staff | Split a PDF into pages |
| `POST` | `/compress` | Staff | Compress a PDF |

---

### Admin — Banners

**Prefix:** `/api/admin/banners`

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `` | None | List active banners (public) |
| `POST` | `` | Admin | Create banner |
| `PUT` | `/{id}` | Admin | Update banner |
| `DELETE` | `/{id}` | Admin | Delete banner |

---

### Admin — Site Settings

**Prefix:** `/api/admin/site-settings`

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `` | None | Get site settings (maintenance mode, theme, etc.) |
| `PUT` | `` | Admin | Update site settings |

---

### Admin — Email Settings

**Prefix:** `/api/admin/email`

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `` | Admin | Get SMTP configuration |
| `PUT` | `` | Admin | Update SMTP configuration |
| `POST` | `/test` | Admin | Send a test email |

---

### Admin — CDN Settings

**Prefix:** `/api/admin/cdn`

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `` | Admin | Get CDN / S3 configuration |
| `PUT` | `` | Admin | Update CDN / S3 configuration |

---

### Admin — Stats

**Prefix:** `/api/admin/stats`

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `` | Staff | Aggregated counts (posts, users, messages, tickets, etc.) |

---

### Admin — Audit Log

**Prefix:** `/api/admin/audit`

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `` | Admin | List audit log entries (paginated) |
| `GET` | `/auth` | Admin | List auth log entries |
| `POST` | `/migrate` | Admin | Create audit/auth_logs tables (idempotent) |

Audit tables are also auto-migrated on every application startup.

---

### Admin — Backup

**Prefix:** `/api/admin/backup`

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `` | Admin | Trigger a database backup |
| `GET` | `` | Admin | List available backups |

---

### Admin — Actions

**Prefix:** `/api/admin`

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/flush-cache` | Admin | Flush application cache |

---

### Cron

**Prefix:** `/api/cron` (also mounted at `/`)

These endpoints are called by the Vercel cron scheduler or an external cron job. They require a `Authorization: Bearer <CRON_SECRET>` header.

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/cron/cleanup` | Cron secret | Clean up expired sessions, old notifications, etc. |

Vercel schedule: daily at 03:00 UTC (`0 3 * * *`).

---

## Background Scheduler

On non-serverless deployments (Render / Docker), **APScheduler** runs an `AsyncIOScheduler` that checks every **2 minutes** for blog posts where `publish_at <= now` and `published = false`. When found, it:

1. Sets `published = true` and clears `publish_at` in the database.
2. Sends a newsletter email to all subscribers via `send_newsletter_for_post`.

On Vercel (serverless), the scheduler is disabled; scheduled publishing is handled by the daily cron job.

---

## Deployment

### Coolify (recommended)

A production `Dockerfile` is included for deployment via Coolify on a VPS.
Because Coolify runs a **persistent** process (no `VERCEL` env var set), the
background APScheduler starts in `lifespan()` — so the 2-minute auto-publisher
**and** the daily cleanup job run in-process (no Vercel cron needed).

```bash
# In Coolify: New Application → Deploy from Git repo
# Set the Dockerfile path: aifazi.net-backend-fastapi/Dockerfile
# Set the build context to the repo root.
# Add all environment variables in the Coolify dashboard (.env.example list).
# Do NOT set VERCEL.
```

Security headers (`X-Content-Type-Options`, `X-Frame-Options`,
`Referrer-Policy`, `Strict-Transport-Security`, CSP) and the
`X-Robots-Tag: noindex, nofollow` for the API host are emitted by the FastAPI
middleware in `main.py`, so they apply on Coolify too.

### Render

A `render.yaml` is included. Create a new Render service from the repository and add all required environment variables in the Render dashboard (marked `sync: false`).

```bash
# Manual deploy trigger (if not using auto-deploy)
# Just push to your main branch — Render picks it up automatically.
```

The service uses the Docker runtime. Health check: `GET /api/health`.

Upgrade the plan from `starter` to `standard` for always-on availability and reliable WebSocket/streaming support.

### Vercel (serverless)

A `vercel.json` is included. The entry point is `api/index.py`.

```bash
vercel --prod
```

Set all environment variables in the Vercel dashboard or via `vercel env add`. The scheduler is automatically disabled in serverless mode (`VERCEL` env var is set by the platform).

**Limitations on Vercel:**
- Max Lambda size: 50 MB (set in `vercel.json`)
- No persistent background scheduler; use the built-in Vercel Cron instead
- Cold starts may add latency

---

## Dependencies

| Package | Purpose |
|---|---|
| `fastapi` | Web framework |
| `uvicorn[standard]` | ASGI server |
| `supabase` | Supabase Python SDK |
| `python-jose[cryptography]` | JWT encode/decode |
| `bcrypt` | Password hashing |
| `python-multipart` | Form / file upload parsing |
| `httpx` | Async HTTP client |
| `python-dotenv` | `.env` file loading |
| `apscheduler` | Background job scheduler |
| `aiosmtplib` | Async SMTP email sending |
| `email-validator` | Email address validation |
| `openai` | OpenAI API client |
| `sentry-sdk[fastapi]` | Error monitoring |
| `pillow` | Image processing |
| `aiofiles` | Async file I/O |
| `boto3` | AWS S3 / CDN uploads |
| `pyotp` | TOTP 2FA |
| `qrcode` | QR code generation for 2FA |
| `PyMuPDF` | PDF manipulation |
