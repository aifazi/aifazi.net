'use client'
import { useState, useEffect, Component } from 'react'
import { dialog } from '../../components/Dialog'

// ── #22 ErrorBoundary ─────────────────────────────────────────────────────────
// Class component (React requires class for componentDidCatch).
// Wrap every admin panel with <PanelErrorBoundary label="Panel Name"> so a
// single render crash cannot take down the entire dashboard.
class PanelErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { crashed: false, error: null }
  }
  static getDerivedStateFromError(err) {
    return { crashed: true, error: err }
  }
  componentDidCatch(err, info) {
    // Log to console so it surfaces in Vercel / Sentry
    console.error(`[PanelErrorBoundary] ${this.props.label || 'Panel'} crashed:`, err, info)
  }
  render() {
    if (this.state.crashed) {
      const label = this.props.label || 'Panel'
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          minHeight: 260, padding: 40, gap: 16, textAlign: 'center',
        }}>
          <div style={{ fontSize: 40 }}>⚠️</div>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2,
            color: '#f87171', padding: '3px 12px',
            background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)',
            borderRadius: 4,
          }}>PANEL CRASHED</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
            {label} failed to render
          </div>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)',
            maxWidth: 420, lineHeight: 1.7,
            background: 'var(--bg2)', border: '1px solid var(--border)',
            padding: '10px 16px', borderRadius: 6, textAlign: 'left',
          }}>
            {this.state.error?.message || 'Unknown render error'}
          </div>
          <button
            onClick={() => this.setState({ crashed: false, error: null })}
            style={{
              fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2,
              padding: '10px 22px', background: 'var(--green)', color: '#000',
              border: 'none', cursor: 'pointer', borderRadius: 4, fontWeight: 700,
            }}
          >
            ↺ RELOAD PANEL
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

function useIsMobile(bp = 768) {
  const [mobile, setMobile] = useState(false)
  useEffect(() => {
    const h = () => setMobile(window.innerWidth < bp)
    h() // set initial value
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [bp])
  return mobile
}

// --- Shared styles ------------------------------------------------------------
const S = {
  input: {
    background: 'var(--bg3)', border: '1px solid var(--border)',
    color: 'var(--text)', fontFamily: 'var(--font-display)',
    fontSize: 15, padding: '12px 16px', outline: 'none', width: '100%',
    transition: 'border-color 0.2s, box-shadow 0.2s', borderRadius: 10,
  },
  label: {
    fontFamily: 'var(--font-mono)', fontSize: 10,
    letterSpacing: 2, color: 'var(--muted)', textTransform: 'uppercase',
    display: 'block', marginBottom: 6
  },
  btn: (color = 'var(--green)', textColor = '#000') => ({
    fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2,
    padding: '10px 20px', background: color, color: textColor,
    border: 'none', cursor: 'pointer', transition: 'opacity 0.2s', borderRadius: 8,
  }),
  card: {
    background: 'var(--bg2)', border: '1px solid var(--border)',
    padding: 20, marginBottom: 8, borderRadius: 12,
    transition: 'border-color 0.2s, box-shadow 0.2s',
  },
  // -- Reusable page section header --
  sectionHead: (label) => (
    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 3, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 14 }}>{label}</div>
  ),
  // -- Inline stat row for cards --
  statRow: (label, value, color = 'var(--green)') => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)' }}>{label}</span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color, fontWeight: 700 }}>{value}</span>
    </div>
  ),
}

// ── Skeleton loaders — shimmer placeholders for loading states ────────────────
function SkeletonBlock({ width = '100%', height = 16, style = {} }) {
  return (
    <div className="sk-block" style={{ width, height, ...style }} />
  )
}

function SkeletonGrid({ cols = 4, rows = 1, gap = 12 }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap, marginBottom: 20 }}>
      {Array.from({ length: cols * rows }).map((_, i) => (
        <div key={i} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <SkeletonBlock width="45%" height={10} />
            <SkeletonBlock width={32} height={32} style={{ borderRadius: 10 }} />
          </div>
          <SkeletonBlock width="55%" height={26} style={{ marginBottom: 8 }} />
          <SkeletonBlock width="35%" height={10} />
        </div>
      ))}
    </div>
  )
}

// --- Page header component ----------------------------------------------------
function PageHeader({ eyebrow, title, subtitle, actions }) {
  return (
    <div style={{ marginBottom: 28, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
      <div>
        {eyebrow && (
          <div style={{ display:'flex', alignItems:'center', gap:8, fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--cyan)', letterSpacing: 4, marginBottom: 8, textTransform: 'uppercase' }}>
            <span style={{ width:14, height:2, background:'linear-gradient(90deg,var(--cyan),transparent)', borderRadius:2 }} />
            {eyebrow}
          </div>
        )}
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 700, margin: 0, lineHeight: 1.2, letterSpacing:-0.5 }}>{title}</h2>
        {subtitle && <p style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: 11, marginTop: 6 }}>{subtitle}</p>}
      </div>
      {actions && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>{actions}</div>}
    </div>
  )
}

