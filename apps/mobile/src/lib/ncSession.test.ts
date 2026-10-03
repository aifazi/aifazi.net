import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  extractRequestToken,
  isGuestPage,
  parseSetCookies,
  cookiesToHeader,
  mergeCookies,
  performLogin,
  getNcSession,
  invalidateSession,
  NcNotConfiguredError,
  type NcCredentials,
} from './ncSession'

vi.mock('./caldav', () => ({
  getCalDAVCredentials: vi.fn(async () => ({
    serverUrl: 'https://cloud.aifazi.net',
    username: 'tanveer',
    password: 'app-password',
  })),
}))

const CRED: NcCredentials = {
  serverUrl: 'https://cloud.aifazi.net',
  username: 'tanveer',
  password: 'app-password',
}

const GUEST_HTML = `<html><head data-requesttoken="GUEST-TOKEN-ABC"><body id="body-login">`
const AUTHED_HTML = `<html><head data-requesttoken="SESSION-TOKEN-XYZ"><body id="body" data-user-id="42">`

interface ResOpts {
  status?: number
  html?: string
  cookies?: string[]
}

function res(opts: ResOpts = {}) {
  const { status = 200, html = '', cookies = [] } = opts
  let joined = ''
  for (const ck of cookies) joined = joined ? `${joined}, ${ck}` : ck
  return {
    status,
    ok: status < 400,
    headers: {
      get: (k: string) => (k.toLowerCase() === 'set-cookie' ? joined || null : null),
      getSetCookie: undefined,
    },
    text: async () => html,
  }
}

/** Fetch plan: [/login GET, /login POST, / GET] responses. */
function planFetch(responses: ReturnType<typeof res>[]) {
  const fn = vi.fn(async (_url: string) => {
    if (responses.length === 0) throw new Error('unexpected extra request')
    return responses.shift()!
  })
  return fn
}

beforeEach(() => {
  invalidateSession()
  vi.clearAllMocks()
})

describe('extractRequestToken', () => {
  it('reads the NC34 head attribute', () => {
    expect(extractRequestToken('<head data-requesttoken="abc=def">')).toBe('abc=def')
  })

  it('reads the legacy input attribute (both orders)', () => {
    expect(extractRequestToken('<input type="hidden" name="requesttoken" value="legacy1">')).toBe('legacy1')
    expect(extractRequestToken('<input type="hidden" value="legacy2" name="requesttoken">')).toBe('legacy2')
  })

  it('returns null when absent', () => {
    expect(extractRequestToken('<head></head>')).toBeNull()
  })
})

describe('isGuestPage', () => {
  it('detects the guest body id', () => {
    expect(isGuestPage('<body id="body-login">')).toBe(true)
    expect(isGuestPage('<body id="body" data-user-id="42">')).toBe(false)
  })
})

describe('parseSetCookies / cookiesToHeader / mergeCookies', () => {
  it('parses a comma-joined Set-Cookie header', () => {
    const parsed = parseSetCookies(
      res({ cookies: ['nc_sess=guest1; path=/; secure; HttpOnly', 'oc_sessionPassphrase=b64; path=/'] }) as never,
    )
    expect(parsed).toEqual([
      { name: 'nc_sess', value: 'guest1' },
      { name: 'oc_sessionPassphrase', value: 'b64' },
    ])
  })

  it('prefers getSetCookie when available', () => {
    const fakeRes = {
      status: 200,
      ok: true,
      headers: { get: () => null, getSetCookie: () => ['a=1; path=/', 'b=2'] },
      text: async () => '',
    }
    expect(parseSetCookies(fakeRes as never)).toEqual([
      { name: 'a', value: '1' },
      { name: 'b', value: '2' },
    ])
  })

  it('ignores malformed entries and empty headers', () => {
    expect(parseSetCookies(res({ cookies: [] }) as never)).toEqual([])
    expect(parseSetCookies(res({ cookies: ['=x', 'noequalsign', 'ok=v; path=/'] }) as never)).toEqual([
      { name: 'ok', value: 'v' },
    ])
  })

  it('cookiesToHeader null on empty, merged otherwise; merge lets fresh win', () => {
    expect(cookiesToHeader([])).toBeNull()
    expect(cookiesToHeader([{ name: 'a', value: '1' }, { name: 'b', value: '2' }])).toBe('a=1; b=2')
    expect(mergeCookies([{ name: 'a', value: 'old' }, { name: 'b', value: '2' }], [{ name: 'a', value: 'new' }])).toEqual([
      { name: 'a', value: 'new' },
      { name: 'b', value: '2' },
    ])
  })
})

