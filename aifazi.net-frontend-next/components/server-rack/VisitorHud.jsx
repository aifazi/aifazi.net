'use client'
import { useState } from 'react'
import { maskIp } from './globeUtils'

// Extracted from ServerRackAnimation.jsx - globe visitor telemetry HUD.
function VisitorHud({ visitor, shellRef }) {
  const [open, setOpen] = useState(false)

  if (!visitor) {
    return (
      <div ref={shellRef} className="globe-visitor-shell" style={{
        position: 'absolute', bottom: 12, left: 14, zIndex: 3,
        pointerEvents: 'none',
      }}>
        <div className="globe-visitor-card" style={{
          borderRadius: 4, padding: '8px 12px',
          fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)',
          letterSpacing: 1.5,
        }}>
          <span style={{ color: 'var(--green)', marginRight: 8 }}>◉</span>
          LOCATING…
        </div>
      </div>
    )
  }

  const place = [visitor.city, visitor.country].filter(v => v && v !== '—').join(', ') || 'Unknown'
  const chips = [
    visitor.ipType && visitor.ipType !== '—' ? visitor.ipType : null,
    visitor.tz && visitor.tz !== '—' ? visitor.tz : null,
    visitor.asn && visitor.asn !== '—' ? visitor.asn : null,
  ].filter(Boolean)

  const details = [
    ['IP',        maskIp(visitor.ip)],
    ['LOCATION',  visitor.address || place],
    ['REGION',    visitor.region],
    ['COORDS',    visitor.lat !== '—' ? `${visitor.lat}°, ${visitor.lon}°` : '—'],
    ['TZ',        [visitor.tz, visitor.utc].filter(v => v && v !== '—').join(' ')],
    ['ISP',       visitor.org],
    ['NETWORK',   visitor.network],
  ].filter(([, v]) => v && v !== '—')

  const hasCoords = Number.isFinite(+visitor.lat) && Number.isFinite(+visitor.lon) && visitor.lat !== '—'

  return (
    <div
      ref={shellRef}
      className="globe-visitor-shell"
      data-anchored={hasCoords ? 'true' : undefined}
      style={{
        position: 'absolute',
        // Default corner placement; CSS anchor rules override via [data-anchored]
        bottom: 12,
        left: 14,
        zIndex: 4,
        maxWidth: 'calc(100% - 28px)',
      }}
    >
      <div
        className="globe-visitor-card"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        tabIndex={0}
        role="status"
        aria-label={`Visitor telemetry: ${place}`}
        style={{
          position: 'relative',
          borderRadius: 4,
          padding: '10px 14px 11px',
          minWidth: 220,
          maxWidth: 320,
          cursor: 'default',
          outline: 'none',
        }}
      >
        {/* Corner brackets — targeting reticle */}
        {[
          { top: -1, left: -1, borderTop: '1.5px solid var(--cyan)', borderLeft: '1.5px solid var(--cyan)' },
          { top: -1, right: -1, borderTop: '1.5px solid var(--cyan)', borderRight: '1.5px solid var(--cyan)' },
          { bottom: -1, left: -1, borderBottom: '1.5px solid var(--cyan)', borderLeft: '1.5px solid var(--cyan)' },
          { bottom: -1, right: -1, borderBottom: '1.5px solid var(--cyan)', borderRight: '1.5px solid var(--cyan)' },
        ].map((s, i) => (
          <span key={i} aria-hidden style={{
            position: 'absolute', width: 10, height: 10,
            pointerEvents: 'none', opacity: 0.85, ...s,
          }} />
        ))}

        {/* Status row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
          <span aria-hidden style={{
            width: 6, height: 6, borderRadius: '50%',
            background: 'var(--green)',
            boxShadow: '0 0 8px var(--green)',
            animation: 'hudPulse 1.8s ease-in-out infinite',
            flexShrink: 0,
          }} />
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 11,
            color: 'var(--green)', letterSpacing: 2, fontWeight: 700,
          }}>LIVE</span>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 11,
            color: 'var(--muted)', letterSpacing: 1.2, marginLeft: 'auto',
          }}>{visitor.updatedAt || 'NOW'}</span>
        </div>

        {/* Location headline */}
        <div style={{
          fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700,
          color: 'var(--text)', lineHeight: 1.2, letterSpacing: -0.2,
          marginBottom: 2, wordBreak: 'break-word',
        }}>
          {visitor.flag && visitor.flag !== '—' ? visitor.flag + ' ' : ''}{place}
        </div>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 11,
          color: 'var(--muted)', letterSpacing: 0.4, marginBottom: 8,
        }}>
          {maskIp(visitor.ip)}{visitor.ipType && visitor.ipType !== '—' ? ` · ${visitor.ipType}` : ''}
        </div>

        {/* Fact chips — never render a content-less box */}
        {chips.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {chips.map(c => (
            <span key={c} style={{
              fontFamily: 'var(--font-mono)', fontSize: 11,
              color: 'var(--cyan)',
              background: 'color-mix(in srgb, var(--cyan) 10%, transparent)',
              border: '1px solid color-mix(in srgb, var(--cyan) 28%, transparent)',
              borderRadius: 3, padding: '2px 7px', letterSpacing: 0.3,
              whiteSpace: 'nowrap',
            }}>{c}</span>
          ))}
        </div>
        )}

        {/* Expanded details — hover / focus */}
        <div style={{
          display: 'grid',
          gridTemplateRows: open ? '1fr' : '0fr',
          transition: 'grid-template-rows 0.28s var(--ease-out, ease), opacity 0.22s ease',
          opacity: open ? 1 : 0,
          marginTop: open ? 9 : 0,
        }}>
          <div style={{ overflow: 'hidden' }}>
            {/* Never render a content-less details box */}
            {details.length > 0 && (
            <div style={{
              borderTop: '1px solid color-mix(in srgb, var(--cyan) 18%, transparent)',
              paddingTop: 8,
              display: 'grid', gridTemplateColumns: '64px minmax(0, 1fr)',
              columnGap: 8, rowGap: 3,
            }}>
              {details.map(([label, val]) => (
                <div key={label} style={{ display: 'contents' }}>
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: 11,
                    color: 'var(--muted)', letterSpacing: 1, lineHeight: 1.45,
                  }}>{label}</span>
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: 11,
                    color: 'var(--cyan)', fontWeight: 600, lineHeight: 1.45,
                    wordBreak: 'break-word',
                  }}>{val}</span>
                </div>
              ))}
            </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes hudPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.45; transform: scale(0.85); }
        }
        .globe-visitor-card:focus-visible {
          outline: 2px solid var(--green);
          outline-offset: 2px;
        }
        /* Visitor HUD pin — owned by pinVisitorShell() (per-frame JS projection,
           works in every browser). Shell bottom edge sits exactly 10px above
           the live marker; the stem + target dot bridge the gap. */
        @supports (anchor-name: --cobe-visitor) {
          .globe-visitor-shell[data-anchored='true'] {
            max-width: min(320px, calc(100% - 28px)) !important;
          }
          /* Pointer stem — the shell is horizontally centered on the marker
             with its bottom edge exactly 10px above the anchor, so a centered
             10px stem + target dot lands precisely on the visitor marker. */
          .globe-visitor-shell[data-anchored='true'] .globe-visitor-card {
            position: relative;
          }
          .globe-visitor-shell[data-anchored='true'] .globe-visitor-card::after {
            content: '';
            position: absolute;
            left: 50%;
            top: 100%;
            width: 1px;
            height: 10px;
            translate: -50% 0;
            background: linear-gradient(to bottom, var(--cyan), color-mix(in srgb, var(--cyan) 30%, transparent));
            pointer-events: none;
          }
          .globe-visitor-shell[data-anchored='true'] .globe-visitor-card::before {
            content: '';
            position: absolute;
            left: 50%;
            top: calc(100% + 8px);
            width: 5px;
            height: 5px;
            translate: -50% -50%;
            border-radius: 50%;
            background: var(--orange, #ff6b35);
            box-shadow: 0 0 7px var(--orange, #ff6b35);
            pointer-events: none;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .globe-visitor-card span[style*="hudPulse"] { animation: none !important; }
        }
      `}</style>
    </div>
  )
}

export { VisitorHud }
