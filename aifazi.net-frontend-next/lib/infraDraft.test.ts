/**
 * N12: draft payload encoding — base64 round-trip, legacy plaintext
 * fallback, and obscurity (no raw doc text in the encoded form).
 */
import { describe, expect, it } from 'vitest'
import { decodeDraftPayload, encodeDraftPayload } from '@/lib/infraDraft'

const doc = {
  slug: 'backup-ring',
  title: 'Backup ring',
  notes: 'failover order: A → B → C (rotates 🌙 weekly)',
}

describe('encodeDraftPayload', () => {
  it('encodes to the base64 of the JSON payload', () => {
    const bytes = new TextEncoder().encode(JSON.stringify(doc))
    let bin = ''
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
    expect(encodeDraftPayload(doc)).toBe(btoa(bin))
  })

  it('does not embed the raw plaintext payload', () => {
    const encoded = encodeDraftPayload(doc)
    expect(encoded).not.toContain('failover order')
    expect(encoded).not.toContain('{"slug"')
  })

  it('round-trips Unicode notes through decode', () => {
    const round = decodeDraftPayload(encodeDraftPayload(doc))
    expect(round).toBe(JSON.stringify(doc))
  })
})

describe('decodeDraftPayload', () => {
  it('returns legacy plaintext JSON as-is (drafts written pre-N12)', () => {
    const legacy = JSON.stringify({ doc, at: '2026-10-01T00:00:00Z' })
    expect(decodeDraftPayload(legacy)).toBe(legacy)
  })

  it('decodes base64 payloads written after N12', () => {
    expect(decodeDraftPayload(encodeDraftPayload({ doc, at: 'x' }))).toBe(
      JSON.stringify({ doc, at: 'x' }),
    )
  })

  it('returns null for garbage that is neither JSON nor base64', () => {
    expect(decodeDraftPayload('not a payload @@@')).toBeNull()
  })
})
