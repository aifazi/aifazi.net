import React, { useState, useEffect, useCallback } from 'react'
import api from '@/lib/api'
import { useNotify } from '../../core/notify.jsx'
import { useDialog } from '../../core/dialog.jsx'
import { CollectionBrowser, SessionsTab, MaintenancePanel, AuditLogTab, DbHealthTab } from '../DatabaseGUI'

const ago = (d) => {
  if (!d) return ''
  const s = Math.floor((Date.now() - new Date(d)) / 1000)
  if (s < 60) return `${s}s`; if (s < 3600) return `${Math.floor(s/60)}m`
  if (s < 86400) return `${Math.floor(s/3600)}h`; return `${Math.floor(s/86400)}d`
}

const fmt = (n) => (n ?? 0).toLocaleString()
const TabIcon = ({ text, active }) => (
  <span style={{
    display:'inline-flex', alignItems:'center', justifyContent:'center', minWidth:22, height:16,
    marginRight:7, padding:'0 4px', border:`1px solid ${active ? 'var(--primary,var(--cyan,#00d4ff))' : 'var(--border)'}`,
    color:active ? 'var(--primary,var(--cyan,#00d4ff))' : 'var(--muted)', fontSize:7, letterSpacing:0,
  }}>{text}</span>
)

function getToken() {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem('auth_token') || sessionStorage.getItem('admin_token') || sessionStorage.getItem('staff_token') || ''
}

