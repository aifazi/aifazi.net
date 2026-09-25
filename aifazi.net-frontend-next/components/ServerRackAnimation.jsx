'use client'
import { useEffect, useState, useRef } from 'react'
import { useInlineEdit } from '../context/EditContext'
import { prefersReducedMotion } from '../core/useFocusTrap'
import createGlobe from 'cobe'

// ─────────────────────────────────────────────────────────────────────────────
//  ServerRackAnimation  —  multi-mode animated dashboard
//  Modes: DATACENTER · DEPLOY PIPELINE · SYSTEM MONITOR · THREAT MAP
// ─────────────────────────────────────────────────────────────────────────────

const MODES = [
  { id: 'datacenter', label: 'DATACENTER',   icon: '⬡' },
  { id: 'deploy',     label: 'DEPLOY',        icon: '▶' },
  { id: 'monitor',    label: 'SYS MONITOR',  icon: '◈' },
  { id: 'threat',     label: 'THREAT MAP',   icon: '◉' },
  { id: 'neural',     label: 'NEURAL NET',   icon: '◎' },
  { id: 'packets',    label: 'PACKET FLOW',  icon: '⟶' },
  { id: 'avatar',     label: 'AVATAR',       icon: '◐' },
  { id: 'globe',      label: 'GLOBE',        icon: '◑' },
]

export default function ServerRackAnimation() {
  // Persist the active mode globally — saved for all visitors via the content API
  const { value: savedMode, save: persistMode, isAdmin: canEditMode } = useInlineEdit('hero.animMode', 'datacenter')

  // Local state follows the saved value; also allows instant preview while in edit mode
  const [mode, setMode] = useState(() => (typeof savedMode === 'string' ? savedMode : 'datacenter'))
  const [tick, setTick] = useState(0)
  const [hovMode, setHovMode] = useState(null)
  const visibleRef = useRef(true)
  const containerRef = useRef(null)

  // Keep local mode in sync when the backend value changes (e.g. after another admin saves)
  const [prevSavedMode, setPrevSavedMode] = useState(savedMode)
  if (prevSavedMode !== savedMode) {
    setPrevSavedMode(savedMode)
    if (typeof savedMode === 'string' && savedMode !== mode) setMode(savedMode)
  }

  useEffect(() => {
    const el = containerRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const obs = new IntersectionObserver(([e]) => { visibleRef.current = e.isIntersecting }, { threshold: 0 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    const id = setInterval(() => {
      if (prefersReducedMotion()) return
      if (visibleRef.current) setTick(t => t + 1)
    }, 350)
    return () => clearInterval(id)
  }, [])

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', minHeight: 520, position: 'relative',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start',
      paddingTop: canEditMode ? 16 : 0 }}>

      {/* ── Mode Switcher — only visible in admin edit mode ── */}
      {canEditMode && (
      <div style={{ display: 'flex', gap: 4, marginBottom: 14, background: 'var(--bg2)',
        border: '1px solid var(--border)', borderRadius: 6, padding: 4, flexWrap: 'wrap',
        boxShadow: '0 2px 12px rgba(0,0,0,0.3)', position: 'relative' }}>
        {/* Admin-only hint badge */}
        <div style={{
          position: 'absolute', top: -9, left: '50%', transform: 'translateX(-50%)',
          fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2,
          color: 'var(--green)', background: 'var(--bg2)',
          border: '1px solid color-mix(in srgb, var(--green) 35%, transparent)', borderRadius: 10,
          padding: '1px 8px', whiteSpace: 'nowrap', pointerEvents: 'none',
        }}>✎ EDIT MODE — SELECT ANIMATION</div>
        {MODES.map(m => {
          const active = mode === m.id
          return (
            <button key={m.id}
              onClick={() => { setMode(m.id); persistMode(m.id) }}
              onMouseEnter={() => setHovMode(m.id)}
              onMouseLeave={() => setHovMode(null)}
              style={{
                fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2,
                padding: '6px 14px', cursor: 'pointer', borderRadius: 4,
                border: active ? '1px solid var(--cyan)' : '1px solid transparent',
                background: active ? 'color-mix(in srgb, var(--cyan) 10%, transparent)' : hovMode === m.id ? 'var(--bg3)' : 'transparent',
                color: active ? 'var(--cyan)' : 'var(--muted)',
                transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: active ? '0 0 10px color-mix(in srgb, var(--cyan) 15%, transparent)' : 'none',
              }}>
              <span style={{ fontSize: 11, color: active ? 'var(--cyan)' : 'var(--muted)' }}>{m.icon}</span>
              {m.label}
              {active && <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--cyan)',
                boxShadow: '0 0 6px var(--cyan)', display: 'inline-block' }}/>}
            </button>
          )
        })}
      </div>
      )}

      {/* ── Animation panel ── */}
      <div style={{ width: '100%', flex: 1, position: 'relative' }}>
        {mode === 'datacenter' && <DatacenterMode tick={tick} visibleRef={visibleRef}/>}
        {mode === 'deploy'     && <DeployMode     tick={tick} visibleRef={visibleRef}/>}
        {mode === 'monitor'    && <MonitorMode    tick={tick} visibleRef={visibleRef}/>}
        {mode === 'threat'     && <ThreatMode     tick={tick} visibleRef={visibleRef}/>}
        {mode === 'neural'     && <NeuralNetMode  visibleRef={visibleRef}/>}
        {mode === 'packets'    && <PacketFlowMode visibleRef={visibleRef}/>}
        {mode === 'avatar'     && <AvatarMode     visibleRef={visibleRef}/>}
        {mode === 'globe'      && <GlobeMode      visibleRef={visibleRef}/>}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  SHARED CSS
// ─────────────────────────────────────────────────────────────────────────────
const SHARED_CSS = `
  .rk-chassis { fill:var(--bg2); stroke:var(--border); stroke-width:1.5; }
  .rk-lip     { fill:var(--bg3); }
  .rk-rail    { fill:var(--bg4,var(--bg3)); }
  .sv-body    { fill:var(--bg3); stroke:var(--border2,var(--border)); stroke-width:0.7; }
  .sv-face    { fill:var(--bg4,var(--bg3)); }
  .sv-lbl     { fill:var(--muted); font-family:monospace; }
  .sv-port    { fill:var(--bg3); stroke:var(--border2,var(--border)); stroke-width:0.5; }
  .led-g-on   { fill:var(--green);  filter:drop-shadow(0 0 3px var(--green)); }
  .led-c-on   { fill:var(--cyan);   filter:drop-shadow(0 0 3px var(--cyan)); }
  .led-o-on   { fill:var(--orange); filter:drop-shadow(0 0 3px var(--orange)); }
  .led-r-on   { fill:#ff4757;       filter:drop-shadow(0 0 3px #ff4757); }
  .led-off    { fill:var(--bg3); }
  .lbl-g      { fill:var(--green);  font-family:monospace; }
  .lbl-c      { fill:var(--cyan);   font-family:monospace; }
  .lbl-m      { fill:var(--muted);  font-family:monospace; }
  .lbl-o      { fill:var(--orange); font-family:monospace; }
  .lbl-p      { fill:var(--purple,var(--cyan)); font-family:monospace; }
  .scr-bg     { fill:var(--bg4,var(--bg3)); stroke:var(--green); stroke-width:1; stroke-opacity:0.4; }
  .scr-scan   { stroke:var(--green); stroke-opacity:0.03; stroke-width:1; }
  .scr-on     { fill:var(--green); font-family:monospace; filter:drop-shadow(0 0 2px var(--green)); }
  .scr-dim    { fill:var(--muted); font-family:monospace; }
  .hud-bg     { fill:var(--bg3); fill-opacity:0.92; stroke:var(--border); stroke-width:0.8; }
  .bracket    { stroke:var(--cyan); stroke-opacity:0.3; stroke-width:1; fill:none; }
  .cable-g    { stroke:var(--green);  stroke-opacity:0.45; stroke-width:1.5; fill:none; }
  .cable-c    { stroke:var(--cyan);   stroke-opacity:0.45; stroke-width:1.5; fill:none; }
  .cable-o    { stroke:var(--orange); stroke-opacity:0.45; stroke-width:1.5; fill:none; }
  .shadow-el  { fill:var(--bg); fill-opacity:0.15; }
  .hud-title  { fill:var(--cyan); fill-opacity:0.35; font-family:monospace; letter-spacing:2px; font-size:7px; }
`

