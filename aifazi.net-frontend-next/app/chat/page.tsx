export const dynamic = 'force-dynamic'
import AdminChatClient from '@/pages-src/chat/AdminChat'

export default function Page() {
  console.log('[CHAT_PAGE] MARKER_2026_TEST')
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%', overflow: 'hidden', background: 'var(--bg, #0f111a)' }}>
      <AdminChatClient />
    </div>
  )
}
