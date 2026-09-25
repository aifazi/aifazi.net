'use client'
// dbGuiTabs.jsx — DatabaseGUI status/newsletter/audit/sessions tabs (extracted).
import { useState, useEffect, useRef } from 'react'
import { useDialog } from '../core/dialog.jsx'
import api from '../lib/api'
import { Btn, StatCard, MiniChart, FeedRow, ap, authCfg, ago, fmt } from './dbGuiParts'

function DbHealthTab({ token, toast }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState("");
  const { confirm } = useDialog();

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get(ap(`/api/admin/db/health`), authCfg(token));
      const h = res.data || {};
      setData({ health: true, sizes: h.sizes || [], slowQueriesNew: h.slow_queries || [], pgss: h.pg_stat_statements !== false });
      return;
    } catch {}
    try {
      const res = await api.get(ap(`/api/admin/stats/db-health`), authCfg(token));
      setData(res.data);
    } catch(e) {
      // Fallback: pull what we can from /api/admin/stats
      try {
        const r2 = await api.get(ap(`/api/admin/stats`), authCfg(token));
        const s = r2.data;
        setData({ fallback: true, counts: s.counts, uptime: s.uptime });
      } catch {}
    }
    finally { setLoading(false); }
  };

  const runAction = async (label, path) => {
    const ok = await confirm({ title: label, message: 'This maintenance operation may be irreversible. Proceed?', variant: 'warning', confirmLabel: 'RUN' });
    if (!ok) return;
    setBusy(label);
    try {
      const d = await adminAction(token, path);
      toast.add(d.message || `${label} completed`);
      load();
    } catch(e) { toast.add(e.message,"error"); }
    finally { setBusy(""); }
  };

  useEffect(() => { void (async () => { await load() })() }, []);

  const bytes = (b) => {
    if (!b) return "-";
    if (b < 1024) return `${b} B`;
    if (b < 1048576) return `${(b/1024).toFixed(1)} KB`;
    if (b < 1073741824) return `${(b/1048576).toFixed(1)} MB`;
    return `${(b/1073741824).toFixed(2)} GB`;
  };

  const pct = (used, total) => total ? Math.round((used/total)*100) : 0;

  return (
    <div style={{ maxWidth:900 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, letterSpacing:3, color:"var(--border)" }}>DATABASE HEALTH &amp; METRICS</div>
        <button onClick={load} disabled={loading} style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, padding:"6px 14px", background:"transparent", color:"var(--cyan,var(--cyan))", border:"1px solid #1e2d45", cursor:"pointer" }}>
          {loading ? "LOADING..." : "REFRESH"}
        </button>
      </div>

      {loading && !data && <div style={{ textAlign:"center", padding:60, fontFamily:"var(--font-mono,monospace)", fontSize: 11, color:"var(--border)", letterSpacing:3 }}>FETCHING METRICS...</div>}

      {data && (
        <div style={{ display:"grid", gap:16 }}>

          {/* Table sizes (top 20) from /api/admin/db/health */}
          {data.health && data.sizes && (
            <div style={{ background:"var(--bg2)", border:"1px solid #0f1a26", padding:24 }}>
              <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, letterSpacing:3, color:"var(--border)", marginBottom:16 }}>TABLE SIZES · TOP 20</div>
              {data.sizes.length === 0
                ? <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize:11, color:"var(--muted)" }}>No size data.</div>
                : <div style={{ overflowX:"auto" }}>
                    <table style={{ width:"100%", borderCollapse:"collapse", fontFamily:"var(--font-mono,monospace)", fontSize:11 }}>
                      <thead>
                        <tr style={{ borderBottom:"1px solid #1e2d45" }}>
                          {["TABLE","SCHEMA","SIZE"].map(h => <th key={h} style={{ padding:"7px 10px", textAlign:"left", color:"var(--muted)", fontSize: 11, letterSpacing:2 }}>{h}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {data.sizes.map((t, i) => (
                          <tr key={i} style={{ borderBottom:"1px solid #0a1016" }}>
                            <td style={{ padding:"8px 10px", color:"var(--text)" }}>{t.table}</td>
                            <td style={{ padding:"8px 10px", color:"var(--muted)" }}>{t.schema}</td>
                            <td style={{ padding:"8px 10px", color:"var(--green,var(--green))" }}>{bytes(t.size_bytes)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>}
            </div>
          )}

          {/* Slow queries from /api/admin/db/health */}
          {data.health && (
            <div style={{ background:"var(--bg2)", border:"1px solid #0f1a26", padding:24 }}>
              <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, letterSpacing:3, color:"var(--border)", marginBottom:16 }}>SLOW QUERIES</div>
              {!data.pgss
                ? <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize:11, color:"var(--muted)" }}>pg_stat_statements not installed — sizes above still work.</div>
                : !data.slowQueriesNew || data.slowQueriesNew.length === 0
                  ? <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize:11, color:"var(--muted)" }}>No slow-query data.</div>
                  : data.slowQueriesNew.map((q, i) => (
                      <div key={i} style={{ display:"grid", gridTemplateColumns:"1fr 90px 80px", gap:12, padding:"8px 0", borderBottom:"1px solid #0a1016", fontFamily:"var(--font-mono,monospace)", fontSize: 11 }}>
                        <span style={{ color:"var(--muted)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }} title={q.query}>{q.query}</span>
                        <span style={{ color:"var(--red,var(--red))" }}>{q.mean_ms}ms</span>
                        <span style={{ color:"var(--muted)" }}>×{q.calls}</span>
                      </div>
                    ))}
            </div>
          )}

          {/* Storage */}
          {(data.storage || data.counts) && (
            <div style={{ background:"var(--bg2)", border:"1px solid #0f1a26", padding:24 }}>
              <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, letterSpacing:3, color:"var(--border)", marginBottom:16 }}>STORAGE</div>
              {data.storage ? (
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))", gap:12 }}>
                  {[
                    { label:"DATA SIZE",    value: bytes(data.storage.dataSize),     color:"var(--green,var(--green))" },
                    { label:"STORAGE SIZE", value: bytes(data.storage.storageSize),  color:"var(--cyan,var(--cyan))" },
                    { label:"INDEX SIZE",   value: bytes(data.storage.indexSize),    color:"var(--yellow,#ffd700)" },
                    { label:"TOTAL SIZE",   value: bytes(data.storage.totalSize),    color:"var(--purple,#a78bfa)" },
                  ].map(({ label, value, color }) => (
                    <div key={label} style={{ background:"var(--bg)", border:`1px solid ${color}18`, padding:"16px" }}>
                      <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, letterSpacing:2, color:"var(--muted)", marginBottom:6 }}>{label}</div>
                      <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize:22, fontWeight:700, color }}>{value}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize:11, color:"var(--muted)" }}>
                  {data.fallback ? "WARN /api/admin/stats/db-health endpoint not yet wired - showing collection counts instead." : "No storage data."}
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))", gap:8, marginTop:16 }}>
                    {data.counts && Object.entries({
                      Users: data.counts?.users?.total,
                      Posts: data.counts?.posts?.total,
                      Threads: data.counts?.forum?.threads,
                      Replies: data.counts?.forum?.replies,
                      Messages: data.counts?.chat?.messages,
                      Contacts: data.counts?.contacts,
                      Media: data.counts?.media,
                      Newsletter: data.counts?.newsletter?.total,
                    }).map(([k, v]) => (
                      <div key={k} style={{ background:"var(--bg)", border:"1px solid var(--border)", padding:12 }}>
                        <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, letterSpacing:2, color:"var(--muted)", marginBottom:4 }}>{k.toUpperCase()}</div>
                        <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize:20, fontWeight:700, color:"var(--green,var(--green))" }}>{(v||0).toLocaleString()}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Indexes */}
          {data.indexes && data.indexes.length > 0 && (
            <div style={{ background:"var(--bg2)", border:"1px solid #0f1a26", padding:24 }}>
              <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, letterSpacing:3, color:"var(--border)", marginBottom:16 }}>INDEXES</div>
              <div style={{ overflowX:"auto" }}>
                <table style={{ width:"100%", borderCollapse:"collapse", fontFamily:"var(--font-mono,monospace)", fontSize:11 }}>
                  <thead>
                    <tr style={{ borderBottom:"1px solid #1e2d45" }}>
                      {["COLLECTION","INDEX","SIZE","USAGE"].map(h => <th key={h} style={{ padding:"7px 10px", textAlign:"left", color:"var(--muted)", fontSize: 11, letterSpacing:2 }}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {data.indexes.map((idx, i) => (
                      <tr key={i} style={{ borderBottom:"1px solid #0a1016" }}>
                        <td style={{ padding:"8px 10px", color:"var(--text)" }}>{idx.collection}</td>
                        <td style={{ padding:"8px 10px", color:"var(--cyan,var(--cyan))" }}>{idx.name}</td>
                        <td style={{ padding:"8px 10px", color:"var(--muted)" }}>{bytes(idx.size)}</td>
                        <td style={{ padding:"8px 10px" }}>
                          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                            <div style={{ flex:1, height:4, background:"var(--border)", borderRadius:2 }}>
                              <div style={{ height:"100%", width:`${Math.min(100, idx.usagePct||0)}%`, background:"var(--green,var(--green))", borderRadius:2 }} />
                            </div>
                            <span style={{ color:"var(--green,var(--green))", fontSize: 11 }}>{idx.usagePct||0}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Maintenance actions */}
          <div style={{ background:"var(--bg2)", border:"1px solid #0f1a26", padding:24 }}>
            <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, letterSpacing:3, color:"var(--border)", marginBottom:16 }}>QUICK MAINTENANCE</div>
            <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
              {[
                { label:"Compact DB",          path:"db/compact",           color:"var(--cyan,var(--cyan))" },
                { label:"Clear Old Sessions",  path:"db/clear-sessions",    color:"var(--orange,var(--orange))" },
                { label:"Purge Unverified",    path:"db/purge-unverified",  color:"var(--red,var(--red))" },
                { label:"Rebuild Search Index",path:"search/rebuild",       color:"var(--purple,#a78bfa)" },
              ].map(({ label, path, color }) => (
                <button key={label} disabled={!!busy} onClick={() => runAction(label, path)} style={{ padding:"9px 18px", background:`${color}12`, color, border:`1px solid ${color}33`, fontFamily:"var(--font-mono,monospace)", fontSize: 11, letterSpacing:1, cursor:busy?"not-allowed":"pointer", opacity:busy===label?0.5:1 }}>
                  {busy===label?"RUNNING...":"RUN "+label.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Slow query log placeholder */}
          {data.slowQueries && data.slowQueries.length > 0 && (
            <div style={{ background:"var(--bg2)", border:"1px solid #ff475520", padding:24 }}>
              <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, letterSpacing:3, color:"var(--red,var(--red))", marginBottom:16 }}>WARN SLOW QUERIES</div>
              {data.slowQueries.map((q, i) => (
                <div key={i} style={{ display:"grid", gridTemplateColumns:"1fr 80px 120px", gap:12, padding:"8px 0", borderBottom:"1px solid #0a1016", fontFamily:"var(--font-mono,monospace)", fontSize: 11 }}>
                  <span style={{ color:"var(--muted)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{q.query}</span>
                  <span style={{ color:"var(--red,var(--red))" }}>{q.ms}ms</span>
                  <span style={{ color:"var(--muted)" }}>{ago(q.ts)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ------------------------- N -------------------------EWSLETTER TAB ----------
function NewsletterTab({ token, toast }) {
  const [subs, setSubs]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState("");
  const { confirm } = useDialog();
  const [page, setPage]       = useState(1);
  const [total, setTotal]     = useState(0);
  const [busy, setBusy]       = useState("");
  const PER = 30;

  const load = useCallback(async (p = page, q = search) => {
    setLoading(true);
    try {
      const qs = q ? `&search=${encodeURIComponent(q)}` : "";
      const res = await api.get(ap(`/api/admin/stats/collection/newsletter?page=${p}&limit=${PER}${qs}`), authCfg(token));
      const data = res.data;
      setSubs(data.docs || []); setTotal(data.total || 0);
    } catch {}
    finally { setLoading(false); }
  }, [page, search, token]);

  useEffect(() => { void (async () => { await load(page, search) })() }, [page]);

  const toggle = async (sub) => {
    setBusy(sub._id);
    try {
      const r = await api.post(ap(`/api/admin/actions/newsletter/${sub._id}/toggle-active`), {}, authCfg(token));
      const d = r.data;
      toast.add(d.message || "Updated");
      setSubs(s => s.map(x => x._id === sub._id ? {...x, active: !x.active} : x));
    } catch(e) { toast.add(e.message,"error"); }
    finally { setBusy(""); }
  };

  const del = async (id) => {
    const ok = await confirm({ title: 'Remove Subscriber', message: 'Remove this subscriber from the newsletter?', variant: 'danger', confirmLabel: 'REMOVE' });
    if (!ok) return;
    setBusy(id);
    try {
      await api.delete(ap(`/api/admin/collection/newsletter/${id}`), authCfg(token));
      toast.add("Removed"); setSubs(s => s.filter(x => x._id !== id)); setTotal(t => t - 1);
    } catch(e) { toast.add(e.message,"error"); }
    finally { setBusy(""); }
  };

  const exportCsv = () => {
    const rows = [["email","active","createdAt"], ...subs.map(s => [s.email, s.active, s.createdAt])];
    const blob = new Blob([rows.map(r => r.join(",")).join("\n")], { type:"text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `newsletter_${new Date().toISOString().slice(0,10)}.csv`; a.click();
    toast.add(`Exported ${subs.length} rows`);
  };

  const pages = Math.ceil(total / PER) || 1;
  const active = subs.filter(s => s.active).length;

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20, flexWrap:"wrap", gap:10 }}>
        <div>
          <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, letterSpacing:3, color:"var(--border)" }}>NEWSLETTER SUBSCRIBERS</div>
          <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize:11, color:"var(--text)", marginTop:4 }}>
            <span style={{ color:"var(--green,var(--green))" }}>{total.toLocaleString()}</span> total · <span style={{ color:"var(--cyan,var(--cyan))" }}>{active}</span> active
          </div>
        </div>
        <button onClick={exportCsv} disabled={!subs.length} style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, letterSpacing:1, padding:"7px 14px", background:"color-mix(in srgb, var(--green) 6%, transparent)", color:"var(--green,var(--green))", border:"1px solid var(--green)33", cursor:"pointer" }}>
          ⬇ EXPORT CSV
        </button>
      </div>

      <div style={{ display:"flex", gap:8, marginBottom:16 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key==="Enter" && (setPage(1), load(1, search))}
          placeholder="Search by email..." aria-label="Search newsletter subscribers" style={{ flex:1, background:"var(--bg)", border:"1px solid #1e2d45", color:"var(--text)", fontFamily:"var(--font-mono,monospace)", fontSize:11, padding:"9px 12px", outline:"none" }} />
        <button onClick={() => { setPage(1); load(1, search); }} style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, padding:"9px 14px", background:"color-mix(in srgb, var(--cyan) 6%, transparent)", color:"var(--cyan,var(--cyan))", border:"1px solid var(--cyan)33", cursor:"pointer" }}>SEARCH</button>
        {search && <button onClick={() => { setSearch(""); setPage(1); load(1, ""); }} style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, padding:"9px 12px", background:"transparent", color:"var(--muted)", border:"1px solid #1e2d45", cursor:"pointer" }}>x</button>}
      </div>

      {loading ? <div style={{ textAlign:"center", padding:40, fontFamily:"var(--font-mono,monospace)", fontSize: 11, color:"var(--border)", letterSpacing:3 }}>LOADING...</div> : (
        <>
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontFamily:"var(--font-mono,monospace)", fontSize:11 }}>
              <thead>
                <tr style={{ borderBottom:"1px solid #1e2d45" }}>
                  <th style={{ padding:"8px 12px", textAlign:"left", color:"var(--muted)", fontSize: 11, letterSpacing:2 }}>EMAIL</th>
                  <th style={{ padding:"8px 12px", textAlign:"left", color:"var(--muted)", fontSize: 11, letterSpacing:2 }}>STATUS</th>
                  <th style={{ padding:"8px 12px", textAlign:"left", color:"var(--muted)", fontSize: 11, letterSpacing:2 }}>JOINED</th>
                  <th style={{ padding:"8px 12px", textAlign:"right", color:"var(--muted)", fontSize: 11, letterSpacing:2 }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {subs.map((s, i) => (
                  <tr key={i} style={{ borderBottom:"1px solid #0a1016" }}
                    onMouseEnter={e => e.currentTarget.style.background="rgba(255,255,255,0.01)"}
                    onMouseLeave={e => e.currentTarget.style.background="transparent"}>
                    <td style={{ padding:"9px 12px", color:"var(--text)" }}>{s.email}</td>
                    <td style={{ padding:"9px 12px" }}>
                      <span style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, letterSpacing:1, padding:"2px 8px", background:s.active?"color-mix(in srgb, var(--green) 7%, transparent)":"rgba(255,71,87,0.07)", color:s.active?"var(--green,var(--green))":"var(--red,var(--red))", border:`1px solid ${s.active?"color-mix(in srgb, var(--green) 19%, transparent)":"rgba(255,71,87,0.25)"}` }}>
                        {s.active ? "YES ACTIVE" : "NO UNSUB"}
                      </span>
                    </td>
                    <td style={{ padding:"9px 12px", color:"var(--muted)", fontSize: 11 }}>{s.createdAt ? ago(s.createdAt) : "-"}</td>
                    <td style={{ padding:"9px 12px", whiteSpace:"nowrap" }}>
                      <div style={{ display:"flex", gap:4, justifyContent:"flex-end" }}>
                        <Btn tiny label={busy===s._id?"...":s.active?"DEACTIVATE":"ACTIVATE"} color={s.active?"var(--red,var(--red))":"var(--green,var(--green))"} disabled={!!busy} onClick={() => toggle(s)} />
                        <Btn tiny danger label={busy===s._id?"...":"DEL"} disabled={!!busy} onClick={() => del(s._id)} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <div style={{ display:"flex", gap:8, marginTop:16, justifyContent:"center", alignItems:"center" }}>
              <button disabled={page<=1} onClick={() => setPage(p=>p-1)} style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, padding:"6px 14px", background:"var(--bg)", color:page<=1?"var(--border)":"var(--cyan,var(--cyan))", border:"1px solid #1e2d45", cursor:page<=1?"not-allowed":"pointer" }}>PREV</button>
              <span style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, color:"var(--border)" }}>Page {page} / {pages} · {total.toLocaleString()} total</span>
              <button disabled={page>=pages} onClick={() => setPage(p=>p+1)} style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, padding:"6px 14px", background:"var(--bg)", color:page>=pages?"var(--border)":"var(--cyan,var(--cyan))", border:"1px solid #1e2d45", cursor:page>=pages?"not-allowed":"pointer" }}>NEXT</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ------------------------- A -------------------------UDIT LOG TAB ----------