function AuthLogTab() {
  const [logs, setLogs] = useState([]); const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1); const [loading, setLoading] = useState(false)

  const load = useCallback(async (p = 1) => {
    setLoading(true)
    try { const r = await api.get(`/admin/audit/auth-log?page=${p}&limit=50`); setLogs(r.data.logs || []); setTotal(r.data.total || 0) }
    catch { setLogs([]); setTotal(0) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load(page) }, [page])

  const pages = Math.ceil(total / 50) || 1
  const badge = (label, color) => (
    <span style={{ fontFamily:'var(--font-mono,monospace)', fontSize:8, letterSpacing:1, padding:'1px 7px', background:`${color}18`, border:`1px solid ${color}44`, color, borderRadius:3 }}>{label}</span>
  )

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <span style={{ fontFamily:'var(--font-mono,monospace)', fontSize:9, color:'var(--muted)', letterSpacing:2 }}>{total.toLocaleString()} AUTH EVENTS</span>
        <button onClick={() => load(page)} disabled={loading} style={{ fontFamily:'var(--font-mono,monospace)', fontSize:9, padding:'5px 12px', background:'transparent', color:'var(--cyan,#00d4ff)', border:'1px solid #1e2d45', cursor:loading?'not-allowed':'pointer' }}>{loading ? '..' : 'REFRESH'}</button>
      </div>
      {loading && !logs.length ? <div style={{ textAlign:'center', padding:40, fontFamily:'var(--font-mono,monospace)', fontSize:10, color:'var(--border)', letterSpacing:3 }}>LOADING..</div>
      : !logs.length ? <div style={{ textAlign:'center', padding:60, fontFamily:'var(--font-mono,monospace)', fontSize:10, color:'var(--border)' }}>No auth log entries yet</div>
      : <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
          {logs.map((entry, i) => {
            const reason = (entry.reason || '').toLowerCase()
            const evtLabel = reason.includes('2fa') ? '2FA' : reason.includes('refresh') ? 'REFRESH' : reason.includes('logout') ? 'LOGOUT' : reason.includes('suspend') ? 'BANNED' : entry.success !== false ? 'LOGIN' : 'FAILED'
            const evtColor = evtLabel === 'FAILED' || evtLabel === 'BANNED' ? 'var(--red,#ff4757)' : evtLabel === 'LOGOUT' ? 'var(--orange,#ff6b35)' : 'var(--green,#00ff88)'
            return (
              <div key={entry._id || i} style={{ display:'flex', gap:12, padding:'10px 14px', background:'var(--bg2)', border:'1px solid #0a1016', alignItems:'flex-start' }}>
                <span style={{ fontSize:12, flexShrink:0, marginTop:1, fontFamily:'var(--font-mono,monospace)', color:evtColor, fontWeight:700 }}>
                  {evtLabel === 'FAILED' ? '!!' : evtLabel === 'LOGIN' ? '>>' : evtLabel === 'LOGOUT' ? '<<' : '**'}
                </span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:2 }}>
                    <span style={{ fontFamily:'var(--font-mono,monospace)', fontSize:11, color:'var(--text)', fontWeight:700 }}>{entry.username || '-'}</span>
                    {badge(evtLabel, evtColor)}{entry.role ? badge(entry.role.toUpperCase(), 'var(--muted)') : null}
                    {entry.ip ? <span style={{ fontFamily:'var(--font-mono,monospace)', fontSize:9, color:'var(--cyan,#00d4ff)' }}>{entry.ip}</span> : null}
                  </div>
                  {entry.userAgent ? <div style={{ fontFamily:'var(--font-mono,monospace)', fontSize:9, color:'var(--muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{entry.userAgent}</div> : null}
                  {entry.reason ? <div style={{ fontFamily:'var(--font-mono,monospace)', fontSize:9, color:'var(--red,#ff4757)', marginTop:2 }}>{entry.reason}</div> : null}
                </div>
                <span style={{ fontFamily:'var(--font-mono,monospace)', fontSize:9, color:'var(--border)', flexShrink:0, whiteSpace:'nowrap' }}>{ago(entry.createdAt)}</span>
              </div>
            )
          })}
        </div>
      }
      {pages > 1 && (
        <div style={{ display:'flex', gap:8, marginTop:16, justifyContent:'center', alignItems:'center' }}>
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} style={{ fontFamily:'var(--font-mono,monospace)', fontSize:9, padding:'6px 14px', background:'var(--bg)', color:page<=1?'var(--border)':'var(--cyan,#00d4ff)', border:'1px solid #1e2d45', cursor:page<=1?'not-allowed':'pointer' }}>PREV</button>
          <span style={{ fontFamily:'var(--font-mono,monospace)', fontSize:9, color:'var(--border)' }}>Page {page} / {pages}</span>
          <button disabled={page >= pages} onClick={() => setPage(p => p + 1)} style={{ fontFamily:'var(--font-mono,monospace)', fontSize:9, padding:'6px 14px', background:'var(--bg)', color:page>=pages?'var(--border)':'var(--cyan,#00d4ff)', border:'1px solid #1e2d45', cursor:page>=pages?'not-allowed':'pointer' }}>NEXT</button>
        </div>
      )}
    </div>
  )
}

