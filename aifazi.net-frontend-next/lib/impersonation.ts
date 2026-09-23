/**
 * lib/impersonation.ts — shared exit-impersonation routine ("view as").
 *
 * Extracted from pages-src/admin/Dashboard.jsx so EVERY entry point (the
 * global banner Exit button, the impersonation:expired handler) runs the same
 * restore: audited server exit → drop memory token → restore the admin
 * snapshot → re-hydrate access → reload as admin.
 */
import api, { setImpersonationToken, setEffectiveAccess } from './api'
import { notify } from '../core/notify'

/** sessionStorage key holding the pre-impersonation admin claims snapshot. */
export const IMPERSONATE_SNAPSHOT_KEY = 'aifazi_pre_impersonate'

let _exiting: Promise<void> | null = null

function failNotice(message: string, title: string) {
  try {
    notify.error(message, { title } as Record<string, unknown>)
  } catch { /* toast system unavailable — redirect below still runs */ }
}

/**
 * Exit a view-as session and restore the admin session.
 *
 * @param expired  true when the short-lived token already expired (skip the
 *                 audited server exit — it would 401 — and toast accordingly).
 * @returns a shared promise so double-clicks / duplicate handlers run once.
 */
export function exitImpersonation(opts?: { expired?: boolean }): Promise<void> {
  if (_exiting) return _exiting
  _exiting = (async () => {
    const expired = !!opts?.expired
    if (typeof window === 'undefined') return
    // Tell the server first (still holding the impersonated token) so the
    // exit is audited, then drop the memory token and reload as admin.
    if (!expired) {
      try { await api.post('/auth/staff/unimpersonate', {}) } catch { /* already out — restore locally */ }
    }
    setImpersonationToken(null)
    try {
      const raw = sessionStorage.getItem(IMPERSONATE_SNAPSHOT_KEY)
      if (raw) {
        const prev = JSON.parse(raw) as Record<string, string | null>
        if (prev.role) localStorage.setItem('aifazi_effective_role', prev.role)
        if (prev.username) localStorage.setItem('aifazi_username', prev.username)
        if (prev.permissions) localStorage.setItem('aifazi_permissions', prev.permissions)
        else localStorage.removeItem('aifazi_permissions')
      }
      sessionStorage.removeItem(IMPERSONATE_SNAPSHOT_KEY)
    } catch { /* corrupted snapshot — fall through to /auth/me re-hydration */ }
    try {
      const v = await api.get('/auth/me')
      setEffectiveAccess(v.data?.user)
    } catch {
      failNotice('Session restore failed — please sign in again', 'Impersonation ended')
      window.location.assign('/login?next=/admin')
      return
    }
    if (expired) {
      failNotice('View-as session expired — you are back to your admin session', 'Impersonation ended')
    }
    window.location.reload()
  })().finally(() => { _exiting = null })
  return _exiting
}
