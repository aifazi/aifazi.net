'use client'
/**
 * PlayerProfile.jsx — Player profile page for AIFAZI RP
 * Shows Discord info, whitelist application status tracker, and FiveM details.
 * Requires Discord login via DiscordContext.
 */
import { useState, useEffect } from 'react'
import { useDiscord } from '@/context/DiscordContext'
import { getAuthToken } from '@/lib/api'

const G = '#00FF88'
const C = '#00D4FF'
const W = '#ff9f43'
const R = '#ff4757'
const DISCORD_PURPLE = '#5865F2'
const API = ''

/* ── Status step config ─────────────────────────────────────────────────── */
const STEPS = [
  { key: 'submitted',   label: 'Submitted',    icon: '📝', desc: 'Your application has been received.' },
  { key: 'reviewing',   label: 'Under Review',  icon: '🔍', desc: 'Staff are reviewing your application.' },
  { key: 'approved',    label: 'Approved',      icon: '✅', desc: 'You have been approved! Join the server.' },
  { key: 'denied',      label: 'Denied',        icon: '❌', desc: 'Your application was not accepted.' },
]

function getStepIndex(status) {
  if (!status || status === 'pending')  return 1  // submitted + reviewing
  if (status === 'approved')            return 2
  if (status === 'denied')              return 3
  return 0
}

