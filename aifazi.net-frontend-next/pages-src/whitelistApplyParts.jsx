'use client'
// whitelistApplyParts.jsx — form widgets + auth gates (extracted).
import { useState, useEffect } from 'react'
import { Link } from '@/lib/router-compat'
import api from '@/lib/api'
import { authProviderLoginRoute } from '@/lib/authRoutes'
import { useFiveMRoute, useFiveMLoginRoute } from '@/lib/fivemRoutes'

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
        background: readOnly ? 'color-mix(in srgb, var(--green) 4%, transparent)' : 'rgba(255,255,255,0.04)',
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
          <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-mono)', letterSpacing: 2, marginBottom: 6 }}>CHARACTER</div>
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

export { G, C, W, DISCORD_PURPLE, STAFF_ROLES, RULES, Field, Input, TextArea, InfoBox, DiscordIcon, LoginGate, DiscordConnectGate, ExistingApplicationGate }
