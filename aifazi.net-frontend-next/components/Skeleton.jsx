// ── Skeleton Loader Components ────────────────────────────────────────────────
// Respects prefers-reduced-motion: pulses are disabled when motion is reduced.

import { memo } from 'react'

const Bone = memo(function Bone({ width = '100%', height = 16, className = '', style = {} }) {
  return (
    <div
      className={`skeleton-bone ${className}`}
      style={{ width, height, ...style }}
    />
  )
})

// ── Blog post card skeleton ────────────────────────────────────────────────────
export function BlogCardSkeleton() {
  return (
    <div className="skeleton-blog-card" style={{ background:'var(--bg2)', border:'1px solid var(--border)', overflow:'hidden', display:'flex', flexDirection:'column' }}>
      <div className="skeleton-bone" style={{ height:200, borderRadius:0 }} />
      <div style={{ padding:28, display:'flex', flexDirection:'column', gap:12 }}>
        <div style={{ display:'flex', gap:12, alignItems:'center' }}>
          <Bone width={72} height={20} />
          <Bone width={90} height={12} />
        </div>
        <Bone width='90%' height={22} />
        <Bone width='65%' height={22} />
        <Bone width='100%' height={14} />
        <Bone width='85%' height={14} />
        <Bone width='70%' height={14} />
        <Bone width={100} height={14} style={{ marginTop:8 }} />
      </div>
    </div>
  )
}

// ── Forum thread row skeleton ─────────────────────────────────────────────────
export function ThreadRowSkeleton() {
  return (
    <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', padding:'16px 20px', display:'flex', alignItems:'center', gap:16 }}>
      <div className="skeleton-bone" style={{ width:40, height:40, borderRadius:'50%' }} />
      <div style={{ flex:1, display:'flex', flexDirection:'column', gap:8 }}>
        <Bone width='60%' height={16} />
        <div style={{ display:'flex', gap:10 }}>
          <Bone width={60} height={11} />
          <Bone width={80} height={11} />
        </div>
      </div>
      <Bone width={40} height={14} />
    </div>
  )
}

// ── Forms index page skeleton ──────────────────────────────────────────────
export function PageSkeleton() {
  return (
    <div style={{ padding: '80px 20px', display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1040, margin: '0 auto' }}>
      <div className="skeleton-bone" style={{ height: 28, width: '40%', marginBottom: 8 }} />
      <div className="skeleton-bone" style={{ height: 14, width: '80%' }} />
      <div className="skeleton-bone" style={{ height: 14, width: '60%', marginBottom: 24 }} />
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="skeleton-bone" style={{ height: 120, borderRadius: 10 }} />
      ))}
    </div>
  )
}


