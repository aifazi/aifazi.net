import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react'
import { Modal, View, Text, TextInput, TouchableOpacity, FlatList, Pressable, Animated, Easing } from 'react-native'
import { useRouter } from 'expo-router'
import type { Href } from 'expo-router'
import { useTheme } from '@/src/theme'
import { withAlpha } from '@/src/lib/color'
import { useReducedMotion } from '@/src/lib/motion'

interface Command {
  label: string
  hint: string
  icon: string
  href: Href
}

const COMMANDS: Command[] = [
  { label: 'Store', hint: 'Browse the shop', icon: '🛍️', href: '/store' },
  { label: 'Forum', hint: 'Threads & discussions', icon: '💬', href: '/forum' },
  { label: 'Blog', hint: 'Latest posts', icon: '📝', href: '/blog' },
  { label: 'Chat', hint: 'Rooms & DMs', icon: '💬', href: '/chat' },
  { label: 'Profile', hint: 'Account, orders, tickets', icon: '👤', href: '/profile' },
  { label: 'Projects', hint: 'Our projects', icon: '🚀', href: '/projects' },
  { label: 'Status', hint: 'Server & service status', icon: '🟢', href: '/status' as Href },
  { label: 'Notifications', hint: 'Unread alerts', icon: '🔔', href: '/notifications' as Href },
  { label: 'New Ticket', hint: 'Contact support', icon: '🎫', href: '/helpdesk-new' as Href },
  { label: 'New Thread', hint: 'Start a forum thread', icon: '✨', href: '/forum-new' },
  { label: 'Cart', hint: 'Review checkout', icon: '🛒', href: '/store-cart' },
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
  const doClose = useCallback(() => { setOpen(false); setQuery('') }, [])

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

  return (
    <CommandPaletteContext.Provider value={{ open: doOpen, close: doClose }}>
      {children}
      <Modal visible={open} transparent animationType="none" onRequestClose={doClose}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }}>
          <Animated.View style={{ flex: 1, opacity: anim }}>
            <Pressable style={{ flex: 1 }} onPress={doClose} />
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
                padding: 12,
                shadowColor: '#000',
                shadowOpacity: 0.5,
                shadowRadius: 24,
                shadowOffset: { width: 0, height: 12 },
                elevation: 16,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <Text style={{ fontSize: 15 }}>⌘</Text>
                <TextInput
                  ref={inputRef}
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search screens & actions…"
                  placeholderTextColor={c.muted}
                  style={{ flex: 1, color: c.text, fontSize: 15, fontFamily: theme.mono ? 'monospace' : undefined }}
                />
                <TouchableOpacity onPress={doClose} hitSlop={8}>
                  <Text style={{ color: c.muted, fontSize: 12, fontWeight: '700' }}>ESC</Text>
                </TouchableOpacity>
              </View>

              <FlatList
                data={filtered}
                keyExtractor={(cmd) => cmd.href as string}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <TouchableOpacity
                    onPress={() => select(item)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 8 }}
                    activeOpacity={0.6}
                  >
                    <Text style={{ fontSize: 16, width: 22, textAlign: 'center' }}>{item.icon}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: c.text, fontSize: 14, fontWeight: '700' }}>{item.label}</Text>
                      <Text style={{ color: c.muted, fontSize: 11 }}>{item.hint}</Text>
                    </View>
                    <Text style={{ color: c.muted, fontSize: 11 }}>↵</Text>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={<Text style={{ color: c.muted, padding: 12 }}>No matches.</Text>}
              />
            </View>
          </Animated.View>
        </View>
      </Modal>
    </CommandPaletteContext.Provider>
  )
}
