import { ReactNode, useRef, useState } from 'react'
import { Text, TextInput, View, TouchableOpacity, StyleSheet, ViewStyle, TextStyle, ScrollView, DimensionValue, ActivityIndicator, Animated } from 'react-native'
import { BlurView } from 'expo-blur'
import { useTheme } from '@/src/theme'
import { withAlpha, contrastText } from '@/src/lib/color'
import { webPillSnap } from '@/src/lib/carousel'
import { CODE_FONT, FONT, SPACE, buttonLabel, frameworkStyles, micro, tagLabel } from '@/src/design'
import { Icon, IconName } from '@/src/components/icon'
import { Shimmer } from '@/src/components/motion'
import { AmbientGlow } from '@/src/components/glow'

/* ─── Surfaces / shapes ─────────────────────────────────────────────────── */

const BTN_PADDING: Record<BtnSize, { py: number; px: number; fs: number }> = {
  sm: { py: 8, px: 12, fs: 12 },
  md: { py: 14, px: 20, fs: 13 },
  lg: { py: 17, px: 24, fs: 14 },
}

export type BtnSize = 'sm' | 'md' | 'lg'

export function Btn({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  leading,
  size = 'md',
  full = false,
  style,
}: {
  title: string
  onPress: () => void
  variant?: 'primary' | 'ghost' | 'danger'
  disabled?: boolean
  loading?: boolean
  leading?: ReactNode
  size?: BtnSize
  full?: boolean
  style?: ViewStyle
}) {
  const { theme, framework } = useTheme()
  const c = theme.colors
  const fw = framework.input
  const isPrimary = variant === 'primary'
  const isDanger = variant === 'danger'
  const filled = isPrimary || isDanger
  const radius = fw.buttonRadius
  const notchColor = c.bg
  const labelColor = isPrimary ? c.onAccent : isDanger ? contrastText(c.danger) : c.accent2
  const scale = useRef(new Animated.Value(1)).current
  const pad = BTN_PADDING[size]
  const borderWidth = fw.borderWidth

  const pressIn = () => Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 40, bounciness: 0 }).start()
  const pressOut = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 0 }).start()

  return (
    <Animated.View style={[{ transform: [{ scale }] }, full && { alignSelf: 'stretch' }]}>
      <TouchableOpacity
        onPress={onPress}
        onPressIn={pressIn}
        onPressOut={pressOut}
        disabled={disabled || loading}
        activeOpacity={0.85}
        style={[
          styles.btn,
          {
            borderRadius: radius,
            borderWidth,
            paddingVertical: pad.py,
            paddingHorizontal: pad.px,
            backgroundColor: filled ? (isPrimary ? c.accent : c.danger) : withAlpha(c.accent, 0.04),
            borderColor: isDanger ? withAlpha(c.danger, 0.9) : isPrimary ? c.accent : withAlpha(c.accent2, 0.35),
            opacity: disabled ? 0.4 : loading ? 0.85 : 1,
            shadowColor: filled ? (isPrimary ? c.accent : c.danger) : '#000',
            shadowOpacity: filled ? (fw.glow ? (theme.dark ? 0.5 : 0.35) : theme.dark ? 0.45 : 0.3) : 0.1,
            shadowRadius: filled ? (fw.glow ? 18 : 14) : 5,
            shadowOffset: { width: fw.hardShadow ? (filled ? 3 : 2) : 0, height: filled ? (fw.hardShadow ? 4 : 4) : 2 },
            elevation: filled ? 5 : 1,
            alignSelf: full ? 'stretch' : undefined,
          },
          style,
        ]}
      >
        {filled && fw.notch ? (
          <>
            <View pointerEvents="none" style={[styles.notch, { top: -7, right: -7, backgroundColor: notchColor }]} />
            <View pointerEvents="none" style={[styles.notch, { bottom: -7, left: -7, backgroundColor: notchColor }]} />
          </>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 }}>
          {loading ? (
            <ActivityIndicator size="small" color={labelColor} />
          ) : (
            <>
              {leading ?? null}
              <Text style={[buttonLabel(pad.fs), { color: labelColor }]}>{title}</Text>
            </>
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  )
}

/** Section micro-tag above headings — web `.section-tag`: mono, wide-track, uppercase. */
export function SectionTag({ children, color }: { children: ReactNode; color?: string }) {
  const { theme } = useTheme()
  const c = theme.colors
  const tint = color ?? c.accent
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md, marginBottom: SPACE.sm }}>
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
  onPress,
}: {
  children: ReactNode
  style?: ViewStyle
  title?: string
  subtitle?: string
  headerRight?: ReactNode
  onPress?: () => void
}) {
  const { theme, framework } = useTheme()
  const c = theme.colors
  const fw = framework.surface
  const icy = !theme.mono
  const isGlass = theme.id.includes('glass') || theme.id.includes('macos')
  const scale = useRef(new Animated.Value(1)).current
  const pressIn = () => Animated.spring(scale, { toValue: 0.98, useNativeDriver: true, speed: 50, bounciness: 0 }).start()
  const pressOut = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 50, bounciness: 4 }).start()
  const shell = [
    styles.card,
    {
      backgroundColor: withAlpha(c.bg2, isGlass ? 0.42 : theme.dark ? 0.9 : 0.97),
      borderColor: icy ? withAlpha(c.accent2, 0.18) : withAlpha(c.accent2, 0.4),
      borderWidth: fw.borderWidth,
      borderRadius: fw.radius,
      shadowColor: '#000',
      shadowOpacity: fw.hardShadow ? 0.18 : theme.dark ? 0.32 : 0.18,
      shadowRadius: fw.hardShadow ? 3 : 12,
      shadowOffset: { width: fw.hardShadow ? 4 : 0, height: fw.hardShadow ? 4 : 3 },
      elevation: fw.hardShadow ? 2 : 5,
      overflow: isGlass ? 'hidden' as const : undefined,
    },
    style,
  ]
  const inner = (
    <>
      {icy ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 2,
            borderTopLeftRadius: fw.radius,
            borderTopRightRadius: fw.radius,
            backgroundColor: withAlpha(c.accent, 0.5),
          }}
        />
      ) : null}
      {title ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACE.lg }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.text, fontSize: FONT.card, fontWeight: '900', letterSpacing: 0.4 }}>{title}</Text>
            {subtitle ? (
              <Text style={[tagLabel(9, 3), { color: c.accent2, marginTop: 3 }]}>{subtitle}</Text>
            ) : null}
          </View>
          {headerRight ?? null}
        </View>
      ) : null}
      {children}
    </>
  )
  if (!onPress) {
    if (isGlass) {
      return (
        <BlurView intensity={60} tint={theme.dark ? 'dark' : 'light'} style={shell}>
          <View style={{ flex: 1 }}>{inner}</View>
        </BlurView>
      )
    }
    return <View style={shell}>{inner}</View>
  }
  return (
    <Animated.View style={[{ transform: [{ scale }] }, style ? { alignSelf: 'stretch' } : null]}>
      {isGlass ? (
        <BlurView intensity={60} tint={theme.dark ? 'dark' : 'light'} style={shell}>
          <TouchableOpacity onPress={onPress} onPressIn={pressIn} onPressOut={pressOut} activeOpacity={0.9} style={{ flex: 1 }}>
            {inner}
          </TouchableOpacity>
        </BlurView>
      ) : (
        <TouchableOpacity onPress={onPress} onPressIn={pressIn} onPressOut={pressOut} activeOpacity={0.9} style={shell}>
          {inner}
        </TouchableOpacity>
      )}
    </Animated.View>
  )
}

