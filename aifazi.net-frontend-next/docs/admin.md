# Admin Panel

The admin panel is a full-featured back-office accessible at `/admin`. It is protected at the routing level by Edge Middleware and at the data level by JWT checks on the FastAPI backend.

---

## Contents

- [Accessing the Admin Panel](#accessing-the-admin-panel)
- [Route Protection](#route-protection)
- [Admin Panel Structure](#admin-panel-structure)
- [Sub-Panels](#sub-panels)
- [Roles & Permissions](#roles--permissions)
- [Inline Content Editing](#inline-content-editing)

---

## Accessing the Admin Panel

Navigate to `/admin`. If you do not have an `admin_session` cookie you will be redirected to:

```
/login?tab=signin&next=/admin
```

After a successful admin or staff login:
1. The backend returns a short-lived JWT access token (stored in `sessionStorage`).
2. The backend sets an HttpOnly refresh token cookie.
3. The frontend sets a client-side `admin_session` cookie (not HttpOnly) so Edge Middleware can detect the session.
4. You are redirected to `/admin`.

---

## Route Protection

Protection happens at two layers:

### Layer 1 — Edge Middleware (UX guard)
`middleware.ts` checks for the `admin_session` cookie on every request to `/admin*`. If absent, it redirects to the login page. This prevents blank-screen experiences for unauthenticated users.

```ts
if (pathname.startsWith('/admin')) {
  const sessionCookie = request.cookies.get('admin_session')?.value
  if (!sessionCookie) {
    return NextResponse.redirect('/login?tab=signin&next=' + pathname)
  }
}
```

### Layer 2 — Backend authorization (real security)
Every API call made by admin components sends a JWT Bearer token. The FastAPI backend validates the token and checks the `role` claim on every endpoint. The frontend middleware is **not** relied upon for security.

---

## Admin Panel Structure

The admin panel is a single-page application nested under `/admin`. It is implemented as:

```
app/admin/[[...slug]]/page.tsx   ← Route (catch-all)
  └─ pages-src/Admin.jsx          ← Panel entry — renders the sidebar + active panel
       ├─ pages-src/admin/Sidebar.jsx       — navigation sidebar
       ├─ pages-src/admin/AdminHeader.jsx   — top bar
       └─ pages-src/admin/AdminPanels.jsx   — panel switcher (renders active panel)
```

Internal navigation uses URL hash or path segments managed by the panel switcher — no full page reloads.

---

## Sub-Panels

| Panel | File | Description |
|---|---|---|
| **Dashboard** | `admin/Dashboard.jsx` | Site overview, stats, recent activity, live visitor count |
| **Post Editor** | `admin/PostEditor.jsx` | Rich-text blog post editor (create / edit / publish / delete posts) |
| **Site Settings** | `admin/SiteSettings.jsx` | General site settings: title, description, social links, contact info, maintenance mode |
| **Theme Library** | `admin/ThemeLibrary.jsx` | Global theme, lock theme, animation preset, roaming robot toggle, loading screen style |
| **Framework Library** | `admin/FrameworkLibrary.jsx` | UI component styles (notify style, dialog style, menu style) |
| **CDN Settings** | `admin/CdnSettings.jsx` | Cloudinary configuration, CDN proxy settings |
| **Mail Settings** | `admin/MailSettings.jsx` | SMTP / email provider configuration |
| **Help Desk Panel** | `admin/HelpDeskPanel.jsx` | View and manage support tickets |
| **Changelog** | `admin/Changelog.jsx` | Admin changelog / release notes |
| **Video Player** | `admin/VideoPlayer.jsx` | Embedded video management |
| **Admin Chat** | `pages-src/AdminChat.jsx` | CometChat-powered admin chat interface |
| **Forum Admin** | `pages-src/ForumAdmin.jsx` | Forum moderation: users, threads, categories, bans |

---

## Roles & Permissions

| Role | Access |
|---|---|
| `admin` | Full access to all admin panels and all API endpoints |
| `moderator` | Forum moderation, help desk |
| `editor` | Blog post editor only |
| `user` | No admin access |
| `chat` | Chat-only access |

Helper functions from `lib/api.ts`:

```ts
import { isAdmin, canEdit, canModerate, hasStaffAccess } from '@/lib/api'

isAdmin()         // true if role === 'admin'
canEdit()         // true if role is 'admin' or 'editor'
canModerate()     // true if role is 'admin' or 'moderator'
hasStaffAccess()  // true if role is 'admin', 'moderator', or 'editor'
```

The `isAdmin` value is also available via `ThemeContext`:

```tsx
import { useTheme } from '@/app/providers'

const { isAdmin } = useTheme()
```

---

## Inline Content Editing

`context/EditContext.jsx` powers the inline editing mode visible on the public site for logged-in admins/editors. When edit mode is active, content sections show edit controls in-place without navigating to the admin panel.

```tsx
import { useEdit } from '@/context/EditContext'

const { editMode, toggleEditMode } = useEdit()
```

Edit mode is toggled from the admin toolbar or from a keyboard shortcut. Changes are POSTed directly to the backend API.
