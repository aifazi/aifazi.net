'use client'

import React, { useEffect, useState } from 'react'
import api from '@/lib/api'
import { useForum } from '@/context/ForumContext'
import { useNotify } from '../core/notify.jsx'
import { MotionPage, usePageConfig } from '../core/pageMotion.jsx'
import { ThreadRowSkeleton } from '../components/Skeleton.jsx'

const G = '#00FF88'
const C = '#00D4FF'
const R = '#ff4757'
const M = "var(--font-mono,'JetBrains Mono',monospace)"
const STAFF_ROLES = new Set(['admin', 'moderator', 'editor', 'chat'])

function Shell({ children, narrow = false }) {
  const pageConfig = usePageConfig('forms', {})
  return (
    <MotionPage animation={pageConfig.animation || 'fade-up'}>
    <main style={{ minHeight:'100vh', padding:'92px 20px 64px' }}>
      <div style={{ maxWidth:narrow ? 760 : 1040, margin:'0 auto' }}>{children}</div>
    </main>
    </MotionPage>
  )
}



function Input({ field, value, onChange, disabled }) {
  const base = {
    width:'100%', boxSizing:'border-box', background:'rgba(255,255,255,0.04)',
    border:'1px solid rgba(255,255,255,0.1)', borderRadius:8, color:'var(--text)',
    padding:'11px 13px', fontFamily:M, fontSize:13, outline:'none',
  }
  if (field.type === 'textarea') {
    return <textarea rows={field.rows || 5} value={value || ''} disabled={disabled}
      onChange={e => onChange(e.target.value)} placeholder={field.placeholder || ''} style={{ ...base, resize:'vertical' }} />
  }
  if (field.type === 'select') {
    return (
      <select value={value || ''} disabled={disabled} onChange={e => onChange(e.target.value)} style={base}>
        <option value="">Select...</option>
        {(field.options || []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
      </select>
    )
  }
  return <input type={field.type === 'number' ? 'number' : 'text'} value={value || ''} disabled={disabled}
    onChange={e => onChange(e.target.value)} placeholder={field.placeholder || ''} style={base} />
}

function Field({ field, value, onChange, error, disabled }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
      <label style={{ fontFamily:M, fontSize:10, letterSpacing:1.8, color:error ? R : 'var(--muted)', textTransform:'uppercase' }}>
        {field.label || field.id} {field.required && <span style={{ color:R }}>*</span>}
      </label>
      <Input field={field} value={value} onChange={onChange} disabled={disabled} />
      {field.help && !error && <span style={{ color:'var(--muted)', fontSize:11, lineHeight:1.6 }}>{field.help}</span>}
      {field.min_length > 0 && !error && (
        <span style={{ color:(value || '').length < field.min_length ? R : G, fontSize:10, fontFamily:M, textAlign:'right' }}>
          {(value || '').length} / {field.min_length} min
        </span>
      )}
      {error && <span style={{ color:R, fontSize:11 }}>{error}</span>}
    </div>
  )
}

export function ApplicationFormsIndex() {
  const notify = useNotify()
  const [forms, setForms] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const cacheKey = 'aifazi_forms_cache_v1'
    try {
      const cached = JSON.parse(sessionStorage.getItem(cacheKey) || 'null')
      if (cached?.ts && Date.now() - cached.ts < 60000) {
        setForms(cached.forms || [])
        setLoading(false)
      }
    } catch {}
    api.get('/forms')
      .then(r => {
        const rows = r.data.forms || []
        setForms(rows)
        try { sessionStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), forms: rows })) } catch {}
      })
      .catch(() => {
        setForms([])
        notify.error('Could not load application forms.', { title:'Forms' })
      })
      .finally(() => setLoading(false))
  }, [])

  return (
    <Shell>
      <div style={{ marginBottom:28 }}>
        <div style={{ fontFamily:M, color:G, fontSize:10, letterSpacing:4, marginBottom:8 }}>AIFAZI RP · APPLICATIONS</div>
        <h1 style={{ color:'var(--text)', fontFamily:M, fontSize:30, margin:'0 0 8px' }}>Community Applications</h1>
        <p style={{ color:'var(--muted)', margin:0, lineHeight:1.7 }}>
          Apply for staff, departments, and specialist RP roles. You must already be whitelisted, and only one community application can be pending or approved at a time.
        </p>
      </div>
      {loading ? (
        <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
          {Array.from({ length: 6 }).map((_, i) => <ThreadRowSkeleton key={i} />)}
        </div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(260px, 1fr))', gap:14 }}>
          {forms.map(form => (
            <a key={form.slug} href={`/forms/${form.slug}`} style={{
              textDecoration:'none', background:'rgba(255,255,255,0.025)', border:'1px solid var(--border)',
              borderRadius:10, padding:18, display:'flex', flexDirection:'column', gap:10,
            }}>
              <div style={{ display:'flex', justifyContent:'space-between', gap:10, alignItems:'center' }}>
                <strong style={{ color:'var(--text)', fontFamily:M, fontSize:15 }}>{form.title}</strong>
                <span style={{ color:C, border:`1px solid ${C}40`, borderRadius:20, padding:'2px 8px', fontSize:10, fontFamily:M }}>{form.category}</span>
              </div>
              <p style={{ color:'var(--muted)', fontSize:13, lineHeight:1.7, margin:0 }}>{form.description}</p>
              <span style={{ color:G, fontSize:11, fontFamily:M, letterSpacing:1.4 }}>OPEN FORM →</span>
            </a>
          ))}
        </div>
      )}
    </Shell>
  )
}

