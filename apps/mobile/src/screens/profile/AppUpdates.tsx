import { useEffect, useState } from 'react'
import { FONT, SPACE } from '@/src/design'
import { View, Text } from 'react-native'
import { Card, Muted, Btn } from '@/src/components/ui'
import { useTheme } from '@/src/theme'
import { checkForUpdate, downloadAndInstall, openInstallSettings, canRequestPackageInstalls, InstallBlockedError, type UpdateCheck } from '@/src/lib/updates'
import { Loader } from '@/src/components/Loader'

export function AppUpdatesCard() {
  const { theme } = useTheme()
  const c = theme.colors
  const [check, setCheck] = useState<UpdateCheck | null>(null)
  const [busy, setBusy] = useState(false)
  const [checkError, setCheckError] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [needPerm, setNeedPerm] = useState(false)

  const runCheck = async () => {
    setBusy(true); setCheckError(''); setError(''); setNeedPerm(false)
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

  // Android 8+ requires the per-app "Install unknown apps" toggle before the
  // package installer will accept our APK. The OS silently resets this after
  // the app updates itself, so verify up front instead of hoping.
  const ensureInstallPerm = async (): Promise<boolean> => {
    if (await canRequestPackageInstalls()) return true
    setNeedPerm(true)
    try {
      await openInstallSettings()
    } catch {}
    return await canRequestPackageInstalls()
  }

  const retryAfterPerm = async () => {
    const granted = await ensureInstallPerm()
    setNeedPerm(!granted)
    if (granted && !downloading) await install()
  }

  const install = async () => {
    if (!check?.release?.apkUrl) return
    setDownloading(true); setError(''); setProgress(0)
    try {
      if (!(await ensureInstallPerm())) return
      await downloadAndInstall(check.release.apkUrl, (p) => setProgress(Math.round(p.fraction * 100)), check.release.apkSize, check.release.sha256)
    } catch (e) {
      if (e instanceof InstallBlockedError) {
        setError(e.message)
        setNeedPerm(true)
      } else {
        setError(
          e instanceof Error && (e.message.includes('Download incomplete') || e.message.includes('checksum'))
            ? e.message
            : 'Install was blocked. Open settings to allow aifazi to install apps.',
        )
      }
    } finally {
      setDownloading(false)
    }
  }

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
          {downloading ? (
            <View style={{ marginTop: SPACE.lg }}>
              <Text style={{ color: c.accent, fontSize: FONT.md, fontWeight: '700' }}>Downloading… {progress}%</Text>
            </View>
          ) : needPerm ? (
            <>
              {error ? <Muted style={{ color: c.danger, marginTop: SPACE.md }}>{error}</Muted> : null}
              <Muted style={{ marginTop: SPACE.md }}>
                Android must allow aifazi to install apps before the update can continue.
              </Muted>
              <View style={{ marginTop: SPACE.lg }}>
                <Btn title="Turn on install permission" onPress={retryAfterPerm} />
              </View>
            </>
          ) : (
            <View style={{ marginTop: SPACE.lg }}>
              <Btn title="Download & install" onPress={install} />
            </View>
          )}
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