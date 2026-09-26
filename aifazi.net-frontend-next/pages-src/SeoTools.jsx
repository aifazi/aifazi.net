'use client'
import { useState } from 'react'
import api from '@/lib/api'
import { Select } from '../core/ui.jsx'
import { SITE_URL } from '@/lib/config'
import { escapeHtml, parseMeta, MetaAnalyzer, KeywordDensity, ReadabilityScore, BulkUrlChecker, SitemapGenerator, OGPreview, TitleDescGenerator, RobotsTxtGenerator } from './seoToolsParts'

// ─── Shared proxy fetch (uses our own backend — reliable, no CORS issues) ─────
async function fetchViaProxy(url) {
  const res = await api.get('/seo-proxy', { params: { url }, timeout: 15000 })
  const data = res.data
  if (!data.contents) throw new Error('Could not fetch that URL. Try pasting HTML instead.')
  return data.contents
}

// ─── Parse meta tags using DOMParser (robust, handles all attribute orders) ───
// CodeQL js/xss-through-dom: `rawHtml` is DOM text (pasted/fetched) parsed as
// HTML. DOMParser itself never executes scripts, and extracted values below
// are read via textContent/content (text, never HTML) and rendered by React
// as text nodes — never via innerHTML/dangerouslySetInnerHTML.
const S = {
  input:        { width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--font-display)', fontSize: 14, padding: '10px 14px', outline: 'none', boxSizing: 'border-box' },
  btn:          { fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, padding: '10px 20px', background: 'var(--green)', color: '#000', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: 700 },
  tab:          { fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, padding: '8px 14px', background: 'var(--bg2)', color: 'var(--muted)', border: '1px solid var(--border)', cursor: 'pointer' },
  tabActive:    { background: 'color-mix(in srgb, var(--green) 10%, transparent)', color: 'var(--green)', borderColor: 'color-mix(in srgb, var(--green) 40%, transparent)' },
  error:        { color: '#ff4757', fontFamily: 'var(--font-mono)', fontSize: 11, marginTop: 8 },
  sectionLabel: { fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 3, color: 'var(--muted)', marginBottom: 12 },
  fieldLabel:   { fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, color: 'var(--muted)', marginBottom: 6 },
}

// ─── TABS ─────────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'meta',        label: 'Meta Analyzer',   icon: '🔍', component: MetaAnalyzer },
  { id: 'keyword',     label: 'Keyword Density', icon: '📊', component: KeywordDensity },
  { id: 'readability', label: 'Readability',     icon: '📖', component: ReadabilityScore },
  { id: 'bulk',        label: 'Bulk URL Check',  icon: '🗂️', component: BulkUrlChecker },
  { id: 'sitemap',     label: 'Sitemap Builder', icon: '🗺️', component: SitemapGenerator },
  { id: 'og',          label: 'OG Preview',      icon: '👁️', component: OGPreview },
  { id: 'titles',      label: 'Title Generator', icon: '✍️', component: TitleDescGenerator },
  { id: 'robots',      label: 'Robots.txt',      icon: '🤖', component: RobotsTxtGenerator },
]

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function SeoTools() {
  const [tab, setTab] = useState('meta')
  const Active = TABS.find(t => t.id === tab)?.component || MetaAnalyzer

  return (
    <div style={{ minHeight: '100vh', paddingTop: 80 }}>
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '60px 24px' }}>
        <div style={{ marginBottom: 48 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--cyan)', letterSpacing: 4, marginBottom: 12 }}>WEBMASTER TOOLS</div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 48, fontWeight: 700, marginBottom: 12 }}>SEO Tools</h1>
          <p style={{ color: 'var(--muted)', fontSize: 15, lineHeight: 1.7 }}>
            Free tools to analyze, optimize, and improve your website&apos;s search engine performance. No sign-up required.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 2, marginBottom: 32, overflowX: 'auto', paddingBottom: 4, flexWrap: 'wrap' }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ ...S.tab, ...(tab === t.id ? S.tabActive : {}), display: 'flex', alignItems: 'center', gap: 6 }}>
              {t.icon} {t.label.toUpperCase()}
            </button>
          ))}
        </div>
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', padding: 32 }}>
          <Active />
        </div>
      </div>
    </div>
  )
}
