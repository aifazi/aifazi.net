/**
 * src/lib/biometricLock.ts — app-level biometric gate (roadmap C7).
 *
 * Gates a whole screen (used by the VPN dashboard): when device biometrics
 * are available AND enrolled, the screen starts locked and shows a lock
 * view until `unlock()` succeeds. Users without biometrics are never
 * blocked (state 'disabled').
 *
 * Re-lock rule: the screen re-locks when the app returns to the foreground
 * after being backgrounded for more than `relockAfterMs` (default 60s).
 * In-app navigation back and forth does NOT re-lock (no nag loop).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import * as LocalAuthentication from 'expo-local-authentication'

export type LockState = 'checking' | 'disabled' | 'locked' | 'unlocked'

export async function biometricAvailable(): Promise<boolean> {
  try {
    const [hw, enrolled] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
    ])
    return hw && enrolled
  } catch {
    return false
  }
}

export async function biometricUnlock(promptMessage?: string): Promise<boolean> {
  try {
    const res = await LocalAuthentication.authenticateAsync({
      promptMessage: promptMessage ?? 'Unlock this screen',
    })
    return res.success
  } catch {
    return false
  }
}

export interface BiometricLock {
  state: LockState
  /** True only when the gate applies AND the user has not unlocked yet. */
  locked: boolean
  unlock: () => Promise<boolean>
}

export function useBiometricLock(relockAfterMs: number = 60_000): BiometricLock {
  const [state, setState] = useState<LockState>('checking')
  const bgSinceRef = useRef<number | null>(null)
  const unlockedRef = useRef(false)

  useEffect(() => {
    let live = true
    biometricAvailable().then((available) => {
      if (!live) return
      unlockedRef.current = false
      setState(available ? 'locked' : 'disabled')
    })
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'background') {
        bgSinceRef.current = Date.now()
      } else if (s === 'active' && unlockedRef.current) {
        const since = bgSinceRef.current
        bgSinceRef.current = null
        if (since !== null && Date.now() - since > relockAfterMs) {
          unlockedRef.current = false
          setState('locked')
        }
      }
    })
    return () => {
      live = false
      sub.remove()
    }
  }, [relockAfterMs])

  const unlock = useCallback(async (): Promise<boolean> => {
    const ok = await biometricUnlock()
    if (ok) {
      unlockedRef.current = true
      setState('unlocked')
    }
    return ok
  }, [])

  return {
    state,
    locked: state === 'locked',
    unlock,
  }
}
