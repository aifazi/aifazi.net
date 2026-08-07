'use client'
/**
 * BackendTools.jsx — All file tools wired to the Python backend (/api/file-tools)
 * Every tool uses the same consistent DropZone → options → Run → download flow.
 * No CDN libraries needed — all processing is server-side (PyMuPDF, Pillow, etc.)
 */
import { useState, useRef, useCallback } from 'react'
import { S, fmtBytes } from './shared.jsx'
import { Checkbox, Select, Slider } from '../../core/ui.jsx'

const API = '/api/file-tools'

// ── Shared internal helpers ────────────────────────────────────────────────────

function DropZone({ onFiles, accept = '*', multiple = false, files = [] }) {
  const [over, setOver] = useState(false)
  const ref = useRef()
  const handle = (fs) => {
    const arr = [...fs]
    onFiles(multiple ? arr : [arr[0]])
  }
  return (
    <div>
      <div
        onClick={() => ref.current.click()}
        onDragOver={e => { e.preventDefault(); setOver(true) }}
        onDragLeave={() => setOver(false)}
        onDrop={e => { e.preventDefault(); setOver(false); handle(e.dataTransfer.files) }}
        style={{
          border: `2px dashed ${over ? 'var(--green)' : 'var(--border)'}`,
          padding: '36px 24px', textAlign: 'center', cursor: 'pointer',
          transition: 'all .2s', background: over ? 'color-mix(in srgb, var(--green) 5%, transparent)' : 'var(--bg3)',
          borderRadius: 2,
        }}
      >
        <input ref={ref} type="file" accept={accept} multiple={multiple}
          style={{ display: 'none' }} onChange={e => handle(e.target.files)} />
        <div style={{ fontSize: 32, marginBottom: 10 }}>📂</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2,
          color: over ? 'var(--green)' : 'var(--muted)' }}>
          {over ? 'DROP FILES' : 'DROP FILES HERE OR CLICK TO BROWSE'}
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)',
          marginTop: 6, letterSpacing: 1 }}>Accepts: {accept}</div>
      </div>
      {files.length > 0 && (
        <div style={{ marginTop: 10 }}>
          {files.map((f, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10,
              background: 'var(--bg3)', border: '1px solid var(--border)',
              padding: '8px 14px', marginBottom: 4 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10,
                color: 'var(--cyan)', flex: 1, overflow: 'hidden',
                textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9,
                color: 'var(--muted)', flexShrink: 0 }}>{fmtBytes(f.size)}</span>
              <button onClick={() => onFiles(files.filter((_, j) => j !== i))}
                style={{ background: 'none', border: 'none', color: 'var(--red)',
                  cursor: 'pointer', fontSize: 13, padding: '0 4px', flexShrink: 0 }}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={S.label}>{label}</label>
      {children}
    </div>
  )
}

function RunBtn({ onClick, loading, label = 'RUN →', disabled }) {
  return (
    <button onClick={onClick} disabled={loading || disabled}
      style={{
        ...S.btn,
        background: loading || disabled ? 'var(--bg3)' : 'var(--green)',
        color: loading || disabled ? 'var(--muted)' : '#000',
        border: loading || disabled ? '1px solid var(--border)' : 'none',
        cursor: loading || disabled ? 'not-allowed' : 'pointer',
        opacity: disabled && !loading ? 0.6 : 1,
        marginTop: 18, minWidth: 160,
      }}>
      {loading ? '⏳ PROCESSING...' : label}
    </button>
  )
}

function StatusBox({ error, success }) {
  if (error) return (
    <div style={S.err}>{error}</div>
  )
  if (success) return (
    <div style={S.success}>{success}</div>
  )
  return null
}

// Core API call — multipart form to backend, returns blob download
async function callTool(endpoint, formData, outName) {
  const res = await fetch(`${API}${endpoint}`, { method: 'POST', body: formData })
  if (!res.ok) {
    let msg = `Server error ${res.status}`
    try { const j = await res.json(); msg = j.detail || j.error || msg } catch {}
    throw new Error(msg)
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = outName; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 3000)
}

// JSON API call — for text-in/text-out tools
async function callJSON(endpoint, body) {
  const res = await fetch(`${API}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    let msg = `Server error ${res.status}`
    try { const j = await res.json(); msg = j.detail || j.error || msg } catch {}
    throw new Error(msg)
  }
  return res.json()
}

// Reusable hook for simple single-file tools
function useTool() {
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const run = async (fn) => {
    setError(''); setSuccess(''); setLoading(true)
    try { await fn(); setSuccess('Done — file downloaded!') }
    catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }
  return { files, setFiles, loading, error, success, run }
}

// ══════════════════════════════════════════════════════════
// PDF TOOLS
// ══════════════════════════════════════════════════════════

export function MergePDFB() {
  const { files, setFiles, loading, error, success, run } = useTool()
  const go = () => run(async () => {
    if (files.length < 2) throw new Error('Select at least 2 PDF files.')
    const fd = new FormData()
    files.forEach(f => fd.append('files', f))
    await callTool('/pdf/merge', fd, 'merged.pdf')
  })
  return (
    <div>
      <DropZone onFiles={setFiles} accept=".pdf" multiple files={files} />
      <StatusBox error={error} success={success} />
      <RunBtn onClick={go} loading={loading} disabled={files.length < 2} label="MERGE →" />
    </div>
  )
}

export function SplitPDFB() {
  const { files, setFiles, loading, error, success, run } = useTool()
  const [pages, setPages] = useState('1')
  const go = () => run(async () => {
    if (!files[0]) throw new Error('Select a PDF.')
    const fd = new FormData(); fd.append('file', files[0]); fd.append('pages', pages)
    await callTool('/pdf/split', fd, 'split.zip')
  })
  return (
    <div>
      <DropZone onFiles={setFiles} accept=".pdf" files={files} />
      <Field label="Pages to extract (e.g. 1,3,5-7)">
        <input value={pages} onChange={e => setPages(e.target.value)} style={S.input} placeholder="1,3,5-7" />
      </Field>
      <StatusBox error={error} success={success} />
      <RunBtn onClick={go} loading={loading} disabled={!files[0]} label="SPLIT →" />
    </div>
  )
}

export function CompressPDFB() {
  const { files, setFiles, loading, error, success, run } = useTool()
  const go = () => run(async () => {
    if (!files[0]) throw new Error('Select a PDF.')
    const fd = new FormData(); fd.append('file', files[0])
    await callTool('/pdf/compress', fd, 'compressed.pdf')
  })
  return (
    <div>
      <DropZone onFiles={setFiles} accept=".pdf" files={files} />
      <StatusBox error={error} success={success} />
      <RunBtn onClick={go} loading={loading} disabled={!files[0]} label="COMPRESS →" />
    </div>
  )
}

export function RotatePDFB() {
  const { files, setFiles, loading, error, success, run } = useTool()
  const [angle, setAngle] = useState('90')
  const [pages, setPages] = useState('all')
  const go = () => run(async () => {
    if (!files[0]) throw new Error('Select a PDF.')
    const fd = new FormData()
    fd.append('file', files[0]); fd.append('angle', angle); fd.append('pages', pages)
    await callTool('/pdf/rotate', fd, 'rotated.pdf')
  })
  return (
    <div>
      <DropZone onFiles={setFiles} accept=".pdf" files={files} />
      <Field label="Rotation angle">
        <Select value={angle} onChange={setAngle}
          options={['90','180','270'].map(a => [a, `${a}°`])} />
      </Field>
      <Field label="Pages (all or e.g. 1,3,5-7)">
        <input value={pages} onChange={e => setPages(e.target.value)} style={S.input} placeholder="all" />
      </Field>
      <StatusBox error={error} success={success} />
      <RunBtn onClick={go} loading={loading} disabled={!files[0]} label="ROTATE →" />
    </div>
  )
}

export function RemovePagesPDFB() {
  const { files, setFiles, loading, error, success, run } = useTool()
  const [pages, setPages] = useState('')
  const go = () => run(async () => {
    if (!files[0]) throw new Error('Select a PDF.')
    const fd = new FormData(); fd.append('file', files[0]); fd.append('pages', pages)
    await callTool('/pdf/remove-pages', fd, 'trimmed.pdf')
  })
  return (
    <div>
      <DropZone onFiles={setFiles} accept=".pdf" files={files} />
      <Field label="Pages to remove (e.g. 1,3,5-7)">
        <input value={pages} onChange={e => setPages(e.target.value)} style={S.input} placeholder="2,4,6-8" />
      </Field>
      <StatusBox error={error} success={success} />
      <RunBtn onClick={go} loading={loading} disabled={!files[0] || !pages} label="REMOVE →" />
    </div>
  )
}

export function WatermarkPDFB() {
  const { files, setFiles, loading, error, success, run } = useTool()
  const [text, setText] = useState('CONFIDENTIAL')
  const [opacity, setOpacity] = useState('0.15')
  const [angle, setAngle] = useState('45')
  const go = () => run(async () => {
    if (!files[0]) throw new Error('Select a PDF.')
    const fd = new FormData()
    fd.append('file', files[0]); fd.append('text', text)
    fd.append('opacity', opacity); fd.append('angle', angle)
    await callTool('/pdf/watermark', fd, 'watermarked.pdf')
  })
  return (
    <div>
      <DropZone onFiles={setFiles} accept=".pdf" files={files} />
      <Field label="Watermark text"><input value={text} onChange={e => setText(e.target.value)} style={S.input} /></Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Opacity (0–1)"><input type="number" min="0" max="1" step="0.05" value={opacity} onChange={e => setOpacity(e.target.value)} style={S.input} /></Field>
        <Field label="Angle (degrees)"><input type="number" value={angle} onChange={e => setAngle(e.target.value)} style={S.input} /></Field>
      </div>
      <StatusBox error={error} success={success} />
      <RunBtn onClick={go} loading={loading} disabled={!files[0] || !text} label="WATERMARK →" />
    </div>
  )
}

export function PageNumbersPDFB() {
  const { files, setFiles, loading, error, success, run } = useTool()
  const [pos, setPos] = useState('bottom-center')
  const [start, setStart] = useState('1')
  const go = () => run(async () => {
    if (!files[0]) throw new Error('Select a PDF.')
    const fd = new FormData()
    fd.append('file', files[0]); fd.append('position', pos); fd.append('start', start)
    await callTool('/pdf/page-numbers', fd, 'numbered.pdf')
  })
  return (
    <div>
      <DropZone onFiles={setFiles} accept=".pdf" files={files} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Position">
          <Select value={pos} onChange={setPos}
            options={['bottom-center','bottom-left','bottom-right','top-center','top-left','top-right'].map(p => [p, p])} />
        </Field>
        <Field label="Start number">
          <input type="number" min="1" value={start} onChange={e => setStart(e.target.value)} style={S.input} />
        </Field>
      </div>
      <StatusBox error={error} success={success} />
      <RunBtn onClick={go} loading={loading} disabled={!files[0]} label="ADD PAGE NUMBERS →" />
    </div>
  )
}

export function ImagesToPDFB() {
  const { files, setFiles, loading, error, success, run } = useTool()
  const go = () => run(async () => {
    if (!files.length) throw new Error('Select at least one image.')
    const fd = new FormData(); files.forEach(f => fd.append('files', f))
    await callTool('/pdf/images-to-pdf', fd, 'images.pdf')
  })
  return (
    <div>
      <DropZone onFiles={setFiles} accept=".jpg,.jpeg,.png,.webp,.bmp" multiple files={files} />
      <StatusBox error={error} success={success} />
      <RunBtn onClick={go} loading={loading} disabled={!files.length} label="CREATE PDF →" />
    </div>
  )
}

export function PDFToImagesB() {
  const { files, setFiles, loading, error, success, run } = useTool()
  const [dpi, setDpi] = useState('150')
  const go = () => run(async () => {
    if (!files[0]) throw new Error('Select a PDF.')
    const fd = new FormData(); fd.append('file', files[0]); fd.append('dpi', dpi)
    await callTool('/pdf/to-images', fd, 'pages.zip')
  })
  return (
    <div>
      <DropZone onFiles={setFiles} accept=".pdf" files={files} />
      <Field label="DPI (72–300)">
        <Select value={dpi} onChange={setDpi}
          options={['72','96','120','150','200','300'].map(d => [d, `${d} DPI`])} />
      </Field>
      <StatusBox error={error} success={success} />
      <RunBtn onClick={go} loading={loading} disabled={!files[0]} label="EXPORT IMAGES →" />
    </div>
  )
}

export function ProtectPDFB() {
  const { files, setFiles, loading, error, success, run } = useTool()
  const [pw, setPw] = useState('')
  const go = () => run(async () => {
    if (!files[0]) throw new Error('Select a PDF.')
    if (!pw) throw new Error('Enter a password.')
    const fd = new FormData(); fd.append('file', files[0]); fd.append('password', pw)
    await callTool('/pdf/protect', fd, 'protected.pdf')
  })
  return (
    <div>
      <DropZone onFiles={setFiles} accept=".pdf" files={files} />
      <Field label="Password">
        <input type="password" value={pw} onChange={e => setPw(e.target.value)} style={S.input} placeholder="Enter password" />
      </Field>
      <StatusBox error={error} success={success} />
      <RunBtn onClick={go} loading={loading} disabled={!files[0] || !pw} label="PROTECT →" />
    </div>
  )
}

export function UnlockPDFB() {
  const { files, setFiles, loading, error, success, run } = useTool()
  const [pw, setPw] = useState('')
  const go = () => run(async () => {
    if (!files[0]) throw new Error('Select a PDF.')
    const fd = new FormData(); fd.append('file', files[0]); fd.append('password', pw)
    await callTool('/pdf/unlock', fd, 'unlocked.pdf')
  })
  return (
    <div>
      <DropZone onFiles={setFiles} accept=".pdf" files={files} />
      <Field label="Password (if known, leave blank to try without)">
        <input type="password" value={pw} onChange={e => setPw(e.target.value)} style={S.input} placeholder="Optional" />
      </Field>
      <StatusBox error={error} success={success} />
      <RunBtn onClick={go} loading={loading} disabled={!files[0]} label="UNLOCK →" />
    </div>
  )
}

export function OrganizePDFB() {
  const { files, setFiles, loading, error, success, run } = useTool()
  const [order, setOrder] = useState('')
  const go = () => run(async () => {
    if (!files[0]) throw new Error('Select a PDF.')
    if (!order.trim()) throw new Error('Enter the desired page order.')
    const fd = new FormData(); fd.append('file', files[0]); fd.append('order', order)
    await callTool('/pdf/organize', fd, 'organized.pdf')
  })
  return (
    <div>
      <DropZone onFiles={setFiles} accept=".pdf" files={files} />
      <Field label="New page order (e.g. 3,1,2 or 1,3,5-7,2)">
        <input value={order} onChange={e => setOrder(e.target.value)} style={S.input} placeholder="3,1,2,4" />
      </Field>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', marginTop: 6 }}>
        Tip: Use comma-separated page numbers in the order you want them.
      </div>
      <StatusBox error={error} success={success} />
      <RunBtn onClick={go} loading={loading} disabled={!files[0] || !order} label="REORGANIZE →" />
    </div>
  )
}

export function CropPDFB() {
  const { files, setFiles, loading, error, success, run } = useTool()
  const [margins, setMargins] = useState({ top: '10', bottom: '10', left: '10', right: '10' })
  const setM = (k, v) => setMargins(p => ({ ...p, [k]: v }))
  const go = () => run(async () => {
    if (!files[0]) throw new Error('Select a PDF.')
    const fd = new FormData(); fd.append('file', files[0])
    Object.entries(margins).forEach(([k, v]) => fd.append(k, v))
    await callTool('/pdf/crop', fd, 'cropped.pdf')
  })
  return (
    <div>
      <DropZone onFiles={setFiles} accept=".pdf" files={files} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {['top', 'bottom', 'left', 'right'].map(k => (
          <Field key={k} label={`${k.toUpperCase()} margin (pts)`}>
            <input type="number" min="0" value={margins[k]} onChange={e => setM(k, e.target.value)} style={S.input} />
          </Field>
        ))}
      </div>
      <StatusBox error={error} success={success} />
      <RunBtn onClick={go} loading={loading} disabled={!files[0]} label="CROP →" />
    </div>
  )
}

export function EditPDFMetaB() {
  const { files, setFiles, loading, error, success, run } = useTool()
  const [meta, setMeta] = useState({ title: '', author: '', subject: '', keywords: '' })
  const setM = (k, v) => setMeta(p => ({ ...p, [k]: v }))
  const go = () => run(async () => {
    if (!files[0]) throw new Error('Select a PDF.')
    const fd = new FormData(); fd.append('file', files[0])
    Object.entries(meta).forEach(([k, v]) => fd.append(k, v))
    await callTool('/pdf/edit-meta', fd, 'meta-updated.pdf')
  })
  return (
    <div>
      <DropZone onFiles={setFiles} accept=".pdf" files={files} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {['title', 'author', 'subject', 'keywords'].map(k => (
          <Field key={k} label={k.toUpperCase()}>
            <input value={meta[k]} onChange={e => setM(k, e.target.value)} style={S.input} placeholder={k} />
          </Field>
        ))}
      </div>
      <StatusBox error={error} success={success} />
      <RunBtn onClick={go} loading={loading} disabled={!files[0]} label="SAVE METADATA →" />
    </div>
  )
}

export function PDFInfoB() {
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState(null)
  const run = async () => {
    if (!files[0]) return
    setError(''); setInfo(null); setLoading(true)
    try {
      const fd = new FormData(); fd.append('file', files[0])
      const res = await fetch(`${API}/pdf/info`, { method: 'POST', body: fd })
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      setInfo(await res.json())
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }
  return (
    <div>
      <DropZone onFiles={setFiles} accept=".pdf" files={files} />
      <StatusBox error={error} />
      <RunBtn onClick={run} loading={loading} disabled={!files[0]} label="INSPECT →" />
      {info && (
        <div style={{ ...S.panel, marginTop: 18 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 3, color: 'var(--muted)', marginBottom: 12 }}>PDF METADATA</div>
          {Object.entries(info).filter(([, v]) => v).map(([k, v]) => (
            <div key={k} style={S.row}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', letterSpacing: 1 }}>{k.toUpperCase()}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--cyan)' }}>{String(v)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function GrayscalePDFB() {
  const { files, setFiles, loading, error, success, run } = useTool()
  const go = () => run(async () => {
    if (!files[0]) throw new Error('Select a PDF.')
    const fd = new FormData(); fd.append('file', files[0])
    await callTool('/pdf/grayscale', fd, 'grayscale.pdf')
  })
  return (
    <div>
      <DropZone onFiles={setFiles} accept=".pdf" files={files} />
      <StatusBox error={error} success={success} />
      <RunBtn onClick={go} loading={loading} disabled={!files[0]} label="CONVERT →" />
    </div>
  )
}

export function HeaderFooterPDFB() {
  const { files, setFiles, loading, error, success, run } = useTool()
  const [header, setHeader] = useState('')
  const [footer, setFooter] = useState('')
  const go = () => run(async () => {
    if (!files[0]) throw new Error('Select a PDF.')
    const fd = new FormData()
    fd.append('file', files[0]); fd.append('header', header); fd.append('footer', footer)
    await callTool('/pdf/header-footer', fd, 'header-footer.pdf')
  })
  return (
    <div>
      <DropZone onFiles={setFiles} accept=".pdf" files={files} />
      <Field label="Header text (leave blank to skip)">
        <input value={header} onChange={e => setHeader(e.target.value)} style={S.input} placeholder="My Document" />
      </Field>
      <Field label="Footer text (leave blank to skip)">
        <input value={footer} onChange={e => setFooter(e.target.value)} style={S.input} placeholder="Page {page}" />
      </Field>
      <StatusBox error={error} success={success} />
      <RunBtn onClick={go} loading={loading} disabled={!files[0] || (!header && !footer)} label="APPLY →" />
    </div>
  )
}

export function FlattenPDFB() {
  const { files, setFiles, loading, error, success, run } = useTool()
  const go = () => run(async () => {
    if (!files[0]) throw new Error('Select a PDF.')
    const fd = new FormData(); fd.append('file', files[0])
    await callTool('/pdf/flatten', fd, 'flattened.pdf')
  })
  return (
    <div>
      <DropZone onFiles={setFiles} accept=".pdf" files={files} />
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', lineHeight: 1.7, margin: '12px 0 0' }}>
        Flattening bakes form fields, annotations and overlays into static page content so they can&apos;t be edited.
      </p>
      <StatusBox error={error} success={success} />
      <RunBtn onClick={go} loading={loading} disabled={!files[0]} label="FLATTEN →" />
    </div>
  )
}

export function SignPDFB() {
  const { files, setFiles, loading, error, success, run } = useTool()
  const canvasRef = useRef(null)
  const [drawing, setDrawing] = useState(false)
  const [hasSig, setHasSig] = useState(false)
  const [page, setPage] = useState('1')
  const [pos, setPos] = useState('bottom-right')
  const lastPt = useRef(null)

  const startDraw = (e) => {
    setDrawing(true); const r = canvasRef.current.getBoundingClientRect()
    lastPt.current = { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  const draw = (e) => {
    if (!drawing) return
    const c = canvasRef.current; const ctx = c.getContext('2d')
    const r = c.getBoundingClientRect()
    const x = e.clientX - r.left; const y = e.clientY - r.top
    ctx.beginPath(); ctx.moveTo(lastPt.current.x, lastPt.current.y)
    ctx.lineTo(x, y); ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.stroke()
    lastPt.current = { x, y }; setHasSig(true)
  }
  const stopDraw = () => setDrawing(false)
  const clearSig = () => {
    const c = canvasRef.current; c.getContext('2d').clearRect(0, 0, c.width, c.height); setHasSig(false)
  }

  const go = () => run(async () => {
    if (!files[0]) throw new Error('Select a PDF.')
    if (!hasSig) throw new Error('Draw your signature first.')
    const sigDataUrl = canvasRef.current.toDataURL('image/png')
    const fd = new FormData(); fd.append('file', files[0])
    fd.append('signature', sigDataUrl); fd.append('page', page); fd.append('position', pos)
    await callTool('/pdf/sign', fd, 'signed.pdf')
  })

  return (
    <div>
      <DropZone onFiles={setFiles} accept=".pdf" files={files} />
      <Field label="Draw your signature below">
        <canvas ref={canvasRef} width={400} height={120}
          onMouseDown={startDraw} onMouseMove={draw} onMouseUp={stopDraw} onMouseLeave={stopDraw}
          style={{ border: '1px solid var(--border)', background: '#fff', cursor: 'crosshair',
            display: 'block', maxWidth: '100%', touchAction: 'none' }} />
        <button onClick={clearSig} style={{ ...S.btnSm, background: 'transparent',
          color: 'var(--muted)', border: '1px solid var(--border)', marginTop: 6 }}>
          CLEAR
        </button>
      </Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Page number"><input type="number" min="1" value={page} onChange={e => setPage(e.target.value)} style={S.input} /></Field>
        <Field label="Position">
          <Select value={pos} onChange={setPos}
            options={['bottom-right','bottom-left','bottom-center','top-right','top-left','center'].map(p => [p, p])} />
        </Field>
      </div>
      <StatusBox error={error} success={success} />
      <RunBtn onClick={go} loading={loading} disabled={!files[0] || !hasSig} label="SIGN PDF →" />
    </div>
  )
}

export function RepairPDFB() {
  const { files, setFiles, loading, error, success, run } = useTool()
  const go = () => run(async () => {
    if (!files[0]) throw new Error('Select a PDF.')
    const fd = new FormData(); fd.append('file', files[0])
    await callTool('/pdf/repair', fd, 'repaired.pdf')
  })
  return (
    <div>
      <DropZone onFiles={setFiles} accept=".pdf" files={files} />
      <StatusBox error={error} success={success} />
      <RunBtn onClick={go} loading={loading} disabled={!files[0]} label="REPAIR →" />
    </div>
  )
}

// ══════════════════════════════════════════════════════════
// PDF CONVERT TOOLS
// ══════════════════════════════════════════════════════════

export function PDFToWordB() {
  const { files, setFiles, loading, error, success, run } = useTool()
  const go = () => run(async () => {
    if (!files[0]) throw new Error('Select a PDF.')
    const fd = new FormData(); fd.append('file', files[0])
    await callTool('/pdf/to-word', fd, 'output.docx')
  })
  return (
    <div>
      <DropZone onFiles={setFiles} accept=".pdf" files={files} />
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', lineHeight: 1.7, margin: '12px 0 0' }}>
        Extracts the text from each page into a structured Word document. Images are not transferred.
      </p>
      <StatusBox error={error} success={success} />
      <RunBtn onClick={go} loading={loading} disabled={!files[0]} label="CONVERT →" />
    </div>
  )
}

export function PDFToExcelB() {
  const { files, setFiles, loading, error, success, run } = useTool()
  const go = () => run(async () => {
    if (!files[0]) throw new Error('Select a PDF.')
    const fd = new FormData(); fd.append('file', files[0])
    await callTool('/pdf/to-excel', fd, 'output.xlsx')
  })
  return (
    <div>
      <DropZone onFiles={setFiles} accept=".pdf" files={files} />
      <StatusBox error={error} success={success} />
      <RunBtn onClick={go} loading={loading} disabled={!files[0]} label="CONVERT →" />
    </div>
  )
}

export function PDFToJPGB() {
  const { files, setFiles, loading, error, success, run } = useTool()
  const [dpi, setDpi] = useState('150')
  const go = () => run(async () => {
    if (!files[0]) throw new Error('Select a PDF.')
    const fd = new FormData(); fd.append('file', files[0]); fd.append('dpi', dpi)
    await callTool('/pdf/to-jpg', fd, 'pages.zip')
  })
  return (
    <div>
      <DropZone onFiles={setFiles} accept=".pdf" files={files} />
      <Field label="DPI">
        <Select value={dpi} onChange={setDpi}
          options={['72','96','150','200','300'].map(d => [d, `${d} DPI`])} />
      </Field>
      <StatusBox error={error} success={success} />
      <RunBtn onClick={go} loading={loading} disabled={!files[0]} label="EXPORT JPGs →" />
    </div>
  )
}

export function WordToPDFB() {
  const { files, setFiles, loading, error, success, run } = useTool()
  const go = () => run(async () => {
    if (!files[0]) throw new Error('Select a DOCX file.')
    const fd = new FormData(); fd.append('file', files[0])
    await callTool('/convert/word-to-pdf', fd, 'output.pdf')
  })
  return (
    <div>
      <DropZone onFiles={setFiles} accept=".docx" files={files} />
      <StatusBox error={error} success={success} />
      <RunBtn onClick={go} loading={loading} disabled={!files[0]} label="CONVERT →" />
    </div>
  )
}

export function ExcelToPDFB() {
  const { files, setFiles, loading, error, success, run } = useTool()
  const go = () => run(async () => {
    if (!files[0]) throw new Error('Select an Excel file.')
    const fd = new FormData(); fd.append('file', files[0])
    await callTool('/convert/excel-to-pdf', fd, 'output.pdf')
  })
  return (
    <div>
      <DropZone onFiles={setFiles} accept=".xlsx,.xls" files={files} />
      <StatusBox error={error} success={success} />
      <RunBtn onClick={go} loading={loading} disabled={!files[0]} label="CONVERT →" />
    </div>
  )
}

export function CSVToPDFB() {
  const { files, setFiles, loading, error, success, run } = useTool()
  const go = () => run(async () => {
    if (!files[0]) throw new Error('Select a CSV file.')
    const fd = new FormData(); fd.append('file', files[0])
    await callTool('/convert/csv-to-pdf', fd, 'output.pdf')
  })
  return (
    <div>
      <DropZone onFiles={setFiles} accept=".csv" files={files} />
      <StatusBox error={error} success={success} />
      <RunBtn onClick={go} loading={loading} disabled={!files[0]} label="CONVERT →" />
    </div>
  )
}

export function JPGToPDFB() {
  const { files, setFiles, loading, error, success, run } = useTool()
  const go = () => run(async () => {
    if (!files.length) throw new Error('Select at least one image.')
    const fd = new FormData(); files.forEach(f => fd.append('files', f))
    await callTool('/convert/jpg-to-pdf', fd, 'output.pdf')
  })
  return (
    <div>
      <DropZone onFiles={setFiles} accept=".jpg,.jpeg,.png,.webp" multiple files={files} />
      <StatusBox error={error} success={success} />
      <RunBtn onClick={go} loading={loading} disabled={!files.length} label="CONVERT →" />
    </div>
  )
}

export function HTMLToPDFB() {
  const [html, setHtml] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const go = async () => {
    if (!html.trim()) { setError('Paste some HTML first.'); return }
    setError(''); setSuccess(''); setLoading(true)
    try {
      const fd = new FormData(); fd.append('html_content', html)
      await callTool('/convert/html-to-pdf', fd, 'output.pdf')
      setSuccess('Done — file downloaded!')
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }
  return (
    <div>
      <Field label="HTML content">
        <textarea value={html} onChange={e => setHtml(e.target.value)} rows={10}
          style={{ ...S.input, resize: 'vertical', fontFamily: 'monospace', fontSize: 12 }}
          placeholder="<html><body><h1>Hello</h1></body></html>" />
      </Field>
      <StatusBox error={error} success={success} />
      <RunBtn onClick={go} loading={loading} disabled={!html.trim()} label="CONVERT →" />
    </div>
  )
}

export function TextToPDFB() {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const go = async () => {
    if (!text.trim()) { setError('Enter some text first.'); return }
    setError(''); setSuccess(''); setLoading(true)
    try {
      const fd = new FormData(); fd.append('text', text)
      await callTool('/convert/text-to-pdf', fd, 'output.pdf')
      setSuccess('Done — file downloaded!')
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }
  return (
    <div>
      <Field label="Plain text or Markdown">
        <textarea value={text} onChange={e => setText(e.target.value)} rows={10}
          style={{ ...S.input, resize: 'vertical' }} placeholder="# My Document&#10;&#10;Content here..." />
      </Field>
      <StatusBox error={error} success={success} />
      <RunBtn onClick={go} loading={loading} disabled={!text.trim()} label="CONVERT →" />
    </div>
  )
}

// ══════════════════════════════════════════════════════════
// IMAGE TOOLS
// ══════════════════════════════════════════════════════════

export function CompressImageB() {
  const { files, setFiles, loading, error, success, run } = useTool()
  const [quality, setQuality] = useState('80')
  const go = () => run(async () => {
    if (!files[0]) throw new Error('Select an image.')
    const fd = new FormData(); fd.append('file', files[0]); fd.append('quality', quality)
    await callTool('/image/compress', fd, 'compressed.' + (files[0].name.split('.').pop() || 'jpg'))
  })
  return (
    <div>
      <DropZone onFiles={setFiles} accept=".jpg,.jpeg,.png,.webp" files={files} />
      <Field label={`Quality: ${quality}%`}>
        <Slider min={10} max={95} step={5} value={Number(quality)} onChange={v => setQuality(String(v))} />
      </Field>
      <StatusBox error={error} success={success} />
      <RunBtn onClick={go} loading={loading} disabled={!files[0]} label="COMPRESS →" />
    </div>
  )
}

export function ResizeImageB() {
  const { files, setFiles, loading, error, success, run } = useTool()
  const [width, setWidth] = useState('')
  const [height, setHeight] = useState('')
  const [keepAspect, setKeepAspect] = useState(true)
  const go = () => run(async () => {
    if (!files[0]) throw new Error('Select an image.')
    if (!width && !height) throw new Error('Enter at least one dimension.')
    const fd = new FormData()
    fd.append('file', files[0]); fd.append('width', width || '0')
    fd.append('height', height || '0'); fd.append('keep_aspect', keepAspect ? '1' : '0')
    await callTool('/image/resize', fd, 'resized.' + (files[0].name.split('.').pop() || 'jpg'))
  })
  return (
    <div>
      <DropZone onFiles={setFiles} accept=".jpg,.jpeg,.png,.webp,.bmp" files={files} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Width (px)"><input type="number" min="1" value={width} onChange={e => setWidth(e.target.value)} style={S.input} placeholder="e.g. 1920" /></Field>
        <Field label="Height (px)"><input type="number" min="1" value={height} onChange={e => setHeight(e.target.value)} style={S.input} placeholder="e.g. 1080" /></Field>
      </div>
      <Checkbox checked={keepAspect} onChange={setKeepAspect} label="Keep aspect ratio"
        style={{ fontSize: 10, color: 'var(--muted)', marginTop: 8 }} />
      <StatusBox error={error} success={success} />
      <RunBtn onClick={go} loading={loading} disabled={!files[0]} label="RESIZE →" />
    </div>
  )
}

export function ConvertImageB() {
  const { files, setFiles, loading, error, success, run } = useTool()
  const [fmt, setFmt] = useState('png')
  const go = () => run(async () => {
    if (!files.length) throw new Error('Select at least one image.')
    const fd = new FormData(); files.forEach(f => fd.append('files', f)); fd.append('format', fmt)
    await callTool('/image/convert', fd, `converted_${fmt}.zip`)
  })
  return (
    <div>
      <DropZone onFiles={setFiles} accept=".jpg,.jpeg,.png,.webp,.bmp,.gif,.tiff" multiple files={files} />
      <Field label="Target format">
        <Select value={fmt} onChange={setFmt}
          options={['png','jpg','webp','bmp','gif','tiff'].map(f => [f, f.toUpperCase()])} />
      </Field>
      <StatusBox error={error} success={success} />
      <RunBtn onClick={go} loading={loading} disabled={!files.length} label="CONVERT →" />
    </div>
  )
}

export function FlipImageB() {
  const { files, setFiles, loading, error, success, run } = useTool()
  const [dir, setDir] = useState('horizontal')
  const go = () => run(async () => {
    if (!files[0]) throw new Error('Select an image.')
    const fd = new FormData(); fd.append('file', files[0]); fd.append('direction', dir)
    await callTool('/image/flip', fd, 'flipped.' + (files[0].name.split('.').pop() || 'jpg'))
  })
  return (
    <div>
      <DropZone onFiles={setFiles} accept=".jpg,.jpeg,.png,.webp,.bmp" files={files} />
      <Field label="Direction">
        <Select value={dir} onChange={setDir}
          options={[
            ['horizontal', 'Horizontal (mirror left-right)'],
            ['vertical', 'Vertical (flip upside-down)'],
            ['both', 'Both'],
          ]} />
      </Field>
      <StatusBox error={error} success={success} />
      <RunBtn onClick={go} loading={loading} disabled={!files[0]} label="FLIP →" />
    </div>
  )
}

export function ImageWatermarkB() {
  const { files, setFiles, loading, error, success, run } = useTool()
  const [text, setText] = useState('© aifazi.net')
  const [opacity, setOpacity] = useState('0.3')
  const [pos, setPos] = useState('bottom-right')
  const go = () => run(async () => {
    if (!files[0]) throw new Error('Select an image.')
    if (!text) throw new Error('Enter watermark text.')
    const fd = new FormData()
    fd.append('file', files[0]); fd.append('text', text)
    fd.append('opacity', opacity); fd.append('position', pos)
    await callTool('/image/watermark', fd, 'watermarked.' + (files[0].name.split('.').pop() || 'jpg'))
  })
  return (
    <div>
      <DropZone onFiles={setFiles} accept=".jpg,.jpeg,.png,.webp" files={files} />
      <Field label="Watermark text"><input value={text} onChange={e => setText(e.target.value)} style={S.input} /></Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Opacity (0–1)"><input type="number" min="0.05" max="1" step="0.05" value={opacity} onChange={e => setOpacity(e.target.value)} style={S.input} /></Field>
        <Field label="Position">
          <Select value={pos} onChange={setPos}
            options={['bottom-right','bottom-left','bottom-center','top-right','top-left','center'].map(p => [p, p])} />
        </Field>
      </div>
      <StatusBox error={error} success={success} />
      <RunBtn onClick={go} loading={loading} disabled={!files[0] || !text} label="WATERMARK →" />
    </div>
  )
}

export function ImageOCRB() {
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState('')
  const run = async () => {
    if (!files[0]) return
    setError(''); setResult(''); setLoading(true)
    try {
      const fd = new FormData(); fd.append('file', files[0])
      const res = await fetch(`${API}/image/ocr`, { method: 'POST', body: fd })
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      const data = await res.json()
      setResult(data.text || '(No text found)')
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }
  const copy = () => navigator.clipboard.writeText(result).catch(() => {})
  return (
    <div>
      <DropZone onFiles={setFiles} accept=".jpg,.jpeg,.png,.webp,.bmp,.tiff" files={files} />
      <StatusBox error={error} />
      <RunBtn onClick={run} loading={loading} disabled={!files[0]} label="EXTRACT TEXT →" />
      {result && (
        <div style={{ ...S.panel, marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 3, color: 'var(--muted)' }}>EXTRACTED TEXT</span>
            <button onClick={copy} style={{ ...S.btnSm, background: 'transparent', color: 'var(--cyan)', border: '1px solid color-mix(in srgb, var(--cyan) 40%, transparent)', fontSize: 9 }}>COPY</button>
          </div>
          <pre style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, maxHeight: 400, overflowY: 'auto' }}>{result}</pre>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════
// DOCUMENT TOOLS
// ══════════════════════════════════════════════════════════

export function DocxToTextB() {
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState('')
  const run = async () => {
    if (!files[0]) return
    setError(''); setResult(''); setLoading(true)
    try {
      const fd = new FormData(); fd.append('file', files[0])
      const res = await fetch(`${API}/doc/docx-to-text`, { method: 'POST', body: fd })
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      const data = await res.json(); setResult(data.text || '(No text found)')
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }
  const download = () => {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([result], { type: 'text/plain' })); a.download = 'extracted.txt'; a.click()
  }
  return (
    <div>
      <DropZone onFiles={setFiles} accept=".docx" files={files} />
      <StatusBox error={error} />
      <RunBtn onClick={run} loading={loading} disabled={!files[0]} label="EXTRACT TEXT →" />
      {result && (
        <div style={{ ...S.panel, marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 3, color: 'var(--muted)' }}>EXTRACTED TEXT</span>
            <button onClick={download} style={{ ...S.btnSm, fontSize: 9 }}>DOWNLOAD .TXT</button>
          </div>
          <pre style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, maxHeight: 400, overflowY: 'auto' }}>{result}</pre>
        </div>
      )}
    </div>
  )
}

export function XlsxToCsvB() {
  const { files, setFiles, loading, error, success, run } = useTool()
  const [sheet, setSheet] = useState('0')
  const go = () => run(async () => {
    if (!files[0]) throw new Error('Select an Excel file.')
    const fd = new FormData(); fd.append('file', files[0]); fd.append('sheet', sheet)
    await callTool('/doc/xlsx-to-csv', fd, 'export.csv')
  })
  return (
    <div>
      <DropZone onFiles={setFiles} accept=".xlsx,.xls" files={files} />
      <Field label="Sheet index (0 = first sheet)">
        <input type="number" min="0" value={sheet} onChange={e => setSheet(e.target.value)} style={S.input} />
      </Field>
      <StatusBox error={error} success={success} />
      <RunBtn onClick={go} loading={loading} disabled={!files[0]} label="EXPORT CSV →" />
    </div>
  )
}

export function CsvToXlsxB() {
  const { files, setFiles, loading, error, success, run } = useTool()
  const go = () => run(async () => {
    if (!files[0]) throw new Error('Select a CSV file.')
    const fd = new FormData(); fd.append('file', files[0])
    await callTool('/doc/csv-to-xlsx', fd, 'output.xlsx')
  })
  return (
    <div>
      <DropZone onFiles={setFiles} accept=".csv" files={files} />
      <StatusBox error={error} success={success} />
      <RunBtn onClick={go} loading={loading} disabled={!files[0]} label="CONVERT →" />
    </div>
  )
}

// ══════════════════════════════════════════════════════════
// TEXT / DEV TOOLS
// ══════════════════════════════════════════════════════════

export function TextStatsB() {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [stats, setStats] = useState(null)
  const run = async () => {
    if (!text.trim()) return
    setError(''); setStats(null); setLoading(true)
    try {
      const data = await callJSON('/text/stats', { text })
      setStats(data)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }
  return (
    <div>
      <Field label="Paste your text">
        <textarea value={text} onChange={e => setText(e.target.value)} rows={8}
          style={{ ...S.input, resize: 'vertical' }} placeholder="Paste any text here…" />
      </Field>
      <StatusBox error={error} />
      <RunBtn onClick={run} loading={loading} disabled={!text.trim()} label="ANALYSE →" />
      {stats && (
        <div style={{ ...S.panel, marginTop: 16 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 3, color: 'var(--muted)', marginBottom: 12 }}>TEXT STATISTICS</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 10, marginBottom: 16 }}>
            {[
              ['Characters', stats.characters],
              ['Words', stats.words],
              ['Sentences', stats.sentences],
              ['Paragraphs', stats.paragraphs],
              ['Reading Time', stats.reading_time],
              ['Avg Word Len', stats.avg_word_length],
            ].map(([label, val]) => (
              <div key={label} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', padding: '12px 14px' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--muted)', letterSpacing: 2, marginBottom: 4 }}>{label.toUpperCase()}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700, color: 'var(--cyan)' }}>{val}</div>
              </div>
            ))}
          </div>
          {stats.top_words?.length > 0 && (
            <>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 3, color: 'var(--muted)', marginBottom: 8 }}>TOP WORDS</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {stats.top_words.map(([word, count]) => (
                  <span key={word} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, padding: '3px 10px',
                    background: 'color-mix(in srgb, var(--cyan) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--cyan) 25%, transparent)', color: 'var(--cyan)' }}>
                    {word} <span style={{ opacity: 0.6 }}>×{count}</span>
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export function CompareTextB() {
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [diff, setDiff] = useState(null)
  const run = async () => {
    if (files.length < 2) { setError('Select exactly 2 text files.'); return }
    setError(''); setDiff(null); setLoading(true)
    try {
      const fd = new FormData(); fd.append('file1', files[0]); fd.append('file2', files[1])
      const res = await fetch(`${API}/text/compare`, { method: 'POST', body: fd })
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      setDiff(await res.json())
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }
  return (
    <div>
      <DropZone onFiles={setFiles} accept=".txt,.md,.js,.ts,.jsx,.tsx,.py,.json,.csv,.html,.css" multiple files={files} />
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', marginTop: 6 }}>Select 2 text files to compare.</div>
      <StatusBox error={error} />
      <RunBtn onClick={run} loading={loading} disabled={files.length < 2} label="COMPARE →" />
      {diff && (
        <div style={{ ...S.panel, marginTop: 16 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 3, color: 'var(--muted)', marginBottom: 10 }}>DIFF RESULT</div>
          <pre style={{ fontFamily: 'monospace', fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            maxHeight: 500, overflowY: 'auto', margin: 0, lineHeight: 1.6 }}>
            {diff.diff?.map((line, i) => (
              <span key={i} style={{ display: 'block', background: line.startsWith('+') ? 'color-mix(in srgb, var(--green) 7%, transparent)' : line.startsWith('-') ? 'rgba(255,71,87,.07)' : 'transparent', color: line.startsWith('+') ? 'var(--green)' : line.startsWith('-') ? '#ff4757' : 'var(--muted)' }}>
                {line}
              </span>
            ))}
          </pre>
        </div>
      )}
    </div>
  )
}

export function Base64ToolB() {
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const run = async (mode) => {
    if (!input.trim()) return
    setError(''); setOutput(''); setLoading(true)
    try {
      const data = await callJSON(`/text/base64-${mode}`, { text: input })
      setOutput(data.result || '')
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }
  const copy = () => navigator.clipboard.writeText(output).catch(() => {})
  return (
    <div>
      <Field label="Input text or Base64 string">
        <textarea value={input} onChange={e => setInput(e.target.value)} rows={5}
          style={{ ...S.input, resize: 'vertical', fontFamily: 'monospace', fontSize: 12 }}
          placeholder="Enter text to encode, or Base64 to decode…" />
      </Field>
      <StatusBox error={error} />
      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <button onClick={() => run('encode')} disabled={loading || !input.trim()} style={{ ...S.btn, background: 'var(--green)', color: '#000' }}>ENCODE →</button>
        <button onClick={() => run('decode')} disabled={loading || !input.trim()} style={{ ...S.btnOut }}>DECODE →</button>
      </div>
      {output && (
        <div style={{ ...S.panel, marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 3, color: 'var(--muted)' }}>RESULT</span>
            <button onClick={copy} style={{ ...S.btnSm, fontSize: 9 }}>COPY</button>
          </div>
          <pre style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--cyan)', whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0, maxHeight: 300, overflowY: 'auto' }}>{output}</pre>
        </div>
      )}
    </div>
  )
}

export function JsonFormatterB() {
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [indent, setIndent] = useState('2')
  const run = async (mode) => {
    if (!input.trim()) return
    setError(''); setOutput(''); setLoading(true)
    try {
      const data = await callJSON('/text/json-format', { json: input, indent: Number(indent), minify: mode === 'minify' })
      setOutput(data.result || '')
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }
  const copy = () => navigator.clipboard.writeText(output).catch(() => {})
  return (
    <div>
      <Field label="JSON input">
        <textarea value={input} onChange={e => setInput(e.target.value)} rows={8}
          style={{ ...S.input, resize: 'vertical', fontFamily: 'monospace', fontSize: 12 }}
          placeholder='{"key": "value"}' />
      </Field>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 14 }}>
        <Field label="Indent spaces">
          <div style={{ width: 120 }}>
            <Select value={indent} onChange={setIndent}
              options={['2','4','8'].map(n => [n, `${n} spaces`])} />
          </div>
        </Field>
      </div>
      <StatusBox error={error} />
      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <button onClick={() => run('format')} disabled={loading || !input.trim()} style={{ ...S.btn }}>FORMAT →</button>
        <button onClick={() => run('minify')} disabled={loading || !input.trim()} style={{ ...S.btnOut }}>MINIFY →</button>
      </div>
      {output && (
        <div style={{ ...S.panel, marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 3, color: 'var(--muted)' }}>RESULT</span>
            <button onClick={copy} style={{ ...S.btnSm, fontSize: 9 }}>COPY</button>
          </div>
          <pre style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--green)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, maxHeight: 400, overflowY: 'auto' }}>{output}</pre>
        </div>
      )}
    </div>
  )
}
