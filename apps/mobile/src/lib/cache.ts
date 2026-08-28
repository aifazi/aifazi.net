import AsyncStorage from '@react-native-async-storage/async-storage'

export async function getCached<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(`cache:${key}`)
    if (!raw) return null
    const { data, at } = JSON.parse(raw)
    // 10 min stale
    if (Date.now() - at > 10 * 60 * 1000) return data
    return data
  } catch { return null }
}

export async function setCached(key: string, data: any) {
  try {
    await AsyncStorage.setItem(`cache:${key}`, JSON.stringify({ data, at: Date.now() }))
  } catch {}
}
