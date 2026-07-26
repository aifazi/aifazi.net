'use client'
import { useState } from 'react'
import { loadMammoth, loadXLSX, readAB, readText, downloadBlob, fmtBytes, S, DropZone, FileBadge, Progress } from './shared.jsx'
import { Select } from '../../core/ui.jsx'

function DocxPreview() {
  const [html, setHtml]   = useState('')
  const [file, setFile]   = useState(null)
  const [busy, setBusy]   = useState(false)
  const [err, setErr]     = useState('')
  const [stats, setStats] = useState(null)

  const load = async ([f]) => {
    setFile(f); setErr(''); setHtml(''); setBusy(true)
    try {
      const mammoth = await loadMammoth()
      const ab      = await readAB(f)
      const res     = await mammoth.convertToHtml({ arrayBuffer: ab })
      setHtml(res.value)
      const text    = res.value.replace(/<[^>]+>/g,'')
      const words   = text.trim().split(/\s+/).filter(Boolean).length
      const chars   = text.replace(/\s/g,'').length
      setStats({ words, chars, pages: Math.ceil(words / 250) })
    } catch(e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  return (
    <div>
      <DropZone accept=".docx" onFiles={load} label="Drop DOCX to preview" />
      {busy && <Progress pct={60} label="CONVERTING DOCX" />}
      {err && <div style={S.err}>⚠ {err}</div>}
      {stats && (
        <div style={{ display:'flex', gap:16, margin:'16px 0', flexWrap:'wrap' }}>
          {[{l:'WORDS',v:stats.words,c:'var(--green)'},{l:'CHARACTERS',v:stats.chars,c:'var(--cyan)'},{l:'EST. PAGES',v:stats.pages,c:'var(--orange)'}].map(({l,v,c}) => (
            <div key={l} style={{ background:'var(--bg3)', border:'1px solid var(--border)', padding:'10px 20px', textAlign:'center' }}>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--muted)', letterSpacing:2 }}>{l}</div>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:22, fontWeight:700, color:c }}>{v.toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}
      {html && (
        <div style={{ background:'#fff', color:'#111', padding:'32px 40px', border:'1px solid var(--border)', maxHeight:600, overflowY:'auto', fontFamily:'Georgia,serif', fontSize:15, lineHeight:1.8 }}
          dangerouslySetInnerHTML={{ __html: html }} />
      )}
    </div>
  )
}

function DocxToText() {
  const [text, setText] = useState('')
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr]   = useState('')
  const [copied, setCopied] = useState(false)

  const convert = async ([f]) => {
    setFile(f); setErr(''); setText(''); setBusy(true)
    try {
      const mammoth = await loadMammoth()
      const ab  = await readAB(f)
      const res = await mammoth.extractRawText({ arrayBuffer: ab })
      setText(res.value)
    } catch(e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  const copy  = () => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000) }
  const save  = () => downloadBlob(new Blob([text],{type:'text/plain'}), file?.name?.replace('.docx','.txt') || 'output.txt')

  return (
    <div>
      <DropZone accept=".docx" onFiles={convert} label="Drop DOCX to extract plain text" />
      {busy && <Progress pct={60} label="EXTRACTING TEXT" />}
      {err && <div style={S.err}>⚠ {err}</div>}
      {text && (
        <div style={{ marginTop:16 }}>
          <div style={{ display:'flex', gap:8, marginBottom:10 }}>
            <button onClick={copy} style={{ ...S.btnSm, background: copied ? 'var(--cyan)':'var(--green)' }}>{copied ? '✓ COPIED':'COPY TEXT'}</button>
            <button onClick={save} style={S.btnSm}>⬇ SAVE AS .TXT</button>
          </div>
          <textarea readOnly value={text} rows={18}
            style={{ ...S.input, fontFamily:'var(--font-mono)', fontSize:12, color:'var(--text2)', resize:'vertical' }} />
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// EXCEL / SPREADSHEET TOOLS
// ═══════════════════════════════════════════════════════════════════

function XlsxToCsv() {
  const [file, setFile]   = useState(null)
  const [sheets, setSheets] = useState([])
  const [sheet, setSheet] = useState('')
  const [preview, setPreview] = useState(null)
  const [busy, setBusy]   = useState(false)
  const [err, setErr]     = useState('')

  const load = async ([f]) => {
    setFile(f); setErr(''); setPreview(null); setBusy(true)
    try {
      const XLSX = await loadXLSX()
      const ab   = await readAB(f)
      const wb   = XLSX.read(ab, { type:'array' })
      setSheets(wb.SheetNames)
      setSheet(wb.SheetNames[0])
      const ws  = wb.Sheets[wb.SheetNames[0]]
      const csv = XLSX.utils.sheet_to_csv(ws)
      const rows = csv.split('\n').slice(0,10).map(r => r.split(','))
      setPreview(rows)
    } catch(e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  const convert = async () => {
    if (!file) return
    setBusy(true)
    try {
      const XLSX = await loadXLSX()
      const ab   = await readAB(file)
      const wb   = XLSX.read(ab, { type:'array' })
      const ws   = wb.Sheets[sheet]
      const csv  = XLSX.utils.sheet_to_csv(ws)
      downloadBlob(new Blob([csv],{type:'text/csv'}), `${sheet}.csv`)
    } catch(e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  return (
    <div>
      <DropZone accept=".xlsx,.xls,.xlsm" onFiles={load} label="Drop Excel file to convert to CSV" />
      {err && <div style={S.err}>⚠ {err}</div>}
      {file && sheets.length > 0 && (
        <div style={{ marginTop:16 }}>
          <FileBadge file={file} />
          <div style={{ marginTop:12 }}>
            <label style={S.label}>SELECT SHEET</label>
            <div style={{ width: 240 }}>
              <Select value={sheet} onChange={setSheet} options={sheets.map(s => [s, s])} />
            </div>
          </div>
          {preview && (
            <div style={{ marginTop:12, overflowX:'auto' }}>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--muted)', letterSpacing:2, marginBottom:6 }}>PREVIEW (first 10 rows)</div>
              <table style={{ borderCollapse:'collapse', fontFamily:'var(--font-mono)', fontSize:11, minWidth:'100%' }}>
                <tbody>
                  {preview.map((row,i) => (
                    <tr key={i} style={{ background: i===0 ? 'rgba(0,255,136,.06)' : 'transparent' }}>
                      {row.map((cell,j) => (
                        <td key={j} style={{ padding:'5px 12px', border:'1px solid var(--border2)', color: i===0 ? 'var(--green)' : 'var(--text2)', whiteSpace:'nowrap', maxWidth:160, overflow:'hidden', textOverflow:'ellipsis' }}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <button onClick={convert} disabled={busy} style={{ ...S.btn, marginTop:16 }}>{busy ? 'CONVERTING...' : '⬇ DOWNLOAD CSV'}</button>
        </div>
      )}
    </div>
  )
}

function CsvToXlsx() {
  const [csv, setCsv]   = useState('')
  const [file, setFile] = useState(null)
  const [name, setName] = useState('converted')
  const [err, setErr]   = useState('')

  const loadFile = async ([f]) => {
    setFile(f); setName(f.name.replace('.csv',''))
    setCsv(await readText(f))
  }

  const convert = () => {
    if (!csv.trim()) return setErr('Enter or upload CSV data')
    setErr('')
    try {
      const XLSX = window.XLSX
      if (!XLSX) { loadXLSX().then(convert); return }
      const rows = csv.trim().split('\n').map(r => r.split(',').map(c => c.replace(/^"|"$/g,'')))
      const ws   = XLSX.utils.aoa_to_sheet(rows)
      const wb   = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
      XLSX.writeFile(wb, name + '.xlsx')
    } catch(e) { setErr(e.message) }
  }

  return (
    <div>
      <DropZone accept=".csv,.txt" onFiles={loadFile} label="Drop CSV file or paste data below" />
      <div style={{ marginTop:16 }}>
        <label style={S.label}>OR PASTE CSV DATA</label>
        <textarea value={csv} onChange={e => setCsv(e.target.value)} rows={8} placeholder="name,age,city&#10;Alice,30,Dubai&#10;Bob,25,Abu Dhabi" style={{ ...S.input, fontFamily:'var(--font-mono)', fontSize:12, resize:'vertical' }} />
      </div>
      <div style={{ marginTop:12 }}>
        <label style={S.label}>OUTPUT FILENAME</label>
        <div style={{ display:'flex', gap:8 }}>
          <input value={name} onChange={e => setName(e.target.value)} style={{ ...S.input, flex:1 }} />
          <span style={{ fontFamily:'var(--font-mono)', fontSize:12, color:'var(--muted)', alignSelf:'center', flexShrink:0 }}>.xlsx</span>
        </div>
      </div>
      <button onClick={() => { loadXLSX().then(convert) }} style={{ ...S.btn, marginTop:16 }}>⬇ DOWNLOAD XLSX</button>
      {err && <div style={S.err}>⚠ {err}</div>}
    </div>
  )
}

function ExcelPreview() {
  const [wb, setWb]      = useState(null)
  const [sheets, setSheets] = useState([])
  const [sheet, setSheet]  = useState('')
  const [data, setData]    = useState([])
  const [file, setFile]    = useState(null)
  const [err, setErr]      = useState('')

  const load = async ([f]) => {
    setFile(f); setErr('')
    try {
      const XLSX = await loadXLSX()
      const ab   = await readAB(f)
      const book = XLSX.read(ab, { type:'array' })
      setWb(book); setSheets(book.SheetNames)
      const s = book.SheetNames[0]; setSheet(s)
      setData(XLSX.utils.sheet_to_json(book.Sheets[s], { header:1 }))
    } catch(e) { setErr(e.message) }
  }

  const switchSheet = s => {
    setSheet(s)
    const XLSX = window.XLSX
    if (XLSX && wb) setData(XLSX.utils.sheet_to_json(wb.Sheets[s], { header:1 }))
  }

  return (
    <div>
      <DropZone accept=".xlsx,.xls,.xlsm" onFiles={load} label="Drop Excel file to preview" />
      {err && <div style={S.err}>⚠ {err}</div>}
      {sheets.length > 0 && (
        <div style={{ marginTop:16 }}>
          <div style={{ display:'flex', gap:4, marginBottom:12, overflowX:'auto' }}>
            {sheets.map(s => (
              <button key={s} onClick={() => switchSheet(s)} style={{ fontFamily:'var(--font-mono)', fontSize:10, padding:'6px 14px', background: sheet===s ? 'rgba(0,255,136,.12)' : 'var(--bg3)', color: sheet===s ? 'var(--green)' : 'var(--muted)', border:`1px solid ${sheet===s ? 'rgba(0,255,136,.35)' : 'var(--border)'}`, cursor:'pointer', whiteSpace:'nowrap' }}>
                {s}
              </button>
            ))}
          </div>
          <div style={{ overflowX:'auto', maxHeight:500, overflowY:'auto', border:'1px solid var(--border)' }}>
            <table style={{ borderCollapse:'collapse', fontFamily:'var(--font-mono)', fontSize:11, minWidth:'100%' }}>
              <tbody>
                {data.map((row,i) => (
                  <tr key={i} style={{ background: i===0 ? 'rgba(0,255,136,.06)' : i%2===0 ? 'transparent' : 'rgba(0,0,0,.2)' }}>
                    <td style={{ padding:'4px 10px', borderRight:'1px solid var(--border2)', color:'var(--muted)', fontSize:9, userSelect:'none', background:'var(--bg2)', position:'sticky', left:0 }}>{i+1}</td>
                    {(Array.isArray(row) ? row : []).map((cell,j) => (
                      <td key={j} style={{ padding:'5px 14px', border:'1px solid var(--border2)', color: i===0 ? 'var(--green)' : 'var(--text2)', whiteSpace:'nowrap', maxWidth:200, overflow:'hidden', textOverflow:'ellipsis' }}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--muted)', marginTop:8, letterSpacing:1 }}>
            {data.length} rows × {Math.max(...data.map(r => Array.isArray(r) ? r.length : 0))} columns in sheet "{sheet}"
          </div>
        </div>
      )}
    </div>
  )
}


// ═══════════════════════════════════════════════════════════════════
// IMAGE TOOLS
// ═══════════════════════════════════════════════════════════════════

export { DocxPreview, DocxToText, XlsxToCsv, CsvToXlsx, ExcelPreview }
