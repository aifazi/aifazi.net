/**
 * app/vpn.tsx — WireGuard VPN screen
 *
 * Shows VPN status, connected devices, and allows adding new devices.
 * Uses the backend API for peer management. Native tunnel integration
 * requires react-native-wireguard-vpn (added after prebuild).
 */
import { useState, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  ActivityIndicator,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '@/src/theme'
import { useAuth } from '@/src/lib/auth'
import { Screen } from '@/src/components/Screen'
import { Header } from '@/src/components/Header'
import {
  getVpnStatus,
  listPeers,
  createPeer,
  deletePeer,
  getVpnStats,
  formatBytes,
  detectDeviceOs,
  type VpnPeer,
  type VpnStatus,
} from '@/src/lib/vpn'

export default function VpnScreen() {
  const { theme } = useTheme()
  const c = theme.colors
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { user } = useAuth()

  const [status, setStatus] = useState<VpnStatus | null>(null)
  const [peers, setPeers] = useState<VpnPeer[]>([])
  const [stats, setStats] = useState<{ total_rx: number; total_tx: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [creating, setCreating] = useState(false)

  const loadData = useCallback(async () => {
    try {
      const [statusRes, peersRes, statsRes] = await Promise.allSettled([
        getVpnStatus(),
        listPeers(),
        getVpnStats(),
      ])
      if (statusRes.status === 'fulfilled') setStatus(statusRes.value)
      if (peersRes.status === 'fulfilled') setPeers(peersRes.value)
      if (statsRes.status === 'fulfilled') setStats({ total_rx: statsRes.value.total_rx, total_tx: statsRes.value.total_tx })
    } catch (err) {
      console.error('Failed to load VPN data:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    loadData()
  }, [loadData])

  const handleAddDevice = useCallback(async () => {
    const os = detectDeviceOs()
    const name = `${os === 'ios' ? 'iPhone' : os === 'android' ? 'Android' : 'Device'} — ${user?.username ?? 'User'}`
    Alert.alert(
      'Add VPN Device',
      `Create a new VPN peer for "${name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Create',
          onPress: async () => {
            try {
              setCreating(true)
              const result = await createPeer(name, os)
              Alert.alert(
                'Device Created',
                `IP: ${result.allocated_ip}\n\nScan the QR code in the WireGuard app to connect.`,
                [{ text: 'OK' }],
              )
              loadData()
            } catch (err: any) {
              Alert.alert('Error', err?.response?.data?.detail ?? 'Failed to create device')
            } finally {
              setCreating(false)
            }
          },
        },
      ],
    )
  }, [user, loadData])

  const handleDeletePeer = useCallback(
    (peer: VpnPeer) => {
      Alert.alert(
        'Delete Device',
        `Remove "${peer.device_name}"? This will disconnect the VPN on this device.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              try {
                await deletePeer(peer.id)
                loadData()
              } catch (err: any) {
                Alert.alert('Error', err?.response?.data?.detail ?? 'Failed to delete device')
              }
            },
          },
        ],
      )
    },
    [loadData],
  )

  if (loading) {
    return (
      <Screen>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={c.accent} />
        </View>
      </Screen>
    )
  }

  return (
    <Screen>
      <Header title="VPN" onBack={() => router.back()} />
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 80 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}
      >
        {/* Server Status */}
        <View
          style={{
            backgroundColor: c.bg2,
            borderRadius: 16,
            padding: 20,
            marginBottom: 16,
            borderWidth: 1,
            borderColor: status?.server_running ? c.accent + '40' : c.border,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
            <View
              style={{
                width: 12,
                height: 12,
                borderRadius: 6,
                backgroundColor: status?.server_running ? '#00ff88' : '#ff4444',
                marginRight: 10,
              }}
            />
            <Text style={{ color: c.text, fontSize: 18, fontWeight: '700' }}>
              {status?.server_running ? 'Server Online' : 'Server Offline'}
            </Text>
          </View>
          <Text style={{ color: c.text2, fontSize: 13 }}>
            Endpoint: {status?.endpoint ?? '—'}
          </Text>
          <Text style={{ color: c.text2, fontSize: 13, marginTop: 4 }}>
            Subnet: {status?.subnet ?? '—'}
          </Text>
        </View>

        {/* Traffic Stats */}
        {stats && (
          <View
            style={{
              backgroundColor: c.bg2,
              borderRadius: 16,
              padding: 16,
              marginBottom: 16,
              flexDirection: 'row',
              justifyContent: 'space-around',
            }}
          >
            <View style={{ alignItems: 'center' }}>
              <Text style={{ color: c.accent, fontSize: 20, fontWeight: '700' }}>
                {formatBytes(stats.total_rx)}
              </Text>
              <Text style={{ color: c.text2, fontSize: 12 }}>Downloaded</Text>
            </View>
            <View style={{ width: 1, backgroundColor: c.border }} />
            <View style={{ alignItems: 'center' }}>
              <Text style={{ color: c.accent, fontSize: 20, fontWeight: '700' }}>
                {formatBytes(stats.total_tx)}
              </Text>
              <Text style={{ color: c.text2, fontSize: 12 }}>Uploaded</Text>
            </View>
          </View>
        )}

        {/* Devices */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <Text style={{ color: c.text, fontSize: 16, fontWeight: '700' }}>
            Devices ({peers.length}/5)
          </Text>
          <TouchableOpacity
            onPress={handleAddDevice}
            disabled={creating || peers.length >= 5}
            style={{
              backgroundColor: peers.length >= 5 ? c.border : c.accent,
              paddingHorizontal: 16,
              paddingVertical: 8,
              borderRadius: 12,
            }}
          >
            {creating ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={{ color: peers.length >= 5 ? c.text2 : '#fff', fontWeight: '600', fontSize: 14 }}>
                + Add Device
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {peers.length === 0 ? (
          <View
            style={{
              backgroundColor: c.bg2,
              borderRadius: 16,
              padding: 32,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: c.text2, fontSize: 14, textAlign: 'center' }}>
              No VPN devices yet.{'\n'}Tap &quot;Add Device&quot; to set up your first VPN connection.
            </Text>
          </View>
        ) : (
          peers.map((peer) => (
            <TouchableOpacity
              key={peer.id}
              style={{
                backgroundColor: c.bg2,
                borderRadius: 12,
                padding: 16,
                marginBottom: 8,
                flexDirection: 'row',
                alignItems: 'center',
                borderWidth: 1,
                borderColor: peer.connected ? c.accent + '40' : c.border,
              }}
              onLongPress={() => handleDeletePeer(peer)}
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: c.bg,
                  justifyContent: 'center',
                  alignItems: 'center',
                  marginRight: 12,
                }}
              >
                <Text style={{ fontSize: 18 }}>
                  {peer.device_os === 'ios' ? '📱' : peer.device_os === 'android' ? '🤖' : '💻'}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.text, fontSize: 15, fontWeight: '600' }}>{peer.device_name}</Text>
                <Text style={{ color: c.text2, fontSize: 12 }}>
                  {peer.allocated_ip} · {peer.connected ? 'Connected' : 'Offline'}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ color: c.text2, fontSize: 11 }}>
                  ↓ {formatBytes(peer.transfer_rx)}
                </Text>
                <Text style={{ color: c.text2, fontSize: 11 }}>
                  ↑ {formatBytes(peer.transfer_tx)}
                </Text>
              </View>
            </TouchableOpacity>
          ))
        )}

        {/* Setup Instructions */}
        <View
          style={{
            backgroundColor: c.bg2,
            borderRadius: 16,
            padding: 16,
            marginTop: 16,
          }}
        >
          <Text style={{ color: c.text, fontSize: 14, fontWeight: '700', marginBottom: 8 }}>
            How to connect
          </Text>
          <Text style={{ color: c.text2, fontSize: 13, lineHeight: 20 }}>
            1. Tap &quot;Add Device&quot; above{'\n'}
            2. Install the WireGuard app{'\n'}
            3. Scan the QR code shown after creating a device{'\n'}
            4. Toggle the VPN on in WireGuard
          </Text>
        </View>
      </ScrollView>
    </Screen>
  )
}
