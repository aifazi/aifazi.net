'use client'

/**
 * HybridInfraBody — client shell for /hybrid-infra.
 *
 * Two views over one URL source of truth (?diagram=<slug>):
 *  - List view: header + case-study library.
 *  - Enter view: compact back bar + the focused diagram (what you get when
 *    you click a plan — no full page reload; history.pushState only, so the
 *    browser Back button reverses it too).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import HybridInfraLibrary from './HybridInfraLibrary'
import HybridInfraLoader from './HybridInfraLoader'
import HybridInfraErrorBoundary from './HybridInfraErrorBoundary'
import { BUILTIN_STUDIES } from '@/data/cloud-infra'

function prettify(slug: string): string {
  return slug
    .split('-')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
}

function titleFor(slug: string): string {
  return BUILTIN_STUDIES.find((s) => s.slug === slug)?.title || prettify(slug)
}

function currentParam(): string | null {
  try {
    return new URLSearchParams(window.location.search).get('diagram')
  } catch {
    return null
  }
}

export default function HybridInfraBody({
  initialSlug,
  initialEntered,
}: {
  initialSlug: string
  initialEntered: boolean
}) {
  const [activeSlug, setActiveSlug] = useState(initialSlug)
  const [activeTitle, setActiveTitle] = useState(titleFor(initialSlug))
  const [entered, setEntered] = useState(initialEntered)
  const [autoEdit, setAutoEdit] = useState(false)
  // Last slug seen in the URL — survives exiting back to the list view, so
  // the EDIT SITE FAB re-enters the diagram you were just looking at.
  const lastSlugRef = useRef(initialSlug)

  // Single source of truth: the URL. Browser Back/Forward re-syncs us.
  const syncFromUrl = useCallback(() => {
    const p = currentParam()
    if (p) {
      lastSlugRef.current = p
      setActiveSlug(p)
      setActiveTitle(titleFor(p))
      setEntered(true)
    } else {
      setEntered(false)
    }
  }, [])

  useEffect(() => {
    window.addEventListener('popstate', syncFromUrl)
    return () => window.removeEventListener('popstate', syncFromUrl)
  }, [syncFromUrl])

  const open = useCallback((slug: string, title?: string, opts?: { edit?: boolean }) => {
    try {
      const url = new URL(window.location.href)
      url.searchParams.set('diagram', slug)
      window.history.pushState({ hi: 1 }, '', url.toString())
    } catch {
      /* noop */
    }
    lastSlugRef.current = slug
    setActiveSlug(slug)
    setActiveTitle(title || titleFor(slug))
    setEntered(true)
    setAutoEdit(Boolean(opts?.edit))
    try {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch {
      /* noop */
    }
  }, [])

  const exit = useCallback(() => {
    // Real history Back when we pushed in — keeps Back/forward buttons and
    // the back bar in agreement (popstate then syncs `entered`).
    try {
      if (window.history.state?.hi) {
        window.history.back()
        return
      }
    } catch {
      /* noop */
    }
    try {
      const url = new URL(window.location.href)
      url.searchParams.delete('diagram')
      window.history.pushState(null, '', url.toString())
    } catch {
      /* noop */
    }
    setEntered(false)
    setAutoEdit(false)
    try {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch {
      /* noop */
    }
  }, [])

  // EDIT SITE FAB while we are in the list view: enter first, then let the
  // editor's own infra:edit listener take over on its next mount. Once
  // entered, the mounted editor handles the event itself.
  useEffect(() => {
    const onEdit = () => {
      if (entered) return
      open(lastSlugRef.current, undefined, { edit: true })
    }
    window.addEventListener('infra:edit', onEdit)
    return () => window.removeEventListener('infra:edit', onEdit)
  }, [entered, open])

  if (entered) {
    return (
      <>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={exit}
            style={{
              fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1.5,
              fontWeight: 700, cursor: 'pointer', padding: '8px 14px', borderRadius: 10,
              background: 'transparent', border: '1px solid var(--border)', color: 'var(--cyan)',
            }}
          >
            ← ALL PLANS
          </button>
          <h1
            style={{
              fontFamily: 'var(--font-display)', fontSize: 'clamp(18px, 2.4vw, 26px)',
              fontWeight: 800, color: 'var(--text)', margin: 0, letterSpacing: -0.3,
            }}
          >
            {activeTitle}
          </h1>
        </div>
        <HybridInfraErrorBoundary>
          <HybridInfraLoader autoEdit={autoEdit} />
        </HybridInfraErrorBoundary>
      </>
    )
  }

  return (
    <>
      <div style={{ marginBottom: 18 }}>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            letterSpacing: 3,
            color: 'var(--cyan)',
            fontWeight: 700,
            marginBottom: 8,
          }}
        >
          CASE STUDY · IT MODERNIZATION
        </div>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(30px, 4vw, 54px)',
            fontWeight: 800,
            color: 'var(--text)',
            margin: '0 0 8px',
            letterSpacing: -0.5,
          }}
        >
          Plan A — Hybrid Infrastructure
        </h1>
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
            color: 'var(--muted)',
            margin: 0,
            maxWidth: 760,
            lineHeight: 1.6,
          }}
        >
          On-premises core + Microsoft 365 / Entra ID / Defender / Purview.
          Select any component to inspect its role, workloads, and
          dependencies.
        </p>
      </div>
      <HybridInfraLibrary activeSlug={activeSlug} onOpen={open} />
      <p
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: 'var(--muted)',
          lineHeight: 1.6,
          marginTop: 18,
          maxWidth: 900,
        }}
      >
        Plan A is hybrid: on-premises AD + Entra ID · Synology +
        SharePoint/OneDrive · Proxmox compute · Veeam + QNAP + off-site
        immutable copy. Presented as an interactive case study; identifying
        client details are omitted.
      </p>
    </>
  )
}
