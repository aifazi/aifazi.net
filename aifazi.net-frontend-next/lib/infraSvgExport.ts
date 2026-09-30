/**
 * lib/infraSvgExport.ts — Canvas2D → SVG recording context (plan B1).
 *
 * HybridInfraCanvas renders with a real <canvas>, so vector export needs a
 * second rendering target. createSvgRecorder() returns an object that
 * implements the exact CanvasRenderingContext2D subset the diagram renderer
 * uses (see the ctx.* calls in HybridInfraCanvas.tsx / infraCanvasKit.ts):
 * transforms, paths (moveTo/lineTo/arc/arcTo/bezier/closePath), fill/stroke,
 * fillRect, fillText (font/align/baseline/maxW), linear+radial gradients,
 * dashes, alpha, save/restore. Every draw call is captured as SVG markup.
 *
 * Deviations from canvas (acceptable for static export):
 * - shadowBlur/shadowColor ignored (LED glow dots render as plain dots)
 * - clip() is a no-op, clearRect() is a no-op (the frame's base fillRect
 *   already paints the background)
 * - measureText() estimates (the renderer never calls it)
 */

type Mat = [number, number, number, number, number, number]

interface Stop {
  offset: number
  color: string
}

interface Gradient {
  kind: 'linear' | 'radial'
  coords: number[]
  stops: Stop[]
}

type Paint = string | Gradient

interface SubPath {
  d: string
  sx: number
  sy: number
  x: number
  y: number
}

interface CtxState {
  m: Mat
  fill: Paint
  stroke: Paint
  lineWidth: number
  alpha: number
  font: string
  align: string
  baseline: string
  lineCap: string
  lineJoin: string
  dash: number[]
  dashOffset: number
}

const TAU = Math.PI * 2
const IDENTITY: Mat = [1, 0, 0, 1, 0, 0]

const fmt = (n: number): string => String(Math.round(n * 1000) / 1000)

const isGrad = (p: Paint): p is Gradient =>
  typeof p === 'object' && p !== null && Array.isArray((p as Gradient).stops)

function mul(a: Mat, b: Mat): Mat {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ]
}

const isIdentity = (m: Mat): boolean =>
  m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1 && m[4] === 0 && m[5] === 0

const transformAttr = (m: Mat): string =>
  isIdentity(m) ? '' : ` transform="matrix(${m.map(fmt).join(' ')})"`

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Split a canvas font shorthand into SVG font attrs. */
function fontAttrs(font: string): string {
  const m = /^(\S+)\s+(\d+(?:\.\d+)?)px\s+(.+)$/.exec(font.trim())
  if (!m) return ''
  const weight = m[1]
  const size = m[2]
  const family = m[3]
  const w = /^(normal|bold|bolder|lighter|\d{3})$/.test(weight) ? ` font-weight="${esc(weight)}"` : ''
  return ` font-size="${esc(size)}" font-family="${esc(family)}"${w}`
}

function baselineAttr(baseline: string): string {
  switch (baseline) {
    case 'middle': return ' dominant-baseline="central"'
    case 'top': return ' dominant-baseline="text-before-edge"'
    case 'hanging': return ' dominant-baseline="hanging"'
    case 'ideographic': return ' dominant-baseline="ideographic"'
    case 'alphabetic': return ' dominant-baseline="alphabetic"'
    case 'bottom': return ' dominant-baseline="text-after-edge"'
    default: return ''
  }
}

function anchorAttr(align: string): string {
  switch (align) {
    case 'center': return ' text-anchor="middle"'
    case 'right':
    case 'end': return ' text-anchor="end"'
    default: return ''
  }
}

export interface SvgRecorder {
  /** Canvas-compatible drawing target; cast with `as CanvasRenderingContext2D`. */
  ctx: object
  toSvg(opts?: { width?: number; height?: number }): string
}

