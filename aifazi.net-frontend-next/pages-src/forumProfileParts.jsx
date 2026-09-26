'use client'
// forumProfileParts.jsx — shared profile widgets (extracted).
import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Link, useNavigate } from '@/lib/router-compat'
import api, { ensureAdminGate } from '@/lib/api'
import { builtinAvatarEmoji, avatarUrl, UserAvatar, BUILTIN_AVATARS } from '@/lib/avatar'
import { Select } from '../core/ui.jsx'
import { useToast } from '../components/Toast'
import { useNow } from '../hooks/useNow'

const M = { fontFamily: 'var(--font-mono)' }
const D = { fontFamily: 'var(--font-display)' }
const CLRS = {
  green:  'var(--green)',  cyan:  'var(--cyan)',
  red:    '#ff4757',       yellow:'#ffd700',
  purple: '#a855f7',       orange:'#ff6b35',
}
// Discord OAuth lives on the unified /api/auth router; Steam/GitHub keep their
// dedicated routers at /api/forum/auth/{steam,github}.
const oauthApiBase = (provider) => (provider === 'discord' ? '/auth/discord' : `/forum/auth/${provider}`)
const STAFF_PORTAL_ROLES = new Set(['admin', 'moderator', 'editor'])

function canAccessAdminPortal(user) {
  const perms = user?.permissions || user?.module_permissions || {}
  return STAFF_PORTAL_ROLES.has((user?.role || '').toLowerCase()) || !!user?._staff || !!user?.staff_account || Object.keys(perms).length > 0
}

function AdminPortalLink({ compact = false }) {
  const navigate = useNavigate()
  const toast = useToast()
  const openAdminPortal = async (event) => {
    event.preventDefault()
    const ready = await ensureAdminGate()
    if (!ready) {
      toast.error('Admin portal session could not be prepared. Please sign in again.', { title: 'Admin Portal' })
      navigate('/login?tab=signin&next=%2Fadmin')
      return
    }
    navigate('/admin')
  }
  return (
    <Link to="/admin" onClick={openAdminPortal} style={{
      ...M, fontSize: compact ? 8 : 10, letterSpacing: 2, fontWeight: 800,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      padding: compact ? '8px 12px' : '10px 16px',
      color: '#000', background: 'var(--green)', border: '1px solid var(--green)',
      borderRadius: 10, textDecoration: 'none', whiteSpace: 'nowrap',
      boxShadow: '0 0 18px color-mix(in srgb, var(--green) 22%, transparent)',
      transition: 'box-shadow 0.2s, transform 0.2s',
    }}>
      ADMIN PORTAL
    </Link>
  )
}

/* ─── Shared micro-components ────────────────────────────────────────────── */
function Badge({ label, color = CLRS.cyan, icon }) {
  return (
    <span style={{ ...M, fontSize: 11, letterSpacing: 2, padding: '4px 10px',
      color, background: color + '18', border: `1px solid ${color}40`,
      borderRadius: 999, display: 'inline-flex', alignItems: 'center', gap: 4,
      whiteSpace: 'nowrap' }}>
      {icon && <span>{icon}</span>}{label}
    </span>
  )
}

