'use client'
import { useState, useEffect, useRef } from 'react'
import { Link, useParams, useNavigate } from '@/lib/router-compat'
import api from '@/lib/api'
import { useForum } from '../context/ForumContext'
import { dialog } from '../core/dialog.jsx'
import { notify } from '../core/notify.jsx'
import { Card, Badge, NeonButton, Avatar, RoleBadge, timeAgo } from '../components/community'
import { MediaAttachment, MediaUploader } from '../components/MediaPreview'

const EMOJIS = ['👍', '❤️', '🔥', '😂', '😮']

function Attachment({ file }) {
  return <MediaAttachment file={file} />
}

function Reactions({ reactions, myReactions, onReact, disabled, size = 'md' }) {
  const summary = reactions || {}
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {EMOJIS.map(emoji => (
        <button
          key={emoji}
          onClick={() => onReact(emoji)}
          disabled={disabled}
          aria-label={`React with ${emoji}`}
          title={disabled ? 'Log in to react' : `React with ${emoji}`}
          className={`reaction-btn${myReactions?.includes(emoji) ? ' active' : ''} reaction-btn-${size}`}
        >
          <span style={{ fontSize: size === 'lg' ? 17 : 14 }}>{emoji}</span>
          {(summary[emoji] || 0) > 0 && <span className="count">{summary[emoji]}</span>}
        </button>
      ))}
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
  const [replyReactions, setReplyReactions]       = useState({})
  const [myReplyReactions, setMyReplyReactions]   = useState({})
  const [subscribed, setSubscribed]             = useState(false)
  const replyRef = useRef(null)

  const userId = user?._id?.toString() || user?.id?.toString() || null

  useEffect(() => {
    api.get(`/forum/threads/${id}`)
      .then(r => {
        setThread(r.data.thread)
        const rs = r.data.replies || []
        setReplies(rs)
        if (userId) setLiked(r.data.thread.likes?.includes(userId))
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
        // Reply reactions
        const rSummary = {}
        const rMine = {}
        rs.forEach(reply => {
          const rm = reply.reactions || {}
          const s = {}
          const m = []
          EMOJIS.forEach(e => {
            const list = rm[e] || []
            s[e] = list.length
            if (userId && list.includes(userId)) m.push(e)
          })
          rSummary[reply._id] = s
          rMine[reply._id] = m
        })
        setReplyReactions(rSummary)
        setMyReplyReactions(rMine)
        setSubscribed(r.data.thread.subscribers?.some(s => s?.toString() === userId))
      })
      .catch(() => navigate('/forum'))
      .finally(() => setLoading(false))
  }, [id])

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

  const handleReactReply = async (replyId, emoji) => {
    if (!userId || !replyId) return
    try {
      const r = await api.post(`/forum/replies/${replyId}/react`, { emoji })
      setReplyReactions(prev => ({ ...prev, [replyId]: r.data.reactions }))
      setMyReplyReactions(prev => ({ ...prev, [replyId]: r.data.myReactions }))
    } catch (err) {
      console.error('Reply react failed:', err.response?.data?.error || err.message)
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
    if (!user || !replyId) return
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

  if (loading) return <div className="page-container community-page" style={{ zIndex: 1, position: 'relative' }}>
    <div className="forum-thread-loading">
      <div className="store-skeleton" style={{ width: '60%', height: 32, marginBottom: 16 }} />
      <div className="store-skeleton" style={{ width: '40%', height: 14, marginBottom: 32 }} />
      <div className="store-skeleton" style={{ width: '100%', height: 80, marginBottom: 14 }} />
      {Array.from({ length: 3 }).map((_, i) => (
        <div className="store-skeleton" key={i} style={{ width: '100%', height: 44, marginBottom: 10 }} />
      ))}
    </div>
  </div>
  if (!thread) return (
    <div className="page-container community-page" style={{ zIndex: 1, position: 'relative' }}>
      <div className="forum-thread-empty">
        <div className="forum-thread-empty-icon">🔍</div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, color: 'var(--text)', margin: '0 0 8px' }}>Thread not found</h2>
        <p style={{ color: 'var(--muted)', fontSize: 13, fontFamily: 'var(--font-mono)', marginBottom: 20 }}>It may have been deleted or moved.</p>
        <Link to="/forum" style={{ display: 'inline-block', padding: '10px 22px', background: 'var(--green)', color: 'var(--bg)', borderRadius: 8, textDecoration: 'none', fontWeight: 700, fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2 }}>← BACK TO FORUM</Link>
      </div>
    </div>
  )

  const isAuthor = userId === (thread.author?._id || thread.author?.id)
  const isAdmin  = user?.role === 'admin' || user?.role === 'moderator'
  const replyTotal = thread.replyCount ?? thread.reply_count ?? replies.length
  const viewTotal = thread.views ?? 0
  const likeTotal = thread.likes?.length || 0
  const category = thread.category

  return (
    <div className="page-container forum-thread-page community-page" style={{ position: 'relative', zIndex: 1 }}>
      <div className="community-shell">

        {/* Breadcrumb */}
        <div className="forum-breadcrumb" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 20 }}>
          <Link to="/forum" style={{ color: 'var(--muted)', textDecoration: 'none' }}>FORUM</Link>
          {category?.slug && (
            <>
              <span>/</span>
              <Link to={`/forum/category/${category.slug}`} style={{ color: category.color || 'var(--cyan)', textDecoration: 'none' }}>{category.icon} {category.name?.toUpperCase()}</Link>
            </>
          )}
          <span>/</span>
          <span style={{ color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>{thread.title}</span>
        </div>

        {/* Thread hero */}
        <Card accent style={{ padding: 'clamp(24px, 4vw, 40px)', marginBottom: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
            {thread.pinned && <Badge tone="green" glow>📌 Pinned</Badge>}
            {thread.locked && <Badge tone="red">🔒 Locked</Badge>}
            {category?.name && <Badge tone="cyan">{category.icon} {category.name}</Badge>}
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, lineHeight: 1.12, fontSize: 'clamp(26px, 4.5vw, 46px)', color: 'var(--text)', margin: '0 0 16px' }}>{thread.title}</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Avatar user={thread.author} size={34} />
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{thread.author?.username}</div>
                <RoleBadge role={thread.author?.role} />
              </div>
            </div>
            <div style={{ flex: 1 }} />
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <span className="forum-thread-stats-chip">👁 {viewTotal}</span>
              <span className="forum-thread-stats-chip">💬 {replyTotal}</span>
              <span className="forum-thread-stats-chip">♥ {likeTotal}</span>
            </div>
          </div>
        </Card>

        {/* Original post */}
        <Card className="forum-thread-post forum-thread-post-original" style={{ padding: 'clamp(20px, 3vw, 30px)', marginBottom: 10 }}
          data-post-type="thread" data-thread-id={id} data-author-id={thread.author?._id || thread.author?.id}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
            <Avatar user={thread.author} size={40} />
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{thread.author?.username}</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <RoleBadge role={thread.author?.role} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)' }}>{timeAgo(thread.createdAt)}</span>
              </div>
            </div>
            <div style={{ flex: 1 }} />
            {(isAuthor || isAdmin) && (
              <NeonButton variant="ghost" size="sm" onClick={() => { setEditingThread(true); setEditThreadText(thread.content || '') }}>Edit</NeonButton>
            )}
          </div>

          {editingThread ? (
            <div style={{ marginBottom: 20 }}>
              <textarea value={editThreadText} onChange={e => setEditThreadText(e.target.value)}
                rows={8} style={{ width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontFamily: 'var(--font-display)', fontSize: 15, padding: '10px 14px', outline: 'none', resize: 'vertical' }} />
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <NeonButton variant="outline-green" size="sm" onClick={handleEditThread}>Save</NeonButton>
                <NeonButton variant="ghost" size="sm" onClick={() => setEditingThread(false)}>Cancel</NeonButton>
              </div>
            </div>
          ) : (
            <div className="forum-post-body" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginBottom: 20, fontSize: 15, lineHeight: 1.75, color: 'var(--text)', maxWidth: '82ch' }}>{thread.content}</div>
          )}

          {thread.attachments?.length > 0 && (
            <div className="forum-attachments">
              {thread.attachments.map((f, i) => <Attachment key={i} file={f} />)}
            </div>
          )}

          <div className="forum-post-actions" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border2)' }}>
            <Reactions reactions={threadReactions} myReactions={myThreadReactions} onReact={handleReact} disabled={!user} size="lg" />

            {user && (
              <NeonButton variant="ghost" size="sm" onClick={handleSubscribe} style={{ color: subscribed ? 'var(--cyan)' : undefined, borderColor: subscribed ? 'color-mix(in srgb, var(--cyan) 40%, transparent)' : undefined }}>
                {subscribed ? '🔔 Subscribed' : '🔔 Subscribe'}
              </NeonButton>
            )}
            <div style={{ flex: 1 }} />
            {(isAuthor || isAdmin) && (
              <>
                {isAdmin && <NeonButton variant="ghost" size="sm" onClick={() => api.put(`/forum/threads/${id}`, { pinned: !thread.pinned }).then(r => setThread(r.data))}>{thread.pinned ? 'Unpin' : '📌 Pin'}</NeonButton>}
                {isAdmin && <NeonButton variant="ghost" size="sm" onClick={() => api.put(`/forum/threads/${id}`, { locked: !thread.locked }).then(r => setThread(r.data))}>{thread.locked ? '🔓 Unlock' : '🔒 Lock'}</NeonButton>}
                <NeonButton variant="danger" size="sm" onClick={handleDeleteThread}>Delete</NeonButton>
              </>
            )}
          </div>
        </Card>

        {/* Replies */}
        {replies.length > 0 && (
          <div className="forum-replies-section" style={{ marginTop: 26 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', letterSpacing: 2, marginBottom: 14 }}>
              {replies.length} REPL{replies.length !== 1 ? 'IES' : 'Y'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {replies.map((reply, idx) => {
                const isMyReply = userId === (reply.author?._id || reply.author?.id)
                const canEdit   = isMyReply || isAdmin
                return (
                  <Card key={reply._id} className="forum-reply-post" style={{ padding: '22px 26px' }}
                    data-post-type="reply" data-reply-id={reply._id} data-thread-id={id} data-author-id={reply.author?._id || reply.author?.id}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
                      <Avatar user={reply.author} size={34} />
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{reply.author?.username}</span>
                          <RoleBadge role={reply.author?.role} />
                        </div>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)' }}>{timeAgo(reply.createdAt)}{reply.edited && ' (edited)'}</span>
                      </div>
                      <div style={{ flex: 1 }} />
                      {canEdit && !editingReply && (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <NeonButton variant="ghost" size="sm" onClick={() => { setEditingReply(reply._id); setEditText(reply.content) }}>Edit</NeonButton>
                          <NeonButton variant="danger" size="sm" onClick={() => handleDeleteReply(reply._id)}>Del</NeonButton>
                        </div>
                      )}
                    </div>

                    {editingReply === reply._id ? (
                      <div>
                        <textarea value={editText} onChange={e => setEditText(e.target.value)}
                          rows={4} style={{ width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontFamily: 'var(--font-display)', fontSize: 15, padding: '10px 14px', outline: 'none', resize: 'vertical' }} />
                        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                          <NeonButton variant="outline-green" size="sm" onClick={() => handleEditReply(reply._id)}>Save</NeonButton>
                          <NeonButton variant="ghost" size="sm" onClick={() => setEditingReply(null)}>Cancel</NeonButton>
                        </div>
                      </div>
                    ) : (
                      <div className="forum-post-body" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginBottom: 14, fontSize: 15, lineHeight: 1.75, color: 'var(--text)' }}>{reply.content}</div>
                    )}

                    {reply.attachments?.length > 0 && (
                      <div className="forum-attachments forum-reply-attachments">
                        {reply.attachments.map((f, i) => <Attachment key={i} file={f} />)}
                      </div>
                    )}

                    <div className="forum-post-actions" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border2)' }}>
                      <Reactions reactions={replyReactions[reply._id]} myReactions={myReplyReactions[reply._id]} onReact={e => handleReactReply(reply._id, e)} disabled={!user} />
                    </div>
                  </Card>
                )
              })}
            </div>
          </div>
        )}

        {/* Reply box */}
        {!thread.locked && user ? (
          <Card style={{ padding: 'clamp(20px, 3vw, 30px)', marginTop: 34 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--green)', letterSpacing: 2, marginBottom: 16 }}>POST A REPLY</div>
            <textarea ref={replyRef} value={replyText} onChange={e => setReplyText(e.target.value)}
              placeholder="Write your reply..."
              rows={5} style={{ width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontFamily: 'var(--font-display)', fontSize: 15, padding: '12px 16px', outline: 'none', resize: 'vertical' }}
            />
            <MediaUploader onUploaded={setReplyAttach} />
            <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
              <NeonButton variant="primary" size="md" onClick={handleReply} disabled={submitting || !replyText.trim()}>
                {submitting ? 'Posting...' : 'Post Reply'}
              </NeonButton>
            </div>
          </Card>
        ) : !user ? (
          <Card style={{ marginTop: 32, textAlign: 'center', padding: 40 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>
              Log in to join the conversation
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <NeonButton to="/login" variant="primary" size="sm">Login</NeonButton>
              <NeonButton to="/forum/register" variant="ghost" size="sm">Register</NeonButton>
            </div>
          </Card>
        ) : (
          <Card style={{ marginTop: 32, textAlign: 'center', padding: 28 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--red)' }}>🔒 This thread is locked</div>
          </Card>
        )}
      </div>
    </div>
  )
}
