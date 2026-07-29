import { T } from '../chat-constants'

export function MediaViewer({ media, onClose }) {
  if (!media) return null
  const isVideo = /\.(mp4|webm|mov|ogg|mkv)/i.test(media.url)
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}>
      <div style={{ maxWidth: '90vw', maxHeight: '90vh', position: 'relative' }} onClick={e => e.stopPropagation()}>
        {isVideo ? (
          <video src={media.url} controls autoPlay playsInline style={{ maxWidth: '100%', maxHeight: '85vh', borderRadius: 8 }} />
        ) : (
          <img src={media.url} alt="" style={{ maxWidth: '100%', maxHeight: '85vh', borderRadius: 8, objectFit: 'contain' }} />
        )}
        <button onClick={onClose} style={{ position: 'absolute', top: -12, right: -12, width: 32, height: 32, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.15)', color: '#fff', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)' }}>✕</button>
        <div style={{ textAlign: 'center', marginTop: 8, fontFamily: T.mono, fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>
          Click outside to close
        </div>
      </div>
    </div>
  )
}
