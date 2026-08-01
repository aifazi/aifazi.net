'use client'
import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import api, { canEdit as checkCanEdit, getRole } from '@/lib/api'
import { IconPickerModal, IconDisplay } from '../components/IconPicker'
import AnimationPicker from '../components/AnimationPicker'
import DOMPurify from 'isomorphic-dompurify'
import { isGsapAnimationValue, useGsapAnimation } from '@/lib/animate'

const SANITIZE_CONFIG = {
  ALLOWED_TAGS: ['b','i','u','em','strong','a','p','br','ul','ol','li','h1','h2','h3','h4','h5','h6','span','div','img','blockquote','code','pre','sup','sub','table','tr','td','th','hr'],
  ALLOWED_ATTR: ['href','src','alt','title','target','rel','class','style','colspan','rowspan'],
  FORBID_TAGS: ['script','iframe','object','embed','form','input','textarea','select','button','style','link','meta','base'],
  FORBID_ATTR: ['onerror','onload','onclick','onmouseover','onmouseout','onfocus','onblur','onsubmit','onchange'],
  ALLOW_DATA_ATTR: false,
}

const EditContext = createContext(null)
export function useEdit() { return useContext(EditContext) }

// ── Core hook ─────────────────────────────────────────────────────────────────
/** Unwrap double-nested {value: x} from content_blocks DB corruption */
function _unwrap(val) {
  if (val && typeof val === 'object' && !Array.isArray(val)) {
    const keys = Object.keys(val)
    if (keys.length === 1 && keys[0] === 'value') return val.value
  }
  return val
}

export function useInlineEdit(contentKey, defaultValue) {
  const ctx = useContext(EditContext)
  // Show pending value if one exists, else committed content, else default
  // _unwrap: guard against double-nested {"value": x} stored in DB
  const raw = ctx?.pendingChanges?.[contentKey] !== undefined
    ? ctx.pendingChanges[contentKey]
    : (ctx?.content?.[contentKey] ?? defaultValue)
  const value = _unwrap(raw)

  // Stage change in pendingChanges — does NOT hit backend yet
  const save = useCallback((newValue) => {
    if (!ctx?.isAdmin || !ctx?.editingEnabled) return
    ctx.stagePending(contentKey, newValue)
  }, [contentKey, ctx])

  return { value, save, isAdmin: !!(ctx?.isAdmin && ctx?.editingEnabled) }
}

// ── Floating Toolbar ──────────────────────────────────────────────────────────
const TEXT_STYLES = [
  { label: 'Paragraph',  tag: 'p',    fontSize: null },
  { label: 'Header 1',   tag: 'h1',   fontSize: '2.5em' },
  { label: 'Header 2',   tag: 'h2',   fontSize: '2em' },
  { label: 'Header 3',   tag: 'h3',   fontSize: '1.5em' },
  { label: 'Header 4',   tag: 'h4',   fontSize: '1.25em' },
  { label: 'Header 5',   tag: 'h5',   fontSize: '1.1em' },
  { label: 'Header 6',   tag: 'h6',   fontSize: '1em' },
  { label: 'Small',      tag: 'p',    fontSize: '0.8em' },
  { label: 'Code',       tag: 'code', fontSize: null },
  { label: 'Quote',      tag: 'blockquote', fontSize: null },
]

const TEXT_COLORS = [
  { label: 'Default',  value: 'inherit' },
  { label: 'Green',    value: '#00ff88' },
  { label: 'Cyan',     value: '#00d4ff' },
  { label: 'Orange',   value: '#ff6b35' },
  { label: 'Red',      value: '#ff4757' },
  { label: 'White',    value: '#ffffff' },
  { label: 'Muted',    value: '#4a6070' },
]