function SvgWrap({ viewBox = "0 0 900 460", children }) {
  return (
    <svg viewBox={viewBox} width="100%" height="100%"
      style={{ maxHeight: 520 }} xmlns="http://www.w3.org/2000/svg">
      <style>{SHARED_CSS}</style>
      <defs>
        <filter id="gf-led" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="2" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      {children}
    </svg>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  MODE 1: DATACENTER (enhanced original)
// ─────────────────────────────────────────────────────────────────────────────
function DatacenterMode({ tick, visibleRef }) {
  const [lights, setLights] = useState(() => Array.from({ length: 40 }, () => Math.random() > 0.35))
  const [robotY, setRobotY] = useState(0)
  const [robotArm, setRobotArm] = useState(false)
  const [dataFlow, setDataFlow] = useState([])
  const [screenText, setScreenText] = useState(['INIT SEQUENCE...'])
  const [graphHistory, setGraphHistory] = useState(() => Array.from({ length: 30 }, (_, i) => 40 + Math.sin(i * 0.4) * 18 + Math.random() * 12))
  const [activeNode, setActiveNode] = useState(0)
  const [netParticles, setNetParticles] = useState([])
  const [alerts, setAlerts] = useState([])

  const LOG_LINES = ['PING 10.0.0.1 — OK','BGP SESSION UP','OSPF ADJ FORMED','VLAN 100 ACTIVE',
    'CPU: 12%  MEM: 41%','FW RULE 42 MATCH','SSH AUTH OK','BACKUP COMPLETE',
    'CERT RENEWED OK','UPTIME: 99.99%','DEPLOY v2.4.1 OK','TLS 1.3 ENFORCED',
    'IPSEC TUNNEL UP','NTP SYNC OK','DNS CACHE FLUSH']

  const ALERT_MSGS = ['⚡ BGP PEER UP','✓ CERT RENEWED','⚠ HIGH CPU SRV-3','✓ BACKUP DONE','⚡ DEPLOY OK']

  const bezier = (t, p0, p1, p2, p3) =>
    (1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t ** 2 * p2 + t ** 3 * p3

  useEffect(() => {
    const id = setInterval(() => {
      if (!visibleRef.current) return
      setLights(p => p.map(l => Math.random() > 0.93 ? !l : l))
    }, 380)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const id = setInterval(() => {
      if (!visibleRef.current) return
      setRobotY(y => (y + 1) % 3)
      setRobotArm(a => !a)
    }, 2400)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const NET_EDGES = [[0,1],[0,2],[1,3],[2,3],[3,4],[3,5],[4,6],[5,6]]
    const id = setInterval(() => {
      if (!visibleRef.current) return
      setDataFlow(prev => {
        const next = prev.map(p => ({ ...p, t: p.t + 0.05 })).filter(p => p.t < 1)
        if (Math.random() > 0.52) next.push({ id: Date.now() + Math.random(), t: 0, lane: Math.floor(Math.random() * 4) })
        return next
      })
      setNetParticles(prev => {
        const next = prev.map(p => ({ ...p, t: p.t + 0.04 })).filter(p => p.t < 1)
        if (Math.random() > 0.45) {
          const edge = NET_EDGES[Math.floor(Math.random() * NET_EDGES.length)]
          next.push({ id: Date.now() + Math.random(), t: 0, from: edge[0], to: edge[1], rev: Math.random() > 0.5 })
        }
        return next
      })
    }, 60)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const id = setInterval(() => {
      if (!visibleRef.current) return
      setScreenText(p => [...p, LOG_LINES[Math.floor(Math.random() * LOG_LINES.length)]].slice(-5))
      setGraphHistory(p => {
        const last = p[p.length - 1]
        return [...p.slice(1), Math.max(8, Math.min(88, last + (Math.random() - 0.48) * 14))]
      })
      setActiveNode(n => (n + 1) % 7)
      // Random floating alert
      if (Math.random() > 0.72) {
        const msg = ALERT_MSGS[Math.floor(Math.random() * ALERT_MSGS.length)]
        const isWarn = msg.includes('⚠')
        setAlerts(a => [...a.slice(-2), { id: Date.now(), msg, warn: isWarn, age: 0 }])
      }
      setAlerts(a => a.map(x => ({ ...x, age: x.age + 1 })).filter(x => x.age < 6))
    }, 850)
    return () => clearInterval(id)
  }, [])

  const ry = [160, 232, 304][robotY]

  return (
    <SvgWrap viewBox="0 0 1100 490">
      {/* Glow */}
      <ellipse cx="200" cy="468" rx="135" ry="9" className="shadow-el"/>
      <ellipse cx="410" cy="468" rx="82" ry="6" className="shadow-el"/>

      {/* ── MAIN RACK ── */}
      <rect x="78" y="88" width="244" height="376" rx="4" className="rk-chassis"/>
      <rect x="78" y="88" width="244" height="12" rx="4" className="rk-lip"/>
      <rect x="78" y="452" width="244" height="12" rx="2" className="rk-lip"/>
      <rect x="80" y="100" width="8" height="352" className="rk-rail"/>
      <rect x="314" y="100" width="8" height="352" className="rk-rail"/>
      {Array.from({ length: 22 }, (_, i) => (
        <text key={i} x="92" y={114 + i * 16.5} className="rk-unit-lbl" fontSize="5" fontFamily="monospace" fill="var(--border)">
          {String(i + 1).padStart(2, '0')}
        </text>
      ))}

      {/* Router */}
      <rect x="100" y="103" width="200" height="28" rx="2" className="sv-body"/>
      <text x="110" y="114" fontSize="6" letterSpacing="1" className="lbl-c">ROUTER · CORE-01</text>
      <text x="110" y="123" fontSize="5" className="lbl-m">BGP · OSPF · IS-IS · MPLS</text>
      {[0,1,2,3,4,5,6,7].map(i => <rect key={i} x={246+i*7} y="108" width="5" height="4" rx="1" className={lights[i]?'led-g-on':'led-off'}/>)}
      <circle cx="294" cy="117" r="3" className={tick%2===0?'led-c-on':'led-off'}/>

      {/* Switches */}
      <rect x="100" y="135" width="200" height="16" rx="2" className="sv-body"/>
      <text x="110" y="146" fontSize="6" letterSpacing="1" className="lbl-p">SWITCH · 48P</text>
      {Array.from({length:24},(_,i)=><rect key={i} x={200+i*4.2} y="138" width="3.2" height="3" rx="0.5" className={lights[(8+i)%40]?'led-g-on':'led-off'}/>)}
      <rect x="100" y="155" width="200" height="16" rx="2" className="sv-body"/>
      <text x="110" y="166" fontSize="6" letterSpacing="1" className="lbl-p">SWITCH · 24P</text>
      {Array.from({length:12},(_,i)=><rect key={i} x={222+i*4.5} y="158" width="3.5" height="3" rx="0.5" className={lights[(16+i)%40]?'led-c-on':'led-off'}/>)}

      {/* 8 Servers */}
      {Array.from({length:8},(_,s)=>{
        const sy=175+s*22, act=lights[s*3%40], cpu=15+((tick*7+s*31)%65)
        return <g key={s}>
          <rect x="100" y={sy} width="200" height="18" rx="2" className="sv-body"/>
          <rect x="105" y={sy+4} width="28" height="10" rx="1" className="sv-face"/>
          <text x="107" y={sy+12} fontSize="5.5" className="sv-lbl">SRV-{String(s+1).padStart(2,'0')}</text>
          {[0,1,2,3].map(d=><rect key={d} x={138+d*10} y={sy+5} width="8" height="8" rx="1" className="sv-port"/>)}
          <circle cx="194" cy={sy+9} r="2.5" className={act?'led-g-on':'led-off'}/>
          <circle cx="202" cy={sy+9} r="2.5" className={lights[(s*3+1)%40]?'led-c-on':'led-off'}/>
          <rect x="220" y={sy+6} width="42" height="4" rx="1" className="sv-face"/>
          <rect x="220" y={sy+6} width={cpu*0.42} height="4" rx="1" className={cpu>70?'led-o-on':'led-c-on'} style={{opacity:0.85}}/>
          {/* Temperature dot — new */}
          <circle cx="275" cy={sy+9} r="2" className={cpu>60?'led-o-on':cpu>80?'led-r-on':'led-g-on'}/>
        </g>
      })}

      {/* Patch + UPS */}
      <rect x="100" y="351" width="200" height="14" rx="2" className="sv-body"/>
      <text x="110" y="361" fontSize="6" className="lbl-m">PATCH PANEL · 24P</text>
      {Array.from({length:16},(_,i)=><rect key={i} x={206+i*5.5} y="354" width="4" height="4" rx="0.5" className="sv-port"/>)}
      <rect x="100" y="369" width="200" height="48" rx="2" className="sv-body"/>
      <text x="110" y="383" fontSize="7" letterSpacing="1" className="lbl-o">UPS · 3000VA</text>
      {[0,1,2,3,4,5].map(i=><rect key={i} x={196+i*13} y="372" width="11" height="40" rx="1"
        className={i<4?'led-c-on':'led-off'} style={{opacity:i<4?0.18:0.5}}/>)}
      <text x="110" y="405" fontSize="5.5" className="lbl-m">BATT: {70+(tick%15)}%  ·  LOAD: 42%</text>

      {/* ── RIGHT MINI-RACK ── */}
      <rect x="352" y="148" width="162" height="248" rx="4" className="rk-chassis" style={{strokeWidth:1.2}}/>
      <rect x="352" y="148" width="162" height="10" rx="4" className="rk-lip"/>
      <rect x="352" y="386" width="162" height="10" rx="2" className="rk-lip"/>
      <rect x="354" y="158" width="6" height="228" className="rk-rail"/>
      <rect x="502" y="158" width="6" height="228" className="rk-rail"/>
      <rect x="366" y="161" width="132" height="24" rx="2" className="sv-body"/>
      <text x="374" y="172" fontSize="6.5" letterSpacing="1" className="lbl-g">FIREWALL</text>
      <text x="374" y="180" fontSize="5" className="lbl-m">FortiGate · pfSense</text>
      <circle cx="484" cy="173" r="3.5" className={tick%3===0?'led-g-on':'led-off'}/>
      <rect x="366" y="189" width="132" height="38" rx="2" className="sv-body"/>
      <text x="374" y="200" fontSize="6" className="lbl-c">NAS · 96 TB</text>
      {[0,1,2,3,4,5].map(i=><g key={i}>
        <rect x={374+i*18} y="204" width="14" height="18" rx="1" className="sv-port"/>
        <circle cx={381+i*18} cy="209" r="2" className={lights[(i*5+1)%40]?'led-c-on':'led-off'}/>
      </g>)}
      {[0,1,2,3].map(s=>{
        const sy=232+s*21
        return <g key={s}>
          <rect x="366" y={sy} width="132" height="17" rx="2" className="sv-body"/>
          <text x="374" y={sy+11} fontSize="5.5" className="lbl-m">NODE-0{s+1}</text>
          <circle cx="452" cy={sy+8} r="2" className={lights[(s*7+3)%40]?'led-g-on':'led-off'}/>
          <circle cx="460" cy={sy+8} r="2" className={lights[(s*7+1)%40]?'led-c-on':'led-off'}/>
          <rect x="468" y={sy+4} width="24" height="3" rx="1" className="sv-face"/>
          <rect x="468" y={sy+4} width={8+((tick*3+s*17)%18)} height="3" rx="1" className="led-c-on" style={{opacity:0.7}}/>
        </g>
      })}

      {/* KVM terminal */}
      <rect x="366" y="318" width="132" height="60" rx="2" className="scr-bg"/>
      {Array.from({length:12},(_,i)=><line key={i} x1="368" y1={322+i*5} x2="496" y2={322+i*5} className="scr-scan"/>)}
      {screenText.map((line,i)=><text key={i} x="370" y={328+i*9} fontSize="5.5" className={i===screenText.length-1?'scr-on':'scr-dim'}>&gt; {line}</text>)}
      <rect x={370+(screenText[screenText.length-1]?.length||0)*3.3+13} y={320+(screenText.length-1)*9}
        width="4" height="6" className={tick%2===0?'scr-on':'led-off'}/>

      {/* Cables */}
      {[0,1,2,3].map(i=>{
        const y1=148+i*26, y2=190+i*22, s=18+i*6
        const cls=['cable-g','cable-c','cable-o','cable-c']
        return <path key={i} d={`M 322 ${y1} C ${345+s} ${y1}, ${338+s} ${y2}, 366 ${y2}`} className={cls[i]}/>
      })}

      {/* Data particles */}
      {dataFlow.map(p=>{
        const y1=148+p.lane*26, y2=190+p.lane*22, s=18+p.lane*6
        const bx=bezier(p.t,322,345+s,338+s,366), by=bezier(p.t,y1,y1,y2,y2)
        return <circle key={p.id} cx={bx} cy={by} r="2.5" className={['led-g-on','led-c-on','led-o-on','led-c-on'][p.lane%4]} style={{opacity:1-p.t*0.5}}/>
      })}

      {/* HUDs */}
      <rect x="80" y="58" width="92" height="24" rx="3" className="hud-bg"/>
      <text x="88" y="69" fontSize="6" className="lbl-c">↑ 2.4 Gbps</text>
      <text x="88" y="78" fontSize="6" className="lbl-g">↓ 1.8 Gbps</text>
      <rect x="352" y="118" width="86" height="24" rx="3" className="hud-bg"/>
      <text x="360" y="129" fontSize="6" className="lbl-g">UPTIME 99.9%</text>
      <text x="360" y="138" fontSize="6" className="lbl-m">{Math.floor(tick/2.5)%60}d {Math.floor(tick*0.4)%24}h uptime</text>

      {/* Brackets + title */}
      <path d="M 48 26 L 48 46 M 48 26 L 68 26" className="bracket"/>
      <path d="M 532 26 L 532 46 M 532 26 L 512 26" className="bracket"/>
      <path d="M 48 454 L 48 434 M 48 454 L 68 454" className="bracket"/>
      <path d="M 532 454 L 532 434 M 532 454 L 512 454" className="bracket"/>
      <text x="48" y="20" className="hud-title">DATACENTER · NODE-CLUSTER-01</text>

      {/* Robot */}
      <g style={{transition:'transform 0.85s cubic-bezier(0.4,0,0.2,1)'}} transform={`translate(335,${ry})`}>
        <ellipse cx="0" cy="80" rx="19" ry="4.5" className="shadow-el"/>
        <rect x="-10" y="56" width="8" height="24" rx="3" className="rb-body" style={{fill:'var(--bg3)',stroke:'var(--border)',strokeWidth:1}}/>
        <rect x="2" y="56" width="8" height="24" rx="3" style={{fill:'var(--bg3)',stroke:'var(--border)',strokeWidth:1}}/>
        <rect x="-13" y="76" width="12" height="5" rx="2" style={{fill:'var(--bg4,var(--bg3))'}}/>
        <rect x="1" y="76" width="12" height="5" rx="2" style={{fill:'var(--bg4,var(--bg3))'}}/>
        <rect x="-17" y="22" width="34" height="36" rx="5" style={{fill:'var(--bg3)',stroke:'var(--border)',strokeWidth:1}}/>
        <line x1="-17" y1="38" x2="17" y2="38" style={{stroke:'var(--border)',strokeWidth:0.8}}/>
        <rect x="-11" y="26" width="22" height="10" rx="2" style={{fill:'var(--bg4,var(--bg3))'}}/>
        <text x="-9" y="34" fontSize="4" className="scr-on">{(screenText[screenText.length-1]||'').slice(0,11)}</text>
        <circle cx="-8" cy="44" r="2.5" className={tick%2===0?'led-g-on':'led-off'}/>
        <circle cx="0" cy="44" r="2.5" className={tick%3===0?'led-c-on':'led-off'}/>
        <rect x="-27" y="24" width="10" height="6" rx="3" style={{fill:'var(--bg3)',stroke:'var(--border)',strokeWidth:1}}/>
        <rect x="-29" y="30" width="8" height="20" rx="3" style={{fill:'var(--bg3)',stroke:'var(--border)',strokeWidth:1}}/>
        <line x1="-26" y1="54" x2="-26" y2="60" style={{stroke:'var(--green)',strokeWidth:1.8,filter:'drop-shadow(0 0 3px var(--green))'}}/>
        <g transform={`rotate(${robotArm?-32:-10},17,28)`}>
          <rect x="17" y="24" width="10" height="6" rx="3" style={{fill:'var(--bg3)',stroke:'var(--border)',strokeWidth:1}}/>
          <rect x="19" y="30" width="8" height="20" rx="3" style={{fill:'var(--bg3)',stroke:'var(--border)',strokeWidth:1}}/>
          <line x1="23" y1="61" x2="23" y2="68" style={{stroke:'var(--cyan)',strokeWidth:2.2,filter:'drop-shadow(0 0 4px var(--cyan))'}}/>
        </g>
        <rect x="-5" y="14" width="10" height="10" rx="2" style={{fill:'var(--bg4,var(--bg3))'}}/>
        <rect x="-15" y="-5" width="30" height="23" rx="5" style={{fill:'var(--bg3)',stroke:'var(--border)',strokeWidth:1}}/>
        <rect x="-12" y="-1" width="24" height="11" rx="3" style={{fill:'var(--bg4,var(--bg3))'}}/>
        <circle cx="-5" cy="4.5" r="4" className={tick%4===0?'led-c-on':'led-off'} style={{opacity:tick%4===0?1:0.5}}/>
        <circle cx="5" cy="4.5" r="4" className={tick%4===0?'led-c-on':'led-off'} style={{opacity:tick%4===0?1:0.5}}/>
        <circle cx="-5" cy="4.5" r="1.8" style={{fill:'var(--bg4,var(--bg3))'}}/>
        <circle cx="5" cy="4.5" r="1.8" style={{fill:'var(--bg4,var(--bg3))'}}/>
        <line x1="0" y1="-5" x2="0" y2="-16" style={{stroke:'var(--border)',strokeWidth:1.2}}/>
        <circle cx="0" cy="-18" r="3.5" className={tick%2===0?'led-o-on':'led-off'}/>
        <rect x="-20" y="1" width="5" height="7" rx="2" style={{fill:'var(--bg4,var(--bg3))'}}/>
        <rect x="15" y="1" width="5" height="7" rx="2" style={{fill:'var(--bg4,var(--bg3))'}}/>
      </g>

      {/* ── Network topology panel ── */}
      {(() => {
        const PX=560
        const nodes=[
          {x:PX+130,y:52, label:'CORE-RTR', color:'var(--cyan)'},
          {x:PX+52, y:130,label:'FW-01',    color:'var(--green)'},
          {x:PX+208,y:130,label:'FW-02',    color:'var(--green)'},
          {x:PX+130,y:200,label:'SWITCH-L3',color:'var(--cyan)'},
          {x:PX+52, y:272,label:'SRV-CLSTR',color:'var(--orange)'},
          {x:PX+208,y:272,label:'DMZ',       color:'#a78bfa'},
          {x:PX+130,y:340,label:'INTERNET', color:'var(--muted)'},
        ]
        const edges=[[0,1],[0,2],[1,3],[2,3],[3,4],[3,5],[4,6],[5,6]]
        const GX=PX+256, GY=50, GW=208, GH=100
        const pts=graphHistory, maxV=100, step=GW/(pts.length-1)
        const pathD=pts.map((v,i)=>`${i===0?'M':'L'}${GX+i*step},${GY+GH-(v/maxV)*GH}`).join(' ')
        const areaD=pathD+` L${GX+GW},${GY+GH} L${GX},${GY+GH} Z`
        return <g>
          <rect x={PX} y="20" width="480" height="450" rx="6" fill="var(--bg2)" fillOpacity="0.5" stroke="var(--border)" strokeWidth="1"/>
          <text x={PX+12} y="35" className="hud-title">NETWORK TOPOLOGY · LIVE</text>
          <circle cx={PX+460} cy="29" r="3.5" className={tick%2===0?'led-g-on':'led-off'}/>
          {edges.map(([a,b],i)=><line key={i} x1={nodes[a].x} y1={nodes[a].y} x2={nodes[b].x} y2={nodes[b].y} stroke="var(--border)" strokeWidth="1.2" strokeDasharray="4 3"/>)}
          {netParticles.map(p=>{
            const fr=nodes[p.from],to=nodes[p.to],t=p.rev?1-p.t:p.t
            return <circle key={p.id} cx={fr.x+(to.x-fr.x)*t} cy={fr.y+(to.y-fr.y)*t} r="2.5" fill="var(--cyan)" opacity={0.9-p.t*0.5} style={{filter:'drop-shadow(0 0 4px var(--cyan))'}}/>
          })}
          {nodes.map((n,i)=>{
            const active=i===activeNode
            return <g key={i}>
              {active&&<circle cx={n.x} cy={n.y} r="18" fill={n.color} opacity="0.08"/>}
              <circle cx={n.x} cy={n.y} r="13" fill="var(--bg3)" stroke={n.color} strokeWidth={active?1.8:0.8} opacity={active?1:0.7}/>
              <circle cx={n.x} cy={n.y} r="5" fill={n.color} opacity={active?1:0.4} style={active?{filter:`drop-shadow(0 0 5px ${n.color})`}:{}}/>
              <text x={n.x} y={n.y+26} textAnchor="middle" fontSize="5.5" fontFamily="monospace" fill={n.color} opacity="0.9">{n.label}</text>
            </g>
          })}
          {/* Graph */}
          <rect x={GX} y={GY} width={GW} height={GH} rx="4" fill="var(--bg3)" stroke="var(--border)" strokeWidth="0.8"/>
          <text x={GX+6} y={GY+12} fontSize="6" letterSpacing="1" fill="var(--cyan)" fontFamily="monospace">BANDWIDTH · REAL-TIME</text>
          <defs>
            <linearGradient id="gg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--cyan)" stopOpacity="0.25"/>
              <stop offset="100%" stopColor="var(--cyan)" stopOpacity="0"/>
            </linearGradient>
            <clipPath id="gc"><rect x={GX} y={GY} width={GW} height={GH}/></clipPath>
          </defs>
          <path d={areaD} fill="url(#gg)" clipPath="url(#gc)"/>
          <path d={pathD} fill="none" stroke="var(--cyan)" strokeWidth="1.5" style={{filter:'drop-shadow(0 0 3px var(--cyan))'}} clipPath="url(#gc)"/>
          <circle cx={GX+GW-step} cy={GY+GH-(pts[pts.length-1]/maxV)*GH} r="3" fill="var(--cyan)" style={{filter:'drop-shadow(0 0 5px var(--cyan))'}}/>
          <text x={GX+GW-36} y={GY+12} fontSize="8" fontFamily="monospace" fill="var(--cyan)">{pts[pts.length-1].toFixed(0)}%</text>
          {/* Metric cards */}
          {[
            {label:'LATENCY',  value:`${4+(tick%8)}ms`,  color:'var(--cyan)',   x:PX+12},
            {label:'UPTIME',   value:'99.97%',            color:'var(--green)', x:PX+132},
            {label:'THROUGHPUT',value:`${(2.1+((tick*0.03)%0.8)).toFixed(1)}G`, color:'var(--orange)',x:PX+252},
            {label:'THREATS',  value:'0',                 color:'#a78bfa',      x:PX+372},
          ].map((m,i)=><g key={i}>
            <rect x={m.x} y="340" width="108" height="52" rx="5" fill="var(--bg3)" stroke="var(--border)" strokeWidth="0.8"/>
            <rect x={m.x} y="340" width="108" height="2" rx="2" fill={m.color} opacity="0.6"/>
            <text x={m.x+8} y="355" fontSize="6" letterSpacing="2" fontFamily="monospace" fill="var(--muted)">{m.label}</text>
            <text x={m.x+8} y="375" fontSize="14" fontWeight="bold" fontFamily="monospace" fill={m.color} style={{filter:`drop-shadow(0 0 6px ${m.color})`}}>{m.value}</text>
          </g>)}
          {/* Security log */}
          <rect x={PX+12} y="400" width="456" height="58" rx="4" fill="var(--bg3)" stroke="var(--border)" strokeWidth="0.8"/>
          <text x={PX+20} y="412" fontSize="6" letterSpacing="2" fontFamily="monospace" fill="var(--green)" opacity="0.7">SECURITY LOG</text>
          {[
            `[${String(Math.floor(tick/6)%24).padStart(2,'0')}:${String(tick%60).padStart(2,'0')}]  IPSEC SA REKEYED`,
            `[${String((tick/6+1|0)%24).padStart(2,'0')}:${String((tick+17)%60).padStart(2,'0')}]  FW BLOCKED 10.0.4.22`,
            `[${String((tick/6+1|0)%24).padStart(2,'0')}:${String((tick+34)%60).padStart(2,'0')}]  TLS CERT OK`,
            `[${String((tick/6+1|0)%24).padStart(2,'0')}:${String((tick+51)%60).padStart(2,'0')}]  BGP PEER UP`,
          ].map((msg,i)=><text key={i} x={PX+20} y={423+i*10} fontSize="5.5" fontFamily="monospace" fill={['var(--green)','var(--orange)','var(--cyan)','var(--muted)'][i]} opacity={1-i*0.2}>{msg}</text>)}
        </g>
      })()}

      {/* Floating alert badges */}
      {alerts.map((a,i)=>(
        <g key={a.id} style={{transition:'opacity 0.5s'}} opacity={Math.max(0,1-a.age*0.18)}>
          <rect x={84+i*160} y="64" width={a.msg.length*5+16} height="16" rx="4"
            fill={a.warn?'rgba(255,165,0,0.15)':'color-mix(in srgb, var(--green) 10%, transparent)'}
            stroke={a.warn?'var(--orange)':'var(--green)'} strokeWidth="0.8"/>
          <text x={92+i*160} y="75" fontSize="6" fontFamily="monospace" fill={a.warn?'var(--orange)':'var(--green)'}>{a.msg}</text>
        </g>
      ))}
    </SvgWrap>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  MODE 2: DEPLOY PIPELINE
// ─────────────────────────────────────────────────────────────────────────────
const STAGES = [
  { id:'checkout',  label:'CHECKOUT',   icon:'⬡', desc:'Clone repo' },
  { id:'install',   label:'INSTALL',    icon:'◈', desc:'npm install' },
  { id:'lint',      label:'LINT',       icon:'◇', desc:'ESLint + TS' },
  { id:'test',      label:'TEST',       icon:'◉', desc:'Jest 42 tests' },
  { id:'build',     label:'BUILD',      icon:'▶', desc:'next build' },
  { id:'preview',   label:'PREVIEW',    icon:'◈', desc:'Deploy preview' },
  { id:'production',label:'PRODUCTION', icon:'⬡', desc:'aifazi.net' },
]

function DeployMode({ tick, visibleRef }) {
  const [activeStage, setActiveStage]   = useState(0)
  const [stageProgress, setStageProgress] = useState(0)
  const [completedStages, setCompleted] = useState([])
  const [logLines, setLogLines]         = useState(['> git clone https://github.com/aifazi/aifazi.net'])
  const [particles, setParticles]       = useState([])
  const [runCount, setRunCount]         = useState(1)

  const STAGE_LOGS = {
    checkout:  ['Cloning into aifazi.net...','remote: Counting objects: 2847','Resolving deltas: 100%','HEAD is at d8fa3bc'],
    install:   ['npm warn deprecated inflight@1.0.6','added 847 packages in 14s','Packages audited: 847','found 0 vulnerabilities'],
    lint:      ['Running eslint on 312 files...','✓  components/Navbar.jsx','✓  lib/api.ts','✓  No warnings or errors'],
    test:      ['PASS  components/__tests__/Hero.test.jsx','PASS  lib/__tests__/api.test.ts','Test Suites: 12 passed','Tests: 42 passed, 0 failed'],
    build:    ['Creating an optimized production build...','Route (app)  Size  First Load','✓ Compiled successfully','Build time: 28.4s'],
    preview:   ['Deploying to Vercel preview...','Assigned URL: aifazi-git-main.vercel.app','Edge Network: 28 regions','✓ Preview ready'],
    production:['Promoting to production...','Assigning domain: aifazi.net','Purging CDN cache...','✓ Production live'],
  }

  useEffect(() => {
    const id = setInterval(() => {
      if (!visibleRef.current) return
      setStageProgress(p => {
        if (p >= 100) {
          const key = STAGES[activeStage].id
          const logs = STAGE_LOGS[key] || []
          setLogLines(prev => [...prev, ...logs].slice(-12))
          setParticles(pr => [...pr, { id: Date.now(), x: 130 + activeStage * 110, y: 200, t: 0 }])
          if (activeStage < STAGES.length - 1) {
            setCompleted(c => [...c, activeStage])
            setActiveStage(s => s + 1)
          } else {
            setTimeout(() => {
              setActiveStage(0); setCompleted([]); setLogLines(['> Starting new deployment...']); setRunCount(r => r + 1)
            }, 2000)
          }
          return 0
        }
        return p + (activeStage === 4 ? 1.4 : 2.2)
      })
      setParticles(pr => pr.map(p => ({ ...p, t: p.t + 0.06 })).filter(p => p.t < 1))
    }, 80)
    return () => clearInterval(id)
  }, [activeStage])

  return (
    <SvgWrap viewBox="0 0 900 480">
      {/* Background panel */}
      <rect x="20" y="20" width="860" height="440" rx="8" fill="var(--bg2)" stroke="var(--border)" strokeWidth="1"/>
      <rect x="20" y="20" width="860" height="3" rx="3" fill="var(--green)" opacity="0.5"/>

      {/* Title */}
      <text x="36" y="42" fontSize="7" letterSpacing="3" fontFamily="monospace" fill="var(--green)" opacity="0.5">DEPLOY PIPELINE · RUN #{runCount}</text>
      <circle cx="856" cy="32" r="4" className={tick%2===0?'led-g-on':'led-off'}/>

      {/* Pipeline stages */}
      {STAGES.map((s, i) => {
        const cx = 80 + i * 110
        const done = completedStages.includes(i)
        const active = activeStage === i
        const pending = !done && !active
        const color = done ? 'var(--green)' : active ? 'var(--cyan)' : 'var(--border)'
        const textColor = done ? 'var(--green)' : active ? 'var(--cyan)' : 'var(--muted)'
        return (
          <g key={s.id}>
            {/* Connector line */}
            {i < STAGES.length - 1 && (
              <line x1={cx + 30} y1="130" x2={cx + 80} y2="130"
                stroke={done ? 'var(--green)' : 'var(--border)'} strokeWidth="1.5" strokeDasharray={done ? 'none' : '4 3'}
                style={done ? { filter: 'drop-shadow(0 0 3px var(--green))' } : {}}/>
            )}
            {/* Stage box */}
            {active && <rect x={cx - 34} y="95" width="68" height="72" rx="8" fill="var(--cyan)" opacity="0.06"/>}
            <rect x={cx - 30} y="100" width="60" height="60" rx="6"
              fill="var(--bg3)" stroke={color} strokeWidth={active ? 1.5 : 0.8}
              style={active ? { filter: 'drop-shadow(0 0 8px var(--cyan))' } : {}}/>
            {/* Icon */}
            <text x={cx} y="128" textAnchor="middle" fontSize="16" fontFamily="monospace" fill={textColor}>{s.icon}</text>
            {/* Status indicator */}
            {done && <circle cx={cx + 24} cy="106" r="5" fill="var(--green)" style={{ filter: 'drop-shadow(0 0 4px var(--green))' }}/>}
            {done && <text x={cx + 24} y="109" textAnchor="middle" fontSize="6" fontFamily="monospace" fill="var(--bg)">✓</text>}
            {active && <circle cx={cx + 24} cy="106" r="5" fill="var(--cyan)" opacity={0.5 + (tick % 2) * 0.4}/>}
            {/* Label */}
            <text x={cx} y="172" textAnchor="middle" fontSize="6" letterSpacing="1" fontFamily="monospace" fill={textColor}>{s.label}</text>
            <text x={cx} y="182" textAnchor="middle" fontSize="5" fontFamily="monospace" fill="var(--muted)" opacity="0.6">{s.desc}</text>
            {/* Progress bar under active */}
            {active && (
              <g>
                <rect x={cx - 28} y="156" width="56" height="4" rx="2" fill="var(--bg4,var(--bg3))"/>
                <rect x={cx - 28} y="156" width={56 * stageProgress / 100} height="4" rx="2" fill="var(--cyan)" style={{ filter: 'drop-shadow(0 0 4px var(--cyan))' }}/>
                <text x={cx} y="152" textAnchor="middle" fontSize="5" fontFamily="monospace" fill="var(--cyan)">{Math.round(stageProgress)}%</text>
              </g>
            )}
          </g>
        )
      })}

      {/* Success burst particles */}
      {particles.map(p => (
        <g key={p.id}>
          {[0, 60, 120, 180, 240, 300].map((angle, j) => {
            const rad = angle * Math.PI / 180
            const dist = p.t * 40
            return <circle key={j} cx={p.x + Math.cos(rad) * dist} cy={p.y + Math.sin(rad) * dist}
              r={2 * (1 - p.t)} fill="var(--green)" opacity={1 - p.t} style={{ filter: 'drop-shadow(0 0 4px var(--green))' }}/>
          })}
        </g>
      ))}

      {/* Log terminal */}
      <rect x="36" y="210" width="828" height="230" rx="6" fill="var(--bg3)" stroke="var(--border)" strokeWidth="0.8"/>
      <rect x="36" y="210" width="828" height="2" rx="2" fill="var(--green)" opacity="0.4"/>
      <text x="48" y="225" fontSize="6" letterSpacing="2" fontFamily="monospace" fill="var(--green)" opacity="0.6">BUILD LOG</text>
      <circle cx="850" cy="220" r="3" fill="var(--green)" opacity="0.5"/>
      {/* Scan lines */}
      {Array.from({ length: 20 }, (_, i) => (
        <line key={i} x1="38" y1={228 + i * 10} x2="862" y2={228 + i * 10} stroke="var(--green)" strokeOpacity="0.02" strokeWidth="1"/>
      ))}
      {logLines.map((line, i) => (
        <text key={i} x="48" y={234 + i * 16} fontSize="6.5" fontFamily="monospace"
          fill={line.startsWith('✓') ? 'var(--green)' : line.startsWith('✗') ? '#ff4757' : line.startsWith('PASS') ? 'var(--cyan)' : 'var(--muted)'}
          opacity={Math.max(0.4, 1 - (logLines.length - 1 - i) * 0.07)}>
          {line}
        </text>
      ))}
      {/* Blinking cursor */}
      <rect x={48 + (logLines[logLines.length - 1]?.length || 0) * 3.9}
        y={226 + (logLines.length - 1) * 16} width="5" height="9" rx="1"
        fill="var(--green)" opacity={tick % 2 === 0 ? 1 : 0}/>
    </SvgWrap>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  MODE 3: SYSTEM MONITOR
// ─────────────────────────────────────────────────────────────────────────────
const SERVERS_MON = [
  { name:'SRV-01', role:'Web / Next.js' },
  { name:'SRV-02', role:'API / FastAPI' },
  { name:'SRV-03', role:'DB / Postgres' },
  { name:'SRV-04', role:'Cache / Redis' },
  { name:'SRV-05', role:'CDN Worker'    },
  { name:'SRV-06', role:'Job Queue'     },
]

function MiniSparkline({ history, color, x, y, w = 60, h = 20 }) {
    const max = 100, step = w / (history.length - 1)
    const d = history.map((v, i) => `${i === 0 ? 'M' : 'L'}${x + i * step},${y + h - (v / max) * h}`).join(' ')
    const area = d + ` L${x + w},${y + h} L${x},${y + h} Z`
    return (
      <g>
        <rect x={x} y={y} width={w} height={h} rx="2" fill="var(--bg4,var(--bg3))"/>
        <defs>
          <linearGradient id={`sg${color.replace(/[^a-z]/gi,'')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3"/>
            <stop offset="100%" stopColor={color} stopOpacity="0"/>
          </linearGradient>
          <clipPath id={`sc${x}${y}`}><rect x={x} y={y} width={w} height={h}/></clipPath>
        </defs>
        <path d={area} fill={`url(#sg${color.replace(/[^a-z]/gi,'')})`} clipPath={`url(#sc${x}${y})`}/>
        <path d={d} fill="none" stroke={color} strokeWidth="1.2" clipPath={`url(#sc${x}${y})`}
          style={{ filter: `drop-shadow(0 0 2px ${color})` }}/>
      </g>
    )
  }

  function Gauge({ x, y, r, value, color, label }) {
    const pct = value / 100, angle = pct * 180
    const startAngle = -180, endAngle = startAngle + angle
    const toRad = a => a * Math.PI / 180
    const sx = x + r * Math.cos(toRad(startAngle)), sy = y + r * Math.sin(toRad(startAngle))
    const ex = x + r * Math.cos(toRad(endAngle)), ey = y + r * Math.sin(toRad(endAngle))
    const large = angle > 180 ? 1 : 0
    return (
      <g>
        <path d={`M ${x - r} ${y} A ${r} ${r} 0 0 1 ${x + r} ${y}`} fill="none" stroke="var(--bg4,var(--bg3))" strokeWidth="8"/>
        <path d={`M ${sx} ${sy} A ${r} ${r} 0 ${large} 1 ${ex} ${ey}`} fill="none" stroke={color} strokeWidth="8"
          strokeLinecap="round" style={{ filter: `drop-shadow(0 0 4px ${color})` }}/>
        <text x={x} y={y + 6} textAnchor="middle" fontSize="10" fontWeight="bold" fontFamily="monospace" fill={color}>{Math.round(value)}%</text>
        <text x={x} y={y + 18} textAnchor="middle" fontSize="5.5" letterSpacing="1" fontFamily="monospace" fill="var(--muted)">{label}</text>
      </g>
    )
  }

function MonitorMode({ tick, visibleRef }) {
  const [metrics, setMetrics] = useState(() => SERVERS_MON.map(() => ({
    cpu: 20 + Math.random() * 50,
    mem: 30 + Math.random() * 45,
    disk: 40 + Math.random() * 40,
    net: Math.random() * 100,
    history: Array.from({ length: 20 }, () => 20 + Math.random() * 60),
    temp: 40 + Math.random() * 30,
    status: 'OK',
  })))
  const [selected, setSelected] = useState(0)

  useEffect(() => {
    const id = setInterval(() => {
      if (!visibleRef.current) return
      setMetrics(prev => prev.map((m, i) => {
        const newCpu = Math.max(5, Math.min(98, m.cpu + (Math.random() - 0.48) * 12))
        const newMem = Math.max(10, Math.min(95, m.mem + (Math.random() - 0.49) * 5))
        const newNet = Math.max(0, Math.min(100, m.net + (Math.random() - 0.5) * 20))
        return {
          ...m, cpu: newCpu, mem: newMem, net: newNet,
          temp: Math.max(35, Math.min(90, m.temp + (Math.random() - 0.49) * 3)),
          history: [...m.history.slice(1), newCpu],
          status: newCpu > 90 ? 'WARN' : newMem > 85 ? 'WARN' : 'OK',
        }
      }))
    }, 600)
    return () => clearInterval(id)
  }, [])

  const sel = metrics[selected]
  const srv = SERVERS_MON[selected]

  return (
    <SvgWrap viewBox="0 0 900 480">
      <rect x="20" y="20" width="860" height="440" rx="8" fill="var(--bg2)" stroke="var(--border)" strokeWidth="1"/>
      <text x="36" y="42" fontSize="7" letterSpacing="3" fontFamily="monospace" fill="var(--cyan)" opacity="0.5">SYSTEM MONITOR · LIVE</text>
      <circle cx="856" cy="32" r="4" className={tick%2===0?'led-g-on':'led-off'}/>

      {/* Server list */}
      {SERVERS_MON.map((s, i) => {
        const m = metrics[i]
        const isSelected = selected === i
        const statusColor = m.status === 'WARN' ? 'var(--orange)' : 'var(--green)'
        return (
          <g key={i} onClick={() => setSelected(i)} style={{ cursor: 'pointer' }}>
            <rect x="36" y={56 + i * 62} width="200" height="54" rx="5"
              fill={isSelected ? 'color-mix(in srgb, var(--cyan) 6%, transparent)' : 'var(--bg3)'}
              stroke={isSelected ? 'var(--cyan)' : 'var(--border)'} strokeWidth={isSelected ? 1.2 : 0.7}/>
            {/* Server name + status */}
            <circle cx="52" cy={69 + i * 62} r="4" fill={statusColor} style={{ filter: `drop-shadow(0 0 4px ${statusColor})` }}/>
            <text x="62" y={72 + i * 62} fontSize="7.5" fontWeight="bold" fontFamily="monospace" fill="var(--text)">{s.name}</text>
            <text x="62" y={82 + i * 62} fontSize="5.5" fontFamily="monospace" fill="var(--muted)">{s.role}</text>
            {/* Mini bars */}
            {[
              { label: 'CPU', val: m.cpu, color: m.cpu > 80 ? 'var(--orange)' : 'var(--cyan)' },
              { label: 'MEM', val: m.mem, color: m.mem > 80 ? 'var(--orange)' : 'var(--green)' },
              { label: 'NET', val: m.net, color: 'var(--cyan)' },
            ].map((bar, j) => (
              <g key={j}>
                <text x="38" y={96 + i * 62 + j * 0} fontSize="4.5" fontFamily="monospace" fill="var(--muted)">{bar.label}</text>
                <rect x="60" y={91 + i * 62} width="56" height="4" rx="2" fill="var(--bg4,var(--bg3))"/>
                <rect x="60" y={91 + i * 62} width={56 * bar.val / 100} height="4" rx="2" fill={bar.color} opacity="0.9"/>
                {/* Only show first bar's label position; compact them */}
              </g>
            ))}
            {/* Temp */}
            <text x="164" y={72 + i * 62} fontSize="6" fontFamily="monospace"
              fill={m.temp > 75 ? 'var(--orange)' : 'var(--muted)'}>{Math.round(m.temp)}°C</text>
            <text x="164" y={82 + i * 62} fontSize="5" fontFamily="monospace" fill={statusColor}>{m.status}</text>
          </g>
        )
      })}

      {/* Detail panel for selected server */}
      <rect x="256" y="52" width="600" height="406" rx="6" fill="var(--bg3)" stroke="var(--border)" strokeWidth="0.8"/>
      <rect x="256" y="52" width="600" height="2" rx="2" fill="var(--cyan)" opacity="0.5"/>
      <text x="272" y="70" fontSize="8" fontWeight="bold" fontFamily="monospace" fill="var(--text)">{srv.name}</text>
      <text x="330" y="70" fontSize="6" fontFamily="monospace" fill="var(--muted)">{srv.role}</text>

      {/* Big gauges */}
      {sel && <>
        <Gauge x={340} y={155} r={50} value={sel.cpu} color={sel.cpu > 80 ? 'var(--orange)' : 'var(--cyan)'} label="CPU"/>
        <Gauge x={490} y={155} r={50} value={sel.mem} color={sel.mem > 80 ? 'var(--orange)' : 'var(--green)'} label="MEMORY"/>
        <Gauge x={640} y={155} r={50} value={sel.disk} color="var(--cyan)" label="DISK"/>
        {/* CPU History sparkline */}
        <text x="272" y="210" fontSize="6" letterSpacing="2" fontFamily="monospace" fill="var(--muted)">CPU HISTORY</text>
        <MiniSparkline history={sel.history} color="var(--cyan)" x={272} y={215} w={170} h={60}/>
        {/* Net sparkline */}
        <text x="460" y="210" fontSize="6" letterSpacing="2" fontFamily="monospace" fill="var(--muted)">NET I/O</text>
        <MiniSparkline history={sel.history.map(v => v * 0.7 + ((v * 7.13) % 1) * 15)} color="var(--green)" x={460} y={215} w={170} h={60}/>
        {/* Stats grid */}
        {[
          { label:'UPTIME',  value: `${(tick * 0.06 + 12).toFixed(1)}h` },
          { label:'REQUESTS',value: `${((sel.cpu * 42 + tick) % 9000 + 1000).toFixed(0)}/s` },
          { label:'ERRORS',  value: sel.cpu > 85 ? `${Math.floor(sel.cpu - 80)}` : '0' },
          { label:'TEMP',    value: `${Math.round(sel.temp)}°C` },
          { label:'NETWORK', value: `${(sel.net * 0.01).toFixed(1)}Gbps` },
          { label:'PROCESSES',value:'142' },
        ].map((s, i) => (
          <g key={i}>
            <rect x={272 + (i % 3) * 192} y={292 + Math.floor(i / 3) * 54} width="180" height="46" rx="4"
              fill="var(--bg2)" stroke="var(--border)" strokeWidth="0.7"/>
            <text x={280 + (i % 3) * 192} y={308 + Math.floor(i / 3) * 54} fontSize="5.5" letterSpacing="2" fontFamily="monospace" fill="var(--muted)">{s.label}</text>
            <text x={280 + (i % 3) * 192} y={327 + Math.floor(i / 3) * 54} fontSize="13" fontWeight="bold" fontFamily="monospace"
              fill={s.label === 'ERRORS' && s.value !== '0' ? '#ff4757' : 'var(--cyan)'}
              style={{ filter: 'drop-shadow(0 0 4px var(--cyan))' }}>{s.value}</text>
          </g>
        ))}
      </>}
    </SvgWrap>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  MODE 4: THREAT MAP
// ─────────────────────────────────────────────────────────────────────────────
const THREAT_SOURCES = [
  { name:'RUSSIA',   x:540, y:130, color:'#ff4757' },
  { name:'CHINA',    x:640, y:165, color:'#ff4757' },
  { name:'IRAN',     x:555, y:180, color:'var(--orange)' },
  { name:'UKRAINE',  x:525, y:120, color:'var(--orange)' },
  { name:'BRAZIL',   x:255, y:265, color:'var(--orange)' },
  { name:'NIGERIA',  x:468, y:235, color:'#ff4757' },
  { name:'USA',      x:175, y:160, color:'var(--green)' },
  { name:'GERMANY',  x:478, y:118, color:'var(--green)' },
]
// Target: aifazi.net server location (Riyadh / Vercel Edge)
const TARGET = { x: 556, y: 192 }

function ThreatMode({ tick, visibleRef }) {
  const [attacks, setAttacks]     = useState([])
  const [blocked, setBlocked]     = useState(0)
  const [threatLog, setThreatLog] = useState([])
  const [ripples, setRipples]     = useState([])

  const ATTACK_TYPES = ['SQL_INJECT','XSS_ATTEMPT','BRUTE_FORCE','PORT_SCAN','DDOS_FLOOD','BOT_TRAFFIC']

  useEffect(() => {
    const id = setInterval(() => {
      if (!visibleRef.current) return
      // Spawn new attack
      if (Math.random() > 0.35) {
        const src = THREAT_SOURCES[Math.floor(Math.random() * THREAT_SOURCES.length)]
        const type = ATTACK_TYPES[Math.floor(Math.random() * ATTACK_TYPES.length)]
        const isGood = src.color === 'var(--green)'
        setAttacks(prev => [...prev, {
          id: Date.now() + Math.random(), src, t: 0, type, good: isGood,
        }])
        if (!isGood) {
          setThreatLog(prev => [...prev, {
            time: `${String(Math.floor(Date.now() / 1000) % 86400 / 3600 | 0).padStart(2,'0')}:${String(Math.floor(Date.now() / 1000) % 3600 / 60 | 0).padStart(2,'0')}`,
            src: src.name, type, color: src.color,
          }].slice(-8))
        }
      }
      setAttacks(prev => {
        const next = prev.map(a => ({ ...a, t: a.t + 0.035 }))
        const arrived = next.filter(a => a.t >= 1 && !a.good)
        if (arrived.length > 0) {
          setBlocked(b => b + arrived.length)
          setRipples(r => [...r, ...arrived.map(a => ({ id: Date.now() + Math.random(), t: 0 }))])
        }
        return next.filter(a => a.t < 1)
      })
      setRipples(prev => prev.map(r => ({ ...r, t: r.t + 0.05 })).filter(r => r.t < 1))
    }, 100)
    return () => clearInterval(id)
  }, [])

  // Simple equirectangular world map outline as paths
  const continents = [
    // North America
    'M 60,80 C 80,70 160,75 200,95 L 220,140 C 200,175 170,190 150,200 L 130,180 C 120,160 100,155 80,145 L 60,120 Z',
    // South America
    'M 195,200 C 210,195 245,200 260,220 L 270,280 C 265,310 250,325 235,320 L 220,300 C 210,275 195,255 192,235 Z',
    // Europe
    'M 450,70 C 480,65 510,70 525,90 L 520,115 C 510,120 495,118 480,115 L 460,105 C 452,95 448,82 450,70 Z',
    // Africa
    'M 455,155 C 480,148 510,155 525,170 L 535,220 C 530,255 515,275 500,278 L 480,270 C 465,255 455,235 452,215 L 450,180 Z',
    // Asia (simplified)
    'M 520,65 C 560,55 640,60 700,80 L 730,110 C 720,135 700,145 680,148 L 650,140 C 625,135 600,130 575,125 L 550,115 C 530,105 520,85 520,65 Z',
    // Australia
    'M 660,240 C 690,235 725,245 730,265 L 725,285 C 710,295 685,295 665,280 Z',
  ]

  return (
    <SvgWrap viewBox="0 0 900 480">
      <rect x="20" y="20" width="860" height="440" rx="8" fill="var(--bg2)" stroke="var(--border)" strokeWidth="1"/>
      <rect x="20" y="20" width="860" height="3" rx="3" fill="#ff4757" opacity="0.5"/>
      <text x="36" y="42" fontSize="7" letterSpacing="3" fontFamily="monospace" fill="#ff4757" opacity="0.5">THREAT MAP · REAL-TIME DEFENSE</text>
      <circle cx="856" cy="32" r="4" className={tick%3===0?'led-r-on':tick%3===1?'led-o-on':'led-off'}/>

      {/* Grid */}
      {Array.from({length:10},(_,i)=><line key={`h${i}`} x1="36" y1={55+i*38} x2="680" y2={55+i*38} stroke="var(--border)" strokeOpacity="0.2" strokeWidth="0.5"/>)}
      {Array.from({length:16},(_,i)=><line key={`v${i}`} x1={36+i*40} y1="55" x2={36+i*40} y2="435" stroke="var(--border)" strokeOpacity="0.2" strokeWidth="0.5"/>)}

      {/* Continents */}
      {continents.map((d, i) => (
        <path key={i} d={d} fill="var(--bg3)" stroke="var(--border)" strokeWidth="0.8" fillOpacity="0.8"/>
      ))}

      {/* Threat source dots */}
      {THREAT_SOURCES.map((s, i) => (
        <g key={i}>
          <circle cx={s.x} cy={s.y} r="5" fill={s.color} opacity="0.2"/>
          <circle cx={s.x} cy={s.y} r="3" fill={s.color} style={{ filter: `drop-shadow(0 0 4px ${s.color})` }}/>
          <text x={s.x} y={s.y - 8} textAnchor="middle" fontSize="5" fontFamily="monospace" fill={s.color} opacity="0.8">{s.name}</text>
        </g>
      ))}

      {/* Target: aifazi.net */}
      <circle cx={TARGET.x} cy={TARGET.y} r="18" fill="var(--green)" opacity="0.05"/>
      <circle cx={TARGET.x} cy={TARGET.y} r="12" fill="none" stroke="var(--green)" strokeWidth="1" strokeDasharray="3 3"
        style={{ animation: 'spin 8s linear infinite' }}/>
      <circle cx={TARGET.x} cy={TARGET.y} r="6" fill="var(--green)" opacity="0.3"/>
      <circle cx={TARGET.x} cy={TARGET.y} r="3" fill="var(--green)" style={{ filter: 'drop-shadow(0 0 6px var(--green))' }}/>
      <text x={TARGET.x} y={TARGET.y + 24} textAnchor="middle" fontSize="6" letterSpacing="1" fontFamily="monospace" fill="var(--green)">aifazi.net</text>

      {/* Shield ripples on block */}
      {ripples.map(r => (
        <circle key={r.id} cx={TARGET.x} cy={TARGET.y} r={10 + r.t * 40} fill="none"
          stroke="var(--green)" strokeWidth={2 * (1 - r.t)} opacity={0.8 * (1 - r.t)}/>
      ))}

      {/* Attack beams */}
      {attacks.map(a => {
        const t = a.t
        const cx = a.src.x + (TARGET.x - a.src.x) * t
        const cy = a.src.y + (TARGET.y - a.src.y) * t
        const color = a.good ? 'var(--green)' : a.src.color
        return (
          <g key={a.id}>
            <line x1={a.src.x} y1={a.src.y} x2={TARGET.x} y2={TARGET.y}
              stroke={color} strokeWidth="0.5" strokeOpacity={0.15} strokeDasharray="3 4"/>
            <circle cx={cx} cy={cy} r={a.good ? 2 : 3} fill={color}
              style={{ filter: `drop-shadow(0 0 5px ${color})` }} opacity={0.9}/>
          </g>
        )
      })}

      {/* Right panel — stats + log */}
      <rect x="698" y="52" width="182" height="390" rx="6" fill="var(--bg3)" stroke="var(--border)" strokeWidth="0.8"/>
      <rect x="698" y="52" width="182" height="2" fill="#ff4757" opacity="0.5"/>
      <text x="710" y="68" fontSize="6" letterSpacing="2" fontFamily="monospace" fill="var(--muted)">THREAT STATS</text>

      {/* Counter */}
      <rect x="710" y="76" width="158" height="52" rx="4" fill="var(--bg2)" stroke="var(--border)" strokeWidth="0.6"/>
      <text x="718" y="91" fontSize="5.5" letterSpacing="2" fontFamily="monospace" fill="var(--muted)">BLOCKED TODAY</text>
      <text x="718" y="116" fontSize="22" fontWeight="bold" fontFamily="monospace" fill="#ff4757"
        style={{ filter: 'drop-shadow(0 0 8px #ff4757)' }}>{blocked + 2847}</text>

      {[
        { label: 'ACTIVE',    val: attacks.filter(a => !a.good).length, color: '#ff4757' },
        { label: 'RATE',      val: `${(attacks.length * 6).toFixed(0)}/min`, color: 'var(--orange)' },
        { label: 'UPTIME',    val: '99.99%', color: 'var(--green)' },
        { label: 'FW RULES',  val: '2,847',  color: 'var(--cyan)' },
      ].map((s, i) => (
        <g key={i}>
          <rect x="710" y={140 + i * 42} width="158" height="34" rx="4" fill="var(--bg2)" stroke="var(--border)" strokeWidth="0.6"/>
          <text x="718" y={153 + i * 42} fontSize="5" letterSpacing="2" fontFamily="monospace" fill="var(--muted)">{s.label}</text>
          <text x="718" y={167 + i * 42} fontSize="11" fontWeight="bold" fontFamily="monospace" fill={s.color}>{s.val}</text>
        </g>
      ))}

      {/* Threat log */}
      <text x="710" y="320" fontSize="6" letterSpacing="1" fontFamily="monospace" fill="var(--muted)">RECENT THREATS</text>
      {threatLog.slice(-7).map((entry, i) => (
        <g key={i}>
          <text x="712" y={333 + i * 15} fontSize="5" fontFamily="monospace" fill={entry.color} opacity={0.5 + i * 0.07}>
            {entry.time} {entry.src}
          </text>
          <text x="712" y={342 + i * 15} fontSize="4.5" fontFamily="monospace" fill="var(--muted)" opacity={0.4 + i * 0.07}>
            {entry.type}
          </text>
        </g>
      ))}

      {/* Bottom status */}
      <rect x="36" y="440" width="644" height="30" rx="4" fill="var(--bg3)" stroke="var(--border)" strokeWidth="0.6"/>
      <circle cx="52" cy="455" r="4" fill="var(--green)" style={{ filter: 'drop-shadow(0 0 4px var(--green))' }}/>
      <text x="62" y="459" fontSize="6" fontFamily="monospace" fill="var(--green)">FIREWALL ACTIVE · ALL THREATS BLOCKED · SYSTEM SECURE</text>
      <text x="580" y="459" fontSize="6" fontFamily="monospace" fill="var(--muted)" suppressHydrationWarning>{new Date().toISOString().slice(0, 19).replace('T',' ')}</text>
    </SvgWrap>
  )
}


// ─────────────────────────────────────────────────────────────────────────────
//  MODE 5: NEURAL NET  (GSAP-powered)
// ─────────────────────────────────────────────────────────────────────────────
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
function AvatarMode({ visibleRef }) {
  const wrapRef   = useRef()
  const imgRef    = useRef()
  const ring1Ref  = useRef()
  const ring2Ref  = useRef()
  const ctxRef    = useRef()

  // Editable avatar image URL — admin can paste any URL
  const { value: avatarUrl, save: saveUrl, isAdmin } = useInlineEdit('hero.avatarUrl', '')
  const { value: savedFilter, save: saveFilter }     = useInlineEdit('hero.avatarFilter', 'normal')

  const [editMode,  setEditMode]  = useState(false)
  const [draftUrl,  setDraftUrl]  = useState('')
  const [imgErr,    setImgErr]    = useState(false)
  const [activeFilter, setActiveFilter] = useState(savedFilter || 'normal')

  // Sync saved filter
  const [prevSavedFilter, setPrevSavedFilter] = useState(savedFilter)
  if (prevSavedFilter !== savedFilter) {
    setPrevSavedFilter(savedFilter)
    if (savedFilter) setActiveFilter(savedFilter)
  }

  const FILTERS = [
    { id: 'normal',    label: 'NORMAL',    css: 'none' },
    { id: 'anime',     label: 'ANIME',     css: 'contrast(1.6) saturate(2.2) brightness(1.05) hue-rotate(5deg)' },
    { id: 'cyberpunk', label: 'CYBERPUNK', css: 'contrast(1.4) saturate(3) hue-rotate(280deg) brightness(1.1)' },
    { id: 'vintage',   label: 'VINTAGE',   css: 'sepia(0.75) contrast(1.1) brightness(0.95) saturate(0.8)' },
    { id: 'grayscale', label: 'B&W',       css: 'grayscale(1) contrast(1.2) brightness(1.05)' },
    { id: 'sketch',    label: 'SKETCH',    css: 'grayscale(1) contrast(2.5) brightness(1.3) saturate(0)' },
    { id: 'neon',      label: 'NEON',      css: 'saturate(4) contrast(1.3) brightness(1.2) hue-rotate(320deg)' },
    { id: 'thermal',   label: 'THERMAL',   css: 'sepia(1) hue-rotate(180deg) saturate(3) contrast(1.4)' },
    { id: 'retro',     label: 'RETRO',     css: 'sepia(0.5) saturate(1.5) contrast(1.2) brightness(0.9) hue-rotate(340deg)' },
    { id: 'hologram',  label: 'HOLOGRAM',  css: 'hue-rotate(160deg) saturate(2.5) contrast(1.3) brightness(1.15) opacity(0.9)' },
  ]

  const currentFilterCss = FILTERS.find(f => f.id === activeFilter)?.css || 'none'

  // ── GSAP: float + ring spin ──────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return
    import('gsap').then(m => {
      const gsap = m.gsap
      if (!wrapRef.current) return
      const ctx = gsap.context(() => {
        // Gentle float — bob up 18px then back
        gsap.to(imgRef.current, {
          y: -18,
          duration: 2.8,
          ease: 'sine.inOut',
          repeat: -1,
          yoyo: true,
        })
        // Outer ring slow spin
        if (ring1Ref.current) {
          gsap.to(ring1Ref.current, {
            rotation: 360,
            duration: 12,
            ease: 'none',
            repeat: -1,
            transformOrigin: '50% 50%',
          })
        }
        // Inner ring reverse spin + pulse
        if (ring2Ref.current) {
          gsap.to(ring2Ref.current, {
            rotation: -360,
            duration: 7,
            ease: 'none',
            repeat: -1,
            transformOrigin: '50% 50%',
          })
          gsap.to(ring2Ref.current, {
            opacity: 0.3,
            duration: 1.4,
            ease: 'sine.inOut',
            repeat: -1,
            yoyo: true,
          })
        }
        // Orb 1 drift
        gsap.to('#av-orb1', {
          x: 30, y: -20,
          duration: 5,
          ease: 'sine.inOut',
          repeat: -1,
          yoyo: true,
        })
        // Orb 2 drift
        gsap.to('#av-orb2', {
          x: -25, y: 25,
          duration: 6.5,
          ease: 'sine.inOut',
          repeat: -1,
          yoyo: true,
        })
        // Orb 3 drift
        gsap.to('#av-orb3', {
          x: 20, y: 15,
          duration: 4,
          ease: 'sine.inOut',
          repeat: -1,
          yoyo: true,
        })
        // Particle dots
        wrapRef.current.querySelectorAll('.av-particle').forEach((p, i) => {
          gsap.to(p, {
            y: -12 - i * 4,
            opacity: 0,
            duration: 1.8 + i * 0.3,
            ease: 'power1.out',
            repeat: -1,
            delay: i * 0.4,
            yoyo: false,
          })
        })
      }, wrapRef)
      ctxRef.current = ctx
    }).catch(() => {})
    return () => { try { ctxRef.current?.revert() } catch {} }
  }, [])

  // ── Mouse parallax tilt ──────────────────────────────────────────────────
  useEffect(() => {
    const wrap = wrapRef.current
    const img  = imgRef.current
    if (!wrap || !img) return
    const onMove = e => {
      const rect = wrap.getBoundingClientRect()
      const cx = rect.left + rect.width  / 2
      const cy = rect.top  + rect.height / 2
      const dx = (e.clientX - cx) / (rect.width  / 2)
      const dy = (e.clientY - cy) / (rect.height / 2)
      img.style.transform = `translateY(${img._floatY || 0}px) perspective(600px) rotateY(${dx * 8}deg) rotateX(${-dy * 5}deg)`
    }
    const onLeave = () => {
      img.style.transition = 'transform 0.6s ease'
      img.style.transform  = 'perspective(600px) rotateY(0) rotateX(0)'
      setTimeout(() => { img.style.transition = '' }, 600)
    }
    wrap.addEventListener('mousemove', onMove)
    wrap.addEventListener('mouseleave', onLeave)
    return () => { wrap.removeEventListener('mousemove', onMove); wrap.removeEventListener('mouseleave', onLeave) }
  }, [])

  const handleSave = () => {
    if (draftUrl.trim()) { saveUrl(draftUrl.trim()); setImgErr(false) }
    setEditMode(false)
  }

  // Particle positions
  const particles = [
    { x: '28%', y: '75%' }, { x: '68%', y: '80%' }, { x: '18%', y: '55%' },
    { x: '75%', y: '60%' }, { x: '45%', y: '82%' }, { x: '55%', y: '30%' },
  ]

  return (
    <div ref={wrapRef} style={{
      width: '100%', height: '100%', minHeight: 460,
      position: 'relative', overflow: 'hidden',
      background: 'var(--bg2)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'none',
    }}>
      {/* Top accent bar */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3,
        background: 'linear-gradient(90deg, var(--cyan), var(--green))', borderRadius: '8px 8px 0 0' }}/>

      {/* Title */}
      <div style={{ position: 'absolute', top: 16, left: 20,
        fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 3, color: 'var(--cyan)', opacity: 0.6 }}>
        AVATAR · HOLOGRAPHIC PRESENCE
      </div>

      {/* Swirling background orbs */}
      <div id="av-orb1" style={{
        position: 'absolute', width: 320, height: 320, borderRadius: '50%',
        background: 'radial-gradient(circle, color-mix(in srgb, var(--cyan) 12%, transparent) 0%, transparent 70%)',
        top: '10%', left: '5%', pointerEvents: 'none',
      }}/>
      <div id="av-orb2" style={{
        position: 'absolute', width: 280, height: 280, borderRadius: '50%',
        background: 'radial-gradient(circle, color-mix(in srgb, var(--green) 10%, transparent) 0%, transparent 70%)',
        bottom: '5%', right: '5%', pointerEvents: 'none',
      }}/>
      <div id="av-orb3" style={{
        position: 'absolute', width: 200, height: 200, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(255,71,87,0.07) 0%, transparent 70%)',
        top: '40%', right: '25%', pointerEvents: 'none',
      }}/>

      {/* Scanline overlay */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 10,
        background: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.04) 3px, rgba(0,0,0,0.04) 4px)',
      }}/>

      {/* Floating particles */}
      {particles.map((p, i) => (
        <div key={i} className="av-particle" style={{
          position: 'absolute', left: p.x, top: p.y,
          width: 3 + (i % 3), height: 3 + (i % 3), borderRadius: '50%',
          background: i % 2 === 0 ? 'var(--cyan)' : 'var(--green)',
          opacity: 0.5, boxShadow: `0 0 6px ${i % 2 === 0 ? 'var(--cyan)' : 'var(--green)'}`,
          pointerEvents: 'none', zIndex: 2,
        }}/>
      ))}

      {/* Avatar container */}
      <div style={{ position: 'relative', zIndex: 5, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>

        {/* Spinning outer ring */}
        <div style={{ position: 'relative', width: 240, height: 240 }}>

          {/* Outer dashed ring */}
          <div ref={ring1Ref} style={{
            position: 'absolute', inset: -14,
            borderRadius: '50%',
            border: '1.5px dashed color-mix(in srgb, var(--cyan) 35%, transparent)',
          }}/>

          {/* Inner glow ring with gap markers */}
          <div ref={ring2Ref} style={{
            position: 'absolute', inset: -6,
            borderRadius: '50%',
            border: '2px solid transparent',
            background: 'linear-gradient(var(--bg2), var(--bg2)) padding-box, linear-gradient(135deg, var(--cyan), var(--green), var(--cyan)) border-box',
            opacity: 0.7,
          }}/>

          {/* Avatar image */}
          <div ref={imgRef} style={{
            width: 240, height: 240,
            borderRadius: '50%',
            overflow: 'hidden',
            position: 'relative',
            boxShadow: '0 0 40px color-mix(in srgb, var(--cyan) 20%, transparent), 0 0 80px color-mix(in srgb, var(--green) 10%, transparent), 0 20px 60px rgba(0,0,0,0.5)',
            willChange: 'transform',
          }}>
            {!imgErr && avatarUrl && avatarUrl.trim() !== '' ? (
              <img
                src={avatarUrl.trim()}
                alt="Avatar"
                onError={() => setImgErr(true)}
                style={{
                  width: '100%', height: '100%', objectFit: 'cover', display: 'block',
                  filter: currentFilterCss,
                  transition: 'filter 0.4s ease',
                }}
              />
            ) : (
              /* Placeholder — pulsing neon silhouette */
              <div style={{
                width: '100%', height: '100%',
                background: 'linear-gradient(135deg, var(--bg3), var(--bg2))',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}>
                <div style={{ fontSize: 64, opacity: 0.3 }}>◐</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', letterSpacing: 2, textAlign: 'center', whiteSpace: 'pre-line' }}>
                  {imgErr
                    ? 'IMAGE FAILED TO LOAD\nCHECK URL OR CORS'
                    : isAdmin
                      ? 'CLICK "CHANGE IMAGE URL"\nPASTE DIRECT IMAGE LINK'
                      : 'NO AVATAR SET'}
                </div>
              </div>
            )}
          </div>

          {/* Corner accent dots on the ring */}
          {[0, 90, 180, 270].map(deg => (
            <div key={deg} style={{
              position: 'absolute',
              width: 8, height: 8, borderRadius: '50%',
              background: deg % 180 === 0 ? 'var(--cyan)' : 'var(--green)',
              boxShadow: `0 0 8px ${deg % 180 === 0 ? 'var(--cyan)' : 'var(--green)'}`,
              top:  '50%', left: '50%',
              transform: `rotate(${deg}deg) translateX(126px) translate(-50%, -50%)`,
            }}/>
          ))}
        </div>

        {/* Name + status row */}
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700,
            color: 'var(--text)', letterSpacing: 2 }}>
            TANVIR AIFAZI
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)',
              boxShadow: '0 0 6px var(--green)', display: 'inline-block', animation: 'glow-pulse 2s infinite' }}/>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--green)', letterSpacing: 2 }}>
               REMOTELY AVAILABLE
            </span>
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', letterSpacing: 1 }}>
            IT SPECIALIST · NETWORK SPECIALIST · AI ENTHUSIAST
          </div>
        </div>

        {/* Filter picker — always visible when image is set */}
        {avatarUrl && avatarUrl.trim() !== '' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, width: '100%' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', letterSpacing: 2 }}>
              IMAGE FILTER
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', maxWidth: 400 }}>
              {FILTERS.map(f => (
                <button key={f.id} onClick={() => {
                  setActiveFilter(f.id)
                  if (isAdmin) saveFilter(f.id)
                }} style={{
                  fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1,
                  padding: '4px 10px', borderRadius: 2, cursor: 'pointer',
                  border: `1px solid ${activeFilter === f.id ? 'var(--cyan)' : 'var(--border)'}`,
                  background: activeFilter === f.id ? 'color-mix(in srgb, var(--cyan) 12%, transparent)' : 'transparent',
                  color: activeFilter === f.id ? 'var(--cyan)' : 'var(--muted)',
                  transition: 'all 0.2s',
                }}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Admin: edit image URL button */}
        {isAdmin && !editMode && (
          <button
            onClick={() => { setDraftUrl(avatarUrl || ''); setEditMode(true) }}
            style={{
              fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2,
              padding: '6px 14px', background: 'color-mix(in srgb, var(--cyan) 8%, transparent)',
              color: 'var(--cyan)', border: '1px solid color-mix(in srgb, var(--cyan) 30%, transparent)',
              borderRadius: 2, cursor: 'pointer',
            }}>
            ✎ CHANGE IMAGE URL
          </button>
        )}

        {/* URL input (edit mode) */}
        {isAdmin && editMode && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', width: '100%', maxWidth: 320 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', letterSpacing: 1 }}>
              PASTE IMAGE URL (jpg, png, webp, gif)
            </div>
            <input
              type="text"
              value={draftUrl}
              onChange={e => setDraftUrl(e.target.value)}
              placeholder="https://example.com/avatar.jpg"
              autoFocus
              style={{
                width: '100%', fontFamily: 'var(--font-mono)', fontSize: 11,
                padding: '8px 12px', background: 'var(--comp-input-bg, var(--bg3))',
                border: '1px solid var(--comp-input-focus-border, var(--cyan))', color: 'var(--text)',
                borderRadius: 'var(--comp-input-radius, 2px)', outline: 'none',
              }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleSave} style={{
                fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2,
                padding: '6px 14px', background: 'var(--comp-btn-bg, var(--green))',
                color: 'var(--comp-btn-text, #000)', border: 'var(--comp-btn-border, none)', borderRadius: 'var(--comp-btn-radius, 2px)', boxShadow: 'var(--comp-btn-shadow, none)', cursor: 'pointer', fontWeight: 700,
              }}>SAVE</button>
              <button onClick={() => setEditMode(false)} style={{
                fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2,
                padding: '6px 14px', background: 'transparent',
                color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 2, cursor: 'pointer',
              }}>CANCEL</button>
            </div>
          </div>
        )}
      </div>

      {/* Footer bar */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 28,
        borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center',
        padding: '0 20px', gap: 12, background: 'rgba(0,0,0,0.2)' }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)',
          boxShadow: '0 0 6px var(--green)', flexShrink: 0 }}/>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--green)', letterSpacing: 1 }}>
          HOLOGRAPHIC PRESENCE ACTIVE · IDENTITY VERIFIED · SECURE CONNECTION
        </span>
      </div>
    </div>
  )
}


