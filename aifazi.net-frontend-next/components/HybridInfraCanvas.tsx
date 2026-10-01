'use client'

/**
 * HybridInfraCanvas — canvas renderer for the /hybrid-infra showcase.
 *
 * Ports the single-file interactive rack visualization into a
 * lifecycle-correct React component:
 * - rAF loop cancelled on unmount (the original leaked it)
 * - DPR-aware resize via ResizeObserver
 * - IntersectionObserver + visibility park (no background GPU burn)
 * - prefers-reduced-motion renders one static frame
 * - PNG export, keyboard + touch support
 *
 * All copy lives in data/hybrid-infra.ts; this file only draws.
 */
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import {
  COMPONENTS,
  FLOWS,
  TIMELINE_CATS,
  EDGE_COPY,
  CATEGORY_META,
  type InfraCategory,
  type InfraComponent,
  type InfraFlow,
} from '@/data/hybrid-infra'
import { infraPalette, type InfraTone } from '@/lib/infraTheme'
import { createSvgRecorder } from '@/lib/infraSvgExport'
import { createDrawKit, center, pathBetween, pointAlong, hashId } from './infraCanvasKit'
import {
  clampView,
  effOrigin,
  effScale,
  viewCenter,
  viewForPercent,
  viewFromCenter,
  wheelAtBound,
  wheelZoomFactor,
  zoomAtPoint,
  zoomPercent,
  type InfraFit,
} from '@/lib/infraView'

export interface HybridInfraCanvasHandle {
  exportPng: () => void
  /** Vector export: one synchronous frame into the SVG recorder → download. */
  exportSvg: () => void
  zoomIn: () => void
  zoomOut: () => void
  /** Base fit: design centered, zoom 1, pan cleared. */
  resetView: () => void
  /** Alias of resetView (FIT button). */
  fit: () => void
  /** Zoom to a real design-to-screen percent (e.g. 100), keeping center. */
  setPercent: (pct: number) => void
  /** Current view for deep-linking (z relative, cx/cy design center). */
  getView: () => { z: number; cx: number; cy: number; pct: number }
}

export interface NodeMove {
  x?: number
  y?: number
  rackU?: number
}

interface Props {
  activeMode: InfraCategory | 'all'
  edgeVendor: 'fortigate' | 'unifi'
  selectedId: string | null
  /** Extra selected ids (shift-click multi-select) drawn with the ring. */
  selectedIds?: Set<string> | null
  /** Shift-click on a node: parent toggles it in/out of the selection. */
  onToggleSelect?: (id: string) => void
  /** Dim everything outside this set. Null = no focus filter. */
  focusIds: Set<string> | null
  /** -1 = off, else index into TIMELINE_CATS. */
  playStep: number
  viewMode: 'technical' | 'management'
  onSelect: (id: string | null) => void
  /** Document nodes/flows. Defaults to the built-in Plan A diagram. */
  nodes?: InfraComponent[]
  flows?: InfraFlow[]
  /** Edit mode: drag nodes, click-to-connect links. */
  editable?: boolean
  /** Source node id for pending link (connect mode). */
  connectFrom?: string | null
  /** Drag position updates; done=true on pointer-up (undo checkpoint). */
  onMoveNode?: (id: string, pos: NodeMove, done: boolean) => void
  /** Connect mode: user clicked a second, different node. */
  onAddLink?: (from: string, to: string) => void
  /** Light/dark tone for the stage. Defaults to dark (legacy ops-room look). */
  tone?: InfraTone
  /** Zoom level changed (integer percent, e.g. 125). For the viewer readout. */
  onViewChange?: (pct: number) => void
  /** Restore a view on first layout (URL deep-link wins over storage). */
  initialView?: { z: number; cx: number; cy: number } | null
  /** localStorage key suffix; last view is remembered per key. */
  viewStorageKey?: string | null
  /** Per-category color overrides (from DiagramDoc.categoryColors). */
  catColors?: Record<string, string> | null
  /** Background grid overlay. Defaults to true. */
  grid?: boolean
  /** Grid snap step in design px. Null/0 disables snapping. Defaults to 10. */
  snap?: number | null
  /** Editor-locked node ids (drag-blocked). Shown with a lock badge. */
  lockedIds?: Set<string> | null
  /** Edit mode: a library item was dropped on the canvas (design coords). */
  onDropLibraryItem?: (key: string, x: number, y: number) => void
  /** Edit mode: rubber-band finished — replaces the selection with the ids. */
  onMarqueeSelect?: (ids: string[]) => void
  /** Edit mode: resize-handle drag on the selected node (checkpoint contract
   *  like onMoveNode — done=true fires once on pointer-up). */
  onResizeNode?: (id: string, box: { x: number; y: number; w: number; h: number }, done: boolean) => void
}

interface Box {
  x: number
  y: number
  w: number
  h: number
}

const DESIGN_W = 1280
const DESIGN_H = 920

/* NOTE: canvas text color comes from the live theme palette (see palRef/P). */

