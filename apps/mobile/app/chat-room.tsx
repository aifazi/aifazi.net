import { useEffect, useRef, useState, useCallback } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTheme } from '@/src/theme'
import { useAuth } from '@/src/lib/auth'
import { api } from '@/src/lib/api'

interface ChatMessage {
  id: string
  room_id: string
  sender: string
  role?: string
  type?: string
  content?: string
  file_name?: string
  file_size?: string
reply_to?: { id: string; sender: string; content: string } | null
  reactions?: Record<string, string[]>
  created_at?: string
  edited?: boolean
}

const POLL_MS = 4000

function fmtTime(iso?: string) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

export default function ChatRoomScreen() {
  const { room, name } = useLocalSearchParams<{ room: string; name?: string }>()
  const router = useRouter()
  const { theme } = useTheme()
  const c = theme.colors
  const { user } = useAuth()

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const listRef = useRef<FlatList<ChatMessage>>(null)
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const roomName = name || 'Chat'

  const load = useCallback(
    async (silent = false) => {
      if (!room) return
      try {
        const r = await api.get(`/chat/rooms/${room}/messages`, { params: { limit: 100 } })
        setMessages((r.data ?? []) as ChatMessage[])
        setErr('')
      } catch (e: any) {
        if (!silent) setErr(e?.response?.data?.detail || 'Could not load messages')
      } finally {
        if (!silent) setLoading(false)
      }
    },
    [room],
  )

  useEffect(() => {
    load()
    pollTimer.current = setInterval(() => load(true), POLL_MS)
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current)
    }
  }, [load])

  const send = async () => {
    const content = text.trim()
    if (!content || !room) return
    setSending(true)
    try {
      await api.post(`/chat/rooms/${room}/messages`, { content, type: 'text' })
      setText('')
      await load(true)
    } catch (e: any) {
      setErr(e?.response?.data?.detail || 'Failed to send')
    } finally {
      setSending(false)
    }
  }

  const deleteMsg = async (id: string) => {
    try {
      await api.delete(`/chat/messages/${id}`)
      setMessages((prev) => prev.filter((m) => m.id !== id))
    } catch (e: any) {
      setErr(e?.response?.data?.detail || 'Failed to delete')
    }
  }

  const toggleReact = async (id: string, emoji: string) => {
    try {
      const r = await api.patch(`/chat/messages/${id}/react`, { emoji })
      const reactions = (r.data?.reactions ?? {}) as Record<string, string[]>
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, reactions } : m)))
    } catch {
      setErr('Failed to react')
    }
  }

  const isMine = (m: ChatMessage) => m.sender === user?.username

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.bg }]} edges={['top', 'bottom']}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <Text style={{ color: c.text, fontSize: 18 }}>←</Text>
        </TouchableOpacity>
        <Text style={{ color: c.text, fontSize: 15, fontWeight: '800', flex: 1 }} numberOfLines={1}>
          {roomName}
        </Text>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {loading ? (
          <View style={{ paddingTop: 40, alignItems: 'center' }}>
            <ActivityIndicator color={c.accent} />
          </View>
        ) : err && messages.length === 0 ? (
          <View style={{ padding: 20, alignItems: 'center' }}>
            <Text style={{ color: c.danger, textAlign: 'center' }}>{err}</Text>
            <TouchableOpacity onPress={() => load()} style={{ marginTop: 14 }}>
              <Text style={{ color: c.accent, fontWeight: '700' }}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            contentContainerStyle={{ padding: 12, paddingBottom: 20 }}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
            ListEmptyComponent={
              <Text style={{ color: c.muted, textAlign: 'center', marginTop: 40, fontSize: 13 }}>
                No messages yet. Say hi!
              </Text>
            }
            renderItem={({ item }) => {
              const mine = isMine(item)
              const reactions = item.reactions ?? {}
              const reactionEntries = Object.entries(reactions)
              let replyContent = ''
              if (item.reply_to?.content) replyContent = item.reply_to.content
              return (
                <View style={{ marginBottom: 10, alignItems: mine ? 'flex-end' : 'flex-start' }}>
                  <View
                    style={[
                      styles.bubble,
                      {
                        backgroundColor: mine ? c.accent2 : c.bg2,
                        borderColor: mine ? c.accent2 : c.border,
                        maxWidth: '85%',
                      },
                    ]}
                  >
                    {!mine ? (
                      <Text style={{ color: c.accent2, fontSize: 11, fontWeight: '700', marginBottom: 3 }}>
                        {item.sender}
                        {item.role && item.role !== 'member' ? ` · ${item.role}` : ''}
                      </Text>
                    ) : null}
                    {replyContent ? (
                      <Text style={{ color: c.muted, fontSize: 11, fontStyle: 'italic', marginBottom: 4 }}>
                        ↪ {replyContent}
                      </Text>
                    ) : null}
                    <Text style={{ color: mine ? '#001018' : c.text, fontSize: 14, lineHeight: 19 }}>
                      {item.content}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6, marginTop: 4 }}>
                      <Text style={{ color: mine ? 'rgba(0,16,24,0.6)' : c.muted, fontSize: 10 }}>
                        {fmtTime(item.created_at)}
                        {item.edited ? ' · edited' : ''}
                      </Text>
                    </View>
                  </View>
                  {reactionEntries.length > 0 ? (
                    <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                      {reactionEntries.map(([emoji, usernames]) => (
                        <TouchableOpacity
                          key={emoji}
                          onPress={() => toggleReact(item.id, emoji)}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 4,
                            paddingHorizontal: 8,
                            paddingVertical: 2,
                            borderRadius: 12,
                            borderWidth: 1,
                            borderColor: c.border,
                            backgroundColor: c.bg2,
                          }}
                        >
                          <Text style={{ fontSize: 13 }}>{emoji}</Text>
                          <Text style={{ color: c.muted, fontSize: 11 }}>{usernames.length}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : null}
                  {mine ? (
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                      <TouchableOpacity onPress={() => toggleReact(item.id, '👍')} hitSlop={8}>
                        <Text style={{ fontSize: 13 }}>👍</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => deleteMsg(item.id)} hitSlop={8}>
                        <Text style={{ color: c.danger, fontSize: 12 }}>Delete</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      onPress={() => toggleReact(item.id, '👍')}
                      hitSlop={8}
                      style={{ marginTop: 4 }}
                    >
                      <Text style={{ fontSize: 13 }}>👍</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )
            }}
          />
        )}
      </KeyboardAvoidingView>

      <View style={[styles.inputBar, { borderTopColor: c.border, backgroundColor: c.bg2 }]}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Type a message…"
          placeholderTextColor={c.muted}
          multiline
          style={[
            styles.input,
            {
              backgroundColor: c.bg,
              color: c.text,
              borderColor: c.border,
              fontFamily: theme.mono ? 'monospace' : undefined,
            },
          ]}
        />
        <TouchableOpacity
          onPress={send}
          disabled={sending || !text.trim()}
          style={[styles.sendBtn, { backgroundColor: c.accent, opacity: sending || !text.trim() ? 0.5 : 1 }]}
        >
          <Text style={{ color: theme.dark ? '#000' : '#fff', fontWeight: '800', fontSize: 13 }}>
            {sending ? '…' : 'Send'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  backBtn: { paddingRight: 4 },
  bubble: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
    maxHeight: 100,
    fontSize: 14,
  },
  sendBtn: {
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 11,
    alignItems: 'center',
  },
})