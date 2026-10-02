// @vitest-environment jsdom
/**
 * InfraLibraryPalette (PR D): category rail, cross-category search,
 * card placement, and arrow-key navigation.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import InfraLibraryPalette from '@/components/InfraLibraryPalette'
import { INFRA_LIBRARY, type LibraryItem } from '@/data/infra-library'

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

const cards = (el: HTMLDivElement): HTMLButtonElement[] =>
  Array.from(el.querySelectorAll<HTMLButtonElement>('button[draggable="true"]'))

const railButtons = (el: HTMLDivElement): HTMLButtonElement[] =>
  Array.from(el.querySelectorAll<HTMLButtonElement>('button[aria-label]')).filter(
    (b) => b.getAttribute('draggable') !== 'true',
  )

const search = (el: HTMLDivElement): HTMLInputElement =>
  el.querySelector('input[aria-label="Search library items"]') as HTMLInputElement

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
})

describe('InfraLibraryPalette', () => {
  it('renders the category rail with ALL + one button per group and counts', () => {
    const el = render(<InfraLibraryPalette catColor={() => '#35a7ff'} onPick={() => {}} />)
    const rail = railButtons(el)
    expect(rail).toHaveLength(INFRA_LIBRARY.length + 1)
    expect(rail[0].getAttribute('aria-label')).toBe('All categories')
    expect(rail[0].getAttribute('aria-pressed')).toBe('true')
    // Every card of every group is listed in the ALL view.
    expect(cards(el)).toHaveLength(INFRA_LIBRARY.reduce((n, g) => n + g.items.length, 0))
    // Icons render on the rail.
    expect(rail[0].textContent?.trim()).toContain('⊞')
  })

  it('clicking a category narrows the list to that group only', () => {
    const el = render(<InfraLibraryPalette catColor={() => '#35a7ff'} onPick={() => {}} />)
    const networkBtn = railButtons(el).find((b) => b.getAttribute('aria-label') === 'Network')!
    act(() => networkBtn.click())
    const group = INFRA_LIBRARY.find((g) => g.id === 'network')!
    expect(cards(el)).toHaveLength(group.items.length)
    expect(railButtons(el).find((b) => b.getAttribute('aria-label') === 'Network')!.getAttribute('aria-pressed')).toBe('true')
    // Back to ALL restores the full list.
    act(() => railButtons(el)[0].click())
    expect(cards(el)).toHaveLength(INFRA_LIBRARY.reduce((n, g) => n + g.items.length, 0))
  })

  it('searching spans every category and clicking a card calls onPick', () => {
    const onPick = vi.fn<(item: LibraryItem) => void>()
    const el = render(<InfraLibraryPalette catColor={() => '#35a7ff'} onPick={onPick} />)
    const input = search(el)
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
      setter.call(input, 'switch')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const matches = INFRA_LIBRARY.flatMap((g) => g.items).filter(
      (i) =>
        i.name.toLowerCase().includes('switch') ||
        i.role.toLowerCase().includes('switch') ||
        i.desc.toLowerCase().includes('switch') ||
        i.category.toLowerCase().includes('switch'),
    )
    expect(matches.length).toBeGreaterThan(0)
    expect(cards(el)).toHaveLength(matches.length)
    act(() => cards(el)[0].click())
    expect(onPick).toHaveBeenCalledTimes(1)
    expect(onPick.mock.calls[0][0].key).toBe(matches[0].key)
  })

  it('arrow keys move card focus (Enter places via native button click)', () => {
    const onPick = vi.fn<(item: LibraryItem) => void>()
    const el = render(<InfraLibraryPalette catColor={() => '#35a7ff'} onPick={onPick} />)
    const list = cards(el)
    act(() => list[0].focus())
    expect(document.activeElement).toBe(list[0])
    act(() => {
      list[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    })
    expect(document.activeElement).toBe(list[1])
    act(() => {
      list[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
    })
    expect(document.activeElement).toBe(list[0])
    // Enter placement is the button's native activation (click), covered above.
    act(() => list[0].click())
    expect(onPick).toHaveBeenCalledTimes(1)
  })

  it('shows an empty state for unmatched searches', () => {
    const el = render(<InfraLibraryPalette catColor={() => '#35a7ff'} onPick={() => {}} />)
    const input = search(el)
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
      setter.call(input, 'zzz-no-such-item')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(cards(el)).toHaveLength(0)
    expect(el.textContent).toContain('No library items match')
  })
})
