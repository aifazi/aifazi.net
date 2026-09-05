'use client'
import React, { useState, useEffect, useCallback, useRef } from 'react'
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
  const { confirm, prompt } = useDialog()
  const isMobile = useIsMobile()

  const [peers, setPeers] = useState([])
  const [sessions, setSessions] = useState([])
  const [serverStatus, setServerStatus] = useState(null)
  const [activity, setActivity] = useState([])
  const [monitorSvc, setMonitorSvc] = useState(null)
  const [rates, setRates] = useState({})
  const ratesRef = useRef({})
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('peers')
  const [search, setSearch] = useState('')
  const [selectedPeer, setSelectedPeer] = useState(null)
  const [peerActivity, setPeerActivity] = useState([])
  const [reissuedQr, setReissuedQr] = useState('')
  const [managing, setManaging] = useState(false)

  // Live up/down speed per peer, derived from cumulative WireGuard counters
  // across polls. Resets (host reboot) clamp to 0 instead of going negative.
  const updateRates = useCallback((list) => {
    const now = Date.now()
    const prev = ratesRef.current
    const next = {}
    const display = {}
    for (const p of list) {
      const cur = { rx: p.transfer_rx || 0, tx: p.transfer_tx || 0, at: now }
      const old = prev[p.id]
      if (old && now > old.at && p.connected) {
        const dt = (now - old.at) / 1000
        display[p.id] = {
          rxRate: Math.max(0, (cur.rx - old.rx) / dt),
          txRate: Math.max(0, (cur.tx - old.tx) / dt),
        }
      }
      next[p.id] = cur
    }
    ratesRef.current = next
    setRates(display)
  }, [])

  const load = useCallback(async () => {
    try {
      const [peersRes, statusRes, sessionsRes, activityRes, monitorRes] = await Promise.allSettled([
        api.get('/vpn/admin/all-peers'),
        api.get('/vpn/status'),
        api.get('/vpn/admin/sessions'),
        api.get('/vpn/admin/activity?days=7'),
        api.get('/monitor/status'),
      ])
      if (peersRes.status === 'fulfilled') {
        const list = peersRes.value.data?.peers || []
        setPeers(list)
        updateRates(list)
      }
      if (statusRes.status === 'fulfilled') setServerStatus(statusRes.value.data)
      if (sessionsRes.status === 'fulfilled') setSessions(sessionsRes.value.data?.sessions || [])
      if (activityRes.status === 'fulfilled') setActivity(activityRes.value.data?.days || [])
      if (monitorRes.status === 'fulfilled') {
        const svcs = monitorRes.value.data?.services || []
        setMonitorSvc(svcs.find(s => s.name === 'vpn') || null)
      }
    } catch (err) {
      console.error('VPN load error:', err)
    } finally {
      setLoading(false)
    }
  }, [updateRates])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const [peersRes, statusRes, sessionsRes, activityRes, monitorRes] = await Promise.allSettled([
          api.get('/vpn/admin/all-peers'),
          api.get('/vpn/status'),
          api.get('/vpn/admin/sessions'),
          api.get('/vpn/admin/activity?days=7'),
          api.get('/monitor/status'),
        ])
        if (!cancelled) {
          if (peersRes.status === 'fulfilled') {
            const list = peersRes.value.data?.peers || []
            setPeers(list)
            updateRates(list)
          }
          if (statusRes.status === 'fulfilled') setServerStatus(statusRes.value.data)
          if (sessionsRes.status === 'fulfilled') setSessions(sessionsRes.value.data?.sessions || [])
          if (activityRes.status === 'fulfilled') setActivity(activityRes.value.data?.days || [])
          if (monitorRes.status === 'fulfilled') {
            const svcs = monitorRes.value.data?.services || []
            setMonitorSvc(svcs.find(s => s.name === 'vpn') || null)
          }
        }
      } catch (err) {
        console.error('VPN load error:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [updateRates])
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
      toast.success('Peer deleted')
      load()
    } catch (err) {
      toast.error('Failed to delete peer')
    }
  }, [confirm, toast, load])

  const handleRenamePeer = useCallback(async (peer) => {
    const name = await prompt({
      title: 'Rename device',
      message: `New name for "${peer.device_name}" (${peer.allocated_ip})?`,
      defaultValue: peer.device_name,
      confirmText: 'Rename',
    })
    if (!name) return
    try {
      await api.patch(`/vpn/peers/${peer.id}`, { device_name: name })
      toast.success('Device renamed')
      if (selectedPeer?.id === peer.id) setSelectedPeer({ ...selectedPeer, device_name: name })
      load()
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to rename device')
    }
  }, [prompt, toast, load, selectedPeer])

  // Refresh the open detail modal from a fresh list fetch.
  const refreshSelected = useCallback(async (id) => {
    try {
      const res = await api.get('/vpn/admin/all-peers')
      const fresh = (res.data?.peers || []).find(p => p.id === id)
      if (fresh) setSelectedPeer(fresh)
    } catch {}
  }, [])

  const managePeer = useCallback(async (peer, patch, okMsg) => {
    setManaging(true)
    try {
      await api.patch(`/vpn/admin/peers/${peer.id}`, patch)
      toast.success(okMsg)
      await load()
      await refreshSelected(peer.id)
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Update failed')
    } finally {
      setManaging(false)
    }
  }, [toast, load, refreshSelected])

  const handleSetQuota = useCallback(async (peer) => {
    const currentMb = peer.quota_bytes ? Math.round(peer.quota_bytes / 1048576) : ''
    const answer = await prompt({
      title: 'Monthly quota',
      message: `Data cap in MB for "${peer.device_name}"? (0 = unlimited)`,
      defaultValue: String(currentMb),
      confirmText: 'Save',
    })
    if (answer === null) return
    const mb = Number(answer)
    if (!Number.isFinite(mb) || mb < 0) {
      toast.error('Enter a number of MB (0 for unlimited)')
      return
    }
    await managePeer(peer, { quota_bytes: Math.round(mb * 1048576) }, 'Quota saved')
  }, [prompt, toast, managePeer])

  const handleReissueKeys = useCallback(async (peer) => {
    const ok = await confirm({
      title: 'Reissue keys',
      message: `Generate a new keypair for "${peer.device_name}"? The old config stops working immediately — update the device right away.`,
      confirmText: 'Reissue',
      destructive: true,
    })
    if (!ok) return
    setManaging(true)
    try {
      const res = await api.post(`/vpn/peers/${peer.id}/rotate`)
      setReissuedQr(res.data?.qr_code || '')
      toast.success('Keys reissued — update the device now')
      await load()
      await refreshSelected(peer.id)
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to reissue keys')
    } finally {
      setManaging(false)
    }
  }, [confirm, toast, load, refreshSelected])

  const openPeer = useCallback((p) => {
    setSelectedPeer(p)
    setPeerActivity([])
    setReissuedQr('')
  }, [])

  const closePeer = useCallback(() => {
    setSelectedPeer(null)
    setPeerActivity([])
    setReissuedQr('')
  }, [])

  // Per-peer 7-day chart for the open detail modal (fetch only — resets
  // happen in openPeer/closePeer so no setState-in-effect lint trip).
  useEffect(() => {
    if (!selectedPeer?.id) return
    let cancelled = false
    api.get(`/vpn/admin/activity?days=7&peer_id=${selectedPeer.id}`)
      .then(r => { if (!cancelled) setPeerActivity(r.data?.days || []) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [selectedPeer?.id])

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
      toast.success('Session deleted')
      load()
    } catch (err) {
      toast.error('Failed to delete session')
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
          { key: 'monitor', label: 'Monitor' },
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
                      onClick={() => (selectedPeer?.id === p.id ? closePeer() : openPeer(p))}
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

      {/* Monitor tab */}
      {tab === 'monitor' && (
        <div>
          {/* Alerts */}
          {!serverStatus?.server_running && (
            <div style={{ background: 'rgba(255,71,87,0.08)', border: '1px solid var(--red)',
              borderRadius: 12, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: 'var(--red)' }}>
              ⚠️ WireGuard server is offline — no tunnels can connect. Check the host WireGuard service.
            </div>
          )}
          {serverStatus?.server_running && totalPeers > 0 && connectedPeers === 0 && (
            <div style={{ background: 'rgba(255,215,0,0.06)', border: '1px solid rgba(255,215,0,0.35)',
              borderRadius: 12, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#ffd700' }}>
              No peers currently connected — devices are configured but idle (or unreachable).
            </div>
          )}
          {monitorSvc && monitorSvc.status !== 'up' && (
            <div style={{ background: 'rgba(255,71,87,0.08)', border: '1px solid var(--red)',
              borderRadius: 12, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: 'var(--red)' }}>
              Uptime monitor reports VPN {monitorSvc.status}: {monitorSvc.detail || 'check the monitor tab'}
            </div>
          )}

          {/* Live now — connected devices only, one row per peer */}
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, letterSpacing: 0.8,
            textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 12 }}>
            Live now ({connectedPeers})
          </div>
          {connectedPeers === 0 ? (
            <div style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 24 }}>
              Nothing connected right now — rows appear here the moment a device handshakes.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 8, marginBottom: 24 }}>
              {peers.filter(p => p.connected).map(p => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12,
                  background: 'rgba(0,255,136,0.04)', border: '1px solid rgba(0,255,136,0.25)',
                  borderRadius: 10, padding: '10px 14px' }}>
                  <span style={{ width: 10, height: 10, borderRadius: 5, flexShrink: 0,
                    background: 'var(--green)', boxShadow: '0 0 8px var(--green)' }} />
                  <span style={{ color: 'var(--text)', fontSize: 13, fontWeight: 600, flex: 1 }}>
                    {p.device_name}
                    <span style={{ color: 'var(--muted)', fontWeight: 400 }}> · {p.allocated_ip}</span>
                    {p.endpoint ? <span style={{ color: 'var(--muted)', fontWeight: 400 }}> · {p.endpoint}</span> : null}
                  </span>
                  <span style={{ color: 'var(--green)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
                    ↓ {formatBytes(rates[p.id]?.rxRate || 0)}/s ↑ {formatBytes(rates[p.id]?.txRate || 0)}/s
                  </span>
                  <span style={{ color: 'var(--text2)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
                    Σ ↓ {formatBytes(p.transfer_rx)} ↑ {formatBytes(p.transfer_tx)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Server + monitor cards */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
            <StatCard label="Server" value={serverStatus?.server_running ? 'Online' : 'Offline'}
              color={serverStatus?.server_running ? 'var(--green)' : 'var(--red)'} />
            <StatCard label="Uptime Monitor" value={monitorSvc ? `${monitorSvc.status}${monitorSvc.uptime_24h != null ? ` · ${monitorSvc.uptime_24h}%/24h` : ''}` : '—'}
              color={monitorSvc?.status === 'up' ? 'var(--green)' : 'var(--muted)'} />
            <StatCard label="Monitor Detail" value={monitorSvc?.detail || serverStatus?.endpoint || '—'} color="var(--cyan)" />
          </div>

          {/* 7-day activity */}
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, letterSpacing: 0.8,
            textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 12 }}>
            Sessions per day (7d)
          </div>
          {activity.length === 0 ? (
            <EmptyState icon="📊" title="No activity yet" hint="Session history will chart here once peers connect" />
          ) : (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 140, marginBottom: 8 }}>
              {activity.map(d => {
                const max = Math.max(...activity.map(x => x.sessions), 1)
                const h = Math.max(6, Math.round((d.sessions / max) * 120))
                return (
                  <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    <div style={{ color: 'var(--text)', fontSize: 11, fontWeight: 600 }}>{d.sessions}</div>
                    <div title={`${d.date}: ${d.sessions} sessions, ↓ ${formatBytes(d.rx)} / ↑ ${formatBytes(d.tx)}`}
                      style={{ width: '100%', height: h, borderRadius: '6px 6px 2px 2px',
                        background: 'linear-gradient(180deg, var(--green), var(--cyan))', opacity: 0.85 }} />
                    <div style={{ color: 'var(--muted)', fontSize: 10, fontFamily: 'var(--font-mono)' }}>
                      {String(d.date).slice(5)}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Live peer freshness */}
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, letterSpacing: 0.8,
            textTransform: 'uppercase', color: 'var(--muted)', margin: '20px 0 12px' }}>
            Peer freshness (live)
          </div>
          {peers.length === 0 ? (
            <EmptyState icon="🔒" title="No peers" hint="Add a device to start monitoring" />
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {peers.map(p => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12,
                  background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px' }}>
                  <span style={{ width: 10, height: 10, borderRadius: 5, flexShrink: 0,
                    background: p.connected ? 'var(--green)' : 'var(--muted)',
                    boxShadow: p.connected ? '0 0 8px var(--green)' : 'none' }} />
                  <span style={{ color: 'var(--text)', fontSize: 13, fontWeight: 600, flex: 1 }}>
                    {p.device_name}
                    <span style={{ color: 'var(--muted)', fontWeight: 400 }}> · {p.allocated_ip}</span>
                  </span>
                  <span style={{ color: 'var(--muted)', fontSize: 12 }}>
                    {p.connected ? 'handshake live' : (p.latest_handshake && p.latest_handshake !== '(none)' ? `last: ${p.latest_handshake}` : 'never connected')}
                  </span>
                  <span style={{ color: 'var(--text2)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
                    ↓ {formatBytes(p.transfer_rx)} ↑ {formatBytes(p.transfer_tx)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Peer detail modal */}
      {selectedPeer && (
        <Modal onClose={closePeer} title={selectedPeer.device_name}>
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
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={labelStyle}>Expires</div>
              <div style={valueStyle}>
                {selectedPeer.expires_at
                  ? `${formatTimeAgo(selectedPeer.expires_at)}${selectedPeer.status === 'expired' ? ' — expired' : ''}`
                  : 'Never (permanent)'}
              </div>
            </div>
          </div>

          {/* Limits, expiry & alerts */}
          <div style={{ borderTop: '1px solid var(--border)', marginTop: 16, paddingTop: 16 }}>
            <div style={{ ...labelStyle, marginBottom: 8 }}>Monthly quota</div>
            {selectedPeer.quota_bytes ? (
              <div style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                  <span style={{ color: 'var(--text)' }}>
                    {formatBytes(selectedPeer.usage_month_rx_tx || 0)} of {formatBytes(selectedPeer.quota_bytes)}
                  </span>
                  <span style={{ color: (selectedPeer.usage_month_rx_tx || 0) >= selectedPeer.quota_bytes * 0.8 ? 'var(--red)' : 'var(--muted)' }}>
                    {Math.min(100, Math.round(((selectedPeer.usage_month_rx_tx || 0) / selectedPeer.quota_bytes) * 100))}%
                  </span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: 'var(--bg3)' }}>
                  <div style={{ height: '100%', borderRadius: 3, width: `${Math.min(100, ((selectedPeer.usage_month_rx_tx || 0) / selectedPeer.quota_bytes) * 100)}%`, background: 'var(--cyan)' }} />
                </div>
              </div>
            ) : (
              <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 8 }}>Unlimited</div>
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              <Btn label="Set quota" variant="ghost" onClick={() => handleSetQuota(selectedPeer)} />
              {selectedPeer.quota_bytes ? <Btn label="Clear quota" variant="ghost" onClick={() => managePeer(selectedPeer, { quota_bytes: 0 }, 'Quota cleared')} /> : null}
              <Btn
                label={selectedPeer.notify_events ? 'Alerts: on' : 'Alerts: off'}
                variant="ghost"
                onClick={() => managePeer(selectedPeer, { notify_events: !selectedPeer.notify_events }, `Alerts ${selectedPeer.notify_events ? 'off' : 'on'}`)}
              />
            </div>
            <div style={{ ...labelStyle, marginBottom: 8 }}>Expiry (guest access)</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              <Btn label="+24h" variant="ghost" onClick={() => managePeer(selectedPeer, { extend_hours: 24 }, 'Extended 24h')} />
              <Btn label="+7d" variant="ghost" onClick={() => managePeer(selectedPeer, { extend_hours: 168 }, 'Extended 7 days')} />
              {selectedPeer.expires_at ? <Btn label="Make permanent" variant="ghost" onClick={() => managePeer(selectedPeer, { expires_at: '' }, 'Expiry cleared')} /> : null}
            </div>
            <div style={{ ...labelStyle, marginBottom: 8 }}>Status</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
              {selectedPeer.status === 'suspended'
                ? <Btn label="Unsuspend" variant="ghost" onClick={() => managePeer(selectedPeer, { status: 'active' }, 'Peer unsuspended')} />
                : <Btn label="Suspend" variant="ghost" onClick={() => managePeer(selectedPeer, { status: 'suspended' }, 'Peer suspended')} />}
              <Btn label="Reissue keys" variant="ghost" onClick={() => handleReissueKeys(selectedPeer)} />
            </div>
            {managing ? <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 8 }}>Working…</div> : null}
            {reissuedQr ? (
              <div style={{ marginTop: 12, background: '#fff', borderRadius: 12, padding: 16, textAlign: 'center' }}>
                <img src={reissuedQr} alt="New WireGuard QR" style={{ width: 200, height: 200 }} />
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#333', marginTop: 8 }}>
                  New keys active — scan on the device now, old config is dead
                </div>
              </div>
            ) : null}
            {peerActivity.length > 0 ? (
              <div style={{ marginTop: 16 }}>
                <div style={{ ...labelStyle, marginBottom: 8 }}>This device · 7 days</div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 90 }}>
                  {peerActivity.map(d => {
                    const max = Math.max(...peerActivity.map(x => x.sessions), 1)
                    const h = Math.max(4, Math.round((d.sessions / max) * 70))
                    return (
                      <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                        <div style={{ color: 'var(--text)', fontSize: 10, fontWeight: 600 }}>{d.sessions}</div>
                        <div title={`${d.date}: ${d.sessions} sessions, ↓ ${formatBytes(d.rx)} / ↑ ${formatBytes(d.tx)}`}
                          style={{ width: '100%', height: h, borderRadius: '4px 4px 2px 2px',
                            background: 'linear-gradient(180deg, var(--cyan), var(--green))', opacity: 0.85 }} />
                        <div style={{ color: 'var(--muted)', fontSize: 9, fontFamily: 'var(--font-mono)' }}>{String(d.date).slice(5)}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : null}
          </div>
          <div style={{ marginTop: 20, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Btn label="Close" variant="ghost" onClick={closePeer} />
            <Btn label="Rename" variant="ghost" onClick={() => handleRenamePeer(selectedPeer)} />
            <Btn label="Delete Peer" variant="solid" color="var(--red)" textColor="#fff" onClick={() => { handleDeletePeer(selectedPeer); closePeer() }} />
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
