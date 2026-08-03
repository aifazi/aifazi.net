'use client'
import { Card, NeonButton } from './community'

export default function NewsletterCTA() {
  return (
    <Card accent data-accent="cyan" style={{ marginTop: 64, padding: 'clamp(24px, 4vw, 40px)', textAlign: 'center' }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>📬</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 3, color: 'var(--cyan)', marginBottom: 12 }}>STAY IN THE LOOP</div>
      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(20px, 3vw, 28px)', fontWeight: 700, color: 'var(--text)', margin: '0 0 10px' }}>Never miss a post</h3>
      <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.65, maxWidth: 440, margin: '0 auto 20px' }}>
        Get the latest networking guides, security deep-dives, and infrastructure walkthroughs delivered straight to your inbox.
      </p>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
        <NeonButton href="https://discord.aifazi.net" target="_blank" variant="primary" size="md">
          Join Discord
        </NeonButton>
        <NeonButton to="/contact" variant="ghost" size="md">
          Contact Us
        </NeonButton>
      </div>
    </Card>
  )
}
