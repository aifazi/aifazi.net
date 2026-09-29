/**
 * src/lib/carddav.ts — CardDAV client for Nextcloud Contacts integration.
 *
 * Uses the `tsdav` library to communicate with Nextcloud's CardDAV endpoint.
 * Credentials are shared with CalDAV (stored in expo-secure-store).
 *
 * Nextcloud CardDAV endpoint: https://cloud.aifazi.net/remote.php/dav/addressbooks/USERNAME/contacts/
 */
import { DAVClient } from 'tsdav'
import * as SecureStore from 'expo-secure-store'

const CALDAV_URL_KEY = 'aifazi_caldav_url'
const CALDAV_USER_KEY = 'aifazi_caldav_user'
const CALDAV_PASS_KEY = 'aifazi_caldav_pass'

export interface CardDAVContact {
  uid: string
  displayName: string
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  organization?: string
  title?: string
  note?: string
  photo?: string
  addressBookUrl: string
  vCardUrl?: string
  etag?: string
}

export interface CardDAVAddressBook {
  url: string
  name: string
  description?: string
  ctag?: string
}

/** tsdav types displayName as string | Record (localized map) — coerce to string. */
export function davDisplayName(
  value: string | Record<string, unknown> | undefined,
  fallback: string,
): string {
  if (typeof value === 'string' && value) return value
  if (value && typeof value === 'object') {
    for (const v of Object.values(value)) {
      if (typeof v === 'string' && v) return v
    }
  }
  return fallback
}

// ── Client Factory ─────────────────────────────────────────────────────────

async function createClient(): Promise<DAVClient> {
  const serverUrl = await SecureStore.getItemAsync(CALDAV_URL_KEY)
  const username = await SecureStore.getItemAsync(CALDAV_USER_KEY)
  const password = await SecureStore.getItemAsync(CALDAV_PASS_KEY)
  if (!serverUrl || !username || !password) {
    throw new Error('CardDAV not configured. Please add your Nextcloud account first.')
  }
  return new DAVClient({
    serverUrl,
    credentials: { username, password },
    authMethod: 'Basic',
    defaultAccountType: 'carddav',
  })
}

// ── Address Books ──────────────────────────────────────────────────────────

export async function fetchAddressBooks(): Promise<CardDAVAddressBook[]> {
  const client = await createClient()
  await client.login()
  const books = await client.fetchAddressBooks()
  return books.map((book) => ({
    url: book.url,
    name: davDisplayName(book.displayName, book.url.split('/').filter(Boolean).pop() || 'Contacts'),
    description: book.description || undefined,
    ctag: book.ctag || undefined,
  }))
}
// NOTE: contact CRUD (fetch/search/create/update/delete + vCard helpers) was
// removed — zero importers and no contacts UI. Restorable from git history.
