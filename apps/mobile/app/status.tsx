import { useEffect, useState } from 'react'
import { FONT, SPACE } from '@/src/design'
import { View, Text, TouchableOpacity, ScrollView } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Card, Muted, Btn } from '@/src/components/ui'
import { StatusChip } from '@/src/screens/profile/helpers'
import { Icon } from '@/src/components/icon'
import { useTheme } from '@/src/theme'
import { api } from '@/src/lib/api'
import { Loader } from '@/src/components/Loader'
import { Reveal, stagger } from '@/src/components/motion'

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
      <Reveal dir="up" duration={420}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.lg, paddingHorizontal: SPACE.xxl, paddingVertical: SPACE.lg, borderBottomWidth: 1, borderBottomColor: c.border }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <Icon name="back" size={22} color={c.text} />
        </TouchableOpacity>
        <Text style={{ color: c.text, fontSize: FONT.card, fontWeight: '800', flex: 1 }}>Status</Text>
      </View>
      </Reveal>

      {loading ? (
        <View style={{ paddingTop: SPACE.colossal, alignItems: 'center' }}>
          <Loader compact />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: SPACE.xxxl, paddingBottom: SPACE.colossal }}>
          <Reveal dir="up" delay={120} duration={520}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.lg, marginBottom: SPACE.huge }}>
            <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: color }} />
            <Text style={{ color, fontSize: 17, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 }}>{overall}</Text>
          </View>
          </Reveal>

          {(data.services ?? []).map((s, i) => (
            <Reveal key={s.name} dir="scale" delay={stagger(i)} duration={420}>
            <Card style={{ padding: SPACE.xxl, marginBottom: SPACE.lg }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md }}>
                <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: statusDot(s.status) }} />
                <Text style={{ color: c.text, fontSize: FONT.base, fontWeight: '700', flex: 1 }} numberOfLines={1}>
                  {s.label || s.name}
                </Text>
                <Text style={{ color: c.muted, fontSize: FONT.sm, textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.status}</Text>
              </View>
              {s.latency_avg_ms != null ? (
                <Text style={{ color: c.muted, fontSize: FONT.sm, marginTop: SPACE.sm }}>Avg latency {s.latency_avg_ms} ms</Text>
              ) : null}
              <View style={{ flexDirection: 'row', gap: SPACE.xxl, marginTop: SPACE.md }}>
                <Muted>24h {s.uptime_24h != null ? `${s.uptime_24h.toFixed(1)}%` : '—'}</Muted>
                <Muted>7d {s.uptime_7d != null ? `${s.uptime_7d.toFixed(1)}%` : '—'}</Muted>
                <Muted>30d {s.uptime_30d != null ? `${s.uptime_30d.toFixed(1)}%` : '—'}</Muted>
              </View>
            </Card>
            </Reveal>
          ))}

          {(data.incidents ?? []).length > 0 ? (
            <>
              <Reveal dir="up" delay={200} duration={520}>
              <Text style={{ color: c.muted, fontSize: FONT.xs, letterSpacing: 3, marginTop: SPACE.xl, marginBottom: SPACE.lg, fontWeight: '800' }}>
                ⚠ RECENT INCIDENTS
              </Text>
              </Reveal>
              {(data.incidents ?? []).map((inc, i) => (
                <Reveal key={i} dir="scale" delay={stagger(i)} duration={420}>
                <TouchableOpacity onPress={() => setDetail(inc)} activeOpacity={0.7}>
                  <Card style={{ padding: SPACE.xxl, marginBottom: SPACE.lg }}>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.lg }}>
                      <Text style={{ fontSize: FONT.base }}>{inc.ongoing ? '🔴' : '🟠'}</Text>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md }}>
                          <Text style={{ color: c.text, fontSize: FONT.body, fontWeight: '700', flex: 1 }} numberOfLines={1}>
                            {inc.label || 'Incident'}
                          </Text>
                          <StatusChip text={inc.ongoing ? 'ongoing' : 'resolved'} tone={inc.ongoing ? c.danger : undefined} />
                        </View>
                        <Muted style={{ marginTop: SPACE.xxs }} numberOfLines={1}>
                          {inc.ongoing ? 'Started ' : ''}
                          {inc.start ? new Date(inc.start).toLocaleString() : '—'}
                        </Muted>
                        {!inc.ongoing && inc.duration_s != null ? <Muted>{fmtDur(inc.duration_s)} down</Muted> : null}
                      </View>
                    </View>
                  </Card>
                </TouchableOpacity>
                </Reveal>
              ))}
            </>
          ) : (
            <Reveal dir="up" delay={200} duration={520}><Muted style={{ marginTop: SPACE.lg, textAlign: 'center' }}>No incidents reported.</Muted></Reveal>
          )}
        </ScrollView>
      )}

      {detail ? (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', padding: SPACE.xxxl }}>
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md, marginBottom: SPACE.md }}>
              <Text style={{ fontSize: FONT.section }}>{detail.ongoing ? '🔴' : '🟠'}</Text>
              <Text style={{ color: c.text, fontSize: FONT.base, fontWeight: '800', flex: 1 }} numberOfLines={2}>
                {detail.label || 'Incident'}
              </Text>
              <StatusChip text={detail.ongoing ? 'ongoing' : 'resolved'} tone={detail.ongoing ? c.danger : undefined} />
            </View>

            {serviceFor(detail) ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md, marginBottom: SPACE.xl }}>
                <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: statusDot(serviceFor(detail)!.status) }} />
                <Muted>Service is currently {serviceFor(detail)!.status}</Muted>
              </View>
            ) : null}

            <Text style={{ color: c.accent2, fontSize: FONT.micro, fontWeight: '800', letterSpacing: 2, marginTop: SPACE.lg, marginBottom: SPACE.sm }}>TIMELINE</Text>
            {detail.start ? (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACE.xs }}>
                <Muted>Started</Muted>
                <Text style={{ color: c.text, fontSize: FONT.md }}>{new Date(detail.start).toLocaleString()}</Text>
              </View>
            ) : null}
            {detail.ongoing ? (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACE.xs }}>
                <Muted>Ended</Muted>
                <Text style={{ color: c.danger, fontSize: FONT.md }}>Still ongoing</Text>
              </View>
            ) : detail.end ? (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACE.xs }}>
                <Muted>Ended</Muted>
                <Text style={{ color: c.text, fontSize: FONT.md }}>{new Date(detail.end).toLocaleString()}</Text>
              </View>
            ) : null}
            {!detail.ongoing && detail.duration_s != null ? (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACE.xs }}>
                <Muted>Duration</Muted>
                <Text style={{ color: c.text, fontSize: FONT.md }}>{fmtDur(detail.duration_s)}</Text>
              </View>
            ) : null}

            <View style={{ marginTop: SPACE.xl }}>
              <Btn title="Close" variant="ghost" onPress={() => setDetail(null)} />
            </View>
          </Card>
        </View>
      ) : null}
    </SafeAreaView>
  )
}
