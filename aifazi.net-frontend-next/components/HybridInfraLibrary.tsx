'use client'

/**
 * HybridInfraLibrary — thread-style index of case-study diagrams.
 *
 * Lists the built-in Plan A seed plus every published diagram from the
 * backend (and drafts for admins). Selecting a row hands the slug to the
 * page shell (HybridInfraBody), which switches to the enter view via
 * history.pushState — no full page reload.
 */
import { useEffect, useState } from 'react'
import { getRole } from '@/lib/api'
import { listAllDiagrams, listDiagrams, type DiagramMeta } from '@/lib/infraApi'
import { useInfraTone, infraPalette } from '@/lib/infraTheme'
import { BUILTIN_STUDIES } from '@/data/cloud-infra'

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return ''
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000))
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  const d = Math.floor(s / 86400)
  return d === 1 ? 'yesterday' : `${d}d ago`
}

export default function HybridInfraLibrary({
  activeSlug,
  onOpen,
}: {
  activeSlug: string
  onOpen: (slug: string, title?: string) => void
}) {
  const pal = infraPalette(useInfraTone())
  const [diagrams, setDiagrams] = useState<DiagramMeta[]>([])
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    // Admins see drafts too (DRAFT badge); fall back to the public list if
    // the admin endpoint rejects us (stale role in this tab).
    const isAdmin = (() => {
      try {
        return getRole() === 'admin'
      } catch {
        return false
      }
    })()
    const load = async (): Promise<DiagramMeta[]> => {
      if (isAdmin) {
        try {
          return await listAllDiagrams()
        } catch {
          /* fall through to the public list */
        }
      }
      return listDiagrams()
    }
    load()
      .then((list) => { if (alive) setDiagrams(list) })
      .catch(() => { if (alive) setFailed(true) })
    return () => { alive = false }
  }, [])

  return (
    <section aria-label="Case study library" style={{ marginBottom: 16 }}>
      <h2
        style={{
          margin: '0 0 10px', fontSize: 11, letterSpacing: 2.5,
          color: pal.muted, fontFamily: 'var(--font-mono)',
        }}
      >
        CASE STUDY LIBRARY
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {BUILTIN_STUDIES.map((s) => (
          <button
            key={s.slug}
            type="button"
            onClick={() => onOpen(s.slug, s.title)}
            aria-current={activeSlug === s.slug}
            style={{
              display: 'grid', gridTemplateColumns: '1fr auto', gap: 4, alignItems: 'center',
              textAlign: 'left', cursor: 'pointer', width: '100%',
              background: pal.panel, border: `1px solid ${activeSlug === s.slug ? pal.cyan : pal.border}`,
              borderRadius: 12, padding: '12px 14px', color: pal.ink, fontFamily: 'inherit',
            }}
          >
            <span>
              <span style={{ display: 'block', fontSize: 14, fontWeight: 700 }}>
                {s.title}
                <span
                  style={{
                    fontSize: 10, fontWeight: 700, letterSpacing: 1.5, marginLeft: 8,
                    padding: '2px 8px', borderRadius: 999, verticalAlign: 'middle',
                    color: pal.green, border: `1px solid ${pal.green}`,
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  BUILT-IN
                </span>
              </span>
              <span style={{ display: 'block', fontSize: 12, color: pal.sub, marginTop: 4, lineHeight: 1.5 }}>
                {s.blurb}
              </span>
            </span>
            <span style={{ fontSize: 11, color: pal.muted, fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
              OPEN →
            </span>
          </button>
        ))}

        {diagrams.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => onOpen(m.slug, m.title)}
            aria-current={activeSlug === m.slug}
            style={{
              display: 'grid', gridTemplateColumns: '1fr auto', gap: 4, alignItems: 'center',
              textAlign: 'left', cursor: 'pointer', width: '100%',
              background: pal.panel, border: `1px solid ${activeSlug === m.slug ? pal.cyan : pal.border}`,
              borderRadius: 12, padding: '12px 14px', color: pal.ink, fontFamily: 'inherit',
            }}
          >
            <span>
              <span style={{ display: 'block', fontSize: 14, fontWeight: 700 }}>
                {m.title}
                {!m.published && (
                  <span
                    style={{
                      fontSize: 10, fontWeight: 700, letterSpacing: 1.5, marginLeft: 8,
                      padding: '2px 8px', borderRadius: 999, verticalAlign: 'middle',
                      color: pal.amber, border: `1px solid ${pal.amber}`,
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    DRAFT
                  </span>
                )}
              </span>
              <span
                style={{
                  display: 'block', fontSize: 11, color: pal.muted, marginTop: 4,
                  fontFamily: 'var(--font-mono)', letterSpacing: 0.5,
                }}
              >
                {m.nodeCount} components · {m.flowCount} flows
                {m.updatedAt ? ` · updated ${timeAgo(m.updatedAt)}` : ''}
              </span>
            </span>
            <span style={{ fontSize: 11, color: pal.muted, fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
              OPEN →
            </span>
          </button>
        ))}

        {!failed && diagrams.length === 0 && (
          <p style={{ fontSize: 12, color: pal.muted, margin: 0, lineHeight: 1.6 }}>
            Only the built-in Plan A study so far — admins can author more from the editor below.
          </p>
        )}
        {failed && diagrams.length === 0 && (
          <p style={{ fontSize: 12, color: pal.muted, margin: 0, lineHeight: 1.6 }}>
            {typeof navigator !== 'undefined' && navigator.onLine === false
              ? 'Library unavailable offline — the built-in Plan A study above still works.'
              : 'Could not load the shared library (server error) — the built-in Plan A study above still works.'}
          </p>
        )}
      </div>
    </section>
  )
}
