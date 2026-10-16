/**
 * lib/css-sanitize.ts — theme CSS injection hardening (R9-12).
 * Run: npm test  (vitest)
 */
import { describe, expect, it } from 'vitest'
import { sanitizeCssForStyleTag } from './css-sanitize'

describe('sanitizeCssForStyleTag', () => {
  it('strips url( from ordinary rules', () => {
    const out = sanitizeCssForStyleTag('.x{background:url(https://evil.test/beacon)}')
    expect(out).not.toContain('url(')
  })

  it('strips @import, expression(, behaviour: and javascript:', () => {
    const out = sanitizeCssForStyleTag(
      '@import url(x);.a{width:expression(alert(1))}.b{behavior:url(#x)}.c{color:javascript:alert(1)}')
    expect(out).not.toMatch(/@import/i)
    expect(out).not.toMatch(/expression\s*\(/i)
    expect(out).not.toMatch(/behaviou?r\s*:/i)
    expect(out).not.toMatch(/javascript\s*:/i)
  })

  it('preserves a trusted uploaded-font @font-face (https + format)', () => {
    const css = "@font-face{font-family:'Neon';src:url('https://cdn.aifazi.net/f.woff2') format('woff2');font-display:swap;}"
    const out = sanitizeCssForStyleTag(css)
    expect(out).toBe(css)
  })

  it('preserves a trusted localhost font @font-face', () => {
    const css = "@font-face{font-family:'Dev';src:url('http://localhost:3000/f.woff2') format('woff2');}"
    expect(sanitizeCssForStyleTag(css)).toBe(css)
  })

  it('strips url( from an @font-face without an explicit format()', () => {
    const out = sanitizeCssForStyleTag("@font-face{src:url('https://evil.test/x')}")
    expect(out).not.toContain('url(')
  })

  it('strips url( from a non-http(s) @font-face src', () => {
    const out = sanitizeCssForStyleTag("@font-face{src:url('data:font/woff2;base64,AAAA') format('woff2')}")
    expect(out).not.toContain('url(')
  })

  it('still strips a non-font url( next to a preserved @font-face', () => {
    const css = "@font-face{font-family:'N';src:url('https://cdn.aifazi.net/f.woff2') format('woff2');}.b{background:url(https://evil.test/beacon)}"
    const out = sanitizeCssForStyleTag(css)
    expect(out).toContain("@font-face{font-family:'N';src:url('https://cdn.aifazi.net/f.woff2') format('woff2');}")
    // the url( *function* is removed from the ordinary rule (text remains inert)
    expect(out).not.toContain('background:url(')
  })
})
