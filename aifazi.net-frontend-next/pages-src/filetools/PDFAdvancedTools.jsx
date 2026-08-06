'use client'
import { useState, useRef } from 'react'
import { loadPdfLib, loadPdfJs, loadMammoth, loadXLSX, readAB, readText, readDataUrl, downloadBlob, fmtBytes, S, DropZone, FileBadge, Progress } from './shared.jsx'
import { Select, Slider } from '../../core/ui.jsx'

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
      setMsg('âœ“ PDF protected with password')
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
          <button onClick={protect} disabled={busy} style={{ ...S.btn, marginTop:12 }}>{busy ? 'ENCRYPTING...' : 'ðŸ”’ PROTECT & DOWNLOAD'}</button>
        </div>
      )}
      {err && <div style={S.err}>âš  {err}</div>}
      {msg && <div style={S.success}>{msg}</div>}
    </div>
  )
}

// â”€â”€ Unlock PDF (remove restrictions) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
      setMsg('âœ“ PDF unlocked â€” restrictions removed')
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
          âš  Only works on PDFs where you know the password or that are protected with restrictions only (no user password). Do not use to bypass security you don't own.
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
          <button onClick={unlock} disabled={busy} style={{ ...S.btn, marginTop:12 }}>{busy ? 'UNLOCKING...' : 'ðŸ”“ UNLOCK & DOWNLOAD'}</button>
        </div>
      )}
      {err && <div style={S.err}>âš  {err}</div>}
      {msg && <div style={S.success}>{msg}</div>}
    </div>
  )
}

// â”€â”€ Organize PDF (reorder pages) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
      setMsg(`âœ“ Saved with ${order.length} pages in new order`)
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
            PAGES â€” USE â†‘â†“ TO REORDER, âœ• TO DELETE
          </div>
          <div style={{ maxHeight:360, overflowY:'auto', border:'1px solid var(--border)', padding:8 }}>
            {order.map((pageIdx, i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 8px', background: i%2===0?'var(--bg3)':'transparent', marginBottom:2 }}>
                <span style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--muted)', width:28 }}>pg {pageIdx+1}</span>
                <span style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--text)', flex:1 }}>â†’ Position {i+1}</span>
                <button onClick={() => moveUp(i)}   style={{ ...S.btnSm, background:'var(--bg3)', color:'var(--cyan)',  border:'1px solid var(--border)', padding:'4px 9px', fontSize:12 }}>â†‘</button>
                <button onClick={() => moveDown(i)} style={{ ...S.btnSm, background:'var(--bg3)', color:'var(--cyan)',  border:'1px solid var(--border)', padding:'4px 9px', fontSize:12 }}>â†“</button>
                <button onClick={() => remove(i)}   style={{ ...S.btnSm, background:'transparent', color:'var(--red)', border:'1px solid rgba(255,71,87,.3)', padding:'4px 9px', fontSize:12 }}>âœ•</button>
              </div>
            ))}
          </div>
          <div style={{ display:'flex', gap:12, marginTop:16 }}>
            <button onClick={apply} disabled={busy} style={S.btn}>{busy ? 'SAVING...' : 'â¬‡ SAVE ORGANIZED PDF'}</button>
            <button onClick={() => setOrder(order => [...order].sort((a,b)=>a-b))} style={S.btnOut}>RESET ORDER</button>
          </div>
        </div>
      )}
      {err && <div style={S.err}>âš  {err}</div>}
      {msg && <div style={S.success}>{msg}</div>}
    </div>
  )
}

// â”€â”€ Crop PDF (set page margins) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
      setMsg('âœ“ Crop applied to all pages')
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
          <div style={{ ...S.success, marginTop:8 }}>ðŸ“„ {pages} pages â€” 1 pt â‰ˆ 0.35mm</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:12, marginTop:16 }}>
            {['top','right','bottom','left'].map(s => <M key={s} side={s} />)}
          </div>
          <button onClick={crop} disabled={busy} style={{ ...S.btn, marginTop:16 }}>{busy ? 'CROPPING...' : 'â¬‡ CROP & DOWNLOAD'}</button>
        </div>
      )}
      {err && <div style={S.err}>âš  {err}</div>}
      {msg && <div style={S.success}>{msg}</div>}
    </div>
  )
}

