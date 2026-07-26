'use client'
import React, { useState, useEffect, useRef } from 'react'
import { loadScript, downloadBlob, readText, readDataUrl, fmtBytes, DropZone, ToolHeader, FileBadge, Progress } from './sharedTools'
import { Select } from '../../core/ui.jsx'

// -- Word / Excel Viewers and Converters --
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
      {err && <div style={S.err}>? {err}</div>}
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
      {err && <div style={S.err}>? {err}</div>}
      {text && (
        <div style={{ marginTop:16 }}>
          <div style={{ display:'flex', gap:8, marginBottom:10 }}>
            <button onClick={copy} style={{ ...S.btnSm, background: copied ? 'var(--cyan)':'var(--green)' }}>{copied ? '✅ COPIED':'COPY TEXT'}</button>
            <button onClick={save} style={S.btnSm}>💾 SAVE AS .TXT</button>
          </div>
          <textarea readOnly value={text} rows={18}
            style={{ ...S.input, fontFamily:'var(--font-mono)', fontSize:12, color:'var(--text2)', resize:'vertical' }} />
        </div>
      )}
    </div>
  )
}

// -------------------------------------------------------------------
// EXCEL / SPREADSHEET TOOLS
// -------------------------------------------------------------------

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
      {err && <div style={S.err}>? {err}</div>}
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
          <button onClick={convert} disabled={busy} style={{ ...S.btn, marginTop:16 }}>{busy ? 'CONVERTING...' : '⬇️ DOWNLOAD CSV'}</button>
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
      <button onClick={() => { loadXLSX().then(convert) }} style={{ ...S.btn, marginTop:16 }}>⬇️ DOWNLOAD XLSX</button>
      {err && <div style={S.err}>? {err}</div>}
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
      {err && <div style={S.err}>? {err}</div>}
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


// -------------------------------------------------------------------
// IMAGE TOOLS
// -------------------------------------------------------------------

