import { useState, useEffect, useRef } from 'react'
import { T, parseParticipantMetadata, isUuidLike, aCol } from '../chat-constants'
import { Avatar } from './Avatar'
import { RolePill } from './RolePill'
import api from '@/lib/api'

export function VoicePanel({ room, onLeave, muted, camOff, onMute, onCam, onScreen, canScreenShare, me, isAdmin, msgs, onSendMsg, onParticipantsChange }) {
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
  const [audioOnly, setAudioOnly] = useState(false)
  const [pttMode, setPttMode] = useState(false)
  const [holding, setHolding] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [audioInputs, setAudioInputs] = useState([])
  const [audioOutputs, setAudioOutputs] = useState([])
  const [audioInIndex, setAudioInIndex] = useState(0)
  const [audioOutIndex, setAudioOutIndex] = useState(0)
  const [volume, setVolume] = useState(100)
  const [chatOpen, setChatOpen] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [modErr, setModErr] = useState('')
  const roomRef = useRef(null)
  const audioElsRef = useRef({})
  const speakingIntervalRef = useRef(null)
  const chatListRef = useRef(null)
  const effectiveMuted = muted && !(pttMode && holding)

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

        const token = room._lkToken
        const url = room._lkUrl

        if (!token || !url) {
          setError('Missing connection credentials')
          setConnecting(false)
          return
        }

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
          if (track && track.kind === 'audio' && track.mediaStreamTrack && participant.identity !== lkRoom.localParticipant?.identity) {
            const key = `${participant.identity}-audio`
            if (!audioElsRef.current[key]) {
              const audioEl = document.createElement('audio')
              audioEl.autoplay = true
              audioEl.playsInline = true
              audioEl.id = key
              audioEl.volume = volume / 100
              document.body.appendChild(audioEl)
              audioElsRef.current[key] = audioEl
            }
            const stream = new MediaStream([track.mediaStreamTrack])
            audioElsRef.current[key].srcObject = stream
          }
          if (pub?.source === 'screen_share' && track?.mediaStreamTrack) {
            setScreenStream(new MediaStream([track.mediaStreamTrack]))
            if (participant.identity === lkRoom.localParticipant?.identity) setScreenActive(true)
          }
        })
        lkRoom.on(RoomEvent.TrackUnsubscribed, (track, pub, participant) => {
          updateParticipants(lkRoom)
          if (pub?.source === 'screen_share') setScreenStream(null)
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

        if (room._e2eeKey) {
          try {
            const keyBytes = Uint8Array.from(atob(room._e2eeKey), c => c.charCodeAt(0))
            await lkRoom.setE2EEKey(keyBytes)
          } catch (e) {
            console.warn('[LiveKit] E2EE setup failed (non-fatal):', e.message)
          }
        }

        try {
          await lkRoom.localParticipant.setMicrophoneEnabled(true)
        } catch (mediaErr) {
          console.warn('[LiveKit] mic access denied:', mediaErr.message)
        }

        roomRef.current = lkRoom
        setConnecting(false)
        updateParticipants(lkRoom)

        speakingIntervalRef.current = setInterval(() => {
          if (!roomRef.current) return
          const map = {}
          roomRef.current.remoteParticipants.forEach(p => {
            map[p.identity] = p.isSpeaking
          })
          setSpeakingMap(map)
          setLocalSpeaking(roomRef.current.localParticipant?.isSpeaking || false)
        }, 300)

        try {
          const devices = await navigator.mediaDevices.enumerateDevices()
          setAudioInputs(devices.filter(d => d.kind === 'audioinput'))
          setAudioOutputs(devices.filter(d => d.kind === 'audiooutput'))
          setCameras(devices.filter(d => d.kind === 'videoinput'))
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
      Object.values(audioElsRef.current).forEach(el => { el.srcObject = null; el.remove() })
      audioElsRef.current = {}
      if (roomRef.current) { roomRef.current.disconnect(); roomRef.current = null }
    }
  }, [room.id])

  useEffect(() => {
    roomRef.current?.localParticipant?.setMicrophoneEnabled(!effectiveMuted)
  }, [effectiveMuted])

  useEffect(() => {
    const lkRoom = roomRef.current
    if (!lkRoom) return
    const enableCam = room.type === 'video' && !camOff
    lkRoom.localParticipant?.setCameraEnabled(enableCam).catch?.()
  }, [camOff, room.type])

  // Remote volume control — apply to all current + future remote audio elements.
  useEffect(() => {
    Object.values(audioElsRef.current).forEach(el => { el.volume = volume / 100 })
  }, [volume])

  // Push-to-talk: hold Space (or the on-screen button) while muted to talk.
  useEffect(() => {
    if (!pttMode) return
    const down = (e) => {
      if (e.code === 'Space' && !e.repeat) { e.preventDefault(); setHolding(true) }
    }
    const up = (e) => {
      if (e.code === 'Space') setHolding(false)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', () => setHolding(false))
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', () => setHolding(false))
      setHolding(false)
    }
  }, [pttMode])

  const handleScreenShare = async () => {
    try {
      const enabled = roomRef.current?.localParticipant?.isScreenShareEnabled
      await roomRef.current?.localParticipant?.setScreenShareEnabled(!enabled)
      setScreenActive(!enabled)
    } catch {}
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
    try {
      const currentTrack = roomRef.current?.localParticipant?.videoTrackPublications?.values()?.next()?.value?.track
      if (currentTrack) {
        const newFacing = currentTrack.mediaStreamTrack?.getSettings()?.facingMode === 'user' ? 'environment' : 'user'
        await roomRef.current?.localParticipant?.setCameraEnabled(false)
        await roomRef.current?.localParticipant?.setCameraEnabled(true, { facingMode: newFacing })
      } else {
        await roomRef.current?.localParticipant?.setCameraEnabled(true, { facingMode: 'environment' })
        setCamOff(false)
      }
    } catch {
      switchCamera()
    }
  }

  const switchMic = async (idx) => {
    const d = audioInputs[idx]
    if (!d) return
    try { await roomRef.current?.switchActiveDevice('audioinput', d.deviceId); setAudioInIndex(idx) } catch {}
  }

  const switchSpeaker = async (idx) => {
    const d = audioOutputs[idx]
    if (!d) return
    try { await roomRef.current?.switchActiveDevice('audiooutput', d.deviceId); setAudioOutIndex(idx) } catch {}
  }

  // ── Staff moderation of participants ──────────────────────────────────────
  const muteParticipant = async (p) => {
    try {
      await api.post('/chat/livekit/admin/mute', { room_id: room.id, identity: p.identity })
      setModErr('')
    } catch (e) { setModErr(e?.response?.data?.detail || 'Could not mute participant') }
  }

  const kickParticipant = async (p) => {
    if (!window.confirm(`Disconnect ${p.displayName} from the call?`)) return
    try {
      await api.post('/chat/livekit/admin/kick', { room_id: room.id, identity: p.identity })
      setModErr('')
    } catch (e) { setModErr(e?.response?.data?.detail || 'Could not disconnect participant') }
  }

  const sendChat = async () => {
    const txt = chatInput.trim()
    if (!txt || !onSendMsg) return
    setChatInput('')
    await onSendMsg(txt)
    setTimeout(() => chatListRef.current?.scrollTo({ top: chatListRef.current.scrollHeight, behavior: 'smooth' }), 100)
  }

  if (connecting) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
        <div style={{ width: 48, height: 48, border: `2px solid ${T.accent}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <div style={{ fontFamily: T.mono, fontSize: 11, color: T.muted }}>Joining {room.name}...</div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, padding: 20 }}>
        <div style={{ fontSize: 40 }}>⚠️</div>
        <div style={{ fontFamily: T.mono, fontSize: 11, color: T.danger, textAlign: 'center' }}>{error}</div>
        {errorDetail && <div style={{ fontFamily: T.mono, fontSize: 9, color: T.muted, textAlign: 'center', maxWidth: 300, lineHeight: 1.6 }}>{errorDetail}</div>}
        <button onClick={onLeave} style={{ padding: '10px 20px', border: `1px solid ${T.border}`, borderRadius: 8, background: 'rgba(255,71,87,0.1)', color: T.danger, fontFamily: T.mono, fontSize: 11, cursor: 'pointer' }}>LEAVE</button>
      </div>
    )
  }

  const typeLabel = room.type === 'video' ? 'Video Call' : 'Voice Chat'
  const isVideo = room.type === 'video'
  const ctlBtn = (active) => ({
    width: 40, height: 40, borderRadius: '50%', border: active ? '2px solid #00ff88' : 'none',
    background: active ? 'color-mix(in srgb, var(--green) 15%, transparent)' : 'rgba(255,255,255,0.1)',
    color: '#fff', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  })

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: T.main, position: 'relative' }}>
      <div style={{ padding: '10px 16px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 16 }}>{room.type === 'video' ? '📹' : '🔊'}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: T.display, fontSize: 14, fontWeight: 700, color: T.text }}>{room.name}</div>
          <div style={{ fontFamily: T.mono, fontSize: 9, color: T.muted, letterSpacing: 1 }}>{typeLabel} · {participants.length + 1} participant{(participants.length + 1) !== 1 ? 's' : ''}</div>
        </div>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#23d160' }} />
      </div>

      {modErr && <div style={{ padding: '4px 14px', fontFamily: T.mono, fontSize: 10, color: T.danger, background: 'rgba(255,71,87,0.08)' }}>{modErr}</div>}

      {screenStream && (
        <div style={{ flex: '0 0 auto', height: 240, background: '#000', borderBottom: `1px solid ${T.border}`, position: 'relative', overflow: 'hidden' }}>
          <video ref={el => { if (el && el.srcObject !== screenStream) el.srcObject = screenStream }}
            autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          <div style={{ position: 'absolute', bottom: 8, left: 12, background: 'rgba(0,0,0,0.65)', borderRadius: 6, padding: '2px 10px', fontFamily: T.mono, fontSize: 9, color: '#fff', zIndex: 2 }}>
            🖥 Screen Share
          </div>
        </div>
      )}

      {audioOnly ? (
        <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[{ self: true, identity: 'local', displayName: me, role: room._myRole, isMicrophoneEnabled: !muted, isCameraEnabled: !camOff, isScreenShareEnabled: screenActive }, ...participants].map(p => (
            <div key={p.identity} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8,
              background: 'rgba(0,0,0,0.3)', border: (p.self ? localSpeaking : speakingMap[p.identity]) ? '1.5px solid #00ff88' : `1px solid ${T.border}`,
            }}>
              <Avatar name={p.displayName} size={34} online />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: T.display, fontSize: 12, color: T.text, fontWeight: 600 }}>{p.displayName}{p.self ? ' (you)' : ''}</div>
                <RolePill role={p.role} />
              </div>
              <span title={p.isMicrophoneEnabled !== false ? 'Microphone on' : 'Microphone off'} style={{ fontSize: 13 }}>{p.isMicrophoneEnabled !== false ? '🎤' : '🔇'}</span>
              {!p.self && (room.type === 'video' || p.isCameraEnabled) && <span style={{ fontSize: 13 }}>{p.isCameraEnabled ? '📷' : '📵'}</span>}
              {p.isScreenShareEnabled && <span style={{ fontSize: 13 }}>🖥</span>}
              {isAdmin && !p.self && (
                <span style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => muteParticipant(p)} title="Force mute" style={{ background: 'none', border: `1px solid ${T.border}`, borderRadius: 6, color: T.warn, cursor: 'pointer', fontSize: 12, padding: '2px 6px' }}>🔇</button>
                  <button onClick={() => kickParticipant(p)} title="Disconnect" style={{ background: 'none', border: `1px solid ${T.border}`, borderRadius: 6, color: T.danger, cursor: 'pointer', fontSize: 12, padding: '2px 6px' }}>⛔</button>
                </span>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 10, alignContent: 'start' }}>
          <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 10, position: 'relative', minHeight: 140, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', border: localSpeaking ? '2px solid #00ff88' : '2px solid transparent', transition: 'border-color 0.15s' }}>
            {isVideo && !camOff && (
              <video ref={el => {
                if (el && roomRef.current?.localParticipant?.videoTrackPublications?.size > 0) {
                  const pub = roomRef.current.localParticipant.videoTrackPublications.values().next().value
                  if (pub?.track) el.srcObject = new MediaStream([pub.track.mediaStreamTrack])
                }
              }} autoPlay playsInline muted style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
            )}
            <div style={{ zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ position: 'relative' }}>
                <Avatar name={me} size={48} online />
                {localSpeaking && <div style={{ position: 'absolute', inset: -4, borderRadius: '50%', border: '2px solid #00ff88', boxShadow: '0 0 12px color-mix(in srgb, var(--green) 50%, transparent)', pointerEvents: 'none' }} />}
              </div>
              <div style={{ fontFamily: T.display, fontSize: 12, color: T.text, marginTop: 8, fontWeight: 600 }}>{me}</div>
              <div style={{ marginTop: 5 }}><RolePill role={room._myRole} /></div>
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: effectiveMuted ? '#ff4757' : '#23d160' }} />
                {isVideo && <span style={{ width: 8, height: 8, borderRadius: '50%', background: camOff ? '#ff4757' : '#23d160' }} />}
              </div>
            </div>
          </div>
          {participants.map(p => (
            <div key={p.identity} style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 10, position: 'relative', minHeight: 140, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', border: speakingMap[p.identity] ? '2px solid #00ff88' : '2px solid transparent', transition: 'border-color 0.15s' }}>
              {p.videoTrack && (
                <video ref={el => { if (el) el.srcObject = new MediaStream([p.videoTrack.mediaStreamTrack]) }}
                  autoPlay playsInline muted style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
              )}
              <div style={{ zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ position: 'relative' }}>
                  <Avatar name={p.displayName} size={48} online />
                  {speakingMap[p.identity] && <div style={{ position: 'absolute', inset: -4, borderRadius: '50%', border: '2px solid #00ff88', boxShadow: '0 0 12px color-mix(in srgb, var(--green) 50%, transparent)', pointerEvents: 'none' }} />}
                </div>
                <div style={{ fontFamily: T.display, fontSize: 12, color: T.text, marginTop: 8, fontWeight: 600 }}>{p.displayName}</div>
                <div style={{ marginTop: 5 }}><RolePill role={p.role} /></div>
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.isMicrophoneEnabled !== false ? '#23d160' : '#ff4757' }} />
                  {(room.type === 'video' || p.isCameraEnabled) && <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.isCameraEnabled ? '#23d160' : '#ff4757' }} />}
                  {p.isScreenShareEnabled && <span style={{ fontSize: 10, color: T.accentB }}>🖥</span>}
                </div>
              </div>
              {isAdmin && (
                <div style={{ position: 'absolute', top: 6, right: 6, zIndex: 3, display: 'flex', gap: 5, opacity: 0, transition: 'opacity 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.opacity = 1}
                  onMouseLeave={e => e.currentTarget.style.opacity = 0}>
                  <button onClick={() => muteParticipant(p)} title="Force mute"
                    style={{ width: 26, height: 26, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.7)', color: T.warn, cursor: 'pointer', fontSize: 12 }}>🔇</button>
                  <button onClick={() => kickParticipant(p)} title="Disconnect"
                    style={{ width: 26, height: 26, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.7)', color: T.danger, cursor: 'pointer', fontSize: 12 }}>⛔</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* In-call text chat panel */}
      {chatOpen && (
        <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 300, background: 'rgba(12,15,22,0.98)', borderLeft: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', zIndex: 5 }}>
          <div style={{ padding: '8px 12px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <span style={{ fontFamily: T.mono, fontSize: 10, color: T.muted, letterSpacing: 2, flex: 1 }}>IN-CALL CHAT</span>
            <button onClick={() => setChatOpen(false)} style={{ padding: '2px 7px', border: `1px solid ${T.border}`, borderRadius: 6, background: 'transparent', color: T.muted, cursor: 'pointer', fontSize: 12 }}>✕</button>
          </div>
          <div ref={chatListRef} style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
            {(msgs || []).slice(-80).map(m => (
              <div key={m.id} style={{ marginBottom: 6 }}>
                <span style={{ fontFamily: T.mono, fontSize: 10, color: m.sender === me ? T.accent : aCol(m.sender), fontWeight: 700 }}>{m.sender}</span>
                <div style={{ fontSize: 12, color: T.text, wordBreak: 'break-word' }}>
                  {m.type === 'file' ? `📎 ${m.file_name || 'file'}` : (m.content || '').replace(/^ENC:/, '')}
                </div>
              </div>
            ))}
            {!(msgs || []).length && <div style={{ fontFamily: T.mono, fontSize: 10, color: T.muted, textAlign: 'center', marginTop: 30 }}>No messages in this call yet.</div>}
          </div>
          <div style={{ display: 'flex', gap: 6, padding: 8, borderTop: `1px solid ${T.border}`, flexShrink: 0 }}>
            <input value={chatInput} onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) sendChat() }}
              placeholder="Message…"
              style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: `1px solid ${T.border}`, color: T.text, fontFamily: T.display, fontSize: 12, padding: '7px 10px', borderRadius: 8, outline: 'none', minWidth: 0 }} />
            <button onClick={sendChat} disabled={!chatInput.trim()}
              style={{ padding: '0 12px', border: 'none', borderRadius: 8, background: chatInput.trim() ? 'linear-gradient(135deg,color-mix(in srgb, var(--green) 85%, transparent),color-mix(in srgb, var(--cyan) 85%, transparent))' : 'rgba(255,255,255,0.06)', color: chatInput.trim() ? '#000' : T.muted, fontFamily: T.mono, fontSize: 10, fontWeight: 700, cursor: chatInput.trim() ? 'pointer' : 'default' }}>
              Send
            </button>
          </div>
        </div>
      )}

      {/* Settings popover (devices + volume) */}
      {settingsOpen && (
        <div style={{ position: 'absolute', bottom: '100%', right: 12, width: 260, background: 'rgba(18,21,32,0.99)', border: `1px solid ${T.border}`, borderRadius: 10, padding: 12, zIndex: 6, boxShadow: '0 10px 40px rgba(0,0,0,0.7)' }}>
          <div style={{ fontFamily: T.mono, fontSize: 9, color: T.muted, letterSpacing: 2, marginBottom: 8 }}>DEVICES</div>
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontFamily: T.mono, fontSize: 9, color: T.accentB, marginBottom: 3 }}>🎤 MICROPHONE</div>
            <select value={audioInIndex} onChange={e => switchMic(parseInt(e.target.value, 10))}
              style={{ width: '100%', background: 'rgba(0,0,0,0.4)', color: T.text, border: `1px solid ${T.border}`, borderRadius: 6, padding: '5px 8px', fontFamily: T.mono, fontSize: 10 }}>
              {audioInputs.length === 0 && <option value={0}>Default</option>}
              {audioInputs.map((d, i) => <option key={d.deviceId} value={i}>{d.label || `Mic ${i + 1}`}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontFamily: T.mono, fontSize: 9, color: T.accentB, marginBottom: 3 }}>🔊 SPEAKER</div>
            <select value={audioOutIndex} onChange={e => switchSpeaker(parseInt(e.target.value, 10))}
              style={{ width: '100%', background: 'rgba(0,0,0,0.4)', color: T.text, border: `1px solid ${T.border}`, borderRadius: 6, padding: '5px 8px', fontFamily: T.mono, fontSize: 10 }}>
              {audioOutputs.length === 0 && <option value={0}>Default</option>}
              {audioOutputs.map((d, i) => <option key={d.deviceId} value={i}>{d.label || `Speaker ${i + 1}`}</option>)}
            </select>
          </div>
          <div style={{ fontFamily: T.mono, fontSize: 9, color: T.accentB, marginBottom: 3 }}>VOLUME {volume}%</div>
          <input type="range" min={0} max={100} value={volume} onChange={e => setVolume(parseInt(e.target.value, 10))}
            style={{ width: '100%', accentColor: '#00ff88' }} />
        </div>
      )}

      <div style={{ borderTop: `1px solid ${T.border}`, padding: '10px 12px', display: 'flex', justifyContent: 'center', gap: 8, flexShrink: 0, overflowX: 'auto', flexWrap: 'wrap', position: 'relative' }}>
        {pttMode && effectiveMuted && (
          <button
            onMouseDown={() => setHolding(true)} onMouseUp={() => setHolding(false)} onMouseLeave={() => setHolding(false)}
            onTouchStart={() => setHolding(true)} onTouchEnd={() => setHolding(false)}
            title={holding ? 'Talking…' : 'Hold to talk (or hold Space)'}
            style={{ ...ctlBtn(holding), background: holding ? '#00ff88' : 'rgba(0,0,0,0.45)', color: holding ? '#000' : T.accent, fontSize: 13, width: 52, height: 52 }}>
            {holding ? '🎙' : '✊'}
          </button>
        )}
        <button onClick={onMute} title={effectiveMuted ? 'Unmute' : 'Mute'}
          style={{ ...ctlBtn(false), background: effectiveMuted ? T.danger : 'rgba(255,255,255,0.1)' }}>
          {effectiveMuted ? '🔇' : '🎤'}
        </button>
        <button onClick={() => setPttMode(p => !p)} title="Push-to-talk"
          style={{ ...ctlBtn(pttMode), fontSize: 12, fontFamily: T.mono, fontWeight: 700 }}>
          PTT
        </button>
        <button onClick={onCam} title={camOff ? 'Turn on camera' : 'Turn off camera'}
          style={{ ...ctlBtn(false), background: camOff ? T.danger : 'rgba(255,255,255,0.1)' }}>
          {camOff ? '📷' : '📸'}
        </button>
        <button onClick={() => setAudioOnly(a => !a)} title="Audio-only mode"
          style={{ ...ctlBtn(audioOnly), fontSize: 13 }}>
          🎛
        </button>
        {cameras.length > 1 && !camOff && (
          <button onClick={switchCamera} title="Switch Camera"
            style={{ ...ctlBtn(false), fontFamily: T.mono, fontWeight: 700, fontSize: 13 }}>↔</button>
        )}
        {!camOff && (
          <button onClick={toggleFrontBack} title="Flip Camera"
            style={{ ...ctlBtn(false) }}>🔄</button>
        )}
        {canScreenShare && (
          <button onClick={handleScreenShare} title={screenActive ? 'Stop Sharing' : 'Share Screen'}
            style={ctlBtn(screenActive)}>🖥</button>
        )}
        <button onClick={() => setChatOpen(o => !o)} title="In-call chat"
          style={{ ...ctlBtn(chatOpen), fontSize: 13 }}>💬</button>
        <button onClick={() => setSettingsOpen(s => !s)} title="Device settings"
          style={{ ...ctlBtn(settingsOpen), fontFamily: T.mono, fontSize: 14 }}>⚙</button>
        <button onClick={onLeave} title="Leave"
          style={{ ...ctlBtn(false), background: T.danger }}>❌</button>
      </div>
    </div>
  )
}
