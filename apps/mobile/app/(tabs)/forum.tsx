import { useEffect, useState, useCallback } from 'react'
import { View, Text, TouchableOpacity, ActivityIndicator, FlatList, RefreshControl } from 'react-native'
import { useRouter } from 'expo-router'
import type { Href } from 'expo-router'
import { useFocusEffect } from 'expo-router'
import { Screen } from '@/src/components/Screen'
import { Card, Title, Muted } from '@/src/components/ui'
import { useTheme } from '@/src/theme'
import { api } from '@/src/lib/api'
import { useAuth } from '@/src/lib/auth'

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

export default function ForumScreen() {
  const { theme } = useTheme()
  const c = theme.colors
  const router = useRouter()
  const { isAuthed } = useAuth()
  const [threads, setThreads] = useState<Thread[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [cat, setCat] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    api
      .get('/forum/threads', { params: cat ? { category_id: cat, limit: 25 } : { limit: 25 } })
      .then((r) => setThreads(((r.data?.threads ?? r.data ?? []) as Thread[])))
      .catch((e) => setError(e?.response?.data?.detail || 'Could not load forum'))
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
      .get('/forum/categories')
      .then((r) => setCategories((r.data ?? []) as Category[]))
      .catch(() => setCategories([]))
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
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Title>Forum</Title>
        <TouchableOpacity
          onPress={() => router.push(isAuthed ? '/forum-new' : '/auth/login')}
          style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: theme.mono ? 0 : 8, backgroundColor: c.accent, marginBottom: 12 }}
        >
          <Text style={{ color: theme.dark ? '#000' : '#fff', fontSize: 13, fontWeight: '700' }}>+ New thread</Text>
        </TouchableOpacity>
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
            <Text style={{ color: cat === '' ? '#001018' : c.text, fontSize: 12, fontWeight: '700' }}>All</Text>
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
              <Text style={{ color: cat === (x._id || x.id) ? '#001018' : c.text, fontSize: 12, fontWeight: '700' }}>
                {x.icon ?? ''} {x.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
      {error ? <Muted>{error}</Muted> : null}

      <FlatList
        data={threads}
        keyExtractor={(t) => t.id || t._id}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} colors={[c.accent]} progressBackgroundColor={c.bg2} />
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
      />
    </Screen>
  )
}