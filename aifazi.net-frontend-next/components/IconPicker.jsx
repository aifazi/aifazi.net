'use client'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

// ─── Icon data ─────────────────────────────────────────────────────────────
export const LORDICON_ICONS = [
  { label: 'Globe',     url: 'https://cdn.lordicon.com/iykgtsbt.json' },
  { label: 'Shield',    url: 'https://cdn.lordicon.com/mrdiiocb.json' },
  { label: 'Server',    url: 'https://cdn.lordicon.com/uukerzzv.json' },
  { label: 'Lock',      url: 'https://cdn.lordicon.com/vdjwmfqs.json' },
  { label: 'Cloud',     url: 'https://cdn.lordicon.com/brfmhbgg.json' },
  { label: 'Code',      url: 'https://cdn.lordicon.com/wloilxuq.json' },
  { label: 'CPU',       url: 'https://cdn.lordicon.com/flvisirw.json' },
  { label: 'Database',  url: 'https://cdn.lordicon.com/ndydpcaq.json' },
  { label: 'Terminal',  url: 'https://cdn.lordicon.com/wmlleaaf.json' },
  { label: 'Wifi',      url: 'https://cdn.lordicon.com/hbrdkfvh.json' },
  { label: 'Gear',      url: 'https://cdn.lordicon.com/igkgkfkb.json' },
  { label: 'Lightning', url: 'https://cdn.lordicon.com/dxoycpzg.json' },
  { label: 'Person',    url: 'https://cdn.lordicon.com/kdduutaw.json' },
  { label: 'Trophy',    url: 'https://cdn.lordicon.com/tyvtvbcy.json' },
  { label: 'Rocket',    url: 'https://cdn.lordicon.com/visznieh.json' },
  { label: 'Chart',     url: 'https://cdn.lordicon.com/dqxvvqzi.json' },
  { label: 'Mail',      url: 'https://cdn.lordicon.com/diihvcfp.json' },
  { label: 'Folder',    url: 'https://cdn.lordicon.com/fhtaantg.json' },
  { label: 'Search',    url: 'https://cdn.lordicon.com/msoeawqm.json' },
  { label: 'Star',      url: 'https://cdn.lordicon.com/iiixsnft.json' },
]

export const EMOJI_OPTIONS = [
  '🌐','🔒','🖥️','☁️','🔧','💻','🛡️','⚡','🗄️','📡','🔌','🌊',
  '🏗️','🤖','🔬','🎯','📱','🔑','🌟','📊','🚀','✉️','📁','🔍',
  '👤','🏆','💡','🛠️','🌍','⚙️','📝','🧠','🔐','🌐','🎨','📦',
]

// ─── Helpers ───────────────────────────────────────────────────────────────
export function isLordicon(v) { return typeof v === 'string' && v.startsWith('http') && v.endsWith('.json') }
export function isImageUrl(v) { return typeof v === 'string' && v.startsWith('http') && !v.endsWith('.json') }

export function useLordiconScript() {
  useEffect(() => {
    if (document.querySelector('[data-lordicon-loaded]')) return
    const s = document.createElement('script')
    s.src = 'https://cdn.lordicon.com/lordicon.js'
    s.setAttribute('data-lordicon-loaded', '1')
    document.head.appendChild(s)
  }, [])
}

// ─── Universal icon renderer ───────────────────────────────────────────────
export function IconDisplay({ value, size = 36 }) {
  if (isLordicon(value)) {
    return (
      <lord-icon
        src={value}
        trigger="hover"
        colors="primary:#00d4ff,secondary:#00ff88"
        style={{ width: size, height: size }}
      />
    )
  }
  if (isImageUrl(value)) {
    return <img src={value} alt="" style={{ width: size, height: size, objectFit: 'contain' }} />
  }
  return <span style={{ fontSize: size * 0.85, lineHeight: 1 }}>{value || '❓'}</span>
}

