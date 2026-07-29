'use client'
/**
 * components/PageMeta.jsx — No-op shim
 * In Next.js, metadata is handled via generateMetadata() in page.tsx files.
 * This component exists only so existing JSX doesn't break.
 * For dynamic titles, pass to document.title directly in useEffect.
 */
import { useEffect } from 'react'

export default function PageMeta({ title, description, image, url }) {
  useEffect(() => {
    if (title) document.title = `${title} | aifazi.net`
  }, [title])
  return null
}
