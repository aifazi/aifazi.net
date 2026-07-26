'use client'
/**
 * ContextMenu.jsx
 * Site-wide right-click menu. Uses core/menu for all rendering.
 * Only this file defines WHAT items appear — core/menu handles HOW they look.
 */
import { useEffect, useCallback } from 'react'
import { useNavigate } from '@/lib/router-compat'
import { useMenu } from '../core/ui.jsx'
import { useForum } from '../context/ForumContext'

// ── Utilities ─────────────────────────────────────────────────────────────────
const copy = text => navigator.clipboard?.writeText(text).catch(() => {})
const getSelection = () => window.getSelection()?.toString().trim() || ''
const getLink  = t => t?.closest?.('a')?.href || null
const getImage = t => (t?.tagName === 'IMG' ? t : t?.closest?.('img'))?.src || null
const findForumPost = t => t?.closest?.('[data-post-type]')
const dispatchForumAction = (action, detail) =>
  document.dispatchEvent(new CustomEvent('forum-context-action', { detail: { action, ...detail } }))

// ── Build item list from click context ────────────────────────────────────────
function buildItems({ selectedText, linkUrl, imageUrl, navigate, forum, user }) {
  const items = []

  if (selectedText) {
    items.push(
      { icon: '⎘', color: 'var(--cyan)', label: 'Copy Selection',
        sublabel: selectedText.slice(0, 28) + (selectedText.length > 28 ? '…' : ''),
        action: () => copy(selectedText) },
      { icon: '⌕', color: 'var(--cyan)', label: 'Search Google',
        sublabel: selectedText.slice(0, 24),
        action: () => window.open(`https://www.google.com/search?q=${encodeURIComponent(selectedText)}`, '_blank') },
      { type: 'separator' },
    )
  }

  if (imageUrl) {
    items.push(
      { icon: '🖼', color: '#a78bfa', label: 'Open Image',    action: () => window.open(imageUrl, '_blank') },
      { icon: '⎘', color: '#a78bfa', label: 'Copy Image URL', action: () => copy(imageUrl) },
      { type: 'separator' },
    )
  }

  if (linkUrl) {
    items.push(
      { icon: '⊞', color: 'var(--cyan)', label: 'Open in New Tab', action: () => window.open(linkUrl, '_blank') },
      { icon: '⎘', color: 'var(--cyan)', label: 'Copy Link',       action: () => copy(linkUrl) },
      { type: 'separator' },
    )
  }

  // ── Forum-specific actions ──
  if (forum) {
    const userId = user?._id?.toString() || user?.id?.toString()
    const isAuthor = userId === forum.authorId
    const isStaff  = user?.role === 'admin' || user?.role === 'moderator'

    if (forum.postType === 'thread') {
      if (user) {
        items.push(
          { icon: '💬', color: 'var(--green)', label: 'Reply to Thread',
            action: () => dispatchForumAction('reply', { threadId: forum.threadId }) },
        )
      }
      if (isAuthor || isStaff) {
        items.push(
          { icon: '✏️', color: 'var(--cyan)', label: 'Edit Thread',
            action: () => dispatchForumAction('edit', { threadId: forum.threadId }) },
          { icon: '🗑', color: 'var(--red)', label: 'Delete Thread',
            action: () => dispatchForumAction('delete', { threadId: forum.threadId }) },
        )
      }
    }

    if (forum.postType === 'reply') {
      if (user) {
        items.push(
          { icon: '💬', color: 'var(--green)', label: 'Quote Reply',
            action: () => dispatchForumAction('reply', { threadId: forum.threadId, replyId: forum.replyId }) },
        )
      }
      if (isAuthor || isStaff) {
        items.push(
          { icon: '✏️', color: 'var(--cyan)', label: 'Edit Reply',
            action: () => dispatchForumAction('edit', { threadId: forum.threadId, replyId: forum.replyId }) },
          { icon: '🗑', color: 'var(--red)', label: 'Delete Reply',
            action: () => dispatchForumAction('delete', { threadId: forum.threadId, replyId: forum.replyId }) },
        )
      }
    }

    if (user) {
      items.push(
        { icon: '🚩', color: 'var(--orange)', label: 'Report Post',
          action: () => dispatchForumAction('report', { threadId: forum.threadId, replyId: forum.replyId }) },
      )
    }

    items.push({ type: 'separator' })
  }

  items.push(
    { icon: '🔗', color: 'var(--green)', label: 'Copy Page URL',
      sublabel: window.location.pathname,
      action: () => copy(window.location.href) },
    { icon: '↑',  color: 'var(--green)', label: 'Scroll to Top',    action: () => window.scrollTo({ top: 0, behavior: 'smooth' }) },
    { icon: '↓',  color: 'var(--green)', label: 'Scroll to Bottom', action: () => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }) },
    { type: 'separator' },
    { icon: '⌂',  color: '#ffd700', label: 'Home',    action: () => navigate('/') },
    { icon: '✎',  color: '#ffd700', label: 'Blog',    action: () => navigate('/blog') },
    { icon: '💬', color: '#ffd700', label: 'Forum',   action: () => navigate('/forum') },
    { icon: '✉',  color: '#ffd700', label: 'Contact', action: () => navigate('/contact') },
    { type: 'separator' },
    { icon: '‹›', color: 'var(--muted)', label: 'View Source', action: () => window.open(`view-source:${window.location.href}`, '_blank') },
    { icon: '⎙',  color: 'var(--muted)', label: 'Print Page',  action: () => window.print() },
    { icon: '⟳',  color: 'var(--orange)', label: 'Reload Page', action: () => window.location.reload() },
  )

  return items
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function ContextMenu() {
  const navigate = useNavigate()
  const { openContextMenu } = useMenu()
  const { user } = useForum()

  const onContext = useCallback((e) => {
    if (e.defaultPrevented) return
    const tag = e.target?.tagName
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || e.target?.isContentEditable) return
    e.preventDefault()

    const postEl = findForumPost(e.target)
    let forum = null
    if (postEl) {
      forum = {
        postType:  postEl.dataset.postType,
        threadId:  postEl.dataset.threadId,
        replyId:   postEl.dataset.replyId,
        authorId:  postEl.dataset.authorId,
      }
    }

    const items = buildItems({
      selectedText: getSelection(),
      linkUrl:      getLink(e.target),
      imageUrl:     getImage(e.target),
      navigate,
      forum,
      user,
    })

    openContextMenu(e, items)
  }, [navigate, openContextMenu, user])

  useEffect(() => {
    document.addEventListener('contextmenu', onContext)
    return () => document.removeEventListener('contextmenu', onContext)
  }, [onContext])

  return null  // MenuProvider in UIProvider renders the actual panel
}
