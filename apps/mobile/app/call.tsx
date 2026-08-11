import { useCallback, useEffect, useRef, useState } from 'react'
import { FONT, SPACE } from '@/src/design'
import { useLocalSearchParams } from 'expo-router'
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  AppState,
} from 'react-native'
import VideoStream from '@/src/components/VideoStream'
import { useLiveKitCall } from '@/src/lib/livekit'
import { useTheme } from '@/src/theme'
import { useAuth } from '@/src/lib/auth'
import { api } from '@/src/lib/api'
import { encryptText, decryptIfEncrypted } from '@/src/lib/chat-encryption'
import { useOverlay } from '@/src/components/overlay'

function Tile({
  label,
  videoUrl,
  isSelf = false,
  speaking = false,
  muted = false,
  camOff = false,
}: {
  label: string
  videoUrl?: string | null
  isSelf?: boolean
  speaking?: boolean
  muted?: boolean
  camOff?: boolean
}) {
  const { theme } = useTheme()
  const c = theme.colors
  const showVideo = !!videoUrl && !(isSelf && camOff)
  return (
    <View
      style={[
        styles.tile,
        {
          borderColor: speaking ? c.accent : c.border,
          backgroundColor: c.bg2,
        },
      ]}
    >
      {showVideo ? (
        <VideoStream streamURL={videoUrl} objectFit="cover" mirror={isSelf} style={styles.tileVideo} />
      ) : (
        <View style={styles.avatarWrap}>
          <Text style={{ fontSize: 28, color: c.text2 }}>{label.slice(0, 1).toUpperCase() || '?'}</Text>
        </View>
      )}
      <View style={styles.tileMeta}>
        <Text style={{ color: c.text, fontSize: FONT.sm, fontWeight: '700' }} numberOfLines={1}>
          {label}
        </Text>
        <View style={styles.dotRow}>
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: muted ? c.danger : c.accent }} />
          {!isSelf && (
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: camOff || !showVideo ? c.muted : c.accent }} />
          )}
        </View>
      </View>
    </View>
  )
}

