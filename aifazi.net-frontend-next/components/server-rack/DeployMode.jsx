'use client'
import { useState, useEffect } from 'react'
import { SvgWrap } from './shared'

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

export default DeployMode
