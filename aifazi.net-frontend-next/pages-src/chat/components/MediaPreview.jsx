'use client'
import { useState, useEffect, useRef } from 'react'
import { T, IMG_EXTS, VID_EXTS, AUD_EXTS, ENCRYPTED_PREFIX } from '../chat-constants'
import { decryptText, isEncrypted, getRoomKey } from '../chat-encryption'
import api from '@/lib/api'

function isImageUrl(url) {
  const clean = url.replace(/[.,;:!?)\]]+$/, '')
  if (!/^https?:\/\//i.test(clean)) return false
  return IMG_EXTS.test(clean) ||
    /(imgur\.com|i\.imgur\.com|ibb\.co|i\.ibb\.co|postimg\.cc|cloudinary\.com|supabase\.co|aifazi\.net|unsplash\.com|picsum\.photos|i\.redd\.it|im\.gy|cdn\.discordapp\.com|media\.discordapp\.net|user-images\.githubusercontent\.com|raw\.githubusercontent\.com|i\.postimg\.cc|upload\.wikimedia\.org|i\.pinimg\.com|i\.ytimg\.com)/i.test(clean) ||
    /\.(png|jpg|jpeg|gif|webp|svg|bmp|avif)(\?.*)?$/i.test(clean)
}

function getYouTubeId(url) {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
  return m ? m[1] : null
}

function getVimeoId(url) {
  const m = url.match(/vimeo\.com\/(\d+)/)
  return m ? m[1] : null
}

function cleanUrl(url) {
  return url.replace(/[.,;:!?)\]]+$/, '')
}

function getDomain(url) {
  try { return new URL(url).hostname } catch { return url }
}

const _previewCache = new Map()

function useLinkPreview(urlRef) {
  const [preview, setPreview] = useState(() => _previewCache.get(urlRef))
  const [lastUrl, setLastUrl] = useState(urlRef)
  if (lastUrl !== urlRef) {
    setLastUrl(urlRef)
    setPreview(_previewCache.get(urlRef))
  }
  useEffect(() => {
    if (_previewCache.has(urlRef)) return
    let cancelled = false
    const run = async () => {
      try {
        const r = await api.get('/chat/link-preview', { params: { url: urlRef }, timeout: 8000 })
        if (cancelled) return
        const data = r.data || {}
        _previewCache.set(urlRef, data)
        setPreview(data)
      } catch {
        if (cancelled) return
        const data = { url: urlRef }
        _previewCache.set(urlRef, data)
        setPreview(data)
      }
    }
    run()
    return () => { cancelled = true }
  }, [urlRef])
  return preview
}

