'use client'
import { useState, useEffect, useMemo } from 'react'
import api from '@/lib/api'
import { useForum } from '../context/ForumContext'
import { useFiveMRoute } from '@/lib/fivemRoutes'
import { NeonButton, EmptyState } from '../components/community'
import StoreHero from './store/StoreHero'
import StoreTabSwitcher from './store/StoreTabSwitcher'
import StorePlanCard from './store/StorePlanCard'
import StoreProductCard from './store/StoreProductCard'
import CartSidebar from './store/CartSidebar'
import StoreFAQ from './store/StoreFAQ'
import AccountDashboard from './store/AccountDashboard'
import DeliveryAgentPortal from './store/DeliveryAgentPortal'

function useMobile(bp = 900) {
  const [m, setM] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const q = window.matchMedia(`(max-width:${bp}px)`)
    setM(q.matches)
    const fn = e => setM(e.matches)
    q.addEventListener('change', fn)
    return () => q.removeEventListener('change', fn)
  }, [bp])
  return m
}

export default function StorePage({ fivem = false }) {
  const { user } = useForum()
  const isMobile = useMobile()
  const [plans, setPlans] = useState([])
  const [categories, setCategories] = useState([])
  const [sub, setSub] = useState(null)
  const [loading, setLoading] = useState(true)
  const [checkoutLoading, setCheckoutLoading] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [tab, setTab] = useState('vip')
  const [products, setProducts] = useState([])
  const [productsLoading, setProductsLoading] = useState(true)
  const [activeCategory, setActiveCategory] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [cart, setCart] = useState({ items: [], subtotal: 0, count: 0 })
  const [cartLoading, setCartLoading] = useState(false)
  const [checkoutCartLoading, setCheckoutCartLoading] = useState(false)
  const homeHref = useFiveMRoute('/')
  const loginHref = fivem
    ? `/login?next=${encodeURIComponent('/fivem/store')}`
    : '/login?next=%2Fstore'

  useEffect(() => {
    Promise.all([
      api.get('/store/plans').then(r => r.data || []).catch(() => []),
      api.get('/store/categories').then(r => r.data || []).catch(() => []),
      user ? api.get('/store/my-subscription').then(r => r.data || null).catch(() => null) : Promise.resolve(null),
    ]).then(([p, c, s]) => {
      setPlans(Array.isArray(p) ? p : [])
      setCategories(Array.isArray(c) ? c : [])
      setSub(s)
    }).finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  const loadProducts = () => {
    setProductsLoading(true)
    api.get('/store/products').then(r => setProducts(r.data || [])).catch(() => setProducts([]))
      .finally(() => setProductsLoading(false))
  }
  const loadCart = () => {
    if (!user) { setCart({ items: [], subtotal: 0, count: 0 }); return }
    api.get('/store/cart').then(r => setCart(r.data || { items: [], subtotal: 0, count: 0 })).catch(() => {})
  }
  useEffect(() => {
    if (tab === 'shop') { loadProducts(); loadCart() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, user])

  const addToCart = async (product) => {
    if (!user) { window.location.href = loginHref; return }
    setCartLoading(true)
    try {
      await api.post('/store/cart', { product_id: product.id, quantity: 1 })
      toastMessage(`Added ${product.name} to cart`)
      loadCart()
    } catch (err) {
      setError(err?.response?.data?.error || err?.response?.data?.detail || 'Could not add to cart.')
    } finally { setCartLoading(false) }
  }

  const updateCartQty = async (item, qty) => {
    try {
      if (qty < 1) { await api.delete(`/store/cart/${item.id}`) }
      else await api.patch(`/store/cart/${item.id}`, { quantity: qty })
      loadCart()
    } catch (err) {
      setError(err?.response?.data?.error || err?.response?.data?.detail || 'Could not update cart.')
    }
  }

  const removeCartItem = async (item) => {
    try { await api.delete(`/store/cart/${item.id}`); loadCart() }
    catch (err) { setError(err?.response?.data?.error || 'Could not remove item.') }
  }

  const clearCart = async () => {
    try { await api.post('/store/cart/clear'); loadCart() }
    catch (err) { setError(err?.response?.data?.error || 'Could not clear cart.') }
  }

  const checkoutCart = async () => {
    if (!user) { window.location.href = loginHref; return }
    setError(''); setNotice(''); setCheckoutCartLoading(true)
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://aifazi.net'
    try {
      const r = await api.post('/store/checkout/cart', {
        success_url: `${origin}/store/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/store`,
      })
      if (r.data?.url) window.location.href = r.data.url
      else setError('Checkout could not be started. Please try again.')
    } catch (err) {
      setError(err?.response?.data?.error || err?.response?.data?.detail || 'Checkout failed. Please try again.')
    } finally { setCheckoutCartLoading(false) }
  }

  const toastMessage = (msg) => { setNotice(msg); setTimeout(() => setNotice(''), 3000) }

  const handleSubscribe = async (plan) => {
    setError(''); setNotice(''); setCheckoutLoading(plan.slug)
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://aifazi.net'
    try {
      const r = await api.post('/store/checkout', {
        plan_slug: plan.slug,
        success_url: `${origin}/store/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/store`,
      })
      if (r.data?.url) window.location.href = r.data.url
      else setError('Checkout could not be started. Please try again.')
    } catch (err) {
      setError(err?.response?.data?.detail || 'Checkout failed. Please try again.')
    } finally { setCheckoutLoading('') }
  }

  const handleManage = async () => {
    setError(''); setNotice('')
    try {
      const r = await api.post('/store/portal')
      if (r.data?.url) window.location.href = r.data.url
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not open billing portal.')
    }
  }

  const handleCancel = async () => {
    if (!window.confirm('Cancel your subscription at the end of the current billing period? Your perks stay active until then.')) return
    setError(''); setNotice('')
    try {
      await api.post('/store/cancel')
      setNotice('Cancellation scheduled — perks remain active until the end of the period.')
      const r = await api.get('/store/my-subscription').catch(() => null)
      setSub(r?.data || sub)
    } catch (err) {
      setError(err?.response?.data?.detail || 'Cancel failed.')
    }
  }

  const sortedPlans = [...plans].sort((a, b) => a.level - b.level)
  const currentLevel = sub?.subscription?.plan_level || 0
  const currentStatus = sub?.subscription?.status
  const featuredIndex = sortedPlans.length >= 6 ? 3 : Math.floor(sortedPlans.length / 2)

  const filteredProducts = useMemo(() => {
    let list = products
    if (activeCategory) list = list.filter(p => p.category === activeCategory)
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      list = list.filter(p => (p.name || '').toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q))
    }
    return list
  }, [products, activeCategory, searchQuery])

  const C = 'var(--cyan)'

  return (
    <div style={{ minHeight: '100vh', color: 'var(--text)', fontFamily: 'var(--font-display)', paddingBottom: 60 }}>
      <StoreHero
        fivem={fivem} tab={tab} user={user} sub={sub}
        notice={notice} error={error}
        loginHref={loginHref} homeHref={homeHref}
        handleManage={handleManage} handleCancel={handleCancel}
        isMobile={isMobile}
      />

      <StoreTabSwitcher tab={tab} setTab={v => { setTab(v); setError(''); setNotice('') }} cartCount={cart.count}
        extraTabs={user ? [['delivery', '🚚 DELIVERY']] : []}
      />

      {/* ── VIP TAB ──────────────────────────────────────────── */}
      {tab === 'vip' && (
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: isMobile ? '28px 16px 0' : '40px 24px 0' }}>
          {loading ? (
            <div className="store-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20 }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="community-card" style={{ padding: 28 }}>
                  <div className="community-skel" style={{ width: '60%', height: 14, marginBottom: 16 }} />
                  <div className="community-skel" style={{ width: '40%', height: 24, marginBottom: 16 }} />
                  <div className="community-skel" style={{ width: '100%', height: 8, marginBottom: 8 }} />
                  <div className="community-skel" style={{ width: '100%', height: 8, marginBottom: 8 }} />
                  <div className="community-skel" style={{ width: '80%', height: 8 }} />
                </div>
              ))}
            </div>
          ) : sortedPlans.length === 0 ? (
            <EmptyState icon="📦" title="No plans available" text="Check back soon." />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, alignItems: 'stretch' }}>
              {sortedPlans.map((plan, i) => (
                <StorePlanCard
                  key={plan.id || plan.slug}
                  plan={plan} index={i}
                  featuredIndex={featuredIndex}
                  currentLevel={currentLevel} currentStatus={currentStatus}
                  checkoutLoading={checkoutLoading}
                  user={user} loginHref={loginHref}
                  handleSubscribe={handleSubscribe}
                />
              ))}
            </div>
          )}

          <StoreFAQ isMobile={isMobile} />
        </div>
      )}

      {/* ── SHOP TAB ─────────────────────────────────────────── */}
      {tab === 'shop' && (
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: isMobile ? '28px 16px 0' : '40px 24px 0' }}>
          {/* Filters */}
          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 12, marginBottom: 24, justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'center' }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={() => setActiveCategory('')} className={`store-filter-pill ${activeCategory === '' ? 'active' : ''}`}>ALL</button>
              {categories.map(c => (
                <button key={c.id} onClick={() => setActiveCategory(c.slug)} className={`store-filter-pill ${activeCategory === c.slug ? 'active' : ''}`}>{c.icon} {c.name}</button>
              ))}
            </div>
            <div className="community-search" style={{ minWidth: isMobile ? '100%' : 240 }}>
              <span className="community-search-icon">⌕</span>
              <input
                className="community-search-input"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search products..."
                style={{ paddingLeft: 38, paddingRight: 38 }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 320px', gap: 24, alignItems: 'start' }}>
            {/* Product grid */}
            <div>
              {productsLoading ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="community-card" style={{ padding: 20 }}>
                      <div className="community-skel" style={{ width: '100%', height: 110, marginBottom: 12, borderRadius: 10 }} />
                      <div className="community-skel" style={{ width: '60%', height: 12, marginBottom: 8 }} />
                      <div className="community-skel" style={{ width: '40%', height: 20 }} />
                    </div>
                  ))}
                </div>
              ) : filteredProducts.length === 0 ? (
                <div>
                  <EmptyState
                    icon="🛍️"
                    title="No products found"
                    text={searchQuery || activeCategory ? `No products match "${searchQuery || activeCategory}"` : 'No products here right now.'}
                  />
                  {(searchQuery || activeCategory) && (
                    <div style={{ marginTop: 12, textAlign: 'center' }}>
                      <NeonButton variant="ghost" size="sm" onClick={() => { setSearchQuery(''); setActiveCategory('') }}>Clear Filters</NeonButton>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
                  {filteredProducts.map(p => (
                    <StoreProductCard key={p.id} product={p} cartLoading={cartLoading} addToCart={addToCart} />
                  ))}
                </div>
              )}
            </div>

            <CartSidebar
              cart={cart} user={!!user} loginHref={loginHref}
              isMobile={isMobile} isLoading={checkoutCartLoading}
              updateCartQty={updateCartQty}
              removeCartItem={removeCartItem}
              clearCart={clearCart}
              checkoutCart={checkoutCart}
            />
          </div>
        </div>
      )}

      {/* ── ACCOUNT TAB ───────────────────────────────────────── */}
      {tab === 'orders' && (
        <div style={{ maxWidth: 860, margin: '0 auto', padding: isMobile ? '28px 16px 0' : '40px 24px 0' }}>
          <AccountDashboard loginHref={loginHref} />
        </div>
      )}

      {/* ── DELIVERY TAB ───────────────────────────────────────── */}
      {tab === 'delivery' && (
        <div style={{ maxWidth: 900, margin: '0 auto', padding: isMobile ? '28px 16px 0' : '40px 24px 0' }}>
          <DeliveryAgentPortal />
        </div>
      )}

      <div className="store-footer" style={{ maxWidth: 1000, margin: '0 auto', padding: '40px 24px 0', textAlign: 'center', fontSize: 10, color: 'var(--muted)', lineHeight: 1.8 }}>
        Payments are processed securely by <span style={{ color: '#635bff' }}>Stripe</span>. By subscribing you agree to the server rules.
        All purchases support the AIFAZI RP community.
      </div>
    </div>
  )
}
