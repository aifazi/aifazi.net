'use client'
/**
 * AdminChat v7 — LiveKit voice/video + role-based access
 * - Discord-style grouped messages with Supabase Realtime for text
 * - LiveKit Cloud for voice/video/screen share (free relay for mobile/NAT users)
 * - Role-based room access: allowed_roles, speak_roles, screen_share_roles
 * - Staff moderation: mute, kick, ban per room
 */
import React, { useState, useEffect, useRef, useCallback, useMemo, Component } from 'react'
import api, { getRole, getUsername, setEffectiveAccess, getAuthToken } from '@/lib/api'
import { useNotify }  from '../core/notify.jsx'
import { useDialog }  from '../core/dialog.jsx'
import { Checkbox }   from '../core/ui.jsx'
import { useMenu }    from '../core/menu.jsx'
import { contextMenu } from '../core/menu.jsx'
import { dialog } from '../core/dialog.jsx'
import { getSupabase } from '@/lib/supabase'

const getSB = getSupabase

// ── utils ─────────────────────────────────────────────────────────────────────
function parseJwt(t) {
  try {
    const part = t.split('.')[1]
    if (!part) return null
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)))
  } catch { return null }
}
function getToken() {
  // H4 — memory-first via the central API client (cookie auth covers the rest).
  return getAuthToken()
}
const fmt   = d => new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
const fmtDt = d => { const n=new Date(),dt=new Date(d); if(dt.toDateString()===n.toDateString()) return 'Today'; const y=new Date(n); y.setDate(n.getDate()-1); return dt.toDateString()===y.toDateString()?'Yesterday':dt.toLocaleDateString([],{month:'short',day:'numeric'}) }
const fmtSz = b => { const n=parseInt(b); if(!n) return ''; if(n<1024) return n+' B'; if(n<1048576) return (n/1024).toFixed(1)+' KB'; return (n/1048576).toFixed(1)+' MB' }
function beep() { try { const c=new(window.AudioContext||window.webkitAudioContext)(),o=c.createOscillator(),g=c.createGain(); o.connect(g);g.connect(c.destination);o.frequency.value=880;g.gain.setValueAtTime(0.1,c.currentTime);g.gain.exponentialRampToValueAtTime(0.001,c.currentTime+0.2);o.start();o.stop(c.currentTime+0.2) } catch {} }
const PAL=['#5865f2','#00d4ff','#00ff88','#ff6b35','#ff71ce','#ff4757','#ffd700','#a78bfa']

// ── Module-scoped E2EE room key (not on window) ──────────────────────────────
let _roomKeyModule = ''
const _roomKeyCache = {}
export function getRoomKey() { return _roomKeyModule }
export function setRoomKeyModule(key) { _roomKeyModule = key }
function aCol(n=''){let h=0;for(let i=0;i<n.length;i++)h=(h*31+n.charCodeAt(i))&0xffffffff;return PAL[Math.abs(h)%PAL.length]}

// ── E2EE text encryption (AES-256-GCM, Web Crypto API) ────────────────────
async function encryptText(plaintext, keyBase64) {
  if (!keyBase64 || !plaintext) return plaintext
  try {
    const keyBytes = Uint8Array.from(atob(keyBase64), c => c.charCodeAt(0))
    const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt'])
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const encoded = new TextEncoder().encode(plaintext)
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded)
    const combined = new Uint8Array(iv.length + ciphertext.byteLength)
    combined.set(iv)
    combined.set(new Uint8Array(ciphertext), iv.length)
    return btoa(String.fromCharCode(...combined))
  } catch { return plaintext }
}

async function decryptText(cipherBase64, keyBase64) {
  if (!keyBase64 || !cipherBase64) return cipherBase64
  try {
    const keyBytes = Uint8Array.from(atob(keyBase64), c => c.charCodeAt(0))
    const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt'])
    const combined = Uint8Array.from(atob(cipherBase64), c => c.charCodeAt(0))
    const iv = combined.slice(0, 12)
    const ciphertext = combined.slice(12)
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
    return new TextDecoder().decode(decrypted)
  } catch { return cipherBase64 }
}

const ENCRYPTED_PREFIX = 'ENC:'

function isUuidLike(s) {
  return s && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]+$/i.test(s)
}

function roleColor(role='member') {
  const r = String(role || 'member').toLowerCase()
  if (r === 'admin') return '#ff4757'
  if (r === 'moderator') return '#00d4ff'
  if (r === 'editor') return '#ffd700'
  if (r === 'chat') return '#a78bfa'
  return '#00ff88'
}

function RolePill({ role }) {
  const r = String(role || 'member').toLowerCase()
  if (!r || r === 'member' || r === 'user') return null
  const c = roleColor(r)
  return (
    <span style={{
      fontSize:8, fontFamily:T.mono, letterSpacing:1, padding:'1px 5px', borderRadius:4,
      background:`${c}1f`, color:c, border:`1px solid ${c}35`, textTransform:'uppercase', lineHeight:1.4,
    }}>{r}</span>
  )
}

function parseParticipantMetadata(value) {
  if (!value) return {}
  if (typeof value === 'object') return value
  try { return JSON.parse(value) } catch {}
  return String(value).split('&').reduce((acc, part) => {
    const [k, v] = part.split('=')
    if (k) acc[decodeURIComponent(k)] = decodeURIComponent(v || '')
    return acc
  }, {})
}

// ── theme tokens ──────────────────────────────────────────────────────────────
const T = {
  sidebar:   'rgba(10,12,18,0.95)',
  main:      'rgba(15,17,24,0.98)',
  bubble:    'rgba(30,34,48,0.9)',
  bubbleOwn: 'rgba(0,255,136,0.1)',
  input:     'rgba(22,26,38,0.95)',
  border:    'rgba(255,255,255,0.07)',
  accent:    '#00ff88',
  accentB:   '#00d4ff',
  danger:    '#ff4757',
  warn:      '#ffd700',
  muted:     'rgba(180,190,210,0.5)',
  text:      'rgba(225,230,245,0.92)',
  mono:      'var(--font-mono)',
  display:   'var(--font-display)',
}

// ── shared micro-components ───────────────────────────────────────────────────
function Av({ name='?', size=32, online }) {
  return (
    <div style={{ position:'relative', flexShrink:0, userSelect:'none' }}>
      <div style={{ width:size, height:size, borderRadius:'50%', background:aCol(name),
        display:'flex', alignItems:'center', justifyContent:'center',
        fontSize:size*.4, fontWeight:700, color:'#fff', letterSpacing:-0.5 }}>
        {name[0]?.toUpperCase()||'?'}
      </div>
      {online!==undefined && (
        <span style={{ position:'absolute', bottom:-1, right:-1, width:10, height:10,
          borderRadius:'50%', background:online?'#23d160':'rgba(255,255,255,0.2)',
          border:'2px solid var(--bg, #0f111a)' }}/>
      )}
    </div>
  )
}

