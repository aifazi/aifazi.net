'use client'
// pages-src/admin/PageBuilder.jsx — Odoo-style drag-and-drop page builder.
//
// Pick a pre-made block from the palette and drag it onto the canvas, then drag
// blocks to reorder, edit their props inline, duplicate or delete. Saving writes
// the layout to the content block `layout.<slug>`; the public route
// /pages/[slug] renders it via BlockRenderer (and blocks stay inline-editable).
//
// Layouts are flat arrays of blocks. A block of type 'row' is a multi-column
// grid container whose `children` is an array of arrays (one per column). All
// mutation goes through the immutable path helpers in builder/layoutUtils.js, so
// drag/drop/reorder/edit work identically at the top level and inside any
// column — a path [] addresses the top-level array, [rowIdx, colIdx] addresses
// a row's column array.
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'
import { useToast } from '../../components/Toast'
import { useDialog } from '../../components/Dialog'
import { S, PageHeader } from './shared'
import { EmptyState } from './ui'
import { BLOCK_GROUPS, BLOCKS, newBlock, blockTypeName } from './builder/blockLibrary'
import {
  isRow, getAtPath, setAtPath, removeAtPath, insertAtPath,
  midpointIndex, samePath, normalizeRow,
} from './builder/layoutUtils'

const genId = () => { try { return `b_${crypto.randomUUID().slice(0, 8)}` } catch { return `b_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}` } }

const iconBtn = {
  fontFamily: 'var(--font-mono)', fontSize: 12, background: 'transparent', border: 'none',
  color: 'var(--muted)', cursor: 'pointer', padding: '4px 6px', borderRadius: 4, lineHeight: 1,
}

// Single drag payload: palette drags carry {kind:'new', blockType}, existing
// block drags carry {kind:'move', path, index}. Same key for both, so any drop
// zone can move a block from any depth into itself.
const DRAG_TYPE = 'application/x-block'

