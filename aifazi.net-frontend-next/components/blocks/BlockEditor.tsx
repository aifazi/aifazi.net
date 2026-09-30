'use client'

/**
 * components/blocks/BlockEditor.tsx — Odoo-style page builder shell.
 *
 * Palette (registry) + canvas (dnd-kit reorder, click-select) + options
 * panel generated from the block schema + undo/redo + save/publish +
 * JSON import/export + device preview. Admin UI gate is convenience;
 * writes are enforced server-side via require_admin.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { getRole } from '@/lib/api'
import { getBlockManifest, listBlockManifests, sanitizeProps } from '@/lib/blocks/registry'
import type { BlockManifest, PageBlock, PropEditor } from '@/lib/blocks/types'
import PageBlocks from '@/lib/blocks/PageBlocks'
import {
  listAllLayouts,
  getLayout,
  createLayout,
  updateLayout,
  deleteLayout,
} from '@/lib/blocks/blocksApi'

interface Meta {
  id: string | null
  slug: string
  title: string
  published: boolean
}

let idCounter = 0
const newId = () => `b-${Date.now().toString(36)}${(idCounter += 1)}`

const DEVICES = [
  { id: 'desktop', label: 'DESKTOP', width: '100%' },
  { id: 'tablet', label: 'TABLET', width: 768 },
  { id: 'phone', label: 'PHONE', width: 390 },
] as const

function summarize(block: PageBlock): string {
  const manifest = getBlockManifest(block.type)
  const firstText = Object.values(block.props).find((v) => typeof v === 'string' && v) as string | undefined
  return firstText ? String(firstText).slice(0, 60) : (manifest?.label ?? block.type)
}

function SortableCard({
  block,
  selected,
  onSelect,
  onMove,
  onDuplicate,
  onRemove,
}: {
  block: PageBlock
  selected: boolean
  onSelect: () => void
  onMove: (dir: -1 | 1) => void
  onDuplicate: () => void
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id })
  const manifest = getBlockManifest(block.type)
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        border: `1px solid ${selected ? 'var(--cyan)' : 'var(--border)'}`,
        borderRadius: 10,
        padding: '10px 12px',
        background: 'var(--bg)',
        display: 'flex',
        gap: 10,
        alignItems: 'center',
      }}
    >
      <button
        type="button"
        aria-label={`Drag ${manifest?.label ?? block.type} to reorder`}
        {...attributes}
        {...listeners}
        style={{
          cursor: 'grab',
          background: 'transparent',
          border: 0,
          color: 'var(--muted)',
          fontSize: 16,
          padding: '4px 6px',
          touchAction: 'none',
        }}
      >
        ⠿
      </button>
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        style={{
          flex: 1,
          textAlign: 'left',
          background: 'transparent',
          border: 0,
          cursor: 'pointer',
          color: 'var(--text)',
          padding: 0,
          minWidth: 0,
        }}
      >
        <span style={{ display: 'block', fontSize: 12, fontWeight: 700 }}>
          {manifest?.icon} {manifest?.label ?? block.type}
        </span>
        <span
          style={{
            display: 'block',
            fontSize: 11,
            color: 'var(--muted)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {summarize(block)}
        </span>
      </button>
      <span style={{ display: 'inline-flex', gap: 2 }} role="group" aria-label="Reorder and edit">
        {([
          ['↑', -1, 'Move up'],
          ['↓', 1, 'Move down'],
          ['⧉', 0, 'Duplicate'],
          ['✕', 2, 'Delete'],
        ] as const).map(([glyph, code, label]) => (
          <button
            key={label}
            type="button"
            title={label}
            aria-label={`${label} ${manifest?.label ?? block.type}`}
            onClick={() => {
              if (code === 2) onRemove()
              else if (code === 0) onDuplicate()
              else onMove(code as -1 | 1)
            }}
            style={{
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: 6,
              color: 'var(--muted)',
              cursor: 'pointer',
              fontSize: 11,
              padding: '4px 7px',
            }}
          >
            {glyph}
          </button>
        ))}
      </span>
    </div>
  )
}

function PropField({
  field,
  value,
  onChange,
}: {
  field: PropEditor
  value: string | number | boolean
  onChange: (v: string | number | boolean) => void
}) {
  const labelStyle = {
    display: 'block',
    fontSize: 10,
    letterSpacing: 1.5,
    color: 'var(--muted)',
    marginBottom: 4,
    fontFamily: 'var(--font-mono)',
  } as const
  const inputStyle = {
    width: '100%',
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: 7,
    color: 'var(--text)',
    padding: '7px 9px',
    fontSize: 12,
    boxSizing: 'border-box',
  } as const
  switch (field.kind) {
    case 'textarea':
      return (
        <label>
          <span style={labelStyle}>{field.label}</span>
          <textarea
            value={String(value ?? '')}
            onChange={(e) => onChange(e.target.value)}
            rows={3}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </label>
      )
    case 'select':
      return (
        <label>
          <span style={labelStyle}>{field.label}</span>
          <select value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} style={inputStyle}>
            {field.options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>
      )
    case 'toggle':
      return (
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: 'var(--text)' }}>
          <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
          {field.label}
        </label>
      )
    case 'color':
      return (
        <label>
          <span style={labelStyle}>{field.label}</span>
          <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="color" value={String(value) || '#000000'} onChange={(e) => onChange(e.target.value)} />
            <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>{String(value)}</span>
          </span>
        </label>
      )
    case 'number':
      return (
        <label>
          <span style={labelStyle}>{field.label}</span>
          <input
            type="number"
            value={Number(value ?? 0)}
            min={field.min}
            max={field.max}
            onChange={(e) => onChange(Number(e.target.value))}
            style={inputStyle}
          />
        </label>
      )
    default:
      return (
        <label>
          <span style={labelStyle}>{field.label}</span>
          <input
            type="text"
            value={String(value ?? '')}
            onChange={(e) => onChange(e.target.value)}
            style={inputStyle}
          />
        </label>
      )
  }
}

export default function BlockEditor() {
  const [meta, setMeta] = useState<Meta>({ id: null, slug: 'home', title: 'Untitled page', published: false })
  const [blocks, setBlocks] = useState<PageBlock[]>([])
  const [layouts, setLayouts] = useState<{ id: string; slug: string; title: string; published: boolean }[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [device, setDevice] = useState<(typeof DEVICES)[number]['id']>('desktop')
  const [preview, setPreview] = useState(false)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  // Start false so the first client render matches the server HTML (getRole()
  // is null without window); hydrate, then flip in an effect — a lazy
  // initializer here caused a hydration mismatch for staff sessions.
  const [isAdmin, setIsAdmin] = useState(false)
  useEffect(() => {
    const sync = () => {
      try {
        setIsAdmin(getRole() === 'admin')
      } catch {
        setIsAdmin(false)
      }
    }
    sync()
    window.addEventListener('auth-change', sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener('auth-change', sync)
      window.removeEventListener('storage', sync)
    }
  }, [])
  const histRef = useRef<{ past: string[]; future: string[] }>({ past: [], future: [] })
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [dirty, setDirty] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const syncHist = () => {
    setCanUndo(histRef.current.past.length > 0)
    setCanRedo(histRef.current.future.length > 0)
  }
  const pushHistory = (snapshot: PageBlock[]) => {
    histRef.current.past.push(JSON.stringify(snapshot))
    if (histRef.current.past.length > 50) histRef.current.past.shift()
    histRef.current.future = []
    syncHist()
  }
  const applyBlocks = (next: PageBlock[], hist = true, clean = false) => {
    if (hist) pushHistory(blocks)
    setBlocks(next)
    setDirty(!clean)
  }
  const undo = () => {
    const prev = histRef.current.past.pop()
    if (!prev) return
    histRef.current.future.push(JSON.stringify(blocks))
    try {
      setBlocks(JSON.parse(prev) as PageBlock[])
      setDirty(true)
    } catch {
      /* noop */
    }
    syncHist()
  }
  const redo = () => {
    const next = histRef.current.future.pop()
    if (!next) return
    histRef.current.past.push(JSON.stringify(blocks))
    try {
      setBlocks(JSON.parse(next) as PageBlock[])
      setDirty(true)
    } catch {
      /* noop */
    }
    syncHist()
  }

  const flashTimer = useRef<number | null>(null)
  const flash = (msg: string) => {
    setNotice(msg)
    if (flashTimer.current) window.clearTimeout(flashTimer.current)
    flashTimer.current = window.setTimeout(() => setNotice((n) => (n === msg ? '' : n)), 2600)
  }
  useEffect(() => () => { if (flashTimer.current) window.clearTimeout(flashTimer.current) }, [])
  const lastEditAt = useRef(0)

  // Load: layouts list + ?slug=
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const list = await listAllLayouts()
        if (alive) setLayouts(list)
      } catch {
        /* non-admin or offline — creation still works after login */
      }
      let slug = ''
      try {
        slug = new URLSearchParams(window.location.search).get('slug') || ''
      } catch {
        /* noop */
      }
      if (!slug) return
      try {
        const doc = await getLayout(slug)
        if (!alive || !doc) return
        setMeta({ id: doc.id, slug: doc.slug, title: doc.title, published: doc.published })
        setBlocks(doc.blocks)
        setDirty(false)
      } catch {
        /* fall through to blank */
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  const addBlock = (manifest: BlockManifest) => {
    if (blocks.length >= 100) {
      flash('Block limit reached (100)')
      return
    }
    const block: PageBlock = { id: newId(), type: manifest.type, props: { ...manifest.defaults } }
    applyBlocks([...blocks, block])
    setSelectedId(block.id)
  }

  const moveBlock = (id: string, dir: -1 | 1) => {
    const list = [...blocks]
    const i = list.findIndex((b) => b.id === id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= list.length) return
    const [b] = list.splice(i, 1)
    list.splice(j, 0, b)
    applyBlocks(list)
  }

  const duplicateBlock = (id: string) => {
    const src = blocks.find((b) => b.id === id)
    if (!src) return
    const copy: PageBlock = {
      ...src,
      id: newId(),
      props: { ...src.props },
      children: src.children?.map((c) => ({ ...c, id: newId(), props: { ...c.props } })),
    }
    const list = [...blocks]
    list.splice(list.findIndex((b) => b.id === id) + 1, 0, copy)
    applyBlocks(list)
    setSelectedId(copy.id)
  }

  const removeBlock = (id: string) => {
    applyBlocks(blocks.filter((b) => b.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  // Keyboard: undo/redo/delete (ignored while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      const tag = (el?.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || el?.isContentEditable) return
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if ((mod && e.key.toLowerCase() === 'y') || (mod && e.shiftKey && e.key.toLowerCase() === 'z')) {
        e.preventDefault()
        redo()
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault()
        removeBlock(selectedId)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, undo, redo, blocks])

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const ids = blocks.map((b) => b.id)
    const from = ids.indexOf(String(active.id))
    const to = ids.indexOf(String(over.id))
    if (from < 0 || to < 0) return
    applyBlocks(arrayMove(blocks, from, to))
  }

  const updateProp = (blockId: string, key: string, value: string | number | boolean) => {
    const manifest = getBlockManifest(blocks.find((b) => b.id === blockId)?.type ?? '')
    const clean = sanitizeProps(manifest?.type ?? '', { ...currentProps(blockId), [key]: value })
    // Undo checkpoint per typing *burst* (≥800ms idle), not per keystroke —
    // previously every edit was hist=false, so prop changes were un-undoable.
    // (Handler context, not render; wall-clock coalescing is the whole point.)
    // eslint-disable-next-line react-hooks/purity
    const now = Date.now()
    const coalesce = now - lastEditAt.current < 800
    lastEditAt.current = now
    applyBlocks(
      blocks.map((b) => (b.id === blockId ? { ...b, props: { ...b.props, ...clean } } : b)),
      !coalesce,
    )
  }
  const currentProps = (blockId: string): Record<string, string | number | boolean> => {
    const b = blocks.find((x) => x.id === blockId)
    return { ...(b?.props ?? {}) }
  }
  const save = async () => {
    setSaving(true)
    try {
      const payload = {
        slug: meta.slug.trim() || 'page',
        title: meta.title.trim() || 'Untitled page',
        published: meta.published,
        blocks,
      }
      const saved = meta.id
        ? await updateLayout(meta.id, payload)
        : await createLayout(payload)
      setMeta({ id: saved.id, slug: saved.slug, title: saved.title, published: saved.published })
      setDirty(false)
      try {
        setLayouts(await listAllLayouts())
      } catch {
        /* noop */
      }
      flash(meta.id ? 'Saved' : 'Created — publish when ready')
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const removeLayout = async () => {
    if (!meta.id || !window.confirm(`Delete layout "${meta.title}"?`)) return
    try {
      await deleteLayout(meta.id)
      setMeta({ id: null, slug: 'page', title: 'Untitled page', published: false })
      applyBlocks([], false, true)
      histRef.current = { past: [], future: [] }
      syncHist()
      setLayouts(await listAllLayouts().catch(() => []))
      flash('Deleted')
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ slug: meta.slug, title: meta.title, blocks }, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${meta.slug || 'layout'}.blocks.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 4000)
  }

  const importJson = async (f: File) => {
    try {
      const raw = JSON.parse(await f.text()) as { blocks?: unknown }
      if (!Array.isArray(raw.blocks)) throw new Error('No blocks array in file')
      // Mirror backend _validate_block: type regex, unique ids across the
      // whole tree, ≤100 top-level blocks, children ≤12 and ≤1 nesting level.
      const seenIds = new Set<string>()
      const cleanBlock = (b: unknown, depth: number): PageBlock | null => {
        if (!b || typeof b !== 'object') return null
        const o = b as Record<string, unknown>
        if (typeof o.type !== 'string' || !/^[a-z0-9-]{1,64}$/.test(o.type)) return null
        let id = typeof o.id === 'string' && o.id && o.id.length <= 64 ? o.id : ''
        while (!id || seenIds.has(id)) id = newId()
        seenIds.add(id)
        const out: PageBlock = {
          id,
          type: o.type,
          props: sanitizeProps(o.type, (o.props ?? {}) as Record<string, unknown>),
        }
        if (Array.isArray(o.children) && depth < 1) {
          const kids = o.children
            .slice(0, 12)
            .map((c) => cleanBlock(c, depth + 1))
            .filter((c): c is PageBlock => !!c)
          if (kids.length) out.children = kids
        }
        return out
      }
      const clean = raw.blocks
        .slice(0, 100)
        .map((b) => cleanBlock(b, 0))
        .filter((b): b is PageBlock => !!b)
      if (!clean.length) throw new Error('No valid blocks in file')
      applyBlocks(clean)
      flash(`Imported ${clean.length} blocks (unsaved)`)
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Import failed')
    }
  }

  const selected = blocks.find((b) => b.id === selectedId) ?? null
  const selectedManifest = selected ? getBlockManifest(selected.type) : null
  const grouped = useMemo(() => {
    const groups = new Map<string, BlockManifest[]>()
    for (const m of listBlockManifests()) {
      if (!groups.has(m.category)) groups.set(m.category, [])
      groups.get(m.category)!.push(m)
    }
    return [...groups.entries()]
  }, [])
  const deviceWidth = DEVICES.find((d) => d.id === device)?.width ?? '100%'

  if (!isAdmin) {
    return (
      <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
        Page builder is staff-only. Sign in as an admin to create and edit layouts.
      </p>
    )
  }

  const BTN = {
    background: 'var(--bg)',
    color: 'var(--text)',
    border: '1px solid var(--border)',
    padding: '8px 12px',
    borderRadius: 8,
    fontSize: 11,
    fontWeight: 700,
    fontFamily: 'var(--font-mono)',
    cursor: 'pointer',
  } as const

  return (
    <div>
      {/* Layout bar */}
      <div
        style={{
          display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
          marginBottom: 12, padding: 12, border: '1px solid var(--border)',
          borderRadius: 12, background: 'var(--bg)',
        }}
      >
        <select
          aria-label="Layout"
          value={meta.id ?? ''}
          onChange={async (e) => {
            const id = e.target.value
            if (!id) {
              setMeta({ id: null, slug: 'page', title: 'Untitled page', published: false })
              applyBlocks([], false, true)
              return
            }
            const found = layouts.find((l) => l.id === id)
            if (!found) return
            try {
              const doc = await getLayout(found.slug)
              if (!doc) return
              setMeta({ id: doc.id, slug: doc.slug, title: doc.title, published: doc.published })
              setBlocks(doc.blocks)
              setDirty(false)
              histRef.current = { past: [], future: [] }
              syncHist()
              setSelectedId(null)
            } catch {
              flash('Load failed')
            }
          }}
          style={{ ...BTN, minWidth: 180 }}
        >
            <option value="">— New layout —</option>

          {layouts.map((l) => (
            <option key={l.id} value={l.id}>
              {l.title} {!l.published ? '(draft)' : ''}
            </option>
          ))}
        </select>
        <input
          aria-label="Page slug"
          value={meta.slug}
          onChange={(e) => setMeta({ ...meta, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, '-').slice(0, 64) })}
          placeholder="page-slug"
          style={{ ...BTN, minWidth: 140, cursor: 'text' }}
        />
        <input
          aria-label="Page title"
          value={meta.title}
          onChange={(e) => setMeta({ ...meta, title: e.target.value.slice(0, 120) })}
          placeholder="Page title"
          style={{ ...BTN, minWidth: 180, cursor: 'text' }}
        />
        <button type="button" onClick={save} disabled={saving} style={BTN}>
          {saving ? 'SAVING…' : meta.id ? 'SAVE' : 'SAVE AS NEW'}
        </button>
        <button
          type="button"
          onClick={() => setMeta({ ...meta, published: !meta.published })}
          title="Toggle visibility (saves on next Save)"
          style={{ ...BTN, borderColor: meta.published ? 'var(--green)' : 'var(--border)', color: meta.published ? 'var(--green)' : 'var(--text)' }}
        >
          {meta.published ? 'PUBLISHED' : 'DRAFT'}
        </button>
        <button type="button" onClick={undo} disabled={!canUndo} style={BTN}>UNDO</button>
        <button type="button" onClick={redo} disabled={!canRedo} style={BTN}>REDO</button>
        <button
          type="button"
          onClick={() => setPreview((v) => !v)}
          aria-pressed={preview}
          style={{ ...BTN, borderColor: preview ? 'var(--cyan)' : 'var(--border)' }}
        >
          {preview ? 'EDIT' : 'PREVIEW'}
        </button>
        <div role="group" aria-label="Preview width" style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          {DEVICES.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => setDevice(d.id)}
              aria-pressed={device === d.id}
              style={{
                background: device === d.id ? 'var(--cyan)' : 'transparent',
                color: device === d.id ? '#fff' : 'var(--muted)',
                border: 0, padding: '8px 10px', fontSize: 10, fontWeight: 700,
                fontFamily: 'var(--font-mono)', cursor: 'pointer',
              }}
            >
              {d.label}
            </button>
          ))}
        </div>
        <button type="button" onClick={exportJson} style={BTN}>EXPORT</button>
        <button type="button" onClick={() => fileRef.current?.click()} style={BTN}>IMPORT</button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) void importJson(f)
          }}
        />
        <button type="button" onClick={removeLayout} disabled={!meta.id} style={{ ...BTN, borderColor: 'var(--red)', color: 'var(--red)' }}>
          DELETE
        </button>
        <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: dirty ? 'var(--orange)' : 'var(--green)' }}>
          {dirty ? '● unsaved changes' : 'saved'}
        </span>
        {notice && (
          <span role="status" style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--cyan)' }}>
            {notice}
          </span>
        )}
      </div>

      {/* Editor grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '220px minmax(0,1fr) 300px',
          gap: 12,
          alignItems: 'start',
        }}
        className="blocks-edit-layout"
      >
        {/* Palette */}
        <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12, background: 'var(--bg)' }}>
          <div style={{ fontSize: 11, letterSpacing: 2, color: 'var(--muted)', marginBottom: 10, fontFamily: 'var(--font-mono)' }}>
            BLOCKS — CLICK TO ADD
          </div>
          {grouped.map(([cat, items]) => (
            <div key={cat} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, letterSpacing: 1.5, color: 'var(--muted)', marginBottom: 6, fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>
                {cat}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {items.map((m) => (
                  <button
                    key={m.type}
                    type="button"
                    onClick={() => addBlock(m)}
                    title={`${m.label} — appends with defaults`}
                    style={{ ...BTN, textAlign: 'left', fontWeight: 500 }}
                  >
                    {m.icon} {m.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Canvas */}
        <div
          style={{
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: 12,
            background: 'var(--bg)',
            margin: '0 auto',
            width: '100%',
            maxWidth: deviceWidth,
          }}
        >
          {preview ? (
            <PageBlocks blocks={blocks} />
          ) : blocks.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', padding: '40px 0' }}>
              Blank canvas — add blocks from the palette, drag ⠿ to reorder.
            </p>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {blocks.map((b) => (
                    <SortableCard
                      key={b.id}
                      block={b}
                      selected={selectedId === b.id}
                      onSelect={() => setSelectedId(b.id)}
                      onMove={(dir) => moveBlock(b.id, dir)}
                      onDuplicate={() => duplicateBlock(b.id)}
                      onRemove={() => {
                        if (window.confirm(`Delete "${summarize(b)}"?`)) removeBlock(b.id)
                      }}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
          {blocks.length > 0 && !preview && (
            <p style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-mono)', margin: '10px 0 0' }}>
              {blocks.length} block{blocks.length === 1 ? '' : 's'} · position {blocks.findIndex((b) => b.id === selectedId) + 1 || '—'}
            </p>
          )}
        </div>

        {/* Options panel (Odoo Customize-tab equivalent) */}
        <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12, background: 'var(--bg)' }}>
          {!selected || !selectedManifest ? (
            <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
              Select a block to edit its properties. Changes apply instantly; undo anytime.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 11, letterSpacing: 2, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
                {selectedManifest.icon} {selectedManifest.label.toUpperCase()}
              </div>
              {selectedManifest.schema.map((field) => (
                <PropField
                  key={field.key}
                  field={field}
                  value={selected.props[field.key] ?? selectedManifest.defaults[field.key] ?? ''}
                  onChange={(v) => updateProp(selected.id, field.key, v)}
                />
              ))}
              <button
                type="button"
                onClick={() => pushHistory(blocks)}
                title="Snapshot current values for undo"
                style={BTN}
              >
                SNAPSHOT FOR UNDO
              </button>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @media (max-width: 1100px) {
          .blocks-edit-layout { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
