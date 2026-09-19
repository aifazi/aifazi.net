import { useEffect, useState } from 'react'
import { SPACE } from '@/src/design'
import { View } from 'react-native'
import { Card, Muted, Btn } from '@/src/components/ui'
import { useTheme } from '@/src/theme'
import { checkForUpdate, type UpdateCheck } from '@/src/lib/updates'
import { Loader } from '@/src/components/Loader'

export function AppUpdatesCard() {
  const { theme } = useTheme()
  const c = theme.colors
  const [check, setCheck] = useState<UpdateCheck | null>(null)
  const [busy, setBusy] = useState(false)
  const [checkError, setCheckError] = useState('')

  const runCheck = async () => {
    setBusy(true); setCheckError('')
    try {
      setCheck(await checkForUpdate())
    } catch {
      setCheck(null)
      setCheckError('Could not check for updates.')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => { runCheck() }, [])

  // APK sideload is disabled (see src/lib/updates.ts): updates ship via EAS
  // Updates, applied automatically on launch. This card is informational only —
  // it reports the latest release state and never downloads or installs.

  return (
    <Card title="App updates">
      {busy ? (
        <Loader compact />
      ) : checkError ? (
        <>
          <Muted style={{ color: c.danger }}>{checkError}</Muted>
          <View style={{ marginTop: SPACE.lg }}>
            <Btn title="Try again" variant="ghost" onPress={runCheck} />
          </View>
        </>
      ) : !check ? (
        <Muted>No update information.</Muted>
      ) : check.state === 'building' ? (
        <>
          <Muted>Version {check.latest} is being built — it usually appears within about 15 minutes. Check again shortly to install it.</Muted>
          <View style={{ marginTop: SPACE.lg }}>
            <Btn title="Check again" variant="ghost" onPress={runCheck} />
          </View>
        </>
      ) : check.state === 'none' ? (
        <>
          <Muted>No update release yet.</Muted>
          <View style={{ marginTop: SPACE.lg }}>
            <Btn title="Check again" variant="ghost" onPress={runCheck} />
          </View>
        </>
      ) : check.updateAvailable ? (
        <>
          <Muted>Version {check.latest} is available (you have {check.installed}).</Muted>
          {check.release?.notes ? <Muted style={{ marginTop: SPACE.xs }} numberOfLines={2}>{check.release.notes}</Muted> : null}
          <Muted style={{ marginTop: SPACE.md }}>
            Updates arrive automatically via EAS Updates — restart the app to apply the latest version.
          </Muted>
          <View style={{ marginTop: SPACE.lg }}>
            <Btn title="Check again" variant="ghost" onPress={runCheck} />
          </View>
        </>
      ) : (
        <>
          <Muted>You&apos;re on the latest version ({check.installed}).</Muted>
          <View style={{ marginTop: SPACE.lg }}>
            <Btn title="Check again" variant="ghost" onPress={runCheck} disabled={busy} />
          </View>
        </>
      )}
    </Card>
  )
}