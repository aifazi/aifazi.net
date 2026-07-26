import { T } from '../chat-constants'

export function MiniCallBar({ room, muted, camOff, deafened, onMute, onDeafen, onCam, onLeave, onReturn, participants }) {
  return (
    <div style={{ flexShrink: 0, borderBottom: `1px solid ${T.border}`, background: 'rgba(10,12,18,0.97)', padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 6, overflowX: 'auto' }}>
      <button onClick={onReturn} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(0,255,136,0.06)', border: `1px solid ${T.border}`, borderRadius: 8, padding: '6px 12px', cursor: 'pointer', color: T.text, textAlign: 'left', minWidth: 0 }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,255,136,0.12)'}
        onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,255,136,0.06)'}>
        <span style={{ fontSize: 14 }}>{room.type === 'video' ? '📹' : '🔊'}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: T.mono, fontSize: 10, color: T.accent, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {room.name}
          </div>
          <div style={{ fontFamily: T.mono, fontSize: 8, color: T.muted }}>
            {participants.length + 1} connected · Click to return
          </div>
        </div>
      </button>
      <button onClick={onMute} title={muted ? 'Unmute' : 'Mute'}
        style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', background: muted ? T.danger : 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {muted ? '🔇' : '🎤'}
      </button>
      <button onClick={onDeafen} title={deafened ? 'Undeafen' : 'Deafen'}
        style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', background: deafened ? T.danger : 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {deafened ? '🔊❌' : '🎧'}
      </button>
      <button onClick={onCam} title={camOff ? 'Camera on' : 'Camera off'}
        style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', background: camOff ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {camOff ? '📷' : '📸'}
      </button>
      <button onClick={onLeave} title="Leave"
        style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', background: T.danger, color: '#fff', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        ❌
      </button>
    </div>
  )
}
