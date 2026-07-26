'use client'
import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams, Link } from '@/lib/router-compat'
import api from '@/lib/api'
import { useForum } from '../context/ForumContext'
import { Select } from '../core/ui.jsx'

export default function ForumNewThread() {
  const { user } = useForum()
  const navigate = useNavigate()
  // Next.js useSearchParams() can be null before Suspense hydration completes —
  // always use optional chaining to avoid "Cannot read properties of null (reading 'get')"
  const searchParams = useSearchParams()
  const catFromUrl = searchParams?.get('cat') ?? ''

  const [cats, setCats]       = useState([])
  const [catsLoading, setCatsLoading] = useState(true)
  const [catsError, setCatsError] = useState(false)
  const [form, setForm]       = useState({ title: '', content: '', category: catFromUrl, tags: '' })
  const [attachments, setAttachments] = useState([])
  const [uploading, setUploading]     = useState(false)
  const [submitting, setSubmitting]   = useState(false)
  const [error, setError]             = useState('')
  const fileInputRef = useRef()

  useEffect(() => {
    if (!user) { navigate('/login?next=/forum/new'); return }
    api.get('/forum/categories')
      .then(r => setCats(r.data))
      .catch(() => setCatsError(true))
      .finally(() => setCatsLoading(false))
  }, [user])

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files)
    if (!files.length) return
    setUploading(true)
    const formData = new FormData()
    files.forEach(f => formData.append('files', f))
    try {
      const res = await api.post('/upload/multiple', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      setAttachments(a => [...a, ...res.data])
    } catch { setError('Upload failed') }
    finally { setUploading(false) }
  }

  const removeAttachment = (i) => setAttachments(a => a.filter((_, idx) => idx !== i))

  const handleSubmit = async () => {
    if (!form.title.trim() || !form.content.trim() || !form.category) {
      setError('Title, content and category are required'); return
    }
    setSubmitting(true); setError('')
    try {
      const res = await api.post('/forum/threads', {
        title: form.title.trim(),
        content: form.content,
        category_id: form.category,
        tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
        attachments: attachments.map(f => ({ url: f.url, public_id: f.public_id, original_name: f.original_name, mimetype: f.mimetype, size: f.size }))
      })
      navigate(`/forum/thread/${res.data.id || res.data._id}`)
    } catch (err) { setError(err.response?.data?.detail || err.response?.data?.error || 'Failed to create thread') }
    finally { setSubmitting(false) }
  }

  return (
    <div className="page-container" style={{ position: 'relative', zIndex: 1 }}>
      <div style={{ maxWidth: 800, margin: '0 auto', paddingBottom: 80 }}>

        <div style={{ marginBottom: 32 }}>
          <Link to="/forum" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', textDecoration: 'none', letterSpacing: 2 }}>← BACK TO FORUM</Link>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(24px,4vw,40px)', fontWeight: 700, marginTop: 16 }}>New Thread</h1>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Category */}
          <div>
            <label style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2, color: 'var(--muted)', display: 'block', marginBottom: 8 }}>CATEGORY *</label>
            {catsLoading ? (
              <div style={{ padding: '12px 16px', background: 'var(--bg2)', border: '1px solid var(--border)', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>Loading categories...</div>
            ) : catsError ? (
              <div style={{ padding: '12px 16px', background: 'rgba(255,71,87,0.06)', border: '1px solid rgba(255,71,87,0.2)', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--red)' }}>Failed to load categories. Please refresh.</div>
            ) : cats.filter(c => !c.locked).length === 0 ? (
              <div style={{ padding: '14px 16px', background: 'rgba(255,107,53,0.06)', border: '1px solid rgba(255,107,53,0.3)', fontFamily: 'var(--font-mono)', fontSize: 11, color: '#ff6b35', lineHeight: 1.7 }}>
                ⚠️ No categories exist yet.{' '}
                <a href="/admin" style={{ color: 'var(--green)', textDecoration: 'none' }}>Go to Admin Panel → Forum Admin</a>
                {' '}to create forum categories first.
              </div>
            ) : (
              <Select value={form.category} onChange={v => setForm(f => ({ ...f, category: v }))}
                placeholder="Select a category..."
                style={{ background: 'var(--bg2)', fontSize: 15 }}
                options={[['', 'Select a category...'], ...cats.filter(c => !c.locked).map(c => [c.id || c._id, `${c.icon} ${c.name}`])]} />
            )}
          </div>

          {/* Title */}
          <div>
            <label style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2, color: 'var(--muted)', display: 'block', marginBottom: 8 }}>TITLE *</label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Give your thread a clear title..."
              maxLength={200}
              style={{ width: '100%', background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--font-display)', fontSize: 18, padding: '12px 16px', outline: 'none' }} />
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', textAlign: 'right', marginTop: 4 }}>{form.title.length}/200</div>
          </div>

          {/* Content */}
          <div>
            <label style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2, color: 'var(--muted)', display: 'block', marginBottom: 8 }}>CONTENT *</label>
            <textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
              placeholder="Write your post... Be clear and descriptive."
              rows={10}
              style={{ width: '100%', background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--font-display)', fontSize: 15, padding: '14px 16px', outline: 'none', resize: 'vertical', lineHeight: 1.8 }} />
          </div>

          {/* Attachments */}
          <div>
            <label style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2, color: 'var(--muted)', display: 'block', marginBottom: 8 }}>ATTACHMENTS</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
              {attachments.map((f, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: 'var(--bg2)', border: '1px solid var(--border)', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text)' }}>
                  {f.mimetype?.startsWith('image/') ? '🖼' : f.mimetype?.startsWith('video/') ? '🎬' : '📎'} {f.original_name}
                  <button onClick={() => removeAttachment(i)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 13, padding: 0 }}>✕</button>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => fileInputRef.current.click()} disabled={uploading}
              style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1, padding: '8px 18px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer' }}>
              {uploading ? '⏳ UPLOADING...' : '📎 ATTACH FILES (Images, Videos, Docs)'}
            </button>
            <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }} onChange={handleUpload} />
          </div>

          {/* Tags */}
          <div>
            <label style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2, color: 'var(--muted)', display: 'block', marginBottom: 8 }}>TAGS <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(comma-separated, optional)</span></label>
            <input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
              placeholder="networking, cisco, vpn"
              style={{ width: '100%', background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--font-display)', fontSize: 15, padding: '10px 16px', outline: 'none' }} />
          </div>

          {error && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--red)', padding: '10px 16px', background: 'rgba(255,71,87,0.06)', border: '1px solid rgba(255,71,87,0.2)' }}>{error}</div>}

          <div style={{ display: 'flex', gap: 12, paddingTop: 8, flexWrap: 'wrap' }} className="forum-submit-row">
            <button onClick={handleSubmit} disabled={submitting}
              style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, padding: '12px 28px', background: 'var(--green)', color: '#000', border: 'none', cursor: 'pointer', opacity: submitting ? 0.7 : 1, fontWeight: 700 }}>
              {submitting ? 'POSTING...' : '🚀 POST THREAD'}
            </button>
            <button onClick={() => navigate(-1)}
              style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, padding: '12px 20px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer' }}>
              CANCEL
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
