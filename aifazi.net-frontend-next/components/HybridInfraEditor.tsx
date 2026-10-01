'use client'

/**
 * HybridInfraEditor — Odoo-style builder shell for infra diagrams.
 *
 * View mode reuses the HybridInfra viewer. Edit mode (admin only) adds:
 * palette (click-to-place), drag-to-move, click-to-connect links, per-item
 * properties + notes, undo/redo, save/publish/share, JSON import/export.
 * Server truth is enforced by require_admin; the UI gate is convenience.
 */
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { getRole } from '@/lib/api'
import { useInfraTone, infraPalette } from '@/lib/infraTheme'
import HybridInfra from './HybridInfra'
import { HybridInfraCanvas, type HybridInfraCanvasHandle } from './HybridInfraCanvas'
import { INFRA_LIBRARY, type LibraryItem } from '@/data/infra-library'
import { cloudInfraDoc, BUILTIN_STUDIES } from '@/data/cloud-infra'
import { TEMPLATE_SEEDS } from '@/data/infra-templates'
import {
  planADoc,
  sanitizeDoc,
  dependencyChainIn,
  CATEGORY_META,
  catLabel,
  mergedCatColors,
  type DiagramDoc,
  type BuiltinCategory,
  type InfraCategory,
  type InfraComponent,
  type InfraFlow,
} from '@/data/hybrid-infra'
import {
  listDiagrams,
  listAllDiagrams,
  getDiagram,
  createDiagram,
  updateDiagram,
  deleteDiagram,
  listRevisions,
  getRevision,
  restoreRevision,
  type DiagramMeta,
  type InfraRevisionMeta,
} from '@/lib/infraApi'
import { registerDirtyCheck } from '@/lib/infraLeaveGuard'
import { diffDiagramDocs, type DiagramDiff } from '@/lib/infraDocOps'
import {
  arrangeNodesDoc,
  alignNodesDoc,
  spreadNodesDoc,
  deleteNodesDoc,
  duplicateNodesDoc,
  pasteNodesDoc,
  remapCategoryDoc,
  type NextId,
} from '@/lib/infraDocOps'

/* PANEL/BTN/INPUT/LABEL live inside the component now (theme-aware). */

/** Built-in read-only seeds (edits save as a copy). */
const BUILTIN_DOCS: Record<string, () => DiagramDoc> = {
  'plan-a': planADoc,
  'cloud-infra': cloudInfraDoc,
  ...TEMPLATE_SEEDS,
}

/* ── Draft persistence helpers (module-level: stable identity for effects) ──
 * One localStorage key per diagram (N6) so autosaves never clobber each
 * other, with restore offers scoped to the doc being edited. */
const draftKeyFor = (slug: string) => `hi-editor-draft:${slug}`
const writeDraft = (d: DiagramDoc) => {
  try {
    localStorage.setItem(draftKeyFor(d.slug), JSON.stringify({ doc: d, at: new Date().toISOString() }))
  } catch {
    /* quota / private mode */
  }
}
const clearDraft = (slug: string) => {
  try {
    localStorage.removeItem(draftKeyFor(slug))
  } catch {
    /* noop */
  }
}
const readDraft = (slug: string): { doc: DiagramDoc; at: string } | null => {
  try {
    const raw = localStorage.getItem(draftKeyFor(slug))
    if (!raw) return null
    const parsed = JSON.parse(raw) as { doc?: unknown; at?: string }
    const clean = parsed.doc ? sanitizeDoc(parsed.doc) : null
    if (!clean || !parsed.at || clean.slug !== slug) return null
    return { doc: clean, at: parsed.at }
  } catch {
    return null
  }
}

/** Best user-facing message for an API failure: axios rejections keep the
 * FastAPI `detail` (409 conflict text from save/publish), everything else
 * falls back to Error.message or the supplied generic wording. */
const apiErrMsg = (e: unknown, fallback: string): string => {
  const resp = (e as { response?: { status?: number; data?: { detail?: unknown } } })?.response
  const detail = resp?.data?.detail
  if (resp?.status && typeof detail === 'string' && detail) return detail
  return e instanceof Error && e.message ? e.message : fallback
}

function slugify(s: string) {
  return (
    s.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) ||
    `diagram-${Date.now().toString(36)}`
  )
}