function FloatingToolbar({ position, onCommand, onClose }) {
  const [showStyleMenu, setShowStyleMenu] = useState(false)
  const [showColorMenu, setShowColorMenu] = useState(false)
  const [showLinkInput, setShowLinkInput] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [currentStyle, setCurrentStyle] = useState('Paragraph')
  const ref = useRef()

  // Detect current block style
  useEffect(() => {
    const sel = window.getSelection()
    if (!sel?.rangeCount) return
    const el = sel.getRangeAt(0).commonAncestorContainer
    const block = el.nodeType === 3 ? el.parentElement : el
    const tag = block?.closest('h1,h2,h3,h4,h5,h6,p,code,blockquote')?.tagName?.toLowerCase()
    if (tag) {
      const found = TEXT_STYLES.find(s => s.tag === tag)
      if (found) setCurrentStyle(found.label)
    }
  }, [])

  // NOTE: document.execCommand is deprecated and may be removed in future browsers.
  // Consider migrating to a maintained rich-text library (e.g. Tiptap, Quill, or ProseMirror)
  // when the inline-edit feature needs a significant update.
  const exec = (cmd, val = null) => {
    document.execCommand(cmd, false, val)
    onCommand()
  }

  const applyStyle = (style) => {
    setCurrentStyle(style.label)
    setShowStyleMenu(false)
    if (style.fontSize) exec('fontSize', 3) // placeholder, then override
    exec('formatBlock', style.tag === 'blockquote' ? 'blockquote' : style.tag === 'code' ? 'pre' : style.tag)
    if (style.fontSize) {
      // Override font size via span
      const sel = window.getSelection()
      if (sel?.rangeCount) {
        try {
          const range = sel.getRangeAt(0)
          const span = document.createElement('span')
          span.style.fontSize = style.fontSize
          range.surroundContents(span)
        } catch {}
      }
    }
  }

  const applyColor = (color) => {
    setShowColorMenu(false)
    exec('foreColor', color)
  }

  const insertLink = () => {
    if (linkUrl) { exec('createLink', linkUrl); setShowLinkInput(false); setLinkUrl('') }
  }

  const isActive = (cmd) => {
    try { return document.queryCommandState(cmd) } catch { return false }
  }

  const btnStyle = (active = false) => ({
    background: active ? 'rgba(0,255,136,0.2)' : 'transparent',
    border: 'none', color: active ? 'var(--green)' : '#c8d8e8',
    fontFamily: 'monospace', fontSize: 13, fontWeight: 700,
    padding: '5px 9px', cursor: 'pointer',
    borderRadius: 3, lineHeight: 1,
    transition: 'background 0.15s, color 0.15s',
  })

  return (
    <div ref={ref} data-toolbar="true" style={{
      position: 'fixed',
      top: position.top,
      left: position.left,
      zIndex: 999999,
      background: '#111a24',
      border: '1px solid rgba(0,212,255,0.3)',
      boxShadow: '0 8px 32px rgba(0,0,0,0.7), 0 0 20px rgba(0,212,255,0.1)',
      display: 'flex', alignItems: 'center', gap: 2,
      padding: '4px 6px',
      borderRadius: 4,
      userSelect: 'none',
      whiteSpace: 'nowrap',
    }}
    onMouseDown={e => e.preventDefault()} // prevent blur
    >
      {/* Style dropdown */}
      <div style={{ position: 'relative' }}>
        <button
          style={{ ...btnStyle(), padding: '5px 10px', fontSize: 11, letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 6, borderRight: '1px solid rgba(255,255,255,0.08)', paddingRight: 10, marginRight: 4 }}
          onMouseDown={e => { e.preventDefault(); setShowStyleMenu(v => !v); setShowColorMenu(false); setShowLinkInput(false) }}
        >
          <span>{currentStyle}</span>
          <span style={{ fontSize: 9, opacity: 0.6 }}>▾</span>
        </button>
        {showStyleMenu && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, marginTop: 4,
            background: '#0b1118', border: '1px solid rgba(0,212,255,0.25)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.8)',
            minWidth: 160, zIndex: 1000000, borderRadius: 3,
            maxHeight: 280, overflowY: 'auto',
          }}>
            {TEXT_STYLES.map(s => (
              <div key={s.label}
                onMouseDown={e => { e.preventDefault(); applyStyle(s) }}
                style={{
                  padding: '9px 16px', cursor: 'pointer',
                  fontFamily: "'Share Tech Mono', monospace", fontSize: 12,
                  color: currentStyle === s.label ? 'var(--green)' : '#c8d8e8',
                  background: currentStyle === s.label ? 'rgba(0,255,136,0.08)' : 'transparent',
                  transition: 'background 0.15s',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,212,255,0.08)'}
                onMouseLeave={e => e.currentTarget.style.background = currentStyle === s.label ? 'rgba(0,255,136,0.08)' : 'transparent'}
              >
                {s.label}
                {currentStyle === s.label && <span style={{ color: 'var(--green)', fontSize: 10 }}>✓</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Divider */}
      <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.1)', margin: '0 2px' }} />

      {/* Bold */}
      <button style={btnStyle(isActive('bold'))} onMouseDown={e => { e.preventDefault(); exec('bold') }} title="Bold (Ctrl+B)">B</button>
      {/* Italic */}
      <button style={{ ...btnStyle(isActive('italic')), fontStyle: 'italic' }} onMouseDown={e => { e.preventDefault(); exec('italic') }} title="Italic (Ctrl+I)">I</button>
      {/* Underline */}
      <button style={{ ...btnStyle(isActive('underline')), textDecoration: 'underline' }} onMouseDown={e => { e.preventDefault(); exec('underline') }} title="Underline (Ctrl+U)">U</button>
      {/* Strikethrough */}
      <button style={{ ...btnStyle(isActive('strikeThrough')), textDecoration: 'line-through', fontSize: 12 }} onMouseDown={e => { e.preventDefault(); exec('strikeThrough') }} title="Strikethrough">S</button>

      {/* Divider */}
      <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.1)', margin: '0 2px' }} />

      {/* Text color */}
      <div style={{ position: 'relative' }}>
        <button
          title="Text Color"
          style={{ ...btnStyle(), fontSize: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '4px 8px' }}
          onMouseDown={e => { e.preventDefault(); setShowColorMenu(v => !v); setShowStyleMenu(false); setShowLinkInput(false) }}
        >
          <span>A</span>
          <div style={{ width: 14, height: 2, background: 'var(--green)', borderRadius: 1 }} />
        </button>
        {showColorMenu && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, marginTop: 4,
            background: '#0b1118', border: '1px solid rgba(0,212,255,0.25)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.8)',
            padding: '8px', zIndex: 1000000, borderRadius: 3,
            display: 'flex', flexDirection: 'column', gap: 4, minWidth: 120,
          }}>
            {TEXT_COLORS.map(c => (
              <div key={c.label}
                onMouseDown={e => { e.preventDefault(); applyColor(c.value) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 10px', cursor: 'pointer', borderRadius: 3,
                  fontFamily: 'monospace', fontSize: 11,
                  color: c.value === 'inherit' ? '#c8d8e8' : c.value,
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: c.value === 'inherit' ? '#c8d8e8' : c.value, border: '1px solid rgba(255,255,255,0.2)', flexShrink: 0 }} />
                {c.label}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Link */}
      <div style={{ position: 'relative' }}>
        <button
          title="Insert Link"
          style={{ ...btnStyle(), fontSize: 14 }}
          onMouseDown={e => { e.preventDefault(); setShowLinkInput(v => !v); setShowStyleMenu(false); setShowColorMenu(false) }}
        >🔗</button>
        {showLinkInput && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, marginTop: 4,
            background: '#0b1118', border: '1px solid rgba(0,212,255,0.25)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.8)',
            padding: '8px', zIndex: 1000000, borderRadius: 3,
            display: 'flex', gap: 6, minWidth: 240,
          }}>
            <input
              autoFocus
              value={linkUrl}
              onChange={e => setLinkUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && insertLink()}
              placeholder="https://..."
              style={{
                flex: 1, background: 'var(--bg3)', border: '1px solid rgba(0,212,255,0.3)',
                color: '#c8d8e8', fontFamily: 'monospace', fontSize: 12,
                padding: '6px 10px', outline: 'none', borderRadius: 3,
              }}
            />
            <button onMouseDown={e => { e.preventDefault(); insertLink() }}
              style={{ ...btnStyle(), background: 'rgba(0,255,136,0.15)', color: 'var(--green)', padding: '6px 12px', fontSize: 11 }}>
              OK
            </button>
          </div>
        )}
      </div>

      {/* Divider */}
      <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.1)', margin: '0 2px' }} />

      {/* Clear formatting */}
      <button title="Clear Formatting" style={{ ...btnStyle(), fontSize: 11, opacity: 0.6 }}
        onMouseDown={e => { e.preventDefault(); exec('removeFormat') }}>✕</button>
    </div>
  )
}

// Decode HTML entities (e.g. &amp; → &, &lt; → <) for plain-text rendering
function decodeEntities(str) {
  if (typeof str !== 'string') return str
  if (typeof document === 'undefined') {
    return str
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
  }
  const txt = document.createElement('textarea')
  txt.innerHTML = str
  return txt.value
}

