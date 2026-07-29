'use client'
import { useState, useEffect } from 'react'
import { Link, useParams } from '@/lib/router-compat'
import api from '@/lib/api'
import { useForum } from '../context/ForumContext'

function timeAgo(date) {
  if (!date) return ''
  const d = new Date(date)
  if (isNaN(d.getTime())) return ''
  const s = Math.floor((Date.now() - d) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s/60)}m ago`
  if (s < 86400) return `${Math.floor(s/3600)}h ago`
  return `${Math.floor(s/86400)}d ago`
}

export default function ForumCategory() {
  const { slug } = useParams()
  const { user } = useForum()
  const [cat, setCat]           = useState(null)
  const [cats, setCats]         = useState([])
  const [threads, setThreads]   = useState([])
  const [total, setTotal]       = useState(0)
  const [page, setPage]         = useState(1)
  const [pages, setPages]       = useState(1)
  const [search, setSearch]     = useState('')
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    api.get('/forum/categories').then(r => {
      const list = Array.isArray(r.data) ? r.data : []
      setCats(list)
      const found = list.find(c => c.slug === slug || c.id === slug || c._id === slug)
      setCat(found || null)
    })
  }, [slug])

  useEffect(() => {
    if (!cat) return
    setLoading(true)
    api.get(`/forum/threads?category_id=${cat._id || cat.id}&page=${page}&search=${search}`)
      .then(r => {
        // FastAPI returns flat array; old backend returned { threads, total, pages }
        const data = Array.isArray(r.data) ? r.data : (r.data?.threads || [])
        setThreads(data)
        setTotal(r.data?.total ?? data.length)
        setPages(r.data?.pages ?? 1)
      })
      .finally(() => setLoading(false))
  }, [cat, page, search])

  if (!cat && !loading) return (
    <div className="page-container" style={{ zIndex: 1, position: 'relative', textAlign: 'center', paddingTop: 120 }}>
      <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--red)' }}>Category not found</div>
      <Link to="/forum" style={{ color: 'var(--green)', fontFamily: 'var(--font-mono)', fontSize: 12, marginTop: 16, display: 'block' }}>← Back to Forum</Link>
    </div>
  )

  return (
    <div className="page-container" style={{ position: 'relative', zIndex: 1 }}>
      <div style={{ maxWidth: 900, width: '100%', margin: '0 auto', padding: '0 0 60px' }}>

        {/* Breadcrumb */}
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', marginBottom: 24, display: 'flex', gap: 8, alignItems: 'center' }}>
          <Link to="/forum" style={{ color: 'var(--muted)', textDecoration: 'none' }} onMouseEnter={e => e.currentTarget.style.color = 'var(--green)'} onMouseLeave={e => e.currentTarget.style.color = 'var(--muted)'}>FORUM</Link>
          <span>/</span>
          <span style={{ color: cat?.color || 'var(--cyan)' }}>{cat?.name?.toUpperCase()}</span>
        </div>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ fontSize: 36 }}>{cat?.icon || '💬'}</div>
            <div>
              <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(24px,4vw,40px)', fontWeight: 700 }}>{cat?.name}</h1>
              {cat?.description && <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{cat.description}</p>}
            </div>
          </div>
          {user && !cat?.locked && (
            <Link to={`/forum/new?cat=${cat?.id || cat?._id}`} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, padding: '10px 20px', background: 'var(--green)', color: '#000', textDecoration: 'none', fontWeight: 700 }}>+ NEW THREAD</Link>
          )}
        </div>

        {/* Search bar */}
        <div style={{ marginBottom: 20 }}>
          <input
            value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="Search threads..."
            style={{ width: '100%', background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--font-display)', fontSize: 15, padding: '10px 16px', outline: 'none' }}
          />
        </div>

        {/* Category sidebar quick nav */}
        {cats.length > 1 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }} className="cat-nav-pills">
            {cats.map(c => (
              <Link key={c.id || c._id} to={`/forum/category/${c.slug || c.id}`}
                style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 1, padding: '4px 10px', border: `1px solid ${c.slug === slug ? (c.color || 'var(--cyan)') : 'var(--border)'}`, color: c.slug === slug ? (c.color || 'var(--cyan)') : 'var(--muted)', textDecoration: 'none', background: c.slug === slug ? 'rgba(0,212,255,0.06)' : 'transparent' }}>
                {c.icon} {c.name}
              </Link>
            ))}
          </div>
        )}

        {/* Threads */}
        {loading ? <div className="loader" /> : (
          <>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', marginBottom: 12, letterSpacing: 1 }}>
              {total} THREAD{total !== 1 ? 'S' : ''}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {threads.map(t => (
                <Link key={t.id || t._id} to={`/forum/thread/${t.id || t._id}`}
                  style={{ background: t.pinned ? 'rgba(0,255,136,0.02)' : 'var(--bg2)', border: `1px solid ${t.pinned ? 'rgba(0,255,136,0.2)' : 'var(--border)'}`, padding: '16px 20px', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', transition: 'border-color 0.2s' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(0,255,136,0.35)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = t.pinned ? 'rgba(0,255,136,0.2)' : 'var(--border)'}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                      {t.pinned && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, padding: '2px 6px', background: 'rgba(0,255,136,0.1)', border: '1px solid rgba(0,255,136,0.3)', color: 'var(--green)', letterSpacing: 1 }}>📌</span>}
                      {t.locked && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, padding: '2px 6px', background: 'rgba(255,71,87,0.1)', border: '1px solid rgba(255,71,87,0.3)', color: 'var(--red)', letterSpacing: 1 }}>🔒</span>}
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 600, color: 'var(--text)', wordBreak: 'break-word' }}>{t.title}</span>
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                      <img src={t.author?.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${t.author?.username}`} alt="" loading="lazy" style={{ width: 18, height: 18, borderRadius: '50%', objectFit: 'cover' }} />
                      <span style={{ color: 'var(--text)' }}>{t.author?.username || t.author_name}</span>
                      <span>·</span>
                      <span>{timeAgo(t.createdAt || t.created_at)}</span>
                      {(t.lastReplyBy || t.last_reply_by) && (t.replyCount || t.reply_count) > 0 && (
                        <span>· last reply {timeAgo(t.lastReplyAt || t.last_reply_at)}</span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 20, flexShrink: 0 }} className="thread-meta-stats">
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700, color: 'var(--cyan)' }}>{t.reply_count ?? t.replyCount ?? 0}</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--muted)', letterSpacing: 1 }}>REPLIES</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700, color: 'var(--muted)' }}>{t.views}</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--muted)', letterSpacing: 1 }}>VIEWS</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700, color: 'var(--green)' }}>{t.likes?.length || 0}</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--muted)', letterSpacing: 1 }}>LIKES</div>
                    </div>
                  </div>
                </Link>
              ))}
              {threads.length === 0 && (
                <div style={{ textAlign: 'center', padding: 80, color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                  {search ? 'No threads match your search.' : 'No threads yet.'}
                  {user && !cat?.locked && !search && <> <Link to={`/forum/new?cat=${cat?.id || cat?._id}`} style={{ color: 'var(--green)' }}>Start one →</Link></>}
                </div>
              )}
            </div>

            {/* Pagination */}
            {pages > 1 && (
              <div style={{ display: 'flex', gap: 6, marginTop: 24, justifyContent: 'center' }}>
                {Array.from({ length: pages }).map((_, i) => (
                  <button key={i} onClick={() => setPage(i + 1)}
                    style={{ fontFamily: 'var(--font-mono)', fontSize: 11, padding: '6px 12px', background: page === i+1 ? 'rgba(0,255,136,0.15)' : 'var(--bg2)', border: `1px solid ${page === i+1 ? 'rgba(0,255,136,0.4)' : 'var(--border)'}`, color: page === i+1 ? 'var(--green)' : 'var(--muted)', cursor: 'pointer' }}>
                    {i + 1}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
