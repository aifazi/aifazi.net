'use client'
import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from '@/lib/router-compat'
import api, { isAdmin as checkIsAdmin, getRole, getUsername, hasPermission, getStoredPermissions, setEffectiveAccess, getAuthToken } from '@/lib/api'
import { useToast } from '../../components/Toast'
import { useDialog } from '../../components/Dialog'
import { Checkbox, Select } from '../../core/ui.jsx'
import ForumAdmin from '../ForumAdmin'
import AdminChat from '../chat/AdminChat'
import DBMonitor from './DBMonitor'
import Sidebar from './Sidebar'
import { PostEditor, MediaLibrary } from './PostEditor'
import { S, useIsMobile, PageHeader, PanelErrorBoundary } from './shared'
import AdminHeader from './AdminHeader'
import { Icon, NAV_ICONS } from './icons'
import Mail from './Mail'
import ThemeHub from './ThemeHub'
import { NewsletterPanel, StatsPanel, PageContentPanel } from './AdminPanels'
import HelpDeskPanel from './HelpDeskPanel'
import Changelog from './Changelog'
import FiveMPanel from './FiveMPanel'
import StoreCenter from './storeModules/StoreCenter'
import { useFadeUp, useStaggerIn } from '@/lib/animate'

function StatsGrid({ dashStats, isMobile, setView }) {
  const ref = useStaggerIn('.stat-card', { stagger: 80, distance: 16, duration: 480 })
  const cards = [
    { label: 'TOTAL POSTS', value: dashStats.totalPosts, navKey: 'content', color: 'var(--cyan)', sub: `${dashStats.publishedPosts} live · ${dashStats.draftPosts} drafts`, action: () => setView('content') },
    { label: 'TOTAL VIEWS', value: dashStats.totalViews.toLocaleString(), navKey: 'activity', color: 'var(--green)', sub: 'all time', action: () => setView('db') },
    { label: 'MESSAGES',    value: dashStats.contacts, navKey: 'communications', color: '#ff6b35', sub: 'in inbox', action: () => setView('communications') },
    { label: 'STAFF',       value: dashStats.staff,    navKey: 'staff', color: '#ffd700', sub: 'members',  action: () => setView('staff') },
  ]
  return (
    <div ref={ref} style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
      {cards.map(card => (
        <div key={card.label} className="stat-card" onClick={card.action} style={{
          background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14,
          padding: isMobile ? '14px' : '18px 20px', cursor: card.action ? 'pointer' : 'default',
          transition: 'border-color 0.2s, box-shadow 0.2s, transform 0.15s',
          position: 'relative', overflow: 'hidden',
        }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = card.color; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 4px 20px ${card.color}18` }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none' }}
        >
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${card.color}, transparent)`, borderRadius: '14px 14px 0 0' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 3, color: 'var(--muted)' }}>{card.label}</div>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: `${card.color}15`, border: `1px solid ${card.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>
              <Icon name={NAV_ICONS[card.navKey] || 'activity'} size={16} style={{ color: card.color }} />
            </div>
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: isMobile ? 28 : 36, fontWeight: 800, color: card.color, lineHeight: 1, marginBottom: 6 }}>{card.value}</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)' }}>{card.sub}</div>
        </div>
      ))}
    </div>
  )
}


const PERMISSION_MODULES = [
  ['home','Dashboard'], ['content.posts','Posts'], ['content.editor','Post editor'], ['content.media','Media'], ['content.pages','Pages'], ['content.themes','Theme library'],
  ['community.contacts','Contacts'], ['community.staff','Staff'], ['community.forum','Forum'], ['community.chat','Chat'], ['community.newsletter','Newsletter'],
  ['system.db','DB monitor'], ['system.db.console','DB SQL Console'], ['system.mail','Mail'], ['system.cdn','CDN'], ['system.backup','Backup'],
  ['support.helpdesk','Help desk'], ['store','Store'],
  ['store.analytics','Store analytics'], ['store.customers','Store customers (CRM)'], ['store.payments','Store payments'], ['store.products','Store catalog & stock'], ['store.coupons','Store coupons'], ['store.deals','Store flash deals'], ['store.reviews','Store reviews'], ['store.orders','Store orders'], ['store.settings','Store settings'],
  ['fivem.status','FiveM status'], ['fivem.whitelist','FiveM whitelist'], ['fivem.forms','FiveM forms'], ['fivem.approval_log','FiveM approval log'], ['fivem.bans','FiveM bans'],
  ['changelog','Changelog'],
]
const PERMISSION_ACTIONS = ['view','create','edit','delete','approve','sync','manage']
const PRESET_PERMISSIONS = {
  moderator: { home:['view'], 'community.forum':['view','edit','delete','manage'], 'community.chat':['view','edit','delete','manage'], 'support.helpdesk':['view','edit'], 'store':['view','edit','manage'], 'fivem.status':['view'], 'fivem.whitelist':['view','approve','sync'], 'fivem.forms':['view','approve'], 'fivem.approval_log':['view'], 'fivem.bans':['view','create','edit'], changelog:['view'] },
  editor: { home:['view'], 'content.posts':['view','create','edit','delete'], 'content.editor':['view','create','edit'], 'content.media':['view','create','edit','delete'], 'content.pages':['view','edit'], 'content.themes':['view','edit'], changelog:['view'] },
  chat: { 'community.chat':['view','create','edit'] },
  fivem: { home:['view'], 'fivem.status':['view'], 'fivem.whitelist':['view','approve','sync'], 'fivem.forms':['view','create','edit','approve'], 'fivem.approval_log':['view'], 'fivem.bans':['view','create','edit','delete'] },
}
const NAV_PERMISSION = {
  home:'home', posts:'content.posts', editor:'content.editor', media:'content.media', pages:'content.pages', themes:'content.themes',
  content:['content.posts', 'content.editor', 'community.forum'], communications:['community.contacts', 'community.newsletter'],
  contacts:'community.contacts', staff:'community.staff', forum:'community.forum', chat:'community.chat', newsletter:'community.newsletter',
  db:'system.db', delivery:['system.mail', 'system.cdn'], mail:'system.mail', cdn:'system.cdn',
  helpdesk:'support.helpdesk', store:'store', fivem:'fivem.status', changelog:'changelog',
}
function canViewNavItem(item) {
  if (checkIsAdmin()) return true
  const modules = NAV_PERMISSION[item.key] || item.key
  return (Array.isArray(modules) ? modules : [modules]).some(module => hasPermission(module, 'view'))
}
function permissionForRole(role) { return JSON.parse(JSON.stringify(PRESET_PERMISSIONS[role] || PRESET_PERMISSIONS.editor)) }
function PermissionEditor({ value = {}, onChange }) {
  const toggle = (module, action) => {
    const current = new Set(value?.[module] || [])
    current.has(action) ? current.delete(action) : current.add(action)
    const next = { ...(value || {}) }
    if (current.size) next[module] = [...current]
    else delete next[module]
    onChange(next)
  }
  const applyPreset = key => onChange(permissionForRole(key))
  return (
    <div style={{ border:'1px solid var(--border)', background:'rgba(255,255,255,0.025)', borderRadius:8, padding:12, display:'grid', gap:10 }}>
      <div style={{ display:'flex', justifyContent:'space-between', gap:8, flexWrap:'wrap', alignItems:'center' }}>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:9, letterSpacing:2, color:'var(--muted)' }}>MODULE ACCESS</div>
        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>{['editor','moderator','chat','fivem'].map(k => <button type="button" key={k} onClick={() => applyPreset(k)} style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--cyan)', background:'transparent', border:'1px solid var(--border)', borderRadius:6, padding:'4px 8px', cursor:'pointer' }}>{k}</button>)}</div>
      </div>
      <div style={{ maxHeight:240, overflowY:'auto', display:'grid', gap:8 }}>
        {PERMISSION_MODULES.map(([module,label]) => (
          <div key={module} style={{ display:'grid', gridTemplateColumns:'155px 1fr', gap:8, alignItems:'start', borderBottom:'1px solid rgba(255,255,255,0.04)', paddingBottom:7 }}>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--text)' }}>{label}<div style={{ color:'var(--muted)', fontSize:8, marginTop:2 }}>{module}</div></div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
              {PERMISSION_ACTIONS.map(action => (
                <button type="button" key={action} onClick={() => toggle(module, action)} style={{ fontFamily:'var(--font-mono)', fontSize:8, letterSpacing:.5, border:`1px solid ${(value?.[module]||[]).includes(action)?'rgba(0,255,136,.55)':'var(--border)'}`, background:(value?.[module]||[]).includes(action)?'rgba(0,255,136,.12)':'transparent', color:(value?.[module]||[]).includes(action)?'var(--green)':'var(--muted)', borderRadius:5, padding:'3px 6px', cursor:'pointer' }}>{action}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

//  Dashboard 
function Dashboard({ onLogout }) {
  const toast = useToast()
  const { confirm } = useDialog()
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const role = getRole()
  const username = getUsername()
  const storedPerms = getStoredPermissions()
  const adminUser = checkIsAdmin() || ['moderator','editor','chat'].includes(role || '') || Object.keys(storedPerms || {}).length > 0

  const [view, setView] = useState('home')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('admin_sidebar_collapsed') === '1' } catch { return false }
  })
  const toggleSidebar = () => setSidebarCollapsed(v => {
    const next = !v
    try { localStorage.setItem('admin_sidebar_collapsed', next ? '1' : '0') } catch {}
    return next
  })
  const [sessionWarning, setSessionWarning] = useState(false)
  const [posts, setPosts] = useState([])
  const [contacts, setContacts] = useState([])
  const [staff, setStaff] = useState([])
  const [dashStats, setDashStats] = useState(null)
  const [activityFeed, setActivityFeed] = useState([])
  const [healthStatus, setHealthStatus] = useState({})
  const [editingPost, setEditingPost] = useState(null)
  const [loading, setLoading] = useState(false)
  const [contactsLoading, setContactsLoading] = useState(false)
  const [showNewStaff, setShowNewStaff] = useState(false)
  const [newStaff, setNewStaff] = useState({ mode: 'standalone', forum_user_id: '', username: '', email: '', password: '', role: 'editor', module_permissions: permissionForRole('editor') })
  const [staffSaving, setStaffSaving] = useState(false)
  const [editingStaff, setEditingStaff] = useState(null) // staff member being edited
  const [editStaffForm, setEditStaffForm] = useState({ username: '', email: '', role: '', password: '', forum_user_id: '', module_permissions: {} })
  const [staffUserQuery, setStaffUserQuery] = useState('')
  const [staffUserResults, setStaffUserResults] = useState([])
  const [staffUserLoading, setStaffUserLoading] = useState(false)
  const autoRefreshRef = useRef(null)
  const [selectedPosts, setSelectedPosts] = useState(new Set())
  const [selectedContacts, setSelectedContacts] = useState(new Set())
  const [replyModal, setReplyModal] = useState(null)  // single contact | 'bulk'
  const [replySubject, setReplySubject] = useState('')
  const [replyBody, setReplyBody] = useState('')
  const [replySending, setReplySending] = useState(false)

  // #8 — Reply templates
  const REPLY_TEMPLATES = [
    { label: 'Thank you',    subject: 'Thank you for reaching out', body: `Hi {{name}},\n\nThank you for getting in touch! We have received your message and will respond as soon as possible.\n\nBest regards,\nTanvir` },
    { label: 'Follow-up',   subject: 'Following up on your enquiry', body: `Hi {{name}},\n\nJust following up on your previous message. Please let us know if there is anything else we can help with.\n\nBest regards,\nTanvir` },
    { label: 'Not available', subject: 'Re: Your message', body: `Hi {{name}},\n\nThank you for your message. Unfortunately this is outside the scope of our current availability, but we appreciate you reaching out.\n\nBest regards,\nTanvir` },
    { label: 'Project enquiry', subject: 'Re: Project enquiry', body: `Hi {{name}},\n\nThank you for your interest in working together! I would love to learn more about your project. Could you share more details about your requirements, timeline, and budget?\n\nLooking forward to hearing from you.\n\nBest regards,\nTanvir` },
  ]

  const applyTemplate = (tpl, contact) => {
    const name = contact?.name || 'there'
    setReplySubject(tpl.subject)
    setReplyBody(tpl.body.replace(/\{\{name\}\}/g, name))
  }
  //  Post search / filter / sort 
  const [postSearch, setPostSearch] = useState('')
  const [postFilter, setPostFilter] = useState('all') // 'all' | 'live' | 'draft'
  const [postSort,   setPostSort]   = useState('newest') // 'newest' | 'oldest' | 'views' | 'title'
  //  Contact filter 
  const [contactFilter, setContactFilter] = useState('all') // 'all' | 'replied' | 'unreplied'
  //  Shortcuts help 
  const [showShortcuts, setShowShortcuts] = useState(false)

  // Session expiry warning — checks JWT exp, warns 5 min before
  useEffect(() => {
    const checkExpiry = () => {
      const token = getAuthToken()
      if (!token) return
      try {
        const payload = JSON.parse(atob(token.split('.')[1]))
        const expiresIn = (payload.exp * 1000) - Date.now()
        if (expiresIn < 5 * 60 * 1000 && expiresIn > 0) setSessionWarning(true)
        else setSessionWarning(false)
      } catch {}
    }
    checkExpiry()
    const interval = setInterval(checkExpiry, 30000) // check every 30s for tighter warning window
    return () => clearInterval(interval)
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === '?') { e.preventDefault(); setShowShortcuts(o => !o); return }
      if (e.key === 'Escape') { setShowShortcuts(false); return }
      if (e.metaKey || e.ctrlKey) return
      if (e.key === 'h') setView('home')
      if (e.key === 'p') setView('content')
      if (e.key === 'n') { setEditingPost(null); setView('editor') }
      if (e.key === 'm') setView('media')
      if (e.key === 'c') setView('communications')
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    if (view === 'home') {
      fetchDashStats()
      clearInterval(autoRefreshRef.current)
      autoRefreshRef.current = setInterval(fetchDashStats, 60000)
    } else {
      clearInterval(autoRefreshRef.current)
    }
    if (view === 'content' || view === 'posts') fetchPosts()
    if (view === 'communications' || view === 'contacts') fetchContacts()
    if (view === 'staff') fetchStaff()
    return () => clearInterval(autoRefreshRef.current)
  }, [view])

  const fetchDashStats = async () => {
    try {
      const [postsR, contactsR, staffR, healthR, auditR] = await Promise.allSettled([
        api.get('/blog/admin/all'), api.get('/contact'), api.get('/auth/staff'),
        api.get('/health'), api.get('/admin/audit?limit=8'),
      ])
      // /blog/admin/all returns a flat array; guard against paginated shape just in case
      const raw  = postsR.status === 'fulfilled' ? postsR.value.data : []
      const p    = Array.isArray(raw) ? raw : (raw?.posts || [])
      const c    = contactsR.status === 'fulfilled' ? contactsR.value.data : []
      const s    = staffR.status === 'fulfilled' ? staffR.value.data : []
      const health = healthR.status === 'fulfilled' ? healthR.value.data : null
      const auditLogs = auditR.status === 'fulfilled' ? (auditR.value.data?.logs || []) : []

      setDashStats({
        totalPosts: p.length,
        publishedPosts: p.filter(x => x.published).length,
        draftPosts: p.filter(x => !x.published).length,
        totalViews: p.reduce((a, x) => a + (x.views || 0), 0),
        contacts: c.length,
        staff: s.length,
        recentPosts: p.slice(0, 5),
        recentContacts: c.slice(0, 3),
      })

      setHealthStatus({
        'API Server':   health?.status === 'OK' ? { status: 'operational', color: '#00ff88' } : { status: 'degraded', color: '#ff4757' },
        'Database':     health?.db === false    ? { status: 'degraded', color: '#ff4757' }    : { status: 'operational', color: '#00ff88' },
        'Mail Service': { status: 'configured',  color: '#ffd700' },
        'CDN Storage':  { status: 'configured',  color: '#ffd700' },
        'Chat Server':  health?.status === 'OK' ? { status: 'operational', color: '#00ff88' } : { status: 'unknown', color: '#888' },
        'Forum':        { status: 'operational', color: '#00ff88' },
      })

      if (auditLogs.length > 0) {
        setActivityFeed(auditLogs.map(l => ({
          id: l._id,
          icon: l.action?.includes('delete') ? '[X]' : l.action?.includes('login') ? '[IN]' : l.action?.includes('create') ? '' : l.action?.includes('ban') ? '' : '',
          text: `${l.actor || 'system'} — ${(l.action || '').replace(/_/g, ' ')}${l.target ? `  ${l.target}` : ''}`,
          time: l.createdAt,
        })))
      }
    } catch {}
  }

  const fetchStaff    = async () => { setLoading(true); try { const r = await api.get('/auth/staff'); setStaff(r.data) } catch {} finally { setLoading(false) } }
  const searchStaffUsers = async q => {
    setStaffUserQuery(q)
    if (!q || q.trim().length < 2) { setStaffUserResults([]); return }
    setStaffUserLoading(true)
    try { const r = await api.get(`/auth/staff/search-users?q=${encodeURIComponent(q.trim())}`); setStaffUserResults(r.data?.users || []) }
    catch { setStaffUserResults([]) }
    finally { setStaffUserLoading(false) }
  }
  const selectStaffUser = u => {
    setNewStaff(p => ({ ...p, mode:'existing', forum_user_id:u.id, username:u.username || '', email:u.email || '', password:'' }))
    setStaffUserResults([]); setStaffUserQuery(`${u.username} · ${u.email || ''}`)
  }
  const fetchPosts    = async () => { setLoading(true); try { const r = await api.get('/blog/admin/all'); const d = r.data; setPosts(Array.isArray(d) ? d : (d?.posts || [])) } catch {} finally { setLoading(false) } }
  const fetchContacts = async () => {
    setContactsLoading(true)
    try {
      const r = await api.get('/contact')
      // backend may return array directly OR { contacts: [...], total: N }
      const raw = r.data
      setContacts(Array.isArray(raw) ? raw : (raw?.contacts || raw?.messages || raw?.data || []))
    } catch { setContacts([]) }
    finally { setContactsLoading(false) }
  }

  const handleCreateStaff = async e => {
    e.preventDefault(); setStaffSaving(true)
    try {
      const payload = { ...newStaff }
      if (payload.mode === 'existing') delete payload.password
      delete payload.mode
      const res = await api.post('/auth/staff', payload)
      setStaff(p => [...p, res.data]); setNewStaff({ mode: 'standalone', forum_user_id: '', username: '', email: '', password: '', role: 'editor', module_permissions: permissionForRole('editor') }); setShowNewStaff(false); setStaffUserQuery('')
      toast.success(`${res.data.role} account created for ${res.data.username}`, { title: 'Staff Added' })
      if (res.data.username === getUsername()) {
        try { const v = await api.get('/auth/me'); setEffectiveAccess(v.data?.user) } catch {}
      }
    } catch (err) { toast.error(err.response?.data?.error || 'Failed', { title: 'Error' }) }
    finally { setStaffSaving(false) }
  }

  const handleDeleteStaff = async (id, name) => {
    const ok = await confirm({ title: 'Remove Staff', message: `Remove ${name}? They will lose access immediately.`, variant: 'danger', confirmLabel: 'REMOVE' })
    if (!ok) return
    await api.delete(`/auth/staff/${id}`); setStaff(p => p.filter(x => x._id !== id)); toast.success('Staff member removed', { title: 'Removed' })
    if (name === getUsername()) {
      localStorage.removeItem('aifazi_effective_role')
      localStorage.removeItem('aifazi_permissions')
    }
  }

  const handleUpdateStaff = async e => {
    e.preventDefault(); setStaffSaving(true)
    try {
      const payload = { ...editStaffForm }
      if (!payload.password) delete payload.password // don't send empty password
      if (!payload.password) delete payload.password
      const res = await api.put(`/auth/staff/${editingStaff._id}`, payload)
      setStaff(p => p.map(s => s._id === editingStaff._id ? { ...s, ...res.data } : s))
      setEditingStaff(null); toast.success('Staff member updated', { title: 'Updated' })
      if (res.data.username === getUsername() || editingStaff.username === getUsername()) {
        try { const v = await api.get('/auth/me'); setEffectiveAccess(v.data?.user) } catch {}
      }
    } catch (err) { toast.error(err.response?.data?.error || 'Failed', { title: 'Error' }) }
    finally { setStaffSaving(false) }
  }

  const bulkDeletePosts = async () => {
    if (!selectedPosts.size) return
    const ok = await confirm({ title: `Delete ${selectedPosts.size} Posts`, message: `Permanently delete ${selectedPosts.size} selected posts?`, variant: 'danger', confirmLabel: 'DELETE ALL' })
    if (!ok) return
    await Promise.allSettled([...selectedPosts].map(id => api.delete(`/blog/${id}`)))
    setPosts(p => p.filter(x => !selectedPosts.has(x.id)))
    setSelectedPosts(new Set())
    toast.success(`${selectedPosts.size} posts deleted`, { title: 'Bulk Delete' })
  }

  const bulkPublishPosts = async (publish) => {
    if (!selectedPosts.size) return
    const label = publish ? 'Publish' : 'Unpublish'
    const ok = await confirm({ title: `${label} ${selectedPosts.size} Posts`, message: `${label} ${selectedPosts.size} selected posts?`, confirmLabel: label.toUpperCase() })
    if (!ok) return
    await Promise.allSettled([...selectedPosts].map(id => {
      const post = posts.find(p => p.id === id)
      return post ? api.put(`/blog/${id}`, { ...post, published: publish }) : Promise.resolve()
    }))
    await fetchPosts()
    setSelectedPosts(new Set())
    toast.success(`${selectedPosts.size} posts ${publish ? 'published' : 'unpublished'}`, { title: label })
  }

  const bulkDeleteContacts = async () => {
    if (!selectedContacts.size) return
    const ok = await confirm({ title: `Delete ${selectedContacts.size} Messages`, message: `Permanently delete ${selectedContacts.size} selected messages?`, variant: 'danger', confirmLabel: 'DELETE ALL' })
    if (!ok) return
    await Promise.allSettled([...selectedContacts].map(id => api.delete(`/contact/${id}`)))
    setContacts(c => c.filter(x => !selectedContacts.has(x.id)))
    setSelectedContacts(new Set())
    toast.success(`${selectedContacts.size} messages deleted`, { title: 'Bulk Delete' })
  }

  const handleSavePost = async data => {
    try {
      if (editingPost?.id) await api.put(`/blog/${editingPost.id}`, data)
      else await api.post('/blog', data)
      toast.success('Post saved successfully', { title: 'Saved' }); setView('content'); setEditingPost(null); fetchPosts()
    } catch (err) { toast.error(err.response?.data?.detail || err.response?.data?.error || err.message || 'Unknown error', { title: 'Save Failed' }) }
  }

  const handleDeletePost = async id => {
    const ok = await confirm({ title: 'Delete Post', message: 'This post will be permanently deleted.', variant: 'danger', confirmLabel: 'DELETE POST' })
    if (!ok) return
    await api.delete(`/blog/${id}`); setPosts(p => p.filter(x => x.id !== id)); toast.success('Post deleted', { title: 'Deleted' })
  }

  const handleDeleteContact = async id => { await api.delete(`/contact/${id}`); setContacts(c => c.filter(x => x.id !== id)) }
  const togglePublish = async post => { await api.put(`/blog/${post.id}`, { ...post, published: !post.published }); fetchPosts() }
  const formatDate = d => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  //  Derived: filtered + sorted posts 
  const filteredPosts = posts
    .filter(p => {
      if (postFilter === 'live')  return p.published
      if (postFilter === 'draft') return !p.published
      return true
    })
    .filter(p => postSearch === '' || p.title?.toLowerCase().includes(postSearch.toLowerCase()) || p.category?.toLowerCase().includes(postSearch.toLowerCase()))
    .sort((a, b) => {
      if (postSort === 'views')  return (b.views || 0) - (a.views || 0)
      if (postSort === 'title')  return (a.title || '').localeCompare(b.title || '')
      if (postSort === 'oldest') return new Date(a.created_at) - new Date(b.created_at)
      return new Date(b.created_at) - new Date(a.created_at) // newest
    })

  //  Derived: filtered contacts 
  const filteredContacts = contacts.filter(c => {
    if (contactFilter === 'replied')   return c.replied
    if (contactFilter === 'unreplied') return !c.replied
    return true
  })

  const navItems = [
    { key: 'home',         label: 'Dashboard',     group: 'OVERVIEW',   icon: '📊',   badge: null },
    { key: 'content',      label: 'Content Hub',   group: 'CONTENT',    icon: '📝',   badge: null, aliases: ['posts', 'editor', 'forum'] },
    { key: 'media',        label: 'Media',         group: 'CONTENT',    icon: '🖼️',  badge: null },
    { key: 'pages',        label: 'Pages',         group: 'CONTENT',    icon: '🧩',  badge: null },
    { key: 'themes',       label: 'Theme Library', group: 'CONTENT',    icon: '🎨',    badge: null },
    { key: 'communications', label: 'Communications', group: 'COMMUNITY', icon: '📧',  badge: null, aliases: ['contacts', 'newsletter'] },
    { key: 'staff',        label: 'Staff',         group: 'COMMUNITY',  icon: '👥',  badge: null },
    { key: 'chat',         label: 'Chat',          group: 'COMMUNITY',  icon: '🗨️',  badge: null },
    { key: 'db',           label: 'DB Monitor',    group: 'SYSTEM',     icon: '🗄️',     badge: null },
    { key: 'delivery',      label: 'Mail & CDN',    group: 'SYSTEM',     icon: '📨',  badge: null, aliases: ['mail', 'cdn'] },

    { key: 'helpdesk',     label: 'Help Desk',     group: 'SUPPORT',    icon: '🎫', badge: null },
    { key: 'store',        label: 'Store',         group: 'BUSINESS',   icon: '🛒', badge: null },
    { key: 'fivem',        label: 'FiveM Server',  group: 'FIVEM',      icon: '🎮', badge: null },
    { key: 'changelog',    label: 'Changelog',     group: 'MANAGE',     icon: '📋',   badge: 'NEW' },
  ]

  const ROLE_COLORS = {
    admin:     { bg: 'rgba(0,255,136,0.1)',  border: 'rgba(0,255,136,0.4)',  color: 'var(--green)' },
    moderator: { bg: 'rgba(0,212,255,0.1)',  border: 'rgba(0,212,255,0.4)',  color: 'var(--cyan)'  },
    editor:    { bg: 'rgba(255,107,53,0.1)', border: 'rgba(255,107,53,0.4)', color: '#ff6b35'      },
    chat:      { bg: 'rgba(255,215,0,0.1)',  border: 'rgba(255,215,0,0.4)',  color: '#ffd700'      },
  }

  const mainPad = isMobile ? '16px 12px' : '48px'
  const fullScreen = ['forum','chat','db'].includes(view)

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', zIndex: 10 }}>
      {/*  Global Admin Header (desktop)  */}
      {!isMobile && (
        <AdminHeader view={view} setView={v => { setView(v); if (v === 'editor') setEditingPost(null) }}
          onLogout={onLogout} sidebarCollapsed={sidebarCollapsed} onToggleSidebar={toggleSidebar} />
      )}
      {/* Mobile top bar */}
      {isMobile && (
        <div style={{ position: 'relative', background: 'var(--bg2)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px', height: 44, flexShrink: 0, zIndex: 97 }}>
          <button onClick={() => setSidebarOpen(o => !o)} style={{ background: 'none', border: 'none', color: 'var(--text)', cursor: 'pointer', padding: '0 4px', lineHeight: 1, display: 'flex', alignItems: 'center' }}>
            <Icon name="panelOpen" size={20} />
          </button>
          <Icon name={NAV_ICONS[view] || 'grid'} size={16} style={{ color: 'var(--green)' }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2, color: 'var(--muted)', textTransform: 'uppercase', flex: 1 }}>
            {navItems.find(n => n.key === view || n.aliases?.includes(view))?.label || 'ADMIN'}
          </span>
        </div>
      )}

      <div style={{ display: 'flex', flex: 1, height: '100%', position: 'relative', zIndex: 1, minHeight: 0, overflow: 'hidden' }}>

        {/* Sidebar — always visible on desktop, drawer on mobile */}
        <Sidebar
          view={view}
          setView={v => { setView(v); if (v === 'editor') setEditingPost(null) }}
          navItems={navItems.filter(canViewNavItem)}
          username={username}
          role={role}
          onLogout={onLogout}
          isMobile={isMobile}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          collapsed={!isMobile && sidebarCollapsed}
        />

        {/* Main content — hidden when full-screen panel active */}
        <main style={{ flex: 1, padding: fullScreen ? 0 : (isMobile ? '10px' : '16px'), overflowY: fullScreen ? 'hidden' : 'auto', display: fullScreen ? 'none' : 'flex', flexDirection: 'column' }}>
          {/*  Page content wrapper — bordered, fills available height  */}
          <div style={{
            flex: 1,
            border: '1px solid var(--border)',
            background: 'var(--bg)',
            overflow: 'auto',
            padding: isMobile ? '16px 12px' : mainPad,
            display: 'flex',
            flexDirection: 'column',
            borderRadius: 14,
            margin: isMobile ? 0 : 4,
          }}>

          {/* Session expiry warning */}
          {sessionWarning && (
            <div style={{ marginBottom: 16, padding: '10px 16px', background: '#ffd70010', border: '1px solid #ffd70033', borderLeft: '3px solid #ffd700', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#ffd700' }}> Your session expires in less than 5 minutes. Save your work and re-login.</span>
              <button onClick={() => setSessionWarning(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 14 }}></button>
            </div>
          )}

          {/* HOME DASHBOARD */}
          {view === 'home' && (
            <div>
              <PageHeader
                eyebrow="OVERVIEW"
                title={`Welcome back, ${username} `}
                subtitle={new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                actions={<>
                  <button onClick={fetchDashStats} style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 1, padding: '7px 14px', background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer', borderRadius: 6 }}> REFRESH</button>
                  <button onClick={() => setView('db')} style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 1, padding: '7px 14px', background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.3)', color: 'var(--green)', cursor: 'pointer', borderRadius: 6 }}> DB MONITOR</button>
                  <button onClick={() => setShowShortcuts(true)} title="Keyboard shortcuts" style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 1, padding: '7px 12px', background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer', borderRadius: 6 }}> ?</button>
                </>}
              />

              {!dashStats ? (
                <div className="loader" />
              ) : (
                <>
                  <StatsGrid dashStats={dashStats} isMobile={isMobile} setView={setView} />

                  {/* Post breakdown bar */}
                  <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', padding: '16px 20px', marginBottom: 20, borderRadius: 14 }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 3, color: 'var(--muted)', marginBottom: 12 }}>POST BREAKDOWN</div>
                    <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                      {[
                        { label: 'Published', value: dashStats.publishedPosts, total: dashStats.totalPosts, color: 'var(--green)' },
                        { label: 'Drafts', value: dashStats.draftPosts, total: dashStats.totalPosts, color: '#ffd700' },
                      ].map(b => (
                        <div key={b.label} style={{ flex: 1, minWidth: 180 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 10, marginBottom: 6 }}>
                            <span style={{ color: b.color }}>{b.label}</span>
                            <span style={{ color: 'var(--muted)' }}>{b.value}/{b.total}</span>
                          </div>
                          <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
                            <div style={{ height: '100%', width: b.total ? `${(b.value / b.total) * 100}%` : '0%', background: b.color, borderRadius: 2, transition: 'width 0.6s ease' }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Quick actions + recent posts */}
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16, marginBottom: 20 }}>
                    {/* Quick actions */}
                    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', padding: '18px 20px', borderRadius: 14 }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 3, color: 'var(--muted)', marginBottom: 14 }}>QUICK ACTIONS</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        {[
                          { label: '[+] New Post', action: () => { setEditingPost(null); setView('editor') }, color: 'var(--green)' },
                          { label: '[M] Media', action: () => setView('media'), color: 'var(--cyan)' },
                          { label: '[S] Add Staff', action: () => { setView('staff'); setShowNewStaff(true) }, color: '#ffd700' },
                          { label: '[D] DB Monitor', action: () => setView('db'), color: '#a78bfa' },
                          { label: '[E] Mail & CDN', action: () => setView('delivery'), color: '#ff6b35' },
                          { label: '[~] CDN', action: () => setView('cdn'), color: '#00d4ff' },
                        ].map(btn => (
                          <button key={btn.label} onClick={btn.action} style={{
                            fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1,
                            padding: '10px 12px', background: 'var(--bg3)',
                            border: '1px solid var(--border)', color: 'var(--text)',
                            cursor: 'pointer', transition: 'all 0.15s', textAlign: 'left',
                          }}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = btn.color; e.currentTarget.style.color = btn.color; e.currentTarget.style.background = `${btn.color}10` }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text)'; e.currentTarget.style.background = 'var(--bg3)' }}
                          >{btn.label}</button>
                        ))}
                      </div>
                    </div>

                    {/* System health — live from API */}
                    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', padding: '18px 20px', borderRadius: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 3, color: 'var(--muted)' }}>SYSTEM STATUS</div>
                        <button onClick={fetchDashStats} title="Refresh" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 12, padding: 0 }}></button>
                      </div>
                      {Object.entries(
                        Object.keys(healthStatus).length > 0
                          ? healthStatus
                          : {
                              'API Server':  { status: 'checking', color: '#888' },
                              'Database':    { status: 'checking', color: '#888' },
                              'Mail Service':{ status: 'configured', color: '#ffd700' },
                              'CDN Storage': { status: 'configured', color: '#ffd700' },
                              'Chat Server': { status: 'checking', color: '#888' },
                              'Forum':       { status: 'operational', color: '#00ff88' },
                            }
                      ).map(([label, s]) => (
                        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)' }}>{label}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: s.color, boxShadow: `0 0 6px ${s.color}` }} />
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: s.color, letterSpacing: 1 }}>{s.status.toUpperCase()}</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Activity feed — from audit log */}
                    {activityFeed.length > 0 && (
                      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', padding: '18px 20px', borderRadius: 14 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 3, color: 'var(--muted)' }}>RECENT ACTIVITY</div>
                          <button onClick={() => setView('db')} style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--cyan)', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: 1 }}>AUDIT LOG </button>
                        </div>
                        {activityFeed.map(item => (
                          <div key={item.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                            <span style={{ fontSize: 13, flexShrink: 0 }}>{item.icon}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.text}</div>
                              {item.time && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', marginTop: 2 }}>{new Date(item.time).toLocaleString()}</div>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Recent posts */}
                  {dashStats.recentPosts?.length > 0 && (
                    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', padding: '18px 20px', borderRadius: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 3, color: 'var(--muted)' }}>RECENT POSTS</div>
                        <button onClick={() => setView('content')} style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--cyan)', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: 1 }}>VIEW ALL </button>
                      </div>
                      {dashStats.recentPosts.map(post => (
                        <div key={post.id} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', padding: '11px 14px', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 12 }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 2, padding: '2px 6px', border: '1px solid', borderColor: post.published ? 'rgba(0,255,136,0.4)' : 'var(--border)', color: post.published ? 'var(--green)' : 'var(--muted)', background: post.published ? 'rgba(0,255,136,0.06)' : 'transparent', flexShrink: 0 }}>
                            {post.published ? 'LIVE' : 'DRAFT'}
                          </span>
                          <div style={{ flex: 1, fontFamily: 'var(--font-display)', fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{post.title}</div>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', flexShrink: 0 }}>{post.views || 0} views</span>
                          <button onClick={() => { setEditingPost(post); setView('editor') }} style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--cyan)', background: 'none', border: '1px solid var(--border)', padding: '4px 10px', cursor: 'pointer', flexShrink: 0 }}>EDIT</button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
          {(view === 'content' || view === 'posts') && (
            <div>
              <PageHeader
                eyebrow="CONTENT"
                title="Content Hub"
                actions={<>
                  <button onClick={() => setView('content')} style={{ ...S.btn('rgba(0,255,136,0.08)', 'var(--green)'), border: '1px solid rgba(0,255,136,0.35)', fontSize: 10, padding: '8px 14px' }}>POSTS</button>
                  <button onClick={() => { setEditingPost(null); setView('editor') }} style={{ ...S.btn('transparent', 'var(--cyan)'), border: '1px solid rgba(0,212,255,0.35)', fontSize: 10, padding: '8px 14px' }}>NEW POST</button>
                  <button onClick={() => setView('forum')} style={{ ...S.btn('transparent', 'var(--muted)'), border: '1px solid var(--border)', fontSize: 10, padding: '8px 14px' }}>FORUM ADMIN</button>
                  {selectedPosts.size > 0 && (
                    <>
                      <button onClick={() => bulkPublishPosts(true)} style={{ ...S.btn('transparent', 'var(--green)'), border: '1px solid rgba(0,255,136,0.4)', fontSize: 10, padding: '8px 14px' }}> PUBLISH ({selectedPosts.size})</button>
                      <button onClick={() => bulkPublishPosts(false)} style={{ ...S.btn('transparent', 'var(--muted)'), border: '1px solid var(--border)', fontSize: 10, padding: '8px 14px' }}> UNPUBLISH ({selectedPosts.size})</button>
                      <button onClick={bulkDeletePosts} style={{ ...S.btn('transparent', 'var(--red)'), border: '1px solid rgba(255,71,87,0.4)', fontSize: 10, padding: '8px 14px' }}> DELETE ({selectedPosts.size})</button>
                    </>
                  )}
                </>}
              />

              {/* Search + filter + sort bar */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ flex: '1 1 220px', position: 'relative' }}>
                  <input
                    value={postSearch} onChange={e => setPostSearch(e.target.value)}
                    placeholder="Search posts by title or category"
                    style={{ ...S.input, fontSize: 12, padding: '9px 12px 9px 32px' }}
                  />
                  <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, opacity: 0.4 }}>[S]</span>
                  {postSearch && <button onClick={() => setPostSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}></button>}
                </div>
                <div style={{ display: 'flex', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                  {[['all','All'],['live','Live'],['draft','Draft']].map(([v, l]) => (
                    <button key={v} onClick={() => setPostFilter(v)} style={{
                      fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 1, padding: '7px 12px', cursor: 'pointer',
                      background: postFilter === v ? 'rgba(0,255,136,0.12)' : 'transparent',
                      color: postFilter === v ? 'var(--green)' : 'var(--muted)', border: 'none',
                      borderRight: '1px solid var(--border)',
                    }}>{l}</button>
                  ))}
                </div>
                <div style={{ width: 160 }}>
                  <Select
                    value={postSort}
                    onChange={setPostSort}
                    options={[
                      ['newest', 'Newest'],
                      ['oldest', 'Oldest'],
                      ['views', '[V] Most Views'],
                      ['title', 'AZ Title'],
                    ]}
                  />
                </div>
              </div>

              {(postSearch || postFilter !== 'all') && (
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', marginBottom: 12, letterSpacing: 1 }}>
                  {filteredPosts.length} result{filteredPosts.length !== 1 ? 's' : ''} {postSearch ? `for "${postSearch}"` : ''} {postFilter !== 'all' ? `· ${postFilter}` : ''}
                  <button onClick={() => { setPostSearch(''); setPostFilter('all'); setPostSort('newest') }} style={{ marginLeft: 10, background: 'none', border: 'none', color: 'var(--cyan)', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 9 }}>CLEAR</button>
                </div>
              )}

              {loading ? <div className="loader" /> : filteredPosts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
                  {postSearch || postFilter !== 'all' ? (
                    <>No posts match that filter. <button onClick={() => { setPostSearch(''); setPostFilter('all') }} style={{ background: 'none', border: 'none', color: 'var(--green)', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}>Clear filters </button></>
                  ) : (
                    <>No posts yet. <button onClick={() => setView('editor')} style={{ background: 'none', border: 'none', color: 'var(--green)', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}>Create one </button></>
                  )}
                </div>
              ) : filteredPosts.map(post => (
                <div key={post.id} style={{ ...S.card, transition: 'border-color 0.2s', borderColor: selectedPosts.has(post.id) ? 'rgba(0,255,136,0.4)' : undefined }}
                  onMouseEnter={e => { if (!selectedPosts.has(post.id)) e.currentTarget.style.borderColor = 'rgba(0,255,136,0.2)' }}
                  onMouseLeave={e => { if (!selectedPosts.has(post.id)) e.currentTarget.style.borderColor = 'var(--border)' }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                    <Checkbox
                      checked={selectedPosts.has(post.id)}
                      onChange={() => setSelectedPosts(s => { const n = new Set(s); n.has(post.id) ? n.delete(post.id) : n.add(post.id); return n })}
                      style={{ width: 30, height: 30, padding: 0, justifyContent: 'center', marginTop: 1, flexShrink: 0 }}
                    />
                    {post.cover_image && !isMobile && (
                      <img src={post.cover_image} alt="" style={{ width: 72, height: 52, objectFit: 'cover', flexShrink: 0 }} />
                    )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: isMobile ? 15 : 17, fontWeight: 600, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {post.title}
                        </div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', letterSpacing: 1 }}>
                          {post.category} · {formatDate(post.created_at)} · {post.views} views
                          {post.publish_at && !post.published && <span style={{ color: 'var(--cyan)', marginLeft: 8 }}> {new Date(post.publish_at).toLocaleDateString()}</span>}
                        </div>
                        {/* Static view count bar — proportional to max views in this page */}
                        {post.views > 0 && (() => {
                          const maxViews = Math.max(...posts.map(p => p.views || 0), 1)
                          const pct = Math.round((post.views / maxViews) * 100)
                          return (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                              <div style={{ flex: 1, maxWidth: 120, height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
                                <div style={{ height: '100%', width: `${pct}%`, background: 'var(--green)', borderRadius: 2 }} />
                              </div>
                              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--green)' }}>{(post.views || 0).toLocaleString()} views</span>
                            </div>
                          )
                        })()}
                      </div>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 2, padding: '3px 8px', border: '1px solid', borderColor: post.published ? 'rgba(0,255,136,0.4)' : 'var(--border)', color: post.published ? 'var(--green)' : 'var(--muted)', background: post.published ? 'rgba(0,255,136,0.06)' : 'transparent', flexShrink: 0 }}>
                        {post.published ? 'LIVE' : 'DRAFT'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
                      <button onClick={() => togglePublish(post)} style={{ ...S.btn('var(--bg3)', 'var(--cyan)'), fontSize: 9, padding: '6px 10px', border: '1px solid var(--border)', flex: isMobile ? 1 : 'unset' }}>
                        {post.published ? 'UNPUBLISH' : 'PUBLISH'}
                      </button>
                      <button onClick={() => { setEditingPost(post); setView('editor') }} style={{ ...S.btn('var(--bg3)', 'var(--text)'), fontSize: 9, padding: '6px 10px', border: '1px solid var(--border)', flex: isMobile ? 1 : 'unset' }}>EDIT</button>
                      <button onClick={() => handleDeletePost(post.id)} style={{ ...S.btn('transparent', 'var(--red)'), fontSize: 9, padding: '6px 10px', border: '1px solid rgba(255,71,87,0.3)', flex: isMobile ? 1 : 'unset' }}>DEL</button>
                    </div>
                  </div>
                ))}
            </div>
          )}

          {/* POST EDITOR */}
          {view === 'editor' && <PostEditor post={editingPost} onSave={handleSavePost} onCancel={() => setView('content')} />}

          {/* MEDIA */}
          {view === 'media' && (
            <div>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: isMobile ? 22 : 28, fontWeight: 700, marginBottom: 24 }}>Media Library</h2>
              <MediaLibrary onSelect={null} inline />
            </div>
          )}
          {view === 'pages' && adminUser && <PanelErrorBoundary label="Pages"><PageContentPanel /></PanelErrorBoundary>}

          {/* CONTACTS */}
          {(view === 'communications' || view === 'contacts') && (
            <div>
              <PageHeader
                eyebrow="COMMUNITY"
                title="Communications"
                actions={<>
                  <button onClick={() => setView('communications')} style={{ ...S.btn('rgba(0,255,136,0.08)', 'var(--green)'), border: '1px solid rgba(0,255,136,0.35)', fontSize: 10, padding: '8px 14px' }}>CONTACTS</button>
                  <button onClick={() => setView('newsletter')} style={{ ...S.btn('transparent', 'var(--cyan)'), border: '1px solid rgba(0,212,255,0.35)', fontSize: 10, padding: '8px 14px' }}>NEWSLETTER</button>
                  {selectedContacts.size > 0 && (
                    <>
                      <button onClick={() => { setReplyModal('bulk'); setReplySubject('Re: Your message'); setReplyBody('') }}
                        style={{ ...S.btn('transparent', 'var(--cyan)'), border: '1px solid rgba(0,212,255,0.4)', fontSize: 10, padding: '8px 14px' }}>
                        📨 BULK REPLY ({selectedContacts.size})
                      </button>
                      <button onClick={bulkDeleteContacts} style={{ ...S.btn('transparent', 'var(--red)'), border: '1px solid rgba(255,71,87,0.4)', fontSize: 10, padding: '8px 14px' }}> DELETE ({selectedContacts.size})</button>
                    </>
                  )}
                </> }
              />
              {/* Filter tabs */}
              <div style={{ display: 'flex', gap: 0, marginBottom: 20, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', alignSelf: 'flex-start', width: 'fit-content' }}>
                {[
                  ['all', `All (${contacts.length})`],
                  ['unreplied', `Unreplied (${contacts.filter(c => !c.replied).length})`],
                  ['replied', `Replied (${contacts.filter(c => c.replied).length})`],
                ].map(([v, l]) => (
                  <button key={v} onClick={() => setContactFilter(v)} style={{
                    fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 1,
                    padding: '8px 16px', cursor: 'pointer', border: 'none',
                    background: contactFilter === v ? 'rgba(0,255,136,0.12)' : 'transparent',
                    color: contactFilter === v ? 'var(--green)' : 'var(--muted)',
                    borderRight: '1px solid var(--border)',
                  }}>{l}</button>
                ))}
              </div>
              {contactsLoading ? <div className="loader" /> : filteredContacts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
                  {contactFilter !== 'all' ? (
                    <>No {contactFilter} messages. <button onClick={() => setContactFilter('all')} style={{ background: 'none', border: 'none', color: 'var(--green)', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}>Show all </button></>
                  ) : 'No messages yet.'}
                </div>
              ) : filteredContacts.map(c => (
                <div key={c.id} style={{ ...S.card, borderColor: selectedContacts.has(c.id) ? 'rgba(0,255,136,0.4)' : undefined }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <Checkbox
                        checked={selectedContacts.has(c.id)}
                        onChange={() => setSelectedContacts(s => { const n = new Set(s); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n })}
                        style={{ width: 30, height: 30, padding: 0, justifyContent: 'center', marginTop: 1, flexShrink: 0 }}
                      />
                      <div>
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 600 }}>{c.name}</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--cyan)' }}>{c.email}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)' }}>{formatDate(c.created_at)}</span>
                      {c.replied && (
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 2, padding: '3px 7px', background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.3)', color: 'var(--green)', borderRadius: 3 }}> REPLIED</span>
                      )}
                      <button onClick={() => { setReplyModal(c); setReplySubject(`Re: ${c.subject || 'Your message'}`); setReplyBody('') }}
                        style={{ ...S.btn('transparent', 'var(--cyan)'), border: '1px solid rgba(0,212,255,0.3)', fontSize: 10, padding: '4px 10px' }}>
                         REPLY
                      </button>
                      <button onClick={() => handleDeleteContact(c.id)} style={{ ...S.btn('transparent', 'var(--red)'), border: '1px solid rgba(255,71,87,0.3)', fontSize: 10, padding: '4px 10px' }}>DEL</button>
                    </div>
                  </div>
                  {c.subject && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--green)', marginBottom: 6 }}>RE: {c.subject}</div>}
                  <p style={{ color: 'var(--text)', lineHeight: 1.7, margin: 0 }}>{c.message}</p>
                </div>
              ))}
            </div>
          )}

          {/*  REPLY MODAL — single contact OR bulk  */}
          {replyModal && (
            <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
              onClick={e => e.target === e.currentTarget && setReplyModal(null)}>
              <div style={{ background: 'var(--bg)', border: '1px solid rgba(0,212,255,0.2)', width: '100%', maxWidth: 580, boxShadow: '0 0 60px rgba(0,212,255,0.06)' }}>

                {/* Header */}
                <div style={{ padding: '16px 20px', background: 'var(--bg2)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 3, color: 'var(--cyan)', marginBottom: 4 }}>
                      {replyModal === 'bulk' ? `BULK REPLY — ${selectedContacts.size} CONTACTS` : 'REPLY TO CONTACT'}
                    </div>
                    {replyModal !== 'bulk' && (
                      <>
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600 }}>{replyModal.name}</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--cyan)' }}>{replyModal.email}</div>
                      </>
                    )}
                    {replyModal === 'bulk' && (
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)' }}>
                        Sends one email to each selected contact
                      </div>
                    )}
                  </div>
                  <button onClick={() => setReplyModal(null)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>✕</button>
                </div>

                {/* Templates */}
                <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--border)', background: 'rgba(0,212,255,0.02)' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 2, color: 'var(--muted)', marginBottom: 8 }}>QUICK TEMPLATES</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {REPLY_TEMPLATES.map(tpl => (
                      <button key={tpl.label} onClick={() => applyTemplate(tpl, replyModal !== 'bulk' ? replyModal : null)}
                        style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 1, padding: '5px 12px', cursor: 'pointer', transition: 'all 0.15s',
                          background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--cyan)', borderRadius: 4 }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(0,212,255,0.5)'; e.currentTarget.style.background = 'rgba(0,212,255,0.08)' }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg3)' }}>
                        {tpl.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Original message preview — single only */}
                {replyModal !== 'bulk' && (
                  <div style={{ padding: '12px 20px', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 2, color: 'var(--muted)', marginBottom: 6 }}>ORIGINAL MESSAGE</div>
                    {replyModal.subject && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--green)', marginBottom: 4 }}>{replyModal.subject}</div>}
                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', lineHeight: 1.6, margin: 0, maxHeight: 60, overflow: 'hidden' }}>{replyModal.message}</p>
                  </div>
                )}

                {/* Compose */}
                <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <label style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 2, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>SUBJECT</label>
                    <input value={replySubject} onChange={e => setReplySubject(e.target.value)}
                      style={{ width: '100%', background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: 12, padding: '10px 12px', outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 2, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>MESSAGE</label>
                    <textarea value={replyBody} onChange={e => setReplyBody(e.target.value)} rows={7}
                      placeholder={replyModal !== 'bulk' ? `Hi ${replyModal.name},\n\nThank you for reaching out...` : 'Hi there,\n\nThank you for reaching out...'}
                      style={{ width: '100%', background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: 12, padding: '10px 12px', outline: 'none', boxSizing: 'border-box', resize: 'vertical', lineHeight: 1.7 }} />
                    {replyModal === 'bulk' && (
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--muted)', marginTop: 4, letterSpacing: 1 }}>
                        TIP: Use <span style={{ color: 'var(--cyan)' }}>{'{{name}}'}</span> to personalise — it will be replaced with each contact's name.
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button onClick={() => setReplyModal(null)}
                      style={{ ...S.btn('transparent', 'var(--muted)'), border: '1px solid var(--border)', padding: '8px 18px', fontSize: 10 }}>
                      CANCEL
                    </button>
                    <button disabled={replySending || !replyBody.trim() || !replySubject.trim()}
                      onClick={async () => {
                        setReplySending(true)
                        try {
                          if (replyModal === 'bulk') {
                            // Bulk: send to all selected contacts
                            const targets = contacts.filter(c => selectedContacts.has(c.id))
                            await Promise.allSettled(targets.map(c =>
                              api.post(`/contact/${c.id}/reply`, {
                                subject: replySubject,
                                body: replyBody.replace(/\{\{name\}\}/g, c.name || 'there'),
                              })
                            ))
                            setContacts(cs => cs.map(c => selectedContacts.has(c.id) ? { ...c, replied: true } : c))
                            setSelectedContacts(new Set())
                            toast.success(`Bulk reply sent to ${targets.length} contacts`, { title: '📨 Bulk Reply' })
                          } else {
                            await api.post(`/contact/${replyModal.id}/reply`, { subject: replySubject, body: replyBody })
                            setContacts(cs => cs.map(c => c.id === replyModal.id ? { ...c, replied: true } : c))
                            toast.success(`Reply sent to ${replyModal.email}`, { title: 'Mail Sent' })
                          }
                          setReplyModal(null)
                        } catch (e) {
                          toast.error(e.response?.data?.error || 'Failed to send reply', { title: 'Error' })
                        } finally { setReplySending(false) }
                      }}
                      style={{ ...S.btn(), padding: '8px 18px', fontSize: 10, opacity: (replySending || !replyBody.trim() || !replySubject.trim()) ? 0.4 : 1 }}>
                      {replySending ? 'SENDING…' : replyModal === 'bulk' ? `📨 SEND TO ${selectedContacts.size}` : '[>] SEND REPLY'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STAFF */}
          {view === 'staff' && adminUser && (
            <div>
              <PageHeader
                eyebrow="COMMUNITY"
                title="Staff Management"
                subtitle="Manage moderators and editors."
                actions={<button onClick={() => setShowNewStaff(true)} style={{ ...S.btn(), padding: '8px 16px', fontSize: 10 }}>+ ADD STAFF</button>}
              />

              {/* Role legend — wraps on mobile */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
                {[['admin', 'Full'], ['moderator', 'Forum + Chat'], ['editor', 'Blog'], ['chat', 'Chat only']].map(([r, desc]) => (
                  <div key={r} style={{ padding: '6px 12px', background: ROLE_COLORS[r]?.bg, border: `1px solid ${ROLE_COLORS[r]?.border}`, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 2, color: ROLE_COLORS[r]?.color }}>{r.toUpperCase()}</span>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>{desc}</span>
                  </div>
                ))}
              </div>

              {loading ? <div className="loader" /> : staff.map(s => (
                <div key={s._id} style={{ ...S.card, display: 'flex', alignItems: 'center', gap: 12, flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: ROLE_COLORS[s.role]?.bg, border: `1px solid ${ROLE_COLORS[s.role]?.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
                    {s.role === 'moderator' ? '' : s.role === 'chat' ? '' : ''}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{s.username}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)' }}>{s.email}</div>
                  </div>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 2, padding: '4px 10px', background: ROLE_COLORS[s.role]?.bg, border: `1px solid ${ROLE_COLORS[s.role]?.border}`, color: ROLE_COLORS[s.role]?.color, flexShrink: 0 }}>
                    {s.role.toUpperCase()}
                  </span>
                  {!isMobile && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
                      {s.lastSeen ? (
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: (() => { const mins = (Date.now() - new Date(s.lastSeen)) / 60000; return mins < 5 ? 'var(--green)' : mins < 60 ? '#ffd700' : 'var(--muted)' })() }}>
                          {(() => { const mins = (Date.now() - new Date(s.lastSeen)) / 60000; return mins < 1 ? ' online now' : mins < 60 ? ` ${Math.floor(mins)}m ago` : mins < 1440 ? ` ${Math.floor(mins/60)}h ago` : ` ${Math.floor(mins/1440)}d ago` })()}
                        </span>
                      ) : (
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--border)' }}> never seen</span>
                      )}
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--border)' }}>joined {formatDate(s.createdAt)}</span>
                    </div>
                  )}
                  <button onClick={() => { setEditingStaff(s); setEditStaffForm({ username: s.username, email: s.email, role: s.role, password: '', forum_user_id: s.forum_user_id || '', module_permissions: s.module_permissions || s.permissions || permissionForRole(s.role) }) }} style={{ ...S.btn('transparent', 'var(--cyan)'), border: '1px solid rgba(0,212,255,0.3)', fontSize: 10, padding: '6px 12px', flexShrink: 0 }}>EDIT</button>
                  <button onClick={() => handleDeleteStaff(s._id, s.username)} style={{ ...S.btn('transparent', 'var(--red)'), border: '1px solid rgba(255,71,87,0.3)', fontSize: 10, padding: '6px 12px', flexShrink: 0 }}>REMOVE</button>
                </div>
              ))}

              {showNewStaff && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}>
                  <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', padding: isMobile ? 20 : 32, width: '100%', maxWidth: 760, maxHeight: '92vh', overflowY: 'auto' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 3, color: 'var(--green)', marginBottom: 20 }}>+ ADD STAFF MEMBER</div>
                    <form onSubmit={handleCreateStaff} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      <div>
                        <label style={S.label}>Account type</label>
                        <div style={{ display:'flex', gap:8 }}>
                          {['standalone','existing'].map(m => <button key={m} type="button" onClick={() => setNewStaff(p => ({ ...p, mode:m, forum_user_id: m === 'standalone' ? '' : p.forum_user_id, password: m === 'existing' ? '' : p.password }))} style={{ flex:1, padding:'9px', fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:1.5, background:newStaff.mode===m?'rgba(0,255,136,.1)':'transparent', color:newStaff.mode===m?'var(--green)':'var(--muted)', border:`1px solid ${newStaff.mode===m?'rgba(0,255,136,.4)':'var(--border)'}`, cursor:'pointer' }}>{m === 'existing' ? 'SELECT USER' : 'STANDALONE'}</button>)}
                        </div>
                      </div>
                      {newStaff.mode === 'existing' && (
                        <div>
                          <label style={S.label}>Search existing user</label>
                          <input value={staffUserQuery} onChange={e => searchStaffUsers(e.target.value)} placeholder="username, email, Discord, Steam" style={S.input} />
                          {staffUserLoading && <div style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--muted)', marginTop:6 }}>Searching...</div>}
                          {staffUserResults.length > 0 && <div style={{ border:'1px solid var(--border)', borderRadius:6, marginTop:6, maxHeight:150, overflowY:'auto' }}>{staffUserResults.map(u => <button key={u.id} type="button" onClick={() => selectStaffUser(u)} style={{ width:'100%', textAlign:'left', padding:'8px 10px', background:'transparent', border:'none', borderBottom:'1px solid rgba(255,255,255,.05)', color:'var(--text)', fontFamily:'var(--font-mono)', cursor:'pointer' }}>{u.username}<span style={{ color:'var(--muted)' }}> · {u.email || u.discord_username || u.steam_username || u.id}</span></button>)}</div>}
                          {newStaff.forum_user_id && <div style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--green)', marginTop:6 }}>Selected user ID: {newStaff.forum_user_id}</div>}
                        </div>
                      )}
                      <div>
                        <label style={S.label}>Role</label>
                        <div style={{ display: 'flex', gap: 8 }}>
                          {['editor', 'moderator', 'chat'].map(r => (
                            <button key={r} type="button" onClick={() => setNewStaff(p => ({ ...p, role: r, module_permissions: permissionForRole(r) }))} style={{ flex: 1, padding: '9px', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2, background: newStaff.role === r ? ROLE_COLORS[r]?.bg : 'transparent', color: newStaff.role === r ? ROLE_COLORS[r]?.color : 'var(--muted)', border: `1px solid ${newStaff.role === r ? ROLE_COLORS[r]?.border : 'var(--border)'}`, cursor: 'pointer' }}>
                              {r === 'editor' ? '[E] EDITOR' : r === 'chat' ? '[C] CHAT' : '[M] MOD'}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div><label style={S.label}>Username</label><input value={newStaff.username} onChange={e => setNewStaff(p => ({ ...p, username: e.target.value }))} placeholder="username" style={S.input} required /></div>
                      <div><label style={S.label}>Email</label><input type="email" value={newStaff.email} onChange={e => setNewStaff(p => ({ ...p, email: e.target.value }))} placeholder="email@example.com" style={S.input} required={newStaff.mode !== 'existing'} /></div>
                      {newStaff.mode !== 'existing' && <div><label style={S.label}>Password</label><input type="password" value={newStaff.password} onChange={e => setNewStaff(p => ({ ...p, password: e.target.value }))} placeholder="" style={S.input} required minLength={8} /></div>}
                      <PermissionEditor value={newStaff.module_permissions} onChange={module_permissions => setNewStaff(p => ({ ...p, module_permissions }))} />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button type="submit" disabled={staffSaving} style={{ ...S.btn(), flex: 1, opacity: staffSaving ? 0.7 : 1 }}>{staffSaving ? 'CREATING...' : 'CREATE'}</button>
                        <button type="button" onClick={() => setShowNewStaff(false)} style={{ ...S.btn('var(--bg3)', 'var(--muted)'), border: '1px solid var(--border)', flex: 1 }}>CANCEL</button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {/* Edit staff modal */}
              {editingStaff && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}>
                  <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', padding: isMobile ? 20 : 32, width: '100%', maxWidth: 760, maxHeight: '92vh', overflowY: 'auto' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 3, color: 'var(--cyan)', marginBottom: 20 }}> EDIT STAFF — {editingStaff.username}</div>
                    <form onSubmit={handleUpdateStaff} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      <div>
                        <label style={S.label}>Role</label>
                        <div style={{ display: 'flex', gap: 8 }}>
                          {['editor', 'moderator', 'chat'].map(r => (
                            <button key={r} type="button" onClick={() => setEditStaffForm(p => ({ ...p, role: r, module_permissions: permissionForRole(r) }))} style={{ flex: 1, padding: '9px', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2, background: editStaffForm.role === r ? ROLE_COLORS[r]?.bg : 'transparent', color: editStaffForm.role === r ? ROLE_COLORS[r]?.color : 'var(--muted)', border: `1px solid ${editStaffForm.role === r ? ROLE_COLORS[r]?.border : 'var(--border)'}`, cursor: 'pointer' }}>
                              {r === 'editor' ? '[E] EDITOR' : r === 'chat' ? '[C] CHAT' : '[M] MOD'}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div><label style={S.label}>Username</label><input value={editStaffForm.username} onChange={e => setEditStaffForm(p => ({ ...p, username: e.target.value }))} style={S.input} required /></div>
                      <div><label style={S.label}>Email</label><input type="email" value={editStaffForm.email} onChange={e => setEditStaffForm(p => ({ ...p, email: e.target.value }))} style={S.input} required /></div>
                      <div><label style={S.label}>New Password <span style={{ color: 'var(--muted)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(leave blank to keep current)</span></label><input type="password" value={editStaffForm.password} onChange={e => setEditStaffForm(p => ({ ...p, password: e.target.value }))} placeholder="" style={S.input} minLength={8} /></div>
                      <PermissionEditor value={editStaffForm.module_permissions} onChange={module_permissions => setEditStaffForm(p => ({ ...p, module_permissions }))} />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button type="submit" disabled={staffSaving} style={{ ...S.btn(), flex: 1, opacity: staffSaving ? 0.7 : 1 }}>{staffSaving ? 'SAVING...' : ' SAVE'}</button>
                        <button type="button" onClick={() => setEditingStaff(null)} style={{ ...S.btn('var(--bg3)', 'var(--muted)'), border: '1px solid var(--border)', flex: 1 }}>CANCEL</button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* MAIL */}
          {(view === 'delivery' || view === 'mail' || view === 'cdn') && adminUser && (
            <PanelErrorBoundary label="Mail & CDN">
              <Mail initialTab={view === 'cdn' ? 'cdn' : 'queue'} />
            </PanelErrorBoundary>
          )}

          {/* NEWSLETTER SUBSCRIBERS */}
          {view === 'newsletter' && adminUser && <PanelErrorBoundary label="Newsletter"><NewsletterPanel /></PanelErrorBoundary>}

          {/* SITE SETTINGS */}
          {/* THEMES / ANNOUNCEMENTS / SETTINGS */}
          {(view === 'themes' || view === 'theme' || view === 'framework' || view === 'announcements' || view === 'settings' || view === 'siteSettings') && <PanelErrorBoundary label="Theme Library"><ThemeHub /></PanelErrorBoundary>}
          {view === 'stats' && adminUser && <PanelErrorBoundary label="Statistics"><StatsPanel /></PanelErrorBoundary>}

          {view === 'helpdesk' && adminUser && <PanelErrorBoundary label="Help Desk"><HelpDeskPanel /></PanelErrorBoundary>}
          {view === 'store' && adminUser && <PanelErrorBoundary label="Store"><StoreCenter /></PanelErrorBoundary>}
          {view === 'changelog' && <PanelErrorBoundary label="Changelog"><Changelog /></PanelErrorBoundary>}
          {view === 'fivem' && adminUser && (
            <PanelErrorBoundary label="FiveM Server">
              <FiveMPanel defaultSection="status" />
            </PanelErrorBoundary>
          )}

          </div>{/* end page-content wrapper */}
        </main>

        {/* Full-screen panels */}
        {(view === 'db' || view === 'audit') && adminUser && <DBMonitor />}
        {view === 'forum' && (
          <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg)' }}>
            <ForumAdmin embedded />
          </div>
        )}
        {view === 'chat' && (
          <div style={{ flex: 1, minWidth: 0, display: 'flex', minHeight: 0, overflow: 'hidden', alignItems: 'stretch', height: '100%' }}>
            <PanelErrorBoundary label="Chat">
              <AdminChat embedded />
            </PanelErrorBoundary>
          </div>
        )}
      </div>

      {/*  Keyboard Shortcuts Modal  */}
      {showShortcuts && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={() => setShowShortcuts(false)}>
          <div style={{ background: 'var(--bg2)', border: '1px solid rgba(0,255,136,0.2)', width: '100%', maxWidth: 500, borderRadius: 10, overflow: 'hidden', boxShadow: '0 0 60px rgba(0,255,136,0.06)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ height: 2, background: 'linear-gradient(90deg, var(--green), var(--cyan))' }} />
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 3, color: 'var(--cyan)', marginBottom: 2 }}>KEYBOARD SHORTCUTS</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700 }}>Quick Navigation</div>
              </div>
              <button onClick={() => setShowShortcuts(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 18 }}></button>
            </div>
            <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 24px' }}>
              {[
                ['H', 'Dashboard home'], ['P', 'Posts list'],
                ['N', 'New post editor'], ['M', 'Media library'],
                ['C', 'Contacts inbox'], ['K', 'Global search'],
                ['?', 'This help panel'], ['ESC', 'Close modals'],
              ].map(([key, desc]) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <kbd style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, padding: '3px 8px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--green)', flexShrink: 0, minWidth: 36, textAlign: 'center' }}>{key}</kbd>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)' }}>{desc}</span>
                </div>
              ))}
            </div>
            <div style={{ padding: '10px 20px', background: 'var(--bg)', borderTop: '1px solid var(--border)' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)' }}>Shortcuts are disabled when typing in input fields.</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

//  Moderator Portal 

export default Dashboard

