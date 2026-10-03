/**
 * src/lib/chatStore.ts — pure chat state for the Talk room pane.
 *
 * Deliberately React-free so the tricky parts (ordering, dedupe by message
 * id, optimistic outbox) are unit-testable without a renderer. The room
 * screen wires this reducer to polling (focus + 15s while active).
 */
import type { TalkMessage } from './talk'

export interface OutboxEntry {
  /** Local client id (sent back to the server as referenceId). */
  localId: string
  text: string
  queuedAt: number
}

export interface ChatState {
  messages: TalkMessage[]
  outbox: OutboxEntry[]
  /** There is older history available (hasMore → scroll-up loads more). */
  hasMore: boolean
}

export const initialChatState: ChatState = {
  messages: [],
  outbox: [],
  hasMore: true,
}

export type ChatAction =
  | { type: 'REPLACE'; messages: TalkMessage[]; hasMore: boolean }
  | { type: 'MERGE'; messages: TalkMessage[] }
  | { type: 'ENQUEUE'; entry: OutboxEntry }
  | { type: 'ACK'; localId: string; serverMessage: TalkMessage | null }
  | { type: 'DROP'; localId: string }

/** Sort key: server timestamp, then id (stable total order, id-breaks ties). */
function sortKey(m: TalkMessage): [number, number] {
  return [m.timestamp || 0, m.id || 0]
}

function compareMessages(a: TalkMessage, b: TalkMessage): number {
  const ka = sortKey(a)
  const kb = sortKey(b)
  return (ka[0] - kb[0]) || (ka[1] - kb[1])
}

/** Union by message id — for a repeated id the NEWER object wins. */
function dedupeMerge(existing: TalkMessage[], incoming: TalkMessage[]): TalkMessage[] {
  const byId = new Map<number, TalkMessage>()
  for (const m of existing) byId.set(m.id, m)
  for (const m of incoming) byId.set(m.id, m)
  return Array.from(byId.values()).sort(compareMessages)
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'REPLACE':
      return {
        messages: [...action.messages].sort(compareMessages),
        outbox: state.outbox,
        hasMore: action.hasMore,
      }

    case 'MERGE':
      return {
        ...state,
        messages: dedupeMerge(state.messages, action.messages),
      }

    case 'ENQUEUE':
      if (state.outbox.some((o) => o.localId === action.entry.localId)) return state
      return {
        ...state,
        outbox: [...state.outbox, action.entry],
      }

    case 'ACK': {
      const entry = state.outbox.find((o) => o.localId === action.localId)
      if (!entry) return state
      if (!action.serverMessage || action.serverMessage.id <= 0) {
        // Server accepted but gave no id yet — keep the entry pending
        // until the next poll echoes it back (offline-safe).
        return state
      }
      const outbox = state.outbox.filter((o) => o.localId !== action.localId)
      // Replace any zero-id optimistic copy by referenceId with the server copy.
      const messages = dedupeMerge(
        state.messages.filter((m) => m.referenceId !== entry.localId || m.id > 0),
        [action.serverMessage],
      )
      return { ...state, outbox, messages }
    }

    case 'DROP':
      return { ...state, outbox: state.outbox.filter((o) => o.localId !== action.localId) }

    default:
      return state
  }
}

/**
 * The pane renders server messages + pending outbox entries (chronological).
 * Outbox entries sort by queue time against server timestamps.
 */
export function visibleMessages(state: ChatState): (TalkMessage | { outbox: OutboxEntry })[] {
  const out: (TalkMessage | { outbox: OutboxEntry })[] = []
  let mi = 0
  let oi = 0
  while (mi < state.messages.length && oi < state.outbox.length) {
    const m = state.messages[mi]
    const o = state.outbox[oi]
    const mTs = (m.timestamp || 0) * 1000
    if (mTs <= o.queuedAt) {
      out.push(m)
      mi++
    } else {
      out.push({ outbox: o })
      oi++
    }
  }
  while (mi < state.messages.length) out.push(state.messages[mi++])
  while (oi < state.outbox.length) out.push({ outbox: state.outbox[oi++] })
  return out
}
