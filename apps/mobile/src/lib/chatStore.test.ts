import { describe, expect, it } from 'vitest'
import { chatReducer, initialChatState, visibleMessages, type ChatState } from './chatStore'
import type { TalkMessage } from './talk'

function msg(overrides: Partial<TalkMessage> & { id: number }): TalkMessage {
  return {
    actorType: 'user',
    actorId: 'u1',
    actorDisplayName: 'U1',
    message: `m${overrides.id}`,
    timestamp: overrides.id * 10,
    messageType: 'comment',
    ...overrides,
  }
}

describe('chatReducer — ordering & dedupe', () => {
  it('REPLACE sorts by timestamp, breaking ties by id', () => {
    const s = chatReducer(initialChatState, {
      type: 'REPLACE',
      messages: [msg({ id: 3 }), msg({ id: 1 }), msg({ id: 2, timestamp: 10 })],
      hasMore: false,
    })
    // msg(3) ts=30, msg(1) ts=10, msg(2) ts=10 (tie with id1 → id order 1,2)
    expect(s.messages.map((m) => m.id)).toEqual([1, 2, 3])
  })

  it('MERGE dedupes by id with the incoming copy winning, staying sorted', () => {
    const base: ChatState = {
      messages: [msg({ id: 1 }), msg({ id: 3 })],
      outbox: [],
      hasMore: false,
    }
    const s = chatReducer(base, { type: 'MERGE', messages: [msg({ id: 2 }), msg({ id: 1, message: 'edited' })] })
    expect(s.messages.map((m) => m.id)).toEqual([1, 2, 3])
    expect(s.messages.find((m) => m.id === 1)?.message).toBe('edited')
    expect(s.messages).toHaveLength(3)
  })

  it('MERGE is idempotent for repeated polls', () => {
    const incoming = [msg({ id: 1 }), msg({ id: 2 })]
    let s = chatReducer(initialChatState, { type: 'REPLACE', messages: incoming, hasMore: false })
    s = chatReducer(s, { type: 'MERGE', messages: incoming })
    s = chatReducer(s, { type: 'MERGE', messages: incoming })
    expect(s.messages).toHaveLength(2)
  })
})

describe('chatReducer — outbox (offline-safe queue)', () => {
  it('ENQUEUE adds once; duplicate localId is ignored', () => {
    const entry = { localId: 'loc-1', text: 'hi', queuedAt: 1000 }
    let s = chatReducer(initialChatState, { type: 'ENQUEUE', entry })
    s = chatReducer(s, { type: 'ENQUEUE', entry })
    expect(s.outbox).toHaveLength(1)
  })

  it('ACK with a server copy swaps the pending entry for the server message', () => {
    let s = chatReducer(initialChatState, { type: 'ENQUEUE', entry: { localId: 'loc-1', text: 'hi', queuedAt: 1000 } })
    // A poll already echoed the server copy of the same message
    s = chatReducer(s, { type: 'MERGE', messages: [msg({ id: 99, referenceId: 'loc-1', message: 'hi' })] })
    s = chatReducer(s, { type: 'ACK', localId: 'loc-1', serverMessage: msg({ id: 99, referenceId: 'loc-1', message: 'hi' }) })
    expect(s.outbox).toHaveLength(0)
    expect(s.messages.map((m) => m.id)).toEqual([99])
    expect(s.messages[0].message).toBe('hi')
  })

  it('ACK without an id keeps the entry pending (offline-safe)', () => {
    let s = chatReducer(initialChatState, { type: 'ENQUEUE', entry: { localId: 'loc-2', text: 'soon', queuedAt: 1000 } })
    s = chatReducer(s, { type: 'ACK', localId: 'loc-2', serverMessage: null })
    expect(s.outbox).toHaveLength(1)
    s = chatReducer(s, { type: 'ACK', localId: 'loc-2', serverMessage: msg({ id: 0 }) })
    expect(s.outbox).toHaveLength(1)
  })

  it('ACK drops the zero-id optimistic echo, keeping the server copy', () => {
    let s = chatReducer(initialChatState, {
      type: 'REPLACE',
      messages: [msg({ id: 0, referenceId: 'loc-3', message: 'echo' })],
      hasMore: false,
    })
    s = chatReducer(s, { type: 'ENQUEUE', entry: { localId: 'loc-3', text: 'echo', queuedAt: 1000 } })
    s = chatReducer(s, { type: 'ACK', localId: 'loc-3', serverMessage: msg({ id: 5, referenceId: 'loc-3', message: 'echo' }) })
    expect(s.outbox).toHaveLength(0)
    expect(s.messages.map((m) => m.id)).toEqual([5])
  })

  it('DROP removes a failed entry without touching messages', () => {
    let s = chatReducer(initialChatState, { type: 'ENQUEUE', entry: { localId: 'loc-9', text: 'gone', queuedAt: 1000 } })
    s = chatReducer(s, { type: 'DROP', localId: 'loc-9' })
    expect(s.outbox).toHaveLength(0)
    expect(s.messages).toHaveLength(0)
  })
})

describe('visibleMessages', () => {
  it('interleaves outbox entries chronologically with server messages', () => {
    const s: ChatState = {
      // server msg at ts 500 (→ 500_000 ms)
      messages: [msg({ id: 50, timestamp: 500 })],
      // outbox queued at 300_000 ms (before) and 700_000 ms (after)
      outbox: [
        { localId: 'a', text: 'early', queuedAt: 300_000 },
        { localId: 'b', text: 'late', queuedAt: 700_000 },
      ],
      hasMore: false,
    }
    const items = visibleMessages(s)
    expect(items).toHaveLength(3)
    expect('outbox' in items[0] && items[0].outbox.localId).toBe('a')
    expect('outbox' in items[1]).toBe(false)
    expect(items[1]).toMatchObject({ id: 50 })
    expect('outbox' in items[2] && items[2].outbox.localId).toBe('b')
  })

  it('keeps pure outbox and pure server states intact', () => {
    expect(visibleMessages(initialChatState)).toEqual([])
    const onlyServer: ChatState = { messages: [msg({ id: 1 })], outbox: [], hasMore: false }
    expect(visibleMessages(onlyServer)).toHaveLength(1)
  })
})
