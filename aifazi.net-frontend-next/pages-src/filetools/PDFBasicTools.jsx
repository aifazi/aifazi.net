'use client'
import { useState, useRef } from 'react'
import { loadPdfLib, loadPdfJs, readAB, downloadBlob, fmtBytes, S, DropZone, FileBadge, Progress } from './shared.jsx'
import { Select } from '../../core/ui.jsx'

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
          <div style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--muted)', letterSpacing:3, marginBottom:8 }}>FILES — DRAG TO REORDER (USE ↑ ARROWS)</div>
          {files.map((f, i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
              <span style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--muted)', width:20, textAlign:'center' }}>{i+1}</span>
              <div style={{ flex:1 }}><FileBadge file={f} onRemove={() => remove(i)} /></div>
              <button onClick={() => moveUp(i)} disabled={i===0} style={{ ...S.btnSm, background:'var(--bg3)', color: i===0 ? 'var(--muted)' : 'var(--cyan)', border:'1px solid var(--border)', padding:'6px 10px' }}>↑</button>
            </div>
          ))}
          <div style={{ marginTop:16, display:'flex', gap:12 }}>
            <button onClick={merge} disabled={busy} style={S.btn}>{busy ? 'MERGING...' : '⬇ MERGE & DOWNLOAD'}</button>
            <button onClick={() => setFiles([])} style={{ ...S.btnOut }}>CLEAR ALL</button>
          </div>
        </div>
      )}
      {busy && <Progress pct={pct} label="MERGING PDFS" />}
      {err && <div style={S.err}>⚠ {err}</div>}
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
      // Parse range: "1-3,5,7-9" → 0-indexed
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
      setMsg(`✓ Extracted ${idx.length} page(s) successfully`)
    } catch(e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  return (
    <div>
      <DropZone accept=".pdf" onFiles={loadFile} label="Drop a PDF to split" />
      {file && (
        <div style={{ marginTop:16 }}>
          <FileBadge file={file} />
          <div style={{ ...S.success, marginTop:8 }}>📄 {pages} pages detected</div>
          <div style={{ marginTop:16 }}>
            <label style={S.label}>PAGE RANGE  (e.g. 1-3,5,8-10)</label>
            <input value={range} onChange={e => setRange(e.target.value)} placeholder={`1-${Math.min(pages,3)}`} style={S.input} />
          </div>
          <button onClick={split} disabled={busy} style={{ ...S.btn, marginTop:12 }}>{busy ? 'SPLITTING...' : '⬇ EXTRACT PAGES'}</button>
        </div>
      )}
      {err && <div style={S.err}>⚠ {err}</div>}
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
      {err && <div style={S.err}>⚠ {err}</div>}
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
          {result.pct <= 0 && <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--orange)', marginBottom:12, letterSpacing:1 }}>⚠ This PDF is already well-optimized. For image-heavy PDFs, server-side compression yields better results.</div>}
          <button onClick={() => downloadBlob(result.blob, result.name)} style={S.btn}>⬇ DOWNLOAD COMPRESSED PDF</button>
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
      setMsg(`✓ Rotated ${idx.length} page(s) by ${d}°`)
    } catch(e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  return (
    <div>
      <DropZone accept=".pdf" onFiles={loadFile} label="Drop PDF to rotate" />
      {file && (
        <div style={{ marginTop:16 }}>
          <FileBadge file={file} />
          <div style={{ ...S.success, marginTop:8 }}>📄 {pages} pages</div>
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
          <button onClick={rotate} disabled={busy} style={{ ...S.btn, marginTop:16 }}>{busy ? 'ROTATING...' : '⬇ ROTATE & DOWNLOAD'}</button>
        </div>
      )}
      {err && <div style={S.err}>⚠ {err}</div>}
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
      setMsg(`✓ Removed ${toRemove.size} page(s). ${keep.length} page(s) remaining.`)
    } catch(e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  return (
    <div>
      <DropZone accept=".pdf" onFiles={loadFile} label="Drop PDF to remove pages from" />
      {file && (
        <div style={{ marginTop:16 }}>
          <FileBadge file={file} />
          <div style={{ ...S.success, marginTop:8 }}>📄 {pages} pages detected</div>
          <div style={{ marginTop:16 }}>
            <label style={S.label}>PAGES TO REMOVE  (e.g. 1,3,5-8)</label>
            <input value={range} onChange={e => setRange(e.target.value)} placeholder="1,3,5-8" style={S.input} />
          </div>
          <button onClick={remove} disabled={busy} style={{ ...S.btn, marginTop:12 }}>{busy ? 'PROCESSING...' : '⬇ REMOVE & DOWNLOAD'}</button>
        </div>
      )}
      {err && <div style={S.err}>⚠ {err}</div>}
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
      setMsg('✓ Watermark applied successfully')
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
          <button onClick={apply} disabled={busy} style={{ ...S.btn, marginTop:16 }}>{busy ? 'APPLYING...' : '⬇ ADD WATERMARK'}</button>
        </div>
      )}
      {err && <div style={S.err}>⚠ {err}</div>}
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
      setMsg('✓ Page numbers added successfully')
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
          <button onClick={apply} disabled={busy} style={{ ...S.btn, marginTop:16 }}>{busy ? 'ADDING...' : '⬇ ADD PAGE NUMBERS'}</button>
        </div>
      )}
      {err && <div style={S.err}>⚠ {err}</div>}
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
            <button onClick={convert} disabled={busy} style={S.btn}>{busy ? 'CONVERTING...' : '⬇ IMAGES → PDF'}</button>
            <button onClick={() => setFiles([])} style={S.btnOut}>CLEAR</button>
          </div>
        </div>
      )}
      {busy && <Progress pct={pct} label="BUILDING PDF" />}
      {err && <div style={S.err}>⚠ {err}</div>}
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
      setMsg(`✓ Downloaded ${pdf.numPages} image(s)`)
    } catch(e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  return (
    <div>
      <DropZone accept=".pdf" onFiles={loadFile} label="Drop PDF to extract pages as images" />
      {file && (
        <div style={{ marginTop:16 }}>
          <FileBadge file={file} />
          <div style={{ ...S.success, marginTop:8 }}>📄 {pages} pages — each page → PNG download</div>
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
          <button onClick={convert} disabled={busy} style={{ ...S.btn, marginTop:16 }}>{busy ? `CONVERTING... ${pct}%` : '⬇ EXPORT ALL AS PNG'}</button>
        </div>
      )}
      {busy && <Progress pct={pct} label={`RENDERING PAGE`} />}
      {err && <div style={S.err}>⚠ {err}</div>}
      {msg && <div style={S.success}>{msg}</div>}
    </div>
  )
}


// ═══════════════════════════════════════════════════════════════════
// WORD / DOCX TOOLS
// ═══════════════════════════════════════════════════════════════════

export { MergePDF, SplitPDF, CompressPDF, RotatePDF, RemovePages, WatermarkPDF, PageNumbersPDF, ImagesToPDF, PDFToImages }
