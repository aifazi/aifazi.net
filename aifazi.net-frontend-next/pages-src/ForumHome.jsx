'use client'
import { useState, useEffect } from 'react'
import { Link } from '@/lib/router-compat'
import api from '@/lib/api'
import { useForum } from '../context/ForumContext'
import {
  Card, SectionHeader, NeonButton, Badge, Stat, ThreadRowSkeleton,
  EmptyState, timeAgo, SortTabs, CLR,
} from '../components/community'

export default function ForumHome() {
  const { user } = useForum()
  const [cats, setCats]         = useState([])
  const [recent, setRecent]     = useState([])
  const [sort, setSort]         = useState('hot')
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(false)

  useEffect(() => {
    Promise.all([
      api.get('/forum/categories'),
      api.get('/forum/threads?limit=5&sort=hot')
    ]).then(([c, t]) => {
      setCats(Array.isArray(c.data) ? c.data : [])
      const data = Array.isArray(t.data) ? t.data : (t.data?.threads || [])
      setRecent(data)
    }).catch(() => setError(true))
    .finally(() => setLoading(false))
  }, [])

  const fetchRecent = async (s) => {
    setLoading(true)
    try {
      const r = await api.get(`/forum/threads?limit=5&sort=${s}`)
      setRecent(Array.isArray(r.data) ? r.data : (r.data?.threads || []))
    } catch { setError(true) }
    finally { setLoading(false) }
  }

  const handleSort = (s) => {
    setSort(s)
    fetchRecent(s)
  }

  const totalThreads = cats.reduce((sum, c) => sum + (c.threadCount || 0), 0)

  return (
    <div className="page-container community-page" style={{ position: 'relative', zIndex: 1 }}>
      <div className="community-shell">
        {/* Banner */}
        <div className="community-banner">
          <div className="community-banner-eyebrow">COMMUNITY HUB</div>
          <h1 className="community-banner-title">Forum</h1>
          <p className="community-banner-text">
            Discuss networking, security, homelabs and everything in between with the community.
          </p>
          <div style={{ marginTop: 26, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {user ? (
              <NeonButton to="/forum/new" variant="primary" size="lg">+ New Thread</NeonButton>
            ) : (
              <>
                <NeonButton to="/login" variant="ghost" size="lg">Login</NeonButton>
                <NeonButton to="/login?tab=register" variant="outline-green" size="lg">Register</NeonButton>
              </>
            )}
          </div>
        </div>

        {/* Stats strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 44 }}>
          <Stat label="Categories" value={cats.length} color="var(--green)" icon="🗂" />
          <Stat label="Threads" value={totalThreads} color="var(--cyan)" icon="🧵" />
          <Stat label="Members" value={user ? '—' : 'Join us'} color="var(--muted)" icon="👥" />
        </div>

        {loading && !error ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Array.from({ length: 6 }).map((_, i) => <ThreadRowSkeleton key={i} />)}
          </div>
        ) : error ? (
          <Card style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--red)', letterSpacing: 2, marginBottom: 12 }}>SERVER UNAVAILABLE</div>
            <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 20 }}>The server may be waking up. Please wait 30 seconds and try again.</p>
            <NeonButton variant="ghost" onClick={() => { setError(false); setLoading(true); window.location.reload() }}>RETRY</NeonButton>
          </Card>
        ) : (
          <>
            {/* Categories */}
            <div style={{ marginBottom: 52 }}>
              <SectionHeader eyebrow="Browse" title="Categories" />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
                {cats.map(cat => (
                  <Card key={cat.id || cat._id} hover accent style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '22px 24px', textDecoration: 'none' }}>
                    <Link to={`/forum/category/${cat.slug || cat.id}`} style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1, minWidth: 0, textDecoration: 'none', color: 'inherit' }}>
                      <div style={{ fontSize: 30, flexShrink: 0 }}>{cat.icon || '💬'}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{cat.name}</div>
                        {cat.description && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat.description}</div>}
                      </div>
                      <div style={{ flexShrink: 0, textAlign: 'right' }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700, color: cat.color || 'var(--cyan)' }}>{cat.threadCount || 0}</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--muted)', letterSpacing: 1.5 }}>THREADS</div>
                      </div>
                    </Link>
                    {cat.locked && <Badge tone="red" style={{ flexShrink: 0 }}>🔒 Locked</Badge>}
                  </Card>
                ))}
              </div>
            </div>

            {/* Recent activity */}
            <div>
              <SectionHeader
                eyebrow="Latest"
                title="Recent Activity"
                right={<SortTabs options={[
                  { value: 'hot', label: 'Hot' },
                  { value: 'new', label: 'New' },
                  { value: 'top', label: 'Top' },
                ]} value={sort} onChange={handleSort} />}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {recent.map(t => (
                  <Card key={t.id || t._id} hover style={{ padding: '16px 20px' }}>
                    <Link to={`/forum/thread/${t.id || t._id}`} style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', textDecoration: 'none', color: 'inherit' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                          {t.pinned && <Badge tone="green" glow>📌 Pinned</Badge>}
                          {t.locked && <Badge tone="red">🔒 Locked</Badge>}
                          <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                        </div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                          <span style={{ color: t.category?.color || 'var(--cyan)' }}>{t.category?.icon} {t.category?.name || ''}</span>
                          <span>by <span style={{ color: 'var(--text)' }}>{t.author?.username || t.author_name}</span></span>
                          <span>{timeAgo(t.created_at || t.createdAt)}</span>
                          {t.likes > 0 && <span style={{ color: 'var(--red)' }}>♥ {t.likes}</span>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 12, flexShrink: 0 }}>
                        <Stat small label="Replies" value={t.reply_count ?? t.replyCount ?? 0} color="var(--cyan)" />
                        <Stat small label="Views" value={t.views ?? 0} color="var(--muted)" />
                      </div>
                    </Link>
                  </Card>
                ))}
                {recent.length === 0 && (
                  <EmptyState
                    icon="🌱"
                    title="No threads yet"
                    text={user ? 'Start the conversation — create the first thread.' : 'Be the first to post!'}
                    action="+ New Thread"
                    actionTo={user ? '/forum/new' : '/login'}
                  />
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
