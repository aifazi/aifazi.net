import { useEffect, useState, useCallback } from 'react'
import { FONT, SPACE } from '@/src/design'
import { View, Text, TouchableOpacity, FlatList, TextInput } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Card, Muted, Btn } from '@/src/components/ui'
import { Icon } from '@/src/components/icon'
import { useTheme } from '@/src/theme'
import { useAuth } from '@/src/lib/auth'
import { api } from '@/src/lib/api'
import { useOverlay } from '@/src/components/overlay'
import { Loader } from '@/src/components/Loader'

interface Ban {
  id: string
  username: string
  room_id: string
  room_name: string
  room_emoji?: string
  reason?: string
  banned_by?: string
  created_at?: string
}

interface Room {
  id: string
  name: string
  emoji?: string
  type?: string
}

interface UserResult {
  username: string
  role?: string
}

export default function ChatAdminBansScreen() {
  const { theme } = useTheme()
  const c = theme.colors
  const router = useRouter()
  const { user } = useAuth()
  const [bans, setBans] = useState<Ban[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [showBan, setShowBan] = useState(false)
  const [banQ, setBanQ] = useState('')
  const [banResults, setBanResults] = useState<UserResult[]>([])
  const { confirm, menu } = useOverlay()

  const isStaff = user?.role === 'admin' || user?.role === 'moderator'

  const load = useCallback(() => {
    api
      .get('/chat/admin/bans')
      .then((r) => setBans((r.data ?? []) as Ban[]))
      .catch((e) => setErr(e?.response?.data?.detail || 'Could not load bans'))
    api
      .get('/chat/admin/rooms')
      .then((r) => setRooms((r.data ?? []) as Room[]))
      .catch(() => setRooms([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (isStaff) load()
  }, [isStaff, load])

  const search = async (q: string) => {
    setBanQ(q)
    if (!q.trim()) return setBanResults([])
    try {
      const r = await api.get(`/chat/users/search?q=${encodeURIComponent(q.trim())}`)
      setBanResults((r.data ?? []) as UserResult[])
    } catch {
      setBanResults([])
    }
  }

  const unban = async (b: Ban) => {
    const ok = await confirm({ title: 'Unban', message: `Unban ${b.username} from ${b.room_name || 'this channel'}?`, confirmText: 'Unban' })
    if (!ok) return
    try {
      await api.delete(`/chat/rooms/${b.room_id}/ban/${encodeURIComponent(b.username)}`)
      setBans((prev) => prev.filter((x) => x.id !== b.id))
    } catch (e: any) {
      setErr(e?.response?.data?.detail || 'Could not unban')
    }
  }

  const pickRoom = async (u: UserResult) => {
    const picked = await menu({
      title: `Ban ${u.username}`,
      options: rooms.map((room) => ({ value: room.id, label: `${room.emoji || '💬'} ${room.name}` })),
    })
    if (!picked) return
    const room = rooms.find((r) => r.id === picked)
    if (room) banUser(u, room)
  }

  const banUser = async (u: UserResult, room: Room) => {
    const ok = await confirm({ title: `Ban ${u.username}`, message: `Ban from ${room.name}? Reason (optional):`, confirmText: 'Ban', destructive: true })
    if (!ok) return
    try {
      await api.post(`/chat/rooms/${room.id}/ban`, { username: u.username, reason: '' })
      setShowBan(false)
      setBanQ('')
      setBanResults([])
      load()
    } catch (e: any) {
      setErr(e?.response?.data?.detail || 'Could not ban')
    }
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
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back" hitSlop={10}>
          <Icon name="back" size={22} color={c.text} />
        </TouchableOpacity>
        <Text style={{ color: c.text, fontSize: FONT.card, fontWeight: '800', flex: 1 }}>Bans</Text>
        <Btn title="+ Ban" onPress={() => setShowBan((v) => !v)} style={{ paddingVertical: 7, paddingHorizontal: SPACE.xl }} />
      </View>

      {loading ? (
        <Loader />
      ) : (
        <FlatList
          data={bans}
          keyExtractor={(b) => b.id}
          contentContainerStyle={{ padding: SPACE.xl, paddingBottom: SPACE.colossal }}
          ListHeaderComponent={
            <>
              {err ? <Muted style={{ marginBottom: SPACE.md }}>{err}</Muted> : null}
              {showBan ? (
                <Card>
                  <Text style={{ color: c.text, fontSize: FONT.base, fontWeight: '800', marginBottom: SPACE.md }}>Ban a user</Text>
                  <TextInput
                    value={banQ}
                    onChangeText={search}
                    placeholder="Search username…"
                    placeholderTextColor={c.muted}
                    style={{ backgroundColor: c.bg, color: c.text, borderColor: c.border, borderWidth: 1, borderRadius: 8, padding: SPACE.lg, marginBottom: SPACE.md }}
                  />
                  {banResults.map((u) => (
                    <TouchableOpacity key={u.username} onPress={() => pickRoom(u)} style={{ paddingVertical: SPACE.md, borderBottomWidth: 1, borderBottomColor: c.border }}>
                      <Text style={{ color: c.text, fontSize: FONT.base, fontWeight: '700' }}>{u.username}</Text>
                      {u.role ? <Muted>{u.role}</Muted> : null}
                    </TouchableOpacity>
                  ))}
                  {banQ.trim() && banResults.length === 0 ? <Muted>No users found.</Muted> : null}
                </Card>
              ) : null}
            </>
          }
          ListEmptyComponent={!showBan ? <Muted style={{ textAlign: 'center', marginTop: SPACE.jumbo }}>No bans.</Muted> : null}
          renderItem={({ item }) => (
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.lg }}>
                <Text style={{ fontSize: FONT.lead }}>{item.room_emoji || '🚫'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.text, fontSize: FONT.base, fontWeight: '700' }} numberOfLines={1}>
                    {item.username}
                  </Text>
                  <Muted numberOfLines={1}>
                    {item.room_name || '—'}
                    {item.reason ? ` · ${item.reason}` : ''}
                  </Muted>
                </View>
                <Btn title="Unban" onPress={() => unban(item)} style={{ paddingVertical: 7, paddingHorizontal: SPACE.xl }} />
              </View>
            </Card>
          )}
        />
      )}
    </SafeAreaView>
  )
}
