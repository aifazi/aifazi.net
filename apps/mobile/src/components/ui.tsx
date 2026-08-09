import { ReactNode, useState } from 'react'
import { Text, TextInput, View, TouchableOpacity, StyleSheet, ViewStyle, TextStyle, ScrollView, DimensionValue } from 'react-native'
import { useTheme } from '@/src/theme'
import { withAlpha, glowShadow, contrastText } from '@/src/lib/color'
import { webPillSnap } from '@/src/lib/carousel'
import { CODE_FONT, micro, buttonLabel, tagLabel } from '@/src/design'
import { Icon, IconName } from '@/src/components/icon'

/* ─── Surfaces / shapes ─────────────────────────────────────────────────── */

const CARD_SHADOW = glowShadow(10, 0.32)

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
  const filled = isPrimary || isDanger
  const radius = theme.buttonRadius
  const notchColor = c.bg

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      style={[
        styles.btn,
        {
          borderRadius: radius,
          backgroundColor: filled ? (isPrimary ? c.accent : c.danger) : withAlpha(c.accent, 0.04),
          borderColor: isDanger ? withAlpha(c.danger, 0.9) : isPrimary ? c.accent : withAlpha(c.accent2, 0.35),
          opacity: disabled ? 0.4 : 1,
          shadowColor: filled ? (isPrimary ? c.accent : c.danger) : '#000',
          shadowOpacity: filled ? (theme.dark ? 0.45 : 0.3) : 0.1,
          shadowRadius: filled ? 14 : 5,
          shadowOffset: { width: 0, height: filled ? 4 : 2 },
          elevation: filled ? 5 : 1,
        },
        style,
      ]}
    >
      {filled ? (
        <>
          <View pointerEvents="none" style={[styles.notch, { top: -7, right: -7, backgroundColor: notchColor }]} />
          <View pointerEvents="none" style={[styles.notch, { bottom: -7, left: -7, backgroundColor: notchColor }]} />
        </>
      ) : null}
      <Text
        style={[
          buttonLabel(),
          {
            color: isPrimary ? c.onAccent : isDanger ? contrastText(c.danger) : c.accent2,
          },
        ]}
      >
        {title}
      </Text>
    </TouchableOpacity>
  )
}

/** Section micro-tag above headings — web `.section-tag`: mono, wide-track, uppercase. */
export function SectionTag({ children, color }: { children: ReactNode; color?: string }) {
  const { theme } = useTheme()
  const c = theme.colors
  const tint = color ?? c.accent
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
      <View style={{ width: 18, height: 2, backgroundColor: withAlpha(tint, 0.6) }} />
      <Text style={[micro(10, 3.5, '700'), { color: tint }]}>{children}</Text>
    </View>
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
          backgroundColor: withAlpha(c.bg2, theme.dark ? 0.94 : 0.98),
          borderColor: icy ? withAlpha(c.accent2, 0.18) : withAlpha(c.accent2, 0.4),
          borderRadius: theme.radius,
        },
        CARD_SHADOW,
        style,
      ]}
    >
      {icy ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 2,
            borderTopLeftRadius: theme.radius,
            borderTopRightRadius: theme.radius,
            backgroundColor: withAlpha(c.accent, 0.5),
          }}
        />
      ) : null}
      {title ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.text, fontSize: 15, fontWeight: '900', letterSpacing: 0.4 }}>{title}</Text>
            {subtitle ? (
              <Text style={[tagLabel(9, 3), { color: c.accent2, marginTop: 3 }]}>{subtitle}</Text>
            ) : null}
          </View>
          {headerRight ?? null}
        </View>
      ) : null}
      {children}
    </View>
  )
}

export function Title({ children, tag }: { children: ReactNode; tag?: string }) {
  const { theme } = useTheme()
  const c = theme.colors
  return (
    <View style={{ marginBottom: 14 }}>
      {tag ? <SectionTag>{tag}</SectionTag> : null}
      <Text
        style={{
          color: c.text,
          fontSize: 26,
          fontWeight: '900',
          letterSpacing: theme.mono ? 1 : 0.2,
        }}
      >
        {children}
      </Text>
    </View>
  )
}

