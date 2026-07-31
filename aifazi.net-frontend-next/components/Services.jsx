'use client'
import { useCallback, useEffect, useRef } from 'react'
import { useReveal } from '../hooks/useReveal'
import { useSplitTextReveal } from '../hooks/useSplitTextReveal'
import { AnimatableWrapper, EditableList, EditableText } from '../context/EditContext'
import { IconDisplay, useLordiconScript } from './IconPicker'

const DEFAULT_SERVICES = [
  { icon: '🌐', title: 'Network Design & Architecture', desc: 'End-to-end design of enterprise LAN/WAN infrastructure. From IP addressing and routing protocols to redundancy planning and documentation.', features: ['OSPF / BGP / EIGRP', 'VLAN & QoS Design', 'Redundancy & Failover', 'Network Documentation'], accent: 'var(--green)' },
  { icon: '🔒', title: 'Security & Firewall', desc: 'Hardening your perimeter with enterprise-grade firewall deployment, VPN solutions, IDS/IPS configuration, and ongoing security audits.', features: ['Firewall Rule Optimization', 'IPSec / SSL VPN', 'IDS/IPS Deployment', 'Zero Trust Architecture'], accent: 'var(--red)' },
  { icon: '☁️', title: 'Cloud & Hybrid Infrastructure', desc: 'Seamless migration to cloud-hybrid models with AWS and Azure. Direct Connect, VPC design, and cloud-native security controls.', features: ['AWS / Azure Setup', 'Cloud Migration Planning', 'Hybrid Connectivity', 'Cost Optimization'], accent: 'var(--cyan)' },
  { icon: '🖥️', title: 'Server & Systems Administration', desc: 'Linux and Windows server deployment, Active Directory, virtualization stacks, and containerized application environments.', features: ['Linux / Windows Server', 'Docker & Virtualization', 'Active Directory', 'Backup & Recovery'], accent: 'var(--orange)' },
]

const SERVICE_FIELDS = [
  { key: 'icon', label: 'Icon (emoji)', type: 'emoji' },
  { key: 'title', label: 'Service Title' },
  { key: 'desc', label: 'Description', type: 'textarea' },
  { key: 'features', label: 'Features (comma separated)', type: 'tags' },
  { key: 'accent', label: 'Accent Color (CSS var or hex)', default: 'var(--cyan)' },
]

// Proper sub-component so hooks are called at component top level
function ServiceCard({ svc, i }) {
  const ref = useReveal()
  const cardRef = useRef(null)
  useLordiconScript()
  const accent = svc.accent || 'var(--cyan)'

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
    el.querySelector('.svc-scan')?.classList.add('svc-scan--active')
  }, [])
  const handleMouseLeave = useCallback(() => {
    const el = cardRef.current; if (!el) return
    el.style.borderColor = 'var(--border)'; el.style.transform = ''; el.style.boxShadow = ''
    el.querySelector('.svc-scan')?.classList.remove('svc-scan--active')
  }, [])

  return (
    <AnimatableWrapper
      animKey={`services.item.${i}`}
      label={`Services Card: ${svc.title || `Service ${i + 1}`}`}
      currentAnim="fadeUp 0.75s both"
      style={{ display: 'flex', flexDirection: 'column', flex: 1, height: '100%' }}
    >
      <div ref={ref} className="fade-up svc-card-wrapper" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div
          ref={cardRef}
          className="svc-card"
          onMouseMove={handleMouseMove}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <div className="svc-spotlight" />
          <div className="svc-scan" />
          <span className="svc-corner svc-corner--tl" />
          <span className="svc-corner svc-corner--br" />

          {/* Index + icon row */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18, position: 'relative', zIndex: 1 }}>
            <div style={{ width: 56, height: 56, border: '1px solid rgba(0,212,255,0.22)', background: 'rgba(0,212,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', borderRadius: 3 }}>
              <IconDisplay value={svc.icon} size={30} />
              <span style={{ position: 'absolute', bottom: -1, right: -1, width: 8, height: 8, background: accent, boxShadow: `0 0 10px ${accent}`, borderRadius: '50%' }} />
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', letterSpacing: 3, opacity: 0.5 }}>{String(i + 1).padStart(2, '0')}</span>
          </div>

          {/* Title — admin-editable inline */}
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 700, color: 'var(--text)', marginBottom: 10, lineHeight: 1.25, position: 'relative', zIndex: 1 }}>
            <EditableText contentKey={`service.${i}.title`} defaultValue={svc.title} />
          </div>

          {/* Description */}
          <p style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.7, marginBottom: 20, position: 'relative', zIndex: 1 }}>
            <EditableText contentKey={`service.${i}.desc`} defaultValue={svc.desc} multiline />
          </p>

          {/* Feature terminal list */}
          <div style={{ marginTop: 'auto', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 16, position: 'relative', zIndex: 1 }}>
            {(svc.features || []).map((f, fi) => (
              <div key={fi} style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text)', lineHeight: 1.9 }}>
                <span style={{ color: accent, fontSize: 12, flexShrink: 0 }}>›</span>
                <EditableText contentKey={`service.${i}.feature.${fi}`} defaultValue={f} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </AnimatableWrapper>
  )
}