// ─────────────────────────────────────────────────────────────────────────────
//  MODE 8: GLOBE — COBE WebGL network globe
//  Great-circle arcs · glowing city nodes · drag-to-rotate · scroll-to-zoom
//  Theme-synced · visitor HUD via CSS Anchor Positioning when available
// ─────────────────────────────────────────────────────────────────────────────

// Read a CSS variable from the root element (falls back gracefully)
function cssVar(name, fallback) {
  if (typeof window === 'undefined') return fallback
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}

const LIGHT_THEME_IDS = new Set([
  'light','cyber-light',
  'midnight-light','crimson-light','ocean-light','amber-light',
  'rose-light','forest-light','glass-light','synthwave-light',
  'terminal-light','neon-noir-light','aurora-light',
  'brutalist','paper','neumorph','macos','pastel','win95',
  // Additional light variants discovered in theme-library.css
  'cobalt-light','ember-light','honey-light','ice-light','lava-light',
  'mario-light','minecraft-light','pacman-light','slate-light','sonic-light',
  'teal-light','toxic-light','violet-light',
])

// Prefer luminance over the ID list so new themes stay in sync automatically.
function isLightFromLuminance(rgbCsv) {
  const p = String(rgbCsv || '').split(',').map(Number)
  if (p.length < 3 || p.some(n => !Number.isFinite(n))) return false
  // Rec. 709 relative luminance approximation on 0–255 channels
  return (0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]) > 140
}

