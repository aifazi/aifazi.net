'use client'
import { useState, useEffect, useRef } from 'react'

// ── Style: Terminal (original boot sequence) ──────────────────────────────────
const BOOT_LINES = [
  { text: 'Initializing system...', delay: 0 },
  { text: 'Loading kernel modules...', delay: 80 },
  { text: 'Mounting network interfaces...', delay: 160 },
  { text: 'eth0: connected [100Mbps]', delay: 240, color: 'var(--green)' },
  { text: 'Authenticating security layer...', delay: 320 },
  { text: 'Firewall rules applied [OK]', delay: 400, color: 'var(--green)' },
  { text: 'Establishing encrypted tunnel...', delay: 480 },
  { text: 'SSL certificate verified [OK]', delay: 560, color: 'var(--green)' },
  { text: 'Loading portfolio assets...', delay: 640 },
  { text: 'All systems operational.', delay: 720, color: 'var(--cyan)' },
]

function TerminalLoader({ onComplete }) {
  const [lines, setLines] = useState([])
  const [progress, setProgress] = useState(0)
  const [exiting, setExiting] = useState(false)
  useEffect(() => {
    BOOT_LINES.forEach(line => {
      setTimeout(() => {
        setLines(p => [...p, line])
        setProgress(Math.round(((BOOT_LINES.indexOf(line) + 1) / BOOT_LINES.length) * 100))
      }, line.delay)
    })
    const t = setTimeout(() => { setExiting(true); setTimeout(onComplete, 300) }, 1000)
    return () => clearTimeout(t)
  }, [])
  return (
    <div style={{ opacity: exiting ? 0 : 1, transform: exiting ? 'scale(1.05)' : 'scale(1)', transition: 'opacity .6s,transform .6s', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', width:'100%' }}>
      <div style={{ fontFamily:'var(--font-display)', fontSize:'clamp(48px,8vw,80px)', fontWeight:700, letterSpacing:-2, marginBottom:48, textAlign:'center', animation:'fadeDown .6s ease both', position:'relative', zIndex:1 }}>
        TANVIR<span style={{ color:'var(--green)' }}>.</span>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--muted)', letterSpacing:6, marginTop:8, fontWeight:400 }}>NETWORK ENGINEER & IT SPECIALIST</div>
      </div>
      <div style={{ width:'100%', maxWidth:520, background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:6, overflow:'hidden', boxShadow:'0 0 60px rgba(0,255,136,0.1)', animation:'fadeUp .6s .2s ease both', position:'relative', zIndex:1 }}>
        <div style={{ background:'rgba(0,212,255,0.08)', padding:'10px 16px', display:'flex', alignItems:'center', gap:8, borderBottom:'1px solid var(--border)' }}>
          {['#ff5f56','#ffbd2e','#27c93f'].map(c => <div key={c} style={{ width:10, height:10, borderRadius:'50%', background:c }} />)}
          <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--muted)', letterSpacing:2, margin:'0 auto' }}>boot.sh — tanvir@portfolio</div>
        </div>
        <div style={{ padding:'16px 20px', minHeight:'min(240px, 40vh)' }}>
          {lines.map((line, i) => (
            <div key={i} style={{ fontFamily:'var(--font-mono)', fontSize:12, lineHeight:2, color:line.color||'var(--text)', animation:'fadeUp .3s ease both' }}>
              <span style={{ color:'var(--green)', marginRight:8 }}>{'>'}</span>{line.text}
            </div>
          ))}
          {lines.length < BOOT_LINES.length && <span style={{ display:'inline-block', width:8, height:14, background:'var(--green)', animation:'blink .8s infinite', verticalAlign:'middle', marginTop:8 }} />}
        </div>
        <div style={{ padding:'0 24px 20px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
            <span style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--muted)', letterSpacing:2 }}>LOADING</span>
            <span style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--green)' }}>{progress}%</span>
          </div>
          <div style={{ height:2, background:'rgba(255,255,255,0.06)', overflow:'hidden' }}>
            <div style={{ height:'100%', width:`${progress}%`, background:'linear-gradient(to right,var(--green),var(--cyan))', boxShadow:'0 0 10px rgba(0,255,136,0.6)', transition:'width .3s ease' }} />
          </div>
        </div>
      </div>
    </div>
  )
}

