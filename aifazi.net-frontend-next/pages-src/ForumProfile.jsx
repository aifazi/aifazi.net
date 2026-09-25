'use client'
import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Link, useNavigate } from '@/lib/router-compat'
import api, { ensureAdminGate } from '@/lib/api'
import { builtinAvatarEmoji, avatarUrl, UserAvatar, BUILTIN_AVATARS } from '@/lib/avatar'
import { useForum } from '../context/ForumContext'
import { Select, useDialog } from '../core/ui.jsx'
import { useToast } from '../components/Toast'
import { useNow } from '../hooks/useNow'
import FiveMStatus from '@/components/FiveMStatus'
import { getSupabase } from '@/lib/supabase'
import {
  M, D, CLRS, Badge, SectionCard, Inp, Btn, StatusMsg, ago, Avatar,
  STATUS_CFG, PRIORITY_CFG,
  STAFF_PORTAL_ROLES, canAccessAdminPortal, AdminPortalLink,
} from './forumProfileParts'
import {
  TicketCard, TicketDetailView, MyTicketsTab, ActivityTab, ProfileEditTab,
  ProfileSessionsPanel, TwoFactorPanel, SecurityTab, OverviewTab,
} from './forumProfileTabs'

const TRUSTED_OAUTH_HOSTS = ['steamcommunity.com', 'steamlogin.com', 'discord.com', 'discordapp.com', 'github.com']
function safeOAuthRedirect(url) {
  try {
    const u = new URL(url, window.location.origin)
    if ((u.protocol === 'https:' || u.protocol === 'http:') && TRUSTED_OAUTH_HOSTS.some(h => u.hostname === h || u.hostname.endsWith('.' + h))) {
      window.location.href = url
      return true
    }
  } catch {}
  return false
}

/* ─── Design tokens ──────────────────────────────────────────────────────── */
const DISCORD_PURPLE = '#5865F2'
const STEAM_BLUE = '#1b2838'
const STEAM_LIGHT = '#00b4ff'
const GITHUB_COLOR = '#e6edf3'
const WL_STEPS = [
  { key: 'submitted',   label: 'Submitted',    icon: '📋' },
  { key: 'under_review',label: 'Under Review', icon: '🔍' },
  { key: 'approved',    label: 'Approved',     icon: '✅' },
  { key: 'active',      label: 'Active',       icon: '🎮' },
]
const WL_STATUS_MAP = {
  pending:  { step: 1, color: CLRS.yellow,  label: 'PENDING REVIEW'  },
  approved: { step: 2, color: CLRS.green,   label: 'APPROVED'        },
  denied:   { step: 1, color: CLRS.red,     label: 'DENIED'          },
  active:   { step: 3, color: CLRS.green,   label: 'ACTIVE'          },
  syncing:  { step: 2, color: CLRS.cyan,    label: 'SYNCING TO SERVER'},
  sync_failed: { step: 2, color: CLRS.red,  label: 'SYNC FAILED'     },
}

