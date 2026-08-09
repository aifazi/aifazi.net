import { useEffect } from 'react'
import { useLocalSearchParams } from 'expo-router'
import * as Linking from 'expo-linking'
import { completeFromAuthRedirect, OAuthProvider, OAUTH_REDIRECT_BASE } from '@/src/lib/oauth'

/**
 * Android deep-link sink. On Android, expo-router can receive the `aifazi://`
 * OAuth redirect as a regular deep link while (or instead of) the
 * `openAuthSessionAsync` promise resolving. This route re-injects the captured
 * URL through the same single-flight parser so the session completes exactly
 * once. On iOS the ASWebAuthenticationSession intercepts before the router, so
 * this screen is only ever a no-op.
 */
export default function OAuthCallbackScreen() {
  const { provider } = useLocalSearchParams<{ provider?: string }>()

  useEffect(() => {
    const prov = (provider || '') as OAuthProvider
    if (!prov || !(['discord', 'github', 'steam'] as OAuthProvider[]).includes(prov)) return
    void Linking.getInitialURL().then((initial) => {
      if (initial?.startsWith(`${OAUTH_REDIRECT_BASE}/${prov}`)) {
        completeFromAuthRedirect(initial, prov)
      }
    })
  }, [provider])

  return null
}