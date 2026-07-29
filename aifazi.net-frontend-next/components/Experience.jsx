'use client'
import { useEffect, useRef } from 'react'
import { useReveal } from '../hooks/useReveal'
import { useSplitTextReveal } from '../hooks/useSplitTextReveal'
import { EditableList, EditableText } from '../context/EditContext'

const DEFAULT_EXPERIENCE = [
  { period: '2023 — Present', role: 'IT Infrastructure Manager (AMC Lead)', company: 'Al Qattara', desc: 'Overseeing the full IT asset register and AMC scope for Al Qattara. Managing critical infrastructure including VMware clusters, Cisco core switches, and Azure cloud resources. Leading major upgrades from EOL hardware to modern enterprise solutions.', tags: ['Infrastructure', 'AMC Management', 'Vendor Coordination', 'Azure'], active: true },
  { period: '2022 — 2023', role: 'Senior Network Engineer', company: 'Self-Employed / Freelance', desc: 'Designing and deploying enterprise network infrastructure for clients across multiple industries. Specializing in firewall hardening, VPN architecture, and cloud migrations.', tags: ['Cisco', 'FortiGate', 'AWS', 'Docker'], active: false },
  { period: '2020 — 2022', role: 'IT Infrastructure Specialist', company: 'Regional ISP', desc: 'Managed BGP backbone, implemented QoS policies, and maintained 99.9% uptime across a regional ISP network serving 50,000+ subscribers.', tags: ['BGP', 'MikroTik', 'Linux', 'OSPF'], active: false },
  { period: '2018 — 2020', role: 'Network Administrator', company: 'Enterprise Technology Firm', desc: 'Administered Cisco-based LAN/WAN infrastructure, deployed VLAN segmentation across 3 offices, and led migration from legacy systems to virtualized stack.', tags: ['Cisco IOS', 'VMware', 'Windows Server', 'AD'], active: false },
]

const EXP_FIELDS = [
  { key: 'period', label: 'Period (e.g. 2022 — Present)' },
  { key: 'role', label: 'Job Title' },
  { key: 'company', label: 'Company Name' },
  { key: 'desc', label: 'Description', type: 'textarea' },
  { key: 'tags', label: 'Tags (comma separated)', type: 'tags' },
]

// Proper sub-component so hooks are called at component top level (not inside a callback)
function ExperienceItem({ job, i }) {
  const ref = useRef()

  useEffect(() => {
    const el = ref.current; if (!el) return
    let ctx
    Promise.all([
      import('gsap').then(m => m.gsap),
      import('gsap/ScrollTrigger').then(m => m.ScrollTrigger),
    ]).then(([gsap, ScrollTrigger]) => {
      if (!el) return
      gsap.registerPlugin(ScrollTrigger)
      ctx = gsap.context(() => {
        gsap.from(el, {
          opacity: 0,
          x: -32,
          duration: 0.7,
          delay: i * 0.1,
          ease: 'expo.out',
          scrollTrigger: { trigger: el, start: 'top bottom', once: true },
        })
      })
    }).catch(() => {
      el.style.opacity = '1'
      el.style.transform = 'none'
    })
    return () => ctx?.revert()
  }, [i])
  return (
    <div ref={ref} style={{ paddingLeft: 48, paddingBottom: 56, position: 'relative' }}>
      <div style={{ position: 'absolute', left: -6, top: 4, width: 13, height: 13, borderRadius: '50%', background: job.active ? 'var(--green)' : 'var(--bg3)', border: `2px solid ${job.active ? 'var(--green)' : 'rgba(0,212,255,0.3)'}`, boxShadow: job.active ? '0 0 12px rgba(0,255,136,0.6)' : 'none' }} />
      {job.active && <div style={{ position: 'absolute', left: -11, top: -1, width: 23, height: 23, borderRadius: '50%', border: '1px solid rgba(0,255,136,0.3)', animation: 'glow-pulse 2s ease-in-out infinite' }} />}

      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', padding: '28px 32px', transition: 'border-color 0.3s' }}
        onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(0,255,136,0.3)'}
        onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 700, color: 'var(--text)' }}>
              <EditableText contentKey={`exp.${i}.role`} defaultValue={job.role} />
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--cyan)', letterSpacing: 1, marginTop: 2 }}>
              <EditableText contentKey={`exp.${i}.company`} defaultValue={job.company} />
            </div>
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2, color: job.active ? 'var(--green)' : 'var(--muted)', padding: '4px 10px', border: `1px solid ${job.active ? 'rgba(0,255,136,0.3)' : 'var(--border)'}`, background: job.active ? 'rgba(0,255,136,0.06)' : 'transparent', height: 'fit-content' }}>
            <EditableText contentKey={`exp.${i}.period`} defaultValue={job.period} />
          </div>
        </div>
        <p style={{ color: 'var(--muted)', fontSize: 15, lineHeight: 1.7, margin: '16px 0' }}>
          <EditableText contentKey={`exp.${i}.desc`} defaultValue={job.desc} multiline />
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(job.tags || []).map(t => <span key={t} className="tag">{t}</span>)}
        </div>
      </div>
    </div>
  )
}

export default function Experience() {
  const headerRef = useReveal()
  const titleRef  = useSplitTextReveal({ staggerMs: 45, fromY: 28 })
  const lineRef   = useRef()

  // Animate the vertical timeline line drawing in with GSAP ScrollTrigger scrub
  useEffect(() => {
    const el = lineRef.current; if (!el) return
    let ctx
    Promise.all([
      import('gsap').then(m => m.gsap),
      import('gsap/ScrollTrigger').then(m => m.ScrollTrigger),
    ]).then(([gsap, ScrollTrigger]) => {
      if (!el) return
      gsap.registerPlugin(ScrollTrigger)
      ctx = gsap.context(() => {
        gsap.from(el, {
          scaleY: 0,
          transformOrigin: 'top',
          ease: 'none',
          scrollTrigger: {
            trigger: el,
            start: 'top bottom',
            end: 'bottom top',
            scrub: true,
          },
        })
      })
    }).catch(() => {
      el.style.transform = 'scaleY(1)'
    })
    return () => ctx?.revert()
  }, [])

  return (
    <section id="experience" style={{ padding: '120px 60px', position: 'relative', zIndex: 1 }}>
      <div ref={headerRef} className="fade-up section-header">
        <span className="section-tag">02 /</span>
        <h2 ref={titleRef} className="section-title">Experience</h2>
        <div className="section-line" />
      </div>

      <div style={{ position: 'relative', maxWidth: 900, margin: '0 auto' }}>
        {/* Animated vertical timeline line */}
        <div ref={lineRef} style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 1, background: 'linear-gradient(to bottom, var(--green), var(--cyan), transparent)', opacity: 0.25, transformOrigin: 'top' }} />

        <EditableList
          contentKey="experience.items"
          defaultValue={DEFAULT_EXPERIENCE}
          addLabel="+ Add Position"
          fields={EXP_FIELDS}
          renderItem={(job, i) => <ExperienceItem key={i} job={job} i={i} />}
        />
      </div>

      <style>{`/* responsive handled by globals.css */`}</style>
    </section>
  )
}
