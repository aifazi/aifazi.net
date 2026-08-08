import { useEffect, useState, useCallback } from 'react'
import { View, Text, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import type { Href } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Card, Muted, Btn } from '@/src/components/ui'
import { useTheme } from '@/src/theme'
import { useAuth } from '@/src/lib/auth'
import { api } from '@/src/lib/api'

interface Room {
  id: string
  name: string
  type: string
  description?: string
  emoji?: string
  is_private?: boolean
  read_only?: boolean
  slow_mode?: number
  access?: { mode: string; roles: string[]; users: string[] }
}

function modeLabel(r: Room): string {
  const a = r.access
  if (r.is_private && !a?.roles?.length && !a?.users?.length) return 'Closed'
  if (a?.mode === 'roles') return `Roles: ${a.roles.join(', ')}`
  if (a?.mode === 'users') return `Users: ${a.users.length}`
  if (a?.mode === 'mixed') return `Roles+users (${a.roles.length}/${a.users.length})`
  return 'Public'
}

export default function ChannelManageScreen() {
  const { theme } = useTheme()
  const c = theme.colors
  const router = useRouter()
  const { user } = useAuth()
  const [rooms, setRooms] = useState<Room[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const isStaff = user?.role === 'admin' || user?.role === 'moderator'

  const load = useCallback(() => {
    api
      .get('/chat/rooms')
      .then((r) => setRooms((r.data ?? []) as Room[]))
      .catch((e) => setErr(e?.response?.data?.detail || 'Could not load rooms'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (isStaff) load()
  }, [isStaff, load])

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
        <Text style={{ color: c.text, fontSize: 15, fontWeight: '800', flex: 1 }}>Channel management</Text>
        <Btn title="+ New" onPress={() => router.push('/channel-edit' as Href)} style={{ paddingVertical: 7, paddingHorizontal: 12 }} />
      </View>

      {!isStaff ? (
        <View style={{ padding: 20 }}>
          <Muted style={{ textAlign: 'center' }}>Staff only.</Muted>
        </View>
      ) : loading ? (
        <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={rooms}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ padding: 12 }}
          ListEmptyComponent={err ? <Muted>{err}</Muted> : <Muted>No channels yet.</Muted>}
          renderItem={({ item }) => (
            <TouchableOpacity onPress={() => router.push(`/channel-edit?room_id=${item.id}` as Href)}>
              <Card>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text style={{ fontSize: 16 }}>{item.emoji || '💬'}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: c.text, fontSize: 14, fontWeight: '700' }} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Muted numberOfLines={1}>
                      {item.type} · {modeLabel(item)}
                      {item.read_only ? ' · 🔇 read-only' : ''}
                      {item.slow_mode ? ` · ${item.slow_mode}s` : ''}
                    </Muted>
                  </View>
                  <Text style={{ color: c.accent, fontWeight: '700' }}>Edit ›</Text>
                </View>
              </Card>
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  )
}
