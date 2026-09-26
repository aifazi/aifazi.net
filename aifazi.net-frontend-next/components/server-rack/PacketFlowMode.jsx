'use client'
import { useState, useEffect, useRef } from 'react'
import { SvgWrap, SHARED_CSS } from './shared'

const PF_NODES = [
  { id: 'client',  x: 80,  y: 240, label: 'CLIENT',   icon: '▣', color: 'var(--cyan)'   },
  { id: 'fw',      x: 220, y: 240, label: 'FIREWALL',  icon: '⬡', color: '#ff4757'       },
  { id: 'lb',      x: 390, y: 160, label: 'LOAD BAL',  icon: '◈', color: 'var(--orange)' },
  { id: 'cache',   x: 390, y: 320, label: 'CACHE',     icon: '◇', color: 'var(--cyan)'   },
  { id: 'api1',    x: 560, y: 110, label: 'API  #1',   icon: '▶', color: 'var(--green)'  },
  { id: 'api2',    x: 560, y: 240, label: 'API  #2',   icon: '▶', color: 'var(--green)'  },
  { id: 'api3',    x: 560, y: 370, label: 'API  #3',   icon: '▶', color: 'var(--green)'  },
  { id: 'db',      x: 730, y: 190, label: 'DATABASE',  icon: '◉', color: 'var(--cyan)'   },
  { id: 'cdn',     x: 730, y: 330, label: 'CDN',       icon: '⊕', color: 'var(--muted)'  },
]
const PF_EDGES = [
  { s: 'client', t: 'fw'    },
  { s: 'fw',     t: 'lb'    },
  { s: 'fw',     t: 'cache' },
  { s: 'lb',     t: 'api1'  },
  { s: 'lb',     t: 'api2'  },
  { s: 'cache',  t: 'api3'  },
  { s: 'api1',   t: 'db'    },
  { s: 'api2',   t: 'db'    },
  { s: 'api3',   t: 'cdn'   },
]

