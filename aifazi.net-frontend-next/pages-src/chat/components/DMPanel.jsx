'use client'
// DMPanel — user-facing 1:1 direct messages for the web chat.
// Mirrors the mobile DM experience: thread list + conversation view with
// encryption-at-rest, typing presence, read receipts, media/voice notes and
// best-effort Supabase Realtime streaming (falls back to polling, which is the
// source of truth since dm_* tables have no anon RLS policy).
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import api, { getUsername } from '@/lib/api'
import { T, ENCRYPTED_PREFIX, fmt, beep } from '../chat-constants'
import { encryptText, decryptText, isEncrypted, setRoomKeyModule } from '../chat-encryption'
import { Avatar } from './Avatar'
import { RolePill } from './RolePill'
import { Markdown } from './Markdown'
import { MediaPreviews } from './MediaPreview'
import { MediaViewer } from './MediaViewer'
import { DMCallBar } from './DMCallBar'
import { parseCallInvite, normalizeTypingActivity, typingSummary } from '@fazi/shared'

const LIST_POLL = 15000
const MSG_POLL = 4000
const TYP_POLL = 3000

function online(peerLastSeen) {
  if (!peerLastSeen) return false
  const t = new Date(peerLastSeen).getTime()
  if (Number.isNaN(t)) return false
  return Date.now() - t < 5 * 60 * 1000
}

