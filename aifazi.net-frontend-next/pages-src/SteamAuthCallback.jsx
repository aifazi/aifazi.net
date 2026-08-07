'use client'
/**
 * SteamAuthCallback.jsx
 * Receives the JWT from the Steam OpenID backend callback.
 * Supports both query params and hash fragments for token delivery.
 * Hash fragments are preferred — they don't appear in server logs or Referer headers.
 */
import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { handOffFiveMAuthCallback } from '@/lib/authCallbackHandoff'
import { safeNextPath } from '@/lib/authRoutes'
import api, { setAccessToken } from '@/lib/api'

const STEAM_BLUE = '#1b2838'
const STEAM_LIGHT = '#00b4ff'

const STEAM_ERR_MSGS = {
  '1':      'Steam login verification failed. Please try again.',
  'link':   'Steam connect session expired. Please start from your profile again.',
  'missing':'Your account could not be found. Please sign in again.',
  'db':     'Database error during Steam login.',
  'banned': 'Your account has been banned.',
}

export default function SteamAuthCallback() {
  const searchParams = useSearchParams()
  const nav         = useRouter()
  const steamErr = typeof window === 'undefined' ? null : (new URLSearchParams(window.location.hash.substring(1)).get('steam_error') || searchParams?.get('steam_error'))
  const [status, setStatus] = useState(steamErr ? '' : 'Connecting Steam account…')
  const [error,  setError]  = useState(steamErr ? (STEAM_ERR_MSGS[steamErr] || 'Steam login failed. Please try again.') : '')

  useEffect(() => {
    // Try fragment first, then fall back to query param
    const hash = new URLSearchParams(window.location.hash.substring(1))
    let token = hash.get('token')
    // C15/G5: validate dest through safeNextPath to prevent open-redirect
    let dest = safeNextPath(hash.get('dest') || searchParams?.get('dest')) || '/profile'
    let steamErr = hash.get('steam_error') || searchParams?.get('steam_error')
    let isNewAccount = hash.get('new_account') === '1' || searchParams?.get('new_account') === '1'

    if (!token) token = searchParams?.get('token')
    if (!steamErr) steamErr = searchParams?.get('steam_error')
    if (!isNewAccount) isNewAccount = searchParams?.get('new_account') === '1'

    if (steamErr) {
      setTimeout(() => nav.replace('/login?tab=signin'), 3000)
      return
    }

    if (!token) {
      // H4 — the session may already be live via the HttpOnly cookie (e.g. this
      // page was reloaded after the token hash was cleared). Restore it instead
      // of failing hard.
      const restoreFromCookie = async () => {
        try {
          const me = await api.get('/auth/me')
          if (me.data && (me.data._id || me.data.id)) {
            window.dispatchEvent(new Event('auth-change'))
            if (isNewAccount) {
              setStatus('Account created! Setting up your profile…')
              setTimeout(() => nav.replace('/profile?tab=edit&steam_setup=1'), 900)
            } else {
              setStatus('Steam connected! Redirecting…')
              setTimeout(() => nav.replace(dest), 800)
            }
            return
          }
        } catch {}
        setError('No token received from Steam. Please try again.')
        setStatus('')
        setTimeout(() => nav.replace('/login?tab=signin'), 3000)
      }
      restoreFromCookie()
      return
    }

    if (handOffFiveMAuthCallback('steam', token, dest)) return

    // H4 — the backend sets HttpOnly auth cookies on this callback; keep the
    // token in memory only and notify all listeners.
    setAccessToken(token)
    window.dispatchEvent(new Event('auth-change'))
    // Clear the hash so the token doesn't linger in the URL
    window.history.replaceState(null, '', window.location.pathname)

    if (isNewAccount) {
      setTimeout(() => { setStatus('Account created! Setting up your profile…'); nav.replace('/profile?tab=edit&steam_setup=1') }, 900)
    } else {
      setTimeout(() => { setStatus('Steam connected! Redirecting…'); nav.replace(dest) }, 800)
    }
  }, [])

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      gap: 20,
      background: 'var(--bg, #060a0f)',
      padding: 24,
    }}>
      {/* Steam icon */}
      <svg width="56" height="56" viewBox="0 0 233 233" fill="none">
        <defs>
          <radialGradient id="sg" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#00b4ff" stopOpacity="0.3"/>
            <stop offset="100%" stopColor="#00b4ff" stopOpacity="0"/>
          </radialGradient>
        </defs>
        <circle cx="116.5" cy="116.5" r="116.5" fill="url(#sg)"/>
        <path fill={error ? '#ff4757' : STEAM_LIGHT} d="M116.5 18C62.7 18 18.8 60.9 18 114.5l52.7 21.8a29.6 29.6 0 0 1 16.6-5c.6 0 1.2 0 1.8.1L112 99.8v-.5c0-21.8 17.7-39.5 39.5-39.5S191 77.5 191 99.3s-17.7 39.5-39.5 39.5l-31.6 23.1c0 .5.1 1 .1 1.5 0 16.4-13.3 29.7-29.7 29.7-14.4 0-26.4-10.3-29.2-23.9L4.4 148.6C14.7 195.8 56.5 231 106.5 231c2.6 0 5.2-.1 7.8-.2C175 227.4 223 176.5 223 115c0-53.7-43.8-97-106.5-97zm-26 152.2c-8.5 3.4-18.1-.7-21.4-9.2s.7-18.1 9.2-21.5l9.2-3.7a21.8 21.8 0 1 0 3 34.4zM151.5 127a27.7 27.7 0 1 1 0-55.4 27.7 27.7 0 0 1 0 55.4zm0-11.1a16.6 16.6 0 1 0 0-33.2 16.6 16.6 0 0 0 0 33.2z"/>
      </svg>

      {error ? (
        <>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 12, color: '#ff4757',
            background: 'rgba(255,71,87,0.08)', border: '1px solid rgba(255,71,87,0.25)',
            padding: '12px 20px', borderRadius: 6, textAlign: 'center', maxWidth: 380,
          }}>
            {error}
          </div>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', letterSpacing: 2 }}>
            Redirecting to login…
          </p>
        </>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%', background: STEAM_LIGHT,
              display: 'inline-block', animation: 'steamPulse 1.4s ease-in-out infinite',
            }} />
            <p style={{
              fontFamily: 'var(--font-mono)', fontSize: 13, color: STEAM_LIGHT,
              letterSpacing: 2, margin: 0,
            }}>
              {status.toUpperCase()}
            </p>
          </div>
        </>
      )}

      <style>{`
        @keyframes steamPulse {
          0%,100% { opacity:0.3; transform:scale(1); }
          50%      { opacity:1;   transform:scale(1.4); }
        }
      `}</style>
    </div>
  )
}
