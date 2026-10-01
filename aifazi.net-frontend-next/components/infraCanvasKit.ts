/**
 * components/infraCanvasKit.ts — ctx-bound drawing primitives and pure
 * geometry helpers shared by HybridInfraCanvas (extracted from that god-file).
 *
 * The pure helpers (center/pathBetween/pointAlong/hashId) are module-level.
 * The ctx-bound primitives come from createDrawKit, created once per canvas
 * effect run; the palette is read through a getter so tone changes repaint
 * without re-creating the kit.
 */
import type { InfraPalette } from '@/lib/infraTheme'

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export interface Pt {
  x: number
  y: number
}

export const center = (b: Box): Pt => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 })

export function pathBetween(a: Box, b: Box): Pt[] {
  const ca = center(a)
  const cb = center(b)
  const midX = (ca.x + cb.x) / 2
  const midY = (ca.y + cb.y) / 2
  if (Math.abs(ca.x - cb.x) < 50) return [ca, { x: ca.x, y: midY }, cb]
  if (Math.abs(ca.y - cb.y) < 36) return [ca, { x: midX, y: ca.y }, cb]
  return [ca, { x: midX, y: ca.y }, { x: midX, y: midY }, { x: cb.x, y: midY }, cb]
}

export function pointAlong(pts: Pt[], t: number): Pt {
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

/** Stable 0..1 hash of an id (jitter/color variation seeded by node id). */
export function hashId(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 997
  return h / 997
}

/** Canvas primitives bound to a 2d context; palette read via getter. */
export function createDrawKit(ctx: CanvasRenderingContext2D, palette: () => InfraPalette) {
  function roundRect(x: number, y: number, w: number, h: number, r: number) {
    // Guard: arcTo throws IndexSizeError on NaN/negative radii, and this runs
    // inside the rAF loop where the exception would escape the error boundary.
    // Still reset the path so callers' fill()/stroke() hit an empty path
    // instead of whatever was drawn last.
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h)) {
      ctx.beginPath()
      return
    }
    const rr = Math.max(0, Math.min(r, w / 2, h / 2))
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
      size = 12, color = palette().ink, align = 'left', baseline = 'middle',
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
    ctx.fillStyle = palette().bg
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
      if (i % 4 === 1) led(x + i * (w + gap) + w / 2, y + h + 3, palette().blue, 0.6, 1.3)
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
      led(bx + bayW / 2, y + h - 7, palette().green, 0.7, 1.8)
    }
    ctx.restore()
  }

  return { roundRect, fillRound, text, led, ventGrid, ports, driveBays }
}
