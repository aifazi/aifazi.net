import { useState, useCallback } from 'react'
import { View, Text, TouchableOpacity, FlatList, SectionList, RefreshControl } from 'react-native'
import { useRouter , useFocusEffect } from 'expo-router'
import type { Href } from 'expo-router'
import { Screen } from '@/src/components/Screen'
import { Card, Title, Muted, Btn } from '@/src/components/ui'
import { Avatar } from '@/src/components/Avatar'
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
  access?: { mode: string; roles: string[]; users: string[] }
}

interface DMThread {
  id: string
  peer: string
  peer_avatar?: string
  peer_role?: string
  last_message?: string
  last_message_at?: string
  unread?: number
}

function roomIcon(type: string) {
  if (type === 'video') return '📹'
  if (type === 'voice') return '🔊'
  return '💬'
}

const ACCESS_LABEL: Record<string, { icon: string; label: string }> = {
  users: { icon: '🔒', label: 'Locked' },
  roles: { icon: '🛡️', label: 'VIP' },
  mixed: { icon: '🔐', label: 'Protected' },
}

function Badge({ icon, label, color }: { icon: string; label: string; color: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        borderWidth: 1,
        borderColor: color + '44',
        backgroundColor: color + '11',
        borderRadius: 5,
        paddingHorizontal: 5,
        paddingVertical: 1,
      }}
    >
      <Text style={{ fontSize: 10 }}>{icon}</Text>
      <Text style={{ color, fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</Text>
    </View>
  )
}

function AccessBadge({ room }: { room: Room }) {
  const { theme } = useTheme()
  const c = theme.colors
  const mode = room.access?.mode ?? (room.is_private ? 'users' : 'public')
  if (mode === 'public') return null
  const { icon, label } = ACCESS_LABEL[mode] ?? { icon: '🔐', label: 'Protected' }
  return <Badge icon={icon} label={label} color={c.accent2} />
}

function ReadOnlyBadge() {
  const { theme } = useTheme()
  const c = theme.colors
  return <Badge icon="🔇" label="read-only" color={c.muted} />
}