function FiveMTab({ user }) {
  const { refreshUser, logout } = useForum()
  const navigate = useNavigate()
  const dialog = useDialog()
  // status shape: { has_discord: bool, discord_id?, application: obj|null }
  const [status, setStatus]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [actionStatus, setActionStatus] = useState(() => {
    if (typeof window === 'undefined') return null
    const params = new URLSearchParams(window.location.search)
    if (params.get('discord_error') === 'duplicate') return { type: 'error', msg: 'That Discord account is already linked to another user.' }
    if (params.get('discord_error') === 'link') return { type: 'error', msg: 'Discord connect session expired. Please start from your profile again.' }
    if (params.get('discord_error') === 'identity_locked' || params.get('steam_error') === 'identity_locked') return { type: 'error', msg: 'Your player identity is active. Contact an admin or open a ticket to change Discord or Steam.' }
    if (params.get('steam_error') === 'duplicate') return { type: 'error', msg: 'That Steam account is already linked to another user.' }
    return null
  })
  const [actionLoading, setActionLoading] = useState('')
  const [formSubmissions, setFormSubmissions] = useState([])
  const [formsLoading, setFormsLoading] = useState(false)

  useEffect(() => {
    void (async () => {
      setFormsLoading(true)
      try {
        const r = await api.get('/auth/discord/whitelist-status')
        setStatus(r.data)
      } catch (err) {
        const code = err?.response?.status
        if (code === 401) {
          setError('Session expired. Please sign in again.')
        } else if (code !== 404) {
          setError(err?.response?.data?.detail || 'Could not load whitelist status.')
        }
      } finally {
        setLoading(false)
      }
    })()
    api.get('/forms/my-submissions')
      .then(r => setFormSubmissions(Array.isArray(r.data) ? r.data : (r.data?.submissions || [])))
      .catch(() => setFormSubmissions([]))
      .finally(() => setFormsLoading(false))
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.get('discord_error') === 'duplicate' || params.get('discord_error') === 'link' || params.get('discord_error') === 'identity_locked' || params.get('steam_error') === 'identity_locked' || params.get('steam_error') === 'duplicate') {
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  if (loading) return (
    <div style={{ padding: '40px 0', textAlign: 'center', ...M, fontSize: 11, color: 'var(--muted)', letterSpacing: 3 }}>LOADING…</div>
  )

  // Derive values from the response shape.
  // status.discord_id is the authoritative source (from DB via /whitelist-status).
  // user.discord_id comes from /me — may be missing if backend was not yet updated.
  const wl              = status?.application ?? null
  const discordId       = status?.discord_id || user?.discord_id || null
  const discordUsername = user?.discord_username || wl?.discord_name || null
  const discordAvatar   = user?.discord_avatar || null
  const discordLinked   = status?.has_discord ?? !!discordId
  const steamId         = user?.steam_id || null
  const steamUsername   = user?.steam_username || null
  const steamAvatar     = user?.steam_avatar || null
  const steamHex        = user?.steam_hex || null
  const steamLinked     = !!steamId
  const hasPassword     = !!user?.has_password
  const identityLocked  = !!(
    user?.active_identity_locked ||
    status?.active_identity_locked ||
    wl?.display_status === 'active' ||
    (wl?.status === 'approved' && wl?.last_played_at)
  )
  const identityLockedMsg = 'Your player identity is active. Contact an admin or open a ticket to change Discord or Steam.'
  const discordAvatarUrl = (() => {
    if (!discordAvatar || !discordId) return ''
    const raw = String(discordAvatar)
    if (/^https?:\/\//i.test(raw)) return raw
    const ext = raw.startsWith('a_') ? 'gif' : 'png'
    return `https://cdn.discordapp.com/avatars/${discordId}/${raw}.${ext}?size=96`
  })()

  const refreshIdentities = async () => {
    await refreshUser?.()
    const r = await api.get('/auth/discord/whitelist-status').catch(() => null)
    if (r?.data) setStatus(r.data)
  }

  const disconnectProvider = async provider => {
    setActionLoading(provider)
    setActionStatus(null)
    try {
      const route = provider === 'steam'
        ? `${oauthApiBase('steam')}/disconnect`
        : `${oauthApiBase('discord')}/disconnect`
      await api.delete(route)
      await refreshIdentities()
      setActionStatus({ type: 'success', msg: `${provider === 'steam' ? 'Steam' : 'Discord'} disconnected.` })
    } catch (err) {
      setActionStatus({ type: 'error', msg: err?.response?.data?.detail || `Could not disconnect ${provider}.` })
    } finally {
      setActionLoading('')
    }
  }

  const connectSteam = async () => {
    if (identityLocked) { setActionStatus({ type: 'error', msg: identityLockedMsg }); return }
    setActionLoading('steam-connect')
    setActionStatus(null)
    try {
      const r = await api.get(`${oauthApiBase('steam')}/connect-url?dest=${encodeURIComponent('/profile?tab=fivem')}`)
      safeOAuthRedirect(r.data.url)
    } catch (err) {
      setActionStatus({ type: 'error', msg: err?.response?.data?.detail || 'Could not start Steam connect.' })
      setActionLoading('')
    }
  }

  const connectDiscord = async () => {
    if (identityLocked) { setActionStatus({ type: 'error', msg: identityLockedMsg }); return }
    setActionLoading('discord-connect')
    setActionStatus(null)
    try {
      const r = await api.get(`${oauthApiBase('discord')}/connect-url?dest=${encodeURIComponent('/profile?tab=fivem')}`)
      safeOAuthRedirect(r.data.url)
    } catch (err) {
      setActionStatus({ type: 'error', msg: err?.response?.data?.detail || 'Could not start Discord connect.' })
      setActionLoading('')
    }
  }

  const deleteOAuthAccount = async () => {
    if (!await dialog.confirm({ title: 'Delete Account', message: 'Delete this OAuth-only account? This cannot be undone.', variant: 'danger', confirmLabel: 'DELETE' })) return
    setActionLoading('delete')
    setActionStatus(null)
    try {
      await api.delete('/auth/account')
      await logout?.()
      navigate('/login?account_deleted=1')
    } catch (err) {
      setActionStatus({ type: 'error', msg: err?.response?.data?.detail || 'Could not delete account.' })
      setActionLoading('')
    }
  }

  const providerAction = (provider, linked) => {
    if (!linked) return null
    if (identityLocked) {
      return <Btn color={CLRS.orange} ghost small disabled>LOCKED</Btn>
    }
    if (hasPassword) {
      return (
        <Btn
          color={CLRS.orange}
          ghost
          small
          disabled={actionLoading === provider}
          onClick={() => disconnectProvider(provider)}
        >
          {actionLoading === provider ? 'DISCONNECTING...' : 'DISCONNECT'}
        </Btn>
      )
    }
    return (
      <Btn
        color={CLRS.red}
        ghost
        small
        disabled={actionLoading === 'delete'}
        onClick={deleteOAuthAccount}
      >
        {actionLoading === 'delete' ? 'DELETING...' : 'DELETE ACCOUNT'}
      </Btn>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {actionStatus && <StatusMsg msg={actionStatus.msg} type={actionStatus.type} />}
      {identityLocked && <StatusMsg msg={identityLockedMsg} type="error" />}

      <SectionCard title="Server Status" tag="FIVEM">
        <FiveMStatus expanded />
      </SectionCard>

      {/* Discord connection card */}
      <SectionCard title="Discord Account" tag="IDENTITY">
        {discordLinked ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            {discordAvatarUrl ? (
              <img
                src={discordAvatarUrl}
                alt={discordUsername || 'Discord'}
                style={{ width: 44, height: 44, borderRadius: '50%', border: `2px solid ${DISCORD_PURPLE}60` }}
                onError={e => {
                  e.currentTarget.onerror = null
                  e.currentTarget.src = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(discordUsername || user.username || 'Discord')}`
                }}
              />
            ) : (
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: DISCORD_PURPLE + '30',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 18, fontWeight: 700 }}>
                {(discordUsername || user.username || '?')[0].toUpperCase()}
              </div>
            )}
            <div style={{ flex: 1 }}>
              <div style={{ ...M, fontSize: 12, color: 'var(--text)', fontWeight: 700 }}>{discordUsername || 'Discord Account'}</div>
              <div style={{ ...M, fontSize: 11, color: DISCORD_PURPLE, letterSpacing: 1, marginTop: 2 }}>DISCORD ID: {discordId || '—'}</div>
            </div>
            <Badge label="CONNECTED" color={CLRS.green} icon="✓" />
            {providerAction('discord', discordLinked)}
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ ...M, fontSize: 11, color: 'var(--text)', fontWeight: 700, marginBottom: 4 }}>Discord not linked</div>
              <div style={{ ...M, fontSize: 11, color: 'var(--muted)' }}>Link your Discord to apply for whitelist and access FiveM features.</div>
            </div>
            <button
              onClick={connectDiscord}
              disabled={actionLoading === 'discord-connect' || identityLocked}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: DISCORD_PURPLE, border: 'none', borderRadius: 8,
                padding: '10px 20px', color: '#fff', ...M, fontSize: 11, letterSpacing: 2,
                cursor: actionLoading === 'discord-connect' || identityLocked ? 'not-allowed' : 'pointer',
                opacity: actionLoading === 'discord-connect' || identityLocked ? 0.55 : 1,
                transition: 'opacity 0.15s',
              }}
              onMouseEnter={e => { if (actionLoading !== 'discord-connect') e.currentTarget.style.opacity = '0.85' }}
              onMouseLeave={e => { if (actionLoading !== 'discord-connect') e.currentTarget.style.opacity = '1' }}
            >
              <svg width="16" height="16" viewBox="0 0 71 55" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M60.1045 4.8978C55.5792 2.8214 50.7265 1.2916 45.6527 0.41542C45.5603 0.39851 45.468 0.44077 45.4204 0.52529C44.7963 1.6353 44.105 3.0834 43.6209 4.2216C38.1637 3.4046 32.7345 3.4046 27.3892 4.2216C26.905 3.0581 26.1886 1.6353 25.5617 0.52529C25.5141 0.44359 25.4218 0.40133 25.3294 0.41542C20.2584 1.2888 15.4057 2.8186 10.8776 4.8978C10.8384 4.9147 10.8048 4.9429 10.7825 4.9795C1.57795 18.7309 -0.943561 32.1443 0.293408 45.3914C0.299005 45.4562 0.335386 45.5182 0.385761 45.5576C6.45866 50.0174 12.3413 52.7249 18.1147 54.5195C18.2071 54.5477 18.305 54.5139 18.3638 54.4378C19.7295 52.5728 20.9469 50.6063 21.9907 48.5383C22.0523 48.4172 21.9935 48.2735 21.8676 48.2256C19.9366 47.4931 18.0979 46.6 16.3292 45.5858C16.1893 45.5041 16.1781 45.304 16.3068 45.2082C16.679 44.9293 17.0513 44.6391 17.4067 44.3461C17.471 44.2926 17.5606 44.2813 17.6362 44.3151C29.2558 49.6202 41.8354 49.6202 53.3179 44.3151C53.3935 44.2785 53.4831 44.2898 53.5502 44.3433C53.9057 44.6363 54.2779 44.9293 54.6529 45.2082C54.7816 45.304 54.7732 45.5041 54.6333 45.5858C52.8646 46.6197 51.0259 47.4931 49.0921 48.2228C48.9662 48.2707 48.9102 48.4172 48.9718 48.5383C50.038 50.6034 51.2554 52.5699 52.5959 54.435C52.6519 54.5139 52.7526 54.5477 52.845 54.5195C58.6464 52.7249 64.529 50.0174 70.6019 45.5576C70.6551 45.5182 70.6887 45.459 70.6943 45.3942C72.1747 30.0791 68.2147 16.7757 60.1968 4.9823C60.1772 4.9429 60.1437 4.9147 60.1045 4.8978ZM23.7259 37.3253C20.2276 37.3253 17.3451 34.1136 17.3451 30.1693C17.3451 26.225 20.1717 23.0133 23.7259 23.0133C27.308 23.0133 30.1626 26.2532 30.1066 30.1693C30.1066 34.1136 27.28 37.3253 23.7259 37.3253ZM47.3178 37.3253C43.8196 37.3253 40.9371 34.1136 40.9371 30.1693C40.9371 26.225 43.7636 23.0133 47.3178 23.0133C50.9 23.0133 53.7545 26.2532 53.6986 30.1693C53.6986 34.1136 50.9 37.3253 47.3178 37.3253Z" fill="white"/>
              </svg>
              {actionLoading === 'discord-connect' ? 'CONNECTING...' : 'CONNECT DISCORD'}
            </button>
          </div>
        )}
      </SectionCard>

      {/* Steam connection card */}
      <SectionCard title="Steam Account" tag="IDENTITY">
        {steamLinked ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            {steamAvatar ? (
              <img
                src={steamAvatar}
                alt={steamUsername || 'Steam'}
                style={{ width: 44, height: 44, borderRadius: '50%', border: `2px solid ${STEAM_LIGHT}60`, objectFit: 'cover' }}
              />
            ) : (
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: STEAM_BLUE,
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: STEAM_LIGHT, fontSize: 18, fontWeight: 700 }}>
                {(steamUsername || user.username || '?')[0].toUpperCase()}
              </div>
            )}
            <div style={{ flex: 1 }}>
              <div style={{ ...M, fontSize: 12, color: 'var(--text)', fontWeight: 700 }}>{steamUsername || 'Steam Account'}</div>
              <div style={{ ...M, fontSize: 11, color: STEAM_LIGHT, letterSpacing: 1, marginTop: 2 }}>STEAM ID: {steamId || '—'}</div>
              {steamHex && <div style={{ ...M, fontSize: 11, color: 'var(--muted)', letterSpacing: 1, marginTop: 2 }}>{steamHex}</div>}
            </div>
            <Badge label="CONNECTED" color={CLRS.green} icon="✓" />
            {providerAction('steam', steamLinked)}
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ ...M, fontSize: 11, color: 'var(--text)', fontWeight: 700, marginBottom: 4 }}>Steam not linked</div>
              <div style={{ ...M, fontSize: 11, color: 'var(--muted)' }}>Link Steam to keep your FiveM identifier attached to this account.</div>
            </div>
            <button
              onClick={connectSteam}
              disabled={actionLoading === 'steam-connect' || identityLocked}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: STEAM_BLUE, border: `1px solid ${STEAM_LIGHT}55`, borderRadius: 8,
                padding: '10px 20px', color: '#c7d5e0', ...M, fontSize: 11, letterSpacing: 2,
                cursor: actionLoading === 'steam-connect' || identityLocked ? 'not-allowed' : 'pointer', transition: 'opacity 0.15s',
                opacity: actionLoading === 'steam-connect' || identityLocked ? 0.6 : 1,
              }}
              onMouseEnter={e => { if (!e.currentTarget.disabled) e.currentTarget.style.opacity = '0.85' }}
              onMouseLeave={e => { if (!e.currentTarget.disabled) e.currentTarget.style.opacity = '1' }}
            >
              <svg width="16" height="16" viewBox="0 0 233 233" fill="#c7d5e0">
                <path d="M116.5 18C62.7 18 18.8 60.9 18 114.5l52.7 21.8a29.6 29.6 0 0 1 16.6-5c.6 0 1.2 0 1.8.1L112 99.8v-.5c0-21.8 17.7-39.5 39.5-39.5S191 77.5 191 99.3s-17.7 39.5-39.5 39.5l-31.6 23.1c0 .5.1 1 .1 1.5 0 16.4-13.3 29.7-29.7 29.7-14.4 0-26.4-10.3-29.2-23.9L4.4 148.6C14.7 195.8 56.5 231 106.5 231c2.6 0 5.2-.1 7.8-.2C175 227.4 223 176.5 223 115c0-53.7-43.8-97-106.5-97zm-26 152.2c-8.5 3.4-18.1-.7-21.4-9.2s.7-18.1 9.2-21.5l9.2-3.7a21.8 21.8 0 1 0 3 34.4zM151.5 127a27.7 27.7 0 1 1 0-55.4 27.7 27.7 0 0 1 0 55.4zm0-11.1a16.6 16.6 0 1 0 0-33.2 16.6 16.6 0 0 0 0 33.2z"/>
              </svg>
              {actionLoading === 'steam-connect' ? 'CONNECTING...' : 'CONNECT STEAM'}
            </button>
          </div>
        )}
      </SectionCard>

      {/* Whitelist application status */}
      <SectionCard title="Whitelist Application" tag="FIVEM">
        {error && (
          <div style={{ ...M, fontSize: 11, color: CLRS.red, padding: '10px 14px',
            background: 'rgba(255,71,87,0.07)', border: '1px solid rgba(255,71,87,0.25)', borderRadius: 6, marginBottom: 14 }}>
            ⚠  {error}
          </div>
        )}

        {!error && !wl && (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
            <div style={{ ...M, fontSize: 11, color: 'var(--muted)', marginBottom: 16 }}>No whitelist application found.</div>
            {discordLinked ? (
              <a href="/whitelist" style={{ display: 'inline-block', ...M, fontSize: 11, letterSpacing: 2,
                color: CLRS.green, padding: '9px 20px', border: `1px solid ${CLRS.green}55`, borderRadius: 7, textDecoration: 'none' }}>
                APPLY NOW →
              </a>
            ) : (
              <div style={{ ...M, fontSize: 11, color: 'var(--muted)' }}>Link your Discord first to apply.</div>
            )}
          </div>
        )}

        {wl && (() => {
          const playedAt = wl.last_played_at || wl.last_seen_at || wl.played_at || null
          const effectiveStatus = wl.display_status || (wl.status === 'approved' && playedAt ? 'active' : wl.status)
          const st = WL_STATUS_MAP[effectiveStatus] || WL_STATUS_MAP.pending
          const activeStep = st.step
          return (
            <div>
              {/* Progress stepper */}
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24, gap: 0 }}>
                {WL_STEPS.map((step, i) => {
                  const done = i < activeStep
                  const current = i === activeStep
                  const color = done || current ? (effectiveStatus === 'denied' && i === 1 ? CLRS.red : CLRS.green) : 'var(--border)'
                  return (
                    <React.Fragment key={step.key}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flex: 1 }}>
                        <div style={{ width: 36, height: 36, borderRadius: '50%',
                          background: done || current ? color + '20' : 'var(--bg3)',
                          border: `2px solid ${done || current ? color : 'var(--border)'}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 16, transition: 'all 0.3s',
                          boxShadow: current ? `0 0 12px ${color}55` : 'none',
                        }}>
                          {step.icon}
                        </div>
                        <div style={{ ...M, fontSize: 11, letterSpacing: 1,
                          color: done || current ? color : 'var(--muted)',
                          textAlign: 'center', maxWidth: 70 }}>
                          {step.label.toUpperCase()}
                        </div>
                      </div>
                      {i < WL_STEPS.length - 1 && (
                        <div style={{ flex: 1, height: 2, background: i < activeStep ? CLRS.green : 'var(--border)',
                          transition: 'background 0.3s', marginBottom: 22 }} />
                      )}
                    </React.Fragment>
                  )
                })}
              </div>

              {/* Status badge */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16,
                padding: '12px 16px', background: st.color + '10', border: `1px solid ${st.color}40`, borderRadius: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: st.color,
                  boxShadow: `0 0 8px ${st.color}`, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ ...M, fontSize: 11, color: st.color, fontWeight: 700, letterSpacing: 1 }}>{st.label}</div>
                  {wl.status === 'denied' && wl.denial_reason && (
                    <div style={{ ...M, fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>Reason: {wl.denial_reason}</div>
                  )}
                  {effectiveStatus === 'active' && playedAt && (
                    <div style={{ ...M, fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>
                      Last played {ago(playedAt)}{wl.last_played_name ? ` as ${wl.last_played_name}` : ''}
                    </div>
                  )}
                </div>
                {wl.submitted_at && (
                  <div style={{ ...M, fontSize: 11, color: 'var(--muted)' }}>Submitted {ago(wl.submitted_at)}</div>
                )}
              </div>

              {/* Application details */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }} className="profile-grid-2">
                {[
                  ['CHARACTER', wl.character_name || '—'],
                  ['FIVEM ID',  wl.fivem_id       || '—'],
                  ['DISCORD',   wl.discord_name   || '—'],
                  ['SERVER',    wl.txadmin_synced ? '✓ Synced' : '⏳ Pending'],
                  ['LAST PLAYED', playedAt ? new Date(playedAt).toLocaleString() : '—'],
                  ['PRIORITY',  Number(wl.priority_level || 0) > 0
                    ? `${wl.priority_tier || 'Priority'} (${wl.priority_level})${wl.priority_expires_at ? ' until ' + new Date(wl.priority_expires_at).toLocaleDateString() : ''}`
                    : '—'],
                ].map(([k, v]) => (
                  <div key={k} style={{ padding: '9px 12px', background: 'var(--bg3)', borderRadius: 6, border: '1px solid var(--border)' }}>
                    <div style={{ ...M, fontSize: 11, letterSpacing: 2, color: 'var(--muted)', marginBottom: 3 }}>{k}</div>
                    <div style={{ ...M, fontSize: 11, color: 'var(--text)' }}>{v}</div>
                  </div>
                ))}
              </div>

              {/* Re-apply if denied */}
              {wl.status === 'denied' && (
                <div style={{ marginTop: 16, textAlign: 'center' }}>
                  <a href="/whitelist" style={{ display: 'inline-block', ...M, fontSize: 11, letterSpacing: 2,
                    color: CLRS.cyan, padding: '9px 20px', border: `1px solid ${CLRS.cyan}55`, borderRadius: 7, textDecoration: 'none' }}>
                    SUBMIT NEW APPLICATION →
                  </a>
                </div>
              )}
            </div>
          )
        })()}
      </SectionCard>

      <SectionCard title="Applications" tag="FORMS">
        {formsLoading ? (
          <div style={{ ...M, fontSize: 11, color: 'var(--muted)', letterSpacing: 2, padding: '16px 0', textAlign: 'center' }}>LOADING APPLICATIONS...</div>
        ) : formSubmissions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '18px 0' }}>
            <div style={{ ...M, fontSize: 11, color: 'var(--muted)', marginBottom: 12 }}>No community applications submitted yet.</div>
            <a href="/forms" style={{ ...M, fontSize: 11, color: CLRS.cyan, letterSpacing: 2, textDecoration: 'none' }}>BROWSE FORMS {'->'}</a>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {formSubmissions.map(sub => {
              const stKey = sub.display_status || sub.status || 'pending'
              const st = WL_STATUS_MAP[stKey] || WL_STATUS_MAP.pending
              return (
                <div key={sub.id} style={{ padding: 13, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
                    <div>
                      <div style={{ ...M, fontSize: 12, color: 'var(--text)', fontWeight: 700 }}>{sub.form_title || sub.form_slug || 'Application'}</div>
                      <div style={{ ...M, fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>Submitted {sub.created_at ? ago(sub.created_at) : '-'}</div>
                    </div>
                    <Badge label={st.label || stKey.toUpperCase()} color={st.color || CLRS.cyan} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 8 }}>
                    {[
                      ['STATUS', stKey],
                      ['ACTION', sub.action_status || 'not queued'],
                      ['LAST ACTIVE', sub.last_active_at ? `${ago(sub.last_active_at)}${sub.last_active_name ? ` as ${sub.last_active_name}` : ''}` : '-'],
                      ['REVIEW NOTE', sub.reviewer_note || '-'],
                    ].map(([k, v]) => (
                      <div key={k} style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, background: 'rgba(255,255,255,0.02)' }}>
                        <div style={{ ...M, fontSize: 11, letterSpacing: 2, color: 'var(--muted)', marginBottom: 3 }}>{k}</div>
                        <div style={{ ...M, fontSize: 11, color: 'var(--text)' }}>{v}</div>
                      </div>
                    ))}
                  </div>
                  {sub.action_sync_error && <StatusMsg msg={sub.action_sync_error} type="error" />}
                </div>
              )
            })}
          </div>
        )}
      </SectionCard>
    </div>
  )
}

