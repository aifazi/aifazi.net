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
import * as ImagePicker from 'expo-image-picker'
import { Image as ExpoImage } from 'expo-image'
import { useTheme } from '@/src/theme'
import { useAuth } from '@/src/lib/auth'
import { api } from '@/src/lib/api'
import { encryptText, decryptIfEncrypted } from '@/src/lib/chat-encryption'

interface DMMessage {
  id: string
  thread_id: string
  sender: string
  type?: string
  content?: string
  file_name?: string
  file_size?: string
  reply_to?: { id: string; sender: string; content: string } | null
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

export default function DMThreadScreen() {
  const { thread_id, peer } = useLocalSearchParams<{ thread_id: string; peer?: string }>()
  const router = useRouter()
  const { theme } = useTheme()
  const c = theme.colors
  const { user } = useAuth()

  const [messages, setMessages] = useState<DMMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [threadKey, setThreadKey] = useState('')
  const listRef = useRef<FlatList<DMMessage>>(null)
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
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current)
    }
  }, [load])

  const send = async () => {
    const content = text.trim()
    if (!content || !thread_id) return
    setSending(true)
    try {
      const payload = threadKey ? `ENC:${encryptText(content, threadKey)}` : content
      await api.post(`/chat/dm/threads/${thread_id}/messages`, { content: payload, type: 'text' })
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
      await api.delete(`/chat/dm/messages/${id}`)
      setMessages((prev) => prev.filter((m) => m.id !== id))
    } catch (e: any) {
      setErr(e?.response?.data?.detail || 'Failed to delete')
    }
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
      const up = await api.post(`/upload/chat?thread_id=${thread_id}`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 30000,
      })
      const url = (up.data?.url ?? '') as string
      if (!url) throw new Error('Upload returned no URL')
      await api.post(`/chat/dm/threads/${thread_id}/messages`, {
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

  const isMine = (m: DMMessage) => m.sender === user?.username

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.bg }]} edges={['top', 'bottom']}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <Text style={{ color: c.text, fontSize: 18 }}>←</Text>
        </TouchableOpacity>
        <Text style={{ color: c.text, fontSize: 15, fontWeight: '800', flex: 1 }} numberOfLines={1}>
          {peer || 'Direct message'}
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
              const isImage = item.type === 'image'
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
                      <Text style={{ marginTop: 6, fontSize: 13, color: c.text }}>📎 {item.file_name}</Text>
                    ) : null}
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6, marginTop: 4 }}>
                      <Text style={{ color: mine ? 'rgba(0,16,24,0.6)' : c.muted, fontSize: 10 }}>
                        {fmtTime(item.created_at)}
                        {item.edited ? ' · edited' : ''}
                      </Text>
                    </View>
                  </View>
                  {mine ? (
                    <TouchableOpacity onPress={() => deleteMsg(item.id)} hitSlop={8} style={{ marginTop: 4 }}>
                      <Text style={{ color: c.danger, fontSize: 12 }}>Delete</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              )
            }}
          />
        )}
      </KeyboardAvoidingView>

      <View style={[styles.inputBar, { borderTopColor: c.border, backgroundColor: c.bg2 }]}>
        <TouchableOpacity onPress={pickImage} disabled={uploading} hitSlop={8} style={{ paddingRight: 2 }}>
          <Text style={{ fontSize: 18, opacity: uploading ? 0.4 : 1 }}>{uploading ? '⏳' : '🖼️'}</Text>
        </TouchableOpacity>
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