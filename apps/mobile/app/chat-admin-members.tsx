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

interface Member {
  id: string
  username: string
  role: string
  room_id: string
  room_name: string
  room_emoji?: string
  joined_at?: string
}

interface CustomRole {
  id: string
  name: string
  room_id: string
}

const PLATFORM_ROLES = ['member', 'moderator', 'admin', 'editor', 'chat']

export default function ChatAdminMembersScreen() {
  const { theme } = useTheme()
  const c = theme.colors
  const router = useRouter()
  const { user } = useAuth()
  const [members, setMembers] = useState<Member[]>([])
  const [roles, setRoles] = useState<CustomRole[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const { confirm, menu } = useOverlay()

  const isStaff = user?.role === 'admin' || user?.role === 'moderator'

  const load = useCallback(() => {
    api
      .get('/chat/admin/members')
      .then((r) => setMembers((r.data ?? []) as Member[]))
      .catch((e) => setErr(e?.response?.data?.detail || 'Could not load members'))
    api
      .get('/chat/admin/roles')
      .then((r) => setRoles((r.data ?? []) as CustomRole[]))
      .catch(() => setRoles([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (isStaff) load()
  }, [isStaff, load])

  const changeRole = async (m: Member) => {
    const roomRoles = roles.filter((r) => r.room_id === m.room_id).map((r) => r.name)
    const opts = [...new Set([...roomRoles, ...PLATFORM_ROLES])]
    const picked = await menu({
      title: `Role for ${m.username}`,
      options: opts.map((r) => ({ value: r, label: r })),
    })
    if (!picked) return
    try {
      await api.patch(`/chat/rooms/${m.room_id}/members/${encodeURIComponent(m.username)}/role`, { name: picked })
      setMembers((prev) => prev.map((x) => (x.id === m.id ? { ...x, role: picked } : x)))
    } catch (e: any) {
      setErr(e?.response?.data?.detail || 'Could not change role')
    }
  }

  const kick = async (m: Member) => {
    const ok = await confirm({ title: 'Kick member', message: `Kick ${m.username} from ${m.room_name || 'this channel'}?`, confirmText: 'Kick', destructive: true })
    if (!ok) return
    try {
      await api.post(`/chat/rooms/${m.room_id}/kick`, { username: m.username })
      setMembers((prev) => prev.filter((x) => x.id !== m.id))
    } catch (e: any) {
      setErr(e?.response?.data?.detail || 'Could not kick member')
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
        <Text style={{ color: c.text, fontSize: FONT.card, fontWeight: '800', flex: 1 }}>Members</Text>
        <Btn title="Refresh" onPress={() => { setLoading(true); load() }} style={{ paddingVertical: 7, paddingHorizontal: SPACE.xl }} />
      </View>

      {loading ? (
        <Loader />
      ) : (
        <FlatList
          data={members}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: SPACE.xl, paddingBottom: SPACE.colossal }}
          ListHeaderComponent={err ? <Muted style={{ marginBottom: SPACE.md }}>{err}</Muted> : null}
          ListEmptyComponent={<Muted style={{ textAlign: 'center', marginTop: SPACE.jumbo }}>No members yet.</Muted>}
          renderItem={({ item }) => (
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.lg }}>
                <Text style={{ fontSize: FONT.lead }}>{item.room_emoji || '💬'}</Text>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
                    <Text style={{ color: c.text, fontSize: FONT.base, fontWeight: '700' }} numberOfLines={1}>
                      {item.username}
                    </Text>
                    <Text
                      style={{
                        color: item.role === 'moderator' || item.role === 'admin' ? c.star : c.muted,
                        fontSize: FONT.sm,
                        fontWeight: '700',
                      }}
                    >
                      {item.role}
                    </Text>
                  </View>
                  <Muted numberOfLines={1}>{item.room_name || '—'}</Muted>
                </View>
                <Btn title="Role" onPress={() => changeRole(item)} style={{ paddingVertical: 7, paddingHorizontal: SPACE.xl }} />
                <Btn
                  title="Kick"
                  onPress={() => kick(item)}
                  style={{ paddingVertical: 7, paddingHorizontal: SPACE.xl, backgroundColor: c.danger }}
                />
              </View>
            </Card>
          )}
        />
      )}
    </SafeAreaView>
  )
}
