/**
 * DeviceCard — individual VPN device row with status, IP, and traffic.
 */
import { View, Text, TouchableOpacity } from 'react-native'
import { useTheme } from '@/src/theme'
import { formatBytes, type VpnPeer } from '@/src/lib/vpn'

interface Props {
  peer: VpnPeer
  onPress?: () => void
  onLongPress?: () => void
}

const OS_ICONS: Record<string, string> = {
  ios: '',
  android: '🤖',
  windows: '🪟',
  macos: '💻',
  linux: '🐧',
}

export function DeviceCard({ peer, onPress, onLongPress }: Props) {
  const { theme } = useTheme()
  const c = theme.colors
  const icon = OS_ICONS[peer.device_os] || '💻'

  return (
    <TouchableOpacity
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.7}
      style={{
        backgroundColor: c.bg2,
        borderRadius: 14,
        padding: 16,
        marginBottom: 10,
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: peer.connected ? '#00ff8840' : c.border,
      }}
    >
      {/* Icon */}
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: peer.connected ? '#00ff8815' : c.bg,
          justifyContent: 'center',
          alignItems: 'center',
          marginRight: 14,
        }}
      >
        <Text style={{ fontSize: 20 }}>{icon}</Text>
      </View>

      {/* Info */}
      <View style={{ flex: 1 }}>
        <Text style={{ color: c.text, fontSize: 15, fontWeight: '600' }}>{peer.device_name}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3 }}>
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: peer.connected ? '#00ff88' : c.text2,
              marginRight: 6,
            }}
          />
          <Text style={{ color: c.text2, fontSize: 12 }}>
            {peer.allocated_ip} · {peer.connected ? 'Connected' : 'Offline'}
          </Text>
        </View>
      </View>

      {/* Traffic */}
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={{ color: '#00ff88', fontSize: 11, fontWeight: '500' }}>↓ {formatBytes(peer.transfer_rx)}</Text>
        <Text style={{ color: '#a855f7', fontSize: 11, fontWeight: '500' }}>↑ {formatBytes(peer.transfer_tx)}</Text>
      </View>
    </TouchableOpacity>
  )
}
