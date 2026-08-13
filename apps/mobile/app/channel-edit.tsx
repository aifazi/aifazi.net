import { useEffect, useState, useCallback, useRef } from 'react'
import { FONT, SPACE } from '@/src/design'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Card, Muted, Btn, Toggle } from '@/src/components/ui'
import { Icon } from '@/src/components/icon'
import { useTheme } from '@/src/theme'
import { useAuth } from '@/src/lib/auth'
import { api } from '@/src/lib/api'
import { useOverlay } from '@/src/components/overlay'
import { Loader } from '@/src/components/Loader'

const PLATFORM_ROLES = ['member', 'admin', 'moderator', 'editor', 'chat']
const ROOM_PERMS = [
  'read_messages',
  'send_messages',
  'manage_messages',
  'manage_members',
  'manage_roles',
  'voice_speak',
  'voice_screen_share',
]
const TYPES = ['text', 'voice', 'video']
const MODES: { key: string; label: string }[] = [
  { key: 'public', label: 'Public' },
  { key: 'roles', label: 'Roles' },
  { key: 'users', label: 'Users' },
  { key: 'mixed', label: 'Mixed' },
  { key: 'closed', label: 'Closed' },
]

interface CustomRole {
  id: string
  name: string
  color: string
  permissions: string[]
}
interface Member {
  username: string
  role: string
  joined_at?: string | null
}

function toggle<T>(arr: T[], v: T): T[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]
}

