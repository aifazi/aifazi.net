'use client'
import { useState, useEffect } from 'react'
import { Link, useParams } from '@/lib/router-compat'
import api from '@/lib/api'
import { useForum } from '../context/ForumContext'
import {
  Card, NeonButton, Badge, Stat, ThreadRowSkeleton, EmptyState, Pagination,
  timeAgo, SearchBox, SortTabs, CLR, Avatar,
} from '../components/community'

export default function ForumCategory() {
  const { slug } = useParams()
  const { user } = useForum()
  const [cat, setCat]           = useState(null)
  const [cats, setCats]         = useState([])
  const [threads, setThreads]   = useState([])
  const [total, setTotal]       = useState(0)
  const [pages, setPages]       = useState(1)
  const [page, setPage]         = useState(1)
  const [sort, setSort]         = useState('new')
  const [search, setSearch]     = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
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
    const t = setTimeout(() => setDebouncedSearch(search), 350)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    if (!cat) return
    setLoading(true)
    api.get(`/forum/threads?category_id=${cat._id || cat.id}&page=${page}&search=${debouncedSearch}&sort=${sort}`)
      .then(r => {
        const data = Array.isArray(r.data) ? r.data : (r.data?.threads || [])
        setThreads(data)
        setTotal(r.data?.total ?? data.length)
        setPages(r.data?.pages ?? Math.max(1, Math.ceil((r.data?.total ?? data.length) / 20)))
      })
      .finally(() => setLoading(false))
  }, [cat, page, debouncedSearch, sort])

  useEffect(() => { setPage(1) }, [debouncedSearch, sort])

  if (!cat && !loading) return (
    <div className="page-container community-page" style={{ zIndex: 1, position: 'relative', textAlign: 'center', paddingTop: 120 }}>
      <EmptyState icon="🔍" title="Category not found" text="This category may have been removed." action="← Back to Forum" actionTo="/forum" />
    </div>
  )

  return (
    <div className="page-container community-page" style={{ position: 'relative', zIndex: 1 }}>
      <div className="community-shell">

        {/* Breadcrumb */}
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', marginBottom: 22, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Link to="/forum" style={{ color: 'var(--muted)', textDecoration: 'none' }} onMouseEnter={e => e.currentTarget.style.color = 'var(--green)'} onMouseLeave={e => e.currentTarget.style.color = 'var(--muted)'}>FORUM</Link>
          <span>/</span>
          <span style={{ color: cat?.color || 'var(--cyan)' }}>{cat?.icon} {cat?.name?.toUpperCase()}</span>
        </div>

        {/* Header card */}
        <Card accent={cat?.color?.includes('cyan') ? 'cyan' : undefined} style={{ padding: '30px 32px', marginBottom: 26 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
              <div style={{ fontSize: 44 }}>{cat?.icon || '💬'}</div>
              <div>
                <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(26px,4vw,40px)', fontWeight: 700, color: 'var(--text)', margin: 0 }}>{cat?.name}</h1>
                {cat?.description && <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', margin: '6px 0 0' }}>{cat.description}</p>}
                {cat?.locked && <Badge tone="red" style={{ marginTop: 10 }}>🔒 Category locked</Badge>}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Stat small label="Threads" value={cat?.threadCount || 0} color="var(--green)" />
              {user && !cat?.locked && <NeonButton to={`/forum/new?cat=${cat?.id || cat?._id}`} variant="primary">+ New Thread</NeonButton>}
            </div>
          </div>
        </Card>

        {/* Category pills */}
        {cats.length > 1 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
            {cats.map(c => (
              <Link key={c.id || c._id} to={`/forum/category/${c.slug || c.id}`}
                style={{
                  fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 1.2,
                  padding: '6px 12px', borderRadius: 999,
                  border: `1px solid ${c.slug === slug ? (c.color || 'var(--cyan)') : 'var(--border)'}`,
                  color: c.slug === slug ? (c.color || 'var(--cyan)') : 'var(--muted)',
                  textDecoration: 'none',
                  background: c.slug === slug ? 'rgba(0,212,255,0.08)' : 'transparent',
                }}>
                {c.icon} {c.name}
              </Link>
            ))}
          </div>
        )}

        {/* Toolbar: search + sort */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 22 }}>
          <SearchBox value={search} onChange={setSearch} placeholder="Search threads..." style={{ flex: 1, minWidth: 220 }} />
          <SortTabs options={[
            { value: 'new', label: 'New' },
            { value: 'hot', label: 'Hot' },
            { value: 'top', label: 'Top' },
          ]} value={sort} onChange={setSort} />
        </div>

        {/* Threads */}
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Array.from({ length: 6 }).map((_, i) => <ThreadRowSkeleton key={i} />)}
          </div>
        ) : (
          <>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', marginBottom: 12, letterSpacing: 1.5 }}>
              {total} THREAD{total !== 1 ? 'S' : ''}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {threads.map(t => (
                <Card key={t.id || t._id} hover style={{ padding: '16px 20px', background: t.pinned ? 'color-mix(in srgb, var(--green) 4%, var(--bg2))' : undefined }}>
                  <Link to={`/forum/thread/${t.id || t._id}`} style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', textDecoration: 'none', color: 'inherit' }}>
                    <Avatar user={t.author} size={38} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                        {t.pinned && <Badge tone="green" glow>📌</Badge>}
                        {t.locked && <Badge tone="red">🔒</Badge>}
                        <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 600, color: 'var(--text)', wordBreak: 'break-word' }}>{t.title}</span>
                      </div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{ color: 'var(--text)' }}>{t.author?.username || t.author_name}</span>
                        <span>·</span>
                        <span>{timeAgo(t.createdAt || t.created_at)}</span>
                        {t.lastReplyAt && (t.replyCount || 0) > 0 && <span>· last reply {timeAgo(t.lastReplyAt)}</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
                      <Stat small label="Replies" value={t.reply_count ?? t.replyCount ?? 0} color="var(--cyan)" />
                      <Stat small label="Views" value={t.views ?? 0} color="var(--muted)" />
                      {(t.likes || 0) > 0 && <Stat small label="Likes" value={t.likes} color="var(--green)" />}
                    </div>
                  </Link>
                </Card>
              ))}
              {threads.length === 0 && (
                <EmptyState
                  icon="🔎"
                  title={debouncedSearch ? 'No matches' : 'No threads yet'}
                  text={debouncedSearch ? 'Try a different search.' : (user && !cat?.locked ? 'Be the first to post here.' : 'No threads in this category yet.')}
                  action={user && !cat?.locked && !debouncedSearch ? '+ New Thread' : undefined}
                  actionTo={user && !cat?.locked ? `/forum/new?cat=${cat?.id || cat?._id}` : undefined}
                />
              )}
            </div>
            <Pagination page={page} pages={pages} onChange={setPage} total={total} />
          </>
        )}
      </div>
    </div>
  )
}
