/**
 * TrafficChart — sparkline visualization for VPN upload/download traffic.
 */
import { View, Text } from 'react-native'
import { useTheme } from '@/src/theme'
import { formatBytes } from '@/src/lib/vpn'

interface Props {
  rx: number
  tx: number
  label?: string
}

export function TrafficChart({ rx, tx, label }: Props) {
  const { theme } = useTheme()
  const c = theme.colors

  const maxVal = Math.max(rx, tx, 1)
  const rxPct = (rx / maxVal) * 100
  const txPct = (tx / maxVal) * 100

  return (
    <View style={{ backgroundColor: c.bg2, borderRadius: 16, padding: 20 }}>
      {label && (
        <Text style={{ color: c.text2, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16 }}>
          {label}
        </Text>
      )}

      {/* Download bar */}
      <View style={{ marginBottom: 16 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#00ff8830', justifyContent: 'center', alignItems: 'center', marginRight: 8 }}>
              <Text style={{ color: '#00ff88', fontSize: 12, fontWeight: '700' }}>↓</Text>
            </View>
            <Text style={{ color: c.text, fontSize: 13, fontWeight: '500' }}>Download</Text>
          </View>
          <Text style={{ color: '#00ff88', fontSize: 14, fontWeight: '700' }}>{formatBytes(rx)}</Text>
        </View>
        <View style={{ height: 6, backgroundColor: c.bg, borderRadius: 3, overflow: 'hidden' }}>
          <View style={{ height: '100%', width: `${rxPct}%`, backgroundColor: '#00ff88', borderRadius: 3 }} />
        </View>
      </View>

      {/* Upload bar */}
      <View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#a855f730', justifyContent: 'center', alignItems: 'center', marginRight: 8 }}>
              <Text style={{ color: '#a855f7', fontSize: 12, fontWeight: '700' }}>↑</Text>
            </View>
            <Text style={{ color: c.text, fontSize: 13, fontWeight: '500' }}>Upload</Text>
          </View>
          <Text style={{ color: '#a855f7', fontSize: 14, fontWeight: '700' }}>{formatBytes(tx)}</Text>
        </View>
        <View style={{ height: 6, backgroundColor: c.bg, borderRadius: 3, overflow: 'hidden' }}>
          <View style={{ height: '100%', width: `${txPct}%`, backgroundColor: '#a855f7', borderRadius: 3 }} />
        </View>
      </View>
    </View>
  )
}
