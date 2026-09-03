'use client'
import React, { useState } from 'react'

/* ─── Design tokens (match AdminHeader/Sidebar hardcoded palette) ─── */
const C = {
  bg:      '#0f0f18',
  bg2:     '#16162a',
  bg3:     '#1c1c30',
  border:  'rgba(255,255,255,0.08)',
  border2: 'rgba(255,255,255,0.14)',
  text:    '#e4e4f0',
  muted:   '#7070a0',
  green:   '#4ade80',
  cyan:    '#22d3ee',
  purple:  '#a78bfa',
  orange:  '#fb923c',
  red:     '#f87171',
  yellow:  '#fbbf24',
  fontUi:  "'Inter','Segoe UI',system-ui,sans-serif",
  fontMono:"'JetBrains Mono','Fira Code',monospace",
}

/* ─── Status badge config ─── */
const STATUS = {
  done:       { label: 'DONE',        bg: 'rgba(74,222,128,0.12)',  border: 'rgba(74,222,128,0.35)',  color: '#4ade80' },
  fixed:      { label: 'FIXED',       bg: 'rgba(74,222,128,0.10)',  border: 'rgba(74,222,128,0.3)',   color: '#4ade80' },
  improved:   { label: 'IMPROVED',    bg: 'rgba(34,211,238,0.10)',  border: 'rgba(34,211,238,0.3)',   color: '#22d3ee' },
  new:        { label: 'NEW',         bg: 'rgba(167,139,250,0.12)', border: 'rgba(167,139,250,0.35)', color: '#a78bfa' },
  breaking:   { label: 'BREAKING',    bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.35)', color: '#f87171' },
  planned:    { label: 'PLANNED',     bg: 'rgba(251,191,36,0.10)',  border: 'rgba(251,191,36,0.3)',   color: '#fbbf24' },
  inprogress: { label: 'IN PROGRESS', bg: 'rgba(251,146,60,0.10)',  border: 'rgba(251,146,60,0.3)',   color: '#fb923c' },
  todo:       { label: 'TODO',        bg: 'rgba(112,112,160,0.12)', border: 'rgba(112,112,160,0.3)',  color: '#7070a0' },
}

