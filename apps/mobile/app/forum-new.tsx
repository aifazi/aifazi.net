import { useEffect, useState } from 'react'
import { FONT, SPACE } from '@/src/design'
import { View, Text, TouchableOpacity, TextInput, ScrollView, KeyboardAvoidingView, Platform } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Btn, Muted } from '@/src/components/ui'
import { Icon } from '@/src/components/icon'
import { useTheme } from '@/src/theme'
import { useAuth } from '@/src/lib/auth'
import { api } from '@/src/lib/api'

interface Category {
  _id: string
  id: string
  name: string
  description?: string
  icon?: string
  color?: string
  threadCount?: number
}

export default function NewThreadScreen() {
  const router = useRouter()
  const { theme } = useTheme()
  const c = theme.colors
  const { isAuthed } = useAuth()
  const [categories, setCategories] = useState<Category[]>([])
  const [catId, setCatId] = useState('')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    api
      .get('/forum/categories')
      .then((r) => {
        const list = (r.data ?? []) as Category[]
        setCategories(list)
        if (list.length) setCatId(list[0]._id || list[0].id)
      })
      .catch(() => setCategories([]))
  }, [])

  const submit = async () => {
    if (!isAuthed) {
      router.push('/auth/login')
      return
    }
    if (!title.trim() || !content.trim() || !catId) {
      setErr('Title, content and category are required.')
      return
    }
    setSaving(true)
    setErr('')
    try {
      const r = await api.post('/forum/threads', {
        title: title.trim(),
        content: content.trim(),
        category_id: catId,
      })
      const t = r.data ?? {}
      router.replace(`/forum-thread?id=${encodeURIComponent(t.id || t._id)}`)
    } catch (e: any) {
      setErr(e?.response?.data?.detail || e?.message || 'Could not create thread.')
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
        <Text style={{ color: c.text, fontSize: FONT.card, fontWeight: '800', flex: 1 }}>New Thread</Text>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: SPACE.xxxl, paddingBottom: SPACE.colossal }} keyboardShouldPersistTaps="handled">
          <Text style={{ color: c.muted, fontSize: FONT.xs, textTransform: 'uppercase', letterSpacing: 2, marginBottom: SPACE.sm }}>Category</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.md, marginBottom: SPACE.xxxl }}>
            {categories.map((x) => {
              const id = x._id || x.id
              const active = id === catId
              return (
                <TouchableOpacity
                  key={id}
                  onPress={() => setCatId(id)}
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
                    {x.icon ?? ''} {x.name}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>

          <Text style={{ color: c.muted, fontSize: FONT.xs, textTransform: 'uppercase', letterSpacing: 2, marginBottom: SPACE.sm }}>Title</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Thread title…"
            placeholderTextColor={c.muted}
            style={{ backgroundColor: c.bg, borderColor: c.border, color: c.text, borderWidth: 1, borderRadius: theme.mono ? 0 : 8, paddingHorizontal: SPACE.xl, paddingVertical: 11, fontSize: FONT.card, fontFamily: theme.mono ? 'monospace' : undefined, marginBottom: SPACE.xxxl }}
          />

          <Text style={{ color: c.muted, fontSize: FONT.xs, textTransform: 'uppercase', letterSpacing: 2, marginBottom: SPACE.sm }}>Content (markdown supported)</Text>
          <TextInput
            value={content}
            onChangeText={setContent}
            placeholder="What's on your mind?"
            placeholderTextColor={c.muted}
            multiline
            style={{ backgroundColor: c.bg, borderColor: c.border, color: c.text, borderWidth: 1, borderRadius: theme.mono ? 0 : 8, paddingHorizontal: SPACE.xl, paddingVertical: SPACE.lg, minHeight: 160, fontSize: FONT.base, fontFamily: theme.mono ? 'monospace' : undefined, textAlignVertical: 'top' }}
          />

          {err ? <Muted style={{ color: c.danger, marginTop: SPACE.lg }}>{err}</Muted> : null}
          <View style={{ marginTop: SPACE.huge }}>
            <Btn title={saving ? 'Posting…' : 'Post thread'} onPress={submit} disabled={saving} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
