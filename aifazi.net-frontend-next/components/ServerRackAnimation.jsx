'use client'
import { useEffect, useState, useRef } from 'react'
import { useInlineEdit } from '../context/EditContext'
import { prefersReducedMotion } from '../core/useFocusTrap'

import DatacenterMode from './server-rack/DatacenterMode'
import DeployMode from './server-rack/DeployMode'
import MonitorMode from './server-rack/MonitorMode'
import ThreatMode from './server-rack/ThreatMode'
import NeuralNetMode from './server-rack/NeuralNetMode'
import PacketFlowMode from './server-rack/PacketFlowMode'
import AvatarMode from './server-rack/AvatarMode'
import { GlobeMode } from './server-rack/GlobeMode'

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
