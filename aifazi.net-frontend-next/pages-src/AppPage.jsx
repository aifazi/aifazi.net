'use client'
import { useState, useEffect } from 'react'
import api from '@/lib/api'
import { Link } from '@/lib/router-compat'

const MONO = "var(--font-mono,'JetBrains Mono',monospace)"
const G = 'var(--green)'
const C = 'var(--cyan)'
const O = 'var(--orange)'

function fmtSize(bytes) {
  if (bytes == null) return '—'
  const mb = bytes / (1024 * 1024)
  return `${mb.toFixed(1)} MB`
}

const FEATURES = [
  { icon: '💬', title: 'Real-time chat', desc: 'Channels, DMs, voice & video calls with reactions, replies and file sharing.' },
  { icon: '📰', title: 'Blog & forum', desc: 'Read posts, comment, start threads and keep up with the aifazi community on the go.' },
  { icon: '🛍️', title: 'Store & cart', desc: 'Browse products, add to cart and order straight from your phone.' },
  { icon: '📡', title: 'Live server status', desc: 'Watch uptime and latency for every aifazi system in real time.' },
  { icon: '🔐', title: 'Secure by design', desc: 'In-memory sessions, encrypted messaging and the same hardened backend as the web.' },
  { icon: '🔄', title: 'In-app updates', desc: 'The app tells you when a new version is out and installs it for you.' },
]

const FAQ = [
  { q: 'What does the download include?', a: 'A single Android APK (aifazi-v1.0.x.apk) that installs like any app. It is auto-updated in-place through the in-app updater.' },
  { q: 'Do I need a Google Play account or GApps?', a: 'No. The APK is signed and installable directly. Google Play Services are not required.' },
  { q: 'The browser says "Unknown sources".', a: 'That is expected — it is a direct APK. Tap Settings → allow "Install unknown apps" for your browser, and confirm the install.' },
  { q: 'Why is there no iOS build?', a: 'The APK currently targets Android. An iOS build requires an Apple Developer account; use the mobile web version (open aifazi.net on your phone) in the meantime.' },
]

function DownloadCard({ release, loading, error }) {
  if (loading) {
    return (
      <div className="store-skeleton" style={{ height: 220, borderRadius: 16 }} />
    )
  }
  if (error) {
    return (
      <div style={{ border: '1px solid var(--border)', borderRadius: 14, background: 'var(--bg2)', padding: '24px', textAlign: 'center' }}>
        <div style={{ fontSize: 26, marginBottom: 8 }}>📦</div>
        <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 2, color: O, marginBottom: 12 }}>COULD NOT FETCH LATEST VERSION</div>
        <a href="https://api.aifazi.net/api/mobile/release/download"
          download="aifazi.apk"
          style={{ fontFamily: MONO, fontSize: 12, letterSpacing: 2, padding: '14px 28px', color: G, border: `1px solid ${G}55`, textDecoration: 'none', background: `${G}0c`, display: 'inline-block' }}>
          DOWNLOAD APK DIRECTLY
        </a>
      </div>
    )
  }
  const notes = release?.notes || ''
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 14, background: 'var(--bg2)', padding: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke={G} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
          <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
          <path d="M4 22h16" />
          <path d="M10 14.66V17c0 .55-.47.98-.97 1.21" />
          <path d="M14 14.66V17c0 .55.47.98.97 1.21" />
          <path d="M18 2H6v7a6 6 0 0 0 12 0V2z" />
        </svg>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>aifazi mobile</div>
          <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 2, color: C }}>ANDROID APP</div>
        </div>
        <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 1, padding: '4px 10px', borderRadius: 99, background: `${G}14`, border: `1px solid ${G}40`, color: G }}>
          {release?.version ? `v${release.version}` : 'v1.0.1'}
        </div>
      </div>

      <a href={release?.apkUrl || 'https://api.aifazi.net/api/mobile/release/download'}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          fontFamily: MONO, fontSize: 13, letterSpacing: 3, fontWeight: 700,
          padding: '15px 20px', color: '#04120a', background: G,
          borderRadius: 8, textDecoration: 'none', boxShadow: `0 0 24px ${G}40`, marginBottom: 16,
        }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        DOWNLOAD FOR ANDROID
      </a>

      <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 1, color: 'var(--muted)', textAlign: 'center' }}>
        {release?.asset_name || 'aifazi-v1.0.1.apk'} · {fmtSize(release?.asset_size)}
        {release?.published_at ? ` · ${new Date(release.published_at).toLocaleDateString()}` : ''}
      </div>

      {notes && (
        <div style={{ marginTop: 18, border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', background: 'var(--bg3)', whiteSpace: 'pre-wrap', fontFamily: MONO, fontSize: 10, lineHeight: 1.6, color: 'var(--muted)' }}>
          {notes}
        </div>
      )}
    </div>
  )
}