// â”€â”€ PDF Metadata Editor â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
      setMsg('âœ“ Metadata updated and saved')
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
          <button onClick={save} disabled={busy} style={{ ...S.btn, marginTop:16 }}>{busy ? 'SAVING...' : 'â¬‡ SAVE PDF'}</button>
        </div>
      )}
      {err && <div style={S.err}>âš  {err}</div>}
      {msg && <div style={S.success}>{msg}</div>}
    </div>
  )
}

// â”€â”€ PDF Info / Inspector â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
        pageSize:  `${Math.round(width)} Ã— ${Math.round(height)} pt`,
        title:     doc.getTitle()    || 'â€”',
        author:    doc.getAuthor()   || 'â€”',
        subject:   doc.getSubject()  || 'â€”',
        producer:  doc.getProducer() || 'â€”',
        creator:   doc.getCreator()  || 'â€”',
        created:   doc.getCreationDate()?.toLocaleDateString() || 'â€”',
        modified:  doc.getModificationDate()?.toLocaleDateString() || 'â€”',
      })
    } catch(e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  return (
    <div>
      <DropZone accept=".pdf" onFiles={inspect} label="Drop PDF to inspect its properties" />
      {busy && <Progress pct={60} label="READING PDF" />}
      {err && <div style={S.err}>âš  {err}</div>}
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

// â”€â”€ Grayscale PDF â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
      setMsg(`âœ“ Converted ${pdf.numPages} pages to grayscale`)
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
              âš¡ Each page is rendered at 2Ã— quality then converted â€” large PDFs may take a moment.
            </div>
          </div>
          <button onClick={convert} disabled={busy} style={{ ...S.btn, marginTop:12 }}>{busy ? `CONVERTING... ${pct}%` : 'â¬‡ CONVERT TO GRAYSCALE'}</button>
        </div>
      )}
      {busy && <Progress pct={pct} label="RENDERING PAGES" />}
      {err && <div style={S.err}>âš  {err}</div>}
      {msg && <div style={S.success}>{msg}</div>}
    </div>
  )
}

// â”€â”€ Header/Footer Stamp â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
      setMsg(`âœ“ Header/footer added to ${pages} pages`)
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
          <button onClick={apply} disabled={busy} style={{ ...S.btn, marginTop:16 }}>{busy ? 'APPLYING...' : 'â¬‡ ADD & DOWNLOAD'}</button>
        </div>
      )}
      {err && <div style={S.err}>âš  {err}</div>}
      {msg && <div style={S.success}>{msg}</div>}
    </div>
  )
}

// â”€â”€ Flatten PDF (remove form fields) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
      setMsg('âœ“ Form fields flattened â€” PDF is now a static document')
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
          <button onClick={flatten} disabled={busy} style={{ ...S.btn, marginTop:12 }}>{busy ? 'FLATTENING...' : 'â¬‡ FLATTEN & DOWNLOAD'}</button>
        </div>
      )}
      {err && <div style={S.err}>âš  {err}</div>}
      {msg && <div style={S.success}>{msg}</div>}
    </div>
  )
}

// â”€â”€ Compare Text (diff two text files) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
      setMsg(`âœ“ Converted ${pdf.numPages} pages â€” opens in Word, LibreOffice & Google Docs`)
    } catch(e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  return (
    <div>
      <div style={{ ...S.panel, padding:'12px 16px', marginBottom:16 }}>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--orange)', letterSpacing:1 }}>
          âš¡ Extracts text from PDF and saves as RTF (Rich Text Format) â€” opens natively in Microsoft Word, LibreOffice, and Google Docs. Complex layouts with images/tables may need manual cleanup.
        </div>
      </div>
      <DropZone accept=".pdf" onFiles={([f]) => { setFile(f); setErr(''); setMsg('') }} label="Drop PDF to convert to Word" />
      {file && (
        <div style={{ marginTop:16 }}>
          <FileBadge file={file} />
          <button onClick={convert} disabled={busy} style={{ ...S.btn, marginTop:12 }}>{busy ? `CONVERTING... ${pct}%` : 'â¬‡ CONVERT TO WORD (.RTF)'}</button>
        </div>
      )}
      {busy && <Progress pct={pct} label="EXTRACTING TEXT" />}
      {err && <div style={S.err}>âš  {err}</div>}
      {msg && <div style={S.success}>{msg}</div>}
    </div>
  )
}