function readGlobeTheme() {
  if (typeof window === 'undefined') return {
    cyanRgb: '0,212,255', greenRgb: '0,255,136', bgRgb: '0,12,28',
    isLight: false, textRgb: '200,216,232', mutedRgb: '107,130,150', orangeRgb: '255,107,53',
  }
  const themeAttr = document.documentElement.getAttribute('data-theme') || ''
  const hexToRgb = (hex, fb) => {
    if (!hex) return fb
    const m6 = hex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
    if (m6) return `${parseInt(m6[1],16)},${parseInt(m6[2],16)},${parseInt(m6[3],16)}`
    const m3 = hex.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i)
    if (m3) return `${parseInt(m3[1]+m3[1],16)},${parseInt(m3[2]+m3[2],16)},${parseInt(m3[3]+m3[3],16)}`
    const mr = hex.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i)
    if (mr) return `${mr[1]},${mr[2]},${mr[3]}`
    return fb
  }
  const rawBg = cssVar('--bg', '')
  const parsedBg = hexToRgb(rawBg, null)
  // Luminance of the real --bg wins; fall back to ID list / system preference.
  const isLight = parsedBg
    ? isLightFromLuminance(parsedBg)
    : (LIGHT_THEME_IDS.has(themeAttr) || (!themeAttr && window.matchMedia('(prefers-color-scheme: light)').matches))
  const read = (prop, darkDef, lightDef) => {
    const raw = cssVar(prop, '')
    return hexToRgb(raw || null, isLight ? lightDef : darkDef)
  }
  const cyanRgb   = read('--cyan',    '0,212,255',  '0,93,143')
  const greenRgb  = read('--green',   '0,255,136',  '0,110,56')
  const bgRgb      = (() => {
    if (!parsedBg) return isLight ? '200,214,228' : '0,12,28'
    const p = parsedBg.split(',').map(Number)
    return (p[0] + p[1] + p[2]) > 400 && !isLight ? '2,10,24' : parsedBg
  })()
  const textRgb    = read('--text',    '200,216,232', '10,21,32')
  const mutedRgb   = read('--muted',    '107,130,150', '74,100,120')
  const orangeRgb  = read('--orange',  '255,107,53',  '184,68,22')
  return { cyanRgb, greenRgb, bgRgb, isLight, textRgb, mutedRgb, orangeRgb }
}

