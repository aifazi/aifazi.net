'use client'
import { useEffect, useState, useCallback } from 'react'
import api from '@/lib/api'
import { useFiveMRoute } from '@/lib/fivemRoutes'
import { useForum } from '@/context/ForumContext'

const G = '#00FF88', C = '#00D4FF', R = '#ff4757', P = '#a855f7'

function ServerIP({ ip }: { ip?: string }) {
  const [copied, setCopied] = useState(false)
  const copy = useCallback(() => {
    if (!ip) return
    navigator.clipboard.writeText(ip).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {})
  }, [ip])
  return (
    <button onClick={copy} style={{
      display: 'inline-flex', alignItems: 'center', gap: 10, padding: '12px 20px',
      background: 'rgba(0,0,0,0.4)', border: `1px solid ${C}33`, borderRadius: 10,
      cursor: 'pointer', transition: 'border-color 0.2s', fontFamily: 'var(--font-mono)',
    }}
    onMouseEnter={e => e.currentTarget.style.borderColor = C}
    onMouseLeave={e => e.currentTarget.style.borderColor = `${C}33`}>
      <span style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: 1 }}>CONNECT:</span>
      <span style={{ fontSize: 14, color: C, fontWeight: 700, letterSpacing: 1 }}>{ip || 'play.aifazi.net'}</span>
      <span style={{ fontSize: 11, color: copied ? G : 'var(--muted)' }}>{copied ? '✓ COPIED' : '📋 COPY'}</span>
    </button>
  )
}

function StatBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = Math.min(100, (value / max) * 100)
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', letterSpacing: 1 }}>{label}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color, fontWeight: 700 }}>{value}/{max}</span>
      </div>
      <div style={{ height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2, transition: 'width 0.6s ease' }} />
      </div>
    </div>
  )
}

