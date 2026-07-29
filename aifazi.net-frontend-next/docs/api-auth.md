# API & Authentication

This document covers the API client (`lib/api.ts`), JWT authentication, token storage, the silent refresh flow, and the role system.

---

## Contents

- [API Client](#api-client)
- [Proxy Architecture](#proxy-architecture)
- [Authentication Overview](#authentication-overview)
- [Token Storage](#token-storage)
- [Silent Token Refresh](#silent-token-refresh)
- [Role System](#role-system)
- [Helper Functions](#helper-functions)
- [Forum Authentication](#forum-authentication)
- [CDN URL Helpers](#cdn-url-helpers)
- [Web Push](#web-push)

---

## API Client

`lib/api.ts` exports a pre-configured Axios instance:

```ts
import api from '@/lib/api'

// All calls use relative /api paths — the Next.js rewrite proxies them to the backend
const posts = await api.get('/blog/posts')
await api.post('/contact', { name, email, message })
```

The base URL is always `/api` (relative). The Next.js rewrite in `next.config.js` translates `/api/:path*` → `https://api.aifazi.net/api/:path*` (or `NEXT_PUBLIC_API_URL`).

**Never** use `NEXT_PUBLIC_API_URL` directly in fetch/axios calls — it causes CORS errors because browser requests would bypass the Next.js proxy and Edge Middleware.

---

## Proxy Architecture

```
Browser  →  /api/blog/posts
              │
              ▼
         Next.js Edge Middleware
           adds X-Internal-Token header
              │
              ▼
         Next.js rewrite
           → https://api.aifazi.net/api/blog/posts
              │
              ▼
         FastAPI backend
           validates X-Internal-Token
           returns response
```

---

## Authentication Overview

Authentication is JWT-based with two tokens:

| Token | Storage | Lifetime | Purpose |
|---|---|---|---|
| **Access token** | `sessionStorage` | Short (minutes) | Bearer token sent with every API request |
| **Refresh token** | HttpOnly cookie (set by backend) | Long (days/weeks) | Used to obtain a new access token on 401 |

The refresh token is an **HttpOnly cookie** — it cannot be read by JavaScript. The browser sends it automatically with every request to `/api/auth/refresh`.

---

## Token Storage

Access tokens are stored in `sessionStorage` (tab-scoped, cleared on tab close):

| Key | Role |
|---|---|
| `admin_token` | Admin |
| `staff_token` | Staff (moderator / editor) |
| `auth_token` | Regular user |
| `forum_token` | Forum-only user |

The Axios request interceptor picks the first available token from this priority list:

```ts
// lib/api.ts — request interceptor
const token =
  sessionStorage.getItem('admin_token') ||
  sessionStorage.getItem('staff_token') ||
  localStorage.getItem('auth_token')  ||
  sessionStorage.getItem('forum_token') ||
  null
if (token) config.headers.Authorization = `Bearer ${token}`
```

---

## Silent Token Refresh

When any API call returns `401 Unauthorized`:

1. The response interceptor fires.
2. If not already refreshing, it POSTs to `/api/auth/refresh` with `withCredentials: true` (sends the HttpOnly cookie).
3. Multiple concurrent 401s are deduplicated — they all share the same in-flight refresh promise.
4. On success: the new access token is stored back in `sessionStorage` under the correct key and the original request is retried.
5. On failure: `clearAuthTokens()` is called and a `auth:expired` window event is dispatched so the UI can redirect to login.

```ts
// Simplified flow
api.interceptors.response.use(
  res => res,
  async err => {
    if (err.response?.status === 401 && !original._retry) {
      original._retry = true
      const { data } = await axios.post('/api/auth/refresh', {}, { withCredentials: true })
      sessionStorage.setItem(tokenKey, data.token)
      return api(original)  // retry
    }
  }
)
```

---

## Role System

Roles are embedded in the JWT payload and decoded client-side:

```ts
import { getRole, isAdmin, canEdit, hasStaffAccess } from '@/lib/api'

getRole()         // 'admin' | 'moderator' | 'editor' | 'chat' | 'user' | null
isAdmin()         // role === 'admin'
isModerator()     // role === 'moderator'
isEditor()        // role === 'editor'
canEdit()         // admin or editor
canModerate()     // admin or moderator
hasStaffAccess()  // admin, moderator, or editor
```

> **Security note:** Client-side role checks are for UX only (showing/hiding UI elements). All real authorization is enforced server-side by the FastAPI backend on every API call.

The admin panel also checks `isAdmin()` in `app/providers.tsx` on mount to populate `ThemeContext.isAdmin`, which gates admin-only UI across the app.

---

## Helper Functions

### `getAuthToken(): string | null`
Returns the highest-priority available access token from `sessionStorage`, or `null` if unauthenticated.

### `getUsername(): string | null`
Decodes the JWT and returns the `username` claim.

### `getRole(): string | null`
Decodes the JWT and returns the `role` claim.

### `clearAuthTokens()`
Removes all tokens from `sessionStorage` and `localStorage` (legacy cleanup), clears the `admin_session` cookie, and fires `auth-change`.

### `saveTokens({ token })`
Stores an access token in `sessionStorage`. The refresh token is handled by the backend via HttpOnly cookie.

---

## Forum Authentication

Forum user state is managed by `ForumContext` (`context/ForumContext.jsx`):

```tsx
import { useForum } from '@/context/ForumContext'

const { user, loading, login, logout, refreshUser } = useForum()
```

- `user` — the current forum user object (`null` if not logged in).
- `login(token, userData)` — stores the token and sets user state.
- `logout()` — clears all tokens and resets user state.
- `refreshUser()` — re-fetches the user profile from `GET /api/forum/auth/me`.

The context hydrates on mount by calling `GET /api/forum/auth/me` if a token is present. It re-hydrates on `auth-change` and `storage` window events (supports multiple tabs).

---

## CDN URL Helpers

Media served through Cloudinary is rewritten to go through `cdn.aifazi.net`:

```ts
import { cdnUrl, mediaUrl } from '@/lib/api'

// Cloudinary URL → CDN URL
cdnUrl('https://res.cloudinary.com/mycloud/image/upload/v1/photo.jpg')
// → 'https://cdn.aifazi.net/image/upload/v1/photo.jpg'

// Smart helper — handles Cloudinary, absolute, and relative paths
mediaUrl('/uploads/avatar.png')      // → 'https://api.aifazi.net/uploads/avatar.png'
mediaUrl('https://example.com/x.png') // → 'https://example.com/x.png' (unchanged)
mediaUrl('https://res.cloudinary.com/...') // → rewrites through CDN
```

---

## Web Push

`lib/webPush.js` provides browser-side Web Push subscription management:

```js
import { subscribeToPush, unsubscribeFromPush, isPushSupported } from '@/lib/webPush'

// Check support
if (isPushSupported()) { ... }

// Subscribe (requests permission, POSTs subscription to /forum/push/subscribe)
const result = await subscribeToPush(api)
// result.ok === true on success

// Unsubscribe (DELETEs from /forum/push/unsubscribe)
await unsubscribeFromPush(api)
```

Requires `NEXT_PUBLIC_VAPID_PUBLIC_KEY` in `.env.local` and a service worker registered by the application.
