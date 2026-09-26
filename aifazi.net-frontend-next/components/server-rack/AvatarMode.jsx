'use client'
import { useState, useEffect, useRef } from 'react'
import { useInlineEdit } from '../../context/EditContext'
import { SvgWrap } from './shared'

function AvatarMode({ visibleRef }) {
  const wrapRef   = useRef()
  const imgRef    = useRef()
  const ring1Ref  = useRef()
  const ring2Ref  = useRef()
  const ctxRef    = useRef()

  // Editable avatar image URL — admin can paste any URL
  const { value: avatarUrl, save: saveUrl, isAdmin } = useInlineEdit('hero.avatarUrl', '')
  const { value: savedFilter, save: saveFilter }     = useInlineEdit('hero.avatarFilter', 'normal')

  const [editMode,  setEditMode]  = useState(false)
  const [draftUrl,  setDraftUrl]  = useState('')
  const [imgErr,    setImgErr]    = useState(false)
  const [activeFilter, setActiveFilter] = useState(savedFilter || 'normal')

  // Sync saved filter
  const [prevSavedFilter, setPrevSavedFilter] = useState(savedFilter)
  if (prevSavedFilter !== savedFilter) {
    setPrevSavedFilter(savedFilter)
    if (savedFilter) setActiveFilter(savedFilter)
  }

  const FILTERS = [
    { id: 'normal',    label: 'NORMAL',    css: 'none' },
    { id: 'anime',     label: 'ANIME',     css: 'contrast(1.6) saturate(2.2) brightness(1.05) hue-rotate(5deg)' },
    { id: 'cyberpunk', label: 'CYBERPUNK', css: 'contrast(1.4) saturate(3) hue-rotate(280deg) brightness(1.1)' },
    { id: 'vintage',   label: 'VINTAGE',   css: 'sepia(0.75) contrast(1.1) brightness(0.95) saturate(0.8)' },
    { id: 'grayscale', label: 'B&W',       css: 'grayscale(1) contrast(1.2) brightness(1.05)' },
    { id: 'sketch',    label: 'SKETCH',    css: 'grayscale(1) contrast(2.5) brightness(1.3) saturate(0)' },
    { id: 'neon',      label: 'NEON',      css: 'saturate(4) contrast(1.3) brightness(1.2) hue-rotate(320deg)' },
    { id: 'thermal',   label: 'THERMAL',   css: 'sepia(1) hue-rotate(180deg) saturate(3) contrast(1.4)' },
    { id: 'retro',     label: 'RETRO',     css: 'sepia(0.5) saturate(1.5) contrast(1.2) brightness(0.9) hue-rotate(340deg)' },
    { id: 'hologram',  label: 'HOLOGRAM',  css: 'hue-rotate(160deg) saturate(2.5) contrast(1.3) brightness(1.15) opacity(0.9)' },
  ]

  const currentFilterCss = FILTERS.find(f => f.id === activeFilter)?.css || 'none'

  // ── GSAP: float + ring spin ──────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return
    import('gsap').then(m => {
      const gsap = m.gsap
      if (!wrapRef.current) return
      const ctx = gsap.context(() => {
        // Gentle float — bob up 18px then back
        gsap.to(imgRef.current, {
          y: -18,
          duration: 2.8,
          ease: 'sine.inOut',
          repeat: -1,
          yoyo: true,
        })
        // Outer ring slow spin
        if (ring1Ref.current) {
          gsap.to(ring1Ref.current, {
            rotation: 360,
            duration: 12,
            ease: 'none',
            repeat: -1,
            transformOrigin: '50% 50%',
          })
        }
        // Inner ring reverse spin + pulse
        if (ring2Ref.current) {
          gsap.to(ring2Ref.current, {
            rotation: -360,
            duration: 7,
            ease: 'none',
            repeat: -1,
            transformOrigin: '50% 50%',
          })
          gsap.to(ring2Ref.current, {
            opacity: 0.3,
            duration: 1.4,
            ease: 'sine.inOut',
            repeat: -1,
            yoyo: true,
          })
        }
        // Orb 1 drift
        gsap.to('#av-orb1', {
          x: 30, y: -20,
          duration: 5,
          ease: 'sine.inOut',
          repeat: -1,
          yoyo: true,
        })
        // Orb 2 drift
        gsap.to('#av-orb2', {
          x: -25, y: 25,
          duration: 6.5,
          ease: 'sine.inOut',
          repeat: -1,
          yoyo: true,
        })
        // Orb 3 drift
        gsap.to('#av-orb3', {
          x: 20, y: 15,
          duration: 4,
          ease: 'sine.inOut',
          repeat: -1,
          yoyo: true,
        })
        // Particle dots
        wrapRef.current.querySelectorAll('.av-particle').forEach((p, i) => {
          gsap.to(p, {
            y: -12 - i * 4,
            opacity: 0,
            duration: 1.8 + i * 0.3,
            ease: 'power1.out',
            repeat: -1,
            delay: i * 0.4,
            yoyo: false,
          })
        })
      }, wrapRef)
      ctxRef.current = ctx
    }).catch(() => {})
    return () => { try { ctxRef.current?.revert() } catch {} }
  }, [])

  // ── Mouse parallax tilt ──────────────────────────────────────────────────
  useEffect(() => {
    const wrap = wrapRef.current
    const img  = imgRef.current
    if (!wrap || !img) return
    const onMove = e => {
      const rect = wrap.getBoundingClientRect()
      const cx = rect.left + rect.width  / 2
      const cy = rect.top  + rect.height / 2
      const dx = (e.clientX - cx) / (rect.width  / 2)
      const dy = (e.clientY - cy) / (rect.height / 2)
      img.style.transform = `translateY(${img._floatY || 0}px) perspective(600px) rotateY(${dx * 8}deg) rotateX(${-dy * 5}deg)`
    }
    const onLeave = () => {
      img.style.transition = 'transform 0.6s ease'
      img.style.transform  = 'perspective(600px) rotateY(0) rotateX(0)'
      setTimeout(() => { img.style.transition = '' }, 600)
    }
    wrap.addEventListener('mousemove', onMove)
    wrap.addEventListener('mouseleave', onLeave)
    return () => { wrap.removeEventListener('mousemove', onMove); wrap.removeEventListener('mouseleave', onLeave) }
  }, [])

  const handleSave = () => {
    if (draftUrl.trim()) { saveUrl(draftUrl.trim()); setImgErr(false) }
    setEditMode(false)
  }

  // Particle positions
  const particles = [
    { x: '28%', y: '75%' }, { x: '68%', y: '80%' }, { x: '18%', y: '55%' },
    { x: '75%', y: '60%' }, { x: '45%', y: '82%' }, { x: '55%', y: '30%' },
  ]

  return (
    <div ref={wrapRef} style={{
      width: '100%', height: '100%', minHeight: 460,
      position: 'relative', overflow: 'hidden',
      background: 'var(--bg2)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'none',
    }}>
      {/* Top accent bar */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3,
        background: 'linear-gradient(90deg, var(--cyan), var(--green))', borderRadius: '8px 8px 0 0' }}/>

      {/* Title */}
      <div style={{ position: 'absolute', top: 16, left: 20,
        fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 3, color: 'var(--cyan)', opacity: 0.6 }}>
        AVATAR · HOLOGRAPHIC PRESENCE
      </div>

      {/* Swirling background orbs */}
      <div id="av-orb1" style={{
        position: 'absolute', width: 320, height: 320, borderRadius: '50%',
        background: 'radial-gradient(circle, color-mix(in srgb, var(--cyan) 12%, transparent) 0%, transparent 70%)',
        top: '10%', left: '5%', pointerEvents: 'none',
      }}/>
      <div id="av-orb2" style={{
        position: 'absolute', width: 280, height: 280, borderRadius: '50%',
        background: 'radial-gradient(circle, color-mix(in srgb, var(--green) 10%, transparent) 0%, transparent 70%)',
        bottom: '5%', right: '5%', pointerEvents: 'none',
      }}/>
      <div id="av-orb3" style={{
        position: 'absolute', width: 200, height: 200, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(255,71,87,0.07) 0%, transparent 70%)',
        top: '40%', right: '25%', pointerEvents: 'none',
      }}/>

      {/* Scanline overlay */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 10,
        background: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.04) 3px, rgba(0,0,0,0.04) 4px)',
      }}/>

      {/* Floating particles */}
      {particles.map((p, i) => (
        <div key={i} className="av-particle" style={{
          position: 'absolute', left: p.x, top: p.y,
          width: 3 + (i % 3), height: 3 + (i % 3), borderRadius: '50%',
          background: i % 2 === 0 ? 'var(--cyan)' : 'var(--green)',
          opacity: 0.5, boxShadow: `0 0 6px ${i % 2 === 0 ? 'var(--cyan)' : 'var(--green)'}`,
          pointerEvents: 'none', zIndex: 2,
        }}/>
      ))}

      {/* Avatar container */}
      <div style={{ position: 'relative', zIndex: 5, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>

        {/* Spinning outer ring */}
        <div style={{ position: 'relative', width: 240, height: 240 }}>

          {/* Outer dashed ring */}
          <div ref={ring1Ref} style={{
            position: 'absolute', inset: -14,
            borderRadius: '50%',
            border: '1.5px dashed color-mix(in srgb, var(--cyan) 35%, transparent)',
          }}/>

          {/* Inner glow ring with gap markers */}
          <div ref={ring2Ref} style={{
            position: 'absolute', inset: -6,
            borderRadius: '50%',
            border: '2px solid transparent',
            background: 'linear-gradient(var(--bg2), var(--bg2)) padding-box, linear-gradient(135deg, var(--cyan), var(--green), var(--cyan)) border-box',
            opacity: 0.7,
          }}/>

          {/* Avatar image */}
          <div ref={imgRef} style={{
            width: 240, height: 240,
            borderRadius: '50%',
            overflow: 'hidden',
            position: 'relative',
            boxShadow: '0 0 40px color-mix(in srgb, var(--cyan) 20%, transparent), 0 0 80px color-mix(in srgb, var(--green) 10%, transparent), 0 20px 60px rgba(0,0,0,0.5)',
            willChange: 'transform',
          }}>
            {!imgErr && avatarUrl && avatarUrl.trim() !== '' ? (
              <img
                src={avatarUrl.trim()}
                alt="Avatar"
                onError={() => setImgErr(true)}
                style={{
                  width: '100%', height: '100%', objectFit: 'cover', display: 'block',
                  filter: currentFilterCss,
                  transition: 'filter 0.4s ease',
                }}
              />
            ) : (
              /* Placeholder — pulsing neon silhouette */
              <div style={{
                width: '100%', height: '100%',
                background: 'linear-gradient(135deg, var(--bg3), var(--bg2))',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}>
                <div style={{ fontSize: 64, opacity: 0.3 }}>◐</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', letterSpacing: 2, textAlign: 'center', whiteSpace: 'pre-line' }}>
                  {imgErr
                    ? 'IMAGE FAILED TO LOAD\nCHECK URL OR CORS'
                    : isAdmin
                      ? 'CLICK "CHANGE IMAGE URL"\nPASTE DIRECT IMAGE LINK'
                      : 'NO AVATAR SET'}
                </div>
              </div>
            )}
          </div>

          {/* Corner accent dots on the ring */}
          {[0, 90, 180, 270].map(deg => (
            <div key={deg} style={{
              position: 'absolute',
              width: 8, height: 8, borderRadius: '50%',
              background: deg % 180 === 0 ? 'var(--cyan)' : 'var(--green)',
              boxShadow: `0 0 8px ${deg % 180 === 0 ? 'var(--cyan)' : 'var(--green)'}`,
              top:  '50%', left: '50%',
              transform: `rotate(${deg}deg) translateX(126px) translate(-50%, -50%)`,
            }}/>
          ))}
        </div>

        {/* Name + status row */}
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700,
            color: 'var(--text)', letterSpacing: 2 }}>
            TANVIR AIFAZI
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)',
              boxShadow: '0 0 6px var(--green)', display: 'inline-block', animation: 'glow-pulse 2s infinite' }}/>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--green)', letterSpacing: 2 }}>
               REMOTELY AVAILABLE
            </span>
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', letterSpacing: 1 }}>
            IT SPECIALIST · NETWORK SPECIALIST · AI ENTHUSIAST
          </div>
        </div>

        {/* Filter picker — always visible when image is set */}
        {avatarUrl && avatarUrl.trim() !== '' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, width: '100%' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', letterSpacing: 2 }}>
              IMAGE FILTER
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', maxWidth: 400 }}>
              {FILTERS.map(f => (
                <button key={f.id} onClick={() => {
                  setActiveFilter(f.id)
                  if (isAdmin) saveFilter(f.id)
                }} style={{
                  fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1,
                  padding: '4px 10px', borderRadius: 2, cursor: 'pointer',
                  border: `1px solid ${activeFilter === f.id ? 'var(--cyan)' : 'var(--border)'}`,
                  background: activeFilter === f.id ? 'color-mix(in srgb, var(--cyan) 12%, transparent)' : 'transparent',
                  color: activeFilter === f.id ? 'var(--cyan)' : 'var(--muted)',
                  transition: 'all 0.2s',
                }}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Admin: edit image URL button */}
        {isAdmin && !editMode && (
          <button
            onClick={() => { setDraftUrl(avatarUrl || ''); setEditMode(true) }}
            style={{
              fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2,
              padding: '6px 14px', background: 'color-mix(in srgb, var(--cyan) 8%, transparent)',
              color: 'var(--cyan)', border: '1px solid color-mix(in srgb, var(--cyan) 30%, transparent)',
              borderRadius: 2, cursor: 'pointer',
            }}>
            ✎ CHANGE IMAGE URL
          </button>
        )}

        {/* URL input (edit mode) */}
        {isAdmin && editMode && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', width: '100%', maxWidth: 320 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', letterSpacing: 1 }}>
              PASTE IMAGE URL (jpg, png, webp, gif)
            </div>
            <input
              type="text"
              value={draftUrl}
              onChange={e => setDraftUrl(e.target.value)}
              placeholder="https://example.com/avatar.jpg"
              autoFocus
              style={{
                width: '100%', fontFamily: 'var(--font-mono)', fontSize: 11,
                padding: '8px 12px', background: 'var(--comp-input-bg, var(--bg3))',
                border: '1px solid var(--comp-input-focus-border, var(--cyan))', color: 'var(--text)',
                borderRadius: 'var(--comp-input-radius, 2px)', outline: 'none',
              }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleSave} style={{
                fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2,
                padding: '6px 14px', background: 'var(--comp-btn-bg, var(--green))',
                color: 'var(--comp-btn-text, #000)', border: 'var(--comp-btn-border, none)', borderRadius: 'var(--comp-btn-radius, 2px)', boxShadow: 'var(--comp-btn-shadow, none)', cursor: 'pointer', fontWeight: 700,
              }}>SAVE</button>
              <button onClick={() => setEditMode(false)} style={{
                fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2,
                padding: '6px 14px', background: 'transparent',
                color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 2, cursor: 'pointer',
              }}>CANCEL</button>
            </div>
          </div>
        )}
      </div>

      {/* Footer bar */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 28,
        borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center',
        padding: '0 20px', gap: 12, background: 'rgba(0,0,0,0.2)' }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)',
          boxShadow: '0 0 6px var(--green)', flexShrink: 0 }}/>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--green)', letterSpacing: 1 }}>
          HOLOGRAPHIC PRESENCE ACTIVE · IDENTITY VERIFIED · SECURE CONNECTION
        </span>
      </div>
    </div>
  )
}


// ─────────────────────────────────────────────────────────────────────────────
//  MODE 8: GLOBE — COBE WebGL network globe
//  Great-circle arcs · glowing city nodes · drag-to-rotate · scroll-to-zoom
//  Theme-synced · visitor HUD via CSS Anchor Positioning when available
// ─────────────────────────────────────────────────────────────────────────────

// Read a CSS variable from the root element (falls back gracefully)

export default AvatarMode
