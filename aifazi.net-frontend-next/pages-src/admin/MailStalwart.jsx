'use client'
import React, { useState, useEffect, useCallback } from 'react'
import api from '@/lib/api'
import { useToast } from '../../components/Toast'
import { useDialog } from '../../components/Dialog'
import { Btn as KitBtn, EmptyState } from './ui'

const MONO = "var(--font-mono,'JetBrains Mono',monospace)"

/** Stalwart queue inspector — proxies the self-hosted Stalwart MTA queue via
 *  GET/POST /admin/mail/stalwart. Unreachable/unconfigured backends render a
 *  friendly state, never a crash. */
export default function MailStalwart() {
  const toast = useToast()
  const { confirm } = useDialog()
  const [queue, setQueue] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [acting, setActing] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await api.get('/admin/mail/stalwart/queue')
      setQueue(r.data?.queue || [])
    } catch (e) {
      setQueue([])
      setError(e.response?.data?.detail || e.message || 'Failed to load Stalwart queue')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(load, 0)
    return () => clearTimeout(t)
  }, [load])

  const act = async (queueId, action) => {
    // P2-2 — bulk retry affects the whole visible queue: confirm first.
    if (action === 'retry' && queue.length > 5) {
      const ok = await confirm({
        title: 'Retry queued messages',
        message: `Re-queue ${queue.length} messages now? They will all be retried immediately.`,
        variant: 'warning',
        confirmLabel: 'RETRY ALL',
      })
      if (!ok) return
    }
    if (action === 'drop') {
      const ok = await confirm({
        title: 'Drop queued message',
        message: `Permanently drop queued message ${queueId}? It will never be delivered. This cannot be undone.`,
        variant: 'danger',
        confirmLabel: 'DROP',
      })
      if (!ok) return
    }
    setActing(queueId + action)
    try {
      const r = await api.post('/admin/mail/stalwart/queue/action', { queueId, action, confirm: true })
      if (r.data?.ok) {
        toast.success(`${action === 'retry' ? 'Re-queued' : 'Dropped'} ${queueId}`, { title: 'Stalwart' })
        load()
      } else {
        toast.error(r.data?.error || `${action} failed`, { title: 'Stalwart' })
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || `${action} failed`, { title: 'Stalwart' })
    } finally {
      setActing(null)
    }
  }

  const fmtTs = ts => { if (!ts) return '—'; try { return new Date(ts).toLocaleString() } catch { return ts } }
  const unreachable = error && /unreachable|not configured|Failed to load/i.test(error)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 3, color: 'var(--cyan)' }}>STALWART QUEUE</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Self-hosted MTA queue — retry re-queues now, drop discards permanently (audited).</div>
        </div>
        <button onClick={load} style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 1, padding: '8px 14px', cursor: 'pointer', background: 'transparent', color: 'var(--cyan)', border: '1px solid rgba(34,211,238,0.27)', borderRadius: 8, fontWeight: 700 }}>↻ REFRESH</button>
      </div>

      {loading ? <div className="loader" />
        : error ? (
          <div style={{ textAlign: 'center', padding: 40, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10 }}>
            <div style={{ fontSize: 30, marginBottom: 10 }}>{unreachable ? '📡' : '⚠️'}</div>
            <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 2, color: 'var(--text)' }}>
              {unreachable ? 'STALWART UNREACHABLE' : 'STALWART ERROR'}
            </div>
            <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--muted)', marginTop: 8, maxWidth: 480, margin: '8px auto 0' }}>{error}</div>
          </div>
        )
        : queue.length === 0 ? <EmptyState icon="📭" title="Queue empty" hint="No messages waiting in the Stalwart queue." />
        : (
          <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 10 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: MONO, fontSize: 11 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg2)' }}>
                  {['QUEUE ID', 'FROM', 'TO', 'NEXT RETRY', 'EXPIRES', 'ACTIONS'].map(h => (
                    <th key={h} style={{ padding: '9px 12px', textAlign: 'left', color: 'var(--muted)', fontSize: 8, letterSpacing: 2 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {queue.map(m => (
                  <tr key={m.queueId} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '9px 12px', color: 'var(--text)', fontWeight: 700 }}>{m.queueId}</td>
                    <td style={{ padding: '9px 12px', color: 'var(--muted)' }}>{m.from || '—'}</td>
                    <td style={{ padding: '9px 12px', color: 'var(--muted)' }}>{m.to || '—'}</td>
                    <td style={{ padding: '9px 12px', color: 'var(--muted)' }}>{fmtTs(m.nextRetry)}</td>
                    <td style={{ padding: '9px 12px', color: 'var(--muted)' }}>{fmtTs(m.expires)}</td>
                    <td style={{ padding: '9px 12px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <KitBtn variant="outline" small color="var(--green)" disabled={acting === m.queueId + 'retry'} onClick={() => act(m.queueId, 'retry')}>RETRY</KitBtn>
                        <KitBtn variant="outline" small color="#ff4757" disabled={acting === m.queueId + 'drop'} onClick={() => act(m.queueId, 'drop')}>DROP</KitBtn>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </div>
  )
}
