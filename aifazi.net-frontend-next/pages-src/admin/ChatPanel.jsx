'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import api from '@/lib/api'
import { useToast } from '../../components/Toast'
import { useDialog, dialog } from '../../components/Dialog'
import { S, PageHeader } from './shared'
import { Modal, EmptyState, Badge } from './ui'
import { ChannelModal } from '../chat/components/ChannelModal'

const TABS = [
  ['overview', '📊', 'Overview'],
  ['channels', '📁', 'Channels'],
  ['members', '👥', 'Members'],
  ['mutes', '🔇', 'Mutes'],
  ['bans', '🚫', 'Bans'],
  ['dms', '✉️', 'DMs'],
]
const ROLE_PERMS = ['read_messages', 'send_messages', 'manage_messages', 'manage_members', 'manage_roles', 'voice_speak', 'voice_screen_share']

function AccessLabel({ room }) {
  const a = room?.access
  if (room?.is_private && !a?.roles?.length && !a?.users?.length) return <Badge tone="red">Closed</Badge>
  if (a?.mode === 'mixed') return <Badge>Mixed</Badge>
  if (a?.mode === 'roles') return <Badge color="var(--cyan)">{a.roles.length} roles</Badge>
  if (a?.mode === 'users') return <Badge color="#ff6b35">{a.users.length} users</Badge>
  return <Badge color="var(--green)" tone="green">Public</Badge>
}

function Pill({ children, color = 'var(--muted)', bg }) {
  return (
    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, padding: '2px 7px', borderRadius: 6, border: '1px solid', borderColor: 'color-mix(in srgb, ' + color + ' 40%, transparent)', background: bg || 'color-mix(in srgb, ' + color + ' 8%, transparent)', color, whiteSpace: 'nowrap' }}>
      {children}
    </span>
  )
}