/* ─── Orders & Documents tab ─────────────────────────────────────────────── */
function OrdersDocumentsTab({ user }) {
  const toast = useToast()
  const [orders, setOrders] = useState([])
  const [ordersLoading, setOrdersLoading] = useState(true)
  const [detail, setDetail] = useState(null)
  const [docs, setDocs] = useState([])
  const [docsLoading, setDocsLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [docName, setDocName] = useState('')
  const [docCategory, setDocCategory] = useState('other')

  const statusColor = s =>
    s === 'delivered' || s === 'paid' ? CLRS.green
    : s === 'cancelled' || s === 'refunded' ? CLRS.red
    : s === 'shipped' ? CLRS.purple
    : s === 'processing' ? CLRS.cyan : CLRS.orange

  const inputStyle = {
    flex: 1, minWidth: 160, padding: '9px 12px', fontSize: 12, color: 'var(--text)',
    background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, outline: 'none',
  }
  const ghostBtn = {
    background: 'none', border: '1px solid var(--border)', color: 'var(--muted)',
    fontSize: 11, letterSpacing: 1, padding: '6px 10px', borderRadius: 5, cursor: 'pointer',
  }

  const loadOrders = () => {
    setOrdersLoading(true)
    api.get('/store/orders')
      .then(r => setOrders(Array.isArray(r.data) ? r.data : []))
      .catch(() => setOrders([]))
      .finally(() => setOrdersLoading(false))
  }
  const loadDocs = () => {
    setDocsLoading(true)
    api.get('/documents')
      .then(r => setDocs(Array.isArray(r.data) ? r.data : []))
      .catch(() => setDocs([]))
      .finally(() => setDocsLoading(false))
  }
  useEffect(() => {
    void (async () => { await loadOrders() })()
    void (async () => { await loadDocs() })()
  }, [user?.id])

  const openDetail = async (o) => {
    try {
      const r = await api.get(`/store/orders/${o.order_number}`)
      setDetail(r.data || o)
    } catch { setDetail(o) }
  }

  const onUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const fd = new FormData()
    fd.append('file', file)
    if (docName.trim()) fd.append('name', docName.trim())
    fd.append('category', docCategory || 'other')
    try {
      await api.post('/documents', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      toast.success('Document uploaded')
      setDocName('')
      loadDocs()
    } catch (err) {
      toast.error(err?.response?.data?.detail || err?.response?.data?.error || 'Upload failed')
    } finally { setUploading(false); e.target.value = '' }
  }

  const onDelete = async (id) => {
    if (!window.confirm('Delete this document?')) return
    try {
      await api.delete(`/documents/${id}`)
      toast.success('Document deleted')
      loadDocs()
    } catch (err) { toast.error(err?.response?.data?.detail || 'Delete failed') }
  }

  const downloadDoc = async (id, name) => {
    try {
      const r = await api.get(`/documents/${id}/content`, { responseType: 'blob' })
      const url = URL.createObjectURL(r.data)
      const a = document.createElement('a')
      a.href = url; a.download = name || 'document'; a.click()
      setTimeout(() => URL.revokeObjectURL(url), 4000)
    } catch (err) { toast.error(err?.response?.data?.detail || 'Download failed') }
  }

  return (
    <div>
      <SectionCard title="My Orders" tag="ORDER TRACKER">
        {ordersLoading ? <div className="loader" /> : orders.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--muted)', padding: '8px 0' }}>No orders yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {orders.map(o => (
              <div key={o.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', cursor: 'pointer' }} onClick={() => openDetail(o)} role="button" tabIndex={0} onKeyDown={(e)=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); e.currentTarget.click() } }}>
                  <span style={{ ...M, fontSize: 11, color: CLRS.cyan, fontWeight: 700 }}>{o.order_number}</span>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>{o.created_at ? new Date(o.created_at).toLocaleDateString() : ''}</span>
                  <span style={{ flex: 1 }} />
                  <span style={{ ...M, fontSize: 12, fontWeight: 800 }}>${(o.total_cents / 100).toFixed(2)}</span>
                  <span style={{ ...M, fontSize: 11, letterSpacing: 1.5, padding: '3px 10px', borderRadius: 12, border: `1px solid ${statusColor(o.status)}55`, color: statusColor(o.status), fontWeight: 800 }}>{(o.status || '').toUpperCase()}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                  {(o.items || []).map((it, i) => (
                    <span key={i} style={{ fontSize: 11, color: 'var(--muted)', background: 'rgba(255,255,255,0.03)', padding: '3px 8px', borderRadius: 5 }}>{it.product_name} × {it.quantity}</span>
                  ))}
                </div>
                {o.tracking_number && (
                  <div style={{ ...M, fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>
                    📦 {o.carrier || 'Carrier'}: {o.tracking_number}
                    {o.tracking_url && <a href={o.tracking_url} target="_blank" rel="noreferrer" style={{ color: CLRS.cyan, marginLeft: 8 }}>TRACK ↗</a>}
                  </div>
                )}
                {(o.downloads || []).length > 0 && (
                  <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {o.downloads.map(d => (
                      <a key={d.id} href={`/api/store/downloads/${d.token}`} target="_blank" rel="noreferrer"
                        style={{ fontSize: 11, color: CLRS.green, border: `1px solid ${CLRS.green}40`, borderRadius: 5, padding: '4px 8px', textDecoration: 'none' }}>
                        ⬇ {d.filename || d.product_name} ({d.downloads_used}/{d.downloads_allowed})
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {detail && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }} onClick={() => setDetail(null)} role="button" tabIndex={0} onKeyDown={(e)=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); e.currentTarget.click() } }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }} role="button" tabIndex={0} onKeyDown={(e)=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); e.currentTarget.click() } }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ ...M, fontSize: 12, letterSpacing: 2, color: CLRS.green, fontWeight: 800 }}>{detail.order_number}</div>
              <span style={{ ...M, fontSize: 11, letterSpacing: 1.5, padding: '3px 10px', borderRadius: 12, border: `1px solid ${CLRS.cyan}55`, color: CLRS.cyan, fontWeight: 800 }}>{(detail.status || '').toUpperCase()}</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 12 }}>
              Placed {detail.created_at ? new Date(detail.created_at).toLocaleString() : '—'}
              {(detail.carrier || detail.tracking_number) && <div style={{ marginTop: 4 }}>📦 {detail.carrier || ''} {detail.tracking_number || ''}</div>}
            </div>
            <div style={{ ...M, fontSize: 11, letterSpacing: 2, color: CLRS.cyan, marginBottom: 6, fontWeight: 800 }}>STATUS TIMELINE</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
              {(detail.events || []).length === 0 ? (
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>No updates yet.</span>
              ) : detail.events.map((ev, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 11 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', marginTop: 4, background: CLRS.green, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ color: 'var(--text)', fontWeight: 700 }}>{(ev.status || '').toUpperCase()}</div>
                    {ev.note && <div style={{ color: 'var(--muted)', fontSize: 11 }}>{ev.note}</div>}
                    <div style={{ color: 'var(--muted)', fontSize: 11 }}>{ev.created_at ? new Date(ev.created_at).toLocaleString() : ''}</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ ...M, fontSize: 11, letterSpacing: 2, color: CLRS.cyan, marginBottom: 6, fontWeight: 800 }}>ITEMS</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
              {(detail.items || []).map((it, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                  <span style={{ color: 'var(--text)' }}>{it.product_name} × {it.quantity}</span>
                  <span style={{ color: 'var(--muted)' }}>${((it.line_total_cents || 0) / 100).toFixed(2)}</span>
                </div>
              ))}
            </div>
            <div style={{ ...M, fontSize: 11, letterSpacing: 2, color: CLRS.cyan, marginBottom: 6, fontWeight: 800 }}>DOWNLOADS</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
              {(detail.downloads || []).length === 0 ? (
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>None</span>
              ) : detail.downloads.map(d => (
                <a key={d.id} href={`/api/store/downloads/${d.token}`} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: CLRS.green, textDecoration: 'none' }}>
                  ⬇ {d.filename || d.product_name} ({d.downloads_used}/{d.downloads_allowed})
                </a>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setDetail(null)} style={ghostBtn}>CLOSE</button>
            </div>
          </div>
        </div>
      )}

      <SectionCard title="Documents" tag="PROFILE FILES" action={
        <label style={{ ...M, fontSize: 11, letterSpacing: 2, fontWeight: 800, padding: '8px 14px', color: '#000', background: 'var(--green)', borderRadius: 6, cursor: 'pointer' }}>
          {uploading ? 'UPLOADING…' : '+ UPLOAD'}
          <input type="file" hidden onChange={onUpload} />
        </label>
      }>
        <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          <input value={docName} onChange={e => setDocName(e.target.value)} placeholder="Document name (optional)" style={inputStyle} />
          <select value={docCategory} onChange={e => setDocCategory(e.target.value)} style={{ ...inputStyle, maxWidth: 140 }}>
            {['other', 'id', 'license', 'proof', 'contract'].map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        {docsLoading ? <div className="loader" /> : docs.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--muted)', padding: '8px 0' }}>No documents uploaded yet. Upload an ID, license or proof document above.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {docs.map(d => (
              <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px' }}>
                <span style={{ fontSize: 14 }}>📄</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: 'var(--text)', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                    {d.category} · {d.mime_type} · {d.file_size ? (d.file_size / 1024).toFixed(1) + ' KB' : '—'} · {d.created_at ? new Date(d.created_at).toLocaleDateString() : ''}
                  </div>
                </div>
                <button onClick={() => downloadDoc(d.id, d.name)} style={ghostBtn}>⬇</button>
                <button onClick={() => onDelete(d.id)} style={{ ...ghostBtn, color: CLRS.red, borderColor: CLRS.red + '55' }}>✕</button>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  )
}

