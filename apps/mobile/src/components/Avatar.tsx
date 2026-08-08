// Shared theme-aware Avatar renderer + built-in avatar icon presets.
// The app previously ignored `avatar` URLs in most lists and only showed
// initials circles. This component is used everywhere so avatars are consistent:
//   - if `avatar` looks like an image URL -> render via expo-image
//   - else if `avatar` matches one of the BUILTIN_AVATARS icons -> render the emoji
//   - else fallback to initials circle
// Built-in avatars are stored as `builtin:<key>` so they never conflict with URLs.

import { View, Text } from 'react-native'
import { Image } from 'expo-image'
import { useTheme } from '@/src/theme'

export const BUILTIN_AVATARS = [
  { key: 'neon-cat', icon: '🐱', label: 'Neon Cat' },
  { key: 'cyber-bot', icon: '🤖', label: 'Cyber Bot' },
  { key: 'hackerfox', icon: '🦊', label: 'Hacker Fox' },
  { key: 'owl-sage', icon: '🦉', label: 'Owl Sage' },
  { key: 'space-owl', icon: '🪐', label: 'Space Owl' },
  { key: 'dragon', icon: '🐉', label: 'Dragon' },
  { key: 'wolf', icon: '🐺', label: 'Wolf' },
  { key: 'panda', icon: '🐼', label: 'Panda' },
  { key: 'raccoon', icon: '🦝', label: 'Raccoon' },
  { key: 'fox-snug', icon: '🦦', label: 'River Otter' },
  { key: 'ninja', icon: '🥷', label: 'Ninja' },
  { key: 'alien', icon: '👽', label: 'Alien' },
  { key: 'ghost', icon: '👻', label: 'Ghost' },
  { key: 'rocket', icon: '🚀', label: 'Rocket' },
  { key: 'satellite', icon: '🛰️', label: 'Satellite' },
  { key: 'controller', icon: '🕹️', label: 'Gamer' },
  { key: 'flame', icon: '🔥', label: 'Flame' },
  { key: 'bolt', icon: '⚡', label: 'Bolt' },
  { key: 'star', icon: '⭐', label: 'Star' },
  { key: 'heart', icon: '💚', label: 'Heart' },
  { key: 'skull', icon: '💀', label: 'Skull' },
  { key: 'crown', icon: '👑', label: 'Crown' },
  { key: 'shield', icon: '🛡️', label: 'Shield' },
  { key: 'lock', icon: '🔒', label: 'Lock' },
  { key: 'key', icon: '🔑', label: 'Key' },
  { key: 'horns', icon: '👹', label: 'Demon' },
  { key: 'angel', icon: '😇', label: 'Angel' },
  { key: 'smile', icon: '😎', label: 'Cool Smile' },
  { key: 'ninja2', icon: '👤', label: 'Silhouette' },
  { key: 'astro', icon: '🧑‍🚀', label: 'Astronaut' },
] as const

export const BUILTIN_AVATAR_ICONS: Record<string, string> = Object.fromEntries(
  BUILTIN_AVATARS.map((a) => [a.key, a.icon]),
)

function initials(name: string): string {
  const parts = (name || '?').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function Avatar({
  name,
  avatar,
  size = 40,
  radius,
}: {
  name?: string
  avatar?: string | null
  size?: number
  radius?: number
}) {
  const { theme } = useTheme()
  const c = theme.colors
  const r = radius ?? size / 2

  const builtin = avatar?.startsWith('avatar:')
    ? BUILTIN_AVATAR_ICONS[avatar.slice(7)]
    : avatar && avatar.length < 64 && !avatar.includes('/')
      ? BUILTIN_AVATAR_ICONS[avatar]
      : null

  if (builtin) {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: r,
          backgroundColor: `${c.accent2}22`,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: `${c.accent2}44`,
        }}
      >
        <Text style={{ fontSize: size * 0.55 }}>{builtin}</Text>
      </View>
    )
  }

  if (avatar && /^https?:\/\//.test(avatar)) {
    return (
      <Image
        source={{ uri: avatar }}
        style={{ width: size, height: size, borderRadius: r }}
        contentFit="cover"
        transition={150}
      />
    )
  }

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: r,
        backgroundColor: `${c.accent}22`,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: `${c.accent}44`,
      }}
    >
      <Text style={{ color: c.accent, fontSize: size * 0.38, fontWeight: '800', fontFamily: theme.mono ? 'monospace' : undefined }}>
        {initials(name || '')}
      </Text>
    </View>
  )
}