function MinimalLoader({ onComplete }) {
  const [exiting, setExiting] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => { setExiting(true); setTimeout(onComplete, 200) }, 900)
    return () => clearTimeout(t)
  }, [])
  return (
    <div style={{ opacity: exiting ? 0 : 1, transform: exiting ? 'translateY(-10px)' : 'none', transition: 'opacity .5s,transform .5s', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:32 }}>
      <div style={{ position:'relative', width:64, height:64 }}>
        <div style={{ position:'absolute', inset:0, borderRadius:'50%', border:'1.5px solid transparent', borderTopColor:'var(--green)', borderBottomColor:'var(--cyan)', animation:'ls-spin 1.1s linear infinite' }} />
        <div style={{ position:'absolute', inset:10, borderRadius:'50%', border:'1px solid transparent', borderLeftColor:'var(--green)', animation:'ls-spinr .7s linear infinite' }} />
        <div style={{ position:'absolute', inset:'50%', transform:'translate(-50%,-50%)', width:8, height:8, borderRadius:'50%', background:'var(--green)', boxShadow:'0 0 12px var(--green)' }} />
      </div>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontFamily:'var(--font-display)', fontSize:32, fontWeight:700, letterSpacing:-1, marginBottom:6 }}>TANVIR<span style={{ color:'var(--green)' }}>.</span></div>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--muted)', letterSpacing:4 }}>INITIALIZING</div>
      </div>
    </div>
  )
}

