/**
 * Shared leave-guard for the hybrid-infra editor.
 *
 * The editor registers its dirty predicate while mounted; anything that
 * navigates away (library rows, future links) calls confirmLeave() first so
 * unsaved canvas edits are never lost silently. A beforeunload handler in the
 * editor covers reload/tab-close with the same predicate.
 */

let dirtyCheck: (() => boolean) | null = null

/** Register the editor's dirty predicate; returns an unregister function. */
export function registerDirtyCheck(fn: () => boolean): () => void {
  dirtyCheck = fn
  return () => {
    if (dirtyCheck === fn) dirtyCheck = null
  }
}

/** True when unsaved edits exist (false when no editor is mounted). */
export function hasUnsavedEdits(): boolean {
  try {
    return dirtyCheck ? dirtyCheck() : false
  } catch {
    return false
  }
}

/** Ask the user before discarding unsaved edits. Returns true to proceed. */
export function confirmLeave(msg = 'Discard unsaved changes?'): boolean {
  try {
    if (!hasUnsavedEdits()) return true
    return window.confirm(msg)
  } catch {
    return true
  }
}
