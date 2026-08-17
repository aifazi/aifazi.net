import React, { useRef, useEffect } from 'react'
import { View, StyleProp, ViewStyle } from 'react-native'

// Web build of the mobile app: RTCView does not exist in the browser, so we
// render a native HTML <video> that plays the object URL produced by
// `streamUrl()` in lk-native.web.ts. Screen share + camera tiles render here.
export default function VideoStream({
  streamURL,
  objectFit = 'cover',
  mirror = false,
  style,
}: {
  streamURL?: string | null
  objectFit?: 'cover' | 'contain'
  mirror?: boolean
  style?: StyleProp<ViewStyle>
}) {
  const ref = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (streamURL) {
      el.src = streamURL
      el.play().catch(() => {})
    } else {
      el.removeAttribute('src')
    }
  }, [streamURL])

  return (
    <View style={[style, { overflow: 'hidden' }]}>
      {React.createElement('video', {
        ref,
        autoPlay: true,
        playsInline: true,
        muted: mirror,
        style: {
          width: '100%',
          height: '100%',
          objectFit,
          transform: mirror ? 'scaleX(-1)' : undefined,
          backgroundColor: '#000',
        },
      })}
    </View>
  )
}
