'use client'
import { useEffect, useRef, useState } from 'react'
import { EditableList, EditableText } from '../context/EditContext'
import { useSplitTextReveal } from '../hooks/useSplitTextReveal'
import { useReveal } from '../hooks/useReveal'
import api from '@/lib/api'

function NewsletterTerminal() {
  const [email, setEmail]   = useState('')
  const [status, setStatus] = useState(null)
  const [msg, setMsg]       = useState('')

  const submit = async (e) => {
    e.preventDefault()
    if (!email.trim()) return
    setStatus('loading')
    try {
      await api.post('/newsletter/subscribe', { email })
      setStatus('success')
      setEmail('')
    } catch (err) {
      setStatus('error')
      setMsg(err.response?.data?.error || 'Something went wrong.')
    }
  }

  return (
    <div style={{
      marginTop: 60,
      display: 'grid', gridTemplateColumns: '1fr 1fr',
      gap: 60, alignItems: 'center',
      borderTop: '1px solid var(--border)',
      paddingTop: 60,
    }} className="newsletter-inner-grid">

      {/* Left copy */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <div style={{ width: 28, height: 1, background: 'var(--green)' }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 4, color: 'var(--green)' }}>NEWSLETTER_v1.0</span>
        </div>
        <h3 style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 'clamp(20px, 2.5vw, 32px)', lineHeight: 1.2, marginBottom: 16, color: 'var(--text)' }}>
          <span style={{ color: 'var(--green)' }}>$</span> subscribe<br />
          <span style={{ color: 'var(--muted)', fontSize: '0.65em' }}>--channel=blog --no-spam</span>
        </h3>
        <p style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.8, fontFamily: 'var(--font-display)', marginBottom: 20 }}>
          <EditableText contentKey="newsletter.desc" defaultValue="Deep-dives on networking, security, cloud infrastructure, and real-world IT engineering. Published when there's something worth reading." multiline />
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {['✓  No spam. Ever.', '✓  One-click unsubscribe in every email.', '✓  New post → email goes out automatically.'].map((l, i) => (
            <div key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', letterSpacing: 1 }}>{l}</div>
          ))}
        </div>
      </div>

      {/* Right terminal */}
      <div className="terminal-panel newsletter-terminal">
        {/* Title bar */}
        <div className="terminal-panel-header" style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 6 }}>
          {['#ff5f57','#ffbd2e','#28c840'].map((c, i) => (
            <div key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: c }} />
          ))}
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', letterSpacing: 2, marginLeft: 8 }}>visitor@aifazi.net — subscribe</span>
        </div>

        <div style={{ padding: '24px 24px 28px' }}>
          <div style={{ marginBottom: 16 }}>
            {[
              { prompt: true,  text: 'newsletter --subscribe' },
              { prompt: false, text: '> Initializing secure channel...' },
              { prompt: false, text: '> Enter your email to subscribe:' },
            ].map((line, i) => (
              <div key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: line.prompt ? 'var(--green)' : 'var(--muted)', lineHeight: 1.9 }}>
                {line.prompt && <span style={{ color: 'var(--cyan)', marginRight: 8 }}>$</span>}
                {line.text}
              </div>
            ))}
          </div>

          {status === 'success' ? (
            <div>
              {['> Validating address...', '> ✓ Subscribed successfully!', "> You'll hear from me on the next post."].map((line, i) => (
                <div key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: i === 1 ? 'var(--green)' : 'var(--muted)', lineHeight: 2 }}>{line}</div>
              ))}
            </div>
          ) : (
            <form onSubmit={submit}>
              <div className="terminal-prompt-row newsletter-prompt-row" style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
                <span className="terminal-prompt-label" style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--cyan)', flexShrink: 0 }}>{'>'}</span>
                <input
                  className="terminal-command-input newsletter-command-input"
                  type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="your@email.com" required disabled={status === 'loading'}
                  style={{ flex: 1, color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: 13, caretColor: 'var(--green)' }}
                />
                <span className="terminal-cursor" style={{ display: 'inline-block', width: 8, height: 14, background: 'var(--green)', marginLeft: 4, animation: 'blink 1s step-end infinite' }} />
              </div>
              <button type="submit" disabled={status === 'loading'}
                style={{ width: '100%', padding: '11px', background: 'transparent', border: '1px solid var(--green)', color: 'var(--green)', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 3, cursor: 'pointer', transition: 'all 0.2s' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--green)'; e.currentTarget.style.color = '#000' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--green)' }}
              >
                {status === 'loading' ? 'SUBSCRIBING...' : '[ EXECUTE SUBSCRIBE ]'}
              </button>
              {status === 'error' && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--red)', marginTop: 8 }}>{'>'} ERROR: {msg}</div>}
            </form>
          )}
        </div>
      </div>

      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @media(max-width:768px){ .newsletter-inner-grid{ grid-template-columns:1fr !important; gap:32px !important; } }
      `}</style>
    </div>
  )
}

const SP_CLOTHING_PROJECT = {
  id: 'sp-clothingmenu',
  num: '005',
  icon: '🧥',
  title: 'sp-clothingmenu',
  desc: 'A futuristic FiveM clothing interaction resource with transparent body anchors, ox_inventory metadata items, ox_lib progress feedback, and illenium-appearance sync.',
  tags: ['FiveM', 'QBX', 'ox_inventory', 'ox_lib', 'NUI'],
  link: 'https://github.com/aifazi/sp-clothingmenu',
  preview: 'clothing-menu',
  previewKind: 'custom',
  previewUrl: '',
  previewAlt: 'sp-clothingmenu preview',
}

const DEFAULT_PROJECTS = [
  { num: '001', icon: '🏢', title: 'IT Infrastructure Modernization', desc: 'Leading the end-to-end upgrade of EOL physical servers (HP ProLiant Gen 8) and core switching infrastructure (Cisco Nexus) to modern Catalyst 9300 series.', tags: ['VMware', 'Cisco Catalyst', 'HP ProLiant', 'Project Management'] },
  { num: '002', icon: '🔥', title: 'Next-Gen Firewall Migration', desc: 'Planning and executing the migration from legacy WatchGuard M470 HA pair to FortiGate 80F, including zero-trust architecture and security policy hardening.', tags: ['FortiGate', 'WatchGuard', 'Security', 'ZTA'] },
  { num: '003', icon: '☁️', title: 'Hybrid Cloud & Azure Migration', desc: 'Architecting a hybrid environment by migrating on-premise file shares (AAFAQ-FPS) to Azure Files and implementing Site-to-Site VPN with Entra ID sync.', tags: ['Azure', 'Entra ID', 'VPN', 'Cloud Migration'] },
  { num: '004', icon: '💾', title: 'Enterprise Backup Restoration', desc: 'Revitalizing expired Veeam Backup & Replication across on-premise, Azure Cloud, and M365 workloads with a <4hr restoration SLA.', tags: ['Veeam', 'Disaster Recovery', 'M365', 'Azure Backup'] },
]

function mergeFeaturedProject(items = []) {
  const list = Array.isArray(items) ? items : []
  let found = false
  const merged = list.map(item => {
    const matches =
      item?.id === SP_CLOTHING_PROJECT.id ||
      item?.link === SP_CLOTHING_PROJECT.link ||
      String(item?.title || '').toLowerCase() === SP_CLOTHING_PROJECT.title

    if (!matches) return item
    found = true
    return { ...SP_CLOTHING_PROJECT, ...item }
  })

  return found ? merged : [...merged, SP_CLOTHING_PROJECT]
}

const PROJECT_FIELDS = [
  { key: 'id', label: 'Stable ID (optional)' },
  { key: 'num', label: 'Number (e.g. 007)' },
  { key: 'icon', label: 'Icon (emoji)', type: 'emoji' },
  { key: 'title', label: 'Project Title' },
  { key: 'desc', label: 'Description', type: 'textarea' },
  { key: 'tags', label: 'Tags (comma separated)', type: 'tags' },
  { key: 'link', label: 'Link URL (optional)' },
  { key: 'preview', label: 'Custom Preview Type (e.g. clothing-menu)' },
  { key: 'previewKind', label: 'Preview Kind (auto, image, video, custom)' },
  { key: 'previewUrl', label: 'Image/Video Preview URL (optional)' },
  { key: 'previewAlt', label: 'Preview Alt Text (optional)' },
]

function ProjectPreview({ project }) {
  const mediaUrl = String(project.previewUrl || project.image || project.video || '').trim()
  const previewKind = String(project.previewKind || 'auto').toLowerCase()
  const looksVideo = /\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(mediaUrl)
  const shouldShowMedia = mediaUrl && (previewKind === 'auto' || previewKind === 'image' || previewKind === 'video')
  const isVideo = shouldShowMedia && (previewKind === 'video' || (previewKind === 'auto' && looksVideo))

  if (shouldShowMedia) {
    return (
      <div className="project-preview project-media-preview">
        {isVideo ? (
          <video
            src={mediaUrl}
            poster={project.previewPoster || undefined}
            muted
            loop
            playsInline
            controls
            preload="metadata"
          />
        ) : (
          <img src={mediaUrl} alt={project.previewAlt || project.title || 'Project preview'} loading="lazy" />
        )}
      </div>
    )
  }

  if (project.preview !== 'clothing-menu') return null

  const anchors = [
    { label: 'hat', x: 48, y: 16 },
    { label: 'mask', x: 28, y: 38 },
    { label: 'vest', x: 50, y: 47, active: true },
    { label: 'shoes', x: 62, y: 78 },
  ]

  return (
    <div className="project-preview clothing-preview" aria-hidden="true">
      <div className="preview-scanline" />
      <div className="preview-ped">
        <div className="preview-head" />
        <div className="preview-body" />
        <div className="preview-leg preview-leg-left" />
        <div className="preview-leg preview-leg-right" />
      </div>
      {anchors.map(anchor => (
        <div
          key={anchor.label}
          className={`preview-anchor ${anchor.active ? 'active' : ''}`}
          style={{ left: `${anchor.x}%`, top: `${anchor.y}%` }}
        />
      ))}
      <div className="preview-terminal">
        <span>// NUI</span>
        <strong>WARDROBE LINK</strong>
      </div>
    </div>
  )
}

function ProjectCard({ project, index }) {
  const ref = useRef()
  useEffect(() => {
    const el = ref.current; if (!el) return
    el.style.opacity = '0'
    el.style.transform = 'translateY(40px)'
    let ctx
    Promise.all([
      import('gsap').then(m => m.gsap),
      import('gsap/ScrollTrigger').then(m => m.ScrollTrigger),
    ]).then(([gsap, ScrollTrigger]) => {
      if (!el) return
      gsap.registerPlugin(ScrollTrigger)
      ctx = gsap.context(() => {
        gsap.fromTo(el,
          { opacity: 0, y: 40 },
          {
            opacity: 1,
            y: 0,
            duration: 0.7,
            delay: index * 0.08,
            ease: 'expo.out',
            scrollTrigger: { trigger: el, start: 'top bottom', once: true },
          }
        )
      })
    }).catch(() => {
      if (el) { el.style.opacity = '1'; el.style.transform = 'none' }
    })
    return () => { try { ctx?.revert() } catch {} }
  }, [index])

  const Wrapper = project.link ? 'a' : 'div'

  return (
    <Wrapper ref={ref} className="animated-border" href={project.link || undefined} target={project.link ? '_blank' : undefined} rel="noopener noreferrer"
      style={{ background: 'var(--bg3)', border: '1px solid var(--border)', padding: 36, position: 'relative', overflow: 'hidden', transition: 'border-color 0.3s, transform 0.4s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.3s', opacity: 1, transform: 'translateY(0)', cursor: project.link ? 'pointer' : 'default', textDecoration: 'none', display: 'block' }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(0,255,136,0.35)'; e.currentTarget.style.transform = 'translateY(-8px) scale(1.01)'; e.currentTarget.style.boxShadow = '0 24px 60px rgba(0,0,0,0.4), 0 0 30px rgba(0,255,136,0.07)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'translateY(0) scale(1)'; e.currentTarget.style.boxShadow = 'none' }}
    >
      <div style={{ position: 'absolute', top: 0, right: 0, width: 40, height: 40, background: 'linear-gradient(225deg, rgba(0,255,136,0.15) 0%, transparent 60%)' }} />
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', letterSpacing: 2, marginBottom: 20, opacity: 0.35 }}>{project.num}</div>
      <ProjectPreview project={project} />
      {!project.preview && <div style={{ fontSize: 36, marginBottom: 20, display: 'inline-block', animation: 'float 6s ease-in-out infinite', animationDelay: `${index * 0.5}s` }}>{project.icon}</div>}
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: 'var(--text)', marginBottom: 12, lineHeight: 1.2 }}>
        <EditableText contentKey={`project.${index}.title`} defaultValue={project.title} />
      </div>
      <p style={{ fontSize: 15, color: 'var(--muted)', lineHeight: 1.7, marginBottom: 24 }}>
        <EditableText contentKey={`project.${index}.desc`} defaultValue={project.desc} multiline />
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {(project.tags || []).map(t => <span key={t} className="tag" style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t}</span>)}
      </div>
      {project.link && <div style={{ marginTop: 16, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--green)', letterSpacing: 2 }}>VIEW PROJECT →</div>}
    </Wrapper>
  )
}

export default function Projects() {
  const headerRef = useReveal()
  const titleRef  = useSplitTextReveal({ staggerMs: 40, fromY: 28 })
  const [projects, setProjects] = useState(mergeFeaturedProject(DEFAULT_PROJECTS))

  useEffect(() => {
    api.get('/portfolio/projects').then(r => {
      if (r.data?.length) setProjects(mergeFeaturedProject(r.data))
    }).catch(() => {}) // silent fallback to defaults
  }, [])

  return (
    <section id="projects" style={{ padding: '120px 60px', background: 'var(--bg2)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', position: 'relative', zIndex: 1 }}>
      <div ref={headerRef} className="fade-up section-header">
        <span className="section-tag">06 /</span>
        <h2 ref={titleRef} className="section-title">Projects</h2>
        <div className="section-line" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 1 }} className="projects-grid">
        <EditableList
          contentKey="projects.items"
          defaultValue={projects}
          addLabel="+ Add Project"
          fields={PROJECT_FIELDS}
          normalizeItems={mergeFeaturedProject}
          renderItem={(project, i) => <ProjectCard key={i} project={project} index={i} />}
        />
      </div>

      <style>{`
        #projects .project-preview {
          position: relative;
          width: 100%;
          aspect-ratio: 16 / 6.2;
          min-height: 112px;
          max-height: 220px;
          margin: -8px 0 22px;
          border: 1px solid rgba(0,212,255,0.24);
          background:
            radial-gradient(circle at 50% 38%, rgba(0,255,136,0.13), transparent 35%),
            linear-gradient(180deg, rgba(0,15,24,0.48), rgba(0,6,12,0.72));
          overflow: hidden;
        }
        #projects .project-media-preview {
          background: rgba(0,10,16,0.58);
        }
        #projects .project-media-preview img,
        #projects .project-media-preview video {
          width: 100%;
          height: 100%;
          display: block;
          object-fit: cover;
        }
        #projects .project-media-preview video {
          background: rgba(0,0,0,0.3);
        }
        #projects .project-preview::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(120deg, transparent 0 42%, rgba(0,212,255,0.12) 48%, transparent 56% 100%);
          opacity: 0.75;
        }
        #projects .preview-scanline {
          position: absolute;
          left: 0;
          right: 0;
          top: 50%;
          height: 1px;
          background: rgba(0,255,136,0.6);
          box-shadow: 0 0 18px rgba(0,255,136,0.35);
        }
        #projects .preview-ped {
          position: absolute;
          left: 50%;
          top: 18px;
          width: 46px;
          height: 92px;
          transform: translateX(-50%);
          opacity: 0.82;
        }
        #projects .preview-head,
        #projects .preview-body,
        #projects .preview-leg {
          position: absolute;
          left: 50%;
          transform: translateX(-50%);
          border: 1px solid rgba(210,230,245,0.5);
          background: rgba(210,230,245,0.12);
          box-shadow: 0 0 18px rgba(0,212,255,0.18);
        }
        #projects .preview-head { top: 0; width: 18px; height: 18px; border-radius: 50%; }
        #projects .preview-body { top: 25px; width: 30px; height: 38px; border-radius: 8px 8px 4px 4px; }
        #projects .preview-leg { top: 65px; width: 10px; height: 28px; border-radius: 4px; }
        #projects .preview-leg-left { margin-left: -8px; }
        #projects .preview-leg-right { margin-left: 8px; }
        #projects .preview-anchor {
          position: absolute;
          width: 20px;
          height: 20px;
          transform: translate(-50%, -50%);
          border: 1px solid rgba(0,212,255,0.58);
          background: rgba(0,16,25,0.72);
          box-shadow: 0 0 16px rgba(0,212,255,0.16);
        }
        #projects .preview-anchor::after {
          content: '';
          position: absolute;
          inset: 6px;
          border-radius: 50%;
          background: rgba(0,212,255,0.75);
        }
        #projects .preview-anchor.active {
          border-color: var(--green);
          box-shadow: 0 0 22px rgba(0,255,136,0.4);
        }
        #projects .preview-anchor.active::after { background: var(--green); }
        #projects .preview-terminal {
          position: absolute;
          left: 14px;
          bottom: 12px;
          display: flex;
          gap: 8px;
          align-items: center;
          font-family: var(--font-mono);
          font-size: 9px;
          letter-spacing: 2px;
          color: var(--muted);
        }
        #projects .preview-terminal strong { color: var(--green); font-weight: 700; }
        @media (max-width: 1024px) { #projects .projects-grid { grid-template-columns: repeat(2,1fr) !important; } }
        @media (max-width: 640px)  { #projects .projects-grid { grid-template-columns: 1fr !important; } }
        @media (max-width: 900px)  { #projects { padding: 80px 24px !important; } }
        @media (max-width: 480px)  { #projects { padding: 60px 12px !important; } #projects .projects-grid > div, #projects .projects-grid > a { padding: 20px !important; } }
        @media (prefers-reduced-motion: reduce) { #projects .projects-grid > * { opacity: 1 !important; transform: none !important; } }
      `}</style>
    </section>
  )
}
