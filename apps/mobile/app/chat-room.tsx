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
  Linking,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as ImagePicker from 'expo-image-picker'
import { Image as ExpoImage } from 'expo-image'
import { useTheme } from '@/src/theme'
import { useAuth } from '@/src/lib/auth'
import { api } from '@/src/lib/api'
import { encryptText, decryptIfEncrypted } from '@/src/lib/chat-encryption'

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
  const { user } = useAuth()

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [roomKey, setRoomKey] = useState('')
  const [editing, setEditing] = useState<ChatMessage | null>(null)
  const [editText, setEditText] = useState('')
  const [previews, setPreviews] = useState<Record<string, LinkPreview>>({})
  const [uploading, setUploading] = useState(false)
  const listRef = useRef<FlatList<ChatMessage>>(null)
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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
      const payload = roomKey ? `ENC:${encryptText(content, roomKey)}` : content
      await api.post(`/chat/rooms/${room}/messages`, { content: payload, type: 'text' })
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
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) {
      setErr('Photo library permission is required to share images')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.8,
      selectionLimit: 1,
    })
    if (result.canceled || !result.assets?.length) return
    const asset = result.assets[0]
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', {
        uri: asset.uri,
        name: asset.fileName ?? 'photo.jpg',
        type: asset.mimeType ?? 'image/jpeg',
      } as any)
      const up = await api.post(`/upload/chat?room_id=${room}`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 30000,
      })
      const url = (up.data?.url ?? '') as string
      if (!url) throw new Error('Upload returned no URL')
      await api.post(`/chat/rooms/${room}/messages`, {
        content: url,
        type: 'image',
        file_name: asset.fileName ?? 'photo.jpg',
        file_size: String(asset.fileSize ?? 0),
      })
      await load(true)
    } catch (e: any) {
      setErr(e?.response?.data?.detail || e?.message || 'Failed to upload image')
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
              const isImage = item.type === 'image' || isImageUrl(item.content ?? '')
              const linkUrl = !isImage ? extractUrl(item.content ?? '') : ''
              const preview = linkUrl ? previews[item.id] : undefined
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
                        ↪ {decryptIfEncrypted(replyContent, roomKey)}
                      </Text>
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
                      <Text style={{ color: mine ? '#001018' : c.text, fontSize: 14, lineHeight: 19 }}>
                        {decryptIfEncrypted(item.content, roomKey)}
                      </Text>
                    )}
                    {item.type === 'file' && item.file_name ? (
                      <TouchableOpacity
                        onPress={() => openLink(item.content ?? '')}
                        style={{ marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 6 }}
                      >
                        <Text style={{ fontSize: 15 }}>📎</Text>
                        <Text style={{ color: mine ? '#001018' : c.text, fontSize: 13, fontWeight: '600' }}>
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
                              backgroundColor: mine ? 'rgba(255,255,255,0.35)' : c.bg,
                              borderColor: mine ? 'rgba(0,16,24,0.25)' : c.border,
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
                          <View style={{ padding: 8 }}>
                            {preview.site ? (
                              <Text style={{ color: c.muted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                {preview.site}
                              </Text>
                            ) : null}
                            <Text style={{ color: c.text, fontSize: 12, fontWeight: '700', marginTop: 2 }}>
                              {preview.title}
                            </Text>
                            {preview.description ? (
                              <Text style={{ color: c.muted, fontSize: 11, marginTop: 2 }} numberOfLines={2}>
                                {preview.description}
                              </Text>
                            ) : null}
                          </View>
                        </View>
                      </TouchableOpacity>
                    ) : null}
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
                      <TouchableOpacity onPress={() => startEdit(item)} hitSlop={8}>
                        <Text style={{ color: c.text, fontSize: 12 }}>Edit</Text>
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
        {editing ? (
          <TouchableOpacity onPress={cancelEdit} hitSlop={8} style={{ paddingRight: 6 }}>
            <Text style={{ color: c.danger, fontWeight: '700', fontSize: 13 }}>✕</Text>
          </TouchableOpacity>
        ) : null}
        {!editing ? (
          <TouchableOpacity onPress={pickImage} disabled={uploading} hitSlop={8} style={{ paddingRight: 2 }}>
            <Text style={{ fontSize: 18, opacity: uploading ? 0.4 : 1 }}>{uploading ? '⏳' : '🖼️'}</Text>
          </TouchableOpacity>
        ) : null}
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
          disabled={editing ? sending || !editText.trim() : sending || !text.trim()}
          style={[
            styles.sendBtn,
            {
              backgroundColor: editing ? c.accent2 : c.accent,
              opacity: editing ? (sending || !editText.trim() ? 0.5 : 1) : sending || !text.trim() ? 0.5 : 1,
            },
          ]}
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
  previewCard: {
    marginTop: 8,
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
    width: 230,
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