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

export function streamUrl(): string | null {
  return null
}

export async function listDevices(): Promise<{ kind: string; deviceId: string; label?: string }[]> {
  try {
    return await mediaDevices.enumerateDevices()
  } catch {
    return []
  }
}