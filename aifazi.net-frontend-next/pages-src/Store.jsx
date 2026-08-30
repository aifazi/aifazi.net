'use client'
import { useState, useEffect, useMemo } from 'react'
import { useSearchParams, useNavigate } from '@/lib/router-compat'
import api from '@/lib/api'
import { useForum } from '../context/ForumContext'
import { useFiveMRoute } from '@/lib/fivemRoutes'
import { Card, NeonButton, Badge, EmptyState } from '../components/community'
import { SITE_URL, STORE_URL, hostOf } from '@/lib/config'
import StorePlanCard from './store/StorePlanCard'
import StoreProductCard from './store/StoreProductCard'
import CartDrawer from './store/CartDrawer'
import StoreFAQ from './store/StoreFAQ'
import AccountDashboard from './store/AccountDashboard'
import DeliveryAgentPortal from './store/DeliveryAgentPortal'

const TRUSTED_CHECKOUT_HOSTS = ['checkout.stripe.com', 'stripe.com']
function safeCheckoutRedirect(url) {
  try {
    const u = new URL(url)
    if (TRUSTED_CHECKOUT_HOSTS.includes(u.hostname)) {
      window.location.href = url
    }
  } catch {}
}

const G = 'var(--green)', C = 'var(--cyan)', R = 'var(--red)', Y = 'var(--orange)'
const mix = (c, p) => `color-mix(in srgb, ${c} ${p}%, transparent)`

function useMobile(bp = 768) {
  const [m, setM] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(`(max-width:${bp}px)`).matches
  )
  useEffect(() => {
    if (typeof window === 'undefined') return
    const q = window.matchMedia(`(max-width:${bp}px)`)
    const fn = e => setM(e.matches)
    q.addEventListener('change', fn)
    return () => q.removeEventListener('change', fn)
  }, [bp])
  return m
}