function GlitchLoader({ onComplete }) {
  const [phase, setPhase] = useState(0)
  const [exiting, setExiting] = useState(false)
  useEffect(() => {
    [100, 200, 350, 550, 750].forEach((t, i) => setTimeout(() => setPhase(i + 1), t))
    const done = setTimeout(() => { setExiting(true); setTimeout(onComplete, 200) }, 1000)
    return () => clearTimeout(done)
  }, [])
  return (
    <div style={{ opacity: exiting ? 0 : 1, transition: 'opacity .5s', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
      <div style={{ position:'relative', fontFamily:'var(--font-display)', fontSize:'clamp(52px,10vw,96px)', fontWeight:700, letterSpacing:-2, userSelect:'none' }}>
        <span style={{ color:'var(--text)' }}>TANVIR</span><span style={{ color:'var(--green)' }}>.</span>
        <span aria-hidden style={{ position:'absolute', inset:0, color:'var(--cyan)', clipPath:'polygon(0 0,100% 0,100% 35%,0 35%)', animation:'glitch-t 2s infinite', opacity:.7 }}>TANVIR.</span>
        <span aria-hidden style={{ position:'absolute', inset:0, color:'#ff2d8b', clipPath:'polygon(0 65%,100% 65%,100% 100%,0 100%)', animation:'glitch-b 2s .12s infinite', opacity:.7 }}>TANVIR.</span>
      </div>
      <div style={{ marginTop:24, fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:6, color:'var(--muted)' }}>
        {['▓▓▓░░░░░░░','▓▓▓▓▓▓░░░░','▓▓▓▓▓▓▓▓░░','▓▓▓▓▓▓▓▓▓░','▓▓▓▓▓▓▓▓▓▓'][Math.min(phase,4)]}
      </div>
      <style>{`
        @keyframes glitch-t{0%{transform:translate(0)}20%{transform:translate(-3px,1px)}40%{transform:translate(3px,-1px)}60%{transform:translate(0)}80%{transform:translate(-2px,0)}100%{transform:translate(0)}}
        @keyframes glitch-b{0%{transform:translate(0)}25%{transform:translate(3px,1px)}50%{transform:translate(-3px,-1px)}75%{transform:translate(0)}100%{transform:translate(2px,0)}}
      `}</style>
    </div>
  )
}

function MatrixLoader({ onComplete }) {
  const canvasRef = useRef(null)
  const [exiting, setExiting] = useState(false)
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d')
    canvas.width = window.innerWidth; canvas.height = window.innerHeight
    const cols = Math.floor(canvas.width / 16), drops = Array(cols).fill(1)
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ﾊﾐﾋｰｳｼﾅﾓﾆｻﾜﾂｵﾘｱﾎﾃﾏｹﾒｴｶｷﾑﾕﾗｾﾈｽﾀﾇﾍ'
    let raf
    const draw = () => {
      ctx.fillStyle = 'rgba(6,10,15,0.05)'; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.font = '14px monospace'
      drops.forEach((y,i) => {
        ctx.fillStyle = Math.random() > 0.95 ? '#fff' : '#00ff88'
        ctx.fillText(chars[Math.floor(Math.random()*chars.length)], i*16, y*16)
        if (y*16 > canvas.height && Math.random() > 0.975) drops[i] = 0
        drops[i]++
      }); raf = requestAnimationFrame(draw)
    }
    draw()
    const done = setTimeout(() => { setExiting(true); setTimeout(onComplete, 300) }, 1200)
    return () => { cancelAnimationFrame(raf); clearTimeout(done) }
  }, [])
  return (
    <div style={{ opacity: exiting ? 0 : 1, transition:'opacity .6s', position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <canvas ref={canvasRef} style={{ position:'absolute', inset:0 }} />
      <div style={{ position:'relative', zIndex:1, textAlign:'center', background:'rgba(6,10,15,0.7)', padding:'24px 40px', border:'1px solid rgba(0,255,136,0.3)', backdropFilter:'blur(4px)' }}>
        <div style={{ fontFamily:'var(--font-display)', fontSize:48, fontWeight:700, color:'#00ff88', letterSpacing:-1, textShadow:'0 0 20px rgba(0,255,136,0.8)' }}>TANVIR<span style={{ color:'var(--cyan)' }}>.</span></div>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--muted)', letterSpacing:4, marginTop:8 }}>DECRYPTING PORTFOLIO</div>
      </div>
    </div>
  )
}

function SplashLoader({ onComplete }) {
  const [step, setStep] = useState(0)
  const [exiting, setExiting] = useState(false)
  useEffect(() => {
    [80, 250, 420, 620, 820].forEach((t,i) => setTimeout(() => setStep(i+1), t))
    const done = setTimeout(() => { setExiting(true); setTimeout(onComplete, 300) }, 1200)
    return () => clearTimeout(done)
  }, [])
  const items = ['NETWORK ENGINEER','IT SPECIALIST','WEB DEVELOPER','SYSTEM ARCHITECT']
  return (
    <div style={{ opacity: exiting ? 0 : 1, transform: exiting ? 'scale(0.95)' : 'scale(1)', transition:'opacity .7s,transform .7s', display:'flex', flexDirection:'column', alignItems:'center', width:'100%' }}>
      <div style={{ overflow:'hidden', marginBottom:12 }}>
        <div style={{ fontFamily:'var(--font-display)', fontSize:'clamp(56px,12vw,120px)', fontWeight:700, letterSpacing:-3, lineHeight:1, transform: step>=1 ? 'translateY(0)' : 'translateY(100%)', transition:'transform .7s cubic-bezier(0.16,1,0.3,1)' }}>T<span style={{ color:'var(--green)' }}>.</span>TANVIR</div>
      </div>
      <div style={{ overflow:'hidden', marginBottom:32 }}>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:11, letterSpacing:6, color:'var(--muted)', transform: step>=2 ? 'translateY(0)' : 'translateY(100%)', transition:'transform .6s .1s cubic-bezier(0.16,1,0.3,1)' }}>{items[Math.min(step-2,items.length-1)]||items[0]}</div>
      </div>
      <div style={{ width: step>=3 ? '240px' : '0px', height:1, background:'linear-gradient(90deg,transparent,var(--green),transparent)', transition:'width .8s .2s ease', marginBottom:32 }} />
      <div style={{ display:'flex', gap:8, opacity: step>=4 ? 1 : 0, transition:'opacity .4s' }}>
        {[0,1,2].map(i => <div key={i} style={{ width:6, height:6, borderRadius:'50%', background:'var(--green)', animation:`ls-bounce .8s ${i*.15}s ease-in-out infinite alternate`, boxShadow:'0 0 8px var(--green)' }} />)}
      </div>
    </div>
  )
}

// ── Style: Pulse ──────────────────────────────────────────────────────────────
function PulseLoader({ onComplete }) {
  const [exiting, setExiting] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => { setExiting(true); setTimeout(onComplete, 300) }, 1100)
    return () => clearTimeout(t)
  }, [])
  return (
    <div style={{ opacity: exiting ? 0 : 1, transition: 'opacity .5s', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:40 }}>
      <div style={{ position:'relative', width:120, height:120, display:'flex', alignItems:'center', justifyContent:'center' }}>
        {[0,1,2].map(i => (
          <div key={i} style={{ position:'absolute', inset: i*16, borderRadius:'50%', border:`${1.5-i*0.3}px solid ${i===0?'var(--green)':i===1?'var(--cyan)':'rgba(0,255,136,0.3)'}`, animation:`ls-pulse-ring ${1.4+i*0.3}s ${i*0.2}s ease-in-out infinite` }} />
        ))}
        <div style={{ width:16, height:16, borderRadius:'50%', background:'var(--green)', boxShadow:'0 0 20px var(--green)', animation:'ls-pulse-core 1.4s ease-in-out infinite' }} />
      </div>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontFamily:'var(--font-display)', fontSize:36, fontWeight:700, letterSpacing:-1, marginBottom:6 }}>TANVIR<span style={{ color:'var(--green)' }}>.</span></div>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--muted)', letterSpacing:4 }}>CONNECTING</div>
      </div>
      <style>{`@keyframes ls-pulse-ring{0%,100%{transform:scale(1);opacity:0.5}50%{transform:scale(1.15);opacity:1}}@keyframes ls-pulse-core{0%,100%{transform:scale(1)}50%{transform:scale(1.3)}}`}</style>
    </div>
  )
}

