'use client'
import { useSyncExternalStore } from 'react'

let listeners = new Set()
let now = Date.now()
let started = false

function ensureClock() {
  if (started) return
  started = true
  setInterval(() => {
    now = Date.now()
    listeners.forEach(l => l())
  }, 1000)
}

function subscribe(cb) {
  listeners.add(cb)
  ensureClock()
  return () => listeners.delete(cb)
}

export function useNow() {
  return useSyncExternalStore(subscribe, () => now, () => Date.now())
}
