'use client'
/**
 * FiveMPanel.jsx — FiveM admin tools for whitelist, queue priority, and bans.
 */
import React, { useState, useEffect, useCallback } from 'react'
import api from '@/lib/api'
import { useToast } from '../../components/Toast'
import { useDialog } from '../../components/Dialog'
import { Checkbox, DateTimePicker, Input, Select, TextArea } from '../../core/ui.jsx'
import { PageHeader } from './shared'
import { Btn as KitBtn, Badge as KitBadge, RelTime as KitRelTime, MONO } from './ui'
import { Pagination } from './ui'

const G    = '#00FF88'
const C    = '#00D4FF'
const BG2  = 'var(--bg2)'
const BG3  = 'var(--bg3)'
const BD   = 'var(--border)'
const TEXT = 'var(--text)'
const MUTED= 'var(--muted)'
const PRIORITY_PRESETS = [
  { tier:'None', level:0 },
  { tier:'VIP', level:10 },
  { tier:'VIP+', level:25 },
  { tier:'Founder', level:50 },
  { tier:'Staff', level:100 },
]

// ── Shared atoms (delegate to the admin UI kit) ───────────────────────────────
function Badge({ color, children, style }) {
  return <KitBadge color={color} style={{ textTransform:'uppercase', letterSpacing:0.5, ...(style || {}) }}>{children}</KitBadge>
}

function Btn({ onClick, color=G, children, small, disabled, danger, full, ...rest }) {
  return <KitBtn variant="outline" color={color} onClick={onClick} disabled={disabled} danger={danger} full={full} small={small} {...rest}>{children}</KitBtn>
}

function RelTime({ iso }) {
  if (!iso) return <span style={{color:MUTED}}>—</span>
  return <span title={new Date(iso).toLocaleString()} style={{color:MUTED, fontSize:11}}><KitRelTime iso={iso} /></span>
}

function SourceBadge({ source }) {
  const MAP = {
    'txadmin':   { color:'#facc15', icon:'🎮', label:'txAdmin' },
    'website':   { color:C,         icon:'🌐', label:'Website' },
    'website_only': { color:'#f97316', icon:'⚠️', label:'Website only' },
    'qbx_core': { color:G, icon:'✅', label:'qbx_core' },
    'qbx_unban_pending': { color:'#facc15', icon:'⏳', label:'Unban queued' },
    'qbx_core_unbanned': { color:G, icon:'✅', label:'Unbanned in core' },
    'qbx_sync_failed': { color:'#f97316', icon:'⚠️', label:'Server sync retrying' },
  }
  const m = MAP[source] || { color:MUTED, icon:'❓', label:source||'Unknown' }
  return <Badge color={m.color}>{m.icon} {m.label}</Badge>
}

function SyncBadge({ synced }) {
  return synced
    ? <Badge color={G}>✅ Server synced</Badge>
    : <Badge color='#f97316'>⏳ Server pending</Badge>
}

function BanSyncBadge({ synced }) {
  return synced
    ? <Badge color={G}>✅ Server synced</Badge>
    : <Badge color='#f97316'>⏳ Server pending</Badge>
}

function PlayerIdentifiers({ app }) {
  const ids = [
    ['license', app.fivem_license],
    ['steam', app.steam_hex],
    ['fivem', app.fivem_id],
  ].filter(([, value]) => value)

  if (!ids.length) return null
  return (
    <div style={{display:'flex',gap:6,flexWrap:'wrap',marginTop:5}}>
      {ids.map(([label, value])=>(
        <span key={`${label}-${value}`} style={{fontSize:10,color:MUTED,fontFamily:MONO,
          background:BG3,border:`1px solid ${BD}`,borderRadius:5,padding:'3px 6px',
          maxWidth:'100%',overflow:'hidden',textOverflow:'ellipsis'}}>
          {label}:{value}
        </span>
      ))}
    </div>
  )
}

function whitelistPlayerName(app) {
  return app?.character_name || app?.discord_name || 'Whitelisted player'
}

function whitelistPlayerIds(app) {
  if (!app) return []
  const fivemId = app.fivem_id
    ? String(app.fivem_id).startsWith('fivem:') ? String(app.fivem_id) : `fivem:${app.fivem_id}`
    : null
  const discordId = app.discord_id
    ? `discord:${String(app.discord_id).replace(/^discord:/, '')}`
    : null
  return [app.fivem_license, app.steam_hex, fivemId, discordId].filter(Boolean)
}

function normalizeIdentifier(value) {
  return String(value || '').trim().toLowerCase()
}

function banIdentifierList(ban) {
  const raw = ban?.all_ids
  let ids = []
  if (Array.isArray(raw)) {
    ids = raw
  } else if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw)
      ids = Array.isArray(parsed) ? parsed : raw.split(',')
    } catch {
      ids = raw.split(',')
    }
  }
  if (ban?.identifier) ids.unshift(ban.identifier)
  return [...new Set(ids.map(normalizeIdentifier).filter(Boolean))]
}

function activeBanForApp(app, bans) {
  const playerIds = new Set(whitelistPlayerIds(app).map(normalizeIdentifier))
  return bans.find(ban => banIdentifierList(ban).some(id => playerIds.has(id))) || null
}

// Ban duration presets, plus a custom date/time picker.
const DURATIONS = [
  { label:'2 Hours',   value:'2 hours' },
  { label:'12 Hours',  value:'12 hours' },
  { label:'1 Day',     value:'1 day' },
  { label:'2 Days',    value:'2 days' },
  { label:'1 Week',    value:'1 week' },
  { label:'2 Weeks',   value:'2 weeks' },
  { label:'1 Month',   value:'1 month' },
  { label:'Custom Date', value:'custom' },
  { label:'Permanent', value:'permanent' },
]

function DurationPicker({ value, onChange }) {
  return <Select value={value} onChange={onChange} options={DURATIONS.map(d => ({ value: d.value, label: d.label }))} />
}

