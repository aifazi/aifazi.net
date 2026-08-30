import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react'
import { FONT, SPACE } from '@/src/design'
import { Modal, View, Text, TextInput, TouchableOpacity, FlatList, Pressable, Animated, Easing, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import type { Href } from 'expo-router'
import { useTheme } from '@/src/theme'
import { withAlpha } from '@/src/lib/color'
import { useReducedMotion } from '@/src/lib/motion'
import { Icon } from '@/src/components/icon'
import type { IconName } from '@/src/components/icon'
import { api } from '@/src/lib/api'

interface Command {
  label: string
  hint: string
  icon: IconName
  href: Href
}

interface SearchResult {
  id: string | number
  title: string
  type: 'post' | 'thread' | 'product'
  url: string
  meta?: string
}

const COMMANDS: Command[] = [
  { label: 'Store', hint: 'Browse the shop', icon: 'store', href: '/store' },
  { label: 'Forum', hint: 'Threads & discussions', icon: 'forum', href: '/forum' },
  { label: 'Blog', hint: 'Latest posts', icon: 'blog', href: '/blog' },
  { label: 'Chat', hint: 'Rooms & DMs', icon: 'chat', href: '/chat' },
  { label: 'Profile', hint: 'Account, orders, tickets', icon: 'profile', href: '/profile' },
  { label: 'Projects', hint: 'Our projects', icon: 'rocket', href: '/projects' },
  { label: 'Status', hint: 'Server & service status', icon: 'status', href: '/status' as Href },
  { label: 'Notifications', hint: 'Unread alerts', icon: 'bell', href: '/notifications' as Href },
  { label: 'New Ticket', hint: 'Contact support', icon: 'ticket', href: '/helpdesk-new' as Href },
  { label: 'New Thread', hint: 'Start a forum thread', icon: 'edit', href: '/forum-new' },
  { label: 'Cart', hint: 'Review checkout', icon: 'cart', href: '/store-cart' },
  { label: 'VPN', hint: 'WireGuard VPN management', icon: 'shield', href: '/vpn' as Href },
]

interface CommandPaletteApi {
  open: () => void
  close: () => void
}

const CommandPaletteContext = createContext<CommandPaletteApi>({ open: () => {}, close: () => {} })

export function useCommandPalette() {
  return useContext(CommandPaletteContext)
}

/**
 * Searchable command palette rendered as a modal overlay. Opened from the tab
 * bar (long-press any tab) via useCommandPalette(). Gated on reduced-motion:
 * with it enabled the backdrop/panel don't animate.
 */
export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const { theme } = useTheme()
  const c = theme.colors
  const router = useRouter()
  const reduced = useReducedMotion()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const anim = useRef(new Animated.Value(0)).current
  const inputRef = useRef<TextInput>(null)

  const doOpen = useCallback(() => { setOpen(true); setQuery('') }, [])
  const doClose = useCallback(() => { setOpen(false); setQuery(''); setResults([]) }, [])
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (!query.trim() || query.length < 2) { setResults([]); return }
    searchTimer.current = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await api.get('/search', { params: { q: query.trim(), limit: 5 } })
        const items: SearchResult[] = [
          ...(res.data.posts || []).map((r: any) => ({ ...r, type: 'post' as const, meta: r.category })),
          ...(res.data.threads || []).map((r: any) => ({ ...r, type: 'thread' as const, meta: r.author_name })),
          ...(res.data.products || []).map((r: any) => ({ ...r, type: 'product' as const, meta: r.price ? `$${r.price}` : '' })),
        ]
        setResults(items)
      } catch { setResults([]) }
      finally { setSearching(false) }
    }, 300)
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current) }
  }, [query])

  useEffect(() => {
    if (!open) return
    Animated.timing(anim, { toValue: 1, duration: reduced ? 0 : 180, easing: Easing.out(Easing.ease), useNativeDriver: true }).start()
    const t = setTimeout(() => inputRef.current?.focus(), reduced ? 0 : 80)
    return () => clearTimeout(t)
  }, [open, anim, reduced])

  const select = (cmd: Command) => {
    doClose()
    setTimeout(() => router.push(cmd.href), reduced ? 0 : 30)
  }

  const filtered = query.trim()
    ? COMMANDS.filter((cmd) => `${cmd.label} ${cmd.hint}`.toLowerCase().includes(query.trim().toLowerCase()))
    : COMMANDS

  interface PaletteItem { key: string; label: string; hint: string; icon: IconName; href: Href; section: string }
  const searchItems: PaletteItem[] = results.map(r => ({
    key: `search-${r.id}`, label: r.title, hint: r.meta || '',
    icon: r.type === 'product' ? 'store' : r.type === 'post' ? 'blog' : 'forum',
    href: r.url as Href, section: r.type === 'product' ? '🛒 Products' : r.type === 'post' ? '📝 Blog' : '💬 Forum',
  }))
  const commandItems: PaletteItem[] = filtered.map(c => ({ key: c.href as string, ...c, section: 'Navigate' }))
  const allItems = [...searchItems, ...commandItems]

  return (
    <CommandPaletteContext.Provider value={{ open: doOpen, close: doClose }}>
      {children}
      <Modal visible={open} transparent animationType="none" onRequestClose={doClose}>
        <View style={{ flex: 1, backgroundColor: c.overlay }}>
          <Animated.View style={{ flex: 1, opacity: anim }}>
            <Pressable style={{ flex: 1 }} onPress={doClose} accessibilityLabel="Close command palette" accessibilityRole="button" />
            <View
              style={{
                position: 'absolute',
                top: 90,
                left: 20,
                right: 20,
                backgroundColor: c.bg2,
                borderWidth: 1,
                borderColor: withAlpha(c.accent2, 0.35),
                borderRadius: theme.radius,
                maxHeight: '70%',
                padding: SPACE.xl,
                shadowColor: '#000',
                shadowOpacity: 0.5,
                shadowRadius: 24,
                shadowOffset: { width: 0, height: 12 },
                elevation: 16,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.lg, marginBottom: SPACE.lg }}>
                <Text style={{ fontSize: FONT.card }}>⌘</Text>
                <TextInput
                  ref={inputRef}
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search screens & actions…"
                  placeholderTextColor={c.muted}
                  accessibilityLabel="Search commands"
                  style={{ flex: 1, color: c.text, fontSize: FONT.card, fontFamily: theme.mono ? 'monospace' : undefined }}
                />
                <TouchableOpacity onPress={doClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close command palette">
                  <Text style={{ color: c.muted, fontSize: FONT.md, fontWeight: '700' }}>ESC</Text>
                </TouchableOpacity>
              </View>

              {searching ? <ActivityIndicator size="small" color={c.accent} style={{ marginBottom: SPACE.md }} /> : null}
              <FlatList
                data={allItems}
                keyExtractor={(item) => item.key}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <TouchableOpacity
                    onPress={() => select(item)}
                    accessibilityRole="button"
                    accessibilityLabel={`Go to ${item.label}`}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.xl, paddingVertical: SPACE.lg, paddingHorizontal: SPACE.md, borderRadius: theme.buttonRadius }}
                    activeOpacity={0.6}
                  >
                    <View style={{ width: 22, alignItems: 'center' }}>
                      <Icon name={item.icon} size={FONT.section} color={c.text2} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: c.text, fontSize: FONT.base, fontWeight: '700' }}>{item.label}</Text>
                      <Text style={{ color: c.muted, fontSize: FONT.sm }}>{item.hint || item.section}</Text>
                    </View>
                    <Text style={{ color: c.muted, fontSize: FONT.sm }}>↵</Text>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={<Text style={{ color: c.muted, padding: SPACE.xl }}>No matches.</Text>}
              />
            </View>
          </Animated.View>
        </View>
      </Modal>
    </CommandPaletteContext.Provider>
  )
}
