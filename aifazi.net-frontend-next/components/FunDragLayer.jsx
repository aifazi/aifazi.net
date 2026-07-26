'use client'

import { useEffect } from 'react'

const DRAG_SELECTOR = [
  '[data-fun-drag]',
  '.profile-hero-inner > div',
  '.project-card',
  '.service-card',
  '.skill-card',
  '.timeline-card',
  '.post-card',
  '.theme-card',
  '.settings-card',
].join(',')

const INTERACTIVE_SELECTOR = [
  'a',
  'button',
  'input',
  'textarea',
  'select',
  'label',
  '[role="button"]',
  '[contenteditable="true"]',
  '.no-fun-drag',
].join(',')

export default function FunDragLayer({ enabled = true }) {
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return
    if (window.matchMedia('(pointer: coarse)').matches) return

    let active = null
    let frame = null

    const reset = (item) => {
      if (!item?.el) return
      item.el.style.transition = 'transform 520ms cubic-bezier(.18,1.45,.32,1), box-shadow 260ms ease'
      item.el.style.transform = item.originalTransform || ''
      item.el.style.zIndex = item.originalZIndex || ''
      item.el.style.willChange = ''
      item.el.style.boxShadow = item.originalShadow || ''
      window.setTimeout(() => {
        if (!item.el) return
        item.el.style.transition = item.originalTransition || ''
      }, 540)
    }

    const onPointerDown = (event) => {
      if (event.button !== 0 || event.defaultPrevented) return
      if (event.target.closest(INTERACTIVE_SELECTOR)) return
      const el = event.target.closest(DRAG_SELECTOR)
      if (!el || el.closest('[data-fun-drag="off"]')) return

      active = {
        el,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        x: 0,
        y: 0,
        originalTransform: el.style.transform,
        originalTransition: el.style.transition,
        originalZIndex: el.style.zIndex,
        originalShadow: el.style.boxShadow,
      }
      el.style.transition = 'none'
      el.style.willChange = 'transform'
      el.style.zIndex = '30'
      el.style.boxShadow = '0 18px 45px rgba(0, 240, 255, 0.13)'
      el.setPointerCapture?.(event.pointerId)
    }

    const render = () => {
      frame = null
      if (!active) return
      const rotate = Math.max(-4, Math.min(4, active.x / 28))
      active.el.style.transform = `${active.originalTransform || ''} translate3d(${active.x}px, ${active.y}px, 0) rotate(${rotate}deg) scale(1.015)`
    }

    const onPointerMove = (event) => {
      if (!active || event.pointerId !== active.pointerId) return
      active.x = (event.clientX - active.startX) * 0.55
      active.y = (event.clientY - active.startY) * 0.55
      if (!frame) frame = requestAnimationFrame(render)
    }

    const onPointerUp = (event) => {
      if (!active || event.pointerId !== active.pointerId) return
      const item = active
      active = null
      if (frame) cancelAnimationFrame(frame)
      frame = null
      reset(item)
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('pointermove', onPointerMove)
    document.addEventListener('pointerup', onPointerUp)
    document.addEventListener('pointercancel', onPointerUp)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('pointerup', onPointerUp)
      document.removeEventListener('pointercancel', onPointerUp)
      if (frame) cancelAnimationFrame(frame)
      reset(active)
    }
  }, [enabled])

  return null
}
