'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from '@/lib/router-compat'
import api from '@/lib/api'

const COMMANDS = [
  // Navigation
  { id: 'home',           label: 'Go to Home',           icon: '🏠', group: 'Navigate',  action: { type: 'route', to: '/' } },
  { id: 'blog',           label: 'Go to Blog',           icon: '📝', group: 'Navigate',  action: { type: 'route', to: '/blog' } },
  { id: 'forum',          label: 'Go to Forum',          icon: '💬', group: 'Navigate',  action: { type: 'route', to: '/forum' } },
  { id: 'contact-page',   label: 'Go to Contact',        icon: '📬', group: 'Navigate',  action: { type: 'route', to: '/contact' } },
  { id: 'admin',          label: 'Admin Panel',          icon: '⚙️',  group: 'Navigate',  action: { type: 'route', to: '/admin' } },
  { id: 'network-tools',  label: 'Network Tools',        icon: '🛠️',  group: 'Navigate',  action: { type: 'route', to: '/tools/network' } },
  { id: 'file-tools',     label: 'File Tools',           icon: '📁',  group: 'Navigate',  action: { type: 'route', to: '/tools/files' } },
  { id: 'seo-tools',      label: 'SEO Tools',            icon: '🔍',  group: 'Navigate',  action: { type: 'route', to: '/tools/seo' } },
  // Scroll
  { id: 'about',          label: 'Jump to About',        icon: '👤', group: 'Section',   action: { type: 'scroll', id: 'about' } },
  { id: 'experience',     label: 'Jump to Experience',   icon: '💼', group: 'Section',   action: { type: 'scroll', id: 'experience' } },
  { id: 'skills',         label: 'Jump to Skills',       icon: '⚡', group: 'Section',   action: { type: 'scroll', id: 'skills' } },
  { id: 'services',       label: 'Jump to Services',     icon: '🔧', group: 'Section',   action: { type: 'scroll', id: 'services' } },
  { id: 'projects',       label: 'Jump to Projects',     icon: '🚀', group: 'Section',   action: { type: 'scroll', id: 'projects' } },

  { id: 'contact-sec',    label: 'Jump to Contact',      icon: '📬', group: 'Section',   action: { type: 'scroll', id: 'contact' } },
  // Actions
  { id: 'theme',          label: 'Toggle Dark/Light',    icon: '🌓', group: 'Action',    action: { type: 'theme' } },
  { id: 'terminal',       label: 'Open Terminal Mode',   icon: '>_', group: 'Action',    action: { type: 'terminal' } },
  { id: 'top',            label: 'Scroll to Top',        icon: '⬆️', group: 'Action',    action: { type: 'top' } },
]