export default function ChatPanel() {
  const toast = useToast()
  const { confirm } = useDialog()
  const [tab, setTab] = useState('overview')

  const [stats, setStats] = useState(null)
  const [rooms, setRooms] = useState([])
  const [members, setMembers] = useState([])
  const [mutes, setMutes] = useState([])
  const [bans, setBans] = useState([])
  const [dmRequests, setDmRequests] = useState([])
  const [dmThreads, setDmThreads] = useState([])
  const [dmBlocks, setDmBlocks] = useState([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  const [channelModal, setChannelModal] = useState(null) // null | 'create' | room
  const [selectedRoom, setSelectedRoom] = useState(null) // channel detail
  const [roomData, setRoomData] = useState(null) // members/roles/mutes/bans for selected room

  const refresh = useCallback(async () => {
    const [s, r, m, mu, b, dr, dt, db] = await Promise.allSettled([
      api.get('/chat/admin/stats'),
      api.get('/chat/admin/rooms'),
      api.get('/chat/admin/members'),
      api.get('/chat/admin/mutes'),
      api.get('/chat/admin/bans'),
      api.get('/chat/admin/dm/requests'),
      api.get('/chat/admin/dm/threads'),
      api.get('/chat/admin/dm/blocks'),
    ])
    if (s.status === 'fulfilled') setStats(s.value.data)
    if (r.status === 'fulfilled') setRooms(r.value.data || [])
    if (m.status === 'fulfilled') setMembers(m.value.data || [])
    if (mu.status === 'fulfilled') setMutes(mu.value.data || [])
    if (b.status === 'fulfilled') setBans(b.value.data || [])
    if (dr.status === 'fulfilled') setDmRequests(dr.value.data || [])
    if (dt.status === 'fulfilled') setDmThreads(dt.value.data || [])
    if (db.status === 'fulfilled') setDmBlocks(db.value.data || [])
    const failed = [s, r, m, mu, b, dr, dt, db].filter(x => x.status === 'rejected').length
    setErr(failed ? `${failed} request(s) failed — check staff permissions` : '')
    setLoading(false)
  }, [])

  useEffect(() => {
    const run = async () => { await refresh() }
    run().catch(() => {})
  }, [refresh])

  const loadRoom = useCallback(async (room) => {
    const [mem, roles, mutesR, bansR] = await Promise.allSettled([
      api.get(`/chat/rooms/${room.id}/members`),
      api.get(`/chat/rooms/${room.id}/roles`),
      api.get(`/chat/rooms/${room.id}/mutes`),
      api.get(`/chat/rooms/${room.id}/bans`),
    ])
    setRoomData({
      members: mem.status === 'fulfilled' ? (mem.value.data || []) : [],
      roles: roles.status === 'fulfilled' ? (roles.value.data || []) : [],
      mutes: mutesR.status === 'fulfilled' ? (mutesR.value.data || []) : [],
      bans: bansR.status === 'fulfilled' ? (bansR.value.data || []) : [],
    })
  }, [])

  const openRoom = (room) => {
    setSelectedRoom(room)
    setRoomData(null)
    loadRoom(room)
  }

  const saveChan = async (data) => {
    try {
      if (data.id) {
        const res = await api.put(`/chat/rooms/${data.id}`, data)
        setRooms(p => p.map(r => r.id === data.id ? res.data : r))
        toast.success('Channel updated', { title: 'Saved' })
      } else {
        const res = await api.post('/chat/rooms', data)
        setRooms(p => [...p, res.data])
        toast.success('Channel created', { title: 'Created' })
      }
      setChannelModal(null)
      refresh()
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to save channel', { title: 'Error' })
    }
  }

  const deleteChan = async (room) => {
    const ok = await confirm({ title: `Delete #${room.name}?`, message: 'All messages in this channel will be permanently removed.', variant: 'danger', confirmLabel: 'DELETE' })
    if (!ok) return
    try {
      await api.delete(`/chat/rooms/${room.id}`)
      setRooms(p => p.filter(r => r.id !== room.id))
      if (selectedRoom?.id === room.id) setSelectedRoom(null)
      toast.success('Channel deleted', { title: 'Deleted' })
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Delete failed', { title: 'Error' })
    }
  }

  // ── Global member actions ─────────────────────────────────────────────────
  const changeMemberRole = async (member) => {
    const role = await dialog.prompt({ title: `Set role for ${member.username} in #${member.room_name || member.room_id}`, defaultValue: member.role || 'member', placeholder: 'member' })
    if (role === null) return
    try {
      await api.patch(`/chat/rooms/${member.room_id}/members/${encodeURIComponent(member.username)}/role`, { name: role.trim() || 'member' })
      setMembers(p => p.map(x => x.id === member.id ? { ...x, role: role.trim() || 'member' } : x))
      if (selectedRoom) loadRoom(selectedRoom)
      toast.success('Role updated', { title: 'Updated' })
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Could not change role', { title: 'Error' })
    }
  }
  const removeMember = async (member) => {
    const ok = await confirm({ title: 'Remove member', message: `Remove ${member.username} from #${member.room_name || member.room_id}?`, variant: 'danger', confirmLabel: 'REMOVE' })
    if (!ok) return
    try {
      await api.post(`/chat/rooms/${member.room_id}/kick`, { username: member.username })
      setMembers(p => p.filter(x => x.id !== member.id))
      if (selectedRoom) loadRoom(selectedRoom)
      toast.success('Member removed', { title: 'Removed' })
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Could not remove member', { title: 'Error' })
    }
  }

  const unmute = async (m) => {
    try {
      await api.delete(`/chat/rooms/${m.room_id}/mute/${encodeURIComponent(m.username)}`)
      setMutes(p => p.filter(x => x.id !== m.id))
      toast.success(`${m.username} unmuted`, { title: 'Unmuted' })
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Could not unmute', { title: 'Error' })
    }
  }
  const unban = async (b) => {
    try {
      await api.delete(`/chat/rooms/${b.room_id}/ban/${encodeURIComponent(b.username)}`)
      setBans(p => p.filter(x => x.id !== b.id))
      toast.success(`${b.username} unbanned`, { title: 'Unbanned' })
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Could not unban', { title: 'Error' })
    }
  }

  // ── DM admin actions ──────────────────────────────────────────────────────
  const acceptRequest = async (req) => {
    try {
      await api.post(`/chat/admin/dm/requests/${req.id}/accept`)
      setDmRequests(p => p.filter(x => x.id !== req.id))
      toast.success(`Request accepted`, { title: 'Accepted' })
      refresh()
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Could not accept', { title: 'Error' })
    }
  }
  const rejectRequest = async (req) => {
    try {
      await api.post(`/chat/admin/dm/requests/${req.id}/reject`)
      setDmRequests(p => p.filter(x => x.id !== req.id))
      toast.success('Request rejected', { title: 'Rejected' })
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Could not reject', { title: 'Error' })
    }
  }
  const deleteRequest = async (req) => {
    const ok = await confirm({ title: 'Delete request', message: `Delete the request between ${req.sender} → ${req.recipient}?`, variant: 'danger', confirmLabel: 'DELETE' })
    if (!ok) return
    try {
      await api.delete(`/chat/admin/dm/requests/${req.id}`)
      setDmRequests(p => p.filter(x => x.id !== req.id))
      toast.success('Request deleted', { title: 'Deleted' })
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Could not delete', { title: 'Error' })
    }
  }
  const unblock = async (blk) => {
    try {
      await api.delete(`/chat/admin/dm/blocks/${blk.id}`)
      setDmBlocks(p => p.filter(x => x.id !== blk.id))
      toast.success(`${blk.blocker} → ${blk.blocked} unblocked`, { title: 'Unblocked' })
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Could not unblock', { title: 'Error' })
    }
  }

  const statCards = useMemo(() => {
    if (!stats) return []
    const d = stats.dm || {}
    return [
      { label: 'CHANNELS', value: stats.rooms?.total ?? 0, sub: `${stats.rooms?.text ?? 0} text · ${stats.rooms?.voice ?? 0} voice · ${stats.rooms?.video ?? 0} video`, color: 'var(--green)', onClick: () => setTab('channels') },
      { label: 'MEMBERS', value: stats.members ?? 0, sub: `${stats.custom_roles ?? 0} custom roles`, color: 'var(--cyan)', onClick: () => setTab('members') },
      { label: 'MESSAGES', value: stats.messages ?? 0, sub: `${stats.mutes ?? 0} mutes · ${stats.bans ?? 0} bans`, color: '#ff6b35', onClick: () => setTab('mutes') },
      { label: 'DM THREADS', value: d.threads ?? 0, sub: `${d.messages ?? 0} dm messages`, color: '#a78bfa', onClick: () => setTab('dms') },
      { label: 'DM REQUESTS', value: d.pending ?? 0, sub: `${d.accepted ?? 0} accepted · ${d.rejected ?? 0} rejected`, color: '#ffd700', onClick: () => setTab('dms') },
      { label: 'DM BLOCKS', value: d.blocks ?? 0, sub: 'active blocks', color: '#ff4757', onClick: () => setTab('dms') },
    ]
  }, [stats])

  const [roomSearch, setRoomSearch] = useState('')
  const filteredRooms = useMemo(() => {
    const q = (roomSearch || '').toLowerCase()
    return rooms.filter(r => !q || r.name?.toLowerCase().includes(q))
  }, [rooms, roomSearch])

  const renderOverview = () => (
    <div>
      {loading ? <div className="loader" style={{ margin: '40px auto' }} /> : (
        <>
          {err && <div style={{ color: 'var(--red)', fontFamily: 'var(--font-mono)', fontSize: 11, marginBottom: 14 }}>{err}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 12 }}>
            {statCards.map(c => (
              <button key={c.label} onClick={c.onClick} className="admin-quick-action" style={{ textAlign: 'left', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 18px', cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 3, color: 'var(--muted)' }}>{c.label}</span>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.color, boxShadow: `0 0 8px ${c.color}` }} />
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 800, color: c.color, lineHeight: 1 }}>{c.value}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', marginTop: 8 }}>{c.sub}</div>
              </button>
            ))}
          </div>
          <div style={{ marginTop: 20 }}>
            <PageHeader eyebrow="RECENT MESSAGES" title="Latest activity" />
            <RecentMessages key="recent" />
          </div>
        </>
      )}
    </div>
  )

  return (
    <div style={{ padding: '4px 2px' }}>
      <PageHeader
        eyebrow="COMMUNITY · CHAT"
        title="Chat Management"
        subtitle="Channels, members, roles, moderation and direct messages across the whole chat."
        actions={
          <>
            <button onClick={refresh} style={{ ...S.btn('transparent', 'var(--muted)'), border: '1px solid var(--border)', fontSize: 10, padding: '8px 14px' }}>⟳ REFRESH</button>
            <button onClick={() => setChannelModal('create')} style={{ ...S.btn('color-mix(in srgb, var(--green) 8%, transparent)', 'var(--green)'), border: '1px solid color-mix(in srgb, var(--green) 35%, transparent)', fontSize: 10, padding: '8px 14px' }}>+ NEW CHANNEL</button>
          </>
        }
      />

      <div style={{ display: 'flex', gap: 6, marginBottom: 18, flexWrap: 'wrap' }}>
        {TABS.map(([key, icon, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1, padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
            background: tab === key ? 'color-mix(in srgb, var(--green) 12%, transparent)' : 'var(--bg2)',
            border: `1px solid ${tab === key ? 'color-mix(in srgb, var(--green) 40%, transparent)' : 'var(--border)'}`,
            color: tab === key ? 'var(--green)' : 'var(--muted)',
          }}>{icon} {label}{key === 'dms' && dmRequests.length > 0 ? ` (${dmRequests.length})` : ''}</button>
        ))}
      </div>

      {/* OVERVIEW */}
      {tab === 'overview' && renderOverview()}

      {/* CHANNELS */}
      {tab === 'channels' && (
        <div>
          {selectedRoom ? (
            <RoomDetail
              room={selectedRoom}
              data={roomData}
              onBack={() => setSelectedRoom(null)}
              onEdit={() => setChannelModal(selectedRoom)}
              onChange={loadRoom}
            />
          ) : (
            <>
              <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ flex: '1 1 240px', position: 'relative' }}>
                  <input value={roomSearch} onChange={e => setRoomSearch(e.target.value)} placeholder="Search channels…" style={{ ...S.input, fontSize: 12, padding: '9px 12px 9px 32px' }} />
                  <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, opacity: 0.5 }}>🔍</span>
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)' }}>{filteredRooms.length} channels</div>
              </div>
              {loading ? <div className="loader" style={{ margin: '40px auto' }} /> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {filteredRooms.map(room => (
                    <div key={room.id} style={{ ...S.card, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 20, flexShrink: 0 }}>{room.emoji || (room.type === 'video' ? '📹' : room.type === 'voice' ? '🔊' : '#')}</span>
                      <div style={{ flex: '1 1 200px', minWidth: 160 }}>
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{room.name}</div>
                        <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                          <Pill>{room.type}</Pill>
                          <AccessLabel room={room} />
                          {room.read_only && <Pill color="#ffd700">🔇 read-only</Pill>}
                          {room.slow_mode > 0 && <Pill color="#00d4ff">{room.slow_mode}s slow</Pill>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 16, flexShrink: 0 }}>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--cyan)' }}>{room.member_count || 0}</div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--muted)', letterSpacing: 1 }}>MEMBERS</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
                        <button onClick={() => openRoom(room)} style={{ ...S.btn('transparent', 'var(--cyan)'), border: '1px solid color-mix(in srgb, var(--cyan) 35%, transparent)', fontSize: 9, padding: '7px 12px' }}>MANAGE</button>
                        <button onClick={() => setChannelModal(room)} style={{ ...S.btn('transparent', 'var(--green)'), border: '1px solid color-mix(in srgb, var(--green) 35%, transparent)', fontSize: 9, padding: '7px 12px' }}>EDIT</button>
                        <button onClick={() => deleteChan(room)} style={{ ...S.btn('transparent', 'var(--red)'), border: '1px solid rgba(255,71,87,0.4)', fontSize: 9, padding: '7px 12px' }}>DELETE</button>
                      </div>
                    </div>
                  ))}
                  {filteredRooms.length === 0 && <EmptyState icon="📁" title="No channels" hint="Create one with + NEW CHANNEL." />}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* MEMBERS */}
      {tab === 'members' && (
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', marginBottom: 10 }}>{members.length} memberships across all channels</div>
          {loading ? <div className="loader" style={{ margin: '40px auto' }} /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {members.map(m => (
                <div key={m.id} style={{ ...S.card, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px' }}>
                  <span style={{ fontSize: 14 }}>{m.room_emoji || '#'}</span>
                  <div style={{ flex: '1 1 120px', fontFamily: 'var(--font-display)', fontSize: 13, color: 'var(--text)' }}>{m.username || m.user_id}</div>
                  <div style={{ flex: '1 1 120px', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)' }}>{m.room_name || m.room_id}</div>
                  <button onClick={() => changeMemberRole(m)} title="Change role" style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--cyan)', background: 'transparent', border: '1px solid color-mix(in srgb, var(--cyan) 30%, transparent)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>{m.role || 'member'}</button>
                  <button onClick={() => removeMember(m)} style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--red)', background: 'transparent', border: '1px solid rgba(255,71,87,0.35)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>REMOVE</button>
                </div>
              ))}
              {members.length === 0 && <EmptyState icon="👥" title="No members yet" />}
            </div>
          )}
        </div>
      )}

      {/* MUTES */}
      {tab === 'mutes' && (
        <div>
          {loading ? <div className="loader" style={{ margin: '40px auto' }} /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {mutes.map(m => (
                <div key={m.id} style={{ ...S.card, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px' }}>
                  <span style={{ fontSize: 14 }}>🔇</span>
                  <div style={{ flex: 1, fontFamily: 'var(--font-display)', fontSize: 13, color: 'var(--text)' }}>{m.username}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)' }}>in {m.room_emoji} {m.room_name || m.room_id}</div>
                  <Pill color={m.expires_at ? '#ffd700' : 'var(--red)'}>{m.expires_at ? 'temporary' : 'permanent'}</Pill>
                  <button onClick={() => unmute(m)} style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--green)', background: 'transparent', border: '1px solid color-mix(in srgb, var(--green) 35%, transparent)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>UNMUTE</button>
                </div>
              ))}
              {mutes.length === 0 && <EmptyState icon="🔇" title="No active mutes" />}
            </div>
          )}
        </div>
      )}

      {/* BANS */}
      {tab === 'bans' && (
        <div>
          {loading ? <div className="loader" style={{ margin: '40px auto' }} /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {bans.map(b => (
                <div key={b.id} style={{ ...S.card, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px' }}>
                  <span style={{ fontSize: 14 }}>🚫</span>
                  <div style={{ flex: 1, fontFamily: 'var(--font-display)', fontSize: 13, color: 'var(--text)' }}>{b.username}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)' }}>in {b.room_emoji} {b.room_name || b.room_id}</div>
                  {b.reason ? <Pill color="var(--muted)">{b.reason}</Pill> : null}
                  <button onClick={() => unban(b)} style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--green)', background: 'transparent', border: '1px solid color-mix(in srgb, var(--green) 35%, transparent)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>UNBAN</button>
                </div>
              ))}
              {bans.length === 0 && <EmptyState icon="🚫" title="No bans" />}
            </div>
          )}
        </div>
      )}

      {/* DMs */}
      {tab === 'dms' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 3, color: 'var(--muted)', marginBottom: 10 }}>MESSAGE REQUESTS</div>
            {dmRequests.length === 0 ? <EmptyState icon="✉️" title="No message requests" /> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {dmRequests.map(r => (
                  <div key={r.id} style={{ ...S.card, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14 }}>✉️</span>
                    <div style={{ flex: 1, minWidth: 140 }}>
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, color: 'var(--text)' }}>{r.sender}</span>
                      <span style={{ color: 'var(--muted)', fontSize: 11 }}> → {r.recipient}</span>
                    </div>
                    <Pill color={r.status === 'pending' ? '#ffd700' : r.status === 'accepted' ? 'var(--green)' : 'var(--red)'}>{r.status}</Pill>
                    {r.status === 'pending' && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => acceptRequest(r)} style={{ ...S.btn('transparent', 'var(--green)'), border: '1px solid color-mix(in srgb, var(--green) 35%, transparent)', fontSize: 9, padding: '5px 10px' }}>ACCEPT</button>
                        <button onClick={() => rejectRequest(r)} style={{ ...S.btn('transparent', 'var(--red)'), border: '1px solid rgba(255,71,87,0.4)', fontSize: 9, padding: '5px 10px' }}>REJECT</button>
                      </div>
                    )}
                    <button onClick={() => deleteRequest(r)} style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 10px', cursor: 'pointer' }}>DELETE</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 3, color: 'var(--muted)', marginBottom: 10 }}>THREADS ({dmThreads.length})</div>
            {dmThreads.length === 0 ? <EmptyState icon="💬" title="No DM threads" /> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {dmThreads.map(t => (
                  <div key={t.id} style={{ ...S.card, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 160 }}>
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, color: 'var(--text)' }}>{t.party_a}</span>
                      <span style={{ color: 'var(--muted)', fontSize: 11 }}> ↔ {t.party_b}</span>
                    </div>
                    <Pill color="var(--cyan)">{t.message_count || 0} msgs</Pill>
                    {t.last_message_at && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)' }}>{new Date(t.last_message_at).toLocaleString()}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 3, color: 'var(--muted)', marginBottom: 10 }}>BLOCKS ({dmBlocks.length})</div>
            {dmBlocks.length === 0 ? <EmptyState icon="🚫" title="No DM blocks" /> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {dmBlocks.map(b => (
                  <div key={b.id} style={{ ...S.card, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14 }}>⛔</span>
                    <div style={{ flex: 1, minWidth: 140 }}>
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, color: 'var(--text)' }}>{b.blocker}</span>
                      <span style={{ color: 'var(--muted)', fontSize: 11 }}> blocked {b.blocked}</span>
                    </div>
                    <button onClick={() => unblock(b)} style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--green)', background: 'transparent', border: '1px solid color-mix(in srgb, var(--green) 35%, transparent)', borderRadius: 6, padding: '5px 10px', cursor: 'pointer' }}>UNBLOCK</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {channelModal && (
        <ChannelModal
          initial={channelModal === 'create' ? null : channelModal}
          onSave={saveChan}
          onClose={() => setChannelModal(null)}
        />
      )}
    </div>
  )
}

