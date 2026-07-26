'use client'
/**
 * DiscordAuthCallback.jsx
 * Handles the redirect from /api/forum/auth/discord/callback
 * Supports both query params (?token=...) and hash fragments (#token=...)
 * Hash fragments are preferred — they don't appear in server logs or Referer headers.
 */
import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { handOffFiveMAuthCallback } from '@/lib/authCallbackHandoff'

export default function DiscordAuthCallback() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState('Connecting your Discord account...')
  const [error,  setError]  = useState('')

  useEffect(() => {
    // Try fragment first, then fall back to query param
    const hash = new URLSearchParams(window.location.hash.substring(1))
    let token = hash.get('token')
    let dest = hash.get('dest') || searchParams.get('dest') || '/profile'
    let err = hash.get('discord_error') || searchParams.get('discord_error')

    if (!token) token = searchParams.get('token')
    if (!err) err = searchParams.get('discord_error')

    if (err) {
      const msgs = {
        '1':      'Discord login was cancelled.',
        '2':      'Failed to exchange Discord code. Please try again.',
        '3':      'Failed to fetch your Discord profile.',
        'db':     'Database error. Please try again.',
        'banned': 'Your account has been banned.',
        'cfg':    'Discord OAuth is not configured on the server.',
      }
      setError(msgs[err] || 'Discord login failed. Please try again.')
      setStatus('')
      setTimeout(() => router.replace('/login'), 3000)
      return
    }

    if (!token) {
      setError('No token received. Please try again.')
      setTimeout(() => router.replace('/login'), 3000)
      return
    }

    if (handOffFiveMAuthCallback('discord', token, dest)) return

    // Save token to the unified auth_token key and notify all listeners
    localStorage.setItem('auth_token', token)
    window.dispatchEvent(new Event('auth-change'))
    // Clear the hash so the token doesn't linger in the URL
    window.history.replaceState(null, '', window.location.pathname)
    setStatus('Discord connected! Redirecting...')

    // Small delay so ForumContext can hydrate
    setTimeout(() => router.replace(dest), 800)
  }, [searchParams, router])

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      gap: 16,
      background: 'var(--bg, #060a0f)',
      fontFamily: 'var(--font-mono, monospace)',
    }}>
      {/* Discord logo */}
      <svg width="48" height="48" viewBox="0 0 127.14 96.36" fill="#5865F2">
        <path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z"/>
      </svg>

      {status && (
        <p style={{ color: 'var(--green, #00ff88)', fontSize: 14, letterSpacing: 2, margin: 0 }}>
          {status}
        </p>
      )}
      {error && (
        <>
          <p style={{ color: '#ff4444', fontSize: 14, letterSpacing: 1, margin: 0, textAlign: 'center', maxWidth: 320 }}>
            {error}
          </p>
          <p style={{ color: 'var(--muted, #666)', fontSize: 11, letterSpacing: 1, margin: 0 }}>
            Redirecting back to login...
          </p>
        </>
      )}
      {!error && (
        <div style={{
          width: 120,
          height: 2,
          background: 'var(--border, #1a2030)',
          borderRadius: 2,
          overflow: 'hidden',
        }}>
          <div style={{
            height: '100%',
            background: 'var(--green, #00ff88)',
            animation: 'progress-bar 0.8s ease forwards',
          }} />
        </div>
      )}
      <style>{`
        @keyframes progress-bar {
          from { width: 0% }
          to   { width: 100% }
        }
      `}</style>
    </div>
  )
}
