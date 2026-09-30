'use client'

/**
 * HybridInfraEditor — Odoo-style builder shell for infra diagrams.
 *
 * View mode reuses the HybridInfra viewer. Edit mode (admin only) adds:
 * palette (click-to-place), drag-to-move, click-to-connect links, per-item
 * properties + notes, undo/redo, save/publish/share, JSON import/export.
 * Server truth is enforced by require_admin; the UI gate is convenience.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { getRole } from '@/lib/api'
import { useInfraTone, infraPalette } from '@/lib/infraTheme'
import HybridInfra from './HybridInfra'
import { HybridInfraCanvas } from './HybridInfraCanvas'
import { INFRA_LIBRARY, type LibraryItem } from '@/data/infra-library'
import { cloudInfraDoc } from '@/data/cloud-infra'
import {
  planADoc,
  sanitizeDoc,
  dependencyChainIn,
  CATEGORY_META,
  type DiagramDoc,
  type InfraCategory,
  type InfraComponent,
} from '@/data/hybrid-infra'
import {
  listDiagrams,
  getDiagram,
  createDiagram,
  updateDiagram,
  deleteDiagram,
  type DiagramMeta,
} from '@/lib/infraApi'

/* PANEL/BTN/INPUT/LABEL live inside the component now (theme-aware). */

/** Built-in read-only seeds (edits save as a copy). */
const BUILTIN_DOCS: Record<string, () => DiagramDoc> = {
  'plan-a': planADoc,
  'cloud-infra': cloudInfraDoc,
}

function slugify(s: string) {
  return (
    s.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) ||
    `diagram-${Date.now().toString(36)}`
  )
}

