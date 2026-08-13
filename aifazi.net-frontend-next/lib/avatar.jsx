'use client'

// Shared web avatar helpers + renderer.
// Mirrors mobile (apps/mobile/src/components/Avatar.tsx): a value like
// `avatar:hackerfox` or a short bare key is a BUILTIN avatar → render the
// emoji instead of an <img> (the CSP img-src has no `avatar:` scheme, so a
// plain <img src="avatar:..."> is always blocked/broken).
//
//   - `avatar:<key>` or a short bare key that matches BUILTIN_AVATARS → emoji
//   - `https?://` URL → rendered as an <img>
//   - anything else → null, callers fall back to initials / dicebear

export const BUILTIN_AVATAR_ICONS = {
  'neon-cat': '🐱',
  'cyber-bot': '🤖',
  hackerfox: '🦊',
  'owl-sage': '🦉',
  'space-owl': '🪐',
  dragon: '🐉',
  wolf: '🐺',
  panda: '🐼',
  raccoon: '🦝',
  'fox-snug': '🦦',
  ninja: '🥷',
  alien: '👽',
  ghost: '👻',
  rocket: '🚀',
  satellite: '🛰️',
  controller: '🕹️',
  flame: '🔥',
  bolt: '⚡',
  star: '⭐',
  heart: '💚',
  skull: '💀',
  crown: '👑',
  shield: '🛡️',
  lock: '🔒',
  key: '🔑',
  horns: '👹',
  angel: '😇',
  smile: '😎',
  ninja2: '👤',
  astro: '🧑‍🚀',
}

/** Emoji for a builtin avatar key (`avatar:<key>` or bare short key), else null. */
export function builtinAvatarEmoji(avatar) {
  if (!avatar) return null
  if (avatar.startsWith('avatar:')) return BUILTIN_AVATAR_ICONS[avatar.slice(7)] || null
  if (avatar.length < 64 && !avatar.includes('/')) return BUILTIN_AVATAR_ICONS[avatar] || null
  return null
}

/** Safe <img> URL for the value, or null if it's a builtin / not a URL. */
export function avatarUrl(avatar) {
  if (builtinAvatarEmoji(avatar)) return null
  if (avatar && typeof avatar === 'string' && /^https?:\/\//.test(avatar)) return avatar
  return null
}

/**
 * Circle avatar: builtin emoji, image URL (or `fallback`), or null.
 * - `size` px circle (inline styles on the emoji circle / img)
 * - `imgStyle` extra inline styles for the <img>
 * - `imgClassName` optional class for the <img> (e.g. community-avatar)
 * - `fallback` URL used when the value is not a usable URL
 */
export function UserAvatar({ avatar, name = '', size = 40, style, imgStyle, imgClassName, fallback, onClick }) {
  const emoji = builtinAvatarEmoji(avatar)
  if (emoji) {
    return (
      <div
        onClick={onClick}
        style={{
          width: size, height: size, borderRadius: '50%', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: Math.round(size * 0.5), lineHeight: 1,
          background: 'rgba(128,128,128,0.12)', border: '1px solid var(--border)',
          ...style,
        }}
      >
        <span aria-hidden="true">{emoji}</span>
      </div>
    )
  }
  const src = avatarUrl(avatar) || fallback
  if (!src) return null
  return (
    <img
      src={src}
      alt={name || 'avatar'}
      loading="lazy"
      onClick={onClick}
      className={imgClassName}
      style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, ...imgStyle }}
    />
  )
}
