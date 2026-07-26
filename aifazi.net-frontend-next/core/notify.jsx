/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  NOTIFY SYSTEM — 5 styles: cyber · terminal · banner ·     ║
 * ║                             float · glitch                  ║
 * ║  Hook:        const { success } = useNotify()               ║
 * ║  Imperative:  notify.success('Done!')                       ║
 * ╚══════════════════════════════════════════════════════════════╝
 */
import { useState, useEffect, useCallback, useRef, createContext, useContext } from 'react'
import { t, VARIANTS, zIndex } from './tokens'

// ── Context ───────────────────────────────────────────────────────────────────
const NotifyContext = createContext(null)
export function useNotify() {
  const ctx = useContext(NotifyContext)
  if (!ctx) throw new Error('useNotify must be used inside <NotifyProvider>')
  return ctx
}

// ── Module-level live style override ─────────────────────────────────────────
// Updated synchronously via site-settings-updated events so new toasts
// always render in the correct style before React re-renders propagate.
let _liveNotifyStyle = ''

// ── Imperative singleton ──────────────────────────────────────────────────────
const _api = { add: null, dismiss: null }
export const notify = {
  success:  (msg, opts) => _api.add?.(msg, 'success', opts),
  error:    (msg, opts) => _api.add?.(msg, 'error',   opts),
  warning:  (msg, opts) => _api.add?.(msg, 'warning', opts),
  info:     (msg, opts) => _api.add?.(msg, 'info',    opts),
  announce: (msg, opts) => _api.add?.(msg, 'announce', opts),
  dismiss:  (id)        => _api.dismiss?.(id),
}

// ── Shared keyframes injected once ───────────────────────────────────────────
const KF = `
@keyframes ntfy-slideLeft  { from{transform:translateX(24px);opacity:0} to{transform:translateX(0);opacity:1} }
@keyframes ntfy-slideDown  { from{transform:translateY(-110%);opacity:0} to{transform:translateY(0);opacity:1} }
@keyframes ntfy-floatIn    { from{transform:translateY(14px) scale(.97);opacity:0} to{transform:translateY(0) scale(1);opacity:1} }
@keyframes ntfy-glitchIn   { from{clip-path:polygon(0 0,100% 0,100% 0,0 0)} to{clip-path:polygon(0 0,100% 0,100% 100%,0 100%)} }
@keyframes ntfy-fadeOut    { from{opacity:1;transform:translateX(0)} to{opacity:0;transform:translateX(24px)} }
@keyframes ntfy-shrink     { from{width:100%} to{width:0%} }
@keyframes ntfy-scan       { 0%{left:-100%} 100%{left:200%} }
@keyframes ntfy-pulse      { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.4;transform:scale(.8)} }
@keyframes ntfy-pulseAlert { 0%,100%{transform:scale(1)} 50%{transform:scale(1.35)} }
@keyframes ntfy-glitch1    { 0%{transform:translateX(-2px)} 100%{transform:translateX(2px)} }
@keyframes ntfy-glitch2    { 0%{transform:translateX(2px)}  100%{transform:translateX(-1px)} }
@keyframes ntfy-shake      { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-3px)} 75%{transform:translateX(3px)} }
`
let _kfInjected = false
function injectKF() {
  if (_kfInjected || typeof document === 'undefined') return
  const s = document.createElement('style')
  s.textContent = KF
  document.head.appendChild(s)
  _kfInjected = true
}

// ── Variant config (extends VARIANTS with announce + yellow warning) ──────────
const V = {
  ...VARIANTS,
  announce: { color: 'var(--purple)', bg: 'rgba(168,85,247,0.06)', border: 'rgba(168,85,247,0.25)', glow: 'rgba(168,85,247,0.3)', icon: '◈', label: 'ANNOUNCE' },
  warning:  { ...VARIANTS.warning, color: 'var(--orange)', bg: 'rgba(255,107,53,0.06)', border: 'rgba(255,107,53,0.25)', glow: 'rgba(255,107,53,0.3)' },
  error:    { ...VARIANTS.error,   label: 'ALERT' },
}

