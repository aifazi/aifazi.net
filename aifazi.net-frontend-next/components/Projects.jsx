'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatableWrapper, EditableList, EditableText } from '../context/EditContext'
import { useSplitTextReveal } from '../hooks/useSplitTextReveal'
import { useReveal } from '../hooks/useReveal'
import api from '@/lib/api'

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
  const ref = useReveal()
  const cardRef = useRef(null)

  const handleMouseMove = useCallback((e) => {
    const el = cardRef.current; if (!el) return
    const rect = el.getBoundingClientRect()
    el.style.setProperty('--mx', `${((e.clientX - rect.left) / rect.width) * 100}%`)
    el.style.setProperty('--my', `${((e.clientY - rect.top) / rect.height) * 100}%`)
  }, [])
  const handleMouseEnter = useCallback(() => {
    const el = cardRef.current; if (!el) return
    el.style.borderColor = 'rgba(0,255,136,0.4)'
    el.style.transform   = 'translateY(-6px)'
    el.style.boxShadow   = '0 20px 60px rgba(0,0,0,0.4),0 0 0 1px rgba(0,255,136,0.15),inset 0 1px 0 rgba(0,255,136,0.08)'
    el.querySelector('.prj-scan')?.classList.add('prj-scan--active')
  }, [])
  const handleMouseLeave = useCallback(() => {
    const el = cardRef.current; if (!el) return
    el.style.borderColor = 'var(--border)'; el.style.transform = ''; el.style.boxShadow = ''
    el.querySelector('.prj-scan')?.classList.remove('prj-scan--active')
  }, [])

  const Wrapper = project.link ? 'a' : 'div'

  return (
    <AnimatableWrapper
      animKey={`projects.item.${index}`}
      label={`Project Card: ${project.title || `Project ${index + 1}`}`}
      currentAnim="fadeUp 0.75s both"
      style={{ display: 'flex', flexDirection: 'column', flex: 1, height: '100%' }}
    >
      <div ref={ref} className="fade-up prj-card-wrapper" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Wrapper
          ref={cardRef}
          href={project.link || undefined}
          target={project.link ? '_blank' : undefined}
          rel="noopener noreferrer"
          className="prj-card"
          onMouseMove={handleMouseMove}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          style={{ textDecoration: 'none', cursor: project.link ? 'pointer' : 'default' }}
        >
          <div className="prj-spotlight" />
          <div className="prj-scan" />
          <span className="prj-corner prj-corner--tl" />
          <span className="prj-corner prj-corner--br" />

          {/* Preview (media / custom) */}
          <ProjectPreview project={project} />

          {/* Icon + number row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, position: 'relative', zIndex: 1 }}>
            {project.preview
              ? <span />
              : <span style={{ fontSize: 30, display: 'inline-block', animation: 'float 6s ease-in-out infinite', animationDelay: `${index * 0.5}s` }}>{project.icon}</span>}
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', letterSpacing: 3, opacity: 0.5 }}>{project.num}</span>
          </div>

          {/* Title */}
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 10, lineHeight: 1.25, position: 'relative', zIndex: 1 }}>
            <EditableText contentKey={`project.${index}.title`} defaultValue={project.title} />
          </div>

          {/* Description */}
          <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.7, marginBottom: 18, position: 'relative', zIndex: 1 }}>
            <EditableText contentKey={`project.${index}.desc`} defaultValue={project.desc} multiline />
          </p>

          {/* Tags + link */}
          <div style={{ marginTop: 'auto', position: 'relative', zIndex: 1 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: project.link ? 14 : 0 }}>
              {(project.tags || []).map(t => <span key={t} className="tag" style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t}</span>)}
            </div>
            {project.link && (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--green)', letterSpacing: 2, borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 14 }}>
                VIEW PROJECT →
              </div>
            )}
          </div>
        </Wrapper>
      </div>
    </AnimatableWrapper>
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
    <section id="projects" style={{ padding: '120px 60px', background: 'var(--bg2)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', position: 'relative', zIndex: 1 }} className="projects-section">
      <AnimatableWrapper animKey="projects.header" label="Projects Section Header" currentAnim="fadeUp 0.8s both">
        <div ref={headerRef} className="fade-up section-header">
          <span className="section-tag">06 /</span>
          <h2 ref={titleRef} className="section-title">Projects</h2>
          <div className="section-line" />
        </div>
      </AnimatableWrapper>

      <div className="projects-grid">
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
        .projects-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr));
          gap: 24px;
          align-items: stretch;
          width: min(100%, 1500px);
          margin: 48px auto 0;
        }

        .prj-card-wrapper { display: flex; flex-direction: column; flex: 1; height: 100%; }

        .prj-card {
          position: relative;
          display: flex;
          flex-direction: column;
          flex: 1;
          height: 100%;
          padding: 28px;
          background: var(--bg3);
          border: 1px solid var(--border);
          border-radius: 4px;
          overflow: hidden;
          transition: border-color .35s ease, transform .35s cubic-bezier(.34,1.56,.64,1), box-shadow .35s ease;
          --mx: 50%; --my: 50%;
        }

        .prj-spotlight {
          position: absolute; inset: 0; pointer-events: none; border-radius: inherit;
          opacity: 0; background: radial-gradient(200px circle at var(--mx) var(--my), rgba(0,255,136,0.07) 0%, transparent 70%);
          transition: opacity .3s ease; z-index: 0;
        }
        .prj-card:hover .prj-spotlight { opacity: 1; }

        .prj-scan {
          position: absolute; left: 0; right: 0; height: 2px;
          background: linear-gradient(90deg,transparent,rgba(0,255,136,0.5),transparent);
          top: -2px; pointer-events: none; z-index: 2; opacity: 0;
        }
        .prj-scan--active { opacity: 1; animation: prjScanLine 1.4s ease-out forwards; }
        @keyframes prjScanLine { 0%{top:0%;opacity:1} 80%{top:96%;opacity:1} 100%{top:100%;opacity:0} }

        .prj-corner { position:absolute; width:14px; height:14px; pointer-events:none; transition:border-color .35s,width .35s,height .35s; z-index:3; }
        .prj-corner--tl { top:8px;left:8px; border-top:1.5px solid rgba(0,255,136,0); border-left:1.5px solid rgba(0,255,136,0); }
        .prj-corner--br { bottom:8px;right:8px; border-bottom:1.5px solid rgba(0,255,136,0); border-right:1.5px solid rgba(0,255,136,0); }
        .prj-card:hover .prj-corner--tl,.prj-card:hover .prj-corner--br { width:20px;height:20px; border-color:rgba(0,255,136,0.7); }

        #projects .project-preview {
          position: relative;
          width: 100%;
          aspect-ratio: 16 / 6.2;
          min-height: 112px;
          max-height: 220px;
          margin: -8px 0 18px;
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

        @media (max-width: 900px)  { .projects-section { padding: 80px 24px !important; } }
        @media (max-width: 480px)  { .projects-section { padding: 60px 12px !important; } }
        @media (prefers-reduced-motion: reduce) { .projects-grid > * { opacity: 1 !important; transform: none !important; } }
      `}</style>
    </section>
  )
}
