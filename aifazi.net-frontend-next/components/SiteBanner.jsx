'use client'
import React, { useState, useEffect, useRef } from 'react'
import { useLocation } from '@/lib/router-compat'
import api, { getAuthToken } from '@/lib/api'
import { getSupabase } from '@/lib/supabase'
import MaintenanceScreen from './MaintenanceScreen'

const SOLID = 'rgba(8,8,18,0.93)'

const TYPE_CFG = {
  info: {
    accent: '#00d4ff', glow: 'color-mix(in srgb, var(--cyan) 22%, transparent)',
    bg: `linear-gradient(90deg,color-mix(in srgb, var(--cyan) 22%, transparent) 0%,color-mix(in srgb, var(--cyan) 8%, transparent) 40%,${SOLID} 100%)`,
    border: 'color-mix(in srgb, var(--cyan) 55%, transparent)', label: 'INFO', pulse: 'bnrPulse',
    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>,
  },
  warning: {
    accent: '#ffb020', glow: 'rgba(255,176,32,0.22)',
    bg: `linear-gradient(90deg,rgba(255,176,32,0.24) 0%,rgba(255,176,32,0.09) 40%,${SOLID} 100%)`,
    border: 'rgba(255,176,32,0.60)', label: 'WARNING', pulse: 'bnrPulseWarn',
    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  },
  success: {
    accent: '#00ff88', glow: 'color-mix(in srgb, var(--green) 22%, transparent)',
    bg: `linear-gradient(90deg,color-mix(in srgb, var(--green) 20%, transparent) 0%,color-mix(in srgb, var(--green) 7%, transparent) 40%,${SOLID} 100%)`,
    border: 'color-mix(in srgb, var(--green) 50%, transparent)', label: 'SUCCESS', pulse: 'bnrPulse',
    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>,
  },
  alert: {
    accent: '#ff4757', glow: 'rgba(255,71,87,0.26)',
    bg: `linear-gradient(90deg,rgba(255,71,87,0.26) 0%,rgba(255,71,87,0.09) 40%,${SOLID} 100%)`,
    border: 'rgba(255,71,87,0.60)', label: 'ALERT', pulse: 'bnrPulseAlert',
    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
  },
  error: {
    accent: '#ff4757', glow: 'rgba(255,71,87,0.26)',
    bg: `linear-gradient(90deg,rgba(255,71,87,0.26) 0%,rgba(255,71,87,0.09) 40%,${SOLID} 100%)`,
    border: 'rgba(255,71,87,0.60)', label: 'ALERT', pulse: 'bnrPulseAlert',
    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
  },
  announce: {
    accent: '#a855f7', glow: 'rgba(168,85,247,0.22)',
    bg: `linear-gradient(90deg,rgba(168,85,247,0.22) 0%,rgba(168,85,247,0.08) 40%,${SOLID} 100%)`,
    border: 'rgba(168,85,247,0.50)', label: 'ANNOUNCE', pulse: 'bnrPulse',
    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>,
  },
}

const KF = `
  @keyframes bnrSlideIn    { from{transform:translateY(-110%);opacity:0} to{transform:translateY(0);opacity:1} }
  @keyframes bnrSlideOut   { from{transform:translateY(0);opacity:1;max-height:80px} to{transform:translateY(-6px);opacity:0;max-height:0} }
  @keyframes bnrFloatIn    { from{transform:translateX(120%);opacity:0} to{transform:translateX(0);opacity:1} }
  @keyframes bnrFloatOut   { from{transform:translateX(0);opacity:1} to{transform:translateX(120%);opacity:0} }
  @keyframes bnrScan       { 0%{left:-120%} 100%{left:200%} }
  @keyframes bnrPulse      { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.35;transform:scale(.75)} }
  @keyframes bnrPulseWarn  { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(1.25)} }
  @keyframes bnrPulseAlert { 0%,100%{transform:scale(1);opacity:1} 33%{transform:scale(1.5);opacity:.6} 66%{transform:scale(.85);opacity:.9} }
  @keyframes bnrTicker     { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }
  @keyframes bnrBorderGlow { 0%,100%{opacity:.7} 50%{opacity:1} }
  @keyframes bnrExpiry     { 0%,100%{opacity:1} 50%{opacity:0.5} }
`

/* ── Expiry countdown helper ─────────────────────────────────────────────── */
function useExpiryCountdown(expiresAt) {
  const [label, setLabel] = useState('')
  useEffect(() => {
    if (!expiresAt) return
    const update = () => {
      const diff = new Date(expiresAt) - Date.now()
      if (diff <= 0) { setLabel('Expired'); return }
      const totalSecs = Math.floor(diff / 1000)
      const d = Math.floor(totalSecs / 86400)
      const h = Math.floor((totalSecs % 86400) / 3600)
      const m = Math.floor((totalSecs % 3600) / 60)
      if (d > 0)      setLabel(`Expires in ${d}d ${h}h`)
      else if (h > 0) setLabel(`Expires in ${h}h ${m}m`)
      else            setLabel(`Expires in ${m}m`)
    }
    update()
    const id = setInterval(update, 30000)
    return () => clearInterval(id)
  }, [expiresAt])
  return label
}

