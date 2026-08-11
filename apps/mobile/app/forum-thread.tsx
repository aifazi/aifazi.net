import { useEffect, useState, useCallback } from 'react'
import { FONT, SPACE, frameworkStyles } from '@/src/design'
import { View, Text, TouchableOpacity, TextInput, ScrollView, KeyboardAvoidingView, Platform } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Btn, Muted } from '@/src/components/ui'
import { MarkdownText } from '@/src/components/markdown'
import { Icon } from '@/src/components/icon'
import { useTheme } from '@/src/theme'
import { useAuth } from '@/src/lib/auth'
import { api } from '@/src/lib/api'
import { useOverlay } from '@/src/components/overlay'
import { Loader } from '@/src/components/Loader'
import { Reveal, stagger } from '@/src/components/motion'

interface ThreadAuthor {
  username: string
  avatar?: string
  role?: string
}

interface ReplyAuthor {
  username?: string
  _id?: string
  role?: string
}

interface Reply {
  _id?: string
  id: string
  content: string
  author: ReplyAuthor
  created_at?: string
  createdAt?: string
}

interface ThreadDetail {
  _id: string
  id: string
  title: string
  content?: string
  author?: ThreadAuthor
  category?: any
  pinned?: boolean
  locked?: boolean
  views?: number
  likes?: number
}