// ── EditableText — rich contentEditable with floating toolbar ──────────────────
export function EditableText({ contentKey, defaultValue, as: Tag = 'span', style, className, multiline = false }) {
  const { value, save, isAdmin } = useInlineEdit(contentKey, defaultValue)
  const [editing, setEditing] = useState(false)
  const [toolbar, setToolbar] = useState(null)
  const editRef = useRef()

  // Non-admin: render HTML if value contains tags, else plain text (with entity decoding)
  if (!isAdmin) {
    // Last-resort guard: never render an object as React child → React #31
    const safeValue = (value === null || value === undefined)
      ? ''
      : typeof value !== 'string'
      ? JSON.stringify(value)
      : value
    const hasHtml = /<[a-z][\s\S]*>/i.test(safeValue)
    if (hasHtml) return <Tag style={style} className={className} dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(safeValue, {
      ALLOWED_TAGS: ['b','i','u','em','strong','a','p','br','ul','ol','li','h1','h2','h3','h4','h5','h6','span','div','img','blockquote','code','pre','sup','sub','table','tr','td','th','hr'],
      ALLOWED_ATTR: ['href','src','alt','title','target','rel','class','style','colspan','rowspan'],
      FORBID_TAGS: ['script','iframe','object','embed','form','input','textarea','select','button','style','link','meta','base'],
      FORBID_ATTR: ['onerror','onload','onclick','onmouseover','onmouseout','onfocus','onblur','onsubmit','onchange'],
      ALLOW_DATA_ATTR: false,
    }) }} />
    return <Tag style={style} className={className}>{decodeEntities(safeValue)}</Tag>
  }

  const handleInput = () => {
    // Do not stage on every keystroke. Updating context here re-renders the
    // contentEditable node and makes the browser lose its caret/selection.
  }

  const handleSelectionChange = () => {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || !sel.rangeCount) { setToolbar(null); return }
    // Make sure selection is inside our editor
    const range = sel.getRangeAt(0)
    if (!editRef.current?.contains(range.commonAncestorContainer)) { setToolbar(null); return }
    // Position toolbar above selection
    const rect = range.getBoundingClientRect()
    const TOOLBAR_HEIGHT = 44
    const TOOLBAR_WIDTH = 440
    let top = rect.top - TOOLBAR_HEIGHT - 8
    let left = rect.left + rect.width / 2 - TOOLBAR_WIDTH / 2
    // Clamp to viewport
    if (top < 8) top = rect.bottom + 8
    left = Math.max(8, Math.min(left, window.innerWidth - TOOLBAR_WIDTH - 8))
    setToolbar({ top, left })
  }

  const startEdit = () => {
    setEditing(true)
    setTimeout(() => {
      if (editRef.current) {
        const safeValue = (value === null || value === undefined)
          ? ''
          : typeof value !== 'string'
          ? JSON.stringify(value)
          : value
        editRef.current.innerHTML = DOMPurify.sanitize(safeValue, SANITIZE_CONFIG)
        editRef.current.focus()
      }
    }, 0)
  }

  const stopEdit = (e) => {
    // Don't stop if clicking the toolbar
    if (e?.relatedTarget?.closest?.('[data-toolbar]')) return
    setEditing(false)
    setToolbar(null)
    const html = editRef.current?.innerHTML || ''
    save(html)
  }

  const hasHtml = typeof value === 'string' && /<[a-z][\s\S]*>/i.test(value)

  if (!editing) {
    return (
      <Tag
        style={{
          ...style, cursor: 'text', position: 'relative',
          outline: '1px dashed transparent',
          transition: 'outline-color 0.2s',
        }}
        className={className}
        onClick={startEdit}
        title="Click to edit"
        onMouseEnter={e => e.currentTarget.style.outlineColor = 'rgba(0,255,136,0.4)'}
        onMouseLeave={e => e.currentTarget.style.outlineColor = 'transparent'}
      >
        {hasHtml
          ? <span dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(value, SANITIZE_CONFIG) }} />
          : value
        }
        <span style={{
          position: 'absolute', top: -20, right: 0, zIndex: 10,
          fontFamily: 'monospace', fontSize: 9, letterSpacing: 1,
          color: 'rgba(0,255,136,0.6)',
          background: 'rgba(0,255,136,0.1)',
          border: '1px solid rgba(0,255,136,0.3)',
          padding: '1px 5px', pointerEvents: 'none',
          opacity: 0, transition: 'opacity 0.2s',
        }} className="edit-badge">✎</span>
      </Tag>
    )
  }

  const EditTag = Tag

  return (
    <>
      <EditTag
        ref={editRef}
        contentEditable
        suppressContentEditableWarning
        data-editing="true"
        data-editable-text="true"
        style={{
          ...style,
          display: style?.display || (Tag === 'span' ? 'inline' : undefined),
          whiteSpace: multiline ? 'pre-wrap' : style?.whiteSpace,
          outline: '1px solid rgba(0,255,136,0.5)',
          background: 'rgba(0,255,136,0.03)',
          boxShadow: '0 0 0 3px rgba(0,255,136,0.06)',
          minHeight: '1em',
          cursor: 'text',
          transition: 'outline-color 0.2s',
        }}
        className={className}
        onInput={handleInput}
        onBlur={stopEdit}
        onKeyDown={e => { if (e.key === 'Escape') { e.currentTarget.blur() } }}
        onMouseUp={handleSelectionChange}
        onKeyUp={handleSelectionChange}
      />
      {toolbar && (
        <FloatingToolbar
          position={toolbar}
          onCommand={handleInput}
          onClose={() => setToolbar(null)}
        />
      )}
    </>
  )
}

// ── EditableNumber ─────────────────────────────────────────────────────────────
export function EditableNumber({ contentKey, defaultValue, suffix = '', style }) {
  const { value, save, isAdmin } = useInlineEdit(contentKey, defaultValue)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(value))

  useEffect(() => { setDraft(String(value)) }, [value])
  if (!isAdmin) return <span style={style}>{value}{suffix}</span>

  const commit = () => {
    setEditing(false)
    const parsed = isNaN(Number(draft)) ? value : Number(draft)
    if (parsed !== value) save(parsed)
  }

  if (editing) return <input autoFocus value={draft} onChange={e => setDraft(e.target.value)} onBlur={commit} onKeyDown={e => e.key === 'Enter' && commit()} style={{ ...style, width: '80px', background: 'rgba(0,255,136,0.06)', border: '1px solid rgba(0,255,136,0.5)', outline: 'none', padding: '2px 6px', color: 'inherit', fontFamily: 'inherit', fontSize: 'inherit', fontWeight: 'inherit', borderRadius: 2, textAlign: 'center' }} />

  return <span style={{ ...style, cursor: 'text', borderBottom: '1px dashed rgba(0,255,136,0.35)' }} onClick={() => setEditing(true)} title="Click to edit">{value}{suffix}</span>
}


