'use client'
import { useState, useEffect } from 'react'
import { T, IMG_EXTS, VID_EXTS, AUD_EXTS, ENCRYPTED_PREFIX } from '../chat-constants'
import { decryptText, isEncrypted, getRoomKey } from '../chat-encryption'

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
        return <div key={i}>
          <a href={clean} target="_blank" rel="noopener noreferrer"
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8,
              border: `1px solid ${T.border}`, background: 'rgba(255,255,255,0.03)', textDecoration: 'none', color: T.text, maxWidth: 420 }}>
            <span style={{ fontSize: 14, flexShrink: 0 }}>🔗</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 11, color: T.accentB, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {getDomain(clean)}
              </div>
              <div style={{ fontSize: 10, color: T.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {clean.length > 60 ? clean.slice(0, 60) + '…' : clean}
              </div>
            </div>
            <span style={{ marginLeft: 'auto', fontSize: 10, color: T.muted, flexShrink: 0 }}>↗</span>
          </a>
        </div>
      })}
    </div>
  )
}
