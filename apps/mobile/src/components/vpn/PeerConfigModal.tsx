/**
 * PeerConfigModal — shows QR code + config options after creating a VPN peer.
 */
import { useState, useEffect } from 'react'
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  Image,
  ScrollView,
  ActivityIndicator,
  Share,
} from 'react-native'
import { useTheme } from '@/src/theme'
import { useOverlay } from '@/src/components/overlay'
import { getPeer, rotatePeerKeys } from '@/src/lib/vpn'

interface Props {
  visible: boolean
  peerId: string | null
  peerName: string
  peerIp: string
  onClose: () => void
  onDelete?: () => void
}

export function PeerConfigModal({ visible, peerId, peerName, peerIp, onClose, onDelete }: Props) {
  const { theme } = useTheme()
  const c = theme.colors
  const overlay = useOverlay()
  const [qrUri, setQrUri] = useState<string>('')
  const [config, setConfig] = useState<string>('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!visible || !peerId) return
    setLoading(true)
    let cancelled = false
    ;(async () => {
      try {
        const [qrRes, confRes] = await Promise.all([
          getPeer(peerId, 'qr'),
          getPeer(peerId, 'conf'),
        ])
        if (!cancelled) {
          setQrUri(qrRes as string)
          setConfig(confRes as string)
        }
      } catch (err) {
        console.error('Failed to load peer config:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [visible, peerId])

  const handleCopyConfig = async () => {
    if (!config) return
    try {
      const Clipboard = require('expo-clipboard')
      await Clipboard.setStringAsync(config)
      overlay.toast('Config copied to clipboard', 'success')
    } catch (err) {
      console.error('Failed to copy:', err)
      overlay.toast('Failed to copy config', 'error')
    }
  }

  // Secrets must never sit readable on screen: the preview redacts key
  // material (the QR still encodes the full config for scanning).
  const redactedConfig = config.replace(
    /^(PrivateKey|PresharedKey)\s*=\s*.+$/gim,
    '$1 = •••••••• (hidden)',
  )

  const clearSecrets = () => {
    setConfig('')
    setQrUri('')
  }

  const handleClose = () => {
    clearSecrets()
    onClose()
  }

  const handleReissueKeys = async () => {
    if (!peerId) return
    const ok = await overlay.confirm({
      title: 'Reissue keys?',
      message:
        'This generates a brand-new keypair. The old config stops ' +
        'working immediately — update WireGuard on this device right away.',
      confirmText: 'Reissue',
    })
    if (!ok) return
    setLoading(true)
    try {
      const res = await rotatePeerKeys(peerId)
      if (res.qr_code) setQrUri(res.qr_code)
      if (res.config) setConfig(res.config)
      overlay.toast('Keys reissued — update this device now', 'success')
    } catch (err: any) {
      overlay.toast(err?.response?.data?.detail ?? 'Failed to reissue keys', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleShareConfig = async () => {
    if (!config) return
    const ok = await overlay.confirm({
      title: 'Share VPN config?',
      message:
        'This file contains this device\u2019s secret WireGuard keys. ' +
        'Anyone with it can use your VPN. Send it only to your own device.',
      confirmText: 'Share',
    })
    if (!ok) return
    await Share.share({
      message: config,
      title: `${peerName}.conf`,
    })
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' }}>
        <View
          style={{
            backgroundColor: c.bg2,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            maxHeight: '85%',
            borderWidth: 1,
            borderColor: c.border,
          }}
        >
          {/* Header */}
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: 16,
              borderBottomWidth: 1,
              borderBottomColor: c.border,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.text, fontSize: 16, fontWeight: '700' }}>
                {peerName}
              </Text>
              <Text style={{ color: c.text2, fontSize: 12, marginTop: 2 }}>
                {peerIp}
              </Text>
            </View>
            <TouchableOpacity onPress={handleClose} hitSlop={12}>
              <Text style={{ color: c.text2, fontSize: 20, fontWeight: '600' }}>×</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16 }}>
            {loading ? (
              <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                <ActivityIndicator size="large" color={c.accent} />
                <Text style={{ color: c.text2, fontSize: 13, marginTop: 12 }}>Loading config...</Text>
              </View>
            ) : (
              <>
                {/* QR Code */}
                {qrUri ? (
                  <View
                    style={{
                      backgroundColor: '#fff',
                      borderRadius: 16,
                      padding: 16,
                      alignItems: 'center',
                      marginBottom: 16,
                    }}
                  >
                    <Image
                      source={{ uri: qrUri }}
                      style={{ width: 220, height: 220 }}
                      resizeMode="contain"
                    />
                    <Text style={{ color: '#333', fontSize: 12, marginTop: 10, fontFamily: 'Menlo' }}>
                      Scan in WireGuard app
                    </Text>
                  </View>
                ) : (
                  <View
                    style={{
                      backgroundColor: c.bg,
                      borderRadius: 16,
                      padding: 32,
                      alignItems: 'center',
                      marginBottom: 16,
                    }}
                  >
                    <Text style={{ color: c.text2, fontSize: 13 }}>QR code unavailable</Text>
                  </View>
                )}

                {/* Config text preview */}
                {config ? (
                  <View
                    style={{
                      backgroundColor: c.bg,
                      borderRadius: 12,
                      padding: 12,
                      marginBottom: 16,
                      borderWidth: 1,
                      borderColor: c.border,
                    }}
                  >
                    <Text
                      style={{
                        color: c.text2,
                        fontSize: 11,
                        fontFamily: 'Menlo',
                        lineHeight: 16,
                      }}
                      numberOfLines={6}
                    >
                      {redactedConfig}
                    </Text>
                  </View>
                ) : null}

                {/* Action buttons */}
                <View style={{ gap: 10 }}>
                  <TouchableOpacity
                    onPress={handleCopyConfig}
                    style={{
                      backgroundColor: c.accent + '15',
                      borderRadius: 12,
                      paddingVertical: 14,
                      paddingHorizontal: 16,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: 1,
                      borderColor: c.accent,
                    }}
                  >
                    <Text style={{ color: c.accent, fontSize: 14, fontWeight: '600' }}>
                      Copy Config
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={handleShareConfig}
                    style={{
                      backgroundColor: c.bg,
                      borderRadius: 12,
                      paddingVertical: 14,
                      paddingHorizontal: 16,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: 1,
                      borderColor: c.border,
                    }}
                  >
                    <Text style={{ color: c.text, fontSize: 14, fontWeight: '600' }}>
                      Share / Send to Device
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={handleReissueKeys}
                    style={{
                      backgroundColor: c.bg,
                      borderRadius: 12,
                      paddingVertical: 14,
                      paddingHorizontal: 16,
                      alignItems: 'center',
                      borderWidth: 1,
                      borderColor: c.border,
                    }}
                  >
                    <Text style={{ color: c.text, fontSize: 14, fontWeight: '600' }}>
                      Reissue Keys
                    </Text>
                  </TouchableOpacity>

                  {onDelete && (
                    <TouchableOpacity
                      onPress={() => {
                        handleClose()
                        onDelete()
                      }}
                      style={{
                        borderRadius: 12,
                        paddingVertical: 14,
                        paddingHorizontal: 16,
                        alignItems: 'center',
                        borderWidth: 1,
                        borderColor: c.danger + '40',
                      }}
                    >
                      <Text style={{ color: c.danger, fontSize: 14, fontWeight: '600' }}>
                        Remove Device
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}
