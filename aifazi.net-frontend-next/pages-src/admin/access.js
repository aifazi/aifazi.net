'use client'
import { isAdmin as checkIsAdmin, getRole, hasPermission } from '@/lib/api'

/**
 * access.js — role-based section access for the admin dashboard.
 *
 * Every sidebar item, search result, quick-action card, and panel render
 * goes through canViewKey(). Unknown views fail closed (admin-only).
 * Effective access = stored per-account grants UNION role preset fallback
 * (mirrors backend resolve_staff_access: role presets apply until the
 * per-account staff_permissions row hydrates from /auth/verify).
 */

// View key (and every alias view) -> backend permission module(s).
export const NAV_PERMISSION = {
  home: 'home',
  posts: 'content.posts', editor: 'content.editor', media: 'content.media',
  pages: 'content.pages', themes: 'content.themes', theme: 'content.themes',
  framework: 'content.themes', 'content-blocks': 'content.pages',
  'page-builder': 'content.pages',
  content: ['content.posts', 'content.editor', 'community.forum'],
  communications: ['community.contacts', 'community.newsletter'],
  contacts: 'community.contacts', newsletter: 'community.newsletter',
  staff: 'community.staff', forum: 'community.forum',
  chat: 'community.chat', 'chat-admin': 'community.chat',
  db: 'system.db', stats: 'system.db', audit: 'system.audit', backup: 'system.backup',
  delivery: ['system.mail', 'system.cdn'], mail: 'system.mail', cdn: 'system.cdn',
  announcements: 'system.announcements', settings: 'system.settings', siteSettings: 'system.settings',
  helpdesk: 'support.helpdesk', store: 'store', fivem: 'fivem.status',
  changelog: 'changelog', monitoring: 'system.monitor', vpn: 'system.vpn',
}

// Mirrors backend ROLE_PERMISSION_PRESETS (permissions.py). Fallback only —
/// stored per-account grants (hasPermission) always win when present.
const ROLE_FALLBACK = {
  moderator: {
    home: ['view'], 'community.forum': ['view', 'edit', 'delete', 'manage'],
    'community.chat': ['view', 'edit', 'delete', 'manage'], 'support.helpdesk': ['view', 'edit'],
    'content.media': ['view', 'create', 'edit', 'delete'],
    'store.products': ['view', 'edit'], 'store.categories': ['view', 'edit'],
    'store.customers': ['view'], 'store.orders': ['view', 'edit', 'manage'],
    'store.reviews': ['view', 'edit'], 'store.delivery': ['view', 'edit'],
    'fivem.status': ['view'], 'fivem.whitelist': ['view', 'approve', 'sync'],
    'fivem.forms': ['view', 'approve'], 'fivem.approval_log': ['view'],
    'fivem.bans': ['view', 'create', 'edit'], 'system.monitor': ['view'],
    'system.vpn': ['view'], profile: ['view', 'edit'], changelog: ['view'],
  },
  editor: {
    home: ['view'], 'content.posts': ['view', 'create', 'edit', 'delete'],
    'content.editor': ['view', 'create', 'edit'], 'content.media': ['view', 'create', 'edit', 'delete'],
    'content.pages': ['view', 'edit'], 'content.themes': ['view', 'edit'],
    'system.announcements': ['view', 'create', 'edit', 'delete'],
    profile: ['view', 'edit'], changelog: ['view'],
  },
  chat: {
    'community.chat': ['view', 'create', 'edit'], profile: ['view', 'edit'],
  },
}

function presetAllows(role, module, action = 'view') {
  const preset = (role && ROLE_FALLBACK[role]) || null
  if (!preset) return false
  const acts = new Set([...(preset[module] || []), ...(preset['*'] || [])])
  return acts.has('manage') || acts.has(action)
}

export function canViewModule(module, action = 'view') {
  if (checkIsAdmin()) return true
  if (hasPermission(module, action)) return true
  return presetAllows(getRole(), module, action)
}

/** Can the current user open the given nav key? Unknown keys fail closed. */
export function canViewKey(key) {
  const modules = NAV_PERMISSION[key]
  if (!modules) return checkIsAdmin()
  return (Array.isArray(modules) ? modules : [modules]).some((m) => canViewModule(m, 'view'))
}

/** Resolve an alias view (mail, audit, backup…) to its sidebar item key. */
export function resolveNavKey(view, navItems) {
  const item = (navItems || []).find((n) => n.key === view || n.aliases?.includes(view))
  return item ? item.key : null
}

/** canViewKey for any view value (keys and aliases alike). */
export function canView(view, navItems) {
  return canViewKey(resolveNavKey(view, navItems) ?? view)
}

/** First sidebar key the user may open (landing view after login). */
export function firstPermittedKey(navItems) {
  return (navItems || []).find((n) => canViewKey(n.key))?.key ?? null
}
