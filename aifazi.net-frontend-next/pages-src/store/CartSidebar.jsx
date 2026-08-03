'use client'
import { Link } from '@/lib/router-compat'
import { Card, NeonButton } from '../../components/community'

export default function CartSidebar({ cart, user, loginHref, isMobile, isLoading, updateCartQty, removeCartItem, clearCart, checkoutCart }) {
  return (
    <div style={{ position: isMobile ? 'static' : 'sticky', top: 90 }}>
      <Card style={{ padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 3, color: 'var(--cyan)', margin: 0 }}>YOUR CART</h2>
          {cart.count > 0 && (
            <button onClick={clearCart} style={{ background: 'none', border: 'none', color: 'var(--red)', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1, cursor: 'pointer' }}>CLEAR</button>
          )}
        </div>

        {!user ? (
          <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--muted)', fontSize: 12, lineHeight: 1.7 }}>
            Sign in to add products to your cart.
            <div style={{ marginTop: 14 }}>
              <NeonButton to={loginHref} variant="primary" size="sm">Sign In</NeonButton>
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <button onClick={() => updateCartQty(item, item.quantity - 1)} className="store-qty-btn" style={{ width: 30, height: 30, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--muted)', cursor: 'pointer', fontSize: 13, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text)', minWidth: 18, textAlign: 'center' }}>{item.quantity}</span>
                    <button onClick={() => updateCartQty(item, item.quantity + 1)} className="store-qty-btn" style={{ width: 30, height: 30, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--muted)', cursor: 'pointer', fontSize: 13, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text)', fontWeight: 700, minWidth: 62, textAlign: 'right' }}>${item.line_total.toFixed(2)}</div>
                  <button onClick={() => removeCartItem(item)} title="Remove" style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 12 }}>✕</button>
                </div>
              ))}
            </div>
            <div className="store-cart-summary" style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text)' }}>
                <span>Subtotal</span>
                <span style={{ fontWeight: 800, color: 'var(--green)' }}>${cart.subtotal.toFixed(2)}</span>
              </div>
            </div>
            <NeonButton variant="primary" size="md" style={{ width: '100%' }} onClick={checkoutCart} disabled={isLoading}>
              {isLoading ? 'Redirecting...' : 'Checkout — Stripe'}
            </NeonButton>
          </>
        )}
      </Card>
    </div>
  )
}
