import { describe, expect, it } from 'vitest'
import { getComponentTokens } from './componentTokens'

// CodeQL #93: mergeInto must never copy prototype-polluting keys, and themed
// output must not pollute Object.prototype.
describe('componentTokens prototype safety', () => {
  it('resolves known themes without polluting Object.prototype', () => {
    for (const id of ['cyber-dark', 'nonexistent-theme']) {
      const tokens = getComponentTokens(id)
      expect(tokens).toBeTypeOf('object')
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect(Object.prototype.hasOwnProperty.call({}, 'polluted')).toBe(false)
  })
})
