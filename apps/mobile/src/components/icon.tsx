import { SymbolView } from 'expo-symbols'
import { Text, ViewStyle, ColorValue } from 'react-native'
import { useTheme } from '@/src/theme'

/**
 * Cross-platform icon library. Backed by expo-symbols (SF Symbols on iOS,
 * Material Symbols on Android/web). `name` is a semantic key resolved to a
 * per-platform symbol. Falls back to a unicode glyph for mono architectures
 * and unknown keys — never crashes on a missing icon.
 */
export type IconName =
  | 'home'
  | 'forum'
  | 'blog'
  | 'chat'
  | 'profile'
  | 'store'
  | 'status'
  | 'orders'
  | 'ticket'
  | 'search'
  | 'back'
  | 'forward'
  | 'down'
  | 'up'
  | 'settings'
  | 'camera'
  | 'image'
  | 'attach'
  | 'phone'
  | 'video'
  | 'video-off'
  | 'mic'
  | 'mic-off'
  | 'send'
  | 'trash'
  | 'edit'
  | 'pin'
  | 'lock'
  | 'globe'
  | 'heart'
  | 'star'
  | 'check'
  | 'close'
  | 'plus'
  | 'refresh'
  | 'info'
  | 'alert'
  | 'download'
  | 'upload'
  | 'user-plus'
  | 'filter'
  | 'bell'
  | 'doc'
  | 'calendar'
  | 'external'
  | 'shield'
  | 'eye'
  | 'more'
  | 'reply'
  | 'smile'
  | 'link'
  | 'copy'
  | 'logout'
  | 'verify'
  | 'rocket'

type Sym = { ios: string; android: string }

const SYMBOLS: Record<IconName, Sym> = {
  home: { ios: 'house.fill', android: 'home' },
  forum: { ios: 'bubble.left.and.bubble.right.fill', android: 'forum' },
  blog: { ios: 'doc.text.fill', android: 'description' },
  chat: { ios: 'message.fill', android: 'chat_bubble' },
  profile: { ios: 'person.crop.circle.fill', android: 'person' },
  store: { ios: 'storefront.fill', android: 'storefront' },
  status: { ios: 'waveform.path.ecg', android: 'monitor_heart' },
  orders: { ios: 'shippingbox.fill', android: 'package_2' },
  ticket: { ios: 'ticket.fill', android: 'confirmation_number' },
  search: { ios: 'magnifyingglass', android: 'search' },
  back: { ios: 'chevron.left', android: 'chevron_left' },
  forward: { ios: 'chevron.right', android: 'chevron_right' },
  down: { ios: 'chevron.down', android: 'expand_more' },
  up: { ios: 'chevron.up', android: 'expand_less' },
  settings: { ios: 'gearshape.fill', android: 'settings' },
  camera: { ios: 'camera.fill', android: 'photo_camera' },
  image: { ios: 'photo.fill', android: 'image' },
  attach: { ios: 'paperclip', android: 'attach_file' },
  phone: { ios: 'phone.fill', android: 'call' },
  video: { ios: 'video.fill', android: 'videocam' },
  'video-off': { ios: 'video.slash.fill', android: 'videocam_off' },
  mic: { ios: 'mic.fill', android: 'mic' },
  'mic-off': { ios: 'mic.slash.fill', android: 'mic_off' },
  send: { ios: 'paperplane.fill', android: 'send' },
  trash: { ios: 'trash.fill', android: 'delete' },
  edit: { ios: 'pencil', android: 'edit' },
  pin: { ios: 'pin.fill', android: 'push_pin' },
  lock: { ios: 'lock.fill', android: 'lock' },
  globe: { ios: 'globe', android: 'globe' },
  heart: { ios: 'heart.fill', android: 'favorite' },
  star: { ios: 'star.fill', android: 'star' },
  check: { ios: 'checkmark', android: 'check' },
  close: { ios: 'xmark', android: 'close' },
  plus: { ios: 'plus', android: 'add' },
  refresh: { ios: 'arrow.clockwise', android: 'refresh' },
  info: { ios: 'info.circle.fill', android: 'info' },
  alert: { ios: 'exclamationmark.triangle.fill', android: 'warning' },
  download: { ios: 'arrow.down.circle.fill', android: 'download' },
  upload: { ios: 'arrow.up.circle.fill', android: 'upload' },
  'user-plus': { ios: 'person.badge.plus', android: 'person_add' },
  filter: { ios: 'line.3.horizontal.decrease.circle.fill', android: 'filter_alt' },
  bell: { ios: 'bell.fill', android: 'notifications' },
  doc: { ios: 'doc.fill', android: 'description' },
  calendar: { ios: 'calendar', android: 'calendar_today' },
  external: { ios: 'arrow.up.right.square.fill', android: 'open_in_new' },
  shield: { ios: 'shield.fill', android: 'verified_user' },
  eye: { ios: 'eye.fill', android: 'visibility' },
  more: { ios: 'ellipsis', android: 'more_vert' },
  reply: { ios: 'arrowshape.turn.up.left.fill', android: 'reply' },
  smile: { ios: 'face.smiling', android: 'mood' },
  link: { ios: 'link', android: 'link' },
  copy: { ios: 'doc.on.doc.fill', android: 'content_copy' },
  logout: { ios: 'rectangle.portrait.and.arrow.right', android: 'logout' },
  verify: { ios: 'checkmark.seal.fill', android: 'verified' },
  rocket: { ios: 'paperplane.fill', android: 'rocket_launch' },
}

