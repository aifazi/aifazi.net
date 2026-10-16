/**
 * lib/css-sanitize.ts — defense-in-depth for theme custom CSS injection.
 *
 * Theme customizations are admin/staff-editable site settings injected into a
 * <style> block on EVERY page (app/layout.tsx + applyThemeCustom client path).
 * core/themeCustom.js already sanitizes at build time, but the injection point
 * re-sanitizes so a stored value that bypasses the builder (older rows, direct
 * DB edits, sibling-inherited drafts) can never smuggle executable payloads:
 * external resource loads (url(, @import), IE-era script vectors
 * (expression(, behavior:) or javascript: URLs — all matched case-insensitively.
 */
const DANGEROUS_CSS_PATTERNS: RegExp[] = [
  /url\s*\(/gi, // external resource load (fonts/images/tracking beacons)
  /@import/gi, // remote stylesheet include
  /expression\s*\(/gi, // IE-era JS-in-CSS
  /behaviou?r\s*:/gi, // IE HTML-Component script binding
  /javascript\s*:/gi, // javascript: URL in CSS context
]

// R9-12 — the generic `url(` strip above also broke the *system-generated*
// `@font-face` rules that core/themeCustom.js builds from validated font upload
// records (their `src: url('<https url>') format('woff2')`), so uploaded fonts
// fell back on first paint. Preserve exactly that shape: a single @font-face
// block whose src() points at an https:// (or localhost) URL and carries an
// explicit format(). Anything else stays subject to the strips below.
const FONT_FACE_BLOCK = /@font-face\s*\{[^}]*\}/gi
const TRUSTED_FONT_FACE_SRC = /src\s*:\s*url\(\s*['"]?(?:https:\/\/|http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\/)/i
const HAS_FORMAT = /format\s*\(/i

export function sanitizeCssForStyleTag(css: unknown): string {
  let out = String(css || '')

  // Lift trusted @font-face blocks out before the strips run, then put them
  // back verbatim so their url() survives.
  const preserved: string[] = []
  out = out.replace(FONT_FACE_BLOCK, (block) => {
    if (TRUSTED_FONT_FACE_SRC.test(block) && HAS_FORMAT.test(block)) {
      preserved.push(block)
      return `/*__trusted_font_face_${preserved.length - 1}__*/`
    }
    return block
  })

  for (const pattern of DANGEROUS_CSS_PATTERNS) {
    pattern.lastIndex = 0
    out = out.replace(pattern, '')
  }

  out = out.replace(/\/\*__trusted_font_face_(\d+)__\*\//g, (_, i) => preserved[Number(i)] ?? '')
  return out
}
