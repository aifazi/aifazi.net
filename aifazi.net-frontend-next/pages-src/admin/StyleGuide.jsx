'use client'
import React, { useEffect, useState } from 'react'
import { PageHeader } from './shared'
import { Btn, Badge, StatCard, EmptyState, MONO } from './ui'
import { Input, Select, TextArea, Checkbox } from '../../core/ui.jsx'
import { EmptyState as CommunityEmptyState } from '../../components/community'
import { EmptyState as StatesEmptyState } from '../../core/States.jsx'
import { EmptyState as FeedbackEmptyState } from '../../core/Feedback.jsx'

/**
 * admin/StyleGuide.jsx — the living style guide.
 *
 * Purpose: stop the next panel from inventing a fourth button, a fifth empty
 * state, or its own muted grey. Everything below renders the REAL primitives
 * from the real tokens — the token swatches read `getComputedStyle(<html>)`
 * live, so this page always shows the active theme rather than a snapshot
 * that rots the moment a theme personality changes.
 *
 * Reachable at /admin/style-guide (slug -> initial view) and from the sidebar
 * under MANAGE.
 */

// ── Live token reading ───────────────────────────────────────────────────────
// `applyComponentTokens` writes --comp-* inline on <html>, and theme switches
// swap [data-theme] — a MutationObserver on both catches every change.
function useLiveTokens(names) {
  const [vals, setVals] = useState({})
  useEffect(() => {
    const read = () => {
      const cs = getComputedStyle(document.documentElement)
      const next = {}
      for (const n of names) next[n] = cs.getPropertyValue(n).trim()
      setVals(next)
    }
    read()
    const mo = new MutationObserver(read)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'data-theme'] })
    return () => mo.disconnect()
  }, [names])
  return vals
}

const SURFACE_TOKENS = ['--bg', '--bg2', '--bg3', '--bg4', '--border']
const TEXT_TOKENS    = ['--text', '--text2', '--muted']
const ACCENT_TOKENS  = ['--green', '--cyan', '--red', '--orange', '--purple', '--yellow']
const CONTRACT_TOKENS = [
  '--comp-btn-bg', '--comp-btn-text', '--comp-btn-border', '--comp-btn-radius', '--comp-btn-shadow', '--comp-btn-clip',
  '--comp-card-bg', '--comp-card-border', '--comp-card-radius',
  '--comp-input-bg', '--comp-input-border', '--comp-input-focus-border', '--comp-input-radius',
  '--comp-badge-bg', '--comp-badge-text', '--comp-badge-border', '--comp-badge-radius',
]
const ALL_TOKENS = [...SURFACE_TOKENS, ...TEXT_TOKENS, ...ACCENT_TOKENS, ...CONTRACT_TOKENS]

// ── Layout helpers ───────────────────────────────────────────────────────────
function Section({ title, note, children }) {
  return (
    <section style={{ marginBottom: 44 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
        <h2 style={{ fontFamily: MONO, fontSize: 12, letterSpacing: 3, color: 'var(--green)', margin: 0, textTransform: 'uppercase' }}>
          {title}
        </h2>
        <div style={{ flex: 1, height: 1, background: 'var(--border)', minWidth: 24 }} />
      </div>
      {note && (
        <p style={{ fontFamily: MONO, fontSize: 11, color: 'var(--muted)', lineHeight: 1.8, margin: '0 0 18px', maxWidth: 760 }}>
          {note}
        </p>
      )}
      {children}
    </section>
  )
}

function Panel({ children, style }) {
  return (
    <div style={{
      background: 'var(--comp-card-bg, var(--bg2))',
      border: 'var(--comp-card-border, 1px solid var(--border))',
      borderRadius: 'var(--comp-card-radius, 12px)',
      padding: 20,
      ...style,
    }}>
      {children}
    </div>
  )
}

function Label({ children }) {
  return <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 2, color: 'var(--muted)', marginBottom: 10 }}>{children}</div>
}

