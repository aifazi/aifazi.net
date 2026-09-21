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

// ── Contacts ───────────────────────────────────────────────────────────────

export async function fetchContacts(addressBookUrl?: string): Promise<CardDAVContact[]> {
  const client = await createClient()
  await client.login()

  let books: CardDAVAddressBook[]
  if (addressBookUrl) {
    books = [{ url: addressBookUrl, name: 'Contacts' }]
  } else {
    books = await fetchAddressBooks()
  }

  const allContacts: CardDAVContact[] = []
  for (const book of books) {
    try {
      const objects = await client.fetchVCards({ addressBook: { url: book.url } })
      const contacts = objects
        .filter((obj) => obj.data)
        .map((obj) => parseVCard(obj.data!, book.url))
        .filter((c): c is CardDAVContact => c !== null)
      allContacts.push(...contacts)
    } catch {
      // Skip address books we can't read
    }
  }
  return allContacts.sort((a, b) => a.displayName.localeCompare(b.displayName))
}

export async function searchContacts(query: string): Promise<CardDAVContact[]> {
  const contacts = await fetchContacts()
  const q = query.toLowerCase()
  return contacts.filter(
    (c) =>
      c.displayName.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.phone?.includes(q) ||
      c.organization?.toLowerCase().includes(q),
  )
}

export async function createContact(
  addressBookUrl: string,
  contact: Partial<CardDAVContact>,
): Promise<string> {
  const client = await createClient()
  await client.login()

  const _randBytes = crypto.getRandomValues(new Uint8Array(16))
  const _randHex = Array.from(_randBytes, (b) => b.toString(16).padStart(2, '0')).join('')
  const uid = contact.uid || `${Date.now()}-${_randHex}@aifazi.net`
  const vcard = buildVCard({ ...contact, uid })

  const result = await client.createVCard({
    addressBook: { url: addressBookUrl },
    vCardString: vcard,
    filename: `${uid}.vcf`,
  })

  return result.url || uid
}

export async function updateContact(
  contactUrl: string,
  contact: Partial<CardDAVContact>,
  etag?: string,
): Promise<void> {
  const client = await createClient()
  await client.login()

  const uid = contact.uid || contactUrl.split('/').pop()?.replace('.vcf', '') || `${Date.now()}@aifazi.net`
  const vcard = buildVCard({ ...contact, uid })

  await client.updateVCard({
    vCard: {
      url: contactUrl,
      data: vcard,
      etag: etag || '',
    },
  })
}

export async function deleteContact(contactUrl: string): Promise<void> {
  const client = await createClient()
  await client.login()
  await client.deleteVCard({ vCard: { url: contactUrl, data: '', etag: '' } })
}

// ── VCard Parsing ──────────────────────────────────────────────────────────

function parseVCard(vcardData: string, addressBookUrl: string): CardDAVContact | null {
  const uid = extractVCardProp(vcardData, 'UID') || `${Date.now()}@aifazi.net`
  const displayName = extractVCardProp(vcardData, 'FN') || extractVCardProp(vcardData, 'N') || 'Unknown'
  const email = extractVCardProp(vcardData, 'EMAIL')
  const phone = extractVCardProp(vcardData, 'TEL')
  const org = extractVCardProp(vcardData, 'ORG')
  const title = extractVCardProp(vcardData, 'TITLE')
  const note = extractVCardProp(vcardData, 'NOTE')

  // Parse N property for first/last name
  const nValue = extractVCardProp(vcardData, 'N')
  let firstName: string | undefined
  let lastName: string | undefined
  if (nValue) {
    const parts = nValue.split(';')
    lastName = parts[0] || undefined
    firstName = parts[1] || undefined
  }

  // Extract photo (base64)
  let photo: string | undefined
  const photoMatch = vcardData.match(/PHOTO[^:]*:([A-Za-z0-9+/=\s]+)/)
  if (photoMatch) {
    photo = photoMatch[1].replace(/\s/g, '')
  }

  return {
    uid,
    displayName,
    firstName,
    lastName,
    email: email || undefined,
    phone: phone || undefined,
    organization: org?.split(';')[0]?.trim() || undefined,
    title: title || undefined,
    note: note || undefined,
    photo,
    addressBookUrl,
  }
}

function extractVCardProp(vcard: string, propName: string): string | null {
  // Handle multi-line values (lines starting with space/tab)
  const lines = vcard.replace(/\r\n[ \t]/g, '').split(/\r?\n/)
  for (const line of lines) {
    const regex = new RegExp(`^${propName}(?:;[^:]*?)?:(.+)$`, 'i')
    const match = regex.exec(line)
    if (match) return match[1].trim()
  }
  return null
}

// ── VCard Building ─────────────────────────────────────────────────────────

function buildVCard(contact: Partial<CardDAVContact> & { uid: string }): string {
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `UID:${contact.uid}`,
  ]

  const firstName = contact.firstName || contact.displayName?.split(' ')[0] || ''
  const lastName = contact.lastName || contact.displayName?.split(' ').slice(1).join(' ') || ''
  lines.push(`N:${lastName};${firstName};;`)
  lines.push(`FN:${contact.displayName || `${firstName} ${lastName}`.trim()}`)

  if (contact.email) lines.push(`EMAIL;TYPE=INTERNET:${contact.email}`)
  if (contact.phone) lines.push(`TEL;TYPE=CELL:${contact.phone}`)
  if (contact.organization) lines.push(`ORG:${contact.organization}`)
  if (contact.title) lines.push(`TITLE:${contact.title}`)
  if (contact.note) lines.push(`NOTE:${contact.note.replace(/\n/g, '\\n')}`)
  if (contact.photo) lines.push(`PHOTO;ENCODING=b;TYPE=JPEG:${contact.photo}`)

  lines.push(`REV:${new Date().toISOString()}`)
  lines.push('END:VCARD')
  return lines.join('\r\n')
}
