import { useEffect, useState, useCallback } from 'react'
import { View, Text, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Card, Muted, Btn } from '@/src/components/ui'
import { useTheme } from '@/src/theme'
import { useAuth } from '@/src/lib/auth'
import { api } from '@/src/lib/api'
import { useOverlay } from '@/src/components/overlay'

interface DMRequest {
  id: string
  sender: string
  recipient: string
  status: string
  created_at?: string
  sender_role?: string
  recipient_role?: string
}

interface DMThread {
  id: string
  party_a: string
  party_b: string
  message_count?: number
  last_message_at?: string
  a_role?: string
  b_role?: string
}

interface DMBlock {
  id: string
  blocker?: string
  blocked?: string
  created_at?: string
}

type Tab = 'requests' | 'threads' | 'blocks'

const STATUS_COLOR: Record<string, string> = { pending: '#facc15', accepted: '#22d3ee', rejected: '#ff6b35' }

export default function ChatAdminDMScreen() {
  const { theme } = useTheme()
  const c = theme.colors
  const router = useRouter()
  const { user } = useAuth()
  const [tab, setTab] = useState<Tab>('requests')
  const [requests, setRequests] = useState<DMRequest[]>([])
  const [threads, setThreads] = useState<DMThread[]>([])
  const [blocks, setBlocks] = useState<DMBlock[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const { confirm } = useOverlay()

  const isStaff = user?.role === 'admin' || user?.role === 'moderator'

  const load = useCallback(() => {
    api
      .get('/chat/admin/dm/requests')
      .then((r) => setRequests((r.data ?? []) as DMRequest[]))
      .catch((e) => setErr(e?.response?.data?.detail || 'Could not load DM data'))
    api
      .get('/chat/admin/dm/threads')
      .then((r) => setThreads((r.data ?? []) as DMThread[]))
      .catch(() => setThreads([]))
    api
      .get('/chat/admin/dm/blocks')
      .then((r) => setBlocks((r.data ?? []) as DMBlock[]))
      .catch(() => setBlocks([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (isStaff) load()
  }, [isStaff, load])

  const act = async (title: string, body: string, onConfirm: () => Promise<void>) => {
    const ok = await confirm({ title, message: body, confirmText: 'Confirm', destructive: true })
    if (!ok) return
    try {
      await onConfirm()
    } catch (e: any) {
      setErr(e?.response?.data?.detail || 'Action failed')
    }
  }

  const accept = (r: DMRequest) =>
    act('Accept request', `Accept the DM from ${r.sender} to ${r.recipient}?`, async () => {
      await api.post(`/chat/admin/dm/requests/${r.id}/accept`)
      load()
    })

  const reject = (r: DMRequest) =>
    act('Reject request', `Reject the DM from ${r.sender} to ${r.recipient}?`, async () => {
      await api.post(`/chat/admin/dm/requests/${r.id}/reject`)
      load()
    })

  const del = (r: DMRequest) =>
    act('Delete request', `Delete the DM request from ${r.sender} to ${r.recipient}?`, async () => {
      await api.delete(`/chat/admin/dm/requests/${r.id}`)
      load()
    })

  const unblock = (b: DMBlock) =>
    act('Unblock', `Unblock ${b.blocked || 'this user'}?`, async () => {
      await api.delete(`/chat/admin/dm/blocks/${b.id}`)
      load()
    })

  if (!isStaff) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top', 'bottom']}>
        <Muted style={{ textAlign: 'center', marginTop: 40 }}>Staff only.</Muted>
      </SafeAreaView>
    )
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: 'requests', label: `Requests (${requests.length})` },
    { key: 'threads', label: `Threads (${threads.length})` },
    { key: 'blocks', label: `Blocks (${blocks.length})` },
  ]

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
        <Text style={{ color: c.text, fontSize: 15, fontWeight: '800', flex: 1 }}>DM admin</Text>
        <Btn title="Refresh" onPress={() => { setLoading(true); load() }} style={{ paddingVertical: 7, paddingHorizontal: 12 }} />
      </View>

      <View style={{ flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8, gap: 8 }}>
        {TABS.map((t) => (
          <TouchableOpacity
            key={t.key}
            onPress={() => setTab(t.key)}
            style={{
              flex: 1,
              paddingVertical: 8,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: tab === t.key ? c.accent : c.border,
              backgroundColor: tab === t.key ? c.accent2 : 'transparent',
              alignItems: 'center',
            }}
          >
            <Text style={{ color: tab === t.key ? '#001018' : c.text, fontWeight: '700', fontSize: 12 }} numberOfLines={1}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
      ) : tab === 'requests' ? (
        <FlatList
          data={requests}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
          ListHeaderComponent={err ? <Muted style={{ marginBottom: 8 }}>{err}</Muted> : null}
          ListEmptyComponent={<Muted style={{ textAlign: 'center', marginTop: 30 }}>No DM requests.</Muted>}
          renderItem={({ item }) => (
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.text, fontSize: 14, fontWeight: '700' }} numberOfLines={1}>
                    {item.sender} → {item.recipient}
                  </Text>
                  <Muted numberOfLines={1}>
                    {item.status.toUpperCase()} · {item.created_at ? new Date(item.created_at).toLocaleString() : ''}
                  </Muted>
                </View>
                <Text style={{ color: STATUS_COLOR[item.status] || c.muted, fontWeight: '800', fontSize: 11 }}>
                  {item.status.toUpperCase()}
                </Text>
              </View>
              {item.status === 'pending' ? (
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                  <Btn title="Accept" onPress={() => accept(item)} style={{ flex: 1, paddingVertical: 8 }} />
                  <Btn title="Reject" onPress={() => reject(item)} style={{ flex: 1, paddingVertical: 8, backgroundColor: c.danger }} />
                </View>
              ) : null}
              <TouchableOpacity onPress={() => del(item)} hitSlop={8} style={{ marginTop: 8 }}>
                <Text style={{ color: c.danger, fontWeight: '700', fontSize: 12 }}>Delete request</Text>
              </TouchableOpacity>
            </Card>
          )}
        />
      ) : tab === 'threads' ? (
        <FlatList
          data={threads}
          keyExtractor={(t) => t.id}
          contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
          ListHeaderComponent={err ? <Muted style={{ marginBottom: 8 }}>{err}</Muted> : null}
          ListEmptyComponent={<Muted style={{ textAlign: 'center', marginTop: 30 }}>No DM threads.</Muted>}
          renderItem={({ item }) => (
            <Card>
              <Text style={{ color: c.text, fontSize: 14, fontWeight: '700' }} numberOfLines={1}>
                {item.party_a} ⬌ {item.party_b}
              </Text>
              <Muted numberOfLines={1}>
                {item.message_count ?? 0} messages · last {item.last_message_at ? new Date(item.last_message_at).toLocaleString() : '—'}
              </Muted>
            </Card>
          )}
        />
      ) : (
        <FlatList
          data={blocks}
          keyExtractor={(b) => b.id}
          contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
          ListHeaderComponent={err ? <Muted style={{ marginBottom: 8 }}>{err}</Muted> : null}
          ListEmptyComponent={<Muted style={{ textAlign: 'center', marginTop: 30 }}>No DM blocks.</Muted>}
          renderItem={({ item }) => (
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.text, fontSize: 14, fontWeight: '700' }} numberOfLines={1}>
                    {item.blocked || '—'}
                  </Text>
                  <Muted numberOfLines={1}>
                    {item.blocker ? `blocked by ${item.blocker}` : ''}
                    {item.created_at ? ` · ${new Date(item.created_at).toLocaleString()}` : ''}
                  </Muted>
                </View>
                <Btn title="Unblock" onPress={() => unblock(item)} style={{ paddingVertical: 7, paddingHorizontal: 12 }} />
              </View>
            </Card>
          )}
        />
      )}
    </SafeAreaView>
  )
}
