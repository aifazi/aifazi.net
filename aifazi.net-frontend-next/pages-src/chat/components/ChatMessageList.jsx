'use client'
import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useMenu, contextMenu } from '../../../core/menu'
import { dialog } from '../../../core/dialog'
import { T, fmt, fmtDt, fmtSz, aCol } from '../chat-constants'
import { Avatar } from './Avatar'
import { Markdown } from './Markdown'
import { MediaPreviews } from './MediaPreview'

export function ChatMessageList({ msgs, me, isAdmin, onDel, onReply, onEdit, onReact, onMediaClick, elRef, onScroll, onPin, pinnedIds, onBatchDel, muteUser, kickUser, banUser, unmuteUser, unbanUser, roomMutes, roomBans, onMention }) {
  const [emojiPicker, setEmojiPicker] = useState(null)
  const [activeMsg, setActiveMsg] = useState(null)
  const [multiSelect, setMultiSelect] = useState(false)
  const [selectedIds, setSelectedIds] = useState([])
  const { openContextMenu } = useMenu()
  const REACTIONS = ['ðŸ‘','â¤ï¸','ðŸ˜‚','ðŸ˜®','ðŸ˜¢','ðŸŽ‰','ðŸ”¥','ðŸ‘€']

  const grouped = useMemo(() => {
    const g = []
    let last = null
    for (const m of msgs) {
      const dt = fmtDt(m.created_at)
      if (dt !== last?.date) g.push({ type: 'date', date: dt, ts: m.created_at })
      if (!last || last.sender !== m.sender || last.date !== dt) { g.push(m); last = { ...m, date: dt } }
      else { if (!last.group) { last.group = [last]; g[g.length - 1] = last } last.group.push(m) }
    }
    return g
  }, [msgs])

  const isPinned = (id) => Array.isArray(pinnedIds) && pinnedIds.includes(id)

  const toggleSelect = useCallback((id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }, [])

  const handleCtx = useCallback((e, m) => {
    e.preventDefault()
    e.stopPropagation()
    setActiveMsg(m.id)
    const items = [
      { icon:'â†©', label:'Reply', action:() => onReply(m) },
    ]
    if (m.sender === me) items.push({ icon:'âœï¸', label:'Edit', action:() => onEdit(m) })
    if (m.sender === me || isAdmin) items.push({ icon:'ðŸ—‘', label:'Delete', variant:'danger', action:() => onDel(m.id) })
    items.push(
      { icon:'ðŸ“‹', label:'Copy text', sublabel:(m.content||'').slice(0,30), action:() => navigator.clipboard?.writeText(m.content||'') },
      { type:'separator' },
    )
    if (onPin) items.push({ icon:'ðŸ“Œ', label: isPinned(m.id) ? 'Unpin message' : 'Pin message', color: isPinned(m.id) ? T.accent : undefined, action:() => onPin(m.id) })
    items.push(
      { icon:'ðŸ˜Š', label:'React', action:() => { setEmojiPicker(emojiPicker === m.id ? null : m.id) } },
      { type:'separator' },
      { icon:'â˜‘ï¸', label: multiSelect ? 'Exit selection' : 'Select multiple', action:() => { setMultiSelect(v => !v); setSelectedIds([]) } },
    )
    openContextMenu(e, items, { header: m.sender })
  }, [me, isAdmin, onDel, onReply, onEdit, onReact, onPin, onMediaClick, openContextMenu, emojiPicker, multiSelect])

  const batchDel = useCallback(async () => {
    if (!onBatchDel || selectedIds.length === 0) return
    await onBatchDel(selectedIds)
    setSelectedIds([])
    setMultiSelect(false)
  }, [selectedIds, onBatchDel])

  const elRef2 = useRef(null)

  return (
    <div ref={elRef || elRef2} onScroll={onScroll} style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
      {multiSelect && selectedIds.length > 0 && (
        <div style={{ position:'sticky', top:0, zIndex:10, display:'flex', alignItems:'center', gap:8, padding:'6px 14px', background:'color-mix(in srgb, var(--cyan) 8%, transparent)', borderBottom:`1px solid color-mix(in srgb, var(--cyan) 20%, transparent)`, marginBottom:4, fontFamily:T.mono, fontSize:10 }}>
          <span style={{ color:T.muted }}>{selectedIds.length} selected</span>
          <button onClick={()=>setSelectedIds(msgs.map(m=>m.id))} style={{ background:'none', border:'1px solid '+T.border, color:T.muted, cursor:'pointer', padding:'2px 8px', fontSize:9 }}>Select all</button>
          <button onClick={()=>{setSelectedIds([]);setMultiSelect(false)}} style={{ background:'none', border:'1px solid '+T.border, color:T.muted, cursor:'pointer', padding:'2px 8px', fontSize:9 }}>Deselect</button>
          <button onClick={batchDel} style={{ background:'rgba(255,71,87,0.15)', border:'1px solid rgba(255,71,87,0.3)', color:'#ff4757', cursor:'pointer', padding:'2px 8px', fontSize:9, marginLeft:'auto' }}>ðŸ—‘ Delete {selectedIds.length}</button>
          <div style={{ position:'relative' }}>
            <button onClick={()=>setEmojiPicker(emojiPicker === 'batch' ? null : 'batch')} style={{ background:'none', border:'1px solid '+T.border, color:T.muted, cursor:'pointer', padding:'2px 8px', fontSize:9 }}>ðŸ˜Š React</button>
            {emojiPicker === 'batch' && (
              <div style={{ position:'absolute', bottom:'100%', right:0, background:T.bg2, border:`1px solid ${T.border}`, borderRadius:8, padding:'4px 6px', display:'flex', gap:3, zIndex:10, boxShadow:'0 4px 16px rgba(0,0,0,0.4)' }}>
                {REACTIONS.map(e2 => (
                  <button key={e2} onClick={()=>{ selectedIds.forEach(id => onReact(id, e2)); setEmojiPicker(null); setMultiSelect(false); setSelectedIds([]) }}
                    style={{ background:'none', border:'none', cursor:'pointer', fontSize:16, padding:'2px 4px', borderRadius:4 }}
                    onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.08)'}
                    onMouseLeave={e => e.currentTarget.style.background='none'}>{e2}</button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      {grouped.map((item, i) => {
        if (item.type === 'date') return (
          <div key={`d-${i}`} style={{ textAlign: 'center', padding: '8px 0', fontFamily: T.mono, fontSize: 10, color: T.muted, letterSpacing: 1 }}>
            <span style={{ background: 'rgba(255,255,255,0.04)', padding: '2px 10px', borderRadius: 10 }}>{item.date}</span>
          </div>
        )
        const isMe = item.sender === me
        const group = item.group || [item]
        return (
          <div key={item.id || i} data-msg-id={item.id}
            style={{ display:'flex', gap:10, padding:'4px 14px', alignItems:'flex-start', flexDirection: isMe ? 'row-reverse' : 'row' }}
            onContextMenu={e => handleCtx(e, item)}>
            <Avatar name={item.sender} size={34} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 2, flexDirection: isMe ? 'row-reverse' : 'row' }}>
                <span onContextMenu={e => { e.preventDefault(); contextMenu.open(e, [
                    { icon:'ðŸ‘¤', label:item.sender, sublabel:me === item.sender ? 'You' : item.sender },
                    { type:'separator' },
                    ...(me !== item.sender ? [{ icon:'â†©', label:'Reply to', action:() => onReply(item) }] : []),
                    ...(me !== item.sender ? [{ icon:'ðŸ’¬', label:'Mention', action:() => onMention?.(item.sender) }] : []),
                    ...(isAdmin && me !== item.sender ? [
                      { type:'separator' },
                      ...(roomMutes?.some(m => m.username === item.sender)
                        ? [{ icon:'ðŸ”Š', label:'Unmute User', color:T.accent, action:async () => { await unmuteUser?.(item.sender) } }]
                        : [{ icon:'ðŸ”‡', label:'Mute User', color:T.warn, action:async () => { const dur = await dialog.prompt({ title:`Mute ${item.sender}`, placeholder:'Minutes (0=permanent)', defaultValue:'60' }); if (dur !== null) muteUser?.(item.sender, parseInt(dur||'60')) } }]),
                      { icon:'ðŸš«', label:'Kick User', color:'#ff6b35', action:async () => { const ok = await dialog.confirm({ title:`Kick ${item.sender}?`, confirmLabel:'KICK', variant:'danger' }); if (ok) kickUser?.(item.sender) } },
                      ...(roomBans?.some(b => b.username === item.sender)
                        ? [{ icon:'âœ…', label:'Unban User', color:T.accent, action:async () => { await unbanUser?.(item.sender) } }]
                        : [{ icon:'â›”', label:'Ban User', color:T.danger, action:async () => { const ok = await dialog.confirm({ title:`Ban ${item.sender}?`, message:'Until manually unbanned.', confirmLabel:'BAN', variant:'danger' }); if (ok) banUser?.(item.sender) } }]),
                    ] : []),
                  ], { header: item.sender }) }}
                  style={{ fontWeight:700, fontSize:13, color:aCol(item.sender), fontFamily:T.display, cursor:'pointer' }}>{item.sender}</span>
                <span style={{ fontSize: 10, color: T.muted, fontFamily: T.mono }}>{fmt(item.created_at)}</span>
                {item.edited && <span style={{ fontSize: 9, color: T.muted, fontStyle: 'italic' }}>(edited)</span>}
                {isPinned(item.id) && <span style={{ fontSize:9, color:T.accent }}>ðŸ“Œ</span>}
              </div>
              {group.map((m, gi) => (
                <div key={m.id || gi} style={{ display:'flex', gap:8, marginBottom:2, alignItems:'flex-start',
                  background: selectedIds.includes(m.id) ? 'color-mix(in srgb, var(--green) 6%, transparent)' : activeMsg === m.id ? 'color-mix(in srgb, var(--cyan) 4%, transparent)' : 'transparent' }}>
                  {multiSelect && (
                    <div onClick={() => toggleSelect(m.id)} style={{ cursor:'pointer', flexShrink:0, display:'flex', alignItems:'center', height:34, justifyContent:'center', width:16 }}>
                      <div style={{ width:16, height:16, borderRadius:3, border: selectedIds.includes(m.id) ? `1.5px solid ${T.accent}` : `1.5px solid ${T.border}`, background: selectedIds.includes(m.id) ? T.accent : 'transparent', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, color:'#000' }}>
                        {selectedIds.includes(m.id) && 'âœ“'}
                      </div>
                    </div>
                  )}
                  <div style={{ flex:1, textAlign: isMe ? 'right' : 'left' }}>
                  {m.reply_to && (
                    <div style={{ borderLeft: `2px solid ${T.accentB}`, paddingLeft: 8, marginBottom: 4, fontFamily: T.mono, fontSize: 10, color: T.muted, textAlign: 'left' }}>
                      <span style={{ color: T.accentB }}>â†© {m.reply_to.sender}: </span>{m.reply_to.content?.slice(0, 100)}
                    </div>
                  )}
                  <div style={{ lineHeight: 1.5, fontSize: 13, color: T.text, wordBreak: 'break-word' }}>
                    {m.type === 'image' ? (
                      <img src={m.content} alt="" loading="lazy" style={{ maxWidth: '100%', maxHeight: 400, borderRadius: 8, objectFit: 'contain', cursor: 'pointer' }}
                        onClick={() => onMediaClick?.({ url: m.content, type: m.type })} />
                    ) : m.type === 'file' ? (
                      <div><a href={m.content} target='_blank' style={{ color: T.accentB, textDecoration: 'none' }}>ðŸ“Ž {m.file_name || 'file'}</a> <span style={{ fontSize: 10, color: T.muted }}>{fmtSz(m.file_size)}</span></div>
                    ) : <Markdown text={m.content} />}
                    {m.type === 'text' && <MediaPreviews text={m.content} onMediaClick={onMediaClick} right={isMe} />}
                  </div>
                  {m.reactions && Object.keys(m.reactions).length > 0 && (
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 3, justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
                      {Object.entries(m.reactions).map(([emoji, users]) => (
                        <button key={emoji} onClick={() => onReact(m.id, emoji)}
                          style={{ padding: '1px 7px', border: `1px solid ${(users || []).includes(me) ? 'color-mix(in srgb, var(--green) 40%, transparent)' : T.border}`, borderRadius: 10,
                            background: (users || []).includes(me) ? 'color-mix(in srgb, var(--green) 8%, transparent)' : 'rgba(255,255,255,0.03)',
                            color: T.text, fontFamily: T.mono, fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                          {emoji} <span style={{ fontSize: 9, color: T.muted }}>{users?.length || 0}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <div style={{ position:'relative' }}>
                    <div style={{ display:'flex', gap:4, marginTop:3, opacity:0, transition:'opacity 0.15s', justifyContent: isMe ? 'flex-end' : 'flex-start', alignItems:'center' }}
                      onMouseEnter={e => { e.currentTarget.style.opacity = 1 }}
                      onMouseLeave={e => { e.currentTarget.style.opacity = 0 }}>
                      <button onClick={()=>onReply(m)} title="Reply" style={{ background:'none', border:'none', color:T.muted, cursor:'pointer', fontSize:10 }}>â†©</button>
                      <button onClick={()=>{ setEmojiPicker(emojiPicker === m.id ? null : m.id) }} title="React" style={{ background:'none', border:'none', color:T.muted, cursor:'pointer', fontSize:10 }}>ðŸ˜Š</button>
                      {isMe && <button onClick={()=>onEdit(m)} title="Edit" style={{ background:'none', border:'none', color:T.muted, cursor:'pointer', fontSize:10 }}>âœ</button>}
                      <button onClick={()=>navigator.clipboard?.writeText(m.content||'')} title="Copy" style={{ background:'none', border:'none', color:T.muted, cursor:'pointer', fontSize:10 }}>ðŸ“‹</button>
                      {(isMe||isAdmin) && <button onClick={()=>onDel(m.id)} title="Delete" style={{ background:'none', border:'none', color:'#ff4757', cursor:'pointer', fontSize:10 }}>ðŸ—‘</button>}
                    </div>
                    {emojiPicker === m.id && (
                      <div style={{ position:'absolute', bottom:'100%', left:0, background:T.bg2, border:`1px solid ${T.border}`, borderRadius:8, padding:'4px 6px', display:'flex', gap:3, zIndex:10, boxShadow:'0 4px 16px rgba(0,0,0,0.4)' }}>
                        {REACTIONS.map(e2 => (
                          <button key={e2} onClick={()=>{ onReact(m.id, e2); setEmojiPicker(null) }}
                            style={{ background:'none', border:'none', cursor:'pointer', fontSize:16, padding:'2px 4px', borderRadius:4 }}
                            onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.08)'}
                            onMouseLeave={e => e.currentTarget.style.background='none'}>{e2}</button>
                        ))}
                      </div>
                    )}
                    </div>
                </div>
              </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
