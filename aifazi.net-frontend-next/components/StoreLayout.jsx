'use client'
export default function StoreLayout({ children }) {
  return (
    <div className="store-layout" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      {children}
    </div>
  )
}