function RichLinkCard({ url, right }) {
  const preview = useLinkPreview(url)
  const hasCard = preview && (preview.title || preview.description || preview.image || preview.site)
  const domain = getDomain(url)
  if (!hasCard) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer"
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8,
          border: `1px solid ${T.border}`, background: 'rgba(255,255,255,0.03)', textDecoration: 'none', color: T.text, maxWidth: 420 }}>
        <span style={{ fontSize: 14, flexShrink: 0 }}>🔗</span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, color: T.accentB, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {domain}
          </div>
          <div style={{ fontSize: 10, color: T.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {url.length > 60 ? url.slice(0, 60) + '…' : url}
          </div>
        </div>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: T.muted, flexShrink: 0 }}>↗</span>
      </a>
    )
  }
  return (
    <div style={{ maxWidth: 420, minWidth: 220, borderRadius: 10, overflow: 'hidden', border: `1px solid ${T.border}`, background: 'rgba(255,255,255,0.03)' }}>
      <a href={preview.url || url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
        {preview.image && (
          // eslint-disable-next-line @next/next/no-img-element -- external preview image, not from CDN
          <img src={preview.image} alt="" loading="lazy"
            style={{ width: '100%', height: 120, objectFit: 'cover', display: 'block', borderBottom: `1px solid ${T.border}` }}
            onError={e => { e.target.style.display = 'none' }} />
        )}
        <div style={{ padding: '8px 12px' }}>
          {preview.site ? (
            <div style={{ fontFamily: T.mono, fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', color: T.muted }}>
              {preview.site}
            </div>
          ) : null}
          {preview.title ? (
            <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {preview.title}
            </div>
          ) : null}
          {preview.description ? (
            <div style={{ fontSize: 11, color: T.muted, marginTop: 3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {preview.description}
            </div>
          ) : null}
        </div>
      </a>
    </div>
  )
}

export function MediaPreviews({ text, onMediaClick, right }) {
  const [decrypted, setDecrypted] = useState(isEncrypted(text) ? text : null)
  const resolvedText = decrypted === null ? text : decrypted

  const [prevText, setPrevText] = useState(text)
  if (prevText !== text) {
    setPrevText(text)
    if (!text || !isEncrypted(text)) setDecrypted(null)
  }

  useEffect(() => {
    if (!text || !isEncrypted(text)) return
    const key = getRoomKey()
    decryptText(text.slice(ENCRYPTED_PREFIX.length), key).then(setDecrypted).catch(() => setDecrypted(text))
  }, [text])

  if (!resolvedText) return null
  const urlRe = /(https?:\/\/[^\s<>"']+)/gi
  const urls = resolvedText.match(urlRe)
  if (!urls) return null
  const uniqueUrls = [...new Set(urls)]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6, alignItems: right ? 'flex-end' : 'flex-start' }}>
      {uniqueUrls.map((url, i) => {
        const clean = cleanUrl(url)
        if (isImageUrl(clean)) {
          return <div key={i} style={{ maxWidth: 420 }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- user-provided chat image, external */ }
            <img src={clean} alt="" loading="lazy" style={{ maxWidth: '100%', maxHeight: 300, borderRadius: 8, objectFit: 'cover', cursor: 'pointer', border: `1px solid ${T.border}` }}
              onError={e => { e.target.style.display = 'none' }} onClick={() => onMediaClick?.({ url: clean, type: 'image' })} />
          </div>
        }
        const ytId = getYouTubeId(clean)
        if (ytId) {
          return <div key={i} style={{ maxWidth: 480, borderRadius: 8, overflow: 'hidden', border: `1px solid ${T.border}` }}>
            <iframe src={`https://www.youtube.com/embed/${ytId}`} title="YouTube"
              style={{ width: '100%', aspectRatio: '16/9', border: 'none' }}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
          </div>
        }
        const vmId = getVimeoId(clean)
        if (vmId) {
          return <div key={i} style={{ maxWidth: 480, borderRadius: 8, overflow: 'hidden', border: `1px solid ${T.border}` }}>
            <iframe src={`https://player.vimeo.com/video/${vmId}`} title="Vimeo"
              style={{ width: '100%', aspectRatio: '16/9', border: 'none' }}
              allow="autoplay; fullscreen; picture-in-picture" allowFullScreen />
          </div>
        }
        if (VID_EXTS.test(clean)) {
          return <video key={i} src={clean} controls preload="metadata" playsInline
            style={{ maxWidth: '100%', maxHeight: 300, borderRadius: 8, border: `1px solid ${T.border}` }} />
        }
        if (AUD_EXTS.test(clean)) {
          return <div key={i} style={{ maxWidth: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${T.border}`, background: 'rgba(255,255,255,0.03)' }}>
            <div style={{ fontSize: 11, color: T.muted, marginBottom: 6, fontFamily: T.mono, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              🎵 {clean.split('/').pop()}
            </div>
            <audio src={clean} controls preload="metadata" style={{ width: '100%', height: 36 }} />
          </div>
        }
        return <div key={i} style={{ maxWidth: 420 }}>
          <RichLinkCard url={clean} right={right} />
        </div>
      })}
    </div>
  )
}
