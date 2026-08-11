import { useEffect, useRef, useState, useCallback } from 'react'
import { FONT, SPACE, frameworkStyles } from '@/src/design'
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
  Linking,
  Pressable,
  AppState,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { askImageSourceAsync, pickDocument, type PickedFile } from '@/src/lib/media'
import { Image as ExpoImage } from 'expo-image'
import { Icon } from '@/src/components/icon'
import { useTheme } from '@/src/theme'
import { useAuth } from '@/src/lib/auth'
import { api } from '@/src/lib/api'
import { encryptText, decryptIfEncrypted } from '@/src/lib/chat-encryption'
import { useMessageActions, SwipeReplyRow } from '@/src/lib/chat-actions'
import { MarkdownText } from '@/src/components/markdown'
import { useOverlay } from '@/src/components/overlay'
import { withAlpha, contrastText } from '@/src/lib/color'

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

interface LinkPreview {
  title?: string
  description?: string
  image?: string
  site?: string
  url?: string
}

const POLL_MS = 4000
const TYPING_INTERVAL = 3000
const TYPING_EMOJIS = ['👍', '❤️', '🔥', '😂', '🎉', '😮', '👀', '💯']

function fmtTime(iso?: string) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

function fmtSize(size?: string) {
  const n = parseInt(size || '0', 10)
  if (!n) return ''
  if (n > 1048576) return `${(n / 1048576).toFixed(1)} MB`
  if (n > 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${n} B`
}

const URL_RE = /\bhttps?:\/\/[^\s<>"']{6,}\b/i

function extractUrl(content?: string): string {
  if (!content) return ''
  const m = content.match(URL_RE)
  return m ? m[0] : ''
}

function isImageUrl(url: string) {
  return /\.(jpe?g|png|gif|webp)(\?.*)?$/i.test(url)
}

export default function ChatRoomScreen() {
  const { room, name } = useLocalSearchParams<{ room: string; name?: string }>()
  const router = useRouter()
  const { theme } = useTheme()
  const c = theme.colors
  const radius = frameworkStyles(theme).radius
  const pillRadius = frameworkStyles(theme).buttonRadius
  const { user } = useAuth()
  const overlay = useOverlay()
  const { confirm } = overlay
  const { showMessageActions, showEmojiPicker } = useMessageActions()

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [err, setErr] = useState('')
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [roomKey, setRoomKey] = useState('')
  const [editing, setEditing] = useState<ChatMessage | null>(null)
  const [editText, setEditText] = useState('')
  const [replying, setReplying] = useState<ChatMessage | null>(null)
  const [reactTarget, setReactTarget] = useState<ChatMessage | null>(null)
  const [previews, setPreviews] = useState<Record<string, LinkPreview>>({})
  const [uploading, setUploading] = useState(false)
  const [typingUsers, setTypingUsers] = useState<string[]>([])
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQ, setSearchQ] = useState('')
  const [searchResults, setSearchResults] = useState<ChatMessage[] | null>(null)
  const [searching, setSearching] = useState(false)
  const listRef = useRef<FlatList<ChatMessage>>(null)
  const stick = useRef(true)
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pageRef = useRef(1)

  const roomName = name || 'Chat'

  useEffect(() => {
    if (!room) return
    api
      .get(`/chat/rooms/${room}/encryption-key`)
      .then((r) => setRoomKey((r.data?.encryption_key ?? '') as string))
      .catch(() => setRoomKey(''))
  }, [room])

  const load = useCallback(
    async (silent = false) => {
      if (!room) return
      try {
        const r = await api.get(`/chat/rooms/${room}/messages`, { params: { limit: 100 } })
        const rows = (r.data ?? []) as ChatMessage[]
        setMessages(rows)
        setHasMore(rows.length >= 100)
        pageRef.current = 1
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

  const loadOlder = async () => {
    if (!room || !messages.length || loadingMore) return
    const oldest = messages[0].created_at
    setLoadingMore(true)
    try {
      const r = await api.get(`/chat/rooms/${room}/messages`, {
        params: { limit: 100, before: oldest },
      })
      const older = (r.data ?? []) as ChatMessage[]
      setMessages((prev) => [...older, ...prev])
      setHasMore(older.length >= 100)
      pageRef.current += 1
    } catch (e: any) {
      setErr(e?.response?.data?.detail || 'Could not load older messages')
    } finally {
      setLoadingMore(false)
    }
  }

  const sendTyping = useCallback(() => {
    if (!room || !text.trim()) return
    api.post(`/chat/rooms/${room}/typing`).catch(() => {})
  }, [room, text])

  const onChangeText = (v: string) => {
    if (editing) {
      setEditText(v)
      return
    }
    setText(v)
    if (typingTimer.current) clearTimeout(typingTimer.current)
    typingTimer.current = setTimeout(sendTyping, 300)
  }

  useEffect(() => {
    const t = setInterval(() => {
      if (!room) return
      api
        .get(`/chat/rooms/${room}/typing`)
        .then((r) => setTypingUsers((r.data ?? []) as string[]))
        .catch(() => {})
    }, POLL_MS)
    return () => clearInterval(t)
  }, [room])

  const send = async () => {
    const content = text.trim()
    if (!content || !room) return
    setSending(true)
    try {
      const payload = roomKey ? `ENC:${encryptText(content, roomKey)}` : content
      const replyTo = replying
        ? { id: replying.id, sender: replying.sender, content: replying.content ?? '' }
        : undefined
      await api.post(`/chat/rooms/${room}/messages`, { content: payload, type: 'text', reply_to: replyTo })
      setText('')
      setReplying(null)
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

  const confirmDelete = async (id: string) => {
    const ok = await confirm({ title: 'Delete message', message: 'Delete this message?', confirmText: 'Delete', destructive: true })
    if (!ok) return
    deleteMsg(id)
  }

  const startEdit = (m: ChatMessage) => {
    setEditing(m)
    setEditText(decryptIfEncrypted(m.content ?? '', roomKey))
  }

  const cancelEdit = () => {
    setEditing(null)
    setEditText('')
  }

  const saveEdit = async () => {
    if (!editing) return
    const content = editText.trim()
    if (!content) return
    try {
      const payload = roomKey ? `ENC:${encryptText(content, roomKey)}` : content
      await api.patch(`/chat/messages/${editing.id}`, { content: payload })
      setEditing(null)
      setEditText('')
      await load(true)
    } catch (e: any) {
      setErr(e?.response?.data?.detail || 'Failed to edit')
    }
  }

  const openLink = (url: string) => {
    Linking.openURL(url).catch(() => setErr('Could not open link'))
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
      const up = await api.post(`/upload/chat?room_id=${room}`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 30000,
      })
      const url = (up.data?.url ?? '') as string
      if (!url) throw new Error('Upload returned no URL')
      await api.post(`/chat/rooms/${room}/messages`, {
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

  const loadPreview = useCallback(
    async (id: string, url: string) => {
      if (previews[id]) return
      try {
        const r = await api.get('/chat/link-preview', { params: { url }, timeout: 8000 })
        setPreviews((prev) => ({ ...prev, [id]: (r.data ?? {}) as LinkPreview }))
      } catch {
        setPreviews((prev) => ({ ...prev, [id]: { url } }))
      }
    },
    [previews],
  )

  useEffect(() => {
    for (const m of messages) {
      const url = extractUrl(m.content)
      if (url) loadPreview(m.id, url)
    }
  }, [messages, loadPreview])

  const toggleReact = async (id: string, emoji: string) => {
    try {
      const r = await api.patch(`/chat/messages/${id}/react`, { emoji })
      const reactions = (r.data?.reactions ?? {}) as Record<string, string[]>
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, reactions } : m)))
    } catch {
      setErr('Failed to react')
    }
  }

  const runSearch = useCallback(
    async (q: string) => {
      if (!room || !q.trim()) {
        setSearchResults(null)
        return
      }
      setSearching(true)
      try {
        const r = await api.get(`/chat/rooms/${room}/search`, { params: { q: q.trim(), limit: 50 } })
        setSearchResults((r.data ?? []) as ChatMessage[])
      } catch {
        setSearchResults([])
      } finally {
        setSearching(false)
      }
    },
    [room],
  )

  const onSearchInput = (q: string) => {
    setSearchQ(q)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => runSearch(q), 400)
  }

  const jumpTo = (id: string) => {
    setSearchOpen(false)
    setSearchResults(null)
    setSearchQ('')
    setTimeout(() => listRef.current?.scrollToItem?.({ item: { id } as any, animated: true }), 100)
  }

  const isMine = (m: ChatMessage) => m.sender === user?.username

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.bg }]} edges={['top', 'bottom']}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <Icon name="back" size={22} color={c.text} />
        </TouchableOpacity>
        <Text style={{ color: c.text, fontSize: FONT.card, fontWeight: '800', flex: 1 }} numberOfLines={1}>
          {searchOpen ? 'Search chat' : roomName}
        </Text>
        {!searchOpen ? (
          <TouchableOpacity onPress={() => setSearchOpen(true)} hitSlop={10}>
            <Icon name="search" size={FONT.section} color={c.text} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={() => {
              setSearchOpen(false)
              setSearchQ('')
              setSearchResults(null)
            }}
            hitSlop={10}
          >
            <Text style={{ color: c.danger, fontWeight: '700', fontSize: FONT.md }}>Close</Text>
          </TouchableOpacity>
        )}
      </View>

      {searchOpen ? (
        <View style={{ borderBottomWidth: 1, borderBottomColor: c.border, padding: SPACE.lg, gap: SPACE.md }}>
          <TextInput
            value={searchQ}
            onChangeText={onSearchInput}
            placeholder="Search messages, senders, files…"
            placeholderTextColor={c.muted}
            autoFocus
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
          {searching ? (
            <ActivityIndicator color={c.accent} size="small" />
          ) : searchResults !== null ? (
            searchResults.length === 0 ? (
              <Text style={{ color: c.muted, fontSize: FONT.md }}>No matches.</Text>
            ) : (
              <FlatList
                data={searchResults}
                keyExtractor={(m) => m.id}
                style={{ maxHeight: 260 }}
                renderItem={({ item }) => {
                  const body = decryptIfEncrypted(item.content, roomKey)
                  return (
                    <TouchableOpacity
                      onPress={() => jumpTo(item.id)}
                      style={{ paddingVertical: SPACE.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border }}
                    >
                      <Text style={{ color: c.accent2, fontSize: FONT.sm, fontWeight: '700' }}>{item.sender}</Text>
                      {item.type === 'image' || item.type === 'file' ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
                          <Icon name={item.type === 'image' ? 'image' : 'attach'} size={FONT.body} color={c.muted} />
                          <Text style={{ color: c.text, fontSize: FONT.body, flexShrink: 1 }} numberOfLines={2}>
                            {item.type === 'image' ? 'Image' : item.file_name ?? 'file'}
                          </Text>
                        </View>
                      ) : (
                        <Text style={{ color: c.text, fontSize: FONT.body }} numberOfLines={2}>
                          {body || item.content}
                        </Text>
                      )}
                    </TouchableOpacity>
                  )
                }}
              />
            )
          ) : null}
        </View>
      ) : null}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {loading ? (
          <View style={{ paddingTop: SPACE.colossal, alignItems: 'center' }}>
            <ActivityIndicator color={c.accent} />
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
              hasMore || loadingMore ? (
                <TouchableOpacity
                  onPress={loadOlder}
                  disabled={loadingMore}
                  style={{ alignItems: 'center', paddingVertical: SPACE.lg, marginBottom: SPACE.sm }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
                    <Icon name="up" size={FONT.md} color={c.accent} />
                    <Text style={{ color: c.accent, fontSize: FONT.md, fontWeight: '700' }}>
                      {loadingMore ? 'Loading…' : 'Load earlier'}
                    </Text>
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
              const mineText = mine ? contrastText(c.accent2) : c.text
              const mineMuted = mine ? withAlpha(mineText, 0.65) : c.muted
              const reactions = item.reactions ?? {}
              const reactionEntries = Object.entries(reactions)
              const isImage = item.type === 'image' || isImageUrl(item.content ?? '')
              const linkUrl = !isImage ? extractUrl(item.content ?? '') : ''
              const preview = linkUrl ? previews[item.id] : undefined
              let replyContent = ''
              if (item.reply_to?.content) replyContent = item.reply_to.content
              const body = decryptIfEncrypted(item.content, roomKey)
              const onLongPress = () =>
                showMessageActions({
                  isMine: mine,
                  onReply: () => setReplying(item),
                  onReact: () => setReactTarget(item),
                  onEdit: () => startEdit(item),
                  onDelete: () => confirmDelete(item.id),
                })
              return (
                <View style={{ marginBottom: SPACE.lg }}>
                  <SwipeReplyRow onReply={() => setReplying(item)}>
                    <View style={{ alignItems: mine ? 'flex-end' : 'flex-start' }}>
                      <Pressable
                        onLongPress={onLongPress}
                        delayLongPress={350}
                        style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
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
                          {!mine ? (
                            <Text style={{ color: c.accent2, fontSize: FONT.sm, fontWeight: '700', marginBottom: 3 }}>
                              {item.sender}
                              {item.role && item.role !== 'member' ? ` · ${item.role}` : ''}
                            </Text>
                          ) : null}
                          {replyContent ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.xs, marginBottom: SPACE.xs }}>
                              <Icon name="reply" size={FONT.sm} color={c.muted} />
                              <Text style={{ color: c.muted, fontSize: FONT.sm, fontStyle: 'italic', flexShrink: 1 }}>
                                {decryptIfEncrypted(replyContent, roomKey)}
                              </Text>
                            </View>
                          ) : null}
                          {isImage ? (
                            <TouchableOpacity onPress={() => openLink(item.content ?? '')}>
                              <ExpoImage
                                source={{ uri: item.content }}
                                style={{ width: 220, height: 220, borderRadius: 10 }}
                                contentFit="cover"
                                transition={150}
                              />
                            </TouchableOpacity>
                          ) : (
                            <MarkdownText
                              content={body || item.content}
                              color={mine ? mineText : c.text}
                              onLink={openLink}
                            />
                          )}
                          {item.type === 'file' && item.file_name ? (
                            <TouchableOpacity
                              onPress={() => openLink(item.content ?? '')}
                              style={{ marginTop: SPACE.sm, flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}
                            >
                              <Icon name="attach" size={FONT.card} color={mine ? mineText : c.text} />
                              <Text style={{ color: mine ? mineText : c.text, fontSize: FONT.body, fontWeight: '600' }}>
                                {item.file_name} {item.file_size ? `(${fmtSize(item.file_size)})` : ''}
                              </Text>
                            </TouchableOpacity>
                          ) : null}
                          {preview && preview.title ? (
                            <TouchableOpacity onPress={() => openLink(preview.url ?? item.content ?? '')}>
                              <View
                                style={[
                                  styles.previewCard,
                                  {
                                    backgroundColor: mine ? withAlpha(mineText, 0.1) : c.bg,
                                    borderColor: mine ? withAlpha(mineText, 0.25) : c.border,
                                  },
                                ]}
                              >
                                {preview.image ? (
                                  <ExpoImage
                                    source={{ uri: preview.image }}
                                    style={{ width: '100%', height: 120, borderTopLeftRadius: 10, borderTopRightRadius: 10 }}
                                    contentFit="cover"
                                  />
                                ) : null}
                                <View style={{ padding: SPACE.md }}>
                                  {preview.site ? (
                                    <Text style={{ color: mine ? mineMuted : c.muted, fontSize: FONT.xs, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                      {preview.site}
                                    </Text>
                                  ) : null}
                                  <Text style={{ color: mine ? mineText : c.text, fontSize: FONT.md, fontWeight: '700', marginTop: SPACE.xxs }}>
                                    {preview.title}
                                  </Text>
                                  {preview.description ? (
                                    <Text style={{ color: mine ? mineMuted : c.muted, fontSize: FONT.sm, marginTop: SPACE.xxs }} numberOfLines={2}>
                                      {preview.description}
                                    </Text>
                                  ) : null}
                                </View>
                              </View>
                            </TouchableOpacity>
                          ) : null}
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: SPACE.sm, marginTop: SPACE.xs }}>
                            <Text style={{ color: mine ? mineMuted : c.muted, fontSize: FONT.xs }}>
                              {fmtTime(item.created_at)}
                              {item.edited ? ' · edited' : ''}
                            </Text>
                          </View>
                        </View>
                      </Pressable>
                    </View>
                  </SwipeReplyRow>
                  {reactionEntries.length > 0 ? (
                    <View style={{ flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.xs, justifyContent: mine ? 'flex-end' : 'flex-start' }}>
                      {reactionEntries.map(([emoji, usernames]) => (
                        <TouchableOpacity
                          key={emoji}
                          onPress={() => toggleReact(item.id, emoji)}
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
                    <TouchableOpacity onPress={() => setReplying(item)} hitSlop={8}>
                      <Text style={{ color: c.muted, fontSize: FONT.sm, fontWeight: '700' }}>Reply</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => showEmojiPicker((emoji) => toggleReact(item.id, emoji))} hitSlop={8}>
                      <Text style={{ color: c.muted, fontSize: FONT.sm, fontWeight: '700' }}>React</Text>
                    </TouchableOpacity>
                    {mine ? (
                      <>
                        <TouchableOpacity onPress={() => startEdit(item)} hitSlop={8}>
                          <Text style={{ color: c.muted, fontSize: FONT.sm, fontWeight: '700' }}>Edit</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => confirmDelete(item.id)} hitSlop={8}>
                          <Text style={{ color: c.danger, fontSize: FONT.sm, fontWeight: '700' }}>Delete</Text>
                        </TouchableOpacity>
                      </>
                    ) : null}
                  </View>
                </View>
              )
            }}
          />
        )}
      </KeyboardAvoidingView>

      {reactTarget ? (
        <View style={[styles.reactBar, { borderTopColor: c.border, backgroundColor: c.bg2 }]}>
          <Text style={{ color: c.muted, fontSize: FONT.sm, marginRight: SPACE.sm }}>React to</Text>
          {TYPING_EMOJIS.map((e) => (
            <TouchableOpacity
              key={e}
              onPress={() => {
                toggleReact(reactTarget.id, e)
                setReactTarget(null)
              }}
              style={{ paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm }}
            >
              <Text style={{ fontSize: FONT.h3 }}>{e}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity onPress={() => setReactTarget(null)} hitSlop={8} style={{ marginLeft: 'auto' }}>
            <Icon name="close" size={FONT.base} color={c.danger} />
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={[styles.inputBar, { borderTopColor: c.border, backgroundColor: c.bg2 }]}>
        {editing ? (
          <TouchableOpacity onPress={cancelEdit} hitSlop={8} style={{ paddingRight: SPACE.sm }}>
            <Icon name="close" size={FONT.body} color={c.danger} />
          </TouchableOpacity>
        ) : null}
        {!editing ? (
          <>
            <TouchableOpacity onPress={pickImage} disabled={uploading} hitSlop={8} style={{ paddingRight: SPACE.xxs }}>
              <Icon name="image" size={FONT.lead} color={c.text} style={uploading ? { opacity: 0.4 } : undefined} />
            </TouchableOpacity>
            <TouchableOpacity onPress={pickDoc} disabled={uploading} hitSlop={8} style={{ paddingRight: SPACE.xxs }}>
              <Icon name="attach" size={FONT.lead} color={c.text} style={uploading ? { opacity: 0.4 } : undefined} />
            </TouchableOpacity>
          </>
        ) : null}
        <View style={{ flex: 1 }}>
          {replying ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md, marginBottom: SPACE.xs }}>
              <Icon name="reply" size={FONT.sm} color={c.accent2} />
              <Text style={{ color: c.accent2, fontSize: FONT.sm, fontWeight: '700', flex: 1 }} numberOfLines={1}>
                Reply to {replying.sender}: {decryptIfEncrypted(replying.content ?? '', roomKey) || '(image/file)'}
              </Text>
              <TouchableOpacity onPress={() => setReplying(null)} hitSlop={8}>
                <Icon name="close" size={FONT.md} color={c.danger} />
              </TouchableOpacity>
            </View>
          ) : null}
          <TextInput
            value={editing ? editText : text}
            onChangeText={onChangeText}
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
        </View>
        <TouchableOpacity
          onPress={editing ? saveEdit : send}
          disabled={editing ? sending || !editText.trim() : sending || !text.trim()}
          style={[
            styles.sendBtn,
            {
              backgroundColor: editing ? c.accent2 : c.accent,
              borderRadius: pillRadius,
              opacity: editing ? (sending || !editText.trim() ? 0.5 : 1) : sending || !text.trim() ? 0.5 : 1,
            },
          ]}
        >
          <Text style={{ color: c.onAccent, fontWeight: '800', fontSize: FONT.body }}>
            {sending ? '…' : editing ? 'Save' : 'Send'}
          </Text>
        </TouchableOpacity>
      </View>

      {typingUsers.length > 0 ? (
        <View style={{ paddingHorizontal: SPACE.xl, paddingVertical: SPACE.xs, alignItems: 'center' }}>
          <Text style={{ color: c.muted, fontSize: FONT.sm }}>
            {typingUsers.length === 1 ? `${typingUsers[0]} is typing…` : `${typingUsers.slice(0, 2).join(', ')}${typingUsers.length > 2 ? ` +${typingUsers.length - 2}` : ''} typing…`}
          </Text>
        </View>
      ) : null}
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
  previewCard: {
    marginTop: SPACE.md,
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
    width: 230,
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
  reactBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACE.xl,
    paddingVertical: SPACE.sm,
    borderTopWidth: 1,
  },
})
