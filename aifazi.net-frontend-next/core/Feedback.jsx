/**
 * core/Feedback.jsx — shared empty / error UI (theme-aware).
 * Use instead of ad-hoc "No data" / silent redirects on fetch failure.
 */
import { t, VARIANTS } from './tokens'

export function EmptyState({ icon = '∅', title = 'Nothing here', hint, action, style }) {
  return (
    <div
      role="status"
      style={{
        textAlign: 'center',
        padding: '48px 24px',
        color: t.muted,
        ...style,
      }}
    >
      <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.7 }} aria-hidden="true">{icon}</div>
      <div style={{ fontFamily: t.fontDisplay, fontSize: 16, fontWeight: 600, color: t.text2, marginBottom: 6 }}>
        {title}
      </div>
      {hint ? (
        <div style={{ fontFamily: t.fontMono, fontSize: 12, lineHeight: 1.6, maxWidth: 360, margin: '0 auto' }}>
          {hint}
        </div>
      ) : null}
      {action ? <div style={{ marginTop: 16 }}>{action}</div> : null}
    </div>
  )
}

export function ErrorRetry({
  title = 'Something went wrong',
  hint,
  onRetry,
  retryLabel = 'Retry',
  refId,
  style,
}) {
  const v = VARIANTS.error
  return (
    <div
      role="alert"
      style={{
        border: `1px solid ${v.border}`,
        background: v.bg,
        borderRadius: 10,
        padding: '20px 22px',
        ...style,
      }}
    >
      <div style={{ fontFamily: t.fontMono, fontSize: 11, letterSpacing: 2, color: v.color, marginBottom: 8 }}>
        {v.icon} {v.label}
      </div>
      <div style={{ fontFamily: t.fontDisplay, fontSize: 15, fontWeight: 600, color: t.text, marginBottom: 6 }}>
        {title}
      </div>
      {hint ? (
        <div style={{ fontFamily: t.fontMono, fontSize: 12, color: t.muted, lineHeight: 1.6, marginBottom: 12 }}>
          {hint}
        </div>
      ) : null}
      {refId ? (
        <div style={{ fontFamily: t.fontMono, fontSize: 11, color: t.muted, marginBottom: 12 }}>
          Ref: {refId}
        </div>
      ) : null}
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          style={{
            fontFamily: t.fontMono,
            fontSize: 12,
            letterSpacing: 1,
            padding: '10px 16px',
            background: v.color,
            color: t.bg,
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
            fontWeight: 700,
          }}
        >
          {retryLabel}
        </button>
      ) : null}
    </div>
  )
}

export function Skeleton({ height = 16, width = '100%', radius = 6, style }) {
  return (
    <div
      aria-hidden="true"
      style={{
        height,
        width,
        borderRadius: radius,
        background: `color-mix(in srgb, ${t.border} 45%, transparent)`,
        ...style,
      }}
    />
  )
}

export function SkeletonList({ rows = 3, gap = 10 }) {
  return (
    <div aria-busy="true" aria-live="polite" style={{ display: 'grid', gap }}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} height={i === 0 ? 22 : 16} width={i === 0 ? '40%' : '100%'} />
      ))}
    </div>
  )
}
