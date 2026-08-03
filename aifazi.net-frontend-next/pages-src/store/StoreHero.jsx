'use client'
import { Link } from '@/lib/router-compat'
import { NeonButton, Badge } from '../../components/community'

const mix = (c, p) => `color-mix(in srgb, ${c} ${p}%, transparent)`
const G = 'var(--green)', C = 'var(--cyan)', R = 'var(--red)'

export default function StoreHero({ fivem, tab, user, sub, notice, error, loginHref, homeHref, handleManage, handleCancel, isMobile }) {
  const currentStatus = sub?.subscription?.status
  const cta = { background: 'linear-gradient(135deg, var(--green), var(--cyan))', color: '#000', fontWeight: 800, border: 'none', borderRadius: 10 }

  return (
    <div className="store-hero" style={{ position: 'relative', overflow: 'hidden', borderBottom: '1px solid var(--border)' }}>
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 50% -20%, var(--orange)22 0%, transparent 55%), radial-gradient(ellipse at 20% 120%, ${mix(G, 5)} 0%, transparent 50%), radial-gradient(ellipse at 80% 120%, ${mix(C, 5)} 0%, transparent 50%)` }} />
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(rgba(0,212,255,0.08) 1px, transparent 1px)', backgroundSize: '28px 28px', maskImage: 'radial-gradient(ellipse at 50% 0%, black 0%, transparent 70%)', WebkitMaskImage: 'radial-gradient(ellipse at 50% 0%, black 0%, transparent 70%)' }} />
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: isMobile ? '48px 20px 32px' : '72px 24px 48px', position: 'relative', textAlign: 'center' }}>
        {fivem && <a href={homeHref} style={{ fontSize: 12, color: 'var(--muted)', textDecoration: 'none', letterSpacing: 1, position: 'absolute', left: 24, top: 24 }}>&#8592; BACK TO FIVEM</a>}

        <Badge tone="green" glow>⭐ AIFAZI RP · OFFICIAL STORE</Badge>

        <h1 className="store-hero-title" style={{ fontSize: isMobile ? 26 : 40, fontWeight: 900, letterSpacing: 2, margin: '18px 0 0', lineHeight: 1.15, background: 'linear-gradient(135deg, var(--green), var(--cyan) 60%, var(--purple))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          {tab === 'vip' ? 'VIP SUBSCRIPTIONS' : tab === 'shop' ? 'STORE CATALOG' : 'ORDER TRACKER'}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 12, maxWidth: 580, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.7 }}>
          {tab === 'vip' && 'Support the city and unlock in-game perks — applied automatically on join. Cancel anytime. Perks sync to the server within 30 seconds of purchase.'}
          {tab === 'shop' && 'Browse digital goods and merch. Everything is delivered instantly and tracked in your order history.'}
          {tab === 'orders' && 'Every order, invoice and download in one place. Track status and re-download digital files anytime.'}
        </p>

        {/* Trust bar */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginTop: 22 }}>
          {['🔒 SECURE STRIPE', '⚡ 30s PERK SYNC', '⬇ INSTANT DELIVERY', '↩ CANCEL ANYTIME'].map(t => (
            <Badge key={t} tone="neutral">{t}</Badge>
          ))}
        </div>

        {!user && tab !== 'orders' && (
          <div style={{ marginTop: 22 }}>
            <NeonButton to={loginHref} variant="primary" size="lg">
              SIGN IN TO {tab === 'shop' ? 'SHOP' : 'SUBSCRIBE'}
            </NeonButton>
          </div>
        )}

        {user && sub?.subscription && (
          <div style={{ marginTop: 22, display: 'inline-flex', alignItems: 'center', gap: 12, padding: '12px 22px', borderRadius: 14, background: 'rgba(0,255,136,0.06)', border: '1px solid color-mix(in srgb, var(--green) 25%, transparent)', flexWrap: 'wrap', justifyContent: 'center' }}>
            <span style={{ fontSize: 13, color: G, fontWeight: 700 }}>CURRENT: {sub.subscription.plan_name?.toUpperCase() || '—'} (Level {sub.subscription.plan_level || 0})</span>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>
              {currentStatus === 'past_due' ? '· PAST DUE' : sub.subscription.cancel_at_period_end ? '· CANCELS AT PERIOD END' : sub.subscription.current_period_end ? `· RENEWS ${new Date(sub.subscription.current_period_end).toLocaleDateString()}` : ''}
            </span>
            <NeonButton variant="cyan" size="sm" onClick={handleManage}>Manage</NeonButton>
            {!sub.subscription.cancel_at_period_end && (
              <NeonButton variant="danger" size="sm" onClick={handleCancel}>Cancel</NeonButton>
            )}
          </div>
        )}

        {notice && <div style={{ marginTop: 16, fontSize: 12, color: G }}>{notice}</div>}
        {error && <div style={{ marginTop: 16, fontSize: 12, color: R, background: mix(R, 10), border: `1px solid ${mix(R, 25)}`, padding: '10px 16px', borderRadius: 8, display: 'inline-block', maxWidth: 480 }}>{error}</div>}
      </div>
    </div>
  )
}