const bannerTimeMs = value => {
  if (!value) return null
  const ms = new Date(value).getTime()
  return Number.isNaN(ms) ? null : ms
}

const isBannerVisibleNow = (banner, now) => {
  if (!banner?.active) return false
  const expires = bannerTimeMs(banner.expires_at || banner.expiresAt)
  if (expires !== null && expires <= now) return false
  const scheduled = bannerTimeMs(banner.scheduled_at || banner.scheduledAt)
  if (scheduled !== null && scheduled > now) return false
  return true
}

/* ── Link button shared ──────────────────────────────────────────────────── */
function LinkBtn({ banner, cfg }) {
  const label = banner.link_label || banner.linkLabel
  if (!banner.link || !label) return null
  return (
    <a href={banner.link} target="_blank" rel="noopener noreferrer"
      style={{
        flexShrink:0, display:'flex', alignItems:'center', gap:5,
        fontFamily:'var(--font-mono)', fontSize:10, fontWeight:700, letterSpacing:1.2,
        color: cfg.accent, textDecoration:'none', padding:'6px 14px', borderRadius:5,
        border:`1px solid ${cfg.accent}50`, background:`${cfg.accent}12`,
        marginRight:10, whiteSpace:'nowrap', transition:'all 0.18s',
      }}
      onMouseEnter={e=>{ e.currentTarget.style.background=`${cfg.accent}25`; e.currentTarget.style.boxShadow=`0 0 12px ${cfg.glow}` }}
      onMouseLeave={e=>{ e.currentTarget.style.background=`${cfg.accent}12`; e.currentTarget.style.boxShadow='none' }}
    >
      {label}
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
      </svg>
    </a>
  )
}

/* ── Dismiss / pin button ────────────────────────────────────────────────── */
function DismissBtn({ banner, cfg, onDismiss }) {
  if (banner.pinned) {
    return (
      <div title="Pinned — cannot be dismissed"
        style={{ flexShrink:0, padding:'10px 14px', color:'#f59e0b', fontSize:14,
          display:'flex', alignItems:'center', opacity:0.7 }}>📌</div>
    )
  }
  return (
    <button onClick={onDismiss} title="Dismiss"
      style={{ flexShrink:0, background:'none', border:'none', cursor:'pointer',
        padding:'10px 16px', color:'rgba(255,255,255,0.3)', fontSize:16, lineHeight:1,
        display:'flex', alignItems:'center', justifyContent:'center', transition:'color 0.15s' }}
      onMouseEnter={e=>e.currentTarget.style.color=cfg.accent}
      onMouseLeave={e=>e.currentTarget.style.color='rgba(255,255,255,0.3)'}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </button>
  )
}

