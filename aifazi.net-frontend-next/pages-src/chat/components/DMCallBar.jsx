'use client'
// DMCallBar — voice calls moved to Nextcloud Talk (LiveKit removed).
import { T } from '../chat-constants'

const TALK_URL = process.env.NEXT_PUBLIC_TALK_URL || 'https://nextcloud.aifazi.net/apps/spreed'

export function DMCallBar({ peer, onEnd }) {
  return (
    <div style={{
      flexShrink: 0, padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 10,
      borderBottom: `1px solid ${T.border}`, background: 'color-mix(in srgb, var(--cyan) 7%, transparent)',
    }}>
      <div style={{ fontSize: 16 }}>📞</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>
          Voice calls are on Nextcloud Talk
        </div>
        <div style={{ fontSize: 10, color: T.muted }}>
          Open Talk to call {peer}
        </div>
      </div>
      <a
        href={TALK_URL}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          padding: '5px 14px', border: 'none', borderRadius: 8, cursor: 'pointer',
          background: 'linear-gradient(135deg, color-mix(in srgb, var(--green) 85%, transparent), color-mix(in srgb, var(--cyan) 85%, transparent))',
          color: '#000', fontSize: 11, fontWeight: 700, fontFamily: T.mono, textDecoration: 'none',
        }}
      >
        OPEN TALK
      </a>
      <button onClick={onEnd}
        style={{ padding: '5px 14px', border: 'none', borderRadius: 8, cursor: 'pointer', background: T.danger, color: '#fff', fontSize: 12, fontWeight: 700, fontFamily: T.mono }}>
        DISMISS
      </button>
    </div>
  )
}
