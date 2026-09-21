/**
 * src/lib/caldav.ts — CalDAV client for Nextcloud Calendar integration.
 *
 * Uses the `tsdav` library to communicate with Nextcloud's CalDAV endpoint.
 * Credentials are stored in expo-secure-store (same pattern as existing auth).
 *
 * Nextcloud CalDAV endpoint: https://cloud.aifazi.net/remote.php/dav/calendars/USERNAME/
 */
import { DAVClient } from 'tsdav'
import * as SecureStore from 'expo-secure-store'

const CALDAV_URL_KEY = 'aifazi_caldav_url'
const CALDAV_USER_KEY = 'aifazi_caldav_user'
const CALDAV_PASS_KEY = 'aifazi_caldav_pass'

export interface CalDAVCredentials {
  serverUrl: string
  username: string
  password: string
}

export interface CalDAVEvent {
  uid: string
  summary: string
  description?: string
  location?: string
  start: Date
  end: Date
  allDay: boolean
  calendarId: string
  calendarName?: string
  recurrence?: string
  attendees?: string[]
  organizer?: string
  status?: 'confirmed' | 'tentative' | 'cancelled'
  lastModified?: Date
  etag?: string
}

export interface CalDAVCalendar {
  url: string
  name: string
  description?: string
  color?: string
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

// ── Credential Management ──────────────────────────────────────────────────

export async function saveCalDAVCredentials(creds: CalDAVCredentials): Promise<void> {
  await SecureStore.setItemAsync(CALDAV_URL_KEY, creds.serverUrl)
  await SecureStore.setItemAsync(CALDAV_USER_KEY, creds.username)
  await SecureStore.setItemAsync(CALDAV_PASS_KEY, creds.password)
}

export async function getCalDAVCredentials(): Promise<CalDAVCredentials | null> {
  const serverUrl = await SecureStore.getItemAsync(CALDAV_URL_KEY)
  const username = await SecureStore.getItemAsync(CALDAV_USER_KEY)
  const password = await SecureStore.getItemAsync(CALDAV_PASS_KEY)
  if (!serverUrl || !username || !password) return null
  return { serverUrl, username, password }
}

export async function clearCalDAVCredentials(): Promise<void> {
  await SecureStore.deleteItemAsync(CALDAV_URL_KEY)
  await SecureStore.deleteItemAsync(CALDAV_USER_KEY)
  await SecureStore.deleteItemAsync(CALDAV_PASS_KEY)
}

export async function isCalDAVConfigured(): Promise<boolean> {
  const creds = await getCalDAVCredentials()
  return creds !== null
}

// ── Client Factory ─────────────────────────────────────────────────────────

async function createClient(): Promise<DAVClient> {
  const creds = await getCalDAVCredentials()
  if (!creds) throw new Error('CalDAV not configured. Please add your Nextcloud account first.')
  return new DAVClient({
    serverUrl: creds.serverUrl,
    credentials: {
      username: creds.username,
      password: creds.password,
    },
    authMethod: 'Basic',
    defaultAccountType: 'caldav',
  })
}

// ── Calendars ──────────────────────────────────────────────────────────────

export async function fetchCalendars(): Promise<CalDAVCalendar[]> {
  const client = await createClient()
  await client.login()
  const calendars = await client.fetchCalendars()
  return calendars.map((cal) => ({
    url: cal.url,
    name: davDisplayName(cal.displayName, cal.url.split('/').filter(Boolean).pop() || 'Calendar'),
    description: cal.description || undefined,
    color: cal.calendarColor || undefined,
    ctag: cal.ctag || undefined,
  }))
}

// ── Events ─────────────────────────────────────────────────────────────────

export async function fetchEvents(calendarUrl: string, since?: Date): Promise<CalDAVEvent[]> {
  const client = await createClient()
  await client.login()
  const calObjects = await client.fetchCalendarObjects({ calendar: { url: calendarUrl } })

  return calObjects
    .filter((obj) => obj.data && obj.data.includes('VEVENT'))
    .map((obj) => parseVCalEvent(obj.data!, calendarUrl))
    .filter((e): e is CalDAVEvent => e !== null)
}

export async function fetchAllEvents(): Promise<CalDAVEvent[]> {
  const calendars = await fetchCalendars()
  const allEvents: CalDAVEvent[] = []
  for (const cal of calendars) {
    try {
      const events = await fetchEvents(cal.url)
      events.forEach((e) => { e.calendarName = cal.name })
      allEvents.push(...events)
    } catch {
      // Skip calendars we can't read
    }
  }
  return allEvents.sort((a, b) => a.start.getTime() - b.start.getTime())
}

export async function createEvent(calendarUrl: string, event: Partial<CalDAVEvent>): Promise<string> {
  const client = await createClient()
  await client.login()

  const _randBytes = crypto.getRandomValues(new Uint8Array(16))
  const _randHex = Array.from(_randBytes, (b) => b.toString(16).padStart(2, '0')).join('')
  const uid = event.uid || `${Date.now()}-${_randHex}@aifazi.net`
  const ics = buildVCalendarEvent({ ...event, uid })

  const result = await client.createCalendarObject({
    calendar: { url: calendarUrl },
    filename: `${uid}.ics`,
    iCalString: ics,
  })

  return result.url || uid
}

export async function updateEvent(
  calendarUrl: string,
  eventUrl: string,
  event: Partial<CalDAVEvent>,
  etag?: string,
): Promise<void> {
  const client = await createClient()
  await client.login()

  const uid = event.uid || eventUrl.split('/').pop()?.replace('.ics', '') || `${Date.now()}@aifazi.net`
  const ics = buildVCalendarEvent({ ...event, uid })

  await client.updateCalendarObject({
    calendarObject: {
      url: eventUrl,
      data: ics,
      etag: etag || '',
    },
  })
}

export async function deleteEvent(eventUrl: string): Promise<void> {
  const client = await createClient()
  await client.login()
  await client.deleteCalendarObject({ calendarObject: { url: eventUrl, data: '', etag: '' } })
}

// ── VCalendar Parsing ──────────────────────────────────────────────────────

function parseVCalEvent(icsData: string, calendarUrl: string): CalDAVEvent | null {
  const vevent = extractBlock(icsData, 'VEVENT')
  if (!vevent) return null

  const uid = extractProperty(vevent, 'UID') || `${Date.now()}@aifazi.net`
  const summary = extractProperty(vevent, 'SUMMARY') || '(No title)'
  const description = extractProperty(vevent, 'DESCRIPTION')
  const location = extractProperty(vevent, 'LOCATION')
  const dtstart = extractProperty(vevent, 'DTSTART')
  const dtend = extractProperty(vevent, 'DTEND')
  const rrule = extractProperty(vevent, 'RRULE')
  const status = extractProperty(vevent, 'STATUS')
  const lastModified = extractProperty(vevent, 'LAST-MODIFIED')

  const allDay = dtstart?.length === 8
  const start = parseICalDate(dtstart)
  const end = dtend ? parseICalDate(dtend) : new Date(start.getTime() + 3600000)

  return {
    uid,
    summary,
    description: description?.replace(/\\n/g, '\n').replace(/\\,/g, ',') || undefined,
    location: location?.replace(/\\,/g, ',') || undefined,
    start,
    end,
    allDay,
    calendarId: calendarUrl,
    recurrence: rrule || undefined,
    status: (status?.toLowerCase() as CalDAVEvent['status']) || 'confirmed',
    lastModified: lastModified ? new Date(lastModified) : undefined,
  }
}

function extractBlock(ics: string, blockName: string): string | null {
  const startPattern = new RegExp(`BEGIN:${blockName}`, 'i')
  const endPattern = new RegExp(`END:${blockName}`, 'i')
  const startMatch = startPattern.exec(ics)
  const endMatch = endPattern.exec(ics)
  if (!startMatch || !endMatch) return null
  return ics.slice(startMatch.index, endMatch.index + endMatch[0].length)
}

function extractProperty(block: string, propName: string): string | null {
  // Match both "PROP:value" and "PROP;PARAMS:value"
  const regex = new RegExp(`^${propName}(?:;[^:]*)?:(.+)$`, 'm')
  const match = regex.exec(block)
  return match ? match[1].trim() : null
}

function parseICalDate(dateStr?: string | null): Date {
  if (!dateStr) return new Date()
  // YYYYMMDD or YYYYMMDDTHHMMSS or YYYYMMDDTHHMMSSZ
  const clean = dateStr.replace(/[^0-9T]/g, '')
  if (clean.length === 8) {
    return new Date(`${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}`)
  }
  if (clean.length >= 15) {
    const y = clean.slice(0, 4), m = clean.slice(4, 6), d = clean.slice(6, 8)
    const h = clean.slice(9, 11), mi = clean.slice(11, 13), s = clean.slice(13, 15)
    const utc = clean.endsWith('Z')
    if (utc) return new Date(Date.UTC(+y, +m - 1, +d, +h, +mi, +s))
    return new Date(+y, +m - 1, +d, +h, +mi, +s)
  }
  return new Date(dateStr)
}

// ── VCalendar Building ─────────────────────────────────────────────────────

function buildVCalendarEvent(event: Partial<CalDAVEvent> & { uid: string }): string {
  const now = formatICalDate(new Date())
  const dtstart = formatICalDate(event.start || new Date(), event.allDay)
  const dtend = formatICalDate(event.end || new Date(Date.now() + 3600000), event.allDay)

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//aifazi.net//Mobile//EN',
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `DTSTAMP:${now}`,
    `DTSTART${event.allDay ? ';VALUE=DATE' : ''}:${dtstart}`,
    `DTEND${event.allDay ? ';VALUE=DATE' : ''}:${dtend}`,
    `SUMMARY:${escapeICal(event.summary || '')}`,
  ]

  if (event.description) lines.push(`DESCRIPTION:${escapeICal(event.description)}`)
  if (event.location) lines.push(`LOCATION:${escapeICal(event.location)}`)
  if (event.recurrence) lines.push(`RRULE:${event.recurrence}`)
  if (event.status) lines.push(`STATUS:${event.status.toUpperCase()}`)

  lines.push('END:VEVENT', 'END:VCALENDAR')
  return lines.join('\r\n')
}

function formatICalDate(date: Date, allDay?: boolean): string {
  if (allDay) {
    return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`
  }
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}${String(date.getSeconds()).padStart(2, '0')}`
}

function escapeICal(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}
