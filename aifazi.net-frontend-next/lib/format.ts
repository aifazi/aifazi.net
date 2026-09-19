/**
 * lib/format.ts — shared currency + date/time formatters (UI/UX audit P0-5/P0-6).
 *
 * Centralises the `$`+toFixed(2) and toLocale* call sites so a future
 * currency/locale switch touches one file. Defaults keep USD + existing
 * visuals byte-identical.
 */

/** Format a monetary amount. Defaults keep the legacy `$12.34` look. */
export function formatPrice(
  amount: number | string | null | undefined,
  currency = 'USD',
  locale?: string,
): string {
  const n = typeof amount === 'string' ? parseFloat(amount) : Number(amount)
  const safe = Number.isFinite(n) ? (n as number) : 0
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(safe)
  } catch {
    // Unknown currency/locale — fall back to the legacy USD rendering.
    return `$${safe.toFixed(2)}`
  }
}

/** Absolute date-time with timezone abbreviation, e.g. `Mar 4, 2026, 02:30 PM GST`. */
export function formatDateTime(
  value: string | number | Date | null | undefined,
  locale?: string,
): string {
  if (!value) return ''
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  try {
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    }).format(d)
  } catch {
    return d.toLocaleString()
  }
}

/** Short date, e.g. `Mar 4, 2026`. */
export function formatDate(
  value: string | number | Date | null | undefined,
  locale?: string,
): string {
  if (!value) return ''
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  try {
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(d)
  } catch {
    return d.toLocaleDateString()
  }
}
