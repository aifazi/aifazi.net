'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import api from '@/lib/api'
import { useForum } from '../../context/ForumContext'
import { Card, NeonButton, Badge, EmptyState } from '../../components/community'

const mix = (c, p) => `color-mix(in srgb, ${c} ${p}%, transparent)`
const G = 'var(--green)', C = 'var(--cyan)', R = 'var(--red)', Y = 'var(--orange)'

const STATUS_MAP = {
  assigned:   { color: 'cyan',    label: 'Assigned',  icon: '📋' },
  picked_up:  { color: 'purple',  label: 'Picked Up', icon: '📦' },
  in_transit: { color: 'orange',  label: 'In Transit',icon: '🚚' },
  delivered:  { color: 'green',   label: 'Delivered', icon: '✅' },
  failed:     { color: 'red',     label: 'Failed',    icon: '❌' },
  returned:   { color: 'orange',  label: 'Returned',  icon: '↩' },
}

const NEXT_STATUS = {
  assigned:   'picked_up',
  picked_up:  'in_transit',
  in_transit: 'delivered',
}

const ACTION_LABELS = {
  assigned:   'Pick Up',
  picked_up:  'Start Transit',
  in_transit: 'Mark Delivered',
}

// ── Barcode Scanner ───────────────────────────────────────────────────────────
function BarcodeScanner({ onScan, onClose }) {
  const [manual, setManual] = useState(true)
  const [code, setCode] = useState('')
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState('')
  const videoRef = useRef(null)
  const streamRef = useRef(null)

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
  }, [])

  const startCamera = useCallback(async () => {
    setError('')
    setManual(false)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      streamRef.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream
    } catch {
      setError('Camera access denied. Use manual entry instead.')
      setManual(true)
    }
  }, [])

  useEffect(() => { return () => stopCamera() }, [stopCamera])

  const handleManualSubmit = (e) => {
    e.preventDefault()
    if (!code.trim()) return
    setScanning(true)
    onScan(code.trim()).finally(() => setScanning(false))
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: 28, width: '100%', maxWidth: 480 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 3, color: G }}>SCAN BARCODE</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 18 }}>✕</button>
        </div>

        {!manual ? (
          <div>
            <video ref={videoRef} autoPlay playsInline style={{ width: '100%', borderRadius: 10, border: '1px solid var(--border)', maxHeight: 240, background: '#000' }} />
            {error && <div style={{ marginTop: 10, fontSize: 12, color: R }}>{error}</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <NeonButton variant="ghost" size="sm" onClick={() => { stopCamera(); setManual(true) }} style={{ flex: 1 }}>Manual Entry</NeonButton>
            </div>
          </div>
        ) : (
          <div>
            <form onSubmit={handleManualSubmit}>
              <input
                value={code}
                onChange={e => setCode(e.target.value)}
                placeholder="Enter order number or scan barcode..."
                autoFocus
                style={{
                  width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)',
                  borderRadius: 12, color: 'var(--text)', fontFamily: 'var(--font-mono)',
                  fontSize: 18, letterSpacing: 2, padding: '16px', outline: 'none',
                  textAlign: 'center', boxSizing: 'border-box',
                }}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <NeonButton type="submit" variant="primary" size="md" style={{ flex: 1 }} disabled={scanning || !code.trim()}>
                  {scanning ? 'Scanning...' : 'Submit'}
                </NeonButton>
                <NeonButton variant="ghost" size="md" onClick={startCamera}>📷 Camera</NeonButton>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}

// ── DeliveryAgentPortal ───────────────────────────────────────────────────────
export default function DeliveryAgentPortal() {
  const { user } = useForum()
  const [agent, setAgent] = useState(null)
  const [assignments, setAssignments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showScanner, setShowScanner] = useState(false)
  const [updating, setUpdating] = useState('')

  useEffect(() => {
    if (!user) { setLoading(false); return }
    api.get('/store/delivery/agents/me').then(r => {
      setAgent(r.data)
      loadAssignments()
    }).catch(err => {
      if (err.response?.status === 403) setError(err.response?.data?.detail || 'Not authorized.')
      else setError('Failed to load agent profile.')
    }).finally(() => setLoading(false))
  }, [user])

  const loadAssignments = async () => {
    try {
      const r = await api.get('/store/delivery/assignments/me')
      setAssignments(r.data || [])
    } catch { setAssignments([]) }
  }

  const updateStatus = async (assignment, newStatus) => {
    setUpdating(assignment.id)
    try {
      await api.patch(`/store/delivery/assignments/${assignment.id}`, { status: newStatus })
      loadAssignments()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update status.')
    } finally { setUpdating('') }
  }

  const handleScan = async (barcode) => {
    setError('')
    const scanType = agent?.status === 'busy' ? 'transit' : 'pickup'
    try {
      await api.post('/store/delivery/scan', { barcode, scan_type: scanType })
      setShowScanner(false)
      loadAssignments()
    } catch (err) {
      setError(err.response?.data?.detail || 'Scan failed. Check the barcode.')
      throw err
    }
  }

  const setMyStatus = async (status) => {
    try {
      await api.patch('/store/delivery/agents/me/status', { status })
      setAgent(a => ({ ...a, status }))
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update status.')
    }
  }

  if (!user) return (
    <div style={{ textAlign: 'center', padding: '60px 24px' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>🚚</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', marginBottom: 16 }}>
        Sign in to access the delivery portal.
      </div>
      <NeonButton to="/login" variant="primary" size="md">Sign In</NeonButton>
    </div>
  )

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i} style={{ padding: 24 }}>
          <div className="community-skel" style={{ width: '40%', height: 18, marginBottom: 12 }} />
          <div className="community-skel" style={{ width: '100%', height: 8, marginBottom: 6 }} />
          <div className="community-skel" style={{ width: '60%', height: 8 }} />
        </Card>
      ))}
    </div>
  )

  if (error && !agent) return (
    <div style={{ textAlign: 'center', padding: '60px 24px' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--red)', marginBottom: 16 }}>{error}</div>
      <NeonButton to="/store" variant="ghost">← Back to Store</NeonButton>
    </div>
  )

  const activeCount = assignments.filter(a => ['assigned', 'picked_up', 'in_transit'].includes(a.status)).length
  const completedCount = assignments.filter(a => a.status === 'delivered').length

  return (
    <div>
      {error && (
        <div style={{ padding: '10px 16px', background: mix(R, 10), border: `1px solid ${mix(R, 25)}`, borderRadius: 10, color: R, fontSize: 12, fontFamily: 'var(--font-mono)', marginBottom: 20 }}>
          {error}
          <button onClick={() => setError('')} style={{ background: 'none', border: 'none', color: R, cursor: 'pointer', float: 'right' }}>✕</button>
        </div>
      )}

      {/* Agent Status Bar */}
      <Card accent style={{ padding: 20, marginBottom: 24, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 32 }}>🚚</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>{agent?.display_name || 'Agent'}</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
            {agent?.current_area && <span>{agent?.current_area} · </span>}
            {agent?.vehicle && <span>{agent?.vehicle} · </span>}
            {activeCount} active · {completedCount} completed today
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {['available', 'busy', 'offline'].map(s => (
            <button key={s} onClick={() => setMyStatus(s)}
              style={{
                fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 1.5,
                padding: '7px 14px', borderRadius: 999, cursor: 'pointer', fontWeight: 700,
                border: `1px solid ${agent?.status === s ? (s === 'available' ? G : s === 'busy' ? Y : 'var(--border)') : 'var(--border)'}`,
                background: agent?.status === s ? mix(G, 10) : 'transparent',
                color: agent?.status === s ? (s === 'available' ? G : s === 'busy' ? Y : 'var(--muted)') : 'var(--muted)',
              }}>
              {s.toUpperCase()}
            </button>
          ))}
        </div>
        <NeonButton variant="primary" size="sm" onClick={() => setShowScanner(true)}>
          📷 Scan
        </NeonButton>
      </Card>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, marginBottom: 28 }}>
        <Card style={{ padding: 18, textAlign: 'center' }}>
          <div style={{ fontSize: 24, marginBottom: 4 }}>📋</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700, color: C }}>{activeCount}</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 2, color: 'var(--muted)' }}>ACTIVE</div>
        </Card>
        <Card style={{ padding: 18, textAlign: 'center' }}>
          <div style={{ fontSize: 24, marginBottom: 4 }}>✅</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700, color: G }}>{completedCount}</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 2, color: 'var(--muted)' }}>COMPLETED</div>
        </Card>
        <Card style={{ padding: 18, textAlign: 'center' }}>
          <div style={{ fontSize: 24, marginBottom: 4 }}>📦</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>{assignments.length}</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 2, color: 'var(--muted)' }}>TOTAL</div>
        </Card>
      </div>

      {/* Assignments */}
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 3, color: C, marginBottom: 16 }}>
        {assignments.length > 0 ? 'MY DELIVERIES' : 'NO DELIVERIES'}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {assignments.map(a => {
          const st = STATUS_MAP[a.status] || STATUS_MAP.assigned
          const nextStatus = NEXT_STATUS[a.status]
          const o = a.order
          const total = o ? (o.total_cents || 0) / 100 : 0
          return (
            <Card key={a.id} style={{ padding: 18, borderColor: `color-mix(in srgb, ${st.color} 24%, var(--border))` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
                <span style={{ fontSize: 22 }}>{st.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: C }}>#{o?.order_number}</span>
                    <Badge tone={st.color}>{st.label}</Badge>
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', marginTop: 3 }}>
                    {o?.shipping_address && <span>📍 {o.shipping_address} · </span>}
                    Assigned {new Date(a.assigned_at).toLocaleDateString()}
                    {a.picked_up_at && <> · Picked up {new Date(a.picked_up_at).toLocaleTimeString()}</>}
                    {a.delivered_at && <> · Delivered {new Date(a.delivered_at).toLocaleTimeString()}</>}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>${total.toFixed(2)}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)' }}>{(a.items || []).length} item{(a.items || []).length !== 1 ? 's' : ''}</div>
                </div>
              </div>

              {/* Items */}
              {(a.items || []).length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                  {a.items.map(it => (
                    <span key={it.id} style={{ fontSize: 11, color: 'var(--text)', background: 'rgba(255,255,255,0.03)', padding: '3px 8px', borderRadius: 6, border: '1px solid var(--border)' }}>
                      {it.product_name} × {it.quantity}
                    </span>
                  ))}
                </div>
              )}

              {/* Actions */}
              {nextStatus && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <NeonButton
                    variant="primary" size="sm"
                    onClick={() => updateStatus(a, nextStatus)}
                    disabled={updating === a.id}
                  >
                    {updating === a.id ? 'Updating...' : ACTION_LABELS[a.status]}
                  </NeonButton>
                  {a.status !== 'delivered' && (
                    <NeonButton variant="danger" size="sm" onClick={() => updateStatus(a, 'failed')} disabled={updating === a.id}>
                      Report Issue
                    </NeonButton>
                  )}
                </div>
              )}

              {a.notes && (
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                  📝 {a.notes}
                </div>
              )}
            </Card>
          )
        })}

        {assignments.length === 0 && (
          <EmptyState icon="📦" title="No deliveries assigned" text="When an admin assigns you orders, they'll appear here." />
        )}
      </div>

      {/* Scanner Modal */}
      {showScanner && (
        <BarcodeScanner onScan={handleScan} onClose={() => setShowScanner(false)} />
      )}
    </div>
  )
}
