/**
 * src/lib/talk.ts — Nextcloud Talk API v4 client (rooms, chat, capabilities).
 *
 * Pinned to OCS API v4 (`conversation-v4`) + `signaling-v3` — verified live
 * against cloud.aifazi.net (NC 34.0.3 / Talk 24.0.5) 2026-10-03. Capability
 * checks at bootstrap keep us honest when a future NC major moves the API.
 *
 * Transport: cookie session from `ncSession` (app-password login) + OCS-
 * ApiHeader + the session requesttoken (OCS calls without it are 412
 * "CSRF check failed" on this server). A 401 triggers a single re-login
 * retry (single-flight, via ncSession).
 */
import { getNcSession, invalidateSession, NcNotConfiguredError, NcLoginError, type NcSession } from './ncSession'

export const TALK_API_VERSION = 4
export const OCS_CLIENT = 'aifazi-mobile/1.0'

export interface TalkRoom {
  token: string
  /** 1 = one-to-one, 2 = group, 3 = public, 4 = changed one-to-one. */
  type: number
  name: string
  description?: string
  slug?: string
  lastActivity: number
  readOnly: boolean
  /** A call is in progress in this room right now. */
  hasCall: boolean
  lastMessage?: TalkMessage | null
}

export interface TalkMessage {
  id: number
  actorType: string
  actorId: string
  actorDisplayName: string
  message: string
  /** Unix seconds. */
  timestamp: number
  messageType: 'comment' | 'change-note' | 'system'
  referenceId?: string
  isReply?: boolean
  replyTo?: number
  expirationTimestamp?: number
  systemMessage?: string
}

export interface TalkCapabilities {
  talkEnabled: boolean
  conversationV4: boolean
  signalingV3: boolean
  /** TURN relay hosts from the signaling config (may be empty when the server exposes none publicly). */
  turnServers: string[]
}

export class TalkApiError extends Error {
  readonly status: number
  constructor(status: number, detail?: string) {
    super(detail || `Talk API error (HTTP ${status})`)
    this.name = 'TalkApiError'
    this.status = status
  }
}

interface OcsEnvelope<T> {
  ocs: {
    meta?: { status?: string; statuscode?: number; message?: string }
    data?: { message?: string; status?: string; statuscode?: number; data?: T }
  }
}

type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{ status: number; ok: boolean; json: () => Promise<unknown> }>

/** Build the OCS URL with the session requesttoken (CSRF) attached. */
export function buildOcsUrl(serverUrl: string, ocsPath: string, requestToken: string | null): string {
  const url = new URL(`${serverUrl.replace(/\/+$/, '')}/${ocsPath}`)
  if (requestToken) url.searchParams.set('requesttoken', requestToken)
  return url.toString()
}

