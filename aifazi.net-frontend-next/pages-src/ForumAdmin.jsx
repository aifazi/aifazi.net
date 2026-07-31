'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { Link, useNavigate } from '@/lib/router-compat'
import api, { getAuthToken } from '@/lib/api'
import { notify } from '../core/notify.jsx'
import { Checkbox, Select } from '../core/ui.jsx'

// ─── Shared styles ────────────────────────────────────────────────────────────
const S = {
  input: {
    width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)',
    color: 'var(--text)', fontFamily: 'var(--font-display)', fontSize: 14,
    padding: '10px 14px', outline: 'none',
  },
  label: {
    fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 2,
    color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 6,
  },
  btn: (bg = 'var(--green)', color = '#000') => ({
    fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1,
    padding: '8px 16px', background: bg, color, border: 'none', cursor: 'pointer',
    transition: 'opacity 0.2s',
  }),
  card: { background: 'var(--bg2)', border: '1px solid var(--border)', padding: 20, marginBottom: 2 },
  modal: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
    zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  modalBox: (accentColor = 'var(--green)') => ({
    width: '100%', maxWidth: 640, maxHeight: '90vh', overflowY: 'auto',
    background: 'var(--bg)', border: `1px solid ${accentColor}`,
    boxShadow: `0 0 40px rgba(0,0,0,0.6)`, padding: 32,
  }),
}

const timeAgo = (date) => {
  if (!date) return '—'
  const s = Math.floor((Date.now() - new Date(date)) / 1000)
  if (s < 60)    return 'just now'
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return new Date(date).toLocaleDateString()
}

function StatCard({ label, value, color }) {
  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', padding: '20px 24px', textAlign: 'center' }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 36, fontWeight: 700, color: color || 'var(--green)' }}>{value ?? '—'}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', letterSpacing: 2, marginTop: 4 }}>{label}</div>
    </div>
  )
}

function useNotify() {
  const [msg, setMsg] = useState(null)
  const notify = useCallback((text, ok = true) => {
    setMsg({ text, ok })
    setTimeout(() => setMsg(null), 3000)
  }, [])
  const Toast = msg ? (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
      background: msg.ok ? 'rgba(0,255,136,0.15)' : 'rgba(255,71,87,0.15)',
      border: `1px solid ${msg.ok ? 'rgba(0,255,136,0.5)' : 'rgba(255,71,87,0.5)'}`,
      color: msg.ok ? 'var(--green)' : 'var(--red)',
      fontFamily: 'var(--font-mono)', fontSize: 12, padding: '12px 20px', letterSpacing: 1,
    }}>{msg.text}</div>
  ) : null
  return { notify, Toast }
}

