/**
 * Pure view math for the hybrid-infra canvas: zoom, pan, clamping.
 *
 * Kept free of DOM/canvas dependencies so it can be unit-tested and shared
 * between the renderer, the viewer toolbar, and URL/localStorage persistence.
 *
 * Coordinate model (mirrors the renderer):
 * - `fit` is the base "design fits the viewport" transform (scale + origin).
 * - `view.z` scales around the viewport center on top of `fit` (1 = base fit).
 * - `view.px/py` pan in screen px added to the fit origin.
 *   Effective transform: scale = fit.v * z,
 *   origin = fit.ox + (W/2) * (1 - z) + px.
 */

export interface InfraView {
  /** Relative zoom around the viewport center (1 = base fit). */
  z: number
  /** Pan in screen px added to the fit origin. */
  px: number
  py: number
}

export interface InfraFit {
  /** Base design-to-screen scale (design fits the viewport). */
  v: number
  /** Base origin: top-left of the design when z = 1. */
  ox: number
  oy: number
}

export interface DesignSize {
  w: number
  h: number
}

export const MIN_Z = 0.5
export const MAX_Z = 2.5

export const IDENTITY_VIEW: InfraView = { z: 1, px: 0, py: 0 }

export function clampZ(z: number): number {
  return Math.min(MAX_Z, Math.max(MIN_Z, z))
}

export function effScale(fit: InfraFit, view: InfraView): number {
  return fit.v * view.z
}

export function effOrigin(
  fit: InfraFit,
  view: InfraView,
  W: number,
  H: number,
): { x: number; y: number } {
  return {
    x: fit.ox + (W / 2) * (1 - view.z) + view.px,
    y: fit.oy + (H / 2) * (1 - view.z) + view.py,
  }
}

/** Design-space point currently at the viewport center. */
export function viewCenter(
  fit: InfraFit,
  view: InfraView,
  W: number,
  H: number,
): { cx: number; cy: number } {
  const o = effOrigin(fit, view, W, H)
  const s = effScale(fit, view)
  return { cx: (W / 2 - o.x) / s, cy: (H / 2 - o.y) / s }
}

/** View showing the design point (cx, cy) at the viewport center. */
export function viewFromCenter(
  fit: InfraFit,
  z: number,
  W: number,
  H: number,
  cx: number,
  cy: number,
): InfraView {
  const zz = clampZ(z)
  const s = fit.v * zz
  return {
    z: zz,
    px: W / 2 - cx * s - fit.ox - (W / 2) * (1 - zz),
    py: H / 2 - cy * s - fit.oy - (H / 2) * (1 - zz),
  }
}

/**
 * Zoom by `factor` while keeping the design point under the screen point
 * (mx, my) fixed. Returns the same object when already at a zoom bound.
 */
export function zoomAtPoint(
  fit: InfraFit,
  view: InfraView,
  W: number,
  H: number,
  factor: number,
  mx: number,
  my: number,
): InfraView {
  const z = clampZ(view.z * factor)
  if (Math.abs(z - view.z) < 1e-4) return view
  const o = effOrigin(fit, view, W, H)
  const s1 = effScale(fit, view)
  const dx = (mx - o.x) / s1
  const dy = (my - o.y) / s1
  const s2 = fit.v * z
  return {
    z,
    px: mx - dx * s2 - fit.ox - (W / 2) * (1 - z),
    py: my - dy * s2 - fit.oy - (H / 2) * (1 - z),
  }
}

/**
 * Soft clamp: keep the viewport center inside the design box (±50%) so a
 * pan can never strand the diagram off-screen. Identity when in bounds.
 */
export function clampView(
  fit: InfraFit,
  view: InfraView,
  W: number,
  H: number,
  design: DesignSize,
): InfraView {
  const z = clampZ(view.z)
  const s = fit.v * z
  const ox = fit.ox + (W / 2) * (1 - z) + view.px
  const oy = fit.oy + (H / 2) * (1 - z) + view.py
  const cx = Math.min(design.w * 1.5, Math.max(-design.w * 0.5, (W / 2 - ox) / s))
  const cy = Math.min(design.h * 1.5, Math.max(-design.h * 0.5, (H / 2 - oy) / s))
  return {
    z,
    px: W / 2 - cx * s - fit.ox - (W / 2) * (1 - z),
    py: H / 2 - cy * s - fit.oy - (H / 2) * (1 - z),
  }
}

/** Wheel scroll factor (smooth, trackpad-friendly). deltaY scaled by mode. */
export function wheelZoomFactor(deltaY: number, deltaMode: number, H: number): number {
  const dy = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * H : deltaY
  return Math.exp(-dy * 0.002)
}

/** True when the wheel would zoom past a bound (page should scroll instead). */
export function wheelAtBound(view: InfraView, factor: number): boolean {
  return (factor < 1 && view.z <= MIN_Z) || (factor > 1 && view.z >= MAX_Z)
}

/** Real design-to-screen scale as a percent (what the toolbar shows). */
export function zoomPercent(fit: InfraFit, view: InfraView): number {
  return Math.round(fit.v * view.z * 100)
}

/** View at `pct` real scale, centered on the current center. */
export function viewForPercent(
  fit: InfraFit,
  view: InfraView,
  W: number,
  H: number,
  pct: number,
): InfraView {
  const { cx, cy } = viewCenter(fit, view, W, H)
  const z = clampZ(pct / 100 / fit.v)
  return viewFromCenter(fit, z, W, H, cx, cy)
}
