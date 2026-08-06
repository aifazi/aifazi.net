import { useState } from 'react'
import { T, ROLES } from '../chat-constants'

export function RoleSelect({ label, value, onChange }) {
  const toggle = (role) => {
    const next = value.includes(role) ? value.filter(r => r !== role) : [...value, role]
    onChange(next)
  }
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontFamily: T.mono, fontSize: 10, color: T.muted, marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {ROLES.map(role => (
          <button key={role} onClick={() => toggle(role)}
            style={{ padding: '5px 12px', border: `1px solid ${value.includes(role) ? 'color-mix(in srgb, var(--green) 50%, transparent)' : T.border}`,
              borderRadius: 7, background: value.includes(role) ? 'color-mix(in srgb, var(--green) 10%, transparent)' : 'transparent',
              color: value.includes(role) ? T.accent : T.muted, fontFamily: T.mono, fontSize: 10,
              cursor: 'pointer', textTransform: 'uppercase', letterSpacing: 1 }}>
            {role}
          </button>
        ))}
      </div>
      {value.length === 0 && <div style={{ fontFamily: T.mono, fontSize: 8, color: T.muted, marginTop: 4 }}>Empty = all roles allowed</div>}
    </div>
  )
}

export function ChannelModal({ initial, onSave, onClose }) {
  const editing = initial && typeof initial === 'object'
  const [name, setName] = useState(editing ? initial.name : '')
  const [desc, setDesc] = useState(editing ? initial.description || '' : '')
  const [emoji, setEmoji] = useState(editing ? initial.emoji || '#' : '#')
  const [color, setColor] = useState(editing ? initial.color || '#00ff88' : '#00ff88')
  const [ctype, setCtype] = useState(editing ? initial.type || 'text' : 'text')
  const [isPrivate, setIsPrivate] = useState(editing ? initial.is_private || false : false)
  const [allowedRoles, setAllowedRoles] = useState(editing ? initial.allowed_roles || [] : [])
  const [speakRoles, setSpeakRoles] = useState(editing ? initial.speak_roles || [] : [])
  const [screenRoles, setScreenRoles] = useState(editing ? initial.screen_share_roles || [] : [])

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
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(3px)' }} />
      <div style={{ position: 'relative', background: 'rgba(18,21,34,0.98)', border: `1px solid ${T.border}`, borderRadius: 14, padding: '24px', width: 400, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}>
        <h3 style={{ fontFamily: T.display, fontSize: 16, color: T.text, margin: '0 0 18px' }}>{editing ? 'Edit Channel' : 'Create Channel'}</h3>

        <label style={{ display: 'block', marginBottom: 12 }}>
          <div style={{ fontFamily: T.mono, fontSize: 10, color: T.muted, marginBottom: 4 }}>CHANNEL TYPE</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {['text', 'voice', 'video'].map(t => (
              <button key={t} onClick={() => setCtype(t)}
                style={{ flex: 1, padding: '8px', border: `1px solid ${ctype === t ? 'color-mix(in srgb, var(--green) 40%, transparent)' : T.border}`, borderRadius: 8, background: ctype === t ? 'color-mix(in srgb, var(--green) 8%, transparent)' : 'transparent', color: ctype === t ? T.accent : T.muted, fontFamily: T.mono, fontSize: 10, cursor: 'pointer', textTransform: 'uppercase' }}>
                {t === 'voice' ? 'ðŸ”Š' : t === 'video' ? 'ðŸ“¹' : 'ðŸ“'} {t}
              </button>
            ))}
          </div>
        </label>

        <label style={{ display: 'block', marginBottom: 12 }}>
          <div style={{ fontFamily: T.mono, fontSize: 10, color: T.muted, marginBottom: 4 }}>NAME</div>
          <input value={name} onChange={e => setName(e.target.value)} placeholder='channel-name' autoFocus
            style={{ width: '100%', padding: '9px 12px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, fontFamily: T.display, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
        </label>

        <label style={{ display: 'block', marginBottom: 12 }}>
          <div style={{ fontFamily: T.mono, fontSize: 10, color: T.muted, marginBottom: 4 }}>EMOJI</div>
          <input value={emoji} onChange={e => setEmoji(e.target.value)} placeholder='#'
            style={{ width: 60, padding: '8px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, fontFamily: T.display, fontSize: 18, outline: 'none', textAlign: 'center' }} />
        </label>

        <label style={{ display: 'block', marginBottom: 12 }}>
          <div style={{ fontFamily: T.mono, fontSize: 10, color: T.muted, marginBottom: 4 }}>DESCRIPTION</div>
          <input value={desc} onChange={e => setDesc(e.target.value)} placeholder='Optional description'
            style={{ width: '100%', padding: '9px 12px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, fontFamily: T.display, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
        </label>

        {(ctype === 'voice' || ctype === 'video') && (
          <>
            <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 14, marginTop: 6 }}>
              <div style={{ fontFamily: T.mono, fontSize: 9, color: T.accent, letterSpacing: 2, marginBottom: 12 }}>VOICE PERMISSIONS</div>
              <RoleSelect label="ALLOWED JOIN" value={allowedRoles} onChange={setAllowedRoles} />
              <RoleSelect label="CAN SPEAK" value={speakRoles} onChange={setSpeakRoles} />
              <RoleSelect label="CAN SCREEN SHARE" value={screenRoles} onChange={setScreenRoles} />
            </div>
          </>
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
