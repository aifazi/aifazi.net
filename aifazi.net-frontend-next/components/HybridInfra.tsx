'use client'

/**
 * HybridInfra — interactive case-study island for /hybrid-infra.
 *
 * Toolbar (mode filter, flow player, design notes, edge toggle, search,
 * PNG export, view toggle) + canvas diagram + detail side panel.
 * Dark ops-room aesthetic is intentional (showcase piece); fonts and radii
 * follow the site theme vars.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { HybridInfraCanvas, type HybridInfraCanvasHandle } from './HybridInfraCanvas'
import {
  COMPONENTS,
  TIMELINE,
  DESIGN_NOTES,
  MGMT_CARDS,
  EDGE_COPY,
  CATEGORY_META,
  depNameIn,
  dependencyChainIn,
  type DiagramDoc,
  type InfraCategory,
} from '@/data/hybrid-infra'
import { useInfraTone, infraPalette, infraCatColor } from '@/lib/infraTheme'

const MODES: { id: InfraCategory | 'all'; label: string }[] = [
  { id: 'all', label: 'FULL ARCHITECTURE' },
  { id: 'network', label: 'NETWORK' },
  { id: 'compute', label: 'COMPUTE' },
  { id: 'storage', label: 'STORAGE' },
  { id: 'identity', label: 'IDENTITY' },
  { id: 'security', label: 'SECURITY' },
  { id: 'backup', label: 'BACKUP / DR' },
]

/* BTN/PANEL live inside the component now (theme-aware) — see toneChrome. */

