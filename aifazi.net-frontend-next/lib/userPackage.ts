/**
 * lib/userPackage.ts — Per-user theme package overrides (localStorage only).
 * Non-admin users can apply a Theme Package (e.g. Holo Deck / Phosphor CRT)
 * for their own browser session without touching the site-wide admin settings.
 */

export interface UserPackageState {
  id: string
  settings: Record<string, any>
}

const KEY = 'user-package'

export function getUserPackage(): UserPackageState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.id || typeof parsed.settings !== 'object' || Array.isArray(parsed.settings)) return null
    return { id: parsed.id, settings: parsed.settings }
  } catch {
    return null
  }
}

export function setUserPackage(pkg: UserPackageState) {
  if (typeof window === 'undefined') return
  localStorage.setItem(KEY, JSON.stringify(pkg))
}

export function clearUserPackage() {
  if (typeof window === 'undefined') return
  localStorage.removeItem(KEY)
}

export function getUserPackageStyle(key: string): string | undefined {
  return getUserPackage()?.settings?.[key]
}
