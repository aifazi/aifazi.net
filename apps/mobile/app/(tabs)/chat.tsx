import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, ActivityIndicator, FlatList } from 'react-native'
import { useRouter } from 'expo-router'
import type { Href } from 'expo-router'
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

function roomIcon(type: string) {
  if (type === 'video') return '📹'
  if (type === 'voice') return '🔊'
  return '💬'
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
        setRooms(((r.data ?? []) as Room[]).filter((x) => x.type === 'text' || x.type === 'voice' || x.type === 'video')),
      )
      .catch((e) => setErr(e?.response?.data?.detail || 'Could not load rooms'))
      .finally(() => setLoading(false))
  }, [isAuthed])

  if (!isAuthed) {
    return (
      <Screen>
        <Title>Chat</Title>
        <Card>
          <Muted>Sign in on the Profile tab to join rooms.</Muted>
        </Card>
      </Screen>
    )
  }

  const open = (room: Room) => {
    const params = `room=${room.id}&name=${encodeURIComponent(room.name)}`
    if (room.type === 'text') router.push(`/chat-room?${params}` as Href)
    else router.push(`/call?${params}` as Href)
  }

  return (
    <Screen scroll={false}>
      <Title>Chat rooms</Title>
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
                <Text style={{ fontSize: 16 }}>{roomIcon(item.type)}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.text, fontSize: 14, fontWeight: '700' }}>{item.name}</Text>
                  {item.description ? <Muted>{item.description}</Muted> : null}
                </View>
                <Btn
                  title={item.type === 'text' ? 'Open' : 'Join'}
                  onPress={() => open(item)}
                  style={{ paddingVertical: 8, paddingHorizontal: 14 }}
                />
              </View>
            </Card>
          )}
          ListEmptyComponent={<Muted>No chat rooms yet.</Muted>}
        />
      )}
    </Screen>
  )
}
