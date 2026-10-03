/**
 * First-pass theme sync decision (A5-8): the DOM stamp wins over the stale
 * SSR-default state, and the stale value is never applied or persisted.
 */
import { describe, expect, it } from 'vitest'
import { firstThemeSyncAction } from './themeSync'

describe('firstThemeSyncAction (A5-8)', () => {
  it('matches when the DOM stamp equals the state expectation', () => {
    expect(firstThemeSyncAction('slate-dark', 'slate-dark')).toEqual({ action: 'match' })
    expect(firstThemeSyncAction(null, 'cyber-dark')).toEqual({ action: 'match' })
  })

  it('adopts a valid DOM theme that differs from the stale state', () => {
    // FOUC script stamped the user's stored choice; state is still the SSR default.
    expect(firstThemeSyncAction('slate-dark', 'cyber-dark')).toEqual({ action: 'adopt-dom', theme: 'slate-dark' })
    // SSR stamped the global default; state still holds the build-time default.
    expect(firstThemeSyncAction('pacman', 'cyber-dark')).toEqual({ action: 'adopt-dom', theme: 'pacman' })
  })

  it('falls back to applying state when the DOM stamp is missing', () => {
    expect(firstThemeSyncAction(null, 'slate-dark')).toEqual({ action: 'apply-state' })
  })

  it('falls back to applying state when the DOM stamp is not a valid theme', () => {
    // Legacy 'dark' alias used to be written to storage by old clients.
    expect(firstThemeSyncAction('dark', 'cyber-dark')).toEqual({ action: 'apply-state' })
    expect(firstThemeSyncAction('not-a-theme', 'slate-dark')).toEqual({ action: 'apply-state' })
  })

  it('falls back when the DOM literally spells cyber-dark (attribute should be absent)', () => {
    expect(firstThemeSyncAction('cyber-dark', 'cyber-dark')).toEqual({ action: 'apply-state' })
  })
})
