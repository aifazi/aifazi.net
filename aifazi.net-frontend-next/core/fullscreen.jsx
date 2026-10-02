/**
 * Overlay portal target that survives browser fullscreen.
 *
 * The Fullscreen API promotes the fullscreen element to the top layer: it
 * paints above everything else regardless of z-index, so portals anchored to
 * <body> (dialogs, toasts) render *underneath* an active fullscreen element
 * and only become visible after fullscreen exits. Fixed overlays must be
 * portaled INTO the fullscreen element instead.
 *
 * Returns `document.fullscreenElement || document.body` and re-renders on
 * `fullscreenchange`, so open overlays migrate when fullscreen enters/exits.
 * Returns null during SSR (portal consumers render nothing until mounted).
 */
import { useEffect, useState } from 'react'

export function useFullscreenTarget() {
  const [target, setTarget] = useState(() =>
    typeof document === 'undefined' ? null : document.fullscreenElement || document.body,
  )
  useEffect(() => {
    const sync = () => setTarget(document.fullscreenElement || document.body)
    sync()
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [])
  return target
}
