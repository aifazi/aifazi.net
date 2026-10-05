import { NextResponse } from 'next/server'

// F1 share images — zero-dependency OG image route for diagrams.
//
// No @vercel/og in package.json and none is added on purpose: this returns a
// hand-rolled styled SVG (title + node/flow counts) which every major scraper
// accepts as an og:image. Query params: title, nodes, flows, slug.
// Example: /api/og?title=Plan%20A&nodes=24&flows=18&slug=plan-a

export const dynamic = 'force-dynamic'

const W = 1200
const H = 630

function escXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function clampInt(v: string | null, fallback: number): number {
  const n = Number.parseInt(v ?? '', 10)
  if (!Number.isFinite(n) || n < 0 || n > 100000) return fallback
  return n
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const rawTitle = (url.searchParams.get('title') || 'Hybrid Infrastructure').slice(0, 80)
  const rawSlug = (url.searchParams.get('slug') || '').slice(0, 64)
  const nodes = clampInt(url.searchParams.get('nodes'), 0)
  const flows = clampInt(url.searchParams.get('flows'), 0)
  const title = escXml(rawTitle)
  const slug = escXml(rawSlug)

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${title}">` +
    `<defs>` +
    `<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="#060a0f"/><stop offset="1" stop-color="#0b1a2b"/>` +
    `</linearGradient>` +
    `<linearGradient id="acc" x1="0" y1="0" x2="1" y2="0">` +
    `<stop offset="0" stop-color="#00ff88"/><stop offset="1" stop-color="#00d4ff"/>` +
    `</linearGradient>` +
    `</defs>` +
    `<rect width="${W}" height="${H}" fill="url(#bg)"/>` +
    // faint grid
    `<g stroke="#00d4ff" stroke-opacity="0.08" stroke-width="1">` +
    Array.from({ length: 11 }, (_, i) => `<line x1="${100 * (i + 1)}" y1="0" x2="${100 * (i + 1)}" y2="${H}"/>`).join('') +
    Array.from({ length: 5 }, (_, i) => `<line x1="0" y1="${105 * (i + 1)}" x2="${W}" y2="${105 * (i + 1)}"/>`).join('') +
    `</g>` +
    `<rect x="0" y="0" width="${W}" height="10" fill="url(#acc)"/>` +
    // rack / chip motif
    `<g>` +
    `<rect x="880" y="150" width="220" height="330" rx="16" fill="none" stroke="#00d4ff" stroke-opacity="0.55" stroke-width="3"/>` +
    [0, 1, 2, 3].map((r) =>
      `<rect x="904" y="${178 + r * 78}" width="172" height="52" rx="8" fill="none" stroke="#00ff88" stroke-opacity="0.6" stroke-width="2"/>` +
      `<circle cx="922" cy="${204 + r * 78}" r="6" fill="#00ff88" fill-opacity="0.8"/>` +
      `<rect x="940" y="${198 + r * 78}" width="110" height="10" rx="5" fill="#c8d8e8" fill-opacity="0.35"/>`,
    ).join('') +
    `<circle cx="160" cy="430" r="10" fill="#00d4ff"/>` +
    `<circle cx="880" cy="315" r="10" fill="#00d4ff"/>` +
    `<line x1="160" y1="430" x2="880" y2="315" stroke="#00d4ff" stroke-opacity="0.5" stroke-width="3" stroke-dasharray="14 10"/>` +
    `</g>` +
    `<text x="80" y="120" font-family="monospace" font-size="28" letter-spacing="6" fill="#00ff88">AIFAZI.NET</text>` +
    `<text x="78" y="220" font-family="sans-serif" font-size="72" font-weight="bold" fill="#eef6ff">${title}</text>` +
    (slug ? `<text x="80" y="280" font-family="monospace" font-size="30" fill="#6b8296">/hybrid-infra?diagram=${slug}</text>` : '') +
    `<g font-family="monospace" font-size="40" fill="#c8d8e8">` +
    `<rect x="80" y="360" width="300" height="110" rx="14" fill="none" stroke="#00ff88" stroke-opacity="0.6" stroke-width="2"/>` +
    `<text x="110" y="430">${nodes} NODES</text>` +
    `<rect x="410" y="360" width="300" height="110" rx="14" fill="none" stroke="#00d4ff" stroke-opacity="0.6" stroke-width="2"/>` +
    `<text x="440" y="430">${flows} FLOWS</text>` +
    `</g>` +
    `<text x="80" y="560" font-family="monospace" font-size="26" fill="#6b8296">Interactive infrastructure case study — open the live diagram</text>` +
    `</svg>`

  return new NextResponse(svg, {
    status: 200,
    headers: {
      'Content-Type': 'image/svg+xml',
      // Published diagrams are stable; browsers/CDNs may cache for an hour.
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  })
}
