/**
 * lib/infraDraft.ts — encoding for the editor's localStorage draft payload.
 *
 * N12: autosave drafts (full DiagramDoc, operator notes included) were
 * stored as plaintext JSON in localStorage. The payload is now base64-encoded
 * so raw doc text is not sitting visible in browser storage. This is
 * obfuscation, not encryption — storage is origin-scoped either way; it
 * closes the audit's "no obfuscation" point. Legacy plaintext drafts stay
 * readable until the next autosave rewrites them in the new form.
 */

/** Encode a JSON-serializable payload to a base64 string (Unicode-safe). */
export const encodeDraftPayload = (payload: unknown): string => {
  const bytes = new TextEncoder().encode(JSON.stringify(payload))
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}

/**
 * Decode a stored draft payload back to its JSON string. Legacy plaintext
 * drafts (pre-N12) start with `{` and are returned as-is; a base64 payload
 * that fails to decode returns null.
 */
export const decodeDraftPayload = (raw: string): string | null => {
  if (raw.startsWith('{')) return raw
  try {
    // atob yields one char per UTF-8 byte — re-decode through TextDecoder.
    const bin = atob(raw)
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
    return new TextDecoder().decode(bytes)
  } catch {
    return null
  }
}