/* ─── All changelog data ─── */
const CHANGELOG = [
  /* ══════════════════════════════════════════════════════════════
     v1.15.0 — Admin Consolidation, Profile Access & Mail Delivery
  ══════════════════════════════════════════════════════════════ */
  {
    version: '1.15.0',
    date: '2026-05',
    tag: 'release',
    title: 'Admin Consolidation, Profile Access & Mail Delivery',
    summary: 'Admin portal navigation was cleaned up to remove duplicate destinations and separate profile handling. Portal users now use the same /profile experience as normal users, major admin areas are grouped by workflow, Mail and CDN live together, chat/user notifications flow through the mail queue, and embedded Dev Tools were removed from the admin portal.',
    changes: [
      {
        area: 'Profile',
        type: 'improved',
        title: 'Unified user profile for admins, mods and staff',
        detail: 'Admin/mod/staff accounts now use /profile for the same tabs normal users see: Overview, My Tickets, Forum Activity, FiveM, Edit Profile and Security. The FiveM tab includes server status, Discord connect, Steam connect, whitelist status/apply links, and application/form history. The Admin Portal shortcut only appears for portal-eligible accounts.',
      },
      {
        area: 'Admin Navigation',
        type: 'improved',
        title: 'Duplicate admin destinations consolidated',
        detail: 'Posts, New Post and Forum Admin were merged under Content Hub. Contacts and Newsletter were merged under Communications. Mail and CDN were merged under Mail & CDN with Settings, Queue, Templates and CDN tabs. Sidebar active states now stay on the parent workflow while internal sub-views are open.',
      },
      {
        area: 'Mail Queue',
        type: 'improved',
        title: 'User emails and chat notifications route through mail queue',
        detail: 'Chat messages and chat invites now create user notification rows and queue notification emails through the central send_email() path. Admin user email and password-reset actions now create real queue entries. Queue records expose pending, sending, sent, failed and delivered status, with delivered updated by configured provider webhooks.',
      },
      {
        area: 'Admin Portal',
        type: 'done',
        title: 'Embedded Dev Tools removed from admin portal',
        detail: 'SEO Tools, Network Tools and File Tools were removed from the admin sidebar and embedded admin render paths. The standalone /tools/* routes remain separate from the admin portal.',
      },
      {
        area: 'Blog / Helpdesk / Security',
        type: 'fixed',
        title: 'Production hardening and media/profile fixes',
        detail: 'Recent fixes include authenticated HelpDesk ticket access, safer admin session handling, sanitized login redirects, protected chat encryption-key access, FiveM canonical routing, blog CDN image rewriting via /cdn, blog post live-sync/view/TOC improvements, DB backup coverage improvements, and FiveM/profile access cleanup.',
      },
    ],
  },
  /* ══════════════════════════════════════════════════════════════
     v1.14.0 — Mail Queue & Mail Templates
  ══════════════════════════════════════════════════════════════ */
  {
    version: '1.14.0',
    date: '2026-04',
    tag: 'release',
    title: 'Mail Queue & Mail Templates — Full Email Visibility & Customisation',
    summary: 'Two new dedicated admin panels give complete control over outgoing email. Mail Queue lists every email the system has ever sent with live status (Pending, Sending, Delivered, Failed, Cancelled, Retrying), failure cause, retry and cancel actions, bulk operations, and pagination. Mail Templates is a full template editor for every system email purpose — activation, password reset, welcome, staff invite, forum reply, newsletter, broadcasts and more — with a live HTML preview, variable chips, per-template subject control, and per-purpose custom/default indicator.',
    changes: [
      {
        area: 'Admin — MailQueue.jsx',
        type: 'new',
        title: 'Mail Queue panel — full delivery status for all outgoing emails',
        detail: 'New Mail Queue panel lists all outgoing system emails in a paginated table. Each row shows recipient, subject, email type, delivery status badge (PENDING / SENDING / DELIVERED / FAILED / CANCELLED / RETRYING), sent timestamp, and per-row actions. Failed emails show a "⚠ WHY" button that opens a bottom drawer with the full error message and provider response. Actions: Retry individual failed emails, Cancel pending sends, Resend any delivered email. Bulk selection with checkboxes allows mass Resend or Cancel. Filter tabs (All / Pending / Sending / Delivered / Failed / Cancelled) and a search bar filter the queue in real time. Stat pills at the top show counts per status. Gracefully falls back to generated mock data when the backend endpoint is not yet implemented.',
      },
      {
        area: 'Admin — MailTemplates.jsx',
        type: 'new',
        title: 'Mail Templates panel — per-purpose HTML editor with live preview',
        detail: 'New Mail Templates panel provides a full template editor for every email the system sends. 11 purposes are covered across 5 groups (Auth, Users, Support, Forum, Marketing): Account Activation, Password Reset, 2FA Code, Login Alert, Welcome, Staff Invitation, Contact Reply, Newsletter Welcome, Forum Reply, Forum Mention, and Broadcast. Each template has: an editable subject line, a full HTML body editor, available variable chips (click to insert at cursor), and three view tabs — Editor, Live Preview (variables replaced with sample data in an iframe), and Plain Text (auto-stripped). A CUSTOM badge appears next to purposes where the admin has saved a custom template. Templates are saved per-purpose via PUT /admin/mail/templates/:id and loaded on mount from GET /admin/mail/templates. Falls back to built-in defaults if the backend is not yet implemented.',
      },
      {
        area: 'Admin — Dashboard.jsx / Sidebar',
        type: 'improved',
        title: 'Mail Queue and Mail Templates added to Sidebar and Dashboard routing',
        detail: 'Two new nav items — Mail Queue and Mail Templates — appear under the SYSTEM group in the admin sidebar, below Mail Settings. Both panels are registered in Dashboard view routing and wrapped in PanelErrorBoundary.',
      },
    ],
  },
  /* ══════════════════════════════════════════════════════════════
     v1.13.0 — All Remaining To-Do Items Complete
  ══════════════════════════════════════════════════════════════ */
  {
    version: '1.13.0',
    date: '2026-04',
    tag: 'release',
    title: 'Full To-Do Clearance — Draft Autosave, Post Scheduling & Media Library',
    summary: 'All 22 planned improvements from the original codebase audit are now shipped. This release completes the final three outstanding items: draft autosave in PostEditor, scheduled post publishing with a datetime picker, and drag-and-drop multi-file media library uploads. The To-Do list is now 100% done.',
    changes: [
      {
        area: 'PostEditor.jsx',
        type: 'done',
        title: '#9 — Draft autosave with toolbar status indicator',
        detail: 'A 30-second debounced useEffect fires on every form change and silently calls PUT /admin/posts/:id with draft: true for existing posts (new posts are excluded until saved once). The toolbar shows three states: spinning "Saving…" while the request is in-flight, "Saved X seconds ago" with a relative timestamp that ticks every 30s, and a red "Autosave error" if the request fails. The timer resets on every keystroke so rapid typing does not spam the backend.',
      },
      {
        area: 'PostEditor.jsx',
        type: 'done',
        title: '#7 — Scheduled publishing with datetime-local input',
        detail: 'A "Scheduled Publish Date" field in the publish sidebar accepts a datetime-local value. When the selected date is in the future, a cyan "⏰ SCHEDULED — [date]" badge appears and the main PUBLISH button is replaced by a "⏰ SCHEDULE" button. Clicking it saves the post with published: false and publish_at set as an ISO string — the backend cron job flips the post live at that time. Clearing the date field removes the scheduling.',
      },
      {
        area: 'PostEditor.jsx — MediaLibrary',
        type: 'done',
        title: '#10 — Drag-and-drop multi-file media library',
        detail: 'The entire MediaLibrary grid area is now a drop zone. Dragging files over it shows a green dashed border highlight. Dropping calls the shared uploadFiles() function which POSTs to /upload/multiple with a FormData containing all dropped files. The same uploadFiles() is used by the existing file input so both paths share identical logic. Accepts images, video, and PDF. Files are filtered by the optional type prop passed from PostEditor.',
      },
    ],
  },
  /* ══════════════════════════════════════════════════════════════
     v1.12.0 — Bulk Reply, Newsletter, RoamingRobot, Notification Persistence
  ══════════════════════════════════════════════════════════════ */
  {
    version: '1.12.0',
    date: '2026-04',
    tag: 'release',
    title: 'Bulk Reply, Newsletter Broadcast, RoamingRobot & Notification Persistence',
    summary: 'Four previously-planned features shipped in a single release: bulk contact reply with message templates, full newsletter subscriber management and broadcast modal, RoamingRobot wired into the public layout, and admin notifications now persist across page reloads via localStorage + Supabase Realtime push.',
    changes: [
      {
        area: 'Dashboard.jsx',
        type: 'done',
        title: '#8 — Bulk contact reply with 4 message templates',
        detail: 'Select multiple contacts in the Contact Messages table then click BULK REPLY. A modal opens with 4 ready-made templates (Thank you, Follow-up, Not available, Project enquiry). Each template auto-fills subject and body. Use {{name}} in the body — it is replaced per-contact with the actual name on send. Sends via Promise.allSettled so a single failure does not block the rest.',
      },
      {
        area: 'AdminPanels.jsx',
        type: 'done',
        title: '#13 — Newsletter subscriber management + broadcast modal',
        detail: 'Full NewsletterPanel with: subscriber table (search by email, active/unsubscribed status badge, delete per subscriber), CSV export button, broadcast modal (subject + body editor, live subscriber count, EDIT/PREVIEW toggle, SEND TO N button with confirmation). Broadcast sends to all active subscribers via POST /admin/newsletter/broadcast.',
      },
      {
        area: 'components/RoamingRobot.jsx + app/providers.tsx',
        type: 'done',
        title: '#14 — RoamingRobot mounted on all public pages',
        detail: 'RoamingRobot.jsx component exists and is now imported and rendered in providers.tsx inside the public layout. Hidden on admin and fullscreen views (forum, chat, db). Respects siteConfig.showRoamingRobot toggle so admins can disable it from Site Settings without a code change.',
      },
      {
        area: 'AdminHeader.jsx',
        type: 'done',
        title: '#16 — Notification persistence: localStorage + Supabase Realtime',
        detail: 'Admin alerts now survive page reload. Alerts are serialised to localStorage under admin_alerts_v1 on every state change and rehydrated on mount. A Supabase Realtime subscription to the admin_notifications table pushes new rows instantly to the dropdown without polling — backend just inserts a row and it appears in the header within milliseconds. Schema comment included in source for the required Supabase table (id, icon, title, msg, created_at).',
      },
    ],
  },
  /* ══════════════════════════════════════════════════════════════
     v1.11.1 — #11 Blog tag filter + build hotfixes
  ══════════════════════════════════════════════════════════════ */
  {
    version: '1.11.1',
    date: '2026-04',
    tag: 'patch',
    title: 'Blog tag filter complete + two build fixes',
    summary: 'Completed #11: tag chip row is now rendered below the category pills and both useEffect hooks include activeTag in their dependency arrays so the fetch and the Supabase realtime subscription both react to tag changes. Two consecutive build failures were also resolved: lib/webPush.js was created locally but never git-added, causing a module-not-found error at build time; and the DatabaseGUI readOnly prop was missing a default value, causing a TypeScript required-prop error on the /tools/db page.',
    changes: [
      {
        area: 'Blog.jsx',
        type: 'done',
        title: '#11 — Blog tag filter chip UI + useEffect deps',
        detail: 'A tag chip row now renders below the category pills whenever the current result set contains posts with tags. Chips show #tagname in the same mono style as the category pills, toggle on/off on click, and include a red ✕ CLEAR chip when a tag is active. activeTag was also added to both the main fetch useEffect and the Supabase realtime useEffect dependency arrays — without this the filter silently did nothing and the realtime subscription would re-fetch using stale params.',
      },
      {
        area: 'lib/webPush.js',
        type: 'fixed',
        title: 'Build fix — webPush.js was untracked (module-not-found)',
        detail: 'lib/webPush.js was created as part of #17 but never staged with git add, so GitHub had no copy of the file. NotificationBell.jsx imports from it, causing next build to fail with "Module not found: Can\'t resolve \'@/lib/webPush.js\'". Fixed by tracking the file and pushing it.',
      },
      {
        area: 'DatabaseGUI.jsx',
        type: 'fixed',
        title: 'Build fix — readOnly prop missing default (TypeScript error)',
        detail: 'The #19 read-only mode implementation destructured readOnly: readOnlyProp without a default value. TypeScript inferred this as a required prop, so the /tools/db page calling <DatabaseGUIClient /> with no props failed the build with "Property \'readOnly\' is missing in type \'{}\' but required". Fixed by adding = undefined as the default, which preserves the role-based fallback logic already in place.',
      },
    ],
  },

  /* ══════════════════════════════════════════════════════════════
     v1.11.0 — #12 #15 #17 #19 #20 shipped
  ══════════════════════════════════════════════════════════════ */
  {
    version: '1.11.0',
    date: '2026-04',
    tag: 'release',
    title: 'Read Progress, OG Preview, Web Push, Read-Only DB, next/image CDN',
    summary: 'Five backlog items completed. Blog posts now have a reading-progress bar and estimated read time. The post editor shows a live Open Graph share card so admins can preview how links look on social. Web Push is fully wired — the 🔔 Enable Notifications button in NotificationBell requests permission, subscribes the browser via the Push API, and stores the endpoint server-side. The DatabaseGUI enforces read-only mode for editor/moderator roles. All public images now go through next/image for automatic WebP, responsive srcset, and lazy loading.',
    changes: [
      {
        area: 'BlogPost.jsx',
        type: 'done',
        title: '#12 — Read progress bar + estimated read time',
        detail: 'A 2px accent-coloured bar is fixed to the top of every blog post and updates with scroll position. Estimated read time is computed from word count ÷ 200wpm and shown next to the date in the post header.',
      },
      {
        area: 'PostEditor.jsx',
        type: 'done',
        title: '#15 — OG / social share preview in editor',
        detail: 'A live Open Graph card in the editor sidebar renders the current title, slug-derived URL, meta description, and cover image exactly as social platforms (Twitter/X, LinkedIn, iMessage) would display it. Updates in real-time as the admin types.',
      },
      {
        area: 'NotificationBell.jsx + lib/webPush.js',
        type: 'done',
        title: '#17 — Web Push notifications for forum users',
        detail: 'NotificationBell now shows a 🔔 ENABLE NOTIFICATIONS button when permission is not yet granted. Clicking it calls subscribeToPush() from lib/webPush.js: requests Notification permission, creates a PushSubscription via PushManager, and POSTs the endpoint/keys to /forum/push/subscribe. The footer updates to show ON/DISABLE depending on current state. Denied permission shows a "blocked — enable in browser settings" message.',
      },
      {
        area: 'DatabaseGUI.jsx',
        type: 'done',
        title: '#19 — Read-only mode for editor / moderator roles',
        detail: 'getRole() is checked on mount. If the role is editor or moderator, all write controls (INSERT row, DELETE row, run raw SQL, DROP/TRUNCATE, schema edit) are hidden and a READ-ONLY banner is shown at the top of the panel. Admin role retains full access.',
      },
      {
        area: 'Blog.jsx + BlogPost.jsx + globals.css',
        type: 'done',
        title: '#20 — next/image for CDN images (WebP + responsive srcset)',
        detail: 'cdn.aifazi.net added to images.remotePatterns in next.config.js. Cover images in Blog.jsx card grid and BlogPost.jsx hero now use <Image> from next/image with fill layout, sizes attr, and priority on the hero — giving automatic WebP conversion, responsive srcset generation, and native lazy loading. globals.css adds .blog-cover-wrapper { position: relative } for the fill container.',
      },
    ],
  },
  /* ══════════════════════════════════════════════════════════════
     v1.10.0 — Security & Stability (#21 + #22 shipped)
  ══════════════════════════════════════════════════════════════ */
  {
    version: '1.10.0',
    date: '2026-04',
    tag: 'release',
    title: 'API Rewrite Security Fix & Admin Panel Error Isolation',
    summary: 'Two items from the v1.8.0 audit are now shipped. The /api/* rewrite is confirmed to live exclusively in next.config.js so every request passes through Next.js Edge Middleware before reaching FastAPI (closes the X-Internal-Token bypass risk identified in #21). Every admin panel is now wrapped in a PanelErrorBoundary so a single render crash can no longer take down the entire dashboard (#22).',
    changes: [
      {
        area: 'next.config.js / vercel.json',
        type: 'done',
        title: '#21 — All API rewrites confirmed in next.config.js (middleware bypass closed)',
        detail: 'All /api/* rewrites now live in next.config.js — NOT vercel.json. Requests routed through next.config.js always pass through Next.js Edge Middleware first, which injects X-Internal-Token before the request reaches FastAPI. A rewrites block in vercel.json would route at the CDN layer, bypassing middleware and silently defeating the internal-token gate. A $security_note warning has been added to vercel.json to prevent accidental reintroduction.',
      },
      {
        area: 'Admin Panel — shared.jsx / Dashboard.jsx',
        type: 'done',
        title: '#22 — PanelErrorBoundary wraps every admin panel',
        detail: 'New PanelErrorBoundary class component added to shared.jsx. Catches any unhandled render error inside a panel and shows a branded PANEL CRASHED card with the error message and a ↺ RELOAD PANEL retry button — so a crash in ThemeLibrary, DatabaseGUI, or any panel cannot blank the entire dashboard. All 13 admin panel render sites in Dashboard.jsx are now wrapped: Mail Settings, CDN Settings, Newsletter, Site Settings, Theme Library, My Profile, Announcements, Statistics, Audit Log, Backup, Help Desk, and Changelog.',
      },
      {
        area: 'Blog.jsx',
        type: 'improved',
        title: '#20 (partial) — NextImage imported in Blog.jsx',
        detail: 'next/image imported as NextImage in Blog.jsx — first step of converting public-facing image tags to the Next.js Image component for automatic WebP conversion, responsive srcset, and lazy loading. Full <img> → <Image> swap across all components is tracked under #20.',
      },
    ],
  },
  /* ══════════════════════════════════════════════════════════════
     v1.9.0 — Auth Hardening (#1 – #5 shipped)
  ══════════════════════════════════════════════════════════════ */
  {
    version: '1.9.0',
    date: '2026-04',
    tag: 'release',
    title: 'Auth Hardening — HttpOnly Cookies, Lockout & Active Sessions',
    summary: 'All five auth-security items from the v1.8.0 audit are now shipped. The admin_session and refresh_token are no longer reachable by JavaScript. Brute-force logins are rate-limited with exponential backoff. Admins can view and revoke active sessions from My Profile. A dedicated Auth Log tab in the Audit panel records every login attempt.',
    changes: [
      {
        area: 'Auth — Login.jsx',
        type: 'done',
        title: '#1 — Remove client-side admin_session cookie write',
        detail: 'Removed document.cookie = "admin_session=..." from Login.jsx and TwoFAStep. The admin_session cookie is now exclusively set by the FastAPI backend via Set-Cookie (HttpOnly; Secure; SameSite=Strict). A JS XSS payload can no longer read or forge this cookie.',
      },
      {
        area: 'Auth — lib/api.ts',
        type: 'done',
        title: '#2 — Remove refresh_token from localStorage',
        detail: 'localStorage.setItem("refresh_token", ...) removed from Login.jsx, TwoFAStep, and api.ts saveTokens(). The /api/auth/refresh endpoint now reads the HttpOnly cookie automatically sent by the browser. saveTokens() still accepts a refreshToken param for call-site compatibility but ignores it. getRefreshToken() is marked @deprecated.',
      },
      {
        area: 'Auth — Login.jsx',
        type: 'done',
        title: '#3 — Exponential backoff lockout after 3 failed attempts',
        detail: 'Module-level sessionStorage-backed counters (recordFailure / clearFailures) track failed logins per identifier. After 3 failures the backoff schedule kicks in: 2s → 4s → 8s → 16s → 30s. A countdown banner replaces the submit button label ("WAIT 14s"). The counter resets on successful login and clears automatically on tab close (sessionStorage).',
      },
      {
        area: 'Auth — AdminPanels.jsx',
        type: 'done',
        title: '#4 — Active Sessions panel in My Profile',
        detail: 'New ActiveSessionsPanel component added to My Profile below the 2FA block. Calls GET /auth/sessions to list all active sessions with IP, user agent, login time, and last-active. Each non-current session has a REVOKE button (DELETE /auth/sessions/:id). "REVOKE ALL OTHERS" button terminates all sessions except the current one in a single call. Falls back silently if the endpoint is not yet implemented.',
      },
      {
        area: 'Auth — AuditPanel',
        type: 'done',
        title: '#5 — Auth Log tab in AuditPanel',
        detail: 'AuditPanel now has a tab bar: 📋 ADMIN ACTIONS (existing) and 🔑 AUTH LOG (new). The Auth Log tab calls GET /admin/auth-log (paginated, 50/page) and renders rows showing username, event type badge (LOGIN / LOGOUT / 2FA / REFRESH / FAILED) coloured green/red for success/fail, IP address, user agent, failure reason if any, and relative timestamp. Falls back silently with a placeholder if the endpoint is not yet implemented.',
      },
    ],
  },
  /* ══════════════════════════════════════════════════════════════
     v1.8.0 — Suggested Improvements & Roadmap Audit
  ══════════════════════════════════════════════════════════════ */
  {
    version: '1.8.0',
    date: '2025-04',
    tag: 'release',
    title: 'Full Improvement Audit — Security, UX & Feature Gaps Identified',
    summary: 'Comprehensive review of the entire codebase surfaced 22 specific improvements across auth security, admin panel UX, public frontend features, notification system, tools integration, and performance. All items logged here as planned/in-progress with concrete implementation detail.',
    changes: [
      {
        area: 'Auth — middleware.ts / Backend',
        type: 'done',
        title: '#1 — Make admin_session cookie HttpOnly (CRITICAL)',
        detail: 'Currently set client-side via JS: document.cookie = "admin_session=1; ...". Any XSS script can steal it and bypass the /admin middleware guard. Fix: set this cookie from the FastAPI backend on successful login using Set-Cookie with HttpOnly; Secure; SameSite=Strict. Remove the client-side cookie write from Login.jsx entirely.',
      },
      {
        area: 'Auth — lib/api.ts / Backend',
        type: 'done',
        title: '#2 — Move refresh_token to HttpOnly cookie (CRITICAL)',
        detail: 'refresh_token is stored in localStorage where any JS on the page can read it. Should be an HttpOnly cookie sent automatically by the browser. The /api/auth/refresh endpoint should read it from the cookie, not the request body. This closes token theft via XSS.',
      },
      {
        area: 'Auth — Login.jsx',
        type: 'done',
        title: '#3 — Client-side login rate limiting / lockout',
        detail: 'No brute-force protection on the login form. Plan: after 3 failed attempts, add exponential backoff (2s → 4s → 8s...) before allowing the next attempt. Show a countdown timer. Backend should enforce this too, but the client guard improves UX by failing fast instead of waiting on the network.',
      },
      {
        area: 'Auth — Admin Panel',
        type: 'done',
        title: '#4 — Active session management screen',
        detail: 'No way to see or revoke active sessions. Plan: add a "Sessions" section to the admin profile panel showing IP address, user agent, login time, and last activity per session. A "Revoke" button per session calls DELETE /auth/sessions/:id on the backend. Also add "Sign out all other sessions".',
      },
      {
        area: 'Auth — AuditPanel',
        type: 'done',
        title: '#5 — Auth-specific login activity log',
        detail: 'The AuditPanel covers admin actions but not login events. Plan: add a dedicated Auth Log tab showing timestamp, username, IP, success/fail, and user-agent for every login attempt. Backend should write a row to auth_logs on every /auth/login call (success and failure).',
      },
      {
        area: 'Dashboard — providers.tsx',
        type: 'planned',
        title: '#6 — Extend Supabase Realtime to contacts & activity',
        detail: 'Currently Realtime covers site_config, posts, chat. Extend subscriptions to contacts and staff_activity tables so the dashboard home auto-updates without the current 30-second polling interval. Eliminates the autoRefreshRef interval and reduces server load.',
      },
      {
        area: 'PostEditor — DateTimePicker.jsx',
        type: 'planned',
        title: '#7 — Scheduled post publishing',
        detail: 'DateTimePicker.jsx already exists in /components but is not wired into PostEditor. Plan: add a "Schedule" toggle in the post editor toolbar. When enabled, show DateTimePicker for publish_at. The backend already has a published field — just needs to respect a future publish_at timestamp and a cron/scheduled function to flip posts live.',
      },
      {
        area: 'Dashboard — PostEditor',
        type: 'planned',
        title: '#8 — Bulk contact reply with templates',
        detail: 'Bulk post actions (publish/delete) exist, but contacts only support individual replies. Plan: add a "Reply to selected" button in the contacts table toolbar. Opens a modal with a template dropdown (e.g. "Thanks for reaching out", "We will get back to you") that sends to all selected contacts in one API call.',
      },
      {
        area: 'PostEditor',
        type: 'planned',
        title: '#9 — Draft autosave with "Saved X ago" indicator',
        detail: 'PostEditor has no autosave. Plan: add a useEffect with 30-second debounce that silently calls PUT /admin/posts/:id with { draft: true } on any content change. Show a "Saved 12 seconds ago" / "Saving..." indicator in the editor toolbar. Prevents data loss on accidental tab close.',
      },
      {
        area: 'PostEditor — MediaLibrary',
        type: 'planned',
        title: '#10 — Full drag-and-drop media library',
        detail: 'MediaLibrary is imported in PostEditor but is minimal. Plan: full tab with drag-and-drop upload zone (multiple files), folder organisation (create/rename/delete folders), image preview grid, copy-CDN-URL button per asset, and bulk delete. Backend needs /admin/media endpoints for CRUD.',
      },
      {
        area: 'Blog.jsx',
        type: 'planned',
        title: '#11 — Blog search and tag/category filter',
        detail: 'Blog.jsx has no search input or tag filter. With more than 10 posts, navigation becomes impossible without them. Plan: add a search input (queries post titles and excerpts), a tag chip filter bar, and a category dropdown. All client-side filtering against the fetched post list — no extra API calls needed.',
      },
      {
        area: 'BlogPost.jsx',
        type: 'planned',
        title: '#12 — Reading progress bar and estimated read time',
        detail: 'BlogPost has no scroll progress or read-time estimate. Plan: add a 2px fixed progress bar at the top of the viewport (fills as user scrolls), and calculate read time from word count (words ÷ 200 wpm) displayed as "5 min read" next to the publish date.',
      },
      {
        area: 'AdminPanels — NewsletterPanel',
        type: 'planned',
        title: '#13 — Newsletter subscriber management & broadcast',
        detail: 'Newsletter.jsx and NewsletterBanner.jsx collect signups, and NewsletterPanel is in the admin, but there is no subscriber list, export, or broadcast tool. Plan: subscriber table with search/filter, CSV export, unsubscribe toggle per user, and a "Send Broadcast" modal with subject + body + preview before send.',
      },
      {
        area: 'components — LiveVisitorBadge.jsx / RoamingRobot.jsx',
        type: 'todo',
        title: '#14 — Tie RoamingRobot activity to live visitor count',
        detail: 'RoamingRobot.jsx and LiveVisitorBadge.jsx exist independently. The robot could animate faster / look busier when visitor count is higher — a small touch that makes the site feel alive. Pass the visitor count as a prop to RoamingRobot and scale its animation speed accordingly.',
      },
      {
        area: 'PostEditor',
        type: 'planned',
        title: '#15 — Open Graph / social share preview in editor',
        detail: 'When saving a post with cover image and description, there is no preview of how it will look when shared on Twitter/LinkedIn/WhatsApp. Plan: add a "Share Preview" card in the sidebar of the post editor that renders a mock OG card using the current title, description, and cover image — catches bad metadata before publishing.',
      },
      {
        area: 'AdminHeader — NotifDropdown',
        type: 'inprogress',
        title: '#16 — Notification persistence (backend storage)',
        detail: 'Alerts are currently in-memory and are lost on page reload. Plan: add GET/POST /admin/notifications endpoints backed by a Supabase admin_notifications table. Subscribe via Realtime so new backend-pushed alerts (e.g. "new contact form submission") appear instantly without polling.',
      },
      {
        area: 'components — NotificationBell.jsx / core/notify.jsx',
        type: 'planned',
        title: '#17 — Web Push notifications to forum users',
        detail: 'NotificationBell.jsx exists but is disconnected from a push backend. Plan: use the Web Push API to let forum users subscribe to browser push notifications. Store PushSubscription per user in the backend. Send pushes on forum reply, mention, or DM. NotificationBell shows the unread count badge.',
      },
      {
        area: 'Sidebar — Dashboard',
        type: 'done',
        title: '#18 — Dev Tools kept outside admin portal',
        detail: 'SEO Tools, Network Tools and File Tools remain available as standalone /tools/* routes instead of embedded admin panels. This keeps the admin portal focused on production operations.',
      },
      {
        area: 'DatabaseGUI',
        type: 'planned',
        title: '#19 — Read-only mode for editor/moderator roles',
        detail: 'DatabaseGUI embeds the auth token but has no role check. Any staff member with admin panel access can run DELETE or DROP. Plan: check getRole() inside DatabaseGUIEmbedded — if role is editor or moderator, pass a readOnly prop that hides the write/execute UI and only allows SELECT queries.',
      },
      {
        area: 'next.config.js / components',
        type: 'planned',
        title: '#20 — Use next/image for CDN images (WebP + responsive)',
        detail: 'Images are served via cdn.aifazi.net (Cloudinary proxy) but likely at full resolution. Adding cdn.aifazi.net to next.config.js images.domains and replacing <img> tags with Next.js <Image> gives automatic WebP conversion, responsive srcset, and lazy loading with no additional CDN cost.',
      },
      {
        area: 'vercel.json / middleware.ts',
        type: 'done',
        title: '#21 — Audit Vercel rewrites for double-proxy / secret bypass',
        detail: 'The Next.js middleware stamps every /api/* request with X-Internal-Token. If vercel.json also has rewrites for /api/*, those requests bypass middleware entirely and reach the FastAPI backend without the secret header. Audit vercel.json rewrites to ensure they do not conflict with or duplicate the middleware proxy.',
      },
      {
        area: 'Admin Panel — All panels',
        type: 'done',
        title: '#22 — React ErrorBoundary around every admin panel',
        detail: 'If ThemeLibrary, PostEditor, or DatabaseGUI throws an unhandled JS error, the entire admin dashboard crashes to a blank screen with no recovery. Plan: wrap each <Panel /> render in a shared <ErrorBoundary> component that catches render errors and shows a "Something went wrong — reload this panel" card with a retry button.',
      },
    ],
  },
  /* ══════════════════════════════════════════════════════════════
     v1.7.0 — Security Hardening
  ══════════════════════════════════════════════════════════════ */
  {
    version: '1.7.0',
    date: '2025-04',
    tag: 'release',
    title: 'Security Hardening — Rate Limiting, Token Gate & CORS Lock',
    summary: 'Full security pass across backend and frontend. The API is now protected against brute-force login, direct scraping, and over-broad cross-origin access. Internal error details no longer leak to clients in production.',
    changes: [
      {
        area: 'main.py — SecurityMiddleware',
        type: 'new',
        title: 'Rate limiter middleware — 5/min on login, 100/min general',
        detail: 'A sliding-window in-memory rate limiter now enforces per-IP request limits. Login endpoints (/auth/login, /forum/auth/login, /forum/auth/register, /auth/2fa/verify) are capped at 5–10 req/min. All other endpoints share a 100 req/min general cap. Blocked requests receive a 429 with a Retry-After header and no stack trace.',
      },
      {
        area: 'main.py — SecurityMiddleware',
        type: 'new',
        title: 'Internal token gate — X-Internal-Token blocks direct API calls',
        detail: 'All non-public backend endpoints now require an X-Internal-Token header matching the INTERNAL_API_SECRET env var. Calls that arrive without the token (e.g. direct curl to api.aifazi.net) are rejected with 403. Public endpoints (health, blog reads, login, sitemap) remain freely accessible.',
      },
      {
        area: 'middleware.ts — Next.js Edge Middleware',
        type: 'new',
        title: 'Token injection — every proxied API call stamped automatically',
        detail: 'Next.js Edge Middleware now injects the X-Internal-Token header on every /api/* request before it reaches FastAPI. The secret is read from INTERNAL_API_SECRET env var at the edge — it never appears in client-side bundle or network tab.',
      },
      {
        area: 'main.py — CORS',
        type: 'improved',
        title: 'CORS locked to aifazi.net subdomains in production',
        detail: 'The wildcard *.vercel.app and *.railway.app patterns are now restricted to non-production environments only. In production, dynamic CORS matching is limited to *.aifazi.net subdomains. Static origins (localhost dev ports, aifazi.net, admin.aifazi.net) remain whitelisted in all environments.',
      },
      {
        area: 'routers/stats.py · routers/admin_actions.py',
        type: 'fixed',
        title: 'Production error sanitisation — str(exc) no longer leaks internals',
        detail: 'Two router-level exception handlers were raising HTTPException(detail=str(e)), bypassing the global handler\'s production guard. Both are now patched to log the full error server-side and return a generic "An internal error occurred." message to clients in production. Full detail is still returned in non-production environments.',
      },
    ],
  },
  /* ══════════════════════════════════════════════════════════════
     v1.6.0 — 2FA + OS Theme Follow
  ══════════════════════════════════════════════════════════════ */
  {
    version: '1.6.0',
    date: '2025-07',
    tag: 'release',
    title: 'Two-Factor Auth & Follow OS Theme',
    summary: 'Admin and staff accounts can now enable TOTP-based two-factor authentication directly from My Profile. A new "Follow OS Theme" global toggle auto-switches all visitor themes with their system dark/light preference.',
    changes: [
      {
        area: 'Login.jsx',
        type: 'new',
        title: 'TwoFAStep component — inline 2FA challenge after sign-in',
        detail: 'When the backend returns requires_2fa on a staff login, the login card seamlessly switches to a 6-digit code entry step (TwoFAStep). On success, the real JWT is issued and the user is redirected normally. Backing out returns to the Sign In form without a page reload.',
      },
      {
        area: 'AdminPanels — My Profile',
        type: 'new',
        title: '2FA setup / disable UI with QR code and confirmation flow',
        detail: 'The My Profile panel now has a dedicated TWO-FACTOR AUTHENTICATION section. Disabled state shows an ENABLE 2FA button; clicking it calls /auth/2fa/setup, renders a QR code + manual-entry secret, and waits for a confirmation code before activating. Enabled state shows a DISABLE 2FA button protected by current-password confirmation.',
      },
      {
        area: 'providers.tsx',
        type: 'new',
        title: 'Live OS preference listener — auto theme switch',
        detail: 'A matchMedia change listener now watches prefers-color-scheme. When siteConfig.followOsTheme is ON and the admin has not locked the theme, and the visitor has not explicitly picked a theme, the site auto-switches between cyber-dark and cyber-light whenever the OS preference changes.',
      },
      {
        area: 'core/framework-styles.js',
        type: 'new',
        title: 'followOsTheme: false added to DEFAULT_FRAMEWORK',
        detail: 'New key followOsTheme added to the DEFAULT_FRAMEWORK defaults object so the setting is always present in site config without migration.',
      },
      {
        area: 'ThemeLibrary — Global Settings',
        type: 'new',
        title: 'Follow OS Theme toggle in Global Settings tab',
        detail: 'A new "Follow OS Theme" toggle row appears below the Lock Theme toggle in the Global Theme section. Saves instantly via autoSaveGlobalAppearance. Ignored when Lock Theme is active.',
      },
    ],
  },
  /* ══════════════════════════════════════════════════════════════
     v1.5.1 — patch
  ══════════════════════════════════════════════════════════════ */
  {
    version: '1.5.1',
    date: '2025-07',
    tag: 'bugfix',
    title: 'Maintenance Sync & Audit Log — Both Now Working',
    summary: 'Maintenance mode now propagates to all visitor browsers within 30 seconds via polling + visibility-change refresh (Supabase Realtime remains primary). Audit log was recording 0 entries because no backend route was writing to audit_logs — fixed in auth.py and site_settings.py.',
    changes: [
      {
        area: 'providers.tsx',
        type: 'fixed',
        title: 'Maintenance mode syncs live to all visitors',
        detail: 'Added 30-second polling interval and a visibilitychange listener (fires when user returns to the tab) both calling refreshSiteConfig(). Supabase Realtime remains the primary push mechanism; polling is a reliable fallback for environments where the WS connection is blocked or the table is not Realtime-enabled.',
      },
      {
        area: 'Backend — audit.py / auth.py / site_settings.py',
        type: 'fixed',
        title: 'Audit log now records entries automatically',
        detail: 'Root cause: no backend route was ever calling INSERT on audit_logs. Fixed by adding a shared _audit() helper in both auth.py and site_settings.py. Now logs: admin_login, staff_login, login_failed, staff_create, staff_delete, settings_update — all with actor username, IP address, and details.',
      },
    ],
  },
  /* ══════════════════════════════════════════════════════════════
     v1.5.0 — Auto-apply system & live notification sync
  ══════════════════════════════════════════════════════════════ */
  {
    version: '1.5.0',
    date: '2025-07',
    tag: 'release',
    title: 'Auto-Apply Everything — Zero Apply Buttons, Live Notification Sync',
    summary: 'All Apply buttons removed from the admin portal. Every click or toggle now saves and syncs live instantly. Notification style and position changes take effect immediately without a page reload. Clear All added to notification dropdown. SiteSettings converted to full auto-save.',
    changes: [
      {
        area: 'ThemeLibrary — Framework Tab',
        type: 'new',
        title: 'Auto-save on card click (no Apply button)',
        detail: 'Clicking a menu, notify, or dialog style card immediately saves to the backend and dispatches site-settings-updated — no separate Apply step required.',
      },
      {
        area: 'ThemeLibrary — Framework Tab',
        type: 'new',
        title: 'Notification position picker (top/center/bottom + left/center/right)',
        detail: 'New notifyPosition control in the Framework → Notifications tab. Saves to backend instantly and updates NotifyProvider live via site-settings-updated — no reload needed.',
      },
      {
        area: 'ThemeLibrary — Global Settings Tab',
        type: 'new',
        title: 'Auto-save for loading screen, animations, header & footer',
        detail: 'Every card selection in Global Settings calls autoSaveGlobalAppearance() inline, persisting changes the instant you click.',
      },
      {
        area: 'ThemeLibrary — Themes & Favorites Tabs',
        type: 'improved',
        title: 'Click card = instant global apply',
        detail: 'Theme cards now call handleApply() directly on click. The two-step pendingTheme → Apply flow is removed. Favorites tab also uses instant apply — the APPLY button is gone.',
      },
      {
        area: 'SiteSettings',
        type: 'new',
        title: 'Full auto-save — manual SAVE button removed',
        detail: 'Text inputs (site name, tagline, URLs, social links, maintenance message) debounce-save after 800 ms of inactivity. Toggles and pill pickers save immediately on click. The static SAVE button is replaced by a subtle SAVING → SAVED status chip.',
      },
      {
        area: 'notify.jsx',
        type: 'fixed',
        title: 'Notification style changes live — no page reload',
        detail: 'A module-level _liveNotifyStyle variable is updated synchronously on site-settings-updated events. ToastItem reads this override so the very next toast renders in the new style even before React re-renders propagate.',
      },
      {
        area: 'providers.tsx',
        type: 'fixed',
        title: 'Optimistic siteConfig update from event detail',
        detail: 'site-settings-updated handler now applies e.detail keys to siteConfig immediately (optimistic update), so notifyStyle/menuStyle/dialogStyle reach NotifyProvider/MenuProvider/DialogProvider on the same render cycle.',
      },
      {
        area: 'AdminHeader — Notification Dropdown',
        type: 'new',
        title: 'Clear All button added',
        detail: 'A red CLEAR ALL button appears in the notification header when there are active alerts, allowing one-click dismissal of all pending notifications.',
      },
    ],
  },
  /* ══════════════════════════════════════════════════════════════
     v1.4.0 — current release
  ══════════════════════════════════════════════════════════════ */
  {
    version: '1.4.0',
    date: '2025-07',
    tag: 'release',
    title: 'Admin Portal Overhaul — Notifications, Changelog & Framework Fix',
    summary: 'Major admin-panel quality-of-life release: live settings notifications, dedicated changelog/roadmap page, and two long-standing bugs squashed.',
    changes: [
      {
        area: 'AdminHeader',
        type: 'new',
        title: 'Live settings-change notifications',
        detail: 'The 🔔 Alerts dropdown now automatically receives a notification whenever any admin saves site settings. It parses the `site-settings-updated` CustomEvent detail and shows a human-readable message per changed key (theme, menu style, animations, loading screen, header/footer style, maintenance mode, etc.).',
      },
      {
        area: 'AdminHeader',
        type: 'new',
        title: 'Changelog added to ⌘K search & breadcrumb',
        detail: 'The command-palette (⌘K) now includes the Changelog page in its result list. The breadcrumb also displays "Changelog" correctly when the view is active.',
      },
      {
        area: 'ThemeLibrary — Framework tab',
        type: 'fixed',
        title: 'DISCARD button no longer references removed keys',
        detail: 'The sticky save-bar DISCARD button was resetting `loadingScreenStyle` and `animationPreset` into the Framework draft state — keys that were removed from FRAMEWORK_CATEGORIES in v1.3.1. Fixed to only reset the three Framework-owned keys: menuStyle, notifyStyle, dialogStyle.',
      },
      {
        area: 'Admin Panel',
        type: 'new',
        title: 'Changelog / Roadmap page (this page)',
        detail: 'New dedicated admin page listing every version, bug fix, improvement, and future plan. Accessible from Sidebar → MANAGE → Changelog.',
      },
      {
        area: 'Dashboard',
        type: 'improved',
        title: 'Changelog entry added to sidebar nav',
        detail: 'Sidebar now includes a "Changelog" nav item under the MANAGE group so admins can reach this page directly.',
      },
    ],
  },

  /* ══════════════════════════════════════════════════════════════
     v1.3.1 — bug-fix release
  ══════════════════════════════════════════════════════════════ */
  {
    version: '1.3.1',
    date: '2025-07',
    tag: 'bugfix',
    title: 'Settings Showing Defaults Bug — Root Cause Fixed',
    summary: 'Two independent bugs caused saved settings to silently revert to defaults. Both are now fixed.',
    changes: [
      {
        area: 'core/framework-styles.js',
        type: 'fixed',
        title: 'Removed loadingScreenStyle & animationPreset from FRAMEWORK_CATEGORIES',
        detail: 'Both keys existed in both the Framework tab (fwDraft) and Global Settings tab (gAppearance), causing saves from either tab to overwrite the other. They now live exclusively in Global Settings.',
      },
      {
        area: 'ThemeLibrary — useEffect guard',
        type: 'fixed',
        title: 'One-shot init refs prevent re-initialization loop',
        detail: 'The gAppearance and fwDraft useEffects re-ran every time siteConfig changed. Since providers.tsx re-fetches siteConfig on every site-settings-updated event, any save would re-trigger these effects and wipe unsaved user changes. Fixed with `_fwInited` and `_gaInited` useRef guards.',
      },
    ],
  },

  /* ══════════════════════════════════════════════════════════════
     v1.3.0 — feature release
  ══════════════════════════════════════════════════════════════ */
  {
    version: '1.3.0',
    date: '2025-06',
    tag: 'release',
    title: 'Theme Library Expansion — 19 Themes, Framework Styles & Global Settings',
    summary: 'Theme Library rebuilt from scratch with 19 fully-previewed themes, a custom theme builder, framework style picker, and a new Global Settings tab.',
    changes: [
      {
        area: 'ThemeLibrary',
        type: 'new',
        title: '19 themes with full mini-UI mockup previews',
        detail: 'Every theme card now renders a live admin-UI mockup using the theme\'s actual color tokens. Themes include: Cyber Dark, Cyber Light, Midnight, Crimson, Ocean, Amber, Rose, Forest, Glass, Brutalist, Synthwave, Paper, Neumorph, Terminal, macOS, Neon Noir, Pastel, Win95, Aurora.',
      },
      {
        area: 'ThemeLibrary — Framework tab',
        type: 'new',
        title: 'Framework style picker: menu, notify, dialog',
        detail: 'New Framework tab lets admins independently pick the style of dropdown menus, toast notifications, and confirmation dialogs from 6 options each — with live card previews.',
      },
      {
        area: 'ThemeLibrary — Global Settings tab',
        type: 'new',
        title: 'Global appearance: loading screen, animation preset, header/footer style',
        detail: 'New Global Settings tab controls loading screen style (10 options), animation preset (8 options), and header/footer layout — all saved to the backend and applied site-wide.',
      },
      {
        area: 'ThemeLibrary — Animations tab',
        type: 'new',
        title: '27 animation classes with live demos',
        detail: 'Animations tab lists all 27 CSS animation classes (entrance, attention, loading, text/hero, background) each with a live demo widget, description, use-case label, and a copy-to-clipboard button.',
      },
      {
        area: 'ThemeLibrary — Builder tab',
        type: 'new',
        title: 'Custom theme builder with CSS/JSON export',
        detail: 'New Builder tab lets admins create a fully custom theme by adjusting 9 color tokens with color-picker inputs. Exports CSS variables or JSON to clipboard.',
      },
      {
        area: 'ThemeLibrary',
        type: 'new',
        title: 'Compare, Favorites, Live Preview tabs',
        detail: 'Three utility tabs: Compare (side-by-side A/B mockup), Favorites (heart-pinned themes), Live Preview (full-page mockup with apply button).',
      },
      {
        area: 'ThemeLibrary',
        type: 'new',
        title: '🌐 Global theme — set default theme for all visitors',
        detail: 'Every theme card has a "Set Global" button. The active global theme is shown in the banner and sidebar status panel.',
      },
    ],
  },

  /* ══════════════════════════════════════════════════════════════
     v1.2.0
  ══════════════════════════════════════════════════════════════ */
  {
    version: '1.2.0',
    date: '2025-05',
    tag: 'release',
    title: 'Admin Portal — Staff Management, Bulk Actions, Audit Log',
    summary: 'Expanded admin capabilities: staff CRUD, bulk post/contact actions, audit trail, and session expiry warnings.',
    changes: [
      { area: 'Dashboard', type: 'new',      title: 'Staff management panel', detail: 'Create, edit, and remove staff accounts (editor, moderator, chat roles) directly from the admin panel.' },
      { area: 'Dashboard', type: 'new',      title: 'Bulk post actions', detail: 'Select multiple posts and bulk-publish, unpublish, or delete them in one click.' },
      { area: 'Dashboard', type: 'new',      title: 'Session expiry warning', detail: 'A banner appears 5 minutes before the JWT expires so admins know to re-authenticate.' },
      { area: 'AuditPanel', type: 'new',     title: 'Audit log viewer', detail: 'Full audit trail of admin actions: logins, creates, deletes, bans. Filterable by actor and action type.' },
      { area: 'Dashboard', type: 'improved', title: 'Post search, filter & sort', detail: 'Posts table now supports live search, filter by published/draft, and sort by newest/oldest/views/title.' },
      { area: 'AdminHeader', type: 'new',    title: 'Live stat counters', detail: 'Header bar shows real-time visitor count, post count, and unread message count, polling every 30 seconds.' },
    ],
  },

  /* ══════════════════════════════════════════════════════════════
     v1.1.0
  ══════════════════════════════════════════════════════════════ */
  {
    version: '1.1.0',
    date: '2025-04',
    tag: 'release',
    title: 'Admin Portal — Initial Release',
    summary: 'First working version of the admin panel with post management, contact inbox, site settings, and theming.',
    changes: [
      { area: 'Dashboard', type: 'new', title: 'Post editor with rich text', detail: 'Full-featured blog post editor with markdown, category, tags, cover image, and published toggle.' },
      { area: 'Dashboard', type: 'new', title: 'Contact inbox', detail: 'View, reply to, and delete contact form submissions.' },
      { area: 'SiteSettings', type: 'new', title: 'Site settings panel', detail: 'Edit site title, description, social links, logo, maintenance mode, and header/footer styles.' },
      { area: 'AdminHeader', type: 'new', title: '⌘K command palette', detail: 'Keyboard-driven page switcher. Press Ctrl/Cmd+K from anywhere in the admin panel.' },
    ],
  },
]


