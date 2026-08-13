import { useEffect, useState, useCallback } from 'react'
import { FONT, SPACE, frameworkStyles } from '@/src/design'
import { View, Text, TouchableOpacity, FlatList, RefreshControl, TextInput } from 'react-native'
import { useRouter, useFocusEffect } from 'expo-router'
import type { Href } from 'expo-router'
import { Screen } from '@/src/components/Screen'
import { Card, Title, Muted, CategoryPills, EmptyState } from '@/src/components/ui'
import { useTheme } from '@/src/theme'
import { api } from '@/src/lib/api'
import { useAuth } from '@/src/lib/auth'
import { Icon } from '@/src/components/icon'
import { Loader } from '@/src/components/Loader'
import { Reveal, stagger } from '@/src/components/motion'

interface ThreadAuthor {
  username: string
  avatar?: string
  role?: string
}

interface ThreadCategory {
  _id?: string
  id?: string
  name?: string
  icon?: string
  color?: string
  slug?: string
}

interface Thread {
  _id: string
  id: string
  title: string
  pinned?: boolean
  locked?: boolean
  views?: number
  replyCount?: number
  likes?: number
  createdAt?: string
  lastReplyAt?: string
  author?: ThreadAuthor
  category?: ThreadCategory
}

interface Category {
  _id: string
  id: string
  name: string
  description?: string
  icon?: string
  color?: string
  threadCount?: number
}

interface ThreadsPage {
  threads: Thread[]
  total: number
  pages: number
  page: number
}

const PAGE_SIZE = 20

