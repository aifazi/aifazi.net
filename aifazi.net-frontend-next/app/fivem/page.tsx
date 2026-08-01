'use client'
import { useEffect, useState } from 'react'
import api from '@/lib/api'
import { useFiveMRoute } from '@/lib/fivemRoutes'

const G = '#00FF88'
const C = '#00D4FF'

export default function FiveMLanding() {
  const [status, setStatus] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/fivem/status').then(r => setStatus(r.data)).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const online = status?.status === 'online'
  const players = status?.players_online ?? status?.players_count ?? 0
  const maxPlayers = status?.max_players ?? 128
  const connectHref = useFiveMRoute('/connect')
  const whitelistHref = useFiveMRoute('/whitelist')
  const statusHref = useFiveMRoute('/status')
  const formsHref = useFiveMRoute('/forms')
  const storeHref = useFiveMRoute('/store')
  const rulesHref = useFiveMRoute('/rules')
  const guidesHref = useFiveMRoute('/guides')

  return (
    <div style={{ minHeight: '100vh', color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>
      {/* Hero */}
      <div style={{ position: 'relative', overflow: 'hidden', borderBottom: '1px solid var(--border)' }}>
        <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 50% 0%, ${G}11 0%, transparent 60%)` }} />
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '80px 24px 60px', position: 'relative', textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>🏙️</div>
          <h1 style={{ fontSize: 36, fontWeight: 800, letterSpacing: 2, margin: 0, background: `linear-gradient(135deg, ${G}, ${C})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            AIFAZI RP
          </h1>
          <p style={{ fontSize: 14, color: 'var(--muted)', letterSpacing: 3, marginTop: 8 }}>NEON OPS CITY — SERIOUS ROLEPLAY</p>

          {/* Server status badge */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 24, padding: '8px 20px', borderRadius: 20, background: online ? 'color-mix(in srgb, var(--green) 10%, transparent)' : 'rgba(255,71,87,0.08)', border: `1px solid ${online ? 'color-mix(in srgb, var(--green) 30%, transparent)' : 'rgba(255,71,87,0.3)'}` }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: online ? G : '#ff4757', display: 'inline-block', animation: online ? 'pulse 2s infinite' : 'none' }} />
            <span style={{ fontSize: 12, color: online ? G : '#ff4757', letterSpacing: 1 }}>
              {loading ? 'CHECKING...' : online ? `ONLINE — ${players}/${maxPlayers} PLAYERS` : 'OFFLINE'}
            </span>
          </div>

          {/* Connect button */}
          <div style={{ marginTop: 32, display: 'flex', justifyContent: 'center', gap: 12 }}>
            <a href={connectHref} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '14px 32px', background: `linear-gradient(135deg, ${G}, ${C})`, color: '#000', fontWeight: 700, fontSize: 13, letterSpacing: 2, textDecoration: 'none', borderRadius: 8 }}>
              &#9654; CONNECT
            </a>
            <a href={formsHref} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '14px 32px', background: 'color-mix(in srgb, var(--text) 3%, transparent)', color: 'var(--text)', fontWeight: 700, fontSize: 13, letterSpacing: 2, textDecoration: 'none', borderRadius: 8, border: '1px solid var(--border)' }}>
              FORMS
            </a>
            <a href={whitelistHref} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '14px 32px', background: 'transparent', color: C, fontWeight: 700, fontSize: 13, letterSpacing: 2, textDecoration: 'none', borderRadius: 8, border: `1px solid ${C}44` }}>
              APPLY FOR WHITELIST
            </a>
          </div>
        </div>
      </div>

      {/* Info cards */}
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '40px 24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 20 }}>
          {[
            { icon: '📋', title: 'WHITELIST REQUIRED', desc: 'Apply for access to join our serious RP community. We review every application.', link: whitelistHref },
            { icon: '🛡️', title: 'FAIR PLAY', desc: 'Active admin team, anti-cheat, and strict rules enforcement ensure quality RP.', link: statusHref },
            { icon: '👑', title: 'VIP SUBSCRIPTIONS', desc: 'Unlock in-game perks with monthly VIP tiers — applied automatically on join.', link: storeHref },
            { icon: '📜', title: 'SERVER RULES', desc: 'The full rulebook: value of life, NLR, no metagaming, and fair play.', link: rulesHref },
            { icon: '📖', title: 'RP GUIDES', desc: 'New to roleplay? Quick-start guides for your first days in the city.', link: guidesHref },
            { icon: '📊', title: 'SERVER STATUS', desc: 'Real-time server status, player count, and uptime monitoring.', link: statusHref },
          ].map(card => (
          <a key={card.title} href={card.link || '#'} style={{ display: 'block', padding: 24, borderRadius: 12, background: 'color-mix(in srgb, var(--text) 2%, transparent)', border: '1px solid var(--border)', textDecoration: 'none', color: 'inherit', cursor: card.link ? 'pointer' : 'default' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'color-mix(in srgb, var(--text) 4%, transparent)'; e.currentTarget.style.borderColor = `${C}44` }}
            onMouseLeave={e => { e.currentTarget.style.background = 'color-mix(in srgb, var(--text) 2%, transparent)'; e.currentTarget.style.borderColor = 'var(--border)' }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>{card.icon}</div>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 2, color: C, marginBottom: 6 }}>{card.title}</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>{card.desc}</div>
          </a>
        ))}
      </div>

      {/* Rules */}
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 24px 60px' }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, letterSpacing: 3, color: G, marginBottom: 16 }}>SERVER RULES</h2>
        <div style={{ display: 'grid', gap: 8 }}>
          {['Stay in character at all times (IC vs OOC)', 'Value your life — no random deathmatch (RDM)', 'No vehicle deathmatch (VDM)', 'Respect all players and staff', 'No exploiting bugs or using mods/cheats', 'New Life Rule (NLR) — forget events after death', 'No metagaming (using OOC info in RP)', 'Follow staff instructions'].map((rule, i) => (
            <div key={i} style={{ padding: '8px 12px', background: 'color-mix(in srgb, var(--text) 2%, transparent)', borderRadius: 6, fontSize: 13, color: 'var(--muted)', borderLeft: `2px solid ${G}44` }}>
              {rule}
            </div>
          ))}
        </div>
      </div>

      <style>{`@keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.4 } }`}</style>
    </div>
  )
}