function ConfirmModal({ message, onOk, onCancel, danger = false }) {
  return (
    <div style={S.modal} onClick={onCancel}>
      <div style={{ ...S.modalBox(danger ? 'var(--red)' : 'var(--border)'), maxWidth: 400 }} onClick={e => e.stopPropagation()}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Confirm</div>
        <p style={{ color: 'var(--muted)', marginBottom: 24, lineHeight: 1.6 }}>{message}</p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onOk}
            style={{ ...S.btn(danger ? 'rgba(255,71,87,0.2)' : 'rgba(0,255,136,0.2)', danger ? 'var(--red)' : 'var(--green)'), border: `1px solid ${danger ? 'rgba(255,71,87,0.4)' : 'rgba(0,255,136,0.4)'}`, flex: 1 }}>
            CONFIRM
          </button>
          <button onClick={onCancel}
            style={{ ...S.btn('transparent', 'var(--muted)'), border: '1px solid var(--border)', flex: 1 }}>
            CANCEL
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── User Profile Editor Modal ────────────────────────────────────────────────
function UserEditModal({ userId, onClose, onSaved }) {
  const { notify, Toast } = useNotify()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [data, setData]       = useState(null)
  const [tab, setTab]         = useState('profile')
  const [form, setForm]       = useState({})
  const [newPassword, setNewPassword] = useState('')
  const [showPwField, setShowPwField] = useState(false)
  const [confirm, setConfirm] = useState(null)

  useEffect(() => {
    api.get(`/forum/admin/users/${userId}`)
      .then(r => {
        setData(r.data)
        const u = r.data.user
        setForm({
          username:  u.username,
          email:     u.email,
          bio:       u.bio || '',
          avatar:    u.avatar || '',
          role:      u.role,
          banned:    u.banned,
          banReason: u.banReason || '',
        })
      })
      .catch(() => notify('Failed to load user', false))
      .finally(() => setLoading(false))
  }, [userId])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    setSaving(true)
    try {
      const payload = { ...form }
      if (showPwField && newPassword.trim()) payload.newPassword = newPassword.trim()
      await api.put(`/forum/admin/users/${userId}`, payload)
      notify('User saved successfully')
      onSaved()
    } catch (err) {
      notify(err.response?.data?.error || 'Save failed', false)
    } finally { setSaving(false) }
  }

  const handleDeleteConfirm = () => {
    setConfirm({
      message: `Permanently delete ${form.username} and all their posts? This cannot be undone.`,
      danger: true,
      onOk: async () => {
        await api.delete(`/forum/admin/users/${userId}`)
        setConfirm(null)
        onSaved(true)
      }
    })
  }

  if (loading) return (
    <div style={S.modal}>
      <div style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>Loading user data...</div>
    </div>
  )

  const u = data?.user
  const modalTabs = [
    { key: 'profile',    label: '👤 Profile' },
    { key: 'activity',   label: '📋 Activity' },
    { key: 'moderation', label: '🛡 Moderation' },
  ]

  return (
    <>
      {Toast}
      {confirm && <ConfirmModal {...confirm} onCancel={() => setConfirm(null)} />}
      <div style={{ ...S.modal, zIndex: 2100 }} onClick={onClose}>
        <div style={S.modalBox()} onClick={e => e.stopPropagation()}>

          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <img
                src={form.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${u?.username}`}
                alt=""
                style={{ width: 52, height: 52, borderRadius: '50%', border: `2px solid ${u?.banned ? 'var(--red)' : 'var(--border)'}` }}
              />
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--green)', letterSpacing: 3, marginBottom: 4 }}>EDIT USER</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700 }}>{u?.username}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', marginTop: 2 }}>
                  {u?.email} · joined {timeAgo(u?.createdAt)} · {u?.threadCount}T / {u?.replyCount}R
                </div>
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>✕</button>
          </div>

          {/* Sub-tabs */}
          <div style={{ display: 'flex', gap: 2, marginBottom: 24 }}>
            {modalTabs.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                style={{ ...S.btn(tab === t.key ? 'rgba(0,255,136,0.1)' : 'transparent', tab === t.key ? 'var(--green)' : 'var(--muted)'), border: `1px solid ${tab === t.key ? 'rgba(0,255,136,0.3)' : 'var(--border)'}`, fontSize: 9, letterSpacing: 1 }}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Profile tab */}
          {tab === 'profile' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={S.label}>Username</label>
                  <input value={form.username} onChange={e => set('username', e.target.value)} style={S.input} />
                </div>
                <div>
                  <label style={S.label}>Email</label>
                  <input value={form.email} onChange={e => set('email', e.target.value)} style={S.input} />
                </div>
              </div>

              <div>
                <label style={S.label}>Bio</label>
                <textarea value={form.bio} onChange={e => set('bio', e.target.value)}
                  rows={3} placeholder="User bio..." style={{ ...S.input, resize: 'vertical' }} />
              </div>

              <div>
                <label style={S.label}>Avatar URL</label>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <input value={form.avatar} onChange={e => set('avatar', e.target.value)}
                    placeholder="https://..." style={S.input} />
                  <img
                    src={form.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${form.username}`}
                    alt="preview"
                    style={{ width: 40, height: 40, borderRadius: '50%', flexShrink: 0, border: '1px solid var(--border)', objectFit: 'cover' }}
                  />
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label style={{ ...S.label, marginBottom: 0 }}>Password Reset</label>
                  <button onClick={() => setShowPwField(v => !v)}
                    style={{ ...S.btn('transparent', 'var(--cyan)'), border: '1px solid rgba(0,212,255,0.3)', fontSize: 9, padding: '4px 10px' }}>
                    {showPwField ? 'CANCEL' : '🔑 SET NEW PASSWORD'}
                  </button>
                </div>
                {showPwField && (
                  <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                    placeholder="New password (min 6 chars)" style={S.input} />
                )}
              </div>

              <div style={{ display: 'flex', gap: 10, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                <button onClick={handleSave} disabled={saving}
                  style={{ ...S.btn(), flex: 2, opacity: saving ? 0.7 : 1 }}>
                  {saving ? 'SAVING...' : '💾 SAVE CHANGES'}
                </button>
                <button onClick={handleDeleteConfirm}
                  style={{ ...S.btn('rgba(255,71,87,0.1)', 'var(--red)'), border: '1px solid rgba(255,71,87,0.3)', flex: 1 }}>
                  🗑 DELETE USER
                </button>
              </div>
            </div>
          )}

          {/* Activity tab */}
          {tab === 'activity' && (
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', letterSpacing: 2, marginBottom: 12 }}>
                RECENT THREADS ({data?.recentThreads?.length || 0})
              </div>
              {(data?.recentThreads?.length === 0) && (
                <div style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: 11, marginBottom: 24 }}>No threads yet.</div>
              )}
              {data?.recentThreads?.map(t => (
                <div key={t._id} style={{ ...S.card, marginBottom: 6, padding: '12px 16px' }}>
                  <Link to={`/forum/thread/${t._id}`} target="_blank"
                    style={{ fontFamily: 'var(--font-display)', fontSize: 14, color: 'var(--text)', textDecoration: 'none', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.title}
                  </Link>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', marginTop: 4 }}>
                    {t.category?.icon} {t.category?.name} · {timeAgo(t.createdAt)} · {t.replyCount} replies · {t.views} views
                  </div>
                </div>
              ))}

              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', letterSpacing: 2, margin: '20px 0 12px' }}>
                RECENT REPLIES ({data?.recentReplies?.length || 0})
              </div>
              {(data?.recentReplies?.length === 0) && (
                <div style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>No replies yet.</div>
              )}
              {data?.recentReplies?.map(r => (
                <div key={r._id} style={{ ...S.card, marginBottom: 6, padding: '12px 16px' }}>
                  <Link to={`/forum/thread/${r.thread?._id}`} target="_blank"
                    style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--cyan)', textDecoration: 'none', display: 'block', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    → {r.thread?.title}
                  </Link>
                  <div style={{ color: 'var(--text)', fontSize: 13, lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                    {r.content}
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', marginTop: 4 }}>
                    {timeAgo(r.createdAt)}{r.edited && ' · edited'}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Moderation tab */}
          {tab === 'moderation' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={S.label}>Role</label>
                <Select value={form.role} onChange={v => set('role', v)}
                  options={[['user', 'User'], ['moderator', 'Moderator']]} />
              </div>

              <div style={{
                background: form.banned ? 'rgba(255,71,87,0.05)' : 'transparent',
                border: `1px solid ${form.banned ? 'rgba(255,71,87,0.2)' : 'var(--border)'}`,
                padding: 16
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: form.banned ? 14 : 0 }}>
                  <div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2, color: form.banned ? 'var(--red)' : 'var(--muted)' }}>
                      {form.banned ? '🔴 USER IS BANNED' : '🟢 USER IS ACTIVE'}
                    </div>
                    {u?.lastSeen && (
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', marginTop: 4 }}>
                        Last seen: {timeAgo(u.lastSeen)}
                      </div>
                    )}
                  </div>
                  <button onClick={() => set('banned', !form.banned)}
                    style={{ ...S.btn(form.banned ? 'rgba(0,255,136,0.15)' : 'rgba(255,71,87,0.15)', form.banned ? 'var(--green)' : 'var(--red)'), border: `1px solid ${form.banned ? 'rgba(0,255,136,0.3)' : 'rgba(255,71,87,0.3)'}` }}>
                    {form.banned ? '✅ UNBAN USER' : '🚫 BAN USER'}
                  </button>
                </div>
                {form.banned && (
                  <div>
                    <label style={S.label}>Ban Reason (shown to user on login)</label>
                    <input value={form.banReason} onChange={e => set('banReason', e.target.value)}
                      placeholder="Reason for ban..." style={S.input} />
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', padding: 12, textAlign: 'center' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700, color: 'var(--cyan)' }}>{u?.threadCount}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', letterSpacing: 2 }}>THREADS</div>
                </div>
                <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', padding: 12, textAlign: 'center' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700, color: 'var(--orange)' }}>{u?.replyCount}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', letterSpacing: 2 }}>REPLIES</div>
                </div>
              </div>

              <button onClick={handleSave} disabled={saving}
                style={{ ...S.btn(), opacity: saving ? 0.7 : 1 }}>
                {saving ? 'SAVING...' : '💾 SAVE MODERATION SETTINGS'}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ─── Thread Edit Modal ────────────────────────────────────────────────────────
function ThreadEditModal({ thread, cats, onClose, onSaved }) {
  const [form, setForm] = useState({
    title:    thread.title,
    content:  thread.content,
    category: thread.category?._id || thread.category,
    pinned:   thread.pinned,
    locked:   thread.locked,
    tags:     (thread.tags || []).join(', '),
  })
  const [attachments, setAttachments] = useState(thread.attachments || [])
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const fileInputRef = useRef()
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files)
    if (!files.length) return
    setUploading(true)
    const formData = new FormData()
    files.forEach(f => formData.append('files', f))
    try {
      const res = await api.post('/upload/multiple', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      setAttachments(a => [...a, ...res.data])
    } catch { notify.error('Upload failed') }
    finally { setUploading(false) }
  }

  const removeAttachment = (i) => setAttachments(a => a.filter((_, idx) => idx !== i))

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.put(`/forum/threads/${thread._id}`, {
        ...form,
        tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
        attachments: attachments.map(f => ({ url: f.url, public_id: f.public_id, original_name: f.original_name, mimetype: f.mimetype, size: f.size })),
      })
      onSaved()
    } catch (err) {
      notify.error(err.response?.data?.error || 'Save failed')
    } finally { setSaving(false) }
  }

  return (
    <div style={S.modal} onClick={onClose}>
      <div style={S.modalBox('var(--cyan)')} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--cyan)', letterSpacing: 3 }}>✏️ EDIT THREAD</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 20 }}>✕</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={S.label}>Title</label>
            <input value={form.title} onChange={e => set('title', e.target.value)} style={S.input} />
          </div>
          <div>
            <label style={S.label}>Content</label>
            <textarea value={form.content} onChange={e => set('content', e.target.value)}
              rows={10} style={{ ...S.input, resize: 'vertical', lineHeight: 1.6 }} />
          </div>
          <div>
            <label style={S.label}>Attachments</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
              {attachments.map((f, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: 'var(--bg3)', border: '1px solid var(--border)', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text)' }}>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {f.mimetype?.startsWith('image/') ? '🖼' : f.mimetype?.startsWith('video/') ? '🎬' : '📎'} {f.original_name}
                    <span style={{ color: 'var(--muted)', marginLeft: 8 }}>({((f.size || 0)/1024).toFixed(0)}KB)</span>
                  </span>
                  <button onClick={() => removeAttachment(i)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 14, padding: 0, flexShrink: 0 }}>✕</button>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => fileInputRef.current.click()} disabled={uploading}
              style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1, padding: '6px 14px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer' }}>
              {uploading ? '⏳ Uploading...' : '📎 Add Attachments'}
            </button>
            <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }} onChange={handleUpload} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={S.label}>Category</label>
              <Select value={form.category} onChange={v => set('category', v)}
                options={cats.map(c => ({ value: c._id, label: `${c.icon} ${c.name}` }))} />
            </div>
            <div>
              <label style={S.label}>Tags (comma-separated)</label>
              <input value={form.tags} onChange={e => set('tags', e.target.value)} placeholder="tag1, tag2" style={S.input} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 20 }}>
            <Checkbox checked={form.pinned} onChange={v => set('pinned', v)} label="📌 PINNED"
              style={{ fontSize: 10, color: form.pinned ? 'var(--green)' : 'var(--muted)', letterSpacing: 1 }} />
            <Checkbox checked={form.locked} onChange={v => set('locked', v)} label="🔒 LOCKED"
              style={{ fontSize: 10, color: form.locked ? 'var(--red)' : 'var(--muted)', letterSpacing: 1 }} />
          </div>
          <div style={{ display: 'flex', gap: 10, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
            <button onClick={handleSave} disabled={saving}
              style={{ ...S.btn('rgba(0,212,255,0.15)', 'var(--cyan)'), border: '1px solid rgba(0,212,255,0.4)', flex: 2, opacity: saving ? 0.7 : 1 }}>
              {saving ? 'SAVING...' : '💾 SAVE THREAD'}
            </button>
            <button onClick={onClose}
              style={{ ...S.btn('transparent', 'var(--muted)'), border: '1px solid var(--border)', flex: 1 }}>
              CANCEL
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Reply Edit Modal ─────────────────────────────────────────────────────────
function ReplyEditModal({ reply, onClose, onSaved }) {
  const [content, setContent] = useState(reply.content)
  const [saving, setSaving]   = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.put(`/forum/replies/${reply._id}`, { content })
      onSaved()
    } catch (err) {
      notify.error(err.response?.data?.error || 'Save failed')
    } finally { setSaving(false) }
  }

  return (
    <div style={S.modal} onClick={onClose}>
      <div style={S.modalBox('var(--orange)')} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--orange)', letterSpacing: 3, marginBottom: 6 }}>✏️ EDIT REPLY</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)' }}>
              by {reply.author?.username} · {timeAgo(reply.createdAt)}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 20 }}>✕</button>
        </div>

        <label style={S.label}>Content</label>
        <textarea value={content} onChange={e => setContent(e.target.value)}
          rows={8} style={{ ...S.input, resize: 'vertical', lineHeight: 1.6, marginBottom: 16 }} />

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={handleSave} disabled={saving}
            style={{ ...S.btn('rgba(255,107,53,0.15)', 'var(--orange)'), border: '1px solid rgba(255,107,53,0.4)', flex: 2, opacity: saving ? 0.7 : 1 }}>
            {saving ? 'SAVING...' : '💾 SAVE REPLY'}
          </button>
          <button onClick={onClose}
            style={{ ...S.btn('transparent', 'var(--muted)'), border: '1px solid var(--border)', flex: 1 }}>
            CANCEL
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Ban Reason Modal ─────────────────────────────────────────────────────────
function BanModal({ user, onClose, onSaved }) {
  const [reason, setReason] = useState(user.banReason || '')
  const [saving, setSaving] = useState(false)

  const handleBan = async () => {
    setSaving(true)
    try {
      await api.put(`/forum/admin/users/${user._id}`, { banned: true, banReason: reason })
      onSaved()
    } catch { notify.error('Failed to ban user') }
    finally { setSaving(false) }
  }

  return (
    <div style={S.modal} onClick={onClose}>
      <div style={{ ...S.modalBox('var(--red)'), maxWidth: 420 }} onClick={e => e.stopPropagation()}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--red)', letterSpacing: 3, marginBottom: 16 }}>🚫 BAN USER</div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600, marginBottom: 20 }}>Ban {user.username}?</div>
        <label style={S.label}>Ban Reason (shown to user on login)</label>
        <input value={reason} onChange={e => setReason(e.target.value)}
          placeholder="e.g. Spam, rule violation..." style={{ ...S.input, marginBottom: 20 }} />
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={handleBan} disabled={saving}
            style={{ ...S.btn('rgba(255,71,87,0.15)', 'var(--red)'), border: '1px solid rgba(255,71,87,0.4)', flex: 2, opacity: saving ? 0.7 : 1 }}>
            {saving ? 'BANNING...' : 'CONFIRM BAN'}
          </button>
          <button onClick={onClose}
            style={{ ...S.btn('transparent', 'var(--muted)'), border: '1px solid var(--border)', flex: 1 }}>
            CANCEL
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Pagination ───────────────────────────────────────────────────────────────
function Pagination({ page, total, pageSize = 20, onPage }) {
  const pages = Math.ceil(total / pageSize)
  if (pages <= 1) return null
  return (
    <div style={{ display: 'flex', gap: 4, marginTop: 16, fontFamily: 'var(--font-mono)', fontSize: 10, alignItems: 'center' }}>
      <button disabled={page === 1} onClick={() => onPage(page - 1)}
        style={{ ...S.btn('transparent', 'var(--muted)'), border: '1px solid var(--border)', padding: '6px 12px', opacity: page === 1 ? 0.3 : 1 }}>←</button>
      <span style={{ padding: '6px 16px', background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--muted)' }}>
        {page} / {pages} &nbsp;·&nbsp; {total} total
      </span>
      <button disabled={page === pages} onClick={() => onPage(page + 1)}
        style={{ ...S.btn('transparent', 'var(--muted)'), border: '1px solid var(--border)', padding: '6px 12px', opacity: page === pages ? 0.3 : 1 }}>→</button>
    </div>
  )
}

// ─── Main ForumAdmin ──────────────────────────────────────────────────────────
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

  useEffect(() => {
    const token = getAuthToken()
    if (!token && !embedded) { navigate('/admin'); return }
    loadStats()
    loadCats()
  }, [])

  useEffect(() => {
    if (tab === 'users')   loadUsers()
    if (tab === 'threads') loadThreads()
    if (tab === 'replies') loadReplies()
  }, [tab, userSearch, threadSearch, replySearch, userPage, threadPage, replyPage])

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
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--green)', letterSpacing: 3, marginBottom: 6 }}>ADMIN PANEL</div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 700 }}>Forum Management</h1>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link to="/admin" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', textDecoration: 'none', letterSpacing: 2, border: '1px solid var(--border)', padding: '8px 16px' }}>← SITE ADMIN</Link>
          <Link to="/forum" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', textDecoration: 'none', letterSpacing: 2, border: '1px solid var(--border)', padding: '8px 16px' }}>VIEW FORUM →</Link>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 32, flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1, padding: '10px 18px', background: tab === t.key ? 'rgba(0,255,136,0.1)' : 'var(--bg2)', border: `1px solid ${tab === t.key ? 'rgba(0,255,136,0.4)' : 'var(--border)'}`, color: tab === t.key ? 'var(--green)' : 'var(--muted)', cursor: 'pointer' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ── */}
      {tab === 'overview' && stats && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 2, marginBottom: 40 }}>
            <StatCard label="TOTAL USERS"  value={stats.users}      color="var(--green)" />
            <StatCard label="THREADS"      value={stats.threads}    color="var(--cyan)" />
            <StatCard label="REPLIES"      value={stats.replies}    color="var(--orange)" />
            <StatCard label="CATEGORIES"   value={stats.categories} color="var(--muted)" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', letterSpacing: 2, marginBottom: 12 }}>RECENT USERS</div>
              {stats.recentUsers.map(u => (
                <div key={u._id} style={S.card}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <img src={u.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${u.username}`} alt=""
                        style={{ width: 32, height: 32, borderRadius: '50%', border: '1px solid var(--border)' }} />
                      <div>
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600 }}>{u.username}</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', marginTop: 2 }}>{u.email} · {timeAgo(u.createdAt)}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, padding: '3px 8px', border: '1px solid var(--border)', color: u.banned ? 'var(--red)' : 'var(--muted)' }}>
                        {u.banned ? 'BANNED' : u.role.toUpperCase()}
                      </span>
                      <button onClick={() => setEditingUser(u._id)}
                        style={{ ...S.btn('transparent', 'var(--cyan)'), border: '1px solid rgba(0,212,255,0.3)', fontSize: 9, padding: '3px 8px' }}>
                        EDIT
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', letterSpacing: 2, marginBottom: 12 }}>RECENT THREADS</div>
              {stats.recentThreads.map(t => (
                <div key={t._id} style={S.card}>
                  <Link to={`/forum/thread/${t._id}`} style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600, color: 'var(--text)', textDecoration: 'none', display: 'block', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</Link>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)' }}>by {t.author?.username} in {t.category?.name} · {timeAgo(t.createdAt)}</div>
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
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--green)', letterSpacing: 2, marginBottom: 20 }}>
              {editingCat ? '✏️ EDIT CATEGORY' : '+ NEW CATEGORY'}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label style={S.label}>NAME *</label>
                <input value={catForm.name} onChange={e => setCatForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. General Discussion" style={S.input} />
              </div>
              <div>
                <label style={S.label}>ICON (emoji)</label>
                <input value={catForm.icon} onChange={e => setCatForm(f => ({ ...f, icon: e.target.value }))} placeholder="💬" style={{ ...S.input, width: 80 }} />
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={S.label}>DESCRIPTION</label>
                <input value={catForm.description} onChange={e => setCatForm(f => ({ ...f, description: e.target.value }))} placeholder="What this category is about..." style={S.input} />
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
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', letterSpacing: 1 }}>ACTION</div>
                    {ROLE_OPTIONS.map(r => (
                      <div key={r} style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', letterSpacing: 1, textAlign: 'center' }}>{r.toUpperCase()}</div>
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
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', marginTop: 8 }}>
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
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', marginTop: 2 }}>
                    {cat.description} · {cat.threadCount} threads · order {cat.order}
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', marginTop: 4, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    {cat.view_roles?.length > 0 && <span>View: {cat.view_roles.join(', ')}</span>}
                    {cat.post_roles?.length > 0 && <span>Post: {cat.post_roles.join(', ')}</span>}
                    {cat.reply_roles?.length > 0 && <span>Reply: {cat.reply_roles.join(', ')}</span>}
                    {cat.attach_roles?.length > 0 && <span>Attach: {cat.attach_roles.join(', ')}</span>}
                    {cat.mod_roles?.length > 0 && <span>Mod: {cat.mod_roles.join(', ')}</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => { setCatForm({ name: cat.name, description: cat.description, icon: cat.icon, color: cat.color, order: cat.order, view_roles: cat.view_roles || [], post_roles: cat.post_roles || [], reply_roles: cat.reply_roles || [], attach_roles: cat.attach_roles || [], mod_roles: cat.mod_roles || ['moderator', 'admin'] }); setEditingCat(cat._id); window.scrollTo(0, 0) }}
                    style={{ ...S.btn('transparent', 'var(--cyan)'), border: '1px solid rgba(0,212,255,0.3)' }}>EDIT</button>
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
                  <img
                    src={u.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${u.username}`} alt=""
                    onClick={() => setEditingUser(u._id)}
                    style={{ width: 44, height: 44, borderRadius: '50%', border: `2px solid ${u.banned ? 'var(--red)' : 'var(--border)'}`, cursor: 'pointer', flexShrink: 0 }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600, color: u.banned ? 'var(--red)' : 'var(--text)' }}>{u.username}</span>
                      {u.banned && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--red)', border: '1px solid rgba(255,71,87,0.4)', padding: '2px 6px' }}>BANNED</span>}
                      {u.role === 'moderator' && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--cyan)', border: '1px solid rgba(0,212,255,0.4)', padding: '2px 6px' }}>MOD</span>}
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', marginTop: 2 }}>
                      {u.email} · {u.threadCount}T {u.replyCount}R · joined {timeAgo(u.createdAt)} · last seen {timeAgo(u.lastSeen)}
                    </div>
                    {u.banReason && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--red)', marginTop: 2 }}>Ban reason: {u.banReason}</div>}
                    {u.bio && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4, fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.bio}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <button onClick={() => setEditingUser(u._id)}
                      style={{ ...S.btn('rgba(0,255,136,0.1)', 'var(--green)'), border: '1px solid rgba(0,255,136,0.3)', fontSize: 9 }}>
                      ✏️ EDIT PROFILE
                    </button>
                    <div style={{ width: 150 }}>
                      <Select value={u.role} onChange={v => changeRole(u, v)}
                        options={[['user', 'USER'], ['moderator', 'MODERATOR']]}
                        style={{ fontSize: 9 }} />
                    </div>
                    <button onClick={() => toggleUserBan(u)}
                      style={{ ...S.btn('transparent', u.banned ? 'var(--green)' : 'var(--orange)'), border: `1px solid ${u.banned ? 'rgba(0,255,136,0.3)' : 'rgba(255,107,53,0.3)'}`, fontSize: 9 }}>
                      {u.banned ? '✅ UNBAN' : '🚫 BAN'}
                    </button>
                    <button onClick={() => deleteUser(u)}
                      style={{ ...S.btn('transparent', 'var(--red)'), border: '1px solid rgba(255,71,87,0.3)', fontSize: 9 }}>
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
              <div key={t._id} style={{ ...S.card, borderColor: t.locked ? 'rgba(255,71,87,0.15)' : t.pinned ? 'rgba(0,255,136,0.15)' : 'var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Link to={`/forum/thread/${t._id}`} style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600, color: 'var(--text)', textDecoration: 'none', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.pinned && '📌 '}{t.locked && '🔒 '}{t.title}
                    </Link>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', marginTop: 4, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <span>by {t.author?.username}</span>
                      <span>{t.category?.icon} {t.category?.name}</span>
                      <span>{t.replyCount} replies</span>
                      <span>{t.views} views</span>
                      <span>{timeAgo(t.createdAt)}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button onClick={() => setEditingThread(t)}
                      style={{ ...S.btn('rgba(0,255,136,0.1)', 'var(--green)'), border: '1px solid rgba(0,255,136,0.3)', fontSize: 9 }}>
                      ✏️ EDIT
                    </button>
                    <button onClick={() => toggleThread(t, 'pinned')}
                      style={{ ...S.btn('transparent', t.pinned ? 'var(--green)' : 'var(--muted)'), border: `1px solid ${t.pinned ? 'rgba(0,255,136,0.3)' : 'var(--border)'}`, fontSize: 9 }}>
                      {t.pinned ? 'UNPIN' : '📌'}
                    </button>
                    <button onClick={() => toggleThread(t, 'locked')}
                      style={{ ...S.btn('transparent', t.locked ? 'var(--red)' : 'var(--muted)'), border: `1px solid ${t.locked ? 'rgba(255,71,87,0.3)' : 'var(--border)'}`, fontSize: 9 }}>
                      {t.locked ? '🔓' : '🔒'}
                    </button>
                    <button onClick={() => deleteThread(t)}
                      style={{ ...S.btn('transparent', 'var(--red)'), border: '1px solid rgba(255,71,87,0.3)', fontSize: 9 }}>
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
                  <img
                    src={r.author?.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${r.author?.username}`}
                    alt="" style={{ width: 36, height: 36, borderRadius: '50%', border: '1px solid var(--border)', flexShrink: 0 }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4, gap: 8, flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600 }}>{r.author?.username}</span>
                        {r.author?.banned && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--red)', border: '1px solid rgba(255,71,87,0.4)', padding: '1px 5px' }}>BANNED</span>}
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)' }}>{timeAgo(r.createdAt)}</span>
                        {r.edited && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--orange)' }}>EDITED</span>}
                      </div>
                      <Link to={`/forum/thread/${r.thread?._id}`} target="_blank"
                        style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--cyan)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>
                        → {r.thread?.title}
                      </Link>
                    </div>
                    <div style={{ color: 'var(--text)', fontSize: 13, lineHeight: 1.6, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
                      {r.content}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
                    <button onClick={() => setEditingReply(r)}
                      style={{ ...S.btn('rgba(0,255,136,0.1)', 'var(--green)'), border: '1px solid rgba(0,255,136,0.3)', fontSize: 9 }}>
                      ✏️ EDIT
                    </button>
                    <button onClick={() => r.author?._id && setEditingUser(r.author._id)}
                      style={{ ...S.btn('transparent', 'var(--cyan)'), border: '1px solid rgba(0,212,255,0.3)', fontSize: 9 }}>
                      👤 USER
                    </button>
                    <button onClick={() => deleteReply(r)}
                      style={{ ...S.btn('transparent', 'var(--red)'), border: '1px solid rgba(255,71,87,0.3)', fontSize: 9 }}>
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
