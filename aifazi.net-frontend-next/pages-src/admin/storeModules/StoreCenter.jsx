'use client'
import React, { useState, useEffect } from 'react'
import api from '@/lib/api'
import { hasPermission } from '@/lib/api'
import { PageHeader, PanelErrorBoundary, useIsMobile } from '../shared'
import {
  ProductsTab, CategoriesTab, OrdersTab, InvoicesTab,
  QuotesTab, PlansTab, SubscriptionsTab,
} from '../StorePanel'
import AnalyticsTab from './AnalyticsTab'
import CustomersTab from './CustomersTab'
import PaymentsTab from './PaymentsTab'
import CouponsTab from './CouponsTab'
import VariantsTab from './VariantsTab'
import StockLedgerTab from './StockLedgerTab'
import DealsTab from './DealsTab'
import ReviewsTab from './ReviewsTab'
import InventoryTab from './InventoryTab'
import DeliveryTab from './DeliveryTab'
import TerminalTab from './TerminalTab'
import StoreOverview from './StoreOverview'

const MONO = "var(--font-mono,'JetBrains Mono',monospace)"
const G = 'var(--green)'
const C = 'var(--cyan)'

// Grouped module registry. Every module declares its permission key(s); a user can
// view a module if they hold its permission OR the base 'store' module. Admin bypasses.
const GROUPS = [
  {
    label: 'OVERVIEW', items: [
      { key: 'overview', label: 'Dashboard', icon: '◉', perm: null, always: true },
      { key: 'analytics', label: 'Analytics', icon: '📈', perm: 'store.analytics' },
    ],
  },
  {
    label: 'CATALOG', items: [
      { key: 'products', label: 'Products', icon: '📦', perm: 'store.products' },
      { key: 'categories', label: 'Categories', icon: '🗂️', perm: 'store.products' },
      { key: 'variants', label: 'Variants', icon: '🧩', perm: 'store.products' },
      { key: 'coupons', label: 'Coupons', icon: '🎟️', perm: 'store.coupons' },
      { key: 'deals', label: 'Flash Deals', icon: '⚡', perm: 'store.deals' },
    ],
  },
  {
    label: 'INVENTORY', items: [
      { key: 'stock', label: 'Stock Ledger', icon: '📊', perm: 'store.products' },
      { key: 'inventory', label: 'Inventory', icon: '🏬', perm: 'store.products' },
    ],
  },
  {
    label: 'SALES', items: [
      { key: 'orders', label: 'Orders', icon: '🧾', perm: 'store.orders' },
      { key: 'invoices', label: 'Invoices', icon: '📄', perm: 'store.orders' },
      { key: 'quotes', label: 'Quotes', icon: '💬', perm: 'store.orders' },
      { key: 'plans', label: 'Plans', icon: '👑', perm: 'store.orders' },
      { key: 'subscriptions', label: 'Subscriptions', icon: '🔁', perm: 'store.orders' },
    ],
  },
  {
    label: 'CUSTOMERS', items: [
      { key: 'customers', label: 'Customers', icon: '👤', perm: 'store.customers' },
      { key: 'reviews', label: 'Reviews', icon: '⭐', perm: 'store.reviews' },
    ],
  },
  {
    label: 'PAYMENTS', items: [
      { key: 'payments', label: 'Payments', icon: '💳', perm: 'store.payments' },
      { key: 'terminal', label: 'Terminal', icon: '📲', perm: 'store.payments' },
    ],
  },
  {
    label: 'LOGISTICS', items: [
      { key: 'delivery', label: 'Delivery', icon: '🚚', perm: 'store.delivery' },
    ],
  },
]

const MODULES = GROUPS.flatMap(g => g.items)

function canViewModule(perm, always) {
  if (always) return true
  if (hasPermission('store', 'view')) return true
  return hasPermission(perm, 'view')
}

