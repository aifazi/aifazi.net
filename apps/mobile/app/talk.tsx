/**
 * app/talk.tsx — Nextcloud Talk dashboard (Track T, M2.2/M2.4).
 *
 * Room list from the Talk API v4 with active-call badges, a media-path hint
 * (VPN tunnel → direct P2P; otherwise verified coturn TURN relay), and the
 * call entry point per room. Entry: Profile → Overview → Talk.
 *
 * Android strategy defaults to "call in external browser + in-app chat"
 * (WebView WebRTC media capture is version-dependent there — M0.1 spike
 * item, owner decision); iOS runs the Talk call UI in an in-app WebView
 * (WKWebView WebRTC).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native'
import { useRouter, type Href } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '@/src/theme'
import { withAlpha } from '@/src/lib/color'
import { Screen } from '@/src/components/Screen'
import { Header } from '@/src/components/Header'
import { Icon } from '@/src/components/icon'
import { NcNotConfiguredError, NcLoginError } from '@/src/lib/ncSession'
import {
  getRooms,
  getTalkCapabilities,
  describeMediaPath,
  TalkApiError,
  type TalkRoom,
  type TalkCapabilities,
} from '@/src/lib/talk'
import { listPeers } from '@/src/lib/vpn'
import { TALK_URL, openInApp } from '@/src/lib/url'

const ROOM_TOKEN_RE = /^[A-Za-z0-9_-]{1,128}$/

type TalkErrorKind = 'not-configured' | 'two-factor' | 'auth-failed' | 'network' | 'api' | null

export default function TalkScreen() {
  const { theme } = useTheme()
  const c = theme.colors
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const [rooms, setRooms] = useState<TalkRoom[]>([])
  const [caps, setCaps] = useState<TalkCapabilities | null>(null)
  const [vpnConnected, setVpnConnected] = useState(false)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [errorKind, setErrorKind] = useState<TalkErrorKind>(null)

  const loadData = useCallback(async () => {
    setErrorKind(null)
    try {
      const capsRes = await getTalkCapabilities()
      if (!capsRes.talkEnabled || !capsRes.conversationV4) {
        setErrorKind('api')
        return
      }
      setCaps(capsRes)
      const [roomList] = await Promise.all([getRooms(), listPeers().then(listPeersResult(setVpnConnected)).catch(() => undefined)])
      setRooms(roomList)
    } catch (e) {
      if (e instanceof NcNotConfiguredError) {
        setErrorKind('not-configured')
      } else if (e instanceof NcLoginError) {
        setErrorKind(e.kind === 'two-factor-blocked' ? 'two-factor' : 'auth-failed')
      } else if (e instanceof TalkApiError) {
        setErrorKind('api')
      } else {
        setErrorKind('network')
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const mediaHint = useMemo(
    () => describeMediaPath(vpnConnected, caps?.turnServers ?? []),
    [vpnConnected, caps],
  )

  const openRoom = (room: TalkRoom) => {
    if (ROOM_TOKEN_RE.test(room.token)) {
      router.push(`/talk-room?token=${encodeURIComponent(room.token)}` as Href)
      return
    }
    void openInApp(TALK_URL)
  }

  if (loading) {
    return (
      <Screen>
        <Header title="Talk" onBack={() => router.back()} />
        <View style={{ padding: 16, gap: 12 }}>
          {[120, 90, 90].map((h, i) => (
            <View
              key={i}
              style={{ height: h, borderRadius: 16, backgroundColor: c.bg2, borderWidth: 1, borderColor: c.border }}
            />
          ))}
          <ActivityIndicator size="small" color={c.accent} style={{ marginTop: 8 }} />
        </View>
      </Screen>
    )
  }

  const errorCopy: Record<Exclude<TalkErrorKind, null>, { title: string; body: string }> = {
    'not-configured': {
      title: 'Connect Nextcloud first',
      body: 'Talk uses your Nextcloud account. Set the server URL, username and an app password (Nextcloud → Settings → Security → App passwords) in Nextcloud Setup.',
    },
    'two-factor': {
      title: 'Interactive 2FA blocked',
      body: 'This Nextcloud account needs an interactive 2FA step that the app cannot complete headlessly. Create an app password in Nextcloud (Settings → Security → App passwords) and enter it in Nextcloud Setup.',
    },
    'auth-failed': {
      title: 'Sign-in failed',
      body: 'Nextcloud rejected the credentials. Check the username and app password in Nextcloud Setup.',
    },
    'network': {
      title: 'Could not reach Nextcloud',
      body: 'Network error while talking to cloud.aifazi.net. Pull to refresh when you’re back online.',
    },
    'api': {
      title: 'Talk unavailable',
      body: 'The Nextcloud server does not advertise the Talk API v4 surface this app pins to. Pull to refresh; if this persists after a Nextcloud upgrade, the API client needs updating.',
    },
  }

  return (
    <Screen scroll={false}>
      <Header
        title="Talk"
        subtitle={mediaHint}
        onBack={() => router.back()}
        right={
          <TouchableOpacity
            onPress={() => router.push('/nextcloud-setup' as Href)}
            accessibilityRole="button"
            accessibilityLabel="Nextcloud settings"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Icon name="settings" size={20} color={c.text2} />
          </TouchableOpacity>
        }
      />
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 80 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true)
              void loadData()
            }}
            tintColor={c.accent}
          />
        }
      >
        {errorKind ? (
          <View
            style={{
              backgroundColor: c.bg2,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: c.border,
              padding: 18,
              marginBottom: 16,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Icon name="alert" size={16} color={c.danger} />
              <Text style={{ color: c.danger, fontSize: 15, fontWeight: '700' }}>
                {errorCopy[errorKind].title}
              </Text>
            </View>
            <Text style={{ color: c.text2, fontSize: 13, lineHeight: 19, marginTop: 8 }}>
              {errorCopy[errorKind].body}
            </Text>
            {(errorKind === 'not-configured' || errorKind === 'two-factor' || errorKind === 'auth-failed') && (
              <TouchableOpacity
                onPress={() => router.push('/nextcloud-setup' as Href)}
                style={{
                  marginTop: 12,
                  paddingVertical: 10,
                  borderRadius: 10,
                  backgroundColor: c.accent,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: c.onAccent, fontSize: 13, fontWeight: '700' }}>OPEN NEXTCLOUD SETUP</Text>
              </TouchableOpacity>
            )}
            {errorKind === 'not-configured' && (
              <TouchableOpacity
                onPress={() => { void openInApp(TALK_URL) }}
                style={{ marginTop: 8, paddingVertical: 10, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: c.border }}
              >
                <Text style={{ color: c.text2, fontSize: 13, fontWeight: '600' }}>Open Talk in browser instead</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <>
            {/* Rooms */}
            {rooms.length === 0 ? (
              <View
                style={{
                  backgroundColor: c.bg2,
                  borderRadius: 16,
                  padding: 32,
                  alignItems: 'center',
                  marginBottom: 16,
                }}
              >
                <Text style={{ color: c.text2, fontSize: 14, textAlign: 'center', lineHeight: 20 }}>
                  No rooms yet.{'\n'}Start or join a conversation in Nextcloud and it will show up here.
                </Text>
              </View>
            ) : (
              <View style={{ marginBottom: 16, gap: 8 }}>
                {rooms.map((room) => (
                  <TouchableOpacity
                    key={room.token}
                    onPress={() => openRoom(room)}
                    activeOpacity={0.85}
                    style={{
                      backgroundColor: c.bg2,
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: room.hasCall ? withAlpha(c.accent, 0.6) : c.border,
                      padding: 14,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 12,
                    }}
                  >
                    <View
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 20,
                        backgroundColor: withAlpha(c.accent, 0.13),
                        justifyContent: 'center',
                        alignItems: 'center',
                      }}
                    >
                      <Icon name={room.type === 1 || room.type === 4 ? 'chat' : 'forum'} size={18} color={c.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: c.text, fontSize: 15, fontWeight: '700' }} numberOfLines={1}>
                        {room.name}
                      </Text>
                      <Text style={{ color: c.muted, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
                        {room.type === 1 || room.type === 4 ? 'Direct' : room.type === 3 ? 'Public' : 'Group'}
                        {room.lastMessage ? ` · ${room.lastMessage.actorDisplayName}: ${room.lastMessage.message.slice(0, 40)}` : ''}
                      </Text>
                    </View>
                    {room.hasCall && (
                      <View
                        style={{
                          backgroundColor: withAlpha(c.accent2, 0.16),
                          borderRadius: 10,
                          paddingHorizontal: 8,
                          paddingVertical: 4,
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 5,
                        }}
                      >
                        <Icon name="phone" size={11} color={c.accent2} />
                        <Text style={{ color: c.accent2, fontSize: 11, fontWeight: '700' }}>CALL</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Media path hint (M2.4) */}
            <View
              style={{
                backgroundColor: c.bg2,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: c.border,
                padding: 14,
                flexDirection: 'row',
                gap: 10,
                alignItems: 'center',
              }}
            >
              <Icon name={vpnConnected ? 'shield' : 'globe'} size={16} color={vpnConnected ? c.success : c.muted} />
              <Text style={{ color: c.text2, fontSize: 12, lineHeight: 17, flex: 1 }}>{mediaHint}</Text>
            </View>

            <TouchableOpacity
              onPress={() => { void openInApp(TALK_URL) }}
              style={{
                marginTop: 12,
                paddingVertical: 12,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: c.border,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: c.text2, fontSize: 13, fontWeight: '600' }}>Open full Talk web app</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </Screen>
  )
}

function listPeersResult(setVpnConnected: (b: boolean) => void) {
  return (peers: { connected: boolean }[]) => {
    setVpnConnected(peers.some((p) => p.connected))
  }
}
