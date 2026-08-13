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
    get2FAStatus, setup2FA, confirm2FA, disable2FA, regenerateRecoveryCodes, logout,
  } = useAuth()
  const { confirm } = useOverlay()
  const [cur, setCur] = useState('')
  const [next, setNext] = useState('')
  const [twoChangeCode, setTwoChangeCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  // 2FA
  const [twoEnabled, setTwoEnabled] = useState<boolean | null>(null)
  const [twoSecret, setTwoSecret] = useState<{ secret: string; otpauth_uri: string; qr_image?: string } | null>(null)
  const [twoCode, setTwoCode] = useState('')
  const [twoPw, setTwoPw] = useState('')
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null)
  const [regenPw, setRegenPw] = useState('')
  const [regenCode, setRegenCode] = useState('')

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
      await changePassword(cur, next, twoEnabled ? twoChangeCode.trim() : '')
      setCur(''); setNext(''); setTwoChangeCode('')
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
      const codes = await confirm2FA(twoCode)
      setTwoCode(''); setTwoSecret(null); setTwoEnabled(true)
      if (codes.length) setRecoveryCodes(codes)
      else setMsg('Two-factor authentication enabled.')
    } catch (e: any) {
      setMsg(e?.response?.data?.detail || 'Invalid code.')
    } finally { setBusy(false) }
  }

  const disable2fa = async () => {
    setMsg(''); setBusy(true)
    try {
      await disable2FA(twoPw, twoCode)
      setTwoPw(''); setTwoCode(''); setTwoEnabled(false); setRecoveryCodes(null)
      setMsg('Two-factor authentication disabled.')
    } catch (e: any) {
      setMsg(e?.response?.data?.detail || 'Could not disable 2FA.')
    } finally { setBusy(false) }
  }

  const regenerate = async () => {
    setMsg(''); setBusy(true)
    try {
      const codes = await regenerateRecoveryCodes(regenPw, regenCode)
      setRegenPw(''); setRegenCode(''); setRecoveryCodes(codes)
    } catch (e: any) {
      setMsg(e?.response?.data?.detail || 'Could not regenerate recovery codes.')
    } finally { setBusy(false) }
  }

  const isCodeValid = (v: string) => {
    const clean = v.replace(/[\s-]/g, '')
    return /^\d{6}$/.test(clean) || /^[A-Za-z2-7]{12}$/.test(clean)
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
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: SPACE.colossal + SPACE.huge }}>
      <Card title="Change Password">
        <Field label="Current password" value={cur} onChangeText={setCur} secure placeholder="••••••••" />
        <Field label="New password" value={next} onChangeText={setNext} secure placeholder="At least 8 characters" />
        {twoEnabled === true && (
          <Field label="2FA code" value={twoChangeCode} onChangeText={setTwoChangeCode} placeholder="6-digit code or recovery code" autoCapitalize="characters" />
        )}
        <Btn title={busy ? 'Updating…' : 'Update Password'} onPress={changePw} disabled={busy || next.length < 8 || (twoEnabled === true && !isCodeValid(twoChangeCode))} />
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

            {recoveryCodes && recoveryCodes.length > 0 && (
              <View style={{ marginTop: SPACE.md, padding: SPACE.md, borderWidth: 1, borderColor: c.border, borderRadius: 8 }}>
                <Text style={{ color: c.accent2, fontSize: FONT.micro, fontWeight: '700', letterSpacing: 1, marginBottom: SPACE.xs }}>BACKUP RECOVERY CODES — SAVE THESE NOW</Text>
                <Muted style={{ marginBottom: SPACE.md }}>Each code works once to sign in if you lose your authenticator. They won't be shown again.</Muted>
                {recoveryCodes.map((code) => (
                  <Text key={code} selectable style={{ color: c.text, fontFamily: 'monospace', letterSpacing: 2, paddingVertical: 2 }}>{code}</Text>
                ))}
                <Btn title="I've saved these" variant="ghost" onPress={() => setRecoveryCodes(null)} />
              </View>
            )}

            <Field label="Password" value={twoPw} onChangeText={setTwoPw} secure placeholder="Your password" />
            <Field label="2FA code" value={twoCode} onChangeText={setTwoCode} placeholder="6-digit or recovery code" autoCapitalize="characters" />
            <Btn title={busy ? 'Disabling…' : 'Disable 2FA'} variant="danger" onPress={disable2fa} disabled={busy || !twoPw || !isCodeValid(twoCode)} />

            <View style={{ marginTop: SPACE.lg, paddingTop: SPACE.lg, borderTopWidth: 1, borderTopColor: c.border }}>
              <Text style={{ color: c.text, fontSize: FONT.sm, fontWeight: '700', marginBottom: SPACE.xs }}>Recovery codes</Text>
              <Muted style={{ marginBottom: SPACE.md }}>Generate a new set. Existing codes are invalidated.</Muted>
              <Field label="Password" value={regenPw} onChangeText={setRegenPw} secure placeholder="Your password" />
              <Field label="Authenticator / recovery code" value={regenCode} onChangeText={setRegenCode} placeholder="000000  ·  XXXX-XXXX-XXXX" autoCapitalize="characters" />
              <Btn title={busy ? 'Generating…' : 'Generate new recovery codes'} onPress={regenerate} disabled={busy || !regenPw || !isCodeValid(regenCode)} />
            </View>
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
            <Field label="6-digit code" value={twoCode} onChangeText={setTwoCode} placeholder="123456" keyboardType="number-pad" maxLength={6} />
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