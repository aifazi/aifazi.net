'use client'
import { useState, useEffect } from 'react'
import { Link } from '@/lib/router-compat'
import api from '@/lib/api'
import { useForum } from '../context/ForumContext'
import {
  Card, SectionHeader, NeonButton, Badge, Stat, ThreadRowSkeleton,
  EmptyState, timeAgo, SortTabs, Avatar,
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
      api.get('/forum/threads?limit=8&sort=hot')
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
      const r = await api.get(`/forum/threads?limit=8&sort=${s}`)
      setRecent(Array.isArray(r.data) ? r.data : (r.data?.threads || []))
    } catch { setError(true) }
    finally { setLoading(false) }
  }

  const handleSort = (s) => {
    setSort(s)
    fetchRecent(s)
  }

  const totalThreads = cats.reduce((sum, c) => sum + (c.threadCount || 0), 0)
  const activeCats = cats.filter(c => (c.threadCount || 0) > 0)

  const topContributors = (() => {
    const count = {}
    recent.forEach(t => {
      const name = t.author?.username || t.author_name
      if (name) count[name] = (count[name] || 0) + (t.reply_count ?? t.replyCount ?? 0) + 1
    })
    return Object.entries(count).sort((a, b) => b[1] - a[1]).slice(0, 4)
  })()

  const trending = [...recent].filter(t => (t.reply_count ?? t.replyCount ?? 0) > 0).sort((a, b) => (b.reply_count ?? b.replyCount ?? 0) - (a.reply_count ?? a.replyCount ?? 0)).slice(0, 3)

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
          <div style={{ marginTop: 16, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
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
          <div className="forum-home-grid forum-frame" style={{ display: 'grid', gridTemplateColumns: '280px minmax(0,1fr)', gap: 26, alignItems: 'start' }}>
            {/* ── Left sidebar: categories ── */}
            <aside className="forum-home-sidebar" style={{ position: 'sticky', top: 96, display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Stats */}
              <Card style={{ padding: 22 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 3, color: 'var(--muted)', marginBottom: 16 }}>STATS</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <Stat small label="Categories" value={cats.length} color="var(--green)" icon="🗂" />
                  <Stat small label="Threads" value={totalThreads} color="var(--cyan)" icon="🧵" />
                  <Stat small label="Members" value={user ? '—' : 'Join us'} color="var(--muted)" icon="👥" />
                </div>
              </Card>

              {/* Categories */}
              <Card style={{ padding: 22 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 3, color: 'var(--muted)' }}>CATEGORIES</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--green)' }}>{cats.length}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {cats.length === 0 && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', padding: '8px 0' }}>No categories yet.</div>}
                  {cats.map(cat => (
                    <Link key={cat.id || cat._id} to={`/forum/category/${cat.slug || cat.id}`} className="forum-cat-link"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px',
                        borderRadius: 10, textDecoration: 'none', color: 'var(--text)',
                      }}
                    >
                      <span style={{ fontSize: 20, flexShrink: 0 }}>{cat.icon || '💬'}</span>
                      <span style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat.name}</span>
                      {cat.locked && <span style={{ fontSize: 11, opacity: 0.5 }}>🔒</span>}
                      <span style={{
                        fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--cyan)',
                        background: 'color-mix(in srgb, var(--cyan) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--cyan) 18%, transparent)',
                        borderRadius: 999, padding: '2px 8px', flexShrink: 0,
                      }}>{cat.threadCount || 0}</span>
                    </Link>
                  ))}
                </div>
              </Card>

              {/* CTA */}
              <Card accent style={{ padding: 22 }}>
                <div style={{ fontSize: 26, marginBottom: 10 }}>🧭</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>Start a discussion</div>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', lineHeight: 1.7, margin: '0 0 16px' }}>
                  {activeCats.length} active categor{activeCats.length !== 1 ? 'ies' : 'y'} with {totalThreads} thread{totalThreads !== 1 ? 's' : ''}.
                </p>
                <NeonButton to="/forum/new" variant="primary" size="sm" style={{ width: '100%' }}>+ New Thread</NeonButton>
              </Card>

              {/* Active Contributors */}
              {topContributors.length > 0 && (
                <Card style={{ padding: 22 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 3, color: 'var(--muted)' }}>TOP VOICES</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--green)' }}>{topContributors.length}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {topContributors.map(([name, score], i) => (
                      <div key={name} style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                        borderRadius: 10, background: 'rgba(255,255,255,0.015)',
                      }}>
                        <span style={{
                          fontFamily: 'var(--font-mono)', fontSize: 10, color: i === 0 ? 'var(--green)' : i === 1 ? 'var(--cyan)' : 'var(--muted)',
                          fontWeight: 700, width: 18, textAlign: 'center', flexShrink: 0,
                        }}>#{i + 1}</span>
                        <Avatar user={{ username: name, avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}&backgroundColor=00ff88,00d4ff&fontSize=36` }} size={28} />
                        <span style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', flexShrink: 0 }}>{score} pts</span>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </aside>

            {/* ── Main column: trending + recent ── */}
            <div className="forum-home-main">
              {/* Trending */}
              {trending.length > 0 && (
                <div style={{ marginBottom: 32 }}>
                  <SectionHeader eyebrow="Hot Right Now" title="🔥 Trending" />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {trending.map(t => (
                      <Card key={t.id || t._id} hover style={{ padding: '14px 20px', borderColor: 'color-mix(in srgb, var(--cyan) 18%, transparent)' }}>
                        <Link to={`/forum/thread/${t.id || t._id}`} style={{ display: 'flex', alignItems: 'center', gap: 14, textDecoration: 'none', color: 'inherit' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600, color: 'var(--text)', wordBreak: 'break-word' }}>{t.title}</span>
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', display: 'flex', gap: 12, alignItems: 'center', marginTop: 4 }}>
                              <span style={{ color: t.category?.color || 'var(--cyan)' }}>{t.category?.icon} {t.category?.name || ''}</span>
                              <span>by <span style={{ color: 'var(--text)' }}>{t.author?.username || t.author_name}</span></span>
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                            <Stat small label="Replies" value={t.reply_count ?? t.replyCount ?? 0} color="var(--cyan)" />
                            <Stat small label="Views" value={t.views ?? 0} color="var(--muted)" />
                          </div>
                        </Link>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

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
                  <Card key={t.id || t._id} hover style={{ padding: '18px 22px', background: t.pinned ? 'color-mix(in srgb, var(--green) 4%, var(--bg2))' : undefined }}>
                    <Link to={`/forum/thread/${t.id || t._id}`} style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', textDecoration: 'none', color: 'inherit' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 7 }}>
                          {t.pinned && <Badge tone="green" glow>📌 Pinned</Badge>}
                          {t.locked && <Badge tone="red">🔒 Locked</Badge>}
                          <span style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 600, color: 'var(--text)', wordBreak: 'break-word' }}>{t.title}</span>
                        </div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                          <span style={{ color: t.category?.color || 'var(--cyan)' }}>{t.category?.icon} {t.category?.name || ''}</span>
                          <span>by <span style={{ color: 'var(--text)' }}>{t.author?.username || t.author_name}</span></span>
                          <span>{timeAgo(t.created_at || t.createdAt)}</span>
                          {t.likes > 0 && <span style={{ color: 'var(--red)' }}>♥ {t.likes}</span>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
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
          </div>
        )}
      </div>

      <style>{`
        @media (max-width: 920px) {
          .forum-home-grid { grid-template-columns: 1fr !important; }
          .forum-home-sidebar { position: static !important; order: 2; }
          .forum-home-main { order: 1; }
        }
      `}</style>
    </div>
  )
}