// ── SERVER STATUS ─────────────────────────────────────────────────────────────
function ServerStatusPanel() {
  const toast = useToast()
  const [status, setStatus] = useState(null)
  const [stats,  setStats]  = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [sRes, stRes] = await Promise.allSettled([
      api.get('/fivem/status'), api.get('/fivem/stats')
    ])
    if (sRes.status==='fulfilled')  setStatus(sRes.value.data)
    if (stRes.status==='fulfilled') setStats(stRes.value.data)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])
  usePausableInterval(load, 15000)

  const refreshStatus = async () => {
    setRefreshing(true)
    try {
      const res = await api.post('/fivem/status/refresh')
      if (res?.data?.status) setStatus(res.data)
      toast.success('↻ Server status reloaded')
      await load()
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Status refresh failed')
    } finally {
      setRefreshing(false)
    }
  }

  if (loading) return <div style={{color:MUTED,fontFamily:MONO,padding:20}}>loading…</div>
  const online = status?.status === 'online'

  return (
    <div style={{display:'flex',flexDirection:'column',gap:20}}>
      <div style={{ background:BG2, border:`1px solid ${online?G+'40':BD}`,
        borderRadius:12, padding:20, display:'flex', alignItems:'center', gap:16,
        boxShadow:online?`0 0 24px ${G}18`:'none' }}>
        <div style={{ width:48,height:48,borderRadius:12,fontSize:22,
          background:online?`${G}18`:'#ff475718', border:`1px solid ${online?G:'#ff4757'}40`,
          display:'flex',alignItems:'center',justifyContent:'center' }}>
          {online?'🟢':'🔴'}
        </div>
        <div style={{flex:1}}>
          <div style={{fontSize:18,fontWeight:700,color:TEXT}}>{status?.server_name||'AIFAZI RP'}</div>
          <div style={{fontSize:13,color:MUTED,fontFamily:MONO}}>{status?.display_message}</div>
          {status?.last_seen&&<div style={{fontSize:11,color:MUTED,marginTop:4}}>Last ping: <RelTime iso={status.last_seen}/></div>}
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',justifyContent:'flex-end'}}>
          <Btn color={C} disabled={refreshing} onClick={refreshStatus}>
            {refreshing ? '⟳ Reloading…' : '↻ Reload Status'}
          </Btn>
          <Badge color={online?G:'#ff4757'}>{(status?.status||'offline').toUpperCase()}</Badge>
        </div>
      </div>
      {stats && (
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))',gap:12}}>
          {[
            {label:'Whitelisted',value:stats.whitelisted_players,icon:'✅',color:G},
            {label:'Pending',    value:stats.pending_applications,icon:'⏳',color:'#facc15'},
            {label:'Active bans',value:stats.active_bans,         icon:'🔨',color:'#ff4757'},
            {label:'Players now',value:`${stats.players_online}/${stats.max_players}`,icon:'🎮',color:C},
          ].map(s=>(
            <div key={s.label} style={{background:BG2,border:`1px solid ${BD}`,borderRadius:10,
              padding:'12px 16px',borderTop:`2px solid ${s.color}`}}>
              <div style={{fontSize:10,color:MUTED,fontFamily:MONO,letterSpacing:1,textTransform:'uppercase',marginBottom:4}}>
                {s.icon} {s.label}
              </div>
              <div style={{fontSize:26,fontWeight:700,fontFamily:MONO,color:s.color}}>{s.value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── WHITELIST ─────────────────────────────────────────────────────────────────
function WhitelistPanel() {
  const toast  = useToast()
  const dialog = useDialog()
  const [apps, setApps]         = useState([])
  const [activeBans, setActiveBans] = useState([])
  const [total, setTotal]       = useState(0)
  const [page, setPage]         = useState(1)
  const [filter, setFilter]     = useState('pending')
  const [search, setSearch]     = useState('')
  const [loading, setLoading]   = useState(true)
  const [selected, setSelected] = useState(null)
  const [reviewNote, setNote]   = useState('')
  const [priorityForm, setPriorityForm] = useState({ tier:'None', level:0, permanent:true, expires_at:'' })
  const [reviewing, setReviewing] = useState(null)
  const [syncingId, setSyncingId] = useState(null)
  const [syncingServer, setSyncingServer] = useState(false)
  const [showManual, setShowManual] = useState(false)
  const [manualForm, setManual] = useState({discord_id:'',discord_name:'',character_name:'',steam_hex:'',fivem_license:'',fivem_id:'',reviewer_note:''})
  const setM = k => v => setManual(f=>({...f,[k]:v}))
  const [saving, setSaving]     = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const q = search.trim()
    const statusParam = filter ? `status=${encodeURIComponent(filter)}&` : ''
    const offset = (page - 1) * 50
    const endpoint = q
      ? `/fivem/whitelist/search?${statusParam}limit=50&offset=${offset}&q=${encodeURIComponent(q)}`
      : `/fivem/whitelist?${statusParam}limit=50&offset=${offset}`
    const [appsRes, bansRes] = await Promise.allSettled([
      api.get(endpoint),
      api.get('/fivem/bans?active=true&limit=200'),
    ])
    if (appsRes.status === 'fulfilled') {
      setApps(appsRes.value.data.applications||[])
      setTotal(appsRes.value.data.total||0)
    }
    if (bansRes.status === 'fulfilled') {
      setActiveBans(bansRes.value.data.bans||[])
    }
    setLoading(false)
  }, [filter, search, page])

  useEffect(() => { load() }, [load])
  usePausableInterval(load, 15000)
  useEffect(() => { setPage(1) }, [filter, search])
  useEffect(() => {
    if (!selected) return
    setPriorityForm({
      tier: selected.priority_tier || 'None',
      level: selected.priority_level || 0,
      permanent: !selected.priority_expires_at,
      expires_at: selected.priority_expires_at ? String(selected.priority_expires_at).slice(0, 16) : '',
    })
  }, [selected])

  const priorityPayload = () => {
    const level = Number(priorityForm.level || 0)
    return {
      priority_tier: level > 0 ? priorityForm.tier : null,
      priority_level: level,
      priority_expires_at: level > 0 && !priorityForm.permanent && priorityForm.expires_at
        ? new Date(priorityForm.expires_at).toISOString()
        : null,
    }
  }

  const syncServer = useCallback(async (reason = 'manual', appId = null) => {
    setSyncingServer(true)
    if (appId) setSyncingId(appId)
    try {
      const res = await api.post('/fivem/sync/refresh', { reason, app_id: appId || undefined })
      const data = res.data || {}
      const pending = data.pending || {}
      const queued = Number(pending.whitelist || 0) + Number(pending.bans || 0) +
        Number(pending.unbans || 0) + Number(pending.application_actions || 0)
      const synced = Number(data.synced || 0)
      toast.success(
        synced > 0
          ? `↻ Server sync refreshed — ${synced} pushed${queued ? `, ${queued} queued` : ''}`
          : queued
            ? `↻ Server sync requested — ${queued} queued`
            : '↻ Server sync refreshed'
      )
      return data
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Server sync refresh failed')
      return null
    } finally {
      setSyncingServer(false)
      if (appId) setSyncingId(null)
    }
  }, [toast])

  const review = async (id, status) => {
    setReviewing(id)
    try {
      await api.patch(`/fivem/whitelist/${id}`, {
        status,
        reviewer_note:reviewNote||undefined,
        ...(status === 'approved' ? priorityPayload() : {}),
      })
      toast.success(status==='approved'?'✅ Approved — syncing to server…':`Application ${status}`)
      await syncServer(`whitelist:${status}`, status === 'approved' ? id : null)
      setSelected(null); setNote(''); await load()
    } catch(e) { toast.error(e?.response?.data?.detail||'Failed') }
    finally { setReviewing(null) }
  }

  const savePriority = async id => {
    setReviewing(id)
    try {
      await api.patch(`/fivem/whitelist/${id}/priority`, priorityPayload())
      toast.success('Priority updated')
      await syncServer('whitelist:priority', id)
      await load()
    } catch(e) { toast.error(e?.response?.data?.detail||'Failed') }
    finally { setReviewing(null) }
  }

  const del = async id => {
    if (!await dialog.confirm({title:'Delete application?',message:'Cannot be undone.',confirmText:'Delete',danger:true})) return
    try { await api.delete(`/fivem/whitelist/${id}`); toast.success('Deleted'); await syncServer('whitelist:delete'); await load() }
    catch { toast.error('Failed') }
  }

  const banApproved = async app => {
    const ids = whitelistPlayerIds(app)
    if (!ids.length) { toast.error('Approved player has no usable identifiers'); return }
    const name = whitelistPlayerName(app)
    if (!await dialog.confirm({
      title:'Ban approved player?',
      message:`Create a permanent server ban for ${name}?`,
      confirmText:'Ban',
      danger:true,
    })) return
    setReviewing(app.id)
    try {
      await api.post('/fivem/bans', {
        player_name: name,
        identifiers: ids,
        reason: 'Banned from approved whitelist by admin',
        duration: 'permanent',
      })
      toast.success('🔨 Player banned — queued for server sync…')
      await syncServer('ban:create')
      await load()
    } catch(e) { toast.error(e?.response?.data?.detail||'Failed to ban player') }
    finally { setReviewing(null) }
  }

  const unbanApproved = async (app, ban) => {
    if (!ban?.id) { toast.error('Active ban record not found'); return }
    const name = whitelistPlayerName(app)
    if (!await dialog.confirm({
      title:'Unban approved player?',
      message:`Lift the active server ban for ${name}?`,
      confirmText:'Unban',
    })) return
    setReviewing(app.id)
    try {
      await api.post(`/fivem/bans/${ban.id}/unban`)
      toast.success('↩ Player unbanned — queued for server sync…')
      await syncServer('ban:unban')
      await load()
    } catch(e) { toast.error(e?.response?.data?.detail||'Failed to unban player') }
    finally { setReviewing(null) }
  }

  const submitManual = async () => {
    if (!manualForm.discord_id||!manualForm.discord_name||!manualForm.character_name) {
      toast.error('Discord ID, Name and Character Name required'); return
    }
    setSaving(true)
    try {
      await api.post('/fivem/whitelist/manual', {
        discord_id:manualForm.discord_id.trim(), discord_name:manualForm.discord_name.trim(),
        character_name:manualForm.character_name.trim(),
        steam_hex:manualForm.steam_hex.trim()||undefined,
        fivem_license:manualForm.fivem_license.trim()||undefined,
        fivem_id:manualForm.fivem_id.trim()||undefined,
        reviewer_note:manualForm.reviewer_note.trim()||undefined,
      })
      toast.success('✅ Player whitelisted + syncing to server')
      await syncServer('whitelist:manual')
      setShowManual(false); setFilter('approved'); await load()
    } catch(e) { toast.error(e?.response?.data?.detail||'Failed') }
    finally { setSaving(false) }
  }

  const TAB = {pending:'#facc15',approved:G,denied:'#ff4757','':C}
  return (
    <div style={{display:'flex',flexDirection:'column',gap:16}}>
      <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
        {['pending','approved','denied',''].map(s=>(
          <button key={s} onClick={()=>setFilter(s)}
            style={{background:filter===s?`${TAB[s]}18`:BG2,border:`1px solid ${filter===s?TAB[s]+'60':BD}`,
              color:filter===s?TAB[s]:MUTED,borderRadius:6,padding:'6px 14px',
              fontSize:12,fontFamily:MONO,cursor:'pointer'}}>
            {s||'all'}{filter===s&&total?` (${total})`:''}
          </button>
        ))}
        <div style={{marginLeft:'auto',display:'flex',gap:8}}>
          <span style={{fontSize:11,color:MUTED,fontFamily:MONO}}>↻ 15s</span>
          <Btn color={C} disabled={syncingServer} onClick={()=>syncServer('manual:refresh').then(load)}>
            {syncingServer ? '⟳ Syncing…' : '↻ Sync Server'}
          </Btn>
          <div style={{width:300,maxWidth:'52vw'}}>
            <Input value={search} onChange={setSearch} placeholder="Search name, Discord, FiveM, license..."/>
          </div>
          <Btn color={G} onClick={()=>setShowManual(v=>!v)}>➕ Add Manually</Btn>
        </div>
      </div>

      {showManual && (
        <div style={{background:BG2,border:`1px solid ${G}40`,borderRadius:10,padding:20,display:'flex',flexDirection:'column',gap:12}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <span style={{fontSize:12,color:G,fontFamily:MONO}}>➕ MANUALLY ADD PLAYER</span>
            <Btn color={MUTED} small onClick={()=>setShowManual(false)}>✕</Btn>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
            {[['Discord ID *','discord_id'],['Discord Name *','discord_name'],
              ['Character Name *','character_name'],['Steam Hex','steam_hex'],
              ['FiveM License','fivem_license'],['FiveM ID','fivem_id'],['Note','reviewer_note']
            ].map(([lbl,k])=>(
              <div key={k}>
                <div style={{fontSize:10,color:MUTED,fontFamily:MONO,marginBottom:4}}>{lbl.toUpperCase()}</div>
                <Input value={manualForm[k]} onChange={setM(k)} placeholder={lbl}/>
              </div>
            ))}
          </div>
          <div style={{display:'flex',gap:8}}>
            <Btn color={G} disabled={saving} onClick={submitManual}>{saving?'⟳ Adding…':'✅ Whitelist Player'}</Btn>
            <Btn color={MUTED} onClick={()=>setShowManual(false)}>Cancel</Btn>
          </div>
        </div>
      )}

      {loading&&apps.length===0?<div style={{color:MUTED,fontFamily:MONO,padding:20}}>loading…</div>
      :apps.length===0?<div style={{color:MUTED,padding:20,textAlign:'center'}}>No {filter||''} applications</div>
      :apps.map(app=>{
        const activeBan = activeBanForApp(app, activeBans)
        return (
        <div key={app.id} style={{background:BG2,border:`1px solid ${selected?.id===app.id?G+'40':BD}`,
          borderRadius:10,padding:'14px 16px',cursor:'pointer',transition:'border-color 0.14s'}}
          onClick={e=>{ if(e.target.closest('textarea,input,button,select,[data-core-control]')) return; setSelected(selected?.id===app.id?null:app) }}>
          <div style={{display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:600,color:TEXT}}>{app.character_name}</div>
              <div style={{fontSize:12,color:MUTED,fontFamily:MONO,marginTop:2}}>
                {app.discord_name} · {app.discord_id}
              </div>
              <PlayerIdentifiers app={app}/>
              <div style={{fontSize:11,color:MUTED,marginTop:2}}>
                <RelTime iso={app.applied_at}/>
                {app.reviewed_by&&` · ${app.reviewed_by}`}
              </div>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:4,alignItems:'flex-end'}}>
              <Badge color={app.status==='approved'?G:app.status==='denied'?'#ff4757':'#facc15'}>{app.status}</Badge>
              {activeBan&&<Badge color='#ff4757'>🔨 Banned</Badge>}
              {Number(app.priority_level||0)>0&&(
                <Badge color='#facc15'>
                  {app.priority_tier||'Priority'} · {app.priority_level}{app.priority_expires_at?'':' · permanent'}
                </Badge>
              )}
              {app.status==='approved'&&<SyncBadge synced={app.txadmin_synced}/>}
            </div>
          </div>
          {selected?.id===app.id&&(
            <div style={{marginTop:16,display:'flex',flexDirection:'column',gap:10}}>
              {app.character_backstory&&app.character_backstory!=='Manually added by admin.'&&(
                <div style={{background:BG3,borderRadius:6,padding:'8px 12px'}}>
                  <div style={{fontSize:10,color:MUTED,fontFamily:MONO,textTransform:'uppercase',marginBottom:4}}>Backstory</div>
                  <div style={{fontSize:13,color:TEXT,lineHeight:1.6}}>{app.character_backstory}</div>
                </div>
              )}
              {app.why_join&&app.why_join!=='Manually added by admin.'&&(
                <div style={{background:BG3,borderRadius:6,padding:'8px 12px'}}>
                  <div style={{fontSize:10,color:MUTED,fontFamily:MONO,textTransform:'uppercase',marginBottom:4}}>Why Join</div>
                  <div style={{fontSize:13,color:TEXT,lineHeight:1.6}}>{app.why_join}</div>
                </div>
              )}
              {app.extra_answers && Object.keys(app.extra_answers).length > 0 && (
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:8}}>
                  {Object.entries(app.extra_answers).filter(([,v]) => v).map(([key,value]) => (
                    <div key={key} style={{background:BG3,borderRadius:6,padding:'8px 12px'}}>
                      <div style={{fontSize:10,color:MUTED,fontFamily:MONO,textTransform:'uppercase',marginBottom:4}}>
                        {key.replace(/_/g,' ')}
                      </div>
                      <div style={{fontSize:13,color:TEXT,lineHeight:1.6}}>{String(value)}</div>
                    </div>
                  ))}
                </div>
              )}
              <div onClick={e=>e.stopPropagation()}>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr auto auto',gap:8,alignItems:'end',marginBottom:10}}>
                  <div>
                    <div style={{fontSize:10,color:MUTED,fontFamily:MONO,marginBottom:4}}>PRIORITY TIER</div>
                    <Select
                      value={priorityForm.level}
                      onChange={value => {
                        const preset = PRIORITY_PRESETS.find(p => p.level === Number(value)) || PRIORITY_PRESETS[0]
                        setPriorityForm(f => ({...f, tier:preset.tier, level:preset.level, permanent:preset.level > 0 ? f.permanent : true}))
                      }}
                      options={PRIORITY_PRESETS.map(p => ({ value:p.level, label:`${p.tier} (${p.level})` }))}
                    />
                  </div>
                  <div>
                    <div style={{fontSize:10,color:MUTED,fontFamily:MONO,marginBottom:4}}>CUSTOM NAME</div>
                    <Input value={priorityForm.tier} onChange={v=>setPriorityForm(f=>({...f,tier:v}))} placeholder="VIP"/>
                  </div>
                  <div>
                    <div style={{fontSize:10,color:MUTED,fontFamily:MONO,marginBottom:4}}>EXPIRES AT</div>
                    <DateTimePicker
                      value={priorityForm.expires_at}
                      onChange={v=>setPriorityForm(f=>({...f,expires_at:v,permanent:false}))}
                      placeholder="Permanent unless set..."
                      disabled={priorityForm.permanent||Number(priorityForm.level||0)===0}
                      dropdownAlign="right"
                      style={{opacity:priorityForm.permanent||Number(priorityForm.level||0)===0?0.5:1}}
                    />
                  </div>
                  <Checkbox
                    checked={priorityForm.permanent}
                    disabled={Number(priorityForm.level||0)===0}
                    onChange={checked=>setPriorityForm(f=>({...f,permanent:checked}))}
                    label="Permanent"
                    style={{alignSelf:'end'}}
                  />
                  {app.status==='approved'&&(
                    <Btn color='#facc15' disabled={!!reviewing} onClick={()=>savePriority(app.id)}>Save Priority</Btn>
                  )}
                </div>
                <TextArea value={reviewNote} onChange={setNote} placeholder="Reviewer note (optional)…"/>
              </div>
              <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                <Btn color={G}
                  disabled={!!reviewing||app.status==='approved'}
                  onClick={()=>review(app.id,'approved')}>
                  {syncingId===app.id ? '⟳ Syncing…' : '✅ Approve + Sync Server'}
                </Btn>
                <Btn color='#ff4757' danger
                  disabled={!!reviewing||app.status==='denied'}
                  onClick={()=>review(app.id,'denied')}>
                  ❌ Deny
                </Btn>
                {app.status==='approved'&&(
                  activeBan ? (
                    <Btn color={G}
                      disabled={!!reviewing}
                      onClick={()=>unbanApproved(app, activeBan)}>
                      ↩ Unban
                    </Btn>
                  ) : (
                    <Btn color='#ff4757' danger
                      disabled={!!reviewing}
                      onClick={()=>banApproved(app)}>
                      🔨 Ban
                    </Btn>
                  )
                )}
                <Btn color='#facc15'
                  disabled={!!reviewing||app.status==='pending'}
                  onClick={()=>review(app.id,'pending')}>
                  ⏳ Reset
                </Btn>
                <Btn color='#ff4757' danger small
                  disabled={app.status==='approved'}
                  title={app.status==='approved'?'Cannot delete an approved player':'Delete application'}
                  onClick={()=>app.status!=='approved'&&del(app.id)}>
                  🗑 Delete
                </Btn>
              </div>
            </div>
          )}
          </div>
        )
      })}
      <Pagination page={page} total={total} pageSize={50}
        label={`${total} applications`} onChange={p => { setPage(p); }} />
    </div>
  )
}

