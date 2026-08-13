import { useEffect, useState, useCallback } from 'react'
import { FONT, SPACE, frameworkStyles } from '@/src/design'
import { View, Text, TouchableOpacity, ScrollView, TextInput, KeyboardAvoidingView, Platform } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Image as ExpoImage } from 'expo-image'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Muted } from '@/src/components/ui'
import { MarkdownText } from '@/src/components/markdown'
import { Icon } from '@/src/components/icon'
import { useTheme } from '@/src/theme'
import { useAuth } from '@/src/lib/auth'
import { api } from '@/src/lib/api'
import { useOverlay } from '@/src/components/overlay'
import { Loader } from '@/src/components/Loader'
import { Reveal, stagger } from '@/src/components/motion'

interface Comment {
  _id?: string
  id?: string
  content: string
  createdAt?: string
  author?: { _id?: string; username: string; avatar?: string }
}

interface PostDetail {
  id: string
  title: string
  slug: string
  content?: string
  excerpt?: string
  cover_image?: string
  author_name?: string
  category?: string
  tags?: string[]
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

export default function BlogPostScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  const router = useRouter()
  const { theme } = useTheme()
  const { user, isAuthed } = useAuth()
  const c = theme.colors
  const radius = frameworkStyles(theme).radius
  const pillRadius = frameworkStyles(theme).buttonRadius
  const { alert, confirm } = useOverlay()
  const [post, setPost] = useState<PostDetail | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [commentText, setCommentText] = useState('')
  const [posting, setPosting] = useState(false)

  const load = useCallback(() => {
    if (!slug) return
    api
      .get(`/blog/${encodeURIComponent(slug)}`)
      .then((r) => setPost((r.data ?? null) as PostDetail | null))
      .catch((e) => setErr(e?.response?.data?.detail || 'Could not load post'))
      .finally(() => setLoading(false))
    api
      .get(`/blog/comments/${encodeURIComponent(slug)}`)
      .then((r) => setComments((r.data ?? []) as Comment[]))
      .catch(() => setComments([]))
  }, [slug])

  useEffect(() => {
    load()
    // bump views best-effort
    if (slug) api.post(`/blog/${encodeURIComponent(slug)}/view`).catch(() => {})
  }, [load, slug])

  const canModerate = user?.role === 'admin' || user?.role === 'moderator'

  const submitComment = async () => {
    const content = commentText.trim()
    if (!content || posting || !slug) return
    setPosting(true)
    try {
      await api.post(`/blog/comments/${encodeURIComponent(slug)}`, { content })
      setCommentText('')
      const r = await api.get(`/blog/comments/${encodeURIComponent(slug)}`)
      setComments((r.data ?? []) as Comment[])
    } catch (e: any) {
      alert({ message: e?.response?.data?.detail || e?.message || 'Login required to comment.' })
    } finally {
      setPosting(false)
    }
  }

  const deleteComment = async (cm: Comment) => {
    const id = cm._id || cm.id
    if (!id) return
    const ok = await confirm({ title: 'Delete comment', message: 'Delete this comment?', confirmText: 'Delete', destructive: true })
    if (!ok) return
    try {
      await api.delete(`/blog/comments/${id}`)
      setComments((prev) => prev.filter((x) => (x._id || x.id) !== id))
    } catch (e: any) {
      alert({ message: e?.response?.data?.detail || 'Could not delete.' })
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Loader compact />
      </SafeAreaView>
    )
  }

