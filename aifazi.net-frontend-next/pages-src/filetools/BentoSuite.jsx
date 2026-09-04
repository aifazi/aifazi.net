'use client'
import { useState } from 'react'
import { PDF_URL } from '@/lib/config'

// ── BentoPDF suite, embedded in File Tools design ───────────────────────────
// BentoPDF is a client-side PDF toolkit (own UI, AGPL-3.0 — used unmodified).
// We host it at PDF_URL and frame it here so files never leave the browser.
// Deep links jump straight to individual tools, skipping the marketing home.
const SUITE_TOOLS = [
  { id:'all',      label:'🧰 All Tools',  page:'tools.html' },
  { id:'merge',    label:'🔗 Merge / Split', page:'pdf-merge-split.html' },
  { id:'compress', label:'🗜️ Compress',  page:'hyper-compress.html' },
  { id:'convert',  label:'🔄 Convert',    page:'pdf-converter.html' },
  { id:'edit',     label:'✏️ Edit',       page:'pdf-editor.html' },
  { id:'security', label:'🔒 Secure',     page:'pdf-security.html' },
]

export default function BentoSuiteB() {
  const [page, setPage] = useState('tools.html')
  const [loading, setLoading] = useState(true)
  const src = `${PDF_URL.replace(/\/+$/, '')}/${page}`

  return (
    <div>
      {/* ── Tool quick-links ── */}
      <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:14 }}>
        {SUITE_TOOLS.map(t => {
          const active = page === t.page
          return (
            <button key={t.id}
              onClick={() => { setPage(t.page); setLoading(true) }}
              style={{
                fontFamily:'var(--font-mono)', fontSize:9, letterSpacing:1.5, padding:'8px 12px',
                background: active ? 'color-mix(in srgb, var(--cyan) 14%, transparent)' : 'var(--bg)',
                color: active ? 'var(--cyan)' : 'var(--muted)',
                border:`1px solid ${active ? 'color-mix(in srgb, var(--cyan) 55%, transparent)' : 'var(--border)'}`,
                cursor:'pointer', whiteSpace:'nowrap',
              }}>
              {t.label.toUpperCase()}
            </button>
          )
        })}
        <a href={src} target="_blank" rel="noreferrer"
          style={{ marginLeft:'auto', fontFamily:'var(--font-mono)', fontSize:9, letterSpacing:1.5,
            padding:'8px 12px', color:'var(--green)', border:'1px solid var(--border)',
            textDecoration:'none', whiteSpace:'nowrap' }}>
          ↗ FULL SCREEN
        </a>
      </div>

      {/* ── Embedded suite ── */}
      <div style={{ position:'relative', border:'1px solid var(--border)', background:'var(--bg)' }}>
        <div style={{ position:'absolute', top:0, left:0, right:0, height:2,
          background:'linear-gradient(90deg,var(--cyan),transparent)', zIndex:2 }} />
        {loading && (
          <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center',
            justifyContent:'center', flexDirection:'column', gap:12, background:'var(--bg)',
            fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:3, color:'var(--muted)', zIndex:1 }}>
            <div style={{ fontSize:28 }}>📕</div>
            LOADING PDF SUITE…
          </div>
        )}
        <iframe
          key={page}
          src={src}
          title="BentoPDF suite"
          onLoad={() => setLoading(false)}
          style={{ width:'100%', height:'78vh', border:'none', display:'block', background:'var(--bg)' }}
          allow="clipboard-read; clipboard-write"
        />
      </div>

      <div style={{ marginTop:12, fontFamily:'var(--font-mono)', fontSize:9, color:'var(--muted)',
        lineHeight:1.8, letterSpacing:0.3 }}>
        🔒 100% PRIVATE — BentoPDF runs entirely in your browser (WASM). Files never touch our
        servers. Suite self-hosted at <span style={{ color:'var(--cyan)' }}>{PDF_URL.replace('https://','')}</span> ·{' '}
        <a href="https://github.com/alam00000/bentopdf" target="_blank" rel="noreferrer"
          style={{ color:'var(--muted)' }}>AGPL-3.0, used unmodified</a>.
      </div>
    </div>
  )
}