function CompressImage() {

// -- Document Format Conversions --
function PDFToWord() {
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [pct, setPct]   = useState(0)
  const [err, setErr]   = useState('')
  const [msg, setMsg]   = useState('')

  const convert = async () => {
    if (!file) return
    setErr(''); setMsg(''); setBusy(true); setPct(10)
    try {
      const pdfjs = await loadPdfJs()
      const ab    = await readAB(file)
      const pdf   = await pdfjs.getDocument({ data: new Uint8Array(ab) }).promise
      let fullText = ''
      for (let i = 1; i <= pdf.numPages; i++) {
        setPct(Math.round(10 + (i / pdf.numPages) * 75))
        const page    = await pdf.getPage(i)
        const content = await page.getTextContent()
        const pageText = content.items.map(item => item.str).join(' ')
        fullText += `\n--- Page ${i} ---\n${pageText}\n`
      }
      setPct(90)
      // Build a simple RTF file (opens in Word perfectly)
      const rtf = `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Times New Roman;}}\\f0\\fs24 ${
        fullText.replace(/\\/g,'\\\\').replace(/\{/g,'\\{').replace(/\}/g,'\\}')
          .replace(/\n/g,'\\par\n')
      }}`
      downloadBlob(new Blob([rtf], { type:'application/rtf' }), file.name.replace('.pdf','_converted.rtf'))
      setMsg(`✅ Converted ${pdf.numPages} pages · opens in Word, LibreOffice & Google Docs`)
    } catch(e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  return (
    <div>
      <div style={{ ...S.panel, padding:'12px 16px', marginBottom:16 }}>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--orange)', letterSpacing:1 }}>
          Extracts text from PDF and saves as RTF (Rich Text Format) · opens natively in Microsoft Word, LibreOffice, and Google Docs. Complex layouts with images/tables may need manual cleanup.
        </div>
      </div>
      <DropZone accept=".pdf" onFiles={([f]) => { setFile(f); setErr(''); setMsg('') }} label="Drop PDF to convert to Word" />
      {file && (
        <div style={{ marginTop:16 }}>
          <FileBadge file={file} />
          <button onClick={convert} disabled={busy} style={{ ...S.btn, marginTop:12 }}>{busy ? `CONVERTING... ${pct}%` : '⬇️ CONVERT TO WORD (.RTF)'}</button>
        </div>
      )}
      {busy && <Progress pct={pct} label="EXTRACTING TEXT" />}
      {err && <div style={S.err}>? {err}</div>}
      {msg && <div style={S.success}>{msg}</div>}
    </div>
  )
}

// -- PDF ? Excel (extract tables as CSV) --------------------------
function PDFToExcel() {
  const [file, setFile]   = useState(null)
  const [busy, setBusy]   = useState(false)
  const [pct, setPct]     = useState(0)
  const [err, setErr]     = useState('')
  const [msg, setMsg]     = useState('')
  const [preview, setPreview] = useState([])

  const convert = async () => {
    if (!file) return
    setErr(''); setMsg(''); setBusy(true); setPct(10); setPreview([])
    try {
      const pdfjs = await loadPdfJs()
      const XLSX  = await loadXLSX()
      const ab    = await readAB(file)
      const pdf   = await pdfjs.getDocument({ data: new Uint8Array(ab) }).promise
      const allRows = []

      for (let i = 1; i <= pdf.numPages; i++) {
        setPct(Math.round(10 + (i / pdf.numPages) * 70))
        const page    = await pdf.getPage(i)
        const content = await page.getTextContent()
        // Group items by approximate Y position (rows)
        const byY = {}
        content.items.forEach(item => {
          const y = Math.round(item.transform[5] / 5) * 5
          if (!byY[y]) byY[y] = []
          byY[y].push({ x: item.transform[4], str: item.str })
        })
        // Sort rows top?bottom, cells left?right
        const rows = Object.keys(byY).sort((a,b) => b-a).map(y =>
          byY[y].sort((a,b) => a.x - b.x).map(c => c.str.trim()).filter(Boolean)
        ).filter(r => r.length)
        if (i > 1) allRows.push([`--- Page ${i} ---`])
        allRows.push(...rows)
      }

      setPct(90)
      setPreview(allRows.slice(0,8))
      const ws = XLSX.utils.aoa_to_sheet(allRows)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'PDF Data')
      XLSX.writeFile(wb, file.name.replace('.pdf','_data.xlsx'))
      setMsg(`✅ Extracted ${allRows.length} rows from ${pdf.numPages} pages`)
    } catch(e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  return (
    <div>
      <div style={{ ...S.panel, padding:'12px 16px', marginBottom:16 }}>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--orange)', letterSpacing:1 }}>
          ? Extracts text content row-by-row and exports as Excel. Works best on PDFs with structured text/tables. Scanned PDFs may need OCR first.
        </div>
      </div>
      <DropZone accept=".pdf" onFiles={([f]) => { setFile(f); setErr(''); setMsg(''); setPreview([]) }} label="Drop PDF to extract data to Excel" />
      {file && (
        <div style={{ marginTop:16 }}>
          <FileBadge file={file} />
          <button onClick={convert} disabled={busy} style={{ ...S.btn, marginTop:12 }}>{busy ? `EXTRACTING... ${pct}%` : '⬇️ EXPORT TO EXCEL'}</button>
        </div>
      )}
      {busy && <Progress pct={pct} label="EXTRACTING DATA" />}
      {preview.length > 0 && (
        <div style={{ marginTop:12, overflowX:'auto', border:'1px solid var(--border)' }}>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--muted)', letterSpacing:2, padding:'8px 12px', borderBottom:'1px solid var(--border)' }}>PREVIEW</div>
          <table style={{ width:'100%', borderCollapse:'collapse', fontFamily:'var(--font-mono)', fontSize:10 }}>
            <tbody>
              {preview.map((row, i) => (
                <tr key={i} style={{ borderBottom:'1px solid var(--border2)' }}>
                  {row.map((cell, j) => <td key={j} style={{ padding:'5px 12px', color:'var(--text2)', maxWidth:180, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{cell}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {err && <div style={S.err}>? {err}</div>}
      {msg && <div style={S.success}>{msg}</div>}
    </div>
  )
}

// -- Word ? PDF ----------------------------------------------------
function WordToPDF() {
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr]   = useState('')
  const [msg, setMsg]   = useState('')

  const convert = async () => {
    if (!file) return
    setErr(''); setMsg(''); setBusy(true)
    try {
      const mammoth = await loadMammoth()
      const { PDFDocument, rgb } = await loadPdfLib()
      const ab  = await readAB(file)
      const res = await mammoth.extractRawText({ arrayBuffer: ab })
      const text = res.value

      const doc  = await PDFDocument.create()
      doc.setTitle(file.name.replace('.docx',''))
      const font = await doc.embedFont('Helvetica')
      const fs   = 12, lineH = 18
      const pageW = 595, pageH = 842, margin = 60
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
        if (line.trim()) page.drawText(line, { x: margin, y, size: fs, font, color: rgb(0.1,0.1,0.1) })
        y -= lineH
      }

      const bytes = await doc.save()
      downloadBlob(new Blob([bytes],{type:'application/pdf'}), file.name.replace('.docx','.pdf'))
      setMsg('✅ Word document converted to PDF')
    } catch(e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  return (
    <div>
      <DropZone accept=".docx" onFiles={([f]) => { setFile(f); setErr(''); setMsg('') }} label="Drop Word (.docx) to convert to PDF" />
      {file && (
        <div style={{ marginTop:16 }}>
          <FileBadge file={file} />
          <button onClick={convert} disabled={busy} style={{ ...S.btn, marginTop:12 }}>{busy ? 'CONVERTING...' : '⬇️ CONVERT TO PDF'}</button>
        </div>
      )}
      {err && <div style={S.err}>? {err}</div>}
      {msg && <div style={S.success}>{msg}</div>}
    </div>
  )
}

// -- Excel ? PDF ---------------------------------------------------
function ExcelToPDF() {
  const [file, setFile]   = useState(null)
  const [sheets, setSheets] = useState([])
  const [sheet, setSheet] = useState('')
  const [busy, setBusy]   = useState(false)
  const [err, setErr]     = useState('')
  const [msg, setMsg]     = useState('')

  const loadFile = async ([f]) => {
    setFile(f); setErr(''); setMsg('')
    const XLSX = await loadXLSX()
    const ab   = await readAB(f)
    const wb   = XLSX.read(ab, { type:'array' })
    setSheets(wb.SheetNames)
    setSheet(wb.SheetNames[0])
  }

  const convert = async () => {
    if (!file) return
    setErr(''); setMsg(''); setBusy(true)
    try {
      const XLSX = await loadXLSX()
      const { PDFDocument, rgb } = await loadPdfLib()
      const ab = await readAB(file)
      const wb = XLSX.read(ab, { type:'array' })
      const ws = wb.Sheets[sheet]
      const rows = XLSX.utils.sheet_to_json(ws, { header:1 })

      const doc  = await PDFDocument.create()
      const font = await doc.embedFont('Helvetica')
      const boldFont = await doc.embedFont('Helvetica-Bold')
      const pageW = 842, pageH = 595 // landscape
      const margin = 40, colW = 110, rowH = 18, fs = 9

      let page = doc.addPage([pageW, pageH])
      let y = pageH - margin

      // Title
      page.drawText(`${file.name} — Sheet: ${sheet}`, { x: margin, y, size:11, font:boldFont, color:rgb(0.1,0.1,0.1) })
      y -= 24

      for (let r = 0; r < rows.length; r++) {
        if (y < margin + rowH) { page = doc.addPage([pageW, pageH]); y = pageH - margin }
        const row = rows[r]
        const isHeader = r === 0
        // Row background
        if (isHeader) page.drawRectangle({ x:margin, y:y-4, width:pageW-margin*2, height:rowH, color:rgb(0.05,0.12,0.18) })
        if (!isHeader && r%2===0) page.drawRectangle({ x:margin, y:y-4, width:pageW-margin*2, height:rowH, color:rgb(0.04,0.07,0.1) })
        const cols = Math.min(row?.length||0, Math.floor((pageW-margin*2)/colW))
        for (let c = 0; c < cols; c++) {
          const cell = String(row[c] ?? '')
          const x = margin + c * colW
          if (cell) page.drawText(cell.slice(0,14), {
            x: x+4, y: y+2, size:fs,
            font: isHeader ? boldFont : font,
            color: isHeader ? rgb(0,1,0.53) : rgb(0.7,0.8,0.9)
          })
        }
        y -= rowH
      }

      const bytes = await doc.save()
      downloadBlob(new Blob([bytes],{type:'application/pdf'}), file.name.replace(/\.xlsx?/,`_${sheet}.pdf`))
      setMsg(`✅ Converted sheet "${sheet}" · ${rows.length} rows`)
    } catch(e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  return (
    <div>
      <DropZone accept=".xlsx,.xls,.xlsm" onFiles={loadFile} label="Drop Excel file to convert to PDF" />
      {file && (
        <div style={{ marginTop:16 }}>
          <FileBadge file={file} />
          {sheets.length > 1 && (
            <div style={{ marginTop:12 }}>
              <label style={S.label}>SELECT SHEET</label>
              <div style={{ width: 240 }}>
                <Select value={sheet} onChange={setSheet} options={sheets.map(s => [s, s])} />
              </div>
            </div>
          )}
          <button onClick={convert} disabled={busy} style={{ ...S.btn, marginTop:12 }}>{busy ? 'CONVERTING...' : '⬇️ CONVERT TO PDF'}</button>
        </div>
      )}
      {err && <div style={S.err}>? {err}</div>}
      {msg && <div style={S.success}>{msg}</div>}
    </div>
  )
}

// -- CSV ? PDF -----------------------------------------------------
function CSVToPDF() {
  const [file, setFile] = useState(null)
  const [csv, setCsv]   = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr]   = useState('')
  const [msg, setMsg]   = useState('')

  const loadFile = async ([f]) => { setFile(f); setCsv(await readText(f)) }

  const convert = async () => {
    const data = csv.trim()
    if (!data) return setErr('Upload or paste CSV first')
    setErr(''); setMsg(''); setBusy(true)
    try {
      const { PDFDocument, rgb } = await loadPdfLib()
      const rows = data.split('\n').map(r => r.split(',').map(c => c.replace(/^"|"$/g,'')))
      const doc  = await PDFDocument.create()
      const font = await doc.embedFont('Helvetica')
      const boldFont = await doc.embedFont('Helvetica-Bold')
      const pageW = 842, pageH = 595, margin = 40
      const cols  = Math.max(...rows.map(r=>r.length))
      const colW  = Math.min(120, (pageW - margin*2) / cols)
      const rowH  = 16, fs = 8

      let page = doc.addPage([pageW, pageH])
      let y = pageH - margin

      for (let r = 0; r < rows.length; r++) {
        if (y < margin + rowH) { page = doc.addPage([pageW, pageH]); y = pageH - margin }
        const row = rows[r]
        const isHeader = r === 0
        if (isHeader) page.drawRectangle({ x:margin, y:y-2, width:pageW-margin*2, height:rowH, color:rgb(0.05,0.12,0.2) })
        if (!isHeader && r%2===0) page.drawRectangle({ x:margin, y:y-2, width:pageW-margin*2, height:rowH, color:rgb(0.03,0.06,0.09) })
        row.slice(0, Math.floor((pageW-margin*2)/colW)).forEach((cell, c) => {
          if (cell.trim()) page.drawText(cell.trim().slice(0,15), {
            x: margin + c*colW + 3, y: y+2, size: fs,
            font: isHeader ? boldFont : font,
            color: isHeader ? rgb(0,1,0.53) : rgb(0.7,0.82,0.92)
          })
        })
        y -= rowH
      }

      const bytes = await doc.save()
      const name = file ? file.name.replace('.csv','.pdf') : 'data.pdf'
      downloadBlob(new Blob([bytes],{type:'application/pdf'}), name)
      setMsg(`✅ Converted ${rows.length} rows to PDF`)
    } catch(e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  return (
    <div>
      <DropZone accept=".csv,.txt" onFiles={loadFile} label="Drop CSV file or paste below" />
      <div style={{ marginTop:12 }}>
        <label style={S.label}>CSV DATA</label>
        <textarea value={csv} onChange={e=>setCsv(e.target.value)} rows={6} placeholder="name,age,city&#10;Alice,30,Dubai" style={{ ...S.input, fontFamily:'var(--font-mono)', fontSize:11, resize:'vertical' }} />
      </div>
      <button onClick={convert} disabled={busy} style={{ ...S.btn, marginTop:12 }}>{busy ? 'CONVERTING...' : '⬇️ CONVERT TO PDF'}</button>
      {err && <div style={S.err}>? {err}</div>}
      {msg && <div style={S.success}>{msg}</div>}
    </div>
  )
}

// -- JPG ? PDF (single or batch) -----------------------------------
function JPGToPDF() {

export { DocxPreview, DocxToText, XlsxToCsv, CsvToXlsx, ExcelPreview, PDFToWord, PDFToExcel, WordToPDF, ExcelToPDF, CSVToPDF, HTMLToPDF }
