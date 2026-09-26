'use client'
import { useState, useEffect, useRef } from 'react'
import { SvgWrap, SHARED_CSS } from './shared'

const NEURAL_NODES = [
  // Input layer
  { id: 0, x: 120, y: 100, layer: 0 }, { id: 1, x: 120, y: 175, layer: 0 },
  { id: 2, x: 120, y: 250, layer: 0 }, { id: 3, x: 120, y: 325, layer: 0 },
  { id: 4, x: 120, y: 400, layer: 0 },
  // Hidden layer 1
  { id: 5, x: 300, y: 130, layer: 1 }, { id: 6, x: 300, y: 210, layer: 1 },
  { id: 7, x: 300, y: 290, layer: 1 }, { id: 8, x: 300, y: 370, layer: 1 },
  // Hidden layer 2
  { id: 9,  x: 490, y: 150, layer: 2 }, { id: 10, x: 490, y: 250, layer: 2 },
  { id: 11, x: 490, y: 350, layer: 2 },
  // Output layer
  { id: 12, x: 670, y: 180, layer: 3 }, { id: 13, x: 670, y: 290, layer: 3 },
  { id: 14, x: 670, y: 380, layer: 3 },
]
const NEURAL_EDGES = []
;[0,1,2,3,4].forEach(s => [5,6,7,8].forEach(t => NEURAL_EDGES.push({ s, t })))
;[5,6,7,8].forEach(s => [9,10,11].forEach(t => NEURAL_EDGES.push({ s, t })))
;[9,10,11].forEach(s => [12,13,14].forEach(t => NEURAL_EDGES.push({ s, t })))

