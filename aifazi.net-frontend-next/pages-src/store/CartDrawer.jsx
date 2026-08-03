'use client'
import { Link } from '@/lib/router-compat'
import { NeonButton } from '../../components/community'

export default function CartDrawer({ open, onClose, cart, user, loginHref, isLoading, updateCartQty, removeCartItem, clearCart, checkoutCart, isMobile }) {
  return (
    <>
      {/* Backdrop */}
      <div className={`ec-cart-backdrop ${open ? 'open' : ''}`} onClick={onClose} />

      {/* Drawer */}
      <div className={`ec-cart-drawer ${open ? 'open' : ''}`}>
        {/* Header */}
        <div className="ec-cart-header">
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 3, color: 'var(--cyan)' }}>
            YOUR CART {cart.count > 0 && `(${cart.count})`}
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 20, padding: 4 }}>✕</button>
        </div>

        {/* Body */}
        <div className="ec-cart-body">
          {!user ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted)', fontSize: 13 }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🛒</div>
              Sign in to add items to your cart.
              <div style={{ marginTop: 16 }}>
                <NeonButton to={loginHref} variant="primary" size="sm">Sign In</NeonButton>
              </div>
            </div>
          ) : cart.items.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted)', fontSize: 13 }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🛒</div>
              Your cart is empty.
              <div style={{ marginTop: 12 }}>
                <Link to="/?tab=shop" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1, color: 'var(--green)', textDecoration: 'none' }}>BROWSE PRODUCTS →</Link>
              </div>
            </div>
          ) : (
            <>
              {cart.items.map(item => (
                <div key={item.id} className="ec-cart-item">
                  <img className="ec-cart-item-img" src={item.product?.image_url || ''} alt="" onError={e => e.currentTarget.style.display = 'none'} />
                  <div className="ec-cart-item-info">
                    <div className="ec-cart-item-name">{item.product?.name || 'Product'}</div>
                    <div className="ec-cart-item-price">${item.product?.price?.toFixed(2) || '0.00'} each</div>
                    <div className="ec-cart-qty">
                      <button className="ec-cart-qty-btn" onClick={() => updateCartQty(item, item.quantity - 1)}>−</button>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text)', minWidth: 24, textAlign: 'center' }}>{item.quantity}</span>
                      <button className="ec-cart-qty-btn" onClick={() => updateCartQty(item, item.quantity + 1)}>+</button>
                      <button onClick={() => removeCartItem(item)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 11, marginLeft: 6 }}>✕</button>
                    </div>
                  </div>
                  <div className="ec-cart-item-total">${(item.line_total || 0).toFixed(2)}</div>
                </div>
              ))}
            </>
          )}
        </div>

        {/* Footer */}
        {cart.items.length > 0 && user && (
          <div className="ec-cart-footer">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>Subtotal</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 800, color: 'var(--green)' }}>${cart.subtotal.toFixed(2)}</span>
            </div>
            <NeonButton variant="primary" size="lg" style={{ width: '100%' }} onClick={checkoutCart} disabled={isLoading}>
              {isLoading ? 'Redirecting...' : 'Checkout — Stripe'}
            </NeonButton>
            <button onClick={clearCart} style={{ marginTop: 10, background: 'none', border: 'none', color: 'var(--muted)', fontSize: 11, cursor: 'pointer', width: '100%', textAlign: 'center' }}>
              Clear cart
            </button>
          </div>
        )}
      </div>
    </>
  )
}