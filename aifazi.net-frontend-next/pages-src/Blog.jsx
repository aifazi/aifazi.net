'use client'
import { useState, useEffect } from 'react'
import { Link } from '@/lib/router-compat'
import NextImage from 'next/image'
import api, { mediaUrl } from '@/lib/api'
import { BlogCardSkeleton } from '../components/Skeleton'
import PageMeta from '../components/PageMeta'
import { getSupabase } from '@/lib/supabase'
import { Card, NeonButton, Badge, EmptyState } from '../components/community'

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

function readingTime(text = '') {
  const words = (text || '').trim().split(/\s+/).filter(Boolean).length
  const mins = Math.max(1, Math.round(words / 200))
  return `${mins} min read`
}

export default function Blog({ initialPosts }) {
  const [posts, setPosts] = useState(initialPosts || [])
  const [loading, setLoading] = useState(!initialPosts)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')
  const [searchInput, setSearchInput] = useState('')
  const [activeTag, setActiveTag] = useState('')
  const [allTags, setAllTags] = useState([])
  const [fetchError, setFetchError] = useState(false)

  const fetchPosts = async () => {
    setLoading(true)
    setFetchError(false)
    try {
      const params = { search }
      if (category && category !== 'All') params.category = category
      if (activeTag) params.tag = activeTag
      const res = await api.get('/blog', { params })
      const posts = res.data.posts || []
      setPosts(posts)
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
    if (hasInitialData && !search && category === 'All' && !activeTag) return
    fetchPosts()
  }, [category, search, activeTag])

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
  }, [category, search, activeTag])

  const handleSearch = e => {
    e.preventDefault()
    setSearch(searchInput)
  }

  const formatDate = d => new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  // Featured = most recent post when no filters active
  const featured = !search && category === 'All' && !activeTag ? posts[0] : null
  const rest = featured ? posts.slice(1) : posts

  return (
    <div className="page-container community-page" style={{ padding: '0 0 80px', position: 'relative', zIndex: 1 }}>
      <PageMeta
        title="Blog"
        description="Networking deep-dives, security guides, infrastructure walkthroughs and lessons from the field."
        url="/blog"
      />

      <div className="community-shell">
        {/* Banner */}
        <div className="community-banner" style={{ marginBottom: 0, borderRadius: '0 0 18px 18px' }}>
          <div className="community-banner-eyebrow">// BLOG</div>
          <h1 className="community-banner-title">Field Notes &<br /><em>Tech Insights</em></h1>
          <p className="community-banner-text">
            Networking deep-dives, security guides, infrastructure walkthroughs and lessons from the field.
          </p>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '26px 0 20px', marginBottom: 8 }}>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            <form onSubmit={handleSearch} style={{ display: 'flex', flex: 1, minWidth: 240, maxWidth: 420 }}>
              <input value={searchInput} onChange={e => setSearchInput(e.target.value)}
                placeholder="Search posts..."
                style={{
                  flex: 1, background: 'var(--bg2)', border: '1px solid var(--border)',
                  borderRight: 'none', borderRadius: '10px 0 0 10px', color: 'var(--text)',
                  fontFamily: 'var(--font-display)', fontSize: 15, padding: '12px 16px', outline: 'none'
                }} />
              <button type="submit" style={{
                background: 'var(--green)', color: '#000', border: 'none', borderRadius: '0 10px 10px 0',
                padding: '12px 20px', fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: 1, cursor: 'pointer'
              }}>GO</button>
            </form>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {CATEGORIES.map(cat => (
                <button key={cat} onClick={() => setCategory(cat)} style={{
                  fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2,
                  padding: '8px 16px', border: '1px solid',
                  borderRadius: 999,
                  borderColor: category === cat ? 'var(--green)' : 'var(--border)',
                  background: category === cat ? 'rgba(0,255,136,0.1)' : 'transparent',
                  color: category === cat ? 'var(--green)' : 'var(--muted)',
                  cursor: 'pointer', transition: 'all 0.2s'
                }}>{cat}</button>
              ))}
            </div>
          </div>

          {allTags.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 2, color: 'var(--muted)', marginRight: 4 }}>TAGS:</span>
              {activeTag && (
                <button onClick={() => setActiveTag('')} style={{
                  fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 1,
                  padding: '4px 10px', borderRadius: 999, border: '1px solid rgba(255,60,60,0.4)',
                  background: 'rgba(255,60,60,0.08)', color: 'var(--red)',
                  cursor: 'pointer'
                }}>✕ CLEAR</button>
              )}
              {allTags.map(tag => (
                <button key={tag} onClick={() => setActiveTag(activeTag === tag ? '' : tag)} style={{
                  fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 1,
                  padding: '4px 10px', borderRadius: 999, border: '1px solid',
                  borderColor: activeTag === tag ? 'var(--green)' : 'var(--border)',
                  background: activeTag === tag ? 'rgba(0,255,136,0.1)' : 'transparent',
                  color: activeTag === tag ? 'var(--green)' : 'var(--muted)',
                  cursor: 'pointer'
                }}>#{tag}</button>
              ))}
            </div>
          )}
        </div>

        {/* Posts */}
        {loading ? (
          <div className="blog-posts-grid" style={{ display: 'grid', gap: 16 }}>
            {Array.from({ length: 6 }).map((_, i) => <BlogCardSkeleton key={i} />)}
          </div>
        ) : fetchError ? (
          <Card style={{ textAlign: 'center', padding: '80px 24px' }}>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--red)', letterSpacing: 2, marginBottom: 12 }}>SERVER UNAVAILABLE</p>
            <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 20 }}>The server may be waking up. Please wait 30 seconds and try again.</p>
            <NeonButton variant="ghost" onClick={() => fetchPosts()}>RETRY</NeonButton>
          </Card>
        ) : posts.length === 0 ? (
          <EmptyState icon="📭" title="No posts found" text={search ? 'No posts match your filters.' : 'Check back soon.'} />
        ) : (
          <>
            {/* Featured post */}
            {featured && (
              <Link to={`/blog/${featured.slug}`} style={{ textDecoration: 'none' }}>
                <Card hover style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)', overflow: 'hidden', marginBottom: 26 }}>
                  <div className="blog-cover-wrapper" style={{ height: '100%', minHeight: 280 }}>
                    <NextImage
                      src={mediaUrl(featured.cover_image || '')}
                      alt={featured.title}
                      fill
                      sizes="(max-width: 1024px) 100vw, 50vw"
                      style={{ objectFit: 'cover' }}
                      onError={e => { e.currentTarget.style.display = 'none' }}
                    />
                  </div>
                  <div style={{ padding: 'clamp(24px, 4vw, 44px)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
                      <Badge tone="green" glow>★ Featured</Badge>
                      <Badge tone="cyan">{featured.category}</Badge>
                    </div>
                    <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(22px, 3vw, 34px)', fontWeight: 700, lineHeight: 1.2, color: 'var(--text)', margin: '0 0 14px' }}>{featured.title}</h2>
                    <p style={{ color: 'var(--muted)', fontSize: 15, lineHeight: 1.7, margin: '0 0 20px' }}>{featured.excerpt || 'Read more...'}</p>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                      <span>{formatDate(featured.created_at)}</span>
                      <span>⏱ {readingTime(featured.excerpt + ' ' + (featured.content || ''))}</span>
                      {featured.views > 0 && <span>👁 {featured.views}</span>}
                    </div>
                  </div>
                </Card>
              </Link>
            )}

            {/* Grid */}
            <div className="blog-posts-grid" style={{ display: 'grid', gap: 16 }}>
              {rest.map(post => (
                <Link key={post.id} to={`/blog/${post.slug}`} style={{ textDecoration: 'none' }}>
                  <Card hover style={{ overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column' }}>
                    <BlogCover src={post.cover_image} title={post.title} />
                    <div style={{ padding: 26, flex: 1, display: 'flex', flexDirection: 'column' }}>
                      <div style={{ display: 'flex', gap: 12, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                        <Badge tone="cyan">{post.category}</Badge>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)' }}>{formatDate(post.created_at)}</span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)' }}>⏱ {readingTime(post.excerpt + ' ' + (post.content || ''))}</span>
                        {post.views > 0 && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)' }}>👁 {post.views}</span>}
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
                  </Card>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>

      <style>{`
        .blog-cover-wrapper {
          position: relative; width: 100%; height: 220px;
          background: var(--bg3);
          display: flex; align-items: center; justify-content: center;
          overflow: hidden;
        }
        .blog-cover-wrapper img {
          width: 100%; height: 100%; object-fit: cover; display: block;
        }
        .blog-posts-grid { grid-template-columns: repeat(3, 1fr); }

        @media (max-width: 1023px) {
          .blog-posts-grid { grid-template-columns: repeat(2, 1fr); }
          .blog-cover-wrapper { height: 200px; }
        }
        @media (max-width: 767px) {
          .blog-posts-grid { grid-template-columns: 1fr; }
          .blog-cover-wrapper { height: 190px; }
        }
        @media (max-width: 480px) {
          .blog-cover-wrapper { height: 170px; }
        }
      `}</style>
    </div>
  )
}
