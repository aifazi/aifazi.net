'use client'
import { useState, useEffect } from 'react'
import { SvgWrap } from './shared'

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

export default DatacenterMode
