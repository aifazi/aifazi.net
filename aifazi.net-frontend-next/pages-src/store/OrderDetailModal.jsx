'use client'

const G = 'var(--green)', C = 'var(--cyan)'

export default function OrderDetailModal({ order, onClose }) {
  if (!order) return null

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, letterSpacing: 2, color: G }}>{order.order_number}</div>
          <span style={{ fontSize: 9, letterSpacing: 1.5, padding: '3px 10px', borderRadius: 12, border: `1px solid color-mix(in srgb, ${C} 33%, transparent)`, color: C, fontWeight: 800 }}>{(order.status || '').toUpperCase()}</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
          Placed {order.created_at ? new Date(order.created_at).toLocaleString() : '—'}
          {(order.carrier || order.tracking_number) && <div style={{ marginTop: 4 }}>📦 {order.carrier || ''} {order.tracking_number || ''}</div>}
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 2, color: C, marginBottom: 6, fontWeight: 800 }}>STATUS TIMELINE</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
          {(order.events || []).map((ev, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 12 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', marginTop: 4, background: G, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ color: 'var(--text)', fontWeight: 700 }}>{(ev.status || '').toUpperCase()}</div>
                {ev.note && <div style={{ color: 'var(--muted)', fontSize: 11 }}>{ev.note}</div>}
                <div style={{ color: 'var(--muted)', fontSize: 10 }}>{ev.created_at ? new Date(ev.created_at).toLocaleString() : ''}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 2, color: C, marginBottom: 6, fontWeight: 800 }}>ITEMS</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
          {(order.items || []).map((it, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: 'var(--text)' }}>{it.product_name} × {it.quantity}</span>
              <span style={{ color: 'var(--muted)' }}>${((it.line_total_cents || 0) / 100).toFixed(2)}</span>
            </div>
          ))}
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 2, color: C, marginBottom: 6, fontWeight: 800 }}>DOWNLOADS</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
          {(order.downloads || []).length === 0 ? <span style={{ fontSize: 12, color: 'var(--muted)' }}>None</span> : order.downloads.map(d => (
            <a key={d.id} href={`/api/store/downloads/${d.token}`} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: C, textDecoration: 'none' }}>⬇ {d.filename || d.product_name} ({d.downloads_used}/{d.downloads_allowed} used)</a>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1, padding: '8px 16px', borderRadius: 8, cursor: 'pointer' }}>CLOSE</button>
        </div>
      </div>
    </div>
  )
}
