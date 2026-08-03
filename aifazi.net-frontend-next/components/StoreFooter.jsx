'use client'
import { Link } from '@/lib/router-compat'

const MUTED = 'var(--muted)', S = 'var(--green)'

const FOOTER_LINKS = [
  {
    title: 'Shop',
    links: [
      ['/?tab=shop', 'All Products'],
      ['/?tab=vip', 'VIP Subscriptions'],
      ['/?tab=shop&cat=digital', 'Digital Goods'],
      ['/?tab=shop&cat=merch', 'Merchandise'],
    ],
  },
  {
    title: 'Support',
    links: [
      ['/contact', 'Contact Us'],
      ['/?tab=orders', 'Order Tracking'],
      ['/?tab=orders', 'Downloads'],
      ['/?tab=orders', 'Returns'],
    ],
  },
  {
    title: 'Company',
    links: [
      ['https://aifazi.net', 'Main Site'],
      ['https://discord.aifazi.net', 'Discord'],
      ['https://aifazi.net/blog', 'Blog'],
      ['/privacy', 'Privacy Policy'],
    ],
  },
]

export default function StoreFooter() {
  return (
    <footer style={{ borderTop: '1px solid var(--border)', marginTop: 80, padding: 'clamp(40px, 6vw, 60px) clamp(16px, 3vw, 32px) 32px', background: 'var(--bg)' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>
        <div className="store-footer-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 40, marginBottom: 40 }}>
          {/* Brand */}
          <div style={{ minWidth: 200 }}>
            <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', marginBottom: 14 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: `linear-gradient(135deg, ${S}, var(--cyan))`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 13, color: '#000' }}>A</div>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>AIFAZI<span style={{ color: S }}>.</span></span>
            </Link>
            <p style={{ fontSize: 12, color: MUTED, lineHeight: 1.7, margin: '0 0 20px', maxWidth: 260 }}>
              Premium digital goods, VIP subscriptions, and merchandise for the AIFAZI RP community. Secure payments via Stripe.
            </p>
            {/* Payment icons */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {['💳', '🏦', '📱', '🔒'].map(icon => (
                <div key={icon} style={{ width: 40, height: 28, borderRadius: 6, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>
                  {icon}
                </div>
              ))}
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: MUTED, letterSpacing: 1 }}>STRIPE</span>
            </div>
          </div>

          {/* Link columns */}
          {FOOTER_LINKS.map(col => (
            <div key={col.title}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 3, color: S, marginBottom: 14, textTransform: 'uppercase' }}>{col.title}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {col.links.map(([to, label]) => (
                  <Link key={label} to={to}
                    style={{ fontSize: 13, color: MUTED, textDecoration: 'none', transition: 'color 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
                    onMouseLeave={e => e.currentTarget.style.color = MUTED}>
                    {label}
                  </Link>
                ))}
              </div>
            </div>
          ))}

          {/* Newsletter */}
          <div style={{ minWidth: 200 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 3, color: S, marginBottom: 14, textTransform: 'uppercase' }}>STAY UPDATED</div>
            <p style={{ fontSize: 12, color: MUTED, lineHeight: 1.7, margin: '0 0 14px' }}>
              New products, VIP perks, and exclusive deals.
            </p>
            <form onSubmit={e => e.preventDefault()} style={{ display: 'flex', gap: 0 }}>
              <input placeholder="your@email.com"
                style={{
                  flex: 1, background: 'var(--bg3)', border: '1px solid var(--border)',
                  borderRadius: '8px 0 0 8px', color: 'var(--text)', fontFamily: 'var(--font-mono)',
                  fontSize: 11, padding: '10px 12px', outline: 'none', minWidth: 0,
                }} />
              <button type="submit" style={{
                background: S, color: '#000', border: 'none', borderRadius: '0 8px 8px 0',
                padding: '10px 16px', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1,
                fontWeight: 700, cursor: 'pointer',
              }}>→</button>
            </form>
          </div>
        </div>

        {/* Bottom bar */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 24, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: MUTED }}>
            © {new Date().getFullYear()} AIFAZI. All rights reserved.
          </span>
          <div style={{ display: 'flex', gap: 16 }}>
            {['Terms', 'Privacy', 'Cookies'].map(t => (
              <Link key={t} to="/" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: MUTED, textDecoration: 'none' }}
                onMouseEnter={e => e.currentTarget.style.color = S}
                onMouseLeave={e => e.currentTarget.style.color = MUTED}>{t}</Link>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 640px) {
          .store-footer-grid { grid-template-columns: 1fr 1fr !important; gap: 28px !important; }
        }
      `}</style>
    </footer>
  )
}
