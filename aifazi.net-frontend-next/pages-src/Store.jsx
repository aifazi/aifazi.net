'use client'
import { useState, useEffect, useMemo } from 'react'
import api from '@/lib/api'
import { useForum } from '../context/ForumContext'
import { useFiveMRoute } from '@/lib/fivemRoutes'
import { Link } from '@/lib/router-compat'

const G = 'var(--green)'
const C = 'var(--cyan)'
const Y = '#ffd700'
const R = 'var(--red)'
const O = 'var(--orange)'
const P = 'var(--purple)'
const MONO = "var(--font-mono,'JetBrains Mono',monospace)"

const TIER_COLORS = ['#8a9bb0', 'var(--green)', 'var(--cyan)', 'var(--purple)', '#ffd700', '#ff6b6b']
// alpha helper for CSS-var colors → valid color-mix value
const mix = (c, p) => `color-mix(in srgb, ${c} ${p}%, transparent)`

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
  const [orders, setOrders] = useState([])
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [orderDetail, setOrderDetail] = useState(null)
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
  const loadOrders = () => {
    if (!user) { setOrders([]); return }
    setOrdersLoading(true)
    api.get('/store/orders').then(r => setOrders(r.data || [])).catch(() => setOrders([]))
      .finally(() => setOrdersLoading(false))
  }
  const openOrder = async (o) => {
    try {
      const r = await api.get(`/store/orders/${o.order_number}`)
      setOrderDetail(r.data || o)
    } catch { setOrderDetail(o) }
  }

  useEffect(() => {
    if (tab === 'shop') { loadProducts(); loadCart() }
    if (tab === 'orders') loadOrders()
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

  const TABS = [
    ['vip', '👑 VIP SUBSCRIPTIONS'],
    ['shop', '🛒 PRODUCTS'],
    ['orders', '🧾 MY ORDERS'],
  ]

  const statusColor = s => s === 'delivered' || s === 'paid' ? G : s === 'cancelled' || s === 'refunded' ? R : s === 'shipped' ? P : s === 'processing' ? C : Y

  const panel = {
    background: 'color-mix(in srgb, var(--text) 2%, transparent)',
    border: '1px solid var(--border)', borderRadius: 14,
  }
  const cta = {
    background: `linear-gradient(135deg, var(--green), var(--cyan))`,
    color: '#000', fontWeight: 800, border: 'none', borderRadius: 10,
  }

  return (
    <div style={{ minHeight: '100vh', color: 'var(--text)', fontFamily: MONO, paddingBottom: 60 }}>
      {/* ── Hero ─────────────────────────────────────────────── */}
      <div style={{ position: 'relative', overflow: 'hidden', borderBottom: '1px solid var(--border)' }}>
        <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 50% -20%, ${Y}22 0%, transparent 55%), radial-gradient(ellipse at 20% 120%, ${mix(G, 5)} 0%, transparent 50%), radial-gradient(ellipse at 80% 120%, ${mix(C, 5)} 0%, transparent 50%)` }} />
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(rgba(0,212,255,0.08) 1px, transparent 1px)', backgroundSize: '28px 28px', maskImage: 'radial-gradient(ellipse at 50% 0%, black 0%, transparent 70%)', WebkitMaskImage: 'radial-gradient(ellipse at 50% 0%, black 0%, transparent 70%)' }} />
        <div style={{ maxWidth: 1000, margin: '0 auto', padding: isMobile ? '48px 20px 32px' : '72px 24px 48px', position: 'relative', textAlign: 'center' }}>
          {fivem && <a href={homeHref} style={{ fontSize: 12, color: 'var(--muted)', textDecoration: 'none', letterSpacing: 1, position: 'absolute', left: 24, top: 24 }}>&#8592; BACK TO FIVEM</a>}

          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 14px', borderRadius: 20, border: `1px solid ${mix(G, 25)}`, background: mix(G, 7), fontSize: 10, letterSpacing: 2, color: G, fontWeight: 700, marginBottom: 18 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: G, boxShadow: `0 0 10px ${G}` }} /> AIFAZI RP · OFFICIAL STORE
          </div>

          <h1 style={{ fontSize: isMobile ? 26 : 40, fontWeight: 900, letterSpacing: 2, margin: 0, lineHeight: 1.15, background: `linear-gradient(135deg, var(--green), var(--cyan) 60%, var(--purple))`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            {tab === 'vip' ? 'VIP SUBSCRIPTIONS' : tab === 'shop' ? 'STORE CATALOG' : 'ORDER TRACKER'}
          </h1>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 12, maxWidth: 580, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.7 }}>
            {tab === 'vip' && 'Support the city and unlock in-game perks — applied automatically on join. Cancel anytime. Perks sync to the server within 30 seconds of purchase.'}
            {tab === 'shop' && 'Browse digital goods and merch. Everything is delivered instantly and tracked in your order history.'}
            {tab === 'orders' && 'Every order, invoice and download in one place. Track status and re-download digital files anytime.'}
          </p>

          {/* Trust bar */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginTop: 22 }}>
            {[['🔒', 'SECURE STRIPE'], ['⚡', '30s PERK SYNC'], ['⬇', 'INSTANT DELIVERY'], ['↩', 'CANCEL ANYTIME']].map(([ic, t]) => (
              <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'color-mix(in srgb, var(--text) 2%, transparent)', fontSize: 10, letterSpacing: 1.5, color: 'var(--muted)' }}>
                <span style={{ fontSize: 12 }}>{ic}</span>{t}
              </div>
            ))}
          </div>

          {!user && tab !== 'orders' && (
            <div style={{ marginTop: 26 }}>
              <Link to={loginHref} style={{ display: 'inline-flex', padding: '13px 32px', ...cta, fontSize: 12, letterSpacing: 2, textDecoration: 'none' }}>
                SIGN IN TO {tab === 'shop' ? 'SHOP' : 'SUBSCRIBE'}
              </Link>
            </div>
          )}

          {user && sub?.subscription && (
            <div style={{ marginTop: 22, display: 'inline-flex', alignItems: 'center', gap: 12, padding: '12px 22px', borderRadius: 12, background: 'color-mix(in srgb, var(--green) 8%, transparent)', border: `1px solid color-mix(in srgb, var(--green) 25%, transparent)`, flexWrap: 'wrap', justifyContent: 'center' }}>
              <span style={{ fontSize: 13, color: G, fontWeight: 700 }}>CURRENT: {sub.subscription.plan_name?.toUpperCase() || '—'} (Level {sub.subscription.plan_level || 0})</span>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                {currentStatus === 'past_due' ? '· PAST DUE' : sub.subscription.cancel_at_period_end ? '· CANCELS AT PERIOD END' : sub.subscription.current_period_end ? `· RENEWS ${new Date(sub.subscription.current_period_end).toLocaleDateString()}` : ''}
              </span>
              <button onClick={handleManage} style={{ padding: '6px 14px', border: `1px solid ${mix(C, 33)}`, background: 'transparent', color: C, fontSize: 10, letterSpacing: 1, cursor: 'pointer', borderRadius: 6, fontWeight: 700 }}>MANAGE</button>
              {!sub.subscription.cancel_at_period_end && (
                <button onClick={handleCancel} style={{ padding: '6px 14px', border: '1px solid rgba(255,71,87,0.4)', background: 'transparent', color: R, fontSize: 10, letterSpacing: 1, cursor: 'pointer', borderRadius: 6, fontWeight: 700 }}>CANCEL</button>
              )}
            </div>
          )}

          {notice && <div style={{ marginTop: 16, fontSize: 12, color: G }}>{notice}</div>}
          {error && <div style={{ marginTop: 16, fontSize: 12, color: R, background: mix(R, 10), border: `1px solid ${mix(R, 25)}`, padding: '10px 16px', borderRadius: 8, display: 'inline-block', maxWidth: 480 }}>{error}</div>}
        </div>
      </div>

      {/* ── Tab switcher ─────────────────────────────────────── */}
      <div style={{ position: 'sticky', top: 0, zIndex: 40, background: 'color-mix(in srgb, var(--bg) 88%, transparent)', backdropFilter: 'blur(12px)', borderBottom: '1px solid var(--border2)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', justifyContent: 'center', gap: 8, padding: '14px 20px', flexWrap: 'wrap' }}>
          {TABS.map(([k, label]) => (
            <button key={k} onClick={() => { setTab(k); setError(''); setNotice('') }}
              style={{
                fontFamily: MONO, fontSize: 11, letterSpacing: 2, fontWeight: 700,
                padding: '11px 22px', borderRadius: 10, cursor: 'pointer', border: `1px solid ${tab === k ? mix(G, 33) : 'var(--border)'}`,
                background: tab === k ? mix(G, 10) : 'transparent',
                color: tab === k ? G : 'var(--muted)', transition: 'all 0.15s', boxShadow: tab === k ? `0 0 20px ${mix(G, 9)}` : 'none',
              }}>
              {label}
              {k === 'shop' && cart.count > 0 && <span style={{ marginLeft: 8, background: G, color: '#000', borderRadius: 20, padding: '1px 8px', fontSize: 10, fontWeight: 900 }}>{cart.count}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* ── VIP TAB ──────────────────────────────────────────── */}
      {tab === 'vip' && (<>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: isMobile ? '28px 16px 0' : '40px 24px 0' }}>
          {loading ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20 }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} style={{ ...panel, padding: 28 }}>
                  <div style={{ width: '60%', height: 14, background: 'var(--border)', borderRadius: 4, marginBottom: 16 }} />
                  <div style={{ width: '40%', height: 24, background: 'var(--border)', borderRadius: 4, marginBottom: 16 }} />
                  <div style={{ width: '100%', height: 8, background: 'var(--border)', borderRadius: 4, marginBottom: 8 }} />
                  <div style={{ width: '100%', height: 8, background: 'var(--border)', borderRadius: 4, marginBottom: 8 }} />
                  <div style={{ width: '80%', height: 8, background: 'var(--border)', borderRadius: 4 }} />
                </div>
              ))}
            </div>
          ) : sortedPlans.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--muted)', fontSize: 13 }}>No plans available right now.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, alignItems: 'stretch' }}>
              {sortedPlans.map((plan, i) => {
                const color = TIER_COLORS[i] || C
                const current = plan.level === currentLevel && currentStatus
                const featured = i === featuredIndex
                return (
                  <div key={plan.id || plan.slug}
                    style={{
                      position: 'relative', display: 'flex', flexDirection: 'column', padding: 28, borderRadius: 16,
                      background: featured ? `linear-gradient(160deg, ${color}14, color-mix(in srgb, var(--text) 2%, transparent))` : 'color-mix(in srgb, var(--text) 2%, transparent)',
                      border: featured ? `1px solid ${color}66` : '1px solid var(--border)',
                      transform: featured ? 'scale(1.02)' : 'none',
                      transition: 'transform 0.2s, border-color 0.2s, box-shadow 0.2s',
                      boxShadow: featured ? `0 12px 40px ${color}18` : 'none',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.transform = featured ? 'scale(1.03)' : 'translateY(-4px)'; e.currentTarget.style.borderColor = `${color}66`; e.currentTarget.style.boxShadow = `0 14px 44px ${color}1c` }}
                    onMouseLeave={e => { e.currentTarget.style.transform = featured ? 'scale(1.02)' : 'none'; e.currentTarget.style.borderColor = featured ? `${color}66` : 'var(--border)'; e.currentTarget.style.boxShadow = featured ? `0 12px 40px ${color}18` : 'none' }}
                  >
                    {featured && (
                      <div style={{ position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)', padding: '3px 14px', borderRadius: 12, background: color, color: '#000', fontSize: 9, fontWeight: 900, letterSpacing: 2 }}>POPULAR</div>
                    )}
                    {current && (
                      <div style={{ position: 'absolute', top: -10, right: 14, padding: '3px 12px', borderRadius: 12, background: G, color: '#000', fontSize: 9, fontWeight: 900, letterSpacing: 2 }}>ACTIVE</div>
                    )}
                    <div style={{ fontSize: 11, color, letterSpacing: 2, fontWeight: 800 }}>LEVEL {plan.level}</div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700, marginTop: 8 }}>{plan.name}</div>
                    {plan.headline && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, minHeight: 14 }}>{plan.headline}</div>}
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 18 }}>
                      <span style={{ fontSize: 34, fontWeight: 800, color }}>${plan.price.toFixed(2)}</span>
                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>/ {plan.interval || 'month'}</span>
                    </div>
                    <div style={{ margin: '18px 0 6px', height: 1, background: 'var(--border)', opacity: 0.5 }} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 9, flex: 1 }}>
                      {(plan.features || []).map((f, fi) => (
                        <div key={fi} style={{ display: 'flex', gap: 9, fontSize: 12, color: 'var(--text)', lineHeight: 1.4 }}>
                          <span style={{ color: G, flexShrink: 0 }}>✓</span>
                          <span>{f}</span>
                        </div>
                      ))}
                      {(!plan.features || plan.features.length === 0) && Object.entries(plan.perks || {}).map(([k, v]) => (
                        <div key={k} style={{ display: 'flex', gap: 9, fontSize: 12, color: 'var(--muted)' }}>
                          <span style={{ color: C }}>◆</span><span>{k}: {String(v)}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop: 20 }}>
                      {user ? (
                        <button onClick={() => handleSubscribe(plan)} disabled={!!checkoutLoading}
                          style={{
                            width: '100%', padding: '12px 0', borderRadius: 10, cursor: 'pointer', fontWeight: 800, fontSize: 11, letterSpacing: 2,
                            background: current ? 'color-mix(in srgb, var(--text) 6%, transparent)' : `linear-gradient(135deg, ${color}, ${color === G ? C : G})`,
                            color: current ? 'var(--muted)' : '#000', border: current ? '1px solid var(--border)' : 'none',
                          }}>
                          {checkoutLoading === plan.slug ? 'REDIRECTING...' : current ? 'CURRENT PLAN' : `SUBSCRIBE — $${plan.price.toFixed(2)}/MO`}
                        </button>
                      ) : (
                        <Link to={loginHref} style={{ display: 'block', textAlign: 'center', padding: '12px 0', borderRadius: 10, background: `linear-gradient(135deg, ${color}, ${G})`, color: '#000', fontWeight: 800, fontSize: 11, letterSpacing: 2, textDecoration: 'none' }}>
                          SIGN IN TO SUBSCRIBE
                        </Link>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* How perks work */}
        <div style={{ maxWidth: 1000, margin: '0 auto', padding: '48px 24px 0' }}>
          <h2 style={{ fontSize: 12, letterSpacing: 3, color: C, marginBottom: 16 }}>HOW IN-GAME PERKS WORK</h2>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            {[
              { n: '1', t: 'Subscribe', d: 'Choose a tier above and pay securely with Stripe. You are charged monthly until you cancel.' },
              { n: '2', t: 'Auto-sync', d: 'The server polls our API every 30 seconds and applies your tier automatically — no commands, no tickets.' },
              { n: '3', t: 'Enjoy the city', d: 'Vehicle classes, custom plates, phone digits, weapon skins, auction access, garage/home slots and more unlock immediately.' },
              { n: '4', t: 'Manage anytime', d: 'Use MANAGE to update your card, or CANCEL to stop at the end of the billing period. Perks stay until then.' },
            ].map(s => (
              <div key={s.n} style={{ display: 'flex', gap: 14, padding: 16, background: 'color-mix(in srgb, var(--text) 2%, transparent)', borderRadius: 12, border: '1px solid var(--border)' }}>
                <div style={{ width: 34, height: 34, flexShrink: 0, borderRadius: '50%', border: `1px solid ${mix(G, 33)}`, color: G, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>{s.n}</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{s.t}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3, lineHeight: 1.6 }}>{s.d}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ maxWidth: 1000, margin: '0 auto', padding: '48px 24px 0' }}>
          <h2 style={{ fontSize: 12, letterSpacing: 3, color: C, marginBottom: 16 }}>FAQ</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {[
              ['How fast do perks apply?', 'The server checks for new subscriptions every 30 seconds. If you are already in the city you will get your tier within a minute; otherwise it applies on your next join.'],
              ['Can I cancel anytime?', 'Yes — cancel in the store and the subscription stops at the end of the current billing period. You keep your perks until then.'],
              ['What if I do not want it anymore mid-period?', 'Cancellations always run to the end of the paid period. Refunds are handled on a case-by-case basis by staff.'],
              ['Are perks account-wide or per character?', 'Per account. They are keyed to your linked identifiers, so they apply to every character you play.'],
            ].map(([q, a]) => (
              <details key={q} style={{ padding: '14px 16px', background: 'color-mix(in srgb, var(--text) 2%, transparent)', border: '1px solid var(--border)', borderRadius: 10 }}>
                <summary style={{ fontSize: 13, fontWeight: 700, cursor: 'pointer', color: 'var(--text)' }}>{q}</summary>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10, lineHeight: 1.7 }}>{a}</div>
              </details>
            ))}
          </div>
        </div>
      </>)}

      {/* ── SHOP TAB ─────────────────────────────────────────── */}
      {tab === 'shop' && (
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: isMobile ? '28px 16px 0' : '40px 24px 0' }}>
          {/* Filters */}
          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 12, marginBottom: 24, justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'center' }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={() => setActiveCategory('')}
                style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 1.5, padding: '7px 14px', borderRadius: 20, cursor: 'pointer',
                  background: activeCategory === '' ? mix(G, 12) : 'transparent', color: activeCategory === '' ? G : 'var(--muted)',
                  border: `1px solid ${activeCategory === '' ? mix(G, 31) : 'var(--border)'}` }}>ALL</button>
              {categories.map(c => (
                <button key={c.id} onClick={() => setActiveCategory(c.slug)}
                  style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 1.5, padding: '7px 14px', borderRadius: 20, cursor: 'pointer',
                    background: activeCategory === c.slug ? mix(G, 12) : 'transparent', color: activeCategory === c.slug ? G : 'var(--muted)',
                    border: `1px solid ${activeCategory === c.slug ? mix(G, 31) : 'var(--border)'}` }}>{c.icon} {c.name}</button>
              ))}
            </div>
            <div style={{ position: 'relative', minWidth: isMobile ? '100%' : 240 }}>
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: 'var(--muted)' }}>⌕</span>
              <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search products…"
                style={{ width: '100%', boxSizing: 'border-box', background: 'color-mix(in srgb, var(--text) 3%, transparent)', border: '1px solid var(--border)', borderRadius: 20, color: 'var(--text)', fontFamily: MONO, fontSize: 12, padding: '9px 14px 9px 34px', outline: 'none' }} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 320px', gap: 24, alignItems: 'start' }}>
            {/* Product grid */}
            <div>
              {productsLoading ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} style={{ ...panel, padding: 20 }}>
                      <div style={{ width: '100%', height: 80, background: 'var(--border)', borderRadius: 8, marginBottom: 12 }} />
                      <div style={{ width: '60%', height: 12, background: 'var(--border)', borderRadius: 4, marginBottom: 8 }} />
                      <div style={{ width: '40%', height: 20, background: 'var(--border)', borderRadius: 4 }} />
                    </div>
                  ))}
                </div>
              ) : filteredProducts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--muted)', fontSize: 13 }}>
                  {searchQuery || activeCategory ? 'No products match your search.' : 'No products here right now. Check back soon.'}
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
                  {filteredProducts.map(p => {
                    const color = p.on_sale ? '#ff6b6b' : C
                    return (
                      <div key={p.id} style={{ position: 'relative', padding: 20, borderRadius: 14, border: '1px solid var(--border)',
                        background: 'color-mix(in srgb, var(--text) 2%, transparent)', display: 'flex', flexDirection: 'column',
                        transition: 'transform 0.2s, border-color 0.2s, box-shadow 0.2s' }}
                        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.borderColor = `${color}55`; e.currentTarget.style.boxShadow = `0 14px 40px ${color}14` }}
                        onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none' }}>
                        {p.image_url ? (
                          <img src={p.image_url} alt={p.name} style={{ width: '100%', height: 110, objectFit: 'cover', borderRadius: 10, marginBottom: 12, background: 'var(--bg3)' }} />
                        ) : (
                          <div style={{ width: '100%', height: 110, borderRadius: 10, marginBottom: 12, background: 'linear-gradient(160deg, var(--cyan)12, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 34 }}>🛒</div>
                        )}
                        {p.on_sale && (
                          <div style={{ position: 'absolute', top: 14, right: 14, padding: '3px 10px', borderRadius: 12, background: '#ff6b6b', color: '#000', fontSize: 9, fontWeight: 900, letterSpacing: 1 }}>SALE</div>
                        )}
                        <div style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 4 }}>{p.category || 'Store'}</div>
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, marginBottom: 6, flex: 1 }}>{p.name}</div>
                        {p.description && <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.description}</div>}
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 12 }}>
                          <span style={{ fontSize: 22, fontWeight: 800, color }}>${p.price.toFixed(2)}</span>
                          {p.compare_at > 0 && <span style={{ fontSize: 11, color: 'var(--muted)', textDecoration: 'line-through' }}>${p.compare_at.toFixed(2)}</span>}
                        </div>
                        <button onClick={() => addToCart(p)} disabled={cartLoading || !p.in_stock}
                          style={{ width: '100%', padding: '10px 0', borderRadius: 10, cursor: p.in_stock ? 'pointer' : 'not-allowed', fontWeight: 800, fontSize: 10, letterSpacing: 2,
                            background: p.in_stock ? `linear-gradient(135deg, var(--cyan), var(--green))` : 'color-mix(in srgb, var(--text) 8%, transparent)', color: p.in_stock ? '#000' : 'var(--muted)', border: 'none' }}>
                          {!p.in_stock ? 'OUT OF STOCK' : 'ADD TO CART'}
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Cart */}
            <div style={{ position: isMobile ? 'static' : 'sticky', top: 90 }}>
              <div style={{ padding: 20, borderRadius: 14, border: '1px solid var(--border)', background: 'color-mix(in srgb, var(--text) 2%, transparent)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <h2 style={{ fontSize: 12, letterSpacing: 3, color: C, margin: 0 }}>YOUR CART</h2>
                  {cart.count > 0 && <button onClick={clearCart} style={{ background: 'none', border: 'none', color: R, fontSize: 10, letterSpacing: 1, cursor: 'pointer' }}>CLEAR</button>}
                </div>

                {!user ? (
                  <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--muted)', fontSize: 12, lineHeight: 1.7 }}>
                    Sign in to add products to your cart.
                    <div style={{ marginTop: 14 }}>
                      <Link to={loginHref} style={{ display: 'inline-block', padding: '9px 20px', borderRadius: 10, background: `linear-gradient(135deg, var(--green), var(--cyan))`, color: '#000', fontWeight: 700, fontSize: 10, letterSpacing: 2, textDecoration: 'none' }}>SIGN IN</Link>
                    </div>
                  </div>
                ) : cart.items.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--muted)', fontSize: 12 }}>Your cart is empty.</div>
                ) : (
                  <>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
                      {cart.items.map(item => (
                        <div key={item.id} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.product.name}</div>
                            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>${item.product.price.toFixed(2)} each</div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <button onClick={() => updateCartQty(item, item.quantity - 1)} style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', fontSize: 12 }}>−</button>
                            <span style={{ fontFamily: MONO, fontSize: 12, color: 'var(--text)', minWidth: 20, textAlign: 'center' }}>{item.quantity}</span>
                            <button onClick={() => updateCartQty(item, item.quantity + 1)} style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', fontSize: 12 }}>+</button>
                          </div>
                          <div style={{ fontFamily: MONO, fontSize: 12, color: 'var(--text)', fontWeight: 700, minWidth: 62, textAlign: 'right' }}>${item.line_total.toFixed(2)}</div>
                          <button onClick={() => removeCartItem(item)} title="Remove" style={{ background: 'none', border: 'none', color: R, cursor: 'pointer', fontSize: 12 }}>✕</button>
                        </div>
                      ))}
                    </div>
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginBottom: 16 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text)' }}>
                        <span>SUBTOTAL</span>
                        <span style={{ fontWeight: 800, color: G }}>${cart.subtotal.toFixed(2)}</span>
                      </div>
                    </div>
                    <button onClick={checkoutCart} disabled={checkoutCartLoading}
                      style={{ width: '100%', padding: '13px 0', borderRadius: 10, cursor: 'pointer', fontWeight: 800, fontSize: 11, letterSpacing: 2, ...cta }}>
                      {checkoutCartLoading ? 'REDIRECTING...' : 'CHECKOUT — STRIPE'}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── ORDERS TAB ───────────────────────────────────────── */}
      {tab === 'orders' && (
        <div style={{ maxWidth: 860, margin: '0 auto', padding: isMobile ? '28px 16px 0' : '40px 24px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 8 }}>
            <h2 style={{ fontSize: 13, letterSpacing: 3, color: C, margin: 0 }}>ORDER TRACKER</h2>
            <button onClick={loadOrders} style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--muted)', fontSize: 10, letterSpacing: 1, padding: '7px 14px', borderRadius: 6, cursor: 'pointer' }}>↻ REFRESH</button>
          </div>

          {!user ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--muted)', fontSize: 13 }}>
              Sign in to track your orders.
              <div style={{ marginTop: 14 }}><Link to={loginHref} style={{ display: 'inline-block', padding: '9px 20px', borderRadius: 10, background: `linear-gradient(135deg, var(--green), var(--cyan))`, color: '#000', fontWeight: 700, fontSize: 10, letterSpacing: 2, textDecoration: 'none' }}>SIGN IN</Link></div>
            </div>
          ) : ordersLoading ? (
            <div className="loader" />
          ) : orders.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--muted)', fontSize: 13 }}>No orders yet. Head to PRODUCTS to place your first one.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {orders.map(o => {
                const st = (o.status || 'pending').toUpperCase()
                const stColor = statusColor(o.status)
                return (
                  <div key={o.id} style={{ padding: 18, borderRadius: 14, border: '1px solid var(--border)', background: 'color-mix(in srgb, var(--text) 2%, transparent)', cursor: 'pointer', transition: 'border-color 0.2s' }} onClick={() => openOrder(o)}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = `${stColor}55` }} onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: MONO, fontSize: 12, color: C, fontWeight: 700 }}>{o.order_number}</span>
                      <span style={{ fontSize: 10, color: 'var(--muted)' }}>{new Date(o.created_at).toLocaleDateString()}</span>
                      <span style={{ flex: 1 }} />
                      <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>${(o.total_cents / 100).toFixed(2)}</span>
                      <span style={{ fontSize: 9, letterSpacing: 1.5, padding: '3px 10px', borderRadius: 12, border: `1px solid ${stColor}55`, color: stColor, fontWeight: 800 }}>{st}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                      {(o.items || []).map((it, i) => (
                        <span key={i} style={{ fontSize: 11, color: 'var(--text)', background: 'color-mix(in srgb, var(--text) 4%, transparent)', padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)' }}>
                          {it.product_name} × {it.quantity}
                        </span>
                      ))}
                    </div>
                    {o.tracking_number && (
                      <div style={{ marginTop: 10, fontSize: 11, color: 'var(--muted)', fontFamily: MONO }}>
                        📦 {o.carrier || 'Carrier'}: {o.tracking_number}
                        {o.tracking_url && <a href={o.tracking_url} target="_blank" rel="noreferrer" style={{ color: C, marginLeft: 8 }}>TRACK ↗</a>}
                      </div>
                    )}
                    {(o.downloads || []).length > 0 && (
                      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ fontSize: 10, letterSpacing: 2, color: G, fontWeight: 800 }}>DIGITAL DOWNLOADS</div>
                        {o.downloads.map(d => (
                          <a key={d.id} href={`/api/store/downloads/${d.token}`} target="_blank" rel="noreferrer"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, color: C, textDecoration: 'none', padding: '7px 12px', border: `1px solid ${mix(C, 25)}`, borderRadius: 8 }}>
                            ⬇ {d.filename || d.product_name} <span style={{ fontSize: 10, color: 'var(--muted)' }}>({d.downloads_used}/{d.downloads_allowed} used)</span>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {orderDetail && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }} onClick={() => setOrderDetail(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ fontFamily: MONO, fontSize: 13, letterSpacing: 2, color: G }}>{orderDetail.order_number}</div>
              <span style={{ fontSize: 9, letterSpacing: 1.5, padding: '3px 10px', borderRadius: 12, border: `1px solid ${mix(C, 33)}`, color: C, fontWeight: 800 }}>{(orderDetail.status || '').toUpperCase()}</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
              Placed {orderDetail.created_at ? new Date(orderDetail.created_at).toLocaleString() : '—'}
              {(orderDetail.carrier || orderDetail.tracking_number) && <div style={{ marginTop: 4 }}>📦 {orderDetail.carrier || ''} {orderDetail.tracking_number || ''}</div>}
            </div>
            <div style={{ fontSize: 10, letterSpacing: 2, color: C, marginBottom: 6, fontWeight: 800 }}>STATUS TIMELINE</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
              {(orderDetail.events || []).map((ev, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 12 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', marginTop: 4, background: G, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ color: 'var(--text)', fontWeight: 700 }}>{(ev.status || '').toUpperCase()}</div>
                    {ev.note && <div style={{ color: 'var(--muted)', fontSize: 11 }}>{ev.note}</div>}
                    <div style={{ color: 'var(--muted)', fontSize: 10 }}>{ev.created_at ? new Date(ev.created_at).toLocaleString() : ''}</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 10, letterSpacing: 2, color: C, marginBottom: 6, fontWeight: 800 }}>ITEMS</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
              {(orderDetail.items || []).map((it, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: 'var(--text)' }}>{it.product_name} × {it.quantity}</span>
                  <span style={{ color: 'var(--muted)' }}>${((it.line_total_cents || 0) / 100).toFixed(2)}</span>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 10, letterSpacing: 2, color: C, marginBottom: 6, fontWeight: 800 }}>DOWNLOADS</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
              {(orderDetail.downloads || []).length === 0 ? <span style={{ fontSize: 12, color: 'var(--muted)' }}>None</span> : orderDetail.downloads.map(d => (
                <a key={d.id} href={`/api/store/downloads/${d.token}`} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: C, textDecoration: 'none' }}>⬇ {d.filename || d.product_name} ({d.downloads_used}/{d.downloads_allowed} used)</a>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setOrderDetail(null)} style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--muted)', fontSize: 10, letterSpacing: 1, padding: '8px 16px', borderRadius: 6, cursor: 'pointer' }}>CLOSE</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '40px 24px 0', textAlign: 'center', fontSize: 10, color: 'var(--muted)', lineHeight: 1.8 }}>
        Payments are processed securely by <span style={{ color: '#635bff' }}>Stripe</span>. By subscribing you agree to the server rules.
        All purchases support the AIFAZI RP community.
      </div>
    </div>
  )
}