// ── Style: Cyber ──────────────────────────────────────────────────────────────
function CyberLoader({ onComplete }) {
  const [lit, setLit] = useState([])
  const [exiting, setExiting] = useState(false)
  const COLS = 8, ROWS = 5, TOTAL = COLS * ROWS
  useEffect(() => {
    const order = Array.from({ length: TOTAL }, (_, i) => i).sort(() => Math.random() - 0.5)
    order.forEach((idx, i) => setTimeout(() => setLit(p => [...p, idx]), i * (800 / TOTAL)))
    const done = setTimeout(() => { setExiting(true); setTimeout(onComplete, 300) }, 1100)
    return () => clearTimeout(done)
  }, [])
  return (
    <div style={{ opacity: exiting ? 0 : 1, transition: 'opacity .5s', display:'flex', flexDirection:'column', alignItems:'center', gap:32 }}>
      <div style={{ fontFamily:'var(--font-display)', fontSize:36, fontWeight:700, letterSpacing:-1 }}>TANVIR<span style={{ color:'var(--green)' }}>.</span></div>
      <div style={{ display:'grid', gridTemplateColumns:`repeat(${COLS},1fr)`, gap:5 }}>
        {Array.from({ length: TOTAL }, (_, i) => (
          <div key={i} style={{ width:18, height:18, borderRadius:3, background: lit.includes(i) ? 'var(--cyan)' : 'rgba(0,212,255,0.08)', border:`1px solid ${lit.includes(i) ? 'rgba(0,212,255,0.8)' : 'rgba(0,212,255,0.2)'}`, boxShadow: lit.includes(i) ? '0 0 8px rgba(0,212,255,0.6)' : 'none', transition:'all 0.1s' }} />
        ))}
      </div>
      <div style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--muted)', letterSpacing:4 }}>BOOT SEQUENCE</div>
    </div>
  )
}

// ── Style: Bars ───────────────────────────────────────────────────────────────
function BarsLoader({ onComplete }) {
  const [progress, setProgress] = useState(0)
  const [exiting, setExiting] = useState(false)
  const BARS = [
    { label: 'KERNEL',    color: 'var(--green)' },
    { label: 'NETWORK',   color: 'var(--cyan)'  },
    { label: 'ASSETS',    color: 'var(--green)' },
    { label: 'PORTFOLIO', color: 'var(--cyan)'  },
  ]
  useEffect(() => {
    const iv = setInterval(() => setProgress(p => { if (p >= 100) { clearInterval(iv); return 100 } return p + 5 }), 40)
    const done = setTimeout(() => { setExiting(true); setTimeout(onComplete, 300) }, 1200)
    return () => { clearInterval(iv); clearTimeout(done) }
  }, [])
  return (
    <div style={{ opacity: exiting ? 0 : 1, transition: 'opacity .5s', display:'flex', flexDirection:'column', alignItems:'center', gap:32, width:'100%', maxWidth:400, padding:'0 24px' }}>
      <div style={{ fontFamily:'var(--font-display)', fontSize:36, fontWeight:700, letterSpacing:-1 }}>TANVIR<span style={{ color:'var(--green)' }}>.</span></div>
      <div style={{ width:'100%', display:'flex', flexDirection:'column', gap:12 }}>
        {BARS.map((b, i) => {
          const p = Math.min(100, Math.max(0, progress - i * 15))
          return (
            <div key={b.label}>
              <div style={{ display:'flex', justifyContent:'space-between', fontFamily:'var(--font-mono)', fontSize:9, color:'var(--muted)', letterSpacing:2, marginBottom:5 }}>
                <span>{b.label}</span><span style={{ color: b.color }}>{Math.round(p)}%</span>
              </div>
              <div style={{ height:3, background:'rgba(255,255,255,0.05)', borderRadius:2, overflow:'hidden' }}>
                <div style={{ height:'100%', width:`${p}%`, background:`linear-gradient(90deg,${b.color},rgba(0,255,136,0.4))`, boxShadow:`0 0 8px ${b.color}`, transition:'width .05s linear', borderRadius:2 }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Style: Wave ───────────────────────────────────────────────────────────────
function WaveLoader({ onComplete }) {
  const [exiting, setExiting] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => { setExiting(true); setTimeout(onComplete, 300) }, 1100)
    return () => clearTimeout(t)
  }, [])
  return (
    <div style={{ opacity: exiting ? 0 : 1, transition: 'opacity .5s', display:'flex', flexDirection:'column', alignItems:'center', gap:40 }}>
      <div style={{ fontFamily:'var(--font-display)', fontSize:36, fontWeight:700, letterSpacing:-1 }}>TANVIR<span style={{ color:'var(--green)' }}>.</span></div>
      <div style={{ display:'flex', alignItems:'flex-end', gap:6, height:48 }}>
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i} style={{ width:6, borderRadius:3, background: i % 2 === 0 ? 'var(--green)' : 'var(--cyan)', animation:`ls-wave-bar 1.2s ${i*0.08}s ease-in-out infinite` }} />
        ))}
      </div>
      <div style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--muted)', letterSpacing:4 }}>LOADING</div>
      <style>{`@keyframes ls-wave-bar{0%,100%{height:8px;opacity:0.4}50%{height:44px;opacity:1}}`}</style>
    </div>
  )
}

