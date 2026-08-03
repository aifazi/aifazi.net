'use client'
import { useState, useEffect } from 'react'
import { useForum } from '../context/ForumContext'
import ForumProfile from './ForumProfile'
import TrackOrderWidget from '../components/TrackOrderWidget'
import { Card, NeonButton, Badge } from '../components/community'
import api from '@/lib/api'

const G = 'var(--green)', C = 'var(--cyan)'

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