function NeuralNetMode({ visibleRef }) {
  const svgRef  = useRef()
  const ctxRef  = useRef()

  useEffect(() => {
    if (typeof window === 'undefined') return
    let gsapInst, ScrollTrigger

    Promise.all([
      import('gsap').then(m => m.gsap),
      import('gsap/ScrollTrigger').then(m => m.ScrollTrigger),
    ]).then(([gsap, ST]) => {
      if (!svgRef.current) return
      gsapInst = gsap
      const ctx = gsap.context(() => {
        const svg = svgRef.current

        // ── Pulse each node with staggered glow ──
        gsap.to('.nn-node', {
          attr: { r: 14 },
          filter: 'drop-shadow(0 0 10px var(--cyan))',
          duration: 1.1,
          ease: 'sine.inOut',
          repeat: -1,
          yoyo: true,
          stagger: { each: 0.18, from: 'start' },
        })

        // ── Shimmer edges — animate stroke-dashoffset ──
        gsap.to('.nn-edge', {
          strokeDashoffset: 0,
          duration: 1.4,
          ease: 'none',
          repeat: -1,
          stagger: { each: 0.04, from: 'random' },
        })

        // ── Output nodes pulse green on a slower cycle ──
        gsap.to('.nn-out', {
          attr: { r: 16 },
          opacity: 1,
          duration: 0.9,
          ease: 'expo.inOut',
          repeat: -1,
          yoyo: true,
          stagger: 0.3,
        })

        // ── Floating signal blobs travelling along edges ──
        const signals = svg.querySelectorAll('.nn-signal')
        signals.forEach((sig, i) => {
          const edge = svg.querySelectorAll('.nn-edge')[i % NEURAL_EDGES.length]
          if (!edge) return
          const len = edge.getTotalLength ? edge.getTotalLength() : 200
          gsap.set(sig, { opacity: 0 })
          gsap.timeline({ repeat: -1, delay: i * 0.35 })
            .to(sig, { opacity: 1, duration: 0.1 })
            .to(sig, {
              motionPath: { path: edge, align: edge, alignOrigin: [0.5, 0.5] },
              duration: 1.2 + (i % 3) * 0.3,
              ease: 'none',
            })
            .to(sig, { opacity: 0, duration: 0.1 })
        })

        // ── Layer label fade in ──
        gsap.from('.nn-label', {
          opacity: 0,
          y: 10,
          duration: 0.8,
          stagger: 0.2,
          ease: 'expo.out',
        })
      }, svgRef)
      ctxRef.current = ctx
    }).catch(() => {})

    return () => { try { ctxRef.current?.revert() } catch {} }
  }, [])

  return (
    <svg ref={svgRef} viewBox="0 0 900 480" width="100%" height="100%" style={{ maxHeight: 520 }}
      xmlns="http://www.w3.org/2000/svg">
      <style>{SHARED_CSS}{`
        .nn-edge  { stroke: color-mix(in srgb, var(--cyan) 18%, transparent); stroke-width: 1; fill: none;
                    stroke-dasharray: 6 4; }
        .nn-node  { fill: var(--bg3); stroke: var(--cyan); stroke-width: 1.5; }
        .nn-out   { fill: var(--bg3); stroke: var(--green); stroke-width: 2; opacity: 0.7; }
        .nn-signal{ fill: var(--cyan); }
      `}</style>
      <defs>
        <radialGradient id="nn-bg" cx="50%" cy="50%" r="60%">
          <stop offset="0%"   stopColor="color-mix(in srgb, var(--cyan) 4%, transparent)"/>
          <stop offset="100%" stopColor="transparent"/>
        </radialGradient>
      </defs>

      {/* Background */}
      <rect x="20" y="20" width="860" height="440" rx="8" fill="var(--bg2)" stroke="var(--border)" strokeWidth="1"/>
      <rect x="20" y="20" width="860" height="440" rx="8" fill="url(#nn-bg)"/>
      <rect x="20" y="20" width="860" height="3"   rx="2" fill="var(--cyan)" opacity="0.5"/>

      {/* Title */}
      <text x="36" y="42" fontSize="7" letterSpacing="3" fontFamily="monospace" fill="var(--cyan)" opacity="0.6">NEURAL NETWORK · LIVE INFERENCE</text>

      {/* Edges */}
      {NEURAL_EDGES.map((e, i) => {
        const s = NEURAL_NODES[e.s], t = NEURAL_NODES[e.t]
        return <line key={i} className="nn-edge" x1={s.x} y1={s.y} x2={t.x} y2={t.y}
          strokeDasharray="6 4" strokeDashoffset="20"/>
      })}

      {/* Signal blobs */}
      {NEURAL_EDGES.slice(0, 12).map((e, i) => {
        const s = NEURAL_NODES[e.s]
        return <circle key={i} className="nn-signal" cx={s.x} cy={s.y} r="3.5" opacity="0"/>
      })}

      {/* Nodes */}
      {NEURAL_NODES.map(n => (
        <circle key={n.id} className={n.layer === 3 ? 'nn-out' : 'nn-node'}
          cx={n.x} cy={n.y} r={10}/>
      ))}

      {/* Layer labels */}
      {[
        { x: 120, label: 'INPUT', sub: '5 NODES' },
        { x: 300, label: 'HIDDEN', sub: '4 NODES' },
        { x: 490, label: 'HIDDEN', sub: '3 NODES' },
        { x: 670, label: 'OUTPUT', sub: '3 NODES' },
      ].map((l, i) => (
        <g key={i} className="nn-label">
          <text x={l.x} y="58"  fontSize="7"  letterSpacing="2" fontFamily="monospace"
            fill="var(--muted)" textAnchor="middle">{l.label}</text>
          <text x={l.x} y="68"  fontSize="6"  letterSpacing="1" fontFamily="monospace"
            fill="var(--muted)" textAnchor="middle" opacity="0.5">{l.sub}</text>
        </g>
      ))}

      {/* Stats sidebar */}
      <rect x="730" y="80" width="130" height="300" rx="4" fill="var(--bg3)" stroke="var(--border)" strokeWidth="0.5" opacity="0.7"/>
      {[
        { label: 'ACCURACY', val: '99.2%', color: 'var(--green)' },
        { label: 'LATENCY',  val: '1.4ms', color: 'var(--cyan)'  },
        { label: 'LAYERS',   val: '4',     color: 'var(--cyan)'  },
        { label: 'PARAMS',   val: '2.1K',  color: 'var(--muted)' },
        { label: 'EPOCH',    val: '1,248', color: 'var(--muted)' },
      ].map((s, i) => (
        <g key={i}>
          <text x="745" y={108 + i * 52} fontSize="6"  letterSpacing="2" fontFamily="monospace" fill="var(--muted)">{s.label}</text>
          <text x="745" y={126 + i * 52} fontSize="14" letterSpacing="1" fontFamily="monospace" fill={s.color} fontWeight="700">{s.val}</text>
        </g>
      ))}

      {/* Footer */}
      <circle cx="52" cy="455" r="4" fill="var(--green)" style={{ filter: 'drop-shadow(0 0 4px var(--green))' }}/>
      <text x="62" y="459" fontSize="6" fontFamily="monospace" fill="var(--green)">INFERENCE ACTIVE · ZERO PACKET LOSS · MODEL LOCKED</text>
    </svg>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  MODE 6: PACKET FLOW  (GSAP-powered)
// ─────────────────────────────────────────────────────────────────────────────

export default NeuralNetMode
