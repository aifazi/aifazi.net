import { View, StyleProp, ViewStyle } from 'react-native'

export default function VideoStream({
  style,
}: {
  streamURL?: string | null
  objectFit?: 'cover' | 'contain'
  mirror?: boolean
  style?: StyleProp<ViewStyle>
}) {
  // RTCView does not exist in the browser — render an empty tile. Call video
  // on web is not supported in this build; the tile falls back to the avatar.
  return <View style={[style, { backgroundColor: '#000' }]} />
}