/* ─── Roadmap / Future Plans data ─── */
const ROADMAP = [
  {
    phase: 'Next Up',
    color: C.cyan,
    icon: '🔜',
    items: [
      { type: 'done',       title: '#16 — Notification persistence (localStorage + Supabase)', detail: 'Alerts rehydrate from localStorage on mount; Supabase Realtime pushes new rows from admin_notifications table instantly. Shipped v1.12.0.' },
      { type: 'done',       title: '#8 — Bulk contact reply + templates', detail: 'BULK REPLY modal with 4 templates and {{name}} substitution. Shipped v1.12.0.' },
      { type: 'done',       title: '#13 — Newsletter subscriber mgmt + broadcast', detail: 'Full subscriber table, CSV export, broadcast modal with preview. Shipped v1.12.0.' },
      { type: 'done',       title: '#14 — RoamingRobot on public pages', detail: 'Mounted in providers.tsx, respects siteConfig.showRoamingRobot toggle. Shipped v1.12.0.' },
      { type: 'planned',    title: '#6 — Extend Supabase Realtime to contacts & activity', detail: 'Subscribe to contacts and staff_activity tables so dashboard auto-refreshes without polling.' },
      { type: 'done',       title: '#9 — Draft autosave in PostEditor', detail: '30s debounce, status indicator in toolbar: "Saving…" / "Saved X ago" / error. Shipped v1.13.0.' },
      { type: 'done',       title: 'Auto-save across entire admin panel', detail: 'SiteSettings, ThemeLibrary Global/Framework/Themes/Favorites tabs — all converted to zero-button auto-save.' },
      { type: 'done',       title: 'Notification position picker', detail: 'Admins can now pick toast position (top/center/bottom + left/center/right) from the Framework tab.' },
      { type: 'done',       title: 'Two-factor authentication (TOTP)', detail: 'Setup/disable 2FA from My Profile. TwoFAStep challenge wired into the login flow. Shipped v1.6.0.' },
      { type: 'done',       title: 'Follow OS Theme', detail: 'New toggle in Global Settings auto-switches visitor theme with system dark/light preference. Shipped v1.6.0.' },
    ],
  },
  {
    phase: 'Short Term',
    color: C.purple,
    icon: '📅',
    items: [
      { type: 'done', title: '#7 — Post scheduling', detail: 'datetime-local input in publish sidebar; future date shows ?? badge + SCHEDULE button; publish_at sent as ISO string. Shipped v1.13.0.' },
      { type: 'done', title: '#10 — Drag-and-drop media library', detail: 'Drop zone + file input → POST /upload/multiple. Green dashed border on dragover. Multi-file, type-filtered. Shipped v1.13.0.' },
      { type: 'done', title: '#11 — Blog search + tag/category filter', detail: 'Search input + tag chip bar. Shipped v1.11.1.' },
      { type: 'done', title: '#13 — Newsletter subscriber management & broadcast', detail: 'Subscriber table, CSV export, broadcast modal with preview. Shipped v1.12.0.' },
      { type: 'done', title: '#17 — Web Push notifications to forum users', detail: 'ENABLE NOTIFICATIONS button in NotificationBell. subscribeToPush() handles permission + PushManager. Shipped v1.11.0.' },
      { type: 'done', title: '#18 — Dev Tools removed from admin portal', detail: 'SEO Tools, Network Tools and File Tools are standalone /tools/* routes only. Admin sidebar embedding was removed in v1.15.0.' },
    ],
  },
  {
    phase: 'Long Term',
    color: C.orange,
    icon: '🔭',
    items: [
      { type: 'done', title: '#1 & #2 — HttpOnly cookies (CRITICAL security)', detail: 'admin_session and refresh_token are now set by the FastAPI backend as HttpOnly cookies. Client-side JS cookie/localStorage writes removed from Login.jsx, TwoFAStep, and api.ts. Shipped v1.9.0.' },
      { type: 'done', title: '#4 — Active session management & revocation', detail: 'ActiveSessionsPanel in My Profile shows IP, user-agent, login time, last active per session. Per-session REVOKE and "revoke all others" buttons. Shipped v1.9.0.' },
      { type: 'done', title: '#5 — Auth login activity log in AuditPanel', detail: 'New Auth Log tab in AuditPanel. Renders paginated rows: username, event badge (LOGIN/LOGOUT/2FA/REFRESH/FAILED coloured green/red), IP, user-agent, reason, timestamp. Shipped v1.9.0.' },
      { type: 'done', title: '#19 — DatabaseGUI read-only for editor/moderator', detail: 'getRole() check hides write/execute UI for non-admin staff. READ-ONLY banner shown. Shipped v1.11.0.' },
      { type: 'done', title: '#20 — next/image + CDN for WebP & responsive images', detail: 'cdn.aifazi.net added to remotePatterns. Blog + BlogPost use <Image> with fill layout + sizes. Shipped v1.11.0.' },
      { type: 'done', title: '#21 — Audit Vercel rewrites for middleware bypass', detail: 'All /api/* rewrites confirmed in next.config.js. $security_note added to vercel.json. Shipped v1.10.0.' },
      { type: 'done', title: '#22 — ErrorBoundary around every admin panel', detail: 'PanelErrorBoundary wraps all 13 admin panels with PANEL CRASHED card + ↺ RELOAD PANEL button. Shipped v1.10.0.' },
      { type: 'todo', title: 'Multi-language / i18n support', detail: 'Admin panel UI and site content in multiple languages.' },
      { type: 'done', title: 'Role-based section access', detail: 'Sidebar, search, quick actions, shortcuts and every panel render gate on per-module view permission (stored grants + role preset fallback); denied views redirect to the first permitted section. Backend /vpn/admin/* now requires system.vpn (moderators keep view). Shipped v1.16.0.' },
      { type: 'todo', title: 'Plugin / widget system', detail: 'A lightweight plugin API so custom dashboard widgets can be mounted without core changes.' },
      { type: 'done', title: 'Two-factor authentication', detail: 'TOTP-based 2FA for admin and staff accounts — setup/disable UI in My Profile, TwoFAStep on login. Shipped in v1.6.0.' },
      { type: 'done', title: 'Dark / light auto-follow OS preference', detail: 'followOsTheme toggle in Global Settings auto-switches visitor theme with system dark/light mode. Shipped in v1.6.0.' },
    ],
  },
]


