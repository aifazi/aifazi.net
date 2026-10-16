'use client'
import { useState, useEffect } from 'react'
import api from '@/lib/api'
import { getSupabase } from '@/lib/supabase'
import { useToast } from '../../../components/Toast'
import { useIsMobile } from '../shared'
import { DateTimePicker, Input, TextArea } from '../../../core/ui.jsx'
import { usePausableInterval } from '../../../hooks/usePausableInterval'

// Split out of AdminPanels.jsx - announcements + banner helpers.
const BANNER_STYLES = [
  { id: 'banner',   label: 'Strip',    icon: '▬', desc: 'Full-width bar' },
  { id: 'hero',     label: 'Hero',     icon: '◼', desc: 'Bold block' },
  { id: 'minimal',  label: 'Minimal',  icon: '▏', desc: 'Left border' },
  { id: 'floating', label: 'Float',    icon: '◱', desc: 'Corner card' },
  { id: 'pill',     label: 'Pill',     icon: '⬭', desc: 'Rounded chip' },
  { id: 'glass',    label: 'Glass',    icon: '◇', desc: 'Frost panel' },
  { id: 'outline',  label: 'Outline',  icon: '▣', desc: 'Fine frame' },
  { id: 'ticker',   label: 'Ticker',   icon: '▰', desc: 'News rail' },
  { id: 'neon',     label: 'Neon',     icon: '✦', desc: 'Glowing strip' },
  { id: 'terminal', label: 'Terminal', icon: '$', desc: 'Command rail' },
  { id: 'gradient', label: 'Gradient', icon: '◮', desc: 'Bold color bar' },
]

const bannerDateMs = value => {
  if (!value) return null
  const ms = new Date(value).getTime()
  return Number.isNaN(ms) ? null : ms
}
const isBannerExpired = (b, now = Date.now()) => {
  const ms = bannerDateMs(b.expires_at || b.expiresAt)
  return ms !== null && ms <= now
}
const isBannerScheduled = (b, now = Date.now()) => {
  const ms = bannerDateMs(b.scheduled_at || b.scheduledAt)
  return ms !== null && ms > now
}
const isBannerLiveNow = (b, now = Date.now()) =>
  b.active && !isBannerExpired(b, now) && !isBannerScheduled(b, now)
