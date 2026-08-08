import { Link, Stack } from 'expo-router'
import { StyleSheet, View } from 'react-native'
import { Text } from 'react-native'
import { useTheme } from '@/src/theme'

export default function NotFoundScreen() {
  const { theme } = useTheme()
  const c = theme.colors
  return (
    <>
      <Stack.Screen options={{ title: 'Oops!' }} />
      <View style={[styles.container, { backgroundColor: c.bg }]}>
        <Text style={[styles.title, { color: c.text, fontFamily: theme.mono ? 'monospace' : undefined }]}>
          This screen doesn't exist.
        </Text>
        <Link href="/" style={[styles.link, { borderColor: c.accent }]}>
          <Text style={[styles.linkText, { color: c.accent, fontFamily: theme.mono ? 'monospace' : undefined }]}>
            Go to home screen!
          </Text>
        </Link>
      </View>
    </>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  link: {
    marginTop: 15,
    paddingVertical: 15,
    borderWidth: 1,
    paddingHorizontal: 18,
    borderRadius: 8,
  },
  linkText: {
    fontSize: 14,
    fontWeight: '700',
  },
})