/**
 * app/talk-room.tsx — Talk room chat pane (M2.3) + call entry (M2.2).
 *
 * - Chat: Talk API v4, focus-based polling (immediate on focus + 15s while
 *   the screen is focused AND the app is active; stops in background).
 * - Optimistic outbox via chatStore (offline-safe: failed sends stay queued
 *   and can be retried by tapping the bubble).
 * - Calls: iOS → in-app WebView (WKWebView WebRTC, media auto-granted for
 *   the same host). Android → external browser (system WebRTC) + in-app
 *   chat; the Android in-WebView strategy is the M0.1 spike follow-up.
 * - M2.4 hint: VPN tunnel up → direct media, otherwise verified TURN.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  AppState,
  ActivityIndicator,
  Platform,
} from 'react-native'
import { useIsFocused, useLocalSearchParams, useRouter, type Href } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import * as Crypto from 'expo-crypto'
import { WebView } from 'react-native-webview'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '@/src/theme'
import { withAlpha } from '@/src/lib/color'
import { TALK_URL } from '@/src/lib/url'
import { Header } from '@/src/components/Header'
import { Icon } from '@/src/components/icon'
import { chatReducer, initialChatState, visibleMessages } from '@/src/lib/chatStore'
import {
  getRoomMessages,
  sendRoomMessage,
  getTalkCapabilities,
  describeMediaPath,
  NcNotConfiguredError,
  NcLoginError,
  TalkApiError,
} from '@/src/lib/talk'
import { getNcSession } from '@/src/lib/ncSession'
import { listPeers, deriveConnectionState } from '@/src/lib/vpn'

const ROOM_TOKEN_RE = /^[A-Za-z0-9_-]{1,128}$/
const POLL_MS = 15_000
const PAGE_LIMIT = 100

function newLocalId(): string {
  // Client-chosen referenceId echoed back by the server for outbox matching
  // (not a security token) — expo-crypto CSPRNG v4 UUID, no Math.random.
  return Crypto.randomUUID()
}

/**
 * R7-17 — scope the call WebView to the configured Nextcloud host instead of
 * `['*']`. The host is user-configured (Nextcloud Setup → ncSession
 * serverUrl, carried in the call URL); TALK_URL is only the fallback when the
 * call URL hasn't loaded yet — never a different hardcoded host. Mic/cam keep
 * working: `mediaCapturePermissionGrantType="grant"` +
 * `allowsInlineMediaPlayback` below are untouched (iOS WKWebView auto-grants
 * capture for the loaded host).
 */
function callAllowedOrigins(callUrl: string): string[] {
  const origins: string[] = []
  for (const candidate of [callUrl, TALK_URL]) {
    try {
      if (candidate) origins.push(new URL(candidate).origin)
    } catch {
      // Ignore unparseable candidates; TALK_URL always parses.
    }
  }
  return [...new Set(origins)]
}

type RoomError = 'bad-token' | 'not-configured' | 'auth' | 'network' | 'api'

