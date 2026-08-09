import { useState } from 'react'
import { View, Text, TouchableOpacity, TextInput, ScrollView, KeyboardAvoidingView, Platform } from 'react-native'
import { useRouter } from 'expo-router'
import type { Href } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Btn, Muted } from '@/src/components/ui'
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
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <Text style={{ color: c.text, fontSize: 18 }}>←</Text>
        </TouchableOpacity>
        <Text style={{ color: c.text, fontSize: 15, fontWeight: '800', flex: 1 }}>New Ticket</Text>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <Text style={{ color: c.muted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 6 }}>Subject</Text>
          <TextInput
            value={subject}
            onChangeText={setSubject}
            placeholder="Brief description of the issue"
            placeholderTextColor={c.muted}
            style={{ backgroundColor: c.bg, borderColor: c.border, color: c.text, borderWidth: 1, borderRadius: theme.mono ? 0 : 8, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15, fontFamily: theme.mono ? 'monospace' : undefined, marginBottom: 16 }}
          />

          <Text style={{ color: c.muted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 6 }}>Category</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            {CATEGORIES.map((x) => {
              const active = category === x
              return (
                <TouchableOpacity
                  key={x}
                  onPress={() => setCategory(x)}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: active ? c.accent : c.border,
                    backgroundColor: active ? c.accent2 : 'transparent',
                  }}
                >
                  <Text style={{ color: active ? c.onAccent : c.text, fontSize: 12, fontWeight: '700' }}>
                    {x.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>

          <Text style={{ color: c.muted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 6 }}>Priority</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            {PRIORITIES.map((x) => {
              const active = priority === x
              return (
                <TouchableOpacity
                  key={x}
                  onPress={() => setPriority(x)}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: active ? c.accent : c.border,
                    backgroundColor: active ? c.accent2 : 'transparent',
                  }}
                >
                  <Text style={{ color: active ? c.onAccent : c.text, fontSize: 12, fontWeight: '700' }}>
                    {x.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>

          <Text style={{ color: c.muted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 6 }}>Description</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="What happened? What have you tried?"
            placeholderTextColor={c.muted}
            multiline
            style={{ backgroundColor: c.bg, borderColor: c.border, color: c.text, borderWidth: 1, borderRadius: theme.mono ? 0 : 8, paddingHorizontal: 12, paddingVertical: 10, minHeight: 140, fontSize: 14, fontFamily: theme.mono ? 'monospace' : undefined, textAlignVertical: 'top' }}
          />

          {err ? <Muted style={{ color: c.danger, marginTop: 10 }}>{err}</Muted> : null}
          <View style={{ marginTop: 18 }}>
            <Btn title={saving ? 'Submitting…' : 'Submit Ticket'} onPress={submit} disabled={!canSubmit} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
