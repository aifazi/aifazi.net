import { Component, ReactNode } from 'react'
import { ScrollView, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTheme } from '@/src/theme'
import { withAlpha } from '@/src/lib/color'
import { CODE_FONT, FONT, SPACE } from '@/src/design'

interface FallbackProps {
  error: Error
  retry: () => void
}

/**
 * Visible, theme-aware crash fallback for the whole navigation tree.
 *
 * expo-router's stock boundary renders a black screen with bare text; if a
 * render/effect error is the cause of a blank "gray" tab this makes the actual
 * message visible on-device so it can be reported. Renders the message + stack
 * plus a themed Retry that re-renders the failed subtree.
 */
function ErrorFallback({ error, retry }: FallbackProps) {
  const { theme } = useTheme()
  const c = theme.colors
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ padding: SPACE.xxxl, flexGrow: 1 }}>
        <View style={{ marginBottom: SPACE.xxxl }}>
          <Text style={{ color: c.accent, fontSize: FONT.sm, fontWeight: '800', letterSpacing: 3, textTransform: 'uppercase' }}>
            Something went wrong
          </Text>
        </View>
        <Text style={{ color: c.text, fontSize: FONT.lead, fontWeight: '900', marginBottom: SPACE.lg }}>
          {error?.message || 'Unknown error'}
        </Text>
        {error?.stack ? (
          <Text style={{ color: c.muted, fontSize: FONT.xs, fontFamily: CODE_FONT, lineHeight: 16 }}>
            {error.stack}
          </Text>
        ) : null}
        <View style={{ marginTop: SPACE.xxxl }}>
          <TouchableOpacity
            onPress={retry}
            accessibilityRole="button"
            style={{
              alignSelf: 'flex-start',
              paddingVertical: SPACE.xl,
              paddingHorizontal: SPACE.xxxl,
              borderWidth: 1,
              borderColor: withAlpha(c.accent, 0.7),
              borderRadius: theme.buttonRadius,
              backgroundColor: withAlpha(c.accent, 0.08),
            }}
          >
            <Text style={{ color: c.accent, fontSize: FONT.md, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.5 }}>
              Retry
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

/**
 * Replaces expo-router's default ErrorBoundary export. It is a function
 * component that receives `{ error, retry }` from expo-router.
 */
export function ErrorBoundary({ error, retry }: FallbackProps) {
  return <ErrorFallback error={error} retry={retry} />
}

/**
 * Local boundary to wrap a single screen's subtree (e.g. the Profile authed
 * branch) so a crash there is shown inline instead of blanking the tab.
 */
export class ScreenBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return <ErrorFallback error={this.state.error} retry={() => this.setState({ error: null })} />
    }
    return this.props.children
  }
}