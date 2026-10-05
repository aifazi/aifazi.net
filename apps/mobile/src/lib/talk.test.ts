import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  buildOcsUrl,
  extractTurnServers,
  describeMediaPath,
  getRooms,
  getRoomMessages,
  sendRoomMessage,
  getTalkCapabilities,
  TalkApiError,
} from './talk'
import { getNcSession, invalidateSession, type NcSession } from './ncSession'

// Full factory mock (no importActual): pulling the real ncSession would drag
// caldav → @tsdav → react-native into the node test env, where it can't parse.
vi.mock('./ncSession', () => ({
  getNcSession: vi.fn(),
  invalidateSession: vi.fn(),
  NcNotConfiguredError: class NcNotConfiguredError extends Error {},
  NcLoginError: class NcLoginError extends Error {},
}))

const SESSION: NcSession = {
  serverUrl: 'https://cloud.aifazi.net',
  username: 'tanveer',
  cookie: 'nc_sess=sess1',
  cookieMode: 'manual',
  requestToken: 'TOK',
}

function ocsEnvelope(data: unknown, statuscode = 200) {
  return {
    ocs: {
      meta: { status: 'ok', statuscode: 200, message: 'OK' },
      data: { message: '', status: 'success', statuscode, data },
    },
  }
}

function mockFetchOnce(body: unknown, status = 200) {
  return vi.fn(async () => ({
    status,
    ok: status < 400,
    json: async () => (status < 400 ? body : ocsEnvelope({ detail: 'boom' }, status)),
  }))
}

beforeEach(() => {
  vi.mocked(getNcSession).mockReset().mockResolvedValue(SESSION)
  vi.mocked(invalidateSession).mockReset()
})

describe('buildOcsUrl', () => {
  it('attaches the requesttoken and strips trailing slashes', () => {
    expect(buildOcsUrl('https://cloud.aifazi.net/', 'ocs/v2.php/cloud/capabilities', 'TOK')).toBe(
      'https://cloud.aifazi.net/ocs/v2.php/cloud/capabilities?requesttoken=TOK',
    )
  })

  it('omits the token param when the session has none', () => {
    expect(buildOcsUrl('https://cloud.aifazi.net', 'ocs/v2.php/x', null)).toBe('https://cloud.aifazi.net/ocs/v2.php/x')
  })
})

describe('extractTurnServers', () => {
  it('collects hosts from public + secure signaling-v3 backends', () => {
    const spreed = {
      'signaling-v3': {
        public: [{ backend: 'internal', name: 'Server', version: '3' }],
        secure: [
          { backend: 'turn', host: 'turn.cloud.aifazi.net', port: 49160 },
          { host: 'turn2.cloud.aifazi.net' },
        ],
      },
    }
    expect(extractTurnServers(spreed)).toEqual(['turn.cloud.aifazi.net', 'turn2.cloud.aifazi.net'])
  })

  it('parses turn.turns URL lists and survives missing sections', () => {
    const spreed = {
      'signaling-v3': {
        secure: [{ turn: { turns: ['turns:turn.x.net:3478?transport=udp'], turn: ['turns:turn.y.net:3479?transport=tcp'] } }],
      },
    }
    expect(extractTurnServers(spreed)).toEqual(['turn.x.net', 'turn.y.net'])
    expect(extractTurnServers({})).toEqual([])
  })
})

describe('describeMediaPath (M2.4)', () => {
  it('prefers the VPN tunnel over TURN', () => {
    expect(describeMediaPath(true, ['turn.x.net'])).toContain('direct')
    expect(describeMediaPath(true, ['turn.x.net'])).not.toContain('relays via TURN')
  })

  it('names the verified relay when off-tunnel', () => {
    expect(describeMediaPath(false, ['turn.cloud.aifazi.net'])).toContain('turn.cloud.aifazi.net')
  })

  it('still mentions TURN with no server list', () => {
    expect(describeMediaPath(false, [])).toContain('TURN')
  })
})

describe('getRooms', () => {
  it('normalizes the v4 room list (has-call / last-activity keys)', async () => {
    vi.stubGlobal('fetch', mockFetchOnce(ocsEnvelope([
      {
        token: 'abc',
        type: 1,
        name: 'Tanveer ↔ Maria',
        'last-activity': 1730000000,
        'read-only': false,
        'has-call': true,
        'last-message': { id: 7, actorType: 'user', actorId: 'maria', actorDisplayName: 'Maria', message: 'hi', timestamp: 1730000000, messageType: 'comment' },
      },
      { token: 'def', type: 2, name: 'Team', 'has-call': false },
    ])))
    const rooms = await getRooms()
    expect(rooms).toHaveLength(2)
    expect(rooms[0]).toMatchObject({
      token: 'abc',
      type: 1,
      name: 'Tanveer ↔ Maria',
      lastActivity: 1730000000,
      hasCall: true,
      lastMessage: { id: 7, message: 'hi' },
    })
    expect(rooms[1].hasCall).toBe(false)
  })

  it('returns [] when the server has no rooms', async () => {
    vi.stubGlobal('fetch', mockFetchOnce(ocsEnvelope([])))
    await expect(getRooms()).resolves.toEqual([])
  })
})

