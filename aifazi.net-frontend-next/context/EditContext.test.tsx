// @vitest-environment jsdom
/**
 * Round-5 audit A5-4 (regression guard for R2): page-builder image blocks pass
 * their sizing through `imgStyle` (BlockRenderer's maxWidth/border/borderRadius).
 * The visitor (non-admin) branch of EditableImage must apply it — before the
 * fix it was dropped, so visitors saw raw 800px images with no sizing.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import type { ReactNode } from 'react'
import { EditableImage } from '@/context/EditContext'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLDivElement | null = null

function render(ui: ReactNode): HTMLDivElement {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root?.render(ui)
  })
  return container
}

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
})

const IMG_STYLE = { maxWidth: 480, width: '100%', height: 'auto', borderRadius: 12, border: '1px solid var(--border)' }

// altKey/minRole/module are inferred-required by TS (no default in the
// signature); empty strings keep the no-permission, no-opts behavior.
const PROPS = { contentKey: 'hero.img', altKey: '', minRole: '', module: '', defaultValue: 'https://example.com/pic.png', imgStyle: IMG_STYLE }

describe('EditableImage visitor branch (R2)', () => {
  it('applies imgStyle sizing for non-admin visitors', () => {
    const el = render(<EditableImage {...PROPS} />)
    const img = el.querySelector('img')
    expect(img).not.toBeNull()
    const style = img!.getAttribute('style') || ''
    expect(style).toContain('max-width: 480px')
    expect(style).toContain('border-radius: 12px')
    expect(style).toContain('border')
    expect(img!.getAttribute('src')).toBe('https://example.com/pic.png')
  })

  it('shows no admin edit chrome to visitors', () => {
    const el = render(<EditableImage {...PROPS} />)
    expect(el.textContent).not.toContain('IMAGE')
  })
})