// ── time helper ───────────────────────────────────────────────────────────────
const ts = () => new Date().toTimeString().slice(0, 8)

// ─────────────────────────────────────────────────────────────────────────────
// STYLE 1 — CYBER TOAST (default)
// ─────────────────────────────────────────────────────────────────────────────
function CyberToast({ toast, v, leaving, progress, dismiss }) {
  return (
    <div role="alert" onClick={dismiss} style={{
      position: 'relative', minWidth: 280, maxWidth: 380, overflow: 'hidden',
      marginBottom: 8, cursor: 'pointer',
      background: v.bg, border: `1px solid ${v.border}`,
      padding: '14px 36px 14px 44px',
      animation: leaving ? 'ntfy-fadeOut .3s ease forwards' : 'ntfy-slideLeft .3s cubic-bezier(.16,1,.3,1) both',
    }}>
      {/* left accent */}
      <div style={{ position:'absolute', left:0, top:0, bottom:0, width:3, background:v.color, boxShadow:`0 0 8px ${v.glow}` }} />
      {/* icon */}
      <div style={{ position:'absolute', left:14, top:'50%', transform:'translateY(-50%)', fontFamily:t.fontMono, fontSize:13, color:v.color, fontWeight:700 }}>{v.icon}</div>
      {/* label + message */}
      <div style={{ fontFamily:t.fontMono, fontSize:9, letterSpacing:3, color:v.color, marginBottom:3 }}>{v.label}</div>
      <div style={{ fontFamily:t.fontMono, fontSize:11, color:t.text, lineHeight:1.5 }}>{toast.title && <strong style={{color:v.color}}>{toast.title} — </strong>}{toast.message}</div>
      {/* close x */}
      <div style={{ position:'absolute', top:8, right:10, fontFamily:t.fontMono, fontSize:9, color:t.muted }}>✕</div>
      {/* scanlines */}
      <div style={{ position:'absolute', inset:0, pointerEvents:'none', background:'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.02) 2px,rgba(0,0,0,0.02) 4px)' }} />
      {/* progress */}
      {!toast.persistent && <div style={{ position:'absolute', bottom:0, left:0, height:'1px', background:v.color, opacity:.5, width:`${progress}%`, transition:'width .05s linear' }} />}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLE 2 — TERMINAL LOG
// ─────────────────────────────────────────────────────────────────────────────
function TerminalToast({ toast, v, leaving }) {
  return (
    <div role="alert" style={{
      fontFamily: t.fontMono, fontSize: 11, lineHeight: 1.8,
      padding: '4px 0', marginBottom: 0,
      animation: leaving ? 'ntfy-fadeOut .2s ease forwards' : 'ntfy-slideLeft .15s ease both',
    }}>
      <span style={{ color: t.muted, marginRight: 8, fontSize: 9 }}>[{ts()}]</span>
      <span style={{ color: 'var(--green)', marginRight: 6 }}>$</span>
      <span style={{ color: v.color }}>[{v.label}]</span>
      <span style={{ color: t.text, marginLeft: 6 }}>{toast.message}</span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLE 3 — BANNER (full-width top strip)
// ─────────────────────────────────────────────────────────────────────────────
function BannerToast({ toast, v, leaving, dismiss }) {
  return (
    <div role="alert" style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 16px', width: '100%', overflow: 'hidden', position: 'relative',
      background: v.bg, borderBottom: `1px solid ${v.border}`,
      animation: leaving ? 'ntfy-slideDown .3s ease forwards' : 'ntfy-slideDown .35s cubic-bezier(.16,1,.3,1) both',
    }}>
      {/* pulse dot */}
      <div style={{
        width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
        background: v.color, boxShadow: `0 0 6px ${v.color}`,
        animation: toast.type === 'error' ? 'ntfy-pulseAlert .6s ease-in-out infinite' : 'ntfy-pulse 1.5s ease-in-out infinite',
      }} />
      {/* badge */}
      <span style={{ fontFamily:t.fontMono, fontSize:8, letterSpacing:3, padding:'2px 7px', flexShrink:0, color:v.color, background:`${v.bg}`, border:`1px solid ${v.border}` }}>{v.label}</span>
      {/* message */}
      <span style={{ fontFamily:t.fontMono, fontSize:11, color:t.text, flex:1 }}>{toast.title && <strong style={{color:v.color}}>{toast.title}: </strong>}{toast.message}</span>
      {/* action link */}
      {toast.action && <a href={toast.actionHref||'#'} onClick={e=>{if(!toast.actionHref)e.preventDefault(); toast.onAction?.()}} style={{ fontFamily:t.fontMono, fontSize:9, letterSpacing:1, color:v.color, textDecoration:'none', whiteSpace:'nowrap', flexShrink:0 }}>{toast.action} →</a>}
      {/* close */}
      <button onClick={dismiss} style={{ background:'none', border:'none', color:t.muted, cursor:'pointer', fontSize:14, marginLeft:4, flexShrink:0, fontFamily:t.fontMono }}>✕</button>
      {/* scan line sweep */}
      <div style={{ position:'absolute', top:0, left:'-100%', width:'100%', height:'100%', background:'linear-gradient(90deg,transparent,rgba(255,255,255,0.04),transparent)', animation:'ntfy-scan 2.5s ease-in-out infinite', pointerEvents:'none' }} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLE 4 — FLOATING CARD
// ─────────────────────────────────────────────────────────────────────────────
function FloatToast({ toast, v, leaving, progress, dismiss }) {
  return (
    <div role="alert" style={{
      position: 'relative', minWidth: 280, maxWidth: 380, overflow: 'hidden',
      marginBottom: 8, cursor: 'default',
      background: 'var(--bg2)', border: `1px solid ${v.border}`,
      borderRadius: 8, padding: '16px',
      boxShadow: `0 0 24px ${v.glow.replace('0.3','0.08')}, 0 8px 32px rgba(0,0,0,0.5)`,
      animation: leaving ? 'ntfy-fadeOut .35s ease forwards' : 'ntfy-floatIn .4s cubic-bezier(.16,1,.3,1) both',
    }}>
      {/* top gradient bar */}
      <div style={{ position:'absolute', top:0, left:0, right:0, height:2, borderRadius:'8px 8px 0 0', background:`linear-gradient(90deg,${v.color},transparent)` }} />
      {/* header row */}
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
        <div style={{
          width:32, height:32, borderRadius:6, flexShrink:0,
          display:'flex', alignItems:'center', justifyContent:'center', fontSize:15,
          background:`${v.bg}`, border:`1px solid ${v.border}`,
          animation: toast.type === 'error' ? 'ntfy-shake .4s ease' : 'none',
        }}>{v.icon}</div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontFamily:t.fontMono, fontSize:10, fontWeight:700, letterSpacing:1, color:v.color }}>{toast.title || v.label}</div>
          <div style={{ fontFamily:t.fontMono, fontSize:9, color:t.muted, marginTop:1 }}>{ts()} · aifazi.net</div>
        </div>
        <button onClick={dismiss} style={{ background:'none', border:'none', color:t.muted, cursor:'pointer', fontSize:12, fontFamily:t.fontMono }}>✕</button>
      </div>
      {/* message */}
      <div style={{ fontFamily:t.fontMono, fontSize:10, color:'rgba(200,216,232,0.75)', lineHeight:1.6 }}>{toast.message}</div>
      {/* action buttons */}
      {toast.action && (
        <div style={{ display:'flex', gap:6, marginTop:10 }}>
          <button onClick={()=>{ toast.onAction?.(); dismiss() }} style={{ fontFamily:t.fontMono, fontSize:8, letterSpacing:1, padding:'4px 10px', borderRadius:3, cursor:'pointer', border:`1px solid ${v.border}`, color:v.color, background:v.bg }}>{toast.action}</button>
          <button onClick={dismiss} style={{ fontFamily:t.fontMono, fontSize:8, letterSpacing:1, padding:'4px 10px', borderRadius:3, cursor:'pointer', border:`1px solid var(--border)`, color:t.muted, background:'transparent' }}>DISMISS</button>
        </div>
      )}
      {/* progress */}
      {!toast.persistent && <div style={{ position:'absolute', bottom:0, left:0, height:'1px', background:v.color, opacity:.4, width:`${progress}%`, transition:'width .05s linear' }} />}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLE 5 — GLITCH (high impact alerts)
// ─────────────────────────────────────────────────────────────────────────────
function GlitchToast({ toast, v, leaving, dismiss }) {
  const text = `[${v.label}] ${toast.message}`
  return (
    <div role="alert" onClick={dismiss} style={{
      position: 'relative', minWidth: 280, maxWidth: 380, overflow: 'hidden',
      marginBottom: 8, cursor: 'pointer',
      padding: '14px 18px',
      background: v.bg, border: `1px solid ${v.color}`,
      animation: leaving ? 'ntfy-fadeOut .25s ease forwards' : 'ntfy-glitchIn .3s steps(4) both',
    }}>
      <div style={{ fontFamily:t.fontMono, fontSize:9, letterSpacing:3, marginBottom:4, opacity:.6, color:v.color }}>// {v.label} — {ts()}</div>
      {/* main text */}
      <div style={{ fontFamily:t.fontMono, fontSize:12, letterSpacing:1, color:v.color, position:'relative', zIndex:1 }}>{text}</div>
      {/* chromatic aberration layers */}
      <div aria-hidden style={{ position:'absolute', top:38, left:18, fontFamily:t.fontMono, fontSize:12, letterSpacing:1, color:'var(--cyan)', opacity:.5, clipPath:'polygon(0 0,100% 0,100% 40%,0 40%)', animation:'ntfy-glitch1 .6s steps(2) infinite', pointerEvents:'none' }}>{text}</div>
      <div aria-hidden style={{ position:'absolute', top:38, left:18, fontFamily:t.fontMono, fontSize:12, letterSpacing:1, color:'var(--red)',  opacity:.45, clipPath:'polygon(0 60%,100% 60%,100% 100%,0 100%)', animation:'ntfy-glitch2 .8s steps(2) infinite', pointerEvents:'none' }}>{text}</div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLE 6 — PILL (compact rounded badge)
// ─────────────────────────────────────────────────────────────────────────────
function PillToast({ toast, v, leaving, dismiss }) {
  return (
    <div role="alert" onClick={dismiss} style={{
      display:'flex', alignItems:'center', gap:10, padding:'10px 16px 10px 14px',
      background:v.bg, border:`1px solid ${v.border}`, borderRadius:999,
      marginBottom:8, cursor:'pointer', maxWidth:420,
      boxShadow:`0 4px 16px rgba(0,0,0,0.4), 0 0 12px ${v.glow.replace('0.3','0.08')}`,
      animation: leaving ? 'ntfy-fadeOut .3s ease forwards' : 'ntfy-floatIn .3s cubic-bezier(.16,1,.3,1) both',
    }}>
      <span style={{ fontFamily:t.fontMono, fontSize:14, color:v.color, flexShrink:0 }}>{v.icon}</span>
      <span style={{ fontFamily:t.fontMono, fontSize:11, color:t.text, flex:1, lineHeight:1.4 }}>
        {toast.title && <strong style={{color:v.color, marginRight:4}}>{toast.title}:</strong>}
        {toast.message}
      </span>
      <span style={{ fontFamily:t.fontMono, fontSize:8, letterSpacing:1, padding:'2px 8px',
        border:`1px solid ${v.border}`, color:v.color, borderRadius:99, flexShrink:0 }}>{v.label}</span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLE 7 — MINIMAL (clean card, thin border)
// ─────────────────────────────────────────────────────────────────────────────
function MinimalToast({ toast, v, leaving, progress, dismiss }) {
  return (
    <div role="alert" onClick={dismiss} style={{
      position:'relative', minWidth:280, maxWidth:380, overflow:'hidden',
      marginBottom:8, cursor:'pointer',
      background:'var(--bg2)', border:`1px solid ${v.border}`, borderRadius:8,
      padding:'13px 36px 13px 16px',
      boxShadow:'0 4px 20px rgba(0,0,0,0.3)',
      animation: leaving ? 'ntfy-fadeOut .3s ease forwards' : 'ntfy-floatIn .35s cubic-bezier(.16,1,.3,1) both',
    }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
        <span style={{ color:v.color, fontSize:13 }}>{v.icon}</span>
        <span style={{ fontFamily:t.fontMono, fontSize:9, letterSpacing:2, color:v.color }}>{toast.title || v.label}</span>
      </div>
      <div style={{ fontFamily:t.fontMono, fontSize:11, color:t.text, lineHeight:1.5, paddingLeft:21 }}>{toast.message}</div>
      <button onClick={e=>{e.stopPropagation();dismiss()}} style={{ position:'absolute', top:9, right:10, background:'none', border:'none', color:t.muted, cursor:'pointer', fontSize:10, fontFamily:t.fontMono }}>✕</button>
      {!toast.persistent && <div style={{ position:'absolute', bottom:0, left:0, height:'2px', background:v.color, opacity:.35, width:`${progress}%`, transition:'width .05s linear', borderRadius:'0 0 0 8px' }} />}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLE 8 — GLASS (frosted blur, soft glow)
// ─────────────────────────────────────────────────────────────────────────────
function GlassToast({ toast, v, leaving, progress, dismiss }) {
  return (
    <div role="alert" onClick={dismiss} style={{
      position:'relative', minWidth:280, maxWidth:380, overflow:'hidden',
      marginBottom:8, cursor:'pointer',
      background:'rgba(8,16,30,0.72)', backdropFilter:'blur(18px) saturate(1.3)',
      border:`1px solid ${v.border}`, borderRadius:12,
      padding:'14px 36px 14px 44px',
      boxShadow:`0 8px 32px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06), 0 0 24px ${v.glow.replace('0.3','0.1')}`,
      animation: leaving ? 'ntfy-fadeOut .3s ease forwards' : 'ntfy-floatIn .4s cubic-bezier(.16,1,.3,1) both',
    }}>
      <div style={{ position:'absolute', left:0, top:'12%', bottom:'12%', width:3, background:`linear-gradient(to bottom,${v.color},${v.color}44)`, borderRadius:'0 3px 3px 0', boxShadow:`0 0 8px ${v.glow}` }} />
      <div style={{ position:'absolute', left:14, top:'50%', transform:'translateY(-50%)', fontFamily:t.fontMono, fontSize:14, color:v.color }}>{v.icon}</div>
      <div style={{ fontFamily:t.fontMono, fontSize:9, letterSpacing:3, color:v.color, marginBottom:3, opacity:0.85 }}>{v.label}</div>
      <div style={{ fontFamily:t.fontMono, fontSize:11, color:'rgba(200,216,232,0.85)', lineHeight:1.5 }}>
        {toast.title && <strong style={{color:v.color}}>{toast.title} — </strong>}{toast.message}
      </div>
      <button onClick={e=>{e.stopPropagation();dismiss()}} style={{ position:'absolute', top:9, right:10, background:'none', border:'none', color:t.muted, cursor:'pointer', fontSize:9, fontFamily:t.fontMono }}>✕</button>
      {!toast.persistent && <div style={{ position:'absolute', bottom:0, left:0, height:'1px', background:v.color, opacity:.4, width:`${progress}%`, transition:'width .05s linear' }} />}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TERMINAL WINDOW WRAPPER (collects terminal-style toasts)
// ─────────────────────────────────────────────────────────────────────────────
function TerminalWindow({ toasts, onRemove }) {
  return (
    <div style={{ background:'#030810', border:'1px solid rgba(0,255,136,0.2)', borderRadius:4, padding:'12px 14px', minWidth:320, maxWidth:440, marginBottom:8 }}>
      <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:10, paddingBottom:8, borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ width:8, height:8, borderRadius:'50%', background:'#ff5f57' }} />
        <div style={{ width:8, height:8, borderRadius:'50%', background:'#febc2e' }} />
        <div style={{ width:8, height:8, borderRadius:'50%', background:'#28c840' }} />
        <span style={{ fontFamily:t.fontMono, fontSize:9, color:t.muted, letterSpacing:2, marginLeft:8 }}>aifazi.net — system.log</span>
        <button onClick={()=>toasts.forEach(tk=>onRemove(tk.id))} style={{ marginLeft:'auto', background:'none', border:'none', color:t.muted, cursor:'pointer', fontFamily:t.fontMono, fontSize:9 }}>CLEAR</button>
      </div>
      {toasts.map(tk => {
        const v = V[tk.type] || V.info
        return <TerminalToast key={tk.id} toast={tk} v={v} leaving={false} />
      })}
      <div style={{ fontFamily:t.fontMono, fontSize:11, lineHeight:1.8, paddingTop:4 }}>
        <span style={{ color:'var(--green)' }}>$ </span>
        <span style={{ display:'inline-block', width:6, height:11, background:'var(--green)', animation:'ntfy-pulse .8s step-end infinite', verticalAlign:'text-bottom', marginLeft:2 }} />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TOAST ITEM — routes to correct style component
// ─────────────────────────────────────────────────────────────────────────────
function ToastItem({ toast, onRemove, notifyStyle }) {
  const [leaving, setLeaving] = useState(false)
  const [progress, setProgress] = useState(100)
  const timerRef = useRef(null)
  const v = V[toast.type] || V.info

  const dismiss = useCallback(() => {
    if (leaving) return
    setLeaving(true)
    clearInterval(timerRef.current)
    setTimeout(() => onRemove(toast.id), 350)
  }, [leaving, toast.id, onRemove])

  useEffect(() => {
    injectKF()
    if (toast.persistent) return
    const dur  = toast.duration || 5000
    const step = 100 / (dur / 50)
    timerRef.current = setInterval(() => {
      setProgress(p => {
        if (p <= 0) { clearInterval(timerRef.current); dismiss(); return 0 }
        return p - step
      })
    }, 50)
    return () => clearInterval(timerRef.current)
  }, [])

  const props = { toast, v, leaving, progress, dismiss }
  const activeStyle = _liveNotifyStyle || notifyStyle
  if (activeStyle === 'terminal') return <TerminalToast {...props} />
  if (activeStyle === 'banner')   return <BannerToast   {...props} />
  if (activeStyle === 'float')    return <FloatToast    {...props} />
  if (activeStyle === 'inbox')    return <FloatToast    {...props} />
  if (activeStyle === 'hud')      return <MinimalToast  {...props} />
  if (activeStyle === 'glitch')   return <GlitchToast   {...props} />
  if (activeStyle === 'pill')     return <PillToast     {...props} />
  if (activeStyle === 'minimal')  return <MinimalToast  {...props} />
  if (activeStyle === 'glass')    return <GlassToast    {...props} />
  return <CyberToast {...props} />  // default: cyber
}

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFY PROVIDER
// ─────────────────────────────────────────────────────────────────────────────
export function NotifyProvider({ children, position = 'bottom-right', maxToasts = 6, notifyStyle = 'cyber' }) {
  const [toasts, setToasts] = useState([])
  const [livePosition, setLivePosition] = useState(position)

  // Keep module-level override in sync with current prop + live events
  useEffect(() => { _liveNotifyStyle = notifyStyle }, [notifyStyle])
  useEffect(() => { setLivePosition(position) }, [position])
  useEffect(() => {
    const h = (e) => {
      if (e?.detail?.notifyStyle)   _liveNotifyStyle = e.detail.notifyStyle
      if (e?.detail?.notifyPosition) setLivePosition(e.detail.notifyPosition)
    }
    window.addEventListener('site-settings-updated', h)
    return () => window.removeEventListener('site-settings-updated', h)
  }, [])

  const add = useCallback((message, type = 'info', options = {}) => {
    const id = Date.now() + Math.random()
    setToasts(prev => [...prev, { id, message, type, ...options }].slice(-maxToasts))
    return id
  }, [maxToasts])

  const remove = useCallback(id => setToasts(prev => prev.filter(x => x.id !== id)), [])

  useEffect(() => {
    _api.add     = add
    _api.dismiss = remove
    return () => { _api.add = null; _api.dismiss = null }
  }, [add, remove])

  const api = {
    success:  (msg, opts) => add(msg, 'success',  opts),
    error:    (msg, opts) => add(msg, 'error',     opts),
    warning:  (msg, opts) => add(msg, 'warning',   opts),
    info:     (msg, opts) => add(msg, 'info',      opts),
    announce: (msg, opts) => add(msg, 'announce',  opts),
    dismiss: remove,
  }

  const POS = {
    'bottom-right': { bottom: 'calc(24px + env(safe-area-inset-bottom,0px))', right: 24, alignItems: 'flex-end' },
    'bottom-left':  { bottom: 'calc(24px + env(safe-area-inset-bottom,0px))', left: 24,  alignItems: 'flex-start' },
    'top-right':    { top: 96, right: 24, alignItems: 'flex-end' },
    'top-left':     { top: 96, left: 24,  alignItems: 'flex-start' },
    'top-center':   { top: 0, left: 0, right: 0, alignItems: 'stretch' },
  }

  const activeNotifyStyle = _liveNotifyStyle || notifyStyle
  const isBanner   = activeNotifyStyle === 'banner'
  const isTerminal = activeNotifyStyle === 'terminal'

  // Banner: render at very top, full width
  if (isBanner) {
    return (
      <NotifyContext.Provider value={api}>
        {children}
        <div aria-live="polite" style={{ position:'fixed', top:0, left:0, right:0, zIndex: zIndex.toast, display:'flex', flexDirection:'column' }}>
          {toasts.map(toast => (
            <div key={toast.id} style={{ pointerEvents:'auto' }}>
              <ToastItem toast={toast} onRemove={remove} notifyStyle="banner" />
            </div>
          ))}
        </div>
      </NotifyContext.Provider>
    )
  }

  // Terminal: render as single window collecting all entries
  if (isTerminal) {
    return (
      <NotifyContext.Provider value={api}>
        {children}
        {toasts.length > 0 && (
          <div aria-live="polite" style={{ position:'fixed', zIndex: zIndex.toast, bottom: 24, right: 24, pointerEvents:'auto' }}>
            <TerminalWindow toasts={toasts} onRemove={remove} />
          </div>
        )}
      </NotifyContext.Provider>
    )
  }

  // All other styles: use configured position
  return (
    <NotifyContext.Provider value={api}>
      {children}
      <div aria-live="polite" aria-label="Notifications" style={{
        position: 'fixed', zIndex: zIndex.toast,
        display: 'flex', flexDirection: 'column-reverse', pointerEvents: 'none',
        ...(POS[livePosition] || POS['bottom-right']),
      }}>
        {toasts.map(toast => (
          <div key={toast.id} style={{ pointerEvents:'auto' }}>
            <ToastItem toast={toast} onRemove={remove} notifyStyle={activeNotifyStyle} />
          </div>
        ))}
      </div>
    </NotifyContext.Provider>
  )
}
