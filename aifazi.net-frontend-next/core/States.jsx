/**
 * core/States.jsx — shared loading / empty / error / disabled states.
 *
 * One visual language for every admin list so panels stop hand-rolling
 * "No data" divs with subtly different styles. Cyber theme via design
 * tokens (follows the active theme); motion is CSS-only and stands down
 * under `prefers-reduced-motion`.
 *
 * Relation to siblings: core/Feedback.jsx owns the generic EmptyState /
 * ErrorRetry pair; admin/ui.jsx owns the admin-kit EmptyState. This module
 * is the D-series states language (LoadingState + ErrorState + DisabledNote
 * included) — new admin lists should import from here.
 */
import { t, VARIANTS } from './tokens'

const MONO = 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)'

function StatesStyle() {
  return (
    <style>{`
      @keyframes stSpin { to { transform: rotate(360deg); } }
      .st-spinner {
        width: 22px; height: 22px; border-radius: 50%;
        border: 2px solid color-mix(in srgb, var(--text) 18%, transparent);
        border-top-color: var(--cyan);
        animation: stSpin 0.8s linear infinite;
      }
      @media (prefers-reduced-motion: reduce) {
        .st-spinner { animation: none; border-top-color: color-mix(in srgb, var(--text) 18%, transparent); }
      }
    `}</style>
  )
}

export function LoadingState({ label = 'Loading…', style }) {
  return (
    <div role="status" aria-live="polite" style={{ textAlign: 'center', padding: '48px 24px', ...style }}>
      <StatesStyle />
      <div className="st-spinner" aria-hidden="true" style={{ margin: '0 auto 14px' }} />
      <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 2, color: t.muted, textTransform: 'uppercase' }}>
        {label}
      </div>
    </div>
  )
}

export function EmptyState({ icon = '∅', title = 'Nothing here yet', hint, action, style }) {
  return (
    <div role="status" style={{ textAlign: 'center', padding: '48px 24px', color: t.muted, ...style }}>
      <div style={{ fontSize: 34, marginBottom: 12, opacity: 0.8 }} aria-hidden="true">{icon}</div>
      <div style={{ fontFamily: MONO, fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', color: t.text }}>{title}</div>
      {hint ? (
        <div style={{ fontFamily: MONO, fontSize: 11, color: t.muted, marginTop: 8, opacity: 0.85, lineHeight: 1.6 }}>{hint}</div>
      ) : null}
      {action ? <div style={{ marginTop: 16 }}>{action}</div> : null}
    </div>
  )
}

export function ErrorState({ title = 'Something went wrong', hint, onRetry, retryLabel = 'Retry', style }) {
  const v = VARIANTS.error
  return (
    <div role="alert" style={{ border: `1px solid ${v.border}`, background: v.bg, borderRadius: 10, padding: '20px 22px', ...style }}>
      <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 2, color: v.color, marginBottom: 8 }}>
        {v.icon} {v.label}
      </div>
      <div style={{ fontFamily: t.fontDisplay, fontSize: 15, fontWeight: 600, color: t.text, marginBottom: 6 }}>{title}</div>
      {hint ? (
        <div style={{ fontFamily: MONO, fontSize: 12, color: t.muted, lineHeight: 1.6, marginBottom: 12 }}>{hint}</div>
      ) : null}
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          style={{
            fontFamily: MONO, fontSize: 12, letterSpacing: 1, padding: '10px 16px',
            background: v.color, color: t.bg, border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 700,
          }}
        >
          {retryLabel}
        </button>
      ) : null}
    </div>
  )
}

export function DisabledNote({ children, hint, style }) {
  const v = VARIANTS.warning
  const text = children ?? hint
  if (!text) return null
  return (
    <div role="note" style={{
      display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', borderRadius: 8,
      fontFamily: MONO, fontSize: 11, lineHeight: 1.6, color: t.muted,
      background: v.bg, border: `1px solid ${v.border}`, borderLeft: `3px solid ${v.color}`,
      ...style,
    }}>
      <span aria-hidden="true" style={{ color: v.color, flexShrink: 0 }}>{v.icon}</span>
      <span>{text}</span>
    </div>
  )
}
