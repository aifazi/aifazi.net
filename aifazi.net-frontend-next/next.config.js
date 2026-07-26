const path = require('path')

function backendApiBase() {
  const isVercelProd = !!process.env.VERCEL && process.env.NODE_ENV !== 'development'
  if (process.env.INTERNAL_API_URL) return process.env.INTERNAL_API_URL
  if (!isVercelProd) return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
  if (process.env.NEXT_PUBLIC_API_URL && !/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(process.env.NEXT_PUBLIC_API_URL)) {
    return process.env.NEXT_PUBLIC_API_URL
  }
  return 'https://api.aifazi.net'
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  outputFileTracingRoot: __dirname,

  // ── Performance ────────────────────────────────────────────
  compress: true,
  poweredByHeader: false,
  reactStrictMode: process.env.NODE_ENV === 'development',
  productionBrowserSourceMaps: false,

  // ── Webpack ────────────────────────────────────────────────
  // Vercel runs `npm run build`, which passes `--webpack`. The empty
  // Turbopack config prevents plain `next build` from failing if it is used.
  turbopack: {},

  webpack: (config, { isServer }) => {
    config.resolve.alias['@'] = path.resolve(__dirname)
    // Drop Sentry traces from client bundle to save ~40KB
    if (!isServer) {
      config.resolve.alias['@sentry/tracing'] = false
    }
    return config
  },

  // Allow images from Supabase Storage and external sources
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co' },
      { protocol: 'https', hostname: 'api.dicebear.com' },
      { protocol: 'https', hostname: 'res.cloudinary.com' },
      { protocol: 'https', hostname: 'cdn.aifazi.net' },
      { protocol: 'https', hostname: '**.aifazi.net' },
    ],
  },

  // Security headers — CSP + hardening
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // Prevent MIME-type sniffing
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Prevent clickjacking
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          // Stop referrer leaking to external sites
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Permissions policy — restrict powerful browser APIs
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=(), payment=()' },
          // Content Security Policy — tightened for aifazi.net
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              // Scripts: self + inline (needed for Next.js hydration) + trusted CDNs
              "script-src 'self' 'unsafe-inline' https://cdn.lordicon.com https://cdnjs.cloudflare.com https://*.supabase.co",
              // Styles: self + inline (CSS-in-JS)
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              // Fonts
              "font-src 'self' https://fonts.gstatic.com",
              // Images: self + CDN + Supabase + data URIs (avatars) + external avatar sources
              "img-src 'self' data: blob: https://cdn.aifazi.net https://*.supabase.co https://res.cloudinary.com https://api.dicebear.com https://*.aifazi.net https://*.imgur.com https://i.imgur.com https://*.cloudinary.com https://*.r2.cloudflarestorage.com https://*.amazonaws.com https://*.unsplash.com https://*.googleusercontent.com https://*.githubusercontent.com https:",
              // API + WebSocket connections
              "connect-src 'self' http://localhost:8000 http://127.0.0.1:8000 https://api.aifazi.net https://*.supabase.co wss://*.supabase.co https://cdn.aifazi.net https://*.ingest.sentry.io https://fonts.googleapis.com https://fonts.gstatic.com https://ipwho.is https://ipapi.co https://ipwhois.app https://api64.ipify.org https://*.livekit.cloud wss://*.livekit.cloud",
              // Media — allow any HTTPS for chat audio/video file previews
              "media-src 'self' https://cdn.aifazi.net https:",
              // Frames — YouTube + Vimeo embeds for chat media previews
              "frame-src 'self' https://www.youtube.com https://player.vimeo.com",
              // Workers (for CometChat etc.)
              "worker-src 'self' blob:",
            ].join('; '),
          },
        ],
      },
    ]
  },

  // #21 — All API proxying is done here (not in vercel.json) so requests
  // always pass through Next.js Edge Middleware first.  Middleware injects
  // X-Internal-Token before the request reaches FastAPI; any rewrite defined
  // in vercel.json would bypass middleware entirely and skip that injection.
  async rewrites() {
    const apiBase = backendApiBase()
    return [
      // Proxy all API calls to the FastAPI backend —
      // EXCEPT when the request comes from cdn.aifazi.net, which is handled
      // internally by app/api/cdn/[...path]/route.ts (Cloudinary proxy).
      // Without this exclusion, cdn.aifazi.net requests get rewritten to
      // /api/cdn/... by middleware, then forwarded to FastAPI which blocks them.
      {
        source: '/api/:path*',
        destination: `${apiBase}/api/:path*`,
        missing: [{ type: 'host', value: 'cdn.aifazi.net' }],
      },
      // Proxy sitemap
      {
        source: '/sitemap.xml',
        destination: `${apiBase}/sitemap.xml`,
      },
      // CDN proxy — /cdn/... is handled by the built-in Next.js route
      // app/api/cdn/[...path]/route.ts which proxies to Cloudinary.
      // No external dependency on cdn.aifazi.net or Cloudflare Worker.
      {
        source: '/cdn/:path*',
        destination: '/api/cdn/:path*',
      },
    ]
  },

  // Expose build ID for cache-busting
  env: {
    BUILD_ID: process.env.VERCEL_GIT_COMMIT_SHA || Date.now().toString(),
  },
}

module.exports = nextConfig