function FieldInput({ field, value, onChange }) {
  const base = { ...S.input, fontSize: 12, padding: '8px 10px', fontFamily: 'var(--font-mono)' }
  if (field.type === 'textarea') {
    return <textarea value={value ?? ''} rows={3} onChange={e => onChange(e.target.value)} spellCheck={false} style={{ ...base, minHeight: 80, resize: 'vertical', lineHeight: 1.5 }} />
  }
  if (field.type === 'select') {
    return (
      <select value={value ?? ''} onChange={e => onChange(e.target.value)} style={{ ...base, cursor: 'pointer' }}>
        {field.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    )
  }
  if (field.type === 'number') {
    return <input type="number" value={value ?? ''} onChange={e => onChange(e.target.value)} style={base} />
  }
  if (field.type === 'emoji') {
    return <input value={value ?? ''} onChange={e => onChange(e.target.value)} placeholder="⚡" style={{ ...base, textAlign: 'center', width: 90 }} />
  }
  return <input value={value ?? ''} onChange={e => onChange(e.target.value)} placeholder={field.placeholder || ''} style={base} />
}

function BlockEditor({ block, onClose, onSave }) {
  const cfg = BLOCKS[block.type] || {}
  const isRowBlock = block.type === 'row'
  const [draft, setDraft] = useState(() => JSON.parse(JSON.stringify(block)))
  const set = (key, val) => setDraft(d => ({ ...d, [key]: val }))

  // Changing the column count resizes `children`: increasing pads with empty
  // columns, decreasing merges removed trailing columns into the last remaining
  // column so no block content is ever lost.
  const setColumns = (val) => {
    const n = Math.max(1, Math.min(4, Number(val) || 2))
    setDraft(d => {
      const old = Math.max(1, Number(d.columns) || 2)
      let children = (Array.isArray(d.children) ? d.children : []).map(c => (Array.isArray(c) ? c : []))
      while (children.length < n) children.push([])
      while (children.length > n) {
        const moved = children.pop() || []
        children[n - 1] = [...(children[n - 1] || []), ...moved]
      }
      return { ...d, columns: val, children }
    })
  }

  const list = cfg.listField
  const setItems = (fn) => setDraft(d => ({ ...d, [list.key]: fn(Array.isArray(d[list.key]) ? d[list.key] : []) }))

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)' }}>
        {cfg.icon} {cfg.name} · <span style={{ color: 'var(--green)' }}>{block.id}</span>
      </div>

      {cfg.fields.map(field => (
        <div key={field.key}>
          <label style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 2, color: 'var(--muted)', display: 'block', marginBottom: 5 }}>{field.label}</label>
          <FieldInput field={field} value={draft[field.key]} onChange={val => (isRowBlock && field.key === 'columns' ? setColumns(val) : set(field.key, val))} />
        </div>
      ))}

      {isRowBlock && (
        <div style={{ fontSize: 9, color: 'var(--muted)', fontFamily: 'var(--font-mono)', lineHeight: 1.6, border: '1px dashed var(--border)', borderRadius: 8, padding: 10 }}>
          Drag blocks from the palette into this row&apos;s columns. Increasing the column
          count adds empty columns; decreasing moves blocks from removed columns into
          the last remaining one (nothing is deleted).
        </div>
      )}

      {list && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
            <label style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 2, color: 'var(--muted)' }}>{list.label}</label>
            <button onClick={() => setItems(items => [...items, Object.fromEntries(list.itemFields.map(f => [f.key, f.default ?? '']))])} style={{ ...S.btn('transparent', 'var(--green)'), border: '1px dashed rgba(0,255,136,0.4)', fontSize: 9, padding: '4px 10px' }}>+ ADD</button>
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {(Array.isArray(draft[list.key]) ? draft[list.key] : []).map((item, i) => (
              <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, background: 'var(--bg)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--muted)' }}>#{i + 1}</span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => setItems(items => { const n = [...items]; if (i > 0) { [n[i - 1], n[i]] = [n[i], n[i - 1]] } return n })} style={iconBtn} title="Up">↑</button>
                    <button onClick={() => setItems(items => { const n = [...items]; if (i < n.length - 1) { [n[i], n[i + 1]] = [n[i + 1], n[i]] } return n })} style={iconBtn} title="Down">↓</button>
                    <button onClick={() => setItems(items => items.filter((_, x) => x !== i))} style={{ ...iconBtn, color: 'var(--red)' }} title="Remove">✕</button>
                  </div>
                </div>
                {list.itemFields.map(field => (
                  <div key={field.key} style={{ marginBottom: 8 }}>
                    <label style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 1, color: 'var(--muted)', display: 'block', marginBottom: 3 }}>{field.label}</label>
                    <FieldInput field={field} value={item[field.key]} onChange={val => setItems(items => items.map((x, xi) => xi === i ? { ...x, [field.key]: val } : x))} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
        <button onClick={onClose} style={{ ...S.btn('transparent', 'var(--muted)'), border: '1px solid var(--border)', fontSize: 10, padding: '8px 14px' }}>CANCEL</button>
        <button onClick={() => onSave(draft)} style={{ ...S.btn('color-mix(in srgb, var(--green) 12%, transparent)', 'var(--green)'), border: '1px solid color-mix(in srgb, var(--green) 45%, transparent)', fontSize: 10, padding: '8px 14px' }}>APPLY</button>
      </div>
    </div>
  )
}

