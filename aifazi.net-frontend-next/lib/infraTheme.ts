'use client'

/**
 * lib/infraTheme.ts — light/dark palette for the hybrid-infra island.
 *
 * The diagram canvas + viewer chrome were authored dark-only ("ops-room"),
 * so they clash with light site themes. This module centralizes every
 * surface/text/accent color behind a tone switch instead of scattering
 * ternaries through 1200-line draw code.
 *
 * Tone source: <html data-theme="..."> (site theme), observed live.
 * Anything containing "light" (e.g. "mario-light") counts as light.
 */
import { useSyncExternalStore } from 'react'

export type InfraTone = 'dark' | 'light'

function readTone(): InfraTone {
  try {
    const t = document.documentElement.dataset.theme || ''
    return t.toLowerCase().includes('light') ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

function subscribeTone(onChange: () => void): () => void {
  const obs = new MutationObserver(onChange)
  try {
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'style'],
    })
  } catch {
    /* noop */
  }
  return () => obs.disconnect()
}

export function useInfraTone(): InfraTone {
  return useSyncExternalStore(subscribeTone, readTone, () => 'dark' as InfraTone)
}

export interface InfraPalette {
  bg: string
  bg2: string
  panel: string
  raised: string
  border: string
  grid: string
  ink: string
  sub: string
  muted: string
  faint: string
  cyan: string
  green: string
  amber: string
  red: string
  purple: string
  blue: string
  gold: string
}

const DARK: InfraPalette = {
  bg: '#07121f',
  bg2: '#0c1a2c',
  panel: '#10243b',
  raised: '#1a334d',
  border: '#2b4862',
  grid: 'rgba(53,167,255,0.07)',
  ink: '#eef6ff',
  sub: '#b7c9da',
  muted: '#8fa7bd',
  faint: '#5f7f9c',
  cyan: '#36d7e8',
  green: '#43d19e',
  amber: '#ffb454',
  red: '#ff6b78',
  purple: '#b08cff',
  blue: '#35a7ff',
  gold: '#f0c75e',
}

const LIGHT: InfraPalette = {
  bg: '#f4f7fb',
  bg2: '#e9eff6',
  panel: '#ffffff',
  raised: '#eef3f9',
  border: '#c3d2e2',
  grid: 'rgba(20,80,130,0.10)',
  ink: '#12283d',
  sub: '#33506b',
  muted: '#5b748c',
  faint: '#8aa0b4',
  cyan: '#0b7d99',
  green: '#0f7a4e',
  amber: '#9a5b00',
  red: '#c81e2e',
  purple: '#6a3fd4',
  blue: '#0b64c4',
  gold: '#8a6200',
}

export function infraPalette(tone: InfraTone): InfraPalette {
  return tone === 'light' ? LIGHT : DARK
}

/**
 * Tone-aware category colors. The canonical CATEGORY_META hexes are authored
 * for dark glass; on light surfaces the same hues need darkening for text
 * and strokes to stay legible (WCAG small-text contrast).
 */
export function infraCatColor(
  category: string,
  tone: InfraTone,
  overrides?: Record<string, string> | null,
): string {
  const custom = overrides?.[category]
  if (custom) return custom
  if (tone !== 'light') {
    return (
      {
        network: '#35a7ff',
        compute: '#b08cff',
        storage: '#43d19e',
        identity: '#36d7e8',
        security: '#ffb454',
        backup: '#ff6b78',
        endpoint: '#43d19e',
        power: '#f0c75e',
      } as Record<string, string>
    )[category] ?? '#35a7ff'
  }
  return (
    {
      network: '#0b64c4',
      compute: '#6a3fd4',
      storage: '#0f7a4e',
      identity: '#0b7d99',
      security: '#9a5b00',
      backup: '#c81e2e',
      endpoint: '#0f7a4e',
      power: '#8a6200',
    } as Record<string, string>
  )[category] ?? '#0b64c4'
}
