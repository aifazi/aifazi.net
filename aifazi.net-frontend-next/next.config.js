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

  // Security headers — hardening (CSP is emitted by proxy.ts with a nonce)
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // Prevent MIME-type sniffing
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Prevent clickjacking
          { key: 'X-Frame-Options', value: 'DENY' },
          // Stop referrer leaking to external sites
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Permissions policy — restrict powerful browser APIs
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=(), payment=()' },
          // Content-Security-Policy is NOT set here. Next.js emits build-specific
          // inline hydration scripts whose hashes can't be known ahead of time, so a
          // static script-src silently blocked hydration. It is now emitted by
          // proxy.ts with a per-request nonce (Next.js tags its inline scripts via
          // the `x-nonce` request header). A duplicate CSP here would intersect with
          // the nonce'd one and re-block the inline scripts.
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