// A single draggable block row — used at the top level AND inside row columns.
// `path` is the array-path of the array this block lives in, `index` its
// position there. Row containers delegate their inner grid to <RowEditor>.
function BlockRow({ block, path, index, insert, setInsert, onDrop, onEdit, onDup, onRemove, compact }) {
  const cfg = BLOCKS[block.type] || {}
  const here = insert && samePath(insert.path, path) && insert.index === index
  const onDragStart = (e) => {
    e.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ kind: 'move', path, index }))
    e.dataTransfer.effectAllowed = 'move'
  }
  const onDragOver = (e) => {
    e.preventDefault(); e.stopPropagation()
    setInsert({ path, index: midpointIndex(e, index) })
  }
  const onDragEnd = () => setInsert(null)
  const drop = (e) => onDrop(e, path, insert && samePath(insert.path, path) ? insert.index : index)

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={drop}
      style={{
        display: 'flex', flexDirection: 'column', gap: 6, padding: compact ? 8 : '10px 12px', marginBottom: compact ? 0 : 8,
        border: `1px solid ${here ? 'rgba(0,255,136,0.7)' : 'var(--border)'}`,
        borderTop: here ? '2px solid var(--green)' : '1px solid var(--border)',
        borderRadius: 8, background: 'var(--bg)', cursor: 'grab', userSelect: 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ color: 'var(--muted)', fontSize: 11, width: 20, textAlign: 'center' }}>⋮⋮</span>
        <span style={{ fontSize: compact ? 13 : 16 }}>{cfg.icon || '🧱'}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: compact ? 10 : 11, fontWeight: 600 }}>{cfg.name || block.type}</div>
          <div style={{ fontSize: 9, color: 'var(--muted)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {block.type} · {block.id}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          <button onClick={() => onEdit(path, index)} style={{ ...iconBtn, color: 'var(--cyan)' }} title="Edit props">✎</button>
          <button onClick={() => onDup(path, index)} style={iconBtn} title="Duplicate">⧉</button>
          <button onClick={() => onRemove(path, index)} style={{ ...iconBtn, color: 'var(--red)' }} title="Remove">✕</button>
        </div>
      </div>
      {isRow(block) && (
        <RowEditor
          row={block} path={path} index={index} insert={insert} setInsert={setInsert}
          onDrop={onDrop} onEdit={onEdit} onDup={onDup} onRemove={onRemove}
        />
      )}
    </div>
  )
}