// ── EmojiPicker ───────────────────────────────────────────────────────────────
const EMOJI_CATEGORIES = {
  'Tech & IT': ['💻','🖥️','🖨️','⌨️','🖱️','📱','📡','🔌','🔋','💾','💿','📀','🖧','🌐','📶','🛜','⚙️','🔧','🔩','🛠️','🔬','🔭','📡','🤖','👾','🕹️'],
  'Security': ['🔐','🔒','🔓','🛡️','🗝️','🔑','🚨','⚠️','🚧','🚫','☣️','🦠','🕵️','👮','🔏','🧱'],
  'Cloud & Network': ['☁️','⛅','🌩️','🌐','📶','🔗','🕸️','🌊','🌀','⚡','🔥','💧','🌪️'],
  'Infrastructure': ['🏢','🏗️','🏭','🏛️','🌆','🌇','🗼','🔭','📡','🗂️','📁','🗄️'],
  'Data & Code': ['📊','📈','📉','🗃️','💾','🗂️','📋','📌','📍','🧮','🔢','#️⃣','*️⃣'],
  'People & Work': ['👨‍💻','👩‍💻','🧑‍💻','👨‍🔧','🧑‍🔬','👨‍🏫','🤝','👥','💼','🎓','🏆','🥇','⭐','✨'],
  'Arrows & Symbols': ['✅','❌','⚡','🔥','💡','🎯','🚀','🛸','🔄','♾️','➕','➖','✖️','🔀'],
  'Nature & Other': ['🌿','🐧','🐳','🦊','🦅','🐉','🦁','🐺','🦈','🕷️','🦋','🌸','🍀','🌴'],
}

function EmojiPicker({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('Tech & IT')
  const ref = useRef()

  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <div style={{ display: 'flex', gap: 8 }}>
        <div
          onClick={() => setOpen(v => !v)}
          style={{
            width: 52, height: 52, fontSize: 28,
            background: 'var(--bg3)', border: '1px solid rgba(0,212,255,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', borderRadius: 4, flexShrink: 0,
            transition: 'border-color 0.2s',
          }}
          title="Click to pick emoji"
        >{value || '❓'}</div>
        <input
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          placeholder="or type emoji / paste icon..."
          style={{ ...modalInput, marginBottom: 0, flex: 1 }}
        />
      </div>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 6, zIndex: 99999,
          background: '#0b1118', border: '1px solid rgba(0,212,255,0.3)',
          boxShadow: '0 16px 48px rgba(0,0,0,0.8)',
          width: 320, borderRadius: 4,
        }}>
          {/* Tabs */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, padding: 8, borderBottom: '1px solid rgba(0,212,255,0.1)' }}>
            {Object.keys(EMOJI_CATEGORIES).map(cat => (
              <button key={cat} onClick={() => setActiveTab(cat)} style={{
                padding: '3px 8px', fontSize: 9, letterSpacing: 1,
                background: activeTab === cat ? 'rgba(0,255,136,0.15)' : 'transparent',
                border: `1px solid ${activeTab === cat ? 'rgba(0,255,136,0.4)' : 'rgba(255,255,255,0.08)'}`,
                color: activeTab === cat ? '#00ff88' : '#4a6070',
                cursor: 'pointer', fontFamily: 'monospace', borderRadius: 2,
              }}>{cat.split(' ')[0]}</button>
            ))}
          </div>
          {/* Emoji grid */}
          <div style={{ padding: 10, display: 'flex', flexWrap: 'wrap', gap: 4, maxHeight: 200, overflowY: 'auto' }}>
            {EMOJI_CATEGORIES[activeTab].map(emoji => (
              <button key={emoji} onClick={() => { onChange(emoji); setOpen(false) }} style={{
                width: 38, height: 38, fontSize: 22,
                background: 'transparent', border: '1px solid transparent',
                cursor: 'pointer', borderRadius: 4, transition: 'all 0.1s',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,212,255,0.1)'; e.currentTarget.style.borderColor = 'rgba(0,212,255,0.3)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent' }}
              >{emoji}</button>
            ))}
          </div>
          {/* Lordicon tip */}
          <div style={{ padding: '8px 12px', borderTop: '1px solid rgba(0,212,255,0.1)', fontSize: 10, color: '#4a6070', lineHeight: 1.6, fontFamily: 'monospace' }}>
            💡 <span style={{ color: '#00d4ff' }}>Want animated icons?</span> Get free ones at{' '}
            <a href="https://lordicon.com" target="_blank" rel="noopener" style={{ color: '#00ff88' }}>lordicon.com</a>
            {' '}→ copy the URL → paste it in the icon field above
          </div>
        </div>
      )}
    </div>
  )
}

