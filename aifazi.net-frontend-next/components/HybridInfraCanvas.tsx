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
} from '@/data/hybrid-infra'

export interface HybridInfraCanvasHandle {
  exportPng: () => void
}

interface Props {
  activeMode: InfraCategory | 'all'
  edgeVendor: 'fortigate' | 'unifi'
  selectedId: string | null
  /** Dim everything outside this set. Null = no focus filter. */
  focusIds: Set<string> | null
  /** -1 = off, else index into TIMELINE_CATS. */
  playStep: number
  viewMode: 'technical' | 'management'
  onSelect: (id: string | null) => void
}

interface Box {
  x: number
  y: number
  w: number
  h: number
}

const DESIGN_W = 1280
const DESIGN_H = 920

const INK = '#eef6ff'

export const HybridInfraCanvas = forwardRef<HybridInfraCanvasHandle, Props>(
  function HybridInfraCanvas(props, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const wrapRef = useRef<HTMLDivElement>(null)
    const sRef = useRef(props)
    sRef.current = props
    const drawRef = useRef<(t: number) => void>(() => {})
    const kickRef = useRef<() => void>(() => {})
    // Static composition for reduced-motion users (redrawn on input change).
    const [frozen] = useState(
      () =>
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    )

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
      const ctx: CanvasRenderingContext2D = ctxOrNull

      const DPR = Math.min(window.devicePixelRatio || 1, 2)
      let W = 1280
      let H = 920
      let raf = 0
      let running = false
      let offscreen = false
      let docHidden = document.hidden
      const S = { v: 1, ox: 0, oy: 0 }
      const RACK = { x: 250, y: 250, w: 470, h: 540, unitH: 19.5, topPad: 26 }
      let hoverId: string | null = null
      const boxes = new Map<string, Box>()
      const hits = new Map<string, Box>()
      const flowPts = new Map<string, { x: number; y: number }[]>()

      // ── helpers ──────────────────────────────────────────────
      const center = (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 })

      function pathBetween(a: Box, b: Box) {
        const ca = center(a)
        const cb = center(b)
        const midX = (ca.x + cb.x) / 2
        const midY = (ca.y + cb.y) / 2
        if (Math.abs(ca.x - cb.x) < 50) return [ca, { x: ca.x, y: midY }, cb]
        if (Math.abs(ca.y - cb.y) < 36) return [ca, { x: midX, y: ca.y }, cb]
        return [ca, { x: midX, y: ca.y }, { x: midX, y: midY }, { x: cb.x, y: midY }, cb]
      }

      function roundRect(x: number, y: number, w: number, h: number, r: number) {
        const rr = Math.min(r, w / 2, h / 2)
        ctx.beginPath()
        ctx.moveTo(x + rr, y)
        ctx.arcTo(x + w, y, x + w, y + h, rr)
        ctx.arcTo(x + w, y + h, x, y + h, rr)
        ctx.arcTo(x, y + h, x, y, rr)
        ctx.arcTo(x, y, x + w, y, rr)
        ctx.closePath()
      }

      function fillRound(
        x: number, y: number, w: number, h: number, r: number,
        fill: string | CanvasGradient | null,
        stroke: string | CanvasGradient | null,
        lw = 1,
      ) {
        roundRect(x, y, w, h, r)
        if (fill) {
          ctx.fillStyle = fill
          ctx.fill()
        }
        if (stroke) {
          ctx.strokeStyle = stroke
          ctx.lineWidth = lw
          ctx.stroke()
        }
      }

      function text(
        str: string, x: number, y: number,
        opts: {
          size?: number; color?: string; align?: CanvasTextAlign;
          baseline?: CanvasTextBaseline; weight?: string; alpha?: number; maxW?: number;
        } = {},
      ) {
        const {
          size = 12, color = INK, align = 'left', baseline = 'middle',
          weight = '500', alpha = 1, maxW,
        } = opts
        ctx.save()
        ctx.globalAlpha = alpha
        ctx.fillStyle = color
        ctx.font = `${weight} ${size}px "Segoe UI", Inter, Arial, sans-serif`
        ctx.textAlign = align
        ctx.textBaseline = baseline
        if (maxW) ctx.fillText(str, x, y, maxW)
        else ctx.fillText(str, x, y)
        ctx.restore()
      }

      function led(x: number, y: number, color: string, pulse = 0, size = 3.2) {
        ctx.save()
        ctx.globalAlpha = 0.55 + 0.45 * pulse
        ctx.beginPath()
        ctx.fillStyle = color
        ctx.shadowColor = color
        ctx.shadowBlur = 8
        ctx.arc(x, y, size, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }

      function ventGrid(x: number, y: number, w: number, h: number, cols = 12, rows = 2, alpha = 0.28) {
        ctx.save()
        ctx.globalAlpha = alpha
        ctx.fillStyle = '#06121f'
        const gap = 3
        const cellW = (w - (cols - 1) * gap) / cols
        const cellH = (h - (rows - 1) * gap) / rows
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            ctx.fillRect(x + c * (cellW + gap), y + r * (cellH + gap), cellW, cellH)
          }
        }
        ctx.restore()
      }

      function ports(x: number, y: number, count = 10, w = 6, h = 8, gap = 3) {
        for (let i = 0; i < count; i++) {
          ctx.fillStyle = i % 3 === 0 ? 'rgba(65,200,120,0.8)' : 'rgba(80,160,220,0.55)'
          ctx.fillRect(x + i * (w + gap), y, w, h)
          if (i % 4 === 1) led(x + i * (w + gap) + w / 2, y + h + 3, '#35a7ff', 0.6, 1.3)
        }
      }

      function driveBays(x: number, y: number, w: number, h: number, count = 5, alpha = 1) {
        ctx.save()
        ctx.globalAlpha = alpha
        const gap = 5
        const bayW = (w - (count - 1) * gap) / count
        for (let i = 0; i < count; i++) {
          const bx = x + i * (bayW + gap)
          fillRound(bx, y, bayW, h, 3, 'rgba(18,36,56,0.98)', 'rgba(90,150,200,0.4)')
          fillRound(bx + 4, y + 4, bayW - 8, 4, 1, 'rgba(120,180,220,0.25)', null)
          led(bx + bayW / 2, y + h - 7, '#43d19e', 0.7, 1.8)
        }
        ctx.restore()
      }

      // ── layout ───────────────────────────────────────────────
      function layoutScene() {
        const s = Math.min(W / DESIGN_W, H / DESIGN_H)
        S.v = s
        S.ox = (W - DESIGN_W * s) / 2
        S.oy = (H - DESIGN_H * s) / 2
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

        for (const c of COMPONENTS) {
          let box: Box
          if (c.layer === 'rack' && c.rackU) {
            const y = RACK.y + RACK.topPad + (c.rackU - 1) * RACK.unitH
            const h = (c.rackH ?? 1) * RACK.unitH - 3
            box = { x: RACK.x + 20, y, w: RACK.w - 40, h }
          } else if (c.layer === 'vm') {
            box = { ...(vmMap[c.id] ?? { x: 760, y: 400, w: 155, h: 34 }) }
          } else if (c.layer === 'legacy') {
            box = { x: 28, y: 520, w: 195, h: 115 }
          } else if (c.layer === 'users') {
            box = { ...(userMap[c.id] ?? { x: 28, y: 655, w: 195, h: 100 }) }
          } else {
            box = { x: c.x ?? 0, y: c.y ?? 0, w: c.w ?? 100, h: c.h ?? 50 }
          }
          boxes.set(c.id, box)
          hits.set(c.id, {
            x: S.ox + box.x * S.v,
            y: S.oy + box.y * S.v,
            w: box.w * S.v,
            h: box.h * S.v,
          })
        }

        flowPts.clear()
        const byId = new Map(COMPONENTS.map((c) => [c.id, c]))
        for (const f of FLOWS) {
          const a = byId.get(f.from)
          const b = byId.get(f.to)
          if (!a || !b) continue
          const ba = boxes.get(a.id)
          const bb = boxes.get(b.id)
          if (!ba || !bb) continue
          flowPts.set(f.id, pathBetween(ba, bb))
        }
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

      // ── draw passes ──────────────────────────────────────────
      function dimmed(cat: InfraCategory, extra: Set<string> | null, id: string | null) {
        const p = sRef.current
        if (p.activeMode !== 'all' && p.activeMode !== cat) return true
        if (extra && id && !extra.has(id)) return true
        return false
      }

      function drawBackground() {
        const g = ctx.createLinearGradient(0, 0, 0, DESIGN_H)
        g.addColorStop(0, '#081524')
        g.addColorStop(1, '#07111f')
        ctx.fillStyle = g
        ctx.fillRect(0, 0, DESIGN_W, DESIGN_H)
        ctx.save()
        ctx.globalAlpha = 0.045
        ctx.strokeStyle = '#6aa0d0'
        const step = 40
        for (let x = 0; x < DESIGN_W; x += step) {
          ctx.beginPath()
          ctx.moveTo(x, 0)
          ctx.lineTo(x, DESIGN_H)
          ctx.stroke()
        }
        for (let y = 0; y < DESIGN_H; y += step) {
          ctx.beginPath()
          ctx.moveTo(0, y)
          ctx.lineTo(DESIGN_W, y)
          ctx.stroke()
        }
        ctx.restore()
        const glow = ctx.createRadialGradient(520, 480, 20, 520, 480, 360)
        glow.addColorStop(0, 'rgba(50,120,190,0.13)')
        glow.addColorStop(1, 'transparent')
        ctx.fillStyle = glow
        ctx.fillRect(0, 0, DESIGN_W, DESIGN_H)
      }

      function drawZoneLabels() {
        ctx.save()
        fillRound(270, 12, 400, 190, 14, 'rgba(12,28,48,0.28)', 'rgba(80,130,100,0.18)')
        text('INTERNET EDGE / SECURITY', 284, 26, { size: 9.5, color: '#6f8ba5', weight: '700' })
        fillRound(855, 12, 250, 320, 14, 'rgba(12,28,48,0.28)', 'rgba(60,110,170,0.22)')
        text('MICROSOFT 365 / CLOUD', 868, 26, { size: 9.5, color: '#6f8ba5', weight: '700' })
        fillRound(855, 585, 250, 170, 14, 'rgba(12,28,48,0.28)', 'rgba(80,150,120,0.18)')
        text('COLLABORATION / RECOVERY', 868, 598, { size: 9.5, color: '#6f8ba5', weight: '700' })
        text('ON-PREMISES CORE', 250, 238, { size: 9.5, color: '#6f8ba5', weight: '700' })
        text('USERS / LEGACY', 28, 505, { size: 9.5, color: '#6f8ba5', weight: '700' })
        ctx.restore()
      }

      function hashId(id: string) {
        let h = 0
        for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 997
        return h / 997
      }

      function pointAlong(pts: { x: number; y: number }[], t: number) {
        let total = 0
        const segs: number[] = []
        for (let i = 1; i < pts.length; i++) {
          const len = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
          segs.push(len)
          total += len
        }
        if (!total) return pts[0]
        let dist = t * total
        for (let i = 0; i < segs.length; i++) {
          if (dist <= segs[i] || i === segs.length - 1) {
            const r = segs[i] ? dist / segs[i] : 0
            return {
              x: pts[i].x + (pts[i + 1].x - pts[i].x) * r,
              y: pts[i].y + (pts[i + 1].y - pts[i].y) * r,
            }
          }
          dist -= segs[i]
        }
        return pts[pts.length - 1]
      }

      function playBoost(cat: InfraCategory) {
        const p = sRef.current
        if (p.playStep < 0) return false
        const cats = TIMELINE_CATS[p.playStep] ?? []
        return cats.includes(cat)
      }

      function drawFlows(t: number) {
        const p = sRef.current
        for (const f of FLOWS) {
          const pts = flowPts.get(f.id)
          if (!pts) continue
          const color = CATEGORY_META[f.cat].color
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
          }
          ctx.restore()
        }
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
        carcass.addColorStop(0, '#1a334d')
        carcass.addColorStop(0.5, '#243f5c')
        carcass.addColorStop(1, '#15293f')
        fillRound(r.x - 18, r.y - 18, r.w + 36, r.h + 36, 14, carcass, 'rgba(120,170,210,0.35)', 1)

        const inner = ctx.createLinearGradient(0, r.y, 0, r.y + r.h)
        inner.addColorStop(0, '#0b1a2b')
        inner.addColorStop(1, '#07121f')
        fillRound(r.x, r.y, r.w, r.h, 6, inner, 'rgba(40,80,120,0.45)')

        const railW = 18
        const railG = ctx.createLinearGradient(r.x, 0, r.x + railW, 0)
        railG.addColorStop(0, '#2a4a68')
        railG.addColorStop(0.45, '#6a94b8')
        railG.addColorStop(1, '#243f5c')
        fillRound(r.x, r.y, railW, r.h, 3, railG, 'rgba(140,190,220,0.4)')
        const railG2 = ctx.createLinearGradient(r.x + r.w - railW, 0, r.x + r.w, 0)
        railG2.addColorStop(0, '#243f5c')
        railG2.addColorStop(0.55, '#6a94b8')
        railG2.addColorStop(1, '#2a4a68')
        fillRound(r.x + r.w - railW, r.y, railW, r.h, 3, railG2, 'rgba(140,190,220,0.4)')

        const cross = ctx.createLinearGradient(0, r.y - 18, 0, r.y + 12)
        cross.addColorStop(0, '#5b86ad')
        cross.addColorStop(1, '#243f5c')
        fillRound(r.x - 12, r.y - 12, r.w + 24, 16, 3, cross, 'rgba(140,190,220,0.35)')
        fillRound(r.x - 12, r.y + r.h - 4, r.w + 24, 16, 3, cross, 'rgba(140,190,220,0.3)')

        ctx.save()
        ctx.globalAlpha = 0.45
        ctx.fillStyle = '#9fd0ff'
        for (let u = 1; u <= 24; u++) {
          const y = r.y + r.topPad + (u - 1) * r.unitH + r.unitH * 0.35
          ctx.beginPath()
          ctx.arc(r.x + 7, y, 1.4, 0, Math.PI * 2)
          ctx.fill()
          ctx.beginPath()
          ctx.arc(r.x + r.w - 7, y, 1.4, 0, Math.PI * 2)
          ctx.fill()
          if (u % 2 === 1) {
            text(String(u), r.x + 28, y, { size: 8, color: '#7fa2c2', weight: '700', alpha: 0.4 })
          }
        }
        ctx.restore()

        ctx.save()
        ctx.globalAlpha = 0.18
        ctx.strokeStyle = '#36d7e8'
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
          size: 13, color: '#8eb4d4', align: 'center', weight: '700',
        })
        text('PHYSICAL ON-PREMISES CORE', r.x + r.w / 2, r.y + r.h + 52, {
          size: 11, color: '#5f7f9c', align: 'center', weight: '600',
        })
      }

      function drawRackDevice(c: InfraComponent, t: number) {
        const b = boxes.get(c.id)
        if (!b) return
        const p = sRef.current
        const accent = CATEGORY_META[c.category].color
        const selected = p.selectedId === c.id
        const hovered = hoverId === c.id
        const isDim = dimmed(c.category, p.focusIds, c.id)
        const alpha = isDim ? 0.2 : 1

        ctx.save()
        ctx.globalAlpha = alpha

        const earW = 14
        const earG = ctx.createLinearGradient(b.x - earW, 0, b.x, 0)
        earG.addColorStop(0, '#3d6286')
        earG.addColorStop(1, '#274460')
        fillRound(b.x - earW, b.y + 2, earW, b.h - 4, 2, earG, 'rgba(120,170,210,0.4)')
        const earG2 = ctx.createLinearGradient(b.x + b.w, 0, b.x + b.w + earW, 0)
        earG2.addColorStop(0, '#274460')
        earG2.addColorStop(1, '#3d6286')
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
          grad.addColorStop(0, '#234a6d')
          grad.addColorStop(0.4, '#1a3552')
          grad.addColorStop(1, '#0e2034')
        } else {
          grad.addColorStop(0, '#1a324c')
          grad.addColorStop(0.35, '#13283e')
          grad.addColorStop(1, '#0b1a2c')
        }
        fillRound(b.x, b.y, b.w, b.h, 3, grad, selected ? '#ffffff' : 'rgba(85,145,195,0.5)', selected ? 2.2 : 1.15)

        ctx.save()
        ctx.globalAlpha = alpha * 0.14
        ctx.fillStyle = '#b7dcff'
        roundRect(b.x + 2, b.y + 2, b.w - 4, 3, 2)
        ctx.fill()
        ctx.restore()

        const plateW = Math.min(230, b.w * 0.5)
        fillRound(b.x + 12, b.y + 7, plateW, b.h - 14, 2, 'rgba(6,14,26,0.5)', 'rgba(70,120,160,0.22)')
        text(c.name, b.x + 18, b.y + (b.h > 34 ? b.h / 2 - 7 : b.h / 2), {
          size: b.h > 34 ? 12.5 : 11,
          color: selected ? '#ffffff' : '#dcecff',
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
            text('ONLINE', detailX + 27, b.y + 23, { size: 8, color: '#43d19e', align: 'center', weight: '800' })
            ventGrid(detailX + 70, b.y + 12, detailW - 80, b.h - 24, 10, 3, 0.25)
            led(b.x + b.w - 18, b.y + 14, '#43d19e', 0.8, 3)
          } else {
            ventGrid(detailX, b.y + 10, detailW * 0.72, b.h - 20, 16, b.h > 34 ? 3 : 1, 0.3)
            const ledX = b.x + b.w - 18
            led(ledX, b.y + 12, '#43d19e', 0.65 + 0.35 * Math.sin(t * 3 + (c.rackU ?? 0)), 2.8)
            if (b.h > 28) {
              led(ledX, b.y + b.h / 2, c.category === 'backup' ? '#ff6b78' : '#35a7ff', 0.5 + 0.45 * Math.sin(t * 4 + (c.rackU ?? 0) * 1.2), 2.8)
            }
            if (b.h > 36) {
              led(ledX, b.y + b.h - 12, c.category === 'security' ? '#ffb454' : '#43d19e', 0.4 + 0.3 * Math.sin(t * 2.1 + (c.rackU ?? 0)), 2.8)
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
        const accent = CATEGORY_META[c.category].color
        const selected = p.selectedId === c.id
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
          grad.addColorStop(0, '#1a3858')
          grad.addColorStop(1, '#0f243c')
        } else if (isFirewall) {
          grad.addColorStop(0, '#4a3418')
          grad.addColorStop(1, '#2a1c0d')
        } else {
          grad.addColorStop(0, '#17304c')
          grad.addColorStop(1, '#0d1c2e')
        }
        fillRound(b.x, b.y, b.w, b.h, r, grad, selected ? '#ffffff' : accent, selected ? 2.2 : 1.25)

        ctx.save()
        ctx.globalAlpha = alpha * (isFirewall ? 0.9 : 0.55)
        ctx.fillStyle = accent
        roundRect(b.x + 1, b.y + 1, b.w - 2, 3, 2)
        ctx.fill()
        ctx.restore()

        const cx = b.x + b.w / 2
        const cy = b.y + b.h / 2
        text(c.name, cx, b.h > 60 ? cy - 10 : cy - 4, {
          size: isFirewall ? 15 : 12.5, color: '#f2f8ff', align: 'center', weight: '700', maxW: b.w - 18,
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
            color: p.edgeVendor === 'fortigate' ? '#ffd28a' : '#c9b7ff',
            align: 'center',
            weight: '700',
            maxW: b.w - 12,
          })
          led(b.x + 18, cy, '#ffb454', 0.7 + 0.3 * Math.sin(t * 5), 3.2)
          led(b.x + b.w - 18, cy, '#43d19e', 0.5 + 0.4 * Math.sin(t * 3 + 1), 3.2)
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
        const accent = CATEGORY_META[c.category].color
        const selected = p.selectedId === c.id
        const isDim =
          (p.activeMode !== 'all' && p.activeMode !== c.category) ||
          (p.focusIds !== null && !p.focusIds.has(c.id))
        const alpha = isDim ? 0.18 : 1
        ctx.save()
        ctx.globalAlpha = alpha
        const grad = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h)
        grad.addColorStop(0, selected ? '#274864' : '#183048')
        grad.addColorStop(1, '#0d1c2e')
        fillRound(b.x, b.y, b.w, b.h, 7, grad, selected ? '#fff' : 'rgba(100,160,210,0.45)', selected ? 1.8 : 1)
        ctx.fillStyle = accent
        roundRect(b.x, b.y + 4, 3, b.h - 8, 2)
        ctx.fill()
        text(c.name, b.x + 12, b.y + b.h / 2 - 5, { size: 10.5, color: '#e7f2ff', weight: '700', maxW: b.w - 18 })
        text(c.role, b.x + 12, b.y + b.h / 2 + 8, { size: 9, color: accent, weight: '600', maxW: b.w - 18 })
        led(b.x + b.w - 12, b.y + 11, '#43d19e', 0.55 + 0.3 * Math.sin(t * 3 + b.x), 2.2)
        ctx.restore()
      }

      function drawClusterPanel(t: number) {
        const p = sRef.current
        ctx.save()
        const panel = { x: 740, y: 365, w: 380, h: 215 }
        fillRound(panel.x, panel.y, panel.w, panel.h, 12, 'rgba(14,30,50,0.55)', 'rgba(110,150,210,0.3)')
        text('3-NODE PROXMOX CLUSTER · VM HA', panel.x + 14, panel.y + 16, {
          size: 11.5, color: '#9ec3e8', weight: '700',
        })
        text('DC-01 · DC-02 · File Server · Legacy Apps', panel.x + 14, panel.y + 34, {
          size: 10, color: '#6f8ba5', weight: '500',
        })
        text('On-prem AD authoritative · Hybrid identity', panel.x + 14, panel.y + 50, {
          size: 10, color: '#36d7e8', weight: '600',
        })

        ctx.globalAlpha = 0.28
        ctx.strokeStyle = '#b08cff'
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

        for (const c of COMPONENTS) if (c.layer === 'vm') drawVmChip(c, t)

        const ec = boxes.get('entraconnect')
        if (ec) {
          ctx.globalAlpha = 0.22 + 0.1 * Math.sin(t * 2)
          ctx.strokeStyle = '#36d7e8'
          ctx.lineWidth = 1.5
          roundRect(ec.x - 3, ec.y - 3, ec.w + 6, ec.h + 6, 8)
          ctx.stroke()
          ctx.globalAlpha = 1
          text('AD → Entra Connect → Entra ID', ec.x + ec.w / 2, ec.y + ec.h + 12, {
            size: 9, color: '#36d7e8', align: 'center', weight: '700',
          })
        }

        ctx.globalAlpha = 0.55
        ctx.strokeStyle = '#36d7e8'
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
        ctx.strokeStyle = '#ff6b78'
        ctx.lineWidth = 1.7
        ctx.setLineDash([7, 7])
        ctx.lineDashOffset = frozen ? 0 : -t * 20
        ctx.beginPath()
        ctx.moveTo(720, 680)
        ctx.bezierCurveTo(780, 730, 820, 730, 870, 705)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.restore()

        const legacy = COMPONENTS.find((c) => c.id === 'legacy')
        const lb = legacy ? boxes.get('legacy') : undefined
        if (legacy && lb) {
          const selected = p.selectedId === 'legacy'
          ctx.save()
          ctx.globalAlpha = 0.48
          const grad = ctx.createLinearGradient(lb.x, lb.y, lb.x, lb.y + lb.h)
          grad.addColorStop(0, '#222830')
          grad.addColorStop(1, '#151a22')
          fillRound(lb.x, lb.y, lb.w, lb.h, 11, grad, selected ? '#fff' : 'rgba(150,120,90,0.45)', selected ? 2 : 1)
          ctx.globalAlpha = 0.82
          text('LEGACY / DECOMMISSIONED', lb.x + 12, lb.y + 18, { size: 10, color: '#c9b89a', weight: '700' })
          text('EOL servers · NetApp · Quantum DXi', lb.x + 12, lb.y + 40, { size: 9, color: '#8a7f70', weight: '500', maxW: lb.w - 20 })
          text('Legacy firewalls · not active production', lb.x + 12, lb.y + 58, { size: 9, color: '#8a7f70', weight: '500', maxW: lb.w - 20 })
          text('Scheduled for replacement', lb.x + 12, lb.y + 88, { size: 9, color: '#6f665c', weight: '600' })
          ctx.restore()
        }

        for (const c of COMPONENTS) {
          if (c.layer !== 'users') continue
          const b = boxes.get(c.id)
          if (!b) continue
          const accent = CATEGORY_META[c.category].color
          const selected = p.selectedId === c.id
          const isDim = dimmed(c.category, p.focusIds, c.id)
          ctx.save()
          ctx.globalAlpha = isDim ? 0.18 : 1
          const grad = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h)
          grad.addColorStop(0, '#173248')
          grad.addColorStop(1, '#0c1a2c')
          fillRound(b.x, b.y, b.w, b.h, 11, grad, selected ? '#fff' : accent, selected ? 2 : 1.1)
          text(c.name, b.x + b.w / 2, b.y + 18, {
            size: 10, color: '#e8f3ff', align: 'center', weight: '700', maxW: b.w - 12,
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
              size: 8.5, color: '#8fb4d8', align: 'center', weight: '600',
            })
          } else {
            for (let i = 0; i < 3; i++) {
              fillRound(b.x + 28 + i * 44, b.y + 48, 32, 18, 3, 'rgba(40,120,90,0.3)', 'rgba(90,190,150,0.5)')
              led(b.x + 28 + i * 44 + 16, b.y + 57, '#43d19e', 0.5, 1.4)
            }
            text('CAD · Images · Scanned Docs', b.x + b.w / 2, b.y + 82, {
              size: 8.5, color: '#8fb4d8', align: 'center', weight: '600', maxW: b.w - 10,
            })
          }
          ctx.restore()
        }

        ctx.save()
        fillRound(250, 820, 620, 52, 10, 'rgba(12,28,48,0.55)', 'rgba(67,209,158,0.3)')
        text('ACTIVE COLLABORATION → SharePoint / OneDrive', 266, 838, {
          size: 10.5, color: '#43d19e', weight: '700',
        })
        text('BULK / LARGE / LEGACY DATA → Synology / On-Prem SMB', 266, 860, {
          size: 10.5, color: '#36d7e8', weight: '700',
        })
        ctx.restore()
      }

      function drawManagementOverlay() {
        if (sRef.current.viewMode !== 'management') return
        ctx.save()
        ctx.fillStyle = 'rgba(7,17,31,0.52)'
        ctx.fillRect(0, 0, DESIGN_W, DESIGN_H)
        const cards = [
          { x: 750, y: 280, w: 170, h: 58, title: 'SECURITY', sub: 'HA edge · MFA/CA · Defender', color: '#ffb454' },
          { x: 935, y: 280, w: 170, h: 58, title: 'RESILIENCE', sub: 'vPC · Dual ISP · UPS · HA', color: '#35a7ff' },
          { x: 750, y: 350, w: 170, h: 58, title: 'IDENTITY', sub: 'On-prem AD + Entra ID', color: '#36d7e8' },
          { x: 935, y: 350, w: 170, h: 58, title: 'BACKUP & BC', sub: 'Veeam → QNAP → off-site', color: '#ff6b78' },
          { x: 750, y: 420, w: 170, h: 58, title: 'MICROSOFT 365', sub: 'Collaboration + security', color: '#b08cff' },
          { x: 935, y: 420, w: 170, h: 58, title: 'LESS LEGACY', sub: 'Modern platform replaces EOL', color: '#43d19e' },
        ]
        for (const c of cards) {
          fillRound(c.x, c.y, c.w, c.h, 11, 'rgba(15,32,54,0.94)', c.color)
          text(c.title, c.x + 11, c.y + 20, { size: 11, color: '#fff', weight: '700' })
          text(c.sub, c.x + 11, c.y + 40, { size: 9.5, color: '#b7c9da', weight: '500', maxW: c.w - 16 })
        }
        text('MANAGEMENT VIEW', 750, 262, { size: 10.5, color: '#8fb4d8', weight: '700' })
        ctx.restore()
      }

      function drawPlayPulse(t: number) {
        const p = sRef.current
        if (p.playStep < 0) return
        const colorMap: Record<number, string> = {
          0: '#35a7ff', 1: '#ffb454', 2: '#35a7ff', 3: '#b08cff',
          4: '#43d19e', 5: '#36d7e8', 6: '#ffb454', 7: '#ff6b78', 8: '#ff6b78',
        }
        const color = colorMap[p.playStep] ?? '#36d7e8'
        ctx.save()
        ctx.globalAlpha = 0.07 + 0.03 * Math.sin(t * 5)
        ctx.fillStyle = color
        ctx.fillRect(0, 0, DESIGN_W, DESIGN_H)
        ctx.restore()
      }

      function renderFrame(t: number) {
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0)
        ctx.clearRect(0, 0, W, H)
        ctx.save()
        ctx.translate(S.ox, S.oy)
        ctx.scale(S.v, S.v)
        drawBackground()
        drawZoneLabels()
        drawFlows(t)
        drawRackFrame()
        for (const c of COMPONENTS) {
          if (c.layer === 'rack') drawRackDevice(c, t)
        }
        drawClusterPanel(t)
        for (const c of COMPONENTS) {
          if (c.layer === 'edge' || c.layer === 'cloud') drawChip(c, t)
        }
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

      function onMove(e: MouseEvent) {
        const rect = canvas.getBoundingClientRect()
        const mx = e.clientX - rect.left
        const my = e.clientY - rect.top
        let found: string | null = null
        for (let i = COMPONENTS.length - 1; i >= 0; i--) {
          const h = hits.get(COMPONENTS[i].id)
          if (h && mx >= h.x && mx <= h.x + h.w && my >= h.y && my <= h.y + h.h) {
            found = COMPONENTS[i].id
            break
          }
        }
        hoverId = found
        canvas.style.cursor = found ? 'pointer' : 'default'
      }

      function onClick(e: MouseEvent) {
        const rect = canvas.getBoundingClientRect()
        const mx = e.clientX - rect.left
        const my = e.clientY - rect.top
        let found: string | null = null
        for (let i = COMPONENTS.length - 1; i >= 0; i--) {
          const h = hits.get(COMPONENTS[i].id)
          if (h && mx >= h.x && mx <= h.x + h.w && my >= h.y && my <= h.y + h.h) {
            found = COMPONENTS[i].id
            break
          }
        }
        sRef.current.onSelect(found)
      }

      let kbIndex = -1
      function onKey(e: KeyboardEvent) {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault()
          kbIndex = (kbIndex + 1) % COMPONENTS.length
          sRef.current.onSelect(COMPONENTS[kbIndex].id)
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault()
          kbIndex = (kbIndex - 1 + COMPONENTS.length) % COMPONENTS.length
          sRef.current.onSelect(COMPONENTS[kbIndex].id)
        } else if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          if (kbIndex >= 0) sRef.current.onSelect(COMPONENTS[kbIndex].id)
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

      canvas.addEventListener('mousemove', onMove)
      canvas.addEventListener('mouseleave', () => {
        hoverId = null
      })
      canvas.addEventListener('click', onClick)
      canvas.addEventListener('keydown', onKey)

      resize()
      // Initial selection handled by parent (defaults to firewall).
      kick()

      return () => {
        running = false
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
        canvas.removeEventListener('mousemove', onMove)
        canvas.removeEventListener('click', onClick)
        canvas.removeEventListener('keydown', onKey)
      }
      // frozen is mount-constant (matchMedia sampled once).
    }, [frozen])

    // Redraw static frame whenever inputs change (frozen) or sizes change.
    useEffect(() => {
      kickRef.current()
    })

    return (
      <div ref={wrapRef} style={{ position: 'relative', width: '100%' }}>
        <canvas
          ref={canvasRef}
          className="hi-canvas"
          tabIndex={0}
          role="img"
          aria-label="Interactive enterprise server rack and hybrid cloud architecture. Click equipment for details. Use arrow keys to cycle components, Enter to select."
          style={{ display: 'block', width: '100%', height: 'auto', outline: 'none' }}
        />
      </div>
    )
  },
)

HybridInfraCanvas.displayName = 'HybridInfraCanvas'
