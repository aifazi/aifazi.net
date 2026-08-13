import { useState, useCallback, useRef } from 'react'
import { FONT, SPACE, frameworkStyles, micro } from '@/src/design'
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, RefreshControl, Animated } from 'react-native'
import { useRouter , useFocusEffect } from 'expo-router'
import type { Href } from 'expo-router'
import { Image as ExpoImage } from 'expo-image'
import { useTheme } from '@/src/theme'
import { useAuth } from '@/src/lib/auth'
import { carouselSnap } from '@/src/lib/carousel'
import { withAlpha } from '@/src/lib/color'
import { api } from '@/src/lib/api'
import { Btn, Card, SectionTag } from '@/src/components/ui'
import { ProfilePill } from '@/src/components/ProfilePill'
import { Icon } from '@/src/components/icon'
import type { IconName } from '@/src/components/icon'
import { Loader } from '@/src/components/Loader'
import { AmbientGlow, PulsingDot } from '@/src/components/glow'
import { Screen } from '@/src/components/Screen'
import { Reveal, stagger } from '@/src/components/motion'

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

function greeting() {
  const h = new Date().getHours()
  if (h < 5) return 'UP LATE'
  if (h < 12) return 'GOOD MORNING'
  if (h < 17) return 'GOOD AFTERNOON'
  return 'GOOD EVENING'
}

/** Pressable tile with a spring "squash" on press-down, mirroring Btn/Card. */
function PressTile({ children, onPress, style }: { children: React.ReactNode; onPress: () => void; style?: any }) {
  const scale = useRef(new Animated.Value(1)).current
  const pressIn = () => Animated.spring(scale, { toValue: 0.94, useNativeDriver: true, speed: 40, bounciness: 0 }).start()
  const pressOut = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 4 }).start()
  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <TouchableOpacity onPress={onPress} onPressIn={pressIn} onPressOut={pressOut} activeOpacity={0.85}>
        {children}
      </TouchableOpacity>
    </Animated.View>
  )
}

