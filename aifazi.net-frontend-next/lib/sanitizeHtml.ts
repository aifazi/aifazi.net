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
 *
 * Server parsing rules (all regexes below are quote-aware — a `>` inside a
 * quoted attribute value never terminates a tag):
 * - Forbidden elements are dropped (contents stay as inert text).
 * - Event-handler attributes (`on*`, any quoting incl. slash-separated) cut.
 * - URL attributes are entity-decoded before scheme checks; only
 *   http/https/mailto/tel/cid/relative/fragment + raster `data:image/*`
 *   survive. `srcset` is validated per candidate. `srcdoc` always dropped.
 * - `style` keeps plain declarations; anything with `url()` (except
 *   http/https/raster-data targets), `expression()`, `behavior` or
 *   `-moz-binding` drops the whole attribute.
 * - Caller `FORBID_TAGS`/`FORBID_ATTR` are honored (monotonic strictness).
 */
import DOMPurify from 'dompurify'

const FORBIDDEN_TAGS = new Set([
  'script', 'style', 'iframe', 'frame', 'frameset', 'object', 'embed',
  'applet', 'meta', 'base', 'link', 'form', 'input', 'button', 'textarea',
  'select', 'option', 'body', 'html', 'head', 'title', 'noscript',
  'plaintext', 'xmp', 'noembed', 'noframes',
])

const URL_ATTRS = new Set([
  'href', 'src', 'xlink:href', 'action', 'formaction', 'cite', 'data',
  'poster', 'srcset', 'background',
])

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  colon: ':', tab: '\t', newline: '\n', NewLine: '\n', excl: '!',
  sol: '/', period: '.', commat: '@',
}

function decodeEntities(s: string): string {
  return s.replace(/&(#\d+|#[xX][\dA-Fa-f]+|[A-Za-z]+);?/g, (m, ent: string) => {
    try {
      if (ent[0] === '#') {
        const code = ent[1].toLowerCase() === 'x'
          ? parseInt(ent.slice(2), 16)
          : parseInt(ent.slice(1), 10)
        if (Number.isFinite(code) && code > 0 && code < 0x110000) {
          return String.fromCodePoint(code)
        }
        return m
      }
      return NAMED_ENTITIES[ent] ?? m
    } catch {
      return m
    }
  })
}

type Token = { text: string; isTag: boolean }

/** Split HTML into text/tag tokens; a `>` inside quotes never ends a tag. */
function tokenize(html: string): Token[] {
  const out: Token[] = []
  let i = 0
  let buf = ''
  const flush = () => {
    if (buf) {
      out.push({ text: buf, isTag: false })
      buf = ''
    }
  }
  while (i < html.length) {
    const c = html[i]
    if (c === '<') {
      const n = html[i + 1] ?? ''
      if (!/[A-Za-z/!?]/.test(n)) {
        buf += c
        i += 1
        continue
      }
      let j = i + 1
      let q = ''
      while (j < html.length) {
        const d = html[j]
        if (q) {
          if (d === q) q = ''
        } else if (d === '"' || d === "'") {
          q = d
        } else if (d === '>') {
          break
        }
        j += 1
      }
      flush()
      if (j < html.length) {
        out.push({ text: html.slice(i, j + 1), isTag: true })
        i = j + 1
      } else {
        // Unterminated tag: emit as inert text, never as markup.
        buf += html.slice(i).replace(/</g, '&lt;')
        break
      }
    } else {
      buf += c
      i += 1
    }
  }
  flush()
  return out
}

/** True when a decoded URL value is safe to keep. */
function isSafeUrl(raw: string): boolean {
  const v = decodeEntities(raw).replace(/[\0-\x20]+/g, '')
  if (!v || v.startsWith('#')) return true
  const m = /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(v)
  if (!m) return true // relative URL
  const scheme = m[1].toLowerCase()
  if (scheme === 'http' || scheme === 'https' || scheme === 'mailto' || scheme === 'tel' || scheme === 'cid') {
    return true
  }
  if (scheme === 'data') {
    // Raster images only — data:text/html and data:image/svg+xml stay out.
    return /^data:image\/(png|jpe?g|gif|webp|bmp|ico|avif);base64,/i.test(v)
  }
  return false
}

function isSafeSrcset(raw: string): boolean {
  return raw.split(',').every((part) => {
    const url = part.trim().split(/\s+/)[0] ?? ''
    return !url || isSafeUrl(url)
  })
}