// Bindable city nodes — `id` drives CSS Anchor Positioning labels.
const GLOBE_CITIES = [
  { id: 'nyc',  name: 'NEW YORK',   lat:  40.7, lng:  -74.0, hub: false, region: 'NA'  },
  { id: 'lon',  name: 'LONDON',     lat:  51.5, lng:   -0.1, hub: false, region: 'EU'  },
  { id: 'tyo',  name: 'TOKYO',      lat:  35.7, lng:  139.7, hub: false, region: 'APAC'},
  { id: 'dxb',  name: 'DUBAI',      lat:  25.2, lng:   55.3, hub: false, region: 'MEA' },
  { id: 'sin',  name: 'SINGAPORE',  lat:   1.3, lng:  103.8, hub: false, region: 'APAC'},
  { id: 'gru',  name: 'SAO PAULO',  lat: -23.5, lng:  -46.6, hub: false, region: 'LATAM'},
  { id: 'syd',  name: 'SYDNEY',     lat: -33.9, lng:  151.2, hub: false, region: 'APAC'},
  { id: 'cdg',  name: 'PARIS',      lat:  48.9, lng:    2.3, hub: false, region: 'EU'  },
  { id: 'bom',  name: 'MUMBAI',     lat:  19.1, lng:   72.9, hub: false, region: 'APAC'},
  { id: 'ruh',  name: 'RIYADH',     lat:  24.7, lng:   46.7, hub: true,  region: 'MEA' },
  { id: 'yyz',  name: 'TORONTO',    lat:  43.7, lng:  -79.4, hub: false, region: 'NA'  },
  { id: 'fra',  name: 'FRANKFURT',  lat:  50.1, lng:    8.7, hub: false, region: 'EU'  },
]

// Edge list [fromIdx, toIdx]; hub routes get a distinct arc color + label.
const GLOBE_CONNECTIONS = [
  { from: 0,  to: 1,  hub: false },
  { from: 1,  to: 7,  hub: false },
  { from: 0,  to: 10, hub: true  },
  { from: 1,  to: 11, hub: true  },
  { from: 2,  to: 8,  hub: false },
  { from: 3,  to: 9,  hub: true  },
  { from: 3,  to: 1,  hub: false },
  { from: 8,  to: 4,  hub: false },
  { from: 4,  to: 2,  hub: false },
  { from: 5,  to: 0,  hub: false },
  { from: 6,  to: 4,  hub: false },
  { from: 9,  to: 3,  hub: true  },
  { from: 11, to: 7,  hub: false },
  { from: 0,  to: 3,  hub: false },
  { from: 9,  to: 8,  hub: true  },
  { from: 2,  to: 6,  hub: false },
  { from: 9,  to: 1,  hub: true  },
  { from: 4,  to: 6,  hub: false },
]

// Progressive-enhancement gate for CSS Anchor Positioning labels.
function supportsCssAnchors() {
  if (typeof CSS === 'undefined' || !CSS.supports) return false
  return CSS.supports('anchor-name: --cobe-probe') || CSS.supports('position-anchor: --cobe-probe')
}

// Center a lat/lng in COBE's view (phi = longitude spin, theta = latitude tilt).
function cityToAngles(lat, lng) {
  return {
    phi: -lng * Math.PI / 180,
    theta: Math.max(-1.1, Math.min(1.1, lat * Math.PI / 180)),
  }
}

const GLOBE_MIN_ZOOM = 0.55
const GLOBE_MAX_ZOOM = 1.35
const GLOBE_BASE_RATIO = 0.36
const GLOBE_MAX_RATIO = 0.44

