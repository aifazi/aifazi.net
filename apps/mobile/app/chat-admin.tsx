import { useEffect, useState, useCallback } from 'react'
import { FONT, SPACE } from '@/src/design'
import { View, Text, TouchableOpacity, ScrollView } from 'react-native'
import { useRouter } from 'expo-router'
import type { Href } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Card, Muted, Btn } from '@/src/components/ui'
import { Icon } from '@/src/components/icon'
import type { IconName } from '@/src/components/icon'
import { useTheme } from '@/src/theme'
import { useAuth } from '@/src/lib/auth'
import { api } from '@/src/lib/api'
import { Loader } from '@/src/components/Loader'

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
  icon: IconName
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
    { key: 'members', label: 'Members', icon: 'profile', route: '/chat-admin-members' as Href, sub: 'All memberships across channels' },
    { key: 'mutes', label: 'Mutes', icon: 'mic-off', route: '/chat-admin-mutes' as Href, sub: 'Active mutes, lift from anywhere' },
    { key: 'bans', label: 'Bans', icon: 'close', route: '/chat-admin-bans' as Href, sub: 'All bans + ban/unban users' },
    { key: 'dm', label: 'Direct messages', icon: 'chat', route: '/chat-admin-dm' as Href, sub: 'All requests, threads, blocks' },
    { key: 'recent', label: 'Recent messages', icon: 'more', route: '/chat-admin-recent' as Href, sub: 'Latest activity across every channel' },
  ]

  const Stat = ({ label, value, color }: { label: string; value: number | string; color: string }) => (
    <View
      style={{
        flex: 1,
        backgroundColor: c.bg2,
        borderColor: c.border,
        borderWidth: 1,
        borderRadius: theme.mono ? 0 : 10,
        padding: SPACE.xl,
      }}
    >
      <Text style={{ color: c.muted, fontSize: FONT.xs, letterSpacing: 1.5, marginBottom: SPACE.xs }}>{label.toUpperCase()}</Text>
      <Text style={{ color, fontSize: FONT.h2, fontWeight: '800' }}>{value}</Text>
    </View>
  )

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
        <Text style={{ color: c.text, fontSize: FONT.card, fontWeight: '800', flex: 1 }}>Chat admin</Text>
        <Btn title="Refresh" onPress={() => { setLoading(true); load() }} style={{ paddingVertical: 7, paddingHorizontal: SPACE.xl }} />
      </View>

      {loading ? (
        <Loader />
      ) : (
        <ScrollView contentContainerStyle={{ padding: SPACE.xl, paddingBottom: SPACE.colossal }}>
          {err ? <Muted style={{ marginBottom: SPACE.lg }}>{err}</Muted> : null}

          <View style={{ flexDirection: 'row', gap: SPACE.md, marginBottom: SPACE.md }}>
            <Stat label="Rooms" value={stats?.rooms?.total ?? 0} color={c.accent} />
            <Stat label="Members" value={stats?.members ?? 0} color={c.text} />
            <Stat label="Messages" value={stats?.messages ?? 0} color={c.star} />
          </View>
          <View style={{ flexDirection: 'row', gap: SPACE.md, marginBottom: SPACE.xxxl }}>
            <Stat label="Mutes" value={stats?.mutes ?? 0} color={c.sale} />
            <Stat label="Bans" value={stats?.bans ?? 0} color={c.danger} />
            <Stat label="DM" value={stats?.dm?.threads ?? 0} color={c.link} />
          </View>
          {stats?.dm?.pending ? (
            <Muted style={{ marginBottom: SPACE.xl }}>⏳ {stats.dm.pending} pending DM request{stats.dm.pending === 1 ? '' : 's'}.</Muted>
          ) : null}

          {sections.map((s) => (
            <TouchableOpacity key={s.key} onPress={() => router.push(s.route)}>
              <Card>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.xl }}>
                  <Icon name={s.icon} size={FONT.h2} color={c.text} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: c.text, fontSize: FONT.base, fontWeight: '700' }}>{s.label}</Text>
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
