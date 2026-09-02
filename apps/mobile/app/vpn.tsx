/**
 * app/vpn.tsx — WireGuard VPN Dashboard
 *
 * Full-tunnel VPN management screen with connection ring, traffic stats,
 * device management, server info, and session history.
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
import { ConnectionRing } from '@/src/components/vpn/ConnectionRing'
import { TrafficChart } from '@/src/components/vpn/TrafficChart'
import { DeviceCard } from '@/src/components/vpn/DeviceCard'
import { ServerInfoCard } from '@/src/components/vpn/ServerInfoCard'
import { SessionHistory } from '@/src/components/vpn/SessionHistory'
import { PeerConfigModal } from '@/src/components/vpn/PeerConfigModal'
import {
  getVpnStatus,
  listPeers,
  createPeer,
  deletePeer,
  getVpnStats,
  listVpnSessions,
  getPublicIp,
  formatBytes,
  detectDeviceOs,
  type VpnPeer,
  type VpnStatus,
  type VpnSession,
} from '@/src/lib/vpn'

type ConnectionState = 'disconnected' | 'connecting' | 'connected'

export default function VpnScreen() {
  const { theme } = useTheme()
  const c = theme.colors
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { user } = useAuth()

  const [status, setStatus] = useState<VpnStatus | null>(null)
  const [peers, setPeers] = useState<VpnPeer[]>([])
  const [sessions, setSessions] = useState<VpnSession[]>([])
  const [publicIp, setPublicIp] = useState<string>('')
  const [totalRx, setTotalRx] = useState(0)
  const [totalTx, setTotalTx] = useState(0)
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [creating, setCreating] = useState(false)
  const [configPeerId, setConfigPeerId] = useState<string | null>(null)
  const [configPeerName, setConfigPeerName] = useState('')
  const [configPeerIp, setConfigPeerIp] = useState('')
  const [configModalVisible, setConfigModalVisible] = useState(false)

  const loadData = useCallback(async () => {
    try {
      const [statusRes, peersRes, statsRes, sessionsRes, ipRes] = await Promise.allSettled([
        getVpnStatus(),
        listPeers(),
        getVpnStats(),
        listVpnSessions(10),
        getPublicIp(),
      ])
      if (statusRes.status === 'fulfilled') setStatus(statusRes.value)
      if (peersRes.status === 'fulfilled') {
        setPeers(peersRes.value)
        const anyConnected = peersRes.value.some((p) => p.connected)
        setConnectionState(anyConnected ? 'connected' : 'disconnected')
      }
      if (statsRes.status === 'fulfilled') {
        setTotalRx(statsRes.value.total_rx)
        setTotalTx(statsRes.value.total_tx)
      }
      if (sessionsRes.status === 'fulfilled') setSessions(sessionsRes.value.sessions ?? [])
      if (ipRes.status === 'fulfilled') setPublicIp(ipRes.value.ip)
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

  const handleToggleConnection = useCallback(() => {
    if (connectionState === 'connected') {
      Alert.alert(
        'Disconnect VPN',
        'This will disconnect all devices from the VPN tunnel.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Disconnect',
            style: 'destructive',
            onPress: () => setConnectionState('disconnected'),
          },
        ],
      )
    } else if (connectionState === 'disconnected') {
      if (peers.length === 0) {
        Alert.alert('No Devices', 'Add a VPN device first to connect.')
        return
      }
      setConnectionState('connecting')
      setTimeout(() => setConnectionState('connected'), 2000)
    }
  }, [connectionState, peers.length])

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
                loadData()
                setConfigPeerId(result.id)
                setConfigPeerName(result.device_name)
                setConfigPeerIp(result.allocated_ip)
                setConfigModalVisible(true)
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
    <Screen scroll={false}>
      <Header title="VPN" onBack={() => router.back()} />
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 80 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}
      >
        {/* Connection Ring */}
        <ConnectionRing
          state={connectionState}
          onPress={handleToggleConnection}
          location={connectionState === 'connected' ? `United States — ${publicIp || 'VPS'}` : undefined}
        />

        {/* Traffic Stats */}
        <View style={{ marginBottom: 16 }}>
          <TrafficChart rx={totalRx} tx={totalTx} label="Total Traffic" />
        </View>

        {/* Server Info */}
        {status && (
          <View style={{ marginBottom: 16 }}>
            <ServerInfoCard
              endpoint={status.endpoint}
              subnet={status.subnet}
              dns="1.1.1.1"
              publicIp={publicIp}
              serverRunning={status.server_running}
            />
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
              marginBottom: 16,
            }}
          >
            <Text style={{ color: c.text2, fontSize: 14, textAlign: 'center' }}>
              No VPN devices yet.{'\n'}Tap &quot;Add Device&quot; to set up your first VPN connection.
            </Text>
          </View>
        ) : (
          <View style={{ marginBottom: 16 }}>
            {peers.map((peer) => (
              <DeviceCard
                key={peer.id}
                peer={peer}
                onPress={() => {
                  setConfigPeerId(peer.id)
                  setConfigPeerName(peer.device_name)
                  setConfigPeerIp(peer.allocated_ip)
                  setConfigModalVisible(true)
                }}
                onLongPress={() => handleDeletePeer(peer)}
              />
            ))}
          </View>
        )}

        {/* Session History */}
        {sessions.length > 0 && (
          <View style={{ marginBottom: 16 }}>
            <SessionHistory sessions={sessions} />
          </View>
        )}

        {/* How to Connect */}
        <View
          style={{
            backgroundColor: c.bg2,
            borderRadius: 16,
            padding: 18,
            borderWidth: 1,
            borderColor: c.border,
          }}
        >
          <Text style={{ color: c.text, fontSize: 14, fontWeight: '700', marginBottom: 10 }}>
            How to Connect
          </Text>
          {[
            'Tap the power button to connect',
            'Add a device and scan the QR code in WireGuard app',
            'All traffic routes through the VPS (full tunnel)',
            'Your public IP becomes the VPS IP when connected',
          ].map((step, i) => (
            <View key={i} style={{ flexDirection: 'row', marginBottom: 8 }}>
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  backgroundColor: c.accent + '20',
                  justifyContent: 'center',
                  alignItems: 'center',
                  marginRight: 10,
                  marginTop: 1,
                }}
              >
                <Text style={{ color: c.accent, fontSize: 11, fontWeight: '700' }}>{i + 1}</Text>
              </View>
              <Text style={{ color: c.text2, fontSize: 13, lineHeight: 20, flex: 1 }}>{step}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <PeerConfigModal
        visible={configModalVisible}
        peerId={configPeerId}
        peerName={configPeerName}
        peerIp={configPeerIp}
        onClose={() => {
          setConfigModalVisible(false)
          setConfigPeerId(null)
        }}
        onDelete={() => {
          if (configPeerId) {
            const peer = peers.find((p) => p.id === configPeerId)
            if (peer) handleDeletePeer(peer)
          }
        }}
      />
    </Screen>
  )
}
