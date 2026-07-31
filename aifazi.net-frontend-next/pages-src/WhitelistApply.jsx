'use client'
/**
 * WhitelistApply.jsx — Public whitelist application form for AIFAZI RP
 * Requires site login (ForumContext). If Discord not linked, prompts to connect.
 * Discord ID/username auto-filled from the linked Discord account on the user's profile.
 */
import React, { useState, useEffect } from 'react'
import api from '@/lib/api'
import { useForum } from '@/context/ForumContext'
import { Checkbox } from '../core/ui.jsx'
import { useNotify } from '../core/notify.jsx'
import { MotionPage, usePageConfig } from '../core/pageMotion.jsx'
import { ThreadRowSkeleton } from '../components/Skeleton.jsx'
import { authProviderLoginRoute } from '@/lib/authRoutes'
import { useFiveMLoginRoute, useFiveMRoute } from '@/lib/fivemRoutes'

const G = '#00FF88'
const C = '#00D4FF'
const W = '#ff9f43'
const DISCORD_PURPLE = '#5865F2'
const STAFF_ROLES = new Set(['admin', 'moderator', 'editor', 'chat'])

const RULES = [
  'Stay in character at all times (IC vs OOC)',
  'Value your life — no random deathmatch (RDM)',
  'No vehicle deathmatch (VDM)',
  'Respect all players and staff',
  'No exploiting bugs or using mods/cheats',
  'New Life Rule (NLR) — forget events after death',
  'No metagaming (using OOC info in RP)',
  'Follow staff instructions',
]

function Field({ label, required, children, error, hint }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', fontFamily: 'var(--font-mono)', color: error ? '#ff4757' : 'var(--muted)' }}>
        {label} {required && <span style={{ color: '#ff4757' }}>*</span>}
      </label>
      {children}
      {hint && !error && <span style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>{hint}</span>}
      {error && <span style={{ fontSize: 11, color: '#ff4757' }}>{error}</span>}
    </div>
  )
}

function Input({ value, onChange, placeholder, type = 'text', disabled, readOnly }) {
  return (
    <input type={type} value={value} onChange={e => onChange && onChange(e.target.value)}
      placeholder={placeholder} disabled={disabled} readOnly={readOnly}
      style={{
        background: readOnly ? 'rgba(0,255,136,0.04)' : 'rgba(255,255,255,0.04)',
        border: `1px solid ${readOnly ? G + '30' : 'rgba(255,255,255,0.1)'}`,
        borderRadius: 8, padding: '10px 14px',
        color: readOnly ? G : 'var(--text)',
        fontSize: 14, fontFamily: 'var(--font-mono)', outline: 'none', width: '100%',
        transition: 'border-color 0.15s', cursor: readOnly ? 'default' : 'text',
        boxSizing: 'border-box',
      }}
      onFocus={e => !readOnly && (e.target.style.borderColor = G + '60')}
      onBlur={e => !readOnly && (e.target.style.borderColor = 'rgba(255,255,255,0.1)')}
    />
  )
}

function TextArea({ value, onChange, placeholder, rows = 5, disabled }) {
  return (
    <textarea value={value} onChange={e => onChange(e.target.value)}
      placeholder={placeholder} rows={rows} disabled={disabled}
      style={{
        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 8, padding: '10px 14px', color: 'var(--text)',
        fontSize: 14, fontFamily: 'var(--font-mono)', outline: 'none', width: '100%',
        resize: 'vertical', transition: 'border-color 0.15s', boxSizing: 'border-box',
      }}
      onFocus={e => e.target.style.borderColor = G + '60'}
      onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
    />
  )
}

function InfoBox({ color = C, icon, title, children }) {
  return (
    <div style={{ background: color + '08', border: '1px solid ' + color + '30', borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ fontSize: 12, color: color, fontFamily: 'var(--font-mono)', letterSpacing: 1, marginBottom: 8 }}>
        {icon} {title}
      </div>
      <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.7 }}>
        {children}
      </div>
    </div>
  )
}

function DiscordIcon({ size = 20, fill = '#fff' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 127.14 96.36" fill={fill}>
      <path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z"/>
    </svg>
  )
}

