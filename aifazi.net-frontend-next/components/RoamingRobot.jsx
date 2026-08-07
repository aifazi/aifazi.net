'use client'
import { useState, useEffect, useRef, useCallback } from 'react'

const MESSAGES = [
  'scanning firewall...',
  'ping 8.8.8.8 -- 8ms OK',
  'checking uptime: 99.97%',
  'traceroute: OK',
  'port 443: open',
  'SSL cert: valid',
  'memory usage: 42%',
  'CPU: nominal',
  'packet loss: 0%',
  'BGP routes: OK',
  'OSPF adjacency: UP',
  'DNS resolving: OK',
  'no threats detected',
  'VPN tunnel: stable',
  'bandwidth: 2.7 Gbps',
  'VLAN config: verified',
  'intrusion check: clear',
  'log anomalies: none',
]

const CSS = [
  '@keyframes rbBob      { from{transform:translateY(0)} to{transform:translateY(-3px)} }',
  '@keyframes rbPulse    { 0%,100%{transform:scale(1)} 50%{transform:scale(1.05)} }',
  '@keyframes rbEyeBlink { 0%,92%,100%{transform:scaleY(1)} 94%,98%{transform:scaleY(0.1)} }',
  '@keyframes rbEyePulse { 0%,100%{opacity:1} 50%{opacity:0.15} }',
  '@keyframes rbArmWalk  { from{transform:rotate(-20deg)} to{transform:rotate(20deg)} }',
  '@keyframes rbArm      { from{transform:rotate(-10deg)} to{transform:rotate(10deg)} }',
  '@keyframes rbLegL     { from{transform:rotate(-22deg)} to{transform:rotate(22deg)} }',
  '@keyframes rbLegR     { from{transform:rotate(22deg)} to{transform:rotate(-22deg)} }',
  '@keyframes rbScan     { from{transform:scaleX(1)} to{transform:scaleX(1.5);opacity:0.1} }',
  '@keyframes rbAntenna  { 0%,100%{opacity:1} 50%{opacity:0.4} }',
  '@keyframes rbCore     { 0%,100%{opacity:0.5} 50%{opacity:1} }',
  '@keyframes rbBubble   { from{opacity:0;transform:scale(0.7)} to{opacity:1;transform:scale(1)} }',
].join(' ')

