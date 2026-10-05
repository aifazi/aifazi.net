/**
 * lib/staffAccess.ts — pure helpers for the Identity "Access" tab.
 *
 * Permission model (mirrors permissions.py): a staff member's effective
 * grants are role_preset ∪ staff_permissions — overrides can only ADD to
 * the preset, never subtract. The matrix UI locks preset-granted cells on.
 */
export interface AccessCatalog {
  modules: Record<string, string>
  actions: string[]
  staff_roles: string[]
  role_presets: Record<string, Record<string, string[]>>
  manageable_roles: string[]
}

export type PermMap = Record<string, string[]>

const GROUP_LABELS: Record<string, string> = {
  home: 'Dashboard',
  content: 'Content',
  community: 'Community',
  system: 'System',
  support: 'Support',
  store: 'Store',
  fivem: 'FiveM',
  dev: 'Developer tools',
}

export interface ModuleGroup {
  id: string
  label: string
  items: Array<{ id: string; label: string }>
}

export function groupModules(modules: Record<string, string>): ModuleGroup[] {
  const groups = new Map<string, ModuleGroup>()
  const general: ModuleGroup = { id: 'general', label: 'General', items: [] }
  const entries = Object.entries(modules || {}).sort((a, b) => a[1].localeCompare(b[1]))
  for (const [id, label] of entries) {
    const dot = id.indexOf('.')
    if (dot < 0) {
      general.items.push({ id, label })
      continue
    }
    const gid = id.slice(0, dot)
    let g: ModuleGroup | undefined = groups.get(gid)
    if (!g) {
      g = { id: gid, label: GROUP_LABELS[gid] ?? gid, items: [] }
      groups.set(gid, g)
    }
    g.items.push({ id, label })
  }
  const ordered = [...groups.values()].sort((a, b) => a.label.localeCompare(b.label))
  if (general.items.length) ordered.unshift(general)
  return ordered
}

export function presetFor(
  role: string | undefined,
  presets: Record<string, Record<string, string[]>>,
): PermMap {
  return { ...((presets || {})[(role || '').toLowerCase()] || {}) }
}

const asSet = (xs: string[] | undefined): Set<string> => new Set(xs || [])

export function isPresetGranted(
  module: string,
  action: string,
  role: string | undefined,
  presets: Record<string, Record<string, string[]>>,
): boolean {
  return asSet((presets || {})[(role || '').toLowerCase()]?.[module]).has(action)
}

/** Override grants beyond what the role preset already gives. */
export function addedBeyondPreset(
  role: string | undefined,
  overrides: PermMap | undefined,
  presets: Record<string, Record<string, string[]>>,
): PermMap {
  const out: PermMap = {}
  const preset = (presets || {})[(role || '').toLowerCase()] || {}
  for (const [mod, acts] of Object.entries(overrides || {})) {
    const extra = (acts || []).filter((a) => !asSet(preset[mod]).has(a))
    if (extra.length) out[mod] = [...extra].sort()
  }
  return out
}

/** Immutable toggle of one override cell. Preset-granted cells are locked
 *  on (returned unchanged); empty modules are pruned. */
export function togglePermission(
  overrides: PermMap | undefined,
  module: string,
  action: string,
  role: string | undefined,
  presets: Record<string, Record<string, string[]>>,
): PermMap {
  const next: PermMap = {}
  for (const [m, acts] of Object.entries(overrides || {})) next[m] = [...acts]
  if (isPresetGranted(module, action, role, presets)) return next
  const cur = new Set(next[module] || [])
  if (cur.has(action)) cur.delete(action)
  else cur.add(action)
  if (cur.size) next[module] = [...cur].sort()
  else delete next[module]
  return next
}

/** Effective grants = role preset ∪ stored overrides (backend union). */
export function effectivePermissions(
  role: string | undefined,
  overrides: PermMap | undefined,
  presets: Record<string, Record<string, string[]>>,
): PermMap {
  const out: PermMap = {}
  const preset = (presets || {})[(role || '').toLowerCase()] || {}
  const mods = new Set([...Object.keys(preset), ...Object.keys(overrides || {})])
  for (const mod of mods) {
    const merged = [...new Set([...(preset[mod] || []), ...((overrides || {})[mod] || [])])].sort()
    if (merged.length) out[mod] = merged
  }
  return out
}

export function summarizePermissions(perms: PermMap | undefined): string {
  const mods = Object.entries(perms || {}).filter(([, a]) => (a || []).length)
  if (!mods.length) return 'no module access'
  const manages = mods.filter(([, a]) => a.includes('manage')).length
  return (
    `${mods.length} module${mods.length === 1 ? '' : 's'}` +
    (manages ? ` · manage ×${manages}` : '')
  )
}

export function countAdmins(staff: Array<{ role?: string }>): number {
  return (staff || []).filter((s) => (s.role || '').toLowerCase() === 'admin').length
}

export interface Guard {
  ok: boolean
  reason?: string
}

export function canChangeRole(
  rowUsername: string | undefined,
  meUsername: string | undefined,
  rowRole: string | undefined,
  newRole: string | undefined,
  adminCount: number,
): Guard {
  if ((rowUsername || '').toLowerCase() === (meUsername || '').toLowerCase()) {
    return { ok: false, reason: 'You cannot change your own role.' }
  }
  if ((rowRole || '').toLowerCase() === 'admin' && (newRole || '').toLowerCase() !== 'admin' && adminCount <= 1) {
    return { ok: false, reason: 'This is the last admin — promote someone else first.' }
  }
  return { ok: true }
}

/** Removing access demotes to member, so the same guards apply. */
export function canRemoveAccess(
  rowUsername: string | undefined,
  meUsername: string | undefined,
  rowRole: string | undefined,
  adminCount: number,
): Guard {
  return canChangeRole(rowUsername, meUsername, rowRole, 'member', adminCount)
}
