'use client'
import React, { useState, useEffect, useCallback } from 'react'
import api from '@/lib/api'
import AnimationPicker from '../../components/AnimationPicker'
import ThemePicker from '../../components/ThemePicker'
import { useTheme } from '@/app/providers'

import { useNotify } from '../../core/notify.jsx'
import { useDialog } from '../../core/dialog.jsx'
import { clearSiteSettingsCache } from '@/lib/siteSettings'
import { S, useIsMobile, PageHeader } from './shared'
import {
  Toggle, PillPicker,
  HEADER_PRESETS, FOOTER_PRESETS,
  HeaderPreviewSVG, FooterPreviewSVG, PresetPicker
} from './SiteSettings'
import {
  FRAMEWORK_CATEGORIES, DEFAULT_FRAMEWORK, NOTIFY_POSITIONS, THEME_PACKAGES,
} from '../../core/framework-styles.js'

// ── Framework preview tokens ──────────────────────────────────────────────────
const _G   = 'var(--green)', _CY = 'var(--cyan)'
const _BG  = 'var(--bg)',    _BG2 = 'var(--bg2)', _BG3 = 'var(--bg3)'
const _BD  = 'var(--border)',_TX  = 'var(--text)', _MT  = 'var(--muted)'
const _FM  = 'var(--font-mono)', _FD = 'var(--font-display)'
const _tag = c => ({ fontFamily: _FM, fontSize: 8, letterSpacing: 2, padding: '2px 8px', borderRadius: 3, border: `1px solid ${c}44`, color: c, background: `${c}12` })

function FwMenuPreview({ id }) {
  const items = ['Dashboard','Settings','Logout']
  const conf = {
    cyber:    { bg: _BG2, border:`1px solid color-mix(in srgb, var(--green) 30%, transparent)`, color:_G,  hover:'color-mix(in srgb, var(--green) 6%, transparent)', r:4 },
    glass:    { bg:'rgba(10,20,35,0.8)', border:'1px solid rgba(255,255,255,0.1)', color:_TX, hover:'rgba(255,255,255,0.07)', r:10, bd:'blur(16px)' },
    terminal: { bg:'#060a06', border:'1px solid #00ff8833', color:'#33ff33', hover:'color-mix(in srgb, var(--green) 8%, transparent)', r:0 },
    minimal:  { bg:_BG2, border:`1px solid ${_BD}`, color:_TX, hover:'rgba(255,255,255,0.04)', r:6 },
    neon:     { bg:_BG,  border:'1px solid color-mix(in srgb, var(--cyan) 60%, transparent)', color:_CY, hover:'color-mix(in srgb, var(--cyan) 8%, transparent)', r:5, sh:'0 0 12px color-mix(in srgb, var(--cyan) 15%, transparent)' },
    floating: { bg:_BG2, border:'none', color:_TX, hover:'rgba(255,255,255,0.06)', r:14, sh:'0 12px 32px rgba(0,0,0,0.5)' },
    holo:     { bg:'rgba(8,20,32,0.85)', border:'1px solid rgba(0,229,255,0.45)', color:_CY, hover:'rgba(0,229,255,0.12)', r:14, sh:'0 0 18px rgba(0,229,255,0.18), inset 0 0 14px rgba(0,229,255,0.06)' },
    matrix:   { bg:'#020604', border:'1px solid #22ff2244', color:'#33ff33', hover:'rgba(0,255,0,0.08)', r:0, sh:'0 0 14px rgba(0,255,0,0.1)' },
  }
  const s = conf[id] || conf.cyber
  return <div style={{ width:'100%', padding:'5px 3px', background:s.bg, border:s.border, borderRadius:s.r, backdropFilter:s.bd, boxShadow:s.sh, overflow:'hidden' }}>
    {items.map((item,i) => <div key={i} style={{ fontFamily:_FM, fontSize:9, color:s.color, padding:'5px 8px', borderRadius:Math.max(0,s.r-2), background:i===0?s.hover:'transparent', display:'flex', alignItems:'center', gap:5 }}><span style={{ opacity:0.5, fontSize:8 }}>›</span>{item}</div>)}
  </div>
}
function FwNotifyPreview({ id }) {
  const p = { cyber:<div style={{ background:'color-mix(in srgb, var(--green) 7%, transparent)', border:'1px solid color-mix(in srgb, var(--green) 25%, transparent)', padding:'9px 10px 9px 34px', position:'relative', overflow:'hidden', width:'100%' }}><div style={{ position:'absolute', left:0, top:0, bottom:0, width:3, background:_G }}/><div style={{ position:'absolute', left:11, top:'50%', transform:'translateY(-50%)', fontFamily:_FM, fontSize:11, color:_G }}>✓</div><div style={{ fontFamily:_FM, fontSize:9, color:_G, marginBottom:1 }}>SUCCESS</div><div style={{ fontFamily:_FD, fontSize:11, color:_TX }}>Changes saved!</div></div>, pill:<div style={{ background:'color-mix(in srgb, var(--green) 8%, transparent)', border:'1px solid color-mix(in srgb, var(--green) 25%, transparent)', borderRadius:999, padding:'7px 14px 7px 10px', display:'flex', alignItems:'center', gap:7 }}><span style={{ fontSize:12, color:_G }}>✓</span><span style={{ fontFamily:_FM, fontSize:10, color:_TX }}>Changes saved!</span></div>, minimal:<div style={{ background:_BG2, border:`1px solid ${_BD}`, borderRadius:7, padding:'9px 12px', width:'100%' }}><div style={{ fontFamily:_FM, fontSize:8, color:_G, letterSpacing:1, marginBottom:2 }}>SUCCESS</div><div style={{ fontFamily:_FD, fontSize:11, color:_TX }}>Changes saved!</div></div>, terminal:<div style={{ background:'#0a0f0a', border:'1px solid color-mix(in srgb, var(--green) 30%, transparent)', padding:'7px 10px', width:'100%' }}><span style={{ fontFamily:_FM, fontSize:10, color:_G, fontWeight:700, marginRight:6 }}>[SUCCESS]</span><span style={{ fontFamily:_FM, fontSize:10, color:'#a0d0a0' }}>Saved!</span></div>, glass:<div style={{ background:'rgba(10,20,30,0.7)', border:'1px solid color-mix(in srgb, var(--green) 30%, transparent)', borderRadius:9, padding:'9px 10px 9px 34px', backdropFilter:'blur(16px)', position:'relative', width:'100%' }}><div style={{ position:'absolute', left:0, top:0, bottom:0, width:3, background:_G, borderRadius:'9px 0 0 9px' }}/><div style={{ position:'absolute', left:11, top:'50%', transform:'translateY(-50%)', fontSize:12, color:_G }}>✓</div><div style={{ fontFamily:_FD, fontSize:11, color:_TX }}>Changes saved!</div></div>, banner:<div style={{ background:'color-mix(in srgb, var(--green) 7%, transparent)', borderLeft:'3px solid '+_G, padding:'8px 12px', display:'flex', alignItems:'center', gap:7, width:'100%' }}><span style={{ fontSize:10, color:_G }}>✓</span><span style={{ fontFamily:_FM, fontSize:10, color:_TX }}>Site updated.</span></div> }
  p.float = <div style={{ background:_BG2, border:`1px solid ${_BD}`, borderRadius:8, padding:9, width:'100%', boxShadow:'0 10px 22px rgba(0,0,0,.35)' }}><div style={{ display:'flex', gap:7, alignItems:'center' }}><span style={{ width:18, height:18, borderRadius:5, background:'color-mix(in srgb, var(--green) 12%, transparent)', color:_G, display:'grid', placeItems:'center', fontSize:10 }}>✓</span><div><div style={{ fontFamily:_FM, fontSize:8, color:_G }}>Saved</div><div style={{ fontFamily:_FM, fontSize:7, color:_MT }}>12:04 · aifazi.net</div></div></div></div>
  p.glitch = <div style={{ background:'rgba(255,71,87,.08)', border:'1px solid var(--red)', padding:'9px 10px', width:'100%', position:'relative', overflow:'hidden' }}><div style={{ fontFamily:_FM, fontSize:8, color:'var(--red)', letterSpacing:2 }}>[ALERT]</div><div style={{ fontFamily:_FM, fontSize:10, color:'var(--red)', textShadow:`2px 0 ${_CY}` }}>SYNC COMPLETE</div></div>
  p.inbox = <div style={{ width:'100%', display:'flex', flexDirection:'column', gap:3 }}>{[0,1,2].map(i=><div key={i} style={{ display:'flex', gap:5, alignItems:'center', background:i===0?'color-mix(in srgb, var(--green) 8%, transparent)':_BG2, border:`1px solid ${_BD}`, borderRadius:5, padding:'4px 6px' }}><span style={{ width:5, height:5, borderRadius:'50%', background:i===0?_G:_MT }}/><span style={{ fontFamily:_FM, fontSize:7, color:i===0?_TX:_MT }}>Message {i+1}</span></div>)}</div>
  p.hud = <div style={{ marginLeft:'auto', width:92, background:'color-mix(in srgb, var(--cyan) 6%, transparent)', border:`1px solid ${_CY}55`, padding:'6px 7px', clipPath:'polygon(0 0,100% 0,100% 75%,88% 100%,0 100%)' }}><div style={{ fontFamily:_FM, fontSize:7, color:_CY, letterSpacing:2 }}>HUD</div><div style={{ fontFamily:_FM, fontSize:9, color:_TX }}>ONLINE</div></div>
  p.holo = <div style={{ background:'rgba(8,20,32,0.85)', border:'1px solid rgba(0,229,255,0.45)', borderRadius:14, padding:'9px 10px 9px 34px', position:'relative', boxShadow:'0 0 16px rgba(0,229,255,0.15)', width:'100%' }}><div style={{ position:'absolute', left:5, top:5, width:7, height:7, borderLeft:'1px solid rgba(0,229,255,0.5)', borderTop:'1px solid rgba(0,229,255,0.5)' }}/><div style={{ position:'absolute', right:5, bottom:5, width:7, height:7, borderRight:'1px solid rgba(0,229,255,0.5)', borderBottom:'1px solid rgba(0,229,255,0.5)' }}/><div style={{ position:'absolute', left:11, top:'50%', transform:'translateY(-50%)', width:14, height:14, borderRadius:'50%', border:`1px solid ${_CY}88`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:8, color:_CY }}>✓</div><div style={{ fontFamily:_FM, fontSize:8, color:_CY }}>SUCCESS</div><div style={{ fontFamily:_FD, fontSize:11, color:_TX }}>Changes saved!</div></div>
  p.chip = <div style={{ display:'flex', alignItems:'center', gap:7, background:_BG2, border:`1px solid ${_BD}`, borderRadius:5, padding:'6px 9px', width:'100%' }}><span style={{ width:7, height:7, borderRadius:'50%', background:_G }}/><span style={{ fontFamily:_FM, fontSize:7, color:_MT }}>12:04</span><span style={{ fontFamily:_FM, fontSize:9, color:_TX, flex:1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>Changes saved!</span><span style={{ fontFamily:_FM, fontSize:8, color:_G }}>▶</span></div>
  return <div style={{ width:'100%' }}>{p[id]||p.cyber}</div>
}
function FwDialogPreview({ id }) {
  const red='var(--red)', confs={ cyber:{bg:_BG2, border:'1px solid rgba(255,71,87,0.5)', r:0, topBar:true}, glass:{bg:'rgba(10,20,30,0.82)', border:'1px solid rgba(255,71,87,0.3)', r:12, bd:'blur(20px)'}, terminal:{bg:'#0a0f0a', border:'1px solid rgba(255,71,87,0.5)', r:4, titleBar:true}, sheet:{bg:_BG2, border:`1px solid ${_BD}`, r:'12px 12px 0 0', handle:true}, minimal:{bg:_BG2, border:`1px solid ${_BD}`, r:10}, brutal:{bg:_BG, border:'3px solid rgba(255,71,87,0.8)', r:0, sh:'4px 4px 0 rgba(255,71,87,0.7)'}, command:{bg:'#080d16', border:'1px solid rgba(56,189,248,0.35)', r:10, topBar:true}, split:{bg:_BG2, border:`1px solid ${_BD}`, r:8, side:true}, drawer:{bg:_BG2, border:`1px solid ${_BD}`, r:'8px 0 0 8px', drawer:true}, paper:{bg:'#f7f1e8', border:'1px solid #d5c8b8', r:2, paper:true}, holo:{bg:'rgba(8,20,32,0.85)', border:'1px solid rgba(0,229,255,0.45)', r:16, holo:true, sh:'0 0 18px rgba(0,229,255,0.15)'}, crt:{bg:'#020604', border:'1px solid #33ff3366', r:4, crt:true, sh:'0 0 16px rgba(0,255,0,0.12)'} }, s=confs[id]||confs.cyber
  if (s.side) return <div style={{ width:'100%', display:'grid', gridTemplateColumns:'36px 1fr', background:s.bg, border:s.border, borderRadius:s.r, overflow:'hidden' }}><div style={{ background:'rgba(255,71,87,0.12)', display:'flex', alignItems:'center', justifyContent:'center', color:red, fontSize:18 }}>!</div><div style={{ padding:9 }}><div style={{ fontFamily:_FD, fontSize:12, fontWeight:700, color:_TX }}>Review change</div><div style={{ fontFamily:_FM, fontSize:8, color:_MT, marginTop:3 }}>Split info + actions</div><div style={{ height:1, background:_BD, margin:'8px 0' }}/><div style={{ display:'flex', gap:5 }}><span style={{ flex:1, height:14, border:`1px solid ${_BD}` }}/><span style={{ flex:1, height:14, background:red }}/></div></div></div>
  if (s.drawer) return <div style={{ width:'74%', marginLeft:'auto', height:'100%', background:s.bg, border:s.border, borderRadius:s.r, padding:10, boxShadow:'-12px 0 30px rgba(0,0,0,0.35)' }}><div style={{ fontFamily:_FM, fontSize:7, color:_MT, letterSpacing:2 }}>INSPECTOR</div><div style={{ fontFamily:_FD, fontSize:13, color:_TX, fontWeight:700, margin:'5px 0 8px' }}>Publish?</div><div style={{ height:4, width:'70%', background:red, borderRadius:2 }}/><div style={{ height:4, width:'45%', background:_BD, marginTop:5, borderRadius:2 }}/></div>
  if (s.paper) return <div style={{ width:'100%', background:s.bg, border:s.border, borderRadius:s.r, color:'#1a1a1a', padding:10, boxShadow:'0 2px 8px rgba(0,0,0,0.18)' }}><div style={{ fontFamily:'serif', fontSize:15, fontWeight:900 }}>Delete draft?</div><div style={{ height:1, background:'#1a1a1a', opacity:0.25, margin:'6px 0' }}/><div style={{ display:'flex', justifyContent:'space-between', fontFamily:_FM, fontSize:7 }}><span>CANCEL</span><span style={{ color:'#b91c1c' }}>CONFIRM</span></div></div>
  if (s.crt) return <div style={{ width:'100%', background:s.bg, border:s.border, borderRadius:s.r, boxShadow:s.sh, overflow:'hidden', position:'relative' }}><div style={{ position:'absolute', inset:0, pointerEvents:'none', background:'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.25) 2px,rgba(0,0,0,0.25) 4px)' }}/><div style={{ display:'flex', alignItems:'center', gap:5, padding:'5px 8px', borderBottom:'1px solid rgba(51,255,51,0.2)', fontFamily:_FM, fontSize:7, color:'#33ff33', letterSpacing:2 }}><span style={{ width:6, height:6, borderRadius:'50%', background:'#33ff33' }}/>PHOSPHOR.DIALOG</div><div style={{ padding:'9px 11px 7px' }}><div style={{ fontFamily:_FM, fontSize:7, color:'#33ff33', letterSpacing:2, marginBottom:3 }}>⚠ DANGER</div><div style={{ fontFamily:_FD, fontSize:12, fontWeight:700, color:'#33ff33', marginBottom:6 }}>Delete post?</div><div style={{ display:'flex', borderTop:'1px solid rgba(51,255,51,0.2)' }}><div style={{ flex:1, padding:'6px 0', fontFamily:_FM, fontSize:8, color:'rgba(51,255,51,0.6)', textAlign:'center', borderRight:'1px solid rgba(51,255,51,0.2)' }}>CANCEL</div><div style={{ flex:1, padding:'6px 0', fontFamily:_FM, fontSize:8, color:'#33ff33', textAlign:'center', fontWeight:700, background:'rgba(51,255,51,0.08)' }}>CONFIRM</div></div></div></div>
  if (s.holo) return <div style={{ width:'100%', position:'relative', background:s.bg, border:s.border, borderRadius:s.r, boxShadow:s.sh, overflow:'hidden' }}><div style={{ position:'absolute', top:8, left:8, width:9, height:9, borderLeft:'1px solid rgba(0,229,255,0.5)', borderTop:'1px solid rgba(0,229,255,0.5)' }}/><div style={{ position:'absolute', top:8, right:8, width:9, height:9, borderRight:'1px solid rgba(0,229,255,0.5)', borderTop:'1px solid rgba(0,229,255,0.5)' }}/><div style={{ position:'absolute', bottom:8, left:8, width:9, height:9, borderLeft:'1px solid rgba(0,229,255,0.5)', borderBottom:'1px solid rgba(0,229,255,0.5)' }}/><div style={{ position:'absolute', bottom:8, right:8, width:9, height:9, borderRight:'1px solid rgba(0,229,255,0.5)', borderBottom:'1px solid rgba(0,229,255,0.5)' }}/><div style={{ padding:'10px 12px' }}><div style={{ fontFamily:_FM, fontSize:7, color:_CY, letterSpacing:2, marginBottom:3 }}>⚠ DANGER</div><div style={{ fontFamily:_FD, fontSize:12, fontWeight:700, color:_TX, marginBottom:6 }}>Delete post?</div><div style={{ display:'flex', borderTop:'1px solid rgba(0,229,255,0.2)' }}><div style={{ flex:1, padding:'6px 0', fontFamily:_FM, fontSize:8, color:_MT, textAlign:'center', borderRight:'1px solid rgba(0,229,255,0.2)' }}>CANCEL</div><div style={{ flex:1, padding:'6px 0', fontFamily:_FM, fontSize:8, color:_CY, textAlign:'center', fontWeight:700, background:'rgba(0,229,255,0.08)' }}>CONFIRM</div></div></div></div>
  return <div style={{ width:'100%', background:s.bg, border:s.border, borderRadius:s.r, backdropFilter:s.bd, boxShadow:s.sh, overflow:'hidden' }}>{s.topBar&&<div style={{ height:2, background:`linear-gradient(90deg,${red},transparent)` }}/>}{s.titleBar&&<div style={{ background:'rgba(255,71,87,0.1)', borderBottom:'1px solid rgba(255,71,87,0.2)', padding:'4px 8px', display:'flex', gap:4 }}>{['#ff5f56','#ffbd2e','#27c93f'].map(c=><div key={c} style={{ width:7, height:7, borderRadius:'50%', background:c }}/>)}</div>}{s.handle&&<div style={{ width:24, height:3, borderRadius:3, background:_MT, margin:'6px auto', opacity:0.4 }}/>}<div style={{ padding:'9px 11px 7px' }}><div style={{ fontFamily:_FM, fontSize:7, color:red, letterSpacing:2, marginBottom:3 }}>⚠ DANGER</div><div style={{ fontFamily:_FD, fontSize:12, fontWeight:700, color:_TX, marginBottom:6 }}>Delete post?</div><div style={{ display:'flex', borderTop:`1px solid ${_BD}` }}><div style={{ flex:1, padding:'6px 0', fontFamily:_FM, fontSize:8, color:_MT, textAlign:'center', borderRight:`1px solid ${_BD}` }}>CANCEL</div><div style={{ flex:1, padding:'6px 0', fontFamily:_FM, fontSize:8, color:red, textAlign:'center', fontWeight:700, background:'rgba(255,71,87,0.08)' }}>CONFIRM</div></div></div></div>
}
function FwInputPreview({ id }) {
  const c={ cyber:{bg:_BG3,b:`1px solid ${_CY}55`,r:0,sh:`inset 3px 0 0 ${_CY}`}, glass:{bg:'rgba(255,255,255,0.06)',b:'1px solid rgba(255,255,255,0.16)',r:12,bd:'blur(14px)'}, terminal:{bg:'#050805',b:'1px solid #33ff3355',r:2,fg:'#33ff33',prompt:'>'}, minimal:{bg:'transparent',b:'0 solid transparent',r:0,under:true}, brutal:{bg:'#fff',b:'3px solid #111',r:0,fg:'#111',sh:'4px 4px 0 #111'}, paper:{bg:'#fbf5ea',b:'1px solid #d8c7b3',r:2,fg:'#2b241f',paper:true}, pill:{bg:_BG3,b:`1px solid ${_BD}`,r:999}, command:{bg:'#070b12',b:`1px solid ${_CY}44`,r:8,cmd:true}, holo:{bg:'rgba(8,20,32,0.85)',b:'1px solid rgba(0,229,255,0.4)',r:12,fg:'#e6faff',bd:'blur(14px)',sh:'0 0 12px rgba(0,229,255,0.08)'}, crt:{bg:'#020604',b:'1px solid #33ff3344',r:2,fg:'#33ff33',prompt:'$'} }[id] || {}
  if (c.cmd) return <div style={{ width:'100%', background:c.bg, border:c.b, borderRadius:c.r, padding:8 }}><div style={{ fontFamily:_FM, fontSize:8, color:_MT, marginBottom:6 }}>⌘ Search actions</div><div style={{ display:'flex', gap:5 }}>{['deploy','theme','user'].map(x=><span key={x} style={{ fontFamily:_FM, fontSize:7, color:_CY, border:`1px solid ${_CY}33`, padding:'2px 5px', borderRadius:4 }}>{x}</span>)}</div></div>
  return <div style={{ width:'100%', display:'flex', flexDirection:'column', gap:6 }}><div style={{ fontFamily:_FM, fontSize:7, color:c.paper?'#6f5d4c':_MT, letterSpacing:2 }}>EMAIL</div><div style={{ height:28, display:'flex', alignItems:'center', gap:6, padding:'0 10px', color:c.fg||_TX, background:c.bg, border:c.under?'none':c.b, borderBottom:c.under?`1px solid ${_BD}`:undefined, borderRadius:c.r, boxShadow:c.sh, backdropFilter:c.bd, fontFamily:_FM, fontSize:9 }}><span style={{ color:c.fg||_CY }}>{c.prompt||'@'}</span><span style={{ opacity:.75 }}>hello@aifazi.net</span></div><div style={{ height:20, border:c.under?`1px solid ${_BD}`:c.b, borderRadius:c.r, background:c.paper?'#fff8ef':c.bg, opacity:.65 }}/></div>
}
function FwSurfacePreview({ id }) {
  const map={
    'cyber-grid':{bg:_BG, card:_BG2, line:_CY, grid:true},
    'clean-app':{bg:'#f6f8fb', card:'#ffffff', line:'#2563eb', light:true},
    'glass-dock':{bg:'#07111f', card:'rgba(255,255,255,0.08)', line:'#7b61ff', glass:true},
    'paper-doc':{bg:'#f4eadc', card:'#fffaf1', line:'#1f2937', paper:true},
    terminal:{bg:'#050805', card:'#091009', line:'#33ff33', term:true},
    'neon-stage':{bg:'#10071c', card:'#180a30', line:'#ff2d8b', stage:true},
    brutalist:{bg:'#f2f0ec', card:'#fff', line:'#000', brutal:true},
    dashboard:{bg:'#07111a', card:'#0d1722', line:'#38bdf8', dash:true},
    holo:{bg:'#08121c', card:'rgba(8,24,40,0.7)', line:'#00e5ff', glass:true, hololine:true},
    void:{bg:'#04050a', card:'#0a0d16', line:'#1e2740', voidline:true},
  }
  const s=map[id]||map['cyber-grid']
  return <div style={{ width:'100%', height:'100%', background:s.bg, position:'relative', padding:8, overflow:'hidden', color:s.light||s.paper||s.brutal?'#111':_TX }}>{s.grid&&<div style={{ position:'absolute', inset:0, backgroundImage:`linear-gradient(${_BD} 1px,transparent 1px),linear-gradient(90deg,${_BD} 1px,transparent 1px)`, backgroundSize:'14px 14px', opacity:.45 }}/>} {s.stage&&<div style={{ position:'absolute', left:0, right:0, bottom:0, height:28, background:'linear-gradient(180deg,transparent,rgba(255,45,139,.22))' }}/>}<div style={{ position:'relative', height:'100%', display:'grid', gridTemplateColumns:s.dash?'34px 1fr':'1fr 1fr', gap:6 }}><div style={{ background:s.card, border:`${s.brutal?2:1}px solid ${s.line}${s.brutal?'':'55'}`, borderRadius:s.glass?12:s.brutal?0:5, backdropFilter:s.glass?'blur(14px)':undefined, boxShadow:s.brutal?'4px 4px 0 #000':undefined }}/><div style={{ background:s.card, border:`1px solid ${s.line}${s.brutal?'':'44'}`, borderRadius:s.paper?2:s.glass?12:s.brutal?0:5, padding:6 }}><div style={{ height:4, width:'70%', background:s.line, marginBottom:6 }}/><div style={{ height:3, width:'90%', background:s.line, opacity:.35, marginBottom:4 }}/><div style={{ height:3, width:'52%', background:s.line, opacity:.25 }}/></div></div></div>
}
function FwLoadingPreview({ id }) {
  const g='#00ff88', cy='var(--cyan)'
  const p={ terminal:<div style={{ fontFamily:_FM, fontSize:8, color:g, textAlign:'left', padding:'5px 7px', background:'#060a06', border:'1px solid color-mix(in srgb, var(--green) 20%, transparent)', borderRadius:3, width:'100%' }}><div style={{ color:_MT, marginBottom:1 }}>{'>'} Initializing...</div><div>{'>'} <span style={{ color:g }}>eth0: connected [OK]</span></div><div style={{ display:'flex', gap:3, marginTop:4, height:2 }}><div style={{ flex:3, background:`linear-gradient(90deg,${g},${cy})`, borderRadius:2 }}/><div style={{ flex:2, background:'rgba(255,255,255,0.06)', borderRadius:2 }}/></div></div>, minimal:<div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:7 }}><div style={{ width:26, height:26, borderRadius:'50%', border:`1.5px solid transparent`, borderTopColor:g, borderBottomColor:cy, animation:'fwSpin 1s linear infinite' }}/><div style={{ fontFamily:_FM, fontSize:8, color:_MT, letterSpacing:2 }}>LOADING</div></div>, glitch:<div style={{ position:'relative', fontFamily:_FD, fontSize:20, fontWeight:700, letterSpacing:-1, textAlign:'center' }}>TANVIR<span style={{ color:g }}>.</span><span style={{ position:'absolute', inset:0, color:cy, clipPath:'polygon(0 0,100% 0,100% 40%,0 40%)', animation:'fwGlitch 2s infinite', opacity:0.6 }}>TANVIR.</span></div>, splash:<div style={{ textAlign:'center' }}><div style={{ fontFamily:_FD, fontSize:20, fontWeight:700, letterSpacing:-1 }}>T<span style={{ color:g }}>.</span>TANVIR</div><div style={{ display:'flex', justifyContent:'center', gap:4, marginTop:5 }}>{[0,1,2].map(i=><div key={i} style={{ width:4, height:4, borderRadius:'50%', background:g, animation:`fwBounce 0.8s ${i*0.15}s ease-in-out infinite alternate` }}/>)}</div></div>, matrix:<div style={{ fontFamily:_FM, fontSize:9, color:g, textAlign:'center', lineHeight:1.5 }}>{['ＡＢＣＤ','ＨＩＪＫ','ＱＲＳＴ'].map((r,i)=><div key={i} style={{ opacity:1-i*0.25 }}>{r}</div>)}</div>, pulse:<div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:7 }}><div style={{ position:'relative', width:30, height:30, display:'flex', alignItems:'center', justifyContent:'center' }}>{[0,1].map(i=><div key={i} style={{ position:'absolute', inset:i*7, borderRadius:'50%', border:`1px solid ${i===0?g:cy}`, animation:`fwPulse ${1.4+i*0.3}s ${i*0.2}s ease-in-out infinite` }}/>)}<div style={{ width:5, height:5, borderRadius:'50%', background:g }}/></div><div style={{ fontFamily:_FM, fontSize:8, color:_MT, letterSpacing:2 }}>CONNECTING</div></div>, cyber:<div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:5 }}><div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:2 }}>{Array.from({length:18},(_,i)=><div key={i} style={{ width:7, height:7, borderRadius:1, background:i<11?cy:'color-mix(in srgb, var(--cyan) 8%, transparent)', border:`1px solid ${i<11?'color-mix(in srgb, var(--cyan) 70%, transparent)':'color-mix(in srgb, var(--cyan) 12%, transparent)'}` }}/>)}</div><div style={{ fontFamily:_FM, fontSize:7, color:_MT, letterSpacing:2 }}>BOOT SEQUENCE</div></div>, bars:<div style={{ width:'100%', display:'flex', flexDirection:'column', gap:4 }}>{[['KERNEL',100,g],['NETWORK',72,cy],['ASSETS',45,g]].map(([l,p,c])=><div key={l}><div style={{ display:'flex', justifyContent:'space-between', fontFamily:_FM, fontSize:7, color:_MT, marginBottom:2 }}><span>{l}</span><span style={{ color:c }}>{p}%</span></div><div style={{ height:2, background:'rgba(255,255,255,0.06)', borderRadius:1 }}><div style={{ height:'100%', width:`${p}%`, background:`linear-gradient(90deg,${c},color-mix(in srgb, var(--green) 30%, transparent))`, borderRadius:1 }}/></div></div>)}</div>, wave:<div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:5 }}><div style={{ display:'flex', alignItems:'flex-end', gap:2, height:22 }}>{Array.from({length:8},(_,i)=><div key={i} style={{ width:4, borderRadius:2, background:i%2===0?g:cy, animation:`fwWave ${0.8+i*0.06}s ${i*0.06}s ease-in-out infinite` }}/>)}</div><div style={{ fontFamily:_FM, fontSize:8, color:_MT, letterSpacing:2 }}>LOADING</div></div>, neon:<div style={{ textAlign:'center', fontFamily:_FD, fontSize:18, fontWeight:900, letterSpacing:3, color:'#fff', animation:'fwNeon 3s infinite', textShadow:`0 0 8px ${g},0 0 20px ${g}` }}>TANVIR</div> }
  p.holo = <div style={{ position:'relative', width:44, height:44, display:'flex', alignItems:'center', justifyContent:'center' }}><div style={{ position:'absolute', inset:0, borderRadius:'50%', border:'1px solid rgba(0,229,255,0.4)', borderTop:'1px solid var(--cyan)', animation:'fwSpin 0.9s linear infinite' }}/><div style={{ position:'absolute', inset:6, borderRadius:'50%', border:'1px dashed rgba(0,229,255,0.35)' }}/><div style={{ width:7, height:7, borderRadius:'50%', background:'var(--cyan)', boxShadow:'0 0 10px var(--cyan)' }}/></div>
  p.crt = <div style={{ fontFamily:_FM, fontSize:8, color:g, textAlign:'left', padding:'5px 7px', background:'#020604', border:'1px solid rgba(0,255,0,0.25)', borderRadius:3, width:'100%', position:'relative' }}>{['> BIOS ok','> GRID ready','> NET eth0 UP'].map((l,i)=><div key={i} style={{ opacity:1-i*0.25, lineHeight:1.7, textShadow:'0 0 4px rgba(0,255,0,0.5)' }}>{l}</div>)}<div style={{ position:'absolute', inset:0, pointerEvents:'none', background:'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.25) 2px,rgba(0,0,0,0.25) 4px)' }}/><span style={{ position:'absolute', bottom:2, left:7, width:5, height:9, background:g, animation:'fwBlink 0.8s steps(2) infinite' }}/></div>
  return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', width:'100%', height:'100%' }}>{p[id]||p.terminal}</div>
}
function FwAnimPreview({ id }) {
  const [ping,setPing]=useState(false)
  const map={ smooth:{d:'0.35s',e:'cubic-bezier(0.16,1,0.3,1)',info:'0.35s · elastic'}, snappy:{d:'0.12s',e:'cubic-bezier(0.4,0,0.2,1)',info:'0.12s · crisp'}, bouncy:{d:'0.45s',e:'cubic-bezier(0.34,1.56,0.64,1)',info:'0.45s · spring'}, expressive:{d:'0.5s',e:'cubic-bezier(0.22,1.5,0.36,1)',info:'0.5s · dramatic'}, reduced:{d:'0.2s',e:'cubic-bezier(0.4,0,0.2,1)',info:'0.2s · subtle'}, elastic:{d:'0.5s',e:'cubic-bezier(0.68,-0.55,0.27,1.55)',info:'0.5s · overshoot'}, cinematic:{d:'1.2s',e:'cubic-bezier(0.25,0.1,0.25,1)',info:'1.2s · dramatic'}, none:{d:'0s',e:'linear',info:'instant'} }
  const p=map[id]||map.smooth
  return <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:7, width:'100%', cursor:'pointer' }} title="Click to preview" onClick={()=>{setPing(false);requestAnimationFrame(()=>requestAnimationFrame(()=>setPing(true)))}}><div style={{ width:26, height:26, borderRadius:'50%', background:'color-mix(in srgb, var(--cyan) 18%, transparent)', border:'2px solid var(--cyan)', transform:ping?'scale(1.5) translateY(-10px)':'scale(1) translateY(0)', opacity:id==='none'?(ping?0:1):1, transition:`transform ${p.d} ${p.e}, opacity ${p.d} ${p.e}`, boxShadow:'0 0 8px color-mix(in srgb, var(--cyan) 30%, transparent)' }} onTransitionEnd={()=>setPing(false)}/><div style={{ fontFamily:_FM, fontSize:8, color:_MT, letterSpacing:1, textAlign:'center' }}>{p.info}</div></div>
}
function ThemePackageCard({ pkg, isActive, isCustomized, isSaving, onApply }) {
  const s = pkg.settings
  const isLight = ['paper', 'macos', 'brutalist'].includes(s.globalTheme)
  const text = isLight ? '#111827' : '#dbeafe'
  const muted = isLight ? '#6b7280' : '#7f95aa'
  const panel = isLight ? 'rgba(255,255,255,0.86)' : 'rgba(8,14,24,0.88)'
  const border = isLight ? 'rgba(17,24,39,0.18)' : 'rgba(255,255,255,0.12)'
  const badgeBg = isLight ? '#ffffff' : 'rgba(255,255,255,0.06)'
  return (
    <button
      onClick={() => onApply(pkg)}
      disabled={isSaving}
      style={{
        display: 'flex',
        flexDirection: 'column',
        padding: 0,
        textAlign: 'left',
        cursor: isSaving ? 'wait' : 'pointer',
        background: panel,
        border: `2px solid ${isActive ? pkg.accent : border}`,
        borderRadius: 12,
        overflow: 'hidden',
        boxShadow: isActive ? `0 0 28px ${pkg.accent}35, 0 18px 42px rgba(0,0,0,.32)` : '0 10px 28px rgba(0,0,0,.24)',
        transition: 'transform .18s var(--ease, ease), border-color .18s var(--ease, ease), box-shadow .18s var(--ease, ease)',
      }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)' }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)' }}
    >
      <div style={{ height: 210, width: '100%', background: pkg.previewBg, position: 'relative', overflow: 'hidden', borderBottom: `1px solid ${border}` }}>
        <div style={{ position: 'absolute', inset: 0, opacity: .5, backgroundImage: s.backgroundPattern === 'clean' ? 'none' : `linear-gradient(${pkg.accent}22 1px, transparent 1px), linear-gradient(90deg, ${pkg.accent}18 1px, transparent 1px)`, backgroundSize: s.backgroundPattern === 'circuit' ? '28px 28px' : '18px 18px' }} />
        <div style={{ position: 'absolute', inset: 12, display: 'grid', gridTemplateRows: '38px 1fr 30px', gap: 8 }}>
          <div style={{ background: badgeBg, border: `1px solid ${pkg.accent}55`, borderRadius: s.headerStyle === 'brutal' ? 0 : s.headerStyle === 'glass' ? 14 : 6, overflow: 'hidden' }}>
            <HeaderPreviewSVG id={s.headerStyle} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '92px 1fr', gap: 8, minHeight: 0 }}>
            <div style={{ display: 'grid', gridTemplateRows: '1fr 56px', gap: 8, minWidth: 0 }}>
              <div style={{ minHeight: 0, background: badgeBg, border: `1px solid ${border}`, borderRadius: s.menuStyle === 'arcade' || s.menuStyle === 'terminal' ? 0 : 8, padding: 8, overflow: 'hidden' }}>
                <FwMenuPreview id={s.menuStyle} />
              </div>
              <div style={{ minHeight: 0, background: badgeBg, border: `1px solid ${border}`, borderRadius: 8, padding: 7, overflow: 'hidden' }}>
                <FwLoadingPreview id={s.loadingScreenStyle} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateRows: '1fr 54px', gap: 8, minWidth: 0, minHeight: 0 }}>
              <div style={{ minHeight: 0, background: badgeBg, border: `1px solid ${border}`, borderRadius: s.surfaceStyle === 'brutalist' ? 0 : 8, overflow: 'hidden' }}>
                <FwSurfacePreview id={s.surfaceStyle} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, minHeight: 0 }}>
                <div style={{ minWidth: 0, background: badgeBg, border: `1px solid ${border}`, borderRadius: 8, padding: 7, overflow: 'hidden' }}>
                  <FwInputPreview id={s.inputStyle} />
                </div>
                <div style={{ minWidth: 0, background: badgeBg, border: `1px solid ${border}`, borderRadius: 8, padding: 7, overflow: 'hidden' }}>
                  <FwNotifyPreview id={s.notifyStyle} />
                </div>
              </div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px', gap: 8 }}>
            <div style={{ background: badgeBg, border: `1px solid ${border}`, borderRadius: 6, overflow: 'hidden' }}>
              <FooterPreviewSVG id={s.footerStyle} />
            </div>
            <div style={{ background: badgeBg, border: `1px solid ${border}`, borderRadius: 6, padding: 6, overflow: 'hidden' }}>
              <FwDialogPreview id={s.dialogStyle} />
            </div>
          </div>
        </div>
      </div>
      <div style={{ width: '100%', padding: 16, boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 7 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: _FD, fontSize: 17, fontWeight: 800, color: isActive ? pkg.accent : text }}>{pkg.name}</div>
            <div style={{ fontFamily: _FM, fontSize: 8, letterSpacing: 2, color: pkg.accent, marginTop: 2, textTransform: 'uppercase' }}>{pkg.mood}</div>
          </div>
          {isActive && <span style={{ ..._tag(pkg.accent), whiteSpace: 'nowrap' }}>{isCustomized ? 'CUSTOMIZED' : 'ACTIVE'}</span>}
        </div>
        <div style={{ fontFamily: _FM, fontSize: 10, color: muted, lineHeight: 1.6, minHeight: 34 }}>{pkg.desc}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 12 }}>
          {[s.globalTheme, s.headerStyle, s.menuStyle, s.dialogStyle, s.inputStyle, s.loadingScreenStyle].map((x, i) => (
            <span key={`${x}-${i}`} style={{ fontFamily: _FM, fontSize: 8, color: text, background: isLight ? '#f3f4f6' : 'rgba(255,255,255,.06)', border: `1px solid ${border}`, borderRadius: 999, padding: '3px 7px' }}>{x}</span>
          ))}
        </div>
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <span style={{ fontFamily: _FM, fontSize: 9, color: muted }}>{isSaving ? 'Applying package...' : 'Apply as starting point'}</span>
          <span style={{ fontFamily: _FM, fontSize: 10, color: isActive ? pkg.accent : '#000', background: isActive ? `${pkg.accent}18` : pkg.accent, border: `1px solid ${pkg.accent}`, borderRadius: 5, padding: '7px 11px', fontWeight: 800 }}>{isActive ? 'SELECTED' : 'APPLY'}</span>
        </div>
      </div>
    </button>
  )
}

