import { useEffect, useState, useCallback } from 'react'
import { FONT, SPACE } from '@/src/design'
import { View, Text, TouchableOpacity, FlatList } from 'react-native'
import { useRouter } from 'expo-router'
import type { Href } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Card, Muted, Btn } from '@/src/components/ui'
import { Avatar } from '@/src/components/Avatar'
import { Icon } from '@/src/components/icon'
import { useTheme } from '@/src/theme'
import { api } from '@/src/lib/api'
import { Loader } from '@/src/components/Loader'
import { Reveal, stagger } from '@/src/components/motion'

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
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back" hitSlop={10}>
          <Icon name="back" size={22} color={c.text} />
        </TouchableOpacity>
        <Text style={{ color: c.text, fontSize: FONT.card, fontWeight: '800' }}>Message requests</Text>
      </View>
      </Reveal>

      {loading ? (
        <Loader />
      ) : (
        <FlatList
          data={requests}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ padding: SPACE.xl, paddingBottom: SPACE.jumbo }}
          ListHeaderComponent={
            err ? (
              <Reveal dir="scale" delay={stagger(0)} duration={480}><Muted style={{ marginBottom: SPACE.md }}>{err}</Muted></Reveal>
            ) : null
          }
          ListEmptyComponent={
            <Reveal dir="scale" delay={stagger(0)} duration={480}>
            <View style={{ marginBottom: SPACE.mega }}>
              <Muted style={{ textAlign: 'center' }}>No pending requests.</Muted>
            </View>
            </Reveal>
          }
          renderItem={({ item, index }) => (
            <Reveal dir="scale" delay={stagger(index)} duration={420}>
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.lg }}>
                <Avatar name={item.sender} avatar={item.avatar} size={30} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.text, fontSize: FONT.base, fontWeight: '700' }}>{item.sender}</Text>
                  {item.role ? <Muted>{item.role}</Muted> : null}
                </View>
                <Btn title="Accept" onPress={() => accept(item)} style={{ paddingVertical: 7, paddingHorizontal: SPACE.xl }} />
                <Btn
                  title="Reject"
                  onPress={() => reject(item)}
                  style={{ paddingVertical: 7, paddingHorizontal: SPACE.xl, backgroundColor: c.danger }}
                />
              </View>
            </Card>
            </Reveal>
          )}
          ListFooterComponent={
            <Reveal dir="up" delay={200} duration={520}>
            <View style={{ marginTop: SPACE.mega }}>
              <Text style={{ color: c.text, fontSize: FONT.card, fontWeight: '800', marginBottom: SPACE.md }}>
                Blocked users
              </Text>
              {blocks.length === 0 ? (
                <Muted>No blocked users.</Muted>
              ) : (
                blocks.map((b, i) => (
                  <Reveal key={b.blocked} dir="scale" delay={stagger(i)} duration={420}>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: SPACE.lg,
                      paddingVertical: SPACE.md,
                      borderBottomWidth: 1,
                      borderBottomColor: c.border,
                    }}
                  >
                    <Text style={{ color: c.text, fontSize: FONT.base, flex: 1 }}>{b.blocked}</Text>
                    <TouchableOpacity onPress={() => unblock(b)} hitSlop={8}>
                      <Text style={{ color: c.accent, fontWeight: '700' }}>Unblock</Text>
                    </TouchableOpacity>
                  </View>
                  </Reveal>
                ))
              )}
            </View>
            </Reveal>
          }
        />
      )}
    </SafeAreaView>
  )
}
