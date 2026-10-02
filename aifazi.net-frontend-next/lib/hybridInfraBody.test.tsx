// @vitest-environment jsdom
/**
 * F20: component coverage for the /hybrid-infra shell (HybridInfraBody) —
 * list view, in-place enter via pushState, and exit on Back/back bar.
 * Children are mocked so the test exercises shell routing only.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import HybridInfraBody from '@/components/HybridInfraBody'

vi.mock('@/components/HybridInfraLibrary', () => ({
  default: ({ onOpen }: { onOpen: (slug: string, title?: string) => void }) => (
    <button type="button" data-testid="open-plan" onClick={() => onOpen('plan-a', 'Plan A')}>
      OPEN PLAN A
    </button>
  ),
}))

vi.mock('@/components/HybridInfraLoader', () => ({
  default: ({ autoEdit }: { autoEdit?: boolean }) => (
    <div data-testid="loader" data-autoedit={autoEdit ? '1' : '0'} />
  ),
}))

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

function backButton(): HTMLButtonElement | null {
  const found = Array.from(container?.querySelectorAll('button') ?? []).find((b) =>
    (b.textContent ?? '').includes('ALL PLANS'),
  )
  return (found as HTMLButtonElement | undefined) ?? null
}

beforeEach(() => {
  window.history.replaceState(null, '', '/')
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
})

describe('HybridInfraBody shell', () => {
  it('renders the list view by default (no back bar)', () => {
    const el = render(<HybridInfraBody initialSlug="" initialEntered={false} />)
    expect(el.querySelector('[data-testid="open-plan"]')).toBeTruthy()
    expect(el.textContent).toContain('Plan A — Hybrid Infrastructure')
    expect(backButton()).toBeNull()
    expect(window.location.search).toBe('')
  })

  it('enters a plan in place: URL gains ?diagram= and the back bar shows', () => {
    const el = render(<HybridInfraBody initialSlug="" initialEntered={false} />)
    act(() => {
      ;(el.querySelector('[data-testid="open-plan"]') as HTMLButtonElement).click()
    })
    expect(window.location.search).toBe('?diagram=plan-a')
    expect(backButton()).toBeTruthy()
    expect(el.querySelector('[data-testid="loader"]')).toBeTruthy()
    expect(el.querySelector('h1')?.textContent).toBe('Plan A')
    expect(el.querySelector('[data-testid="loader"]')?.getAttribute('data-autoedit')).toBe('0')
  })

  it('exits on browser Back (popstate) back to the list view', () => {
    const el = render(<HybridInfraBody initialSlug="" initialEntered={false} />)
    act(() => {
      ;(el.querySelector('[data-testid="open-plan"]') as HTMLButtonElement).click()
    })
    expect(backButton()).toBeTruthy()
    act(() => {
      window.history.replaceState(null, '', '/')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(backButton()).toBeNull()
    expect(el.querySelector('[data-testid="open-plan"]')).toBeTruthy()
    expect(window.location.search).toBe('')
  })

  it('back bar click clears the param when there is no pushed history state', () => {
    const el = render(<HybridInfraBody initialSlug="" initialEntered={false} />)
    act(() => {
      ;(el.querySelector('[data-testid="open-plan"]') as HTMLButtonElement).click()
    })
    // Drop the {hi:1} marker so exit() takes the deterministic pushState path
    // (history.back() is async in jsdom and would race the assertions).
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
    act(() => {
      backButton()?.click()
    })
    expect(backButton()).toBeNull()
    expect(window.location.search).toBe('')
    expect(el.querySelector('[data-testid="open-plan"]')).toBeTruthy()
  })

  it('renders the enter view immediately when initialEntered is set', () => {
    const el = render(<HybridInfraBody initialSlug="plan-a" initialEntered={true} />)
    expect(backButton()).toBeTruthy()
    expect(el.querySelector('[data-testid="loader"]')).toBeTruthy()
    expect(el.querySelector('h1')?.textContent).toBe('Plan A — Hybrid Infrastructure')
    expect(el.querySelector('[data-testid="open-plan"]')).toBeNull()
  })

  it('infra:edit from the list enters the last-viewed plan in edit mode', () => {
    const el = render(<HybridInfraBody initialSlug="" initialEntered={false} />)
    act(() => {
      ;(el.querySelector('[data-testid="open-plan"]') as HTMLButtonElement).click()
    })
    act(() => {
      window.history.replaceState(null, '', '/')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(backButton()).toBeNull()
    act(() => {
      window.dispatchEvent(new CustomEvent('infra:edit'))
    })
    expect(backButton()).toBeTruthy()
    expect(el.querySelector('[data-testid="loader"]')?.getAttribute('data-autoedit')).toBe('1')
    expect(window.location.search).toBe('?diagram=plan-a')
  })
})
