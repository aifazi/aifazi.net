'use client'
import React, { useState, useEffect, useRef } from 'react'
import { loadScript, downloadBlob, readText, readDataUrl, fmtBytes, DropZone, ToolHeader, FileBadge, Progress } from './sharedTools'
import { Select } from '../../core/ui.jsx'

// -- Core PDF Manipulation Tools --
function MergePDF() {
  const [files, setFiles] = useState([])
  const [busy, setBusy]   = useState(false)
  const [pct, setPct]     = useState(0)
  const [err, setErr]     = useState('')

  const remove = i => setFiles(f => f.filter((_,j) => j !== i))
  const moveUp = i => { if (i === 0) return; const a=[...files]; [a[i-1],a[i]]=[a[i],a[i-1]]; setFiles(a) }

  const merge = async () => {
    if (files.length < 2) return setErr('Add at least 2 PDF files')
    setErr(''); setBusy(true); setPct(5)
    try {
      const { PDFDocument } = await loadPdfLib()
      const merged = await PDFDocument.create()
      for (let i = 0; i < files.length; i++) {
        setPct(Math.round(10 + (i / files.length) * 80))
        const ab = await readAB(files[i])
        const doc = await PDFDocument.load(ab)
        const pages = await merged.copyPages(doc, doc.getPageIndices())
        pages.forEach(p => merged.addPage(p))
      }
      setPct(95)
      const bytes = await merged.save()
      downloadBlob(new Blob([bytes], { type:'application/pdf' }), 'merged.pdf')
      setPct(100)
    } catch(e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  return (
    <div>
      <DropZone accept=".pdf" multiple onFiles={fs => setFiles(prev => [...prev, ...fs])} label="Drop PDF files here — reorder them below" />
      {files.length > 0 && (
        <div style={{ marginTop:16 }}>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--muted)', letterSpacing:3, marginBottom:8 }}>FILES — DRAG TO REORDER (USE ? ARROWS)</div>
          {files.map((f, i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
              <span style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--muted)', width:20, textAlign:'center' }}>{i+1}</span>
              <div style={{ flex:1 }}><FileBadge file={f} onRemove={() => remove(i)} /></div>
              <button onClick={() => moveUp(i)} disabled={i===0} style={{ ...S.btnSm, background:'var(--bg3)', color: i===0 ? 'var(--muted)' : 'var(--cyan)', border:'1px solid var(--border)', padding:'6px 10px' }}>?</button>
            </div>
          ))}
          <div style={{ marginTop:16, display:'flex', gap:12 }}>
            <button onClick={merge} disabled={busy} style={S.btn}>{busy ? 'MERGING...' : '⬇️ MERGE & DOWNLOAD'}</button>
            <button onClick={() => setFiles([])} style={{ ...S.btnOut }}>CLEAR ALL</button>
          </div>
        </div>
      )}
      {busy && <Progress pct={pct} label="MERGING PDFS" />}
      {err && <div style={S.err}>? {err}</div>}
    </div>
  )
}

function SplitPDF() {
  const [file, setFile] = useState(null)
  const [pages, setPages] = useState(0)
  const [range, setRange] = useState('')
  const [busy, setBusy]  = useState(false)
  const [err, setErr]    = useState('')
  const [msg, setMsg]    = useState('')

  const loadFile = async ([f]) => {
    setFile(f); setErr(''); setMsg('')
    const { PDFDocument } = await loadPdfLib()
    const doc = await PDFDocument.load(await readAB(f))
    setPages(doc.getPageCount())
  }

  const split = async () => {
    if (!file) return setErr('Select a PDF first')
    setErr(''); setMsg(''); setBusy(true)
    try {
      const { PDFDocument } = await loadPdfLib()
      const src = await PDFDocument.load(await readAB(file))
      // Parse range: "1-3,5,7-9" ? 0-indexed
      const idx = range.split(',').flatMap(part => {
        const [a, b] = part.trim().split('-').map(n => parseInt(n.trim()) - 1)
        if (isNaN(b)) return [a]
        return Array.from({ length: b - a + 1 }, (_, i) => a + i)
      }).filter(n => !isNaN(n) && n >= 0 && n < src.getPageCount())

      if (!idx.length) throw new Error('No valid pages in range. Format: 1-3,5,7')
      const out = await PDFDocument.create()
      const copied = await out.copyPages(src, idx)
      copied.forEach(p => out.addPage(p))
      const bytes = await out.save()
      const base = file.name.replace('.pdf', '')
      downloadBlob(new Blob([bytes], { type:'application/pdf' }), `${base}_pages_${range.replace(/\s/g,'')}.pdf`)
      setMsg(`✅ Extracted ${idx.length} page(s) successfully`)
    } catch(e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  return (
    <div>
      <DropZone accept=".pdf" onFiles={loadFile} label="Drop a PDF to split" />
      {file && (
        <div style={{ marginTop:16 }}>
          <FileBadge file={file} />
          <div style={{ ...S.success, marginTop:8 }}>📝 {pages} pages detected</div>
          <div style={{ marginTop:16 }}>
            <label style={S.label}>PAGE RANGE  (e.g. 1-3,5,8-10)</label>
            <input value={range} onChange={e => setRange(e.target.value)} placeholder={`1-${Math.min(pages,3)}`} style={S.input} />
          </div>
          <button onClick={split} disabled={busy} style={{ ...S.btn, marginTop:12 }}>{busy ? 'SPLITTING...' : '⬇️ EXTRACT PAGES'}</button>
        </div>
      )}
      {err && <div style={S.err}>? {err}</div>}
      {msg && <div style={S.success}>{msg}</div>}
    </div>
  )
}

function CompressPDF() {
  const [file, setFile]  = useState(null)
  const [busy, setBusy]  = useState(false)
  const [result, setResult] = useState(null)
  const [err, setErr]    = useState('')

  const compress = async ([f]) => {
    setFile(f); setErr(''); setResult(null); setBusy(true)
    try {
      const { PDFDocument } = await loadPdfLib()
      // Load and re-save with object compression (removes redundant objects)
      const doc = await PDFDocument.load(await readAB(f), { updateMetadata: false })
      doc.setTitle(''); doc.setAuthor(''); doc.setSubject(''); doc.setKeywords([])
      doc.setProducer(''); doc.setCreator('')
      const bytes = await doc.save({ useObjectStreams: true, addDefaultPage: false })
      const blob = new Blob([bytes], { type:'application/pdf' })
      const saved = f.size - blob.size
      const pct   = Math.round((saved / f.size) * 100)
      setResult({ blob, origSize: f.size, newSize: blob.size, saved, pct, name: f.name.replace('.pdf','_compressed.pdf') })
    } catch(e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  return (
    <div>
      <DropZone accept=".pdf" onFiles={compress} label="Drop PDF to compress" />
      {busy && <Progress pct={70} label="OPTIMIZING PDF" />}
      {err && <div style={S.err}>? {err}</div>}
      {result && (
        <div style={{ ...S.panel, marginTop:16 }}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:20 }}>
            {[
              { label:'ORIGINAL SIZE', val: fmtBytes(result.origSize), color:'var(--muted)' },
              { label:'NEW SIZE',      val: fmtBytes(result.newSize),  color:'var(--cyan)' },
              { label:'SPACE SAVED',   val: result.pct > 0 ? `-${result.pct}%` : 'Already optimal', color: result.pct > 0 ? 'var(--green)' : 'var(--orange)' },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ textAlign:'center' }}>
                <div style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--muted)', letterSpacing:2, marginBottom:6 }}>{label}</div>
                <div style={{ fontFamily:'var(--font-mono)', fontSize:20, fontWeight:700, color }}>{val}</div>
              </div>
            ))}
          </div>
          {result.pct <= 0 && <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--orange)', marginBottom:12, letterSpacing:1 }}>ℹ️ This PDF is already well-optimized. For image-heavy PDFs, server-side compression yields better results.</div>}
          <button onClick={() => downloadBlob(result.blob, result.name)} style={S.btn}>⬇️ DOWNLOAD COMPRESSED PDF</button>
        </div>
      )}
    </div>
  )
}