const toApiDate = value => {
  if (!value) return ''
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? value : d.toISOString()
}
const toLocalDateTimeInput = date => {
  const pad = n => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function BannerRow({ b, TYPES, onToggle, onRemove, onEdit, isEditing }) {
  const tc = TYPES.find(t => t.id === b.type) || TYPES[0]
  const sc = BANNER_STYLES.find(s => s.id === b.style) || BANNER_STYLES[0]
  const id = b._id || b.id
  const isScheduled = isBannerScheduled(b)
  const isExpired = isBannerExpired(b)
  const isExpiring  = !!(b.expires_at || b.expiresAt)
  const isLive = isBannerLiveNow(b)
  return (
    <div
      className="ann-row"
      style={{
        background: isEditing ? tc.color + '0c' : 'var(--bg2)',
        border: '1px solid ' + (isEditing ? tc.color + '55' : 'var(--border)'),
        borderRadius: 8, padding: '11px 14px', marginBottom: 7,
        display: 'flex', alignItems: 'center', gap: 10,
        transition: 'all 0.15s', cursor: 'default',
      }}
    >
      <div style={{ width: 3, height: 34, borderRadius: 2, flexShrink: 0,
        background: 'linear-gradient(180deg,' + tc.color + ',' + tc.color + '55)',
        boxShadow: b.active ? '0 0 6px ' + tc.glow : 'none' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 4 }}>
          {b.message}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
          <span style={{ color: tc.color, background: tc.color + '18', border: '1px solid ' + tc.color + '44', padding: '1px 6px', borderRadius: 3, letterSpacing: 1 }}>
            {tc.icon} {tc.label.toUpperCase()}
          </span>
          {b.style && b.style !== 'banner' && (
            <span style={{ color: 'var(--cyan)', background: 'color-mix(in srgb, var(--cyan) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--cyan) 25%, transparent)', padding: '1px 6px', borderRadius: 3 }}>
              {sc.icon} {sc.label.toUpperCase()}
            </span>
          )}
          {b.pinned && (
            <span style={{ color: '#f59e0b', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', padding: '1px 6px', borderRadius: 3 }}>📌 PINNED</span>
          )}
          {isScheduled && (
            <span style={{ color: '#a855f7', background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.3)', padding: '1px 6px', borderRadius: 3 }}>📅 SCHED</span>
          )}
          {isExpired ? (
            <span style={{ color: '#ff4757', background: 'rgba(255,71,87,0.1)', border: '1px solid rgba(255,71,87,0.3)', padding: '1px 6px', borderRadius: 3 }}>⏱ EXPIRED</span>
          ) : isExpiring && (
            <span style={{ color: '#00d4ff', background: 'color-mix(in srgb, var(--cyan) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--cyan) 25%, transparent)', padding: '1px 6px', borderRadius: 3 }}>⏱ EXPIRES</span>
          )}
          {b.link && (
            <a href={b.link} target="_blank" rel="noreferrer"
              style={{ color: tc.color, textDecoration: 'none', borderBottom: '1px solid ' + tc.color + '55' }}>
              {b.linkLabel || 'link'}
            </a>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        <button onClick={() => onEdit(b)} title="Edit"
          style={{ padding: '5px 9px', borderRadius: 5, fontFamily: 'var(--font-mono)', fontSize: 11,
            background: isEditing ? 'color-mix(in srgb, var(--cyan) 15%, transparent)' : 'transparent',
            color: isEditing ? 'var(--cyan)' : 'var(--muted)',
            border: '1px solid ' + (isEditing ? 'color-mix(in srgb, var(--cyan) 40%, transparent)' : 'var(--border)'),
            cursor: 'pointer' }}>&#9998;</button>
        <button onClick={() => onToggle(id, b.active)}
          style={{ padding: '5px 9px', borderRadius: 5, fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 0.5,
            background: isLive ? 'color-mix(in srgb, var(--green) 10%, transparent)' : isExpired ? 'rgba(255,71,87,0.08)' : 'transparent',
            color: isLive ? 'var(--green)' : isExpired ? '#ff4757' : 'var(--muted)',
            border: '1px solid ' + (isLive ? 'color-mix(in srgb, var(--green) 35%, transparent)' : isExpired ? 'rgba(255,71,87,0.3)' : 'var(--border)'),
            cursor: 'pointer' }}>{isLive ? 'LIVE' : isExpired ? 'EXPIRED' : 'OFF'}</button>
        {b.pinned ? (
          <button title="Unpin to enable delete" disabled
            style={{ padding: '5px 9px', borderRadius: 5, fontFamily: 'var(--font-mono)', fontSize: 11,
              background: 'rgba(245,158,11,0.08)', color: '#f59e0b',
              border: '1px solid rgba(245,158,11,0.25)', cursor: 'not-allowed', opacity: 0.7 }}>📌</button>
        ) : (
          <button onClick={() => onRemove(id)} title="Delete"
            style={{ padding: '5px 9px', borderRadius: 5, fontFamily: 'var(--font-mono)', fontSize: 11,
              background: 'transparent', color: '#ff4757',
              border: '1px solid rgba(255,71,87,0.3)', cursor: 'pointer' }}>&#215;</button>
        )}
      </div>
    </div>
  )
}

function AnnouncementsPanel() {
  const toast    = useToast()
  const isMobile = useIsMobile()
  const [banners, setBanners] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [editId,  setEditId]  = useState(null)
  const [nowTick, setNowTick] = useState(() => Date.now())
  const [form, setForm]       = useState({ message: '', type: 'info', link: '', linkLabel: '', active: true, pinned: false, style: 'banner', scheduledAt: '', expiresAt: '' })

  const TYPES = [
    { id: 'info',    label: 'Info',    icon: '\u2139\ufe0f', color: '#00d4ff', glow: 'color-mix(in srgb, var(--cyan) 20%, transparent)'  },
    { id: 'warning', label: 'Warning', icon: '\u26a0\ufe0f', color: '#ffd700', glow: 'rgba(255,215,0,0.2)'   },
    { id: 'success', label: 'Success', icon: '\u2705',        color: '#00ff88', glow: 'color-mix(in srgb, var(--green) 20%, transparent)'  },
    { id: 'alert',   label: 'Alert',   icon: '\ud83d\udea8', color: '#ff4757', glow: 'rgba(255,71,87,0.2)'   },
  ]

  const fetchAll = () =>
    api.get('/admin/banners/all')
      .then(r => setBanners(r.data || []))
      .catch(() => {})
      .finally(() => setLoading(false))

  useEffect(() => {
    const sb = getSupabase()
    if (!sb) return

    fetchAll()

    // ── Supabase Realtime ─────────────────────────────────────────────────
    // Any admin on any device creates / edits / deletes a banner →
    // this panel refreshes instantly without a page reload.
    const channel = sb
      .channel('banners-admin-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'banners' },
        () => { fetchAll() }
      )
      .subscribe()

    // ── Realtime keeps this panel fresh; polling fallback (15s) is pausable
    // (see usePausableInterval below) and handles missing REPLICA IDENTITY.
    const clock = setInterval(() => setNowTick(Date.now()), 30_000)

    return () => {
      sb.removeChannel(channel)
      clearInterval(clock)
    }
  }, [])
  usePausableInterval(fetchAll, 15000)

  const set   = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const reset = () => {
    setForm({ message: '', type: 'info', link: '', linkLabel: '', active: true, pinned: false, style: 'banner', scheduledAt: '', expiresAt: '' })
    setEditId(null)
  }

  const submit = async e => {
    e.preventDefault()
    if (!form.message.trim()) return
    setSaving(true)
    const payload = {
      ...form,
      scheduledAt: toApiDate(form.scheduledAt),
      expiresAt: toApiDate(form.expiresAt),
    }
    try {
      if (editId) {
        const r = await api.put('/admin/banners/' + editId, payload)
        setBanners(b => b.map(x => (x._id || x.id) === editId ? r.data : x))
        toast.success('Banner updated', { title: 'Announcements' })
      } else {
        const r = await api.post('/admin/banners', payload)
        setBanners(b => [r.data, ...b])
        toast.success('Banner published', { title: 'Announcements' })
      }
      reset()
    } catch (err) { toast.error(err.response?.data?.error || 'Failed', { title: 'Error' }) }
    finally { setSaving(false) }
  }

  const toggle = async (id, active) => {
    try {
      await api.patch('/admin/banners/' + id, { active: !active })
      setBanners(b => b.map(x => (x._id || x.id) === id ? { ...x, active: !active } : x))
    } catch { toast.error('Failed to update', { title: 'Error' }) }
  }

  const remove = async id => {
    const ok = await confirm({ title: 'Delete Announcement', message: 'This banner will be removed from every page. This cannot be undone.', variant: 'danger', confirmLabel: 'DELETE' })
    if (!ok) return
    try {
      await api.delete('/admin/banners/' + id)
      setBanners(b => b.filter(x => (x._id || x.id) !== id))
      toast.success('Banner removed', { title: 'Announcements' })
      if (editId === id) reset()
    } catch { toast.error('Failed to delete', { title: 'Error' }) }
  }

  const startEdit = b => {
    setEditId(b._id || b.id)
    // DB returns snake_case (link_label, scheduled_at, expires_at) — map to form camelCase
    setForm({
      message:     b.message || '',
      type:        b.type || 'info',
      link:        b.link || '',
      linkLabel:   b.link_label || b.linkLabel || '',
      active:      b.active !== false,
      pinned:      !!b.pinned,
      style:       b.style || 'banner',
      scheduledAt: b.scheduled_at || b.scheduledAt || '',
      expiresAt:   b.expires_at   || b.expiresAt   || '',
    })
  }

  const activeType = TYPES.find(t => t.id === form.type) || TYPES[0]
  const now = nowTick
  const activeLive = banners.filter(b => isBannerLiveNow(b, now))
  const activeHid  = banners.filter(b => !isBannerLiveNow(b, now))

  const inp = {
    width: '100%', background: 'var(--bg)', border: '1px solid var(--border)',
    borderRadius: 6, color: 'var(--text)', padding: '10px 13px',
    fontFamily: 'var(--font-mono)', fontSize: 11, outline: 'none',
    boxSizing: 'border-box', transition: 'border-color 0.15s',
  }
  const lbl = {
    display: 'block', fontFamily: 'var(--font-mono)', fontSize: 11,
    letterSpacing: 2.5, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase',
  }

  return (
    <div style={{ maxWidth: 820, padding: isMobile ? '16px' : '28px 32px' }}>
      <style>{`
        @keyframes bnrAnnPulse { 0%,100%{opacity:1} 50%{opacity:.3} }
        @keyframes bnrAnnSlide { from{transform:translateX(-6px);opacity:0} to{transform:translateX(0);opacity:1} }
        .ann-inp:focus { border-color:var(--cyan)!important; box-shadow:0 0 0 2px color-mix(in srgb, var(--cyan) 10%, transparent)!important; }
        .ann-row:hover { border-color:rgba(255,255,255,0.1)!important; background:var(--bg3)!important; }
      `}</style>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 28, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 3,
            color: 'var(--muted)', marginBottom: 4 }}>ADMIN &rarr; SITE</div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: isMobile ? 20 : 26,
            fontWeight: 700, margin: 0 }}>Announcements</h2>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 11, padding: '5px 12px', borderRadius: 99,
            background: activeLive.length ? 'color-mix(in srgb, var(--green) 10%, transparent)' : 'var(--bg2)',
            border: '1px solid ' + (activeLive.length ? 'color-mix(in srgb, var(--green) 35%, transparent)' : 'var(--border)'),
            color: activeLive.length ? 'var(--green)' : 'var(--muted)',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {activeLive.length > 0 && (
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)',
                animation: 'bnrAnnPulse 2s infinite', display: 'inline-block' }} />
            )}
            {activeLive.length} LIVE
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, padding: '5px 12px',
            borderRadius: 99, background: 'var(--bg2)', border: '1px solid var(--border)',
            color: 'var(--muted)' }}>
            {banners.length} TOTAL
          </div>
        </div>
      </div>

      {/* ── Two-column grid ── */}
      <div style={{ display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '1fr 310px', gap: 20, alignItems: 'start' }}>

        {/* LEFT — form */}
        <div style={{
          background: 'var(--bg2)',
          border: '1px solid ' + (editId ? activeType.color + '55' : 'var(--border)'),
          borderRadius: 10, overflow: 'visible', transition: 'border-color 0.2s',
          position: 'relative',
        }}>
          {/* form header */}
          <div style={{
            padding: '13px 20px', borderBottom: '1px solid var(--border)',
            background: editId ? activeType.color + '0a' : 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 3, height: 18, borderRadius: 2,
                background: editId ? activeType.color : 'var(--muted)' }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2.5,
                color: editId ? activeType.color : 'var(--muted)' }}>
                {editId ? 'EDIT BANNER' : 'NEW BANNER'}
              </span>
            </div>
            {editId && (
              <button onClick={reset}
                style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1,
                  padding: '4px 10px', borderRadius: 4, background: 'transparent',
                  border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer' }}>
                CANCEL
              </button>
            )}
          </div>

          <form onSubmit={submit} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 15 }}>

            {/* type pills */}
            <div>
              <label style={lbl}>Type</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {TYPES.map(t => (
                  <button key={t.id} type="button" onClick={() => set('type', t.id)} style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
                    borderRadius: 99, fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 0.5,
                    background: form.type === t.id ? t.color + '1a' : 'var(--bg3)',
                    color: form.type === t.id ? t.color : 'var(--muted)',
                    border: '1px solid ' + (form.type === t.id ? t.color + '55' : 'var(--border)'),
                    cursor: 'pointer', transition: 'all 0.15s',
                    boxShadow: form.type === t.id ? '0 0 10px ' + t.glow : 'none',
                  }}>
                    <span>{t.icon}</span> {t.label.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* message */}
            <div>
              <label style={lbl}>Message</label>
              <TextArea
                value={form.message}
                onChange={v => set('message', v)}
                placeholder="Site maintenance scheduled for Friday at 2AM UTC..."
                rows={3}
                className="ann-inp"
                style={{ ...inp, resize: 'vertical', minHeight: 70 }}
                required
              />
            </div>

            {/* link row */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0,1fr) minmax(0,1fr)', gap: 10 }}>
              <div>
                <label style={lbl}>Link URL <span style={{ opacity: 0.45 }}>(opt.)</span></label>
                <Input className="ann-inp" value={form.link}
                  onChange={v => set('link', v)}
                  placeholder="https://..." style={inp} />
              </div>
              <div>
                <label style={lbl}>Link Label</label>
                <Input className="ann-inp" value={form.linkLabel}
                  onChange={v => set('linkLabel', v)}
                  placeholder="Learn more" style={inp} />
              </div>
            </div>

            {/* ── Display Style ── */}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
              <label style={lbl}>Display Style</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(72px,1fr))', gap: 6 }}>
                {BANNER_STYLES.map(s => {
                  const on = form.style === s.id
                  return (
                    <button key={s.id} type="button" onClick={() => set('style', s.id)} style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                      padding: '9px 4px', borderRadius: 7, cursor: 'pointer', transition: 'all 0.15s',
                      background: on ? activeType.color + '18' : 'var(--bg3)',
                      border: '1px solid ' + (on ? activeType.color + '66' : 'var(--border)'),
                      color: on ? activeType.color : 'var(--muted)',
                      boxShadow: on ? '0 0 12px ' + activeType.glow : 'none',
                    }}>
                      <span style={{ fontSize: 17, lineHeight: 1 }}>{s.icon}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1, fontWeight: on ? 700 : 400 }}>{s.label.toUpperCase()}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: on ? activeType.color + 'bb' : 'var(--border)', textAlign: 'center', lineHeight: 1.3 }}>{s.desc}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* ── Schedule & Expiry ── */}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0,1fr) minmax(0,1fr)', gap: 12, marginBottom: 10, overflow: 'visible' }}>
                <div style={{ minWidth: 0, position: 'relative' }}>
                  <label style={lbl}>📅 Schedule <span style={{ opacity: 0.4 }}>(auto-publish)</span></label>
                  <DateTimePicker
                    value={form.scheduledAt}
                    onChange={v => set('scheduledAt', v)}
                    placeholder="Publish immediately…"
                  />
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                    Blank = publish immediately
                  </div>
                </div>
                <div style={{ minWidth: 0, position: 'relative' }}>
                  <label style={lbl}>⏱ Expires At <span style={{ opacity: 0.4 }}>(auto-hide)</span></label>
                  <DateTimePicker
                    value={form.expiresAt}
                    onChange={v => set('expiresAt', v)}
                    placeholder="Keep active forever…"
                    dropdownAlign={isMobile ? 'left' : 'right'}
                  />
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                    Blank = keep active forever
                  </div>
                </div>
              </div>
              {/* Quick-expire shortcuts */}
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', letterSpacing: 1, marginRight: 2 }}>QUICK EXPIRE:</span>
                {[['1h',1],['6h',6],['12h',12],['24h',24],['3d',72],['7d',168]].map(([label, hrs]) => (
                  <button key={label} type="button"
                    onClick={() => set('expiresAt', toLocalDateTimeInput(new Date(Date.now() + hrs * 3600000)))}
                    style={{ fontFamily: 'var(--font-mono)', fontSize: 11, padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
                      background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--cyan)', letterSpacing: 1,
                      transition: 'all 0.12s' }}>
                    {label}
                  </button>
                ))}
                {form.expiresAt && (
                  <button type="button" onClick={() => set('expiresAt', '')}
                    style={{ fontFamily: 'var(--font-mono)', fontSize: 11, padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
                      background: 'transparent', border: '1px solid rgba(255,71,87,0.3)', color: '#ff4757' }}>
                    ✕ clear
                  </button>
                )}
              </div>
            </div>

            {/* ── Pinned toggle ── */}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', userSelect: 'none' }}
                onClick={() => set('pinned', !form.pinned)}>
                <div style={{ width: 38, height: 21, borderRadius: 11,
                  background: form.pinned ? '#f59e0b' : 'var(--bg3)',
                  border: '1px solid ' + (form.pinned ? '#f59e0b' : 'var(--border)'),
                  position: 'relative', transition: 'all 0.2s', flexShrink: 0 }}>
                  <div style={{ position: 'absolute', top: 3, left: form.pinned ? 19 : 3,
                    width: 13, height: 13, borderRadius: '50%',
                    background: form.pinned ? '#fff' : 'var(--muted)',
                    transition: 'left 0.2s' }} />
                </div>
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1,
                    color: form.pinned ? '#f59e0b' : 'var(--text)' }}>
                    📌 PINNED — Cannot be dismissed
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                    Hides the close button · Delete button locked until unpinned
                  </div>
                </div>
              </label>
            </div>

            {/* live preview */}
            {form.message.trim() && (() => {
              const styleObj = BANNER_STYLES.find(s => s.id === form.style) || BANNER_STYLES[0]
              const isHero    = form.style === 'hero'
              const isMinimal = form.style === 'minimal'
              const isFloating = form.style === 'floating'
              const isPill    = form.style === 'pill'
              const isGlass   = form.style === 'glass'
              const isOutline = form.style === 'outline'
              const isTicker  = form.style === 'ticker'
              return (
                <div style={{
                  animation: 'bnrAnnSlide 0.25s ease both',
                  ...(isFloating ? {
                    alignSelf: 'flex-end', maxWidth: 320,
                    background: 'linear-gradient(135deg,' + activeType.color + '0e,var(--bg2))',
                    border: '1px solid ' + activeType.color + '44',
                    borderRadius: 12, padding: '12px 16px',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                  } : isPill ? {
                    alignSelf: 'flex-start',
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    background: activeType.color + '18', border: '1px solid ' + activeType.color + '55',
                    borderRadius: 99, padding: '6px 14px',
                    boxShadow: '0 0 16px ' + activeType.glow,
                  } : isMinimal ? {
                    display: 'flex', alignItems: 'center', gap: 10,
                    background: 'var(--bg)',
                    borderLeft: '3px solid ' + activeType.color,
                    padding: '10px 14px',
                  } : isHero ? {
                    display: 'flex', flexDirection: 'column', gap: 6,
                    background: 'linear-gradient(90deg,' + activeType.color + '18 0%, var(--bg) 70%)',
                    border: '1px solid ' + activeType.color + '44',
                    borderRadius: 8, padding: '18px 20px',
                  } : isGlass ? {
                    display: 'flex', alignItems: 'center',
                    background: 'linear-gradient(135deg,rgba(255,255,255,0.055),' + activeType.color + '12)',
                    border: '1px solid ' + activeType.color + '38',
                    borderRadius: 12, padding: '11px 14px',
                    boxShadow: '0 14px 34px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.07)',
                    backdropFilter: 'blur(14px)',
                  } : isOutline ? {
                    display: 'flex', alignItems: 'center',
                    background: 'transparent',
                    border: '1px solid ' + activeType.color + '66',
                    outline: '1px solid rgba(255,255,255,0.035)',
                    borderRadius: 8, padding: '9px 12px',
                  } : isTicker ? {
                    display: 'flex', alignItems: 'center',
                    background: 'linear-gradient(90deg,var(--bg),' + activeType.color + '10,var(--bg))',
                    borderTop: '1px solid ' + activeType.color + '33',
                    borderBottom: '1px solid ' + activeType.color + '33',
                    borderRadius: 6, overflow: 'hidden',
                  } : {
                    display: 'flex', alignItems: 'center',
                    background: 'linear-gradient(90deg,' + activeType.color + '0f 0%,rgba(5,12,22,0.95) 22%)',
                    border: '1px solid ' + activeType.color + '28',
                    borderRadius: 7, overflow: 'hidden',
                  }),
                }}>
                  {!isPill && !isMinimal && !isHero && !isGlass && !isOutline && (
                    <div style={{ width: 3, alignSelf: 'stretch', flexShrink: 0,
                      background: 'linear-gradient(180deg,' + activeType.color + ',' + activeType.color + '66)' }} />
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, ...(isHero ? {} : { margin: '0 10px', padding: isGlass || isOutline ? 0 : '9px 0', flexShrink: 0 }), ...(isPill ? { margin: 0, padding: 0 } : {}) }}>
                    <span style={{ padding: '3px 8px', borderRadius: isPill ? 99 : 4,
                      background: activeType.color + '18', border: '1px solid ' + activeType.color + '44',
                      color: activeType.color, fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1.5, fontWeight: 700 }}>
                      {activeType.icon} {activeType.label.toUpperCase()}
                    </span>
                    {form.style !== 'banner' && (
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: activeType.color + '99', letterSpacing: 1 }}>
                        {styleObj.icon} {styleObj.label.toUpperCase()}
                      </span>
                    )}
                    {form.pinned && <span style={{ fontSize: 11 }}>📌</span>}
                    {!isHero && !isPill && (
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: activeType.color, animation: 'bnrAnnPulse 2s infinite', display: 'inline-block' }} />
                    )}
                  </div>
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    {isHero && (
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 3, color: activeType.color, marginBottom: 4, opacity: 0.8 }}>ANNOUNCEMENT</div>
                    )}
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: isHero ? 13 : 11, color: 'var(--text)', lineHeight: 1.55,
                      ...(!isHero ? { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', padding: isMinimal || isPill ? 0 : '9px 0' } : {}) }}>
                      {form.message}
                    </span>
                  </div>
                  {form.link && form.linkLabel && (
                    <a href={form.link} target="_blank" rel="noopener noreferrer" style={{ flexShrink: 0, fontFamily: 'var(--font-mono)', fontSize: 11, color: activeType.color, margin: '0 10px', textDecoration: 'none', borderBottom: '1px solid ' + activeType.color + '55' }}>
                      {form.linkLabel} &rarr;
                    </a>
                  )}
                  {!form.pinned && (
                    <span style={{ flexShrink: 0, padding: '0 13px', color: 'var(--muted)', fontSize: 14, cursor: 'default', opacity: 0.5 }}>&#215;</span>
                  )}
                </div>
              )
            })()}

            {/* submit */}
            <button
              type="submit"
              disabled={saving || !form.message.trim()}
              style={{
                alignSelf: 'flex-start',
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 22px', borderRadius: 7, border: 'none',
                background: saving ? 'var(--bg3)' : (editId ? activeType.color : 'var(--green)'),
                color: saving ? 'var(--muted)' : '#000',
                fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, fontWeight: 700,
                cursor: saving ? 'not-allowed' : 'pointer',
                opacity: (!form.message.trim() && !saving) ? 0.4 : 1,
                transition: 'all 0.15s',
                boxShadow: (!saving && form.message.trim())
                  ? '0 0 16px ' + (editId ? activeType.glow : 'color-mix(in srgb, var(--green) 28%, transparent)')
                  : 'none',
              }}
            >
              {saving ? 'SAVING...' : editId ? '\u2713 UPDATE BANNER' : '\ud83d\udce2 PUBLISH BANNER'}
            </button>
          </form>
        </div>

        {/* RIGHT — list */}
        <div>
          {loading ? (
            <div style={{ padding: 48, textAlign: 'center', fontFamily: 'var(--font-mono)',
              fontSize: 11, color: 'var(--muted)', letterSpacing: 2 }}>LOADING...</div>
          ) : banners.length === 0 ? (
            <div style={{ padding: '52px 20px', textAlign: 'center',
              background: 'var(--bg2)', borderRadius: 10,
              border: '1px dashed var(--border)' }}>
              <div style={{ fontSize: 30, marginBottom: 10 }}>\ud83d\udce2</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11,
                color: 'var(--muted)', letterSpacing: 2 }}>NO BANNERS YET</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11,
                color: 'var(--muted)', marginTop: 6 }}>
                Publish one to show a site-wide announcement
              </div>
            </div>
          ) : (
            <>
              {activeLive.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 3,
                    color: 'var(--green)', marginBottom: 8,
                    display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%',
                      background: 'var(--green)', animation: 'bnrAnnPulse 2s infinite',
                      display: 'inline-block' }} />
                    LIVE ({activeLive.length})
                  </div>
                  {activeLive.map(b => (
                    <BannerRow key={b._id || b.id} b={b} TYPES={TYPES}
                      onToggle={toggle} onRemove={remove} onEdit={startEdit}
                      isEditing={editId === (b._id || b.id)} />
                  ))}
                </div>
              )}
              {activeHid.length > 0 && (
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 3,
                    color: 'var(--muted)', marginBottom: 8 }}>
                    HIDDEN ({activeHid.length})
                  </div>
                  {activeHid.map(b => (
                    <BannerRow key={b._id || b.id} b={b} TYPES={TYPES}
                      onToggle={toggle} onRemove={remove} onEdit={startEdit}
                      isEditing={editId === (b._id || b.id)} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export { AnnouncementsPanel }
