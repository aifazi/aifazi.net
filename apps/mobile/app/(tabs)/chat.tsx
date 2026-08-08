import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, ActivityIndicator, FlatList, TextInput, SectionList } from 'react-native'
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

interface DMThread {
  id: string
  peer: string
  peer_avatar?: string
  peer_role?: string
  last_message?: string
  last_message_at?: string
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
  const [dms, setDms] = useState<DMThread[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [showNewDm, setShowNewDm] = useState(false)
  const [dmTarget, setDmTarget] = useState('')
  const [dmBusy, setDmBusy] = useState(false)

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
    api
      .get('/chat/dm/threads')
      .then((r) => setDms((r.data ?? []) as DMThread[]))
      .catch(() => setDms([]))
      .finally(() => setLoading(false))
  }, [isAuthed])

  const open = (room: Room) => {
    const params = `room=${room.id}&name=${encodeURIComponent(room.name)}`
    if (room.type === 'text') router.push(`/chat-room?${params}` as Href)
    else router.push(`/call?${params}` as Href)
  }

  const openDm = (dm: DMThread) => {
    router.push(`/dm-thread?thread_id=${dm.id}&peer=${encodeURIComponent(dm.peer)}` as Href)
  }

  const startDm = async () => {
    const target = dmTarget.trim()
    if (!target) return
    setDmBusy(true)
    try {
      const r = await api.post('/chat/dm/threads', { username: target })
      const t = (r.data ?? {}) as DMThread
      setDmTarget('')
      setShowNewDm(false)
      router.push(`/dm-thread?thread_id=${t.id}&peer=${encodeURIComponent(t.peer)}` as Href)
      api.get('/chat/dm/threads').then((x) => setDms((x.data ?? []) as DMThread[])).catch(() => setDms([]))
    } catch (e: any) {
      setErr(e?.response?.data?.detail || 'Could not start DM')
    } finally {
      setDmBusy(false)
    }
  }

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

  return (
    <Screen scroll={false}>
      <Title>Chat rooms</Title>
      {loading ? (
        <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
      ) : err && rooms.length === 0 && dms.length === 0 ? (
        <Muted>{err}</Muted>
      ) : (
        <FlatList
          data={rooms}
          keyExtractor={(item) => item.name}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={{ color: c.text, fontSize: 16, fontWeight: '800' }}>Direct messages</Text>
                <TouchableOpacity onPress={() => setShowNewDm((v) => !v)} hitSlop={8}>
                  <Text style={{ color: c.accent, fontWeight: '700' }}>{showNewDm ? 'Cancel' : '+ New'}</Text>
                </TouchableOpacity>
              </View>
              {showNewDm ? (
                <Card>
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                    <TextInput
                      value={dmTarget}
                      onChangeText={setDmTarget}
                      placeholder="username"
                      placeholderTextColor={c.muted}
                      autoCapitalize="none"
                      autoCorrect={false}
                      style={{
                        flex: 1,
                        backgroundColor: c.bg,
                        color: c.text,
                        borderColor: c.border,
                        borderWidth: 1,
                        borderRadius: 8,
                        paddingHorizontal: 10,
                        paddingVertical: 8,
                        fontSize: 14,
                      }}
                    />
                    <Btn
                      title={dmBusy ? '…' : 'Start'}
                      onPress={startDm}
                      disabled={dmBusy || !dmTarget.trim()}
                      style={{ paddingVertical: 8, paddingHorizontal: 14 }}
                    />
                  </View>
                </Card>
              ) : null}
              {dms.length === 0 ? (
                <Muted>No DMs yet — tap “+ New” to message someone.</Muted>
              ) : (
                dms.map((dm) => (
                  <Card key={dm.id}>
                    <TouchableOpacity onPress={() => openDm(dm)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Text style={{ fontSize: 16 }}>👤</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: c.text, fontSize: 14, fontWeight: '700' }}>{dm.peer}</Text>
                        {dm.last_message ? <Muted>{dm.last_message}</Muted> : null}
                      </View>
                    </TouchableOpacity>
                  </Card>
                ))
              )}
              <Text style={{ color: c.text, fontSize: 16, fontWeight: '800', marginTop: 20, marginBottom: 8 }}>
                Rooms
              </Text>
            </View>
          }
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