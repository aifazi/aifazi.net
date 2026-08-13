import { useEffect, useState, useCallback } from 'react'
import { FONT, SPACE, frameworkStyles } from '@/src/design'
import { View, Text, TouchableOpacity, FlatList, RefreshControl } from 'react-native'
import { useRouter , useFocusEffect } from 'expo-router'
import type { Href } from 'expo-router'
import { Image as ExpoImage } from 'expo-image'
import { Screen } from '@/src/components/Screen'
import { Card, Title, Muted, EmptyState } from '@/src/components/ui'
import { useTheme } from '@/src/theme'
import { api } from '@/src/lib/api'
import { Icon } from '@/src/components/icon'
import { Loader } from '@/src/components/Loader'
import { Reveal, stagger } from '@/src/components/motion'

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
  const radius = frameworkStyles(theme).radius
  const pillRadius = frameworkStyles(theme).buttonRadius
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
      <Reveal dir="up" duration={420}>
        <Title tag="BLOG">Blog</Title>
      </Reveal>
      {cats.length > 0 ? (
        <Reveal dir="up" delay={120} duration={520}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.md, marginBottom: SPACE.xl }}>
          <Reveal dir="scale" delay={stagger(0)} duration={420}>
          <TouchableOpacity
            onPress={() => setCat('')}
            style={{
              paddingHorizontal: SPACE.xl,
              paddingVertical: SPACE.sm,
              borderRadius: pillRadius,
              borderWidth: 1,
              borderColor: cat === '' ? c.accent : c.border,
              backgroundColor: cat === '' ? c.accent2 : 'transparent',
            }}
          >
            <Text style={{ color: cat === '' ? c.onAccent : c.text, fontSize: FONT.md, fontWeight: '700' }}>All</Text>
          </TouchableOpacity>
          </Reveal>
          {cats.map((x, i) => (
            <Reveal key={x} dir="scale" delay={stagger(i + 1)} duration={420}>
            <TouchableOpacity
              onPress={() => setCat(x)}
              style={{
                paddingHorizontal: SPACE.xl,
                paddingVertical: SPACE.sm,
                borderRadius: pillRadius,
                borderWidth: 1,
                borderColor: cat === x ? c.accent : c.border,
                backgroundColor: cat === x ? c.accent2 : 'transparent',
              }}
            >
              <Text style={{ color: cat === x ? c.onAccent : c.text, fontSize: FONT.md, fontWeight: '700' }}>{x}</Text>
            </TouchableOpacity>
            </Reveal>
          ))}
        </View>
        </Reveal>
      ) : null}
      {error ? <Reveal dir="scale" delay={stagger(0)} duration={480}><Muted>{error}</Muted></Reveal> : null}

      <FlatList
        data={posts}
        keyExtractor={(p) => p.id}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} colors={[c.accent]} progressBackgroundColor={c.bg2} />
        }
        renderItem={({ item, index }) => (
          <Reveal dir="scale" delay={stagger(index)} duration={420}>
            <Card onPress={() => router.push(`/blog-post?slug=${encodeURIComponent(item.slug)}` as Href)}>
              {item.cover_image ? (
                <ExpoImage source={{ uri: item.cover_image }} style={{ width: '100%', height: 150, borderRadius: radius, marginBottom: SPACE.lg }} contentFit="cover" transition={150} />
              ) : null}
              <Text style={{ color: c.text, fontSize: FONT.card, fontWeight: '800' }} numberOfLines={2}>{item.title}</Text>
              {item.excerpt ? (
                <Text style={{ color: c.text2, fontSize: FONT.md, marginTop: SPACE.sm, lineHeight: 17 }} numberOfLines={3}>{item.excerpt}</Text>
              ) : null}
              <View style={{ flexDirection: 'row', marginTop: SPACE.md, gap: SPACE.lg }}>
                <Muted>{item.author_name ?? 'Admin'}</Muted>
                <Muted>{fmtDate(item.created_at)}</Muted>
                {item.category ? <Muted>{item.category}</Muted> : null}
                {item.views ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Icon name="eye" size={12} color={c.muted} />
                    <Muted>{item.views}</Muted>
                  </View>
                ) : null}
              </View>
            </Card>
          </Reveal>
        )}
        ListEmptyComponent={
          <EmptyState
            icon="blog"
            title="No posts yet"
            subtitle="Articles will appear here once published."
          />
        }
      />
    </Screen>
  )
}