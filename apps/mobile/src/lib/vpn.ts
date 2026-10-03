/**
 * src/lib/vpn.ts — WireGuard VPN client API
 *
 * Manages VPN peers through the backend API. Handles device creation,
 * QR code generation, key rotation, session tracking, and connection status.
 *
 * SECRET HANDLING: peer configs embed private WireGuard keys. Never log them
 * (no console.log of config/key material), never persist them to AsyncStorage
 * or any cache — they live in component state only and are cleared on close.
 * The copy-to-clipboard action auto-clears after 60s (see PeerConfigModal).
 */
import { Linking, Platform } from 'react-native'
import { api } from './api'

export interface VpnPeer {
  id: string
  device_name: string
  device_os: string
  allocated_ip: string
  allocated_ipv6?: string | null
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
  subnet_v6?: string
  dualstack?: boolean
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
  allocated_ipv6?: string | null
  config: string
  qr_code: string
  status: string
}

export interface PeerDetail {
  id: string
  device_name: string
  device_os: string
  allocated_ip: string
  allocated_ipv6?: string | null
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
  const encodedId = encodeURIComponent(peerId)
  if (format === 'json') {
    const res = await api.get(`/vpn/peers/${encodedId}?format=json`)
    return res.data
  }
  const res = await api.get(`/vpn/peers/${encodedId}?format=${format}`, {
    responseType: format === 'conf' ? 'text' : 'blob',
  })
  if (format === 'conf') return res.data
  const blob = res.data as Blob
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Failed to read QR code image'))
    reader.onloadend = () => resolve(reader.result as string)
    try {
      reader.readAsDataURL(blob)
    } catch (err) {
      reject(err instanceof Error ? err : new Error('Failed to read QR code image'))
    }
  })
}

export async function deletePeer(peerId: string): Promise<void> {
  await api.delete(`/vpn/peers/${encodeURIComponent(peerId)}`)
}

export async function rotatePeerKeys(
  peerId: string,
): Promise<{ config: string; qr_code: string }> {
  const res = await api.post(`/vpn/peers/${encodeURIComponent(peerId)}/rotate`)
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
  const res = await api.post(`/vpn/sessions/${encodeURIComponent(sessionId)}/end`)
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

/**
 * M3.2 — derive the dashboard connection state from LIVE peer data instead
 * of the old one-shot (and hard-coded 'disconnected') value.
 *   - any peer with `connected === true` → 'connected'
 *   - a peer connected within the last 90s (flapping / just dropped) → 'connecting'
 *   - otherwise → 'disconnected'
 */
export function deriveConnectionState(
  peers: Pick<VpnPeer, 'connected' | 'last_connected_at'>[],
  now: number = Date.now(),
): 'disconnected' | 'connecting' | 'connected' {
  if (peers.some((p) => p.connected)) return 'connected'
  const recent = peers.some((p) => {
    if (!p.last_connected_at) return false
    const then = new Date(p.last_connected_at).getTime()
    return Number.isFinite(then) && now - then < 90_000
  })
  return recent ? 'connecting' : 'disconnected'
}

// M3.3 — WireGuard app handoff. The actual tunnel lives in the user's native
// WireGuard app; we only deep-link to it (falling back to the store page).
export const WIREGUARD_DEEP_LINK = 'wireguard://'

export function wireGuardStoreUrl(os: string): string {
  if (os === 'ios') return 'https://apps.apple.com/app/wireguard/id1451685525'
  return 'https://play.google.com/store/apps/details?id=com.wireguard.android'
}

/**
 * Open the WireGuard app. Tries the `wireguard://` deep link first; when the
 * scheme is not registered (app not installed / no scheme) falls back to the
 * store page. Returns which path was taken ('none' when both failed).
 */
export async function openWireGuardApp(
  os: string,
  openUrl: (url: string) => Promise<boolean> = async (url) => {
    try {
      if (!Linking?.canOpenURL || !(await Linking.canOpenURL(url))) return false
      await Linking.openURL(url)
      return true
    } catch {
      return false
    }
  },
): Promise<'deep-link' | 'store' | 'none'> {
  if (await openUrl(WIREGUARD_DEEP_LINK)) return 'deep-link'
  if (await openUrl(wireGuardStoreUrl(os))) return 'store'
  return 'none'
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
  switch (Platform.OS) {
    case 'ios':
      return 'ios'
    case 'android':
      return 'android'
    default:
      return 'unknown'
  }
}