function PacketFlowMode({ visibleRef }) {
  const svgRef = useRef()
  const ctxRef = useRef()

  useEffect(() => {
    if (typeof window === 'undefined') return

    import('gsap').then(m => {
      const gsap = m.gsap
      if (!svgRef.current) return
      const svg = svgRef.current

      const ctx = gsap.context(() => {
        // ── Node pulse rings ──
        gsap.to('.pf-ring', {
          attr: { r: 26 },
          opacity: 0,
          duration: 1.4,
          ease: 'expo.out',
          repeat: -1,
          stagger: { each: 0.4, from: 'random' },
        })

        // ── Packet blobs travel each edge repeatedly ──
        svg.querySelectorAll('.pf-edge').forEach((edge, i) => {
          const pkts = svg.querySelectorAll(`.pf-pkt-${i}`)
          pkts.forEach((pkt, j) => {
            gsap.set(pkt, { opacity: 0 })
            const delay = i * 0.22 + j * 0.55
            gsap.timeline({ repeat: -1, delay })
              .set(pkt, { opacity: 1 })
              .to(pkt, {
                motionPath: { path: edge, align: edge, alignOrigin: [0.5, 0.5], autoRotate: false },
                duration: 1.0 + (i % 4) * 0.15,
                ease: 'none',
              })
              .set(pkt, { opacity: 0 })
          })
        })

        // ── Throughput counter tween ──
        const counter = { val: 0 }
        gsap.to(counter, {
          val: 1248,
          duration: 4,
          ease: 'power1.out',
          repeat: -1,
          yoyo: false,
          onUpdate: () => {
            const el = svg.querySelector('#pf-counter')
            if (el) el.textContent = Math.round(counter.val).toLocaleString()
          },
        })

        // ── Node labels entrance ──
        gsap.from('.pf-label', {
          opacity: 0,
          y: 8,
          duration: 0.6,
          stagger: 0.1,
          ease: 'expo.out',
        })
      }, svgRef)
      ctxRef.current = ctx
    }).catch(() => {})

    return () => { try { ctxRef.current?.revert() } catch {} }
  }, [])

  const nodeMap = Object.fromEntries(PF_NODES.map(n => [n.id, n]))

  return (
    <svg ref={svgRef} viewBox="0 0 900 480" width="100%" height="100%" style={{ maxHeight: 520 }}
      xmlns="http://www.w3.org/2000/svg">
      <style>{SHARED_CSS}{`
        .pf-edge { stroke: color-mix(in srgb, var(--cyan) 15%, transparent); stroke-width: 1.5; fill: none; stroke-dasharray: 5 3; }
        .pf-node { fill: var(--bg3); stroke-width: 1.5; }
        .pf-ring { fill: none; stroke-width: 1; opacity: 0.4; }
      `}</style>

      {/* Background */}
      <rect x="20" y="20" width="860" height="440" rx="8" fill="var(--bg2)" stroke="var(--border)" strokeWidth="1"/>
      <rect x="20" y="20" width="860" height="3"   rx="2" fill="var(--green)" opacity="0.6"/>
      <text x="36" y="42" fontSize="7" letterSpacing="3" fontFamily="monospace" fill="var(--green)" opacity="0.7">PACKET FLOW · REAL-TIME NETWORK TOPOLOGY</text>

      {/* Edges */}
      {PF_EDGES.map((e, i) => {
        const s = nodeMap[e.s], t = nodeMap[e.t]
        return (
          <g key={i}>
            <line className="pf-edge" id={`pf-edge-${i}`} x1={s.x} y1={s.y} x2={t.x} y2={t.y}/>
            {/* 2 packets per edge */}
            {[0, 1].map(j => (
              <rect key={j} className={`pf-pkt-${i}`}
                x={s.x - 4} y={s.y - 3} width="8" height="6" rx="2"
                fill={s.color} opacity="0"
                style={{ filter: `drop-shadow(0 0 4px ${s.color})` }}/>
            ))}
          </g>
        )
      })}

      {/* Nodes */}
      {PF_NODES.map(n => (
        <g key={n.id}>
          {/* Pulse ring */}
          <circle className="pf-ring" cx={n.x} cy={n.y} r={18} stroke={n.color} opacity="0.4"/>
          {/* Node body */}
          <circle className="pf-node" cx={n.x} cy={n.y} r={18}
            stroke={n.color} style={{ filter: `drop-shadow(0 0 6px ${n.color}55)` }}/>
          {/* Icon */}
          <text x={n.x} y={n.y + 4} fontSize="11" fontFamily="monospace"
            fill={n.color} textAnchor="middle">{n.icon}</text>
          {/* Label */}
          <text className="pf-label" x={n.x} y={n.y + 34} fontSize="6" letterSpacing="1.5"
            fontFamily="monospace" fill="var(--muted)" textAnchor="middle">{n.label}</text>
        </g>
      ))}

      {/* Stats panel */}
      <rect x="790" y="70" width="90" height="200" rx="4" fill="var(--bg3)" stroke="var(--border)" strokeWidth="0.5" opacity="0.8"/>
      <text x="835" y="90"  fontSize="6" letterSpacing="1" fontFamily="monospace" fill="var(--muted)" textAnchor="middle">PKTS/MIN</text>
      <text x="835" y="112" fontSize="20" letterSpacing="1" fontFamily="monospace" fill="var(--green)" textAnchor="middle" fontWeight="700">
        <tspan id="pf-counter">0</tspan>
      </text>
      {[
        { l: 'LATENCY',  v: '2.1ms' },
        { l: 'UPTIME',   v: '99.9%' },
        { l: 'NODES',    v: '9'     },
        { l: 'LOSS',     v: '0.00%' },
      ].map((s, i) => (
        <g key={i}>
          <text x="835" y={142 + i * 34} fontSize="6"  letterSpacing="1" fontFamily="monospace" fill="var(--muted)" textAnchor="middle">{s.l}</text>
          <text x="835" y={157 + i * 34} fontSize="10" letterSpacing="1" fontFamily="monospace" fill="var(--cyan)"  textAnchor="middle" fontWeight="700">{s.v}</text>
        </g>
      ))}

      {/* Footer */}
      <circle cx="52" cy="455" r="4" fill="var(--green)" style={{ filter: 'drop-shadow(0 0 4px var(--green))' }}/>
      <text x="62" y="459" fontSize="6" fontFamily="monospace" fill="var(--green)">ALL NODES HEALTHY · ZERO PACKET LOSS · ROUTING OPTIMAL</text>
      <text x="580" y="459" fontSize="6" fontFamily="monospace" fill="var(--muted)">{new Date().toISOString().slice(0, 19).replace('T', ' ')}</text>
    </svg>
  )
}


// ─────────────────────────────────────────────────────────────────────────────
//  MODE 7: AVATAR  (GSAP-powered, Dave Holloway style)
//  - Floating/bobbing avatar image
//  - Mouse parallax tilt
//  - Swirling orb background
//  - Configurable image URL via edit toolkit
// ─────────────────────────────────────────────────────────────────────────────

export default PacketFlowMode
