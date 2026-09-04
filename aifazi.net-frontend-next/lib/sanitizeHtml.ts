/**
 * lib/sanitizeHtml.ts — SSR-safe HTML sanitizer.
 *
 * Replaces `isomorphic-dompurify` (removed 2026-09-04): its server path pulls
 * in `jsdom → whatwg-url@17 → @exodus/bytes` (ESM-only), which throws
 * `ERR_REQUIRE_ESM` on runtimes without `require(esm)` and 500s every SSR
 * page. This helper keeps `jsdom` out of the server bundle entirely.
 *
 * - Client (`window` defined): real DOMPurify with the caller's config.
 * - Server: dependency-free scrubber below. It is deliberately strict —
 *   unknown/empty output on failure (fail closed). Benign markup
 *   (p/div/span/img with safe attrs) passes through unchanged so SSR HTML
 *   matches the client's DOMPurify output (no hydration mismatch); anything
 *   resembling active content is removed. The client re-sanitizes properly
 *   after hydration, so this is a first-paint backstop, not the only gate.
 */
import DOMPurify from 'dompurify'

// Elements that can never appear in user content: drop the whole element,
// including contents (script/style) — for void/replaced elements the pattern
// below still matches the open tag pair form; lone tags are caught second.
const FORBIDDEN_PAIRS =
  /<(script|style|iframe|frame|frameset|object|embed|applet|meta|base|link|form|button|textarea|select|option|body|html|head|title|noscript|plaintext|xmp|noembed|noframes)\b[^>]*>[\s\S]*?<\/\1\s*>/gi
const FORBIDDEN_LONE =
  /<(script|style|iframe|frame|frameset|object|embed|applet|meta|base|link|form|input|button|textarea|select|option|body|html|head|title|noscript|plaintext|xmp|noembed|noframes)\b[^>]*\/?>/gi

// Event handlers, quoted / unquoted / slash-separated:
//   onclick=".."  onclick='..'  onclick=..  <svg/onload=..>  <div\tonerror=..>
const EVENT_ATTRS = /(<[^>]*?)[\s/]+on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]*)/gi

// URL attributes whose value may carry an executable scheme.
const URL_ATTRS = /\b(href|src|xlink:href|action|formaction|cite|data|poster|srcset|background)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi
const DANGEROUS_SCHEME = /^\s*(javascript|vbscript|data\s*:\s*text\/html|data\s*:\s*application\/xhtml)/i

function scrubUrls(tag: string): string {
  return tag.replace(URL_ATTRS, (attr, _name, raw: string) => {
    const value = raw.replace(/^["']|["']$/g, '')
    if (DANGEROUS_SCHEME.test(value.replace(/[\0-\x20]+/g, ''))) return ''
    return attr
  })
}

function scrubServer(dirty: string): string {
  let out = String(dirty ?? '')
  out = out.replace(/<!--[\s\S]*?-->/g, '') // comments (conditional payloads)
  out = out.replace(FORBIDDEN_PAIRS, '')
  out = out.replace(FORBIDDEN_LONE, '')
  // Tag-by-tag pass: strip event handlers, dangerous URLs, srcdoc and
  // risky style payloads. Anything unparseable is left to the tag regexes
  // above; the client DOMPurify pass remains authoritative post-hydration.
  out = out.replace(/<[^>]+>/g, (tag) => {
    let t = tag.replace(EVENT_ATTRS, '$1')
    t = scrubUrls(t)
    t = t.replace(/\ssrcdoc\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    t = t.replace(/\sstyle\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, (m) =>
      /expression\s*\(|javascript\s*:|vbscript\s*:|behaviou?r\s*:|-moz-binding|binding\s*:/i.test(m) ? '' : m,
    )
    return t
  })
  return out
}

export function sanitizeHtml(dirty: string, config?: Record<string, any>): string {
  const input = String(dirty ?? '')
  if (typeof window === 'undefined') {
    return scrubServer(input)
  }
  try {
    return DOMPurify.sanitize(input, config as any) as unknown as string
  } catch {
    return ''
  }
}
