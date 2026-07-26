import { useState } from 'react'
import { T } from '../chat-constants'

export function EditBar({ msg, onSave, onCancel }) {
  const [text, setText] = useState(msg.content || '')
  return (
    <div style={{ padding: '8px 14px', background: 'rgba(255,215,0,0.06)', borderTop: `1px solid rgba(255,215,0,0.15)`, display: 'flex', gap: 8 }}>
      <span style={{ fontFamily: T.mono, fontSize: 10, color: T.warn, lineHeight: '32px' }}>Editing</span>
      <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') onSave(msg.id, text) }}
        style={{ flex: 1, padding: '6px 10px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, fontFamily: T.display, fontSize: 13, outline: 'none' }} />
      <button onClick={() => onSave(msg.id, text)} style={{ padding: '6px 14px', border: 'none', borderRadius: 8, background: T.accent, color: '#000', fontFamily: T.mono, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>SAVE</button>
      <button onClick={onCancel} style={{ padding: '6px 12px', border: `1px solid ${T.border}`, borderRadius: 8, background: 'transparent', color: T.muted, cursor: 'pointer', fontSize: 14 }}>✕</button>
    </div>
  )
}

export function ReplyBar({ replyTo, onCancel }) {
  if (!replyTo) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', background: 'rgba(0,212,255,0.06)', borderTop: `1px solid rgba(0,212,255,0.15)`, flexShrink: 0 }}>
      <div style={{ flex: 1, fontFamily: T.mono, fontSize: 10, color: T.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        <span style={{ color: T.accentB }}>{replyTo.sender}: </span>{replyTo.content}
      </div>
      <button onClick={onCancel} style={{ padding: '2px 7px', border: `1px solid ${T.border}`, borderRadius: 6, background: 'transparent', color: T.muted, cursor: 'pointer', fontSize: 12 }}>✕</button>
    </div>
  )
}
