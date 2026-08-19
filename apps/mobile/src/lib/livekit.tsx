import { useCallback, useEffect, useRef, useState } from 'react'
import { Room, RoomEvent } from 'livekit-client'
import { RNKeyProvider, RNE2EEManager } from '@livekit/react-native'
import { registerGlobals, mediaDevices, streamUrl } from './lk-native'
import { api } from './api'
import { dmLiveKitTokenPath, roomLiveKitTokenPath, apiErrorMessage } from '@fazi/shared'

// Registers react-native-webrtc globals so livekit-client works on RN
// (native); no-op on web. Safe to call once at module load (idempotent).
registerGlobals()

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

export interface LiveKitCallOptions {
  dmThreadId?: string | null
  video?: boolean
}

export function useLiveKitCall(roomId: string | null, opts?: LiveKitCallOptions) {
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
  const isDm = !!opts?.dmThreadId

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
        const tokenPath = isDm
          ? dmLiveKitTokenPath((opts?.dmThreadId as string) || '')
          : roomLiveKitTokenPath((roomId as string) || '')
        const res = await api.get(tokenPath)
        const d = res.data

        // Native E2EE (react-native): RNKeyProvider + RNE2EEManager must be
        // wired into the Room via the `e2ee` option BEFORE connecting.
        let e2eeManager: RNE2EEManager | null = null
        if (d.encryption_key) {
          try {
            const bytes = Uint8Array.from(atob(d.encryption_key), (c) => c.charCodeAt(0))
            const keyProvider = new RNKeyProvider({ sharedKey: true })
            await keyProvider.setSharedKey(bytes)
            e2eeManager = new RNE2EEManager(keyProvider, false)
          } catch (e) {
            // ignore — E2EE optional on mobile
            e2eeManager = null
          }
        }

        const room = new Room({
          adaptiveStream: false,
          dynacast: false,
          ...(e2eeManager ? { e2ee: { e2eeManager } } : {}),
        })

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
        if (opts?.video) {
          try {
            await room.localParticipant.setCameraEnabled(true)
            setCamOff(false)
          } catch {}
        }
        refresh()
      } catch (e: any) {
        if (!cancelled) {
          setStatus('error')
          setError(apiErrorMessage(e) || 'Could not join the call')
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

  const setMic = useCallback(async (on: boolean) => {
    const room = roomRef.current
    if (!room) return
    try {
      await room.localParticipant.setMicrophoneEnabled(on)
    } finally {
      setMuted(!on)
    }
  }, [])

  const toggleMute = useCallback(async () => {
    const room = roomRef.current
    if (!room) return
    await setMic(!room.localParticipant.isMicrophoneEnabled)
  }, [setMic])

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

  const setMutedOnly = useCallback((on: boolean) => setMuted(!on), [])

  const listDevices = useCallback(async (kind: 'audioinput' | 'audiooutput' | 'videoinput') => {
    try {
      const list: { kind: string; deviceId: string; label?: string }[] =
        (await mediaDevices.enumerateDevices()) as { kind: string; deviceId: string; label?: string }[]
      return list.filter((d) => d.kind === kind).map((d) => ({ id: d.deviceId, label: d.label || kind }))
    } catch {
      return []
    }
  }, [])

  const switchMicDevice = useCallback(async (deviceId: string) => {
    const room = roomRef.current
    if (!room) return
    try {
      await room.switchActiveDevice('audioinput', deviceId)
    } catch {}
  }, [])

  const switchSpeakerDevice = useCallback(async (deviceId: string) => {
    const room = roomRef.current
    if (!room) return
    try {
      await room.switchActiveDevice('audiooutput', deviceId)
    } catch {}
  }, [])

  const muteParticipant = useCallback(
    async (identity: string) => {
      if (!info) return
      await api.post('/chat/livekit/admin/mute', { room_id: info.room, identity })
      refresh()
    },
    [info, refresh],
  )

  const kickParticipant = useCallback(
    async (identity: string) => {
      if (!info) return
      await api.post('/chat/livekit/admin/kick', { room_id: info.room, identity })
      refresh()
    },
    [info, refresh],
  )

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
    setMic,
    setMutedOnly,
    toggleMute,
    toggleCam,
    toggleScreen,
    listDevices,
    switchMicDevice,
    switchSpeakerDevice,
    muteParticipant,
    kickParticipant,
    leave,
  }
}
