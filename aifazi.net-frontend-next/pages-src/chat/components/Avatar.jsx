'use client'
import { aCol } from '../chat-constants'

export function Avatar({ name = '?', size = 32, online }) {
  return (
    <div style={{ position: 'relative', flexShrink: 0, userSelect: 'none' }}>
      <div style={{
        width: size, height: size, borderRadius: '50%', background: aCol(name),
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size * .4, fontWeight: 700, color: '#fff', letterSpacing: -0.5,
      }}>
        {name[0]?.toUpperCase() || '?'}
      </div>
      {online !== undefined && (
        <span style={{
          position: 'absolute', bottom: -1, right: -1, width: 10, height: 10,
          borderRadius: '50%', background: online ? '#23d160' : 'rgba(255,255,255,0.2)',
          border: '2px solid var(--bg, #0f111a)',
        }} />
      )}
    </div>
  )
}
