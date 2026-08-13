import { useEffect, useRef, useState, useCallback } from 'react'
import { FONT, SPACE } from '@/src/design'
import { View, Text, TouchableOpacity, TextInput, ScrollView, KeyboardAvoidingView, Platform, AppState } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Btn, Muted } from '@/src/components/ui'
import { Icon } from '@/src/components/icon'
import { useTheme } from '@/src/theme'
import { useAuth } from '@/src/lib/auth'
import { api } from '@/src/lib/api'
import { Loader } from '@/src/components/Loader'
import { StatusChip } from '@/src/screens/profile/helpers'
import { withAlpha } from '@/src/lib/color'

interface TicketMessage {
  id?: string
  author_type?: string
  author_name?: string
  message?: string
  created_at?: string
}

interface TicketDetail {
  id?: string
  ticket_id?: string
  subject?: string
  status?: string
  priority?: string
  category?: string
  created_at?: string
  updated_at?: string
  messages?: TicketMessage[]
}

const POLL_MS = 10000

function fmtTime(iso?: string) {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    return d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  } catch {
    return ''
  }
}

export default function TicketDetailScreen() {
  const { theme } = useTheme()
  const c = theme.colors
  const router = useRouter()
  const { user } = useAuth()
  const params = useLocalSearchParams<{ id?: string }>()
  const id = params.id || ''

  const [ticket, setTicket] = useState<TicketDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [text, setText] = useState('')
  const [err, setErr] = useState('')
  const scrollRef = useRef<ScrollView>(null)

  const fetchTicket = useCallback(async () => {
    if (!id) return
    try {
      const r = await api.get(`/helpdesk/tickets/${encodeURIComponent(id)}`)
      setTicket(r.data || null)
    } catch {
      setErr('Could not load ticket.')
    }
  }, [id])

  useEffect(() => {
    fetchTicket().finally(() => setLoading(false))
  }, [fetchTicket])

  // Poll for new messages while the screen is focused
  useEffect(() => {
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') fetchTicket()
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [fetchTicket])

  const send = async () => {
    const msg = text.trim()
    if (!msg || sending || !id) return
    setSending(true)
    setErr('')
    const optimistic: TicketMessage = {
      id: `local-${Date.now()}`,
      author_type: 'user',
      author_name: (user as any)?.username || (user as any)?.name || 'You',
      message: msg,
      created_at: new Date().toISOString(),
    }
    setTicket((prev) => prev ? { ...prev, messages: [...(prev.messages || []), optimistic] } : prev)
    setText('')
    try {
      await api.post(`/helpdesk/tickets/${encodeURIComponent(id)}/messages`, {
        message: msg,
        author_type: 'user',
        author_name: (user as any)?.username || (user as any)?.name || 'User',
      })
      await fetchTicket()
    } catch (e: any) {
      setErr(e?.response?.data?.detail || 'Could not send reply.')
      setTicket((prev) => prev ? { ...prev, messages: (prev.messages || []).filter((m) => m.id !== optimistic.id) } : prev)
      setText(msg)
    } finally {
      setSending(false)
    }
  }

  const closed = ticket?.status === 'resolved' || ticket?.status === 'closed'

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Loader />
      </SafeAreaView>
    )
  }

  if (!ticket) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', padding: SPACE.mega }}>
        <Muted>{err || 'Ticket not found.'}</Muted>
        <View style={{ marginTop: SPACE.xxxl, width: 200 }}>
          <Btn title="Go back" variant="ghost" onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top', 'bottom']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.lg, paddingHorizontal: SPACE.xxl, paddingVertical: SPACE.lg, borderBottomWidth: 1, borderBottomColor: c.border }}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back" hitSlop={10}>
          <Icon name="back" size={22} color={c.text} />
        </TouchableOpacity>
        <Text style={{ color: c.text, fontSize: FONT.card, fontWeight: '800', flex: 1 }} numberOfLines={1}>
          #{ticket.ticket_id || (ticket.id || '').slice(-6).toUpperCase()}
        </Text>
        {ticket.status ? <StatusChip text={ticket.status} /> : null}
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{ padding: SPACE.xxxl, paddingBottom: SPACE.giant }}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={{ color: c.text, fontSize: FONT.lead, fontWeight: '900', lineHeight: 25 }}>{ticket.subject}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.lg, marginTop: SPACE.md, marginBottom: SPACE.xxxl }}>
            {ticket.category ? <Muted>{ticket.category.toUpperCase()}</Muted> : null}
            {ticket.priority ? <StatusChip text={ticket.priority} /> : null}
            {ticket.updated_at ? <Muted>Updated {fmtTime(ticket.updated_at)}</Muted> : null}
          </View>

          {(ticket.messages || []).map((m) => {
            const isUser = m.author_type === 'user'
            return (
              <View
                key={m.id || `${m.author_type}-${m.created_at}`}
                style={{
                  alignSelf: isUser ? 'flex-end' : 'flex-start',
                  maxWidth: '85%',
                  marginBottom: SPACE.lg,
                  borderRadius: theme.mono ? 0 : 14,
                  borderWidth: 1,
                  borderColor: isUser ? withAlpha(c.accent2, 0.33) : c.border,
                  backgroundColor: isUser ? withAlpha(c.accent2, 0.13) : c.bg,
                  paddingHorizontal: SPACE.xl,
                  paddingVertical: SPACE.md,
                }}
              >
                <Text style={{ color: isUser ? c.accent2 : c.accent, fontSize: FONT.sm, fontWeight: '700', marginBottom: SPACE.xxs }}>
                  {isUser ? 'You' : (m.author_name || 'Support')}
                </Text>
                <Text style={{ color: c.text, fontSize: FONT.base, lineHeight: 20 }}>{m.message}</Text>
                {m.created_at ? <Text style={{ color: c.muted, fontSize: FONT.xs, marginTop: SPACE.xs, textAlign: 'right' }}>{fmtTime(m.created_at)}</Text> : null}
              </View>
            )
          })}
          {(ticket.messages || []).length === 0 ? <Muted>No messages yet.</Muted> : null}
        </ScrollView>

        {closed ? (
          <View style={{ padding: SPACE.xxl, borderTopWidth: 1, borderTopColor: c.border }}>
            <Muted style={{ textAlign: 'center' }}>This ticket is {ticket.status}. Replies are disabled.</Muted>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: SPACE.md, paddingHorizontal: SPACE.lg, paddingVertical: SPACE.md, borderTopWidth: 1, borderTopColor: c.border }}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Type a reply…"
              placeholderTextColor={c.muted}
              multiline
              style={{ flex: 1, borderRadius: 8, borderWidth: 1, borderColor: c.border, backgroundColor: c.bg, color: c.text, paddingHorizontal: SPACE.xl, paddingVertical: SPACE.md, fontSize: FONT.base, fontFamily: theme.mono ? 'monospace' : undefined, maxHeight: 120 }}
            />
            <TouchableOpacity
              onPress={send}
              disabled={sending || !text.trim()}
              style={{
                paddingHorizontal: SPACE.xxxl,
                paddingVertical: SPACE.lg,
                borderRadius: theme.mono ? 0 : 8,
                backgroundColor: c.accent,
                opacity: sending || !text.trim() ? 0.5 : 1,
              }}
            >
              <Text style={{ color: c.onAccent, fontWeight: '800', fontSize: FONT.body }}>{sending ? '…' : 'Send'}</Text>
            </TouchableOpacity>
          </View>
        )}
        {err ? <Text style={{ color: c.danger, fontSize: FONT.md, textAlign: 'center', paddingBottom: SPACE.md }}>{err}</Text> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
