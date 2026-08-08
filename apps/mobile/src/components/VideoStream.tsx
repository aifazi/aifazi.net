import { StyleProp, ViewStyle } from 'react-native'
import { RTCView } from '@livekit/react-native-webrtc'

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
  return <RTCView streamURL={streamURL ?? ''} objectFit={objectFit} mirror={mirror} style={style} />
}