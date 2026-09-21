import { T } from '../chat-constants'

const TALK_URL = process.env.NEXT_PUBLIC_TALK_URL || 'https://nextcloud.aifazi.net/apps/spreed'

export function VoicePanel({ room, onLeave }) {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, padding: 32 }}>
      <div style={{ fontSize: 48 }}>📞</div>
      <div style={{ fontFamily: T.display, fontSize: 16, fontWeight: 700, color: T.text, textAlign: 'center' }}>
        Voice &amp; Video Calls Have Moved
      </div>
      <div style={{ fontFamily: T.mono, fontSize: 11, color: T.muted, textAlign: 'center', maxWidth: 400, lineHeight: 1.6 }}>
        Voice and video calls are now powered by Nextcloud Talk for better performance and reliability.
      </div>
      <a
        href={TALK_URL}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          padding: '10px 24px', borderRadius: 8, border: 'none',
          background: 'linear-gradient(135deg, color-mix(in srgb, var(--green) 85%, transparent), color-mix(in srgb, var(--cyan) 85%, transparent))',
          color: '#000', fontFamily: T.mono, fontSize: 11, fontWeight: 700, cursor: 'pointer', textDecoration: 'none',
        }}
      >
        OPEN NEXTCLOUD TALK
      </a>
      <button onClick={onLeave} style={{ padding: '8px 16px', border: `1px solid ${T.border}`, borderRadius: 8, background: 'transparent', color: T.muted, fontFamily: T.mono, fontSize: 10, cursor: 'pointer' }}>
        BACK TO CHAT
      </button>
    </div>
  )
}
