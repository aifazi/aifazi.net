'use client'

/**
 * components/blocks/EditSiteFab.tsx — floating admin shortcut.
 *
 * Visible only to admins. Opens the diagram editor in edit mode and scrolls
 * it into view (the editor listens for the `infra:edit` event). Rendered
 * above the bottom-right action cluster to avoid overlapping chat/FABs.
 */
import { useEffect, useState } from 'react'
import { getRole } from '@/lib/api'

export default function EditSiteFab() {
  // Server renders null (no window → no admin); the client must match that
  // on its FIRST render or React logs a hydration error — so start false and
  // read the role in an effect instead of a lazy initializer.
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
  if (!isAdmin) return null
  return (
    <button
      type="button"
      title="Edit Site — open the diagram editor (admin)"
      aria-label="Edit Site — open the diagram editor"
      onClick={() => window.dispatchEvent(new CustomEvent('infra:edit'))}
      style={{
        position: 'fixed',
        right: 20,
        bottom: 96,
        zIndex: 9000,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '12px 16px',
        borderRadius: 999,
        cursor: 'pointer',
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 1.5,
        color: '#ffffff',
        background: 'var(--cyan, #0b7d99)',
        border: '1px solid var(--cyan, #0b7d99)',
        boxShadow: '0 8px 28px rgba(0,0,0,0.45)',
      }}
    >
      ✎ EDIT SITE
    </button>
  )
}
