'use client'
import React, { useState, useEffect, useCallback } from 'react'
import api from '@/lib/api'
import { useToast } from '../../components/Toast'
import { useDialog } from '../../components/Dialog'
import { usePausableInterval } from '../../hooks/usePausableInterval'
import { S, useIsMobile, PageHeader, PanelErrorBoundary } from './shared'
import { StatCard, Badge, Btn, EmptyState, Skeleton, Modal, Pagination } from './ui'

/* ─────────────────────────────────────────────────────────────────────────────
   VPN Admin Panel — Manage all WireGuard peers, sessions, and server status.
───────────────────────────────────────────────────────────────────────────── */

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

function formatTimeAgo(ts) {
  if (!ts) return '—'
  const diff = Date.now() - new Date(ts).getTime()
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}

const OS_ICONS = { ios: '📱', android: '🤖', windows: '💻', macos: '🍎', linux: '🐧', unknown: '❓' }

function VpnPanelInner() {
  const { toast } = useToast()
  const { confirm } = useDialog()
  const isMobile = useIsMobile()

  const [peers, setPeers] = useState([])
  const [sessions, setSessions] = useState([])
  const [serverStatus, setServerStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('peers')
  const [search, setSearch] = useState('')
  const [selectedPeer, setSelectedPeer] = useState(null)

  const load = useCallback(async () => {
    try {
      const [peersRes, statusRes, sessionsRes] = await Promise.allSettled([
        api.get('/vpn/admin/all-peers'),
        api.get('/vpn/status'),
        api.get('/vpn/admin/sessions'),
      ])
      if (peersRes.status === 'fulfilled') setPeers(peersRes.value.data?.peers || [])
      if (statusRes.status === 'fulfilled') setServerStatus(statusRes.value.data)
      if (sessionsRes.status === 'fulfilled') setSessions(sessionsRes.value.data?.sessions || [])
    } catch (err) {
      console.error('VPN load error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const [peersRes, statusRes, sessionsRes] = await Promise.allSettled([
          api.get('/vpn/admin/all-peers'),
          api.get('/vpn/status'),
          api.get('/vpn/admin/sessions'),
        ])
        if (!cancelled) {
          if (peersRes.status === 'fulfilled') setPeers(peersRes.value.data?.peers || [])
          if (statusRes.status === 'fulfilled') setServerStatus(statusRes.value.data)
          if (sessionsRes.status === 'fulfilled') setSessions(sessionsRes.value.data?.sessions || [])
        }
      } catch (err) {
        console.error('VPN load error:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [])
  usePausableInterval(load, 30000)

  const handleDeletePeer = useCallback(async (peer) => {
    const ok = await confirm({
      title: 'Delete VPN Peer',
      message: `Remove "${peer.device_name}" (${peer.allocated_ip})? This will disconnect the VPN on this device.`,
      confirmText: 'Delete',
      destructive: true,
    })
    if (!ok) return
    try {
      await api.delete(`/vpn/admin/peers/${peer.id}`)
      toast({ title: 'Peer deleted', type: 'success' })
      load()
    } catch (err) {
      toast({ title: 'Failed to delete peer', type: 'error' })
    }
  }, [confirm, toast, load])

  const handleDeleteSession = useCallback(async (session) => {
    const ok = await confirm({
      title: 'Delete Session',
      message: `Remove session for "${session.device_name}"?`,
      confirmText: 'Delete',
      destructive: true,
    })
    if (!ok) return
    try {
      await api.delete(`/vpn/sessions/${session.id}`)
      toast({ title: 'Session deleted', type: 'success' })
      load()
    } catch (err) {
      toast({ title: 'Failed to delete session', type: 'error' })
    }
  }, [confirm, toast, load])

  // Filter peers by search
  const filteredPeers = peers.filter(p => {
    if (!search) return true
    const q = search.toLowerCase()
    return (p.device_name || '').toLowerCase().includes(q) ||
           (p.allocated_ip || '').includes(q) ||
           (p.user_id || '').toLowerCase().includes(q) ||
           (p.device_os || '').toLowerCase().includes(q)
  })

  // Stats
  const totalPeers = peers.length
  const connectedPeers = peers.filter(p => p.connected).length
  const totalRx = peers.reduce((sum, p) => sum + (p.transfer_rx || 0), 0)
  const totalTx = peers.reduce((sum, p) => sum + (p.transfer_tx || 0), 0)

  if (loading) {
    return (
      <div style={{ padding: S.mainPad }}>
        <PageHeader eyebrow="VPN" title="WireGuard VPN" subtitle="Manage VPN peers and sessions" />
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
          {[1,2,3,4].map(i => <Skeleton key={i} style={{ height: 80, borderRadius: 12 }} />)}
        </div>
        <Skeleton style={{ height: 400, borderRadius: 12 }} />
      </div>
    )
  }

  return (
    <div style={{ padding: S.mainPad }}>
      <PageHeader
        eyebrow="VPN"
        title="WireGuard VPN"
        subtitle={`Server: ${serverStatus?.endpoint || '—'} · Subnet: ${serverStatus?.subnet || '—'}`}
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Badge color={serverStatus?.server_running ? 'green' : 'red'}>
              {serverStatus?.server_running ? 'Online' : 'Offline'}
            </Badge>
          </div>
        }
      />

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        <StatCard label="Total Peers" value={totalPeers} color="var(--green)" />
        <StatCard label="Connected" value={connectedPeers} color={connectedPeers > 0 ? 'var(--cyan)' : 'var(--muted)'} />
        <StatCard label="Total Download" value={formatBytes(totalRx)} color="var(--green)" />
        <StatCard label="Total Upload" value={formatBytes(totalTx)} color="var(--cyan)" />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: `1px solid var(--border)`, paddingBottom: 0 }}>
        {[
          { key: 'peers', label: `Peers (${totalPeers})` },
          { key: 'sessions', label: `Sessions (${sessions.length})` },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ padding: '8px 16px', background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: tab === t.key ? 600 : 400,
              color: tab === t.key ? 'var(--green)' : 'var(--muted)',
              borderBottom: tab === t.key ? '2px solid var(--green)' : '2px solid transparent',
              fontFamily: 'var(--font-mono)', letterSpacing: 0.5, transition: 'all 0.15s' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Search */}
      {tab === 'peers' && (
        <div style={{ marginBottom: 16 }}>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, IP, user, OS..."
            style={{ ...S.input, width: isMobile ? '100%' : 320 }} />
        </div>
      )}

      {/* Peers tab */}
      {tab === 'peers' && (
        <div>
          {filteredPeers.length === 0 ? (
            <EmptyState icon="🔒" title="No VPN peers found" hint={search ? 'Try a different search' : 'No devices have connected yet'} />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Device', 'IP', 'OS', 'Status', 'Traffic', 'Last Seen', 'Actions'].map(h => (
                      <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: 'var(--muted)',
                        fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
                        letterSpacing: 0.8, textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredPeers.map(p => (
                    <tr key={p.id} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer',
                      background: selectedPeer?.id === p.id ? 'rgba(var(--green-rgb,0,255,136),0.06)' : 'transparent',
                      transition: 'background 0.15s' }}
                      onClick={() => setSelectedPeer(selectedPeer?.id === p.id ? null : p)}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                      onMouseLeave={e => e.currentTarget.style.background = selectedPeer?.id === p.id ? 'rgba(var(--green-rgb,0,255,136),0.06)' : 'transparent'}>
                      <td style={tdStyle}>
                        <span style={{ marginRight: 6 }}>{OS_ICONS[p.device_os] || '❓'}</span>
                        {p.device_name}
                      </td>
                      <td style={{ ...tdStyle, fontFamily: 'var(--font-mono)' }}>{p.allocated_ip}</td>
                      <td style={tdStyle}>{p.device_os || '—'}</td>
                      <td style={tdStyle}>
                        <Badge color={p.connected ? 'green' : 'muted'}>{p.connected ? 'Connected' : 'Offline'}</Badge>
                      </td>
                      <td style={{ ...tdStyle, fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                        ↓ {formatBytes(p.transfer_rx)} / ↑ {formatBytes(p.transfer_tx)}
                      </td>
                      <td style={tdStyle}>{/^\d+(\.\d+)?$/.test(String(p.latest_handshake ?? '')) ? formatTimeAgo(new Date(Number(p.latest_handshake) * 1000).toISOString()) : (p.latest_handshake && p.latest_handshake !== '(none)' ? `${p.latest_handshake}` : formatTimeAgo(p.created_at))}</td>
                      <td style={tdStyle}>
                        <button onClick={(e) => { e.stopPropagation(); handleDeletePeer(p) }}
                          style={{ ...S.btn('var(--red)', '#fff'), padding: '4px 10px', fontSize: 11 }}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Sessions tab */}
      {tab === 'sessions' && (
        <div>
          {sessions.length === 0 ? (
            <EmptyState icon="📋" title="No sessions recorded" hint="VPN sessions will appear here once peers connect" />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Device', 'User ID', 'Client IP', 'Connected', 'Ended', 'Actions'].map(h => (
                      <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: 'var(--muted)',
                        fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
                        letterSpacing: 0.8, textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sessions.map(s => (
                    <tr key={s.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={tdStyle}>{s.device_name || '—'}</td>
                      <td style={{ ...tdStyle, fontFamily: 'var(--font-mono)', fontSize: 11, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {s.user_id || '—'}
                      </td>
                      <td style={{ ...tdStyle, fontFamily: 'var(--font-mono)' }}>{s.client_public_ip || '—'}</td>
                      <td style={tdStyle}>{formatTimeAgo(s.connected_at)}</td>
                      <td style={tdStyle}>{s.disconnected_at ? formatTimeAgo(s.disconnected_at) : <Badge color="green">Active</Badge>}</td>
                      <td style={tdStyle}>
                        <button onClick={() => handleDeleteSession(s)}
                          style={{ ...S.btn('var(--red)', '#fff'), padding: '4px 10px', fontSize: 11 }}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Peer detail modal */}
      {selectedPeer && (
        <Modal onClose={() => setSelectedPeer(null)} title={selectedPeer.device_name}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, padding: '0 4px' }}>
            <div>
              <div style={labelStyle}>IP Address</div>
              <div style={valueStyle}>{selectedPeer.allocated_ip}</div>
            </div>
            <div>
              <div style={labelStyle}>Status</div>
              <Badge color={selectedPeer.connected ? 'green' : 'muted'}>{selectedPeer.connected ? 'Connected' : 'Offline'}</Badge>
            </div>
            <div>
              <div style={labelStyle}>OS</div>
              <div style={valueStyle}>{selectedPeer.device_os || 'Unknown'}</div>
            </div>
            <div>
              <div style={labelStyle}>Created</div>
              <div style={valueStyle}>{formatTimeAgo(selectedPeer.created_at)}</div>
            </div>
            <div>
              <div style={labelStyle}>Download</div>
              <div style={valueStyle}>{formatBytes(selectedPeer.transfer_rx)}</div>
            </div>
            <div>
              <div style={labelStyle}>Upload</div>
              <div style={valueStyle}>{formatBytes(selectedPeer.transfer_tx)}</div>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={labelStyle}>User ID</div>
              <div style={{ ...valueStyle, fontFamily: 'var(--font-mono)', fontSize: 11, wordBreak: 'break-all' }}>{selectedPeer.user_id}</div>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={labelStyle}>Public Key</div>
              <div style={{ ...valueStyle, fontFamily: 'var(--font-mono)', fontSize: 11, wordBreak: 'break-all' }}>{selectedPeer.public_key}</div>
            </div>
          </div>
          <div style={{ marginTop: 20, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Btn label="Close" variant="ghost" onClick={() => setSelectedPeer(null)} />
            <Btn label="Delete Peer" variant="solid" color="var(--red)" textColor="#fff" onClick={() => { handleDeletePeer(selectedPeer); setSelectedPeer(null) }} />
          </div>
        </Modal>
      )}
    </div>
  )
}

const tdStyle = { padding: '10px 12px', color: 'var(--text)' }
const labelStyle = { fontSize: 10, fontWeight: 600, color: 'var(--muted)', fontFamily: 'var(--font-mono)', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 4 }
const valueStyle = { fontSize: 14, color: 'var(--text)', fontWeight: 500 }

export default function VpnPanel() {
  return (
    <PanelErrorBoundary name="VPN">
      <VpnPanelInner />
    </PanelErrorBoundary>
  )
}
