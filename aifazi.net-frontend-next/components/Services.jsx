'use client'
import { useEffect, useRef } from 'react'
import { useReveal } from '../hooks/useReveal'
import { useSplitTextReveal } from '../hooks/useSplitTextReveal'
import { EditableList, EditableText } from '../context/EditContext'
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
  const ref = useRef()
  useLordiconScript()
  const accent = svc.accent || 'var(--cyan)'

  useEffect(() => {
    const el = ref.current; if (!el) return
    el.style.opacity = '0'
    el.style.transform = 'translateY(36px)'
    let ctx
    Promise.all([
      import('gsap').then(m => m.gsap),
      import('gsap/ScrollTrigger').then(m => m.ScrollTrigger),
    ]).then(([gsap, ScrollTrigger]) => {
      if (!el) return
      gsap.registerPlugin(ScrollTrigger)
      ctx = gsap.context(() => {
        gsap.fromTo(el,
          { opacity: 0, y: 36 },
          {
            opacity: 1,
            y: 0,
            duration: 0.7,
            delay: i * 0.12,
            ease: 'expo.out',
            scrollTrigger: { trigger: el, start: 'top bottom', once: true },
          }
        )
      })
    }).catch(() => {
      if (el) { el.style.opacity = '1'; el.style.transform = 'none' }
    })
    return () => { try { ctx?.revert() } catch {} }
  }, [i])
  return (
    <div ref={ref}
      style={{ background: 'var(--bg2)', border: '1px solid var(--border)', padding: '40px 36px', position: 'relative', overflow: 'hidden', transition: 'border-color 0.3s, transform 0.3s' }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = accent; e.currentTarget.style.transform = 'translateY(-4px)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'translateY(0)' }}
    >
      <div style={{ position: 'absolute', top: 0, left: 0, width: 60, height: 60, background: `linear-gradient(135deg, ${accent}18, transparent 60%)` }} />
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${accent}, transparent)` }} />
      <div style={{ fontSize: 36, marginBottom: 20 }}><IconDisplay value={svc.icon} size={36} /></div>
      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: 'var(--text)', marginBottom: 12, lineHeight: 1.2 }}>
        <EditableText contentKey={`service.${i}.title`} defaultValue={svc.title} />
      </h3>
      <p style={{ color: 'var(--muted)', fontSize: 15, lineHeight: 1.7, marginBottom: 24 }}>
        <EditableText contentKey={`service.${i}.desc`} defaultValue={svc.desc} multiline />
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {(svc.features || []).map((f, fi) => (
          <div key={fi} style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text)' }}>
            <span style={{ color: accent, fontSize: 14 }}>→</span>
            <EditableText contentKey={`service.${i}.feature.${fi}`} defaultValue={f} />
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Services() {
  const headerRef = useReveal()
  const titleRef  = useSplitTextReveal({ staggerMs: 45, fromY: 28 })

  return (
    <section id="services" style={{ padding: '120px 60px', position: 'relative', zIndex: 1 }} className="services-section">
      <div ref={headerRef} className="fade-up section-header">
        <span className="section-tag">04 /</span>
        <h2 ref={titleRef} className="section-title">Services</h2>
        <div className="section-line" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 2 }} className="services-grid">
        <EditableList
          contentKey="services.items"
          defaultValue={DEFAULT_SERVICES}
          addLabel="+ Add Service"
          fields={SERVICE_FIELDS}
          renderItem={(svc, i) => <ServiceCard key={i} svc={svc} i={i} />}
        />
      </div>

      <style>{`/* responsive handled by globals.css */`}</style>
    </section>
  )
}