export default function StorePage({ fivem = false }) {
  const { user } = useForum()
  const navigate = useNavigate()
  const searchParams = useSearchParams()
  const isMobile = useMobile()
  const [plans, setPlans] = useState([])
  const [categories, setCategories] = useState([])
  const [products, setProducts] = useState([])
  const [productsLoading, setProductsLoading] = useState(true)
  const [loading, setLoading] = useState(true)
  const [sub, setSub] = useState(null)
  const [checkoutLoading, setCheckoutLoading] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [tab, setTab] = useState(() => searchParams?.get('tab') || 'home')
  const [activeCategory, setActiveCategory] = useState(() => searchParams?.get('cat') || '')
  const [searchQuery, setSearchQuery] = useState(() => searchParams?.get('q') || '')

  // Keep ?cat=&q=&tab= shareable
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const needs = { tab, cat: activeCategory, q: searchQuery }
    let changed = false
    for (const [k, v] of Object.entries(needs)) {
      const cur = params.get(k)
      if (v) { if (cur !== v) { params.set(k, v); changed = true } }
      else if (cur != null) { params.delete(k); changed = true }
    }
    // keep existing other params (e.g. ?theme=)
    if (changed) window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`)
  }, [tab, activeCategory, searchQuery])
  const [cart, setCart] = useState({ items: [], subtotal: 0, count: 0 })
  const [cartLoading, setCartLoading] = useState(false)
  const [checkoutCartLoading, setCheckoutCartLoading] = useState(false)
  const [cartOpen, setCartOpen] = useState(false)

  const storeHref = typeof window !== 'undefined' && window.location.hostname === hostOf(STORE_URL) ? '/' : '/store'
  const loginHref = fivem ? `/login?next=${encodeURIComponent('/fivem/store')}` : `/login?next=${encodeURIComponent(storeHref)}`
  const dispatchCartUpdate = () => window.dispatchEvent(new CustomEvent('store-cart-updated'))

  useEffect(() => {
    Promise.all([
      api.get('/store/plans').then(r => r.data || []).catch(() => []),
      api.get('/store/categories').then(r => r.data || []).catch(() => []),
      api.get('/store/products').then(r => r.data || []).catch(() => []),
      user ? api.get('/store/my-subscription').then(r => r.data || null).catch(() => null) : Promise.resolve(null),
    ]).then(([p, c, prods, s]) => {
      setPlans(Array.isArray(p) ? p : [])
      setCategories(Array.isArray(c) ? c : [])
      setProducts(Array.isArray(prods) ? prods : [])
      setSub(s)
      setProductsLoading(false)
    }).finally(() => setLoading(false))
  }, [user])

  const loadCart = () => {
    if (!user) { setCart({ items: [], subtotal: 0, count: 0 }); return }
    api.get('/store/cart').then(r => setCart(r.data || { items: [], subtotal: 0, count: 0 })).catch(() => {})
  }

  useEffect(() => { void (async () => { await loadCart() })() }, [user])

  // Open cart drawer when item added
  const openCartAfterAdd = () => {
    setCartOpen(true)
    dispatchCartUpdate()
  }

  const addToCart = async (product) => {
    if (!user) { window.location.href = loginHref; return }
    setCartLoading(true)
    try {
      await api.post('/store/cart', { product_id: product.id, quantity: 1 })
      await loadCart()
      openCartAfterAdd()
      setNotice(`Added ${product.name}`)
      setTimeout(() => setNotice(''), 2500)
    } catch (err) { setError(err?.response?.data?.detail || 'Could not add to cart.') }
    finally { setCartLoading(false) }
  }

  const updateCartQty = async (item, qty) => {
    try {
      if (qty < 1) await api.delete(`/store/cart/${item.id}`)
      else await api.patch(`/store/cart/${item.id}`, { quantity: qty })
      loadCart(); dispatchCartUpdate()
    } catch (err) { setError(err?.response?.data?.detail || 'Could not update cart.') }
  }

  const removeCartItem = async (item) => {
    try { await api.delete(`/store/cart/${item.id}`); loadCart(); dispatchCartUpdate() }
    catch (err) { setError(err?.response?.data?.detail || 'Could not remove.') }
  }

  const clearCart = async () => {
    try { await api.post('/store/cart/clear'); loadCart(); dispatchCartUpdate() }
    catch (err) { setError(err?.response?.data?.detail || 'Could not clear.') }
  }

  const checkoutCart = async () => {
    if (!user) { window.location.href = loginHref; return }
    setError(''); setCheckoutCartLoading(true)
    const origin = typeof window !== 'undefined' ? window.location.origin : SITE_URL
    try {
      const r = await api.post('/store/checkout/cart', {
        success_url: `${origin}/store/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/store`,
      })
      if (r.data?.url) safeCheckoutRedirect(r.data.url)
      else setError('Checkout could not be started.')
    } catch (err) { setError(err?.response?.data?.detail || 'Checkout failed.') }
    finally { setCheckoutCartLoading(false) }
  }

  const handleSubscribe = async (plan) => {
    setError(''); setCheckoutLoading(plan.slug)
    const origin = typeof window !== 'undefined' ? window.location.origin : SITE_URL
    try {
      const r = await api.post('/store/checkout', {
        plan_slug: plan.slug,
        success_url: `${origin}/store/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/store`,
      })
      if (r.data?.url) safeCheckoutRedirect(r.data.url)
    } catch (err) { setError(err?.response?.data?.detail || 'Checkout failed.') }
    finally { setCheckoutLoading('') }
  }

  const sortedPlans = [...plans].sort((a, b) => a.level - b.level)
  const currentLevel = sub?.subscription?.plan_level || 0
  const currentStatus = sub?.subscription?.status
  const featuredIndex = sortedPlans.length >= 6 ? 3 : Math.floor(sortedPlans.length / 2)

  const filteredProducts = useMemo(() => {
    let list = products
    if (activeCategory) list = list.filter(p => (p.category || '').toLowerCase() === activeCategory.toLowerCase())
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      list = list.filter(p => (p.name || '').toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q))
    }
    return list
  }, [products, activeCategory, searchQuery])

  const featuredProducts = products.filter(p => p.featured).slice(0, 8)
  const newProducts = [...products].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)).slice(0, 4)

  const setTabAndUrl = (newTab) => {
    setTab(newTab)
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      if (newTab === 'home') url.searchParams.delete('tab')
      else url.searchParams.set('tab', newTab)
      window.history.replaceState({}, '', url.toString())
    }
  }

  const TABS = [
    ['home', '🏠 Home'],
    ['vip', '👑 VIP'],
    ['shop', '🛒 Shop'],
    ['orders', '📋 Account'],
    ['profile', '👤 Profile'],
  ]
  if (user) TABS.push(['delivery', '🚚 Delivery'])

  const handleTabClick = (k) => {
    if (k === 'profile') { navigate('/profile'); return }
    setTabAndUrl(k); setError(''); setNotice('')
  }

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      {/* Toasts */}
      {(notice || error) && (
        <div style={{ position: 'fixed', top: 80, left: '50%', transform: 'translateX(-50%)', zIndex: 200, maxWidth: 480, width: 'calc(100% - 32px)' }}>
          {notice && (
            <div style={{ padding: '12px 20px', background: mix(G, 12), border: `1px solid ${mix(G, 30)}`, borderRadius: 12, color: G, fontSize: 13, fontWeight: 600, textAlign: 'center' }}>{notice}</div>
          )}
          {error && (
            <div style={{ padding: '12px 20px', background: mix(R, 12), border: `1px solid ${mix(R, 30)}`, borderRadius: 12, color: R, fontSize: 13, fontWeight: 600, textAlign: 'center', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{error}</span>
              <button onClick={() => setError('')} style={{ background: 'none', border: 'none', color: R, cursor: 'pointer', fontWeight: 700 }}>✕</button>
            </div>
          )}
        </div>
      )}

      {/* ── HOME TAB ── */}
      {tab === 'home' && (
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 24px' }}>
          {/* Hero */}
          <div className="ec-hero" style={{ marginTop: 32 }}>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 32, alignItems: 'center' }}>
              <div>
                <div className="ec-section-eyebrow" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 20, border: `1px solid ${mix(G, 25)}`, background: mix(G, 6), marginBottom: 20 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: G, boxShadow: `0 0 8px ${G}` }} /> OFFICIAL STORE
                </div>
                <h1 style={{ fontFamily: 'var(--font-display)', fontSize: isMobile ? 'clamp(28px, 8vw, 38px)' : 'clamp(32px, 4vw, 48px)', fontWeight: 800, color: 'var(--text)', margin: '0 0 16px', lineHeight: 1.1, letterSpacing: -1 }}>
                  Premium Gear &<br /><span style={{ background: `linear-gradient(135deg, ${G}, ${C})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>VIP Perks</span>
                </h1>
                <p style={{ fontSize: 15, color: 'var(--muted)', lineHeight: 1.7, margin: '0 0 28px', maxWidth: 440 }}>
                  The official AIFAZI marketplace. Browse products, unlock VIP perks, and get instant digital delivery.
                </p>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <NeonButton variant="primary" size="lg" onClick={() => setTabAndUrl('shop')}>Browse Shop</NeonButton>
                  <NeonButton variant="ghost" size="lg" onClick={() => { setCartOpen(true) }}>🛒 View Cart {cart.count > 0 && `(${cart.count})`}</NeonButton>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {[
                  ['👑', 'VIP Perks', G, 'Monthly subscriptions'],
                  ['🛒', 'Shop', C, 'Digital & physical'],
                  ['📦', 'Tracked', Y, 'Order tracking'],
                  ['⬇', 'Instant', G, 'Digital delivery'],
                ].map(([icon, label, color, sub]) => (
                  <div key={label} style={{ padding: '18px 14px', borderRadius: 14, border: `1px solid ${mix(color, 18)}`, background: mix(color, 5), textAlign: 'center' }}>
                    <div style={{ fontSize: 28, marginBottom: 6 }}>{icon}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color }}>{label}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--muted)', letterSpacing: 1, marginTop: 2 }}>{sub}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Trust bar */}
          <div style={{ display: 'flex', gap: 0, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 48, padding: '16px 0', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
            {[
              ['🔒', 'Secure Stripe'],
              ['⚡', 'Instant Delivery'],
              ['🔄', '30-Day Returns'],
              ['📦', 'Tracked Shipping'],
              ['💬', '24/7 Support'],
            ].map(([icon, label]) => (
              <div key={label} className="ec-trust-badge"><span>{icon}</span> {label}</div>
            ))}
          </div>

          {/* Categories */}
          {categories.length > 0 && (
            <div style={{ marginBottom: 48 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <div><div className="ec-section-eyebrow">Browse</div><h2 className="ec-section-title">Shop by Category</h2></div>
                <button onClick={() => setTabAndUrl('shop')} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2, color: C, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>VIEW ALL →</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(categories.length, isMobile ? 3 : 6)}, 1fr)`, gap: 12 }}>
                {categories.map(c => (
                  <div key={c.id} className="ec-cat-card" onClick={() => { setTabAndUrl('shop'); setActiveCategory(c.slug || c.name) }}>
                    <div className="ec-cat-icon">{c.icon || '🛒'}</div>
                    <div className="ec-cat-name">{c.name}</div>
                    <div className="ec-cat-count">{products.filter(p => (p.category || '').toLowerCase() === (c.name || '').toLowerCase()).length} items</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Featured Products */}
          {featuredProducts.length > 0 && (
            <div style={{ marginBottom: 48 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <div><div className="ec-section-eyebrow">Featured</div><h2 className="ec-section-title">Featured Products</h2></div>
                <button onClick={() => setTabAndUrl('shop')} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2, color: C, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>VIEW ALL →</button>
              </div>
              <div className="ec-grid">
                {featuredProducts.slice(0, isMobile ? 4 : 8).map(p => (
                  <StoreProductCard key={p.id} product={p} cartLoading={cartLoading} addToCart={addToCart} />
                ))}
              </div>
            </div>
          )}

          {/* New Arrivals */}
          {newProducts.length > 0 && (
            <div style={{ marginBottom: 48 }}>
              <div style={{ marginBottom: 20 }}>
                <div className="ec-section-eyebrow">Fresh</div>
                <h2 className="ec-section-title">New Arrivals</h2>
              </div>
              <div className="ec-grid">
                {newProducts.map(p => (
                  <StoreProductCard key={p.id} product={p} cartLoading={cartLoading} addToCart={addToCart} />
                ))}
              </div>
            </div>
          )}

          {/* Promo cards */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16, marginBottom: 48 }}>
            <div className="ec-cat-card" style={{ textAlign: 'left', padding: 28, alignItems: 'flex-start', cursor: 'pointer' }} onClick={() => setTabAndUrl('vip')}>
              <div style={{ fontSize: 36 }}>👑</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>VIP Subscriptions</div>
              <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>Unlock in-game perks, priority access, and exclusive content. Auto-applied on join.</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: G, marginTop: 8, fontWeight: 700 }}>VIEW PLANS →</div>
            </div>
            <div className="ec-cat-card" style={{ textAlign: 'left', padding: 28, alignItems: 'flex-start', cursor: 'pointer', borderColor: mix(C, 20) }} onClick={() => setTabAndUrl('orders')}>
              <div style={{ fontSize: 36 }}>📋</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>Track Your Order</div>
              <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>Check status, download digital goods, and manage your account in one place.</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: C, marginTop: 8, fontWeight: 700 }}>MY ACCOUNT →</div>
            </div>
          </div>
        </div>
      )}

      {/* ── Tab Bar ── */}
      <div style={{ position: 'sticky', top: 64, zIndex: 50, background: 'color-mix(in srgb, var(--bg) 92%, transparent)', backdropFilter: 'blur(12px)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', justifyContent: 'center', gap: 8, padding: '10px 20px', flexWrap: 'wrap' }}>
          {TABS.map(([k, label]) => (
            <button key={k} onClick={() => handleTabClick(k)} className={`store-tab-pill ${tab === k ? 'active' : ''}`}>{label}</button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '32px 24px 48px' }}>
        {/* ── VIP TAB ── */}
        {tab === 'vip' && (
          <>
            {loading ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20 }}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <Card key={i} style={{ padding: 28 }}>
                    <div className="community-skel" style={{ width: '60%', height: 14, marginBottom: 16 }} />
                    <div className="community-skel" style={{ width: '40%', height: 24, marginBottom: 16 }} />
                    <div className="community-skel" style={{ width: '100%', height: 8, marginBottom: 8 }} />
                    <div className="community-skel" style={{ width: '80%', height: 8 }} />
                  </Card>
                ))}
              </div>
            ) : sortedPlans.length === 0 ? (
              <EmptyState icon="📦" title="No plans available" text="Check back soon." />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, alignItems: 'stretch' }}>
                {sortedPlans.map((plan, i) => (
                  <StorePlanCard key={plan.id || plan.slug} plan={plan} index={i} featuredIndex={featuredIndex} currentLevel={currentLevel} currentStatus={currentStatus} checkoutLoading={checkoutLoading} user={!!user} loginHref={loginHref} handleSubscribe={handleSubscribe} />
                ))}
              </div>
            )}
            <StoreFAQ isMobile={isMobile} />
          </>
        )}

        {/* ── SHOP TAB ── */}
        {tab === 'shop' && (
          <div>
            {/* Filters */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 24, justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={() => setActiveCategory('')} className={`store-filter-pill ${activeCategory === '' ? 'active' : ''}`}>ALL</button>
                {categories.map(c => (
                  <button key={c.id} onClick={() => setActiveCategory(c.slug || c.name)} className={`store-filter-pill ${(activeCategory || '').toLowerCase() === (c.slug || c.name || '').toLowerCase() ? 'active' : ''}`}>{c.icon} {c.name}</button>
                ))}
              </div>
              <button onClick={() => setCartOpen(true)} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1, color: G, background: 'none', border: `1px solid ${mix(G, 25)}`, borderRadius: 10, padding: '8px 16px', cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                🛒 Cart {cart.count > 0 && <Badge tone="green">{cart.count}</Badge>}
              </button>
            </div>

            {productsLoading ? (
              <div className="ec-grid">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} style={{ borderRadius: 16, border: '1px solid var(--border)', overflow: 'hidden' }}>
                    <div className="community-skel" style={{ width: '100%', aspectRatio: 1 }} />
                    <div style={{ padding: 14 }}>
                      <div className="community-skel" style={{ width: '50%', height: 10, marginBottom: 8 }} />
                      <div className="community-skel" style={{ width: '30%', height: 18 }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredProducts.length === 0 ? (
              <EmptyState icon="🛍️" title="No products found" text={searchQuery || activeCategory ? 'Try a different filter.' : 'Products coming soon.'} />
            ) : (
              <div className="ec-grid">
                {filteredProducts.map(p => (
                  <StoreProductCard key={p.id} product={p} cartLoading={cartLoading} addToCart={addToCart} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── ACCOUNT TAB ── */}
        {tab === 'orders' && <AccountDashboard loginHref={loginHref} />}

        {/* ── DELIVERY TAB ── */}
        {tab === 'delivery' && <DeliveryAgentPortal />}
      </div>

      {/* Cart Drawer */}
      <CartDrawer
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        cart={cart}
        user={!!user}
        loginHref={loginHref}
        isLoading={checkoutCartLoading}
        updateCartQty={updateCartQty}
        removeCartItem={removeCartItem}
        clearCart={clearCart}
        checkoutCart={checkoutCart}
        isMobile={isMobile}
      />
    </div>
  )
}