export function Muted({ children, style, numberOfLines }: { children: ReactNode; style?: TextStyle; numberOfLines?: number }) {
  const { theme } = useTheme()
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[{ color: theme.colors.muted, fontSize: 13, lineHeight: 18 }, style]}
    >
      {children}
    </Text>
  )
}

/** Tiny mono uppercase label used for micro-labels inside cards/lists. */
export function MicroLabel({ children, color, size = 9, spacing = 2, style }: {
  children: ReactNode
  color?: string
  size?: number
  spacing?: number
  style?: TextStyle
}) {
  const { theme } = useTheme()
  const c = theme.colors
  return <Text style={[micro(size, spacing, '700'), { color: color ?? c.accent2 }, style]}>{children}</Text>
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
  const radius = theme.buttonRadius
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={[micro(10, 2.5, '700'), { color: focused ? c.accent2 : c.muted, marginBottom: 6 }]}>
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
          borderColor: focused ? withAlpha(c.accent, 0.7) : c.border,
          borderRadius: radius,
          borderWidth: 1,
          paddingHorizontal: 14,
          paddingVertical: radius === 0 ? 14 : 13,
          fontSize: 15,
          fontFamily: CODE_FONT,
          shadowColor: focused ? c.accent : 'transparent',
          shadowOpacity: 0.25,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 0 },
          elevation: 0,
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  btn: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  notch: {
    position: 'absolute',
    width: 14,
    height: 14,
    transform: [{ rotate: '45deg' }],
  },
  card: {
    borderWidth: 1,
    padding: 16,
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
  const radius = theme.mono ? 0 : Math.max(9, theme.buttonRadius + 4)
  return (
    <TouchableOpacity
      onPress={() => !disabled && onValueChange(!value)}
      disabled={disabled}
      activeOpacity={0.8}
      style={{
        width: 48,
        height: 28,
        borderRadius: radius,
        borderWidth: 1,
        borderColor: accent,
        backgroundColor: value ? withAlpha(c.accent, 0.14) : c.bg3,
        opacity: disabled ? 0.5 : 1,
        padding: 3,
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          width: 20,
          height: 20,
          borderRadius: radius - 3,
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

/**
 * Single tappable list row ("row"): left icon + title/subtitle, optional
 * chevron. Consolidates the per-screen list-row markup used across the app.
 */
export function ListItem({
  icon,
  title,
  subtitle,
  onPress,
  badge,
  tint,
  disabled,
}: {
  icon?: IconName
  title: string
  subtitle?: string
  onPress?: () => void
  badge?: string | number
  tint?: string
  disabled?: boolean
}) {
  const { theme } = useTheme()
  const c = theme.colors
  const body = (
    <>
      {icon ? (
        <View style={{ width: 34, alignItems: 'center' }}>
          <Icon name={icon} size={19} color={tint ?? c.accent2} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text
          numberOfLines={1}
          style={{ color: disabled ? c.muted : c.text, fontSize: 14, fontWeight: '800', letterSpacing: 0.3 }}
        >
          {title}
        </Text>
        {subtitle ? <Muted numberOfLines={1} style={{ fontSize: 11 }}>{subtitle}</Muted> : null}
      </View>
      {badge != null ? <Badge text={String(badge)} /> : null}
      {onPress ? <Icon name="forward" size={15} color={c.muted} /> : null}
    </>
  )
  if (!onPress) {
    return (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingVertical: 12,
          paddingHorizontal: 4,
          borderBottomWidth: 1,
          borderBottomColor: c.divider,
          opacity: disabled ? 0.5 : 1,
        }}
      >
        {body}
      </View>
    )
  }
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.6}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: c.divider }}
    >
      {body}
    </TouchableOpacity>
  )
}

