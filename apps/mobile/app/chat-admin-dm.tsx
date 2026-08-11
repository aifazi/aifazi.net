import { useEffect, useState, useCallback } from 'react'
import { FONT, SPACE } from '@/src/design'
import { View, Text, TouchableOpacity, FlatList } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Card, Muted, Btn } from '@/src/components/ui'
import { Icon } from '@/src/components/icon'
import { useTheme } from '@/src/theme'
import { statusTone } from '@/src/lib/color'
import { useAuth } from '@/src/lib/auth'
import { api } from '@/src/lib/api'
import { useOverlay } from '@/src/components/overlay'
import { Loader } from '@/src/components/Loader'

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
        <Muted style={{ textAlign: 'center', marginTop: SPACE.colossal }}>Staff only.</Muted>
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
        <Text style={{ color: c.text, fontSize: FONT.card, fontWeight: '800', flex: 1 }}>DM admin</Text>
        <Btn title="Refresh" onPress={() => { setLoading(true); load() }} style={{ paddingVertical: 7, paddingHorizontal: SPACE.xl }} />
      </View>

      <View style={{ flexDirection: 'row', paddingHorizontal: SPACE.xl, paddingVertical: SPACE.md, gap: SPACE.md }}>
        {TABS.map((t) => (
          <TouchableOpacity
            key={t.key}
            onPress={() => setTab(t.key)}
            style={{
              flex: 1,
              paddingVertical: SPACE.md,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: tab === t.key ? c.accent : c.border,
              backgroundColor: tab === t.key ? c.accent2 : 'transparent',
              alignItems: 'center',
            }}
          >
            <Text style={{ color: tab === t.key ? c.onAccent : c.text, fontWeight: '700', fontSize: FONT.md }} numberOfLines={1}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <Loader />
      ) : tab === 'requests' ? (
        <FlatList
          data={requests}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ padding: SPACE.xl, paddingBottom: SPACE.colossal }}
          ListHeaderComponent={err ? <Muted style={{ marginBottom: SPACE.md }}>{err}</Muted> : null}
          ListEmptyComponent={<Muted style={{ textAlign: 'center', marginTop: SPACE.jumbo }}>No DM requests.</Muted>}
          renderItem={({ item }) => (
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.lg }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.text, fontSize: FONT.base, fontWeight: '700' }} numberOfLines={1}>
                    {item.sender} → {item.recipient}
                  </Text>
                  <Muted numberOfLines={1}>
                    {item.status.toUpperCase()} · {item.created_at ? new Date(item.created_at).toLocaleString() : ''}
                  </Muted>
                </View>
                <Text style={{ color: statusTone(item.status, c) ?? c.muted, fontWeight: '800', fontSize: FONT.sm }}>
                  {item.status.toUpperCase()}
                </Text>
              </View>
              {item.status === 'pending' ? (
                <View style={{ flexDirection: 'row', gap: SPACE.md, marginTop: SPACE.lg }}>
                  <Btn title="Accept" onPress={() => accept(item)} style={{ flex: 1, paddingVertical: SPACE.md }} />
                  <Btn title="Reject" onPress={() => reject(item)} style={{ flex: 1, paddingVertical: SPACE.md, backgroundColor: c.danger }} />
                </View>
              ) : null}
              <TouchableOpacity onPress={() => del(item)} hitSlop={8} style={{ marginTop: SPACE.md }}>
                <Text style={{ color: c.danger, fontWeight: '700', fontSize: FONT.md }}>Delete request</Text>
              </TouchableOpacity>
            </Card>
          )}
        />
      ) : tab === 'threads' ? (
        <FlatList
          data={threads}
          keyExtractor={(t) => t.id}
          contentContainerStyle={{ padding: SPACE.xl, paddingBottom: SPACE.colossal }}
          ListHeaderComponent={err ? <Muted style={{ marginBottom: SPACE.md }}>{err}</Muted> : null}
          ListEmptyComponent={<Muted style={{ textAlign: 'center', marginTop: SPACE.jumbo }}>No DM threads.</Muted>}
          renderItem={({ item }) => (
            <Card>
              <Text style={{ color: c.text, fontSize: FONT.base, fontWeight: '700' }} numberOfLines={1}>
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
          contentContainerStyle={{ padding: SPACE.xl, paddingBottom: SPACE.colossal }}
          ListHeaderComponent={err ? <Muted style={{ marginBottom: SPACE.md }}>{err}</Muted> : null}
          ListEmptyComponent={<Muted style={{ textAlign: 'center', marginTop: SPACE.jumbo }}>No DM blocks.</Muted>}
          renderItem={({ item }) => (
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.lg }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.text, fontSize: FONT.base, fontWeight: '700' }} numberOfLines={1}>
                    {item.blocked || '—'}
                  </Text>
                  <Muted numberOfLines={1}>
                    {item.blocker ? `blocked by ${item.blocker}` : ''}
                    {item.created_at ? ` · ${new Date(item.created_at).toLocaleString()}` : ''}
                  </Muted>
                </View>
                <Btn title="Unblock" onPress={() => unblock(item)} style={{ paddingVertical: 7, paddingHorizontal: SPACE.xl }} />
              </View>
            </Card>
          )}
        />
      )}
    </SafeAreaView>
  )
}
