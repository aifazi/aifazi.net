/**
 * src/lib/vpn.ts — WireGuard VPN client API
 *
 * Manages VPN peers through the backend API. Handles device creation,
 * QR code generation, key rotation, and connection status tracking.
 */
import { api } from './api'

export interface VpnPeer {
  id: string
  device_name: string
  device_os: string
  allocated_ip: string
  status: string
  created_at: string
  transfer_rx: number
  transfer_tx: number
  connected: boolean
}

export interface VpnStatus {
  server_running: boolean
  server_public_key: string | null
  endpoint: string
  subnet: string
}

export interface VpnStats {
  peers: VpnPeer[]
  total_rx: number
  total_tx: number
}

export interface CreatePeerResult {
  id: string
  device_name: string
  allocated_ip: string
  config: string
  qr_code: string
  status: string
}

export interface PeerDetail {
  id: string
  device_name: string
  device_os: string
  allocated_ip: string
  status: string
  created_at: string
}

/**
 * Check if the WireGuard server is running
 */
export async function getVpnStatus(): Promise<VpnStatus> {
  const res = await api.get('/vpn/status')
  return res.data
}

/**
 * List all VPN devices/peers for the authenticated user
 */
export async function listPeers(): Promise<VpnPeer[]> {
  const res = await api.get('/vpn/peers')
  return res.data.peers ?? []
}

/**
 * Create a new VPN peer (device). Returns config + QR code.
 */
export async function createPeer(
  deviceName: string,
  deviceOs: string = '',
): Promise<CreatePeerResult> {
  const res = await api.post('/vpn/peers', {
    device_name: deviceName,
    device_os: deviceOs,
  })
  return res.data
}

/**
 * Get peer details. Use format='qr' for QR image, 'conf' for config file.
 */
export async function getPeer(
  peerId: string,
  format: 'json' | 'qr' | 'conf' = 'json',
): Promise<PeerDetail | string> {
  if (format === 'json') {
    const res = await api.get(`/vpn/peers/${peerId}?format=json`)
    return res.data
  }
  // For QR/conf, return the raw data URL or config string
  const res = await api.get(`/vpn/peers/${peerId}?format=${format}`, {
    responseType: format === 'conf' ? 'text' : 'blob',
  })
  if (format === 'conf') return res.data
  // QR code comes as a PNG blob — convert to data URL
  const blob = res.data as Blob
  return new Promise<string>((resolve) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.readAsDataURL(blob)
  })
}

/**
 * Delete a VPN peer
 */
export async function deletePeer(peerId: string): Promise<void> {
  await api.delete(`/vpn/peers/${peerId}`)
}

/**
 * Rotate a peer's WireGuard keypair
 */
export async function rotatePeerKeys(
  peerId: string,
): Promise<{ config: string; qr_code: string }> {
  const res = await api.post(`/vpn/peers/${peerId}/rotate`)
  return res.data
}

/**
 * Get traffic statistics for all user's peers
 */
export async function getVpnStats(): Promise<VpnStats> {
  const res = await api.get('/vpn/stats')
  return res.data
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

/**
 * Detect device OS from platform
 */
export function detectDeviceOs(): string {
  const { Platform } = require('react-native')
  switch (Platform.OS) {
    case 'ios':
      return 'ios'
    case 'android':
      return 'android'
    default:
      return 'unknown'
  }
}
