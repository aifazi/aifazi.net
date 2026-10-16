'use client'
import { useState, useEffect } from 'react'
import api from '@/lib/api'
import { useToast } from '../../../components/Toast'
import { PageHeader } from '../shared'
import { Checkbox, Input, Select, TextArea } from '../../../core/ui.jsx'
import { PAGE_ANIMATIONS } from '../../../core/pageMotion.jsx'

// Split out of AdminPanels.jsx - PageContentPanel.
const PAGE_CONFIG_KEYS = [
  'home', 'about', 'experience', 'services', 'projects', 'blog', 'forum', 'contact', 'tools',
  'whitelist', 'forms', 'profile', 'helpdesk', 'admin',
]

const emptyPageConfig = key => ({
  key,
  title: key.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
  subtitle: '',
  body: '',
  buttonLabel: '',
  buttonHref: '',
  visible: true,
  animation: 'fade-up',
})

export function PageContentPanel() {
  const toast = useToast()
  const [configs, setConfigs] = useState({})
  const [pageKey, setPageKey] = useState('whitelist')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const current = configs[pageKey] || emptyPageConfig(pageKey)

  useEffect(() => {
    let cancelled = false
    api.get('/content/page_configs')
      .then(r => { if (!cancelled) setConfigs(r.data || {}) })
      .catch(() => toast.error('Failed to load page configs', { title:'Pages' }))
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const set = (key, value) => {
    setConfigs(prev => ({ ...prev, [pageKey]: { ...emptyPageConfig(pageKey), ...(prev[pageKey] || {}), [key]: value } }))
  }

  const save = async () => {
    setSaving(true)
    try {
      const next = { ...configs, [pageKey]: current }
      await api.put('/content/page_configs', next)
      setConfigs(next)
      toast.success(`${current.title || pageKey} saved`, { title:'Pages' })
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to save page config', { title:'Pages' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div style={{ padding:22, color:'var(--muted)', fontFamily:'var(--font-mono)' }}>Loading pages...</div>

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:18 }}>
      <PageHeader eyebrow="ADMIN - CONTENT" title="Page Editor" subtitle="Edit public/private page copy and animation presets from one place." />
      <div style={{ border:'1px solid var(--border)', background:'var(--bg2)', borderRadius:8, overflow:'hidden' }}>
        <div style={{ padding:16, borderBottom:'1px solid var(--border)', display:'flex', gap:10, justifyContent:'space-between', flexWrap:'wrap' }}>
          <Select value={pageKey} onChange={v => setPageKey(v)}
            options={PAGE_CONFIG_KEYS}
            style={{ minWidth: 260 }} />
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            <button onClick={() => { navigator.clipboard?.writeText(`${window.location.origin}/${pageKey === 'home' ? '' : pageKey}`); toast.success('URL copied', { title:'Pages' }) }}
              style={{ background:'color-mix(in srgb, var(--cyan) 8%, transparent)', border:'1px solid color-mix(in srgb, var(--cyan) 35%, transparent)', color:'var(--cyan)', borderRadius:6, padding:'9px 13px', fontFamily:'var(--font-mono)', cursor:'pointer' }}>
              Copy URL
            </button>
            <button onClick={() => window.open(`/${pageKey === 'home' ? '' : pageKey}`, '_blank')}
              style={{ background:'color-mix(in srgb, var(--cyan) 8%, transparent)', border:'1px solid color-mix(in srgb, var(--cyan) 35%, transparent)', color:'var(--cyan)', borderRadius:6, padding:'9px 13px', fontFamily:'var(--font-mono)', cursor:'pointer' }}>
              Open Page
            </button>
            <button disabled={saving} onClick={save}
              style={{ background:'color-mix(in srgb, var(--green) 12%, transparent)', border:'1px solid color-mix(in srgb, var(--green) 45%, transparent)', color:'var(--green)', borderRadius:6, padding:'9px 16px', fontFamily:'var(--font-mono)', cursor:saving?'not-allowed':'pointer', opacity:saving ? 0.65 : 1 }}>
              {saving ? 'Saving...' : 'Save Page'}
            </button>
          </div>
        </div>
        <div style={{ padding:16, display:'grid', gap:12 }}>
          <label style={{ fontFamily:'var(--font-mono)', fontSize: 11, letterSpacing:2, color:'var(--muted)' }}>TITLE</label>
          <Input value={current.title || ''} onChange={v => set('title', v)}
            style={{ background:'var(--bg3)', border:'1px solid var(--border)', color:'var(--text)', borderRadius:6, padding:'12px 13px', fontFamily:'var(--font-mono)' }} />
          <label style={{ fontFamily:'var(--font-mono)', fontSize: 11, letterSpacing:2, color:'var(--muted)' }}>SUBTITLE</label>
          <Input value={current.subtitle || ''} onChange={v => set('subtitle', v)}
            style={{ background:'var(--bg3)', border:'1px solid var(--border)', color:'var(--text)', borderRadius:6, padding:'12px 13px', fontFamily:'var(--font-mono)' }} />
          <label style={{ fontFamily:'var(--font-mono)', fontSize: 11, letterSpacing:2, color:'var(--muted)' }}>BODY / HELPER CONTENT</label>
          <TextArea rows={6} value={current.body || ''} onChange={v => set('body', v)}
            style={{ background:'var(--bg3)', border:'1px solid var(--border)', color:'var(--text)', borderRadius:6, padding:'12px 13px', fontFamily:'var(--font-mono)', resize:'vertical' }} />
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:10 }}>
            <Input value={current.buttonLabel || ''} onChange={v => set('buttonLabel', v)} placeholder="Button label"
              style={{ background:'var(--bg3)', border:'1px solid var(--border)', color:'var(--text)', borderRadius:6, padding:'12px 13px', fontFamily:'var(--font-mono)' }} />
            <Input value={current.buttonHref || ''} onChange={v => set('buttonHref', v)} placeholder="/target-url"
              style={{ background:'var(--bg3)', border:'1px solid var(--border)', color:'var(--text)', borderRadius:6, padding:'12px 13px', fontFamily:'var(--font-mono)' }} />
            <Select value={current.animation || 'none'} onChange={v => set('animation', v)}
              options={PAGE_ANIMATIONS} />
          </div>
          <Checkbox checked={current.visible !== false} onChange={checked => set('visible', checked)} label="Visible / enabled" />
        </div>
      </div>
    </div>
  )
}
