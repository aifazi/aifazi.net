'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { Link, useNavigate } from '@/lib/router-compat'
import api, { getAuthToken, getRole, getUsername, clearAuthTokens, setEffectiveAccess, hasStaffAccess } from '@/lib/api'
import { notify } from '../core/notify.jsx'
import { UserAvatar } from '@/lib/avatar'
import { Checkbox, Select } from '../core/ui.jsx'
import {
  S, StatCard, useNotify, ConfirmModal, UserEditModal, ThreadEditModal, ReplyEditModal, BanModal, Pagination,
} from './forumAdminModals'

export default function ForumAdmin({ embedded = false }) {
  const navigate = useNavigate()
  const { notify, Toast } = useNotify()

  const [tab, setTab]       = useState('overview')
  const [stats, setStats]   = useState(null)
  const [cats, setCats]     = useState([])
  const [users, setUsers]   = useState([])
  const [threads, setThreads] = useState([])
  const [replies, setReplies] = useState([])
  const [loading, setLoading] = useState(false)
  const [authed,   setAuthed]   = useState(embedded)
  const [checking, setChecking] = useState(!embedded)

  const [userSearch,   setUserSearch]   = useState('')
  const [threadSearch, setThreadSearch] = useState('')
  const [replySearch,  setReplySearch]  = useState('')
  const [userPage,     setUserPage]     = useState(1)
  const [threadPage,   setThreadPage]   = useState(1)
  const [replyPage,    setReplyPage]    = useState(1)
  const [userTotal,    setUserTotal]    = useState(0)
  const [threadTotal,  setThreadTotal]  = useState(0)
  const [replyTotal,   setReplyTotal]   = useState(0)
  const PAGE = 20

  const [editingUser,   setEditingUser]   = useState(null)
  const [editingThread, setEditingThread] = useState(null)
  const [editingReply,  setEditingReply]  = useState(null)
  const [banningUser,   setBanningUser]   = useState(null)
  const [confirmDel,    setConfirmDel]    = useState(null)

  const [catForm,    setCatForm]    = useState({ name: '', description: '', icon: '💬', color: 'var(--cyan)', order: 0, view_roles: [], post_roles: [], reply_roles: [], attach_roles: [], mod_roles: ['moderator', 'admin'] })
  const ROLE_OPTIONS = ['member', 'moderator', 'admin', 'staff']
  const [editingCat, setEditingCat] = useState(null)
  const [catSaving,  setCatSaving]  = useState(false)
  const [catPermsTab, setCatPermsTab] = useState('roles')

  const loadStats   = () => api.get('/forum/admin/stats').then(r => setStats(r.data)).catch(() => {})
  const loadCats    = () => api.get('/forum/categories').then(r => setCats(r.data)).catch(() => {})
  const categoryPayload = () => ({
    name: catForm.name.trim(),
    description: catForm.description || '',
    icon: catForm.icon || '💬',
    color: catForm.color || 'var(--cyan)',
    display_order: Number(catForm.order) || 0,
    view_roles: catForm.view_roles || [],
    post_roles: catForm.post_roles || [],
    reply_roles: catForm.reply_roles || [],
    attach_roles: catForm.attach_roles || [],
    mod_roles: catForm.mod_roles || ['moderator', 'admin'],
  })
  const apiError = err => {
    const detail = err?.response?.data?.detail || err?.response?.data?.error || err?.message
    return typeof detail === 'string' ? detail : 'Error'
  }

  const normalizeUser = u => u ? { ...u, _id: u._id || u.id, createdAt: u.createdAt || u.created_at, lastSeen: u.lastSeen || u.last_seen, banReason: u.banReason || u.ban_reason, threadCount: u.threadCount ?? u.thread_count ?? 0, replyCount: u.replyCount ?? u.reply_count ?? 0 } : u
  const normalizeThread = t => t ? { ...t, _id: t._id || t.id, createdAt: t.createdAt || t.created_at, replyCount: t.replyCount ?? t.reply_count ?? 0, author: t.author || (t.author_id ? { username: t.author_name || 'Unknown' } : undefined), category: t.category || (t.category_id ? { _id: t.category_id, name: t.category_name || 'Unknown' } : undefined) } : t
  const normalizeReply = r => r ? { ...r, _id: r._id || r.id, createdAt: r.createdAt || r.created_at } : r

  const loadUsers = () => {
    setLoading(true)
    api.get(`/forum/users?search=${userSearch}&page=${userPage}&limit=${PAGE}`)
      .then(r => { const d = r.data; const arr = Array.isArray(d) ? d : d?.users || []; setUsers(arr.map(normalizeUser)); setUserTotal(arr.length) })
      .finally(() => setLoading(false))
  }

  const loadThreads = () => {
    setLoading(true)
    api.get(`/forum/threads?search=${threadSearch}&page=${threadPage}&limit=${PAGE}`)
      .then(r => { const d = r.data; const arr = Array.isArray(d) ? d : d?.threads || []; setThreads(arr.map(normalizeThread)); setThreadTotal(arr.length) })
      .finally(() => setLoading(false))
  }

  const loadReplies = () => {
    setLoading(true)
    api.get(`/forum/replies?search=${replySearch}&page=${replyPage}&limit=${PAGE}`)
      .then(r => { const d = r.data; setReplies((Array.isArray(d) ? d : d?.replies || []).map(normalizeReply)); setReplyTotal(Array.isArray(d) ? d.length : d?.total || 0) })
      .catch(() => { setReplies([]); setReplyTotal(0) })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    const token = getAuthToken()
    if (embedded) { loadStats(); loadCats(); return }
    if (!token) { navigate('/admin'); return }
    const verify = async () => {
      try {
        const verified = await api.get('/auth/verify')
        setEffectiveAccess(verified.data?.user)
        const role = verified.data?.user?.role || getRole()
        if ((role === 'user' || !role) && !hasStaffAccess()) { navigate('/admin'); setChecking(false); return }
        setAuthed(true)
        setChecking(false)
        loadStats()
        loadCats()
      } catch {
        clearAuthTokens()
        // Full reload so no authenticated UI flashes; stored theme is
        // re-applied before first paint.
        window.location.replace('/login?next=/forum/admin')
        setChecking(false)
      }
    }
    verify()
  }, [])

  useEffect(() => {
    if (tab === 'users')   void (async () => { await loadUsers() })()
    if (tab === 'threads') void (async () => { await loadThreads() })()
    if (tab === 'replies') void (async () => { await loadReplies() })()
  }, [tab, userSearch, threadSearch, replySearch, userPage, threadPage, replyPage])

  // ── Category actions ──
  const saveCategory = async () => {
    if (!catForm.name.trim()) return
    setCatSaving(true)
    try {
      const payload = categoryPayload()
      if (editingCat) {
        await api.put(`/forum/categories/${editingCat}`, payload)
      } else {
        await api.post('/forum/categories', payload)
      }
      await loadCats(); loadStats()
      setCatForm({ name: '', description: '', icon: '💬', color: 'var(--cyan)', order: 0, view_roles: [], post_roles: [], reply_roles: [], attach_roles: [], mod_roles: ['moderator', 'admin'] })
      setEditingCat(null)
      notify(editingCat ? 'Category updated' : 'Category created')
    } catch (err) { notify(apiError(err), false) }
    finally { setCatSaving(false) }
  }

  const deleteCat = (id) => setConfirmDel({
    message: 'Delete this category? Threads inside will remain but lose their category.',
    danger: true,
    onOk: async () => {
      await api.delete(`/forum/categories/${id}`)
      loadCats(); loadStats()
      setConfirmDel(null)
      notify('Category deleted')
    }
  })

  // ── User actions ──
  const toggleUserBan = (u) => {
    if (!u.banned) {
      setBanningUser(u)
    } else {
      api.put(`/forum/admin/users/${u._id}`, { banned: false, banReason: '' })
        .then(() => { loadUsers(); notify(`${u.username} unbanned`) })
        .catch(() => notify('Failed', false))
    }
  }

  const changeRole = (u, role) => {
    api.put(`/forum/admin/users/${u._id}`, { role })
      .then(() => { loadUsers(); notify('Role updated') })
      .catch(() => notify('Failed', false))
  }

  const deleteUser = (u) => setConfirmDel({
    message: `Permanently delete ${u.username} and all their posts? This cannot be undone.`,
    danger: true,
    onOk: async () => {
      await api.delete(`/forum/admin/users/${u._id}`)
      loadUsers(); loadStats()
      setConfirmDel(null)
      notify('User deleted')
    }
  })

  // ── Thread actions ──
  const deleteThread = (t) => setConfirmDel({
    message: `Delete thread "${t.title}"? This cannot be undone.`,
    danger: true,
    onOk: async () => {
      await api.delete(`/forum/threads/${t._id}`)
      loadThreads(); loadStats()
      setConfirmDel(null)
      notify('Thread deleted')
    }
  })

  const toggleThread = (t, field) => {
    api.put(`/forum/threads/${t._id}`, { [field]: !t[field] })
      .then(() => { loadThreads(); notify('Updated') })
      .catch(() => notify('Failed', false))
  }

  // ── Reply actions ──
  const deleteReply = (r) => setConfirmDel({
    message: 'Delete this reply? This cannot be undone.',
    danger: true,
    onOk: async () => {
      await api.delete(`/forum/replies/${r._id}`)
      loadReplies(); loadStats()
      setConfirmDel(null)
      notify('Reply deleted')
    }
  })

  const tabs = [
    { key: 'overview',   label: '📊 Overview' },
    { key: 'categories', label: '📁 Categories' },
    { key: 'users',      label: `👥 Users${tab === 'users' ? ` (${userTotal})` : ''}` },
    { key: 'threads',    label: `🗨 Threads${tab === 'threads' ? ` (${threadTotal})` : ''}` },
    { key: 'replies',    label: `💬 Replies${tab === 'replies' ? ` (${replyTotal})` : ''}` },
  ]

  if (checking) return <div className="page-container"><div className="loader" /></div>
  if (!authed) return null

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: embedded ? '24px 24px 80px' : '100px 24px 80px', position: 'relative', zIndex: 1 }}>
      {Toast}

      {/* Modals */}
      {editingUser && (
        <UserEditModal
          userId={editingUser}
          onClose={() => setEditingUser(null)}
          onSaved={(deleted) => {
            setEditingUser(null)
            loadUsers(); loadStats()
            notify(deleted ? 'User deleted' : 'User saved')
          }}
        />
      )}
      {editingThread && (
        <ThreadEditModal
          thread={editingThread}
          cats={cats}
          onClose={() => setEditingThread(null)}
          onSaved={() => { setEditingThread(null); loadThreads(); notify('Thread saved') }}
        />
      )}
      {editingReply && (
        <ReplyEditModal
          reply={editingReply}
          onClose={() => setEditingReply(null)}
          onSaved={() => { setEditingReply(null); loadReplies(); notify('Reply saved') }}
        />
      )}
      {banningUser && (
        <BanModal
          user={banningUser}
          onClose={() => setBanningUser(null)}
          onSaved={() => { setBanningUser(null); loadUsers(); notify('User banned') }}
        />
      )}
      {confirmDel && (
        <ConfirmModal
          message={confirmDel.message}
          danger={confirmDel.danger}
          onOk={confirmDel.onOk}
          onCancel={() => setConfirmDel(null)}
        />
      )}

      {/* Page header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--green)', letterSpacing: 3, marginBottom: 6 }}>ADMIN PANEL</div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 700 }}>Forum Management</h1>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link to="/admin" style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', textDecoration: 'none', letterSpacing: 2, border: '1px solid var(--border)', padding: '8px 16px', borderRadius: 10 }}>← SITE ADMIN</Link>
          <Link to="/forum" style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', textDecoration: 'none', letterSpacing: 2, border: '1px solid var(--border)', padding: '8px 16px', borderRadius: 10 }}>VIEW FORUM →</Link>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 32, flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1, padding: '10px 18px', background: tab === t.key ? 'color-mix(in srgb, var(--green) 10%, transparent)' : 'var(--bg2)', border: `1px solid ${tab === t.key ? 'color-mix(in srgb, var(--green) 40%, transparent)' : 'var(--border)'}`, color: tab === t.key ? 'var(--green)' : 'var(--muted)', cursor: 'pointer', borderRadius: 999 }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ── */}
      {tab === 'overview' && stats && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 12, marginBottom: 40 }}>
            <StatCard label="TOTAL USERS"  value={stats.users}      color="var(--green)" />
            <StatCard label="THREADS"      value={stats.threads}    color="var(--cyan)" />
            <StatCard label="REPLIES"      value={stats.replies}    color="var(--orange)" />
            <StatCard label="CATEGORIES"   value={stats.categories} color="var(--muted)" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', letterSpacing: 2, marginBottom: 12 }}>RECENT USERS</div>
              {stats.recentUsers.map(u => (
                <div key={u._id} style={S.card}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <UserAvatar avatar={u.avatar} name={u.username} size={32} imgStyle={{ border: '1px solid var(--border)' }}
                        fallback={`https://api.dicebear.com/7.x/initials/svg?seed=${u.username}`} />
                      <div>
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600 }}>{u.username}</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{u.email} · {timeAgo(u.createdAt)}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, padding: '3px 8px', border: '1px solid var(--border)', color: u.banned ? 'var(--red)' : 'var(--muted)' }}>
                        {u.banned ? 'BANNED' : u.role.toUpperCase()}
                      </span>
                      <button onClick={() => setEditingUser(u._id)}
                        style={{ ...S.btn('transparent', 'var(--cyan)'), border: '1px solid color-mix(in srgb, var(--cyan) 30%, transparent)', fontSize: 11, padding: '3px 8px' }}>
                        EDIT
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', letterSpacing: 2, marginBottom: 12 }}>RECENT THREADS</div>
              {stats.recentThreads.map(t => (
                <div key={t._id} style={S.card}>
                  <Link to={`/forum/thread/${t._id}`} style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600, color: 'var(--text)', textDecoration: 'none', display: 'block', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</Link>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>by {t.author?.username} in {t.category?.name} · {timeAgo(t.createdAt)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── CATEGORIES ── */}
      {tab === 'categories' && (
        <div>
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', padding: 24, marginBottom: 24 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--green)', letterSpacing: 2, marginBottom: 20 }}>
              {editingCat ? '✏️ EDIT CATEGORY' : '+ NEW CATEGORY'}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label style={S.label}>NAME *</label>
                <input value={catForm.name} onChange={e => setCatForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. General Discussion" maxLength={100} style={S.input} />
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', textAlign: 'right', marginTop: 4 }}>{catForm.name.length}/100</div>
              </div>
              <div>
                <label style={S.label}>ICON (emoji)</label>
                <input value={catForm.icon} onChange={e => setCatForm(f => ({ ...f, icon: e.target.value }))} placeholder="💬" style={{ ...S.input, width: 80 }} />
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={S.label}>DESCRIPTION</label>
                <input value={catForm.description} onChange={e => setCatForm(f => ({ ...f, description: e.target.value }))} placeholder="What this category is about..." maxLength={500} style={S.input} />
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', textAlign: 'right', marginTop: 4 }}>{catForm.description.length}/500</div>
              </div>
              <div>
                <label style={S.label}>ACCENT COLOR</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {['var(--cyan)', 'var(--green)', 'var(--orange)', 'var(--red)', '#a78bfa', '#f472b6'].map(c => (
                    <button key={c} onClick={() => setCatForm(f => ({ ...f, color: c }))}
                      style={{ width: 28, height: 28, background: c, border: catForm.color === c ? '2px solid white' : '2px solid transparent', cursor: 'pointer', borderRadius: 2 }} />
                  ))}
                </div>
              </div>
              <div>
                <label style={S.label}>ORDER (lower = first)</label>
                <input type="number" value={catForm.order} onChange={e => setCatForm(f => ({ ...f, order: Number(e.target.value) }))} style={{ ...S.input, width: 80 }} />
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={S.label}>PERMISSIONS MATRIX</label>
                <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', padding: 16 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '120px repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', letterSpacing: 1 }}>ACTION</div>
                    {ROLE_OPTIONS.map(r => (
                      <div key={r} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', letterSpacing: 1, textAlign: 'center' }}>{r.toUpperCase()}</div>
                    ))}
                  </div>
                  {[
                    { key: 'view_roles', label: 'View' },
                    { key: 'post_roles', label: 'Post Threads' },
                    { key: 'reply_roles', label: 'Reply' },
                    { key: 'attach_roles', label: 'Attachments' },
                    { key: 'mod_roles', label: 'Moderate' },
                  ].map(perm => (
                    <div key={perm.key} style={{ display: 'grid', gridTemplateColumns: '120px repeat(4, 1fr)', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text)' }}>{perm.label}</div>
                      {ROLE_OPTIONS.map(r => (
                        <label key={r} style={{ display: 'flex', justifyContent: 'center' }}>
                          <input
                            type="checkbox"
                            checked={(catForm[perm.key] || []).includes(r)}
                            onChange={e => {
                              const arr = catForm[perm.key] || []
                              setCatForm(f => ({
                                ...f,
                                [perm.key]: e.target.checked ? [...arr, r] : arr.filter(p => p !== r)
                              }))
                            }}
                            style={{ accentColor: 'var(--cyan)' }}
                          />
                        </label>
                      ))}
                    </div>
                  ))}
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>
                    Empty = all users allowed. Check roles to restrict.
                  </div>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button onClick={saveCategory} disabled={catSaving} style={S.btn()}>
                {catSaving ? 'SAVING...' : editingCat ? 'SAVE CHANGES' : 'CREATE CATEGORY'}
              </button>
              {editingCat && (
                <button onClick={() => { setEditingCat(null); setCatForm({ name: '', description: '', icon: '💬', color: 'var(--cyan)', order: 0, view_roles: [], post_roles: [], reply_roles: [], attach_roles: [], mod_roles: ['moderator', 'admin'] }) }}
                  style={{ ...S.btn('transparent', 'var(--muted)'), border: '1px solid var(--border)' }}>CANCEL</button>
              )}
            </div>
          </div>

          {cats.map(cat => (
            <div key={cat._id} style={S.card}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 24 }}>{cat.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 600, color: cat.color || 'var(--text)' }}>{cat.name}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                    {cat.description} · {cat.threadCount} threads · order {cat.order}
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', marginTop: 4, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    {cat.view_roles?.length > 0 && <span>View: {cat.view_roles.join(', ')}</span>}
                    {cat.post_roles?.length > 0 && <span>Post: {cat.post_roles.join(', ')}</span>}
                    {cat.reply_roles?.length > 0 && <span>Reply: {cat.reply_roles.join(', ')}</span>}
                    {cat.attach_roles?.length > 0 && <span>Attach: {cat.attach_roles.join(', ')}</span>}
                    {cat.mod_roles?.length > 0 && <span>Mod: {cat.mod_roles.join(', ')}</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => { setCatForm({ name: cat.name, description: cat.description, icon: cat.icon, color: cat.color, order: cat.order, view_roles: cat.view_roles || [], post_roles: cat.post_roles || [], reply_roles: cat.reply_roles || [], attach_roles: cat.attach_roles || [], mod_roles: cat.mod_roles || ['moderator', 'admin'] }); setEditingCat(cat._id); window.scrollTo(0, 0) }}
                    style={{ ...S.btn('transparent', 'var(--cyan)'), border: '1px solid color-mix(in srgb, var(--cyan) 30%, transparent)' }}>EDIT</button>
                  <button onClick={() => api.put(`/forum/categories/${cat._id}`, { locked: !cat.locked }).then(() => { loadCats(); notify(cat.locked ? 'Category unlocked' : 'Category locked') })}
                    style={{ ...S.btn('transparent', cat.locked ? 'var(--red)' : 'var(--muted)'), border: `1px solid ${cat.locked ? 'rgba(255,71,87,0.3)' : 'var(--border)'}` }}>
                    {cat.locked ? '🔓 UNLOCK' : '🔒 LOCK'}
                  </button>
                  <button onClick={() => deleteCat(cat._id)} style={{ ...S.btn('transparent', 'var(--red)'), border: '1px solid rgba(255,71,87,0.3)' }}>DEL</button>
                </div>
              </div>
            </div>
          ))}
          {cats.length === 0 && <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>No categories yet. Create one above.</div>}
        </div>
      )}

      {/* ── USERS ── */}
      {tab === 'users' && (
        <div>
          <input value={userSearch} onChange={e => { setUserSearch(e.target.value); setUserPage(1) }}
            placeholder="🔍 Search by username or email..." style={{ ...S.input, marginBottom: 16 }} />

          {loading
            ? <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>Loading...</div>
            : users.map(u => (
              <div key={u._id} style={{ ...S.card, borderColor: u.banned ? 'rgba(255,71,87,0.2)' : 'var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                  <UserAvatar
                    avatar={u.avatar} name={u.username} size={44}
                    onClick={() => setEditingUser(u._id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setEditingUser(u._id) } }}
                    imgStyle={{ border: `2px solid ${u.banned ? 'var(--red)' : 'var(--border)'}`, cursor: 'pointer' }}
                    fallback={`https://api.dicebear.com/7.x/initials/svg?seed=${u.username}`}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600, color: u.banned ? 'var(--red)' : 'var(--text)' }}>{u.username}</span>
                      {u.banned && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--red)', border: '1px solid rgba(255,71,87,0.4)', padding: '2px 6px' }}>BANNED</span>}
                      {u.role === 'moderator' && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--cyan)', border: '1px solid color-mix(in srgb, var(--cyan) 40%, transparent)', padding: '2px 6px' }}>MOD</span>}
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                      {u.email} · {u.threadCount}T {u.replyCount}R · joined {timeAgo(u.createdAt)} · last seen {timeAgo(u.lastSeen)}
                    </div>
                    {u.banReason && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--red)', marginTop: 2 }}>Ban reason: {u.banReason}</div>}
                    {u.bio && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4, fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.bio}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <button onClick={() => setEditingUser(u._id)}
                      style={{ ...S.btn('color-mix(in srgb, var(--green) 10%, transparent)', 'var(--green)'), border: '1px solid color-mix(in srgb, var(--green) 30%, transparent)', fontSize: 11 }}>
                      ✏️ EDIT PROFILE
                    </button>
                    <div style={{ width: 150 }}>
                      <Select value={u.role} onChange={v => changeRole(u, v)}
                        options={[['user', 'USER'], ['moderator', 'MODERATOR']]}
                        style={{ fontSize: 11 }} />
                    </div>
                    <button onClick={() => toggleUserBan(u)}
                      style={{ ...S.btn('transparent', u.banned ? 'var(--green)' : 'var(--orange)'), border: `1px solid ${u.banned ? 'color-mix(in srgb, var(--green) 30%, transparent)' : 'rgba(255,107,53,0.3)'}`, fontSize: 11 }}>
                      {u.banned ? '✅ UNBAN' : '🚫 BAN'}
                    </button>
                    <button onClick={() => deleteUser(u)}
                      style={{ ...S.btn('transparent', 'var(--red)'), border: '1px solid rgba(255,71,87,0.3)', fontSize: 11 }}>
                      🗑 DEL
                    </button>
                  </div>
                </div>
              </div>
            ))
          }
          {!loading && users.length === 0 && <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>No users found.</div>}
          <Pagination page={userPage} total={userTotal} pageSize={PAGE} onPage={setUserPage} />
        </div>
      )}

      {/* ── THREADS ── */}
      {tab === 'threads' && (
        <div>
          <input value={threadSearch} onChange={e => { setThreadSearch(e.target.value); setThreadPage(1) }}
            placeholder="🔍 Search threads by title or content..." style={{ ...S.input, marginBottom: 16 }} />

          {loading
            ? <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>Loading...</div>
            : threads.map(t => (
              <div key={t._id} style={{ ...S.card, borderColor: t.locked ? 'rgba(255,71,87,0.15)' : t.pinned ? 'color-mix(in srgb, var(--green) 15%, transparent)' : 'var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Link to={`/forum/thread/${t._id}`} style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600, color: 'var(--text)', textDecoration: 'none', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.pinned && '📌 '}{t.locked && '🔒 '}{t.title}
                    </Link>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', marginTop: 4, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <span>by {t.author?.username}</span>
                      <span>{t.category?.icon} {t.category?.name}</span>
                      <span>{t.replyCount} replies</span>
                      <span>{t.views} views</span>
                      <span>{timeAgo(t.createdAt)}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button onClick={() => setEditingThread(t)}
                      style={{ ...S.btn('color-mix(in srgb, var(--green) 10%, transparent)', 'var(--green)'), border: '1px solid color-mix(in srgb, var(--green) 30%, transparent)', fontSize: 11 }}>
                      ✏️ EDIT
                    </button>
                    <button onClick={() => toggleThread(t, 'pinned')}
                      style={{ ...S.btn('transparent', t.pinned ? 'var(--green)' : 'var(--muted)'), border: `1px solid ${t.pinned ? 'color-mix(in srgb, var(--green) 30%, transparent)' : 'var(--border)'}`, fontSize: 11 }}>
                      {t.pinned ? 'UNPIN' : '📌'}
                    </button>
                    <button onClick={() => toggleThread(t, 'locked')}
                      style={{ ...S.btn('transparent', t.locked ? 'var(--red)' : 'var(--muted)'), border: `1px solid ${t.locked ? 'rgba(255,71,87,0.3)' : 'var(--border)'}`, fontSize: 11 }}>
                      {t.locked ? '🔓' : '🔒'}
                    </button>
                    <button onClick={() => deleteThread(t)}
                      style={{ ...S.btn('transparent', 'var(--red)'), border: '1px solid rgba(255,71,87,0.3)', fontSize: 11 }}>
                      🗑
                    </button>
                  </div>
                </div>
              </div>
            ))
          }
          {!loading && threads.length === 0 && <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>No threads found.</div>}
          <Pagination page={threadPage} total={threadTotal} pageSize={PAGE} onPage={setThreadPage} />
        </div>
      )}

      {/* ── REPLIES ── */}
      {tab === 'replies' && (
        <div>
          <input value={replySearch} onChange={e => { setReplySearch(e.target.value); setReplyPage(1) }}
            placeholder="🔍 Search reply content..." style={{ ...S.input, marginBottom: 16 }} />

          {loading
            ? <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>Loading...</div>
            : replies.map(r => (
              <div key={r._id} style={{ ...S.card, borderColor: r.author?.banned ? 'rgba(255,71,87,0.15)' : 'var(--border)' }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <UserAvatar avatar={r.author?.avatar} name={r.author?.username} size={36} imgStyle={{ border: '1px solid var(--border)' }}
                    fallback={`https://api.dicebear.com/7.x/initials/svg?seed=${r.author?.username}`} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4, gap: 8, flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600 }}>{r.author?.username}</span>
                        {r.author?.banned && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--red)', border: '1px solid rgba(255,71,87,0.4)', padding: '1px 5px' }}>BANNED</span>}
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>{timeAgo(r.createdAt)}</span>
                        {r.edited && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--orange)' }}>EDITED</span>}
                      </div>
                      <Link to={`/forum/thread/${r.thread?._id}`} target="_blank"
                        style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--cyan)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>
                        → {r.thread?.title}
                      </Link>
                    </div>
                    <div style={{ color: 'var(--text)', fontSize: 13, lineHeight: 1.6, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
                      {r.content}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
                    <button onClick={() => setEditingReply(r)}
                      style={{ ...S.btn('color-mix(in srgb, var(--green) 10%, transparent)', 'var(--green)'), border: '1px solid color-mix(in srgb, var(--green) 30%, transparent)', fontSize: 11 }}>
                      ✏️ EDIT
                    </button>
                    <button onClick={() => r.author?._id && setEditingUser(r.author._id)}
                      style={{ ...S.btn('transparent', 'var(--cyan)'), border: '1px solid color-mix(in srgb, var(--cyan) 30%, transparent)', fontSize: 11 }}>
                      👤 USER
                    </button>
                    <button onClick={() => deleteReply(r)}
                      style={{ ...S.btn('transparent', 'var(--red)'), border: '1px solid rgba(255,71,87,0.3)', fontSize: 11 }}>
                      🗑 DEL
                    </button>
                  </div>
                </div>
              </div>
            ))
          }
          {!loading && replies.length === 0 && <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>No replies found.</div>}
          <Pagination page={replyPage} total={replyTotal} pageSize={PAGE} onPage={setReplyPage} />
        </div>
      )}
    </div>
  )
}
