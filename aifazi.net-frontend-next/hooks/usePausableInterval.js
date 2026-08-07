'use client'
import { useEffect, useRef } from 'react'

/**
 * A setInterval that pauses while the document tab is hidden.
 *
 * Background tabs are throttled by the browser but intervals still fire (and
 * their network calls are wasted). This hook stops the timer entirely while the
 * tab is hidden and re-runs the callback once immediately when it becomes
 * visible again, so admin panels stop hammering the API with redundant polls.
 *
 * @param fn       Callback to run on each tick.
 * @param delay    Interval in ms. Pass null/0/undefined to disable.
 */
export function usePausableInterval(fn, delay) {
  const cbRef = useRef(fn)

  useEffect(() => {
    cbRef.current = fn
  }, [fn])

  useEffect(() => {
    if (!delay) return
    let timer = null

    const start = () => {
      if (timer != null) return
      timer = setInterval(() => cbRef.current(), delay)
    }
    const stop = () => {
      if (timer != null) { clearInterval(timer); timer = null }
    }
    const onVisibility = () => {
      if (document.hidden) {
        stop()
      } else {
        cbRef.current() // refresh immediately on return to the tab
        start()
      }
    }

    start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [delay])
}
