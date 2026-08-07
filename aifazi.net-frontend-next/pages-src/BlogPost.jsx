'use client'
import { useState, useEffect, useRef } from 'react'
import { useParams, Link } from '@/lib/router-compat'
import NextImage from 'next/image'
import api, { mediaUrl } from '@/lib/api'
import DOMPurify from 'dompurify'
import PageMeta from '../components/PageMeta'
import { Slider } from '../core/ui.jsx'
import { getSupabase } from '@/lib/supabase'
import { useForum } from '../context/ForumContext'
import { Card, NeonButton, Badge, Avatar, RoleBadge, EmptyState } from '../components/community'
import { MediaAttachment } from '../components/MediaPreview'
import AuthorCard from '../components/AuthorCard'
import NewsletterCTA from '../components/NewsletterCTA'

// ── Smart Video Player ────────────────────────────────────────────────────────
function VideoPlayer({ src, title = '' }) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const [buffered, setBuffered] = useState(0)
  const videoRef = useRef(null)
  const containerRef = useRef(null)
  const hideTimer = useRef(null)

  // Detect type
  const ytMatch = src?.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/)
  const vimeoMatch = src?.match(/(?:vimeo\.com\/)(\d+)/)
  const isEmbed = ytMatch || vimeoMatch
  const embedSrc = ytMatch
    ? `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=0&rel=0&modestbranding=1`
    : vimeoMatch
    ? `https://player.vimeo.com/video/${vimeoMatch[1]}?color=00ff88&title=0&byline=0`
    : null

  const fmt = s => {
    if (!s || isNaN(s)) return '0:00'
    const m = Math.floor(s / 60), sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  const resetHideTimer = () => {
    setShowControls(true)
    clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => { if (isPlaying) setShowControls(false) }, 3000)
  }

  useEffect(() => () => clearTimeout(hideTimer.current), [])

  const togglePlay = () => {
    const v = videoRef.current; if (!v) return
    if (v.paused) { v.play(); setIsPlaying(true) } else { v.pause(); setIsPlaying(false) }
    resetHideTimer()
  }

  const handleTimeUpdate = () => {
    const v = videoRef.current; if (!v) return
    setCurrentTime(v.currentTime)
    setProgress(v.duration ? (v.currentTime / v.duration) * 100 : 0)
    if (v.buffered.length) setBuffered((v.buffered.end(v.buffered.length - 1) / v.duration) * 100)
  }

  const handleSeek = e => {
    const v = videoRef.current; if (!v) return
    const rect = e.currentTarget.getBoundingClientRect()
    v.currentTime = ((e.clientX - rect.left) / rect.width) * v.duration
  }

  const handleVolume = val => {
    setVolume(val); if (videoRef.current) videoRef.current.volume = val
    setMuted(val === 0)
  }

  const toggleMute = () => {
    const v = videoRef.current; if (!v) return
    v.muted = !muted; setMuted(!muted)
  }

  const toggleFullscreen = () => {
    const el = containerRef.current; if (!el) return
    if (!document.fullscreenElement) { el.requestFullscreen?.(); setFullscreen(true) }
    else { document.exitFullscreen?.(); setFullscreen(false) }
  }

  useEffect(() => {
    const handler = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  // Embed (YouTube / Vimeo)
  if (isEmbed) return (
    <div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%', margin: '2em 0', background: '#000', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)' }}>
      <iframe
        src={embedSrc}
        title={title || 'Video'}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
      />
    </div>
  )

  // Native video player
  return (
    <div
      ref={containerRef}
      onMouseMove={resetHideTimer}
      onMouseLeave={() => { if (isPlaying) setShowControls(false) }}
      style={{ position: 'relative', width: '100%', margin: '2em 0', background: '#000', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)', userSelect: 'none' }}
    >
      <video
        ref={videoRef}
        src={src}
        style={{ width: '100%', display: 'block', maxHeight: 500, background: '#000', cursor: 'pointer' }}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={e => setDuration(e.target.duration)}
        onEnded={() => { setIsPlaying(false); setShowControls(true) }}
        onClick={togglePlay}
        playsInline
      />

      {/* Big play button overlay */}
      {!isPlaying && (
        <div onClick={togglePlay} style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: 'rgba(0,0,0,0.35)' }}>
          <div className="blog-video-btn" style={{ width: 72, height: 72, borderRadius: '50%', background: 'color-mix(in srgb, var(--green) 90%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 40px color-mix(in srgb, var(--green) 40%, transparent)' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="#000" style={{ marginLeft: 4 }}><path d="M8 5v14l11-7z"/></svg>
          </div>
        </div>
      )}

      {/* Controls bar */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        background: 'linear-gradient(transparent, rgba(0,0,0,0.85))',
        padding: '20px 14px 10px',
        transition: 'opacity 0.25s',
        opacity: showControls ? 1 : 0,
        pointerEvents: showControls ? 'all' : 'none',
      }}>
        {/* Progress bar */}
        <div onClick={handleSeek} style={{ position: 'relative', height: 4, background: 'rgba(255,255,255,0.15)', borderRadius: 2, cursor: 'pointer', marginBottom: 10 }}>
          <div style={{ position: 'absolute', height: '100%', width: `${buffered}%`, background: 'rgba(255,255,255,0.25)', borderRadius: 2 }} />
          <div style={{ position: 'absolute', height: '100%', width: `${progress}%`, background: 'var(--green)', borderRadius: 2, transition: 'width 0.1s linear' }}>
            <div style={{ position: 'absolute', right: -5, top: '50%', transform: 'translateY(-50%)', width: 12, height: 12, borderRadius: '50%', background: 'var(--green)', boxShadow: '0 0 6px var(--green)' }} />
          </div>
        </div>

        {/* Buttons row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Play/Pause */}
          <button onClick={togglePlay} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fff', padding: 0, display: 'flex', alignItems: 'center' }}>
            {isPlaying
              ? <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
              : <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            }
          </button>

          {/* Volume */}
          <button onClick={toggleMute} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fff', padding: 0, display: 'flex', alignItems: 'center' }}>
            {muted || volume === 0
              ? <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>
              : volume < 0.5
              ? <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z"/></svg>
              : <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
            }
          </button>
          <Slider min={0} max={1} step={0.05} value={muted ? 0 : volume} onChange={handleVolume}
            style={{ width: 70 }} />

          {/* Time */}
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'rgba(255,255,255,0.8)', marginLeft: 4 }}>
            {fmt(currentTime)} / {fmt(duration)}
          </span>

          <div style={{ flex: 1 }} />

          {/* Fullscreen */}
          <button onClick={toggleFullscreen} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fff', padding: 0, display: 'flex', alignItems: 'center' }}>
            {fullscreen
              ? <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/></svg>
              : <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>
            }
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Extract video URL from post content or field ──────────────────────────────
function extractVideoUrl(content = '') {
  const ytMatch = content.match(/(?:https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11}))/)
  const vimeoMatch = content.match(/(?:https?:\/\/(?:www\.)?vimeo\.com\/(\d+))/)
  const directMatch = content.match(/src=["']([^"']+\.(?:mp4|webm|ogg)(?:\?[^"']*)?)['"]/i)
  const srcMatch = content.match(/<video[^>]+src=["']([^"']+)['"]/i)
  if (ytMatch) return ytMatch[0]
  if (vimeoMatch) return vimeoMatch[0]
  if (srcMatch) return srcMatch[1]
  if (directMatch) return directMatch[1]
  return null
}

const REACTIONS = [
  { emoji: '👍', label: 'Like' },
  { emoji: '🔥', label: 'Fire' },
  { emoji: '💡', label: 'Insightful' },
  { emoji: '❤️', label: 'Love' },
  { emoji: '🚀', label: 'Amazing' },
]

function readingTime(content = '', excerpt = '') {
  const words = ((content || '') + ' ' + (excerpt || '')).trim().split(/\s+/).filter(Boolean).length
  const mins = Math.max(1, Math.round(words / 200))
  return `${mins} min read`
}

function CoverHero({ src, title }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) return null
  return (
    <div className="blog-hero-cover">
      <NextImage
        src={mediaUrl(src)}
        alt={title}
        fill
        priority
        sizes="100vw"
        style={{ objectFit: 'cover', filter: 'brightness(0.55)' }}
        onError={() => setFailed(true)}
      />
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 45%, var(--bg) 100%)' }} />
    </div>
  )
}

