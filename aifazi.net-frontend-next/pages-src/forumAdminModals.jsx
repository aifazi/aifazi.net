'use client'
// forumAdminModals.jsx — admin modals & chrome (extracted).
import { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from '@/lib/router-compat'
import api, { getAuthToken, getRole, getUsername, clearAuthTokens, setEffectiveAccess, hasStaffAccess } from '@/lib/api'
import { notify } from '../core/notify.jsx'
import { UserAvatar } from '@/lib/avatar'
import { Checkbox, Select } from '../core/ui.jsx'

const S = {
  input: {
    width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)',
    color: 'var(--text)', fontFamily: 'var(--font-display)', fontSize: 14,
    padding: '10px 14px', outline: 'none', borderRadius: 10,
    transition: 'border-color 0.15s, box-shadow 0.15s',
  },
  label: {
    fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2,
    color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 6,
  },
  btn: (bg = 'var(--green)', color = '#000') => ({
    fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1,
    padding: '8px 16px', background: bg, color, border: 'none', cursor: 'pointer',
    borderRadius: 10,
    boxShadow: bg === 'var(--green)' ? '0 0 14px color-mix(in srgb, var(--green) 18%, transparent)' : undefined,
    transition: 'opacity 0.2s, box-shadow 0.2s',
  }),
  card: { background: 'var(--bg2)', border: '1px solid var(--border)', padding: 20, marginBottom: 2, borderRadius: 14 },
  modal: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
    zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  modalBox: (accentColor = 'var(--green)') => ({
    width: '100%', maxWidth: 640, maxHeight: '90vh', overflowY: 'auto',
    background:
      'radial-gradient(120% 140% at 12% 0%, color-mix(in srgb, var(--green) 6%, transparent), transparent 50%),' +
      'radial-gradient(120% 140% at 88% 100%, color-mix(in srgb, var(--cyan) 5%, transparent), transparent 52%),' +
      'var(--bg)',
    border: `1px solid ${accentColor}`,
    boxShadow: `0 0 40px rgba(0,0,0,0.6)`, padding: 32, borderRadius: 16,
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
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', padding: '20px 24px', textAlign: 'center', borderRadius: 14 }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 36, fontWeight: 700, color: color || 'var(--green)' }}>{value ?? '—'}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', letterSpacing: 2, marginTop: 4 }}>{label}</div>
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
      background: msg.ok ? 'color-mix(in srgb, var(--green) 15%, transparent)' : 'rgba(255,71,87,0.15)',
      border: `1px solid ${msg.ok ? 'color-mix(in srgb, var(--green) 50%, transparent)' : 'rgba(255,71,87,0.5)'}`,
      color: msg.ok ? 'var(--green)' : 'var(--red)',
      fontFamily: 'var(--font-mono)', fontSize: 12, padding: '12px 20px', letterSpacing: 1,
      borderRadius: 10,
    }}>{msg.text}</div>
  ) : null
  return { notify, Toast }
}

