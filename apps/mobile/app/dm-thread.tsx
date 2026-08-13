import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { FONT, SPACE, frameworkStyles } from '@/src/design'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
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
import { Icon } from '@/src/components/icon'
import { useTheme } from '@/src/theme'
import { useAuth } from '@/src/lib/auth'
import { api } from '@/src/lib/api'
import { encryptText, decryptIfEncrypted } from '@/src/lib/chat-encryption'
import { useMessageActions, useSwipeToReply } from '@/src/lib/chat-actions'
import { useOverlay } from '@/src/components/overlay'
import { Loader } from '@/src/components/Loader'
import { VoiceRecorder, VoiceNotePlay } from '@/src/components/VoiceNote'
import { withAlpha, contrastText } from '@/src/lib/color'

interface DMMessage {
  id: string
  thread_id: string
  sender: string
  type?: string
  content?: string
  file_name?: string
  file_size?: string
  duration?: string
  reply_to?: { id: string; sender: string; content: string } | null
  reactions?: Record<string, string[]>
  created_at?: string
  edited?: boolean
}

interface DMThreadPayload {
  messages: DMMessage[]
  read_state?: Record<string, string>
  peer?: string
}

const POLL_MS = 4000
const PAGE_SIZE = 50

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
  body: string
  replyBody: string
  isImage: boolean
  isVoice: boolean
  reactions: [string, string[]][]
  onReply: () => void
  onReact: () => void
  onEdit: () => void
  onDelete: () => void
  onToggleReact: (emoji: string) => void
  onLongPress: () => void
}

