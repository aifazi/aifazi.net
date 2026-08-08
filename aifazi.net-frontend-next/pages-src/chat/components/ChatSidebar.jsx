'use client'
import { useState } from 'react'
import { T } from '../chat-constants'
import { useMenu } from '../../../core/menu'
import { Avatar } from './Avatar'
import { RolePill } from './RolePill'

export function ChatSidebar({ rooms, active, onSelect, onlineCount, unread, isAdmin, onCreate, onEdit, callRoom, onJoinCall, onLeaveCall, me, role, voicePresenceByRoom }) {
  const [hov, setHov] = useState(null)
  const { openContextMenu } = useMenu()
  const txtChs = rooms.filter(r => r.type !== 'voice' && r.type !== 'video')
  const vcChs = rooms.filter(r => r.type === 'voice' || r.type === 'video')

  const accessIcon = (r) => {
    const a = r.access
    if (r.is_private && !a?.roles?.length && !a?.users?.length) return '🔒'
    if (a?.mode === 'mixed') return '🔐'
    if (a?.mode === 'users') return '👤'
    if (a?.mode === 'roles') return '🛡️'
    return null
  }

  const handleChannelCtx = (e, r) => {
    e.preventDefault()
    e.stopPropagation()
    const items = [
      { icon: '📋', label: 'Copy Channel Name', action: () => navigator.clipboard?.writeText(r.name) },
    ]
    if (isAdmin) {
      items.push({ type: 'separator' })
      items.push({ icon: '✏️', label: 'Edit Channel', action: () => onEdit(r) })
      items.push({ icon: '🗑️', label: 'Delete Channel', variant: 'danger', action: () => onEdit({ ...r, _delete: true }) })
    }
    openContextMenu(e, items, { header: r.name })
  }

  return (
    <div style={{ width: 224, display: 'flex', flexDirection: 'column', height: '100%', background: T.sidebar, borderRight: `1px solid ${T.border}`, overflow: 'hidden' }}>
      <div style={{ padding: '14px 14px 10px', borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: T.mono, fontSize: 9, letterSpacing: 3, color: T.muted }}>CHANNELS</span>
          {isAdmin && <button onClick={onCreate} style={{ background: 'none', border: `1px solid ${T.border}`, borderRadius: 6, color: T.muted, fontSize: 16, cursor: 'pointer', padding: '0 6px', lineHeight: 1 }}>+</button>}
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 8px' }}>
        {vcChs.length > 0 && (
          <>
            <div style={{ padding: '8px 6px 4px', fontFamily: T.mono, fontSize: 8, letterSpacing: 2, color: 'rgba(255,255,255,0.15)', textTransform: 'uppercase' }}>Voice Channels</div>
            {vcChs.map(r => {
              const people = voicePresenceByRoom?.[r.id] || []
              return (
                <div key={r.id} style={{ marginBottom: 4 }}>
                  <button
                    onMouseEnter={() => setHov(r.id)} onMouseLeave={() => setHov(null)}
                    onClick={() => onSelect(r)} onContextMenu={e => handleChannelCtx(e, r)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px', marginBottom: 1,
                      borderRadius: 8, background: active?.id === r.id ? 'rgba(255,255,255,0.08)' : hov === r.id ? 'rgba(255,255,255,0.03)' : 'transparent',
                      border: 'none', cursor: 'pointer', color: active?.id === r.id ? T.text : T.muted, textAlign: 'left',
                      fontFamily: T.display, fontSize: 13 }}>
                    <span style={{ fontSize: 14 }}>{r.type === 'video' ? '📹' : '🔊'}</span>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                    {accessIcon(r) && <span style={{ fontSize: 10, flexShrink: 0 }}>{accessIcon(r)}</span>}
                    {people.length > 0 && <span style={{ fontFamily: T.mono, fontSize: 9, color: T.accent }}>{people.length}</span>}
                    {callRoom?.id === r.id && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#23d160', flexShrink: 0 }} />}
                  </button>
                  {people.length > 0 && (
                    <div style={{ marginLeft: 27, padding: '1px 0 3px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {people.slice(0, 5).map(p => (
                        <div key={p.presenceKey || p.username} style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, color: T.muted }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#23d160', flexShrink: 0 }} />
                          <span style={{ fontFamily: T.display, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: p.username === me ? T.accent : T.muted }}>{p.username}{p.username === me ? ' (you)' : ''}</span>
                          <RolePill role={p.role} />
                        </div>
                      ))}
                      {people.length > 5 && <div style={{ fontFamily: T.mono, fontSize: 8, color: T.muted }}>+{people.length - 5} more</div>}
                    </div>
                  )}
                </div>
              )
            })}
            <div style={{ height: 1, background: T.border, margin: '8px 8px' }} />
          </>
        )}

        <div style={{ padding: '4px 6px 4px', fontFamily: T.mono, fontSize: 8, letterSpacing: 2, color: 'rgba(255,255,255,0.15)', textTransform: 'uppercase' }}>Text Channels</div>
        {txtChs.map(r => (
          <button key={r.id}
            onMouseEnter={() => setHov(r.id)} onMouseLeave={() => setHov(null)}
            onClick={() => onSelect(r)} onContextMenu={e => handleChannelCtx(e, r)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px', marginBottom: 1,
              borderRadius: 8, background: active?.id === r.id ? 'rgba(255,255,255,0.08)' : hov === r.id ? 'rgba(255,255,255,0.03)' : 'transparent',
              border: 'none', cursor: 'pointer', color: active?.id === r.id ? T.text : T.muted, textAlign: 'left',
              fontFamily: T.display, fontSize: 13 }}>
            <span style={{ fontSize: 12 }}>{r.emoji || '#'}</span>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
            {accessIcon(r) && <span style={{ fontSize: 10, flexShrink: 0 }}>{accessIcon(r)}</span>}
            {unread[r.id] > 0 && <span style={{ background: T.accent, color: '#000', fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 10, fontFamily: T.mono }}>{unread[r.id]}</span>}
          </button>
        ))}
      </div>
      <div style={{ borderTop: `1px solid ${T.border}`, padding: '10px 14px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Avatar name={me} size={28} online />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{me}</span>
            <RolePill role={role} />
          </div>
          <div style={{ fontSize: 9, color: T.muted }}>{onlineCount} online</div>
        </div>
        {callRoom && <button onClick={onLeaveCall} style={{ background: T.danger, border: 'none', borderRadius: 6, color: '#fff', fontSize: 11, padding: '4px 8px', cursor: 'pointer', fontFamily: T.mono }}>LEAVE</button>}
      </div>
    </div>
  )
}
