/**
 * SVG recorder unit tests (round-2 plan B1 — vector diagram export).
 */
import { describe, expect, it } from 'vitest'
import { createSvgRecorder } from './infraSvgExport'

const asCtx = (r: ReturnType<typeof createSvgRecorder>) =>
  r.ctx as unknown as CanvasRenderingContext2D

describe('infraSvgExport', () => {
  it('emits a path element for fill() with the current style', () => {
    const rec = createSvgRecorder()
    const ctx = asCtx(rec)
    ctx.beginPath()
    ctx.moveTo(10, 20)
    ctx.lineTo(110, 20)
    ctx.lineTo(110, 70)
    ctx.closePath()
    ctx.fillStyle = '#35a7ff'
    ctx.fill()
    const svg = rec.toSvg({ width: 400, height: 300 })
    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">')
    expect(svg).toContain('d="M 10 20 L 110 20 L 110 70 Z"')
    expect(svg).toContain('fill="#35a7ff"')
  })

  it('bakes the current transform onto each element', () => {
    const rec = createSvgRecorder()
    const ctx = asCtx(rec)
    ctx.setTransform(2, 0, 0, 2, 5, 7)
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, 10, 10)
    const svg = rec.toSvg()
    expect(svg).toContain('transform="matrix(2 0 0 2 5 7)"')
  })

  it('save/restore isolates style state', () => {
    const rec = createSvgRecorder()
    const ctx = asCtx(rec)
    ctx.fillStyle = '#111111'
    ctx.save()
    ctx.fillStyle = '#222222'
    ctx.globalAlpha = 0.4
    ctx.restore()
    ctx.fillRect(0, 0, 1, 1)
    const svg = rec.toSvg()
    expect(svg).toContain('fill="#111111"')
    expect(svg).not.toContain('fill-opacity')
  })

  it('renders fillText with font, anchor, baseline and maxWidth', () => {
    const rec = createSvgRecorder()
    const ctx = asCtx(rec)
    ctx.font = '700 14px "Segoe UI", Inter, Arial, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#ffffff'
    ctx.fillText('Proxmox', 100, 50, 80)
    const svg = rec.toSvg()
    expect(svg).toContain('<text x="100" y="50"')
    expect(svg).toContain('font-size="14"')
    expect(svg).toContain('font-weight="700"')
    expect(svg).toContain('text-anchor="middle"')
    expect(svg).toContain('dominant-baseline="central"')
    expect(svg).toContain('textLength="80" lengthAdjust="spacingAndGlyphs"')
    expect(svg).toContain('>Proxmox</text>')
  })

  it('escapes text content', () => {
    const rec = createSvgRecorder()
    const ctx = asCtx(rec)
    ctx.fillText('a<b & "c"', 0, 0)
    const svg = rec.toSvg()
    expect(svg).toContain('a&lt;b &amp; &quot;c&quot;</text>')
  })

  it('collects gradients into defs and references them', () => {
    const rec = createSvgRecorder()
    const ctx = asCtx(rec)
    const g = ctx.createLinearGradient(0, 0, 0, 100)
    g.addColorStop(0, 'rgba(10,20,30,0.9)')
    g.addColorStop(1, '#ff0000')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 5, 5)
    const r = ctx.createRadialGradient(1, 2, 3, 4, 5, 6)
    r.addColorStop(0, '#00ff00')
    ctx.fillStyle = r
    ctx.fillRect(0, 0, 5, 5)
    const svg = rec.toSvg()
    expect(svg).toContain('<defs>')
    expect(svg).toContain(
      '<linearGradient id="ig1" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="100">',
    )
    expect(svg).toContain('<stop offset="0" stop-color="rgba(10,20,30,0.9)"/>')
    expect(svg).toContain('fill="url(#ig1)"')
    expect(svg).toContain(
      '<radialGradient id="ig2" gradientUnits="userSpaceOnUse" cx="4" cy="5" r="6" fx="1" fy="2" fr="3">',
    )
    expect(svg).toContain('fill="url(#ig2)"')
  })

  it('splits a full-circle arc into ≤180° segments', () => {
    const rec = createSvgRecorder()
    const ctx = asCtx(rec)
    ctx.beginPath()
    ctx.arc(640, 460, 120, 0, Math.PI * 2)
    ctx.strokeStyle = '#00ffcc'
    ctx.lineWidth = 2
    ctx.stroke()
    const svg = rec.toSvg()
    const arcs = svg.match(/ A 120 120/g) || []
    expect(arcs.length).toBeGreaterThanOrEqual(4)
    expect(svg).toContain('stroke="#00ffcc"')
    expect(svg).toContain('stroke-width="2"')
  })

  it('arcTo produces the tangent line + arc with a clockwise sweep', () => {
    const rec = createSvgRecorder()
    const ctx = asCtx(rec)
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.arcTo(100, 0, 100, 100, 10)
    ctx.lineTo(100, 100)
    ctx.stroke()
    const svg = rec.toSvg()
    // Tangent points: (90,0) and (100,10); turn is right/clockwise → sweep 1.
    expect(svg).toContain('L 90 0 A 10 10 0 0 1 100 10')
  })

  it('applies setLineDash to stroked paths', () => {
    const rec = createSvgRecorder()
    const ctx = asCtx(rec)
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(50, 0)
    ctx.setLineDash([6, 3])
    ctx.stroke()
    const svg = rec.toSvg()
    expect(svg).toContain('stroke-dasharray="6 3"')
  })

  it('honors translate/scale composition', () => {
    const rec = createSvgRecorder()
    const ctx = asCtx(rec)
    ctx.translate(10, 20)
    ctx.scale(2, 3)
    ctx.fillStyle = '#abcdef'
    ctx.fillRect(0, 0, 1, 1)
    const svg = rec.toSvg()
    expect(svg).toContain('transform="matrix(2 0 0 3 10 20)"')
  })

  it('records globalAlpha as fill-opacity', () => {
    const rec = createSvgRecorder()
    const ctx = asCtx(rec)
    ctx.globalAlpha = 0.25
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, 1, 1)
    const svg = rec.toSvg()
    expect(svg).toContain('fill-opacity="0.25"')
  })
})
