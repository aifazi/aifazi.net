import { useEffect, useState, useCallback } from 'react'
import { FONT, SPACE } from '@/src/design'
import { View, Text, TouchableOpacity, FlatList } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Card, Muted, Btn } from '@/src/components/ui'
import { Icon } from '@/src/components/icon'
import { useTheme } from '@/src/theme'
import { useAuth } from '@/src/lib/auth'
import { api } from '@/src/lib/api'
import { useOverlay } from '@/src/components/overlay'
import { Loader } from '@/src/components/Loader'

interface Mute {
  id: string
  username: string
  room_id: string
  room_name: string
  room_emoji?: string
  muted_by?: string
  expires_at?: string
  created_at?: string
}

export default function ChatAdminMutesScreen() {
  const { theme } = useTheme()
  const c = theme.colors
  const router = useRouter()
  const { user } = useAuth()
  const [mutes, setMutes] = useState<Mute[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const { confirm } = useOverlay()

  const isStaff = user?.role === 'admin' || user?.role === 'moderator'

  const load = useCallback(() => {
    api
      .get('/chat/admin/mutes')
      .then((r) => setMutes((r.data ?? []) as Mute[]))
      .catch((e) => setErr(e?.response?.data?.detail || 'Could not load mutes'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (isStaff) load()
  }, [isStaff, load])

  const lift = async (m: Mute) => {
    const ok = await confirm({ title: 'Lift mute', message: `Unmute ${m.username} in ${m.room_name || 'this channel'}?`, confirmText: 'Unmute', destructive: true })
    if (!ok) return
    try {
      await api.delete(`/chat/rooms/${m.room_id}/mute/${encodeURIComponent(m.username)}`)
      setMutes((prev) => prev.filter((x) => x.id !== m.id))
    } catch (e: any) {
      setErr(e?.response?.data?.detail || 'Could not unmute')
    }
  }

  if (!isStaff) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top', 'bottom']}>
        <Muted style={{ textAlign: 'center', marginTop: SPACE.colossal }}>Staff only.</Muted>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top', 'bottom']}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: SPACE.lg,
          paddingHorizontal: SPACE.xl,
          paddingVertical: SPACE.lg,
          borderBottomWidth: 1,
          borderBottomColor: c.border,
        }}
      >
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back" hitSlop={10}>
          <Icon name="back" size={22} color={c.text} />
        </TouchableOpacity>
        <Text style={{ color: c.text, fontSize: FONT.card, fontWeight: '800', flex: 1 }}>Mutes</Text>
        <Btn title="Refresh" onPress={() => { setLoading(true); load() }} style={{ paddingVertical: 7, paddingHorizontal: SPACE.xl }} />
      </View>

      {loading ? (
        <Loader />
      ) : (
        <FlatList
          data={mutes}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: SPACE.xl, paddingBottom: SPACE.colossal }}
          ListHeaderComponent={err ? <Muted style={{ marginBottom: SPACE.md }}>{err}</Muted> : null}
          ListEmptyComponent={<Muted style={{ textAlign: 'center', marginTop: SPACE.jumbo }}>No active mutes.</Muted>}
          renderItem={({ item }) => (
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.lg }}>
                <Text style={{ fontSize: FONT.lead }}>{item.room_emoji || '🔇'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.text, fontSize: FONT.base, fontWeight: '700' }} numberOfLines={1}>
                    {item.username}
                  </Text>
                  <Muted numberOfLines={1}>
                    {item.room_name || '—'}
                    {item.expires_at ? ` · until ${new Date(item.expires_at).toLocaleString()}` : ' · permanent'}
                  </Muted>
                </View>
                <Btn title="Unmute" onPress={() => lift(item)} style={{ paddingVertical: 7, paddingHorizontal: SPACE.xl, backgroundColor: c.danger }} />
              </View>
            </Card>
          )}
        />
      )}
    </SafeAreaView>
  )
}
