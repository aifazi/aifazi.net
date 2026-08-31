/**
 * src/lib/vpn.ts — WireGuard VPN client API
 *
 * Manages VPN peers through the backend API. Handles device creation,
 * QR code generation, key rotation, session tracking, and connection status.
 */
import { api } from './api'

export interface VpnPeer {
  id: string
  device_name: string
  device_os: string
  allocated_ip: string
  status: string
  created_at: string
  last_connected_at?: string
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

export interface VpnSession {
  id: string
  peer_id: string
  device_name: string
  connected_at: string
  disconnected_at: string | null
  client_public_ip: string
  bytes_rx: number
  bytes_tx: number
}

export interface PublicIpResponse {
  ip: string
}

export async function getVpnStatus(): Promise<VpnStatus> {
  const res = await api.get('/vpn/status')
  return res.data
}

export async function listPeers(): Promise<VpnPeer[]> {
  const res = await api.get('/vpn/peers')
  return res.data.peers ?? []
}

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

export async function getPeer(
  peerId: string,
  format: 'json' | 'qr' | 'conf' = 'json',
): Promise<PeerDetail | string> {
  if (format === 'json') {
    const res = await api.get(`/vpn/peers/${peerId}?format=json`)
    return res.data
  }
  const res = await api.get(`/vpn/peers/${peerId}?format=${format}`, {
    responseType: format === 'conf' ? 'text' : 'blob',
  })
  if (format === 'conf') return res.data
  const blob = res.data as Blob
  return new Promise<string>((resolve) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.readAsDataURL(blob)
  })
}

export async function deletePeer(peerId: string): Promise<void> {
  await api.delete(`/vpn/peers/${peerId}`)
}

export async function rotatePeerKeys(
  peerId: string,
): Promise<{ config: string; qr_code: string }> {
  const res = await api.post(`/vpn/peers/${peerId}/rotate`)
  return res.data
}

export async function getVpnStats(): Promise<VpnStats> {
  const res = await api.get('/vpn/stats')
  return res.data
}

export async function startVpnSession(
  peerId: string,
  clientPublicIp: string = '',
): Promise<{ id: string; connected_at: string }> {
  const res = await api.post('/vpn/sessions', {
    peer_id: peerId,
    client_public_ip: clientPublicIp,
  })
  return res.data
}

export async function endVpnSession(
  sessionId: string,
): Promise<{ id: string; disconnected_at: string }> {
  const res = await api.post(`/vpn/sessions/${sessionId}/end`)
  return res.data
}

export async function listVpnSessions(
  limit: number = 20,
  offset: number = 0,
): Promise<{ sessions: VpnSession[] }> {
  const res = await api.get('/vpn/sessions', {
    params: { limit, offset },
  })
  return res.data
}

export async function getPublicIp(): Promise<PublicIpResponse> {
  const res = await api.get('/vpn/public-ip')
  return res.data
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return `${h}h ${m}m`
}

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