export default function HomeScreen() {
  const { theme } = useTheme()
  const c = theme.colors
  const fw = frameworkStyles(theme)
  const radius = fw.radius
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
    <Screen scroll refreshControl={
      <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} colors={[c.accent]} progressBackgroundColor={c.bg2} />
    }>
      <Reveal dir="up" duration={420}>
        <View style={{ position: 'relative', marginBottom: SPACE.xxxl }}>
          <AmbientGlow color={c.accent} size={170} intensity={0.24} style={{ top: -70, right: -50 }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.lg }}>
              <View
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: c.accent,
                  shadowColor: c.accent,
                  shadowOpacity: 0.9,
                  shadowRadius: 6,
                  shadowOffset: { width: 0, height: 0 },
                }}
              />
              <Text style={[micro(10, 3.5, '700'), { color: c.accent }]}>{greeting()}</Text>
            </View>
            {isAuthed ? (
              <ProfilePill onPress={() => router.push('/profile' as Href)} />
            ) : (
              <Btn title="Sign in" onPress={() => router.push('/profile' as Href)} size="sm" />
            )}
          </View>
          <Text
            style={{
              color: c.text,
              fontSize: FONT.title,
              fontWeight: '900',
              fontFamily: theme.mono ? 'monospace' : undefined,
              letterSpacing: theme.mono ? 1 : 0.5,
              marginTop: SPACE.xl,
            }}
          >
            aifazi.net
          </Text>
          <Text style={{ color: c.muted, fontSize: FONT.md, marginTop: SPACE.xs }}>
            Community platform — mobile client{isAuthed && user ? ` · hi ${user.username}` : ''}
          </Text>
        </View>
      </Reveal>

      {loading ? (
        <Loader />
      ) : (
        <>
          {loadError ? (
            <Reveal dir="scale" delay={stagger(0)} duration={480}>
              <Text style={{ color: c.warning, fontSize: FONT.md, marginBottom: SPACE.lg }}>{loadError}</Text>
            </Reveal>
          ) : null}
          <View style={[styles.grid, { marginBottom: SPACE.huge }]}>
            {tiles.map((t, i) => (
              <Reveal key={t.label} dir="scale" delay={stagger(i)} duration={420}>
                <PressTile onPress={() => router.push(t.href)} style={[styles.tileWrap, { borderRadius: radius }]}>
                  <View style={[styles.tile, { borderColor: withAlpha(t.tint, 0.35), backgroundColor: withAlpha(c.bg2, 0.9), borderRadius: radius }]}>
                    <View
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        height: 2,
                        borderTopLeftRadius: radius,
                        borderTopRightRadius: radius,
                        backgroundColor: withAlpha(t.tint, 0.45),
                      }}
                    />
                    <View pointerEvents="none" style={{ position: 'absolute', bottom: -16, right: -8, width: 56, height: 56, borderRadius: 28, backgroundColor: withAlpha(t.tint, 0.12) }} />
                    <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: withAlpha(t.tint, 0.16), alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name={t.icon} size={22} color={t.tint} />
                    </View>
                    <Text style={{ color: c.text, fontSize: FONT.body, fontWeight: '800', marginTop: SPACE.sm }}>{t.label}</Text>
                  </View>
                </PressTile>
              </Reveal>
            ))}
          </View>

          <Reveal dir="up" delay={120} duration={520} style={{ marginBottom: SPACE.huge }}>
          <Card>
            <AmbientGlow color={overallColor} size={150} intensity={0.32} style={{ top: -60, right: -40 }} />
            <View style={styles.cardHeader}>
              <Text style={{ color: c.text, fontSize: FONT.body, fontWeight: '800' }}>Server status</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
                <PulsingDot color={overallColor} size={9} />
                <Text style={{ color: overallColor, fontSize: FONT.md, fontWeight: '700', textTransform: 'uppercase' }}>{overall}</Text>
              </View>
            </View>
            {mon.services ? (
              <View style={{ marginTop: SPACE.md }}>
                {mon.services.slice(0, 6).map((s) => {
                  const up = s.status === 'up' || s.status === 'operational'
                  const down = s.status === 'down' || s.status === 'outage'
                  const tint = up ? c.accent : down ? c.danger : c.accent2
                  const uptime = s.uptime_24h ?? 100
                  return (
                    <View key={s.name} style={{ marginBottom: SPACE.lg }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md }}>
                        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: tint }} />
                        <Text style={{ color: c.text2, fontSize: FONT.md, flex: 1 }} numberOfLines={1}>{s.label || s.name}</Text>
                        <Text style={{ color: c.muted, fontSize: FONT.sm }}>{uptime}%</Text>
                      </View>
                      <View style={{ marginTop: SPACE.xs, height: 3, borderRadius: 2, backgroundColor: withAlpha(c.border, 0.6), overflow: 'hidden' }}>
                        <View style={{ width: `${Math.max(4, Math.min(100, uptime))}%`, height: '100%', borderRadius: 2, backgroundColor: tint }} />
                      </View>
                    </View>
                  )
                })}
              </View>
            ) : null}
            <TouchableOpacity onPress={() => router.push('/status' as Href)} hitSlop={8} style={{ marginTop: SPACE.lg, alignSelf: 'flex-start' }}>
              <Text style={{ color: c.accent, fontSize: FONT.md, fontWeight: '700' }}>Detailed status →</Text>
            </TouchableOpacity>
          </Card>
          </Reveal>

          {projects.length > 0 ? (
            <Reveal dir="up" delay={160} duration={520}>
            <>
              <SectionTitle title="Our projects" onMore={() => router.push('/projects')} />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} {...carouselSnap(160)} style={{ marginBottom: SPACE.huge }}>
                {projects.map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    onPress={() => router.push('/projects' as Href)}
                    style={[styles.projectTile, { borderColor: c.border, backgroundColor: withAlpha(c.bg3, 0.9), borderRadius: radius }]}
                  >
                    {p.image_url ? (
                      <ExpoImage source={{ uri: p.image_url }} style={{ width: '100%', height: 70, borderTopLeftRadius: radius, borderTopRightRadius: radius }} contentFit="cover" />
                    ) : (
                      <View style={[styles.projectArt, { backgroundColor: withAlpha(c.accent2, 0.12) }]}>
                        <View style={[styles.fallbackBadge, { backgroundColor: withAlpha(c.accent2, 0.2) }]}>
                          <Icon name="rocket" size={20} color={c.accent2} />
                        </View>
                      </View>
                    )}
                    <Text style={{ color: c.text, fontSize: FONT.md, fontWeight: '700', padding: SPACE.md }} numberOfLines={2}>
                      {p.name || p.title}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
            </Reveal>
          ) : null}

          {products.length > 0 ? (
            <Reveal dir="up" delay={200} duration={520}>
            <>
              <SectionTitle title="Store picks" onMore={() => router.push('/store')} />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} {...carouselSnap(150)} style={{ marginBottom: SPACE.huge }}>
                {products.slice(0, 6).map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    onPress={() => router.push(`/store-item?slug=${encodeURIComponent(p.slug)}` as Href)}
                    style={[styles.productTile, { borderColor: c.border, backgroundColor: withAlpha(c.bg2, 0.9), borderRadius: radius }]}
                  >
                    {p.image_url ? (
                      <ExpoImage source={{ uri: p.image_url }} style={{ width: '100%', height: 70, borderTopLeftRadius: radius, borderTopRightRadius: radius }} contentFit="cover" />
                    ) : (
                      <View style={[styles.productArt, { backgroundColor: withAlpha(c.sale, 0.1) }]}>
                        <View style={[styles.fallbackBadge, { backgroundColor: withAlpha(c.sale, 0.18) }]}>
                          <Icon name="cart" size={20} color={c.sale} />
                        </View>
                      </View>
                    )}
                    <View style={{ padding: SPACE.md }}>
                      <Text style={{ color: c.text, fontSize: FONT.md, fontWeight: '700' }} numberOfLines={1}>{p.name}</Text>
                      <Text style={{ color: c.accent, fontSize: FONT.md, fontWeight: '800', marginTop: SPACE.xxs }}>{fmtPrice(p)}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
            </Reveal>
          ) : null}

          {threads.length > 0 ? (
            <Reveal dir="up" delay={240} duration={520}>
            <>
              <SectionTitle title="Forum threads" onMore={() => router.push('/forum')} />
              <View style={{ gap: SPACE.md, marginBottom: SPACE.huge }}>
                {threads.slice(0, 4).map((t) => (
                  <TouchableOpacity
                    key={t.id}
                    onPress={() => router.push(`/forum-thread?id=${t.id}` as Href)}
                    style={[styles.cardRow, { borderRadius: radius, backgroundColor: withAlpha(c.bg2, 0.7), borderColor: withAlpha(c.border, 0.45) }]}
                  >
                    <View style={[styles.rowIcon, { backgroundColor: withAlpha(c.accent, 0.14) }]}>
                      <Icon name="forum" size={18} color={c.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: c.text, fontSize: FONT.body, fontWeight: '700' }} numberOfLines={1}>
                        {t.category?.icon ? `${t.category.icon} ` : ''}{t.title}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: SPACE.xxs }}>
                        <Icon name="chat" size={12} color={c.muted} />
                        <Text style={{ color: c.muted, fontSize: FONT.sm }}>
                          {t.author?.username || '—'} · {t.replyCount ?? 0}
                        </Text>
                      </View>
                    </View>
                    <Icon name="forward" size={16} color={c.muted} />
                  </TouchableOpacity>
                ))}
              </View>
            </>
            </Reveal>
          ) : null}

          {posts.length > 0 ? (
            <Reveal dir="up" delay={280} duration={520}>
            <>
              <SectionTitle title="Blog" onMore={() => router.push('/blog')} />
              <View style={{ gap: SPACE.md }}>
                {posts.slice(0, 4).map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    onPress={() => router.push(`/blog-post?slug=${encodeURIComponent(p.slug)}` as Href)}
                    style={[styles.cardRow, { borderRadius: radius, backgroundColor: withAlpha(c.bg2, 0.7), borderColor: withAlpha(c.border, 0.45) }]}
                  >
                    <View style={[styles.rowIcon, { backgroundColor: withAlpha(c.star, 0.14) }]}>
                      <Icon name="blog" size={18} color={c.star} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: c.text, fontSize: FONT.body, fontWeight: '700' }} numberOfLines={1}>{p.title}</Text>
                      <Text style={{ color: c.muted, fontSize: FONT.sm, marginTop: SPACE.xxs }} numberOfLines={1}>
                        {p.author_name ?? ''}{p.category ? ` · ${p.category}` : ''}
                      </Text>
                    </View>
                    <Icon name="forward" size={16} color={c.muted} />
                  </TouchableOpacity>
                ))}
              </View>
            </>
            </Reveal>
          ) : null}
        </>
      )}
    </Screen>
  )
}

