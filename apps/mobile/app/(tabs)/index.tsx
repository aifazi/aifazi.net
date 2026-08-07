import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native'
import { Screen } from '@/src/components/Screen'
import { Card, Title, Muted, Btn } from '@/src/components/ui'
import { useTheme } from '@/src/theme'
import { useAuth } from '@/src/lib/auth'
import { api } from '@/src/lib/api'

interface StatusService {
  name: string
  label: string
  status: string
  uptime_24h?: number | null
}

export default function HomeScreen() {
  const { theme, cycleTheme } = useTheme()
  const c = theme.colors
  const { user } = useAuth()
  const [status, setStatus] = useState<{ overall?: string; services?: StatusService[] } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api
      .get('/monitor/status')
      .then((r) => setStatus(r.data))
      .catch(() => setStatus(null))
      .finally(() => setLoading(false))
  }, [])

  const overall = status?.overall ?? 'unknown'
  const overallColor = overall === 'operational' ? c.accent : overall === 'outage' ? c.danger : c.accent2

  return (
    <Screen>
      <View style={styles.row}>
        <Title>aifazi.net</Title>
        <TouchableOpacity onPress={cycleTheme} style={[styles.themeBtn, { borderColor: c.border }]}>
          <Text style={{ color: c.text, fontSize: 12, fontFamily: theme.mono ? 'monospace' : undefined }}>
            {theme.name}
          </Text>
        </TouchableOpacity>
      </View>
      <Muted>Community platform — mobile client</Muted>

      {user && (
        <Card style={{ marginTop: 12 }}>
          <Text style={{ color: c.text, fontWeight: '700' }}>Welcome back, {user.username}!</Text>
          <Muted>{user.email ?? user.role ?? 'member'}</Muted>
        </Card>
      )}

      <View style={{ marginTop: 8 }}>
        <Card>
          <View style={styles.row}>
            <Text style={{ color: c.text, fontSize: 14, fontWeight: '800' }}>System status</Text>
            {loading ? (
              <ActivityIndicator color={c.accent} />
            ) : (
              <Text style={{ color: overallColor, fontWeight: '800', textTransform: 'uppercase', fontSize: 12 }}>
                {overall}
              </Text>
            )}
          </View>
          {!loading && status?.services?.length ? (
            <View style={{ marginTop: 10 }}>
              {status.services.map((s) => (
                <View key={s.name} style={styles.row}>
                  <Text style={{ color: c.text2, fontSize: 13 }}>{s.label}</Text>
                  <View style={styles.row}>
                    <View
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        backgroundColor:
                          s.status === 'up' ? c.accent : s.status === 'down' ? c.danger : c.muted,
                      }}
                    />
                    {s.uptime_24h != null && (
                      <Text style={{ color: c.muted, fontSize: 11, marginLeft: 6 }}>
                        {s.uptime_24h}%
                      </Text>
                    )}
                  </View>
                </View>
              ))}
            </View>
          ) : null}
        </Card>
      </View>

      <View style={{ marginTop: 20 }}>
        <Card>
          <Text style={{ color: c.text, fontSize: 13, fontWeight: '700' }}>Coming next</Text>
          <Muted>Forum threads · Blog · LiveKit voice/video · Push notifications</Muted>
        </Card>
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  themeBtn: {
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
})