/* ── Login Gate ──────────────────────────────────────────────────────────── */
function LoginGate() {
  const loginHref = useFiveMLoginRoute('/whitelist')
  return (
    <div style={{
      minHeight: '50vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexDirection: 'column', gap: 24, padding: '40px 20px', textAlign: 'center',
    }}>
      <div style={{
        width: 80, height: 80, borderRadius: '50%',
        background: G + '15', border: '2px solid ' + G + '40',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 36,
      }}>
        🔐
      </div>

      <div>
        <h2 style={{ fontFamily: 'var(--font-mono)', color: 'var(--text)', fontSize: 20, margin: '0 0 8px', letterSpacing: 2 }}>
          LOGIN REQUIRED
        </h2>
        <p style={{ color: 'var(--muted)', fontSize: 14, margin: 0, maxWidth: 380, lineHeight: 1.7 }}>
          You must be signed in to submit a whitelist application.
          Create a free account or sign in with Discord.
        </p>
      </div>

      <a href={loginHref} style={{
        display: 'flex', alignItems: 'center', gap: 10,
        background: G + '15', border: '1px solid ' + G + '40',
        borderRadius: 10, padding: '14px 28px', color: G,
        fontFamily: 'var(--font-mono)', fontSize: 13, letterSpacing: 2,
        textDecoration: 'none', transition: 'opacity 0.15s',
      }}>
        SIGN IN / CREATE ACCOUNT →
      </a>

      <p style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: 1 }}>
        Already applied?{' '}
        <a href="/profile" style={{ color: G, textDecoration: 'none' }}>Check your status</a>
      </p>
    </div>
  )
}

/* ── Discord Connect Gate ────────────────────────────────────────────────── */
function DiscordConnectGate({ username }) {
  const whitelistHref = useFiveMRoute('/whitelist')
  return (
    <div style={{
      minHeight: '50vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexDirection: 'column', gap: 24, padding: '40px 20px', textAlign: 'center',
    }}>
      <div style={{
        width: 80, height: 80, borderRadius: '50%',
        background: DISCORD_PURPLE + '20', border: '2px solid ' + DISCORD_PURPLE + '60',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <DiscordIcon size={40} fill={DISCORD_PURPLE} />
      </div>

      <div>
        <h2 style={{ fontFamily: 'var(--font-mono)', color: 'var(--text)', fontSize: 20, margin: '0 0 8px', letterSpacing: 2 }}>
          CONNECT DISCORD
        </h2>
        <p style={{ color: 'var(--muted)', fontSize: 14, margin: 0, maxWidth: 400, lineHeight: 1.7 }}>
          Hi <strong style={{ color: 'var(--text)' }}>{username}</strong>! To apply for whitelist,
          you must link your Discord account. This lets us auto-fill your Discord ID and verify your identity.
        </p>
      </div>

      <button
        onClick={() => { window.location.href = authProviderLoginRoute('discord', whitelistHref) }}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: DISCORD_PURPLE, border: 'none', borderRadius: 10,
          padding: '14px 28px', color: '#fff', fontSize: 14,
          fontFamily: 'var(--font-mono)', letterSpacing: 2, cursor: 'pointer',
          transition: 'opacity 0.15s',
        }}
        onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
        onMouseLeave={e => e.currentTarget.style.opacity = '1'}
      >
        <DiscordIcon size={20} fill="#fff" />
        CONNECT DISCORD
      </button>

      <p style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: 1 }}>
        Already applied?{' '}
        <a href="/profile" style={{ color: G, textDecoration: 'none' }}>Check your status</a>
      </p>
    </div>
  )
}