export function createSvgRecorder(): SvgRecorder {
  const stack: CtxState[] = []
  let st: CtxState = {
    m: [...IDENTITY] as Mat,
    fill: '#000000',
    stroke: '#000000',
    lineWidth: 1,
    alpha: 1,
    font: '10px sans-serif',
    align: 'start',
    baseline: 'alphabetic',
    lineCap: 'butt',
    lineJoin: 'miter',
    dash: [],
    dashOffset: 0,
  }
  let path: SubPath[] = []
  const elements: string[] = []
  const gradients = new Map<Gradient, string>()

  const paintFill = (): string => {
    if (isGrad(st.fill)) return `url(#${gradId(st.fill)})`
    return st.fill
  }
  const paintStroke = (): string => {
    if (isGrad(st.stroke)) return `url(#${gradId(st.stroke)})`
    return st.stroke
  }
  const gradId = (g: Gradient): string => {
    let id = gradients.get(g)
    if (!id) {
      id = `ig${gradients.size + 1}`
      gradients.set(g, id)
    }
    return id
  }
  const fillAttrs = (): string => {
    const base = ` fill="${esc(paintFill())}"`
    return st.alpha < 1 ? `${base} fill-opacity="${fmt(st.alpha)}"` : base
  }
  const strokeAttrs = (): string => {
    const parts = [
      ` fill="none"`,
      ` stroke="${esc(paintStroke())}"`,
      ` stroke-width="${fmt(st.lineWidth)}"`,
    ]
    if (st.alpha < 1) parts.push(` stroke-opacity="${fmt(st.alpha)}"`)
    if (st.dash.length) parts.push(` stroke-dasharray="${st.dash.map(fmt).join(' ')}"`)
    if (st.dashOffset) parts.push(` stroke-dashoffset="${fmt(st.dashOffset)}"`)
    if (st.lineCap !== 'butt') parts.push(` stroke-linecap="${esc(st.lineCap)}"`)
    if (st.lineJoin !== 'miter') parts.push(` stroke-linejoin="${esc(st.lineJoin)}"`)
    return parts.join('')
  }

  const pushPathEl = (mode: 'fill' | 'stroke') => {
    const d = path.map((s) => s.d).join(' ')
    if (!d) return
    const attrs = mode === 'fill' ? fillAttrs() : strokeAttrs()
    elements.push(`<path d="${d.trim()}"${attrs}${transformAttr(st.m)}/>`)
  }

  const cur = (): SubPath | null => (path.length ? path[path.length - 1] : null)

  const moveTo = (x: number, y: number) => {
    path.push({ d: `M ${fmt(x)} ${fmt(y)}`, sx: x, sy: y, x, y })
  }
  const lineTo = (x: number, y: number) => {
    const c = cur()
    if (!c) moveTo(x, y)
    else {
      c.d += ` L ${fmt(x)} ${fmt(y)}`
      c.x = x
      c.y = y
    }
  }

  /** Add an arc from angle a0 to a1 (canvas semantics, split at ≤180°). */
  const arcSegs = (cx: number, cy: number, r: number, a0: number, sweep: number) => {
    const c = cur()
    const sx = cx + r * Math.cos(a0)
    const sy = cy + r * Math.sin(a0)
    if (!c) moveTo(sx, sy)
    else if (c.x !== sx || c.y !== sy) lineTo(sx, sy)
    const steps = Math.max(1, Math.ceil(Math.abs(sweep) / (Math.PI / 2)))
    let a = a0
    const step = sweep / steps
    for (let i = 0; i < steps; i++) {
      const a1 = a + step
      const ex = cx + r * Math.cos(a1)
      const ey = cy + r * Math.sin(a1)
      const large = Math.abs(step) > Math.PI ? 1 : 0
      const dir = step > 0 ? 1 : 0
      const p = cur()
      if (p) {
        p.d += ` A ${fmt(r)} ${fmt(r)} 0 ${large} ${dir} ${fmt(ex)} ${fmt(ey)}`
        p.x = ex
        p.y = ey
      }
      a = a1
    }
  }

  const ctx = {
    // ── state stack ────────────────────────────────────────────
    save() {
      stack.push({
        ...st,
        m: [...st.m] as Mat,
        dash: [...st.dash],
      })
    },
    restore() {
      const prev = stack.pop()
      if (prev) st = prev
    },

    // ── transforms ─────────────────────────────────────────────
    setTransform(a: number, b: number, c: number, d: number, e: number, f: number) {
      st.m = [a, b, c, d, e, f]
    },
    resetTransform() {
      st.m = [...IDENTITY] as Mat
    },
    transform(a: number, b: number, c: number, d: number, e: number, f: number) {
      st.m = mul(st.m, [a, b, c, d, e, f])
    },
    translate(x: number, y: number) {
      st.m = mul(st.m, [1, 0, 0, 1, x, y])
    },
    scale(sx: number, sy: number) {
      st.m = mul(st.m, [sx, 0, 0, sy, 0, 0])
    },
    rotate(angle: number) {
      const cos = Math.cos(angle)
      const sin = Math.sin(angle)
      st.m = mul(st.m, [cos, sin, -sin, cos, 0, 0])
    },

    // ── style state (property assignment via proxy set trap) ──
    fillStyle: st.fill,
    strokeStyle: st.stroke,
    lineWidth: 1,
    globalAlpha: 1,
    font: st.font,
    textAlign: st.align,
    textBaseline: st.baseline,
    lineCap: st.lineCap,
    lineJoin: st.lineJoin,
    lineDashOffset: 0,
    shadowColor: '',
    shadowBlur: 0,

    // ── paths ──────────────────────────────────────────────────
    beginPath() {
      path = []
    },
    closePath() {
      const c = cur()
      if (c) {
        c.d += ' Z'
        c.x = c.sx
        c.y = c.sy
      }
    },
    moveTo,
    lineTo,
    arc(x: number, y: number, r: number, a0: number, a1: number, ccw = false) {
      let sweep = a1 - a0
      if (ccw) {
        while (sweep > 0) sweep -= TAU
        if (sweep === 0) sweep = -TAU
      } else {
        while (sweep < 0) sweep += TAU
        if (sweep === 0) sweep = TAU
      }
      arcSegs(x, y, r, a0, sweep)
    },
    arcTo(x1: number, y1: number, x2: number, y2: number, r: number) {
      const c = cur()
      if (!c) {
        moveTo(x1, y1)
        return
      }
      const p0 = { x: c.x, y: c.y }
      const w1 = { x: p0.x - x1, y: p0.y - y1 }
      const w2 = { x: x2 - x1, y: y2 - y1 }
      const l1 = Math.hypot(w1.x, w1.y)
      const l2 = Math.hypot(w2.x, w2.y)
      // Degenerate corners fall back to a straight line (canvas behavior).
      if (!l1 || !l2 || r <= 0) {
        lineTo(x1, y1)
        return
      }
      const dot = w1.x * w2.x + w1.y * w2.y
      const cross = w1.x * w2.y - w1.y * w2.x
      const cos = dot / (l1 * l2)
      if (cos <= -0.999999) {
        // 180° turn: tangent is the midpoint direction.
        lineTo(x1, y1)
        return
      }
      const sin = Math.abs(cross) / (l1 * l2)
      const tanHalf = sin / (1 + Math.max(cos, -1)) // tan(θ/2) = sinθ/(1+cosθ)
      if (!Number.isFinite(tanHalf) || tanHalf <= 0) {
        lineTo(x1, y1)
        return
      }
      const d = r / tanHalf
      const t1 = { x: x1 + (w1.x / l1) * d, y: y1 + (w1.y / l1) * d }
      const t2 = { x: x1 + (w2.x / l2) * d, y: y1 + (w2.y / l2) * d }
      lineTo(t1.x, t1.y)
      // Sweep: clockwise turn (u=p1→p0 basis) → positive-angle (flag 1).
      const dir = cross < 0 ? 1 : 0
      const p = cur()
      if (p) {
        p.d += ` A ${fmt(r)} ${fmt(r)} 0 0 ${dir} ${fmt(t2.x)} ${fmt(t2.y)}`
        p.x = t2.x
        p.y = t2.y
      }
    },
    quadraticCurveTo(qx: number, qy: number, x: number, y: number) {
      const c = cur()
      if (!c) moveTo(qx, qy)
      else {
        // Convert to cubic (control points at 2/3).
        const cx = c.x + (2 / 3) * (qx - c.x)
        const cy = c.y + (2 / 3) * (qy - c.y)
        const dx = x + (2 / 3) * (qx - x)
        const dy = y + (2 / 3) * (qy - y)
        c.d += ` C ${fmt(cx)} ${fmt(cy)} ${fmt(dx)} ${fmt(dy)} ${fmt(x)} ${fmt(y)}`
        c.x = x
        c.y = y
      }
    },
    bezierCurveTo(x1: number, y1: number, x2: number, y2: number, x: number, y: number) {
      const c = cur()
      if (!c) moveTo(x1, y1)
      else {
        c.d += ` C ${fmt(x1)} ${fmt(y1)} ${fmt(x2)} ${fmt(y2)} ${fmt(x)} ${fmt(y)}`
        c.x = x
        c.y = y
      }
    },
    rect(x: number, y: number, w: number, h: number) {
      moveTo(x, y)
      lineTo(x + w, y)
      lineTo(x + w, y + h)
      lineTo(x, y + h)
      const c = cur()
      if (c) {
        c.d += ' Z'
        c.x = c.sx
        c.y = c.sy
      }
    },
    fill() {
      pushPathEl('fill')
    },
    stroke() {
      pushPathEl('stroke')
    },
    clip() {
      /* not needed for static export */
    },

    // ── primitives ─────────────────────────────────────────────
    fillRect(x: number, y: number, w: number, h: number) {
      elements.push(
        `<rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(w)}" height="${fmt(h)}"${fillAttrs()}${transformAttr(st.m)}/>`,
      )
    },
    strokeRect(x: number, y: number, w: number, h: number) {
      elements.push(
        `<rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(w)}" height="${fmt(h)}" fill="none"${strokeAttrs()}${transformAttr(st.m)}/>`,
      )
    },
    clearRect() {
      /* background fill covers the frame */
    },
    fillText(str: string, x: number, y: number, maxW?: number) {
      const tw =
        typeof maxW === 'number' && maxW > 0
          ? ` textLength="${fmt(maxW)}" lengthAdjust="spacingAndGlyphs"`
          : ''
      elements.push(
        `<text x="${fmt(x)}" y="${fmt(y)}"${fillAttrs()}${fontAttrs(st.font)}${anchorAttr(st.align)}${baselineAttr(st.baseline)}${tw}${transformAttr(st.m)}>${esc(str)}</text>`,
      )
    },
    measureText(str: string): { width: number } {
      const m = /(\d+(?:\.\d+)?)px/.exec(st.font)
      const size = m ? Number(m[1]) : 10
      return { width: str.length * size * 0.55 }
    },

    // ── dashes ─────────────────────────────────────────────────
    setLineDash(dash: number[]) {
      st.dash = Array.isArray(dash) ? [...dash] : []
    },
    getLineDash(): number[] {
      return [...st.dash]
    },

    // ── gradients ──────────────────────────────────────────────
    createLinearGradient(x0: number, y0: number, x1: number, y1: number): Gradient {
      return { kind: 'linear', coords: [x0, y0, x1, y1], stops: [] }
    },
    createRadialGradient(
      x0: number, y0: number, r0: number, x1: number, y1: number, r1: number,
    ): Gradient {
      return { kind: 'radial', coords: [x0, y0, r0, x1, y1, r1], stops: [] }
    },
  }

  // Canvas reads/writes style via properties; the recorder routes those
  // through the state object with accessor descriptors.
  for (const [prop, key] of [
    ['fillStyle', 'fill'],
    ['strokeStyle', 'stroke'],
    ['lineWidth', 'lineWidth'],
    ['globalAlpha', 'alpha'],
    ['font', 'font'],
    ['textAlign', 'align'],
    ['textBaseline', 'baseline'],
    ['lineCap', 'lineCap'],
    ['lineJoin', 'lineJoin'],
    ['lineDashOffset', 'dashOffset'],
  ] as const) {
    Object.defineProperty(ctx, prop, {
      get: () => (st as unknown as Record<string, unknown>)[key],
      set: (v: unknown) => {
        ;(st as unknown as Record<string, unknown>)[key] = v
      },
      enumerable: true,
      configurable: true,
    })
  }
  // shadow* and other ignored props: accept writes silently.
  for (const prop of ['shadowColor', 'shadowBlur', 'filter', 'globalCompositeOperation']) {
    Object.defineProperty(ctx, prop, {
      get: () => undefined,
      set: () => {
        /* ignored */
      },
      enumerable: true,
      configurable: true,
    })
  }

  // Gradient objects carry addColorStop like CanvasGradient.
  const makeGradient = <T extends Gradient>(g: T): T & {
    addColorStop: (offset: number, color: string) => void
  } => {
    const obj = g as T & { addColorStop: (o: number, c: string) => void }
    obj.addColorStop = (offset: number, color: string) => {
      g.stops.push({ offset, color })
    }
    return obj
  }
  const rawLinear = ctx.createLinearGradient.bind(ctx)
  const rawRadial = ctx.createRadialGradient.bind(ctx)
  ctx.createLinearGradient = (x0: number, y0: number, x1: number, y1: number) =>
    makeGradient(rawLinear(x0, y0, x1, y1))
  ctx.createRadialGradient = (
    x0: number, y0: number, r0: number, x1: number, y1: number, r1: number,
  ) => makeGradient(rawRadial(x0, y0, r0, x1, y1, r1))

  function toSvg(opts?: { width?: number; height?: number }): string {
    const defs: string[] = []
    for (const [g, id] of gradients) {
      const stops = g.stops
        .map((s) => `<stop offset="${fmt(Math.max(0, Math.min(1, s.offset)))}" stop-color="${esc(s.color)}"/>`)
        .join('')
      if (g.kind === 'linear') {
        const [x0, y0, x1, y1] = g.coords
        defs.push(
          `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${fmt(x0)}" y1="${fmt(y0)}" x2="${fmt(x1)}" y2="${fmt(y1)}">${stops}</linearGradient>`,
        )
      } else {
        const [x0, y0, r0, x1, y1, r1] = g.coords
        defs.push(
          `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${fmt(x1)}" cy="${fmt(y1)}" r="${fmt(r1)}" fx="${fmt(x0)}" fy="${fmt(y0)}" fr="${fmt(r0)}">${stops}</radialGradient>`,
        )
      }
    }
    const w = opts?.width ?? 1280
    const h = opts?.height ?? 920
    const defsStr = defs.length ? `\n  <defs>${defs.join('')}</defs>` : ''
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${defsStr}\n  ${elements.join('\n  ')}\n</svg>\n`
  }

  return { ctx: ctx as unknown as object, toSvg }
}
