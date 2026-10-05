/**
 * lib/safeHref.js — single allowlist for every <a href> sink.
 *
 * Allows: relative targets starting with / # ?, and absolute http(s):// or
 * mailto: URLs. Everything else (javascript:, data:, vbscript:, …) collapses
 * to '#'. Used by the block renderers, sanitizeProps, and the inline editor.
 */
export function safeHref(v) {
  const s = typeof v === 'string' ? v.trim() : ''
  if (!s) return '#'
  if (/^(https?:\/\/|mailto:)/i.test(s)) return s
  // R7-14 — tel: was dropped to '#', breaking click-to-call links. Allow it
  // only for sane dial strings (digits/+/separators, at least one digit) so
  // `tel:javascript:…` and other scheme smuggling still collapse to '#'.
  if (/^tel:/i.test(s)) {
    const body = s.slice(4)
    if (/[0-9]/.test(body) && /^[+0-9().\-;,\s]*$/.test(body)) return s
    return '#'
  }
  if (/^[/#?]/.test(s)) return s
  return '#'
}

export default safeHref