// ── Server-persisted reactions ────────────────────────────────────────────────
function PostReactions({ slug, postId, initialReactions }) {
  const { user } = useForum()
  const [counts, setCounts] = useState({})
  const [myReactions, setMyReactions] = useState([])
  const [busy, setBusy] = useState(false)
  const [needLogin, setNeedLogin] = useState(false)
  const [burst, setBurst] = useState(null)

  const applySummary = (summary, mine) => {
    setCounts(summary || {})
    setMyReactions(mine || [])
  }

  const uid = user?._id || user?.id
  const [prevReactions, setPrevReactions] = useState(null)
  const [prevUid, setPrevUid] = useState(null)
  if (prevReactions !== initialReactions || prevUid !== uid) {
    setPrevReactions(initialReactions)
    setPrevUid(uid)
    const r = initialReactions
    if (r && typeof r === 'object' && !Array.isArray(r)) {
      const hasIds = Object.values(r).some(v => Array.isArray(v))
      if (hasIds) {
        const summary = {}
        const mine = []
        for (const [emoji, arr] of Object.entries(r)) {
          summary[emoji] = Array.isArray(arr) ? arr.length : arr
          if (uid && Array.isArray(arr) && arr.includes(uid)) mine.push(emoji)
        }
        applySummary(summary, mine)
      } else {
        applySummary(r, [])
      }
    } else {
      applySummary({}, [])
    }
  }

  const react = async (emoji) => {
    if (!user) { setNeedLogin(true); return }
    setBusy(true)
    try {
      const res = await api.post(`/blog/${slug}/react`, { emoji })
      applySummary(res.data.reactions, res.data.myReactions)
      setBurst(emoji)
      setTimeout(() => setBurst(null), 500)
    } catch (err) {
      if (err.response?.status === 401) setNeedLogin(true)
    } finally {
      setBusy(false)
    }
  }

  const total = Object.values(counts).reduce((a, b) => a + (b || 0), 0)

  return (
    <div style={{ marginTop: 48, paddingTop: 32, borderTop: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', letterSpacing: 2 }}>
          REACTIONS
        </span>
        {total > 0 && (
          <span className="community-badge community-badge-green">{total} total</span>
        )}
      </div>

      {needLogin && (
        <Card style={{ marginBottom: 20, textAlign: 'center', padding: 24 }}>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', marginBottom: 14 }}>
            Log in to react to this post
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <NeonButton to="/login" variant="primary" size="sm">Login</NeonButton>
            <NeonButton to="/forum/register" variant="ghost" size="sm">Register</NeonButton>
          </div>
        </Card>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {REACTIONS.map(({ emoji, label }) => {
          const count = counts[emoji] || 0
          const active = myReactions.includes(emoji)
          const popping = burst === emoji
          return (
            <button
              key={emoji}
              onClick={() => react(emoji)}
              disabled={busy}
              title={label}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 14px', border: '1px solid',
                borderColor: active ? 'var(--green)' : 'var(--border)',
                background: active ? 'color-mix(in srgb, var(--green) 8%, transparent)' : 'var(--bg2)',
                color: active ? 'var(--green)' : 'var(--muted)',
                fontFamily: 'var(--font-mono)', fontSize: 12,
                cursor: busy ? 'wait' : 'pointer', transition: 'all 0.2s',
                borderRadius: 10,
                transform: popping ? 'scale(1.25)' : 'scale(1)',
              }}
            >
              <span style={{ fontSize: 16 }}>{emoji}</span>
              {count > 0 && <span>{count}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Comments ──────────────────────────────────────────────────────────────────
function Comments({ slug, postId }) {
  const { user } = useForum()
  const [comments, setComments] = useState(null)
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [authPrompt, setAuthPrompt] = useState(false)

  const load = async () => {
    try {
      const res = await api.get(`/blog/comments/${slug}`)
      setComments(res.data || [])
    } catch {
      setComments([])
    }
  }

  useEffect(() => { void (async () => { await load() })() }, [slug])

  const submit = async (e) => {
    e.preventDefault()
    if (!user) { setAuthPrompt(true); return }
    if (!text.trim()) return
    setSubmitting(true)
    setError('')
    try {
      const res = await api.post(`/blog/comments/${slug}`, { content: text })
      setComments([...(comments || []), res.data])
      setText('')
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to post comment.')
    } finally {
      setSubmitting(false)
    }
  }

  const remove = async (comment) => {
    const isOwner = user && (comment.author?._id === (user._id || user.id))
    const isStaff = user && ['admin', 'moderator'].includes(user.role)
    if (!isOwner && !isStaff) return
    if (!window.confirm('Delete this comment?')) return
    try {
      await api.delete(`/blog/comments/${comment._id}`)
      setComments((comments || []).filter(c => c._id !== comment._id))
    } catch (err) {
      if (err.response?.status === 401) setAuthPrompt(true)
    }
  }

  const formatDate = d => {
    if (!d) return ''
    const dt = new Date(d)
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  return (
    <div style={{ marginTop: 56, paddingTop: 40, borderTop: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', letterSpacing: 2 }}>COMMENTS</span>
        {comments && comments.length > 0 && (
          <span className="community-badge community-badge-cyan">{comments.length}</span>
        )}
      </div>

      {authPrompt && (
        <Card style={{ marginBottom: 20, textAlign: 'center', padding: 24 }}>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', marginBottom: 14 }}>
            Log in to join the discussion
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <NeonButton to="/login" variant="primary" size="sm">Login</NeonButton>
            <NeonButton to="/forum/register" variant="ghost" size="sm">Register</NeonButton>
          </div>
        </Card>
      )}

      {/* Composer */}
      <form onSubmit={submit}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={user ? 'Share your thoughts...' : 'Log in to comment'}
            rows={3}
            maxLength={4000}
            style={{
              width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)',
              borderRadius: 12, color: 'var(--text)', fontFamily: 'var(--font-display)',
              fontSize: 15, padding: '14px 16px', resize: 'vertical', outline: 'none'
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)' }}>
              {text.length}/4000
            </span>
            <NeonButton type="submit" variant="primary" size="sm" disabled={submitting || !text.trim()}>
              {submitting ? 'Posting...' : 'Post Comment'}
            </NeonButton>
          </div>
          {error && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--red)' }}>{error}</div>}
        </div>
      </form>

      {/* List */}
      <div style={{ marginTop: 28 }}>
        {comments === null ? (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>Loading comments...</div>
        ) : comments.length === 0 ? (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>
            No comments yet — be the first to share your thoughts.
          </div>
        ) : (
          comments.map(comment => {
            const isOwner = user && (comment.author?._id === (user._id || user.id))
            const isStaff = user && ['admin', 'moderator'].includes(user.role)
            const canDelete = isOwner || isStaff
            return (
              <div key={comment._id} style={{
                border: '1px solid var(--border)', borderRadius: 14,
                background: 'rgba(255,255,255,0.015)', padding: 18, marginBottom: 14
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                  <Avatar user={comment.author} size={36} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ color: 'var(--text)', fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600 }}>
                        {comment.author?.username || 'Unknown'}
                      </span>
                      {comment.author?.role && <RoleBadge role={comment.author.role} />}
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', marginTop: 3 }}>
                      {formatDate(comment.createdAt)}
                    </div>
                  </div>
                  {canDelete && (
                    <button onClick={() => remove(comment)} style={{
                      background: 'none', border: '1px solid rgba(255,71,87,0.3)', borderRadius: 8,
                      color: 'var(--red)', fontFamily: 'var(--font-mono)', fontSize: 9,
                      letterSpacing: 1, padding: '6px 10px', cursor: 'pointer'
                    }}>DELETE</button>
                  )}
                </div>
                <p style={{ color: 'var(--text)', fontSize: 15, lineHeight: 1.7, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {comment.content}
                </p>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

// ── Related posts ─────────────────────────────────────────────────────────────
function RelatedPosts({ slug, currentId }) {
  const [related, setRelated] = useState(null)
  useEffect(() => {
    api.get(`/blog/${slug}/related?limit=3`).then(res => setRelated(res.data || [])).catch(() => setRelated([]))
  }, [slug])

  if (related === null) return null
  if (!related.length) return null
  const formatDate = d => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  return (
    <div style={{ marginTop: 64, paddingTop: 40, borderTop: '1px solid var(--border)' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', letterSpacing: 2, marginBottom: 20 }}>
        CONTINUE READING
      </div>
      <div className="related-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        {related.map(p => (
          <Link key={p.id} to={`/blog/${p.slug}`} style={{ textDecoration: 'none' }}>
            <Card hover style={{ height: '100%', padding: 20, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
                <Badge tone="cyan">{p.category}</Badge>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)' }}>{formatDate(p.created_at)}</span>
              </div>
              <div style={{ color: 'var(--text)', fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 600, lineHeight: 1.4, marginBottom: 10 }}>
                {p.title}
              </div>
              <div style={{ color: 'var(--green)', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2, marginTop: 'auto' }}>
                READ →
              </div>
            </Card>
          </Link>
        ))}
      </div>
      <style>{`
        .related-grid { grid-template-columns: repeat(3, 1fr); }
        @media (max-width: 1023px) { .related-grid { grid-template-columns: 1fr !important; } }
      `}</style>
    </div>
  )
}

// ── Inline document/media previews ────────────────────────────────────────────
// Scans the article HTML for links to files (pdf/word/excel/code/archives) and
// renders them as rich preview cards below the content.
function ContentMediaPreviews({ html }) {
  const [files, setFiles] = useState([])

  const [prevHtml, setPrevHtml] = useState(null)
  if (prevHtml !== html) {
    setPrevHtml(html)
    if (!html) {
      setFiles([])
    } else {
      const docExts = /\.(pdf|docx?|xlsx?|csv|pptx?|rtf|odt|ods|zip|rar|7z|tar|gz|js|jsx|ts|tsx|py|sh|bash|html?|css|json|yaml|yml|go|rs|java|c|cpp|h|cs|php|rb|swift|kt|sql|xml|toml|ini|md)(?:$|[?#])/i
      const seen = new Set()
      const found = []
      const links = Array.from(new DOMParser().parseFromString(html, 'text/html').querySelectorAll('a[href]'))
      for (const a of links) {
        const href = a.getAttribute('href') || ''
        const text = a.textContent?.trim() || href.split('/').pop() || 'file'
        if (!docExts.test(href)) continue
        const key = href
        if (seen.has(key)) continue
        seen.add(key)
        found.push({ url: href, original_name: text })
      }
      setFiles(found)
    }
  }

  if (!files.length) return null
  return (
    <div style={{ marginTop: 48, paddingTop: 40, borderTop: '1px solid var(--border)' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', letterSpacing: 2, marginBottom: 18 }}>
        FILES &amp; DOWNLOADS
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
        {files.map((f, i) => <MediaAttachment key={i} file={f} />)}
      </div>
    </div>
  )
}

export default function BlogPost({ initialPost }) {
  const { slug } = useParams()
  // ISR: when the server renders the page it passes the cached post body, so the
  // article is visible immediately. The client re-fetches to stay live (Realtime)
  // and to bump the view counter.
  const [post, setPost] = useState(initialPost || null)
  const [loading, setLoading] = useState(!initialPost)
  const [error, setError] = useState(null)
  const [scrollProgress, setScrollProgress] = useState(0)
  const [toc, setToc] = useState([])
  const [copied, setCopied] = useState(false)
  const contentRef = useRef(null)

  // #12 — Reading scroll progress bar
  useEffect(() => {
    const onScroll = () => {
      const el = document.documentElement
      const scrolled = el.scrollTop || document.body.scrollTop
      const total = el.scrollHeight - el.clientHeight
      setScrollProgress(total > 0 ? Math.min(100, (scrolled / total) * 100) : 0)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const fetchPost = async ({ quiet = false } = {}) => {
    try {
      const res = await api.get(`/blog/${slug}`)
      setPost(res.data)
      setError(null)
    } catch (err) {
      setError(err.response?.status === 404 ? 'Post not found.' : 'Failed to load post.')
    } finally {
      if (!quiet) setLoading(false)
    }
  }

  const [prevSlug, setPrevSlug] = useState(slug)
  if (prevSlug !== slug) {
    setPrevSlug(slug)
    if (initialPost && initialPost.slug === slug) {
      setLoading(false)
    } else {
      setLoading(true)
    }
  }

  useEffect(() => {
    // ISR-provided body already matches this slug — skip the initial fetch to
    // avoid a loader flash. Realtime (below) keeps edits in sync.
    if (initialPost && initialPost.slug === slug) return
    void (async () => { await fetchPost() })()
  }, [slug])

  useEffect(() => {
    if (!slug) return
    api.post(`/blog/${slug}/view`).catch(() => {})
  }, [slug])

  useEffect(() => {
    const sb = getSupabase()
    if (!sb || !slug) return
    const channel = sb
      .channel(`blog-post:${slug}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, payload => {
        const nextSlug = payload?.new?.slug || payload?.old?.slug
        if (nextSlug === slug || post?.id === payload?.new?.id || post?.id === payload?.old?.id) fetchPost({ quiet: true })
      })
      .subscribe()
    return () => { sb.removeChannel(channel) }
  }, [slug, post?.id])

  useEffect(() => {
    const root = contentRef.current
    if (!root) return
    const headings = Array.from(root.querySelectorAll('h2, h3'))
    const items = headings.map((heading, index) => {
      const text = heading.textContent?.trim() || `Section ${index + 1}`
      const id = heading.id || text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `section-${index + 1}`
      heading.id = id
      return { id, text, level: heading.tagName === 'H3' ? 3 : 2 }
    })
    setToc(items)
  }, [post?.content])

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {}
  }

  const formatDate = d => new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  if (loading) return <div className="page-container"><div className="loader" /></div>
  if (error) return (
    <div className="page-container" style={{ textAlign: 'center', padding: '160px 60px', position: 'relative', zIndex: 1 }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
      <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--red)', marginBottom: 24 }}>{error}</div>
      <NeonButton to="/blog" variant="ghost">← Back to Blog</NeonButton>
    </div>
  )

  const tags = typeof post.tags === 'string' ? JSON.parse(post.tags) : (post.tags || [])
  const sanitizedContent = DOMPurify.sanitize(post.content || '<p style="color:var(--muted)">No content yet.</p>', {
    ADD_TAGS: ['iframe'],
    ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'src', 'title'],
  })

  return (
    <div className="page-container" style={{ position: 'relative', zIndex: 1 }}>
      {/* #12 — Reading progress bar */}
      <div style={{
        position: 'fixed', top: 0, left: 0, zIndex: 9999,
        height: 2, width: `${scrollProgress}%`,
        background: 'linear-gradient(90deg, var(--green), var(--cyan))',
        transition: 'width 0.08s linear',
        pointerEvents: 'none',
      }} />
      <PageMeta
        title={post.title}
        description={post.excerpt || post.title}
        image={post.cover_image || undefined}
        url={`/blog/${post.slug}`}
        type="article"
        publishedTime={post.createdAt || post.created_at}
        tags={typeof post.tags === 'string' ? JSON.parse(post.tags) : (post.tags || [])}
      />
      <CoverHero src={post.cover_image} title={post.title} />

      <div className="blog-post-shell">
        {toc.length > 0 && (
          <aside className="blog-toc">
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 3, color: 'var(--muted)', marginBottom: 12 }}>ON THIS PAGE</div>
            {toc.map(item => (
              <a key={item.id} href={`#${item.id}`} className={`toc-link toc-l${item.level}`}>{item.text}</a>
            ))}
          </aside>
        )}

        <article className="blog-post-main">
        {/* Back link */}
        <Link to="/blog" className="blog-back-link" style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)',
          letterSpacing: 2, marginBottom: 40, textDecoration: 'none',
        }}
        >← BACK TO BLOG</Link>

        {/* Meta */}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', marginBottom: 24 }}>
          <Badge tone="cyan">{post.category}</Badge>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>
            {formatDate(post.created_at)}
          </span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>
            ⏱ {readingTime(post.content, post.excerpt)}
          </span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>
            👁 {post.views} views
          </span>
        </div>

        <div className="blog-actions">
          <button onClick={copyLink}>{copied ? 'COPIED' : 'COPY LINK'}</button>
          <a suppressHydrationWarning href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(typeof window !== 'undefined' ? window.location.href : '')}&text=${encodeURIComponent(post.title)}`} target="_blank" rel="noopener noreferrer">SHARE</a>
        </div>

        {/* Title */}
        <h1 style={{
          fontFamily: 'var(--font-display)', fontSize: 'clamp(32px, 5vw, 52px)',
          fontWeight: 700, letterSpacing: -1, lineHeight: 1.1, marginBottom: 24,
          color: 'var(--text)'
        }}>{post.title}</h1>

        {/* Excerpt */}
        {post.excerpt && (
          <p style={{
            fontSize: 18, color: 'var(--cyan)', lineHeight: 1.6,
            borderLeft: '3px solid var(--green)', paddingLeft: 20,
            marginBottom: 48, fontStyle: 'italic'
          }}>{post.excerpt}</p>
        )}

        {/* Video Player — shown if post has a video_url field or content contains a video */}
        {(() => {
          const videoSrc = post.video_url || extractVideoUrl(post.content || '')
          if (!videoSrc) return null
          return (
            <div style={{ marginBottom: 40 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', letterSpacing: 3, marginBottom: 12 }}>VIDEO</div>
              <VideoPlayer src={videoSrc} title={post.title} />
            </div>
          )
        })()}

        {/* Content */}
        <div ref={contentRef} style={{ color: 'var(--text)' }}
          dangerouslySetInnerHTML={{ __html: sanitizedContent }}
          className="post-content"
        />

        {/* Files & downloads extracted from content */}
        <ContentMediaPreviews html={post.content} />

        {/* Tags */}
        {tags.length > 0 && (
          <div style={{ marginTop: 60, paddingTop: 40, borderTop: '1px solid var(--border)' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', letterSpacing: 2, marginBottom: 16 }}>
              TAGS
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {tags.map(t => <span key={t} className="tag">{t}</span>)}
            </div>
          </div>
        )}

        {/* Author card */}
        <AuthorCard authorName={post.author_name} category={post.category} />

        {/* Reactions (server-persisted) */}
        <PostReactions slug={post.slug} postId={post._id || post.id} initialReactions={post.reactions} />

        {/* Comments */}
        <Comments slug={post.slug} postId={post._id || post.id} />

        {/* Related posts */}
        <RelatedPosts slug={post.slug} currentId={post.id} />

        {/* Newsletter CTA */}
        <NewsletterCTA />

        {/* Back to blog */}
        <div style={{ marginTop: 60 }}>
          <NeonButton to="/blog" variant="ghost">← Back to All Posts</NeonButton>
        </div>
        </article>
      </div>

      <style>{`
        .blog-hero-cover { width: 100%; height: clamp(220px, 38vh, 420px); overflow: hidden; position: relative; }
        .blog-post-shell {
          width: min(1180px, calc(100vw - 32px));
          margin: 0 auto;
          padding: ${post.cover_image ? '0 0 80px' : 'clamp(40px,8vw,80px) 0 80px'};
          display: grid;
          grid-template-columns: minmax(0, 1fr) 220px;
          gap: clamp(24px, 4vw, 56px);
          align-items: start;
        }
        .blog-post-main { max-width: 820px; min-width: 0; }
        .blog-toc {
          position: sticky; top: 96px; order: 2;
          border-left: 1px solid var(--border); padding-left: 16px;
          max-height: calc(100vh - 120px); overflow: auto;
        }
        .toc-link { display: block; color: var(--muted); text-decoration: none; font-family: var(--font-mono); font-size: 10px; line-height: 1.5; margin-bottom: 10px; }
        .toc-link:hover { color: var(--green); }
        .toc-l3 { padding-left: 12px; opacity: 0.82; }
        .blog-actions { display: flex; gap: 10px; flex-wrap: wrap; margin: -8px 0 28px; }
        .blog-actions button, .blog-actions a {
          font-family: var(--font-mono); font-size: 10px; letter-spacing: 2px;
          padding: 8px 12px; border: 1px solid var(--border); background: var(--bg2);
          color: var(--muted); text-decoration: none; cursor: pointer;
          border-radius: 8px;
        }
        .blog-actions button:hover, .blog-actions a:hover { color: var(--green); border-color: color-mix(in srgb, var(--green) 35%, transparent); }
        .post-content { line-height: 1.8; font-size: 17px; }
        .post-content h1, .post-content h2, .post-content h3 {
          font-family: var(--font-display); font-weight: 700; margin: 2em 0 0.75em;
          color: var(--text); letter-spacing: -0.5px;
        }
        .post-content h2 { font-size: 28px; color: var(--cyan); }
        .post-content h3 { font-size: 22px; }
        .post-content p { margin-bottom: 1.5em; color: var(--text); }
        .post-content a { color: var(--green); }
        .post-content .blog-media-doc a {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 10px 16px; border: 1px solid color-mix(in srgb, var(--cyan) 30%, transparent);
          border-radius: 10px; background: color-mix(in srgb, var(--cyan) 6%, transparent);
          color: var(--cyan); text-decoration: none; font-family: var(--font-mono);
          font-size: 12px;
        }
        .post-content .blog-media-doc a::before { content: "📎 "; }
        .post-content .blog-media-doc a:hover { border-color: var(--green); color: var(--green); }
        .post-content code {
          font-family: var(--font-mono); font-size: 13px;
          background: var(--bg3); border: 1px solid var(--border);
          padding: 2px 8px; border-radius: 4px; color: var(--cyan);
        }
        .post-content pre {
          background: var(--bg3); border: 1px solid var(--border);
          padding: 24px; overflow-x: auto; margin: 1.5em 0; border-radius: 12px;
        }
        .post-content pre code {
          background: none; border: none; padding: 0; font-size: 14px; line-height: 1.6;
        }
        .post-content blockquote {
          border-left: 3px solid var(--green); padding-left: 20px;
          margin: 1.5em 0; color: var(--muted); font-style: italic;
        }
        .post-content img { width: 100%; border-radius: 4px; margin: 1.5em 0; }
        .post-content video { width: 100%; border-radius: 4px; margin: 1.5em 0; display: none; }
        .post-content figure { margin: 1.5em 0; }
        .post-content figure img { margin: 0; }
        .post-content iframe { max-width: 100%; border-radius: 4px; }
        .post-content div[style*="padding-bottom:56.25%"] { width: 100% !important; }
        .post-content div[style*="padding-bottom: 56.25%"] { width: 100% !important; }
        @media (max-width: 640px) {
          .post-content { font-size: 15px; }
          .post-content h2 { font-size: 22px; }
          .post-content h3 { font-size: 18px; }
          .post-content pre { padding: 14px; font-size: 12px; }
        }
        .post-content ul, .post-content ol { padding-left: 24px; margin-bottom: 1.5em; }
        .post-content li { margin-bottom: 0.5em; color: var(--text); }
        .post-content hr { border: none; border-top: 1px solid var(--border); margin: 2em 0; }
        .post-content table { width: 100%; border-collapse: collapse; margin-bottom: 1.5em; }
        .post-content th { background: var(--bg3); padding: 12px; border: 1px solid var(--border); color: var(--cyan); font-family: var(--font-mono); font-size: 12px; }
        .post-content td { padding: 12px; border: 1px solid var(--border); }
        @media (max-width: 1024px) {
          .blog-post-shell { grid-template-columns: 1fr; width: min(860px, calc(100vw - 24px)); }
          .blog-toc { position: static; order: 0; border-left: 0; border: 1px solid var(--border); padding: 14px; max-height: none; }
          .blog-post-main { max-width: none; }
        }
        @media (max-width: 640px) {
          .blog-post-shell { width: calc(100vw - 24px); padding-bottom: 56px; }
          .blog-hero-cover { height: 210px; }
        }
      `}</style>
    </div>
  )
}
