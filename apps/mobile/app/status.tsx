import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, ScrollView } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Card, Muted, Btn } from '@/src/components/ui'
import { StatusChip } from '@/src/screens/profile/helpers'
import { useTheme } from '@/src/theme'
import { api } from '@/src/lib/api'
import { Loader } from '@/src/components/Loader'

interface Service {
  name: string
  label?: string
  status: string
  uptime_24h?: number | null
  uptime_7d?: number | null
  uptime_30d?: number | null
  latency_avg_ms?: number | null
  custom?: boolean
  type?: string
}

interface StatusData {
  overall?: string
  services?: Service[]
  incidents?: Incident[]
}

interface Incident {
  label?: string
  ongoing?: boolean
  start?: string
  end?: string
  duration_s?: number
  resolved?: boolean
  status?: string
}

function fmtDur(s?: number): string {
  if (s == null || Number.isNaN(s)) return '—'
  if (s < 60) return `${Math.floor(s)}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
  return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`
}

export default function StatusScreen() {
  const router = useRouter()
  const { theme } = useTheme()
  const c = theme.colors
  const [data, setData] = useState<StatusData>({})
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState<Incident | null>(null)

  useEffect(() => {
    api
      .get('/monitor/status')
      .then((r) => setData((r.data ?? {}) as StatusData))
      .catch(() => setData({}))
      .finally(() => setLoading(false))
  }, [])

  const overall = data.overall || 'operational'
  const color = overall === 'operational' ? c.accent : overall === 'outage' ? c.danger : c.accent2

  const statusDot = (s: string) =>
    s === 'up' || s === 'operational' ? c.accent : s === 'down' || s === 'outage' ? c.danger : c.accent2

  const serviceFor = (inc: Incident): Service | undefined =>
    (data.services ?? []).find((s) => (s.label || s.name) === (inc.label || ''))

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top', 'bottom']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <Text style={{ color: c.text, fontSize: 18 }}>←</Text>
        </TouchableOpacity>
        <Text style={{ color: c.text, fontSize: 15, fontWeight: '800', flex: 1 }}>Status</Text>
      </View>

      {loading ? (
        <View style={{ paddingTop: 40, alignItems: 'center' }}>
          <Loader compact />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 18 }}>
            <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: color }} />
            <Text style={{ color, fontSize: 17, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 }}>{overall}</Text>
          </View>

          {(data.services ?? []).map((s) => (
            <Card key={s.name} style={{ padding: 14, marginBottom: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: statusDot(s.status) }} />
                <Text style={{ color: c.text, fontSize: 14, fontWeight: '700', flex: 1 }} numberOfLines={1}>
                  {s.label || s.name}
                </Text>
                <Text style={{ color: c.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.status}</Text>
              </View>
              {s.latency_avg_ms != null ? (
                <Text style={{ color: c.muted, fontSize: 11, marginTop: 6 }}>Avg latency {s.latency_avg_ms} ms</Text>
              ) : null}
              <View style={{ flexDirection: 'row', gap: 14, marginTop: 8 }}>
                <Muted>24h {s.uptime_24h != null ? `${s.uptime_24h.toFixed(1)}%` : '—'}</Muted>
                <Muted>7d {s.uptime_7d != null ? `${s.uptime_7d.toFixed(1)}%` : '—'}</Muted>
                <Muted>30d {s.uptime_30d != null ? `${s.uptime_30d.toFixed(1)}%` : '—'}</Muted>
              </View>
            </Card>
          ))}

          {(data.incidents ?? []).length > 0 ? (
            <>
              <Text style={{ color: c.muted, fontSize: 10, letterSpacing: 3, marginTop: 12, marginBottom: 10, fontWeight: '800' }}>
                ⚠ RECENT INCIDENTS
              </Text>
              {(data.incidents ?? []).map((inc, i) => (
                <TouchableOpacity key={i} onPress={() => setDetail(inc)} activeOpacity={0.7}>
                  <Card style={{ padding: 14, marginBottom: 10 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                      <Text style={{ fontSize: 14 }}>{inc.ongoing ? '🔴' : '🟠'}</Text>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text style={{ color: c.text, fontSize: 13, fontWeight: '700', flex: 1 }} numberOfLines={1}>
                            {inc.label || 'Incident'}
                          </Text>
                          <StatusChip text={inc.ongoing ? 'ongoing' : 'resolved'} tone={inc.ongoing ? c.danger : undefined} />
                        </View>
                        <Muted style={{ marginTop: 2 }} numberOfLines={1}>
                          {inc.ongoing ? 'Started ' : ''}
                          {inc.start ? new Date(inc.start).toLocaleString() : '—'}
                        </Muted>
                        {!inc.ongoing && inc.duration_s != null ? <Muted>{fmtDur(inc.duration_s)} down</Muted> : null}
                      </View>
                    </View>
                  </Card>
                </TouchableOpacity>
              ))}
            </>
          ) : (
            <Muted style={{ marginTop: 10, textAlign: 'center' }}>No incidents reported.</Muted>
          )}
        </ScrollView>
      )}

      {detail ? (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', padding: 16 }}>
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Text style={{ fontSize: 16 }}>{detail.ongoing ? '🔴' : '🟠'}</Text>
              <Text style={{ color: c.text, fontSize: 14, fontWeight: '800', flex: 1 }} numberOfLines={2}>
                {detail.label || 'Incident'}
              </Text>
              <StatusChip text={detail.ongoing ? 'ongoing' : 'resolved'} tone={detail.ongoing ? c.danger : undefined} />
            </View>

            {serviceFor(detail) ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: statusDot(serviceFor(detail)!.status) }} />
                <Muted>Service is currently {serviceFor(detail)!.status}</Muted>
              </View>
            ) : null}

            <Text style={{ color: c.accent2, fontSize: 9, fontWeight: '800', letterSpacing: 2, marginTop: 10, marginBottom: 6 }}>TIMELINE</Text>
            {detail.start ? (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                <Muted>Started</Muted>
                <Text style={{ color: c.text, fontSize: 12 }}>{new Date(detail.start).toLocaleString()}</Text>
              </View>
            ) : null}
            {detail.ongoing ? (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                <Muted>Ended</Muted>
                <Text style={{ color: c.danger, fontSize: 12 }}>Still ongoing</Text>
              </View>
            ) : detail.end ? (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                <Muted>Ended</Muted>
                <Text style={{ color: c.text, fontSize: 12 }}>{new Date(detail.end).toLocaleString()}</Text>
              </View>
            ) : null}
            {!detail.ongoing && detail.duration_s != null ? (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                <Muted>Duration</Muted>
                <Text style={{ color: c.text, fontSize: 12 }}>{fmtDur(detail.duration_s)}</Text>
              </View>
            ) : null}

            <View style={{ marginTop: 12 }}>
              <Btn title="Close" variant="ghost" onPress={() => setDetail(null)} />
            </View>
          </Card>
        </View>
      ) : null}
    </SafeAreaView>
  )
}
