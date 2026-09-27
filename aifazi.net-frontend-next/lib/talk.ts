/**
 * lib/talk.ts — Nextcloud Talk external link helper.
 *
 * The in-house web chat / voice-call UI was removed; realtime chat and
 * calls now live in Nextcloud Talk. This module is the single source of
 * truth for the Talk URL — override it with NEXT_PUBLIC_TALK_URL.
 */

function clean(v?: string): string {
  return (v || '').trim().replace(/\/+$/, '')
}

/** Absolute Nextcloud Talk base URL (env override or production fallback). */
export const TALK_URL =
  clean(process.env.NEXT_PUBLIC_TALK_URL) || 'https://cloud.aifazi.net/apps/spreed'

/** External link helper for Nextcloud Talk — always open in a new tab. */
export function talkUrl(): string {
  return TALK_URL
}
