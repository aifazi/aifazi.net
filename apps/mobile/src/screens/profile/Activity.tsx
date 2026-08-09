import { useEffect, useState } from 'react'
import { View, Text, ScrollView } from 'react-native'
import { Card, Muted } from '@/src/components/ui'
import { Loader } from '@/src/components/Loader'
import { useTheme } from '@/src/theme'
import { useAuth } from '@/src/lib/auth'
import { api } from '@/src/lib/api'
import { fmtWhen } from './helpers'

interface ThreadRow { id?: string; _id?: string; title?: string; created_at?: string; createdAt?: string }
interface ReplyRow { id?: string; _id?: string; content?: string; body?: string; created_at?: string; createdAt?: string }

export function ActivityTab() {
  const { theme } = useTheme()
  const c = theme.colors
  const { user } = useAuth()
  const [threads, setThreads] = useState<ThreadRow[]>([])
  const [replies, setReplies] = useState<ReplyRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void (async () => {
      const uid = user?.id || user?._id
      if (!uid) { setLoading(false); return }
      try {
        const [t, r] = await Promise.all([
          api.get(`/forum/users/${uid}/threads?limit=10`).catch(() => ({ data: [] })),
          api.get(`/forum/users/${uid}/replies?limit=10`).catch(() => ({ data: [] })),
        ])
        setThreads(Array.isArray(t.data) ? t.data : t.data?.threads || [])
        setReplies(Array.isArray(r.data) ? r.data : r.data?.replies || [])
      } finally {
        setLoading(false)
      }
    })()
  }, [user?.id, user?._id])

  if (loading) {
    return <Loader />
  }

  return (
    <ScrollView keyboardShouldPersistTaps="handled">
      <Card title="Recent Threads" subtitle="FORUM">
        {threads.length === 0 ? (
          <Muted style={{ textAlign: 'center', padding: 12 }}>No threads yet</Muted>
        ) : (
          threads.map((t) => (
            <View key={t.id || t._id} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border }}>
              <Text style={{ color: c.text, fontSize: 13, fontWeight: '600' }}>{t.title}</Text>
              <Muted style={{ fontSize: 10, marginTop: 2 }}>{fmtWhen(t.created_at || t.createdAt)}</Muted>
            </View>
          ))
        )}
      </Card>

      <Card title="Recent Replies" subtitle="FORUM">
        {replies.length === 0 ? (
          <Muted style={{ textAlign: 'center', padding: 12 }}>No replies yet</Muted>
        ) : (
          replies.map((r) => (
            <View key={r.id || r._id} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border }}>
              <Text style={{ color: c.muted, fontSize: 12, lineHeight: 18 }} numberOfLines={2}>{r.content || r.body}</Text>
              <Muted style={{ fontSize: 10, marginTop: 2 }}>{fmtWhen(r.created_at || r.createdAt)}</Muted>
            </View>
          ))
        )}
      </Card>
    </ScrollView>
  )
}