import { registerGlobals } from '@livekit/react-native'
import { MediaStream, mediaDevices } from '@livekit/react-native-webrtc'

export { registerGlobals }
export { MediaStream, mediaDevices }

// Called once at module load — sets up react-native-webrtc globals for livekit.
registerGlobals()

export function streamUrl(tracks: any[]): string | null {
  try {
    const s: any = new MediaStream(tracks)
    return typeof s?.toURL === 'function' ? (s.toURL() as string) : null
  } catch {
    return null
  }
}

export async function listDevices(): Promise<{ kind: string; deviceId: string; label?: string }[]> {
  try {
    const list: { kind: string; deviceId: string; label?: string }[] =
      (await mediaDevices.enumerateDevices()) as { kind: string; deviceId: string; label?: string }[]
    return list
  } catch {
    return []
  }
}