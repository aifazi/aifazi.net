import { useEffect, useState, useCallback } from 'react'
import { View, Text, TouchableOpacity, FlatList, ActivityIndicator, Alert } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Card, Muted, Btn } from '@/src/components/ui'
import { useTheme } from '@/src/theme'
import { useAuth } from '@/src/lib/auth'
import { api } from '@/src/lib/api'

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

  const changeRole = (m: Member) => {
    const roomRoles = roles.filter((r) => r.room_id === m.room_id).map((r) => r.name)
    const opts = [...new Set([...roomRoles, ...PLATFORM_ROLES])]
    Alert.alert(`Role for ${m.username}`, m.room_name ? `In ${m.room_name}` : 'Choose a role', [
      ...opts.map((r) => ({
        text: r,
        onPress: async () => {
          try {
            await api.patch(`/chat/rooms/${m.room_id}/members/${encodeURIComponent(m.username)}/role`, { name: r })
            setMembers((prev) => prev.map((x) => (x.id === m.id ? { ...x, role: r } : x)))
          } catch (e: any) {
            setErr(e?.response?.data?.detail || 'Could not change role')
          }
        },
      })),
      { text: 'Cancel', style: 'cancel' },
    ])
  }

  const kick = (m: Member) => {
    Alert.alert('Kick member', `Kick ${m.username} from ${m.room_name || 'this channel'}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Kick',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.post(`/chat/rooms/${m.room_id}/kick`, { username: m.username })
            setMembers((prev) => prev.filter((x) => x.id !== m.id))
          } catch (e: any) {
            setErr(e?.response?.data?.detail || 'Could not kick member')
          }
        },
      },
    ])
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
        <Text style={{ color: c.text, fontSize: 15, fontWeight: '800', flex: 1 }}>Members</Text>
        <Btn title="Refresh" onPress={() => { setLoading(true); load() }} style={{ paddingVertical: 7, paddingHorizontal: 12 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={members}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
          ListHeaderComponent={err ? <Muted style={{ marginBottom: 8 }}>{err}</Muted> : null}
          ListEmptyComponent={<Muted style={{ textAlign: 'center', marginTop: 30 }}>No members yet.</Muted>}
          renderItem={({ item }) => (
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Text style={{ fontSize: 18 }}>{item.room_emoji || '💬'}</Text>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ color: c.text, fontSize: 14, fontWeight: '700' }} numberOfLines={1}>
                      {item.username}
                    </Text>
                    <Text
                      style={{
                        color: item.role === 'moderator' || item.role === 'admin' ? '#ffd700' : c.muted,
                        fontSize: 11,
                        fontWeight: '700',
                      }}
                    >
                      {item.role}
                    </Text>
                  </View>
                  <Muted numberOfLines={1}>{item.room_name || '—'}</Muted>
                </View>
                <Btn title="Role" onPress={() => changeRole(item)} style={{ paddingVertical: 7, paddingHorizontal: 12 }} />
                <Btn
                  title="Kick"
                  onPress={() => kick(item)}
                  style={{ paddingVertical: 7, paddingHorizontal: 12, backgroundColor: c.danger }}
                />
              </View>
            </Card>
          )}
        />
      )}
    </SafeAreaView>
  )
}
