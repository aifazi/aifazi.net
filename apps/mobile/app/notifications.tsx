import { useState, useCallback } from 'react'
import { View, Text, TouchableOpacity, FlatList, RefreshControl, Linking } from 'react-native'
import { useRouter, useFocusEffect } from 'expo-router'
import type { Href } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Btn, Muted } from '@/src/components/ui'
import { useTheme } from '@/src/theme'
import { useAuth } from '@/src/lib/auth'
import { api } from '@/src/lib/api'
import { Loader } from '@/src/components/Loader'
import { fmtWhen } from '@/src/screens/profile/helpers'

interface Notification {
  _id?: string
  id?: string
  type?: string
  message?: string
  link?: string
  read?: boolean
  created_at?: string
}

const TYPE_ICON: Record<string, string> = {
  reply: '💬',
  like: '❤️',
  mention: '@',
  pm: '✉️',
  system: '🔔',
}

export default function NotificationsScreen() {
  const { theme } = useTheme()
  const c = theme.colors
  const router = useRouter()
  const { isAuthed } = useAuth()
  const [notifs, setNotifs] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [err, setErr] = useState('')

  const load = useCallback(() => {
    api
      .get('/forum/notifications')
      .then((r) => setNotifs(Array.isArray(r.data) ? r.data : []))
      .catch((e) => setErr(e?.response?.data?.detail || 'Could not load notifications'))
      .finally(() => { setLoading(false); setRefreshing(false) })
  }, [])

  useFocusEffect(
    useCallback(() => {
      if (!isAuthed) { setLoading(false); return }
      load()
    }, [isAuthed, load]),
  )

  const open = async (n: Notification) => {
    const id = n.id || n._id
    if (id && !n.read) {
      try { await api.patch(`/forum/notifications/${id}/read`) } catch { /* non-fatal */ }
      setNotifs((prev) => prev.map((x) => ((x.id || x._id) === id ? { ...x, read: true } : x)))
    }
    if (n.link) {
      if (n.link.startsWith('http')) Linking.openURL(n.link).catch(() => {})
      else router.push(n.link as Href)
    }
  }

  const markAllRead = async () => {
    try {
      await api.post('/forum/notifications/read-all')
      setNotifs((prev) => prev.map((n) => ({ ...n, read: true })))
    } catch { /* non-fatal */ }
  }

  const remove = async (n: Notification) => {
    const id = n.id || n._id
    if (!id) return
    try {
      await api.delete(`/forum/notifications/${id}`)
      setNotifs((prev) => prev.filter((x) => (x.id || x._id) !== id))
    } catch { /* non-fatal */ }
  }

  const unread = notifs.filter((n) => !n.read).length

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top', 'bottom']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <Text style={{ color: c.text, fontSize: 18 }}>←</Text>
        </TouchableOpacity>
        <Text style={{ color: c.text, fontSize: 15, fontWeight: '800', flex: 1 }}>Notifications{unread > 0 ? ` (${unread})` : ''}</Text>
        {unread > 0 ? (
          <TouchableOpacity onPress={markAllRead} hitSlop={10}>
            <Text style={{ color: c.accent2, fontSize: 12, fontWeight: '700' }}>Mark all read</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {!isAuthed ? (
        <View style={{ padding: 30, alignItems: 'center', gap: 14 }}>
          <Text style={{ fontSize: 40 }}>🔔</Text>
          <Muted>Sign in on the Profile tab to see notifications.</Muted>
          <Btn title="Go to Profile" onPress={() => router.push('/profile' as Href)} />
        </View>
      ) : loading ? (
        <View style={{ paddingTop: 40, alignItems: 'center' }}>
          <Loader />
        </View>
      ) : (
        <FlatList
          data={notifs}
          keyExtractor={(n) => n.id || n._id || `${n.created_at}-${n.message}`}
          contentContainerStyle={{ padding: 14, paddingBottom: 30 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor={c.accent} colors={[c.accent]} progressBackgroundColor={c.bg2} />
          }
          ListEmptyComponent={
            <View style={{ padding: 30, alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 36 }}>🔕</Text>
              <Muted>No notifications yet.</Muted>
              {err ? <Muted style={{ color: c.danger }}>{err}</Muted> : null}
            </View>
          }
          renderItem={({ item }) => {
            const icon = TYPE_ICON[item.type || ''] ?? '🔔'
            return (
              <TouchableOpacity onPress={() => open(item)} onLongPress={() => remove(item)} activeOpacity={0.7}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    padding: 12,
                    marginBottom: 8,
                    borderRadius: theme.mono ? 0 : 10,
                    borderWidth: 1,
                    borderColor: item.read ? c.border : c.accent + '55',
                    backgroundColor: item.read ? c.bg2 : c.accent + '0f',
                  }}
                >
                  <Text style={{ fontSize: 18 }}>{icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: c.text, fontSize: 13, lineHeight: 18 }}>{item.message}</Text>
                    {item.created_at ? <Muted style={{ fontSize: 10, marginTop: 3 }}>{fmtWhen(item.created_at)}</Muted> : null}
                  </View>
                  {!item.read ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.accent }} /> : null}
                </View>
              </TouchableOpacity>
            )
          }}
        />
      )}
    </SafeAreaView>
  )
}