function SectionCard({ title, tag, children, action, noPad }) {
  return (
    <div style={{
      background:
        'radial-gradient(120% 140% at 12% 0%, color-mix(in srgb, var(--green) 4%, transparent), transparent 50%),' +
        'color-mix(in srgb, var(--bg2) 92%, var(--bg) 8%)',
      border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden',
      marginBottom: 16, boxShadow: 'var(--shadow-card)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.015)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {tag && <span style={{ ...M, fontSize: 11, letterSpacing: 3, color: CLRS.cyan }}>{tag}</span>}
          <span style={{ ...M, fontSize: 11, fontWeight: 700, color: 'var(--text)' }}>{title}</span>
        </div>
        {action}
      </div>
      <div style={noPad ? {} : { padding: '20px 20px' }}>{children}</div>
    </div>
  )
}

function Inp({ label, id, ...props }) {
  return (
    <div>
      {label && <label htmlFor={id} style={{ ...M, fontSize: 11, letterSpacing: 2, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>{label}</label>}
      <input id={id} {...props} style={{ width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)',
        color: 'var(--text)', ...M, fontSize: 12, padding: '10px 13px', borderRadius: 10,
        outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s, box-shadow 0.15s', ...props.style }}
        onFocus={e => { e.target.style.borderColor = 'var(--cyan)'; e.target.style.boxShadow = '0 0 0 3px color-mix(in srgb, var(--cyan) 12%, transparent)' }}
        onBlur={e => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none' }} />
    </div>
  )
}

function Btn({ children, color = CLRS.green, ghost, onClick, disabled, small, type = 'button' }) {
  const c = disabled ? 'var(--muted)' : color
  return (
    <button type={type} onClick={onClick} disabled={disabled} style={{
      ...M, fontSize: small ? 9 : 10, letterSpacing: 2, fontWeight: 700,
      padding: small ? '7px 14px' : '10px 22px', borderRadius: 10, cursor: disabled ? 'not-allowed' : 'pointer',
      background: disabled ? 'var(--bg3)' : ghost ? 'transparent' : c + '18',
      border: `1px solid ${disabled ? 'var(--border)' : c}`,
      color: disabled ? 'var(--muted)' : c, transition: 'all 0.15s', opacity: disabled ? 0.6 : 1,
      boxShadow: !disabled && !ghost && c === CLRS.green ? '0 0 14px color-mix(in srgb, var(--green) 14%, transparent)' : undefined,
    }}>{children}</button>
  )
}

function StatusMsg({ msg, type = 'success' }) {
  if (!msg) return null
  const ok = type === 'success'
  return (
    <div style={{ ...M, fontSize: 11, padding: '9px 13px', borderRadius: 10, marginTop: 10,
      color: ok ? CLRS.green : CLRS.red,
      background: ok ? 'color-mix(in srgb, var(--green) 6%, transparent)' : 'rgba(255,71,87,0.06)',
      border: `1px solid ${ok ? 'color-mix(in srgb, var(--green) 25%, transparent)' : 'rgba(255,71,87,0.25)'}` }}>
      {ok ? '✓  ' : '⚠  '}{msg}
    </div>
  )
}

function ago(d) {
  if (!d) return '—'
  const s = Math.floor((Date.now() - new Date(d)) / 1000)
  if (s < 60)    return `${s}s ago`
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return new Date(d).toLocaleDateString()
}

/* ─── Avatar ─────────────────────────────────────────────────────────────── */
function Avatar({ user, size = 80 }) {
  const emoji = builtinAvatarEmoji(user?.avatar)
  if (emoji) return (
    <div style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: 'hsl(142,60%,25%)', border: `2px solid hsl(142,60%,40%)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.5, ...M }}>
      {emoji}
    </div>
  )
  const avatar = avatarUrl(user?.avatar)
  if (avatar) return (
    <img src={avatar} alt={user.username} loading="lazy"
      style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover',
        border: '2px solid var(--border)', flexShrink: 0 }} />
  )
  const initials = (user?.username || '?')[0].toUpperCase()
  const hue = (user?.username || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 360
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: `hsl(${hue},60%,25%)`, border: `2px solid hsl(${hue},60%,40%)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: `hsl(${hue},80%,75%)`, fontWeight: 700, fontSize: size * 0.4, ...M }}>
      {initials}
    </div>
  )
}

/* ─── Ticket status helpers ──────────────────────────────────────────────── */
const STATUS_CFG = {
  open:         { color: CLRS.orange,  label: 'OPEN'        },
  'in-progress':{ color: CLRS.cyan,    label: 'IN PROGRESS' },
  resolved:     { color: CLRS.green,   label: 'RESOLVED'    },
  closed:       { color: '#5a7a95', label: 'CLOSED'      },
  pending:      { color: CLRS.purple,  label: 'PENDING'     },
}
const PRIORITY_CFG = {
  critical: { color: CLRS.red,    label: 'CRITICAL' },
  high:     { color: CLRS.orange, label: 'HIGH'     },
  medium:   { color: CLRS.yellow, label: 'MEDIUM'   },
  low:      { color: CLRS.green,  label: 'LOW'      },
}

export {
  M, D, CLRS, Badge, SectionCard, Inp, Btn, StatusMsg, ago, Avatar,
  STATUS_CFG, PRIORITY_CFG,
  STAFF_PORTAL_ROLES, canAccessAdminPortal, AdminPortalLink,
}