// ── Style: Neon ───────────────────────────────────────────────────────────────
function NeonLoader({ onComplete }) {
  const [exiting, setExiting] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => { setExiting(true); setTimeout(onComplete, 300) }, 1200)
    return () => clearTimeout(t)
  }, [])
  return (
    <div style={{ opacity: exiting ? 0 : 1, transition: 'opacity .5s', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:24 }}>
      <div style={{ fontFamily:'var(--font-display)', fontSize:'clamp(52px,10vw,96px)', fontWeight:900, letterSpacing:4, color:'#fff', textTransform:'uppercase', animation:'ls-neon-flicker 3s infinite', textShadow:'0 0 10px #00ff88,0 0 30px #00ff88,0 0 60px #00ff88,0 0 120px rgba(0,255,136,0.5)' }}>TANVIR</div>
      <div style={{ fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:8, color:'var(--cyan)', animation:'ls-neon-sub 3s 0.3s infinite', textShadow:'0 0 8px var(--cyan)' }}>NETWORK ENGINEER</div>
      <style>{`
        @keyframes ls-neon-flicker{0%,100%{opacity:1;text-shadow:0 0 10px #00ff88,0 0 30px #00ff88,0 0 60px #00ff88}45%{opacity:0.15;text-shadow:none}50%{opacity:1;text-shadow:0 0 10px #00ff88,0 0 30px #00ff88,0 0 60px #00ff88}75%{opacity:0.3;text-shadow:none}80%{opacity:1;text-shadow:0 0 10px #00ff88,0 0 30px #00ff88,0 0 60px #00ff88}}
        @keyframes ls-neon-sub{0%,100%{opacity:1}45%{opacity:0.1}50%{opacity:1}75%{opacity:0.2}80%{opacity:1}}
      `}</style>
    </div>
  )
}

