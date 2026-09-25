'use client'
import { useState, useEffect, useRef } from 'react'
import { useParams, Link } from '@/lib/router-compat'
import NextImage from 'next/image'
import api, { mediaUrl } from '@/lib/api'
import { sanitizeHtml } from '@/lib/sanitizeHtml'
import PageMeta from '../components/PageMeta'
import { Slider } from '../core/ui.jsx'
import { getSupabase } from '@/lib/supabase'
import { useForum } from '../context/ForumContext'
import { Card, NeonButton, Badge, Avatar, RoleBadge, EmptyState } from '../components/community'
import { MediaAttachment } from '../components/MediaPreview'
import AuthorCard from '../components/AuthorCard'
import NewsletterCTA from '../components/NewsletterCTA'
import {
  VideoPlayer, extractVideoUrl, REACTIONS, readingTime, CoverHero, PostReactions, Comments, RelatedPosts, ContentMediaPreviews,
} from './blogPostParts'

// ── Smart Video Player ────────────────────────────────────────────────────────
export default function BlogPost({ initialPost }) {
  const { slug } = useParams()
  // ISR: when the server renders the page it passes the cached post body, so the
  // article is visible immediately. The client re-fetches to stay live (Realtime)
  // and to bump the view counter.
  const [post, setPost] = useState(initialPost || null)
  const [loading, setLoading] = useState(!initialPost)
  const [error, setError] = useState(null)
  const [scrollProgress, setScrollProgress] = useState(0)
  const [toc, setToc] = useState([])
  const [copied, setCopied] = useState(false)
  const contentRef = useRef(null)

  // #12 — Reading scroll progress bar
  useEffect(() => {
    const onScroll = () => {
      const el = document.documentElement
      const scrolled = el.scrollTop || document.body.scrollTop
      const total = el.scrollHeight - el.clientHeight
      setScrollProgress(total > 0 ? Math.min(100, (scrolled / total) * 100) : 0)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const fetchPost = async ({ quiet = false } = {}) => {
    try {
      const res = await api.get(`/blog/${slug}`)
      setPost(res.data)
      setError(null)
    } catch (err) {
      setError(err.response?.status === 404 ? 'Post not found.' : 'Failed to load post.')
    } finally {
      if (!quiet) setLoading(false)
    }
  }

  const [prevSlug, setPrevSlug] = useState(slug)
  if (prevSlug !== slug) {
    setPrevSlug(slug)
    if (initialPost && initialPost.slug === slug) {
      setLoading(false)
    } else {
      setLoading(true)
    }
  }

  useEffect(() => {
    // ISR-provided body already matches this slug — skip the initial fetch to
    // avoid a loader flash. Realtime (below) keeps edits in sync.
    if (initialPost && initialPost.slug === slug) return
    void (async () => { await fetchPost() })()
  }, [slug])

  useEffect(() => {
    if (!slug) return
    api.post(`/blog/${slug}/view`).catch(() => {})
  }, [slug])

  useEffect(() => {
    const sb = getSupabase()
    if (!sb || !slug) return
    const channel = sb
      .channel(`blog-post:${slug}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, payload => {
        const nextSlug = payload?.new?.slug || payload?.old?.slug
        if (nextSlug === slug || post?.id === payload?.new?.id || post?.id === payload?.old?.id) fetchPost({ quiet: true })
      })
      .subscribe()
    return () => { sb.removeChannel(channel) }
  }, [slug, post?.id])

  useEffect(() => {
    const root = contentRef.current
    if (!root) return
    const headings = Array.from(root.querySelectorAll('h2, h3'))
    const items = headings.map((heading, index) => {
      const text = heading.textContent?.trim() || `Section ${index + 1}`
      const id = heading.id || text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `section-${index + 1}`
      heading.id = id
      return { id, text, level: heading.tagName === 'H3' ? 3 : 2 }
    })
    setToc(items)
  }, [post?.content])

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {}
  }

  const formatDate = d => new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  if (loading) return <div className="page-container"><div className="loader" /></div>
  if (error) return (
    <div className="page-container" style={{ textAlign: 'center', padding: '160px 60px', position: 'relative', zIndex: 1 }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
      <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--red)', marginBottom: 24 }}>{error}</div>
      <NeonButton to="/blog" variant="ghost">← Back to Blog</NeonButton>
    </div>
  )

  const tags = typeof post.tags === 'string' ? JSON.parse(post.tags) : (post.tags || [])
  const _rawSanitized = sanitizeHtml(post.content || '<p style="color:var(--muted)">No content yet.</p>', {
    ADD_TAGS: ['iframe'],
    ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'src', 'title'],
  })
  // Only allow youtube/vimeo embeds — strip any other iframe src (e.g. https://evil.com, javascript:).
  // The src match is quote-tolerant: unquoted and missing src are treated as untrusted (removed).
  // Quote-aware + fixpoint (CodeQL js/incomplete-multi-character-sanitization):
  // `[^>]*` would end the tag early on a `>` inside a quoted attr and a single
  // pass can leave `<iframe` behind via overlapping constructs, so repeat to
  // stability. Closing tags carry no attrs and are harmless alone; drop them
  // only when no allowlisted opener remains so legitimate embeds keep theirs.
  const IFRAME_SRC_ALLOW = /^(https:\/\/(www\.youtube\.com|www\.youtube-nocookie\.com|player\.vimeo\.com)\/embed\/)/
  const isAllowedIframeOpen = (m) => {
    const srcMatch = m.match(/\ssrc\s*=\s*("[^"]*"|'[^']*'|[^\s>"']+)/i)
    const src = (srcMatch?.[1] || '').replace(/^["']|["']$/g, '')
    return IFRAME_SRC_ALLOW.test(src)
  }
  let sanitizedContent = _rawSanitized
  for (let i = 0; i < 10; i++) {
    const next = sanitizedContent.replace(/<iframe\b(?:(?:"[^"]*"|'[^']*'|[^>"'])*)>/gi, (m) =>
      (isAllowedIframeOpen(m) ? m : '')
    )
    if (next === sanitizedContent) break
    sanitizedContent = next
  }
  if (!/<iframe\b/i.test(sanitizedContent)) {
    sanitizedContent = sanitizedContent.replace(/<\/iframe\s*>/gi, '')
  }

  return (
    <div className="page-container" style={{ position: 'relative', zIndex: 1 }}>
      {/* #12 — Reading progress bar */}
      <div style={{
        position: 'fixed', top: 0, left: 0, zIndex: 9999,
        height: 2, width: `${scrollProgress}%`,
        background: 'linear-gradient(90deg, var(--green), var(--cyan))',
        transition: 'width 0.08s linear',
        pointerEvents: 'none',
      }} />
      <PageMeta
        title={post.title}
        description={post.excerpt || post.title}
        image={post.cover_image || undefined}
        url={`/blog/${post.slug}`}
        type="article"
        publishedTime={post.createdAt || post.created_at}
        tags={typeof post.tags === 'string' ? JSON.parse(post.tags) : (post.tags || [])}
      />
      <CoverHero src={post.cover_image} title={post.title} />

      <div className="blog-post-shell">
        {toc.length > 0 && (
          <aside className="blog-toc">
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 3, color: 'var(--muted)', marginBottom: 12 }}>ON THIS PAGE</div>
            {toc.map(item => (
              <a key={item.id} href={`#${item.id}`} className={`toc-link toc-l${item.level}`}>{item.text}</a>
            ))}
          </aside>
        )}

        <article className="blog-post-main">
        {/* Back link */}
        <Link to="/blog" className="blog-back-link" style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)',
          letterSpacing: 2, marginBottom: 40, textDecoration: 'none',
        }}
        >← BACK TO BLOG</Link>

        {/* Meta */}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', marginBottom: 24 }}>
          <Badge tone="cyan">{post.category}</Badge>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>
            {formatDate(post.created_at)}
          </span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>
            ⏱ {readingTime(post.content, post.excerpt)}
          </span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>
            👁 {post.views} views
          </span>
        </div>

        <div className="blog-actions">
          <button onClick={copyLink}>{copied ? 'COPIED' : 'COPY LINK'}</button>
          <a suppressHydrationWarning href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(typeof window !== 'undefined' ? window.location.href : '')}&text=${encodeURIComponent(post.title)}`} target="_blank" rel="noopener noreferrer">SHARE</a>
        </div>

        {/* Title */}
        <h1 style={{
          fontFamily: 'var(--font-display)', fontSize: 'clamp(32px, 5vw, 52px)',
          fontWeight: 700, letterSpacing: -1, lineHeight: 1.1, marginBottom: 24,
          color: 'var(--text)'
        }}>{post.title}</h1>

        {/* Excerpt */}
        {post.excerpt && (
          <p style={{
            fontSize: 18, color: 'var(--cyan)', lineHeight: 1.6,
            borderLeft: '3px solid var(--green)', paddingLeft: 20,
            marginBottom: 48, fontStyle: 'italic'
          }}>{post.excerpt}</p>
        )}

        {/* Video Player — shown if post has a video_url field or content contains a video */}
        {(() => {
          const videoSrc = post.video_url || extractVideoUrl(post.content || '')
          if (!videoSrc) return null
          return (
            <div style={{ marginBottom: 40 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', letterSpacing: 3, marginBottom: 12 }}>VIDEO</div>
              <VideoPlayer src={videoSrc} title={post.title} />
            </div>
          )
        })()}

        {/* Content */}
        <div ref={contentRef} style={{ color: 'var(--text)' }}
          dangerouslySetInnerHTML={{ __html: sanitizedContent }}
          className="post-content"
        />

        {/* Files & downloads extracted from content */}
        <ContentMediaPreviews html={post.content} />

        {/* Tags */}
        {tags.length > 0 && (
          <div style={{ marginTop: 60, paddingTop: 40, borderTop: '1px solid var(--border)' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', letterSpacing: 2, marginBottom: 16 }}>
              TAGS
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {tags.map(t => <span key={t} className="tag">{t}</span>)}
            </div>
          </div>
        )}

        {/* Author card */}
        <AuthorCard authorName={post.author_name} category={post.category} />

        {/* Reactions (server-persisted) */}
        <PostReactions slug={post.slug} postId={post._id || post.id} initialReactions={post.reactions} />

        {/* Comments */}
        <Comments slug={post.slug} postId={post._id || post.id} />

        {/* Related posts */}
        <RelatedPosts slug={post.slug} currentId={post.id} />

        {/* Newsletter CTA */}
        <NewsletterCTA />

        {/* Back to blog */}
        <div style={{ marginTop: 60 }}>
          <NeonButton to="/blog" variant="ghost">← Back to All Posts</NeonButton>
        </div>
        </article>
      </div>

      <style>{`
        .blog-hero-cover { width: 100%; aspect-ratio: 16/9; height: clamp(220px, 38vh, 420px); max-height: 420px; overflow: hidden; position: relative; background: var(--bg3); }
        .blog-post-shell {
          width: min(1180px, calc(100vw - 32px));
          margin: 0 auto;
          padding: ${post.cover_image ? '0 0 80px' : 'clamp(40px,8vw,80px) 0 80px'};
          display: grid;
          grid-template-columns: minmax(0, 1fr) 220px;
          gap: clamp(24px, 4vw, 56px);
          align-items: start;
        }
        .blog-post-main { max-width: 820px; min-width: 0; }
        .blog-toc {
          position: sticky; top: 96px; order: 2;
          border-left: 1px solid var(--border); padding-left: 16px;
          max-height: calc(100vh - 120px); overflow: auto;
        }
        .toc-link { display: block; color: var(--muted); text-decoration: none; font-family: var(--font-mono); font-size: 10px; line-height: 1.5; margin-bottom: 10px; }
        .toc-link:hover { color: var(--green); }
        .toc-l3 { padding-left: 12px; opacity: 0.82; }
        .blog-actions { display: flex; gap: 10px; flex-wrap: wrap; margin: -8px 0 28px; }
        .blog-actions button, .blog-actions a {
          font-family: var(--font-mono); font-size: 10px; letter-spacing: 2px;
          padding: 8px 12px; border: 1px solid var(--border); background: var(--bg2);
          color: var(--muted); text-decoration: none; cursor: pointer;
          border-radius: 8px;
        }
        .blog-actions button:hover, .blog-actions a:hover { color: var(--green); border-color: color-mix(in srgb, var(--green) 35%, transparent); }
        .post-content { line-height: 1.8; font-size: 17px; }
        .post-content h1, .post-content h2, .post-content h3 {
          font-family: var(--font-display); font-weight: 700; margin: 2em 0 0.75em;
          color: var(--text); letter-spacing: -0.5px;
        }
        .post-content h2 { font-size: 28px; color: var(--cyan); }
        .post-content h3 { font-size: 22px; }
        .post-content p { margin-bottom: 1.5em; color: var(--text); }
        .post-content a { color: var(--green); }
        .post-content .blog-media-doc a {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 10px 16px; border: 1px solid color-mix(in srgb, var(--cyan) 30%, transparent);
          border-radius: 10px; background: color-mix(in srgb, var(--cyan) 6%, transparent);
          color: var(--cyan); text-decoration: none; font-family: var(--font-mono);
          font-size: 12px;
        }
        .post-content .blog-media-doc a::before { content: "📎 "; }
        .post-content .blog-media-doc a:hover { border-color: var(--green); color: var(--green); }
        .post-content code {
          font-family: var(--font-mono); font-size: 13px;
          background: var(--bg3); border: 1px solid var(--border);
          padding: 2px 8px; border-radius: 4px; color: var(--cyan);
        }
        .post-content pre {
          background: var(--bg3); border: 1px solid var(--border);
          padding: 24px; overflow-x: auto; margin: 1.5em 0; border-radius: 12px;
        }
        .post-content pre code {
          background: none; border: none; padding: 0; font-size: 14px; line-height: 1.6;
        }
        .post-content blockquote {
          border-left: 3px solid var(--green); padding-left: 20px;
          margin: 1.5em 0; color: var(--muted); font-style: italic;
        }
        .post-content img { width: 100%; border-radius: 4px; margin: 1.5em 0; }
        .post-content video { width: 100%; border-radius: 4px; margin: 1.5em 0; display: none; }
        .post-content figure { margin: 1.5em 0; }
        .post-content figure img { margin: 0; }
        .post-content iframe { max-width: 100%; border-radius: 4px; }
        .post-content div[style*="padding-bottom:56.25%"] { width: 100% !important; }
        .post-content div[style*="padding-bottom: 56.25%"] { width: 100% !important; }
        @media (max-width: 640px) {
          .post-content { font-size: 15px; }
          .post-content h2 { font-size: 22px; }
          .post-content h3 { font-size: 18px; }
          .post-content pre { padding: 14px; font-size: 12px; }
        }
        .post-content ul, .post-content ol { padding-left: 24px; margin-bottom: 1.5em; }
        .post-content li { margin-bottom: 0.5em; color: var(--text); }
        .post-content hr { border: none; border-top: 1px solid var(--border); margin: 2em 0; }
        .post-content table { width: 100%; border-collapse: collapse; margin-bottom: 1.5em; }
        .post-content th { background: var(--bg3); padding: 12px; border: 1px solid var(--border); color: var(--cyan); font-family: var(--font-mono); font-size: 12px; }
        .post-content td { padding: 12px; border: 1px solid var(--border); }
        @media (max-width: 1024px) {
          .blog-post-shell { grid-template-columns: 1fr; width: min(860px, calc(100vw - 24px)); }
          .blog-toc { position: static; order: 0; border-left: 0; border: 1px solid var(--border); padding: 14px; max-height: none; }
          .blog-post-main { max-width: none; }
        }
        @media (max-width: 640px) {
          .blog-post-shell { width: calc(100vw - 24px); padding-bottom: 56px; }
          .blog-hero-cover { height: 210px; }
        }
      `}</style>
    </div>
  )
}