/* ── STRIP style (default full-width bar) ────────────────────────────────── */
function StripBanner({ banner, cfg, onDismiss, leaving, index }) {
  const [hovering, setHovering] = useState(false)
  const msgRef = useRef(null)
  const [isLong, setIsLong] = useState(false)
  const expiry = useExpiryCountdown(banner.expires_at)
  useEffect(() => {
    if (msgRef.current) setIsLong(msgRef.current.scrollWidth > msgRef.current.clientWidth + 10)
  }, [banner.message])
  return (
    <div onMouseEnter={()=>setHovering(true)} onMouseLeave={()=>setHovering(false)}
      style={{ display:'flex', alignItems:'center', position:'relative', overflow:'hidden',
        background: cfg.bg, backdropFilter:'blur(18px)', WebkitBackdropFilter:'blur(18px)',
        borderBottom:`1px solid ${cfg.border}`, minHeight:48,
        boxShadow: hovering ? `0 4px 28px ${cfg.glow},inset 0 0 0 1px ${cfg.border}` : `0 2px 14px ${cfg.glow}60`,
        animation: leaving ? 'bnrSlideOut .34s cubic-bezier(.4,0,1,1) forwards'
          : `bnrSlideIn .38s cubic-bezier(.16,1,.3,1) ${index * 0.07}s both`,
        transition:'box-shadow 0.2s ease',
      }}>
      <div style={{ width:4, alignSelf:'stretch', flexShrink:0, background:cfg.accent,
        boxShadow:`0 0 12px ${cfg.accent},0 0 4px ${cfg.accent}`, animation:'bnrBorderGlow 2s ease-in-out infinite' }} />
      <div style={{ display:'flex', alignItems:'center', gap:6, padding:'0 14px 0 12px', flexShrink:0, color:cfg.accent }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', width:28, height:28,
          borderRadius:6, background:`${cfg.accent}18`, border:`1px solid ${cfg.accent}35`,
          boxShadow: hovering ? `0 0 10px ${cfg.glow}` : 'none', transition:'box-shadow 0.2s' }}>
          {cfg.icon}
        </div>
        <div style={{ width:5, height:5, borderRadius:'50%', background:cfg.accent,
          boxShadow:`0 0 7px ${cfg.accent}`, animation:`${cfg.pulse} 1.6s ease-in-out infinite` }} />
      </div>
      <span style={{ fontFamily:'var(--font-mono)', fontSize:9, letterSpacing:2.5, padding:'3px 9px',
        flexShrink:0, fontWeight:700, color:cfg.accent, background:`${cfg.accent}14`,
        border:`1px solid ${cfg.accent}40`, borderRadius:4, marginRight:14, whiteSpace:'nowrap' }}>
        {cfg.label}
      </span>
      <div style={{ flex:1, minWidth:0, overflow:'hidden', paddingRight:10, position:'relative' }}>
        {isLong ? (
          <div style={{ overflow:'hidden', whiteSpace:'nowrap' }}>
            <span ref={msgRef} style={{ display:'inline-block', fontFamily:'var(--font-mono)', fontSize:12.5, color:'#e8e8f4', letterSpacing:0.3,
              animation: hovering ? 'none' : `bnrTicker ${Math.max(9, banner.message.length * 0.11)}s linear infinite` }}>
              {banner.message}&nbsp;&nbsp;&nbsp;·&nbsp;&nbsp;&nbsp;{banner.message}&nbsp;&nbsp;&nbsp;
            </span>
          </div>
        ) : (
          <span ref={msgRef} style={{ fontFamily:'var(--font-mono)', fontSize:12.5, color:'#e8e8f4',
            letterSpacing:0.3, lineHeight:1.5, display:'block', whiteSpace:'nowrap',
            overflow:'hidden', textOverflow:'ellipsis' }}>{banner.message}</span>
        )}
      </div>
      {expiry && (
        <span style={{ flexShrink:0, fontFamily:'var(--font-mono)', fontSize:8, letterSpacing:1,
          color:`${cfg.accent}cc`, marginRight:10, whiteSpace:'nowrap', padding:'3px 8px',
          border:`1px solid ${cfg.accent}30`, borderRadius:3, animation:'bnrExpiry 3s ease-in-out infinite' }}>
          ⏱ {expiry}
        </span>
      )}
      <LinkBtn banner={banner} cfg={cfg} />
      <DismissBtn banner={banner} cfg={cfg} onDismiss={onDismiss} />
      <div aria-hidden style={{ position:'absolute', top:0, left:'-120%', width:'80%', height:'100%',
        background:'linear-gradient(90deg,transparent,rgba(255,255,255,0.05),transparent)',
        animation:'bnrScan 3s ease-in-out infinite', pointerEvents:'none' }} />
    </div>
  )
}

/* ── HERO style (bold block) ─────────────────────────────────────────────── */
function HeroBanner({ banner, cfg, onDismiss, leaving, index }) {
  const expiry = useExpiryCountdown(banner.expires_at)
  return (
    <div style={{ position:'relative', overflow:'hidden',
      background:`linear-gradient(135deg,${cfg.accent}18 0%,rgba(6,10,15,0.97) 60%)`,
      borderBottom:`1px solid ${cfg.border}`,
      boxShadow:`0 4px 32px ${cfg.glow}`,
      animation: leaving ? 'bnrSlideOut .34s forwards' : `bnrSlideIn .4s cubic-bezier(.16,1,.3,1) ${index*0.07}s both`,
      padding:'18px 20px 16px',
    }}>
      <div style={{ display:'flex', alignItems:'flex-start', gap:14 }}>
        <div style={{ width:40, height:40, borderRadius:10, background:`${cfg.accent}18`,
          border:`1px solid ${cfg.accent}45`, display:'flex', alignItems:'center',
          justifyContent:'center', color:cfg.accent, flexShrink:0 }}>
          <span style={{ fontSize:20 }}>{cfg.icon}</span>
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6, flexWrap:'wrap' }}>
            <span style={{ fontFamily:'var(--font-mono)', fontSize:9, letterSpacing:2.5, fontWeight:700,
              color:cfg.accent, background:`${cfg.accent}14`, border:`1px solid ${cfg.accent}40`,
              borderRadius:4, padding:'3px 9px' }}>{cfg.label}</span>
            {expiry && <span style={{ fontFamily:'var(--font-mono)', fontSize:8, color:`${cfg.accent}bb`,
              padding:'2px 7px', border:`1px solid ${cfg.accent}30`, borderRadius:3,
              animation:'bnrExpiry 3s ease-in-out infinite' }}>⏱ {expiry}</span>}
            {banner.pinned && <span style={{ fontSize:12, opacity:0.8 }}>📌</span>}
          </div>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:14, color:'#eef0f8',
            lineHeight:1.5, marginBottom: (banner.link && (banner.link_label || banner.linkLabel)) ? 10 : 0 }}>
            {banner.message}
          </div>
          {(banner.link && (banner.link_label || banner.linkLabel)) && (
            <div style={{ marginTop:8 }}><LinkBtn banner={banner} cfg={cfg} /></div>
          )}
        </div>
        <DismissBtn banner={banner} cfg={cfg} onDismiss={onDismiss} />
      </div>
    </div>
  )
}