async function ocsRequest<T>(
  method: 'GET' | 'POST',
  ocsPath: string,
  session: NcSession,
  body?: Record<string, unknown>,
  doFetch: FetchLike = fetch as unknown as FetchLike,
): Promise<T> {
  const url = buildOcsUrl(session.serverUrl, ocsPath, session.requestToken)
  const res = await doFetch(url, {
    method,
    headers: {
      'OCS-ApiHeader': 'api-2',
      OCSClient: OCS_CLIENT,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(session.cookie ? { Cookie: session.cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const ocs = (await res.json().catch(() => null)) as OcsEnvelope<{ detail?: string }> | null
    const detail = ocs?.ocs?.data?.data?.detail
    throw new TalkApiError(res.status, res.status === 401 ? 'Session expired' : detail)
  }
  const json = (await res.json()) as OcsEnvelope<T>
  const inner = json?.ocs?.data
  if (inner && typeof inner.statuscode === 'number' && inner.statuscode >= 400) {
    const detail = (inner.data as { detail?: string } | undefined)?.detail
    throw new TalkApiError(inner.statuscode, detail || inner.message)
  }
  return (inner?.data ?? {}) as T
}

/**
 * Run an OCS call with the live session; on 401 the session is re-logged in
 * ONCE (single-flight) and the call retried.
 */
async function ocs<T>(method: 'GET' | 'POST', ocsPath: string, body?: Record<string, unknown>): Promise<T> {
  let s = await getNcSession()
  try {
    return await ocsRequest<T>(method, ocsPath, s, body)
  } catch (e) {
    if (e instanceof TalkApiError && e.status === 401) {
      invalidateSession()
      s = await getNcSession({ force: true })
      return await ocsRequest<T>(method, ocsPath, s, body)
    }
    throw e
  }
}

function talkOcsPath(subpath: string): string {
  return `ocs/v2.php/apps/spreed/api/v${TALK_API_VERSION}/${subpath.replace(/^\/+/, '')}`
}

/** List the user's rooms (room list for the Talk screen). */
export async function getRooms(): Promise<TalkRoom[]> {
  const data = await ocs<{ rooms?: unknown[] }>('GET', talkOcsPath('room'))
  const rooms = Array.isArray(data.rooms) ? data.rooms : []
  return rooms.map((r) => normalizeRoom(r as Record<string, unknown>))
}

function normalizeRoom(raw: Record<string, unknown>): TalkRoom {
  return {
    token: String(raw.token ?? ''),
    type: Number(raw.type ?? 2),
    name: String(raw.name ?? 'Unnamed room'),
    description: typeof raw.description === 'string' && raw.description ? raw.description : undefined,
    slug: typeof raw.slug === 'string' ? raw.slug : undefined,
    lastActivity: Number(raw['last-activity'] ?? raw.lastActivity ?? 0),
    readOnly: raw['read-only'] === true || raw.readOnly === true,
    hasCall: raw['has-call'] === true || raw.hasCall === true,
    lastMessage: raw['last-message'] ? normalizeMessage(raw['last-message'] as Record<string, unknown>) : null,
  }
}

function normalizeMessage(raw: Record<string, unknown>): TalkMessage {
  return {
    id: Number(raw.id ?? 0),
    actorType: String(raw.actorType ?? 'user'),
    actorId: String(raw.actorId ?? ''),
    actorDisplayName: String(raw.actorDisplayName ?? 'Unknown'),
    message: String(raw.message ?? ''),
    timestamp: Number(raw.timestamp ?? 0),
    messageType: (raw.messageType as TalkMessage['messageType']) || 'comment',
    referenceId: typeof raw.referenceId === 'string' ? raw.referenceId : undefined,
    isReply: raw.isReply === true,
    replyTo: typeof raw.replyTo === 'number' ? raw.replyTo : undefined,
    expirationTimestamp: typeof raw.expirationTimestamp === 'number' ? raw.expirationTimestamp : undefined,
    systemMessage: typeof raw.systemMessage === 'string' ? raw.systemMessage : undefined,
  }
}

/** Fetch the last `limit` chat messages of a room (oldest → newest). */
export async function getRoomMessages(roomToken: string, limit = 100): Promise<TalkMessage[]> {
  const data = await ocs<{ messages?: unknown[] }>(
    'GET',
    talkOcsPath(`room/${encodeURIComponent(roomToken)}/chat?lookIntoFuture=0&limit=${limit}`),
  )
  const messages = Array.isArray(data.messages) ? data.messages : []
  return messages
    .map((m) => normalizeMessage(m as Record<string, unknown>))
    .filter((m) => m.id > 0)
}

/**
 * Send a chat message. `referenceId` (client-chosen, e.g. a local id) comes
 * back on the created message so the UI can match optimistic outbox entries.
 */
export async function sendRoomMessage(
  roomToken: string,
  text: string,
  referenceId: string,
): Promise<TalkMessage> {
  const s = await getNcSession()
  const created = await ocs<Record<string, unknown>>(
    'POST',
    talkOcsPath(`room/${encodeURIComponent(roomToken)}/chat`),
    {
      message: text,
      actorType: 'user',
      actorId: s.username,
      replyTo: 0,
      referenceId,
    },
  )
  // The v4 POST echoes the created message when it carries an id; otherwise
  // fall back to a locally-stamped message (the poll will replace it with
  // the server copy, deduped by referenceId/id in the chat reducer).
  if (created && typeof created.id === 'number') {
    return normalizeMessage({ ...created, referenceId })
  }
  return {
    id: 0,
    actorType: 'user',
    actorId: s.username,
    actorDisplayName: s.username,
    message: text,
    timestamp: Math.floor(Date.now() / 1000),
    messageType: 'comment',
    referenceId,
  }
}

interface CapabilitiesShape {
  capabilities?: {
    spreed?: Record<string, unknown>[]
  }
}

/** Capability probe: Talk enabled? v4 conversation? signaling-v3 + TURN? */
export async function getTalkCapabilities(): Promise<TalkCapabilities> {
  const data = await ocs<CapabilitiesShape['capabilities']>('GET', 'ocs/v2.php/cloud/capabilities')
  const spreed = data?.spreed?.[0]
  if (!spreed) {
    return { talkEnabled: false, conversationV4: false, signalingV3: false, turnServers: [] }
  }
  const features: string[] = Array.isArray(spreed.features) ? spreed.features.map(String) : []
  return {
    talkEnabled: true,
    conversationV4: features.includes('conversation-v4'),
    signalingV3: features.includes('signaling-v3'),
    turnServers: extractTurnServers(spreed),
  }
}

/** TURN hosts live under signaling-v3 (public + secure backend arrays). */
export function extractTurnServers(spreed: Record<string, unknown>): string[] {
  const out = new Set<string>()
  const signaling = (spreed['signaling-v3'] ?? spreed.signaling_v3) as
    | { public?: Record<string, unknown>[]; secure?: Record<string, unknown>[] }
    | undefined
  for (const group of [signaling?.public, signaling?.secure]) {
    for (const entry of group ?? []) {
      const host = entry.host ?? entry.hostname ?? entry.server
      if (typeof host === 'string' && host) out.add(host)
      const turn = entry.turn as Record<string, unknown> | undefined
      if (turn) {
        for (const key of ['turns', 'turn']) {
          const urls = turn[key]
          if (Array.isArray(urls)) {
            for (const u of urls) {
              if (typeof u === 'string') out.add(u.replace(/^[a-z+]+:?\/?\/?/i, '').split(':')[0])
            }
          }
        }
      }
    }
  }
  return Array.from(out)
}

/**
 * M2.4 — how media will flow for the next call, tying Track T to Track V:
 * VPN tunnel up → direct P2P over the tunnel (TURN untouched); otherwise
 * the verified coturn relay.
 */
export function describeMediaPath(vpnConnected: boolean, turnServers: string[]): string {
  if (vpnConnected) return 'You’re on the VPN tunnel — media goes direct, no TURN'
  if (turnServers.length > 0) return `Off-tunnel: media relays via TURN (${turnServers[0]})`
  return 'Off-tunnel: media relays via TURN'
}

export { NcNotConfiguredError, NcLoginError }
