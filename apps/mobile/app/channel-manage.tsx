import { useEffect, useState, useCallback } from 'react'
import { FONT, SPACE } from '@/src/design'
import { View, Text, TouchableOpacity, FlatList } from 'react-native'
import { useRouter } from 'expo-router'
import type { Href } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Card, Muted, Btn } from '@/src/components/ui'
import { Icon } from '@/src/components/icon'
import { useTheme } from '@/src/theme'
import { useAuth } from '@/src/lib/auth'
import { api } from '@/src/lib/api'
import { Loader } from '@/src/components/Loader'

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
          gap: SPACE.lg,
          paddingHorizontal: SPACE.xl,
          paddingVertical: SPACE.lg,
          borderBottomWidth: 1,
          borderBottomColor: c.border,
        }}
      >
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <Icon name="back" size={22} color={c.text} />
        </TouchableOpacity>
        <Text style={{ color: c.text, fontSize: FONT.card, fontWeight: '800', flex: 1 }}>Channel management</Text>
        <Btn title="+ New" onPress={() => router.push('/channel-edit' as Href)} style={{ paddingVertical: 7, paddingHorizontal: SPACE.xl }} />
      </View>

      {!isStaff ? (
        <View style={{ padding: SPACE.giant }}>
          <Muted style={{ textAlign: 'center' }}>Staff only.</Muted>
        </View>
      ) : loading ? (
        <Loader />
      ) : (
        <FlatList
          data={rooms}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ padding: SPACE.xl }}
          ListEmptyComponent={err ? <Muted>{err}</Muted> : <Muted>No channels yet.</Muted>}
          renderItem={({ item }) => (
            <TouchableOpacity onPress={() => router.push(`/channel-edit?room_id=${item.id}` as Href)}>
              <Card>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.lg }}>
                  <Text style={{ fontSize: FONT.section }}>{item.emoji || '💬'}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: c.text, fontSize: FONT.base, fontWeight: '700' }} numberOfLines={1}>
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
