import { useEffect, useRef } from 'react'
import { FONT, SPACE } from '@/src/design'
import { ActivityIndicator, View, Text } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import * as Linking from 'expo-linking'
import { completeFromAuthRedirect, OAuthProvider, OAUTH_REDIRECT_BASE } from '@/src/lib/oauth'
import { useTheme } from '@/src/theme'

const VALID_PROVIDERS: OAuthProvider[] = ['discord', 'github', 'steam']

/**
 * Android deep-link sink. On Android, expo-router can receive the `aifazi://`
 * OAuth redirect as a regular deep link while (or instead of) the
 * `openAuthSessionAsync` promise resolving. This route re-injects the captured
 * URL through the same single-flight parser so the session completes exactly
 * once. On iOS the ASWebAuthenticationSession intercepts before the router, so
 * this screen is only ever a no-op.
 *
 * Two delivery paths are handled:
 *  - cold start: the app was launched by the deep link  -> getInitialURL()
 *  - warm start: the app was already running in the background while the
 *    browser sat on top, so the redirect arrives as a `url` *event*, not as an
 *    initial URL (this was the source of the "black screen" bug — the screen
 *    never received the token and rendered nothing).
 */
export default function OAuthCallbackScreen() {
  const { provider } = useLocalSearchParams<{ provider?: string }>()
  const router = useRouter()
  const { theme } = useTheme()
  const c = theme.colors
  const settled = useRef(false)
  const prov = (provider || '') as OAuthProvider
  const valid = VALID_PROVIDERS.includes(prov)

  useEffect(() => {
    // Pop back to the screen that opened the auth flow (login/register) once the
    // redirect is handled — or if nothing matched. Never strand the user on a
    // blank/loading screen.
    const leave = () => {
      if (settled.current) return
      settled.current = true
      if (router.canGoBack()) router.back()
      else router.replace('/(tabs)')
    }

    if (!valid) {
      leave()
      return
    }

    const attempt = (raw: string | null | undefined) => {
      if (settled.current || !raw) return
      if (raw.startsWith(`${OAUTH_REDIRECT_BASE}/${prov}`)) {
        completeFromAuthRedirect(raw, prov)
      }
    }

    // Warm-start path: the redirect fires as a URL event while the app is alive.
    const sub = Linking.addEventListener('url', ({ url }) => attempt(url))

    // Cold-start path: the deep link launched the app.
    void Linking.getInitialURL().then((initial) => {
      attempt(initial)
      // Give the single-flight resolver a beat, then leave the screen so we
      // never sit on a loading state. Safe because completeFromAuthRedirect
      // only resolves the exact pending provider flow.
      setTimeout(leave, 600)
    })

    // Absolute fallback: if neither path delivered a URL, dismiss anyway.
    const safety = setTimeout(leave, 4000)
    return () => {
      sub.remove()
      clearTimeout(safety)
    }
  }, [prov, valid, router])

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg }}>
      <ActivityIndicator size="large" color={c.accent} />
      <Text style={{ color: c.muted, fontSize: FONT.body, marginTop: SPACE.xl, fontFamily: theme.mono ? 'monospace' : undefined }}>
        Completing sign-in…
      </Text>
    </View>
  )
}
