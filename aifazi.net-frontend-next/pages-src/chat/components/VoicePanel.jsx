import { useState, useEffect, useRef } from 'react'
import { T, parseParticipantMetadata, isUuidLike } from '../chat-constants'
import { Avatar } from './Avatar'
import { RolePill } from './RolePill'

export function VoicePanel({ room, onLeave, muted, camOff, onMute, onCam, onScreen, canScreenShare, me, onParticipantsChange }) {
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
      Object.values(audioElsRef.current).forEach(el => { el.srcObject = null; el.remove() })
      audioElsRef.current = {}
      if (roomRef.current) { roomRef.current.disconnect(); roomRef.current = null }
    }
  }, [room.id])

  useEffect(() => {
    roomRef.current?.localParticipant?.setMicrophoneEnabled(!muted)
  }, [muted])

  useEffect(() => {
    roomRef.current?.localParticipant?.setCameraEnabled(!camOff)
  }, [camOff])

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
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: T.main }}>
      <div style={{ padding: '10px 16px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 16 }}>{room.type === 'video' ? '📹' : '🔊'}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: T.display, fontSize: 14, fontWeight: 700, color: T.text }}>{room.name}</div>
          <div style={{ fontFamily: T.mono, fontSize: 9, color: T.muted, letterSpacing: 1 }}>{typeLabel} · {participants.length + 1} participant{(participants.length + 1) !== 1 ? 's' : ''}</div>
        </div>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#23d160' }} />
      </div>

      {screenStream && (
        <div style={{ flex: '0 0 auto', height: 240, background: '#000', borderBottom: `1px solid ${T.border}`, position: 'relative', overflow: 'hidden' }}>
          <video ref={el => { if (el && el.srcObject !== screenStream) el.srcObject = screenStream }}
            autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          <div style={{ position: 'absolute', bottom: 8, left: 12, background: 'rgba(0,0,0,0.65)', borderRadius: 6, padding: '2px 10px', fontFamily: T.mono, fontSize: 9, color: '#fff', zIndex: 2 }}>
            🖥 Screen Share
          </div>
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 10, alignContent: 'start' }}>
        <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 10, position: 'relative', minHeight: 140, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', border: localSpeaking ? '2px solid #00ff88' : '2px solid transparent', transition: 'border-color 0.15s' }}>
          {(room.type === 'video' || cameras.length > 0) && !camOff && (
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
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: muted ? '#ff4757' : '#23d160' }} />
              {(room.type === 'video' || cameras.length > 0) && <span style={{ width: 8, height: 8, borderRadius: '50%', background: camOff ? '#ff4757' : '#23d160' }} />}
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
          </div>
        ))}
      </div>

      <div style={{ borderTop: `1px solid ${T.border}`, padding: '10px 12px', display: 'flex', justifyContent: 'center', gap: 8, flexShrink: 0, overflowX: 'auto', flexWrap: 'wrap' }}>
        <button onClick={onMute} title={muted ? 'Unmute' : 'Mute'}
          style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: muted ? T.danger : 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {muted ? '🔇' : '🎤'}
        </button>
        <button onClick={onCam} title={camOff ? 'Turn on camera' : 'Turn off camera'}
          style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: camOff ? T.danger : 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {camOff ? '📷' : '📸'}
        </button>
        {cameras.length > 1 && !camOff && (
          <button onClick={switchCamera} title="Switch Camera"
            style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: T.mono, fontWeight: 700, flexShrink: 0 }}>
            ↔
          </button>
        )}
        {!camOff && (
          <button onClick={toggleFrontBack} title="Flip Camera"
            style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            🔄
          </button>
        )}
        {canScreenShare && (
          <button onClick={handleScreenShare} title={screenActive ? 'Stop Sharing' : 'Share Screen'}
            style={{ width: 40, height: 40, borderRadius: '50%', border: screenActive ? '2px solid #00ff88' : 'none',
              background: screenActive ? 'color-mix(in srgb, var(--green) 15%, transparent)' : 'rgba(255,255,255,0.1)',
              color: '#fff', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            🖥
          </button>
        )}
        <button onClick={onLeave} title="Leave"
          style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: T.danger, color: '#fff', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          ❌
        </button>
      </div>
    </div>
  )
}