// â”€â”€ PDF â†’ Excel (extract tables as CSV) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
        // Sort rows topâ†’bottom, cells leftâ†’right
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
      setMsg(`âœ“ Extracted ${allRows.length} rows from ${pdf.numPages} pages`)
    } catch(e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  return (
    <div>
      <div style={{ ...S.panel, padding:'12px 16px', marginBottom:16 }}>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--orange)', letterSpacing:1 }}>
          âš¡ Extracts text content row-by-row and exports as Excel. Works best on PDFs with structured text/tables. Scanned PDFs may need OCR first.
        </div>
      </div>
      <DropZone accept=".pdf" onFiles={([f]) => { setFile(f); setErr(''); setMsg(''); setPreview([]) }} label="Drop PDF to extract data to Excel" />
      {file && (
        <div style={{ marginTop:16 }}>
          <FileBadge file={file} />
          <button onClick={convert} disabled={busy} style={{ ...S.btn, marginTop:12 }}>{busy ? `EXTRACTING... ${pct}%` : 'â¬‡ EXPORT TO EXCEL'}</button>
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
      {err && <div style={S.err}>âš  {err}</div>}
      {msg && <div style={S.success}>{msg}</div>}
    </div>
  )
}

// â”€â”€ Word â†’ PDF â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
      setMsg('âœ“ Word document converted to PDF')
    } catch(e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  return (
    <div>
      <DropZone accept=".docx" onFiles={([f]) => { setFile(f); setErr(''); setMsg('') }} label="Drop Word (.docx) to convert to PDF" />
      {file && (
        <div style={{ marginTop:16 }}>
          <FileBadge file={file} />
          <button onClick={convert} disabled={busy} style={{ ...S.btn, marginTop:12 }}>{busy ? 'CONVERTING...' : 'â¬‡ CONVERT TO PDF'}</button>
        </div>
      )}
      {err && <div style={S.err}>âš  {err}</div>}
      {msg && <div style={S.success}>{msg}</div>}
    </div>
  )
}

// â”€â”€ Excel â†’ PDF â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
      page.drawText(`${file.name} â€” Sheet: ${sheet}`, { x: margin, y, size:11, font:boldFont, color:rgb(0.1,0.1,0.1) })
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
      setMsg(`âœ“ Converted sheet "${sheet}" â€” ${rows.length} rows`)
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
          <button onClick={convert} disabled={busy} style={{ ...S.btn, marginTop:12 }}>{busy ? 'CONVERTING...' : 'â¬‡ CONVERT TO PDF'}</button>
        </div>
      )}
      {err && <div style={S.err}>âš  {err}</div>}
      {msg && <div style={S.success}>{msg}</div>}
    </div>
  )
}

// â”€â”€ CSV â†’ PDF â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
      setMsg(`âœ“ Converted ${rows.length} rows to PDF`)
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
      <button onClick={convert} disabled={busy} style={{ ...S.btn, marginTop:12 }}>{busy ? 'CONVERTING...' : 'â¬‡ CONVERT TO PDF'}</button>
      {err && <div style={S.err}>âš  {err}</div>}
      {msg && <div style={S.success}>{msg}</div>}
    </div>
  )
}