function clampGlobeZoom(value) {
  const safeMax = Math.max(0.8, Math.min(GLOBE_MAX_ZOOM, GLOBE_MAX_RATIO / GLOBE_BASE_RATIO))
  return Math.max(GLOBE_MIN_ZOOM, Math.min(safeMax, value))
}

function firstGeoValue(...values) {
  const found = values.find(v => v !== undefined && v !== null && String(v).trim() !== '')
  return found === undefined ? '—' : String(found).trim()
}

// Mask public IP: keep first two octets, hide the rest (87.201.x.x)
function maskIp(ip) {
  if (!ip || ip === '—') return '—'
  const parts = String(ip).split('.')
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.x.x`
  return String(ip).slice(0, 3) + '…'
}

/** HUD telemetry callout — reticle frame, location headline, fact chips, hover details. */
function VisitorHud({ visitor }) {
  const [open, setOpen] = useState(false)

  if (!visitor) {
    return (
      <div className="globe-visitor-shell" style={{
        position: 'absolute', bottom: 12, left: 14, zIndex: 3,
        pointerEvents: 'none',
      }}>
        <div className="globe-visitor-card" style={{
          borderRadius: 4, padding: '8px 12px',
          fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)',
          letterSpacing: 1.5,
        }}>
          <span style={{ color: 'var(--green)', marginRight: 8 }}>◉</span>
          LOCATING…
        </div>
      </div>
    )
  }

  const place = [visitor.city, visitor.country].filter(v => v && v !== '—').join(', ') || 'Unknown'
  const chips = [
    visitor.ipType && visitor.ipType !== '—' ? visitor.ipType : null,
    visitor.tz && visitor.tz !== '—' ? visitor.tz : null,
    visitor.asn && visitor.asn !== '—' ? visitor.asn : null,
  ].filter(Boolean)

  const details = [
    ['IP',        maskIp(visitor.ip)],
    ['LOCATION',  visitor.address || place],
    ['REGION',    visitor.region],
    ['COORDS',    visitor.lat !== '—' ? `${visitor.lat}°, ${visitor.lon}°` : '—'],
    ['TZ',        [visitor.tz, visitor.utc].filter(v => v && v !== '—').join(' ')],
    ['ISP',       visitor.org],
    ['NETWORK',   visitor.network],
  ].filter(([, v]) => v && v !== '—')

  const hasCoords = Number.isFinite(+visitor.lat) && Number.isFinite(+visitor.lon) && visitor.lat !== '—'

  return (
    <div
      className="globe-visitor-shell"
      data-anchored={hasCoords ? 'true' : undefined}
      style={{
        position: 'absolute',
        // Default corner placement; CSS anchor rules override via [data-anchored]
        bottom: 12,
        left: 14,
        zIndex: 4,
        maxWidth: 'calc(100% - 28px)',
      }}
    >
      <div
        className="globe-visitor-card"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        tabIndex={0}
        role="status"
        aria-label={`Visitor telemetry: ${place}`}
        style={{
          position: 'relative',
          borderRadius: 4,
          padding: '10px 14px 11px',
          minWidth: 220,
          maxWidth: 320,
          cursor: 'default',
          outline: 'none',
        }}
      >
        {/* Corner brackets — targeting reticle */}
        {[
          { top: -1, left: -1, borderTop: '1.5px solid var(--cyan)', borderLeft: '1.5px solid var(--cyan)' },
          { top: -1, right: -1, borderTop: '1.5px solid var(--cyan)', borderRight: '1.5px solid var(--cyan)' },
          { bottom: -1, left: -1, borderBottom: '1.5px solid var(--cyan)', borderLeft: '1.5px solid var(--cyan)' },
          { bottom: -1, right: -1, borderBottom: '1.5px solid var(--cyan)', borderRight: '1.5px solid var(--cyan)' },
        ].map((s, i) => (
          <span key={i} aria-hidden style={{
            position: 'absolute', width: 10, height: 10,
            pointerEvents: 'none', opacity: 0.85, ...s,
          }} />
        ))}

        {/* Status row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
          <span aria-hidden style={{
            width: 6, height: 6, borderRadius: '50%',
            background: 'var(--green)',
            boxShadow: '0 0 8px var(--green)',
            animation: 'hudPulse 1.8s ease-in-out infinite',
            flexShrink: 0,
          }} />
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 11,
            color: 'var(--green)', letterSpacing: 2, fontWeight: 700,
          }}>LIVE</span>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 11,
            color: 'var(--muted)', letterSpacing: 1.2, marginLeft: 'auto',
          }}>{visitor.updatedAt || 'NOW'}</span>
        </div>

        {/* Location headline */}
        <div style={{
          fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700,
          color: 'var(--text)', lineHeight: 1.2, letterSpacing: -0.2,
          marginBottom: 2, wordBreak: 'break-word',
        }}>
          {visitor.flag && visitor.flag !== '—' ? visitor.flag + ' ' : ''}{place}
        </div>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 11,
          color: 'var(--muted)', letterSpacing: 0.4, marginBottom: 8,
        }}>
          {maskIp(visitor.ip)}{visitor.ipType && visitor.ipType !== '—' ? ` · ${visitor.ipType}` : ''}
        </div>

        {/* Fact chips */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {chips.map(c => (
            <span key={c} style={{
              fontFamily: 'var(--font-mono)', fontSize: 11,
              color: 'var(--cyan)',
              background: 'color-mix(in srgb, var(--cyan) 10%, transparent)',
              border: '1px solid color-mix(in srgb, var(--cyan) 28%, transparent)',
              borderRadius: 3, padding: '2px 7px', letterSpacing: 0.3,
              whiteSpace: 'nowrap',
            }}>{c}</span>
          ))}
        </div>

        {/* Expanded details — hover / focus */}
        <div style={{
          display: 'grid',
          gridTemplateRows: open ? '1fr' : '0fr',
          transition: 'grid-template-rows 0.28s var(--ease-out, ease), opacity 0.22s ease',
          opacity: open ? 1 : 0,
          marginTop: open ? 9 : 0,
        }}>
          <div style={{ overflow: 'hidden' }}>
            <div style={{
              borderTop: '1px solid color-mix(in srgb, var(--cyan) 18%, transparent)',
              paddingTop: 8,
              display: 'grid', gridTemplateColumns: '64px minmax(0, 1fr)',
              columnGap: 8, rowGap: 3,
            }}>
              {details.map(([label, val]) => (
                <div key={label} style={{ display: 'contents' }}>
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: 11,
                    color: 'var(--muted)', letterSpacing: 1, lineHeight: 1.45,
                  }}>{label}</span>
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: 11,
                    color: 'var(--cyan)', fontWeight: 600, lineHeight: 1.45,
                    wordBreak: 'break-word',
                  }}>{val}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes hudPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.45; transform: scale(0.85); }
        }
        .globe-visitor-card:focus-visible {
          outline: 2px solid var(--green);
          outline-offset: 2px;
        }
        /* CSS Anchor Positioning — lock the HUD to the COBE visitor marker when
           the browser supports it; otherwise the shell stays bottom-left.
           !important beats the inline corner placement on the shell. */
        @supports (anchor-name: --cobe-visitor) {
          .globe-visitor-shell[data-anchored='true'] {
            position: absolute !important;
            position-anchor: --cobe-visitor;
            bottom: calc(anchor(top) + 10px) !important;
            left: anchor(center) !important;
            right: auto !important;
            top: auto !important;
            translate: -50% 0;
            opacity: var(--cobe-visible-visitor, 1);
            transition: opacity 0.3s ease;
            max-width: min(320px, calc(100% - 28px)) !important;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .globe-visitor-card span[style*="hudPulse"] { animation: none !important; }
        }
      `}</style>
    </div>
  )
}

