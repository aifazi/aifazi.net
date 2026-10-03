// @vitest-environment jsdom
/**
 * Round-4 audit regression: the core Slider replaced <input type="range">
 * across 16 call sites and must keep keyboard operability.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { Slider } from '@/core/forms'

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

const sliderOf = (el: HTMLDivElement): HTMLDivElement =>
  el.querySelector('[role="slider"]') as HTMLDivElement

const press = (node: HTMLDivElement, key: string) =>
  act(() => {
    node.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })

describe('Slider keyboard support', () => {
  it('is focusable and arrow/Home/End/Page keys move the value', () => {
    const onChange = vi.fn()
    const el = render(<Slider value={50} onChange={onChange} min={0} max={100} step={1} />)
    const track = sliderOf(el)
    expect(track.getAttribute('tabindex')).toBe('0')
    expect(track.getAttribute('aria-valuenow')).toBe('50')
    press(track, 'ArrowRight')
    expect(onChange).toHaveBeenLastCalledWith(51)
    press(track, 'ArrowLeft')
    expect(onChange).toHaveBeenLastCalledWith(49)
    press(track, 'PageUp')
    expect(onChange).toHaveBeenLastCalledWith(60)
    press(track, 'PageDown')
    expect(onChange).toHaveBeenLastCalledWith(40)
    press(track, 'Home')
    expect(onChange).toHaveBeenLastCalledWith(0)
    press(track, 'End')
    expect(onChange).toHaveBeenLastCalledWith(100)
    expect(onChange).toHaveBeenCalledTimes(6)
  })

  it('clamps stepping to min/max', () => {
    const onChange = vi.fn()
    const el = render(<Slider value={100} onChange={onChange} min={0} max={100} step={1} />)
    press(sliderOf(el), 'ArrowRight')
    expect(onChange).toHaveBeenLastCalledWith(100)
    press(sliderOf(el), 'ArrowLeft')
    expect(onChange).toHaveBeenLastCalledWith(99)
  })

  it('disabled sliders ignore keys and leave the tab order', () => {
    const onChange = vi.fn()
    const el = render(<Slider value={50} onChange={onChange} disabled />)
    const track = sliderOf(el)
    expect(track.getAttribute('tabindex')).toBeNull()
    expect(track.getAttribute('aria-disabled')).toBe('true')
    press(track, 'ArrowRight')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('forwards a caller-supplied onKeyDown', () => {
    const caller = vi.fn()
    const el = render(<Slider value={50} onChange={() => {}} onKeyDown={caller} />)
    press(sliderOf(el), 'ArrowRight')
    expect(caller).toHaveBeenCalledTimes(1)
  })
})
