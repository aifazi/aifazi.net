#!/usr/bin/env python3
"""Replace GlobeMode (canvas 2D) with a COBE-based implementation."""
from pathlib import Path

FILE = Path(r"E:\aifazi Neon city\aifazi.net\aifazi.net-frontend-next\components\ServerRackAnimation.jsx")

NEW_GLOBE = r'''
// ── COBE-based globe (replaces the canvas-2D renderer) ───────────────────────
function rgbToArr(rgbStr, fallback = '0,212,255') {
  const p = String(rgbStr || fallback).split(',').map(Number)
  const n = p.length >= 3 ? p : fallback.split(',').map(Number)
  return [n[0] / 255, n[1] / 255, n[2] / 255]
}

function GlobeMode({ visibleRef }) {
  const canvasRef = useRef()
  const wrapRef   = useRef()
  const globeRef  = useRef(null)
  const [visitor, setVisitor] = useState(null)
  const visitorRef = useRef(null)
  const [themeKey, setThemeKey] = useState(0)
  const themeRef = useRef(null)
  const stateRef  = useRef({
    phi: 0.55,          // COBE longitude
    theta: 0.18,        // COBE latitude tilt
    velPhi: 0.0022,     // auto-spin velocity
    velPhiDamp: 0,      // drag momentum
    drag: null,         // { startX, lastX, lastPhi }
    zoom: 1.0,
    pinch: null,
  })

  useEffect(() => { visitorRef.current = visitor }, [visitor])

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
          if (!cancelled) setVisitor(parsed)
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

  // ── React to theme changes ──
  useEffect(() => {
    themeRef.current = readGlobeTheme()
    const el = document.documentElement
    const obs = new MutationObserver(() => {
      themeRef.current = readGlobeTheme()
      setThemeKey(k => k + 1)
    })
    obs.observe(el, { attributes: true, attributeFilter: ['data-theme', 'style'] })
    return () => obs.disconnect()
  }, [])

  // ── COBE globe instance (recreated on theme / visitor change) ──
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || typeof createGlobe !== 'function') return
    if (!themeRef.current) themeRef.current = readGlobeTheme()

    const theme = themeRef.current
    const v = visitorRef.current
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const rect = canvas.getBoundingClientRect()
    const width = Math.max(200, Math.floor(rect.width * dpr))
    const height = Math.max(200, Math.floor(rect.height * dpr))

    const cyan  = rgbToArr(theme.cyanRgb,  '0,212,255')
    const green = rgbToArr(theme.greenRgb, '0,255,136')
    const orange = rgbToArr(theme.orangeRgb, '255,107,53')
    const bg    = rgbToArr(theme.bgRgb, '0,12,28')

    const markers = GLOBE_CITIES.map(c => ({
      location: [c.lat, c.lng],
      size: c.hub ? 0.09 : 0.05,
      color: c.hub ? green : cyan,
    }))

    const arcs = GLOBE_CONNECTIONS.map(([a, b]) => ({
      from: [GLOBE_CITIES[a].lat, GLOBE_CITIES[a].lng],
      to:   [GLOBE_CITIES[b].lat, GLOBE_CITIES[b].lng],
    }))

    // Visitor marker + arc from the Riyadh hub (bindable via CSS anchors)
    const hasVisitor = v && Number.isFinite(+v.lat) && Number.isFinite(+v.lon) && v.lat !== '—'
    if (hasVisitor) {
      markers.push({
        location: [+v.lat, +v.lon],
        size: 0.12,
        color: orange,
        id: 'visitor',
      })
      const hub = GLOBE_CITIES.find(c => c.hub) || GLOBE_CITIES[9]
      arcs.push({
        from: [hub.lat, hub.lng],
        to:   [+v.lat, +v.lon],
        color: green,
      })
    }

    const globe = createGlobe(canvas, {
      devicePixelRatio: dpr,
      width,
      height,
      phi: stateRef.current.phi,
      theta: stateRef.current.theta,
      dark: theme.isLight ? 0 : 1,
      diffuse: 1.2,
      scale: stateRef.current.zoom,
      mapSamples: 16000,
      mapBrightness: theme.isLight ? 3.5 : 5.5,
      baseColor: [
        bg[0] * 0.35 + 0.04,
        bg[1] * 0.35 + 0.05,
        bg[2] * 0.35 + 0.08,
      ],
      markerColor: cyan,
      glowColor: theme.isLight ? green : cyan,
      offset: [0, 0],
      markers,
      arcs,
      arcColor: green,
      arcWidth: 0.4,
      arcHeight: 0.35,
      markerElevation: 0.02,
      onRender: (state) => {
        const s = stateRef.current
        if (!s.drag) {
          s.phi += s.velPhi
        }
        state.phi = s.phi
        state.theta = s.theta
        state.scale = s.zoom
      },
    })

    globeRef.current = globe
    return () => {
      try { globe.destroy() } catch { /* already torn down */ }
      globeRef.current = null
    }
  }, [themeKey, visitor])

  // ── Pointer events (drag-to-rotate + pinch/wheel zoom) ───────────────────
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
      const { x } = getXY(e)
      s.drag = { startX: x, lastX: x, lastPhi: s.phi }
      s.velPhiDamp = 0
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
      const { x } = getXY(e)
      if (s.drag) {
        const dx = x - s.drag.lastX
        s.velPhiDamp = dx * 0.002
        s.phi = s.drag.lastPhi + (x - s.drag.startX) * 0.006
        s.drag.lastX = x
      }
    }
    const onUp = () => {
      if (s.drag) {
        s.velPhi = Math.max(0.0004, Math.min(0.006, Math.abs(s.velPhiDamp))) * Math.sign(s.velPhiDamp || 1)
      }
      s.drag = null
      canvas.style.cursor = 'grab'
    }

    canvas.addEventListener('mousedown',  onDown)
    canvas.addEventListener('touchstart', onDown, { passive: true })
    window.addEventListener('mousemove',  onMove)
    window.addEventListener('touchmove',  onMove, { passive: true })
    window.addEventListener('mouseup',    onUp)
    window.addEventListener('touchend',   onUp)
    canvas.style.cursor = 'grab'

    const onWheel = e => {
      e.preventDefault()
      s.zoom = clampGlobeZoom(s.zoom - e.deltaY * 0.0008)
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })

    return () => {
      canvas.removeEventListener('mousedown',  onDown)
      canvas.removeEventListener('touchstart', onDown)
      window.removeEventListener('mousemove',  onMove)
      window.removeEventListener('touchmove',  onMove)
      window.removeEventListener('mouseup',    onUp)
      window.removeEventListener('touchend',   onUp)
      canvas.removeEventListener('wheel',      onWheel)
    }
  }, [])

  return (
    <div className="globe-network-shell" ref={wrapRef} style={{
      width: '100%', height: '100%',
      position: 'relative', overflow: 'hidden',
      background: 'transparent',
    }}>
      {/* Floating title — top left */}
      <div className="globe-network-title" style={{
        position: 'absolute', top: 10, left: 14, zIndex: 3,
        fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 3,
        color: 'var(--cyan)', opacity: 0.55, pointerEvents: 'none',
      }}>
        GLOBAL NETWORK · LIVE CONNECTION MAP
      </div>

      {/* Floating stats — top right */}
      <div className="globe-network-stats" style={{
        position: 'absolute', top: 8, right: 14, zIndex: 3,
        display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'flex-end',
        pointerEvents: 'none',
      }}>
        {[
          { label: 'NODES',   value: `${GLOBE_CITIES.length}`,      color: 'var(--cyan)'  },
          { label: 'ARCS',    value: `${GLOBE_CONNECTIONS.length + (visitor && visitor.lat !== '—' ? 1 : 0)}`, color: 'var(--green)' },
          { label: 'LATENCY', value: '12ms',                       color: 'var(--cyan)'  },
          { label: 'UPTIME',  value: '99.99%',                     color: 'var(--green)' },
        ].map(s => (
          <div key={s.label} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 5.5, color: 'var(--muted)', letterSpacing: 2 }}>{s.label}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11,   color: s.color,       fontWeight: 700  }}>{s.value}</span>
          </div>
        ))}
      </div>

      {/* COBE canvas — fills entire panel */}
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />

      {/* Visitor HUD — bottom-left (anchored to marker when CSS anchor positioning is available) */}
      <VisitorHud visitor={visitor} />
    </div>
  )
}
'''

src = FILE.read_text(encoding='utf-8')
lines = src.splitlines(keepends=True)

# GlobeMode starts at line 2014 (1-based) → index 2013
idx = None
for i, line in enumerate(lines):
    if line.startswith('function GlobeMode('):
        idx = i
        break

if idx is None:
    raise SystemExit('GlobeMode not found')

# Keep everything before GlobeMode
head = ''.join(lines[:idx])

# Ensure createGlobe import is present after the React import
if "from 'cobe'" not in head and 'from "cobe"' not in head:
    head = head.replace(
        "import { prefersReducedMotion } from '../core/useFocusTrap'\n",
        "import { prefersReducedMotion } from '../core/useFocusTrap'\nimport createGlobe from 'cobe'\n",
        1,
    )

new_src = head + NEW_GLOBE.lstrip('\n')
if not new_src.endswith('\n'):
    new_src += '\n'

FILE.write_text(new_src, encoding='utf-8')
print(f'Replaced GlobeMode at line {idx + 1}; new size {len(new_src)} bytes')
