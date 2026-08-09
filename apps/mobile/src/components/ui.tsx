import { ReactNode, useState } from 'react'
import { Text, TextInput, View, TouchableOpacity, StyleSheet, ViewStyle, TextStyle } from 'react-native'
import { useTheme } from '@/src/theme'
import { withAlpha, glowShadow } from '@/src/lib/color'

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
  const isDanger = variant === 'danger'
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.75}
      style={[
        styles.btn,
        {
          backgroundColor: isPrimary ? c.accent : withAlpha(c.accent, 0.05),
          borderColor: isDanger ? c.danger : isPrimary ? c.accent : withAlpha(c.accent, 0.25),
          opacity: disabled ? 0.4 : 1,
          shadowColor: isPrimary ? c.accent : '#000',
          shadowOpacity: isPrimary ? (theme.dark ? 0.4 : 0.25) : 0.14,
          shadowRadius: isPrimary ? 12 : 6,
          shadowOffset: { width: 0, height: isPrimary ? 5 : 3 },
          elevation: isPrimary ? 6 : 2,
        },
        style,
      ]}
    >
      <Text
        style={{
          color: isPrimary ? (theme.dark ? '#000' : '#fff') : isDanger ? c.danger : c.text,
          fontFamily: theme.mono ? 'monospace' : undefined,
          fontWeight: '800',
          fontSize: 14,
          letterSpacing: 0.3,
        }}
      >
        {title}
      </Text>
    </TouchableOpacity>
  )
}

export function Card({
  children,
  style,
  title,
  subtitle,
  headerRight,
}: {
  children: ReactNode
  style?: ViewStyle
  title?: string
  subtitle?: string
  headerRight?: ReactNode
}) {
  const { theme } = useTheme()
  const c = theme.colors
  const icy = !theme.mono
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: withAlpha(c.bg2, theme.dark ? 0.92 : 0.98),
          borderColor: icy ? withAlpha(c.accent, 0.16) : c.border,
          borderRadius: theme.mono ? 0 : 18,
        },
        glowShadow(20, theme.dark ? 0.4 : 0.14),
        style,
      ]}
    >
      {icy ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            top: 16,
            bottom: 16,
            width: 3,
            borderRadius: 2,
            backgroundColor: withAlpha(c.accent, 0.55),
          }}
        />
      ) : null}
      {title ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.text, fontSize: 14, fontWeight: '900', fontFamily: theme.mono ? 'monospace' : undefined, letterSpacing: 0.4 }}>
              {title}
            </Text>
            {subtitle ? <Muted>{subtitle}</Muted> : null}
          </View>
          {headerRight ?? null}
        </View>
      ) : null}
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
        fontWeight: '900',
        marginBottom: 14,
        fontFamily: theme.mono ? 'monospace' : undefined,
        letterSpacing: theme.mono ? 1 : 0.4,
      }}
    >
      {children}
    </Text>
  )
}

export function Muted({ children, style, numberOfLines }: { children: ReactNode; style?: TextStyle; numberOfLines?: number }) {
  const { theme } = useTheme()
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[{ color: theme.colors.muted, fontSize: 12, lineHeight: 17, fontFamily: theme.mono ? 'monospace' : undefined }, style]}
    >
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
  keyboardType,
  maxLength,
  autoFocus,
}: {
  label: string
  value: string
  onChangeText: (t: string) => void
  secure?: boolean
  placeholder?: string
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters'
  keyboardType?: 'default' | 'email-address' | 'numeric' | 'phone-pad' | 'number-pad'
  maxLength?: number
  autoFocus?: boolean
}) {
  const { theme } = useTheme()
  const c = theme.colors
  const [focused, setFocused] = useState(false)
  return (
    <View style={{ marginBottom: 12 }}>
      <Text
        style={{
          color: focused ? c.accent2 : c.muted,
          fontSize: 10,
          letterSpacing: 2,
          marginBottom: 6,
          fontFamily: theme.mono ? 'monospace' : undefined,
          fontWeight: '700',
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
        keyboardType={keyboardType}
        maxLength={maxLength}
        autoFocus={autoFocus}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          backgroundColor: c.bg,
          color: c.text,
          borderColor: focused ? withAlpha(c.accent2, 0.6) : c.border,
          borderRadius: theme.mono ? 0 : 12,
          borderWidth: 1,
          paddingHorizontal: 12,
          paddingVertical: 12,
          fontSize: 15,
          fontFamily: theme.mono ? 'monospace' : undefined,
          shadowColor: focused ? c.accent2 : 'transparent',
          shadowOpacity: 0.25,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 0 },
          elevation: 0,
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  btn: {
    paddingVertical: 13,
    paddingHorizontal: 20,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    borderWidth: 1,
    padding: 16,
    paddingLeft: 18,
    marginBottom: 12,
    overflow: 'hidden',
  },
})

/**
 * Fully themed switch — replaces the native RN <Switch>. Draws the track and
 * thumb from theme colors so it matches everywhere (no default OS chrome).
 */
export function Toggle({
  value,
  onValueChange,
  disabled = false,
}: {
  value: boolean
  onValueChange: (v: boolean) => void
  disabled?: boolean
}) {
  const { theme } = useTheme()
  const c = theme.colors
  const accent = value ? c.accent : c.border
  const thumb = value ? c.bg : c.muted
  return (
    <TouchableOpacity
      onPress={() => !disabled && onValueChange(!value)}
      disabled={disabled}
      activeOpacity={0.8}
      style={{
        width: 48,
        height: 28,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: accent,
        backgroundColor: value ? withAlpha(c.accent, 0.14) : c.bg3,
        opacity: disabled ? 0.5 : 1,
        padding: 2,
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 11,
          backgroundColor: thumb,
          alignSelf: value ? 'flex-end' : 'flex-start',
          shadowColor: value ? c.accent : '#000',
          shadowOpacity: value ? 0.5 : 0.3,
          shadowRadius: 4,
          shadowOffset: { width: 0, height: 1 },
        }}
      />
    </TouchableOpacity>
  )
}