'use client'
import { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate } from '@/lib/router-compat'
import { useForum } from '../context/ForumContext'
import api from '@/lib/api'

const S = 'var(--green)', C = 'var(--cyan)'

export default function StoreHeader() {
  const { user } = useForum()
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')
  const [scrolled, setScrolled] = useState(false)
  const [cartCount, setCartCount] = useState(0)

  const fetchCart = useCallback(async () => {
    if (!user) { setCartCount(0); return }
    try {
      const r = await api.get('/store/cart')
      setCartCount(r.data?.count || 0)
    } catch { setCartCount(0) }
  }, [user])

  useEffect(() => {
    const t = setTimeout(fetchCart, 0)
    return () => clearTimeout(t)
  }, [fetchCart])

  // Listen for cart updates
  useEffect(() => {
    const handler = () => fetchCart()
    window.addEventListener('store-cart-updated', handler)
    return () => window.removeEventListener('store-cart-updated', handler)
  }, [fetchCart])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const handleSearch = (e) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      navigate(`/?search=${encodeURIComponent(searchQuery.trim())}`)
    }
  }

  return (
    <header className="store-header" style={{
      position: 'sticky', top: 0, zIndex: 100,
      background: scrolled ? 'color-mix(in srgb, var(--bg) 94%, transparent)' : 'var(--bg)',
      backdropFilter: scrolled ? 'blur(16px)' : 'none',
      borderBottom: `1px solid ${scrolled ? 'color-mix(in srgb, var(--green) 12%, transparent)' : 'var(--border)'}`,
      transition: 'all 0.25s ease',
    }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 clamp(16px, 3vw, 32px)', display: 'flex', alignItems: 'center', height: 64, gap: 24 }}>

        {/* Logo */}
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', flexShrink: 0 }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: `linear-gradient(135deg, ${S}, ${C})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 14, color: '#000', fontFamily: 'var(--font-display)' }}>
            A
          </div>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--text)', letterSpacing: -0.5 }}>
            AIFAZI<span style={{ color: S, fontWeight: 800 }}>.</span>
          </span>
        </Link>

        {/* Nav links */}
        <nav className="store-nav-links" style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
          {[
            ['/', 'Home'],
            ['/?tab=shop', 'Shop'],
            ['/?tab=vip', 'VIP'],
            ['/profile', 'My Account'],
          ].map(([to, label]) => (
            <Link key={label} to={to} style={{
              fontFamily: 'var(--font-display)', fontSize: 13, color: 'var(--muted)',
              textDecoration: 'none', fontWeight: 500, transition: 'color 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.color = S}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--muted)'}>
              {label}
            </Link>
          ))}
        </nav>

        <div style={{ flex: 1 }} />

        {/* Search */}
        <form onSubmit={handleSearch} style={{ position: 'relative', flex: '0 1 280px', minWidth: 0 }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: 'var(--muted)', pointerEvents: 'none' }}>⌕</span>
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search products..."
            style={{
              width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)',
              borderRadius: 999, color: 'var(--text)', fontFamily: 'var(--font-display)',
              fontSize: 13, padding: '8px 14px 8px 34px', outline: 'none',
              transition: 'border-color 0.2s',
            }}
            onFocus={e => e.currentTarget.style.borderColor = C}
            onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
          />
        </form>

        {/* Cart icon */}
        <Link to="/?tab=shop" style={{
          position: 'relative', background: 'none', border: 'none', cursor: 'pointer',
          padding: 8, color: 'var(--text)', fontSize: 20, textDecoration: 'none',
        }}>
          🛒
          {cartCount > 0 && (
            <span style={{
              position: 'absolute', top: 0, right: -2,
              width: 18, height: 18, borderRadius: '50%', background: S,
              color: '#000', fontSize: 10, fontWeight: 900,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--font-mono)',
            }}>{cartCount}</span>
          )}
        </Link>

        {/* Account */}
        {user ? (
          <Link to="/profile" style={{
            display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none',
            padding: '4px 12px 4px 4px', borderRadius: 999, border: '1px solid var(--border)',
            transition: 'border-color 0.2s', background: 'rgba(255,255,255,0.01)',
          }}
          onMouseEnter={e => e.currentTarget.style.borderColor = S}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
            <img
              src={user?.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user?.username || 'U')}&backgroundColor=00ff88,00d4ff&fontSize=36`}
              alt=""
              style={{ width: 28, height: 28, borderRadius: '50%', border: `1px solid ${S}` }}
            />
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600, color: 'var(--text)', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.username || 'Account'}
            </span>
          </Link>
        ) : (
          <Link to="/login" style={{
            fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2, fontWeight: 700,
            color: S, textDecoration: 'none', padding: '8px 16px', border: `1px solid color-mix(in srgb, var(--green) 30%, transparent)`,
            borderRadius: 999, transition: 'background 0.2s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'color-mix(in srgb, var(--green) 8%, transparent)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            SIGN IN
          </Link>
        )}
      </div>

      <style>{`
        @media (max-width: 900px) {
          .store-nav-links { display: none !important; }
        }
        @media (max-width: 640px) {
          .store-header form { display: none !important; }
        }
      `}</style>
    </header>
  )
}