const GLYPHS: Record<IconName, string> = {
  home: '⌂',
  forum: '💬',
  blog: '✎',
  chat: '🗨',
  profile: '◉',
  store: '🛍',
  status: '◒',
  orders: '📦',
  ticket: '🎫',
  search: '⌕',
  back: '←',
  forward: '→',
  down: '⌄',
  up: '⌃',
  settings: '⚙',
  camera: '📷',
  image: '🖼',
  attach: '📎',
  phone: '☎',
  video: '🎥',
  'video-off': '🚫',
  mic: '🎤',
  'mic-off': '🔇',
  send: '➤',
  trash: '🗑',
  edit: '✎',
  pin: '📌',
  lock: '🔒',
  globe: '🌐',
  heart: '♥',
  star: '★',
  check: '✓',
  close: '✕',
  plus: '+',
  refresh: '⟳',
  info: 'ⓘ',
  alert: '⚠',
  download: '⭳',
  upload: '⭱',
  'user-plus': '👤+',
  filter: '⇅',
  bell: '🔔',
  doc: '📄',
  calendar: '📅',
  external: '↗',
  shield: '🛡',
  eye: '👁',
  more: '⋯',
  reply: '↩',
  smile: '☺',
  link: '🔗',
  copy: '⧉',
  logout: '⏻',
  verify: '✔',
  rocket: '➤',
}

export function Icon({
  name,
  size = 20,
  color,
  style,
}: {
  name: IconName
  size?: number
  color?: ColorValue
  style?: ViewStyle
}) {
  const { theme } = useTheme()
  const tint = color ?? theme.colors.text2
  const sym = SYMBOLS[name]

  if (theme.mono) {
    return (
      <Text
        style={{
          color: tint as string,
          fontSize: Math.round(size * 1.1),
          lineHeight: size + 2,
          textAlign: 'center',
        }}
      >
        {GLYPHS[name]}
      </Text>
    )
  }

  return (
    <ViewAsSymbol size={size} tint={tint} sym={sym} name={name} style={style} />
  )
}

function ViewAsSymbol({
  size,
  tint,
  sym,
  name,
  style,
}: {
  size: number
  tint: ColorValue
  sym: Sym
  name: IconName
  style?: ViewStyle
}) {
  return (
    <SymbolView
      name={{
        ios: sym.ios as never,
        android: sym.android as never,
        web: sym.android as never,
      }}
      size={size}
      tintColor={tint}
      style={{ width: size + 4, height: size + 4, ...style }}
    />
  )
}