/**
 * SessionHistory — shows recent VPN connection sessions.
 */
import { View, Text, ScrollView } from 'react-native'
import { useTheme } from '@/src/theme'
import { formatBytes, type VpnSession } from '@/src/lib/vpn'

interface Props {
  sessions: VpnSession[]
}

function timeAgo(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = Math.floor((now - then) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export function SessionHistory({ sessions }: Props) {
  const { theme } = useTheme()
  const c = theme.colors

  if (sessions.length === 0) {
    return (
      <View style={{ backgroundColor: c.bg2, borderRadius: 16, padding: 24, alignItems: 'center' }}>
        <Text style={{ color: c.text2, fontSize: 13 }}>No connection history yet</Text>
      </View>
    )
  }

  return (
    <View style={{ backgroundColor: c.bg2, borderRadius: 16, padding: 18 }}>
      <Text style={{ color: c.text2, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14 }}>
        Recent Sessions
      </Text>

      {sessions.slice(0, 10).map((session, i) => (
        <View
          key={session.id}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: 10,
            borderBottomWidth: i < Math.min(sessions.length, 10) - 1 ? 1 : 0,
            borderBottomColor: c.border,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.text, fontSize: 14, fontWeight: '500' }}>{session.device_name}</Text>
            <Text style={{ color: c.text2, fontSize: 11, marginTop: 2 }}>
              {timeAgo(session.connected_at)} · {session.disconnected_at ? 'Ended' : 'Active'}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ color: '#00ff88', fontSize: 11 }}>↓ {formatBytes(session.bytes_rx)}</Text>
            <Text style={{ color: '#a855f7', fontSize: 11 }}>↑ {formatBytes(session.bytes_tx)}</Text>
          </View>
        </View>
      ))}
    </View>
  )
}