export default function DMPanel({ me, onClose }) {
  const [threads, setThreads] = useState([])
  const [threadId, setThreadId] = useState(null)
  const [peer, setPeer] = useState('')
  const [msgs, setMsgs] = useState([])
  const [key, setKey] = useState('')
  const [input, setInput] = useState('')
  const [typing, setTyping] = useState([])
  const [peerLastRead, setPeerLastRead] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [editing, setEditing] = useState(null)
  const [replyTo, setReplyTo] = useState(null)
  const [recording, setRecording] = useState(false)
  const [recSecs, setRecSecs] = useState(0)
  const [playingId, setPlayingId] = useState(null)
  const [mediaViewer, setMediaViewer] = useState(null)
  const [inCall, setInCall] = useState(false)
  const listRef = useRef(null)
  const fileRef = useRef(null)
  const recRef = useRef(null)
  const recTimer = useRef(null)
  const recDur = useRef(0)
  const stickRef = useRef(true)
  const typingSent = useRef(false)
  const isTyping = useRef(false)

  const decrypt = useCallback((text) => (isEncrypted(text) && key ? Promise.resolve(decryptText(text.slice(ENCRYPTED_PREFIX.length), key)) : Promise.resolve(text)), [key])

  // ── Thread list ─────────────────────────────────────────────────────────
  const loadThreads = useCallback(() => {
    api.get('/chat/dm/threads').then(r => setThreads(Array.isArray(r.data) ? r.data : [])).catch(() => {})
  }, [])

  useEffect(() => {
    loadThreads()
    // P2 — pause polls while the tab is hidden (usePausableInterval equivalent).
    const iv = setInterval(() => { if (!document.hidden) loadThreads() }, LIST_POLL)
    return () => clearInterval(iv)
  }, [loadThreads])

  const loadMsgs = useCallback(async (id) => {
    try {
      const r = await api.get(`/chat/dm/threads/${id}/messages?limit=100`)
      const payload = r.data || {}
      const rows = Array.isArray(payload) ? payload : payload.messages || []
      setMsgs(rows)
      setPeerLastRead(payload.read_state?.[payload.peer || ''] || '')
    } catch {}
    finally { setLoading(false) }
  }, [])

  // ── Open a thread: key + messages + realtime + typing ───────────────────
  const openThread = useCallback(async (t) => {
    setThreadId(t.id); setPeer(t.peer); setMsgs([]); setLoading(true); setTyping([])
    setPeerLastRead(''); setInput(''); setEditing(null); setReplyTo(null); stickRef.current = true
    try {
      const kr = await api.get(`/chat/dm/threads/${t.id}/encryption-key`)
      const threadKey = kr.data?.encryption_key || ''
      setKey(threadKey)
      setRoomKeyModule(threadKey)
    } catch { setKey(''); setRoomKeyModule('') }
    loadMsgs(t.id)
  }, [loadMsgs])

  useEffect(() => {
    if (!threadId) return
    const iv = setInterval(() => { if (!document.hidden) loadMsgs(threadId) }, MSG_POLL) // P2 — pause while tab hidden
    return () => clearInterval(iv)
  }, [threadId, loadMsgs])

  useEffect(() => {
    if (!threadId) return
    const pollTyping = () => {
      if (document.hidden) return // P2 — pause while tab hidden
      api.get(`/chat/dm/threads/${threadId}/typing`).then(r => setTyping(Array.isArray(r.data) ? r.data.map(normalizeTypingActivity) : [])).catch(() => {})
    }
    pollTyping()
    const iv = setInterval(pollTyping, TYP_POLL)
    return () => clearInterval(iv)
  }, [threadId])

  // Best-effort realtime: postgres_changes won't fire for anon keys on dm_*
  // (no RLS), so this is a no-op that degrades gracefully to polling above.
  useEffect(() => {
    if (!threadId || !supabase) return
    const ch = supabase
      .channel(`dm:${threadId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'dm_messages', filter: `thread_id=eq.${threadId}` },
        (payload) => { setMsgs(prev => [...prev.filter(m => m.id !== payload.new.id), payload.new]); beep() })
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [threadId])

  // Scroll to bottom when a new message arrives if we were pinned there.
  useEffect(() => {
    if (stickRef.current && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [msgs.length])

  const onScroll = () => {
    if (!listRef.current) return
    const el = listRef.current
    stickRef.current = el.scrollHeight - (el.scrollTop + el.clientHeight) < 80
  }

  // ── Send / edit / delete / react ────────────────────────────────────────
  const send = async (e) => {
    if (e) e.preventDefault()
    const txt = input.trim()
    if (!txt || !threadId) return
    const encrypted = key ? ENCRYPTED_PREFIX + await encryptText(txt, key) : txt
    setInput(''); setReplyTo(null); setSending(true)
    try {
      await api.post(`/chat/dm/threads/${threadId}/messages`, {
        content: encrypted, type: 'text',
        reply_to: replyTo ? { id: replyTo.id, sender: replyTo.sender, content: replyTo.content } : null,
      })
      loadMsgs(threadId); loadThreads()
    } catch (err) {
      setInput(txt)
      alert(err.response?.data?.detail || 'Send failed')
    } finally { setSending(false) }
  }

  const heartbeat = (activity = 'typing') => {
    if (!threadId) return
    if (activity === 'typing' && isTyping.current) return
    if (activity === 'typing') {
      isTyping.current = true
      typingSent.current = setTimeout(() => { isTyping.current = false }, 2500)
    }
    api.post(`/chat/dm/threads/${threadId}/typing`, { activity }).catch(() => {})
  }
  useEffect(() => () => { if (typingSent.current) clearTimeout(typingSent.current) }, [])

  const onInput = (e) => { setInput(e.target.value); if (e.target.value.trim()) heartbeat() }

  const delMsg = async (id) => {
    if (!confirm('Delete this message?')) return
    try { await api.delete(`/chat/dm/messages/${id}`); loadMsgs(threadId) } catch {}
  }
  const react = async (id, emoji) => {
    try { await api.patch(`/chat/dm/messages/${id}/react`, { emoji }); loadMsgs(threadId) } catch {}
  }
  const saveEdit = async (id, content) => {
    const encrypted = key ? ENCRYPTED_PREFIX + await encryptText(content, key) : content
    try { await api.patch(`/chat/dm/messages/${id}`, { content: encrypted }); setEditing(null); loadMsgs(threadId) } catch {}
  }

  // ── DM call: redirect to Nextcloud Talk ─────────────────────────────────
  const startCall = async () => {
    window.open(process.env.NEXT_PUBLIC_TALK_URL || 'https://nextcloud.aifazi.net/apps/spreed', '_blank')
  }

  const parseCall = (m) => parseCallInvite(m.content)

  // ── Media / voice upload ────────────────────────────────────────────────
  const uploadMsg = async (file, type, extra = {}) => {
    if (!threadId || !file) return
    heartbeat(type === 'voice' ? 'voice' : (file.type?.startsWith('image/') ? 'image' : 'file'))
    setSending(true)
    try {
      const form = new FormData(); form.append('file', file)
      const up = await api.post(`/upload/chat?thread_id=${threadId}`, form, { headers: { 'Content-Type': 'multipart/form-data' } })
      await api.post(`/chat/dm/threads/${threadId}/messages`, {
        content: up.data.url, type, file_name: file.name || 'file',
        file_size: String(file.size || up.data?.size || 0), ...extra,
      })
      loadMsgs(threadId); loadThreads()
    } catch (err) { alert(err.response?.data?.detail || 'Upload failed') }
    finally { setSending(false); if (fileRef.current) fileRef.current.value = '' }
  }

  const startRec = async () => {
    heartbeat('voice')
    if (!navigator.mediaDevices?.getUserMedia) { alert('Recording not supported in this browser'); return }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream)
      const chunks = []
      mr.ondataavailable = ev => { if (ev.data.size) chunks.push(ev.data) }
      mr.onstop = () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(chunks, { type: mr.mimeType || 'audio/webm' })
        const file = new File([blob], 'voice.webm', { type: blob.type })
        uploadMsg(file, 'voice', { duration: String(Math.max(1, Math.round(recDur.current))) })
      }
      recRef.current = mr
      recDur.current = 0; setRecSecs(0); setRecording(true)
      mr.start()
      recTimer.current = setInterval(() => { recDur.current += 1; setRecSecs(s => s + 1) }, 1000)
    } catch { alert('Microphone access denied') }
  }
  const stopRec = () => {
    if (recRef.current) { try { recRef.current.stop() } catch {} recRef.current = null }
    if (recTimer.current) clearInterval(recTimer.current)
    setRecording(false)
  }

  const togglePlay = (m) => {
    if (playingId === m.id) { const el = document.getElementById(`voice-${m.id}`); if (el) { el.pause(); setPlayingId(null) }; return }
    setPlayingId(m.id)
    setTimeout(() => {
      const el = document.getElementById(`voice-${m.id}`)
      if (el) { el.play().catch(() => {}); el.onended = () => setPlayingId(null) }
    }, 50)
  }

  const mine = (m) => m.sender === me
  const typLabel = typing.length ? typingSummary(typing) : null

  const thread = threads.find(t => t.id === threadId)

  // ── Render: left thread list + right conversation ───────────────────────
  return (
    <>
      {mediaViewer && <MediaViewer media={mediaViewer} onClose={()=>setMediaViewer(null)} />}
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden', background: T.main, minWidth: 0 }}>
      {/* Thread list */}
      <div style={{ width: 230, flexShrink: 0, background: T.sidebar, borderRight: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '12px 14px 10px', borderBottom: `1px solid ${T.border}`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: T.mono, fontSize: 11, letterSpacing: 3, color: T.muted }}>DIRECT MESSAGES</span>
          <button onClick={onClose} style={{ padding: '2px 7px', border: `1px solid ${T.border}`, borderRadius: 6, background: 'transparent', color: T.muted, cursor: 'pointer', fontSize: 12 }} aria-label="Close">✕</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '6px 8px' }}>
          {threads.length === 0 && <div style={{ padding: 14, fontFamily: T.mono, fontSize: 11, color: T.muted, textAlign: 'center' }}>No conversations yet.</div>}
          {threads.map(t => {
            const act = t.id === threadId
            const on = online(t.peer_last_seen)
            return (
              <button key={t.id} onClick={() => openThread(t)} className={act ? 'chat-dm-thread chat-dm-thread-active' : 'chat-dm-thread'}
                style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '8px 9px', marginBottom: 2,
                  borderRadius: T.radius, border: `${T.borderW} solid ${act ? T.border : 'transparent'}`, cursor: 'pointer', textAlign: 'left',
                  background: act ? T.bubble : 'transparent',
                  color: act ? T.text : T.muted }}>
                <div style={{ position: 'relative' }}>
                  <Avatar name={t.peer} size={30} />
                  <span style={{ position: 'absolute', bottom: -1, right: -1, width: 9, height: 9, borderRadius: '50%', background: on ? 'var(--green)' : 'var(--muted)', border: '2px solid ' + (act ? 'var(--bg3)' : T.sidebar) }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: act ? T.text : T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.peer}</span>
                    {t.peer_role && t.peer_role !== 'member' && <RolePill role={t.peer_role} />}
                  </div>
                  <div style={{ fontSize: 11, color: T.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
                    {t.last_message || ''}
                  </div>
                </div>
                {t.unread > 0 && <span style={{ background: T.accent, color: 'var(--bg)', fontSize: 11, fontWeight: 700, padding: '1px 6px', borderRadius: 10, fontFamily: T.mono, flexShrink: 0 }}>{t.unread}</span>}
              </button>
            )
          })}
        </div>
      </div>

      {/* Conversation */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {!threadId ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
            <div style={{ fontSize: 46 }}>💬</div>
            <div style={{ fontFamily: T.mono, fontSize: 12, color: T.muted }}>Select a conversation</div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', height: 52, borderBottom: `1px solid ${T.border}`, background: T.sidebar, flexShrink: 0 }}>
              <Avatar name={peer} size={30} online={online(thread?.peer_last_seen)} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: T.text }}>{peer}</span>
                  {thread?.peer_role && thread.peer_role !== 'member' && <RolePill role={thread.peer_role} />}
                  {key && <span title="Messages encrypted at rest" style={{ color: T.accent, fontSize: 11 }}>🔒</span>}
                </div>
                <div style={{ fontSize: 11, color: online(thread?.peer_last_seen) ? 'var(--green)' : T.muted }}>
                  {online(thread?.peer_last_seen) ? 'Online' : 'Offline'}
                </div>
              </div>
              <button onClick={startCall} title={`Call ${peer}`}
                style={{ width: 30, height: 30, border: `1px solid ${T.border}`, borderRadius: '50%', background: 'transparent', color: T.text, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                📞
              </button>
            </div>

            {inCall && <DMCallBar threadId={threadId} peer={peer} me={me} onEnd={() => setInCall(false)} />}

            {/* Messages */}
            <div ref={listRef} onScroll={onScroll} style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 4, minHeight: 0 }}>
              {loading ? (
                <div style={{ textAlign: 'center', padding: 40, color: T.muted, fontFamily: T.mono, fontSize: 11 }}>Loading…</div>
              ) : msgs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: T.muted, fontFamily: T.mono, fontSize: 11 }}>No messages yet. Say hi!</div>
              ) : msgs.map(m => {
                const isMine = mine(m)
                const seen = isMine && m.created_at && peerLastRead && m.created_at <= peerLastRead
                return (
                  <React.Fragment key={m.id}>
                    <div style={{ display: 'flex', flexDirection: isMine ? 'row-reverse' : 'row', gap: 8, alignItems: 'flex-start' }}>
                      <Avatar name={m.sender} size={26} />
                      <div style={{ maxWidth: '72%', display: 'flex', flexDirection: 'column', alignItems: isMine ? 'flex-end' : 'flex-start' }}>
                        <div className={isMine ? 'chat-dm-bubble chat-dm-bubble-own' : 'chat-dm-bubble chat-dm-bubble-peer'} style={{
                          background: isMine ? T.bubbleOwn : T.bubble,
                          border: `${T.borderW} solid ${T.border}`,
                          boxShadow: T.shadowSm,
                          borderRadius: T.radius, borderBottomRightRadius: isMine ? 3 : T.radius, borderBottomLeftRadius: isMine ? T.radius : 3,
                          padding: '7px 11px', fontSize: 13, color: T.text, wordBreak: 'break-word', minWidth: 60,
                        }}>
                          {replyTo && m.reply_to && (
                            <div style={{ fontSize: 11, color: T.muted, fontStyle: 'italic', marginBottom: 3, fontFamily: T.mono }}>
                              ↪ {m.reply_to.sender}: {m.reply_to.content}
                            </div>
                          )}
                          {m.type === 'image' && <MediaPreviews text={m.content} onMediaClick={setMediaViewer} right={isMine} />}
                          {m.type === 'file' && <div>📎 <a href={m.content} target="_blank" rel="noreferrer" style={{ color: T.link }}>{m.file_name}</a></div>}
                          {m.type === 'voice' && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <button onClick={() => togglePlay(m)} style={{ width: 30, height: 30, borderRadius: '50%', border: 'none', background: 'color-mix(in srgb, var(--link) 20%, transparent)', color: T.link, cursor: 'pointer', fontSize: 12, flexShrink: 0 }}>
                                {playingId === m.id ? '⏸' : '▶'}
                              </button>
                              <div style={{ height: 4, width: 120, borderRadius: 2, background: 'var(--border2)', overflow: 'hidden' }}>
                                <div style={{ width: 0, height: '100%', background: T.link }} />
                              </div>
                              <span style={{ fontFamily: T.mono, fontSize: 11, color: T.muted }}>{m.duration ? `${Math.round(m.duration)}s` : '♪'}</span>
                              <audio id={`voice-${m.id}`} src={m.content} preload="none" />
                            </div>
                          )}
                          {m.type === 'call' && (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '2px 4px' }}>
                              <div style={{ fontSize: 20 }}>📞</div>
                              <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>
                                {isMine ? 'Outgoing call' : `Incoming call from ${m.sender}`}
                              </div>
                              {!isMine && (
                                <button onClick={() => setInCall(true)}
                                  style={{ marginTop: 4, padding: '5px 16px', border: 'none', borderRadius: T.radius,
                                    background: 'var(--green)', boxShadow: T.glow,
                                    color: 'var(--bg)', fontSize: 11, fontWeight: 700, fontFamily: T.mono, cursor: 'pointer' }}>
                                  ACCEPT
                                </button>
                              )}
                              {isMine && (
                                <button onClick={startCall}
                                  style={{ marginTop: 4, padding: '5px 16px', border: `${T.borderW} solid ${T.border}`, borderRadius: T.radius,
                                    background: 'transparent', color: T.text, fontSize: 11, fontWeight: 700, fontFamily: T.mono, cursor: 'pointer' }}>
                                  JOIN
                                </button>
                              )}
                            </div>
                          )}
                          {m.type === 'text' && <Markdown text={m.content} />}
                          {m.type === 'text' && <MediaPreviews text={m.content} onMediaClick={setMediaViewer} right={isMine} />}
                          <div style={{ marginTop: 2, fontSize: 11, color: T.muted, fontFamily: T.mono, textAlign: 'right' }}>
                            {fmt(m.created_at)}{m.edited ? ' · edited' : ''}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 10, marginTop: 2, fontFamily: T.mono, fontSize: 11, color: T.muted, opacity: 0 }}>
                          <button onClick={() => { setReplyTo(m); setInput(i => i + '@' + m.sender + ' ') }} style={{ background: 'none', border: 'none', color: T.muted, cursor: 'pointer', fontSize: 11 }}>Reply</button>
                          <button onClick={() => react(m.id, '👍')} style={{ background: 'none', border: 'none', color: T.muted, cursor: 'pointer', fontSize: 11 }}>React</button>
                          {isMine && <button onClick={() => setEditing(m)} style={{ background: 'none', border: 'none', color: T.muted, cursor: 'pointer', fontSize: 11 }}>Edit</button>}
                          {isMine && <button onClick={() => delMsg(m.id)} style={{ background: 'none', border: 'none', color: T.danger, cursor: 'pointer', fontSize: 11 }}>Delete</button>}
                        </div>
                        {seen && <div style={{ fontSize: 11, color: T.muted, fontFamily: T.mono }}>✓ seen</div>}
                      </div>
                    </div>
                  </React.Fragment>
                )
              })}
            </div>

            {typLabel && <div style={{ padding: '2px 18px 4px', fontFamily: T.mono, fontSize: 11, color: T.muted, flexShrink: 0, fontStyle: 'italic' }}>{typLabel}</div>}
            {replyTo && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', background: 'color-mix(in srgb, var(--green) 8%, transparent)', borderTop: `1px solid ${T.border}`, flexShrink: 0 }}>
                <div style={{ flex: 1, fontFamily: T.mono, fontSize: 11, color: T.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <span style={{ color: T.link }}>@{replyTo.sender}</span> {replyTo.content}
                </div>
                <button onClick={() => setReplyTo(null)} style={{ padding: '2px 7px', border: `1px solid ${T.border}`, borderRadius: 6, background: 'transparent', color: T.muted, cursor: 'pointer', fontSize: 12 }}>✕</button>
              </div>
            )}

            {/* Composer */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px 12px', borderTop: `1px solid ${T.border}`, background: T.sidebar, flexShrink: 0 }}>
              <input type="file" ref={fileRef} onChange={e => { const f = e.target.files?.[0]; if (f) uploadMsg(f, f.type?.startsWith('image/') ? 'image' : 'file') }} style={{ display: 'none' }} />
              <button onClick={() => fileRef.current?.click()} disabled={sending} title="Attach file"
                style={{ width: 36, height: 36, border: `${T.borderW} solid ${T.border}`, borderRadius: T.radius, background: 'transparent', color: T.text, fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {sending ? '⏳' : '📎'}
              </button>
              <button onClick={recording ? stopRec : startRec} disabled={sending}
                style={{ width: 36, height: 36, border: `${T.borderW} solid ${recording ? T.danger : T.border}`, borderRadius: T.radius, background: recording ? 'color-mix(in srgb, var(--red) 15%, transparent)' : 'transparent', color: recording ? T.danger : T.text, fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {recording ? '⏹' : '🎙'}
              </button>
              {recording && <span style={{ fontFamily: T.mono, fontSize: 11, color: T.danger, flexShrink: 0 }}>0:{String(recSecs).padStart(2, '0')}</span>}
              {editing ? (
                <input value={editing?.content || ''} onChange={e => setEditing({ ...editing, content: e.target.value })}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) saveEdit(editing.id, editing.content) }}
                  style={{ flex: 1, background: T.input, border: `${T.borderW} solid ${T.border}`, color: T.text, fontFamily: T.display, fontSize: 13, padding: '9px 14px', borderRadius: T.radius, outline: 'none', minWidth: 0 }} />
              ) : (
                <input value={input} onChange={onInput} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) send(e) }}
                  placeholder={`Message ${peer}…`}
                  className="chat-dm-input"
                  style={{ flex: 1, background: T.input, border: `${T.borderW} solid ${T.border}`, color: T.text, fontFamily: T.display, fontSize: 13, padding: '9px 14px', borderRadius: T.radius, outline: 'none', minWidth: 0 }}
                  onFocus={e => e.target.style.borderColor = 'var(--green)'}
                  onBlur={e => e.target.style.borderColor = 'var(--border)'} />
              )}
              <button onClick={() => editing ? saveEdit(editing.id, editing.content) : send()} disabled={sending || !(editing ? editing.content : input).trim()}
                className="chat-dm-send"
                style={{ height: 36, padding: '0 16px', border: 'none', borderRadius: T.radius, flexShrink: 0,
                  background: (editing ? editing.content : input).trim() && !sending ? 'var(--green)' : 'var(--bg3)',
                  boxShadow: (editing ? editing.content : input).trim() && !sending ? T.glow : 'none',
                  color: (editing ? editing.content : input).trim() && !sending ? 'var(--bg)' : T.muted, fontFamily: T.mono, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                {sending ? '…' : editing ? 'Save' : 'Send ➤'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
    </>
  )
}