function AuditLogTab({ token, toast }) {
  const [logs, setLogs]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage]       = useState(1);
  const [total, setTotal]     = useState(0);
  const [filter, setFilter]   = useState("");

  const [debouncedFilter, setDebouncedFilter] = useState(filter);
  useEffect(() => {
    const t = setTimeout(() => { setPage(1); setDebouncedFilter(filter); }, 300);
    return () => clearTimeout(t);
  }, [filter]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const q = debouncedFilter ? `&event=${encodeURIComponent(debouncedFilter)}` : "";
        const res = await api.get(ap(`/api/admin/audit?page=${page}&limit=30${q}`), authCfg(token));
        const data = res.data;
        if (!cancelled) { setLogs(data.logs || []); setTotal(data.total || 0); }
      } catch {}
      finally { if (!cancelled) setLoading(false); }
    };
    run();
    return () => { cancelled = true };
  }, [page, debouncedFilter, token]);

  const exportCsv = async () => {
    try {
      const res = await api.get('/admin/audit/export', { responseType: 'blob' });
      const blob = res.data instanceof Blob ? res.data : new Blob([res.data], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const _d = new Date(), _p = n => String(n).padStart(2, '0');
      a.download = `audit-${_d.getFullYear()}-${_p(_d.getMonth() + 1)}-${_p(_d.getDate())}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast?.add(`Exported audit log`);
    } catch (e) {
      toast?.add(e?.response?.data?.error || e.message || 'Audit export failed', 'error');
    }
  };

  const pages = Math.ceil(total / 30) || 1;
  const ACTION_COLOR = { login:"var(--green,var(--green))", logout:"var(--orange,var(--orange))", create:"var(--cyan,var(--cyan))", delete:"var(--red,var(--red))", ban:"var(--red,var(--red))", unban:"var(--green,var(--green))", role:"var(--yellow,#ffd700)", update:"var(--purple,#a78bfa)", verify:"var(--green,var(--green))", password:"var(--orange,var(--orange))", fail:"var(--red,var(--red))", upload:"var(--cyan,var(--cyan))" };
  const getColor = (a = "") => { for (const [k, c] of Object.entries(ACTION_COLOR)) if (a.includes(k)) return c; return "var(--muted)"; };
  const ACTION_ICONS = { login:"[IN]", logout:"[OUT]", create:"[+]", delete:"[X]", ban:"[BAN]", unban:"[OK]", role:"[R]", update:"[E]", verify:"[V]", password:"[PW]", fail:"[FAIL]", upload:"[UP]" };
  const getIcon = (a = "") => { for (const [k, c] of Object.entries(ACTION_ICONS)) if (a.includes(k)) return c; return "[*]"; };

  return (
    <div>
      <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, letterSpacing:3, color:"var(--border)", marginBottom:20 }}>AUDIT LOG</div>
      <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" }}>
        <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter by action keyword (e.g. login, ban, create)..." aria-label="Filter audit log"
          style={{ flex:1, minWidth:220, background:"var(--bg)", border:"1px solid #1e2d45", color:"var(--text)", fontFamily:"var(--font-mono,monospace)", fontSize:11, padding:"9px 12px", outline:"none" }} />
        {filter && <button onClick={() => { setFilter(""); setPage(1); }} style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, padding:"9px 12px", background:"transparent", color:"var(--muted)", border:"1px solid #1e2d45", cursor:"pointer" }}>x</button>}
        <button onClick={exportCsv}
          style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, letterSpacing:1, padding:"9px 14px", background:"transparent", color:"var(--green)", border:"1px solid rgba(0,255,136,0.35)", cursor:"pointer" }}>
          ⬇ EXPORT CSV
        </button>
      </div>
      {loading ? (
        <div style={{ textAlign:"center", padding:40, fontFamily:"var(--font-mono,monospace)", fontSize: 11, color:"var(--border)", letterSpacing:3 }}>LOADING...</div>
      ) : (
        <>
          <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, color:"var(--border)", marginBottom:10, letterSpacing:2 }}>
            {total.toLocaleString()} EVENTS{filter ? ` · filter: "${filter}"` : ""}
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
            {logs.length === 0 ? (
              <div style={{ textAlign:"center", padding:60, fontFamily:"var(--font-mono,monospace)", fontSize: 11, color:"var(--border)" }}>No audit events found</div>
            ) : logs.map((log, i) => (
              <div key={i} style={{ display:"grid", gridTemplateColumns:"22px 160px 130px 1fr auto", gap:12, padding:"10px 14px", background:"var(--bg2)", border:"1px solid #0a1016", alignItems:"center" }}>
                <span style={{ fontSize:13 }}>{getIcon(log.event)}</span>
                <span style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, color:getColor(log.event), letterSpacing:1 }}>{(log.event || "").replace(/_/g," ").toUpperCase()}</span>
                <span style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, color:"var(--text)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{log.username || "system"}</span>
                <span style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, color:"var(--muted)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                  {log.role && <span style={{ color:roleColor(log.role), marginRight:8, fontSize: 11 }}>{log.role.toUpperCase()}</span>}
                  {log.meta?.target ? `-> ${log.meta.target}` : ""}
                  {log.meta?.oldRole ? ` (${log.meta.oldRole} -> ${log.meta.newRole})` : ""}
                  {log.ip && <span style={{ color:"var(--muted)", marginLeft:8 }}>IP: {log.ip}</span>}
                </span>
                <span style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, color:"var(--border)", whiteSpace:"nowrap" }}>{log.createdAt ? new Date(log.createdAt).toLocaleString() : "-"}</span>
              </div>
            ))}
          </div>
          {pages > 1 && (
            <div style={{ display:"flex", gap:8, marginTop:16, justifyContent:"center", alignItems:"center" }}>
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, padding:"6px 14px", background:"var(--bg)", color:page<=1?"var(--border)":"var(--cyan,var(--cyan))", border:"1px solid #1e2d45", cursor:page<=1?"not-allowed":"pointer" }}>PREV</button>
              <span style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, color:"var(--border)" }}>Page {page} / {pages}</span>
              <button disabled={page >= pages} onClick={() => setPage(p => p + 1)} style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, padding:"6px 14px", background:"var(--bg)", color:page>=pages?"var(--border)":"var(--cyan,var(--cyan))", border:"1px solid #1e2d45", cursor:page>=pages?"not-allowed":"pointer" }}>NEXT</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ------------------------- S -------------------------ESSIONS & IP BANS ----------
function SessionsTab({ token, toast }) {
  const [sessions, setSessions] = useState([]);
  const [ipBans, setIpBans]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [newIp, setNewIp]       = useState("");
  const [banReason, setBanReason] = useState("");
  const [busy, setBusy]         = useState("");
  const [subTab, setSubTab]     = useState("sessions");

  const load = async () => {
    setLoading(true);
    try {
      const [sRes, bRes] = await Promise.allSettled([
        api.get(ap(`/api/admin/sessions`), authCfg(token)),
        api.get(ap(`/api/admin/ip-bans`), authCfg(token)),
      ]);
      if (sRes.status === "fulfilled") { const d = sRes.value.data; setSessions(d.sessions || d || []); }
      if (bRes.status === "fulfilled") { const d = bRes.value.data; setIpBans(d.bans || d || []); }
    } catch {}
    finally { setLoading(false); }
  };

  useEffect(() => { void (async () => { await load() })() }, []);

  const revokeSession = async (id) => {
    if (!id) return;
    const ok = await confirm({ title: 'Revoke Session', message: 'Sign out this session?', variant: 'danger', confirmLabel: 'REVOKE' });
    if (!ok) return;
    setBusy(id);
    try {
      await api.delete(ap(`/api/admin/sessions/${id}`), authCfg(token));
      toast.add("Session revoked"); setSessions(s => s.filter(x => (x._id || x.id) !== id));
    } catch(e) { toast.add(e.message,"error"); }
    finally { setBusy(""); }
  };

  const addBan = async () => {
    if (!newIp.trim()) return;
    setBusy("add");
    try {
      const res = await api.post(ap(`/api/admin/ip-bans`), { ip: newIp.trim(), reason: banReason }, authCfg(token));
      const data = res.data;
      setIpBans(b => [...b, data.ban || data]); setNewIp(""); setBanReason("");
      toast.add("IP banned");
    } catch(e) { toast.add(e.message,"error"); }
    finally { setBusy(""); }
  };

  const removeBan = async (id) => {
    if (!id) return;
    setBusy(id);
    try {
      await api.delete(ap(`/api/admin/ip-bans/${id}`), authCfg(token));
      toast.add("Ban removed"); setIpBans(b => b.filter(x => (x._id||x.id) !== id));
    } catch(e) { toast.add(e.message,"error"); }
    finally { setBusy(""); }
  };

  const inp = { background:"var(--bg)", border:"1px solid #1e2d45", color:"var(--text)", fontFamily:"var(--font-mono,monospace)", fontSize:12, padding:"10px 12px", outline:"none", width:"100%", boxSizing:"border-box" };

  return (
    <div>
      <div style={{ display:"flex", gap:0, borderBottom:"1px solid #1e2d45", marginBottom:20 }}>
        {[["sessions","LIVE Sessions"], ["ipbans","BAN IP Bans"]].map(([id, label]) => (
          <button key={id} onClick={() => setSubTab(id)} style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, letterSpacing:2, padding:"10px 18px", background:"transparent", color:subTab===id?"var(--cyan,var(--cyan))":"var(--muted)", borderBottom:subTab===id?"2px solid var(--cyan)":"2px solid transparent", border:"none", cursor:"pointer" }}>{label.toUpperCase()}</button>
        ))}
      </div>

      {loading ? <div style={{ textAlign:"center", padding:40, fontFamily:"var(--font-mono,monospace)", fontSize: 11, color:"var(--border)" }}>LOADING...</div> : (

        subTab === "sessions" ? (
          <div>
            <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, color:"var(--border)", marginBottom:14, letterSpacing:2 }}>{sessions.length} ACTIVE SESSION{sessions.length !== 1 ? "S" : ""}</div>
            {sessions.length === 0 ? (
              <div style={{ textAlign:"center", padding:60, fontFamily:"var(--font-mono,monospace)", fontSize: 11, color:"var(--border)" }}>No active sessions data available</div>
            ) : sessions.map((s, i) => (
              <div key={i} style={{ display:"grid", gridTemplateColumns:"1fr auto auto auto", gap:12, padding:"12px 16px", background:"var(--bg2)", border:"1px solid #0a1016", marginBottom:4, alignItems:"center" }}>
                <div>
                  <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize:11, color:"var(--text)" }}>{s.username || s.user || "unknown"}</div>
                  <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, color:"var(--muted)", marginTop:2 }}>
                    {s.ip || "-"} · {s.userAgent ? s.userAgent.slice(0, 60) : "-"}
                  </div>
                </div>
                <span style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, color:"var(--muted)" }}>{s.role || "user"}</span>
                <span style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, color:"var(--muted)" }}>{s.createdAt || s.lastSeen ? ago(s.createdAt || s.lastSeen) : "-"}</span>
                <Btn tiny danger label={busy === (s._id||s.id) ? "..." : "REVOKE"} disabled={!!busy} onClick={() => revokeSession(s._id || s.id)} />
              </div>
            ))}
          </div>
        ) : (
          <div>
            <div style={{ background:"var(--bg2)", border:"1px solid #0f1a26", padding:20, marginBottom:20 }}>
              <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, letterSpacing:3, color:"var(--border)", marginBottom:14 }}>ADD IP BAN</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr auto", gap:10, alignItems:"end" }}>
                <div>
                  <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, letterSpacing:2, color:"var(--muted)", marginBottom:6 }}>IP ADDRESS</div>
                  <input value={newIp} onChange={e => setNewIp(e.target.value)} placeholder="192.168.1.1" style={inp} />
                </div>
                <div>
                  <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, letterSpacing:2, color:"var(--muted)", marginBottom:6 }}>REASON (OPTIONAL)</div>
                  <input value={banReason} onChange={e => setBanReason(e.target.value)} placeholder="Spam, abuse..." style={inp} />
                </div>
                <button onClick={addBan} disabled={!newIp.trim() || !!busy} style={{ padding:"10px 18px", background:"color-mix(in srgb, var(--red) 8%, transparent)", color:"var(--red,var(--red))", border:"1px solid #ff475533", fontFamily:"var(--font-mono,monospace)", fontSize: 11, letterSpacing:1, cursor:newIp.trim()?"pointer":"not-allowed" }}>
                  {busy === "add" ? "BANNING..." : "BAN BAN IP"}
                </button>
              </div>
            </div>
            <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, color:"var(--border)", marginBottom:10, letterSpacing:2 }}>{ipBans.length} BANNED IP{ipBans.length !== 1 ? "S" : ""}</div>
            {ipBans.length === 0 ? (
              <div style={{ textAlign:"center", padding:60, fontFamily:"var(--font-mono,monospace)", fontSize: 11, color:"var(--border)" }}>No IP bans configured</div>
            ) : ipBans.map((ban, i) => (
              <div key={i} style={{ display:"grid", gridTemplateColumns:"1fr 1fr auto auto", gap:12, padding:"12px 16px", background:"var(--bg2)", border:"1px solid #0a1016", marginBottom:4, alignItems:"center" }}>
                <span style={{ fontFamily:"var(--font-mono,monospace)", fontSize:12, color:"var(--red,var(--red))" }}>{ban.ip}</span>
                <span style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, color:"var(--muted)" }}>{ban.reason || "-"}</span>
                <span style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, color:"var(--muted)" }}>{ban.createdAt ? ago(ban.createdAt) : "-"}</span>
                <Btn tiny danger label={busy === (ban._id||ban.id) ? "..." : "REMOVE"} disabled={!!busy} onClick={() => removeBan(ban._id || ban.id)} />
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}

// ------------------------- M -------------------------AIN DASHBOARD ----------

export { DbHealthTab, NewsletterTab, AuditLogTab, SessionsTab }