function Md({ text }) {
  const [decrypted, setDecrypted] = useState(text?.startsWith(ENCRYPTED_PREFIX) ? text : null)
  const decryptedText = decrypted === null ? text : decrypted

  useEffect(() => {
    if (!text || !text.startsWith(ENCRYPTED_PREFIX)) { setDecrypted(null); return }
    const key = getRoomKey()
    decryptText(text.slice(ENCRYPTED_PREFIX.length), key).then(setDecrypted).catch(() => setDecrypted(text))
  }, [text])

  if (!text) return null

  const out = []
  const re = /(```[\s\S]*?```)|(`([^`\n]+?)`)|(\*\*(.+?)\*\*)|(\*(.+?)\*)|(~~(.+?)~~)|(\[([^\]]+)\]\(([^)]+)\))/g
  let m, last = 0
  const src = decryptedText || ''
  while ((m = re.exec(src)) !== null) {
    if (m.index > last) out.push({ t: 'tx', v: src.slice(last, m.index) })
    if (m[1]) out.push({ t: 'cb', v: m[1].slice(3, -3) })
    else if (m[2]) out.push({ t: 'cd', v: m[4] })
    else if (m[5]) out.push({ t: 'bd', v: m[6] })
    else if (m[7]) out.push({ t: 'it', v: m[8] })
    else if (m[9]) out.push({ t: 'st', v: m[10] })
    else if (m[11]) out.push({ t: 'lk', v: m[12], href: m[13] })
    last = re.lastIndex
  }
  out.push({ t: 'tx', v: src.slice(last) })

  return <>{out.map((p, i) => {
    if (p.t === 'cb') return <pre key={i} style={{ fontFamily: T.mono, fontSize: 11, background: 'rgba(0,0,0,0.5)', padding: '8px 10px', borderRadius: 6, color: T.accent, overflow: 'auto', whiteSpace: 'pre-wrap', margin: '4px 0' }}>{p.v}</pre>
    if (p.t === 'cd') return <code key={i} style={{ fontFamily: T.mono, fontSize: 11, background: 'rgba(0,0,0,0.5)', padding: '1px 6px', borderRadius: 4, color: T.accent }}>{p.v}</code>
    if (p.t === 'bd') return <strong key={i}>{p.v}</strong>
    if (p.t === 'it') return <em key={i}>{p.v}</em>
    if (p.t === 'st') return <s key={i}>{p.v}</s>
    if (p.t === 'lk') return <a key={i} href={p.href} target="_blank" rel="noopener noreferrer" style={{ color: T.accentB, textDecoration: 'none' }}>{p.v}</a>
    return <span key={i}>{p.v}</span>
  })}</>
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
function Sidebar({ rooms, active, onSelect, onlineCount, unread, isAdmin, onCreate, onEdit, callRoom, onJoinCall, onLeaveCall, me, role, voicePresenceByRoom, onRotateKey, onDeleteChannel }) {
  const [hov, setHov] = useState(null)
  const txtChs = rooms.filter(r => r.type !== 'voice' && r.type !== 'video')
  const vcChs  = rooms.filter(r => r.type === 'voice' || r.type === 'video')

  const channelCtx = useCallback((e, r) => {
    e.preventDefault()
    const items = [
      { icon:'✏️', label:'Edit Channel', action:() => onEdit(r) },
    ]
    if (isAdmin) {
      items.push({ icon:'🔑', label:'Rotate E2EE Key', action:() => onRotateKey?.(r) })
      items.push({ icon:'🗑', label:'Delete Channel', variant:'danger', action:() => onDeleteChannel?.(r) })
    }
    contextMenu.open(e, items, { header: `#${r.name}` })
  }, [isAdmin, onEdit, onRotateKey, onDeleteChannel])

  return (
    <div style={{ width:224, display:'flex', flexDirection:'column', height:'100%', background:T.sidebar, borderRight:`1px solid ${T.border}`, overflow:'hidden' }}>
      <div style={{ padding:'14px 14px 10px', borderBottom:`1px solid ${T.border}`, flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span style={{ fontFamily:T.mono, fontSize:9, letterSpacing:3, color:T.muted }}>CHANNELS</span>
          {isAdmin && <button onClick={onCreate} style={{ background:'none', border:`1px solid ${T.border}`, borderRadius:6, color:T.muted, fontSize:16, cursor:'pointer', padding:'0 6px', lineHeight:1 }}>+</button>}
        </div>
      </div>
      <div style={{ flex:1, overflowY:'auto', padding:'6px 8px' }}>
        {/* Voice channels section */}
        {vcChs.length > 0 && (
          <>
            <div style={{ padding:'8px 6px 4px', fontFamily:T.mono, fontSize:8, letterSpacing:2, color:'rgba(255,255,255,0.15)', textTransform:'uppercase' }}>Voice Channels</div>
            {vcChs.map(r => {
              const people = voicePresenceByRoom?.[r.id] || []
              return (
                <div key={r.id} style={{ marginBottom:4 }}>
                  <button
                    onMouseEnter={()=>setHov(r.id)} onMouseLeave={()=>setHov(null)}
                    onClick={()=>onSelect(r)} onContextMenu={e=>channelCtx(e, r)}
                    style={{ display:'flex', alignItems:'center', gap:8, width:'100%', padding:'7px 10px', marginBottom:1,
                      borderRadius:8, background:active?.id===r.id?'rgba(255,255,255,0.08)':hov===r.id?'rgba(255,255,255,0.03)':'transparent',
                      border:'none', cursor:'pointer', color:active?.id===r.id?T.text:T.muted, textAlign:'left',
                      fontFamily:T.display, fontSize:13 }}>
                    <span style={{ fontSize:14 }}>{r.type==='video'?'📹':'🔊'}</span>
                    <span style={{ flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.name}</span>
                    {people.length > 0 && <span style={{ fontFamily:T.mono, fontSize:9, color:T.accent }}>{people.length}</span>}
                    {callRoom?.id===r.id && <span style={{ width:6,height:6,borderRadius:'50%',background:'#23d160',flexShrink:0 }}/>}
                  </button>
                  {people.length > 0 && (
                    <div style={{ marginLeft:27, padding:'1px 0 3px', display:'flex', flexDirection:'column', gap:2 }}>
                      {people.slice(0, 5).map(p => (
                        <div key={p.presenceKey || p.username} style={{ display:'flex', alignItems:'center', gap:6, minWidth:0, color:T.muted }}>
                          <span style={{ width:6, height:6, borderRadius:'50%', background:'#23d160', flexShrink:0 }}/>
                          <span style={{ fontFamily:T.display, fontSize:11, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', color:p.username===me?T.accent:T.muted }}>{p.username}{p.username===me?' (you)':''}</span>
                          <RolePill role={p.role} />
                        </div>
                      ))}
                      {people.length > 5 && <div style={{ fontFamily:T.mono, fontSize:8, color:T.muted }}>+{people.length - 5} more</div>}
                    </div>
                  )}
                </div>
              )
            })}
            <div style={{ height:1, background:T.border, margin:'8px 8px' }}/>
          </>
        )}

        {/* Text channels */}
        <div style={{ padding:'4px 6px 4px', fontFamily:T.mono, fontSize:8, letterSpacing:2, color:'rgba(255,255,255,0.15)', textTransform:'uppercase' }}>Text Channels</div>
        {txtChs.map(r => (
          <button key={r.id}
            onMouseEnter={()=>setHov(r.id)} onMouseLeave={()=>setHov(null)}
            onClick={()=>onSelect(r)} onContextMenu={e=>channelCtx(e, r)}
            style={{ display:'flex', alignItems:'center', gap:8, width:'100%', padding:'7px 10px', marginBottom:1,
              borderRadius:8, background:active?.id===r.id?'rgba(255,255,255,0.08)':hov===r.id?'rgba(255,255,255,0.03)':'transparent',
              border:'none', cursor:'pointer', color:active?.id===r.id?T.text:T.muted, textAlign:'left',
              fontFamily:T.display, fontSize:13 }}>
            <span style={{ fontSize:12 }}>{r.emoji||'#'}</span>
            <span style={{ flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.name}</span>
            {unread[r.id] > 0 && <span style={{ background:T.accent, color:'#000', fontSize:9, fontWeight:700, padding:'1px 6px', borderRadius:10, fontFamily:T.mono }}>{unread[r.id]}</span>}
          </button>
        ))}
      </div>
      {/* User footer */}
      <div style={{ borderTop:`1px solid ${T.border}`, padding:'10px 14px', flexShrink:0, display:'flex', alignItems:'center', gap:8 }}>
        <Av name={me} size={28} online/>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ fontSize:12, fontWeight:600, color:T.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{me}</span>
            <RolePill role={role} />
          </div>
          <div style={{ fontSize:9, color:T.muted }}>{onlineCount} online</div>
        </div>
        {callRoom && <button onClick={onLeaveCall} style={{ background:T.danger, border:'none', borderRadius:6, color:'#fff', fontSize:11, padding:'4px 8px', cursor:'pointer', fontFamily:T.mono }}>LEAVE</button>}
      </div>
    </div>
  )
}

// ── Channel Modal ─────────────────────────────────────────────────────────────
const ROLES = ['admin', 'moderator', 'editor', 'chat']

function RoleSelect({ label, value, onChange }) {
  const toggle = (role) => {
    const next = value.includes(role) ? value.filter(r => r !== role) : [...value, role]
    onChange(next)
  }
  return (
    <div style={{ marginBottom:10 }}>
      <div style={{ fontFamily:T.mono, fontSize:10, color:T.muted, marginBottom:6 }}>{label}</div>
      <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
        {ROLES.map(role => (
          <button key={role} onClick={() => toggle(role)}
            style={{ padding:'5px 12px', border:`1px solid ${value.includes(role)?'rgba(0,255,136,0.5)':T.border}`,
              borderRadius:7, background:value.includes(role)?'rgba(0,255,136,0.1)':'transparent',
              color:value.includes(role)?T.accent:T.muted, fontFamily:T.mono, fontSize:10,
              cursor:'pointer', textTransform:'uppercase', letterSpacing:1 }}>
            {role}
          </button>
        ))}
      </div>
      {value.length === 0 && <div style={{ fontFamily:T.mono, fontSize:8, color:T.muted, marginTop:4 }}>Empty = all roles allowed</div>}
    </div>
  )
}

function ChannelModal({ initial, onSave, onClose }) {
  const editing = initial && typeof initial === 'object'
  const [name, setName] = useState(editing?initial.name:'')
  const [desc, setDesc] = useState(editing?initial.description||'':'')
  const [emoji, setEmoji] = useState(editing?initial.emoji||'#':'#')
  const [color, setColor] = useState(editing?initial.color||'#00ff88':'#00ff88')
  const [ctype, setCtype] = useState(editing?initial.type||'text':'text')
  const [isPrivate, setIsPrivate] = useState(editing?initial.is_private||false:false)
  const [allowedRoles, setAllowedRoles] = useState(editing?initial.allowed_roles||[]:[])
  const [speakRoles, setSpeakRoles] = useState(editing?initial.speak_roles||[]:[])
  const [screenRoles, setScreenRoles] = useState(editing?initial.screen_share_roles||[]:[])

  const handleSave = () => {
    if (!name.trim()) return
    onSave({
      name: name.trim(), description: desc.trim(), emoji, color, type: ctype,
      is_private: isPrivate,
      allowed_roles: allowedRoles,
      speak_roles: speakRoles,
      screen_share_roles: screenRoles,
      id: editing ? initial.id : undefined,
    })
  }

  return (
    <div style={{ position:'fixed', inset:0, zIndex:300, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div onClick={onClose} style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.7)', backdropFilter:'blur(3px)' }}/>
      <div style={{ position:'relative', background:'rgba(18,21,34,0.98)', border:`1px solid ${T.border}`, borderRadius:14, padding:'24px', width:400, maxHeight:'85vh', overflowY:'auto', boxShadow:'0 20px 60px rgba(0,0,0,0.6)' }}>
        <h3 style={{ fontFamily:T.display, fontSize:16, color:T.text, margin:'0 0 18px' }}>{editing?'Edit Channel':'Create Channel'}</h3>

        <label style={{ display:'block', marginBottom:12 }}>
          <div style={{ fontFamily:T.mono, fontSize:10, color:T.muted, marginBottom:4 }}>CHANNEL TYPE</div>
          <div style={{ display:'flex', gap:6 }}>
            {['text','voice','video'].map(t => (
              <button key={t} onClick={()=>setCtype(t)}
                style={{ flex:1, padding:'8px', border:`1px solid ${ctype===t?'rgba(0,255,136,0.4)':T.border}`, borderRadius:8, background:ctype===t?'rgba(0,255,136,0.08)':'transparent', color:ctype===t?T.accent:T.muted, fontFamily:T.mono, fontSize:10, cursor:'pointer', textTransform:'uppercase' }}>
                {t==='voice'?'🔊':t==='video'?'📹':'📝'} {t}
              </button>
            ))}
          </div>
        </label>

        <label style={{ display:'block', marginBottom:12 }}>
          <div style={{ fontFamily:T.mono, fontSize:10, color:T.muted, marginBottom:4 }}>NAME</div>
          <input value={name} onChange={e=>setName(e.target.value)} placeholder='channel-name' autoFocus
            style={{ width:'100%', padding:'9px 12px', background:'rgba(255,255,255,0.05)', border:`1px solid ${T.border}`, borderRadius:8, color:T.text, fontFamily:T.display, fontSize:13, outline:'none', boxSizing:'border-box' }}/>
        </label>

        <label style={{ display:'block', marginBottom:12 }}>
          <div style={{ fontFamily:T.mono, fontSize:10, color:T.muted, marginBottom:4 }}>EMOJI</div>
          <input value={emoji} onChange={e=>setEmoji(e.target.value)} placeholder='#'
            style={{ width:60, padding:'8px', background:'rgba(255,255,255,0.05)', border:`1px solid ${T.border}`, borderRadius:8, color:T.text, fontFamily:T.display, fontSize:18, outline:'none', textAlign:'center' }}/>
        </label>

        <label style={{ display:'block', marginBottom:12 }}>
          <div style={{ fontFamily:T.mono, fontSize:10, color:T.muted, marginBottom:4 }}>DESCRIPTION</div>
          <input value={desc} onChange={e=>setDesc(e.target.value)} placeholder='Optional description'
            style={{ width:'100%', padding:'9px 12px', background:'rgba(255,255,255,0.05)', border:`1px solid ${T.border}`, borderRadius:8, color:T.text, fontFamily:T.display, fontSize:13, outline:'none', boxSizing:'border-box' }}/>
        </label>

        {(ctype==='voice'||ctype==='video') && (
          <>
            <div style={{ borderTop:`1px solid ${T.border}`, paddingTop:14, marginTop:6 }}>
              <div style={{ fontFamily:T.mono, fontSize:9, color:T.accent, letterSpacing:2, marginBottom:12 }}>VOICE PERMISSIONS</div>
              <RoleSelect label="ALLOWED JOIN" value={allowedRoles} onChange={setAllowedRoles} />
              <RoleSelect label="CAN SPEAK" value={speakRoles} onChange={setSpeakRoles} />
              <RoleSelect label="CAN SCREEN SHARE" value={screenRoles} onChange={setScreenRoles} />
            </div>
          </>
        )}

        <div style={{ display:'flex', gap:8, marginTop:18 }}>
          <button onClick={handleSave} style={{ flex:1, padding:'10px', border:'none', borderRadius:8, background:'linear-gradient(135deg,rgba(0,255,136,0.85),rgba(0,212,255,0.85))', color:'#000', fontFamily:T.mono, fontSize:11, fontWeight:700, cursor:'pointer', letterSpacing:1 }}>
            {editing?'SAVE':'CREATE'}
          </button>
          <button onClick={onClose} style={{ padding:'10px 18px', border:`1px solid ${T.border}`, borderRadius:8, background:'transparent', color:T.muted, fontFamily:T.mono, fontSize:11, cursor:'pointer' }}>CANCEL</button>
        </div>
      </div>
    </div>
  )
}

// ── Media Previews ────────────────────────────────────────────────────────────
const IMG_EXTS = /\.(png|jpg|jpeg|gif|webp|svg|bmp|avif|ico|tiff|tif)(\?.*)?$/i
const VID_EXTS = /\.(mp4|webm|mov|m4v|ogg|ogv|mkv|avi)(\?.*)?$/i
const AUD_EXTS = /\.(mp3|wav|m4a|aac|flac|oga|opus)(\?.*)?$/i
const PDF_EXTS = /\.pdf(\?.*)?$/i

function cleanMediaUrl(url = '') {
  return String(url || '').replace(/[.,;:!?)\]]+$/, '')
}

function mediaKind(url = '', mime = '', fileName = '') {
  const clean = cleanMediaUrl(url)
  const target = `${clean} ${fileName || ''}`
  const mt = String(mime || '').toLowerCase()
  if (mt.startsWith('image/') || IMG_EXTS.test(target)) return 'image'
  if (mt.startsWith('video/') || VID_EXTS.test(target)) return 'video'
  if (mt.startsWith('audio/') || AUD_EXTS.test(target)) return 'audio'
  if (mt === 'application/pdf' || PDF_EXTS.test(target)) return 'pdf'
  return 'file'
}

function fileLabelFromUrl(url = '') {
  try {
    const path = new URL(url, 'http://local').pathname
    return decodeURIComponent(path.split('/').filter(Boolean).pop() || 'file')
  } catch {
    return String(url || '').split('/').filter(Boolean).pop() || 'file'
  }
}

function isImageUrl(url) {
  const clean = cleanMediaUrl(url)
  if (!/^https?:\/\//i.test(clean)) return false
  return IMG_EXTS.test(clean) ||
    /(imgur\.com|i\.imgur\.com|ibb\.co|i\.ibb\.co|postimg\.cc|cloudinary\.com|supabase\.co|aifazi\.net|unsplash\.com|picsum\.photos|i\.redd\.it|im\.gy|cdn\.discordapp\.com|media\.discordapp\.net|user-images\.githubusercontent\.com|raw\.githubusercontent\.com|i\.postimg\.cc|upload\.wikimedia\.org|i\.pinimg\.com|i\.ytimg\.com)/i.test(clean) ||
    /\.(png|jpg|jpeg|gif|webp|svg|bmp|avif)(\?.*)?$/i.test(clean)
}

function MediaPreviews({ text, onMediaClick }) {
  if (!text) return null
  const urlRe = /(https?:\/\/[^\s<>"']+)/gi
  const urls = text.match(urlRe)
  if (!urls) return null
  const uniqueUrls = [...new Set(urls)]
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:4, marginTop:6 }}>
      {uniqueUrls.map((url, i) => {
        const clean = cleanMediaUrl(url)
        if (isImageUrl(clean)) {
          return <div key={i} style={{ maxWidth:420 }}>
            <img src={clean} alt="" loading="lazy" style={{ maxWidth:'100%', maxHeight:300, borderRadius:8, objectFit:'cover', cursor:'pointer', border:`1px solid ${T.border}` }}
              onError={e => { e.target.style.display = 'none' }} onClick={() => onMediaClick?.({ url: clean, type: 'image' })} />
          </div>
        }
        if (VID_EXTS.test(clean)) {
          return <video key={i} src={clean} controls preload="metadata" playsInline
            style={{ maxWidth:'100%', maxHeight:300, borderRadius:8, border:`1px solid ${T.border}` }} />
        }
        return null
      })}
    </div>
  )
}

function AttachmentPreview({ msg, onMediaClick }) {
  const url = cleanMediaUrl(msg.content)
  const kind = mediaKind(url, '', msg.file_name)
  const label = msg.file_name || fileLabelFromUrl(url)
  const size = fmtSz(msg.file_size)
  const link = (
    <a href={url} target="_blank" rel="noreferrer" style={{ color:T.accentB, textDecoration:'none' }}>
      {kind === 'image' ? 'Image' : kind === 'video' ? 'Video' : kind === 'audio' ? 'Audio' : kind === 'pdf' ? 'PDF' : 'File'}: {label}
    </a>
  )

  if (kind === 'image') {
    return (
      <div style={{ display:'inline-flex', flexDirection:'column', gap:6, maxWidth:'min(520px, 100%)' }}>
        <img src={url} alt={label} loading="lazy"
          style={{ maxWidth:'100%', maxHeight:420, borderRadius:8, objectFit:'contain', cursor:'pointer', border:`1px solid ${T.border}` }}
          onClick={() => onMediaClick?.({ url, type:'image' })}
          onError={e => { e.currentTarget.style.display = 'none' }} />
        <div style={{ fontSize:10, color:T.muted, fontFamily:T.mono }}>{link} {size && <span>{size}</span>}</div>
      </div>
    )
  }

  if (kind === 'video') {
    return (
      <div style={{ display:'inline-flex', flexDirection:'column', gap:6, maxWidth:'min(560px, 100%)' }}>
        <video src={url} controls preload="metadata" playsInline
          style={{ maxWidth:'100%', maxHeight:420, borderRadius:8, border:`1px solid ${T.border}`, background:'#000' }} />
        <div style={{ fontSize:10, color:T.muted, fontFamily:T.mono }}>{link} {size && <span>{size}</span>}</div>
      </div>
    )
  }

  if (kind === 'audio') {
    return (
      <div style={{ display:'inline-flex', flexDirection:'column', gap:6, width:'min(420px, 100%)' }}>
        <audio src={url} controls preload="metadata" style={{ width:'100%' }} />
        <div style={{ fontSize:10, color:T.muted, fontFamily:T.mono }}>{link} {size && <span>{size}</span>}</div>
      </div>
    )
  }

  return <div>{link} <span style={{fontSize:10,color:T.muted}}>{size}</span></div>
}

// ── Message List ──────────────────────────────────────────────────────────────
function MsgList({ msgs, me, isAdmin, onDel, onBatchDel, onReply, onEdit, onReact, onMediaClick, onPin, pinnedIds, muteUser, kickUser, banUser, unmuteUser, unbanUser, roomMutes, roomBans, onMention }) {
  const [emojiPicker, setEmojiPicker] = useState(null)
  const [activeMsg, setActiveMsg] = useState(null)
  const [multiSelect, setMultiSelect] = useState(false)
  const [selectedIds, setSelectedIds] = useState([])
  const { openContextMenu } = useMenu()
  const REACTIONS = ['👍','❤️','😂','😮','😢','🎉','🔥','👀']
  const grouped = useMemo(() => {
    const g = []; let last = null
    for (const m of msgs) {
      const dt = fmtDt(m.created_at)
      if (dt !== last?.date) g.push({ type:'date', date:dt, ts:m.created_at })
      if (!last || last.sender !== m.sender || last.date !== dt) { g.push(m); last = { ...m, date:dt } }
      else { if (!last.group) { last.group = [last]; g[g.length-1] = last } last.group.push(m) }
    }
    return g
  }, [msgs])

  const isPinned = (id) => Array.isArray(pinnedIds) && pinnedIds.includes(id)

  const toggleSelect = useCallback((id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }, [])

  const handleCtx = useCallback((e, m) => {
    e.preventDefault()
    e.stopPropagation()
    setActiveMsg(m.id)
    const items = [
      { icon:'↩', label:'Reply', action:() => onReply(m) },
    ]
    if (m.sender === me) items.push({ icon:'✏️', label:'Edit', action:() => onEdit(m) })
    if (m.sender === me || isAdmin) items.push({ icon:'🗑', label:'Delete', variant:'danger', action:() => onDel(m.id) })
    items.push(
      { icon:'📋', label:'Copy text', sublabel:(m.content||'').slice(0,30), action:() => navigator.clipboard?.writeText(m.content||'') },
      { type:'separator' },
    )
    if (onPin) items.push({ icon:'📌', label: isPinned(m.id) ? 'Unpin message' : 'Pin message', color: isPinned(m.id) ? T.accent : undefined, action:() => onPin(m.id) })
    items.push(
      { icon:'😊', label:'React', action:() => { setEmojiPicker(emojiPicker === m.id ? null : m.id) } },
      { type:'separator' },
      { icon:'☑️', label: multiSelect ? 'Exit selection' : 'Select multiple', action:() => { setMultiSelect(v => !v); setSelectedIds([]) } },
    )
    openContextMenu(e, items, { header: m.sender })
  }, [me, isAdmin, onDel, onReply, onEdit, onReact, onPin, onMediaClick, openContextMenu, emojiPicker, multiSelect])

  const batchDel = useCallback(() => {
    if (!onBatchDel || selectedIds.length === 0) return
    onBatchDel(selectedIds)
    setSelectedIds([])
    setMultiSelect(false)
  }, [selectedIds, onBatchDel])

  const batchReact = useCallback((emoji) => {
    selectedIds.forEach(id => onReact(id, emoji))
    setSelectedIds([])
    setMultiSelect(false)
    setEmojiPicker(null)
  }, [selectedIds, onReact])

  return (
    <>
      {/* Multi-select toolbar */}
      {multiSelect && (
        <div style={{ position:'sticky', top:0, zIndex:10, background:T.bg2, borderBottom:`1px solid ${T.border}`, padding:'6px 14px', display:'flex', alignItems:'center', gap:8, fontSize:11, fontFamily:T.mono }}>
          <span style={{ color:T.accent }}>☑ {selectedIds.length} selected</span>
          <button onClick={() => setSelectedIds(msgs.map(m => m.id))} style={{ background:'rgba(255,255,255,0.05)', border:`1px solid ${T.border}`, borderRadius:6, padding:'3px 10px', color:T.text, cursor:'pointer', fontSize:10, fontFamily:T.mono }}>Select all</button>
          <button onClick={() => setSelectedIds([])} style={{ background:'rgba(255,255,255,0.05)', border:`1px solid ${T.border}`, borderRadius:6, padding:'3px 10px', color:T.text, cursor:'pointer', fontSize:10, fontFamily:T.mono }}>Deselect</button>
          {selectedIds.length > 0 && <>
            <button onClick={batchDel} style={{ background:'rgba(255,71,87,0.15)', border:'1px solid rgba(255,71,87,0.3)', borderRadius:6, padding:'3px 10px', color:'#ff4757', cursor:'pointer', fontSize:10, fontFamily:T.mono }}>🗑 Delete ({selectedIds.length})</button>
            <div style={{ position:'relative' }}>
              <button onClick={() => setEmojiPicker(emojiPicker === 'batch' ? null : 'batch')} style={{ background:'rgba(255,255,255,0.05)', border:`1px solid ${T.border}`, borderRadius:6, padding:'3px 10px', color:T.text, cursor:'pointer', fontSize:10, fontFamily:T.mono }}>😊 React</button>
              {emojiPicker === 'batch' && (
                <div style={{ position:'absolute', top:'100%', left:0, marginTop:4, background:T.bg, border:`1px solid ${T.border}`, borderRadius:8, padding:6, display:'flex', gap:4, zIndex:20, boxShadow:'0 8px 32px rgba(0,0,0,0.5)' }}>
                  {REACTIONS.map(e2 => (
                    <button key={e2} onClick={() => batchReact(e2)} style={{ background:'none', border:'none', cursor:'pointer', fontSize:18, padding:'4px 6px', borderRadius:4 }}
                      onMouseEnter={ev => ev.currentTarget.style.background='rgba(255,255,255,0.08)'} onMouseLeave={ev => ev.currentTarget.style.background='none'}>
                      {e2}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>}
          <button onClick={() => { setMultiSelect(false); setSelectedIds([]) }} style={{ background:'none', border:'none', color:T.muted, cursor:'pointer', fontSize:14, marginLeft:'auto' }}>✕</button>
        </div>
      )}
      {grouped.map((item, i) => {
        if (item.type === 'date') return (
          <div key={`d-${i}`} style={{ textAlign:'center', padding:'8px 0', fontFamily:T.mono, fontSize:10, color:T.muted, letterSpacing:1 }}>
            <span style={{ background:'rgba(255,255,255,0.04)', padding:'2px 10px', borderRadius:10 }}>{item.date}</span>
          </div>
        )
        const isMe = item.sender === me
        const group = item.group || [item]
        return (
          <div key={item.id || i} data-msg-id={item.id} style={{ display:'flex', gap:10, padding:'4px 14px', alignItems:'flex-start', flexDirection: isMe ? 'row-reverse' : 'row', background: selectedIds.includes(item.id) ? 'rgba(0,255,136,0.06)' : activeMsg === item.id ? 'rgba(0,212,255,0.04)' : 'transparent' }}
            onContextMenu={e => handleCtx(e, item)}>
            {multiSelect && (
              <div onClick={() => toggleSelect(item.id)} style={{ cursor:'pointer', flexShrink:0, display:'flex', alignItems:'center', height:34, justifyContent:'center' }}>
                <div style={{ width:16, height:16, borderRadius:3, border: selectedIds.includes(item.id) ? `1.5px solid ${T.accent}` : `1.5px solid ${T.border}`, background: selectedIds.includes(item.id) ? T.accent : 'transparent', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, color:'#000' }}>
                  {selectedIds.includes(item.id) && '✓'}
                </div>
              </div>
            )}
            <Av name={item.sender} size={34}/>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ display:'flex', alignItems:'baseline', gap:8, marginBottom:2, flexDirection: isMe ? 'row-reverse' : 'row' }}>
                <span onContextMenu={e => { e.preventDefault(); contextMenu.open(e, [
                    { icon:'👤', label:item.sender, sublabel:me === item.sender ? 'You' : item.sender },
                    { type:'separator' },
                    ...(me !== item.sender ? [{ icon:'↩', label:'Reply to', action:() => onReply(item) }] : []),
                    ...(me !== item.sender ? [{ icon:'💬', label:'Mention', action:() => onMention?.(item.sender) }] : []),
                    ...(isAdmin && me !== item.sender ? [
                      { type:'separator' },
                      ...(roomMutes.some(m => m.username === item.sender)
                        ? [{ icon:'🔊', label:'Unmute User', color:T.accent, action:async () => { await unmuteUser(item.sender) } }]
                        : [{ icon:'🔇', label:'Mute User', color:T.warn, action:async () => { const dur = await dialog.prompt({ title:`Mute ${item.sender}`, placeholder:'Minutes (0=permanent)', defaultValue:'60' }); if (dur !== null) muteUser(item.sender, parseInt(dur||'60')) } }]),
                      { icon:'🚫', label:'Kick User', color:'#ff6b35', action:async () => { const ok = await dialog.confirm({ title:`Kick ${item.sender}?`, confirmLabel:'KICK', variant:'danger' }); if (ok) kickUser(item.sender) } },
                      ...(roomBans.some(b => b.username === item.sender)
                        ? [{ icon:'✅', label:'Unban User', color:T.accent, action:async () => { await unbanUser(item.sender) } }]
                        : [{ icon:'⛔', label:'Ban User', color:T.danger, action:async () => { const ok = await dialog.confirm({ title:`Ban ${item.sender}?`, message:'Until manually unbanned.', confirmLabel:'BAN', variant:'danger' }); if (ok) banUser(item.sender) } }]),
                    ] : []),
                  ], { header: item.sender }) }} style={{ fontWeight:700, fontSize:13, color:aCol(item.sender), fontFamily:T.display, cursor:'pointer' }}>{item.sender}</span>
                <span style={{ fontSize:10, color:T.muted, fontFamily:T.mono }}>{fmt(item.created_at)}</span>
                {item.edited && <span style={{ fontSize:9, color:T.muted, fontStyle:'italic' }}>(edited)</span>}
                {isPinned(item.id) && <span style={{ fontSize:9, color:T.accent }}>📌</span>}
              </div>
              {group.map((m, gi) => (
                <div key={m.id||gi} style={{ marginBottom:2, textAlign: isMe ? 'right' : 'left' }}>
                  {m.reply_to && (
                    <div style={{ borderLeft:`2px solid ${T.accentB}`, paddingLeft:8, marginBottom:4, fontFamily:T.mono, fontSize:10, color:T.muted, textAlign:'left' }}>
                      <span style={{ color:T.accentB }}>↩ {m.reply_to.sender}: </span>{m.reply_to.content?.slice(0,100)}
                    </div>
                  )}
                  <div style={{ lineHeight:1.5, fontSize:13, color:T.text, wordBreak:'break-word' }}>
                    {['image', 'video', 'audio', 'file'].includes(m.type) ? (
                      <AttachmentPreview msg={m} onMediaClick={onMediaClick} />
                    ) : <Md text={m.content}/>}
                    {m.type==='text' && <MediaPreviews text={m.content} onMediaClick={onMediaClick} />}
                  </div>
                  {/* Reactions */}
                  {m.reactions && Object.keys(m.reactions).length > 0 && (
                    <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginTop:3, justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
                      {Object.entries(m.reactions).map(([emoji, users]) => (
                        <button key={emoji} onClick={()=>onReact(m.id, emoji)}
                          style={{ padding:'1px 7px', border:`1px solid ${(users||[]).includes(me)?'rgba(0,255,136,0.4)':T.border}`, borderRadius:10,
                            background:(users||[]).includes(me)?'rgba(0,255,136,0.08)':'rgba(255,255,255,0.03)',
                            color:T.text, fontFamily:T.mono, fontSize:11, cursor:'pointer', display:'flex', alignItems:'center', gap:4 }}>
                          {emoji} <span style={{fontSize:9,color:T.muted}}>{users?.length||0}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {/* Hover actions */}
                  <div style={{ display:'flex', gap:4, marginTop:3, opacity:0, transition:'opacity 0.15s', justifyContent: isMe ? 'flex-end' : 'flex-start', alignItems:'center', position:'relative' }}
                    onMouseEnter={e => { e.currentTarget.style.opacity = 1 }}
                    onMouseLeave={e => { e.currentTarget.style.opacity = 0; setEmojiPicker(null) }}>
                    <button onClick={()=>onReply(m)} title="Reply" style={{ background:'none', border:'none', color:T.muted, cursor:'pointer', fontSize:10 }}>↩</button>
                    <button onClick={()=>{ setEmojiPicker(emojiPicker === m.id ? null : m.id) }} title="React" style={{ background:'none', border:'none', color:T.muted, cursor:'pointer', fontSize:10 }}>😊</button>
                    {isMe && <button onClick={()=>onEdit(m)} title="Edit" style={{ background:'none', border:'none', color:T.muted, cursor:'pointer', fontSize:10 }}>✏</button>}
                    <button onClick={()=>navigator.clipboard?.writeText(m.content||'')} title="Copy" style={{ background:'none', border:'none', color:T.muted, cursor:'pointer', fontSize:10 }}>📋</button>
                    {(isMe||isAdmin) && <button onClick={()=>onDel(m.id)} title="Delete" style={{ background:'none', border:'none', color:'#ff4757', cursor:'pointer', fontSize:10 }}>🗑</button>}
                    {emojiPicker === m.id && (
                      <div style={{ position:'absolute', bottom:'100%', left:0, background:T.bg2, border:`1px solid ${T.border}`, borderRadius:8, padding:'4px 6px', display:'flex', gap:3, zIndex:10, boxShadow:'0 4px 16px rgba(0,0,0,0.4)' }}>
                        {REACTIONS.map(e2 => (
                          <button key={e2} onClick={()=>{ onReact(m.id, e2); setEmojiPicker(null) }}
                            style={{ background:'none', border:'none', cursor:'pointer', fontSize:16, padding:'2px 4px', borderRadius:4 }}
                            onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.08)'}
                            onMouseLeave={e => e.currentTarget.style.background='none'}>
                            {e2}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </>
  )
}

// ── Voice/Video Call Panel (LiveKit) ──────────────────────────────────────────
function LiveKitCallPanel({ room, onLeave, muted, camOff, onMute, onCam, onScreen, canScreenShare, me, onParticipantsChange }) {
  const [connecting, setConnecting] = useState(true)
  const [participants, setParticipants] = useState([])
  const [error, setError] = useState('')
  const [errorDetail, setErrorDetail] = useState('')
  const [screenActive, setScreenActive] = useState(false)
  const [cameras, setCameras] = useState([])
  const [camIndex, setCamIndex] = useState(0)
  const [screenStream, setScreenStream] = useState(null)
  const [speakingMap, setSpeakingMap] = useState({})
  const [localSpeaking, setLocalSpeaking] = useState(false)
  const roomRef = useRef(null)
  const audioElsRef = useRef({})
  const speakingIntervalRef = useRef(null)

  const updateParticipants = (lkRoom) => {
    const list = []
    lkRoom.remoteParticipants.forEach(p => {
      let videoTrack = null
      p.trackPublications.forEach(pub => {
        if (pub.track && pub.source !== 'screen_share' && pub.kind === 'video') {
          videoTrack = pub.track
        }
      })
      const meta = parseParticipantMetadata(p.metadata)
      const rawName = meta.username || p.name || p.identity
      const displayName = isUuidLike(rawName) ? (isUuidLike(p.identity) ? 'User' : p.identity) : rawName
      list.push({
        identity: p.identity,
        name: rawName,
        displayName,
        role: meta.role || 'member',
        isMicrophoneEnabled: p.isMicrophoneEnabled,
        isCameraEnabled: p.isCameraEnabled,
        isScreenShareEnabled: p.isScreenShareEnabled,
        videoTrack,
      })
    })
    setParticipants(list)
    onParticipantsChange?.(list)
  }

  useEffect(() => {
    let cancelled = false
    const connect = async () => {
      try {
        setConnecting(true)
        setError('')
        setErrorDetail('')

        // Use pre-fetched token from joinCall
        const token = room._lkToken
        const url = room._lkUrl

        if (!token || !url) {
          setError('Missing connection credentials')
          setConnecting(false)
          return
        }

        // Import LiveKit client
        let Room, RoomEvent
        try {
          const lk = await import('livekit-client')
          Room = lk.Room
          RoomEvent = lk.RoomEvent
        } catch {
          setError('LiveKit client not installed')
          setErrorDetail('Run: npm install livekit-client @livekit/components-react')
          setConnecting(false)
          return
        }

        const lkRoom = new Room({
          adaptiveStream: true,
          dynacast: true,
          autoSubscribe: true,
        })

        lkRoom.on(RoomEvent.ParticipantConnected, () => updateParticipants(lkRoom))
        lkRoom.on(RoomEvent.ParticipantDisconnected, () => updateParticipants(lkRoom))
        lkRoom.on(RoomEvent.TrackSubscribed, (track, pub, participant) => {
          updateParticipants(lkRoom)
          // Attach audio tracks to DOM so other participants can be heard
          if (track && track.kind === 'audio' && track.mediaStreamTrack && participant.identity !== lkRoom.localParticipant?.identity) {
            const key = `${participant.identity}-audio`
            if (!audioElsRef.current[key]) {
              const audioEl = document.createElement('audio')
              audioEl.autoplay = true
              audioEl.playsInline = true
              audioEl.id = key
              document.body.appendChild(audioEl)
              audioElsRef.current[key] = audioEl
            }
            const stream = new MediaStream([track.mediaStreamTrack])
            audioElsRef.current[key].srcObject = stream
          }
          // Handle screen share
          if (pub?.source === 'screen_share' && track?.mediaStreamTrack) {
            setScreenStream(new MediaStream([track.mediaStreamTrack]))
            if (participant.identity === lkRoom.localParticipant?.identity) setScreenActive(true)
          }
        })
        lkRoom.on(RoomEvent.TrackUnsubscribed, (track, pub, participant) => {
          updateParticipants(lkRoom)
          if (pub?.source === 'screen_share') setScreenStream(null)
          // Clean up audio element
          if (track && track.kind === 'audio') {
            const key = `${participant.identity}-audio`
            if (audioElsRef.current[key]) {
              audioElsRef.current[key].srcObject = null
              audioElsRef.current[key].remove()
              delete audioElsRef.current[key]
            }
          }
        })
        lkRoom.on(RoomEvent.LocalTrackPublished, () => updateParticipants(lkRoom))
        lkRoom.on(RoomEvent.Disconnected, () => { if (!cancelled) onLeave() })
        lkRoom.on(RoomEvent.ConnectionStateChanged, (state) => {
          if ((state === 'disconnected' || state === 'failed') && !cancelled) {
            setError('Voice connection failed')
            setErrorDetail('Check LiveKit server URL and API credentials')
          }
        })

        await lkRoom.connect(url, token)
        if (cancelled) { lkRoom.disconnect(); return }

        // Enable End-to-End Encryption for voice/video
        if (room._e2eeKey) {
          try {
            const keyBytes = Uint8Array.from(atob(room._e2eeKey), c => c.charCodeAt(0))
            await lkRoom.setE2EEKey(keyBytes)
          } catch (e) {
            console.warn('[LiveKit] E2EE setup failed (non-fatal):', e.message)
          }
        }

        // Publish local media — always enable mic, camera available on demand
        try {
          await lkRoom.localParticipant.setMicrophoneEnabled(true)
        } catch (mediaErr) {
          console.warn('[LiveKit] mic access denied:', mediaErr.message)
        }

        roomRef.current = lkRoom
        setConnecting(false)
        updateParticipants(lkRoom)

        // Speaking detection — poll every 300ms
        speakingIntervalRef.current = setInterval(() => {
          if (!roomRef.current) return
          const map = {}
          roomRef.current.remoteParticipants.forEach(p => {
            map[p.identity] = p.isSpeaking
          })
          setSpeakingMap(map)
          setLocalSpeaking(roomRef.current.localParticipant?.isSpeaking || false)
        }, 300)
        // Enumerate cameras for switch button
        try {
          const devices = await navigator.mediaDevices.enumerateDevices()
          const cams = devices.filter(d => d.kind === 'videoinput')
          setCameras(cams)
        } catch {}
      } catch (e) {
        console.error('[LiveKit] connect error:', e)
        if (!cancelled) {
          setError(e.message || 'Failed to connect')
          setErrorDetail('Verify LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET are correct')
        }
        setConnecting(false)
      }
    }

    connect()
    return () => {
      cancelled = true
      if (speakingIntervalRef.current) { clearInterval(speakingIntervalRef.current); speakingIntervalRef.current = null }
      // Clean up audio elements
      Object.values(audioElsRef.current).forEach(el => { el.srcObject = null; el.remove() })
      audioElsRef.current = {}
      if (roomRef.current) { roomRef.current.disconnect(); roomRef.current = null }
    }
  }, [room.id])

  // Update mute state
  useEffect(() => {
    roomRef.current?.localParticipant?.setMicrophoneEnabled(!muted)
  }, [muted])

  // Update camera state
  useEffect(() => {
    roomRef.current?.localParticipant?.setCameraEnabled(!camOff)
  }, [camOff])

  const handleScreenShare = async () => {
    try {
      const enabled = roomRef.current?.localParticipant?.isScreenShareEnabled
      await roomRef.current?.localParticipant?.setScreenShareEnabled(!enabled)
      setScreenActive(!enabled)
    } catch {
      // screen share denied or not supported
    }
  }

  const switchCamera = async () => {
    if (cameras.length < 2) return
    const nextIdx = (camIndex + 1) % cameras.length
    try {
      await roomRef.current?.switchActiveDevice('videoinput', cameras[nextIdx].deviceId)
      setCamIndex(nextIdx)
    } catch {}
  }

  const toggleFrontBack = async () => {
    // Toggle between front and back camera on mobile
    try {
      const currentTrack = roomRef.current?.localParticipant?.videoTrackPublications?.values()?.next()?.value?.track
      if (currentTrack) {
        const newFacing = currentTrack.mediaStreamTrack?.getSettings()?.facingMode === 'user' ? 'environment' : 'user'
        await roomRef.current?.localParticipant?.setCameraEnabled(false)
        await roomRef.current?.localParticipant?.setCameraEnabled(true, { facingMode: newFacing })
      } else {
        // No camera yet — start with back camera
        await roomRef.current?.localParticipant?.setCameraEnabled(true, { facingMode: 'environment' })
        setCamOff(false)
      }
    } catch {
      // Fall back to regular switch
      switchCamera()
    }
  }

  if (connecting) {
    return (
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:12 }}>
        <div style={{ width:48, height:48, border:`2px solid ${T.accent}`, borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
        <div style={{ fontFamily:T.mono, fontSize:11, color:T.muted }}>Joining {room.name}...</div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:12, padding:20 }}>
        <div style={{ fontSize:40 }}>⚠️</div>
        <div style={{ fontFamily:T.mono, fontSize:11, color:T.danger, textAlign:'center' }}>{error}</div>
        {errorDetail && <div style={{ fontFamily:T.mono, fontSize:9, color:T.muted, textAlign:'center', maxWidth:300, lineHeight:1.6 }}>{errorDetail}</div>}
        <button onClick={onLeave} style={{ padding:'10px 20px', border:`1px solid ${T.border}`, borderRadius:8, background:'rgba(255,71,87,0.1)', color:T.danger, fontFamily:T.mono, fontSize:11, cursor:'pointer' }}>LEAVE</button>
      </div>
    )
  }

  const typeLabel = room.type === 'video' ? 'Video Call' : 'Voice Chat'
  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', background:T.main }}>
      {/* Call header */}
      <div style={{ padding:'10px 16px', borderBottom:`1px solid ${T.border}`, display:'flex', alignItems:'center', gap:12 }}>
        <span style={{ fontSize:16 }}>{room.type==='video'?'📹':'🔊'}</span>
        <div style={{ flex:1 }}>
          <div style={{ fontFamily:T.display, fontSize:14, fontWeight:700, color:T.text }}>{room.name}</div>
          <div style={{ fontFamily:T.mono, fontSize:9, color:T.muted, letterSpacing:1 }}>{typeLabel} · {participants.length + 1} participant{(participants.length + 1) !== 1 ? 's' : ''}</div>
        </div>
        <div style={{ width:7, height:7, borderRadius:'50%', background:'#23d160' }}/>
      </div>

      {/* Screen share area */}
      {screenStream && (
        <div style={{ flex:'0 0 auto', height:240, background:'#000', borderBottom:`1px solid ${T.border}`, position:'relative', overflow:'hidden' }}>
          <video ref={el => { if (el && el.srcObject !== screenStream) el.srcObject = screenStream }}
            autoPlay playsInline muted style={{ width:'100%', height:'100%', objectFit:'contain' }}/>
          <div style={{ position:'absolute', bottom:8, left:12, background:'rgba(0,0,0,0.65)', borderRadius:6, padding:'2px 10px', fontFamily:T.mono, fontSize:9, color:'#fff', zIndex:2 }}>
            🖥 Screen Share
          </div>
        </div>
      )}

      {/* Participants grid */}
      <div style={{ flex:1, overflowY:'auto', padding:16, display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:10, alignContent:'start' }}>
        {/* Local participant */}
        <div style={{ background:'rgba(0,0,0,0.3)', borderRadius:10, position:'relative', minHeight:140, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', overflow:'hidden', border: localSpeaking ? '2px solid #00ff88' : '2px solid transparent', transition:'border-color 0.15s' }}>
          {(room.type==='video'||cameras.length>0) && !camOff && (
            <video ref={el => {
              if (el && roomRef.current?.localParticipant?.videoTrackPublications?.size > 0) {
                const pub = roomRef.current.localParticipant.videoTrackPublications.values().next().value
                if (pub?.track) el.srcObject = new MediaStream([pub.track.mediaStreamTrack])
              }
            }} autoPlay playsInline muted style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover', transform:'scaleX(-1)' }}/>
          )}
          <div style={{ zIndex:1, display:'flex', flexDirection:'column', alignItems:'center' }}>
            <div style={{ position:'relative' }}>
              <Av name={me} size={48} online/>
              {localSpeaking && <div style={{ position:'absolute', inset:-4, borderRadius:'50%', border:'2px solid #00ff88', boxShadow:'0 0 12px rgba(0,255,136,0.5)', pointerEvents:'none' }}/>}
            </div>
            <div style={{ fontFamily:T.display, fontSize:12, color:T.text, marginTop:8, fontWeight:600 }}>{me}</div>
            <div style={{ marginTop:5 }}><RolePill role={room._myRole} /></div>
            <div style={{ display:'flex', gap:6, marginTop:6 }}>
              <span style={{ width:8, height:8, borderRadius:'50%', background:muted?'#ff4757':'#23d160' }}/>
              {(room.type==='video'||cameras.length>0) && <span style={{ width:8, height:8, borderRadius:'50%', background:camOff?'#ff4757':'#23d160' }}/>}
            </div>
          </div>
        </div>
        {/* Remote participants */}
        {participants.map(p => (
          <div key={p.identity} style={{ background:'rgba(0,0,0,0.3)', borderRadius:10, position:'relative', minHeight:140, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', overflow:'hidden', border: speakingMap[p.identity] ? '2px solid #00ff88' : '2px solid transparent', transition:'border-color 0.15s' }}>
            {p.videoTrack && (
              <video ref={el => { if (el) el.srcObject = new MediaStream([p.videoTrack.mediaStreamTrack]) }}
                autoPlay playsInline muted style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover' }}/>
            )}
            <div style={{ zIndex:1, display:'flex', flexDirection:'column', alignItems:'center' }}>
              <div style={{ position:'relative' }}>
                <Av name={p.displayName} size={48} online/>
                {speakingMap[p.identity] && <div style={{ position:'absolute', inset:-4, borderRadius:'50%', border:'2px solid #00ff88', boxShadow:'0 0 12px rgba(0,255,136,0.5)', pointerEvents:'none' }}/>}
              </div>
              <div style={{ fontFamily:T.display, fontSize:12, color:T.text, marginTop:8, fontWeight:600 }}>{p.displayName}</div>
              <div style={{ marginTop:5 }}><RolePill role={p.role} /></div>
              <div style={{ display:'flex', gap:6, marginTop:6 }}>
                <span style={{ width:8, height:8, borderRadius:'50%', background:p.isMicrophoneEnabled!==false?'#23d160':'#ff4757' }}/>
                {(room.type==='video'||p.isCameraEnabled) && <span style={{ width:8, height:8, borderRadius:'50%', background:p.isCameraEnabled?'#23d160':'#ff4757' }}/>}
                {p.isScreenShareEnabled && <span style={{ fontSize:10, color:T.accentB }}>🖥</span>}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Call controls */}
      <div style={{ borderTop:`1px solid ${T.border}`, padding:'10px 12px', display:'flex', justifyContent:'center', gap:8, flexShrink:0, overflowX:'auto', flexWrap:'wrap' }}>
        <button onClick={onMute} title={muted?'Unmute':'Mute'}
          style={{ width:40, height:40, borderRadius:'50%', border:'none', background:muted?T.danger:'rgba(255,255,255,0.1)', color:'#fff', fontSize:16, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
          {muted?'🔇':'🎤'}
        </button>
        <button onClick={onCam} title={camOff?'Turn on camera':'Turn off camera'}
          style={{ width:40, height:40, borderRadius:'50%', border:'none', background:camOff?T.danger:'rgba(255,255,255,0.1)', color:'#fff', fontSize:16, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
          {camOff?'📷':'📸'}
        </button>
        {cameras.length > 1 && !camOff && (
          <button onClick={switchCamera} title="Switch Camera"
            style={{ width:40, height:40, borderRadius:'50%', border:'none', background:'rgba(255,255,255,0.1)', color:'#fff', fontSize:13, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:T.mono, fontWeight:700, flexShrink:0 }}>
            ↔
          </button>
        )}
        {!camOff && (
          <button onClick={toggleFrontBack} title="Flip Camera"
            style={{ width:40, height:40, borderRadius:'50%', border:'none', background:'rgba(255,255,255,0.1)', color:'#fff', fontSize:14, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            🔄
          </button>
        )}
        {canScreenShare && (
          <button onClick={handleScreenShare} title={screenActive?'Stop Sharing':'Share Screen'}
            style={{ width:40, height:40, borderRadius:'50%', border:screenActive?'2px solid #00ff88':'none',
              background:screenActive?'rgba(0,255,136,0.15)':'rgba(255,255,255,0.1)',
              color:'#fff', fontSize:16, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            🖥
          </button>
        )}
        <button onClick={onLeave} title="Leave"
          style={{ width:40, height:40, borderRadius:'50%', border:'none', background:T.danger, color:'#fff', fontSize:16, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
          ❌
        </button>
      </div>
    </div>
  )
}



// ── Edit bar ─────────────────────────────────────────────────────────────────
function EditBar({ msg, onSave, onCancel }) {
  const [text, setText] = useState(msg.content||'')
  return (
    <div style={{ padding:'8px 14px', background:'rgba(255,215,0,0.06)', borderTop:`1px solid rgba(255,215,0,0.15)`, display:'flex', gap:8 }}>
      <span style={{ fontFamily:T.mono, fontSize:10, color:T.warn, lineHeight:'32px' }}>Editing</span>
      <input value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==='Enter') onSave(msg.id, text)}}
        style={{ flex:1, padding:'6px 10px', background:'rgba(255,255,255,0.05)', border:`1px solid ${T.border}`, borderRadius:8, color:T.text, fontFamily:T.display, fontSize:13, outline:'none' }}/>
      <button onClick={()=>onSave(msg.id, text)} style={{ padding:'6px 14px', border:'none', borderRadius:8, background:T.accent, color:'#000', fontFamily:T.mono, fontSize:11, fontWeight:700, cursor:'pointer' }}>SAVE</button>
      <button onClick={onCancel} style={{ padding:'6px 12px', border:`1px solid ${T.border}`, borderRadius:8, background:'transparent', color:T.muted, cursor:'pointer', fontSize:14 }}>✕</button>
    </div>
  )
}

// ── Media Viewer Modal ────────────────────────────────────────────────────────
function MediaViewer({ media, onClose }) {
  if (!media) return null
  const isVideo = /\.(mp4|webm|mov|ogg|mkv)/i.test(media.url)
  return (
    <div style={{ position:'fixed', inset:0, zIndex:500, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.9)', backdropFilter:'blur(4px)' }}
      onClick={onClose}>
      <div style={{ maxWidth:'90vw', maxHeight:'90vh', position:'relative' }} onClick={e => e.stopPropagation()}>
        {isVideo ? (
          <video src={media.url} controls autoPlay playsInline style={{ maxWidth:'100%', maxHeight:'85vh', borderRadius:8 }}/>
        ) : (
          <img src={media.url} alt="" style={{ maxWidth:'100%', maxHeight:'85vh', borderRadius:8, objectFit:'contain' }}/>
        )}
        <button onClick={onClose} style={{ position:'absolute', top:-12, right:-12, width:32, height:32, borderRadius:'50%', border:'none', background:'rgba(255,255,255,0.15)', color:'#fff', fontSize:16, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', backdropFilter:'blur(8px)' }}>✕</button>
        <div style={{ textAlign:'center', marginTop:8, fontFamily:T.mono, fontSize:9, color:'rgba(255,255,255,0.4)' }}>
          Click outside to close
        </div>
      </div>
    </div>
  )
}

// ── Mini Call Bar ─────────────────────────────────────────────────────────────
function MiniCallBar({ room, muted, camOff, deafened, onMute, onDeafen, onCam, onLeave, onReturn, participants }) {
  return (
    <div style={{ flexShrink:0, borderBottom:`1px solid ${T.border}`, background:'rgba(10,12,18,0.97)', padding:'6px 10px', display:'flex', alignItems:'center', gap:6, overflowX:'auto' }}>
      <button onClick={onReturn} style={{ flex:1, display:'flex', alignItems:'center', gap:8, background:'rgba(0,255,136,0.06)', border:`1px solid ${T.border}`, borderRadius:8, padding:'6px 12px', cursor:'pointer', color:T.text, textAlign:'left', minWidth:0 }}
        onMouseEnter={e=>e.currentTarget.style.background='rgba(0,255,136,0.12)'}
        onMouseLeave={e=>e.currentTarget.style.background='rgba(0,255,136,0.06)'}>
        <span style={{ fontSize:14 }}>{room.type==='video'?'📹':'🔊'}</span>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontFamily:T.mono, fontSize:10, color:T.accent, fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {room.name}
          </div>
          <div style={{ fontFamily:T.mono, fontSize:8, color:T.muted }}>
            {participants.length + 1} connected · Click to return
          </div>
        </div>
      </button>
      <button onClick={onMute} title={muted?'Unmute':'Mute'}
        style={{ width:32, height:32, borderRadius:'50%', border:'none', background:muted?T.danger:'rgba(255,255,255,0.1)', color:'#fff', fontSize:13, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
        {muted?'🔇':'🎤'}
      </button>
      <button onClick={onDeafen} title={deafened?'Undeafen':'Deafen'}
        style={{ width:32, height:32, borderRadius:'50%', border:'none', background:deafened?T.danger:'rgba(255,255,255,0.1)', color:'#fff', fontSize:13, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
        {deafened?'🔊❌':'🎧'}
      </button>
      <button onClick={onCam} title={camOff?'Camera on':'Camera off'}
        style={{ width:32, height:32, borderRadius:'50%', border:'none', background:camOff?'rgba(255,255,255,0.05)':'rgba(255,255,255,0.1)', color:'#fff', fontSize:13, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
        {camOff?'📷':'📸'}
      </button>
      <button onClick={onLeave} title="Leave"
        style={{ width:32, height:32, borderRadius:'50%', border:'none', background:T.danger, color:'#fff', fontSize:14, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
        ❌
      </button>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
export default function AdminChat({ embedded=false }) {
  const standalone = !embedded
  const notify = useNotify()
  const { confirm: dlgConfirm, prompt: dlgPrompt } = useDialog()
  const [mounted, setMounted] = useState(false)
  const token = mounted ? getToken() : null
  const [me, setMe] = useState(null)
  const meRef = useRef(null)
  const [role, setRole] = useState(null)
  const [profile, setProfile] = useState({ username: '', role: 'user', avatar: '' })
  const isAdmin = role === 'admin' || role === 'moderator'

  // Initialize user data after mount (client-only)
  useEffect(() => {
    setMounted(true)
    const t = getToken()
    if (t) {
      const name = getUsername() || parseJwt(t)?.username || null
      if (name) { setMe(name); meRef.current = name }
      const r = getRole() || 'user'
      setRole(r)
      setProfile({ username: name || '', role: r, avatar: '' })
    }
  }, [])

  const [rooms, setRooms] = useState([])
  const [room, setRoom] = useState(null)
  const [msgs, setMsgs] = useState([])
  const [online, setOnline] = useState([])
  const [roomMembers, setRoomMembers] = useState([])
  const [unread, setUnread] = useState({})
  const [input, setInput] = useState('')
  const [searchQ, setSearchQ] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [showEmoji, setShowEmoji] = useState(false)
  const [pinnedIds, setPinnedIds] = useState([])
  const [replyTo, setReplyTo] = useState(null)
  const [editing, setEditing] = useState(null)
  const [mediaViewer, setMediaViewer] = useState(null)
  const [typing, setTyping] = useState([])
  const typingTimeoutRef = useRef(null)
  const [modal, setModal] = useState(null)
  const [showOnline, setShowOnline] = useState(false)
  const [showSidebar, setShowSidebar] = useState(false)
  const [showAdminMenu, setShowAdminMenu] = useState(false)
  const [modTarget, setModTarget] = useState(null)
  const [modAction, setModAction] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [muted, setMuted] = useState(false)
  const [camOff, setCamOff] = useState(false)
  const [deafened, setDeafened] = useState(false)
  const [isMutedByStaff, setIsMutedByStaff] = useState(false)
  const [roomMutes, setRoomMutes] = useState([])
  const [roomBans, setRoomBans] = useState([])

  const [roomRoles, setRoomRoles] = useState([])
  const [modSection, setModSection] = useState(null)
  const [inviteQ, setInviteQ] = useState('')
  const [inviteResults, setInviteResults] = useState([])
  const [inviteRole, setInviteRole] = useState('member')
  const [inviteSearching, setInviteSearching] = useState(false)
  const [newRoleName, setNewRoleName] = useState('')
  const [newRoleColor, setNewRoleColor] = useState('#00ff88')
  const [newRolePerms, setNewRolePerms] = useState([])

  const [callRoom, setCallRoom] = useState(null)
  const [canScreenShare, setCanScreenShare] = useState(false)
  const [callParticipants, setCallParticipants] = useState([])
  const [roomKey, setRoomKey] = useState('')

  // Fetch room encryption key for text messages (cached per room)
  useEffect(() => {
    if (!room || (room.type === 'voice' || room.type === 'video')) { setRoomKey(''); setRoomKeyModule(''); return }
    const cached = _roomKeyCache[room.id]
    if (cached) {
      setRoomKey(cached); setRoomKeyModule(cached)
      return
    }
    api.get(`/chat/rooms/${room.id}/encryption-key`).then(r => {
      const key = r.data?.encryption_key || ''
      setRoomKey(key); setRoomKeyModule(key)
      if (key) _roomKeyCache[room.id] = key
    }).catch(() => { setRoomKey(''); setRoomKeyModule('') })
  }, [room?.id])

  const listRef = useRef(null)
  const fileRef = useRef(null)
  const inputRef = useRef(null)
  const adminMenuRef = useRef(null)
  const [isMobile, setIsMobile] = useState(false)
  const [atBottom, setAtBottom] = useState(true)
  const [newBelow, setNewBelow] = useState(0)
  useEffect(() => {
    setIsMobile(window.innerWidth < 768)
    const handleResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])
  const roomIdRef = useRef(null)
  const oldestRef = useRef(null)

  // Close MOD menu on outside click
  useEffect(() => {
    if (!showAdminMenu) return
    const handler = e => { if (adminMenuRef.current && !adminMenuRef.current.contains(e.target)) { setShowAdminMenu(false); setModAction(null); setModTarget(null); setModSection(null); setInviteQ(''); setInviteResults([]) } }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showAdminMenu])

  // ── Fetch real role from server immediately on mount ────────────────────
  useEffect(() => {
    if (!mounted || !token) return
    let cancelled = false
            api.get('/auth/verify').then(r => {
      if (cancelled || !r.data?.user) return
      const nextUser = r.data.user
      setEffectiveAccess(nextUser)
      const nextName = nextUser.username || getUsername() || parseJwt(token)?.username
      const nextRole = nextUser.role || getRole() || 'user'
      if (nextName) { setMe(nextName); meRef.current = nextName }
      setRole(nextRole)
      setProfile({ username: nextName || me, role: nextRole, avatar: nextUser.avatar || '' })
    }).catch(() => {})
    return () => { cancelled = true }
  }, [mounted])

  // ── Fetch rooms ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mounted) return
    let cancelled = false
    api.get('/chat/rooms').then(r => {
      if (cancelled) return
      const data = r.data || []
      setRooms(data)
      if (!room && data.length) setRoom(data[0])
    }).catch(()=>{})
    return () => { cancelled = true }
  }, [mounted])

  // ── Global presence via Supabase Realtime ─────────────────────────────────
  useEffect(() => {
    if (!mounted || (!getSB()) || !me) return

    const payload = parseJwt(getToken() || '')
    const presenceKey = String(payload?.id || payload?.staff_id || me)
    const channel = getSB().channel('chat_global', {
      configs: { presence: { key: presenceKey } },
    })

    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState()
      const next = Object.keys(state).map(key => {
        const meta = state[key]?.[0]?.metadata || state[key]?.[0] || {}
        const p = typeof meta === 'string' ? (()=>{try{return JSON.parse(meta)}catch{return {}}})() : meta
        const username = p.username || (!isUuidLike(key) ? key : 'User')
        return {
          presenceKey: key,
          username,
          role: p.role || 'member',
          avatar: p.avatar || '',
          voice_room_id: p.voice_room_id || null,
          voice_room_name: p.voice_room_name || '',
        }
      })
      const byKey = new Map()
      next.forEach(u => byKey.set(u.presenceKey, u))
      setOnline([...byKey.values()].sort((a, b) => a.username.localeCompare(b.username)))
    })

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({
          online_at: new Date().toISOString(),
          username: profile.username || me,
          role: profile.role || role || 'member',
          avatar: profile.avatar || '',
          voice_room_id: callRoom?.id || null,
          voice_room_name: callRoom?.name || '',
        })
      }
    })

    return () => { const s = getSB(); if (s) s.removeChannel(channel) }
  }, [mounted, me, role, profile.username, profile.role, profile.avatar, callRoom?.id, callRoom?.name])

  // ── Global unread tracking ───────────────────────────────────────────────
  useEffect(() => {
    if (!mounted || (!getSB())) return

    const channel = getSB().channel('chat_unread')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages' },
        (payload) => {
          const msgRoomId = payload.new.room_id
          if (!msgRoomId || msgRoomId === roomIdRef.current) return
          setUnread(prev => ({ ...prev, [msgRoomId]: (prev[msgRoomId] || 0) + 1 }))
        }
      )
      .subscribe()

    return () => { const s = getSB(); if (s) s.removeChannel(channel) }
  }, [mounted])

  // ── Realtime staff sync ──────────────────────────────────────────────────
  useEffect(() => {
    if (!mounted || (!getSB()) || !me) return
    let cancelled = false
    const channel = getSB().channel('chat_staff_sync')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'staff_users' },
        (payload) => {
          const row = payload.new || payload.old
          if (row?.username === me && !cancelled) {
    api.get('/auth/verify').then(r => {
              if (!cancelled && r.data?.user) {
                const nextUser = r.data.user
                setEffectiveAccess(nextUser)
                const nextRole = nextUser.role || getRole() || 'user'
                setRole(nextRole)
                setProfile({ username: nextUser.username || me, role: nextRole, avatar: nextUser.avatar || '' })
              }
            }).catch(() => {})
          }
        }
      )
      .subscribe()
    return () => { const s = getSB(); if (s) s.removeChannel(channel); cancelled = true }
  }, [mounted, me])

  // ── Periodic role poll (fallback) ───────────────────────────────────────
  useEffect(() => {
    if (!mounted || !me) return
    let cancelled = false
    const intervalId = setInterval(() => {
      api.get('/auth/me')
        .then(r => {
          if (!cancelled && r.data?.user) {
            const nextUser = r.data.user
            setEffectiveAccess(nextUser)
            const nextRole = nextUser.role || getRole() || 'user'
            setRole(nextRole)
            setProfile({ username: nextUser.username || me, role: nextRole, avatar: nextUser.avatar || '' })
          }
        })
        .catch(() => {})
    }, 600000) // every 10 minutes (backup; Realtime handles live updates)
    return () => { clearInterval(intervalId); cancelled = true }
  }, [mounted, me])

  // ── Track oldest message timestamp for pagination ────────────────────────
  const prevMsgLenRef = useRef(0)
  useEffect(() => {
    if (msgs.length) oldestRef.current = msgs[0]?.created_at
    if (atBottom && listRef.current) {
      setTimeout(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }), 50)
      setNewBelow(0)
    } else if (!atBottom && msgs.length > prevMsgLenRef.current) {
      setNewBelow(prev => prev + (msgs.length - prevMsgLenRef.current))
    }
    prevMsgLenRef.current = msgs.length
  }, [msgs, atBottom])

  // ── Room messages + subscriptions ────────────────────────────────────────
  useEffect(() => {
    if (!room || (!getSB())) return
    roomIdRef.current = room.id
    setLoadingMsgs(true)
    setAtBottom(true)

    // Reset unread for current room
    setUnread(prev => { const n={...prev}; delete n[room.id]; return n })

    // Fetch messages first
    api.get(`/chat/rooms/${room.id}/messages?limit=50`).then(r => {
      const data = r.data||[]
      setMsgs(data)
      setHasMore(data.length >= 50)
      setLoadingMsgs(false)
      requestAnimationFrame(() => { setTimeout(() => { listRef.current?.scrollTo(0, listRef.current.scrollHeight) }, 50) })
    }).catch(() => setLoadingMsgs(false))

    // Fetch room members for admin actions
    api.get(`/chat/rooms/${room.id}/members`).then(r => {
      setRoomMembers(Array.isArray(r.data) ? r.data : [])
    }).catch(() => setRoomMembers([]))

    // Check mute/ban status
    api.get(`/chat/rooms/${room.id}/is-muted`).then(r => setIsMutedByStaff(r.data?.muted||false)).catch(()=>{})

    // Subscribe to realtime changes
    const sb = getSB()
    if (!sb) return () => {}
    const msgSub = sb
      .channel(`chat:${room.id}`)
      .on('postgres_changes', { event:'INSERT', schema:'public', table:'chat_messages', filter:`room_id=eq.${room.id}` },
        (payload) => {
          setMsgs(prev => {
            if (prev.find(m => m.id === payload.new.id)) return prev
            return [...prev, payload.new]
          })
          beep()
        })
      .on('postgres_changes', { event:'UPDATE', schema:'public', table:'chat_messages', filter:`room_id=eq.${room.id}` },
        (payload) => { setMsgs(prev => prev.map(m => m.id===payload.new.id ? payload.new : m)) })
      .on('postgres_changes', { event:'DELETE', schema:'public', table:'chat_messages', filter:`room_id=eq.${room.id}` },
        (payload) => { setMsgs(prev => prev.filter(m => m.id!==payload.old.id)) })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('[Chat] Realtime subscription failed:', status)
        }
      })

    return () => {
      const s = getSB(); if (s) s.removeChannel(msgSub)
    }
  }, [room?.id])

  // ── Typing indicator via Supabase broadcast ──────────────────────────────
  useEffect(() => {
    if (!room || (!getSB()) || !me) return
    const channel = getSB().channel(`typing:${room.id}`)
    channel.on('broadcast', { event: 'typing' }, (payload) => {
      if (payload.payload?.username && payload.payload?.username !== me) {
        setTyping(prev => {
          const exists = prev.find(t => t === payload.payload.username)
          if (exists) return prev
          return [...prev, payload.payload.username]
        })
        // Auto-remove after 3s
        setTimeout(() => {
          setTyping(prev => prev.filter(t => t !== payload.payload.username))
        }, 3000)
      }
    })
    channel.subscribe()
    return () => { const s = getSB(); if (s) s.removeChannel(channel) }
  }, [room?.id, me])

  // ── Realtime mute/ban enforcement ──────────────────────────────────────
  useEffect(() => {
    if (!room || !getSB() || !me) return
    const sb = getSB()
    const loadMod = loadModListsRef.current
    const modSub = sb
      .channel(`mod:${room.id}`)
      .on('postgres_changes', { event:'INSERT', schema:'public', table:'chat_mutes', filter:`room_id=eq.${room.id}` },
        (payload) => {
          if (payload.new.username === me) {
            setIsMutedByStaff(true)
            notify.error('You have been muted in this channel')
          }
          loadMod()
        })
      .on('postgres_changes', { event:'DELETE', schema:'public', table:'chat_mutes', filter:`room_id=eq.${room.id}` },
        (payload) => {
          if (payload.old.username === me) {
            setIsMutedByStaff(false)
            notify.success('You have been unmuted')
          }
          loadMod()
        })
      .on('postgres_changes', { event:'INSERT', schema:'public', table:'chat_bans', filter:`room_id=eq.${room.id}` },
        (payload) => {
          if (payload.new.username === me) {
            notify.error('You have been banned from this channel')
            setTimeout(() => { setRoom(null); setMsgs([]) }, 1500)
          }
          api.get(`/chat/rooms/${room.id}/members`).then(r => setRoomMembers(Array.isArray(r.data) ? r.data : [])).catch(() => {})
          loadMod()
        })
      .on('postgres_changes', { event:'DELETE', schema:'public', table:'chat_bans', filter:`room_id=eq.${room.id}` },
        (payload) => {
          if (payload.old.username === me) {
            notify.success('You have been unbanned from this channel')
          }
          loadMod()
        })
      .on('postgres_changes', { event:'INSERT', schema:'public', table:'chat_members', filter:`room_id=eq.${room.id}` },
        () => {
          api.get(`/chat/rooms/${room.id}/members`).then(r => setRoomMembers(Array.isArray(r.data) ? r.data : [])).catch(() => {})
        })
      .on('postgres_changes', { event:'DELETE', schema:'public', table:'chat_members', filter:`room_id=eq.${room.id}` },
        (payload) => {
          if (payload.old.username === me) {
            notify.error('You have been removed from this channel')
            setTimeout(() => { setRoom(null); setMsgs([]) }, 1500)
          }
          api.get(`/chat/rooms/${room.id}/members`).then(r => setRoomMembers(Array.isArray(r.data) ? r.data : [])).catch(() => {})
        })
      .subscribe()
    return () => { sb.removeChannel(modSub) }
  }, [room?.id, me])

  const broadcastTyping = useCallback(() => {
    if (!room || (!getSB()) || !me) return
    getSB().channel(`typing:${room.id}`).send({
      type: 'broadcast',
      event: 'typing',
      payload: { username: me },
    })
  }, [room?.id, me])

  // ── Keyboard shortcuts (Ctrl+K = search, Escape = close search) ─────────
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); setShowSearch(s => !s) }
      if (e.key === 'Escape') { setShowSearch(false); setSearchQ('') }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // ── Pin message ─────────────────────────────────────────────────────────
  const togglePin = useCallback((msgId) => {
    setPinnedIds(prev => prev.includes(msgId) ? prev.filter(id => id !== msgId) : [...prev, msgId])
  }, [])

  // ── Filtered messages for search ──────────────────────────────────────────
  const filteredMsgs = useMemo(() => {
    if (!searchQ.trim()) return msgs
    const q = searchQ.toLowerCase()
    return msgs.filter(m => (m.content||'').toLowerCase().includes(q) || (m.sender||'').toLowerCase().includes(q))
  }, [msgs, searchQ])

  // ── Typing indicator text ────────────────────────────────────────────────
  const typLabel = useMemo(() => {
    if (!typing.length) return null
    if (typing.length === 1) return `${typing[0]} is typing…`
    if (typing.length === 2) return `${typing[0]} and ${typing[1]} are typing…`
    return `${typing[0]} and ${typing.length - 1} others are typing…`
  }, [typing])

  // ── Join voice/video room ─────────────────────────────────────────────────
  const joinCall = useCallback(async (r) => {
    // Leave any existing call first
    if (callRoom) leaveCall()

    if (!navigator.mediaDevices?.getUserMedia) {
      notify.error('Microphone/Camera access is not available in this browser')
      return
    }
    try {
      const tokenRes = await api.get(`/chat/livekit/token?room_id=${r.id}`)
      const { token, url, can_publish, can_screen_share, encryption_key, role: tokenRole } = tokenRes.data
      if (!token) { notify.error('LiveKit token was empty — check backend env vars'); return }
      if (!url) { notify.error('LiveKit URL was empty — check LIVEKIT_URL env var'); return }
      setCallRoom({ ...r, _lkToken: token, _lkUrl: url, _canPublish: can_publish, _canScreenShare: can_screen_share, _e2eeKey: encryption_key, _myRole: tokenRole || role || 'member' })
      setCanScreenShare(can_screen_share || isAdmin)
      setMuted(false)
      setCamOff(false)
    } catch (e) {
      const status = e.response?.status
      const detail = e.response?.data?.detail || ''
      if (status === 403) notify.error(detail || 'No permission to join this voice channel')
      else if (detail) notify.error(detail)
      else notify.error('Cannot join voice channel — check connection')
    }
  }, [isAdmin, callRoom])

  const leaveCall = useCallback(() => {
    setCallRoom(null)
    setCanScreenShare(false)
    setCallParticipants([])
  }, [])

  const togMute = () => setMuted(m => !m)
  const togCam = () => setCamOff(c => !c)

  // ── Messages ──────────────────────────────────────────────────────────────
  const sendMsg = async (e) => {
    if (e) e.preventDefault()
    const txt = input.trim()
    if (!txt || !room) return
    if (isMutedByStaff) { notify.error('You are muted in this channel'); return }
    const replySnapshot = replyTo
    setInput('')
    setReplyTo(null)
    if (inputRef.current) {
      inputRef.current.value = ''
      inputRef.current.style.height = 'auto'
    }
    try {
      const encrypted = roomKey ? ENCRYPTED_PREFIX + await encryptText(txt, roomKey) : txt
      await api.post(`/chat/rooms/${room.id}/messages`, {
        content: encrypted, type:'text',
        reply_to: replySnapshot ? { id: replySnapshot.id, sender: replySnapshot.sender, content: replySnapshot.content } : null
      })
    } catch (err) {
      notify.error(err.response?.data?.detail || 'Send failed')
    }
  }

  const delMsg = useCallback(async id => {
    const ok = await dlgConfirm({ title:'Delete message?', message:'This cannot be undone.', confirmLabel:'DELETE', variant:'danger' })
    if (!ok) return
    setMsgs(prev => prev.filter(m => m.id !== id))
    try { await api.delete(`/chat/messages/${id}`) } catch { setMsgs(prev => [...prev]) }
  }, [dlgConfirm])

  const batchDelMessages = useCallback(async ids => {
    const ok = await dlgConfirm({ title:`Delete ${ids.length} messages?`, message:'This cannot be undone.', confirmLabel:`DELETE ${ids.length}`, variant:'danger' })
    if (!ok) return
    setMsgs(prev => prev.filter(m => !ids.includes(m.id)))
    try { await Promise.all(ids.map(id => api.delete(`/chat/messages/${id}`))) } catch {}
  }, [dlgConfirm])

  const react = useCallback(async (msgId, emoji) => {
    try { await api.patch(`/chat/messages/${msgId}/react`, { emoji }) } catch {}
  }, [])

  const saveEdit = useCallback(async (msgId, content) => {
    try { await api.patch(`/chat/messages/${msgId}`, { content }); setEditing(null) } catch {}
  }, [])

  const sendFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !room) return
    if (file.size > 10*1024*1024) { notify.error('File too large (max 10 MB)'); return }
    setUploading(true)
    try {
      const form = new FormData(); form.append('file', file)
      const up = await api.post('/upload/single', form, { headers:{'Content-Type':'multipart/form-data'} })
      const kind = mediaKind(up.data.url, file.type, file.name)
      await api.post(`/chat/rooms/${room.id}/messages`, {
        content: up.data.url, type: kind, file_name: file.name, file_size: String(file.size)
      })
    } catch { notify.error('Upload failed') }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = '' }
  }

  const handlePaste = async (e) => {
    const items = e.clipboardData?.items
    if (!items || !room) return
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (!file) continue
        setUploading(true)
        try {
          const form = new FormData(); form.append('file', file)
          const up = await api.post('/upload/single', form, { headers:{'Content-Type':'multipart/form-data'} })
          const kind = mediaKind(up.data.url, file.type, file.name)
          await api.post(`/chat/rooms/${room.id}/messages`, {
            content: up.data.url, type: kind, file_name: file.name, file_size: String(file.size)
          })
        } catch { notify.error('Image upload failed') }
        finally { setUploading(false) }
      }
    }
  }

  const loadOlder = useCallback(async () => {
    if (!room || loadingMore || !hasMore) return
    const oldest = oldestRef.current
    if (!oldest) return
    setLoadingMore(true)
    try {
      const r = await api.get(`/chat/rooms/${room.id}/messages?limit=50&before=${encodeURIComponent(oldest)}`)
      const older = r.data || []
      setHasMore(older.length >= 50)
      if (older.length) setMsgs(prev => [...older, ...prev])
    } catch {} finally { setLoadingMore(false) }
  }, [room?.id, loadingMore, hasMore])

  const onInput = e => {
    setInput(e.target.value)
    if (e.target.value.trim()) broadcastTyping()
    // Auto-resize textarea
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
  }
  const onScroll = useCallback(() => {
    if (!listRef.current) return
    const el = listRef.current
    const isBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100
    setAtBottom(isBottom)
    if (el.scrollTop < 80 && hasMore && !loadingMore) {
      loadOlder()
    }
  }, [hasMore, loadingMore, loadOlder])

  const scrollToBottom = useCallback(() => {
    if (listRef.current) listRef.current.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [])

  const scrollToTop = useCallback(() => {
    if (listRef.current) listRef.current.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  // ── Room actions ──────────────────────────────────────────────────────────
  const joinRoom = useCallback((r) => {
    setRoom(r)
    if (isMobile) setShowSidebar(false)
    if (r.type === 'voice' || r.type === 'video') {
      if (callRoom && r.id !== callRoom.id) leaveCall()
      joinCall(r)
    }
  }, [isMobile, callRoom, joinCall, leaveCall])

  const saveChan = async data => {
    try {
      if (data.id) {
        const res = await api.put(`/chat/rooms/${data.id}`, data)
        setRooms(p => p.map(r => r.id===data.id ? res.data : r))
        if (room?.id === data.id) setRoom(res.data)
      } else {
        const res = await api.post('/chat/rooms', data)
        setRooms(p => [...p, res.data])
      }
      setModal(null); notify.success(data.id ? 'Channel updated' : 'Channel created')
    } catch { notify.error('Failed to save channel') }
  }

  const delChan = async r => {
    const ok = await dlgConfirm({ title:`Delete #${r.name}?`, message:'All messages in this channel will be permanently removed.', confirmLabel:'DELETE', variant:'danger' })
    if (!ok) return
    try { await api.delete(`/chat/rooms/${r.id}`); setRooms(p=>p.filter(x=>x.id!==r.id)); if(room?.id===r.id){setRoom(null);setMsgs([])} } catch { notify.error('Delete failed') }
  }

  // ── Moderation actions ────────────────────────────────────────────────────
  const muteUser = async (username, duration) => {
    try {
      await api.post(`/chat/rooms/${room.id}/mute`, { username, duration_minutes: duration })
      notify.success(`${username} muted for ${duration} min`)
    } catch { notify.error('Mute failed') }
  }

  const kickUser = async (username) => {
    try {
      await api.post(`/chat/rooms/${room.id}/kick`, { username, reason: 'Kicked by staff' })
      notify.success(`${username} kicked from channel`)
      // Refresh members list
      api.get(`/chat/rooms/${room.id}/members`).then(r => setRoomMembers(Array.isArray(r.data) ? r.data : [])).catch(() => {})
    } catch { notify.error('Kick failed') }
  }

  const banUser = async (username) => {
    const ok = await dlgConfirm({ title:`Ban ${username}?`, message:`They will be banned from #${room.name} until manually unbanned.`, confirmLabel:'BAN', variant:'danger' })
    if (!ok) return
    try {
      await api.post(`/chat/rooms/${room.id}/ban`, { username, reason: 'Banned by staff' })
      notify.success(`${username} banned from channel`)
      // Refresh members list
      api.get(`/chat/rooms/${room.id}/members`).then(r => setRoomMembers(Array.isArray(r.data) ? r.data : [])).catch(() => {})
    } catch { notify.error('Ban failed') }
  }

  const unmuteUser = async (username) => {
    try {
      await api.delete(`/chat/rooms/${room.id}/mute/${username}`)
      notify.success(`${username} unmuted`)
      loadModLists()
    } catch { notify.error('Unmute failed') }
  }

  const unbanUser = async (username) => {
    const ok = await dlgConfirm({ title:`Unban ${username}?`, message:`They will be able to rejoin #${room?.name||''}.`, confirmLabel:'UNBAN' })
    if (!ok) return
    try {
      await api.delete(`/chat/rooms/${room.id}/ban/${username}`)
      notify.success(`${username} unbanned`)
      loadModLists()
    } catch { notify.error('Unban failed') }
  }

  const inviteUser = async (username, role) => {
    try {
      await api.post(`/chat/rooms/${room.id}/invite`, { username, role })
      notify.success(`${username} invited as ${role}`)
      api.get(`/chat/rooms/${room.id}/members`).then(r => setRoomMembers(Array.isArray(r.data) ? r.data : [])).catch(() => {})
    } catch (err) {
      notify.error(err.response?.data?.detail || 'Invite failed')
    }
  }

  const loadModLists = useCallback(() => {
    if (!room) return
    api.get(`/chat/rooms/${room.id}/mutes`).then(r => setRoomMutes(Array.isArray(r.data) ? r.data : [])).catch(() => {})
    api.get(`/chat/rooms/${room.id}/bans`).then(r => setRoomBans(Array.isArray(r.data) ? r.data : [])).catch(() => {})
    api.get(`/chat/rooms/${room.id}/roles`).then(r => setRoomRoles(Array.isArray(r.data) ? r.data : [])).catch(() => {})
  }, [room])

  const loadModListsRef = useRef(null)
  useEffect(() => { loadModListsRef.current = loadModLists }, [loadModLists])

  const rotateKey = async () => {
    const ok = await dlgConfirm({ title:'Rotate Encryption Key?', message:'This generates a new E2EE key for this channel. Messages sent before rotation will NOT be decryptable with the new key. All users should rejoin.', confirmLabel:'ROTATE KEY', variant:'danger' })
    if (!ok) return
    try {
      const r = await api.post(`/chat/rooms/${room.id}/rotate-key`)
      const newKey = r.data?.encryption_key
      if (newKey) { setRoomKey(newKey); setRoomKeyModule(newKey); _roomKeyCache[room.id] = newKey }
      notify.success('Encryption key rotated. Users should rejoin.')
    } catch { notify.error('Key rotation failed') }
  }

  const userCtx = useCallback((e, u) => {
    e.preventDefault()
    const isSelf = u.username === me
    const isMuted = roomMutes.some(m => m.username === u.username)
    const isBanned = roomBans.some(b => b.username === u.username)
    const items = [
      { icon:'👤', label:u.username, sublabel:u.role || 'member' },
      { type:'separator' },
    ]
    if (!isSelf) items.push({ icon:'💬', label:'Mention', action:() => { setInput(prev => (prev.trim() ? prev + ' ' : '') + `@${u.username} `) } })
    if (isAdmin && !isSelf) {
      items.push({ type:'separator' })
      if (isMuted) {
        items.push({ icon:'🔊', label:'Unmute User', color:T.accent, action:async () => { await unmuteUser(u.username) } })
      } else {
        items.push({ icon:'🔇', label:'Mute User', color:T.warn, action:async () => { const dur = await dialog.prompt({ title:`Mute ${u.username}`, message:`Mute in #${room?.name||''}`, placeholder:'Minutes (0=permanent)', defaultValue:'60' }); if (dur !== null) muteUser(u.username, parseInt(dur||'60')) } })
      }
      items.push({ icon:'🚫', label:'Kick User', color:'#ff6b35', action:async () => { const ok = await dialog.confirm({ title:`Kick ${u.username}?`, message:`Remove from #${room?.name||''}`, confirmLabel:'KICK', variant:'danger' }); if (ok) kickUser(u.username) } })
      if (isBanned) {
        items.push({ icon:'✅', label:'Unban User', color:T.accent, action:async () => { await unbanUser(u.username) } })
      } else {
        items.push({ icon:'⛔', label:'Ban User', color:T.danger, action:async () => { const ok = await dialog.confirm({ title:`Ban ${u.username}?`, message:'Until manually unbanned.', confirmLabel:'BAN', variant:'danger' }); if (ok) banUser(u.username) } })
      }
    }
    contextMenu.open(e, items, { header: u.username })
  }, [me, isAdmin, room, muteUser, kickUser, banUser, unmuteUser, unbanUser, roomMutes, roomBans])

  const accessibleVoiceRoomIds = useMemo(() => new Set(rooms.filter(r => r.type === 'voice' || r.type === 'video').map(r => r.id)), [rooms])
  const voicePresenceByRoom = useMemo(() => {
    const grouped = {}
    online.forEach(u => {
      if (!u.voice_room_id || !accessibleVoiceRoomIds.has(u.voice_room_id)) return
      grouped[u.voice_room_id] = grouped[u.voice_room_id] || []
      grouped[u.voice_room_id].push(u)
    })
    Object.values(grouped).forEach(list => list.sort((a, b) => a.username.localeCompare(b.username)))
    return grouped
  }, [online, accessibleVoiceRoomIds])

  // ── render ────────────────────────────────────────────────────────────────
  if (!mounted) return null
  if (!token) return (
    <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:T.main }}>
      <div style={{ background:'rgba(20,23,34,0.98)', border:`1px solid ${T.border}`, borderRadius:16, padding:'36px 28px', textAlign:'center', maxWidth:320 }}>
        <div style={{ fontSize:38, marginBottom:10 }}>🔒</div>
        <h2 style={{ fontFamily:T.display, fontSize:18, color:T.text, margin:'0 0 16px' }}>Login Required</h2>
        <a href="/login?next=/chat" style={{ display:'inline-block', padding:'10px 26px', background:'linear-gradient(135deg,rgba(0,255,136,0.9),rgba(0,212,255,0.9))', color:'#000', fontFamily:T.mono, fontSize:11, fontWeight:700, letterSpacing:2, textDecoration:'none', borderRadius:9 }}>Login →</a>
      </div>
    </div>
  )

  const isVC = callRoom && (callRoom.type==='voice'||callRoom.type==='video')
  const showFullCall = isVC && room && (room.type==='voice'||room.type==='video') && room.id === callRoom.id

  const handleReturnToCall = () => {
    if (callRoom) setRoom(callRoom)
  }

  const handleDeafen = () => {
    setDeafened(d => !d)
    setMuted(m => !m)
  }

  return (
    <>
      {modal && <ChannelModal initial={modal==='create'?null:modal} onSave={saveChan} onClose={()=>setModal(null)}/>}
      {mediaViewer && <MediaViewer media={mediaViewer} onClose={()=>setMediaViewer(null)}/>}

      <div style={{ position: standalone ? 'fixed' : 'absolute', top:0, left:0, right:0, bottom:0,
        display:'flex', background:T.main, overflow:'hidden', borderRadius:standalone?0:8, zIndex: standalone ? 1 : undefined }}>

        {/* Mobile backdrop */}
        {isMobile && showSidebar && (
          <div onClick={()=>setShowSidebar(false)} style={{
            position:'absolute', inset:0, background:'rgba(0,0,0,0.6)', zIndex:40, backdropFilter:'blur(2px)'
          }}/>
        )}

        {/* Sidebar */}
        <div style={{
          ...(isMobile ? {
            position:'absolute', top:0, bottom:0, left:0, zIndex:50,
            transform: showSidebar ? 'translateX(0)' : 'translateX(-100%)',
            transition: 'transform 0.28s cubic-bezier(0.4,0,0.2,1)',
          } : {}),
        }}>
          <Sidebar rooms={rooms} active={room} onSelect={r=>{joinRoom(r);if(isMobile)setShowSidebar(false)}}
            onlineCount={online.length} unread={unread} isAdmin={isAdmin}
            onCreate={()=>setModal('create')} onEdit={r=>setModal(r)}
            onRotateKey={r=>{setRoom(r);rotateKey()}} onDeleteChannel={delChan}
            callRoom={callRoom} onJoinCall={joinCall} onLeaveCall={leaveCall} me={me} role={role}
            voicePresenceByRoom={voicePresenceByRoom}/>
        </div>

        {/* Main */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minWidth:0, position:'relative' }}>

          {/* Full voice call UI — only when viewing the active call's room */}
          {showFullCall ? (
            <VoiceErrorBoundary>
              <LiveKitCallPanel room={callRoom} onLeave={leaveCall} muted={muted} camOff={camOff}
                onMute={togMute} onCam={togCam} onScreen={()=>{}} canScreenShare={canScreenShare}
                me={me} onParticipantsChange={setCallParticipants} />
            </VoiceErrorBoundary>
          ) : (
            <>
              {/* Channel header */}
              <div style={{ display:'flex', alignItems:'center', gap:10, padding:'0 16px', height:52,
                borderBottom:`1px solid ${T.border}`, background:T.sidebar, flexShrink:0 }}>
                {isMobile && (
                  <button onClick={()=>setShowSidebar(p=>!p)} style={{
                    width:34, height:34, border:`1px solid ${T.border}`, borderRadius:8,
                    background:'transparent', color:T.text, cursor:'pointer', flexShrink:0,
                    display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:4,
                  }}>
                    <span style={{ width:16, height:1.5, background:'currentColor', borderRadius:1, display:'block' }}/>
                    <span style={{ width:16, height:1.5, background:'currentColor', borderRadius:1, display:'block' }}/>
                    <span style={{ width:12, height:1.5, background:'currentColor', borderRadius:1, display:'block' }}/>
                  </button>
                )}
                {room ? <>
                  <span style={{ fontSize:16 }}>{room.emoji||'#'}</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                      <span style={{ fontWeight:700, fontSize:13, color:T.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{room.name}</span>
                      {roomKey && <span title="End-to-end encrypted" style={{ color:T.accent, fontSize:11, flexShrink:0 }}>🔒</span>}
                    </div>
                    {room.description && <div style={{ fontSize:10, color:T.muted, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{room.description}</div>}
                  </div>
                  <div style={{ display:'flex', gap:6, alignItems:'center', flexShrink:0 }}>
                    <button onClick={()=>setShowSearch(s=>!s)} title="Search messages (Ctrl+K)"
                      style={{ padding:'4px 10px', border:`1px solid ${showSearch?'rgba(0,212,255,0.45)':T.border}`, borderRadius:7,
                        background:showSearch?'rgba(0,212,255,0.1)':'transparent', color:showSearch?T.accentB:T.muted,
                        fontFamily:T.mono, fontSize:10, cursor:'pointer', display:'flex', alignItems:'center', gap:4 }}>
                      🔍 {showSearch ? 'Close' : 'Search'}
                    </button>
                    {(room.type==='voice'||room.type==='video') && (
                      <button onClick={()=>joinCall(room)}
                        style={{ padding:'4px 12px', border:`1px solid ${T.accent}`, borderRadius:7, background:'rgba(0,255,136,0.1)', color:T.accent, fontFamily:T.mono, fontSize:10, cursor:'pointer', display:'flex', alignItems:'center', gap:5 }}>
                        {room.type==='video'?'📹':'🔊'} JOIN
                      </button>
                    )}
                    {isAdmin && (
                      <div ref={adminMenuRef} style={{ position:'relative' }}>
                        <button onClick={()=>{setShowAdminMenu(p=>!p); if(!showAdminMenu) loadModLists()}}
                          style={{ padding:'4px 12px', border:`1px solid ${showAdminMenu?'rgba(0,255,136,0.45)':T.border}`,
                            borderRadius:7, background:showAdminMenu?'rgba(0,255,136,0.1)':'transparent',
                            color:showAdminMenu?T.accent:T.muted, fontFamily:T.mono, fontSize:11,
                            cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>
                          MOD <span style={{ fontSize:8, opacity:0.7 }}>{showAdminMenu?'▲':'▼'}</span>
                        </button>
                        {showAdminMenu && (
                          <div style={{ position:'absolute', right:0, top:'calc(100% + 6px)', zIndex:200,
                            background:'rgba(18,21,32,0.98)', border:`1px solid ${T.border}`, borderRadius:10,
                            padding:0, minWidth:260, maxWidth:300, maxHeight:420, overflowY:'auto', boxShadow:'0 10px 40px rgba(0,0,0,0.7)' }}>
                            {/* Tab bar */}
                            <div style={{ display:'flex', borderBottom:`1px solid ${T.border}`, position:'sticky', top:0, background:'rgba(18,21,32,0.98)', zIndex:1 }}>
                              {[{k:'actions',l:'Actions',i:'⚡'},{k:'mods',l:'Mod',i:'🛡️'},{k:'invite',l:'Invite',i:'➕'},{k:'roles',l:'Roles',i:'🏷️'}].map(tab=>(
                                <button key={tab.k} onClick={()=>setModSection(modSection===tab.k?null:tab.k)}
                                  style={{ flex:1, padding:'7px 4px', border:'none', borderBottom:modSection===tab.k?`2px solid ${T.accent}`:'2px solid transparent',
                                    background:modSection===tab.k?'rgba(0,255,136,0.06)':'transparent', color:modSection===tab.k?T.accent:T.muted,
                                    fontFamily:T.mono, fontSize:9, cursor:'pointer', textAlign:'center', letterSpacing:1 }}>
                                  {tab.i} {tab.l}
                                </button>
                              ))}
                            </div>
                            {/* Default: channel actions */}
                            {modSection === null && (
                              <div style={{ padding:'4px' }}>
                                <div style={{ padding:'6px 12px 4px', fontFamily:T.mono, fontSize:9, color:T.muted, letterSpacing:2 }}>QUICK ACTIONS</div>
                                {[
                                  { icon:'✏️', label:'Edit Channel', action:()=>{setModal(room);setShowAdminMenu(false)}, color:T.text },
                                  { icon:'➕', label:'New Channel', action:()=>{setModal('create');setShowAdminMenu(false)}, color:T.accent },
                                  { icon:'🔑', label:'Rotate E2EE Key', action:()=>{ rotateKey(); setShowAdminMenu(false) }, color:'#f59e0b' },
                                ].map((it,i)=>(
                                  <button key={i} onClick={it.action} style={{ display:'flex', alignItems:'center', gap:9, width:'100%', padding:'8px 12px', border:'none', background:'transparent', color:it.color, fontFamily:T.mono, fontSize:11, cursor:'pointer', borderRadius:7, textAlign:'left' }}
                                    onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.06)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                                    <span style={{ width:16, textAlign:'center', flexShrink:0 }}>{it.icon}</span>{it.label}
                                  </button>
                                ))}
                                <div style={{ height:1, background:T.border, margin:'4px 8px' }}/>
                                <div style={{ padding:'6px 12px 4px', fontFamily:T.mono, fontSize:9, color:T.muted, letterSpacing:2 }}>MODERATION</div>
                                {['mute','kick','ban'].map(action => {
                                  const cfg = { mute: { icon:'🔇', label:'Mute User', color:T.warn }, kick: { icon:'🚫', label:'Kick User', color:'#ff6b35' }, ban: { icon:'⛔', label:'Ban User', color:T.danger } }[action]
                                  const isActive = modAction === action
                                  return (
                                    <div key={action}>
                                      <button onClick={() => { setModAction(isActive ? null : action); setModTarget(null) }}
                                        style={{ display:'flex', alignItems:'center', gap:9, width:'100%', padding:'8px 12px', border:'none', background: isActive ? 'rgba(255,255,255,0.08)' : 'transparent', color:cfg.color, fontFamily:T.mono, fontSize:11, cursor:'pointer', borderRadius:7, textAlign:'left' }}
                                        onMouseEnter={e=>e.currentTarget.style.background=isActive?'rgba(255,255,255,0.08)':'rgba(255,255,255,0.04)'} onMouseLeave={e=>e.currentTarget.style.background=isActive?'rgba(255,255,255,0.08)':'transparent'}>
                                        <span style={{ width:16, textAlign:'center', flexShrink:0 }}>{cfg.icon}</span>{cfg.label} <span style={{ fontSize:7, opacity:0.5, marginLeft:4 }}>{isActive ? '▲' : '▼'}</span>
                                      </button>
                                      {isActive && (
                                        <div style={{ padding:'4px 8px 8px' }}>
                                          <input placeholder="Type username…" value={modTarget||''} onChange={e=>setModTarget(e.target.value)}
                                            style={{ width:'100%', background:'rgba(255,255,255,0.05)', border:`1px solid ${T.border}`, borderRadius:6, padding:'5px 10px', color:T.text, fontSize:11, fontFamily:T.mono, outline:'none' }}
                                            onFocus={e=>e.target.style.borderColor='rgba(0,212,255,0.4)'} onBlur={e=>e.target.style.borderColor=T.border}/>
                                          {online.filter(u => u.username !== me && (!modTarget || u.username.toLowerCase().includes((modTarget||'').toLowerCase()))).slice(0, 5).map(u => (
                                            <button key={u.username} onClick={() => setModTarget(u.username)}
                                              style={{ display:'flex', alignItems:'center', gap:8, width:'100%', padding:'5px 10px', border:'none', background:modTarget===u.username?'rgba(0,212,255,0.1)':'transparent', color:T.text, fontFamily:T.mono, fontSize:11, cursor:'pointer', borderRadius:4, textAlign:'left' }}
                                              onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.06)'} onMouseLeave={e=>e.currentTarget.style.background=modTarget===u.username?'rgba(0,212,255,0.1)':'transparent'}>
                                              <Av name={u.username} size={18} online/>
                                              <span>{u.username}</span>
                                              <RolePill role={u.role} />
                                              <span style={{ fontSize:8, color:T.accent, marginLeft:'auto' }}>online</span>
                                            </button>
                                          ))}
                                          {roomMembers.filter(m => m.username !== me && !online.some(o => o.username === m.username) && (!modTarget || m.username.toLowerCase().includes((modTarget||'').toLowerCase()))).slice(0, 5).map(m => (
                                            <button key={m.username} onClick={() => setModTarget(m.username)}
                                              style={{ display:'flex', alignItems:'center', gap:8, width:'100%', padding:'5px 10px', border:'none', background:modTarget===m.username?'rgba(0,212,255,0.1)':'transparent', color:T.muted, fontFamily:T.mono, fontSize:11, cursor:'pointer', borderRadius:4, textAlign:'left' }}
                                              onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.04)'} onMouseLeave={e=>e.currentTarget.style.background=modTarget===m.username?'rgba(0,212,255,0.1)':'transparent'}>
                                              <span style={{ width:18, height:18, borderRadius:'50%', background:'rgba(255,255,255,0.1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, color:T.muted, flexShrink:0 }}>{m.username.charAt(0).toUpperCase()}</span>
                                              <span>{m.username}</span>
                                              <RolePill role={m.role} />
                                              <span style={{ fontSize:8, color:T.muted, marginLeft:'auto' }}>offline</span>
                                            </button>
                                          ))}
                                          {modTarget && modTarget.length > 1 && (
                                            <button onClick={async () => {
                                              setShowAdminMenu(false)
                                              if (action === 'mute') { const dur = await dialog.prompt({ title:`Mute ${modTarget}?`, placeholder:'Minutes (0=permanent)', defaultValue:'60' }); if (dur !== null) muteUser(modTarget, parseInt(dur||'60')) }
                                              else if (action === 'kick') { const ok = await dialog.confirm({ title:`Kick ${modTarget}?`, message:`Remove from #${room?.name||''}`, confirmLabel:'KICK', variant:'danger' }); if (ok) kickUser(modTarget) }
                                              else if (action === 'ban') { const ok = await dialog.confirm({ title:`Ban ${modTarget}?`, message:'Until manually unbanned.', confirmLabel:'BAN', variant:'danger' }); if (ok) banUser(modTarget) }
                                              setModTarget(null); setModAction(null)
                                            }}
                                              style={{ display:'flex', alignItems:'center', gap:6, width:'100%', padding:'6px 10px', border:`1px solid ${cfg.color}44`, borderRadius:6, background:`${cfg.color}18`, color:cfg.color, fontFamily:T.mono, fontSize:11, cursor:'pointer', marginTop:4 }}>
                                              {cfg.icon} {action === 'mute' ? `Mute "${modTarget}"` : action === 'kick' ? `Kick "${modTarget}"` : `Ban "${modTarget}"`}
                                            </button>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  )
                                })}
                                <div style={{ height:1, background:T.border, margin:'4px 8px' }}/>
                                <div style={{ padding:'6px 12px 4px', fontFamily:T.mono, fontSize:9, color:T.muted, letterSpacing:2 }}>DANGER ZONE</div>
                                <button onClick={()=>{delChan(room);setShowAdminMenu(false)}}
                                  style={{ display:'flex', alignItems:'center', gap:9, width:'100%', padding:'8px 12px', border:'none', background:'transparent', color:T.danger, fontFamily:T.mono, fontSize:11, cursor:'pointer', borderRadius:7, textAlign:'left' }}
                                  onMouseEnter={e=>e.currentTarget.style.background='rgba(255,71,87,0.1)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                                  <span style={{ width:16, textAlign:'center' }}>🗑️</span>Delete Channel
                                </button>
                              </div>
                            )}
                            {/* Moderation tab: mutes & bans */}
                            {modSection === 'mods' && (
                              <div style={{ padding:'4px' }}>
                                <div style={{ padding:'6px 12px 4px', fontFamily:T.mono, fontSize:9, color:T.warn, letterSpacing:2 }}>🔇 MUTED ({roomMutes.length})</div>
                                {roomMutes.length === 0 && <div style={{ padding:'4px 12px 8px', color:T.muted, fontSize:10 }}>No muted users</div>}
                                {roomMutes.map(m => (
                                  <div key={m.username} style={{ display:'flex', alignItems:'center', gap:6, padding:'5px 12px' }}>
                                    <span style={{ flex:1, color:T.text, fontSize:11, fontFamily:T.mono }}>{m.username}</span>
                                    {m.expires_at ? <span style={{ fontSize:9, color:T.muted }}>until {new Date(m.expires_at).toLocaleTimeString()}</span> : <span style={{ fontSize:9, color:T.danger }}>perm</span>}
                                    <button onClick={() => unmuteUser(m.username)}
                                      style={{ border:`1px solid ${T.accent}44`, borderRadius:4, background:'transparent', color:T.accent, fontFamily:T.mono, fontSize:9, cursor:'pointer', padding:'2px 8px' }}>Unmute</button>
                                  </div>
                                ))}
                                <div style={{ height:1, background:T.border, margin:'4px 8px' }}/>
                                <div style={{ padding:'6px 12px 4px', fontFamily:T.mono, fontSize:9, color:T.danger, letterSpacing:2 }}>⛔ BANNED ({roomBans.length})</div>
                                {roomBans.length === 0 && <div style={{ padding:'4px 12px 8px', color:T.muted, fontSize:10 }}>No banned users</div>}
                                {roomBans.map(b => (
                                  <div key={b.username} style={{ display:'flex', alignItems:'center', gap:6, padding:'5px 12px' }}>
                                    <span style={{ flex:1, color:T.text, fontSize:11, fontFamily:T.mono }}>{b.username}</span>
                                    {b.reason && <span style={{ fontSize:9, color:T.muted }}>{b.reason}</span>}
                                    <button onClick={() => unbanUser(b.username)}
                                      style={{ border:`1px solid ${T.accent}44`, borderRadius:4, background:'transparent', color:T.accent, fontFamily:T.mono, fontSize:9, cursor:'pointer', padding:'2px 8px' }}>Unban</button>
                                  </div>
                                ))}
                              </div>
                            )}
                            {/* Invite tab */}
                            {modSection === 'invite' && (
                              <div style={{ padding:'4px' }}>
                                <div style={{ padding:'6px 12px 4px', fontFamily:T.mono, fontSize:9, color:T.accent, letterSpacing:2 }}>➕ INVITE USER</div>
                                <div style={{ padding:'4px 12px 8px' }}>
                                  <input placeholder="Search username or email…" value={inviteQ}
                                    onChange={e => {
                                      const q = e.target.value.trim()
                                      setInviteQ(e.target.value)
                                      if (q.length < 2) { setInviteResults([]); return }
                                      setInviteSearching(true)
                                      api.get(`/chat/users/search?q=${encodeURIComponent(q)}`).then(r => {
                                        const users = Array.isArray(r.data) ? r.data : []
                                        setInviteResults(users.filter(u => !roomMembers.some(m => m.username === u.username)))
                                      }).catch(() => setInviteResults([])).finally(() => setInviteSearching(false))
                                    }}
                                    style={{ width:'100%', background:'rgba(255,255,255,0.05)', border:`1px solid ${T.border}`, borderRadius:6, padding:'5px 10px', color:T.text, fontSize:11, fontFamily:T.mono, outline:'none', marginBottom:6 }}
                                    onFocus={e=>e.target.style.borderColor='rgba(0,212,255,0.4)'} onBlur={e=>e.target.style.borderColor=T.border}/>
                                  <select value={inviteRole} onChange={e=>setInviteRole(e.target.value)}
                                    style={{ width:'100%', background:'rgba(255,255,255,0.05)', border:`1px solid ${T.border}`, borderRadius:6, padding:'5px 8px', color:T.text, fontSize:11, fontFamily:T.mono, outline:'none', marginBottom:6 }}>
                                    <option value="member">Member</option>
                                    <option value="moderator">Moderator</option>
                                    <option value="admin">Admin</option>
                                    {roomRoles.map(r => <option key={r.id} value={r.name}>{r.name}</option>)}
                                  </select>
                                  {inviteSearching && <div style={{ padding:'4px 0', color:T.muted, fontSize:10, fontFamily:T.mono }}>Searching…</div>}
                                  <div style={{ maxHeight:200, overflowY:'auto' }}>
                                    {inviteResults.map(u => (
                                      <button key={u.id||u.username} onClick={() => { inviteUser(u.username, inviteRole); setInviteQ(''); setInviteResults([]) }}
                                        style={{ display:'flex', alignItems:'center', gap:8, width:'100%', padding:'6px 10px', border:'none', background:'transparent', color:T.text, fontFamily:T.mono, fontSize:11, cursor:'pointer', borderRadius:4, textAlign:'left' }}
                                        onMouseEnter={e=>e.currentTarget.style.background='rgba(0,255,136,0.06)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                                        {u.avatar
                                          ? <img src={u.avatar} style={{ width:22, height:22, borderRadius:'50%', objectFit:'cover', flexShrink:0 }} />
                                          : <span style={{ width:22, height:22, borderRadius:'50%', background:'rgba(255,255,255,0.08)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, color:T.muted, flexShrink:0 }}>{u.username.charAt(0).toUpperCase()}</span>}
                                        <div style={{ flex:1, minWidth:0 }}>
                                          <div style={{ color:T.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{u.username}</div>
                                          {u.email && <div style={{ fontSize:9, color:T.muted, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{u.email}</div>}
                                        </div>
                                        <RolePill role={u.role} />
                                        {roomMembers.some(m => m.username === u.username) && <span style={{ fontSize:8, color:T.muted, marginLeft:4 }}>joined</span>}
                                      </button>
                                    ))}
                                    {inviteQ.length >= 2 && inviteResults.length === 0 && !inviteSearching && (
                                      <div style={{ padding:'8px 10px', color:T.muted, fontSize:10, fontFamily:T.mono, textAlign:'center' }}>No users found</div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}
                            {/* Roles tab */}
                            {modSection === 'roles' && (
                              <div style={{ padding:'4px' }}>
                                <div style={{ padding:'6px 12px 4px', fontFamily:T.mono, fontSize:9, color:'#a78bfa', letterSpacing:2 }}>🏷️ CUSTOM ROLES</div>
                                {roomRoles.length === 0 && <div style={{ padding:'4px 12px 8px', color:T.muted, fontSize:10 }}>No custom roles yet</div>}
                                {roomRoles.map(r => (
                                  <div key={r.id} style={{ padding:'6px 12px', borderBottom:`1px solid ${T.border}33` }}>
                                    <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4 }}>
                                      <span style={{ width:10, height:10, borderRadius:'50%', background:r.color||'#00ff88', display:'inline-block' }}/>
                                      <span style={{ flex:1, color:T.text, fontSize:11, fontFamily:T.mono }}>{r.name}</span>
                                      <button onClick={async () => { await api.delete(`/chat/rooms/${room.id}/roles/${r.id}`); loadModLists() }}
                                        style={{ border:`1px solid ${T.danger}44`, borderRadius:4, background:'transparent', color:T.danger, fontFamily:T.mono, fontSize:9, cursor:'pointer', padding:'2px 6px' }}>Delete</button>
                                    </div>
                                    <div style={{ display:'flex', flexWrap:'wrap', gap:3 }}>
                                      {(r.permissions||[]).map(p => (
                                        <span key={p} style={{ fontSize:8, padding:'1px 6px', borderRadius:3, background:'rgba(255,255,255,0.06)', color:T.muted, fontFamily:T.mono }}>{p.replace(/_/g,' ')}</span>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                                <div style={{ padding:'8px 12px 4px', borderTop:`1px solid ${T.border}`, marginTop:4 }}>
                                  <div style={{ fontFamily:T.mono, fontSize:9, color:T.muted, marginBottom:4 }}>Add New Role</div>
                                  <input placeholder="Role name" value={newRoleName} onChange={e=>setNewRoleName(e.target.value)}
                                    style={{ width:'100%', background:'rgba(255,255,255,0.05)', border:`1px solid ${T.border}`, borderRadius:6, padding:'5px 10px', color:T.text, fontSize:11, fontFamily:T.mono, outline:'none', marginBottom:4 }}
                                    onFocus={e=>e.target.style.borderColor='rgba(0,212,255,0.4)'} onBlur={e=>e.target.style.borderColor=T.border}/>
                                  <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:6 }}>
                                    <span style={{ fontSize:9, color:T.muted, fontFamily:T.mono }}>Color</span>
                                    <input type="color" value={newRoleColor} onChange={e=>setNewRoleColor(e.target.value)} style={{ width:28, height:22, border:'none', background:'transparent', cursor:'pointer' }}/>
                                    <span style={{ fontSize:9, color:T.muted, fontFamily:T.mono }}>{newRoleColor}</span>
                                  </div>
                                  <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginBottom:6 }}>
                                    {['send_messages','read_messages','manage_messages','manage_members','manage_roles','voice_speak','voice_screen_share'].map(perm => (
                                      <label key={perm} style={{ display:'flex', alignItems:'center', gap:3, fontSize:9, color:T.muted, fontFamily:T.mono, cursor:'pointer' }}>
                                        <input type="checkbox" checked={newRolePerms.includes(perm)} onChange={e => { setNewRolePerms(prev => e.target.checked ? [...prev, perm] : prev.filter(p => p !== perm)) }} style={{ accentColor:T.accent }}/>
                                        {perm.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}
                                      </label>
                                    ))}
                                  </div>
                                  <button onClick={async () => {
                                    if (!newRoleName.trim()) { notify.error('Role name required'); return }
                                    try {
                                      await api.post(`/chat/rooms/${room.id}/roles`, { name: newRoleName.trim(), color: newRoleColor, permissions: newRolePerms })
                                      notify.success(`Role "${newRoleName.trim()}" created`)
                                      setNewRoleName(''); setNewRoleColor('#00ff88'); setNewRolePerms([])
                                      loadModLists()
                                    } catch (err) { notify.error(err.response?.data?.detail || 'Failed to create role') }
                                  }}
                                    style={{ width:'100%', padding:'6px', border:`1px solid ${T.accent}44`, borderRadius:6, background:'rgba(0,255,136,0.08)', color:T.accent, fontFamily:T.mono, fontSize:10, cursor:'pointer' }}>
                                    + Create Role
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                    <button onClick={()=>setShowOnline(p=>!p)}
                      style={{ padding:'4px 10px', border:`1px solid ${showOnline?'rgba(0,255,136,0.4)':T.border}`, borderRadius:7, background:showOnline?'rgba(0,255,136,0.08)':'transparent', color:showOnline?T.accent:T.muted, fontFamily:T.mono, fontSize:11, cursor:'pointer', display:'flex', alignItems:'center', gap:5 }}>
                      <span style={{ width:7, height:7, borderRadius:'50%', background:'#23d160', display:'inline-block' }}/>
                      {online.length}
                    </button>
                  </div>
                </> : <div style={{ fontFamily:T.mono, fontSize:11, color:T.muted }}>Select a channel</div>}
              </div>

              {/* Mini call bar — shown when in voice call but viewing a text channel */}
              {isVC && !showFullCall && (
                <MiniCallBar room={callRoom} muted={muted} camOff={camOff} deafened={deafened}
                  onMute={togMute} onDeafen={handleDeafen} onCam={togCam}
                  onLeave={leaveCall} onReturn={handleReturnToCall}
                  participants={callParticipants} />
              )}

{room ? (
                 <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minHeight:0 }}>
                    <div ref={listRef} onScroll={onScroll} style={{ flex:1, overflow:'auto', position:'relative' }}>
                      {loadingMsgs && <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', zIndex:2, background:'var(--bg2, rgba(0,0,0,0.5))' }}>
                        <div style={{ fontFamily:T.mono, fontSize:12, color:T.muted, letterSpacing:2, animation:'pulse 1.5s infinite' }}>Loading messages…</div>
                      </div>}
                      {loadingMore && <div style={{ textAlign:'center', padding:'4px', fontFamily:T.mono, fontSize:10, color:T.muted, flexShrink:0 }}>Loading older messages…</div>}
{!loadingMsgs && <MsgList msgs={filteredMsgs} me={me} isAdmin={isAdmin} onDel={delMsg} onBatchDel={batchDelMessages} onReply={setReplyTo} onEdit={setEditing} onReact={react} onMediaClick={setMediaViewer} onPin={togglePin} pinnedIds={pinnedIds} muteUser={muteUser} kickUser={kickUser} banUser={banUser} unmuteUser={unmuteUser} unbanUser={unbanUser} roomMutes={roomMutes} roomBans={roomBans} onMention={username => { setInput(prev => (prev.trim() ? prev + ' ' : '') + `@${username} `); listRef.current?.closest('.chat-input')?.focus() || document.querySelector('textarea')?.focus() }}/>}
                      {/* Search bar */}
                      {showSearch && (
                        <div style={{ position:'absolute', top:0, left:0, right:0, zIndex:20, background:'rgba(10,10,20,0.97)', borderBottom:`1px solid ${T.border}`, padding:'6px 14px', display:'flex', gap:8, alignItems:'center' }}>
                          <input ref={searchRef => { if (searchRef) setTimeout(() => searchRef.focus(), 50) }}
                            value={searchQ} onChange={e => setSearchQ(e.target.value)}
                            placeholder="Search messages… (Ctrl+K)"
                            style={{ flex:1, background:'rgba(255,255,255,0.05)', border:`1px solid ${T.border}`, borderRadius:8, padding:'6px 12px', color:T.text, fontSize:13, fontFamily:T.mono, outline:'none' }}/>
                          {searchQ && <span style={{ fontFamily:T.mono, fontSize:10, color:T.muted }}>{filteredMsgs.length} results</span>}
                          <button onClick={()=>{ setShowSearch(false); setSearchQ('') }} style={{ background:'none', border:'none', color:T.muted, cursor:'pointer', fontSize:16 }}>✕</button>
                        </div>
                      )}
                      {/* Pinned message bar */}
                      {pinnedIds.length > 0 && (
                        <div style={{ background:'rgba(0,212,255,0.05)', borderBottom:`1px solid rgba(0,212,255,0.15)`, padding:'4px 14px', display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
                          <span style={{ fontSize:9, color:T.accentB, letterSpacing:1, fontFamily:T.mono }}>📌 PINNED</span>
                          {pinnedIds.map(id => {
                            const pm = msgs.find(m => m.id === id)
                            if (!pm) return null
                            return <span key={id} style={{ fontSize:10, color:T.text, fontFamily:T.mono, background:'rgba(255,255,255,0.04)', padding:'1px 6px', borderRadius:4, cursor:'pointer' }}
                              onClick={() => { const el = document.querySelector(`[data-msg-id="${id}"]`); el?.scrollIntoView({ behavior:'smooth' }) }}>
                              {pm.sender}: {(pm.content||'').slice(0,40)}{pm.content?.length > 40 ? '…' : ''}
                            </span>
                          })}
                          <button onClick={() => setPinnedIds([])} style={{ background:'none', border:'none', color:T.muted, cursor:'pointer', fontSize:10, marginLeft:'auto' }}>Clear pins</button>
                        </div>
                      )}
                      {/* Scroll buttons */}
                      <button onClick={scrollToTop} title="Scroll to top"
                        style={{ position:'absolute', top:8, right:8, width:32, height:32, borderRadius:'50%', border:`1px solid ${T.border}`,
                          background:'rgba(0,0,0,0.7)', color:T.muted, fontSize:14, cursor:'pointer', zIndex:5,
                          display:'flex', alignItems:'center', justifyContent:'center', opacity:0.6 }}>↑</button>
                      {!atBottom && <button onClick={() => { scrollToBottom(); setNewBelow(0) }} title="New messages ↓"
                        style={{ position:'absolute', bottom:8, right:8, borderRadius:16,
                          border:`1px solid rgba(0,255,136,0.4)`, background:'rgba(0,255,136,0.15)', color:T.accent, fontSize:12, cursor:'pointer', zIndex:5,
                          display:'flex', alignItems:'center', justifyContent:'center', gap:4, padding:'6px 12px', fontFamily:T.mono }}>
                          ↓ {newBelow > 0 ? `${newBelow} new` : 'New'}</button>}
                    </div>
                  {typLabel && <div style={{ padding:'2px 18px 4px', fontFamily:T.mono, fontSize:10, color:T.muted, flexShrink:0, fontStyle:'italic', display:'flex', alignItems:'center', gap:4 }}>
                    <style>{`@keyframes dotPulse{0%{opacity:.2}50%{opacity:1}100%{opacity:.2}}`}</style>
                    <span style={{ display:'inline-flex', gap:2 }}>
                      {[0,1,2].map(i => <span key={i} style={{ width:4, height:4, borderRadius:'50%', background:T.muted, animation:`dotPulse 1.2s ease-in-out ${i*0.2}s infinite` }}/> )}
                    </span>
                    {typLabel}
                  </div>}
                  {editing && <EditBar msg={editing} onSave={saveEdit} onCancel={()=>setEditing(null)}/>}
                  {replyTo && (
                    <div style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 14px', background:'rgba(0,212,255,0.06)', borderTop:`1px solid rgba(0,212,255,0.15)`, flexShrink:0 }}>
                      <div style={{ flex:1, fontFamily:T.mono, fontSize:10, color:T.muted, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        <span style={{ color:T.accentB }}>{replyTo.sender}: </span>{replyTo.content}
                      </div>
                      <button onClick={()=>setReplyTo(null)} style={{ padding:'2px 7px', border:`1px solid ${T.border}`, borderRadius:6, background:'transparent', color:T.muted, cursor:'pointer', fontSize:12 }}>✕</button>
                    </div>
                  )}
                  {isMutedByStaff && (
                    <div style={{ padding:'6px 14px', background:'rgba(255,215,0,0.08)', borderTop:`1px solid rgba(255,215,0,0.2)`, fontFamily:T.mono, fontSize:10, color:T.warn, textAlign:'center', flexShrink:0 }}>
                      You are muted in this channel by a moderator
                    </div>
                  )}
                  {/* Input bar */}
                  <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 14px 12px',
                    borderTop:`1px solid ${T.border}`, background:T.sidebar, flexShrink:0 }}>
                    <input type="file" ref={fileRef} onChange={sendFile} style={{ display:'none' }}/>
                    <button onClick={()=>fileRef.current?.click()} disabled={uploading} title="Attach file"
                      style={{ width:36, height:36, border:`1px solid ${T.border}`, borderRadius:9, background:uploading?'rgba(255,255,255,0.04)':'transparent',
                        color:uploading?T.muted:T.text, fontSize:16, cursor:uploading?'default':'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                      {uploading ? '⏳' : '📎'}
                    </button>
                    <div style={{ position:'relative' }}>
                      <button onClick={()=>setShowEmoji(!showEmoji)} title="Emoji"
                        style={{ width:36, height:36, border:`1px solid ${T.border}`, borderRadius:9, background:'transparent',
                          color:T.text, fontSize:16, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                        😊
                      </button>
                      {showEmoji && (
                        <div style={{ position:'absolute', bottom:'100%', left:-60, marginBottom:6, background:T.bg2, border:`1px solid ${T.border}`, borderRadius:10, padding:8,
                          display:'grid', gridTemplateColumns:'repeat(8, 1fr)', gap:2, zIndex:20, boxShadow:'0 8px 32px rgba(0,0,0,0.5)' }}
                          onClick={e => e.stopPropagation()}>
                          {['😀','😂','😍','🥳','😎','🤔','😢','😡','👍','👎','❤️','🔥','🎉','💯','🙏','✨','🤝','👋','👀','💪','🫡','😴','🤯','🥺','😈','💀','🫠','🤝','😤','🥹'].map(e => (
                            <button key={e} onClick={()=>{ setInput(prev => prev + e); setShowEmoji(false) }}
                              style={{ background:'none', border:'none', cursor:'pointer', fontSize:18, padding:4, borderRadius:4 }}
                              onMouseEnter={ev => ev.currentTarget.style.background='rgba(255,255,255,0.08)'}
                              onMouseLeave={ev => ev.currentTarget.style.background='none'}>
                              {e}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <textarea ref={inputRef} value={input} onChange={onInput} onPaste={handlePaste}
                      onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMsg(e)}}}
                      placeholder={isMutedByStaff?'You are muted':`Message #${room.name}…`}
                      disabled={isMutedByStaff} rows={1}
                      style={{ flex:1, background:'rgba(255,255,255,0.05)', border:`1px solid rgba(255,255,255,0.1)`,
                        color:T.text, fontFamily:T.display, fontSize:13, padding:'9px 14px', borderRadius:10,
                        outline:'none', minWidth:0, transition:'border-color 0.2s', opacity:isMutedByStaff?0.4:1,
                        resize:'none', overflow:'hidden', maxHeight:120, lineHeight:'1.5' }}
                      onFocus={e=>e.target.style.borderColor='rgba(0,255,136,0.4)'}
                      onBlur={e=>e.target.style.borderColor='rgba(255,255,255,0.1)'}/>
                    <button onClick={sendMsg} disabled={!input.trim()||isMutedByStaff}
                      style={{ height:36, padding:'0 16px', border:'none', borderRadius:9, flexShrink:0,
                        background:input.trim()&&!isMutedByStaff?'linear-gradient(135deg,rgba(0,255,136,0.85),rgba(0,212,255,0.85))':'rgba(255,255,255,0.06)',
                        color:input.trim()&&!isMutedByStaff?'#000':T.muted, fontFamily:T.mono, fontSize:11, fontWeight:700,
                        cursor:input.trim()&&!isMutedByStaff?'pointer':'default', transition:'all 0.2s' }}>
                      Send ➤
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:14 }}>
                  <div style={{ fontSize:48 }}>💬</div>
                  <div style={{ fontFamily:T.mono, fontSize:12, color:T.muted }}>Select a channel to start chatting</div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Online panel */}
        {showOnline && !isMobile && (
          <div style={{ width:190, flexShrink:0, background:T.sidebar, borderLeft:`1px solid ${T.border}`, display:'flex', flexDirection:'column', overflow:'hidden' }}>
            <div style={{ padding:'12px 12px 8px', borderBottom:`1px solid ${T.border}`, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <span style={{ fontFamily:T.mono, fontSize:9, color:T.muted, letterSpacing:3 }}>ONLINE — {online.length}</span>
              <button onClick={()=>setShowOnline(false)} style={{ padding:'2px 7px', border:`1px solid ${T.border}`, borderRadius:6, background:'transparent', color:T.muted, cursor:'pointer', fontSize:12 }}>✕</button>
            </div>
            <div style={{ flex:1, overflowY:'auto', padding:'6px 0' }}>
              {Object.entries(voicePresenceByRoom).length > 0 && (
                <div style={{ borderBottom:`1px solid ${T.border}`, padding:'4px 0 8px', marginBottom:4 }}>
                  <div style={{ padding:'4px 12px 6px', fontFamily:T.mono, fontSize:8, color:T.accentB, letterSpacing:2 }}>IN VOICE</div>
                  {rooms.filter(r => voicePresenceByRoom[r.id]?.length).map(r => (
                    <div key={r.id} style={{ padding:'4px 12px' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:5, fontFamily:T.mono, fontSize:9, color:T.muted }}>
                        <span>{r.type === 'video' ? '📹' : '🔊'}</span>
                        <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.name}</span>
                      </div>
                      {voicePresenceByRoom[r.id].map(u => (
                        <div key={`${r.id}-${u.presenceKey || u.username}`} onContextMenu={e => userCtx(e, u)} style={{ display:'flex', alignItems:'center', gap:8, padding:'3px 0 3px 10px', cursor:'default', borderRadius:4 }}
                            onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.04)'} onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                            <Av name={u.username} size={22} online/>
                          <div style={{ minWidth:0, flex:1 }}>
                            <div style={{ fontSize:11, color:u.username===me?T.accent:T.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{u.username}{u.username===me?' (you)':''}</div>
                            <RolePill role={u.role} />
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
{online.map(u=>(
                 <div key={u.presenceKey || u.username} onContextMenu={e => userCtx(e, u)} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 12px', cursor:'default', borderRadius:4 }}
                   onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.04)'} onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                   <Av name={u.username} size={26} online/>
                   <div style={{ flex:1, minWidth:0 }}>
                     <div style={{ fontSize:11, fontWeight:u.username===me?600:400, color:u.username===me?T.accent:T.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                       {u.username}{u.username===me?' (you)':''}
                     </div>
                     <RolePill role={u.role} />
                   </div>
                 </div>
               ))}
               {roomMembers.filter(m => m.username !== me && !online.some(o => o.username === m.username)).length > 0 && (
                 <div style={{ borderTop:`1px solid ${T.border}`, marginTop:4, paddingTop:4 }}>
                   <div style={{ padding:'4px 12px 6px', fontFamily:T.mono, fontSize:8, color:T.muted, letterSpacing:2 }}>OFFLINE — {roomMembers.filter(m => m.username !== me && !online.some(o => o.username === m.username)).length}</div>
                   {roomMembers.filter(m => m.username !== me && !online.some(o => o.username === m.username)).map(m => {
                     const u = { username: m.username, role: m.role || 'member' }
                     return (
                       <div key={m.username} onContextMenu={e => userCtx(e, u)} style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 12px', cursor:'default', borderRadius:4 }}
                         onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.03)'} onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                         <span style={{ width:26, height:26, borderRadius:'50%', background:'rgba(255,255,255,0.06)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, color:T.muted, flexShrink:0, fontFamily:T.mono }}>{m.username.charAt(0).toUpperCase()}</span>
                         <div style={{ flex:1, minWidth:0 }}>
                           <div style={{ fontSize:11, color:T.muted, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{m.username}</div>
                           <RolePill role={m.role || 'member'} />
                         </div>
                       </div>
                     )
                   })}
                 </div>
               )}
            </div>
          </div>
        )}
      </div>
    </>
  )
}

// ── Voice call error boundary ─────────────────────────────────────────
class VoiceErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { crashed: false, error: null }
  }
  static getDerivedStateFromError(err) {
    return { crashed: true, error: err }
  }
  componentDidCatch(err) {
    console.error('[VoiceErrorBoundary] LiveKit panel crashed:', err)
  }
  render() {
    if (this.state.crashed) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          flex: 1, gap: 12, padding: 40, textAlign: 'center',
        }}>
          <div style={{ fontSize: 28, opacity: 0.5 }}>🎙</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 2, color: '#f87171' }}>
            VOICE CALL CRASHED
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>
            {this.state.error?.message || 'Unknown error'}
          </div>
          <button onClick={() => this.setState({ crashed: false, error: null })}
            style={{
              fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 2,
              padding: '8px 18px', background: 'var(--green)', color: '#000',
              border: 'none', cursor: 'pointer', borderRadius: 4,
            }}>
            ↺ RETRY
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