// ── Style: Orbit (animejs) ────────────────────────────────────────────────────
// Three dots orbit a center point at different radii and speeds using animejs.
function OrbitLoader({ onComplete }) {
  const dotRefs = [useRef(null), useRef(null), useRef(null)]
  const [exiting, setExiting] = useState(false)

  useEffect(() => {
    let animations = []
    const ORBITS = [
      { radius: 36, duration: 1200, color: 'var(--green)',  size: 8,  delay: 0 },
      { radius: 56, duration: 1800, color: 'var(--cyan)',   size: 6,  delay: 200 },
      { radius: 74, duration: 2600, color: 'rgba(0,255,136,0.45)', size: 5, delay: 100 },
    ]

    import('gsap').then(m => {
      const gsap = m.gsap
      ORBITS.forEach((orb, i) => {
        const el = dotRefs[i].current
        if (!el) return
        const proxy = { angle: 0 }
        const anim = gsap.to(proxy, {
          angle: 360,
          duration: orb.duration / 1000,
          ease: 'none',
          repeat: -1,
          delay: orb.delay / 1000,
          onUpdate: () => {
            const rad = (proxy.angle * Math.PI) / 180
            el.style.transform = `translate(${Math.cos(rad) * orb.radius}px, ${Math.sin(rad) * orb.radius}px)`
          },
        })
        animations.push(anim)
      })
    })

    const done = setTimeout(() => { setExiting(true); setTimeout(onComplete, 400) }, 1400)
    return () => {
      animations.forEach(a => a?.pause?.())
      clearTimeout(done)
    }
  }, [])

  const ORBITS = [
    { radius: 36, color: 'var(--green)',  size: 8 },
    { radius: 56, color: 'var(--cyan)',   size: 6 },
    { radius: 74, color: 'rgba(0,255,136,0.45)', size: 5 },
  ]

  return (
    <div style={{ opacity: exiting ? 0 : 1, transform: exiting ? 'scale(0.9)' : 'scale(1)', transition: 'opacity .4s,transform .4s', display:'flex', flexDirection:'column', alignItems:'center', gap:48 }}>
      <div style={{ position:'relative', width:180, height:180, display:'flex', alignItems:'center', justifyContent:'center' }}>
        {/* Orbit rings */}
        {ORBITS.map((orb, i) => (
          <div key={i} style={{ position:'absolute', width: orb.radius*2, height: orb.radius*2, borderRadius:'50%', border:`1px solid ${orb.color}22` }} />
        ))}
        {/* Center glow */}
        <div style={{ width:14, height:14, borderRadius:'50%', background:'var(--green)', boxShadow:'0 0 24px var(--green), 0 0 48px rgba(0,255,136,0.3)', zIndex:2 }} />
        {/* Orbiting dots */}
        {ORBITS.map((orb, i) => (
          <div key={i} ref={dotRefs[i]} style={{
            position:'absolute', width: orb.size, height: orb.size,
            borderRadius:'50%', background: orb.color,
            boxShadow:`0 0 ${orb.size * 2}px ${orb.color}`,
            top: '50%', left: '50%',
            marginTop: -orb.size/2, marginLeft: -orb.size/2,
            zIndex:3,
          }} />
        ))}
      </div>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontFamily:'var(--font-display)', fontSize:32, fontWeight:700, letterSpacing:-1, marginBottom:6 }}>TANVIR<span style={{ color:'var(--green)' }}>.</span></div>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--muted)', letterSpacing:4 }}>ESTABLISHING ORBIT</div>
      </div>
    </div>
  )
}

// ── Style: Typewriter (animejs) ────────────────────────────────────────────────
// animejs staggers each character of the name into view one by one.
function TypewriterLoader({ onComplete }) {
  const containerRef = useRef(null)
  const cursorRef    = useRef(null)
  const [exiting, setExiting]   = useState(false)
  const NAME    = 'TANVIR.'
  const TAGLINE = 'NETWORK ENGINEER'

  useEffect(() => {
    const container = containerRef.current
    const cursor    = cursorRef.current
    if (!container || !cursor) return

    import('gsap').then(m => {
      const gsap = m.gsap
      const chars  = container.querySelectorAll('[data-char]')
      const tagEl  = container.querySelector('[data-tagline]')

      chars.forEach(c => { c.style.opacity = '0' })
      if (tagEl) tagEl.style.opacity = '0'

      const tl = gsap.timeline()
      tl
        .to(chars, { opacity: 1, duration: 0.06, stagger: 0.08, ease: 'none' })
        .to(tagEl,  { opacity: 1, duration: 0.4,  ease: 'expo.out' }, '+=0.2')
    })

    const done = setTimeout(() => { setExiting(true); setTimeout(onComplete, 400) }, 1500)
    return () => clearTimeout(done)
  }, [])

  return (
    <div style={{ opacity: exiting ? 0 : 1, transition: 'opacity .4s', display:'flex', flexDirection:'column', alignItems:'center', gap:20 }} ref={containerRef}>
      <div style={{ display:'flex', alignItems:'center', fontFamily:'var(--font-display)', fontSize:'clamp(52px,10vw,96px)', fontWeight:700, letterSpacing:-2 }}>
        {NAME.split('').map((ch, i) => (
          <span key={i} data-char style={{ color: ch === '.' ? 'var(--green)' : 'var(--text)', display:'inline-block' }}>{ch}</span>
        ))}
        {/* Blinking cursor */}
        <span ref={cursorRef} style={{ display:'inline-block', width:'0.06em', height:'0.85em', background:'var(--green)', marginLeft:4, verticalAlign:'middle', animation:'blink .7s steps(1) infinite', boxShadow:'0 0 10px var(--green)' }} />
      </div>
      <div data-tagline style={{ fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:6, color:'var(--cyan)', textShadow:'0 0 12px var(--cyan)' }}>
        {TAGLINE}
      </div>
    </div>
  )
}

