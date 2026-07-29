'use client'
import { useState, useRef } from 'react'
import { loadTesseract, readAB, readDataUrl, downloadBlob, fmtBytes, S, DropZone, FileBadge, Progress } from './shared.jsx'
import { Select, Slider } from '../../core/ui.jsx'

function CompressImage() {
  const [orig, setOrig]     = useState(null)
  const [preview, setPreview] = useState(null)
  const [quality, setQuality] = useState(80)
  const [result, setResult]   = useState(null)

  const load = async ([f]) => {
    const url = await readDataUrl(f)
    setOrig({ file:f, url })
    setResult(null)
    compress(f, url, quality)
  }

  const compress = (file, url, q) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth; canvas.height = img.naturalHeight
      canvas.getContext('2d').drawImage(img, 0, 0)
      const mime = file.type === 'image/png' ? 'image/jpeg' : file.type
      canvas.toBlob(blob => {
        const pct = Math.round((1 - blob.size / file.size) * 100)
        setResult({ blob, mime, origSize:file.size, newSize:blob.size, pct, url:URL.createObjectURL(blob) })
      }, mime, q / 100)
    }
    img.src = url
  }

  const onQuality = q => {
    setQuality(q)
    if (orig) compress(orig.file, orig.url, q)
  }

  return (
    <div>
      <DropZone accept="image/jpeg,image/jpg,image/png,image/webp" onFiles={load} label="Drop image to compress" />
      {orig && (
        <div style={{ marginTop:16 }}>
          <div style={{ marginBottom:16 }}>
            <label style={S.label}>QUALITY — {quality}%</label>
            <Slider min={10} max={100} value={quality} onChange={onQuality} />
            <div style={{ display:'flex', justifyContent:'space-between', fontFamily:'var(--font-mono)', fontSize:9, color:'var(--muted)' }}>
              <span>10% — Smallest</span><span>100% — Lossless</span>
            </div>
          </div>
          {result && (
            <div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
                <div style={{ textAlign:'center' }}>
                  <div style={S.label}>ORIGINAL — {fmtBytes(result.origSize)}</div>
                  <img src={orig.url} alt="" style={{ maxWidth:'100%', maxHeight:180, objectFit:'contain', border:'1px solid var(--border)' }} />
                </div>
                <div style={{ textAlign:'center' }}>
                  <div style={S.label}>COMPRESSED — {fmtBytes(result.newSize)} ({result.pct > 0 ? `-${result.pct}%` : 'PNG→JPG'})</div>
                  <img src={result.url} alt="" style={{ maxWidth:'100%', maxHeight:180, objectFit:'contain', border:'1px solid var(--border)' }} />
                </div>
              </div>
              <button onClick={() => downloadBlob(result.blob, orig.file.name.replace(/\.[^.]+$/, '_compressed.jpg'))} style={S.btn}>
                ⬇ DOWNLOAD COMPRESSED IMAGE
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ResizeImage() {
  const [orig, setOrig]   = useState(null)
  const [w, setW]         = useState('')
  const [h, setH]         = useState('')
  const [lock, setLock]   = useState(true)
  const [ratio, setRatio] = useState(1)
  const [fmt, setFmt]     = useState('image/jpeg')
  const [err, setErr]     = useState('')

  const load = async ([f]) => {
    const url = await readDataUrl(f)
    const img = new Image()
    img.onload = () => {
      setOrig({ file:f, url, w:img.naturalWidth, h:img.naturalHeight })
      setW(String(img.naturalWidth)); setH(String(img.naturalHeight))
      setRatio(img.naturalWidth / img.naturalHeight)
    }
    img.src = url
  }

  const onW = v => {
    setW(v)
    if (lock && ratio) setH(String(Math.round(parseInt(v) / ratio)))
  }
  const onH = v => {
    setH(v)
    if (lock && ratio) setW(String(Math.round(parseInt(v) * ratio)))
  }

  const resize = () => {
    if (!orig) return
    const nw = parseInt(w), nh = parseInt(h)
    if (!nw || !nh || nw < 1 || nh < 1) return setErr('Enter valid dimensions')
    setErr('')
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = nw; canvas.height = nh
      canvas.getContext('2d').drawImage(img, 0, 0, nw, nh)
      canvas.toBlob(blob => downloadBlob(blob, orig.file.name.replace(/\.[^.]+$/, `_${nw}x${nh}.${fmt.split('/')[1]}`)), fmt, 0.92)
    }
    img.src = orig.url
  }

  return (
    <div>
      <DropZone accept="image/*" onFiles={load} label="Drop image to resize" />
      {orig && (
        <div style={{ marginTop:16 }}>
          <div style={{ ...S.success }}>
            Original: {orig.w} × {orig.h}px — {fmtBytes(orig.file.size)}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr auto 1fr 1fr', gap:12, marginTop:16, alignItems:'end' }}>
            <div>
              <label style={S.label}>WIDTH (px)</label>
              <input type="number" value={w} onChange={e => onW(e.target.value)} min="1" style={S.input} />
            </div>
            <button onClick={() => setLock(!lock)} title="Lock aspect ratio"
              style={{ ...S.btnSm, background:'none', border:'1px solid var(--border)', color: lock ? 'var(--green)' : 'var(--muted)', padding:'10px', alignSelf:'end', marginBottom:1 }}>
              {lock ? '🔒' : '🔓'}
            </button>
            <div>
              <label style={S.label}>HEIGHT (px)</label>
              <input type="number" value={h} onChange={e => onH(e.target.value)} min="1" style={S.input} />
            </div>
            <div>
              <label style={S.label}>FORMAT</label>
              <Select value={fmt} onChange={setFmt}
                options={[['image/jpeg', 'JPEG'], ['image/png', 'PNG'], ['image/webp', 'WebP']]} />
            </div>
          </div>
          <button onClick={resize} style={{ ...S.btn, marginTop:16 }}>⬇ RESIZE & DOWNLOAD</button>
          {err && <div style={S.err}>⚠ {err}</div>}
        </div>
      )}
    </div>
  )
}

function ConvertImage() {
  const [files, setFiles] = useState([])
  const [fmt, setFmt]     = useState('image/webp')
  const [busy, setBusy]   = useState(false)
  const [done, setDone]   = useState(0)

  const convert = async () => {
    if (!files.length) return
    setBusy(true); setDone(0)
    const ext = fmt.split('/')[1]
    for (let i = 0; i < files.length; i++) {
      const url = await readDataUrl(files[i])
      await new Promise(res => {
        const img = new Image()
        img.onload = () => {
          const c = document.createElement('canvas')
          c.width = img.naturalWidth; c.height = img.naturalHeight
          c.getContext('2d').drawImage(img, 0, 0)
          c.toBlob(blob => {
            const name = files[i].name.replace(/\.[^.]+$/, `.${ext}`)
            downloadBlob(blob, name)
            setDone(i + 1)
            setTimeout(res, 150)
          }, fmt, 0.93)
        }
        img.src = url
      })
    }
    setBusy(false)
  }

  return (
    <div>
      <DropZone accept="image/*" multiple onFiles={fs => setFiles(p => [...p, ...fs])} label="Drop images to convert format" />
      {files.length > 0 && (
        <div style={{ marginTop:16 }}>
          {files.map((f,i) => <FileBadge key={i} file={f} onRemove={() => setFiles(p => p.filter((_,j)=>j!==i))} />)}
          <div style={{ display:'flex', gap:12, marginTop:16, alignItems:'center', flexWrap:'wrap' }}>
            <div>
              <label style={S.label}>CONVERT TO</label>
              <div style={{ width: 220 }}>
                <Select value={fmt} onChange={setFmt}
                  options={[
                    ['image/webp', 'WebP (best compression)'],
                    ['image/jpeg', 'JPEG'],
                    ['image/png', 'PNG (lossless)'],
                  ]} />
              </div>
            </div>
            <button onClick={convert} disabled={busy} style={{ ...S.btn, alignSelf:'end' }}>
              {busy ? `CONVERTING ${done}/${files.length}...` : `⬇ CONVERT ${files.length} IMAGE(S)`}
            </button>
          </div>
          {done > 0 && !busy && <div style={S.success}>✓ Converted {done} image(s)</div>}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// OCR TOOL
// ═══════════════════════════════════════════════════════════════════

function ImageOCR() {
  const [file, setFile]   = useState(null)
  const [preview, setPreview] = useState('')
  const [text, setText]   = useState('')
  const [busy, setBusy]   = useState(false)
  const [pct, setPct]     = useState(0)
  const [err, setErr]     = useState('')
  const [lang, setLang]   = useState('eng')
  const [copied, setCopied] = useState(false)

  const load = async ([f]) => {
    setFile(f); setText(''); setErr('')
    setPreview(await readDataUrl(f))
  }

  const run = async () => {
    if (!file) return
    setErr(''); setText(''); setBusy(true); setPct(0)
    try {
      const Tesseract = await loadTesseract()
      const { data: { text: t } } = await Tesseract.recognize(file, lang, {
        logger: m => { if (m.status === 'recognizing text') setPct(Math.round(m.progress * 100)) }
      })
      setText(t.trim())
    } catch(e) { setErr('OCR failed: ' + e.message) }
    finally { setBusy(false) }
  }

  const copy = () => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000) }
  const save = () => downloadBlob(new Blob([text],{type:'text/plain'}), file?.name?.replace(/\.[^.]+$/,'.txt') || 'ocr_output.txt')

  return (
    <div>
      <div style={{ ...S.panel, marginBottom:16, padding:'12px 16px' }}>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--orange)', letterSpacing:2 }}>
          ⚡ OCR runs entirely in your browser using Tesseract.js. First run downloads the language model (~10 MB). No data leaves your device.
        </div>
      </div>
      <DropZone accept="image/*" onFiles={load} label="Drop image to extract text (OCR)" />
      {file && (
        <div style={{ marginTop:16 }}>
          {preview && <img src={preview} alt="preview" style={{ maxWidth:'100%', maxHeight:300, objectFit:'contain', border:'1px solid var(--border)', marginBottom:12 }} />}
          <div style={{ display:'flex', gap:12, alignItems:'end', flexWrap:'wrap', marginBottom:16 }}>
            <div>
              <label style={S.label}>LANGUAGE</label>
              <div style={{ width: 220 }}>
                <Select value={lang} onChange={setLang}
                  options={[
                    ['eng', 'English'],
                    ['ara', 'Arabic'],
                    ['fra', 'French'],
                    ['deu', 'German'],
                    ['spa', 'Spanish'],
                    ['chi_sim', 'Chinese (Simplified)'],
                    ['jpn', 'Japanese'],
                    ['tur', 'Turkish'],
                  ]} />
              </div>
            </div>
            <button onClick={run} disabled={busy} style={S.btn}>{busy ? `SCANNING... ${pct}%` : '⟳ EXTRACT TEXT'}</button>
          </div>
          {busy && <Progress pct={pct} label="RUNNING OCR" />}
        </div>
      )}
      {err && <div style={S.err}>⚠ {err}</div>}
      {text && (
        <div style={{ marginTop:16 }}>
          <div style={{ display:'flex', gap:8, marginBottom:10 }}>
            <button onClick={copy} style={{ ...S.btnSm, background: copied ? 'var(--cyan)':'var(--green)' }}>{copied ? '✓ COPIED':'COPY TEXT'}</button>
            <button onClick={save} style={S.btnSm}>⬇ SAVE AS .TXT</button>
          </div>
          <textarea readOnly value={text} rows={14}
            style={{ ...S.input, fontFamily:'var(--font-mono)', fontSize:12, color:'var(--text2)', resize:'vertical', lineHeight:1.7 }} />
        </div>
      )}
    </div>
  )
}


// ═══════════════════════════════════════════════════════════════════
// NEW PDF TOOLS
// ═══════════════════════════════════════════════════════════════════

function FlipImage() {
  const [orig, setOrig] = useState(null)
  const [result, setResult] = useState(null)
  const [mode, setMode] = useState('horizontal')

  const load = async ([f]) => {
    const url = await readDataUrl(f)
    setOrig({ file:f, url }); setResult(null)
  }

  const flip = () => {
    if (!orig) return
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = img.naturalWidth; c.height = img.naturalHeight
      const ctx = c.getContext('2d')
      if (mode === 'horizontal') { ctx.translate(c.width, 0); ctx.scale(-1, 1) }
      else { ctx.translate(0, c.height); ctx.scale(1, -1) }
      ctx.drawImage(img, 0, 0)
      c.toBlob(blob => setResult({ blob, url: URL.createObjectURL(blob) }), orig.file.type || 'image/jpeg', 0.95)
    }
    img.src = orig.url
  }

  return (
    <div>
      <DropZone accept="image/*" onFiles={load} label="Drop image to flip / mirror" />
      {orig && (
        <div style={{ marginTop:16 }}>
          <div style={{ display:'flex', gap:8, marginBottom:16 }}>
            {[['horizontal','↔ Flip Horizontal'],['vertical','↕ Flip Vertical']].map(([v,l]) => (
              <button key={v} onClick={()=>setMode(v)} style={{ fontFamily:'var(--font-mono)', fontSize:10, padding:'8px 16px', background: mode===v?'rgba(0,255,136,.1)':'var(--bg3)', color: mode===v?'var(--green)':'var(--muted)', border:`1px solid ${mode===v?'rgba(0,255,136,.4)':'var(--border)'}`, cursor:'pointer' }}>{l}</button>
            ))}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:result?'1fr 1fr':'1fr', gap:16, marginBottom:16 }}>
            <div style={{ textAlign:'center' }}>
              <div style={S.label}>ORIGINAL</div>
              <img src={orig.url} alt="" style={{ maxWidth:'100%', maxHeight:200, objectFit:'contain', border:'1px solid var(--border)' }} />
            </div>
            {result && (
              <div style={{ textAlign:'center' }}>
                <div style={S.label}>FLIPPED</div>
                <img src={result.url} alt="" style={{ maxWidth:'100%', maxHeight:200, objectFit:'contain', border:'1px solid var(--border)' }} />
              </div>
            )}
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={flip} style={S.btn}>⟳ APPLY FLIP</button>
            {result && <button onClick={() => downloadBlob(result.blob, orig.file.name.replace(/\.[^.]+$/, '_flipped.jpg'))} style={S.btnOut}>⬇ DOWNLOAD</button>}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Add Image Watermark ───────────────────────────────────────────
function ImageWatermark() {
  const [base, setBase]   = useState(null)
  const [text, setText]   = useState('© aifazi.net')
  const [opacity, setOpacity] = useState(0.35)
  const [pos, setPos]     = useState('bottom-right')
  const [result, setResult] = useState(null)

  const load = async ([f]) => { setBase({ file:f, url: await readDataUrl(f) }); setResult(null) }

  const apply = () => {
    if (!base) return
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = img.naturalWidth; c.height = img.naturalHeight
      const ctx = c.getContext('2d')
      ctx.drawImage(img, 0, 0)
      ctx.globalAlpha = opacity
      ctx.font = `${Math.round(c.width * 0.04)}px Arial`
      ctx.fillStyle = '#ffffff'
      const tw = ctx.measureText(text).width
      const pad = 20
      const positions = {
        'bottom-right':  [c.width - tw - pad, c.height - pad],
        'bottom-left':   [pad, c.height - pad],
        'top-right':     [c.width - tw - pad, pad + 30],
        'top-left':      [pad, pad + 30],
        'center':        [c.width/2 - tw/2, c.height/2],
      }
      const [x, y] = positions[pos] || positions['bottom-right']
      ctx.fillText(text, x, y)
      c.toBlob(blob => setResult({ blob, url: URL.createObjectURL(blob) }), 'image/jpeg', 0.95)
    }
    img.src = base.url
  }

  return (
    <div>
      <DropZone accept="image/*" onFiles={load} label="Drop image to add watermark" />
      {base && (
        <div style={{ marginTop:16 }}>
          <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr', gap:12, marginBottom:12 }}>
            <div>
              <label style={S.label}>WATERMARK TEXT</label>
              <input value={text} onChange={e=>setText(e.target.value)} style={S.input} />
            </div>
            <div>
              <label style={S.label}>OPACITY — {Math.round(opacity*100)}%</label>
              <Slider min={0.05} max={1} step={0.05} value={opacity} onChange={setOpacity} style={{ marginTop:10 }} />
            </div>
            <div>
              <label style={S.label}>POSITION</label>
              <Select value={pos} onChange={setPos}
                options={[['bottom-right','Bottom Right'],['bottom-left','Bottom Left'],['top-right','Top Right'],['top-left','Top Left'],['center','Center']]} />
            </div>
          </div>
          {result && (
            <div style={{ marginBottom:12 }}>
              <div style={S.label}>PREVIEW</div>
              <img src={result.url} alt="" style={{ maxWidth:'100%', maxHeight:240, objectFit:'contain', border:'1px solid var(--border)' }} />
            </div>
          )}
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={apply} style={S.btn}>⟳ APPLY WATERMARK</button>
            {result && <button onClick={()=>downloadBlob(result.blob, base.file.name.replace(/\.[^.]+$/,'_wm.jpg'))} style={S.btnOut}>⬇ DOWNLOAD</button>}
          </div>
        </div>
      )}
    </div>
  )
}


export { CompressImage, ResizeImage, ConvertImage, ImageOCR, FlipImage, ImageWatermark }