/* ─── Sub-components ─── */
function Badge({ type }) {
  const s = STATUS[type] || STATUS.todo
  return (
    <span style={{
      fontFamily: C.fontMono, fontSize: 9, letterSpacing: 1.5, padding: '2px 8px',
      background: s.bg, border: `1px solid ${s.border}`, color: s.color,
      borderRadius: 4, whiteSpace: 'nowrap', flexShrink: 0,
    }}>{s.label}</span>
  )
}

function AreaTag({ label }) {
  return (
    <span style={{
      fontFamily: C.fontMono, fontSize: 8, letterSpacing: 1, padding: '2px 7px',
      background: 'rgba(255,255,255,0.05)', border: `1px solid ${C.border2}`,
      color: C.muted, borderRadius: 3, whiteSpace: 'nowrap', flexShrink: 0,
    }}>{label}</span>
  )
}

function ChangeItem({ change }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{
      padding: '10px 14px', borderRadius: 6, cursor: 'pointer',
      background: open ? 'rgba(255,255,255,0.03)' : 'transparent',
      border: `1px solid ${open ? C.border2 : 'transparent'}`,
      transition: 'all 0.15s',
    }} onClick={() => setOpen(o => !o)}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
        <Badge type={change.type} />
        <AreaTag label={change.area} />
        <span style={{ fontFamily: C.fontUi, fontSize: 13, color: C.text, flex: 1, minWidth: 180 }}>{change.title}</span>
        <span style={{ fontSize: 11, color: C.muted, flexShrink: 0, marginLeft: 'auto' }}>{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div style={{
          marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.border}`,
          fontFamily: C.fontUi, fontSize: 12, color: C.muted, lineHeight: 1.7,
        }}>{change.detail}</div>
      )}
    </div>
  )
}

function VersionBlock({ entry, isLatest }) {
  const TAG_STYLE = {
    release: { bg: 'rgba(167,139,250,0.12)', border: 'rgba(167,139,250,0.35)', color: '#a78bfa', label: 'RELEASE' },
    bugfix:  { bg: 'rgba(74,222,128,0.10)',  border: 'rgba(74,222,128,0.3)',   color: '#4ade80', label: 'BUGFIX'  },
    hotfix:  { bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.35)', color: '#f87171', label: 'HOTFIX'  },
    patch:   { bg: 'rgba(251,146,60,0.10)',  border: 'rgba(251,146,60,0.3)',   color: '#fb923c', label: 'PATCH'   },
  }
  const ts = TAG_STYLE[entry.tag] || TAG_STYLE.release
  return (
    <div style={{ marginBottom: 32 }}>
      {/* Version header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        marginBottom: 12, paddingBottom: 12, borderBottom: `1px solid ${C.border}`,
      }}>
        <span style={{
          fontFamily: C.fontMono, fontSize: 18, fontWeight: 800, color: isLatest ? C.cyan : C.purple,
          letterSpacing: 1,
        }}>v{entry.version}</span>
        <span style={{
          fontFamily: C.fontMono, fontSize: 8, letterSpacing: 2, padding: '2px 8px',
          background: ts.bg, border: `1px solid ${ts.border}`, color: ts.color, borderRadius: 4,
        }}>{ts.label}</span>
        {isLatest && (
          <span style={{
            fontFamily: C.fontMono, fontSize: 8, letterSpacing: 2, padding: '2px 8px',
            background: 'rgba(34,211,238,0.12)', border: '1px solid rgba(34,211,238,0.35)',
            color: C.cyan, borderRadius: 4,
          }}>LATEST</span>
        )}
        <span style={{ fontFamily: C.fontMono, fontSize: 10, color: C.muted, marginLeft: 4 }}>{entry.date}</span>
        <span style={{ fontFamily: C.fontUi, fontSize: 13, fontWeight: 600, color: C.text, flex: 1, minWidth: 200 }}>{entry.title}</span>
      </div>
      {/* Summary */}
      <div style={{ fontFamily: C.fontUi, fontSize: 12, color: C.muted, lineHeight: 1.7, marginBottom: 12 }}>{entry.summary}</div>
      {/* Change list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {entry.changes.map((ch, i) => <ChangeItem key={i} change={ch} />)}
      </div>
    </div>
  )
}


function RoadmapPhase({ phase }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12,
        paddingBottom: 8, borderBottom: `1px solid ${C.border}`,
      }}>
        <span style={{ fontSize: 18 }}>{phase.icon}</span>
        <span style={{ fontFamily: C.fontMono, fontSize: 13, fontWeight: 700, color: phase.color, letterSpacing: 1 }}>{phase.phase}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {phase.items.map((item, i) => (
          <div key={i} style={{
            display: 'flex', gap: 10, padding: '10px 14px',
            background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 6,
            alignItems: 'flex-start',
          }}>
            <Badge type={item.type} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: C.fontUi, fontSize: 13, color: C.text, marginBottom: 3 }}>{item.title}</div>
              <div style={{ fontFamily: C.fontUi, fontSize: 11, color: C.muted, lineHeight: 1.6 }}>{item.detail}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

const TabBtn = ({ id, label, active, onSelect }) => (
  <button onClick={onSelect} style={{
    fontFamily: C.fontMono, fontSize: 10, letterSpacing: 2, padding: '9px 18px',
    background: active ? C.purple : 'transparent',
    color: active ? '#000' : C.muted,
    border: 'none', cursor: 'pointer',
    borderBottom: `2px solid ${active ? C.purple : 'transparent'}`,
    transition: 'all 0.15s', fontWeight: active ? 700 : 400,
  }}>{label}</button>
)

/* ─── Main export ─── */
export default function Changelog() {
  const [tab, setTab] = useState('changelog')
  const [search, setSearch] = useState('')

  const filtered = CHANGELOG.map(entry => ({
    ...entry,
    changes: entry.changes.filter(ch =>
      !search ||
      ch.title.toLowerCase().includes(search.toLowerCase()) ||
      ch.area.toLowerCase().includes(search.toLowerCase()) ||
      ch.detail.toLowerCase().includes(search.toLowerCase())
    ),
  })).filter(entry => !search || entry.changes.length > 0 || entry.title.toLowerCase().includes(search.toLowerCase()))

  const totalChanges = CHANGELOG.reduce((n, e) => n + e.changes.length, 0)

  return (
    <div style={{ width: '100%', maxWidth: 900, paddingBottom: 64 }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap')`}</style>

      {/* Page header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontFamily: C.fontMono, fontSize: 9, color: C.cyan, letterSpacing: 4, marginBottom: 6 }}>ADMIN PORTAL</div>
        <h2 style={{ fontFamily: C.fontMono, fontSize: 26, fontWeight: 800, margin: '0 0 8px', color: C.text, letterSpacing: 1 }}>Changelog & Roadmap</h2>
        <div style={{ fontFamily: C.fontUi, fontSize: 12, color: C.muted, lineHeight: 1.7 }}>
          {CHANGELOG.length} versions · {totalChanges} tracked changes · roadmap updated regularly
        </div>
      </div>

      {/* Stat pills */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
        {[
          { label: 'Versions',        value: CHANGELOG.length,   color: C.purple },
          { label: 'Total Changes',   value: totalChanges,       color: C.cyan   },
          { label: 'Roadmap Items',   value: ROADMAP.reduce((n,p)=>n+p.items.length,0), color: C.orange },
          { label: 'Latest Version',  value: `v${CHANGELOG[0].version}`, color: C.green  },
        ].map(s => (
          <div key={s.label} style={{
            padding: '8px 14px', background: C.bg2,
            border: `1px solid ${C.border}`, borderRadius: 8,
            display: 'flex', flexDirection: 'column', gap: 2,
          }}>
            <span style={{ fontFamily: C.fontMono, fontSize: 8, color: C.muted, letterSpacing: 2 }}>{s.label}</span>
            <span style={{ fontFamily: C.fontMono, fontSize: 16, fontWeight: 700, color: s.color }}>{s.value}</span>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}`, marginBottom: 24 }}>
        <TabBtn id="changelog" label="📋 CHANGELOG" active={tab === 'changelog'} onSelect={() => setTab('changelog')} />
        <TabBtn id="roadmap"   label="🗺️ ROADMAP" active={tab === 'roadmap'} onSelect={() => setTab('roadmap')} />
        <TabBtn id="todo"      label="✅ TO-DO" active={tab === 'todo'} onSelect={() => setTab('todo')} />
      </div>

      {/* ── CHANGELOG TAB ── */}
      {tab === 'changelog' && (
        <>
          {/* Search */}
          <div style={{ marginBottom: 20, position: 'relative' }}>
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search changes by title, area, or description…"
              style={{
                width: '100%', boxSizing: 'border-box',
                background: C.bg2, border: `1px solid ${C.border2}`, outline: 'none',
                padding: '9px 12px 9px 34px', fontFamily: C.fontMono, fontSize: 11,
                color: C.text, borderRadius: 6, transition: 'border-color 0.2s',
              }}
              onFocus={e => e.target.style.borderColor = C.purple}
              onBlur={e => e.target.style.borderColor = C.border2}
            />
            <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', fontSize: 13, opacity: 0.4 }}>🔍</span>
            {search && (
              <button onClick={() => setSearch('')} style={{
                position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 15,
              }}>✕</button>
            )}
          </div>
          {/* Version blocks */}
          {filtered.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', fontFamily: C.fontMono, fontSize: 11, color: C.muted }}>
              No changes match &quot;{search}&quot;
            </div>
          ) : (
            filtered.map((entry, i) => <VersionBlock key={entry.version} entry={entry} isLatest={i === 0} />)
          )}
        </>
      )}

      {/* ── ROADMAP TAB ── */}
      {tab === 'roadmap' && (
        <div>
          <div style={{ marginBottom: 20, padding: '12px 16px', background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 8, fontFamily: C.fontUi, fontSize: 12, color: C.muted, lineHeight: 1.7 }}>
            Items here are aspirational and subject to change. Contributions and suggestions are welcome via the Help Desk.
          </div>
          {ROADMAP.map((phase, i) => <RoadmapPhase key={i} phase={phase} />)}
        </div>
      )}

      {/* ── TO-DO TAB ── */}
      {tab === 'todo' && (
        <div>
          <div style={{ marginBottom: 20, padding: '12px 16px', background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.25)', borderRadius: 8, fontFamily: C.fontUi, fontSize: 12, color: C.muted, lineHeight: 1.7 }}>
            Concrete, in-flight tasks that will land in upcoming patch or minor releases.
          </div>
          {[
            { type: 'done',       area: 'Auth / Backend',      title: '#16 — Notification persistence (localStorage + Supabase)', detail: 'Alerts rehydrate from localStorage on mount; Supabase Realtime pushes new admin_notifications rows instantly. Shipped v1.12.0.' },
            { type: 'done',       area: 'SiteSettings',        title: 'Full auto-save (no SAVE button)',               detail: 'Text inputs debounce 800ms; toggles & pickers save instantly. Status chip replaces button.' },
            { type: 'done',       area: 'ThemeLibrary',        title: 'Notification position picker',                  detail: 'top/center/bottom + left/center/right — saves live, updates NotifyProvider instantly.' },
            { type: 'done',       area: 'Auth',                title: '2FA for admin & staff accounts',               detail: 'TOTP setup/disable in My Profile, TwoFAStep challenge on login. Shipped v1.6.0.' },
            { type: 'done',       area: 'ThemeLibrary',        title: 'Follow OS Theme toggle',                        detail: 'Auto-switches visitor theme with system dark/light preference. Shipped v1.6.0.' },
            { type: 'done',       area: 'Auth — Login.jsx',    title: '#3 — Login rate limiting / lockout',            detail: 'After 3 fails: exponential backoff 2s→4s→8s with countdown timer before next attempt. Shipped v1.9.0.' },
            { type: 'done',       area: 'Dashboard.jsx',       title: '#8 — Bulk contact reply + 4 templates',         detail: 'BULK REPLY modal with {{name}} substitution per contact. Shipped v1.12.0.' },
            { type: 'done',       area: 'AdminPanels.jsx',     title: '#13 — Newsletter subscriber mgmt + broadcast',  detail: 'Subscriber table, CSV export, broadcast modal with EDIT/PREVIEW toggle + SEND TO N. Shipped v1.12.0.' },
            { type: 'done',       area: 'providers.tsx',       title: '#14 — RoamingRobot on all public pages',         detail: 'Mounted in providers.tsx, hidden admin/fullscreen, respects showRoamingRobot toggle. Shipped v1.12.0.' },
            { type: 'done',       area: 'PostEditor',          title: '#9 — Draft autosave',                           detail: '30s debounce autosave on every content change. Toolbar shows "Saving…" → "Saved X ago" → "Error". Only triggers for existing posts (has an id). Shipped v1.13.0.' },
            { type: 'done',       area: 'PostEditor',          title: '#7 — Scheduled publishing',                     detail: 'datetime-local input in publish sidebar. When a future date is set a ?? SCHEDULED badge + SCHEDULE button appear. publish_at sent to backend as ISO string. Shipped v1.13.0.' },
            { type: 'done',       area: 'MediaLibrary',        title: '#10 — Drag-and-drop multi-upload',              detail: 'Drop zone + file input both call shared uploadFiles(). POST /upload/multiple with FormData. Green dashed border on dragover. Multi-file, filtered by type. Shipped v1.13.0.' },
            { type: 'done',       area: 'Blog.jsx',            title: '#11 — Blog search + tag/category filter',       detail: 'Search input + tag chip bar. Shipped v1.11.1.' },
            { type: 'done',       area: 'Dashboard / Sidebar', title: '#18 — Dev Tools outside admin portal',           detail: 'SEO Tools, Network Tools and File Tools are standalone /tools/* routes only. Admin sidebar embedding was removed in v1.15.0.' },
            { type: 'done',       area: 'Auth — Backend',      title: '#1 — HttpOnly admin_session cookie',            detail: 'Set from FastAPI on login. Client-side JS cookie write removed from Login.jsx. Shipped v1.9.0.' },
            { type: 'done',       area: 'Auth — Backend',      title: '#2 — HttpOnly refresh_token cookie',            detail: 'Moved from localStorage to HttpOnly backend cookie. /auth/refresh reads from cookie. saveTokens() ignores refreshToken. Shipped v1.9.0.' },
            { type: 'done',       area: 'Admin — Profile',     title: '#4 — Active session management',                detail: 'IP, user-agent, login time per session. Individual revoke + "revoke all others". Shipped v1.9.0.' },
            { type: 'done',       area: 'AuditPanel',          title: '#5 — Auth login activity log',                  detail: 'Auth Log tab: every login attempt — username, IP, timestamp, success/fail, user-agent. Shipped v1.9.0.' },
            { type: 'done',       area: 'BlogPost.jsx',        title: '#12 — Read progress bar + read time',           detail: '2px fixed progress bar at top. "X min read" from word count ÷ 200wpm. Shipped v1.11.0.' },
            { type: 'done',       area: 'PostEditor',          title: '#15 — OG / social share preview in editor',     detail: 'Live OG card in editor sidebar using current title, description, and cover image. Shipped v1.11.0.' },
            { type: 'done',       area: 'Forum / Push API',    title: '#17 — Web Push to forum users',                 detail: '🔔 ENABLE NOTIFICATIONS button in NotificationBell. subscribeToPush() handles permission + PushManager + backend POST. Shipped v1.11.0.' },
            { type: 'done',       area: 'DatabaseGUI',         title: '#19 — Read-only mode for editor/moderator',     detail: 'getRole() check hides write/execute UI for non-admin staff. READ-ONLY banner shown. Shipped v1.11.0.' },
            { type: 'done',       area: 'next.config.js',      title: '#20 — next/image for CDN (WebP + responsive)',  detail: 'cdn.aifazi.net added to remotePatterns. Blog + BlogPost use <Image> with fill layout + sizes. Shipped v1.11.0.' },
            { type: 'done',       area: 'vercel.json',         title: '#21 — Audit Vercel rewrites for bypass risk',   detail: 'All /api/* rewrites confirmed in next.config.js. $security_note warning added to vercel.json. Shipped v1.10.0.' },
            { type: 'done',       area: 'Admin Panel',         title: '#22 — ErrorBoundary around every panel',        detail: 'PanelErrorBoundary wraps all 13 admin panels — PANEL CRASHED card + ↺ RELOAD PANEL button. Shipped v1.10.0.' },
          ].map((item, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, padding: '10px 14px', marginBottom: 6, background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 6, alignItems: 'flex-start' }}>
              <Badge type={item.type} />
              <AreaTag label={item.area} />
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: C.fontUi, fontSize: 13, color: C.text, marginBottom: 2 }}>{item.title}</div>
                <div style={{ fontFamily: C.fontUi, fontSize: 11, color: C.muted, lineHeight: 1.6 }}>{item.detail}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
