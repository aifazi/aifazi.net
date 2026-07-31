'use client'
import { useEffect, useState, useRef } from 'react'
import { useInlineEdit } from '../context/EditContext'

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
  useEffect(() => {
    if (typeof savedMode === 'string' && savedMode !== mode) setMode(savedMode)
  }, [savedMode]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = containerRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const obs = new IntersectionObserver(([e]) => { visibleRef.current = e.isIntersecting }, { threshold: 0 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    const id = setInterval(() => { if (visibleRef.current) setTick(t => t + 1) }, 350)
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
          fontFamily: 'var(--font-mono)', fontSize: 7, letterSpacing: 2,
          color: 'var(--green)', background: 'var(--bg2)',
          border: '1px solid rgba(0,255,136,0.35)', borderRadius: 10,
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
                fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 2,
                padding: '6px 14px', cursor: 'pointer', borderRadius: 4,
                border: active ? '1px solid var(--cyan)' : '1px solid transparent',
                background: active ? 'rgba(0,212,255,0.1)' : hovMode === m.id ? 'var(--bg3)' : 'transparent',
                color: active ? 'var(--cyan)' : 'var(--muted)',
                transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: active ? '0 0 10px rgba(0,212,255,0.15)' : 'none',
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
            fill={a.warn?'rgba(255,165,0,0.15)':'rgba(0,255,136,0.1)'}
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
              fill={isSelected ? 'rgba(0,212,255,0.06)' : 'var(--bg3)'}
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
        <MiniSparkline history={sel.history.map(v => v * 0.7 + Math.random() * 15)} color="var(--green)" x={460} y={215} w={170} h={60}/>
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
        .nn-edge  { stroke: rgba(0,212,255,0.18); stroke-width: 1; fill: none;
                    stroke-dasharray: 6 4; }
        .nn-node  { fill: var(--bg3); stroke: var(--cyan); stroke-width: 1.5; }
        .nn-out   { fill: var(--bg3); stroke: var(--green); stroke-width: 2; opacity: 0.7; }
        .nn-signal{ fill: var(--cyan); }
      `}</style>
      <defs>
        <radialGradient id="nn-bg" cx="50%" cy="50%" r="60%">
          <stop offset="0%"   stopColor="rgba(0,212,255,0.04)"/>
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
        .pf-edge { stroke: rgba(0,212,255,0.15); stroke-width: 1.5; fill: none; stroke-dasharray: 5 3; }
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
  useEffect(() => { if (savedFilter) setActiveFilter(savedFilter) }, [savedFilter])

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
        fontFamily: 'var(--font-mono)', fontSize: 7, letterSpacing: 3, color: 'var(--cyan)', opacity: 0.6 }}>
        AVATAR · HOLOGRAPHIC PRESENCE
      </div>

      {/* Swirling background orbs */}
      <div id="av-orb1" style={{
        position: 'absolute', width: 320, height: 320, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(0,212,255,0.12) 0%, transparent 70%)',
        top: '10%', left: '5%', pointerEvents: 'none',
      }}/>
      <div id="av-orb2" style={{
        position: 'absolute', width: 280, height: 280, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(0,255,136,0.10) 0%, transparent 70%)',
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
            border: '1.5px dashed rgba(0,212,255,0.35)',
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
            boxShadow: '0 0 40px rgba(0,212,255,0.2), 0 0 80px rgba(0,255,136,0.1), 0 20px 60px rgba(0,0,0,0.5)',
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
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--muted)', letterSpacing: 2, textAlign: 'center', whiteSpace: 'pre-line' }}>
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
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--green)', letterSpacing: 2 }}>
               REMOTELY AVAILABLE
            </span>
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--muted)', letterSpacing: 1 }}>
            IT SPECIALIST · NETWORK SPECIALIST · AI ENTHUSIAST
          </div>
        </div>

        {/* Filter picker — always visible when image is set */}
        {avatarUrl && avatarUrl.trim() !== '' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, width: '100%' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 7, color: 'var(--muted)', letterSpacing: 2 }}>
              IMAGE FILTER
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', maxWidth: 400 }}>
              {FILTERS.map(f => (
                <button key={f.id} onClick={() => {
                  setActiveFilter(f.id)
                  if (isAdmin) saveFilter(f.id)
                }} style={{
                  fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 1,
                  padding: '4px 10px', borderRadius: 2, cursor: 'pointer',
                  border: `1px solid ${activeFilter === f.id ? 'var(--cyan)' : 'var(--border)'}`,
                  background: activeFilter === f.id ? 'rgba(0,212,255,0.12)' : 'transparent',
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
              fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 2,
              padding: '6px 14px', background: 'rgba(0,212,255,0.08)',
              color: 'var(--cyan)', border: '1px solid rgba(0,212,255,0.3)',
              borderRadius: 2, cursor: 'pointer',
            }}>
            ✎ CHANGE IMAGE URL
          </button>
        )}

        {/* URL input (edit mode) */}
        {isAdmin && editMode && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', width: '100%', maxWidth: 320 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--muted)', letterSpacing: 1 }}>
              PASTE IMAGE URL (jpg, png, webp, gif)
            </div>
            <input
              type="text"
              value={draftUrl}
              onChange={e => setDraftUrl(e.target.value)}
              placeholder="https://example.com/avatar.jpg"
              autoFocus
              style={{
                width: '100%', fontFamily: 'var(--font-mono)', fontSize: 10,
                padding: '8px 12px', background: 'var(--bg3)',
                border: '1px solid var(--cyan)', color: 'var(--text)',
                borderRadius: 2, outline: 'none',
              }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleSave} style={{
                fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 2,
                padding: '6px 14px', background: 'var(--green)',
                color: '#000', border: 'none', borderRadius: 2, cursor: 'pointer', fontWeight: 700,
              }}>SAVE</button>
              <button onClick={() => setEditMode(false)} style={{
                fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 2,
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
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 6, color: 'var(--green)', letterSpacing: 1 }}>
          HOLOGRAPHIC PRESENCE ACTIVE · IDENTITY VERIFIED · SECURE CONNECTION
        </span>
      </div>
    </div>
  )
}


// ─────────────────────────────────────────────────────────────────────────────
//  MODE 8: GLOBE — spinning 3D network globe (pure Canvas 2D, no Three.js)
//  Great-circle arcs · glowing city nodes · drag-to-rotate · scroll-to-zoom
//  Theme-synced · bigger · more interactable
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
])

function readGlobeTheme() {
  if (typeof window === 'undefined') return {
    cyanRgb: '0,212,255', greenRgb: '0,255,136', bgRgb: '0,12,28',
    isLight: false, textRgb: '200,216,232', mutedRgb: '107,130,150', orangeRgb: '255,107,53',
  }
  const themeAttr = document.documentElement.getAttribute('data-theme') || ''
  const isLight = LIGHT_THEME_IDS.has(themeAttr) || (!themeAttr && window.matchMedia('(prefers-color-scheme: light)').matches)
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
  const read = (prop, darkDef, lightDef) => {
    const raw = cssVar(prop, '')
    return hexToRgb(raw || null, isLight ? lightDef : darkDef)
  }
  const cyanRgb   = read('--cyan',    '0,212,255',  '0,93,143')
  const greenRgb  = read('--green',   '0,255,136',  '0,110,56')
  const rawBg      = cssVar('--bg', isLight ? '#c8d4e0' : '#060a0f')
  const parsedBg   = hexToRgb(rawBg, null)
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

const GLOBE_CITIES = [
  { name: 'NEW YORK',   lat:  40.7, lng:  -74.0, hub: false },
  { name: 'LONDON',     lat:  51.5, lng:   -0.1, hub: false },
  { name: 'TOKYO',      lat:  35.7, lng:  139.7, hub: false },
  { name: 'DUBAI',      lat:  25.2, lng:   55.3, hub: false },
  { name: 'SINGAPORE',  lat:   1.3, lng:  103.8, hub: false },
  { name: 'SAO PAULO',  lat: -23.5, lng:  -46.6, hub: false },
  { name: 'SYDNEY',     lat: -33.9, lng:  151.2, hub: false },
  { name: 'PARIS',      lat:  48.9, lng:    2.3, hub: false },
  { name: 'MUMBAI',     lat:  19.1, lng:   72.9, hub: false },
  { name: 'RIYADH',     lat:  24.7, lng:   46.7, hub: true  },
  { name: 'TORONTO',    lat:  43.7, lng:  -79.4, hub: false },
  { name: 'FRANKFURT',  lat:  50.1, lng:    8.7, hub: false },
]

const GLOBE_CONNECTIONS = [
  [0,1],[1,7],[0,10],[1,11],[2,8],[3,9],
  [3,1],[8,4],[4,2],[5,0],[6,4],[9,3],
  [11,7],[0,3],[9,8],[2,6],[9,1],[4,6],
]

const GLOBE_MIN_ZOOM = 0.55
const GLOBE_MAX_ZOOM = 1.08

function clampGlobeZoom(value, canvas) {
  const w = canvas?.clientWidth || 0
  const h = canvas?.clientHeight || 0
  const minDim = Math.max(1, Math.min(w || 600, h || 600))
  const safeMax = Math.max(0.8, Math.min(GLOBE_MAX_ZOOM, (minDim / 2 - 24) / (minDim * 0.44)))
  return Math.max(GLOBE_MIN_ZOOM, Math.min(safeMax, value))
}

function firstGeoValue(...values) {
  const found = values.find(v => v !== undefined && v !== null && String(v).trim() !== '')
  return found === undefined ? '—' : String(found).trim()
}

function GlobeMode({ visibleRef }) {
  const canvasRef = useRef()
  const wrapRef   = useRef()
  const animRef   = useRef()
  const [visitor, setVisitor] = useState(null)
  const visitorRef = useRef(null)
  const mapRef = useRef(null)
  const [themeKey, setThemeKey] = useState(0)
  const themeRef = useRef(null)
  const stateRef  = useRef({
    rotY:     0.3,          // Y-axis (longitude) angle
    rotX:     0.12,         // X-axis (latitude tilt) angle — fixed gentle tilt
    velY:     0.0018,       // auto-spin velocity (slows on drag, resumes after)
    velYDamp: 0,            // drag-contributed velocity for momentum
    drag:     null,         // { startX, startY, lastRotY, lastVelY }
    hovered:  -1,           // index of hovered city (-1 = none)
    mouseX:   0,
    mouseY:   0,
    zoom:     1.0,          // scroll-to-zoom / pinch-zoom multiplier, capped to keep edges visible
    pinch:    null,         // { dist0, zoom0 } for two-finger pinch
    packets: GLOBE_CONNECTIONS.map(() => ({
      t:     Math.random(),
      speed: 0.003 + Math.random() * 0.003,
    })),
  })

  useEffect(() => { visitorRef.current = visitor }, [visitor])

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
          if (!cancelled) setVisitor(parsed)
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

  // ── Load equirectangular earth texture (continents + seas) ──────────────────
  useEffect(() => {
    const img = new window.Image()
    img.crossOrigin = 'anonymous'
    img.src = '/globe/earth.jpg'
    img.onload = () => {
      try {
        const off = document.createElement('canvas')
        off.width  = img.naturalWidth
        off.height = img.naturalHeight
        const octx = off.getContext('2d')
        octx.drawImage(img, 0, 0)
        const data = octx.getImageData(0, 0, off.width, off.height)
        mapRef.current = { data, w: off.width, h: off.height }
      } catch {
        mapRef.current = null
      }
    }
    img.onerror = () => { mapRef.current = null }
    return () => { img.onload = null; img.onerror = null }
  }, [])

  // ── React to theme changes ──
  useEffect(() => {
    themeRef.current = readGlobeTheme()
    setThemeKey(k => k + 1)
    const el = document.documentElement
    const obs = new MutationObserver(() => {
      themeRef.current = readGlobeTheme()
      setThemeKey(k => k + 1)
    })
    obs.observe(el, { attributes: true, attributeFilter: ['data-theme'] })
    return () => obs.disconnect()
  }, [])

  // ── Resize (DPR-aware) ────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let lastW = 0, lastH = 0
    const fit = () => {
      const p = canvas.parentElement
      if (!p) return
      const dpr = window.devicePixelRatio || 1
      const w   = p.clientWidth
      const h   = Math.min(p.clientHeight || 600, 600)
      if (w === lastW && h === lastH) return
      lastW = w; lastH = h
      canvas.width  = w * dpr
      canvas.height = h * dpr
      canvas.style.width  = `${w}px`
      canvas.style.height = `${h}px`
    }
    fit()
    const ro = new ResizeObserver(fit)
    if (canvas.parentElement) ro.observe(canvas.parentElement)
    return () => ro.disconnect()
  }, [])

  // ── Pointer events (drag-to-rotate + hover) ───────────────────────────────
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
      s.drag = { startX: x, startY: y, lastRotY: s.rotY, lastX: x, prevVelY: 0 }
      s.velYDamp = 0
      s._face = null
      canvas.style.cursor = 'grabbing'
    }
    const onMove = e => {
      // Pinch-zoom (two fingers)
      if (e.touches && e.touches.length === 2) {
        const dx   = e.touches[0].clientX - e.touches[1].clientX
        const dy   = e.touches[0].clientY - e.touches[1].clientY
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (!s.pinch) { s.pinch = { dist0: dist, zoom0: s.zoom } }
        else { s.zoom = clampGlobeZoom(s.pinch.zoom0 * (dist / s.pinch.dist0), canvas) }
        return
      }
      s.pinch = null
      const { x, y } = getXY(e)
      s.mouseX = x; s.mouseY = y
      if (s.drag) {
        const dx    = x - s.drag.lastX
        s.velYDamp  = dx * 0.002             // momentum from drag speed
        s.rotY      = s.drag.lastRotY + (x - s.drag.startX) * 0.006
        s.drag.lastX = x
      }
    }
    const onUp = () => {
      if (s.drag) {
        // Hand off drag velocity to auto-spin
        s.velY = Math.max(0.0004, Math.min(0.006, Math.abs(s.velYDamp))) * Math.sign(s.velYDamp || 1)
      }
      s.drag = null
      canvas.style.cursor = 'grab'
    }

    canvas.addEventListener('mousedown',  onDown)
    canvas.addEventListener('touchstart', onDown, { passive: true })
    window.addEventListener('mousemove',  onMove)
    window.addEventListener('touchmove',  onMove, { passive: true })
    window.addEventListener('mouseup',    onUp)
    window.addEventListener('touchend',   onUp)
    canvas.style.cursor = 'grab'

    // Scroll-to-zoom
    const onWheel = e => {
      e.preventDefault()
      s.zoom = clampGlobeZoom(s.zoom - e.deltaY * 0.0008, canvas)
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })

    return () => {
      canvas.removeEventListener('mousedown',  onDown)
      canvas.removeEventListener('touchstart', onDown)
      window.removeEventListener('mousemove',  onMove)
      window.removeEventListener('touchmove',  onMove)
      window.removeEventListener('mouseup',    onUp)
      window.removeEventListener('touchend',   onUp)
      canvas.removeEventListener('wheel',      onWheel)
    }
  }, [])

  // ── Main render loop ───────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (!themeRef.current) themeRef.current = readGlobeTheme()
    const ctx = canvas.getContext('2d')
    const s   = stateRef.current

    // ── CSS-var → rgb helper ──────────────────────────────────────────────
    const hexToRgb = (hex, fb) => {
      if (!hex) return fb
      // Handle #rrggbb
      const m6 = hex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
      if (m6) return `${parseInt(m6[1],16)},${parseInt(m6[2],16)},${parseInt(m6[3],16)}`
      // Handle #rgb shorthand
      const m3 = hex.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i)
      if (m3) return `${parseInt(m3[1]+m3[1],16)},${parseInt(m3[2]+m3[2],16)},${parseInt(m3[3]+m3[3],16)}`
      // Handle rgb(r,g,b) or rgb(r, g, b)
      const mr = hex.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i)
      if (mr) return `${mr[1]},${mr[2]},${mr[3]}`
      return fb
    }

    const toRad = d => d * Math.PI / 180

    // lat/lng → unit sphere
    const latLng3D = (lat, lng) => ({
      x:  Math.cos(toRad(lat)) * Math.sin(toRad(lng)),
      y:  Math.sin(toRad(lat)),
      z:  Math.cos(toRad(lat)) * Math.cos(toRad(lng)),
    })

    // Rotate around Y axis then X axis (yaw + tilt)
    const rotate = (p, ry, rx) => {
      // Y-axis rotation
      const x1 =  p.x * Math.cos(ry) + p.z * Math.sin(ry)
      const y1 =  p.y
      const z1 = -p.x * Math.sin(ry) + p.z * Math.cos(ry)
      // X-axis rotation
      const x2 = x1
      const y2 = y1 * Math.cos(rx) - z1 * Math.sin(rx)
      const z2 = y1 * Math.sin(rx) + z1 * Math.cos(rx)
      return { x: x2, y: y2, z: z2 }
    }

    // Orthographic → canvas
    const proj = (p, cx, cy, R) => ({
      x: cx + p.x * R,
      y: cy - p.y * R,
      z: p.z,
    })

    // Slerp (great-circle interpolation)
    const slerp = (a, b, t) => {
      const dot   = Math.max(-1, Math.min(1, a.x*b.x + a.y*b.y + a.z*b.z))
      const omega = Math.acos(dot)
      if (Math.abs(omega) < 1e-6) return { ...a }
      const s0 = Math.sin((1 - t) * omega) / Math.sin(omega)
      const s1 = Math.sin(t       * omega) / Math.sin(omega)
      return { x: s0*a.x + s1*b.x, y: s0*a.y + s1*b.y, z: s0*a.z + s1*b.z }
    }

    const ARC_SAMPLES = 80
    // Pre-cache base 3D positions (without rotation)
    const base3D = GLOBE_CITIES.map(c => latLng3D(c.lat, c.lng))

    // ── Earth texture renderer (precomputed inverse orthographic mapping) ──
    // Because the X-tilt is fixed and the sphere only spins on Y, the equirect
    // texture column for every pixel is constant — we just shift horizontally
    // by -rotY each frame. No per-pixel trig in the hot loop.
    const earthCv  = document.createElement('canvas')
    const earthCtx = earthCv.getContext('2d')
    let earthCache = null
    const drawEarth = (cx, cy, R, ry, rx) => {
      const tex = mapRef.current
      if (!tex || !tex.data) return false
      const tw = tex.w, th = tex.h
      const dia = Math.round(Math.min(R * 2, 360))
      if (dia < 8) return false

      if (!earthCache || earthCache.dia !== dia || earthCache.tw !== tw) {
        const baseX = new Float32Array(dia * dia)
        const baseY = new Float32Array(dia * dia)
        const r = dia / 2
        const cosRx = Math.cos(rx), sinRx = Math.sin(rx)
        const inv2PI = 1 / (2 * Math.PI)
        const invPI  = 1 / Math.PI
        for (let py = 0; py < dia; py++) {
          const v = (r - (py + 0.5)) / r
          for (let px = 0; px < dia; px++) {
            const u  = ((px + 0.5) - r) / r
            const uv2 = u * u + v * v
            const idx = py * dia + px
            if (uv2 > 1) { baseX[idx] = -1; baseY[idx] = -1; continue }
            const z  = Math.sqrt(1 - uv2)
            // Undo X-tilt: view (u,v,z) -> Y-rotated frame (x1,y1,z1)
            const y1 = v * cosRx + z * sinRx
            const z1 = -v * sinRx + z * cosRx
            const x1 = u
            const lng = Math.atan2(x1, z1)
            const lat = Math.asin(Math.max(-1, Math.min(1, y1)))
            baseX[idx] = (((lng * inv2PI + 0.5) % 1) + 1) % 1 * tw
            baseY[idx] = Math.max(0, Math.min(th - 1, (0.5 - lat * invPI) * th))
          }
        }
        if (earthCv.width !== dia || earthCv.height !== dia) { earthCv.width = dia; earthCv.height = dia }
        earthCache = { dia, tw, baseX, baseY, img: earthCtx.createImageData(dia, dia) }
      }

      const d   = earthCache.img.data
      const src = tex.data.data
      const shift = ((ry / (2 * Math.PI)) % 1) * tw
      const bxA = earthCache.baseX, byA = earthCache.baseY
      for (let i = 0; i < bxA.length; i++) {
        const bx = bxA[i]
        if (bx < 0) { d[i * 4 + 3] = 0; continue }
        let tx = bx - shift
        tx -= Math.floor(tx / tw) * tw
        const txi = tx | 0
        const ty  = byA[i] | 0
        const so  = (ty * tw + txi) * 4
        const o   = i * 4
        d[o] = src[so]; d[o + 1] = src[so + 1]; d[o + 2] = src[so + 2]; d[o + 3] = 255
      }
      earthCtx.putImageData(earthCache.img, 0, 0)
      ctx.save()
      ctx.beginPath()
      ctx.arc(cx, cy, R, 0, Math.PI * 2)
      ctx.clip()
      ctx.drawImage(earthCv, cx - R, cy - R, R * 2, R * 2)
      ctx.restore()
      return true
    }

    let last = 0
    const frame = ts => {
      if (!visibleRef.current) { animRef.current = requestAnimationFrame(frame); return }
      const dt = Math.min(ts - last, 50) / 16.67   // normalize to ~60 fps
      last = ts

      // ── Globe colors — theme-synced via themeRef (updated on data-theme change) ──
      const { cyanRgb, greenRgb, bgRgb, isLight, textRgb, mutedRgb, orangeRgb } = themeRef.current
      const accentRgb = cyanRgb
      const gridLineRgb = isLight ? mutedRgb : accentRgb

      const dpr = window.devicePixelRatio || 1
      const W   = canvas.width  / dpr
      const H   = canvas.height / dpr
      const cx  = W / 2
      const cy  = H / 2
      s.zoom = clampGlobeZoom(s.zoom, canvas)
      // Large globe — takes 88% of shorter dimension, multiplied by zoom
      const R   = Math.min(W, H) * 0.44 * s.zoom

      // ── Update rotation ──
      if (!s.drag) {
        if (s._face) {
          // Gently spin to center the visitor before resuming auto-spin
          const fp = s._face
          const target = Math.atan2(-fp.x, fp.z)
          let diff = target - s.rotY
          diff = Math.atan2(Math.sin(diff), Math.cos(diff))
          s.rotY += diff * 0.02 * dt
          if (Math.abs(diff) < 0.01) {
            s._faceHold = (s._faceHold || 0) + dt
            if (s._faceHold > 160) { s._face = null; s._faceHold = 0 }
          }
          s.velY += (0 - s.velY) * 0.05 * dt
        } else {
          // Gently decay back toward auto-spin speed after a drag flick
          s.velY += (0.0018 - s.velY) * 0.012 * dt
          s.rotY += s.velY * dt
        }
      }

      const ry = s.rotY
      const rx = s.rotX
      const liveVisitor = visitorRef.current

      // Rotated city positions
      const cities3D   = base3D.map(p => rotate(p, ry, rx))
      const citiesProj = cities3D.map(p => proj(p, cx, cy, R))

      // ── Hover detection ──
      const mx = s.mouseX, my = s.mouseY
      let hovIdx = -1, hovDist = 22 * 22
      citiesProj.forEach((pp, i) => {
        if (pp.z < 0) return
        const d2 = (pp.x - mx) ** 2 + (pp.y - my) ** 2
        if (d2 < hovDist) { hovDist = d2; hovIdx = i }
      })
      s.hovered = hovIdx

      // ── Clear ──
      ctx.clearRect(0, 0, W, H)

      // ── Star field ──
      const starBase = isLight ? '60,80,110' : '255,255,255'
      const starMaxA = isLight ? 0.35 : 1
      if (!s._stars) s._stars = Array.from({ length: 160 }, (_, i) => ({ x:Math.random(), y:Math.random(), r:0.4+Math.random()*1.4, a:0.3+Math.random()*0.7, tw:0.001+Math.random()*0.008, to:Math.random()*Math.PI*2, l:i%3 }))
      s._stars.forEach(star => {
        const tw = 0.4 + 0.6 * Math.sin(ts * star.tw + star.to)
        const al = Math.min(1, star.a * tw * (0.6 + star.l * 0.2) * starMaxA)
        ctx.fillStyle = `rgba(${starBase},${al})`
        ctx.beginPath()
        ctx.arc(star.x * W, star.y * H, star.r * (0.8 + star.l * 0.3), 0, Math.PI * 2)
        ctx.fill()
      })

      // ── Sci-fi meteor streaks ──
      if (!s._meteors) s._meteors = Array.from({ length: 2 }, (_, i) => ({
        x: Math.random() * W, y: Math.random() * H * 0.5,
        vx: 1.6 + Math.random() * 2.4, vy: 0.9 + Math.random() * 1.4,
        life: 0, maxLife: 90 + Math.random() * 80,
        hue: i % 2 === 0 ? greenRgb : cyanRgb,
      }))
      s._meteors.forEach(m => {
        m.life += dt
        m.x += m.vx * dt
        m.y += m.vy * dt
        const fade = 1 - m.life / m.maxLife
        if (fade <= 0 || m.x > W + 40 || m.y > H + 40) {
          Object.assign(m, { x: Math.random() * W, y: -10, vx: 1.4 + Math.random() * 2.6, vy: 0.8 + Math.random() * 1.6, life: 0, maxLife: 90 + Math.random() * 90 })
        } else {
          const tl = 14 + fade * 22
          const tailX = m.x - m.vx * 5, tailY = m.y - m.vy * 5
          const g = ctx.createLinearGradient(m.x, m.y, tailX, tailY)
          g.addColorStop(0, `rgba(${m.hue},${0.75 * fade})`)
          g.addColorStop(1, `rgba(${m.hue},0)`)
          ctx.save()
          ctx.strokeStyle = g
          ctx.lineWidth = 1 + fade
          ctx.lineCap = 'round'
          ctx.beginPath()
          ctx.moveTo(m.x, m.y)
          ctx.lineTo(tailX, tailY)
          ctx.stroke()
          ctx.restore()
        }
      })

      // ── Orbiting satellites (holo satellites circling the globe) ──
      if (!s._sats) s._sats = Array.from({ length: 6 }, (_, i) => ({
        a: i * 1.04,
        tilt: ((i % 3) - 1) * 0.3,
        speed: 0.0009 + (i % 2) * 0.0007,
        r: 1.18 + (i % 3) * 0.07,
        hue: i % 2 === 0 ? greenRgb : cyanRgb,
      }))
      s._sats.forEach(sat => {
        sat.a += sat.speed * dt
        const cyc = Math.cos(sat.a)
        const orbBase = { x: sat.r * cyc, y: sat.r * Math.sin(sat.a) * 0.32, z: sat.r * cyc * 0.6 }
        const orbP = rotate(orbBase, ry, rx)
        const orbZ = orbP.z
        if (orbZ > -0.1) {
          const oq = proj(orbP, cx, cy, R)
          const oa = Math.max(0, (orbZ + 0.5) * 0.9)
          ctx.save()
          ctx.shadowBlur = 10
          ctx.shadowColor = `rgba(${sat.hue},0.9)`
          ctx.beginPath()
          ctx.arc(oq.x, oq.y, 1.8, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(${sat.hue},${oa * 0.9})`
          ctx.fill()
          ctx.shadowBlur = 0
          ctx.beginPath()
          ctx.arc(oq.x, oq.y, 0.7, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(255,255,255,${oa})`
          ctx.fill()
          ctx.restore()
        }
      })

      // ── Atmosphere halo (capped, theme-synced) ──
      const breathe = 1 + 0.03 * Math.sin(ts * 0.001)
      const maxDist  = Math.min(cx, cy, W - cx, H - cy) * 0.92
      const atmoOuter = Math.min(R * 1.25 * breathe, maxDist)
      const atmo = ctx.createRadialGradient(cx, cy, R * 0.85, cx, cy, atmoOuter)
      atmo.addColorStop(0,   `rgba(${cyanRgb},${isLight ? 0.12 : 0.18})`)
      atmo.addColorStop(0.3, `rgba(${cyanRgb},${isLight ? 0.05 : 0.08})`)
      atmo.addColorStop(0.7, `rgba(${cyanRgb},${isLight ? 0.02 : 0.03})`)
      atmo.addColorStop(1,   `rgba(${cyanRgb},0)`)
      ctx.beginPath()
      ctx.arc(cx, cy, atmoOuter, 0, Math.PI * 2)
      ctx.fillStyle = atmo
      ctx.fill()

      // ── Secondary green atmosphere ring ──
      const atmo2 = ctx.createRadialGradient(cx, cy, R * 0.9, cx, cy, Math.min(R * 1.15 * breathe, maxDist))
      atmo2.addColorStop(0, `rgba(${greenRgb},${isLight ? 0.06 : 0.08})`)
      atmo2.addColorStop(0.5, `rgba(${greenRgb},${isLight ? 0.02 : 0.03})`)
      atmo2.addColorStop(1, `rgba(${greenRgb},0)`)
      ctx.beginPath()
      ctx.arc(cx, cy, Math.min(R * 1.15 * breathe, maxDist), 0, Math.PI * 2)
      ctx.fillStyle = atmo2
      ctx.fill()

      // ── Globe body ──
      const sphereGrad = ctx.createRadialGradient(cx - R*0.26, cy - R*0.26, 0, cx, cy, R)
      if (isLight) {
        sphereGrad.addColorStop(0, 'rgba(246,251,255,0.94)')
        sphereGrad.addColorStop(0.44, 'rgba(197,212,227,0.90)')
        sphereGrad.addColorStop(1, 'rgba(110,132,154,0.88)')
      } else {
        sphereGrad.addColorStop(0, `rgba(${bgRgb},0.82)`)
        sphereGrad.addColorStop(0.5, `rgba(${bgRgb},0.90)`)
        sphereGrad.addColorStop(1, `rgba(${bgRgb},0.96)`)
      }
      ctx.beginPath()
      ctx.arc(cx, cy, R, 0, Math.PI * 2)
      ctx.fillStyle = sphereGrad
      ctx.fill()

      // ── Real earth texture (continents + seas) ──
      if (drawEarth(cx, cy, R, ry, rx)) {
        // Soft holo tint over the map so it blends with the theme
        ctx.save()
        ctx.beginPath()
        ctx.arc(cx, cy, R, 0, Math.PI * 2)
        ctx.clip()
        const mapTint = ctx.createRadialGradient(cx - R * 0.26, cy - R * 0.26, 0, cx, cy, R)
        mapTint.addColorStop(0, `rgba(${isLight ? '255,255,255' : cyanRgb},${isLight ? 0.10 : 0.05})`)
        mapTint.addColorStop(1, `rgba(${isLight ? '0,0,0' : '0,0,0'},${isLight ? 0.06 : 0.14})`)
        ctx.fillStyle = mapTint
        ctx.fill()
        ctx.restore()
      }

      // ── Sunlight highlight ──
      const hlX = cx - R * 0.3, hlY = cy - R * 0.3
      const hlGrad = ctx.createRadialGradient(hlX, hlY, 0, hlX, hlY, R * 0.4)
      hlGrad.addColorStop(0, `rgba(${isLight ? '255,255,255' : cyanRgb},${isLight ? 0.15 : 0.06})`)
      hlGrad.addColorStop(1, `rgba(${isLight ? '255,255,255' : cyanRgb},0)`)
      ctx.beginPath()
      ctx.arc(cx, cy, R, 0, Math.PI * 2)
      ctx.fillStyle = hlGrad
      ctx.fill()

      // ── Inner shadow for depth ──
      const shX = cx + R * 0.35, shY = cy + R * 0.35
      const shadowGrad = ctx.createRadialGradient(shX, shY, 0, cx, cy, R)
      shadowGrad.addColorStop(0, `rgba(0,0,0,${isLight ? 0.08 : 0.22})`)
      shadowGrad.addColorStop(0.6, `rgba(0,0,0,${isLight ? 0.02 : 0.08})`)
      shadowGrad.addColorStop(1, `rgba(0,0,0,0)`)
      ctx.beginPath()
      ctx.arc(cx, cy, R, 0, Math.PI * 2)
      ctx.fillStyle = shadowGrad
      ctx.fill()

      // ── Grid lines ──
      ctx.save()
      const gridGlowFactor = isLight ? 2.5 : 1
      // Latitude
      for (let lat = -80; lat <= 80; lat += 20) {
        ctx.beginPath()
        let first = true
        for (let lng2 = -180; lng2 <= 181; lng2 += 2) {
          const p3 = rotate(latLng3D(lat, lng2), ry, rx)
          if (p3.z < -0.02) { first = true; continue }
          const pp = proj(p3, cx, cy, R)
          if (first) { ctx.moveTo(pp.x, pp.y); first = false }
          else ctx.lineTo(pp.x, pp.y)
        }
        const eq = Math.abs(lat) < 1
        ctx.strokeStyle = eq
          ? `rgba(${accentRgb},${0.18 * gridGlowFactor})`
          : `rgba(${gridLineRgb},${(0.06 + Math.abs(lat) * 0.0005) * gridGlowFactor})`
        ctx.lineWidth = eq ? 0.7 : 0.35
        ctx.stroke()
      }
      // Longitude
      for (let lng2 = -180; lng2 < 180; lng2 += 20) {
        ctx.beginPath()
        let first = true
        for (let lat2 = -90; lat2 <= 90; lat2 += 2) {
          const p3 = rotate(latLng3D(lat2, lng2), ry, rx)
          if (p3.z < -0.02) { first = true; continue }
          const pp = proj(p3, cx, cy, R)
          if (first) { ctx.moveTo(pp.x, pp.y); first = false }
          else ctx.lineTo(pp.x, pp.y)
        }
        ctx.strokeStyle = `rgba(${gridLineRgb},${0.04 * gridGlowFactor})`
        ctx.lineWidth   = 0.35
        ctx.stroke()
      }
      ctx.restore()

      // ── Holographic hex lattice (animated tessellation dots) ──
      if (!s._hexOff) s._hexOff = 0
      s._hexOff += dt * 0.02
      ctx.save()
      for (let lat2 = -75; lat2 <= 75; lat2 += 15) {
        for (let lng2 = -165; lng2 <= 180; lng2 += 15) {
          const wave = Math.sin(s._hexOff + lat2 * 0.08) * 3
          const p3 = rotate(latLng3D(lat2 + wave * 0.1, lng2), ry, rx)
          if (p3.z < 0.05) continue
          const pp = proj(p3, cx, cy, R)
          const ha = Math.max(0, p3.z * 1.2) * 0.12
          ctx.beginPath()
          ctx.arc(pp.x, pp.y, 1.1, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(${cyanRgb},${ha})`
          ctx.fill()
        }
      }
      ctx.restore()

      // ── Holo scan sweep (bright lat-line sweeping the sphere) ──
      const sweepT = (ts * 0.00016) % 1
      const sweepLat = -80 + sweepT * 160
      ctx.save()
      ctx.beginPath()
      let firstSweep = true
      for (let lng2 = -180; lng2 <= 180; lng2 += 2) {
        const p3 = rotate(latLng3D(sweepLat, lng2), ry, rx)
        if (p3.z < 0.0) { firstSweep = true; continue }
        const pp = proj(p3, cx, cy, R)
        if (firstSweep) { ctx.moveTo(pp.x, pp.y); firstSweep = false }
        else ctx.lineTo(pp.x, pp.y)
      }
      ctx.strokeStyle = `rgba(${cyanRgb},${0.28 + 0.3 * Math.sin(sweepT * Math.PI)})`
      ctx.lineWidth   = 1.3
      ctx.shadowBlur  = 12
      ctx.shadowColor = `rgba(${cyanRgb},0.8)`
      ctx.stroke()
      ctx.restore()

      // ── Connection arcs + packets ──
      GLOBE_CONNECTIONS.forEach(([a, b], i) => {
        const ca  = cities3D[a], cb = cities3D[b]
        const pkt = s.packets[i]
        const isHovArc = (s.hovered === a || s.hovered === b)

        // Arc arc-sample cache
        const arc = []
        for (let k = 0; k <= ARC_SAMPLES; k++) {
          const t  = k / ARC_SAMPLES
          const pt = slerp(ca, cb, t)
          // Lift slightly above surface
          arc.push(proj({ x: pt.x * 1.035, y: pt.y * 1.035, z: pt.z * 1.035 }, cx, cy, R))
        }

        const avgZ     = (ca.z + cb.z) / 2
        const arcAlpha = Math.max(0, Math.min(1, (avgZ + 0.55) * 0.9))
        if (arcAlpha < 0.02) { pkt.t = (pkt.t + pkt.speed * dt) % 1; return }

        // Draw arc with gradient along its length
        ctx.save()
        ctx.lineWidth = isHovArc ? 1.4 : 0.85
        ctx.beginPath()
        let inPath = false
        for (let k = 0; k <= ARC_SAMPLES; k++) {
          const pt = arc[k]
          if (pt.z < -0.06) { inPath = false; continue }
          if (!inPath) { ctx.moveTo(pt.x, pt.y); inPath = true }
          else ctx.lineTo(pt.x, pt.y)
        }
        const arcBright = isHovArc ? 1 : 0.55
        ctx.strokeStyle = `rgba(${accentRgb},${arcAlpha * arcBright})`
        if (isHovArc) ctx.shadowBlur = 8, ctx.shadowColor = `rgba(${accentRgb},0.6)`
        ctx.stroke()
        ctx.restore()

        // Packet advance — with trail dots and splash rings
        pkt.t = (pkt.t + pkt.speed * dt) % 1
        const pkIdx = Math.floor(pkt.t * ARC_SAMPLES)
        const pkPt  = arc[Math.min(pkIdx, arc.length - 1)]
        if (pkPt && pkPt.z > -0.04) {
          const pAlpha = Math.max(0, Math.min(1, pkPt.z + 0.5)) * arcAlpha
          ctx.save()
          for (let trail = 1; trail <= 5; trail++) {
            const ti = Math.max(0, pkIdx - trail * 2)
            const tp = arc[Math.min(ti, arc.length - 1)]
            if (!tp || tp.z < -0.04) continue
            const tAlpha = pAlpha * (0.3 - trail * 0.05)
            if (tAlpha <= 0) continue
            ctx.beginPath()
            ctx.arc(tp.x, tp.y, 2.6 - trail * 0.35, 0, Math.PI * 2)
            ctx.fillStyle = `rgba(${greenRgb},${tAlpha})`
            ctx.fill()
          }
          ctx.shadowBlur  = 18
          ctx.shadowColor = `rgba(${greenRgb},0.9)`
          ctx.beginPath()
          ctx.arc(pkPt.x, pkPt.y, 3.8, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(${greenRgb},${pAlpha * 0.7})`
          ctx.fill()
          ctx.shadowBlur = 0
          ctx.beginPath()
          ctx.arc(pkPt.x, pkPt.y, 1.6, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(200,255,230,${pAlpha})`
          ctx.fill()
          ctx.restore()
          if (pkt.t > 0.95 && Math.random() < 0.12) {
            if (!s._splashes) s._splashes = []
            s._splashes.push({ x: pkPt.x, y: pkPt.y, t: 0 })
          }
        }
      })

      // ── Globe outline ──
      ctx.save()
      ctx.beginPath()
      ctx.arc(cx, cy, R, 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(${cyanRgb},0.14)`
      ctx.lineWidth   = 1.2
      ctx.stroke()
      ctx.restore()

      // ── City nodes ──
      citiesProj.forEach((pp, i) => {
        const city   = GLOBE_CITIES[i]
        const alpha  = Math.max(0, pp.z * 1.5)
        if (alpha < 0.04) return

        const isHub  = city.hub
        const isHov  = s.hovered === i
        const nodeR  = isHub ? 6.5 : isHov ? 5 : 3.8
        const cRGB   = isHub ? greenRgb : isHov ? '255,230,80' : cyanRgb

        // Outer glow
        const grd = ctx.createRadialGradient(pp.x, pp.y, 0, pp.x, pp.y, nodeR * 5)
        grd.addColorStop(0,   `rgba(${cRGB},${alpha * (isHov ? 0.5 : 0.28)})`)
        grd.addColorStop(0.4, `rgba(${cRGB},${alpha * 0.08})`)
        grd.addColorStop(1,   `rgba(${cRGB},0)`)
        ctx.beginPath()
        ctx.arc(pp.x, pp.y, nodeR * 5, 0, Math.PI * 2)
        ctx.fillStyle = grd
        ctx.fill()

        // Node body
        ctx.save()
        ctx.shadowBlur  = isHub ? 18 : isHov ? 14 : 9
        ctx.shadowColor = `rgba(${cRGB},0.95)`
        ctx.beginPath()
        ctx.arc(pp.x, pp.y, nodeR, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${cRGB},${Math.min(1, alpha)})`
        ctx.fill()
        // Bright centre
        ctx.shadowBlur = 0
        ctx.beginPath()
        ctx.arc(pp.x, pp.y, nodeR * 0.38, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(255,255,255,${alpha * 0.9})`
        ctx.fill()
        ctx.restore()

        // Label — visible on front half, always shown for hub or hovered
        const showLabel = pp.z > 0.08 || isHub || isHov
        if (showLabel) {
          ctx.save()
          ctx.globalAlpha = Math.min(1, alpha * 1.2)
          ctx.font        = `${isHub || isHov ? 9 : 7.5}px monospace`
          ctx.fillStyle   = isHub
            ? `rgba(${greenRgb},0.95)`
            : isHov
              ? 'rgba(255,235,100,0.95)'
              : `rgba(${cyanRgb},0.88)`
          ctx.textAlign   = 'center'
          // Offset label up+right so it doesn't overlap node
          ctx.fillText(city.name, pp.x + (isHov ? 2 : 0), pp.y - nodeR - 6)
          ctx.restore()
        }

        // Hover tooltip card
        if (isHov) {
          const tx = Math.min(pp.x + 14, W - 100)
          const ty = Math.max(pp.y - 44, 8)
          ctx.save()
          ctx.fillStyle   = `rgba(${bgRgb},0.92)`
          ctx.strokeStyle = 'rgba(255,230,80,0.7)'
          ctx.lineWidth   = 0.8
          ctx.beginPath()
          ctx.roundRect ? ctx.roundRect(tx, ty, 98, 38, 4)
            : (() => { ctx.rect(tx, ty, 98, 38) })()
          ctx.fill(); ctx.stroke()
          ctx.font      = '7px monospace'
          ctx.fillStyle = 'rgba(255,230,80,0.9)'
          ctx.textAlign = 'left'
          ctx.fillText(city.name, tx + 8, ty + 13)
          ctx.font      = '6px monospace'
          ctx.fillStyle = `rgba(${cyanRgb},0.7)`
          ctx.fillText(`${city.lat.toFixed(1)}°N  ${Math.abs(city.lng).toFixed(1)}°${city.lng < 0 ? 'W' : 'E'}`, tx + 8, ty + 25)
          ctx.fillStyle = city.hub ? `rgba(${greenRgb},0.85)` : `rgba(${cyanRgb},0.7)`
          ctx.fillText(city.hub ? '★ HUB NODE' : '● EDGE NODE', tx + 8, ty + 35)
          ctx.restore()
        }
      })

      // ── Hub pulse rings ──
      GLOBE_CITIES.forEach((city, i) => {
        if (!city.hub) return
        const pp = citiesProj[i]
        const alpha = Math.max(0, pp.z * 1.5)
        if (alpha < 0.08) return
        const pulse = 1 + Math.sin(ts * 0.003 + i) * 0.6
        ctx.save()
        ctx.beginPath()
        ctx.arc(pp.x, pp.y, 16 * pulse, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(${greenRgb},${alpha * 0.15 * (2 - pulse)})`
        ctx.lineWidth = 1.2
        ctx.stroke()
        ctx.restore()
      })

      // ── Current visitor marker + sci-fi great-circle trace ──
      const visitorLat = Number(liveVisitor?.lat)
      const visitorLon = Number(liveVisitor?.lon)
      if (Number.isFinite(visitorLat) && Number.isFinite(visitorLon)) {
        const v3 = rotate(latLng3D(visitorLat, visitorLon), ry, rx)
        const vp = proj(v3, cx, cy, R)
        const alpha = Math.max(0, v3.z * 1.4)

        // Progressive great-circle trace: RIYADH hub -> visitor
        const hubIdx = 9
        const hubBase = base3D[hubIdx]
        const visitorBase = latLng3D(visitorLat, visitorLon)
        const traceKey = `${visitorLat.toFixed(3)},${visitorLon.toFixed(3)}`
        if (!s._trace || s._trace.key !== traceKey) {
          s._trace = { key: traceKey, t: 0, pings: [], pingTimer: 0 }
          if (!s.drag) {
            s._face = visitorBase
            s._faceHold = 0
          }
        }
        const tr = s._trace
        tr.t = Math.min(1, tr.t + dt * 0.0018)
        tr.pingTimer += dt
        if (tr.pingTimer > 70) {
          tr.pingTimer = 0
          tr.pings.push({ r: 0 })
        }
        tr.pings.forEach(p => { p.r += dt * 0.02 })
        tr.pings = tr.pings.filter(p => p.r < 1.5)

        // Trace line (partial or full great-circle)
        ctx.save()
        ctx.lineCap = 'round'
        const tracePts = []
        const SAMPLES = 90
        for (let k = 0; k <= SAMPLES; k++) {
          const tt = (k / SAMPLES) * tr.t
          const mid = slerp(hubBase, visitorBase, tt)
          const pm = rotate(mid, ry, rx)
          if (pm.z > -0.03) tracePts.push(proj(pm, cx, cy, R))
        }
        if (tracePts.length > 1) {
          const full = tr.t >= 1
          const glowA = full ? 0.12 + 0.08 * Math.sin(ts * 0.004) : 0.18
          ctx.save()
          ctx.shadowBlur = 14
          ctx.shadowColor = `rgba(${greenRgb},0.9)`
          ctx.strokeStyle = `rgba(${greenRgb},${glowA})`
          ctx.lineWidth = 3.5
          ctx.beginPath()
          ctx.moveTo(tracePts[0].x, tracePts[0].y)
          for (let k = 1; k < tracePts.length; k++) ctx.lineTo(tracePts[k].x, tracePts[k].y)
          ctx.stroke()
          ctx.shadowBlur = 0
          ctx.setLineDash([3, 6])
          ctx.lineDashOffset = -ts * 0.02
          ctx.strokeStyle = `rgba(${greenRgb},${full ? 0.5 + 0.2 * Math.sin(ts * 0.004) : 0.75})`
          ctx.lineWidth = 1.2
          ctx.beginPath()
          ctx.moveTo(tracePts[0].x, tracePts[0].y)
          for (let k = 1; k < tracePts.length; k++) ctx.lineTo(tracePts[k].x, tracePts[k].y)
          ctx.stroke()
          ctx.setLineDash([])
          ctx.restore()

          // Comet head riding the trace
          if (!full && tracePts.length > 2) {
            const head = tracePts[tracePts.length - 1]
            const prev = tracePts[tracePts.length - 2]
            const ang = Math.atan2(head.y - prev.y, head.x - prev.x)
            ctx.save()
            ctx.translate(head.x, head.y)
            ctx.rotate(ang)
            ctx.shadowBlur = 16
            ctx.shadowColor = `rgba(${greenRgb},1)`
            ctx.beginPath()
            ctx.arc(0, 0, 3.2, 0, Math.PI * 2)
            ctx.fillStyle = 'rgba(220,255,235,0.95)'
            ctx.fill()
            ctx.shadowBlur = 0
            ctx.beginPath()
            ctx.moveTo(-14, 0)
            ctx.lineTo(0, -2.2)
            ctx.lineTo(0, 2.2)
            ctx.closePath()
            const cg = ctx.createLinearGradient(-14, 0, 0, 0)
            cg.addColorStop(0, 'rgba(30,140,90,0)')
            cg.addColorStop(1, `rgba(${greenRgb},0.85)`)
            ctx.fillStyle = cg
            ctx.fill()
            ctx.restore()
          }
        }
        ctx.restore()

        // Expanding radar pings from the visitor
        if (alpha > 0.05) {
          tr.pings.forEach(p => {
            const ringR = 12 + p.r * 46
            ctx.save()
            ctx.strokeStyle = `rgba(${greenRgb},${alpha * 0.55 * (1 - p.r / 1.5)})`
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.arc(vp.x, vp.y, ringR, 0, Math.PI * 2)
            ctx.stroke()
            ctx.restore()
          })
        }

        // Visitor marker + rotating targeting reticle
        if (alpha > 0.05) {
          const pulse = 1 + Math.sin(ts * 0.006) * 0.18
          const retAng = ts * 0.0012
          const retR = 16
          ctx.save()
          ctx.translate(vp.x, vp.y)
          ctx.save()
          ctx.shadowBlur = 22
          ctx.shadowColor = `rgba(${greenRgb},0.95)`
          ctx.strokeStyle = `rgba(${greenRgb},${alpha * 0.95})`
          ctx.fillStyle = `rgba(${greenRgb},${alpha * 0.2})`
          ctx.lineWidth = 1.3
          ctx.beginPath()
          ctx.arc(0, 0, 11 * pulse, 0, Math.PI * 2)
          ctx.fill()
          ctx.stroke()
          ctx.beginPath()
          ctx.arc(0, 0, 4.4, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(220,255,235,${alpha})`
          ctx.fill()
          ctx.restore()
          // Rotating bracket reticle
          for (let k = 0; k < 4; k++) {
            const a0 = retAng + (k * Math.PI) / 2
            const a1 = a0 + 0.55
            ctx.beginPath()
            ctx.arc(0, 0, retR, a0, a1)
            ctx.strokeStyle = `rgba(${cyanRgb},${alpha * 0.8})`
            ctx.lineWidth = 1.4
            ctx.shadowBlur = 8
            ctx.shadowColor = `rgba(${cyanRgb},0.9)`
            ctx.stroke()
            ctx.shadowBlur = 0
          }
          ctx.rotate(-retAng * 1.6)
          for (let k = 0; k < 2; k++) {
            const d = k === 0 ? -1 : 1
            ctx.beginPath()
            ctx.moveTo(retR + 6, d * 5)
            ctx.lineTo(retR + 1, d * 5)
            ctx.strokeStyle = `rgba(${cyanRgb},${alpha * 0.6})`
            ctx.lineWidth = 1
            ctx.stroke()
          }
          ctx.restore()
          ctx.save()
          ctx.font = '8px monospace'
          ctx.textAlign = 'center'
          ctx.fillStyle = `rgba(${greenRgb},${Math.min(1, alpha * 1.2)})`
          ctx.fillText('YOU', vp.x, vp.y - 26)
          ctx.restore()
        }
      }

      // ── Drag hint (fade after first interaction) ──
      if (!s._everDragged && ts < 4000) {
        ctx.save()
        const hintAlpha = Math.max(0, Math.min(0.55, (4000 - ts) / 3000))
        ctx.globalAlpha = hintAlpha
        ctx.font        = '8px monospace'
        ctx.fillStyle   = `rgba(${cyanRgb},1)`
        ctx.textAlign   = 'center'
        ctx.fillText('DRAG · SCROLL TO ZOOM · PINCH', cx, H - 14)
        ctx.restore()
      }

      animRef.current = requestAnimationFrame(frame)
    }

    animRef.current = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(animRef.current)
  }, [themeKey])

  // Mark as dragged on first interaction
  const markDragged = () => { stateRef.current._everDragged = true }

  return (
    <div className="globe-network-shell" ref={wrapRef} onMouseDown={markDragged} onTouchStart={markDragged} style={{
      width: '100%', height: '100%', minHeight: 560,
      position: 'relative', overflow: 'hidden',
      background: 'transparent',
    }}>
      {/* Floating title — top left */}
      <div className="globe-network-title" style={{
        position: 'absolute', top: 10, left: 14, zIndex: 3,
        fontFamily: 'var(--font-mono)', fontSize: 7, letterSpacing: 3,
        color: 'var(--cyan)', opacity: 0.55, pointerEvents: 'none',
      }}>
        GLOBAL NETWORK · LIVE CONNECTION MAP
      </div>

      {/* Floating stats — top right */}
      <div className="globe-network-stats" style={{
        position: 'absolute', top: 8, right: 14, zIndex: 3,
        display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'flex-end',
        pointerEvents: 'none',
      }}>
        {[
          { label: 'NODES',   value: `${GLOBE_CITIES.length}`,     color: 'var(--cyan)'  },
          { label: 'ARCS',    value: `${GLOBE_CONNECTIONS.length}`, color: 'var(--green)' },
          { label: 'LATENCY', value: '12ms',                        color: 'var(--cyan)'  },
          { label: 'UPTIME',  value: '99.99%',                      color: 'var(--green)' },
        ].map(s => (
          <div key={s.label} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 5.5, color: 'var(--muted)', letterSpacing: 2 }}>{s.label}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9,   color: s.color,       fontWeight: 700  }}>{s.value}</span>
          </div>
        ))}
      </div>

      {/* Canvas — fills entire panel */}
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }}/>

      {/* Visitor info card — bottom left */}
      <div className="globe-visitor-shell" style={{
        position: 'absolute', bottom: 12, left: 14, zIndex: 3,
        display: 'flex', flexDirection: 'column', gap: 4,
        pointerEvents: 'none', maxWidth: 'calc(100% - 28px)',
      }}>
        {visitor ? (
          <div className="globe-visitor-card" style={{
            borderRadius: 6,
            padding: '9px 11px',
            display: 'grid',
            gridTemplateColumns: '96px minmax(0, 1fr)',
            columnGap: 10,
            rowGap: 4,
            width: 330,
            maxWidth: '100%',
          }}>
            <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 7, color: 'var(--green)', letterSpacing: 2 }}>VISITOR TRACE</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 6, color: 'var(--muted)', letterSpacing: 1.4 }}>{visitor.updatedAt || 'LIVE'}</span>
            </div>
            {[
              ['IP ADDRESS',     visitor.ip],
              ['IP TYPE',        visitor.ipType],
              ['LOCATION',       `${visitor.flag && visitor.flag !== '—' ? visitor.flag + ' ' : ''}${visitor.city || '—'}, ${visitor.country || '—'}`],
              ['APPROX ADDRESS', visitor.address],
              ['REGION',         visitor.region],
              ['POSTAL',         visitor.postal],
              ['COORDINATES',    `${visitor.lat || '—'}°, ${visitor.lon || '—'}°`],
              ['TIMEZONE',       [visitor.tz, visitor.utc].filter(v => v && v !== '—').join(' ') || '—'],
              ['ISP / ORG',      visitor.org],
              ['NETWORK',        visitor.network],
              ['ASN',            visitor.asn],
              ['CURRENCY',       visitor.currency],
            ].filter(([, val]) => val && val !== '—' && val !== '—, —' && val !== '°, °').map(([label, val]) => (
              <div key={label} style={{ display: 'contents' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 6, color: 'var(--muted)', letterSpacing: 1.4, lineHeight: '1.55' }}>{label}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 7.5, color: label === 'APPROX ADDRESS' ? 'var(--green)' : 'var(--cyan)', fontWeight: 700, lineHeight: '1.55', wordBreak: 'break-word' }}>{val}</span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 6, color: 'var(--muted)',
            letterSpacing: 1.5, opacity: 0.6,
          }}>
            LOCATING VISITOR…
          </div>
        )}
      </div>
    </div>
  )
}