/* ─── Main ForumProfile page ─────────────────────────────────────────────── */
const TABS = [
  { key: 'overview',  label: '⊞ Overview',        },
  { key: 'tickets',   label: '🎫 My Tickets',     },
  { key: 'orders',    label: '🧾 Orders & Docs',  },
  { key: 'activity',  label: '💬 Forum Activity', },
  { key: 'fivem',     label: '🎮 FiveM',          },
  { key: 'edit',      label: '✎ Edit Profile',   },
  { key: 'security',  label: '🔒 Security',       },
]

export default function ForumProfile() {
  const { user: ctxUser, loading: forumLoading } = useForum()
  const navigate = useNavigate()
  const [user, setUser]     = useState(null)
  const [tickets, setTickets] = useState([])
  const [tab, setTab]       = useState(() => {
    if (typeof window === 'undefined') return 'overview'
    const params = new URLSearchParams(window.location.search)
    if (params.get('ticket')) return 'tickets'
    const requested = params.get('tab')
    return TABS.some(t => t.key === requested) ? requested : 'overview'
  })
  const [profileTicketId, setProfileTicketId] = useState(() => {
    if (typeof window === 'undefined') return null
    return new URLSearchParams(window.location.search).get('ticket')
  })
  const [loading, setLoading] = useState(true)
  const loadedTicketsForRef = useRef(null)

  useEffect(() => {
    if (forumLoading) return
    if (!ctxUser) { navigate('/login?tab=signin&next=%2Fprofile'); return }
    void (async () => {
      setUser(ctxUser)
      setLoading(false)
      // Load tickets for overview
      if (ctxUser.email && loadedTicketsForRef.current !== ctxUser.email) {
        loadedTicketsForRef.current = ctxUser.email
        try {
          const r = await api.get('/helpdesk/tickets/mine')
          setTickets(Array.isArray(r.data) ? r.data : [])
        } catch {
          loadedTicketsForRef.current = null
        }
      }
    })()
  }, [ctxUser, forumLoading, navigate])

  const updateProfileUrl = useCallback((nextTab, ticketId) => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (nextTab && nextTab !== 'overview') params.set('tab', nextTab)
    else params.delete('tab')
    if (ticketId) params.set('ticket', ticketId)
    else params.delete('ticket')
    const query = params.toString()
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`)
  }, [])

  const selectTab = useCallback((nextTab) => {
    setTab(nextTab)
    if (nextTab !== 'tickets') setProfileTicketId(null)
    updateProfileUrl(nextTab, nextTab === 'tickets' ? profileTicketId : null)
  }, [profileTicketId, updateProfileUrl])

  const openTicket = useCallback((ticketId) => {
    setTab('tickets')
    setProfileTicketId(ticketId || null)
    updateProfileUrl('tickets', ticketId || null)
  }, [updateProfileUrl])

  useEffect(() => {
    const onPop = () => {
      const params = new URLSearchParams(window.location.search)
      const requested = params.get('tab')
      const ticketId = params.get('ticket')
      setTab(ticketId ? 'tickets' : TABS.some(t => t.key === requested) ? requested : 'overview')
      setProfileTicketId(ticketId)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  if (loading || !user) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', ...M, fontSize: 11, letterSpacing: 3, color: 'var(--muted)' }}>LOADING PROFILE…</div>
  }

  const roleCfg = {
    admin:     { color: CLRS.red,    label: 'ADMIN'     },
    moderator: { color: CLRS.orange, label: 'MODERATOR' },
    editor:    { color: CLRS.purple, label: 'EDITOR'    },
    user:      { color: CLRS.cyan,   label: 'MEMBER'    },
    member:    { color: CLRS.cyan,   label: 'MEMBER'    },
  }
  const role = roleCfg[user.role] || { color: CLRS.cyan, label: (user.role || 'MEMBER').toUpperCase() }

  return (
    <div style={{ minHeight: '100vh', paddingTop: 80 }}>
      <style>{`
        .profile-act-grid  { grid-template-columns: 1fr 1fr !important; }
        .profile-grid-2    { grid-template-columns: 1fr 1fr !important; }
        @media (max-width: 900px) {
          .profile-layout   { grid-template-columns: 1fr !important; }
          .profile-act-grid { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 600px) {
          .profile-grid-2   { grid-template-columns: 1fr !important; }
          .profile-tabs-row { flex-direction: column !important; }
        }
      `}</style>

      {/* ── Hero banner ── */}
      <div style={{ borderBottom: '1px solid var(--border)', position: 'relative', overflow: 'hidden' }} className="profile-hero">
        {/* Grid bg */}
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(color-mix(in srgb, var(--cyan) 3%, transparent) 1px,transparent 1px),linear-gradient(90deg,color-mix(in srgb, var(--cyan) 3%, transparent) 1px,transparent 1px)', backgroundSize: '40px 40px', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: -80, right: -80, width: 320, height: 320, borderRadius: '50%', background: 'radial-gradient(circle,color-mix(in srgb, var(--green) 6%, transparent) 0%,transparent 70%)', pointerEvents: 'none' }} />

        <div className="profile-hero-inner">
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 24, flexWrap: 'wrap', position: 'relative', zIndex: 1 }}>
            {/* Avatar */}
            <div style={{ position: 'relative' }}>
              <Avatar user={user} size={88} />
              <div style={{ position: 'absolute', bottom: 2, right: 2, width: 14, height: 14, borderRadius: '50%',
                background: CLRS.green, border: '2px solid var(--bg)', boxShadow: `0 0 6px ${CLRS.green}` }} />
            </div>

            {/* Info */}
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
                <h1 style={{ ...D, fontSize: 28, fontWeight: 800, margin: 0, letterSpacing: -0.5 }}>{user.username}</h1>
                <Badge label={role.label} color={role.color} />
              </div>
              {user.bio && <p style={{ ...M, fontSize: 11, color: 'var(--muted)', margin: 0, lineHeight: 1.6, maxWidth: 420 }}>{user.bio}</p>}
              <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
                <span style={{ ...M, fontSize: 11, color: 'var(--muted)' }}>📧 {user.email || '—'}</span>
                <span style={{ ...M, fontSize: 11, color: 'var(--muted)' }}>🕒 Last seen {ago(user.last_seen)}</span>
                <span style={{ ...M, fontSize: 11, color: 'var(--muted)' }}>📅 Joined {user.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}</span>
              </div>
            </div>

            {/* Quick stats */}
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              {[
                { label: 'TICKETS', value: tickets.length, color: CLRS.cyan   },
                { label: 'OPEN',    value: tickets.filter(t => t.status === 'open').length, color: CLRS.orange },
              ].map(s => (
                <div key={s.label} onClick={() => openTicket(null)} className="forum-stat-tile" style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '10px 16px', textAlign: 'center' }} role="button" tabIndex={0} onKeyDown={(e)=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); e.currentTarget.click() } }}>
                  <div style={{ ...M, fontSize: 11, letterSpacing: 2, color: 'var(--muted)', marginBottom: 4 }}>{s.label}</div>
                  <div style={{ ...M, fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</div>
                </div>
              ))}
              {canAccessAdminPortal(user) && <AdminPortalLink compact />}
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 0, marginTop: 28, borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }} className="profile-tabs-row">
            {TABS.map(t => (
              <button key={t.key} onClick={() => selectTab(t.key)} style={{
                ...M, fontSize: 11, letterSpacing: 1, padding: '10px 18px', background: 'none', border: 'none',
                borderBottom: `2px solid ${tab === t.key ? 'var(--cyan)' : 'transparent'}`,
                color: tab === t.key ? 'var(--cyan)' : 'var(--muted)', cursor: 'pointer',
                transition: 'all 0.15s', whiteSpace: 'nowrap',
              }}>{t.label}</button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="profile-body">
        {tab === 'overview'  && <OverviewTab user={user} tickets={tickets} onOpenTicket={openTicket} />}
        {tab === 'tickets'   && <MyTicketsTab user={user} initialTicketId={profileTicketId} onTicketViewChange={openTicket} />}
        {tab === 'orders'    && <OrdersDocumentsTab user={user} />}
        {tab === 'activity'  && <ActivityTab user={user} />}
        {tab === 'fivem'     && <FiveMTab user={user} />}
        {tab === 'edit'      && <ProfileEditTab user={user} onUpdate={u => setUser(prev => ({ ...prev, ...u }))} />}
        {tab === 'security'  && <SecurityTab user={user} />}
      </div>

      <style>{`
        .profile-hero       { padding: 0; }
        .profile-hero-inner { padding: 44px 60px 0; max-width: 1200px; margin: 0 auto; }
        .profile-body       { max-width: 1200px; margin: 0 auto; padding: 32px 60px 80px; }
        @media (max-width: 900px) {
          .profile-hero-inner { padding: 32px 24px 0; }
          .profile-body       { padding: 24px 24px 60px; }
        }
        @media (max-width: 600px) {
          .profile-hero-inner { padding: 24px 16px 0; }
          .profile-body       { padding: 16px 16px 48px; }
        }
      `}</style>
    </div>
  )
}
