'use client'
import React, { useState, useEffect, useRef, useCallback } from 'react'
import api from '@/lib/api'
import { useToast } from '../../components/Toast'
import { useDialog, dialog } from '../../components/Dialog'
import { DateTimePicker, Select } from '../../core/ui.jsx'
import { S, useIsMobile, SLASH_COMMANDS } from './shared'
import VideoPlayer from './VideoPlayer'

// ── Media URL helpers ─────────────────────────────────────────────────────────
const SUPA_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '')

// Primary URL: use whatever is stored in the DB (may include custom CDN domain)
function resolveMediaUrl(file) {
  const u = file?.url || file?.path || ''
  if (u.startsWith('http')) return u
  // Relative path — rebuild from storage_path as last resort
  if (file?.storage_path) return `${SUPA_URL}/storage/v1/object/public/media/${file.storage_path}`
  return u
}

/**
 * Provider-aware fallback URL.
 *
 * - cloudinary  → reconstruct the canonical res.cloudinary.com URL so a broken
 *                 custom domain (e.g. cdn.aifazi.net not yet proxied) never
 *                 blocks image display. Requires cdnConfig.cloudinaryCloudName.
 * - supabase /
 *   unknown     → build the Supabase Storage public URL from storage_path.
 * - other CDNs  → null (no known direct-access fallback).
 */
function buildProviderFallback(file, cdnConfig) {
  const { storage_path, provider, mimetype } = file || {}
  if (!storage_path) return null

  if (provider === 'cloudinary') {
    const cloud = cdnConfig?.cloudinaryCloudName
    if (!cloud) return null
    const resType = mimetype?.startsWith('video/') ? 'video' : 'image'
    // storage_path = Cloudinary public_id (e.g. "media/portfolio/photo.jpg")
    return `https://res.cloudinary.com/${cloud}/${resType}/upload/${storage_path}`
  }

  // supabase, undefined provider, or any non-CDN file
  return `${SUPA_URL}/storage/v1/object/public/media/${storage_path}`
}

// ── Media thumbnail with 3-level fallback chain ───────────────────────────────
// 1. Stored URL (may use custom CDN domain)
// 2. Provider-aware fallback (original Cloudinary URL -or- Supabase direct URL)
// 3. Styled placeholder — no ugly browser broken-image icons
function MediaThumb({ file, height = 120, cdnConfig = null }) {
  const [src, setSrc] = useState(() => resolveMediaUrl(file))
  const [failed, setFailed] = useState(false)
  const triedFallback = useRef(false)

  const handleError = () => {
    if (!triedFallback.current) {
      triedFallback.current = true
      const fallback = buildProviderFallback(file, cdnConfig)
      if (fallback && fallback !== src) { setSrc(fallback); return }
    }
    setFailed(true)
  }

  // Non-image / non-video → always show the icon placeholder
  const isImage = file.mimetype?.startsWith('image/')
  const isVideo = file.mimetype?.startsWith('video/')
  const isPdf   = file.mimetype === 'application/pdf'

  if (isVideo && !failed) {
    return (
      <video src={src} onError={handleError}
        style={{ width: '100%', height, objectFit: 'cover', display: 'block', background: '#000' }}
        muted preload="metadata" />
    )
  }

  if (failed || (!isImage && !isVideo)) {
    const icon  = isVideo ? '🎬' : isPdf ? '📄' : isImage ? '🖼️' : '📁'
    const label = failed
      ? file.provider === 'cloudinary' && !cdnConfig?.cloudinaryCloudName
        ? 'NO CLOUD NAME'
        : 'LOAD FAILED'
      : (file.mimetype?.split('/')[1] || 'file').toUpperCase()
    return (
      <div style={{
        width: '100%', height, background: 'var(--bg3)',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', gap: 6, padding: '0 8px',
      }}>
        <span style={{ fontSize: 26 }}>{icon}</span>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 1, textAlign: 'center',
          color: failed ? '#ff6b7a' : 'var(--muted)',
          padding: failed ? '2px 6px' : 0,
          background: failed ? 'rgba(255,71,87,0.1)' : 'transparent',
          border: failed ? '1px solid rgba(255,71,87,0.25)' : 'none',
        }}>{label}</span>
      </div>
    )
  }

  return (
    <img src={src} alt={file.original_name} onError={handleError}
      style={{ width: '100%', height, objectFit: 'cover', display: 'block' }} />
  )
}

