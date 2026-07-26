/**
 * lib/siteSocket.ts — Socket.IO connection stub.
 *
 * Socket.IO is disabled — the FastAPI backend no longer mounts the
 * python-socketio ASGI app. All real-time features use Supabase Realtime.
 * This module is kept solely as a no-op import target for components that
 * still reference it. Remove this file and all imports once all callers
 * are updated.
 *
 * @deprecated Will be removed in a future release.
 */

/** @deprecated No-op. Use Supabase Realtime instead. */
export function getSiteSocket(): null {
  if (typeof console !== 'undefined') {
    console.warn('[siteSocket] getSiteSocket() is deprecated. Use Supabase Realtime instead.')
  }
  return null
}

/** @deprecated No-op. Cleanup happens automatically. */
export function disconnectSiteSocket(): void {
  // no-op
}