export default function ChannelEditScreen() {
  const { room_id } = useLocalSearchParams<{ room_id?: string }>()
  const router = useRouter()
  const { theme } = useTheme()
  const c = theme.colors
  const { user } = useAuth()
  const isStaff = user?.role === 'admin' || user?.role === 'moderator'
  const { alert, confirm, menu } = useOverlay()

  const [loading, setLoading] = useState(!!room_id)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const inviteInputRef = useRef<TextInput>(null)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [emoji, setEmoji] = useState('#')
  const [color, setColor] = useState('#00ff88')
  const [type, setType] = useState('text')
  const [slowMode, setSlowMode] = useState('0')
  const [readOnly, setReadOnly] = useState(false)

  const [mode, setMode] = useState('public')
  const [allowedRoles, setAllowedRoles] = useState<string[]>([])
  const [allowedUsers, setAllowedUsers] = useState<string[]>([])
  const [speakRoles, setSpeakRoles] = useState<string[]>([])
  const [screenShareRoles, setScreenShareRoles] = useState<string[]>([])

  const [roles, setRoles] = useState<CustomRole[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [roleEditor, setRoleEditor] = useState<CustomRole | null>(null)
  const [searchQ, setSearchQ] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [inviteQ, setInviteQ] = useState('')
  const [inviteResults, setInviteResults] = useState<any[]>([])

  const load = useCallback(async () => {
    if (!room_id) return
    try {
      const [roomsR, rolesR, membersR] = await Promise.all([
        api.get('/chat/rooms'),
        api.get(`/chat/rooms/${room_id}/roles`),
        api.get(`/chat/rooms/${room_id}/members`),
      ])
      const room = (roomsR.data ?? []).find((r: any) => r.id === room_id)
      if (room) {
        setName(room.name ?? '')
        setDescription(room.description ?? '')
        setEmoji(room.emoji ?? '#')
        setColor(room.color ?? '#00ff88')
        setType(room.type ?? 'text')
        setSlowMode(String(room.slow_mode ?? 0))
        setReadOnly(!!room.read_only)
        const ar = room.allowed_roles ?? []
        const au = room.allowed_users ?? []
        setAllowedRoles(ar)
        setAllowedUsers(au)
        setSpeakRoles(room.speak_roles ?? (room.type !== 'text' ? ar : []))
        setScreenShareRoles(room.screen_share_roles ?? [])
        setMode(room.is_private && !ar.length && !au.length ? 'closed' : !ar.length && !au.length ? 'public' : ar.length && au.length ? 'mixed' : ar.length ? 'roles' : 'users')
      }
      setRoles((rolesR.data ?? []) as CustomRole[])
      setMembers((membersR.data ?? []) as Member[])
    } catch (e: any) {
      setErr(e?.response?.data?.detail || 'Could not load room')
    } finally {
      setLoading(false)
    }
  }, [room_id])

  useEffect(() => {
    if (room_id) load()
  }, [room_id, load])

  const changeMode = (m: string) => {
    setMode(m)
    if (m === 'public') {
      setAllowedRoles([])
      setAllowedUsers([])
    } else if (m === 'roles') {
      setAllowedUsers([])
    } else if (m === 'users') {
      setAllowedRoles([])
    } else if (m === 'closed') {
      setAllowedRoles([])
      setAllowedUsers([])
    }
  }

  const doSearch = async (q: string, setQ: (v: string) => void, setRes: (r: any[]) => void) => {
    setQ(q)
    if (!q.trim()) {
      setRes([])
      return
    }
    try {
      const r = await api.get('/chat/users/search', { params: { q: q.trim() } })
      setRes(r.data ?? [])
    } catch {
      setRes([])
    }
  }

  const save = async () => {
    if (!name.trim()) {
      setErr('Channel name is required')
      return
    }
    setSaving(true)
    setErr('')
    const body = {
      name: name.trim(),
      description,
      color,
      emoji: emoji || '#',
      is_private: mode === 'closed',
      allowed_users: allowedUsers,
      allowed_roles: allowedRoles,
      speak_roles: type === 'text' ? [] : speakRoles,
      screen_share_roles: type === 'text' ? [] : screenShareRoles,
      type,
      slow_mode: parseInt(slowMode || '0', 10) || 0,
      read_only: readOnly,
    }
    try {
      if (room_id) await api.put(`/chat/rooms/${room_id}`, body)
      else await api.post('/chat/rooms', body)
      await alert({ message: 'Channel updated.' })
      router.back()
    } catch (e: any) {
      setErr(e?.response?.data?.detail || 'Could not save channel')
    } finally {
      setSaving(false)
    }
  }

  const removeRoom = async () => {
    if (!room_id) return
    const ok = await confirm({ title: 'Delete channel', message: `Delete "${name}"? This cannot be undone.`, confirmText: 'Delete', destructive: true })
    if (!ok) return
    try {
      await api.delete(`/chat/rooms/${room_id}`)
      router.back()
    } catch (e: any) {
      setErr(e?.response?.data?.detail || 'Could not delete channel')
    }
  }

  const saveRole = async () => {
    if (!roleEditor || !room_id || !roleEditor.name.trim()) return
    const body = { name: roleEditor.name.trim(), color: roleEditor.color, permissions: roleEditor.permissions }
    try {
      if (!roleEditor.id) await api.post(`/chat/rooms/${room_id}/roles`, body)
      else await api.put(`/chat/rooms/${room_id}/roles/${roleEditor.id}`, body)
      setRoleEditor(null)
      const r = await api.get(`/chat/rooms/${room_id}/roles`)
      setRoles(r.data ?? [])
    } catch (e: any) {
      setErr(e?.response?.data?.detail || 'Could not save role')
    }
  }

  const deleteRole = async (r: CustomRole) => {
    if (!room_id) return
    try {
      await api.delete(`/chat/rooms/${room_id}/roles/${r.id}`)
      setRoles((prev) => prev.filter((x) => x.id !== r.id))
      setRoleEditor(null)
    } catch (e: any) {
      setErr(e?.response?.data?.detail || 'Could not delete role')
    }
  }

  const changeMemberRole = async (m: Member) => {
    if (!room_id) return
    const opts = [...roles.map((r) => r.name), 'member', 'moderator']
    const picked = await menu({
      title: `Role for ${m.username}`,
      options: opts.map((r) => ({ value: r, label: r })),
    })
    if (!picked) return
    try {
      await api.patch(`/chat/rooms/${room_id}/members/${encodeURIComponent(m.username)}/role`, { name: picked })
      setMembers((prev) => prev.map((x) => (x.username === m.username ? { ...x, role: picked } : x)))
    } catch (e: any) {
      setErr(e?.response?.data?.detail || 'Could not change role')
    }
  }

  const removeMember = async (m: Member) => {
    if (!room_id) return
    const ok = await confirm({ title: 'Remove member', message: `Remove ${m.username} from this channel?`, confirmText: 'Remove', destructive: true })
    if (!ok) return
    try {
      await api.post(`/chat/rooms/${room_id}/kick`, { username: m.username })
      setMembers((prev) => prev.filter((x) => x.username !== m.username))
    } catch (e: any) {
      setErr(e?.response?.data?.detail || 'Could not remove member')
    }
  }

  const invite = async (username: string) => {
    if (!room_id) return
    try {
      await api.post(`/chat/rooms/${room_id}/invite`, { username, role: 'member' })
      setInviteQ('')
      setInviteResults([])
      const r = await api.get(`/chat/rooms/${room_id}/members`)
      setMembers(r.data ?? [])
    } catch (e: any) {
      setErr(e?.response?.data?.detail || 'Could not invite user')
    }
  }

  if (!isStaff) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top', 'bottom']}>
        <Muted style={{ textAlign: 'center', marginTop: SPACE.colossal }}>Staff only.</Muted>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top', 'bottom']}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: SPACE.lg,
          paddingHorizontal: SPACE.xl,
          paddingVertical: SPACE.lg,
          borderBottomWidth: 1,
          borderBottomColor: c.border,
        }}
      >
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back" hitSlop={10}>
          <Icon name="back" size={22} color={c.text} />
        </TouchableOpacity>
        <Text style={{ color: c.text, fontSize: FONT.card, fontWeight: '800', flex: 1 }}>
          {room_id ? 'Edit channel' : 'New channel'}
        </Text>
        <Btn title="Save" onPress={save} disabled={saving} style={{ paddingVertical: 7, paddingHorizontal: SPACE.xxl }} />
      </View>

      {loading ? (
        <Loader />
      ) : (
        <ScrollView contentContainerStyle={{ padding: SPACE.xl, paddingBottom: 60 }}>
          {err ? <Muted style={{ marginBottom: SPACE.lg }}>{err}</Muted> : null}

          <Card title="Details">
            <View style={{ gap: SPACE.md }}>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Channel name"
                placeholderTextColor={c.muted}
                style={{ backgroundColor: c.bg2, color: c.text, borderColor: c.border, borderWidth: 1, borderRadius: 8, padding: SPACE.lg }}
              />
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="Description"
                placeholderTextColor={c.muted}
                style={{ backgroundColor: c.bg2, color: c.text, borderColor: c.border, borderWidth: 1, borderRadius: 8, padding: SPACE.lg }}
              />
              <View style={{ flexDirection: 'row', gap: SPACE.md }}>
                <TextInput
                  value={emoji}
                  onChangeText={setEmoji}
                  placeholder="👑"
                  placeholderTextColor={c.muted}
                  style={{ backgroundColor: c.bg2, color: c.text, borderColor: c.border, borderWidth: 1, borderRadius: 8, padding: SPACE.lg, width: 70, textAlign: 'center' }}
                />
                <TextInput
                  value={color}
                  onChangeText={setColor}
                  placeholder="#00ff88"
                  placeholderTextColor={c.muted}
                  style={{ backgroundColor: c.bg2, color: c.text, borderColor: c.border, borderWidth: 1, borderRadius: 8, padding: SPACE.lg, flex: 1 }}
                />
              </View>
              <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
                {TYPES.map((t) => (
                  <TouchableOpacity
                    key={t}
                    onPress={() => setType(t)}
                    style={{
                      flex: 1,
                      paddingVertical: SPACE.md,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: type === t ? c.accent : c.border,
                      backgroundColor: type === t ? c.accent2 : 'transparent',
                      alignItems: 'center',
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
                      <Icon
                        name={t === 'text' ? 'chat' : t === 'voice' ? 'mic' : 'video'}
                        size={FONT.body}
                        color={type === t ? c.onAccent : c.text}
                      />
                      <Text style={{ color: type === t ? c.onAccent : c.text, fontWeight: '700', fontSize: FONT.body }}>
                        {t === 'text' ? 'Text' : t === 'voice' ? 'Voice' : 'Video'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md }}>
                <Text style={{ color: c.text, width: 100, fontSize: FONT.body }}>Slow mode (s)</Text>
                <TextInput
                  value={slowMode}
                  onChangeText={setSlowMode}
                  keyboardType="number-pad"
                  placeholderTextColor={c.muted}
                  style={{ backgroundColor: c.bg2, color: c.text, borderColor: c.border, borderWidth: 1, borderRadius: 8, padding: SPACE.md, flex: 1 }}
                />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ color: c.text, fontSize: FONT.body }}>Read-only (staff + privileged can post)</Text>
                <Toggle value={readOnly} onValueChange={setReadOnly} />
              </View>
            </View>
          </Card>

          <Card title="Who can access" subtitle="Roles and/or users can open this channel">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm, marginBottom: SPACE.lg }}>
              {MODES.map((m) => (
                <TouchableOpacity
                  key={m.key}
                  onPress={() => changeMode(m.key)}
                  style={{
                    paddingVertical: 7,
                    paddingHorizontal: SPACE.xl,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: mode === m.key ? c.accent : c.border,
                    backgroundColor: mode === m.key ? c.accent2 : 'transparent',
                  }}
                >
                  <Text style={{ color: mode === m.key ? c.onAccent : c.text, fontWeight: '700', fontSize: FONT.md }}>{m.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {(mode === 'roles' || mode === 'mixed') && (
              <View style={{ marginBottom: SPACE.lg }}>
                <Muted style={{ marginBottom: SPACE.sm }}>Platform roles allowed</Muted>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm }}>
                  {PLATFORM_ROLES.map((r) => {
                    const on = allowedRoles.includes(r)
                    return (
                      <TouchableOpacity
                        key={r}
                        onPress={() => setAllowedRoles((prev) => toggle(prev, r))}
                        style={{
                          paddingVertical: SPACE.sm,
                          paddingHorizontal: SPACE.lg,
                          borderRadius: 14,
                          borderWidth: 1,
                          borderColor: on ? c.accent : c.border,
                          backgroundColor: on ? c.accent2 : 'transparent',
                        }}
                      >
                        <Text style={{ color: on ? c.onAccent : c.text, fontWeight: '700', fontSize: FONT.md }}>{r}</Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>
              </View>
            )}

            {(mode === 'users' || mode === 'mixed') && (
              <View style={{ marginBottom: SPACE.lg }}>
                <Muted style={{ marginBottom: SPACE.sm }}>Allowed users</Muted>
                <TextInput
                  value={searchQ}
                  onChangeText={(q) => doSearch(q, setSearchQ, setSearchResults)}
                  placeholder="Search users…"
                  placeholderTextColor={c.muted}
                  style={{ backgroundColor: c.bg2, color: c.text, borderColor: c.border, borderWidth: 1, borderRadius: 8, padding: SPACE.lg, marginBottom: SPACE.md }}
                />
                {searchResults.map((u) => (
                  <TouchableOpacity
                    key={u.username}
                    onPress={() => {
                      setAllowedUsers((prev) => (prev.includes(u.username) ? prev : [...prev, u.username]))
                      setSearchResults([])
                      setSearchQ('')
                    }}
                    style={{ paddingVertical: SPACE.sm }}
                  >
                    <Text style={{ color: c.text, fontSize: FONT.body }}>
                      {u.username}
                      {u.role ? <Text style={{ color: c.muted }}> · {u.role}</Text> : null} ＋
                    </Text>
                  </TouchableOpacity>
                ))}
                {allowedUsers.length > 0 && (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm }}>
                    {allowedUsers.map((u) => (
                      <TouchableOpacity
                        key={u}
                        onPress={() => setAllowedUsers((prev) => prev.filter((x) => x !== u))}
                        style={{ paddingVertical: SPACE.sm, paddingHorizontal: SPACE.lg, borderRadius: 14, borderWidth: 1, borderColor: c.border, backgroundColor: c.bg2 }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
                          <Icon name="close" size={FONT.md} color={c.text} />
                          <Text style={{ color: c.text, fontWeight: '700', fontSize: FONT.md }}>{u}</Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            )}

            {type !== 'text' && (
              <View style={{ marginBottom: SPACE.sm }}>
                <Muted style={{ marginBottom: SPACE.sm }}>Speak permissions (leave empty = same as access)</Muted>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm }}>
                  {PLATFORM_ROLES.map((r) => {
                    const on = speakRoles.includes(r)
                    return (
                      <TouchableOpacity
                        key={r}
                        onPress={() => setSpeakRoles((prev) => toggle(prev, r))}
                        style={{
                          paddingVertical: SPACE.sm,
                          paddingHorizontal: SPACE.lg,
                          borderRadius: 14,
                          borderWidth: 1,
                          borderColor: on ? c.accent : c.border,
                          backgroundColor: on ? c.accent2 : 'transparent',
                        }}
                      >
                        <Text style={{ color: on ? c.onAccent : c.text, fontWeight: '700', fontSize: FONT.md }}>{r}</Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>
              </View>
            )}
          </Card>

          {room_id ? (
            <>
              <Card
                title="Custom roles"
                subtitle="Permissions that can be assigned to members"
                headerRight={
                  <Btn
                    title="+ Role"
                    onPress={() => setRoleEditor({ id: '', name: '', color: '#00ff88', permissions: [] })}
                    style={{ paddingVertical: SPACE.sm, paddingHorizontal: SPACE.lg }}
                  />
                }
              >
                {roles.map((r) => (
                  <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md, paddingVertical: SPACE.sm }}>
                    <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: r.color }} />
                    <TouchableOpacity onPress={() => setRoleEditor(r)} style={{ flex: 1 }}>
                      <Text style={{ color: c.text, fontSize: FONT.body }}>{r.name}</Text>
                    </TouchableOpacity>
                    <Text style={{ color: c.muted, fontSize: FONT.sm }}>{(r.permissions ?? []).length} perms</Text>
                    <TouchableOpacity onPress={() => deleteRole(r)} hitSlop={8}>
                      <Text style={{ color: c.danger, fontSize: FONT.md }}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                ))}
                {roles.length === 0 ? <Muted>No custom roles yet.</Muted> : null}
              </Card>

              {roleEditor ? (
                <Card title={roleEditor.id === '' ? 'New role' : `Edit ${roleEditor.name}`}>
                  <View style={{ gap: SPACE.md }}>
                    <TextInput
                      value={roleEditor.name}
                      onChangeText={(v) => setRoleEditor((p) => (p ? { ...p, name: v } : p))}
                      placeholder="Role name"
                      placeholderTextColor={c.muted}
                      style={{ backgroundColor: c.bg2, color: c.text, borderColor: c.border, borderWidth: 1, borderRadius: 8, padding: SPACE.lg }}
                    />
                    <TextInput
                      value={roleEditor.color}
                      onChangeText={(v) => setRoleEditor((p) => (p ? { ...p, color: v } : p))}
                      placeholder="#00ff88"
                      placeholderTextColor={c.muted}
                      style={{ backgroundColor: c.bg2, color: c.text, borderColor: c.border, borderWidth: 1, borderRadius: 8, padding: SPACE.lg }}
                    />
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm }}>
                      {ROOM_PERMS.map((p) => {
                        const on = (roleEditor.permissions ?? []).includes(p)
                        return (
                          <TouchableOpacity
                            key={p}
                            onPress={() =>
                              setRoleEditor((prev) => {
                                if (!prev) return prev
                                const perms = prev.permissions ?? []
                                return { ...prev, permissions: perms.includes(p) ? perms.filter((x) => x !== p) : [...perms, p] }
                              })
                            }
                            style={{
                              paddingVertical: 5,
                              paddingHorizontal: SPACE.md,
                              borderRadius: 12,
                              borderWidth: 1,
                              borderColor: on ? c.accent : c.border,
                              backgroundColor: on ? c.accent2 : 'transparent',
                            }}
                          >
                            <Text style={{ color: on ? c.onAccent : c.text, fontWeight: '700', fontSize: FONT.sm }}>{p}</Text>
                          </TouchableOpacity>
                        )
                      })}
                    </View>
                    <View style={{ flexDirection: 'row', gap: SPACE.md }}>
                      <Btn title="Save role" onPress={saveRole} style={{ flex: 1 }} />
                      <Btn title="Cancel" onPress={() => setRoleEditor(null)} style={{ flex: 1, backgroundColor: c.border }} />
                    </View>
                  </View>
                </Card>
              ) : null}

              <Card
                title="Members"
                subtitle={`${members.length} total`}
                headerRight={
                  <Btn title="Invite" onPress={() => inviteInputRef.current?.focus()} style={{ paddingVertical: SPACE.sm, paddingHorizontal: SPACE.lg }} />
                }
              >
                <TextInput
                  ref={inviteInputRef}
                  value={inviteQ}
                  onChangeText={(q) => doSearch(q, setInviteQ, setInviteResults)}
                  placeholder="Search users to invite…"
                  placeholderTextColor={c.muted}
                  style={{ backgroundColor: c.bg2, color: c.text, borderColor: c.border, borderWidth: 1, borderRadius: 8, padding: SPACE.lg, marginBottom: SPACE.md }}
                />
                {inviteResults.map((u) => (
                  <TouchableOpacity key={u.username} onPress={() => invite(u.username)} style={{ paddingVertical: SPACE.sm }}>
                    <Text style={{ color: c.text, fontSize: FONT.body }}>
                      {u.username}
                      {u.role ? <Text style={{ color: c.muted }}> · {u.role}</Text> : null} ＋
                    </Text>
                  </TouchableOpacity>
                ))}
                {members.map((m) => (
                  <View key={m.username} style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md, paddingVertical: SPACE.sm, borderBottomWidth: 1, borderBottomColor: c.border }}>
                    <Text style={{ color: c.text, fontSize: FONT.body, flex: 1 }} numberOfLines={1}>{m.username}</Text>
                    <TouchableOpacity onPress={() => changeMemberRole(m)} hitSlop={8}>
                      <Text style={{ color: c.accent, fontWeight: '700', fontSize: FONT.md }}>{m.role || 'member'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => removeMember(m)} hitSlop={8}>
                      <Text style={{ color: c.danger, fontSize: FONT.md }}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                ))}
                {members.length === 0 ? <Muted>No members yet.</Muted> : null}
              </Card>

              <TouchableOpacity onPress={removeRoom} style={{ marginTop: SPACE.xxxl, alignItems: 'center' }}>
                <Text style={{ color: c.danger, fontWeight: '700' }}>Delete channel</Text>
              </TouchableOpacity>
            </>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  )
}