export function Title({ children, tag }: { children: ReactNode; tag?: string }) {
  const { theme } = useTheme()
  const c = theme.colors
  return (
    <View style={{ marginBottom: SPACE.xxl }}>
      {tag ? <SectionTag>{tag}</SectionTag> : null}
      <Text
        style={{
          color: c.text,
          fontSize: FONT.title,
          fontWeight: '900',
          letterSpacing: frameworkStyles(theme).headingSpacing,
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
      style={[{ color: theme.colors.muted, fontSize: FONT.body, lineHeight: 18 }, style]}
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
  const { theme, framework } = useTheme()
  const c = theme.colors
  const fw = framework.input
  const [focused, setFocused] = useState(false)
  const radius = fw.buttonRadius
  return (
    <View style={{ marginBottom: SPACE.xl }}>
      <Text style={[micro(10, 2.5, '700'), { color: focused ? c.accent2 : c.muted, marginBottom: SPACE.sm }]}>
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
          paddingHorizontal: SPACE.xxl,
          paddingVertical: radius === 0 ? 14 : 13,
          fontSize: FONT.card,
          fontFamily: theme.mono ? CODE_FONT : undefined,
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
    paddingVertical: SPACE.xxl,
    paddingHorizontal: SPACE.giant,
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
    padding: SPACE.xxxl,
    marginBottom: SPACE.xl,
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
  const fw = frameworkStyles(theme)
  const accent = value ? c.accent : c.border
  const thumb = value ? c.bg : c.muted
  const radius = theme.mono ? 0 : Math.max(9, fw.buttonRadius + 4)
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
          style={{ color: disabled ? c.muted : c.text, fontSize: FONT.base, fontWeight: '800', letterSpacing: 0.3 }}
        >
          {title}
        </Text>
        {subtitle ? <Muted numberOfLines={1} style={{ fontSize: FONT.sm }}>{subtitle}</Muted> : null}
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
          gap: SPACE.md,
          paddingVertical: SPACE.xl,
          paddingHorizontal: SPACE.xs,
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
      style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md, paddingVertical: SPACE.xl, paddingHorizontal: SPACE.xs, borderBottomWidth: 1, borderBottomColor: c.divider }}
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
    <View style={{ alignItems: 'center', paddingVertical: 44, paddingHorizontal: SPACE.mega }}>
      {icon ? (
        <View style={{ width: 92, height: 92, alignItems: 'center', justifyContent: 'center' }}>
          <AmbientGlow color={c.accent} size={130} intensity={0.16} style={{ top: -19, left: -19 }} />
          <View
            style={{
              width: 68,
              height: 68,
              borderRadius: 34,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: withAlpha(c.accent2, 0.28),
              backgroundColor: withAlpha(c.accent, 0.06),
            }}
          >
            <Icon name={icon} size={30} color={withAlpha(c.accent, 0.85)} />
          </View>
        </View>
      ) : null}
      <Text style={{ color: c.text2, fontSize: FONT.card, fontWeight: '800', marginTop: SPACE.lg, textAlign: 'center' }}>{title}</Text>
      {subtitle ? <Muted style={{ textAlign: 'center', marginTop: SPACE.xs }}>{subtitle}</Muted> : null}
      {actionLabel && onAction ? (
        <Btn title={actionLabel} onPress={onAction} style={{ marginTop: SPACE.xxl, paddingVertical: SPACE.md, paddingHorizontal: SPACE.huge }} />
      ) : null}
    </View>
  )
}

/** Theme-aware pulsing skeleton block (list rows / cards while loading). */
export function Skeleton({ width, height, radius = 10 }: { width: DimensionValue; height: number; radius?: number }) {
  return <Shimmer width={width} height={height} radius={radius} />
}

/** Inline form error line. */
export function FormError({ message }: { message?: string | null }) {
  const { theme } = useTheme()
  const c = theme.colors
  if (!message) return null
  return (
    <Text style={[micro(11, 1.5, '700'), { color: c.danger, marginBottom: SPACE.lg, textTransform: 'none' }]}>{message}</Text>
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
      <View style={{ flexDirection: 'row', gap: SPACE.md }}>
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
  const { theme, framework } = useTheme()
  const c = theme.colors
  const tint = color ?? c.accent2
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={{
        borderWidth: 1,
        borderColor: active ? withAlpha(tint, 0.7) : c.border,
        borderRadius: theme.mono ? 0 : Math.max(4, framework.input.buttonRadius),
        paddingHorizontal: SPACE.xxl,
        paddingVertical: SPACE.md,
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

/**
 * Static status/role chip — small filled pill with a leading dot. Used for
 * roles, presence and status words (matches web RolePill). Optional onPress
 * turns it into a button.
 */
export function Chip({
  label,
  color,
  dot = true,
  onPress,
  style,
}: {
  label: string
  color?: string
  dot?: boolean
  onPress?: () => void
  style?: ViewStyle
}) {
  const { theme } = useTheme()
  const c = theme.colors
  const tint = color ?? c.accent2
  const content = (
    <>
      {dot ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: tint }} /> : null}
      <Text style={[tagLabel(9, 1.5), { color: tint }]}>{label.toUpperCase()}</Text>
    </>
  )
  const box: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    alignSelf: 'flex-start',
    paddingHorizontal: 9,
    paddingVertical: SPACE.xs,
    borderRadius: theme.mono ? 0 : 999,
    borderWidth: 1,
    borderColor: withAlpha(tint, 0.35),
    backgroundColor: withAlpha(tint, 0.08),
    ...style,
  }
  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={box}>
        {content}
      </TouchableOpacity>
    )
  }
  return <View style={box}>{content}</View>
}