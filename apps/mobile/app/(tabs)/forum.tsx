import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, ActivityIndicator, FlatList } from 'react-native'
import { Screen } from '@/src/components/Screen'
import { Card, Title, Muted } from '@/src/components/ui'
import { useTheme } from '@/src/theme'
import { api } from '@/src/lib/api'

interface Thread {
  id: string
  title: string
  author_name?: string
  reply_count?: number
  created_at?: string
}

export default function ForumScreen() {
  const { theme } = useTheme()
  const c = theme.colors
  const [threads, setThreads] = useState<Thread[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api
      .get('/forum/threads', { params: { limit: 25 } })
      .then((r) => setThreads(Array.isArray(r.data) ? r.data : r.data?.items ?? []))
      .catch((e) => setError(e?.response?.data?.detail || 'Could not load forum'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <Screen>
        <ActivityIndicator color={c.accent} style={{ marginTop: 60 }} />
      </Screen>
    )
  }

  return (
    <Screen scroll={false}>
      <Title>Forum</Title>
      {error ? (
        <Muted>{error}</Muted>
      ) : (
        <FlatList
          data={threads}
          keyExtractor={(t) => t.id}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <TouchableOpacity>
              <Card>
                <Text style={{ color: c.text, fontSize: 14, fontWeight: '700' }}>{item.title}</Text>
                <View style={{ flexDirection: 'row', marginTop: 6, gap: 12 }}>
                  <Muted>{item.author_name ?? 'anonymous'}</Muted>
                  <Muted>💬 {item.reply_count ?? 0}</Muted>
                </View>
              </Card>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Muted>No threads yet.</Muted>}
        />
      )}
    </Screen>
  )
}