export const HybridInfraCanvas = forwardRef<HybridInfraCanvasHandle, Props>(
  function HybridInfraCanvas(props, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const wrapRef = useRef<HTMLDivElement>(null)
    const sRef = useRef(props)
    sRef.current = props
    const palRef = useRef(infraPalette(props.tone ?? 'dark'))
    palRef.current = infraPalette(props.tone ?? 'dark')
    const drawRef = useRef<(t: number) => void>(() => {})
    const kickRef = useRef<() => void>(() => {})
    const layoutRef = useRef<() => void>(() => {})
    // Swap target for the ctx proxy: exportSvg redirects one synchronous
    // frame into the SVG recorder, then restores the real 2d context.
    const ctxTargetRef = useRef<CanvasRenderingContext2D | null>(null)
    // Static composition for reduced-motion users (redrawn on input change).
    const [frozen] = useState(
      () =>
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    )

    // User view: zoom (z) + pan (px/py, screen px) on top of the fit
    // transform. Applied to both rendering and hit-testing so clicks stay
    // aligned while zoomed/panned.
    const viewRef = useRef({ z: 1, px: 0, py: 0 })
    // Fit transform + view ops live inside the mount effect (need W/H/S);
    // the imperative handle delegates through these refs.
    const fitRef = useRef<InfraFit>({ v: 1, ox: 0, oy: 0 })
    const opsRef = useRef<{
      zoomBy: (factor: number, mx?: number, my?: number) => void
      fit: () => void
      setPercent: (pct: number) => void
      getView: () => { z: number; cx: number; cy: number; pct: number }
    } | null>(null)
    const lastPctRef = useRef(100)
    const notifyView = () => {
      const pct = zoomPercent(fitRef.current, viewRef.current)
      if (pct !== lastPctRef.current) {
        lastPctRef.current = pct
        sRef.current.onViewChange?.(pct)
      }
    }
    useImperativeHandle(ref, () => ({
      exportPng() {
        const canvas = canvasRef.current
        if (!canvas) return
        drawRef.current(1.0)
        canvas.toBlob((blob) => {
          if (!blob) return
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = 'hybrid-infrastructure.png'
          document.body.appendChild(a)
          a.click()
          a.remove()
          setTimeout(() => URL.revokeObjectURL(url), 4000)
        }, 'image/png')
      },
      exportSvg() {
        const canvas = canvasRef.current
        if (!canvas) return
        const rec = createSvgRecorder()
        ctxTargetRef.current = rec.ctx as CanvasRenderingContext2D
        try {
          // Same clean frozen frame as PNG export (synchronous — the rAF
          // loop cannot interleave and pollute the recording).
          drawRef.current(1.0)
        } finally {
          ctxTargetRef.current = null
        }
        const svg = rec.toSvg({ width: canvas.width, height: canvas.height })
        const blob = new Blob([svg], { type: 'image/svg+xml' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'hybrid-infrastructure.svg'
        document.body.appendChild(a)
        a.click()
        a.remove()
        setTimeout(() => URL.revokeObjectURL(url), 4000)
      },
      zoomIn() {
        opsRef.current?.zoomBy(1.25)
      },
      zoomOut() {
        opsRef.current?.zoomBy(0.8)
      },
      resetView() {
        opsRef.current?.fit()
      },
      fit() {
        opsRef.current?.fit()
      },
      setPercent(pct) {
        opsRef.current?.setPercent(pct)
      },
      getView() {
        return (
          opsRef.current?.getView() ?? {
            z: 1,
            cx: DESIGN_W / 2,
            cy: DESIGN_H / 2,
            pct: 100,
          }
        )
      },
    }))

    useEffect(() => {
      const canvasEl = canvasRef.current
      const wrapEl = wrapRef.current
      if (!canvasEl || !wrapEl) return
      // Non-null aliases: TS narrowing does not persist into closures.
      const canvas: HTMLCanvasElement = canvasEl
      const wrap: HTMLDivElement = wrapEl
      const ctxOrNull = canvas.getContext('2d')
      if (!ctxOrNull) return
      // Non-null alias: TS narrowing does not persist into closures.
      const baseCtx: CanvasRenderingContext2D = ctxOrNull
      ctxTargetRef.current = baseCtx
      // Swappable forwarder (see ctxTargetRef): method lookups bind to the
      // CURRENT target, so exportSvg can reroute one frame without the draw
      // functions knowing about it. Bound methods are cached per target to
      // avoid per-op allocation in the rAF hot path.
      let bindTarget: object | null = null
      let bindCache = new Map<string | symbol, unknown>()
      const ctx: CanvasRenderingContext2D = new Proxy(baseCtx, {
        get: (_t, p) => {
          const tgt = (ctxTargetRef.current ?? baseCtx) as unknown as object
          if (tgt !== bindTarget) {
            bindTarget = tgt
            bindCache = new Map()
          }
          const cached = bindCache.get(p)
          if (cached) return cached
          const v = Reflect.get(tgt, p)
          const out = typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(tgt) : v
          bindCache.set(p, out)
          return out
        },
        set: (_t, p, v) => {
          const tgt = (ctxTargetRef.current ?? baseCtx) as unknown as object
          return Reflect.set(tgt, p, v)
        },
      }) as CanvasRenderingContext2D

      const DPR = Math.min(window.devicePixelRatio || 1, 2)
      let W = 1280
      let H = 920
      let raf = 0
      let running = false
      let offscreen = false
      let docHidden = document.hidden
      const S: InfraFit = { v: 1, ox: 0, oy: 0 }
      // Effective transform incl. user zoom + pan (zoom anchors to a point).
      const effS = () => effScale(S, viewRef.current)
      const effOx = () => effOrigin(S, viewRef.current, W, H).x
      const effOy = () => effOrigin(S, viewRef.current, W, H).y
      // Debounced localStorage write for "remember last view".
      let persistT = 0
      // Restore (URL initialView > storage) happens once, after S is known.
      let viewInitDone = false
      const RACK = { x: 250, y: 250, w: 470, h: 540, unitH: 19.5, topPad: 26 }
      let hoverId: string | null = null
      const boxes = new Map<string, Box>()
      const hits = new Map<string, Box>()
      const flowPts = new Map<string, { x: number; y: number }[]>()
      // Edit-mode interaction state (kept out of React state for 60fps drag).
      let dragId: string | null = null
      let dragDX = 0
      let dragDY = 0
      let dragMoved = false
      // Set when a completed drag/pan actually moved: finalizeDrag resets
      // dragMoved before the browser dispatches `click`, so without this the
      // click guard never fired and every drag ended in a selection
      // side-effect (F3). Reset on the next pointerdown so a missed click
      // can never swallow a later one.
      let suppressClick = false
      // True when any onMoveNode fired for this drag — even sub-threshold
      // jitter opens the editor's undo checkpoint, so it must be closed.
      let dragTouched = false
      // Multi-select group drag: per-node original positions + shared delta.
      let dragGroup: { id: string; ox: number; oy: number }[] | null = null
      let dragStart = { x: 0, y: 0 }
      // View-pan state (empty-space / middle-button drag).
      let panId: number | null = null
      let panSX = 0
      let panSY = 0
      let panPX = 0
      let panPY = 0
      let panMoved = false
      // Rubber-band marquee (edit mode: primary drag on empty space).
      // Ends are design coords; origin is also kept in client px for the
      // small movement threshold that distinguishes drag from click.
      let mqId: number | null = null
      let mqX0 = 0
      let mqY0 = 0
      let mqX1 = 0
      let mqY1 = 0
      let mqCX = 0
      let mqCY = 0
      let mqMoved = false
      // Single-node resize: active handle + original box (design coords).
      type ResizeDir = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
      let rzId: string | null = null
      let rzDir: ResizeDir = 'se'
      let rzO = { x: 0, y: 0, w: 0, h: 0 }
      let rzBox = { x: 0, y: 0, w: 0, h: 0 }
      let rzSX = 0
      let rzSY = 0
      let rzMoved = false
      const RES_MIN_W = 60
      const RES_MIN_H = 36
      // Smart-snap alignment guides shown while dragging (design coords).
      type Guide = { axis: 'x' | 'y'; pos: number; from: number; to: number }
      let guides: Guide[] = []
      let overCanvas = false
      let cursorDesign: { x: number; y: number } | null = null
      // Live theme palette: refreshed every frame from palRef (tone prop),
      // so a light/dark toggle repaints without re-subscribing the canvas.
      // (Reassigned in renderFrame — must stay `let`.)
      let P = palRef.current

      const nodeList = () => sRef.current.nodes ?? COMPONENTS
      const flowList = () => sRef.current.flows ?? FLOWS
      const byId = (id: string) => nodeList().find((c) => c.id === id)
      // Category color: doc override → canonical meta → fallback.
      const catColor = (cat: string) =>
        sRef.current.catColors?.[cat] ??
        (CATEGORY_META as Record<string, { label: string; color: string } | undefined>)[cat]?.color ??
        '#35a7ff'

      // ctx-bound drawing primitives (see components/infraCanvasKit.ts).
      const { roundRect, fillRound, text, led, ventGrid, ports, driveBays } =
        createDrawKit(ctx, () => palRef.current)

      // ── layout ───────────────────────────────────────────────
      function layoutScene() {
        const s = Math.min(W / DESIGN_W, H / DESIGN_H)
        S.v = s
        S.ox = (W - DESIGN_W * s) / 2
        S.oy = (H - DESIGN_H * s) / 2
        fitRef.current = S
        if (!viewInitDone) {
          viewInitDone = true
          const iv = readInitialView()
          if (iv) viewRef.current = viewFromCenter(S, iv.z, W, H, iv.cx, iv.cy)
        }
        boxes.clear()
        hits.clear()

        const vmMap: Record<string, Box> = {
          dc1: { x: 760, y: 400, w: 155, h: 34 },
          dc2: { x: 760, y: 442, w: 155, h: 34 },
          filevm: { x: 760, y: 484, w: 155, h: 34 },
          legacyvm: { x: 760, y: 526, w: 155, h: 34 },
          entraconnect: { x: 930, y: 400, w: 165, h: 34 },
        }
        const userMap: Record<string, Box> = {
          endpoints: { x: 28, y: 655, w: 195, h: 100 },
          smbaccess: { x: 28, y: 775, w: 195, h: 80 },
        }
        let vmExtra = 0
        let userExtra = 0
        let legacyExtra = 0

        for (const c of nodeList()) {
          let box: Box
          // Authored coordinates always win: vm/legacy/users only fall back
          // to the template/fallback layout when the node has no x/y (Plan A
          // vm nodes); dragging then writes x/y and sticks from then on.
          const authored = typeof c.x === 'number' && Number.isFinite(c.x) &&
            typeof c.y === 'number' && Number.isFinite(c.y)
          if (c.layer === 'rack' && c.rackU) {
            const y = RACK.y + RACK.topPad + (c.rackU - 1) * RACK.unitH
            const h = (c.rackH ?? 1) * RACK.unitH - 3
            box = { x: RACK.x + 20, y, w: RACK.w - 40, h }
          } else if (c.layer === 'vm') {
            const tmpl = vmMap[c.id]
            if (authored) {
              box = { x: c.x as number, y: c.y as number, w: c.w ?? tmpl?.w ?? 155, h: c.h ?? tmpl?.h ?? 34 }
            } else if (tmpl) {
              box = { ...tmpl }
            } else {
              box = { x: 760 + (vmExtra % 2) * 170, y: 400 + Math.floor(vmExtra / 2) * 42, w: 155, h: 34 }
              vmExtra += 1
            }
          } else if (c.layer === 'legacy') {
            if (authored) {
              box = { x: c.x as number, y: c.y as number, w: c.w ?? 195, h: c.h ?? 115 }
            } else if (c.id === 'legacy') {
              box = { x: 28, y: 520, w: 195, h: 115 }
            } else {
              box = { x: 28, y: 520 + legacyExtra * 125, w: 195, h: 115 }
              legacyExtra += 1
            }
          } else if (c.layer === 'users') {
            const tmpl = userMap[c.id]
            if (authored) {
              box = { x: c.x as number, y: c.y as number, w: c.w ?? tmpl?.w ?? 195, h: c.h ?? tmpl?.h ?? 100 }
            } else if (tmpl) {
              box = { ...tmpl }
            } else {
              box = { x: 28, y: 655 + userExtra * 110, w: 195, h: 100 }
              userExtra += 1
            }
          } else {
            box = { x: c.x ?? 0, y: c.y ?? 0, w: c.w ?? 100, h: c.h ?? 50 }
          }
          boxes.set(c.id, box)
          hits.set(c.id, {
            x: effOx() + box.x * effS(),
            y: effOy() + box.y * effS(),
            w: box.w * effS(),
            h: box.h * effS(),
          })
        }

        flowPts.clear()
        for (const f of flowList()) {
          const a = byId(f.from)
          const b = byId(f.to)
          if (!a || !b) continue
          const ba = boxes.get(a.id)
          const bb = boxes.get(b.id)
          if (!ba || !bb) continue
          flowPts.set(f.id, pathBetween(ba, bb))
        }
        notifyView()
      }

      function resize() {
        const cssW = wrap.clientWidth || 1280
        const cssH = Math.max(560, Math.min(920, cssW * 0.72))
        W = Math.round(cssW)
        H = Math.round(cssH)
        canvas.width = Math.round(W * DPR)
        canvas.height = Math.round(H * DPR)
        canvas.style.width = `${W}px`
        canvas.style.height = `${H}px`
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0)
        layoutScene()
      }
      layoutRef.current = layoutScene

      // ── view: storage / clamp / zoom / presets ───────────────
      function readInitialView(): { z: number; cx: number; cy: number } | null {
        const p = sRef.current.initialView
        if (p && typeof p.z === 'number') return p
        const key = sRef.current.viewStorageKey
        if (!key) return null
        try {
          const raw = localStorage.getItem(`hi-view:${key}`)
          if (!raw) return null
          const v = JSON.parse(raw) as { z?: unknown; cx?: unknown; cy?: unknown }
          if (typeof v.z === 'number' && typeof v.cx === 'number' && typeof v.cy === 'number') {
            return { z: v.z, cx: v.cx, cy: v.cy }
          }
        } catch {
          /* noop */
        }
        return null
      }

      // Remember the last view per storage key (debounced).
      function persistView() {
        const key = sRef.current.viewStorageKey
        if (!key) return
        window.clearTimeout(persistT)
        persistT = window.setTimeout(() => {
          try {
            const { cx, cy } = viewCenter(S, viewRef.current, W, H)
            localStorage.setItem(
              `hi-view:${key}`,
              JSON.stringify({ z: viewRef.current.z, cx, cy }),
            )
          } catch {
            /* noop */
          }
        }, 400)
      }

      function applyView() {
        viewRef.current = clampView(
          S,
          viewRef.current,
          W,
          H,
          { w: DESIGN_W, h: DESIGN_H },
        )
        layoutScene()
        notifyView()
        persistView()
        kick()
      }

      // Zoom while keeping the design point under (mx, my) fixed.
      function zoomBy(factor: number, mx = W / 2, my = H / 2) {
        const next = zoomAtPoint(S, viewRef.current, W, H, factor, mx, my)
        if (next === viewRef.current) return
        viewRef.current = next
        applyView()
      }

      function fit() {
        viewRef.current = { z: 1, px: 0, py: 0 }
        applyView()
      }

      function setPercent(pct: number) {
        viewRef.current = viewForPercent(S, viewRef.current, W, H, pct)
        applyView()
      }

      function getView() {
        const { cx, cy } = viewCenter(S, viewRef.current, W, H)
        return { z: viewRef.current.z, cx, cy, pct: zoomPercent(S, viewRef.current) }
      }

      // Keyboard/touch pan: shift the design origin by screen pixels.
      function panBy(dx: number, dy: number) {
        viewRef.current = clampView(
          S,
          { ...viewRef.current, px: viewRef.current.px + dx, py: viewRef.current.py + dy },
          W,
          H,
          { w: DESIGN_W, h: DESIGN_H },
        )
        applyView()
      }

      opsRef.current = { zoomBy, fit, setPercent, getView }

      // ── draw passes ──────────────────────────────────────────
      function dimmed(cat: InfraCategory, extra: Set<string> | null, id: string | null) {
        const p = sRef.current
        if (p.activeMode !== 'all' && p.activeMode !== cat) return true
        if (extra && id && !extra.has(id)) return true
        return false
      }

      // Selected = primary selection or part of the multi-selection set.
      const isSelected = (p: Props, id: string) =>
        p.selectedId === id || (p.selectedIds?.has(id) ?? false)

      function drawBackground() {
        // Paint over the *visible* design-space rect (inverse of the effective
        // transform), so letterboxed margins, panned/zoomed-out areas and
        // fullscreen letterboxes all get the gradient + grid — not just the
        // fixed 1280×920 design rect.
        const vs = effS()
        const vx0 = (0 - effOx()) / vs
        const vy0 = (0 - effOy()) / vs
        const vx1 = (W - effOx()) / vs
        const vy1 = (H - effOy()) / vs
        const g = ctx.createLinearGradient(0, vy0, 0, vy1)
        g.addColorStop(0, P.bg2)
        g.addColorStop(1, P.bg)
        ctx.fillStyle = g
        ctx.fillRect(vx0, vy0, vx1 - vx0, vy1 - vy0)
        if (sRef.current.grid !== false) {
          const step = 40
          // Safety cap: extreme zoom-out can make the visible rect enormous;
          // past ~600 lines per axis the grid is sub-pixel anyway.
          if ((vx1 - vx0) / step < 600 && (vy1 - vy0) / step < 600) {
            ctx.save()
            ctx.globalAlpha = 0.045
            ctx.strokeStyle = P.muted
            const x0 = Math.floor(vx0 / step) * step
            const y0 = Math.floor(vy0 / step) * step
            for (let x = x0; x <= vx1; x += step) {
              ctx.beginPath()
              ctx.moveTo(x, vy0)
              ctx.lineTo(x, vy1)
              ctx.stroke()
            }
            for (let y = y0; y <= vy1; y += step) {
              ctx.beginPath()
              ctx.moveTo(vx0, y)
              ctx.lineTo(vx1, y)
              ctx.stroke()
            }
            ctx.restore()
          }
        }
        const glow = ctx.createRadialGradient(520, 480, 20, 520, 480, 360)
        glow.addColorStop(0, 'rgba(50,120,190,0.13)')
        glow.addColorStop(1, 'transparent')
        ctx.fillStyle = glow
        ctx.fillRect(vx0, vy0, vx1 - vx0, vy1 - vy0)
      }

      function drawZoneLabels() {
        ctx.save()
        fillRound(270, 12, 400, 190, 14, 'rgba(12,28,48,0.28)', 'rgba(80,130,100,0.18)')
        text('INTERNET EDGE / SECURITY', 284, 26, { size: 9.5, color: P.muted, weight: '700' })
        fillRound(855, 12, 250, 320, 14, 'rgba(12,28,48,0.28)', 'rgba(60,110,170,0.22)')
        text('MICROSOFT 365 / CLOUD', 868, 26, { size: 9.5, color: P.muted, weight: '700' })
        fillRound(855, 585, 250, 170, 14, 'rgba(12,28,48,0.28)', 'rgba(80,150,120,0.18)')
        text('COLLABORATION / RECOVERY', 868, 598, { size: 9.5, color: P.muted, weight: '700' })
        text('ON-PREMISES CORE', 250, 238, { size: 9.5, color: P.muted, weight: '700' })
        text('USERS / LEGACY', 28, 505, { size: 9.5, color: P.muted, weight: '700' })
        ctx.restore()
      }

      function playBoost(cat: InfraCategory) {
        const p = sRef.current
        if (p.playStep < 0) return false
        const cats = TIMELINE_CATS[p.playStep] ?? []
        return cats.includes(cat)
      }

      function drawFlows(t: number) {
        const p = sRef.current
        for (const f of flowList()) {
          const pts = flowPts.get(f.id)
          if (!pts) continue
          const color = f.color ?? catColor(f.cat)
          const isDim =
            (p.activeMode !== 'all' && p.activeMode !== f.cat) ||
            (p.focusIds !== null &&
              !(p.focusIds.has(f.from) || p.focusIds.has(f.to)))
          const boost = playBoost(f.cat)
          ctx.save()
          ctx.globalAlpha = isDim ? 0.05 : boost ? 0.9 : 0.3
          ctx.strokeStyle = color
          ctx.lineWidth = boost ? 2.5 : 1.55
          ctx.lineCap = 'round'
          ctx.lineJoin = 'round'
          if (f.dashed) ctx.setLineDash([7, 6])
          ctx.shadowColor = color
          ctx.shadowBlur = boost ? 10 : 2
          ctx.beginPath()
          ctx.moveTo(pts[0].x, pts[0].y)
          for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
          ctx.stroke()
          if (!isDim) {
            const n = boost ? 5 : 3
            for (let k = 0; k < n; k++) {
              const speed = frozen ? 0 : boost ? 0.24 : 0.12
              const progress = (t * speed + k / n + hashId(f.id) * 0.17) % 1
              const pt = pointAlong(pts, progress)
              ctx.beginPath()
              ctx.fillStyle = color
              ctx.shadowColor = color
              ctx.shadowBlur = 10
              ctx.arc(pt.x, pt.y, boost ? 2.9 : 2.1, 0, Math.PI * 2)
              ctx.fill()
            }
            if (f.label) {
              const lp = pointAlong(pts, 0.5)
              const eff = effScale(S, viewRef.current)
              text(f.label, lp.x, lp.y - Math.max(7, 10 / eff), {
                size: Math.max(8, 9 / eff),
                color,
                align: 'center',
                weight: '700',
                alpha: boost ? 1 : 0.85,
              })
            }
          }
          ctx.restore()
        }
      }

      function drawPendingLink(t: number) {
        const p = sRef.current
        if (!p.editable || !p.connectFrom || !cursorDesign) return
        const src = boxes.get(p.connectFrom)
        if (!src) return
        const ax = src.x + src.w / 2
        const ay = src.y + src.h / 2
        ctx.save()
        ctx.globalAlpha = 0.9
        ctx.strokeStyle = P.cyan
        ctx.lineWidth = 2
        ctx.setLineDash([8, 6])
        ctx.lineDashOffset = frozen ? 0 : -t * 30
        ctx.shadowColor = P.cyan
        ctx.shadowBlur = 8
        ctx.beginPath()
        ctx.moveTo(ax, ay)
        ctx.lineTo(cursorDesign.x, cursorDesign.y)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.beginPath()
        ctx.fillStyle = P.cyan
        ctx.arc(cursorDesign.x, cursorDesign.y, 4, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }

      // ── resize handles (single selected free node) ───────────
      // Only when edit mode owns exactly one selected non-rack node.
      function resizeTarget(): string | null {
        const p = sRef.current
        if (!p.editable || !p.onResizeNode || !p.selectedId || p.connectFrom) return null
        if (p.selectedIds && p.selectedIds.size > 1) return null
        const n = byId(p.selectedId)
        if (!n || n.layer === 'rack') return null
        return boxes.get(p.selectedId) ? p.selectedId : null
      }

      function handlePoints(b: Box): { dir: ResizeDir; x: number; y: number }[] {
        const cx = b.x + b.w / 2
        const cy = b.y + b.h / 2
        return [
          { dir: 'nw', x: b.x, y: b.y },
          { dir: 'n', x: cx, y: b.y },
          { dir: 'ne', x: b.x + b.w, y: b.y },
          { dir: 'e', x: b.x + b.w, y: cy },
          { dir: 'se', x: b.x + b.w, y: b.y + b.h },
          { dir: 's', x: cx, y: b.y + b.h },
          { dir: 'sw', x: b.x, y: b.y + b.h },
          { dir: 'w', x: b.x, y: cy },
        ]
      }

      function hitHandle(dx: number, dy: number): ResizeDir | null {
        const id = resizeTarget()
        if (!id) return null
        const b = boxes.get(id)
        if (!b) return null
        const hs = 6 / effS()
        for (const hp of handlePoints(b)) {
          if (Math.abs(dx - hp.x) <= hs && Math.abs(dy - hp.y) <= hs) return hp.dir
        }
        return null
      }

      function resizeCursor(dir: ResizeDir): string {
        if (dir === 'n' || dir === 's') return 'ns-resize'
        if (dir === 'e' || dir === 'w') return 'ew-resize'
        if (dir === 'nw' || dir === 'se') return 'nwse-resize'
        return 'nesw-resize'
      }

      function updateResize(px: number, py: number) {
        if (!rzId) return
        const p = sRef.current
        if (!p.onResizeNode) return
        if (Math.abs(px - rzSX) > 2 || Math.abs(py - rzSY) > 2) rzMoved = true
        let { x, y, w, h } = rzO
        const right = rzO.x + rzO.w
        const bottom = rzO.y + rzO.h
        const step = p.snap && p.snap > 0 ? p.snap : 0
        const snapv = (v: number) => (step ? Math.round(v / step) * step : Math.round(v))
        if (rzDir === 'w' || rzDir === 'nw' || rzDir === 'sw') {
          const nx = Math.max(-200, Math.min(snapv(px), right - RES_MIN_W))
          x = nx
          w = right - nx
        }
        if (rzDir === 'e' || rzDir === 'ne' || rzDir === 'se') {
          w = Math.max(RES_MIN_W, snapv(px) - rzO.x)
        }
        if (rzDir === 'n' || rzDir === 'nw' || rzDir === 'ne') {
          const ny = Math.max(-100, Math.min(snapv(py), bottom - RES_MIN_H))
          y = ny
          h = bottom - ny
        }
        if (rzDir === 's' || rzDir === 'sw' || rzDir === 'se') {
          h = Math.max(RES_MIN_H, snapv(py) - rzO.y)
        }
        rzBox = { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) }
        p.onResizeNode(rzId, rzBox, false)
      }

      function finalizeResize() {
        if (!rzId) return
        const id = rzId
        const moved = rzMoved
        const box = moved ? rzBox : { ...rzO }
        rzId = null
        rzMoved = false
        if (moved) suppressClick = true
        sRef.current.onResizeNode?.(id, box, true)
      }

      function drawResizeHandles() {
        const id = rzId ?? resizeTarget()
        if (!id) return
        const b = boxes.get(id)
        if (!b) return
        const hs = 4.5 / effS()
        ctx.save()
        ctx.lineWidth = 1.5 / effS()
        for (const hp of handlePoints(b)) {
          ctx.fillStyle = P.bg
          ctx.fillRect(hp.x - hs, hp.y - hs, hs * 2, hs * 2)
          ctx.strokeStyle = P.cyan
          ctx.strokeRect(hp.x - hs, hp.y - hs, hs * 2, hs * 2)
        }
        ctx.restore()
      }

      function drawGuides() {
        if (!guides.length) return
        ctx.save()
        ctx.strokeStyle = P.red
        ctx.lineWidth = 1.2 / effS()
        ctx.setLineDash([5 / effS(), 4 / effS()])
        for (const g of guides) {
          ctx.beginPath()
          if (g.axis === 'x') {
            ctx.moveTo(g.pos, g.from)
            ctx.lineTo(g.pos, g.to)
          } else {
            ctx.moveTo(g.from, g.pos)
            ctx.lineTo(g.to, g.pos)
          }
          ctx.stroke()
        }
        ctx.setLineDash([])
        ctx.restore()
      }

      function drawMarquee() {
        if (mqId === null) return
        const x = Math.min(mqX0, mqX1)
        const y = Math.min(mqY0, mqY1)
        const w = Math.abs(mqX1 - mqX0)
        const h = Math.abs(mqY1 - mqY0)
        ctx.save()
        ctx.fillStyle = 'rgba(54,215,232,0.10)'
        ctx.fillRect(x, y, w, h)
        ctx.strokeStyle = P.cyan
        ctx.lineWidth = 1.5 / effS()
        ctx.setLineDash([6 / effS(), 4 / effS()])
        ctx.strokeRect(x, y, w, h)
        ctx.setLineDash([])
        ctx.restore()
      }

      function drawRackFrame() {
        const r = RACK
        ctx.save()
        const floor = ctx.createRadialGradient(
          r.x + r.w / 2, r.y + r.h + 20, 10, r.x + r.w / 2, r.y + r.h + 20, r.w * 0.9,
        )
        floor.addColorStop(0, 'rgba(50,110,170,0.18)')
        floor.addColorStop(1, 'transparent')
        ctx.fillStyle = floor
        ctx.fillRect(r.x - 80, r.y + r.h - 20, r.w + 160, 80)
        ctx.restore()

        const carcass = ctx.createLinearGradient(r.x - 18, r.y, r.x + r.w + 18, r.y + r.h)
        carcass.addColorStop(0, P.panel)
        carcass.addColorStop(0.5, P.raised)
        carcass.addColorStop(1, P.panel)
        fillRound(r.x - 18, r.y - 18, r.w + 36, r.h + 36, 14, carcass, 'rgba(120,170,210,0.35)', 1)

        const inner = ctx.createLinearGradient(0, r.y, 0, r.y + r.h)
        inner.addColorStop(0, P.bg2)
        inner.addColorStop(1, P.bg)
        fillRound(r.x, r.y, r.w, r.h, 6, inner, 'rgba(40,80,120,0.45)')

        const railW = 18
        const railG = ctx.createLinearGradient(r.x, 0, r.x + railW, 0)
        railG.addColorStop(0, P.raised)
        railG.addColorStop(0.45, P.muted)
        railG.addColorStop(1, P.raised)
        fillRound(r.x, r.y, railW, r.h, 3, railG, 'rgba(140,190,220,0.4)')
        const railG2 = ctx.createLinearGradient(r.x + r.w - railW, 0, r.x + r.w, 0)
        railG2.addColorStop(0, P.raised)
        railG2.addColorStop(0.55, P.muted)
        railG2.addColorStop(1, P.raised)
        fillRound(r.x + r.w - railW, r.y, railW, r.h, 3, railG2, 'rgba(140,190,220,0.4)')

        const cross = ctx.createLinearGradient(0, r.y - 18, 0, r.y + 12)
        cross.addColorStop(0, P.muted)
        cross.addColorStop(1, P.raised)
        fillRound(r.x - 12, r.y - 12, r.w + 24, 16, 3, cross, 'rgba(140,190,220,0.35)')
        fillRound(r.x - 12, r.y + r.h - 4, r.w + 24, 16, 3, cross, 'rgba(140,190,220,0.3)')

        ctx.save()
        ctx.globalAlpha = 0.45
        ctx.fillStyle = P.sub
        for (let u = 1; u <= 24; u++) {
          const y = r.y + r.topPad + (u - 1) * r.unitH + r.unitH * 0.35
          ctx.beginPath()
          ctx.arc(r.x + 7, y, 1.4, 0, Math.PI * 2)
          ctx.fill()
          ctx.beginPath()
          ctx.arc(r.x + r.w - 7, y, 1.4, 0, Math.PI * 2)
          ctx.fill()
          if (u % 2 === 1) {
            text(String(u), r.x + 28, y, { size: 8, color: P.sub, weight: '700', alpha: 0.4 })
          }
        }
        ctx.restore()

        ctx.save()
        ctx.globalAlpha = 0.18
        ctx.strokeStyle = P.cyan
        ctx.lineWidth = 2
        for (let i = 0; i < 5; i++) {
          ctx.beginPath()
          ctx.moveTo(r.x + r.w + 22, r.y + 80 + i * 70)
          ctx.bezierCurveTo(
            r.x + r.w + 50, r.y + 100 + i * 70,
            r.x + r.w + 40, r.y + 160 + i * 70,
            r.x + r.w + 22, r.y + 190 + i * 70,
          )
          ctx.stroke()
        }
        ctx.restore()

        text('42U ENTERPRISE RACK', r.x + r.w / 2, r.y + r.h + 34, {
          size: 13, color: P.sub, align: 'center', weight: '700',
        })
        text('PHYSICAL ON-PREMISES CORE', r.x + r.w / 2, r.y + r.h + 52, {
          size: 11, color: P.muted, align: 'center', weight: '600',
        })
      }

      function drawRackDevice(c: InfraComponent, t: number) {
        const b = boxes.get(c.id)
        if (!b) return
        const p = sRef.current
        const accent = c.accent || catColor(c.category)
        const selected = isSelected(p, c.id)
        const hovered = hoverId === c.id
        const isDim = dimmed(c.category, p.focusIds, c.id)
        const alpha = isDim ? 0.2 : 1

        ctx.save()
        ctx.globalAlpha = alpha

        const earW = 14
        const earG = ctx.createLinearGradient(b.x - earW, 0, b.x, 0)
        earG.addColorStop(0, P.raised)
        earG.addColorStop(1, P.raised)
        fillRound(b.x - earW, b.y + 2, earW, b.h - 4, 2, earG, 'rgba(120,170,210,0.4)')
        const earG2 = ctx.createLinearGradient(b.x + b.w, 0, b.x + b.w + earW, 0)
        earG2.addColorStop(0, P.raised)
        earG2.addColorStop(1, P.raised)
        fillRound(b.x + b.w, b.y + 2, earW, b.h - 4, 2, earG2, 'rgba(120,170,210,0.4)')
        ctx.fillStyle = 'rgba(160,200,230,0.55)'
        for (const ex of [b.x - earW / 2, b.x + b.w + earW / 2]) {
          for (const ey of [b.y + 8, b.y + b.h - 8]) {
            ctx.beginPath()
            ctx.arc(ex, ey, 1.8, 0, Math.PI * 2)
            ctx.fill()
          }
        }

        const grad = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h)
        if (selected) {
          grad.addColorStop(0, P.raised)
          grad.addColorStop(0.4, P.panel)
          grad.addColorStop(1, P.bg2)
        } else {
          grad.addColorStop(0, P.panel)
          grad.addColorStop(0.35, P.panel)
          grad.addColorStop(1, P.bg2)
        }
        fillRound(b.x, b.y, b.w, b.h, 3, grad, selected ? P.ink : 'rgba(85,145,195,0.5)', selected ? 2.2 : 1.15)

        ctx.save()
        ctx.globalAlpha = alpha * 0.14
        ctx.fillStyle = P.sub
        roundRect(b.x + 2, b.y + 2, b.w - 4, 3, 2)
        ctx.fill()
        ctx.restore()

        const plateW = Math.min(230, b.w * 0.5)
        fillRound(b.x + 12, b.y + 7, plateW, b.h - 14, 2, 'rgba(6,14,26,0.5)', 'rgba(70,120,160,0.22)')
        text(c.name, b.x + 18, b.y + (b.h > 34 ? b.h / 2 - 7 : b.h / 2), {
          size: b.h > 34 ? 12.5 : 11,
          color: selected ? P.ink : P.sub,
          weight: '700',
          maxW: plateW - 14,
        })
        if (b.h > 34) {
          text(c.role, b.x + 18, b.y + b.h / 2 + 10, {
            size: 10, color: accent, weight: '700', maxW: plateW - 14,
          })
        }

        const detailX = b.x + plateW + 22
        const detailW = b.w - plateW - 40
        if (detailW > 36) {
          if (c.id === 'synology' || c.id === 'qnap') {
            driveBays(detailX, b.y + 10, detailW, b.h - 20, 5)
          } else if (c.id === 'nexus' || c.id === 'patch' || c.id === 'wlc') {
            ventGrid(detailX, b.y + 8, detailW, 10, 14, 1, 0.22)
            ports(detailX, b.y + b.h / 2 - 2, Math.floor(detailW / 9), 5, 7)
          } else if (c.id === 'ups') {
            fillRound(detailX, b.y + 12, 54, 22, 2, 'rgba(20,50,40,0.9)', 'rgba(80,220,140,0.5)')
            text('ONLINE', detailX + 27, b.y + 23, { size: 8, color: P.green, align: 'center', weight: '800' })
            ventGrid(detailX + 70, b.y + 12, detailW - 80, b.h - 24, 10, 3, 0.25)
            led(b.x + b.w - 18, b.y + 14, P.green, 0.8, 3)
          } else {
            ventGrid(detailX, b.y + 10, detailW * 0.72, b.h - 20, 16, b.h > 34 ? 3 : 1, 0.3)
            const ledX = b.x + b.w - 18
            led(ledX, b.y + 12, P.green, 0.65 + 0.35 * Math.sin(t * 3 + (c.rackU ?? 0)), 2.8)
            if (b.h > 28) {
              led(ledX, b.y + b.h / 2, c.category === 'backup' ? P.red : P.blue, 0.5 + 0.45 * Math.sin(t * 4 + (c.rackU ?? 0) * 1.2), 2.8)
            }
            if (b.h > 36) {
              led(ledX, b.y + b.h - 12, c.category === 'security' ? P.amber : P.green, 0.4 + 0.3 * Math.sin(t * 2.1 + (c.rackU ?? 0)), 2.8)
            }
            ctx.beginPath()
            ctx.strokeStyle = 'rgba(140,190,230,0.45)'
            ctx.lineWidth = 1.2
            ctx.arc(detailX + detailW - 12, b.y + b.h / 2, 6, 0, Math.PI * 2)
            ctx.stroke()
          }
        }

        if (hovered && !selected) {
          ctx.globalAlpha = 0.12
          fillRound(b.x - 4, b.y - 3, b.w + 8, b.h + 6, 5, accent, null)
        }
        ctx.restore()
      }

      function drawChip(c: InfraComponent, t: number) {
        const b = boxes.get(c.id)
        if (!b) return
        const p = sRef.current
        const accent = c.accent || catColor(c.category)
        const selected = isSelected(p, c.id)
        const hovered = hoverId === c.id
        const isDim = dimmed(c.category, p.focusIds, c.id)
        const alpha = isDim ? 0.2 : 1
        const isCloud = c.shape === 'cloud'
        const isFirewall = c.shape === 'firewall'
        const r = isCloud ? 14 : isFirewall ? 12 : 10

        ctx.save()
        ctx.globalAlpha = alpha
        if (selected || hovered) {
          ctx.shadowColor = accent
          ctx.shadowBlur = selected ? 22 : 12
        }

        const grad = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h)
        if (isCloud) {
          grad.addColorStop(0, P.panel)
          grad.addColorStop(1, P.panel)
        } else if (isFirewall) {
          grad.addColorStop(0, P.raised)
          grad.addColorStop(1, P.panel)
        } else {
          grad.addColorStop(0, P.panel)
          grad.addColorStop(1, P.panel)
        }
        fillRound(b.x, b.y, b.w, b.h, r, grad, selected ? P.ink : accent, selected ? 2.2 : 1.25)

        ctx.save()
        ctx.globalAlpha = alpha * (isFirewall ? 0.9 : 0.55)
        ctx.fillStyle = accent
        roundRect(b.x + 1, b.y + 1, b.w - 2, 3, 2)
        ctx.fill()
        ctx.restore()

        const cx = b.x + b.w / 2
        const cy = b.y + b.h / 2
        text(c.name, cx, b.h > 60 ? cy - 10 : cy - 4, {
          size: isFirewall ? 15 : 12.5, color: P.ink, align: 'center', weight: '700', maxW: b.w - 18,
        })
        if (c.role) {
          text(c.role, cx, b.h > 60 ? cy + 10 : cy + 13, {
            size: 10.5, color: accent, align: 'center', weight: '600', maxW: b.w - 18,
          })
        }

        if (isFirewall) {
          const label =
            p.edgeVendor === 'fortigate'
              ? EDGE_COPY.fortigate.label
              : EDGE_COPY.unifi.label
          text(label, cx, b.y + b.h - 14, {
            size: 10,
            color: p.edgeVendor === 'fortigate' ? P.amber : P.purple,
            align: 'center',
            weight: '700',
            maxW: b.w - 12,
          })
          led(b.x + 18, cy, P.amber, 0.7 + 0.3 * Math.sin(t * 5), 3.2)
          led(b.x + b.w - 18, cy, P.green, 0.5 + 0.4 * Math.sin(t * 3 + 1), 3.2)
        } else if (isCloud) {
          led(b.x + 15, b.y + 15, accent, 0.55 + 0.3 * Math.sin(t * 2 + b.x * 0.01), 2.8)
          ctx.save()
          ctx.globalAlpha = alpha * 0.18
          ctx.fillStyle = accent
          ctx.beginPath()
          ctx.arc(b.x + b.w - 34, b.y + 20, 10, 0, Math.PI * 2)
          ctx.arc(b.x + b.w - 22, b.y + 18, 12, 0, Math.PI * 2)
          ctx.arc(b.x + b.w - 12, b.y + 22, 9, 0, Math.PI * 2)
          ctx.fill()
          ctx.restore()
        }
        ctx.restore()
      }

      function drawVmChip(c: InfraComponent, t: number) {
        const b = boxes.get(c.id)
        if (!b) return
        const p = sRef.current
        const accent = c.accent || catColor(c.category)
        const selected = isSelected(p, c.id)
        const isDim =
          (p.activeMode !== 'all' && p.activeMode !== c.category) ||
          (p.focusIds !== null && !p.focusIds.has(c.id))
        const alpha = isDim ? 0.18 : 1
        ctx.save()
        ctx.globalAlpha = alpha
        const grad = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h)
        grad.addColorStop(0, selected ? P.raised : P.panel)
        grad.addColorStop(1, P.panel)
        fillRound(b.x, b.y, b.w, b.h, 7, grad, selected ? P.ink : 'rgba(100,160,210,0.45)', selected ? 1.8 : 1)
        ctx.fillStyle = accent
        roundRect(b.x, b.y + 4, 3, b.h - 8, 2)
        ctx.fill()
        text(c.name, b.x + 12, b.y + b.h / 2 - 5, { size: 10.5, color: P.ink, weight: '700', maxW: b.w - 18 })
        text(c.role, b.x + 12, b.y + b.h / 2 + 8, { size: 9, color: accent, weight: '600', maxW: b.w - 18 })
        led(b.x + b.w - 12, b.y + 11, P.green, 0.55 + 0.3 * Math.sin(t * 3 + b.x), 2.2)
        ctx.restore()
      }

      function drawClusterPanel(t: number) {
        const p = sRef.current
        ctx.save()
        const panel = { x: 740, y: 365, w: 380, h: 215 }
        fillRound(panel.x, panel.y, panel.w, panel.h, 12, 'rgba(14,30,50,0.55)', 'rgba(110,150,210,0.3)')
        text('3-NODE PROXMOX CLUSTER · VM HA', panel.x + 14, panel.y + 16, {
          size: 11.5, color: P.sub, weight: '700',
        })
        text('DC-01 · DC-02 · File Server · Legacy Apps', panel.x + 14, panel.y + 34, {
          size: 10, color: P.muted, weight: '500',
        })
        text('On-prem AD authoritative · Hybrid identity', panel.x + 14, panel.y + 50, {
          size: 10, color: P.cyan, weight: '600',
        })

        ctx.globalAlpha = 0.28
        ctx.strokeStyle = P.purple
        ctx.lineWidth = 1.3
        ctx.setLineDash([5, 5])
        ctx.lineDashOffset = frozen ? 0 : -t * 12
        for (const id of ['px1', 'px2', 'px3']) {
          const pb = boxes.get(id)
          if (!pb) continue
          const a = center(pb)
          ctx.beginPath()
          ctx.moveTo(a.x + 60, a.y)
          ctx.lineTo(panel.x + 10, panel.y + panel.h / 2)
          ctx.stroke()
        }
        ctx.setLineDash([])

        for (const c of nodeList()) if (c.layer === 'vm') drawVmChip(c, t)

        const ec = boxes.get('entraconnect')
        if (ec) {
          ctx.globalAlpha = 0.22 + 0.1 * Math.sin(t * 2)
          ctx.strokeStyle = P.cyan
          ctx.lineWidth = 1.5
          roundRect(ec.x - 3, ec.y - 3, ec.w + 6, ec.h + 6, 8)
          ctx.stroke()
          ctx.globalAlpha = 1
          text('AD → Entra Connect → Entra ID', ec.x + ec.w / 2, ec.y + ec.h + 12, {
            size: 9, color: P.cyan, align: 'center', weight: '700',
          })
        }

        ctx.globalAlpha = 0.55
        ctx.strokeStyle = P.cyan
        ctx.lineWidth = 1.7
        ctx.setLineDash([7, 7])
        ctx.lineDashOffset = frozen ? 0 : -t * 22
        ctx.beginPath()
        ctx.moveTo(1010, 400)
        ctx.bezierCurveTo(1050, 330, 1020, 220, 980, 95)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.lineDashOffset = 0

        ctx.globalAlpha = 0.5
        ctx.strokeStyle = P.red
        ctx.lineWidth = 1.7
        ctx.setLineDash([7, 7])
        ctx.lineDashOffset = frozen ? 0 : -t * 20
        ctx.beginPath()
        ctx.moveTo(720, 680)
        ctx.bezierCurveTo(780, 730, 820, 730, 870, 705)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.restore()

        const legacy = byId('legacy')
        const lb = legacy ? boxes.get('legacy') : undefined
        if (legacy && lb) {
          const selected = isSelected(p, 'legacy')
          ctx.save()
          ctx.globalAlpha = 0.48
          const grad = ctx.createLinearGradient(lb.x, lb.y, lb.x, lb.y + lb.h)
          grad.addColorStop(0, P.raised)
          grad.addColorStop(1, P.panel)
          fillRound(lb.x, lb.y, lb.w, lb.h, 11, grad, selected ? P.ink : 'rgba(150,120,90,0.45)', selected ? 2 : 1)
          ctx.globalAlpha = 0.82
          text('LEGACY / DECOMMISSIONED', lb.x + 12, lb.y + 18, { size: 10, color: P.muted, weight: '700' })
          text('EOL servers · NetApp · Quantum DXi', lb.x + 12, lb.y + 40, { size: 9, color: P.muted, weight: '500', maxW: lb.w - 20 })
          text('Legacy firewalls · not active production', lb.x + 12, lb.y + 58, { size: 9, color: P.muted, weight: '500', maxW: lb.w - 20 })
          text('Scheduled for replacement', lb.x + 12, lb.y + 88, { size: 9, color: P.muted, weight: '600' })
          ctx.restore()
        }

        for (const c of nodeList()) {
          if (c.layer !== 'users') continue
          const b = boxes.get(c.id)
          if (!b) continue
          const accent = c.accent || catColor(c.category)
          const selected = isSelected(p, c.id)
          const isDim = dimmed(c.category, p.focusIds, c.id)
          ctx.save()
          ctx.globalAlpha = isDim ? 0.18 : 1
          const grad = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h)
          grad.addColorStop(0, P.panel)
          grad.addColorStop(1, P.bg2)
          fillRound(b.x, b.y, b.w, b.h, 11, grad, selected ? P.ink : accent, selected ? 2 : 1.1)
          text(c.name, b.x + b.w / 2, b.y + 18, {
            size: 10, color: P.ink, align: 'center', weight: '700', maxW: b.w - 12,
          })
          text(c.role, b.x + b.w / 2, b.y + 34, {
            size: 8.5, color: accent, align: 'center', weight: '600', maxW: b.w - 12,
          })
          if (c.id === 'endpoints') {
            fillRound(b.x + 18, b.y + 48, 38, 22, 3, 'rgba(70,140,200,0.3)', 'rgba(130,190,235,0.5)')
            fillRound(b.x + 21, b.y + 51, 32, 14, 2, 'rgba(30,80,140,0.75)', null)
            fillRound(b.x + 72, b.y + 48, 14, 26, 3, 'rgba(70,140,200,0.3)', 'rgba(130,190,235,0.5)')
            fillRound(b.x + 105, b.y + 48, 42, 24, 3, 'rgba(70,140,200,0.22)', 'rgba(130,190,235,0.45)')
            fillRound(b.x + 109, b.y + 51, 34, 15, 2, 'rgba(30,80,140,0.7)', null)
            text('Intune + Defender', b.x + b.w / 2, b.y + 88, {
              size: 8.5, color: P.sub, align: 'center', weight: '600',
            })
          } else {
            for (let i = 0; i < 3; i++) {
              fillRound(b.x + 28 + i * 44, b.y + 48, 32, 18, 3, 'rgba(40,120,90,0.3)', 'rgba(90,190,150,0.5)')
              led(b.x + 28 + i * 44 + 16, b.y + 57, P.green, 0.5, 1.4)
            }
            text('CAD · Images · Scanned Docs', b.x + b.w / 2, b.y + 82, {
              size: 8.5, color: P.sub, align: 'center', weight: '600', maxW: b.w - 10,
            })
          }
          ctx.restore()
        }

        ctx.save()
        fillRound(250, 820, 620, 52, 10, 'rgba(12,28,48,0.55)', 'rgba(67,209,158,0.3)')
        text('ACTIVE COLLABORATION → SharePoint / OneDrive', 266, 838, {
          size: 10.5, color: P.green, weight: '700',
        })
        text('BULK / LARGE / LEGACY DATA → Synology / On-Prem SMB', 266, 860, {
          size: 10.5, color: P.cyan, weight: '700',
        })
        ctx.restore()
      }

      function drawManagementOverlay() {
        if (sRef.current.viewMode !== 'management') return
        ctx.save()
        ctx.fillStyle = 'rgba(7,17,31,0.52)'
        ctx.fillRect(0, 0, DESIGN_W, DESIGN_H)
        const cards = [
          { x: 750, y: 280, w: 170, h: 58, title: 'SECURITY', sub: 'HA edge · MFA/CA · Defender', color: P.amber },
          { x: 935, y: 280, w: 170, h: 58, title: 'RESILIENCE', sub: 'vPC · Dual ISP · UPS · HA', color: P.blue },
          { x: 750, y: 350, w: 170, h: 58, title: 'IDENTITY', sub: 'On-prem AD + Entra ID', color: P.cyan },
          { x: 935, y: 350, w: 170, h: 58, title: 'BACKUP & BC', sub: 'Veeam → QNAP → off-site', color: P.red },
          { x: 750, y: 420, w: 170, h: 58, title: 'MICROSOFT 365', sub: 'Collaboration + security', color: P.purple },
          { x: 935, y: 420, w: 170, h: 58, title: 'LESS LEGACY', sub: 'Modern platform replaces EOL', color: P.green },
        ]
        for (const c of cards) {
          fillRound(c.x, c.y, c.w, c.h, 11, 'rgba(15,32,54,0.94)', c.color)
          text(c.title, c.x + 11, c.y + 20, { size: 11, color: P.ink, weight: '700' })
          text(c.sub, c.x + 11, c.y + 40, { size: 9.5, color: P.sub, weight: '500', maxW: c.w - 16 })
        }
        text('MANAGEMENT VIEW', 750, 262, { size: 10.5, color: P.sub, weight: '700' })
        ctx.restore()
      }

      function drawPlayPulse(t: number) {
        const p = sRef.current
        if (p.playStep < 0) return
        const colorMap: Record<number, string> = {
          0: P.blue, 1: P.amber, 2: P.blue, 3: P.purple,
          4: P.green, 5: P.cyan, 6: P.amber, 7: P.red, 8: P.red,
        }
        const color = colorMap[p.playStep] ?? P.cyan
        ctx.save()
        ctx.globalAlpha = 0.07 + 0.03 * Math.sin(t * 5)
        ctx.fillStyle = color
        ctx.fillRect(0, 0, DESIGN_W, DESIGN_H)
        ctx.restore()
      }

      // Lock badges for editor-locked nodes (drag-blocked).
      function drawLockBadges() {
        const locked = sRef.current.lockedIds
        if (!locked || locked.size === 0) return
        ctx.save()
        ctx.font = '11px sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        for (const [id, box] of boxes) {
          if (!locked.has(id)) continue
          const bx = box.x + box.w - 12
          const by = box.y + 12
          ctx.beginPath()
          ctx.arc(bx, by, 9, 0, Math.PI * 2)
          ctx.fillStyle = P.panel
          ctx.fill()
          ctx.lineWidth = 1.5
          ctx.strokeStyle = P.amber
          ctx.stroke()
          ctx.fillStyle = P.amber
          ctx.fillText('🔒', bx, by + 0.5)
        }
        ctx.restore()
      }

      // Attention pulse for nodes flagged in the editor. Frozen (reduced
      // motion) frames render one static ring instead of animating.
      function drawPulseRings(t: number) {
        const list = nodeList()
        if (!list.some((c) => c.pulse)) return
        ctx.save()
        for (const c of list) {
          if (!c.pulse) continue
          const b = boxes.get(c.id)
          if (!b) continue
          const accent = c.accent || catColor(c.category)
          const wobble = frozen ? 0 : Math.sin(t * 4)
          const pr = 5 + (frozen ? 0 : 2.5 * wobble)
          ctx.globalAlpha = frozen ? 0.5 : Math.max(0.15, 0.45 + 0.25 * wobble)
          ctx.strokeStyle = accent
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.arc(b.x + b.w / 2, b.y + b.h / 2, Math.max(b.w, b.h) / 2 + pr, 0, Math.PI * 2)
          ctx.stroke()
        }
        ctx.restore()
      }

      function renderFrame(t: number) {
        P = palRef.current
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0)
        ctx.clearRect(0, 0, W, H)
        // Base fill so panning/zooming past the design bounds stays seamless
        // (drawBackground only covers the design rect).
        ctx.fillStyle = P.bg
        ctx.fillRect(0, 0, W, H)
        ctx.save()
        ctx.translate(effOx(), effOy())
        ctx.scale(effS(), effS())
        drawBackground()
        drawZoneLabels()
        drawFlows(t)
        drawPendingLink(t)
        drawMarquee()
        if (nodeList().some((c) => c.layer === 'rack')) drawRackFrame()
        for (const c of nodeList()) {
          if (c.layer === 'rack') drawRackDevice(c, t)
        }
        drawClusterPanel(t)
        for (const c of nodeList()) {
          if (c.layer === 'edge' || c.layer === 'cloud') drawChip(c, t)
        }
        drawLockBadges()
        drawResizeHandles()
        drawGuides()
        drawPulseRings(t)
        drawManagementOverlay()
        drawPlayPulse(t)
        ctx.restore()
      }
      drawRef.current = renderFrame

      // ── frame loop with park ─────────────────────────────────
      function loop(tms: number) {
        if (docHidden || offscreen) {
          running = false
          raf = 0
          return
        }
        raf = requestAnimationFrame(loop)
        renderFrame(tms / 1000)
      }

      function kick() {
        if (frozen) {
          renderFrame(1.0)
          return
        }
        if (docHidden || offscreen) return
        if (!running) {
          running = true
          raf = requestAnimationFrame(loop)
        }
      }
      kickRef.current = kick

      function toDesign(e: MouseEvent | PointerEvent | WheelEvent) {
        const rect = canvas.getBoundingClientRect()
        return {
          mx: e.clientX - rect.left,
          my: e.clientY - rect.top,
        }
      }

      function hitAt(mx: number, my: number): string | null {
        const nl = nodeList()
        for (let i = nl.length - 1; i >= 0; i--) {
          const h = hits.get(nl[i].id)
          if (h && mx >= h.x && mx <= h.x + h.w && my >= h.y && my <= h.y + h.h) {
            return nl[i].id
          }
        }
        return null
      }

      function designFromClient(mx: number, my: number) {
        return { x: (mx - effOx()) / effS(), y: (my - effOy()) / effS() }
      }

      // Library drag-and-drop: accept drops only in edit mode; convert the
      // drop point to design coords and let the parent place the node.
      const onDragOver = (e: DragEvent) => {
        if (!sRef.current.editable || !sRef.current.onDropLibraryItem) return
        e.preventDefault()
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
      }
      const onLibDrop = (e: DragEvent) => {
        if (!sRef.current.editable || !sRef.current.onDropLibraryItem) return
        // Always swallow once accepted in onDragOver — dropping foreign
        // payloads (plain text from another window) must not navigate.
        e.preventDefault()
        const key =
          e.dataTransfer?.getData('application/x-infra-library') ||
          e.dataTransfer?.getData('text/plain') ||
          ''
        if (!key) return
        const { mx, my } = toDesign(e)
        const { x, y } = designFromClient(mx, my)
        sRef.current.onDropLibraryItem(key, x, y)
      }

      // Grid snap (Odoo-style placement): step from props, null/0 = free move.
      const snap = (v: number) => {
        const step = sRef.current.snap ?? 10
        if (!step || step <= 0) return Math.round(v)
        return Math.round(v / step) * step
      }

      /** Shared drag update for mouse + pointer (incl. pen/touch capture). */
      function updateDrag(mx: number, my: number) {
        if (!dragId) return
        const d = designFromClient(mx, my)
        if (dragGroup) {
          guides = []
          const ddx = d.x - dragStart.x
          const ddy = d.y - dragStart.y
          if (Math.abs(ddx) > 2 || Math.abs(ddy) > 2) dragMoved = true
          dragTouched = true
          for (const g of dragGroup) {
            sRef.current.onMoveNode?.(g.id, {
              x: snap(g.ox + ddx),
              y: snap(g.oy + ddy),
            }, false)
          }
          return
        }
        const node = byId(dragId)
        if (node && sRef.current.onMoveNode) {
          if (node.layer === 'rack') {
            guides = []
            const rackU = Math.max(
              1,
              Math.min(
                42,
                Math.round((d.y - (RACK.y + RACK.topPad)) / RACK.unitH) + 1,
              ),
            )
            if (rackU !== node.rackU) {
              dragTouched = true
              sRef.current.onMoveNode(dragId, { rackU }, false)
            }
          } else {
            const box = boxes.get(dragId)
            if (box) {
              let nx = snap(d.x - dragDX)
              let ny = snap(d.y - dragDY)
              // Smart snap: snap edges/centers onto nearby nodes (screen-space
              // threshold so it feels the same at any zoom); grid keeps the
              // axis that finds no alignment.
              const ss = smartSnap(dragId, nx, ny, box.w, box.h)
              if (ss) {
                nx = ss.x
                ny = ss.y
                guides = ss.guides
              } else {
                guides = []
              }
              if (Math.abs(nx - box.x) > 2 || Math.abs(ny - box.y) > 2) dragMoved = true
              dragTouched = true
              sRef.current.onMoveNode(dragId, { x: nx, y: ny }, false)
            }
          }
        }
      }

      // Alignment candidates: every free node's left/center/right and
      // top/middle/bottom vs the dragged box. Best hit within a 6-px
      // screen threshold wins and returns a visible guide line.
      function smartSnap(
        dragId: string,
        x: number,
        y: number,
        w: number,
        h: number,
      ): { x: number; y: number; guides: Guide[] } | null {
        const thr = 6 / effS()
        let bx = x
        let by = y
        let gx: { pos: number; from: number; to: number } | null = null
        let gy: { pos: number; from: number; to: number } | null = null
        let bestX = thr
        let bestY = thr
        const dragXs = [x, x + w / 2, x + w]
        const dragYs = [y, y + h / 2, y + h]
        for (const o of nodeList()) {
          if (o.id === dragId || o.layer === 'rack') continue
          const ob = boxes.get(o.id)
          if (!ob) continue
          for (const tx of [ob.x, ob.x + ob.w / 2, ob.x + ob.w]) {
            for (let i = 0; i < dragXs.length; i++) {
              const diff = Math.abs(dragXs[i] - tx)
              if (diff <= bestX) {
                bestX = diff
                bx = x - (dragXs[i] - tx)
                gx = { pos: tx, from: Math.min(y, ob.y), to: Math.max(y + h, ob.y + ob.h) }
              }
            }
          }
          for (const ty of [ob.y, ob.y + ob.h / 2, ob.y + ob.h]) {
            for (let i = 0; i < dragYs.length; i++) {
              const diff = Math.abs(dragYs[i] - ty)
              if (diff <= bestY) {
                bestY = diff
                by = y - (dragYs[i] - ty)
                gy = { pos: ty, from: Math.min(x, ob.x), to: Math.max(x + w, ob.x + ob.w) }
              }
            }
          }
        }
        if (!gx && !gy) return null
        const out: Guide[] = []
        if (gx) out.push({ axis: 'x', ...gx })
        if (gy) out.push({ axis: 'y', ...gy })
        return { x: bx, y: by, guides: out }
      }

      function updateCursor(mx: number, my: number) {
        const found = hitAt(mx, my)
        hoverId = found
        if (rzId) {
          canvas.style.cursor = resizeCursor(rzDir)
          return
        }
        if (
          sRef.current.editable &&
          !dragId &&
          panId === null &&
          mqId === null &&
          !spaceHeld
        ) {
          const d = designFromClient(mx, my)
          const dir = hitHandle(d.x, d.y)
          if (dir) {
            canvas.style.cursor = resizeCursor(dir)
            return
          }
        }
        canvas.style.cursor = dragId || panId !== null || mqId !== null
          ? 'grabbing'
          : sRef.current.editable && sRef.current.connectFrom
            ? 'crosshair'
            : found
              ? 'pointer'
              : 'grab'
      }

      // Hover + (mouse-compat) drag updates. Pointer capture on pen/touch
      // delivers pointermove only, so drag also lives in onPointerMove.
      function onMove(e: MouseEvent) {
        const rect = canvas.getBoundingClientRect()
        const mx = e.clientX - rect.left
        const my = e.clientY - rect.top
        updateCursor(mx, my)
        if (dragId) {
          updateDrag(mx, my)
        } else if (sRef.current.editable && panId === null) {
          cursorDesign = designFromClient(mx, my)
        }
      }

      // Wheel: blueprint-style zoom toward the cursor (also swallows the
      // browser's Ctrl+wheel page zoom, like a design tool). At a zoom
      // bound the wheel passes through so the page can still scroll.
      function onWheel(e: WheelEvent) {
        const { mx, my } = toDesign(e)
        const factor = wheelZoomFactor(e.deltaY, e.deltaMode, H)
        if (wheelAtBound(viewRef.current, factor)) return
        e.preventDefault()
        zoomBy(factor, mx, my)
      }

      function startPan(e: PointerEvent) {
        panId = e.pointerId
        panSX = e.clientX
        panSY = e.clientY
        panPX = viewRef.current.px
        panPY = viewRef.current.py
        panMoved = false
        canvas.style.cursor = 'grabbing'
        try {
          canvas.setPointerCapture(e.pointerId)
        } catch {
          /* noop */
        }
      }

      function endPan(e: PointerEvent) {
        if (panId !== e.pointerId) return
        panId = null
        persistView()
        try {
          canvas.releasePointerCapture(e.pointerId)
        } catch {
          /* noop */
        }
      }

      function startMarquee(e: PointerEvent, mx: number, my: number) {
        const d = designFromClient(mx, my)
        mqId = e.pointerId
        mqX0 = mqX1 = d.x
        mqY0 = mqY1 = d.y
        mqCX = e.clientX
        mqCY = e.clientY
        mqMoved = false
        try {
          canvas.setPointerCapture(e.pointerId)
        } catch {
          /* noop */
        }
      }

      function endMarquee(e: PointerEvent) {
        if (mqId !== e.pointerId) return
        mqId = null
        try {
          canvas.releasePointerCapture(e.pointerId)
        } catch {
          /* noop */
        }
        if (!mqMoved) return
        suppressClick = true
        const p = sRef.current
        if (!p.onMarqueeSelect) return
        const x0 = Math.min(mqX0, mqX1)
        const x1 = Math.max(mqX0, mqX1)
        const y0 = Math.min(mqY0, mqY1)
        const y1 = Math.max(mqY0, mqY1)
        const ids: string[] = []
        for (const c of nodeList()) {
          const b = boxes.get(c.id)
          if (!b) continue
          if (b.x < x1 && b.x + b.w > x0 && b.y < y1 && b.y + b.h > y0) ids.push(c.id)
        }
        p.onMarqueeSelect(ids)
      }

      function onPointerDown(e: PointerEvent) {
        const primary = e.button === 0
        const middle = e.button === 1
        if (!primary && !middle) return
        panMoved = false
        suppressClick = false
        if (dragId) return
        const { mx, my } = toDesign(e)
        const found = hitAt(mx, my)
        const p = sRef.current
        // Space+drag always pans (even over nodes) — design-tool convention.
        if (spaceHeld && primary) {
          startPan(e)
          return
        }
        // Locked nodes: click-to-select only (no drag, no pan-through).
        if (primary && found && p.lockedIds?.has(found)) return
        // Resize handles sit on the selected node — checked before the
        // node-drag branch so a press on a handle resizes, never moves.
        if (primary && p.editable && !p.connectFrom) {
          const d0 = designFromClient(mx, my)
          const dir = hitHandle(d0.x, d0.y)
          const tid = dir ? resizeTarget() : null
          if (dir && tid && !p.lockedIds?.has(tid)) {
            const b = boxes.get(tid)
            if (b) {
              rzId = tid
              rzDir = dir
              rzO = { x: b.x, y: b.y, w: b.w, h: b.h }
              rzBox = { ...rzO }
              rzSX = d0.x
              rzSY = d0.y
              rzMoved = false
              cursorDesign = null
              try {
                canvas.setPointerCapture(e.pointerId)
              } catch {
                /* noop */
              }
              return
            }
          }
        }
        // Edit mode: a press on a node starts a node drag (never a pan).
        // Link mode must not start a move either — the click completes the
        // connection, otherwise press-drag-release both moves and links.
        if (primary && p.editable && !p.connectFrom && found) {
          const box = boxes.get(found)
          const d = designFromClient(mx, my)
          // Group drag when the pressed node belongs to a multi-selection:
          // locked nodes and rack units (rackU is single-owner) stay put.
          if (box && p.selectedIds && p.selectedIds.size > 1 && p.selectedIds.has(found)) {
            const group: { id: string; ox: number; oy: number }[] = []
            for (const id of p.selectedIds) {
              if (p.lockedIds?.has(id)) continue
              const n = byId(id)
              const b = boxes.get(id)
              if (!n || n.layer === 'rack' || !b) continue
              group.push({ id, ox: b.x, oy: b.y })
            }
            if (group.length > 1) {
              dragId = found
              dragGroup = group
              dragStart = { x: d.x, y: d.y }
              dragMoved = false
              dragTouched = false
              cursorDesign = null
              try {
                canvas.setPointerCapture(e.pointerId)
              } catch {
                /* noop */
              }
              return
            }
          }
          dragId = found
          dragGroup = null
          dragMoved = false
          dragTouched = false
          cursorDesign = null
          if (box) {
            dragDX = d.x - box.x
            dragDY = d.y - box.y
          } else {
            dragDX = 0
            dragDY = 0
          }
          try {
            canvas.setPointerCapture(e.pointerId)
          } catch {
            /* noop */
          }
          return
        }
        // Pan: middle button anywhere, primary button on empty space in view
        // mode. Touch is excluded so the page can still scroll under a finger
        // (node drag above still works via pointer capture + pointermove).
        // Edit mode: primary drag on empty space starts the selection
        // marquee (pan stays on space+drag / middle button, Figma-style).
        if (e.pointerType === 'touch') return
        if (middle) {
          startPan(e)
          return
        }
        if (primary && p.editable && !p.connectFrom && p.onMarqueeSelect && !found) {
          startMarquee(e, mx, my)
          return
        }
        if (primary && (!found || !p.editable)) startPan(e)
      }

      // Block middle-click autoscroll (pan owns the middle button).
      function onMouseDown(e: MouseEvent) {
        if (e.button === 1) e.preventDefault()
      }

      function onPointerMove(e: PointerEvent) {
        const rect = canvas.getBoundingClientRect()
        const mx = e.clientX - rect.left
        const my = e.clientY - rect.top

        // Hold-and-move the view (middle-button / empty-space drag).
        if (panId === e.pointerId) {
          const dx = e.clientX - panSX
          const dy = e.clientY - panSY
          if (Math.abs(dx) > 3 || Math.abs(dy) > 3) panMoved = true
          viewRef.current = clampView(
            S,
            { ...viewRef.current, px: panPX + dx, py: panPY + dy },
            W,
            H,
            { w: DESIGN_W, h: DESIGN_H },
          )
          layoutScene()
          kick()
          return
        }

        // Rubber-band selection: track the live end + movement threshold.
        if (mqId === e.pointerId) {
          const d = designFromClient(mx, my)
          mqX1 = d.x
          mqY1 = d.y
          if (Math.abs(e.clientX - mqCX) > 4 || Math.abs(e.clientY - mqCY) > 4) mqMoved = true
          kick()
          return
        }

        // Resize-handle drag: recompute the box and checkpoint each frame.
        if (rzId) {
          const d = designFromClient(mx, my)
          updateResize(d.x, d.y)
          kick()
          return
        }

        // Hold-and-move a node (or multi-selection). Pointer capture keeps
        // events on the canvas even when the cursor leaves it mid-drag.
        if (dragId) {
          updateCursor(mx, my)
          updateDrag(mx, my)
          kick()
          return
        }

        if (sRef.current.editable) {
          cursorDesign = designFromClient(mx, my)
          // Live rubber-band for the pending connect line.
          if (sRef.current.connectFrom) kick()
        }
        updateCursor(mx, my)
      }

      // Close the editor's drag checkpoint: commit the final position (or at
      // minimum a done=true no-op) whenever any onMoveNode fired for this
      // drag — pointer-up, pointer-cancel, and sub-threshold jitter alike —
      // so the next drag always pushes its own undo history.
      function finalizeDrag() {
        guides = []
        if (!dragId) {
          dragGroup = null
          return
        }
        const doneId = dragId
        const wasMoved = dragMoved
        const wasTouched = dragTouched
        const group = dragGroup
        dragId = null
        dragGroup = null
        if (wasMoved) suppressClick = true
        dragMoved = false
        dragTouched = false
        if (!wasTouched || !sRef.current.onMoveNode) return
        if (group) {
          if (wasMoved) {
            for (const g of group) {
              const b = boxes.get(g.id)
              if (b) {
                sRef.current.onMoveNode(g.id, { x: Math.round(b.x), y: Math.round(b.y) }, true)
              }
            }
          } else {
            sRef.current.onMoveNode(group[0].id, {}, true)
          }
          return
        }
        const node = byId(doneId)
        const box = boxes.get(doneId)
        if (wasMoved && node && box) {
          if (node.layer === 'rack') {
            sRef.current.onMoveNode(doneId, { rackU: node.rackU }, true)
          } else {
            sRef.current.onMoveNode(doneId, { x: Math.round(box.x), y: Math.round(box.y) }, true)
          }
        } else {
          sRef.current.onMoveNode(doneId, {}, true)
        }
      }

      function onPointerUp(e: PointerEvent) {
        endPan(e)
        endMarquee(e)
        const hadRz = Boolean(rzId)
        finalizeResize()
        const hadDrag = Boolean(dragId)
        finalizeDrag()
        if (hadDrag || hadRz) {
          try {
            canvas.releasePointerCapture(e.pointerId)
          } catch {
            /* noop */
          }
        }
      }

      function onPointerCancel(e: PointerEvent) {
        endPan(e)
        endMarquee(e)
        finalizeResize()
        finalizeDrag()
      }

      function onClick(e: MouseEvent) {
        // A node drag or view pan that moved is not a click (prevents
        // accidental links/selections after repositioning the view).
        if (suppressClick) {
          suppressClick = false
          dragMoved = false
          panMoved = false
          return
        }
        if (dragMoved) {
          dragMoved = false
          return
        }
        if (panMoved) {
          panMoved = false
          return
        }
        const { mx, my } = toDesign(e)
        const found = hitAt(mx, my)
        const p = sRef.current
        // Shift-click toggles membership in the multi-selection.
        if (found && e.shiftKey && p.onToggleSelect) {
          p.onToggleSelect(found)
          return
        }
        if (p.editable && p.connectFrom && found && found !== p.connectFrom && p.onAddLink) {
          p.onAddLink(p.connectFrom, found)
          return
        }
        p.onSelect(found)
      }

      // Ctrl/⌘ + "+"/"-"/"0" zooms while the pointer is over the diagram
      // (or the canvas has focus). Outside that scope the browser keeps its
      // normal page-zoom shortcut.
      function onWinKey(e: KeyboardEvent) {
        if (!(e.ctrlKey || e.metaKey) || e.altKey) return
        const ae = document.activeElement
        const tag = (ae?.tagName || '').toLowerCase()
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return
        if (!overCanvas && ae !== canvas) return
        const k = e.key
        if (k === '=' || k === '+') {
          e.preventDefault()
          zoomBy(1.25)
        } else if (k === '-' || k === '_') {
          e.preventDefault()
          zoomBy(0.8)
        } else if (k === '0') {
          e.preventDefault()
          fit()
        }
      }

      function onMouseLeave() {
        hoverId = null
        cursorDesign = null
        overCanvas = false
      }

      // ── touch: 1-finger horizontal pan, 2-finger pinch zoom ────
      // touch-action: pan-y keeps vertical scrolling native; horizontal
      // drags and all pinch gestures are handled here.
      let touchPan: { sx: number; px: number } | null = null
      let pinchDist = 0

      const pinchLen = (t: TouchList) =>
        Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)

      function onTouchStart(e: TouchEvent) {
        // A live node drag owns the finger — don't also pan the view, and
        // don't let the page scroll under the drag.
        if (dragId) {
          e.preventDefault()
          return
        }
        if (panId !== null) return
        if (e.touches.length === 1) {
          pinchDist = 0
          touchPan = { sx: e.touches[0].clientX, px: viewRef.current.px }
          panMoved = false
        } else if (e.touches.length === 2) {
          touchPan = null
          pinchDist = pinchLen(e.touches)
          e.preventDefault()
        }
      }

      function onTouchMove(e: TouchEvent) {
        if (dragId || panId !== null) return
        if (e.touches.length === 2 && pinchDist > 0) {
          e.preventDefault()
          const d = pinchLen(e.touches)
          if (d > 0 && pinchDist > 0) {
            const rect = canvas.getBoundingClientRect()
            const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left
            const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top
            zoomBy(d / pinchDist, midX, midY)
          }
          pinchDist = d
          panMoved = true
          return
        }
        if (e.touches.length === 1 && touchPan) {
          const dx = e.touches[0].clientX - touchPan.sx
          if (Math.abs(dx) < 4) return
          e.preventDefault()
          viewRef.current = clampView(
            S,
            { ...viewRef.current, px: touchPan.px + dx },
            W,
            H,
            { w: DESIGN_W, h: DESIGN_H },
          )
          panMoved = true
          layoutScene()
          kick()
        }
      }

      function onTouchEnd(e: TouchEvent) {
        if (e.touches.length === 0) {
          const wasPan = panMoved
          touchPan = null
          pinchDist = 0
          if (wasPan) {
            notifyView()
            persistView()
          }
        } else if (e.touches.length === 1 && pinchDist > 0) {
          // Pinch collapsed to one finger: resume single-finger tracking.
          pinchDist = 0
          touchPan = { sx: e.touches[0].clientX, px: viewRef.current.px }
        }
      }

      let kbIndex = -1
      // Space+drag pans the view (design-tool hold-to-move).
      let spaceHeld = false
      function onSpaceKey(e: KeyboardEvent) {
        if (e.code !== 'Space' && e.key !== ' ') return
        const ae = document.activeElement
        const tag = (ae?.tagName || '').toLowerCase()
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return
        if (ae && ae !== canvas && ae !== document.body && ae !== wrap) return
        if (e.type === 'keydown') {
          spaceHeld = true
          canvas.style.cursor = 'grab'
          if (ae === canvas || ae === document.body) e.preventDefault()
        } else {
          spaceHeld = false
          if (panId === null && !dragId) canvas.style.cursor = 'grab'
        }
      }

      function onKey(e: KeyboardEvent) {
        const nl = nodeList()
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault()
          // Shift+arrows pan the viewport.
          if (e.shiftKey) {
            const step = 90
            const dx = e.key === 'ArrowRight' ? -step : e.key === 'ArrowLeft' ? step : 0
            const dy = e.key === 'ArrowDown' ? -step : e.key === 'ArrowUp' ? step : 0
            panBy(dx, dy)
            return
          }
          // Edit mode: arrows nudge the selection (1px / 10px with Alt).
          if (sRef.current.editable && sRef.current.onMoveNode) {
            const ids = [
              ...(sRef.current.selectedIds?.size
                ? sRef.current.selectedIds
                : sRef.current.selectedId
                  ? [sRef.current.selectedId]
                  : []),
            ].filter((id) => !sRef.current.lockedIds?.has(id))
            if (ids.length) {
              const step = e.altKey ? 10 : 1
              const dx = e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0
              const dy = e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0
              for (const id of ids) {
                const n = byId(id)
                const b = boxes.get(id)
                if (!n || n.layer === 'rack') continue
                if (b) {
                  sRef.current.onMoveNode(id, { x: Math.round(b.x) + dx, y: Math.round(b.y) + dy }, true)
                } else if (typeof n.x === 'number' && typeof n.y === 'number') {
                  sRef.current.onMoveNode(id, { x: n.x + dx, y: n.y + dy }, true)
                }
              }
              kick()
              return
            }
          }
          // Empty doc (NEW or everything deleted): nothing to cycle.
          if (!nl.length) return
          if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
            kbIndex = (kbIndex + 1) % nl.length
          } else {
            kbIndex = (kbIndex - 1 + nl.length) % nl.length
          }
          sRef.current.onSelect(nl[kbIndex].id)
        } else if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          if (kbIndex >= 0 && nl[kbIndex]) sRef.current.onSelect(nl[kbIndex].id)
        } else if (e.key === 'Escape') {
          sRef.current.onSelect(null)
          kbIndex = -1
        }
      }

      const onVis = () => {
        docHidden = document.hidden
        if (!docHidden && !offscreen) kick()
      }
      document.addEventListener('visibilitychange', onVis)
      let obs: IntersectionObserver | null = null
      if (typeof IntersectionObserver !== 'undefined') {
        obs = new IntersectionObserver(
          ([entry]) => {
            offscreen = !entry.isIntersecting
            if (entry.isIntersecting) kick()
          },
          { threshold: 0 },
        )
        obs.observe(wrap)
      }

      let roT = 0
      let ro: ResizeObserver | null = null
      if (typeof ResizeObserver !== 'undefined') {
        let lastW = 0
        ro = new ResizeObserver(() => {
          window.clearTimeout(roT)
          roT = window.setTimeout(() => {
            const w = wrap.clientWidth || 0
            if (Math.abs(w - lastW) < 24) return
            lastW = w
            resize()
            kick()
          }, 180)
        })
        ro.observe(wrap)
      }

      function onMouseEnter() {
        overCanvas = true
      }

      canvas.addEventListener('mousemove', onMove)
      canvas.addEventListener('mouseenter', onMouseEnter)
      canvas.addEventListener('mouseleave', onMouseLeave)
      canvas.addEventListener('mousedown', onMouseDown)
      canvas.addEventListener('click', onClick)
      canvas.addEventListener('keydown', onKey)
      window.addEventListener('keydown', onSpaceKey)
      window.addEventListener('keyup', onSpaceKey)
      canvas.addEventListener('pointerdown', onPointerDown)
      canvas.addEventListener('pointermove', onPointerMove)
      canvas.addEventListener('pointerup', onPointerUp)
      canvas.addEventListener('pointercancel', onPointerCancel)
      canvas.addEventListener('wheel', onWheel, { passive: false })
      canvas.addEventListener('touchstart', onTouchStart, { passive: false })
      canvas.addEventListener('touchmove', onTouchMove, { passive: false })
      canvas.addEventListener('touchend', onTouchEnd)
      canvas.addEventListener('touchcancel', onTouchEnd)
      window.addEventListener('keydown', onWinKey)
      canvas.addEventListener('dragover', onDragOver)
      canvas.addEventListener('drop', onLibDrop)

      resize()
      // Initial selection handled by parent (defaults to firewall).
      kick()

      return () => {
        running = false
        opsRef.current = null
        window.clearTimeout(persistT)
        try {
          cancelAnimationFrame(raf)
        } catch {
          /* noop */
        }
        raf = 0
        window.clearTimeout(roT)
        ro?.disconnect()
        obs?.disconnect()
        document.removeEventListener('visibilitychange', onVis)
        window.removeEventListener('keydown', onWinKey)
        canvas.removeEventListener('mousemove', onMove)
        canvas.removeEventListener('mouseenter', onMouseEnter)
        canvas.removeEventListener('mouseleave', onMouseLeave)
        canvas.removeEventListener('mousedown', onMouseDown)
        canvas.removeEventListener('click', onClick)
        canvas.removeEventListener('keydown', onKey)
        window.removeEventListener('keydown', onSpaceKey)
        window.removeEventListener('keyup', onSpaceKey)
        canvas.removeEventListener('pointerdown', onPointerDown)
        canvas.removeEventListener('pointermove', onPointerMove)
        canvas.removeEventListener('pointerup', onPointerUp)
        canvas.removeEventListener('pointercancel', onPointerCancel)
        canvas.removeEventListener('wheel', onWheel)
        canvas.removeEventListener('touchstart', onTouchStart)
        canvas.removeEventListener('touchmove', onTouchMove)
        canvas.removeEventListener('touchend', onTouchEnd)
        canvas.removeEventListener('touchcancel', onTouchEnd)
        canvas.removeEventListener('dragover', onDragOver)
        canvas.removeEventListener('drop', onLibDrop)
      }
      // frozen is mount-constant (matchMedia sampled once).
    }, [frozen])

    // Re-layout + redraw whenever inputs change. Without the layout pass,
    // boxes/hits/flow points stay frozen at mount/resize values, so dragged
    // nodes, new links, and lock badges would never visibly update even
    // though React state moves (the "drag does nothing" bug).
    useEffect(() => {
      layoutRef.current()
      kickRef.current()
    })

    return (
      <div ref={wrapRef} style={{ position: 'relative', width: '100%' }}>
        <canvas
          ref={canvasRef}
          className="hi-canvas"
          tabIndex={0}
          role="img"
          aria-label="Interactive enterprise server rack and hybrid cloud architecture. Click equipment for details. Scroll or pinch to zoom, drag to pan, Ctrl or Command plus plus/minus/zero to zoom. Use arrow keys to cycle components, Enter to select, Shift plus arrows to pan. On touch: drag to pan, pinch to zoom."
          style={{ display: 'block', width: '100%', height: 'auto', outline: 'none', touchAction: 'pan-y' }}
        />
      </div>
    )
  },
)

HybridInfraCanvas.displayName = 'HybridInfraCanvas'
