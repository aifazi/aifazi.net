import { useEffect, useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import type { Href } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Card, Muted, Btn } from '@/src/components/ui'
import { Avatar } from '@/src/components/Avatar'
import { useTheme } from '@/src/theme'
import { api } from '@/src/lib/api'

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
        <Text style={{ color: c.text, fontSize: 15, fontWeight: '800' }}>New message</Text>
      </View>

      <View style={{ padding: 12 }}>
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
            paddingHorizontal: 12,
            paddingVertical: 10,
            fontSize: 14,
          }}
        />
      </View>

      {err ? (
        <View style={{ paddingHorizontal: 12 }}>
          <Muted>{err}</Muted>
        </View>
      ) : null}

      <FlatList
        data={results}
        keyExtractor={(u) => u.username}
        contentContainerStyle={{ paddingHorizontal: 12 }}
        ListEmptyComponent={
          <Muted style={{ textAlign: 'center', marginTop: 30 }}>{q.trim() ? 'No users found.' : 'No users yet.'}</Muted>
        }
        renderItem={({ item }) => (
          <Card style={{ paddingVertical: 10 }}>
            <TouchableOpacity
              onPress={() => choose(item)}
              disabled={busy}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
            >
              <Avatar name={item.username} avatar={item.avatar} size={30} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.text, fontSize: 14, fontWeight: '700' }}>{item.username}</Text>
                {item.role ? <Muted>{item.role}</Muted> : null}
              </View>
              <Btn
                title={statuses[item.username] === 'accepted' ? 'Open' : statuses[item.username] || 'Message'}
                onPress={() => choose(item)}
                disabled={busy || !!statuses[item.username]}
                style={{ paddingVertical: 7, paddingHorizontal: 12 }}
              />
            </TouchableOpacity>
          </Card>
        )}
      />
    </SafeAreaView>
  )
}
