'use client'
import { useState } from 'react'
import api from '@/lib/api'
import { Select } from '../core/ui.jsx'

// ─── Shared proxy fetch (uses our own backend — reliable, no CORS issues) ─────
async function fetchViaProxy(url) {
  const res = await api.get('/seo-proxy', { params: { url }, timeout: 15000 })
  const data = res.data
  if (!data.contents) throw new Error('Could not fetch that URL. Try pasting HTML instead.')
  return data.contents
}

// ─── Parse meta tags using DOMParser (robust, handles all attribute orders) ───
function parseMeta(rawHtml) {
  const doc = new DOMParser().parseFromString(rawHtml, 'text/html')
  const getMeta = (attr, val) => doc.querySelector(`meta[${attr}="${val}"]`)?.content ?? null
  const title     = doc.querySelector('title')?.textContent?.trim() ?? null
  const canonical = doc.querySelector('link[rel="canonical"]')?.href ?? null
  return {
    title,
    titleLen:     title?.length || 0,
    description:  getMeta('name', 'description'),
    keywords:     getMeta('name', 'keywords'),
    ogTitle:      getMeta('property', 'og:title'),
    ogDesc:       getMeta('property', 'og:description'),
    ogImage:      getMeta('property', 'og:image'),
    ogUrl:        getMeta('property', 'og:url'),
    twitterCard:  getMeta('name', 'twitter:card'),
    twitterTitle: getMeta('name', 'twitter:title'),
    canonical,
    robots:       getMeta('name', 'robots'),
    viewport:     getMeta('name', 'viewport'),
  }
}

