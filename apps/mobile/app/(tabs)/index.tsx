import { useEffect, useState, useCallback } from 'react'
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, RefreshControl } from 'react-native'
import { useRouter , useFocusEffect } from 'expo-router'
import type { Href } from 'expo-router'
import { Image as ExpoImage } from 'expo-image'
import { useTheme } from '@/src/theme'
import { useAuth } from '@/src/lib/auth'
import { api } from '@/src/lib/api'
import { Btn } from '@/src/components/ui'
import { Avatar } from '@/src/components/Avatar'
import { Icon } from '@/src/components/icon'
import type { IconName } from '@/src/components/icon'
import { Loader } from '@/src/components/Loader'

interface StatusService {
  name: string
  label?: string
  status: string
  uptime_24h?: number
}

interface Product {
  id: string
  name: string
  slug: string
  price?: string | number
  price_cents?: number
  image_url?: string
  on_sale?: boolean
  compare_at?: string | number
  category?: string
}

interface Thread {
  id: string
  title: string
  replyCount?: number
  author?: { username: string }
  category?: { name?: string; icon?: string; color?: string }
}

interface Post {
  id: string
  title: string
  excerpt?: string
  cover_image?: string
  author_name?: string
  slug: string
  category?: string
}

interface Project {
  id: string
  name?: string
  title?: string
  description?: string
  image_url?: string
  status?: string
  display_order?: number
}

interface MonitorStatus {
  overall?: string
  services?: {
    name: string
    label?: string
    status: string
    uptime_24h?: number
  }[]
}

function fmtPrice(p?: Product) {
  const n = p?.price_cents ?? 0
  if (!n) return '$0.00'
  return `$${(n / 100).toFixed(2)}`
}