export default function Services() {
  const headerRef = useReveal()
  const titleRef  = useSplitTextReveal({ staggerMs: 45, fromY: 28 })

  return (
    <section id="services" style={{ padding: '120px 60px', position: 'relative', zIndex: 1 }} className="services-section">
      <AnimatableWrapper animKey="services.header" label="Services Section Header" currentAnim="fadeUp 0.8s both">
        <div ref={headerRef} className="fade-up section-header">
          <span className="section-tag">04 /</span>
          <h2 ref={titleRef} className="section-title">Services</h2>
          <div className="section-line" />
        </div>
      </AnimatableWrapper>

      <div className="services-grid">
        <EditableList
          contentKey="services.items"
          defaultValue={DEFAULT_SERVICES}
          addLabel="+ Add Service"
          fields={SERVICE_FIELDS}
          renderItem={(svc, i) => <ServiceCard key={i} svc={svc} i={i} />}
        />
      </div>

      <style>{`
        .services-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 360px));
          gap: 24px;
          align-items: stretch;
          justify-content: center;
          width: min(100%, 1500px);
          margin: 48px auto 0;
        }

        .svc-card-wrapper { display: flex; flex-direction: column; flex: 1; height: 100%; }

        .svc-card {
          position: relative;
          display: flex;
          flex-direction: column;
          flex: 1;
          height: 100%;
          padding: 32px;
          background: var(--bg2);
          border: 1px solid var(--border);
          border-radius: 4px;
          overflow: hidden;
          transition: border-color .35s ease, transform .35s cubic-bezier(.34,1.56,.64,1), box-shadow .35s ease;
          --mx: 50%; --my: 50%;
        }

        .svc-spotlight {
          position: absolute; inset: 0; pointer-events: none; border-radius: inherit;
          opacity: 0; background: radial-gradient(200px circle at var(--mx) var(--my), rgba(0,255,136,0.07) 0%, transparent 70%);
          transition: opacity .3s ease; z-index: 0;
        }
        .svc-card:hover .svc-spotlight { opacity: 1; }

        .svc-scan {
          position: absolute; left: 0; right: 0; height: 2px;
          background: linear-gradient(90deg,transparent,rgba(0,255,136,0.5),transparent);
          top: -2px; pointer-events: none; z-index: 2; opacity: 0;
        }
        .svc-scan--active { opacity: 1; animation: svcScanLine 1.4s ease-out forwards; }
        @keyframes svcScanLine { 0%{top:0%;opacity:1} 80%{top:96%;opacity:1} 100%{top:100%;opacity:0} }

        .svc-corner { position:absolute; width:14px; height:14px; pointer-events:none; transition:border-color .35s,width .35s,height .35s; z-index:3; }
        .svc-corner--tl { top:8px;left:8px; border-top:1.5px solid rgba(0,255,136,0); border-left:1.5px solid rgba(0,255,136,0); }
        .svc-corner--br { bottom:8px;right:8px; border-bottom:1.5px solid rgba(0,255,136,0); border-right:1.5px solid rgba(0,255,136,0); }
        .svc-card:hover .svc-corner--tl,.svc-card:hover .svc-corner--br { width:20px;height:20px; border-color:rgba(0,255,136,0.7); }

        @media (max-width: 900px) { .services-section { padding: 80px 24px !important; } }
        @media (max-width: 480px)  { .services-section { padding: 60px 12px !important; } }
      `}</style>
    </section>
  )
}
