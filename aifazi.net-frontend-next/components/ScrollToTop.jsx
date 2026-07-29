'use client'
import { useEffect } from 'react'
import { useLocation } from '@/lib/router-compat'

export default function ScrollToTop() {
  const { pathname, hash } = useLocation()

  useEffect(() => {
    if (hash) {
      // Small delay to let the page render before scrolling
      const id = hash.replace('#', '')
      setTimeout(() => {
        const el = document.getElementById(id)
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        } else {
          // Element not found yet — retry once more after full render
          setTimeout(() => {
            const el2 = document.getElementById(id)
            if (el2) el2.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }, 300)
        }
      }, 80)
    } else {
      window.scrollTo(0, 0)
    }
  }, [pathname, hash])

  return null
}
