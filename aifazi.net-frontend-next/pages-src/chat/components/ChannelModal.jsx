import { useState } from 'react'
import { T, ROLES } from '../chat-constants'
import api from '@/lib/api'

const MODES = [
  { key: 'public', label: 'Public' },
  { key: 'roles', label: 'Roles' },
  { key: 'users', label: 'Users' },
  { key: 'mixed', label: 'Mixed' },
  { key: 'closed', label: 'Closed' },
]
const PLATFORM_ROLES = ['member', 'admin', 'moderator', 'editor', 'chat']

export function RoleSelect({ label, value, onChange, roles }) {
  const toggle = (role) => {
    const next = value.includes(role) ? value.filter(r => r !== role) : [...value, role]
    onChange(next)
  }
  const list = roles || ROLES
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontFamily: T.mono, fontSize: 10, color: T.muted, marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {list.map(role => (
          <button key={role} onClick={() => toggle(role)}
            style={{ padding: '5px 12px', border: `1px solid ${value.includes(role) ? 'color-mix(in srgb, var(--green) 50%, transparent)' : T.border}`,
              borderRadius: 7, background: value.includes(role) ? 'color-mix(in srgb, var(--green) 10%, transparent)' : 'transparent',
              color: value.includes(role) ? T.accent : T.muted, fontFamily: T.mono, fontSize: 10,
              cursor: 'pointer', textTransform: 'uppercase', letterSpacing: 1 }}>
            {role}
          </button>
        ))}
      </div>
      {value.length === 0 && <div style={{ fontFamily: T.mono, fontSize: 8, color: T.muted, marginTop: 4 }}>Empty = not restricted by this</div>}
    </div>
  )
}

