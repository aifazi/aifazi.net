import { useEffect, useState, useCallback } from 'react'
import { View, Text, TouchableOpacity, TextInput, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Btn, Muted } from '@/src/components/ui'
import { MarkdownText } from '@/src/components/markdown'
import { useTheme } from '@/src/theme'
import { useAuth } from '@/src/lib/auth'
import { api } from '@/src/lib/api'

interface ThreadAuthor {
  username: string
  avatar?: string
  role?: string
}

interface ReplyAuthor {
  username?: string
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
  const { isAuthed, user } = useAuth()
  const [thread, setThread] = useState<ThreadDetail | null>(null)
  const [replies, setReplies] = useState<Reply[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
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

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={c.accent} />
      </SafeAreaView>
    )
  }

  if (!thread) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg, padding: 20 }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <Text style={{ color: c.text, fontSize: 18 }}>←</Text>
        </TouchableOpacity>
        <Text style={{ color: c.danger, marginTop: 20 }}>{err || 'Thread not found'}</Text>
      </SafeAreaView>
    )
  }

  const author = (thread as any).author || {}
  const bodyColor = c.text2

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top', 'bottom']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <Text style={{ color: c.text, fontSize: 18 }}>←</Text>
        </TouchableOpacity>
        <Text style={{ color: c.text, fontSize: 15, fontWeight: '800', flex: 1 }} numberOfLines={1}>Thread</Text>
        {isAuthed ? (
          <TouchableOpacity onPress={toggleLike} hitSlop={10}>
            <Text style={{ fontSize: 16, opacity: liked ? 1 : 0.6 }}>❤️</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 20 }}>
          <Text style={{ color: c.text, fontSize: 19, fontWeight: '900', lineHeight: 26 }}>
            {thread.pinned ? '📌 ' : ''}{thread.locked ? '🔒 ' : ''}{thread.title}
          </Text>
          <View style={{ flexDirection: 'row', marginTop: 8, gap: 10 }}>
            <Muted>{author.username ?? 'anonymous'}</Muted>
            {thread.category?.name ? <Muted>{thread.category.icon ?? ''} {thread.category.name}</Muted> : null}
            {thread.views ? <Muted>👁 {thread.views}</Muted> : null}
          </View>

          {thread.content ? (
            <View style={{ marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: c.border }}>
              <MarkdownText content={thread.content} color={bodyColor} />
            </View>
          ) : null}

          <Text style={{ color: c.text, fontSize: 14, fontWeight: '800', marginTop: 20, marginBottom: 8 }}>
            Replies ({replies.length})
          </Text>
          {replies.length === 0 ? (
            <Muted>No replies yet.</Muted>
          ) : (
            replies.map((r) => (
              <View key={r._id || r.id} style={{ paddingVertical: 10, borderTopWidth: 1, borderTopColor: c.border }}>
                <Text style={{ color: c.accent2, fontSize: 12, fontWeight: '700' }}>{r.author?.username ?? 'anonymous'}</Text>
                <MarkdownText content={r.content} color={c.text2} />
              </View>
            ))
          )}
        </ScrollView>

        {isAuthed ? (
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.bg2 }}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder={thread.locked ? 'Thread locked' : 'Write a reply…'}
              placeholderTextColor={c.muted}
              editable={!thread.locked}
              multiline
              style={{ flex: 1, borderRadius: 8, borderWidth: 1, borderColor: c.border, backgroundColor: c.bg, color: c.text, paddingHorizontal: 12, paddingVertical: 9, maxHeight: 100, fontSize: 14, fontFamily: theme.mono ? 'monospace' : undefined }}
            />
            <Btn title={sending ? '…' : 'Reply'} onPress={postReply} disabled={sending || !text.trim() || !!thread.locked} style={{ paddingVertical: 10, paddingHorizontal: 16 }} />
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}