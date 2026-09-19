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

export function sanitizeCssForStyleTag(css: unknown): string {
  let out = String(css || '')
  for (const pattern of DANGEROUS_CSS_PATTERNS) {
    pattern.lastIndex = 0
    out = out.replace(pattern, '')
  }
  return out
}
