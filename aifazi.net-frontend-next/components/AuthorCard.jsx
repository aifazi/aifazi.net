'use client'
import { Card, Badge } from './community'

export default function AuthorCard({ authorName = 'AIFAZI', category }) {
  const avatarUrl = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(authorName)}&backgroundColor=00ff88,00d4ff,a855f7,f97316&fontSize=38`

  return (
    <Card accent style={{ marginTop: 52, padding: 'clamp(20px, 3vw, 28px)', display: 'flex', gap: 18, flexWrap: 'wrap' }}>
      <img src={avatarUrl} alt={authorName} style={{ width: 60, height: 60, borderRadius: '50%', border: '2px solid var(--green)', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 3, color: 'var(--muted)', marginBottom: 8 }}>WRITTEN BY</div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>{authorName}</div>
        <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.65, margin: 0 }}>
          Writing about networking, infrastructure, and security from the trenches. Follow for deep-dives, tutorials, and field notes.
        </p>
        {category && (
          <div style={{ marginTop: 12 }}>
            <Badge tone="cyan">{category}</Badge>
          </div>
        )}
      </div>
    </Card>
  )
}