export default function ForumScreen() {
  const { theme } = useTheme()
  const c = theme.colors
  const pillRadius = frameworkStyles(theme).buttonRadius
  const router = useRouter()
  const { isAuthed } = useAuth()
  const [threads, setThreads] = useState<Thread[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [cat, setCat] = useState<string>('')
  const [sort, setSort] = useState<'new' | 'top'>('new')
  const [input, setInput] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  // debounced search
  useEffect(() => {
    const t = setTimeout(() => setQ(input.trim()), 400)
    return () => clearTimeout(t)
  }, [input])

  const load = useCallback((targetPage: number, append = false) => {
    if (targetPage > 1) setLoadingMore(true)
    else if (!append) setLoading(true)
    api
      .get('/forum/threads', {
        params: {
          limit: PAGE_SIZE,
          page: targetPage,
          sort,
          search: q || undefined,
          category_id: cat || undefined,
        },
      })
      .then((r) => {
        const d = (r.data ?? { threads: [] }) as ThreadsPage
        const rows = d.threads ?? []
        setThreads((prev) => (append ? [...prev, ...rows] : rows))
        setPages(d.pages ?? 1)
        setPage(targetPage)
        setError('')
      })
      .catch((e) => setError(e?.response?.data?.detail || 'Could not load forum'))
      .finally(() => { setLoading(false); setLoadingMore(false); setRefreshing(false) })
  }, [cat, q, sort])

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    load(1)
  }, [load])

  const loadMore = () => {
    if (page < pages && !loadingMore) load(page + 1, true)
  }

  useFocusEffect(
    useCallback(() => {
      load(1)
    }, [load]),
  )

  useEffect(() => {
    api
      .get('/forum/categories')
      .then((r) => setCategories((r.data ?? []) as Category[]))
      .catch(() => setCategories([]))
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
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Title tag="FORUM">Forum</Title>
        <TouchableOpacity
          onPress={() => router.push(isAuthed ? '/forum-new' : '/auth/login')}
          style={{ paddingHorizontal: SPACE.xxl, paddingVertical: SPACE.md, borderRadius: pillRadius, backgroundColor: c.accent, marginBottom: SPACE.xl }}
        >
          <Text style={{ color: c.onAccent, fontSize: FONT.body, fontWeight: '700' }}>+ New thread</Text>
        </TouchableOpacity>
      </View>
      </Reveal>

      <FlatList
        data={threads}
        keyExtractor={(t) => t.id || t._id}
        showsVerticalScrollIndicator={false}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} colors={[c.accent]} progressBackgroundColor={c.bg2} />
        }
        ListHeaderComponent={
          <Reveal dir="up" delay={120} duration={520}>
          <>
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder="Search threads…"
              placeholderTextColor={c.muted}
              style={{
                backgroundColor: c.bg,
                borderColor: c.border,
                color: c.text,
                borderWidth: 1,
                borderRadius: theme.mono ? 0 : 8,
                paddingHorizontal: SPACE.xl,
                paddingVertical: SPACE.md,
                fontSize: FONT.body,
                fontFamily: theme.mono ? 'monospace' : undefined,
                marginBottom: SPACE.lg,
              }}
            />

            <View style={{ marginBottom: SPACE.xl }}>
              <CategoryPills
                items={[{ key: 'new', label: 'New' }, { key: 'top', label: 'Top' }]}
                active={sort}
                onSelect={setSort}
              />
            </View>

            {categories.length > 0 ? (
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
                {categories.map((x, i) => (
                  <Reveal key={x._id || x.id} dir="scale" delay={stagger(i + 1)} duration={420}>
                  <TouchableOpacity
                    onPress={() => setCat(x._id || x.id)}
                    style={{
                      paddingHorizontal: SPACE.xl,
                      paddingVertical: SPACE.sm,
                      borderRadius: pillRadius,
                      borderWidth: 1,
                      borderColor: cat === (x._id || x.id) ? c.accent : c.border,
                      backgroundColor: cat === (x._id || x.id) ? c.accent2 : 'transparent',
                    }}
                  >
                    <Text style={{ color: cat === (x._id || x.id) ? c.onAccent : c.text, fontSize: FONT.md, fontWeight: '700' }}>
                      {x.icon ?? ''} {x.name}
                    </Text>
                  </TouchableOpacity>
                  </Reveal>
                ))}
              </View>
            ) : null}
            {error ? <Muted style={{ marginBottom: SPACE.lg }}>{error}</Muted> : null}
          </>
          </Reveal>
        }
        renderItem={({ item, index }) => (
          <Reveal dir="scale" delay={stagger(index)} duration={420}>
            <Card onPress={() => router.push(`/forum-thread?id=${encodeURIComponent(item.id)}` as Href)}>
              {item.category?.icon ? <Text style={{ fontSize: FONT.card, marginBottom: SPACE.xs }}>{item.category.icon} {item.category.name}</Text> : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                {item.pinned ? <Icon name="pin" size={14} color={c.text2} /> : null}
                {item.locked ? <Icon name="lock" size={14} color={c.text2} /> : null}
                <Text style={{ color: c.text, fontSize: FONT.base, fontWeight: '700', flexShrink: 1 }} numberOfLines={2}>
                  {item.title}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', marginTop: SPACE.sm, gap: SPACE.xl }}>
                <Muted>{item.author?.username ?? 'anonymous'}</Muted>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Icon name="chat" size={12} color={c.muted} />
                  <Muted>{item.replyCount ?? 0}</Muted>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Icon name="eye" size={12} color={c.muted} />
                  <Muted>{item.views ?? 0}</Muted>
                </View>
                {item.likes ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Icon name="heart" size={12} color={c.muted} />
                    <Muted>{item.likes}</Muted>
                  </View>
                ) : null}
              </View>
            </Card>
          </Reveal>
        )}
        ListEmptyComponent={
          <EmptyState
            icon="forum"
            title="No threads yet"
            subtitle="Be the first to start a discussion."
          />
        }
        ListFooterComponent={
          loadingMore ? (
            <View style={{ paddingVertical: SPACE.xxl, alignItems: 'center' }}>
              <Loader />
            </View>
          ) : page >= pages && threads.length > 0 ? (
            <Muted style={{ textAlign: 'center', paddingVertical: SPACE.xxl }}>· · ·</Muted>
          ) : null
        }
      />
    </Screen>
  )
}
