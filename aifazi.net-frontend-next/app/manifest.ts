import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'aifazi.net — Neon City',
    short_name: 'aifazi',
    description: 'Network Engineer & Full-Stack Developer · FiveM · Store · Forum',
    start_url: '/',
    display: 'standalone',
    background_color: '#060a0f',
    theme_color: '#00ff88',
    icons: [],
  }
}