export default function HomeScreen() {
  const { theme } = useTheme()
  const c = theme.colors
  const router = useRouter()
  const { user, isAuthed } = useAuth()
  const [mon, setMon] = useState<MonitorStatus>({})
  const [products, setProducts] = useState<Product[]>([])
  const [threads, setThreads] = useState<Thread[]>([])
  const [posts, setPosts] = useState<Post[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(() => {
    const onErr = () => setLoadError('Some sections could not load. Pull to refresh.')
    api
      .get('/monitor/status')
      .then((r) => setMon((r.data ?? {}) as MonitorStatus))
      .catch(() => {})
    api
      .get('/store/products', { params: { limit: 6 } })
      .then((r) => setProducts((r.data ?? []) as Product[]))
      .catch(() => setProducts([]))
    api
      .get('/forum/threads', { params: { limit: 5 } })
      .then((r) => setThreads((r.data?.threads ?? []) as Thread[]))
      .catch(onErr)
    api
      .get('/blog', { params: { limit: 5 } })
      .then((r) => setPosts((r.data?.posts ?? []) as Post[]))
      .catch(onErr)
    api
      .get('/portfolio/projects')
      .then((r) => setProjects((r.data ?? []) as Project[]))
      .catch(onErr)
      .finally(() => { setLoading(false); setRefreshing(false) })
  }, [])

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    setLoadError(null)
    load()
  }, [load])

  useFocusEffect(
    useCallback(() => {
      load()
    }, [load]),
  )

  const overall = mon.overall || 'operational'
  const overallColor = overall === 'operational' ? c.accent : overall === 'outage' ? c.danger : c.accent2

  const tiles = [
    { label: 'Store', icon: 'store' as IconName, href: '/store' as Href, tint: c.sale },
    { label: 'Projects', icon: 'rocket' as IconName, href: '/projects' as Href, tint: c.accent2 },
    { label: 'Forum', icon: 'forum' as IconName, href: '/forum' as Href, tint: c.accent },
    { label: 'Blog', icon: 'blog' as IconName, href: '/blog' as Href, tint: c.star },
    { label: 'Chat', icon: 'chat' as IconName, href: '/chat' as Href, tint: c.info },
    { label: 'Profile', icon: 'profile' as IconName, href: '/profile' as Href, tint: c.warning },
  ]

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} colors={[c.accent]} progressBackgroundColor={c.bg2} />
      }
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <Text style={{ color: c.text, fontSize: 24, fontWeight: '800', fontFamily: theme.mono ? 'monospace' : undefined, letterSpacing: theme.mono ? 1 : 0 }}>
          aifazi.net
        </Text>
        {isAuthed ? (
          <TouchableOpacity onPress={() => router.push('/profile' as Href)}>
            <Avatar name={user?.username} avatar={user?.avatar} size={34} />
          </TouchableOpacity>
        ) : (
          <Btn title="Sign in" onPress={() => router.push('/profile' as Href)} style={{ paddingVertical: 7, paddingHorizontal: 12 }} />
        )}
      </View>
      <Text style={{ color: c.muted, fontSize: 12, marginBottom: 16 }}>
        Community platform — mobile client{isAuthed && user ? ` · hi ${user.username}` : ''}
      </Text>

      {loading ? (
        <Loader />
      ) : (
        <>
          {loadError ? (
            <Text style={{ color: c.warning, fontSize: 12, marginBottom: 10 }}>{loadError}</Text>
          ) : null}
          <View style={[styles.grid, { marginBottom: 18 }]}>
            {tiles.map((t) => (
              <TouchableOpacity
                key={t.label}
                onPress={() => router.push(t.href)}
                style={[styles.tile, { borderColor: c.border, backgroundColor: c.bg2 }]}
              >
                <Icon name={t.icon} size={24} color={t.tint} />
                <Text style={{ color: c.text, fontSize: 13, fontWeight: '800', marginTop: 6 }}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={[styles.card, { borderColor: c.border, backgroundColor: c.bg2 }]}>
            <View style={styles.cardHeader}>
              <Text style={{ color: c.text, fontSize: 13, fontWeight: '800' }}>Server status</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: overallColor }} />
                <Text style={{ color: overallColor, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' }}>{overall}</Text>
              </View>
            </View>
            {mon.services ? (
              <View style={{ marginTop: 8 }}>
                {mon.services.slice(0, 6).map((s) => (
                  <View key={s.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}>
                    <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: s.status === 'up' || s.status === 'operational' ? c.accent : s.status === 'down' || s.status === 'outage' ? c.danger : c.accent2 }} />
                    <Text style={{ color: c.text2, fontSize: 12, flex: 1 }} numberOfLines={1}>{s.label || s.name}</Text>
                    <Text style={{ color: c.muted, fontSize: 11 }}>{s.uptime_24h != null ? `${s.uptime_24h}%` : ''}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            <TouchableOpacity onPress={() => router.push('/status' as Href)} hitSlop={8} style={{ marginTop: 10, alignSelf: 'flex-start' }}>
              <Text style={{ color: c.accent, fontSize: 12, fontWeight: '700' }}>Detailed status →</Text>
            </TouchableOpacity>
          </View>

          {projects.length > 0 ? (
            <>
              <SectionTitle title="Our projects" onMore={() => router.push('/projects')} />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 18 }}>
                {projects.map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    onPress={() => router.push('/projects' as Href)}
                    style={[styles.projectTile, { borderColor: c.border, backgroundColor: c.bg3 }]}
                  >
                    {p.image_url ? (
                      <ExpoImage source={{ uri: p.image_url }} style={{ width: '100%', height: 70, borderTopLeftRadius: 10, borderTopRightRadius: 10 }} contentFit="cover" />
                    ) : (
                      <View style={{ height: 56, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 20 }}>🚀</Text>
                      </View>
                    )}
                    <Text style={{ color: c.text, fontSize: 12, fontWeight: '700', padding: 8 }} numberOfLines={2}>
                      {p.name || p.title}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          ) : null}

          {products.length > 0 ? (
            <>
              <SectionTitle title="Store picks" onMore={() => router.push('/store')} />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 18 }}>
                {products.slice(0, 6).map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    onPress={() => router.push(`/store-item?slug=${encodeURIComponent(p.slug)}` as Href)}
                    style={[styles.productTile, { borderColor: c.border, backgroundColor: c.bg2 }]}
                  >
                    {p.image_url ? (
                      <ExpoImage source={{ uri: p.image_url }} style={{ width: '100%', height: 70, borderTopLeftRadius: 10, borderTopRightRadius: 10 }} contentFit="cover" />
                    ) : (
                      <View style={[styles.productArt, { backgroundColor: c.bg3 }]}>
                        <Text style={{ fontSize: 22 }}>🛍️</Text>
                      </View>
                    )}
                    <View style={{ padding: 8 }}>
                      <Text style={{ color: c.text, fontSize: 12, fontWeight: '700' }} numberOfLines={1}>{p.name}</Text>
                      <Text style={{ color: c.accent, fontSize: 12, fontWeight: '800', marginTop: 2 }}>{fmtPrice(p)}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          ) : null}

          {threads.length > 0 ? (
            <>
              <SectionTitle title="Forum threads" onMore={() => router.push('/forum')} />
              <View style={{ marginBottom: 18 }}>
                {threads.slice(0, 4).map((t) => (
                  <TouchableOpacity
                    key={t.id}
                    onPress={() => router.push(`/forum-thread?id=${t.id}` as Href)}
                    style={[styles.listRow, { borderBottomColor: c.border }]}
                  >
                    <Text style={{ color: c.text, fontSize: 13, fontWeight: '700' }} numberOfLines={1}>
                      {t.category?.icon ? `${t.category.icon} ` : ''}{t.title}
                    </Text>
                    <Text style={{ color: c.muted, fontSize: 11, marginTop: 2 }}>
                      {t.author?.username || '—'} · 💬 {t.replyCount ?? 0}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          ) : null}

          {posts.length > 0 ? (
            <>
              <SectionTitle title="Blog" onMore={() => router.push('/blog')} />
              <View>
                {posts.slice(0, 4).map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    onPress={() => router.push(`/blog-post?slug=${encodeURIComponent(p.slug)}` as Href)}
                    style={[styles.listRow, { borderBottomColor: c.border }]}
                  >
                    <Text style={{ color: c.text, fontSize: 13, fontWeight: '700' }} numberOfLines={1}>{p.title}</Text>
                    <Text style={{ color: c.muted, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
                      {p.author_name ?? ''}{p.category ? ` · ${p.category}` : ''}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          ) : null}
        </>
      )}
    </ScrollView>
  )
}

function SectionTitle({ title, onMore }: { title: string; onMore: () => void }) {
  const { theme } = useTheme()
  const c = theme.colors
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
      <Text style={{ color: c.text, fontSize: 15, fontWeight: '800' }}>{title}</Text>
      <TouchableOpacity onPress={onMore} hitSlop={8}>
        <Text style={{ color: c.accent, fontSize: 12, fontWeight: '700' }}>See all →</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  tile: {
    width: '30%',
    aspectRatio: 1,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 18,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  projectTile: {
    width: 150,
    borderRadius: 10,
    borderWidth: 1,
    marginRight: 10,
    overflow: 'hidden',
  },
  productTile: {
    width: 140,
    borderRadius: 10,
    borderWidth: 1,
    marginRight: 10,
    overflow: 'hidden',
  },
  productArt: {
    height: 70,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
})