export default function HybridInfra({ doc }: { doc?: DiagramDoc | null }) {
  const [activeMode, setActiveMode] = useState<InfraCategory | 'all'>('all')
  const [edgeVendor, setEdgeVendor] = useState<'fortigate' | 'unifi'>('fortigate')
  // Deep-link (?node=<id>) honored at init — no effect needed.
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return 'firewall'
    try {
      const id = new URLSearchParams(window.location.search).get('node')
      const list = doc?.nodes ?? COMPONENTS
      if (id && list.some((c) => c.id === id)) return id
    } catch {
      /* noop */
    }
    return 'firewall'
  })
  const [playStep, setPlayStep] = useState(-1)
  const [viewMode, setViewMode] = useState<'technical' | 'management'>('technical')
  const [notesOpen, setNotesOpen] = useState(false)
  const [query, setQuery] = useState('')
  const canvasHandle = useRef<HybridInfraCanvasHandle>(null)
  const playTimer = useRef(0)
  const stageRef = useRef<HTMLElement>(null)
  const [toolsOpen, setToolsOpen] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
      } else {
        await stageRef.current?.requestFullscreen()
      }
    } catch {
      /* noop — unsupported or denied */
    }
  }
  useEffect(() => {
    const onFs = () => setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])
  const [notice, setNotice] = useState('')
  const noticeTimer = useRef(0)
  const flashNotice = (msg: string) => {
    setNotice(msg)
    window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setNotice(''), 2600)
  }

  const nodes = doc?.nodes ?? COMPONENTS
  const flows = doc?.flows ?? null

  const selected = useMemo(
    () => nodes.find((c) => c.id === selectedId) ?? null,
    [nodes, selectedId],
  )

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return null
    return new Set(
      nodes.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.role.toLowerCase().includes(q),
      ).map((c) => c.id),
    )
  }, [query, nodes])

  const focusIds = useMemo(() => {
    if (matches) return matches
    if (!selectedId) return null
    const { up, down } = dependencyChainIn(nodes, selectedId)
    return new Set([selectedId, ...up, ...down])
  }, [matches, selectedId, nodes])

  // Deep-link: selection updates the URL (?node=<id>).
  useEffect(() => {
    try {
      const url = new URL(window.location.href)
      if (selectedId) url.searchParams.set('node', selectedId)
      else url.searchParams.delete('node')
      window.history.replaceState(null, '', url.toString())
    } catch {
      /* noop */
    }
  }, [selectedId])

  // Flow player + notice timers.
  useEffect(
    () => () => {
      window.clearInterval(playTimer.current)
      window.clearTimeout(noticeTimer.current)
    },
    [],
  )
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      flashNotice('LINK COPIED TO CLIPBOARD')
    } catch {
      flashNotice('COPY FAILED — COPY THE URL MANUALLY')
    }
  }
  const stopPlay = () => {
    window.clearInterval(playTimer.current)
    playTimer.current = 0
    setPlayStep(-1)
  }
  const togglePlay = () => {
    if (playStep >= 0) {
      stopPlay()
      return
    }
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    setActiveMode('all')
    setPlayStep(0)
    playTimer.current = window.setInterval(() => {
      setPlayStep((s) => {
        if (s >= TIMELINE.length - 1) {
          window.clearInterval(playTimer.current)
          playTimer.current = 0
          return -1
        }
        return s + 1
      })
    }, reduce ? 400 : 1100)
  }

  const tone = useInfraTone()
  const pal = infraPalette(tone)
  // Theme-aware chrome (replaces the old dark-only BTN const).
  const BTN: React.CSSProperties = {
    background: pal.panel,
    color: pal.ink,
    border: `1px solid ${pal.border}`,
    padding: '9px 13px',
    borderRadius: 9,
    fontSize: 12,
    fontWeight: 600,
    fontFamily: 'var(--font-mono)',
    letterSpacing: 0.5,
  }
  const PANEL: React.CSSProperties = {
    background: `linear-gradient(180deg,${pal.bg2},${pal.bg})`,
    border: `1px solid ${pal.border}`,
    borderRadius: 14,
    padding: 16,
  }
  const H3: React.CSSProperties = {
    margin: '0 0 10px', fontSize: 11, letterSpacing: 2, color: pal.muted,
  }
  const accent = selected ? infraCatColor(selected.category, tone) : pal.blue
  const edgeNote =
    selectedId === 'firewall'
      ? EDGE_COPY[edgeVendor].note
      : null

  return (
    <div>
      <button
        type="button"
        className="hi-tools-toggle"
        aria-expanded={toolsOpen}
        onClick={() => setToolsOpen((v) => !v)}
        style={{ ...BTN, marginBottom: 10 }}
      >
        {toolsOpen ? 'HIDE TOOLS' : 'SHOW TOOLS'}
      </button>
      <div className={toolsOpen ? undefined : 'hi-tools-hidden'}>
      {/* ── Toolbar ─────────────────────────────────────────── */}
      <div
        role="toolbar"
        aria-label="Architecture filters"
        style={{
          display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
          marginBottom: 14,
        }}
      >
        <span style={{ fontSize: 11, letterSpacing: 2, color: 'var(--muted)', marginRight: 6 }}>
          MODES
        </span>
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setActiveMode(m.id)}
            aria-pressed={activeMode === m.id}
            style={{
              ...BTN,
              ...(activeMode === m.id
                ? { background: 'linear-gradient(180deg,#1b4d7a,#153a5c)', borderColor: pal.blue, color: '#ffffff' }
                : {}),
            }}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* ── Actions toolbar ─────────────────────────────────────── */}
      <div
        role="toolbar"
        aria-label="Diagram actions"
        style={{
          display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
          marginBottom: 14,
        }}
      >
        <button
          type="button"
          onClick={togglePlay}
          style={{
            ...BTN,
            background:
              playStep >= 0
                ? 'linear-gradient(180deg,#8a3d3d,#6a2c2c)'
                : 'linear-gradient(180deg,#1d5d8f,#17446c)',
            borderColor: playStep >= 0 ? pal.red : pal.blue,
            color: '#ffffff',
          }}
        >
          {playStep >= 0 ? '■ STOP FLOW' : '▶ PLAY ARCHITECTURE FLOW'}
        </button>
        <button
          type="button"
          onClick={() => setNotesOpen((v) => !v)}
          aria-expanded={notesOpen}
          style={BTN}
        >
          DESIGN NOTES
        </button>
        <span aria-hidden style={{ width: 1, height: 22, background: pal.border, margin: '0 6px' }} />
        <span style={{ fontSize: 11, letterSpacing: 2, color: 'var(--muted)' }}>
          SECURITY EDGE
        </span>
        <div
          role="group"
          aria-label="Firewall option"
          style={{ display: 'inline-flex', background: pal.panel, border: '1px solid #2b4862', borderRadius: 10, overflow: 'hidden' }}
        >
          {(['fortigate', 'unifi'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setEdgeVendor(v)}
              aria-pressed={edgeVendor === v}
              style={{
                background: 'transparent', border: 0,
                color: edgeVendor === v ? pal.amber : pal.muted,
                padding: '8px 12px', fontSize: 11, fontWeight: 700,
                fontFamily: 'var(--font-mono)',
                ...(edgeVendor === v ? { background: 'rgba(255,180,84,.16)' } : {}),
              }}
            >
              {v === 'fortigate' ? 'FORTIGATE HA' : 'UNIFI BUDGET'}
            </button>
          ))}
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && matches && matches.size > 0) {
              setSelectedId([...matches][0])
            } else if (e.key === 'Escape') {
              setQuery('')
            }
          }}
          placeholder="Search components…"
          aria-label="Search components"
          style={{
            background: pal.panel, border: '1px solid #2b4862', borderRadius: 9,
            color: pal.ink, padding: '9px 12px', fontSize: 12,
            fontFamily: 'var(--font-mono)', minWidth: 170,
          }}
        />
        {matches && (
          <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
            {matches.size} match{matches.size === 1 ? '' : 'es'}
          </span>
        )}
        <button
          type="button"
          onClick={() => {
            try {
              canvasHandle.current?.exportPng()
              flashNotice('DIAGRAM EXPORTED AS PNG')
            } catch {
              flashNotice('EXPORT FAILED')
            }
          }}
          style={BTN}
        >
          EXPORT PNG
        </button>
        <button type="button" onClick={copyLink} style={BTN} title="Copy a link to this view (includes selected node)">
          COPY LINK
        </button>
        {notice && (
          <span role="status" style={{ fontSize: 11, letterSpacing: 1.5, color: pal.green, fontFamily: 'var(--font-mono)' }}>
            {notice}
          </span>
        )}
        <div
          role="group"
          aria-label="View mode"
          style={{ display: 'inline-flex', background: pal.panel, border: '1px solid #2b4862', borderRadius: 10, overflow: 'hidden' }}
        >
          {(['technical', 'management'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setViewMode(v)}
              aria-pressed={viewMode === v}
              style={{
                background: viewMode === v ? 'rgba(53,167,255,.18)' : 'transparent',
                border: 0, color: viewMode === v ? pal.ink : pal.muted,
                padding: '9px 14px', fontSize: 12, fontWeight: 600,
                fontFamily: 'var(--font-mono)',
              }}
            >
              {v === 'technical' ? 'TECHNICAL VIEW' : 'MANAGEMENT VIEW'}
            </button>
          ))}
        </div>
      </div>
      </div>

      {/* ── Stage + side ────────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0,1.55fr) minmax(310px,.72fr)',
          gap: 16,
          alignItems: 'start',
        }}
        className="hi-layout"
      >
        <section
          ref={stageRef}
          aria-label="Interactive infrastructure visualization"
          className="hi-stage"
          style={{
            position: 'relative',
            background: `linear-gradient(180deg,${pal.bg2},${pal.bg})`,
            border: `1px solid ${pal.border}`,
            borderRadius: 18,
            overflow: 'hidden',
            boxShadow: '0 24px 80px rgba(0,0,0,.55)',
          }}
        >
          <div
            style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              gap: 12, padding: '12px 16px',
              borderBottom: `1px solid ${pal.border}`,
              background: pal.panel,
            }}
          >
            <h2 style={{ margin: 0, fontSize: 12, letterSpacing: 2.5, color: pal.sub, fontWeight: 700 }}>
              INTERACTIVE ENTERPRISE DATA CENTER
            </h2>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }} role="toolbar" aria-label="Diagram view controls">
              <button type="button" onClick={() => canvasHandle.current?.zoomOut()} title="Zoom out" aria-label="Zoom out" style={{ ...BTN, padding: '6px 10px' }}>−</button>
              <button type="button" onClick={() => canvasHandle.current?.zoomIn()} title="Zoom in" aria-label="Zoom in" style={{ ...BTN, padding: '6px 10px' }}>+</button>
              <button type="button" onClick={() => canvasHandle.current?.resetView()} title="Reset zoom" style={{ ...BTN, padding: '6px 10px' }}>RESET</button>
              <button type="button" onClick={toggleFullscreen} title="Toggle fullscreen" aria-pressed={isFullscreen} style={{ ...BTN, padding: '6px 10px' }}>
                {isFullscreen ? 'EXIT FULL' : 'FULLSCREEN'}
              </button>
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 11, color: pal.muted }} aria-hidden>
              {Object.entries(CATEGORY_META)
                .filter(([k]) => !['endpoint', 'power'].includes(k))
                .map(([k, m]) => (
                  <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <i style={{ width: 9, height: 9, borderRadius: '50%', background: m.color, display: 'inline-block' }} />
                    {m.label}
                  </span>
                ))}
            </div>
          </div>
          <HybridInfraCanvas
            ref={canvasHandle}
            activeMode={activeMode}
            edgeVendor={edgeVendor}
            selectedId={selectedId}
            focusIds={focusIds}
            playStep={playStep}
            viewMode={viewMode}
            onSelect={setSelectedId}
            nodes={nodes}
            flows={flows ?? undefined}
            tone={tone}
          />
        </section>

        {/* Text fallback of the diagram for screen readers / no-canvas */}
        <ul className="hi-sr-only">
          {nodes.map((c) => (
            <li key={c.id}>
              {c.name} — {c.role}
              {c.workloads.length > 0 ? `: ${c.workloads.join(', ')}` : ''}
            </li>
          ))}
        </ul>

        <aside style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div
            style={{
              background: `linear-gradient(180deg,${pal.bg2},${pal.bg})`,
              border: `1px solid ${pal.border}`, borderRadius: 14, padding: 16,
              boxShadow: '0 12px 40px rgba(0,0,0,.28)',
            }}
          >
            <h3 style={{ margin: '0 0 10px', fontSize: 11, letterSpacing: 2, color: pal.muted }}>
              SELECTED COMPONENT
            </h3>
            {selected ? (
              <div>
                <h4 style={{ margin: '0 0 6px', fontSize: 17, lineHeight: 1.25, color: pal.ink }}>
                  {selected.name}
                </h4>
                <div
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11,
                    padding: '4px 9px', borderRadius: 999, marginBottom: 10,
                    color: accent, border: `1px solid ${accent}44`, background: `${accent}18`,
                  }}
                >
                  {selected.role}
                </div>
                <p style={{ color: pal.sub, fontSize: 13, lineHeight: 1.55, margin: '0 0 12px' }}>
                  {selected.desc}
                </p>
                {selected.notes && (
                  <div
                    style={{
                      borderLeft: '3px solid #f0c75e', paddingLeft: 10,
                      margin: '0 0 12px',
                    }}
                  >
                    <div style={{ fontSize: 10, letterSpacing: 2, color: pal.gold, marginBottom: 4 }}>
                      OPERATOR NOTE
                    </div>
                    <p style={{ color: pal.sub, fontSize: 12, lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>
                      {selected.notes}
                    </p>
                  </div>
                )}
                {edgeNote && (
                  <p style={{ color: pal.amber, fontSize: 12, lineHeight: 1.55, margin: '0 0 12px' }}>
                    {edgeNote}
                  </p>
                )}
                <div style={{ display: 'grid', gap: 8, fontSize: 12 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '96px 1fr', gap: 8 }}>
                    <div style={{ color: pal.muted, textTransform: 'uppercase', letterSpacing: 1, fontSize: 10, paddingTop: 2 }}>
                      Layer
                    </div>
                    <div style={{ color: pal.sub }}>
                      {selected.layer} · {CATEGORY_META[selected.category].label}
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '96px 1fr', gap: 8 }}>
                    <div style={{ color: pal.muted, textTransform: 'uppercase', letterSpacing: 1, fontSize: 10, paddingTop: 2 }}>
                      Workloads
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {selected.workloads.map((w) => (
                        <span key={w} style={{ fontSize: 11, padding: '4px 8px', borderRadius: 6, background: pal.raised, border: '1px solid #2b4862', color: pal.sub }}>
                          {w}
                        </span>
                      ))}
                    </div>
                  </div>
                  {selected.deps.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: '96px 1fr', gap: 8 }}>
                      <div style={{ color: pal.muted, textTransform: 'uppercase', letterSpacing: 1, fontSize: 10, paddingTop: 2 }}>
                        Depends on
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {selected.deps.map((d) => (
                          <button
                            key={d}
                            type="button"
                            onClick={() => setSelectedId(d)}
                            style={{
                              fontSize: 11, padding: '4px 8px', borderRadius: 6,
                              background: pal.raised, border: '1px solid #2b4862',
                              color: pal.blue, cursor: 'pointer', fontFamily: 'var(--font-mono)',
                            }}
                          >
                            {depNameIn(nodes, d)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p style={{ color: pal.sub, fontSize: 13, lineHeight: 1.55, margin: 0 }}>
                Select any rack unit, cloud service, endpoint, or edge device to
                inspect its role, workloads, and dependencies.
              </p>
            )}
          </div>

          <div
            style={{
              background: `linear-gradient(180deg,${pal.bg2},${pal.bg})`,
              border: `1px solid ${pal.border}`, borderRadius: 14, padding: 16,
            }}
          >
            <h3 style={{ margin: '0 0 10px', fontSize: 11, letterSpacing: 2, color: pal.muted }}>
              ARCHITECTURE FLOW TIMELINE
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {TIMELINE.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => { stopPlay(); setPlayStep(i); setActiveMode('all') }}
                  aria-current={playStep === i}
                  title={`Jump to step ${s.num}: ${s.label}`}
                  style={{
                    display: 'grid', gridTemplateColumns: '28px 1fr', gap: 8,
                    alignItems: 'center', padding: '6px 8px', borderRadius: 8,
                    border: '1px solid transparent', fontSize: 12, fontFamily: 'inherit',
                    cursor: 'pointer', textAlign: 'left', width: '100%',
                    ...(playStep === i
                      ? { background: 'rgba(54,215,232,.1)', borderColor: 'rgba(54,215,232,.35)', color: pal.ink }
                      : playStep > i
                        ? { background: 'transparent', color: pal.green }
                        : { background: 'transparent', color: pal.muted }),
                  }}
                >
                  <div
                    style={{
                      width: 22, height: 22, borderRadius: 6, background: playStep === i ? pal.cyan : pal.raised,
                      display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 700,
                      color: playStep === i ? tone === 'light' ? '#ffffff' : '#042028' : pal.muted,
                    }}
                  >
                    {s.num}
                  </div>
                  <div>{s.label}</div>
                </button>
              ))}
            </div>
          </div>

          {notesOpen && (
            <div
              style={{
                background: `linear-gradient(180deg,${pal.bg2},${pal.bg})`,
                border: `1px solid ${pal.border}`, borderRadius: 14, padding: 16,
                display: 'flex', flexDirection: 'column', gap: 10,
              }}
            >
              <h3 style={{ margin: 0, fontSize: 11, letterSpacing: 2, color: pal.muted }}>
                DESIGN NOTES
              </h3>
              {DESIGN_NOTES.map((g) => (
                <div key={g.id}>
                  <h5
                    style={{
                      margin: '0 0 6px', fontSize: 11, letterSpacing: 1.5,
                      color: g.tone === 'retain' ? pal.green : g.tone === 'replace' ? pal.amber : pal.cyan,
                    }}
                  >
                    {g.title.toUpperCase()}
                  </h5>
                  <ul style={{ margin: 0, paddingLeft: 16, color: pal.sub, fontSize: 12, lineHeight: 1.6 }}>
                    {g.items.map((it) => (
                      <li key={it}>{it}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {viewMode === 'management' && (
            <div
              style={{
                background: `linear-gradient(180deg,${pal.bg2},${pal.bg})`,
                border: `1px solid ${pal.border}`, borderRadius: 14, padding: 16,
              }}
            >
              <h3 style={{ margin: '0 0 10px', fontSize: 11, letterSpacing: 2, color: pal.muted }}>
                MANAGEMENT VIEW
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {MGMT_CARDS.map((m) => (
                  <div key={m.title} style={{ background: pal.panel, border: `1px solid ${pal.border}`, borderRadius: 10, padding: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4, color: pal.ink }}>{m.title}</div>
                    <div style={{ fontSize: 11, color: pal.sub, lineHeight: 1.4 }}>{m.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div
            style={{
              background: `linear-gradient(180deg,${pal.bg2},${pal.bg})`,
              border: `1px solid ${pal.border}`, borderRadius: 14, padding: 16,
            }}
          >
            <h3 style={{ margin: '0 0 10px', fontSize: 11, letterSpacing: 2, color: pal.muted }}>
              RECOVERY STRATEGY
            </h3>
            <div style={{ fontSize: 12, color: pal.sub, lineHeight: 1.5, borderLeft: '3px solid #36d7e8', paddingLeft: 10 }}>
              3-2-1 / immutable recovery strategy — production workloads
              protected to local immutable repository with an off-site
              immutable copy. RTO/RPO targets to validate with restore testing.
            </div>
          </div>
        </aside>
      </div>

      <style>{`
        @media (max-width: 1100px) {
          .hi-layout { grid-template-columns: 1fr !important; }
        }
        .hi-tools-toggle { display: none; }
        @media (max-width: 720px) {
          .hi-tools-toggle { display: inline-flex; }
          .hi-tools-hidden { display: none; }
        }
        .hi-stage:fullscreen {
          border-radius: 0;
          background: var(--bg, #07121f);
          padding: 12px;
          overflow: auto;
        }
        @media print {
          div[role="toolbar"], .hi-tools-toggle { display: none !important; }
          .hi-layout { grid-template-columns: 1fr !important; }
        }
        .hi-canvas:focus-visible {
          outline: 2px solid var(--cyan, #36d7e8);
          outline-offset: 2px;
        }
        div[role="toolbar"] button:focus-visible,
        aside button:focus-visible {
          outline: 2px solid var(--cyan, #36d7e8);
          outline-offset: 2px;
        }
        .hi-sr-only {
          position: absolute;
          width: 1px; height: 1px;
          margin: -1px; padding: 0;
          overflow: hidden;
          clip: rect(0 0 0 0);
          white-space: nowrap;
          border: 0;
        }
      `}</style>
    </div>
  )
}