export default function ChatScreen() {
  const { theme } = useTheme()
  const c = theme.colors
  const { isAuthed, user } = useAuth()
  const router = useRouter()
  const [rooms, setRooms] = useState<Room[]>([])
  const [dms, setDms] = useState<DMThread[]>([])
  const [requests, setRequests] = useState<any[]>([])
  const [unreadNotifs, setUnreadNotifs] = useState(0)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [err, setErr] = useState('')

  const isStaff = user?.role === 'admin' || user?.role === 'moderator'

  const load = useCallback(() => {
    if (!isAuthed) {
      setLoading(false)
      setRefreshing(false)
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
    api
      .get('/chat/dm/requests')
      .then((r) => setRequests((r.data ?? []) as any[]))
      .catch(() => setRequests([]))
    api
      .get('/forum/notifications')
      .then((r) => setUnreadNotifs((Array.isArray(r.data) ? r.data : []).filter((n) => !n.read).length))
      .catch(() => {})
      .finally(() => { setLoading(false); setRefreshing(false) })
  }, [isAuthed])

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    load()
  }, [load])

  useFocusEffect(
    useCallback(() => {
      load()
    }, [load]),
  )

  const open = (room: Room) => {
    const params = `room=${room.id}&name=${encodeURIComponent(room.name)}&type=${room.type}`
    if (room.type === 'text') router.push(`/chat-room?${params}` as Href)
    else router.push(`/call?${params}` as Href)
  }

  const openDm = (dm: DMThread) => {
    router.push(`/dm-thread?thread_id=${dm.id}&peer=${encodeURIComponent(dm.peer)}` as Href)
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
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Title>Chat rooms</Title>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <TouchableOpacity onPress={() => router.push('/notifications' as Href)} hitSlop={8} style={{ position: 'relative' }}>
            <Text style={{ color: unreadNotifs > 0 ? c.accent : c.muted, fontWeight: '700', fontSize: 16 }}>🔔</Text>
            {unreadNotifs > 0 ? (
              <View
                style={{
                  position: 'absolute',
                  top: -6,
                  right: -8,
                  minWidth: 16,
                  height: 16,
                  borderRadius: 8,
                  paddingHorizontal: 4,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: c.accent,
                }}
              >
                <Text style={{ color: c.onAccent, fontSize: 9, fontWeight: '800' }}>{unreadNotifs > 9 ? '9+' : unreadNotifs}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
          {isStaff ? (
            <View style={{ flexDirection: 'row', gap: 14 }}>
              <TouchableOpacity onPress={() => router.push('/chat-admin' as Href)} hitSlop={8}>
                <Text style={{ color: c.accent, fontWeight: '700', fontSize: 14 }}>Admin</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => router.push('/channel-manage' as Href)} hitSlop={8}>
                <Text style={{ color: c.accent, fontWeight: '700', fontSize: 14 }}>Manage ⚙</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      </View>

      {loading ? (
        <Loader />
      ) : (
        <SectionList
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} colors={[c.accent]} progressBackgroundColor={c.bg2} />
          }
          sections={[
            {
              title: 'Direct messages',
              data: dms as any[],
              headerExtra: (
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity onPress={() => router.push('/dm-new' as Href)} hitSlop={8}>
                    <Text style={{ color: c.accent, fontWeight: '700' }}>+ New</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => router.push('/dm-requests' as Href)} hitSlop={8}>
                    <Text style={{ color: c.accent, fontWeight: '700' }}>
                      Requests{requests.length > 0 ? ` (${requests.length})` : ''}
                    </Text>
                  </TouchableOpacity>
                </View>
              ),
              renderItem: ({ item }: { item: DMThread }) => (
                <Card>
                  <TouchableOpacity onPress={() => openDm(item)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Avatar name={item.peer} avatar={item.peer_avatar} size={30} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: c.text, fontSize: 14, fontWeight: '700' }} numberOfLines={1}>
                        {item.peer}
                      </Text>
                      {item.last_message ? <Muted numberOfLines={1}>{item.last_message}</Muted> : null}
                    </View>
                    {item.unread ? (
                      <View
                        style={{
                          backgroundColor: c.accent,
                          borderRadius: 10,
                          paddingHorizontal: 7,
                          paddingVertical: 2,
                          minWidth: 20,
                          alignItems: 'center',
                        }}
                      >
                        <Text style={{ color: c.onAccent, fontSize: 11, fontWeight: '800' }}>
                          {item.unread}
                        </Text>
                      </View>
                    ) : null}
                  </TouchableOpacity>
                </Card>
              ),
              empty: dms.length === 0 ? <Muted>No DMs yet — tap “+ New” to message someone.</Muted> : null,
            },
            {
              title: 'Rooms',
              data: rooms as any[],
              renderItem: ({ item }: { item: Room }) => (
                <Card>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Text style={{ fontSize: 16 }}>{item.emoji || roomIcon(item.type)}</Text>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <Text style={{ color: c.text, fontSize: 14, fontWeight: '700' }} numberOfLines={1}>
                          {item.name}
                        </Text>
                        <AccessBadge room={item} />
                        {item.read_only ? <ReadOnlyBadge /> : null}
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                        <Text style={{ color: c.muted, fontSize: 11, fontFamily: theme.mono ? 'monospace' : undefined }}>
                          #{item.id.slice(0, 6)}
                        </Text>
                        {item.description ? (
                          <Text style={{ color: c.muted, fontSize: 11, flex: 1 }} numberOfLines={1}>
                            {item.description}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                    <Btn
                      title={item.type === 'text' ? 'Open' : 'Join'}
                      onPress={() => open(item)}
                      style={{ paddingVertical: 8, paddingHorizontal: 14 }}
                    />
                  </View>
                </Card>
              ),
              empty: rooms.length === 0 ? <Muted>{err || 'No chat rooms yet.'}</Muted> : null,
            },
          ] as any}
          keyExtractor={(item: any) => item.id}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: section.title === 'Direct messages' ? 0 : 20,
                marginBottom: 8,
              }}
            >
              <Text style={{ color: c.text, fontSize: 16, fontWeight: '800' }}>{section.title}</Text>
              {section.headerExtra ?? null}
            </View>
          )}
          renderSectionFooter={({ section }: any) =>
            section.empty ? <View style={{ paddingBottom: 4 }}>{section.empty}</View> : null
          }
        />
      )}
    </Screen>
  )
}
