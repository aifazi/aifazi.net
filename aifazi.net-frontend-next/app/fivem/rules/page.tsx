'use client'
import { useFiveMRoute } from '@/lib/fivemRoutes'

const G = '#00FF88'
const C = '#00D4FF'
const R = '#ff4757'
const Y = '#ffd700'

export default function FiveMRules() {
  const homeHref = useFiveMRoute('/')
  const whitelistHref = useFiveMRoute('/whitelist')
  const storeHref = useFiveMRoute('/store')

  const sections = [
    {
      title: '1. GENERAL CONDUCT',
      color: G,
      rules: [
        ['Stay in character at all times', 'IC conversations and actions happen in role. Keep OOC chat minimal and marked clearly with // or /ooc.'],
        ['Respect all players', 'No harassment, hate speech, sexism, racism, or discrimination of any kind — in game, voice, or Discord.'],
        ['No exploiting or cheating', 'Mods, hacks, currency exploits, and abusing glitches will result in an immediate permanent ban.'],
        ['Admin discretion', 'Staff decisions are final during active RP. You may appeal after the situation resolves through the forum.'],
      ],
    },
    {
      title: '2. VALUE OF LIFE & COMBAT',
      color: R,
      rules: [
        ['Value your life', 'Surrender when outnumbered, outgunned, or clearly at a disadvantage. Running at gunpoint is not roleplay.'],
        ['No RDM / VDM', 'Random deathmatching and vehicle deathmatching are strictly prohibited. Every kill must have clear RP justification.'],
        ['No free-kill zones', 'Hospitals, police stations, and gang-member-created safe zones are protected. No combat spawns or shooting through spawns.'],
        ['Fear RP', 'Robberies, kidnaps, and hostage situations require proper escalation. You must act on the fear your character would genuinely feel.'],
      ],
    },
    {
      title: '3. NEW LIFE RULE (NLR)',
      color: C,
      rules: [
        ['Forget the past life', 'After your character dies, you forget the events leading up to your death. No revenge, no rescue of your own body, no "remembering".'],
        ['No memory transfer', 'Anything you learned as a dead character is lost. You cannot pass it to a friend or use it through another character.'],
        ['Medical help only', 'After death you may be revived by EMS. You do not remember how you died or who was involved.'],
      ],
    },
    {
      title: '4. METAGAMING & POWERGAMING',
      color: Y,
      rules: [
        ['No metagaming', 'Do not use out-of-character knowledge in-game — no Discord-stream cheating, no map-searching for players, no using OOC info IC.'],
        ['No powergaming', 'Do not force outcomes on other players. Give them a chance to react. Roleplay is collaborative.'],
        ['No godmode RP', 'Your character can be hurt, knocked out, robbed, and arrested. Playing unkillable ruins the experience for everyone.'],
      ],
    },
    {
      title: '5. PROPERTY, VEHICLES & ECONOMY',
      color: G,
      rules: [
        ['Vehicles are assets', 'If your vehicle is destroyed in valid RP, it is gone. Use insurance only when the RP justifies it.'],
        ['No real money trading', 'Selling in-game currency, vehicles, or assets for real money results in a permanent ban.'],
        ['Businesses must be legit', 'Player-owned businesses must have a valid reason and be approved. Price gouging without RP is not allowed.'],
      ],
    },
    {
      title: '6. STAFF & REPORTING',
      color: C,
      rules: [
        ['Do not argue with staff mid-RP', 'If a staff member intervenes, follow their instruction immediately. Discuss it later via report or forum.'],
        ['Report with evidence', 'File reports with video clips when possible. Reports without evidence take longer to process.'],
        ['Staff decisions can be appealed', 'Use the support ticket category in the forum to appeal bans or staff decisions — calmly and with evidence.'],
      ],
    },
  ]

  return (
    <div style={{ minHeight: '100vh', color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '80px 24px 60px' }}>
        <a href={homeHref} style={{ fontSize: 12, color: 'var(--muted)', textDecoration: 'none', letterSpacing: 1 }}>&#8592; BACK TO FIVEM</a>
        <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <a href={whitelistHref} style={{ padding: '8px 10px', border: `1px solid ${C}33`, color: C, textDecoration: 'none', borderRadius: 7, fontSize: 10, letterSpacing: 2, fontWeight: 800 }}>WHITELIST</a>
          <a href={storeHref} style={{ padding: '8px 10px', border: `1px solid ${Y}33`, color: Y, textDecoration: 'none', borderRadius: 7, fontSize: 10, letterSpacing: 2, fontWeight: 800 }}>STORE</a>
        </div>

        <div style={{ textAlign: 'center', marginTop: 32, marginBottom: 40 }}>
          <div style={{ fontSize: 44, marginBottom: 8 }}>📜</div>
          <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: 3, background: `linear-gradient(135deg, ${G}, ${C})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>SERVER RULES</h1>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 8 }}>Ignorance of the rules is not an excuse. Updated regularly by the staff team.</p>
        </div>

        {sections.map(section => (
          <div key={section.title} style={{ marginBottom: 32, padding: 24, borderRadius: 12, background: 'color-mix(in srgb, var(--text) 2%, transparent)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 3, color: section.color, marginBottom: 16 }}>{section.title}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {section.rules.map(([rule, desc]) => (
                <div key={rule} style={{ borderLeft: `2px solid ${section.color}44`, paddingLeft: 14 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 3 }}>{rule}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>{desc}</div>
                </div>
              ))}
            </div>
          </div>
        ))}

        <div style={{ padding: 18, borderRadius: 10, background: 'color-mix(in srgb, var(--red) 8%, transparent)', border: '1px solid rgba(255,71,87,0.25)' }}>
          <div style={{ fontSize: 12, color: R, fontWeight: 700, letterSpacing: 2, marginBottom: 6 }}>⚠️ PENALTIES</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.8 }}>
            Violations are judged in context and on a case-by-case basis. Typical penalties range from in-character warnings to
            temporary bans and permanent bans for repeat or severe offences (cheating, exploiting, real-money trading, hate speech).
          </div>
        </div>
      </div>
    </div>
  )
}
