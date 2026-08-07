import { useLocalSearchParams } from 'expo-router'
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from 'react-native'
import { RTCView } from '@livekit/react-native-webrtc'
import { useLiveKitCall } from '@/src/lib/livekit'
import { useTheme } from '@/src/theme'

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
        <RTCView streamURL={videoUrl} objectFit="cover" mirror={isSelf} style={styles.tileVideo} />
      ) : (
        <View style={styles.avatarWrap}>
          <Text style={{ fontSize: 28, color: c.text2 }}>{label.slice(0, 1).toUpperCase() || '?'}</Text>
        </View>
      )}
      <View style={styles.tileMeta}>
        <Text style={{ color: c.text, fontSize: 11, fontWeight: '700' }} numberOfLines={1}>
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

export default function CallScreen() {
  const { room, name } = useLocalSearchParams<{ room: string; name?: string }>()
  const { theme } = useTheme()
  const c = theme.colors
  const {
    status,
    error,
    participants,
    muted,
    camOff,
    screenActive,
    screenUrl,
    localVideoUrl,
    canScreenShare,
    toggleMute,
    toggleCam,
    toggleScreen,
    leave,
  } = useLiveKitCall(room ?? null)

  const roomName = name || 'Call'
  const count = participants.length + 1

  if (status === 'connecting') {
    return (
      <View style={[styles.center, { backgroundColor: c.bg }]}>
        <ActivityIndicator color={c.accent} size="large" />
        <Text style={{ color: c.muted, marginTop: 14, fontFamily: theme.mono ? 'monospace' : undefined }}>
          Joining {roomName}…
        </Text>
      </View>
    )
  }

  if (status === 'error' || status === 'idle') {
    return (
      <View style={[styles.center, { backgroundColor: c.bg }]}>
        <Text style={{ fontSize: 40 }}>⚠️</Text>
        <Text style={{ color: c.danger, marginTop: 10, textAlign: 'center' }}>{error || 'Call ended'}</Text>
        <TouchableOpacity onPress={leave} style={[styles.ctl, { backgroundColor: c.danger, marginTop: 20 }]}>
          <Text style={{ color: '#fff', fontWeight: '800' }}>LEAVE</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View style={[styles.root, { backgroundColor: c.bg }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <Text style={{ color: c.text, fontSize: 15, fontWeight: '800', flex: 1 }} numberOfLines={1}>
          {roomName}
        </Text>
        <Text style={{ color: c.muted, fontSize: 11 }}>{count} participant{count !== 1 ? 's' : ''}</Text>
      </View>

      {screenUrl ? (
        <View style={[styles.screen, { borderBottomColor: c.border }]}>
          <RTCView streamURL={screenUrl} objectFit="contain" style={StyleSheet.absoluteFill} />
          <View style={styles.screenTag}>
            <Text style={{ color: '#fff', fontSize: 9 }}>🖥 Screen Share</Text>
          </View>
        </View>
      ) : null}

      <ScrollView contentContainerStyle={styles.grid} style={{ flex: 1 }}>
        <Tile label="You" videoUrl={localVideoUrl} isSelf muted={muted} camOff={camOff} />
        {participants.map((p) => (
          <Tile key={p.identity} label={p.displayName} videoUrl={p.videoUrl} speaking={p.isSpeaking} muted={!p.isMicOn} camOff={!p.isCamOn} />
        ))}
      </ScrollView>

      <View style={[styles.controls, { borderTopColor: c.border }]}>
        <TouchableOpacity onPress={toggleMute} style={[styles.ctl, { backgroundColor: muted ? c.danger : 'rgba(255,255,255,0.12)' }]}>
          <Text style={{ fontSize: 16 }}>{muted ? '🔇' : '🎤'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={toggleCam} style={[styles.ctl, { backgroundColor: camOff ? c.danger : 'rgba(255,255,255,0.12)' }]}>
          <Text style={{ fontSize: 16 }}>{camOff ? '📷' : '📸'}</Text>
        </TouchableOpacity>
        {canScreenShare && (
          <TouchableOpacity
            onPress={toggleScreen}
            style={[styles.ctl, { backgroundColor: screenActive ? 'color-mix(in srgb, var(--green) 18%, transparent)' : 'rgba(255,255,255,0.12)', borderColor: screenActive ? c.accent : 'transparent', borderWidth: screenActive ? 2 : 0 }]}
          >
            <Text style={{ fontSize: 16 }}>🖥</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={leave} style={[styles.ctl, { backgroundColor: c.danger }]}>
          <Text style={{ fontSize: 16 }}>❌</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  screen: { height: 200, backgroundColor: '#000', borderBottomWidth: 1, position: 'relative' },
  screenTag: { position: 'absolute', bottom: 8, left: 12, backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 3 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 12,
    gap: 10,
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
    padding: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  dotRow: { flexDirection: 'row', gap: 4 },
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 14,
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