// ── Token swatches ───────────────────────────────────────────────────────────
function Swatches({ names, tokens }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(168px, 1fr))', gap: 12 }}>
      {names.map(n => (
        <div key={n} style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ height: 52, background: `var(${n})`, borderBottom: '1px solid var(--border)' }} />
          <div style={{ padding: '8px 10px' }}>
            <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text)' }}>{n}</div>
            <div style={{
              fontFamily: MONO, fontSize: 10, color: 'var(--muted)', marginTop: 4,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }} title={tokens[n] || ''}>
              {tokens[n] || '— not set —'}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Panel ────────────────────────────────────────────────────────────────────
export default function StyleGuide() {
  const tokens = useLiveTokens(ALL_TOKENS)
  const [demoText, setDemoText] = useState('')
  const [demoSelect, setDemoSelect] = useState('one')
  const [demoCheck, setDemoCheck] = useState(true)

  return (
    <div>
      <PageHeader
        eyebrow="DESIGN SYSTEM"
        title="Style Guide"
        subtitle="The primitives every panel is expected to reuse. Tokens are read live from the active theme, so this page shows what the site actually looks like right now — not a screenshot that drifts."
      />

      <Section
        title="Tokens"
        note="Surfaces, text and accents come from the theme definition; the --comp-* contract comes from componentTokens.js and is written inline on <html> by applyComponentTokens. Use var(--comp-*) in components and the control follows the visitor's chosen theme personality."
      >
        <Label>SURFACES</Label>
        <Swatches names={SURFACE_TOKENS} tokens={tokens} />
        <div style={{ height: 20 }} />
        <Label>TEXT</Label>
        <Swatches names={TEXT_TOKENS} tokens={tokens} />
        <div style={{ height: 20 }} />
        <Label>ACCENTS — redefined per theme in app/theme-library.css</Label>
        <Swatches names={ACCENT_TOKENS} tokens={tokens} />
        <div style={{ height: 20 }} />
        <Label>COMPONENT CONTRACT</Label>
        <Swatches names={CONTRACT_TOKENS} tokens={tokens} />
      </Section>

      <Section
        title="Typography"
        note="Two families. --font-display for headings and figures, --font-mono for labels, tags, values and anything that should read as instrumentation."
      >
        <Panel>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 40, fontWeight: 700, letterSpacing: '-1px', lineHeight: 1.1 }}>
            Display 40 — Build things that hold up
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 600, marginTop: 14 }}>
            Display 22 — Section heading
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, color: 'var(--text2)', marginTop: 14, maxWidth: 620, lineHeight: 1.7 }}>
            Body 15 — Prose sits in --text2 so headings keep their weight against it. Line height 1.7 for long-form reading.
          </div>
          <div style={{ fontFamily: MONO, fontSize: 13, color: 'var(--muted)', marginTop: 18, lineHeight: 1.8 }}>
            Mono 13 — labels, values, timestamps and table cells<br />
            <span style={{ fontSize: 11, letterSpacing: 3, color: 'var(--green)' }}>MONO 11 · LETTER-SPACING 3 · EYEBROW</span>
          </div>
        </Panel>
      </Section>

      <Section
        title="Buttons"
        note="One primary button language. .btn-primary and the login submit read the same --comp-btn-* contract; .neon-btn* are the neon-glow family. The admin kit Btn reads the same radius and shadow tokens."
      >
        <Panel>
          <Label>SITE — .btn-primary / .btn-outline</Label>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', marginBottom: 22 }}>
            <button className="btn-primary">Primary</button>
            <button className="btn-outline">Outline</button>
          </div>

          <Label>NEON — .neon-btn*</Label>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', marginBottom: 22 }}>
            <button className="neon-btn neon-btn-primary">Neon primary</button>
            <button className="neon-btn neon-btn-cyan">Neon cyan</button>
            <button className="neon-btn neon-btn-ghost">Neon ghost</button>
            <button className="neon-btn neon-btn-outline-green">Outline green</button>
            <button className="neon-btn neon-btn-danger">Danger</button>
            <button className="neon-btn neon-btn-primary" disabled>Disabled</button>
          </div>

          <Label>ADMIN KIT — Btn (framework-aware: solid / outline / ghost / danger / small / full)</Label>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <Btn>Solid</Btn>
            <Btn variant="outline">Outline</Btn>
            <Btn ghost>Ghost</Btn>
            <Btn danger>Danger</Btn>
            <Btn color="var(--cyan)">Cyan</Btn>
            <Btn small>Small</Btn>
            <Btn disabled>Disabled</Btn>
          </div>
        </Panel>
      </Section>

      <Section
        title="Inputs"
        note="core/forms.jsx controls carry data-core-control so the theme can restyle every field at once. --comp-input-* is the contract: background, border, focus border and radius."
      >
        <Panel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 18 }}>
            <div>
              <Label>TEXT</Label>
              <Input value={demoText} onChange={setDemoText} placeholder="you@aifazi.net" />
            </div>
            <div>
              <Label>SELECT</Label>
              <Select value={demoSelect} onChange={setDemoSelect} options={[
                { value: 'one', label: 'Option one' },
                { value: 'two', label: 'Option two' },
              ]} />
            </div>
            <div>
              <Label>DISABLED</Label>
              <Input value="Read only value" disabled />
            </div>
            <div>
              <Label>CHECKBOX</Label>
              <Checkbox checked={demoCheck} onChange={setDemoCheck} label="Enable something" />
            </div>
          </div>
          <div style={{ marginTop: 18 }}>
            <Label>TEXTAREA</Label>
            <TextArea value={demoText} onChange={setDemoText} rows={3} placeholder="Long-form input…" />
          </div>
        </Panel>
      </Section>

      <Section
        title="Badges"
        note="Admin kit Badge takes a tone; the site uses .badge-style chips. Both read --comp-badge-radius, so a theme can square every pill at once."
      >
        <Panel>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {['green', 'cyan', 'red', 'orange', 'purple', 'yellow', 'muted'].map(tone => (
              <Badge key={tone} tone={tone}>{tone.toUpperCase()}</Badge>
            ))}
          </div>
        </Panel>
      </Section>

      <Section
        title="Cards"
        note="StatCard is the admin summary unit. It reads --comp-card-* so the card follows the theme personality (glass / brutal / neon / terminal …)."
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
          <StatCard label="TOTAL POSTS" value="42" color="var(--cyan)" sub="18 live · 24 drafts" />
          <StatCard label="VIEWS" value="12,480" color="var(--green)" sub="all time" />
          <StatCard label="MESSAGES" value="7" color="var(--orange)" sub="in inbox" />
          <StatCard label="STAFF" value="3" color="var(--yellow)" sub="members" />
        </div>
      </Section>

      <Section
        title="Empty states"
        note="Four implementations exist and each has an owner. Pick by surface, never by which one is closest to hand: public community/store/blog use the community EmptyState (add compact= for sidebars and modal lists); admin list panels use the admin kit EmptyState; core/States.jsx is the D-series admin language and core/Feedback.jsx the generic fallback. All four take an icon, a title and a hint — an empty panel should say what will appear there, not just show a zero."
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 18 }}>
          <div>
            <Label>community.jsx — public surfaces</Label>
            <CommunityEmptyState icon="📭" title="No posts found" text="Try a different filter." action="Clear filters" />
          </div>
          <div>
            <Label>community.jsx compact — inline spots</Label>
            <CommunityEmptyState compact icon="🧵" title="No threads yet" text="Threads you start will appear here." />
          </div>
          <div>
            <Label>admin/ui.jsx — admin panels</Label>
            <EmptyState icon="📦" title="No products yet" hint="Create your first one to start selling." />
          </div>
          <div>
            <Label>core/States.jsx — admin D-series</Label>
            <StatesEmptyState icon="📊" title="No data available" hint="Stats will appear once the API reports them." />
          </div>
          <div>
            <Label>core/Feedback.jsx — generic fallback</Label>
            <FeedbackEmptyState icon="∅" title="Nothing here" hint="Used where neither a community nor an admin language fits." />
          </div>
        </div>
      </Section>
    </div>
  )
}