export default function AppPage() {
  const [release, setRelease] = useState(null)
  const [status, setStatus] = useState('loading')

  useEffect(() => {
    let cancelled = false
    api.get('/mobile/release/latest')
      .then(r => { if (!cancelled) { setRelease(r.data); setStatus('ok') } })
      .catch(() => { if (!cancelled) setStatus('error') })
    return () => { cancelled = true }
  }, [])

  return (
    <div style={{ minHeight: '100vh', padding: '60px 20px 90px', background: 'var(--bg)' }}>
      <div style={{ maxWidth: 820, margin: '0 auto' }}>
        {/* Hero */}
        <div style={{ textAlign: 'center', marginBottom: 10 }}>
          <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 4, color: C, marginBottom: 12 }}>AIFAZI.NET · MOBILE APP</div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 40, fontWeight: 800, margin: '0 0 10px', color: 'var(--text)' }}>
            aifazi, <span style={{ color: G }}>in your pocket</span>
          </h1>
          <p style={{ fontFamily: MONO, fontSize: 12, lineHeight: 1.8, color: 'var(--muted)', maxWidth: 620, margin: '0 auto 8px' }}>
            The entire aifazi.net network — chat, voice & video, blog, forum, store and live server status — as a native Android app.
          </p>
        </div>

        {/* Download card */}
        <div style={{ maxWidth: 460, margin: '30px auto 0' }}>
          <DownloadCard release={release} loading={status === 'loading'} error={status === 'error'} />
          <p style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 1, color: 'var(--muted)', textAlign: 'center', marginTop: 14 }}>
            FREE · NO TRACKERS · NO ADS · DIRECT APK
          </p>
        </div>

        {/* Phones mock */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 14, margin: '46px 0 26px' }}>
          {[
            ['💬', 'Chat channels & DMs', 'Realtime messaging with replies, reactions, edit & swipe-to-reply.'],
            ['📞', 'Voice & video calls', 'LiveKit-powered calls and screen share right from the app.'],
            ['📖', 'Blog & forum on the go', 'Read, comment and reply — synced with the main site.'],
          ].map(([icon, title, desc]) => (
            <div key={title} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '18px', background: 'var(--bg2)' }}>
              <div style={{ fontSize: 22, marginBottom: 8 }}>{icon}</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>{title}</div>
              <div style={{ fontFamily: MONO, fontSize: 10, lineHeight: 1.6, color: 'var(--muted)' }}>{desc}</div>
            </div>
          ))}
        </div>

        {/* Features grid */}
        <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 3, color: G, margin: '26px 0 14px' }}>FEATURES</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
          {FEATURES.map(f => (
            <div key={f.title} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '16px', background: 'var(--bg2)' }}>
              <div style={{ fontSize: 20, marginBottom: 8 }}>{f.icon}</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 5 }}>{f.title}</div>
              <div style={{ fontFamily: MONO, fontSize: 10, lineHeight: 1.6, color: 'var(--muted)' }}>{f.desc}</div>
            </div>
          ))}
        </div>

        {/* FAQ */}
        <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 3, color: C, margin: '34px 0 14px' }}>FAQ</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {FAQ.map(f => (
            <details key={f.q} style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg2)' }}>
              <summary style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, color: 'var(--text)', padding: '14px 16px', cursor: 'pointer', listStyle: 'none' }}>
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  {f.q}
                  <span style={{ color: G, fontFamily: MONO, fontSize: 11 }}>+</span>
                </span>
              </summary>
              <div style={{ padding: '0 16px 14px', fontFamily: MONO, fontSize: 11, lineHeight: 1.7, color: 'var(--muted)' }}>{f.a}</div>
            </details>
          ))}
        </div>

        <div style={{ textAlign: 'center', marginTop: 36 }}>
          <Link to="/" style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 2, color: C, textDecoration: 'none' }}>← BACK TO SITE</Link>
        </div>
      </div>
    </div>
  )
}