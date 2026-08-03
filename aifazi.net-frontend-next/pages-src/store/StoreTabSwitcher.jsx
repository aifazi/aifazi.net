'use client'
import { Badge } from '../../components/community'

const TABS = [
  ['vip', '👑 VIP SUBSCRIPTIONS'],
  ['shop', '🛒 PRODUCTS'],
  ['orders', '🧾 MY ORDERS'],
]
const G = 'var(--green)'

export default function StoreTabSwitcher({ tab, setTab, cartCount }) {
  return (
    <div className="store-tab-bar" style={{ position: 'sticky', top: 0, zIndex: 40, background: 'color-mix(in srgb, var(--bg) 88%, transparent)', backdropFilter: 'blur(12px)', borderBottom: '1px solid var(--border2)' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', justifyContent: 'center', gap: 8, padding: '12px 20px', flexWrap: 'wrap' }}>
        {TABS.map(([k, label]) => (
          <button
            key={k}
            onClick={() => { setTab(k) }}
            className={`store-tab-pill ${tab === k ? 'active' : ''}`}
            style={tab === k ? {} : undefined}
          >
            {label}
            {k === 'shop' && cartCount > 0 && (
              <Badge tone="green">{cartCount}</Badge>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