function RotatePDF() {
  const [file, setFile]  = useState(null)
  const [pages, setPages] = useState(0)
  const [deg, setDeg]    = useState('90')
  const [target, setTarget] = useState('all')
  const [range, setRange] = useState('')
  const [busy, setBusy]  = useState(false)
  const [err, setErr]    = useState('')
  const [msg, setMsg]    = useState('')

  const loadFile = async ([f]) => {
    setFile(f); setErr(''); setMsg('')
    const { PDFDocument } = await loadPdfLib()
    const doc = await PDFDocument.load(await readAB(f))
    setPages(doc.getPageCount())
  }

  const rotate = async () => {
    if (!file) return
    setErr(''); setMsg(''); setBusy(true)
    try {
      const { PDFDocument, degrees } = await loadPdfLib()
      const doc = await PDFDocument.load(await readAB(file))
      const d = parseInt(deg)
      const idx = target === 'all'
        ? doc.getPageIndices()
        : range.split(',').flatMap(p => {
            const [a,b] = p.trim().split('-').map(n => parseInt(n)-1)
            return isNaN(b) ? [a] : Array.from({ length: b-a+1 }, (_,i) => a+i)
          }).filter(n => !isNaN(n) && n >= 0 && n < pages)
      idx.forEach(i => { const pg = doc.getPage(i); pg.setRotation(degrees((pg.getRotation().angle + d) % 360)) })
      const bytes = await doc.save()
      downloadBlob(new Blob([bytes],{type:'application/pdf'}), file.name.replace('.pdf','_rotated.pdf'))
      setMsg(`✅ Rotated ${idx.length} page(s) by ${d}°`)
    } catch(e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  return (
    <div>
      <DropZone accept=".pdf" onFiles={loadFile} label="Drop PDF to rotate" />
      {file && (
        <div style={{ marginTop:16 }}>
          <FileBadge file={file} />
          <div style={{ ...S.success, marginTop:8 }}>📝 {pages} pages</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginTop:16 }}>
            <div>
              <label style={S.label}>ROTATION ANGLE</label>
              <Select value={deg} onChange={setDeg}
                options={['90','180','270'].map(d => [d, `Rotate ${d}° clockwise`])} />
            </div>
            <div>
              <label style={S.label}>APPLY TO</label>
              <Select value={target} onChange={setTarget}
                options={[['all', 'All pages'], ['range', 'Page range']]} />
            </div>
          </div>
          {target === 'range' && (
            <div style={{ marginTop:12 }}>
              <label style={S.label}>PAGE RANGE  (e.g. 1-3,5)</label>
              <input value={range} onChange={e => setRange(e.target.value)} placeholder="1-3,5" style={S.input} />
            </div>
          )}
          <button onClick={rotate} disabled={busy} style={{ ...S.btn, marginTop:16 }}>{busy ? 'ROTATING...' : '⬇️ ROTATE & DOWNLOAD'}</button>
        </div>
      )}
      {err && <div style={S.err}>? {err}</div>}
      {msg && <div style={S.success}>{msg}</div>}
    </div>
  )
}


