'use client'

/**
 * Shared glass/neon design system for Forum + Blog.
 * All components use CSS variables so they follow the active theme.
 */

import { Link } from '@/lib/router-compat'
import { UserAvatar } from '@/lib/avatar'

export const CLR = {
  green: 'var(--green)',
  cyan: 'var(--cyan)',
  orange: 'var(--orange)',
  red: 'var(--red)',
  purple: 'var(--purple)',
}

export function timeAgo(date) {
  if (!date) return ''
  const d = new Date(date)
  if (isNaN(d.getTime())) return ''
  const s = Math.floor((Date.now() - d) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function formatDate(d) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

// ── Glass card ────────────────────────────────────────────────────────────────
export function Card({ children, hover = false, accent, style = {}, onClick, className = '' }) {
  return (
    <div
      className={`community-card${hover ? ' community-card-hover' : ''}${accent ? ' community-card-accent' : ''} ${className}`}
      data-accent={accent || ''}
      onClick={onClick}
      style={style}
    >
      {children}
    </div>
  )
}

// ── Section header ────────────────────────────────────────────────────────────
export function SectionHeader({ eyebrow, title, right, accent = 'green' }) {
  return (
    <div className="community-section-header">
      <div>
        {eyebrow && <div className="community-eyebrow" style={{ color: `var(--${accent})` }}>{eyebrow}</div>}
        {title && <h2 className="community-section-title">{title}</h2>}
      </div>
      {right && <div className="community-section-right">{right}</div>}
    </div>
  )
}

// ── Neon button ───────────────────────────────────────────────────────────────
export function NeonButton({ children, variant = 'primary', size = 'md', as: Comp = 'button', to, href, onClick, disabled, style = {}, className = '', ...rest }) {
  let Tag = Comp
  const linkProps = {}
  if (to) { Tag = Link; linkProps.to = to }
  if (href) { Tag = 'a'; linkProps.href = href }
  return (
    <Tag
      {...linkProps}
      {...rest}
      className={`neon-btn neon-btn-${variant} neon-btn-${size} ${className}`}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      aria-disabled={disabled || undefined}
      style={style}
    >
      {children}
    </Tag>
  )
}

// ── Badge / pill ─────────────────────────────────────────────────────────────
export function Badge({ children, tone = 'neutral', glow = false, style = {}, className = '' }) {
  return (
    <span className={`community-badge community-badge-${tone}${glow ? ' community-badge-glow' : ''} ${className}`} style={style}>
      {children}
    </span>
  )
}

export function RoleBadge({ role }) {
  const map = {
    admin: { tone: 'orange', label: 'Admin' },
    moderator: { tone: 'cyan', label: 'Moderator' },
    editor: { tone: 'purple', label: 'Editor' },
    staff: { tone: 'purple', label: 'Staff' },
    user: { tone: 'neutral', label: 'Member' },
  }
  const cfg = map[role] || map.user
  return <Badge tone={cfg.tone}>{cfg.label}</Badge>
}

// ── Avatar ────────────────────────────────────────────────────────────────────
export function Avatar({ user, size = 40, online = false, style = {} }) {
  const seed = user?.username || user?.name || 'U'
  return (
    <div className="community-avatar-wrap" style={{ width: size, height: size, ...style }}>
      <UserAvatar
        avatar={user?.avatar}
        name={seed}
        size={size}
        imgClassName="community-avatar"
        imgStyle={{ width: size, height: size }}
        fallback={`https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(seed)}&backgroundColor=0b1118&textColor=00ff88`}
      />
      {online && <span className="community-avatar-online" />}
    </div>
  )
}

// ── Stat block ────────────────────────────────────────────────────────────────
export function Stat({ label, value, color = 'var(--cyan)', icon, small = false }) {
  return (
    <div className={`community-stat${small ? ' community-stat-small' : ''}`}>
      {icon && <span className="community-stat-icon">{icon}</span>}
      <div className="community-stat-value" style={{ color }}>{value}</div>
      <div className="community-stat-label">{label}</div>
    </div>
  )
}

// ── Sort tabs ─────────────────────────────────────────────────────────────────
export function SortTabs({ options, value, onChange, style = {} }) {
  return (
    <div className="community-sort-tabs" style={style}>
      {options.map(opt => {
        const key = typeof opt === 'object' ? opt.value : opt
        const label = typeof opt === 'object' ? opt.label : opt
        return (
          <button
            key={key}
            className={`community-sort-tab${value === key ? ' active' : ''}`}
            onClick={() => onChange(key)}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

// ── Pagination ───────────────────────────────────────────────────────────────
export function Pagination({ page, pages, onChange, total, pageSize = 20 }) {
  if (pages <= 1) return null
  return (
    <div className="community-pagination">
      <div className="community-pagination-meta">
        {total ? `${total} results` : `${pages} pages`}
      </div>
      <div className="community-pagination-btns">
        <button className="community-page-btn" disabled={page <= 1} onClick={() => onChange(page - 1)}>‹</button>
        {Array.from({ length: pages }).map((_, i) => {
          const p = i + 1
          // Window: show first/last + neighbors of current page
          const show = p === 1 || p === pages || Math.abs(p - page) <= 1
          if (!show) {
            return i === 1 || i === pages - 2 ? <span key={p} className="community-page-ellipsis">…</span> : null
          }
          return (
            <button
              key={p}
              className={`community-page-btn${page === p ? ' active' : ''}`}
              onClick={() => onChange(p)}
            >
              {p}
            </button>
          )
        })}
        <button className="community-page-btn" disabled={page >= pages} onClick={() => onChange(page + 1)}>›</button>
      </div>
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────
export function EmptyState({ icon = '🗒', title, text, action, actionTo }) {
  return (
    <div className="community-empty">
      <div className="community-empty-icon">{icon}</div>
      <div className="community-empty-title">{title}</div>
      {text && <div className="community-empty-text">{text}</div>}
      {action && (actionTo
        ? <NeonButton to={actionTo} variant="ghost" style={{ marginTop: 18 }}>{action}</NeonButton>
        : <NeonButton variant="ghost" style={{ marginTop: 18 }}>{action}</NeonButton>
      )}
    </div>
  )
}

// ── Loading skeleton row ──────────────────────────────────────────────────────
export function ThreadRowSkeleton() {
  return (
    <div className="community-skel-row">
      <div className="community-skel community-skel-avatar" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="community-skel" style={{ width: '55%', height: 16, marginBottom: 10 }} />
        <div className="community-skel" style={{ width: '80%', height: 12 }} />
      </div>
      <div className="community-skel" style={{ width: 70, height: 34, flexShrink: 0 }} />
    </div>
  )
}

// ── Search input ──────────────────────────────────────────────────────────────
export function SearchBox({ value, onChange, placeholder = 'Search...', style = {} }) {
  return (
    <div className="community-search" style={style}>
      <span className="community-search-icon">⌕</span>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="community-search-input"
      />
      {value && (
        <button className="community-search-clear" onClick={() => onChange('')} aria-label="Clear search">✕</button>
      )}
    </div>
  )
}
