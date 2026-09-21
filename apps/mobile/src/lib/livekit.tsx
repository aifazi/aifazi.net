/**
 * apps/mobile/src/lib/livekit.tsx
 *
 * STUB: LiveKit has been removed. Voice/video calls now use Nextcloud Talk.
 * This module exports the same interface as before so existing imports don't
 * break at build time, but all hooks return "not available" states.
 * TODO: Remove all consumers and delete this file.
 */

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
  id: string
  name: string
  label: string
  displayName: string
  isMicOn: boolean
  isCamOn: boolean
  isScreenOn: boolean
  isSpeaking: boolean
  videoUrl: string | null
}

export interface LKDevice {
  id: string
  label: string
}

export type LKStatus = 'idle' | 'connecting' | 'connected' | 'error'

export interface LiveKitCallOptions {
  dmThreadId?: string | null
  video?: boolean
}

export function useLiveKitCall(_roomId: string | null, _opts?: LiveKitCallOptions) {
  return {
    status: 'idle' as LKStatus,
    error: 'LiveKit has been removed. Use Nextcloud Talk for voice/video calls.',
    info: null,
    participants: [] as LKParticipant[],
    muted: true,
    camOff: true,
    screenActive: false,
    screenUrl: null,
    localVideoUrl: null,
    canScreenShare: false,
    setMic: async (_on?: boolean) => {},
    setMutedOnly: () => {},
    toggleMute: async () => {},
    toggleCam: async () => {},
    toggleScreen: async () => {},
    listDevices: async (_kind?: string): Promise<LKDevice[]> => [],
    switchMicDevice: async (_id?: string) => {},
    switchSpeakerDevice: async (_id?: string) => {},
    muteParticipant: async (_identity?: string) => {},
    kickParticipant: async (_identity?: string) => {},
    leave: () => {},
  }
}
