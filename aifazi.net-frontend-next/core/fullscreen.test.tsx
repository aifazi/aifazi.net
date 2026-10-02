// @vitest-environment jsdom
/**
 * Fullscreen overlay targeting: useFullscreenTarget must return document.body
 * normally, then migrate open overlays INTO the active fullscreen element —
 * the top layer paints that element above every z-index, so portals left on
 * <body> (delete confirms, toasts) render underneath it and only become
 * visible after fullscreen exits.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ReactNode } from 'react'
import { useFullscreenTarget } from '@/core/fullscreen'
import { DialogProvider, dialog } from '@/core/dialog'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

let fsElement: Element | null = null
let root: Root | null = null
let container: HTMLDivElement | null = null

function setFullscreen(el: Element | null) {
  fsElement = el
  act(() => {
    document.dispatchEvent(new Event('fullscreenchange'))
  })
}

function render(ui: ReactNode): HTMLDivElement {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root?.render(ui)
  })
  return container
}

beforeEach(() => {
  fsElement = null
  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true,
    get: () => fsElement,
  })
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
  container?.remove()
  container = null
  Reflect.deleteProperty(document, 'fullscreenElement')
})

describe('useFullscreenTarget', () => {
  it('returns body while windowed and the fullscreen element while fullscreen', () => {
    let captured: Element | null = null
    const Probe = () => {
      captured = useFullscreenTarget()
      return null
    }
    render(<Probe />)
    expect(captured).toBe(document.body)

    const fs = document.createElement('div')
    document.body.appendChild(fs)
    setFullscreen(fs)
    expect(captured).toBe(fs)

    setFullscreen(null)
    expect(captured).toBe(document.body)
    fs.remove()
  })
})

describe('DialogProvider fullscreen portal', () => {
  it('renders an open dialog inside the fullscreen element and re-ports on exit', async () => {
    const fs = document.createElement('div')
    document.body.appendChild(fs)
    setFullscreen(fs)

    render(<DialogProvider><div /></DialogProvider>)

    act(() => {
      void dialog.confirm({ title: 'Delete Node', message: 'Sure?' })
    })
    // Flush mount + the visible-state rAF inside act so it doesn't warn.
    await act(async () => {
      await new Promise((r) => requestAnimationFrame(() => r(null)))
    })

    const dialogEl = document.querySelector('[role="dialog"]')
    expect(dialogEl).not.toBeNull()
    expect(fs.contains(dialogEl)).toBe(true)

    setFullscreen(null)
    const afterExit = document.querySelector('[role="dialog"]')
    expect(afterExit).not.toBeNull()
    expect(fs.contains(afterExit)).toBe(false)
    expect(document.body.contains(afterExit)).toBe(true)

    // Buttons must stay clickable through the portal (re-query: the re-port
    // may swap DOM nodes), and resolving must close the dialog.
    const cancelBtn = document.querySelector<HTMLButtonElement>('[role="dialog"] button')
    expect(cancelBtn).not.toBeNull()
    act(() => {
      cancelBtn?.click()
    })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 350))
    })
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    fs.remove()
  })
})
