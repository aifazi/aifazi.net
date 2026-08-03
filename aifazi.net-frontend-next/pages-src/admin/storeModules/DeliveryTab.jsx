'use client'
import { useState, useEffect } from 'react'
import api from '@/lib/api'
import { notify } from '../../../core/notify.jsx'

const G = 'var(--green)', C = 'var(--cyan)', R = 'var(--red)'
const MONO = "var(--font-mono,'JetBrains Mono',monospace)"
const mix = (c, p) => `color-mix(in srgb, ${c} ${p}%, transparent)`

const S = {
  card: { padding: 20, borderRadius: 14, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.015)' },
  btn: { fontFamily: MONO, fontSize: 10, letterSpacing: 1.5, padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)' },
}

export default function DeliveryAdminTab() {
  const [agents, setAgents] = useState([])
  const [assignments, setAssignments] = useState([])
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAssign, setShowAssign] = useState(null)
  const [selectedOrder, setSelectedOrder] = useState('')
  const [assignNote, setAssignNote] = useState('')

  const load = async () => {
    try {
      const [a, o] = await Promise.all([
        api.get('/store/admin/orders?status=processing').catch(() => ({ data: [] })),
        api.get('/store/delivery/agents').catch(() => ({ data: [] })),
      ])
      setOrders(Array.isArray(a.data) ? a.data : (a.data?.orders || []))
      setAgents(Array.isArray(o.data) ? o.data : [])
    } catch {}
    setLoading(false)
  }

  const loadAssignments = async () => {
    try {
      const r = await api.get('/store/delivery/assignments')
      setAssignments(Array.isArray(r.data) ? r.data : (r.data?.assignments || []))
    } catch {}
  }

  useEffect(() => { load(); loadAssignments() }, [])

  const handleAssign = async () => {
    if (!showAssign || !selectedOrder) return
    try {
      await api.post('/store/delivery/assign', { order_id: selectedOrder, agent_id: showAssign, notes: assignNote })
      notify.success('Order assigned')
      setShowAssign(null); setSelectedOrder(''); setAssignNote('')
      loadAssignments()
    } catch (err) { notify.error(err.response?.data?.detail || 'Failed to assign') }
  }

  if (loading) return <div style={{ color: 'var(--muted)', fontSize: 12, padding: 24 }}>Loading...</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Agents */}
      <div>
        <h2 style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 3, color: C, marginBottom: 14 }}>DELIVERY AGENTS</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {agents.map(a => (
            <div key={a.id} style={S.card}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 20 }}>🚚</span>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{a.display_name || a.user?.username || 'Agent'}</span>
                <span style={{
                  fontFamily: MONO, fontSize: 8, letterSpacing: 1.5, padding: '3px 8px', borderRadius: 20,
                  color: a.status === 'available' ? G : a.status === 'busy' ? 'var(--orange)' : 'var(--muted)',
                  border: `1px solid ${a.status === 'available' ? mix(G, 30) : a.status === 'busy' ? mix('var(--orange)', 30) : 'var(--border)'}`,
                  marginLeft: 'auto',
                }}>{a.status?.toUpperCase()}</span>
              </div>
              <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--muted)' }}>
                {a.vehicle && <span>{a.vehicle} · </span>}
                {a.phone && <span>📱 {a.phone} · </span>}
                {a.current_area && <span>📍 {a.current_area}</span>}
              </div>
              <button onClick={() => setShowAssign(a.id)} style={{ ...S.btn, marginTop: 10, color: C, borderColor: mix(C, 30) }}>
                Assign Order
              </button>
            </div>
          ))}
          {agents.length === 0 && <div style={{ color: 'var(--muted)', fontSize: 12 }}>No delivery agents. Staff members with the "moderator" role can access the delivery portal on the store.</div>}
        </div>
      </div>

      {/* Assignments */}
      <div>
        <h2 style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 3, color: C, marginBottom: 14 }}>ACTIVE DELIVERIES</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {assignments.map(a => (
            <div key={a.id} style={S.card}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: C }}>#{a.order_number || a.id}</span>
                <span style={{ fontFamily: MONO, fontSize: 9, padding: '3px 8px', borderRadius: 10, background: mix(G, 10), color: G }}>{a.status?.toUpperCase()}</span>
                <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--muted)' }}>{a.agent_name || 'Unassigned'}</span>
              </div>
            </div>
          ))}
          {assignments.length === 0 && <div style={{ color: 'var(--muted)', fontSize: 12 }}>No active deliveries.</div>}
        </div>
      </div>

      {/* Assign Modal */}
      {showAssign && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }} onClick={() => setShowAssign(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, width: '100%', maxWidth: 440 }}>
            <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 2, color: C, marginBottom: 16 }}>ASSIGN ORDER TO AGENT</div>
            <select value={selectedOrder} onChange={e => setSelectedOrder(e.target.value)}
              style={{ width: '100%', padding: '10px 14px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontFamily: MONO, fontSize: 12, marginBottom: 12 }}>
              <option value="">Select order...</option>
              {orders.map(o => <option key={o.id} value={o.id}>#{o.order_number} — ${(o.total_cents / 100).toFixed(2)}</option>)}
            </select>
            <input value={assignNote} onChange={e => setAssignNote(e.target.value)} placeholder="Note (optional)"
              style={{ width: '100%', padding: '10px 14px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontFamily: MONO, fontSize: 12, marginBottom: 16, boxSizing: 'border-box' }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleAssign} disabled={!selectedOrder} style={{ ...S.btn, flex: 1, background: G, color: '#000', borderColor: G }}>Assign</button>
              <button onClick={() => setShowAssign(null)} style={{ ...S.btn, flex: 1 }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