export default function CommandPalette({ onToggleTheme, onOpenTerminal }) {
  const [open, setOpen]         = useState(false)
  const [query, setQuery]       = useState('')
  const [selected, setSelected] = useState(0)
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const inputRef  = useRef(null)
  const navigate  = useNavigate()
  const searchRef = useRef(null)

  // Debounced search
  useEffect(() => {
    if (!query.trim() || query.length < 2) { setSearchResults([]); return }
    clearTimeout(searchRef.current)
    searchRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await api.get('/search', { params: { q: query, limit: 5 } })
        const results = [
          ...res.data.posts.map(r => ({ ...r, group: '🔍 Blog Posts' })),
          ...res.data.threads.map(r => ({ ...r, group: '🔍 Forum Threads' })),
        ]
        setSearchResults(results)
      } catch { setSearchResults([]) }
      finally { setSearching(false) }
    }, 300)
    return () => clearTimeout(searchRef.current)
  }, [query])

  const filtered = query.trim()
    ? COMMANDS.filter(c =>
        c.label.toLowerCase().includes(query.toLowerCase()) ||
        c.group.toLowerCase().includes(query.toLowerCase())
      )
    : COMMANDS

  // Group filtered results — merge search results when available
  const searchItems = searchResults.map(r => ({
    id: `search-${r.id}`, label: r.title, icon: r.type === 'post' ? '📝' : '💬',
    group: r.group, subtitle: r.meta,
    action: { type: 'route', to: r.url },
  }))

  const allItems = query.trim() ? [...searchItems, ...filtered] : filtered

  const grouped = allItems.reduce((acc, cmd) => {
    if (!acc[cmd.group]) acc[cmd.group] = []
    acc[cmd.group].push(cmd)
    return acc
  }, {})

  const flat = Object.values(grouped).flat()
  const execute = useCallback((cmd) => {
    setOpen(false); setQuery('')
    const { type, to, id } = cmd.action
    if (type === 'route')    { navigate(to) }
    if (type === 'scroll')   {
      if (window.location.pathname !== '/') {
        navigate('/', { state: { scrollTo: id } })
      } else {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }
    if (type === 'theme')    { onToggleTheme?.() }
    if (type === 'terminal') { onOpenTerminal?.() }
    if (type === 'top')      { window.scrollTo({ top: 0, behavior: 'smooth' }) }
  }, [navigate, onToggleTheme, onOpenTerminal])

  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault(); setOpen(o => !o); setQuery(''); setSelected(0)
      }
      if (e.key === 'Escape') { setOpen(false); setQuery('') }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
  }, [open])

  useEffect(() => { setSelected(0) }, [query])

  const handleKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, flat.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)) }
    if (e.key === 'Enter')     { if (flat[selected]) execute(flat[selected]) }
  }

  if (!open) return (
    <button
      onClick={() => { setOpen(true); setQuery(''); setSelected(0) }}
      title="Command Palette (Ctrl+K)"
      style={{
        fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 2,
        padding: '5px 10px', background: 'var(--bg3)',
        border: '1px solid var(--border)', color: 'var(--muted)',
        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
        transition: 'all 0.2s',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--green) 30%, transparent)'; e.currentTarget.style.color = 'var(--green)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted)' }}
    >
      <span style={{ fontSize: 11 }}>⌘</span> K
    </button>
  )

  let globalIdx = 0

  return (
    <div
      onClick={() => { setOpen(false); setQuery('') }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '15vh', animation: 'fadeIn 0.15s ease',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 560, background: 'var(--bg2)',
          border: '1px solid color-mix(in srgb, var(--green) 30%, transparent)',
          boxShadow: '0 0 40px color-mix(in srgb, var(--green) 10%, transparent), 0 30px 80px rgba(0,0,0,0.8)',
          overflow: 'hidden', animation: 'slideDown 0.2s cubic-bezier(0.16,1,0.3,1)',
        }}
      >
        {/* Input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ color: 'var(--green)', fontSize: 16 }}>⌘</span>
          <input
            className="command-palette-input"
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Type a command or search..."
            style={{
              flex: 1,
              color: 'var(--text)', fontFamily: 'var(--font-display)', fontSize: 16,
            }}
          />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', letterSpacing: 1 }}>ESC</span>
        </div>

        {/* Results */}
        <div style={{ maxHeight: 380, overflowY: 'auto', padding: '8px 0' }}>
          {Object.entries(grouped).map(([group, cmds]) => (
            <div key={group}>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 3,
                color: 'var(--muted)', padding: '8px 18px 4px', textTransform: 'uppercase',
              }}>{group}</div>
              {cmds.map(cmd => {
                const idx = globalIdx++
                const isSelected = selected === idx
                return (
                  <div
                    key={cmd.id}
                    onClick={() => execute(cmd)}
                    onMouseEnter={() => setSelected(idx)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '10px 18px', cursor: 'pointer',
                      background: isSelected ? 'color-mix(in srgb, var(--green) 7%, transparent)' : 'transparent',
                      borderLeft: isSelected ? '2px solid var(--green)' : '2px solid transparent',
                      transition: 'all 0.1s',
                    }}
                  >
                    <span style={{ fontSize: 14, width: 20, textAlign: 'center', flexShrink: 0 }}>{cmd.icon}</span>
                    <span style={{ fontSize: 14, color: isSelected ? 'var(--text)' : 'var(--text2)' }}>{cmd.label}</span>
                    {isSelected && (
                      <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--green)', letterSpacing: 1 }}>ENTER ↵</span>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
          {flat.length === 0 && (
            <div style={{ padding: '32px 18px', textAlign: 'center', color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
              No results for "{query}"
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '8px 18px', borderTop: '1px solid var(--border)', display: 'flex', gap: 16 }}>
          {[['↑↓', 'Navigate'], ['↵', 'Select'], ['ESC', 'Close']].map(([key, label]) => (
            <span key={key} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <kbd style={{ fontFamily: 'var(--font-mono)', fontSize: 9, padding: '2px 6px', background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--muted)' }}>{key}</kbd>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)' }}>{label}</span>
            </span>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes slideDown { from { opacity:0; transform:translateY(-12px) } to { opacity:1; transform:translateY(0) } }
        @keyframes fadeIn    { from { opacity:0 } to { opacity:1 } }
      `}</style>
    </div>
  )
}
