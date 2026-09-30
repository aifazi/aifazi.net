import { describe, expect, it } from 'vitest'
import {
  IDENTITY_VIEW,
  MAX_Z,
  MIN_Z,
  clampView,
  clampZ,
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
  type InfraView,
} from '@/lib/infraView'

const DESIGN = { w: 1280, h: 920 }
const W = 900
const H = 648
// Realistic "fit" transform: design centered in the viewport.
const FIT: InfraFit = {
  v: 0.62,
  ox: (W - DESIGN.w * 0.62) / 2,
  oy: (H - DESIGN.h * 0.62) / 2,
}

const view = (z: number, px = 0, py = 0): InfraView => ({ z, px, py })

/** Design point currently under a screen point. */
function designUnder(v: InfraView, mx: number, my: number) {
  const o = effOrigin(FIT, v, W, H)
  const s = effScale(FIT, v)
  return { x: (mx - o.x) / s, y: (my - o.y) / s }
}

describe('clampZ', () => {
  it('clamps into [0.5, 2.5]', () => {
    expect(clampZ(0.1)).toBe(MIN_Z)
    expect(clampZ(9)).toBe(MAX_Z)
    expect(clampZ(1.37)).toBe(1.37)
  })
})

describe('zoomAtPoint', () => {
  it('keeps the design point under the cursor fixed while zooming', () => {
    for (const v of [view(1), view(1.7, 40, -30), view(0.8, -120, 60)]) {
      for (const factor of [1.25, 0.8, 1.1]) {
        for (const [mx, my] of [[100, 80], [450, 324], [860, 600]]) {
          const before = designUnder(v, mx, my)
          const next = zoomAtPoint(FIT, v, W, H, factor, mx, my)
          const after = designUnder(next, mx, my)
          expect(after.x).toBeCloseTo(before.x, 6)
          expect(after.y).toBeCloseTo(before.y, 6)
        }
      }
    }
  })

  it('returns the same object when already at a zoom bound', () => {
    const lo = view(MIN_Z, 10, 20)
    expect(zoomAtPoint(FIT, lo, W, H, 0.8, 100, 100)).toBe(lo)
    const hi = view(MAX_Z)
    expect(zoomAtPoint(FIT, hi, W, H, 1.25, 100, 100)).toBe(hi)
  })

  it('never zooms past the bounds', () => {
    const next = zoomAtPoint(FIT, view(MAX_Z), W, H, 1.25, 0, 0)
    expect(next.z).toBeLessThanOrEqual(MAX_Z)
    const back = zoomAtPoint(FIT, view(MIN_Z), W, H, 0.8, 0, 0)
    expect(back.z).toBeGreaterThanOrEqual(MIN_Z)
  })
})

describe('clampView', () => {
  it('is a no-op for an in-bounds view', () => {
    const v = view(1, 30, -20)
    expect(clampView(FIT, v, W, H, DESIGN)).toEqual(v)
  })

  it('keeps the viewport center inside the design box (±50%)', () => {
    const far = clampView(FIT, view(1, 40000, -40000), W, H, DESIGN)
    const c = viewCenter(FIT, far, W, H)
    const eps = 1e-6
    expect(c.cx).toBeLessThanOrEqual(DESIGN.w * 1.5 + eps)
    expect(c.cx).toBeGreaterThanOrEqual(-DESIGN.w * 0.5 - eps)
    expect(c.cy).toBeLessThanOrEqual(DESIGN.h * 1.5 + eps)
    expect(c.cy).toBeGreaterThanOrEqual(-DESIGN.h * 0.5 - eps)
  })

  it('clamps out-of-range zoom too', () => {
    expect(clampView(FIT, view(99), W, H, DESIGN).z).toBe(MAX_Z)
    expect(clampView(FIT, view(0.01), W, H, DESIGN).z).toBe(MIN_Z)
  })
})

describe('center round-trip', () => {
  it('viewFromCenter ∘ viewCenter is identity', () => {
    const v = view(1.4, 88, -142)
    const { cx, cy } = viewCenter(FIT, v, W, H)
    const back = viewFromCenter(FIT, v.z, W, H, cx, cy)
    expect(back.px).toBeCloseTo(v.px, 6)
    expect(back.py).toBeCloseTo(v.py, 6)
    expect(back.z).toBe(v.z)
  })

  it('centers the requested design point', () => {
    const v = viewFromCenter(FIT, 1.8, W, H, 300, 500)
    const c = viewCenter(FIT, v, W, H)
    expect(c.cx).toBeCloseTo(300, 6)
    expect(c.cy).toBeCloseTo(500, 6)
  })

  it('identity view shows the design centered', () => {
    const c = viewCenter(FIT, IDENTITY_VIEW, W, H)
    expect(c.cx).toBeCloseTo(640, 6)
    expect(c.cy).toBeCloseTo(460, 6)
  })
})

describe('percent helpers', () => {
  it('reports real scale percent', () => {
    expect(zoomPercent(FIT, IDENTITY_VIEW)).toBe(62)
    expect(zoomPercent(FIT, view(2))).toBe(124)
  })

  it('viewForPercent reaches the requested scale and keeps the center', () => {
    const start = view(1.2, 50, -50)
    const v = viewForPercent(FIT, start, W, H, 100)
    expect(zoomPercent(FIT, v)).toBe(100)
    const a = viewCenter(FIT, start, W, H)
    const b = viewCenter(FIT, v, W, H)
    expect(b.cx).toBeCloseTo(a.cx, 6)
    expect(b.cy).toBeCloseTo(a.cy, 6)
  })

  it('viewForPercent clamps instead of over-zooming', () => {
    const v = viewForPercent(FIT, IDENTITY_VIEW, W, H, 5000)
    expect(v.z).toBeLessThanOrEqual(MAX_Z)
  })
})

describe('wheel helpers', () => {
  it('zooms in on negative deltaY (scroll up) and out on positive', () => {
    expect(wheelZoomFactor(-100, 0, H)).toBeGreaterThan(1)
    expect(wheelZoomFactor(100, 0, H)).toBeLessThan(1)
  })

  it('scales line/page delta modes', () => {
    expect(wheelZoomFactor(1, 1, H)).not.toBe(1)
    expect(wheelZoomFactor(1, 2, H)).toBe(wheelZoomFactor(H, 0, H))
  })

  it('detects zoom bounds for page-scroll passthrough', () => {
    expect(wheelAtBound(view(MIN_Z), 0.9)).toBe(true)
    expect(wheelAtBound(view(MIN_Z), 1.1)).toBe(false)
    expect(wheelAtBound(view(MAX_Z), 1.1)).toBe(true)
    expect(wheelAtBound(view(1), 1.1)).toBe(false)
  })
})