/* ── MINIMAL style (left border only) ────────────────────────────────────── */
function MinimalBanner({ banner, cfg, onDismiss, leaving, index }) {
  const expiry = useExpiryCountdown(banner.expires_at)
  return (
    <div style={{ display:'flex', alignItems:'center', gap:12, position:'relative',
      background: SOLID, borderBottom:`1px solid rgba(255,255,255,0.06)`,
      borderLeft:`3px solid ${cfg.accent}`, padding:'10px 16px',
      animation: leaving ? 'bnrSlideOut .34s forwards' : `bnrSlideIn .38s cubic-bezier(.16,1,.3,1) ${index*0.07}s both`,
    }}>
      <div style={{ color:cfg.accent, flexShrink:0 }}>{cfg.icon}</div>
      <span style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'#d0d8e8',
        flex:1, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
        {banner.message}
      </span>
      {expiry && <span style={{ fontFamily:'var(--font-mono)', fontSize:8, color:`${cfg.accent}cc`,
        whiteSpace:'nowrap', padding:'2px 7px', border:`1px solid ${cfg.accent}30`, borderRadius:3,
        flexShrink:0, animation:'bnrExpiry 3s ease-in-out infinite' }}>⏱ {expiry}</span>}
      <LinkBtn banner={banner} cfg={cfg} />
      <DismissBtn banner={banner} cfg={cfg} onDismiss={onDismiss} />
    </div>
  )
}

/* ── FLOATING style (corner card — renders outside fixed band) ───────────── */
function FloatingBanner({ banner, cfg, onDismiss, leaving }) {
  const expiry = useExpiryCountdown(banner.expires_at)
  return (
    <div style={{ position:'fixed', bottom:80, right:20, zIndex:200,
      maxWidth:340, minWidth:260,
      background:`linear-gradient(135deg,${cfg.accent}10,rgba(8,12,22,0.97))`,
      border:`1px solid ${cfg.border}`, borderRadius:14,
      boxShadow:`0 12px 48px rgba(0,0,0,0.6),0 0 32px ${cfg.glow}`,
      backdropFilter:'blur(18px)', WebkitBackdropFilter:'blur(18px)',
      animation: leaving ? 'bnrFloatOut .3s forwards' : 'bnrFloatIn .4s cubic-bezier(.16,1,.3,1) both',
      overflow:'hidden',
    }}>
      {/* top accent strip */}
      <div style={{ height:2, background:`linear-gradient(90deg,${cfg.accent},${cfg.accent}00)` }} />
      <div style={{ padding:'14px 16px 12px' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ color:cfg.accent, display:'flex' }}>{cfg.icon}</div>
            <span style={{ fontFamily:'var(--font-mono)', fontSize:8, letterSpacing:2, fontWeight:700,
              color:cfg.accent, background:`${cfg.accent}14`, border:`1px solid ${cfg.accent}40`,
              borderRadius:3, padding:'2px 7px' }}>{cfg.label}</span>
            {banner.pinned && <span style={{ fontSize:11, opacity:0.8 }}>📌</span>}
          </div>
          <DismissBtn banner={banner} cfg={cfg} onDismiss={onDismiss} />
        </div>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:12, color:'#dce8f4',
          lineHeight:1.6, marginBottom:8 }}>{banner.message}</div>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:6 }}>
          {expiry && <span style={{ fontFamily:'var(--font-mono)', fontSize:8, color:`${cfg.accent}aa`,
            padding:'2px 7px', border:`1px solid ${cfg.accent}30`, borderRadius:3,
            animation:'bnrExpiry 3s ease-in-out infinite' }}>⏱ {expiry}</span>}
          {!expiry && <span />}
          <LinkBtn banner={banner} cfg={cfg} />
        </div>
      </div>
    </div>
  )
}

