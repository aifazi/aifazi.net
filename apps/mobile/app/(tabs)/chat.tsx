import { useState, useCallback } from 'react'
import { FONT, SPACE } from '@/src/design'
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
import { Icon, type IconName } from '@/src/components/icon'
import { withAlpha } from '@/src/lib/color'
import { Reveal, stagger } from '@/src/components/motion'

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
  peer_last_seen?: string
  last_message?: string
  last_message_at?: string
  unread?: number
}

/** Online if the peer's last_seen is within 5 minutes. */
function isOnline(dm: DMThread): boolean {
  const ts = dm.peer_last_seen
  if (!ts) return false
  const seen = new Date(ts).getTime()
  if (Number.isNaN(seen)) return false
  return Date.now() - seen < 5 * 60 * 1000
}

function roomIcon(type: string): IconName {
  if (type === 'video') return 'video'
  if (type === 'voice') return 'mic'
  return 'chat'
}

const ACCESS_LABEL: Record<string, { icon: IconName; label: string }> = {
  users: { icon: 'lock', label: 'Locked' },
  roles: { icon: 'shield', label: 'VIP' },
  mixed: { icon: 'lock', label: 'Protected' },
}

function Badge({ icon, label, color }: { icon: IconName; label: string; color: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACE.xxs,
        borderWidth: 1,
        borderColor: withAlpha(color, 0.27),
        backgroundColor: withAlpha(color, 0.07),
        borderRadius: 5,
        paddingHorizontal: 5,
        paddingVertical: 1,
      }}
    >
      <Icon name={icon} size={10} color={color} />
      <Text style={{ color, fontSize: FONT.micro, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</Text>
    </View>
  )
}

function AccessBadge({ room }: { room: Room }) {
  const { theme } = useTheme()
  const c = theme.colors
  const mode = room.access?.mode ?? (room.is_private ? 'users' : 'public')
  if (mode === 'public') return null
  const { icon, label } = ACCESS_LABEL[mode] ?? { icon: 'lock', label: 'Protected' }
  return <Badge icon={icon} label={label} color={c.accent2} />
}

