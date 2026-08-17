// chat-contract.ts — canonical chat/call contract shared by the Next.js web
// app (aifazi.net-frontend-next) and the Expo mobile app (apps/mobile).
//
// The FastAPI backend (aifazi.net-backend-fastapi) implements the same contract
// on the wire; this module is the single source of truth for the TypeScript
// clients. Keep it dependency-free.

export const ENCRYPTED_PREFIX = 'ENC:'

// ── Message types ───────────────────────────────────────────────────────────
// The backend whitelist is DMMessageBody in routers/chat_dm.py — keep in sync.
export const DM_MESSAGE_TYPES = ['text', 'image', 'file', 'voice', 'call'] as const
export type DMMessageType = (typeof DM_MESSAGE_TYPES)[number]

export interface DMMessage {
  id: string
  thread_id: string
  sender: string
  content: string
  type: DMMessageType
  created_at: string
  edited?: boolean
  reactions?: Record<string, string[]>
  reply_to_id?: string | null
}

// ── Call invites (type: 'call' messages) ────────────────────────────────────
// The backend writes this JSON into dm_messages.content when a call invite is
// sent (POST /chat/dm/threads/{id}/livekit/invite).
export interface CallInviteContent {
  video: boolean
  caller: string
  at: string
}

// Payload carried in the Expo push notification data for a call invite.
export interface CallInvitePushData {
  call: boolean
  mode: 'dm'
  thread_id: string
  peer: string
}

export function parseCallInvite(content: string | null | undefined): CallInviteContent | null {
  if (typeof content !== 'string' || !content) return null
  try {
    const v = JSON.parse(content)
    if (v && typeof v === 'object' && typeof v.caller === 'string') {
      return { video: !!v.video, caller: v.caller, at: typeof v.at === 'string' ? v.at : '' }
    }
  } catch {
    // not a call invite
  }
  return null
}

export function buildCallInvite(caller: string, video = false): string {
  return JSON.stringify({ video, caller, at: new Date().toISOString() })
}

// ── LiveKit paths & helpers (both apps talk to the same backend) ────────────
export function dmRoomName(threadId: string): string {
  return `dm-${threadId}`
}

export function dmLiveKitTokenPath(threadId: string): string {
  return `/chat/dm/threads/${encodeURIComponent(threadId)}/livekit/token`
}

export function dmLiveKitInvitePath(threadId: string): string {
  return `/chat/dm/threads/${encodeURIComponent(threadId)}/livekit/invite`
}

export function roomLiveKitTokenPath(roomId: string): string {
  return `/chat/livekit/token?room_id=${encodeURIComponent(roomId)}`
}

export function callInvitePushData(threadId: string, peer: string): CallInvitePushData {
  return { call: true, mode: 'dm', thread_id: threadId, peer }
}

// ── Typing presence (what the peer is doing right now) ───────────────────────
// `activity` describes what a user is doing in a chat: typing a message,
// attaching an image/file, recording a voice note, or sending a video. Carried
// in Supabase Realtime broadcast payloads and in the REST typing heartbeats
// (POST/GET .../typing), which both the web and mobile apps share.
export const TYPING_ACTIVITIES = ['typing', 'image', 'file', 'voice', 'video'] as const
export type TypingActivityKind = (typeof TYPING_ACTIVITIES)[number]

export interface TypingActivity {
  username: string
  activity: TypingActivityKind
}

/** Guard: coerce raw typing entries (string or {username, activity}) to objects. */
export function normalizeTypingActivity(raw: unknown): TypingActivity {
  if (raw && typeof raw === 'object' && typeof (raw as TypingActivity).username === 'string') {
    const a = (raw as TypingActivity).activity
    return {
      username: (raw as TypingActivity).username,
      activity: (TYPING_ACTIVITIES as readonly string[]).includes(a) ? a : 'typing',
    }
  }
  if (typeof raw === 'string') return { username: raw, activity: 'typing' }
  return { username: 'Someone', activity: 'typing' }
}

/** Human label: "alice is typing…", "bob is sending an image…", etc. */
export function typingActivityLabel(username: string, activity?: string | null): string {
  const name = username || 'Someone'
  switch (activity) {
    case 'image':
      return `${name} is sending an image…`
    case 'file':
      return `${name} is sending a file…`
    case 'voice':
      return `${name} is recording a voice note…`
    case 'video':
      return `${name} is sending a video…`
    default:
      return `${name} is typing…`
  }
}

/** Compact multi-user summary for the indicator line. */
export function typingSummary(users: TypingActivity[], max = 2): string {
  if (!users.length) return ''
  if (users.length === 1) return typingActivityLabel(users[0].username, users[0].activity)
  const names = users
    .slice(0, max)
    .map((u) => u.username)
    .join(', ')
  const extra = users.length > max ? ` +${users.length - max}` : ''
  return `${names}${extra} are typing…`
}

// ── Error normalization ─────────────────────────────────────────────────────
export function apiErrorMessage(e: unknown): string {
  const err = e as { response?: { data?: { detail?: string } }; message?: string }
  return err?.response?.data?.detail || err?.message || 'Request failed'
}