import { useCallback, useEffect, useRef, useState } from 'react'
import { registerGlobals } from '@livekit/react-native'
import { Room, RoomEvent } from 'livekit-client'
import { MediaStream } from 'react-native-webrtc'
import { api } from './api'

// Registers react-native-webrtc globals so livekit-client works on RN.
// Safe to call once at module load (idempotent).
registerGlobals()

// Wrap an RN MediaStream's toURL() so RTCView can render it. Casts to any —
// the react-native-webrtc type surface can be awkward under Expo's TS setup.
function streamUrl(tracks: any[]): string | null {
  try {
    const s: any = new MediaStream(tracks)
    return typeof s?.toURL === 'function' ? (s.toURL() as string) : null
  } catch {
    return null
  }
}

export interface LKInfo {
  room: string
  url: string
  token: string
  encryptionKey: string
  canPublish: boolean
  canScreenShare: boolean
  identity: string
}

export interface LKParticipant {
  identity: string
  name: string
  displayName: string
  isMicOn: boolean
  isCamOn: boolean
  isScreenOn: boolean
  isSpeaking: boolean
  videoUrl: string | null
}

export type LKStatus = 'idle' | 'connecting' | 'connected' | 'error'

export function useLiveKitCall(roomId: string | null) {
  const [status, setStatus] = useState<LKStatus>('idle')
  const [error, setError] = useState('')
  const [info, setInfo] = useState<LKInfo | null>(null)
  const [participants, setParticipants] = useState<LKParticipant[]>([])
  const [muted, setMuted] = useState(false)
  const [camOff, setCamOff] = useState(false)
  const [screenActive, setScreenActive] = useState(false)
  const [screenUrl, setScreenUrl] = useState<string | null>(null)
  const [localVideoUrl, setLocalVideoUrl] = useState<string | null>(null)
  const roomRef = useRef<Room | null>(null)
  const joined = useRef(false)

  const refresh = useCallback(() => {
    const room = roomRef.current
    if (!room) return
    const list: LKParticipant[] = []
    let screen: string | null = null
    room.remoteParticipants.forEach((p) => {
      let video: string | null = null
      let isScreen = false
      p.trackPublications.forEach((pub) => {
        if (!pub.track) return
        if (pub.source === 'screen_share') {
          isScreen = true
          screen = streamUrl([pub.track.mediaStreamTrack])
        } else if (pub.kind === 'video' && !video) {
          video = streamUrl([pub.track.mediaStreamTrack])
        }
      })
      const name = p.name || p.identity
      list.push({
        identity: p.identity,
        name,
        displayName: name,
        isMicOn: p.isMicrophoneEnabled,
        isCamOn: p.isCameraEnabled,
        isScreenOn: isScreen,
        isSpeaking: p.isSpeaking,
        videoUrl: video,
      })
    })
    setParticipants(list)
    setScreenUrl(screen)

    const lp = room.localParticipant
    if (lp) {
      if (!screen) {
        lp.trackPublications.forEach((pub) => {
          if (pub.source === 'screen_share' && pub.track) screen = streamUrl([pub.track.mediaStreamTrack])
        })
      }
      const pub = lp.videoTrackPublications.values().next().value
      setLocalVideoUrl(pub?.track ? streamUrl([pub.track.mediaStreamTrack]) : null)
      setMuted(!lp.isMicrophoneEnabled)
      setCamOff(!lp.isCameraEnabled)
      setScreenActive(lp.isScreenShareEnabled)
    }
  }, [])

  const leave = useCallback(() => {
    joined.current = false
    if (roomRef.current) {
      roomRef.current.disconnect()
      roomRef.current = null
    }
    setParticipants([])
    setScreenUrl(null)
    setLocalVideoUrl(null)
    setStatus('idle')
    setInfo(null)
  }, [])

  useEffect(() => {
    if (!roomId || joined.current) return
    joined.current = true
    let cancelled = false

    const connect = async () => {
      setStatus('connecting')
      setError('')
      try {
        const res = await api.get(`/chat/livekit/token?room_id=${encodeURIComponent(roomId)}`)
        const d = res.data
        const room = new Room({ adaptiveStream: true, dynacast: true })

        if (d.encryption_key) {
          try {
            const bytes = Uint8Array.from(atob(d.encryption_key), (c) => c.charCodeAt(0))
            // E2EE is experimental in livekit-client — best-effort, non-fatal.
            ;(room as any).setE2EEKey?.(bytes)
          } catch {
            // ignore — E2EE optional on mobile
          }
        }

        room.on(RoomEvent.ParticipantConnected, refresh)
        room.on(RoomEvent.ParticipantDisconnected, refresh)
        room.on(RoomEvent.TrackSubscribed, refresh)
        room.on(RoomEvent.TrackUnsubscribed, refresh)
        room.on(RoomEvent.LocalTrackPublished, refresh)
        room.on(RoomEvent.LocalTrackUnpublished, refresh)
        room.on(RoomEvent.ActiveSpeakersChanged, refresh)
        room.on(RoomEvent.Disconnected, () => {
          if (!cancelled) leave()
        })
        room.on(RoomEvent.ConnectionStateChanged, (s) => {
          if (s === 'disconnected' && !cancelled) {
            setStatus('error')
            setError('Call disconnected')
          }
        })

        await room.connect(d.url, d.token, { autoSubscribe: true })
        if (cancelled) {
          room.disconnect()
          return
        }

        roomRef.current = room
        setInfo(d)
        setStatus('connected')
        try {
          await room.localParticipant.setMicrophoneEnabled(true)
        } catch {}
        refresh()
      } catch (e: any) {
        if (!cancelled) {
          setStatus('error')
          setError(e?.response?.data?.detail || e?.message || 'Could not join the call')
        }
      }
    }

    connect()
    return () => {
      cancelled = true
      if (roomRef.current) {
        roomRef.current.disconnect()
        roomRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId])

  const toggleMute = useCallback(async () => {
    const room = roomRef.current
    if (!room) return
    const on = !room.localParticipant.isMicrophoneEnabled
    await room.localParticipant.setMicrophoneEnabled(on)
    setMuted(!on)
  }, [])

  const toggleCam = useCallback(async () => {
    const room = roomRef.current
    if (!room) return
    const on = !room.localParticipant.isCameraEnabled
    await room.localParticipant.setCameraEnabled(on)
    setCamOff(!on)
  }, [])

  const toggleScreen = useCallback(async () => {
    const room = roomRef.current
    if (!room) return
    const on = !room.localParticipant.isScreenShareEnabled
    await room.localParticipant.setScreenShareEnabled(on)
    setScreenActive(on)
  }, [])

  return {
    status,
    error,
    info,
    participants,
    muted,
    camOff,
    screenActive,
    screenUrl,
    localVideoUrl,
    canScreenShare: !!info?.canScreenShare,
    toggleMute,
    toggleCam,
    toggleScreen,
    leave,
  }
}