export default function FiveMLanding() {
  const { user } = useForum()
  const [status, setStatus] = useState<Record<string, any> | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/fivem/status').then(r => setStatus(r.data)).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const online = status?.status === 'online'
  const players = status?.players_online ?? status?.players_count ?? 0
  const maxPlayers = status?.max_players ?? 128
  const uptime = status?.uptime_label || '0m'
  const connectHref = useFiveMRoute('/connect')
  const whitelistHref = useFiveMRoute('/whitelist')
  const statusHref = useFiveMRoute('/status')
  const storeHref = useFiveMRoute('/store')
  const rulesHref = useFiveMRoute('/rules')
  const guidesHref = useFiveMRoute('/guides')
  const profileHref = useFiveMRoute('/profile')

  return (
    <div style={{ minHeight: '100vh', color: 'var(--text)', fontFamily: 'var(--font-display)', position: 'relative' }}>
      {/* Background gradient */}
      <div style={{ position: 'fixed', inset: 0, zIndex: -1, background: `
        radial-gradient(ellipse at 50% 0%, ${G}08 0%, transparent 50%),
        radial-gradient(ellipse at 20% 80%, ${C}06 0%, transparent 50%),
        radial-gradient(ellipse at 80% 90%, ${P}06 0%, transparent 50%),
        var(--bg)
      ` }} />

      {/* ─── HERO ─────────────────────────────────────────── */}
      <section style={{ position: 'relative', overflow: 'hidden', padding: 'clamp(60px, 10vw, 120px) 24px clamp(40px, 6vw, 60px)' }}>
        {/* Grid overlay */}
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(rgba(0,212,255,0.04) 1px, transparent 1px)', backgroundSize: '32px 32px', maskImage: 'radial-gradient(ellipse at 50% 0%, black 0%, transparent 70%)', WebkitMaskImage: 'radial-gradient(ellipse at 50% 0%, black 0%, transparent 70%)' }} />

        <div style={{ maxWidth: 800, margin: '0 auto', textAlign: 'center', position: 'relative' }}>
          {/* Badge */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 16px', borderRadius: 20, border: `1px solid ${G}33`, background: `${G}0a`, fontSize: 10, letterSpacing: 2, color: G, fontWeight: 700, marginBottom: 24, fontFamily: 'var(--font-mono)' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: online ? G : R, boxShadow: online ? `0 0 8px ${G}` : 'none', animation: online ? 'fivem-pulse 2s infinite' : 'none' }} />
            {loading ? 'CHECKING STATUS...' : online ? `ONLINE — ${players}/${maxPlayers} PLAYERS` : 'OFFLINE'}
          </div>

          {/* Title */}
          <div style={{ fontSize: 56, marginBottom: 8 }}>🏙️</div>
          <h1 style={{ fontSize: 'clamp(36px, 6vw, 56px)', fontWeight: 900, letterSpacing: 2, margin: 0, lineHeight: 1.05,
            background: `linear-gradient(135deg, ${G}, ${C} 60%, ${P})`,
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>
            AIFAZI RP
          </h1>
          <p style={{ fontSize: 'clamp(12px, 2vw, 16px)', color: 'var(--muted)', letterSpacing: 'clamp(2px, 0.5vw, 4px)', marginTop: 12, fontWeight: 600 }}>
            NEON OPS CITY — SERIOUS ROLEPLAY
          </p>

          {/* Description */}
          <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.7, maxWidth: 500, margin: '24px auto 32px' }}>
            A serious QBX roleplay server with whitelist-only access, active admin team, and a thriving community.
            Apply, connect, and build your story in the city.
          </p>

          {/* Server IP */}
          <div style={{ marginBottom: 32 }}>
            <ServerIP ip={status?.connect_url || status?.server_ip} />
          </div>

          {/* CTAs */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
            <a href={connectHref} style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, padding: '14px 32px',
              background: `linear-gradient(135deg, ${G}, ${C})`, color: '#000', fontWeight: 800,
              fontSize: 13, letterSpacing: 2, textDecoration: 'none', borderRadius: 10,
              boxShadow: `0 0 30px ${G}22`, transition: 'box-shadow 0.2s',
            }}
            onMouseEnter={e => e.currentTarget.style.boxShadow = `0 0 40px ${G}33`}
            onMouseLeave={e => e.currentTarget.style.boxShadow = `0 0 30px ${G}22`}>
              ▶ CONNECT NOW
            </a>
            {!user && (
              <a href={whitelistHref} style={{
                display: 'inline-flex', alignItems: 'center', gap: 8, padding: '14px 32px',
                background: 'transparent', color: C, fontWeight: 800,
                fontSize: 13, letterSpacing: 2, textDecoration: 'none', borderRadius: 10,
                border: `1px solid ${C}44`,
              }}>
                📋 APPLY FOR WHITELIST
              </a>
            )}
            {user && (
              <a href={profileHref} style={{
                display: 'inline-flex', alignItems: 'center', gap: 8, padding: '14px 32px',
                background: 'rgba(255,255,255,0.03)', color: 'var(--text)', fontWeight: 800,
                fontSize: 13, letterSpacing: 2, textDecoration: 'none', borderRadius: 10,
                border: '1px solid var(--border)',
              }}>
                👤 MY PROFILE
              </a>
            )}
          </div>
        </div>
      </section>

      {/* ─── SERVER STATUS BAR ──────────────────────────── */}
      <section style={{ maxWidth: 800, margin: '0 auto', padding: '0 24px 40px' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12,
          padding: 20, borderRadius: 16, border: '1px solid var(--border)',
          background: 'rgba(0,0,0,0.2)', backdropFilter: 'blur(8px)',
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: 2, marginBottom: 4 }}>STATUS</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: online ? G : R }}>
              {online ? '● ONLINE' : '● OFFLINE'}
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: 2, marginBottom: 4 }}>PLAYERS</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: C }}>{players}<span style={{ fontSize: 12, color: 'var(--muted)' }}>/{maxPlayers}</span></div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: 2, marginBottom: 4 }}>UPTIME</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>{uptime}</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: 2, marginBottom: 4 }}>SLOTS</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: G }}>{Math.max(0, maxPlayers - players)}<span style={{ fontSize: 12, color: 'var(--muted)' }}> free</span></div>
          </div>
        </div>
        {/* Player bar */}
        <div style={{ marginTop: 12 }}>
          <StatBar label="Server Capacity" value={players} max={maxPlayers} color={online ? G : R} />
        </div>
      </section>

      {/* ─── FEATURE CARDS ──────────────────────────────── */}
      <section style={{ maxWidth: 900, margin: '0 auto', padding: '20px 24px 60px' }}>
        <h2 style={{ fontSize: 'clamp(18px, 3vw, 24px)', fontWeight: 700, color: 'var(--text)', marginBottom: 24, textAlign: 'center' }}>
          Everything You Need
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 16 }}>
          {[
            { icon: '📋', title: 'Whitelist Required', desc: 'Apply for access to join our serious RP community. We review every application.', link: whitelistHref, color: G },
            { icon: '🛡️', title: 'Fair Play', desc: 'Active admin team, anti-cheat, and strict rules enforcement ensure quality RP.', link: rulesHref, color: C },
            { icon: '👑', title: 'VIP Subscriptions', desc: 'Unlock in-game perks with monthly VIP tiers — applied automatically on join.', link: storeHref, color: P },
            { icon: '📊', title: 'Live Status', desc: 'Real-time server status, player count, and uptime monitoring.', link: statusHref, color: G },
            { icon: '📖', title: 'RP Guides', desc: 'New to roleplay? Quick-start guides for your first days in the city.', link: guidesHref, color: C },
            { icon: '📜', title: 'Server Rules', desc: 'The full rulebook: value of life, NLR, no metagaming, and fair play.', link: rulesHref, color: R },
          ].map(card => (
            <a key={card.title} href={card.link || '#'} style={{
              display: 'block', padding: 24, borderRadius: 14, textDecoration: 'none', color: 'inherit',
              background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)',
              transition: 'all 0.2s ease', position: 'relative', overflow: 'hidden',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = card.color
              e.currentTarget.style.background = `color-mix(in srgb, ${card.color} 5%, transparent)`
              e.currentTarget.style.transform = 'translateY(-4px)'
              e.currentTarget.style.boxShadow = `0 10px 30px color-mix(in srgb, ${card.color} 12%, transparent)`
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'var(--border)'
              e.currentTarget.style.background = 'rgba(255,255,255,0.02)'
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = 'none'
            }}>
              <div style={{ position: 'absolute', top: 0, right: 0, width: 60, height: 60, background: `radial-gradient(circle at 100% 0%, ${card.color}11, transparent 70%)` }} />
              <div style={{ fontSize: 28, marginBottom: 10 }}>{card.icon}</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>{card.title}</div>
              <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>{card.desc}</div>
              <div style={{ marginTop: 14, fontSize: 11, fontWeight: 700, color: card.color, fontFamily: 'var(--font-mono)', letterSpacing: 1 }}>EXPLORE →</div>
            </a>
          ))}
        </div>
      </section>

      {/* ─── QUICK RULES ─────────────────────────────────── */}
      <section style={{ maxWidth: 800, margin: '0 auto', padding: '0 24px 60px' }}>
        <div style={{
          padding: 'clamp(24px, 4vw, 36px)', borderRadius: 16, border: '1px solid var(--border)',
          background: 'rgba(0,0,0,0.2)', backdropFilter: 'blur(8px)',
        }}>
          <h2 style={{ fontSize: 'clamp(16px, 2.5vw, 20px)', fontWeight: 700, color: G, marginBottom: 20, letterSpacing: 2, fontFamily: 'var(--font-mono)' }}>
            ⚡ QUICK RULES
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
            {[
              ['🎭', 'Stay in character at all times'],
              ['❤️', 'Value your life — no RDM'],
              ['🚗', 'No vehicle deathmatch (VDM)'],
              ['🤝', 'Respect all players and staff'],
              ['🚫', 'No exploiting bugs or cheats'],
              ['🔄', 'New Life Rule (NLR) applies'],
              ['🔒', 'No metagaming (OOC info in RP)'],
              ['📋', 'Follow staff instructions'],
            ].map(([icon, rule]) => (
              <div key={rule} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', fontSize: 12, color: 'var(--muted)' }}>
                <span style={{ fontSize: 14 }}>{icon}</span> {rule}
              </div>
            ))}
          </div>
          <a href={rulesHref} style={{
            display: 'inline-block', marginTop: 20, fontSize: 12, color: C, textDecoration: 'none',
            fontFamily: 'var(--font-mono)', letterSpacing: 1, fontWeight: 700,
          }}>READ FULL RULEBOOK →</a>
        </div>
      </section>

      {/* ─── CTA SECTION ─────────────────────────────────── */}
      <section style={{ maxWidth: 800, margin: '0 auto', padding: '0 24px 80px', textAlign: 'center' }}>
        <div style={{
          padding: 'clamp(32px, 5vw, 48px)', borderRadius: 20,
          background: `linear-gradient(135deg, ${G}08, ${C}06, ${P}08)`,
          border: '1px solid var(--border)',
        }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🎮</div>
          <h2 style={{ fontSize: 'clamp(20px, 3vw, 28px)', fontWeight: 800, color: 'var(--text)', margin: '0 0 10px' }}>
            Ready to Join the City?
          </h2>
          <p style={{ fontSize: 14, color: 'var(--muted)', maxWidth: 400, margin: '0 auto 24px', lineHeight: 1.7 }}>
            Apply for whitelist, connect to the server, and start your story in Neon Ops City.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
            <a href={whitelistHref} style={{
              padding: '14px 28px', background: `linear-gradient(135deg, ${G}, ${C})`, color: '#000',
              fontWeight: 800, fontSize: 13, letterSpacing: 2, textDecoration: 'none', borderRadius: 10,
            }}>APPLY NOW</a>
            <a href={connectHref} style={{
              padding: '14px 28px', background: 'transparent', color: 'var(--text)',
              fontWeight: 800, fontSize: 13, letterSpacing: 2, textDecoration: 'none', borderRadius: 10,
              border: '1px solid var(--border)',
            }}>CONNECT</a>
          </div>
        </div>
      </section>

      <style>{`
        @keyframes fivem-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  )
}