export default function StoreCenter() {
  const isMobile = useIsMobile()
  const [tab, setTab] = useState('overview')
  const [categories, setCategories] = useState([])
  const [focusVariantProduct, setFocusVariantProduct] = useState(null)

  const visible = MODULES.filter(m => canViewModule(m.perm, m.always))
  const [prevTabSig, setPrevTabSig] = useState(tab)
  const [prevVisibleLen, setPrevVisibleLen] = useState(visible.length)
  // Fall back to a visible tab if current one is not permitted
  if ((prevTabSig !== tab || prevVisibleLen !== visible.length) && visible.length && !visible.some(m => m.key === tab)) {
    setPrevTabSig(tab)
    setPrevVisibleLen(visible.length)
    setTab(visible[0].key)
  }

  useEffect(() => {
    api.get('/store/admin/categories').then(r => setCategories(r.data || [])).catch(() => {})
  }, [])

  const openVariantsFor = p => {
    setFocusVariantProduct(p?.id || null)
    setTab('variants')
  }

  const activeModule = MODULES.find(m => m.key === tab)

  // ── Left rail nav (desktop) ──────────────────────────────────
  const rail = (
    <nav style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 200 }}>
      {GROUPS.map(group => {
        const groupVisible = group.items.filter(m => visible.some(v => v.key === m.key))
        if (groupVisible.length === 0) return null
        return (
          <div key={group.label}>
            <div style={{ fontFamily: MONO, fontSize: 8, letterSpacing: 3, color: 'var(--muted)', marginBottom: 7, paddingLeft: 10 }}>{group.label}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {groupVisible.map(m => {
                const active = tab === m.key
                return (
                  <button key={m.key} onClick={() => setTab(m.key)} title={m.label} style={{
                    display: 'flex', alignItems: 'center', gap: 9, textAlign: 'left', cursor: 'pointer',
                    padding: '8px 10px', borderRadius: 8, border: 'none',
                    fontFamily: MONO, fontSize: 11, letterSpacing: 0.5,
                    background: active ? `color-mix(in srgb, var(--green) 12%, transparent)` : 'transparent',
                    color: active ? G : 'var(--muted)', fontWeight: active ? 800 : 400,
                    borderLeft: active ? `2px solid ${G}` : '2px solid transparent',
                    transition: 'all 0.14s',
                  }}
                    onMouseEnter={e => { e.currentTarget.style.color = G }}
                    onMouseLeave={e => { e.currentTarget.style.color = active ? G : 'var(--muted)' }}>
                    <span style={{ fontSize: 13, width: 16, textAlign: 'center' }}>{m.icon}</span>
                    {m.label}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </nav>
  )

  // ── Chip nav (mobile) ────────────────────────────────────────
  const chips = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
      {GROUPS.map(group => {
        const groupVisible = group.items.filter(m => visible.some(v => v.key === m.key))
        if (groupVisible.length === 0) return null
        return (
          <div key={group.label}>
            <div style={{ fontFamily: MONO, fontSize: 8, letterSpacing: 3, color: 'var(--muted)', marginBottom: 6 }}>{group.label}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {groupVisible.map(m => {
                const active = tab === m.key
                return (
                  <button key={m.key} onClick={() => setTab(m.key)} style={{
                    fontFamily: MONO, fontSize: 10, letterSpacing: 1.2, padding: '7px 12px', borderRadius: 8, cursor: 'pointer',
                    background: active ? `color-mix(in srgb, var(--green) 12%, transparent)` : 'transparent',
                    color: active ? G : 'var(--muted)',
                    border: `1px solid ${active ? `color-mix(in srgb, var(--green) 31%, transparent)` : 'var(--border)'}`, transition: 'all 0.14s',
                  }}>{m.icon} {m.label}</button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )

  return (
    <div>
      <PageHeader
        eyebrow="STORE"
        title="Store Center"
        subtitle="Customers, payments, catalog, stock, marketing and reviews — grouped by workflow and permission-gated per module."
      />

      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
        {!isMobile && rail}

        <div style={{ flex: 1, minWidth: 0 }}>
          {isMobile && chips}

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 3, color: C, textTransform: 'uppercase' }}>
              {activeModule ? `${activeModule.icon}  ${activeModule.label}` : ''}
            </div>
          </div>

          <PanelErrorBoundary label={`Store · ${tab}`}>
            {tab === 'overview' && <StoreOverview onNavigate={setTab} />}
            {tab === 'analytics' && <AnalyticsTab />}
            {tab === 'customers' && <CustomersTab />}
            {tab === 'payments' && <PaymentsTab />}
            {tab === 'products' && <ProductsTab categories={categories} onOpenVariants={openVariantsFor} />}
            {tab === 'categories' && <CategoriesTab />}
            {tab === 'variants' && <VariantsTab key={focusVariantProduct || 'all'} focusProductId={focusVariantProduct} />}
            {tab === 'stock' && <StockLedgerTab />}
            {tab === 'inventory' && <InventoryTab />}
            {tab === 'terminal' && <TerminalTab />}
            {tab === 'coupons' && <CouponsTab />}
            {tab === 'deals' && <DealsTab />}
            {tab === 'reviews' && <ReviewsTab />}
            {tab === 'orders' && <OrdersTab />}
            {tab === 'invoices' && <InvoicesTab />}
            {tab === 'quotes' && <QuotesTab />}
            {tab === 'plans' && <PlansTab categories={categories} />}
            {tab === 'subscriptions' && <SubscriptionsTab />}
            {tab === 'delivery' && <DeliveryTab />}
          </PanelErrorBoundary>
        </div>
      </div>
    </div>
  )
}
