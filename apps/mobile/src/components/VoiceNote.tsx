import { useEffect, useRef, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import {
  useAudioRecorder,
  useAudioPlayer,
  useAudioPlayerStatus,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  RecordingPresets,
} from 'expo-audio'
import { useTheme } from '@/src/theme'
import { withAlpha } from '@/src/lib/color'
import { FONT, SPACE, tagLabel } from '@/src/design'

/**
 * Voice note button (composer): tap to start recording, tap to stop. Returns
 * the local file uri + duration (seconds) via onRecorded so the caller can
 * upload and post a `type: voice` message.
 */
export function VoiceRecorder({
  onRecorded,
  onError,
}: {
  onRecorded: (uri: string, durationSec: number) => void
  onError?: (msg: string) => void
}) {
  const { theme } = useTheme()
  const c = theme.colors
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY)
  const [recording, setRecording] = useState(false)
  const [secs, setSecs] = useState(0)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true }).catch(() => {})
    return () => {
      if (timer.current) clearInterval(timer.current)
    }
  }, [])

  const toggle = async () => {
    if (recording) {
      const dur = secs
      try {
        await recorder.stop()
      } catch {}
      if (timer.current) clearInterval(timer.current)
      setRecording(false)
      const uri = recorder.uri
      if (uri && dur >= 0.5) onRecorded(uri, dur)
      else onError?.('Recording was too short')
      setSecs(0)
      return
    }
    const perm = await requestRecordingPermissionsAsync()
    if (!perm.granted) {
      onError?.('Microphone permission is required to record a voice note')
      return
    }
    try {
      if (!recorder.isRecording) {
        await recorder.prepareToRecordAsync()
        recorder.record()
      }
      setSecs(0)
      setRecording(true)
      timer.current = setInterval(() => setSecs((s) => s + 1), 1000)
    } catch (e: any) {
      onError?.(e?.message || 'Could not start recording')
    }
  }

  const mm = `0:${String(Math.min(secs, 59)).padStart(2, '0')}`
  return (
    <TouchableOpacity
      onPress={toggle}
      hitSlop={8}
      style={[
        styles.recBtn,
        {
          borderColor: recording ? withAlpha(c.danger, 0.8) : c.border,
          backgroundColor: recording ? withAlpha(c.danger, 0.15) : 'transparent',
        },
      ]}
    >
      <View style={[styles.dot, { backgroundColor: recording ? c.danger : c.accent }]} />
      {recording ? <Text style={[tagLabel(10, 1), { color: c.danger, marginLeft: SPACE.xxs }]}>{mm}</Text> : null}
    </TouchableOpacity>
  )
}

/**
 * Inline play button for a received/rendered voice note. Toggles playback of
 * the uploaded audio URL and shows the note's duration.
 */
export function VoiceNotePlay({
  uri,
  duration,
  color,
}: {
  uri?: string
  duration?: string
  color?: string
}) {
  const { theme } = useTheme()
  const c = theme.colors
  const player = useAudioPlayer(uri ?? null)
  const status = useAudioPlayerStatus(player)
  const tint = color ?? c.accent2

  const toggle = () => {
    if (!uri) return
    if (player.playing) player.pause()
    else {
      player.seekTo(0)
      player.play()
    }
  }

  const label = duration ? `${Math.round(Number(duration) || 0)}s` : status.duration ? `${Math.round(status.duration)}s` : '♪'

  return (
    <TouchableOpacity
      onPress={toggle}
      activeOpacity={0.75}
      hitSlop={8}
      style={[styles.play, { borderColor: withAlpha(tint, 0.5), backgroundColor: withAlpha(tint, 0.12) }]}
    >
      <Text style={{ color: tint, fontSize: FONT.body, fontWeight: '900', width: 18, textAlign: 'center' }}>
        {player.playing ? '⏸' : '▶'}
      </Text>
      <View style={[styles.bar, { backgroundColor: withAlpha(tint, 0.25) }]}>
        <View
          style={{
            width: status.isLoaded && status.duration ? `${Math.min(100, (status.currentTime / status.duration) * 100)}%` : '0%',
            height: '100%',
            backgroundColor: tint,
          }}
        />
      </View>
      <Text style={[tagLabel(10, 0.5), { color: tint }]}>{label}</Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  recBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.xs,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.md,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  play: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm,
    minWidth: 150,
  },
  bar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
})