// ── Room detail (members / roles / moderation) ────────────────────────────────
function RoomDetail({ room, data, onBack, onEdit, onChange }) {
  const toast = useToast()
  const { confirm } = useDialog()
  const [inviteQ, setInviteQ] = useState('')
  const [inviteRes, setInviteRes] = useState([])
  const [roleModal, setRoleModal] = useState(null) // null | { id?, name, color, permissions }

  const searchInvite = async (q) => {
    setInviteQ(q)
    if (!q.trim()) { setInviteRes([]); return }
    try {
      const r = await api.get(`/chat/users/search?q=${encodeURIComponent(q.trim())}`)
      setInviteRes(r.data || [])
    } catch { setInviteRes([]) }
  }
  const invite = async (username) => {
    try {
      await api.post(`/chat/rooms/${room.id}/invite`, { username, role: 'member' })
      setInviteQ(''); setInviteRes([])
      onChange(room)
      toast.success(`${username} invited`, { title: 'Invited' })
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Could not invite', { title: 'Error' })
    }
  }
  const kick = async (m) => {
    const ok = await confirm({ title: `Remove ${m.username}?`, message: `Remove from #${room.name}?`, variant: 'danger', confirmLabel: 'REMOVE' })
    if (!ok) return
    try {
      await api.post(`/chat/rooms/${room.id}/kick`, { username: m.username })
      onChange(room)
      toast.success('Member removed', { title: 'Removed' })
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Could not remove', { title: 'Error' })
    }
  }
  const setRole = async (m) => {
    const role = await dialog.prompt({ title: `Role for ${m.username} in #${room.name}`, defaultValue: m.role || 'member', placeholder: 'member' })
    if (role === null) return
    try {
      await api.patch(`/chat/rooms/${room.id}/members/${encodeURIComponent(m.username)}/role`, { name: role.trim() || 'member' })
      onChange(room)
      toast.success('Role updated', { title: 'Updated' })
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Could not set role', { title: 'Error' })
    }
  }
  const mute = async (m) => {
    const mins = await dialog.prompt({ title: `Mute duration for ${m.username} (minutes, 0 = permanent)`, defaultValue: '60', placeholder: '60' })
    if (mins === null) return
    try {
      await api.post(`/chat/rooms/${room.id}/mute`, { username: m.username, duration_minutes: parseInt(mins, 10) || 0 })
      onChange(room)
      toast.success(`${m.username} muted`, { title: 'Muted' })
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Could not mute', { title: 'Error' })
    }
  }
  const ban = async (m) => {
    const ok = await confirm({ title: `Ban ${m.username}?`, message: `Ban from #${room.name}?`, variant: 'danger', confirmLabel: 'BAN' })
    if (!ok) return
    try {
      await api.post(`/chat/rooms/${room.id}/ban`, { username: m.username })
      onChange(room)
      toast.success(`${m.username} banned`, { title: 'Banned' })
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Could not ban', { title: 'Error' })
    }
  }
  const unmuteRoom = async (m) => {
    try { await api.delete(`/chat/rooms/${room.id}/mute/${encodeURIComponent(m.username)}`); onChange(room); toast.success('Unmuted', { title: 'Unmuted' }) }
    catch (e) { toast.error(e?.response?.data?.detail || 'Failed', { title: 'Error' }) }
  }
  const unbanRoom = async (b) => {
    try { await api.delete(`/chat/rooms/${room.id}/ban/${encodeURIComponent(b.username)}`); onChange(room); toast.success('Unbanned', { title: 'Unbanned' }) }
    catch (e) { toast.error(e?.response?.data?.detail || 'Failed', { title: 'Error' }) }
  }

  const saveRole = async () => {
    if (!roleModal || !roleModal.name.trim()) return
    try {
      const body = { name: roleModal.name.trim(), color: roleModal.color || '#00ff88', permissions: roleModal.permissions || [] }
      if (roleModal.id) await api.put(`/chat/rooms/${room.id}/roles/${roleModal.id}`, body)
      else await api.post(`/chat/rooms/${room.id}/roles`, body)
      setRoleModal(null); onChange(room)
      toast.success('Role saved', { title: 'Saved' })
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Could not save role', { title: 'Error' })
    }
  }
  const deleteRole = async (r) => {
    const ok = await confirm({ title: `Delete role ${r.name}?`, message: 'Members with this role revert to member.', variant: 'danger', confirmLabel: 'DELETE' })
    if (!ok) return
    try { await api.delete(`/chat/rooms/${room.id}/roles/${r.id}`); onChange(room); toast.success('Role deleted', { title: 'Deleted' }) }
    catch (e) { toast.error(e?.response?.data?.detail || 'Could not delete', { title: 'Error' }) }
  }

  const mem = data?.members || []
  const roles = data?.roles || []
  const mutes = data?.mutes || []
  const bans = data?.bans || []

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <button onClick={onBack} style={{ ...S.btn('transparent', 'var(--muted)'), border: '1px solid var(--border)', fontSize: 10, padding: '7px 12px' }}>← ALL CHANNELS</button>
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: 18 }}>{room.emoji || '#'}</span>{' '}
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{room.name}</span>
          <span style={{ marginLeft: 8 }}><Pill>{room.type}</Pill></span>
          <span style={{ marginLeft: 8 }}><AccessLabel room={room} /></span>
        </div>
        <button onClick={onEdit} style={{ ...S.btn('transparent', 'var(--green)'), border: '1px solid color-mix(in srgb, var(--green) 35%, transparent)', fontSize: 10, padding: '7px 14px' }}>✏️ EDIT CHANNEL</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          {/* Members */}
          <div style={{ ...S.card, padding: 16 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 3, color: 'var(--cyan)', marginBottom: 12 }}>MEMBERS ({mem.length})</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input value={inviteQ} onChange={e => searchInvite(e.target.value)} placeholder="Search users to invite…" style={{ ...S.input, fontSize: 12, padding: '8px 12px' }} />
            </div>
            {inviteRes.map(u => (
              <button key={u.username} onClick={() => invite(u.username)} disabled={(mem || []).some(x => x.username === u.username)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', marginBottom: 4, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 7, color: 'var(--text)', fontFamily: 'var(--font-display)', fontSize: 12, cursor: 'pointer' }}>
                {u.username} <span style={{ color: 'var(--accent)', float: 'right' }}>＋ INVITE</span>
              </button>
            ))}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {mem.map(m => (
                <div key={m.username} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 4px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <span style={{ flex: 1, fontFamily: 'var(--font-display)', fontSize: 13, color: 'var(--text)' }}>{m.username}</span>
                  <button onClick={() => setRole(m)} style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--cyan)', background: 'transparent', border: '1px solid color-mix(in srgb, var(--cyan) 30%, transparent)', borderRadius: 6, padding: '3px 8px', cursor: 'pointer' }}>{m.role || 'member'}</button>
                  <button onClick={() => mute(m)} title="Mute" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13 }}>🔇</button>
                  <button onClick={() => ban(m)} title="Ban" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13 }}>🚫</button>
                  <button onClick={() => kick(m)} style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--red)', background: 'transparent', border: '1px solid rgba(255,71,87,0.35)', borderRadius: 6, padding: '3px 8px', cursor: 'pointer' }}>REMOVE</button>
                </div>
              ))}
              {mem.length === 0 && <div style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: 10, padding: 8 }}>No members yet.</div>}
            </div>
          </div>

          {/* Moderation */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div style={{ ...S.card, padding: 16 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 3, color: '#ffd700', marginBottom: 12 }}>MUTES</div>
              {mutes.length === 0 ? <div style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>No mutes.</div> : mutes.map(m => (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <span style={{ flex: 1, fontFamily: 'var(--font-display)', fontSize: 12 }}>{m.username}</span>
                  <Pill color={m.expires_at ? '#ffd700' : 'var(--red)'}>{m.expires_at ? 'temp' : 'perm'}</Pill>
                  <button onClick={() => unmuteRoom(m)} style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--green)', background: 'none', border: 'none', cursor: 'pointer' }}>UNMUTE</button>
                </div>
              ))}
            </div>
            <div style={{ ...S.card, padding: 16 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 3, color: 'var(--red)', marginBottom: 12 }}>BANS</div>
              {bans.length === 0 ? <div style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>No bans.</div> : bans.map(b => (
                <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <span style={{ flex: 1, fontFamily: 'var(--font-display)', fontSize: 12 }}>{b.username}</span>
                  <button onClick={() => unbanRoom(b)} style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--green)', background: 'none', border: 'none', cursor: 'pointer' }}>UNBAN</button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Custom roles */}
        <div style={{ ...S.card, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 3, color: 'var(--green)' }}>CUSTOM ROLES</div>
            <button onClick={() => setRoleModal({ id: null, name: '', color: '#00ff88', permissions: [] })} style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--green)', background: 'transparent', border: '1px solid color-mix(in srgb, var(--green) 35%, transparent)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>+ ROLE</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {roles.map(r => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <span style={{ width: 12, height: 12, borderRadius: '50%', background: r.color || '#00ff88', flexShrink: 0 }} />
                <span style={{ flex: 1, fontFamily: 'var(--font-display)', fontSize: 12, color: 'var(--text)' }}>{r.name}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)' }}>{(r.permissions || []).length} perms</span>
                <button onClick={() => setRoleModal({ id: r.id, name: r.name, color: r.color || '#00ff88', permissions: r.permissions || [] })} style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--cyan)', background: 'none', border: 'none', cursor: 'pointer' }}>EDIT</button>
                <button onClick={() => deleteRole(r)} style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
              </div>
            ))}
            {roles.length === 0 && <div style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>No custom roles.</div>}
          </div>
          <div style={{ marginTop: 12, fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', lineHeight: 1.8 }}>
            Assign a role to a member above to grant read/send, message moderation, member management or voice permissions.
          </div>
        </div>
      </div>

      {roleModal && (
        <Modal open onClose={() => setRoleModal(null)} width={480}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 3, color: 'var(--green)', marginBottom: 4 }}>CUSTOM ROLE</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700 }}>{roleModal.id ? `Edit ${roleModal.name}` : 'New role'}</div>
          </div>
          <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input value={roleModal.name} onChange={e => setRoleModal({ ...roleModal, name: e.target.value })} placeholder="Role name" style={{ ...S.input, fontSize: 13 }} />
            <input value={roleModal.color} onChange={e => setRoleModal({ ...roleModal, color: e.target.value })} placeholder="#00ff88" style={{ ...S.input, fontSize: 13, width: 140 }} />
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 2, color: 'var(--muted)', marginBottom: 8 }}>PERMISSIONS</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {ROLE_PERMS.map(p => {
                  const on = (roleModal.permissions || []).includes(p)
                  return (
                    <button key={p} onClick={() => setRoleModal({ ...roleModal, permissions: on ? roleModal.permissions.filter(x => x !== p) : [...(roleModal.permissions || []), p] })} style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 1, padding: '5px 10px', borderRadius: 6, cursor: 'pointer', background: on ? 'color-mix(in srgb, var(--green) 12%, transparent)' : 'transparent', border: `1px solid ${on ? 'color-mix(in srgb, var(--green) 40%, transparent)' : 'var(--border)'}`, color: on ? 'var(--green)' : 'var(--muted)' }}>{p}</button>
                  )
                })}
              </div>
            </div>
          </div>
          <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => setRoleModal(null)} style={{ ...S.btn('transparent', 'var(--muted)'), border: '1px solid var(--border)', fontSize: 10, padding: '9px 16px' }}>CANCEL</button>
            <button onClick={saveRole} style={{ ...S.btn('var(--green)', '#000'), fontSize: 10, padding: '9px 18px' }}>SAVE ROLE</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function RecentMessages({ roomId }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let cancelled = false
    api.get(`/chat/admin/recent-messages?limit=20`)
      .then(r => { if (!cancelled) setRows(r.data || []) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [roomId])
  if (loading) return <div className="loader" style={{ margin: '30px auto' }} />
  if (!rows.length) return <EmptyState icon="💬" title="No messages yet" />
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {rows.map(m => (
        <div key={m.id} style={{ ...S.card, display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px' }}>
          <Pill color="var(--cyan)">{m.room_emoji} {m.room_name}</Pill>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--green)', flexShrink: 0 }}>{m.sender}</span>
          <span style={{ flex: 1, fontFamily: 'var(--font-display)', fontSize: 12, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {m.type === 'image' ? '🖼 [image]' : m.type === 'file' ? `📎 ${m.file_name || 'file'}` : m.content}
          </span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', flexShrink: 0 }}>{new Date(m.created_at).toLocaleString()}</span>
        </div>
      ))}
    </div>
  )
}
