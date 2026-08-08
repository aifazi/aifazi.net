import { useEffect, useState, useCallback } from 'react'
import { View, Text, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Card, Muted, Btn } from '@/src/components/ui'
import { useTheme } from '@/src/theme'
import { useAuth } from '@/src/lib/auth'
import { api } from '@/src/lib/api'
import { useOverlay } from '@/src/components/overlay'

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
        <Muted style={{ textAlign: 'center', marginTop: 40 }}>Staff only.</Muted>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top', 'bottom']}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderBottomWidth: 1,
          borderBottomColor: c.border,
        }}
      >
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <Text style={{ color: c.text, fontSize: 18 }}>←</Text>
        </TouchableOpacity>
        <Text style={{ color: c.text, fontSize: 15, fontWeight: '800', flex: 1 }}>Mutes</Text>
        <Btn title="Refresh" onPress={() => { setLoading(true); load() }} style={{ paddingVertical: 7, paddingHorizontal: 12 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={mutes}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
          ListHeaderComponent={err ? <Muted style={{ marginBottom: 8 }}>{err}</Muted> : null}
          ListEmptyComponent={<Muted style={{ textAlign: 'center', marginTop: 30 }}>No active mutes.</Muted>}
          renderItem={({ item }) => (
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Text style={{ fontSize: 18 }}>{item.room_emoji || '🔇'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.text, fontSize: 14, fontWeight: '700' }} numberOfLines={1}>
                    {item.username}
                  </Text>
                  <Muted numberOfLines={1}>
                    {item.room_name || '—'}
                    {item.expires_at ? ` · until ${new Date(item.expires_at).toLocaleString()}` : ' · permanent'}
                  </Muted>
                </View>
                <Btn title="Unmute" onPress={() => lift(item)} style={{ paddingVertical: 7, paddingHorizontal: 12, backgroundColor: c.danger }} />
              </View>
            </Card>
          )}
        />
      )}
    </SafeAreaView>
  )
}
