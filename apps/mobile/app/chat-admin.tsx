import { useEffect, useState, useCallback } from 'react'
import { View, Text, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native'
import { useRouter } from 'expo-router'
import type { Href } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Card, Muted, Btn } from '@/src/components/ui'
import { useTheme } from '@/src/theme'
import { useAuth } from '@/src/lib/auth'
import { api } from '@/src/lib/api'

interface Stats {
  rooms?: { total?: number; text?: number; voice?: number; video?: number }
  members?: number
  messages?: number
  mutes?: number
  bans?: number
  dm?: { threads?: number; requests?: number; pending?: number; blocks?: number }
}

interface Section {
  key: string
  label: string
  icon: string
  route: Href
  sub: string
}

export default function ChatAdminScreen() {
  const { theme } = useTheme()
  const c = theme.colors
  const router = useRouter()
  const { user } = useAuth()
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const isStaff = user?.role === 'admin' || user?.role === 'moderator'

  const load = useCallback(() => {
    api
      .get('/chat/admin/stats')
      .then((r) => setStats((r.data ?? {}) as Stats))
      .catch((e) => setErr(e?.response?.data?.detail || 'Could not load stats'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (isStaff) load()
  }, [isStaff, load])

  const sections: Section[] = [
    { key: 'members', label: 'Members', icon: '👥', route: '/chat-admin-members' as Href, sub: 'All memberships across channels' },
    { key: 'mutes', label: 'Mutes', icon: '🔇', route: '/chat-admin-mutes' as Href, sub: 'Active mutes, lift from anywhere' },
    { key: 'bans', label: 'Bans', icon: '🚫', route: '/chat-admin-bans' as Href, sub: 'All bans + ban/unban users' },
    { key: 'dm', label: 'Direct messages', icon: '📨', route: '/chat-admin-dm' as Href, sub: 'All requests, threads, blocks' },
    { key: 'recent', label: 'Recent messages', icon: '🕘', route: '/chat-admin-recent' as Href, sub: 'Latest activity across every channel' },
  ]

  const Stat = ({ label, value, color }: { label: string; value: number | string; color: string }) => (
    <View
      style={{
        flex: 1,
        backgroundColor: c.bg2,
        borderColor: c.border,
        borderWidth: 1,
        borderRadius: theme.mono ? 0 : 10,
        padding: 12,
      }}
    >
      <Text style={{ color: c.muted, fontSize: 10, letterSpacing: 1.5, marginBottom: 4 }}>{label.toUpperCase()}</Text>
      <Text style={{ color, fontSize: 22, fontWeight: '800' }}>{value}</Text>
    </View>
  )

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
        <Text style={{ color: c.text, fontSize: 15, fontWeight: '800', flex: 1 }}>Chat admin</Text>
        <Btn title="Refresh" onPress={() => { setLoading(true); load() }} style={{ paddingVertical: 7, paddingHorizontal: 12 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 40 }}>
          {err ? <Muted style={{ marginBottom: 10 }}>{err}</Muted> : null}

          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
            <Stat label="Rooms" value={stats?.rooms?.total ?? 0} color={c.accent} />
            <Stat label="Members" value={stats?.members ?? 0} color={c.text} />
            <Stat label="Messages" value={stats?.messages ?? 0} color="#facc15" />
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
            <Stat label="Mutes" value={stats?.mutes ?? 0} color="#ff6b35" />
            <Stat label="Bans" value={stats?.bans ?? 0} color="#ff4757" />
            <Stat label="DM" value={stats?.dm?.threads ?? 0} color="#22d3ee" />
          </View>
          {stats?.dm?.pending ? (
            <Muted style={{ marginBottom: 12 }}>⏳ {stats.dm.pending} pending DM request{stats.dm.pending === 1 ? '' : 's'}.</Muted>
          ) : null}

          {sections.map((s) => (
            <TouchableOpacity key={s.key} onPress={() => router.push(s.route)}>
              <Card>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Text style={{ fontSize: 22 }}>{s.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: c.text, fontSize: 14, fontWeight: '700' }}>{s.label}</Text>
                    <Muted>{s.sub}</Muted>
                  </View>
                  <Text style={{ color: c.accent, fontWeight: '700' }}>›</Text>
                </View>
              </Card>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  )
}