// ─── Icon Picker Modal ─────────────────────────────────────────────────────
export function IconPickerModal({ currentValue, onSave, onClose }) {
  useLordiconScript()
  const [tab, setTab] = useState(() =>
    isLordicon(currentValue) ? 'animated' : isImageUrl(currentValue) ? 'custom' : 'emoji'
  )
  const [selected, setSelected] = useState(currentValue)
  const [customUrl, setCustomUrl] = useState(
    isImageUrl(currentValue) || isLordicon(currentValue) ? currentValue : ''
  )

  const tabs = [
    { key: 'emoji',    label: '😀 Emoji'      },
    { key: 'animated', label: '✨ Animated'    },
    { key: 'custom',   label: '🔗 Custom URL'  },
  ]

  return createPortal(
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', zIndex: 999997 }} />

      {/* Modal — 3-part flex: header (pinned) | content (scrolls) | footer (pinned) */}
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        background: '#0b1118', border: '1px solid rgba(0,212,255,0.3)',
        boxShadow: '0 0 60px rgba(0,212,255,0.12), 0 24px 64px rgba(0,0,0,0.9)',
        width: 440, maxHeight: '80vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        zIndex: 999998, fontFamily: "var(--font-mono)",
      }}>

        {/* ── HEADER + TABS (pinned top, never scrolls) ── */}
        <div style={{ flexShrink: 0, padding: '20px 24px 0', borderBottom: '1px solid rgba(0,212,255,0.1)', position: 'relative', zIndex: 2 }}>
          <div style={{ fontSize: 10, letterSpacing: 3, color: 'var(--cyan)', marginBottom: 14 }}>EDIT ICON</div>
          <div style={{ display: 'flex', gap: 0 }}>
            {tabs.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)} style={{
                flex: 1, padding: '8px 4px', fontSize: 10, letterSpacing: 1,
                background: tab === t.key ? 'rgba(0,212,255,0.1)' : 'transparent',
                border: 'none', borderBottom: `2px solid ${tab === t.key ? 'var(--cyan)' : 'transparent'}`,
                color: tab === t.key ? 'var(--cyan)' : '#4a6070',
                cursor: 'pointer', transition: 'all 0.2s',
              }}>{t.label}</button>
            ))}
          </div>
        </div>

        {/* ── SCROLLABLE CONTENT (only this part scrolls) ── */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 24 }}>

          {/* Preview */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20, padding: '12px 16px', background: 'rgba(0,212,255,0.04)', border: '1px solid rgba(0,212,255,0.12)' }}>
            <div style={{ width: 52, height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg3)', border: '1px solid var(--border)', flexShrink: 0 }}>
              <IconDisplay value={selected} size={36} />
            </div>
            <div style={{ overflow: 'hidden', minWidth: 0 }}>
              <div style={{ fontSize: 9, color: 'var(--muted)', letterSpacing: 2 }}>PREVIEW</div>
              <div style={{ fontSize: 11, color: 'var(--text)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected || 'No icon selected'}</div>
            </div>
          </div>

          {/* Emoji tab */}
          {tab === 'emoji' && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {EMOJI_OPTIONS.map(e => (
                <button key={e} onClick={() => setSelected(e)} style={{
                  width: 44, height: 44, fontSize: 22,
                  background: selected === e ? 'rgba(0,255,136,0.15)' : 'var(--bg3)',
                  border: `1px solid ${selected === e ? 'rgba(0,255,136,0.5)' : 'var(--border)'}`,
                  cursor: 'pointer', transition: 'all 0.15s', borderRadius: 4,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>{e}</button>
              ))}
            </div>
          )}

          {/* Animated tab */}
          {tab === 'animated' && (
            <div>
              <div style={{ fontSize: 9, color: 'var(--muted)', letterSpacing: 2, marginBottom: 12 }}>HOVER TO PREVIEW</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
                {LORDICON_ICONS.map(icon => (
                  <button key={icon.url} onClick={() => setSelected(icon.url)} style={{
                    padding: '10px 4px',
                    background: selected === icon.url ? 'rgba(0,212,255,0.12)' : 'var(--bg3)',
                    border: `1px solid ${selected === icon.url ? 'rgba(0,212,255,0.5)' : 'var(--border)'}`,
                    cursor: 'pointer', borderRadius: 4,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                    position: 'relative',
                  }}>
                    {/* pointerEvents:none prevents lord-icon shadow DOM from stealing clicks */}
                    <lord-icon src={icon.url} trigger="hover" colors="primary:#00d4ff,secondary:#00ff88" style={{ width: 32, height: 32, pointerEvents: 'none' }} />
                    <span style={{ fontSize: 8, color: '#4a6070', letterSpacing: 1 }}>{icon.label.toUpperCase()}</span>
                  </button>
                ))}
              </div>
              <div style={{ marginTop: 10, fontSize: 9, color: '#2a3a48', lineHeight: 1.8 }}>
                💡 More at <a href="https://lordicon.com" target="_blank" rel="noopener" style={{ color: 'var(--green)' }}>lordicon.com</a> — paste .json URL in Custom URL tab
              </div>
            </div>
          )}

          {/* Custom URL tab */}
          {tab === 'custom' && (
            <div>
              <div style={{ fontSize: 9, color: 'var(--muted)', letterSpacing: 2, marginBottom: 8 }}>IMAGE OR LORDICON URL</div>
              <input
                value={customUrl}
                onChange={e => { setCustomUrl(e.target.value); setSelected(e.target.value) }}
                placeholder="https://... (.png / .svg / .json)"
                style={{
                  width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)',
                  color: 'var(--text)', fontFamily: 'var(--font-mono)',
                  fontSize: 12, padding: '10px 14px', outline: 'none', boxSizing: 'border-box',
                }}
              />
              <div style={{ fontSize: 9, color: '#2a3a48', marginTop: 8 }}>Supports: PNG, SVG, WebP, GIF, Lordicon .json</div>
            </div>
          )}
        </div>

        {/* ── FOOTER: APPLY / CANCEL (pinned bottom, never scrolls) ── */}
        <div style={{ flexShrink: 0, display: 'flex', gap: 8, padding: '16px 24px', borderTop: '1px solid rgba(0,212,255,0.1)' }}>
          <button onClick={() => onSave(selected)} style={{
            flex: 1, padding: 12, background: 'rgba(0,255,136,0.15)',
            border: '1px solid rgba(0,255,136,0.4)', color: 'var(--green)',
            fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, cursor: 'pointer',
          }}>✓ APPLY</button>
          <button onClick={onClose} style={{
            flex: 1, padding: 12, background: 'transparent',
            border: '1px solid var(--border)', color: 'var(--muted)',
            fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, cursor: 'pointer',
          }}>CANCEL</button>
        </div>

      </div>
    </>,
    document.body
  )
}
