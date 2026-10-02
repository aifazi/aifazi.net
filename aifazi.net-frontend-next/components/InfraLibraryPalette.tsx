/**
 * components/InfraLibraryPalette.tsx — category-sidebar browser for the
 * hybrid-infra editor's IT library (PR D).
 *
 * Layout: a ~44px icon rail (ALL + one button per category, with counts)
 * beside a list of rich cards (icon, name, role subtitle, category color).
 * The search box spans every category (results view); arrow keys move card
 * focus, Enter places the focused item. Drag-and-drop keeps the
 * `application/x-infra-library` mime contract with the canvas.
 */
import { useMemo, useRef, useState, type CSSProperties } from 'react'
import { Input } from '@/core/forms'
import {
  INFRA_LIBRARY,
  LIBRARY_ALL_ICON,
  groupIcon,
  itemIcon,
  type LibraryItem,
} from '@/data/infra-library'
import { infraPalette, useInfraTone } from '@/lib/infraTheme'

interface InfraLibraryPaletteProps {
  /** Effective category color (doc overrides already applied). */
  catColor: (category: string) => string
  /** Click / Enter to place: stamps the item onto the canvas. */
  onPick: (item: LibraryItem) => void
}

export default function InfraLibraryPalette({ catColor, onPick }: InfraLibraryPaletteProps) {
  const pal = infraPalette(useInfraTone())
  const BTN: CSSProperties = {
    background: pal.panel,
    color: pal.ink,
    border: `1px solid ${pal.border}`,
    borderRadius: 8,
    fontSize: 11,
    fontWeight: 600,
    fontFamily: 'var(--font-mono)',
    cursor: 'pointer',
  }
  const INPUT: CSSProperties = {
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

  const [query, setQuery] = useState('')
  // null = ALL categories (default). A sidebar click clears any search —
  // searching intentionally spans every group as a results view.
  const [active, setActive] = useState<string | null>(null)
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([])

  const q = query.trim().toLowerCase()
  const groups = useMemo(() => {
    const matches = (it: LibraryItem) =>
      !q ||
      it.name.toLowerCase().includes(q) ||
      it.role.toLowerCase().includes(q) ||
      it.desc.toLowerCase().includes(q) ||
      it.category.toLowerCase().includes(q)
    if (q) {
      return INFRA_LIBRARY.map((g) => ({ ...g, items: g.items.filter(matches) })).filter(
        (g) => g.items.length > 0,
      )
    }
    if (active) return INFRA_LIBRARY.filter((g) => g.id === active)
    return INFRA_LIBRARY
  }, [q, active])

  const visible = groups.flatMap((g) => g.items)
  const totalCount = INFRA_LIBRARY.reduce((n, g) => n + g.items.length, 0)

  const focusCard = (idx: number) => {
    const next = Math.max(0, Math.min(visible.length - 1, idx))
    cardRefs.current[next]?.focus()
  }

  const rail: { id: string | null; label: string; icon: string; count: number }[] = [
    { id: null, label: 'All categories', icon: LIBRARY_ALL_ICON, count: totalCount },
    ...INFRA_LIBRARY.map((g) => ({
      id: g.id,
      label: g.title,
      icon: groupIcon(g),
      count: g.items.length,
    })),
  ]

  return (
    <div>
      <div style={{ fontSize: 11, letterSpacing: 2, color: pal.muted, marginBottom: 10, fontFamily: 'var(--font-mono)' }}>
        IT LIBRARY — DRAG OR CLICK TO PLACE
      </div>
      <Input
        value={query}
        onChange={setQuery}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && visible.length) {
            e.preventDefault()
            focusCard(0)
          }
        }}
        placeholder="Search all categories…"
        aria-label="Search library items"
        style={{ ...INPUT, marginBottom: 8 }}
      />
      <div
        style={{ display: 'grid', gridTemplateColumns: '44px minmax(0,1fr)', gap: 6, alignItems: 'start' }}
      >
        {/* Icon rail: ALL + one button per category with item counts */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }} role="group" aria-label="Library categories">
          {rail.map((s) => {
            const isActive = q ? s.id === null : active === s.id
            return (
              <button
                key={s.id ?? '__all__'}
                type="button"
                title={s.label}
                aria-label={s.label}
                aria-pressed={isActive}
                onClick={() => {
                  setActive(s.id)
                  setQuery('')
                  cardRefs.current = []
                }}
                style={{
                  ...BTN,
                  padding: '6px 2px 4px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 2,
                  border: `1px solid ${isActive ? pal.cyan : pal.border}`,
                  background: isActive ? 'rgba(54,215,232,.10)' : pal.panel,
                  color: isActive ? pal.cyan : pal.ink,
                }}
              >
                <span aria-hidden style={{ fontSize: 13, lineHeight: '14px' }}>{s.icon}</span>
                <span style={{ fontSize: 8, fontWeight: 500, color: isActive ? pal.cyan : pal.muted }}>{s.count}</span>
              </button>
            )
          })}
        </div>

        {/* Card list */}
        <div
          style={{ display: 'flex', flexDirection: 'column', gap: 4, minHeight: 80 }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              const idx = cardRefs.current.indexOf(document.activeElement as HTMLButtonElement)
              focusCard(idx === -1 ? 0 : idx + 1)
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              const idx = cardRefs.current.indexOf(document.activeElement as HTMLButtonElement)
              focusCard(idx === -1 ? 0 : idx - 1)
            } else if (e.key === 'Home') {
              e.preventDefault()
              focusCard(0)
            } else if (e.key === 'End') {
              e.preventDefault()
              focusCard(visible.length - 1)
            }
          }}
        >
          {q && groups.length > 1 && (
            <div style={{ fontSize: 9, letterSpacing: 1, color: pal.muted, fontFamily: 'var(--font-mono)', marginBottom: 2 }}>
              {visible.length} MATCHES ACROSS {groups.length} CATEGORIES
            </div>
          )}
          {visible.length === 0 && (
            <div style={{ fontSize: 11, color: pal.muted, fontFamily: 'var(--font-mono)' }}>
              No library items match “{query}”.
            </div>
          )}
          {groups.map((g) => (
            <div key={g.id} style={{ display: 'contents' }}>
              {!(active && !q) && (
                <div style={{ fontSize: 10, letterSpacing: 1.5, color: pal.muted, marginTop: 4, fontFamily: 'var(--font-mono)' }}>
                  {g.title.toUpperCase()}
                </div>
              )}
              {g.items.map((item) => {
                const idx = visible.indexOf(item)
                return (
                  <button
                    key={item.key}
                    ref={(el) => {
                      cardRefs.current[idx] = el
                    }}
                    type="button"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('application/x-infra-library', item.key)
                      e.dataTransfer.setData('text/plain', item.key)
                      e.dataTransfer.effectAllowed = 'copy'
                    }}
                    onClick={() => onPick(item)}
                    title={`${item.desc} — drag onto the canvas, or click to auto-place`}
                    style={{
                      ...BTN,
                      padding: '6px 8px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      textAlign: 'left',
                      borderLeft: `3px solid ${catColor(item.category)}`,
                      cursor: 'grab',
                    }}
                  >
                    <span
                      aria-hidden
                      style={{ fontSize: 14, width: 18, flexShrink: 0, textAlign: 'center', color: catColor(item.category) }}
                    >
                      {itemIcon(item)}
                    </span>
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span
                        style={{
                          display: 'block', fontSize: 11, fontWeight: 600,
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}
                      >
                        {item.name}
                      </span>
                      <span
                        style={{
                          display: 'block', fontSize: 9, fontWeight: 400, color: pal.muted,
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}
                      >
                        {item.role}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
