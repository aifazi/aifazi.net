'use client'

import { useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'

export const PAGE_ANIMATIONS = [
  { value: 'none', label: 'None' },
  { value: 'fade-up', label: 'Fade Up' },
  { value: 'scan-in', label: 'Scan In' },
  { value: 'soft-zoom', label: 'Soft Zoom' },
  { value: 'slide-left', label: 'Slide Left' },
]

const KEYFRAMES = `
@keyframes pageFadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
@keyframes pageScanIn{0%{opacity:0;clip-path:inset(0 0 100% 0)}100%{opacity:1;clip-path:inset(0 0 0 0)}}
@keyframes pageSoftZoom{from{opacity:0;transform:scale(.985)}to{opacity:1;transform:scale(1)}}
@keyframes pageSlideLeft{from{opacity:0;transform:translateX(18px)}to{opacity:1;transform:translateX(0)}}
`

let cachedConfigs = null
let configPromise = null

export function animationStyle(name) {
  const base = { willChange: 'opacity, transform' }
  if (name === 'fade-up') return { ...base, animation: 'pageFadeUp .42s ease both' }
  if (name === 'scan-in') return { ...base, animation: 'pageScanIn .5s ease both' }
  if (name === 'soft-zoom') return { ...base, animation: 'pageSoftZoom .38s ease both' }
  if (name === 'slide-left') return { ...base, animation: 'pageSlideLeft .42s ease both' }
  return {}
}

export function usePageConfig(pageKey, defaults = {}) {
  const [configs, setConfigs] = useState(cachedConfigs || {})
  useEffect(() => {
    if (cachedConfigs) return
    if (configPromise) {
      configPromise.then(data => { if (data) setConfigs(data) })
      return
    }
    configPromise = api.get('/content/page_configs')
      .then(r => { cachedConfigs = r.data || {}; return cachedConfigs })
      .catch(() => { cachedConfigs = {}; return cachedConfigs })
    configPromise.then(data => setConfigs(data))
  }, [])
  return useMemo(() => ({ ...defaults, ...(configs?.[pageKey] || {}) }), [configs, defaults, pageKey])
}

export function MotionPage({ animation = 'none', children, style }) {
  return (
    <div style={{ ...animationStyle(animation), ...style }}>
      <style>{KEYFRAMES}</style>
      {children}
    </div>
  )
}
