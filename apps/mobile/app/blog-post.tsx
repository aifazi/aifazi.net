import { useEffect, useState, useCallback } from 'react'
import { View, Text, TouchableOpacity, ScrollView, TextInput, KeyboardAvoidingView, Platform } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Image as ExpoImage } from 'expo-image'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Muted } from '@/src/components/ui'
import { MarkdownText } from '@/src/components/markdown'
import { useTheme } from '@/src/theme'
import { useAuth } from '@/src/lib/auth'
import { api } from '@/src/lib/api'
import { useOverlay } from '@/src/components/overlay'
import { Loader } from '@/src/components/Loader'

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
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg, padding: 20 }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <Text style={{ color: c.text, fontSize: 18 }}>←</Text>
        </TouchableOpacity>
        <Text style={{ color: c.danger, marginTop: 20 }}>{err || 'Post not found'}</Text>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top', 'bottom']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <Text style={{ color: c.text, fontSize: 18 }}>←</Text>
        </TouchableOpacity>
        <Text style={{ color: c.text, fontSize: 15, fontWeight: '800', flex: 1 }} numberOfLines={1}>Post</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {post.cover_image ? (
          <ExpoImage source={{ uri: post.cover_image }} style={{ width: '100%', height: 200, borderRadius: 12, marginBottom: 14 }} contentFit="cover" transition={150} />
        ) : null}

        <Text style={{ color: c.text, fontSize: 21, fontWeight: '900', lineHeight: 28 }}>{post.title}</Text>
        <View style={{ flexDirection: 'row', marginTop: 8, gap: 10, flexWrap: 'wrap' }}>
          <Muted>{post.author_name ?? 'Admin'}</Muted>
          <Muted>{fmtDate(post.created_at)}</Muted>
          {post.category ? <Muted>{post.category}</Muted> : null}
          {post.views ? <Muted>👁 {post.views}</Muted> : null}
        </View>
        {post.tags && post.tags.length > 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {post.tags.map((t) => (
              <View key={t} style={{ backgroundColor: c.bg3, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
                <Text style={{ color: c.text2, fontSize: 11 }}>#{t}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {post.content ? (
          <View style={{ marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: c.border }}>
            <MarkdownText content={post.content} color={c.text2} />
          </View>
        ) : post.excerpt ? (
          <Text style={{ color: c.text2, fontSize: 13, lineHeight: 19, marginTop: 16 }}>{post.excerpt}</Text>
        ) : null}

        <Text style={{ color: c.text, fontSize: 14, fontWeight: '800', marginTop: 24, marginBottom: 8 }}>Comments ({comments.length})</Text>
        {comments.length === 0 ? (
          <Muted>No comments yet.</Muted>
        ) : (
          comments.map((cm) => (
            <View key={cm._id || cm.id || cm.content} style={{ paddingVertical: 10, borderTopWidth: 1, borderTopColor: c.border }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ color: c.accent2, fontSize: 12, fontWeight: '700', flex: 1 }}>{cm.author?.username ?? 'anonymous'}</Text>
                {(canModerate || cm.author?._id === user?.id || cm.author?._id === user?._id) && (
                  <TouchableOpacity onPress={() => deleteComment(cm)} hitSlop={8}>
                    <Text style={{ color: c.danger, fontSize: 12 }}>Delete</Text>
                  </TouchableOpacity>
                )}
              </View>
              <Text style={{ color: c.text2, fontSize: 13, marginTop: 2 }}>{cm.content}</Text>
            </View>
          ))
        )}

        <View style={{ marginTop: 16, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 12 }}>
          <Text style={{ color: c.text, fontSize: 13, fontWeight: '800', marginBottom: 8 }}>{isAuthed ? 'Add a comment' : 'Login to comment'}</Text>
          {isAuthed ? (
            <>
              <TextInput
                value={commentText}
                onChangeText={setCommentText}
                placeholder="Write a comment…"
                placeholderTextColor={c.muted}
                multiline
                editable={!posting}
                style={{ backgroundColor: c.bg, borderColor: c.border, color: c.text, borderWidth: 1, borderRadius: theme.mono ? 0 : 8, paddingHorizontal: 12, paddingVertical: 9, minHeight: 60, fontSize: 14, fontFamily: theme.mono ? 'monospace' : undefined, textAlignVertical: 'top' }}
              />
              <TouchableOpacity
                onPress={submitComment}
                disabled={posting || !commentText.trim()}
                style={{ marginTop: 8, alignSelf: 'flex-end', backgroundColor: c.accent, paddingVertical: 9, paddingHorizontal: 18, borderRadius: theme.mono ? 0 : 8, opacity: posting || !commentText.trim() ? 0.5 : 1 }}
              >
                <Text style={{ color: c.onAccent, fontWeight: '700', fontSize: 13 }}>{posting ? 'Posting…' : 'Post comment'}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity onPress={() => router.push('/auth/login')}>
              <Text style={{ color: c.accent2, fontSize: 13 }}>Sign in to join the discussion →</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}