const inputStyle = { width: '100%', padding: '9px 12px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, fontFamily: T.display, fontSize: 13, outline: 'none', boxSizing: 'border-box' }

export function ChannelModal({ initial, onSave, onClose }) {
  const editing = initial && typeof initial === 'object'
  const [name, setName] = useState(editing ? initial.name : '')
  const [desc, setDesc] = useState(editing ? initial.description || '' : '')
  const [emoji, setEmoji] = useState(editing ? initial.emoji || '#' : '#')
  const [color, setColor] = useState(editing ? initial.color || '#00ff88' : '#00ff88')
  const [ctype, setCtype] = useState(editing ? initial.type || 'text' : 'text')
  const [readOnly, setReadOnly] = useState(editing ? !!initial.read_only : false)
  const [slowMode, setSlowMode] = useState(editing ? String(initial.slow_mode || 0) : '0')

  const [allowedRoles, setAllowedRoles] = useState(editing ? initial.allowed_roles || [] : [])
  const [allowedUsers, setAllowedUsers] = useState(editing ? initial.allowed_users || [] : [])
  const [speakRoles, setSpeakRoles] = useState(editing ? initial.speak_roles || [] : [])
  const [screenRoles, setScreenRoles] = useState(editing ? initial.screen_share_roles || [] : [])
  const [mode, setMode] = useState(() => {
    if (!editing) return 'public'
    const ar = initial.allowed_roles || []
    const au = initial.allowed_users || []
    if (ar.length && au.length) return 'mixed'
    if (ar.length) return 'roles'
    if (au.length) return 'users'
    return initial.is_private ? 'closed' : 'public'
  })

  const [userQ, setUserQ] = useState('')
  const [userRes, setUserRes] = useState([])
  const [userBusy, setUserBusy] = useState(false)

  const changeMode = (m) => {
    setMode(m)
    if (m === 'public' || m === 'closed') {
      setAllowedRoles([])
      setAllowedUsers([])
    } else if (m === 'roles') {
      setAllowedUsers([])
    } else if (m === 'users') {
      setAllowedRoles([])
    }
  }

  const searchUsers = async (q) => {
    setUserQ(q)
    if (!q.trim()) { setUserRes([]); return }
    setUserBusy(true)
    try {
      const r = await api.get(`/chat/users/search?q=${encodeURIComponent(q.trim())}`)
      setUserRes(r.data || [])
    } catch { setUserRes([]) } finally { setUserBusy(false) }
  }

  const addUser = (u) => {
    if (allowedUsers.includes(u.username)) return
    setAllowedUsers([...allowedUsers, u.username])
    setUserQ('')
    setUserRes([])
  }

  const handleSave = () => {
    if (!name.trim()) return
    onSave({
      name: name.trim(), description: desc.trim(), emoji, color, type: ctype,
      is_private: mode === 'closed',
      allowed_roles: allowedRoles,
      allowed_users: allowedUsers,
      speak_roles: speakRoles,
      screen_share_roles: screenRoles,
      read_only: readOnly,
      slow_mode: parseInt(slowMode || '0', 10) || 0,
      id: editing ? initial.id : undefined,
    })
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(3px)' }} />
      <div style={{ position: 'relative', background: 'rgba(18,21,34,0.98)', border: `1px solid ${T.border}`, borderRadius: 14, padding: '24px', width: 440, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}>
        <h3 style={{ fontFamily: T.display, fontSize: 16, color: T.text, margin: '0 0 18px' }}>{editing ? 'Edit Channel' : 'Create Channel'}</h3>

        <label style={{ display: 'block', marginBottom: 12 }}>
          <div style={{ fontFamily: T.mono, fontSize: 10, color: T.muted, marginBottom: 4 }}>CHANNEL TYPE</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {['text', 'voice', 'video'].map(t => (
              <button key={t} onClick={() => setCtype(t)}
                style={{ flex: 1, padding: '8px', border: `1px solid ${ctype === t ? 'color-mix(in srgb, var(--green) 40%, transparent)' : T.border}`, borderRadius: 8, background: ctype === t ? 'color-mix(in srgb, var(--green) 8%, transparent)' : 'transparent', color: ctype === t ? T.accent : T.muted, fontFamily: T.mono, fontSize: 10, cursor: 'pointer', textTransform: 'uppercase' }}>
                {t === 'voice' ? '🔊' : t === 'video' ? '📹' : '📝'} {t}
              </button>
            ))}
          </div>
        </label>

        <label style={{ display: 'block', marginBottom: 12 }}>
          <div style={{ fontFamily: T.mono, fontSize: 10, color: T.muted, marginBottom: 4 }}>NAME</div>
          <input value={name} onChange={e => setName(e.target.value)} placeholder='channel-name' autoFocus style={inputStyle} />
        </label>

        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <label style={{ flex: 'none' }}>
            <div style={{ fontFamily: T.mono, fontSize: 10, color: T.muted, marginBottom: 4 }}>EMOJI</div>
            <input value={emoji} onChange={e => setEmoji(e.target.value)} placeholder='#' style={{ ...inputStyle, width: 60, textAlign: 'center', fontSize: 18 }} />
          </label>
          <label style={{ flex: 1 }}>
            <div style={{ fontFamily: T.mono, fontSize: 10, color: T.muted, marginBottom: 4 }}>COLOR</div>
            <input value={color} onChange={e => setColor(e.target.value)} placeholder='#00ff88' style={inputStyle} />
          </label>
        </div>

        <label style={{ display: 'block', marginBottom: 12 }}>
          <div style={{ fontFamily: T.mono, fontSize: 10, color: T.muted, marginBottom: 4 }}>DESCRIPTION</div>
          <input value={desc} onChange={e => setDesc(e.target.value)} placeholder='Optional description' style={inputStyle} />
        </label>

        <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 14, marginBottom: 12 }}>
          <div style={{ fontFamily: T.mono, fontSize: 9, color: T.accent, letterSpacing: 2, marginBottom: 10 }}>ACCESS — WHO CAN OPEN</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {MODES.map(m => (
              <button key={m.key} onClick={() => changeMode(m.key)}
                style={{ padding: '6px 12px', border: `1px solid ${mode === m.key ? 'color-mix(in srgb, var(--green) 50%, transparent)' : T.border}`, borderRadius: 16, background: mode === m.key ? 'color-mix(in srgb, var(--green) 10%, transparent)' : 'transparent', color: mode === m.key ? T.accent : T.muted, fontFamily: T.mono, fontSize: 10, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: 1 }}>
                {m.label}
              </button>
            ))}
          </div>

          {(mode === 'roles' || mode === 'mixed') && (
            <RoleSelect label="ALLOWED ROLES" value={allowedRoles} onChange={setAllowedRoles} roles={PLATFORM_ROLES} />
          )}

          {(mode === 'users' || mode === 'mixed') && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontFamily: T.mono, fontSize: 10, color: T.muted, marginBottom: 6 }}>ALLOWED USERS</div>
              <input value={userQ} onChange={e => searchUsers(e.target.value)} placeholder='Search users…' style={inputStyle} />
              {userBusy && <div style={{ fontFamily: T.mono, fontSize: 9, color: T.muted, marginTop: 4 }}>searching…</div>}
              {userRes.map(u => (
                <button key={u.username} onClick={() => addUser(u)} disabled={allowedUsers.includes(u.username)}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', marginTop: 4, background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.border}`, borderRadius: 7, color: allowedUsers.includes(u.username) ? T.muted : T.text, fontFamily: T.display, fontSize: 12, cursor: 'pointer' }}>
                  {u.username} {u.role ? <span style={{ color: T.muted, fontSize: 10 }}>· {u.role}</span> : null} <span style={{ color: T.accent }}>＋</span>
                </button>
              ))}
              {allowedUsers.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                  {allowedUsers.map(u => (
                    <button key={u} onClick={() => setAllowedUsers(allowedUsers.filter(x => x !== u))}
                      style={{ padding: '5px 10px', border: `1px solid ${T.border}`, borderRadius: 14, background: 'rgba(255,255,255,0.06)', color: T.text, fontFamily: T.mono, fontSize: 10, cursor: 'pointer' }}>
                      ✕ {u}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {mode === 'closed' && (
            <div style={{ fontFamily: T.mono, fontSize: 9, color: T.warn, marginBottom: 8 }}>CLOSED — only staff can see this channel.</div>
          )}

          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 4 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={readOnly} onChange={e => setReadOnly(e.target.checked)} />
              <span style={{ fontFamily: T.mono, fontSize: 10, color: T.muted }}>READ-ONLY</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontFamily: T.mono, fontSize: 10, color: T.muted }}>SLOW MODE (s)</span>
              <input value={slowMode} onChange={e => setSlowMode(e.target.value)} type="number" min="0" style={{ ...inputStyle, width: 70, padding: '6px 8px', textAlign: 'center' }} />
            </label>
          </div>
        </div>

        {(ctype === 'voice' || ctype === 'video') && (
          <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 14 }}>
            <div style={{ fontFamily: T.mono, fontSize: 9, color: T.accent, letterSpacing: 2, marginBottom: 12 }}>VOICE PERMISSIONS</div>
            <RoleSelect label="CAN SPEAK" value={speakRoles} onChange={setSpeakRoles} />
            <RoleSelect label="CAN SCREEN SHARE" value={screenRoles} onChange={setScreenRoles} />
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
          <button onClick={handleSave} style={{ flex: 1, padding: '10px', border: 'none', borderRadius: 8, background: 'linear-gradient(135deg,color-mix(in srgb, var(--green) 85%, transparent),color-mix(in srgb, var(--cyan) 85%, transparent))', color: '#000', fontFamily: T.mono, fontSize: 11, fontWeight: 700, cursor: 'pointer', letterSpacing: 1 }}>
            {editing ? 'SAVE' : 'CREATE'}
          </button>
          <button onClick={onClose} style={{ padding: '10px 18px', border: `1px solid ${T.border}`, borderRadius: 8, background: 'transparent', color: T.muted, fontFamily: T.mono, fontSize: 11, cursor: 'pointer' }}>CANCEL</button>
        </div>
      </div>
    </div>
  )
}
