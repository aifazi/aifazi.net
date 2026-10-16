'use client'
import { useEffect, useState, useRef } from 'react'
import { prefersReducedMotion } from '../../core/useFocusTrap'
import Clickable from '@/core/Clickable'
import createGlobe from 'cobe'
import { readGlobeTheme, GLOBE_CITIES, GLOBE_CONNECTIONS, supportsCssAnchors, cityToAngles, GLOBE_MAX_ZOOM, clampGlobeZoom, GLOBE_CENTER_OFFSET, globeMaxScaleForDims, pickGlobeDpr, globeFitBase, hasWebGL, firstGeoValue, rgbToArr } from './globeUtils'
import { VisitorHud } from './VisitorHud'

// Extracted from ServerRackAnimation.jsx - COBE-based globe mode.
function GlobeMode({ visibleRef }) {
  const canvasRef = useRef()
  const wrapRef   = useRef()
  const globeRef  = useRef(null)
  const [visitor, setVisitor] = useState(null)
  const visitorRef = useRef(null)
  // Ref to the VisitorHud shell — pinned to the live marker every frame via
  // pinVisitorShell() (no CSS-anchor dependency, works in every browser).
  const visitorShellRef = useRef(null)
  // Live globe CSS-pixel geometry (creation + resize + zoom resync keep it fresh).
  const geomRef = useRef({ w: 0, h: 0 })
  const [visitorTrail, setVisitorTrail] = useState([])
  const visitorTrailRef = useRef([])
  const [themeKey, setThemeKey] = useState(0)
  const themeRef = useRef(null)
  const [focusCity, setFocusCity] = useState(null)
  const [selectedNode, setSelectedNode] = useState(null)
  const [anchorsOk] = useState(() => supportsCssAnchors())
  const [latencyMs, setLatencyMs] = useState(12)
  // prefers-reduced-motion: start paused with no packets (static frame below).
  const [autoRotate, setAutoRotate] = useState(() => !prefersReducedMotion())
  const autoRotateRef = useRef(true)
  const [packetsOn, setPacketsOn] = useState(() => !prefersReducedMotion())
  const packetsOnRef = useRef(true)
  const [routeLog, setRouteLog] = useState([])
  const routeLogRef = useRef([])
  const routeSyncRef = useRef(0)
  const [fps, setFps] = useState(60)
  const fpsRef = useRef({ samples: 0, last: 0, avg: 60 })
  // Mobile stats popover (desktop shows the inline strip instead).
  const [showStats, setShowStats] = useState(false)
  // Transient toast for chip actions (PNG export, recenter).
  const [toast, setToast] = useState('')
  const toastTimer = useRef(null)
  const flashToast = (msg) => {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 2600)
  }
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current) }, [])
  // Escape closes the stats popover.
  useEffect(() => {
    if (!showStats) return
    const onKey = (e) => { if (e.key === 'Escape') setShowStats(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showStats])
  const [perfTier, setPerfTier] = useState(() => {
    const cores = navigator.hardwareConcurrency || 4
    const dpr = window.devicePixelRatio || 1
    const small = Math.min(window.innerWidth, window.innerHeight) < 700
    if (cores <= 4 || small || dpr > 2.2) return 'low'
    if (cores <= 6) return 'med'
    return 'high'
  })
  const perfTierRef = useRef(perfTier)
  useEffect(() => { perfTierRef.current = perfTier }, [perfTier])
  // Aspect-aware base globe scale (≤0.92, never upscale) — recomputed on create/resize.
  const fitBaseRef = useRef(0.92)
  // Effective-scale ceiling for the live shell aspect (never below the fitted
  // base look, so default zoom is pixel-identical). Recomputed with fitBase.
  const maxScaleRef = useRef(GLOBE_MAX_ZOOM * 0.92)
  const syncGlobeGeom = (width, height) => {
    fitBaseRef.current = globeFitBase(width, height)
    maxScaleRef.current = Math.max(fitBaseRef.current, globeMaxScaleForDims(width, height))
  }
  // rAF parking: hidden tab / offscreen globe stops scheduling frames entirely.
  const offscreenRef = useRef(false)
  const docHiddenRef = useRef(typeof document !== 'undefined' && document.hidden)
  const sleepingRef = useRef(false)
  const frameRef = useRef(null)
  const rafRef = useRef(0)
  // WebGL unavailable → static fallback (COBE returns a no-op stub otherwise).
  const [glFailed, setGlFailed] = useState(false)
  const glFailedRef = useRef(false)
  const [themeTone, setThemeTone] = useState('dark')
  const [monitor, setMonitor] = useState(null)
  const radarRef = useRef()
  const stateRef  = useRef({
    phi: 0.55,
    theta: 0.18,
    velPhi: 0.0022,
    velPhiDamp: 0,
    velThetaDamp: 0,
    drag: null,
    zoom: 1.0,
    pinch: null,
    focusAnim: null,
    packetT: 0,
  })

  useEffect(() => { visitorRef.current = visitor }, [visitor])
  useEffect(() => { visitorTrailRef.current = visitorTrail }, [visitorTrail])
  useEffect(() => { autoRotateRef.current = autoRotate }, [autoRotate])
  useEffect(() => { packetsOnRef.current = packetsOn }, [packetsOn])

  // ── Fetch visitor geo info ────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false

    const parseVisitor = d => {
      if (!d || d.success === false) throw new Error('bad response')
      if (d.status && d.status !== 'success') throw new Error('bad response')

      const latRaw = d.latitude ?? d.lat
      const lonRaw = d.longitude ?? d.lon
      const city = firstGeoValue(d.city)
      const region = firstGeoValue(d.region, d.regionName, d.stateProv)
      const country = firstGeoValue(d.country_name, d.country, d.countryName)
      const postal = firstGeoValue(d.postal, d.zip)
      const addressParts = [city, region, postal, country].filter(v => v && v !== '—')

      return {
        ip:          firstGeoValue(d.ip, d.query, d.ipAddress),
        ipType:      firstGeoValue(d.type, d.version),
        city,
        region,
        country,
        countryCode: firstGeoValue(d.country_code, d.countryCode),
        flag:        firstGeoValue(d.flag?.emoji, d.country_flag_emoji),
        postal,
        address:     addressParts.length ? addressParts.join(', ') : '—',
        org:         firstGeoValue(d.connection?.isp, d.isp, d.org),
        network:     firstGeoValue(d.network, d.connection?.domain, d.asname),
        asn:         firstGeoValue(d.connection?.asn, d.asn, d.as),
        lat:         latRaw != null ? (+latRaw).toFixed(4) : '—',
        lon:         lonRaw != null ? (+lonRaw).toFixed(4) : '—',
        tz:          firstGeoValue(d.timezone?.id, d.timezone),
        utc:         firstGeoValue(d.timezone?.utc, d.utc_offset),
        currency:    firstGeoValue(d.currency?.code, d.currency),
        updatedAt:   new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }
    }

    const fetchJson = async url => {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 6500)
      try {
        const res = await fetch(url, { signal: controller.signal })
        if (!res.ok) throw new Error('geo lookup failed')
        return await res.json()
      } finally {
        clearTimeout(timer)
      }
    }

    const loadVisitorGeo = async () => {
      const sources = [
        'https://ipapi.co/json/',
        'https://ipwhois.app/json/',
      ]

      for (const url of sources) {
        try {
          const parsed = parseVisitor(await fetchJson(url))
          if (!cancelled) {
            setVisitor(parsed)
            // Keep a short trail of prior visits (this session) for ghost markers.
            if (Number.isFinite(+parsed.lat) && parsed.lat !== '—') {
              setVisitorTrail(prev => {
                const next = [{ lat: +parsed.lat, lon: +parsed.lon, id: `v${Date.now()}` }, ...prev]
                return next.slice(0, 5)
              })
            }
          }
          return
        } catch {
          // Try the next public geo provider.
        }
      }

      try {
        const ipOnly = await fetchJson('https://api64.ipify.org?format=json')
        if (!cancelled) setVisitor({ ip: ipOnly.ip || '—', city: '—', region: '—', country: '—', address: '—' })
      } catch {
        // Leave the loading label in place if every lookup is unavailable.
      }
    }

    loadVisitorGeo()
    return () => { cancelled = true }
  }, [])

  // ── Live latency ticker (cosmetic telemetry) ──
  useEffect(() => {
    const id = setInterval(() => {
      setLatencyMs(9 + Math.floor(Math.random() * 9))
    }, 2800)
    return () => clearInterval(id)
  }, [])

  // ── Real traffic feed — pull live service status when available ──
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch('/api/monitor/status', { credentials: 'same-origin' })
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled && data && Array.isArray(data.services)) {
          const ups = data.services.filter(s => s.status === 'up')
          const latencies = ups.map(s => s.latency_avg_ms ?? s.latency_ms).filter(n => Number.isFinite(n))
          const avg = latencies.length
            ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
            : null
          setMonitor({
            overall: data.overall || 'unknown',
            up: ups.length,
            total: data.services.length,
            avgMs: avg,
            uptime: ups.length && data.services.length
              ? (ups.length / data.services.length * 100).toFixed(2)
              : null,
          })
          if (avg != null) setLatencyMs(avg)
        }
      } catch { /* offline or endpoint unavailable — keep ticker values */ }
    }
    load()
    const id = setInterval(load, 45000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  // ── React to theme changes ──
  useEffect(() => {
    themeRef.current = readGlobeTheme()
    setThemeTone(themeRef.current.isLight ? 'light' : 'dark')
    const el = document.documentElement
    const obs = new MutationObserver(() => {
      themeRef.current = readGlobeTheme()
      setThemeTone(themeRef.current.isLight ? 'light' : 'dark')
      setThemeKey(k => k + 1)
    })
    obs.observe(el, { attributes: true, attributeFilter: ['data-theme', 'style'] })
    return () => obs.disconnect()
  }, [])

  // ── Mini radar — draw node azimuths on a tiny canvas ──
  useEffect(() => {
    const cv = radarRef.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    let raf = 0
    let sweep = -0.6
    const reduceMotion = prefersReducedMotion()
    // Canvas can't read CSS vars — mirror the shell tone per frame (cheap
    // dataset read, no layout) so blips stay legible on light themes.
    const toneColors = () => (
      cv.closest('.globe-network-shell')?.dataset.globeTone === 'light'
        ? { ring: 'rgba(0,90,140,0.4)', sweep: 'rgba(0,150,80,0.35)', sweepLine: 'rgba(0,150,80,0.7)', hub: '#009e57', node: '#0077b6' }
        : { ring: 'rgba(0,212,255,0.18)', sweep: 'rgba(0,255,136,0.35)', sweepLine: 'rgba(0,255,136,0.55)', hub: '#00ff88', node: '#00d4ff' }
    )
    const draw = () => {
      if (!reduceMotion) raf = requestAnimationFrame(draw)
      const pal = toneColors()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = 64, h = 64
      if (cv.width !== w * dpr) { cv.width = w * dpr; cv.height = h * dpr }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      const cx = w / 2, cy = h / 2, r = 26

      // Rings
      ctx.strokeStyle = pal.ring
      ctx.lineWidth = 1
      for (const rr of [r * 0.33, r * 0.66, r]) {
        ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.stroke()
      }
      // Crosshair
      ctx.beginPath()
      ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy)
      ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r)
      ctx.stroke()

      // Sweep (frozen when reduced motion is requested)
      if (!reduceMotion) sweep = (sweep + 0.025) % (Math.PI * 2)
      const grad = ctx.createConicGradient
        ? ctx.createConicGradient(sweep, cx, cy)
        : null
      if (grad) {
        grad.addColorStop(0, pal.sweep)
        grad.addColorStop(0.12, 'rgba(0,255,136,0)')
        grad.addColorStop(1, 'rgba(0,255,136,0)')
        ctx.fillStyle = grad
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill()
      }
      // Sweep line
      ctx.strokeStyle = pal.sweepLine
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(cx + Math.cos(sweep) * r, cy + Math.sin(sweep) * r)
      ctx.stroke()

      // Node blips (azimuth from longitude, radius from |latitude|)
      const s = stateRef.current
      GLOBE_CITIES.forEach(c => {
        const az = (c.lng / 180) * Math.PI + s.phi
        const rad = (Math.abs(c.lat) / 90) * r * 0.92
        const x = cx + Math.cos(az) * rad
        const y = cy + Math.sin(az) * rad * 0.7
        const d = Math.hypot(x - cx, y - cy)
        if (d > r) return
        ctx.fillStyle = c.hub ? pal.hub : pal.node
        ctx.globalAlpha = c.hub ? 0.95 : 0.7
        ctx.beginPath(); ctx.arc(x, y, c.hub ? 2.4 : 1.5, 0, Math.PI * 2); ctx.fill()
        ctx.globalAlpha = 1
      })
    }
    if (reduceMotion) draw()
    else raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [])

  // ── Export node map as PNG ──
  const exportPng = () => {
    const canvas = canvasRef.current
    if (!canvas) { flashToast('Export unavailable'); return }
    try {
      const url = canvas.toDataURL('image/png')
      const a = document.createElement('a')
      a.href = url
      a.download = `globe-network-${new Date().toISOString().slice(0, 10)}.png`
      document.body.appendChild(a)
      a.click()
      a.remove()
      flashToast('Map exported as PNG')
    } catch { flashToast('Export failed — canvas unavailable') }
  }

  // ── Recenter / reset view (chip + double-click) ──
  const recenterGlobe = () => {
    const s = stateRef.current
    s.focusAnim = { fromPhi: s.phi, fromTheta: s.theta, toPhi: 0.55, toTheta: 0.18, t0: 0, dur: 700 }
    s.zoom = 1
    s.velPhi = 0.0022
    s.velPhiDamp = 0
    setFocusCity(null)
    setSelectedNode(null)
  }

  // ── Animate to a city (focus recipe) ──
  const focusOnCity = (city) => {
    const s = stateRef.current
    const { phi, theta } = cityToAngles(city.lat, city.lng)
    // Shortest angular path for phi
    let toPhi = phi
    while (toPhi - s.phi > Math.PI) toPhi -= Math.PI * 2
    while (s.phi - toPhi > Math.PI) toPhi += Math.PI * 2
    s.focusAnim = {
      fromPhi: s.phi, fromTheta: s.theta,
      toPhi, toTheta: theta,
      t0: 0, // stamped on the first rAF tick
      dur: 900,
    }
    s.velPhi = 0
    s.velPhiDamp = 0
    setFocusCity(city.id)
    setSelectedNode(city)
  }

  // ── COBE globe instance (recreated on theme / visitor / resize / trail) ──
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || typeof createGlobe !== 'function') return
    if (glFailedRef.current) return
    // WebGL unavailable (broken drivers / disabled) — COBE would return a
    // no-op stub and paint nothing. Defer setState per react-compiler rules.
    if (!hasWebGL()) {
      glFailedRef.current = true
      const t = setTimeout(() => setGlFailed(true), 0)
      return () => clearTimeout(t)
    }
    if (!themeRef.current) themeRef.current = readGlobeTheme()

    const theme = themeRef.current
    const v = visitorRef.current
    const dpr = pickGlobeDpr(perfTierRef.current)
    // COBE multiplies width/height by devicePixelRatio internally — pass CSS pixels.
    // Prefer the wrap (layout box); the canvas rect can lag during entrance/resize.
    const wrapW = wrapRef.current?.clientWidth || 0
    const wrapH = wrapRef.current?.clientHeight || 0
    const rect = canvas.getBoundingClientRect()
    const width = Math.max(240, Math.floor(wrapW || rect.width || 480))
    const height = Math.max(240, Math.floor(wrapH || rect.height || 360))
    syncGlobeGeom(width, height)
    // Raw CSS px for the HUD pin + zero-size guard (unclamped — a hidden
    // ancestor measures 0 and cobe draws fail on a 0-area canvas).
    geomRef.current = { w: wrapW || rect.width || 480, h: wrapH || rect.height || 360 }

    // ── Visitor HUD pin — project the visitor marker with COBE's own math
    // (orthographic disc radius 0.8 + markerElevation 0.012, offset [0,0])
    // so the card tracks the live coordinates every frame in any browser.
    // Card bottom lands exactly 10px above the marker; the CSS stem bridges it.
    const pinVisitorShell = () => {
      const shell = visitorShellRef.current
      if (!shell) return
      const st8 = stateRef.current
      if (!hasVisitor) {
        shell.style.left = '14px'; shell.style.top = 'auto'
        shell.style.bottom = '12px'; shell.style.right = 'auto'
        shell.style.translate = ''; shell.style.opacity = ''; shell.style.pointerEvents = ''
        return
      }
      const { w, h } = geomRef.current
      if (!w || !h) return
      const B = Math.min(st8.zoom * fitBaseRef.current, maxScaleRef.current)
      const latR = (+v.lat) * Math.PI / 180
      const lngA = (+v.lon) * Math.PI / 180 - Math.PI
      const R = 0.8 + 0.012
      const px = -Math.cos(latR) * Math.cos(lngA) * R
      const py = Math.sin(latR) * R
      const pz = Math.cos(latR) * Math.sin(lngA) * R
      const cf = Math.cos(st8.phi), sf = Math.sin(st8.phi)
      const ct = Math.cos(st8.theta), st = Math.sin(st8.theta)
      const c = cf * px + sf * pz
      const q = sf * st * px + ct * py - cf * st * pz
      const xF = (c / (w / h) * B + 1) / 2
      const yF = (-q * B + 1) / 2
      // Same occlusion rule as the WebGL marker: behind the disc → fade out.
      const vis = (-sf * ct * px + st * py + cf * ct * pz >= 0) || (c * c + q * q >= 0.64)
      shell.style.left = `${xF * w}px`
      shell.style.top = `${yF * h}px`
      shell.style.bottom = 'auto'; shell.style.right = 'auto'
      shell.style.translate = '-50% calc(-100% - 10px)'
      shell.style.opacity = vis ? '' : '0'
      shell.style.pointerEvents = vis ? '' : 'none'
    }

    const cyan   = rgbToArr(theme.cyanRgb,  '0,212,255')
    const green  = rgbToArr(theme.greenRgb, '0,255,136')
    const orange = rgbToArr(theme.orangeRgb, '255,107,53')
    const bg     = rgbToArr(theme.bgRgb, '0,12,28')

    // Bindable markers — every city gets an id for CSS anchors + labels.
    // Keep nodes small and crisp; hub is only slightly larger.
    const markers = GLOBE_CITIES.map(c => ({
      id: c.id,
      location: [c.lat, c.lng],
      size: c.hub ? 0.072 : 0.038,
      color: c.hub ? green : cyan,
    }))

    // Ghost trail markers (prior visitor fixes this session)
    visitorTrailRef.current.forEach((t, i) => {
      markers.push({
        id: `trail-${i}`,
        location: [t.lat, t.lon],
        size: Math.max(0.014, 0.028 - i * 0.004),
        color: [orange[0] * 0.5, orange[1] * 0.5, orange[2] * 0.5],
      })
    })

    // Bindable arcs — per-route color, id for arc labels.
    // Non-hub routes use a dimmer cyan so the network reads as hierarchy, not spaghetti.
    const dimCyan = [cyan[0] * 0.55, cyan[1] * 0.55, cyan[2] * 0.55]
    const arcs = GLOBE_CONNECTIONS.map((e) => {
      const a = GLOBE_CITIES[e.from]
      const b = GLOBE_CITIES[e.to]
      return {
        id: `${a.id}-${b.id}`,
        from: [a.lat, a.lng],
        to:   [b.lat, b.lng],
        color: e.hub ? green : dimCyan,
      }
    })

    // Visitor marker + arc from the Riyadh hub (bindable via CSS anchors)
    const hasVisitor = v && Number.isFinite(+v.lat) && Number.isFinite(+v.lon) && v.lat !== '—'
    if (hasVisitor) {
      markers.push({
        location: [+v.lat, +v.lon],
        size: 0.085,
        color: orange,
        id: 'visitor',
      })
      const hub = GLOBE_CITIES.find(c => c.hub) || GLOBE_CITIES[9]
      arcs.push({
        id: 'visitor',
        from: [hub.lat, hub.lng],
        to:   [+v.lat, +v.lon],
        color: orange,
      })
    }

    // COBE maps a world-dot texture against baseColor — blend the theme's cyan
    // and green into the earth so land dots recolor with the active palette.
    // Near-black baseColor makes continents disappear; pure bg makes them grey.
    const mix = (a, b, t) => a + (b - a) * t
    const baseColor = theme.isLight
      ? [
          mix(0.62, cyan[0], 0.22),
          mix(0.68, cyan[1], 0.22),
          mix(0.74, green[2], 0.18),
        ]
      : [
          Math.max(0.12, mix(bg[0] * 0.4 + 0.1, cyan[0], 0.28)),
          Math.max(0.18, mix(bg[1] * 0.4 + 0.16, green[1], 0.22)),
          Math.max(0.24, mix(bg[2] * 0.4 + 0.2, cyan[2], 0.3)),
        ]

    const mapSamples = perfTier === 'low' ? 2500 : perfTier === 'med' ? 12000 : 16000

    const globe = createGlobe(canvas, {
      devicePixelRatio: dpr,
      width,
      height,
      phi: stateRef.current.phi,
      theta: stateRef.current.theta,
      dark: theme.isLight ? 0 : 1,
      diffuse: 1.15,
      scale: Math.min(stateRef.current.zoom * fitBaseRef.current, maxScaleRef.current),
      opacity: 1,
      mapSamples,
      mapBrightness: theme.isLight ? 4.2 : 5.6,
      mapBaseBrightness: 0.04,
      baseColor,
      markerColor: cyan,
      // Atmospheric glow follows the theme accent, not a fixed slate
      glowColor: theme.isLight
        ? [mix(0.55, cyan[0], 0.35), mix(0.65, cyan[1], 0.35), mix(0.75, green[2], 0.3)]
        : [mix(0.12, cyan[0], 0.45), mix(0.3, green[1], 0.35), mix(0.4, cyan[2], 0.5)],
      offset: [0, 0],
      markers,
      arcs,
      arcColor: green,
      arcWidth: 0.28,
      arcHeight: 0.18,
      markerElevation: 0.012,
      context: { antialias: true, alpha: true, powerPreference: 'default' },
    })

    globeRef.current = globe

    // prefers-reduced-motion: paint ONE static frame — no rAF loop, no packets, no spin.
    if (prefersReducedMotion()) {
      try {
        globe.update({
          phi: stateRef.current.phi,
          theta: stateRef.current.theta,
          scale: fitBaseRef.current,
          opacity: 1,
          markers,
        })
        pinVisitorShell()
      } catch { /* globe destroyed */ }
      return () => {
        try { globe.destroy() } catch { /* already torn down */ }
        globeRef.current = null
      }
    }

    // Flight packets — great-circle interp along hub routes, live-updated markers.
    // Two directions per route: req (client→hub, orange/cyan) and res (hub→client, green).
    const baseMarkers = markers
    const scratchPackets = []
    const hubRoutes = GLOBE_CONNECTIONS.filter(e => e.hub).map(e => ({
      from: GLOBE_CITIES[e.from],
      to:   GLOBE_CITIES[e.to],
    }))
    // Always include visitor→hub as the primary realtime client route when available.
    const clientRoutes = []
    if (hasVisitor) {
      const hub = GLOBE_CITIES.find(c => c.hub) || GLOBE_CITIES[9]
      clientRoutes.push({
        from: { id: 'visitor', name: visitor?.city || 'CLIENT', lat: +v.lat, lng: +v.lon },
        to:   hub,
        client: true,
      })
    }
    const allRoutes = [...clientRoutes, ...hubRoutes]
    const packetCount = perfTier === 'low' ? 2 : 8
    const REQ_KINDS = ['GET /api', 'POST /auth', 'WS SYNC', 'GET /cdn', 'RPC CALL', 'GET /status']
    const packetSeeds = Array.from({ length: packetCount }, (_, i) => ({
      route: i % Math.max(1, allRoutes.length),
      t: (i / packetCount),
      speed: 0.0016 + (i % 3) * 0.0006,
      // Alternate request (toward hub) and response (away from hub)
      dir: i % 2 === 0 ? 1 : -1,
      kind: REQ_KINDS[i % REQ_KINDS.length],
      logged: false,
    }))

    // COBE v2 has no onRender — drive phi/theta/scale via globe.update() each frame.
    // Parked while the tab is hidden or the globe is offscreen: stop scheduling
    // rAF entirely (the wrap IO / visibilitychange effect restarts us).
    sleepingRef.current = false
    const frame = (now) => {
      frameRef.current = frame
      if (docHiddenRef.current || offscreenRef.current || glLostRef.current || (visibleRef && visibleRef.current === false)) {
        sleepingRef.current = true
        rafRef.current = 0
        return
      }
      sleepingRef.current = false
      rafRef.current = requestAnimationFrame(frame)

      // ── FPS guard: rolling average, auto-downgrade quality if we drop ──
      const fr = fpsRef.current
      if (fr.last) {
        const dt = now - fr.last
        if (dt > 0 && dt < 200) {
          fr.samples = Math.min(60, fr.samples + 1)
          const inst = 1000 / dt
          fr.avg += (inst - fr.avg) * 0.08
        }
      }
      fr.last = now
      if (fr.samples === 30 || fr.samples === 60) {
        const rounded = Math.round(fr.avg)
        setFps(rounded)
        // Critically slow (< 20fps) → jump straight to low; otherwise step down.
        if (rounded < 20 && perfTierRef.current !== 'low') setPerfTier('low')
        else if (rounded < 40 && perfTierRef.current === 'high') setPerfTier('med')
        else if (rounded < 28 && perfTierRef.current === 'med') setPerfTier('low')
      }

      const s = stateRef.current

      // Focus animation (ease-out cubic)
      if (s.focusAnim) {
        const fa = s.focusAnim
        if (!fa.t0) fa.t0 = now
        const t = Math.min(1, (now - fa.t0) / fa.dur)
        const e = 1 - Math.pow(1 - t, 3)
        s.phi = fa.fromPhi + (fa.toPhi - fa.fromPhi) * e
        s.theta = fa.fromTheta + (fa.toTheta - fa.fromTheta) * e
        if (t >= 1) {
          s.focusAnim = null
          s.velPhi = 0.0012
        }
      } else if (!s.drag) {
        if (autoRotateRef.current) s.phi += s.velPhi
        // Gentle theta settle toward current tilt target
        if (Math.abs(s.velThetaDamp) > 0.0001) {
          s.theta = Math.max(-1.1, Math.min(1.1, s.theta + s.velThetaDamp))
          s.velThetaDamp *= 0.92
        }
      }

      // Advance flight packets along great circles (client ⇄ server realtime routing).
      // Reuse scratch slot objects to avoid allocating a new markers list every frame.
      let nextMarkers = baseMarkers
      if (packetsOnRef.current && allRoutes.length) {
        packetSeeds.forEach((p, i) => {
          p.t += p.speed
          if (p.t > 1) {
            p.t -= 1
            // Log a completed hop to the live routing ticker (skip placeholder rows)
            const r = allRoutes[p.route]
            const fromName = p.dir === 1 ? r.from?.name : r.to?.name
            const toName   = p.dir === 1 ? r.to?.name : r.from?.name
            if (fromName && toName && fromName !== '—' && toName !== '—') {
              const entry = {
                id: `${i}-${Date.now()}`,
                kind: p.dir === 1 ? p.kind : '200 OK',
                from: fromName,
                to: toName,
                dir: p.dir,
                ms: 8 + Math.floor(Math.random() * 40),
              }
              routeLogRef.current = [entry, ...routeLogRef.current].slice(0, 6)
              // Throttle React state sync — the rAF loop owns the log; UI polls it
              if (now - routeSyncRef.current > 400) {
                routeSyncRef.current = now
                setRouteLog(routeLogRef.current)
              }
            }
          }
          const r = allRoutes[p.route]
          // dir 1 = toward hub (request), -1 = away from hub (response)
          const a = p.dir === 1 ? r.from : r.to
          const b = p.dir === 1 ? r.to : r.from
          const lat = a.lat + (b.lat - a.lat) * p.t
          const lng = a.lng + (b.lng - a.lng) * p.t
          // Requests glow orange/cyan; responses glow green
          const color = p.dir === 1
            ? (r.client ? orange : cyan)
            : green
          const slot = scratchPackets[i] || (scratchPackets[i] = { id: `pkt-${i}`, location: [0, 0], size: 0.02, color: green })
          slot.location[0] = lat
          slot.location[1] = lng
          slot.size = r.client && p.dir === 1 ? 0.032 : 0.022
          slot.color = color
        })
        nextMarkers = baseMarkers.concat(scratchPackets.slice(0, packetSeeds.length))
      }

      // Zero-area canvas (hidden ancestor, entrance) — cobe drawArrays with
      // no drawable area throws INVALID_OPERATION every frame; skip paint +
      // pin until geometry is real. The loop keeps running (cheap ref read).
      const _gw = geomRef.current.w | 0, _gh = geomRef.current.h | 0
      if (_gw >= 2 && _gh >= 2) {
      try {
        globe.update({
          phi: s.phi,
          theta: s.theta,
          // Centered exactly (offset [0, 0]) and capped so the disc stays
          // inside the live shell instead of clipping one edge at max zoom.
          scale: Math.min(s.zoom * fitBaseRef.current, maxScaleRef.current),
          opacity: 1,
          offset: GLOBE_CENTER_OFFSET,
          markers: nextMarkers,
        })
        pinVisitorShell()
      } catch { /* globe destroyed */ }
      }
    }
    frameRef.current = frame
    rafRef.current = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
      frameRef.current = null
      try { globe.destroy() } catch { /* already torn down */ }
      globeRef.current = null
    }
  }, [themeKey, visitor, perfTier, visibleRef])

  // ── ResizeObserver — resize the live globe (no full recreate) ──
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap || typeof ResizeObserver === 'undefined') return
    let t = 0
    let lastW = 0, lastH = 0
    const ro = new ResizeObserver(entries => {
      const r = entries[0]?.contentRect
      if (!r) return
      if (Math.abs(r.width - lastW) < 24 && Math.abs(r.height - lastH) < 24) return
      lastW = r.width; lastH = r.height
      clearTimeout(t)
      t = setTimeout(() => {
        const width = Math.max(240, Math.floor(wrap.clientWidth || r.width || 480))
        const height = Math.max(240, Math.floor(wrap.clientHeight || r.height || 360))
        syncGlobeGeom(width, height)
        geomRef.current = { w: wrap.clientWidth || r.width || 480, h: wrap.clientHeight || r.height || 360 }
        const g = globeRef.current
        if (g) {
          try {
            // COBE accepts width/height updates without tearing down WebGL
            g.update({ width, height })
            return
          } catch { /* fall through to recreate */ }
        }
        setThemeKey(k => k + 1)
      }, 220)
    })
    ro.observe(wrap)
    return () => { clearTimeout(t); ro.disconnect() }
  }, [])

  // ── Offscreen / hidden-tab pause — park the globe rAF loop, restart on visible ──
  useEffect(() => {
    const wrap = wrapRef.current
    docHiddenRef.current = typeof document !== 'undefined' && document.hidden
    const kick = () => {
      docHiddenRef.current = typeof document !== 'undefined' && document.hidden
      if (!docHiddenRef.current && !offscreenRef.current && sleepingRef.current && frameRef.current) {
        sleepingRef.current = false
        try { cancelAnimationFrame(rafRef.current) } catch { /* noop */ }
        rafRef.current = requestAnimationFrame(frameRef.current)
      }
    }
    const onVis = () => kick()
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVis)
    let obs = null
    if (wrap && typeof IntersectionObserver !== 'undefined') {
      offscreenRef.current = false
      obs = new IntersectionObserver(([e]) => {
        offscreenRef.current = !e.isIntersecting
        if (e.isIntersecting) kick()
      }, { threshold: 0 })
      obs.observe(wrap)
    }
    return () => {
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVis)
      if (obs) obs.disconnect()
    }
  }, [])

  // ── Browser zoom (ctrl+wheel) — resync dpr/size so chrome stays aligned ──
  useEffect(() => {
    let t = 0
    let lastDpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio
    const resync = () => {
      clearTimeout(t)
      t = setTimeout(() => {
        const dpr = window.devicePixelRatio || 1
        const wrap = wrapRef.current
        const g = globeRef.current
        const width = Math.max(240, Math.floor(wrap?.clientWidth || 480))
        const height = Math.max(240, Math.floor(wrap?.clientHeight || 360))
        syncGlobeGeom(width, height)
        geomRef.current = { w: wrap?.clientWidth || 480, h: wrap?.clientHeight || 360 }
        if (g) {
          try {
            // COBE multiplies by devicePixelRatio — pass CSS pixels again
            g.update({ width, height, devicePixelRatio: pickGlobeDpr(perfTierRef.current) })
          } catch { /* ignore */ }
        }
        // Force CSS anchor labels / chrome to re-measure after zoom
        wrap?.dispatchEvent(new Event('resize'))
        lastDpr = dpr
      }, 180)
    }
    window.addEventListener('resize', resync)
    const vv = window.visualViewport
    vv?.addEventListener('resize', resync)
    vv?.addEventListener('scroll', resync)
    return () => {
      clearTimeout(t)
      window.removeEventListener('resize', resync)
      vv?.removeEventListener('resize', resync)
      vv?.removeEventListener('scroll', resync)
    }
  }, [])

  // ── City label collision: hide stacked labels (keep hub / focused) ──
  useEffect(() => {
    const resolveCollisions = () => {
      const wrap = wrapRef.current
      if (!wrap) return
      const els = Array.from(wrap.querySelectorAll('.globe-city-label, .globe-arc-label'))
      els.forEach((el) => el.removeAttribute('data-collide'))
      const rank = (el) =>
        el.classList.contains('is-focus') ? 0 : el.classList.contains('is-hub') ? 1 : 2
      const candidates = els
        .filter((el) => (el.style.opacity || '1') !== '0')
        .sort((a, b) => rank(a) - rank(b))
      // Floating labels must never drift over the top-bar chips row.
      const topRect = wrap.querySelector('.globe-top-bar')?.getBoundingClientRect() || null
      const hitsTopBar = (r) => topRect && !(
        r.right < topRect.left ||
        r.left > topRect.right ||
        r.bottom < topRect.top ||
        r.top > topRect.bottom
      )
      const kept = []
      for (const el of candidates) {
        const r = el.getBoundingClientRect()
        if (r.width === 0) continue
        if (hitsTopBar(r)) { el.setAttribute('data-collide', ''); continue }
        const overlap = kept.some((k) => {
          const kr = k.getBoundingClientRect()
          return !(
            r.right < kr.left - 6 ||
            r.left > kr.right + 6 ||
            r.bottom < kr.top - 6 ||
            r.top > kr.bottom + 6
          )
        })
        if (overlap) el.setAttribute('data-collide', '')
        else kept.push(el)
      }
    }
    const id = setInterval(resolveCollisions, 350)
    resolveCollisions()
    return () => clearInterval(id)
  }, [focusCity])

  // ── Radar clearance: the top bar wraps (title 100% + chips + stats) on
  // narrow shells, so a fixed radar top ends up underneath the stats panel
  // (stats z-5 paints over radar z-4). Track the bar height instead.
  useEffect(() => {
    const wrap = wrapRef.current
    const bar = wrap?.querySelector('.globe-top-bar')
    if (!wrap || !bar) return
    const sync = () => {
      wrap.style.setProperty('--globe-chrome-h', `${Math.ceil(bar.getBoundingClientRect().height)}px`)
    }
    sync()
    const obs = new ResizeObserver(sync)
    obs.observe(bar)
    window.addEventListener('resize', sync)
    return () => {
      obs.disconnect()
      window.removeEventListener('resize', sync)
    }
  }, [])

  // ── Pointer + keyboard (drag-rotate XYZ, pinch/wheel zoom, arrows) ──
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const s = stateRef.current

    const getXY = e => {
      const r = canvas.getBoundingClientRect()
      const src = e.touches ? e.touches[0] : e
      return { x: src.clientX - r.left, y: src.clientY - r.top }
    }

    const onDown = e => {
      const { x, y } = getXY(e)
      s.drag = { startX: x, startY: y, lastX: x, lastY: y, lastPhi: s.phi, lastTheta: s.theta }
      s.velPhiDamp = 0
      s.velThetaDamp = 0
      s.focusAnim = null
      canvas.style.cursor = 'grabbing'
    }
    const onMove = e => {
      if (e.touches && e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX
        const dy = e.touches[0].clientY - e.touches[1].clientY
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (!s.pinch) s.pinch = { dist0: dist, zoom0: s.zoom }
        else s.zoom = clampGlobeZoom(s.pinch.zoom0 * (dist / s.pinch.dist0))
        return
      }
      s.pinch = null
      const { x, y } = getXY(e)
      if (s.drag) {
        const dx = x - s.drag.lastX
        const dy = y - s.drag.lastY
        s.velPhiDamp = dx * 0.002
        s.phi = s.drag.lastPhi + (x - s.drag.startX) * 0.006
        s.theta = Math.max(-1.1, Math.min(1.1,
          s.drag.lastTheta + (y - s.drag.startY) * 0.004
        ))
        s.velThetaDamp = dy * 0.0015
        s.drag.lastX = x
        s.drag.lastY = y
      }
    }
    const onUp = () => {
      if (s.drag) {
        s.velPhi = Math.max(0.0004, Math.min(0.006, Math.abs(s.velPhiDamp))) * Math.sign(s.velPhiDamp || 1)
      }
      s.drag = null
      canvas.style.cursor = 'grab'
    }

    const onWheel = e => {
      e.preventDefault()
      s.zoom = clampGlobeZoom(s.zoom - e.deltaY * 0.0008)
    }

    const onKey = e => {
      const step = e.shiftKey ? 0.12 : 0.05
      if (e.key === 'ArrowLeft')  { s.phi -= step; s.focusAnim = null; e.preventDefault() }
      if (e.key === 'ArrowRight') { s.phi += step; s.focusAnim = null; e.preventDefault() }
      if (e.key === 'ArrowUp')    { s.theta = Math.min(1.1, s.theta + step); s.focusAnim = null; e.preventDefault() }
      if (e.key === 'ArrowDown')  { s.theta = Math.max(-1.1, s.theta - step); s.focusAnim = null; e.preventDefault() }
      if (e.key === '+' || e.key === '=') { s.zoom = clampGlobeZoom(s.zoom + 0.08) }
      if (e.key === '-' || e.key === '_') { s.zoom = clampGlobeZoom(s.zoom - 0.08) }
    }

    canvas.addEventListener('mousedown',  onDown)
    canvas.addEventListener('touchstart', onDown, { passive: true })
    window.addEventListener('mousemove',  onMove)
    window.addEventListener('touchmove',  onMove, { passive: true })
    window.addEventListener('mouseup',    onUp)
    window.addEventListener('touchend',   onUp)
    canvas.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('keydown', onKey)
    canvas.style.cursor = 'grab'
    canvas.tabIndex = 0
    canvas.setAttribute('role', 'application')
    canvas.setAttribute('aria-label', 'Interactive global network globe. Drag to rotate, scroll to zoom, arrow keys to pan.')

    return () => {
      canvas.removeEventListener('mousedown',  onDown)
      canvas.removeEventListener('touchstart', onDown)
      window.removeEventListener('mousemove',  onMove)
      window.removeEventListener('touchmove',  onMove)
      window.removeEventListener('mouseup',    onUp)
      window.removeEventListener('touchend',   onUp)
      canvas.removeEventListener('wheel',      onWheel)
      window.removeEventListener('keydown',    onKey)
    }
  }, [])

  // ── WebGL context loss — park the loop, rebuild on restore ──
  // A lost context makes every drawArrays fail (console spam); preventDefault
  // allows restoration, then the globe is recreated on the same canvas.
  const glLostRef = useRef(false)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onLost = (e) => { e.preventDefault(); glLostRef.current = true }
    const onRestored = () => { glLostRef.current = false; setThemeKey(k => k + 1) }
    canvas.addEventListener('webglcontextlost', onLost, false)
    canvas.addEventListener('webglcontextrestored', onRestored, false)
    return () => {
      canvas.removeEventListener('webglcontextlost', onLost, false)
      canvas.removeEventListener('webglcontextrestored', onRestored, false)
    }
  }, [])

  const hasVisitorCoords = visitor && Number.isFinite(+visitor.lat) && visitor.lat !== '—'
  // Never render empty/placeholder routing rows (a clipped row reads as a stray "• 000" chip).
  const validRouteLog = routeLog.filter(e =>
    e && e.kind && e.from && e.to && e.from !== '—' && e.to !== '—' && Number.isFinite(e.ms)
  )
  const arcCount = GLOBE_CONNECTIONS.length + (hasVisitorCoords ? 1 : 0)
  const nodeCount = GLOBE_CITIES.length + (hasVisitorCoords ? 1 : 0)
  const hubLinks = GLOBE_CONNECTIONS.filter(e => e.hub).length
  // Threshold-colored telemetry (green <150ms, amber <400ms, red above).
  const latencyColor = latencyMs < 150 ? 'var(--green)' : latencyMs < 400 ? 'var(--orange)' : 'var(--red)'
  const latencyHint = monitor?.avgMs != null
    ? `Live average across ${monitor.up} monitored services (/api/monitor/status)`
    : 'Simulated link latency — the live average appears once /api/monitor/status responds'
  const statItems = [
    { label: 'NODES',   value: `${nodeCount}`, color: 'var(--cyan)',  hint: `${hubLinks} hub-linked routes` },
    { label: 'ARCS',    value: `${arcCount}`,  color: 'var(--green)', hint: 'Active connection arcs on the globe' },
    { label: 'LATENCY', value: `${latencyMs}ms`, color: latencyColor, hint: latencyHint },
    { label: 'UPTIME',  value: monitor?.uptime ? `${monitor.uptime}%` : '99.99%', color: 'var(--green)',
      hint: monitor ? `Services up: ${monitor.up}/${monitor.total}` : 'Service uptime — live once the monitor responds' },
    { label: 'FPS',     value: `${fps}`,       color: fps < 30 ? 'var(--orange)' : 'var(--cyan)', hint: `Render tier: ${perfTier}` },
  ]

  return (
    <div
      className="globe-network-shell"
      ref={wrapRef}
      data-globe-tone={themeTone}
      onDoubleClick={recenterGlobe}
      style={{
        width: '100%', height: '100%',
        position: 'relative', overflow: 'hidden',
        background: 'transparent',
      }}
    >
      {/* Top chrome — title · controls · stats strip (INFO popover on mobile) */}
      <div className="globe-top-bar">
        <div className="globe-network-title" title="GLOBAL NETWORK · LIVE CONNECTION MAP">
          GLOBAL NETWORK · LIVE CONNECTION MAP
        </div>

        <div className="globe-mode-chips" role="toolbar" aria-label="Globe display controls">
          <button
            type="button"
            className={`globe-mode-chip${autoRotate ? ' is-on' : ''}`}
            onClick={() => setAutoRotate(v => !v)}
            aria-pressed={autoRotate}
            title={autoRotate ? 'Pause auto-rotate' : 'Resume auto-rotate'}
          >
            <span className="globe-mode-chip-dot" aria-hidden />
            {autoRotate ? 'AUTO' : 'LOCK'}
          </button>
          <button
            type="button"
            className={`globe-mode-chip${packetsOn ? ' is-on' : ''}`}
            onClick={() => setPacketsOn(v => !v)}
            aria-pressed={packetsOn}
            title={packetsOn ? 'Hide flight packets' : 'Show flight packets'}
          >
            <span className="globe-mode-chip-dot" aria-hidden />
            {packetsOn ? 'PKT' : 'OFF'}
          </button>
          <button
            type="button"
            className="globe-mode-chip"
            onClick={exportPng}
            title="Export node map as PNG"
          >
            <span className="globe-mode-chip-dot" aria-hidden />
            PNG
          </button>
          <button
            type="button"
            className="globe-mode-chip"
            onClick={() => { recenterGlobe(); flashToast('View recentered') }}
            title="Recenter globe (or double-click)"
          >
            <span className="globe-mode-chip-dot" aria-hidden />
            CENTER
          </button>
          <button
            type="button"
            className={`globe-mode-chip globe-info-chip${showStats ? ' is-on' : ''}`}
            onClick={() => setShowStats(v => !v)}
            aria-expanded={showStats}
            aria-controls="globe-stats-popover"
            title="Toggle network statistics"
          >
            <span className="globe-mode-chip-dot" aria-hidden />
            INFO
          </button>
        </div>

        {/* Desktop strip — horizontal stat row with dividers */}
        <div className="globe-network-stats" aria-label="Network statistics">
          {statItems.map(s => (
            <div key={s.label} className="globe-stat-row" title={s.hint}>
              <span className="globe-stat-label">{s.label}</span>
              <span className="globe-stat-value" style={{ color: s.color }}>{s.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Mobile stats popover (desktop uses the inline strip) */}
      {showStats && (
        <div id="globe-stats-popover" className="globe-stats-popover" role="region" aria-label="Network statistics">
          {statItems.map(s => (
            <div key={s.label} className="globe-stat-row" title={s.hint}>
              <span className="globe-stat-label">{s.label}</span>
              <span className="globe-stat-value" style={{ color: s.color }}>{s.value}</span>
            </div>
          ))}
          <button type="button" className="globe-stats-close" onClick={() => setShowStats(false)}>
            CLOSE
          </button>
        </div>
      )}

      {/* Action toast (PNG export, recenter) */}
      {toast && (
        <div className="globe-toast" role="status">
          {toast}
        </div>
      )}

      {/* Mini radar inset — node azimuths + sweep. Focusable: Enter centers the hub. */}
      <Clickable as="div"
        className="globe-radar"
        aria-label={monitor && monitor.total > 0
          ? `Node radar: ${monitor.up} of ${monitor.total} services up. Each dot is a network node, green dots are hubs. Press Enter to focus the hub.`
          : 'Node radar: each dot is a network node, green dots are hubs. Press Enter to focus the hub.'}
        title="Node radar — each dot is a network node (green = hub); the sweep marks live tracking. Enter focuses the hub."
        onClick={() => { const hub = GLOBE_CITIES.find(c => c.hub); if (hub) focusOnCity(hub) }}
      >
        <canvas ref={radarRef} width={64} height={64} aria-hidden />
        <div className="globe-radar-label" aria-hidden>
          {monitor && monitor.total > 0 ? `${monitor.up}/${monitor.total} UP` : 'RADAR'}
        </div>
      </Clickable>

      {/* Satellites ring — decorative orbiting edge nodes */}
      <div className="globe-sat-ring" aria-hidden>
        <span className="globe-sat s1" />
        <span className="globe-sat s2" />
        <span className="globe-sat s3" />
      </div>

      {/* COBE canvas — fills entire panel (static fallback when WebGL is unavailable) */}
      {glFailed ? (
        <div className="globe-static-fallback" role="img" aria-label="Static network map (WebGL unavailable)">
          <div className="globe-static-fallback-title">GLOBAL NETWORK · STATIC MAP</div>
          <div className="globe-static-fallback-sub">WEBGL UNAVAILABLE — LIVE DATA BELOW</div>
          <div className="globe-static-fallback-nodes">
            {GLOBE_CITIES.map(c => (
              <span key={c.id} className={`globe-static-fallback-node${c.hub ? ' is-hub' : ''}`}>{c.name}</span>
            ))}
          </div>
        </div>
      ) : (
        <canvas ref={canvasRef} style={{ display: 'block', position: 'absolute', inset: 0, width: '100%', height: '100%', margin: 'auto' }} />
      )}

      {/* Hub live-badge pulse ring — anchored to Riyadh when CSS anchors exist */}
      {anchorsOk && (
        <div
          className="globe-hub-ring"
          style={{
            positionAnchor: '--cobe-ruh',
            opacity: 'var(--cobe-visible-ruh, 0)',
          }}
          aria-hidden
        />
      )}

      {/* Bindable city labels — CSS Anchor Positioning (Chrome 125+) */}
      {anchorsOk && (
        <div className="globe-label-layer" aria-hidden={false}>
          {GLOBE_CITIES.map(c => (
            <Clickable
              key={c.id}
              className={`globe-city-label${c.hub ? ' is-hub' : ''}${focusCity === c.id ? ' is-focus' : ''}`}
              style={{
                positionAnchor: `--cobe-${c.id}`,
                opacity: `var(--cobe-visible-${c.id}, 0)`,
                filter: `blur(calc((1 - var(--cobe-visible-${c.id}, 0)) * 4px))`,
              }}
              onClick={() => focusOnCity(c)}
            >
              {c.name}
              {c.hub && <span className="globe-city-hub-dot" />}
            </Clickable>
          ))}

          {/* Hub-route arc labels */}
          {GLOBE_CONNECTIONS.filter(e => e.hub).map(e => {
            const a = GLOBE_CITIES[e.from]
            const b = GLOBE_CITIES[e.to]
            const id = `${a.id}-${b.id}`
            return (
              <div
                key={id}
                className="globe-arc-label"
                style={{
                  positionAnchor: `--cobe-arc-${id}`,
                  opacity: `var(--cobe-visible-arc-${id}, 0)`,
                  filter: `blur(calc((1 - var(--cobe-visible-arc-${id}, 0)) * 3px))`,
                }}
              >
                {a.id.toUpperCase()} → {b.id.toUpperCase()}
              </div>
            )
          })}
        </div>
      )}

      {/* City chip rail — works without CSS anchors; click to focus */}
      <div className="globe-city-rail" role="toolbar" aria-label="Focus a network node">
        {GLOBE_CITIES.filter(c => c.hub || ['nyc', 'lon', 'tyo', 'sin', 'dxb'].includes(c.id)).map(c => (
          <button
            key={c.id}
            type="button"
            className={`globe-city-chip${focusCity === c.id ? ' is-focus' : ''}${c.hub ? ' is-hub' : ''}`}
            onClick={() => focusOnCity(c)}
            title={`Focus ${c.name}`}
          >
            {c.hub && <span className="globe-city-hub-dot" />}
            {c.name}
          </button>
        ))}
      </div>

      {/* Node detail side panel */}
      {selectedNode && (
        <aside
          className="globe-node-panel"
          role="dialog"
          aria-label={`${selectedNode.name} node details`}
        >
          <header className="globe-node-panel-head">
            <div>
              <div className="globe-node-panel-title">
                {selectedNode.hub && <span className="globe-city-hub-dot" />}
                {selectedNode.name}
              </div>
              <div className="globe-node-panel-sub">
                {selectedNode.region} · {selectedNode.hub ? 'CORE HUB' : 'EDGE NODE'}
              </div>
            </div>
            <button
              type="button"
              className="globe-node-panel-close"
              onClick={() => { setSelectedNode(null); setFocusCity(null) }}
              aria-label="Close node details"
            >
              ✕
            </button>
          </header>

          <div className="globe-node-panel-grid">
            {[
              ['STATUS',   'ONLINE',           'ok'],
              ['LATENCY',  `${8 + (selectedNode.name.length * 3) % 22}ms`, 'ok'],
              ['LINKS',    `${GLOBE_CONNECTIONS.filter(e =>
                GLOBE_CITIES[e.from].id === selectedNode.id || GLOBE_CITIES[e.to].id === selectedNode.id
              ).length}`, 'ok'],
              ['LOAD',     `${28 + (selectedNode.name.charCodeAt(0) % 40)}%`, 'warn'],
              ['ROLE',     selectedNode.hub ? 'TRANSIT' : 'PEER', 'ok'],
              ['PROTO',    'COBE/QUIC',        'ok'],
            ].map(([label, val, tone]) => (
              <div key={label} className="globe-node-panel-row">
                <span>{label}</span>
                <strong data-tone={tone}>{val}</strong>
              </div>
            ))}
          </div>

          <div className="globe-node-panel-spark" aria-hidden>
            {Array.from({ length: 14 }, (_, i) => (
              <i key={i} style={{ height: `${28 + ((i * 17 + selectedNode.name.length * 5) % 52)}%` }} />
            ))}
          </div>
          <div className="globe-node-panel-foot">THROUGHPUT · LAST 60s</div>
        </aside>
      )}

      {/* Live routing ticker — client ⇄ server hops */}
      {validRouteLog.length > 0 && (
        <div className="globe-route-log" role="log" aria-live="polite" aria-label="Live routing hops">
          {validRouteLog.map((e, i) => (
            <div key={e.id} className="globe-route-log-row" style={{ opacity: 1 - i * 0.14 }}>
              <span className="globe-route-log-dir" data-dir={e.dir === 1 ? 'up' : 'down'}>
                {e.dir === 1 ? '▲' : '▼'}
              </span>
              <span className="globe-route-log-kind" data-dir={e.dir === 1 ? 'up' : 'down'}>{e.kind}</span>
              <span className="globe-route-log-path">
                {e.from} → {e.to}
              </span>
              <span className="globe-route-log-ms">{e.ms}ms</span>
            </div>
          ))}
        </div>
      )}

      {/* Visitor HUD — pinned to the live marker coordinates every frame */}
      <VisitorHud visitor={visitor} shellRef={visitorShellRef} />

      <style>{`
        .globe-label-layer {
          position: absolute; inset: 0;
          pointer-events: none;
          z-index: 2;
          overflow: hidden;
        }
        .globe-city-label {
          position: absolute;
          bottom: anchor(top);
          left: anchor(center);
          translate: -50% 0;
          margin-bottom: 6px;
          font-family: var(--font-mono);
          font-size: 10px;
          letter-spacing: 1.5px;
          color: var(--cyan);
          white-space: nowrap;
          max-width: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
          pointer-events: auto;
          cursor: pointer;
          padding: 2px 6px;
          border-radius: 3px;
          background: color-mix(in srgb, var(--bg) 55%, transparent);
          border: 1px solid color-mix(in srgb, var(--cyan) 18%, transparent);
          transition: opacity 0.18s ease-out, filter 0.18s ease-out, transform 0.2s ease, color 0.2s ease;
          user-select: none;
        }
        .globe-city-label:hover,
        .globe-city-label.is-focus {
          color: var(--green);
          border-color: color-mix(in srgb, var(--green) 45%, transparent);
          transform: translate(-50%, -2px) scale(1.06);
        }
        .globe-city-label.is-hub {
          color: var(--green);
          border-color: color-mix(in srgb, var(--green) 35%, transparent);
          font-weight: 700;
        }
        .globe-city-label[data-collide],
        .globe-arc-label[data-collide] {
          opacity: 0 !important;
          pointer-events: none !important;
          filter: none !important;
        }
        .globe-city-hub-dot {
          display: inline-block;
          width: 4px; height: 4px;
          border-radius: 50%;
          background: var(--green);
          box-shadow: 0 0 5px var(--green);
          margin-right: 4px;
          vertical-align: middle;
          animation: hudPulse 2s ease-in-out infinite;
          flex-shrink: 0;
        }
        .globe-hub-ring {
          position: absolute;
          position-anchor: --cobe-ruh;
          top: anchor(center);
          left: anchor(center);
          translate: -50% -50%;
          width: 18px; height: 18px;
          border-radius: 50%;
          border: 1.25px solid var(--green);
          box-shadow: 0 0 10px color-mix(in srgb, var(--green) 45%, transparent);
          pointer-events: none;
          z-index: 2;
          animation: hubRing 2.2s ease-out infinite;
          transition: opacity 0.18s ease-out;
        }
        @keyframes hubRing {
          0%   { transform: translate(-50%,-50%) scale(0.75); }
          70%  { transform: translate(-50%,-50%) scale(1.55); }
          100% { transform: translate(-50%,-50%) scale(0.75); }
        }
        .globe-arc-label {
          position: absolute;
          bottom: anchor(top);
          left: anchor(center);
          translate: -50% 0;
          font-family: var(--font-mono);
          font-size: 9px;
          letter-spacing: 1.2px;
          color: var(--green);
          opacity: 0.7;
          white-space: nowrap;
          max-width: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
          pointer-events: none;
          text-shadow: 0 0 8px color-mix(in srgb, var(--green) 40%, transparent);
          transition: opacity 0.18s ease-out;
        }
        /* ── Top chrome: flex row, title | controls | stats ── */
        .globe-top-bar {
          position: absolute;
          top: 0; left: 0; right: 0;
          z-index: 5;
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          pointer-events: none;
        }
        .globe-top-bar > * { pointer-events: auto; }
        .globe-top-bar .globe-network-title {
          flex: 1 1 auto;
          min-width: 0;
          font-family: var(--font-mono);
          font-size: 11px;
          letter-spacing: 2.5px;
          color: var(--cyan);
          opacity: 0.8;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          pointer-events: none;
          text-shadow: 0 0 10px color-mix(in srgb, var(--cyan) 18%, transparent);
        }
        .globe-top-bar .globe-mode-chips {
          position: static;
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          flex: 0 1 auto;
          min-width: 0;
        }
        .globe-top-bar .globe-network-stats {
          flex: 0 0 auto;
          display: flex;
          flex-direction: row;
          align-items: center;
          gap: 0;
          padding: 6px 10px;
          border-radius: 6px;
          background: rgba(0,0,0,0.08);
          border: 1px solid color-mix(in srgb, var(--cyan) 8%, transparent);
          backdrop-filter: blur(6px);
          -webkit-backdrop-filter: blur(6px);
          pointer-events: none;
        }
        .globe-top-bar .globe-stat-row + .globe-stat-row {
          border-left: 1px solid color-mix(in srgb, var(--cyan) 16%, transparent);
          padding-left: 10px;
          margin-left: 10px;
        }
        /* Brighten muted chrome text on dark shells (WCAG small-text contrast). */
        .globe-top-bar .globe-stat-label,
        .globe-radar-label,
        .globe-top-bar .globe-mode-chip {
          color: color-mix(in srgb, var(--muted) 50%, #ffffff);
        }
        .globe-top-bar .globe-mode-chip.is-on { color: var(--green); }
        /* Mobile stats live in the INFO popover — the toolbar chip is desktop-hidden. */
        .globe-info-chip { display: none; }
        .globe-stats-popover {
          position: absolute;
          top: calc(var(--globe-chrome-h, 72px) + 8px);
          right: 12px;
          z-index: 6;
          display: flex;
          flex-direction: column;
          gap: 6px;
          min-width: 190px;
          padding: 10px 12px;
          border-radius: 8px;
          background: color-mix(in srgb, var(--bg) 78%, transparent);
          border: 1px solid color-mix(in srgb, var(--cyan) 24%, transparent);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          box-shadow: 0 8px 28px rgba(0,0,0,0.45);
        }
        .globe-stats-popover .globe-stat-row + .globe-stat-row {
          border-left: 0;
          padding-left: 0;
          margin-left: 0;
          border-top: 1px solid color-mix(in srgb, var(--cyan) 12%, transparent);
          padding-top: 6px;
        }
        .globe-stats-close {
          margin-top: 4px;
          align-self: flex-end;
          font-family: var(--font-mono);
          font-size: 11px;
          letter-spacing: 1.6px;
          color: var(--cyan);
          background: transparent;
          border: 1px solid color-mix(in srgb, var(--cyan) 32%, transparent);
          border-radius: 4px;
          padding: 4px 10px;
          cursor: pointer;
        }
        .globe-stats-close:focus-visible { outline: 2px solid var(--cyan); outline-offset: 2px; }
        .globe-toast {
          position: absolute;
          bottom: 64px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 6;
          font-family: var(--font-mono);
          font-size: 11px;
          letter-spacing: 1.4px;
          color: var(--green);
          background: color-mix(in srgb, var(--bg) 78%, transparent);
          border: 1px solid color-mix(in srgb, var(--green) 36%, transparent);
          border-radius: 4px;
          padding: 6px 12px;
          white-space: nowrap;
          pointer-events: none;
        }
        .globe-stat-row {
          display: flex;
          gap: 10px;
          align-items: center;
        }
        .globe-stat-label {
          font-family: var(--font-mono);
          font-size: 11px;
          letter-spacing: 2px;
          color: color-mix(in srgb, var(--muted) 50%, #ffffff);
        }
        .globe-stat-value {
          font-family: var(--font-mono);
          font-size: 11px;
          font-weight: 700;
        }
        .globe-mode-chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          height: 26px;
          padding: 0 10px;
          font-family: var(--font-mono);
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 1.6px;
          background: color-mix(in srgb, var(--bg) 62%, transparent);
          border: 1px solid color-mix(in srgb, var(--border) 55%, transparent);
          border-radius: 4px;
          cursor: pointer;
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          transition: color 0.18s ease, border-color 0.18s ease, background 0.18s ease, transform 0.12s ease;
          user-select: none;
          line-height: 1;
          flex-shrink: 0;
        }
        .globe-mode-chip-dot {
          width: 5px; height: 5px;
          border-radius: 50%;
          background: var(--muted);
          opacity: 0.55;
          transition: background 0.18s ease, box-shadow 0.18s ease, opacity 0.18s ease;
          flex-shrink: 0;
        }
        .globe-mode-chip.is-on {
          color: var(--green);
          border-color: color-mix(in srgb, var(--green) 38%, transparent);
          background: color-mix(in srgb, var(--green) 8%, color-mix(in srgb, var(--bg) 70%, transparent));
        }
        .globe-mode-chip.is-on .globe-mode-chip-dot {
          background: var(--green);
          opacity: 1;
          box-shadow: 0 0 6px var(--green);
        }
        .globe-mode-chip:hover {
          color: var(--cyan);
          border-color: color-mix(in srgb, var(--cyan) 40%, transparent);
          transform: translateY(-1px);
        }
        .globe-mode-chip:focus-visible {
          outline: 2px solid var(--cyan);
          outline-offset: 2px;
        }
        .globe-mode-chip:active {
          transform: translateY(0);
        }
        /* Mini radar inset */
        .globe-radar {
          position: absolute;
          left: 16px; top: calc(var(--globe-chrome-h, 72px) + 12px);
          z-index: 4;
          width: 64px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          opacity: 0.9;
          cursor: pointer;
          border-radius: 8px;
        }
        .globe-radar:focus-visible {
          outline: 2px solid var(--cyan);
          outline-offset: 3px;
        }
        .globe-radar canvas {
          display: block;
          width: 64px; height: 64px;
          border-radius: 50%;
          border: 1px solid color-mix(in srgb, var(--cyan) 22%, transparent);
          background: color-mix(in srgb, var(--bg) 55%, transparent);
          backdrop-filter: blur(4px);
          -webkit-backdrop-filter: blur(4px);
        }
        .globe-radar-label {
          font-family: var(--font-mono);
          font-size: 11px;
          letter-spacing: 1.2px;
          white-space: nowrap;
        }
        .globe-network-shell[data-globe-tone="light"] .globe-radar canvas {
          background: color-mix(in srgb, var(--bg2, #fff) 70%, transparent);
          border-color: color-mix(in srgb, var(--cyan) 28%, transparent);
        }
        .globe-sat-ring {
          position: absolute;
          inset: 12% 18%;
          pointer-events: none;
          z-index: 1;
          animation: satSpin 48s linear infinite;
        }
        .globe-sat {
          position: absolute;
          width: 4px; height: 4px;
          border-radius: 50%;
          background: var(--cyan);
          box-shadow: 0 0 8px var(--cyan);
          opacity: 0.55;
        }
        .globe-sat.s1 { top: 0; left: 50%; }
        .globe-sat.s2 { top: 50%; right: 0; }
        .globe-sat.s3 { bottom: 0; left: 28%; }
        @keyframes satSpin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        .globe-city-rail {
          position: absolute;
          left: 14px; right: 14px; bottom: 10px;
          z-index: 3;
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          pointer-events: none;
        }
        @supports (anchor-name: --x) {
          .globe-city-rail { display: none; }
        }
        .globe-city-chip {
          pointer-events: auto;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          height: 24px;
          padding: 0 8px;
          font-family: var(--font-mono);
          font-size: 10px;
          font-weight: 500;
          letter-spacing: 1.2px;
          color: var(--muted);
          background: color-mix(in srgb, var(--bg) 62%, transparent);
          border: 1px solid color-mix(in srgb, var(--border) 55%, transparent);
          border-radius: 4px;
          cursor: pointer;
          transition: color 0.18s ease, border-color 0.18s ease, transform 0.12s ease;
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          line-height: 1;
          white-space: nowrap;
        }
        .globe-city-chip:hover,
        .globe-city-chip.is-focus {
          color: var(--cyan);
          border-color: color-mix(in srgb, var(--cyan) 42%, transparent);
          transform: translateY(-1px);
        }
        .globe-city-chip:focus-visible {
          outline: 2px solid var(--cyan);
          outline-offset: 2px;
        }
        .globe-city-chip.is-hub {
          color: var(--green);
          border-color: color-mix(in srgb, var(--green) 38%, transparent);
        }
        .globe-city-chip .globe-city-hub-dot {
          width: 4px; height: 4px;
          margin-right: 0;
        }
        .globe-node-panel {
          position: absolute;
          top: 52px; right: 14px;
          width: min(240px, calc(100% - 28px));
          z-index: 5;
          border-radius: 6px;
          background: color-mix(in srgb, var(--bg) 82%, transparent);
          border: 1px solid color-mix(in srgb, var(--cyan) 22%, transparent);
          backdrop-filter: blur(10px);
          box-shadow: 0 12px 36px rgba(0,0,0,0.28);
          padding: 12px 12px 10px;
          font-family: var(--font-mono);
          animation: panelIn 0.22s ease;
        }
        @keyframes panelIn {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .globe-node-panel-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 8px;
          margin-bottom: 10px;
        }
        .globe-node-panel-title {
          font-family: var(--font-display);
          font-size: 15px;
          font-weight: 700;
          color: var(--text);
          letter-spacing: 0.3px;
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .globe-node-panel-sub {
          font-size: 10px;
          letter-spacing: 1.4px;
          color: var(--muted);
          margin-top: 2px;
        }
        .globe-node-panel-close {
          background: transparent;
          border: 1px solid transparent;
          color: var(--muted);
          font-size: 12px;
          cursor: pointer;
          padding: 2px 6px;
          border-radius: 3px;
          line-height: 1;
        }
        .globe-node-panel-close:hover {
          color: var(--orange);
          border-color: color-mix(in srgb, var(--orange) 35%, transparent);
        }
        .globe-node-panel-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 6px 10px;
        }
        .globe-node-panel-row {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .globe-node-panel-row span {
          font-size: 9px;
          letter-spacing: 1.4px;
          color: var(--muted);
        }
        .globe-node-panel-row strong {
          font-size: 12px;
          font-weight: 700;
          color: var(--cyan);
        }
        .globe-node-panel-row strong[data-tone="ok"]   { color: var(--green); }
        .globe-node-panel-row strong[data-tone="warn"] { color: var(--orange); }
        .globe-node-panel-spark {
          display: flex;
          align-items: flex-end;
          gap: 3px;
          height: 36px;
          margin-top: 12px;
          padding: 4px 2px;
          border-top: 1px solid color-mix(in srgb, var(--cyan) 14%, transparent);
        }
        .globe-node-panel-spark i {
          flex: 1;
          display: block;
          border-radius: 1px;
          background: linear-gradient(to top, color-mix(in srgb, var(--green) 55%, transparent), var(--cyan));
          opacity: 0.75;
          min-height: 4px;
        }
        .globe-node-panel-foot {
          margin-top: 6px;
          font-size: 9px;
          letter-spacing: 1.5px;
          color: var(--muted);
          text-align: right;
        }
        /* Live routing ticker */
        .globe-route-log {
          position: absolute;
          left: 14px; bottom: 52px;
          z-index: 4;
          display: flex;
          flex-direction: column;
          gap: 3px;
          pointer-events: none;
          max-width: min(340px, calc(100% - 28px));
          max-height: calc(100% - 160px);
          overflow: hidden;
        }
        .globe-route-log-row {
          display: flex;
          align-items: center;
          gap: 8px;
          font-family: var(--font-mono);
          font-size: 10px;
          letter-spacing: 0.6px;
          padding: 3px 8px;
          border-radius: 3px;
          background: color-mix(in srgb, var(--bg) 72%, transparent);
          border: 1px solid color-mix(in srgb, var(--cyan) 14%, transparent);
          backdrop-filter: blur(4px);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 100%;
          box-sizing: border-box;
          animation: routeIn 0.28s ease;
        }
        @keyframes routeIn {
          from { opacity: 0; transform: translateX(-8px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        .globe-route-log-dir {
          font-size: 9px;
          line-height: 1;
          width: 12px;
          text-align: center;
        }
        .globe-route-log-dir[data-dir="up"]   { color: var(--orange); }
        .globe-route-log-dir[data-dir="down"] { color: var(--green); }
        .globe-route-log-kind {
          font-weight: 700;
          min-width: 64px;
        }
        .globe-route-log-kind[data-dir="up"]   { color: var(--cyan); }
        .globe-route-log-kind[data-dir="down"] { color: var(--green); }
        .globe-route-log-path {
          color: var(--muted);
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .globe-route-log-ms {
          color: var(--cyan);
          font-weight: 700;
          font-size: 10px;
        }
        /* Theme-tone sync — chrome adapts to real --bg luminance */
        .globe-network-shell[data-globe-tone="light"] .globe-route-log-row {
          background: color-mix(in srgb, var(--bg2, var(--bg)) 82%, transparent);
          border-color: color-mix(in srgb, var(--cyan) 20%, transparent);
          box-shadow: 0 6px 18px rgba(21,48,74,0.08);
        }
        .globe-network-shell[data-globe-tone="light"] .globe-hub-ring {
          box-shadow: 0 0 12px color-mix(in srgb, var(--green) 40%, transparent);
        }
        /* Static fallback — WebGL unavailable (styled div + node list, no canvas) */
        .globe-static-fallback {
          position: absolute;
          inset: 52px 14px 46px;
          z-index: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 10px;
          border-radius: 8px;
          border: 1px dashed color-mix(in srgb, var(--cyan) 30%, transparent);
          background: color-mix(in srgb, var(--bg) 55%, transparent);
          padding: 16px;
          text-align: center;
          overflow: hidden;
        }
        .globe-static-fallback-title {
          font-family: var(--font-mono);
          font-size: 11px;
          letter-spacing: 2.5px;
          color: var(--cyan);
        }
        .globe-static-fallback-sub {
          font-family: var(--font-mono);
          font-size: 10px;
          letter-spacing: 1.5px;
          color: var(--muted);
        }
        .globe-static-fallback-nodes {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 6px;
          max-width: 100%;
        }
        .globe-static-fallback-node {
          font-family: var(--font-mono);
          font-size: 10px;
          letter-spacing: 1.2px;
          color: var(--muted);
          border: 1px solid color-mix(in srgb, var(--border) 55%, transparent);
          border-radius: 4px;
          padding: 2px 8px;
          white-space: nowrap;
        }
        .globe-static-fallback-node.is-hub {
          color: var(--green);
          border-color: color-mix(in srgb, var(--green) 38%, transparent);
        }
        @media (max-width: 720px) {
          .globe-top-bar {
            flex-wrap: wrap;
            gap: 8px;
            padding: 10px 12px;
          }
          .globe-top-bar .globe-network-title {
            flex: 1 1 100%;
            letter-spacing: 1.5px;
            font-size: 10px;
          }
          .globe-top-bar .globe-network-stats {
            display: none;
          }
          .globe-info-chip { display: inline-flex; }
          .globe-arc-label { display: none; }
          .globe-city-label { font-size: 11px; letter-spacing: 1px; }
          .globe-node-panel { width: min(200px, calc(100% - 28px)); }
          .globe-sat-ring { display: none; }
          .globe-route-log { bottom: 52px; max-width: calc(100% - 28px); }
        }
        @media (prefers-reduced-motion: reduce) {
          .globe-hub-ring,
          .globe-sat-ring,
          .globe-city-hub-dot,
          .globe-route-log-row { animation: none !important; }
        }
      `}</style>
    </div>
  )
}

export { GlobeMode }
