/**
 * staffAccess helpers: grouping, preset math, toggle semantics, guards.
 */
import { describe, expect, it } from 'vitest'
import {
  addedBeyondPreset,
  canChangeRole,
  canRemoveAccess,
  countAdmins,
  effectivePermissions,
  groupModules,
  isPresetGranted,
  presetFor,
  summarizePermissions,
  togglePermission,
} from '@/lib/staffAccess'

const PRESETS = {
  moderator: { 'community.forum': ['view', 'edit'], 'store.orders': ['view'] },
  editor: { 'content.posts': ['view', 'create'] },
}

describe('groupModules', () => {
  it('groups by prefix, singles go to General first', () => {
    const groups = groupModules({
      home: 'Dashboard',
      profile: 'My profile',
      'store.orders': 'Store orders',
      'store.products': 'Store products',
      'fivem.bans': 'FiveM bans',
    })
    expect(groups[0].id).toBe('general')
    expect(groups[0].items.map((i) => i.id).sort()).toEqual(['home', 'profile'])
    expect(groups.map((g) => g.id)).toEqual(['general', 'fivem', 'store'])
    expect(groups[2].items.map((i) => i.id)).toEqual(['store.orders', 'store.products'])
  })
})

describe('preset math', () => {
  it('presetFor is case-insensitive and safe on unknown roles', () => {
    expect(presetFor('Moderator', PRESETS)).toEqual(PRESETS.moderator)
    expect(presetFor('member', PRESETS)).toEqual({})
    expect(presetFor(undefined, PRESETS)).toEqual({})
  })

  it('isPresetGranted only matches exact preset cells', () => {
    expect(isPresetGranted('community.forum', 'edit', 'moderator', PRESETS)).toBe(true)
    expect(isPresetGranted('community.forum', 'delete', 'moderator', PRESETS)).toBe(false)
    expect(isPresetGranted('store.orders', 'view', 'editor', PRESETS)).toBe(false)
  })

  it('addedBeyondPreset strips preset-covered grants', () => {
    expect(
      addedBeyondPreset(
        'moderator',
        { 'community.forum': ['view', 'delete'], 'store.orders': ['view'] },
        PRESETS,
      ),
    ).toEqual({ 'community.forum': ['delete'] })
  })

  it('togglePermission adds, removes, prunes empties, locks preset cells', () => {
    const base = { 'store.orders': ['edit'] }
    const added = togglePermission(base, 'store.orders', 'delete', 'moderator', PRESETS)
    expect(added).toEqual({ 'store.orders': ['delete', 'edit'] })
    expect(base).toEqual({ 'store.orders': ['edit'] }) // immutable
    const removed = togglePermission(added, 'store.orders', 'delete', 'moderator', PRESETS)
    expect(removed).toEqual({ 'store.orders': ['edit'] })
    const pruned = togglePermission({ 'store.orders': ['edit'] }, 'store.orders', 'edit', 'editor', PRESETS)
    expect(pruned).toEqual({})
    // preset-granted cell: no-op
    const locked = togglePermission({}, 'community.forum', 'edit', 'moderator', PRESETS)
    expect(locked).toEqual({})
  })

  it('effectivePermissions unions preset and overrides, sorted', () => {
    expect(
      effectivePermissions('moderator', { 'community.forum': ['delete'], 'store.orders': ['view'] }, PRESETS),
    ).toEqual({
      'community.forum': ['delete', 'edit', 'view'],
      'store.orders': ['view'],
    })
    expect(effectivePermissions('member', undefined, PRESETS)).toEqual({})
  })

  it('summarizePermissions counts modules and manages', () => {    expect(summarizePermissions(undefined)).toBe('no module access')
    expect(summarizePermissions({})).toBe('no module access')
    expect(summarizePermissions({ a: ['view'] })).toBe('1 module')
    expect(summarizePermissions({ a: ['manage'], b: ['view'], c: ['manage'] })).toBe(
      '3 modules · manage ×2',
    )
  })
})

describe('guards', () => {
  const staff = [{ role: 'admin' }, { role: 'moderator' }]

  it('countAdmins counts case-insensitively', () => {
    expect(countAdmins(staff)).toBe(1)
    expect(countAdmins([{ role: 'Admin' }, { role: 'ADMIN' }])).toBe(2)
  })

  it('blocks self changes', () => {
    expect(canChangeRole('Root', 'root', 'admin', 'moderator', 2)).toEqual({
      ok: false,
      reason: 'You cannot change your own role.',
    })
    expect(canRemoveAccess('mod', 'MOD', 'moderator', 1).ok).toBe(false)
  })

  it('blocks last-admin demotion but allows the rest', () => {
    expect(canChangeRole('root', 'other', 'admin', 'moderator', 1).ok).toBe(false)
    expect(canChangeRole('root', 'other', 'admin', 'moderator', 2).ok).toBe(true)
    expect(canChangeRole('root', 'other', 'admin', 'admin', 1).ok).toBe(true)
    expect(canChangeRole('mod', 'other', 'moderator', 'editor', 1).ok).toBe(true)
    expect(canRemoveAccess('root', 'other', 'admin', 1).ok).toBe(false)
  })
})