function ReadOnlyBadge() {
  const { theme } = useTheme()
  const c = theme.colors
  return <Badge icon="mic-off" label="read-only" color={c.muted} />
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
      // Keep DM presence/unread fresh while this screen is in view (matches the
      // 4s message poll in dm-thread; the list is lighter so 15s is plenty).
      const timer = setInterval(() => load(), 15_000)
      return () => clearInterval(timer)
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
        <Reveal dir="up" duration={420}>
          <Title>Chat</Title>
        </Reveal>
        <Reveal dir="up" delay={120} duration={520}>
          <Card>
            <Muted>Sign in on the Profile tab to join rooms.</Muted>
          </Card>
        </Reveal>
      </Screen>
    )
  }

  return (
    <Screen scroll={false}>
      <Reveal dir="up" duration={420}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Title tag="MESSAGES">Chat rooms</Title>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.xxl }}>
          <TouchableOpacity onPress={() => router.push('/notifications' as Href)} hitSlop={8} style={{ position: 'relative' }}>
            <Icon name="bell" size={18} color={unreadNotifs > 0 ? c.accent : c.muted} />
            {unreadNotifs > 0 ? (
              <View
                style={{
                  position: 'absolute',
                  top: -6,
                  right: -8,
                  minWidth: 16,
                  height: 16,
                  borderRadius: 8,
                  paddingHorizontal: SPACE.xs,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: c.accent,
                }}
              >
                <Text style={{ color: c.onAccent, fontSize: FONT.micro, fontWeight: '800' }}>{unreadNotifs > 9 ? '9+' : unreadNotifs}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
          {isStaff ? (
            <View style={{ flexDirection: 'row', gap: SPACE.xxl }}>
              <TouchableOpacity onPress={() => router.push('/chat-admin' as Href)} hitSlop={8}>
                <Text style={{ color: c.accent, fontWeight: '700', fontSize: FONT.base }}>Admin</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => router.push('/channel-manage' as Href)} hitSlop={8}>
                <Icon name="settings" size={18} color={c.accent} />
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      </View>
      </Reveal>

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
                <View style={{ flexDirection: 'row', gap: SPACE.lg }}>
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
              renderItem: ({ item, index }: { item: DMThread; index: number }) => (
                <Reveal dir="scale" delay={stagger(index)} duration={420}>
                <Card>
                  <TouchableOpacity onPress={() => openDm(item)} style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.lg }}>
                    <View>
                      <Avatar name={item.peer} avatar={item.peer_avatar} size={30} />
                      <View
                        style={{
                          position: 'absolute',
                          bottom: -1,
                          right: -1,
                          width: 11,
                          height: 11,
                          borderRadius: 6,
                          borderWidth: 2,
                          borderColor: c.bg2,
                          backgroundColor: isOnline(item) ? c.success : c.muted,
                        }}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
                        <Text style={{ color: c.text, fontSize: FONT.base, fontWeight: '700' }} numberOfLines={1}>
                          {item.peer}
                        </Text>
                        {isOnline(item) ? (
                          <Text style={{ color: c.success, fontSize: FONT.micro, fontWeight: '700', textTransform: 'uppercase' }}>
                            online
                          </Text>
                        ) : null}
                      </View>
                      {item.last_message ? <Muted numberOfLines={1}>{item.last_message}</Muted> : null}
                    </View>
                    {item.unread ? (
                      <View
                        style={{
                          backgroundColor: c.accent,
                          borderRadius: 10,
                          paddingHorizontal: 7,
                          paddingVertical: SPACE.xxs,
                          minWidth: 20,
                          alignItems: 'center',
                        }}
                      >
                        <Text style={{ color: c.onAccent, fontSize: FONT.sm, fontWeight: '800' }}>
                          {item.unread}
                        </Text>
                      </View>
                    ) : null}
                  </TouchableOpacity>
                </Card>
                </Reveal>
              ),
              empty: dms.length === 0 ? <Muted>No DMs yet — tap “+ New” to message someone.</Muted> : null,
            },
            {
              title: 'Rooms',
              data: rooms as any[],
              renderItem: ({ item, index }: { item: Room; index: number }) => (
                <Reveal dir="scale" delay={stagger(index)} duration={420}>
                <Card>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.lg }}>
                    {item.emoji ? (
                      <Text style={{ fontSize: FONT.section }}>{item.emoji}</Text>
                    ) : (
                      <Icon name={roomIcon(item.type)} size={18} color={c.accent2} />
                    )}
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, flexWrap: 'wrap' }}>
                        <Text style={{ color: c.text, fontSize: FONT.base, fontWeight: '700' }} numberOfLines={1}>
                          {item.name}
                        </Text>
                        <AccessBadge room={item} />
                        {item.read_only ? <ReadOnlyBadge /> : null}
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, marginTop: SPACE.xxs }}>
                        <Text style={{ color: c.muted, fontSize: FONT.sm, fontFamily: theme.mono ? 'monospace' : undefined }}>
                          #{item.id.slice(0, 6)}
                        </Text>
                        {item.description ? (
                          <Text style={{ color: c.muted, fontSize: FONT.sm, flex: 1 }} numberOfLines={1}>
                            {item.description}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                    <Btn
                      title={item.type === 'text' ? 'Open' : 'Join'}
                      onPress={() => open(item)}
                      style={{ paddingVertical: SPACE.md, paddingHorizontal: SPACE.xxl }}
                    />
                  </View>
                </Card>
                </Reveal>
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
                marginBottom: SPACE.md,
              }}
            >
              <Text style={{ color: c.text, fontSize: FONT.section, fontWeight: '800' }}>{section.title}</Text>
              {section.headerExtra ?? null}
            </View>
          )}
          renderSectionFooter={({ section }: any) =>
            section.empty ? <View style={{ paddingBottom: SPACE.xs }}>{section.empty}</View> : null
          }
        />
      )}
    </Screen>
  )
}
