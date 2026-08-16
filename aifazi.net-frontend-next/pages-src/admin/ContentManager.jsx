'use client'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import api from '@/lib/api'
import { useToast } from '../../components/Toast'
import { useDialog } from '../../components/Dialog'
import { S, PageHeader } from './shared'
import { EmptyState } from './ui'

/**
 * ContentManager — edit ANY content_blocks entry from the admin console.
 *
 * This is the "edit everything" backstop for the global inline-edit system:
 *   • Search / filter every content key used by EditableText on any page.
 *   • Edit string / number / JSON values, add brand-new keys, delete unused ones.
 *   • Keys are namespaced `<page>.<section>.<field>` (e.g. store.cta.title).
 *   • Writes go straight to PUT /content/:key (require_staff protected) — the
 *     same endpoint the inline editor uses, so it needs no extra permissions.
 */
function Preview({ value }) {
  const str = typeof value === 'string' ? value : JSON.stringify(value)
  const compact = str.length > 220 ? str.slice(0, 220) + '…' : str
  return (
    <code style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.5 }}>
      {compact || '∅'}
    </code>
  )
}

function Row({ keyName, value, onEdit, onDelete, onHistory, dirty }) {
  const type = Array.isArray(value) ? 'array' : (value === null ? 'null' : typeof value)
  const typeColor = { string: 'var(--green)', number: 'var(--cyan)', boolean: '#ffd700', object: '#a78bfa', array: '#ffb74d', null: 'var(--muted)' }[type] || 'var(--muted)'
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 4px',
      borderBottom: '1px solid rgba(255,255,255,0.045)', transition: 'background 0.15s',
    }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.025)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
      <div style={{ width: 190, flexShrink: 0, minWidth: 150 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text)', wordBreak: 'break-all' }}>{keyName}</div>
        <div style={{ display: 'flex', gap: 4, marginTop: 3 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 1, color: typeColor, border: `1px solid ${typeColor}40`, borderRadius: 3, padding: '1px 5px' }}>{type.toUpperCase()}</span>
          {dirty && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 1, color: '#ffb74d', border: '1px solid #ffb74d40', borderRadius: 3, padding: '1px 5px' }}>DIRTY</span>}
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0, padding: '0 8px' }}>
        <Preview value={value} />
      </div>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        <button onClick={onHistory} style={{ ...S.btn('transparent', 'var(--yellow)'), border: '1px solid rgba(255,215,0,0.35)', fontSize: 9, padding: '5px 10px' }}>HISTORY</button>
        <button onClick={onEdit} style={{ ...S.btn('transparent', 'var(--cyan)'), border: '1px solid rgba(0,212,255,0.35)', fontSize: 9, padding: '5px 10px' }}>EDIT</button>
        <button onClick={onDelete} style={{ ...S.btn('transparent', 'var(--red)'), border: '1px solid rgba(255,71,87,0.35)', fontSize: 9, padding: '5px 10px' }}>DEL</button>
      </div>
    </div>
  )
}

