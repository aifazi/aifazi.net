'use client'
/**
 * GitHubAuthCallback.jsx
 * Receives the JWT from the GitHub OAuth backend callback.
 * Supports both query params and hash fragments for token delivery.
 * Hash fragments are preferred — they don't appear in server logs or Referer headers.
 */
import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { handOffFiveMAuthCallback } from '@/lib/authCallbackHandoff'
import { safeNextPath } from '@/lib/authRoutes'
import { setAccessToken } from '@/lib/api'

const GITHUB_LIGHT = '#00b4ff'

export default function GitHubAuthCallback() {
  const searchParams = useSearchParams()
  const nav         = useRouter()
  const [status, setStatus] = useState('Connecting GitHub account…')
  const [error,  setError]  = useState('')

  useEffect(() => {
    // Try fragment first, then fall back to query param
    const hash = new URLSearchParams(window.location.hash.substring(1))
    let token = hash.get('token')
    // C15/G5: validate dest through safeNextPath to prevent open-redirect
    let dest = safeNextPath(hash.get('dest') || searchParams?.get('dest')) || '/profile'
    let githubErr = hash.get('github_error') || searchParams?.get('github_error')
    let isNewAccount = hash.get('new_account') === '1' || searchParams?.get('new_account') === '1'

    if (!token) token = searchParams?.get('token')
    if (!githubErr) githubErr = searchParams?.get('github_error')
    if (!isNewAccount) isNewAccount = searchParams?.get('new_account') === '1'

    if (githubErr) {
      const msgs = {
        '1':      'GitHub login verification failed. Please try again.',
        'link':   'GitHub connect session expired. Please start from your profile again.',
        'missing':'Your account could not be found. Please sign in again.',
        'db':     'Database error during GitHub login.',
        'banned': 'Your account has been banned.',
        'state':  'GitHub login session expired. Please try again.',
        'duplicate': 'This GitHub account is already linked to another user.',
        'identity_locked': 'Your player identity is active. Contact an admin to change your GitHub.',
      }
      setError(msgs[githubErr] || 'GitHub login failed. Please try again.')
      setStatus('')
      setTimeout(() => nav.replace('/login?tab=signin'), 3000)
      return
    }

    if (!token) {
      setError('No token received from GitHub. Please try again.')
      setStatus('')
      setTimeout(() => nav.replace('/login?tab=signin'), 3000)
      return
    }

    if (handOffFiveMAuthCallback('github', token, dest)) return

    // H4 — the backend sets HttpOnly auth cookies on this callback; keep the
    // token in memory only and notify all listeners.
    setAccessToken(token)
    window.dispatchEvent(new Event('auth-change'))
    // Clear the hash so the token doesn't linger in the URL
    window.history.replaceState(null, '', window.location.pathname)

    if (isNewAccount) {
      setStatus('Account created! Setting up your profile…')
      setTimeout(() => nav.replace('/profile?tab=edit&github_setup=1'), 900)
    } else {
      setStatus('GitHub connected! Redirecting…')
      setTimeout(() => nav.replace(dest), 800)
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
      {/* GitHub mark */}
      <svg width="56" height="56" viewBox="0 0 16 16" fill="none">
        <defs>
          <radialGradient id="gg" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#00b4ff" stopOpacity="0.3"/>
            <stop offset="100%" stopColor="#00b4ff" stopOpacity="0"/>
          </radialGradient>
        </defs>
        <circle cx="8" cy="8" r="8" fill="url(#gg)"/>
        <path fill={error ? '#ff4757' : GITHUB_LIGHT} d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
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
              width: 8, height: 8, borderRadius: '50%', background: GITHUB_LIGHT,
              display: 'inline-block', animation: 'githubPulse 1.4s ease-in-out infinite',
            }} />
            <p style={{
              fontFamily: 'var(--font-mono)', fontSize: 13, color: GITHUB_LIGHT,
              letterSpacing: 2, margin: 0,
            }}>
              {status.toUpperCase()}
            </p>
          </div>
        </>
      )}

      <style>{`
        @keyframes githubPulse {
          0%,100% { opacity:0.3; transform:scale(1); }
          50%      { opacity:1;   transform:scale(1.4); }
        }
      `}</style>
    </div>
  )
}