// â”€â”€ JPG â†’ PDF (single or batch) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function JPGToPDF() {
  const [files, setFiles] = useState([])
  const [busy, setBusy]   = useState(false)
  const [err, setErr]     = useState('')
  const [msg, setMsg]     = useState('')

  const convert = async () => {
    if (!files.length) return setErr('Add at least one image')
    setErr(''); setMsg(''); setBusy(true)
    try {
      const { PDFDocument } = await loadPdfLib()
      const doc = await PDFDocument.create()
      for (const f of files) {
        const ab  = await readAB(f)
        const img = f.type === 'image/png' ? await doc.embedPng(ab) : await doc.embedJpg(ab)
        const pg  = doc.addPage([img.width, img.height])
        pg.drawImage(img, { x:0, y:0, width:img.width, height:img.height })
      }
      const bytes = await doc.save()
      downloadBlob(new Blob([bytes],{type:'application/pdf'}), 'images.pdf')
      setMsg(`âœ“ ${files.length} image(s) â†’ PDF`)
    } catch(e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  return (
    <div>
      <DropZone accept="image/jpeg,image/jpg,image/png" multiple onFiles={fs=>setFiles(p=>[...p,...fs])} label="Drop JPG/PNG images" />
      {files.length > 0 && (
        <div style={{ marginTop:12 }}>
          {files.map((f,i) => <FileBadge key={i} file={f} onRemove={()=>setFiles(p=>p.filter((_,j)=>j!==i))} />)}
          <div style={{ display:'flex', gap:8, marginTop:12 }}>
            <button onClick={convert} disabled={busy} style={S.btn}>{busy ? 'CREATING...' : 'â¬‡ SAVE AS PDF'}</button>
            <button onClick={()=>setFiles([])} style={S.btnOut}>CLEAR</button>
          </div>
        </div>
      )}
      {err && <div style={S.err}>âš  {err}</div>}
      {msg && <div style={S.success}>{msg}</div>}
    </div>
  )
}

// â”€â”€ PDF â†’ JPG (alias of PDFToImages, returns JPG not PNG) â”€â”€â”€â”€â”€â”€â”€â”€â”€
function PDFToJPG() {
  const [file, setFile]   = useState(null)
  const [pages, setPages] = useState(0)
  const [quality, setQuality] = useState(92)
  const [busy, setBusy]   = useState(false)
  const [pct, setPct]     = useState(0)
  const [err, setErr]     = useState('')
  const [msg, setMsg]     = useState('')

  const loadFile = async ([f]) => {
    setFile(f); setErr(''); setMsg('')
    const lib = await loadPdfJs()
    const pdf = await lib.getDocument({ data: new Uint8Array(await readAB(f)) }).promise
    setPages(pdf.numPages)
  }

  const convert = async () => {
    if (!file) return
    setErr(''); setMsg(''); setBusy(true); setPct(0)
    try {
      const lib = await loadPdfJs()
      const pdf = await lib.getDocument({ data: new Uint8Array(await readAB(file)) }).promise
      for (let i = 1; i <= pdf.numPages; i++) {
        setPct(Math.round((i/pdf.numPages)*100))
        const page = await pdf.getPage(i)
        const vp   = page.getViewport({ scale:2 })
        const canvas = document.createElement('canvas')
        canvas.width = vp.width; canvas.height = vp.height
        await page.render({ canvasContext:canvas.getContext('2d'), viewport:vp }).promise
        await new Promise(res => canvas.toBlob(blob => { downloadBlob(blob, `page_${i}.jpg`); setTimeout(res,100) }, 'image/jpeg', quality/100))
      }
      setMsg(`âœ“ Downloaded ${pdf.numPages} JPG(s)`)
    } catch(e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  return (
    <div>
      <DropZone accept=".pdf" onFiles={loadFile} label="Drop PDF to export pages as JPG" />
      {file && (
        <div style={{ marginTop:16 }}>
          <FileBadge file={file} />
          <div style={{ ...S.success, marginTop:8 }}>ðŸ“„ {pages} pages detected</div>
          <div style={{ marginTop:12 }}>
            <label style={S.label}>JPEG QUALITY â€” {quality}%</label>
            <Slider min={60} max={100} value={quality} onChange={setQuality} />
          </div>
          <button onClick={convert} disabled={busy} style={{ ...S.btn, marginTop:12 }}>{busy ? `EXPORTING... ${pct}%` : 'â¬‡ EXPORT ALL AS JPG'}</button>
        </div>
      )}
      {busy && <Progress pct={pct} label="RENDERING PAGES" />}
      {err && <div style={S.err}>âš  {err}</div>}
      {msg && <div style={S.success}>{msg}</div>}
    </div>
  )
}

// â”€â”€ HTML â†’ PDF (render URL or paste HTML) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function HTMLToPDF() {
  const [html, setHtml] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr]   = useState('')
  const [msg, setMsg]   = useState('')

  const loadFile = async ([f]) => setHtml(await readText(f))

  const convert = async () => {
    if (!html.trim()) return setErr('Paste HTML content or upload an HTML file')
    setErr(''); setMsg(''); setBusy(true)
    try {
      // Use print dialog via hidden iframe
      const iframe = document.createElement('iframe')
      iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:210mm;height:297mm;border:none'
      document.body.appendChild(iframe)
      iframe.contentDocument.open()
      iframe.contentDocument.write(html)
      iframe.contentDocument.close()
      await new Promise(res => setTimeout(res, 800))
      iframe.contentWindow.print()
      document.body.removeChild(iframe)
      setMsg('âœ“ Browser print dialog opened â€” choose "Save as PDF" as the printer')
    } catch(e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  return (
    <div>
      <div style={{ ...S.panel, padding:'12px 16px', marginBottom:16 }}>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--orange)', letterSpacing:1 }}>
          âš¡ Renders your HTML in a hidden frame and opens the system print dialog. Select "Save as PDF" as the destination. Works with full CSS styling.
        </div>
      </div>
      <DropZone accept=".html,.htm" onFiles={loadFile} label="Drop HTML file or paste below" />
      <div style={{ marginTop:12 }}>
        <label style={S.label}>HTML CONTENT</label>
        <textarea value={html} onChange={e=>setHtml(e.target.value)} rows={10}
          placeholder="<html><body><h1>Hello</h1><p>Your content here</p></body></html>"
          style={{ ...S.input, fontFamily:'var(--font-mono)', fontSize:11, resize:'vertical' }} />
      </div>
      <button onClick={convert} disabled={busy} style={{ ...S.btn, marginTop:12 }}>{busy ? 'OPENING...' : 'ðŸ–¨ PRINT â†’ SAVE AS PDF'}</button>
      {err && <div style={S.err}>âš  {err}</div>}
      {msg && <div style={S.success}>{msg}</div>}
    </div>
  )
}

// â”€â”€ Sign PDF (draw or type signature) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
      setMsg('âœ“ Signature applied')
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
          <div style={{ ...S.success, marginTop:8 }}>ðŸ“„ {pages} pages</div>

          {/* Signature mode */}
          <div style={{ display:'flex', gap:8, margin:'16px 0 12px' }}>
            {[['draw','âœ Draw Signature'],['type','âŒ¨ Type Signature']].map(([v,l])=>(
              <button key={v} onClick={()=>setSigMode(v)} style={{ fontFamily:'var(--font-mono)', fontSize:10, padding:'8px 16px', background:sigMode===v?'color-mix(in srgb, var(--green) 10%, transparent)':'var(--bg3)', color:sigMode===v?'var(--green)':'var(--muted)', border:`1px solid ${sigMode===v?'color-mix(in srgb, var(--green) 40%, transparent)':'var(--border)'}`, cursor:'pointer' }}>{l}</button>
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

          <button onClick={apply} disabled={busy} style={{ ...S.btn, marginTop:16 }}>{busy ? 'SIGNING...' : 'â¬‡ APPLY SIGNATURE'}</button>
        </div>
      )}
      {err && <div style={S.err}>âš  {err}</div>}
      {msg && <div style={S.success}>{msg}</div>}
    </div>
  )
}

// â”€â”€ Repair PDF (re-save to fix corruption) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
      setMsg(`âœ“ PDF repaired and saved â€” ${fmtBytes(bytes.byteLength)}`)
    } catch(e) { setErr('Could not repair: ' + e.message) }
    finally { setBusy(false) }
  }

  return (
    <div>
      <div style={{ ...S.panel, padding:'12px 16px', marginBottom:16 }}>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--orange)', letterSpacing:1 }}>
          âš¡ Re-parses and rebuilds the PDF structure. Fixes common corruption issues like broken cross-references, malformed objects, and truncated streams.
        </div>
      </div>
      <DropZone accept=".pdf" onFiles={([f])=>{ setFile(f); setErr(''); setMsg('') }} label="Drop corrupted PDF to repair" />
      {file && (
        <div style={{ marginTop:16 }}>
          <FileBadge file={file} />
          <button onClick={repair} disabled={busy} style={{ ...S.btn, marginTop:12 }}>{busy ? 'REPAIRING...' : 'ðŸ”§ REPAIR & DOWNLOAD'}</button>
        </div>
      )}
      {err && <div style={S.err}>âš  {err}</div>}
      {msg && <div style={S.success}>{msg}</div>}
    </div>
  )
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// TOOLS CONFIG + MAIN PAGE
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•


export { ProtectPDF, UnlockPDF, OrganizePDF, CropPDF, EditPDFMeta, PDFInfo, GrayscalePDF, HeaderFooterPDF, FlattenPDF, PDFToWord, PDFToExcel, WordToPDF, ExcelToPDF, CSVToPDF, JPGToPDF, PDFToJPG, HTMLToPDF, SignPDF, RepairPDF }