export function ApplicationFormPage({ slug }) {
  const { user, loading: authLoading } = useForum()
  const notify = useNotify()
  const [formDef, setFormDef] = useState(null)
  const [answers, setAnswers] = useState({})
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(true)
  const [contextLoading, setContextLoading] = useState(false)
  const [gate, setGate] = useState(null)
  const [prefilled, setPrefilled] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)
  const isStaffPreview = !!user && (user._staff || user.staff_account || STAFF_ROLES.has(user.role))

  useEffect(() => {
    setLoading(true)
    setGate(null)
    setPrefilled(false)
    setAnswers({})
    setErrors({})
    setMsg(null)
    api.get(`/forms/${slug}`).then(r => setFormDef(r.data)).catch(() => setFormDef(null)).finally(() => setLoading(false))
  }, [slug])

  useEffect(() => {
    if (!user || !formDef || prefilled) return
    if (isStaffPreview) {
      setGate({ approved:true, message:'Admin preview mode', whitelist:null })
      setPrefilled(true)
      return
    }
    setContextLoading(true)
    api.get(`/forms/${slug}/context`)
      .then(r => {
        const nextForm = r.data.form || formDef
        const prefill = r.data.prefill || {}
        setFormDef(nextForm)
        setGate({
          approved: !!r.data.whitelist_approved,
          message: r.data.requirement_message || 'You must be whitelisted before applying for this form.',
          whitelist: r.data.whitelist || null,
        })
        setAnswers(prev => {
          const next = { ...prev }
          ;(nextForm.fields || []).forEach(field => {
            const value = prefill[field.id]
            if ((next[field.id] === undefined || next[field.id] === '') && value !== undefined && value !== null && value !== '') {
              next[field.id] = String(value)
            }
          })
          return next
        })
      })
      .catch(err => {
        setGate({
          approved: false,
          message: err?.response?.data?.detail || 'You must be whitelisted before applying for this form.',
          whitelist: null,
        })
      })
      .finally(() => {
        setContextLoading(false)
        setPrefilled(true)
      })
  }, [user, formDef, slug, prefilled, isStaffPreview])

  const set = (id, value) => {
    setAnswers(a => ({ ...a, [id]: value }))
    setErrors(e => ({ ...e, [id]: '' }))
  }

  const validate = () => {
    const next = {}
    ;(formDef?.fields || []).forEach(field => {
      const value = String(answers[field.id] || '').trim()
      if (field.required && !value) next[field.id] = 'Required'
      else if (field.min_length && value.length < field.min_length) next[field.id] = `Minimum ${field.min_length} characters`
    })
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const submit = async () => {
    if (isStaffPreview) {
      const text = 'Admin preview mode is read-only. Use the admin FiveM forms panel to manage submissions.'
      setMsg({ type:'err', text })
      notify.info(text, { title:'Preview mode' })
      return
    }
    if (formDef.require_whitelist !== false && gate && !gate.approved) {
      setMsg({ type:'err', text:gate.message || 'You must be whitelisted before applying for this form.' })
      return
    }
    if (!validate()) return
    setSaving(true); setMsg(null)
    try {
      const r = await api.post(`/forms/${slug}/submit`, { answers })
      setMsg({ type:'ok', text:r.data.message || 'Application submitted.' })
      notify.success(r.data.message || 'Application submitted.', { title:'Application' })
      setAnswers({})
    } catch (err) {
      const text = err?.response?.data?.detail || 'Submission failed.'
      setMsg({ type:'err', text })
      notify.error(text, { title:'Application failed' })
    } finally {
      setSaving(false)
    }
  }

  if (loading || authLoading) return <Shell narrow><div style={{ display:'flex', flexDirection:'column', gap:2 }}>{Array.from({ length: 4 }).map((_, i) => <ThreadRowSkeleton key={i} />)}</div></Shell>
  if (!formDef) return <Shell narrow><div style={{ color:R, fontFamily:M }}>FORM NOT FOUND</div></Shell>

  if (!user) {
    return (
      <Shell narrow>
        <div style={{ border:`1px solid ${C}40`, background:`${C}10`, borderRadius:12, padding:26, textAlign:'center' }}>
          <h1 style={{ color:'var(--text)', fontFamily:M, margin:'0 0 10px' }}>{formDef.title}</h1>
          <p style={{ color:'var(--muted)' }}>Sign in before submitting this application.</p>
          <a href={`/login?next=/forms/${formDef.slug}`} style={{ color:C, fontFamily:M, letterSpacing:2 }}>SIGN IN →</a>
        </div>
      </Shell>
    )
  }

  if (!isStaffPreview && contextLoading && !gate) {
    return <Shell narrow><div style={{ display:'flex', flexDirection:'column', gap:2 }}>{Array.from({ length: 4 }).map((_, i) => <ThreadRowSkeleton key={i} />)}</div></Shell>
  }

  if (!isStaffPreview && formDef.require_whitelist !== false && gate && !gate.approved) {
    return (
      <Shell narrow>
        <div style={{ display:'flex', flexDirection:'column', gap:18 }}>
          <div>
            <div style={{ color:G, fontFamily:M, fontSize:10, letterSpacing:4, marginBottom:8 }}>{formDef.category?.toUpperCase()} APPLICATION</div>
            <h1 style={{ color:'var(--text)', fontFamily:M, fontSize:28, margin:'0 0 8px' }}>{formDef.title}</h1>
            <p style={{ color:'var(--muted)', lineHeight:1.75, margin:0 }}>{formDef.intro || formDef.description}</p>
          </div>
          <div style={{ border:`1px solid ${R}55`, background:`${R}10`, borderRadius:12, padding:24 }}>
            <div style={{ color:R, fontFamily:M, fontSize:10, letterSpacing:3, marginBottom:10 }}>WHITELIST REQUIRED</div>
            <h2 style={{ color:'var(--text)', fontFamily:M, margin:'0 0 10px', fontSize:20 }}>You must be whitelisted</h2>
            <p style={{ color:'var(--muted)', lineHeight:1.75, margin:'0 0 18px' }}>
              {gate.message || 'You must be whitelisted before applying for this form.'}
            </p>
            <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
              <a href="/whitelist" style={{
                border:`1px solid ${G}55`, background:`${G}15`, color:G, borderRadius:8,
                padding:'11px 14px', fontFamily:M, fontSize:11, letterSpacing:1.5, textDecoration:'none',
              }}>OPEN WHITELIST</a>
              <a href="/profile" style={{
                border:`1px solid ${C}45`, background:`${C}10`, color:C, borderRadius:8,
                padding:'11px 14px', fontFamily:M, fontSize:11, letterSpacing:1.5, textDecoration:'none',
              }}>CHECK PROFILE</a>
            </div>
          </div>
        </div>
      </Shell>
    )
  }

  return (
    <Shell narrow>
      <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
        <div>
          <div style={{ color:G, fontFamily:M, fontSize:10, letterSpacing:4, marginBottom:8 }}>{formDef.category?.toUpperCase()} APPLICATION</div>
          <h1 style={{ color:'var(--text)', fontFamily:M, fontSize:28, margin:'0 0 8px' }}>{formDef.title}</h1>
          <p style={{ color:'var(--muted)', lineHeight:1.75, margin:0 }}>{formDef.intro || formDef.description}</p>
        </div>
        {isStaffPreview && (
          <div style={{ border:`1px solid ${C}45`, background:`${C}10`, borderRadius:10, padding:'12px 14px', color:C, fontFamily:M, fontSize:11, letterSpacing:1 }}>
            ADMIN PREVIEW - submission is disabled here; edit and review applications from the admin panel.
          </div>
        )}
        {msg && (
          <div style={{ border:`1px solid ${msg.type === 'ok' ? G : R}50`, background:`${msg.type === 'ok' ? G : R}10`, color:msg.type === 'ok' ? G : R, borderRadius:8, padding:'12px 14px', fontFamily:M, fontSize:12 }}>
            {msg.text}
          </div>
        )}
        <div style={{ background:'rgba(255,255,255,0.025)', border:'1px solid var(--border)', borderRadius:12, padding:22, display:'flex', flexDirection:'column', gap:18 }}>
          {(formDef.fields || []).map(field => (
            <Field key={field.id} field={field} value={answers[field.id]} onChange={v => set(field.id, v)} error={errors[field.id]} disabled={saving} />
          ))}
          <button onClick={submit} disabled={saving || isStaffPreview} style={{
            marginTop:4, padding:'13px 18px', borderRadius:8, border:`1px solid ${G}55`,
            background:`${G}18`, color:G, fontFamily:M, fontSize:12, letterSpacing:2,
            cursor:(saving || isStaffPreview) ? 'not-allowed' : 'pointer', opacity:(saving || isStaffPreview) ? 0.65 : 1,
          }}>{isStaffPreview ? 'ADMIN PREVIEW ONLY' : saving ? 'SUBMITTING...' : 'SUBMIT APPLICATION'}</button>
        </div>
      </div>
    </Shell>
  )
}
