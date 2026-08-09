import { useCallback, useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, TextInput, ActivityIndicator, ScrollView, Linking, FlatList } from 'react-native'
import { Image as ExpoImage } from 'expo-image'
import { useRouter } from 'expo-router'
import { pickLibraryImage, takeCameraPhoto, pickDocument, askImageSourceAsync, type PickedFile } from '@/src/lib/media'
import { Screen } from '@/src/components/Screen'
import { Card, Title, Muted, Btn, Field } from '@/src/components/ui'
import { Avatar, BUILTIN_AVATARS, BUILTIN_AVATAR_ICONS } from '@/src/components/Avatar'
import { useTheme } from '@/src/theme'
import { useAuth } from '@/src/lib/auth'
import { OAuthButtons } from '@/src/components/OAuthButtons'
import { api } from '@/src/lib/api'
import { THEME_IDS, THEMES } from '@/src/themes'
import { checkForUpdate, downloadAndInstall, openInstallSettings, canRequestPackageInstalls, InstallBlockedError, type UpdateCheck } from '@/src/lib/updates'
import { useOverlay } from '@/src/components/overlay'

function fmtDate(iso?: string) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}

function fmtBytes(n?: number) {
  if (!n) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function fmtMoney(cents?: number) {
  return `$${((cents ?? 0) / 100).toFixed(2)}`
}

function fmtWhen(iso?: string) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const s = (Date.now() - d.getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`
  return fmtDate(iso)
}

const STATUS_COLOR: Record<string, string> = {
  open: '#ffb020',
  'in-progress': '#00d4ff',
  pending: '#b88aff',
  resolved: '#00ff88',
  closed: '#6b8296',
  critical: '#ff4757',
  high: '#ff8a50',
  medium: '#ffb020',
  low: '#00d4ff',
  delivered: '#00ff88',
  paid: '#00ff88',
  shipped: '#b88aff',
  processing: '#00d4ff',
  cancelled: '#ff4757',
  refunded: '#ff4757',
}

function Chip({ text, tone }: { text: string; tone?: string }) {
  const color = tone ?? STATUS_COLOR[text] ?? '#ffb020'
  return (
    <View style={{ borderWidth: 1, borderColor: color + '66', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 }}>
      <Text style={{ color, fontSize: 9, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' }}>{text}</Text>
    </View>
  )
}

/* ─── App updates ────────────────────────────────────────────────────────── */
function AppUpdatesCard() {
  const { theme } = useTheme()
  const c = theme.colors
  const [check, setCheck] = useState<UpdateCheck | null>(null)
  const [busy, setBusy] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [needPerm, setNeedPerm] = useState(false)

  const runCheck = async () => {
    setBusy(true); setError(''); setNeedPerm(false)
    try {
      setCheck(await checkForUpdate())
    } catch {
      setError('Could not check for updates.')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => { runCheck() }, [])

  // Android 8+ requires the per-app "Install unknown apps" toggle before the
  // package installer will accept our APK. The OS silently resets this after
  // the app updates itself, so verify up front instead of hoping.
  const ensureInstallPerm = async (): Promise<boolean> => {
    if (await canRequestPackageInstalls()) return true
    setNeedPerm(true)
    try {
      await openInstallSettings()
    } catch {}
    return await canRequestPackageInstalls()
  }

  const retryAfterPerm = async () => {
    const granted = await ensureInstallPerm()
    setNeedPerm(!granted)
    if (granted && !downloading) await install()
  }

  const install = async () => {
    if (!check?.release?.apkUrl) return
    setDownloading(true); setError(''); setProgress(0)
    try {
      if (!(await ensureInstallPerm())) return
      await downloadAndInstall(check.release.apkUrl, (p) => setProgress(Math.round(p.fraction * 100)), check.release.apkSize, check.release.sha256)
    } catch (e) {
      if (e instanceof InstallBlockedError) {
        setError(e.message)
        setNeedPerm(true)
      } else {
        setError(
          e instanceof Error && (e.message.includes('Download incomplete') || e.message.includes('checksum'))
            ? e.message
            : 'Install was blocked. Open settings to allow aifazi to install apps.',
        )
      }
    } finally {
      setDownloading(false)
    }
  }

  return (
    <Card title="App updates">
      {busy ? (
        <ActivityIndicator color={c.accent} />
      ) : !check ? (
        <Muted>No update information.</Muted>
      ) : check.updateAvailable ? (
        <>
          <Muted>Version {check.latest} is available (you have {check.installed}).</Muted>
          {check.release?.notes ? <Muted style={{ marginTop: 4 }} numberOfLines={2}>{check.release.notes}</Muted> : null}
          {downloading ? (
            <View style={{ marginTop: 10 }}>
              <Text style={{ color: c.accent, fontSize: 12, fontWeight: '700' }}>Downloading… {progress}%</Text>
            </View>
          ) : needPerm ? (
            <>
              {error ? <Muted style={{ color: c.danger, marginTop: 8 }}>{error}</Muted> : null}
              <Muted style={{ marginTop: 8 }}>
                Android must allow aifazi to install apps before the update can continue.
              </Muted>
              <View style={{ marginTop: 10 }}>
                <Btn title="Turn on install permission" onPress={retryAfterPerm} />
              </View>
            </>
          ) : (
            <View style={{ marginTop: 10 }}>
              <Btn title="Download & install" onPress={install} />
            </View>
          )}
        </>
      ) : (
        <>
          <Muted>You're on the latest version ({check.installed}).</Muted>
          <View style={{ marginTop: 10 }}>
            <Btn title="Check again" variant="ghost" onPress={runCheck} disabled={busy} />
          </View>
        </>
      )}
    </Card>
  )
}

type TabId = 'overview' | 'orders' | 'tickets' | 'activity' | 'documents' | 'security' | 'edit'

/* ─── Overview ──────────────────────────────────────────────────────────── */
function OverviewTab({ goEdit }: { goEdit: () => void }) {
  const { theme, setTheme, source, isLocked } = useTheme()
  const c = theme.colors
  const { user, logout, refresh } = useAuth()
  const router = useRouter()
  const { confirm } = useOverlay()

  const linked: { label: string; value?: string }[] = [
    { label: 'Discord', value: user?.discord_username },
    { label: 'Steam', value: user?.steam_username },
    { label: 'GitHub', value: user?.github_username },
  ].filter((x) => x.value)

  const logOut = async () => {
    const ok = await confirm({ title: 'Log out', message: 'Sign out of your account?', confirmText: 'Log out', destructive: true })
    if (!ok) return
    logout()
    refresh()
  }

  return (
    <ScrollView keyboardShouldPersistTaps="handled">
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Avatar name={user?.username} avatar={user?.avatar} size={64} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.text, fontSize: 18, fontWeight: '900' }}>{user?.username}</Text>
            <Text style={{ color: c.accent2, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginTop: 2 }}>
              {user?.role ?? 'member'}
            </Text>
          </View>
          <Btn title="Edit" onPress={goEdit} style={{ paddingVertical: 8, paddingHorizontal: 14 }} />
        </View>

        {user?.bio ? <Text style={{ color: c.text2, fontSize: 13, lineHeight: 18, marginTop: 12 }}>{user.bio}</Text> : null}

        <View style={{ marginTop: 12, gap: 4 }}>
          {user?.email ? <Muted>✉️ {user.email}{user?.email_verified === false ? ' (unverified)' : ''}</Muted> : null}
          {fmtDate(user?.created_at || user?.createdAt) ? <Muted>📅 Joined {fmtDate(user?.created_at || user?.createdAt)}</Muted> : null}
          {user?.last_seen || user?.lastSeen ? <Muted>🕐 Last seen {fmtWhen(user.last_seen || user.lastSeen)}</Muted> : null}
          {linked.map((l) => (
            <Muted key={l.label}>🔗 {l.label}: {l.value}</Muted>
          ))}
        </View>

        <View style={{ marginTop: 14, gap: 10 }}>
          <Btn title="My chat" variant="ghost" onPress={() => router.push('/chat')} />
          <Btn
            title="Log out"
            variant="danger"
            onPress={logOut}
          />
        </View>
      </Card>

      <Card
        title="Theme"
        subtitle={
          isLocked
            ? 'Locked by the site admin'
            : source === 'user'
              ? 'Your choice'
              : source === 'os'
                ? 'Following your device setting'
                : source === 'global'
                  ? 'Site default'
                  : 'Default app theme'
        }
      >
        {isLocked ? (
          <Muted style={{ marginBottom: 8 }}>🔒 Theme switching is disabled — the admin has forced a theme site-wide.</Muted>
        ) : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
          {THEME_IDS.map((id) => (
            <Btn
              key={id}
              title={THEMES[id].name}
              variant={theme.id === id ? 'primary' : 'ghost'}
              disabled={isLocked}
              onPress={() => setTheme(id)}
              style={{ paddingVertical: 8, paddingHorizontal: 12 }}
            />
          ))}
        </View>
      </Card>

      <AppUpdatesCard />
    </ScrollView>
  )
}

/* ─── Orders ────────────────────────────────────────────────────────────── */
interface OrderItem { product_name?: string; quantity?: number; price_cents?: number }
interface Order {
  id?: string; order_number?: string; created_at?: string; total_cents?: number; status?: string
  items?: OrderItem[]; tracking_number?: string; carrier?: string; tracking_url?: string
  downloads?: { id?: string; token?: string; filename?: string; product_name?: string; downloads_used?: number; downloads_allowed?: number }[]
  events?: { status?: string; note?: string; created_at?: string }[]
}

function OrdersTab() {
  const { theme } = useTheme()
  const c = theme.colors
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState<Order | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    api.get('/store/orders')
      .then((r) => setOrders(Array.isArray(r.data) ? r.data : []))
      .catch(() => setOrders([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const openDetail = async (o: Order) => {
    try {
      const r = await api.get(`/store/orders/${o.order_number}`)
      setDetail(r.data || o)
    } catch {
      setDetail(o)
    }
  }

  if (loading) {
    return <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
  }
  if (orders.length === 0) {
    return <Muted style={{ textAlign: 'center', marginTop: 40 }}>No orders yet.</Muted>
  }

  return (
    <ScrollView keyboardShouldPersistTaps="handled">
      {orders.map((o) => (
        <Card key={o.id} style={{ padding: 12 }}>
          <TouchableOpacity onPress={() => openDetail(o)}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <Text style={{ color: c.accent2, fontSize: 12, fontWeight: '800' }}>{o.order_number}</Text>
              <Muted>{fmtDate(o.created_at)}</Muted>
              <View style={{ flex: 1 }} />
              <Text style={{ color: c.text, fontSize: 14, fontWeight: '800' }}>{fmtMoney(o.total_cents)}</Text>
              <Chip text={o.status || 'unknown'} />
            </View>
            {(o.items || []).length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {(o.items || []).map((it, i) => (
                  <Text key={i} style={{ color: c.muted, fontSize: 10, backgroundColor: c.bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5 }}>
                    {it.product_name} × {it.quantity}
                  </Text>
                ))}
              </View>
            )}
            {o.tracking_number ? (
              <Muted style={{ marginTop: 8 }}>
                📦 {o.carrier || 'Carrier'}: {o.tracking_number}
              </Muted>
            ) : null}
            {(o.downloads || []).length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {(o.downloads || []).map((d) => (
                  <Text key={d.id} style={{ color: c.accent, fontSize: 10, borderWidth: 1, borderColor: c.accent + '40', borderRadius: 5, paddingHorizontal: 8, paddingVertical: 3 }}>
                    ⬇ {d.filename || d.product_name} ({d.downloads_used}/{d.downloads_allowed})
                  </Text>
                ))}
              </View>
            )}
          </TouchableOpacity>
        </Card>
      ))}

      {detail && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', padding: 16 }}>
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={{ color: c.accent, fontSize: 13, fontWeight: '800', letterSpacing: 1 }}>{detail.order_number}</Text>
              <Chip text={detail.status || 'unknown'} />
            </View>
            <Muted>Placed {detail.created_at ? new Date(detail.created_at).toLocaleString() : '—'}</Muted>
            {(detail.carrier || detail.tracking_number) && (
              <Muted style={{ marginTop: 4 }}>📦 {detail.carrier || ''} {detail.tracking_number || ''}</Muted>
            )}

            <Text style={{ color: c.accent2, fontSize: 9, fontWeight: '800', letterSpacing: 2, marginTop: 14, marginBottom: 6 }}>STATUS TIMELINE</Text>
            {(detail.events || []).length === 0 ? (
              <Muted>No updates yet.</Muted>
            ) : (
              (detail.events || []).map((ev, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.accent, marginTop: 5 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: c.text, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' }}>{ev.status}</Text>
                    {ev.note ? <Muted>{ev.note}</Muted> : null}
                    <Muted style={{ fontSize: 10 }}>{new Date(ev.created_at || '').toLocaleString()}</Muted>
                  </View>
                </View>
              ))
            )}

            <Text style={{ color: c.accent2, fontSize: 9, fontWeight: '800', letterSpacing: 2, marginTop: 10, marginBottom: 6 }}>ITEMS</Text>
            {(detail.items || []).map((it, i) => (
              <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={{ color: c.text, fontSize: 12 }}>{it.product_name} × {it.quantity}</Text>
                <Text style={{ color: c.muted, fontSize: 12 }}>{fmtMoney(it.price_cents)}</Text>
              </View>
            ))}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
              <Text style={{ color: c.text, fontSize: 13, fontWeight: '800' }}>Total</Text>
              <Text style={{ color: c.text, fontSize: 13, fontWeight: '800' }}>{fmtMoney(detail.total_cents)}</Text>
            </View>

            <View style={{ marginTop: 12 }}>
              <Btn title="Close" variant="ghost" onPress={() => setDetail(null)} />
            </View>
          </Card>
        </View>
      )}
    </ScrollView>
  )
}

/* ─── Tickets ───────────────────────────────────────────────────────────── */
interface Ticket {
  id?: string; ticket_id?: string; subject?: string; status?: string; priority?: string
  category?: string; created_at?: string; updated_at?: string; message_count?: number
}

function TicketsTab() {
  const { theme } = useTheme()
  const c = theme.colors
  const { user } = useAuth()
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  const statuses = ['all', 'open', 'in-progress', 'pending', 'resolved', 'closed']

  const load = useCallback(() => {
    setLoading(true)
    api.get('/helpdesk/tickets/mine')
      .then((r) => setTickets(Array.isArray(r.data) ? r.data : []))
      .catch(() => setTickets([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = tickets.filter((t) => filter === 'all' || t.status === filter)
  const stats = {
    total: tickets.length,
    open: tickets.filter((t) => t.status === 'open').length,
    progress: tickets.filter((t) => t.status === 'in-progress').length,
    resolved: tickets.filter((t) => t.status === 'resolved' || t.status === 'closed').length,
  }

  if (loading) {
    return <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
  }
  if (!user?.email) {
    return <Muted style={{ textAlign: 'center', marginTop: 40 }}>No email associated with your account.</Muted>
  }

  return (
    <ScrollView keyboardShouldPersistTaps="handled">
      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
        {[
          { label: 'TOTAL', value: stats.total, color: c.accent2 },
          { label: 'OPEN', value: stats.open, color: '#ffb020' },
          { label: 'PROGRESS', value: stats.progress, color: c.accent2 },
          { label: 'RESOLVED', value: stats.resolved, color: c.accent },
        ].map((s) => (
          <View key={s.label} style={{ flex: 1, backgroundColor: c.bg, borderWidth: 1, borderColor: c.border, borderTopWidth: 2, borderTopColor: s.color, borderRadius: 8, padding: 10, alignItems: 'center' }}>
            <Text style={{ color: c.muted, fontSize: 8, letterSpacing: 1, marginBottom: 2 }}>{s.label}</Text>
            <Text style={{ color: s.color, fontSize: 18, fontWeight: '800' }}>{s.value}</Text>
          </View>
        ))}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {statuses.map((s) => {
            const active = filter === s
            return (
              <TouchableOpacity
                key={s}
                onPress={() => setFilter(s)}
                style={{ borderWidth: 1, borderColor: active ? c.accent2 : c.border, borderRadius: 5, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: active ? c.accent2 + '22' : 'transparent' }}
              >
                <Text style={{ color: active ? c.accent2 : c.muted, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', fontWeight: '700' }}>{s}</Text>
              </TouchableOpacity>
            )
          })}
        </View>
      </ScrollView>

      {filtered.length === 0 ? (
        <Muted style={{ textAlign: 'center', marginTop: 30 }}>{tickets.length === 0 ? 'No tickets yet.' : 'No tickets match this filter.'}</Muted>
      ) : (
        filtered.map((t) => (
          <Card key={t.id} style={{ padding: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ color: c.text, fontSize: 13, fontWeight: '700', flex: 1 }}>{t.subject || t.ticket_id}</Text>
              <Chip text={t.status || 'unknown'} />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
              {t.priority ? <Chip text={t.priority} /> : null}
              {t.category ? <Text style={{ color: c.muted, fontSize: 10 }}>{t.category}</Text> : null}
              <View style={{ flex: 1 }} />
              <Muted style={{ fontSize: 10 }}>{fmtWhen(t.updated_at || t.created_at)}</Muted>
            </View>
          </Card>
        ))
      )}
    </ScrollView>
  )
}

/* ─── Forum activity ────────────────────────────────────────────────────── */
interface ThreadRow { id?: string; _id?: string; title?: string; created_at?: string; createdAt?: string }
interface ReplyRow { id?: string; _id?: string; content?: string; body?: string; created_at?: string; createdAt?: string }

function ActivityTab() {
  const { theme } = useTheme()
  const c = theme.colors
  const { user } = useAuth()
  const [threads, setThreads] = useState<ThreadRow[]>([])
  const [replies, setReplies] = useState<ReplyRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void (async () => {
      const uid = user?.id || user?._id
      if (!uid) { setLoading(false); return }
      try {
        const [t, r] = await Promise.all([
          api.get(`/forum/users/${uid}/threads?limit=10`).catch(() => ({ data: [] })),
          api.get(`/forum/users/${uid}/replies?limit=10`).catch(() => ({ data: [] })),
        ])
        setThreads(Array.isArray(t.data) ? t.data : t.data?.threads || [])
        setReplies(Array.isArray(r.data) ? r.data : r.data?.replies || [])
      } finally {
        setLoading(false)
      }
    })()
  }, [user?.id, user?._id])

  if (loading) {
    return <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
  }

  return (
    <ScrollView keyboardShouldPersistTaps="handled">
      <Card title="Recent Threads" subtitle="FORUM">
        {threads.length === 0 ? (
          <Muted style={{ textAlign: 'center', padding: 12 }}>No threads yet</Muted>
        ) : (
          threads.map((t) => (
            <View key={t.id || t._id} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border }}>
              <Text style={{ color: c.text, fontSize: 13, fontWeight: '600' }}>{t.title}</Text>
              <Muted style={{ fontSize: 10, marginTop: 2 }}>{fmtWhen(t.created_at || t.createdAt)}</Muted>
            </View>
          ))
        )}
      </Card>

      <Card title="Recent Replies" subtitle="FORUM">
        {replies.length === 0 ? (
          <Muted style={{ textAlign: 'center', padding: 12 }}>No replies yet</Muted>
        ) : (
          replies.map((r) => (
            <View key={r.id || r._id} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border }}>
              <Text style={{ color: c.muted, fontSize: 12, lineHeight: 18 }} numberOfLines={2}>{r.content || r.body}</Text>
              <Muted style={{ fontSize: 10, marginTop: 2 }}>{fmtWhen(r.created_at || r.createdAt)}</Muted>
            </View>
          ))
        )}
      </Card>
    </ScrollView>
  )
}

/* ─── Documents ─────────────────────────────────────────────────────────── */
interface Doc {
  id?: string; name?: string; category?: string; file_url?: string; mime_type?: string; file_size?: number; created_at?: string
}

function DocumentsTab() {
  const { theme } = useTheme()
  const c = theme.colors
  const overlay = useOverlay()
  const { menu, toast, confirm } = overlay
  const [docs, setDocs] = useState<Doc[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    api.get('/documents')
      .then((r) => setDocs(Array.isArray(r.data) ? r.data : []))
      .catch(() => setDocs([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const pick = async () => {
    const source = await menu({
      title: 'Upload document',
      options: [
        { value: 'camera', label: 'Take photo' },
        { value: 'library', label: 'Photo library' },
        { value: 'file', label: 'File (PDF, DOCX, ZIP…)' },
      ],
    })
    if (source === 'camera') { const f = await takeCameraPhoto({}, overlay); if (f) upload(f) }
    else if (source === 'library') { const f = await pickLibraryImage({}, overlay); if (f) upload(f) }
    else if (source === 'file') { const f = await pickDocument(); if (f) upload(f) }
  }

  const upload = async (file: PickedFile) => {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', { uri: file.uri, name: file.name, type: file.mimeType } as any)
      fd.append('name', file.name)
      fd.append('category', 'other')
      await api.post('/documents', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      toast('Document uploaded successfully.', 'success')
      load()
    } catch (e: any) {
      toast(e?.response?.data?.detail || e?.message || 'Could not upload.', 'error')
    } finally {
      setUploading(false)
    }
  }

  const remove = async (id?: string) => {
    if (!id) return
    const ok = await confirm({ title: 'Delete document', message: 'Delete this document?', confirmText: 'Delete', destructive: true })
    if (!ok) return
    try {
      await api.delete(`/documents/${id}`)
      load()
    } catch (e: any) {
      toast(e?.response?.data?.detail || 'Could not delete.', 'error')
    }
  }

  if (loading) {
    return <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
  }

  return (
    <ScrollView keyboardShouldPersistTaps="handled">
      <View style={{ marginBottom: 10 }}>
        <Btn title={uploading ? 'Uploading…' : '⬆ Upload file'} onPress={pick} disabled={uploading} />
        <Muted style={{ marginTop: 6 }}>Documents are stored privately in your account.</Muted>
      </View>
      {docs.length === 0 ? (
        <Muted style={{ textAlign: 'center', marginTop: 30 }}>No documents yet.</Muted>
      ) : (
        docs.map((d) => (
          <Card key={d.id} style={{ padding: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.text, fontSize: 13, fontWeight: '700' }}>{d.name}</Text>
                <Muted style={{ fontSize: 10 }}>{d.category} · {fmtBytes(d.file_size)} · {fmtDate(d.created_at)}</Muted>
              </View>
              <Btn title="Open" variant="ghost" style={{ paddingVertical: 6, paddingHorizontal: 12 }} onPress={() => { if (d.file_url) Linking.openURL(d.file_url) }} />
              <Btn title="Del" variant="danger" style={{ paddingVertical: 6, paddingHorizontal: 12 }} onPress={() => remove(d.id)} />
            </View>
          </Card>
        ))
      )}
    </ScrollView>
  )
}

/* ─── Security ──────────────────────────────────────────────────────────── */
function SecurityTab() {
  const { theme } = useTheme()
  const c = theme.colors
  const {
    changePassword, deleteAccount, listSessions, revokeSession, revokeAllSessions,
    get2FAStatus, setup2FA, confirm2FA, disable2FA, logout,
  } = useAuth()
  const { confirm } = useOverlay()
  const [cur, setCur] = useState('')
  const [next, setNext] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  // 2FA
  const [twoEnabled, setTwoEnabled] = useState<boolean | null>(null)
  const [twoSecret, setTwoSecret] = useState<{ secret: string; otpauth_uri: string; qr_image?: string } | null>(null)
  const [twoCode, setTwoCode] = useState('')
  const [twoPw, setTwoPw] = useState('')

  // sessions
  const [sessions, setSessions] = useState<any[]>([])
  const [deletePw, setDeletePw] = useState('')

  useEffect(() => {
    get2FAStatus().then(setTwoEnabled).catch(() => setTwoEnabled(false))
    listSessions().then(setSessions).catch(() => setSessions([]))
  }, [get2FAStatus, listSessions])

  const changePw = async () => {
    setMsg(''); setBusy(true)
    try {
      await changePassword(cur, next)
      setCur(''); setNext('')
      setMsg('Password updated.')
    } catch (e: any) {
      setMsg(e?.response?.data?.detail || 'Could not change password.')
    } finally { setBusy(false) }
  }

  const enable2fa = async () => {
    setMsg('')
    try {
      const s = await setup2FA()
      setTwoSecret(s)
    } catch (e: any) {
      setMsg(e?.response?.data?.detail || 'Could not start 2FA setup.')
    }
  }

  const submit2faCode = async () => {
    setMsg(''); setBusy(true)
    try {
      await confirm2FA(twoCode)
      setTwoCode(''); setTwoSecret(null); setTwoEnabled(true)
      setMsg('Two-factor authentication enabled.')
    } catch (e: any) {
      setMsg(e?.response?.data?.detail || 'Invalid code.')
    } finally { setBusy(false) }
  }

  const disable2fa = async () => {
    setMsg(''); setBusy(true)
    try {
      await disable2FA(twoPw, twoCode)
      setTwoPw(''); setTwoCode(''); setTwoEnabled(false)
      setMsg('Two-factor authentication disabled.')
    } catch (e: any) {
      setMsg(e?.response?.data?.detail || 'Could not disable 2FA.')
    } finally { setBusy(false) }
  }

  const del = async () => {
    const ok = await confirm({ title: 'Delete account', message: 'This permanently deletes your account and all data. This cannot be undone.', confirmText: 'Delete account', destructive: true })
    if (!ok) return
    onDelete()
  }

  const onDelete = async () => {
    setMsg(''); setBusy(true)
    try {
      await deleteAccount(deletePw)
      await logout()
    } catch (e: any) {
      setMsg(e?.response?.data?.detail || 'Could not delete account.')
    } finally { setBusy(false) }
  }

  return (
    <ScrollView keyboardShouldPersistTaps="handled">
      <Card title="Change Password">
        <Field label="Current password" value={cur} onChangeText={setCur} secure placeholder="••••••••" />
        <Field label="New password" value={next} onChangeText={setNext} secure placeholder="At least 8 characters" />
        <Btn title={busy ? 'Updating…' : 'Update Password'} onPress={changePw} disabled={busy || next.length < 8} />
      </Card>

      <Card title="Two-Factor Authentication">
        {twoEnabled === null ? (
          <ActivityIndicator color={c.accent} />
        ) : twoEnabled ? (
          <>
            <Muted>✅ Two-factor authentication is enabled.</Muted>
            <Field label="Password" value={twoPw} onChangeText={setTwoPw} secure placeholder="Your password" />
            <Field label="2FA code" value={twoCode} onChangeText={setTwoCode} placeholder="6-digit code" />
            <Btn title={busy ? 'Disabling…' : 'Disable 2FA'} variant="danger" onPress={disable2fa} disabled={busy || !twoPw} />
          </>
        ) : twoSecret ? (
          <>
            <Muted>Scan the QR code with your authenticator app, then confirm.</Muted>
            {twoSecret.qr_image ? (
              <ExpoImage source={{ uri: twoSecret.qr_image }} style={{ width: 180, height: 180, alignSelf: 'center', marginVertical: 10 }} contentFit="contain" />
            ) : (
              <Text selectable style={{ color: c.text, fontSize: 11, marginVertical: 8 }}>{twoSecret.otpauth_uri}</Text>
            )}
            <Text selectable style={{ color: c.muted, fontSize: 11, textAlign: 'center', marginBottom: 8 }}>{twoSecret.secret}</Text>
            <Field label="6-digit code" value={twoCode} onChangeText={setTwoCode} placeholder="123456" />
            <Btn title={busy ? 'Confirming…' : 'Confirm & Enable'} onPress={submit2faCode} disabled={busy || twoCode.trim().length !== 6} />
          </>
        ) : (
          <>
            <Muted>Protect your account with an authenticator app.</Muted>
            <View style={{ marginTop: 10 }}>
              <Btn title="Enable 2FA" onPress={enable2fa} />
            </View>
          </>
        )}
      </Card>

      <Card title="Active Sessions">
        {sessions.length === 0 ? (
          <Muted>No active sessions.</Muted>
        ) : (
          sessions.map((s) => (
            <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.border }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.text, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>
                  {s.current ? '📍 This device' : '💻 Device'}
                </Text>
                <Muted style={{ fontSize: 9 }} numberOfLines={1}>{s.ip} · {s.user_agent || ''}</Muted>
                <Muted style={{ fontSize: 9 }}>Last active {fmtWhen(s.last_active)}</Muted>
              </View>
              {!s.current ? (
                <Btn title="Revoke" variant="ghost" style={{ paddingVertical: 6, paddingHorizontal: 12 }} onPress={() => revokeSession(s.id).then(() => listSessions().then(setSessions)).catch(() => {})} />
              ) : null}
            </View>
          ))
        )}
        {sessions.length > 0 && (
          <View style={{ marginTop: 10 }}>
            <Btn title="Revoke all other sessions" variant="ghost" onPress={() => { revokeAllSessions().then(() => listSessions().then(setSessions)).catch(() => {}) }} />
          </View>
        )}
      </Card>

      <Card title="Danger Zone">
        <Muted style={{ marginBottom: 10 }}>Permanently delete your account and all data.</Muted>
        <Field label="Password" value={deletePw} onChangeText={setDeletePw} secure placeholder="Your password" />
        <Btn title={busy ? 'Deleting…' : 'Delete account'} variant="danger" onPress={del} disabled={busy || !deletePw} />
      </Card>

      {msg ? <Muted style={{ textAlign: 'center', marginTop: 4 }}>{msg}</Muted> : null}
    </ScrollView>
  )
}

/* ─── Edit ──────────────────────────────────────────────────────────────── */
function EditTab() {
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

/* ─── Screen shell ──────────────────────────────────────────────────────── */
export default function ProfileScreen() {
  const { theme } = useTheme()
  const c = theme.colors
  const { user, loading, isAuthed, login, verify2FA, refresh } = useAuth()
  const router = useRouter()
  const [tab, setTab] = useState<TabId>('overview')

  // login state
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [twoFA, setTwoFA] = useState<{ partialToken: string; username: string } | null>(null)
  const [twoFACode, setTwoFACode] = useState('')

  useEffect(() => {
    if (user) setTab('overview')
  }, [user?.id, user?._id])

  if (loading) {
    return (
      <Screen>
        <ActivityIndicator color={c.accent} style={{ marginTop: 60 }} />
      </Screen>
    )
  }

  if (!isAuthed) {
    const submit = async () => {
      setErr(''); setBusy(true)
      try {
        const res = await login(identifier.trim(), password)
        if (res.requires2fa) {
          setTwoFA({ partialToken: res.partialToken || '', username: res.username || identifier })
          setTwoFACode('')
        } else {
          setPassword(''); setIdentifier('')
        }
      } catch (e: any) {
        setErr(e?.response?.data?.detail || e?.message || 'Login failed')
      } finally { setBusy(false) }
    }

    const submit2FA = async () => {
      if (!twoFA) return
      setErr(''); setBusy(true)
      try {
        await verify2FA(twoFA.partialToken, twoFACode)
        setTwoFA(null); setTwoFACode(''); setIdentifier(''); setPassword('')
      } catch (e: any) {
        setErr(e?.response?.data?.detail || e?.message || 'Invalid code')
      } finally { setBusy(false) }
    }

    if (twoFA) {
      return (
        <Screen scroll={false}>
          <Title>Profile</Title>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Card>
              <Text style={{ color: c.text, fontSize: 13, fontWeight: '700' }}>Two-factor authentication</Text>
              <Muted style={{ marginTop: 4 }}>
                Enter the 6-digit code from your authenticator app{twoFA.username ? ` for @${twoFA.username}` : ''}.
              </Muted>
              <View style={{ marginTop: 12 }}>
                <Field
                  label="Authenticator code"
                  value={twoFACode}
                  onChangeText={setTwoFACode}
                  placeholder="000000"
                  keyboardType="number-pad"
                  maxLength={6}
                  autoFocus
                />
              </View>
              {err ? <Muted>{err}</Muted> : null}
              <Btn title={busy ? 'Verifying…' : 'Verify'} onPress={submit2FA} disabled={busy || twoFACode.length < 6} />
              <View style={{ marginTop: 12 }}>
                <Btn title="Back" variant="ghost" onPress={() => { setTwoFA(null); setErr('') }} />
              </View>
            </Card>
          </ScrollView>
        </Screen>
      )
    }

    return (
      <Screen scroll={false}>
        <Title>Profile</Title>
        <ScrollView keyboardShouldPersistTaps="handled">
          <Card>
            <Text style={{ color: c.text, fontSize: 13, fontWeight: '700' }}>Sign in</Text>
            <View style={{ marginTop: 12 }}>
              <Field label="Username / Email" value={identifier} onChangeText={setIdentifier} placeholder="tanvir" autoCapitalize="none" />
              <Field label="Password" value={password} onChangeText={setPassword} secure placeholder="••••••••" autoCapitalize="none" />
            </View>
            {err ? <Muted>{err}</Muted> : null}
            <Btn title={busy ? 'Signing in…' : 'Sign In'} onPress={submit} disabled={busy} />
            <View style={{ marginTop: 12 }}>
              <Btn title="Create account" variant="ghost" onPress={() => router.push('/auth/register')} />
            </View>
            <OAuthButtons
              onSuccess={() => {
                setPassword('')
                setIdentifier('')
              }}
              on2FA={(partialToken, username) => {
                setTwoFA({ partialToken, username: username || '' })
                setTwoFACode('')
              }}
            />
          </Card>
        </ScrollView>
      </Screen>
    )
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'orders', label: 'Orders' },
    { id: 'tickets', label: 'Tickets' },
    { id: 'activity', label: 'Activity' },
    { id: 'documents', label: 'Documents' },
    { id: 'security', label: 'Security' },
    { id: 'edit', label: 'Edit' },
  ]

  return (
    <Screen scroll={false}>
      <Title>Profile</Title>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12, flexGrow: 0 }}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {tabs.map((t) => {
            const active = tab === t.id
            return (
              <TouchableOpacity
                key={t.id}
                onPress={() => setTab(t.id)}
                style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 6, borderWidth: 1, borderColor: active ? c.accent : c.border, backgroundColor: active ? c.accent + '22' : 'transparent' }}
              >
                <Text style={{ color: active ? c.accent : c.muted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 }}>{t.label}</Text>
              </TouchableOpacity>
            )
          })}
        </View>
      </ScrollView>

      {tab === 'overview' && <OverviewTab goEdit={() => setTab('edit')} />}
      {tab === 'orders' && <OrdersTab />}
      {tab === 'tickets' && <TicketsTab />}
      {tab === 'activity' && <ActivityTab />}
      {tab === 'documents' && <DocumentsTab />}
      {tab === 'security' && <SecurityTab />}
      {tab === 'edit' && <EditTab />}
    </Screen>
  )
}