export default function HybridInfraEditor() {
  const [doc, setDoc] = useState<DiagramDoc>(() => planADoc())
  const [docId, setDocId] = useState<string | null>(null)
  const [isSeed, setIsSeed] = useState(true)
  const [diagrams, setDiagrams] = useState<DiagramMeta[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [connectFrom, setConnectFrom] = useState<string | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [isAdmin, setIsAdmin] = useState(() => {
    try {
      return getRole() === 'admin'
    } catch {
      return false
    }
  })
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<{ msg: string; ok: boolean } | null>(null)
  const [canRedo, setCanRedo] = useState(false)
  const [canUndo, setCanUndo] = useState(false)
  const tone = useInfraTone()
  const pal = infraPalette(tone)
  // Theme-aware chrome (replaces the old dark-only module consts).
  const PANEL: React.CSSProperties = {
    background: `linear-gradient(180deg,${pal.bg2},${pal.bg})`,
    border: `1px solid ${pal.border}`,
    borderRadius: 14,
    padding: 14,
  }
  const BTN: React.CSSProperties = {
    background: pal.panel,
    color: pal.ink,
    border: `1px solid ${pal.border}`,
    padding: '8px 11px',
    borderRadius: 8,
    fontSize: 11,
    fontWeight: 600,
    fontFamily: 'var(--font-mono)',
    cursor: 'pointer',
  }
  const INPUT: React.CSSProperties = {
    width: '100%',
    background: pal.panel,
    border: `1px solid ${pal.border}`,
    borderRadius: 7,
    color: pal.ink,
    padding: '7px 9px',
    fontSize: 12,
    fontFamily: 'var(--font-mono)',
    boxSizing: 'border-box',
  }
  const LABEL: React.CSSProperties = {
    display: 'block',
    fontSize: 10,
    letterSpacing: 1.5,
    color: pal.muted,
    marginBottom: 4,
    fontFamily: 'var(--font-mono)',
  }
  // Odoo-style grid snap step (px). Null = free placement.
  const [snapSize, setSnapSize] = useState<number | null>(10)
  // Locked nodes can't be dragged (editor-local; never persisted to the doc).
  const [lockedIds, setLockedIds] = useState<Set<string>>(new Set())
  const toggleLock = (id: string) => {
    setLockedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const docRef = useRef(doc)
  const histRef = useRef<{ past: string[]; future: string[] }>({ past: [], future: [] })
  const dragRef = useRef(false)
  const focusPushed = useRef(false)
  const savedRef = useRef<string | null>(null)
  const counterRef = useRef(0)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    docRef.current = doc
  })

  // ── Floating "Edit Site" button (page-level FAB) ──────────────
  useEffect(() => {
    const open = () => {
      setEditMode(true)
      try {
        document.getElementById('hybrid-infra-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      } catch {
        /* noop */
      }
    }
    window.addEventListener('infra:edit', open)
    return () => window.removeEventListener('infra:edit', open)
  }, [])

  // ── Load: diagram list + ?diagram=<slug> ─────────────────────
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const list = await listDiagrams()
        if (alive) setDiagrams(list)
      } catch {
        /* offline — seed still renders */
      }
      let slug: string | null = null
      try {
        slug = new URLSearchParams(window.location.search).get('diagram')
      } catch {
        /* noop */
      }
      if (slug && BUILTIN_DOCS[slug]) {
        const seed = BUILTIN_DOCS[slug]()
        if (alive) {
          docRef.current = seed
          setDoc(seed)
          setDocId(null)
          setIsSeed(true)
          savedRef.current = null
        }
        return
      }
      if (slug && slug !== 'plan-a') {
        try {
          const d = await getDiagram(slug)
          if (alive && d) {
            const clean = sanitizeDoc(d)
            if (clean) {
              docRef.current = clean
              setDoc(clean)
              const meta = (await listDiagrams().catch(() => [] as DiagramMeta[])).find(
                (m) => m.slug === clean.slug,
              )
              setDocId(meta?.id ?? clean.id)
              setIsSeed(false)
              savedRef.current = JSON.stringify(clean)
              return
            }
          }
        } catch {
          /* fall through to seed */
        }
      }
      if (alive) {
        const seed = planADoc()
        docRef.current = seed
        setDoc(seed)
        setDocId(null)
        setIsSeed(true)
        savedRef.current = null
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  // ── Admin gate (server enforces truth; this hides the UI) ────
  useEffect(() => {
    const check = () => {
      try {
        setIsAdmin(getRole() === 'admin')
      } catch {
        setIsAdmin(false)
      }
    }
    check()
    window.addEventListener('auth-change', check)
    window.addEventListener('admin-auth-change', check)
    window.addEventListener('storage', check)
    return () => {
      window.removeEventListener('auth-change', check)
      window.removeEventListener('admin-auth-change', check)
      window.removeEventListener('storage', check)
    }
  }, [])

  const isDirty = savedRef.current !== JSON.stringify(doc)

  const selected = useMemo(
    () => doc.nodes.find((c) => c.id === selectedId) ?? null,
    [doc.nodes, selectedId],
  )

  const focusIds = useMemo(() => {
    if (!selectedId) return null
    const { up, down } = dependencyChainIn(doc.nodes, selectedId)
    return new Set([selectedId, ...up, ...down])
  }, [doc.nodes, selectedId])

  // ── History ──────────────────────────────────────────────────
  const syncHistButtons = () => {
    setCanUndo(histRef.current.past.length > 0)
    setCanRedo(histRef.current.future.length > 0)
  }
  const pushHistory = () => {
    histRef.current.past.push(JSON.stringify(docRef.current))
    if (histRef.current.past.length > 50) histRef.current.past.shift()
    histRef.current.future = []
    syncHistButtons()
  }
  const applyDoc = (next: DiagramDoc, hist = true) => {
    if (hist) pushHistory()
    docRef.current = next
    setDoc(next)
  }
  const undo = () => {
    const h = histRef.current
    const prev = h.past.pop()
    if (!prev) return
    h.future.push(JSON.stringify(docRef.current))
    const d = sanitizeDoc(JSON.parse(prev))
    if (d) {
      docRef.current = d
      setDoc(d)
      if (selectedId && !d.nodes.some((n) => n.id === selectedId)) setSelectedId(null)
    }
    syncHistButtons()
  }
  const redo = () => {
    const h = histRef.current
    const next = h.future.pop()
    if (!next) return
    h.past.push(JSON.stringify(docRef.current))
    const d = sanitizeDoc(JSON.parse(next))
    if (d) {
      docRef.current = d
      setDoc(d)
    }
    syncHistButtons()
  }

  // ── Node ops ─────────────────────────────────────────────────
  const handleMoveNode = (id: string, pos: { x?: number; y?: number; rackU?: number }, done: boolean) => {
    if (lockedIds.has(id)) {
      if (done) setNotice({ msg: 'Node is locked — unlock to move it', ok: false })
      return
    }
    if (!dragRef.current) {
      pushHistory()
      dragRef.current = true
    }
    const cur = docRef.current
    applyDoc(
      {
        ...cur,
        nodes: cur.nodes.map((n) => {
          if (n.id !== id) return n
          const patch: Partial<InfraComponent> = {}
          if (pos.rackU !== undefined) patch.rackU = Math.max(1, Math.min(42, pos.rackU))
          if (pos.x !== undefined) patch.x = Math.max(-200, Math.min(1480, Math.round(pos.x)))
          if (pos.y !== undefined) patch.y = Math.max(-100, Math.min(1020, Math.round(pos.y)))
          return { ...n, ...patch }
        }),
      },
      false,
    )
    if (done) dragRef.current = false
  }

  const boxesOverlap = (a: { x: number; y: number; w: number; h: number }, b: typeof a) =>
    a.x < b.x + b.w + 20 && a.x + a.w + 20 > b.x && a.y < b.y + b.h + 20 && a.y + a.h + 20 > b.y

  // ── Auto-arrange: grid columns per layer, rows stacked (Odoo-style) ──
  const LAYER_ORDER = ['edge', 'rack', 'vm', 'cloud', 'users', 'legacy']
  const arrangeNodes = () => {
    const cur = docRef.current
    const nextY: Record<string, number> = {}
    const nodes = cur.nodes.map((n) => {
      const li = Math.max(0, LAYER_ORDER.indexOf(n.layer || 'cloud'))
      const y = nextY[n.layer] ?? 40
      const w = n.w || 160
      const h = n.h || 60
      nextY[n.layer] = y + h + 24
      return {
        ...n,
        x: Math.max(0, Math.min(40 + li * 210, 1480 - w)),
        y: Math.max(0, Math.min(y, 1020 - h)),
      }
    })
    applyDoc({ ...cur, nodes })
    setNotice({ msg: 'Auto-arranged by layer (undo available)', ok: true })
  }

  const cycleSnap = () => {
    setSnapSize((s) => (s === 10 ? 20 : s === 20 ? null : 10))
  }

  // ── Align / distribute free nodes (rack layer excluded — rackU owned) ──
  const freeNodes = () => docRef.current.nodes.filter((n) => n.layer !== 'rack')
  const alignNodes = (axis: 'x' | 'y') => {
    const free = freeNodes()
    if (free.length < 2) {
      setNotice({ msg: 'Select at least 2 free nodes to align', ok: false })
      return
    }
    const v = Math.min(...free.map((n) => (axis === 'x' ? n.x ?? 0 : n.y ?? 0)))
    applyDoc({
      ...docRef.current,
      nodes: docRef.current.nodes.map((n) =>
        n.layer === 'rack' ? n : { ...n, [axis]: v },
      ),
    })
    setNotice({ msg: axis === 'x' ? 'Aligned left' : 'Aligned top', ok: true })
  }
  const spreadNodes = (axis: 'x' | 'y') => {
    const free = [...freeNodes()].sort((a, b) => (axis === 'x' ? (a.x ?? 0) - (b.x ?? 0) : (a.y ?? 0) - (b.y ?? 0)))
    if (free.length < 3) {
      setNotice({ msg: 'Need at least 3 free nodes to distribute', ok: false })
      return
    }
    const lo = axis === 'x' ? (free[0].x ?? 0) : (free[0].y ?? 0)
    const hi = axis === 'x' ? (free[free.length - 1].x ?? 0) : (free[free.length - 1].y ?? 0)
    const step = (hi - lo) / (free.length - 1)
    const pos = new Map(free.map((n, i) => [n.id, Math.round(lo + step * i)]))
    applyDoc({
      ...docRef.current,
      nodes: docRef.current.nodes.map((n) =>
        n.layer === 'rack' || !pos.has(n.id) ? n : { ...n, [axis]: pos.get(n.id) },
      ),
    })
    setNotice({ msg: axis === 'x' ? 'Distributed horizontally' : 'Distributed vertically', ok: true })
  }

  // ── Editor keyboard shortcuts (ignored while typing in inputs) ──
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
        if (window.confirm('Delete the selected node and its links?')) deleteNode(selectedId)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  const addNode = (item: LibraryItem) => {
    const cur = docRef.current
    let node: InfraComponent
    if (item.layer === 'rack') {
      const h = item.rackH ?? 2
      const occupied: [number, number][] = []
      for (const n of cur.nodes) {
        if (n.layer === 'rack' && n.rackU) occupied.push([n.rackU, n.rackU + (n.rackH ?? 1)])
      }
      let u = 1
      outer: for (; u <= 42 - h + 1; u++) {
        for (const [a, b] of occupied) {
          if (u < b && u + h > a) continue outer
        }
        break
      }
      if (u > 42 - h + 1) u = 1
      counterRef.current += 1
      node = {
        ...stampBase(item),
        id: `${item.key.replace(/^tpl-/, '')}-${Date.now().toString(36)}${counterRef.current}`,
        rackU: u,
        rackH: h,
      }
    } else {
      const spots = [{ x: 640, y: 460 }]
      for (let r = 1; r < 6; r++) {
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2
          spots.push({ x: 640 + Math.cos(a) * r * 130, y: 460 + Math.sin(a) * r * 100 })
        }
      }
      const existing = cur.nodes
        .filter((n) => n.layer !== 'rack' && n.x !== undefined)
        .map((n) => ({ x: n.x ?? 0, y: n.y ?? 0, w: n.w ?? 180, h: n.h ?? 56 }))
      const cand = spots.find(
        (s) =>
          !existing.some((e) =>
            boxesOverlap(
              { x: s.x - item.defaultW / 2, y: s.y - item.defaultH / 2, w: item.defaultW, h: item.defaultH },
              e,
            ),
          ),
      ) ?? spots[0]
      counterRef.current += 1
      node = {
        ...stampBase(item),
        id: `${item.key.replace(/^tpl-/, '')}-${Date.now().toString(36)}${counterRef.current}`,
        x: Math.round(cand.x - item.defaultW / 2),
        y: Math.round(cand.y - item.defaultH / 2),
      }
    }
    applyDoc({ ...cur, nodes: [...cur.nodes, node] })
    setSelectedId(node.id)
    setNotice({ msg: `Placed ${item.name} — drag to position`, ok: true })
  }

  const stampBase = (item: LibraryItem): InfraComponent => ({
    id: '',
    name: item.name,
    category: item.category,
    layer: item.layer,
    role: item.role,
    desc: item.desc,
    workloads: [...item.workloads],
    deps: [],
    w: item.defaultW,
    h: item.defaultH,
    shape: item.shape,
    rackH: item.rackH,
  })

  const deleteNode = (id: string) => {
    const cur = docRef.current
    applyDoc({
      ...cur,
      nodes: cur.nodes.filter((n) => n.id !== id),
      flows: cur.flows.filter((f) => f.from !== id && f.to !== id),
    })
    // Clean dangling dep refs so links never dangle.
    const cleaned = docRef.current
    applyDoc(
      {
        ...cleaned,
        nodes: cleaned.nodes.map((n) => ({ ...n, deps: n.deps.filter((d) => d !== id) })),
      },
      false,
    )
    if (selectedId === id) setSelectedId(null)
    if (connectFrom === id) setConnectFrom(null)
  }

  const duplicateNode = (id: string) => {
    const cur = docRef.current
    const src = cur.nodes.find((n) => n.id === id)
    if (!src) return
    counterRef.current += 1
    const nid = `${src.id}-copy${counterRef.current}`
    const copy: InfraComponent = {
      ...src,
      id: nid,
      name: `${src.name} (copy)`,
      workloads: [...src.workloads],
      deps: [...src.deps],
      x: src.x !== undefined ? src.x + 40 : undefined,
      y: src.y !== undefined ? src.y + 40 : undefined,
      rackU: src.rackU !== undefined ? Math.min(42, src.rackU + (src.rackH ?? 1)) : undefined,
    }
    applyDoc({ ...cur, nodes: [...cur.nodes, copy] })
    setSelectedId(nid)
  }

  const updateNode = (id: string, patch: Partial<InfraComponent>) => {
    // Live edit without history — the panel's onFocusCapture pushes one
    // undo checkpoint per focus session.
    const cur = docRef.current
    const next = {
      ...cur,
      nodes: cur.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
    }
    docRef.current = next
    setDoc(next)
  }

  // ── Link ops ─────────────────────────────────────────────────
  const handleAddLink = (from: string, to: string) => {
    const cur = docRef.current
    if (cur.flows.some((f) => f.from === from && f.to === to)) {
      setNotice({ msg: 'Link already exists', ok: false })
      setConnectFrom(null)
      return
    }
    const src = cur.nodes.find((n) => n.id === from)
    const cat = src?.category ?? 'network'
    applyDoc({
      ...cur,
      flows: [...cur.flows, { id: `f-${from}-${to}-${Date.now().toString(36)}`, from, to, cat }],
    })
    setConnectFrom(null)
    setNotice({ msg: `Linked ${depNameOf(from)} → ${depNameOf(to)}`, ok: true })
  }

  const deleteLink = (id: string) => {
    const cur = docRef.current
    applyDoc({ ...cur, flows: cur.flows.filter((f) => f.id !== id) })
  }

  const setLinkCat = (id: string, cat: InfraComponent['category']) => {
    const cur = docRef.current
    applyDoc({ ...cur, flows: cur.flows.map((f) => (f.id === id ? { ...f, cat } : f)) })
  }

  // ── Select wrapper (connect-mode aware) ──────────────────────
  const handleSelect = (id: string | null) => {
    if (connectFrom) {
      if (id === null || id === connectFrom) setConnectFrom(null)
      return
    }
    setSelectedId(id)
  }

  // ── Persistence ──────────────────────────────────────────────
  const refreshList = async () => {
    try {
      setDiagrams(await listDiagrams())
    } catch {
      /* offline */
    }
  }

  const save = async () => {
    setSaving(true)
    setNotice(null)
    try {
      const cur = docRef.current
      if (isSeed || !docId) {
        const created = await createDiagram({
          ...cur,
          slug: cur.slug === 'plan-a' ? '' : cur.slug,
          updatedAt: new Date().toISOString(),
        })
        const clean = sanitizeDoc(created)
        if (!clean) throw new Error('Server returned an invalid doc')
        docRef.current = clean
        setDoc(clean)
        setDocId(clean.id)
        setIsSeed(false)
        savedRef.current = JSON.stringify(clean)
        try {
          const url = new URL(window.location.href)
          url.searchParams.set('diagram', clean.slug)
          window.history.replaceState(null, '', url.toString())
        } catch {
          /* noop */
        }
      } else {
        const updated = await updateDiagram({ ...cur, updatedAt: new Date().toISOString() })
        const clean = sanitizeDoc(updated)
        if (!clean) throw new Error('Server returned an invalid doc')
        docRef.current = clean
        setDoc(clean)
        savedRef.current = JSON.stringify(clean)
      }
      await refreshList()
      setNotice({ msg: 'Saved', ok: true })
    } catch (e) {
      setNotice({ msg: e instanceof Error ? e.message : 'Save failed', ok: false })
    } finally {
      setSaving(false)
    }
  }

  const togglePublish = async () => {
    if (isSeed || !docId) {
      setNotice({ msg: 'Save the diagram first, then publish', ok: false })
      return
    }
    const cur = { ...docRef.current, published: !docRef.current.published }
    applyDoc(cur, false)
    try {
      const updated = await updateDiagram(cur)
      const clean = sanitizeDoc(updated)
      if (clean) {
        docRef.current = clean
        setDoc(clean)
        savedRef.current = JSON.stringify(clean)
      }
      await refreshList()
    } catch (e) {
      setNotice({ msg: e instanceof Error ? e.message : 'Publish failed', ok: false })
    }
  }

  const newDoc = () => {
    if (savedRef.current !== JSON.stringify(docRef.current) && !window.confirm('Discard unsaved changes?')) return
    const d: DiagramDoc = {
      id: `local-${Date.now().toString(36)}`,
      slug: 'untitled',
      title: 'Untitled diagram',
      updatedAt: new Date().toISOString(),
      published: false,
      nodes: [],
      flows: [],
    }
    histRef.current = { past: [], future: [] }
    syncHistButtons()
    docRef.current = d
    setDoc(d)
    setDocId(null)
    setIsSeed(false)
    setSelectedId(null)
    savedRef.current = null
  }

  const duplicateDoc = () => {
    const cur = docRef.current
    const d = {
      ...cur,
      id: `local-${Date.now().toString(36)}`,
      slug: `${cur.slug}-copy`,
      title: `${cur.title} (copy)`,
      published: false,
      nodes: cur.nodes.map((n) => ({ ...n, deps: [...n.deps], workloads: [...n.workloads] })),
      flows: cur.flows.map((f) => ({ ...f })),
    }
    histRef.current = { past: [], future: [] }
    syncHistButtons()
    docRef.current = d
    setDoc(d)
    setDocId(null)
    setIsSeed(false)
    savedRef.current = null
    setNotice({ msg: 'Duplicated — save to keep it', ok: true })
  }

  const removeDoc = async () => {
    if (isSeed || !docId) return
    if (!window.confirm(`Delete "${docRef.current.title}"?`)) return
    try {
      await deleteDiagram(docId)
      await refreshList()
      const seed = planADoc()
      docRef.current = seed
      setDoc(seed)
      setDocId(null)
      setIsSeed(true)
      setSelectedId(null)
      savedRef.current = null
      try {
        const url = new URL(window.location.href)
        url.searchParams.delete('diagram')
        window.history.replaceState(null, '', url.toString())
      } catch {
        /* noop */
      }
    } catch (e) {
      setNotice({ msg: e instanceof Error ? e.message : 'Delete failed', ok: false })
    }
  }

  const switchDoc = async (slug: string) => {
    if (savedRef.current !== JSON.stringify(docRef.current) && !window.confirm('Discard unsaved changes?')) return
    if (BUILTIN_DOCS[slug]) {
      const seed = BUILTIN_DOCS[slug]()
      docRef.current = seed
      setDoc(seed)
      setDocId(null)
      setIsSeed(true)
      setSelectedId(seed.nodes[0]?.id ?? null)
      savedRef.current = null
      histRef.current = { past: [], future: [] }
      syncHistButtons()
      try {
        const url = new URL(window.location.href)
        if (slug === 'plan-a') url.searchParams.delete('diagram')
        else url.searchParams.set('diagram', slug)
        window.history.replaceState(null, '', url.toString())
      } catch {
        /* noop */
      }
      return
    }
    try {
      const d = await getDiagram(slug)
      const clean = d ? sanitizeDoc(d) : null
      if (!clean) {
        setNotice({ msg: 'Could not load diagram', ok: false })
        return
      }
      docRef.current = clean
      setDoc(clean)
      const meta = diagrams.find((m) => m.slug === clean.slug)
      setDocId(meta?.id ?? clean.id)
      setIsSeed(false)
      setSelectedId(clean.nodes[0]?.id ?? null)
      savedRef.current = JSON.stringify(clean)
      histRef.current = { past: [], future: [] }
      syncHistButtons()
    } catch (e) {
      setNotice({ msg: e instanceof Error ? e.message : 'Load failed', ok: false })
    }
  }

  const shareDoc = async () => {
    const cur = docRef.current
    const slug = cur.slug || 'plan-a'
    const url = `${window.location.origin}/hybrid-infra?diagram=${encodeURIComponent(slug)}${selectedId ? `&node=${encodeURIComponent(selectedId)}` : ''}`
    try {
      await navigator.clipboard.writeText(url)
      setNotice({ msg: 'Share link copied', ok: true })
    } catch {
      setNotice({ msg: url, ok: true })
    }
  }

  const exportDoc = () => {
    const blob = new Blob([JSON.stringify(docRef.current, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${docRef.current.slug || 'diagram'}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 4000)
  }

  const importDoc = async (file: File) => {
    try {
      const raw = JSON.parse(await file.text())
      const clean = sanitizeDoc(raw)
      if (!clean) {
        setNotice({ msg: 'Invalid diagram file', ok: false })
        return
      }
      clean.id = `import-${Date.now().toString(36)}`
      clean.published = false
      histRef.current = { past: [], future: [] }
      syncHistButtons()
      docRef.current = clean
      setDoc(clean)
      setDocId(null)
      setIsSeed(false)
      setSelectedId(clean.nodes[0]?.id ?? null)
      savedRef.current = null
      setNotice({ msg: `Imported "${clean.title}" — save to keep it`, ok: true })
    } catch {
      setNotice({ msg: 'Invalid diagram file', ok: false })
    }
  }

  // ── Render ───────────────────────────────────────────────────
  if (!editMode) {
    return (
      <div id="hybrid-infra-editor">
        {isAdmin && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
            <button type="button" onClick={() => setEditMode(true)} style={BTN}>
              EDIT DIAGRAM
            </button>
          </div>
        )}
        <HybridInfra doc={isSeed ? null : doc} />
      </div>
    )
  }

  return (
    <div id="hybrid-infra-editor">
      {/* Diagram bar */}
      <div
        style={{
          display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
          marginBottom: 12, ...PANEL,
        }}
      >
        <select
          aria-label="Diagram"
          value={doc.slug}
          onChange={(e) => void switchDoc(e.target.value)}
          style={{ ...INPUT, width: 'auto', minWidth: 180 }}
        >
          <option value="plan-a">Plan A (built-in{isSeed && doc.slug === 'plan-a' ? ' — editing a copy' : ''})</option>
          <option value="cloud-infra">Plan C — Cloud (built-in{isSeed && doc.slug === 'cloud-infra' ? ' — editing a copy' : ''})</option>
          {diagrams.map((m) => (
            <option key={m.id} value={m.slug}>
              {m.title} {!m.published ? '(draft)' : ''}
            </option>
          ))}
        </select>
        <input
          aria-label="Diagram title"
          value={doc.title}
          onFocus={() => {
            if (!focusPushed.current) {
              focusPushed.current = true
              pushHistory()
            }
          }}
          onBlur={() => {
            focusPushed.current = false
          }}
          onChange={(e) => {
            const cur = docRef.current
            const next = { ...cur, title: e.target.value.slice(0, 120) }
            docRef.current = next
            setDoc(next)
          }}
          style={{ ...INPUT, width: 220 }}
        />
        <button type="button" onClick={() => void save()} disabled={saving} style={BTN}>
          {saving ? 'SAVING…' : isSeed || !docId ? 'SAVE AS NEW' : 'SAVE'}
        </button>
        <button
          type="button"
          onClick={() => void togglePublish()}
          disabled={isSeed || !docId}
          title={isSeed || !docId ? 'Save first, then publish' : 'Toggle public visibility'}
          style={{
            ...BTN,
            borderColor: doc.published ? pal.green : pal.border,
            color: doc.published ? pal.green : pal.ink,
          }}
        >
          {doc.published ? 'PUBLISHED' : 'DRAFT'}
        </button>
        <button type="button" onClick={undo} disabled={!canUndo} style={BTN}>UNDO</button>
        <button type="button" onClick={redo} disabled={!canRedo} style={BTN}>REDO</button>
        <button
          type="button"
          onClick={arrangeNodes}
          title="Auto-arrange blocks into layer columns (undo available)"
          style={BTN}
        >
          ARRANGE
        </button>
        <button
          type="button"
          onClick={cycleSnap}
          title="Cycle grid snap: 10px → 20px → free placement"
          style={BTN}
        >
          SNAP: {snapSize ?? 'OFF'}
        </button>
        <button type="button" onClick={() => alignNodes('x')} title="Align free nodes to the left edge" style={BTN}>
          ALIGN ←
        </button>
        <button type="button" onClick={() => alignNodes('y')} title="Align free nodes to the top edge" style={BTN}>
          ALIGN ↑
        </button>
        <button type="button" onClick={() => spreadNodes('x')} title="Distribute free nodes evenly (horizontal)" style={BTN}>
          SPREAD ↔
        </button>
        <button type="button" onClick={() => spreadNodes('y')} title="Distribute free nodes evenly (vertical)" style={BTN}>
          SPREAD ↕
        </button>
        <button type="button" onClick={newDoc} style={BTN}>NEW</button>
        <button type="button" onClick={duplicateDoc} style={BTN}>DUPLICATE</button>
        <button
          type="button" onClick={() => void removeDoc()} disabled={isSeed || !docId} style={BTN}
        >
          DELETE
        </button>
        <button type="button" onClick={() => void shareDoc()} style={BTN}>SHARE</button>
        <button type="button" onClick={exportDoc} style={BTN}>EXPORT</button>
        <button type="button" onClick={() => fileRef.current?.click()} style={BTN}>IMPORT</button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) void importDoc(f)
          }}
        />
        <button type="button" onClick={() => { setEditMode(false); setConnectFrom(null) }} style={BTN}>
          DONE
        </button>
        <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: isDirty ? pal.amber : pal.green }}>
          {isSeed ? 'built-in seed (edits save as a copy)' : isDirty ? '● unsaved changes' : 'saved'}
        </span>
        {notice && (
          <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: notice.ok ? pal.green : pal.red }}>
            {notice.msg}
          </span>
        )}
      </div>

      {/* Editor grid */}
      <div className="hi-edit-layout" style={{ display: 'grid', gridTemplateColumns: '230px minmax(0,1fr) 320px', gap: 12, alignItems: 'start' }}>
        {/* Palette */}
        <div style={{ ...PANEL, maxHeight: 720, overflowY: 'auto' }}>
          <div style={{ fontSize: 11, letterSpacing: 2, color: pal.muted, marginBottom: 10, fontFamily: 'var(--font-mono)' }}>
            IT LIBRARY — CLICK TO PLACE
          </div>
          {INFRA_LIBRARY.map((g) => (
            <div key={g.id} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, letterSpacing: 1.5, color: pal.muted, marginBottom: 6, fontFamily: 'var(--font-mono)' }}>
                {g.title.toUpperCase()}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {g.items.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => addNode(item)}
                    title={item.desc}
                    style={{
                      ...BTN, textAlign: 'left', fontWeight: 500,
                      borderLeft: `3px solid ${CATEGORY_META[item.category].color}`,
                    }}
                  >
                    {item.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Canvas */}
        <div
          style={{
            position: 'relative', border: '1px solid #203a55', borderRadius: 18,
            overflow: 'hidden', background: 'linear-gradient(180deg,rgba(12,27,45,.95),rgba(8,18,32,.98))',
            minHeight: 480,
          }}
        >
          {connectFrom && (
            <div
              style={{
                position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
                zIndex: 5, background: 'rgba(54,215,232,.12)', border: '1px solid rgba(54,215,232,.4)',
                color: pal.blue, fontSize: 11, fontFamily: 'var(--font-mono)',
                padding: '7px 12px', borderRadius: 8,
              }}
            >
              Linking from <b>{depNameOf(connectFrom)}</b> — click a target node (Esc cancels)
              <button type="button" onClick={() => setConnectFrom(null)} style={{ ...BTN, marginLeft: 8, padding: '4px 8px' }}>
                CANCEL
              </button>
            </div>
          )}
          <HybridInfraCanvas
            activeMode="all"
            edgeVendor="fortigate"
            selectedId={selectedId}
            focusIds={focusIds}
            playStep={-1}
            viewMode="technical"
            onSelect={handleSelect}
            nodes={doc.nodes}
            flows={doc.flows}
            editable
            connectFrom={connectFrom}
            onMoveNode={handleMoveNode}
            onAddLink={handleAddLink}
            tone={tone}
            snap={snapSize}
            lockedIds={lockedIds}
          />
        </div>

        {/* Properties */}
        <div
          style={{ ...PANEL, maxHeight: 720, overflowY: 'auto' }}
          onFocusCapture={() => {
            if (!focusPushed.current) {
              focusPushed.current = true
              pushHistory()
            }
          }}
          onBlurCapture={() => {
            focusPushed.current = false
          }}
        >
          {!selected ? (
            <div style={{ fontSize: 12, color: pal.muted, fontFamily: 'var(--font-mono)', lineHeight: 1.6 }}>
              Select a node to edit its properties. Drag nodes to move them.
              Use CONNECT to draw animated links between nodes.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 11, letterSpacing: 2, color: pal.muted, fontFamily: 'var(--font-mono)' }}>
                PROPERTIES
              </div>
              <div>
                <label style={LABEL}>Name</label>
                <input
                  value={selected.name}
                  onChange={(e) => updateNode(selected.id, { name: e.target.value.slice(0, 80) })}
                  style={INPUT}
                />
              </div>
              <div>
                <label style={LABEL}>Role</label>
                <input
                  value={selected.role}
                  onChange={(e) => updateNode(selected.id, { role: e.target.value.slice(0, 80) })}
                  style={INPUT}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label style={LABEL}>Category</label>
                  <select
                    value={selected.category}
                    onChange={(e) => updateNode(selected.id, { category: e.target.value as InfraCategory })}
                    style={INPUT}
                  >
                    {(Object.keys(CATEGORY_META) as InfraCategory[]).map((c) => (
                      <option key={c} value={c}>{CATEGORY_META[c].label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={LABEL}>Layer</label>
                  <select
                    value={selected.layer}
                    onChange={(e) => {
                      const layer = e.target.value as InfraComponent['layer']
                      const patch: Partial<InfraComponent> = { layer }
                      if (layer === 'rack' && selected.rackU === undefined) {
                        patch.rackU = 1
                        patch.rackH = 2
                        patch.x = undefined
                        patch.y = undefined
                        patch.w = undefined
                        patch.h = undefined
                        patch.shape = undefined
                      }
                      if (layer !== 'rack' && selected.x === undefined) {
                        patch.x = 640
                        patch.y = 460
                        patch.w = 180
                        patch.h = 56
                        patch.shape = 'chip'
                        patch.rackU = undefined
                        patch.rackH = undefined
                      }
                      updateNode(selected.id, patch)
                    }}
                    style={INPUT}
                  >
                    {(['edge', 'cloud', 'rack', 'vm', 'users', 'legacy'] as const).map((l) => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label style={LABEL}>Description</label>
                <textarea
                  value={selected.desc}
                  onChange={(e) => updateNode(selected.id, { desc: e.target.value.slice(0, 2000) })}
                  rows={3}
                  style={{ ...INPUT, resize: 'vertical' }}
                />
              </div>
              <div>
                <label style={LABEL}>Operator note</label>
                <textarea
                  value={selected.notes ?? ''}
                  onChange={(e) => updateNode(selected.id, { notes: e.target.value.slice(0, 2000) || undefined })}
                  rows={2}
                  placeholder="Runbook hint, owner, ticket ref…"
                  style={{ ...INPUT, resize: 'vertical', borderColor: `${pal.gold}55` }}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label style={LABEL}>Accent color</label>
                  <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      type="color"
                      aria-label="Node accent color"
                      value={selected.accent ?? '#35a7ff'}
                      onChange={(e) => updateNode(selected.id, { accent: e.target.value })}
                      style={{ width: 36, height: 28, padding: 0, border: `1px solid ${pal.border}`, borderRadius: 6, background: 'transparent', cursor: 'pointer' }}
                    />
                    <button
                      type="button"
                      onClick={() => updateNode(selected.id, { accent: undefined })}
                      disabled={!selected.accent}
                      title="Reset to category color"
                      style={{ ...BTN, padding: '6px 9px', opacity: selected.accent ? 1 : 0.45 }}
                    >
                      AUTO
                    </button>
                  </span>
                </div>
                <div>
                  <label style={LABEL}>Attention pulse</label>
                  <button
                    type="button"
                    onClick={() => updateNode(selected.id, { pulse: selected.pulse ? undefined : true })}
                    aria-pressed={selected.pulse === true}
                    title="Animated ring around this node (static for reduced-motion users)"
                    style={{
                      ...BTN,
                      width: '100%',
                      borderColor: selected.pulse ? pal.amber : pal.border,
                      color: selected.pulse ? pal.amber : pal.ink,
                    }}
                  >
                    {selected.pulse ? 'PULSE ON' : 'PULSE OFF'}
                  </button>
                </div>
              </div>
              <div>
                <label style={LABEL}>Workloads (comma separated)</label>
                <input
                  value={selected.workloads.join(', ')}
                  onChange={(e) =>
                    updateNode(selected.id, {
                      workloads: e.target.value.split(',').map((w) => w.trim()).filter(Boolean).slice(0, 12),
                    })
                  }
                  style={INPUT}
                />
              </div>
              {selected.layer === 'rack' ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <label style={LABEL}>Rack U</label>
                    <input
                      type="number" min={1} max={42}
                      value={selected.rackU ?? 1}
                      onChange={(e) => updateNode(selected.id, { rackU: Math.max(1, Math.min(42, Number(e.target.value) || 1)) })}
                      style={INPUT}
                    />
                  </div>
                  <div>
                    <label style={LABEL}>U height</label>
                    <input
                      type="number" min={1} max={8}
                      value={selected.rackH ?? 1}
                      onChange={(e) => updateNode(selected.id, { rackH: Math.max(1, Math.min(8, Number(e.target.value) || 1)) })}
                      style={INPUT}
                    />
                  </div>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {(['x', 'y', 'w', 'h'] as const).map((k) => (
                    <div key={k}>
                      <label style={LABEL}>{k.toUpperCase()}</label>
                      <input
                        type="number"
                        value={selected[k] ?? 0}
                        onChange={(e) => updateNode(selected.id, { [k]: Number(e.target.value) || 0 } as Partial<InfraComponent>)}
                        style={INPUT}
                      />
                    </div>
                  ))}
                </div>
              )}
              <div>
                <label style={LABEL}>Outgoing links</label>
                {doc.flows.filter((f) => f.from === selected.id).length === 0 && (
                  <div style={{ fontSize: 11, color: pal.muted, fontFamily: 'var(--font-mono)' }}>None yet — use CONNECT.</div>
                )}
                {doc.flows.filter((f) => f.from === selected.id).map((f) => (
                  <div key={f.id} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: pal.blue, fontFamily: 'var(--font-mono)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      → {depNameOf(f.to)}
                    </span>
                    <select
                      aria-label="Link category"
                      value={f.cat}
                      onChange={(e) => setLinkCat(f.id, e.target.value as InfraCategory)}
                      style={{ ...INPUT, width: 110 }}
                    >
                      {(Object.keys(CATEGORY_META) as InfraCategory[]).map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                    <button type="button" onClick={() => deleteLink(f.id)} style={BTN} aria-label={`Delete link to ${depNameOf(f.to)}`}>
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => setConnectFrom(connectFrom === selected.id ? null : selected.id)}
                  style={{ ...BTN, borderColor: connectFrom === selected.id ? pal.cyan : pal.border }}
                >
                  {connectFrom === selected.id ? 'CONNECTING…' : 'CONNECT'}
                </button>
                <button type="button" onClick={() => duplicateNode(selected.id)} style={BTN}>
                  DUPLICATE
                </button>
                <button
                  type="button"
                  onClick={() => toggleLock(selected.id)}
                  aria-pressed={lockedIds.has(selected.id)}
                  title={lockedIds.has(selected.id) ? 'Unlock (allow dragging)' : 'Lock (prevent dragging)'}
                  style={{
                    ...BTN,
                    borderColor: lockedIds.has(selected.id) ? pal.amber : pal.border,
                    color: lockedIds.has(selected.id) ? pal.amber : pal.ink,
                  }}
                >
                  {lockedIds.has(selected.id) ? '🔒 LOCKED' : 'LOCK'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`Delete "${selected.name}" and its links?`)) deleteNode(selected.id)
                  }}
                  style={{ ...BTN, borderColor: `${pal.red}55`, color: pal.red }}
                >
                  DELETE
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) void importDoc(f)
        }}
      />

      <style>{`
        @media (max-width: 1100px) {
          .hi-edit-layout { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )

  // ── helpers below close over state via docRef ────────────────
  function depNameOf(id: string) {
    return docRef.current.nodes.find((n) => n.id === id)?.name ?? id
  }
}