function RobotSVG({ state, dir, color }) {
  const g = color || '#00ff88'
  const eyeStyle = {
    animation: state === 'scan'
      ? 'rbEyePulse 0.4s steps(1) infinite'
      : 'rbEyeBlink 3s steps(1) infinite',
  }
  const bodyStyle = {
    animation: state === 'scan' ? 'rbPulse 1s ease-in-out infinite'
      : state === 'walk' ? 'rbBob 0.5s ease-in-out infinite alternate'
      : 'none',
  }
  const legLStyle = { transformOrigin: '17px 50px', animation: state === 'walk' ? 'rbLegL 0.5s ease-in-out infinite alternate' : 'none' }
  const legRStyle = { transformOrigin: '32px 50px', animation: state === 'walk' ? 'rbLegR 0.5s ease-in-out infinite alternate' : 'none' }
  const armStyle  = { animation: state === 'type' ? 'rbArm 0.2s ease-in-out infinite alternate' : state === 'walk' ? 'rbArmWalk 0.5s ease-in-out infinite alternate' : 'none' }

  return (
    <svg width="48" height="64" viewBox="0 0 48 64" fill="none"
      style={{ transform: dir < 0 ? 'scaleX(-1)' : 'none', filter: 'drop-shadow(0 0 6px ' + g + '66)', display: 'block' }}>
      <line x1="24" y1="2" x2="24" y2="10" stroke={g} strokeWidth="2" strokeLinecap="round" />
      <circle cx="24" cy="2" r="2.5" fill={g} style={{ animation: 'rbAntenna 2s ease-in-out infinite' }} />
      <rect x="10" y="10" width="28" height="20" rx="4" fill="#0b1118" stroke={g} strokeWidth="1.5" style={bodyStyle} />
      <rect x="14" y="16" width="7" height="7" rx="1.5" fill={g} style={eyeStyle} />
      <rect x="27" y="16" width="7" height="7" rx="1.5" fill={g} style={eyeStyle} />
      <rect x="17" y="25" width="14" height="2.5" rx="1.2" fill={state === 'type' ? g : g + '44'} />
      <rect x="8" y="32" width="32" height="18" rx="4" fill="#0b1118" stroke={g} strokeWidth="1.5" style={bodyStyle} />
      <rect x="13" y="36" width="8" height="5" rx="1.5" fill={g} opacity="0.25" />
      <rect x="27" y="36" width="8" height="5" rx="1.5" fill={g} opacity="0.25" />
      <circle cx="24" cy="44" r="2.5" fill={g} style={{ animation: 'rbCore 1.5s ease-in-out infinite' }} />
      <rect x="1"  y="33" width="7" height="14" rx="3" fill="#0b1118" stroke={g} strokeWidth="1.5" style={{ transformOrigin: '4px 33px', ...armStyle }} />
      <rect x="40" y="33" width="7" height="14" rx="3" fill="#0b1118" stroke={g} strokeWidth="1.5" style={{ transformOrigin: '44px 33px', ...armStyle }} />
      <rect x="12" y="50" width="9" height="14" rx="3" fill="#0b1118" stroke={g} strokeWidth="1.5" style={legLStyle} />
      <rect x="27" y="50" width="9" height="14" rx="3" fill="#0b1118" stroke={g} strokeWidth="1.5" style={legRStyle} />
      <rect x="10" y="61" width="12" height="3" rx="1.5" fill={g} opacity="0.6" />
      <rect x="26" y="61" width="12" height="3" rx="1.5" fill={g} opacity="0.6" />
      {state === 'scan' && (
        <rect x="14" y="22" width="20" height="2" rx="1" fill={g}
          style={{ animation: 'rbScan 0.6s ease-in-out infinite alternate', opacity: 0.7 }} />
      )}
    </svg>
  )
}

function Bubble({ msg, dir, color }) {
  const g = color || '#00ff88'
  return (
    <div style={{
      position: 'absolute', bottom: 70,
      left: dir > 0 ? 0 : 'auto', right: dir < 0 ? 0 : 'auto',
      whiteSpace: 'nowrap', background: 'rgba(11,17,24,0.96)',
      border: '1px solid ' + g, color: g,
      fontFamily: 'var(--font-mono, monospace)', fontSize: 10,
      letterSpacing: 1, padding: '5px 10px', borderRadius: 6,
      boxShadow: '0 0 12px ' + g + '44',
      animation: 'rbBubble 0.25s cubic-bezier(0.34,1.56,0.64,1)', zIndex: 1,
    }}>
      {'>_ '}{msg}
      <span style={{
        position: 'absolute', bottom: -6,
        left: dir > 0 ? 14 : 'auto', right: dir < 0 ? 14 : 'auto',
        width: 0, height: 0,
        borderLeft: '5px solid transparent', borderRight: '5px solid transparent',
        borderTop: '6px solid ' + g,
      }} />
    </div>
  )
}

