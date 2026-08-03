'use client'
import { Card, NeonButton, Badge } from '../../components/community'

export default function StoreProductCard({ product, cartLoading, addToCart }) {
  const color = product.on_sale ? 'var(--red)' : 'var(--cyan)'

  return (
    <Card className="store-product-card" style={{ '--hover-color': color, padding: 20, display: 'flex', flexDirection: 'column' }}>
      {product.image_url ? (
        <img src={product.image_url} alt={product.name} style={{ width: '100%', height: 110, objectFit: 'cover', borderRadius: 10, marginBottom: 12, background: 'var(--bg3)' }} />
      ) : (
        <div style={{ width: '100%', height: 110, borderRadius: 10, marginBottom: 12, background: 'linear-gradient(160deg, var(--cyan)12, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 34 }}>🛒</div>
      )}
      {product.on_sale && (
        <div style={{ position: 'absolute', top: 14, right: 14 }}>
          <Badge tone="red">SALE</Badge>
        </div>
      )}
      <div style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 4 }}>{product.category || 'Store'}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, marginBottom: 6, flex: 1 }}>{product.name}</div>
      {product.description && <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{product.description}</div>}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 12 }}>
        <span style={{ fontSize: 22, fontWeight: 800, color }}>${product.price.toFixed(2)}</span>
        {product.compare_at > 0 && <span style={{ fontSize: 11, color: 'var(--muted)', textDecoration: 'line-through' }}>${product.compare_at.toFixed(2)}</span>}
      </div>
      <NeonButton
        variant={product.in_stock ? 'cyan' : 'ghost'}
        size="sm"
        style={{ width: '100%' }}
        onClick={() => addToCart(product)}
        disabled={cartLoading || !product.in_stock}
      >
        {!product.in_stock ? 'Out of Stock' : 'Add to Cart'}
      </NeonButton>
    </Card>
  )
}
