import { useEffect, useState, useCallback } from 'react'
import { View, Text, TouchableOpacity, FlatList, RefreshControl } from 'react-native'
import { useRouter , useFocusEffect } from 'expo-router'
import type { Href } from 'expo-router'
import { Image as ExpoImage } from 'expo-image'
import { Screen } from '@/src/components/Screen'
import { Card, Title, Muted } from '@/src/components/ui'
import { useTheme } from '@/src/theme'
import { api } from '@/src/lib/api'
import { Loader } from '@/src/components/Loader'

interface Post {
  id: string
  title: string
  slug: string
  excerpt?: string
  cover_image?: string
  author_name?: string
  category?: string
  created_at?: string
  views?: number
  published?: boolean
}

function fmtDate(iso?: string) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}

export default function BlogScreen() {
  const { theme } = useTheme()
  const c = theme.colors
  const router = useRouter()
  const [posts, setPosts] = useState<Post[]>([])
  const [cats, setCats] = useState<string[]>([])
  const [cat, setCat] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    api
      .get('/blog', { params: cat ? { category: cat, limit: 20 } : { limit: 20 } })
      .then((r) => setPosts((r.data?.posts ?? []) as Post[]))
      .catch((e) => setError(e?.response?.data?.detail || 'Could not load blog'))
      .finally(() => { setLoading(false); setRefreshing(false) })
  }, [cat])

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    load()
  }, [load])

  useFocusEffect(
    useCallback(() => {
      load()
    }, [load]),
  )

  useEffect(() => {
    api
      .get('/blog/meta/categories')
      .then((r) => setCats((r.data?.categories ?? []) as string[]))
      .catch(() => setCats([]))
  }, [])

  if (loading) {
    return (
      <Screen>
        <Loader />
      </Screen>
    )
  }

  return (
    <Screen scroll={false}>
      <Title>Blog</Title>
      {cats.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          <TouchableOpacity
            onPress={() => setCat('')}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: cat === '' ? c.accent : c.border,
              backgroundColor: cat === '' ? c.accent2 : 'transparent',
            }}
          >
            <Text style={{ color: cat === '' ? c.onAccent : c.text, fontSize: 12, fontWeight: '700' }}>All</Text>
          </TouchableOpacity>
          {cats.map((x) => (
            <TouchableOpacity
              key={x}
              onPress={() => setCat(x)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: cat === x ? c.accent : c.border,
                backgroundColor: cat === x ? c.accent2 : 'transparent',
              }}
            >
              <Text style={{ color: cat === x ? c.onAccent : c.text, fontSize: 12, fontWeight: '700' }}>{x}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
      {error ? <Muted>{error}</Muted> : null}

      <FlatList
        data={posts}
        keyExtractor={(p) => p.id}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} colors={[c.accent]} progressBackgroundColor={c.bg2} />
        }
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => router.push(`/blog-post?slug=${encodeURIComponent(item.slug)}` as Href)}>
            <Card>
              {item.cover_image ? (
                <ExpoImage source={{ uri: item.cover_image }} style={{ width: '100%', height: 150, borderRadius: 8, marginBottom: 10 }} contentFit="cover" transition={150} />
              ) : null}
              <Text style={{ color: c.text, fontSize: 15, fontWeight: '800' }} numberOfLines={2}>{item.title}</Text>
              {item.excerpt ? (
                <Text style={{ color: c.text2, fontSize: 12, marginTop: 6, lineHeight: 17 }} numberOfLines={3}>{item.excerpt}</Text>
              ) : null}
              <View style={{ flexDirection: 'row', marginTop: 8, gap: 10 }}>
                <Muted>{item.author_name ?? 'Admin'}</Muted>
                <Muted>{fmtDate(item.created_at)}</Muted>
                {item.category ? <Muted>{item.category}</Muted> : null}
                {item.views ? <Muted>👁 {item.views}</Muted> : null}
              </View>
            </Card>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Muted>No posts yet.</Muted>}
      />
    </Screen>
  )
}