function FwStyleCard({ item, isActive, onSelect, accentColor, category }) {
  return <div onClick={()=>onSelect(item.id)} style={{ background:isActive?`${accentColor}09`:_BG2, border:`2px solid ${isActive?accentColor:_BD}`, borderRadius:10, cursor:'pointer', overflow:'hidden', transition:'all 0.18s cubic-bezier(0.16,1,0.3,1)', boxShadow:isActive?`0 0 18px ${accentColor}28, 0 4px 16px rgba(0,0,0,0.3)`:'0 2px 8px rgba(0,0,0,0.2)', position:'relative', transform:isActive?'translateY(-2px)':'translateY(0)' }} onMouseEnter={e=>{if(!isActive){e.currentTarget.style.borderColor=`${accentColor}55`;e.currentTarget.style.transform='translateY(-2px)'}}} onMouseLeave={e=>{if(!isActive){e.currentTarget.style.borderColor=_BD;e.currentTarget.style.transform='translateY(0)'}}}>
    {isActive&&<div style={{ position:'absolute', top:7, right:7, zIndex:2, width:18, height:18, borderRadius:'50%', background:accentColor, display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, color:'#000', fontWeight:900 }}>✓</div>}
    <div style={{ height:82, background:_BG, borderBottom:`1px solid ${_BD}`, display:'flex', alignItems:'center', justifyContent:'center', padding:'10px 14px', overflow:'hidden' }}>
      {category==='menu'&&<FwMenuPreview id={item.id}/>}{category==='notify'&&<FwNotifyPreview id={item.id}/>}{category==='dialog'&&<FwDialogPreview id={item.id}/>}{category==='input'&&<FwInputPreview id={item.id}/>}{category==='surface'&&<FwSurfacePreview id={item.id}/>}{category==='loading'&&<FwLoadingPreview id={item.id}/>}{category==='animation'&&<FwAnimPreview id={item.id}/>}
    </div>
    <div style={{ padding:'10px 12px 12px' }}><div style={{ display:'flex', alignItems:'center', gap:5, marginBottom:3 }}>{item.icon&&<span style={{ fontSize:13, opacity:0.8 }}>{item.icon}</span>}<span style={{ fontFamily:_FM, fontSize:11, fontWeight:600, color:isActive?accentColor:_TX, letterSpacing:0.3 }}>{item.label}</span></div><div style={{ fontFamily:_FM, fontSize:9, color:_MT, lineHeight:1.5 }}>{item.desc}</div></div>
  </div>
}
function FwCategorySection({ cat, draft, onSelect, isUnsaved }) {
  const activeId=draft[cat.configKey], cols=cat.id==='animation'?150:175
  return <section style={{ marginBottom:48 }}>
    <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
      <div style={{ width:38, height:38, borderRadius:8, background:`${cat.color}18`, border:`1px solid ${cat.color}44`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>{cat.icon}</div>
      <div style={{ flex:1, minWidth:0 }}><div style={{ fontFamily:_FD, fontSize:17, fontWeight:700, color:_TX, display:'flex', alignItems:'center', gap:8 }}>{cat.label}{isUnsaved&&<span style={_tag(cat.color)}>UNSAVED</span>}</div><div style={{ fontFamily:_FM, fontSize:9, color:_MT, marginTop:1 }}>{cat.styles.length} variants — active: <span style={{ color:cat.color }}>{activeId}</span></div></div>
    </div>
    <div style={{ display:'grid', gridTemplateColumns:`repeat(auto-fill,minmax(${cols}px,1fr))`, gap:10 }}>
      {cat.styles.map(item=><FwStyleCard key={item.id} item={item} isActive={activeId===item.id} onSelect={id=>onSelect(cat.configKey,id)} accentColor={cat.color} category={cat.id}/>)}
    </div>
  </section>
}
function FwNavRail({ active, onNav, draft, siteConfig }) {
  return <div style={{ width:190, flexShrink:0 }}>
    <div style={{ fontFamily:_FM, fontSize:8, letterSpacing:3, color:_MT, paddingBottom:8, marginBottom:4, borderBottom:`1px solid ${_BD}` }}>CATEGORIES</div>
    {FRAMEWORK_CATEGORIES.map(cat=>{
      const isActive=active===cat.id, changed=draft[cat.configKey]!==(siteConfig?.[cat.configKey]||DEFAULT_FRAMEWORK[cat.configKey])
      return <button key={cat.id} onClick={()=>onNav(cat.id)} style={{ display:'flex', alignItems:'center', gap:8, width:'100%', padding:'10px', borderRadius:6, border:'none', background:isActive?`${cat.color}18`:'transparent', color:isActive?cat.color:_MT, cursor:'pointer', fontFamily:_FM, fontSize:10, letterSpacing:0.5, transition:'all 0.12s', position:'relative', marginBottom:2, boxShadow:isActive?`inset 0 0 0 1px ${cat.color}40`:'none' }} onMouseEnter={e=>{if(!isActive){e.currentTarget.style.background='rgba(255,255,255,0.04)';e.currentTarget.style.color=_TX}}} onMouseLeave={e=>{if(!isActive){e.currentTarget.style.background='transparent';e.currentTarget.style.color=_MT}}}>
        {isActive&&<span style={{ position:'absolute', left:0, top:'15%', bottom:'15%', width:2, borderRadius:'0 2px 2px 0', background:cat.color }}/>}
        <span style={{ fontSize:15, width:20, textAlign:'center' }}>{cat.icon}</span>
        <span style={{ flex:1, textAlign:'left' }}>{cat.label}</span>
        {changed&&<span style={{ width:6, height:6, borderRadius:'50%', background:cat.color, boxShadow:`0 0 5px ${cat.color}` }}/>}
      </button>
    })}
    <div style={{ marginTop:20, padding:'14px 12px', background:_BG3, border:`1px solid ${_BD}`, borderRadius:8 }}>
      <div style={{ fontFamily:_FM, fontSize:8, letterSpacing:2, color:_MT, marginBottom:10 }}>CURRENT</div>
      {FRAMEWORK_CATEGORIES.map(cat=><div key={cat.id} style={{ display:'flex', justifyContent:'space-between', fontFamily:_FM, fontSize:9, marginBottom:6, gap:6 }}><span style={{ color:_MT }}>{cat.label.split(' ')[0]}</span><span style={{ color:cat.color, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{draft[cat.configKey]}</span></div>)}
    </div>
  </div>
}

const ANIMATIONS = [
  // -- Entrance --------------------------------------------------------------
  { id: 'fadeUp',      name: 'Fade Up',        cat: 'entrance',    desc: 'Slide up from below',              use: 'Cards, sections, blog posts' },
  { id: 'fadeDown',    name: 'Fade Down',       cat: 'entrance',    desc: 'Fall in from above',               use: 'Dropdowns, notifications' },
  { id: 'fadeLeft',    name: 'Fade Left',       cat: 'entrance',    desc: 'Slide in from the left',           use: 'Sidebar panels, left blocks' },
  { id: 'fadeRight',   name: 'Fade Right',      cat: 'entrance',    desc: 'Slide in from the right',          use: 'Stats, skill bars, timeline' },
  { id: 'zoomIn',      name: 'Zoom In',         cat: 'entrance',    desc: 'Scale up from center',             use: 'Modals, popups, profile cards' },
  { id: 'flipIn',      name: 'Flip In',         cat: 'entrance',    desc: '3D Y-axis flip reveal',            use: 'Project cards, certifications' },
  { id: 'bounceIn',    name: 'Bounce In',       cat: 'entrance',    desc: 'Spring overshoot on entry',        use: 'Badges, toast messages' },
  // -- Attention -------------------------------------------------------------
  { id: 'pulse',       name: 'Pulse',           cat: 'attention',   desc: 'Breathing opacity effect',         use: 'Status dots, live indicators' },
  { id: 'glow-pulse',  name: 'Glow Pulse',      cat: 'attention',   desc: 'Neon glow breathing',              use: 'CTA buttons, active elements' },
  { id: 'float',       name: 'Float',           cat: 'attention',   desc: 'Gentle hover levitation',          use: 'Hero image, floating badges' },
  { id: 'shake',       name: 'Shake',           cat: 'attention',   desc: 'Error vibration',                  use: 'Form errors, failed actions' },
  { id: 'wiggle',      name: 'Wiggle',          cat: 'attention',   desc: 'Playful rotation sway',            use: 'Notification bell, icons' },
  { id: 'heartbeat',   name: 'Heartbeat',       cat: 'attention',   desc: 'Double-pulse scale',               use: 'Like buttons, health status' },
  // -- Loading ---------------------------------------------------------------
  { id: 'spin',        name: 'Spin',            cat: 'loading',     desc: 'Continuous rotation',              use: 'Spinners, loading icons' },
  { id: 'dots',        name: 'Bouncing Dots',   cat: 'loading',     desc: 'Three dots bounce in sequence',    use: 'Typing indicator, AI thinking' },
  { id: 'shimmer',     name: 'Shimmer',         cat: 'loading',     desc: 'Skeleton loading shimmer sweep',   use: 'Placeholder cards, content load' },
  { id: 'progressPulse', name: 'Progress Pulse', cat: 'loading',   desc: 'Indeterminate bar sweep',           use: 'Upload bars, page progress' },
  { id: 'ripple',      name: 'Ripple',          cat: 'loading',     desc: 'Expanding ring pulse',             use: 'Live status dot, online badge' },
  // -- Text / Hero -----------------------------------------------------------
  { id: 'glitch',      name: 'Glitch',          cat: 'text',        desc: 'RGB channel-offset glitch',        use: 'TANVIR hero name, logo glitch' },
  { id: 'neonFlicker', name: 'Neon Flicker',    cat: 'text',        desc: 'Random neon sign flicker',         use: 'AIFAZI green text, neon headings' },
  { id: 'typewriter',  name: 'Typewriter',      cat: 'text',        desc: 'Text types in char-by-char',       use: 'Hero taglines, terminal output' },
  { id: 'gradientFlow', name: 'Gradient Flow',  cat: 'text',        desc: 'Flowing color shift through text', use: 'Gradient name text, hero subtitle' },
  { id: 'letterPop',   name: 'Letter Pop',      cat: 'text',        desc: 'Letters stagger-pop in with delay', use: 'TANVIR / AIFAZI big text reveal' },
  // -- Background ------------------------------------------------------------
  { id: 'scanline',    name: 'Scan Line',       cat: 'background',  desc: 'Sci-fi CRT scanline sweep',        use: 'Terminal theme overlay' },
  { id: 'border',      name: 'Border Chase',    cat: 'background',  desc: 'Animated gradient border',         use: 'Cards, active inputs, CTAs' },
  { id: 'blink',       name: 'Cursor Blink',    cat: 'background',  desc: 'Terminal cursor blink',            use: 'Code blocks, terminal elements' },
  { id: 'ambientGlow', name: 'Ambient Glow',    cat: 'background',  desc: 'Soft radial glow pulse',           use: 'Hero bg, section highlights' },
  { id: 'gridPulse',   name: 'Grid Pulse',      cat: 'background',  desc: 'Dot grid breathes in and out',     use: 'Page backgrounds, sections' },
]

// -- Light theme IDs (used by smart toggle) ------------------------------------
const LIGHT_THEME_IDS = ['light', 'cyber-light', 'paper', 'neumorph', 'macos', 'pastel', 'win95', 'brutalist',
  'midnight-light','crimson-light','ocean-light','amber-light','rose-light','forest-light',
  'glass-light','synthwave-light','terminal-light','neon-noir-light','aurora-light',
  'mario-light','minecraft-light','sonic-light','pacman-light']

const THEME_DEFS = [
  // -- Color variants ----------------------------------------------------------
  { id: 'cyber-dark',  name: 'Cyber Dark',  tag: 'DARK',  type: 'color', desc: 'Default hacker aesthetic — deep black with neon green & cyan accents.',
    bg: '#060a0f', bg2: '#0b1118', bg3: '#111a24', primary: '#00ff88', secondary: '#00d4ff', orange: '#ff6b35', text: '#c8d8e8', muted: '#6b8296', border: 'color-mix(in srgb, var(--cyan) 15%, transparent)' },
  { id: 'cyber-light', name: 'Cyber Light', tag: 'LIGHT', type: 'color', desc: 'Clean muted slate — cyber family light mode.',
    bg: '#c8d4e0', bg2: '#bcc9d8', bg3: '#b0bece', primary: '#006e38', secondary: '#005d8f', orange: '#b84416', text: '#0a1520', muted: '#4a6478', border: 'rgba(0,93,143,0.28)' },
  { id: 'midnight',   name: 'Midnight',    tag: 'DARK',  type: 'color', desc: 'Deep violet & hot pink  moody and editorial.',
    bg: '#08051a', bg2: '#0e0a24', bg3: '#16102e', primary: '#a855f7', secondary: '#ec4899', orange: '#f97316', text: '#e2d9f3', muted: '#6b5a8a', border: 'rgba(168,85,247,0.18)' },
  { id: 'crimson',    name: 'Crimson',     tag: 'DARK',  type: 'color', desc: 'Blood red & ember orange  bold and aggressive.',
    bg: '#0f0608', bg2: '#1a0b0e', bg3: '#241014', primary: '#ef4444', secondary: '#f97316', orange: '#fb923c', text: '#f0d0d4', muted: '#8a6068', border: 'rgba(239,68,68,0.18)' },
  { id: 'ocean',      name: 'Ocean',       tag: 'DARK',  type: 'color', desc: 'Electric blue & teal  cool, deep, and immersive.',
    bg: '#020d1a', bg2: '#061525', bg3: '#0b1f33', primary: '#3b82f6', secondary: '#06b6d4', orange: '#f59e0b', text: '#c0d8f0', muted: '#4a6880', border: 'rgba(59,130,246,0.18)' },
  { id: 'amber',      name: 'Amber',       tag: 'DARK',  type: 'color', desc: 'Warm gold & orange  rich and glowing.',
    bg: '#0f0a02', bg2: '#1a1405', bg3: '#241c08', primary: '#f59e0b', secondary: '#f97316', orange: '#fb923c', text: '#fef3c7', muted: '#927040', border: 'rgba(245,158,11,0.18)' },
  { id: 'rose',       name: 'Rose',        tag: 'DARK',  type: 'color', desc: 'Soft pink & coral  elegant and expressive.',
    bg: '#0f0609', bg2: '#1a0c12', bg3: '#24121a', primary: '#f472b6', secondary: '#fb7185', orange: '#f97316', text: '#fde8f0', muted: '#8a6070', border: 'rgba(244,114,182,0.18)' },
  { id: 'forest',     name: 'Forest',      tag: 'DARK',  type: 'color', desc: 'Jungle green & lime  lush and organic.',
    bg: '#020b04', bg2: '#051508', bg3: '#091f0d', primary: '#4ade80', secondary: '#a3e635', orange: '#fb923c', text: '#d1fae5', muted: '#4a7858', border: 'rgba(74,222,128,0.15)' },
  { id: 'lava',       name: 'Lava',        tag: 'DARK',  type: 'color', desc: 'Molten magma  black with red-orange heat.',
    bg: '#0a0502', bg2: '#140a04', bg3: '#1e0f06', primary: '#ff3d00', secondary: '#ff9100', orange: '#ff6d00', text: '#ffe8d6', muted: '#8a5a40', border: 'rgba(255,61,0,0.2)' },
  { id: 'toxic',      name: 'Toxic',       tag: 'DARK',  type: 'color', desc: 'Hazard acid  near-black with venomous yellow-green.',
    bg: '#060803', bg2: '#0b1005', bg3: '#121a08', primary: '#a3e635', secondary: '#ccff00', orange: '#eab308', text: '#ecffc8', muted: '#6a7a3a', border: 'rgba(163,230,53,0.2)' },
  { id: 'ice',        name: 'Ice',         tag: 'LIGHT', type: 'color', desc: 'Arctic frost  pale blue with cool cyan accents.',
    bg: '#eef4fa', bg2: '#e3edf7', bg3: '#d8e6f2', primary: '#0284c7', secondary: '#0891b2', orange: '#ea580c', text: '#0b1a2a', muted: '#4a6a86', border: 'rgba(2,132,199,0.22)' },
  // -- Design styles -----------------------------------------------------------
  { id: 'glass-dark', name: 'Glass',       tag: 'STYLE', type: 'design', desc: 'Frosted glassmorphism  translucent depth layers.',
    bg: '#04080f', bg2: 'rgba(10,18,32,0.45)', bg3: 'rgba(16,26,46,0.55)', primary: '#00e5ff', secondary: '#7b61ff', orange: '#ff6b35', text: '#d0e8ff', muted: '#5a7898', border: 'rgba(0,229,255,0.22)' },
  { id: 'brutalist',  name: 'Brutal',      tag: 'STYLE', type: 'design', desc: 'Raw bold brutalism  thick borders, no shadows.',
    bg: '#f2f0ec', bg2: '#e8e5df', bg3: '#dedad2', primary: '#e8000d', secondary: '#000000', orange: '#ff6b00', text: '#000000', muted: '#555555', border: '#000000' },
  { id: 'synthwave',  name: 'Synth',       tag: 'STYLE', type: 'design', desc: 'Retro 80s arcade  neon pink & cyan on deep purple.',
    bg: '#0d0618', bg2: '#130828', bg3: '#180a30', primary: '#ff2d8b', secondary: '#00f0ff', orange: '#ff6b35', text: '#f0d8ff', muted: '#7858a0', border: 'rgba(255,45,139,0.28)' },
  { id: 'paper',      name: 'Paper',       tag: 'LIGHT', type: 'design', desc: 'Minimal editorial  ink on warm parchment.',
    bg: '#f5f0e8', bg2: '#ede8df', bg3: '#e4ddd3', primary: '#c41a1a', secondary: '#1a3a6c', orange: '#c87400', text: '#1a1a1a', muted: '#6b6060', border: 'rgba(0,0,0,0.18)' },
  { id: 'neumorph',   name: 'Neumorph',    tag: 'LIGHT', type: 'design', desc: 'Soft 3D neumorphism  clay-like raised surfaces.',
    bg: '#e0e5ec', bg2: '#e8edf4', bg3: '#d6dbe4', primary: '#6c63ff', secondary: '#4ecdc4', orange: '#f7b731', text: '#2d3748', muted: '#718096', border: 'rgba(108,99,255,0.15)' },
  { id: 'terminal',   name: 'Terminal',    tag: 'STYLE', type: 'design', desc: 'Old-school DOS/CRT  phosphor green on black.',
    bg: '#0a0a0a', bg2: '#0f0f0f', bg3: '#141414', primary: '#33ff33', secondary: '#ffcc00', orange: '#ff6600', text: '#33ff33', muted: '#228822', border: 'rgba(51,255,51,0.25)' },
  { id: 'macos',      name: 'macOS',       tag: 'LIGHT', type: 'design', desc: 'Apple-inspired  clean SF typography, subtle shadows.',
    bg: '#f5f5f7', bg2: '#ffffff', bg3: '#ebebed', primary: '#0071e3', secondary: '#34aadc', orange: '#ff9500', text: '#1d1d1f', muted: '#86868b', border: 'rgba(0,0,0,0.12)' },
  { id: 'neon-noir',  name: 'Neon Noir',   tag: 'DARK',  type: 'design', desc: 'Cinematic dark  orange & purple neon on near-black.',
    bg: '#0a0a0e', bg2: '#10101a', bg3: '#16161f', primary: '#ff6b35', secondary: '#cc44ff', orange: '#ff6b35', text: '#d8d0e0', muted: '#6a5a7a', border: 'rgba(204,68,255,0.2)' },
  { id: 'pastel',     name: 'Pastel',      tag: 'LIGHT', type: 'design', desc: 'Soft dreamy pastels  lilac, pink, and lavender.',
    bg: '#fdf4ff', bg2: '#fff0fb', bg3: '#f5e8ff', primary: '#c084fc', secondary: '#f9a8d4', orange: '#fbbf24', text: '#3d1f5c', muted: '#9d6db8', border: 'rgba(192,132,252,0.3)' },
  { id: 'win95',      name: 'Win95',       tag: 'STYLE', type: 'design', desc: 'Classic Windows 95  inset bevels and teal desktop.',
    bg: '#008080', bg2: '#c0c0c0', bg3: '#d4d0c8', primary: '#000080', secondary: '#ffffff', orange: '#804000', text: '#000000', muted: '#444444', border: '#808080' },
  { id: 'aurora',     name: 'Aurora',      tag: 'DARK',  type: 'design', desc: 'Northern lights  teal & pink gradient on deep navy.',
    bg: '#050d1a', bg2: '#08142a', bg3: '#0c1c38', primary: '#64ffda', secondary: '#ff6fd8', orange: '#f59e0b', text: '#cce8ff', muted: '#5a8099', border: 'rgba(100,255,218,0.2)' },
  { id: 'mario',      name: 'Mario',       tag: 'GAME',  type: 'design', desc: 'Warp-pipe red & coin gold on starry navy.',
    bg: '#0a0d1c', bg2: '#10142a', bg3: '#161a36', primary: '#e52521', secondary: '#ffd700', orange: '#f59e0b', text: '#fdf6e3', muted: '#8a7f66', border: 'rgba(229,37,33,0.3)' },
  { id: 'minecraft',  name: 'Minecraft',   tag: 'GAME',  type: 'design', desc: 'Creeper green & water blue with blocky depth.',
    bg: '#141210', bg2: '#1d1a17', bg3: '#262219', primary: '#5ad427', secondary: '#2a9dd6', orange: '#d97706', text: '#d8d5c8', muted: '#6f6a5a', border: 'rgba(90,212,39,0.28)' },
  { id: 'sonic',      name: 'Sonic',       tag: 'GAME',  type: 'design', desc: 'Speed blue & ring gold on deep navy.',
    bg: '#070d2b', bg2: '#0c1440', bg3: '#111a54', primary: '#1e6fd9', secondary: '#f5d200', orange: '#ff6b35', text: '#e8f0ff', muted: '#5a6a9a', border: 'rgba(30,111,217,0.3)' },
  { id: 'pacman',     name: 'Pac-Man',     tag: 'GAME',  type: 'design', desc: 'Arcade maze yellow & cyan on void black.',
    bg: '#05030f', bg2: '#0a0718', bg3: '#100b24', primary: '#ffe000', secondary: '#00cfff', orange: '#ff5c00', text: '#f4f0ff', muted: '#5a5078', border: 'rgba(255,224,0,0.3)' },
]

const ANIM_CATEGORIES = [
  { id: 'ALL',        label: 'All',           color: 'var(--green)' },
  { id: 'entrance',   label: '🎬 Entrance',    color: '#64b5f6' },
  { id: 'attention',  label: '⚡ Attention',   color: '#ffb74d' },
  { id: 'loading',    label: '⏳ Loading',     color: '#ce93d8' },
  { id: 'text',       label: '📝 Text / Hero', color: '#80cbc4' },
  { id: 'background', label: '🎨 Background',  color: '#ef9a9a' },
]

// -- Background Animation -------------------------------------------------------
const ANIMATION_PATTERNS = [
  { id: 'none',          name: 'None',        icon: '∅', desc: 'No animated background',                preview: 'none' },
  { id: 'aurora-ribbons',name: 'Ribbons',     icon: '⌁', desc: 'Slow drifting aurora ribbons',          preview: 'gradient' },
  { id: 'contours',      name: 'Contours',    icon: '≋', desc: 'Animated hand-drawn flow lines',        preview: 'svg' },
  { id: 'flow-grid',     name: 'Flow Grid',   icon: '⌗', desc: 'Moving technical grid and light sweep', preview: 'linear-gradient' },
  { id: 'particle-field',name: 'Particles',   icon: '✦', desc: 'Floating star-like micro particles',    preview: 'radial' },
  { id: 'nebula',        name: 'Nebula',      icon: '🌌', desc: 'Slow-morphing cosmic gas clouds',      preview: 'radial-gradient' },
  { id: 'kaleidoscope',  name: 'Kaleidoscope',icon: '🕐', desc: 'Rotating geometric mandala',           preview: 'conic-gradient' },
  { id: 'glow-orbs',     name: 'Glow Orbs',   icon: '💫', desc: 'Floating soft light spheres',          preview: 'radial-gradient' },
  { id: 'gradient-mesh', name: 'Gradient Mesh',icon: '🎨', desc: 'Slow-morphing colored mesh gradient', preview: 'radial-gradient' },
  { id: 'bokeh',         name: 'Bokeh',       icon: '🌫️', desc: 'Soft blurred light circles',           preview: 'radial-gradient' },
  { id: 'shooting-stars',name: 'Shooting Stars', icon: '☄️', desc: 'Streaking light trails',             preview: 'linear-gradient' },
  { id: 'circuit-glow',  name: 'Circuit Glow',icon: '🟢', desc: 'Animated circuit board traces',        preview: 'svg' },
  { id: 'wave-lines',    name: 'Wave Lines',  icon: '〰️', desc: 'Layered flowing sine waves',           preview: 'svg' },
  { id: 'cyber-grid',    name: 'Cyber Grid',  icon: '🔳', desc: 'Perspective grid moving toward viewer',preview: 'linear-gradient' },
  { id: 'stardust',      name: 'Stardust',    icon: '🌟', desc: 'Slow-drifting twinkling starfield',    preview: 'radial' },
  { id: 'light-beams',   name: 'Light Beams', icon: '🔦', desc: 'Rotating conic light beams',           preview: 'conic-gradient' },
  { id: 'scan-sweep',    name: 'Scan Sweep',  icon: '📡', desc: 'Vertical light sweep over grid',       preview: 'linear-gradient' },
  { id: 'hex-flow',      name: 'Hex Flow',    icon: '⬡', desc: 'Flowing hexagon field',                preview: 'linear-gradient' },
  { id: 'matrix-rain',   name: 'Matrix Rain', icon: '🌧️', desc: 'Falling green code columns',           preview: 'grid' },
]

// -- Grid Overlay ---------------------------------------------------------------
const GRID_PATTERNS = [
  { id: 'clean',         name: 'None',       icon: '∅', desc: 'No grid overlay',                      preview: 'none' },
  { id: 'grid',          name: 'Grid',       icon: '▦', desc: 'Standard square grid',                 preview: 'var(--grid-line)' },
  { id: 'dots',          name: 'Dots',       icon: '●', desc: 'Polka dot grid',                       preview: 'radial' },
  { id: 'scanlines',     name: 'Scanlines',  icon: '▤', desc: 'Horizontal CRT scan lines',            preview: 'repeating-linear-gradient' },
  { id: 'circuit',       name: 'Circuit',    icon: '⚡', desc: 'Intersecting diagonal traces',          preview: 'repeating-linear-gradient' },
  { id: 'hexagons',      name: 'Hexagons',   icon: '⬡', desc: 'Honeycomb approximate grid',           preview: 'linear-gradient' },
  { id: 'matrix',        name: 'Matrix',     icon: '🌧️', desc: 'Vertical rain columns',                preview: 'grid' },
  { id: 'noise',         name: 'Noise',      icon: '▣', desc: 'Subtle film grain texture',            preview: 'url' },
  { id: 'radial',        name: 'Radial',     icon: '◎', desc: 'Fine dot scattering',                  preview: 'radial' },
  { id: 'waves',         name: 'Waves',      icon: '〰️', desc: 'Concentric ripple rings',              preview: 'radial-gradient' },
  { id: 'paper-doc',     name: 'Paper Doc',  icon: '📄', desc: 'Horizontal ruled line surface',        preview: 'linear-gradient' },
  { id: 'terminal',      name: 'Terminal',   icon: '💻', desc: 'Phosphor scanline surface',            preview: 'repeating-linear-gradient' },
  { id: 'neon-stage',    name: 'Neon Stage', icon: '🎭', desc: 'Dual-axis neon glow grid',             preview: 'linear-gradient' },
  { id: 'dashboard',     name: 'Dashboard',  icon: '📊', desc: 'Dense telemetry grid',                preview: 'linear-gradient' },
  { id: 'blueprint',     name: 'Blueprint',  icon: '📐', desc: 'Engineering blueprint double grid',    preview: 'linear-gradient' },
  { id: 'isometric',     name: 'Isometric',  icon: '📦', desc: 'Angled 3D tile grid',                 preview: 'linear-gradient' },
  { id: 'rhombus',       name: 'Rhombus',    icon: '◆', desc: 'Diamond weave grid',                   preview: 'linear-gradient' },
  { id: 'crosshatch',    name: 'Crosshatch', icon: '𝄳', desc: 'Tight diagonal hatch',                preview: 'repeating-linear-gradient' },
  { id: 'weave',         name: 'Weave',      icon: '🕸️', desc: 'Interlocking woven bands',             preview: 'repeating-linear-gradient' },
  { id: 'plus',          name: 'Plus',       icon: '✚', desc: 'Plus-sign tile pattern',               preview: 'linear-gradient' },
  { id: 'pixel',         name: 'Pixel',      icon: '👾', desc: 'Blocky pixelated grid',               preview: 'linear-gradient' },
  { id: 'corner',        name: 'Corner',     icon: '❐', desc: 'Bracket corner marks',                 preview: 'linear-gradient' },
  { id: 'fiber',         name: 'Fiber',      icon: '🔹', desc: 'Fiber-optic dots on traces',          preview: 'linear-gradient' },
  { id: 'polar',         name: 'Polar',      icon: '◎', desc: 'Concentric polar rings with axes',    preview: 'radial-gradient' },
]

// -- Custom theme builder -------------------------------------------------------
const DEFAULT_CUSTOM = {
  id: 'custom', name: 'My Theme', tag: 'DARK', type: 'color',
  bg: '#060a0f', bg2: '#0b1118', bg3: '#111a24',
  primary: '#00ff88', secondary: '#00d4ff', orange: '#ff6b35',
  text: '#c8d8e8', muted: '#6b8296', border: 'color-mix(in srgb, var(--cyan) 15%, transparent)',
  desc: 'My custom theme',
}

function ColorRow({ label, value, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
      <input type="color" value={value.startsWith('rgba') ? '#888888' : value}
        onChange={e => onChange(e.target.value)}
        style={{ width: 28, height: 28, padding: 2, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', borderRadius: 4 }} />
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', flex: '0 0 70px' }}>{label}</span>
      <input value={value} onChange={e => onChange(e.target.value)}
        style={{ flex: 1, background: 'var(--bg3)', border: '1px solid var(--border)', outline: 'none', padding: '4px 8px', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text)', borderRadius: 4 }} />
    </div>
  )
}

function ThemeLibrary() {
  const { theme, setTheme, siteConfig, refreshSiteConfig } = useTheme()
  const [activeTab, setActiveTab] = useState('packages')
  const [previewTheme, setPreviewTheme] = useState(null)
  const [pendingTheme, setPendingTheme] = useState(null)
  const [typeFilter, setTypeFilter] = useState('ALL')
  const [tagFilter, setTagFilter]   = useState('ALL')
  const [selectedAnim, setSelectedAnim] = useState(null)
  const [copiedAnim, setCopiedAnim]     = useState(null)
  const [animCat, setAnimCat]           = useState('ALL')
  const [themeSearch, setThemeSearch] = useState('')
  const [recentThemes, setRecentThemes] = useState(() => {
    try { return JSON.parse(localStorage.getItem('tl_recent') || '[]') } catch { return [] }
  })
  const [compareA, setCompareA] = useState(null)
  const [compareB, setCompareB] = useState(null)
  const [compareMode, setCompareMode] = useState(false)
  const [focusedIdx, setFocusedIdx] = useState(-1)
  const [favorites, setFavorites] = useState(() => {
    try { return JSON.parse(localStorage.getItem('tl_favorites') || '[]') } catch { return [] }
  })
  const notify = useNotify()
  const toast  = notify           // alias — all toast.x() calls route to notify
  const dlg    = useDialog()
  const isMobile = useIsMobile()

  // ── Framework state (menu / notify / dialog only) ────────────────────────
  const [fwDraft, setFwDraft] = useState(() => ({
    menuStyle:      siteConfig?.menuStyle      || DEFAULT_FRAMEWORK.menuStyle,
    notifyStyle:    siteConfig?.notifyStyle    || DEFAULT_FRAMEWORK.notifyStyle,
    notifyPosition: siteConfig?.notifyPosition || DEFAULT_FRAMEWORK.notifyPosition,
    dialogStyle:    siteConfig?.dialogStyle    || DEFAULT_FRAMEWORK.dialogStyle,
    inputStyle:     siteConfig?.inputStyle     || DEFAULT_FRAMEWORK.inputStyle,
    surfaceStyle:   siteConfig?.surfaceStyle   || DEFAULT_FRAMEWORK.surfaceStyle,
  }))
  const [fwSaving, setFwSaving]   = useState(false)
  const [savingPackage, setSavingPackage] = useState(null)
  const [fwActive, setFwActive]   = useState('menu')

  useEffect(() => {
    if (!siteConfig || fwSaving || savingPackage) return
    setFwDraft(prev => ({
      ...prev,
      menuStyle:      siteConfig.menuStyle      || DEFAULT_FRAMEWORK.menuStyle,
      notifyStyle:    siteConfig.notifyStyle    || DEFAULT_FRAMEWORK.notifyStyle,
      notifyPosition: siteConfig.notifyPosition || DEFAULT_FRAMEWORK.notifyPosition,
      dialogStyle:    siteConfig.dialogStyle    || DEFAULT_FRAMEWORK.dialogStyle,
      inputStyle:     siteConfig.inputStyle     || DEFAULT_FRAMEWORK.inputStyle,
      surfaceStyle:   siteConfig.surfaceStyle   || DEFAULT_FRAMEWORK.surfaceStyle,
    }))
  }, [
    siteConfig?.menuStyle,
    siteConfig?.notifyStyle,
    siteConfig?.notifyPosition,
    siteConfig?.dialogStyle,
    siteConfig?.inputStyle,
    siteConfig?.surfaceStyle,
    fwSaving,
    savingPackage,
  ])

  const fwHasChanges = FRAMEWORK_CATEGORIES.some(
    cat => fwDraft[cat.configKey] !== (siteConfig?.[cat.configKey] || DEFAULT_FRAMEWORK[cat.configKey])
  )
  const handleFwSelect = useCallback((key, value) => setFwDraft(prev => ({ ...prev, [key]: value })), [])
  const handleFwNav    = useCallback((id) => setFwActive(id), [])

  // Auto-save: called immediately on card click — no separate APPLY button needed
  const handleFwSelectAndSave = useCallback(async (key, value) => {
    const newDraft = { ...fwDraft, [key]: value }
    setFwDraft(newDraft)
    setFwSaving(true)
    try {
      const stylePayload = FRAMEWORK_CATEGORIES.reduce((acc, cat) => {
        acc[cat.configKey] = newDraft[cat.configKey]
        return acc
      }, {})
      await api.put('/admin/site-settings', {
        ...siteConfig,
        ...stylePayload,
        notifyPosition: newDraft.notifyPosition,
      })
      FRAMEWORK_CATEGORIES.forEach(cat => {
        if (newDraft[cat.configKey]) localStorage.setItem(cat.configKey.replace(/([A-Z])/g, '-$1').toLowerCase(), newDraft[cat.configKey])
      })
      if (newDraft.notifyPosition) localStorage.setItem('notify-position', newDraft.notifyPosition)
      clearSiteSettingsCache()
      window.dispatchEvent(new CustomEvent('site-settings-updated', { detail: {
        ...stylePayload,
        notifyPosition: newDraft.notifyPosition,
      }}))
      await refreshSiteConfig()
      notify.success(`${key.replace('Style','').replace('Position',' position')} → ${value}`, { title: '✅ Auto-saved' })
    } catch (err) {
      notify.error(err?.response?.data?.error || 'Failed to save', { title: 'Error' })
    } finally { setFwSaving(false) }
  }, [fwDraft, siteConfig, refreshSiteConfig, notify])

  const handleFwSave = useCallback(async () => {
    setFwSaving(true)
    try {
      const stylePayload = FRAMEWORK_CATEGORIES.reduce((acc, cat) => {
        acc[cat.configKey] = fwDraft[cat.configKey]
        return acc
      }, {})
      await api.put('/admin/site-settings', { ...siteConfig, ...stylePayload })
      FRAMEWORK_CATEGORIES.forEach(cat => {
        if (fwDraft[cat.configKey]) localStorage.setItem(cat.configKey.replace(/([A-Z])/g, '-$1').toLowerCase(), fwDraft[cat.configKey])
      })
      clearSiteSettingsCache()
      window.dispatchEvent(new CustomEvent('site-settings-updated', { detail: stylePayload }))
      await refreshSiteConfig()
      notify.success('Framework styles applied sitewide!', { title: 'Framework' })
    } catch (err) {
      notify.error(err?.response?.data?.error || 'Failed to save', { title: 'Error' })
    } finally { setFwSaving(false) }
  }, [fwDraft, siteConfig, refreshSiteConfig, notify])

  const handleFwReset = useCallback(async () => {
    const ok = await dlg.confirm({ title: 'Reset Framework', message: 'Set menu, notify, dialog, input and surface styles back to defaults and save immediately.', variant: 'danger', confirmLabel: 'RESET NOW' })
    if (!ok) return
    const d = { ...DEFAULT_FRAMEWORK }
    setFwDraft({ menuStyle: d.menuStyle, notifyStyle: d.notifyStyle, notifyPosition: d.notifyPosition, dialogStyle: d.dialogStyle, inputStyle: d.inputStyle, surfaceStyle: d.surfaceStyle })
    try {
      await api.put('/admin/site-settings', { ...siteConfig, ...d })
      clearSiteSettingsCache()
      window.dispatchEvent(new CustomEvent('site-settings-updated', { detail: d }))
      await refreshSiteConfig()
      notify.success('Framework reset to defaults', { title: 'Reset' })
    } catch { notify.error('Failed to reset', { title: 'Error' }) }
  }, [siteConfig, dlg, notify, refreshSiteConfig])
  const [exported, setExported] = useState(false)
  // -- Global theme tracking --
  const [globalThemeId, setGlobalThemeId] = useState(() => siteConfig?.globalTheme || '')
  const [savingGlobal, setSavingGlobal] = useState(null) // id of theme being saved
  // -- Global mode is always ON — every action applies to all visitors --------
  const globalMode = true
  // -- Global appearance settings (loading screen, animations, layout) ------
  const [gAppearance, setGAppearance] = useState({
    loadingScreenStyle: siteConfig?.loadingScreenStyle || 'terminal',
    animationPreset:    siteConfig?.animationPreset    || 'smooth',
    lockTheme:          siteConfig?.lockTheme          || false,
    headerStyle:        siteConfig?.headerStyle        || 'cyber',
    footerStyle:        siteConfig?.footerStyle        || 'cyber',
    followOsTheme:      siteConfig?.followOsTheme      || false,
    showRoamingRobot:   siteConfig?.showRoamingRobot   !== false, // default ON
  })
  const [savingAppearance, setSavingAppearance] = useState(false)
  const [loadingGlobal, setLoadingGlobal]       = useState(false)

  useEffect(() => {
    if (!siteConfig || savingAppearance || savingPackage) return
    setGAppearance(prev => ({
      ...prev,
      loadingScreenStyle: siteConfig.loadingScreenStyle || 'terminal',
      animationPreset:    siteConfig.animationPreset    || 'smooth',
      lockTheme:          !!siteConfig.lockTheme,
      headerStyle:        siteConfig.headerStyle        || 'cyber',
      footerStyle:        siteConfig.footerStyle        || 'cyber',
      followOsTheme:      !!siteConfig.followOsTheme,
      showRoamingRobot:   siteConfig.showRoamingRobot   !== false,
    }))
  }, [
    siteConfig?.loadingScreenStyle,
    siteConfig?.animationPreset,
    siteConfig?.lockTheme,
    siteConfig?.headerStyle,
    siteConfig?.footerStyle,
    siteConfig?.followOsTheme,
    siteConfig?.showRoamingRobot,
    savingAppearance,
    savingPackage,
  ])

  // ── Background Animation state ──────────────────────────────────────────
  const [bgAnimation, setBgAnimation] = useState(() => {
    try {
      const c = localStorage.getItem('site-config-cache')
      if (c) { const p = JSON.parse(c); if (p?.bgAnimation) return p.bgAnimation }
    } catch {}
    return 'none'
  })
  const [gridPattern, setGridPattern] = useState(() => {
    try {
      const c = localStorage.getItem('site-config-cache')
      if (c) { const p = JSON.parse(c); return p.gridPattern || p.backgroundPattern || 'grid' }
    } catch {}
    return 'grid'
  })
  const [savingBg, setSavingBg] = useState(false)

  useEffect(() => {
    if (savingBg || savingPackage) return
    setBgAnimation(siteConfig?.bgAnimation || 'none')
    setGridPattern(siteConfig?.gridPattern || siteConfig?.backgroundPattern || 'grid')
  }, [siteConfig?.bgAnimation, siteConfig?.gridPattern, siteConfig?.backgroundPattern, savingBg, savingPackage])

  const handleAnimationSelect = async (id) => {
    setBgAnimation(id)
    setSavingBg(true)
    try {
      await api.put('/admin/site-settings', {
        ...siteConfig,
        bgAnimation: id,
      })
      clearSiteSettingsCache()
      window.dispatchEvent(new CustomEvent('site-settings-updated', { detail: { bgAnimation: id } }))
      await refreshSiteConfig()
      notify.success(`Animation: ${ANIMATION_PATTERNS.find(p => p.id === id)?.name}`, { title: '🎨 Background Animation Set' })
    } catch (err) {
      notify.error(err?.response?.data?.error || 'Failed to save background animation', { title: 'Error' })
      setBgAnimation(siteConfig?.bgAnimation || 'none')
    } finally { setSavingBg(false) }
  }

  const handleGridSelect = async (id) => {
    setGridPattern(id)
    setSavingBg(true)
    try {
      await api.put('/admin/site-settings', {
        ...siteConfig,
        gridPattern: id,
      })
      clearSiteSettingsCache()
      window.dispatchEvent(new CustomEvent('site-settings-updated', { detail: { gridPattern: id } }))
      await refreshSiteConfig()
      notify.success(`Grid: ${GRID_PATTERNS.find(p => p.id === id)?.name}`, { title: '▦ Grid Overlay Set' })
    } catch (err) {
      notify.error(err?.response?.data?.error || 'Failed to save grid overlay', { title: 'Error' })
      setGridPattern(siteConfig?.gridPattern || siteConfig?.backgroundPattern || 'grid')
    } finally { setSavingBg(false) }
  }

  // -- Custom theme builder state (was missing — caused Builder tab crash) ---
  const [custom, setCustom] = useState(DEFAULT_CUSTOM)

  const toggleFav = (id) => {
    setFavorites(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
      try { localStorage.setItem('tl_favorites', JSON.stringify(next)) } catch {}
      return next
    })
  }

  const isFav = id => favorites.includes(id)

  const exportCustom = () => {
    const css = Object.entries({
      '--bg': custom.bg, '--bg2': custom.bg2, '--bg3': custom.bg3,
      '--green': custom.primary, '--cyan': custom.secondary,
      '--orange': custom.orange, '--text': custom.text,
      '--muted': custom.muted, '--border': custom.border,
    }).map(([k, v]) => `  ${k}: ${v};`).join('\n')
    const out = `[data-theme="${custom.id}"] {\n${css}\n}`
    navigator.clipboard.writeText(out).catch(() => {})
    setExported(true)
    toast.success('CSS variables copied to clipboard', { title: '✅ Exported' })
    setTimeout(() => setExported(false), 2500)
  }

  const exportCustomJSON = () => {
    const json = JSON.stringify(custom, null, 2)
    navigator.clipboard.writeText(json).catch(() => {})
    toast.success('Theme JSON copied to clipboard', { title: '📋 JSON Exported' })
  }

  // What we actually render in the live-preview area
  const displayId  = previewTheme || pendingTheme || theme
  const displayDef = THEME_DEFS.find(t => t.id === displayId) || THEME_DEFS[0]
  const currentDef = THEME_DEFS.find(t => t.id === theme)     || THEME_DEFS[0]
  const pendingDef = THEME_DEFS.find(t => t.id === pendingTheme)

  const applyTheme = (id) => {
    setTheme(id)
    setPendingTheme(null)
    setPreviewTheme(null)
    // Track recently applied
    setRecentThemes(prev => {
      const next = [id, ...prev.filter(x => x !== id)].slice(0, 5)
      try { localStorage.setItem('tl_recent', JSON.stringify(next)) } catch {}
      return next
    })
    const t = THEME_DEFS.find(x => x.id === id)
    if (!globalMode) {
      toast.success(`${t?.name} theme applied to your account`, { title: '🎨 My Theme' })
    }
  }

  // -- Apply theme AND set global for all visitors ------------------------
  const applyThemeGlobally = async (id) => {
    // Apply locally first (instant UI feedback)
    setTheme(id)
    setPendingTheme(null)
    setPreviewTheme(null)
    setRecentThemes(prev => {
      const next = [id, ...prev.filter(x => x !== id)].slice(0, 5)
      try { localStorage.setItem('tl_recent', JSON.stringify(next)) } catch {}
      return next
    })
    // Then push to backend (toasts handled inside applyGlobalTheme)
    await applyGlobalTheme(id)
  }

  // -- Unified apply: global or local depending on mode ------------------
  const handleApply = (id) => {
    if (globalMode) return applyThemeGlobally(id)
    return applyTheme(id)
  }

  // -- Set theme globally for ALL visitors -----------------------------------
  const applyGlobalTheme = async (id) => {
    setSavingGlobal(id)
    try {
      // '__clear__' sentinel means "remove global theme  let users choose"
      const newVal = id === '__clear__' ? '' : (globalThemeId === id ? '' : id)
      await api.put('/admin/site-settings', { globalTheme: newVal })
      clearSiteSettingsCache()
      window.dispatchEvent(new CustomEvent('site-settings-updated', { detail: { globalTheme: newVal } }))
      if (refreshSiteConfig) await refreshSiteConfig()
      setGlobalThemeId(newVal)
      const name = THEME_DEFS.find(x => x.id === newVal)?.name
      toast.success(newVal ? `${name} set as global theme for all visitors` : 'Global theme cleared  users choose their own', { title: '⭐ Global Theme' })
    } catch {
      toast.error('Failed to update global theme')
    } finally {
      setSavingGlobal(null)
    }
  }

  // -- Save global appearance settings (loading screen, animations etc.) ---
  const saveGlobalAppearance = async () => {
    setSavingAppearance(true)
    try {
      await api.put('/admin/site-settings', gAppearance)
      clearSiteSettingsCache()
      window.dispatchEvent(new CustomEvent('site-settings-updated', { detail: gAppearance }))
      if (refreshSiteConfig) await refreshSiteConfig()
      toast.success('Global appearance settings saved for all visitors', { title: '⭐ Global Settings' })
    } catch {
      toast.error('Failed to save appearance settings')
    } finally {
      setSavingAppearance(false)
    }
  }

  // Auto-save: called immediately when any global appearance card is selected
  const autoSaveGlobalAppearance = useCallback(async (newGA) => {
    setGAppearance(newGA)
    setSavingAppearance(true)
    try {
      await api.put('/admin/site-settings', newGA)
      clearSiteSettingsCache()
      window.dispatchEvent(new CustomEvent('site-settings-updated', { detail: newGA }))
      if (refreshSiteConfig) await refreshSiteConfig()
      toast.success('Global appearance updated', { title: '✅ Auto-saved' })
    } catch {
      toast.error('Failed to save appearance')
    } finally { setSavingAppearance(false) }
  }, [refreshSiteConfig, toast])

  const handleThemePackageApply = useCallback(async (pkg) => {
    const s = pkg.settings
    const stylePayload = {
      menuStyle: s.menuStyle,
      notifyStyle: s.notifyStyle,
      notifyPosition: s.notifyPosition,
      dialogStyle: s.dialogStyle,
      inputStyle: s.inputStyle,
      surfaceStyle: s.surfaceStyle,
    }
    const appearancePayload = {
      loadingScreenStyle: s.loadingScreenStyle,
      animationPreset: s.animationPreset,
      headerStyle: s.headerStyle,
      footerStyle: s.footerStyle,
    }
    const payload = {
      ...siteConfig,
      ...s,
      ...stylePayload,
      ...appearancePayload,
      themePackage: pkg.id,
    }

    setSavingPackage(pkg.id)
    setFwDraft(prev => ({ ...prev, ...stylePayload }))
    setGAppearance(prev => ({ ...prev, ...appearancePayload }))
    setBgAnimation(s.bgAnimation || 'none')
    setGridPattern(s.gridPattern || s.backgroundPattern || 'grid')
    setGlobalThemeId(s.globalTheme || '')

    try {
      await api.put('/admin/site-settings', payload)
      clearSiteSettingsCache()
      FRAMEWORK_CATEGORIES.forEach(cat => {
        const value = stylePayload[cat.configKey]
        if (value) localStorage.setItem(cat.configKey.replace(/([A-Z])/g, '-$1').toLowerCase(), value)
      })
      if (s.notifyPosition) localStorage.setItem('notify-position', s.notifyPosition)
      localStorage.setItem('theme-package', pkg.id)
      window.dispatchEvent(new CustomEvent('site-settings-updated', { detail: payload }))
      if (refreshSiteConfig) await refreshSiteConfig()
      notify.success(`${pkg.name} applied. You can still override every part manually.`, { title: 'Theme Package' })
    } catch (err) {
      notify.error(err?.response?.data?.error || 'Failed to apply theme package', { title: 'Error' })
      setFwDraft({
        menuStyle: siteConfig?.menuStyle || DEFAULT_FRAMEWORK.menuStyle,
        notifyStyle: siteConfig?.notifyStyle || DEFAULT_FRAMEWORK.notifyStyle,
        notifyPosition: siteConfig?.notifyPosition || DEFAULT_FRAMEWORK.notifyPosition,
        dialogStyle: siteConfig?.dialogStyle || DEFAULT_FRAMEWORK.dialogStyle,
        inputStyle: siteConfig?.inputStyle || DEFAULT_FRAMEWORK.inputStyle,
        surfaceStyle: siteConfig?.surfaceStyle || DEFAULT_FRAMEWORK.surfaceStyle,
      })
      setGAppearance(prev => ({
        ...prev,
        loadingScreenStyle: siteConfig?.loadingScreenStyle || prev.loadingScreenStyle,
        animationPreset: siteConfig?.animationPreset || prev.animationPreset,
        headerStyle: siteConfig?.headerStyle || prev.headerStyle,
        footerStyle: siteConfig?.footerStyle || prev.footerStyle,
      }))
      setBgAnimation(siteConfig?.bgAnimation || 'none')
      setGridPattern(siteConfig?.gridPattern || siteConfig?.backgroundPattern || 'grid')
      setGlobalThemeId(siteConfig?.globalTheme || '')
    } finally {
      setSavingPackage(null)
    }
  }, [siteConfig, refreshSiteConfig, notify])

  const packageStatus = useCallback((pkg) => {
    const s = pkg.settings
    const current = {
      globalTheme: globalThemeId || siteConfig?.globalTheme || '',
      headerStyle: gAppearance.headerStyle,
      footerStyle: gAppearance.footerStyle,
      menuStyle: fwDraft.menuStyle,
      notifyStyle: fwDraft.notifyStyle,
      notifyPosition: fwDraft.notifyPosition,
      dialogStyle: fwDraft.dialogStyle,
      inputStyle: fwDraft.inputStyle,
      surfaceStyle: fwDraft.surfaceStyle,
      bgAnimation: bgAnimation || 'none',
      gridPattern: gridPattern || 'grid',
      loadingScreenStyle: gAppearance.loadingScreenStyle,
      animationPreset: gAppearance.animationPreset,
    }
    const picked = siteConfig?.themePackage === pkg.id
    const matches = Object.keys(s).every(key => (current[key] || '') === (s[key] || ''))
    return { isActive: picked || matches, isCustomized: picked && !matches }
  }, [siteConfig?.themePackage, siteConfig?.globalTheme, globalThemeId, gAppearance, fwDraft, bgAnimation, gridPattern])

  const randomTheme = () => {    const others = THEME_DEFS.filter(t => t.id !== theme)
    const pick = others[Math.floor(Math.random() * others.length)]
    setPendingTheme(pick.id)
    setPreviewTheme(pick.id)
    toast.success(`Previewing ${pick.name}`, { title: '🎲 Random Theme' })
  }

  const copyAnimClass = (id) => {
    navigator.clipboard.writeText(id).catch(() => {})
    setCopiedAnim(id)
    toast.success(`Class name "${id}" copied to clipboard`, { title: '📋 Copied' })
    setTimeout(() => setCopiedAnim(null), 2000)
  }

  const filteredThemes = THEME_DEFS.filter(t => {
    const matchesSearch = themeSearch === '' ||
      t.name.toLowerCase().includes(themeSearch.toLowerCase()) ||
      t.desc.toLowerCase().includes(themeSearch.toLowerCase()) ||
      t.tag.toLowerCase().includes(themeSearch.toLowerCase())
    if (!matchesSearch) return false
    if (typeFilter === 'COLOR')  return t.type === 'color'
    if (typeFilter === 'DESIGN') return t.type === 'design'
    if (tagFilter  === 'DARK')   return t.tag === 'DARK'
    if (tagFilter  === 'LIGHT')  return t.tag === 'LIGHT' || t.tag === 'STYLE' && LIGHT_THEME_IDS.includes(t.id)
    if (tagFilter  === 'STYLE')  return t.type === 'design'
    return true
  })

  useEffect(() => {
    if (savingGlobal || savingPackage) return
    setGlobalThemeId(siteConfig?.globalTheme || '')
  }, [siteConfig?.globalTheme, savingGlobal, savingPackage])

  // -- Keyboard nav in themes tab -------------------------------------------
  useEffect(() => {
    if (activeTab !== 'themes') return
    const handler = e => {
      if (filteredThemes.length === 0) return
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        setFocusedIdx(i => Math.min(i + 1, filteredThemes.length - 1))
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        setFocusedIdx(i => Math.max(i - 1, 0))
      } else if (e.key === 'Enter' && focusedIdx >= 0) {
        e.preventDefault()
        const t = filteredThemes[focusedIdx]
        if (t) handleApply(t.id)
      } else if (e.key === 'p' && focusedIdx >= 0) {
        const t = filteredThemes[focusedIdx]
        if (t) setPendingTheme(prev => prev === t.id ? null : t.id)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [activeTab, filteredThemes, focusedIdx])

  // tag badge colours
  const tagStyle = (tag) => {
    if (tag === 'DARK')  return { bg: 'color-mix(in srgb, var(--green) 10%, transparent)',   border: 'color-mix(in srgb, var(--green) 30%, transparent)',   color: '#00ff88' }
    if (tag === 'LIGHT') return { bg: 'rgba(255,220,50,0.1)',  border: 'rgba(255,220,50,0.3)',  color: '#ffd700' }
    return                      { bg: 'rgba(168,85,247,0.1)',  border: 'rgba(168,85,247,0.3)',  color: '#c084fc' }
  }

  const TabBtn = ({ id, label }) => (
    <button onClick={() => { setActiveTab(id); setFocusedIdx(-1) }} style={{
      fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2, padding: '9px 16px',
      background: activeTab === id ? 'var(--green)' : 'transparent',
      color: activeTab === id ? '#000' : 'var(--muted)',
      border: 'none', cursor: 'pointer', borderRadius: 8,
      transition: 'all 0.15s', fontWeight: activeTab === id ? 700 : 400,
    }}>{label}</button>
  )

  const FilterBtn = ({ value, label, active, onClick, activeColor = 'var(--green)' }) => (
    <button onClick={onClick} style={{
      fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 1, padding: '4px 10px',
      background: active ? `${activeColor}18` : 'transparent',
      border: `1px solid ${active ? activeColor : 'var(--border)'}`,
      color: active ? activeColor : 'var(--muted)', borderRadius: 4, cursor: 'pointer', transition: 'all 0.15s',
    }}>{label}</button>
  )

  // Comparison view
  const compareDefA = THEME_DEFS.find(t => t.id === compareA)
  const compareDefB = THEME_DEFS.find(t => t.id === compareB)

  return (
    <div style={{ width: '100%', paddingBottom: 32 }}>
      <style>{`
        @keyframes themeApply { 0%{transform:scale(1)} 50%{transform:scale(1.03)} 100%{transform:scale(1)} }
        /* -- Entrance ------------------------------------ */
        @keyframes miniFadeUp      { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes miniFadeDown    { from{opacity:0;transform:translateY(-10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes miniFadeLeft    { from{opacity:0;transform:translateX(-12px)} to{opacity:1;transform:translateX(0)} }
        @keyframes miniFadeRight   { from{opacity:0;transform:translateX(12px)} to{opacity:1;transform:translateX(0)} }
        @keyframes miniZoomIn      { from{opacity:0;transform:scale(0.55)} to{opacity:1;transform:scale(1)} }
        @keyframes miniFlipIn      { from{opacity:0;transform:perspective(200px) rotateY(90deg)} to{opacity:1;transform:perspective(200px) rotateY(0)} }
        @keyframes miniBounceIn    { 0%{opacity:0;transform:scale(0.3)} 55%{opacity:1;transform:scale(1.15)} 75%{transform:scale(0.92)} 90%{transform:scale(1.05)} 100%{transform:scale(1)} }
        /* -- Attention ----------------------------------- */
        @keyframes miniGlow        { 0%,100%{opacity:0.7} 50%{opacity:1} }
        @keyframes miniBlink       { 0%,100%{opacity:1}   50%{opacity:0} }
        @keyframes miniFloat       { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
        @keyframes miniPulse       { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes miniShake       { 0%,100%{transform:translateX(0)} 15%{transform:translateX(-5px)} 35%{transform:translateX(5px)} 55%{transform:translateX(-4px)} 75%{transform:translateX(4px)} 90%{transform:translateX(-2px)} }
        @keyframes miniWiggle      { 0%,100%{transform:rotate(0deg)} 20%{transform:rotate(-10deg)} 50%{transform:rotate(10deg)} 80%{transform:rotate(-6deg)} }
        @keyframes miniHeartbeat   { 0%,100%{transform:scale(1)} 15%{transform:scale(1.22)} 30%{transform:scale(1)} 45%{transform:scale(1.15)} 65%{transform:scale(1)} }
        /* -- Loading ------------------------------------- */
        @keyframes miniSpin        { to{transform:rotate(360deg)} }
        @keyframes miniDotBounce   { 0%,80%,100%{transform:translateY(0);opacity:0.4} 40%{transform:translateY(-9px);opacity:1} }
        @keyframes miniShimmer     { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
        @keyframes miniProgressBar { 0%{left:-45%;width:40%} 60%{left:70%;width:45%} 100%{left:110%;width:40%} }
        @keyframes miniRipple      { 0%{transform:scale(0.4);opacity:0.9} 100%{transform:scale(2.4);opacity:0} }
        /* -- Loading screen card previews ---------------- */
        @keyframes lsPulse         { 0%,100%{transform:scale(1);opacity:0.5} 50%{transform:scale(1.35);opacity:1} }
        @keyframes lsCyberHex      { 0%{opacity:0.1} 50%{opacity:0.9} 100%{opacity:0.1} }
        @keyframes lsBars          { 0%{height:6px} 50%{height:22px} 100%{height:6px} }
        @keyframes lsWave          { 0%{transform:translateX(-100%)} 100%{transform:translateX(100%)} }
        @keyframes lsNeon          { 0%,100%{opacity:1;text-shadow:0 0 8px currentColor,0 0 20px currentColor} 45%{opacity:0.15;text-shadow:none} 50%{opacity:1} 75%{opacity:0.3} }
        /* -- Animation preset card previews -------------- */
        @keyframes apSmooth        { 0%{transform:translateY(12px);opacity:0} 100%{transform:translateY(0);opacity:1} }
        @keyframes apSnappy        { 0%{transform:scale(0.8);opacity:0} 100%{transform:scale(1);opacity:1} }
        @keyframes apBouncy        { 0%{transform:translateY(14px);opacity:0} 55%{transform:translateY(-5px);opacity:1} 75%{transform:translateY(2px)} 100%{transform:translateY(0);opacity:1} }
        @keyframes apExpressive    { 0%{transform:rotate(-8deg) scale(0.7);opacity:0} 100%{transform:rotate(0deg) scale(1);opacity:1} }
        @keyframes apElastic       { 0%{transform:scaleX(0.4);opacity:0} 50%{transform:scaleX(1.15)} 75%{transform:scaleX(0.92)} 100%{transform:scaleX(1);opacity:1} }
        @keyframes apCinematic     { 0%{transform:scale(1.15);opacity:0;filter:blur(4px)} 100%{transform:scale(1);opacity:1;filter:blur(0)} }
        @keyframes apReduced       { 0%{opacity:0} 100%{opacity:1} }
        .ls-card { transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s; cursor: pointer; border-radius: 8px; }
        .ls-card:hover { transform: translateY(-2px); }
        /* -- Text / Hero --------------------------------- */
        @keyframes miniGlitch      { 0%,88%,100%{transform:translate(0)} 20%{transform:translate(-2px,1px)} 22%{transform:translate(2px,-1px)} 24%{transform:translate(-1px,0)} 90%{transform:translate(1px,-1px)} 92%{transform:translate(-1px,1px)} }
        @keyframes miniGlitchR     { 0%,88%,100%{clip-path:inset(100% 0 0 0);transform:translate(0)} 20%{clip-path:inset(20% 0 60% 0);transform:translate(-3px,0)} 22%{clip-path:inset(50% 0 30% 0);transform:translate(3px,0)} 24%{clip-path:inset(100% 0 0 0)} 90%{clip-path:inset(10% 0 80% 0);transform:translate(-2px,0)} 92%{clip-path:inset(100% 0 0 0)} }
        @keyframes miniNeonFlicker { 0%,19%,21%,23%,25%,54%,56%,100%{opacity:1} 20%,22%,24%{opacity:0.3} 55%{opacity:0.15} }
        @keyframes miniTypewriter  { from{width:0} to{width:100%} }
        @keyframes miniGradientFlow{ 0%{background-position:0% 50%} 100%{background-position:200% 50%} }
        @keyframes miniLetterPop   { 0%{opacity:0;transform:translateY(8px) scale(0.7)} 100%{opacity:1;transform:translateY(0) scale(1)} }
        /* -- Background ---------------------------------- */
        @keyframes miniBorderChase { 0%{background-position:0% 0%} 100%{background-position:400% 0%} }
        @keyframes miniScanline    { 0%{top:-10%} 100%{top:110%} }
        @keyframes miniAmbientGlow { 0%,100%{opacity:0.25;transform:scale(1)} 50%{opacity:0.65;transform:scale(1.18)} }
        @keyframes miniGridPulse   { 0%,100%{opacity:0.12} 50%{opacity:0.45} }
        .tl-card:hover { border-color: var(--green) !important; transform: translateY(-2px); }
        .tl-anim-card  { transition: border-color 0.15s, box-shadow 0.15s; cursor: pointer; }
        .tl-anim-card:hover { border-color: var(--green) !important; }
      `}</style>

      {/* Header */}
      <PageHeader
        eyebrow="SYSTEM · APPEARANCE"
        title="Theme Library"
        subtitle={`${THEME_DEFS.length} themes available — select then apply. Changes persist across sessions.`}
      />

      {/* -- Always-global banner -------------------------------------------- */}
      <div style={{ marginBottom: 16, padding: '12px 16px', background: 'color-mix(in srgb, var(--cyan) 6%, transparent)', border: '1px solid color-mix(in srgb, var(--cyan) 25%, transparent)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 20 }}>🌐</div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--cyan)', letterSpacing: 1 }}>
            GLOBAL MODE — Changes affect ALL visitors
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', marginTop: 3 }}>
            APPLY sets the global default theme for everyone. Use the ⚙️ GLOBAL SETTINGS tab to manage appearance, animations & layout.
          </div>
        </div>
        {globalThemeId ? (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--cyan)', padding: '4px 10px', background: 'color-mix(in srgb, var(--cyan) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--cyan) 20%, transparent)', borderRadius: 4 }}>
            Current global: <strong>{THEME_DEFS.find(t => t.id === globalThemeId)?.name || globalThemeId}</strong>
          </div>
        ) : (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', padding: '4px 10px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 4 }}>
            No global theme set
          </div>
        )}
      </div>

      {/* -- Active theme banner — simplified, no pending state -- */}
      <div style={{ marginBottom: 20, padding: '12px 16px', background: `${currentDef.primary}0e`, border: `1px solid ${currentDef.primary}33`, borderRadius: 8, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 5 }}>
          {[currentDef.bg, currentDef.primary, currentDef.secondary, currentDef.orange].map((c, i) => (
            <div key={i} style={{ width: 16, height: 16, borderRadius: 3, background: c, border: '1px solid rgba(255,255,255,0.1)' }} />
          ))}
        </div>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: currentDef.primary, letterSpacing: 1 }}>{currentDef.name}</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--muted)', letterSpacing: 2 }}>ACTIVE THEME — click any card to switch instantly</div>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', opacity: 0.6 }}>🌐 Changes apply to all visitors</span>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 3, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 4, marginBottom: 24, flexWrap: 'wrap', width: 'fit-content', maxWidth: '100%' }}>
        <TabBtn id="packages"   label="▧ PACKAGES" />
        <TabBtn id="themes"     label="🎨 THEMES" />
        <TabBtn id="animations" label="✨ ANIMATIONS" />
        <TabBtn id="preview"    label="👁️ LIVE PREVIEW" />
        <TabBtn id="compare"    label="⚖️ COMPARE" />
        <TabBtn id="favorites"  label={`❤️ FAVORITES${favorites.length ? ` (${favorites.length})` : ''}`} />
        <TabBtn id="builder"    label="🛠️ BUILDER" />
        <TabBtn id="framework"  label="🧩 FRAMEWORK" />
        <TabBtn id="backgrounds" label="🖼️ BACKGROUNDS" />
        <TabBtn id="global"     label="⚙️ GLOBAL SETTINGS" />
      </div>

      {/* -- THEME PACKAGES TAB -- */}
      {activeTab === 'packages' && (
        <div>
          <div style={{ marginBottom: 22, padding: '18px 20px', background: 'linear-gradient(135deg, color-mix(in srgb, var(--green) 8%, transparent), color-mix(in srgb, var(--cyan) 6%, transparent))', border: '1px solid color-mix(in srgb, var(--cyan) 22%, transparent)', borderRadius: 10 }}>
            <div style={{ fontFamily: _FM, fontSize: 9, color: _G, letterSpacing: 3, marginBottom: 8 }}>THEME PACKAGES</div>
            <div style={{ fontFamily: _FD, fontSize: 24, fontWeight: 800, color: _TX, marginBottom: 6 }}>One click changes the whole UI system</div>
            <div style={{ fontFamily: _FM, fontSize: 10, color: _MT, lineHeight: 1.7, maxWidth: 920 }}>
              Each package applies a coordinated set of theme, header, footer, menu, dialog, notification, input, surface, background, loading, and animation settings. After applying one, all manual controls below stay available for fine tuning.
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
            {THEME_PACKAGES.map(pkg => {
              const status = packageStatus(pkg)
              return (
                <ThemePackageCard
                  key={pkg.id}
                  pkg={pkg}
                  isActive={status.isActive}
                  isCustomized={status.isCustomized}
                  isSaving={savingPackage === pkg.id}
                  onApply={handleThemePackageApply}
                />
              )
            })}
          </div>

          <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontFamily: _FM, fontSize: 9, color: _MT }}>
            {savingPackage
              ? <span style={{ color: _CY }}>Saving package...</span>
              : <span>Package selection is saved immediately. Individual settings can be changed in Framework, Backgrounds, and Global Settings.</span>
            }
          </div>
        </div>
      )}

      {/* -- THEMES TAB -- */}
      {activeTab === 'themes' && (
        <>
          {/* Search bar + random + keyboard hint */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 220px', position: 'relative' }}>
              <input
                value={themeSearch} onChange={e => setThemeSearch(e.target.value)}
                placeholder="Search themes by name, description, or tag"
                style={{ width: '100%', background: 'var(--bg2)', border: '1px solid var(--border)', outline: 'none', padding: '9px 12px 9px 32px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text)', borderRadius: 6, boxSizing: 'border-box', transition: 'border-color 0.2s' }}
                onFocus={e => e.target.style.borderColor = 'var(--green)'}
                onBlur={e => e.target.style.borderColor = 'var(--border)'}
              />
              <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, opacity: 0.4 }}>⭐</span>
              {themeSearch && <button onClick={() => setThemeSearch('')} aria-label="Clear search" style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>✕</button>}
            </div>
            <button onClick={randomTheme} title="Pick a random theme" style={{
              fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 1, padding: '8px 14px',
              background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.3)',
              color: '#c084fc', cursor: 'pointer', borderRadius: 6, transition: 'all 0.15s', flexShrink: 0,
            }}>🎲 RANDOM</button>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--muted)', letterSpacing: 1, flexShrink: 0 }}>
              ⏎ navigate  <kbd style={{ background: 'var(--bg3)', border: '1px solid var(--border)', padding: '1px 5px', borderRadius: 3 }}>↵</kbd> apply
            </div>
          </div>

          {/* Recently applied strip */}
          {recentThemes.length > 0 && (
            <div style={{ marginBottom: 16, padding: '10px 14px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 2, color: 'var(--muted)', flexShrink: 0 }}>RECENTLY APPLIED:</span>
              {recentThemes.map(id => {
                const t = THEME_DEFS.find(x => x.id === id)
                if (!t) return null
                return (
                  <button key={id} onClick={() => applyTheme(id)} title={t.desc}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', background: theme === id ? `${t.primary}15` : 'var(--bg3)', border: `1px solid ${theme === id ? t.primary + '44' : 'var(--border)'}`, borderRadius: 4, cursor: 'pointer', transition: 'all 0.15s' }}>
                    <div style={{ display: 'flex', gap: 2 }}>
                      {[t.bg, t.primary, t.secondary].map((c, i) => <div key={i} style={{ width: 8, height: 8, borderRadius: 2, background: c }} />)}
                    </div>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: theme === id ? t.primary : 'var(--muted)', letterSpacing: 1 }}>{t.name}</span>
                  </button>
                )
              })}
            </div>
          )}

          {/* Filter row */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--muted)', letterSpacing: 2, marginRight: 4 }}>TYPE:</span>
            {['ALL','COLOR','DESIGN'].map(f => (
              <FilterBtn key={f} value={f} label={`${f} (${f==='ALL'?THEME_DEFS.length:f==='COLOR'?THEME_DEFS.filter(x=>x.type==='color').length:THEME_DEFS.filter(x=>x.type==='design').length})`}
                active={typeFilter === f && tagFilter === 'ALL'} activeColor="#c084fc"
                onClick={() => { setTypeFilter(f); setTagFilter('ALL') }} />
            ))}
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--border)', marginInline: 4 }}></span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--muted)', letterSpacing: 2, marginRight: 4 }}>TAG:</span>
            {['DARK','LIGHT','STYLE'].map(f => (
              <FilterBtn key={f} value={f} label={f}
                active={tagFilter === f}
                activeColor={f==='DARK'?'#00ff88':f==='LIGHT'?'#ffd700':'#c084fc'}
                onClick={() => { setTagFilter(prev => prev===f?'ALL':f); setTypeFilter('ALL') }} />
            ))}
            {(themeSearch || typeFilter !== 'ALL' || tagFilter !== 'ALL') && (
              <button onClick={() => { setThemeSearch(''); setTypeFilter('ALL'); setTagFilter('ALL') }}
                style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 1, padding: '4px 10px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)', borderRadius: 4, cursor: 'pointer' }}>
                ? CLEAR
              </button>
            )}
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--muted)', marginLeft: 'auto' }}>
              {filteredThemes.length} of {THEME_DEFS.length} themes
            </span>
          </div>

          {/* Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
            {filteredThemes.map((t, idx) => {
              const isActive   = theme === t.id
              const isSelected = pendingTheme === t.id
              const isFocused  = focusedIdx === idx
              const ts = tagStyle(t.tag)
              return (
                <div key={t.id} className="tl-card"
                  onClick={() => handleApply(t.id)}
                  onMouseEnter={() => { setPreviewTheme(t.id); setFocusedIdx(idx) }}
                  onMouseLeave={() => setPreviewTheme(null)}
                  style={{
                    background: t.bg2, overflow: 'hidden', borderRadius: 10, cursor: 'pointer',
                    border: `2px solid ${isActive ? t.primary : isFocused ? `${t.primary}88` : 'rgba(255,255,255,0.06)'}`,
                    transition: 'border-color 0.2s, transform 0.15s, box-shadow 0.2s',
                    boxShadow: isActive ? `0 0 22px ${t.primary}44` : isFocused ? `0 0 16px ${t.primary}33` : '0 2px 12px rgba(0,0,0,0.3)',
                  }}
                >
                  {/* Mini UI mockup */}
                  <div style={{ padding: 12, background: t.bg, borderBottom: `1px solid ${t.border}`, position: 'relative', height: 130, overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 36, background: t.bg2, borderRight: `1px solid ${t.border}`, display: 'flex', flexDirection: 'column', gap: 5, padding: '8px 4px', alignItems: 'center' }}>
                      {[t.primary, t.secondary, t.orange, t.muted, t.muted].map((c, i) => (
                        <div key={i} style={{ width: 22, height: 5, borderRadius: 2, background: i === 0 ? c : `${c}44` }} />
                      ))}
                    </div>
                    <div style={{ marginLeft: 44 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8 }}>
                        <div style={{ height: 6, width: 50, borderRadius: 2, background: t.primary }} />
                        <div style={{ height: 6, flex: 1, borderRadius: 2, background: `${t.muted}44` }} />
                      </div>
                      <div style={{ display: 'flex', gap: 5, marginBottom: 8 }}>
                        {[t.primary, t.secondary, t.orange].map((c, i) => (
                          <div key={i} style={{ flex: 1, height: 36, borderRadius: 4, background: t.bg3, border: `1px solid ${t.border}`, padding: 5 }}>
                            <div style={{ height: 4, width: '60%', borderRadius: 2, background: `${c}88`, marginBottom: 3 }} />
                            <div style={{ height: 3, width: '80%', borderRadius: 2, background: `${t.text}22` }} />
                          </div>
                        ))}
                      </div>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <div style={{ height: 14, width: 50, borderRadius: 3, background: t.primary }} />
                        <div style={{ height: 14, width: 40, borderRadius: 3, border: `1px solid ${t.secondary}66` }} />
                      </div>
                    </div>
                    {/* Status badge */}
                    {isSelected && <div style={{ position: 'absolute', top: 8, right: 8, width: 22, height: 22, borderRadius: '50%', background: t.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#000', fontWeight: 800 }}>?</div>}
                    {isActive && !isSelected && <div style={{ position: 'absolute', top: 8, right: 8, width: 8, height: 8, borderRadius: '50%', background: t.primary, boxShadow: `0 0 8px ${t.primary}` }} />}
                    {/* Favorite heart */}
                    <button onClick={e => { e.stopPropagation(); toggleFav(t.id) }} title={isFav(t.id) ? 'Remove favorite' : 'Add to favorites'}
                      style={{ position: 'absolute', bottom: 8, right: 8, background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, lineHeight: 1, opacity: isFav(t.id) ? 1 : 0.25, transition: 'opacity 0.2s', padding: 2 }}
                    >{isFav(t.id) ? '○' : '○'}</button>
                  </div>

                  {/* Info row */}
                  <div style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, letterSpacing: 1, color: isSelected ? t.primary : isActive ? t.primary : t.text }}>{t.name}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 7, letterSpacing: 2, padding: '2px 6px', background: ts.bg, border: `1px solid ${ts.border}`, color: ts.color, borderRadius: 3 }}>{t.tag}</span>
                      {isActive && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 7, letterSpacing: 2, color: t.primary, marginLeft: 'auto' }}>✅ ACTIVE</span>}
                      {isSelected && !isActive && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 7, letterSpacing: 2, color: t.primary, marginLeft: 'auto' }}>⭐ SELECTED</span>}
                    </div>
                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: t.muted, lineHeight: 1.6, margin: '0 0 8px' }}>{t.desc}</p>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {[t.bg, t.bg2, t.bg3, t.primary, t.secondary, t.orange].map((c, i) => (
                        <div key={i} style={{ width: 14, height: 14, borderRadius: 3, background: c, border: '1px solid rgba(255,255,255,0.08)' }} />
                      ))}
                    </div>
                  </div>

                  {/* Footer */}
                  <div style={{ padding: '8px 14px 10px', borderTop: `1px solid ${t.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: isSelected || isActive ? t.primary : t.muted }}>
                      {isActive ? '✅ Active theme' : isSelected ? '🖱 Click to apply' : '🖱 Click to apply instantly'}
                    </span>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      {/* Set Global button */}
                      <button
                        onClick={e => { e.stopPropagation(); applyGlobalTheme(t.id) }}
                        disabled={savingGlobal === t.id}
                        title={globalThemeId === t.id ? 'Click to clear global theme' : 'Set as global default for all visitors'}
                        style={{
                          fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 1,
                          padding: '3px 8px', borderRadius: 4, cursor: savingGlobal === t.id ? 'wait' : 'pointer',
                          transition: 'all 0.15s', flexShrink: 0,
                          background: globalThemeId === t.id ? `${t.primary}22` : 'transparent',
                          border: `1px solid ${globalThemeId === t.id ? t.primary : `${t.muted}55`}`,
                          color: globalThemeId === t.id ? t.primary : t.muted,
                        }}
                        onMouseEnter={e => { if (globalThemeId !== t.id) { e.currentTarget.style.borderColor = t.primary; e.currentTarget.style.color = t.primary } }}
                        onMouseLeave={e => { if (globalThemeId !== t.id) { e.currentTarget.style.borderColor = `${t.muted}55`; e.currentTarget.style.color = t.muted } }}
                      >
                        {savingGlobal === t.id ? '' : globalThemeId === t.id ? '🌐 GLOBAL' : '🌐 SET GLOBAL'}
                      </button>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {[t.primary, t.secondary, t.orange].map((c, i) => (
                          <div key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: c }} />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {filteredThemes.length === 0 && (
            <div style={{ padding: 32, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', letterSpacing: 2 }}>
              NO THEMES MATCH THIS FILTER
              <button onClick={() => { setThemeSearch(''); setTypeFilter('ALL'); setTagFilter('ALL') }}
                style={{ display: 'block', margin: '10px auto 0', background: 'none', border: '1px solid var(--border)', color: 'var(--green)', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 2, padding: '5px 14px', borderRadius: 4 }}>
                CLEAR FILTERS
              </button>
            </div>
          )}
        </>
      )}

      {/* -- ANIMATIONS TAB -- */}
      {activeTab === 'animations' && (
        <div>
          {/* Info bar */}
          <div style={{ marginBottom: 14, padding: '12px 16px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 6, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', lineHeight: 1.7, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <span>All animations live in <code style={{ color: 'var(--green)', background: 'color-mix(in srgb, var(--green) 8%, transparent)', padding: '1px 6px' }}>index.css</code> and inherit active theme colors. Click any card to select, then copy the class name.</span>
            {selectedAnim && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ color: 'var(--green)' }}>Selected: <strong>{selectedAnim}</strong></span>
                <button onClick={() => copyAnimClass(selectedAnim)} style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 1, padding: '5px 12px', background: copiedAnim ? 'var(--green)' : 'transparent', border: `1px solid ${copiedAnim ? 'var(--green)' : 'var(--border)'}`, color: copiedAnim ? '#000' : 'var(--green)', cursor: 'pointer', borderRadius: 4, transition: 'all 0.2s' }}>{copiedAnim ? '✅ COPIED!' : '⭐ COPY CLASS'}</button>
                <button onClick={() => setSelectedAnim(null)} style={{ fontFamily: 'var(--font-mono)', fontSize: 9, padding: '5px 10px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer', borderRadius: 4 }}>?</button>
              </div>
            )}
          </div>

          {/* Category filter */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18 }}>
            {ANIM_CATEGORIES.map(cat => {
              const active = animCat === cat.id
              const count  = cat.id === 'ALL' ? ANIMATIONS.length : ANIMATIONS.filter(a => a.cat === cat.id).length
              return (
                <button key={cat.id} onClick={() => setAnimCat(cat.id)} style={{
                  fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 1, padding: '5px 12px',
                  background: active ? `${cat.color}18` : 'transparent',
                  border: `1px solid ${active ? cat.color : 'var(--border)'}`,
                  color: active ? cat.color : 'var(--muted)', borderRadius: 4, cursor: 'pointer', transition: 'all 0.15s',
                }}>{cat.label} <span style={{ opacity: 0.6 }}>({count})</span></button>
              )
            })}
          </div>

          {/* Category header */}
          {animCat !== 'ALL' && (() => {
            const cat = ANIM_CATEGORIES.find(c => c.id === animCat)
            const useCases = { entrance: 'Scroll-triggered reveals, page load, route transitions', attention: 'Hover states, notifications, interactive feedback', loading: 'Data fetching, uploads, AI responses, skeleton UI', text: 'Hero name, logo, taglines  especially the TANVIR AIFAZI header', background: 'Ambient overlays, card borders, section backgrounds' }
            return cat ? (
              <div style={{ marginBottom: 16, padding: '10px 16px', background: `${cat.color}0d`, border: `1px solid ${cat.color}30`, borderRadius: 6, fontFamily: 'var(--font-mono)', fontSize: 9, color: cat.color, lineHeight: 1.8 }}>
                <strong>{cat.label.replace(/^[^ ]+ /, '')}</strong>: {useCases[animCat]}
              </div>
            ) : null
          })()}

          {/* Animation grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(185px, 1fr))', gap: 14 }}>
            {ANIMATIONS.filter(a => animCat === 'ALL' || a.cat === animCat).map(anim => {
              const isSelected = selectedAnim === anim.id
              const catColor   = ANIM_CATEGORIES.find(c => c.id === anim.cat)?.color || 'var(--green)'
              return (
                <div key={anim.id} className="tl-anim-card"
                  onClick={() => setSelectedAnim(prev => prev === anim.id ? null : anim.id)}
                  style={{
                    background: isSelected ? `${currentDef.primary}10` : 'var(--bg2)',
                    border: `1px solid ${isSelected ? currentDef.primary : 'var(--border)'}`,
                    borderRadius: 8, padding: '20px 14px',
                    display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', textAlign: 'center',
                    boxShadow: isSelected ? `0 0 14px ${currentDef.primary}33` : 'none',
                  }}
                >
                  {/* -- Live demo -- */}
                  <div style={{ width: 64, height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', flexShrink: 0, overflow: 'hidden' }}>

                    {/* Entrance */}
                    {anim.id === 'fadeUp'      && <div style={{ width: 42, height: 42, background: `${currentDef.primary}20`, border: `1px solid ${currentDef.primary}66`, borderRadius: 6, animation: 'miniFadeUp 1.4s ease-in-out infinite alternate' }} />}
                    {anim.id === 'fadeDown'    && <div style={{ width: 42, height: 42, background: `${currentDef.secondary}20`, border: `1px solid ${currentDef.secondary}66`, borderRadius: 6, animation: 'miniFadeDown 1.4s ease-in-out infinite alternate' }} />}
                    {anim.id === 'fadeLeft'    && <div style={{ width: 42, height: 42, background: `${currentDef.primary}20`, border: `1px solid ${currentDef.primary}66`, borderRadius: 6, animation: 'miniFadeLeft 1.2s ease-in-out infinite alternate' }} />}
                    {anim.id === 'fadeRight'   && <div style={{ width: 42, height: 42, background: `${currentDef.secondary}20`, border: `1px solid ${currentDef.secondary}66`, borderRadius: 6, animation: 'miniFadeRight 1.2s ease-in-out infinite alternate' }} />}
                    {anim.id === 'zoomIn'      && <div style={{ width: 42, height: 42, background: `${currentDef.primary}20`, border: `1px solid ${currentDef.primary}66`, borderRadius: '50%', animation: 'miniZoomIn 1.3s ease-in-out infinite alternate' }} />}
                    {anim.id === 'flipIn'      && <div style={{ width: 42, height: 42, background: `${currentDef.secondary}20`, border: `1px solid ${currentDef.secondary}66`, borderRadius: 6, animation: 'miniFlipIn 1.5s ease-in-out infinite alternate' }} />}
                    {anim.id === 'bounceIn'    && <div style={{ width: 36, height: 36, background: `${currentDef.primary}22`, border: `2px solid ${currentDef.primary}`, borderRadius: 6, animation: 'miniBounceIn 1.4s ease-out infinite' }} />}

                    {/* Attention */}
                    {anim.id === 'pulse'       && <div style={{ width: 42, height: 42, background: `${currentDef.primary}20`, border: `1px solid ${currentDef.primary}66`, borderRadius: 6, animation: 'miniPulse 1.4s ease-in-out infinite' }} />}
                    {anim.id === 'glow-pulse'  && <div style={{ width: 42, height: 42, background: `${currentDef.primary}15`, border: `2px solid ${currentDef.primary}`, borderRadius: 6, animation: 'miniGlow 2s ease-in-out infinite', boxShadow: `0 0 14px ${currentDef.primary}66` }} />}
                    {anim.id === 'float'       && <div style={{ width: 38, height: 38, background: `${currentDef.secondary}22`, border: `1px solid ${currentDef.secondary}66`, borderRadius: 8, animation: 'miniFloat 2.5s ease-in-out infinite' }} />}
                    {anim.id === 'shake'       && <div style={{ width: 42, height: 14, background: `${currentDef.orange}25`, border: `1px solid ${currentDef.orange}66`, borderRadius: 3, animation: 'miniShake 1.2s ease-in-out infinite' }} />}
                    {anim.id === 'wiggle'      && <div style={{ fontSize: 28, lineHeight: 1, animation: 'miniWiggle 1.4s ease-in-out infinite' }}>🌀</div>}
                    {anim.id === 'heartbeat'   && <div style={{ fontSize: 26, lineHeight: 1, animation: 'miniHeartbeat 1.4s ease-in-out infinite' }}>🌀</div>}

                    {/* Loading */}
                    {anim.id === 'spin'        && <div style={{ width: 38, height: 38, border: `3px solid ${currentDef.bg3}`, borderTopColor: currentDef.primary, borderRadius: '50%', animation: 'miniSpin 0.8s linear infinite' }} />}
                    {anim.id === 'dots'        && (
                      <div style={{ display: 'flex', gap: 7, alignItems: 'flex-end', height: 30 }}>
                        {[0, 0.18, 0.36].map((delay, i) => (
                          <div key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: currentDef.primary, animation: `miniDotBounce 1.1s ${delay}s ease-in-out infinite` }} />
                        ))}
                      </div>
                    )}
                    {anim.id === 'shimmer'     && (
                      <div style={{ width: 54, display: 'flex', flexDirection: 'column', gap: 5 }}>
                        <div style={{ height: 10, borderRadius: 4, background: `linear-gradient(90deg,${currentDef.bg3} 25%,${currentDef.primary}33 50%,${currentDef.bg3} 75%)`, backgroundSize: '200% 100%', animation: 'miniShimmer 1.4s linear infinite' }} />
                        <div style={{ height: 8, width: '75%', borderRadius: 4, background: `linear-gradient(90deg,${currentDef.bg3} 25%,${currentDef.primary}33 50%,${currentDef.bg3} 75%)`, backgroundSize: '200% 100%', animation: 'miniShimmer 1.4s 0.2s linear infinite' }} />
                        <div style={{ height: 8, width: '55%', borderRadius: 4, background: `linear-gradient(90deg,${currentDef.bg3} 25%,${currentDef.primary}33 50%,${currentDef.bg3} 75%)`, backgroundSize: '200% 100%', animation: 'miniShimmer 1.4s 0.4s linear infinite' }} />
                      </div>
                    )}
                    {anim.id === 'progressPulse' && (
                      <div style={{ width: 54, height: 6, background: currentDef.bg3, borderRadius: 99, overflow: 'hidden', position: 'relative' }}>
                        <div style={{ position: 'absolute', top: 0, height: '100%', background: `linear-gradient(90deg,transparent,${currentDef.primary},transparent)`, animation: 'miniProgressBar 1.4s linear infinite' }} />
                      </div>
                    )}
                    {anim.id === 'ripple'      && (
                      <div style={{ position: 'relative', width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ position: 'absolute', width: 22, height: 22, borderRadius: '50%', border: `2px solid ${currentDef.primary}`, animation: 'miniRipple 1.6s ease-out infinite' }} />
                        <div style={{ position: 'absolute', width: 22, height: 22, borderRadius: '50%', border: `2px solid ${currentDef.primary}`, animation: 'miniRipple 1.6s 0.6s ease-out infinite' }} />
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: currentDef.primary }} />
                      </div>
                    )}

                    {/* Text / Hero */}
                    {anim.id === 'glitch'      && (
                      <div style={{ position: 'relative', fontFamily: 'var(--font-mono)', fontWeight: 900, fontSize: 22, color: '#fff', letterSpacing: 1, animation: 'miniGlitch 3s infinite' }}>
                        <span style={{ position: 'absolute', top: 0, left: 0, color: '#ff003c', clipPath: 'inset(0)', animation: 'miniGlitchR 3s 0.05s infinite', mixBlendMode: 'screen' }}>TN</span>
                        <span style={{ position: 'absolute', top: 0, left: 0, color: '#00eaff', clipPath: 'inset(0)', animation: 'miniGlitchR 3s 0.1s infinite', mixBlendMode: 'screen' }}>TN</span>
                        TN
                      </div>
                    )}
                    {anim.id === 'neonFlicker' && (
                      <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 900, fontSize: 14, letterSpacing: 2, color: currentDef.primary, textShadow: `0 0 8px ${currentDef.primary},0 0 20px ${currentDef.primary}88`, animation: 'miniNeonFlicker 3s infinite' }}>AIFAZI</div>
                    )}
                    {anim.id === 'typewriter'  && (
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: currentDef.primary, whiteSpace: 'nowrap', overflow: 'hidden', borderRight: `2px solid ${currentDef.primary}`, width: '70%', animation: 'miniTypewriter 2.2s steps(8) infinite alternate, miniBlink 0.8s step-end infinite' }}>TANVIR</div>
                    )}
                    {anim.id === 'gradientFlow' && (
                      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 15, letterSpacing: 2, background: `linear-gradient(90deg,${currentDef.primary},${currentDef.secondary},${currentDef.orange},${currentDef.primary})`, backgroundSize: '200% auto', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', animation: 'miniGradientFlow 2s linear infinite' }}>AIFAZI</div>
                    )}
                    {anim.id === 'letterPop'   && (
                      <div style={{ display: 'flex', gap: 2, fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 13, letterSpacing: 1 }}>
                        {'TANVIR'.split('').map((l, i) => (
                          <span key={i} style={{ color: i < 3 ? '#e8eaed' : currentDef.primary, animation: `miniLetterPop 2s ${i * 0.12}s ease-out infinite alternate` }}>{l}</span>
                        ))}
                      </div>
                    )}

                    {/* Background */}
                    {anim.id === 'scanline'    && (
                      <div style={{ width: 50, height: 50, background: currentDef.bg3, border: `1px solid ${currentDef.border}`, borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
                        <div style={{ position: 'absolute', left: 0, right: 0, height: 4, background: `linear-gradient(transparent,${currentDef.primary}55,transparent)`, animation: 'miniScanline 1.5s linear infinite' }} />
                      </div>
                    )}
                    {anim.id === 'border'      && (
                      <div style={{ width: 48, height: 48, borderRadius: 6, padding: 2, background: `linear-gradient(90deg,${currentDef.primary},${currentDef.secondary},${currentDef.orange},${currentDef.primary})`, backgroundSize: '400%', animation: 'miniBorderChase 1.5s linear infinite' }}>
                        <div style={{ width: '100%', height: '100%', background: currentDef.bg2, borderRadius: 4 }} />
                      </div>
                    )}
                    {anim.id === 'blink'       && <div style={{ width: 3, height: 32, background: currentDef.primary, borderRadius: 2, animation: 'miniBlink 1s step-end infinite' }} />}
                    {anim.id === 'ambientGlow' && (
                      <div style={{ position: 'relative', width: 50, height: 50 }}>
                        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: `radial-gradient(circle,${currentDef.primary}55 0%,transparent 70%)`, animation: 'miniAmbientGlow 2.5s ease-in-out infinite' }} />
                        <div style={{ position: 'absolute', inset: 8, borderRadius: '50%', background: currentDef.bg3, border: `1px solid ${currentDef.border}` }} />
                      </div>
                    )}
                    {anim.id === 'gridPulse'   && (
                      <div style={{ width: 50, height: 50, backgroundImage: `radial-gradient(${currentDef.primary} 1px,transparent 1px)`, backgroundSize: '8px 8px', animation: 'miniGridPulse 2s ease-in-out infinite', borderRadius: 4 }} />
                    )}
                  </div>

                  {/* Labels */}
                  <div style={{ width: '100%' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: isSelected ? currentDef.primary : 'var(--text)', letterSpacing: 1, marginBottom: 2 }}>{anim.name}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--muted)', lineHeight: 1.5, marginBottom: 4 }}>{anim.desc}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 7, color: catColor, opacity: 0.8, lineHeight: 1.4 }}>Use: {anim.use}</div>
                  </div>

                  {/* Class + copy */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5, width: '100%' }}>
                    <code style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: currentDef.primary, background: `${currentDef.primary}0d`, border: `1px solid ${currentDef.primary}28`, padding: '3px 8px', borderRadius: 3 }}>{anim.id}</code>
                    <button onClick={(e) => { e.stopPropagation(); copyAnimClass(anim.id) }} style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 1, padding: '4px 8px', background: copiedAnim === anim.id ? currentDef.primary : 'transparent', border: `1px solid ${copiedAnim === anim.id ? currentDef.primary : 'var(--border)'}`, color: copiedAnim === anim.id ? '#000' : 'var(--muted)', cursor: 'pointer', borderRadius: 3, transition: 'all 0.2s' }}>{copiedAnim === anim.id ? '✅ COPIED' : '⭐ COPY CLASS'}</button>
                  </div>
                  {isSelected && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 7, color: currentDef.primary, letterSpacing: 1 }}>SELECTED ?</div>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* -- LIVE PREVIEW TAB -- */}
      {activeTab === 'preview' && (
        <div>
          <div style={{ marginBottom: 14, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)' }}>
            Select a theme to render a full admin UI mockup. Click <strong style={{ color: 'var(--green)' }}>APPLY</strong> to activate site-wide.
          </div>
          {/* Theme strip */}
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 20 }}>
            {THEME_DEFS.map(t => {
              const ts = tagStyle(t.tag)
              return (
                <button key={t.id} onClick={() => setPreviewTheme(t.id === previewTheme ? null : t.id)} style={{
                  fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 1, padding: '4px 10px',
                  background: displayId === t.id ? `${t.primary}22` : 'var(--bg2)',
                  border: `1px solid ${displayId === t.id ? t.primary : 'var(--border)'}`,
                  color: displayId === t.id ? t.primary : 'var(--muted)',
                  cursor: 'pointer', borderRadius: 4, transition: 'all 0.15s', display: 'flex', gap: 4, alignItems: 'center',
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: t.primary, flexShrink: 0 }} />
                  {t.name}
                </button>
              )
            })}
          </div>

          {/* Mockup */}
          <div style={{ background: displayDef.bg, border: `1px solid ${displayDef.border}`, borderRadius: 10, overflow: 'hidden', boxShadow: '0 12px 48px rgba(0,0,0,0.5)' }}>
            <div style={{ display: 'flex', alignItems: 'center', padding: '10px 20px', background: displayDef.bg2, borderBottom: `1px solid ${displayDef.border}`, gap: 16 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: displayDef.primary, letterSpacing: 2 }}>AIFAZI</div>
              <div style={{ flex: 1, display: 'flex', gap: 16 }}>
                {['Home','Blog','Tools','Forum'].map(n => <span key={n} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: displayDef.muted }}>{n}</span>)}
              </div>
              <div style={{ width: 26, height: 26, borderRadius: '50%', background: `${displayDef.primary}22`, border: `1px solid ${displayDef.primary}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>⭐</div>
            </div>
            <div style={{ display: 'flex', minHeight: 320 }}>
              <div style={{ width: 150, background: displayDef.bg2, borderRight: `1px solid ${displayDef.border}`, padding: '14px 0', flexShrink: 0 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 7, letterSpacing: 3, color: displayDef.muted, padding: '0 12px 8px' }}>OVERVIEW</div>
                {['Dashboard','Posts','Media'].map((item, i) => (
                  <div key={item} style={{ padding: '7px 12px', fontFamily: 'var(--font-mono)', fontSize: 10, color: i === 0 ? displayDef.primary : displayDef.muted, background: i === 0 ? `${displayDef.primary}0d` : 'transparent', borderLeft: `2px solid ${i === 0 ? displayDef.primary : 'transparent'}` }}>{item}</div>
                ))}
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 7, letterSpacing: 3, color: displayDef.muted, padding: '12px 12px 8px' }}>SYSTEM</div>
                {['DB Monitor','Mail','🎨 Themes'].map(item => (
                  <div key={item} style={{ padding: '7px 12px', fontFamily: 'var(--font-mono)', fontSize: 10, color: item.includes('Themes') ? displayDef.primary : displayDef.muted }}>{item}</div>
                ))}
              </div>
              <div style={{ flex: 1, padding: '18px 22px', overflow: 'hidden' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: displayDef.secondary, letterSpacing: 3, marginBottom: 4 }}>OVERVIEW</div>
                <div style={{ fontFamily: 'sans-serif', fontSize: 20, fontWeight: 700, color: displayDef.text, marginBottom: 14 }}>Dashboard</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 14 }}>
                  {[['Posts','24',displayDef.primary],['Views','1.2k',displayDef.secondary],['Staff','3',displayDef.orange],['Msgs','9','#a78bfa']].map(([label, val, color]) => (
                    <div key={label} style={{ background: displayDef.bg3, border: `1px solid ${displayDef.border}`, padding: '10px', borderRadius: 4 }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 7, color: displayDef.muted, letterSpacing: 2, marginBottom: 4 }}>{label}</div>
                      <div style={{ fontFamily: 'sans-serif', fontSize: 20, fontWeight: 800, color, lineHeight: 1 }}>{val}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div style={{ background: displayDef.bg2, border: `1px solid ${displayDef.border}`, padding: 12, borderRadius: 4 }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 7, color: displayDef.muted, letterSpacing: 2, marginBottom: 8 }}>RECENT POSTS</div>
                    {['Intro to React','CSS Deep Dive','TypeScript Tips'].map(post => (
                      <div key={post} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                        <div style={{ width: 5, height: 5, borderRadius: '50%', background: displayDef.primary, flexShrink: 0 }} />
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: displayDef.text }}>{post}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ background: displayDef.bg2, border: `1px solid ${displayDef.border}`, padding: 12, borderRadius: 4 }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 7, color: displayDef.muted, letterSpacing: 2, marginBottom: 8 }}>QUICK ACTIONS</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                      {[['New Post',displayDef.primary],['Media',displayDef.secondary],['Staff',displayDef.orange],['Settings',displayDef.muted]].map(([btn, color]) => (
                        <div key={btn} style={{ padding: '6px 8px', background: displayDef.bg3, border: `1px solid ${displayDef.border}`, borderRadius: 3, fontFamily: 'var(--font-mono)', fontSize: 8, color }}>{btn}</div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Apply footer */}
          <div style={{ marginTop: 16, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            {displayId !== theme ? (
              <>
                <button onClick={() => applyTheme(displayId)} style={{
                  fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, padding: '11px 28px', fontWeight: 800,
                  background: `linear-gradient(135deg, ${displayDef.primary}, ${displayDef.secondary})`,
                  border: 'none', color: '#000', cursor: 'pointer', borderRadius: 6, transition: 'all 0.15s',
                  boxShadow: `0 0 20px ${displayDef.primary}44`,
                }}>✅ APPLY "{displayDef.name.toUpperCase()}"</button>
                <button onClick={() => setPreviewTheme(null)} style={{
                  fontFamily: 'var(--font-mono)', fontSize: 9, padding: '9px 16px',
                  background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer', borderRadius: 6,
                }}>CANCEL PREVIEW</button>
              </>
            ) : (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', padding: '10px 16px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 6 }}>
                ? <span style={{ color: currentDef.primary }}>{currentDef.name}</span> is already the active theme
              </div>
            )}
          </div>
        </div>
      )}
      {/* -- COMPARE TAB -- */}
      {activeTab === 'compare' && (
        <div>
          <div style={{ marginBottom: 16, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', lineHeight: 1.8 }}>
            Pick two themes to compare side-by-side. Click <strong style={{ color: 'var(--green)' }}>A</strong> or <strong style={{ color: 'var(--cyan)' }}>B</strong> to assign a slot, then see them rendered together.
          </div>
          {/* Selector row */}
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 20 }}>
            {THEME_DEFS.map(t => {
              const isA = compareA === t.id
              const isB = compareB === t.id
              return (
                <div key={t.id} style={{ display: 'flex', gap: 2 }}>
                  <button onClick={() => setCompareA(t.id)} style={{
                    fontFamily: 'var(--font-mono)', fontSize: 8, padding: '3px 7px', cursor: 'pointer', borderRadius: '3px 0 0 3px',
                    background: isA ? `${t.primary}22` : 'var(--bg2)', border: `1px solid ${isA ? t.primary : 'var(--border)'}`,
                    color: isA ? t.primary : 'var(--muted)', transition: 'all 0.15s',
                  }}>A</button>
                  <button onClick={() => setCompareB(t.id)} style={{
                    fontFamily: 'var(--font-mono)', fontSize: 8, padding: '3px 7px', cursor: 'pointer', borderRadius: '0 3px 3px 0',
                    background: isB ? `${t.secondary}22` : 'var(--bg2)', border: `1px solid ${isB ? t.secondary : 'var(--border)'}`,
                    color: isB ? t.secondary : 'var(--muted)', transition: 'all 0.15s',
                    borderLeft: 'none',
                  }}>B</button>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: isA || isB ? t.primary : 'var(--muted)', padding: '3px 6px', background: 'var(--bg2)', border: '1px solid var(--border)', borderLeft: 'none', borderRadius: '0 3px 3px 0', letterSpacing: 1 }}>{t.name}</span>
                </div>
              )
            })}
          </div>

          {(!compareA || !compareB) ? (
            <div style={{ padding: 40, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', border: '1px dashed var(--border)', borderRadius: 8 }}>
              {!compareA && !compareB ? 'ℹ️ Select A and B themes above to compare' : !compareA ? 'ℹ️ Select theme A' : 'ℹ️ Select theme B'}
            </div>
          ) : (() => {
            const defA = THEME_DEFS.find(t => t.id === compareA)
            const defB = THEME_DEFS.find(t => t.id === compareB)
            const MiniCard = ({ def, slot, slotColor }) => (
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 2, padding: '3px 10px', background: `${slotColor}18`, border: `1px solid ${slotColor}44`, color: slotColor, borderRadius: 4 }}>{slot}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: def.primary }}>{def.name}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 7, color: 'var(--muted)' }}>{def.tag}  {def.type}</span>
                </div>
                {/* Mini mockup */}
                <div style={{ background: def.bg, border: `2px solid ${slotColor}33`, borderRadius: 8, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', padding: '8px 14px', background: def.bg2, borderBottom: `1px solid ${def.border}`, gap: 10 }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: def.primary, letterSpacing: 2 }}>AIFAZI</div>
                    {['Home','Blog','Admin'].map(n => <span key={n} style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: def.muted }}>{n}</span>)}
                  </div>
                  <div style={{ display: 'flex', minHeight: 200 }}>
                    <div style={{ width: 110, background: def.bg2, borderRight: `1px solid ${def.border}`, padding: '10px 0' }}>
                      {['Dashboard','Posts','Media','Settings'].map((item, i) => (
                        <div key={item} style={{ padding: '6px 10px', fontFamily: 'var(--font-mono)', fontSize: 9, color: i === 0 ? def.primary : def.muted, background: i === 0 ? `${def.primary}10` : 'transparent', borderLeft: `2px solid ${i === 0 ? def.primary : 'transparent'}` }}>{item}</div>
                      ))}
                    </div>
                    <div style={{ flex: 1, padding: '14px 16px' }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 7, color: def.secondary, letterSpacing: 3, marginBottom: 4 }}>OVERVIEW</div>
                      <div style={{ fontFamily: 'sans-serif', fontSize: 16, fontWeight: 700, color: def.text, marginBottom: 10 }}>Dashboard</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
                        {[[def.primary,'24'],[def.secondary,'1.2k']].map(([color, val], idx2) => (
                          <div key={idx2} style={{ background: def.bg3, border: `1px solid ${def.border}`, padding: 8, borderRadius: 4, borderTop: `2px solid ${color}` }}>
                            <div style={{ fontSize: 16, fontWeight: 800, color, fontFamily: 'sans-serif' }}>{val}</div>
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 7, color: def.muted }}>{['Posts','Views'][idx2]}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{ display: 'flex', gap: 5 }}>
                        <div style={{ flex: 1, padding: '6px 8px', background: def.primary, borderRadius: 3, fontFamily: 'var(--font-mono)', fontSize: 8, color: '#000', textAlign: 'center' }}>New Post</div>
                        <div style={{ flex: 1, padding: '6px 8px', background: def.bg3, border: `1px solid ${def.border}`, borderRadius: 3, fontFamily: 'var(--font-mono)', fontSize: 8, color: def.muted, textAlign: 'center' }}>Media</div>
                      </div>
                    </div>
                  </div>
                </div>
                {/* Palette */}
                <div style={{ marginTop: 10, display: 'flex', gap: 5, alignItems: 'center' }}>
                  {[def.bg, def.bg2, def.bg3, def.primary, def.secondary, def.orange, def.text, def.muted].map((c, i) => (
                    <div key={i} title={c} style={{ width: 18, height: 18, borderRadius: 4, background: c, border: '1px solid rgba(255,255,255,0.08)' }} />
                  ))}
                </div>
                {/* Apply */}
                <button onClick={() => applyTheme(def.id)} disabled={theme === def.id}
                  style={{ marginTop: 10, width: '100%', fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 2, padding: '8px',
                    background: theme === def.id ? 'color-mix(in srgb, var(--green) 8%, transparent)' : `linear-gradient(135deg, ${def.primary}, ${def.secondary})`,
                    border: `1px solid ${def.primary}44`, color: theme === def.id ? 'var(--green)' : '#000', cursor: theme === def.id ? 'default' : 'pointer', borderRadius: 5, fontWeight: 700 }}>
                  {theme === def.id ? '✅ ACTIVE' : `APPLY ${def.name.toUpperCase()}`}
                </button>
              </div>
            )
            return (
              <div style={{ display: 'flex', gap: 16 }}>
                <MiniCard def={defA} slot="A" slotColor="var(--green)" />
                <div style={{ width: 1, background: 'var(--border)', flexShrink: 0 }} />
                <MiniCard def={defB} slot="B" slotColor="var(--cyan)" />
              </div>
            )
          })()}
        </div>
      )}
      {/* -- FAVORITES TAB -- */}
      {activeTab === 'favorites' && (
        <div>
          {favorites.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', lineHeight: 2 }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>⭐</div>
              No favorites yet  hover a theme card and click ? to save it here.
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', letterSpacing: 2 }}>
                  {favorites.length} SAVED THEME{favorites.length > 1 ? 'S' : ''}
                </span>
                <button onClick={() => { setFavorites([]); try { localStorage.removeItem('tl_favorites') } catch {} }}
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 1, padding: '3px 8px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer', borderRadius: 3 }}>
                  CLEAR ALL
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
                {THEME_DEFS.filter(t => favorites.includes(t.id)).map(t => {
                  const isActive   = theme === t.id
                  const ts = tagStyle(t.tag)
                  return (
                    <div key={t.id} className="tl-card"
                      onClick={() => handleApply(t.id)}
                      onMouseEnter={() => setPreviewTheme(t.id)}
                      onMouseLeave={() => setPreviewTheme(null)}
                      style={{
                        background: t.bg2, overflow: 'hidden', borderRadius: 10, cursor: 'pointer',
                        border: `2px solid ${isActive ? t.primary : 'rgba(255,255,255,0.06)'}`,
                        transition: 'border-color 0.2s, transform 0.15s, box-shadow 0.2s',
                        boxShadow: isActive ? `0 0 22px ${t.primary}44` : '0 2px 12px rgba(0,0,0,0.3)',
                      }}
                    >
                      <div style={{ padding: '10px 14px 8px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: `1px solid ${t.border}` }}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {[t.bg, t.primary, t.secondary, t.orange].map((c, i) => (
                            <div key={i} style={{ width: 14, height: 14, borderRadius: 3, background: c, border: '1px solid rgba(255,255,255,0.08)' }} />
                          ))}
                        </div>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: t.primary, flex: 1 }}>{t.name}</span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 7, letterSpacing: 2, padding: '2px 6px', background: ts.bg, border: `1px solid ${ts.border}`, color: ts.color, borderRadius: 3 }}>{t.tag}</span>
                        <button onClick={e => { e.stopPropagation(); toggleFav(t.id) }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: 2 }}>⭐</button>
                      </div>
                      <div style={{ padding: '8px 14px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: t.muted }}>{t.desc}</span>
                        {isActive
                          ? <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: t.primary }}>✅ ACTIVE</span>
                          : <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: t.muted }}>🖱 Click to apply</span>
                        }
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* -- CUSTOM BUILDER TAB -- */}
      {activeTab === 'builder' && (
        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 24, alignItems: 'start' }}>
          {/* Controls */}
          <div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--cyan)', letterSpacing: 3, marginBottom: 6 }}>CUSTOM THEME BUILDER</div>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', lineHeight: 1.7, margin: 0 }}>
                Craft your own theme. Copy the exported CSS variables into your <code style={{ color: 'var(--green)' }}>index.css</code>.
              </p>
            </div>

            {/* Name */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', letterSpacing: 2, marginBottom: 6 }}>THEME NAME</div>
              <input value={custom.name} onChange={e => setCustom(p => ({ ...p, name: e.target.value, id: e.target.value.toLowerCase().replace(/\s+/g, '-') }))}
                style={{ width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)', outline: 'none', padding: '7px 10px', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text)', borderRadius: 4, boxSizing: 'border-box' }} />
            </div>

            {/* Colors */}
            <div style={{ padding: '14px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', letterSpacing: 2, marginBottom: 12 }}>COLOR PALETTE</div>
              {[
                ['bg',        'Background'],
                ['bg2',       'Surface'],
                ['bg3',       'Elevated'],
                ['primary',   'Primary'],
                ['secondary', 'Secondary'],
                ['orange',    'Accent'],
                ['text',      'Text'],
                ['muted',     'Muted'],
              ].map(([key, label]) => (
                <ColorRow key={key} label={label} value={custom[key]}
                  onChange={v => setCustom(p => ({ ...p, [key]: v }))} />
              ))}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
              <button onClick={() => applyTheme(custom.id)} style={{
                flex: 1, fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2, padding: '10px 16px',
                background: `linear-gradient(135deg, ${custom.primary}, ${custom.secondary})`,
                border: 'none', color: '#000', cursor: 'pointer', borderRadius: 6, fontWeight: 800,
              }}>✅ APPLY PREVIEW</button>
              <button onClick={exportCustom} style={{
                flex: 1, fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2, padding: '10px 16px',
                background: exported ? 'color-mix(in srgb, var(--green) 12%, transparent)' : 'transparent',
                border: `1px solid ${exported ? 'var(--green)' : 'var(--border)'}`,
                color: exported ? 'var(--green)' : 'var(--muted)', cursor: 'pointer', borderRadius: 6,
              }}>{exported ? '✅ COPIED' : '⬇️ EXPORT CSS'}</button>
              <button onClick={exportCustomJSON} style={{
                fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1, padding: '10px 14px',
                background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer', borderRadius: 6,
              }}>{ '{}'} JSON</button>
              <button onClick={() => setCustom(DEFAULT_CUSTOM)} style={{
                fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1, padding: '10px 14px',
                background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer', borderRadius: 6,
              }}>?</button>
            </div>
          </div>

          {/* Live preview of custom theme */}
          <div style={{ background: custom.bg, border: `2px solid ${custom.primary}44`, borderRadius: 12, overflow: 'hidden', boxShadow: `0 12px 48px rgba(0,0,0,0.5), 0 0 40px ${custom.primary}18` }}>
            {/* Mockup nav */}
            <div style={{ display: 'flex', alignItems: 'center', padding: '10px 20px', background: custom.bg2, borderBottom: `1px solid ${custom.border}`, gap: 16 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: custom.primary, letterSpacing: 2 }}>AIFAZI</div>
              <div style={{ flex: 1, display: 'flex', gap: 16 }}>
                {['Home', 'Blog', 'Tools', 'Forum'].map(n => <span key={n} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: custom.muted }}>{n}</span>)}
              </div>
              <div style={{ width: 26, height: 26, borderRadius: '50%', background: `${custom.primary}22`, border: `1px solid ${custom.primary}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>⭐</div>
            </div>
            {/* Mockup content */}
            <div style={{ display: 'flex', minHeight: 280 }}>
              <div style={{ width: 140, background: custom.bg2, borderRight: `1px solid ${custom.border}`, padding: '12px 0' }}>
                {['Dashboard', 'Posts', 'Media', 'Settings'].map((item, i) => (
                  <div key={item} style={{ padding: '7px 12px', fontFamily: 'var(--font-mono)', fontSize: 10, color: i === 0 ? custom.primary : custom.muted, background: i === 0 ? `${custom.primary}10` : 'transparent', borderLeft: `2px solid ${i === 0 ? custom.primary : 'transparent'}` }}>{item}</div>
                ))}
              </div>
              <div style={{ flex: 1, padding: '18px 20px' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: custom.secondary, letterSpacing: 3, marginBottom: 4 }}>OVERVIEW</div>
                <div style={{ fontFamily: 'sans-serif', fontSize: 20, fontWeight: 700, color: custom.text, marginBottom: 14 }}>Dashboard</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>
                  {[[custom.primary, '24'], [custom.secondary, '1.2k'], [custom.orange, '9']].map(([color, val], idx) => (
                    <div key={idx} style={{ background: custom.bg3, border: `1px solid ${custom.border}`, padding: 10, borderRadius: 6 }}>
                      <div style={{ fontSize: 18, fontWeight: 800, color, fontFamily: 'sans-serif' }}>{val}</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: custom.muted, letterSpacing: 1 }}>{['Posts', 'Views', 'Msgs'][idx]}</div>
                    </div>
                  ))}
                </div>
                <div style={{ background: custom.bg2, border: `1px solid ${custom.border}`, borderRadius: 6, padding: 12 }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: custom.muted, letterSpacing: 2, marginBottom: 8 }}>QUICK ACTIONS</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {['New Post', 'Upload', 'Settings'].map(btn => (
                      <div key={btn} style={{ flex: 1, padding: '7px 8px', borderRadius: 4, background: custom.bg3, border: `1px solid ${custom.border}`, fontFamily: 'var(--font-mono)', fontSize: 9, color: custom.primary, textAlign: 'center' }}>{btn}</div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            {/* Color swatch footer */}
            <div style={{ padding: '10px 20px', background: custom.bg2, borderTop: `1px solid ${custom.border}`, display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: custom.muted, letterSpacing: 2 }}>PALETTE:</span>
              {[custom.bg, custom.bg2, custom.bg3, custom.primary, custom.secondary, custom.orange, custom.text].map((c, i) => (
                <div key={i} title={c} style={{ width: 18, height: 18, borderRadius: 4, background: c, border: '1px solid rgba(255,255,255,0.1)', flexShrink: 0 }} />
              ))}
              <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 9, color: custom.primary, fontWeight: 700 }}>{custom.name}</span>
            </div>
          </div>
        </div>
      )}

      {/* ── FRAMEWORK TAB ── */}
      {activeTab === 'framework' && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {/* Status pills — show active values; saving spinner when busy */}
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 24 }}>
            {FRAMEWORK_CATEGORIES.map(cat => {
              const val = fwDraft[cat.configKey]
              return (
                <button key={cat.id} onClick={() => handleFwNav(cat.id)} style={{ fontFamily: _FM, fontSize: 8, letterSpacing: 1, padding: '5px 12px', borderRadius: 99, cursor: 'pointer', background: fwActive === cat.id ? `${cat.color}18` : 'transparent', border: `1px solid ${fwActive === cat.id ? cat.color + '66' : _BD}`, color: fwActive === cat.id ? cat.color : _MT, display: 'flex', alignItems: 'center', gap: 5, transition: 'all 0.15s' }}>
                  <span style={{ fontSize: 12 }}>{cat.icon}</span>
                  <span>{val}</span>
                  {fwSaving && <span style={{ fontSize: 10 }}>⏳</span>}
                </button>
              )
            })}
          </div>

          {/* Two-column body */}
          <div style={{ display: 'flex', gap: 32 }}>
            {/* Nav rail — desktop only */}
            {!isMobile && (
              <div style={{ position: 'sticky', top: 0, alignSelf: 'flex-start' }}>
                <FwNavRail active={fwActive} onNav={handleFwNav} draft={fwDraft} siteConfig={siteConfig} />
              </div>
            )}

            {/* Content — single active category */}
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* Mobile tab strip */}
              {isMobile && (
                <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 20, paddingBottom: 4 }}>
                  {FRAMEWORK_CATEGORIES.map(cat => {
                    const isActive = cat.id === fwActive
                    return <button key={cat.id} onClick={() => handleFwNav(cat.id)} style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 99, border: `1px solid ${isActive ? cat.color + '66' : _BD}`, background: isActive ? `${cat.color}16` : _BG3, color: isActive ? cat.color : _MT, fontFamily: _FM, fontSize: 9, cursor: 'pointer', whiteSpace: 'nowrap' }}><span>{cat.icon}</span><span>{cat.label}</span></button>
                  })}
                </div>
              )}
              {FRAMEWORK_CATEGORIES.map(cat => (
                <div key={cat.id} style={{ display: cat.id === fwActive ? 'block' : 'none' }}>
                  <FwCategorySection cat={cat} draft={fwDraft} onSelect={handleFwSelectAndSave} isUnsaved={fwSaving} />

                  {/* Position picker — notify section only */}
                  {cat.id === 'notify' && (
                    <div style={{ marginBottom: 40 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
                        <div style={{ width:38, height:38, borderRadius:8, background:'rgba(255,107,53,0.12)', border:'1px solid rgba(255,107,53,0.3)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>📍</div>
                        <div>
                          <div style={{ fontFamily:_FD, fontSize:17, fontWeight:700, color:_TX }}>Toast Position</div>
                          <div style={{ fontFamily:_FM, fontSize:9, color:_MT, marginTop:1 }}>Where notifications appear on screen</div>
                        </div>
                      </div>
                      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                        {NOTIFY_POSITIONS.map(pos => {
                          const isActive = (fwDraft.notifyPosition || 'bottom-right') === pos.id
                          return (
                            <button key={pos.id} onClick={() => handleFwSelectAndSave('notifyPosition', pos.id)} style={{
                              display:'flex', alignItems:'center', gap:7, padding:'9px 16px',
                              background: isActive ? 'rgba(255,107,53,0.1)' : _BG2,
                              border: `2px solid ${isActive ? 'rgba(255,107,53,0.6)' : _BD}`,
                              borderRadius:8, cursor:'pointer', transition:'all 0.15s',
                              boxShadow: isActive ? '0 0 12px rgba(255,107,53,0.2)' : 'none',
                            }}>
                              <span style={{ fontSize:16 }}>{pos.icon}</span>
                              <div style={{ textAlign:'left' }}>
                                <div style={{ fontFamily:_FM, fontSize:10, fontWeight:700, color: isActive ? 'rgba(255,107,53,0.9)' : _TX, letterSpacing:0.5 }}>{pos.label}</div>
                              </div>
                              {isActive && <span style={{ marginLeft:4, fontFamily:_FM, fontSize:8, color:'rgba(255,107,53,0.9)' }}>✓</span>}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Reset zone */}
              <div style={{ borderTop: `1px solid ${_BD}`, paddingTop: 24, marginTop: 8, marginBottom: 40 }}>
                <div style={{ fontFamily: _FM, fontSize: 8, letterSpacing: 3, color: 'rgba(255,71,87,0.7)', marginBottom: 12 }}>RESET</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontFamily: _FD, fontSize: 14, fontWeight: 600, color: _TX, marginBottom: 2 }}>Reset to Factory Defaults</div>
                    <div style={{ fontFamily: _FM, fontSize: 9, color: _MT }}>Restore all framework styles to defaults: cyber menus, cyber dialogs, cyber inputs and cyber-grid surfaces.</div>
                  </div>
                  <button onClick={handleFwReset} style={{ flexShrink: 0, fontFamily: _FM, fontSize: 10, letterSpacing: 1, padding: '8px 18px', background: 'transparent', border: '1px solid rgba(255,71,87,0.4)', color: 'var(--red)', cursor: 'pointer', borderRadius: 6 }}>↺ RESET DEFAULTS</button>
                </div>
              </div>
            </div>
          </div>

          {/* Saving indicator replaces old sticky save bar */}
          {fwSaving && (
            <div style={{ position: 'sticky', bottom: 0, zIndex: 50, padding: '10px 0 4px', background: `linear-gradient(0deg, ${_BG} 60%, transparent)`, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: _FM, fontSize: 10, color: _G }}>● Saving…</span>
            </div>
          )}

          {/* Keyframes */}
          <style>{`
            @keyframes fwSpin   { to { transform: rotate(360deg) } }
            @keyframes fwGlitch { 0%{transform:translate(0)} 30%{transform:translate(-3px,1px)} 60%{transform:translate(3px,-1px)} 90%{transform:translate(0)} }
            @keyframes fwBounce { from{transform:translateY(0)} to{transform:translateY(-6px)} }
            @keyframes fwPulse  { 0%,100%{transform:scale(1);opacity:0.45} 50%{transform:scale(1.18);opacity:1} }
            @keyframes fwWave   { 0%,100%{height:3px;opacity:0.4} 50%{height:20px;opacity:1} }
            @keyframes fwNeon   { 0%,100%{opacity:1;text-shadow:0 0 8px #00ff88,0 0 20px #00ff88} 45%{opacity:0.1;text-shadow:none} 50%{opacity:1;text-shadow:0 0 8px #00ff88,0 0 20px #00ff88} }
            @keyframes fwBlink  { 0%,100%{opacity:1} 50%{opacity:0} }
          `}</style>
        </div>
      )}

      {/* -- BACKGROUNDS TAB (Animation + Grid) -- */}
      {activeTab === 'backgrounds' && (() => {
        const cardBtn = (p, active, previewClass, onSelect) => (
          <button key={p.id} onClick={() => { if (!savingBg) onSelect(p.id) }} disabled={savingBg}
            className="bg-card-btn"
            style={{ padding: 0, background: active ? 'color-mix(in srgb, var(--green) 7%, transparent)' : 'var(--bg2)', border: `2px solid ${active ? 'var(--green)' : 'var(--border)'}`, boxShadow: active ? '0 0 12px color-mix(in srgb, var(--green) 20%, transparent)' : 'none', cursor: savingBg ? 'wait' : 'pointer', borderRadius: 8, overflow: 'hidden', transition: 'all 0.15s', textAlign: 'center' }}>
            <div className={`${previewClass} ${p.id}`} style={{ background: 'var(--bg)', borderBottom: `1px solid ${active ? 'color-mix(in srgb, var(--green) 30%, transparent)' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {p.id === 'none' && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 20, color: 'var(--muted)', opacity: 0.3 }}>—</span>}
              {p.id === 'clean' && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 20, color: 'var(--muted)', opacity: 0.3 }}>—</span>}
            </div>
            <div style={{ padding: '7px 6px 8px' }}>
              <div style={{ fontSize: 20, marginBottom: 2, lineHeight: 1.2 }}>{p.icon}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, letterSpacing: 1, color: active ? 'var(--green)' : 'var(--text)', marginBottom: 2 }}>{p.name}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 7, color: 'var(--muted)', lineHeight: 1.4 }}>{p.desc}</div>
            </div>
            {active && <div style={{ height: 2, background: 'var(--green)' }} />}
          </button>
        )

        return (
          <div>
            {/* ---- Background Animation ---- */}
            <div style={{ marginBottom: 20, padding: '14px 18px', background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.25)', borderRadius: 8, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <span style={{ fontSize: 22, flexShrink: 0 }}>🎨</span>
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--purple, #a855f7)', letterSpacing: 1, marginBottom: 4 }}>BACKGROUND ANIMATION</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', lineHeight: 1.7 }}>
                  An animated backdrop behind the grid overlay. These are purely decorative CSS effects — zero JavaScript overhead.
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10, marginBottom: 36 }}>
              {ANIMATION_PATTERNS.map(p => cardBtn(p, bgAnimation === p.id, 'bp-preview', handleAnimationSelect))}
            </div>

            {/* ---- Grid Overlay ---- */}
            <div style={{ marginBottom: 20, padding: '14px 18px', background: 'color-mix(in srgb, var(--cyan) 6%, transparent)', border: '1px solid color-mix(in srgb, var(--cyan) 25%, transparent)', borderRadius: 8, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <span style={{ fontSize: 22, flexShrink: 0 }}>▦</span>
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--cyan)', letterSpacing: 1, marginBottom: 4 }}>GRID OVERLAY</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', lineHeight: 1.7 }}>
                  A static overlay pattern drawn on top of the background animation. Choose <strong style={{ color: 'var(--text)' }}>Grid</strong> for the classic square grid or <strong style={{ color: 'var(--text)' }}>None</strong> to remove it.
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
              {GRID_PATTERNS.map(p => cardBtn(p, gridPattern === p.id, 'gp-preview', handleGridSelect))}
            </div>

            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              {savingBg
                ? <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--cyan)' }}>⏳ Applying…</div>
                : <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)' }}>✅ Changes are saved and applied automatically when selected.</div>
              }
            </div>
          </div>
        )
      })()}

      {/* -- GLOBAL SETTINGS TAB -- */}
      {activeTab === 'global' && (() => {
        const setGA = (k, v) => autoSaveGlobalAppearance({ ...gAppearance, [k]: v })
        const T = {
          card:  { background: 'var(--bg2)', border: '1px solid var(--border)', padding: '22px', marginBottom: 20, borderRadius: 12 },
          sec:   { fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 3, color: 'var(--muted)', marginBottom: 16, paddingBottom: 10, borderBottom: '1px solid var(--border)' },
          label: { fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 2, color: 'var(--muted)', marginBottom: 6, display: 'block' },
          sub:   { fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', marginTop: 4, lineHeight: 1.5 },
          row:   { display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 },
        }

        return (
          <div>
            {/* Info banner */}
            <div style={{ marginBottom: 20, padding: '14px 18px', background: 'color-mix(in srgb, var(--cyan) 6%, transparent)', border: '1px solid color-mix(in srgb, var(--cyan) 25%, transparent)', borderRadius: 8, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <span style={{ fontSize: 22, flexShrink: 0 }}>⭐</span>
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--cyan)', letterSpacing: 1, marginBottom: 4 }}>GLOBAL APPEARANCE  affects every visitor</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', lineHeight: 1.7 }}>
                  Changes here are saved to the backend and apply site-wide. Individual user theme preferences are only overridden when "Lock Theme" is enabled.
                  To change site identity, social links or maintenance settings use the <strong style={{ color: 'var(--text)' }}>Site Settings</strong> panel.
                </div>
              </div>
            </div>

            {/* -- Global Theme ------------------------------------------------ */}
            <div style={T.card}>
              <div style={T.sec}>GLOBAL DEFAULT THEME</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', marginBottom: 12, lineHeight: 1.6 }}>
                Sets the default theme shown to all new visitors. Select <em>user's choice</em> to let each visitor pick their own.
                {globalThemeId && <span style={{ color: 'var(--cyan)', marginLeft: 8 }}>Currently: <strong>{THEME_DEFS.find(t=>t.id===globalThemeId)?.name || globalThemeId}</strong></span>}
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                <button
                  onClick={() => { setGlobalThemeId(''); applyGlobalTheme('__clear__') }}
                  style={{ padding: '5px 12px', fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 1, cursor: 'pointer', transition: 'all 0.15s', background: !globalThemeId ? 'color-mix(in srgb, var(--green) 15%, transparent)' : 'var(--bg3)', border: `1px solid ${!globalThemeId ? 'var(--green)' : 'var(--border)'}`, color: !globalThemeId ? 'var(--green)' : 'var(--muted)', borderRadius: 4 }}
                >user's choice</button>
                {THEME_DEFS.map(t => {
                  const active = globalThemeId === t.id
                  return (
                    <button key={t.id} onClick={() => applyGlobalTheme(t.id)}
                      disabled={savingGlobal === t.id}
                      style={{ padding: '5px 12px', fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 1, cursor: savingGlobal === t.id ? 'wait' : 'pointer', transition: 'all 0.15s', background: active ? `${t.primary}20` : 'var(--bg3)', border: `1px solid ${active ? t.primary : 'var(--border)'}`, color: active ? t.primary : 'var(--muted)', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 5 }}
                    >
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: t.primary, flexShrink: 0 }} />
                      {t.name}
                      {savingGlobal === t.id && <span style={{ opacity: 0.6 }}></span>}
                      {active && <span style={{ fontSize: 8, opacity: 0.7 }}>?</span>}
                    </button>
                  )
                })}
              </div>

              {/* Lock theme toggle */}
              <div style={{ ...T.row, paddingTop: 14, borderTop: '1px solid var(--border)', marginTop: 4 }}>
                <Toggle on={!!gAppearance.lockTheme} onChange={() => setGA('lockTheme', !gAppearance.lockTheme)} color="var(--cyan)" />
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text)' }}>Lock Theme</div>
                  <div style={T.sub}>When ON, the global theme overrides individual preferences  no one can change it.</div>
                </div>
              </div>

              {/* Follow OS Theme toggle */}
              <div style={{ ...T.row, paddingTop: 14, borderTop: '1px solid var(--border)', marginTop: 4 }}>
                <Toggle on={!!gAppearance.followOsTheme} onChange={() => setGA('followOsTheme', !gAppearance.followOsTheme)} color="var(--purple)" />
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text)' }}>Follow OS Theme</div>
                  <div style={T.sub}>Auto-switches visitor theme with system dark/light preference. Ignored when Lock Theme is ON.</div>
                </div>
              </div>

              {/* Roaming Robot toggle */}
              <div style={{ ...T.row, paddingTop: 14, borderTop: '1px solid var(--border)', marginTop: 4 }}>
                <Toggle
                  on={gAppearance.showRoamingRobot !== false}
                  onChange={() => setGA('showRoamingRobot', !( gAppearance.showRoamingRobot !== false))}
                  color="var(--green)"
                />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text)' }}>🤖 Roaming Robot</div>
                    {gAppearance.showRoamingRobot !== false
                      ? <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 1, padding: '1px 6px', background: 'color-mix(in srgb, var(--green) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--green) 30%, transparent)', color: 'var(--green)', borderRadius: 3 }}>ACTIVE</span>
                      : <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 1, padding: '1px 6px', background: 'rgba(112,112,160,0.1)', border: '1px solid rgba(112,112,160,0.3)', color: 'var(--muted)', borderRadius: 3 }}>HIDDEN</span>
                    }
                  </div>
                  <div style={T.sub}>
                    The animated robot that roams public pages. Uses <code style={{ color: 'var(--cyan)', fontSize: 9 }}>requestAnimationFrame</code> + direct DOM updates — 
                    no React re-renders per frame. CSS-only animations (GPU-accelerated). Minimal performance impact on modern devices.
                    Disable if you notice lag on low-end or mobile devices.
                  </div>
                </div>
              </div>
            </div>

            {/* -- Loading Screen & Animations ------------------------------- */}
            <div style={T.card}>
              <div style={T.sec}>LOADING SCREEN & ANIMATIONS</div>

              {/* Loading Screen Style  card grid */}
              <label style={{ ...T.label, marginBottom: 10 }}>LOADING SCREEN STYLE</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10, marginBottom: 6 }}>
                {[
                  { id: 'terminal', label: 'Terminal',  icon: '>_',   desc: 'Boot sequence',      preview: 'terminal' },
                  { id: 'minimal',  label: 'Minimal',   icon: '○',    desc: 'Clean spinner',      preview: 'minimal'  },
                  { id: 'glitch',   label: 'Glitch',    icon: '',   desc: 'Glitch text',        preview: 'glitch'   },
                  { id: 'splash',   label: 'Splash',    icon: '○',    desc: 'Brand reveal',       preview: 'splash'   },
                  { id: 'matrix',   label: 'Matrix',    icon: '○',    desc: 'Matrix rain',        preview: 'matrix'   },
                  { id: 'pulse',    label: 'Pulse',     icon: '○',    desc: 'Breathing ring',     preview: 'pulse'    },
                  { id: 'cyber',    label: 'Cyber',     icon: '○',    desc: 'Hex grid boot',      preview: 'cyber'    },
                  { id: 'bars',     label: 'Bars',      icon: '○',  desc: 'Progress bars',      preview: 'bars'     },
                  { id: 'wave',     label: 'Wave',      icon: '○',    desc: 'Wave sweep',         preview: 'wave'     },
                  { id: 'neon',     label: 'Neon',      icon: '○',    desc: 'Neon sign flicker',  preview: 'neon'     },
                ].map(s => {
                  const active = gAppearance.loadingScreenStyle === s.id
                  return (
                    <button key={s.id} className="ls-card" onClick={() => setGA('loadingScreenStyle', s.id)}
                      style={{ padding: 0, background: active ? 'color-mix(in srgb, var(--green) 7%, transparent)' : 'var(--bg2)', border: `2px solid ${active ? 'var(--green)' : 'var(--border)'}`, boxShadow: active ? '0 0 12px color-mix(in srgb, var(--green) 20%, transparent)' : 'none', textAlign: 'center', overflow: 'hidden' }}>
                      {/* Preview area */}
                      <div style={{ height: 64, background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden', borderBottom: `1px solid ${active ? 'color-mix(in srgb, var(--green) 30%, transparent)' : 'var(--border)'}` }}>
                        {s.id === 'terminal' && (
                          <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#33ff33', textAlign: 'left', padding: '0 6px' }}>
                            <div style={{ opacity: 0.6, fontSize: 9 }}>boot v2.1</div>
                            <div>{'>'}&nbsp;<span style={{ borderRight: '2px solid #33ff33', animation: 'miniBlink 1s step-end infinite', paddingRight: 2 }} /></div>
                          </div>
                        )}
                        {s.id === 'minimal' && (
                          <div style={{ width: 28, height: 28, border: '3px solid var(--bg3)', borderTopColor: 'var(--green)', borderRadius: '50%', animation: 'miniSpin 0.8s linear infinite' }} />
                        )}
                        {s.id === 'glitch' && (
                          <div style={{ position: 'relative', fontFamily: 'monospace', fontWeight: 900, fontSize: 18, color: '#fff', animation: 'miniGlitch 2.5s infinite' }}>
                            <span style={{ position: 'absolute', top: 0, left: 0, color: '#ff003c', animation: 'miniGlitchR 2.5s 0.05s infinite', mixBlendMode: 'screen' }}>AI</span>
                            <span style={{ position: 'absolute', top: 0, left: 0, color: '#00eaff', animation: 'miniGlitchR 2.5s 0.1s infinite', mixBlendMode: 'screen' }}>AI</span>
                            AI
                          </div>
                        )}
                        {s.id === 'splash' && (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                            <div style={{ fontSize: 22, animation: 'miniZoomIn 1.8s ease-out infinite alternate' }}>?</div>
                            <div style={{ fontFamily: 'monospace', fontSize: 8, letterSpacing: 3, color: 'var(--green)', animation: 'miniLetterPop 1.8s 0.3s ease-out infinite alternate' }}>AIFAZI</div>
                          </div>
                        )}
                        {s.id === 'matrix' && (
                          <div style={{ display: 'flex', gap: 3, fontFamily: 'monospace', fontSize: 10, color: '#00ff88' }}>
                            {['1','0','1','0','1'].map((c, i) => (
                              <span key={i} style={{ animation: `miniDotBounce 1.2s ${i * 0.15}s ease-in-out infinite`, display: 'inline-block' }}>{c}</span>
                            ))}
                          </div>
                        )}
                        {s.id === 'pulse' && (
                          <div style={{ position: 'relative', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid var(--green)', animation: 'lsPulse 1.4s ease-in-out infinite' }} />
                            <div style={{ position: 'absolute', inset: 8, borderRadius: '50%', border: '1px solid var(--cyan)', animation: 'lsPulse 1.4s 0.3s ease-in-out infinite' }} />
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--green)' }} />
                          </div>
                        )}
                        {s.id === 'cyber' && (
                          <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', width: 48, justifyContent: 'center' }}>
                            {[...Array(9)].map((_, i) => (
                              <div key={i} style={{ width: 12, height: 12, background: 'transparent', border: '1px solid var(--cyan)', borderRadius: 2, animation: `lsCyberHex 1.8s ${i * 0.12}s ease-in-out infinite` }} />
                            ))}
                          </div>
                        )}
                        {s.id === 'bars' && (
                          <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 30 }}>
                            {[0, 0.15, 0.3, 0.45, 0.6].map((delay, i) => (
                              <div key={i} style={{ width: 6, borderRadius: 2, background: i % 2 === 0 ? 'var(--green)' : 'var(--cyan)', animation: `lsBars 1.1s ${delay}s ease-in-out infinite` }} />
                            ))}
                          </div>
                        )}
                        {s.id === 'wave' && (
                          <div style={{ width: 54, height: 6, background: 'var(--bg3)', borderRadius: 3, overflow: 'hidden', position: 'relative' }}>
                            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: `linear-gradient(90deg, transparent, var(--green), var(--cyan), transparent)`, animation: 'lsWave 1.4s linear infinite' }} />
                          </div>
                        )}
                        {s.id === 'neon' && (
                          <div style={{ fontFamily: 'monospace', fontWeight: 900, fontSize: 14, letterSpacing: 3, color: 'var(--green)', animation: 'lsNeon 3s infinite' }}>NET</div>
                        )}
                      </div>
                      {/* Label row */}
                      <div style={{ padding: '7px 6px 8px' }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, letterSpacing: 1, color: active ? 'var(--green)' : 'var(--text)', marginBottom: 2 }}>{s.label}</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 7, color: 'var(--muted)', lineHeight: 1.4 }}>{s.desc}</div>
                      </div>
                    </button>
                  )
                })}
              </div>
              <div style={{ ...T.sub, marginBottom: 22 }}>Animation shown to every visitor on first load.</div>

              {/* Animation Preset  card grid */}
              <label style={{ ...T.label, marginBottom: 10 }}>ANIMATION PRESET</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10, marginBottom: 6 }}>
                {[
                  { id: 'smooth',     label: 'Smooth',     desc: '0.35s elegant ease',      dur: '0.35s ease',           anim: 'apSmooth 1.8s ease infinite alternate' },
                  { id: 'snappy',     label: 'Snappy',     desc: '0.12s fast & crisp',      dur: '0.12s',                anim: 'apSnappy 0.8s ease infinite alternate' },
                  { id: 'bouncy',     label: 'Bouncy',     desc: '0.45s spring effect',     dur: '0.45s spring',         anim: 'apBouncy 1.4s ease infinite alternate' },
                  { id: 'expressive', label: 'Expressive', desc: 'Bold dramatic motion',    dur: '0.5s expressive',      anim: 'apExpressive 2s ease infinite alternate' },
                  { id: 'reduced',    label: 'Reduced',    desc: 'Subtle, accessible',      dur: '0.2s',                 anim: 'apReduced 1.5s ease infinite alternate' },
                  { id: 'elastic',    label: 'Elastic',    desc: 'Overshoot & snap back',   dur: '0.5s elastic',         anim: 'apElastic 1.6s ease infinite alternate' },
                  { id: 'cinematic',  label: 'Cinematic',  desc: 'Slow, dramatic ease',     dur: '1.2s cinematic',       anim: 'apCinematic 2.4s ease infinite alternate' },
                  { id: 'none',       label: 'None',       desc: 'No animations at all',    dur: 'instant',              anim: null },
                ].map(a => {
                  const active = gAppearance.animationPreset === a.id
                  return (
                    <button key={a.id} className="ls-card" onClick={() => setGA('animationPreset', a.id)}
                      style={{ padding: 0, background: active ? 'color-mix(in srgb, var(--cyan) 7%, transparent)' : 'var(--bg2)', border: `2px solid ${active ? 'var(--cyan)' : 'var(--border)'}`, boxShadow: active ? '0 0 12px color-mix(in srgb, var(--cyan) 20%, transparent)' : 'none', textAlign: 'center', overflow: 'hidden' }}>
                      {/* Preview area */}
                      <div style={{ height: 64, background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: `1px solid ${active ? 'color-mix(in srgb, var(--cyan) 30%, transparent)' : 'var(--border)'}`, overflow: 'hidden' }}>
                        {a.id === 'none' ? (
                          <div style={{ fontFamily: 'monospace', fontSize: 22, color: 'var(--muted)', letterSpacing: 2 }}></div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, width: 60, animation: a.anim }}>
                            <div style={{ height: 8, background: active ? 'var(--cyan)' : 'var(--green)', borderRadius: 3, width: '100%', opacity: 0.85 }} />
                            <div style={{ height: 6, background: 'var(--muted)', borderRadius: 3, width: '75%', opacity: 0.5 }} />
                            <div style={{ height: 6, background: 'var(--muted)', borderRadius: 3, width: '55%', opacity: 0.35 }} />
                          </div>
                        )}
                      </div>
                      {/* Label row */}
                      <div style={{ padding: '7px 6px 8px' }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, letterSpacing: 1, color: active ? 'var(--cyan)' : 'var(--text)', marginBottom: 2 }}>{a.label}</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 7, color: 'var(--muted)', lineHeight: 1.4 }}>{a.desc}</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 7, color: active ? 'var(--cyan)' : 'var(--border)', marginTop: 2 }}>{a.dur}</div>
                      </div>
                    </button>
                  )
                })}
              </div>
              <div style={T.sub}>Controls motion intensity site-wide. "none" disables all transitions.</div>
            </div>

            {/* -- Header Style ---------------------------------------------- */}
            <div style={T.card}>
              <div style={T.sec}>HEADER STYLE</div>
              <p style={T.sub}>Navigation bar design shown to all visitors site-wide.</p>
              <div style={{ marginTop: 14 }}>
                <PresetPicker
                  presets={HEADER_PRESETS}
                  value={gAppearance.headerStyle}
                  onChange={v => setGA('headerStyle', v)}
                  renderPreview={id => <HeaderPreviewSVG id={id} />}
                  cols={4}
                />
              </div>
            </div>

            {/* -- Footer Style ---------------------------------------------- */}
            <div style={T.card}>
              <div style={T.sec}>FOOTER STYLE</div>
              <p style={T.sub}>Footer layout shown to all visitors site-wide.</p>
              <div style={{ marginTop: 14 }}>
                <PresetPicker
                  presets={FOOTER_PRESETS}
                  value={gAppearance.footerStyle}
                  onChange={v => setGA('footerStyle', v)}
                  renderPreview={id => <FooterPreviewSVG id={id} />}
                  cols={4}
                />
              </div>
            </div>

            {/* Auto-save indicator */}
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              {savingAppearance
                ? <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--cyan)' }}>⏳ Saving…</div>
                : <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)' }}>✅ Changes are saved automatically when you select an option above.</div>
              }
            </div>
          </div>
        )
      })()}
    </div>
  )
}

export default ThemeLibrary