/* ── PILL style (compact rounded chip) ───────────────────────────────────── */
function PillBanner({ banner, cfg, onDismiss, leaving, index }) {
  const expiry = useExpiryCountdown(banner.expires_at)
  return (
    <div style={{ display:'flex', justifyContent:'center', padding:'8px 16px',
      background: SOLID, borderBottom:`1px solid rgba(255,255,255,0.05)`,
      animation: leaving ? 'bnrSlideOut .34s forwards' : `bnrSlideIn .38s cubic-bezier(.16,1,.3,1) ${index*0.07}s both`,
    }}>
      <div style={{ display:'inline-flex', alignItems:'center', gap:8,
        background:`${cfg.accent}14`, border:`1px solid ${cfg.accent}55`,
        borderRadius:99, padding:'7px 18px 7px 12px',
        boxShadow:`0 0 20px ${cfg.glow}, inset 0 0 0 1px ${cfg.accent}15`,
      }}>
        <div style={{ width:22, height:22, borderRadius:'50%', background:`${cfg.accent}22`,
          display:'flex', alignItems:'center', justifyContent:'center', color:cfg.accent, flexShrink:0 }}>
          {cfg.icon}
        </div>
        <span style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'#e8eef8',
          letterSpacing:0.4, whiteSpace:'nowrap', maxWidth:420,
          overflow:'hidden', textOverflow:'ellipsis' }}>{banner.message}</span>
        {expiry && <span style={{ fontFamily:'var(--font-mono)', fontSize:8, color:`${cfg.accent}bb`,
          padding:'2px 7px', border:`1px solid ${cfg.accent}35`, borderRadius:99, flexShrink:0,
          animation:'bnrExpiry 3s ease-in-out infinite' }}>⏱ {expiry}</span>}
        {(banner.link && (banner.link_label || banner.linkLabel)) && (
          <LinkBtn banner={banner} cfg={cfg} />
        )}
        <DismissBtn banner={banner} cfg={cfg} onDismiss={onDismiss} />
      </div>
    </div>
  )
}

