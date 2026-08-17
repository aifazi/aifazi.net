'use client'
// DMCallBar — 1:1 LiveKit voice/video call bar for web DM threads. Mirrors the
// mobile /call screen: mints a LiveKit token from the backend, joins the
// `dm-{threadId}` room, and gives a compact mute + hang-up control. Works with
// the mobile app's DM call (same token endpoint + room naming).
import { useState, useEffect, useRef } from 'react'
import { Room } from 'livekit-client'
import { T } from '../chat-constants'
import { dmLiveKitTokenPath } from '@fazi/shared'
import api from '@/lib/api'

export function DMCallBar({ threadId, peer, me, onEnd }) {
  const [status, setStatus] = useState('connecting') // connecting | connected | error
  const [error, setError] = useState('')
  const [muted, setMuted] = useState(false)
  const [participants, setParticipants] = useState([])
  const [duration, setDuration] = useState(0)
  const roomRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    const connect = async () => {
      setStatus('connecting'); setError('')
      try {
        const res = await api.get(dmLiveKitTokenPath(threadId))
        const { token, url, encryption_key } = res.data || {}
        if (!token || !url) { setStatus('error'); setError('LiveKit is not configured on the server'); return }

        const room = new Room({ adaptiveStream: true, dynacast: true })
        if (encryption_key) {
          try {
            const bytes = Uint8Array.from(atob(encryption_key), (ch) => ch.charCodeAt(0))
            room.setE2EEKey?.(bytes)
          } catch { /* E2EE best-effort */ }
        }

        const refresh = () => {
          const list = []
          room.remoteParticipants.forEach((p) => list.push({
            identity: p.identity,
            name: p.name || p.identity,
            isMicOn: p.isMicrophoneEnabled,
            isCamOn: p.isCameraEnabled,
            isSpeaking: p.isSpeaking,
          }))
          setParticipants(list)
        }

        room.on('participantConnected', refresh)
        room.on('participantDisconnected', refresh)
        room.on('trackSubscribed', refresh)
        room.on('trackUnsubscribed', refresh)
        room.on('activeSpeakersChanged', refresh)
        room.on('disconnected', () => {
          if (!cancelled) { setStatus('error'); setError('Call ended') }
        })

        await room.connect(url, token, { autoSubscribe: true })
        if (cancelled) { try { room.disconnect() } catch {} return }

        roomRef.current = room
        setStatus('connected')
        try { await room.localParticipant.setMicrophoneEnabled(true) } catch {}
        refresh()
        const t0 = Date.now()
        const iv = setInterval(() => setDuration(Math.round((Date.now() - t0) / 1000)), 1000)
        room.on('disconnected', () => clearInterval(iv))
      } catch (e) {
        if (!cancelled) {
          setStatus('error')
          setError(e?.response?.data?.detail || e?.message || 'Could not join the call')
        }
      }
    }
    connect()
    return () => { cancelled = true; if (roomRef.current) { try { roomRef.current.disconnect() } catch {} } }
  }, [threadId])

  const toggleMute = async () => {
    const room = roomRef.current
    if (!room) return
    const on = !room.localParticipant.isMicrophoneEnabled
    try { await room.localParticipant.setMicrophoneEnabled(on) } catch {}
    setMuted(!on)
  }

  const end = () => {
    if (roomRef.current) { try { roomRef.current.disconnect() } catch {} roomRef.current = null }
    onEnd()
  }

  const fmtDur = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  return (
    <div style={{
      flexShrink: 0, padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 10,
      borderBottom: `1px solid ${T.border}`, background: 'color-mix(in srgb, var(--green) 7%, transparent)',
    }}>
      <div style={{
        width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
        background: status === 'connected' ? '#23d160' : status === 'connecting' ? T.warn : T.danger,
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>
          {status === 'connected' ? `On call with ${peer}` : status === 'connecting' ? `Ringing ${peer}…` : 'Call ended'}
        </div>
        <div style={{ fontSize: 10, color: T.muted, fontFamily: T.mono }}>
          {status === 'connected'
            ? `${participants.length + 1} participant${participants.length ? 's' : ''} · ${fmtDur(duration)}`
            : status === 'error' ? error : 'connecting'}
        </div>
      </div>
      <button onClick={toggleMute} disabled={status !== 'connected'}
        style={{
          padding: '5px 12px', border: `1px solid ${muted ? T.danger : T.border}`, borderRadius: 8, cursor: 'pointer',
          background: muted ? 'rgba(255,71,87,0.15)' : 'transparent', color: muted ? T.danger : T.text, fontSize: 12, fontFamily: T.mono,
        }}>
        {muted ? 'UNMUTE' : 'MUTE'}
      </button>
      <button onClick={end}
        style={{ padding: '5px 14px', border: 'none', borderRadius: 8, cursor: 'pointer', background: T.danger, color: '#fff', fontSize: 12, fontWeight: 700, fontFamily: T.mono }}>
        END
      </button>
    </div>
  )
}