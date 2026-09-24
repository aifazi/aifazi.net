/**
 * Calls feature flag.
 *
 * LiveKit has been removed (src/lib/livekit.tsx is an always-idle stub and
 * app/call.tsx renders an error dead-end), so all call entry points stay
 * hidden/disabled until a replacement (Nextcloud Talk) lands. Flip to true
 * to re-enable call buttons.
 */
export const CALLS_ENABLED = false as const
