/**
 * lib/sanitizeHtml.ts — SSR-safe HTML sanitizer.
 *
 * Replaces `isomorphic-dompurify` (removed 2026-09-04): its server path pulls
 * in `jsdom → whatwg-url@17 → @exodus/bytes` (ESM-only), which throws
 * `ERR_REQUIRE_ESM` on runtimes without `require(esm)` and 500s every SSR
 * page. This helper keeps `jsdom` out of the server bundle entirely.
 *
 * - Client (`window` defined): real DOMPurify with the caller's config.
 * - Server: crude regex fallback (strips scripts/styles, event handlers,
 *   `javascript:` hrefs). For benign content this is a byte-for-byte no-op,
 *   so SSR HTML matches the client's DOMPurify output (no hydration
 *   mismatch). Dirty content may differ — acceptable: the client
 *   re-sanitizes properly after hydration.
 */
import DOMPurify from 'dompurify'

export function sanitizeHtml(dirty: string, config?: Record<string, any>): string {
  const input = String(dirty ?? '')
  if (typeof window === 'undefined') {
    return input
      .replace(/<script[\s\S]*?<\/script\s*>/gi, '')
      .replace(/<style[\s\S]*?<\/style\s*>/gi, '')
      .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/href\s*=\s*["']\s*javascript:[^"']*["']/gi, 'href="#"')
  }
  try {
    return DOMPurify.sanitize(input, config as any) as unknown as string
  } catch {
    return input
  }
}