// ── UNIVERSAL FORMS ──────────────────────────────────────────────────────────
function FormsPanel() {
  const toast = useToast()
  const [forms, setForms] = useState([])
  const [selectedSlug, setSelectedSlug] = useState('')
  const [editingSlug, setEditingSlug] = useState('')
  const [form, setForm] = useState(null)
  const [submissions, setSubmissions] = useState([])
  const [status, setStatus] = useState('pending')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [reviewing, setReviewing] = useState(null)
  const [reviewNotes, setReviewNotes] = useState({})

  const fieldTypes = [
    { value:'text', label:'Text' }, { value:'textarea', label:'Textarea' },
    { value:'number', label:'Number' }, { value:'select', label:'Select' },
  ]
  const gameTypes = [
    { value:'none', label:'No game action' }, { value:'job', label:'QBX job' }, { value:'group', label:'ACE / group' },
  ]
  const roleOptions = [
    { value:'', label:'No website role' }, { value:'member', label:'Member' },
    { value:'moderator', label:'Moderator' }, { value:'admin', label:'Admin' }, { value:'editor', label:'Editor' },
  ]
  const defaults = {
    staff:{ website_role:'moderator', game_type:'group', game_group:'staff' },
    moderator:{ website_role:'moderator', game_type:'group', game_group:'mod' },
    admin:{ website_role:'admin', game_type:'group', game_group:'admin' },
    police:{ website_role:'', game_type:'job', game_job:'police', game_grade:0 },
    ambulance:{ website_role:'', game_type:'job', game_job:'ambulance', game_grade:0 },
    doj:{ website_role:'', game_type:'job', game_job:'lawyer', game_grade:0 },
  }

  const slugify = v => String(v || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  const emptyField = () => ({ id:'', label:'', type:'text', required:false, placeholder:'', options:'', min_length:'' })
  const normalizeField = (f = {}) => ({
    id:f.id || '', label:f.label || '', type:f.type || 'text', required:!!f.required,
    placeholder:f.placeholder || f.help || '', options:Array.isArray(f.options) ? f.options.join(', ') : (f.options || ''),
    min_length:f.min_length || '',
  })
  const actionToState = (slug, action = {}) => {
    const game = action?.game || {}
    return {
      ...(defaults[slug] || { website_role:'', game_type:'none', game_job:'', game_grade:0, game_group:'' }),
      website_role: action?.website_role || defaults[slug]?.website_role || '',
      game_type: game?.type || defaults[slug]?.game_type || 'none',
      game_job: game?.job || defaults[slug]?.game_job || '',
      game_grade: Number(game?.grade ?? defaults[slug]?.game_grade ?? 0),
      game_group: game?.group || defaults[slug]?.game_group || '',
    }
  }
  const normalizeForm = (f = {}) => {
    const locked = !!f.system_locked || f.form_kind === 'whitelist' || f.slug === 'whitelist'
    return {
      slug:f.slug || '', title:f.title || '', category:f.category || 'fivem', description:f.description || '', intro:f.intro || '',
      success_message:f.success_message || 'Application submitted. Staff will review it soon.',
      active:(f.status || 'active') === 'active', require_login:f.require_login !== false, require_whitelist: locked ? false : f.require_whitelist !== false,
      email_template_purpose:f.email_template_purpose || (locked ? 'whitelist_submitted' : 'application_submitted'),
      fields:Array.isArray(f.fields) && f.fields.length ? f.fields.map(normalizeField) : [emptyField()],
      form_kind:f.form_kind || (locked ? 'whitelist' : 'universal'), system_locked:locked, public_path:f.public_path || (locked ? '/whitelist' : `/forms/${f.slug || ''}`),
      ...actionToState(f.slug, f.approval_action || {}),
      ...(locked ? { website_role:'', game_type:'none', game_job:'', game_grade:0, game_group:'' } : {}),
    }
  }
  const buildAction = () => {
    const action = {}
    if (form.website_role) action.website_role = form.website_role
    if (form.game_type === 'job') action.game = { type:'job', job:form.game_job || '', grade:Number(form.game_grade || 0) }
    if (form.game_type === 'group') action.game = { type:'group', group:form.game_group || '' }
    return action
  }
  const notifyInfo = (message, title = 'Forms') => toast.info(message, { title })
  const notifySuccess = (message, title = 'Forms') => toast.success(message, { title })
  const notifyError = (message, title = 'Forms') => toast.error(message, { title })

  const loadForms = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/forms/admin/definitions')
      const rows = Array.isArray(res.data) ? res.data : (res.data?.forms || [])
      setForms(rows)
      const nextSlug = selectedSlug || rows[0]?.slug || ''
      setSelectedSlug(nextSlug)
      setEditingSlug(nextSlug)
      setForm(normalizeForm(rows.find(r => r.slug === nextSlug) || rows[0] || { slug:'staff', title:'Staff Application' }))
    } catch (e) {
      notifyError(e?.response?.data?.detail || e.message, 'Forms failed')
    } finally { setLoading(false) }
  }, [])
  const loadSubmissions = useCallback(async () => {
    try {
      const params = { status: status === 'all' ? '' : status }
      if (selectedSlug) params.slug = selectedSlug
      const res = await api.get('/forms/admin/submissions', { params })
      setSubmissions(Array.isArray(res.data) ? res.data : (res.data?.submissions || []))
    } catch { setSubmissions([]) }
  }, [selectedSlug, status])

  useEffect(() => { loadForms() }, [loadForms])
  useEffect(() => {
    const found = forms.find(f => f.slug === selectedSlug)
    if (found) { setEditingSlug(found.slug); setForm(normalizeForm(found)) }
  }, [selectedSlug, forms])
  useEffect(() => { loadSubmissions() }, [loadSubmissions])

  const selectForm = slug => {
    setSelectedSlug(slug)
    const picked = forms.find(f => f.slug === slug)
    if (picked) notifyInfo(`Editing ${picked.title || picked.slug}.`)
  }
  const updateField = (idx, patch, message) => {
    setForm(f => ({ ...f, fields:f.fields.map((field, i) => i === idx ? { ...field, ...patch } : field) }))
    if (message) notifyInfo(message, 'Field updated')
  }
  const addField = () => {
    setForm(f => ({ ...f, fields:[...(f?.fields || []), emptyField()] }))
    notifySuccess('Field added.')
  }
  const removeField = idx => {
    const label = form?.fields?.[idx]?.label || form?.fields?.[idx]?.id || `Field ${idx + 1}`
    setForm(f => ({ ...f, fields:f.fields.filter((_, i) => i !== idx) }))
    notifySuccess(`${label} removed.`)
  }
  const createNew = () => {
    const fresh = normalizeForm({ slug:'new-application', title:'New Application', category:'fivem', fields:[emptyField()] })
    setSelectedSlug(''); setEditingSlug(''); setForm(fresh); setSubmissions([])
    notifyInfo('New form draft created.')
  }
  const setFormFlag = (key, value, label) => {
    if (key === 'require_whitelist' && form?.system_locked) {
      notifyInfo('Whitelist requirement is locked for the system whitelist form.', 'Locked')
      return
    }
    setForm(f => ({ ...f, [key]:value }))
    notifyInfo(`${label} ${value ? 'enabled' : 'disabled'}.`)
  }
  const setApproval = (patch, message) => {
    if (form?.system_locked) {
      notifyInfo('Approval action is locked for the system whitelist form.', 'Locked')
      return
    }
    setForm(f => ({ ...f, ...patch }))
    if (message) notifyInfo(message, 'Approval action')
  }
  const saveForm = async () => {
    const cleanSlug = slugify(form?.slug)
    if (!cleanSlug || !form?.title) return notifyError('Slug and title are required.', 'Missing form info')
    const locked = !!form.system_locked || form.form_kind === 'whitelist' || editingSlug === 'whitelist'
    const fields = (form.fields || []).filter(f => f.id && f.label).map(f => ({
      id:f.id.trim(), label:f.label.trim(), type:f.type || 'text', required:!!f.required,
      placeholder:f.placeholder || '', help:f.placeholder || '',
      options:f.type === 'select' ? String(f.options || '').split(',').map(x => x.trim()).filter(Boolean) : undefined,
      min_length:f.min_length ? Number(f.min_length) : undefined,
    }))
    if (!fields.length) return notifyError('Add at least one field before saving.', 'No fields')
    setSaving(true)
    try {
      const payload = {
        slug:cleanSlug, title:form.title, category:form.category || 'fivem', description:form.description || '', intro:form.intro || '',
        success_message:form.success_message || 'Application submitted. Staff will review it soon.',
        status:form.active ? 'active' : 'draft', require_login:form.require_login !== false,
        require_whitelist:locked ? false : form.require_whitelist !== false, email_template_purpose:form.email_template_purpose || (locked ? 'whitelist_submitted' : 'application_submitted'),
        fields, approval_action:locked ? { type:'server_whitelist' } : buildAction(),
        form_kind:locked ? 'whitelist' : 'universal', system_locked:locked, public_path:locked ? '/whitelist' : `/forms/${cleanSlug}`,
      }
      const method = editingSlug ? 'put' : 'post'
      const url = editingSlug ? `/forms/admin/definitions/${editingSlug}` : '/forms/admin/definitions'
      await api[method](url, payload)
      notifySuccess(`${form.title} is ready at ${locked ? '/whitelist' : `/forms/${cleanSlug}`}`, 'Form saved')
      setSelectedSlug(cleanSlug); setEditingSlug(cleanSlug)
      await loadForms()
    } catch (e) { notifyError(e?.response?.data?.detail || e.message, 'Save failed') }
    finally { setSaving(false) }
  }
  const reviewSubmission = async (id, nextStatus) => {
    setReviewing(id)
    try {
      await api.patch(`/forms/admin/submissions/${id}`, { status:nextStatus, reviewer_note:reviewNotes[id] || '' })
      notifySuccess(`Marked ${nextStatus}.`, 'Submission updated')
      await loadSubmissions()
    } catch (e) { notifyError(e?.response?.data?.detail || e.message, 'Review failed') }
    finally { setReviewing(null) }
  }

  if (loading || !form) return <div style={{padding:22,color:MUTED,fontFamily:MONO}}>Loading forms...</div>

  return (
    <div style={{display:'flex',flexDirection:'column',gap:18}}>
      <div style={{border:`1px solid ${BD}`,borderRadius:8,background:BG2,overflow:'hidden'}}>
        <div style={{padding:16,borderBottom:`1px solid ${BD}`,display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',flexWrap:'wrap'}}>
          <div>
            <div style={{font:`700 15px ${MONO}`,color:TEXT}}>Application Form Editor</div>
            <div style={{font:`10px ${MONO}`,color:MUTED,letterSpacing:1.4,marginTop:4}}>UNIVERSAL FORMS · LOCKED WHITELIST · WEBSITE + GAME ACTION</div>
          </div>
          <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
            <Select value={selectedSlug} onChange={selectForm} options={[{value:'',label:'Select existing form...'}, ...forms.map(f=>({value:f.slug,label:`${f.title} / ${f.slug}`}))]} style={{minWidth:260}} />
            <Btn color={C} small onClick={() => {
              const url = form.system_locked || form.form_kind === 'whitelist' ? '/whitelist' : `/forms/${form.slug}`
              window.open(url, '_blank')
              toast.success(`Opened ${url}`, { title:'Public form' })
            }}>Open URL</Btn>
            <Btn color={G} small onClick={createNew}>New</Btn>
          </div>
        </div>
        <div style={{padding:16,display:'grid',gap:16}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
            <Input value={form.title} onChange={v=>setForm(f=>({...f,title:v,slug:f.slug || slugify(v)}))} placeholder='Form title' />
            <Input value={form.category} onChange={v=>setForm(f=>({...f,category:v}))} placeholder='Category' />
          </div>
          <div style={{display:'grid',gridTemplateColumns:'auto 1fr',gap:8,alignItems:'center'}}>
            <div style={{font:`12px ${MONO}`,color:MUTED,whiteSpace:'nowrap'}}>{form.system_locked ? 'aifazi.net/' : 'aifazi.net/forms/'}</div>
            <Input value={form.slug} onChange={v=>!form.system_locked && setForm(f=>({...f,slug:slugify(v)}))} placeholder='staff' disabled={form.system_locked} />
          </div>
          <TextArea value={form.description} onChange={v=>setForm(f=>({...f,description:v}))} placeholder='Short card description...' rows={2} />
          <TextArea value={form.intro} onChange={v=>setForm(f=>({...f,intro:v}))} placeholder='Public form intro...' rows={3} />
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:10}}>
            <Checkbox checked={form.active} onChange={v=>setFormFlag('active', v, 'Active status')} label='Active' />
            <Checkbox checked={form.require_login} onChange={v=>setFormFlag('require_login', v, 'Login requirement')} label='Require Login' />
            <Checkbox checked={form.require_whitelist} onChange={v=>setFormFlag('require_whitelist', v, 'Whitelist requirement')} label={form.system_locked ? 'Whitelist system form' : 'Require Whitelist'} />
          </div>
          <div style={{borderTop:`1px solid ${BD}`,paddingTop:14,display:'grid',gap:10}}>
            <div style={{font:`10px ${MONO}`,letterSpacing:2,color:MUTED}}>APPROVAL ACTION</div>{form.system_locked && <div style={{font:`11px ${MONO}`,color:'#facc15'}}>Whitelist approval stays on the server whitelist flow; only copy and fields are editable here.</div>}
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:10}}>
              <Select value={form.website_role || ''} onChange={v=>setApproval({website_role:v}, v ? `Website role set to ${v}.` : 'Website role cleared.')} options={roleOptions} disabled={form.system_locked} />
              <Select value={form.game_type || 'none'} onChange={v=>setApproval({game_type:v}, `Game action set to ${gameTypes.find(g => g.value === v)?.label || v}.`)} options={gameTypes} disabled={form.system_locked} />
              {form.game_type === 'job' && <><Input value={form.game_job} onChange={v=>setForm(f=>({...f,game_job:v}))} placeholder='QBX job name' /><Input value={form.game_grade} onChange={v=>setForm(f=>({...f,game_grade:v.replace(/\D/g,'')}))} placeholder='Grade' /></>}
              {form.game_type === 'group' && <Input value={form.game_group} onChange={v=>setForm(f=>({...f,game_group:v}))} placeholder='ACE/group name' />}
            </div>
          </div>
          <div style={{borderTop:`1px solid ${BD}`,paddingTop:14,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div style={{font:`10px ${MONO}`,letterSpacing:2,color:MUTED}}>FIELDS</div>
            <Btn small color={C} onClick={addField}>＋ Field</Btn>
          </div>
          {(form.fields || []).map((field, idx)=>(
            <div key={idx} style={{border:`1px solid ${BD}`,borderRadius:6,padding:10,background:BG3,display:'grid',gap:8}}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 130px',gap:8}}>
                <Input value={field.label} onChange={v=>updateField(idx,{label:v})} placeholder='Question label' />
                <Input value={field.id} onChange={v=>updateField(idx,{id:v.toLowerCase().replace(/[^a-z0-9_]/g,'_')})} placeholder='field_id' />
                <Select value={field.type} onChange={v=>updateField(idx,{type:v}, `${field.label || field.id || `Field ${idx + 1}`} type set to ${v}.`)} options={fieldTypes} />
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 110px 130px',gap:8,alignItems:'center'}}>
                <Input value={field.placeholder} onChange={v=>updateField(idx,{placeholder:v})} placeholder='Placeholder/help text' />
                <Input value={field.min_length} onChange={v=>updateField(idx,{min_length:v.replace(/\D/g,'')})} placeholder='Min chars' />
                <Checkbox checked={field.required} onChange={v=>updateField(idx,{required:v}, `${field.label || field.id || `Field ${idx + 1}`} marked ${v ? 'required' : 'optional'}.`)} label='Required' />
              </div>
              {field.type === 'select' && <Input value={field.options} onChange={v=>updateField(idx,{options:v})} placeholder='Options separated by commas' />}
              <div style={{display:'flex',justifyContent:'flex-end'}}><Btn small danger color='#ff4757' onClick={()=>removeField(idx)}>Remove</Btn></div>
            </div>
          ))}
          <Btn color={G} disabled={saving} onClick={saveForm}>{saving ? 'Saving...' : 'Save Form'}</Btn>
        </div>
      </div>

      <div style={{border:`1px solid ${BD}`,borderRadius:8,background:BG2,overflow:'hidden'}}>
        <div style={{padding:16,borderBottom:`1px solid ${BD}`,display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',flexWrap:'wrap'}}>
          <div><div style={{font:`700 15px ${MONO}`,color:TEXT}}>Submissions</div><div style={{font:`10px ${MONO}`,color:MUTED,letterSpacing:1.4,marginTop:4}}>{selectedSlug || 'ALL FORMS'}</div></div>
          <div style={{display:'flex',gap:8}}>{['pending','approved','denied','all'].map(s => <Btn key={s} small color={status===s?G:C} onClick={()=>{ setStatus(s); notifyInfo(`Showing ${s} submissions.`, 'Submissions') }}>{s}</Btn>)}</div>
        </div>
        <div style={{padding:16,display:'flex',flexDirection:'column',gap:12}}>
          {!submissions.length ? <div style={{padding:28,textAlign:'center',color:MUTED,fontFamily:MONO}}>No submissions found.</div> : submissions.map(sub => (
            <div key={sub.id} style={{border:`1px solid ${BD}`,borderRadius:7,padding:14,background:BG3}}>
              <div style={{display:'flex',justifyContent:'space-between',gap:12}}>
                <div><div style={{font:`700 14px ${MONO}`,color:TEXT}}>{sub.username || sub.email || `Submission #${sub.id}`}</div><div style={{font:`11px ${MONO}`,color:MUTED,marginTop:3}}>{sub.form_title} · {new Date(sub.created_at).toLocaleString()}</div></div>
                <div style={{display:'flex',gap:6,alignItems:'flex-start',flexWrap:'wrap',justifyContent:'flex-end'}}>
                  {(() => {
                    const ds = sub.display_status || sub.status
                    return <Badge color={ds === 'active' || ds === 'approved' ? G : ds === 'denied' || ds === 'sync_failed' ? '#ff4757' : '#facc15'}>{ds}</Badge>
                  })()}
                  <Badge color={sub.action_status === 'synced' ? G : sub.action_status === 'failed' ? '#ff4757' : C}>action {sub.action_status || 'none'}</Badge>
                </div>
              </div>
              {(sub.last_active_at || sub.last_active_name) && (
                <div style={{marginTop:8,font:`10px ${MONO}`,color:MUTED}}>Last active {sub.last_active_at ? new Date(sub.last_active_at).toLocaleString() : '-'}{sub.last_active_name ? ` as ${sub.last_active_name}` : ''}</div>
              )}
              <div style={{marginTop:12,display:'grid',gap:8}}>{Object.entries(sub.answers || {}).map(([key, val]) => <div key={key} style={{background:'rgba(0,0,0,.18)',border:`1px solid ${BD}`,borderRadius:5,padding:10}}><div style={{font:`9px ${MONO}`,letterSpacing:1.5,color:MUTED,textTransform:'uppercase'}}>{key.replace(/_/g,' ')}</div><div style={{font:`12px ${MONO}`,color:TEXT,marginTop:5,whiteSpace:'pre-wrap'}}>{String(val || '-')}</div></div>)}</div>
              {sub.action_sync_error && <div style={{marginTop:10,color:'#ff4757',font:`11px ${MONO}`}}>{sub.action_sync_error}</div>}
              <TextArea value={reviewNotes[sub.id] ?? sub.reviewer_note ?? ''} onChange={v=>setReviewNotes(n=>({...n,[sub.id]:v}))} placeholder='Reviewer note / email message...' rows={2} style={{marginTop:12}} />
              <div style={{display:'flex',gap:8,marginTop:12,flexWrap:'wrap'}}>
                <Btn small color={G} disabled={reviewing===sub.id} onClick={()=>reviewSubmission(sub.id,'approved')}>Approve + Queue Action</Btn>
                <Btn small danger color='#ff4757' disabled={reviewing===sub.id} onClick={()=>reviewSubmission(sub.id,'denied')}>Deny</Btn>
                <Btn small color='#facc15' disabled={reviewing===sub.id} onClick={()=>reviewSubmission(sub.id,'pending')}>Reset</Btn>
                <Btn small color={C} disabled={reviewing===sub.id} onClick={()=>reviewSubmission(sub.id,'archived')}>Archive</Btn>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}


// ── BANS PANEL ────────────────────────────────────────────────────────────────
function BansPanel() {
  const toast  = useToast()
  const dialog = useDialog()
  const [bans, setBans]           = useState([])
  const [bansTotal, setBansTotal] = useState(0)
  const [bansPage, setBansPage]   = useState(1)
  const [loading, setLoading]     = useState(true)
  const [filterActive, setFilter] = useState(true)
  const [showAdd, setShowAdd]     = useState(false)
  const [banning, setBanning]     = useState(false)

  const [whitelistPlayers, setWhitelistPlayers] = useState([])
  const [whitelistQuery, setWhitelistQuery] = useState('')
  const [playersLoading, setPlayersLoading] = useState(false)

  // Ban form
  const [selectedPlayer, setSelectedPlayer] = useState(null)
  const [manualId,    setManualId]    = useState('')
  const [playerName,  setPlayerName]  = useState('')
  const [reason,      setReason]      = useState('')
  const [duration,    setDuration]    = useState('permanent')
  const [expiresAt,   setExpiresAt]   = useState('')
  const [mode,        setMode]        = useState('player') // 'player' | 'manual'

  const loadBans = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get(`/fivem/bans?active=${filterActive}&limit=50&offset=${(bansPage - 1) * 50}`)
      setBans(r.data.bans||[])
      setBansTotal(r.data.total||0)
    } catch {}
    setLoading(false)
  }, [filterActive, bansPage])

  const loadWhitelistPlayers = useCallback(async () => {
    setPlayersLoading(true)
    try {
      const q = whitelistQuery.trim()
      const url = q
        ? `/fivem/whitelist/search?status=approved&limit=75&q=${encodeURIComponent(q)}`
        : '/fivem/whitelist?status=approved&limit=75'
      const r = await api.get(url)
      setWhitelistPlayers(r.data.applications||[])
    } catch {
      setWhitelistPlayers([])
    } finally {
      setPlayersLoading(false)
    }
  }, [whitelistQuery])

  useEffect(() => { loadBans() }, [loadBans])
  useEffect(() => {
    if (!showAdd || mode !== 'player') return
    const t = setTimeout(loadWhitelistPlayers, 250)
    return () => clearTimeout(t)
  }, [showAdd, mode, whitelistQuery, loadWhitelistPlayers])

  const pickPlayer = (app) => {
    setSelectedPlayer(app)
    setPlayerName(whitelistPlayerName(app))
  }

  const resetForm = () => {
    setSelectedPlayer(null); setManualId(''); setPlayerName('')
    setReason(''); setDuration('permanent'); setExpiresAt(''); setMode('player')
  }

  const submitBan = async () => {
    if (!reason.trim()) { toast.error('Ban reason is required'); return }
    if (duration === 'custom' && !expiresAt) { toast.error('Pick an expiry date/time'); return }

    let payload = {
      player_name: playerName||'Unknown',
      reason: reason.trim(),
      duration,
      ...(duration === 'custom' ? { expires_at: new Date(expiresAt).toISOString() } : {}),
    }

    if (mode === 'player' && selectedPlayer) {
      const ids = whitelistPlayerIds(selectedPlayer)
      if (!ids.length) { toast.error('Player has no usable identifiers'); return }
      payload.identifiers = ids
    } else {
      const id = manualId.trim()
      if (!id) { toast.error('Enter an identifier (license/steam/fivem/discord)'); return }
      payload.identifier = id
    }

    setBanning(true)
    try {
      await api.post('/fivem/bans', payload)
      toast.success('🔨 Player banned — queued for server sync…')
      setShowAdd(false); resetForm(); loadBans()
    } catch(e) {
      const msg = e?.response?.data?.detail || e?.message || 'Failed'
      toast.error(msg)
    } finally { setBanning(false) }
  }

  const unban = async id => {
    if (!await dialog.confirm({title:'Unban player?',message:'This lifts the website ban and queues removal from the server core bans table.',confirmText:'Unban'})) return
    try {
      await api.post(`/fivem/bans/${id}/unban`)
      toast.success('✅ Unbanned — queued for server sync…')
      loadBans()
    } catch { toast.error('Failed') }
  }

  const remove = async id => {
    if (!await dialog.confirm({title:'Delete ban record?',message:'Cannot be undone.',confirmText:'Delete',danger:true})) return
    try { await api.delete(`/fivem/bans/${id}`); toast.success('Removed'); loadBans() }
    catch { toast.error('Failed') }
  }

  return (
    <div style={{display:'flex',flexDirection:'column',gap:16}}>
      {/* Filter tabs + Add button */}
      <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
        {[[true,'active bans',G],[false,'lifted bans',C]].map(([a,lbl,c])=>(
          <button key={String(a)} onClick={()=>setFilter(a)}
            style={{background:filterActive===a?`${c}18`:BG2,border:`1px solid ${filterActive===a?c+'60':BD}`,
              color:filterActive===a?c:MUTED,borderRadius:6,padding:'6px 14px',
              fontSize:12,fontFamily:MONO,cursor:'pointer'}}>
            {lbl}
          </button>
        ))}
        <div style={{marginLeft:'auto'}}>
          <Btn color='#ff4757' danger onClick={()=>{ setShowAdd(v=>!v); if(showAdd) resetForm() }}>
            {showAdd?'✕ Close':'🔨 Ban Player'}
          </Btn>
        </div>
      </div>

      {/* ── BAN FORM ──────────────────────────────────────────────────────── */}
      {showAdd && (
        <div style={{background:BG2,border:'1px solid #ff475740',borderRadius:12,padding:20,display:'flex',flexDirection:'column',gap:16}}>
          <div style={{fontSize:12,color:'#ff4757',fontFamily:MONO,letterSpacing:1}}>🔨 BAN PLAYER</div>

          {/* Mode toggle */}
          <div style={{display:'flex',gap:8}}>
            {[['player','👤 Select whitelisted'],['manual','⌨️ Enter manually']].map(([m,lbl])=>(
              <button key={m} onClick={()=>{setMode(m);setSelectedPlayer(null);setManualId('')}}
                style={{background:mode===m?'#ff475718':BG3,
                  border:`1px solid ${mode===m?'#ff475760':BD}`,
                  color:mode===m?'#ff4757':MUTED,borderRadius:6,
                  padding:'6px 14px',fontSize:12,fontFamily:MONO,cursor:'pointer'}}>
                {lbl}
              </button>
            ))}
          </div>

          {/* Player picker mode */}
          {mode==='player' && (
            <div>
              <div style={{display:'flex',gap:10,alignItems:'end',marginBottom:8,flexWrap:'wrap'}}>
                <div style={{flex:'1 1 320px'}}>
                  <div style={{fontSize:10,color:MUTED,fontFamily:MONO,letterSpacing:1,marginBottom:5}}>
                    WHITELISTED PLAYERS
                  </div>
                  <Input value={whitelistQuery} onChange={setWhitelistQuery} placeholder="Search name, Discord, FiveM, license, Steam..."/>
                </div>
                <Badge color={G}>{whitelistPlayers.length} shown</Badge>
              </div>
              {playersLoading ? (
                <div style={{color:MUTED,fontSize:12,padding:'12px 0',fontFamily:MONO}}>loading players...</div>
              ) : whitelistPlayers.length===0 ? (
                <div style={{color:MUTED,fontSize:12,padding:'12px 0'}}>
                  No approved whitelist players found.
                </div>
              ) : (
                <div style={{display:'flex',flexDirection:'column',gap:6,maxHeight:280,overflowY:'auto'}}>
                  {whitelistPlayers.map(app=>(
                    <div key={app.id}
                      onClick={()=>pickPlayer(app)}
                      style={{background:selectedPlayer?.id===app.id?'#ff475720':BG3,
                        border:`1px solid ${selectedPlayer?.id===app.id?'#ff475760':BD}`,
                        borderRadius:8,padding:'10px 14px',cursor:'pointer',display:'flex',
                        alignItems:'center',gap:12,transition:'all 0.12s'}}>
                      <div style={{width:34,height:34,borderRadius:8,background:'#ff475730',
                        display:'flex',alignItems:'center',justifyContent:'center',
                        fontSize:14,fontWeight:700,color:'#ff4757',fontFamily:MONO}}>
                        {(app.character_name || app.discord_name || '?').slice(0,1).toUpperCase()}
                      </div>
                      <div style={{flex:1}}>
                        <div style={{fontWeight:600,color:TEXT,fontSize:13}}>{app.character_name || app.discord_name || 'Unknown'}</div>
                        <div style={{fontSize:11,color:MUTED,fontFamily:MONO,marginTop:2}}>
                          {[app.discord_name, app.discord_id, app.fivem_id].filter(Boolean).join(' · ')}
                        </div>
                        <PlayerIdentifiers app={app}/>
                      </div>
                      {app.priority_level > 0 && <Badge color='#facc15'>{app.priority_tier || 'Priority'} · {app.priority_level}</Badge>}
                      {selectedPlayer?.id===app.id&&<span style={{color:'#ff4757'}}>✓</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Manual mode */}
          {mode==='manual' && (
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
              <div>
                <div style={{fontSize:10,color:MUTED,fontFamily:MONO,marginBottom:4}}>IDENTIFIER *</div>
                <Input value={manualId} onChange={setManualId} placeholder="license:... / steam:... / fivem:... / discord:..."/>
              </div>
              <div>
                <div style={{fontSize:10,color:MUTED,fontFamily:MONO,marginBottom:4}}>PLAYER NAME *</div>
                <Input value={playerName} onChange={setPlayerName} placeholder="Player display name"/>
              </div>
            </div>
          )}

          {/* Reason + Duration */}
          <div>
            <div style={{fontSize:10,color:MUTED,fontFamily:MONO,marginBottom:4}}>BAN REASON *</div>
            <TextArea value={reason} onChange={setReason}
              placeholder="The reason for the ban, rule violated, etc." rows={2}/>
          </div>
          <div>
            <div style={{fontSize:10,color:MUTED,fontFamily:MONO,marginBottom:4}}>DURATION</div>
            <DurationPicker value={duration} onChange={setDuration}/>
          </div>
          {duration === 'custom' && (
            <div>
              <div style={{fontSize:10,color:MUTED,fontFamily:MONO,marginBottom:4}}>EXPIRES</div>
              <DateTimePicker value={expiresAt} onChange={setExpiresAt} placeholder="Pick ban expiry..."/>
            </div>
          )}

          {/* Selected player summary */}
          {mode==='player' && selectedPlayer && (
            <div style={{background:BG3,borderRadius:8,padding:'10px 14px',border:'1px solid #ff475740'}}>
              <div style={{fontSize:11,color:MUTED,fontFamily:MONO,marginBottom:4}}>BANNING:</div>
              <div style={{fontWeight:600,color:TEXT}}>{selectedPlayer.character_name || selectedPlayer.discord_name || 'Unknown'}</div>
              <PlayerIdentifiers app={selectedPlayer}/>
            </div>
          )}

          <div style={{display:'flex',gap:8}}>
            <Btn onClick={submitBan} color='#ff4757' danger disabled={banning||
              (mode==='player'&&!selectedPlayer)||(mode==='manual'&&!manualId.trim())||(duration==='custom'&&!expiresAt)}>
              {banning?'⟳ Banning…':'🔨 Apply Ban'}
            </Btn>
            <Btn onClick={()=>{setShowAdd(false);resetForm()}} color={MUTED}>Cancel</Btn>
          </div>

          <div style={{fontSize:11,color:MUTED,lineHeight:1.7}}>
            💡 Ban is created in the website database and synced by the FiveM resource into the qbx_core bans table.
            Matching online players are dropped when the server sync runs.
          </div>
        </div>
      )}

      {/* ── BAN LIST ──────────────────────────────────────────────────────── */}
      {loading ? <div style={{color:MUTED,fontFamily:MONO,padding:20}}>loading…</div>
      : bans.length===0 ? <div style={{color:MUTED,padding:20,textAlign:'center'}}>No bans found</div>
      : bans.map(ban=>(
        <div key={ban.id} style={{background:BG2,border:`1px solid ${ban.active?'#ff475730':BD}`,borderRadius:10,padding:'14px 16px'}}>
          <div style={{display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:600,color:TEXT}}>{ban.player_name}</div>
              <div style={{fontSize:12,color:MUTED,fontFamily:MONO,marginTop:2}}>{ban.identifier}</div>
              <div style={{fontSize:13,color:ban.active?'#ff9999':MUTED,marginTop:4,fontStyle:'italic'}}>
                {ban.reason}
              </div>
              <div style={{fontSize:11,color:MUTED,marginTop:4}}>
                By <strong style={{color:TEXT}}>{ban.banned_by}</strong> · <RelTime iso={ban.banned_at}/>
                {ban.duration&&ban.duration!=='permanent'?` · ${ban.duration}`:' · Permanent'}
              </div>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:6,alignItems:'flex-end'}}>
              <Badge color={ban.active?'#ff4757':MUTED}>{ban.active?'ACTIVE':'LIFTED'}</Badge>
              {ban.active&&<SourceBadge source={ban.source||'website'}/>}
              {ban.active&&<BanSyncBadge synced={ban.txadmin_synced}/>}
              <div style={{display:'flex',gap:6}}>
                {ban.active&&<Btn color={G} small onClick={()=>unban(ban.id)}>↩ Unban</Btn>}
                <Btn color='#ff4757' small danger onClick={()=>remove(ban.id)}>🗑</Btn>
              </div>
            </div>
          </div>
          {ban.active&&!ban.txadmin_synced&&(
            <div style={{marginTop:10,fontSize:11,color:'#f97316',fontFamily:MONO}}>
              ⚠️ Not synced to server core yet — player may still be able to join until the FiveM resource processes it.
            </div>
          )}
        </div>
      ))}
      <Pagination page={bansPage} total={bansTotal} pageSize={50}
        label={`${bansTotal} bans`} onChange={p => setBansPage(p)} />
    </div>
  )
}

// ── APPROVAL HISTORY ──────────────────────────────────────────────────────────
function HistoryPanel() {
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get('/fivem/whitelist/history?limit=100')
      setHistory(r.data.history||[])
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])
  usePausableInterval(load, 15000)

  if (loading) return <div style={{color:MUTED,fontFamily:MONO,padding:20}}>loading…</div>

  return (
    <div style={{display:'flex',flexDirection:'column',gap:12}}>
      <div style={{fontSize:12,color:MUTED}}>Approval history — who approved, from where, and current server sync status. Updates every 15s.</div>
      {history.length===0&&<div style={{color:MUTED,padding:20,textAlign:'center'}}>No approved players yet</div>}
      {history.map(h=>(
        <div key={h.id} style={{background:BG2,border:`1px solid ${BD}`,borderRadius:10,padding:'14px 16px'}}>
          <div style={{display:'flex',gap:12,alignItems:'center',flexWrap:'wrap'}}>
            <div style={{flex:1}}>
              <div style={{fontWeight:600,color:TEXT}}>{h.character_name}</div>
              <div style={{fontSize:12,color:MUTED,fontFamily:MONO,marginTop:2}}>{h.discord_name}</div>
              {(h.steam_hex||h.fivem_id)&&(
                <div style={{fontSize:11,color:MUTED,fontFamily:MONO,marginTop:2}}>{h.steam_hex||h.fivem_id}</div>
              )}
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:4,alignItems:'flex-end'}}>
              <Badge color={h.source_color||MUTED}>{h.source_label}</Badge>
              <SyncBadge synced={h.txadmin_synced}/>
            </div>
          </div>
          <div style={{marginTop:8,display:'flex',gap:16,flexWrap:'wrap',fontSize:11,color:MUTED}}>
            {h.reviewed_by&&<span>👤 <strong style={{color:TEXT}}>{h.reviewed_by}</strong></span>}
            {h.approved_at&&<span>🕐 <RelTime iso={h.approved_at}/></span>}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── MAIN EXPORT ───────────────────────────────────────────────────────────────
const SECTIONS = [
  {key:'status',    label:'Server Status', icon:'🖥️'},
  {key:'whitelist', label:'Whitelist',     icon:'📋'},
  {key:'forms',     label:'Forms',         icon:'🧾'},
  {key:'history',   label:'Approval Log',  icon:'📜'},
  {key:'bans',      label:'Bans',          icon:'🔨'},
]

export default function FiveMPanel({ defaultSection='status' }) {
  const [section, setSection] = useState(defaultSection)
  return (
    <div style={{display:'flex',flexDirection:'column',gap:0}}>
      <PageHeader title="🎮 FiveM Server" subtitle="Manage AIFAZI RP — Neon Ops City"/>
      <div style={{display:'flex',gap:2,padding:'0 0 20px',borderBottom:`1px solid ${BD}`,marginBottom:20}}>
        {SECTIONS.map(s=>(
          <button key={s.key} onClick={()=>setSection(s.key)}
            style={{background:section===s.key?`${G}14`:'transparent',
              border:'none',borderBottom:`2px solid ${section===s.key?G:'transparent'}`,
              color:section===s.key?G:MUTED,padding:'8px 18px',fontSize:13,fontFamily:MONO,
              cursor:'pointer',display:'flex',alignItems:'center',gap:7,transition:'all 0.14s'}}>
            <span>{s.icon}</span> {s.label}
          </button>
        ))}
      </div>
      {section==='status'    && <ServerStatusPanel/>}
      {section==='whitelist' && <WhitelistPanel/>}
      {section==='forms'     && <FormsPanel/>}
      {section==='history'   && <HistoryPanel/>}
      {section==='bans'      && <BansPanel/>}
    </div>
  )
}
