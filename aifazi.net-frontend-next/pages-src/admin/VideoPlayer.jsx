'use client'
import React, { useState, useEffect, useRef } from 'react'
import { Select, Slider } from '../../core/ui.jsx'

function VideoPlayer({ url }) {
  const videoRef = useRef(null)
  const containerRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(false)
  const [volume, setVolume] = useState(1)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCT] = useState(0)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const [loop, setLoop] = useState(false)
  const [autoplay, setAutoplay] = useState(false)
  const [size, setSize] = useState('medium') // small | medium | large | cinema
  const [playbackRate, setPlaybackRate] = useState(1)
  const hideTimer = useRef(null)

  const isYoutube = /youtu\.?be/.test(url)
  const isVimeo = /vimeo\.com/.test(url)
  const isEmbed = isYoutube || isVimeo

  const SIZE_MAP = { small: 240, medium: 360, large: 480, cinema: '100%' }
  const heightStyle = size === 'cinema' ? undefined : { maxHeight: SIZE_MAP[size] }

  // Rebuild embed URL when autoplay/mute changes
  const getEmbedUrl = () => {
    if (isYoutube) {
      const id = url.match(/(?:v=|youtu\.be\/)([^&?/]+)/)?.[1]
      const params = new URLSearchParams({
        enablejsapi: '1', rel: '0', modestbranding: '1',
        autoplay: autoplay ? '1' : '0',
        mute: (autoplay || muted) ? '1' : '0',
      })
      return `https://www.youtube.com/embed/${id}?${params}`
    }
    if (isVimeo) {
      const id = url.match(/vimeo\.com\/(\d+)/)?.[1]
      const params = new URLSearchParams({
        title: '0', byline: '0', portrait: '0',
        autoplay: autoplay ? '1' : '0',
        muted: (autoplay || muted) ? '1' : '0',
        color: '00ff88',
      })
      return `https://player.vimeo.com/video/${id}?${params}`
    }
    return url
  }

  const fmt = s => {
    if (!s || isNaN(s)) return '0:00'
    const m = Math.floor(s / 60), sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  const showCtrl = () => {
    setShowControls(true)
    clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => { if (playing) setShowControls(false) }, 2500)
  }
  useEffect(() => () => clearTimeout(hideTimer.current), [])

  const togglePlay = () => {
    const v = videoRef.current; if (!v) return
    if (v.paused) { v.play(); setPlaying(true) } else { v.pause(); setPlaying(false) }
    showCtrl()
  }
  const toggleMute = () => {
    const v = videoRef.current; if (!v) return
    v.muted = !v.muted; setMuted(v.muted)
  }
  const onVolumeChange = val => {
    const v = videoRef.current; if (!v) return
    v.volume = val; setVolume(val); v.muted = val === 0; setMuted(val === 0)
  }
  const onSeek = val => {
    const v = videoRef.current; if (!v) return
    v.currentTime = val * duration; setProgress(val)
  }
  const toggleFullscreen = () => {
    const el = containerRef.current; if (!el) return
    if (!document.fullscreenElement) el.requestFullscreen?.()
    else document.exitFullscreen?.()
  }
  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])
  const skip = secs => {
    const v = videoRef.current; if (!v) return
    v.currentTime = Math.max(0, Math.min(v.duration, v.currentTime + secs))
  }

  const btnStyle = { background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s', backdropFilter: 'blur(4px)', flexShrink: 0 }

  // -- Shared top toolbar (works for both embed + native) ---------------------
  const Toolbar = () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 0 4px', flexWrap: 'wrap' }}>
      {/* Autoplay toggle */}
      <button onClick={() => setAutoplay(a => !a)}
        style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 1, padding: '4px 10px', background: autoplay ? 'rgba(0,255,136,0.15)' : 'var(--bg3)', border: `1px solid ${autoplay ? 'rgba(0,255,136,0.4)' : 'var(--border)'}`, color: autoplay ? 'var(--green)' : 'var(--muted)', borderRadius: 5, cursor: 'pointer' }}>
        ? AUTO {autoplay ? 'ON' : 'OFF'}
      </button>
      {/* Mute toggle (embed) */}
      {isEmbed && (
        <button onClick={() => setMuted(m => !m)}
          style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 1, padding: '4px 10px', background: muted ? 'rgba(255,71,87,0.12)' : 'var(--bg3)', border: `1px solid ${muted ? 'rgba(255,71,87,0.4)' : 'var(--border)'}`, color: muted ? '#ff4757' : 'var(--muted)', borderRadius: 5, cursor: 'pointer' }}>
          {muted ? '🔇 MUTED' : '🔊 SOUND'}
        </button>
      )}
      {/* Size selector */}
      {['small','medium','large','cinema'].map(s => (
        <button key={s} onClick={() => setSize(s)}
          style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 1, padding: '4px 8px', background: size === s ? 'rgba(0,212,255,0.12)' : 'var(--bg3)', border: `1px solid ${size === s ? 'rgba(0,212,255,0.4)' : 'var(--border)'}`, color: size === s ? 'var(--cyan)' : 'var(--muted)', borderRadius: 5, cursor: 'pointer', textTransform: 'uppercase' }}>
          {s === 'small' ? 'SM' : s === 'medium' ? 'MD' : s === 'large' ? 'LG' : 'FULL'}
        </button>
      ))}
    </div>
  )

  // -- Embed (YouTube / Vimeo) ------------------------------------------------
  if (isEmbed) return (
    <div style={{ marginTop: 10 }}>
      <Toolbar />
      <div key={`${autoplay}-${muted}`} style={{ position: 'relative', width: '100%', paddingTop: size === 'cinema' ? '56.25%' : undefined, background: '#000', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)', ...(!heightStyle ? {} : { height: SIZE_MAP[size], paddingTop: 0 }) }}>
        <iframe
          src={getEmbedUrl()}
          style={{ position: size === 'cinema' ? 'absolute' : 'relative', inset: 0, width: '100%', height: size === 'cinema' ? '100%' : SIZE_MAP[size], border: 'none', display: 'block' }}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen title="video"
        />
      </div>
    </div>
  )

  // -- Native video -----------------------------------------------------------
  return (
    <div style={{ marginTop: 10 }}>
      <Toolbar />
      <div ref={containerRef} onMouseMove={showCtrl} onMouseLeave={() => playing && setShowControls(false)}
        style={{ position: 'relative', width: '100%', background: '#000', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)', userSelect: 'none' }}>
        <video ref={videoRef} src={url} loop={loop} autoPlay={autoplay} muted={autoplay || muted}
          style={{ width: '100%', display: 'block', ...heightStyle }}
          onClick={togglePlay}
          onTimeUpdate={e => { const v = e.target; setCT(v.currentTime); setProgress(v.duration ? v.currentTime / v.duration : 0) }}
          onLoadedMetadata={e => setDuration(e.target.duration)}
          onEnded={() => setPlaying(false)}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
        />

        {/* Center play overlay */}
        {!playing && (
          <div onClick={togglePlay} style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: 'rgba(0,0,0,0.35)' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(0,255,136,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 24px rgba(0,255,136,0.5)' }}>
              <span style={{ color: '#000', fontSize: 22, marginLeft: 4 }}>?</span>
            </div>
          </div>
        )}

        {/* Controls bar */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, opacity: showControls ? 1 : 0, transition: 'opacity 0.3s', background: 'linear-gradient(transparent, rgba(0,0,0,0.88))', padding: '20px 12px 10px' }}>
          {/* Progress bar */}
          <div style={{ position: 'relative', height: 4, background: 'rgba(255,255,255,0.2)', borderRadius: 2, marginBottom: 10, cursor: 'pointer' }}
            onClick={e => { const r = e.currentTarget.getBoundingClientRect(); onSeek((e.clientX - r.left) / r.width) }}>
            <div style={{ height: '100%', width: `${progress * 100}%`, background: 'linear-gradient(90deg, var(--green), var(--cyan))', borderRadius: 2, position: 'relative', transition: 'width 0.1s' }}>
              <div style={{ position: 'absolute', right: -5, top: '50%', transform: 'translateY(-50%)', width: 12, height: 12, background: '#fff', borderRadius: '50%', boxShadow: '0 0 6px rgba(0,255,136,0.8)' }} />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button onClick={togglePlay} style={{ ...btnStyle, width: 32, height: 32, fontSize: 13 }}>{playing ? '?' : '?'}</button>
            <button onClick={() => skip(-10)} style={{ ...btnStyle, width: 28, height: 28, fontSize: 10 }} title="-10s">?</button>
            <button onClick={() => skip(10)} style={{ ...btnStyle, width: 28, height: 28, fontSize: 10 }} title="+10s">?</button>
            <button onClick={toggleMute} style={{ ...btnStyle, width: 28, height: 28, fontSize: 13 }}>
              {muted || volume === 0 ? '○' : volume < 0.5 ? '○' : '○'}
            </button>
            <Slider min={0} max={1} step={0.05} value={muted ? 0 : volume} onChange={onVolumeChange}
              style={{ width: 60 }} />
            <span style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,255,255,0.8)' }}>{fmt(currentTime)} / {fmt(duration)}</span>
            <div style={{ flex: 1 }} />
            <div style={{ width: 82 }}>
              <Select value={playbackRate}
                onChange={v => { const rate = Number(v); setPlaybackRate(rate); if (videoRef.current) videoRef.current.playbackRate = rate }}
                options={[0.5, 0.75, 1, 1.25, 1.5, 2].map(s => ({ value:s, label:`${s}x` }))}
                menuStyle={{ minWidth: 90 }}
              />
            </div>
            <button onClick={() => setLoop(l => !l)} title={loop ? 'Loop: On' : 'Loop: Off'}
              style={{ ...btnStyle, width: 28, height: 28, fontSize: 12, opacity: loop ? 1 : 0.5 }}>🔁</button>
            <a href={url} download target="_blank" rel="noreferrer"
              style={{ ...btnStyle, width: 28, height: 28, fontSize: 12, textDecoration: 'none' }} title="Download">?</a>
            <button onClick={toggleFullscreen} style={{ ...btnStyle, width: 28, height: 28, fontSize: 13 }}>
              {isFullscreen ? '?' : '?'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// --- Mobile hook -------------------------------------------------------------

export default VideoPlayer
