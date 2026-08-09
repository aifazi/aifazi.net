import { useCallback, useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, ScrollView } from 'react-native'
import { useRouter } from 'expo-router'
import type { Href } from 'expo-router'
import { Card, Muted, Btn } from '@/src/components/ui'
import { Loader } from '@/src/components/Loader'
import { useTheme } from '@/src/theme'
import { useAuth } from '@/src/lib/auth'
import { webPillSnap } from '@/src/lib/carousel'
import { api } from '@/src/lib/api'
import { fmtWhen, StatusChip } from './helpers'

interface Ticket {
  id?: string; ticket_id?: string; subject?: string; status?: string; priority?: string
  category?: string; created_at?: string; updated_at?: string; message_count?: number
}

export function TicketsTab() {
  const { theme } = useTheme()
  const c = theme.colors
  const { user } = useAuth()
  const router = useRouter()
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
    return <Loader />
  }
  if (!user?.email) {
    return <Muted style={{ textAlign: 'center', marginTop: 40 }}>No email associated with your account.</Muted>
  }

  return (
    <ScrollView keyboardShouldPersistTaps="handled">
      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
        {[
          { label: 'TOTAL', value: stats.total, color: c.accent2 },
          { label: 'OPEN', value: stats.open, color: c.star },
          { label: 'PROGRESS', value: stats.progress, color: c.accent2 },
          { label: 'RESOLVED', value: stats.resolved, color: c.accent },
        ].map((s) => (
          <View key={s.label} style={{ flex: 1, backgroundColor: c.bg, borderWidth: 1, borderColor: c.border, borderTopWidth: 2, borderTopColor: s.color, borderRadius: 8, padding: 10, alignItems: 'center' }}>
            <Text style={{ color: c.muted, fontSize: 8, letterSpacing: 1, marginBottom: 2 }}>{s.label}</Text>
            <Text style={{ color: s.color, fontSize: 18, fontWeight: '800' }}>{s.value}</Text>
          </View>
        ))}
      </View>

      <View style={{ marginBottom: 10 }}>
        <Btn title="+ New Ticket" onPress={() => router.push('/helpdesk-new' as Href)} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} {...webPillSnap()} style={{ marginBottom: 10 }}>
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
          <TouchableOpacity
            key={t.id}
            onPress={() => router.push(`/helpdesk-detail?id=${encodeURIComponent(t.id || '')}` as Href)}
          >
            <Card style={{ padding: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ color: c.text, fontSize: 13, fontWeight: '700', flex: 1 }}>{t.subject || t.ticket_id}</Text>
                <StatusChip text={t.status || 'unknown'} />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
                {t.priority ? <StatusChip text={t.priority} /> : null}
                {t.category ? <Text style={{ color: c.muted, fontSize: 10 }}>{t.category}</Text> : null}
                <View style={{ flex: 1 }} />
                <Muted style={{ fontSize: 10 }}>{fmtWhen(t.updated_at || t.created_at)}</Muted>
              </View>
            </Card>
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  )
}