'use client'
import { useState, useEffect } from 'react'
import { useParams, Link } from '@/lib/router-compat'
import api from '@/lib/api'
import { useForum } from '../../context/ForumContext'
import { Card, NeonButton, Badge, EmptyState } from '../../components/community'

const G = 'var(--green)', C = 'var(--cyan)', R = 'var(--red)'
const mix = (c, p) => `color-mix(in srgb, ${c} ${p}%, transparent)`

export default function ProductDetail() {
  const { user } = useForum()
  const { slug } = useParams()
  const [product, setProduct] = useState(null)
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [added, setAdded] = useState(false)
  const [error, setError] = useState(null)
  const [quantity, setQuantity] = useState(1)
  const [reviews, setReviews] = useState([])
  const [related, setRelated] = useState([])

  const loadReviews = async (productId) => {
    try {
      const r = await api.get(`/store/products/${productId}/reviews`)
      setReviews((r.data || []).filter(r => r.status === 'published'))
    } catch { setReviews([]) }
  }

  const loadRelated = async (category, id) => {
    try {
      const r = await api.get(`/store/products?category=${encodeURIComponent(category)}&limit=5`)
      setRelated((r.data || []).filter(p => p.id !== id).slice(0, 4))
    } catch { setRelated([]) }
  }

  useEffect(() => {
    if (!slug) return
    api.get(`/store/products/${slug}`).then(r => {
      const p = r.data
      setProduct(p)
      loadReviews(p.id)
      loadRelated(p.category, p.id)
    }).catch(err => {
      setError(err?.response?.status === 404 ? 'Product not found.' : 'Failed to load product.')
    }).finally(() => setLoading(false))
  }, [slug])

  const addToCart = async () => {
    if (!user) {
      const storeHref = typeof window !== 'undefined' && window.location.hostname === 'store.aifazi.net' ? '/' : '/store'
      window.location.href = `/login?next=${encodeURIComponent(storeHref)}`
      return
    }
    setAdding(true)
    try {
      await api.post('/store/cart', { product_id: product.id, quantity })
      setAdded(true)
      setTimeout(() => setAdded(false), 2500)
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not add to cart.')
    } finally { setAdding(false) }
  }

  if (loading) return (
    <div className="page-container community-page" style={{ zIndex: 1 }}>
      <div className="community-shell" style={{ paddingTop: 40 }}>
        <div className="community-skel" style={{ width: '100%', height: 300, marginBottom: 24, borderRadius: 14 }} />
        <div className="community-skel" style={{ width: '60%', height: 28, marginBottom: 14 }} />
        <div className="community-skel" style={{ width: '100%', height: 12, marginBottom: 10 }} />
        <div className="community-skel" style={{ width: '80%', height: 12 }} />
      </div>
    </div>
  )

  if (error || !product) return (
    <div className="page-container community-page" style={{ zIndex: 1 }}>
      <div className="community-shell" style={{ textAlign: 'center', paddingTop: 80 }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🛒</div>
        <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--red)', marginBottom: 16, fontSize: 13 }}>{error || 'Product not found'}</div>
        <NeonButton to="/store" variant="ghost">← Back to Store</NeonButton>
      </div>
    </div>
  )

  const price = product.price?.toFixed(2) || '0.00'
  const compareAt = product.compare_at > 0 ? product.compare_at.toFixed(2) : null

  return (
    <div className="page-container community-page" style={{ zIndex: 1, paddingTop: 40 }}>
      {/* Breadcrumb */}
      <div style={{ padding: '0 0 20px', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1, color: 'var(--muted)' }}>
        <Link to="/store" style={{ color: 'var(--muted)', textDecoration: 'none' }}>STORE</Link>
        <span style={{ margin: '0 8px' }}>/</span>
        {product.category && <><Link to={`/store?cat=${encodeURIComponent(product.category)}`} style={{ color: C, textDecoration: 'none' }}>{product.category.toUpperCase()}</Link><span style={{ margin: '0 8px' }}>/</span></>}
        <span style={{ color: 'var(--text)' }}>{product.name}</span>
      </div>

      <div className="community-shell product-detail-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 0.9fr)', gap: 'clamp(24px, 5vw, 56px)', alignItems: 'start' }}>
        {/* Image */}
        <div style={{ position: 'relative', width: '100%', aspectRatio: '1', borderRadius: 14, overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--bg3)' }}>
          {product.image_url ? (
            <img src={product.image_url} alt={product.name} loading="eager" fetchPriority="high" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 80, background: 'linear-gradient(160deg, var(--cyan)12, transparent)' }}>🛒</div>
          )}
        </div>

        {/* Details */}
        <div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
            {product.on_sale && <Badge tone="red">SALE</Badge>}
            {product.category && <Badge tone="cyan">{product.category}</Badge>}
            {!product.in_stock && <Badge tone="red">Out of Stock</Badge>}
          </div>

          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(26px, 3vw, 38px)', fontWeight: 700, color: 'var(--text)', margin: '0 0 14px', lineHeight: 1.15 }}>
            {product.name}
          </h1>

          {product.description && (
            <p style={{ fontSize: 15, color: 'var(--muted)', lineHeight: 1.7, margin: '0 0 24px' }}>
              {product.description}
            </p>
          )}

          {/* Price */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 24 }}>
            <span style={{ fontSize: 36, fontWeight: 800, color: product.on_sale ? R : C }}>${price}</span>
            {compareAt && <span style={{ fontSize: 18, color: 'var(--muted)', textDecoration: 'line-through' }}>${compareAt}</span>}
          </div>

          {/* Quantity + Add to Cart */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
              <button onClick={() => setQuantity(Math.max(1, quantity - 1))}
                className="store-qty-btn" style={{ width: 40, height: 44, border: 'none', background: 'var(--bg2)', color: 'var(--text)', cursor: 'pointer', fontSize: 16 }}>−</button>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text)', padding: '0 16px', minWidth: 30, textAlign: 'center', fontWeight: 700 }}>{quantity}</span>
              <button onClick={() => setQuantity(quantity + 1)}
                className="store-qty-btn" style={{ width: 40, height: 44, border: 'none', background: 'var(--bg2)', color: 'var(--text)', cursor: 'pointer', fontSize: 16 }}>+</button>
            </div>
            <NeonButton
              variant="primary" size="lg"
              onClick={addToCart} disabled={adding || !product.in_stock}
            >
              {added ? '✓ Added!' : !product.in_stock ? 'Out of Stock' : adding ? 'Adding...' : 'Add to Cart'}
            </NeonButton>
          </div>

          {/* Meta */}
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', lineHeight: 1.8 }}>
            {product.sku && <div>SKU: {product.sku}</div>}
            {product.type && <div>Type: {product.type.toUpperCase()}</div>}
          </div>
        </div>
      </div>

      {/* Reviews */}
      {reviews.length > 0 && (
        <div className="community-shell" style={{ marginTop: 56, paddingTop: 40, borderTop: '1px solid var(--border)' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 3, color: C, marginBottom: 20 }}>
            REVIEWS ({reviews.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {reviews.map(r => (
              <Card key={r.id} style={{ padding: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: Y }}>
                    {'★'.repeat(r.rating || 5)}{'☆'.repeat(5 - (r.rating || 5))}
                  </div>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{r.author_name || 'Anonymous'}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)' }}>
                    {r.created_at ? new Date(r.created_at).toLocaleDateString() : ''}
                  </span>
                </div>
                <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.65, margin: 0 }}>{r.content}</p>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Related products */}
      {related.length > 0 && (
        <div className="community-shell" style={{ marginTop: 56, paddingTop: 40, borderTop: '1px solid var(--border)' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 3, color: C, marginBottom: 20 }}>
            YOU MIGHT ALSO LIKE
          </div>
          <div className="product-related-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
            {related.map(p => (
              <Link key={p.id} to={`/store/product/${p.slug || p.id}`} style={{ textDecoration: 'none' }}>
                <Card hover style={{ padding: 16, height: '100%' }}>
                  {p.image_url ? (
                    <img src={p.image_url} alt={p.name} style={{ width: '100%', height: 120, objectFit: 'cover', borderRadius: 8, marginBottom: 10 }} />
                  ) : (
                    <div style={{ width: '100%', height: 120, borderRadius: 8, marginBottom: 10, background: 'linear-gradient(160deg, var(--cyan)12, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32 }}>🛒</div>
                  )}
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>{p.name}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: C }}>${p.price.toFixed(2)}</div>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="community-shell" style={{ marginTop: 48, paddingBottom: 60 }}>
        <NeonButton to="/store" variant="ghost">← Back to Store</NeonButton>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .product-detail-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
