'use client'
import { useState, useEffect } from 'react'
import { Link } from '@/lib/router-compat'
import NextImage from 'next/image'
import api, { mediaUrl } from '@/lib/api'
import { BlogCardSkeleton } from '../components/Skeleton'
import PageMeta from '../components/PageMeta'
import { getSupabase } from '@/lib/supabase'

const CATEGORIES = ['All', 'Networking', 'Security', 'Cloud', 'Linux', 'Tutorial', 'General']

function BlogCover({ src, title }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) {
    return (
      <div className="blog-cover-wrapper">
        <span style={{ fontSize: 48, opacity: 0.3 }}>📝</span>
      </div>
    )
  }
  return (
    <div className="blog-cover-wrapper">
      <NextImage
        src={mediaUrl(src)}
        alt={title}
        fill
        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 400px"
        style={{ objectFit: 'cover', transition: 'transform 0.4s ease' }}
        onError={() => setFailed(true)}
      />
    </div>
  )
}

export default function Blog({ initialPosts }) {
  // ISR: when the server page renders, it passes cached posts so visitors see
  // content on first paint instead of a client-side fetch + skeleton.
  const [posts, setPosts] = useState(initialPosts || [])
  const [loading, setLoading] = useState(!initialPosts)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')
  const [searchInput, setSearchInput] = useState('')
  const [activeTag, setActiveTag] = useState('')   // #11 tag filter
  const [allTags, setAllTags] = useState([])       // #11 tag list

  const [fetchError, setFetchError] = useState(false)

  const fetchPosts = async () => {
    setLoading(true)
    setFetchError(false)
    try {
      // Don't send category when "All" is selected — backend would filter for
      // posts literally categorised as "All" and return nothing.
      const params = { search }
      if (category && category !== 'All') params.category = category
      if (activeTag) params.tag = activeTag
      const res = await api.get('/blog', { params })
      const posts = res.data.posts || []
      setPosts(posts)
      // #11 — extract unique tags from this page of results for the tag chip bar
      const tags = [...new Set(posts.flatMap(p => p.tags || []).filter(Boolean))].sort()
      setAllTags(tags)
    } catch (err) {
      setPosts([])
      if (err.code === 'ECONNABORTED' || !err.response) setFetchError(true)
    } finally {
      setLoading(false)
    }
  }

  const hasInitialData = !!(initialPosts && initialPosts.length)
  useEffect(() => {
    // When the ISR-rendered default view is already present, skip the redundant
    // first fetch — the Realtime channel below keeps live edits in sync.
    if (hasInitialData && !search && category === 'All' && !activeTag) return
    fetchPosts()
  }, [category, search, activeTag])

  // Live-sync: re-fetch whenever a post is inserted/updated/deleted in Supabase
  useEffect(() => {
    const sb = getSupabase()
    if (!sb) return
    const channel = sb
      .channel('blog-posts-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, () => {
        fetchPosts()
      })
      .subscribe()
    return () => { sb.removeChannel(channel) }
  }, [category, search, activeTag]) // re-subscribe when filter changes so fetch uses current params

  const handleSearch = e => {
    e.preventDefault()
    setSearch(searchInput)
  }

  const formatDate = d => new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  const readingTime = (text = '') => {
    const words = (text || '').trim().split(/\s+/).filter(Boolean).length
    const mins = Math.max(1, Math.round(words / 200))
    return `${mins} min read`
  }

  return (
    <div className="page-container" style={{ padding: '80px 0 0', position: 'relative', zIndex: 1 }}>
      <PageMeta
        title="Blog"
        description="Networking deep-dives, security guides, infrastructure walkthroughs and lessons from the field."
        url="/blog"
      />
      {/* Header */}
      <div className="blog-header-inner" style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg2)' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--green)', letterSpacing: 4, marginBottom: 16 }}>
          // BLOG
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(40px, 6vw, 72px)', fontWeight: 700, letterSpacing: -2, marginBottom: 16 }}>
          Field Notes &<br /><span style={{ color: 'var(--green)' }}>Tech Insights</span>
        </h1>
        <p style={{ color: 'var(--muted)', fontSize: 17, maxWidth: 500 }}>
          Networking deep-dives, security guides, infrastructure walkthroughs and lessons from the field.
        </p>
      </div>

      {/* Filters */}
      <div className="blog-filter-bar" style={{ borderBottom: '1px solid var(--border)', display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Search */}
        <form onSubmit={handleSearch} className="blog-search-form" style={{ display: 'flex', gap: 0 }}>
          <input value={searchInput} onChange={e => setSearchInput(e.target.value)}
            placeholder="Search posts..."
            style={{
              flex: 1, background: 'var(--bg2)', border: '1px solid var(--border)',
              borderRight: 'none', color: 'var(--text)', fontFamily: 'var(--font-display)',
              fontSize: 15, padding: '12px 16px', outline: 'none'
            }} />
          <button type="submit" style={{
            background: 'var(--green)', color: '#000', border: 'none',
            padding: '12px 20px', fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: 1
          }}>GO</button>
        </form>

        {/* Category pills */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {CATEGORIES.map(cat => (
            <button key={cat} onClick={() => setCategory(cat)} style={{
              fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2,
              padding: '8px 16px', border: '1px solid',
              borderColor: category === cat ? 'var(--green)' : 'var(--border)',
              background: category === cat ? 'rgba(0,255,136,0.1)' : 'transparent',
              color: category === cat ? 'var(--green)' : 'var(--muted)',
              cursor: 'pointer', transition: 'all 0.2s'
            }}>{cat}</button>
          ))}
        </div>

        {/* Tag chips — only shown when tags exist in the current result set */}
        {allTags.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', width: '100%' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 2, color: 'var(--muted)', marginRight: 4 }}>TAGS:</span>
            {activeTag && (
              <button onClick={() => setActiveTag('')} style={{
                fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 1,
                padding: '4px 10px', border: '1px solid rgba(255,60,60,0.4)',
                background: 'rgba(255,60,60,0.08)', color: 'var(--red)',
                cursor: 'pointer', transition: 'all 0.2s'
              }}>✕ CLEAR</button>
            )}
            {allTags.map(tag => (
              <button key={tag} onClick={() => setActiveTag(activeTag === tag ? '' : tag)} style={{
                fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 1,
                padding: '4px 10px', border: '1px solid',
                borderColor: activeTag === tag ? 'var(--green)' : 'var(--border)',
                background: activeTag === tag ? 'rgba(0,255,136,0.1)' : 'transparent',
                color: activeTag === tag ? 'var(--green)' : 'var(--muted)',
                cursor: 'pointer', transition: 'all 0.2s'
              }}>#{tag}</button>
            ))}
          </div>
        )}
      </div>

      {/* Posts grid */}
      <div className="blog-posts-outer">
        {loading ? (
          <div className="blog-posts-grid" style={{ display: 'grid', gap: 2 }}>
            {Array.from({ length: 6 }).map((_, i) => <BlogCardSkeleton key={i} />)}
          </div>
        ) : fetchError ? (
          <div style={{ textAlign: 'center', padding: '80px 0' }}>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--red)', letterSpacing: 2, marginBottom: 12 }}>SERVER UNAVAILABLE</p>
            <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 20 }}>The server may be waking up. Please wait 30 seconds and try again.</p>
            <button onClick={() => fetchPosts()} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, padding: '10px 24px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer' }}>RETRY</button>
          </div>
        ) : posts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--muted)' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📭</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14 }}>No posts found.</div>
            {search && <button onClick={() => { setSearch(''); setSearchInput('') }} style={{ marginTop: 16, background: 'none', border: '1px solid var(--border)', color: 'var(--cyan)', padding: '8px 20px', fontFamily: 'var(--font-mono)', fontSize: 12, cursor: 'pointer' }}>Clear Search</button>}
          </div>
        ) : (
          <div className="blog-posts-grid" style={{ display: 'grid', gap: 2 }}>
            {posts.map(post => (
              <Link key={post.id} to={`/blog/${post.slug}`} style={{ textDecoration: 'none' }}>
                <article style={{
                  background: 'var(--bg2)', border: '1px solid var(--border)',
                  overflow: 'hidden', height: '100%',
                  transition: 'border-color 0.3s, transform 0.3s',
                  display: 'flex', flexDirection: 'column'
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(0,255,136,0.3)'; e.currentTarget.style.transform = 'translateY(-4px)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'translateY(0)' }}
                >
                  <BlogCover src={post.cover_image} title={post.title} />
                  <div style={{ padding: 28, flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{
                        fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 2,
                        padding: '4px 10px', background: 'rgba(0,212,255,0.08)',
                        border: '1px solid rgba(0,212,255,0.2)', color: 'var(--cyan)'
                      }}>{post.category}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)' }}>
                        {formatDate(post.created_at)}
                      </span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)' }}>
                        ⏱ {readingTime(post.excerpt + ' ' + (post.content || ''))}
                      </span>
                      {post.views > 0 && (
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)' }}>
                          👁 {post.views}
                        </span>
                      )}
                    </div>
                    <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, marginBottom: 12, lineHeight: 1.3, color: 'var(--text)' }}>
                      {post.title}
                    </h2>
                    <p style={{ color: 'var(--muted)', fontSize: 15, lineHeight: 1.6, marginBottom: 20, flex: 1 }}>
                      {post.excerpt || 'Read more...'}
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--green)', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2 }}>
                      READ MORE <span>→</span>
                    </div>
                  </div>
                </article>
              </Link>
            ))}
          </div>
        )}
      </div>

      <style>{`
        /* ── Cover image wrapper ── */
        .blog-cover-wrapper {
          position: relative; width: 100%; height: 220px;
          background: var(--bg3);
          display: flex; align-items: center; justify-content: center;
          overflow: hidden;
        }
        .blog-cover-wrapper img {
          width: 100%; height: 100%; object-fit: cover; display: block;
        }

        /* ── Header & filter bar ── */
        .blog-header-inner  { padding: 80px 60px 60px; }
        .blog-filter-bar    { padding: 24px 60px; }
        .blog-search-form   { flex: 1; max-width: 360px; }

        /* ── Posts outer padding ── */
        .blog-posts-outer   { padding: 60px 60px 120px; }

        /* ── Responsive grid: 3 → 2 → 1 columns ── */
        .blog-posts-grid    { grid-template-columns: repeat(3, 1fr); }

        /* Tablet: 768px – 1023px → 2 columns */
        @media (max-width: 1023px) {
          .blog-header-inner  { padding: 60px 32px 40px; }
          .blog-filter-bar    { padding: 20px 32px; }
          .blog-posts-outer   { padding: 40px 32px 80px; }
          .blog-posts-grid    { grid-template-columns: repeat(2, 1fr); }
          .blog-cover-wrapper { height: 200px; }
        }

        /* Mobile: ≤ 767px → 1 column */
        @media (max-width: 767px) {
          .blog-header-inner  { padding: 48px 16px 28px !important; }
          .blog-header-inner h1 { font-size: clamp(28px, 8vw, 44px) !important; }
          .blog-header-inner p  { font-size: 15px !important; }
          .blog-filter-bar    { padding: 14px 16px !important; flex-direction: column !important; align-items: stretch !important; gap: 12px !important; }
          .blog-search-form   { max-width: 100% !important; }
          .blog-posts-outer   { padding: 24px 16px 60px !important; }
          .blog-posts-grid    { grid-template-columns: 1fr !important; }
          .blog-cover-wrapper { height: 180px; }
        }

        /* Small mobile: ≤ 480px */
        @media (max-width: 480px) {
          .blog-header-inner  { padding: 40px 12px 24px !important; }
          .blog-posts-outer   { padding: 16px 12px 48px !important; }
          .blog-cover-wrapper { height: 160px; }
        }
      `}</style>
    </div>
  )
}