/* ── Existing Application Gate ───────────────────────────────────────────── */
function ExistingApplicationGate({ application }) {
  const status = application?.display_status || application?.status || 'submitted'
  const statusColor =
    status === 'approved' || status === 'active' ? G :
    status === 'denied' ? '#ff4757' :
    W

  return (
    <div style={{
      minHeight: '50vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexDirection: 'column', gap: 22, padding: '40px 20px', textAlign: 'center',
    }}>
      <div style={{
        width: 80, height: 80, borderRadius: '50%',
        background: statusColor + '15', border: '2px solid ' + statusColor + '40',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 34,
      }}>
        ⏳
      </div>

      <div>
        <h2 style={{ fontFamily: 'var(--font-mono)', color: statusColor, fontSize: 20, margin: '0 0 8px', letterSpacing: 2 }}>
          APPLICATION ALREADY SUBMITTED
        </h2>
        <p style={{ color: 'var(--muted)', fontSize: 14, margin: 0, maxWidth: 460, lineHeight: 1.7 }}>
          You already have a whitelist application with status <strong style={{ color: statusColor }}>{status.toUpperCase()}</strong>.
          To change details or ask staff to review it, please open a ticket.
        </p>
      </div>

      {application?.character_name && (
        <div style={{
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 10, padding: '12px 18px', minWidth: 260,
        }}>
          <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-mono)', letterSpacing: 2, marginBottom: 6 }}>CHARACTER</div>
          <div style={{ fontSize: 15, color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>{application.character_name}</div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
        <a href="/helpdesk" style={{
          display: 'inline-block', padding: '12px 24px',
          background: C + '15', border: '1px solid ' + C + '40',
          color: C, fontFamily: 'var(--font-mono)', fontSize: 12,
          letterSpacing: 2, textDecoration: 'none', borderRadius: 8,
        }}>OPEN A TICKET</a>
        <a href="/profile" style={{
          display: 'inline-block', padding: '12px 24px',
          background: G + '12', border: '1px solid ' + G + '35',
          color: G, fontFamily: 'var(--font-mono)', fontSize: 12,
          letterSpacing: 2, textDecoration: 'none', borderRadius: 8,
        }}>VIEW PROFILE</a>
      </div>
    </div>
  )
}

/* ── Main Form ───────────────────────────────────────────────────────────── */
export default function WhitelistApply() {
  const { user, loading: authLoading } = useForum()
  const notify = useNotify()
  const pageConfig = usePageConfig('whitelist', {})
  const isStaffPreview = !!user && (user._staff || user.staff_account || STAFF_ROLES.has(user.role))

  // Verify Discord link via API — user.discord_id from context may be stale
  // if the backend /me endpoint was not yet updated to return Discord fields.
  const [discordStatus, setDiscordStatus] = useState(null)
  const [discordLoading, setDiscordLoading] = useState(false)
  const [existingApp,    setExistingApp]    = useState(null)
  const [checksLoading,  setChecksLoading]  = useState(false)
  const [forms,          setForms]          = useState([])
  const [whitelistDef,   setWhitelistDef]   = useState(null)

  useEffect(() => {
    const cacheKey = 'aifazi_forms_cache_v1'
    try {
      const cached = JSON.parse(sessionStorage.getItem(cacheKey) || 'null')
      if (cached?.ts && Date.now() - cached.ts < 60000) setForms(cached.forms || [])
    } catch {}
    api.get('/forms/whitelist').then(r => setWhitelistDef(r.data)).catch(() => {})
    api.get('/forms')
      .then(r => {
        const rows = r.data.forms || []
        setForms(rows)
        try { sessionStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), forms: rows })) } catch {}
      })
      .catch(() => setForms([]))
  }, [])

  useEffect(() => {
    if (!user) { setDiscordLoading(false); setExistingApp(null); return }
    if (isStaffPreview) {
      setDiscordStatus({ has_discord: true, discord_id: null, staff_account: true, preview_only: true })
      setExistingApp(null)
      setDiscordLoading(false)
      setChecksLoading(false)
      return
    }
    const token = localStorage.getItem('auth_token')
    if (!token) { setDiscordLoading(false); setExistingApp(null); return }
    let cancelled = false
    const headers = { Authorization: `Bearer ${token}` }
    setChecksLoading(true)
    setDiscordLoading(true)
    const getWithTimeout = (request, fallback, timeoutMs = 7000) => {
      let timer
      const timeout = new Promise(resolve => {
        timer = setTimeout(() => resolve({ data: fallback, timedOut: true }), timeoutMs)
      })
      return Promise.race([
        request.catch(() => ({ data: fallback })),
        timeout,
      ]).finally(() => clearTimeout(timer))
    }

    // Run both checks independently so a slow whitelist lookup does not pin the whole page on LOADING.
    Promise.allSettled([
      getWithTimeout(
        api.get('/auth/discord/whitelist-status', { headers }),
        { has_discord: !!user.discord_id, discord_id: user.discord_id || null },
      ),
      getWithTimeout(
        api.get('/fivem/whitelist/my-application', { headers }),
        null,
      ),
    ]).then(results => {
      if (cancelled) return
      const discordRes = results[0]?.status === 'fulfilled'
        ? results[0].value
        : { data: { has_discord: !!user.discord_id, discord_id: user.discord_id || null } }
      const appRes = results[1]?.status === 'fulfilled' ? results[1].value : { data: null }
      setDiscordStatus(discordRes.data)
      setExistingApp(appRes.data || discordRes.data?.application || null)
    }).finally(() => {
      if (!cancelled) {
        setDiscordLoading(false)
        setChecksLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [user, isStaffPreview])

  // Resolved Discord identity — prefer API response, fall back to context
  const resolvedDiscordId       = discordStatus?.discord_id || user?.discord_id || null
  const resolvedDiscordUsername = user?.discord_username || discordStatus?.application?.discord_name || user?.username || ''
  const discordLinked           = isStaffPreview || (discordStatus?.has_discord ?? !!resolvedDiscordId)

  // Resolved Steam identity — from /me endpoint (includes steam_hex computed server-side)
  const resolvedSteamId  = user?.steam_id || null
  const resolvedSteamHex = user?.steam_hex || (resolvedSteamId
    ? (() => { try { return `steam:${BigInt(resolvedSteamId).toString(16)}` } catch { return '' } })()
    : '')

  const wlField = id => (whitelistDef?.fields || []).find(f => f.id === id) || {}
  const wlLabel = (id, fallback) => wlField(id).label || fallback
  const wlHint = (id, fallback) => wlField(id).help || wlField(id).placeholder || fallback
  const wlMin = (id, fallback) => Number(wlField(id).min_length || fallback)
  const wlTitle = whitelistDef?.title || 'WHITELIST APPLICATION'
  const wlIntro = whitelistDef?.intro || 'Tell us who you are, what story you want to create, and how you understand serious RP.'

  const [form, setForm] = useState({
    steam_hex: '', fivem_id: '',
    character_name: '', character_backstory: '', why_join: '',
    age: '', rp_experience: '', roleplay_style: '', availability: '',
    rule_scenario: '', extra_notes: '', rules_accepted: false,
  })
  const [errors,      setErrors]      = useState({})
  const [submitting,  setSubmitting]  = useState(false)
  const [done,        setDone]        = useState(false)
  const [serverError, setServerError] = useState('')

  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setErrors(e => ({ ...e, [k]: '' })) }

  const validate = () => {
    const e = {}
    if (form.fivem_id.trim() && !/^\d{1,8}$/.test(form.fivem_id.trim()))
      e.fivem_id = 'FiveM ID must be a number only (e.g. 4463431)'
    if (form.steam_hex.trim() && !/^(steam:)?1100001[0-9a-fA-F]{8}$/.test(form.steam_hex.trim()))
      e.steam_hex = 'Invalid Steam hex — must be steam:1100001... with 8 hex chars'
    if (!form.character_name.trim())     e.character_name = 'Required'
    if (!form.character_backstory.trim() || form.character_backstory.length < wlMin('character_backstory', 80))
      e.character_backstory = `Minimum ${wlMin('character_backstory', 80)} characters`
    if (!form.why_join.trim() || form.why_join.length < wlMin('why_join', 40))
      e.why_join = `Minimum ${wlMin('why_join', 40)} characters`
    if (!form.age || Number(form.age) < 16 || Number(form.age) > 99)
      e.age = 'Must be between 16 and 99'
    if (!form.rp_experience.trim())      e.rp_experience = 'Required'
    if (!form.roleplay_style.trim())      e.roleplay_style = 'Required'
    if (!form.availability.trim())        e.availability = 'Required'
    if (!form.rule_scenario.trim() || form.rule_scenario.length < wlMin('rule_scenario', 60))
      e.rule_scenario = `Minimum ${wlMin('rule_scenario', 60)} characters`
    if (!form.rules_accepted)             e.rules_accepted = 'You must accept the server rules'
    return e
  }

  const submit = async () => {
    if (isStaffPreview) {
      const text = 'Admin preview mode is read-only. Use the admin panel to manage or add applications.'
      setServerError(text)
      notify.info(text, { title: 'Preview mode' })
      return
    }
    if (existingApp) {
      setServerError('You already submitted a whitelist application. Please open a ticket if you need to change anything.')
      return
    }
    const e = validate()
    if (Object.keys(e).length) { setErrors(e); return }
    setSubmitting(true); setServerError('')
    try {
      const token = localStorage.getItem('auth_token')
      await api.post('/fivem/whitelist/apply', {
        // Identity anchors
        forum_user_id:       user?.id || user?._id || null,
        forum_username:      user?.username || null,
        discord_id:          resolvedDiscordId || null,
        discord_name:        resolvedDiscordUsername || null,
        // FiveM identifiers (all optional)
        fivem_id:            form.fivem_id.trim() || null,
        steam_hex:           (resolvedSteamHex || form.steam_hex).trim() || null,
        // Application fields
        character_name:      form.character_name.trim(),
        character_backstory: form.character_backstory.trim(),
        why_join:            form.why_join.trim(),
        age:                 Number(form.age),
        rp_experience:       form.rp_experience.trim(),
        extra_answers: {
          roleplay_style: form.roleplay_style.trim(),
          availability: form.availability.trim(),
          rule_scenario: form.rule_scenario.trim(),
          extra_notes: form.extra_notes.trim(),
        },
        email:               user?.email || '',
        rules_accepted:      form.rules_accepted,
      }, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      notify.success('Whitelist application submitted.', { title: 'Application' })
      setDone(true)
    } catch (err) {
      // FastAPI 422 returns detail as an array of validation errors — normalise to string
      const detail = err?.response?.data?.detail
      const msg =
        Array.isArray(detail)
          ? detail.map(d => d?.msg || JSON.stringify(d)).join('; ')
          : (typeof detail === 'string' ? detail : null)
      const text = msg || err?.response?.data?.error || 'Submission failed. Please try again.'
      setServerError(text)
      notify.error(text, { title: 'Application failed' })
    } finally { setSubmitting(false) }
  }

  /* ── Loading ── */
  if (authLoading) {
    return (
      <MotionPage animation={pageConfig.animation || 'fade-up'}>
      <main style={{ minHeight: '100vh', padding: '92px 20px 48px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {Array.from({ length: 6 }).map((_, i) => <ThreadRowSkeleton key={i} />)}
        </div>
      </main>
      </MotionPage>
    )
  }

  /* ── Not logged in ── */
  if (!user) {
    return (
      <MotionPage animation={pageConfig.animation || 'fade-up'}>
      <main style={{ minHeight: '100vh', padding: '80px 20px 40px' }}>
        <div style={{ maxWidth: 680, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{ fontSize: 11, color: G, fontFamily: 'var(--font-mono)', letterSpacing: 3, marginBottom: 8 }}>AIFAZI RP — NEON OPS CITY</div>
            <h1 style={{ fontFamily: 'var(--font-mono)', fontSize: 28, color: 'var(--text)', margin: '0 0 8px', letterSpacing: 2 }}>{wlTitle.toUpperCase()}</h1>
          </div>
          <LoginGate />
        </div>
      </main>
      </MotionPage>
    )
  }

  /* ── Logged in but Discord not linked ── */
  if (!isStaffPreview && discordLoading && !discordStatus && !user?.discord_id) {
    return (
      <MotionPage animation={pageConfig.animation || 'fade-up'}>
      <main style={{ minHeight: '100vh', padding: '92px 20px 48px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {Array.from({ length: 6 }).map((_, i) => <ThreadRowSkeleton key={i} />)}
        </div>
      </main>
      </MotionPage>
    )
  }

  if (!isStaffPreview && !discordLinked) {
    return (
      <MotionPage animation={pageConfig.animation || 'fade-up'}>
      <main style={{ minHeight: '100vh', padding: '80px 20px 40px' }}>
        <div style={{ maxWidth: 680, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{ fontSize: 11, color: G, fontFamily: 'var(--font-mono)', letterSpacing: 3, marginBottom: 8 }}>AIFAZI RP — NEON OPS CITY</div>
            <h1 style={{ fontFamily: 'var(--font-mono)', fontSize: 28, color: 'var(--text)', margin: '0 0 8px', letterSpacing: 2 }}>{wlTitle.toUpperCase()}</h1>
          </div>
          <DiscordConnectGate username={user.username} />
        </div>
      </main>
      </MotionPage>
    )
  }

  /* ── Already applied ── */
  if (!isStaffPreview && existingApp) {
    return (
      <MotionPage animation={pageConfig.animation || 'fade-up'}>
      <main style={{ minHeight: '100vh', padding: '80px 20px 40px' }}>
        <div style={{ maxWidth: 680, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{ fontSize: 11, color: G, fontFamily: 'var(--font-mono)', letterSpacing: 3, marginBottom: 8 }}>AIFAZI RP — NEON OPS CITY</div>
            <h1 style={{ fontFamily: 'var(--font-mono)', fontSize: 28, color: 'var(--text)', margin: '0 0 8px', letterSpacing: 2 }}>{wlTitle.toUpperCase()}</h1>
          </div>
          <ExistingApplicationGate application={existingApp} />
        </div>
      </main>
      </MotionPage>
    )
  }

  /* ── Success ── */
  if (done) {
    return (
      <MotionPage animation={pageConfig.animation || 'fade-up'}>
      <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ maxWidth: 520, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
          <h2 style={{ fontFamily: 'var(--font-mono)', color: G, fontSize: 20, letterSpacing: 2, marginBottom: 12 }}>APPLICATION SUBMITTED</h2>
          <p style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.7, marginBottom: 24 }}>
            Your whitelist application has been received. Staff will review it within 24–48 hours.
            Track your status on your profile page.
          </p>
          <a href="/profile" style={{
            display: 'inline-block', padding: '12px 28px',
            background: G + '15', border: '1px solid ' + G + '40',
            color: G, fontFamily: 'var(--font-mono)', fontSize: 12,
            letterSpacing: 2, textDecoration: 'none', borderRadius: 8,
          }}>VIEW MY PROFILE →</a>
        </div>
      </main>
      </MotionPage>
    )
  }

  /* ── Form (logged in + Discord linked) ── */
  return (
    <MotionPage animation={pageConfig.animation || 'fade-up'}>
    <main style={{ minHeight: '100vh', padding: '80px 20px 60px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 28 }}>

        {/* Header */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: G, fontFamily: 'var(--font-mono)', letterSpacing: 3, marginBottom: 8 }}>AIFAZI RP — NEON OPS CITY</div>
          <h1 style={{ fontFamily: 'var(--font-mono)', fontSize: 28, color: 'var(--text)', margin: '0 0 8px', letterSpacing: 2 }}>{wlTitle.toUpperCase()}</h1>
          <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0, lineHeight: 1.7 }}>
            {wlIntro}
            Low-effort or copied applications will be denied.
          </p>
        </div>

        {checksLoading && (
          <InfoBox color={C} icon="↻" title="SYNC CHECK RUNNING">
            Discord and previous application checks are refreshing in the background.
          </InfoBox>
        )}

        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(170px, 1fr))', gap:10 }}>
          {[
            ['01', 'Connect Discord/Steam', 'Attach your website account to your game identity.'],
            ['02', 'Submit Character', 'Staff review your character, rules knowledge, and RP intent.'],
            ['03', 'Approval + Sync', 'Approved players sync to the server whitelist and queue priority system.'],
            ['04', 'First Join', 'Your first successful server connection marks the profile ACTIVE.'],
          ].map(([num, title, text]) => (
            <div key={num} style={{ background:'rgba(0,212,255,0.045)', border:'1px solid rgba(0,212,255,0.18)', borderRadius:10, padding:'13px 14px' }}>
              <div style={{ color:C, fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:2, marginBottom:6 }}>{num}</div>
              <div style={{ color:'var(--text)', fontFamily:'var(--font-mono)', fontSize:12, marginBottom:5 }}>{title}</div>
              <div style={{ color:'var(--muted)', fontSize:12, lineHeight:1.55 }}>{text}</div>
            </div>
          ))}
        </div>


        {forms.length > 0 && (
          <div id="applications" style={{ background:'rgba(0,212,255,0.035)', border:'1px solid rgba(0,212,255,0.18)', borderRadius:12, padding:18, display:'flex', flexDirection:'column', gap:12 }}>
            <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'center', flexWrap:'wrap' }}>
              <div>
                <div style={{ color:C, fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:3, marginBottom:5 }}>OTHER APPLICATIONS</div>
                <div style={{ color:'var(--text)', fontFamily:'var(--font-mono)', fontSize:15 }}>Departments and staff forms</div>
              </div>
              <a href="/forms" style={{ color:G, fontFamily:'var(--font-mono)', fontSize:11, letterSpacing:1.5, textDecoration:'none' }}>VIEW ALL →</a>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))', gap:10 }}>
              {forms.map(app => (
                <a key={app.slug} href={`/forms/${app.slug}`} style={{ textDecoration:'none', border:'1px solid rgba(0,212,255,0.16)', background:'rgba(255,255,255,0.025)', borderRadius:9, padding:13 }}>
                  <div style={{ color:'var(--text)', fontFamily:'var(--font-mono)', fontSize:12, marginBottom:6 }}>{app.title}</div>
                  <div style={{ color:'var(--muted)', fontSize:12, lineHeight:1.5 }}>{app.description || 'Open application form.'}</div>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Discord connected badge */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          background: DISCORD_PURPLE + '12', border: '1px solid ' + DISCORD_PURPLE + '40',
          borderRadius: 10, padding: '12px 16px',
        }}>
          {user.discord_avatar && resolvedDiscordId ? (
            <img
              src={'https://cdn.discordapp.com/avatars/' + resolvedDiscordId + '/' + user.discord_avatar + '.png?size=40'}
              alt={resolvedDiscordUsername}
              style={{ width: 36, height: 36, borderRadius: '50%', border: '2px solid ' + DISCORD_PURPLE + '60' }}
            />
          ) : (
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: DISCORD_PURPLE + '30', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 16, fontWeight: 700 }}>
              {(resolvedDiscordUsername || '?')[0].toUpperCase()}
            </div>
          )}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>{resolvedDiscordUsername}</div>
            <div style={{ fontSize: 11, color: DISCORD_PURPLE, letterSpacing: 1 }}>DISCORD CONNECTED · ID: {resolvedDiscordId || '—'}</div>
          </div>
          <div style={{ fontSize: 11, color: G, letterSpacing: 1, fontFamily: 'var(--font-mono)' }}>✓ VERIFIED</div>
        </div>

        {/* Server rules */}
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '20px 24px' }}>
          <div style={{ fontSize: 12, color: G, fontFamily: 'var(--font-mono)', letterSpacing: 2, marginBottom: 14 }}>SERVER RULES — READ BEFORE APPLYING</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '8px 24px' }}>
            {RULES.map((r, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, color: 'var(--muted)' }}>
                <span style={{ color: G, fontFamily: 'var(--font-mono)', fontSize: 11, marginTop: 2, flexShrink: 0 }}>{String(i + 1).padStart(2, '0')}</span>
                {r}
              </div>
            ))}
          </div>
        </div>

        {/* FiveM ID guide */}
        <InfoBox color={W} icon="🎮" title="HOW TO FIND YOUR FIVEM ID (OPTIONAL)">        
          <ol style={{ margin: '8px 0 0', paddingLeft: 18, lineHeight: 2 }}>
            <li>Open <strong style={{ color: W }}>FiveM</strong> and connect to any server (or open the main menu)</li>
            <li>Press <strong style={{ color: W }}>F8</strong> to open the console</li>
            <li>Type <code style={{ background: 'rgba(255,159,67,0.12)', padding: '1px 6px', borderRadius: 4 }}>status</code> and press Enter</li>
            <li>Find your name — the <strong style={{ color: W }}>first number</strong> in the row is your FiveM ID</li>
          </ol>
          <p style={{ margin: '8px 0 0', fontSize: 12 }}>
            Example: <code style={{ background: 'rgba(255,159,67,0.12)', padding: '1px 6px', borderRadius: 4 }}>4463431  Tanv33r  ...</code> → FiveM ID is <strong style={{ color: W }}>4463431</strong>
          </p>
        </InfoBox>

        <InfoBox color={C} icon="🧭" title="WHAT STAFF LOOK FOR">
          <ul style={{ margin:'8px 0 0', paddingLeft:18, lineHeight:2 }}>
            <li>A character with believable motives, weaknesses, and goals.</li>
            <li>Clear understanding of RDM, VDM, NLR, metagaming, powergaming, and fail RP.</li>
            <li>A plan for creating scenes with other players, not only winning situations.</li>
            <li>Correct identifiers. If no server identifier is attached yet, your first join attempt helps link it.</li>
          </ul>
        </InfoBox>

        {/* Form fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Discord — read-only */}
          <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-mono)', letterSpacing: 2, paddingBottom: 6, borderBottom: '1px solid rgba(255,255,255,0.07)' }}>DISCORD (AUTO-FILLED)</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Field label="Discord ID" hint="Auto-filled from your linked Discord account">
              <Input value={resolvedDiscordId || ''} readOnly />
            </Field>
            <Field label="Discord Username" hint="Auto-filled from your linked Discord account">
              <Input value={resolvedDiscordUsername} readOnly />
            </Field>
          </div>

          {/* FiveM identifiers */}
          <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-mono)', letterSpacing: 2, paddingBottom: 6, borderBottom: '1px solid rgba(255,255,255,0.07)', marginTop: 8 }}>FIVEM IDENTIFIERS</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Field label="FiveM ID (Optional)" error={errors.fivem_id} hint="Numbers only — leave blank if you don't know it yet">
              <Input value={form.fivem_id} onChange={v => set('fivem_id', v.replace(/\D/g, ''))} placeholder="4463431" disabled={submitting} />
            </Field>
            <Field label="Steam Hex (Optional)" error={errors.steam_hex}
              hint={resolvedSteamHex ? 'Auto-filled from your linked Steam account' : 'From F8 console → status → your steam:1100001... value'}>
              <Input
                value={resolvedSteamHex || form.steam_hex}
                onChange={resolvedSteamHex ? undefined : v => set('steam_hex', v)}
                placeholder="steam:110000134481ed0"
                disabled={submitting}
                readOnly={!!resolvedSteamHex}
              />
              {resolvedSteamHex && user?.steam_username && (
                <span style={{ fontSize: 11, color: '#1b9cfc', letterSpacing: 1, marginTop: 2, fontFamily: 'var(--font-mono)' }}>
                  ✓ Steam: {user.steam_username}
                </span>
              )}
            </Field>
          </div>

          {/* Character */}
          <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-mono)', letterSpacing: 2, paddingBottom: 6, borderBottom: '1px solid rgba(255,255,255,0.07)', marginTop: 8 }}>CHARACTER DETAILS</div>
          <Field label={wlLabel('character_name', 'Character Full Name')} required error={errors.character_name}>
            <Input value={form.character_name} onChange={v => set('character_name', v)} placeholder={wlHint('character_name', 'e.g. Marcus Reyes')} disabled={submitting} />
          </Field>
          <Field label={wlLabel('character_backstory', 'Character Backstory')} required error={errors.character_backstory}
            hint={`Minimum ${wlMin('character_backstory', 80)} characters — ${wlHint('character_backstory', 'origin, personality, motivations, how they ended up in Neon Ops City')}`}>
            <TextArea value={form.character_backstory} onChange={v => set('character_backstory', v)}
              placeholder={wlHint('character_backstory', "Your character's background story...")} rows={6} disabled={submitting} />
            <span style={{ fontSize: 11, color: form.character_backstory.length < wlMin('character_backstory', 80) ? '#ff4757' : G, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
              {form.character_backstory.length} / {wlMin('character_backstory', 80)} min
            </span>
          </Field>
          <Field label={wlLabel('why_join', 'Why do you want to join AIFAZI RP?')} required error={errors.why_join} hint={`Minimum ${wlMin('why_join', 40)} characters`}>
            <TextArea value={form.why_join} onChange={v => set('why_join', v)}
              placeholder={wlHint('why_join', 'What draws you to this server? What kind of RP do you want to create?')} rows={4} disabled={submitting} />
          </Field>

          {/* About you */}
          <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-mono)', letterSpacing: 2, paddingBottom: 6, borderBottom: '1px solid rgba(255,255,255,0.07)', marginTop: 8 }}>ABOUT YOU</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16 }}>
            <Field label={wlLabel('age', 'Age')} required error={errors.age}>
              <Input type="number" value={form.age} onChange={v => set('age', v)} placeholder={wlHint('age', '18')} disabled={submitting} />
            </Field>
            <Field label={wlLabel('rp_experience', 'RP Experience')} required error={errors.rp_experience}>
              <Input value={form.rp_experience} onChange={v => set('rp_experience', v)} placeholder={wlHint('rp_experience', 'e.g. 2 years on other FiveM servers, GTA RP, etc.')} disabled={submitting} />
            </Field>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Field label={wlLabel('roleplay_style', 'Preferred RP Style')} required error={errors.roleplay_style}
              hint={wlHint('roleplay_style', 'Examples: civilian business, crime, police, EMS, legal, mechanic, social RP')}>
              <Input value={form.roleplay_style} onChange={v => set('roleplay_style', v)} placeholder={wlHint('roleplay_style', 'Civilian business and slow-burn character RP')} disabled={submitting} />
            </Field>
            <Field label={wlLabel('availability', 'Availability / Timezone')} required error={errors.availability}>
              <Input value={form.availability} onChange={v => set('availability', v)} placeholder={wlHint('availability', 'Asia/Dubai evenings, weekends')} disabled={submitting} />
            </Field>
          </div>

          <Field label={wlLabel('rule_scenario', 'Rules Scenario')} required error={errors.rule_scenario}
            hint={`Minimum ${wlMin('rule_scenario', 60)} characters — ${wlHint('rule_scenario', 'explain what you would do if a scene goes wrong or another player breaks character.')}`}>
            <TextArea value={form.rule_scenario} onChange={v => set('rule_scenario', v)}
              placeholder={wlHint('rule_scenario', 'A player breaks character during an active scene. What do you do in the moment, and what do you do after the scene?')} rows={4} disabled={submitting} />
            <span style={{ fontSize: 11, color: form.rule_scenario.length < wlMin('rule_scenario', 60) ? '#ff4757' : G, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
              {form.rule_scenario.length} / {wlMin('rule_scenario', 60)} min
            </span>
          </Field>

          <Field label={wlLabel('extra_notes', 'Anything staff should know?')} error={errors.extra_notes}
            hint={wlHint('extra_notes', 'Optional — previous bans, accessibility needs, schedule notes, or department interest.')}>
            <TextArea value={form.extra_notes} onChange={v => set('extra_notes', v)}
              placeholder={wlHint('extra_notes', 'Optional notes for staff...')} rows={3} disabled={submitting} />
          </Field>

          {/* Email for result notifications */}
          <Field label="Email Address" required error={errors.email}
            hint="Auto-filled from your account. We'll email you when your application is approved or denied.">
            <Input
              type="email"
              value={user?.email || ''}
              readOnly
            />
          </Field>

          {/* Rules checkbox */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginTop: 8 }}>
            <Checkbox checked={form.rules_accepted} onChange={v => set('rules_accepted', v)}
              style={{ width: 30, height: 30, padding: 0, justifyContent: 'center', marginTop: 2, flexShrink: 0 }} />
            <label htmlFor="rules" style={{ fontSize: 13, color: 'var(--muted)', cursor: 'pointer', lineHeight: 1.6 }}>
              I have read and agree to all server rules. I understand that breaking these rules may result in removal from the whitelist.
            </label>
          </div>
          {errors.rules_accepted && <span style={{ fontSize: 11, color: '#ff4757' }}>{errors.rules_accepted}</span>}
        </div>

        {serverError && (
          <div style={{ background: 'rgba(255,71,87,0.08)', border: '1px solid rgba(255,71,87,0.3)', borderRadius: 8, padding: '12px 16px', color: '#ff4757', fontSize: 13 }}>
            {serverError}
          </div>
        )}

        <button onClick={submit} disabled={submitting} style={{
          padding: '14px 0', background: submitting ? 'rgba(0,255,136,0.06)' : G + '18',
          border: '1px solid ' + G + '50', borderRadius: 10, color: G,
          fontFamily: 'var(--font-mono)', fontSize: 13, letterSpacing: 2,
          cursor: submitting ? 'not-allowed' : 'pointer', transition: 'all 0.15s',
        }}>
          {submitting ? 'SUBMITTING...' : 'SUBMIT APPLICATION'}
        </button>

        <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--muted)', letterSpacing: 1 }}>
          Questions? Join our{' '}
          <a href="https://discord.gg/aifazi" target="_blank" rel="noreferrer" style={{ color: DISCORD_PURPLE }}>Discord server</a>
        </p>
      </div>
    </main>
    </MotionPage>
  )
}


