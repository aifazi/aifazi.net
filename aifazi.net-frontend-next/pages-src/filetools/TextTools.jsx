'use client'
import { useState } from 'react'
import { loadPdfLib, readText, readDataUrl, downloadBlob, S, DropZone } from './shared.jsx'
import { Select } from '../../core/ui.jsx'

function CompareText() {
  const [textA, setTextA] = useState('')
  const [textB, setTextB] = useState('')
  const [diff, setDiff]   = useState(null)

  const loadA = async ([f]) => setTextA(await readText(f))
  const loadB = async ([f]) => setTextB(await readText(f))

  const compare = () => {
    const linesA = textA.split('\n')
    const linesB = textB.split('\n')
    const maxLen = Math.max(linesA.length, linesB.length)
    const result = []
    for (let i = 0; i < maxLen; i++) {
      const a = linesA[i] ?? null
      const b = linesB[i] ?? null
      if (a === b)  result.push({ type:'same',    a, b, line: i+1 })
      else if (!b)  result.push({ type:'removed', a, b, line: i+1 })
      else if (!a)  result.push({ type:'added',   a, b, line: i+1 })
      else          result.push({ type:'changed',  a, b, line: i+1 })
    }
    setDiff(result)
  }

  const colors = { same:'transparent', removed:'rgba(255,71,87,.12)', added:'rgba(0,255,136,.1)', changed:'rgba(255,107,53,.12)' }
  const labels = { same:'', removed:'− DEL', added:'+ ADD', changed:'≠ CHG' }
  const labelC = { same:'var(--muted)', removed:'var(--red)', added:'var(--green)', changed:'var(--orange)' }

  const stats = diff ? {
    same:    diff.filter(d=>d.type==='same').length,
    removed: diff.filter(d=>d.type==='removed').length,
    added:   diff.filter(d=>d.type==='added').length,
    changed: diff.filter(d=>d.type==='changed').length,
  } : null

  return (
    <div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        <div>
          <label style={S.label}>FILE A (original)</label>
          <DropZone accept=".txt,.md,.csv,.js,.jsx,.ts,.tsx,.py,.json" onFiles={loadA} label="Drop file A" />
          {textA && <textarea value={textA} onChange={e=>setTextA(e.target.value)} rows={6} style={{ ...S.input, marginTop:8, fontFamily:'var(--font-mono)', fontSize:11, resize:'vertical' }} />}
        </div>
        <div>
          <label style={S.label}>FILE B (modified)</label>
          <DropZone accept=".txt,.md,.csv,.js,.jsx,.ts,.tsx,.py,.json" onFiles={loadB} label="Drop file B" />
          {textB && <textarea value={textB} onChange={e=>setTextB(e.target.value)} rows={6} style={{ ...S.input, marginTop:8, fontFamily:'var(--font-mono)', fontSize:11, resize:'vertical' }} />}
        </div>
      </div>
      <button onClick={compare} style={{ ...S.btn, marginTop:16 }}>⟳ COMPARE FILES</button>

      {stats && (
        <div style={{ display:'flex', gap:12, margin:'16px 0', flexWrap:'wrap' }}>
          {[['SAME',stats.same,'var(--muted)'],['REMOVED',stats.removed,'var(--red)'],['ADDED',stats.added,'var(--green)'],['CHANGED',stats.changed,'var(--orange)']].map(([l,v,c])=>(
            <div key={l} style={{ background:'var(--bg3)', border:'1px solid var(--border)', padding:'8px 18px', textAlign:'center' }}>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:8, color:'var(--muted)', letterSpacing:2 }}>{l}</div>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:20, fontWeight:700, color:c }}>{v}</div>
            </div>
          ))}
        </div>
      )}

      {diff && (
        <div style={{ border:'1px solid var(--border)', overflowX:'auto', maxHeight:400, overflowY:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontFamily:'var(--font-mono)', fontSize:11 }}>
            <thead style={{ position:'sticky', top:0, background:'var(--bg2)' }}>
              <tr>
                <th style={{ padding:'6px 10px', borderBottom:'1px solid var(--border)', color:'var(--muted)', fontSize:9, letterSpacing:1, width:40 }}>#</th>
                <th style={{ padding:'6px 10px', borderBottom:'1px solid var(--border)', color:'var(--muted)', fontSize:9, letterSpacing:1, width:50 }}>TYPE</th>
                <th style={{ padding:'6px 10px', borderBottom:'1px solid var(--border)', color:'var(--muted)', fontSize:9, letterSpacing:1 }}>FILE A</th>
                <th style={{ padding:'6px 10px', borderBottom:'1px solid var(--border)', color:'var(--muted)', fontSize:9, letterSpacing:1 }}>FILE B</th>
              </tr>
            </thead>
            <tbody>
              {diff.filter(d=>d.type!=='same').map((d,i) => (
                <tr key={i} style={{ background: colors[d.type] }}>
                  <td style={{ padding:'4px 10px', color:'var(--muted)', fontSize:9 }}>{d.line}</td>
                  <td style={{ padding:'4px 10px', color: labelC[d.type], fontSize:9, fontWeight:700 }}>{labels[d.type]}</td>
                  <td style={{ padding:'4px 10px', color:'var(--text)', whiteSpace:'pre', maxWidth:300, overflow:'hidden', textOverflow:'ellipsis' }}>{d.a ?? ''}</td>
                  <td style={{ padding:'4px 10px', color:'var(--text)', whiteSpace:'pre', maxWidth:300, overflow:'hidden', textOverflow:'ellipsis' }}>{d.b ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Text → PDF ────────────────────────────────────────────────────
function TextToPDF() {
  const [text, setText] = useState('')
  const [title, setTitle] = useState('Document')
  const [fontSize, setFontSize] = useState('12')
  const [busy, setBusy] = useState(false)
  const [err, setErr]   = useState('')

  const loadFile = async ([f]) => setText(await readText(f))

  const create = async () => {
    if (!text.trim()) return setErr('Enter or upload some text first')
    setErr(''); setBusy(true)
    try {
      const { PDFDocument, rgb } = await loadPdfLib()
      const doc  = await PDFDocument.create()
      doc.setTitle(title)
      const font = await doc.embedFont('Helvetica')
      const fs   = parseInt(fontSize) || 12
      const lineH = fs * 1.5
      const pageW = 595, pageH = 842
      const margin = 60
      const maxW  = pageW - margin * 2

      const lines = text.split('\n').flatMap(line => {
        if (!line.trim()) return ['']
        const words = line.split(' ')
        const out = []; let cur = ''
        words.forEach(w => {
          const test = cur ? cur + ' ' + w : w
          if (font.widthOfTextAtSize(test, fs) > maxW && cur) { out.push(cur); cur = w }
          else cur = test
        })
        if (cur) out.push(cur)
        return out
      })

      let page = doc.addPage([pageW, pageH])
      let y = pageH - margin

      for (const line of lines) {
        if (y < margin + lineH) { page = doc.addPage([pageW, pageH]); y = pageH - margin }
        if (line) page.drawText(line, { x: margin, y, size: fs, font, color: rgb(0.1,0.1,0.1) })
        y -= lineH
      }

      const bytes = await doc.save()
      downloadBlob(new Blob([bytes],{type:'application/pdf'}), title.replace(/\s+/g,'_') + '.pdf')
    } catch(e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  return (
    <div>
      <DropZone accept=".txt,.md" onFiles={loadFile} label="Drop .txt or .md file, or type below" />
      <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:12, marginTop:16 }}>
        <div>
          <label style={S.label}>DOCUMENT TITLE</label>
          <input value={title} onChange={e=>setTitle(e.target.value)} style={S.input} />
        </div>
        <div>
          <label style={S.label}>FONT SIZE</label>
          <Select value={fontSize} onChange={setFontSize}
            options={['10','11','12','14','16'].map(s => [s, `${s}pt`])} />
        </div>
      </div>
      <div style={{ marginTop:12 }}>
        <label style={S.label}>TEXT CONTENT</label>
        <textarea value={text} onChange={e=>setText(e.target.value)} rows={12} placeholder="Type or paste your text here..." style={{ ...S.input, fontFamily:'var(--font-mono)', fontSize:12, resize:'vertical', lineHeight:1.7 }} />
      </div>
      <button onClick={create} disabled={busy} style={{ ...S.btn, marginTop:16 }}>{busy ? 'CREATING...' : '⬇ CREATE PDF'}</button>
      {err && <div style={S.err}>⚠ {err}</div>}
    </div>
  )
}


function JsonFormatter() {
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [err, setErr] = useState('')
  const [copied, setCopied] = useState(false)

  const loadFile = async ([f]) => setInput(await readText(f))

  const format = () => {
    setErr(''); setOutput('')
    try {
      const parsed = JSON.parse(input)
      setOutput(JSON.stringify(parsed, null, 2))
    } catch(e) { setErr('Invalid JSON: ' + e.message) }
  }

  const minify = () => {
    setErr(''); setOutput('')
    try {
      const parsed = JSON.parse(input)
      setOutput(JSON.stringify(parsed))
    } catch(e) { setErr('Invalid JSON: ' + e.message) }
  }

  const copy = () => { navigator.clipboard.writeText(output); setCopied(true); setTimeout(()=>setCopied(false),2000) }
  const save = () => downloadBlob(new Blob([output],{type:'application/json'}), 'formatted.json')

  return (
    <div>
      <DropZone accept=".json,.txt" onFiles={loadFile} label="Drop JSON file or paste below" />
      <div style={{ marginTop:16 }}>
        <label style={S.label}>JSON INPUT</label>
        <textarea value={input} onChange={e=>setInput(e.target.value)} rows={8} placeholder='{"name":"Tanvir","site":"aifazi.net"}' style={{ ...S.input, fontFamily:'var(--font-mono)', fontSize:11, resize:'vertical' }} />
      </div>
      <div style={{ display:'flex', gap:8, marginTop:12 }}>
        <button onClick={format} style={S.btn}>⟳ FORMAT / PRETTIFY</button>
        <button onClick={minify} style={S.btnOut}>⟹ MINIFY</button>
      </div>
      {err && <div style={S.err}>⚠ {err}</div>}
      {output && (
        <div style={{ marginTop:16 }}>
          <div style={{ display:'flex', gap:8, marginBottom:8 }}>
            <button onClick={copy} style={{ ...S.btnSm, background:copied?'var(--cyan)':'var(--green)' }}>{copied?'✓ COPIED':'COPY'}</button>
            <button onClick={save} style={S.btnSm}>⬇ SAVE .JSON</button>
          </div>
          <textarea readOnly value={output} rows={12} style={{ ...S.input, fontFamily:'var(--font-mono)', fontSize:11, color:'var(--text2)', resize:'vertical' }} />
        </div>
      )}
    </div>
  )
}

// ── Base64 Encode / Decode ────────────────────────────────────────
function Base64Tool() {
  const [input, setInput]   = useState('')
  const [output, setOutput] = useState('')
  const [mode, setMode]     = useState('encode')
  const [err, setErr]       = useState('')
  const [copied, setCopied] = useState(false)

  const loadFile = async ([f]) => {
    if (mode === 'encode') {
      const url = await readDataUrl(f)
      setInput(url)
    } else {
      setInput(await readText(f))
    }
  }

  const run = () => {
    setErr(''); setOutput('')
    try {
      if (mode === 'encode') setOutput(btoa(unescape(encodeURIComponent(input))))
      else setOutput(decodeURIComponent(escape(atob(input.trim()))))
    } catch(e) { setErr('Failed: ' + e.message) }
  }

  const copy = () => { navigator.clipboard.writeText(output); setCopied(true); setTimeout(()=>setCopied(false),2000) }

  return (
    <div>
      <div style={{ display:'flex', gap:8, marginBottom:16 }}>
        {[['encode','ENCODE →'],['decode','← DECODE']].map(([v,l])=>(
          <button key={v} onClick={()=>setMode(v)} style={{ fontFamily:'var(--font-mono)', fontSize:10, padding:'8px 20px', background:mode===v?'rgba(0,255,136,.1)':'var(--bg3)', color:mode===v?'var(--green)':'var(--muted)', border:`1px solid ${mode===v?'rgba(0,255,136,.4)':'var(--border)'}`, cursor:'pointer' }}>{l}</button>
        ))}
      </div>
      <DropZone accept="*" onFiles={loadFile} label="Drop any file to encode, or paste text below" />
      <div style={{ marginTop:12 }}>
        <label style={S.label}>INPUT</label>
        <textarea value={input} onChange={e=>setInput(e.target.value)} rows={5} placeholder={mode==='encode'?'Text to encode...':'Base64 string to decode...'} style={{ ...S.input, fontFamily:'var(--font-mono)', fontSize:11, resize:'vertical' }} />
      </div>
      <button onClick={run} style={{ ...S.btn, marginTop:12 }}>⟳ {mode.toUpperCase()}</button>
      {err && <div style={S.err}>⚠ {err}</div>}
      {output && (
        <div style={{ marginTop:16 }}>
          <label style={S.label}>OUTPUT</label>
          <textarea readOnly value={output} rows={5} style={{ ...S.input, fontFamily:'var(--font-mono)', fontSize:11, color:'var(--text2)', resize:'vertical' }} />
          <button onClick={copy} style={{ ...S.btnSm, marginTop:8, background:copied?'var(--cyan)':'var(--green)' }}>{copied?'✓ COPIED':'COPY OUTPUT'}</button>
        </div>
      )}
    </div>
  )
}

// ── Word Count / Text Stats ───────────────────────────────────────
function TextStats() {
  const [text, setText] = useState('')
  const loadFile = async ([f]) => setText(await readText(f))

  const words   = text.trim() ? text.trim().split(/\s+/).length : 0
  const chars   = text.length
  const noSpace = text.replace(/\s/g,'').length
  const lines   = text.split('\n').length
  const sents   = text.split(/[.!?]+/).filter(Boolean).length
  const paras   = text.split(/\n\n+/).filter(Boolean).length
  const readMin = Math.ceil(words / 200)
  const freq    = text.trim()
    ? Object.entries(
        text.toLowerCase().replace(/[^a-z\s]/g,'').split(/\s+/).filter(w=>w.length>3)
          .reduce((acc,w)=>({ ...acc,[w]:(acc[w]||0)+1 }),{})
      ).sort((a,b)=>b[1]-a[1]).slice(0,10)
    : []

  return (
    <div>
      <DropZone accept=".txt,.md,.docx" onFiles={loadFile} label="Drop text file or type below" />
      <div style={{ marginTop:16 }}>
        <label style={S.label}>TEXT INPUT</label>
        <textarea value={text} onChange={e=>setText(e.target.value)} rows={8} placeholder="Paste or type text here..." style={{ ...S.input, fontFamily:'var(--font-mono)', fontSize:12, resize:'vertical', lineHeight:1.7 }} />
      </div>
      {text && (
        <>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(130px,1fr))', gap:8, marginTop:16 }}>
            {[['WORDS',words,'var(--green)'],['CHARACTERS',chars,'var(--cyan)'],['NO SPACES',noSpace,'var(--cyan)'],['LINES',lines,'var(--orange)'],['SENTENCES',sents,'var(--purple)'],['PARAGRAPHS',paras,'var(--gold)'],['READ TIME',readMin+'min','var(--text)']].map(([l,v,c])=>(
              <div key={l} style={{ background:'var(--bg3)', border:'1px solid var(--border)', padding:'10px 14px', textAlign:'center' }}>
                <div style={{ fontFamily:'var(--font-mono)', fontSize:8, color:'var(--muted)', letterSpacing:2 }}>{l}</div>
                <div style={{ fontFamily:'var(--font-mono)', fontSize:20, fontWeight:700, color:c }}>{v.toLocaleString()}</div>
              </div>
            ))}
          </div>
          {freq.length > 0 && (
            <div style={{ marginTop:16 }}>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--muted)', letterSpacing:3, marginBottom:8 }}>TOP WORDS (4+ letters)</div>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                {freq.map(([w,n])=>(
                  <span key={w} style={{ fontFamily:'var(--font-mono)', fontSize:10, padding:'4px 10px', background:'var(--bg3)', border:'1px solid var(--border)', color:'var(--text)' }}>
                    {w} <span style={{ color:'var(--cyan)' }}>×{n}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// CONVERT TOOLS
// ═══════════════════════════════════════════════════════════════════


export { CompareText, TextToPDF, JsonFormatter, Base64Tool, TextStats }
