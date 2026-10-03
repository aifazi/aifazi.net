/**
 * core/themeSync.ts — pure decision for the first [theme] sync pass (A5-8).
 *
 * Before hydration, the SSR <html> attribute and the inline FOUC script may
 * have stamped a fresher `data-theme` on <html> than React's theme state,
 * which still holds the SSR default from initTheme. The first sync must not
 * clobber that DOM stamp — or the user's stored choice behind it — with the
 * stale state value; and it must not persist the stale value to storage.
 */
import { VALID_THEMES } from '@/core/themeCatalog'

export type FirstThemeSyncAction =
  | { action: 'match' }
  | { action: 'adopt-dom'; theme: string }
  | { action: 'apply-state' }

export function firstThemeSyncAction(domTheme: string | null, stateTheme: string): FirstThemeSyncAction {
  const expected = stateTheme === 'cyber-dark' ? null : stateTheme
  if (domTheme === expected) return { action: 'match' }
  if (domTheme && VALID_THEMES.includes(domTheme) && domTheme !== stateTheme) {
    return { action: 'adopt-dom', theme: domTheme }
  }
  return { action: 'apply-state' }
}