// ─── 1. Meta Tag Analyzer ─────────────────────────────────────────────────────
function MetaAnalyzer() {
  const [url, setUrl]       = useState('')
  const [html, setHtml]     = useState('')
  const [result, setResult] = useState(null)
  const [mode, setMode]     = useState('url')
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState('')

  const analyzeHtml = (rawHtml) => {
    const meta   = parseMeta(rawHtml)
    const issues = [], good = []
    if (!meta.title) issues.push({ msg: 'Missing <title> tag', sev: 'high' })
    else if (meta.titleLen < 30)  issues.push({ msg: `Title too short (${meta.titleLen} chars, aim 50–60)`, sev: 'medium' })
    else if (meta.titleLen > 60)  issues.push({ msg: `Title too long (${meta.titleLen} chars, keep under 60)`, sev: 'medium' })
    else good.push('Title tag length is optimal')

    if (!meta.description) issues.push({ msg: 'Missing meta description', sev: 'high' })
    else if (meta.description.length < 120) issues.push({ msg: `Description too short (${meta.description.length} chars, aim 150–160)`, sev: 'medium' })
    else if (meta.description.length > 160) issues.push({ msg: `Description too long (${meta.description.length} chars, keep under 160)`, sev: 'medium' })
    else good.push('Meta description length is optimal')

    if (!meta.ogTitle || !meta.ogDesc || !meta.ogImage) issues.push({ msg: 'Incomplete Open Graph tags (og:title, og:description, og:image)', sev: 'medium' })
    else good.push('Open Graph tags are complete')

    if (!meta.twitterCard) issues.push({ msg: 'Missing Twitter Card meta tags', sev: 'low' })
    else good.push('Twitter Card meta present')

    if (!meta.canonical) issues.push({ msg: 'No canonical URL tag found', sev: 'medium' })
    else good.push('Canonical URL is set')

    if (!meta.viewport) issues.push({ msg: 'Missing viewport meta tag (mobile SEO)', sev: 'high' })
    else good.push('Viewport meta tag present')

    const score = Math.max(0,
      100
      - issues.filter(i => i.sev === 'high').length   * 25
      - issues.filter(i => i.sev === 'medium').length * 10
      - issues.filter(i => i.sev === 'low').length    * 5
    )
    setResult({ meta, issues, good, score })
  }

  const analyze = async () => {
    setError(''); setResult(null); setLoading(true)
    try {
      if (mode === 'paste') {
        if (!html.trim()) throw new Error('Paste your HTML first')
        analyzeHtml(html)
      } else {
        if (!url.startsWith('http')) throw new Error('URL must start with http:// or https://')
        analyzeHtml(await fetchViaProxy(url))
      }
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const scoreColor = result?.score >= 80 ? '#00ff88' : result?.score >= 50 ? '#ff6b35' : '#ff4757'

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {['url', 'paste'].map(m => (
          <button key={m} onClick={() => setMode(m)} style={{ ...S.tab, ...(mode === m ? S.tabActive : {}) }}>
            {m === 'url' ? '🌐 FROM URL' : '📋 PASTE HTML'}
          </button>
        ))}
      </div>

      {mode === 'url' && (
        <div style={{ background: 'rgba(255,107,53,0.08)', border: '1px solid rgba(255,107,53,0.3)', padding: '8px 14px', marginBottom: 12, fontFamily: 'var(--font-mono)', fontSize: 10, color: '#ff6b35' }}>
          ⚠ URL fetching uses a third-party CORS proxy (allorigins.win). If it fails, use Paste HTML mode.
        </div>
      )}

      {mode === 'url' ? (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && analyze()}
            placeholder="https://example.com" style={S.input} />
          <button onClick={analyze} disabled={loading} style={{ ...S.btn, opacity: loading ? 0.6 : 1 }}>
            {loading ? '⟳' : 'ANALYZE'}
          </button>
        </div>
      ) : (
        <>
          <textarea value={html} onChange={e => setHtml(e.target.value)} rows={6}
            placeholder="Paste your full HTML here..." style={{ ...S.input, resize: 'vertical', marginBottom: 8 }} />
          <button onClick={analyze} style={S.btn}>ANALYZE HTML</button>
        </>
      )}

      {error && <div style={S.error}>⚠ {error}</div>}

      {result && (
        <div style={{ marginTop: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 24, background: 'var(--bg3)', border: `1px solid ${scoreColor}33`, padding: '20px 24px' }}>
            <div style={{ fontSize: 48, fontWeight: 900, color: scoreColor, fontFamily: 'var(--font-mono)', lineHeight: 1 }}>{result.score}</div>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 3, color: 'var(--muted)', marginBottom: 4 }}>SEO SCORE</div>
              <div style={{ fontSize: 14, color: scoreColor }}>
                {result.score >= 80 ? '✅ Good — minor improvements possible' : result.score >= 50 ? '⚠️ Fair — several issues to fix' : '❌ Poor — critical issues found'}
              </div>
            </div>
          </div>

          {result.issues.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={S.sectionLabel}>ISSUES FOUND</div>
              {result.issues.map((issue, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)', alignItems: 'flex-start' }}>
                  <span>{issue.sev === 'high' ? '🔴' : issue.sev === 'medium' ? '🟠' : '🟡'}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text)' }}>{issue.msg}</span>
                </div>
              ))}
            </div>
          )}

          {result.good.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={S.sectionLabel}>PASSING</div>
              {result.good.map((g, i) => (
                <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', fontFamily: 'var(--font-mono)', fontSize: 12, color: '#00ff88' }}>✓ {g}</div>
              ))}
            </div>
          )}

          <details style={{ marginTop: 16 }}>
            <summary style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2, color: 'var(--muted)', cursor: 'pointer', marginBottom: 12 }}>VIEW RAW META VALUES</summary>
            <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', padding: '0 20px' }}>
              {Object.entries(result.meta).map(([k, v]) => v ? (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '8px 0', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 2, color: 'var(--muted)', flexShrink: 0 }}>{k.toUpperCase()}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--cyan)', wordBreak: 'break-all', textAlign: 'right', maxWidth: '60%' }}>{v}</span>
                </div>
              ) : null)}
            </div>
          </details>
        </div>
      )}
    </div>
  )
}

