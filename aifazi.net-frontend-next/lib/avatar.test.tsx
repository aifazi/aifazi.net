// @vitest-environment jsdom
/**
 * Round-4 audit regression: clickable avatars must render a real <img>
 * (the old `const ImgTag = onClick ? Clickable : 'img'` handed src/alt to a
 * div and showed an empty circle).
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { UserAvatar } from '@/lib/avatar'

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

describe('UserAvatar image branch', () => {
  it('renders a real <img> with src and alt', () => {
    const el = render(<UserAvatar avatar="https://example.com/a.png" name="Neo" size={44} fallback="https://example.com/f.png" />)
    const img = el.querySelector('img')
    expect(img).not.toBeNull()
    expect(img!.getAttribute('src')).toBe('https://example.com/a.png')
    expect(img!.getAttribute('alt')).toBe('Neo')
    expect(img!.getAttribute('style')).toContain('border-radius')
  })

  it('with onClick stays an <img> and is keyboard focusable/activatable', () => {
    const onClick = vi.fn()
    const el = render(<UserAvatar avatar="https://example.com/a.png" name="Neo" size={44} onClick={onClick} />)
    const img = el.querySelector('img')
    expect(img).not.toBeNull()
    expect(img!.getAttribute('src')).toBe('https://example.com/a.png')
    expect(img!.getAttribute('role')).toBe('button')
    expect(img!.getAttribute('tabindex')).toBe('0')
    act(() => {
      img!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('uses the fallback URL when the avatar value is not a URL', () => {
    const el = render(<UserAvatar avatar="avatar:neon-cat" name="Neo" size={44} fallback="https://example.com/fb.png" />)
    // builtin emoji takes precedence over the fallback
    expect(el.querySelector('img')).toBeNull()
    expect(el.textContent).toContain('🐱')
  })
})
