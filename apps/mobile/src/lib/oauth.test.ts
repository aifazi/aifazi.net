import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import * as WebBrowser from 'expo-web-browser'
import { api } from './api'
import {
  cancelPendingOAuth,
  completeFromAuthRedirect,
  exchangeOAuthCode,
  loginWithOAuth,
  parseOAuthRedirect,
} from './oauth'

// H2/C6 — the mobile OAuth deep link carries a one-time code, never tokens.
// loginWithOAuth must exchange that code server-side before resolving.

const STATE = '0'.repeat(32) // expo-crypto mock returns 16 zero bytes

vi.mock('expo-web-browser', () => ({
  openAuthSessionAsync: vi.fn(),
}))
vi.mock('expo-crypto', () => ({
  getRandomBytesAsync: vi.fn(async () => new Uint8Array(16)),
}))
vi.mock('./api', () => ({
  api: { post: vi.fn() },
}))

const CODE = 'v4.local.mobileOAuthCode'
const codeUrl = (state: string) =>
  `aifazi:///oauth/callback/github#code=${CODE}&dest=/forum/profile&state=${state}`

beforeEach(() => {
  cancelPendingOAuth()
  vi.clearAllMocks()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('parseOAuthRedirect (no state issued)', () => {
  it('reads the one-time code + dest from the fragment', () => {
    const r = parseOAuthRedirect(codeUrl('ignored-no-state-issued'), 'github')
    expect(r).toEqual({ ok: true, requires2fa: false, code: CODE, dest: '/forum/profile' })
  })

  it('still handles the 2FA partial-token fragment', () => {
    const r = parseOAuthRedirect(
      'aifazi:///oauth/callback/steam#twofa=forum&partial_token=P1&username=bob&next=/profile',
      'steam',
    )
    expect(r).toEqual({ ok: true, requires2fa: true, partialToken: 'P1', username: 'bob' })
  })

  it('surfaces provider error params', () => {
    const r = parseOAuthRedirect(`aifazi:///oauth/callback/github?github_error=banned`, 'github')
    expect(r).toEqual({ ok: false, cancelled: false, error: 'banned' })
  })

  it('ignores URLs that are not ours', () => {
    expect(parseOAuthRedirect('https://aifazi.net/auth/github-callback#dest=%2Fforum', 'github')).toBeNull()
    expect(parseOAuthRedirect('aifazi:///oauth/callback/steam#code=x', 'github')).toBeNull()
  })
})

const mockExchange = (data: { token?: string; refreshToken?: string } | Error = { token: 'ACCESS', refreshToken: 'REFRESH' }) => {
  vi.mocked(api.post).mockImplementation(async () => {
    if (data instanceof Error) throw data
    return { data }
  })
}

describe('loginWithOAuth (state issued, fail-closed)', () => {
  it('exchanges the code and resolves with tokens', async () => {
    vi.mocked(WebBrowser.openAuthSessionAsync).mockResolvedValue({
      type: 'success',
      url: codeUrl(STATE),
    } as never)
    mockExchange()

    const r = await loginWithOAuth('github')
    expect(r).toEqual({ ok: true, requires2fa: false, token: 'ACCESS', refreshToken: 'REFRESH', dest: '/forum/profile' })
    expect(api.post).toHaveBeenCalledWith('/auth/mobile/exchange', { code: CODE })
  })

  it('rejects a redirect whose state does not match (CSRF)', async () => {
    vi.mocked(WebBrowser.openAuthSessionAsync).mockResolvedValue({
      type: 'success',
      url: codeUrl('deadbeef'),
    } as never)
    mockExchange()

    const r = await loginWithOAuth('github')
    expect(r).toEqual({ ok: false, cancelled: false, error: 'state' })
    expect(api.post).not.toHaveBeenCalled()
  })

  it('fails closed when the backend did not echo the state', async () => {
    vi.mocked(WebBrowser.openAuthSessionAsync).mockResolvedValue({
      type: 'success',
      url: `aifazi:///oauth/callback/github#code=${CODE}&dest=/profile`,
    } as never)
    mockExchange()

    const r = await loginWithOAuth('github')
    expect(r).toEqual({ ok: false, cancelled: false, error: 'state' })
    expect(api.post).not.toHaveBeenCalled()
  })

  it('passes 2FA through without exchanging', async () => {
    vi.mocked(WebBrowser.openAuthSessionAsync).mockResolvedValue({
      type: 'success',
      url: `aifazi:///oauth/callback/steam#twofa=forum&partial_token=P9&username=bob&next=/profile&state=${STATE}`,
    } as never)
    mockExchange()

    const r = await loginWithOAuth('steam')
    expect(r).toEqual({ ok: true, requires2fa: true, partialToken: 'P9', username: 'bob' })
    expect(api.post).not.toHaveBeenCalled()
  })

  it('reports exchange failure as a sign-in error', async () => {
    vi.mocked(WebBrowser.openAuthSessionAsync).mockResolvedValue({
      type: 'success',
      url: codeUrl(STATE),
    } as never)
    mockExchange(new Error('boom'))

    const r = await loginWithOAuth('github')
    expect(r).toEqual({ ok: false, cancelled: false, error: 'exchange' })
  })

  it('reports an unexpected redirect', async () => {
    vi.mocked(WebBrowser.openAuthSessionAsync).mockResolvedValue({
      type: 'success',
      url: 'https://aifazi.net/somewhere',
    } as never)

    const r = await loginWithOAuth('github')
    expect(r).toEqual({ ok: false, cancelled: false, error: 'invalid_redirect' })
  })

  it('cancels when the browser closes without a redirect (Android grace window)', async () => {
    vi.useFakeTimers()
    vi.mocked(WebBrowser.openAuthSessionAsync).mockResolvedValue({ type: 'dismiss' } as never)
    mockExchange()

    const p = loginWithOAuth('github')
    await vi.advanceTimersByTimeAsync(2200)
    const r = await p
    expect(r).toEqual({ ok: false, cancelled: true })
  })

  it('surfaces browser launch failure', async () => {
    vi.mocked(WebBrowser.openAuthSessionAsync).mockRejectedValue(new Error('no browser'))
    const r = await loginWithOAuth('github')
    expect(r).toEqual({ ok: false, cancelled: false, error: 'signin_failed' })
  })
})

describe('completeFromAuthRedirect (Android deep-link sink)', () => {
  it('returns false when nothing is pending', () => {
    expect(completeFromAuthRedirect(codeUrl(STATE), 'github')).toBe(false)
  })

  const flushPending = () => new Promise<void>((r) => setTimeout(r, 0))

  it('ignores a pending flow for a different provider', async () => {
    vi.mocked(WebBrowser.openAuthSessionAsync).mockResolvedValue({ type: 'dismiss' } as never)
    void loginWithOAuth('github')
    await flushPending()
    expect(completeFromAuthRedirect(`aifazi:///oauth/callback/steam#code=${CODE}&state=${STATE}`, 'steam')).toBe(false)
  })

  it('completes the pending flow and exchanges the code', async () => {
    vi.mocked(WebBrowser.openAuthSessionAsync).mockResolvedValue({ type: 'dismiss' } as never)
    mockExchange()
    const p = loginWithOAuth('github')
    await flushPending()

    expect(completeFromAuthRedirect(codeUrl(STATE), 'github')).toBe(true)
    const r = await p
    expect(r).toEqual({ ok: true, requires2fa: false, token: 'ACCESS', refreshToken: 'REFRESH', dest: '/forum/profile' })
    // Single-flight: a second delivery is ignored.
    expect(completeFromAuthRedirect(codeUrl(STATE), 'github')).toBe(false)
  })
})

describe('exchangeOAuthCode', () => {
  it('returns tokens from the exchange endpoint', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { token: 'A', refreshToken: 'R' } })
    await expect(exchangeOAuthCode(CODE)).resolves.toEqual({ token: 'A', refreshToken: 'R' })
  })

  it('throws when the server returns no token', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: {} })
    await expect(exchangeOAuthCode(CODE)).rejects.toThrow('Exchange failed')
  })
})
