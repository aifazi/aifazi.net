import { useEffect, useState, useCallback } from 'react'
import { View, Text, TouchableOpacity, FlatList, RefreshControl, TextInput } from 'react-native'
import { useRouter, useFocusEffect } from 'expo-router'
import type { Href } from 'expo-router'
import { Screen } from '@/src/components/Screen'
import { Card, Title, Muted, CategoryPills } from '@/src/components/ui'
import { useTheme } from '@/src/theme'
import { api } from '@/src/lib/api'
import { useAuth } from '@/src/lib/auth'
import { Loader } from '@/src/components/Loader'

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
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Title>Forum</Title>
        <TouchableOpacity
          onPress={() => router.push(isAuthed ? '/forum-new' : '/auth/login')}
          style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: theme.mono ? 0 : 8, backgroundColor: c.accent, marginBottom: 12 }}
        >
          <Text style={{ color: c.onAccent, fontSize: 13, fontWeight: '700' }}>+ New thread</Text>
        </TouchableOpacity>
      </View>

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
                paddingHorizontal: 12,
                paddingVertical: 8,
                fontSize: 13,
                fontFamily: theme.mono ? 'monospace' : undefined,
                marginBottom: 10,
              }}
            />

            <View style={{ marginBottom: 12 }}>
              <CategoryPills
                items={[{ key: 'new', label: 'New' }, { key: 'top', label: 'Top' }]}
                active={sort}
                onSelect={setSort}
              />
            </View>

            {categories.length > 0 ? (
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
                {categories.map((x) => (
                  <TouchableOpacity
                    key={x._id || x.id}
                    onPress={() => setCat(x._id || x.id)}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: cat === (x._id || x.id) ? c.accent : c.border,
                      backgroundColor: cat === (x._id || x.id) ? c.accent2 : 'transparent',
                    }}
                  >
                    <Text style={{ color: cat === (x._id || x.id) ? c.onAccent : c.text, fontSize: 12, fontWeight: '700' }}>
                      {x.icon ?? ''} {x.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
            {error ? <Muted style={{ marginBottom: 10 }}>{error}</Muted> : null}
          </>
        }
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => router.push(`/forum-thread?id=${encodeURIComponent(item.id)}` as Href)}>
            <Card>
              {item.category?.icon ? <Text style={{ fontSize: 15, marginBottom: 4 }}>{item.category.icon} {item.category.name}</Text> : null}
              <Text style={{ color: c.text, fontSize: 14, fontWeight: '700' }} numberOfLines={2}>
                {item.pinned ? '📌 ' : ''}{item.locked ? '🔒 ' : ''}{item.title}
              </Text>
              <View style={{ flexDirection: 'row', marginTop: 6, gap: 12 }}>
                <Muted>{item.author?.username ?? 'anonymous'}</Muted>
                <Muted>💬 {item.replyCount ?? 0}</Muted>
                <Muted>👁 {item.views ?? 0}</Muted>
                {item.likes ? <Muted>❤️ {item.likes}</Muted> : null}
              </View>
            </Card>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Muted>No threads yet.</Muted>}
        ListFooterComponent={
          loadingMore ? (
            <View style={{ paddingVertical: 14, alignItems: 'center' }}>
              <Loader />
            </View>
          ) : page >= pages && threads.length > 0 ? (
            <Muted style={{ textAlign: 'center', paddingVertical: 14 }}>· · ·</Muted>
          ) : null
        }
      />
    </Screen>
  )
}