/* ── GLASS style (soft frosted panel) ───────────────────────────────────── */
function GlassBanner({ banner, cfg, onDismiss, leaving, index }) {
  const expiry = useExpiryCountdown(banner.expires_at)
  return (
    <div style={{ padding:'10px 16px', background:'rgba(4,10,18,0.62)', borderBottom:`1px solid ${cfg.border}40`,
      animation: leaving ? 'bnrSlideOut .34s forwards' : `bnrSlideIn .38s cubic-bezier(.16,1,.3,1) ${index*0.07}s both` }}>
      <div style={{ display:'flex', alignItems:'center', gap:12, maxWidth:1180, margin:'0 auto',
        background:`linear-gradient(135deg,rgba(255,255,255,0.06),${cfg.accent}12)`,
        border:`1px solid ${cfg.accent}38`, borderRadius:14, padding:'10px 14px',
        boxShadow:`0 14px 38px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.08)`,
        backdropFilter:'blur(16px)', WebkitBackdropFilter:'blur(16px)' }}>
        <div style={{ color:cfg.accent, display:'flex', flexShrink:0 }}>{cfg.icon}</div>
        <span style={{ fontFamily:'var(--font-mono)', fontSize:8, letterSpacing:2, fontWeight:700,
          color:cfg.accent, padding:'3px 8px', border:`1px solid ${cfg.accent}35`, borderRadius:99,
          background:`${cfg.accent}12`, whiteSpace:'nowrap' }}>{cfg.label}</span>
        <span style={{ fontFamily:'var(--font-mono)', fontSize:12, color:'#e8eef8', lineHeight:1.5,
          flex:1, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{banner.message}</span>
        {expiry && <span style={{ fontFamily:'var(--font-mono)', fontSize:8, color:`${cfg.accent}bb`,
          padding:'2px 7px', border:`1px solid ${cfg.accent}30`, borderRadius:99, flexShrink:0 }}>⏱ {expiry}</span>}
        <LinkBtn banner={banner} cfg={cfg} />
        <DismissBtn banner={banner} cfg={cfg} onDismiss={onDismiss} />
      </div>
    </div>
  )
}

/* ── OUTLINE style (fine framed rail) ───────────────────────────────────── */
function OutlineBanner({ banner, cfg, onDismiss, leaving, index }) {
  const expiry = useExpiryCountdown(banner.expires_at)
  return (
    <div style={{ padding:'9px 16px', background:SOLID, borderBottom:`1px solid rgba(255,255,255,0.05)`,
      animation: leaving ? 'bnrSlideOut .34s forwards' : `bnrSlideIn .38s cubic-bezier(.16,1,.3,1) ${index*0.07}s both` }}>
      <div style={{ display:'flex', alignItems:'center', gap:10, maxWidth:1180, margin:'0 auto',
        border:`1px solid ${cfg.accent}66`, outline:'1px solid rgba(255,255,255,0.035)',
        borderRadius:8, padding:'9px 12px', background:'rgba(0,0,0,0.12)' }}>
        <span style={{ color:cfg.accent, display:'flex', flexShrink:0 }}>{cfg.icon}</span>
        <span style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'#e7edf7',
          flex:1, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{banner.message}</span>
        {expiry && <span style={{ fontFamily:'var(--font-mono)', fontSize:8, color:`${cfg.accent}cc`,
          whiteSpace:'nowrap', flexShrink:0 }}>⏱ {expiry}</span>}
        <LinkBtn banner={banner} cfg={cfg} />
        <DismissBtn banner={banner} cfg={cfg} onDismiss={onDismiss} />
      </div>
    </div>
  )
}

/* ── TICKER style (news rail) ───────────────────────────────────────────── */
function TickerBanner({ banner, cfg, onDismiss, leaving, index }) {
  const expiry = useExpiryCountdown(banner.expires_at)
  return (
    <div style={{ display:'flex', alignItems:'center', minHeight:38, background:`linear-gradient(90deg,${SOLID},${cfg.accent}10,${SOLID})`,
      borderTop:`1px solid ${cfg.accent}30`, borderBottom:`1px solid ${cfg.accent}30`, overflow:'hidden',
      animation: leaving ? 'bnrSlideOut .34s forwards' : `bnrSlideIn .38s cubic-bezier(.16,1,.3,1) ${index*0.07}s both` }}>
      <div style={{ flexShrink:0, height:'100%', display:'flex', alignItems:'center', gap:7,
        padding:'0 14px', background:`${cfg.accent}16`, color:cfg.accent, borderRight:`1px solid ${cfg.accent}35` }}>
        {cfg.icon}
        <span style={{ fontFamily:'var(--font-mono)', fontSize:9, letterSpacing:2, fontWeight:700 }}>{cfg.label}</span>
      </div>
      <div style={{ flex:1, minWidth:0, overflow:'hidden', whiteSpace:'nowrap' }}>
        <span style={{ display:'inline-block', fontFamily:'var(--font-mono)', fontSize:11, color:'#e8eef8',
          letterSpacing:0.3, animation:`bnrTicker ${Math.max(12, banner.message.length * 0.14)}s linear infinite` }}>
          {banner.message}&nbsp;&nbsp;&nbsp;·&nbsp;&nbsp;&nbsp;{banner.message}&nbsp;&nbsp;&nbsp;·&nbsp;&nbsp;&nbsp;
        </span>
      </div>
      {expiry && <span style={{ flexShrink:0, fontFamily:'var(--font-mono)', fontSize:8,
        color:`${cfg.accent}cc`, padding:'0 10px', whiteSpace:'nowrap' }}>⏱ {expiry}</span>}
      <LinkBtn banner={banner} cfg={cfg} />
      <DismissBtn banner={banner} cfg={cfg} onDismiss={onDismiss} />
    </div>
  )
}

/* ── NEON style (glowing strip) ─────────────────────────────────────────── */
function NeonBanner({ banner, cfg, onDismiss, leaving, index }) {
  const expiry = useExpiryCountdown(banner.expires_at)
  return (
    <div style={{ padding:'10px 16px', background: SOLID,
      boxShadow:`inset 0 0 22px color-mix(in srgb, ${cfg.accent} 12%, transparent)`,
      animation: leaving ? 'bnrSlideOut .34s forwards' : `bnrSlideIn .38s cubic-bezier(.16,1,.3,1) ${index*0.07}s both` }}>
      <div style={{ display:'flex', alignItems:'center', gap:12, maxWidth:1180, margin:'0 auto',
        padding:'10px 16px', borderRadius:12, background:`linear-gradient(90deg,color-mix(in srgb, ${cfg.accent} 14%, transparent), rgba(0,0,0,0.2))`,
        border:`1px solid color-mix(in srgb, ${cfg.accent} 55%, transparent)`,
        boxShadow:`0 0 22px color-mix(in srgb, ${cfg.accent} 22%, transparent), inset 0 0 14px color-mix(in srgb, ${cfg.accent} 8%, transparent)` }}>
        <span style={{ color:cfg.accent, filter:`drop-shadow(0 0 6px color-mix(in srgb, ${cfg.accent} 60%, transparent))`, display:'flex', flexShrink:0 }}>{cfg.icon}</span>
        <span style={{ fontFamily:'var(--font-mono)', fontSize:9, letterSpacing:2, fontWeight:700, color:cfg.accent,
          textShadow:`0 0 10px color-mix(in srgb, ${cfg.accent} 60%, transparent)`, whiteSpace:'nowrap', flexShrink:0 }}>{cfg.label}</span>
        <span style={{ fontFamily:'var(--font-mono)', fontSize:12, color:'#eef2f9', flex:1, minWidth:0,
          overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{banner.message}</span>
        {expiry && <span style={{ fontFamily:'var(--font-mono)', fontSize:8, color:`${cfg.accent}dd`, whiteSpace:'nowrap', flexShrink:0 }}>⏱ {expiry}</span>}
        <LinkBtn banner={banner} cfg={cfg} />
        <DismissBtn banner={banner} cfg={cfg} onDismiss={onDismiss} />
      </div>
    </div>
  )
}

/* ── TERMINAL style (command rail) ──────────────────────────────────────── */
function TerminalBanner({ banner, cfg, onDismiss, leaving, index }) {
  const expiry = useExpiryCountdown(banner.expires_at)
  return (
    <div style={{ padding:'8px 16px', background:'#0a0e14', borderBottom:`1px solid color-mix(in srgb, ${cfg.accent} 35%, transparent)`,
      animation: leaving ? 'bnrSlideOut .34s forwards' : `bnrSlideIn .38s cubic-bezier(.16,1,.3,1) ${index*0.07}s both` }}>
      <div style={{ display:'flex', alignItems:'center', gap:10, maxWidth:1180, margin:'0 auto',
        fontFamily:'var(--font-mono)', fontSize:11 }}>
        <span style={{ color:'var(--green)' }}>$</span>
        <span style={{ color:cfg.accent, letterSpacing:1 }}>{cfg.label.toLowerCase()}</span>
        <span style={{ color:'#8b98a8', flex:1, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{banner.message}</span>
        {expiry && <span style={{ color:`${cfg.accent}bb`, fontSize:9, whiteSpace:'nowrap', flexShrink:0 }}># eta {expiry}</span>}
        <LinkBtn banner={banner} cfg={cfg} />
        <DismissBtn banner={banner} cfg={cfg} onDismiss={onDismiss} />
      </div>
    </div>
  )
}

/* ── GRADIENT style (bold color bar) ────────────────────────────────────── */
function GradientBanner({ banner, cfg, onDismiss, leaving, index }) {
  const expiry = useExpiryCountdown(banner.expires_at)
  const grad = `linear-gradient(90deg, ${cfg.accent}, color-mix(in srgb, ${cfg.accent} 55%, var(--cyan)), ${cfg.accent})`
  return (
    <div style={{ padding:'0', background: SOLID,
      animation: leaving ? 'bnrSlideOut .34s forwards' : `bnrSlideIn .38s cubic-bezier(.16,1,.3,1) ${index*0.07}s both` }}>
      <div style={{ height:3, background:grad, boxShadow:`0 0 14px color-mix(in srgb, ${cfg.accent} 60%, transparent)` }} />
      <div style={{ display:'flex', alignItems:'center', gap:12, maxWidth:1180, margin:'0 auto', padding:'11px 16px' }}>
        <span style={{ color:cfg.accent, display:'flex', flexShrink:0 }}>{cfg.icon}</span>
        <span style={{ fontFamily:'var(--font-mono)', fontSize:9, letterSpacing:2, fontWeight:700, color:cfg.accent, whiteSpace:'nowrap', flexShrink:0 }}>{cfg.label}</span>
        <span style={{ fontFamily:'var(--font-mono)', fontSize:12, color:'#f2f5fa', flex:1, minWidth:0,
          overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{banner.message}</span>
        {expiry && <span style={{ fontFamily:'var(--font-mono)', fontSize:8, color:`${cfg.accent}dd`, whiteSpace:'nowrap', flexShrink:0 }}>⏱ {expiry}</span>}
        <LinkBtn banner={banner} cfg={cfg} />
        <DismissBtn banner={banner} cfg={cfg} onDismiss={onDismiss} />
      </div>
    </div>
  )
}

/* ── Route to correct style component ────────────────────────────────────── */
function BannerBar({ banner, onClose, index }) {
  const cfg = TYPE_CFG[banner.type] || TYPE_CFG.info
  const id  = banner._id || banner.id
  const [leaving, setLeaving] = useState(false)
  const dismiss = () => { setLeaving(true); setTimeout(() => onClose(id), 340) }
  const props = { banner, cfg, onDismiss: dismiss, leaving, index }

  const style = banner.style || 'banner'
  if (style === 'hero')     return <HeroBanner    {...props} />
  if (style === 'minimal')  return <MinimalBanner  {...props} />
  if (style === 'floating') return <FloatingBanner {...props} />
  if (style === 'pill')     return <PillBanner     {...props} />
  if (style === 'glass')    return <GlassBanner    {...props} />
  if (style === 'outline')  return <OutlineBanner  {...props} />
  if (style === 'ticker')   return <TickerBanner   {...props} />
  if (style === 'neon')     return <NeonBanner     {...props} />
  if (style === 'terminal') return <TerminalBanner {...props} />
  if (style === 'gradient') return <GradientBanner {...props} />
  return <StripBanner {...props} />        // 'banner' (default strip)
}

/* ── Root component ──────────────────────────────────────────────────────── */
export default function SiteBanner() {
  const location  = useLocation()
  const bannerRef = useRef(null)
  const [spacerH,    setSpacerH]  = useState(0)
  const [banners,    setBanners]  = useState([])
  const [dismissed,  setDismissed]= useState(() => {
    if (typeof window === 'undefined') return []
    try { return JSON.parse(sessionStorage.getItem('dismissedBanners') || '[]') } catch { return [] }
  })
  const [maintenance,setMaint]    = useState(false)
  const [siteConfig, setSiteCfg]  = useState({})
  const [isAdmin,    setIsAdmin]  = useState(() => {
    try {
      const t = getAuthToken()
      if (t) { const p = JSON.parse(atob(t.split('.')[1])); return p.role === 'admin' }
    } catch {}
    return false
  })
  const [nowTick,    setNowTick]  = useState(() => Date.now())

  const isAdminRoute = location.pathname.startsWith('/admin') || location.pathname.startsWith('/login')

  const fetchBanners = () =>
    api.get('/admin/banners')
      .then(r => setBanners((r.data || []).filter(b => b.active)))
      .catch(() => {})

  useEffect(() => {
    const sb = getSupabase()

    fetchBanners()
    api.get('/admin/site-settings').then(r => {
      if (r.data?.maintenanceMode) setMaint(true)
      setSiteCfg(r.data || {})
    }).catch(() => {})

    // ── Primary: Supabase Realtime (instant push on any banner change) ──────
    // Requires: ALTER TABLE banners REPLICA IDENTITY FULL;
    //           ALTER PUBLICATION supabase_realtime ADD TABLE banners;
    const channel = sb
      ? sb
          .channel('banners-live')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'banners' }, fetchBanners)
          .subscribe()
      : null

    // ── Fallback polling (30 s) — catches updates when Realtime isn't fired ─
    // Covers cases where REPLICA IDENTITY FULL is not yet applied on the table.
    const poll = setInterval(fetchBanners, 30_000)
    const clock = setInterval(() => setNowTick(Date.now()), 30_000)

    return () => {
      if (sb && channel) sb.removeChannel(channel)
      clearInterval(poll)
      clearInterval(clock)
    }
  }, [])

  useEffect(() => {
    if (!bannerRef.current) return
    const ro = new ResizeObserver(entries => {
      for (const e of entries) setSpacerH(e.contentRect.height)
    })
    ro.observe(bannerRef.current)
    return () => ro.disconnect()
  }, [])

  const handleClose = id => {
    const next = [...dismissed, id]
    setDismissed(next)
    try { sessionStorage.setItem('dismissedBanners', JSON.stringify(next)) } catch {}
  }

  const visible = banners.filter(b => isBannerVisibleNow(b, nowTick) && !dismissed.includes(b._id || b.id))

  // Separate floating banners — they render fixed, outside the band
  const floatingBanners = visible.filter(b => b.style === 'floating')
  const stackedBanners  = visible.filter(b => b.style !== 'floating')

  if (maintenance && !isAdmin && !isAdminRoute) return (
    <MaintenanceScreen
      message={siteConfig.maintenanceMessage}       style={siteConfig.maintenanceStyle}
      status={siteConfig.maintenanceStatus}          icon={siteConfig.maintenanceIcon}
      returnTime={siteConfig.maintenanceReturnTime}  showProgress={siteConfig.maintenanceShowProgress}
      progress={siteConfig.maintenanceProgress}      showSocial={siteConfig.maintenanceShowSocial}
      bgStyle={siteConfig.maintenanceBgStyle}        siteConfig={siteConfig}
    />
  )

  if (!visible.length) return null

  return (
    <>
      <style>{KF}</style>

      {/* Fixed-position top band for strip / hero / minimal / pill */}
      {stackedBanners.length > 0 && (
        <>
          <div ref={bannerRef} style={{ position:'fixed', top:64, left:0, right:0, zIndex:99, overflow:'hidden' }}>
            {stackedBanners.map((b, i) => (
              <BannerBar key={b._id || b.id} banner={b} index={i} onClose={handleClose} />
            ))}
          </div>
          <div style={{ height: spacerH }} aria-hidden="true" />
        </>
      )}

      {/* Floating banners render as fixed corner cards */}
      {floatingBanners.map((b, i) => (
        <BannerBar key={b._id || b.id} banner={b} index={i} onClose={handleClose} />
      ))}
    </>
  )
}
