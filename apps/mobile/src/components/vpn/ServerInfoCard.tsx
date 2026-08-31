/**
 * ServerInfoCard — displays VPN server endpoint, DNS, subnet, and public IP.
 */
import { View, Text } from 'react-native'
import { useTheme } from '@/src/theme'

interface Props {
  endpoint: string
  subnet: string
  dns?: string
  publicIp?: string
  serverRunning: boolean
}

export function ServerInfoCard({ endpoint, subnet, dns, publicIp, serverRunning }: Props) {
  const { theme } = useTheme()
  const c = theme.colors

  const rows = [
    { label: 'Endpoint', value: endpoint },
    { label: 'Subnet', value: subnet },
    { label: 'DNS', value: dns || '1.1.1.1' },
    ...(publicIp ? [{ label: 'Public IP', value: publicIp }] : []),
  ]

  return (
    <View style={{ backgroundColor: c.bg2, borderRadius: 16, padding: 18 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
        <View
          style={{
            width: 10,
            height: 10,
            borderRadius: 5,
            backgroundColor: serverRunning ? '#00ff88' : '#ff4444',
            marginRight: 10,
          }}
        />
        <Text style={{ color: c.text, fontSize: 15, fontWeight: '700' }}>
          Server {serverRunning ? 'Online' : 'Offline'}
        </Text>
      </View>

      {rows.map((row, i) => (
        <View
          key={row.label}
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            paddingVertical: 8,
            borderBottomWidth: i < rows.length - 1 ? 1 : 0,
            borderBottomColor: c.border,
          }}
        >
          <Text style={{ color: c.text2, fontSize: 13 }}>{row.label}</Text>
          <Text style={{ color: c.text, fontSize: 13, fontWeight: '500', fontFamily: 'monospace' }}>{row.value}</Text>
        </View>
      ))}
    </View>
  )
}