function SectionTitle({ title, onMore }: { title: string; onMore: () => void }) {
  const { theme } = useTheme()
  const c = theme.colors
  return (
    <View style={{ marginBottom: SPACE.md }}>
      <SectionTag>{title}</SectionTag>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: SPACE.xs }}>
        <Text style={{ color: c.text, fontSize: FONT.card, fontWeight: '800' }}>{title}</Text>
        <TouchableOpacity onPress={onMore} hitSlop={8}>
          <Text style={{ color: c.accent, fontSize: FONT.md, fontWeight: '700' }}>See all →</Text>
        </TouchableOpacity>
      </View>
      <View style={{ height: 1, backgroundColor: withAlpha(c.border, 0.35), marginTop: SPACE.sm }} />
    </View>
  )
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACE.lg,
  },
  tile: {
    width: '100%',
    aspectRatio: 1,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  tileWrap: {
    width: '30%',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  projectTile: {
    width: 150,
    borderWidth: 1,
    marginRight: SPACE.lg,
    overflow: 'hidden',
  },
  productTile: {
    width: 140,
    borderWidth: 1,
    marginRight: SPACE.lg,
    overflow: 'hidden',
  },
  productArt: {
    height: 70,
    alignItems: 'center',
    justifyContent: 'center',
  },
  projectArt: {
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACE.lg,
    paddingHorizontal: SPACE.lg,
    borderWidth: 1,
  },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
})