interface CallMessage {
  id: string
  sender: string
  content?: string
  created_at?: string
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

export default function CallScreen() {
  const { room, name, mode, thread_id, peer, type } = useLocalSearchParams<{
    room: string
    name?: string
    mode?: string
    thread_id?: string
    peer?: string
    type?: string
  }>()
  const isDm = mode === 'dm' || !!thread_id
  const videoCall = isDm || type === 'video'
  const { theme } = useTheme()
  const c = theme.colors
  const { user } = useAuth()
  const { alert, confirm, menu, toast } = useOverlay()
  const {
    status,
    error,
    info,
    participants,
    muted,
    camOff,
    screenActive,
    screenUrl,
    localVideoUrl,
    canScreenShare,
    setMic,
    toggleMute,
    toggleCam,
    toggleScreen,
    listDevices,
    switchMicDevice,
    switchSpeakerDevice,
    muteParticipant,
    kickParticipant,
    leave,
  } = useLiveKitCall(isDm ? (thread_id ?? (room ?? null)) : (room ?? null), {
    dmThreadId: isDm ? (thread_id ?? null) : null,
    video: videoCall,
  })

  const [chatOpen, setChatOpen] = useState(false)
  const [chatMsgs, setChatMsgs] = useState<CallMessage[]>([])
  const [chatText, setChatText] = useState('')
  const [chatSending, setChatSending] = useState(false)
  const [roomKey, setRoomKey] = useState('')
  const chatPoll = useRef<ReturnType<typeof setInterval> | null>(null)

  const [pttActive, setPttActive] = useState(false)

  const isStaff = user?.role === 'admin' || user?.role === 'moderator'
  const roomName = name || (isDm ? (peer ? `Call · ${peer}` : 'DM call') : 'Call')
  const count = participants.length + 1

  const baseChatId = isDm ? thread_id ?? '' : (room ?? '')

  useEffect(() => {
    if (!baseChatId) return
    const keyPath = isDm
      ? `/chat/dm/threads/${baseChatId}/encryption-key`
      : `/chat/rooms/${baseChatId}/encryption-key`
    api
      .get(keyPath)
      .then((r) => setRoomKey((r.data?.encryption_key ?? '') as string))
      .catch(() => setRoomKey(''))
  }, [isDm, baseChatId])

  const loadChat = useCallback(async (silent = false) => {
    if (!baseChatId) return
    try {
      const path = isDm ? `/chat/dm/threads/${baseChatId}/messages` : `/chat/rooms/${baseChatId}/messages`
      const r = await api.get(path, { params: { limit: 50 } })
      setChatMsgs((r.data ?? []) as CallMessage[])
    } catch (e: any) {
      if (!silent) alert({ message: e?.response?.data?.detail || 'Could not load chat' })
    }
  }, [isDm, baseChatId, alert])

  useEffect(() => {
    if (!chatOpen) return
    loadChat()
    chatPoll.current = setInterval(() => loadChat(true), POLL_MS)
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        if (!chatPoll.current) chatPoll.current = setInterval(() => loadChat(true), POLL_MS)
        loadChat(true)
      } else if (chatPoll.current) {
        clearInterval(chatPoll.current)
        chatPoll.current = null
      }
    })
    return () => {
      if (chatPoll.current) clearInterval(chatPoll.current)
      sub.remove()
    }
  }, [chatOpen, loadChat])

  const openDevices = useCallback(async () => {
    const kind = await menu({
      title: 'Audio devices',
      options: [
        { value: 'mic', label: '🎙 Microphone' },
        { value: 'speaker', label: '🔊 Speaker' },
      ],
    })
    if (!kind) return
    const [devices] = await Promise.all([listDevices(kind === 'mic' ? 'audioinput' : 'audiooutput')])
    if (devices.length === 0) {
      toast('No devices found', 'info')
      return
    }
    const id = await menu({
      title: kind === 'mic' ? 'Select microphone' : 'Select speaker',
      options: devices.map((d) => ({ value: d.id, label: d.label, icon: kind === 'mic' ? '🎙' : '🔊' })),
    })
    if (!id) return
    if (kind === 'mic') switchMicDevice(id)
    else switchSpeakerDevice(id)
  }, [listDevices, switchMicDevice, switchSpeakerDevice, menu, toast])

  const sendChat = async () => {
    const content = chatText.trim()
    if (!content || !baseChatId) return
    setChatSending(true)
    try {
      const payload = roomKey ? `ENC:${encryptText(content, roomKey)}` : content
      const path = isDm ? `/chat/dm/threads/${baseChatId}/messages` : `/chat/rooms/${baseChatId}/messages`
      await api.post(path, { content: payload, type: 'text' })
      setChatText('')
      await loadChat(true)
    } catch (e: any) {
      alert({ message: e?.response?.data?.detail || 'Failed to send' })
    } finally {
      setChatSending(false)
    }
  }

  const pttPressIn = () => {
    setPttActive(true)
    setMic(true)
  }
  const pttPressOut = () => {
    setPttActive(false)
    setMic(false)
  }

  const modAlert = async (title: string, body: string, onConfirm: () => Promise<void>) => {
    const ok = await confirm({ title, message: body, confirmText: 'Confirm', destructive: true })
    if (!ok) return
    try {
      await onConfirm()
    } catch {
      alert({ message: 'Action failed' })
    }
  }

  if (status === 'connecting') {
    return (
      <View style={[styles.center, { backgroundColor: c.bg }]}>
        <ActivityIndicator color={c.accent} size="large" />
        <Text style={{ color: c.muted, marginTop: SPACE.xxl, fontFamily: theme.mono ? 'monospace' : undefined }}>
          Joining {roomName}…
        </Text>
      </View>
    )
  }

  if (status === 'error' || status === 'idle') {
    return (
      <View style={[styles.center, { backgroundColor: c.bg }]}>
        <Text style={{ fontSize: 40 }}>⚠️</Text>
        <Text style={{ color: c.danger, marginTop: SPACE.lg, textAlign: 'center' }}>{error || 'Call ended'}</Text>
        <TouchableOpacity onPress={leave} style={[styles.ctl, { backgroundColor: c.danger, marginTop: SPACE.giant }]}>
          <Text style={{ color: '#fff', fontWeight: '800' }}>LEAVE</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View style={[styles.root, { backgroundColor: c.bg }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <Text style={{ color: c.text, fontSize: FONT.card, fontWeight: '800', flex: 1 }} numberOfLines={1}>
          {roomName}
        </Text>
        <Text style={{ color: c.muted, fontSize: FONT.sm }}>
          {count} participant{count !== 1 ? 's' : ''}
        </Text>
        <TouchableOpacity onPress={() => setChatOpen((v) => !v)} hitSlop={10} style={{ marginLeft: SPACE.lg }}>
          <Text style={{ fontSize: FONT.section, opacity: chatOpen ? 1 : 0.55 }}>💬</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={openDevices} hitSlop={10} style={{ marginLeft: SPACE.md }}>
          <Text style={{ fontSize: FONT.section, opacity: 0.8 }}>⚙️</Text>
        </TouchableOpacity>
      </View>

      {chatOpen ? (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.chatPane, { borderBottomColor: c.border }]}>
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: SPACE.lg, paddingBottom: SPACE.xl }}
              ref={(ref) => ref?.scrollToEnd?.({ animated: false })}
              onContentSizeChange={() => {}}
            >
              {chatMsgs.length === 0 ? (
                <Text style={{ color: c.muted, fontSize: FONT.md, textAlign: 'center', marginTop: SPACE.giant }}>
                  No chat yet. Say something!
                </Text>
              ) : (
                chatMsgs.map((m) => {
                  const mine = m.sender === user?.username
                  const body = decryptIfEncrypted(m.content ?? '', roomKey)
                  return (
                    <View key={m.id} style={{ alignItems: mine ? 'flex-end' : 'flex-start', marginBottom: SPACE.md }}>
                      <View
                        style={[
                          styles.chatBubble,
                          {
                            backgroundColor: mine ? c.accent2 : c.bg2,
                            borderColor: mine ? c.accent2 : c.border,
                          },
                        ]}
                      >
                        {!mine ? (
                          <Text style={{ color: c.accent2, fontSize: FONT.xs, fontWeight: '700', marginBottom: SPACE.xxs }}>
                            {m.sender}
                          </Text>
                        ) : null}
                        <Text style={{ color: mine ? c.onAccent : c.text, fontSize: FONT.body, lineHeight: 18 }}>
                          {body || (m.content?.startsWith('ENC:') ? '(encrypted)' : m.content)}
                        </Text>
                        <Text style={{ color: mine ? 'rgba(0,16,24,0.6)' : c.muted, fontSize: FONT.micro, marginTop: SPACE.xxs }}>
                          {fmtTime(m.created_at)}
                        </Text>
                      </View>
                    </View>
                  )
                })
              )}
            </ScrollView>
            <View style={[styles.chatInputRow, { borderTopColor: c.border, backgroundColor: c.bg2 }]}>
              <TextInput
                value={chatText}
                onChangeText={setChatText}
                placeholder="Type in-call chat…"
                placeholderTextColor={c.muted}
                multiline
                style={[
                  styles.chatInput,
                  { backgroundColor: c.bg, color: c.text, borderColor: c.border, fontFamily: theme.mono ? 'monospace' : undefined },
                ]}
              />
              <TouchableOpacity
                onPress={sendChat}
                disabled={chatSending || !chatText.trim()}
                style={[styles.chatSend, { backgroundColor: c.accent, opacity: chatSending || !chatText.trim() ? 0.5 : 1 }]}
              >
                <Text style={{ color: c.onAccent, fontWeight: '800', fontSize: FONT.md }}>
                  {chatSending ? '…' : 'Send'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      ) : null}

      {screenUrl ? (
        <View style={[styles.screen, { borderBottomColor: c.border }]}>
          <VideoStream streamURL={screenUrl} objectFit="contain" style={StyleSheet.absoluteFill} />
          <View style={styles.screenTag}>
            <Text style={{ color: '#fff', fontSize: FONT.micro }}>🖥 Screen Share</Text>
          </View>
        </View>
      ) : null}

      <ScrollView contentContainerStyle={styles.grid} style={{ flex: 1 }}>
        <Tile label="You" videoUrl={localVideoUrl} isSelf muted={muted} camOff={camOff} />
        {participants.map((p) => (
          <TouchableOpacity
            key={p.identity}
            activeOpacity={isStaff ? 0.7 : 1}
            onLongPress={
              isStaff
                ? () => {
                    void (async () => {
                      const picked = await menu({
                        title: p.displayName,
                        options: [
                          { value: 'mute', label: 'Mute mic' },
                          { value: 'kick', label: 'Kick', destructive: true },
                        ],
                      })
                      if (picked === 'mute') modAlert('Mute', `Mute ${p.displayName}'s microphone?`, () => muteParticipant(p.identity))
                      else if (picked === 'kick') modAlert('Kick', `Kick ${p.displayName} from the call?`, () => kickParticipant(p.identity))
                    })()
                  }
                : undefined
            }
          >
            <Tile label={p.displayName} videoUrl={p.videoUrl} speaking={p.isSpeaking} muted={!p.isMicOn} camOff={!p.isCamOn} />
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={[styles.controls, { borderTopColor: c.border }]}>
        <TouchableOpacity
          onPress={pttPressIn}
          onPressOut={pttPressOut}
          onLongPress={pttPressIn}
          delayLongPress={120}
          style={[styles.ctl, { backgroundColor: pttActive ? c.accent : 'rgba(255,255,255,0.12)' }]}
        >
          <Text style={{ fontSize: FONT.section }}>{pttActive ? '🎙️' : '🎤'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={toggleMute} style={[styles.ctl, { backgroundColor: muted ? c.danger : 'rgba(255,255,255,0.12)' }]}>
          <Text style={{ fontSize: FONT.section }}>{muted ? '🔇' : '🔊'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={toggleCam} style={[styles.ctl, { backgroundColor: camOff ? c.danger : 'rgba(255,255,255,0.12)' }]}>
          <Text style={{ fontSize: FONT.section }}>{camOff ? '📷' : '📸'}</Text>
        </TouchableOpacity>
        {canScreenShare && (
          <TouchableOpacity
            onPress={toggleScreen}
            style={[styles.ctl, { backgroundColor: screenActive ? 'rgba(34,197,94,0.25)' : 'rgba(255,255,255,0.12)' }]}
          >
            <Text style={{ fontSize: FONT.section }}>🖥</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={leave} style={[styles.ctl, { backgroundColor: c.danger }]}>
          <Text style={{ fontSize: FONT.section }}>❌</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACE.mega },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.lg,
    paddingHorizontal: SPACE.xxxl,
    paddingVertical: SPACE.xl,
    borderBottomWidth: 1,
  },
  chatPane: {
    maxHeight: '45%',
    borderBottomWidth: 1,
  },
  chatBubble: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.sm,
    maxWidth: '90%',
  },
  chatInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: SPACE.md,
    padding: SPACE.md,
    borderTopWidth: 1,
  },
  chatInput: {
    flex: 1,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.md,
    maxHeight: 80,
    fontSize: FONT.body,
  },
  chatSend: {
    borderRadius: 8,
    paddingHorizontal: SPACE.xxl,
    paddingVertical: SPACE.lg,
    alignItems: 'center',
  },
  screen: { height: 200, backgroundColor: '#000', borderBottomWidth: 1, position: 'relative' },
  screenTag: { position: 'absolute', bottom: 8, left: 12, backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 6, paddingHorizontal: SPACE.lg, paddingVertical: 3 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: SPACE.xl,
    gap: SPACE.lg,
  },
  tile: {
    width: '47%',
    flexGrow: 1,
    minHeight: 150,
    borderRadius: 12,
    borderWidth: 2,
    overflow: 'hidden',
  },
  tileVideo: { flex: 1 },
  avatarWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tileMeta: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACE.sm,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  dotRow: { flexDirection: 'row', gap: SPACE.xs },
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACE.xl,
    paddingVertical: SPACE.xxl,
    borderTopWidth: 1,
  },
  ctl: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
