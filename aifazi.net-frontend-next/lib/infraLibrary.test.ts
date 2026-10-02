/**
 * Library palette invariants: unique keys, valid categories/shapes/sizes,
 * and stamping rules (data-only PR C).
 */
import { describe, expect, it } from 'vitest'
import { INFRA_LIBRARY, stampFromLibrary, type LibraryItem } from '@/data/infra-library'
import { CATEGORY_META } from '@/data/hybrid-infra'

const BUILTIN = Object.keys(CATEGORY_META)
const allItems: LibraryItem[] = INFRA_LIBRARY.flatMap((g) => g.items)

describe('INFRA_LIBRARY structure', () => {
  it('has 1..12 non-empty groups with unique ids and titles', () => {
    expect(INFRA_LIBRARY.length).toBeGreaterThanOrEqual(1)
    expect(INFRA_LIBRARY.length).toBeLessThanOrEqual(12)
    expect(new Set(INFRA_LIBRARY.map((g) => g.id)).size).toBe(INFRA_LIBRARY.length)
    expect(new Set(INFRA_LIBRARY.map((g) => g.title)).size).toBe(INFRA_LIBRARY.length)
    for (const g of INFRA_LIBRARY) expect(g.items.length).toBeGreaterThan(0)
  })

  it('ships 50..80 items (the palette targets ~55)', () => {
    expect(allItems.length).toBeGreaterThanOrEqual(50)
    expect(allItems.length).toBeLessThanOrEqual(80)
  })

  it('has unique, prefixed keys under the 40-char cap', () => {
    const keys = allItems.map((i) => i.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const k of keys) {
      expect(k.startsWith('tpl-')).toBe(true)
      expect(k.length).toBeLessThanOrEqual(40)
    }
  })
})

describe('INFRA_LIBRARY item fields', () => {
  it('uses builtin categories (sanitizeDoc resets anything else)', () => {
    for (const i of allItems) expect(BUILTIN).toContain(i.category)
  })

  it('uses valid layer/shape combos', () => {
    for (const i of allItems) {
      expect(['edge', 'cloud', 'rack', 'vm', 'users', 'legacy']).toContain(i.layer)
      expect(['chip', 'cloud', 'firewall']).toContain(i.shape)
      if (i.layer === 'rack') expect(i.rackH).toBeGreaterThanOrEqual(1)
      if (i.rackH !== undefined) expect(i.layer).toBe('rack')
      expect(i.rackH ?? 1).toBeLessThanOrEqual(8)
    }
  })

  it('keeps text within renderer caps', () => {
    for (const i of allItems) {
      expect(i.name.length).toBeGreaterThan(0)
      expect(i.name.length).toBeLessThanOrEqual(40)
      expect(i.role.length).toBeGreaterThan(0)
      expect(i.role.length).toBeLessThanOrEqual(60)
      expect(i.desc.length).toBeGreaterThan(0)
      expect(i.desc.length).toBeLessThanOrEqual(220)
      expect(i.workloads.length).toBeGreaterThanOrEqual(1)
      expect(i.workloads.length).toBeLessThanOrEqual(12)
      for (const w of i.workloads) {
        expect(w.length).toBeGreaterThan(0)
        expect(w.length).toBeLessThanOrEqual(32)
      }
    }
  })

  it('keeps default sizes within canvas bounds', () => {
    for (const i of allItems) {
      expect(i.defaultW).toBeGreaterThanOrEqual(60)
      expect(i.defaultW).toBeLessThanOrEqual(500)
      expect(i.defaultH).toBeGreaterThanOrEqual(30)
      expect(i.defaultH).toBeLessThanOrEqual(300)
    }
  })
})

describe('stampFromLibrary', () => {
  it('stamps free nodes centered at the drop point', () => {
    const item = allItems.find((i) => i.layer !== 'rack')!
    const node = stampFromLibrary(item, { x: 400, y: 300 }, 7)
    expect(node.id.startsWith(item.key.replace(/^tpl-/, ''))).toBe(true)
    expect(node.layer).toBe('cloud')
    expect(node.w).toBe(item.defaultW)
    expect(node.h).toBe(item.defaultH)
    expect(node.x).toBe(Math.round(400 - item.defaultW / 2))
    expect(node.y).toBe(Math.round(300 - item.defaultH / 2))
    expect(node.workloads).toEqual(item.workloads)
    expect(node.workloads).not.toBe(item.workloads) // cloned, not shared
    expect(node.deps).toEqual([])
  })

  it('stamps rack templates as rackU/rackH without free coordinates', () => {
    const item = allItems.find((i) => i.layer === 'rack')!
    const node = stampFromLibrary(item, { x: 100, y: 100 }, 1)
    expect(node.layer).toBe('rack')
    expect(node.rackU).toBe(1)
    expect(node.rackH).toBe(item.rackH)
    expect('x' in node).toBe(false)
    expect('w' in node).toBe(false)
  })

  it('produces a unique id per key', () => {
    const ids = allItems.map((i, n) => stampFromLibrary(i, { x: 0, y: 0 }, n).id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
