'use client'
import { Link } from '@/lib/router-compat'
import { Card, NeonButton, Badge } from '../../components/community'

const TIER_COLORS = ['var(--muted)', 'var(--green)', 'var(--cyan)', 'var(--purple)', 'var(--orange)', 'var(--red)']
const G = 'var(--green)', C = 'var(--cyan)'

export default function StorePlanCard({ plan, index, featuredIndex, currentLevel, currentStatus, checkoutLoading, user, loginHref, handleSubscribe }) {
  const color = TIER_COLORS[index % TIER_COLORS.length]
  const current = plan.level === currentLevel && currentStatus
  const featured = index === featuredIndex

  return (
    <Card className={`store-plan-card ${featured ? 'store-plan-featured' : ''}`} style={{
      padding: 28, display: 'flex', flexDirection: 'column',
      '--plan-color': color,
      '--plan-feat': featured ? `0 12px 40px ${color}18` : undefined,
      background: featured ? `linear-gradient(160deg, color-mix(in srgb, ${color} 10%, transparent), var(--bg2))` : undefined,
    }}>
      {featured && <Badge tone="green" glow style={{ position: 'absolute', top: -8, left: '50%', transform: 'translateX(-50%)' }}>POPULAR</Badge>}
      {current && <Badge tone="green" glow style={{ position: 'absolute', top: -8, right: 14 }}>ACTIVE</Badge>}

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
          <NeonButton
            variant={current ? 'ghost' : 'primary'}
            size="md"
            style={{ width: '100%' }}
            onClick={() => handleSubscribe(plan)}
            disabled={!!checkoutLoading}
          >
            {checkoutLoading === plan.slug ? 'Redirecting...' : current ? 'Current Plan' : `Subscribe — $${plan.price.toFixed(2)}/mo`}
          </NeonButton>
        ) : (
          <NeonButton to={loginHref} variant="primary" size="md" style={{ width: '100%' }}>
            Sign in to Subscribe
          </NeonButton>
        )}
      </div>
    </Card>
  )
}
