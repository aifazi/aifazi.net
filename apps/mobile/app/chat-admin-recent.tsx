import { useEffect, useState, useCallback } from 'react'
import { View, Text, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Card, Muted, Btn } from '@/src/components/ui'
import { useTheme } from '@/src/theme'
import { useAuth } from '@/src/lib/auth'
import { api } from '@/src/lib/api'
import { useOverlay } from '@/src/components/overlay'

interface Msg {
  id: string
  room_id: string
  room_name?: string
  room_emoji?: string
  sender: string
  content?: string
  type?: string
  file_name?: string
  created_at?: string
  edited?: boolean
}

export default function ChatAdminRecentScreen() {
  const { theme } = useTheme()
  const c = theme.colors
  const router = useRouter()
  const { user } = useAuth()
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const { menu, alert } = useOverlay()

  const isStaff = user?.role === 'admin' || user?.role === 'moderator'

  const load = useCallback(() => {
    api
      .get('/chat/admin/recent-messages?limit=50')
      .then((r) => setMsgs((r.data ?? []) as Msg[]))
      .catch((e) => setErr(e?.response?.data?.detail || 'Could not load messages'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (isStaff) load()
  }, [isStaff, load])

  const show = async (m: Msg) => {
    const picked = await menu({
      title: `${m.sender} · ${m.room_name || '—'}`,
      options: [{ value: 'copy', label: 'Copy ID' }],
    })
    if (picked === 'copy') alert({ message: m.id })
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
        <Text style={{ color: c.text, fontSize: 15, fontWeight: '800', flex: 1 }}>Recent messages</Text>
        <Btn title="Refresh" onPress={() => { setLoading(true); load() }} style={{ paddingVertical: 7, paddingHorizontal: 12 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={msgs}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
          ListHeaderComponent={err ? <Muted style={{ marginBottom: 8 }}>{err}</Muted> : null}
          ListEmptyComponent={<Muted style={{ textAlign: 'center', marginTop: 30 }}>No messages yet.</Muted>}
          renderItem={({ item }) => (
            <TouchableOpacity onPress={() => show(item)}>
              <Card>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <Text style={{ fontSize: 15 }}>{item.room_emoji || '💬'}</Text>
                  <Text style={{ color: c.accent, fontSize: 12, fontWeight: '800', flex: 1 }} numberOfLines={1}>
                    {item.room_name || '—'}
                  </Text>
                  <Muted>{item.created_at ? new Date(item.created_at).toLocaleString() : ''}</Muted>
                </View>
                <Text style={{ color: c.muted, fontSize: 12, fontWeight: '700' }}>
                  {item.sender}
                  {item.edited ? ' (edited)' : ''}
                </Text>
                <Text style={{ color: c.text, fontSize: 14, marginTop: 2 }}>
                  {item.type === 'file' ? `📎 ${item.file_name || 'file'}` : item.content || ''}
                </Text>
              </Card>
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  )
}
