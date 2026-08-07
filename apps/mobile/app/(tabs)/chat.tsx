import { View, Text } from 'react-native'
import { Screen } from '@/src/components/Screen'
import { Card, Title, Muted } from '@/src/components/ui'
import { useTheme } from '@/src/theme'

export default function ChatScreen() {
  const { theme } = useTheme()
  const c = theme.colors
  return (
    <Screen>
      <Title>Chat</Title>
      <Card>
        <Text style={{ color: c.text, fontSize: 13, fontWeight: '700' }}>🗨️ Text + voice + video</Text>
        <View style={{ marginTop: 8 }}>
          <Muted>
            Real-time chat, LiveKit voice/video rooms and screen share are coming in the next phase. The backend
            already mints LiveKit tokens and the web client has a full call UI — this app will reuse it via
            @livekit/react-native.
          </Muted>
        </View>
      </Card>
    </Screen>
  )
}