function MessageRow(props: RowProps) {
  const { mine, c, theme, item, body, replyBody, isImage, isVoice, reactions, onReply, onReact, onEdit, onDelete, onToggleReact, onLongPress } = props
  const { pan, panHandlers } = useSwipeToReply({ onReply })
  const mineText = mine ? contrastText(c.accent2) : c.text
  const mineMuted = mine ? withAlpha(contrastText(c.accent2), 0.65) : c.muted
  const radius = frameworkStyles(theme).radius

  return (
    <View style={{ marginBottom: SPACE.lg }}>
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
                borderRadius: radius,
              },
            ]}
          >
            {replyBody ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.xs, marginBottom: SPACE.xs }}>
                <Icon name="reply" size={FONT.sm} color={c.muted} />
                <Text style={{ color: c.muted, fontSize: FONT.sm, fontStyle: 'italic', flexShrink: 1 }}>
                  {replyBody}
                </Text>
              </View>
            ) : null}
            {isImage ? (
              <ExpoImage
                source={{ uri: item.content }}
                style={{ width: 220, height: 220, borderRadius: 10 }}
                contentFit="cover"
                transition={150}
              />
            ) : isVoice ? (
              <VoiceNotePlay uri={item.content} duration={item.duration} color={mine ? mineText : c.accent2} />
            ) : (
              <Text style={{ color: mine ? mineText : c.text, fontSize: FONT.base, lineHeight: 19 }}>
                {body}
              </Text>
            )}
            {item.type === 'file' && item.file_name ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.xs, marginTop: SPACE.sm }}>
                <Icon name="attach" size={FONT.body} color={mine ? mineText : c.text} />
                <Text style={{ fontSize: FONT.body, color: mine ? mineText : c.text }}>{item.file_name}</Text>
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: SPACE.sm, marginTop: SPACE.xs }}>
              <Text style={{ color: mine ? mineMuted : c.muted, fontSize: FONT.xs }}>
                {fmtTime(item.created_at)}
                {item.edited ? ' · edited' : ''}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      </Animated.View>
      {reactions.length > 0 ? (
        <View style={{ flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.xs, justifyContent: mine ? 'flex-end' : 'flex-start' }}>
          {reactions.map(([emoji, usernames]) => (
            <TouchableOpacity
              key={emoji}
              onPress={() => onToggleReact(emoji)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: SPACE.xs,
                paddingHorizontal: SPACE.md,
                paddingVertical: SPACE.xxs,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: c.border,
                backgroundColor: c.bg2,
              }}
            >
              <Text style={{ fontSize: FONT.body }}>{emoji}</Text>
              <Text style={{ color: c.muted, fontSize: FONT.sm }}>{usernames.length}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', gap: SPACE.xl, marginTop: SPACE.xs, justifyContent: mine ? 'flex-end' : 'flex-start' }}>
        <TouchableOpacity onPress={onReply} hitSlop={8}>
          <Text style={{ color: c.muted, fontSize: FONT.sm, fontWeight: '700' }}>Reply</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onReact} hitSlop={8}>
          <Text style={{ color: c.muted, fontSize: FONT.sm, fontWeight: '700' }}>React</Text>
        </TouchableOpacity>
        {mine ? (
          <>
            <TouchableOpacity onPress={onEdit} hitSlop={8}>
              <Text style={{ color: c.muted, fontSize: FONT.sm, fontWeight: '700' }}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onDelete} hitSlop={8}>
              <Text style={{ color: c.danger, fontSize: FONT.sm, fontWeight: '700' }}>Delete</Text>
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
  const radius = frameworkStyles(theme).radius
  const pillRadius = frameworkStyles(theme).buttonRadius
  const { user } = useAuth()
  const overlay = useOverlay()
  const { confirm, menu, alert } = overlay
  const { showMessageActions, showEmojiPicker } = useMessageActions()

  const [messages, setMessages] = useState<DMMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [err, setErr] = useState('')
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [threadKey, setThreadKey] = useState('')
  const [editing, setEditing] = useState<DMMessage | null>(null)
  const [editText, setEditText] = useState('')
  const [replying, setReplying] = useState<DMMessage | null>(null)
  const [peerLastRead, setPeerLastRead] = useState('')
  const [typing, setTyping] = useState<string[]>([])
  const listRef = useRef<FlatList<DMMessage>>(null)
  const stick = useRef(true)
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isTyping = useRef(false)

  // Decrypt once per message when messages/threadKey change; renderItem then
  // only does map lookups instead of a fresh AES-GCM decrypt per row per render.
  const decryptedBodies = useMemo(() => {
    const map: Record<string, string> = {}
    if (threadKey) {
      for (const m of messages) {
        if (m.content && m.content.startsWith('ENC:')) map[`${m.id}:body`] = decryptIfEncrypted(m.content, threadKey)
        if (m.reply_to?.content && m.reply_to.content.startsWith('ENC:')) {
          map[`${m.id}:reply`] = decryptIfEncrypted(m.reply_to.content, threadKey)
        }
      }
    }
    return map
  }, [messages, threadKey])

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
        const payload = (r.data ?? {}) as DMThreadPayload
        const rows = Array.isArray(payload) ? (payload as unknown as DMMessage[]) : payload.messages
        setMessages(rows)
        setPeerLastRead(payload.read_state?.[payload.peer ?? ''] ?? '')
        setErr('')
      } catch (e: any) {
        if (!silent) setErr(e?.response?.data?.detail || 'Could not load messages')
      } finally {
        if (!silent) setLoading(false)
      }
    },
    [thread_id],
  )

  /** Load older messages (pagination) prepended above the current first one. */
  const loadOlder = useCallback(async () => {
    if (!thread_id || messages.length === 0 || loadingOlder) return
    const before = messages[0].created_at
    if (!before) return
    setLoadingOlder(true)
    try {
      const r = await api.get(`/chat/dm/threads/${thread_id}/messages`, { params: { limit: PAGE_SIZE, before } })
      const payload = (r.data ?? {}) as DMThreadPayload
      const older = Array.isArray(payload) ? (payload as unknown as DMMessage[]) : payload.messages
      if (older.length > 0) setMessages((prev) => [...older, ...prev])
    } catch {
      /* keep current history on error */
    } finally {
      setLoadingOlder(false)
    }
  }, [thread_id, messages, loadingOlder])

  useEffect(() => {
    load()
    pollTimer.current = setInterval(() => load(true), POLL_MS)
    const pollTyping = () => {
      api
        .get(`/chat/dm/threads/${thread_id}/typing`)
        .then((r) => setTyping((r.data ?? []) as string[]))
        .catch(() => {})
    }
    pollTyping()
    const typingTimer = setInterval(pollTyping, 3000)
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        if (!pollTimer.current) pollTimer.current = setInterval(() => load(true), POLL_MS)
        load(true)
        pollTyping()
      } else if (pollTimer.current) {
        clearInterval(pollTimer.current)
        pollTimer.current = null
      }
    })
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current)
      clearInterval(typingTimer)
      sub.remove()
    }
  }, [load, thread_id])

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

  /** Heartbeat to the server that we're typing (throttled to ~2s). */
  const heartbeatTyping = useCallback(() => {
    if (!thread_id || isTyping.current) return
    isTyping.current = true
    api.post(`/chat/dm/threads/${thread_id}/typing`).catch(() => {})
    if (typingTimer.current) clearTimeout(typingTimer.current)
    typingTimer.current = setTimeout(() => {
      isTyping.current = false
    }, 2500)
  }, [thread_id])

  const onTextChange = (t: string) => {
    if (editing) setEditText(t)
    else setText(t)
    heartbeatTyping()
  }

  const uploadVoice = async (uri: string, durSec: number) => {
    if (!thread_id) return
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', {
        uri,
        name: 'voice.m4a',
        type: 'audio/mp4',
      } as any)
      const up = await api.post(`/upload/chat?thread_id=${thread_id}`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 30000,
      })
      const url = (up.data?.url ?? '') as string
      if (!url) throw new Error('Upload returned no URL')
      await api.post(`/chat/dm/threads/${thread_id}/messages`, {
        content: url,
        type: 'voice',
        file_name: 'voice.m4a',
        file_size: String(up.data?.size ?? 0),
        duration: String(Math.max(1, Math.round(durSec))),
      })
      await load(true)
    } catch (e: any) {
      setErr(e?.response?.data?.detail || e?.message || 'Failed to send voice note')
    } finally {
      setUploading(false)
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
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back" hitSlop={10} style={styles.backBtn}>
          <Icon name="back" size={22} color={c.text} />
        </TouchableOpacity>
        <Text style={{ color: c.text, fontSize: FONT.card, fontWeight: '800', flex: 1 }} numberOfLines={1}>
          {peer || 'Direct message'}
        </Text>
        <TouchableOpacity
          onPress={() => {
            if (!thread_id) return
            router.push(`/call?mode=dm&thread_id=${encodeURIComponent(thread_id)}&peer=${encodeURIComponent(peer || '')}` as Href)
          }}
          hitSlop={10}
        >
          <Icon name="phone" size={FONT.section} color={c.text} />
        </TouchableOpacity>
        <TouchableOpacity onPress={openMenu} hitSlop={10}>
          <Icon name="more" size={FONT.lead} color={c.muted} style={{ marginLeft: SPACE.md }} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {loading ? (
          <View style={{ paddingTop: SPACE.colossal, alignItems: 'center' }}>
            <Loader compact />
          </View>
        ) : err && messages.length === 0 ? (
          <View style={{ padding: SPACE.giant, alignItems: 'center' }}>
            <Text style={{ color: c.danger, textAlign: 'center' }}>{err}</Text>
            <TouchableOpacity onPress={() => load()} style={{ marginTop: SPACE.xxl }}>
              <Text style={{ color: c.accent, fontWeight: '700' }}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            contentContainerStyle={{ padding: SPACE.xl, paddingBottom: SPACE.giant }}
            onContentSizeChange={() => {
              if (stick.current) listRef.current?.scrollToEnd({ animated: true })
            }}
            onScroll={({ nativeEvent }) => {
              const { layoutMeasurement, contentOffset, contentSize } = nativeEvent
              stick.current = contentSize.height - (contentOffset.y + layoutMeasurement.height) < 80
            }}
            scrollEventThrottle={100}
            ListHeaderComponent={
              loadingOlder ? (
                <View style={{ paddingVertical: SPACE.lg, alignItems: 'center' }}>
                  <Loader compact />
                </View>
              ) : messages.length >= PAGE_SIZE ? (
                <TouchableOpacity onPress={loadOlder} style={{ paddingVertical: SPACE.lg, alignItems: 'center' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
                    <Icon name="up" size={FONT.md} color={c.accent} />
                    <Text style={{ color: c.accent, fontWeight: '700', fontSize: FONT.md }}>Load older</Text>
                  </View>
                </TouchableOpacity>
              ) : null
            }
            ListEmptyComponent={
              <Text style={{ color: c.muted, textAlign: 'center', marginTop: SPACE.colossal, fontSize: FONT.body }}>
                No messages yet. Say hi!
              </Text>
            }
            renderItem={({ item }) => {
              const mine = isMine(item)
              const isImage = item.type === 'image'
              const isVoice = item.type === 'voice'
              const reactions = item.reactions ?? {}
              const reactionEntries = Object.entries(reactions)
              const body = decryptedBodies[`${item.id}:body`] ?? item.content ?? ''
              const replyBody = item.reply_to?.content ? (decryptedBodies[`${item.id}:reply`] ?? item.reply_to.content) : ''
              // Read receipt: mark my last message as seen when the peer read it.
              const seen = mine && item.created_at && peerLastRead && item.created_at <= peerLastRead
              return (
                <>
                  <MessageRow
                    mine={mine}
                    c={c}
                    theme={theme}
                    item={item}
                    body={body}
                    replyBody={replyBody}
                    isImage={isImage}
                    isVoice={isVoice}
                    reactions={reactionEntries}
                    onReply={() => setReplying(item)}
                    onReact={() => showEmojiPicker((emoji) => toggleReact(item.id, emoji))}
                    onEdit={() => startEdit(item)}
                    onDelete={() => confirmDelete(item.id)}
                    onToggleReact={(emoji) => toggleReact(item.id, emoji)}
                    onLongPress={() => onLongPress(item)}
                  />
                  {seen ? (
                    <View style={{ alignItems: 'flex-end', marginTop: -4, marginBottom: SPACE.xs }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.xs }}>
                        <Icon name="check" size={FONT.xs + 1} color={c.muted} />
                        <Text style={{ color: c.muted, fontSize: FONT.xs }}>seen</Text>
                      </View>
                    </View>
                  ) : null}
                </>
              )
            }}
          />
        )}
      </KeyboardAvoidingView>

      <View style={[styles.inputBar, { borderTopColor: c.border, backgroundColor: c.bg2 }]}>
        {typing.length > 0 ? (
          <View style={{ position: 'absolute', top: -26, left: 0, right: 0, alignItems: 'center' }}>
            <Text style={{ color: c.muted, fontSize: FONT.sm, fontStyle: 'italic' }}>
              {typing[0]}
              {typing.length > 1 ? ` +${typing.length - 1} others` : ''} typing…
            </Text>
          </View>
        ) : null}
        {(editing || replying) ? (
          <View style={{ position: 'absolute', top: -42, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: SPACE.md, paddingHorizontal: SPACE.xl, paddingVertical: SPACE.sm, backgroundColor: c.bg3, borderTopWidth: 1, borderTopColor: c.border }}>
            <Icon name={editing ? 'edit' : 'reply'} size={FONT.sm} color={c.accent2} />
            <Text style={{ flex: 1, color: c.muted, fontSize: FONT.sm, fontStyle: 'italic' }} numberOfLines={1}>
              {editing ? `Editing: ${decryptIfEncrypted(editing.content ?? '', threadKey)}` : `Replying to ${replying?.sender}: ${decryptIfEncrypted(replying?.content ?? '', threadKey)}`}
            </Text>
            <TouchableOpacity onPress={() => { cancelEdit(); setReplying(null) }} hitSlop={8}>
              <Icon name="close" size={FONT.md} color={c.danger} />
            </TouchableOpacity>
          </View>
        ) : null}
        <TouchableOpacity onPress={pickImage} disabled={uploading} hitSlop={8} style={{ paddingRight: SPACE.xxs }}>
          <Icon name="image" size={FONT.lead} color={c.text} style={uploading ? { opacity: 0.4 } : undefined} />
        </TouchableOpacity>
        <TouchableOpacity onPress={pickDoc} disabled={uploading} hitSlop={8} style={{ paddingRight: SPACE.xxs }}>
          <Icon name="attach" size={FONT.lead} color={c.text} style={uploading ? { opacity: 0.4 } : undefined} />
        </TouchableOpacity>
        <VoiceRecorder onRecorded={uploadVoice} onError={(m) => setErr(m)} />
        <TextInput
          value={editing ? editText : text}
          onChangeText={onTextChange}
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
              borderRadius: pillRadius,
            },
          ]}
        />
        <TouchableOpacity
          onPress={editing ? saveEdit : send}
          disabled={sending || !(editing ? editText : text).trim()}
          style={[styles.sendBtn, { backgroundColor: c.accent, borderRadius: pillRadius, opacity: sending || !(editing ? editText : text).trim() ? 0.5 : 1 }]}
        >
          <Text style={{ color: c.onAccent, fontWeight: '800', fontSize: FONT.body }}>
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
    gap: SPACE.lg,
    paddingHorizontal: SPACE.xl,
    paddingVertical: SPACE.lg,
    borderBottomWidth: 1,
  },
  backBtn: { paddingRight: SPACE.xs },
  bubble: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: SPACE.xl,
    paddingVertical: SPACE.md,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: SPACE.md,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.md,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: SPACE.xl,
    paddingVertical: 9,
    maxHeight: 100,
    fontSize: FONT.base,
  },
  sendBtn: {
    borderRadius: 8,
    paddingHorizontal: SPACE.xxxl,
    paddingVertical: 11,
    alignItems: 'center',
  },
})