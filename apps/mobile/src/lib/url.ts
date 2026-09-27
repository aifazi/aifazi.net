import { Linking } from 'react-native'
import * as WebBrowser from 'expo-web-browser'

/**
 * Nextcloud Talk — the replacement for the removed in-house chat/calls.
 * Opened in an in-app browser tab via openTalk() so the user stays in context.
 */
export const TALK_URL = 'https://cloud.aifazi.net/apps/spreed/'

/** Open Nextcloud Talk in an in-app browser tab. Returns true when opened. */
export async function openTalk(): Promise<boolean> {
  return openInApp(TALK_URL)
}

/**
 * Allow only http(s) URLs for Linking.openURL. Blocks file://, tel:, javascript:,
 * custom schemes, and scheme-less strings so server-supplied URLs can never
 * trigger non-web handlers or dangerous protocols.
 */
export function isSafeHttpUrl(url: string | undefined | null): boolean {
  if (!url) return false
  const trimmed = url.trim()
  return /^https?:\/\//i.test(trimmed)
}

/**
 * Opens `url` with the OS handler, but ONLY if it is http(s). Returns true when
 * the URL was opened, false when it was rejected or the open failed (callers
 * can decide whether to surface an error).
 */
export async function safeOpenURL(url: string | undefined | null): Promise<boolean> {
  if (!isSafeHttpUrl(url)) return false
  const target = (url as string).trim()
  try {
    await Linking.openURL(target)
    return true
  } catch {
    return false
  }
}

/**
 * Opens `url` inside an in-app browser tab (Chrome Custom Tabs /
 * SFSafariViewController) when possible, falling back to the OS handler.
 * Keeps the user inside the app instead of jumping to a separate browser.
 * Returns true when the URL was opened.
 */
export async function openInApp(url: string | undefined | null): Promise<boolean> {
  if (!isSafeHttpUrl(url)) return false
  const target = (url as string).trim()
  try {
    await WebBrowser.openBrowserAsync(target)
    return true
  } catch {
    return safeOpenURL(target)
  }
}
