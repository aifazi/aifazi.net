'use client'
import { useState, useRef, useEffect } from 'react'
import { T } from '../chat-constants'
import api from '@/lib/api'

export function UserSearchModal({ title, actionLabel, onSelect, onClose }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedUser, setSelectedUser] = useState(null)
  const inputRef = useRef(null)
  const timerRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const search = (q) => {
    setQuery(q)
    setSelectedUser(null)
    if (timerRef.current) clearTimeout(timerRef.current)
    if (!q || q.length < 1) { setResults([]); return }
    setLoading(true)
    timerRef.current = setTimeout(async () => {
      try {
        const r = await api.get(`/chat/users/search?q=${encodeURIComponent(q)}`)
        setResults(r.data || [])
      } catch { setResults([]) }
      finally { setLoading(false) }
    }, 300)
  }

  const handleSelect = () => {
    if (!selectedUser) return
    onSelect(selectedUser)
    onClose()
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && selectedUser) handleSelect()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)' }} onClick={onClose} onKeyDown={handleKeyDown}>
      <div onClick={e => e.stopPropagation()} style={{ width: 380, maxHeight: '80vh', display: 'flex', flexDirection: 'column',
        background: 'rgba(18,21,32,0.98)', border: `1px solid ${T.border}`, borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.7)' }}>
        <div style={{ padding: '14px 16px 10px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: T.mono, fontSize: 10, color: T.muted, letterSpacing: 2 }}>{title || 'SEARCH USERS'}</span>
          <button onClick={onClose} style={{ padding: '2px 7px', border: `1px solid ${T.border}`, borderRadius: 6, background: 'transparent', color: T.muted, cursor: 'pointer', fontSize: 12 }}>âœ•</button>
        </div>
        <div style={{ padding: '10px 16px' }}>
          <input ref={inputRef} value={query} onChange={e => search(e.target.value)} onKeyDown={handleKeyDown}
            placeholder="Search by username or emailâ€¦"
            style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: `1px solid rgba(255,255,255,0.1)`, borderRadius: 8,
              color: T.text, fontFamily: T.display, fontSize: 13, padding: '10px 12px', outline: 'none', boxSizing: 'border-box' }}
            onFocus={e => e.target.style.borderColor = 'color-mix(in srgb, var(--green) 40%, transparent)'}
            onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'} />
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 8px' }}>
          {loading && <div style={{ textAlign: 'center', padding: 20, fontFamily: T.mono, fontSize: 10, color: T.muted }}>Searchingâ€¦</div>}
          {!loading && query && results.length === 0 && (
            <div style={{ textAlign: 'center', padding: 20, fontFamily: T.mono, fontSize: 10, color: T.muted }}>No users found</div>
          )}
          {!loading && !query && (
            <div style={{ textAlign: 'center', padding: 20, fontFamily: T.mono, fontSize: 10, color: T.muted }}>Type to search users</div>
          )}
          {results.map(u => (
            <div key={u.id || u.username} onClick={() => setSelectedUser(u)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                background: selectedUser?.username === u.username ? 'color-mix(in srgb, var(--green) 10%, transparent)' : 'transparent',
                border: selectedUser?.username === u.username ? `1px solid color-mix(in srgb, var(--green) 25%, transparent)` : '1px solid transparent', transition: 'all 0.15s' }}
              onMouseEnter={e => { if (selectedUser?.username !== u.username) e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
              onMouseLeave={e => { e.currentTarget.style.background = selectedUser?.username === u.username ? 'color-mix(in srgb, var(--green) 10%, transparent)' : 'transparent' }}>
              <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0, overflow: 'hidden' }}>
                {u.avatar ? <img src={u.avatar} alt="" style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover' }} /> : (u.username?.[0] || '?').toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: T.text, fontWeight: 500 }}>{u.username}</div>
                {u.email && <div style={{ fontSize: 10, color: T.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</div>}
              </div>
              <span style={{ fontSize: 10, color: T.muted, fontFamily: T.mono, background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: 4, flexShrink: 0 }}>{u.role || 'user'}</span>
            </div>
          ))}
        </div>
        <div style={{ padding: '10px 16px 14px', borderTop: `1px solid ${T.border}`, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{ padding: '7px 16px', border: `1px solid ${T.border}`, borderRadius: 8, background: 'transparent', color: T.muted, fontFamily: T.mono, fontSize: 10, cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={handleSelect} disabled={!selectedUser}
            style={{ padding: '7px 16px', border: 'none', borderRadius: 8,
              background: selectedUser ? 'linear-gradient(135deg,color-mix(in srgb, var(--green) 85%, transparent),color-mix(in srgb, var(--cyan) 85%, transparent))' : 'rgba(255,255,255,0.06)',
              color: selectedUser ? '#000' : T.muted, fontFamily: T.mono, fontSize: 10, fontWeight: 700, cursor: selectedUser ? 'pointer' : 'default', transition: 'all 0.2s' }}>
            {actionLabel || 'Select'}
          </button>
        </div>
      </div>
    </div>
  )
}
