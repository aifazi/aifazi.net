'use client'
import { useState, useEffect } from 'react'
import api from '@/lib/api'
import { useToast } from '../../../components/Toast'
import { useIsMobile } from '../shared'

// Split out of AdminPanels.jsx - backup status.
function BackupPanel() {
  const [stats, setStats]       = useState(null)
  const [loading, setLoading]   = useState(true)
  const [downloading, setDownloading] = useState(false)
  const toast = useToast()
  const isMobile = useIsMobile()

  useEffect(() => {
    api.get('/admin/backup/stats').then(r => setStats(r.data)).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const download = async () => {
    setDownloading(true)
    try {
      const r = await api.get('/admin/backup', { responseType: 'blob' })
      const url = URL.createObjectURL(r.data)
      const a = document.createElement('a')
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      a.href = url; a.download = `aifazi-backup-${ts}.json`; a.click()
      URL.revokeObjectURL(url)
      toast.success('Backup downloaded successfully', { title: 'Backup' })
    } catch { toast.error('Backup failed', { title: 'Error' }) }
    finally { setDownloading(false) }
  }

  return (
    <div style={{ padding: isMobile ? 16 : 32, maxWidth: 640 }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--cyan)', letterSpacing: 4, marginBottom: 6 }}>SYSTEM</div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: isMobile ? 22 : 28, fontWeight: 700, margin: 0 }}>Backup</h2>
        <p style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: 11, marginTop: 6, lineHeight: 1.7 }}>Export a full JSON backup of all database collections. The file can be used to restore data or migrate to another server.</p>
      </div>

      {/* Collection stats */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', padding: '20px 24px', marginBottom: 20 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 3, color: 'var(--muted)', marginBottom: 16 }}>DATABASE SNAPSHOT</div>
        {loading ? <div className="loader" /> : stats ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
              {Object.entries(stats.collections || {}).map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 11, padding: '8px 12px', background: 'var(--bg3)', border: '1px solid var(--border)' }}>
                  <span style={{ color: 'var(--muted)', textTransform: 'capitalize' }}>{k}</span>
                  <span style={{ color: 'var(--green)', fontWeight: 700 }}>{(v || 0).toLocaleString()}</span>
                </div>
              ))}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--cyan)', padding: '10px 0', borderTop: '1px solid var(--border)' }}>
              Total records: <strong style={{ color: 'var(--green)' }}>{(stats.totalRecords || 0).toLocaleString()}</strong>
            </div>
          </>
        ) : <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>Could not load stats.</div>}
      </div>

      {/* Download button */}
      <button onClick={download} disabled={downloading} style={{
        width: '100%', padding: '16px 24px',
        background: downloading ? 'color-mix(in srgb, var(--green) 5%, transparent)' : 'color-mix(in srgb, var(--green) 12%, transparent)',
        border: `1px solid ${downloading ? 'color-mix(in srgb, var(--green) 20%, transparent)' : 'color-mix(in srgb, var(--green) 50%, transparent)'}`,
        color: downloading ? 'var(--muted)' : 'var(--green)',
        fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: 2, fontWeight: 700,
        cursor: downloading ? 'not-allowed' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
        transition: 'all 0.2s',
      }}>
        <span style={{ fontSize: 18 }}>💾</span>
        {downloading ? 'GENERATING BACKUP' : 'DOWNLOAD FULL BACKUP (.json)'}
      </button>

      <div style={{ marginTop: 16, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', lineHeight: 1.8, padding: '12px 16px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
        ✅ Backup includes: Posts  Forum Users  Threads  Replies  Contact Messages<br/>
        🔒 Passwords are excluded from the user export for security.<br/>
        🚨 Store your backup file securely  it contains sensitive data.
      </div>
    </div>
  )
}

export { BackupPanel }
