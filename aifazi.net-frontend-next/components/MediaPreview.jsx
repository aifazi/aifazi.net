'use client'
import { useState, useEffect, useRef } from 'react'
import api, { mediaUrl } from '@/lib/api'
import { NeonButton } from './community'
import { notify } from '../core/notify.jsx'

// ── Helpers ───────────────────────────────────────────────────────────────────
function extOf(name = '') {
  const m = String(name).toLowerCase().match(/\.([a-z0-9]+)(?:$|[?#])/)
  return m ? m[1] : ''
}

const CODE_EXT = new Set(['js','jsx','ts','tsx','py','sh','bash','html','htm','css','scss','json','yaml','yml','go','rs','java','c','cpp','h','hpp','cs','php','rb','swift','kt','sql','xml','vue','svelte','toml','ini','cfg','env','dockerfile','md','markdown'])
const IMG_EXT = new Set(['png','jpg','jpeg','gif','webp','svg','avif','bmp'])
const VID_EXT = new Set(['mp4','webm','ogg','mov','m4v'])
const WORD_EXT = new Set(['doc','docx','rtf','odt'])
const SHEET_EXT = new Set(['xls','xlsx','csv','ods'])
const SLIDE_EXT = new Set(['ppt','pptx','odp'])

function mimeOrExt(file) {
  const mt = (file?.mimetype || file?.mimeType || file?.type || '').toLowerCase()
  const ext = extOf(file?.original_name || file?.name || file?.filename || file?.url || '')
  return { mt, ext }
}

function fileKind(file) {
  const { mt, ext } = mimeOrExt(file)
  if (mt.startsWith('image/') || IMG_EXT.has(ext)) return 'image'
  if (mt.startsWith('video/') || VID_EXT.has(ext)) return 'video'
  if (mt === 'application/pdf' || ext === 'pdf') return 'pdf'
  if (mt.startsWith('audio/')) return 'audio'
  if (mt.includes('json') || mt.includes('text/') || CODE_EXT.has(ext)) return 'code'
  if (mt.includes('word') || WORD_EXT.has(ext)) return 'word'
  if (mt.includes('sheet') || mt.includes('excel') || mt.includes('csv') || SHEET_EXT.has(ext)) return 'sheet'
  if (mt.includes('presentation') || SLIDE_EXT.has(ext)) return 'slides'
  if (mt.includes('zip') || mt.includes('compressed') || ext === 'zip' || ext === 'rar' || ext === '7z' || ext === 'tar' || ext === 'gz') return 'archive'
  return 'file'
}

const KIND_ICON = {
  image: '🖼', video: '🎬', pdf: '📄', code: '👩‍💻',
  word: '📝', sheet: '📊', slides: '📽', archive: '📦', audio: '🎵', file: '📎',
}

function formatSize(bytes) {
  if (!bytes) return ''
  const n = Number(bytes)
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)}MB`
  if (n >= 1024) return `${(n / 1024).toFixed(0)}KB`
  return `${n}B`
}

// ── Icon / label card for non-image, non-video, non-code files ───────────────
function FileIconCard({ file, kind, label }) {
  const url = file?.url || file?.path
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="media-file-card">
      <div className="media-file-icon">{KIND_ICON[kind] || '📎'}</div>
      <div className="media-file-meta">
        <div className="media-file-name">{label}</div>
        <div className="media-file-sub">
          <span>{kind === 'pdf' ? 'PDF' : kind === 'word' ? 'Word' : kind === 'sheet' ? 'Excel' : kind === 'slides' ? 'Presentation' : kind === 'archive' ? 'Archive' : (file?.mimetype?.split('/')[1] || extOf(label) || 'file').toUpperCase()}</span>
          {formatSize(file?.size) && <span> · {formatSize(file?.size)}</span>}
        </div>
      </div>
      <span className="media-file-download">⤓</span>
    </a>
  )
}

// ── Code preview block (fetch + render) ───────────────────────────────────────
function CodePreview({ file }) {
  const [text, setText] = useState(null)
  const [failed, setFailed] = useState(false)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    fetch(file?.url || file?.path, { mode: 'cors' })
      .then(r => {
        if (!r.ok) throw new Error()
        return r.text()
      })
      .then(t => setText(t))
      .catch(() => setFailed(true))
  }, [file?.url, file?.path])

  const name = file?.original_name || file?.name || file?.filename || 'code'
  const lines = text ? text.split('\n').length : 0
  const preview = text ? (expanded ? text : text.split('\n').slice(0, 40).join('\n')) : ''

  return (
    <div className="media-code-card">
      <div className="media-code-header">
        <span className="media-code-name">👩‍💻 {name}</span>
        <span className="media-code-lang">{extOf(name).toUpperCase() || 'CODE'}</span>
      </div>
      {failed ? (
        <div className="media-code-fail">Preview unavailable — <a href={file?.url || file?.path} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--cyan)' }}>open file</a></div>
      ) : text === null ? (
        <pre className="media-code-body"><span style={{ opacity: 0.4 }}>Loading preview…</span></pre>
      ) : (
        <>
          <pre className="media-code-body">{preview}</pre>
          {lines > 40 && (
            <button className="media-code-toggle" onClick={() => setExpanded(!expanded)}>
              {expanded ? '△ Collapse' : `▽ Show all ${lines} lines`}
            </button>
          )}
        </>
      )}
    </div>
  )
}

// ── Lightbox for images ───────────────────────────────────────────────────────
function ImagePreview({ file }) {
  const [open, setOpen] = useState(false)
  const [failed, setFailed] = useState(false)
  const src = file?.url || file?.path
  const name = file?.original_name || file?.name || file?.filename || 'image'
  if (!src) return null
  return (
    <>
      <div className="media-image-frame" onClick={() => setOpen(true)} role="button" title="Click to view full size">
        {failed ? (
          <a href={src} target="_blank" rel="noopener noreferrer" className="media-file-card" style={{ border: 'none' }}>
            <div className="media-file-icon">🖼</div>
            <div className="media-file-meta">
              <div className="media-file-name">{name}</div>
              <div className="media-file-sub">IMAGE</div>
            </div>
          </a>
        ) : (
          <img src={mediaUrl(src)} alt={name} loading="lazy"
            onError={() => setFailed(true)}
            className="media-image" />
        )}
      </div>
      {open && (
        <div className="media-lightbox" onClick={() => setOpen(false)}>
          <div className="media-lightbox-inner" onClick={e => e.stopPropagation()}>
            <button className="media-lightbox-close" onClick={() => setOpen(false)}>✕</button>
            <img src={mediaUrl(src)} alt={name} style={{ maxWidth: '100%', maxHeight: '82vh', borderRadius: 10, display: 'block', margin: '0 auto' }} />
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', textAlign: 'center', marginTop: 12 }}>{name}</div>
          </div>
        </div>
      )}
    </>
  )
}

// ── Video preview ─────────────────────────────────────────────────────────────
function VideoPreview({ file }) {
  const src = file?.url || file?.path
  const name = file?.original_name || file?.name || file?.filename || 'video'
  if (!src) return null
  return (
    <video controls src={mediaUrl(src)} preload="metadata" className="media-video">
      <a href={mediaUrl(src)}>{name}</a>
    </video>
  )
}

// ── Office preview (Word / Excel / slides) via Google Docs viewer + direct link
function OfficePreview({ file }) {
  const url = file?.url || file?.path
  const { ext } = mimeOrExt(file)
  const name = file?.original_name || file?.name || file?.filename || 'document'
  const isSheet = ext === 'csv'
  const viewerSrc = `https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`
  return (
    <div className="media-office">
      <div className="media-office-bar">
        <span className="media-file-icon" style={{ fontSize: 16 }}>{isSheet ? '📊' : '📝'}</span>
        <span className="media-file-name" style={{ color: 'var(--text)', fontSize: 12, fontWeight: 600 }}>{name}</span>
        <a href={url} target="_blank" rel="noopener noreferrer" className="media-file-download" style={{ color: 'var(--green)', fontSize: 10 }}>OPEN ↗</a>
      </div>
      <iframe src={viewerSrc} className="media-office-iframe" title={name} />
    </div>
  )
}

// ── Main attachment renderer ──────────────────────────────────────────────────
export function MediaAttachment({ file, maxWidth = 700 }) {
  const name = file?.original_name || file?.name || file?.filename || 'file'
  const kind = fileKind(file)
  if (kind === 'image') return <ImagePreview file={file} />
  if (kind === 'video') return <VideoPreview file={file} />
  if (kind === 'code')  return <CodePreview file={file} />
  if (kind === 'pdf')   return (
    <div style={{ maxWidth }}>
      <FileIconCard file={file} kind="pdf" label={name} />
    </div>
  )
  if (kind === 'word' || kind === 'sheet' || kind === 'slides') return <OfficePreview file={file} />
  return <FileIconCard file={file} kind={kind} label={name} />
}

export { fileKind, extOf }

// ── Media uploader (shared by forum composers) ─────────────────────────────────
const MEDIA_ACCEPT = {
  image: 'image/*',
  video: 'video/*',
  code: '.js,.jsx,.ts,.tsx,.py,.sh,.bash,.html,.htm,.css,.scss,.json,.yaml,.yml,.go,.rs,.java,.c,.cpp,.h,.cs,.php,.rb,.swift,.kt,.sql,.xml,.toml,.ini,.md,.markdown,.txt,.env,.dockerfile',
  document: '.pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.rtf,.odt,.zip,.rar,.7z,.tar,.gz',
  all: undefined,
}

const KIND_CHIPS = [
  { key: 'all', label: '📎 All' },
  { key: 'image', label: '🖼 Image' },
  { key: 'video', label: '🎬 Video' },
  { key: 'code', label: '👩‍💻 Code' },
  { key: 'document', label: '📄 Document' },
]

export function MediaUploader({ onUploaded, defaultKind = 'all', buttonLabel }) {
  const [uploading, setUploading] = useState(false)
  const [attachments, setAttachments] = useState([])
  const [kind, setKind] = useState(defaultKind)
  const inputRef = useRef()

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files)
    if (!files.length) return
    setUploading(true)
    const formData = new FormData()
    files.forEach(f => formData.append('files', f))
    try {
      const res = await api.post('/upload/multiple', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      const next = [...attachments, ...res.data]
      setAttachments(next)
      onUploaded(next)
    } catch { notify.error('Upload failed') }
    finally { setUploading(false) }
  }

  const remove = (i) => {
    const next = attachments.filter((_, idx) => idx !== i)
    setAttachments(next)
    onUploaded(next)
  }

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
        {KIND_CHIPS.map(k => (
          <button key={k.key} type="button" onClick={() => setKind(k.key)}
            style={{
              fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 1,
              padding: '6px 12px', borderRadius: 999, cursor: 'pointer',
              border: `1px solid ${kind === k.key ? 'rgba(0,255,136,0.4)' : 'var(--border)'}`,
              background: kind === k.key ? 'rgba(0,255,136,0.1)' : 'transparent',
              color: kind === k.key ? 'var(--green)' : 'var(--muted)',
              transition: 'all 0.15s',
            }}
          >{k.label}</button>
        ))}
        <NeonButton variant="ghost" size="sm" onClick={() => inputRef.current.click()} disabled={uploading}
          style={{ marginLeft: 'auto' }}>
          {uploading ? '⏳ Uploading...' : (buttonLabel || '📎 Attach Files')}
        </NeonButton>
      </div>
      <input ref={inputRef} type="file" multiple style={{ display: 'none' }} accept={MEDIA_ACCEPT[kind]} onChange={handleUpload} />
      {attachments.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          {attachments.map((f, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 999, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text)' }}>
              {f.mimetype?.startsWith('image/') ? '🖼' : f.mimetype?.startsWith('video/') ? '🎬' : f.mimetype === 'application/pdf' ? '📄' : '📎'} {f.original_name}
              <button onClick={() => remove(i)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 12, padding: 0 }}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
