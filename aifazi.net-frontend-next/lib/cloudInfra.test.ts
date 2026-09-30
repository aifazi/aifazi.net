/**
 * Seed validity for built-in case studies (Plan C cloud + Plan A registry).
 * Guarantees the seeds render and would survive backend validation caps.
 */
import { describe, expect, it } from 'vitest'
import { cloudInfraDoc, BUILTIN_STUDIES } from '@/data/cloud-infra'
import { drSiteDoc, hybridJoinDoc, multiSiteDoc } from '@/data/infra-templates'
import { planADoc, sanitizeDoc, type DiagramDoc } from '@/data/hybrid-infra'

describe('cloud-infra seed', () => {
  it('passes sanitizeDoc unchanged in shape', () => {
    const clean = sanitizeDoc(cloudInfraDoc())
    expect(clean).not.toBeNull()
    expect(clean!.slug).toBe('cloud-infra')
    expect(clean!.nodes.length).toBeGreaterThan(10)
  })

  it('flows reference existing distinct nodes', () => {
    const doc = cloudInfraDoc()
    const ids = new Set(doc.nodes.map((n) => n.id))
    for (const f of doc.flows) {
      expect(ids.has(f.from)).toBe(true)
      expect(ids.has(f.to)).toBe(true)
      expect(f.from).not.toBe(f.to)
    }
  })

  it('stays within backend validation caps', () => {
    const doc = cloudInfraDoc()
    expect(doc.nodes.length).toBeLessThanOrEqual(200)
    expect(doc.flows.length).toBeLessThanOrEqual(200)
    for (const n of doc.nodes) {
      expect(n.name.length).toBeLessThanOrEqual(80)
      expect(n.desc.length).toBeLessThanOrEqual(2000)
      expect(n.workloads.length).toBeLessThanOrEqual(12)
      expect(n.deps.length).toBeLessThanOrEqual(24)
    }
  })

  it('plan-a seed still valid (registry intact)', () => {
    expect(sanitizeDoc(planADoc())?.slug).toBe('plan-a')
  })

  it('library registry covers all built-in seeds', () => {
    expect(BUILTIN_STUDIES.map((s) => s.slug).sort()).toEqual([
      'cloud-infra',
      'dr-site',
      'hybrid-join',
      'multi-site',
      'plan-a',
    ])
  })
})

describe('architecture templates (plan B3)', () => {
  const cases: [string, () => DiagramDoc][] = [
    ['multi-site', multiSiteDoc],
    ['dr-site', drSiteDoc],
    ['hybrid-join', hybridJoinDoc],
  ]

  it.each(cases)('%s is a valid reserved-slug seed', (slug, factory) => {
    const doc = factory()
    expect(doc.slug).toBe(slug)
    const clean = sanitizeDoc(doc)
    expect(clean).not.toBeNull()
    expect(clean!.nodes.length).toBeGreaterThanOrEqual(10)
    const ids = new Set(clean!.nodes.map((n) => n.id))
    for (const f of doc.flows) {
      expect(ids.has(f.from)).toBe(true)
      expect(ids.has(f.to)).toBe(true)
      expect(f.from).not.toBe(f.to)
    }
    for (const n of doc.nodes) {
      for (const d of n.deps) expect(ids.has(d)).toBe(true)
      expect(n.name.length).toBeLessThanOrEqual(80)
      expect(n.workloads.length).toBeLessThanOrEqual(12)
    }
    expect(doc.nodes.length).toBeLessThanOrEqual(200)
    expect(doc.flows.length).toBeLessThanOrEqual(200)
  })
})
