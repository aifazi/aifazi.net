'use client'
import React, { useState, useCallback, useEffect } from 'react'
import api from '@/lib/api'
import { hasPermission } from '@/lib/api'
import { useToast } from '../../../components/Toast'
import { PageHeader, PanelErrorBoundary } from '../shared'
import {
  SalesTab, ProductsTab, CategoriesTab, OrdersTab, InvoicesTab,
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

const MONO = "var(--font-mono,'JetBrains Mono',monospace)"
const G = '#00FF88'

// Each module declares its permission key(s). A user can view a module if they
// hold the module's permission OR the base 'store' module. Admin bypasses.
const MODULES = [
  { key: 'analytics',     label: 'ANALYTICS',   icon: '📈', perm: 'store.analytics' },
  { key: 'customers',     label: 'CUSTOMERS',   icon: '👤', perm: 'store.customers' },
  { key: 'payments',      label: 'PAYMENTS',    icon: '💳', perm: 'store.payments' },
  { key: 'products',      label: 'PRODUCTS',    icon: '📦', perm: 'store.products' },
  { key: 'categories',    label: 'CATEGORIES',  icon: '🗂️', perm: 'store.products' },
  { key: 'variants',      label: 'VARIANTS',    icon: '🧩', perm: 'store.products' },
  { key: 'stock',         label: 'STOCK',       icon: '📦', perm: 'store.products' },
  { key: 'coupons',       label: 'COUPONS',     icon: '🎟️', perm: 'store.coupons' },
  { key: 'deals',         label: 'FLASH DEALS', icon: '⚡', perm: 'store.deals' },
  { key: 'reviews',       label: 'REVIEWS',     icon: '⭐', perm: 'store.reviews' },
  { key: 'orders',        label: 'ORDERS',      icon: '🧾', perm: 'store.orders' },
  { key: 'invoices',      label: 'INVOICES',    icon: '📄', perm: 'store.orders' },
  { key: 'quotes',        label: 'QUOTES',      icon: '💬', perm: 'store.orders' },
  { key: 'plans',         label: 'PLANS',       icon: '👑', perm: 'store.orders' },
  { key: 'subscriptions', label: 'SUBSCRIPTIONS', icon: '🔁', perm: 'store.orders' },
]

function canViewModule(perm) {
  if (hasPermission('store', 'view')) return true
  return hasPermission(perm, 'view')
}

export default function StoreCenter() {
  const toast = useToast()
  const [tab, setTab] = useState('analytics')
  const [sales, setSales] = useState(null)
  const [categories, setCategories] = useState([])
  const [salesLoading, setSalesLoading] = useState(true)
  const [focusVariantProduct, setFocusVariantProduct] = useState(null)

  const visible = MODULES.filter(m => canViewModule(m.perm))
  // Fall back to a visible tab if current one is not permitted
  useEffect(() => {
    if (visible.length && !visible.some(m => m.key === tab)) setTab(visible[0].key)
  }, [visible.length, tab])

  const loadSales = useCallback(() => {
    setSalesLoading(true)
    api.get('/store/admin/sales').then(r => setSales(r.data || null)).catch(() => toast.error('Failed to load sales overview'))
      .finally(() => setSalesLoading(false))
  }, [toast])

  useEffect(() => {
    api.get('/store/admin/categories').then(r => setCategories(r.data || [])).catch(() => {})
  }, [])

  const openVariantsFor = p => {
    setFocusVariantProduct(p?.id || null)
    setTab('variants')
  }

  return (
    <div>
      <PageHeader
        eyebrow="STORE"
        title="Store Center"
        subtitle="Customers, payments, catalog, stock, marketing and reviews — permission-gated per module."
        actions={<button onClick={loadSales} style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 1, padding: '7px 14px', background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer', borderRadius: 6 }}>↻ REFRESH</button>}
      />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        {visible.map(m => (
          <button key={m.key} onClick={() => setTab(m.key)} style={{
            fontFamily: MONO, fontSize: 10, letterSpacing: 1.5, padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
            background: tab === m.key ? `${G}14` : 'transparent', color: tab === m.key ? G : 'var(--muted)',
            border: `1px solid ${tab === m.key ? `${G}50` : 'var(--border)'}`, transition: 'all 0.14s',
          }}>{m.icon} {m.label}</button>
        ))}
      </div>

      <PanelErrorBoundary label={`Store · ${tab}`}>
        {tab === 'analytics' && <AnalyticsTab />}
        {tab === 'customers' && <CustomersTab />}
        {tab === 'payments' && <PaymentsTab />}
        {tab === 'products' && <ProductsTab categories={categories} onOpenVariants={openVariantsFor} />}
        {tab === 'categories' && <CategoriesTab />}
        {tab === 'variants' && <VariantsTab key={focusVariantProduct || 'all'} focusProductId={focusVariantProduct} />}
        {tab === 'stock' && <StockLedgerTab />}
        {tab === 'coupons' && <CouponsTab />}
        {tab === 'deals' && <DealsTab />}
        {tab === 'reviews' && <ReviewsTab />}
        {tab === 'orders' && <OrdersTab />}
        {tab === 'invoices' && <InvoicesTab />}
        {tab === 'quotes' && <QuotesTab />}
        {tab === 'plans' && <PlansTab categories={categories} />}
        {tab === 'subscriptions' && <SubscriptionsTab />}
        {tab === 'sales' && (salesLoading ? <div className="loader" /> : <SalesTab data={sales} onRefresh={loadSales} />)}
      </PanelErrorBoundary>
    </div>
  )
}
