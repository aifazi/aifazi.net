'use client'
import { useState, useEffect } from 'react'
import api from '@/lib/api'
import { useForum } from '../context/ForumContext'
import { useFiveMRoute } from '@/lib/fivemRoutes'
import { Link } from '@/lib/router-compat'

const G = '#00FF88'
const C = '#00D4FF'
const Y = '#ffd700'

const TIER_COLORS = ['#6b7280', '#00FF88', '#00D4FF', '#a78bfa', '#facc15', '#ff6b6b']

export default function StorePage({ fivem = false }) {
  const { user } = useForum()
  const [plans, setPlans] = useState([])
  const [categories, setCategories] = useState([])
  const [sub, setSub] = useState(null)
  const [loading, setLoading] = useState(true)
  const [checkoutLoading, setCheckoutLoading] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const homeHref = useFiveMRoute('/')
  const loginHref = fivem
    ? `/login?next=${encodeURIComponent('/fivem/store')}`
    : '/login?next=%2Fstore'

  useEffect(() => {
    Promise.all([
      api.get('/store/plans').then(r => r.data || []).catch(() => []),
      api.get('/store/categories').then(r => r.data || []).catch(() => []),
      user ? api.get('/store/my-subscription').then(r => r.data || null).catch(() => null) : Promise.resolve(null),
    ]).then(([p, c, s]) => {
      setPlans(Array.isArray(p) ? p : [])
      setCategories(Array.isArray(c) ? c : [])
      setSub(s)
    }).finally(() => setLoading(false))
  }, [user])

  const handleSubscribe = async (plan) => {
    setError(''); setNotice(''); setCheckoutLoading(plan.slug)
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://aifazi.net'
    try {
      const r = await api.post('/store/checkout', {
        plan_slug: plan.slug,
        success_url: `${origin}/store/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/store`,
      })
      if (r.data?.url) window.location.href = r.data.url
      else setError('Checkout could not be started. Please try again.')
    } catch (err) {
      setError(err?.response?.data?.detail || 'Checkout failed. Please try again.')
    } finally { setCheckoutLoading('') }
  }

  const handleManage = async () => {
    setError(''); setNotice('')
    try {
      const r = await api.post('/store/portal')
      if (r.data?.url) window.location.href = r.data.url
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not open billing portal.')
    }
  }

  const handleCancel = async () => {
    if (!window.confirm('Cancel your subscription at the end of the current billing period? Your perks stay active until then.')) return
    setError(''); setNotice('')
    try {
      await api.post('/store/cancel')
      setNotice('Cancellation scheduled — perks remain active until the end of the period.')
      const r = await api.get('/store/my-subscription').catch(() => null)
      setSub(r?.data || sub)
    } catch (err) {
      setError(err?.response?.data?.detail || 'Cancel failed.')
    }
  }

  const sortedPlans = [...plans].sort((a, b) => a.level - b.level)
  const currentLevel = sub?.subscription?.plan_level || 0
  const currentStatus = sub?.subscription?.status

  const featuredIndex = sortedPlans.length >= 6 ? 3 : Math.floor(sortedPlans.length / 2)

  return (
    <div style={{ minHeight: '100vh', color: 'var(--text)', fontFamily: 'var(--font-mono)', paddingBottom: 60 }}>
      {/* Hero */}
      <div style={{ position: 'relative', overflow: 'hidden', borderBottom: '1px solid var(--border)' }}>
        <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 50% 0%, ${Y}11 0%, transparent 60%)` }} />
        <div style={{ maxWidth: 1000, margin: '0 auto', padding: '60px 24px 40px', position: 'relative', textAlign: 'center' }}>
          {fivem && <a href={homeHref} style={{ fontSize: 12, color: 'var(--muted)', textDecoration: 'none', letterSpacing: 1, position: 'absolute', left: 24, top: 24 }}>&#8592; BACK TO FIVEM</a>}
          <div style={{ fontSize: 40, marginBottom: 8 }}>👑</div>
          <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: 2, margin: 0, background: `linear-gradient(135deg, ${G}, ${C})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            VIP SUBSCRIPTIONS
          </h1>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 10, maxWidth: 560, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.6 }}>
            Support the city and unlock in-game perks — applied automatically on join.
            Cancel anytime. Perks sync to the server within 30 seconds of purchase.
          </p>

          {!user && (
            <div style={{ marginTop: 20 }}>
              <Link to={loginHref} style={{ display: 'inline-flex', padding: '11px 28px', background: `linear-gradient(135deg, ${G}, ${C})`, color: '#000', fontWeight: 700, fontSize: 12, letterSpacing: 2, textDecoration: 'none', borderRadius: 8 }}>
                SIGN IN TO SUBSCRIBE
              </Link>
            </div>
          )}

          {user && sub?.subscription && (
            <div style={{ marginTop: 20, display: 'inline-flex', alignItems: 'center', gap: 12, padding: '12px 22px', borderRadius: 10, background: 'color-mix(in srgb, var(--green) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--green) 25%, transparent)', flexWrap: 'wrap', justifyContent: 'center' }}>
              <span style={{ fontSize: 13, color: G, fontWeight: 700 }}>CURRENT: {sub.subscription.plan_name?.toUpperCase() || '—'} (Level {sub.subscription.plan_level || 0})</span>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                {currentStatus === 'past_due' ? '· PAST DUE' : sub.subscription.cancel_at_period_end ? '· CANCELS AT PERIOD END' : sub.subscription.current_period_end ? `· RENEWS ${new Date(sub.subscription.current_period_end).toLocaleDateString()}` : ''}
              </span>
              <button onClick={handleManage} style={{ padding: '6px 14px', border: `1px solid ${C}55`, background: 'transparent', color: C, fontSize: 10, letterSpacing: 1, cursor: 'pointer', borderRadius: 6, fontWeight: 700 }}>MANAGE</button>
              {!sub.subscription.cancel_at_period_end && (
                <button onClick={handleCancel} style={{ padding: '6px 14px', border: '1px solid rgba(255,71,87,0.4)', background: 'transparent', color: '#ff4757', fontSize: 10, letterSpacing: 1, cursor: 'pointer', borderRadius: 6, fontWeight: 700 }}>CANCEL</button>
              )}
            </div>
          )}

          {notice && <div style={{ marginTop: 16, fontSize: 12, color: G }}>{notice}</div>}
          {error && <div style={{ marginTop: 16, fontSize: 12, color: '#ff4757' }}>{error}</div>}
        </div>
      </div>

      {/* Tier grid */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 24px 0' }}>
        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{ padding: 28, borderRadius: 14, border: '1px solid var(--border)', background: 'color-mix(in srgb, var(--text) 2%, transparent)' }}>
                <div style={{ width: '60%', height: 14, background: 'var(--border)', borderRadius: 4, marginBottom: 16 }} />
                <div style={{ width: '40%', height: 24, background: 'var(--border)', borderRadius: 4, marginBottom: 16 }} />
                <div style={{ width: '100%', height: 8, background: 'var(--border)', borderRadius: 4, marginBottom: 8 }} />
                <div style={{ width: '100%', height: 8, background: 'var(--border)', borderRadius: 4, marginBottom: 8 }} />
                <div style={{ width: '80%', height: 8, background: 'var(--border)', borderRadius: 4 }} />
              </div>
            ))}
          </div>
        ) : sortedPlans.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--muted)', fontSize: 13 }}>No plans available right now.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, alignItems: 'stretch' }}>
            {sortedPlans.map((plan, i) => {
              const color = TIER_COLORS[i] || C
              const current = plan.level === currentLevel && currentStatus
              const featured = i === featuredIndex
              return (
                <div key={plan.id || plan.slug}
                  style={{
                    position: 'relative', display: 'flex', flexDirection: 'column', padding: 28, borderRadius: 14,
                    background: featured ? `linear-gradient(160deg, ${color}14, color-mix(in srgb, var(--text) 2%, transparent))` : 'color-mix(in srgb, var(--text) 2%, transparent)',
                    border: featured ? `1px solid ${color}66` : '1px solid var(--border)',
                    transform: featured ? 'scale(1.02)' : 'none',
                    transition: 'transform 0.2s, border-color 0.2s',
                    boxShadow: featured ? `0 12px 40px ${color}18` : 'none',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.transform = featured ? 'scale(1.03)' : 'translateY(-3px)'; e.currentTarget.style.borderColor = `${color}66` }}
                  onMouseLeave={e => { e.currentTarget.style.transform = featured ? 'scale(1.02)' : 'none'; e.currentTarget.style.borderColor = featured ? `${color}66` : 'var(--border)' }}
                >
                  {featured && (
                    <div style={{ position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)', padding: '3px 14px', borderRadius: 12, background: color, color: '#000', fontSize: 9, fontWeight: 900, letterSpacing: 2 }}>POPULAR</div>
                  )}
                  {current && (
                    <div style={{ position: 'absolute', top: -10, right: 14, padding: '3px 12px', borderRadius: 12, background: 'var(--green)', color: '#000', fontSize: 9, fontWeight: 900, letterSpacing: 2 }}>ACTIVE</div>
                  )}
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
                      <button onClick={() => handleSubscribe(plan)} disabled={!!checkoutLoading}
                        style={{
                          width: '100%', padding: '12px 0', borderRadius: 8, cursor: 'pointer', fontWeight: 800, fontSize: 11, letterSpacing: 2,
                          background: current ? 'color-mix(in srgb, var(--text) 6%, transparent)' : (featured ? `linear-gradient(135deg, ${color}, ${color === G ? C : G})` : `linear-gradient(135deg, ${color}, ${color === G ? C : G})`),
                          color: current ? 'var(--muted)' : '#000', border: current ? '1px solid var(--border)' : 'none',
                        }}>
                        {checkoutLoading === plan.slug ? 'REDIRECTING...' : current ? 'CURRENT PLAN' : `SUBSCRIBE — $${plan.price.toFixed(2)}/MO`}
                      </button>
                    ) : (
                      <Link to={loginHref} style={{ display: 'block', textAlign: 'center', padding: '12px 0', borderRadius: 8, background: `linear-gradient(135deg, ${color}, ${G})`, color: '#000', fontWeight: 800, fontSize: 11, letterSpacing: 2, textDecoration: 'none' }}>
                        SIGN IN TO SUBSCRIBE
                      </Link>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* How perks work */}
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '48px 24px 0' }}>
        <h2 style={{ fontSize: 12, letterSpacing: 3, color: C, marginBottom: 16 }}>HOW IN-GAME PERKS WORK</h2>
        <div style={{ display: 'grid', gap: 12 }}>
          {[
            { n: '1', t: 'Subscribe', d: 'Choose a tier above and pay securely with Stripe. You are charged monthly until you cancel.' },
            { n: '2', t: 'Auto-sync', d: 'The server polls our API every 30 seconds and applies your tier automatically — no commands, no tickets.' },
            { n: '3', t: 'Enjoy the city', d: 'Vehicle classes, custom plates, phone digits, weapon skins, auction access, garage/home slots and more unlock immediately.' },
            { n: '4', t: 'Manage anytime', d: 'Use MANAGE to update your card, or CANCEL to stop at the end of the billing period. Perks stay until then.' },
          ].map(s => (
            <div key={s.n} style={{ display: 'flex', gap: 16, padding: 16, background: 'color-mix(in srgb, var(--text) 2%, transparent)', borderRadius: 10, border: '1px solid var(--border)' }}>
              <div style={{ width: 34, height: 34, flexShrink: 0, borderRadius: '50%', border: `1px solid ${G}55`, color: G, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>{s.n}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{s.t}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3, lineHeight: 1.6 }}>{s.d}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '48px 24px 0' }}>
        <h2 style={{ fontSize: 12, letterSpacing: 3, color: C, marginBottom: 16 }}>FAQ</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {[
            ['How fast do perks apply?', 'The server checks for new subscriptions every 30 seconds. If you are already in the city you will get your tier within a minute; otherwise it applies on your next join.'],
            ['Can I cancel anytime?', 'Yes — cancel in the store and the subscription stops at the end of the current billing period. You keep your perks until then.'],
            ['What if I do not want it anymore mid-period?', 'Cancellations always run to the end of the paid period. Refunds are handled on a case-by-case basis by staff.'],
            ['Are perks account-wide or per character?', 'Per account. They are keyed to your linked identifiers, so they apply to every character you play.'],
          ].map(([q, a]) => (
            <details key={q} style={{ padding: '14px 16px', background: 'color-mix(in srgb, var(--text) 2%, transparent)', border: '1px solid var(--border)', borderRadius: 8 }}>
              <summary style={{ fontSize: 13, fontWeight: 700, cursor: 'pointer', color: 'var(--text)' }}>{q}</summary>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10, lineHeight: 1.7 }}>{a}</div>
            </details>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '40px 24px 0', textAlign: 'center', fontSize: 10, color: 'var(--muted)', lineHeight: 1.8 }}>
        Payments are processed securely by <span style={{ color: '#635bff' }}>Stripe</span>. By subscribing you agree to the server rules.
        All purchases support the AIFAZI RP community.
      </div>
    </div>
  )
}