function SqlConsoleTab() {
  const [sql, setSql] = useState(''); const [results, setResults] = useState(null)
  const [error, setError] = useState(''); const [loading, setLoading] = useState(false)
  const [available, setAvailable] = useState(null); const { confirm } = useDialog()

  useEffect(() => { api.get('/admin/db/check').then(r => setAvailable(r.data.available)).catch(() => setAvailable(false)) }, [])

  const run = async () => {
    if (!sql.trim()) return
    const isDangerous = /^\s*(DROP|TRUNCATE|DELETE|ALTER|UPDATE)\b/i.test(sql.trim())
    if (isDangerous) {
      const ok = await confirm({ title:'Confirm Destructive Query', message:`This SQL appears to be a destructive operation:\n\n${sql.trim().slice(0,200)}\n\nAre you sure you want to execute it?`, variant:'danger', confirmLabel:'EXECUTE' })
      if (!ok) return
    }
    setLoading(true); setError(''); setResults(null)
    try { const r = await api.post('/admin/db/sql', { sql: sql.trim() }); setResults(r.data.data) }
    catch (e) { setError(e.response?.data?.detail || e.message || 'Query failed') }
    finally { setLoading(false) }
  }

  if (available === null) return <div style={{ textAlign:'center', padding:60, fontFamily:'var(--font-mono,monospace)', fontSize:10, color:'var(--border)', letterSpacing:3 }}>CHECKING CONSOLE STATUS..</div>
  if (available === false) return (
    <div style={{ maxWidth:700 }}>
      <div style={{ background:'rgba(255,200,0,0.05)', border:'1px solid rgba(255,200,0,0.3)', padding:20 }}>
        <div style={{ fontFamily:'var(--font-mono,monospace)', fontSize:10, letterSpacing:2, color:'#ffc800', marginBottom:12 }}>SQL CONSOLE NOT AVAILABLE</div>
        <div style={{ fontFamily:'var(--font-mono,monospace)', fontSize:11, color:'var(--muted)', lineHeight:1.8, marginBottom:16 }}>
          Run the <code style={{color:'var(--cyan)'}}>migration_db_console.sql</code> in Supabase SQL Editor first to create the <code style={{color:'var(--cyan)'}}>exec_sql</code> function.
        </div>
        <button onClick={() => navigator.clipboard.writeText("CREATE OR REPLACE FUNCTION exec_sql(sql_text text) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$ DECLARE result JSONB; BEGIN BEGIN EXECUTE format('SELECT COALESCE(json_agg(row_to_json(t)), ''[]''::json) FROM (%s) t', sql_text) INTO result; RETURN result; EXCEPTION WHEN OTHERS THEN BEGIN EXECUTE sql_text; RETURN json_build_object('ok', true)::jsonb; EXCEPTION WHEN OTHERS THEN RETURN json_build_object('error', SQLERRM)::jsonb; END; END; END; $$;")}
          style={{ fontFamily:'var(--font-mono,monospace)', fontSize:9, padding:'8px 16px', background:'rgba(0,212,255,0.1)', border:'1px solid rgba(0,212,255,0.3)', color:'var(--cyan,#00d4ff)', cursor:'pointer' }}>COPY SQL</button>
      </div>
    </div>
  )

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
        <span style={{ fontFamily:'var(--font-mono,monospace)', fontSize:9, color:'var(--muted)', letterSpacing:2 }}>SQL CONSOLE <span style={{color:'var(--green,#00ff88)',fontSize:8}}>ACTIVE</span></span>
        <span style={{ fontFamily:'var(--font-mono,monospace)', fontSize:8, color:'var(--border)', letterSpacing:1 }}>Ctrl+Enter to run</span>
      </div>
      <div style={{ background:'var(--bg2)', border:'1px solid #0f1a26', overflow:'hidden' }}>
        <div style={{ borderBottom:'1px solid #0f1a26' }}>
          <textarea value={sql} onChange={e => setSql(e.target.value)} placeholder='Enter SQL... e.g. SELECT * FROM users LIMIT 10'
            onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) run() }}
            style={{ width:'100%', minHeight:60, maxHeight:200, background:'var(--bg)', border:'none', color:'var(--text)', fontFamily:'var(--font-mono,monospace)', fontSize:11, padding:'10px 14px', outline:'none', resize:'vertical', boxSizing:'border-box' }} />
        </div>
        <div style={{ display:'flex', gap:6, padding:'6px 10px', alignItems:'center' }}>
          <button onClick={run} disabled={loading || !sql.trim()}
            style={{ padding:'5px 16px', background:loading?'var(--border)':'var(--cyan,#00d4ff)', color:'#000', fontFamily:'var(--font-mono,monospace)', fontSize:9, fontWeight:700, letterSpacing:1, border:'none', cursor:loading?'not-allowed':'pointer', opacity:!sql.trim()?0.4:1 }}>
            {loading ? 'RUNNING' : 'RUN'}
          </button>
          <span style={{ fontFamily:'var(--font-mono,monospace)', fontSize:8, color:'var(--border)' }}>{'>'}</span>
        </div>
        {error && <div style={{ padding:'10px 14px', background:'rgba(255,71,87,0.06)', borderTop:'1px solid #ff475730', fontFamily:'var(--font-mono,monospace)', fontSize:10, color:'var(--red,#ff4757)', lineHeight:1.6, whiteSpace:'pre-wrap' }}>{error}</div>}
        {results !== null && (
          <div style={{ borderTop:'1px solid #0f1a26', padding:14, maxHeight:500, overflow:'auto' }}>
            {Array.isArray(results) && results.length === 0 ? <div style={{ fontFamily:'var(--font-mono,monospace)', fontSize:10, color:'var(--border)', textAlign:'center', padding:20 }}>0 rows returned</div>
            : Array.isArray(results) ? (
              <div>
                <div style={{ fontFamily:'var(--font-mono,monospace)', fontSize:9, color:'var(--border)', marginBottom:10, letterSpacing:1 }}>{results.length.toLocaleString()} row{results.length !== 1 ? 's' : ''} returned</div>
                <div style={{ overflowX:'auto' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontFamily:'var(--font-mono,monospace)', fontSize:10 }}>
                    <thead>
                      <tr style={{ borderBottom:'1px solid #1e2d45' }}>
                        {Object.keys(results[0] || {}).slice(0, 12).map(k => <th key={k} style={{ padding:'5px 8px', textAlign:'left', color:'var(--muted)', fontSize:8, letterSpacing:2, whiteSpace:'nowrap' }}>{k.toUpperCase()}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {results.slice(0, 200).map((row, i) => (
                        <tr key={i} style={{ borderBottom:'1px solid #0a1016' }}>
                          {Object.entries(row).slice(0, 12).map(([k, v]) => (
                            <td key={k} style={{ padding:'5px 8px', color:'var(--muted)', maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                              {v === null || v === undefined ? <span style={{color:'var(--border)'}}>NULL</span> : typeof v === 'boolean' ? (v ? 'true' : 'false') : typeof v === 'object' ? JSON.stringify(v).slice(0, 60) : String(v).slice(0, 100)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {results.length > 200 && <div style={{ fontFamily:'var(--font-mono,monospace)', fontSize:9, color:'var(--border)', textAlign:'center', padding:'12px 0', letterSpacing:1 }}>Showing 200 of {results.length.toLocaleString()} rows</div>}
                </div>
              </div>
            ) : <div style={{ fontFamily:'var(--font-mono,monospace)', fontSize:11, color:'var(--green,#00ff88)' }}>{JSON.stringify(results)}</div>}
          </div>
        )}
      </div>
      <div style={{ marginTop:14, display:'flex', gap:8, flexWrap:'wrap' }}>
        {[
          { label:'SHOW TABLES', sql:"SELECT table_name, table_schema FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema') ORDER BY table_schema, table_name", color:'var(--cyan,#00d4ff)' },
          { label:'TABLE SIZES', sql:"SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size FROM pg_catalog.pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema') ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC LIMIT 20", color:'var(--green,#00ff88)' },
          { label:'ACTIVE CONNS', sql:"SELECT pid, state, left(query,80) as query, query_start::text FROM pg_stat_activity WHERE state != 'idle' ORDER BY query_start DESC LIMIT 20", color:'var(--yellow,#ffd700)' },
          { label:'LOCKED Q', sql:"SELECT pid, wait_event_type, wait_event, left(a.query,100) as query, a.state FROM pg_locks l JOIN pg_stat_activity a USING (pid) WHERE NOT granted AND a.state != 'idle' LIMIT 10", color:'var(--red,#ff4757)' },
        ].map(({ label, sql: presetSql, color }) => (
          <button key={label} onClick={() => setSql(presetSql)} style={{ padding:'5px 10px', background:`${color}10`, color, border:`1px solid ${color}33`, fontFamily:'var(--font-mono,monospace)', fontSize:8, letterSpacing:1, cursor:'pointer' }}>{label}</button>
        ))}
      </div>
    </div>
  )
}

function DbOverview() {
  const [stats, setStats] = useState(null); const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/admin/stats').then(r => setStats(r.data)).catch(() => {}).finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ textAlign:'center', padding:60, fontFamily:'var(--font-mono,monospace)', fontSize:10, color:'var(--border)', letterSpacing:3 }}>LOADING..</div>
  if (!stats) return <div style={{ textAlign:'center', padding:60, fontFamily:'var(--font-mono,monospace)', fontSize:10, color:'var(--border)' }}>No data available</div>

  const cards = [
    { label:'USERS', value:stats.counts?.users?.total, sub:`${stats.counts?.users?.verified||0} verified`, color:'var(--cyan,#00d4ff)' },
    { label:'POSTS', value:stats.counts?.posts?.total, sub:`${stats.counts?.posts?.published||0} published`, color:'var(--green,#00ff88)' },
    { label:'THREADS', value:stats.counts?.forum?.threads, sub:`${stats.counts?.forum?.replies||0} replies`, color:'var(--orange,#ff6b35)' },
    { label:'CHAT', value:stats.counts?.chat?.messages, sub:`${stats.counts?.chat?.rooms||0} rooms`, color:'var(--yellow,#ffd700)' },
    { label:'CONTACTS', value:stats.counts?.contacts, color:'var(--purple,#a78bfa)' },
    { label:'MEDIA', value:stats.counts?.media, color:'var(--muted)' },
    { label:'NEWSLETTER', value:stats.counts?.newsletter?.total, sub:`${stats.counts?.newsletter?.active||0} active`, color:'var(--green,#00ff88)' },
    { label:'STAFF', value:stats.counts?.staff, color:'var(--green,#00ff88)' },
  ]

  return (
    <div>
      <div style={{ fontFamily:'var(--font-mono,monospace)', fontSize:9, letterSpacing:3, color:'var(--border)', marginBottom:20 }}>DATABASE OVERVIEW</div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:10 }}>
        {cards.map(c => (
          <div key={c.label} style={{ background:'var(--bg2)', border:`1px solid ${c.color}18`, padding:'16px 18px' }}>
            <div style={{ fontFamily:'var(--font-mono,monospace)', fontSize:8, letterSpacing:2, color:'var(--muted)', marginBottom:6 }}>{c.label}</div>
            <div style={{ fontFamily:'var(--font-mono,monospace)', fontSize:24, fontWeight:700, color:c.color, lineHeight:1 }}>{fmt(c.value)}</div>
            {c.sub && <div style={{ fontFamily:'var(--font-mono,monospace)', fontSize:9, color:'var(--muted)', marginTop:6 }}>{c.sub}</div>}
          </div>
        ))}
      </div>
    </div>
  )
}

function BackupTab() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)
  const [downloadingJson, setDownloadingJson] = useState(false)
  const notify = useNotify()

  const [options, setOptions] = useState({
    schema: true,
    ifNotExists: true,
    data: false,
  })

  useEffect(() => {
    api.get('/admin/backup/stats').then(r => setStats(r.data)).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const downloadSql = async () => {
    if (!options.schema && !options.data) {
      notify.error('Select at least one option (Schema or Data)')
      return
    }
    setDownloading(true)
    try {
      let mode = 'full'
      if (options.schema && !options.data) mode = 'schema'
      else if (!options.schema && options.data) mode = 'data'
      const r = await api.get(`/admin/backup/export-sql?mode=${mode}&if_not_exists=${options.ifNotExists}`, { responseType: 'blob' })
      const url = URL.createObjectURL(r.data)
      const a = document.createElement('a')
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const label = mode === 'schema' ? 'template' : mode === 'data' ? 'data' : 'full'
      a.href = url; a.download = `aifazi-${label}-${ts}.sql`; a.click()
      URL.revokeObjectURL(url)
      notify.success(`SQL ${label} downloaded`)
    } catch { notify.error('SQL export failed') }
    finally { setDownloading(false) }
  }

  const downloadJson = async () => {
    setDownloadingJson(true)
    try {
      const r = await api.get('/admin/backup', { responseType: 'blob' })
      const url = URL.createObjectURL(r.data)
      const a = document.createElement('a')
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      a.href = url; a.download = `aifazi-backup-${ts}.json`; a.click()
      URL.revokeObjectURL(url)
      notify.success('JSON backup downloaded')
    } catch { notify.error('JSON backup failed') }
    finally { setDownloadingJson(false) }
  }

  const toggle = (key) => setOptions(o => ({ ...o, [key]: !o[key] }))

  return (
    <div style={{ maxWidth: 700 }}>
      <div style={{ fontFamily:'var(--font-mono,monospace)', fontSize:9, letterSpacing:3, color:'var(--border)', marginBottom:20 }}>DATABASE BACKUP &amp; EXPORT</div>

      {/* Collection stats */}
      <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', padding:'20px 24px', marginBottom:24 }}>
        <div style={{ fontFamily:'var(--font-mono,monospace)', fontSize:9, letterSpacing:2, color:'var(--muted)', marginBottom:14 }}>COLLECTION SNAPSHOT</div>
        {loading ? <div style={{ textAlign:'center', padding:20, fontFamily:'var(--font-mono,monospace)', fontSize:9, color:'var(--border)', letterSpacing:2 }}>LOADING..</div>
        : stats ? (
          <>
            <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:14, fontFamily:'var(--font-mono,monospace)', fontSize:10 }}>
              <span style={{ color:'var(--cyan,#00d4ff)' }}>{fmt(stats.tableCount || Object.keys(stats.collections || {}).length)} tables covered</span>
              <span style={{ color:Object.keys(stats.errors || {}).length ? 'var(--red,#ff4757)' : 'var(--green,#00ff88)' }}>
                {Object.keys(stats.errors || {}).length ? `${Object.keys(stats.errors || {}).length} table errors` : 'all counts readable'}
              </span>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))', gap:8, marginBottom:14 }}>
              {Object.entries(stats.collections || {}).map(([k, v]) => (
                <div key={k} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', fontFamily:'var(--font-mono,monospace)', fontSize:10, padding:'7px 10px', background:'var(--bg3)', border:'1px solid var(--border)' }}>
                  <span style={{ color:'var(--muted)', textTransform:'capitalize' }}>{k}</span>
                  <span style={{ color:'var(--green,#00ff88)', fontWeight:700 }}>{(v || 0).toLocaleString()}</span>
                </div>
              ))}
            </div>
            <div style={{ fontFamily:'var(--font-mono,monospace)', fontSize:11, color:'var(--cyan,#00d4ff)', padding:'10px 0', borderTop:'1px solid var(--border)' }}>
              Total records: <strong style={{ color:'var(--green,#00ff88)' }}>{(stats.totalRecords || 0).toLocaleString()}</strong>
            </div>
            {Object.keys(stats.errors || {}).length > 0 && (
              <div style={{ marginTop:10, fontFamily:'var(--font-mono,monospace)', fontSize:9, color:'var(--red,#ff4757)', lineHeight:1.6 }}>
                Failed count checks: {Object.keys(stats.errors).join(', ')}
              </div>
            )}
          </>
        ) : <div style={{ fontFamily:'var(--font-mono,monospace)', fontSize:11, color:'var(--muted)' }}>Could not load stats.</div>}
      </div>

      {/* SQL Export checklist */}
      <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', padding:'20px 24px', marginBottom:24 }}>
        <div style={{ fontFamily:'var(--font-mono,monospace)', fontSize:9, letterSpacing:3, color:'var(--muted)', marginBottom:16 }}>SQL EXPORT</div>
        <p style={{ fontFamily:'var(--font-mono,monospace)', fontSize:10, color:'var(--muted)', lineHeight:1.8, marginBottom:18 }}>
          Download an SQL file with the options selected below. Schema-only gives you an empty database template for source control.
        </p>

        <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:20 }}>
          {/* Schema checkbox */}
          <label style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer', padding:'8px 12px', background:'var(--bg3)', border:'1px solid var(--border)', userSelect:'none' }}
            onClick={() => toggle('schema')}>
            <input type="checkbox" checked={options.schema} onChange={() => {}} style={{ accentColor:'var(--green,#00ff88)', width:16, height:16, cursor:'pointer' }} />
            <div>
              <div style={{ fontFamily:'var(--font-mono,monospace)', fontSize:11, color:'var(--text)', fontWeight:600 }}>Schema</div>
              <div style={{ fontFamily:'var(--font-mono,monospace)', fontSize:9, color:'var(--muted)', marginTop:2 }}>
                CREATE TABLE statements {options.ifNotExists ? 'with IF NOT EXISTS' : 'without IF NOT EXISTS'}
              </div>
            </div>
          </label>

          {/* IF NOT EXISTS sub-option */}
          {options.schema && (
            <label style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer', padding:'6px 12px 6px 38px', userSelect:'none' }}
              onClick={() => toggle('ifNotExists')}>
              <input type="checkbox" checked={options.ifNotExists} onChange={() => {}} style={{ accentColor:'var(--cyan,#00d4ff)', width:14, height:14, cursor:'pointer' }} />
              <div style={{ fontFamily:'var(--font-mono,monospace)', fontSize:10, color:'var(--muted)' }}>
                Use <span style={{ color:'var(--cyan,#00d4ff)' }}>IF NOT EXISTS</span> (safer for migrations)
              </div>
            </label>
          )}

          {/* Data checkbox */}
          <label style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer', padding:'8px 12px', background:'var(--bg3)', border:'1px solid var(--border)', userSelect:'none' }}
            onClick={() => toggle('data')}>
            <input type="checkbox" checked={options.data} onChange={() => {}} style={{ accentColor:'var(--green,#00ff88)', width:16, height:16, cursor:'pointer' }} />
            <div>
              <div style={{ fontFamily:'var(--font-mono,monospace)', fontSize:11, color:'var(--text)', fontWeight:600 }}>Data</div>
              <div style={{ fontFamily:'var(--font-mono,monospace)', fontSize:9, color:'var(--muted)', marginTop:2 }}>INSERT INTO statements (passwords and secrets excluded)</div>
            </div>
          </label>
        </div>

        <div style={{ display:'flex', gap:4, marginBottom:6 }}>
          <span style={{ fontFamily:'var(--font-mono,monospace)', fontSize:8, color:'var(--muted)', letterSpacing:1 }}>
            {options.schema && options.data ? 'FULL EXPORT' : options.schema ? 'SCHEMA ONLY (empty template)' : options.data ? 'DATA ONLY' : 'NOTHING SELECTED'}
          </span>
        </div>

        <button onClick={downloadSql} disabled={downloading || (!options.schema && !options.data)}
          style={{
            width:'100%', padding:'14px 24px',
            background: downloading ? 'rgba(0,212,255,0.05)' : 'rgba(0,212,255,0.12)',
            border:`1px solid ${downloading ? 'rgba(0,212,255,0.2)' : 'rgba(0,212,255,0.5)'}`,
            color: downloading ? 'var(--muted)' : 'var(--cyan,#00d4ff)',
            fontFamily:'var(--font-mono,monospace)', fontSize:11, letterSpacing:2, fontWeight:700,
            cursor: downloading || (!options.schema && !options.data) ? 'not-allowed' : 'pointer',
            opacity: !options.schema && !options.data ? 0.4 : 1,
          }}>
          <span style={{ fontSize:11, marginRight:8 }}>[SQL]</span>
          {downloading ? 'GENERATING SQL...' : 'DOWNLOAD SQL'}
        </button>
      </div>

      {/* JSON Backup */}
      <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', padding:'20px 24px' }}>
        <div style={{ fontFamily:'var(--font-mono,monospace)', fontSize:9, letterSpacing:3, color:'var(--muted)', marginBottom:12 }}>JSON BACKUP</div>
        <p style={{ fontFamily:'var(--font-mono,monospace)', fontSize:10, color:'var(--muted)', lineHeight:1.8, marginBottom:16 }}>
          Full JSON export of all database collections. Useful for data migration or manual restoration.
        </p>
        <button onClick={downloadJson} disabled={downloadingJson}
          style={{
            width:'100%', padding:'14px 24px',
            background: downloadingJson ? 'rgba(0,255,136,0.05)' : 'rgba(0,255,136,0.12)',
            border:`1px solid ${downloadingJson ? 'rgba(0,255,136,0.2)' : 'rgba(0,255,136,0.5)'}`,
            color: downloadingJson ? 'var(--muted)' : 'var(--green,#00ff88)',
            fontFamily:'var(--font-mono,monospace)', fontSize:11, letterSpacing:2, fontWeight:700,
            cursor: downloadingJson ? 'not-allowed' : 'pointer',
          }}>
          <span style={{ fontSize:11, marginRight:8 }}>[JSON]</span>
          {downloadingJson ? 'GENERATING JSON...' : 'DOWNLOAD JSON BACKUP'}
        </button>
        <div style={{ marginTop:14, fontFamily:'var(--font-mono,monospace)', fontSize:8, color:'var(--border)', lineHeight:1.8, padding:'10px 14px', background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.06)' }}>
          Includes discovered public tables · Passwords, tokens and nested secrets redacted · Store securely
        </div>
      </div>
    </div>
  )
}

export default function DBMonitor() {
  const [activeTab, setActiveTab] = useState('overview')
  const token = getToken()
  const notify = useNotify()
  const toast = { add: (msg, type) => { if (type === 'error') notify.error(msg); else notify.success(msg) }, toasts: [], dismiss: () => {} }

  const tabs = [
    { id:'overview',    label:'OVERVIEW', icon:'OV' },
    { id:'tables',      label:'TABLES', icon:'TB' },
    { id:'console',     label:'SQL CONSOLE', icon:'SQL', dev: true },
    { id:'backup',      label:'BACKUP', icon:'BK' },
    { id:'audit',       label:'AUDIT LOG', icon:'AU' },
    { id:'authlog',     label:'AUTH LOG', icon:'ID' },
    { id:'sessions',    label:'SESSIONS', icon:'SE' },
    { id:'maintenance', label:'MAINTENANCE', icon:'MT' },
    { id:'health',      label:'HEALTH', icon:'OK' },
  ]

  return (
    <div style={{ flex:1, overflowY:'auto', background:'var(--bg)', display:'flex', flexDirection:'column' }}>
      <div style={{ borderBottom:'1px solid var(--border)', padding:'0 20px', overflowX:'auto', display:'flex', flexShrink:0, background:'var(--bg)' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            style={{ padding:'11px 16px', background:'transparent', color:activeTab===t.id?'var(--primary,var(--cyan,#00d4ff))':'var(--muted)', borderBottom:activeTab===t.id?'2px solid var(--primary,var(--cyan,#00d4ff))':'2px solid transparent', border:'none', cursor:'pointer', fontSize:9, letterSpacing:2, fontFamily:'var(--font-mono,monospace)', marginBottom:-1, whiteSpace:'nowrap' }}>
            <TabIcon text={t.icon} active={activeTab===t.id} />{t.label}
            {t.dev && <span style={{color:'var(--orange,#ff6b35)',fontSize:7,letterSpacing:1,marginLeft:4}}>DEV</span>}
          </button>
        ))}
      </div>
      <div style={{ flex:1, overflowY:'auto', padding:24 }}>
        {activeTab === 'overview' && <DbOverview />}
        {activeTab === 'tables' && <CollectionBrowser token={token} toast={toast} />}
        {activeTab === 'console' && <SqlConsoleTab />}
        {activeTab === 'backup' && <BackupTab />}
        {activeTab === 'audit' && <AuditLogTab token={token} />}
        {activeTab === 'authlog' && <AuthLogTab />}
        {activeTab === 'sessions' && <SessionsTab token={token} toast={toast} />}
        {activeTab === 'maintenance' && <MaintenancePanel token={token} toast={toast} onRefresh={() => {}} />}
        {activeTab === 'health' && <DbHealthTab token={token} toast={toast} />}
      </div>
    </div>
  )
}
