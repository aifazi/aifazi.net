import { useCallback, useEffect, useState } from 'react'
import { View, Text, ScrollView, Linking } from 'react-native'
import * as Notifications from 'expo-notifications'
import { FONT, SPACE } from '@/src/design'
import { Card, Muted, Btn, Toggle, Badge } from '@/src/components/ui'
import { Icon } from '@/src/components/icon'
import { useTheme } from '@/src/theme'
import { useAuth } from '@/src/lib/auth'
import { isPushEnabled, setPushEnabled } from '@/src/lib/push'

type Perm = 'granted' | 'denied' | 'undetermined'

const PERM_LABEL: Record<Perm, string> = {
  granted: 'ALLOWED',
  denied: 'BLOCKED',
  undetermined: 'NOT SET',
}

const PERM_COLOR: Record<Perm, string> = {
  granted: '#00ff88',
  denied: '#ff4d6a',
  undetermined: '#ffcc00',
}

export function NotificationsTab() {
  const { theme } = useTheme()
  const c = theme.colors
  const { user } = useAuth()
  const userId = user?.id ?? user?._id
  const [perm, setPerm] = useState<Perm>('undetermined')
  const [optIn, setOptIn] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const refresh = useCallback(async () => {
    try {
      const p = await Notifications.getPermissionsAsync()
      setPerm(p.granted ? 'granted' : p.status === 'undetermined' ? 'undetermined' : 'denied')
    } catch {
      // Permission query failed - leave last known state.
    }
    if (userId) setOptIn(await isPushEnabled(userId))
  }, [userId])

  useEffect(() => {
    refresh()
  }, [refresh])

  const changePush = async (v: boolean) => {
    if (!userId || busy) return
    setBusy(true)
    setMsg('')
    try {
      const next = await setPushEnabled(userId, v)
      setOptIn(next)
      setMsg(
        next
          ? 'Push notifications enabled for this device.'
          : 'Push notifications disabled for this device.',
      )
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  const fixPermission = async () => {
    try {
      if (perm === 'denied') {
        // The OS will not re-prompt after a denial - deep-link to settings.
        await Linking.openSettings()
        return
      }
      const r = await Notifications.requestPermissionsAsync()
      setPerm(r.granted ? 'granted' : r.status === 'undetermined' ? 'undetermined' : 'denied')
    } catch {
      // Best-effort - the OS prompt can fail in restricted environments.
    }
  }

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: SPACE.xxl }}>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md }}>
          <Icon name="bell" size={16} color={c.accent} />
          <Text style={{ color: c.text, fontSize: FONT.card, fontWeight: '800' }}>Push notifications</Text>
          <View style={{ marginLeft: 'auto' }}>
            <Badge text={PERM_LABEL[perm]} color={PERM_COLOR[perm]} outline />
          </View>
        </View>
        <Muted style={{ marginTop: SPACE.sm }}>
          Receive aifazi notifications on this device - ticket replies, mentions, and account
          activity. Works per device: other signed-in devices are unaffected.
        </Muted>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: SPACE.lg,
            gap: SPACE.md,
          }}
        >
          <Text style={{ color: c.text2, fontSize: FONT.md, fontWeight: '700' }}>
            {optIn ? 'Enabled' : 'Disabled'}
          </Text>
          <Toggle value={optIn} onValueChange={changePush} disabled={!userId || busy} />
        </View>
        {msg ? <Muted style={{ marginTop: SPACE.sm }}>{msg}</Muted> : null}
      </Card>

      <Card style={{ marginTop: SPACE.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md }}>
          <Icon name="shield" size={16} color={c.accent} />
          <Text style={{ color: c.text, fontSize: FONT.card, fontWeight: '800' }}>System permission</Text>
        </View>
        <Muted style={{ marginTop: SPACE.sm }}>
          {perm === 'granted'
            ? 'The OS allows this app to show notifications.'
            : perm === 'denied'
              ? 'Notifications are blocked in system settings. Open settings to re-enable them.'
              : 'The OS has not been asked yet.'}
        </Muted>
        {perm !== 'granted' ? (
          <View style={{ marginTop: SPACE.lg }}>
            <Btn
              title={perm === 'denied' ? 'OPEN SETTINGS' : 'ASK PERMISSION'}
              onPress={fixPermission}
              variant={perm === 'denied' ? 'ghost' : 'primary'}
              size="sm"
            />
          </View>
        ) : null}
      </Card>

      <Muted style={{ marginTop: SPACE.lg }}>
        Tip: push is best-effort - in-app notifications still land in your notifications inbox
        regardless of these settings.
      </Muted>
    </ScrollView>
  )
}
