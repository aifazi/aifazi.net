/**
 * pages-src/admin/builder/layoutUtils.js — immutable path-based helpers for the
 * Page Builder layout tree.
 *
 * A layout is an array of blocks. A block of type 'row' has `children` = array
 * of arrays (one per column). A `path` is an array of indices that addresses an
 * inner ARRAY within the tree:
 *   []                       → the top-level layout array
 *   [rowIdx, colIdx]         → layout[rowIdx].children[colIdx]   (a column array)
 *   [rowIdx, colIdx, childIdx, colIdx] → a column inside a nested row (recursion)
 * Every helper is immutable — it returns new arrays/objects and never mutates
 * the input.
 */

export const isRow = (b) => !!b && b.type === 'row'

/** Address the array that `path` points at. */
export function getAtPath(layout, path) {
  let cur = layout
  for (let i = 0; i < path.length; i++) {
    cur = cur[path[i]]
    if (i < path.length - 1 && isRow(cur)) cur = cur.children
  }
  return cur
}

/** Immutably replace the array at `path` with `updater(oldArray)`. */
export function setAtPath(layout, path, updater) {
  if (!Array.isArray(layout)) return layout
  if (path.length === 0) {
    const next = updater(layout)
    return Array.isArray(next) ? next : layout
  }
  const [head, ...rest] = path
  const el = layout[head]
  const clone = [...layout]
  if (isRow(el) && rest.length > 0) {
    const [cIdx, ...cRest] = rest
    const cols = (Array.isArray(el.children) ? el.children : []).map(c => (Array.isArray(c) ? c : []))
    while (cols.length <= cIdx) cols.push([])
    const newCols = [...cols]
    newCols[cIdx] = setAtPath(cols[cIdx] || [], cRest, updater)
    clone[head] = { ...el, children: newCols }
  } else if (Array.isArray(el)) {
    clone[head] = setAtPath(el, rest, updater)
  }
  return clone
}

/** Immutably remove the block at `path[index]`. Returns [newLayout, removed]. */
export function removeAtPath(layout, path, index) {
  const arr = getAtPath(layout, path)
  const removed = Array.isArray(arr) ? arr[index] : undefined
  if (removed === undefined) return [layout, undefined]
  const next = setAtPath(layout, path, a => a.filter((_, i) => i !== index))
  return [next, removed]
}

/** Immutably insert `block` at `path[index]`. */
export function insertAtPath(layout, path, index, block) {
  return setAtPath(layout, path, a => {
    const n = [...a]
    n.splice(index, 0, block)
    return n
  })
}

/** Mouse-Y midpoint insertion index for a draggable row at `index`. */
export function midpointIndex(e, index) {
  const r = e.currentTarget.getBoundingClientRect()
  return e.clientY < r.top + r.height / 2 ? index : index + 1
}

export const samePath = (a, b) =>
  Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i])

export const pathKey = (path) => (Array.isArray(path) ? path.join('.') : '')

/** Coerce a row block to a valid grid: `columns` 1..4, `children` padded to that length. */
export function normalizeRow(row) {
  if (!row || row.type !== 'row') return row
  const columns = Math.max(1, Math.min(4, Number(row.columns) || 2))
  const children = (Array.isArray(row.children) ? row.children : []).map(c => (Array.isArray(c) ? c : []))
  while (children.length < columns) children.push([])
  return { ...row, columns, children }
}
