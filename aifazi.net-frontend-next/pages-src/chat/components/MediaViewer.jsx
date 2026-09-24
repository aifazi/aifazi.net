import { T } from '../chat-constants'
import { Dialog } from '../../../components/Dialog'

export function MediaViewer({ media, onClose }) {
  if (!media) return null
  const isVideo = /\.(mp4|webm|mov|ogg|mkv)/i.test(media.url)
  return (
    <Dialog onClose={onClose} label="Media viewer" zIndex={500}
      overlayStyle={{ background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(4px)' }}>
      <div style={{ maxWidth: '90vw', maxHeight: '90vh', position: 'relative' }}>
        {isVideo ? (
          <video src={media.url} controls autoPlay playsInline style={{ maxWidth: '100%', maxHeight: '85vh', borderRadius: 8 }} />
        ) : (
          // P1-6 — next/image skipped: arbitrary user-supplied host outside
          // next.config remotePatterns; meaningful alt instead of empty.
          <img src={media.url} alt="Shared chat media" style={{ maxWidth: '100%', maxHeight: '85vh', borderRadius: 8, objectFit: 'contain' }} />
        )}
        <button onClick={onClose} aria-label="Close media viewer" style={{ position: 'absolute', top: -12, right: -12, width: 32, height: 32, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.15)', color: '#fff', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)' }}>✕</button>
        <div style={{ textAlign: 'center', marginTop: 8, fontFamily: T.mono, fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
          Click outside to close
        </div>
      </div>
    </Dialog>
  )
}
