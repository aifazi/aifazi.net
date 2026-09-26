'use client'
import { useState, useEffect } from 'react'
import { SvgWrap } from './shared'

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

export { MiniSparkline }
export default MonitorMode
