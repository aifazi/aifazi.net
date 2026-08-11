import { useEffect, useState } from 'react'
import { FONT, SPACE } from '@/src/design'
import { View, Text, ScrollView } from 'react-native'
import { Image as ExpoImage } from 'expo-image'
import { Card, Muted, Btn, Field } from '@/src/components/ui'
import { Icon } from '@/src/components/icon'
import { Loader } from '@/src/components/Loader'
import { useTheme } from '@/src/theme'
import { useAuth } from '@/src/lib/auth'
import { useOverlay } from '@/src/components/overlay'
import { fmtWhen } from './helpers'

export function SecurityTab() {
  const { theme } = useTheme()
  const c = theme.colors
  const {
    changePassword, deleteAccount, listSessions, revokeSession, revokeAllSessions,
    get2FAStatus, setup2FA, confirm2FA, disable2FA, logout,
  } = useAuth()
  const { confirm } = useOverlay()
  const [cur, setCur] = useState('')
  const [next, setNext] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  // 2FA
  const [twoEnabled, setTwoEnabled] = useState<boolean | null>(null)
  const [twoSecret, setTwoSecret] = useState<{ secret: string; otpauth_uri: string; qr_image?: string } | null>(null)
  const [twoCode, setTwoCode] = useState('')
  const [twoPw, setTwoPw] = useState('')

  // sessions
  const [sessions, setSessions] = useState<any[]>([])
  const [deletePw, setDeletePw] = useState('')

  useEffect(() => {
    get2FAStatus().then(setTwoEnabled).catch(() => setTwoEnabled(false))
    listSessions().then(setSessions).catch(() => setSessions([]))
  }, [get2FAStatus, listSessions])

  const changePw = async () => {
    setMsg(''); setBusy(true)
    try {
      await changePassword(cur, next)
      setCur(''); setNext('')
      setMsg('Password updated.')
    } catch (e: any) {
      setMsg(e?.response?.data?.detail || 'Could not change password.')
    } finally { setBusy(false) }
  }

  const enable2fa = async () => {
    setMsg('')
    try {
      const s = await setup2FA()
      setTwoSecret(s)
    } catch (e: any) {
      setMsg(e?.response?.data?.detail || 'Could not start 2FA setup.')
    }
  }

  const submit2faCode = async () => {
    setMsg(''); setBusy(true)
    try {
      await confirm2FA(twoCode)
      setTwoCode(''); setTwoSecret(null); setTwoEnabled(true)
      setMsg('Two-factor authentication enabled.')
    } catch (e: any) {
      setMsg(e?.response?.data?.detail || 'Invalid code.')
    } finally { setBusy(false) }
  }

  const disable2fa = async () => {
    setMsg(''); setBusy(true)
    try {
      await disable2FA(twoPw, twoCode)
      setTwoPw(''); setTwoCode(''); setTwoEnabled(false)
      setMsg('Two-factor authentication disabled.')
    } catch (e: any) {
      setMsg(e?.response?.data?.detail || 'Could not disable 2FA.')
    } finally { setBusy(false) }
  }

  const onDelete = async () => {
    setMsg(''); setBusy(true)
    try {
      await deleteAccount(deletePw)
      await logout()
    } catch (e: any) {
      setMsg(e?.response?.data?.detail || 'Could not delete account.')
    } finally { setBusy(false) }
  }

  const del = async () => {
    const ok = await confirm({ title: 'Delete account', message: 'This permanently deletes your account and all data. This cannot be undone.', confirmText: 'Delete account', destructive: true })
    if (!ok) return
    onDelete()
  }

  return (
    <ScrollView keyboardShouldPersistTaps="handled">
      <Card title="Change Password">
        <Field label="Current password" value={cur} onChangeText={setCur} secure placeholder="••••••••" />
        <Field label="New password" value={next} onChangeText={setNext} secure placeholder="At least 8 characters" />
        <Btn title={busy ? 'Updating…' : 'Update Password'} onPress={changePw} disabled={busy || next.length < 8} />
      </Card>

      <Card title="Two-Factor Authentication">
        {twoEnabled === null ? (
          <Loader size={44} />
        ) : twoEnabled ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
              <Icon name="check" size={14} color={c.accent} />
              <Muted>Two-factor authentication is enabled.</Muted>
            </View>
            <Field label="Password" value={twoPw} onChangeText={setTwoPw} secure placeholder="Your password" />
            <Field label="2FA code" value={twoCode} onChangeText={setTwoCode} placeholder="6-digit code" />
            <Btn title={busy ? 'Disabling…' : 'Disable 2FA'} variant="danger" onPress={disable2fa} disabled={busy || !twoPw} />
          </>
        ) : twoSecret ? (
          <>
            <Muted>Scan the QR code with your authenticator app, then confirm.</Muted>
            {twoSecret.qr_image ? (
              <ExpoImage source={{ uri: twoSecret.qr_image }} style={{ width: 180, height: 180, alignSelf: 'center', marginVertical: SPACE.lg }} contentFit="contain" />
            ) : (
              <Text selectable style={{ color: c.text, fontSize: FONT.sm, marginVertical: SPACE.md }}>{twoSecret.otpauth_uri}</Text>
            )}
            <Text selectable style={{ color: c.muted, fontSize: FONT.sm, textAlign: 'center', marginBottom: SPACE.md }}>{twoSecret.secret}</Text>
            <Field label="6-digit code" value={twoCode} onChangeText={setTwoCode} placeholder="123456" />
            <Btn title={busy ? 'Confirming…' : 'Confirm & Enable'} onPress={submit2faCode} disabled={busy || twoCode.trim().length !== 6} />
          </>
        ) : (
          <>
            <Muted>Protect your account with an authenticator app.</Muted>
            <View style={{ marginTop: SPACE.lg }}>
              <Btn title="Enable 2FA" onPress={enable2fa} />
            </View>
          </>
        )}
      </Card>

      <Card title="Active Sessions">
        {sessions.length === 0 ? (
          <Muted>No active sessions.</Muted>
        ) : (
          sessions.map((s) => (
            <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md, paddingVertical: SPACE.md, borderBottomWidth: 1, borderBottomColor: c.border }}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.xs }}>
                  <Icon name={s.current ? 'globe' : 'info'} size={14} color={c.text2} />
                  <Text style={{ color: c.text, fontSize: FONT.md, fontWeight: '600' }} numberOfLines={1}>
                    {s.current ? 'This device' : 'Device'}
                  </Text>
                </View>
                <Muted style={{ fontSize: FONT.micro }} numberOfLines={1}>{s.ip} · {s.user_agent || ''}</Muted>
                <Muted style={{ fontSize: FONT.micro }}>Last active {fmtWhen(s.last_active)}</Muted>
              </View>
              {!s.current ? (
                <Btn title="Revoke" variant="ghost" style={{ paddingVertical: SPACE.sm, paddingHorizontal: SPACE.xl }} onPress={() => revokeSession(s.id).then(() => listSessions().then(setSessions)).catch(() => {})} />
              ) : null}
            </View>
          ))
        )}
        {sessions.length > 0 && (
          <View style={{ marginTop: SPACE.lg }}>
            <Btn title="Revoke all other sessions" variant="ghost" onPress={() => { revokeAllSessions().then(() => listSessions().then(setSessions)).catch(() => {}) }} />
          </View>
        )}
      </Card>

      <Card title="Danger Zone">
        <Muted style={{ marginBottom: SPACE.lg }}>Permanently delete your account and all data.</Muted>
        <Field label="Password" value={deletePw} onChangeText={setDeletePw} secure placeholder="Your password" />
        <Btn title={busy ? 'Deleting…' : 'Delete account'} variant="danger" onPress={del} disabled={busy || !deletePw} />
      </Card>

      {msg ? <Muted style={{ textAlign: 'center', marginTop: SPACE.xs }}>{msg}</Muted> : null}
    </ScrollView>
  )
}