function isSafeStyle(raw: string): boolean {
  const v = decodeEntities(raw)
  if (/expression\s*\(|behaviou?r\s*:|-moz-binding|binding\s*:/i.test(v)) return false
  const urls = v.match(/url\s*\(([^)]*)\)/gi) ?? []
  for (const u of urls) {
    const inner = u.replace(/^url\s*\(/i, '').replace(/\)$/, '').trim().replace(/^["']|["']$/g, '')
    if (!isSafeUrl(inner)) return false
  }
  return true
}

const ATTR_RE = /([^\s"'=<>`/]+)(\s*=\s*("[^"]*"|'[^']*'|[^\s"'=<>`]+))?/g

function scrubTag(
  tag: string,
  extraForbiddenTags: Set<string>,
  extraForbiddenAttrs: Set<string>,
): string {
  const m = /^<\/?\s*([A-Za-z][A-Za-z0-9]*)/.exec(tag)
  if (!m) return ''
  const name = m[1].toLowerCase()
  if (FORBIDDEN_TAGS.has(name) || extraForbiddenTags.has(name)) return ''
  if (/^<\s*\//.test(tag)) return `</${name}>`
  const attrs: string[] = []
  const inner = tag.replace(/^<\s*[A-Za-z][A-Za-z0-9]*\s*/, '').replace(/\s*\/?>$/, '')
  ATTR_RE.lastIndex = 0
  let a: RegExpExecArray | null
  while ((a = ATTR_RE.exec(inner)) !== null) {
    const attrName = a[1].toLowerCase()
    const eq = a[2] ?? ''
    let val = ''
    if (eq) {
      val = eq.replace(/^\s*=\s*/, '')
      if (
        val.length > 1 &&
        ((val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'")))
      ) {
        val = val.slice(1, -1)
      }
    }
    if (attrName.startsWith('on')) continue
    if (extraForbiddenAttrs.has(attrName)) continue
    if (attrName === 'srcdoc') continue
    const lower = URL_ATTRS.has(attrName)
    if (lower && eq) {
      if (attrName === 'srcset') {
        if (!isSafeSrcset(val)) continue
      } else if (!isSafeUrl(val)) {
        continue
      }
    }
    if (attrName === 'style' && eq && !isSafeStyle(val)) continue
    attrs.push(eq ? `${attrName}="${val.replace(/"/g, '&quot;')}"` : attrName)
  }
  const selfClose = /\s*\/>$/.test(tag) ? ' /' : ''
  let rebuilt = `<${name}${attrs.length ? ' ' + attrs.join(' ') : ''}${selfClose}>`
  if (/target\s*=\s*"_blank"/i.test(rebuilt) && !/rel\s*=/i.test(rebuilt)) {
    rebuilt = rebuilt.replace(/>$/, ' rel="noopener">')
  }
  return rebuilt
}

function scrubServer(dirty: string, config?: Record<string, any>): string {
  const extraTags = new Set(
    ([] as unknown[])
      .concat(config?.FORBID_TAGS ?? [])
      .map((t) => String(t ?? '').toLowerCase())
      .filter(Boolean),
  )
  const extraAttrs = new Set(
    ([] as unknown[])
      .concat(config?.FORBID_ATTR ?? config?.FORBID_ATTRS ?? [])
      .map((t) => String(t ?? '').toLowerCase())
      .filter(Boolean),
  )
  let out = String(dirty ?? '')
  // Strip comments to a fixpoint so nested/overlapping openers cannot leave
  // a comment behind, then drop any unterminated trailing comment (no `-->`)
  // so `<!--` cannot survive sanitization (fail closed).
  let prevComment = ''
  while (prevComment !== out) {
    prevComment = out
    out = out.replace(/<!--[\s\S]*?-->/g, '')
  }
  out = out.replace(/<!--[\s\S]*$/g, '')
  return tokenize(out)
    .map((t) => (t.isTag ? scrubTag(t.text, extraTags, extraAttrs) : t.text))
    .join('')
}

export function sanitizeHtml(dirty: string, config?: Record<string, any>): string {
  const input = String(dirty ?? '')
  if (typeof window === 'undefined') {
    return scrubServer(input, config)
  }
  try {
    return DOMPurify.sanitize(input, config as any) as unknown as string
  } catch {
    return ''
  }
}
