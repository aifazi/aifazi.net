'use client'
import { useState, useEffect, useCallback } from 'react'
import { useForum } from '../context/ForumContext'
import ForumProfile from './ForumProfile'
import TrackOrderWidget from '../components/TrackOrderWidget'
import { Card, NeonButton, Badge } from '../components/community'
import api from '@/lib/api'

const G = 'var(--green)', C = 'var(--cyan)'

function VpnSection({ user }) {
  const [peers, setPeers] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [selectedPeer, setSelectedPeer] = useState(null)
  const [qrCode, setQrCode] = useState('')
  const [config, setConfig] = useState('')
  const [copied, setCopied] = useState(false)

  const loadPeers = useCallback(async () => {
    try {
      const res = await api.get('/vpn/peers')
      setPeers(res.data.peers || [])
    } catch (err) {
      console.error('Failed to load VPN peers:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { if (user) loadPeers() }, [user, loadPeers])

  const handleCreate = async () => {
    if (creating || peers.length >= 5) return
    const name = `Web — ${user?.username || 'User'}`
    setCreating(true)
    try {
      const res = await api.post('/vpn/peers', { device_name: name, device_os: 'linux' })
      await loadPeers()
      setSelectedPeer(res.data)
    } catch (err) {
      alert(err?.response?.data?.detail || 'Failed to create device')
    } finally {
      setCreating(false)
    }
  }

  const handleShowConfig = async (peer) => {
    setSelectedPeer(peer)
    setQrCode('')
    setConfig('')
    try {
      const [qrRes, confRes] = await Promise.all([
        api.get(`/vpn/peers/${peer.id}?format=qr`, { responseType: 'blob' }).catch(() => null),
        api.get(`/vpn/peers/${peer.id}?format=conf`, { responseType: 'text' }).catch(() => null),
      ])
      if (qrRes?.data) {
        setQrCode(URL.createObjectURL(new Blob([qrRes.data], { type: 'image/png' })))
      }
      if (confRes?.data) setConfig(confRes.data)
    } catch {}
  }

  const handleCopyConfig = async () => {
    if (!config) return
    try {
      await navigator.clipboard.writeText(config)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  const handleDownloadConf = () => {
    if (!config || !selectedPeer) return
    const blob = new Blob([config], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${selectedPeer.device_name || 'vpn'}.conf`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleDelete = async (peer) => {
    if (!confirm(`Remove "${peer.device_name}"?`)) return
    try {
      await api.delete(`/vpn/peers/${peer.id}`)
      setSelectedPeer(null)
      loadPeers()
    } catch (err) {
      alert(err?.response?.data?.detail || 'Failed to delete device')
    }
  }

  if (!user) return null

  return (
    <div style={{ marginTop: 32 }}>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(18px, 2.5vw, 24px)', fontWeight: 700, color: 'var(--text)', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 22 }}>🔒</span> VPN Devices
      </h2>

      {/* Device list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {loading ? (
          <Card style={{ padding: 18, textAlign: 'center', color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>Loading...</Card>
        ) : peers.length === 0 ? (
          <Card style={{ padding: 18, textAlign: 'center', color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
            No VPN devices yet. Create one to get your WireGuard config.
          </Card>
        ) : (
          peers.map((p) => (
            <Card key={p.id} hover style={{ padding: '14px 18px', cursor: 'pointer', borderColor: selectedPeer?.id === p.id ? C : undefined }}
              onClick={() => handleShowConfig(p)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: p.connected ? `color-mix(in srgb, ${G} 15%, transparent)` : 'var(--bg2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                  {p.device_os === 'ios' ? '📱' : p.device_os === 'android' ? '🤖' : p.device_os === 'windows' ? '🪟' : '💻'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {p.device_name}
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                    {p.allocated_ip} · {p.connected ? <span style={{ color: G }}>Connected</span> : 'Offline'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 12, fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                  <span style={{ color: G }}>↓ {formatBytes(p.transfer_rx)}</span>
                  <span style={{ color: '#a855f7' }}>↑ {formatBytes(p.transfer_tx)}</span>
                </div>
                <NeonButton size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); handleShowConfig(p) }}>
                  QR
                </NeonButton>
              </div>
            </Card>
          ))
        )}
      </div>

      {/* Create button */}
      <NeonButton onClick={handleCreate} disabled={creating || peers.length >= 5} size="sm" variant="ghost">
        {creating ? 'Creating...' : peers.length >= 5 ? 'Max devices reached' : '+ Add Device'}
      </NeonButton>

      {/* QR + Config modal */}
      {selectedPeer && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => setSelectedPeer(null)}>
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, maxWidth: 420, width: '90%', maxHeight: '85vh', overflow: 'auto' }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{selectedPeer.device_name}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{selectedPeer.allocated_ip}</div>
              </div>
              <button onClick={() => setSelectedPeer(null)} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 20, cursor: 'pointer' }}>×</button>
            </div>

            {qrCode ? (
              <div style={{ background: '#fff', borderRadius: 12, padding: 16, textAlign: 'center', marginBottom: 16 }}>
                <img src={qrCode} alt="WireGuard QR" style={{ width: 220, height: 220, imageRendering: 'pixelated' }} />
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#333', marginTop: 8 }}>Scan in WireGuard app</div>
              </div>
            ) : (
              <div style={{ background: 'var(--bg)', borderRadius: 12, padding: 32, textAlign: 'center', marginBottom: 16, color: 'var(--muted)', fontSize: 13 }}>
                Loading QR code...
              </div>
            )}

            {config && (
              <pre style={{ background: 'var(--bg)', borderRadius: 8, padding: 12, fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--muted)', overflow: 'auto', maxHeight: 120, marginBottom: 16, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {config}
              </pre>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <NeonButton onClick={handleCopyConfig} size="sm" variant="ghost" style={{ flex: 1 }}>
                {copied ? 'Copied!' : 'Copy Config'}
              </NeonButton>
              <NeonButton onClick={handleDownloadConf} size="sm" variant="ghost" style={{ flex: 1 }}>
                Download .conf
              </NeonButton>
            </div>
            <NeonButton onClick={() => handleDelete(selectedPeer)} size="sm" variant="ghost"
              style={{ width: '100%', marginTop: 8, borderColor: 'rgba(255,80,80,0.3)', color: 'rgba(255,80,80,0.8)' }}>
              Remove Device
            </NeonButton>
          </div>
        </div>
      )}
    </div>
  )
}

function formatBytes(bytes) {
  if (!bytes) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

export default function UnifiedProfile() {
  const { user } = useForum()
  const [orders, setOrders] = useState([])
  const [downloads, setDownloads] = useState([])

  useEffect(() => {
    if (!user) return
    Promise.all([
      api.get('/store/orders').then(r => r.data || []).catch(() => []),
      api.get('/store/downloads').then(r => r.data || []).catch(() => []),
    ]).then(([o, d]) => {
      setOrders((o || []).slice(0, 3))
      setDownloads((d || []).slice(0, 3))
    })
  }, [user])

  return (
    <div>
      <ForumProfile />

      {/* Store quick-access widgets */}
      {user && (
        <div className="store-widgets" style={{
          width: 'min(1180px, calc(100vw - 32px))', margin: '0 auto',
          padding: '0 clamp(16px, 3vw, 48px) 60px',
        }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr',
            gap: 24, marginTop: 40, alignItems: 'start',
          }}>
            {/* Track Order */}
            <div>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(18px, 2.5vw, 24px)', fontWeight: 700, color: 'var(--text)', margin: '0 0 16px' }}>
                Track an Order
              </h2>
              <TrackOrderWidget />
            </div>

            {/* Quick Stats */}
            <div>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(18px, 2.5vw, 24px)', fontWeight: 700, color: 'var(--text)', margin: '0 0 16px' }}>
                Store Activity
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <Card style={{ padding: 18, display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: `color-mix(in srgb, ${G} 12%, transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>📦</div>
                  <div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', letterSpacing: 2 }}>ORDERS</div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: G }}>{orders.length}</div>
                  </div>
                </Card>
                <Card style={{ padding: 18, display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: `color-mix(in srgb, ${C} 12%, transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>⬇</div>
                  <div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', letterSpacing: 2 }}>DOWNLOADS</div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: C }}>{downloads.length}</div>
                  </div>
                </Card>
                <NeonButton to="/store/?tab=orders" variant="ghost" size="sm">
                  View Full Account →
                </NeonButton>
              </div>
            </div>
          </div>

          {/* Orders preview */}
          {orders.length > 0 && (
            <div style={{ marginTop: 32 }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(18px, 2.5vw, 24px)', fontWeight: 700, color: 'var(--text)', margin: '0 0 16px' }}>
                Recent Orders
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {orders.map(o => {
                  const total = (o.total_cents || 0) / 100
                  return (
                    <Card key={o.id} hover style={{ padding: '14px 18px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: C, flexShrink: 0 }}>
                          #{o.order_number}
                        </span>
                        <span style={{ flex: 1, fontSize: 12, color: 'var(--muted)' }}>
                          {new Date(o.created_at).toLocaleDateString()}
                        </span>
                        <Badge tone={o.status === 'delivered' ? 'green' : o.status === 'cancelled' ? 'red' : 'cyan'}>
                          {(o.status || '').toUpperCase()}
                        </Badge>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                          ${total.toFixed(2)}
                        </span>
                      </div>
                    </Card>
                  )
                })}
              </div>
            </div>
          )}

          <VpnSection user={user} />

          <style>{`
            @media (max-width: 768px) {
              .store-widgets > div > div { grid-template-columns: 1fr !important; }
            }
          `}</style>
        </div>
      )}
    </div>
  )
}