// --- Slash Command Menu -------------------------------------------------------
const SLASH_COMMANDS = [
  { group: 'FORMAT', items: [
    { icon: 'H', label: 'Heading 1', desc: 'Big section heading',      action: e => e.exec('formatBlock', '<h1>') },
    { icon: 'H', label: 'Heading 2', desc: 'Medium section heading',   action: e => e.exec('formatBlock', '<h2>') },
    { icon: 'H', label: 'Heading 3', desc: 'Small section heading',    action: e => e.exec('formatBlock', '<h3>') },
    { icon: '¶', label: 'Text',      desc: 'Paragraph block',          action: e => e.exec('formatBlock', '<p>') },
    { icon: '"', label: 'Quote',     desc: 'Add a blockquote section', action: e => e.exec('formatBlock', '<blockquote>') },
    { icon: '</>', label: 'Code',   desc: 'Add a code section',       action: e => e.insert('<pre><code>code here</code></pre>') },
    { icon: 'B',  label: 'Bold',     desc: 'Bold text',                action: e => e.exec('bold') },
    { icon: 'I',  label: 'Italic',   desc: 'Italic text',              action: e => e.exec('italic') },
    { icon: 'S',  label: 'Strike',   desc: 'Strikethrough text',       action: e => e.exec('strikeThrough') },
  ]},
  { group: 'STRUCTURE', items: [
    { icon: '○', label: 'Divider',        desc: 'Insert a horizontal rule',      action: e => e.insert('<hr/>') },
    { icon: '•', label: 'Bulleted list',  desc: 'Create a simple bulleted list', action: e => e.exec('insertUnorderedList') },
    { icon: '1.', label: 'Numbered list', desc: 'Create a list with numbering',  action: e => e.exec('insertOrderedList') },
    { icon: '○', label: 'Checklist',     desc: 'Track tasks with a checklist',  action: e => e.insert('<ul style="list-style:none"><li>☑ Task 1</li><li>☐ Task 2</li></ul>') },
    { icon: '○', label: '2 columns',     desc: 'Convert into 2 columns', action: e => e.insert('<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px"><div>Column 1</div><div>Column 2</div></div>') },
    { icon: '○', label: '3 columns',     desc: 'Convert into 3 columns', action: e => e.insert('<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px"><div>Col 1</div><div>Col 2</div><div>Col 3</div></div>') },
    { icon: '○', label: 'Table',         desc: 'Insert a table', action: e => e.insert('<table border="1" style="width:100%;border-collapse:collapse"><tr><th>Header 1</th><th>Header 2</th></tr><tr><td>Cell</td><td>Cell</td></tr></table>') },
  ]},
  { group: 'SNIPPETS', items: [
    { icon: '○', label: 'Alert',         desc: 'Insert an alert snippet', action: e => e.insert('<div style="padding:12px 16px;border-left:3px solid #00d4ff;background:rgba(0,212,255,0.08);margin:8px 0">⚠️ Alert text here</div>') },
    { icon: '○', label: 'Rating',         desc: 'Insert a rating snippet', action: e => e.insert('<div style="color:#ffb800;font-size:20px">★★★★★</div>') },
    { icon: '○', label: 'Card',           desc: 'Insert a card snippet', action: e => e.insert('<div style="border:1px solid rgba(0,212,255,0.2);padding:20px;background:rgba(0,212,255,0.03);margin:8px 0"><strong>Card Title</strong><p>Card content here.</p></div>') },
    { icon: '○', label: 'Share',          desc: 'Insert a share snippet', action: e => e.insert('<div style="padding:12px;border:1px solid var(--border);display:inline-block">🔗 Share this post</div>') },
    { icon: '|', label: 'Text Highlight', desc: 'Insert a text highlight snippet', action: e => e.insert('<mark style="background:rgba(0,255,136,0.2);color:inherit;padding:2px 6px">highlighted text</mark>') },
    { icon: '○', label: 'Chart',         desc: 'Insert a chart snippet', action: e => e.insert('<div style="border:1px dashed rgba(0,212,255,0.3);padding:40px;text-align:center;color:var(--muted)">[ Chart placeholder ]</div>') },
    { icon: '○', label: 'Progress Bar',   desc: 'Insert a progress bar snippet', action: e => e.insert('<div style="margin:8px 0"><div style="font-size:12px;margin-bottom:4px">Progress</div><div style="height:6px;background:rgba(255,255,255,0.1);border-radius:3px"><div style="height:100%;width:75%;background:linear-gradient(to right,#00ff88,#00d4ff);border-radius:3px"></div></div></div>') },
  ]},
  { group: 'MEDIA', items: [
    { icon: '○', label: 'Media', desc: 'Insert image by URL', action: async e => { const u = await dialog.prompt({ title: 'Insert Image', placeholder: 'https://...', variant: 'info', confirmLabel: 'INSERT' }); if(u) e.insert(`<img src="${u}" style="max-width:100%;border-radius:4px"/>`) } },
    { icon: '○', label: 'Link',  desc: 'Insert a hyperlink',  action: async e => { const u = await dialog.prompt({ title: 'Insert Link', placeholder: 'https://...', variant: 'info', confirmLabel: 'NEXT' }); if(!u) return; const lbl = await dialog.prompt({ title: 'Link Label', placeholder: u, variant: 'info', confirmLabel: 'INSERT' }); if(u) e.insert(`<a href="${u}" target="_blank" style="color:var(--cyan)">${lbl || u}</a>`) } },
  ]},
]


export { useIsMobile, S, SLASH_COMMANDS, PageHeader, PanelErrorBoundary, SkeletonBlock, SkeletonGrid }