function fmtRevTime(iso: string | null): string {
  if (!iso) return 'unknown time'
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

export default function HybridInfraEditor({ startEditing = false }: { startEditing?: boolean }) {
  const [doc, setDoc] = useState<DiagramDoc>(() => planADoc())
  const [docId, setDocId] = useState<string | null>(null)
  const [isSeed, setIsSeed] = useState(true)
  const [diagrams, setDiagrams] = useState<DiagramMeta[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // Multi-selection (shift-click); always includes selectedId when non-empty.
  const [selIds, setSelIds] = useState<Set<string>>(new Set())
  const [connectFrom, setConnectFrom] = useState<string | null>(null)
  const [editMode, setEditMode] = useState(false)
  const editRootRef = useRef<HTMLDivElement>(null)
  const [editFs, setEditFs] = useState(false)
  const [zoomPct, setZoomPct] = useState(100)
  const [quickOpen, setQuickOpen] = useState(false)
  const [quickQuery, setQuickQuery] = useState('')
  const [quickIdx, setQuickIdx] = useState(0)
  const [helpOpen, setHelpOpen] = useState(false)
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
  // Background grid overlay (editor-local view preference).
  const [showGrid, setShowGrid] = useState(true)
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

  /**
   * Drop editor-local selection/lock/link state. Must run on every doc
   * switch — ids from doc A (locks in particular) must never leak into doc B.
   * Callers set the new selection afterwards when they have one.
   */
  const resetTransient = () => {
    setSelIds(new Set())
    setLockedIds(new Set())
    setConnectFrom(null)
    setSelectedId(null)
  }

  const docRef = useRef(doc)
  const histRef = useRef<{ past: string[]; future: string[] }>({ past: [], future: [] })
  const dragRef = useRef(false)
  const focusPushed = useRef(false)
  const savedRef = useRef<string | null>(null)
  // True once the user has actually edited since the last clean point
  // (load/switch/save). Combined with the savedRef diff this is the
  // leave-guard predicate: pristine docs never trigger a discard prompt.
  const dirtyRef = useRef(false)
  // Which diagram list endpoint the current state reflects (public vs admin).
  const listModeRef = useRef<'public' | 'admin'>(isAdmin ? 'admin' : 'public')
  // Hard guard against concurrent save/publish round-trips.
  const inFlightRef = useRef(false)
  // Monotonic load token: rapid picker changes must not let a stale response
  // win (F8).
  const loadSeqRef = useRef(0)
  const isAdminRef = useRef(isAdmin)
  const counterRef = useRef(0)
  const fileRef = useRef<HTMLInputElement>(null)
  const canvasHandle = useRef<HybridInfraCanvasHandle>(null)
  // Share panel (B2): public + embed URLs, computed on first open.
  const [shareOpen, setShareOpen] = useState(false)
  const [shareUrls, setShareUrls] = useState<{ page: string; embed: string; snippet: string } | null>(null)
  // History panel (B4): revision list + inspected diff.
  const [histOpen, setHistOpen] = useState(false)
  const [revList, setRevList] = useState<InfraRevisionMeta[] | null>(null)
  const [revLoading, setRevLoading] = useState(false)
  const [viewRev, setViewRev] = useState<{ meta: InfraRevisionMeta; diff: DiagramDiff } | null>(null)

  useEffect(() => {
    docRef.current = doc
  })

  useEffect(() => {
    isAdminRef.current = isAdmin
  }, [isAdmin])

  const isUnsaved = () =>
    dirtyRef.current && savedRef.current !== JSON.stringify(docRef.current)

  const confirmDiscard = () => !isUnsaved() || window.confirm('Discard unsaved changes?')

  // ── Leave guard (F1): warn on reload/tab-close with unsaved edits ──
  useEffect(() => {
    const flush = () => {
      if (dirtyRef.current && savedRef.current !== JSON.stringify(docRef.current)) {
        writeDraft(docRef.current)
      }
    }
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!(dirtyRef.current && savedRef.current !== JSON.stringify(docRef.current))) return
      // Persist the tail synchronously so the reload can still recover it.
      flush()
      e.preventDefault()
      // Legacy Chrome requires returnValue to be set to show the prompt.
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      flush() // route change without beforeunload
    }
  }, [])

  // Register the dirty predicate for in-app navigation (library rows).
  useEffect(() => registerDirtyCheck(isUnsaved), [])

  // ── Floating "Edit Site" button (page-level FAB) ──────────────
  useEffect(() => {
    const open = () => {
      // UI-only gate (the server enforces writes) — but don't even show the
      // editor shell to non-admins dispatching the event (F18).
      if (!isAdmin) return
      setEditMode(true)
      try {
        document.getElementById('hybrid-infra-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      } catch {
        /* noop */
      }
    }
    window.addEventListener('infra:edit', open)
    return () => window.removeEventListener('infra:edit', open)
  }, [isAdmin])

  // ── Load: diagram list + ?diagram=<slug> ─────────────────────
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const list = await (isAdminRef.current ? listAllDiagrams() : listDiagrams())
        if (alive) setDiagrams(list)
        if (alive && isAdminRef.current) listModeRef.current = 'admin'
      } catch {
        /* offline — seed still renders */
      }
      let slug: string | null = null
      try {
        slug = new URLSearchParams(window.location.search).get('diagram')
      } catch {
        /* noop */
      }
      if (slug && Object.hasOwn(BUILTIN_DOCS, slug)) {
        const seed = BUILTIN_DOCS[slug]()
        if (alive) {
          docRef.current = seed
          setDoc(seed)
          setDocId(null)
          setIsSeed(true)
          savedRef.current = null
          dirtyRef.current = false
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
              dirtyRef.current = false
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
        dirtyRef.current = false
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

  // Entered via the EDIT SITE FAB from the list view: open edit mode once
  // the admin role resolves (the FAB itself is admin-gated).
  const autoEditUsedRef = useRef(false)
  useEffect(() => {
    if (!startEditing || !isAdmin || autoEditUsedRef.current) return
    autoEditUsedRef.current = true
    setEditMode(true)
  }, [startEditing, isAdmin])

  // Fullscreen editing: the whole edit shell (bar + library + canvas +
  // properties) goes through the browser Fullscreen API, like the viewer.
  useEffect(() => {
    const sync = () => setEditFs(document.fullscreenElement === editRootRef.current)
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [])
  const toggleEditFullscreen = () => {
    try {
      if (document.fullscreenElement === editRootRef.current) void document.exitFullscreen()
      else void editRootRef.current?.requestFullscreen()
    } catch {
      /* fullscreen unsupported/denied */
    }
  }

  // When the admin role appears mid-session, upgrade the diagram list so
  // drafts (and the slug-collision set) become visible (F5).
  useEffect(() => {
    if (!isAdmin || listModeRef.current === 'admin') return
    listModeRef.current = 'admin'
    let alive = true
    listAllDiagrams()
      .then((list) => { if (alive) setDiagrams(list) })
      .catch(() => { /* keep the public list */ })
    return () => { alive = false }
  }, [isAdmin])

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
    dirtyRef.current = true
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
    const cur = docRef.current
    const node = cur.nodes.find((n) => n.id === id)
    // Checkpoint only when the move actually changes the doc: sub-threshold
    // jitter and no-op finalizations must not push dead undo entries (F4).
    const nextX = pos.x === undefined ? undefined : Math.max(-200, Math.min(1480, Math.round(pos.x)))
    const nextY = pos.y === undefined ? undefined : Math.max(-100, Math.min(1020, Math.round(pos.y)))
    const nextU = pos.rackU === undefined ? undefined : Math.max(1, Math.min(42, pos.rackU))
    const moves =
      !!node &&
      ((nextX !== undefined && nextX !== node.x) ||
        (nextY !== undefined && nextY !== node.y) ||
        (nextU !== undefined && nextU !== node.rackU))
    if (moves && !dragRef.current) {
      pushHistory()
      dragRef.current = true
    }
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
    if (done) {
      // Group finalize calls us once per member in the same task; defer the
      // reset so only the gesture's first checkpoint counts (F4).
      queueMicrotask(() => {
        dragRef.current = false
      })
    }
  }

  const boxesOverlap = (a: { x: number; y: number; w: number; h: number }, b: typeof a) =>
    a.x < b.x + b.w + 20 && a.x + a.w + 20 > b.x && a.y < b.y + b.h + 20 && a.y + a.h + 20 > b.y

  // Resize-handle drag: same checkpoint discipline as handleMoveNode (F4) —
  // history only when the box actually changes, one reset per gesture.
  const handleResizeNode = (
    id: string,
    box: { x: number; y: number; w: number; h: number },
    done: boolean,
  ) => {
    if (lockedIds.has(id)) return
    const cur = docRef.current
    const node = cur.nodes.find((n) => n.id === id)
    const nextX = Math.max(-200, Math.min(1480, Math.round(box.x)))
    const nextY = Math.max(-100, Math.min(1020, Math.round(box.y)))
    const nextW = Math.max(60, Math.min(1600, Math.round(box.w)))
    const nextH = Math.max(36, Math.min(900, Math.round(box.h)))
    const changed =
      !!node &&
      (nextX !== node.x || nextY !== node.y || nextW !== node.w || nextH !== node.h)
    if (changed && !dragRef.current) {
      pushHistory()
      dragRef.current = true
    }
    if (changed) {
      applyDoc(
        {
          ...cur,
          nodes: cur.nodes.map((n) =>
            n.id === id ? { ...n, x: nextX, y: nextY, w: nextW, h: nextH } : n,
          ),
        },
        false,
      )
    }
    if (done) {
      queueMicrotask(() => {
        dragRef.current = false
      })
    }
  }

  // ── Auto-arrange: grid columns per layer, rows stacked (Odoo-style) ──
  const arrangeNodes = () => {
    applyDoc(arrangeNodesDoc(docRef.current))
    setNotice({ msg: 'Auto-arranged by layer (undo available)', ok: true })
  }

  const cycleSnap = () => {
    setSnapSize((s) => (s === 10 ? 20 : s === 20 ? null : 10))
  }

  // ── Category palette (doc-level color overrides) ──────────────
  const setCatColor = (cat: string, color: string) => {
    const cur = docRef.current
    applyDoc({
      ...cur,
      categoryColors: { ...(cur.categoryColors ?? {}), [cat]: color },
    })
  }
  const resetCatColors = () => {
    const cur = docRef.current
    if (!cur.categoryColors) return
    const { categoryColors: _dropped, ...rest } = cur
    applyDoc(rest)
    setNotice({ msg: 'Palette reset to defaults (undo available)', ok: true })
  }
  // Effective category color (doc override → custom → canonical meta → fallback).
  const catColorHex = (cat: string) =>
    doc.categoryColors?.[cat] ??
    doc.customCategories?.[cat]?.color ??
    (CATEGORY_META as Record<string, { label: string; color: string } | undefined>)[cat]?.color ??
    '#35a7ff'

  // ── Palette filter (library search) ─────────────────────────
  const [libQuery, setLibQuery] = useState('')
  const libFiltered = useMemo(() => {
    const q = libQuery.trim().toLowerCase()
    if (!q) return INFRA_LIBRARY
    return INFRA_LIBRARY.map((g) => ({
      ...g,
      items: g.items.filter(
        (it) =>
          it.name.toLowerCase().includes(q) ||
          it.role.toLowerCase().includes(q) ||
          it.desc.toLowerCase().includes(q) ||
          it.category.toLowerCase().includes(q),
      ),
    })).filter((g) => g.items.length > 0)
  }, [libQuery])

  // ── Draft autosave (localStorage, one key per diagram) ────────
  const [draftOffer, setDraftOffer] = useState<{ doc: DiagramDoc; at: string } | null>(null)
  useEffect(() => {
    if (!editMode || !isAdmin) return
    const found = readDraft(docRef.current.slug)
    if (!found) return
    // An offer identical to what's already on screen (flushed on DONE,
    // nothing changed since) is noise — skip it.
    if (JSON.stringify(found.doc) === JSON.stringify(docRef.current)) return
    setDraftOffer(found)
  }, [editMode, isAdmin])
  useEffect(() => {
    if (!editMode || !isAdmin) return
    const t = window.setTimeout(() => {
      if (savedRef.current !== JSON.stringify(docRef.current)) writeDraft(docRef.current)
    }, 1200)
    return () => window.clearTimeout(t)
  }, [doc, editMode, isAdmin])
  // Flush the debounced tail when edit mode ends: the 1200 ms timer would
  // otherwise drop the last seconds of edits before DONE (F9).
  useEffect(() => {
    if (editMode) return
    if (dirtyRef.current && savedRef.current !== JSON.stringify(docRef.current)) {
      writeDraft(docRef.current)
    }
  }, [editMode])
  const acceptDraft = () => {
    if (!draftOffer) return
    if (isUnsaved() && !window.confirm('Discard current unsaved changes and restore the draft?')) return
    histRef.current = { past: [], future: [] }
    syncHistButtons()
    docRef.current = draftOffer.doc
    setDoc(draftOffer.doc)
    setDocId(null)
    setIsSeed(false)
    resetTransient()
    setSelectedId(draftOffer.doc.nodes[0]?.id ?? null)
    savedRef.current = null
    // The draft copy is still in localStorage, so leaving right now is safe;
    // any further edit marks the doc dirty again via pushHistory.
    dirtyRef.current = false
    setDraftOffer(null)
    setNotice({ msg: 'Draft restored — save to keep it', ok: true })
  }
  const discardDraft = () => {
    if (draftOffer) clearDraft(draftOffer.doc.slug)
    setDraftOffer(null)
    setNotice({ msg: 'Draft discarded', ok: true })
  }

  // ── Custom categories (doc-defined beyond the built-ins) ─────
  const [newCatLabel, setNewCatLabel] = useState('')
  const [newCatColor, setNewCatColor] = useState('#ff8a3d')
  const catSlug = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32)
  const addCustomCat = () => {
    const label = newCatLabel.trim()
    if (!label) return
    const cur = docRef.current
    const key = catSlug(label) || `cat-${Date.now()}`
    if (Object.hasOwn(CATEGORY_META, key) || Object.hasOwn(cur.customCategories ?? {}, key)) {
      setNotice({ msg: 'Category id already exists', ok: false })
      return
    }
    if (Object.keys(cur.customCategories ?? {}).length >= 16) {
      setNotice({ msg: 'Custom category limit reached (16)', ok: false })
      return
    }
    applyDoc({
      ...cur,
      customCategories: {
        ...(cur.customCategories ?? {}),
        [key]: { label: label.slice(0, 24), color: newCatColor },
      },
    })
    setNewCatLabel('')
    setNotice({ msg: `Added category "${label.slice(0, 24)}"`, ok: true })
  }
  const setCustomCat = (key: string, patch: { label?: string; color?: string }) => {
    const cur = docRef.current
    const cc = cur.customCategories ?? {}
    if (!cc[key]) return
    // Editing the category's own color supersedes any stale palette override.
    const pal2 = { ...(cur.categoryColors ?? {}) }
    if (patch.color) delete pal2[key]
    applyDoc({
      ...cur,
      categoryColors: Object.keys(pal2).length ? pal2 : undefined,
      customCategories: { ...cc, [key]: { ...cc[key], ...patch } },
    })
  }
  const removeCustomCat = (key: string) => {
    const cur = docRef.current
    const cc = { ...(cur.customCategories ?? {}) }
    delete cc[key]
    // Nodes/flows still using it fall back to Network so nothing dangles.
    applyDoc({
      ...remapCategoryDoc(cur, key, 'network'),
      customCategories: Object.keys(cc).length ? cc : undefined,
    })
    setNotice({ msg: 'Category removed (nodes reset to Network)', ok: true })
  }
  // Custom colors merged under doc palette overrides for canvas/reader chips.
  const mergedCat = () => mergedCatColors(doc)
  /** All selectable categories: built-ins first, then custom ids. */
  const allCategoryIds = (): string[] => [
    ...(Object.keys(CATEGORY_META) as BuiltinCategory[]),
    ...Object.keys(doc.customCategories ?? {}),
  ]

  // ── Align / distribute free nodes (rack layer excluded — rackU owned) ──
  // Operates on the multi-selection when 2+ selected, else all free nodes.
  const selectionForBulk = () => {
    const ids = selectedNodeIds()
    return ids.length >= 2 ? ids : null
  }
  const alignNodes = (axis: 'x' | 'y') => {
    const next = alignNodesDoc(docRef.current, selectionForBulk(), axis)
    if (!next) {
      setNotice({ msg: 'Select at least 2 free nodes to align', ok: false })
      return
    }
    applyDoc(next)
    setNotice({ msg: axis === 'x' ? 'Aligned left' : 'Aligned top', ok: true })
  }
  const spreadNodes = (axis: 'x' | 'y') => {
    const next = spreadNodesDoc(docRef.current, selectionForBulk(), axis)
    if (!next) {
      setNotice({ msg: 'Need at least 3 free nodes to distribute', ok: false })
      return
    }
    applyDoc(next)
    setNotice({ msg: axis === 'x' ? 'Distributed horizontally' : 'Distributed vertically', ok: true })
  }

  // ── Editor keyboard shortcuts (ignored while typing in inputs) ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Shortcuts are edit-mode-only: with a lingering selection after DONE
      // they would mutate the read-only viewer's doc (F6).
      if (!editMode) return
      // Overlays close first — before the typing guard, so Escape works
      // inside the quick-add input too.
      if (e.key === 'Escape' && (quickOpen || helpOpen)) {
        e.preventDefault()
        setQuickOpen(false)
        setHelpOpen(false)
        return
      }
      const el = e.target as HTMLElement | null
      const tag = (el?.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || el?.isContentEditable) return
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        if (quickOpen) {
          setQuickOpen(false)
        } else {
          openQuickAdd()
        }
      } else if (e.key === '?') {
        e.preventDefault()
        setHelpOpen((h) => !h)
      } else if (e.key === '/' && !mod) {
        e.preventDefault()
        openQuickAdd()
      } else if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if ((mod && e.key.toLowerCase() === 'y') || (mod && e.shiftKey && e.key.toLowerCase() === 'z')) {
        e.preventDefault()
        redo()
      } else if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        const ids = docRef.current.nodes.map((n) => n.id)
        selectOnly(ids)
        setNotice({ msg: `Selected ${ids.length} node(s)`, ok: true })
      } else if (mod && e.key.toLowerCase() === 'c' && selectedNodeIds().length) {
        e.preventDefault()
        copySelected()
      } else if (mod && e.key.toLowerCase() === 'v') {
        e.preventDefault()
        pasteClipboard()
      } else if (mod && e.key.toLowerCase() === 'd' && selectedNodeIds().length) {
        e.preventDefault()
        duplicateSelected()
      } else if (e.key === 'Escape' && connectFrom) {
        e.preventDefault()
        setConnectFrom(null)
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && connectFrom) {
        // In link mode Delete/Backspace cancels the link, never deletes nodes.
        e.preventDefault()
        setConnectFrom(null)
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNodeIds().length) {
        e.preventDefault()
        const ids = selectedNodeIds()
        const msg = ids.length > 1
          ? `Delete ${ids.length} selected nodes and their links?`
          : 'Delete the selected node and its links?'
        if (window.confirm(msg)) deleteNodes(ids)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editMode, selectedId, selIds, connectFrom, quickOpen, helpOpen])

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

  // Palette drop on the canvas: place the node centered at the drop point
  // (grid-snapped). Rack-layer items keep their U-slot auto-placement.
  const handleDropItem = (key: string, dx: number, dy: number) => {
    const item = INFRA_LIBRARY.flatMap((g) => g.items).find((i) => i.key === key)
    if (!item) return
    if (item.layer === 'rack') {
      addNode(item)
      return
    }
    const cur = docRef.current
    const snapV = (v: number) => (snapSize ? Math.round(v / snapSize) * snapSize : Math.round(v))
    const x = Math.max(-200, Math.min(1480, snapV(dx - item.defaultW / 2)))
    const y = Math.max(-100, Math.min(1020, snapV(dy - item.defaultH / 2)))
    counterRef.current += 1
    const node: InfraComponent = {
      ...stampBase(item),
      id: `${item.key.replace(/^tpl-/, '')}-${Date.now().toString(36)}${counterRef.current}`,
      x,
      y,
    }
    applyDoc({ ...cur, nodes: [...cur.nodes, node] })
    setSelectedId(node.id)
    setNotice({ msg: `Placed ${item.name} at the drop point`, ok: true })
  }

  const deleteNodes = (ids: string[]) => {
    const next = deleteNodesDoc(docRef.current, ids)
    if (!next) return
    applyDoc(next)
    const set = new Set(ids)
    if (selectedId && set.has(selectedId)) setSelectedId(null)
    setSelIds((prev) => new Set([...prev].filter((id) => !set.has(id))))
    if (connectFrom && set.has(connectFrom)) setConnectFrom(null)
  }

  const deleteNode = (id: string) => deleteNodes([id])

  const selectOnly = (ids: string[]) => {
    setSelIds(new Set(ids))
    setSelectedId(ids.length ? ids[ids.length - 1] : null)
  }

  /** Unique id fragment for duplicated/pasted nodes and flows. */
  const freshId: NextId = (seed: string) => {
    // Counter is in-memory only — after a reload it restarts at 0, so probe
    // the live doc for collisions. Nodes compose `<id>-<frag>` and flows
    // compose `<from><to>-<frag>` (seed carries a ':'), so check both shapes.
    const taken = new Set<string>()
    for (const n of docRef.current.nodes) taken.add(n.id)
    for (const f of docRef.current.flows) taken.add(f.id)
    let n = counterRef.current
    for (;;) {
      n += 1
      const frag = `c${n}`
      if (!taken.has(`${seed}-${frag}`) && !taken.has(`${seed.replace(/:/g, '')}-${frag}`)) {
        counterRef.current = n
        return frag
      }
    }
  }

  const duplicateSelected = () => {
    const ids = selectedNodeIds()
    if (!ids.length) {
      setNotice({ msg: 'Nothing selected to duplicate', ok: false })
      return
    }
    const res = duplicateNodesDoc(docRef.current, ids, freshId)
    if (!res) return
    applyDoc(res.doc)
    selectOnly(res.newIds)
    setNotice({ msg: `Duplicated ${res.newIds.length} node(s)`, ok: true })
  }

  const duplicateNode = (id: string) => {
    const ids = selectedNodeIds()
    const targets = ids.includes(id) && ids.length > 1 ? ids : [id]
    const res = duplicateNodesDoc(docRef.current, targets, freshId)
    if (!res) return
    applyDoc(res.doc)
    selectOnly(res.newIds)
  }

  // ── Clipboard (Ctrl+C / Ctrl+V / Ctrl+D) ─────────────────────
  const clipRef = useRef<InfraComponent[] | null>(null)
  const pasteSeqRef = useRef(0)

  const copySelected = () => {
    const cur = docRef.current
    const ids = new Set(selectedNodeIds())
    const nodes = cur.nodes.filter((n) => ids.has(n.id))
    if (!nodes.length) {
      setNotice({ msg: 'Nothing selected to copy', ok: false })
      return
    }
    clipRef.current = nodes.map((n) => ({
      ...n,
      workloads: [...n.workloads],
      deps: [...n.deps],
    }))
    pasteSeqRef.current = 0
    setNotice({ msg: `Copied ${nodes.length} node(s)`, ok: true })
  }

  const pasteClipboard = () => {
    const clip = clipRef.current
    if (!clip?.length) {
      setNotice({ msg: 'Clipboard is empty', ok: false })
      return
    }
    const off = 24 * (pasteSeqRef.current + 1)
    const res = pasteNodesDoc(docRef.current, clip, freshId, off)
    if (!res) return
    pasteSeqRef.current += 1
    applyDoc(res.doc)
    selectOnly(res.newIds)
    setNotice({ msg: `Pasted ${res.newIds.length} node(s)`, ok: true })
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

  // Per-flow styling: label, dashed, color.
  const setLinkStyle = (id: string, patch: Partial<InfraFlow>) => {
    const cur = docRef.current
    applyDoc({
      ...cur,
      flows: cur.flows.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    })
  }

  // ── Select wrapper (connect-mode aware) ──────────────────────
  const handleSelect = (id: string | null) => {
    if (connectFrom) {
      if (id === null || id === connectFrom) setConnectFrom(null)
      return
    }
    // Grouped node: expand the selection to every member so the next
    // drag moves the whole group (canvas group-drag needs membership).
    if (id) {
      const node = docRef.current.nodes.find((n) => n.id === id)
      if (node?.gid) {
        const members = docRef.current.nodes.filter((n) => n.gid === node.gid)
        if (members.length > 1) {
          setSelectedId(id)
          setSelIds(new Set(members.map((n) => n.id)))
          return
        }
      }
    }
    setSelectedId(id)
    setSelIds(id ? new Set([id]) : new Set())
  }

  const handleToggleSelect = (id: string) => {
    // Compute the next set from current state (no impure setState inside an
    // updater — React may invoke updaters more than once).
    const next = new Set(selIds)
    let nextSelected = selectedId
    if (next.has(id)) {
      next.delete(id)
      if (selectedId === id) {
        const rest = [...next]
        nextSelected = rest.length ? rest[rest.length - 1] : null
      }
    } else {
      next.add(id)
      nextSelected = id
    }
    setSelIds(next)
    if (nextSelected !== selectedId) setSelectedId(nextSelected)
  }

  // Rubber-band marquee finished: replace the selection wholesale (the
  // primary id is the last intersecting node so properties target it).
  const handleMarqueeSelect = (ids: string[]) => {
    if (connectFrom) return
    setSelIds(new Set(ids))
    const last = ids.length ? ids[ids.length - 1] : null
    if (last !== selectedId) setSelectedId(last)
  }

  // ── Z-order: node array order drives stacking within each draw
  // class — push the selection to the ends of the array. ─────────
  const zOrder = (toFront: boolean) => {
    const ids = new Set(selectedNodeIds())
    const cur = docRef.current
    const sel = cur.nodes.filter((n) => ids.has(n.id))
    if (!sel.length || sel.length === cur.nodes.length) return
    const rest = cur.nodes.filter((n) => !ids.has(n.id))
    applyDoc({ ...cur, nodes: toFront ? [...rest, ...sel] : [...sel, ...rest] })
    setNotice({ msg: toFront ? 'Brought selection to front' : 'Sent selection to back', ok: true })
  }

  // ── Groups: persistent multi-select — clicking any member selects
  // the whole group (see handleSelect). ──────────────────────────
  const groupSelection = () => {
    const ids = selectedNodeIds()
    if (ids.length < 2) return
    counterRef.current += 1
    const gid = `g-${Date.now().toString(36)}-${counterRef.current}`
    const cur = docRef.current
    const idSet = new Set(ids)
    applyDoc({ ...cur, nodes: cur.nodes.map((n) => (idSet.has(n.id) ? { ...n, gid } : n)) })
    setNotice({ msg: `Grouped ${ids.length} nodes — clicking one selects all`, ok: true })
  }
  const ungroupSelection = () => {
    const idSet = new Set(selectedNodeIds())
    const cur = docRef.current
    if (!cur.nodes.some((n) => n.gid && idSet.has(n.id))) return
    applyDoc({
      ...cur,
      nodes: cur.nodes.map((n) => (n.gid && idSet.has(n.id) ? { ...n, gid: undefined } : n)),
    })
    setNotice({ msg: 'Ungrouped', ok: true })
  }

  const selectedNodeIds = (): string[] => {
    const ids = selIds.size ? [...selIds] : selectedId ? [selectedId] : []
    return ids.filter((id) => docRef.current.nodes.some((n) => n.id === id))
  }
  // Any selected node already in a group? (drives GROUP/UNGROUP button)
  const selectionHasGid = selectedNodeIds().some((id) =>
    docRef.current.nodes.find((n) => n.id === id)?.gid,
  )

  // ── Quick add (Ctrl+K / "/"): place the match at the current view
  // center — no hunting through the palette. ────────────────────
  const quickItems = (() => {
    const all = INFRA_LIBRARY.flatMap((g) => g.items)
    const q = quickQuery.trim().toLowerCase()
    if (!q) return all.slice(0, 8)
    return all
      .filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          i.category.toLowerCase().includes(q) ||
          i.role.toLowerCase().includes(q),
      )
      .slice(0, 8)
  })()
  const placeQuick = (item: LibraryItem) => {
    const v = canvasHandle.current?.getView()
    setQuickOpen(false)
    setQuickQuery('')
    setQuickIdx(0)
    handleDropItem(item.key, v?.cx ?? 640, v?.cy ?? 460)
  }
  const openQuickAdd = () => {
    setQuickQuery('')
    setQuickIdx(0)
    setQuickOpen(true)
    setHelpOpen(false)
  }

  // ── Persistence ──────────────────────────────────────────────
  const refreshList = async () => {
    try {
      setDiagrams(await (isAdminRef.current ? listAllDiagrams() : listDiagrams()))
    } catch {
      try {
        setDiagrams(await listDiagrams())
      } catch {
        /* offline */
      }
    }
  }

  const save = async () => {
    const cur = docRef.current
    if (!cur.nodes.length) {
      setNotice({ msg: 'Add at least one node before saving', ok: false })
      return
    }
    if (inFlightRef.current) return
    inFlightRef.current = true
    setSaving(true)
    setNotice(null)
    // Snapshot of what we are about to send: after the round-trip we only
    // adopt the server echo when the local doc is byte-identical, so edits
    // made while the request was in flight are never reverted (F2).
    const outgoing = JSON.stringify(docRef.current)
    let snapFailed = false
    try {
      if (isSeed || !docId) {
        // "Save as new": derive a storable, unique slug. Builtin seed slugs
        // can never win in the loader (?diagram= prefers the builtin), so a
        // DB row with one would be unreachable — exclude them here and let
        // the backend reserve them too.
        const taken = new Set(diagrams.map((d) => d.slug))
        const base =
          cur.slug && !Object.hasOwn(BUILTIN_DOCS, cur.slug) && !taken.has(cur.slug)
            ? cur.slug
            : slugify(cur.title || 'diagram')
        let slug = base
        let n = 2
        while (taken.has(slug) || Object.hasOwn(BUILTIN_DOCS, slug)) {
          slug = `${base}-${n}`
          n += 1
        }
        const created = await createDiagram({
          ...cur,
          slug,
          updatedAt: new Date().toISOString(),
        })
        const clean = sanitizeDoc(created)
        if (!clean) throw new Error('Server returned an invalid doc')
        setDocId(clean.id)
        setIsSeed(false)
        adoptResponse(clean, outgoing)
        try {
          const url = new URL(window.location.href)
          url.searchParams.set('diagram', clean.slug)
          window.history.replaceState(null, '', url.toString())
        } catch {
          /* noop */
        }
      } else {
        // Send the doc as-is: updateDiagram carries doc.updatedAt (the last
        // server stamp) as expectedUpdatedAt, so the backend 409s us instead
        // of clobbering a concurrent edit (B8/N5).
        const res = await updateDiagram(cur)
        snapFailed = res.snapshotFailed === true
        const clean = sanitizeDoc(res.diagram)
        if (!clean) throw new Error('Server returned an invalid doc')
        adoptResponse(clean, outgoing)
      }
      await refreshList()
      setNotice({
        msg: snapFailed ? 'Saved (revision history unavailable)' : 'Saved',
        ok: true,
      })
    } catch (e) {
      setNotice({ msg: apiErrMsg(e, 'Save failed'), ok: false })
    } finally {
      inFlightRef.current = false
      setSaving(false)
    }
  }

  /**
   * Adopt a server response without clobbering in-flight edits: if the local
   * doc changed while the request was out, keep the local content (the user's
   * newest intent), graft the server identity onto it, and stay dirty.
   */
  const adoptResponse = (server: DiagramDoc, outgoing: string) => {
    savedRef.current = JSON.stringify(server)
    if (JSON.stringify(docRef.current) === outgoing) {
      const prevSlug = docRef.current.slug
      docRef.current = server
      setDoc(server)
      dirtyRef.current = false
      // Persisted — the local recovery copies are no longer needed (F9).
      clearDraft(prevSlug)
      clearDraft(server.slug)
      return
    }
    const merged: DiagramDoc = {
      ...docRef.current,
      id: server.id,
      slug: server.slug,
      updatedAt: server.updatedAt,
    }
    docRef.current = merged
    setDoc(merged)
  }

  const togglePublish = async () => {
    if (isSeed || !docId) {
      setNotice({ msg: 'Save the diagram first, then publish', ok: false })
      return
    }
    if (inFlightRef.current) return
    inFlightRef.current = true
    setSaving(true)
    const cur = { ...docRef.current, published: !docRef.current.published }
    applyDoc(cur, false)
    dirtyRef.current = true
    const outgoing = JSON.stringify(docRef.current)
    try {
      const res = await updateDiagram(cur)
      const clean = sanitizeDoc(res.diagram)
      if (!clean) throw new Error('Server returned an invalid doc')
      adoptResponse(clean, outgoing)
      await refreshList()
      const verb = clean.published ? 'Published' : 'Unpublished'
      setNotice({
        msg: res.snapshotFailed ? `${verb} (revision history unavailable)` : verb,
        ok: true,
      })
    } catch (e) {
      // Roll the optimistic flag back so the button can't lie (F4/N4).
      const reverted = { ...docRef.current, published: !cur.published }
      docRef.current = reverted
      setDoc(reverted)
      if (savedRef.current === JSON.stringify(reverted)) dirtyRef.current = false
      setNotice({ msg: apiErrMsg(e, 'Publish failed'), ok: false })
    } finally {
      inFlightRef.current = false
      setSaving(false)
    }
  }

  const newDoc = () => {
    if (!confirmDiscard()) return
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
    resetTransient()
    savedRef.current = null
    // The new doc exists only in memory — leaving without saving loses it.
    dirtyRef.current = true
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
    resetTransient()
    savedRef.current = null
    // In-memory only until saved — leaving without saving loses the copy.
    dirtyRef.current = true
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
      resetTransient()
      savedRef.current = null
      dirtyRef.current = false
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
    if (!confirmDiscard()) return
    const seq = ++loadSeqRef.current
    if (Object.hasOwn(BUILTIN_DOCS, slug)) {
      const seed = BUILTIN_DOCS[slug]()
      docRef.current = seed
      setDoc(seed)
      setDocId(null)
      setIsSeed(true)
      resetTransient()
      setSelectedId(seed.nodes[0]?.id ?? null)
      savedRef.current = null
      dirtyRef.current = false
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
      if (seq !== loadSeqRef.current) return // a newer switch won the race
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
      resetTransient()
      setSelectedId(clean.nodes[0]?.id ?? null)
      savedRef.current = JSON.stringify(clean)
      dirtyRef.current = false
      histRef.current = { past: [], future: [] }
      syncHistButtons()
    } catch (e) {
      setNotice({ msg: e instanceof Error ? e.message : 'Load failed', ok: false })
    }
  }

  const copyText = async (text: string, okMsg: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setNotice({ msg: okMsg, ok: true })
    } catch {
      setNotice({ msg: text, ok: true })
    }
  }

  const toggleShare = () => {
    if (!shareOpen) {
      const cur = docRef.current
      const slug = cur.slug || 'plan-a'
      const origin = typeof window !== 'undefined' ? window.location.origin : ''
      const page = `${origin}/hybrid-infra?diagram=${encodeURIComponent(slug)}`
      const embed = `${origin}/hybrid-infra/embed?diagram=${encodeURIComponent(slug)}`
      const safeTitle = cur.title.replace(/"/g, '&quot;')
      setShareUrls({
        page,
        embed,
        snippet: `<iframe src="${embed}" width="100%" height="720" style="border:0" loading="lazy" title="${safeTitle}"></iframe>`,
      })
    }
    setShareOpen((v) => !v)
    setHistOpen(false)
  }

  const toggleHistory = async () => {
    const next = !histOpen
    setHistOpen(next)
    setShareOpen(false)
    if (!next) return
    setViewRev(null)
    if (isSeed || !docId) return
    setRevLoading(true)
    try {
      setRevList(await listRevisions(docId))
    } catch {
      setNotice({ msg: 'Could not load history', ok: false })
    } finally {
      setRevLoading(false)
    }
  }

  const inspectRevision = async (meta: InfraRevisionMeta) => {
    if (!docId) return
    try {
      const rev = await getRevision(docId, meta.id)
      if (!rev) throw new Error('missing')
      const revDoc: DiagramDoc = {
        ...docRef.current,
        title: rev.title,
        published: rev.published,
        nodes: rev.nodes,
        flows: rev.flows,
        categoryColors: rev.categoryColors ?? undefined,
        customCategories: rev.customCategories ?? undefined,
      }
      setViewRev({ meta, diff: diffDiagramDocs(revDoc, docRef.current) })
    } catch {
      setNotice({ msg: 'Could not load revision', ok: false })
    }
  }

  const applyRevision = async (meta: InfraRevisionMeta) => {
    if (!docId) return
    if (!window.confirm(`Restore the state from ${fmtRevTime(meta.createdAt)}? The current state is snapshotted first.`)) {
      return
    }
    try {
      const restored = await restoreRevision(docId, meta.id)
      const clean = sanitizeDoc(restored)
      if (!clean) throw new Error('Restored document failed validation')
      docRef.current = clean
      setDoc(clean)
      setIsSeed(false)
      resetTransient()
      setSelectedId(clean.nodes[0]?.id ?? null)
      savedRef.current = JSON.stringify(clean)
      histRef.current = { past: [], future: [] }
      syncHistButtons()
      setRevList(await listRevisions(docId))
      setViewRev(null)
      setNotice({ msg: 'Revision restored', ok: true })
    } catch (e) {
      setNotice({ msg: e instanceof Error ? e.message : 'Restore failed', ok: false })
    }
  }

  const exportCanvas = (kind: 'png' | 'svg') => {
    try {
      if (kind === 'png') canvasHandle.current?.exportPng()
      else canvasHandle.current?.exportSvg()
      setNotice({ msg: `${kind.toUpperCase()} exported`, ok: true })
    } catch {
      setNotice({ msg: `${kind.toUpperCase()} export failed`, ok: false })
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
      resetTransient()
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
        {/* key= forces a remount per doc: re-validates ?node= against the
            new doc and re-applies per-diagram view memory (?z/?cx/?cy) —
            without it the island keeps the first doc's init state. */}
        <HybridInfra key={docId ?? doc.slug} doc={doc} viewKey={docId ?? doc.slug} />
      </div>
    )
  }

  return (
    <div id="hybrid-infra-editor" ref={editRootRef}>
      {/* Fullscreen editing: fill the display and let the grid stretch. */}
      <style>{`
        #hybrid-infra-editor:fullscreen { background: #071120; padding: 12px; overflow: auto; }
        #hybrid-infra-editor:fullscreen .hi-edit-layout { align-items: stretch; }
        #hybrid-infra-editor:fullscreen .hi-edit-layout > div { max-height: calc(100vh - 24px); }
      `}</style>
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
          {BUILTIN_STUDIES.map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.title} (built-in{isSeed && doc.slug === s.slug ? ' — editing a copy' : ''})
            </option>
          ))}
          {diagrams.map((m) => (
            <option key={m.id} value={m.slug}>
              {m.title} {!m.published ? '(draft)' : ''}
            </option>
          ))}
          {/* Current doc not in the list yet (fresh draft / offline): keep
              the controlled <select> from rendering blank (F5). */}
          {doc.slug &&
            !BUILTIN_STUDIES.some((s) => s.slug === doc.slug) &&
            !diagrams.some((m) => m.slug === doc.slug) && (
              <option key={`cur-${doc.slug}`} value={doc.slug}>
                {doc.title} {!doc.published ? '(draft)' : ''}
              </option>
            )}
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
          disabled={isSeed || !docId || saving}
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
        <label
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontFamily: 'var(--font-mono)', color: pal.muted }}
          title="Custom snap step in px (0 = free placement)"
        >
          STEP
          <input
            type="number"
            min={0}
            max={100}
            value={snapSize ?? 0}
            onChange={(e) => {
              const v = Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0)))
              setSnapSize(v > 0 ? v : null)
            }}
            style={{ ...INPUT, width: 62, padding: '5px 7px' }}
            aria-label="Custom snap step in pixels (0 disables snapping)"
          />
        </label>
        <button
          type="button"
          onClick={() => setShowGrid((v) => !v)}
          aria-pressed={showGrid}
          title="Toggle the background grid overlay"
          style={{
            ...BTN,
            borderColor: showGrid ? pal.cyan : pal.border,
            color: showGrid ? pal.cyan : pal.ink,
          }}
        >
          GRID {showGrid ? 'ON' : 'OFF'}
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
        <button
          type="button"
          onClick={copySelected}
          disabled={!selectedNodeIds().length}
          title="Copy selected node(s) — Ctrl+C (shift+click nodes to multi-select)"
          style={BTN}
        >
          COPY{selIds.size > 1 ? ` (${selIds.size})` : ''}
        </button>
        <button
          type="button"
          onClick={pasteClipboard}
          title="Paste copied node(s) — Ctrl+V"
          style={BTN}
        >
          PASTE
        </button>
        <button type="button" onClick={newDoc} style={BTN}>NEW</button>
        <button type="button" onClick={duplicateDoc} style={BTN}>DUPLICATE</button>
        <button
          type="button" onClick={() => void removeDoc()} disabled={isSeed || !docId} style={BTN}
        >
          DELETE
        </button>
        <button type="button" onClick={() => void toggleShare()} aria-expanded={shareOpen} style={BTN}>
          SHARE
        </button>
        <button
          type="button"
          onClick={() => void toggleHistory()}
          disabled={isSeed || !docId}
          title={isSeed || !docId ? 'Save a copy first to keep history' : 'Revision history + restore'}
          aria-expanded={histOpen}
          style={BTN}
        >
          HISTORY
        </button>
        <button type="button" onClick={() => exportCanvas('png')} title="Export the diagram as PNG" style={BTN}>
          PNG
        </button>
        <button type="button" onClick={() => exportCanvas('svg')} title="Export the diagram as SVG (vector)" style={BTN}>
          SVG
        </button>
        <button type="button" onClick={exportDoc} title="Export the document as JSON" style={BTN}>
          JSON
        </button>
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
        <button
          type="button"
          onClick={toggleEditFullscreen}
          aria-pressed={editFs}
          title="Edit in fullscreen (Esc exits)"
          style={BTN}
        >
          {editFs ? 'EXIT FULL' : 'FULLSCREEN'}
        </button>
        <button
          type="button"
          onClick={() => { setEditMode(false); setConnectFrom(null); resetTransient() }}
          style={BTN}
        >
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

      {/* Restore/discard offer for an autosaved draft of this diagram (N2). */}
      {draftOffer && (
        <div
          role="status"
          style={{
            display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
            marginBottom: 10, padding: '10px 14px',
            background: pal.panel, border: `1px solid ${pal.amber}`, borderRadius: 10,
          }}
        >
          <span style={{ fontSize: 12, color: pal.ink, flex: 1, minWidth: 220 }}>
            Unsaved draft from {new Date(draftOffer.at).toLocaleString()} — restore it?
          </span>
          <button type="button" onClick={acceptDraft} style={BTN}>RESTORE DRAFT</button>
          <button type="button" onClick={discardDraft} style={BTN}>DISCARD</button>
        </div>
      )}

      {/* ── Share & embed panel ─────────────────────────────── */}
      {shareOpen && shareUrls && (
        <div style={{ ...PANEL, marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 11, letterSpacing: 2, color: pal.muted, fontFamily: 'var(--font-mono)' }}>
              SHARE &amp; EMBED
            </span>
            <button type="button" onClick={() => setShareOpen(false)} style={{ ...BTN, padding: '4px 8px' }}>
              CLOSE
            </button>
          </div>
          {!doc.published && (
            <div style={{ fontSize: 11, color: pal.amber, marginBottom: 10, fontFamily: 'var(--font-mono)' }}>
              DRAFT — links only open for signed-in admins. Toggle PUBLISHED to share publicly.
            </div>
          )}
          <label style={LABEL}>PUBLIC LINK</label>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <input readOnly value={shareUrls.page} style={INPUT} onFocus={(e) => e.target.select()} />
            <button
              type="button"
              onClick={() => void copyText(shareUrls.page, 'Share link copied')}
              style={{ ...BTN, whiteSpace: 'nowrap' }}
            >
              COPY
            </button>
          </div>
          <label style={LABEL}>EMBED (IFRAME)</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input readOnly value={shareUrls.snippet} style={INPUT} onFocus={(e) => e.target.select()} />
            <button
              type="button"
              onClick={() => void copyText(shareUrls.snippet, 'Embed snippet copied')}
              style={{ ...BTN, whiteSpace: 'nowrap' }}
            >
              COPY
            </button>
          </div>
          <p style={{ fontSize: 11, color: pal.muted, margin: '8px 0 0', lineHeight: 1.6, fontFamily: 'var(--font-mono)' }}>
            The embed points at <code>/hybrid-infra/embed</code> — a chrome-free read-only view of this diagram.
          </p>
        </div>
      )}

      {/* ── Revision history panel ───────────────────────────── */}
      {histOpen && (
        <div style={{ ...PANEL, marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 11, letterSpacing: 2, color: pal.muted, fontFamily: 'var(--font-mono)' }}>
              REVISION HISTORY
            </span>
            <button type="button" onClick={() => setHistOpen(false)} style={{ ...BTN, padding: '4px 8px' }}>
              CLOSE
            </button>
          </div>
          {isSeed || !docId ? (
            <p style={{ fontSize: 12, color: pal.muted, fontFamily: 'var(--font-mono)', margin: 0 }}>
              Built-in seed — save a copy first to keep history.
            </p>
          ) : revLoading ? (
            <p style={{ fontSize: 12, color: pal.muted, fontFamily: 'var(--font-mono)', margin: 0 }}>
              Loading…
            </p>
          ) : !revList?.length ? (
            <p style={{ fontSize: 12, color: pal.muted, fontFamily: 'var(--font-mono)', margin: 0 }}>
              No revisions yet — history starts after your next save.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {revList.map((rv) => (
                <div
                  key={rv.id}
                  style={{
                    display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 8,
                    alignItems: 'center', borderBottom: `1px solid ${pal.border}`, paddingBottom: 6,
                  }}
                >
                  <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)' }}>
                    <b>{rv.title || 'Untitled'}</b>{' '}
                    <span style={{ color: pal.muted }}>{fmtRevTime(rv.createdAt)}</span>{' '}
                    <span style={{ color: rv.published ? pal.green : pal.amber, fontSize: 10, letterSpacing: 1 }}>
                      {rv.published ? 'PUBLISHED' : 'DRAFT'}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => void inspectRevision(rv)}
                    aria-expanded={viewRev?.meta.id === rv.id}
                    style={BTN}
                  >
                    VIEW
                  </button>
                  <button
                    type="button"
                    onClick={() => void applyRevision(rv)}
                    title="Restore this state (current state is snapshotted first)"
                    style={{ ...BTN, borderColor: pal.amber, color: pal.amber }}
                  >
                    RESTORE
                  </button>
                </div>
              ))}
              {viewRev && (
                <div
                  style={{
                    marginTop: 6, padding: 10, border: `1px solid ${pal.border}`,
                    borderRadius: 8, fontFamily: 'var(--font-mono)', fontSize: 11,
                    color: pal.ink, lineHeight: 1.7,
                  }}
                >
                  <div style={{ color: pal.muted, marginBottom: 4 }}>
                    CHANGES IN “{viewRev.meta.title}” VS CURRENT
                    {viewRev.diff.titleChanged ? ' · TITLE DIFFERS' : ''}
                  </div>
                  <div>+ added: {viewRev.diff.addedNodes.length ? viewRev.diff.addedNodes.join(', ') : 'none'}</div>
                  <div>− removed: {viewRev.diff.removedNodes.length ? viewRev.diff.removedNodes.join(', ') : 'none'}</div>
                  <div>~ changed: {viewRev.diff.changedNodes.length ? viewRev.diff.changedNodes.join(', ') : 'none'}</div>
                  <div>
                    flows: +{viewRev.diff.flowAdded} −{viewRev.diff.flowRemoved}
                  </div>
                  <button
                    type="button"
                    onClick={() => setViewRev(null)}
                    style={{ ...BTN, marginTop: 6, padding: '4px 8px' }}
                  >
                    HIDE
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Editor grid */}
      <div className="hi-edit-layout" style={{ display: 'grid', gridTemplateColumns: '230px minmax(0,1fr) 320px', gap: 12, alignItems: 'start' }}>
        {/* Palette */}
        <div style={{ ...PANEL, maxHeight: 720, overflowY: 'auto' }}>
          <div style={{ fontSize: 11, letterSpacing: 2, color: pal.muted, marginBottom: 10, fontFamily: 'var(--font-mono)' }}>
            IT LIBRARY — DRAG OR CLICK TO PLACE
          </div>
          <input
            value={libQuery}
            onChange={(e) => setLibQuery(e.target.value)}
            placeholder="Filter library…"
            aria-label="Filter library items"
            style={{ ...INPUT, marginBottom: 10 }}
          />
          {libFiltered.length === 0 && (
            <div style={{ fontSize: 11, color: pal.muted, fontFamily: 'var(--font-mono)', marginBottom: 8 }}>
              No library items match “{libQuery}”.
            </div>
          )}
          {libFiltered.map((g) => (
            <div key={g.id} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, letterSpacing: 1.5, color: pal.muted, marginBottom: 6, fontFamily: 'var(--font-mono)' }}>
                {g.title.toUpperCase()}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {g.items.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('application/x-infra-library', item.key)
                      e.dataTransfer.setData('text/plain', item.key)
                      e.dataTransfer.effectAllowed = 'copy'
                    }}
                    onClick={() => addNode(item)}
                    title={`${item.desc} — drag onto the canvas, or click to auto-place`}
                    style={{
                      ...BTN, textAlign: 'left', fontWeight: 500,
                      borderLeft: `3px solid ${catColorHex(item.category)}`,
                      cursor: 'grab',
                    }}
                  >
                    {item.name}
                  </button>
                ))}
              </div>
            </div>
          ))}

          {/* Category palette: live per-category color overrides */}
          <div style={{ borderTop: `1px solid ${pal.border}`, marginTop: 12, paddingTop: 10 }}>
            <div style={{ fontSize: 10, letterSpacing: 1.5, color: pal.muted, marginBottom: 8, fontFamily: 'var(--font-mono)' }}>
              CATEGORY COLORS
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 6, alignItems: 'center' }}>
              {(Object.keys(CATEGORY_META) as BuiltinCategory[]).map((c) => (
                <Fragment key={c}>
                  <span style={{ fontSize: 11, color: pal.ink, fontFamily: 'var(--font-mono)' }}>
                    {CATEGORY_META[c].label}
                  </span>
                  <input
                    type="color"
                    aria-label={`${CATEGORY_META[c].label} color`}
                    value={doc.categoryColors?.[c] ?? CATEGORY_META[c].color}
                    onChange={(e) => setCatColor(c, e.target.value)}
                    style={{ width: 34, height: 24, padding: 0, border: `1px solid ${pal.border}`, background: 'transparent', borderRadius: 6, cursor: 'pointer' }}
                  />
                </Fragment>
              ))}
            </div>
            <button
              type="button"
              onClick={resetCatColors}
              disabled={!doc.categoryColors}
              style={{ ...BTN, marginTop: 8, width: '100%', opacity: doc.categoryColors ? 1 : 0.5 }}
            >
              RESET DEFAULTS
            </button>
          </div>

          {/* Custom categories: doc-defined categories beyond the built-ins */}
          <div style={{ borderTop: `1px solid ${pal.border}`, marginTop: 12, paddingTop: 10 }}>
            <div style={{ fontSize: 10, letterSpacing: 1.5, color: pal.muted, marginBottom: 8, fontFamily: 'var(--font-mono)' }}>
              CUSTOM CATEGORIES
            </div>
            {Object.entries(doc.customCategories ?? {}).map(([k, m]) => (
              <div
                key={k}
                style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 6, alignItems: 'center', marginBottom: 5 }}
              >
                <span style={{ fontSize: 11, color: pal.ink, fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {m.label}
                </span>
                <input
                  type="color"
                  aria-label={`${m.label} color`}
                  value={m.color}
                  onChange={(e) => setCustomCat(k, { color: e.target.value })}
                  style={{ width: 34, height: 24, padding: 0, border: `1px solid ${pal.border}`, background: 'transparent', borderRadius: 6, cursor: 'pointer' }}
                />
                <button
                  type="button"
                  onClick={() => removeCustomCat(k)}
                  title="Remove category (its nodes reset to Network)"
                  style={{ ...BTN, padding: '4px 8px' }}
                >
                  ✕
                </button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <input
                value={newCatLabel}
                onChange={(e) => setNewCatLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addCustomCat()
                  }
                }}
                placeholder="New category name"
                maxLength={24}
                aria-label="New category name"
                style={{ ...INPUT, flex: 1, minWidth: 0, padding: '5px 7px' }}
              />
              <input
                type="color"
                aria-label="New category color"
                value={newCatColor}
                onChange={(e) => setNewCatColor(e.target.value)}
                style={{ width: 34, height: 26, padding: 0, border: `1px solid ${pal.border}`, background: 'transparent', borderRadius: 6, cursor: 'pointer' }}
              />
              <button type="button" onClick={addCustomCat} disabled={!newCatLabel.trim()} style={{ ...BTN, opacity: newCatLabel.trim() ? 1 : 0.5 }}>
                ADD
              </button>
            </div>
          </div>
        </div>

          {/* Canvas */}
          <div
            style={{
              position: 'relative', border: '1px solid #203a55', borderRadius: 18,
              overflow: 'hidden', background: 'linear-gradient(180deg,rgba(12,27,45,.95),rgba(8,18,32,.98))',
              minHeight: 480,
            }}
          >
            <div
              role="toolbar"
              aria-label="Canvas zoom"
              title="Scroll to zoom · drag to pan · Ctrl/⌘ + +/−/0"
              style={{
                position: 'absolute', top: 10, right: 10, zIndex: 5,
                display: 'flex', gap: 4, alignItems: 'center',
                background: 'rgba(8,18,32,.88)', border: '1px solid #203a55',
                borderRadius: 8, padding: '4px 6px',
              }}
            >
              <button type="button" onClick={() => canvasHandle.current?.zoomOut()} aria-label="Zoom out" style={{ ...BTN, padding: '5px 9px' }}>−</button>
              <span
                aria-live="polite"
                style={{ ...BTN, padding: '5px 6px', minWidth: 48, textAlign: 'center', cursor: 'default' }}
              >
                {zoomPct}%
              </span>
              <button type="button" onClick={() => canvasHandle.current?.zoomIn()} aria-label="Zoom in" style={{ ...BTN, padding: '5px 9px' }}>+</button>
              <button type="button" onClick={() => canvasHandle.current?.fit()} title="Fit diagram (Ctrl/⌘ + 0)" style={{ ...BTN, padding: '5px 8px' }}>FIT</button>
              <button type="button" onClick={() => canvasHandle.current?.setPercent(100)} title="Zoom to 100%" style={{ ...BTN, padding: '5px 8px' }}>100%</button>
            </div>
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
            ref={canvasHandle}
            activeMode="all"
            edgeVendor="fortigate"
            selectedId={selectedId}
            selectedIds={selIds}
            onToggleSelect={handleToggleSelect}
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
            viewStorageKey={`editor-${docId ?? doc.slug}`}
            catColors={mergedCat()}
            grid={showGrid}
            onViewChange={setZoomPct}
            onDropLibraryItem={handleDropItem}
            onMarqueeSelect={handleMarqueeSelect}
            onResizeNode={handleResizeNode}
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
              Select a node to edit its properties.
              <br />Drag nodes to move · drag empty space selects (marquee) · Space+drag or middle-drag pans · scroll zooms.
              <br />CONNECT draws animated links · Shift+click multi-selects.
              <br />Shortcuts: Ctrl+Z/Y undo/redo · Ctrl+C/V/D copy/paste/dup · Ctrl+A select all · arrows nudge (Alt=10px) · Del deletes · Esc cancels link.
              <br />Ctrl+K or / quick-adds at the view center · ? opens the full shortcut sheet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 11, letterSpacing: 2, color: pal.muted, fontFamily: 'var(--font-mono)' }}>
                PROPERTIES
              </div>
              {selIds.size > 1 && (
                <div style={{ fontSize: 11, color: pal.cyan, fontFamily: 'var(--font-mono)' }}>
                  {selIds.size} NODES SELECTED — the panel edits the highlighted one; Delete/COPY/align act on all.
                </div>
              )}
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 10, letterSpacing: 1.5, color: pal.muted, fontFamily: 'var(--font-mono)' }}>
                  ARRANGE
                </span>
                <button type="button" onClick={() => zOrder(false)} title="Move selection behind its layer peers" style={{ ...BTN, padding: '5px 8px' }}>
                  SEND BACK
                </button>
                <button type="button" onClick={() => zOrder(true)} title="Bring selection in front of its layer peers" style={{ ...BTN, padding: '5px 8px' }}>
                  TO FRONT
                </button>
                {selIds.size > 1 && (
                  selectionHasGid ? (
                    <button type="button" onClick={ungroupSelection} title="Dissolve the group" style={{ ...BTN, padding: '5px 8px' }}>
                      UNGROUP
                    </button>
                  ) : (
                    <button type="button" onClick={groupSelection} title="Group: clicking one member selects all, drag moves all" style={{ ...BTN, padding: '5px 8px' }}>
                      GROUP
                    </button>
                  )
                )}
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
                    {(Object.keys(CATEGORY_META) as BuiltinCategory[]).map((c) => (
                      <option key={c} value={c}>{CATEGORY_META[c].label}</option>
                    ))}
                    {Object.keys(doc.customCategories ?? {}).map((c) => (
                      <option key={c} value={c}>{doc.customCategories?.[c]?.label}</option>
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
                        onChange={(e) => {
                          // Clamp to the same bounds the drags and sanitizeDoc
                          // enforce: negative w/h would crash the canvas render
                          // loop (arcTo IndexSizeError) (F7).
                          const raw = Math.round(Number(e.target.value) || 0)
                          const v =
                            k === 'x' ? Math.max(-200, Math.min(1480, raw))
                            : k === 'y' ? Math.max(-100, Math.min(1020, raw))
                            : k === 'w' ? Math.max(40, Math.min(1280, raw))
                            : Math.max(20, Math.min(920, raw))
                          updateNode(selected.id, { [k]: v } as Partial<InfraComponent>)
                        }}
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
                  <div key={f.id} style={{ border: `1px solid ${pal.border}`, borderRadius: 8, padding: 6, marginBottom: 6 }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span style={{ fontSize: 11, color: pal.blue, fontFamily: 'var(--font-mono)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        → {depNameOf(f.to)}
                      </span>
                      <select
                        aria-label="Link category"
                        value={f.cat}
                        onChange={(e) => setLinkCat(f.id, e.target.value as InfraCategory)}
                        style={{ ...INPUT, width: 100 }}
                      >
                        {allCategoryIds().map((c) => (
                          <option key={c} value={c}>{catLabel(c, doc.customCategories)}</option>
                        ))}
                      </select>
                      <button type="button" onClick={() => deleteLink(f.id)} style={BTN} aria-label={`Delete link to ${depNameOf(f.to)}`}>
                        ✕
                      </button>
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6 }}>
                      <input
                        value={f.label ?? ''}
                        onChange={(e) => setLinkStyle(f.id, { label: e.target.value.slice(0, 40) || undefined })}
                        placeholder="Label"
                        aria-label="Link label"
                        style={{ ...INPUT, flex: 1, width: 'auto' }}
                      />
                      <button
                        type="button"
                        onClick={() => setLinkStyle(f.id, { dashed: !f.dashed })}
                        aria-pressed={f.dashed === true}
                        title="Dashed line"
                        style={{
                          ...BTN,
                          borderColor: f.dashed ? pal.cyan : pal.border,
                          color: f.dashed ? pal.cyan : pal.ink,
                        }}
                      >
                        DASH
                      </button>
                      <input
                        type="color"
                        aria-label="Link color"
                        value={f.color ?? catColorHex(f.cat)}
                        onChange={(e) => setLinkStyle(f.id, { color: e.target.value })}
                        title="Line color (defaults to category color)"
                        style={{ width: 30, height: 26, padding: 0, border: `1px solid ${pal.border}`, background: 'transparent', borderRadius: 6, cursor: 'pointer' }}
                      />
                      {f.color && (
                        <button
                          type="button"
                          onClick={() => setLinkStyle(f.id, { color: undefined })}
                          style={BTN}
                          title="Reset to category color"
                        >
                          ↺
                        </button>
                      )}
                    </div>
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

      {quickOpen && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(4,10,18,.62)',
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '12vh',
          }}
          onClick={() => setQuickOpen(false)}
        >
          <div
            role="dialog"
            aria-label="Quick add component"
            onClick={(e) => e.stopPropagation()}
            style={{ ...PANEL, width: 480, maxWidth: '92vw', maxHeight: '70vh', overflowY: 'auto' }}
          >
            <div style={{ fontSize: 11, letterSpacing: 2, color: pal.muted, marginBottom: 8, fontFamily: 'var(--font-mono)' }}>
              QUICK ADD — ENTER PLACES AT VIEW CENTER
            </div>
            <input
              autoFocus
              value={quickQuery}
              onChange={(e) => {
                setQuickQuery(e.target.value)
                setQuickIdx(0)
              }}
              placeholder="Firewall, switch, VM… (Esc closes)"
              aria-label="Quick add search"
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setQuickIdx((i) => Math.min(i + 1, quickItems.length - 1))
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setQuickIdx((i) => Math.max(i - 1, 0))
                } else if (e.key === 'Enter' && quickItems[quickIdx]) {
                  e.preventDefault()
                  placeQuick(quickItems[quickIdx])
                }
              }}
              style={{ ...INPUT, marginBottom: 8 }}
            />
            {quickItems.length === 0 ? (
              <div style={{ fontSize: 11, color: pal.muted, fontFamily: 'var(--font-mono)' }}>
                No library items match “{quickQuery}”.
              </div>
            ) : (
              quickItems.map((it, i) => (
                <button
                  key={it.key}
                  type="button"
                  onClick={() => placeQuick(it)}
                  onMouseEnter={() => setQuickIdx(i)}
                  style={{
                    ...BTN, display: 'block', width: '100%', textAlign: 'left', marginBottom: 4,
                    borderLeft: `3px solid ${i === quickIdx ? pal.cyan : catColorHex(it.category)}`,
                    background: i === quickIdx ? 'rgba(54,215,232,.10)' : BTN.background,
                  }}
                >
                  {it.name}
                  <span style={{ color: pal.muted, marginLeft: 8, fontSize: 10 }}>{it.category}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {helpOpen && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(4,10,18,.62)',
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '10vh',
          }}
          onClick={() => setHelpOpen(false)}
        >
          <div
            role="dialog"
            aria-label="Keyboard shortcuts"
            onClick={(e) => e.stopPropagation()}
            style={{ ...PANEL, width: 540, maxWidth: '92vw', maxHeight: '76vh', overflowY: 'auto' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 11, letterSpacing: 2, color: pal.muted, fontFamily: 'var(--font-mono)' }}>
                SHORTCUTS
              </span>
              <button type="button" onClick={() => setHelpOpen(false)} style={{ ...BTN, padding: '4px 9px' }}>
                CLOSE (Esc)
              </button>
            </div>
            {[
              ['Ctrl/⌘ K  ·  /', 'Quick add — places at the view center'],
              ['?', 'This shortcut sheet'],
              ['Esc', 'Close overlays · cancel a pending link'],
              ['Ctrl/⌘ Z  ·  Ctrl/⌘ Shift Z', 'Undo · redo'],
              ['Ctrl/⌘ C  ·  V  ·  D', 'Copy · paste · duplicate'],
              ['Ctrl/⌘ A  ·  Del', 'Select all · delete selection'],
              ['Arrow keys (Alt = 10px)', 'Nudge the selection'],
              ['Shift+click  ·  drag empty space', 'Multi-select · rubber-band marquee'],
              ['Drag from the library', 'Drop onto the canvas at the pointer'],
              ['Drag a selection handle', 'Resize (8 handles; racks excluded)'],
              ['Space/middle-drag  ·  scroll', 'Pan · zoom toward cursor'],
              ['TO FRONT / SEND BACK', 'Z-order within the layer'],
              ['GROUP / UNGROUP', 'Persistent group (click = select all)'],
              ['CONNECT, then click a node', 'Draw a link (Esc cancels)'],
            ].map(([keys, what]) => (
              <div
                key={keys}
                style={{
                  display: 'grid', gridTemplateColumns: 'minmax(170px,auto) 1fr', gap: 12,
                  fontSize: 11, fontFamily: 'var(--font-mono)', padding: '4px 0',
                  borderTop: `1px solid ${pal.border}`,
                }}
              >
                <span style={{ color: pal.cyan }}>{keys}</span>
                <span style={{ color: pal.muted }}>{what}</span>
              </div>
            ))}
          </div>
        </div>
      )}

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
