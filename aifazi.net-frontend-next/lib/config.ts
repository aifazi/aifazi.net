/**
 * lib/config.ts — env-driven deployment URLs.
 *
 * Every hardcoded deployment domain (site, API, CDN, subdomains) lives here.
 * Defaults keep the production aifazi.net deployment working with zero env
 * vars; a fresh clone can override every value via NEXT_PUBLIC_* env vars so
 * the whole stack runs on its own domain(s) without touching code.
 *
 * All values are NEXT_PUBLIC_* so they are inlined at build time and work in
 * client components, server components, middleware and next.config.js alike.
 */

function clean(v?: string): string {
  return (v || '').trim().replace(/\/+$/, '')
}

/** Public site root (no trailing slash). */
export const SITE_URL = clean(process.env.NEXT_PUBLIC_SITE_URL) || 'https://aifazi.net'

/** Backend API origin (no trailing slash). */
export const API_URL = clean(process.env.NEXT_PUBLIC_API_URL) || 'https://api.aifazi.net'

/** CDN origin served by the built-in /cdn proxy (no trailing slash). */
export const CDN_URL = clean(process.env.NEXT_PUBLIC_CDN_URL) || 'https://cdn.aifazi.net'

/** Subdomain origins — default to the production subdomains; on a single-domain
 *  deploy set each one to your own site root (e.g. SITE_URL) and the middleware
 *  subdomain routing simply disables itself. */
export const STORE_URL = clean(process.env.NEXT_PUBLIC_STORE_URL) || 'https://store.aifazi.net'
export const FIVEM_URL = clean(process.env.NEXT_PUBLIC_FIVEM_URL) || 'https://fivem.aifazi.net'
export const STATUS_URL = clean(process.env.NEXT_PUBLIC_STATUS_URL) || 'https://status.aifazi.net'
export const DISCORD_URL = clean(process.env.NEXT_PUBLIC_DISCORD_URL) || 'https://discord.aifazi.net'
export const ADMIN_URL = clean(process.env.NEXT_PUBLIC_ADMIN_URL) || 'https://admin.aifazi.net'
export const TXADMIN_URL = clean(process.env.NEXT_PUBLIC_TXADMIN_URL) || 'https://txadmin.aifazi.net'

/** FiveM game-server connect address (IP:port or hostname), shown on the
 *  server status page and copy button. */
export const FIVEM_CONNECT = clean(process.env.NEXT_PUBLIC_FIVEM_CONNECT) || 'play.aifazi.net'

/** Extract the bare hostname from a URL ('' when invalid). */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

/** True for localhost / private loopback hosts — subdomain routing and wildcard
 *  CSP hosts must never apply to them. */
export function isLocalHost(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]'
}

/** True when a hostname is a real public domain (has at least one dot and is
 *  not an IP literal). */
export function isPublicDomain(host: string): boolean {
  if (!host || isLocalHost(host)) return false
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false
  return host.includes('.')
}

/** `https://*.<host>` when host is a public domain, else ''. */
export function wildcardHttps(host: string): string {
  return isPublicDomain(host) ? `https://*.${host}` : ''
}

/** `wss://*.<host>` when host is a public domain, else ''. */
export function wildcardWss(host: string): string {
  return isPublicDomain(host) ? `wss://*.${host}` : ''
}

/** `https://<host>` for a public domain, else ''. */
export function httpsOf(host: string): string {
  return isPublicDomain(host) ? `https://${host}` : ''
}

/** `wss://<host>` for a public domain, else ''. */
export function wssOf(host: string): string {
  return isPublicDomain(host) ? `wss://${host}` : ''
}