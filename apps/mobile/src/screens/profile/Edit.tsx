import { useState } from 'react'
import { View, Text, TextInput, ScrollView } from 'react-native'
import { Card, Muted, Btn, Field } from '@/src/components/ui'
import { Avatar, BUILTIN_AVATARS, BUILTIN_AVATAR_ICONS } from '@/src/components/Avatar'
import { useTheme } from '@/src/theme'
import { useAuth } from '@/src/lib/auth'
import { useOverlay } from '@/src/components/overlay'
import { askImageSourceAsync, type PickedFile } from '@/src/lib/media'

export function EditTab() {
  const { theme } = useTheme()
  const c = theme.colors
  const { user, updateProfile, refresh, uploadAvatar } = useAuth()
  const overlay = useOverlay()
  const [username, setUsername] = useState(user?.username ?? '')
  const [bio, setBio] = useState(user?.bio ?? '')
  const [avatar, setAvatar] = useState(user?.avatar ?? '')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  const save = async () => {
    setSaving(true); setSaveMsg('')
    try {
      await updateProfile({ username: username.trim(), bio: bio.trim(), avatar: avatar.trim() })
      await refresh()
      setSaveMsg('Profile saved.')
    } catch (e: any) {
      setSaveMsg(e?.response?.data?.detail || 'Could not save profile.')
    } finally { setSaving(false) }
  }

  const pickAvatar = async () => {
    const picked = await overlay.menu({
      title: 'Avatar source',
      options: [
        { value: 'upload', label: 'Upload a photo', icon: '📷' },
        { value: 'builtin', label: 'Choose a built-in icon', icon: '🎨' },
      ],
    })
    if (picked === 'upload') {
      const f = await askImageSourceAsync(overlay)
      if (f) uploadAvatarPhoto(f)
    } else if (picked === 'builtin') {
      chooseBuiltinAvatar()
    }
  }

  const chooseBuiltinAvatar = async () => {
    const picked = await overlay.menu({
      title: 'Built-in avatar icons',
      options: BUILTIN_AVATARS.map((a) => ({
        value: a.key,
        label: a.icon + '  ' + a.label,
        icon: a.icon,
      })),
    })
    if (picked && BUILTIN_AVATAR_ICONS[picked]) {
      setAvatar(`avatar:${picked}`)
      setSaveMsg('Icon selected. Save changes to keep it.')
    }
  }

  const uploadAvatarPhoto = async (file: PickedFile) => {
    setUploading(true); setSaveMsg('')
    try {
      const url = await uploadAvatar({
        uri: file.uri,
        name: file.name || 'avatar.jpg',
        type: file.mimeType || 'image/jpeg',
      })
      setAvatar(url)
      setSaveMsg('Avatar uploaded. Save changes to keep it.')
    } catch (e: any) {
      setSaveMsg(e?.response?.data?.detail || 'Avatar upload failed.')
    } finally { setUploading(false) }
  }

  return (
    <ScrollView keyboardShouldPersistTaps="handled">
      <Card title="Edit Profile">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 14 }}>
          <Avatar name={username} avatar={avatar} size={56} />
          <View style={{ flex: 1, gap: 8 }}>
            <Btn title={uploading ? 'Uploading…' : '📷 Set avatar'} variant="ghost" onPress={pickAvatar} disabled={uploading} />
            {avatar?.startsWith('avatar:') ? (
              <Btn title="✕ Remove built-in icon" variant="ghost" onPress={() => { setAvatar(''); setSaveMsg('Icon cleared. Save changes to keep it.') }} />
            ) : null}
          </View>
        </View>

        <Field label="Username" value={username} onChangeText={setUsername} autoCapitalize="none" />
        <Field label="Avatar URL" value={avatar} onChangeText={setAvatar} placeholder="https://…" autoCapitalize="none" />
        <Text style={{ color: c.muted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Bio</Text>
        <TextInput
          value={bio}
          onChangeText={setBio}
          placeholder="Tell people about yourself…"
          placeholderTextColor={c.muted}
          multiline
          maxLength={1000}
          style={{ backgroundColor: c.bg, borderColor: c.border, color: c.text, borderWidth: 1, borderRadius: theme.mono ? 0 : 8, paddingHorizontal: 12, paddingVertical: 9, minHeight: 80, fontSize: 14, fontFamily: theme.mono ? 'monospace' : undefined }}
        />

        {saveMsg ? <Muted style={{ marginTop: 10 }}>{saveMsg}</Muted> : null}
        <View style={{ marginTop: 12 }}>
          <Btn title={saving ? 'Saving…' : 'Save'} onPress={save} disabled={saving || !username.trim()} />
        </View>
      </Card>
    </ScrollView>
  )
}