// ── IconField (for EditableList modals — uses full IconPickerModal) ────────────
function IconField({ value, onChange }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <div
        onClick={() => setOpen(true)}
        style={{
          width: 52, height: 52, fontSize: 28,
          background: 'var(--bg3)', border: '1px solid rgba(0,212,255,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', borderRadius: 4,
          transition: 'border-color 0.2s',
        }}
        title="Click to pick icon"
      >
        <IconDisplay value={value} size={36} />
      </div>
      {open && (
        <IconPickerModal
          currentValue={value}
          onSave={v => { onChange(v); setOpen(false) }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

// ── EditableList ──────────────────────────────────────────────────────────────
export function EditableList({ contentKey, defaultValue, renderItem, fields, addLabel = '+ Add Item', normalizeItems }) {
  const { value: raw, save, isAdmin } = useInlineEdit(contentKey, defaultValue)
  const normalizeList = (list) => {
    const safeList = Array.isArray(list) ? list : []
    return typeof normalizeItems === 'function' ? normalizeItems(safeList) : safeList
  }
  // Always ensure value is an array — never crash on undefined/bad DB data.
  // normalizeItems is applied ONLY to the default (seed) value. User edits/deletes
  // are respected as-is — otherwise e.g. Projects' mergeFeaturedProject would
  // resurrect a card the admin just deleted.
  const safeDefault = normalizeList(defaultValue)
  const value = Array.isArray(raw) ? raw : safeDefault
  const [items, setItems] = useState(value)
  const [editIdx, setEditIdx] = useState(null)
  const [draft, setDraft] = useState({})

  useEffect(() => { setItems(value) }, [raw, defaultValue])

  if (!isAdmin) return <>{value.map((item, i) => renderItem(item, i))}</>

  const openEdit = (idx) => {
    setEditIdx(idx)
    setDraft(idx === -1 ? Object.fromEntries(fields.map(f => [f.key, f.default ?? ''])) : { ...items[idx] })
  }

  const commitEdit = () => {
    const next = editIdx === -1 ? [...items, draft] : items.map((item, i) => i === editIdx ? draft : item)
    setItems(next); save(next); setEditIdx(null)
  }

  const deleteItem = (idx) => { const next = items.filter((_, i) => i !== idx); setItems(next); save(next) }

  const moveItem = (idx, dir) => {
    const next = [...items]; const target = idx + dir
    if (target < 0 || target >= next.length) return
    ;[next[idx], next[target]] = [next[target], next[idx]]
    setItems(next); save(next)
  }

  return (
    <>
      {items.map((item, i) => (
        <div key={item.id || item._id || `item-${i}`} style={{ position: 'relative' }} className="editable-list-item">
          {renderItem(item, i)}
          <div className="edit-toolbar" style={{ position: 'absolute', top: 8, right: 8, zIndex: 10, display: 'flex', gap: 4, opacity: 0, transition: 'opacity 0.2s' }}>
            {['↑','↓'].map((arrow, di) => <button key={arrow} onClick={() => moveItem(i, di === 0 ? -1 : 1)} style={toolBtn}>{arrow}</button>)}
            <button onClick={() => openEdit(i)} style={{ ...toolBtn, color: 'var(--cyan)' }}>✎</button>
            <button onClick={() => deleteItem(i)} style={{ ...toolBtn, color: 'var(--red)' }}>✕</button>
          </div>
        </div>
      ))}

      <button onClick={() => openEdit(-1)} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2, padding: '8px 16px', marginTop: 12, background: 'rgba(0,255,136,0.08)', border: '1px dashed rgba(0,255,136,0.4)', color: 'var(--green)', cursor: 'pointer', transition: 'all 0.2s' }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,255,136,0.15)'}
        onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,255,136,0.08)'}
      >{addLabel}</button>

      {editIdx !== null && (
        <>
          <div onClick={() => setEditIdx(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', zIndex: 99995 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'var(--bg2)', border: '1px solid var(--green)', boxShadow: '0 0 60px rgba(0,255,136,0.15)', padding: '32px', width: '100%', maxWidth: 520, zIndex: 99996, maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 3, color: 'var(--green)', marginBottom: 20 }}>{editIdx === -1 ? '+ ADD ITEM' : '✎ EDIT ITEM'}</div>
            {fields.map(field => (
              <div key={field.key} style={{ marginBottom: 16 }}>
                <label style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>{field.label}</label>
                {field.type === 'emoji'
                  ? <IconField value={draft[field.key] ?? ''} onChange={val => setDraft(d => ({ ...d, [field.key]: val }))} />
                  : field.type === 'textarea'
                  ? <textarea value={draft[field.key] ?? ''} rows={3} onChange={e => setDraft(d => ({ ...d, [field.key]: e.target.value }))} style={modalInput} />
                  : field.type === 'tags'
                    ? <input value={Array.isArray(draft[field.key]) ? draft[field.key].join(', ') : draft[field.key] ?? ''} onChange={e => setDraft(d => ({ ...d, [field.key]: e.target.value.split(',').map(t => t.trim()).filter(Boolean) }))} placeholder="tag1, tag2, tag3" style={modalInput} />
                    : <input type={field.type || 'text'} value={draft[field.key] ?? ''} onChange={e => setDraft(d => ({ ...d, [field.key]: field.type === 'number' ? Number(e.target.value) : e.target.value }))} style={modalInput} />
                }
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button onClick={commitEdit} style={{ flex: 1, padding: '12px', background: 'rgba(0,255,136,0.15)', border: '1px solid rgba(0,255,136,0.4)', color: 'var(--green)', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, cursor: 'pointer' }}>SAVE</button>
              <button onClick={() => setEditIdx(null)} style={{ flex: 1, padding: '12px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, cursor: 'pointer' }}>CANCEL</button>
            </div>
          </div>
        </>
      )}

      <style>{`.editable-list-item:hover .edit-toolbar { opacity: 1 !important; }`}</style>
    </>
  )
}

const toolBtn = { fontFamily: 'monospace', fontSize: 11, padding: '4px 8px', background: 'rgba(0,0,0,0.8)', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer', backdropFilter: 'blur(4px)' }
const modalInput = { width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--font-display)', fontSize: 15, padding: '10px 14px', outline: 'none' }

// ── Edit Mode Bar — persistent bottom-left panel ─────────────────────────────
function EditModeBar({ pendingCount, onSave, onDiscard, saving, saveError, onOpenPageAnimation }) {
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [visible, setVisible] = useState(false)
  useEffect(() => { const t = setTimeout(() => setVisible(true), 20); return () => clearTimeout(t) }, [])

  const handleExit = () => { if (pendingCount > 0) setConfirmDiscard(true); else onDiscard() }

  const discardConfirmBtn = { flex: 1, padding: '7px 0', background: 'rgba(255,71,87,0.12)', border: '1px solid rgba(255,71,87,0.5)', color: '#ff4757', fontFamily: "'Share Tech Mono', monospace", fontSize: 9, letterSpacing: 1, cursor: 'pointer', borderRadius: 4 }
  const keepEditingBtn   = { flex: 1, padding: '7px 0', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#4a6070', fontFamily: "'Share Tech Mono', monospace", fontSize: 9, letterSpacing: 1, cursor: 'pointer', borderRadius: 4 }

  return (
    <div style={{ position: 'fixed', bottom: 24, left: 24, zIndex: 999990, minWidth: 280,
      transform: visible ? 'translateY(0)' : 'translateY(120%)', opacity: visible ? 1 : 0,
      transition: 'transform 0.35s cubic-bezier(0.16,1,0.3,1), opacity 0.25s ease',
    }}>
      <div style={{ background: '#0a0f1a', border: '1px solid rgba(0,255,136,0.4)', borderRadius: 8, overflow: 'hidden',
        boxShadow: '0 0 0 1px rgba(0,255,136,0.06), 0 8px 32px rgba(0,0,0,0.7), 0 0 24px rgba(0,255,136,0.06)',
        fontFamily: "'Share Tech Mono', monospace",
      }}>
        <div style={{ height: 2, background: 'linear-gradient(90deg, #00ff88, #00d4ff, transparent)' }} />
        <div style={{ padding: '10px 14px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#00ff88', flexShrink: 0, boxShadow: '0 0 6px #00ff88', animation: 'emBlink 1.8s infinite' }} />
            <span style={{ fontSize: 9, letterSpacing: 3, color: '#00ff88' }}>PREVIEW EDIT MODE</span>
            <span style={{ marginLeft: 'auto', fontSize: 9, letterSpacing: 1,
              color: pendingCount > 0 ? '#00d4ff' : '#2a3a48',
              background: pendingCount > 0 ? 'rgba(0,212,255,0.1)' : 'transparent',
              border: pendingCount > 0 ? '1px solid rgba(0,212,255,0.3)' : '1px solid transparent',
              padding: '1px 7px', borderRadius: 10, transition: 'all 0.3s',
            }}>{pendingCount} change{pendingCount !== 1 ? 's' : ''}</span>
          </div>
          {saveError && <div style={{ fontSize: 9, color: '#ff4757', letterSpacing: 1, background: 'rgba(255,71,87,0.08)', border: '1px solid rgba(255,71,87,0.3)', padding: '5px 8px', borderRadius: 4 }}>⚠ {saveError}</div>}
          <button
            type="button"
            onClick={onOpenPageAnimation}
            disabled={saving}
            style={{
              padding: '8px 0',
              background: 'rgba(0,212,255,0.08)',
              border: '1px solid rgba(0,212,255,0.28)',
              color: '#00d4ff',
              fontFamily: "'Share Tech Mono', monospace",
              fontSize: 9,
              letterSpacing: 2,
              cursor: saving ? 'not-allowed' : 'pointer',
              borderRadius: 5,
              opacity: saving ? 0.45 : 1,
            }}
            onMouseEnter={e => { if (!saving) e.currentTarget.style.background = 'rgba(0,212,255,0.14)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(0,212,255,0.08)' }}
          >GSAP ANIMATION LIBRARY</button>
          {confirmDiscard ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 10, color: '#ff4757', letterSpacing: 1 }}>Discard {pendingCount} change{pendingCount !== 1 ? 's' : ''}?</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={onDiscard} style={discardConfirmBtn}>YES, DISCARD</button>
                <button onClick={() => setConfirmDiscard(false)} style={keepEditingBtn}>KEEP EDITING</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={onSave} disabled={saving || pendingCount === 0}
                style={{ flex: 1, padding: '9px 0', background: pendingCount > 0 && !saving ? 'rgba(0,255,136,0.15)' : 'rgba(0,255,136,0.04)', border: `1px solid ${pendingCount > 0 && !saving ? 'rgba(0,255,136,0.5)' : 'rgba(0,255,136,0.12)'}`, color: pendingCount > 0 && !saving ? '#00ff88' : '#2a3a48', fontFamily: "'Share Tech Mono', monospace", fontSize: 10, letterSpacing: 2, cursor: pendingCount > 0 && !saving ? 'pointer' : 'not-allowed', borderRadius: 5, transition: 'all 0.2s' }}
                onMouseEnter={e => { if (pendingCount > 0 && !saving) e.currentTarget.style.background = 'rgba(0,255,136,0.25)' }}
                onMouseLeave={e => { if (pendingCount > 0 && !saving) e.currentTarget.style.background = 'rgba(0,255,136,0.15)' }}
              >{saving ? '⟳ SAVING...' : '💾 SAVE'}</button>
              <button onClick={handleExit} disabled={saving}
                style={{ flex: 1, padding: '9px 0', background: 'transparent', border: '1px solid rgba(255,71,87,0.35)', color: saving ? '#2a3a48' : '#ff4757', fontFamily: "'Share Tech Mono', monospace", fontSize: 10, letterSpacing: 2, cursor: saving ? 'not-allowed' : 'pointer', borderRadius: 5, transition: 'all 0.2s' }}
                onMouseEnter={e => { if (!saving) e.currentTarget.style.background = 'rgba(255,71,87,0.1)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >✕ EXIT</button>
            </div>
          )}
        </div>
      </div>
      <style>{`@keyframes emBlink { 0%,100%{opacity:1} 50%{opacity:0.2} }`}</style>
    </div>
  )
}

// ── Save/Discard Dialog (legacy — kept for reference) ─────────────────────────
function SaveDiscardDialog({ pendingCount, onSave, onDiscard, saving }) {
  return (
    <>
      {/* Backdrop */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 999990,
        background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
      }} />

      {/* Dialog box */}
      <div style={{
        position: 'fixed', top: '50%', left: '50%', zIndex: 999991,
        transform: 'translate(-50%, -50%)',
        background: '#0b1118',
        border: '1px solid rgba(0,255,136,0.45)',
        boxShadow: '0 0 60px rgba(0,255,136,0.12), 0 24px 64px rgba(0,0,0,0.9)',
        padding: '36px 40px',
        width: '100%', maxWidth: 420,
        fontFamily: "'Share Tech Mono', monospace",
      }}>
        {/* Header */}
        <div style={{ fontSize: 10, letterSpacing: 3, color: 'var(--green)', marginBottom: 6 }}>
          // UNSAVED CHANGES
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#c8d8e8', marginBottom: 10, letterSpacing: 1 }}>
          Save your edits?
        </div>
        <div style={{ fontSize: 12, color: '#4a6070', marginBottom: 28, lineHeight: 1.7 }}>
          You have <span style={{ color: 'var(--cyan)' }}>{pendingCount} pending change{pendingCount !== 1 ? 's' : ''}</span>.{' '}
          Save to publish them, or discard to revert everything.
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onSave}
            disabled={saving}
            style={{
              flex: 1, padding: '13px 0',
              background: saving ? 'rgba(0,255,136,0.05)' : 'rgba(0,255,136,0.15)',
              border: '1px solid rgba(0,255,136,0.45)',
              color: 'var(--green)',
              fontFamily: "'Share Tech Mono', monospace",
              fontSize: 11, letterSpacing: 2,
              cursor: saving ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              opacity: saving ? 0.6 : 1,
            }}
            onMouseEnter={e => !saving && (e.currentTarget.style.background = 'rgba(0,255,136,0.25)')}
            onMouseLeave={e => (e.currentTarget.style.background = saving ? 'rgba(0,255,136,0.05)' : 'rgba(0,255,136,0.15)')}
          >
            {saving ? '⟳ SAVING...' : '✓ SAVE CHANGES'}
          </button>
          <button
            onClick={onDiscard}
            disabled={saving}
            style={{
              flex: 1, padding: '13px 0',
              background: 'transparent',
              border: '1px solid rgba(255,71,87,0.4)',
              color: '#ff4757',
              fontFamily: "'Share Tech Mono', monospace",
              fontSize: 11, letterSpacing: 2,
              cursor: saving ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              opacity: saving ? 0.4 : 1,
            }}
            onMouseEnter={e => !saving && (e.currentTarget.style.background = 'rgba(255,71,87,0.1)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            ✕ DISCARD
          </button>
        </div>

        {/* Tip */}
        <div style={{ marginTop: 18, fontSize: 9, letterSpacing: 1, color: '#2a3a48', textAlign: 'center' }}>
          ESC · click outside to cancel (keep editing)
        </div>
      </div>
    </>
  )
}

// ── AnimatableWrapper ─────────────────────────────────────────────────────────
// Wrap any animated element. In edit mode shows a ✨ button to open AnimationPicker.
export function AnimatableWrapper({ animKey, label, currentAnim, children, style = {}, display = 'block' }) {
  const ctx = useContext(EditContext)
  const [hover, setHover] = useState(false)
  const isEditMode = !!(ctx?.isAdmin && ctx?.editingEnabled)

  // Read pending override first, then committed content from backend, then prop default
  const pendingAnim = ctx?.pendingChanges?.[`anim.${animKey}`]
  const savedAnim   = ctx?.content?.[`anim.${animKey}`]
  const effectiveAnim = pendingAnim !== undefined ? pendingAnim : (savedAnim !== undefined ? _unwrap(savedAnim) : currentAnim)
  const hasPending = pendingAnim !== undefined && pendingAnim !== (savedAnim ?? currentAnim)
  // Stable key derived from animation value — changing animation unmounts/remounts the span
  // so the new CSS animation plays cleanly from its 'from' keyframe.
  const spanKey = `aw-${animKey}-${effectiveAnim || 'none'}`
  const gsapRef = useGsapAnimation(isEditMode ? null : effectiveAnim, [spanKey])
  const isGsapAnim = isGsapAnimationValue(effectiveAnim)

  if (!isEditMode) {
    // Non-edit mode: apply CSS or GSAP entrance animation.
    // display:'block' on the span is correct — 'inline-block' creates extra whitespace,
    // 'contents' breaks CSS animations. Callers can pass display='inline-block' for text-level wrappers.
    return (
      <span ref={gsapRef} key={spanKey} style={{ display, animation: isGsapAnim ? undefined : (effectiveAnim || undefined), ...style }}>
        {children}
      </span>
    )
  }

  // Edit mode: NEVER apply the CSS animation — it uses fill-mode:both which starts at opacity:0
  // and the animation replays every time edit mode is entered (new span mounts = animation restart).
  // In edit mode we want everything fully visible and immediately interactive.
  return (
    <span
      style={{
        position: 'relative', display,
        // Explicitly clear any animation the browser might inherit:
        animation: 'none',
        opacity: 1,
        transform: 'none',
        ...style,
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {children}
      {/* Edit button overlay */}
      {hover && (
        <button
          onClick={e => { e.stopPropagation(); ctx.openAnimPicker(animKey, label, effectiveAnim || currentAnim) }}
          title="Edit animation"
          style={{
            position: 'absolute', top: -10, right: -10, zIndex: 9999,
            width: 22, height: 22, borderRadius: '50%',
            background: hasPending ? 'var(--green)' : 'rgba(0,212,255,0.9)',
            border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
            color: '#000', fontWeight: 700,
            animation: 'fadeIn 0.15s ease',
          }}
        >✨</button>
      )}
      {/* Pending indicator dot */}
      {hasPending && !hover && (
        <span style={{ position: 'absolute', top: -4, right: -4, width: 8, height: 8, borderRadius: '50%', background: 'var(--green)', boxShadow: '0 0 6px var(--green)', pointerEvents: 'none' }} />
      )}
      {/* Dashed outline when in edit mode */}
      <span style={{ position: 'absolute', inset: -2, border: '1px dashed rgba(0,212,255,0.3)', borderRadius: 2, pointerEvents: 'none', transition: 'border-color 0.2s', borderColor: hover ? 'rgba(0,212,255,0.7)' : 'rgba(0,212,255,0.3)' }} />
    </span>
  )
}

function PageAnimationFrame({ children, animationValue, editingEnabled }) {
  const frameRef = useGsapAnimation(editingEnabled ? null : animationValue, [animationValue])
  const isGsapAnim = isGsapAnimationValue(animationValue)
  return (
    <div
      ref={frameRef}
      data-edit-preview-root="true"
      style={{
        minHeight: '100%',
        animation: !editingEnabled && !isGsapAnim && animationValue && animationValue !== 'none' ? animationValue : undefined,
      }}
    >
      {children}
    </div>
  )
}

// ── Provider ──────────────────────────────────────────────────────────────────
export function EditProvider({ children }) {
  const [content, setContent] = useState({})
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  // ── new state ──
  const [editingEnabled, setEditingEnabled] = useState(false)
  const [pendingChanges, setPendingChanges] = useState({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  // ── Animation Picker state ──────────────────────────────────────────────────
  const [animPickerOpen, setAnimPickerOpen]     = useState(false)
  const [animPickerTarget, setAnimPickerTarget] = useState(null) // { key, label, currentAnim }

  const openAnimPicker  = useCallback((key, label, currentAnim) => {
    setAnimPickerTarget({ key, label, currentAnim })
    setAnimPickerOpen(true)
  }, [])
  const closeAnimPicker = useCallback(() => setAnimPickerOpen(false), [])
  const applyAnimation  = useCallback((key, cssValue) => {
    setPendingChanges(prev => ({ ...prev, [`anim.${key}`]: cssValue }))
  }, [])

  useEffect(() => {
    setIsAdmin(checkCanEdit())
    api.get('/content').then(res => setContent(res.data)).catch(() => {}).finally(() => setLoading(false))
    const onAuth = () => setIsAdmin(checkCanEdit())
    window.addEventListener('storage', onAuth)
    window.addEventListener('auth-change', onAuth)
    window.addEventListener('admin-auth-change', onAuth)
    window.addEventListener('staff-auth-change', onAuth)
    return () => {
      window.removeEventListener('storage', onAuth)
      window.removeEventListener('auth-change', onAuth)
      window.removeEventListener('admin-auth-change', onAuth)
      window.removeEventListener('staff-auth-change', onAuth)
    }
  }, [])

  // Live content updates via Socket.IO disabled — backend sio removed.
  // Re-enable when /site namespace is restored.
  // useEffect(() => {
  //   const socket = getSiteSocket()
  //   if (!socket) return
  //   const handleContentUpdate = ({ key, data }) => { ... }
  //   socket.on('content-update', handleContentUpdate)
  //   return () => { socket.off('content-update', handleContentUpdate) }
  // }, [])

  // Remove saveError toast after a delay
  useEffect(() => {
    if (!saveError) return
    const t = setTimeout(() => setSaveError(null), 5000)
    return () => clearTimeout(t)
  }, [saveError])

  // Stage a change locally — no network call yet
  const stagePending = useCallback((key, value) => {
    setPendingChanges(prev => ({ ...prev, [key]: value }))
  }, [])

  // Enter edit mode
  const startEditing = useCallback(() => {
    setPendingChanges({})
    setSaveError(null)
    setEditingEnabled(true)
    document.body.classList.add('editing-mode')
  }, [])

  // "Done" in FloatingNav — now a no-op; the EditModeBar handles save/discard
  const requestFinish = useCallback(() => {}, [])

  // Commit all pending changes to backend
  const commitSave = useCallback(async () => {
    setSaving(true)
    setSaveError(null)
    try {
      const entries = Object.entries(pendingChanges)
      await Promise.all(entries.map(([key, value]) =>
        api.put(`/content/${key}`, { value })
      ))
      // Merge into committed content
      setContent(prev => ({ ...prev, ...pendingChanges }))
      setPendingChanges({})
      setEditingEnabled(false)
      document.body.classList.remove('editing-mode')
    } catch (err) {
      setSaveError('Failed to save. Check your connection and try again.')
    } finally {
      setSaving(false)
    }
  }, [pendingChanges])

  // Throw away all pending changes
  const commitDiscard = useCallback(() => {
    setPendingChanges({})
    setEditingEnabled(false)
    document.body.classList.remove('editing-mode')
  }, [])

  const role = getRole()
  const pendingCount = Object.keys(pendingChanges).length
  const pageAnimation = pendingChanges['anim.page.preview'] ?? content['anim.page.preview'] ?? 'none'

  return (
    <EditContext.Provider value={{ content, setContent, isAdmin, loading, editingEnabled, pendingChanges, stagePending, startEditing, requestFinish, animPickerOpen, animPickerTarget, openAnimPicker, closeAnimPicker, applyAnimation }}>
      <PageAnimationFrame animationValue={pageAnimation} editingEnabled={editingEnabled}>
        {children}
      </PageAnimationFrame>

      {/* ── Edit Mode Bar — bottom-left, visible the entire time edit mode is on ── */}
      {isAdmin && editingEnabled && (
        <EditModeBar
          pendingCount={pendingCount}
          onSave={commitSave}
          onDiscard={commitDiscard}
          saving={saving}
          saveError={saveError}
          onOpenPageAnimation={() => openAnimPicker('page.preview', 'Page Preview', pageAnimation)}
        />
      )}

      {/* ── Animation Picker drawer ────────────────────────────────────────── */}
      {isAdmin && editingEnabled && <AnimationPicker />}

      <style>{`
        @keyframes editPulse {
          0%, 100% { opacity: 1; box-shadow: 0 0 6px var(--green); }
          50% { opacity: 0.4; box-shadow: 0 0 2px var(--green); }
        }
        [title="Click to edit"]:hover .edit-badge { opacity: 1 !important; }
        [title="Click to edit"]:hover { outline-color: rgba(0,255,136,0.4) !important; }

        /* ── Site-wide editing mode: highlight ALL editable elements ── */
        body.editing-mode [title="Click to edit"] {
          outline: 1px dashed rgba(0,255,136,0.25) !important;
          outline-offset: 3px;
          border-radius: 2px;
        }
        body.editing-mode [title="Click to edit"]:hover {
          outline: 1px dashed rgba(0,255,136,0.6) !important;
          background: rgba(0,255,136,0.04);
        }
        body.editing-mode [title="Click to edit"] .edit-badge {
          opacity: 0.5 !important;
        }
        body.editing-mode [title="Click to edit"]:hover .edit-badge {
          opacity: 1 !important;
        }
        body.editing-mode .editable-list-item .edit-toolbar {
          opacity: 0.4 !important;
        }
        body.editing-mode .editable-list-item:hover .edit-toolbar {
          opacity: 1 !important;
        }
      `}</style>
    </EditContext.Provider>
  )
}

// ─── EditableIcon ─────────────────────────────────────────────────────────────
// Drop-in replacement for any icon anywhere on the site.
// In view mode: renders the icon normally.
// In edit mode: clicking the icon opens the full IconPickerModal.
//
// Usage:
//   import { EditableIcon } from '../context/EditContext'
//   <EditableIcon contentKey="services.item1.icon" defaultValue="🛡️" size={40} />
//
export function EditableIcon({ contentKey, defaultValue = '❓', size = 36, style = {} }) {
  const { value, save, isAdmin } = useInlineEdit(contentKey, defaultValue)
  const [open, setOpen] = useState(false)

  if (!isAdmin) {
    return <IconDisplay value={value} size={size} />
  }

  return (
    <>
      <div
        onClick={() => setOpen(true)}
        title="Click to change icon"
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', position: 'relative',
          outline: open ? '2px solid var(--cyan)' : '1px dashed rgba(0,212,255,0.3)',
          outlineOffset: 4, borderRadius: 4,
          transition: 'outline 0.2s',
          ...style,
        }}
        onMouseEnter={e => e.currentTarget.style.outline = '2px solid var(--cyan)'}
        onMouseLeave={e => { if (!open) e.currentTarget.style.outline = '1px dashed rgba(0,212,255,0.3)' }}
      >
        <IconDisplay value={value} size={size} />
        <span style={{
          position: 'absolute', bottom: -6, right: -6,
          background: 'var(--cyan)', color: '#000',
          fontSize: 8, fontFamily: 'var(--font-mono)',
          padding: '1px 4px', borderRadius: 2, letterSpacing: 1,
          pointerEvents: 'none',
        }}>ICON</span>
      </div>

      {open && (
        <IconPickerModal
          currentValue={value}
          onSave={v => { save(v); setOpen(false) }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