function StatusTracker({ application }) {
  if (!application) return null
  const status     = application.status || 'pending'
  const stepIndex  = getStepIndex(status)
  const isDenied   = status === 'denied'
  const isApproved = status === 'approved'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Progress bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 0, position: 'relative' }}>
        {STEPS.map((step, i) => {
          const isActive   = i === stepIndex
          const isComplete = i < stepIndex
          const isFuture   = i > stepIndex
          const color      = isDenied && i === 3 ? R : isComplete || isActive ? G : 'rgba(255,255,255,0.1)'
          const textColor  = isDenied && i === 3 ? R : isComplete || isActive ? G : 'var(--muted)'

          return (
            <div key={step.key} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : 0 }}>
              {/* Circle */}
              <div style={{
                width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                background: (isComplete || isActive) ? (isDenied && i === 3 ? R + '20' : G + '15') : 'rgba(255,255,255,0.04)',
                border: '2px solid ' + color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, position: 'relative', zIndex: 1,
                transition: 'all 0.3s',
              }}>
                {isComplete ? (
                  <span style={{ color: G, fontSize: 14 }}>✓</span>
                ) : (
                  <span style={{ fontSize: 14 }}>{step.icon}</span>
                )}
              </div>
              {/* Connector line */}
              {i < STEPS.length - 1 && (
                <div style={{
                  flex: 1, height: 2,
                  background: isComplete ? G : 'rgba(255,255,255,0.08)',
                  transition: 'background 0.3s',
                }} />
              )}
            </div>
          )
        })}
      </div>

      {/* Step labels */}
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        {STEPS.map((step, i) => {
          const isActive  = i === stepIndex
          const isComplete = i < stepIndex
          const color     = isDenied && i === 3 ? R : isComplete || isActive ? G : 'var(--muted)'
          return (
            <div key={step.key} style={{ textAlign: 'center', flex: 1, fontSize: 10, fontFamily: 'var(--font-mono)', color, letterSpacing: 1, lineHeight: 1.4 }}>
              {step.label.toUpperCase()}
            </div>
          )
        })}
      </div>

      {/* Current status description */}
      <div style={{
        background: isApproved ? G + '08' : isDenied ? R + '08' : C + '08',
        border: '1px solid ' + (isApproved ? G + '30' : isDenied ? R + '30' : C + '30'),
        borderRadius: 10, padding: '14px 18px',
      }}>
        <div style={{ fontSize: 12, color: isApproved ? G : isDenied ? R : C, fontFamily: 'var(--font-mono)', letterSpacing: 1, marginBottom: 6 }}>
          {STEPS[stepIndex]?.icon} STATUS: {(status || 'pending').toUpperCase()}
        </div>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
          {STEPS[stepIndex]?.desc}
          {isApproved && (
            <> Connect to <strong style={{ color: G }}>aifazi.net</strong> FiveM server and you will be able to join.</>
          )}
          {isDenied && (
            <> You may re-apply after 7 days. Join our <a href="https://discord.gg/aifazi" target="_blank" rel="noreferrer" style={{ color: DISCORD_PURPLE }}>Discord</a> to appeal.</>
          )}
        </p>
      </div>

      {/* Application details */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        {[
          { label: 'Application ID', value: application.id || '—' },
          { label: 'Submitted', value: application.created_at ? new Date(application.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—' },
          { label: 'FiveM ID', value: application.fivem_id ? 'fivem:' + application.fivem_id : '—' },
          { label: 'Priority', value: Number(application.priority_level || 0) > 0
            ? `${application.priority_tier || 'Priority'} (${application.priority_level})${application.priority_expires_at ? ' until ' + new Date(application.priority_expires_at).toLocaleDateString() : ''}`
            : '—' },
          { label: 'Reviewed By', value: application.reviewed_by || 'Pending review' },
        ].map(({ label, value }) => (
          <div key={label} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '12px 14px' }}>
            <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-mono)', letterSpacing: 1, marginBottom: 4 }}>{label.toUpperCase()}</div>
            <div style={{ fontSize: 13, color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>{value}</div>
          </div>
        ))}
      </div>

      {/* txAdmin sync badge */}
      {isApproved && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: application.txadmin_synced ? G + '08' : W + '08',
          border: '1px solid ' + (application.txadmin_synced ? G + '30' : W + '30'),
          borderRadius: 8, padding: '10px 14px',
        }}>
          <span style={{ fontSize: 16 }}>{application.txadmin_synced ? '🟢' : '🟡'}</span>
          <div>
            <div style={{ fontSize: 11, color: application.txadmin_synced ? G : W, fontFamily: 'var(--font-mono)', letterSpacing: 1 }}>
              {application.txadmin_synced ? 'IN-GAME WHITELIST: ACTIVE' : 'IN-GAME WHITELIST: SYNCING...'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>
              {application.txadmin_synced
                ? 'You are whitelisted in-game. You can join the server now.'
                : 'Your approval is being synced to the game server. This takes up to 60 seconds.'}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Main component ─────────────────────────────────────────────────────── */
export default function PlayerProfile() {
  const { player, loading: discordLoading, login: discordLogin, logout } = useDiscord()
  const [application, setApplication] = useState(null)
  const [appLoading,  setAppLoading]  = useState(false)
  const [appError,    setAppError]    = useState('')
  const [formSubmissions, setFormSubmissions] = useState([])
  const [formsError, setFormsError] = useState('')

  useEffect(() => {
    if (!player) return
    setAppLoading(true)
    const token = getAuthToken()
    fetch(API + '/api/discord/my-application', {
      headers: { Authorization: 'Bearer ' + token },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => { setApplication(data); setAppLoading(false) })
      .catch(() => { setAppError('Failed to load application.'); setAppLoading(false) })
  }, [player])

  useEffect(() => {
    if (!player) return
    const token = getAuthToken()
    if (!token) return
    fetch(API + '/api/forms/my-submissions', { headers:{ Authorization:'Bearer ' + token } })
      .then(r => r.ok ? r.json() : { submissions:[] })
      .then(data => setFormSubmissions(data.submissions || []))
      .catch(() => setFormsError('Failed to load community applications.'))
  }, [player])

  /* ── Loading ── */
  if (discordLoading) {
    return (
      <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono)', letterSpacing: 2, fontSize: 12 }}>LOADING...</p>
      </main>
    )
  }

  /* ── Not logged in ── */
  if (!player) {
    return (
      <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ textAlign: 'center', maxWidth: 400 }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: DISCORD_PURPLE + '20', border: '2px solid ' + DISCORD_PURPLE + '60', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <svg width="32" height="32" viewBox="0 0 127.14 96.36" fill={DISCORD_PURPLE}>
              <path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z"/>
            </svg>
          </div>
          <h2 style={{ fontFamily: 'var(--font-mono)', color: 'var(--text)', fontSize: 18, letterSpacing: 2, marginBottom: 12 }}>LOGIN TO VIEW PROFILE</h2>
          <p style={{ color: 'var(--muted)', fontSize: 13, lineHeight: 1.7, marginBottom: 24 }}>Connect your Discord account to view your whitelist application status and player profile.</p>
          <button onClick={() => discordLogin('/profile')} style={{
            display: 'flex', alignItems: 'center', gap: 10, margin: '0 auto',
            background: DISCORD_PURPLE, border: 'none', borderRadius: 10,
            padding: '12px 24px', color: '#fff', fontSize: 13,
            fontFamily: 'var(--font-mono)', letterSpacing: 2, cursor: 'pointer',
          }}>
            <svg width="18" height="18" viewBox="0 0 127.14 96.36" fill="#fff">
              <path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z"/>
            </svg>
            LOGIN WITH DISCORD
          </button>
        </div>
      </main>
    )
  }

  /* ── Profile page ── */
  return (
    <main style={{ minHeight: '100vh', padding: '80px 20px 60px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 28 }}>

        {/* Header */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: G, fontFamily: 'var(--font-mono)', letterSpacing: 3, marginBottom: 8 }}>AIFAZI RP — NEON OPS CITY</div>
          <h1 style={{ fontFamily: 'var(--font-mono)', fontSize: 26, color: 'var(--text)', margin: '0 0 4px', letterSpacing: 2 }}>PLAYER PROFILE</h1>
        </div>

        {/* Discord card */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 16,
          background: DISCORD_PURPLE + '10', border: '1px solid ' + DISCORD_PURPLE + '35',
          borderRadius: 14, padding: '20px 24px',
        }}>
          {player.avatar ? (
            <img
              src={'https://cdn.discordapp.com/avatars/' + player.discord_id + '/' + player.avatar + '.png?size=80'}
              alt={player.username}
              style={{ width: 64, height: 64, borderRadius: '50%', border: '3px solid ' + DISCORD_PURPLE + '60', flexShrink: 0 }}
            />
          ) : (
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: DISCORD_PURPLE + '30', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 24, fontWeight: 700, flexShrink: 0 }}>
              {(player.username || '?')[0].toUpperCase()}
            </div>
          )}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 20, color: 'var(--text)', fontFamily: 'var(--font-mono)', fontWeight: 700, marginBottom: 4 }}>
              {player.username}
            </div>
            <div style={{ fontSize: 11, color: DISCORD_PURPLE, letterSpacing: 1, fontFamily: 'var(--font-mono)' }}>
              DISCORD ID: {player.discord_id}
            </div>
            {player.whitelist_status && (
              <div style={{ marginTop: 6, display: 'inline-block', background: player.whitelist_status === 'approved' ? G + '15' : player.whitelist_status === 'denied' ? R + '15' : W + '15', border: '1px solid ' + (player.whitelist_status === 'approved' ? G + '40' : player.whitelist_status === 'denied' ? R + '40' : W + '40'), borderRadius: 6, padding: '2px 10px', fontSize: 10, color: player.whitelist_status === 'approved' ? G : player.whitelist_status === 'denied' ? R : W, fontFamily: 'var(--font-mono)', letterSpacing: 2 }}>
                WHITELIST: {(player.whitelist_status || 'none').toUpperCase()}
              </div>
            )}
          </div>
          <button onClick={logout} style={{
            background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8, padding: '8px 14px', color: 'var(--muted)',
            fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1, cursor: 'pointer',
            transition: 'border-color 0.15s',
          }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'}
          >
            SIGN OUT
          </button>
        </div>

        {/* Whitelist status tracker */}
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '24px' }}>
          <div style={{ fontSize: 12, color: G, fontFamily: 'var(--font-mono)', letterSpacing: 2, marginBottom: 20 }}>
            WHITELIST APPLICATION STATUS
          </div>

          {appLoading && (
            <p style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: 1 }}>LOADING APPLICATION...</p>
          )}

          {appError && (
            <p style={{ color: R, fontSize: 13 }}>{appError}</p>
          )}

          {!appLoading && !appError && !application && (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <p style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.7, marginBottom: 20 }}>
                You have not submitted a whitelist application yet.
              </p>
              <a href="/whitelist" style={{
                display: 'inline-block', padding: '12px 28px',
                background: G + '15', border: '1px solid ' + G + '40',
                color: G, fontFamily: 'var(--font-mono)', fontSize: 12,
                letterSpacing: 2, textDecoration: 'none', borderRadius: 8,
              }}>
                APPLY FOR WHITELIST
              </a>
            </div>
          )}

          {!appLoading && !appError && application && (
            <StatusTracker application={application} />
          )}
        </div>


        {/* Universal application tracker */}
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '24px' }}>
          <div style={{ fontSize: 12, color: C, fontFamily: 'var(--font-mono)', letterSpacing: 2, marginBottom: 20 }}>
            COMMUNITY APPLICATIONS
          </div>
          {formsError && <p style={{ color: R, fontSize: 13 }}>{formsError}</p>}
          {!formsError && formSubmissions.length === 0 && (
            <div style={{ textAlign:'center', padding:'18px 0' }}>
              <p style={{ color:'var(--muted)', fontSize:14, lineHeight:1.7, marginBottom:18 }}>No staff or department application found.</p>
              <a href="/whitelist#applications" style={{ display:'inline-block', padding:'11px 22px', background:C + '12', border:'1px solid ' + C + '35', color:C, fontFamily:'var(--font-mono)', fontSize:11, letterSpacing:2, textDecoration:'none', borderRadius:8 }}>BROWSE FORMS</a>
            </div>
          )}
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {formSubmissions.map(sub => {
              const isApproved = sub.status === 'approved'
              const isDenied = sub.status === 'denied'
              const statusColor = isApproved ? G : isDenied ? R : W
              return (
                <div key={sub.id} style={{ border:'1px solid rgba(255,255,255,0.08)', borderRadius:10, padding:15, background:'rgba(0,0,0,0.16)' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', gap:10, flexWrap:'wrap' }}>
                    <div>
                      <div style={{ color:'var(--text)', fontFamily:'var(--font-mono)', fontSize:14, marginBottom:4 }}>{sub.form_title || sub.form_slug}</div>
                      <div style={{ color:'var(--muted)', fontSize:11, fontFamily:'var(--font-mono)' }}>Submitted {sub.created_at ? new Date(sub.created_at).toLocaleDateString() : '—'}</div>
                    </div>
                    <div style={{ display:'flex', gap:6, alignItems:'flex-start', flexWrap:'wrap' }}>
                      <span style={{ color:statusColor, border:'1px solid ' + statusColor + '55', background:statusColor + '12', borderRadius:999, padding:'4px 9px', fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:1 }}>{String(sub.status || 'pending').toUpperCase()}</span>
                      <span style={{ color:sub.action_status === 'synced' ? G : sub.action_status === 'failed' ? R : C, border:'1px solid color-mix(in srgb, var(--cyan) 25%, transparent)', borderRadius:999, padding:'4px 9px', fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:1 }}>ACTION {String(sub.action_status || 'NONE').toUpperCase()}</span>
                    </div>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:0, margin:'16px 0 12px' }}>
                    {['submitted','review','approved','synced'].map((step, i) => {
                      const done = i === 0 || (i === 1 && sub.status !== 'pending') || (i === 2 && isApproved) || (i === 3 && sub.action_status === 'synced')
                      return <div key={step} style={{ height:3, background:done ? (isDenied && i > 0 ? R : G) : 'rgba(255,255,255,0.08)' }} />
                    })}
                  </div>
                  {sub.reviewer_note && <p style={{ color:'var(--muted)', fontSize:12, lineHeight:1.6, margin:'8px 0 0' }}>{sub.reviewer_note}</p>}
                  {sub.action_sync_error && <p style={{ color:R, fontSize:12, lineHeight:1.6, margin:'8px 0 0' }}>{sub.action_sync_error}</p>}
                </div>
              )
            })}
          </div>
        </div>

        {/* Quick links */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          {[
            { label: 'Apply for Whitelist', href: '/whitelist', color: G, icon: '📝' },
            { label: 'Join Discord',        href: 'https://discord.gg/aifazi', color: DISCORD_PURPLE, icon: '💬', external: true },
            { label: 'Applications',        href: '/whitelist#applications', color: C, icon: '🧾' },
            { label: 'Server Rules',        href: '/rules', color: C, icon: '📜' },
          ].map(({ label, href, color, icon, external }) => (
            <a key={label} href={href} target={external ? '_blank' : undefined} rel={external ? 'noreferrer' : undefined}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                background: color + '08', border: '1px solid ' + color + '25',
                borderRadius: 10, padding: '14px 16px', textDecoration: 'none',
                color: 'var(--text)', fontSize: 13, transition: 'border-color 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = color + '60'}
              onMouseLeave={e => e.currentTarget.style.borderColor = color + '25'}
            >
              <span style={{ fontSize: 18 }}>{icon}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1, color }}>{label.toUpperCase()}</span>
            </a>
          ))}
        </div>

      </div>
    </main>
  )
}