function ConfirmModal({ message, onOk, onCancel, danger = false }) {
  return (
    <div style={S.modal} onClick={onCancel} role="button" tabIndex={0} onKeyDown={(e)=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); e.currentTarget.click() } }}>
      <div style={{ ...S.modalBox(danger ? 'var(--red)' : 'var(--border)'), maxWidth: 400 }} onClick={e => e.stopPropagation()} role="button" tabIndex={0} onKeyDown={(e)=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); e.currentTarget.click() } }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Confirm</div>
        <p style={{ color: 'var(--muted)', marginBottom: 24, lineHeight: 1.6 }}>{message}</p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onOk}
            style={{ ...S.btn(danger ? 'rgba(255,71,87,0.2)' : 'color-mix(in srgb, var(--green) 20%, transparent)', danger ? 'var(--red)' : 'var(--green)'), border: `1px solid ${danger ? 'rgba(255,71,87,0.4)' : 'color-mix(in srgb, var(--green) 40%, transparent)'}`, flex: 1 }}>
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
      <div style={{ ...S.modal, zIndex: 2100 }} onClick={onClose} role="button" tabIndex={0} onKeyDown={(e)=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); e.currentTarget.click() } }}>
        <div style={S.modalBox()} onClick={e => e.stopPropagation()} role="button" tabIndex={0} onKeyDown={(e)=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); e.currentTarget.click() } }}>

          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <UserAvatar
                avatar={form.avatar}
                name={u?.username}
                size={52}
                imgStyle={{ border: `2px solid ${u?.banned ? 'var(--red)' : 'var(--border)'}` }}
                fallback={`https://api.dicebear.com/7.x/initials/svg?seed=${u?.username}`}
              />
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--green)', letterSpacing: 3, marginBottom: 4 }}>EDIT USER</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700 }}>{u?.username}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                  {u?.email} · joined {timeAgo(u?.createdAt)} · {u?.threadCount}T / {u?.replyCount}R
                </div>
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 20, lineHeight: 1 }} aria-label="Close">✕</button>
          </div>

          {/* Sub-tabs */}
          <div style={{ display: 'flex', gap: 2, marginBottom: 24 }}>
            {modalTabs.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                style={{ ...S.btn(tab === t.key ? 'color-mix(in srgb, var(--green) 10%, transparent)' : 'transparent', tab === t.key ? 'var(--green)' : 'var(--muted)'), border: `1px solid ${tab === t.key ? 'color-mix(in srgb, var(--green) 30%, transparent)' : 'var(--border)'}`, fontSize: 11, letterSpacing: 1 }}>
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
                  <UserAvatar
                    avatar={form.avatar}
                    name={form.username}
                    size={40}
                    imgStyle={{ border: '1px solid var(--border)' }}
                    fallback={`https://api.dicebear.com/7.x/initials/svg?seed=${form.username}`}
                  />
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label style={{ ...S.label, marginBottom: 0 }}>Password Reset</label>
                  <button onClick={() => setShowPwField(v => !v)}
                    style={{ ...S.btn('transparent', 'var(--cyan)'), border: '1px solid color-mix(in srgb, var(--cyan) 30%, transparent)', fontSize: 11, padding: '4px 10px' }}>
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
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', letterSpacing: 2, marginBottom: 12 }}>
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
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                    {t.category?.icon} {t.category?.name} · {timeAgo(t.createdAt)} · {t.replyCount} replies · {t.views} views
                  </div>
                </div>
              ))}

              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', letterSpacing: 2, margin: '20px 0 12px' }}>
                RECENT REPLIES ({data?.recentReplies?.length || 0})
              </div>
              {(data?.recentReplies?.length === 0) && (
                <div style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>No replies yet.</div>
              )}
              {data?.recentReplies?.map(r => (
                <div key={r._id} style={{ ...S.card, marginBottom: 6, padding: '12px 16px' }}>
                  <Link to={`/forum/thread/${r.thread?._id}`} target="_blank"
                    style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--cyan)', textDecoration: 'none', display: 'block', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    → {r.thread?.title}
                  </Link>
                  <div style={{ color: 'var(--text)', fontSize: 13, lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                    {r.content}
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
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
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, color: form.banned ? 'var(--red)' : 'var(--muted)' }}>
                      {form.banned ? '🔴 USER IS BANNED' : '🟢 USER IS ACTIVE'}
                    </div>
                    {u?.lastSeen && (
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                        Last seen: {timeAgo(u.lastSeen)}
                      </div>
                    )}
                  </div>
                  <button onClick={() => set('banned', !form.banned)}
                    style={{ ...S.btn(form.banned ? 'color-mix(in srgb, var(--green) 15%, transparent)' : 'rgba(255,71,87,0.15)', form.banned ? 'var(--green)' : 'var(--red)'), border: `1px solid ${form.banned ? 'color-mix(in srgb, var(--green) 30%, transparent)' : 'rgba(255,71,87,0.3)'}` }}>
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
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', letterSpacing: 2 }}>THREADS</div>
                </div>
                <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', padding: 12, textAlign: 'center' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700, color: 'var(--orange)' }}>{u?.replyCount}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', letterSpacing: 2 }}>REPLIES</div>
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
    <div style={S.modal} onClick={onClose} role="button" tabIndex={0} onKeyDown={(e)=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); e.currentTarget.click() } }}>
      <div style={S.modalBox('var(--cyan)')} onClick={e => e.stopPropagation()} role="button" tabIndex={0} onKeyDown={(e)=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); e.currentTarget.click() } }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--cyan)', letterSpacing: 3 }}>✏️ EDIT THREAD</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 20 }} aria-label="Close">✕</button>
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
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: 'var(--bg3)', border: '1px solid var(--border)', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text)' }}>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {f.mimetype?.startsWith('image/') ? '🖼' : f.mimetype?.startsWith('video/') ? '🎬' : '📎'} {f.original_name}
                    <span style={{ color: 'var(--muted)', marginLeft: 8 }}>({((f.size || 0)/1024).toFixed(0)}KB)</span>
                  </span>
                  <button onClick={() => removeAttachment(i)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 14, padding: 0, flexShrink: 0 }}>✕</button>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => fileInputRef.current.click()} disabled={uploading}
              style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1, padding: '6px 14px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer' }}>
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
              style={{ fontSize: 11, color: form.pinned ? 'var(--green)' : 'var(--muted)', letterSpacing: 1 }} />
            <Checkbox checked={form.locked} onChange={v => set('locked', v)} label="🔒 LOCKED"
              style={{ fontSize: 11, color: form.locked ? 'var(--red)' : 'var(--muted)', letterSpacing: 1 }} />
          </div>
          <div style={{ display: 'flex', gap: 10, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
            <button onClick={handleSave} disabled={saving}
              style={{ ...S.btn('color-mix(in srgb, var(--cyan) 15%, transparent)', 'var(--cyan)'), border: '1px solid color-mix(in srgb, var(--cyan) 40%, transparent)', flex: 2, opacity: saving ? 0.7 : 1 }}>
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
    <div style={S.modal} onClick={onClose} role="button" tabIndex={0} onKeyDown={(e)=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); e.currentTarget.click() } }}>
      <div style={S.modalBox('var(--orange)')} onClick={e => e.stopPropagation()} role="button" tabIndex={0} onKeyDown={(e)=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); e.currentTarget.click() } }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--orange)', letterSpacing: 3, marginBottom: 6 }}>✏️ EDIT REPLY</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>
              by {reply.author?.username} · {timeAgo(reply.createdAt)}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 20 }} aria-label="Close">✕</button>
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
    <div style={S.modal} onClick={onClose} role="button" tabIndex={0} onKeyDown={(e)=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); e.currentTarget.click() } }}>
      <div style={{ ...S.modalBox('var(--red)'), maxWidth: 420 }} onClick={e => e.stopPropagation()} role="button" tabIndex={0} onKeyDown={(e)=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); e.currentTarget.click() } }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--red)', letterSpacing: 3, marginBottom: 16 }}>🚫 BAN USER</div>
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
    <div style={{ display: 'flex', gap: 4, marginTop: 16, fontFamily: 'var(--font-mono)', fontSize: 11, alignItems: 'center' }}>
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

export { S, StatCard, useNotify, ConfirmModal, UserEditModal, ThreadEditModal, ReplyEditModal, BanModal, Pagination }