// A row container's inner grid: one drop zone per column. Every column is its
// own independent block list (path = [...path, index, colIdx]), so dropping a
// block into column 1 can never collide with column 0 — there's no shared
// coordinate space to collide in. Empty columns render a dashed drop target.
function RowEditor({ row, path, index, insert, setInsert, onDrop, onEdit, onDup, onRemove }) {
  const r = normalizeRow(row)
  const columns = r.columns
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: Number(r.gap) || 16, marginTop: 6 }}>
      {r.children.slice(0, columns).map((col, ci) => {
        const p = [...path, index, ci]
        const endHere = insert && samePath(insert.path, p) && insert.index >= col.length
        const onColumnDragOver = (e) => {
          e.preventDefault(); e.stopPropagation()
          let idx = col.length
          const items = Array.from(e.currentTarget.children || [])
          for (let j = 0; j < items.length; j++) {
            const rct = items[j].getBoundingClientRect()
            if (e.clientY < rct.top + rct.height / 2) { idx = j; break }
            idx = j + 1
          }
          setInsert({ path: p, index: idx })
        }
        return (
          <div
            key={ci}
            onDragOver={onColumnDragOver}
            onDrop={e => onDrop(e, p, insert && samePath(insert.path, p) ? insert.index : col.length)}
            style={{
              border: '1px dashed var(--border)', borderRadius: 8, background: 'var(--bg)',
              minHeight: 56, padding: 6, display: 'grid', gap: 6, alignContent: 'start',
            }}
          >
            {col.length === 0 && (
              <div style={{ fontSize: 9, color: 'var(--muted)', fontFamily: 'var(--font-mono)', textAlign: 'center', padding: '16px 0' }}>DROP BLOCK HERE</div>
            )}
            {col.map((b, j) => (
              <BlockRow key={b.id || `b-${j}`} block={b} path={p} index={j} compact insert={insert} setInsert={setInsert} onDrop={onDrop} onEdit={onEdit} onDup={onDup} onRemove={onRemove} />
            ))}
            {endHere && (
              <div style={{ border: '2px dashed rgba(0,255,136,0.6)', borderRadius: 8, padding: 12, textAlign: 'center', color: 'var(--green)', fontFamily: 'var(--font-mono)', fontSize: 9 }}>DROP</div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function PageBuilder() {
  const toast = useToast()
  const { confirm } = useDialog()
  const [all, setAll] = useState({})
  const [slug, setSlug] = useState('home')
  const [layout, setLayout] = useState([])
  const [dirty, setDirty] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [insert, setInsert] = useState(null) // { path, index } insertion point during drag
  const [editingLoc, setEditingLoc] = useState(null) // { path, index } of the block being edited
  const [preview, setPreview] = useState(false)
  const [revisions, setRevisions] = useState([])
  const [showHistory, setShowHistory] = useState(false)

  const layoutKey = `layout.${slug.trim()}`

  const loadRevisions = async () => {
    try {
      const r = await api.get(`/content/${layoutKey}/revisions`)
      setRevisions(Array.isArray(r.data) ? r.data : [])
    } catch { setRevisions([]) }
  }
  const restoreRevision = async (rev) => {
    const ok = await confirm({ title: 'Restore Revision', message: `Restore version from ${new Date(rev.created_at).toLocaleString()}? Current layout will be overwritten (saved as new revision).`, variant: 'warning', confirmLabel: 'RESTORE' })
    if (!ok) return
    try {
      const r = await api.post(`/content/${layoutKey}/restore`, { revision_id: rev.id })
      const restored = r.data?.value ?? r.data
      const val = Array.isArray(restored) ? restored : []
      setLayout(JSON.parse(JSON.stringify(val)))
      setAll(prev => ({ ...prev, [layoutKey]: val }))
      setDirty(false)
      toast.success(`Restored ${layoutKey}`, { title: 'Restored' })
      loadRevisions()
    } catch { toast.error('Restore failed', { title: 'Error' }) }
  }

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try { const r = await api.get('/content'); setAll(r.data || {}) } catch { toast.error('Could not load content blocks', { title: 'Error' }) }
    finally { setLoading(false) }
  }, [toast])
  // Run the initial fetch exactly once. The toast context (`toast`) is a fresh
  // object on every NotifyProvider render, so depending on it here would re-fetch
  // (and re-run loadPage via the [loading] effect below) after every toast —
  // wiping the in-progress layout on each block drop. Deliberately []-scoped.
  useEffect(() => { fetchAll() /* eslint-disable-line react-hooks/set-state-in-effect */
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const pageSlugs = useMemo(() => {
    return Object.keys(all)
      .filter(k => k.startsWith('layout.'))
      .map(k => k.slice(7))
      .sort()
  }, [all])

  const loadPage = (s) => {
    const value = all[`layout.${s}`]
    setLayout(Array.isArray(value) ? JSON.parse(JSON.stringify(value)) : [])
    setDirty(false)
    setSlug(s)
  }

  useEffect(() => {
    if (!loading && slug) loadPage(slug) // eslint-disable-line react-hooks/set-state-in-effect
  }, [loading]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    const s = slug.trim()
    if (!s) { toast.error('Enter a page slug first', { title: 'Error' }); return }
    setSaving(true)
    try {
      await api.put(`/content/${layoutKey}`, { value: layout })
      setDirty(false)
      setAll(prev => ({ ...prev, [layoutKey]: layout }))
      toast.success(`Saved /pages/${s}`, { title: 'Page Published' })
      loadRevisions()
    } catch { toast.error('Save failed — check your permission', { title: 'Error' }) }
    finally { setSaving(false) }
  }

  // Unified drop handler — targetPath is the array-path of the drop zone, at is
  // the insertion index inside it. Handles both palette drops (kind 'new') and
  // block moves (kind 'move', from any depth).
  const handleDrop = (e, targetPath, at) => {
    e.preventDefault(); e.stopPropagation()
    setInsert(null)
    const raw = e.dataTransfer.getData(DRAG_TYPE)
    if (!raw) return
    let payload
    try { payload = JSON.parse(raw) } catch { return }

    if (payload.kind === 'new') {
      const next = insertAtPath(layout, targetPath, at, newBlock(payload.blockType, genId()))
      setLayout(next); setDirty(true)
      toast.success(`Added ${blockTypeName(payload.blockType)}`, { title: 'Block Added' })
      return
    }
    if (payload.kind === 'move') {
      const srcPath = Array.isArray(payload.path) ? payload.path : []
      const srcIdx = payload.index
      const same = samePath(srcPath, targetPath)
      if (same && (srcIdx === at || srcIdx === at - 1)) return
      let [next, removed] = removeAtPath(layout, srcPath, srcIdx)
      if (removed === undefined) return
      let tAt = at
      if (same && srcIdx < at) tAt = at - 1
      const tArr = getAtPath(next, targetPath)
      const len = Array.isArray(tArr) ? tArr.length : 0
      next = insertAtPath(next, targetPath, Math.max(0, Math.min(tAt, len)), removed)
      setLayout(next); setDirty(true)
    }
  }

  const onEdit = (path, index) => setEditingLoc({ path, index })

  const onDup = (path, index) => {
    const b = getAtPath(layout, path)?.[index]
    if (!b) return
    const dup = { ...JSON.parse(JSON.stringify(b)), id: genId() }
    setLayout(prev => insertAtPath(prev, path, index + 1, dup)); setDirty(true)
  }

  const onRemove = async (path, index) => {
    const b = getAtPath(layout, path)?.[index]
    const ok = await confirm({ title: 'Remove Block', message: `Remove "${blockTypeName(b?.type)}" from this page? You can drag it back from the palette.`, variant: 'danger', confirmLabel: 'REMOVE' })
    if (!ok) return
    setLayout(prev => removeAtPath(prev, path, index)[0]); setDirty(true)
  }

  const applyBlock = (draft) => {
    setLayout(prev => (editingLoc
      ? setAtPath(prev, editingLoc.path, arr => arr.map((b, i) => (i === editingLoc.index ? draft : b)))
      : prev))
    setEditingLoc(null); setDirty(true)
  }

  const clearPage = async () => {
    const ok = await confirm({ title: 'Clear Page', message: 'Remove ALL blocks from this page layout?', variant: 'danger', confirmLabel: 'CLEAR' })
    if (!ok) return
    setLayout([]); setDirty(true)
  }

  const modalStyle = {
    background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 18, width: '100%', maxWidth: 560,
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)', maxHeight: '86vh', display: 'flex', flexDirection: 'column', overflowY: 'auto',
  }

  const editedBlock = editingLoc ? getAtPath(layout, editingLoc.path)?.[editingLoc.index] : null

  return (
    <div>
      <PageHeader
        eyebrow="PAGE BUILDER"
        title="Drag-and-drop page builder"
        subtitle="Pick pre-made blocks from the palette and drag them onto the page, reorder them, edit props, and publish. Row blocks let you place blocks side by side in 2–4 column grids. Pages render at /pages/<slug>."
        actions={<>
          <button onClick={() => { setShowHistory(v => !v); if (!showHistory) loadRevisions() }} style={{ ...S.btn('transparent', 'var(--cyan)'), border: '1px solid rgba(0,212,255,0.35)', fontSize: 10, padding: '8px 14px' }}>{showHistory ? '✕ HISTORY' : '◷ HISTORY'}</button>
          <button onClick={clearPage} style={{ ...S.btn('transparent', 'var(--red)'), border: '1px solid rgba(255,71,87,0.35)', fontSize: 10, padding: '8px 14px' }}>CLEAR</button>
          <button onClick={save} disabled={!dirty || saving} style={{ ...S.btn('color-mix(in srgb, var(--green) 12%, transparent)', 'var(--green)'), border: '1px solid color-mix(in srgb, var(--green) 45%, transparent)', fontSize: 10, padding: '8px 14px' }}>{saving ? 'SAVING…' : (dirty ? '● PUBLISH' : 'PUBLISHED ✓')}</button>
        </>}
      />

      {/* Slug + page selector */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={slug} onChange={e => { setSlug(e.target.value.replace(/[^a-z0-9-_]/gi, '')); setDirty(false) }} placeholder="page slug" spellCheck={false} style={{ ...S.input, fontSize: 12, padding: '9px 12px', fontFamily: 'var(--font-mono)', width: 160 }} />
        <button onClick={() => loadPage(slug)} style={{ ...S.btn('transparent', 'var(--cyan)'), border: '1px solid rgba(0,212,255,0.35)', fontSize: 10, padding: '8px 14px' }}>LOAD</button>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)' }}>→ /pages/{slug || '…'}</span>
        <div style={{ flex: 1 }} />
        {pageSlugs.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {pageSlugs.map(s => (
              <button key={s} onClick={() => loadPage(s)} style={{
                fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 1, padding: '6px 10px', cursor: 'pointer', borderRadius: 4,
                background: s === slug ? 'color-mix(in srgb, var(--green) 12%, transparent)' : 'transparent',
                color: s === slug ? 'var(--green)' : 'var(--muted)', border: '1px solid var(--border)',
              }}>{s}</button>
            ))}
          </div>
        )}
      </div>

      {showHistory && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg2)', padding: 12, marginBottom: 14 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 2, color: 'var(--muted)', marginBottom: 8 }}>REVISIONS — {layoutKey}</div>
          {revisions.length === 0 ? (
            <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>No revisions yet — save to create one.</div>
          ) : revisions.map(rev => (
            <div key={rev.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)', gap: 12 }}>
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text)' }}>{new Date(rev.created_at).toLocaleString()} — {rev.editor || 'unknown'}</div>
                <div style={{ fontSize: 9, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>{Array.isArray(rev.value) ? `${rev.value.length} blocks` : typeof rev.value === 'object' ? 'snapshot' : ''}</div>
              </div>
              <button onClick={() => restoreRevision(rev)} style={{ ...S.btn('transparent', 'var(--orange)'), border: '1px solid rgba(255,107,53,0.35)', fontSize: 9, padding: '5px 10px', flexShrink: 0 }}>RESTORE</button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '250px 1fr', gap: 14, alignItems: 'start' }}>
        {/* Palette */}
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg2)', padding: 12 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 2, color: 'var(--muted)', marginBottom: 10 }}>BLOCK PALETTE — drag onto the page</div>
          {BLOCK_GROUPS.map(group => (
            <div key={group.group} style={{ marginBottom: 12 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 2, color: 'var(--muted)', opacity: 0.7, marginBottom: 6 }}>{group.group.toUpperCase()}</div>
              <div style={{ display: 'grid', gap: 6 }}>
                {group.types.map(type => {
                  const cfg = BLOCKS[type]
                  return (
                    <div
                      key={type}
                      draggable
                      onDragStart={e => { e.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ kind: 'new', blockType: type })); e.dataTransfer.effectAllowed = 'copy' }}
                      onDragEnd={() => setInsert(null)}
                      title={cfg.desc}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', border: '1px solid var(--border)', borderRadius: 8, cursor: 'grab', background: 'var(--bg)', transition: 'all 0.15s', userSelect: 'none' }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(0,255,136,0.5)'}
                      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                    >
                      <span style={{ fontSize: 15 }}>{cfg.icon}</span>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600 }}>{cfg.name}</div>
                        <div style={{ fontSize: 9, color: 'var(--muted)' }}>{cfg.desc}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Canvas */}
        <div
          onDragOver={e => { e.preventDefault(); setInsert(insert && insert.path.length === 0 ? insert : { path: [], index: layout.length }) }}
          onDrop={e => handleDrop(e, [], insert && insert.path.length === 0 ? insert.index : layout.length)}
          style={{ border: `1px dashed ${insert && insert.path.length === 0 ? 'rgba(0,255,136,0.6)' : 'var(--border)'}`, borderRadius: 10, background: 'var(--bg2)', minHeight: 320, padding: 14, transition: 'border-color 0.15s' }}
        >
          {loading ? (
            <div style={{ display: 'grid', gap: 8 }}>{[0,1,2].map(i => <div key={i} className="sk-block" style={{ height: 70 }} />)}</div>
          ) : layout.length === 0 ? (
            <EmptyState icon="📐" title="Empty page" hint="Drag a block from the palette onto this canvas to start building." />
          ) : (
            layout.map((block, i) => (
              <BlockRow
                key={block.id || `b-${i}`} block={block} path={[]} index={i}
                insert={insert} setInsert={setInsert} onDrop={handleDrop}
                onEdit={onEdit} onDup={onDup} onRemove={onRemove}
              />
            ))
          )}
          {layout.length > 0 && insert && insert.path.length === 0 && insert.index >= layout.length && (
            <div style={{ border: '2px dashed rgba(0,255,136,0.6)', borderRadius: 8, padding: 16, textAlign: 'center', color: 'var(--green)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>DROP TO ADD AT END</div>
          )}
        </div>
      </div>

      {/* Block props modal */}
      {editingLoc && editedBlock && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)', padding: 16 }} onClick={() => setEditingLoc(null)}>
          <div style={modalStyle} onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 3, color: 'var(--cyan)', marginBottom: 12 }}>EDIT BLOCK PROPS</div>
            <BlockEditor block={editedBlock} onClose={() => setEditingLoc(null)} onSave={applyBlock} />
          </div>
        </div>
      )}
    </div>
  )
}
