'use client'
import { useFiveMRoute } from '@/lib/fivemRoutes'

const G = 'var(--green)'
const C = 'var(--cyan)'
const Y = 'var(--orange)'
const P = 'var(--purple)'
const R = 'var(--red)'

export default function FiveMGuides() {
  const homeHref = useFiveMRoute('/')
  const rulesHref = useFiveMRoute('/rules')
  const whitelistHref = useFiveMRoute('/whitelist')
  const storeHref = useFiveMRoute('/store')

  const guides = [
    {
      icon: '🧍',
      title: 'CREATING YOUR CHARACTER',
      color: G,
      mins: 5,
      points: [
        'Give your character a name, backstory, and flaws before you log in — a character sheet makes RP 10x better.',
        'Pick a role that fits the city economy: worker, mechanic, medic, criminal, or entrepreneur.',
        'Start small. Nobody trusts a fresh face with a million-dollar story. Build your reputation IC.',
        'Your VIP tier (see Store) unlocks extra character slots and vehicle classes.',
      ],
    },
    {
      icon: '🚗',
      title: 'GETTING YOUR FIRST VEHICLE',
      color: C,
      mins: 3,
      points: [
        'Buy a starter car from the dealership — always insure it before driving.',
        'Keep your license valid by obeying traffic laws when you can afford the ticket.',
        'Never leave a borrowed or criminal vehicle on the map; dispose of it properly.',
        'Higher VIP tiers unlock exclusive vehicle classes (B, A, S, S+).',
      ],
    },
    {
      icon: '💬',
      title: 'FIRST DAY IN THE CITY',
      color: P,
      mins: 8,
      points: [
        'Join the city Discord and introduce yourself (OOC is fine there).',
        'Get a job or find a faction to belong to — lone-wolf RP gets lonely fast.',
        'Use /me and /do for actions and outcomes; other players respond to strong roleplay.',
        'Ask staff questions in-game or via the support ticket forum category.',
      ],
    },
    {
      icon: '🏠',
      title: 'HOUSING & PROPERTY',
      color: Y,
      mins: 6,
      points: [
        'Buy a house or apartment from the housing UI and furnish it.',
        'Store your belongings safely — property is the safest place for valuables.',
        'VIP tiers add extra home slots and garage slots.',
        'Businesses require an approved application and clear in-character purpose.',
      ],
    },
    {
      icon: '💰',
      title: 'MONEY & THE ECONOMY',
      color: G,
      mins: 7,
      points: [
        'Earn money through jobs, businesses, and criminal activity — all balanced by the staff.',
        'Bank your cash. Keep only what you can afford to lose on your person.',
        'There is no real-money trading, ever. Report it if you see it.',
        'Supreme VIP subscribers get a priority queue and boosted perks every month.',
      ],
    },
    {
      icon: '🚑',
      title: 'REVIVAL & MEDICAL RP',
      color: R,
      mins: 4,
      points: [
        'If you go down, call EMS. Roleplay the injury — do not magically recover.',
        'After death you follow NLR: forget what happened before you died.',
        'EMS and police factions have strict RP requirements. Apply on the forum.',
      ],
    },
  ]

  return (
    <div style={{ minHeight: '100vh', color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '80px 24px 60px' }}>
        <a href={homeHref} style={{ fontSize: 12, color: 'var(--muted)', textDecoration: 'none', letterSpacing: 1 }}>&#8592; BACK TO FIVEM</a>
        <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <a href={rulesHref} style={{ padding: '8px 10px', border: `1px solid ${R}33`, color: R, textDecoration: 'none', borderRadius: 7, fontSize: 10, letterSpacing: 2, fontWeight: 800 }}>RULES</a>
          <a href={whitelistHref} style={{ padding: '8px 10px', border: `1px solid ${C}33`, color: C, textDecoration: 'none', borderRadius: 7, fontSize: 10, letterSpacing: 2, fontWeight: 800 }}>WHITELIST</a>
          <a href={storeHref} style={{ padding: '8px 10px', border: `1px solid ${Y}33`, color: Y, textDecoration: 'none', borderRadius: 7, fontSize: 10, letterSpacing: 2, fontWeight: 800 }}>STORE</a>
        </div>

        <div style={{ textAlign: 'center', marginTop: 32, marginBottom: 40 }}>
          <div style={{ fontSize: 44, marginBottom: 8 }}>📖</div>
          <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: 3, background: `linear-gradient(135deg, ${G}, ${C})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>RP GUIDES</h1>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 8 }}>Quick-start guides to make your first days in AIFAZI RP smooth and enjoyable.</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))', gap: 20 }}>
          {guides.map(g => (
            <div key={g.title}
              style={{ transition: 'transform 0.2s, border-color 0.2s', padding: 24, borderRadius: 12, background: 'color-mix(in srgb, var(--text) 2%, transparent)', border: '1px solid var(--border)' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = `${g.color}55`; e.currentTarget.style.transform = 'translateY(-3px)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'translateY(0)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <div style={{ fontSize: 30 }}>{g.icon}</div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: 1, color: 'var(--text)' }}>{g.title}</div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: 1 }}>{g.mins} MIN READ</div>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {g.points.map((p, i) => (
                  <div key={i} style={{ display: 'flex', gap: 9, fontSize: 12, color: 'var(--muted)', lineHeight: 1.55 }}>
                    <span style={{ color: g.color, flexShrink: 0 }}>›</span>
                    <span>{p}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
