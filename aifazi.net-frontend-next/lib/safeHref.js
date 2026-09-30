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
  if (/^[/#?]/.test(s)) return s
  return '#'
}

export default safeHref