export default function TalkRoomScreen() {
  const { theme } = useTheme()
  const c = theme.colors
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const isFocused = useIsFocused()
  const { token } = useLocalSearchParams<{ token: string }>()

  const [state, dispatch] = useReducer(chatReducer, initialChatState)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set())
  const [bootError, setBootError] = useState<RoomError | null>(null)
  const [vpnConnected, setVpnConnected] = useState(false)
  const [turnServers, setTurnServers] = useState<string[]>([])
  const [callOpen, setCallOpen] = useState(false)
  const [callUrl, setCallUrl] = useState('')
  const [myUid, setMyUid] = useState<string>('')

  const appStateRef = useRef(AppState.currentState)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      appStateRef.current = s
    })
    return () => sub.remove()
  }, [])

  const validToken = typeof token === 'string' && ROOM_TOKEN_RE.test(token)

  const refreshVpn = useCallback(() => {
    listPeers()
      .then((peers) => setVpnConnected(deriveConnectionState(peers) === 'connected'))
      .catch(() => {})
  }, [])

  // Initial load + capability probe (M2.4 hint inputs).
  useEffect(() => {
    if (!validToken) {
      setBootError('bad-token')
      return
    }
    let live = true
    setBootError(null)
    ;(async () => {
      try {
        const messages = await getRoomMessages(token, PAGE_LIMIT)
        if (!live) return
        dispatch({ type: 'REPLACE', messages, hasMore: false })
        getNcSession().then((s) => {
          if (live) setMyUid(s.username)
        }).catch(() => {})
      } catch (e) {
        if (!live) return
        setBootError(classifyError(e))
      }
    })()
    getTalkCapabilities()
      .then((caps) => {
        if (live) setTurnServers(caps.turnServers)
      })
      .catch(() => {})
    refreshVpn()
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, validToken])

  const poll = useCallback(async () => {
    if (!validToken) return
    try {
      const messages = await getRoomMessages(token, PAGE_LIMIT)
      dispatch({ type: 'MERGE', messages })
      // Server echoes settle the outbox: any entry whose referenceId came
      // back from the server is acked with the server copy.
      for (const entry of state.outbox) {
        const serverCopy = messages.find((m) => m.referenceId === entry.localId)
        if (serverCopy) dispatch({ type: 'ACK', localId: entry.localId, serverMessage: serverCopy })
      }
      refreshVpn()
    } catch {
      // Poll failures are silent — the next poll or focus recovers.
    }
  }, [token, validToken, state.outbox, refreshVpn])

  // Polling lifecycle: on focus + every 15s while focused AND app active.
  const [appActive, setAppActive] = useState(appStateRef.current === 'active')
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setAppActive(s === 'active'))
    return () => sub.remove()
  }, [])
  useEffect(() => {
    if (!validToken || !isFocused || !appActive) return
    void poll()
    const t = setInterval(() => void poll(), POLL_MS)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocused, appActive, validToken, token])

  const handleSend = useCallback(
    async (localId?: string) => {
      const text = localId ? state.outbox.find((o) => o.localId === localId)?.text : draft.trim()
      if (!text || sending || !validToken) return
      if (!localId) setDraft('')
      setSending(true)
      const id = localId ?? newLocalId()
      try {
        const serverMsg = await sendRoomMessage(token, text, id)
        dispatch({ type: 'ACK', localId: id, serverMessage: serverMsg.id > 0 ? serverMsg : null })
        setFailedIds((prev) => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
      } catch {
        if (!localId) dispatch({ type: 'ENQUEUE', entry: { localId: id, text, queuedAt: Date.now() } })
        setFailedIds((prev) => new Set(prev).add(id))
      } finally {
        setSending(false)
      }
    },
    [draft, sending, state.outbox, token, validToken],
  )

  const startCall = useCallback(async () => {
    try {
      const session = await getNcSession()
      const url = `${session.serverUrl}/call/${encodeURIComponent(token)}`
      if (Platform.OS === 'ios') {
        setCallUrl(url)
        setCallOpen(true)
      } else {
        // Android default strategy: external browser (system WebRTC). The
        // in-WebView strategy is owner-decidable post M0.1 spike.
        await WebBrowser.openBrowserAsync(url)
      }
    } catch (e) {
      setBootError(classifyError(e))
    }
  }, [token])

  const mediaHint = describeMediaPath(vpnConnected, turnServers)

  const items = useMemo(() => [...visibleMessages(state)].reverse(), [state])

  if (!validToken) {
    return (
      <ScreenFallback title="Talk room not found" body="The room link is invalid. Go back to Talk and pick a room." onBack={() => router.back()} />
    )
  }

  if (bootError) {
    const copy = BOOT_ERROR_COPY[bootError]
    return <ScreenFallback title={copy.title} body={copy.body} ctaToSetup={bootError !== 'bad-token'} onBack={() => router.back()} />
  }

  const renderMessage = ({ item }: { item: ReturnType<typeof visibleMessages>[number] }) => {
    if ('outbox' in item) {
      const o = item.outbox
      const failed = failedIds.has(o.localId)
      return (
        <TouchableOpacity
          onPress={() => { void handleSend(o.localId) }}
          style={{ alignSelf: 'flex-end', maxWidth: '80%', marginBottom: 6 }}
          activeOpacity={0.8}
        >
          <View
            style={{
              backgroundColor: failed ? withAlpha(c.danger, 0.16) : withAlpha(c.accent, 0.18),
              borderRadius: 14,
              paddingVertical: 8,
              paddingHorizontal: 12,
              borderWidth: failed ? 1 : 0,
              borderColor: c.danger,
            }}
          >
            <Text style={{ color: c.text, fontSize: 14, lineHeight: 19 }}>{o.text}</Text>
            <Text style={{ color: failed ? c.danger : c.muted, fontSize: 10, marginTop: 2 }}>
              {failed ? 'Failed — tap to retry' : 'Sending…'}
            </Text>
          </View>
        </TouchableOpacity>
      )
    }
    const m = item
    if (m.messageType !== 'comment' || m.actorType === 'system') {
      return (
        <View style={{ alignItems: 'center', marginVertical: 6 }}>
          <Text style={{ color: c.muted, fontSize: 11 }}>{m.systemMessage || m.message || '·'}</Text>
        </View>
      )
    }
    const mine = m.actorType === 'user' && m.actorId === myUid
    const ts = m.timestamp > 0 ? new Date(m.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
    return (
      <View style={{ flexDirection: mine ? 'row-reverse' : 'row', marginVertical: 4, paddingHorizontal: 2 }} accessibilityRole="text">
        <View style={{ maxWidth: '80%' }}>
          <Text style={{ color: c.muted, fontSize: 10, marginBottom: 2, textAlign: mine ? 'right' : 'left' }}>
            {m.actorDisplayName}
            {ts ? ` · ${ts}` : ''}
          </Text>
          <View
            style={{
              backgroundColor: mine ? withAlpha(c.accent, 0.18) : c.bg2,
              borderRadius: 14,
              paddingVertical: 8,
              paddingHorizontal: 12,
              borderWidth: 1,
              borderColor: c.border,
            }}
          >
            <Text style={{ color: c.text, fontSize: 14, lineHeight: 19 }}>{m.message}</Text>
          </View>
        </View>
      </View>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Header
        title="Talk"
        subtitle={mediaHint}
        onBack={() => router.back()}
        right={
          <TouchableOpacity
            onPress={() => { void startCall() }}
            accessibilityRole="button"
            accessibilityLabel="Start call"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              backgroundColor: withAlpha(c.accent, 0.14),
              borderRadius: 12,
              paddingHorizontal: 10,
              paddingVertical: 6,
            }}
          >
            <Icon name="phone" size={14} color={c.accent} />
            <Text style={{ color: c.accent, fontSize: 12, fontWeight: '700' }}>CALL</Text>
          </TouchableOpacity>
        }
      />

      <FlatList
        inverted
        data={items}
        keyExtractor={(item, i) =>
          'outbox' in item ? `outbox-${item.outbox.localId}` : `msg-${item.id || i}`
        }
        renderItem={renderMessage}
        contentContainerStyle={{ padding: 12, paddingBottom: 12 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={sending && items.length === 0 ? <ActivityIndicator size="small" color={c.accent} style={{ margin: 16 }} /> : null}
      />

      {/* Composer */}
      <View
        style={{
          flexDirection: 'row',
          gap: 8,
          padding: 10,
          paddingTop: 8,
          borderTopWidth: 1,
          borderTopColor: c.border,
          backgroundColor: c.bg2,
        }}
      >
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Message"
          placeholderTextColor={c.muted}
          multiline
          returnKeyType="send"
          onKeyPress={(e) => {
            if (e.nativeEvent.key === 'Enter') void handleSend()
          }}
          style={{
            flex: 1,
            backgroundColor: c.bg,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: c.border,
            color: c.text,
            fontSize: 14,
            padding: 10,
            maxHeight: 120,
          }}
        />
        <TouchableOpacity
          onPress={() => { void handleSend() }}
          disabled={sending || !draft.trim()}
          accessibilityRole="button"
          accessibilityLabel="Send message"
          style={{
            width: 42,
            height: 42,
            borderRadius: 21,
            backgroundColor: sending || !draft.trim() ? c.border : c.accent,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          {sending ? (
            <ActivityIndicator size="small" color={c.onAccent} />
          ) : (
            <Icon name="send" size={18} color={c.onAccent} />
          )}
        </TouchableOpacity>
      </View>

      {/* iOS in-app call view (M2.2 platform strategy) */}
      {callOpen && (
        <View style={{ position: 'absolute', inset: 0, backgroundColor: '#000', zIndex: 50 }}>
          <WebView
            source={{ uri: callUrl }}
            mediaCapturePermissionGrantType="grant"
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            originWhitelist={callAllowedOrigins(callUrl)}
            style={{ flex: 1 }}
          />
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              paddingTop: insets.top + 10,
              paddingHorizontal: 16,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: 'rgba(0,0,0,0.55)',
              paddingBottom: 10,
            }}
          >
            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>{mediaHint}</Text>
            <TouchableOpacity
              onPress={() => setCallOpen(false)}
              accessibilityRole="button"
              accessibilityLabel="Leave call"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Icon name="close" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  )
}

function classifyError(e: unknown): RoomError {
  if (e instanceof NcNotConfiguredError) return 'not-configured'
  if (e instanceof NcLoginError) return 'auth'
  if (e instanceof TalkApiError) return 'api'
  return 'network'
}

const BOOT_ERROR_COPY: Record<RoomError, { title: string; body: string }> = {
  'bad-token': {
    title: 'Talk room not found',
    body: 'The room link is invalid. Go back to Talk and pick a room.',
  },
  'not-configured': {
    title: 'Connect Nextcloud first',
    body: 'Set your Nextcloud server, username and app password in Nextcloud Setup, then reopen this room.',
  },
  'auth': {
    title: 'Nextcloud sign-in problem',
    body: 'The stored Nextcloud credentials were rejected (or the account needs interactive 2FA — use an app password in Nextcloud Setup).',
  },
  'network': {
    title: 'Could not reach Nextcloud',
    body: 'Network error. Check your connection and pull to refresh or reopen the room.',
  },
  'api': {
    title: 'Talk API unavailable',
    body: 'The Nextcloud server answered with an error. If this persists after a server upgrade, the pinned API version needs updating.',
  },
}

function ScreenFallback({
  title,
  body,
  ctaToSetup,
  onBack,
}: {
  title: string
  body: string
  ctaToSetup?: boolean
  onBack: () => void
}) {
  const { theme } = useTheme()
  const c = theme.colors
  const router = useRouter()
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Header title="Talk" onBack={onBack} />
      <View style={{ padding: 24 }}>
        <View style={{ backgroundColor: c.bg2, borderRadius: 16, borderWidth: 1, borderColor: c.border, padding: 18 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name="alert" size={16} color={c.danger} />
            <Text style={{ color: c.danger, fontSize: 15, fontWeight: '700' }}>{title}</Text>
          </View>
          <Text style={{ color: c.text2, fontSize: 13, lineHeight: 19, marginTop: 8 }}>{body}</Text>
        </View>
        {ctaToSetup ? (
          <TouchableOpacity
            onPress={() => router.push('/nextcloud-setup' as Href)}
            style={{
              marginTop: 12,
              paddingVertical: 12,
              borderRadius: 12,
              backgroundColor: c.accent,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: c.onAccent, fontSize: 13, fontWeight: '700' }}>OPEN NEXTCLOUD SETUP</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  )
}
