'use client'
import { Link } from '@/lib/router-compat'
import { Badge } from '../../components/community'

const C = 'var(--cyan)'

export default function StoreProductCard({ product, cartLoading, addToCart }) {
  const detailUrl = `/store/product/${product.slug || product.id}`
  const color = product.on_sale ? 'var(--red)' : C

  return (
    <Link to={detailUrl} className="ec-product-card" style={{ textDecoration: 'none', color: 'inherit' }}>
      {/* Image */}
      <div className="ec-product-image">
        <div className="ec-product-badge">
          {product.on_sale && <Badge tone="red" glow>SALE</Badge>}
        </div>
        {product.image_url ? (
          <img src={product.image_url} alt={product.name} loading="lazy" />
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