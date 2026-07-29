'use client'
import { useState, useEffect } from 'react'
import { Link } from '@/lib/router-compat'
import api from '@/lib/api'
import { useForum } from '../context/ForumContext'
import { ThreadRowSkeleton } from '../components/Skeleton'

function timeAgo(date) {
  const s = Math.floor((Date.now() - new Date(date)) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s/60)}m ago`
  if (s < 86400) return `${Math.floor(s/3600)}h ago`
  return `${Math.floor(s/86400)}d ago`
}

export default function ForumHome() {
  const { user } = useForum()
  const [cats, setCats]         = useState([])
  const [recent, setRecent]     = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(false)

  useEffect(() => {
    Promise.all([
      api.get('/forum/categories'),
      api.get('/forum/threads?limit=5')
    ]).then(([c, t]) => {
      setCats(Array.isArray(c.data) ? c.data : [])
      // FastAPI returns flat array, old backend returned { threads: [] }
      const threads = Array.isArray(t.data) ? t.data : (t.data?.threads || [])
      setRecent(threads)
    }).catch(() => setError(true))
    .finally(() => setLoading(false))
  }, [])

  return (
    <div className="page-container" style={{ position: 'relative', zIndex: 1 }}>
      {/* Header */}
      <div style={{ maxWidth: 900, width: '100%', margin: '0 auto', padding: '0 0 40px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 16, marginBottom: 40 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--green)', letterSpacing: 4, marginBottom: 8 }}>COMMUNITY</div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(32px,5vw,52px)', fontWeight: 700, letterSpacing: -1 }}>Forum</h1>
          </div>
          {user ? (
            <Link to="/forum/new" style={{
              fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2,
              padding: '12px 24px', background: 'var(--green)', color: '#000',
              textDecoration: 'none', fontWeight: 700
            }}>+ NEW THREAD</Link>
          ) : (
            <div style={{ display: 'flex', gap: 10 }}>
              <Link to="/login" style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, padding: '10px 20px', border: '1px solid var(--border)', color: 'var(--muted)', textDecoration: 'none' }}>LOGIN</Link>
              <Link to="/login?tab=register" style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, padding: '10px 20px', background: 'rgba(0,255,136,0.1)', border: '1px solid rgba(0,255,136,0.3)', color: 'var(--green)', textDecoration: 'none' }}>REGISTER</Link>
            </div>
          )}
        </div>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {Array.from({ length: 8 }).map((_, i) => <ThreadRowSkeleton key={i} />)}
          </div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--red)', letterSpacing: 2, marginBottom: 12 }}>SERVER UNAVAILABLE</p>
            <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 20 }}>The server may be waking up. Please wait 30 seconds and try again.</p>
            <button onClick={() => { setError(false); setLoading(true); window.location.reload() }}
              style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, padding: '10px 24px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer' }}>
              RETRY
            </button>
          </div>
        ) : (
          <>
            {/* Categories */}
            <div style={{ marginBottom: 48 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', letterSpacing: 3, marginBottom: 16 }}>CATEGORIES</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px,1fr))', gap: 2 }}>
                {cats.map(cat => (
                  <Link key={cat.id || cat._id} to={`/forum/category/${cat.slug || cat.id}`}
                    style={{
                      background: 'var(--bg2)', border: '1px solid var(--border)',
                      padding: '20px 24px', textDecoration: 'none',
                      display: 'flex', alignItems: 'center', gap: 16,
                      transition: 'border-color 0.2s, transform 0.2s'
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = cat.color || 'var(--cyan)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'translateY(0)' }}
                  >
                    <div style={{ fontSize: 28, flexShrink: 0 }}>{cat.icon || '💬'}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{cat.name}</div>
                      {cat.description && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat.description}</div>}
                    </div>
                    <div style={{ flexShrink: 0, textAlign: 'right' }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700, color: cat.color || 'var(--cyan)' }}>{cat.threadCount}</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', letterSpacing: 1 }}>THREADS</div>
                    </div>
                    {cat.locked && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--red)', marginLeft: 4 }}>🔒</div>}
                  </Link>
                ))}
              </div>
            </div>

            {/* Recent threads */}
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', letterSpacing: 3, marginBottom: 16 }}>RECENT ACTIVITY</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {recent.map(t => (
                  <Link key={t.id || t._id} to={`/forum/thread/${t.id || t._id}`}
                    style={{
                      background: 'var(--bg2)', border: '1px solid var(--border)',
                      padding: '16px 20px', textDecoration: 'none',
                      display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
                      transition: 'border-color 0.2s'
                    }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(0,255,136,0.3)'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                        {t.pinned && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, padding: '2px 6px', background: 'rgba(0,255,136,0.1)', border: '1px solid rgba(0,255,136,0.3)', color: 'var(--green)', letterSpacing: 1 }}>📌 PINNED</span>}
                        {t.locked && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, padding: '2px 6px', background: 'rgba(255,71,87,0.1)', border: '1px solid rgba(255,71,87,0.3)', color: 'var(--red)', letterSpacing: 1 }}>🔒 LOCKED</span>}
                        <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                      </div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        <span style={{ color: 'var(--muted)' }}>{t.category?.name || t.category_name || ''}</span>
                        <span>by <span style={{ color: 'var(--text)' }}>{t.author?.username || t.author_name}</span></span>
                        <span>{timeAgo(t.created_at || t.createdAt)}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 16, flexShrink: 0 }} className="thread-meta-stats">
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 700, color: 'var(--cyan)' }}>{t.reply_count ?? t.replyCount ?? 0}</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--muted)', letterSpacing: 1 }}>REPLIES</div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 700, color: 'var(--muted)' }}>{t.views}</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--muted)', letterSpacing: 1 }}>VIEWS</div>
                      </div>
                    </div>
                  </Link>
                ))}
                {recent.length === 0 && (
                  <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                    No threads yet. {user ? <Link to="/forum/new" style={{ color: 'var(--green)' }}>Start one →</Link> : 'Be the first to post!'}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
