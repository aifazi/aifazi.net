'use client'
import { SectionHeader, Card } from '../../components/community'

const G = 'var(--green)', C = 'var(--cyan)'

export default function StoreFAQ({ isMobile }) {
  return (
    <>
      {/* How perks work */}
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '48px 24px 0' }}>
        <SectionHeader eyebrow="Process" title="How In-Game Perks Work" />
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          {[
            { n: '1', t: 'Subscribe', d: 'Choose a tier above and pay securely with Stripe. You are charged monthly until you cancel.' },
            { n: '2', t: 'Auto-sync', d: 'The server polls our API every 30 seconds and applies your tier automatically — no commands, no tickets.' },
            { n: '3', t: 'Enjoy the city', d: 'Vehicle classes, custom plates, phone digits, weapon skins, auction access, garage/home slots and more unlock immediately.' },
            { n: '4', t: 'Manage anytime', d: 'Use MANAGE to update your card, or CANCEL to stop at the end of the billing period. Perks stay until then.' },
          ].map(s => (
            <Card key={s.n} style={{ padding: 16, display: 'flex', gap: 14 }}>
              <div style={{ width: 34, height: 34, flexShrink: 0, borderRadius: '50%', border: `1px solid color-mix(in srgb, ${G} 33%, transparent)`, color: G, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>{s.n}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{s.t}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3, lineHeight: 1.6 }}>{s.d}</div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* FAQ */}
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '48px 24px 0' }}>
        <SectionHeader eyebrow="Answers" title="Frequently Asked Questions" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[
            ['How fast do perks apply?', 'The server checks for new subscriptions every 30 seconds. If you are already in the city you will get your tier within a minute; otherwise it applies on your next join.'],
            ['Can I cancel anytime?', 'Yes — cancel in the store and the subscription stops at the end of the current billing period. You keep your perks until then.'],
            ['What if I do not want it anymore mid-period?', 'Cancellations always run to the end of the paid period. Refunds are handled on a case-by-case basis by staff.'],
            ['Are perks account-wide or per character?', 'Per account. They are keyed to your linked identifiers, so they apply to every character you play.'],
          ].map(([q, a]) => (
            <details key={q} style={{ padding: '14px 16px', background: 'rgba(255,255,255,0.015)', border: '1px solid var(--border)', borderRadius: 10, cursor: 'pointer' }}>
              <summary style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-display)' }}>{q}</summary>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10, lineHeight: 1.7 }}>{a}</div>
            </details>
          ))}
        </div>
      </div>
    </>
  )
}