export default function ForumThreadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { theme } = useTheme()
  const c = theme.colors
  const pillRadius = frameworkStyles(theme).buttonRadius
  const { isAuthed, user } = useAuth()
  const { confirm } = useOverlay()
  const [thread, setThread] = useState<ThreadDetail | null>(null)
  const [replies, setReplies] = useState<Reply[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [liked, setLiked] = useState(false)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const load = useCallback(() => {
    if (!id) return
    api
      .get(`/forum/threads/${encodeURIComponent(id)}`)
      .then((r) => {
        setThread((r.data?.thread ?? null) as ThreadDetail | null)
        setReplies((r.data?.replies ?? []) as Reply[])
      })
      .catch((e) => setErr(e?.response?.data?.detail || 'Could not load thread'))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  const toggleLike = async () => {
    if (!thread || !isAuthed) return
    try {
      await api.post(`/forum/threads/${thread.id}/like`)
      setLiked((v) => !v)
      load()
    } catch {
      setErr('Could not update like')
    }
  }

  const postReply = async () => {
    const content = text.trim()
    if (!content || !isAuthed) return
    setSending(true)
    try {
      await api.post(`/forum/threads/${thread?.id}/replies`, { content })
      setText('')
      load()
    } catch (e: any) {
      setErr(e?.response?.data?.detail || 'Failed to post reply')
    } finally {
      setSending(false)
    }
  }

  const canModerate = user?.role === 'admin' || user?.role === 'moderator'
  const isOwnReply = (r: Reply) => r.author?._id === user?.id || r.author?._id === user?._id
  const canManageReply = (r: Reply) => canModerate || isOwnReply(r)

  const startEdit = (r: Reply) => {
    setEditingId(r.id)
    setEditText(r.content)
  }

  const saveEdit = async () => {
    const content = editText.trim()
    if (!editingId || !content) return
    setSending(true)
    try {
      await api.put(`/forum/replies/${editingId}`, { content })
      setEditingId(null)
      setEditText('')
      load()
    } catch (e: any) {
      setErr(e?.response?.data?.detail || 'Failed to edit reply')
    } finally {
      setSending(false)
    }
  }

  const deleteReply = async (r: Reply) => {
    const ok = await confirm({ title: 'Delete reply', message: 'Delete this reply?', confirmText: 'Delete', destructive: true })
    if (!ok) return
    try {
      await api.delete(`/forum/replies/${r.id}`)
      setReplies((prev) => prev.filter((x) => x.id !== r.id && x._id !== r.id))
    } catch (e: any) {
      setErr(e?.response?.data?.detail || 'Failed to delete reply')
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Loader compact />
      </SafeAreaView>
    )
  }

  if (!thread) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg, padding: SPACE.giant }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <Icon name="back" size={22} color={c.text} />
        </TouchableOpacity>
        <Text style={{ color: c.danger, marginTop: SPACE.giant }}>{err || 'Thread not found'}</Text>
      </SafeAreaView>
    )
  }

  const author = (thread as any).author || {}
  const bodyColor = c.text2

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top', 'bottom']}>
      <Reveal dir="up" duration={420}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.lg, paddingHorizontal: SPACE.xxl, paddingVertical: SPACE.lg, borderBottomWidth: 1, borderBottomColor: c.border }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <Icon name="back" size={22} color={c.text} />
        </TouchableOpacity>
        <Text style={{ color: c.text, fontSize: FONT.card, fontWeight: '800', flex: 1 }} numberOfLines={1}>Thread</Text>
        {isAuthed ? (
          <TouchableOpacity onPress={toggleLike} hitSlop={10}>
            <Text style={{ fontSize: FONT.section, opacity: liked ? 1 : 0.6 }}>❤️</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      </Reveal>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: SPACE.xxxl, paddingBottom: SPACE.giant }}>
          <Reveal dir="up" delay={120} duration={520}>
          <Text style={{ color: c.text, fontSize: 19, fontWeight: '900', lineHeight: 26 }}>
            {thread.pinned ? '📌 ' : ''}{thread.locked ? '🔒 ' : ''}{thread.title}
          </Text>
          <View style={{ flexDirection: 'row', marginTop: SPACE.md, gap: SPACE.lg }}>
            <Muted>{author.username ?? 'anonymous'}</Muted>
            {thread.category?.name ? <Muted>{thread.category.icon ?? ''} {thread.category.name}</Muted> : null}
            {thread.views ? <Muted>👁 {thread.views}</Muted> : null}
          </View>
          </Reveal>

          {thread.content ? (
            <Reveal dir="up" delay={160} duration={520}>
            <View style={{ marginTop: SPACE.xxl, paddingTop: SPACE.xxl, borderTopWidth: 1, borderTopColor: c.border }}>
              <MarkdownText content={thread.content} color={bodyColor} />
            </View>
            </Reveal>
          ) : null}

          <Reveal dir="up" delay={200} duration={520}>
          <Text style={{ color: c.text, fontSize: FONT.base, fontWeight: '800', marginTop: SPACE.giant, marginBottom: SPACE.md }}>
            Replies ({replies.length})
          </Text>
          {replies.length === 0 ? (
            <Muted>No replies yet.</Muted>
          ) : (
            replies.map((r, i) => (
              <Reveal key={r._id || r.id} dir="scale" delay={stagger(i)} duration={420}>
              <View style={{ paddingVertical: SPACE.lg, borderTopWidth: 1, borderTopColor: c.border }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md }}>
                  <Text style={{ color: c.accent2, fontSize: FONT.md, fontWeight: '700', flex: 1 }}>{r.author?.username ?? 'anonymous'}</Text>
                  {canManageReply(r) ? (
                    <>
                      {editingId === r.id ? (
                        <>
                          <TouchableOpacity onPress={saveEdit} disabled={sending || !editText.trim()} hitSlop={8}>
                            <Text style={{ color: c.accent2, fontSize: FONT.md, fontWeight: '700' }}>Save</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => { setEditingId(null); setEditText('') }} hitSlop={8}>
                            <Text style={{ color: c.muted, fontSize: FONT.md }}>Cancel</Text>
                          </TouchableOpacity>
                        </>
                      ) : (
                        <>
                          <TouchableOpacity onPress={() => startEdit(r)} hitSlop={8}>
                            <Text style={{ color: c.accent2, fontSize: FONT.md }}>Edit</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => deleteReply(r)} hitSlop={8}>
                            <Text style={{ color: c.danger, fontSize: FONT.md }}>Delete</Text>
                          </TouchableOpacity>
                        </>
                      )}
                    </>
                  ) : null}
                </View>
                {editingId === r.id ? (
                  <TextInput
                    value={editText}
                    onChangeText={setEditText}
                    placeholder="Edit reply…"
                    placeholderTextColor={c.muted}
                    multiline
                    editable={!sending}
                    style={{ marginTop: SPACE.sm, backgroundColor: c.bg, borderColor: c.border, color: c.text, borderWidth: 1, borderRadius: theme.mono ? 0 : 8, paddingHorizontal: SPACE.xl, paddingVertical: 9, minHeight: 60, fontSize: FONT.base, fontFamily: theme.mono ? 'monospace' : undefined, textAlignVertical: 'top' }}
                  />
                ) : (
                  <MarkdownText content={r.content} color={c.text2} />
                )}
              </View>
              </Reveal>
            ))
          )}
          </Reveal>
        </ScrollView>

        {isAuthed ? (
          <Reveal dir="up" delay={240} duration={520}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: SPACE.md, padding: SPACE.lg, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.bg2 }}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder={thread.locked ? 'Thread locked' : 'Write a reply…'}
              placeholderTextColor={c.muted}
              editable={!thread.locked}
              multiline
              style={{ flex: 1, borderRadius: pillRadius, borderWidth: 1, borderColor: c.border, backgroundColor: c.bg, color: c.text, paddingHorizontal: SPACE.xl, paddingVertical: 9, maxHeight: 100, fontSize: FONT.base, fontFamily: theme.mono ? 'monospace' : undefined }}
            />
            <Btn title={sending ? '…' : 'Reply'} onPress={postReply} disabled={sending || !text.trim() || !!thread.locked} style={{ paddingVertical: SPACE.lg, paddingHorizontal: SPACE.xxxl }} />
          </View>
          </Reveal>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}