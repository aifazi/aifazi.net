import { useEffect, useState } from 'react'
import { FONT, SPACE } from '@/src/design'
import { View, Text, TextInput, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import type { Href } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Card, Muted, Btn } from '@/src/components/ui'
import { Avatar } from '@/src/components/Avatar'
import { Icon } from '@/src/components/icon'
import { useTheme } from '@/src/theme'
import { api } from '@/src/lib/api'
import { Reveal, stagger } from '@/src/components/motion'

interface UserHit {
  username: string
  avatar?: string
  role?: string
}

export default function DMNewScreen() {
  const { theme } = useTheme()
  const c = theme.colors
  const router = useRouter()
  const [q, setQ] = useState('')
  const [results, setResults] = useState<UserHit[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [statuses, setStatuses] = useState<Record<string, string>>({})

  useEffect(() => {
    loadBrowse()
  }, [])

  const loadBrowse = async () => {
    try {
      const r = await api.get('/chat/dm/users')
      setResults((r.data ?? []) as UserHit[])
      setErr('')
    } catch (e: any) {
      setErr(e?.response?.data?.detail || 'Could not load users')
    }
  }

  const search = async (query: string) => {
    setQ(query)
    if (!query.trim()) {
      loadBrowse()
      return
    }
    try {
      const r = await api.get('/chat/dm/users/search', { params: { q: query.trim() } })
      setResults((r.data ?? []) as UserHit[])
      setErr('')
    } catch (e: any) {
      setErr(e?.response?.data?.detail || 'Search failed')
    }
  }

  const choose = async (u: UserHit) => {
    if (statuses[u.username]) return
    setBusy(true)
    try {
      const r = await api.post('/chat/dm/threads', { username: u.username })
      const t = r.data ?? {}
      router.replace(`/dm-thread?thread_id=${t.id}&peer=${encodeURIComponent(t.peer)}` as Href)
    } catch (e: any) {
      const status = e?.response?.status
      if (status === 403) {
        // No established thread — ask to start a DM.
        try {
          const rr = await api.post('/chat/dm/requests', { username: u.username })
          const st = rr.data?.status ?? 'pending'
          setStatuses((s) => ({ ...s, [u.username]: st === 'accepted' ? 'accepted' : 'request sent' }))
          if (st === 'accepted' && rr.data?.thread_id) {
            router.replace(`/dm-thread?thread_id=${rr.data.thread_id}&peer=${encodeURIComponent(u.username)}` as Href)
          }
        } catch (e2: any) {
          setErr(e2?.response?.data?.detail || 'Could not start a DM')
        }
      } else {
        setErr(e?.response?.data?.detail || 'Could not start a DM')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <Reveal dir="up" duration={420}>
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
        <Text style={{ color: c.text, fontSize: FONT.card, fontWeight: '800' }}>New message</Text>
      </View>
      </Reveal>

      <Reveal dir="up" delay={120} duration={520}>
      <View style={{ padding: SPACE.xl }}>
        <TextInput
          value={q}
          onChangeText={search}
          placeholder="Search users…"
          placeholderTextColor={c.muted}
          autoCapitalize="none"
          autoCorrect={false}
          style={{
            backgroundColor: c.bg2,
            color: c.text,
            borderColor: c.border,
            borderWidth: 1,
            borderRadius: 8,
            paddingHorizontal: SPACE.xl,
            paddingVertical: SPACE.lg,
            fontSize: FONT.base,
          }}
        />
      </View>
      </Reveal>

      {err ? (
        <Reveal dir="scale" delay={stagger(0)} duration={480}>
        <View style={{ paddingHorizontal: SPACE.xl }}>
          <Muted>{err}</Muted>
        </View>
        </Reveal>
      ) : null}

      <FlatList
        data={results}
        keyExtractor={(u) => u.username}
        contentContainerStyle={{ paddingHorizontal: SPACE.xl }}
        ListEmptyComponent={
          <Muted style={{ textAlign: 'center', marginTop: SPACE.jumbo }}>{q.trim() ? 'No users found.' : 'No users yet.'}</Muted>
        }
        renderItem={({ item, index }) => (
          <Reveal dir="scale" delay={stagger(index)} duration={420}>
          <Card style={{ paddingVertical: SPACE.lg }}>
            <TouchableOpacity
              onPress={() => choose(item)}
              disabled={busy}
              style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.lg }}
            >
              <Avatar name={item.username} avatar={item.avatar} size={30} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.text, fontSize: FONT.base, fontWeight: '700' }}>{item.username}</Text>
                {item.role ? <Muted>{item.role}</Muted> : null}
              </View>
              <Btn
                title={statuses[item.username] === 'accepted' ? 'Open' : statuses[item.username] || 'Message'}
                onPress={() => choose(item)}
                disabled={busy || !!statuses[item.username]}
                style={{ paddingVertical: 7, paddingHorizontal: SPACE.xl }}
              />
            </TouchableOpacity>
          </Card>
          </Reveal>
        )}
      />
    </SafeAreaView>
  )
}
