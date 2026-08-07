import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, ActivityIndicator, FlatList } from 'react-native'
import { Screen } from '@/src/components/Screen'
import { Card, Title, Muted } from '@/src/components/ui'
import { useTheme } from '@/src/theme'
import { api } from '@/src/lib/api'

interface Post {
  id: string
  title: string
  excerpt?: string
  author_name?: string
  created_at?: string
}

export default function BlogScreen() {
  const { theme } = useTheme()
  const c = theme.colors
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api
      .get('/blog', { params: { limit: 20 } })
      .then((r) => setPosts(Array.isArray(r.data) ? r.data : r.data?.posts ?? []))
      .catch((e) => setError(e?.response?.data?.detail || 'Could not load blog'))
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
      <Title>Blog</Title>
      {error ? (
        <Muted>{error}</Muted>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(p) => p.id}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <TouchableOpacity>
              <Card>
                <Text style={{ color: c.text, fontSize: 14, fontWeight: '700' }}>{item.title}</Text>
                {item.excerpt ? (
                  <Text style={{ color: c.text2, fontSize: 12, marginTop: 6 }} numberOfLines={3}>
                    {item.excerpt}
                  </Text>
                ) : null}
                <View style={{ marginTop: 6 }}>
                  <Muted>{item.author_name ?? ''}</Muted>
                </View>
              </Card>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Muted>No posts yet.</Muted>}
        />
      )}
    </Screen>
  )
}
