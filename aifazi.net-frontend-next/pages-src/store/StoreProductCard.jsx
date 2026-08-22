'use client'
import NextImage from 'next/image'
import { Link } from '@/lib/router-compat'
import { Badge } from '../../components/community'
import { useWishlist } from '@/lib/wishlist'

const C = 'var(--cyan)'

export default function StoreProductCard({ product, cartLoading, addToCart }) {
  const detailUrl = `/store/product/${product.slug || product.id}`
  const color = product.on_sale ? 'var(--red)' : C
  const { has, toggle } = useWishlist()
  const wished = has(product.id)

  return (
    <Link to={detailUrl} className="ec-product-card" style={{ textDecoration: 'none', color: 'inherit' }}>
      {/* Image */}
      <div className="ec-product-image">
        <button
          aria-label={wished ? 'Remove from wishlist' : 'Add to wishlist'}
          aria-pressed={wished}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggle(product.id) }}
          style={{
            position: 'absolute', top: 8, right: 8, zIndex: 2,
            width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: wished ? 'color-mix(in srgb, var(--red) 18%, var(--bg) 82%)' : 'color-mix(in srgb, var(--bg) 88%, transparent)',
            border: `1px solid ${wished ? 'var(--red)' : 'var(--border)'}`, color: wished ? 'var(--red)' : 'var(--muted)',
            cursor: 'pointer', transition: 'all 0.2s', backdropFilter: 'blur(6px)',
          }}
        >
          {wished ? '♥' : '♡'}
        </button>
        <div className="ec-product-badge">
          {product.on_sale && <Badge tone="red" glow>SALE</Badge>}
        </div>
        {product.image_url ? (
          <NextImage src={product.image_url} alt={product.name} fill sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw" style={{ objectFit: 'cover' }} />
        ) : (
          <div className="ec-product-image-placeholder">🛒</div>
        )}
        {/* Quick add overlay */}
        <div className="ec-product-overlay">
          <button
            className="ec-quick-add"
            onClick={(e) => { e.preventDefault(); addToCart(product) }}
            disabled={cartLoading || !product.in_stock}
          >
            {!product.in_stock ? 'OUT OF STOCK' : cartLoading ? 'ADDING...' : '+ QUICK ADD'}
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="ec-product-body">
        <div className="ec-product-cat">{product.category || 'Store'}</div>
        <div className="ec-product-name">{product.name}</div>
        <div className="ec-product-price">
          <span className="ec-product-price-current" style={{ color }}>${product.price.toFixed(2)}</span>
          {product.compare_at > 0 && (
            <span className="ec-product-price-compare">${product.compare_at.toFixed(2)}</span>
          )}
        </div>
      </div>
    </Link>
  )
}