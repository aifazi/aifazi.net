import { useState } from 'react'
import { FONT, SPACE } from '@/src/design'
import { View, Text, TouchableOpacity, TextInput, ScrollView, KeyboardAvoidingView, Platform } from 'react-native'
import { useRouter } from 'expo-router'
import type { Href } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Btn, Muted } from '@/src/components/ui'
import { Icon } from '@/src/components/icon'
import { useTheme } from '@/src/theme'
import { useAuth } from '@/src/lib/auth'
import { api } from '@/src/lib/api'

const CATEGORIES = ['general', 'billing', 'technical', 'account', 'bug', 'feature']
const PRIORITIES = ['low', 'medium', 'high', 'critical']

export default function NewTicketScreen() {
  const { theme } = useTheme()
  const c = theme.colors
  const router = useRouter()
  const { user } = useAuth()

  const [subject, setSubject] = useState('')
  const [category, setCategory] = useState('general')
  const [priority, setPriority] = useState('medium')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const canSubmit = subject.trim().length > 2 && description.trim().length > 4 && !saving

  const submit = async () => {
    if (!canSubmit) return
    setSaving(true)
    setErr('')
    try {
      const r = await api.post('/helpdesk/tickets', {
        name: (user as any)?.username || (user as any)?.name || '',
        email: (user as any)?.email || '',
        subject: subject.trim(),
        category,
        priority,
        description: description.trim(),
      })
      const ticketId = r.data?.id || r.data?.ticket_id
      if (ticketId) {
        router.replace(`/helpdesk-detail?id=${encodeURIComponent(ticketId)}` as Href)
      } else {
        router.back()
      }
    } catch (e: any) {
      setErr(e?.response?.data?.detail || 'Could not submit ticket. Try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top', 'bottom']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.lg, paddingHorizontal: SPACE.xxl, paddingVertical: SPACE.lg, borderBottomWidth: 1, borderBottomColor: c.border }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <Icon name="back" size={22} color={c.text} />
        </TouchableOpacity>
        <Text style={{ color: c.text, fontSize: FONT.card, fontWeight: '800', flex: 1 }}>New Ticket</Text>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: SPACE.xxxl, paddingBottom: SPACE.colossal }} keyboardShouldPersistTaps="handled">
          <Text style={{ color: c.muted, fontSize: FONT.xs, textTransform: 'uppercase', letterSpacing: 2, marginBottom: SPACE.sm }}>Subject</Text>
          <TextInput
            value={subject}
            onChangeText={setSubject}
            placeholder="Brief description of the issue"
            placeholderTextColor={c.muted}
            style={{ backgroundColor: c.bg, borderColor: c.border, color: c.text, borderWidth: 1, borderRadius: theme.mono ? 0 : 8, paddingHorizontal: SPACE.xl, paddingVertical: 11, fontSize: FONT.card, fontFamily: theme.mono ? 'monospace' : undefined, marginBottom: SPACE.xxxl }}
          />

          <Text style={{ color: c.muted, fontSize: FONT.xs, textTransform: 'uppercase', letterSpacing: 2, marginBottom: SPACE.sm }}>Category</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.md, marginBottom: SPACE.xxxl }}>
            {CATEGORIES.map((x) => {
              const active = category === x
              return (
                <TouchableOpacity
                  key={x}
                  onPress={() => setCategory(x)}
                  style={{
                    paddingHorizontal: SPACE.xl,
                    paddingVertical: 7,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: active ? c.accent : c.border,
                    backgroundColor: active ? c.accent2 : 'transparent',
                  }}
                >
                  <Text style={{ color: active ? c.onAccent : c.text, fontSize: FONT.md, fontWeight: '700' }}>
                    {x.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>

          <Text style={{ color: c.muted, fontSize: FONT.xs, textTransform: 'uppercase', letterSpacing: 2, marginBottom: SPACE.sm }}>Priority</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.md, marginBottom: SPACE.xxxl }}>
            {PRIORITIES.map((x) => {
              const active = priority === x
              return (
                <TouchableOpacity
                  key={x}
                  onPress={() => setPriority(x)}
                  style={{
                    paddingHorizontal: SPACE.xl,
                    paddingVertical: 7,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: active ? c.accent : c.border,
                    backgroundColor: active ? c.accent2 : 'transparent',
                  }}
                >
                  <Text style={{ color: active ? c.onAccent : c.text, fontSize: FONT.md, fontWeight: '700' }}>
                    {x.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>

          <Text style={{ color: c.muted, fontSize: FONT.xs, textTransform: 'uppercase', letterSpacing: 2, marginBottom: SPACE.sm }}>Description</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="What happened? What have you tried?"
            placeholderTextColor={c.muted}
            multiline
            style={{ backgroundColor: c.bg, borderColor: c.border, color: c.text, borderWidth: 1, borderRadius: theme.mono ? 0 : 8, paddingHorizontal: SPACE.xl, paddingVertical: SPACE.lg, minHeight: 140, fontSize: FONT.base, fontFamily: theme.mono ? 'monospace' : undefined, textAlignVertical: 'top' }}
          />

          {err ? <Muted style={{ color: c.danger, marginTop: SPACE.lg }}>{err}</Muted> : null}
          <View style={{ marginTop: SPACE.huge }}>
            <Btn title={saving ? 'Submitting…' : 'Submit Ticket'} onPress={submit} disabled={!canSubmit} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
