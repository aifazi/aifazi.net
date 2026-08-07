import { ReactNode } from 'react'
import { Text, TextInput, View, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native'
import { useTheme } from '@/src/theme'

export function Btn({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  style,
}: {
  title: string
  onPress: () => void
  variant?: 'primary' | 'ghost' | 'danger'
  disabled?: boolean
  style?: ViewStyle
}) {
  const { theme } = useTheme()
  const c = theme.colors
  const isPrimary = variant === 'primary'
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.btn,
        {
          backgroundColor: isPrimary ? c.accent : 'transparent',
          borderColor: variant === 'danger' ? c.danger : isPrimary ? c.accent : c.border,
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
    >
      <Text
        style={{
          color: isPrimary ? (theme.dark ? '#000' : '#fff') : variant === 'danger' ? c.danger : c.text,
          fontFamily: theme.mono ? 'monospace' : undefined,
          fontWeight: '700',
        }}
      >
        {title}
      </Text>
    </TouchableOpacity>
  )
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const { theme } = useTheme()
  const c = theme.colors
  return (
    <View
      style={[
        {
          backgroundColor: c.bg2,
          borderColor: c.border,
          borderRadius: theme.mono ? 0 : 12,
          borderWidth: 1,
          padding: 14,
          marginBottom: 10,
        },
        style,
      ]}
    >
      {children}
    </View>
  )
}

export function Title({ children }: { children: ReactNode }) {
  const { theme } = useTheme()
  const c = theme.colors
  return (
    <Text
      style={{
        color: c.text,
        fontSize: 24,
        fontWeight: '800',
        marginBottom: 12,
        fontFamily: theme.mono ? 'monospace' : undefined,
        letterSpacing: theme.mono ? 1 : 0,
      }}
    >
      {children}
    </Text>
  )
}

export function Muted({ children }: { children: ReactNode }) {
  const { theme } = useTheme()
  return (
    <Text style={{ color: theme.colors.muted, fontSize: 12, fontFamily: theme.mono ? 'monospace' : undefined }}>
      {children}
    </Text>
  )
}

export function Field({
  label,
  value,
  onChangeText,
  secure = false,
  placeholder,
  autoCapitalize = 'none',
}: {
  label: string
  value: string
  onChangeText: (t: string) => void
  secure?: boolean
  placeholder?: string
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters'
}) {
  const { theme } = useTheme()
  const c = theme.colors
  return (
    <View style={{ marginBottom: 12 }}>
      <Text
        style={{
          color: c.muted,
          fontSize: 10,
          letterSpacing: 2,
          marginBottom: 6,
          fontFamily: theme.mono ? 'monospace' : undefined,
        }}
      >
        {label.toUpperCase()}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secure}
        placeholder={placeholder}
        placeholderTextColor={c.muted}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        style={{
          backgroundColor: c.bg,
          color: c.text,
          borderColor: c.border,
          borderRadius: theme.mono ? 0 : 8,
          borderWidth: 1,
          paddingHorizontal: 12,
          paddingVertical: 12,
          fontSize: 15,
          fontFamily: theme.mono ? 'monospace' : undefined,
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  btn: {
    paddingVertical: 13,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