// ── Style: DNA (animejs) ──────────────────────────────────────────────────────
// animejs animates 12 pairs of nodes in a double-helix wave pattern.
function DNALoader({ onComplete }) {
  const helixRef = useRef(null)
  const [exiting, setExiting] = useState(false)
  const PAIRS = 10

  useEffect(() => {
    const container = helixRef.current
    if (!container) return

    import('gsap').then(m => {
      const gsap = m.gsap
      const leftNodes  = container.querySelectorAll('[data-dna-left]')
      const rightNodes = container.querySelectorAll('[data-dna-right]')
      const connectors = container.querySelectorAll('[data-dna-conn]')

      gsap.to(leftNodes,  { x: 22,  duration: 0.7, ease: 'sine.inOut', repeat: -1, yoyo: true, stagger: 0.14 })
      gsap.to(rightNodes, { x: -22, duration: 0.7, ease: 'sine.inOut', repeat: -1, yoyo: true, stagger: 0.14 })
      gsap.to(connectors, { scaleX: 0.1, opacity: 0.1, duration: 0.7, ease: 'sine.inOut', repeat: -1, yoyo: true, stagger: 0.14 })
    })

    const done = setTimeout(() => { setExiting(true); setTimeout(onComplete, 400) }, 1500)
    return () => clearTimeout(done)
  }, [])

  const COLORS_L = ['var(--green)', 'var(--cyan)']
  const COLORS_R = ['var(--cyan)',  'var(--green)']

  return (
    <div style={{ opacity: exiting ? 0 : 1, transition: 'opacity .4s', display:'flex', flexDirection:'column', alignItems:'center', gap:36 }}>
      <div style={{ fontFamily:'var(--font-display)', fontSize:32, fontWeight:700, letterSpacing:-1 }}>
        TANVIR<span style={{ color:'var(--green)' }}>.</span>
      </div>

      {/* Helix */}
      <div ref={helixRef} style={{ display:'flex', flexDirection:'column', gap:8, alignItems:'center' }}>
        {Array.from({ length: PAIRS }, (_, i) => (
          <div key={i} style={{ display:'flex', alignItems:'center', width:100, justifyContent:'center', position:'relative', height:10 }}>
            {/* Connector line */}
            <div data-dna-conn style={{ position:'absolute', height:2, width:60, background:`linear-gradient(90deg,${COLORS_L[i%2]},${COLORS_R[i%2]})`, borderRadius:1, transformOrigin:'center' }} />
            {/* Left node */}
            <div data-dna-left style={{ width:10, height:10, borderRadius:'50%', background:COLORS_L[i%2], boxShadow:`0 0 8px ${COLORS_L[i%2]}`, position:'absolute', left:0 }} />
            {/* Right node */}
            <div data-dna-right style={{ width:10, height:10, borderRadius:'50%', background:COLORS_R[i%2], boxShadow:`0 0 8px ${COLORS_R[i%2]}`, position:'absolute', right:0 }} />
          </div>
        ))}
      </div>

      <div style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--muted)', letterSpacing:4 }}>SEQUENCING</div>
    </div>
  )
}

