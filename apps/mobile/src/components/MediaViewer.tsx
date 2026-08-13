import { useRef, useState } from 'react'
import { Modal, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native'
import { Image as ExpoImage } from 'expo-image'
import { useTheme } from '@/src/theme'
import { withAlpha } from '@/src/lib/color'
import { FONT, SPACE } from '@/src/design'
import { Icon } from '@/src/components/icon'
import { safeOpenURL } from '@/src/lib/url'

/**
 * Fullscreen in-app preview popup for chat images/media. Tap the backdrop or
 * the close button to dismiss — nothing ever jumps to an external app.
 */
export function MediaViewer({
  uri,
  title,
  onClose,
}: {
  uri: string | null
  title?: string
  onClose: () => void
}) {
  const { theme } = useTheme()
  const c = theme.colors
  const [zoom, setZoom] = useState(false)
  const [loading, setLoading] = useState(true)
  const lastTap = useRef(0)

  const handlePress = () => {
    const now = Date.now()
    if (now - lastTap.current < 300) {
      setZoom((z) => !z)
      lastTap.current = 0
    } else {
      lastTap.current = now
    }
  }

  return (
    <Modal visible={!!uri} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={[styles.backdrop, { backgroundColor: 'rgba(0,0,0,0.95)' }]}>
        {uri ? (
          <>
            <TouchableOpacity activeOpacity={1} onPress={handlePress} style={StyleSheet.absoluteFill} accessibilityLabel="Media preview">
              {loading ? <ActivityIndicator color={c.text2} size="large" /> : null}
              <ExpoImage
                source={{ uri }}
                style={[
                  StyleSheet.absoluteFill,
                  {
                    transform: [{ scale: zoom ? 2 : 1 }],
                  },
                ]}
                contentFit="contain"
                transition={150}
                onLoad={() => setLoading(false)}
                onError={() => setLoading(false)}
              />
            </TouchableOpacity>
            <View style={styles.topBar}>
              {title ? (
                <Text style={{ color: c.text2, fontSize: FONT.md, fontWeight: '700', flex: 1 }} numberOfLines={1}>
                  {title}
                </Text>
              ) : (
                <View style={{ flex: 1 }} />
              )}
              <TouchableOpacity onPress={() => safeOpenURL(uri)} hitSlop={8} style={[styles.topBtn, { backgroundColor: withAlpha(c.bg, 0.45) }]}>
                <Icon name="external" size={FONT.md} color={c.text2} />
              </TouchableOpacity>
              <TouchableOpacity onPress={onClose} hitSlop={8} style={[styles.topBtn, { backgroundColor: withAlpha(c.bg, 0.45) }]}>
                <Icon name="close" size={FONT.md} color={c.text2} />
              </TouchableOpacity>
            </View>
            <View style={styles.hintWrap}>
              <Text style={{ color: withAlpha(c.text2, 0.55), fontSize: FONT.xs }}>Tap to zoom · close to exit</Text>
            </View>
          </>
        ) : null}
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1 },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    paddingHorizontal: SPACE.xl,
    paddingTop: 54,
  },
  topBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hintWrap: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
})
