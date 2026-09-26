'use client'
import { useState, useEffect } from 'react'
import { SvgWrap } from './shared'

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

export default ThreatMode