export default function RoamingRobot() {
  // pos/dir are React state only so SVG re-renders when state/dir/msg change — NOT on every frame
  const [state, setState]     = useState('walk')
  const [dir, setDir]         = useState(1)
  const [msg, setMsg]         = useState(null)
  const [visible, setVisible] = useState(true)
  const [accent, setAccent]   = useState('#00ff88')
  const wrapperRef = useRef(null)   // direct DOM ref for position — no React re-render per frame
  const INITIAL_POS = { x: 120, y: 120 }
  const posRef   = useRef({ ...INITIAL_POS })
  const dirRef   = useRef(1)
  const timerRef = useRef(null)
  const rafRef   = useRef(null)
  const isVisibleRef = useRef(true)

  // Pause when scrolled off-screen
  useEffect(() => {
    const el = wrapperRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const obs = new IntersectionObserver(([e]) => {
      isVisibleRef.current = e.isIntersecting
      if (!e.isIntersecting) {
        clearTimeout(timerRef.current)
        cancelAnimationFrame(rafRef.current)
      }
    }, { threshold: 0 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    const update = () => {
      const c = getComputedStyle(document.documentElement).getPropertyValue('--green').trim()
      if (c) setAccent(c)
    }
    update()
    const ob = new MutationObserver(update)
    ob.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => ob.disconnect()
  }, [])

  const pickMsg    = useCallback(() => MESSAGES[Math.floor(Math.random() * MESSAGES.length)], [])
  const nextTarget = useCallback(() => ({
    x: Math.random() * (window.innerWidth  - 80) + 20,
    y: Math.random() * (window.innerHeight - 120) + 60,
  }), [])

  const runLoop = useCallback(() => {
    const doBehavior = () => {
      if (!isVisibleRef.current) { timerRef.current = setTimeout(doBehavior, 500); return }
      const roll = Math.random()
      if (roll < 0.55) {
        const target = nextTarget()
        const dx = target.x - posRef.current.x
        const dy = target.y - posRef.current.y
        dirRef.current = dx >= 0 ? 1 : -1
        setDir(dirRef.current)
        setState('walk')
        setMsg(null)
        const frames = Math.max(40, Math.floor(Math.sqrt(dx * dx + dy * dy) / (1.5 + Math.random())))
        const sx = dx / frames
        const sy = dy / frames
        let f = 0
        const tick = () => {
          if (!isVisibleRef.current) { cancelAnimationFrame(rafRef.current); timerRef.current = setTimeout(doBehavior, 500); return }
          if (f >= frames) {
            posRef.current = { x: target.x, y: target.y }
            // Update DOM directly — no React re-render
            if (wrapperRef.current) {
              wrapperRef.current.style.left = target.x + 'px'
              wrapperRef.current.style.top  = target.y + 'px'
            }
            timerRef.current = setTimeout(doBehavior, 300 + Math.random() * 400)
            return
          }
          posRef.current = { x: posRef.current.x + sx, y: posRef.current.y + sy }
          // Update DOM directly — no React re-render
          if (wrapperRef.current) {
            wrapperRef.current.style.left = posRef.current.x + 'px'
            wrapperRef.current.style.top  = posRef.current.y + 'px'
          }
          f++
          rafRef.current = requestAnimationFrame(tick)
        }
        rafRef.current = requestAnimationFrame(tick)
      } else if (roll < 0.80) {
        setState('scan')
        setMsg(pickMsg())
        timerRef.current = setTimeout(doBehavior, 1800 + Math.random() * 1400)
      } else if (roll < 0.95) {
        setState('type')
        setMsg(pickMsg())
        timerRef.current = setTimeout(doBehavior, 1200 + Math.random() * 900)
      } else {
        setState('idle')
        setMsg(null)
        timerRef.current = setTimeout(doBehavior, 700 + Math.random() * 600)
      }
    }
    timerRef.current = setTimeout(doBehavior, 500)
  }, [nextTarget, pickMsg])

  useEffect(() => {
    runLoop()
    return () => { clearTimeout(timerRef.current); cancelAnimationFrame(rafRef.current) }
  }, [runLoop])

  useEffect(() => {
    const onResize = () => {
      posRef.current = {
        x: Math.min(posRef.current.x, window.innerWidth  - 60),
        y: Math.min(posRef.current.y, window.innerHeight - 80),
      }
      if (wrapperRef.current) {
        wrapperRef.current.style.left = posRef.current.x + 'px'
        wrapperRef.current.style.top  = posRef.current.y + 'px'
      }
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  if (!visible) return null

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div ref={wrapperRef} className="roaming-robot" style={{ position: 'fixed', left: INITIAL_POS.x, top: INITIAL_POS.y, width: 48, height: 64, zIndex: 9990, pointerEvents: 'none', userSelect: 'none', willChange: 'left, top' }}>
        {msg && <Bubble msg={msg} dir={dir} color={accent} />}
        <div style={{ cursor: 'pointer', pointerEvents: 'auto' }} title="Click to hide" onClick={() => setVisible(false)}>
          <RobotSVG state={state} dir={dir} color={accent} />
        </div>
      </div>
    </>
  )
}