describe('getRoomMessages', () => {
  it('normalizes and drops id-less rows', async () => {
    vi.stubGlobal('fetch', mockFetchOnce(ocsEnvelope([
      { id: 1, actorType: 'user', actorId: 'u1', actorDisplayName: 'U1', message: 'a', timestamp: 100, messageType: 'comment' },
      { id: 2, actorType: 'user', actorId: 'u2', actorDisplayName: 'U2', message: 'b', timestamp: 200, messageType: 'comment', referenceId: 'ref-2' },
      { id: 0, message: 'nope' },
    ])))
    const messages = await getRoomMessages('abc')
    expect(messages.map((m) => m.id)).toEqual([1, 2])
    expect(messages[1].referenceId).toBe('ref-2')
  })
})

describe('sendRoomMessage', () => {
  it('POSTs actor fields + referenceId and echoes the created message', async () => {
    let capturedBody: Record<string, unknown> | null = null
    const fetch = vi.fn(async (_url: string, init?: { body?: string }) => {
      capturedBody = init?.body ? JSON.parse(init.body) : null
      return { status: 200, ok: true, json: async () => ocsEnvelope({ id: 42, actorType: 'user', actorId: 'tanveer', actorDisplayName: 'Tanveer', message: 'hello', timestamp: 123, messageType: 'comment', referenceId: 'loc-1' }) }
    })
    vi.stubGlobal('fetch', fetch)
    const msg = await sendRoomMessage('abc', 'hello', 'loc-1')
    expect(msg.id).toBe(42)
    expect(msg.referenceId).toBe('loc-1')
    expect(capturedBody).toMatchObject({
      message: 'hello',
      actorType: 'user',
      actorId: 'tanveer',
      replyTo: 0,
      referenceId: 'loc-1',
    })
  })

  it('falls back to a zero-id local message when the server returns no id', async () => {
    vi.stubGlobal('fetch', mockFetchOnce(ocsEnvelope({})))
    const msg = await sendRoomMessage('abc', 'later', 'loc-2')
    expect(msg.id).toBe(0)
    expect(msg.referenceId).toBe('loc-2')
    expect(msg.message).toBe('later')
  })
})

describe('OCS transport', () => {
  it('sends OCS-ApiHeader, OCSClient, the session cookie and the requesttoken', async () => {
    let capturedUrl = ''
    let capturedHeaders: Record<string, string> = {}
    const fetch = vi.fn(async (url: string, init?: { headers?: Record<string, string> }) => {
      capturedUrl = url
      capturedHeaders = init?.headers ?? {}
      return { status: 200, ok: true, json: async () => ocsEnvelope({ rooms: [] }) }
    })
    vi.stubGlobal('fetch', fetch)
    await getRooms()
    expect(capturedUrl).toContain('ocs/v2.php/apps/spreed/api/v4/room')
    expect(capturedUrl).toContain('requesttoken=TOK')
    expect(capturedHeaders['OCS-ApiHeader']).toBe('api-2')
    expect(capturedHeaders.OCSClient).toBe('aifazi-mobile/1.0')
    expect(capturedHeaders.Cookie).toBe('nc_sess=sess1')
  })

  it('re-logs in ONCE on 401 and retries', async () => {
    let calls = 0
    const fetch = vi.fn(async () => {
      calls += 1
      if (calls === 1) return { status: 401, ok: false, json: async () => ocsEnvelope({ detail: 'expired' }, 401) }
      return { status: 200, ok: true, json: async () => ocsEnvelope({ rooms: [{ token: 'x', type: 2, name: 'X', 'has-call': false }] }) }
    })
    vi.stubGlobal('fetch', fetch)
    const rooms = await getRooms()
    expect(rooms.map((r) => r.token)).toEqual(['x'])
    expect(vi.mocked(invalidateSession)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(getNcSession)).toHaveBeenCalledTimes(2) // initial + forced re-login
    expect(calls).toBe(2)
  })

  it('surfaces OCS-level errors with the server detail', async () => {
    // HTTP 200 but an error statuscode inside the OCS envelope
    const fetch = vi.fn(async () => ({ status: 200, ok: true, json: async () => ocsEnvelope({ detail: 'room not found' }, 404) }))
    vi.stubGlobal('fetch', fetch)
    await expect(getRooms()).rejects.toThrow(TalkApiError)
    await expect(getRooms()).rejects.toMatchObject({ status: 404, message: 'room not found' })
  })
})

describe('getTalkCapabilities', () => {
  it('reads spreed features + TURN hosts', async () => {
    vi.stubGlobal('fetch', mockFetchOnce(ocsEnvelope({
      capabilities: {
        spreed: {
          features: ['chat-v2', 'conversation-v4', 'signaling-v3'],
          'signaling-v3': {
            public: [{ backend: 'internal', name: 'Server', version: '3' }],
            secure: [{ backend: 'turn', host: 'turn.cloud.aifazi.net' }],
          },
        },
      },
    })))
    const caps = await getTalkCapabilities()
    expect(caps).toEqual({
      talkEnabled: true,
      conversationV4: true,
      signalingV3: true,
      turnServers: ['turn.cloud.aifazi.net'],
    })
  })

  it('reports talk disabled when the app is missing', async () => {
    vi.stubGlobal('fetch', mockFetchOnce(ocsEnvelope({})))
    await expect(getTalkCapabilities()).resolves.toMatchObject({ talkEnabled: false })
  })
})