function RemovePages() {
  const [file, setFile]  = useState(null)
  const [pages, setPages] = useState(0)
  const [range, setRange] = useState('')
  const [busy, setBusy]  = useState(false)
  const [err, setErr]    = useState('')
  const [msg, setMsg]    = useState('')

  const loadFile = async ([f]) => {
    setFile(f); setErr(''); setMsg('')
    const { PDFDocument } = await loadPdfLib()
    const doc = await PDFDocument.load(await readAB(f))
    setPages(doc.getPageCount())
  }

  const remove = async () => {
    if (!file || !range.trim()) return setErr('Enter pages to remove')
    setErr(''); setMsg(''); setBusy(true)
    try {
      const { PDFDocument } = await loadPdfLib()
      const doc = await PDFDocument.load(await readAB(file))
      const toRemove = new Set(
        range.split(',').flatMap(p => {
          const [a,b] = p.trim().split('-').map(n => parseInt(n)-1)
          return isNaN(b) ? [a] : Array.from({length:b-a+1},(_,i)=>a+i)
        }).filter(n => !isNaN(n) && n >= 0 && n < pages)
      )
      const keep = doc.getPageIndices().filter(i => !toRemove.has(i))
      const out  = await PDFDocument.create()
      const copied = await out.copyPages(doc, keep)
      copied.forEach(p => out.addPage(p))
      const bytes = await out.save()
      downloadBlob(new Blob([bytes],{type:'application/pdf'}), file.name.replace('.pdf','_trimmed.pdf'))
      setMsg(`✅ Removed ${toRemove.size} page(s). ${keep.length} page(s) remaining.`)
    } catch(e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  return (
    <div>
      <DropZone accept=".pdf" onFiles={loadFile} label="Drop PDF to remove pages from" />
      {file && (
        <div style={{ marginTop:16 }}>
          <FileBadge file={file} />
          <div style={{ ...S.success, marginTop:8 }}>📝 {pages} pages detected</div>
          <div style={{ marginTop:16 }}>
            <label style={S.label}>PAGES TO REMOVE  (e.g. 1,3,5-8)</label>
            <input value={range} onChange={e => setRange(e.target.value)} placeholder="1,3,5-8" style={S.input} />
          </div>
          <button onClick={remove} disabled={busy} style={{ ...S.btn, marginTop:12 }}>{busy ? 'PROCESSING...' : '⬇️ REMOVE & DOWNLOAD'}</button>
        </div>
      )}
      {err && <div style={S.err}>? {err}</div>}
      {msg && <div style={S.success}>{msg}</div>}
    </div>
  )
}

function WatermarkPDF() {
  const [file, setFile]  = useState(null)
  const [text, setText]  = useState('CONFIDENTIAL')
  const [opacity, setOpacity] = useState('0.15')
  const [size, setSize]  = useState('60')
  const [busy, setBusy]  = useState(false)
  const [err, setErr]    = useState('')
  const [msg, setMsg]    = useState('')

  const apply = async () => {
    if (!file || !text.trim()) return setErr('Upload a PDF and enter watermark text')
    setErr(''); setMsg(''); setBusy(true)
    try {
      const { PDFDocument, rgb, degrees } = await loadPdfLib()
      const doc = await PDFDocument.load(await readAB(file))
      const helvetica = await doc.embedFont('Helvetica')
      const fontSize  = parseInt(size) || 60
      const op        = parseFloat(opacity) || 0.15
      doc.getPages().forEach(pg => {
        const { width, height } = pg.getSize()
        pg.drawText(text, {
          x: width / 2 - (text.length * fontSize * 0.3),
          y: height / 2,
          size: fontSize, font: helvetica,
          color: rgb(0.5, 0.5, 0.5),
          opacity: op, rotate: degrees(45),
        })
      })
      const bytes = await doc.save()
      downloadBlob(new Blob([bytes],{type:'application/pdf'}), file.name.replace('.pdf','_watermarked.pdf'))
      setMsg('✅ Watermark applied successfully')
    } catch(e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  return (
    <div>
      <DropZone accept=".pdf" onFiles={([f]) => { setFile(f); setErr(''); setMsg('') }} label="Drop PDF to add watermark" />
      {file && (
        <div style={{ marginTop:16 }}>
          <FileBadge file={file} />
          <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr', gap:12, marginTop:16 }}>
            <div>
              <label style={S.label}>WATERMARK TEXT</label>
              <input value={text} onChange={e => setText(e.target.value)} placeholder="CONFIDENTIAL" style={S.input} />
            </div>
            <div>
              <label style={S.label}>FONT SIZE</label>
              <input type="number" value={size} onChange={e => setSize(e.target.value)} min="20" max="120" style={S.input} />
            </div>
            <div>
              <label style={S.label}>OPACITY (0–1)</label>
              <input type="number" value={opacity} onChange={e => setOpacity(e.target.value)} min="0.05" max="1" step="0.05" style={S.input} />
            </div>
          </div>
          <button onClick={apply} disabled={busy} style={{ ...S.btn, marginTop:16 }}>{busy ? 'APPLYING...' : '⬇️ ADD WATERMARK'}</button>
        </div>
      )}
      {err && <div style={S.err}>? {err}</div>}
      {msg && <div style={S.success}>{msg}</div>}
    </div>
  )
}

function PageNumbersPDF() {
  const [file, setFile]  = useState(null)
  const [start, setStart] = useState('1')
  const [pos, setPos]    = useState('bottom-center')
  const [busy, setBusy]  = useState(false)
  const [err, setErr]    = useState('')
  const [msg, setMsg]    = useState('')

  const apply = async () => {
    if (!file) return
    setErr(''); setMsg(''); setBusy(true)
    try {
      const { PDFDocument, rgb } = await loadPdfLib()
      const doc = await PDFDocument.load(await readAB(file))
      const font = await doc.embedFont('Helvetica')
      const startNum = parseInt(start) || 1
      doc.getPages().forEach((pg, i) => {
        const { width, height } = pg.getSize()
        const label = String(startNum + i)
        const tw    = font.widthOfTextAtSize(label, 11)
        const positions = {
          'bottom-center': { x: width/2 - tw/2, y: 20 },
          'bottom-right':  { x: width - tw - 20, y: 20 },
          'bottom-left':   { x: 20, y: 20 },
          'top-center':    { x: width/2 - tw/2, y: height - 30 },
        }
        const { x, y } = positions[pos] || positions['bottom-center']
        pg.drawText(label, { x, y, size: 11, font, color: rgb(0.3, 0.3, 0.3) })
      })
      const bytes = await doc.save()
      downloadBlob(new Blob([bytes],{type:'application/pdf'}), file.name.replace('.pdf','_numbered.pdf'))
      setMsg('✅ Page numbers added successfully')
    } catch(e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  return (
    <div>
      <DropZone accept=".pdf" onFiles={([f]) => { setFile(f); setErr(''); setMsg('') }} label="Drop PDF to add page numbers" />
      {file && (
        <div style={{ marginTop:16 }}>
          <FileBadge file={file} />
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginTop:16 }}>
            <div>
              <label style={S.label}>START NUMBER</label>
              <input type="number" value={start} onChange={e => setStart(e.target.value)} min="1" style={S.input} />
            </div>
            <div>
              <label style={S.label}>POSITION</label>
              <Select value={pos} onChange={setPos}
                options={[
                  ['bottom-center', 'Bottom Center'],
                  ['bottom-right', 'Bottom Right'],
                  ['bottom-left', 'Bottom Left'],
                  ['top-center', 'Top Center'],
                ]} />
            </div>
          </div>
          <button onClick={apply} disabled={busy} style={{ ...S.btn, marginTop:16 }}>{busy ? 'ADDING...' : '⬇️ ADD PAGE NUMBERS'}</button>
        </div>
      )}
      {err && <div style={S.err}>? {err}</div>}
      {msg && <div style={S.success}>{msg}</div>}
    </div>
  )
}

function ImagesToPDF() {
  const [files, setFiles] = useState([])
  const [busy, setBusy]   = useState(false)
  const [pct, setPct]     = useState(0)
  const [err, setErr]     = useState('')

  const convert = async () => {
    if (!files.length) return setErr('Add at least one image')
    setErr(''); setBusy(true); setPct(5)
    try {
      const { PDFDocument } = await loadPdfLib()
      const doc = await PDFDocument.create()
      for (let i = 0; i < files.length; i++) {
        setPct(Math.round(10 + (i / files.length) * 85))
        const ab   = await readAB(files[i])
        const mime = files[i].type
        const img  = mime === 'image/png'
          ? await doc.embedPng(ab)
          : await doc.embedJpg(ab)
        const pg = doc.addPage([img.width, img.height])
        pg.drawImage(img, { x:0, y:0, width:img.width, height:img.height })
      }
      setPct(97)
      const bytes = await doc.save()
      downloadBlob(new Blob([bytes],{type:'application/pdf'}), 'images_to_pdf.pdf')
      setPct(100)
    } catch(e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  return (
    <div>
      <DropZone accept="image/png,image/jpeg,image/jpg" multiple onFiles={fs => setFiles(p => [...p, ...fs])} label="Drop JPG or PNG images" />
      {files.length > 0 && (
        <div style={{ marginTop:16 }}>
          {files.map((f,i) => <FileBadge key={i} file={f} onRemove={() => setFiles(p => p.filter((_,j) => j!==i))} />)}
          <div style={{ display:'flex', gap:12, marginTop:12 }}>
            <button onClick={convert} disabled={busy} style={S.btn}>{busy ? 'CONVERTING...' : '⬇️ IMAGES → PDF'}</button>
            <button onClick={() => setFiles([])} style={S.btnOut}>CLEAR</button>
          </div>
        </div>
      )}
      {busy && <Progress pct={pct} label="BUILDING PDF" />}
      {err && <div style={S.err}>? {err}</div>}
    </div>
  )
}

function PDFToImages() {
  const [file, setFile]   = useState(null)
  const [pages, setPages] = useState(0)
  const [scale, setScale] = useState('2')
  const [busy, setBusy]   = useState(false)
  const [pct, setPct]     = useState(0)
  const [err, setErr]     = useState('')
  const [msg, setMsg]     = useState('')

  const loadFile = async ([f]) => {
    setFile(f); setErr(''); setMsg('')
    const lib = await loadPdfJs()
    const ab  = await readAB(f)
    const pdf = await lib.getDocument({ data: new Uint8Array(ab) }).promise
    setPages(pdf.numPages)
  }

  const convert = async () => {
    if (!file) return
    setErr(''); setMsg(''); setBusy(true); setPct(0)
    try {
      const lib = await loadPdfJs()
      const ab  = await readAB(file)
      const pdf = await lib.getDocument({ data: new Uint8Array(ab) }).promise
      const sc  = parseFloat(scale) || 2
      for (let i = 1; i <= pdf.numPages; i++) {
        setPct(Math.round((i / pdf.numPages) * 100))
        const page     = await pdf.getPage(i)
        const viewport = page.getViewport({ scale: sc })
        const canvas   = document.createElement('canvas')
        canvas.width   = viewport.width; canvas.height = viewport.height
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
        await new Promise(res => canvas.toBlob(blob => { downloadBlob(blob, `page_${i}.png`); setTimeout(res, 100) }, 'image/png'))
      }
      setMsg(`✅ Downloaded ${pdf.numPages} image(s)`)
    } catch(e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  return (
    <div>
      <DropZone accept=".pdf" onFiles={loadFile} label="Drop PDF to extract pages as images" />
      {file && (
        <div style={{ marginTop:16 }}>
          <FileBadge file={file} />
          <div style={{ ...S.success, marginTop:8 }}>📝 {pages} pages · each page ⬇️ PNG download</div>
          <div style={{ marginTop:16 }}>
            <label style={S.label}>SCALE FACTOR  (2x = high quality)</label>
            <div style={{ width: 240 }}>
              <Select value={scale} onChange={setScale}
                options={[
                  ['1', '1x - Screen quality'],
                  ['2', '2x - High quality (recommended)'],
                  ['3', '3x - Print quality (slow)'],
                ]} />
            </div>
          </div>
          <button onClick={convert} disabled={busy} style={{ ...S.btn, marginTop:16 }}>{busy ? `CONVERTING... ${pct}%` : '⬇️ EXPORT ALL AS PNG'}</button>
        </div>
      )}
      {busy && <Progress pct={pct} label={`RENDERING PAGE`} />}
      {err && <div style={S.err}>? {err}</div>}
      {msg && <div style={S.success}>{msg}</div>}
    </div>
  )
}


// -------------------------------------------------------------------
// WORD / DOCX TOOLS
// -------------------------------------------------------------------


// -- Advanced PDF Tools --
function ProtectPDF() {
  const [file, setFile] = useState(null)
  const [pass, setPass] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr]   = useState('')
  const [msg, setMsg]   = useState('')

  const protect = async () => {
    if (!file) return setErr('Select a PDF first')
    if (!pass.trim()) return setErr('Enter a password')
    setErr(''); setMsg(''); setBusy(true)
    try {
      const { PDFDocument } = await loadPdfLib()
      const doc = await PDFDocument.load(await readAB(file))
      // pdf-lib supports user/owner password encryption
      const bytes = await doc.save({
        userPassword: pass,
        ownerPassword: pass + '_owner',
        permissions: {
          printing: 'lowResolution',
          modifying: false,
          copying: false,
          annotating: false,
          fillingForms: false,
          contentAccessibility: false,
          documentAssembly: false,
        },
      })
      downloadBlob(new Blob([bytes], { type:'application/pdf' }), file.name.replace('.pdf','_protected.pdf'))
      setMsg('🔒 PDF protected with password')
    } catch(e) { setErr('Encryption failed: ' + e.message) }
    finally { setBusy(false) }
  }

  return (
    <div>
      <DropZone accept=".pdf" onFiles={([f]) => { setFile(f); setErr(''); setMsg('') }} label="Drop PDF to protect" />
      {file && (
        <div style={{ marginTop:16 }}>
          <FileBadge file={file} />
          <div style={{ marginTop:16 }}>
            <label style={S.label}>PASSWORD</label>
            <input type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder="Enter a strong password" style={S.input} />
          </div>
          <button onClick={protect} disabled={busy} style={{ ...S.btn, marginTop:12 }}>{busy ? 'ENCRYPTING...' : '⬇️ PROTECT & DOWNLOAD'}</button>
        </div>
      )}
      {err && <div style={S.err}>? {err}</div>}
      {msg && <div style={S.success}>{msg}</div>}
    </div>
  )
}

// -- Unlock PDF (remove restrictions) -----------------------------
function UnlockPDF() {
  const [file, setFile] = useState(null)
  const [pass, setPass] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr]   = useState('')
  const [msg, setMsg]   = useState('')

  const unlock = async () => {
    if (!file) return setErr('Select a PDF first')
    setErr(''); setMsg(''); setBusy(true)
    try {
      const { PDFDocument } = await loadPdfLib()
      const ab = await readAB(file)
      const doc = await PDFDocument.load(ab, { password: pass || undefined, ignoreEncryption: !pass })
      const bytes = await doc.save()
      downloadBlob(new Blob([bytes], { type:'application/pdf' }), file.name.replace('.pdf','_unlocked.pdf'))
      setMsg('🔓 PDF unlocked · restrictions removed')
    } catch(e) {
      if (e.message?.includes('password')) setErr('Wrong password. Try entering the correct password below.')
      else setErr(e.message)
    }
    finally { setBusy(false) }
  }

  return (
    <div>
      <div style={{ ...S.panel, padding:'12px 16px', marginBottom:16 }}>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--orange)', letterSpacing:2 }}>
          ? Only works on PDFs where you know the password or that are protected with restrictions only (no user password). Do not use to bypass security you don't own.
        </div>
      </div>
      <DropZone accept=".pdf" onFiles={([f]) => { setFile(f); setErr(''); setMsg('') }} label="Drop protected PDF to unlock" />
      {file && (
        <div style={{ marginTop:16 }}>
          <FileBadge file={file} />
          <div style={{ marginTop:16 }}>
            <label style={S.label}>PASSWORD (if required)</label>
            <input type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder="Leave blank if no user password" style={S.input} />
          </div>
          <button onClick={unlock} disabled={busy} style={{ ...S.btn, marginTop:12 }}>{busy ? 'UNLOCKING...' : '⬇️ UNLOCK & DOWNLOAD'}</button>
        </div>
      )}
      {err && <div style={S.err}>? {err}</div>}
      {msg && <div style={S.success}>{msg}</div>}
    </div>
  )
}

// -- Organize PDF (reorder pages) ----------------------------------
function OrganizePDF() {
  const [file, setFile]   = useState(null)
  const [order, setOrder] = useState([])  // array of page indices (0-based)
  const [busy, setBusy]   = useState(false)
  const [err, setErr]     = useState('')
  const [msg, setMsg]     = useState('')

  const loadFile = async ([f]) => {
    setFile(f); setErr(''); setMsg('')
    const { PDFDocument } = await loadPdfLib()
    const doc = await PDFDocument.load(await readAB(f))
    setOrder(doc.getPageIndices())
  }

  const moveUp   = i => { if (i === 0) return; const a=[...order]; [a[i-1],a[i]]=[a[i],a[i-1]]; setOrder(a) }
  const moveDown = i => { if (i===order.length-1) return; const a=[...order]; [a[i],a[i+1]]=[a[i+1],a[i]]; setOrder(a) }
  const remove   = i => setOrder(o => o.filter((_,j)=>j!==i))

  const apply = async () => {
    if (!file || !order.length) return
    setErr(''); setMsg(''); setBusy(true)
    try {
      const { PDFDocument } = await loadPdfLib()
      const src = await PDFDocument.load(await readAB(file))
      const out = await PDFDocument.create()
      const pages = await out.copyPages(src, order)
      pages.forEach(p => out.addPage(p))
      const bytes = await out.save()
      downloadBlob(new Blob([bytes],{type:'application/pdf'}), file.name.replace('.pdf','_organized.pdf'))
      setMsg(`✅ Saved with ${order.length} pages in new order`)
    } catch(e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  return (
    <div>
      <DropZone accept=".pdf" onFiles={loadFile} label="Drop PDF to organize pages" />
      {file && order.length > 0 && (
        <div style={{ marginTop:16 }}>
          <FileBadge file={file} />
          <div style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--muted)', letterSpacing:2, margin:'16px 0 8px' }}>
            PAGES · DRAG TO REORDER · 🗑️ TO DELETE
          </div>
          <div style={{ maxHeight:360, overflowY:'auto', border:'1px solid var(--border)', padding:8 }}>
            {order.map((pageIdx, i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 8px', background: i%2===0?'var(--bg3)':'transparent', marginBottom:2 }}>
                <span style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--muted)', width:28 }}>pg {pageIdx+1}</span>
                <span style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--text)', flex:1 }}>#{}: Position {i+1}</span>
                <button onClick={() => moveUp(i)}   style={{ ...S.btnSm, background:'var(--bg3)', color:'var(--cyan)',  border:'1px solid var(--border)', padding:'4px 9px', fontSize:12 }}>?</button>
                <button onClick={() => moveDown(i)} style={{ ...S.btnSm, background:'var(--bg3)', color:'var(--cyan)',  border:'1px solid var(--border)', padding:'4px 9px', fontSize:12 }}>?</button>
                <button onClick={() => remove(i)}   style={{ ...S.btnSm, background:'transparent', color:'var(--red)', border:'1px solid rgba(255,71,87,.3)', padding:'4px 9px', fontSize:12 }}>?</button>
              </div>
            ))}
          </div>
          <div style={{ display:'flex', gap:12, marginTop:16 }}>
            <button onClick={apply} disabled={busy} style={S.btn}>{busy ? 'SAVING...' : '💾 SAVE ORGANIZED PDF'}</button>
            <button onClick={() => setOrder(order => [...order].sort((a,b)=>a-b))} style={S.btnOut}>RESET ORDER</button>
          </div>
        </div>
      )}
      {err && <div style={S.err}>? {err}</div>}
      {msg && <div style={S.success}>{msg}</div>}
    </div>
  )
}

// -- Crop PDF (set page margins) -----------------------------------
function CropPDF() {
  const [file, setFile]  = useState(null)
  const [pages, setPages] = useState(0)
  const [margins, setMargins] = useState({ top:0, right:0, bottom:0, left:0 })
  const [busy, setBusy]  = useState(false)
  const [err, setErr]    = useState('')
  const [msg, setMsg]    = useState('')

  const loadFile = async ([f]) => {
    setFile(f); setErr(''); setMsg('')
    const { PDFDocument } = await loadPdfLib()
    const doc = await PDFDocument.load(await readAB(f))
    setPages(doc.getPageCount())
  }

  const crop = async () => {
    if (!file) return
    setErr(''); setMsg(''); setBusy(true)
    try {
      const { PDFDocument } = await loadPdfLib()
      const doc = await PDFDocument.load(await readAB(file))
      doc.getPages().forEach(pg => {
        const { width, height } = pg.getSize()
        const t = Number(margins.top), r = Number(margins.right)
        const b = Number(margins.bottom), l = Number(margins.left)
        pg.setCropBox(l, b, width - l - r, height - t - b)
      })
      const bytes = await doc.save()
      downloadBlob(new Blob([bytes],{type:'application/pdf'}), file.name.replace('.pdf','_cropped.pdf'))
      setMsg('✅ Crop applied to all pages')
    } catch(e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  const M = ({side}) => (
    <div>
      <label style={S.label}>{side.toUpperCase()} (pt)</label>
      <input type="number" value={margins[side]} onChange={e => setMargins(m=>({...m,[side]:e.target.value}))} min="0" style={S.input} />
    </div>
  )

  return (
    <div>
      <DropZone accept=".pdf" onFiles={loadFile} label="Drop PDF to crop margins" />
      {file && (
        <div style={{ marginTop:16 }}>
          <FileBadge file={file} />
          <div style={{ ...S.success, marginTop:8 }}>📝 {pages} pages · 1 pt ≈ 0.35mm</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:12, marginTop:16 }}>
            {['top','right','bottom','left'].map(s => <M key={s} side={s} />)}
          </div>
          <button onClick={crop} disabled={busy} style={{ ...S.btn, marginTop:16 }}>{busy ? 'CROPPING...' : '⬇️ CROP & DOWNLOAD'}</button>
        </div>
      )}
      {err && <div style={S.err}>? {err}</div>}
      {msg && <div style={S.success}>{msg}</div>}
    </div>
  )
}

// -- PDF Metadata Editor -------------------------------------------
function EditPDFMeta() {
  const [file, setFile]  = useState(null)
  const [meta, setMeta]  = useState({ title:'', author:'', subject:'', keywords:'' })
  const [busy, setBusy]  = useState(false)
  const [err, setErr]    = useState('')
  const [msg, setMsg]    = useState('')

  const loadFile = async ([f]) => {
    setFile(f); setErr(''); setMsg('')
    try {
      const { PDFDocument } = await loadPdfLib()
      const doc = await PDFDocument.load(await readAB(f))
      setMeta({
        title:    doc.getTitle()    || '',
        author:   doc.getAuthor()   || '',
        subject:  doc.getSubject()  || '',
        keywords: doc.getKeywords() || '',
      })
    } catch(e) { setErr(e.message) }
  }

  const save = async () => {
    if (!file) return
    setErr(''); setMsg(''); setBusy(true)
    try {
      const { PDFDocument } = await loadPdfLib()
      const doc = await PDFDocument.load(await readAB(file))
      doc.setTitle(meta.title)
      doc.setAuthor(meta.author)
      doc.setSubject(meta.subject)
      doc.setKeywords(meta.keywords.split(',').map(k=>k.trim()))
      const bytes = await doc.save()
      downloadBlob(new Blob([bytes],{type:'application/pdf'}), file.name.replace('.pdf','_edited.pdf'))
      setMsg('✅ Metadata updated and saved')
    } catch(e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  return (
    <div>
      <DropZone accept=".pdf" onFiles={loadFile} label="Drop PDF to edit metadata" />
      {file && (
        <div style={{ marginTop:16 }}>
          <FileBadge file={file} />
          <div style={{ display:'flex', flexDirection:'column', gap:12, marginTop:16 }}>
            {[['title','TITLE'],['author','AUTHOR'],['subject','SUBJECT'],['keywords','KEYWORDS (comma separated)']].map(([k,l]) => (
              <div key={k}>
                <label style={S.label}>{l}</label>
                <input value={meta[k]} onChange={e => setMeta(m=>({...m,[k]:e.target.value}))} style={S.input} />
              </div>
            ))}
          </div>
          <button onClick={save} disabled={busy} style={{ ...S.btn, marginTop:16 }}>{busy ? 'SAVING...' : '💾 SAVE PDF'}</button>
        </div>
      )}
      {err && <div style={S.err}>? {err}</div>}
      {msg && <div style={S.success}>{msg}</div>}
    </div>
  )
}

// -- PDF Info / Inspector ------------------------------------------
function PDFInfo() {
  const [info, setInfo] = useState(null)
  const [err, setErr]   = useState('')
  const [busy, setBusy] = useState(false)

  const inspect = async ([f]) => {
    setErr(''); setInfo(null); setBusy(true)
    try {
      const { PDFDocument } = await loadPdfLib()
      const doc   = await PDFDocument.load(await readAB(f))
      const pages = doc.getPages()
      const first = pages[0]
      const { width, height } = first.getSize()
      setInfo({
        fileName:  f.name,
        fileSize:  fmtBytes(f.size),
        pageCount: doc.getPageCount(),
        pageSize:  `${Math.round(width)}×${Math.round(height)} pt`,
        title:     doc.getTitle()    || '—',
        author:    doc.getAuthor()   || '—',
        subject:   doc.getSubject()  || '—',
        producer:  doc.getProducer() || '—',
        creator:   doc.getCreator()  || '—',
        created:   doc.getCreationDate()?.toLocaleDateString() || '—',
        modified:  doc.getModificationDate()?.toLocaleDateString() || '—',
      })
    } catch(e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  return (
    <div>
      <DropZone accept=".pdf" onFiles={inspect} label="Drop PDF to inspect its properties" />
      {busy && <Progress pct={60} label="READING PDF" />}
      {err && <div style={S.err}>? {err}</div>}
      {info && (
        <div style={{ ...S.panel, marginTop:16 }}>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:9, letterSpacing:3, color:'var(--cyan)', marginBottom:16 }}>PDF PROPERTIES</div>
          {Object.entries(info).map(([k,v]) => (
            <div key={k} style={S.row}>
              <span style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--muted)', letterSpacing:1, textTransform:'uppercase', minWidth:120 }}>{k.replace(/([A-Z])/g,' $1').trim()}</span>
              <span style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--text)', textAlign:'right' }}>{v}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// -- Grayscale PDF -------------------------------------------------
function GrayscalePDF() {
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [pct, setPct]   = useState(0)
  const [err, setErr]   = useState('')
  const [msg, setMsg]   = useState('')

  // We render each page to canvas, desaturate, then rebuild the PDF
  const convert = async () => {
    if (!file) return
    setErr(''); setMsg(''); setBusy(true); setPct(0)
    try {
      const [{ PDFDocument }, pdfjs] = await Promise.all([loadPdfLib(), loadPdfJs()])
      const ab  = await readAB(file)
      const pdf = await pdfjs.getDocument({ data: new Uint8Array(ab) }).promise
      const out = await PDFDocument.create()

      for (let i = 1; i <= pdf.numPages; i++) {
        setPct(Math.round((i / pdf.numPages) * 95))
        const page     = await pdf.getPage(i)
        const vp       = page.getViewport({ scale: 2 })
        const canvas   = document.createElement('canvas')
        canvas.width = vp.width; canvas.height = vp.height
        const ctx = canvas.getContext('2d')
        await page.render({ canvasContext: ctx, viewport: vp }).promise

        // Desaturate
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const d = imgData.data
        for (let j = 0; j < d.length; j += 4) {
          const gray = Math.round(0.299*d[j] + 0.587*d[j+1] + 0.114*d[j+2])
          d[j] = d[j+1] = d[j+2] = gray
        }
        ctx.putImageData(imgData, 0, 0)

        const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.92)
        const jpegBytes   = Uint8Array.from(atob(jpegDataUrl.split(',')[1]), c => c.charCodeAt(0))
        const img  = await out.embedJpg(jpegBytes)
        const pg   = out.addPage([vp.width / 2, vp.height / 2])
        pg.drawImage(img, { x:0, y:0, width: vp.width/2, height: vp.height/2 })
      }

      setPct(99)
      const bytes = await out.save()
      downloadBlob(new Blob([bytes],{type:'application/pdf'}), file.name.replace('.pdf','_grayscale.pdf'))
      setMsg(`✅ Converted ${pdf.numPages} pages to grayscale`)
    } catch(e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  return (
    <div>
      <DropZone accept=".pdf" onFiles={([f]) => { setFile(f); setErr(''); setMsg('') }} label="Drop PDF to convert to grayscale" />
      {file && (
        <div style={{ marginTop:16 }}>
          <FileBadge file={file} />
          <div style={{ ...S.panel, padding:'10px 14px', marginTop:12 }}>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--orange)', letterSpacing:1 }}>
              ? Each page is rendered at 2x quality then converted · large PDFs may take a moment.
            </div>
          </div>
          <button onClick={convert} disabled={busy} style={{ ...S.btn, marginTop:12 }}>{busy ? `CONVERTING... ${pct}%` : '⬇️ CONVERT TO GRAYSCALE'}</button>
        </div>
      )}
      {busy && <Progress pct={pct} label="RENDERING PAGES" />}
      {err && <div style={S.err}>? {err}</div>}
      {msg && <div style={S.success}>{msg}</div>}
    </div>
  )
}

// -- Header/Footer Stamp -------------------------------------------
function HeaderFooterPDF() {
  const [file, setFile]  = useState(null)
  const [pages, setPages] = useState(0)
  const [header, setHeader] = useState('')
  const [footer, setFooter] = useState('')
  const [busy, setBusy]  = useState(false)
  const [err, setErr]    = useState('')
  const [msg, setMsg]    = useState('')

  const loadFile = async ([f]) => {
    setFile(f); setErr(''); setMsg('')
    const { PDFDocument } = await loadPdfLib()
    const doc = await PDFDocument.load(await readAB(f))
    setPages(doc.getPageCount())
  }

  const apply = async () => {
    if (!file) return
    if (!header.trim() && !footer.trim()) return setErr('Enter header or footer text')
    setErr(''); setMsg(''); setBusy(true)
    try {
      const { PDFDocument, rgb } = await loadPdfLib()
      const doc  = await PDFDocument.load(await readAB(file))
      const font = await doc.embedFont('Helvetica')
      doc.getPages().forEach(pg => {
        const { width, height } = pg.getSize()
        if (header.trim()) {
          const tw = font.widthOfTextAtSize(header, 10)
          pg.drawText(header, { x: width/2 - tw/2, y: height - 24, size:10, font, color: rgb(0.3,0.3,0.3) })
        }
        if (footer.trim()) {
          const tw = font.widthOfTextAtSize(footer, 10)
          pg.drawText(footer, { x: width/2 - tw/2, y: 12, size:10, font, color: rgb(0.3,0.3,0.3) })
        }
      })
      const bytes = await doc.save()
      downloadBlob(new Blob([bytes],{type:'application/pdf'}), file.name.replace('.pdf','_stamped.pdf'))
      setMsg(`✅ Header/footer added to ${pages} pages`)
    } catch(e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  return (
    <div>
      <DropZone accept=".pdf" onFiles={loadFile} label="Drop PDF to add header & footer" />
      {file && (
        <div style={{ marginTop:16 }}>
          <FileBadge file={file} />
          <div style={{ display:'flex', flexDirection:'column', gap:12, marginTop:16 }}>
            <div>
              <label style={S.label}>HEADER TEXT (centered, top)</label>
              <input value={header} onChange={e => setHeader(e.target.value)} placeholder="e.g. CONFIDENTIAL" style={S.input} />
            </div>
            <div>
              <label style={S.label}>FOOTER TEXT (centered, bottom)</label>
              <input value={footer} onChange={e => setFooter(e.target.value)} placeholder="e.g. aifazi.net" style={S.input} />
            </div>
          </div>
          <button onClick={apply} disabled={busy} style={{ ...S.btn, marginTop:16 }}>{busy ? 'APPLYING...' : '⬇️ ADD & DOWNLOAD'}</button>
        </div>
      )}
      {err && <div style={S.err}>? {err}</div>}
      {msg && <div style={S.success}>{msg}</div>}
    </div>
  )
}

// -- Flatten PDF (remove form fields) -----------------------------
function FlattenPDF() {
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr]   = useState('')
  const [msg, setMsg]   = useState('')

  const flatten = async () => {
    if (!file) return
    setErr(''); setMsg(''); setBusy(true)
    try {
      const { PDFDocument } = await loadPdfLib()
      const doc  = await PDFDocument.load(await readAB(file))
      const form = doc.getForm()
      form.flatten()
      const bytes = await doc.save()
      downloadBlob(new Blob([bytes],{type:'application/pdf'}), file.name.replace('.pdf','_flattened.pdf'))
      setMsg('✅ Form fields flattened · PDF is now a static document')
    } catch(e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  return (
    <div>
      <DropZone accept=".pdf" onFiles={([f]) => { setFile(f); setErr(''); setMsg('') }} label="Drop PDF form to flatten" />
      {file && (
        <div style={{ marginTop:16 }}>
          <FileBadge file={file} />
          <div style={{ ...S.panel, padding:'10px 14px', marginTop:12 }}>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--cyan)', letterSpacing:1 }}>
              Flattening bakes form field values into the page permanently. The result is a static, non-editable PDF.
            </div>
          </div>
          <button onClick={flatten} disabled={busy} style={{ ...S.btn, marginTop:12 }}>{busy ? 'FLATTENING...' : '⬇️ FLATTEN & DOWNLOAD'}</button>
        </div>
      )}
      {err && <div style={S.err}>? {err}</div>}
      {msg && <div style={S.success}>{msg}</div>}
    </div>
  )
}

// -- Compare Text (diff two text files) ---------------------------

// -- Sign & Repair --
function SignPDF() {
  const [file, setFile]    = useState(null)
  const [pages, setPages]  = useState(0)
  const [sigMode, setSigMode] = useState('draw') // draw | type
  const [sigText, setSigText] = useState('')
  const [sigColor, setSigColor] = useState('#000080')
  const [page, setPage]    = useState(1)
  const [pos, setPos]      = useState({ x:100, y:100 })
  const [size, setSize]    = useState(40)
  const [busy, setBusy]    = useState(false)
  const [err, setErr]      = useState('')
  const [msg, setMsg]      = useState('')
  const canvasRef = useRef()
  const [drawing, setDrawing] = useState(false)
  const lastPt = useRef(null)

  const loadFile = async ([f]) => {
    setFile(f); setErr(''); setMsg('')
    const { PDFDocument } = await loadPdfLib()
    const doc = await PDFDocument.load(await readAB(f))
    setPages(doc.getPageCount())
  }

  const startDraw = (e) => {
    setDrawing(true)
    const rect = canvasRef.current.getBoundingClientRect()
    lastPt.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }
  const draw = (e) => {
    if (!drawing || !canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const pt = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    const ctx = canvasRef.current.getContext('2d')
    ctx.strokeStyle = sigColor; ctx.lineWidth = 2; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(lastPt.current.x, lastPt.current.y)
    ctx.lineTo(pt.x, pt.y); ctx.stroke()
    lastPt.current = pt
  }
  const clearCanvas = () => {
    const ctx = canvasRef.current?.getContext('2d')
    if (ctx) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
  }

  const apply = async () => {
    if (!file) return setErr('Upload a PDF first')
    setErr(''); setMsg(''); setBusy(true)
    try {
      const { PDFDocument, rgb } = await loadPdfLib()
      const doc = await PDFDocument.load(await readAB(file))
      const pg  = doc.getPage(page - 1)
      const { height } = pg.getSize()

      if (sigMode === 'type') {
        if (!sigText.trim()) { setBusy(false); return setErr('Type your signature first') }
        const font = await doc.embedFont('Helvetica-Oblique')
        // Parse hex color
        const hx = sigColor.replace('#','')
        const r = parseInt(hx.slice(0,2),16)/255, g = parseInt(hx.slice(2,4),16)/255, b = parseInt(hx.slice(4,6),16)/255
        pg.drawText(sigText, { x: pos.x, y: height - pos.y - size, size, font, color: rgb(r,g,b) })
      } else {
        const canvas = canvasRef.current
        const dataUrl = canvas.toDataURL('image/png')
        const imgBytes = Uint8Array.from(atob(dataUrl.split(',')[1]), c => c.charCodeAt(0))
        const img = await doc.embedPng(imgBytes)
        pg.drawImage(img, { x: pos.x, y: height - pos.y - size*2, width: 200, height: size*2 })
      }

      const bytes = await doc.save()
      downloadBlob(new Blob([bytes],{type:'application/pdf'}), file.name.replace('.pdf','_signed.pdf'))
      setMsg('✅ Signature applied')
    } catch(e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  const hexToRgb = h => { const hx=h.replace('#',''); return [parseInt(hx.slice(0,2),16),parseInt(hx.slice(2,4),16),parseInt(hx.slice(4,6),16)] }

  return (
    <div>
      <DropZone accept=".pdf" onFiles={loadFile} label="Drop PDF to sign" />
      {file && (
        <div style={{ marginTop:16 }}>
          <FileBadge file={file} />
          <div style={{ ...S.success, marginTop:8 }}>📝 {pages} pages</div>

          {/* Signature mode */}
          <div style={{ display:'flex', gap:8, margin:'16px 0 12px' }}>
            {[['draw','✏️ Draw Signature'],['type','⌨️ Type Signature']].map(([v,l])=>(
              <button key={v} onClick={()=>setSigMode(v)} style={{ fontFamily:'var(--font-mono)', fontSize:10, padding:'8px 16px', background:sigMode===v?'rgba(0,255,136,.1)':'var(--bg3)', color:sigMode===v?'var(--green)':'var(--muted)', border:`1px solid ${sigMode===v?'rgba(0,255,136,.4)':'var(--border)'}`, cursor:'pointer' }}>{l}</button>
            ))}
          </div>

          {sigMode === 'draw' ? (
            <div>
              <label style={S.label}>DRAW YOUR SIGNATURE BELOW</label>
              <canvas ref={canvasRef} width={500} height={100}
                style={{ border:'1px solid var(--border)', background:'#fff', cursor:'crosshair', display:'block', maxWidth:'100%', touchAction:'none' }}
                onMouseDown={startDraw} onMouseMove={draw} onMouseUp={()=>setDrawing(false)} onMouseLeave={()=>setDrawing(false)} />
              <button onClick={clearCanvas} style={{ ...S.btnSm, background:'transparent', color:'var(--red)', border:'1px solid rgba(255,71,87,.3)', marginTop:6 }}>CLEAR</button>
            </div>
          ) : (
            <div style={{ display:'flex', gap:12, alignItems:'flex-end' }}>
              <div style={{ flex:1 }}>
                <label style={S.label}>SIGNATURE TEXT</label>
                <input value={sigText} onChange={e=>setSigText(e.target.value)} placeholder="Your Name" style={{ ...S.input, fontFamily:'cursive', fontSize:20 }} />
              </div>
              <div>
                <label style={S.label}>COLOR</label>
                <input type="color" value={sigColor} onChange={e=>setSigColor(e.target.value)} style={{ height:42, width:60, border:'1px solid var(--border)', background:'var(--bg3)', cursor:'pointer', padding:2 }} />
              </div>
            </div>
          )}

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:12, marginTop:16 }}>
            <div><label style={S.label}>PAGE</label><input type="number" value={page} onChange={e=>setPage(Math.max(1,Math.min(pages,+e.target.value)))} min={1} max={pages} style={S.input} /></div>
            <div><label style={S.label}>X POSITION</label><input type="number" value={pos.x} onChange={e=>setPos(p=>({...p,x:+e.target.value}))} style={S.input} /></div>
            <div><label style={S.label}>Y POSITION</label><input type="number" value={pos.y} onChange={e=>setPos(p=>({...p,y:+e.target.value}))} style={S.input} /></div>
            <div><label style={S.label}>SIZE</label><input type="number" value={size} onChange={e=>setSize(+e.target.value)} min={10} max={100} style={S.input} /></div>
          </div>

          <button onClick={apply} disabled={busy} style={{ ...S.btn, marginTop:16 }}>{busy ? 'SIGNING...' : '✅ APPLY SIGNATURE'}</button>
        </div>
      )}
      {err && <div style={S.err}>? {err}</div>}
      {msg && <div style={S.success}>{msg}</div>}
    </div>
  )
}

// -- Repair PDF (re-save to fix corruption) ------------------------
function RepairPDF() {
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr]   = useState('')
  const [msg, setMsg]   = useState('')

  const repair = async () => {
    if (!file) return
    setErr(''); setMsg(''); setBusy(true)
    try {
      const { PDFDocument } = await loadPdfLib()
      const doc = await PDFDocument.load(await readAB(file), { ignoreEncryption: true, throwOnInvalidObject: false })
      const bytes = await doc.save({ useObjectStreams: true })
      downloadBlob(new Blob([bytes],{type:'application/pdf'}), file.name.replace('.pdf','_repaired.pdf'))
      setMsg(`✅ PDF repaired and saved · ${fmtBytes(bytes.byteLength)}`)
    } catch(e) { setErr('Could not repair: ' + e.message) }
    finally { setBusy(false) }
  }

  return (
    <div>
      <div style={{ ...S.panel, padding:'12px 16px', marginBottom:16 }}>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--orange)', letterSpacing:1 }}>
          ? Re-parses and rebuilds the PDF structure. Fixes common corruption issues like broken cross-references, malformed objects, and truncated streams.
        </div>
      </div>
      <DropZone accept=".pdf" onFiles={([f])=>{ setFile(f); setErr(''); setMsg('') }} label="Drop corrupted PDF to repair" />
      {file && (
        <div style={{ marginTop:16 }}>
          <FileBadge file={file} />
          <button onClick={repair} disabled={busy} style={{ ...S.btn, marginTop:12 }}>{busy ? 'REPAIRING...' : '⬇️ REPAIR & DOWNLOAD'}</button>
        </div>
      )}
      {err && <div style={S.err}>? {err}</div>}
      {msg && <div style={S.success}>{msg}</div>}
    </div>
  )
}

// -------------------------------------------------------------------
// TOOLS CONFIG + MAIN PAGE
// -------------------------------------------------------------------


export {
  MergePDF, SplitPDF, CompressPDF, RotatePDF, RemovePages, WatermarkPDF,
  PageNumbersPDF, ImagesToPDF, PDFToImages, ProtectPDF, UnlockPDF,
  OrganizePDF, CropPDF, EditPDFMeta, PDFInfo, GrayscalePDF,
  HeaderFooterPDF, FlattenPDF, SignPDF, RepairPDF
}