function SlashMenu({ pos, query, onSelect, onClose }) {
  const [activeIdx, setActiveIdx] = useState(0)
  const allItems = SLASH_COMMANDS.flatMap(g => g.items)
  const filtered = query
    ? allItems.filter(i => i.label.toLowerCase().includes(query.toLowerCase()) || i.desc.toLowerCase().includes(query.toLowerCase()))
    : allItems
  const grouped = query ? [{ group: 'RESULTS', items: filtered }] : SLASH_COMMANDS
  const flatFiltered = grouped.flatMap(g => g.items)

  useEffect(() => { setActiveIdx(0) }, [query])
  useEffect(() => {
    const handler = e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i+1, flatFiltered.length-1)) }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx(i => Math.max(i-1, 0)) }
      if (e.key === 'Enter')     { e.preventDefault(); flatFiltered[activeIdx] && onSelect(flatFiltered[activeIdx]) }
      if (e.key === 'Escape')    { onClose() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [activeIdx, flatFiltered, onSelect, onClose])

  if (!flatFiltered.length) return null
  let flatI = 0
  return (
    <div style={{
      position: 'fixed', top: pos.top, left: pos.left, zIndex: 999999,
      width: Math.min(280, window.innerWidth - 16), maxHeight: 360, overflowY: 'auto',
      background: '#0f1820', border: '1px solid rgba(0,212,255,0.25)',
      boxShadow: '0 16px 48px rgba(0,0,0,0.9)', borderRadius: 6,
      fontFamily: "'Share Tech Mono', monospace",
    }}>
      {grouped.map(group => (
        <div key={group.group}>
          <div style={{ padding: '8px 14px 4px', fontSize: 9, letterSpacing: 2, color: 'rgba(0,212,255,0.5)' }}>{group.group}</div>
          {group.items.map(item => {
            const idx = flatI++
            const isActive = idx === activeIdx
            return (
              <div key={item.label}
                onMouseEnter={() => setActiveIdx(idx)}
                onMouseDown={e => { e.preventDefault(); onSelect(item) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '8px 14px', cursor: 'pointer',
                  background: isActive ? 'rgba(0,212,255,0.1)' : 'transparent',
                  borderLeft: `2px solid ${isActive ? 'var(--cyan)' : 'transparent'}`,
                }}
              >
                <div style={{
                  width: 28, height: 28, borderRadius: 4, flexShrink: 0,
                  background: isActive ? 'rgba(0,212,255,0.2)' : 'rgba(255,255,255,0.07)',
                  border: `1px solid ${isActive ? 'rgba(0,212,255,0.4)' : 'rgba(255,255,255,0.1)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, color: isActive ? 'var(--cyan)' : '#6a88a0', fontWeight: 700,
                }}>{item.icon}</div>
                <div>
                  <div style={{ fontSize: 13, color: isActive ? '#fff' : '#c8d8e8' }}>{item.label}</div>
                  <div style={{ fontSize: 10, color: '#4a6070', marginTop: 1 }}>{item.desc}</div>
                </div>
              </div>
            )
          })}
        </div>
      ))}
      <div style={{ padding: '6px 14px', fontSize: 9, color: '#2a3a48', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', gap: 12 }}>
        <span>↑↓ nav</span><span>⏎ select</span><span>esc close</span>
      </div>
    </div>
  )
}

// --- Rich Text Editor ---------------------------------------------------------
function RichEditor({ value, onChange }) {
  const editorRef = useRef()
  const [slashMenu, setSlashMenu] = useState(null)
  const isMobile = useIsMobile()

  const exec = (cmd, val = null) => { document.execCommand(cmd, false, val); editorRef.current?.focus() }
  const insert = html => { editorRef.current?.focus(); document.execCommand('insertHTML', false, html) }
  const editorActions = { exec, insert }

  const handleInput = () => { onChange(editorRef.current.innerHTML) }
  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) editorRef.current.innerHTML = value || ''
  }, [])

  const handleKeyDown = useCallback(e => {
    if (slashMenu) {
      if (['Enter','ArrowUp','ArrowDown','Escape'].includes(e.key)) e.preventDefault()
    }
  }, [slashMenu])

  const handleKeyUp = useCallback(e => {
    const sel = window.getSelection()
    if (!sel?.rangeCount) return
    const range = sel.getRangeAt(0)
    const text = range.startContainer.textContent || ''
    const lineText = text.substring(0, range.startOffset)
    const slashIdx = lineText.lastIndexOf('/')
    if (slashIdx !== -1) {
      const query = lineText.substring(slashIdx + 1)
      if (!query.includes(' ') && slashIdx === lineText.length - query.length - 1) {
        const rects = range.getBoundingClientRect()
        setSlashMenu({ top: rects.bottom + 8, left: Math.min(rects.left, window.innerWidth - 300), query, savedRange: range.cloneRange() })
        return
      }
    }
    setSlashMenu(null)
  }, [])

  const handleSlashSelect = useCallback(item => {
    if (slashMenu?.savedRange) {
      const sel = window.getSelection()
      sel.removeAllRanges()
      const r = slashMenu.savedRange.cloneRange()
      const text = r.startContainer.textContent || ''
      const slashIdx = text.lastIndexOf('/', r.startOffset - 1)
      if (slashIdx !== -1) {
        r.setStart(r.startContainer, slashIdx)
        r.setEnd(r.startContainer, r.startOffset)
        sel.addRange(r)
        document.execCommand('delete', false)
      }
    }
    editorRef.current?.focus()
    item.action(editorActions)
    setSlashMenu(null)
    setTimeout(() => { onChange(editorRef.current?.innerHTML || '') }, 50)
  }, [slashMenu, editorActions, onChange])

  const tools = [
    { label: 'B',   title: 'Bold',           action: () => exec('bold') },
    { label: 'I',   title: 'Italic',          action: () => exec('italic') },
    { label: 'U',   title: 'Underline',       action: () => exec('underline') },
    { label: 'H2',  title: 'Heading 2',       action: () => exec('formatBlock', '<h2>') },
    { label: 'H3',  title: 'Heading 3',       action: () => exec('formatBlock', '<h3>') },
    { label: '',   title: 'Paragraph',       action: () => exec('formatBlock', '<p>') },
    { label: 'UL',  title: 'Bullet List',     action: () => exec('insertUnorderedList') },
    { label: 'OL',  title: 'Numbered List',   action: () => exec('insertOrderedList') },
    { label: '',  title: 'Code',            action: () => insert('<code>code</code>') },
    { label: '{}', title: 'Code Block',      action: () => insert('<pre><code>your code here</code></pre>') },
    { label: '',   title: 'Divider',         action: () => insert('<hr/>') },
    { label: '"',   title: 'Blockquote',      action: () => exec('formatBlock', '<blockquote>') },
    { label: '○',  title: 'Link',            action: async () => { const url = await dialog.prompt({ title: 'Insert Link', placeholder: 'https://', variant: 'info', confirmLabel: 'INSERT' }); if (url) exec('createLink', url) } },
  ]

  return (
    <div style={{ border: '1px solid var(--border)', overflow: 'visible', position: 'relative' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, padding: 6, background: 'var(--bg3)', borderBottom: '1px solid var(--border)' }}>
        {tools.map(t => (
          <button key={t.label} title={t.title} onClick={t.action} type="button"
            style={{ fontFamily: 'var(--font-mono)', fontSize: 11, padding: isMobile ? '5px 7px' : '6px 10px', background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text)', cursor: 'pointer' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,255,136,0.1)'; e.currentTarget.style.color = 'var(--green)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg2)'; e.currentTarget.style.color = 'var(--text)' }}
          >{t.label}</button>
        ))}
        {!isMobile && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', paddingRight: 4 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'rgba(0,212,255,0.4)', letterSpacing: 1 }}>
              type <span style={{ color: 'var(--cyan)', background: 'rgba(0,212,255,0.08)', padding: '1px 5px', borderRadius: 2 }}>/</span> for commands
            </span>
          </div>
        )}
      </div>
      <div ref={editorRef} contentEditable suppressContentEditableWarning
        onInput={handleInput} onKeyDown={handleKeyDown} onKeyUp={handleKeyUp}
        style={{ minHeight: isMobile ? 200 : 320, padding: isMobile ? 12 : 20, outline: 'none', background: 'var(--bg2)', color: 'var(--text)', fontFamily: 'var(--font-display)', fontSize: 16, lineHeight: 1.8 }}
      />
      {slashMenu && <SlashMenu pos={{ top: slashMenu.top, left: slashMenu.left }} query={slashMenu.query} onSelect={handleSlashSelect} onClose={() => setSlashMenu(null)} />}
    </div>
  )
}

// --- Media Library ------------------------------------------------------------
// Props:
//   inline   render directly in the page (no modal overlay). Used by the
//             standalone Media admin panel. Default: false (modal).
//   onSelect  callback when a file is clicked (optional)
//   onClose   called when the ? button is clicked (modal mode only)
//   filter    optional mimetype prefix to filter files (e.g. 'video/')
function MediaLibrary({ onSelect, onClose, filter, inline = false }) {
  const toast = useToast()
  const { confirm } = useDialog()
  const isMobile = useIsMobile()
  const [files, setFiles] = useState([])
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [cdnConfig, setCdnConfig] = useState(null)   // ← CDN config from admin panel
  const fileInputRef = useRef()

  useEffect(() => {
    fetchFiles()
    // Fetch CDN proxy-config so MediaThumb can do provider-aware fallback.
    // /admin/cdn/proxy-config is a public endpoint — no auth required.
    api.get('/admin/cdn/proxy-config')
      .then(r => setCdnConfig(r.data || {}))
      .catch(() => setCdnConfig({}))
  }, [])
  const fetchFiles = async () => { try { const res = await api.get('/upload/media'); setFiles(res.data) } catch {} }

  // #10 — shared upload logic used by both input change and drop
  const uploadFiles = async fileList => {
    const selected = Array.from(fileList).filter(f => !filter || f.type.startsWith(filter))
    if (!selected.length) return
    setUploading(true)
    const formData = new FormData()
    selected.forEach(f => formData.append('files', f))
    try { await api.post('/upload/multiple', formData, { headers: { 'Content-Type': 'multipart/form-data' } }); await fetchFiles() }
    catch { toast.error('Upload failed', { title: 'Upload Error' }) }
    finally { setUploading(false) }
  }

  const handleUpload = async e => { await uploadFiles(e.target.files) }

  // #10 — drag-and-drop handlers
  const handleDragOver = e => { e.preventDefault(); setDragOver(true) }
  const handleDragLeave = e => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false) }
  const handleDrop = async e => {
    e.preventDefault(); setDragOver(false)
    if (e.dataTransfer.files.length) await uploadFiles(e.dataTransfer.files)
  }

  const handleDelete = async id => {
    const ok = await confirm({ title: 'Delete File', message: 'This file will be permanently removed.', variant: 'danger', confirmLabel: 'DELETE' })
    if (!ok) return
    await api.delete(`/upload/media/${id}`)
    setFiles(f => f.filter(x => x.id !== id))
  }

  const formatSize = s => s > 1024*1024 ? `${(s/1024/1024).toFixed(1)}MB` : `${(s/1024).toFixed(0)}KB`

  // -- Shared inner content --------------------------------------------------
  const inner = (
    <div style={{ width: '100%', background: 'var(--bg)', border: inline ? 'none' : '1px solid var(--border)', overflow: 'hidden', display: 'flex', flexDirection: 'column', ...(inline ? {} : { maxWidth: 900, maxHeight: '90vh' }) }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: isMobile ? '12px 16px' : '20px 24px', borderBottom: '1px solid var(--border)', background: 'var(--bg2)', gap: 8 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: isMobile ? 10 : 12, letterSpacing: 3, color: 'var(--green)' }}>MEDIA LIBRARY</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => fileInputRef.current.click()} disabled={uploading} style={{ ...S.btn(), fontSize: 10, padding: '8px 14px' }}>
            {uploading ? 'UPLOADING...' : '+ UPLOAD'}
          </button>
          {/* Only show ? close button in modal mode */}
          {!inline && onClose && (
            <button onClick={onClose} style={{ ...S.btn('transparent', 'var(--muted)'), border: '1px solid var(--border)', padding: '8px 12px' }}>?</button>
          )}
        </div>
        <input ref={fileInputRef} type="file" multiple accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.zip,.js,.py,.sh,.html,.css,.json,.md,.txt" onChange={handleUpload} style={{ display: 'none' }} />
      </div>
      <div style={{ overflowY: 'auto', padding: isMobile ? 12 : 24, flex: 1,
        border: dragOver ? '2px dashed var(--green)' : '2px dashed transparent',
        background: dragOver ? 'rgba(0,255,136,0.04)' : 'transparent',
        transition: 'all 0.15s', position: 'relative' }}
        onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
        {dragOver && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 10, pointerEvents: 'none' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, color: 'var(--green)', letterSpacing: 2, textAlign: 'center' }}>
              📂 DROP FILES TO UPLOAD
            </div>
          </div>
        )}
        {files.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 80, color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>No files yet. Upload some!</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? 120 : 160}px, 1fr))`, gap: isMobile ? 8 : 12 }}>
            {files.filter(file => !filter || file.mimetype.startsWith(filter)).map(file => (
              <div key={file.id} style={{ border: '1px solid var(--border)', overflow: 'hidden', cursor: onSelect ? 'pointer' : 'default', transition: 'border-color 0.2s' }}
                onClick={() => onSelect && onSelect(file)}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--green)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
              >
                <MediaThumb file={file} height={isMobile ? 90 : 120} cdnConfig={cdnConfig} />
                <div style={{ padding: '6px 8px', background: 'var(--bg2)' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.original_name}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)' }}>{formatSize(file.size)}</span>
                    <button onClick={e => { e.stopPropagation(); handleDelete(file.id) }} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 12, padding: 0 }}>?</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )

  // Inline mode: render directly, no modal backdrop
  if (inline) return inner

  // Modal mode: wrap with fixed overlay backdrop
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: isMobile ? 8 : 24 }}>
      {inner}
    </div>
  )
}

// --- Post Editor --------------------------------------------------------------
function PostEditor({ post, onSave, onCancel }) {
  const isMobile = useIsMobile()

  // Slug helper — avoids regex with \s inside [] which confuses some parsers
  const slugify = t => {
    return t.toLowerCase().trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 80)
  }

  const initialForm = {
    title:       post?.title       || '',
    slug:        post?.slug        || '',
    excerpt:     post?.excerpt     || '',
    content:     post?.content     || '',
    cover_image: post?.cover_image || '',
    video_url:   post?.video_url   || '',
    category:    post?.category    || 'General',
    tags:        post ? (typeof post.tags === 'string' ? JSON.parse(post.tags) : post.tags).join(', ') : '',
    published:   post?.published === 1 || post?.published === true || false,
    publish_at:  post?.publish_at ? new Date(post.publish_at).toISOString().slice(0, 16) : '',
  }
  const [form, setForm]         = useState(initialForm)
  const [isDirty, setIsDirty]       = useState(false)
  const [saving, setSaving]         = useState(false)
  const [mediaOpen, setMediaOpen]   = useState(false)
  const [mediaTarget, setMediaTarget] = useState(null)
  // #9 — Draft autosave
  const [autoStatus, setAutoStatus] = useState('idle') // 'idle'|'saving'|'saved'|'error'
  const [savedAt, setSavedAt]       = useState(null)
  const autosaveTimer = useRef(null)
  const formRef = useRef(form)
  useEffect(() => { formRef.current = form }, [form])

  useEffect(() => {
    const handler = e => { if (isDirty) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  const set = (k, v) => {
    setForm(f => ({
      ...f,
      [k]: v,
      ...(k === 'title' && (!f.slug || f.slug === slugify(f.title)) ? { slug: slugify(v) } : {}),
    }))
    setIsDirty(true)
    // #9 — debounce autosave (30s, only for existing posts)
    if (post?.id) {
      clearTimeout(autosaveTimer.current)
      autosaveTimer.current = setTimeout(async () => {
        setAutoStatus('saving')
        try {
          const f = formRef.current
          await api.put(`/blog/${post.id}`, {
            ...f,
            tags: f.tags.split(',').map(t => t.trim()).filter(Boolean),
            published: f.published,
            ...(f.publish_at ? { publish_at: new Date(f.publish_at).toISOString() } : { publish_at: null }),
          })
          setSavedAt(new Date())
          setIsDirty(false)
          setAutoStatus('saved')
          setTimeout(() => setAutoStatus('idle'), 3000)
        } catch { setAutoStatus('error'); setTimeout(() => setAutoStatus('idle'), 3000) }
      }, 30000)
    }
  }

  const wordCount = (() => {
    const text = (form.content || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    return text ? text.split(' ').length : 0
  })()
  const readingTime = Math.max(1, Math.round(wordCount / 200))

  const handleSave = async pub => {
    setSaving(true)
    const payload = {
      ...form,
      tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
      published: pub !== undefined ? pub : form.published,
      ...(form.publish_at ? { publish_at: new Date(form.publish_at).toISOString() } : { publish_at: null }),
    }
    try { await onSave(payload) } finally { setSaving(false) }
  }

  const handleMediaSelect = file => {
    if (mediaTarget === 'cover') {
      set('cover_image', file.url || file.path)
    } else if (mediaTarget === 'video') {
      set('video_url', file.url || file.path)
    } else if (mediaTarget === 'content') {
      const url = file.url || file.path
      const isDoc = !file.mimetype?.startsWith('image/') && !file.mimetype?.startsWith('video/')
      const tag = isDoc
        ? `<p class="blog-media-doc"><a href="${url}" target="_blank" rel="noopener noreferrer">${file.original_name}</a></p>`
        : file.mimetype?.startsWith('video/')
        ? `<video controls src="${url}" style="width:100%;margin:16px 0;"></video>`
        : `<img src="${url}" alt="${file.original_name}" style="width:100%;margin:16px 0;" />`
      const editor = document.querySelector('[contenteditable]')
      if (editor) { editor.focus(); document.execCommand('insertHTML', false, tag) }
    }
    setMediaOpen(false)
  }

  const CATEGORIES = ['Networking', 'Security', 'Cloud', 'Linux', 'Tutorial', 'General']

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      {mediaOpen && <MediaLibrary onSelect={handleMediaSelect} onClose={() => setMediaOpen(false)} filter={mediaTarget === 'video' ? 'video/' : null} />}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', marginBottom: isMobile ? 20 : 32, flexWrap: 'wrap', gap: 12 }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: isMobile ? 22 : 28, fontWeight: 700, margin: 0 }}>
          {post ? 'Edit Post' : 'New Post'}
        </h2>
        <button onClick={onCancel} style={{ ...S.btn('transparent', 'var(--muted)'), border: '1px solid var(--border)' }}>&#x2715; Cancel</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Title */}
        <div>
          <label style={S.label}>Title *</label>
          <input value={form.title} onChange={e => set('title', e.target.value)} placeholder="Post title..." style={{ ...S.input, fontSize: isMobile ? 16 : 20 }} required />
        </div>

        {/* Slug */}
        <div>
          <label style={S.label}>Slug *</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>aifazi.net/blog/</span>
            <input
              value={form.slug}
              onChange={e => set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-'))}
              placeholder="auto-generated-from-title"
              style={{ ...S.input, flex: 1 }}
              required
            />
          </div>
        </div>

        {/* Cover Image */}
        <div>
          <label style={S.label}>Cover Image</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
            <input value={form.cover_image} onChange={e => set('cover_image', e.target.value)} placeholder="URL or browse media library..." style={S.input} />
            <button type="button" onClick={() => { setMediaTarget('cover'); setMediaOpen(true) }}
              style={{ ...S.btn('var(--bg3)', 'var(--cyan)'), border: '1px solid var(--border)', whiteSpace: 'nowrap', flexShrink: 0 }}>
              Browse
            </button>
          </div>
          {form.cover_image && <img src={form.cover_image} alt="cover" style={{ width: '100%', height: 160, objectFit: 'cover', marginTop: 10, border: '1px solid var(--border)' }} />}
        </div>

        {/* Video URL */}
        <div>
          <label style={S.label}>Video URL <span style={{ color: 'var(--muted)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(YouTube, Vimeo, or direct .mp4)</span></label>
          <div style={{ display: 'flex', gap: 8, flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
            <input value={form.video_url} onChange={e => set('video_url', e.target.value)} placeholder="https://youtu.be/..." style={S.input} />
            <button type="button" onClick={() => { setMediaTarget('video'); setMediaOpen(true) }}
              style={{ ...S.btn('var(--bg3)', 'var(--cyan)'), border: '1px solid var(--border)', whiteSpace: 'nowrap', flexShrink: 0 }}>
              Browse
            </button>
          </div>
          {form.video_url && <VideoPlayer url={form.video_url} />}
        </div>

        {/* Excerpt */}
        <div>
          <label style={S.label}>Excerpt / Summary</label>
          <textarea value={form.excerpt} onChange={e => set('excerpt', e.target.value)} placeholder="Brief description shown on blog listing..." rows={3} style={{ ...S.input, resize: 'vertical' }} />
        </div>

        {/* SEO Preview */}
        {(form.title || form.excerpt) && (
          <div style={{ border: '1px solid var(--border)', padding: '14px 16px', background: 'var(--bg2)' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 3, color: 'var(--muted)', marginBottom: 10 }}>SEO PREVIEW</div>
            <div style={{ fontFamily: 'sans-serif', fontSize: 18, color: '#1a73e8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 600 }}>
              {form.title ? (form.title.length > 60 ? form.title.slice(0, 57) + '...' : form.title) : 'Post title'}
            </div>
            {form.title && form.title.length > 60 && (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#ff4757', marginTop: 2 }}>Title too long ({form.title.length}/60 chars)</div>
            )}
            <div style={{ fontFamily: 'sans-serif', fontSize: 13, color: '#4a4a4a', marginTop: 4, lineHeight: 1.5, maxWidth: 600 }}>
              {form.excerpt ? (form.excerpt.length > 160 ? form.excerpt.slice(0, 157) + '...' : form.excerpt) : 'Add an excerpt for better SEO'}
            </div>
            {form.excerpt && form.excerpt.length > 160 && (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#ffd700', marginTop: 2 }}>Excerpt truncated to 160 chars in search results</div>
            )}
          </div>
        )}

        {/* #15 — OG / Social Share Preview */}
        {(form.title || form.cover_image) && (() => {
          const ogTitle = form.title || 'Post Title'
          const ogDesc = form.excerpt ? (form.excerpt.length > 125 ? form.excerpt.slice(0, 122) + '...' : form.excerpt) : 'Add an excerpt to see it here.'
          const ogDomain = 'aifazi.net'
          return (
            <div style={{ border: '1px solid var(--border)', padding: '14px 16px', background: 'var(--bg2)' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 3, color: 'var(--muted)', marginBottom: 12 }}>SOCIAL SHARE PREVIEW</div>
              {/* Twitter/X Card */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 2, color: 'var(--muted)', marginBottom: 6 }}>𝕏 / TWITTER</div>
                <div style={{ border: '1px solid #2f3336', borderRadius: 12, overflow: 'hidden', maxWidth: 500, background: '#000' }}>
                  {form.cover_image && (
                    <img src={form.cover_image} alt="" style={{ width: '100%', height: 160, objectFit: 'cover', display: 'block' }} />
                  )}
                  <div style={{ padding: '10px 14px 12px' }}>
                    <div style={{ fontSize: 11, color: '#71767b', marginBottom: 2, fontFamily: 'sans-serif' }}>{ogDomain}</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#e7e9ea', fontFamily: 'sans-serif', lineHeight: 1.3 }}>{ogTitle.length > 70 ? ogTitle.slice(0, 67) + '...' : ogTitle}</div>
                    <div style={{ fontSize: 13, color: '#71767b', fontFamily: 'sans-serif', marginTop: 2 }}>{ogDesc}</div>
                  </div>
                </div>
              </div>
              {/* LinkedIn Card */}
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 2, color: 'var(--muted)', marginBottom: 6 }}>LINKEDIN</div>
                <div style={{ border: '1px solid #d0d7de', borderRadius: 2, overflow: 'hidden', maxWidth: 500, background: '#fff' }}>
                  {form.cover_image && (
                    <img src={form.cover_image} alt="" style={{ width: '100%', height: 140, objectFit: 'cover', display: 'block' }} />
                  )}
                  <div style={{ padding: '8px 12px 10px', background: '#f3f6f8' }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#000000e6', fontFamily: 'sans-serif', lineHeight: 1.4 }}>{ogTitle.length > 70 ? ogTitle.slice(0, 67) + '...' : ogTitle}</div>
                    <div style={{ fontSize: 12, color: '#00000099', fontFamily: 'sans-serif', marginTop: 2 }}>{ogDomain}</div>
                  </div>
                </div>
              </div>
            </div>
          )
        })()}

        {/* Content */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap', gap: 8 }}>
            <label style={{ ...S.label, marginBottom: 0 }}>Content *</label>
            <button type="button" onClick={() => { setMediaTarget('content'); setMediaOpen(true) }}
              style={{ ...S.btn('transparent', 'var(--cyan)'), border: '1px solid rgba(0,212,255,0.3)', fontSize: 10, padding: '5px 12px' }}>
              Insert Media
            </button>
          </div>
          <RichEditor value={form.content} onChange={v => set('content', v)} />
          <div style={{ display: 'flex', gap: 16, marginTop: 6, fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', letterSpacing: 1 }}>
            <span>{wordCount.toLocaleString()} words</span>
            <span>~{readingTime} min read</span>
          </div>
        </div>

        {/* Category + Tags */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 12 : 20 }}>
          <div>
            <label style={S.label}>Category</label>
            <Select value={form.category} onChange={v => set('category', v)} options={CATEGORIES} />
          </div>
          <div>
            <label style={S.label}>Tags (comma-separated)</label>
            <input value={form.tags} onChange={e => set('tags', e.target.value)} placeholder="cisco, vpn, firewall" style={S.input} />
          </div>
        </div>

        {/* Scheduled date */}
        <div>
          <label style={S.label}>Scheduled Publish Date <span style={{ color: 'var(--muted)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional — leave blank to publish immediately)</span></label>
          <DateTimePicker value={form.publish_at} onChange={v => set('publish_at', v)} placeholder="Publish immediately..." />
          {form.publish_at && new Date(form.publish_at) > new Date() && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 2, padding: '3px 10px', background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.35)', color: '#a855f7', borderRadius: 4 }}>
                📅 SCHEDULED — {new Date(form.publish_at).toLocaleString()}
              </span>
              <button type="button" onClick={() => set('publish_at', '')} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 11 }}>✕ clear</button>
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, paddingTop: 16, borderTop: '1px solid var(--border)', flexWrap: 'wrap', alignItems: 'center' }}>
          <button onClick={() => handleSave(true)} disabled={saving} style={{ ...S.btn(), opacity: saving ? 0.7 : 1, flex: isMobile ? 1 : 'unset' }}>
            {saving ? 'SAVING...' : '🚀 PUBLISH'}
          </button>
          {/* #7 — Schedule button: visible only when publish_at is set to a future date */}
          {form.publish_at && new Date(form.publish_at) > new Date() && (
            <button onClick={() => handleSave(false)} disabled={saving}
              style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, padding: '10px 22px',
                background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.4)',
                color: '#a855f7', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
                flex: isMobile ? 1 : 'unset' }}>
              📅 SCHEDULE
            </button>
          )}
          <button onClick={() => handleSave(false)} disabled={saving} style={{ ...S.btn('var(--bg3)', 'var(--text)'), border: '1px solid var(--border)', opacity: saving ? 0.7 : 1, flex: isMobile ? 1 : 'unset' }}>
            💾 DRAFT
          </button>
          {/* #9 — Autosave status indicator */}
          {autoStatus === 'saving' && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--cyan)', letterSpacing: 1 }}>⏳ Autosaving…</span>}
          {autoStatus === 'saved'  && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--green)', letterSpacing: 1 }}>✓ Autosaved {savedAt ? new Date(savedAt).toLocaleTimeString() : ''}</span>}
          {autoStatus === 'error'  && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#ff4757', letterSpacing: 1 }}>⚠ Autosave failed</span>}
          {autoStatus === 'idle' && isDirty && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#ffd700', letterSpacing: 1 }}>● unsaved changes</span>}
        </div>

      </div>
    </div>
  )
}

// --- DB Monitor ---------------------------------------------------------------

export { SlashMenu, RichEditor, MediaLibrary, PostEditor }
