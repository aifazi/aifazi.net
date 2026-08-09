'use client'
import React, { useState, useEffect, useRef, useCallback, useMemo, Component, useSyncExternalStore } from 'react'
import { supabase } from '@/lib/supabase'
import api, { getRole, getUsername, setEffectiveAccess } from '@/lib/api'
import { useNotify }  from '../../core/notify.jsx'
import { useDialog, dialog } from '../../core/dialog'
import { useMenu }    from '../../core/menu'
import { Checkbox }   from '../../core/ui.jsx'
import { T, parseJwt, getToken, beep, aCol, isUuidLike, fmtDt, fmtSz, ROLES, ENCRYPTED_PREFIX } from './chat-constants'
import { encryptText, getRoomKey, setRoomKeyModule, _roomKeyCache } from './chat-encryption'
import { ChatSidebar } from './components/ChatSidebar'
import { ChatMessageList } from './components/ChatMessageList'
import { Avatar } from './components/Avatar'
import { RolePill } from './components/RolePill'
import { VoicePanel } from './components/VoicePanel'
import { MiniCallBar } from './components/MiniCallBar'
import { MediaViewer } from './components/MediaViewer'
import { ChannelModal } from './components/ChannelModal'
import { EditBar } from './components/EditBar'
import { UserSearchModal } from './components/UserSearchModal'

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
export default function AdminChat({ embedded=false }) {
  const standalone = !embedded
  const notify = useNotify()
  const { confirm: dlgConfirm } = useDialog()
  const token = typeof window !== 'undefined' ? getToken() : null
  const [me, setMe] = useState(() => token ? (getUsername() || parseJwt(token)?.username || null) : null)
  const meRef = useRef(me)
  const [role, setRole] = useState(() => token ? (getRole() || 'user') : null)
  const [profile, setProfile] = useState(() => ({ username: me, role: role || 'user', avatar: '' }))
  const isAdmin = role === 'admin' || role === 'moderator'
  const { openContextMenu } = useMenu()
  const [roomMutes, setRoomMutes] = useState([])
  const [roomBans, setRoomBans] = useState([])

  // Keep me in sync with token changes
  const [prevToken, setPrevToken] = useState(token)
  if (prevToken !== token) {
    setPrevToken(token)
    if (token) {
      const name = getUsername() || parseJwt(token)?.username
      if (name) setMe(name)
    }
  }
  useEffect(() => {
    const t = getToken()
    if (t) {
      const name = getUsername() || parseJwt(t)?.username
      if (name) meRef.current = name
    }
  }, [token])

  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false)
  // H4 — access token is memory-only, so on a fresh page load getToken() is null
  // even for a cookie-session user. Gate on the /auth/me result instead of the
  // in-memory token: 'loading' → nothing, 'ok' → chat, 'no' → login screen.
  const [authState, setAuthState] = useState(() => (token ? 'ok' : 'loading'))
  const [rooms, setRooms] = useState([])
  const [room, setRoom] = useState(null)
  const [msgs, setMsgs] = useState([])
  const [online, setOnline] = useState([])
  const [unread, setUnread] = useState({})
  const [input, setInput] = useState('')
  const [replyTo, setReplyTo] = useState(null)
  const [editing, setEditing] = useState(null)
  const [mediaViewer, setMediaViewer] = useState(null)
  const [typing, setTyping] = useState([])
  const [roomMembers, setRoomMembers] = useState([])
  const [modal, setModal] = useState(null)
  const [showOnline, setShowOnline] = useState(false)
  const [showSidebar, setShowSidebar] = useState(false)
  const [showAdminMenu, setShowAdminMenu] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [muted, setMuted] = useState(false)
  const [camOff, setCamOff] = useState(false)
  const [deafened, setDeafened] = useState(false)
  const [isMutedByStaff, setIsMutedByStaff] = useState(false)

  const [callRoom, setCallRoom] = useState(null)
  const [canScreenShare, setCanScreenShare] = useState(false)
  const [callParticipants, setCallParticipants] = useState([])
  const [roomKey, setRoomKey] = useState('')
  const [userSearch, setUserSearch] = useState(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQ, setSearchQ] = useState('')
  const [searchResults, setSearchResults] = useState(null)
  const searchRef = useRef(null)

  // Fetch room encryption key for text messages (cached per room)
  const [prevRoom, setPrevRoom] = useState(room)
  if (prevRoom !== room) {
    setPrevRoom(room)
    setSearchOpen(false); setSearchQ(''); setSearchResults(null)
    if (!room || (room.type === 'voice' || room.type === 'video')) {
      setRoomKey(''); setRoomKeyModule('')
    } else if (_roomKeyCache[room.id]) {
      setRoomKey(_roomKeyCache[room.id]); setRoomKeyModule(_roomKeyCache[room.id])
    }
    if (room) { // Reset unread for current room
      setUnread(prev => { const n={...prev}; delete n[room.id]; return n })
    }
  }
  useEffect(() => {
    if (!room || (room.type === 'voice' || room.type === 'video')) return
    const cached = _roomKeyCache[room.id]
    if (cached) return
    api.get(`/chat/rooms/${room.id}/encryption-key`).then(r => {
      const key = r.data?.encryption_key || ''
      setRoomKey(key); setRoomKeyModule(key)
      if (key) _roomKeyCache[room.id] = key
    }).catch(() => { setRoomKey(''); setRoomKeyModule('') })
  }, [room?.id])

  const listRef = useRef(null)
  const fileRef = useRef(null)
  const adminMenuRef = useRef(null)
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 768 : false)
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])
  const roomIdRef = useRef(null)
  const oldestRef = useRef(null)

  useEffect(() => { meRef.current = me }, [me])

  // ── Fetch real role from server immediately on mount ────────────────────
  useEffect(() => {
    if (!mounted) return
    let cancelled = false
    api.get('/auth/me').then(r => {
      if (cancelled) return
      // /auth/me returns the user flat (top-level), so accept both shapes.
      const nextUser = r.data?.user || r.data
      if (!nextUser?.username && !nextUser?._id) { setAuthState('no'); return }
      setEffectiveAccess(nextUser)
      setAuthState('ok')
      const nextName = nextUser.username || getUsername() || parseJwt(token)?.username
      const nextRole = nextUser.role || getRole() || 'user'
      if (nextName) { setMe(nextName); meRef.current = nextName }
      setRole(nextRole)
      setProfile({ username: nextName || me, role: nextRole, avatar: nextUser.avatar || '' })
    }).catch(err => {
      if (cancelled) return
      setAuthState('no')
    })
    return () => { cancelled = true }
  }, [mounted])

  // ── Fetch rooms ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mounted) return
    let cancelled = false
    api.get('/chat/rooms').then(r => { if (!cancelled) setRooms(r.data||[]) }).catch(()=>{})
    return () => { cancelled = true }
  }, [mounted])

  // ── Global presence via Supabase Realtime ─────────────────────────────────
  useEffect(() => {
    // Only track presence for an actually-authenticated user. When auth fails
    // (authState === 'no'), tear the channel down so a signed-out/session-expired
    // user is not left showing as online in presence or receiving channel events.
    if (!mounted || !supabase || !me || authState !== 'ok') return

    const payload = parseJwt(getToken() || '')
    const presenceKey = String(payload?.id || payload?.staff_id || me)
    const channel = supabase.channel('chat_global', {
      configs: { presence: { key: presenceKey } },
    })

    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState()
      const next = Object.keys(state).map(key => {
        const meta = state[key]?.[0]?.metadata || state[key]?.[0] || {}
        const p = typeof meta === 'string' ? (()=>{try{return JSON.parse(meta)}catch{return {}}})() : meta
        const username = p.username || (!isUuidLike(key) ? key : 'User')
        return {
          presenceKey: key,
          username,
          role: p.role || 'member',
          avatar: p.avatar || '',
          voice_room_id: p.voice_room_id || null,
          voice_room_name: p.voice_room_name || '',
        }
      })
      const byKey = new Map()
      next.forEach(u => byKey.set(u.presenceKey, u))
      setOnline([...byKey.values()].sort((a, b) => a.username.localeCompare(b.username)))
    })

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({
          online_at: new Date().toISOString(),
          username: profile.username || me,
          role: profile.role || role || 'member',
          avatar: profile.avatar || '',
          voice_room_id: callRoom?.id || null,
          voice_room_name: callRoom?.name || '',
        })
      }
    })

    return () => { supabase.removeChannel(channel) }
  }, [mounted, authState, me, role, profile.username, profile.role, profile.avatar, callRoom?.id, callRoom?.name])

  // ── Global unread tracking (authenticated poll) ──────────────────────────
  // Replaces the old anon-keyed Supabase Realtime 'chat_unread' stream, which
  // let anyone with the publishable key subscribe to every chat_messages INSERT.
  // Unread counts now come from /chat/unread over the authenticated API.
  useEffect(() => {
    if (!mounted || !me || authState !== 'ok') return
    let cancelled = false
    const poll = () => {
      api.get('/chat/unread').then(r => {
        if (cancelled) return
        const counts = r.data || {}
        setUnread(prev => {
          const next = { ...prev }
          for (const roomId of Object.keys(counts)) {
            if (roomId === roomIdRef.current) continue
            next[roomId] = counts[roomId]
          }
          return next
        })
      }).catch(() => {})
    }
    poll()
    const iv = setInterval(poll, 15000)
    const onFocus = () => poll()
    window.addEventListener('focus', onFocus)
    return () => { cancelled = true; clearInterval(iv); window.removeEventListener('focus', onFocus) }
  }, [mounted, me, authState])

  // ── Realtime staff sync ──────────────────────────────────────────────────
  useEffect(() => {
    if (!mounted || !supabase || !me || authState !== 'ok') return
    let cancelled = false
    const channel = supabase.channel('chat_staff_sync')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'staff_users' },
        (payload) => {
          const row = payload.new || payload.old
          if (row?.username === me && !cancelled) {
            api.get('/auth/me').then(r => {
              const nextUser = r.data?.user || r.data
              if (!cancelled && (nextUser?.username || nextUser?._id)) {
                setEffectiveAccess(nextUser)
                const nextRole = nextUser.role || getRole() || 'user'
                setRole(nextRole)
                setProfile({ username: nextUser.username || me, role: nextRole, avatar: nextUser.avatar || '' })
              }
            }).catch(() => {})
          }
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel); cancelled = true }
  }, [mounted, me])

  // ── Periodic role poll (fallback) ───────────────────────────────────────
  useEffect(() => {
    if (!mounted || !me || authState !== 'ok') return
    let cancelled = false
    const intervalId = setInterval(() => {
      api.get('/auth/me')
        .then(r => {
          const nextUser = r.data?.user || r.data
          if (!cancelled && (nextUser?.username || nextUser?._id)) {
            setEffectiveAccess(nextUser)
            const nextRole = nextUser.role || getRole() || 'user'
            setRole(nextRole)
            setProfile({ username: nextUser.username || me, role: nextRole, avatar: nextUser.avatar || '' })
          }
        })
        .catch(() => {})
    }, 600000) // every 10 minutes (backup; Realtime handles live updates)
    return () => { clearInterval(intervalId); cancelled = true }
  }, [mounted, me])

  // ── Track oldest message timestamp for pagination ────────────────────────
  useEffect(() => {
    if (msgs.length) oldestRef.current = msgs[0]?.created_at
  }, [msgs])

  // ── Room messages + subscriptions ────────────────────────────────────────
  useEffect(() => {
    if (!room || !supabase) return
    roomIdRef.current = room.id

    const msgSub = supabase
      .channel(`chat:${room.id}`)
      .on('postgres_changes', { event:'INSERT', schema:'public', table:'chat_messages', filter:`room_id=eq.${room.id}` },
        (payload) => { setMsgs(prev => [...prev, payload.new]); beep() })
      .on('postgres_changes', { event:'UPDATE', schema:'public', table:'chat_messages', filter:`room_id=eq.${room.id}` },
        (payload) => { setMsgs(prev => prev.map(m => m.id===payload.new.id ? payload.new : m)) })
      .on('postgres_changes', { event:'DELETE', schema:'public', table:'chat_messages', filter:`room_id=eq.${room.id}` },
        (payload) => { setMsgs(prev => prev.filter(m => m.id!==payload.old.id)) })
      .subscribe()

    // Fetch messages
    api.get(`/chat/rooms/${room.id}/messages?limit=50`).then(r => {
      const data = r.data||[]
      setMsgs(data)
      setHasMore(data.length >= 50)
      setTimeout(() => { listRef.current?.scrollTo(0, listRef.current.scrollHeight) }, 100)
    })

    // Check mute/ban status
    api.get(`/chat/rooms/${room.id}/is-muted`).then(r => setIsMutedByStaff(r.data?.muted||false)).catch(()=>{})
    api.get(`/chat/rooms/${room.id}/mutes`).then(r => setRoomMutes(r.data||[])).catch(()=>{})
    api.get(`/chat/rooms/${room.id}/bans`).then(r => setRoomBans(r.data||[])).catch(()=>{})

    return () => { supabase.removeChannel(msgSub) }
  }, [room?.id])

  // ── Room members + typing indicator + live moderation ─────────────────────
  useEffect(() => {
    if (!room || !supabase || !me || authState !== 'ok') return

    const loadMembers = () =>
      api.get(`/chat/rooms/${room.id}/members`).then(r => setRoomMembers(Array.isArray(r.data) ? r.data : [])).catch(() => {})

    loadMembers()

    const typCh = supabase.channel(`typing:${room.id}`)
    typCh.on('broadcast', { event: 'typing' }, (payload) => {
      if (payload.payload?.username && payload.payload?.username !== me) {
        setTyping(prev => {
          if (prev.find(t => t === payload.payload.username)) return prev
          return [...prev, payload.payload.username]
        })
        setTimeout(() => setTyping(prev => prev.filter(t => t !== payload.payload.username)), 3000)
      }
    })
    typCh.subscribe()

    const modCh = supabase
      .channel(`mod:${room.id}`)
      .on('postgres_changes', { event:'INSERT', schema:'public', table:'chat_mutes', filter:`room_id=eq.${room.id}` },
        (payload) => { if (payload.new.username === me) { setIsMutedByStaff(true); notify.error('You have been muted in this channel') } })
      .on('postgres_changes', { event:'DELETE', schema:'public', table:'chat_mutes', filter:`room_id=eq.${room.id}` },
        (payload) => { if (payload.old.username === me) { setIsMutedByStaff(false); notify.success('You have been unmuted') } })
      .on('postgres_changes', { event:'INSERT', schema:'public', table:'chat_bans', filter:`room_id=eq.${room.id}` },
        (payload) => { if (payload.new.username === me) { notify.error('You have been banned from this channel'); setTimeout(() => { setRoom(null); setMsgs([]) }, 1500) } })
      .on('postgres_changes', { event:'INSERT', schema:'public', table:'chat_members', filter:`room_id=eq.${room.id}` }, loadMembers)
      .on('postgres_changes', { event:'DELETE', schema:'public', table:'chat_members', filter:`room_id=eq.${room.id}` },
        (payload) => { if (payload.old.username === me) { notify.error('You have been removed from this channel'); setTimeout(() => { setRoom(null); setMsgs([]) }, 1500) } loadMembers() })
      .subscribe()

    return () => { supabase.removeChannel(typCh); supabase.removeChannel(modCh) }
  }, [room?.id, me])

  const broadcastTyping = useCallback(() => {
    if (!room || !supabase || !me) return
    supabase.channel(`typing:${room.id}`).send({ type:'broadcast', event:'typing', payload:{ username: me } })
  }, [room?.id, me])

  // ── Join voice/video room ─────────────────────────────────────────────────
  const leaveCall = useCallback(() => {
    setCallRoom(null)
    setCanScreenShare(false)
    setCallParticipants([])
  }, [])

  const joinCall = useCallback(async (r) => {
    // Leave any existing call first
    if (callRoom) leaveCall()

    if (!navigator.mediaDevices?.getUserMedia) {
      notify.error('Microphone/Camera access is not available in this browser')
      return
    }
    try {
      const tokenRes = await api.get(`/chat/livekit/token?room_id=${r.id}`)
      const { token, url, can_publish, can_screen_share, encryption_key, role: tokenRole } = tokenRes.data
      if (!token) { notify.error('LiveKit token was empty — check backend env vars'); return }
      if (!url) { notify.error('LiveKit URL was empty — check LIVEKIT_URL env var'); return }
      setCallRoom({ ...r, _lkToken: token, _lkUrl: url, _canPublish: can_publish, _canScreenShare: can_screen_share, _e2eeKey: encryption_key, _myRole: tokenRole || role || 'member' })
      setCanScreenShare(can_screen_share || isAdmin)
      setMuted(false)
      setCamOff(false)
    } catch (e) {
      const status = e.response?.status
      const detail = e.response?.data?.detail || ''
      if (status === 403) notify.error(detail || 'No permission to join this voice channel')
      else if (detail) notify.error(detail)
      else notify.error('Cannot join voice channel — check connection')
    }
  }, [isAdmin, callRoom])

  const togMute = () => setMuted(m => !m)
  const togCam = () => setCamOff(c => !c)

  // ── Messages ──────────────────────────────────────────────────────────────
  const sendMsg = async (e) => {
    if (e) e.preventDefault()
    const txt = input.trim()
    if (!txt || !room) return
    if (isMutedByStaff) { notify.error('You are muted in this channel'); return }
    const prevInput = input
    setInput(''); setReplyTo(null)
    try {
      const encrypted = roomKey ? ENCRYPTED_PREFIX + await encryptText(txt, roomKey) : txt
      await api.post(`/chat/rooms/${room.id}/messages`, {
        content: encrypted, type:'text',
        reply_to: replyTo ? { id: replyTo.id, sender: replyTo.sender, content: replyTo.content } : null
      })
    } catch (err) {
      setInput(prevInput)
      notify.error(err.response?.data?.detail || 'Send failed')
    }
  }

  const delMsg = useCallback(async id => {
    const ok = await dlgConfirm({ title:'Delete message?', message:'This cannot be undone.', confirmLabel:'DELETE', variant:'danger' })
    if (!ok) return
    try { await api.delete(`/chat/messages/${id}`) } catch {}
  }, [dlgConfirm])

  const sendCallText = useCallback(async (text) => {
    if (!room || !text.trim()) return
    try {
      const encrypted = roomKey ? ENCRYPTED_PREFIX + await encryptText(text.trim(), roomKey) : text.trim()
      await api.post(`/chat/rooms/${room.id}/messages`, { content: encrypted, type: 'text' })
    } catch (err) {
      notify.error(err.response?.data?.detail || 'Send failed')
    }
  }, [room?.id, roomKey, notify])

  const batchDelMsgs = useCallback(async ids => {
    const ok = await dlgConfirm({ title:`Delete ${ids.length} messages?`, message:'This cannot be undone.', confirmLabel:'DELETE ALL', variant:'danger' })
    if (!ok) return
    let done = 0
    for (const id of ids) {
      try { await api.delete(`/chat/messages/${id}`); done++ } catch {}
    }
    notify.success(`Deleted ${done}/${ids.length} messages`)
  }, [dlgConfirm])

  const react = useCallback(async (msgId, emoji) => {
    try { await api.patch(`/chat/messages/${msgId}/react`, { emoji }) } catch {}
  }, [])

  const saveEdit = useCallback(async (msgId, content) => {
    try { await api.patch(`/chat/messages/${msgId}`, { content }); setEditing(null) } catch {}
  }, [])

  const sendFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !room) return
    if (file.size > 10*1024*1024) { notify.error('File too large (max 10 MB)'); return }
    setUploading(true)
    try {
      const form = new FormData(); form.append('file', file)
      const up = await api.post('/upload/single', form, { headers:{'Content-Type':'multipart/form-data'} })
      await api.post(`/chat/rooms/${room.id}/messages`, {
        content: up.data.url, type:'file', file_name: file.name, file_size: String(file.size)
      })
    } catch { notify.error('Upload failed') }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = '' }
  }

  const handlePaste = async (e) => {
    const items = e.clipboardData?.items
    if (!items || !room) return
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (!file) continue
        setUploading(true)
        try {
          const form = new FormData(); form.append('file', file)
          const up = await api.post('/upload/single', form, { headers:{'Content-Type':'multipart/form-data'} })
          await api.post(`/chat/rooms/${room.id}/messages`, {
            content: up.data.url, type:'image', file_name: file.name, file_size: String(file.size)
          })
        } catch { notify.error('Image upload failed') }
        finally { setUploading(false) }
      }
    }
  }

  const loadOlder = useCallback(async () => {
    if (!room || loadingMore || !hasMore) return
    const oldest = oldestRef.current
    if (!oldest) return
    setLoadingMore(true)
    try {
      const r = await api.get(`/chat/rooms/${room.id}/messages?limit=50&before=${encodeURIComponent(oldest)}`)
      const older = r.data || []
      setHasMore(older.length >= 50)
      if (older.length) setMsgs(prev => [...older, ...prev])
    } catch {} finally { setLoadingMore(false) }
  }, [room?.id, loadingMore, hasMore])

  const onInput = e => {
    setInput(e.target.value)
    if (e.target.value.trim()) broadcastTyping()
  }

  // ── Message search ─────────────────────────────────────────────────────────
  const runSearch = useCallback(async (q) => {
    if (!room || !q.trim()) { setSearchResults(null); return }
    try {
      const r = await api.get(`/chat/rooms/${room.id}/search`, { params: { q: q.trim() } })
      setSearchResults(r.data || [])
    } catch { setSearchResults([]) }
  }, [room?.id])

  const onSearchInput = useCallback((v) => {
    setSearchQ(v)
    if (searchRef.current) clearTimeout(searchRef.current)
    const q = v.trim()
    if (!q) { setSearchResults(null); return }
    searchRef.current = setTimeout(() => runSearch(q), 400)
  }, [runSearch])

  const clearSearch = useCallback(() => {
    setSearchQ(''); setSearchResults(null)
  }, [])
  const onScroll = useCallback(() => {
    if (!listRef.current) return
    if (listRef.current.scrollTop < 80 && hasMore && !loadingMore) {
      loadOlder()
    }
  }, [hasMore, loadingMore, loadOlder])

  // ── Room actions ──────────────────────────────────────────────────────────
  const joinRoom = useCallback((r) => {
    setRoom(r)
    if (isMobile) setShowSidebar(false)
    if (r.type === 'voice' || r.type === 'video') {
      if (callRoom && r.id !== callRoom.id) leaveCall()
      joinCall(r)
    }
    setUnread(prev => { const n={...prev}; delete n[r.id]; return n })
    api.post(`/chat/rooms/${r.id}/read`).catch(() => {})
  }, [isMobile, callRoom, joinCall, leaveCall])

  const saveChan = async data => {
    try {
      if (data.id) {
        const res = await api.put(`/chat/rooms/${data.id}`, data)
        setRooms(p => p.map(r => r.id===data.id ? res.data : r))
        if (room?.id === data.id) setRoom(res.data)
      } else {
        const res = await api.post('/chat/rooms', data)
        setRooms(p => [...p, res.data])
      }
      setModal(null); notify.success(data.id ? 'Channel updated' : 'Channel created')
    } catch { notify.error('Failed to save channel') }
  }

  const delChan = async r => {
    const ok = await dlgConfirm({ title:`Delete #${r.name}?`, message:'All messages in this channel will be permanently removed.', confirmLabel:'DELETE', variant:'danger' })
    if (!ok) return
    try { await api.delete(`/chat/rooms/${r.id}`); setRooms(p=>p.filter(x=>x.id!==r.id)); if(room?.id===r.id){setRoom(null);setMsgs([])} } catch { notify.error('Delete failed') }
  }

  // ── Moderation actions ────────────────────────────────────────────────────
  const muteUser = async (username, duration) => {
    try {
      await api.post(`/chat/rooms/${room.id}/mute`, { username, duration_minutes: duration })
      notify.success(`${username} muted for ${duration} min`)
    } catch { notify.error('Mute failed') }
  }

  const kickUser = async (username) => {
    try {
      await api.post(`/chat/rooms/${room.id}/kick`, { username, reason: 'Kicked by staff' })
      notify.success(`${username} kicked from channel`)
      api.get(`/chat/rooms/${room.id}/members`).then(r => setRoomMembers(Array.isArray(r.data) ? r.data : [])).catch(() => {})
    } catch { notify.error('Kick failed') }
  }

  const banUser = async (username) => {
    const ok = await dlgConfirm({ title:`Ban ${username}?`, message:`They will be banned from #${room.name} until manually unbanned.`, confirmLabel:'BAN', variant:'danger' })
    if (!ok) return
    try {
      await api.post(`/chat/rooms/${room.id}/ban`, { username, reason: 'Banned by staff' })
      notify.success(`${username} banned from channel`)
    } catch { notify.error('Ban failed') }
  }

  const unmuteUser = async (username) => {
    try { await api.delete(`/chat/rooms/${room.id}/mute/${username}`); notify.success(`${username} unmuted`) } catch { notify.error('Unmute failed') }
  }

  const unbanUser = async (username) => {
    try { await api.delete(`/chat/rooms/${room.id}/ban/${username}`); notify.success(`${username} unbanned`) } catch { notify.error('Unban failed') }
  }

  const inviteUser = useCallback(async (u) => {
    try {
      await api.post(`/chat/rooms/${room.id}/invite`, { username: u.username, role: 'member' })
      notify.success(`${u.username} invited to #${room.name}`)
    } catch (err) {
      notify.error(err.response?.data?.detail || 'Invite failed')
    }
  }, [room?.id, room?.name])

  const handleUserSearchSelect = useCallback(async (user) => {
    const mode = userSearch?.mode
    if (!mode || !user) return
    setUserSearch(null)
    if (mode === 'invite') { await inviteUser(user); return }
    if (mode === 'mute') {
      const dur = await dialog.prompt({ title: `Mute ${user.username}`, placeholder: 'Minutes (0=permanent)', defaultValue: '60' })
      if (dur !== null) await muteUser(user.username, parseInt(dur || '60'))
      return
    }
    if (mode === 'kick') {
      const ok = await dialog.confirm({ title: `Kick ${user.username}?`, confirmLabel: 'KICK', variant: 'danger' })
      if (ok) await kickUser(user.username)
      return
    }
    if (mode === 'ban') {
      const ok = await dialog.confirm({ title: `Ban ${user.username}?`, message: 'Until manually unbanned.', confirmLabel: 'BAN', variant: 'danger' })
      if (ok) await banUser(user.username)
    }
  }, [userSearch, muteUser, kickUser, banUser, inviteUser])

  const handleMention = useCallback((username) => {
    setInput(prev => prev + `@${username} `)
  }, [])

  const handleUserCtx = useCallback((e, u) => {
    e.preventDefault()
    e.stopPropagation()
    const items = [
      { icon:'📋', label:'Copy Username', action:() => navigator.clipboard?.writeText(u.username) },
      { icon:'💬', label:'Mention', action:() => handleMention(u.username) },
    ]
    if (isAdmin && u.username !== me && room) {
      const isMuted = roomMutes.some(m => m.username === u.username)
      const isBanned = roomBans.some(b => b.username === u.username)
      items.push({ type:'separator' })
      items.push({
        icon: isMuted ? '🔊' : '🔇',
        label: isMuted ? 'Unmute User' : 'Mute User',
        color: isMuted ? T.accent : T.warn,
        action: async () => {
          if (isMuted) await unmuteUser(u.username)
          else { const dur = await dialog.prompt({ title:`Mute ${u.username}`, placeholder:'Minutes (0=permanent)', defaultValue:'60' }); if (dur !== null) muteUser(u.username, parseInt(dur||'60')) }
        }
      })
      items.push({ icon:'🚫', label:'Kick User', color:'#ff6b35', action:async () => { const ok = await dialog.confirm({ title:`Kick ${u.username}?`, confirmLabel:'KICK', variant:'danger' }); if (ok) kickUser(u.username) } })
      if (isBanned) {
        items.push({ icon:'✅', label:'Unban User', color:T.accent, action:async () => { await unbanUser(u.username) } })
      } else {
        items.push({ icon:'⛔', label:'Ban User', color:T.danger, action:async () => { const ok = await dialog.confirm({ title:`Ban ${u.username}?`, message:'Until manually unbanned.', confirmLabel:'BAN', variant:'danger' }); if (ok) banUser(u.username) } })
      }
    }
    openContextMenu(e, items, { header: u.username })
  }, [isAdmin, me, room, roomMutes, roomBans, muteUser, unmuteUser, kickUser, banUser, unbanUser, handleMention, openContextMenu, dialog])

  const accessibleVoiceRoomIds = useMemo(() => new Set(rooms.filter(r => r.type === 'voice' || r.type === 'video').map(r => r.id)), [rooms])
  const voicePresenceByRoom = useMemo(() => {
    const grouped = {}
    online.forEach(u => {
      if (!u.voice_room_id || !accessibleVoiceRoomIds.has(u.voice_room_id)) return
      grouped[u.voice_room_id] = grouped[u.voice_room_id] || []
      grouped[u.voice_room_id].push(u)
    })
    Object.values(grouped).forEach(list => list.sort((a, b) => a.username.localeCompare(b.username)))
    return grouped
  }, [online, accessibleVoiceRoomIds])

  // ── render ────────────────────────────────────────────────────────────────
  if (!mounted) return null
  if (authState === 'loading') return (
    <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:T.main }}>
      <div style={{ textAlign:'center', color:T.muted }}>
        <div style={{ fontSize:32, marginBottom:10, animation:'spin 1s linear infinite' }}>⏳</div>
        <div style={{ fontFamily:T.mono, fontSize:11, letterSpacing:2 }}>CONNECTING…</div>
      </div>
    </div>
  )
  if (authState === 'no') return (
    <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:T.main }}>
      <div style={{ background:'rgba(20,23,34,0.98)', border:`1px solid ${T.border}`, borderRadius:16, padding:'36px 28px', textAlign:'center', maxWidth:320 }}>
        <div style={{ fontSize:38, marginBottom:10 }}>🔒</div>
        <h2 style={{ fontFamily:T.display, fontSize:18, color:T.text, margin:'0 0 16px' }}>Login Required</h2>
        <a href="/login?next=/chat" style={{ display:'inline-block', padding:'10px 26px', background:'linear-gradient(135deg,color-mix(in srgb, var(--green) 90%, transparent),color-mix(in srgb, var(--cyan) 90%, transparent))', color:'#000', fontFamily:T.mono, fontSize:11, fontWeight:700, letterSpacing:2, textDecoration:'none', borderRadius:9 }}>Login →</a>
      </div>
    </div>
  )

  const typLabel = typing.length>0 ? (typing.length===1?`${typing[0]} is typing…`:`${typing.slice(0,2).join(', ')} are typing…`) : null
  const isVC = callRoom && (callRoom.type==='voice'||callRoom.type==='video')
  const showFullCall = isVC && room && (room.type==='voice'||room.type==='video') && room.id === callRoom.id

  const handleReturnToCall = () => {
    if (callRoom) setRoom(callRoom)
  }

  const handleDeafen = () => {
    setDeafened(d => !d)
    setMuted(m => !m)
  }

  return (
    <>
      {modal && <ChannelModal initial={modal==='create'?null:modal} onSave={saveChan} onClose={()=>setModal(null)}/>}
      {mediaViewer && <MediaViewer media={mediaViewer} onClose={()=>setMediaViewer(null)}/>}
      {userSearch && <UserSearchModal
        title={userSearch.mode === 'invite' ? 'INVITE USER' : userSearch.mode === 'mute' ? 'MUTE USER' : userSearch.mode === 'kick' ? 'KICK USER' : 'BAN USER'}
        actionLabel={userSearch.mode === 'invite' ? 'Invite' : userSearch.mode === 'mute' ? 'Mute' : userSearch.mode === 'kick' ? 'Kick' : 'Ban'}
        onSelect={handleUserSearchSelect} onClose={()=>setUserSearch(null)} />}

      <div style={{ position: standalone ? 'fixed' : 'absolute', top:0, left:0, right:0, bottom:0,
        display:'flex', background:T.main, overflow:'hidden', borderRadius:standalone?0:8, zIndex: standalone ? 1 : undefined }}>

        {/* Mobile backdrop */}
        {isMobile && showSidebar && (
          <div onClick={()=>setShowSidebar(false)} style={{
            position:'absolute', inset:0, background:'rgba(0,0,0,0.6)', zIndex:40, backdropFilter:'blur(2px)'
          }}/>
        )}

        {/* Sidebar */}
        <div style={{
          ...(isMobile ? {
            position:'absolute', top:0, bottom:0, left:0, zIndex:50,
            transform: showSidebar ? 'translateX(0)' : 'translateX(-100%)',
            transition: 'transform 0.28s cubic-bezier(0.4,0,0.2,1)',
          } : {}),
        }}>
          <ChatSidebar rooms={rooms} active={room} onSelect={r=>{joinRoom(r);if(isMobile)setShowSidebar(false)}}
            onlineCount={online.length} unread={unread} isAdmin={isAdmin}
            onCreate={()=>setModal('create')} onEdit={r=>setModal(r)}
            callRoom={callRoom} onJoinCall={joinCall} onLeaveCall={leaveCall} me={me} role={role}
            voicePresenceByRoom={voicePresenceByRoom}/>
        </div>

        {/* Main */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minWidth:0, position:'relative' }}>

          {/* Full voice call UI — only when viewing the active call's room */}
          {showFullCall ? (
            <VoiceErrorBoundary>
              <VoicePanel room={callRoom} onLeave={leaveCall} muted={muted} camOff={camOff}
                onMute={togMute} onCam={togCam} onScreen={()=>{}} canScreenShare={canScreenShare}
                me={me} isAdmin={isAdmin} msgs={msgs} onSendMsg={sendCallText}
                onParticipantsChange={setCallParticipants} />
            </VoiceErrorBoundary>
          ) : (
            <>
              {/* Channel header */}
              <div style={{ display:'flex', alignItems:'center', gap:10, padding:'0 16px', height:52,
                borderBottom:`1px solid ${T.border}`, background:T.sidebar, flexShrink:0 }}>
                {isMobile && (
                  <button onClick={()=>setShowSidebar(p=>!p)} style={{
                    width:34, height:34, border:`1px solid ${T.border}`, borderRadius:8,
                    background:'transparent', color:T.text, cursor:'pointer', flexShrink:0,
                    display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:4,
                  }}>
                    <span style={{ width:16, height:1.5, background:'currentColor', borderRadius:1, display:'block' }}/>
                    <span style={{ width:16, height:1.5, background:'currentColor', borderRadius:1, display:'block' }}/>
                    <span style={{ width:12, height:1.5, background:'currentColor', borderRadius:1, display:'block' }}/>
                  </button>
                )}
                {room ? <>
                  <span style={{ fontSize:16 }}>{room.emoji||'#'}</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                      <span style={{ fontWeight:700, fontSize:13, color:T.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{room.name}</span>
                      {roomKey && <span title="Messages encrypted at rest (server holds the key — not true end-to-end encryption)" style={{ color:T.accent, fontSize:11, flexShrink:0 }}>🔒</span>}
                    </div>
                    {room.description && <div style={{ fontSize:10, color:T.muted, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{room.description}</div>}
                  </div>
                  <div style={{ display:'flex', gap:6, alignItems:'center', flexShrink:0 }}>
                    {(room.type==='voice'||room.type==='video') && (
                      <button onClick={()=>joinCall(room)}
                        style={{ padding:'4px 12px', border:`1px solid ${T.accent}`, borderRadius:7, background:'color-mix(in srgb, var(--green) 10%, transparent)', color:T.accent, fontFamily:T.mono, fontSize:10, cursor:'pointer', display:'flex', alignItems:'center', gap:5 }}>
                        {room.type==='video'?'📹':'🔊'} JOIN
                      </button>
                    )}
                    {isAdmin && (
                      <div ref={adminMenuRef} style={{ position:'relative' }}>
                        <button onClick={()=>setShowAdminMenu(p=>!p)}
                          style={{ padding:'4px 12px', border:`1px solid ${showAdminMenu?'color-mix(in srgb, var(--green) 45%, transparent)':T.border}`,
                            borderRadius:7, background:showAdminMenu?'color-mix(in srgb, var(--green) 10%, transparent)':'transparent',
                            color:showAdminMenu?T.accent:T.muted, fontFamily:T.mono, fontSize:11,
                            cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>
                          MOD <span style={{ fontSize:8, opacity:0.7 }}>{showAdminMenu?'▲':'▼'}</span>
                        </button>
                        {showAdminMenu && (
                          <div style={{ position:'absolute', right:0, top:'calc(100% + 6px)', zIndex:200,
                            background:'rgba(18,21,32,0.98)', border:`1px solid ${T.border}`, borderRadius:10,
                            padding:'4px', minWidth:200, boxShadow:'0 10px 40px rgba(0,0,0,0.7)' }}>
                            <div style={{ padding:'6px 12px 4px', fontFamily:T.mono, fontSize:9, color:T.muted, letterSpacing:2 }}>CHANNEL ACTIONS</div>
                            {[
                              { icon:'✏️', label:'Edit Channel', action:()=>{setModal(room);setShowAdminMenu(false)}, color:T.text },
                              { icon:'➕', label:'New Channel',  action:()=>{setModal('create');setShowAdminMenu(false)}, color:T.accent },
                              { icon:'👋', label:'Invite User',  action:()=>{setShowAdminMenu(false);setUserSearch({ mode:'invite' })}, color:T.accentB },
                            ].map((it,i)=>(
                              <button key={i} onClick={it.action} style={{ display:'flex', alignItems:'center', gap:9, width:'100%', padding:'8px 12px', border:'none', background:'transparent', color:it.color, fontFamily:T.mono, fontSize:11, cursor:'pointer', borderRadius:7, textAlign:'left' }}
                                onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.06)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                                <span style={{ width:16, textAlign:'center', flexShrink:0 }}>{it.icon}</span>{it.label}
                              </button>
                            ))}
                            <div style={{ height:1, background:T.border, margin:'4px 8px' }}/>
                            <div style={{ padding:'6px 12px 4px', fontFamily:T.mono, fontSize:9, color:T.muted, letterSpacing:2 }}>MODERATION</div>
                            <button onClick={()=>{setShowAdminMenu(false);setUserSearch({ mode:'mute' })}}
                              style={{ display:'flex', alignItems:'center', gap:9, width:'100%', padding:'8px 12px', border:'none', background:'transparent', color:T.warn, fontFamily:T.mono, fontSize:11, cursor:'pointer', borderRadius:7, textAlign:'left' }}
                              onMouseEnter={e=>e.currentTarget.style.background='rgba(255,215,0,0.08)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                              <span style={{ width:16, textAlign:'center' }}>🔇</span>Mute User
                            </button>
                            <button onClick={()=>{setShowAdminMenu(false);setUserSearch({ mode:'kick' })}}
                              style={{ display:'flex', alignItems:'center', gap:9, width:'100%', padding:'8px 12px', border:'none', background:'transparent', color:'#ff6b35', fontFamily:T.mono, fontSize:11, cursor:'pointer', borderRadius:7, textAlign:'left' }}
                              onMouseEnter={e=>e.currentTarget.style.background='rgba(255,107,53,0.08)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                              <span style={{ width:16, textAlign:'center' }}>🚫</span>Kick User
                            </button>
                            <button onClick={()=>{setShowAdminMenu(false);setUserSearch({ mode:'ban' })}}
                              style={{ display:'flex', alignItems:'center', gap:9, width:'100%', padding:'8px 12px', border:'none', background:'transparent', color:T.danger, fontFamily:T.mono, fontSize:11, cursor:'pointer', borderRadius:7, textAlign:'left' }}
                              onMouseEnter={e=>e.currentTarget.style.background='rgba(255,71,87,0.08)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                              <span style={{ width:16, textAlign:'center' }}>⛔</span>Ban User
                            </button>
                            <div style={{ height:1, background:T.border, margin:'4px 8px' }}/>
                            <div style={{ padding:'6px 12px 4px', fontFamily:T.mono, fontSize:9, color:T.muted, letterSpacing:2 }}>DANGER ZONE</div>
                            <button onClick={()=>{delChan(room);setShowAdminMenu(false)}}
                              style={{ display:'flex', alignItems:'center', gap:9, width:'100%', padding:'8px 12px', border:'none', background:'transparent', color:T.danger, fontFamily:T.mono, fontSize:11, cursor:'pointer', borderRadius:7, textAlign:'left' }}
                              onMouseEnter={e=>e.currentTarget.style.background='rgba(255,71,87,0.1)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                              <span style={{ width:16, textAlign:'center' }}>🗑️</span>Delete Channel
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    <button onClick={()=>setShowOnline(p=>!p)}
                      style={{ padding:'4px 10px', border:`1px solid ${showOnline?'color-mix(in srgb, var(--green) 40%, transparent)':T.border}`, borderRadius:7, background:showOnline?'color-mix(in srgb, var(--green) 8%, transparent)':'transparent', color:showOnline?T.accent:T.muted, fontFamily:T.mono, fontSize:11, cursor:'pointer', display:'flex', alignItems:'center', gap:5 }}>
                      <span style={{ width:7, height:7, borderRadius:'50%', background:'#23d160', display:'inline-block' }}/>
                      {online.length}
                    </button>
                    <button onClick={()=>{ const next=!searchOpen; setSearchOpen(next); if(!next){setSearchQ('');setSearchResults(null)} }}
                      title="Search messages"
                      style={{ padding:'4px 10px', border:`1px solid ${searchOpen?'color-mix(in srgb, var(--cyan) 40%, transparent)':T.border}`, borderRadius:7, background:searchOpen?'color-mix(in srgb, var(--cyan) 8%, transparent)':'transparent', color:searchOpen?T.accentB:T.muted, fontFamily:T.mono, fontSize:11, cursor:'pointer' }}>
                      🔍
                    </button>
                  </div>
                </> : <div style={{ fontFamily:T.mono, fontSize:11, color:T.muted }}>Select a channel</div>}
              </div>

              {/* Mini call bar — shown when in voice call but viewing a text channel */}
              {isVC && !showFullCall && (
                <MiniCallBar room={callRoom} muted={muted} camOff={camOff} deafened={deafened}
                  onMute={togMute} onDeafen={handleDeafen} onCam={togCam}
                  onLeave={leaveCall} onReturn={handleReturnToCall}
                  participants={callParticipants} />
              )}

              {room ? (
                <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minHeight:0 }}>
                  {searchOpen && (
                    <div style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 14px', background:'color-mix(in srgb, var(--cyan) 8%, transparent)', borderBottom:`1px solid color-mix(in srgb, var(--cyan) 20%, transparent)`, flexShrink:0 }}>
                      <span style={{ fontSize:12 }}>🔍</span>
                      <input autoFocus value={searchQ} onChange={e=>onSearchInput(e.target.value)}
                        onKeyDown={e=>{ if(e.key==='Escape'){clearSearch();setSearchOpen(false)} }}
                        placeholder={`Search #${room.name}…`}
                        style={{ flex:1, background:'rgba(0,0,0,0.35)', border:`1px solid ${T.border}`, color:T.text, fontFamily:T.mono, fontSize:12, padding:'6px 10px', borderRadius:8, outline:'none', minWidth:0 }}
                        onFocus={e=>e.target.style.borderColor='color-mix(in srgb, var(--cyan) 40%, transparent)'}
                        onBlur={e=>e.target.style.borderColor=T.border}/>
                      <button onClick={()=>{clearSearch();setSearchOpen(false)}} style={{ padding:'2px 8px', border:`1px solid ${T.border}`, borderRadius:6, background:'transparent', color:T.muted, cursor:'pointer', fontSize:12 }}>✕</button>
                    </div>
                  )}
                  {searchResults !== null && (
                    <div style={{ padding:'4px 14px', fontFamily:T.mono, fontSize:10, color:T.accentB, background:'color-mix(in srgb, var(--cyan) 6%, transparent)', flexShrink:0, display:'flex', alignItems:'center', gap:6 }}>
                      <span>{searchResults.length} match{searchResults.length===1?'':'es'} for “{searchQ}”</span>
                      <button onClick={clearSearch} style={{ background:'none', border:'none', color:T.accent, cursor:'pointer', fontFamily:T.mono, fontSize:10, textDecoration:'underline' }}>back to channel</button>
                    </div>
                  )}
                  {loadingMore && <div style={{ textAlign:'center', padding:'4px', fontFamily:T.mono, fontSize:10, color:T.muted, flexShrink:0 }}>Loading older messages…</div>}
                  <ChatMessageList msgs={searchResults !== null ? searchResults : msgs} me={me} isAdmin={isAdmin} onDel={delMsg} onReply={setReplyTo} onEdit={setEditing} onReact={react} onMediaClick={setMediaViewer} elRef={listRef} onScroll={searchResults !== null ? undefined : onScroll} onMention={handleMention} muteUser={muteUser} unmuteUser={unmuteUser} kickUser={kickUser} banUser={banUser} unbanUser={unbanUser} roomMutes={roomMutes} roomBans={roomBans} onBatchDel={batchDelMsgs}/>
                  {typLabel && <div style={{ padding:'2px 18px 4px', fontFamily:T.mono, fontSize:10, color:T.muted, flexShrink:0, fontStyle:'italic' }}>{typLabel}</div>}
                  {editing && <EditBar msg={editing} onSave={saveEdit} onCancel={()=>setEditing(null)}/>}
                  {replyTo && (
                    <div style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 14px', background:'color-mix(in srgb, var(--cyan) 6%, transparent)', borderTop:`1px solid color-mix(in srgb, var(--cyan) 15%, transparent)`, flexShrink:0 }}>
                      <div style={{ flex:1, fontFamily:T.mono, fontSize:10, color:T.muted, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        <span style={{ color:T.accentB }}>{replyTo.sender}: </span>{replyTo.content}
                      </div>
                      <button onClick={()=>setReplyTo(null)} style={{ padding:'2px 7px', border:`1px solid ${T.border}`, borderRadius:6, background:'transparent', color:T.muted, cursor:'pointer', fontSize:12 }}>✕</button>
                    </div>
                  )}
                  {isMutedByStaff && (
                    <div style={{ padding:'6px 14px', background:'rgba(255,215,0,0.08)', borderTop:`1px solid rgba(255,215,0,0.2)`, fontFamily:T.mono, fontSize:10, color:T.warn, textAlign:'center', flexShrink:0 }}>
                      You are muted in this channel by a moderator
                    </div>
                  )}
                  {/* Input bar */}
                  <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 14px 12px',
                    borderTop:`1px solid ${T.border}`, background:T.sidebar, flexShrink:0 }}>
                    <input type="file" ref={fileRef} onChange={sendFile} style={{ display:'none' }}/>
                    <button onClick={()=>fileRef.current?.click()} disabled={uploading} title="Attach file"
                      style={{ width:36, height:36, border:`1px solid ${T.border}`, borderRadius:9, background:uploading?'rgba(255,255,255,0.04)':'transparent',
                        color:uploading?T.muted:T.text, fontSize:16, cursor:uploading?'default':'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                      {uploading ? '⏳' : '📎'}
                    </button>
                    <input value={input} onChange={onInput} onPaste={handlePaste}
                      onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey)sendMsg(e)}}
                      placeholder={isMutedByStaff?'You are muted':`Message #${room.name}…`}
                      disabled={isMutedByStaff}
                      style={{ flex:1, background:'rgba(255,255,255,0.05)', border:`1px solid rgba(255,255,255,0.1)`,
                        color:T.text, fontFamily:T.display, fontSize:13, padding:'9px 14px', borderRadius:10,
                        outline:'none', minWidth:0, transition:'border-color 0.2s', opacity:isMutedByStaff?0.4:1 }}
                      onFocus={e=>e.target.style.borderColor='color-mix(in srgb, var(--green) 40%, transparent)'}
                      onBlur={e=>e.target.style.borderColor='rgba(255,255,255,0.1)'}/>
                    <button onClick={sendMsg} disabled={!input.trim()||isMutedByStaff}
                      style={{ height:36, padding:'0 16px', border:'none', borderRadius:9, flexShrink:0,
                        background:input.trim()&&!isMutedByStaff?'linear-gradient(135deg,color-mix(in srgb, var(--green) 85%, transparent),color-mix(in srgb, var(--cyan) 85%, transparent))':'rgba(255,255,255,0.06)',
                        color:input.trim()&&!isMutedByStaff?'#000':T.muted, fontFamily:T.mono, fontSize:11, fontWeight:700,
                        cursor:input.trim()&&!isMutedByStaff?'pointer':'default', transition:'all 0.2s' }}>
                      Send ➤
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:14 }}>
                  <div style={{ fontSize:48 }}>💬</div>
                  <div style={{ fontFamily:T.mono, fontSize:12, color:T.muted }}>Select a channel to start chatting</div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Online panel */}
        {showOnline && !isMobile && (
          <div style={{ width:190, flexShrink:0, background:T.sidebar, borderLeft:`1px solid ${T.border}`, display:'flex', flexDirection:'column', overflow:'hidden' }}>
            <div style={{ padding:'12px 12px 8px', borderBottom:`1px solid ${T.border}`, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <span style={{ fontFamily:T.mono, fontSize:9, color:T.muted, letterSpacing:3 }}>ONLINE — {online.length}</span>
              <button onClick={()=>setShowOnline(false)} style={{ padding:'2px 7px', border:`1px solid ${T.border}`, borderRadius:6, background:'transparent', color:T.muted, cursor:'pointer', fontSize:12 }}>✕</button>
            </div>
            <div style={{ flex:1, overflowY:'auto', padding:'6px 0' }}>
              {Object.entries(voicePresenceByRoom).length > 0 && (
                <div style={{ borderBottom:`1px solid ${T.border}`, padding:'4px 0 8px', marginBottom:4 }}>
                  <div style={{ padding:'4px 12px 6px', fontFamily:T.mono, fontSize:8, color:T.accentB, letterSpacing:2 }}>IN VOICE</div>
                  {rooms.filter(r => voicePresenceByRoom[r.id]?.length).map(r => (
                    <div key={r.id} style={{ padding:'4px 12px' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:5, fontFamily:T.mono, fontSize:9, color:T.muted }}>
                        <span>{r.type === 'video' ? '📹' : '🔊'}</span>
                        <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.name}</span>
                      </div>
                      {voicePresenceByRoom[r.id].map(u => (
                        <div key={`${r.id}-${u.presenceKey || u.username}`} style={{ display:'flex', alignItems:'center', gap:8, padding:'3px 0 3px 10px' }} onContextMenu={e => handleUserCtx(e, u)}>
                          <Avatar name={u.username} size={22} online/>
                          <div style={{ minWidth:0, flex:1 }}>
                            <div style={{ fontSize:11, color:u.username===me?T.accent:T.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{u.username}{u.username===me?' (you)':''}</div>
                            <RolePill role={u.role} />
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
              {online.map(u=>(
                <div key={u.presenceKey || u.username} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 12px' }} onContextMenu={e => handleUserCtx(e, u)}>
                  <Avatar name={u.username} size={26} online/>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:11, fontWeight:u.username===me?600:400, color:u.username===me?T.accent:T.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {u.username}{u.username===me?' (you)':''}
                    </div>
                    <RolePill role={u.role} />
                  </div>
                </div>
              ))}
              {roomMembers.filter(m => m.username !== me && !online.some(o => o.username === m.username)).length > 0 && (
                <div style={{ borderTop:`1px solid ${T.border}`, marginTop:4, paddingTop:4 }}>
                  <div style={{ padding:'4px 12px 6px', fontFamily:T.mono, fontSize:8, color:T.muted, letterSpacing:2 }}>
                    OFFLINE MEMBERS — {roomMembers.filter(m => m.username !== me && !online.some(o => o.username === m.username)).length}
                  </div>
                  {roomMembers.filter(m => m.username !== me && !online.some(o => o.username === m.username)).map(m => {
                    const u = { username: m.username, role: m.role || 'member' }
                    return (
                      <div key={m.username} onContextMenu={e => handleUserCtx(e, u)} style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 12px', cursor:'default', borderRadius:4 }}>
                        <span style={{ width:26, height:26, borderRadius:'50%', background:'rgba(255,255,255,0.06)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, color:T.muted, flexShrink:0, fontFamily:T.mono }}>{m.username.charAt(0).toUpperCase()}</span>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:11, color:T.muted, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{m.username}</div>
                          <RolePill role={m.role || 'member'} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  )
}

// ── Voice call error boundary ─────────────────────────────────────────
class VoiceErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { crashed: false, error: null }
  }
  static getDerivedStateFromError(err) {
    return { crashed: true, error: err }
  }
  componentDidCatch(err) {
    console.error('[VoiceErrorBoundary] LiveKit panel crashed:', err)
  }
  render() {
    if (this.state.crashed) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          flex: 1, gap: 12, padding: 40, textAlign: 'center',
        }}>
          <div style={{ fontSize: 28, opacity: 0.5 }}>🎙</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 2, color: '#f87171' }}>
            VOICE CALL CRASHED
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>
            {this.state.error?.message || 'Unknown error'}
          </div>
          <button onClick={() => this.setState({ crashed: false, error: null })}
            style={{
              fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 2,
              padding: '8px 18px', background: 'var(--green)', color: '#000',
              border: 'none', cursor: 'pointer', borderRadius: 4,
            }}>
            ↺ RETRY
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