export default function ContentManager() {
  const toast = useToast()
  const { confirm } = useDialog()
  const [all, setAll] = useState({})
  const [search, setSearch] = useState('')
  const [prefix, setPrefix] = useState('all')
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null) // { key, raw, text }
  const [adding, setAdding] = useState(false)
  const [drafts, setDrafts] = useState({}) // key → raw value (not yet saved)
  const [savingKey, setSavingKey] = useState(null)
  const [historyKey, setHistoryKey] = useState(null) // key whose history modal is open
  const [revisions, setRevisions] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try { const r = await api.get('/content'); setAll(r.data || {}) } catch { toast.error('Could not load content blocks', { title: 'Error' }) }
    finally { setLoading(false) }
  }, [toast])
  useEffect(() => { fetchAll() // eslint-disable-line react-hooks/set-state-in-effect
  }, [fetchAll])

  // Dedupe the key's existing value + any unsaved draft (type-aware)
  const effective = (key) => drafts[key] !== undefined ? drafts[key] : all[key]

  const prefixes = useMemo(() => {
    const set = new Set()
    Object.keys(all).forEach(k => { const p = k.split('.')[0]; if (p) set.add(p) })
    return ['all', ...[...set].sort()]
  }, [all])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return Object.entries(all)
      .filter(([k]) => prefix === 'all' || k.startsWith(prefix + '.'))
      .filter(([k]) => !q || k.toLowerCase().includes(q))
      .sort(([a], [b]) => a.localeCompare(b))
  }, [all, search, prefix])

  const toText = (v) => (typeof v === 'string' ? v : JSON.stringify(v, null, 2))
  const fromText = (text) => {
    const t = text.trim()
    // Guess type: JSON parse first, else treat as string
    try { return JSON.parse(t) } catch { return t }
  }

  const saveKey = async (key, value) => {
    setSavingKey(key)
    try {
      await api.put(`/content/${key}`, { value })
      setAll(prev => ({ ...prev, [key]: value }))
      setDrafts(prev => { const n = { ...prev }; delete n[key]; return n })
      toast.success(`Saved ${key}`, { title: 'Content Saved' })
      return true
    } catch { toast.error('Save failed — check your permission', { title: 'Error' }); return false }
    finally { setSavingKey(null) }
  }

  const openEditor = (key) => {
    setEditing({ key, text: toText(effective(key)) })
  }

  const confirmEdit = async () => {
    if (!editing) return
    const next = fromText(editing.text)
    const ok = await saveKey(editing.key, next)
    if (ok) setEditing(null)
  }

  const addKey = async (key, value) => {
    const ok = await saveKey(key, value)
    if (ok) setAdding(false)
  }

  const deleteKey = async (key) => {
    const ok = await confirm({ title: 'Delete Content Block', message: `Delete "${key}"? Pages using it will fall back to their default value.`, variant: 'danger', confirmLabel: 'DELETE' })
    if (!ok) return
    try {
      await api.delete(`/content/${key}`)
      setAll(prev => { const n = { ...prev }; delete n[key]; return n })
      toast.success(`Deleted ${key}`, { title: 'Deleted' })
    } catch { toast.error('Delete failed', { title: 'Error' }) }
  }

  const openHistory = async (key) => {
    setHistoryKey(key)
    setRevisions([])
    setHistoryLoading(true)
    try {
      const r = await api.get(`/content/${key}/revisions`)
      setRevisions(Array.isArray(r.data) ? r.data : [])
    } catch { toast.error('Could not load history', { title: 'Error' }) }
    finally { setHistoryLoading(false) }
  }

  const restoreRevision = async (rev) => {
    const ok = await confirm({ title: 'Restore Revision', message: `Restore the version from ${new Date(rev.created_at).toLocaleString()}? The current value will be overwritten (and saved as a new revision).`, variant: 'warning', confirmLabel: 'RESTORE' })
    if (!ok) return
    try {
      const r = await api.post(`/content/${historyKey}/restore`, { revision_id: rev.id })
      setAll(prev => ({ ...prev, [historyKey]: r.data.value }))
      setHistoryKey(null)
      toast.success(`Restored ${historyKey}`, { title: 'Restored' })
    } catch { toast.error('Restore failed', { title: 'Error' }) }
  }

  const modalStyle = {
    background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 18, width: '100%',
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)', maxHeight: '86vh', display: 'flex', flexDirection: 'column',
  }

  return (
    <div>
      <PageHeader
        eyebrow="CONTENT BLOCKS"
        title="Site Content Manager"
        subtitle="Every EditableText block on every page — search, edit, add or delete. Keys are namespaced page.section.field."
        actions={<>
          <button onClick={fetchAll} style={{ ...S.btn('var(--bg3)', 'var(--muted)'), border: '1px solid var(--border)', fontSize: 10, padding: '8px 14px' }}> REFRESH</button>
          <button onClick={() => setAdding(a => !a)} style={{ ...S.btn('color-mix(in srgb, var(--green) 10%, transparent)', 'var(--green)'), border: '1px solid color-mix(in srgb, var(--green) 40%, transparent)', fontSize: 10, padding: '8px 14px' }}>+ ADD BLOCK</button>
        </>}
      />

      {/* Add-block form */}
      {adding && (
        <div style={{ border: '1px solid rgba(0,255,136,0.3)', background: 'rgba(0,255,136,0.04)', borderRadius: 10, padding: 14, marginBottom: 16 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 2, color: 'var(--green)', marginBottom: 10 }}>NEW CONTENT BLOCK</div>
          <NewBlockForm
            onCancel={() => setAdding(false)}
            onAdd={async (k, v) => { if (all[k] !== undefined) { toast.error('Key already exists', { title: 'Error' }); return } await addKey(k, v) }}
            existingKeys={Object.keys(all)}
          />
        </div>
      )}

      {/* Search + prefix filter */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: '1 1 220px', position: 'relative' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search content keys…" style={{ ...S.input, fontSize: 12, padding: '9px 12px 9px 32px' }} />
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, opacity: 0.5 }}>🔍</span>
          {search && <button onClick={() => setSearch('')} aria-label="Clear search" style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 14 }}>✕</button>}
        </div>
        <div style={{ display: 'flex', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 4, overflow: 'hidden', flexWrap: 'wrap' }}>
          {prefixes.map(p => (
            <button key={p} onClick={() => setPrefix(p)} style={{
              fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 1, padding: '7px 11px', cursor: 'pointer',
              background: prefix === p ? 'color-mix(in srgb, var(--green) 12%, transparent)' : 'transparent',
              color: prefix === p ? 'var(--green)' : 'var(--muted)', border: 'none', borderRight: '1px solid var(--border)',
            }}>{p === 'all' ? 'ALL' : p}</button>
          ))}
        </div>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)' }}>{filtered.length} blocks</span>
      </div>

      {/* List */}
      {loading ? (
        <div style={{ display: 'grid', gap: 8 }}>{[0,1,2,3,4,5,6,7].map(i => <div key={i} className="sk-block" style={{ height: 42 }} />)}</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon="🧱" title="No content blocks" hint={Object.keys(all).length === 0 ? 'No blocks yet — add one or start inline-editing any page.' : 'Nothing matches your search.'} />
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '2px 12px', background: 'var(--bg2)' }}>
          {filtered.map(([key, value]) => (
            <Row key={key} keyName={key} value={effective(key)} dirty={drafts[key] !== undefined} onEdit={() => openEditor(key)} onDelete={() => deleteKey(key)} onHistory={() => openHistory(key)} />
          ))}
        </div>
      )}

      {/* History modal */}
      {historyKey && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)', padding: 16 }} onClick={() => setHistoryKey(null)}>
          <div style={{ ...modalStyle, maxWidth: 620 }} onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 3, color: 'var(--yellow)', marginBottom: 6 }}>VERSION HISTORY</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text)', wordBreak: 'break-all', marginBottom: 12 }}>{historyKey}</div>
            {historyLoading ? (
              <div style={{ display: 'grid', gap: 8 }}>{[0,1,2].map(i => <div key={i} className="sk-block" style={{ height: 42 }} />)}</div>
            ) : revisions.length === 0 ? (
              <EmptyState icon="🕘" title="No revisions yet" hint="Revisions are snapshotted automatically every time this block is saved — check back after an edit." />
            ) : (
              <div style={{ display: 'grid', gap: 8, overflowY: 'auto', maxHeight: '55vh', paddingRight: 4 }}>
                {revisions.map(rev => (
                  <div key={rev.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', background: 'var(--bg)' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text)' }}>{new Date(rev.created_at).toLocaleString()}</span>
                        {rev.editor && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--cyan)', border: '1px solid rgba(0,212,255,0.3)', borderRadius: 3, padding: '1px 6px' }}>{rev.editor}</span>}
                      </div>
                      <Preview value={rev.value} />
                    </div>
                    <button onClick={() => restoreRevision(rev)} style={{ ...S.btn('transparent', 'var(--yellow)'), border: '1px solid rgba(255,215,0,0.35)', fontSize: 9, padding: '5px 10px', flexShrink: 0 }}>RESTORE</button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
              <button onClick={() => setHistoryKey(null)} style={{ ...S.btn('transparent', 'var(--muted)'), border: '1px solid var(--border)', fontSize: 10, padding: '8px 14px' }}>CLOSE</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editing && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)', padding: 16 }} onClick={() => setEditing(null)}>
          <div style={modalStyle} onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 3, color: 'var(--cyan)', marginBottom: 6 }}>EDIT BLOCK</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text)', wordBreak: 'break-all', marginBottom: 12 }}>{editing.key}</div>
            <textarea
              value={editing.text}
              onChange={e => setEditing({ ...editing, text: e.target.value })}
              spellCheck={false}
              style={{ flex: 1, minHeight: 260, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 12, fontFamily: 'var(--font-mono)', padding: 10, borderRadius: 8, resize: 'vertical', lineHeight: 1.6 }}
            />
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', marginTop: 6 }}>Strings save as-is; JSON parses into structured values.</div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
              <button onClick={() => setEditing(null)} style={{ ...S.btn('transparent', 'var(--muted)'), border: '1px solid var(--border)', fontSize: 10, padding: '8px 14px' }}>CANCEL</button>
              <button onClick={confirmEdit} disabled={savingKey === editing.key} style={{ ...S.btn('color-mix(in srgb, var(--cyan) 12%, transparent)', 'var(--cyan)'), border: '1px solid color-mix(in srgb, var(--cyan) 45%, transparent)', fontSize: 10, padding: '8px 14px' }}>{savingKey === editing.key ? 'SAVING…' : 'SAVE'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function NewBlockForm({ onAdd, onCancel, existingKeys }) {
  const [key, setKey] = useState('')
  const [value, setValue] = useState('')
  const [error, setError] = useState('')

  const submit = () => {
    const k = key.trim().replace(/\s+/g, '.')
    if (!k) { setError('Key is required'); return }
    if (existingKeys.includes(k)) { setError('Key already exists'); return }
    const t = value.trim()
    let parsed
    try { parsed = JSON.parse(t) } catch { parsed = t }
    onAdd(k, parsed)
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div>
        <input value={key} onChange={e => { setKey(e.target.value); setError('') }} placeholder="page.section.field" spellCheck={false} style={{ ...S.input, fontSize: 12, padding: '9px 12px', fontFamily: 'var(--font-mono)' }} />
      </div>
      <textarea value={value} onChange={e => setValue(e.target.value)} placeholder="Value — plain text, or JSON for structured content" spellCheck={false} style={{ ...S.input, fontSize: 12, padding: '9px 12px', fontFamily: 'var(--font-mono)', minHeight: 90, resize: 'vertical', lineHeight: 1.5 }} />
      {error && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--red)' }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onCancel} style={{ ...S.btn('transparent', 'var(--muted)'), border: '1px solid var(--border)', fontSize: 10, padding: '7px 12px' }}>CANCEL</button>
        <button onClick={submit} style={{ ...S.btn('color-mix(in srgb, var(--green) 12%, transparent)', 'var(--green)'), border: '1px solid color-mix(in srgb, var(--green) 45%, transparent)', fontSize: 10, padding: '7px 12px' }}>CREATE BLOCK</button>
      </div>
    </div>
  )
}