  if (!post) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg, padding: SPACE.giant }}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back" hitSlop={10}>
          <Icon name="back" size={22} color={c.text} />
        </TouchableOpacity>
        <Text style={{ color: c.danger, marginTop: SPACE.giant }}>{err || 'Post not found'}</Text>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top', 'bottom']}>
      <Reveal dir="up" duration={420}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.lg, paddingHorizontal: SPACE.xxl, paddingVertical: SPACE.lg, borderBottomWidth: 1, borderBottomColor: c.border }}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back" hitSlop={10}>
          <Icon name="back" size={22} color={c.text} />
        </TouchableOpacity>
        <Text style={{ color: c.text, fontSize: FONT.card, fontWeight: '800', flex: 1 }} numberOfLines={1}>Post</Text>
      </View>
      </Reveal>

      <ScrollView contentContainerStyle={{ padding: SPACE.xxxl, paddingBottom: SPACE.colossal }}>
        {post.cover_image ? (
          <Reveal dir="up" delay={120} duration={520}>
          <ExpoImage source={{ uri: post.cover_image }} style={{ width: '100%', height: 200, borderRadius: radius, marginBottom: SPACE.xxl }} contentFit="cover" transition={150} />
          </Reveal>
        ) : null}

        <Reveal dir="up" delay={160} duration={520}>
        <Text style={{ color: c.text, fontSize: 21, fontWeight: '900', lineHeight: 28 }}>{post.title}</Text>
        <View style={{ flexDirection: 'row', marginTop: SPACE.md, gap: SPACE.lg, flexWrap: 'wrap' }}>
          <Muted>{post.author_name ?? 'Admin'}</Muted>
          <Muted>{fmtDate(post.created_at)}</Muted>
          {post.category ? <Muted>{post.category}</Muted> : null}
          {post.views ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Icon name="eye" size={12} color={c.muted} />
              <Muted>{post.views}</Muted>
            </View>
          ) : null}
        </View>
        </Reveal>

        {post.tags && post.tags.length > 0 ? (
          <Reveal dir="up" delay={200} duration={520}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm, marginTop: SPACE.md }}>
            {post.tags.map((t, i) => (
              <Reveal key={t} dir="scale" delay={stagger(i)} duration={420}>
                <View style={{ backgroundColor: c.bg3, borderRadius: pillRadius, paddingHorizontal: SPACE.md, paddingVertical: 3 }}>
                  <Text style={{ color: c.text2, fontSize: FONT.sm }}>#{t}</Text>
                </View>
              </Reveal>
            ))}
          </View>
          </Reveal>
        ) : null}

        {post.content ? (
          <Reveal dir="up" delay={240} duration={520}>
          <View style={{ marginTop: SPACE.xxxl, paddingTop: SPACE.xxxl, borderTopWidth: 1, borderTopColor: c.border }}>
            <MarkdownText content={post.content} color={c.text2} />
          </View>
          </Reveal>
        ) : post.excerpt ? (
          <Reveal dir="up" delay={240} duration={520}><Text style={{ color: c.text2, fontSize: FONT.body, lineHeight: 19, marginTop: SPACE.xxxl }}>{post.excerpt}</Text></Reveal>
        ) : null}

        <Reveal dir="up" delay={280} duration={520}>
        <Text style={{ color: c.text, fontSize: FONT.base, fontWeight: '800', marginTop: SPACE.mega, marginBottom: SPACE.md }}>Comments ({comments.length})</Text>
        {comments.length === 0 ? (
          <Muted>No comments yet.</Muted>
        ) : (
          comments.map((cm, i) => (
            <Reveal key={cm._id || cm.id || cm.content} dir="scale" delay={stagger(i)} duration={420}>
            <View style={{ paddingVertical: SPACE.lg, borderTopWidth: 1, borderTopColor: c.border }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md }}>
                <Text style={{ color: c.accent2, fontSize: FONT.md, fontWeight: '700', flex: 1 }}>{cm.author?.username ?? 'anonymous'}</Text>
                {(canModerate || cm.author?._id === user?.id || cm.author?._id === user?._id) && (
                  <TouchableOpacity onPress={() => deleteComment(cm)} hitSlop={8}>
                    <Text style={{ color: c.danger, fontSize: FONT.md }}>Delete</Text>
                  </TouchableOpacity>
                )}
              </View>
              <Text style={{ color: c.text2, fontSize: FONT.body, marginTop: SPACE.xxs }}>{cm.content}</Text>
            </View>
            </Reveal>
          ))
        )}
        </Reveal>

        <Reveal dir="up" delay={300} duration={520}>
        <View style={{ marginTop: SPACE.xxxl, borderTopWidth: 1, borderTopColor: c.border, paddingTop: SPACE.xl }}>
          <Text style={{ color: c.text, fontSize: FONT.body, fontWeight: '800', marginBottom: SPACE.md }}>{isAuthed ? 'Add a comment' : 'Login to comment'}</Text>
          {isAuthed ? (
            <>
              <TextInput
                value={commentText}
                onChangeText={setCommentText}
                placeholder="Write a comment…"
                placeholderTextColor={c.muted}
                multiline
                editable={!posting}
                style={{ backgroundColor: c.bg, borderColor: c.border, color: c.text, borderWidth: 1, borderRadius: theme.mono ? 0 : 8, paddingHorizontal: SPACE.xl, paddingVertical: 9, minHeight: 60, fontSize: FONT.base, fontFamily: theme.mono ? 'monospace' : undefined, textAlignVertical: 'top' }}
              />
              <TouchableOpacity
                onPress={submitComment}
                disabled={posting || !commentText.trim()}
                style={{ marginTop: SPACE.md, alignSelf: 'flex-end', backgroundColor: c.accent, paddingVertical: 9, paddingHorizontal: SPACE.huge, borderRadius: theme.mono ? 0 : 8, opacity: posting || !commentText.trim() ? 0.5 : 1 }}
              >
                <Text style={{ color: c.onAccent, fontWeight: '700', fontSize: FONT.body }}>{posting ? 'Posting…' : 'Post comment'}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity onPress={() => router.push('/auth/login')}>
              <Text style={{ color: c.accent2, fontSize: FONT.body }}>Sign in to join the discussion →</Text>
            </TouchableOpacity>
          )}
        </View>
        </Reveal>
      </ScrollView>
    </SafeAreaView>
  )
}