/** Small mono pill showing a count / status word. */
export function Badge({
  text,
  color,
  outline = false,
}: {
  text: string
  color?: string
  outline?: boolean
}) {
  const { theme } = useTheme()
  const c = theme.colors
  const bg = color ?? c.accent
  return (
    <View
      style={{
        minWidth: 20,
        paddingHorizontal: 7,
        paddingVertical: 3,
        borderRadius: theme.radius,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: outline ? withAlpha(bg, 0.1) : bg,
        borderWidth: 1,
        borderColor: withAlpha(bg, 0.5),
      }}
    >
      <Text style={[tagLabel(8.5, 1), { color: outline ? bg : c.onAccent }]}>{text}</Text>
    </View>
  )
}

/** Empty state placeholder ("No X yet", optional icon + action). */
export function EmptyState({
  icon,
  title,
  subtitle,
  actionLabel,
  onAction,
}: {
  icon?: IconName
  title: string
  subtitle?: string
  actionLabel?: string
  onAction?: () => void
}) {
  const { theme } = useTheme()
  const c = theme.colors
  return (
    <View style={{ alignItems: 'center', paddingVertical: 44, paddingHorizontal: 24 }}>
      {icon ? <Icon name={icon} size={34} color={withAlpha(c.muted, 0.7)} /> : null}
      <Text style={{ color: c.text2, fontSize: 15, fontWeight: '800', marginTop: 10, textAlign: 'center' }}>{title}</Text>
      {subtitle ? <Muted style={{ textAlign: 'center', marginTop: 4 }}>{subtitle}</Muted> : null}
      {actionLabel && onAction ? (
        <Btn title={actionLabel} onPress={onAction} style={{ marginTop: 14, paddingVertical: 8, paddingHorizontal: 18 }} />
      ) : null}
    </View>
  )
}

/** Theme-aware pulsing skeleton block (list rows / cards while loading). */
export function Skeleton({ width, height, radius = 10 }: { width: DimensionValue; height: number; radius?: number }) {
  const { theme } = useTheme()
  const c = theme.colors
  return <View style={{ width, height, borderRadius: theme.mono ? 0 : radius, backgroundColor: withAlpha(c.border, 0.45), overflow: 'hidden' }} />
}

/** Inline form error line. */
export function FormError({ message }: { message?: string | null }) {
  const { theme } = useTheme()
  const c = theme.colors
  if (!message) return null
  return (
    <Text style={[micro(11, 1.5, '700'), { color: c.danger, marginBottom: 10, textTransform: 'none' }]}>{message}</Text>
  )
}

/**
 * Shared "category pill" row — the copy-pasted block present in blog, forum and
 * store screens. `All` + each category/value with active highlight. Now styled
 * like the web store-tab pills: mono, uppercase, angular, green active glow.
 */
export function CategoryPills<T extends string>({
  items,
  active,
  onSelect,
}: {
  items: { key: T; label?: string }[]
  active: T
  onSelect: (v: T) => void
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} {...webPillSnap()}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {items.map((it) => (
          <Pill key={it.key} label={it.label ?? it.key} active={it.key === active} onPress={() => onSelect(it.key)} />
        ))}
      </View>
    </ScrollView>
  )
}

/** Individual pill button used by CategoryPills and standalone chips. */
export function Pill({
  label,
  active,
  onPress,
  color,
}: {
  label: string
  active?: boolean
  onPress?: () => void
  color?: string
}) {
  const { theme } = useTheme()
  const c = theme.colors
  const tint = color ?? c.accent2
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={{
        borderWidth: 1,
        borderColor: active ? withAlpha(tint, 0.7) : c.border,
        borderRadius: theme.mono ? 0 : Math.max(4, theme.buttonRadius),
        paddingHorizontal: 14,
        paddingVertical: 8,
        backgroundColor: active ? withAlpha(tint, 0.14) : 'transparent',
        shadowColor: active ? tint : '#000',
        shadowOpacity: active ? 0.35 : 0,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 0 },
        elevation: active ? 2 : 0,
      }}
    >
      <Text style={[tagLabel(10, 1.8), { color: active ? tint : c.muted }]}>{label}</Text>
    </TouchableOpacity>
  )
}