describe('performLogin', () => {
  it('bootstraps a manual-cookie session on success', async () => {
    const calls: { url: string; init?: { method?: string; body?: string } }[] = []
    const plan = [
      res({ status: 200, html: GUEST_HTML, cookies: ['nc_sess=guest1; path=/'] }),
      res({ status: 302, html: '', cookies: ['nc_sess=session9; path=/'] }),
      res({ status: 200, html: AUTHED_HTML }),
    ]
    const fetchFn = vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
      calls.push({ url, init })
      return plan.shift()!
    })
    const session = await performLogin(CRED, fetchFn as never)
    expect(session.serverUrl).toBe('https://cloud.aifazi.net')
    expect(session.username).toBe('tanveer')
    expect(session.cookieMode).toBe('manual')
    expect(session.cookie).toBe('nc_sess=session9')
    expect(session.requestToken).toBe('SESSION-TOKEN-XYZ')
    // The POST (second call) must carry user/pass + the guest requesttoken.
    const post = calls[1]
    expect(post.init?.method).toBe('POST')
    expect(post.init?.body).toContain('user=tanveer')
    expect(post.init?.body).toContain('pass=app-password')
    expect(post.init?.body).toContain('requesttoken=GUEST-TOKEN-ABC')
  })

  it('falls back to native cookie mode when Set-Cookie is unreadable', async () => {
    const bare = (html: string) => ({
      status: 200,
      ok: true,
      headers: { get: () => null, getSetCookie: undefined },
      text: async () => html,
    })
    const fetchFn = vi.fn(async (url: string) => (url === 'https://cloud.aifazi.net/' ? bare(AUTHED_HTML) : bare(GUEST_HTML)))
    const session = await performLogin(CRED, fetchFn as never)
    expect(session.cookie).toBeNull()
    expect(session.cookieMode).toBe('native')
    expect(session.requestToken).toBe('SESSION-TOKEN-XYZ')
  })

  it('throws auth-failed when the probe still shows the guest page', async () => {
    const fetchFn = planFetch([
      res({ status: 200, html: GUEST_HTML, cookies: ['nc_sess=g; path=/'] }),
      res({ status: 303, html: '' }),
      res({ status: 200, html: GUEST_HTML }),
    ])
    await expect(performLogin(CRED, fetchFn as never)).rejects.toMatchObject({
      name: 'NcLoginError',
      kind: 'auth-failed',
    })
  })

  it('reports two-factor-blocked when the probe page mentions 2FA', async () => {
    const twoFaHtml = `<head data-requesttoken="X"><body id="body-login"> twofactor_webauthn challenge pending`
    const fetchFn = planFetch([
      res({ status: 200, html: GUEST_HTML }),
      res({ status: 303, html: '' }),
      res({ status: 200, html: twoFaHtml }),
    ])
    await expect(performLogin(CRED, fetchFn as never)).rejects.toMatchObject({
      name: 'NcLoginError',
      kind: 'two-factor-blocked',
    })
  })

  it('rejects non-http server URLs', async () => {
    await expect(performLogin({ ...CRED, serverUrl: 'cloud.aifazi.net' })).rejects.toMatchObject({ kind: 'auth-failed' })
  })
})

describe('getNcSession', () => {
  it('throws NcNotConfiguredError when credentials are missing', async () => {
    const { getCalDAVCredentials } = await import('./caldav')
    vi.mocked(getCalDAVCredentials).mockResolvedValueOnce(null as never)
    await expect(getNcSession()).rejects.toBeInstanceOf(NcNotConfiguredError)
  })

  it('is single-flight: concurrent callers share one login', async () => {
    let posts = 0
    const fetchFn = vi.fn(async (url: string, init?: { method?: string }) => {
      if (init?.method === 'POST') {
        posts += 1
        return res({ status: 200, html: AUTHED_HTML, cookies: ['nc_sess=s; path=/'] })
      }
      // home-page probe proves the session; the login page is guest state
      if (url === 'https://cloud.aifazi.net/') return res({ status: 200, html: AUTHED_HTML })
      return res({ status: 200, html: GUEST_HTML, cookies: ['nc_sess=g; path=/'] })
    })
    vi.spyOn(globalThis, 'fetch').mockImplementation(fetchFn as never)
    const [a, b] = await Promise.all([getNcSession(), getNcSession()])
    expect(a).toBe(b)
    expect(posts).toBe(1)
  })

  it('invalidateSession forces a fresh login', async () => {
    let attempts = 0
    const fetchFn = async (url: string, init?: { method?: string }) => {
      if (init?.method === 'POST') {
        attempts += 1
        return res({ status: 200, html: AUTHED_HTML, cookies: [`nc_sess=s${attempts}; path=/`] })
      }
      if (url === 'https://cloud.aifazi.net/') return res({ status: 200, html: AUTHED_HTML })
      return res({ status: 200, html: GUEST_HTML, cookies: ['nc_sess=g; path=/'] })
    }
    vi.spyOn(globalThis, 'fetch').mockImplementation(fetchFn as never)
    const first = await getNcSession()
    expect(first.cookie).toBe('nc_sess=s1')
    invalidateSession()
    const second = await getNcSession({ force: true })
    expect(second.cookie).toBe('nc_sess=s2')
    expect(second).not.toBe(first)
  })
})
