'use client'
import { useState, useEffect } from 'react'
import { useReveal } from '../hooks/useReveal'
import { EditableList, EditableText } from '../context/EditContext'
import api from '@/lib/api'

const DEFAULT_CERTS = [
  { code: 'CCNA', name: 'Cisco Certified Network Associate', issuer: 'Cisco', year: '2021', color: 'var(--cyan)', icon: '🌐', verified: true, verifyUrl: 'https://www.credly.com/org/cisco' },
  { code: 'NSE4', name: 'Network Security Expert Level 4', issuer: 'Fortinet', year: '2022', color: 'var(--orange)', icon: '🔒', verified: true, verifyUrl: 'https://training.fortinet.com/local/staticpage/view.php?page=certification_verification' },
  { code: 'AWS-SAA', name: 'Solutions Architect Associate', issuer: 'Amazon Web Services', year: '2023', color: '#FF9900', icon: '☁️', verified: true, verifyUrl: 'https://www.credly.com/org/amazon-web-services' },
  { code: 'LPI-1', name: 'Linux Professional Institute 1', issuer: 'LPI', year: '2020', color: 'var(--green)', icon: '🐧', verified: true, verifyUrl: 'https://cs.lpi.org/caf/Xamman/certification' },
  { code: 'eJPT', name: 'Junior Penetration Tester', issuer: 'eLearnSecurity', year: '2023', color: 'var(--red)', icon: '🛡️', verified: true, verifyUrl: 'https://my.ine.com/verify' },
  { code: 'MTCNA', name: 'MikroTik Certified Network Associate', issuer: 'MikroTik', year: '2022', color: 'var(--cyan)', icon: '📡', verified: true, verifyUrl: 'https://mikrotik.com/training/certificates' },
]

const CERT_FIELDS = [
  { key: 'code', label: 'Cert Code (e.g. CCNA)' },
  { key: 'icon', label: 'Icon (emoji)', type: 'emoji' },
  { key: 'name', label: 'Full Certification Name' },
  { key: 'issuer', label: 'Issuing Organization' },
  { key: 'year', label: 'Year Obtained' },
  { key: 'color', label: 'Accent Color (CSS var or hex)' },
]

// Proper sub-component so useReveal hook is called at component top level (not inside a callback)
function CertCard({ cert, i }) {
  const ref = useReveal()
  const color = cert.color || 'var(--cyan)'
  return (
    <div ref={ref} className="fade-up"
      style={{ background: 'var(--bg3)', border: '1px solid var(--border)', padding: '28px 24px', position: 'relative', overflow: 'hidden', transition: 'border-color 0.3s, transform 0.3s' }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = color; e.currentTarget.style.transform = 'translateY(-4px)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'translateY(0)' }}
    >
      <div style={{ position: 'absolute', right: -10, bottom: -16, fontFamily: 'var(--font-mono)', fontSize: 56, fontWeight: 700, color, opacity: 0.04, pointerEvents: 'none', letterSpacing: -2 }}>{cert.code}</div>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${color}, transparent)` }} />
      <div style={{ fontSize: 28, marginBottom: 16 }}>{cert.icon}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 3, color, marginBottom: 8 }}>
        <EditableText contentKey={`cert.${i}.code`} defaultValue={cert.code} />
      </div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--text)', lineHeight: 1.3, marginBottom: 8 }}>
        <EditableText contentKey={`cert.${i}.name`} defaultValue={cert.name} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', letterSpacing: 1 }}>
          <EditableText contentKey={`cert.${i}.issuer`} defaultValue={cert.issuer} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {cert.verifyUrl ? (
            <a href={cert.verifyUrl} target="_blank" rel="noopener noreferrer"
              style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 1, color: 'var(--green)', padding: '2px 6px', border: '1px solid rgba(0,255,136,0.3)', background: 'rgba(0,255,136,0.06)', textDecoration: 'none', transition: 'all 0.2s' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,255,136,0.15)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(0,255,136,0.06)' }}
            >✓ VERIFY ↗</a>
          ) : (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 1, color: 'var(--green)', padding: '2px 6px', border: '1px solid rgba(0,255,136,0.3)', background: 'rgba(0,255,136,0.06)' }}>✓ VERIFIED</span>
          )}
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)' }}>
            <EditableText contentKey={`cert.${i}.year`} defaultValue={cert.year} />
          </span>
        </div>
      </div>
    </div>
  )
}

export default function Certifications() {
  const headerRef = useReveal()
  const [certs, setCerts] = useState(DEFAULT_CERTS)

  useEffect(() => {
    api.get('/portfolio/certifications').then(r => {
      if (r.data?.length) setCerts(r.data)
    }).catch(() => {})
  }, [])

  return (
    <section id="certifications" style={{ padding: '120px 60px', background: 'var(--bg2)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', position: 'relative', zIndex: 1 }} className="certs-section">
      <div ref={headerRef} className="fade-up section-header">
        <span className="section-tag">05 /</span>
        <h2 className="section-title">Certifications</h2>
        <div className="section-line" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 2 }} className="certs-grid">
        <EditableList
          contentKey="certs.items"
          defaultValue={certs}
          addLabel="+ Add Certification"
          fields={CERT_FIELDS}
          renderItem={(cert, i) => <CertCard key={i} cert={cert} i={i} />}
        />
      </div>

      <style>{`
        @media (max-width: 900px) { .certs-section { padding: 80px 20px !important; } }
        @media (max-width: 480px)  { .certs-grid { grid-template-columns: 1fr !important; } }
      `}</style>
    </section>
  )
}
