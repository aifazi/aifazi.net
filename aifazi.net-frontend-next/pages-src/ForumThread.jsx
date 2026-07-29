'use client'
import { useState, useEffect, useRef } from 'react'
import { Link, useParams, useNavigate } from '@/lib/router-compat'
import api from '@/lib/api'
import { useForum } from '../context/ForumContext'
import { dialog } from '../core/dialog.jsx'
import { notify } from '../core/notify.jsx'

function timeAgo(date) {
  if (!date) return ''
  const d = new Date(date)
  if (isNaN(d.getTime())) return ''
  const s = Math.floor((Date.now() - d) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s/60)}m ago`
  if (s < 86400) return `${Math.floor(s/3600)}h ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function Avatar({ user, size = 40 }) {
  const src = user?.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${user?.username || 'U'}&backgroundColor=0b1118&textColor=00ff88`
  return <img src={src} alt={user?.username} loading="lazy" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--border)', flexShrink: 0 }} />
}

function UserCard({ author }) {
  if (!author) return null
  const roleColor = { admin: 'var(--orange)', moderator: 'var(--cyan)', user: 'var(--muted)' }[author.role] || 'var(--muted)'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '16px 12px', background: 'var(--bg3)', border: '1px solid var(--border)', minWidth: 100, maxWidth: 120, textAlign: 'center' }}>
      <Avatar user={author} size={52} />
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600, color: 'var(--text)', wordBreak: 'break-all' }}>{author.username}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 1, color: roleColor, textTransform: 'uppercase' }}>{author.role}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--muted)' }}>🗨 {author.replyCount + (author.threadCount || 0)} posts</div>
    </div>
  )
}

function Attachment({ file }) {
  const isImg = file.mimetype?.startsWith('image/')
  const isVid = file.mimetype?.startsWith('video/')
  if (isImg) return (
    <a href={file.url} target="_blank" rel="noopener noreferrer" className="forum-attachment-link">
      <img src={file.url} alt={file.original_name} loading="lazy" className="forum-attachment-image" />
    </a>
  )
  if (isVid) return (
    <video controls src={file.url} className="forum-attachment-video" />
  )
  return (
    <a href={file.url} target="_blank" rel="noopener noreferrer" className="forum-file-attachment">
      📎 {file.original_name} <span style={{ color: 'var(--muted)', fontSize: 9 }}>({((file.size || 0)/1024).toFixed(0)}KB)</span>
    </a>
  )
}

function AttachUploader({ onUploaded }) {
  const [uploading, setUploading] = useState(false)
  const [attachments, setAttachments] = useState([])
  const inputRef = useRef()

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files)
    if (!files.length) return
    setUploading(true)
    const formData = new FormData()
    files.forEach(f => formData.append('files', f))
    try {
      const res = await api.post('/upload/multiple', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      const newAttachments = [...attachments, ...res.data]
      setAttachments(newAttachments)
      onUploaded(newAttachments)
    } catch { notify.error('Upload failed') }
    finally { setUploading(false) }
  }

  const remove = (i) => {
    const next = attachments.filter((_, idx) => idx !== i)
    setAttachments(next)
    onUploaded(next)
  }

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        {attachments.map((f, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: 'var(--bg3)', border: '1px solid var(--border)', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text)' }}>
            {f.mimetype?.startsWith('image/') ? '🖼' : f.mimetype?.startsWith('video/') ? '🎬' : '📎'} {f.original_name}
            <button onClick={() => remove(i)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 12, padding: 0 }}>✕</button>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => inputRef.current.click()} disabled={uploading}
        style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1, padding: '6px 14px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer' }}>
        {uploading ? '⏳ Uploading...' : '📎 Attach Files'}
      </button>
      <input ref={inputRef} type="file" multiple style={{ display: 'none' }} onChange={handleUpload} />
    </div>
  )
}

export default function ForumThread() {
  const { id } = useParams()
  const { user } = useForum()
  const navigate = useNavigate()

  const [thread, setThread]     = useState(null)
  const [replies, setReplies]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [replyText, setReplyText] = useState('')
  const [replyAttach, setReplyAttach] = useState([])
  const [submitting, setSubmitting]   = useState(false)
  const [editingReply, setEditingReply] = useState(null)
  const [editText, setEditText]        = useState('')
  const [editingThread, setEditingThread] = useState(false)
  const [editThreadText, setEditThreadText] = useState('')
  const [liked, setLiked]              = useState(false)
  const [threadReactions, setThreadReactions]   = useState({})
  const [myThreadReactions, setMyThreadReactions] = useState([])
  const [subscribed, setSubscribed]             = useState(false)
  const replyRef = useRef(null)

  const EMOJIS = ['👍', '❤️', '🔥', '😂', '😮']

  // ForumContext returns MongoDB docs which use _id, but admin tokens use id.
  // Always resolve to a consistent string for comparisons.
  const userId = user?._id?.toString() || user?.id?.toString() || null

  useEffect(() => {
    api.get(`/forum/threads/${id}`)
      .then(r => {
        setThread(r.data.thread)
        setReplies(r.data.replies)
        if (userId) setLiked(r.data.thread.likes?.includes(userId))
        // Build reaction summary from stored reactions map
        const reactionMap = r.data.thread.reactions || {}
        const summary = {}
        const mine = []
        EMOJIS.forEach(e => {
          const list = reactionMap[e] || []
          summary[e] = list.length
          if (userId && list.includes(userId)) mine.push(e)
        })
        setThreadReactions(summary)
        setMyThreadReactions(mine)
        setSubscribed(r.data.thread.subscribers?.some(s => s?.toString() === (user?._id?.toString() || user?.id?.toString())))
      })
      .catch(() => navigate('/forum'))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    const handler = (e) => {
      const { action, replyId } = e.detail
      if (action === 'reply') {
        replyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        replyRef.current?.focus()
      } else if (action === 'edit' && replyId) {
        const reply = replies.find(r => r._id === replyId)
        if (reply) { setEditingReply(replyId); setEditText(reply.content) }
      } else if (action === 'edit' && !replyId) {
        setEditingThread(true)
        setEditThreadText(thread?.content || '')
      } else if (action === 'delete' && replyId) {
        handleDeleteReply(replyId)
      } else if (action === 'delete' && !replyId) {
        handleDeleteThread()
      }
    }
    document.addEventListener('forum-context-action', handler)
    return () => document.removeEventListener('forum-context-action', handler)
  }, [replies, userId, thread])

  const handleReact = async (emoji) => {
    if (!userId) return
    try {
      const r = await api.post(`/forum/threads/${id}/react`, { emoji })
      setThreadReactions(r.data.reactions)
      setMyThreadReactions(r.data.myReactions)
    } catch (err) {
      console.error('React failed:', err.response?.data?.error || err.message)
    }
  }

  const handleSubscribe = async () => {
    if (!userId) return
    try {
      const r = await api.post(`/forum/threads/${id}/subscribe`)
      setSubscribed(r.data.subscribed)
    } catch (err) {
      console.error('Subscribe failed:', err.response?.data?.error || err.message)
    }
  }

  const handleLikeThread = async () => {
    if (!user) return
    const r = await api.post(`/forum/threads/${id}/like`)
    setThread(t => ({ ...t, likes: r.data.likes }))
    setLiked(r.data.liked)
  }

  const handleLikeReply = async (replyId) => {
    if (!user) return
    const r = await api.post(`/forum/replies/${replyId}/like`)
    setReplies(rs => rs.map(rp => rp._id === replyId ? { ...rp, likes: r.data.likes, _liked: r.data.liked } : rp))
  }

  const handleReply = async () => {
    if (!replyText.trim()) return
    setSubmitting(true)
    try {
      const r = await api.post('/forum/replies', {
        thread: id,
        content: replyText,
        attachments: replyAttach.map(f => ({ url: f.url, public_id: f.public_id, original_name: f.original_name, mimetype: f.mimetype, size: f.size }))
      })
      setReplies(rs => [...rs, r.data])
      setThread(t => ({ ...t, replyCount: (t.replyCount ?? t.reply_count ?? replies.length) + 1 }))
      setReplyText('')
      setReplyAttach([])
    } catch (err) { notify.error(err.response?.data?.error || 'Failed to post reply') }
    finally { setSubmitting(false) }
  }

  const handleDeleteThread = async () => {
    const ok = await dialog.confirm({ title: 'Delete Thread', message: 'This thread and all its replies will be permanently deleted.', variant: 'danger', confirmLabel: 'DELETE' })
    if (!ok) return
    await api.delete(`/forum/threads/${id}`)
    navigate('/forum')
  }

  const handleDeleteReply = async (replyId) => {
    const ok = await dialog.confirm({ title: 'Delete Reply', message: 'This reply will be permanently deleted.', variant: 'danger', confirmLabel: 'DELETE' })
    if (!ok) return
    try {
      await api.delete(`/forum/replies/${replyId}`)
      setReplies(rs => rs.filter(r => r._id !== replyId))
      setThread(t => ({ ...t, replyCount: Math.max(0, (t.replyCount ?? t.reply_count ?? replies.length) - 1) }))
    } catch (err) { notify.error(err.response?.data?.error || 'Failed to delete reply') }
  }

  const handleEditReply = async (replyId) => {
    try {
      const r = await api.put(`/forum/replies/${replyId}`, { content: editText })
      setReplies(rs => rs.map(rp => rp._id === replyId ? r.data : rp))
      setEditingReply(null)
    } catch (err) { notify.error(err.response?.data?.error || 'Failed to edit reply') }
  }

  const handleEditThread = async () => {
    try {
      const r = await api.put(`/forum/threads/${id}`, { content: editThreadText })
      setThread(r.data)
      setEditingThread(false)
      notify.success('Thread updated')
    } catch (err) { notify.error(err.response?.data?.error || 'Failed to edit thread') }
  }

  if (loading) return <div className="page-container" style={{ zIndex: 1, position: 'relative' }}><div className="loader" /></div>
  if (!thread) return null

  const isAuthor = userId === (thread.author?._id || thread.author?.id)
  const isAdmin  = user?.role === 'admin' || user?.role === 'moderator'
  const replyTotal = thread.replyCount ?? thread.reply_count ?? replies.length
  const viewTotal = thread.views ?? 0
  const likeTotal = thread.likes?.length || 0
  const category = thread.category

  const postStyle = {
    display: 'flex', gap: 0,
  }

  return (
    <div className="page-container forum-thread-page" style={{ position: 'relative', zIndex: 1 }}>
      <div className="forum-thread-shell">

        {/* Breadcrumb */}
        <div className="forum-breadcrumb forum-thread-breadcrumb" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Link to="/forum" style={{ color: 'var(--muted)', textDecoration: 'none' }}>FORUM</Link>
          {category?.slug && (
            <>
              <span>/</span>
              <Link to={`/forum/category/${category.slug}`} style={{ color: category.color || 'var(--cyan)', textDecoration: 'none' }}>{category.icon} {category.name?.toUpperCase()}</Link>
            </>
          )}
          <span>/</span>
          <span style={{ color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>{thread.title}</span>
        </div>

        {/* Thread title */}
        <div className="forum-thread-hero">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
            {thread.pinned && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, padding: '3px 8px', background: 'rgba(0,255,136,0.1)', border: '1px solid rgba(0,255,136,0.3)', color: 'var(--green)' }}>📌 PINNED</span>}
            {thread.locked && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, padding: '3px 8px', background: 'rgba(255,71,87,0.1)', border: '1px solid rgba(255,71,87,0.3)', color: 'var(--red)' }}>🔒 LOCKED</span>}
          </div>
          <h1 className="forum-thread-title" style={{ fontFamily: 'var(--font-display)', fontWeight: 700, lineHeight: 1.12 }}>{thread.title}</h1>
          <div className="forum-thread-stats" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <span>{viewTotal} views</span>
            <span>{replyTotal} replies</span>
            <span>{likeTotal} likes</span>
          </div>
        </div>

        {/* Original post */}
        <div className="forum-thread-post forum-thread-post-original" style={postStyle} data-post-type="thread" data-thread-id={id} data-author-id={thread.author?._id || thread.author?.id}>
          <div style={{ display: 'none' }} className="user-col-wide"><UserCard author={thread.author} /></div>
          <div className="forum-thread-post-content" style={{ flex: 1 }}>
            {/* Mobile author row */}
            <div className="forum-thread-author-row" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Avatar user={thread.author} size={32} />
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{thread.author?.username}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--muted)', marginLeft: 'auto' }}>{timeAgo(thread.createdAt)}</div>
            </div>

            {editingThread ? (
              <div style={{ marginBottom: 20 }}>
                <textarea value={editThreadText} onChange={e => setEditThreadText(e.target.value)}
                  rows={8} style={{ width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--font-display)', fontSize: 15, padding: '10px 14px', outline: 'none', resize: 'vertical' }} />
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button onClick={handleEditThread} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, padding: '6px 14px', background: 'rgba(0,255,136,0.15)', border: '1px solid rgba(0,255,136,0.4)', color: 'var(--green)', cursor: 'pointer' }}>SAVE</button>
                  <button onClick={() => setEditingThread(false)} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, padding: '6px 14px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer' }}>CANCEL</button>
                </div>
              </div>
            ) : (
              <div className="forum-post-body" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginBottom: 20 }}>{thread.content}</div>
            )}

            {thread.attachments?.length > 0 && (
              <div className="forum-attachments">
                {thread.attachments.map((f, i) => <Attachment key={i} file={f} />)}
              </div>
            )}

            <div className="forum-post-actions" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              {/* Legacy like button */}
              <button onClick={handleLikeThread} style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-mono)', fontSize: 10, padding: '5px 12px', background: liked ? 'rgba(0,255,136,0.1)' : 'transparent', border: `1px solid ${liked ? 'rgba(0,255,136,0.4)' : 'var(--border)'}`, color: liked ? 'var(--green)' : 'var(--muted)', cursor: user ? 'pointer' : 'default' }}>
                ♥ {thread.likes?.length || 0}
              </button>

              {/* Emoji reactions */}
              {EMOJIS.map(emoji => (
                <button key={emoji} className={`reaction-btn${myThreadReactions.includes(emoji) ? ' active' : ''}`}
                  onClick={() => handleReact(emoji)}
                  aria-label={`React with ${emoji}`}
                  title={user ? `React with ${emoji}` : 'Log in to react'}
                  disabled={!user}
                >
                  {emoji}
                  {(threadReactions[emoji] || 0) > 0 && (
                    <span className="count">{threadReactions[emoji]}</span>
                  )}
                </button>
              ))}

              {/* Subscribe toggle */}
              {user && (
                <button onClick={handleSubscribe}
                  aria-label={subscribed ? 'Unsubscribe from this thread' : 'Subscribe to this thread'}
                  title={subscribed ? 'Unsubscribe — stop receiving reply notifications' : 'Subscribe — get notified on new replies'}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1,
                    padding: '5px 12px',
                    background: subscribed ? 'rgba(0,212,255,0.1)' : 'transparent',
                    border: `1px solid ${subscribed ? 'rgba(0,212,255,0.4)' : 'var(--border)'}`,
                    color: subscribed ? 'var(--cyan)' : 'var(--muted)',
                    cursor: 'pointer', transition: 'all 0.2s',
                  }}>
                  {subscribed ? '🔔 SUBSCRIBED' : '🔕 SUBSCRIBE'}
                </button>
              )}
              <div style={{ flex: 1 }} />
              {(isAuthor || isAdmin) && (
                <>
                  {isAdmin && (
                    <button onClick={() => api.put(`/forum/threads/${id}`, { pinned: !thread.pinned }).then(r => setThread(r.data))}
                      style={{ fontFamily: 'var(--font-mono)', fontSize: 9, padding: '4px 10px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer' }}>
                      {thread.pinned ? 'UNPIN' : '📌 PIN'}
                    </button>
                  )}
                  {isAdmin && (
                    <button onClick={() => api.put(`/forum/threads/${id}`, { locked: !thread.locked }).then(r => setThread(r.data))}
                      style={{ fontFamily: 'var(--font-mono)', fontSize: 9, padding: '4px 10px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer' }}>
                      {thread.locked ? '🔓 UNLOCK' : '🔒 LOCK'}
                    </button>
                  )}
                  <button onClick={handleDeleteThread}
                    style={{ fontFamily: 'var(--font-mono)', fontSize: 9, padding: '4px 10px', background: 'transparent', border: '1px solid rgba(255,71,87,0.3)', color: 'var(--red)', cursor: 'pointer' }}>
                    DELETE
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Replies */}
        {replies.length > 0 && (
          <div className="forum-replies-section">
            <div className="forum-replies-heading" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', letterSpacing: 2 }}>{replies.length} REPL{replies.length !== 1 ? 'IES' : 'Y'}</div>
            {replies.map((reply, idx) => {
              const isMyReply = userId === (reply.author?._id || reply.author?.id)
              const canEdit   = isMyReply || isAdmin
              return (
                <div key={reply._id} className="forum-thread-post forum-reply-post" style={{ ...postStyle, borderLeft: `3px solid ${idx % 2 === 0 ? 'rgba(0,212,255,0.24)' : 'rgba(0,255,136,0.18)'}` }}
                  data-post-type="reply" data-reply-id={reply._id} data-thread-id={id} data-author-id={reply.author?._id || reply.author?.id}>
                  <div className="forum-thread-post-content forum-reply-content" style={{ flex: 1 }}>
                    <div className="forum-thread-author-row" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <Avatar user={reply.author} size={28} />
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{reply.author?.username}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--muted)', marginLeft: 'auto' }}>{timeAgo(reply.createdAt)}{reply.edited && ' (edited)'}</span>
                    </div>

                    {editingReply === reply._id ? (
                      <div>
                        <textarea value={editText} onChange={e => setEditText(e.target.value)}
                          rows={4} style={{ width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--font-display)', fontSize: 15, padding: '10px 14px', outline: 'none', resize: 'vertical' }} />
                        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                          <button onClick={() => handleEditReply(reply._id)} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, padding: '6px 14px', background: 'rgba(0,255,136,0.15)', border: '1px solid rgba(0,255,136,0.4)', color: 'var(--green)', cursor: 'pointer' }}>SAVE</button>
                          <button onClick={() => setEditingReply(null)} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, padding: '6px 14px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer' }}>CANCEL</button>
                        </div>
                      </div>
                    ) : (
                      <div className="forum-post-body" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginBottom: 12 }}>{reply.content}</div>
                    )}

                    {reply.attachments?.length > 0 && (
                      <div className="forum-attachments forum-reply-attachments">
                        {reply.attachments.map((f, i) => <Attachment key={i} file={f} />)}
                      </div>
                    )}

                    <div className="forum-post-actions forum-reply-actions" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                      <button onClick={() => handleLikeReply(reply._id)}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'var(--font-mono)', fontSize: 9, padding: '4px 10px', background: reply._liked ? 'rgba(0,255,136,0.08)' : 'transparent', border: `1px solid ${reply._liked ? 'rgba(0,255,136,0.3)' : 'var(--border)'}`, color: reply._liked ? 'var(--green)' : 'var(--muted)', cursor: user ? 'pointer' : 'default' }}>
                        ♥ {reply.likes?.length || 0}
                      </button>
                      {canEdit && !editingReply && (
                        <>
                          <button onClick={() => { setEditingReply(reply._id); setEditText(reply.content) }}
                            style={{ fontFamily: 'var(--font-mono)', fontSize: 9, padding: '4px 10px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer' }}>EDIT</button>
                          <button onClick={() => handleDeleteReply(reply._id)}
                            style={{ fontFamily: 'var(--font-mono)', fontSize: 9, padding: '4px 10px', background: 'transparent', border: '1px solid rgba(255,71,87,0.3)', color: 'var(--red)', cursor: 'pointer' }}>DEL</button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Reply box */}
        {!thread.locked && user ? (
          <div className="forum-reply-box">
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--green)', letterSpacing: 2, marginBottom: 16 }}>POST A REPLY</div>
            <textarea ref={replyRef} value={replyText} onChange={e => setReplyText(e.target.value)}
              placeholder="Write your reply..."
              rows={5} style={{ width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--font-display)', fontSize: 15, padding: '12px 16px', outline: 'none', resize: 'vertical' }}
            />
            <AttachUploader onUploaded={setReplyAttach} />
            <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
              <button onClick={handleReply} disabled={submitting || !replyText.trim()}
                style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, padding: '10px 24px', background: 'var(--green)', color: '#000', border: 'none', cursor: replyText.trim() ? 'pointer' : 'not-allowed', opacity: submitting ? 0.7 : 1 }}>
                {submitting ? 'POSTING...' : 'POST REPLY'}
              </button>
            </div>
          </div>
        ) : !user ? (
          <div style={{ marginTop: 32, textAlign: 'center', padding: 40, background: 'var(--bg2)', border: '1px solid var(--border)', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--muted)' }}>
            <Link to="/login" style={{ color: 'var(--green)' }}>Log in</Link> or <Link to="/forum/register" style={{ color: 'var(--cyan)' }}>register</Link> to reply
          </div>
        ) : (
          <div style={{ marginTop: 32, textAlign: 'center', padding: 24, background: 'rgba(255,71,87,0.04)', border: '1px solid rgba(255,71,87,0.2)', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--red)' }}>
            🔒 This thread is locked
          </div>
        )}
      </div>
    </div>
  )
}