// ── COBE-based globe — full v2 feature surface ───────────────────────────────
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
  const [visitorTrail, setVisitorTrail] = useState([])
  const [themeKey, setThemeKey] = useState(0)
  const themeRef = useRef(null)
  const [focusCity, setFocusCity] = useState(null)
  const [selectedNode, setSelectedNode] = useState(null)
  const [anchorsOk] = useState(() => supportsCssAnchors())
  const [latencyMs, setLatencyMs] = useState(12)
  const [autoRotate, setAutoRotate] = useState(true)
  const autoRotateRef = useRef(true)
  const [packetsOn, setPacketsOn] = useState(true)
  const packetsOnRef = useRef(true)
  const [routeLog, setRouteLog] = useState([])
  const routeLogRef = useRef([])
  const [fps, setFps] = useState(60)
  const fpsRef = useRef({ samples: 0, last: 0, avg: 60 })
  const [perfTier, setPerfTier] = useState(() => {
    const cores = navigator.hardwareConcurrency || 4
    const dpr = window.devicePixelRatio || 1
    const small = Math.min(window.innerWidth, window.innerHeight) < 700
    if (cores <= 4 || small || dpr > 2.2) return 'low'
    if (cores <= 6) return 'med'
    return 'high'
  })
  const perfTierRef = useRef(perfTier)
  useEffect(() => { perfTierRef.current = perfTier }, [perfTier])
  const [themeTone, setThemeTone] = useState('dark')
  const [monitor, setMonitor] = useState(null)
  const radarRef = useRef()
  const stateRef  = useRef({
    phi: 0.55,
    theta: 0.18,
    velPhi: 0.0022,
    velPhiDamp: 0,
    velThetaDamp: 0,
    drag: null,
    zoom: 1.0,
    pinch: null,
    focusAnim: null,
    packetT: 0,
  })

  useEffect(() => { visitorRef.current = visitor }, [visitor])
  useEffect(() => { autoRotateRef.current = autoRotate }, [autoRotate])
  useEffect(() => { packetsOnRef.current = packetsOn }, [packetsOn])

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
          if (!cancelled) {
            setVisitor(parsed)
            // Keep a short trail of prior visits (this session) for ghost markers.
            if (Number.isFinite(+parsed.lat) && parsed.lat !== '—') {
              setVisitorTrail(prev => {
                const next = [{ lat: +parsed.lat, lon: +parsed.lon, id: `v${Date.now()}` }, ...prev]
                return next.slice(0, 5)
              })
            }
          }
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

  // ── Live latency ticker (cosmetic telemetry) ──
  useEffect(() => {
    const id = setInterval(() => {
      setLatencyMs(9 + Math.floor(Math.random() * 9))
    }, 2800)
    return () => clearInterval(id)
  }, [])

  // ── Real traffic feed — pull live service status when available ──
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch('/api/monitor/status', { credentials: 'same-origin' })
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled && data && Array.isArray(data.services)) {
          const ups = data.services.filter(s => s.status === 'up')
          const latencies = ups.map(s => s.latency_avg_ms ?? s.latency_ms).filter(n => Number.isFinite(n))
          const avg = latencies.length
            ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
            : null
          setMonitor({
            overall: data.overall || 'unknown',
            up: ups.length,
            total: data.services.length,
            avgMs: avg,
            uptime: ups.length && data.services.length
              ? (ups.length / data.services.length * 100).toFixed(2)
              : null,
          })
          if (avg != null) setLatencyMs(avg)
        }
      } catch { /* offline or endpoint unavailable — keep ticker values */ }
    }
    load()
    const id = setInterval(load, 45000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  // ── React to theme changes ──
  useEffect(() => {
    themeRef.current = readGlobeTheme()
    setThemeTone(themeRef.current.isLight ? 'light' : 'dark')
    const el = document.documentElement
    const obs = new MutationObserver(() => {
      themeRef.current = readGlobeTheme()
      setThemeTone(themeRef.current.isLight ? 'light' : 'dark')
      setThemeKey(k => k + 1)
    })
    obs.observe(el, { attributes: true, attributeFilter: ['data-theme', 'style'] })
    return () => obs.disconnect()
  }, [])

  // ── Mini radar — draw node azimuths on a tiny canvas ──
  useEffect(() => {
    const cv = radarRef.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    let raf = 0
    let sweep = 0
    const draw = () => {
      raf = requestAnimationFrame(draw)
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = 64, h = 64
      if (cv.width !== w * dpr) { cv.width = w * dpr; cv.height = h * dpr }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      const cx = w / 2, cy = h / 2, r = 26

      // Rings
      ctx.strokeStyle = 'rgba(0,212,255,0.18)'
      ctx.lineWidth = 1
      for (const rr of [r * 0.33, r * 0.66, r]) {
        ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.stroke()
      }
      // Crosshair
      ctx.beginPath()
      ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy)
      ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r)
      ctx.stroke()

      // Sweep
      sweep = (sweep + 0.025) % (Math.PI * 2)
      const grad = ctx.createConicGradient
        ? ctx.createConicGradient(sweep, cx, cy)
        : null
      if (grad) {
        grad.addColorStop(0, 'rgba(0,255,136,0.35)')
        grad.addColorStop(0.12, 'rgba(0,255,136,0)')
        grad.addColorStop(1, 'rgba(0,255,136,0)')
        ctx.fillStyle = grad
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill()
      }
      // Sweep line
      ctx.strokeStyle = 'rgba(0,255,136,0.55)'
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(cx + Math.cos(sweep) * r, cy + Math.sin(sweep) * r)
      ctx.stroke()

      // Node blips (azimuth from longitude, radius from |latitude|)
      const s = stateRef.current
      GLOBE_CITIES.forEach(c => {
        const az = (c.lng / 180) * Math.PI + s.phi
        const rad = (Math.abs(c.lat) / 90) * r * 0.92
        const x = cx + Math.cos(az) * rad
        const y = cy + Math.sin(az) * rad * 0.7
        const d = Math.hypot(x - cx, y - cy)
        if (d > r) return
        ctx.fillStyle = c.hub ? '#00ff88' : '#00d4ff'
        ctx.globalAlpha = c.hub ? 0.95 : 0.7
        ctx.beginPath(); ctx.arc(x, y, c.hub ? 2.4 : 1.5, 0, Math.PI * 2); ctx.fill()
        ctx.globalAlpha = 1
      })
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [])

  // ── Export node map as PNG ──
  const exportPng = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    try {
      const url = canvas.toDataURL('image/png')
      const a = document.createElement('a')
      a.href = url
      a.download = `globe-network-${new Date().toISOString().slice(0, 10)}.png`
      document.body.appendChild(a)
      a.click()
      a.remove()
    } catch { /* tainted canvas or unsupported */ }
  }

  // ── Animate to a city (focus recipe) ──
  const focusOnCity = (city) => {
    const s = stateRef.current
    const { phi, theta } = cityToAngles(city.lat, city.lng)
    // Shortest angular path for phi
    let toPhi = phi
    while (toPhi - s.phi > Math.PI) toPhi -= Math.PI * 2
    while (s.phi - toPhi > Math.PI) toPhi += Math.PI * 2
    s.focusAnim = {
      fromPhi: s.phi, fromTheta: s.theta,
      toPhi, toTheta: theta,
      t0: 0, // stamped on the first rAF tick
      dur: 900,
    }
    s.velPhi = 0
    s.velPhiDamp = 0
    setFocusCity(city.id)
    setSelectedNode(city)
  }

  // ── COBE globe instance (recreated on theme / visitor / resize / trail) ──
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || typeof createGlobe !== 'function') return
    if (!themeRef.current) themeRef.current = readGlobeTheme()

    const theme = themeRef.current
    const v = visitorRef.current
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    // COBE multiplies width/height by devicePixelRatio internally — pass CSS pixels.
    const rect = canvas.getBoundingClientRect()
    const width = Math.max(240, Math.floor(rect.width || wrapRef.current?.clientWidth || 480))
    const height = Math.max(240, Math.floor(rect.height || wrapRef.current?.clientHeight || 360))

    const cyan   = rgbToArr(theme.cyanRgb,  '0,212,255')
    const green  = rgbToArr(theme.greenRgb, '0,255,136')
    const orange = rgbToArr(theme.orangeRgb, '255,107,53')
    const bg     = rgbToArr(theme.bgRgb, '0,12,28')

    // Bindable markers — every city gets an id for CSS anchors + labels.
    // Keep nodes small and crisp; hub is only slightly larger.
    const markers = GLOBE_CITIES.map(c => ({
      id: c.id,
      location: [c.lat, c.lng],
      size: c.hub ? 0.072 : 0.038,
      color: c.hub ? green : cyan,
    }))

    // Ghost trail markers (prior visitor fixes this session)
    visitorTrail.forEach((t, i) => {
      markers.push({
        id: `trail-${i}`,
        location: [t.lat, t.lon],
        size: Math.max(0.014, 0.028 - i * 0.004),
        color: [orange[0] * 0.5, orange[1] * 0.5, orange[2] * 0.5],
      })
    })

    // Bindable arcs — per-route color, id for arc labels.
    // Non-hub routes use a dimmer cyan so the network reads as hierarchy, not spaghetti.
    const dimCyan = [cyan[0] * 0.55, cyan[1] * 0.55, cyan[2] * 0.55]
    const arcs = GLOBE_CONNECTIONS.map((e) => {
      const a = GLOBE_CITIES[e.from]
      const b = GLOBE_CITIES[e.to]
      return {
        id: `${a.id}-${b.id}`,
        from: [a.lat, a.lng],
        to:   [b.lat, b.lng],
        color: e.hub ? green : dimCyan,
      }
    })

    // Visitor marker + arc from the Riyadh hub (bindable via CSS anchors)
    const hasVisitor = v && Number.isFinite(+v.lat) && Number.isFinite(+v.lon) && v.lat !== '—'
    if (hasVisitor) {
      markers.push({
        location: [+v.lat, +v.lon],
        size: 0.085,
        color: orange,
        id: 'visitor',
      })
      const hub = GLOBE_CITIES.find(c => c.hub) || GLOBE_CITIES[9]
      arcs.push({
        id: 'visitor',
        from: [hub.lat, hub.lng],
        to:   [+v.lat, +v.lon],
        color: orange,
      })
    }

    // COBE maps a world-dot texture against baseColor — keep the earth visible.
    const baseColor = theme.isLight
      ? [0.62, 0.68, 0.74]
      : [
          Math.max(0.14, bg[0] * 0.35 + 0.12),
          Math.max(0.22, bg[1] * 0.35 + 0.18),
          Math.max(0.28, bg[2] * 0.35 + 0.22),
        ]

    const mapSamples = perfTier === 'low' ? 8000 : perfTier === 'med' ? 12000 : 16000

    const globe = createGlobe(canvas, {
      devicePixelRatio: dpr,
      width,
      height,
      phi: stateRef.current.phi,
      theta: stateRef.current.theta,
      dark: theme.isLight ? 0 : 1,
      diffuse: 1.15,
      scale: stateRef.current.zoom * 0.92,
      opacity: 1,
      mapSamples,
      mapBrightness: theme.isLight ? 3.8 : 5.2,
      mapBaseBrightness: 0.03,
      baseColor,
      markerColor: cyan,
      glowColor: theme.isLight ? [0.55, 0.65, 0.75] : [0.12, 0.3, 0.4],
      offset: [0, 0],
      markers,
      arcs,
      arcColor: green,
      arcWidth: 0.28,
      arcHeight: 0.18,
      markerElevation: 0.012,
      context: { antialias: true, alpha: true, powerPreference: 'default' },
    })

    globeRef.current = globe

    // Flight packets — great-circle interp along hub routes, live-updated markers.
    // Two directions per route: req (client→hub, orange/cyan) and res (hub→client, green).
    const baseMarkers = markers
    const scratchPackets = []
    const hubRoutes = GLOBE_CONNECTIONS.filter(e => e.hub).map(e => ({
      from: GLOBE_CITIES[e.from],
      to:   GLOBE_CITIES[e.to],
    }))
    // Always include visitor→hub as the primary realtime client route when available.
    const clientRoutes = []
    if (hasVisitor) {
      const hub = GLOBE_CITIES.find(c => c.hub) || GLOBE_CITIES[9]
      clientRoutes.push({
        from: { id: 'visitor', name: visitor?.city || 'CLIENT', lat: +v.lat, lng: +v.lon },
        to:   hub,
        client: true,
      })
    }
    const allRoutes = [...clientRoutes, ...hubRoutes]
    const packetCount = perfTier === 'low' ? 4 : 8
    const REQ_KINDS = ['GET /api', 'POST /auth', 'WS SYNC', 'GET /cdn', 'RPC CALL', 'GET /status']
    const packetSeeds = Array.from({ length: packetCount }, (_, i) => ({
      route: i % Math.max(1, allRoutes.length),
      t: (i / packetCount),
      speed: 0.0016 + (i % 3) * 0.0006,
      // Alternate request (toward hub) and response (away from hub)
      dir: i % 2 === 0 ? 1 : -1,
      kind: REQ_KINDS[i % REQ_KINDS.length],
      logged: false,
    }))

    // COBE v2 has no onRender — drive phi/theta/scale via globe.update() each frame.
    // Pause when the panel is off-screen (visibleRef) to save GPU.
    let raf = 0
    const frame = (now) => {
      raf = requestAnimationFrame(frame)
      if (visibleRef && visibleRef.current === false) return

      // ── FPS guard: rolling average, auto-downgrade quality if we drop ──
      const fr = fpsRef.current
      if (fr.last) {
        const dt = now - fr.last
        if (dt > 0 && dt < 200) {
          fr.samples = Math.min(60, fr.samples + 1)
          const inst = 1000 / dt
          fr.avg += (inst - fr.avg) * 0.08
        }
      }
      fr.last = now
      if (fr.samples === 30 || fr.samples === 60) {
        const rounded = Math.round(fr.avg)
        setFps(rounded)
        // Sustained < 40fps → step down a tier (high → med → low)
        if (rounded < 40 && perfTierRef.current === 'high') setPerfTier('med')
        else if (rounded < 28 && perfTierRef.current === 'med') setPerfTier('low')
      }

      const s = stateRef.current

      // Focus animation (ease-out cubic)
      if (s.focusAnim) {
        const fa = s.focusAnim
        if (!fa.t0) fa.t0 = now
        const t = Math.min(1, (now - fa.t0) / fa.dur)
        const e = 1 - Math.pow(1 - t, 3)
        s.phi = fa.fromPhi + (fa.toPhi - fa.fromPhi) * e
        s.theta = fa.fromTheta + (fa.toTheta - fa.fromTheta) * e
        if (t >= 1) {
          s.focusAnim = null
          s.velPhi = 0.0012
        }
      } else if (!s.drag) {
        if (autoRotateRef.current) s.phi += s.velPhi
        // Gentle theta settle toward current tilt target
        if (Math.abs(s.velThetaDamp) > 0.0001) {
          s.theta = Math.max(-1.1, Math.min(1.1, s.theta + s.velThetaDamp))
          s.velThetaDamp *= 0.92
        }
      }

      // Advance flight packets along great circles (client ⇄ server realtime routing).
      // Reuse scratch slot objects to avoid allocating a new markers list every frame.
      let nextMarkers = baseMarkers
      if (packetsOnRef.current && allRoutes.length) {
        packetSeeds.forEach((p, i) => {
          p.t += p.speed
          if (p.t > 1) {
            p.t -= 1
            // Log a completed hop to the live routing ticker
            const r = allRoutes[p.route]
            const fromName = p.dir === 1 ? r.from.name : r.to.name
            const toName   = p.dir === 1 ? r.to.name : r.from.name
            const entry = {
              id: `${i}-${Date.now()}`,
              kind: p.dir === 1 ? p.kind : '200 OK',
              from: fromName,
              to: toName,
              dir: p.dir,
              ms: 8 + Math.floor(Math.random() * 40),
            }
            routeLogRef.current = [entry, ...routeLogRef.current].slice(0, 6)
            setRouteLog(routeLogRef.current)
          }
          const r = allRoutes[p.route]
          // dir 1 = toward hub (request), -1 = away from hub (response)
          const a = p.dir === 1 ? r.from : r.to
          const b = p.dir === 1 ? r.to : r.from
          const lat = a.lat + (b.lat - a.lat) * p.t
          const lng = a.lng + (b.lng - a.lng) * p.t
          // Requests glow orange/cyan; responses glow green
          const color = p.dir === 1
            ? (r.client ? orange : cyan)
            : green
          const slot = scratchPackets[i] || (scratchPackets[i] = { id: `pkt-${i}`, location: [0, 0], size: 0.02, color: green })
          slot.location[0] = lat
          slot.location[1] = lng
          slot.size = r.client && p.dir === 1 ? 0.032 : 0.022
          slot.color = color
        })
        nextMarkers = baseMarkers.concat(scratchPackets.slice(0, packetSeeds.length))
      }

      try {
        globe.update({
          phi: s.phi,
          theta: s.theta,
          scale: s.zoom * 0.92,
          opacity: 1,
          markers: nextMarkers,
        })
      } catch { /* globe destroyed */ }
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      try { globe.destroy() } catch { /* already torn down */ }
      globeRef.current = null
    }
  }, [themeKey, visitor, visibleRef, visitorTrail, perfTier])

  // ── ResizeObserver — recreate globe when the panel size changes ──
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap || typeof ResizeObserver === 'undefined') return
    let t = 0
    let lastW = 0, lastH = 0
    const ro = new ResizeObserver(entries => {
      const r = entries[0]?.contentRect
      if (!r) return
      if (Math.abs(r.width - lastW) < 24 && Math.abs(r.height - lastH) < 24) return
      lastW = r.width; lastH = r.height
      clearTimeout(t)
      t = setTimeout(() => setThemeKey(k => k + 1), 180)
    })
    ro.observe(wrap)
    return () => { clearTimeout(t); ro.disconnect() }
  }, [])

  // ── Pointer + keyboard (drag-rotate XYZ, pinch/wheel zoom, arrows) ──
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
      const { x, y } = getXY(e)
      s.drag = { startX: x, startY: y, lastX: x, lastY: y, lastPhi: s.phi, lastTheta: s.theta }
      s.velPhiDamp = 0
      s.velThetaDamp = 0
      s.focusAnim = null
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
      const { x, y } = getXY(e)
      if (s.drag) {
        const dx = x - s.drag.lastX
        const dy = y - s.drag.lastY
        s.velPhiDamp = dx * 0.002
        s.phi = s.drag.lastPhi + (x - s.drag.startX) * 0.006
        s.theta = Math.max(-1.1, Math.min(1.1,
          s.drag.lastTheta + (y - s.drag.startY) * 0.004
        ))
        s.velThetaDamp = dy * 0.0015
        s.drag.lastX = x
        s.drag.lastY = y
      }
    }
    const onUp = () => {
      if (s.drag) {
        s.velPhi = Math.max(0.0004, Math.min(0.006, Math.abs(s.velPhiDamp))) * Math.sign(s.velPhiDamp || 1)
      }
      s.drag = null
      canvas.style.cursor = 'grab'
    }

    const onWheel = e => {
      e.preventDefault()
      s.zoom = clampGlobeZoom(s.zoom - e.deltaY * 0.0008)
    }

    const onKey = e => {
      const step = e.shiftKey ? 0.12 : 0.05
      if (e.key === 'ArrowLeft')  { s.phi -= step; s.focusAnim = null; e.preventDefault() }
      if (e.key === 'ArrowRight') { s.phi += step; s.focusAnim = null; e.preventDefault() }
      if (e.key === 'ArrowUp')    { s.theta = Math.min(1.1, s.theta + step); s.focusAnim = null; e.preventDefault() }
      if (e.key === 'ArrowDown')  { s.theta = Math.max(-1.1, s.theta - step); s.focusAnim = null; e.preventDefault() }
      if (e.key === '+' || e.key === '=') { s.zoom = clampGlobeZoom(s.zoom + 0.08) }
      if (e.key === '-' || e.key === '_') { s.zoom = clampGlobeZoom(s.zoom - 0.08) }
    }

    canvas.addEventListener('mousedown',  onDown)
    canvas.addEventListener('touchstart', onDown, { passive: true })
    window.addEventListener('mousemove',  onMove)
    window.addEventListener('touchmove',  onMove, { passive: true })
    window.addEventListener('mouseup',    onUp)
    window.addEventListener('touchend',   onUp)
    canvas.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('keydown', onKey)
    canvas.style.cursor = 'grab'
    canvas.tabIndex = 0
    canvas.setAttribute('role', 'application')
    canvas.setAttribute('aria-label', 'Interactive global network globe. Drag to rotate, scroll to zoom, arrow keys to pan.')

    return () => {
      canvas.removeEventListener('mousedown',  onDown)
      canvas.removeEventListener('touchstart', onDown)
      window.removeEventListener('mousemove',  onMove)
      window.removeEventListener('touchmove',  onMove)
      window.removeEventListener('mouseup',    onUp)
      window.removeEventListener('touchend',   onUp)
      canvas.removeEventListener('wheel',      onWheel)
      window.removeEventListener('keydown',    onKey)
    }
  }, [])

  const hasVisitorCoords = visitor && Number.isFinite(+visitor.lat) && visitor.lat !== '—'
  const arcCount = GLOBE_CONNECTIONS.length + (hasVisitorCoords ? 1 : 0)
  const nodeCount = GLOBE_CITIES.length + (hasVisitorCoords ? 1 : 0)
  const hubLinks = GLOBE_CONNECTIONS.filter(e => e.hub).length

  return (
    <div
      className="globe-network-shell"
      ref={wrapRef}
      data-globe-tone={themeTone}
      style={{
        width: '100%', height: '100%',
        position: 'relative', overflow: 'hidden',
        background: 'transparent',
      }}
    >
      {/* Top chrome — single flex row: title · controls · stats (collision-proof) */}
      <div className="globe-top-bar">
        <div className="globe-network-title" title="GLOBAL NETWORK · LIVE CONNECTION MAP">
          GLOBAL NETWORK · LIVE CONNECTION MAP
        </div>

        <div className="globe-mode-chips" role="toolbar" aria-label="Globe display controls">
          <button
            type="button"
            className={`globe-mode-chip${autoRotate ? ' is-on' : ''}`}
            onClick={() => setAutoRotate(v => !v)}
            aria-pressed={autoRotate}
            title={autoRotate ? 'Pause auto-rotate' : 'Resume auto-rotate'}
          >
            <span className="globe-mode-chip-dot" aria-hidden />
            {autoRotate ? 'AUTO' : 'LOCK'}
          </button>
          <button
            type="button"
            className={`globe-mode-chip${packetsOn ? ' is-on' : ''}`}
            onClick={() => setPacketsOn(v => !v)}
            aria-pressed={packetsOn}
            title={packetsOn ? 'Hide flight packets' : 'Show flight packets'}
          >
            <span className="globe-mode-chip-dot" aria-hidden />
            {packetsOn ? 'PKT' : 'OFF'}
          </button>
          <button
            type="button"
            className="globe-mode-chip"
            onClick={exportPng}
            title="Export node map as PNG"
          >
            <span className="globe-mode-chip-dot" aria-hidden />
            PNG
          </button>
        </div>

        <div className="globe-network-stats">
          {[
            { label: 'NODES',   value: `${nodeCount}`,   color: 'var(--cyan)'  },
            { label: 'ARCS',    value: `${arcCount}`,    color: 'var(--green)' },
            { label: 'LATENCY', value: `${latencyMs}ms`, color: 'var(--cyan)'  },
            { label: 'UPTIME',  value: monitor?.uptime ? `${monitor.uptime}%` : '99.99%', color: 'var(--green)' },
            { label: 'FPS',     value: `${fps}`,         color: fps < 30 ? 'var(--orange)' : 'var(--cyan)' },
          ].map(s => (
            <div key={s.label} className="globe-stat-row">
              <span className="globe-stat-label">{s.label}</span>
              <span className="globe-stat-value" style={{ color: s.color }}>{s.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Mini radar inset — node azimuths + sweep */}
      <div className="globe-radar" title="Node radar">
        <canvas ref={radarRef} width={64} height={64} aria-hidden />
        <div className="globe-radar-label">
          {monitor ? `${monitor.up}/${monitor.total} UP` : 'RADAR'}
        </div>
      </div>

      {/* Satellites ring — decorative orbiting edge nodes */}
      <div className="globe-sat-ring" aria-hidden>
        <span className="globe-sat s1" />
        <span className="globe-sat s2" />
        <span className="globe-sat s3" />
      </div>

      {/* COBE canvas — fills entire panel */}
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />

      {/* Hub live-badge pulse ring — anchored to Riyadh when CSS anchors exist */}
      {anchorsOk && (
        <div
          className="globe-hub-ring"
          style={{
            positionAnchor: '--cobe-ruh',
            opacity: 'var(--cobe-visible-ruh, 0)',
          }}
          aria-hidden
        />
      )}

      {/* Bindable city labels — CSS Anchor Positioning (Chrome 125+) */}
      {anchorsOk && (
        <div className="globe-label-layer" aria-hidden={false}>
          {GLOBE_CITIES.map(c => (
            <div
              key={c.id}
              className={`globe-city-label${c.hub ? ' is-hub' : ''}${focusCity === c.id ? ' is-focus' : ''}`}
              style={{
                positionAnchor: `--cobe-${c.id}`,
                opacity: `var(--cobe-visible-${c.id}, 0)`,
                filter: `blur(calc((1 - var(--cobe-visible-${c.id}, 0)) * 4px))`,
              }}
              onClick={() => focusOnCity(c)}
              role="button"
              tabIndex={-1}
            >
              {c.name}
              {c.hub && <span className="globe-city-hub-dot" />}
            </div>
          ))}

          {/* Hub-route arc labels */}
          {GLOBE_CONNECTIONS.filter(e => e.hub).map(e => {
            const a = GLOBE_CITIES[e.from]
            const b = GLOBE_CITIES[e.to]
            const id = `${a.id}-${b.id}`
            return (
              <div
                key={id}
                className="globe-arc-label"
                style={{
                  positionAnchor: `--cobe-arc-${id}`,
                  opacity: `var(--cobe-visible-arc-${id}, 0)`,
                  filter: `blur(calc((1 - var(--cobe-visible-arc-${id}, 0)) * 3px))`,
                }}
              >
                {a.id.toUpperCase()} → {b.id.toUpperCase()}
              </div>
            )
          })}
        </div>
      )}

      {/* City chip rail — works without CSS anchors; click to focus */}
      <div className="globe-city-rail" role="toolbar" aria-label="Focus a network node">
        {GLOBE_CITIES.filter(c => c.hub || ['nyc', 'lon', 'tyo', 'sin', 'dxb'].includes(c.id)).map(c => (
          <button
            key={c.id}
            type="button"
            className={`globe-city-chip${focusCity === c.id ? ' is-focus' : ''}${c.hub ? ' is-hub' : ''}`}
            onClick={() => focusOnCity(c)}
            title={`Focus ${c.name}`}
          >
            {c.hub && <span className="globe-city-hub-dot" />}
            {c.name}
          </button>
        ))}
      </div>

      {/* Node detail side panel */}
      {selectedNode && (
        <aside
          className="globe-node-panel"
          role="dialog"
          aria-label={`${selectedNode.name} node details`}
        >
          <header className="globe-node-panel-head">
            <div>
              <div className="globe-node-panel-title">
                {selectedNode.hub && <span className="globe-city-hub-dot" />}
                {selectedNode.name}
              </div>
              <div className="globe-node-panel-sub">
                {selectedNode.region} · {selectedNode.hub ? 'CORE HUB' : 'EDGE NODE'}
              </div>
            </div>
            <button
              type="button"
              className="globe-node-panel-close"
              onClick={() => { setSelectedNode(null); setFocusCity(null) }}
              aria-label="Close node details"
            >
              ✕
            </button>
          </header>

          <div className="globe-node-panel-grid">
            {[
              ['STATUS',   'ONLINE',           'ok'],
              ['LATENCY',  `${8 + (selectedNode.name.length * 3) % 22}ms`, 'ok'],
              ['LINKS',    `${GLOBE_CONNECTIONS.filter(e =>
                GLOBE_CITIES[e.from].id === selectedNode.id || GLOBE_CITIES[e.to].id === selectedNode.id
              ).length}`, 'ok'],
              ['LOAD',     `${28 + (selectedNode.name.charCodeAt(0) % 40)}%`, 'warn'],
              ['ROLE',     selectedNode.hub ? 'TRANSIT' : 'PEER', 'ok'],
              ['PROTO',    'COBE/QUIC',        'ok'],
            ].map(([label, val, tone]) => (
              <div key={label} className="globe-node-panel-row">
                <span>{label}</span>
                <strong data-tone={tone}>{val}</strong>
              </div>
            ))}
          </div>

          <div className="globe-node-panel-spark" aria-hidden>
            {Array.from({ length: 14 }, (_, i) => (
              <i key={i} style={{ height: `${28 + ((i * 17 + selectedNode.name.length * 5) % 52)}%` }} />
            ))}
          </div>
          <div className="globe-node-panel-foot">THROUGHPUT · LAST 60s</div>
        </aside>
      )}

      {/* Live routing ticker — client ⇄ server hops */}
      {routeLog.length > 0 && (
        <div className="globe-route-log" role="log" aria-live="polite" aria-label="Live routing hops">
          {routeLog.map((e, i) => (
            <div key={e.id} className="globe-route-log-row" style={{ opacity: 1 - i * 0.14 }}>
              <span className="globe-route-log-dir" data-dir={e.dir === 1 ? 'up' : 'down'}>
                {e.dir === 1 ? '▲' : '▼'}
              </span>
              <span className="globe-route-log-kind" data-dir={e.dir === 1 ? 'up' : 'down'}>{e.kind}</span>
              <span className="globe-route-log-path">
                {e.from} → {e.to}
              </span>
              <span className="globe-route-log-ms">{e.ms}ms</span>
            </div>
          ))}
        </div>
      )}

      {/* Visitor HUD — bottom-left (anchored to marker when CSS anchor positioning is available) */}
      <VisitorHud visitor={visitor} />

      <style>{`
        .globe-label-layer {
          position: absolute; inset: 0;
          pointer-events: none;
          z-index: 2;
        }
        .globe-city-label {
          position: absolute;
          bottom: anchor(top);
          left: anchor(center);
          translate: -50% 0;
          margin-bottom: 6px;
          font-family: var(--font-mono);
          font-size: 10px;
          letter-spacing: 1.5px;
          color: var(--cyan);
          white-space: nowrap;
          pointer-events: auto;
          cursor: pointer;
          padding: 2px 6px;
          border-radius: 3px;
          background: color-mix(in srgb, var(--bg) 55%, transparent);
          border: 1px solid color-mix(in srgb, var(--cyan) 18%, transparent);
          transition: opacity 0.35s ease, filter 0.35s ease, transform 0.2s ease, color 0.2s ease;
          user-select: none;
        }
        .globe-city-label:hover,
        .globe-city-label.is-focus {
          color: var(--green);
          border-color: color-mix(in srgb, var(--green) 45%, transparent);
          transform: translate(-50%, -2px) scale(1.06);
        }
        .globe-city-label.is-hub {
          color: var(--green);
          border-color: color-mix(in srgb, var(--green) 35%, transparent);
          font-weight: 700;
        }
        .globe-city-hub-dot {
          display: inline-block;
          width: 4px; height: 4px;
          border-radius: 50%;
          background: var(--green);
          box-shadow: 0 0 5px var(--green);
          margin-right: 4px;
          vertical-align: middle;
          animation: hudPulse 2s ease-in-out infinite;
          flex-shrink: 0;
        }
        .globe-hub-ring {
          position: absolute;
          position-anchor: --cobe-ruh;
          top: anchor(center);
          left: anchor(center);
          translate: -50% -50%;
          width: 18px; height: 18px;
          border-radius: 50%;
          border: 1.25px solid var(--green);
          box-shadow: 0 0 10px color-mix(in srgb, var(--green) 45%, transparent);
          pointer-events: none;
          z-index: 2;
          animation: hubRing 2.2s ease-out infinite;
        }
        @keyframes hubRing {
          0%   { transform: translate(-50%,-50%) scale(0.75); opacity: 0.9; }
          70%  { transform: translate(-50%,-50%) scale(1.55); opacity: 0; }
          100% { transform: translate(-50%,-50%) scale(0.75); opacity: 0; }
        }
        .globe-arc-label {
          position: absolute;
          bottom: anchor(top);
          left: anchor(center);
          translate: -50% 0;
          font-family: var(--font-mono);
          font-size: 9px;
          letter-spacing: 1.2px;
          color: var(--green);
          opacity: 0.7;
          white-space: nowrap;
          pointer-events: none;
          text-shadow: 0 0 8px color-mix(in srgb, var(--green) 40%, transparent);
          transition: opacity 0.35s ease;
        }
        /* ── Top chrome: flex row, title | controls | stats ── */
        .globe-top-bar {
          position: absolute;
          top: 0; left: 0; right: 0;
          z-index: 5;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          pointer-events: none;
        }
        .globe-top-bar > * { pointer-events: auto; }
        .globe-top-bar .globe-network-title {
          flex: 1 1 auto;
          min-width: 0;
          font-family: var(--font-mono);
          font-size: 11px;
          letter-spacing: 2.5px;
          color: var(--cyan);
          opacity: 0.62;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          pointer-events: none;
          text-shadow: 0 0 10px rgba(0,212,255,0.18);
        }
        .globe-top-bar .globe-mode-chips {
          position: static;
          display: flex;
          gap: 6px;
          flex: 0 0 auto;
        }
        .globe-top-bar .globe-network-stats {
          flex: 0 0 auto;
          display: flex;
          flex-direction: column;
          gap: 3px;
          align-items: flex-end;
          padding: 6px 8px;
          border-radius: 6px;
          background: rgba(0,0,0,0.08);
          border: 1px solid rgba(0,212,255,0.08);
          backdrop-filter: blur(6px);
          -webkit-backdrop-filter: blur(6px);
          pointer-events: none;
        }
        .globe-stat-row {
          display: flex;
          gap: 10px;
          align-items: center;
        }
        .globe-stat-label {
          font-family: var(--font-mono);
          font-size: 10px;
          color: var(--muted);
          letter-spacing: 2px;
        }
        .globe-stat-value {
          font-family: var(--font-mono);
          font-size: 11px;
          font-weight: 700;
        }
        .globe-mode-chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          height: 26px;
          padding: 0 10px;
          font-family: var(--font-mono);
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 1.6px;
          color: var(--muted);
          background: color-mix(in srgb, var(--bg) 62%, transparent);
          border: 1px solid color-mix(in srgb, var(--border) 55%, transparent);
          border-radius: 4px;
          cursor: pointer;
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          transition: color 0.18s ease, border-color 0.18s ease, background 0.18s ease, transform 0.12s ease;
          user-select: none;
          line-height: 1;
          flex-shrink: 0;
        }
        .globe-mode-chip-dot {
          width: 5px; height: 5px;
          border-radius: 50%;
          background: var(--muted);
          opacity: 0.55;
          transition: background 0.18s ease, box-shadow 0.18s ease, opacity 0.18s ease;
          flex-shrink: 0;
        }
        .globe-mode-chip.is-on {
          color: var(--green);
          border-color: color-mix(in srgb, var(--green) 38%, transparent);
          background: color-mix(in srgb, var(--green) 8%, color-mix(in srgb, var(--bg) 70%, transparent));
        }
        .globe-mode-chip.is-on .globe-mode-chip-dot {
          background: var(--green);
          opacity: 1;
          box-shadow: 0 0 6px var(--green);
        }
        .globe-mode-chip:hover {
          color: var(--cyan);
          border-color: color-mix(in srgb, var(--cyan) 40%, transparent);
          transform: translateY(-1px);
        }
        .globe-mode-chip:focus-visible {
          outline: 2px solid var(--cyan);
          outline-offset: 2px;
        }
        .globe-mode-chip:active {
          transform: translateY(0);
        }
        /* Mini radar inset */
        .globe-radar {
          position: absolute;
          left: 16px; top: 72px;
          z-index: 4;
          width: 64px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          pointer-events: none;
          opacity: 0.9;
        }
        .globe-radar canvas {
          display: block;
          width: 64px; height: 64px;
          border-radius: 50%;
          border: 1px solid color-mix(in srgb, var(--cyan) 22%, transparent);
          background: color-mix(in srgb, var(--bg) 55%, transparent);
          backdrop-filter: blur(4px);
          -webkit-backdrop-filter: blur(4px);
        }
        .globe-radar-label {
          font-family: var(--font-mono);
          font-size: 9px;
          letter-spacing: 1.2px;
          color: var(--muted);
          white-space: nowrap;
        }
        .globe-network-shell[data-globe-tone="light"] .globe-radar canvas {
          background: color-mix(in srgb, var(--bg2, #fff) 70%, transparent);
          border-color: color-mix(in srgb, var(--cyan) 28%, transparent);
        }
        .globe-sat-ring {
          position: absolute;
          inset: 12% 18%;
          pointer-events: none;
          z-index: 1;
          animation: satSpin 48s linear infinite;
        }
        .globe-sat {
          position: absolute;
          width: 4px; height: 4px;
          border-radius: 50%;
          background: var(--cyan);
          box-shadow: 0 0 8px var(--cyan);
          opacity: 0.55;
        }
        .globe-sat.s1 { top: 0; left: 50%; }
        .globe-sat.s2 { top: 50%; right: 0; }
        .globe-sat.s3 { bottom: 0; left: 28%; }
        @keyframes satSpin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        .globe-city-rail {
          position: absolute;
          left: 14px; right: 14px; bottom: 10px;
          z-index: 3;
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          pointer-events: none;
        }
        @supports (anchor-name: --x) {
          .globe-city-rail { display: none; }
        }
        .globe-city-chip {
          pointer-events: auto;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          height: 24px;
          padding: 0 8px;
          font-family: var(--font-mono);
          font-size: 10px;
          font-weight: 500;
          letter-spacing: 1.2px;
          color: var(--muted);
          background: color-mix(in srgb, var(--bg) 62%, transparent);
          border: 1px solid color-mix(in srgb, var(--border) 55%, transparent);
          border-radius: 4px;
          cursor: pointer;
          transition: color 0.18s ease, border-color 0.18s ease, transform 0.12s ease;
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          line-height: 1;
          white-space: nowrap;
        }
        .globe-city-chip:hover,
        .globe-city-chip.is-focus {
          color: var(--cyan);
          border-color: color-mix(in srgb, var(--cyan) 42%, transparent);
          transform: translateY(-1px);
        }
        .globe-city-chip:focus-visible {
          outline: 2px solid var(--cyan);
          outline-offset: 2px;
        }
        .globe-city-chip.is-hub {
          color: var(--green);
          border-color: color-mix(in srgb, var(--green) 38%, transparent);
        }
        .globe-city-chip .globe-city-hub-dot {
          width: 4px; height: 4px;
          margin-right: 0;
        }
        .globe-node-panel {
          position: absolute;
          top: 52px; right: 14px;
          width: min(240px, calc(100% - 28px));
          z-index: 5;
          border-radius: 6px;
          background: color-mix(in srgb, var(--bg) 82%, transparent);
          border: 1px solid color-mix(in srgb, var(--cyan) 22%, transparent);
          backdrop-filter: blur(10px);
          box-shadow: 0 12px 36px rgba(0,0,0,0.28);
          padding: 12px 12px 10px;
          font-family: var(--font-mono);
          animation: panelIn 0.22s ease;
        }
        @keyframes panelIn {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .globe-node-panel-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 8px;
          margin-bottom: 10px;
        }
        .globe-node-panel-title {
          font-family: var(--font-display);
          font-size: 15px;
          font-weight: 700;
          color: var(--text);
          letter-spacing: 0.3px;
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .globe-node-panel-sub {
          font-size: 10px;
          letter-spacing: 1.4px;
          color: var(--muted);
          margin-top: 2px;
        }
        .globe-node-panel-close {
          background: transparent;
          border: 1px solid transparent;
          color: var(--muted);
          font-size: 12px;
          cursor: pointer;
          padding: 2px 6px;
          border-radius: 3px;
          line-height: 1;
        }
        .globe-node-panel-close:hover {
          color: var(--orange);
          border-color: color-mix(in srgb, var(--orange) 35%, transparent);
        }
        .globe-node-panel-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 6px 10px;
        }
        .globe-node-panel-row {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .globe-node-panel-row span {
          font-size: 9px;
          letter-spacing: 1.4px;
          color: var(--muted);
        }
        .globe-node-panel-row strong {
          font-size: 12px;
          font-weight: 700;
          color: var(--cyan);
        }
        .globe-node-panel-row strong[data-tone="ok"]   { color: var(--green); }
        .globe-node-panel-row strong[data-tone="warn"] { color: var(--orange); }
        .globe-node-panel-spark {
          display: flex;
          align-items: flex-end;
          gap: 3px;
          height: 36px;
          margin-top: 12px;
          padding: 4px 2px;
          border-top: 1px solid color-mix(in srgb, var(--cyan) 14%, transparent);
        }
        .globe-node-panel-spark i {
          flex: 1;
          display: block;
          border-radius: 1px;
          background: linear-gradient(to top, color-mix(in srgb, var(--green) 55%, transparent), var(--cyan));
          opacity: 0.75;
          min-height: 4px;
        }
        .globe-node-panel-foot {
          margin-top: 6px;
          font-size: 9px;
          letter-spacing: 1.5px;
          color: var(--muted);
          text-align: right;
        }
        /* Live routing ticker */
        .globe-route-log {
          position: absolute;
          left: 14px; bottom: 52px;
          z-index: 4;
          display: flex;
          flex-direction: column;
          gap: 3px;
          pointer-events: none;
          max-width: min(340px, calc(100% - 28px));
        }
        .globe-route-log-row {
          display: flex;
          align-items: center;
          gap: 8px;
          font-family: var(--font-mono);
          font-size: 10px;
          letter-spacing: 0.6px;
          padding: 3px 8px;
          border-radius: 3px;
          background: color-mix(in srgb, var(--bg) 72%, transparent);
          border: 1px solid color-mix(in srgb, var(--cyan) 14%, transparent);
          backdrop-filter: blur(4px);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          animation: routeIn 0.28s ease;
        }
        @keyframes routeIn {
          from { opacity: 0; transform: translateX(-8px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        .globe-route-log-dir {
          font-size: 9px;
          line-height: 1;
          width: 12px;
          text-align: center;
        }
        .globe-route-log-dir[data-dir="up"]   { color: var(--orange); }
        .globe-route-log-dir[data-dir="down"] { color: var(--green); }
        .globe-route-log-kind {
          font-weight: 700;
          min-width: 64px;
        }
        .globe-route-log-kind[data-dir="up"]   { color: var(--cyan); }
        .globe-route-log-kind[data-dir="down"] { color: var(--green); }
        .globe-route-log-path {
          color: var(--muted);
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .globe-route-log-ms {
          color: var(--cyan);
          font-weight: 700;
          font-size: 10px;
        }
        /* Theme-tone sync — chrome adapts to real --bg luminance */
        .globe-network-shell[data-globe-tone="light"] .globe-route-log-row {
          background: color-mix(in srgb, var(--bg2, var(--bg)) 82%, transparent);
          border-color: color-mix(in srgb, var(--cyan) 20%, transparent);
          box-shadow: 0 6px 18px rgba(21,48,74,0.08);
        }
        .globe-network-shell[data-globe-tone="light"] .globe-hub-ring {
          box-shadow: 0 0 12px color-mix(in srgb, var(--green) 40%, transparent);
        }
        @media (max-width: 720px) {
          .globe-top-bar {
            flex-wrap: wrap;
            gap: 8px;
            padding: 10px 12px;
          }
          .globe-top-bar .globe-network-title {
            flex: 1 1 100%;
            letter-spacing: 1.5px;
            font-size: 10px;
          }
          .globe-top-bar .globe-network-stats {
            margin-left: auto;
          }
          .globe-arc-label { display: none; }
          .globe-city-label { font-size: 9px; letter-spacing: 1px; }
          .globe-node-panel { width: min(200px, calc(100% - 28px)); }
          .globe-sat-ring { display: none; }
          .globe-route-log { bottom: 52px; max-width: calc(100% - 28px); }
        }
        @media (prefers-reduced-motion: reduce) {
          .globe-hub-ring,
          .globe-sat-ring,
          .globe-city-hub-dot,
          .globe-route-log-row { animation: none !important; }
        }
      `}</style>
    </div>
  )
}
