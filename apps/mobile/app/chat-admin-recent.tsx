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
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <Icon name="back" size={22} color={c.text} />
        </TouchableOpacity>
        <Text style={{ color: c.text, fontSize: FONT.card, fontWeight: '800', flex: 1 }}>Recent messages</Text>
        <Btn title="Refresh" onPress={() => { setLoading(true); load() }} style={{ paddingVertical: 7, paddingHorizontal: SPACE.xl }} />
      </View>

      {loading ? (
        <Loader />
      ) : (
        <FlatList
          data={msgs}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: SPACE.xl, paddingBottom: SPACE.colossal }}
          ListHeaderComponent={err ? <Muted style={{ marginBottom: SPACE.md }}>{err}</Muted> : null}
          ListEmptyComponent={<Muted style={{ textAlign: 'center', marginTop: SPACE.jumbo }}>No messages yet.</Muted>}
          renderItem={({ item }) => (
            <TouchableOpacity onPress={() => show(item)}>
              <Card>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.lg, marginBottom: SPACE.sm }}>
                  <Text style={{ fontSize: FONT.card }}>{item.room_emoji || '💬'}</Text>
                  <Text style={{ color: c.accent, fontSize: FONT.md, fontWeight: '800', flex: 1 }} numberOfLines={1}>
                    {item.room_name || '—'}
                  </Text>
                  <Muted>{item.created_at ? new Date(item.created_at).toLocaleString() : ''}</Muted>
                </View>
                <Text style={{ color: c.muted, fontSize: FONT.md, fontWeight: '700' }}>
                  {item.sender}
                  {item.edited ? ' (edited)' : ''}
                </Text>
                {item.type === 'file' ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: SPACE.xxs }}>
                    <Icon name="attach" size={14} color={c.text2} />
                    <Text style={{ color: c.text, fontSize: FONT.base }} numberOfLines={1}>
                      {item.file_name || 'file'}
                    </Text>
                  </View>
                ) : item.content ? (
                  <Text style={{ color: c.text, fontSize: FONT.base, marginTop: SPACE.xxs }}>{item.content}</Text>
                ) : null}
              </Card>
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  )
}
