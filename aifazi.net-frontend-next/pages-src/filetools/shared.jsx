'use client'
import { useState, useRef, useCallback } from 'react'

// ── CDN library loaders ───────────────────────────────────────────────────────
function loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) return res()
    const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej
    document.head.appendChild(s)
  })
}
const loadPdfLib  = () => loadScript('https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js').then(() => window.PDFLib)
const loadPdfJs   = async () => {
  await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js')
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
  return window.pdfjsLib
}
const loadMammoth = () => loadScript('https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js').then(() => window.mammoth)
const loadXLSX    = () => loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js').then(() => window.XLSX)
const loadTesseract = () => loadScript('https://unpkg.com/tesseract.js@5.0.3/dist/tesseract.min.js').then(() => window.Tesseract)

// ── Shared helpers ────────────────────────────────────────────────────────────
const downloadBlob = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click() }
const readAB   = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = e => res(e.target.result); r.onerror = rej; r.readAsArrayBuffer(f) })
const readText = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = e => res(e.target.result); r.onerror = rej; r.readAsText(f) })
const readDataUrl = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = e => res(e.target.result); r.onerror = rej; r.readAsDataURL(f) })
const fmtBytes = b => b < 1024 ? b + ' B' : b < 1048576 ? (b/1024).toFixed(1) + ' KB' : (b/1048576).toFixed(2) + ' MB'

// ── Shared styles ─────────────────────────────────────────────────────────────
const S = {
  input:    { width:'100%', background:'var(--bg3)', border:'1px solid var(--border)', color:'var(--text)', fontFamily:'var(--font-display)', fontSize:14, padding:'10px 14px', outline:'none', boxSizing:'border-box' },
  btn:      { fontFamily:'var(--font-mono)', fontSize:11, letterSpacing:2, padding:'10px 22px', background:'var(--green)', color:'#000', border:'none', cursor:'pointer', fontWeight:700, whiteSpace:'nowrap' },
  btnOut:   { fontFamily:'var(--font-mono)', fontSize:11, letterSpacing:2, padding:'10px 22px', background:'transparent', color:'var(--cyan)', border:'1px solid var(--cyan)', cursor:'pointer', fontWeight:700, whiteSpace:'nowrap' },
  btnSm:    { fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:2, padding:'7px 14px', background:'var(--green)', color:'#000', border:'none', cursor:'pointer', fontWeight:700 },
  label:    { fontFamily:'var(--font-mono)', fontSize:9, letterSpacing:2, color:'var(--muted)', display:'block', marginBottom:6 },
  err:      { color:'var(--red)', fontFamily:'var(--font-mono)', fontSize:11, marginTop:8, padding:'8px 12px', background:'rgba(255,71,87,.08)', border:'1px solid rgba(255,71,87,.3)' },
  success:  { color:'var(--green)', fontFamily:'var(--font-mono)', fontSize:11, marginTop:8, padding:'8px 12px', background:'color-mix(in srgb, var(--green) 7%, transparent)', border:'1px solid color-mix(in srgb, var(--green) 25%, transparent)' },
  panel:    { background:'var(--bg3)', border:'1px solid var(--border)', padding:'20px 24px', marginTop:16 },
  row:      { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid var(--border2)' },
}

// ── DropZone ─────────────────────────────────────────────────────────────────
function DropZone({ onFiles, accept='*', multiple=false, label='Drop files here or click to browse' }) {
  const [over, setOver] = useState(false)
  const ref = useRef()
  const handle = fs => { const arr = [...fs]; if (!multiple) onFiles([arr[0]]); else onFiles(arr) }
  return (
    <div
      onClick={() => ref.current.click()}
      onDragOver={e => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); handle(e.dataTransfer.files) }}
      style={{ border:`2px dashed ${over ? 'var(--green)' : 'var(--border)'}`, padding:'40px 24px', textAlign:'center', cursor:'pointer', transition:'all .2s', background: over ? 'color-mix(in srgb, var(--green) 4%, transparent)' : 'var(--bg3)' }}
    >
      <input ref={ref} type="file" accept={accept} multiple={multiple} style={{ display:'none' }} onChange={e => handle(e.target.files)} />
      <div style={{ fontSize:32, marginBottom:10 }}>📂</div>
      <div style={{ fontFamily:'var(--font-mono)', fontSize:11, color: over ? 'var(--green)' : 'var(--muted)', letterSpacing:2 }}>{label.toUpperCase()}</div>
      <div style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--muted)', marginTop:6, letterSpacing:1 }}>Accepts: {accept}</div>
    </div>
  )
}

// ── ToolHeader ─────────────────────────────────────────────────────────────────
function ToolHeader({ tool, onBack }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:16, marginBottom:28 }}>
      <button onClick={onBack} style={{ ...S.btnOut, padding:'8px 14px', fontSize:10 }}>← BACK</button>
      <div style={{ fontSize:28 }}>{tool.icon}</div>
      <div>
        <div style={{ fontFamily:'var(--font-display)', fontSize:22, fontWeight:700, color:'var(--text)' }}>{tool.name}</div>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--muted)', letterSpacing:2, marginTop:2 }}>{tool.desc}</div>
      </div>
    </div>
  )
}

// ── FileBadge ─────────────────────────────────────────────────────────────────
function FileBadge({ file, onRemove }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:10, background:'var(--bg3)', border:'1px solid var(--border)', padding:'8px 14px', marginBottom:6 }}>
      <span style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--cyan)', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{file.name}</span>
      <span style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--muted)' }}>{fmtBytes(file.size)}</span>
      {onRemove && <button onClick={onRemove} style={{ background:'none', border:'none', color:'var(--red)', cursor:'pointer', fontSize:14, padding:'0 4px' }}>✕</button>}
    </div>
  )
}

// ── Progress ──────────────────────────────────────────────────────────────────
function Progress({ pct, label }) {
  return (
    <div style={{ marginTop:16 }}>
      <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--muted)', marginBottom:6, letterSpacing:2 }}>{label || 'PROCESSING...'} {pct}%</div>
      <div style={{ height:4, background:'var(--bg3)', border:'1px solid var(--border)' }}>
        <div style={{ height:'100%', width:pct+'%', background:'linear-gradient(90deg,var(--green),var(--cyan))', transition:'width .3s' }} />
      </div>
    </div>
  )
}


// ═══════════════════════════════════════════════════════════════════
// PDF TOOLS
// ═══════════════════════════════════════════════════════════════════

export { loadPdfLib, loadPdfJs, loadMammoth, loadXLSX, loadTesseract, downloadBlob, readAB, readText, readDataUrl, fmtBytes, S, DropZone, ToolHeader, FileBadge, Progress }