// ─── 2. Keyword Density ───────────────────────────────────────────────────────
function KeywordDensity() {
  const [text, setText]     = useState('')
  const [target, setTarget] = useState('')
  const [result, setResult] = useState(null)

  const STOP = new Set(['the','and','for','are','but','not','you','all','can','her','was','one','our','out','day','get','has','him','his','how','man','new','now','old','see','two','way','who','boy','did','its','let','put','say','she','too','use','had','may','then','from','into','more','some','than','that','them','they','this','will','with','have','been','come','does','just','over','also','back','well','were','what','when','where','which','while','your','about','after','could','other','their','there','these','those','would','should','through'])

  const analyze = () => {
    if (!text.trim()) return
    const words = text.toLowerCase().match(/\b[a-z]{3,}\b/g) || []
    const freq  = {}
    words.forEach(w => { freq[w] = (freq[w] || 0) + 1 })
    const top = Object.entries(freq).filter(([w]) => !STOP.has(w))
      .sort(([,a],[,b]) => b - a).slice(0, 20)
      .map(([word, count]) => ({ word, count, density: ((count / words.length) * 100).toFixed(2) }))
    const targetResult = target.trim()
      ? (() => { const t = target.trim().toLowerCase(); const count = words.filter(w => w === t).length; return { count, density: ((count / words.length) * 100).toFixed(2) } })()
      : null
    setResult({ top, total: words.length, targetResult })
  }

  const densityColor = (d) => { const n = parseFloat(d); return n > 3 ? '#ff4757' : n >= 1 ? '#00ff88' : '#ff6b35' }

  return (
    <div>
      <textarea value={text} onChange={e => setText(e.target.value)} rows={8}
        placeholder="Paste your page content or article text here..."
        style={{ ...S.input, resize: 'vertical', marginBottom: 12 }} />
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input value={target} onChange={e => setTarget(e.target.value)} placeholder="Target keyword (optional)" style={{ ...S.input, flex: 1 }} />
        <button onClick={analyze} style={S.btn}>ANALYZE</button>
      </div>

      {result && (
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2, color: 'var(--muted)', marginBottom: 12 }}>
            TOTAL WORDS: <span style={{ color: 'var(--cyan)' }}>{result.total}</span>
          </div>

          {result.targetResult && (
            <div style={{ background: 'var(--bg3)', border: '1px solid color-mix(in srgb, var(--green) 30%, transparent)', padding: '16px 20px', marginBottom: 20 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', letterSpacing: 2, marginBottom: 8 }}>TARGET: "{target.trim().toUpperCase()}"</div>
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                <div><span style={{ color: 'var(--muted)', fontSize: 10, fontFamily: 'var(--font-mono)' }}>COUNT: </span><span style={{ color: 'var(--green)', fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{result.targetResult.count}</span></div>
                <div><span style={{ color: 'var(--muted)', fontSize: 10, fontFamily: 'var(--font-mono)' }}>DENSITY: </span><span style={{ color: densityColor(result.targetResult.density), fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{result.targetResult.density}%</span></div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', alignSelf: 'flex-end' }}>
                  {parseFloat(result.targetResult.density) > 3 ? '⚠️ Keyword stuffing risk' : parseFloat(result.targetResult.density) >= 1 ? '✅ Ideal range (1–2.5%)' : '↗ Consider using more'}
                </div>
              </div>
            </div>
          )}

          <div style={S.sectionLabel}>TOP KEYWORDS</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--green)' }}>
                {['KEYWORD','COUNT','DENSITY','STATUS'].map(h => <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--green)', fontSize: 9, letterSpacing: 2 }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {result.top.map(({ word, count, density }) => (
                <tr key={word} style={{ borderBottom: '1px solid var(--border)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'color-mix(in srgb, var(--green) 3%, transparent)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <td style={{ padding: '8px 12px', color: 'var(--text)' }}>{word}</td>
                  <td style={{ padding: '8px 12px', color: 'var(--cyan)' }}>{count}</td>
                  <td style={{ padding: '8px 12px', color: densityColor(density), fontWeight: 700 }}>{density}%</td>
                  <td style={{ padding: '8px 12px', color: 'var(--muted)', fontSize: 10 }}>{parseFloat(density) > 3 ? '⚠️ High' : parseFloat(density) >= 1 ? '✅ Good' : 'Low'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── 3. Readability Score ─────────────────────────────────────────────────────
function ReadabilityScore() {
  const [text, setText]     = useState('')
  const [result, setResult] = useState(null)

  const countSyllables = (word) => {
    word = word.toLowerCase()
    if (word.length <= 3) return 1
    word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '')
    return (word.match(/[aeiouy]{1,2}/g) || []).length
  }

  const analyze = () => {
    if (!text.trim()) return
    const sentences    = text.split(/[.!?]+/).filter(s => s.trim().length > 0)
    const words        = text.match(/\b\w+\b/g) || []
    const syllables    = words.reduce((acc, w) => acc + countSyllables(w), 0)
    const avgSentLen   = words.length / Math.max(sentences.length, 1)
    const avgSylPerWord = syllables / Math.max(words.length, 1)
    const flesch       = Math.max(0, Math.min(100, Math.round(206.835 - 1.015 * avgSentLen - 84.6 * avgSylPerWord)))
    const grade        = Math.max(1, Math.round(0.39 * avgSentLen + 11.8 * avgSylPerWord - 15.59))
    const getLevel     = (s) => {
      if (s >= 90) return { label: 'Very Easy',       color: '#00ff88', audience: '5th grade' }
      if (s >= 80) return { label: 'Easy',            color: '#00ff88', audience: '6th grade' }
      if (s >= 70) return { label: 'Fairly Easy',     color: '#00d4ff', audience: '7th grade' }
      if (s >= 60) return { label: 'Standard',        color: '#00d4ff', audience: '8th–9th grade' }
      if (s >= 50) return { label: 'Fairly Difficult',color: '#ff6b35', audience: '10th–12th grade' }
      if (s >= 30) return { label: 'Difficult',       color: '#ff4757', audience: 'College' }
      return        { label: 'Very Confusing',        color: '#ff4757', audience: 'College graduate' }
    }
    setResult({ flesch, grade, avgSentLen: Math.round(avgSentLen), words: words.length, sentences: sentences.length, level: getLevel(flesch) })
  }

  return (
    <div>
      <textarea value={text} onChange={e => setText(e.target.value)} rows={8}
        placeholder="Paste your article or page content to analyze readability..."
        style={{ ...S.input, resize: 'vertical', marginBottom: 12 }} />
      <button onClick={analyze} style={S.btn}>ANALYZE READABILITY</button>

      {result && (
        <div style={{ marginTop: 24 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 24 }}>
            {[
              { label: 'FLESCH SCORE', value: result.flesch, suffix: '/100', color: result.level.color },
              { label: 'GRADE LEVEL',  value: `G${result.grade}`, color: 'var(--cyan)' },
              { label: 'AVG SENTENCE', value: `${result.avgSentLen} words`, color: 'var(--orange)' },
              { label: 'TOTAL WORDS',  value: result.words, color: 'var(--muted)' },
            ].map(({ label, value, color, suffix }) => (
              <div key={label} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', padding: 16 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 2, color: 'var(--muted)', marginBottom: 8 }}>{label}</div>
                <div style={{ fontSize: 26, fontWeight: 900, color, fontFamily: 'var(--font-mono)' }}>{value}<span style={{ fontSize: 11, color: 'var(--muted)' }}>{suffix}</span></div>
              </div>
            ))}
          </div>
          <div style={{ background: 'var(--bg3)', border: `1px solid ${result.level.color}44`, padding: '20px 24px' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: result.level.color, marginBottom: 4 }}>{result.level.label.toUpperCase()} TO READ</div>
            <div style={{ color: 'var(--muted)', fontSize: 13 }}>
              Readable at a <strong style={{ color: 'var(--text)' }}>{result.level.audience}</strong> level.
              {result.avgSentLen > 20 && ' Consider shortening your sentences.'}
              {result.flesch < 60 && ' Try using simpler words and shorter paragraphs.'}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── 4. Bulk URL SEO Checker ──────────────────────────────────────────────────
function BulkUrlChecker() {
  const [urls, setUrls]       = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [warning, setWarning] = useState('')

  const getScore = (m) => {
    let s = 100
    if (!m.title) s -= 30; else if (m.title.length < 30 || m.title.length > 60) s -= 10
    if (!m.description) s -= 25
    if (!m.ogImage) s -= 15
    if (!m.canonical) s -= 10
    if (!m.viewport) s -= 10
    return Math.max(0, s)
  }

  const check = async () => {
    setLoading(true); setResults([]); setWarning('')
    const raw  = urls.split('\n').map(u => u.trim()).filter(u => u.startsWith('http'))
    const list = raw.slice(0, 20)
    if (raw.length > 20) setWarning(`Only the first 20 URLs will be checked (${raw.length} entered).`)
    const out  = []
    for (const url of list) {
      try {
        const html = await fetchViaProxy(url)
        const doc  = new DOMParser().parseFromString(html, 'text/html')
        const getMeta = (attr, val) => doc.querySelector(`meta[${attr}="${val}"]`)?.content ?? null
        const meta = {
          title:       doc.querySelector('title')?.textContent?.trim() ?? null,
          description: getMeta('name', 'description'),
          ogImage:     getMeta('property', 'og:image'),
          canonical:   doc.querySelector('link[rel="canonical"]')?.href ?? null,
          viewport:    getMeta('name', 'viewport'),
        }
        out.push({ url, title: meta.title, desc: meta.description, score: getScore(meta), hasOg: !!meta.ogImage, hasCanon: !!meta.canonical })
      } catch {
        out.push({ url, title: null, desc: null, score: 0, hasOg: false, hasCanon: false })
      }
      setResults([...out])
      // Small delay to avoid rate-limiting the proxy
      await new Promise(r => setTimeout(r, 400))
    }
    setLoading(false)
  }

  return (
    <div>
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', marginBottom: 12 }}>
        Enter up to 20 URLs, one per line. Uses a CORS proxy — if a URL fails, check it manually.
      </p>
      <textarea value={urls} onChange={e => setUrls(e.target.value)} rows={6}
        placeholder={'https://aifazi.net\nhttps://aifazi.net/blog\nhttps://aifazi.net/forum'}
        style={{ ...S.input, resize: 'vertical', marginBottom: 12 }} />

      {warning && (
        <div style={{ background: 'rgba(255,107,53,0.08)', border: '1px solid rgba(255,107,53,0.3)', padding: '8px 14px', marginBottom: 10, fontFamily: 'var(--font-mono)', fontSize: 10, color: '#ff6b35' }}>
          ⚠ {warning}
        </div>
      )}

      <button onClick={check} disabled={loading} style={{ ...S.btn, marginBottom: 20 }}>
        {loading ? `⟳ CHECKING... (${results.length} done)` : 'CHECK ALL URLS'}
      </button>

      {results.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--green)' }}>
                {['URL','SCORE','TITLE','DESCRIPTION','OG IMAGE','CANONICAL'].map(h => (
                  <th key={h} style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--green)', fontSize: 9, letterSpacing: 2 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'color-mix(in srgb, var(--green) 3%, transparent)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <td style={{ padding: '8px 10px', color: 'var(--cyan)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.url}>{r.url.replace(/^https?:\/\//, '')}</td>
                  <td style={{ padding: '8px 10px', color: r.score >= 70 ? '#00ff88' : r.score >= 40 ? '#ff6b35' : '#ff4757', fontWeight: 700 }}>{r.score}</td>
                  <td style={{ padding: '8px 10px', color: r.title ? 'var(--text)' : '#ff4757', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title || '❌ Missing'}</td>
                  <td style={{ padding: '8px 10px', color: r.desc ? 'var(--muted)' : '#ff4757', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.desc || '❌ Missing'}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'center' }}>{r.hasOg ? '✅' : '❌'}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'center' }}>{r.hasCanon ? '✅' : '❌'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── 5. XML Sitemap Generator ─────────────────────────────────────────────────
function SitemapGenerator() {
  const [urls, setUrls]         = useState('')
  const [freq, setFreq]         = useState('weekly')
  const [priority, setPriority] = useState('0.8')
  const [output, setOutput]     = useState('')
  const [copied, setCopied]     = useState(false)

  const generate = () => {
    const list = urls.split('\n').map(u => u.trim()).filter(u => u.startsWith('http'))
    if (!list.length) return
    const today = new Date().toISOString().split('T')[0]
    setOutput(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`
      + list.map(url =>
        `  <url>\n    <loc>${url}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>${freq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`
      ).join('\n')
      + `\n</urlset>`
    )
  }

  const copy = () => { navigator.clipboard.writeText(output); setCopied(true); setTimeout(() => setCopied(false), 2000) }

  return (
    <div>
      <textarea value={urls} onChange={e => setUrls(e.target.value)} rows={6}
        placeholder={'https://aifazi.net\nhttps://aifazi.net/blog\nhttps://aifazi.net/forum'}
        style={{ ...S.input, resize: 'vertical', marginBottom: 12 }} />
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <div style={S.fieldLabel}>CHANGE FREQUENCY</div>
          <div style={{ width: 150 }}>
            <Select value={freq} onChange={setFreq}
              options={['always','hourly','daily','weekly','monthly','yearly','never'].map(f => [f, f])} />
          </div>
        </div>
        <div>
          <div style={S.fieldLabel}>PRIORITY</div>
          <div style={{ width: 110 }}>
            <Select value={priority} onChange={setPriority}
              options={['1.0','0.9','0.8','0.7','0.5','0.3','0.1'].map(p => [p, p])} />
          </div>
        </div>
        <button onClick={generate} style={S.btn}>GENERATE SITEMAP</button>
      </div>

      {output && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={S.sectionLabel}>OUTPUT — SAVE AS sitemap.xml (place in your public folder)</div>
            <button onClick={copy} style={{ ...S.btn, padding: '6px 16px', fontSize: 9, background: copied ? 'var(--cyan)' : 'var(--green)' }}>{copied ? '✓ COPIED' : 'COPY'}</button>
          </div>
          <textarea readOnly value={output} rows={14} style={{ ...S.input, color: 'var(--cyan)', fontSize: 11, resize: 'none' }} />
        </>
      )}
    </div>
  )
}

// ─── 6. Open Graph Preview ────────────────────────────────────────────────────
function OGPreview() {
  const [form, setForm] = useState({ title: '', description: '', image: '', url: '', siteName: '' })
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  return (
    <div>
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', marginBottom: 16 }}>
        Build your Open Graph tags and preview how your page looks when shared on social media
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
        <div>
          {[
            { key: 'title',       label: 'OG TITLE',       placeholder: 'My Awesome Page' },
            { key: 'description', label: 'OG DESCRIPTION', placeholder: 'A short description...' },
            { key: 'image',       label: 'OG IMAGE URL',   placeholder: 'https://example.com/image.jpg' },
            { key: 'url',         label: 'PAGE URL',       placeholder: 'https://example.com/page' },
            { key: 'siteName',    label: 'SITE NAME',      placeholder: 'aifazi.net' },
          ].map(({ key, label, placeholder }) => (
            <div key={key} style={{ marginBottom: 14 }}>
              <div style={S.fieldLabel}>{label}</div>
              <input value={form[key]} onChange={e => set(key, e.target.value)} placeholder={placeholder} style={S.input} />
            </div>
          ))}
        </div>
        <div>
          <div style={S.sectionLabel}>𝕏 / TWITTER PREVIEW</div>
          <div style={{ border: '1px solid #2f3336', borderRadius: 12, overflow: 'hidden', maxWidth: 380, marginBottom: 20 }}>
            <div style={{ height: 120, background: form.image ? `url(${form.image}) center/cover` : '#1e2d45', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4a6070', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
              {!form.image && 'IMAGE PREVIEW'}
            </div>
            <div style={{ background: '#000', padding: '10px 14px', borderTop: '1px solid #2f3336' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#e7e9ea', marginBottom: 4, fontFamily: 'sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{form.title || 'Page Title'}</div>
              <div style={{ fontSize: 12, color: '#71767b', fontFamily: 'sans-serif' }}>{form.description || 'Description appears here'}</div>
              <div style={{ fontSize: 11, color: '#71767b', marginTop: 6, fontFamily: 'sans-serif' }}>{form.url || 'example.com'}</div>
            </div>
          </div>

          <div style={S.sectionLabel}>FACEBOOK / LINKEDIN PREVIEW</div>
          <div style={{ border: '1px solid #3a3b3c', overflow: 'hidden', maxWidth: 380 }}>
            <div style={{ height: 110, background: form.image ? `url(${form.image}) center/cover` : '#1e2d45', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4a6070', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
              {!form.image && 'IMAGE PREVIEW'}
            </div>
            <div style={{ background: '#242526', padding: '10px 14px', borderTop: '1px solid #3a3b3c' }}>
              <div style={{ fontSize: 10, color: '#8a8d91', fontFamily: 'sans-serif', textTransform: 'uppercase', marginBottom: 4 }}>{form.siteName || form.url || 'example.com'}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#e4e6eb', fontFamily: 'sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{form.title || 'Page Title'}</div>
              <div style={{ fontSize: 12, color: '#8a8d91', fontFamily: 'sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{form.description || 'Description'}</div>
            </div>
          </div>

          {form.title && (
            <details style={{ marginTop: 16 }}>
              <summary style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', cursor: 'pointer', letterSpacing: 2 }}>COPY HTML TAGS</summary>
              <pre style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--cyan)', background: 'var(--bg3)', border: '1px solid var(--border)', padding: 12, marginTop: 8, overflowX: 'auto', whiteSpace: 'pre-wrap' }}>{`<meta property="og:title" content="${form.title}" />\n<meta property="og:description" content="${form.description}" />\n<meta property="og:image" content="${form.image}" />\n<meta property="og:url" content="${form.url}" />${form.siteName ? `\n<meta property="og:site_name" content="${form.siteName}" />` : ''}\n<meta name="twitter:card" content="summary_large_image" />\n<meta name="twitter:title" content="${form.title}" />\n<meta name="twitter:description" content="${form.description}" />\n<meta name="twitter:image" content="${form.image}" />`}</pre>
            </details>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── 7. Title & Description Generator ────────────────────────────────────────
function TitleDescGenerator() {
  const [topic, setTopic]     = useState('')
  const [keyword, setKeyword] = useState('')
  const [results, setResults] = useState(null)

  const generate = () => {
    if (!topic.trim()) return
    const kw = keyword.trim() || topic.trim()
    const yr = new Date().getFullYear()
    setResults({
      titles: [
        `${topic} — Complete Guide for ${yr}`,
        `How to ${topic}: Step-by-Step Guide`,
        `${topic}: Everything You Need to Know`,
        `The Ultimate ${topic} Guide | ${kw}`,
        `${topic} Explained: Tips, Tools & Best Practices`,
        `Master ${topic} in ${yr} — Expert Guide`,
      ],
      descs: [
        `Discover everything about ${topic}. Our comprehensive guide covers ${kw}, best practices, tips and more. Start learning today.`,
        `Looking to learn ${topic}? This complete guide explains ${kw} step by step with real examples and actionable advice.`,
        `${topic} made simple. Learn the essentials of ${kw}, avoid common mistakes, and get results faster with our expert guide.`,
      ]
    })
  }

  const charColor = (len, min, max) => len < min ? '#ff6b35' : len > max ? '#ff4757' : '#00ff88'

  return (
    <div>
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', marginBottom: 16 }}>
        Generate SEO-friendly title tags and meta descriptions for your pages
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <div>
          <div style={S.fieldLabel}>PAGE TOPIC</div>
          <input value={topic} onChange={e => setTopic(e.target.value)} placeholder="e.g. network security" style={S.input} />
        </div>
        <div>
          <div style={S.fieldLabel}>TARGET KEYWORD</div>
          <input value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="e.g. cybersecurity tips" style={S.input} />
        </div>
      </div>
      <button onClick={generate} style={S.btn}>GENERATE IDEAS</button>

      {results && (
        <div style={{ marginTop: 24 }}>
          <div style={S.sectionLabel}>TITLE TAG IDEAS (aim for 50–60 chars)</div>
          {results.titles.map((t, i) => (
            <div key={i} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', padding: '12px 16px', marginBottom: 8, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', cursor: 'pointer' }}
              onClick={() => navigator.clipboard.writeText(t)}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text)' }}>{t}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: charColor(t.length, 30, 60), flexShrink: 0 }}>{t.length}c</span>
            </div>
          ))}
          <div style={{ ...S.sectionLabel, marginTop: 24 }}>META DESCRIPTION IDEAS (aim for 150–160 chars)</div>
          {results.descs.map((d, i) => (
            <div key={i} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', padding: '12px 16px', marginBottom: 8, cursor: 'pointer' }}
              onClick={() => navigator.clipboard.writeText(d)}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text)', marginBottom: 6 }}>{d}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: charColor(d.length, 120, 160) }}>{d.length} chars · click to copy</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── 8. Robots.txt Generator ──────────────────────────────────────────────────
function RobotsTxtGenerator() {
  const [sitemapUrl, setSitemapUrl] = useState('')
  const [blocked, setBlocked]       = useState('/admin\n/api\n/login\n/dashboard')
  const [output, setOutput]         = useState('')
  const [copied, setCopied]         = useState(false)

  const generate = () => {
    const blockList = blocked.split('\n').map(l => l.trim()).filter(Boolean)
    setOutput(`User-agent: *\n${blockList.map(p => `Disallow: ${p}`).join('\n')}\nAllow: /\n${sitemapUrl ? `\nSitemap: ${sitemapUrl}` : ''}`)
  }

  const copy = () => { navigator.clipboard.writeText(output); setCopied(true); setTimeout(() => setCopied(false), 2000) }

  return (
    <div>
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', marginBottom: 16 }}>
        Control which pages search engines can crawl. Place robots.txt in your site's root folder.
      </p>
      <div style={{ marginBottom: 14 }}>
        <div style={S.fieldLabel}>SITEMAP URL (optional)</div>
        <input value={sitemapUrl} onChange={e => setSitemapUrl(e.target.value)} placeholder="https://aifazi.net/sitemap.xml" style={S.input} />
      </div>
      <div style={{ marginBottom: 16 }}>
        <div style={S.fieldLabel}>BLOCKED PATHS (one per line)</div>
        <textarea value={blocked} onChange={e => setBlocked(e.target.value)} rows={6} style={{ ...S.input, resize: 'vertical' }} />
      </div>
      <button onClick={generate} style={S.btn}>GENERATE ROBOTS.TXT</button>

      {output && (
        <div style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={S.sectionLabel}>OUTPUT — SAVE AS robots.txt in your project root</div>
            <button onClick={copy} style={{ ...S.btn, padding: '6px 16px', fontSize: 9, background: copied ? 'var(--cyan)' : 'var(--green)' }}>{copied ? '✓ COPIED' : 'COPY'}</button>
          </div>
          <pre style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--cyan)', background: 'var(--bg3)', border: '1px solid var(--border)', padding: 16, overflowX: 'auto' }}>{output}</pre>
        </div>
      )}
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = {
  input:        { width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--font-display)', fontSize: 14, padding: '10px 14px', outline: 'none', boxSizing: 'border-box' },
  btn:          { fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, padding: '10px 20px', background: 'var(--green)', color: '#000', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: 700 },
  tab:          { fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2, padding: '8px 14px', background: 'var(--bg2)', color: 'var(--muted)', border: '1px solid var(--border)', cursor: 'pointer' },
  tabActive:    { background: 'color-mix(in srgb, var(--green) 10%, transparent)', color: 'var(--green)', borderColor: 'color-mix(in srgb, var(--green) 40%, transparent)' },
  error:        { color: '#ff4757', fontFamily: 'var(--font-mono)', fontSize: 11, marginTop: 8 },
  sectionLabel: { fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 3, color: 'var(--muted)', marginBottom: 12 },
  fieldLabel:   { fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 2, color: 'var(--muted)', marginBottom: 6 },
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
            Free tools to analyze, optimize, and improve your website's search engine performance. No sign-up required.
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
