'use client'
import { roleColor, T } from '../chat-constants'

export function RolePill({ role }) {
  const r = String(role || 'member').toLowerCase()
  if (!r || r === 'member' || r === 'user') return null
  const c = roleColor(r)
  return (
    <span style={{
      fontSize: 8, fontFamily: T.mono, letterSpacing: 1, padding: '1px 5px', borderRadius: 4,
      background: `${c}1f`, color: c, border: `1px solid ${c}35`, textTransform: 'uppercase', lineHeight: 1.4,
    }}>{r}</span>
  )
}
