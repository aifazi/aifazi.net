/**
 * XSS corpus for lib/sanitizeHtml.ts (server scrubber + DOMPurify client path).
 * Run: npm test  (vitest)
 */
import { describe, expect, it } from 'vitest'
import { sanitizeHtml } from './sanitizeHtml'

// Force the server scrubber: vitest node env has no window by default.
const server = (html: string, cfg?: Record<string, unknown>) => sanitizeHtml(html, cfg)

describe('sanitizeHtml — server scrubber (SSR / fail-closed)', () => {
  it('passes inert markup', () => {
    const html = '<p class="ok">Hello <strong>world</strong></p>'
    expect(server(html)).toBe(html)
  })

  it('drops script tags (contents stay inert text)', () => {
    const out = server('<p>a</p><script>alert(1)</script><p>b</p>')
    expect(out).not.toContain('<script')
    expect(out).not.toContain('alert(1)</script>')
  })

  it('drops iframe/object/embed', () => {
    const out = server('<iframe src="https://evil"></iframe><object data="x"></object><embed src="y">')
    expect(out.toLowerCase()).not.toContain('<iframe')
    expect(out.toLowerCase()).not.toContain('<object')
    expect(out.toLowerCase()).not.toContain('<embed')
  })

  it('strips on* event handlers', () => {
    const out = server('<img src="https://ok/x.png" onerror="alert(1)" onError="alert(2)">')
    expect(out).not.toMatch(/onerror/i)
    expect(out).toContain('src="https://ok/x.png"')
  })

  it('blocks javascript: URLs', () => {
    const out = server('<a href="javascript:alert(1)">x</a>')
    expect(out).not.toMatch(/javascript:/i)
    expect(out).toContain('x</a>')
  })

  it('blocks javascript: after entity decode / whitespace strip', () => {
    const out = server('<a href="jav&#x0A;ascript:alert(1)">x</a>')
    expect(out).not.toMatch(/script:/i)
  })

  it('blocks data:text/html and data:image/svg+xml', () => {
    const out = server(
      '<a href="data:text/html,<script>alert(1)</script>">a</a>' +
      '<img src="data:image/svg+xml;base64,PHN2Zz4=">',
    )
    expect(out).not.toContain('data:text/html')
    expect(out).not.toContain('data:image/svg+xml')
  })

  it('allows raster data: images', () => {
    const out = server('<img src="data:image/png;base64,iVBORw0KGgo=">')
    expect(out).toContain('data:image/png;base64,iVBORw0KGgo=')
  })

  it('drops srcdoc always', () => {
    const out = server('<iframe srcdoc="<script>alert(1)</script>"></iframe>')
    expect(out).not.toContain('srcdoc')
    expect(out.toLowerCase()).not.toContain('<iframe')
  })

  it('drops style with url(javascript:) / expression', () => {
    expect(server('<div style="background:url(javascript:alert(1))">x</div>')).not.toMatch(/javascript:/i)
    expect(server('<div style="width:expression(alert(1))">x</div>')).not.toMatch(/expression/i)
  })

  it('strips comments including unterminated', () => {
    expect(server('<!-- secret --><p>ok</p>')).toBe('<p>ok</p>')
    expect(server('<!-- unterminated <script>alert(1)')).not.toContain('<!--')
  })

  it('adds rel=noopener to target=_blank links', () => {
    const out = server('<a href="https://ok" target="_blank">x</a>')
    expect(out).toContain('rel="noopener"')
  })

  it('honors FORBID_TAGS / FORBID_ATTR', () => {
    const out = server('<p id="a" class="b">t</p>', { FORBID_TAGS: ['p'], FORBID_ATTR: ['id'] })
    expect(out).not.toContain('<p')
    expect(out).not.toContain('id=')
  })

  it('handles nested / overlapping comments to fixpoint', () => {
    const out = server('<!-- <!-- evil --> --><p>ok</p>')
    expect(out).not.toContain('<!--')
    expect(out).not.toContain('-->')
    expect(out).not.toContain('evil')
    expect(out).toContain('<p>ok</p>')
  })

  it('does not let a quoted > terminate a tag early (attribute smuggling)', () => {
    const out = server('<img src="https://ok/x.png" alt="a>b" title="c">')
    expect(out).toContain('alt="a>b"')
    expect(out).not.toContain('onerror')
  })

  it('rejects svg / form / base / meta / link', () => {
    const out = server(
      '<svg onload=alert(1)></svg><form action="x"><input name=y></form><base href="https://evil"><meta http-equiv="refresh"><link rel="x">',
    )
    expect(out.toLowerCase()).not.toContain('<svg')
    expect(out.toLowerCase()).not.toContain('<form')
    expect(out.toLowerCase()).not.toContain('<base')
    expect(out.toLowerCase()).not.toContain('<meta')
    expect(out.toLowerCase()).not.toContain('<link')
  })

  it('keeps relative and fragment hrefs', () => {
    const out = server('<a href="/forum">f</a><a href="#sec">s</a>')
    expect(out).toContain('href="/forum"')
    expect(out).toContain('href="#sec"')
  })

  it('rejects vbscript: and file: schemes', () => {
    expect(server('<a href="vbscript:msgbox(1)">x</a>')).not.toMatch(/vbscript/i)
    expect(server('<a href="file:///etc/passwd">x</a>')).not.toMatch(/file:/i)
  })

  it('null / empty / non-string fail closed to empty-ish safe output', () => {
    expect(server('')).toBe('')
    expect(server(null as unknown as string)).toBe('')
    expect(server(undefined as unknown as string)).toBe('')
  })

  it('validates srcset candidates', () => {
    const bad = server('<img srcset="javascript:alert(1) 1x, https://ok/a.png 2x">')
    expect(bad).not.toMatch(/javascript:/i)
    const good = server('<img srcset="https://ok/a.png 1x, https://ok/b.png 2x">')
    expect(good).toContain('https://ok/a.png')
  })
})

describe('sanitizeHtml — client DOMPurify path', () => {
  // Minimal browser-ish env so typeof window !== 'undefined'
  class FakeNode {
    nodeName = '#text'
    textContent = ''
    constructor(public nodeValue = '') { this.textContent = nodeValue }
  }
  // jsdom-less: DOMPurify needs a real DOM. Skip if unavailable.
  const canRun = typeof document !== 'undefined'

  it.runIf(canRun)('strips script via DOMPurify', () => {
    const out = sanitizeHtml('<p>ok</p><script>alert(1)</script>')
    expect(out).toContain('<p>ok</p>')
    expect(out).not.toContain('<script')
  })
})