// ── Style: Countdown (animejs) ────────────────────────────────────────────────
// animejs pops 3 → 2 → 1 → GO with scale + color transitions.
function CountdownLoader({ onComplete }) {
  const numRef   = useRef(null)
  const labelRef = useRef(null)
  const [display, setDisplay] = useState('3')
  const [exiting, setExiting] = useState(false)

  useEffect(() => {
    const STEPS = ['3','2','1','GO']
    const COLORS = ['var(--cyan)','var(--green)','var(--orange)','#fff']
    let step = 0

    const runStep = async () => {
      const el    = numRef.current
      const label = labelRef.current
      if (!el) return

      const { gsap } = await import('gsap')

      const doStep = () => {
        if (step >= STEPS.length) return
        setDisplay(STEPS[step])
        el.style.color = COLORS[step]
        el.style.textShadow = `0 0 40px ${COLORS[step]}, 0 0 80px ${COLORS[step]}60`

        gsap.fromTo(el,
          { scale: 0.4, opacity: 0 },
          { scale: 1, opacity: 1, duration: 0.3, ease: 'back.out(1.7)' }
        )

        step++
        if (step < STEPS.length) setTimeout(doStep, 320)
      }

      doStep()
    }

    runStep()

    const done = setTimeout(() => { setExiting(true); setTimeout(onComplete, 400) }, 1550)
    return () => clearTimeout(done)
  }, [])

  return (
    <div style={{ opacity: exiting ? 0 : 1, transform: exiting ? 'scale(1.1)' : 'scale(1)', transition: 'opacity .4s,transform .4s', display:'flex', flexDirection:'column', alignItems:'center', gap:32 }}>
      {/* Countdown number */}
      <div ref={numRef} style={{
        fontFamily: 'var(--font-display)',
        fontSize: 'clamp(80px,18vw,140px)',
        fontWeight: 900,
        letterSpacing: -4,
        lineHeight: 1,
        color: 'var(--cyan)',
        textShadow: '0 0 40px var(--cyan)',
        transition: 'color .1s, text-shadow .1s',
        userSelect: 'none',
      }}>
        {display}
      </div>
      <div ref={labelRef} style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--muted)', letterSpacing:6 }}>
        TANVIR<span style={{ color:'var(--green)' }}>.</span>
      </div>
    </div>
  )
}

// ── Root export ───────────────────────────────────────────────────────────────
export default function LoadingScreen({ onComplete, style }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  const s = style || (mounted ? localStorage.getItem('loading-style') : null) || 'terminal'
  return (
    <div style={{ position:'fixed', inset:0, zIndex:9999, background:'transparent', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', overflow:'hidden' }}>
      <div className="scanline" />
      <div style={{ position:'absolute', width:'min(500px, 90vw)', height:'min(500px, 90vw)', borderRadius:'50%', background:'radial-gradient(circle,color-mix(in srgb,var(--green) 10%,transparent) 0%,transparent 70%)', top:'10%', left:'10%', animation:'ls-drift 8s ease-in-out infinite', pointerEvents:'none' }} />
      <div style={{ position:'absolute', width:'min(400px, 80vw)', height:'min(400px, 80vw)', borderRadius:'50%', background:'radial-gradient(circle,color-mix(in srgb,var(--cyan) 10%,transparent) 0%,transparent 70%)', bottom:'10%', right:'10%', animation:'ls-drift 12s ease-in-out infinite reverse', pointerEvents:'none' }} />
      <div style={{ position:'relative', zIndex:1, width:'100%', maxWidth:560, padding:'0 24px', display:'flex', flexDirection:'column', alignItems:'center' }}>
        {s === 'terminal' && <TerminalLoader onComplete={onComplete} />}
        {s === 'minimal'  && <MinimalLoader  onComplete={onComplete} />}
        {s === 'glitch'   && <GlitchLoader   onComplete={onComplete} />}
        {s === 'splash'   && <SplashLoader   onComplete={onComplete} />}
        {s === 'pulse'    && <PulseLoader    onComplete={onComplete} />}
        {s === 'cyber'    && <CyberLoader    onComplete={onComplete} />}
        {s === 'bars'     && <BarsLoader     onComplete={onComplete} />}
        {s === 'wave'     && <WaveLoader     onComplete={onComplete} />}
        {s === 'neon'     && <NeonLoader     onComplete={onComplete} />}
        {s === 'orbit'       && <OrbitLoader      onComplete={onComplete} />}
        {s === 'typewriter'  && <TypewriterLoader  onComplete={onComplete} />}
        {s === 'dna'         && <DNALoader         onComplete={onComplete} />}
        {s === 'countdown'   && <CountdownLoader   onComplete={onComplete} />}
      </div>
      {s === 'matrix' && <MatrixLoader onComplete={onComplete} />}
      <style>{`
        @keyframes ls-spin   { to{transform:rotate(360deg)} }
        @keyframes ls-spinr  { to{transform:rotate(-360deg)} }
        @keyframes ls-drift  { 0%,100%{transform:translate(0,0)} 50%{transform:translate(20px,-20px)} }
        @keyframes ls-bounce { from{transform:translateY(0)} to{transform:translateY(-8px)} }
        @keyframes ls-blink  { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes fadeDown  { from{opacity:0;transform:translateY(-20px)} to{opacity:1;transform:translateY(0)} }
        @keyframes fadeUp    { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        @keyframes blink     { 0%,100%{opacity:1} 50%{opacity:0} }
      `}</style>
    </div>
  )
}
