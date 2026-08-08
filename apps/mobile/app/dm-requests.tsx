import { useEffect, useState, useCallback } from 'react'
import { View, Text, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import type { Href } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Card, Muted, Btn } from '@/src/components/ui'
import { Avatar } from '@/src/components/Avatar'
import { useTheme } from '@/src/theme'
import { api } from '@/src/lib/api'

interface Req {
  id: string
  sender: string
  avatar?: string
  role?: string
  created_at?: string
}

interface Block {
  blocked: string
  created_at?: string
}

export default function DMRequestsScreen() {
  const { theme } = useTheme()
  const c = theme.colors
  const router = useRouter()
  const [requests, setRequests] = useState<Req[]>([])
  const [blocks, setBlocks] = useState<Block[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const load = useCallback(() => {
    api
      .get('/chat/dm/requests')
      .then((r) => setRequests((r.data ?? []) as Req[]))
      .catch(() => setRequests([]))
    api
      .get('/chat/dm/blocks')
      .then((r) => setBlocks((r.data ?? []) as Block[]))
      .catch(() => setBlocks([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const accept = async (r: Req) => {
    try {
      const res = await api.post(`/chat/dm/requests/${r.id}/accept`)
      router.push(`/dm-thread?thread_id=${res.data?.thread_id}&peer=${encodeURIComponent(res.data?.peer ?? r.sender)}` as Href)
    } catch (e: any) {
      setErr(e?.response?.data?.detail || 'Could not accept')
      load()
    }
  }

  const reject = async (r: Req) => {
    try {
      await api.post(`/chat/dm/requests/${r.id}/reject`)
      setRequests((prev) => prev.filter((x) => x.id !== r.id))
    } catch (e: any) {
      setErr(e?.response?.data?.detail || 'Could not reject')
    }
  }

  const unblock = async (b: Block) => {
    try {
      await api.delete(`/chat/dm/blocks/${encodeURIComponent(b.blocked)}`)
      setBlocks((prev) => prev.filter((x) => x.blocked !== b.blocked))
    } catch (e: any) {
      setErr(e?.response?.data?.detail || 'Could not unblock')
    }
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
        <Text style={{ color: c.text, fontSize: 15, fontWeight: '800' }}>Message requests</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={requests}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ padding: 12, paddingBottom: 30 }}
          ListHeaderComponent={
            err ? (
              <Muted style={{ marginBottom: 8 }}>{err}</Muted>
            ) : null
          }
          ListEmptyComponent={
            <View style={{ marginBottom: 24 }}>
              <Muted style={{ textAlign: 'center' }}>No pending requests.</Muted>
            </View>
          }
          renderItem={({ item }) => (
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Avatar name={item.sender} avatar={item.avatar} size={30} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.text, fontSize: 14, fontWeight: '700' }}>{item.sender}</Text>
                  {item.role ? <Muted>{item.role}</Muted> : null}
                </View>
                <Btn title="Accept" onPress={() => accept(item)} style={{ paddingVertical: 7, paddingHorizontal: 12 }} />
                <Btn
                  title="Reject"
                  onPress={() => reject(item)}
                  style={{ paddingVertical: 7, paddingHorizontal: 12, backgroundColor: c.danger }}
                />
              </View>
            </Card>
          )}
          ListFooterComponent={
            <View style={{ marginTop: 24 }}>
              <Text style={{ color: c.text, fontSize: 15, fontWeight: '800', marginBottom: 8 }}>
                Blocked users
              </Text>
              {blocks.length === 0 ? (
                <Muted>No blocked users.</Muted>
              ) : (
                blocks.map((b) => (
                  <View
                    key={b.blocked}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                      paddingVertical: 8,
                      borderBottomWidth: 1,
                      borderBottomColor: c.border,
                    }}
                  >
                    <Text style={{ color: c.text, fontSize: 14, flex: 1 }}>{b.blocked}</Text>
                    <TouchableOpacity onPress={() => unblock(b)} hitSlop={8}>
                      <Text style={{ color: c.accent, fontWeight: '700' }}>Unblock</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </View>
          }
        />
      )}
    </SafeAreaView>
  )
}
