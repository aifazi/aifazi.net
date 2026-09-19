/**
 * Single source of truth for the backend API base URL.
 *
 * Override with EXPO_PUBLIC_API_URL in env; defaults to production.
 * Import this instead of hardcoding the URL in lib modules.
 */
export const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'https://api.aifazi.net'
