import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, ActivityIndicator, FlatList } from 'react-native'
import { useRouter } from 'expo-router'
import { Screen } from '@/src/components/Screen'
import { Card, Title, Muted, Btn } from '@/src/components/ui'
import { useTheme } from '@/src/theme'
import { useAuth } from '@/src/lib/auth'
import { api } from '@/src/lib/api'

interface Room {
  id: string
  name: string
  type: string
  description?: string
}

export default function ChatScreen() {
  const { theme } = useTheme()
  const c = theme.colors
  const { isAuthed } = useAuth()
  const router = useRouter()
  const [rooms, setRooms] = useState<Room[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!isAuthed) {
      setLoading(false)
      return
    }
    api
      .get('/chat/rooms')
      .then((r) =>
        setRooms(
          ((r.data ?? []) as Room[]).filter((x) => x.type === 'voice' || x.type === 'video'),
        ),
      )
      .catch((e) => setErr(e?.response?.data?.detail || 'Could not load rooms'))
      .finally(() => setLoading(false))
  }, [isAuthed])

  if (!isAuthed) {
    return (
      <Screen>
        <Title>Chat</Title>
        <Card>
          <Muted>Sign in on the Profile tab to join voice/video rooms.</Muted>
        </Card>
      </Screen>
    )
  }

  const join = (room: Room) =>
    router.push(`/call?room=${room.id}&name=${encodeURIComponent(room.name)}`)

  return (
    <Screen scroll={false}>
      <Title>Call rooms</Title>
      {loading ? (
        <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
      ) : err ? (
        <Muted>{err}</Muted>
      ) : (
        <FlatList
          data={rooms}
          keyExtractor={(r) => r.id}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Text style={{ fontSize: 16 }}>{item.type === 'video' ? '📹' : '🔊'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.text, fontSize: 14, fontWeight: '700' }}>{item.name}</Text>
                  {item.description ? <Muted>{item.description}</Muted> : null}
                </View>
                <Btn
                  title="Join"
                  onPress={() => join(item)}
                  style={{ paddingVertical: 8, paddingHorizontal: 14 }}
                />
              </View>
            </Card>
          )}
          ListEmptyComponent={<Muted>No voice/video rooms yet.</Muted>}
        />
      )}
    </Screen>
  )
}
