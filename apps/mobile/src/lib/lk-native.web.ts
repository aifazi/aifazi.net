export function registerGlobals(): void {
  // no-op on web — react-native-webrtc globals are not needed in the browser
}

export const MediaStream: any = undefined

export const mediaDevices: any = {
  async enumerateDevices(): Promise<{ kind: string; deviceId: string; label?: string }[]> {
    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.enumerateDevices) {
      return (await navigator.mediaDevices.enumerateDevices()) as unknown as {
        kind: string
        deviceId: string
        label?: string
      }[]
    }
    return []
  },
}

export function streamUrl(tracks?: any[]): string | null {
  try {
    if (typeof window !== 'undefined' && window.MediaStream && Array.isArray(tracks) && tracks.length) {
      const stream = new window.MediaStream(tracks as MediaStreamTrack[])
      return URL.createObjectURL(stream as unknown as Blob)
    }
  } catch {
    // fall through to null
  }
  return null
}

export async function listDevices(): Promise<{ kind: string; deviceId: string; label?: string }[]> {
  try {
    return await mediaDevices.enumerateDevices()
  } catch {
    return []
  }
}