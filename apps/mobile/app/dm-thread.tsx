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
  Animated,
  AppState,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import type { Href } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { askImageSourceAsync, pickDocument, type PickedFile } from '@/src/lib/media'
import { Image as ExpoImage } from 'expo-image'
import { useTheme } from '@/src/theme'
import { useAuth } from '@/src/lib/auth'
import { api } from '@/src/lib/api'
import { encryptText, decryptIfEncrypted } from '@/src/lib/chat-encryption'
import { useMessageActions, useSwipeToReply } from '@/src/lib/chat-actions'
import { useOverlay } from '@/src/components/overlay'

interface DMMessage {
  id: string
  thread_id: string
  sender: string
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

interface RowProps {
  mine: boolean
  c: any
  theme: any
  item: DMMessage
  threadKey: string
  isImage: boolean
  replyContent: string
  reactions: [string, string[]][]
  onReply: () => void
  onReact: () => void
  onEdit: () => void
  onDelete: () => void
  onToggleReact: (emoji: string) => void
  onLongPress: () => void
}

function MessageRow(props: RowProps) {
  const { mine, c, theme, item, threadKey, isImage, replyContent, reactions, onReply, onReact, onEdit, onDelete, onToggleReact, onLongPress } = props
  const { pan, panHandlers } = useSwipeToReply({ onReply })

  return (
    <View style={{ marginBottom: 10 }}>
      <Animated.View style={{ alignItems: mine ? 'flex-end' : 'flex-start', transform: [{ translateX: pan.x }] }} {...panHandlers}>
        <TouchableOpacity
          activeOpacity={0.8}
          onLongPress={onLongPress}
          delayLongPress={350}
        >
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
            {replyContent ? (
              <Text style={{ color: c.muted, fontSize: 11, fontStyle: 'italic', marginBottom: 4 }}>
                ↪ {decryptIfEncrypted(replyContent, threadKey)}
              </Text>
            ) : null}
            {isImage ? (
              <ExpoImage
                source={{ uri: item.content }}
                style={{ width: 220, height: 220, borderRadius: 10 }}
                contentFit="cover"
                transition={150}
              />
            ) : (
              <Text style={{ color: mine ? '#001018' : c.text, fontSize: 14, lineHeight: 19 }}>
                {decryptIfEncrypted(item.content, threadKey)}
              </Text>
            )}
            {item.type === 'file' && item.file_name ? (
              <Text style={{ marginTop: 6, fontSize: 13, color: mine ? '#001018' : c.text }}>📎 {item.file_name}</Text>
            ) : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6, marginTop: 4 }}>
              <Text style={{ color: mine ? 'rgba(0,16,24,0.6)' : c.muted, fontSize: 10 }}>
                {fmtTime(item.created_at)}
                {item.edited ? ' · edited' : ''}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      </Animated.View>
      {reactions.length > 0 ? (
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 4, justifyContent: mine ? 'flex-end' : 'flex-start' }}>
          {reactions.map(([emoji, usernames]) => (
            <TouchableOpacity
              key={emoji}
              onPress={() => onToggleReact(emoji)}
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
      <View style={{ flexDirection: 'row', gap: 12, marginTop: 4, justifyContent: mine ? 'flex-end' : 'flex-start' }}>
        <TouchableOpacity onPress={onReply} hitSlop={8}>
          <Text style={{ color: c.muted, fontSize: 11, fontWeight: '700' }}>Reply</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onReact} hitSlop={8}>
          <Text style={{ color: c.muted, fontSize: 11, fontWeight: '700' }}>React</Text>
        </TouchableOpacity>
        {mine ? (
          <>
            <TouchableOpacity onPress={onEdit} hitSlop={8}>
              <Text style={{ color: c.muted, fontSize: 11, fontWeight: '700' }}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onDelete} hitSlop={8}>
              <Text style={{ color: c.danger, fontSize: 11, fontWeight: '700' }}>Delete</Text>
            </TouchableOpacity>
          </>
        ) : null}
      </View>
    </View>
  )
}

export default function DMThreadScreen() {
  const { thread_id, peer } = useLocalSearchParams<{ thread_id: string; peer?: string }>()
  const router = useRouter()
  const { theme } = useTheme()
  const c = theme.colors
  const { user } = useAuth()
  const overlay = useOverlay()
  const { confirm, menu, alert } = overlay
  const { showMessageActions, showEmojiPicker } = useMessageActions()

  const [messages, setMessages] = useState<DMMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [threadKey, setThreadKey] = useState('')
  const [editing, setEditing] = useState<DMMessage | null>(null)
  const [editText, setEditText] = useState('')
  const [replying, setReplying] = useState<DMMessage | null>(null)
  const listRef = useRef<FlatList<DMMessage>>(null)
  const stick = useRef(true)
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!thread_id) return
    api
      .get(`/chat/dm/threads/${thread_id}/encryption-key`)
      .then((r) => setThreadKey((r.data?.encryption_key ?? '') as string))
      .catch(() => setThreadKey(''))
  }, [thread_id])

  const load = useCallback(
    async (silent = false) => {
      if (!thread_id) return
      try {
        const r = await api.get(`/chat/dm/threads/${thread_id}/messages`, { params: { limit: 100 } })
        setMessages((r.data ?? []) as DMMessage[])
        setErr('')
      } catch (e: any) {
        if (!silent) setErr(e?.response?.data?.detail || 'Could not load messages')
      } finally {
        if (!silent) setLoading(false)
      }
    },
    [thread_id],
  )

  useEffect(() => {
    load()
    pollTimer.current = setInterval(() => load(true), POLL_MS)
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        if (!pollTimer.current) pollTimer.current = setInterval(() => load(true), POLL_MS)
        load(true)
      } else if (pollTimer.current) {
        clearInterval(pollTimer.current)
        pollTimer.current = null
      }
    })
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current)
      sub.remove()
    }
  }, [load])

  const send = async () => {
    const content = text.trim()
    if (!content || !thread_id) return
    setSending(true)
    try {
      const payload = threadKey ? `ENC:${encryptText(content, threadKey)}` : content
      const replyTo = replying
        ? { id: replying.id, sender: replying.sender, content: replying.content ?? '' }
        : undefined
      await api.post(`/chat/dm/threads/${thread_id}/messages`, { content: payload, type: 'text', reply_to: replyTo })
      setText('')
      setReplying(null)
      await load(true)
    } catch (e: any) {
      setErr(e?.response?.data?.detail || 'Failed to send')
    } finally {
      setSending(false)
    }
  }

  const startEdit = (m: DMMessage) => {
    setEditing(m)
    setEditText(decryptIfEncrypted(m.content ?? '', threadKey))
  }

  const cancelEdit = () => {
    setEditing(null)
    setEditText('')
  }

  const saveEdit = async () => {
    if (!editing) return
    const content = editText.trim()
    if (!content) return
    setSending(true)
    try {
      const payload = threadKey ? `ENC:${encryptText(content, threadKey)}` : content
      await api.patch(`/chat/dm/messages/${editing.id}`, { content: payload })
      setEditing(null)
      setEditText('')
      await load(true)
    } catch (e: any) {
      setErr(e?.response?.data?.detail || 'Failed to edit')
    } finally {
      setSending(false)
    }
  }

  const toggleReact = async (id: string, emoji: string) => {
    try {
      const r = await api.patch(`/chat/dm/messages/${id}/react`, { emoji })
      const reactions = (r.data?.reactions ?? {}) as Record<string, string[]>
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, reactions } : m)))
    } catch (e: any) {
      setErr(e?.response?.data?.detail || 'Failed to react')
    }
  }

  const deleteMsg = async (id: string) => {
    try {
      await api.delete(`/chat/dm/messages/${id}`)
      setMessages((prev) => prev.filter((m) => m.id !== id))
    } catch (e: any) {
      setErr(e?.response?.data?.detail || 'Failed to delete')
    }
  }

  const confirmDelete = async (id: string) => {
    const ok = await confirm({ title: 'Delete message', message: 'Delete this message?', confirmText: 'Delete', destructive: true })
    if (!ok) return
    deleteMsg(id)
  }

  const onLongPress = (m: DMMessage) => {
    showMessageActions({
      isMine: isMine(m),
      onReply: () => setReplying(m),
      onReact: () => showEmojiPicker((emoji) => toggleReact(m.id, emoji)),
      onEdit: () => startEdit(m),
      onDelete: () => confirmDelete(m.id),
    })
  }

  const pickImage = async () => {
    const f = await askImageSourceAsync(overlay)
    if (f) uploadFile(f, 'image')
  }

  const pickDoc = () => {
    pickDocument().then((f) => f && uploadFile(f, 'file'))
  }

  const uploadFile = async (file: PickedFile, type: 'image' | 'file') => {
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', {
        uri: file.uri,
        name: file.name ?? (type === 'image' ? 'photo.jpg' : 'file'),
        type: file.mimeType ?? (type === 'image' ? 'image/jpeg' : 'application/octet-stream'),
      } as any)
      const up = await api.post(`/upload/chat?thread_id=${thread_id}`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 30000,
      })
      const url = (up.data?.url ?? '') as string
      if (!url) throw new Error('Upload returned no URL')
      await api.post(`/chat/dm/threads/${thread_id}/messages`, {
        content: url,
        type,
        file_name: file.name ?? (type === 'image' ? 'photo.jpg' : 'file'),
        file_size: String(file.size ?? 0),
      })
      await load(true)
    } catch (e: any) {
      setErr(e?.response?.data?.detail || e?.message || 'Failed to upload')
    } finally {
      setUploading(false)
    }
  }

  const isMine = (m: DMMessage) => m.sender === user?.username

  const openMenu = async () => {
    if (!peer) return
    const picked = await menu({
      title: peer,
      options: [{ value: 'block', label: 'Block user', destructive: true }],
    })
    if (picked === 'block') blockPeer()
  }

  const blockPeer = async () => {
    if (!peer) return
    const ok = await confirm({ title: 'Block user', message: `Stop ${peer} from messaging you? Existing DMs are kept.`, confirmText: 'Block', destructive: true })
    if (!ok) return
    try {
      await api.post('/chat/dm/blocks', { username: peer })
      await alert({ message: `You've blocked ${peer}.` })
      router.back()
    } catch (e: any) {
      setErr(e?.response?.data?.detail || 'Could not block user')
    }
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.bg }]} edges={['top', 'bottom']}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <Text style={{ color: c.text, fontSize: 18 }}>←</Text>
        </TouchableOpacity>
        <Text style={{ color: c.text, fontSize: 15, fontWeight: '800', flex: 1 }} numberOfLines={1}>
          {peer || 'Direct message'}
        </Text>
        <TouchableOpacity
          onPress={() => {
            if (!thread_id) return
            router.push(`/call?mode=dm&thread_id=${encodeURIComponent(thread_id)}&peer=${encodeURIComponent(peer || '')}` as Href)
          }}
          hitSlop={10}
        >
          <Text style={{ fontSize: 16 }}>📞</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={openMenu} hitSlop={10}>
          <Text style={{ color: c.muted, fontSize: 18, marginLeft: 8 }}>⋯</Text>
        </TouchableOpacity>
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
            onContentSizeChange={() => {
              if (stick.current) listRef.current?.scrollToEnd({ animated: true })
            }}
            onScroll={({ nativeEvent }) => {
              const { layoutMeasurement, contentOffset, contentSize } = nativeEvent
              stick.current = contentSize.height - (contentOffset.y + layoutMeasurement.height) < 80
            }}
            scrollEventThrottle={100}
            ListEmptyComponent={
              <Text style={{ color: c.muted, textAlign: 'center', marginTop: 40, fontSize: 13 }}>
                No messages yet. Say hi!
              </Text>
            }
            renderItem={({ item }) => {
              const mine = isMine(item)
              const isImage = item.type === 'image'
              const reactions = item.reactions ?? {}
              const reactionEntries = Object.entries(reactions)
              let replyContent = ''
              if (item.reply_to?.content) replyContent = item.reply_to.content
              return (
                <MessageRow
                  mine={mine}
                  c={c}
                  theme={theme}
                  item={item}
                  threadKey={threadKey}
                  isImage={isImage}
                  replyContent={replyContent}
                  reactions={reactionEntries}
                  onReply={() => setReplying(item)}
                  onReact={() => showEmojiPicker((emoji) => toggleReact(item.id, emoji))}
                  onEdit={() => startEdit(item)}
                  onDelete={() => confirmDelete(item.id)}
                  onToggleReact={(emoji) => toggleReact(item.id, emoji)}
                  onLongPress={() => onLongPress(item)}
                />
              )
            }}
          />
        )}
      </KeyboardAvoidingView>

      <View style={[styles.inputBar, { borderTopColor: c.border, backgroundColor: c.bg2 }]}>
        {(editing || replying) ? (
          <View style={{ position: 'absolute', top: -42, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: c.bg3, borderTopWidth: 1, borderTopColor: c.border }}>
            <Text style={{ flex: 1, color: c.muted, fontSize: 11, fontStyle: 'italic' }} numberOfLines={1}>
              {editing ? `✏️ Editing: ${decryptIfEncrypted(editing.content ?? '', threadKey)}` : replying ? `↪ Replying to ${replying?.sender}: ${decryptIfEncrypted(replying?.content ?? '', threadKey)}` : ''}
            </Text>
            <TouchableOpacity onPress={() => { cancelEdit(); setReplying(null) }} hitSlop={8}>
              <Text style={{ color: c.danger, fontSize: 12, fontWeight: '700' }}>✕</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        <TouchableOpacity onPress={pickImage} disabled={uploading} hitSlop={8} style={{ paddingRight: 2 }}>
          <Text style={{ fontSize: 18, opacity: uploading ? 0.4 : 1 }}>{uploading ? '⏳' : '🖼️'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={pickDoc} disabled={uploading} hitSlop={8} style={{ paddingRight: 2 }}>
          <Text style={{ fontSize: 18, opacity: uploading ? 0.4 : 1 }}>📎</Text>
        </TouchableOpacity>
        <TextInput
          value={editing ? editText : text}
          onChangeText={editing ? setEditText : setText}
          placeholder={editing ? 'Edit message…' : 'Type a message…'}
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
          onPress={editing ? saveEdit : send}
          disabled={sending || !(editing ? editText : text).trim()}
          style={[styles.sendBtn, { backgroundColor: c.accent, opacity: sending || !(editing ? editText : text).trim() ? 0.5 : 1 }]}
        >
          <Text style={{ color: theme.dark ? '#000' : '#fff', fontWeight: '800', fontSize: 13 }}>
            {sending ? '…' : editing ? 'Save' : 'Send'}
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