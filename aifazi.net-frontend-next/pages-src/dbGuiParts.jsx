'use client'
// dbGuiParts.jsx — DatabaseGUI shared widgets + admin panels (extracted).
import { useState, useEffect, useRef } from 'react'
import { useDialog } from '../core/dialog.jsx'
import { useNotify } from '../core/notify.jsx'
import { Checkbox, Select } from '../core/ui.jsx'
import Clickable from '../core/Clickable.jsx'
import api from '../lib/api'

const ago = (d) => {
  const s = Math.floor((Date.now() - new Date(d)) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

const fmt = (n) => (n ?? 0).toLocaleString();

const ROLE_META = {
  admin:     { color: "var(--green,var(--green))", bg: "color-mix(in srgb, var(--green) 8%, transparent)", label: "ADMIN" },
  moderator: { color: "var(--cyan,var(--cyan))", bg: "color-mix(in srgb, var(--cyan) 8%, transparent)", label: "MOD" },
  editor:    { color: "var(--orange,var(--orange))", bg: "color-mix(in srgb, var(--orange) 10%, transparent)", label: "EDITOR" },
  chat:      { color: "var(--yellow,#ffd700)", bg: "rgba(255,215,0,0.08)", label: "CHAT" },
  user:      { color: "var(--muted)", bg: "rgba(71,85,105,0.08)", label: "USER" },
};
const roleColor = (r) => ROLE_META[r]?.color || "var(--muted)";
const roleBg    = (r) => ROLE_META[r]?.bg    || "rgba(71,85,105,0.08)";

const normalizeUserDoc = (doc = {}) => ({
  ...doc,
  _id: doc._id || doc.id,
  id: doc.id || doc._id,
  emailVerified: Boolean(doc.emailVerified ?? doc.email_verified),
  banReason: doc.banReason ?? doc.ban_reason ?? "",
  createdAt: doc.createdAt || doc.created_at,
  updatedAt: doc.updatedAt || doc.updated_at,
  lastSeen: doc.lastSeen || doc.last_seen,
  threadCount: doc.threadCount ?? doc.thread_count ?? 0,
  replyCount: doc.replyCount ?? doc.reply_count ?? 0,
});

// -- Thin wrapper: adapts useNotify to the { add } interface used throughout this file
function useToasts() {
  const notify = useNotify();
  const add = (message, type = "success") => {
    if (type === "error") notify.error(message);
    else notify.success(message);
  };
  return { toasts: [], add, dismiss: () => {} };
}
// ToastContainer is no longer needed - useNotify renders its own portal
function ToastContainer() { return null; }

// All fetch calls pass through the Next.js /api proxy — API_URL is always "".
// The axios `api` client is available for structured calls; raw fetch is used
// here for flexibility with dynamic paths and non-JSON payloads.
async function adminAction(token, path, body = null) {
  // Both backend prefixes are live: user/toggle actions are served under
  // /api/admin/stats/actions/* (stats router) while DB maintenance actions
  // are served under /api/admin/actions/* (admin_actions router). Route
  // through this one helper so both call shapes keep working.
  const base = /^(db\/|posts\/recalculate|chat\/|search\/|cache\/|stats\/)/.test(path)
    ? `/admin/actions/${path}`
    : `/admin/stats/actions/${path}`;
  try {
    const res = await api.post(base, body || {}, { headers: { Authorization: `Bearer ${token}` } });
    return res.data;
  } catch (e) {
    throw new Error(e?.response?.data?.error || e.message);
  }
}

// The shared axios client has baseURL '/api' (+401 refresh / global expiry
// UX), so strip the '/api' prefix when routing raw paths through it.
const ap = (p) => p.replace(/^\/api/, '') || '/';
const authCfg = (token) => ({ headers: { Authorization: `Bearer ${token}` } });

function Btn({ label, color="var(--cyan,var(--cyan))", onClick, disabled, tiny, danger }) {
  const c = danger ? "var(--red,var(--red))" : color;
  return (
    <button onClick={onClick} disabled={disabled} style={{
      fontFamily:"var(--font-mono,monospace)", fontSize:tiny?8:9, letterSpacing:tiny?0:1,
      padding:tiny?"3px 8px":"7px 14px",
      background:disabled?"transparent":`${c}10`,
      color:disabled?"var(--muted)":c,
      border:`1px solid ${disabled?"var(--border)":c+"44"}`,
      cursor:disabled?"not-allowed":"pointer", transition:"all 0.15s", whiteSpace:"nowrap",
    }}>{label}</button>
  );
}

function StatCard({ label, value, sub, color="var(--green,var(--green))", icon, trend }) {
  return (
    <div style={{ background:"var(--bg)", border:`1px solid ${color}1a`, padding:"18px 20px", position:"relative", overflow:"hidden" }}>
      <div style={{ position:"absolute", top:0, left:0, right:0, height:2, background:`linear-gradient(90deg,${color},transparent)` }} />
      <div style={{ fontSize: 11, fontFamily:"var(--font-mono,monospace)", letterSpacing:3, color:"var(--muted)", marginBottom:10 }}>{icon} {label}</div>
      <div style={{ fontSize:30, fontWeight:900, color, fontFamily:"var(--font-mono,monospace)", lineHeight:1 }}>{fmt(value)}</div>
      {sub && <div style={{ fontSize: 11, fontFamily:"var(--font-mono,monospace)", color:"var(--muted)", marginTop:6, lineHeight:1.5 }}>{sub}</div>}
      {trend !== undefined && (
        <div style={{ position:"absolute", top:14, right:14, fontFamily:"var(--font-mono,monospace)", fontSize: 11, color:trend>0?"var(--green,var(--green))":trend<0?"var(--red,var(--red))":"var(--muted)" }}>
          {trend>0?`+${trend}`:trend<0?`-${Math.abs(trend)}`:"-"} today
        </div>
      )}
    </div>
  );
}

function MiniChart({ data=[], color="var(--green,var(--green))", label="" }) {
  if (!data.length) return <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, color:"var(--border)", padding:"20px 0", textAlign:"center" }}>NO DATA YET</div>;
  const max = Math.max(...data.map(d => d.count), 1);
  return (
    <div>
      <div style={{ fontSize: 11, fontFamily:"var(--font-mono,monospace)", letterSpacing:2, color:"var(--muted)", marginBottom:10 }}>{label}</div>
      <div style={{ display:"flex", alignItems:"flex-end", gap:2, height:56 }}>
        {data.slice(-30).map((d, i) => (
          <div key={i} title={`${d._id}: ${d.count}`} style={{
            flex:1, height:`${Math.max(4,(d.count/max)*100)}%`,
            background:`linear-gradient(180deg,${color},${color}66)`,
            opacity:0.4+(i/data.length)*0.6, minWidth:3, borderRadius:"2px 2px 0 0", transition:"height 0.3s",
          }} />
        ))}
      </div>
      <div style={{ display:"flex", justifyContent:"space-between", marginTop:4, fontFamily:"var(--font-mono,monospace)", fontSize: 11, color:"var(--border)" }}>
        <span>{data[0]?._id}</span><span>{data[data.length-1]?._id}</span>
      </div>
    </div>
  );
}

function FeedRow({ icon, title, sub, time, color="var(--green,var(--green))" }) {
  return (
    <div style={{ display:"flex", gap:10, padding:"9px 0", borderBottom:"1px solid #0a1016", alignItems:"flex-start" }}>
      <div style={{ width:26, height:26, background:`${color}12`, border:`1px solid ${color}30`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, flexShrink:0 }}>{icon}</div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize:11, color:"var(--text)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{title}</div>
        {sub && <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, color:"var(--muted)", marginTop:2, lineHeight:1.4 }}>{sub}</div>}
      </div>
      <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, color:"var(--border)", flexShrink:0 }}>{time}</div>
    </div>
  );
}

// ------------------------- U -------------------------SER ACTIONS MODAL ----------
function UserActionsModal({ user, token, onClose, onRefresh, toast }) {
  const normalizedUser = normalizeUserDoc(user);
  const [busy, setBusy]           = useState("");
  const [newPass, setNewPass]     = useState("");
  const [showPass, setShowPass]   = useState(false);
  const [newRole, setNewRole]     = useState(normalizedUser.role || "user");
  const [banReason, setBanReason] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [tab, setTab]             = useState("quick");
  const [u, setU]                 = useState(normalizedUser);

  const [prevUser, setPrevUser] = useState(user);
  if (prevUser !== user) {
    setPrevUser(user);
    const next = normalizeUserDoc(user);
    setU(next);
    setNewRole(next.role || "user");
  }

  const run = async (label, path, body) => {
    setBusy(label);
    try {
      const r = await adminAction(token, path, body);
      toast.add(r.message);
      if (r.user) setU(normalizeUserDoc(r.user));
      else if (label==="role")   setU(x => ({...x, role:body.role}));
      else if (label==="verify") setU(x => ({...x, emailVerified:true, email_verified:true}));
      else if (label==="ban")    setU(x => ({...x, banned:true, banReason:body?.reason, ban_reason:body?.reason}));
      else if (label==="unban")  setU(x => ({...x, banned:false, banReason:"", ban_reason:""}));
      onRefresh();
    } catch(e) { toast.add(e.message,"error"); }
    finally { setBusy(""); }
  };

  const inp = { width:"100%", background:"var(--bg)", border:"1px solid #1e2d45", color:"var(--text)", fontFamily:"var(--font-mono,monospace)", fontSize:12, padding:"10px 12px", outline:"none", boxSizing:"border-box" };

  const TABS = [
    {id:"quick",    label:"ACT Actions"},
    {id:"password", label:"KEY Password"},
    {id:"role",     label:"USER Role"},
    {id:"email",    label:"EMAIL Email"},
    {id:"data",     label:"DATA Data"},
  ];

  return (
    <div style={{ position:"fixed", inset:0, zIndex:9999, background:"rgba(0,0,0,0.92)", display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}
      onClick={e => e.target===e.currentTarget && onClose()}>
      <div style={{ background:"var(--bg)", border:"1px solid var(--cyan)22", width:"100%", maxWidth:600, maxHeight:"92vh", display:"flex", flexDirection:"column", boxShadow:"0 0 80px color-mix(in srgb, var(--cyan) 8%, transparent)" }}>

        {/* Header */}
        <div style={{ padding:"20px 24px", background:"var(--bg2)", borderBottom:"1px solid #0f1a26", flexShrink:0 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
            <div style={{ display:"flex", alignItems:"center", gap:14 }}>
              <div style={{ width:46, height:46, background:roleBg(u.role), border:`1px solid ${roleColor(u.role)}44`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, fontWeight:700, color:roleColor(u.role) }}>
                {u.username?.[0]?.toUpperCase()||"?"}
              </div>
              <div>
                <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, letterSpacing:3, color:"var(--cyan,var(--cyan))", marginBottom:4 }}>USER MANAGEMENT</div>
                <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize:18, fontWeight:700, color:"var(--text)", lineHeight:1 }}>{u.username}</div>
                <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, color:"var(--muted)", marginTop:3 }}>{u.email}</div>
              </div>
            </div>
            <button onClick={onClose} style={{ background:"none", border:"none", color:"var(--muted)", cursor:"pointer", fontSize:20, padding:4, lineHeight:1 }} aria-label="Close">x</button>
          </div>
          <div style={{ display:"flex", gap:6, marginTop:14, flexWrap:"wrap", alignItems:"center" }}>
            <span style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, letterSpacing:2, padding:"4px 10px", background:roleBg(u.role), color:roleColor(u.role), border:`1px solid ${roleColor(u.role)}33` }}>
              {(ROLE_META[u.role]?.label||"USER")}
            </span>
            <span style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, padding:"4px 10px", background:u.emailVerified?"color-mix(in srgb, var(--green) 6%, transparent)":"color-mix(in srgb, var(--red) 8%, transparent)", color:u.emailVerified?"var(--green,var(--green))":"var(--red,var(--red))", border:`1px solid ${u.emailVerified?"color-mix(in srgb, var(--green) 19%, transparent)":"rgba(255,71,87,0.25)"}` }}>
              {u.emailVerified?"YES VERIFIED":"NO UNVERIFIED"}
            </span>
            {u.banned && <span style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, padding:"4px 10px", background:"color-mix(in srgb, var(--red) 8%, transparent)", color:"var(--red,var(--red))", border:"1px solid color-mix(in srgb, var(--red) 25%, transparent)" }}>BAN BANNED</span>}
            {u.createdAt && <span style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, color:"var(--muted)" }}>Joined {ago(u.createdAt)}</span>}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display:"flex", borderBottom:"1px solid #0f1a26", flexShrink:0 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              flex:1, padding:"11px 6px", fontFamily:"var(--font-mono,monospace)", fontSize: 11, letterSpacing:1,
              background:tab===t.id?"color-mix(in srgb, var(--cyan) 3%, transparent)":"transparent",
              borderBottom:tab===t.id?"2px solid var(--cyan)":"2px solid transparent",
              border:"none", color:tab===t.id?"var(--cyan,var(--cyan))":"var(--muted)", cursor:"pointer",
            }}>{t.label}</button>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex:1, overflowY:"auto", padding:"20px 24px" }}>

          {tab==="quick" && (
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              <div style={{ background:"var(--bg2)", border:"1px solid #0f1a26", padding:16 }}>
                <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, letterSpacing:3, color:"var(--muted)", marginBottom:12 }}>EMAIL VERIFICATION</div>
                <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                  <Btn label={busy==="verify"?"WORKING...":"YES FORCE VERIFY"} color="var(--green,var(--green))"
                    disabled={u.emailVerified||!!busy} onClick={() => run("verify",`users/${u._id}/verify`)} />
                  <Btn label={busy==="send-ver"?"SENDING...":"EMAIL SEND VERIFICATION"} color="var(--cyan,var(--cyan))"
                    disabled={u.emailVerified||!!busy} onClick={() => run("send-ver",`users/${u._id}/send-verification`)} />
                </div>
                {u.emailVerified && <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, color:"var(--green,var(--green))", marginTop:8 }}>YES Already verified</div>}
              </div>

              <div style={{ background:"var(--bg2)", border:"1px solid #0f1a26", padding:16 }}>
                <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, letterSpacing:3, color:"var(--muted)", marginBottom:12 }}>BAN MANAGEMENT</div>
                {u.banned ? (
                  <div>
                    <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, color:"var(--red,var(--red))", marginBottom:10, padding:"8px 10px", background:"rgba(255,71,87,0.03)", border:"1px solid var(--red)20", lineHeight:1.5 }}>
                      BAN Reason: {u.banReason||"No reason given"}
                    </div>
                    <Btn label={busy==="unban"?"WORKING...":"YES UNBAN USER"} color="var(--green,var(--green))" disabled={!!busy} onClick={() => run("unban",`users/${u._id}/unban`)} />
                  </div>
                ) : (
                  <div>
                    <input value={banReason} onChange={e => setBanReason(e.target.value)} placeholder="Ban reason (optional)" aria-label="Ban reason" style={{...inp, marginBottom:10}} />
                    <Btn label={busy==="ban"?"BANNING...":"BAN BAN USER"} danger disabled={!!busy} onClick={() => run("ban",`users/${u._id}/ban`,{reason:banReason})} />
                  </div>
                )}
              </div>

              <div style={{ background:"var(--bg2)", border:"1px solid #0f1a26", padding:16 }}>
                <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, letterSpacing:3, color:"var(--muted)", marginBottom:12 }}>PASSWORD RESET LINK</div>
                <Btn label={busy==="send-reset"?"SENDING...":"LINK SEND RESET EMAIL"} color="var(--cyan,var(--cyan))" disabled={!!busy} onClick={() => run("send-reset",`users/${u._id}/send-reset`)} />
                <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, color:"var(--muted)", marginTop:8 }}>1-hour link sent to {u.email}</div>
              </div>
            </div>
          )}

          {tab==="password" && (
            <div style={{ background:"var(--bg2)", border:"1px solid #0f1a26", padding:16 }}>
              <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, letterSpacing:3, color:"var(--muted)", marginBottom:12 }}>SET PASSWORD DIRECTLY</div>
              <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, color:"var(--red,var(--red))", marginBottom:14, padding:"10px 12px", background:"rgba(255,71,87,0.03)", border:"1px solid var(--red)20", lineHeight:1.6 }}>
                WARN Immediately changes the password with no notification to the user.
              </div>
              <div style={{ position:"relative", marginBottom:10 }}>
                <input type={showPass?"text":"password"} value={newPass} onChange={e => setNewPass(e.target.value)}
                  placeholder="New password (min 8 chars)" aria-label="New password" style={{...inp, paddingRight:40}} />
                <button onClick={() => setShowPass(p=>!p)} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", color:"var(--muted)", cursor:"pointer", fontSize:13 }}>{showPass?"HIDE":"SHOW"}</button>
              </div>
              {newPass.length>0 && newPass.length<8 && <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, color:"var(--red,var(--red))", marginBottom:8 }}>Min 8 characters ({newPass.length}/8)</div>}
              <div style={{ display:"flex", gap:8 }}>
                <Btn label={busy==="set-pass"?"UPDATING...":"KEY SET PASSWORD"} color="var(--orange,var(--orange))"
                  disabled={newPass.length<8||!!busy} onClick={() => run("set-pass",`users/${u._id}/set-password`,{password:newPass})} />
                <Btn label="SEND RESET LINK" color="var(--cyan,var(--cyan))" disabled={!!busy} onClick={() => run("send-reset",`users/${u._id}/send-reset`)} />
              </div>
            </div>
          )}

          {tab==="role" && (
            <div style={{ background:"var(--bg2)", border:"1px solid #0f1a26", padding:16 }}>
              <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, letterSpacing:3, color:"var(--muted)", marginBottom:16 }}>CHANGE ROLE</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:16 }}>
                {[
                  {r:"user",      desc:"Forum member. No admin access."},
                  {r:"moderator", desc:"Forum moderation and user management."},
                  {r:"editor",    desc:"Can create and edit blog posts."},
                  {r:"chat",      desc:"Private chat system access only."},
                  {r:"admin",     desc:"Full admin panel. All permissions."},
                ].map(({r, desc}) => (
                  <button key={r} type="button" onClick={() => setNewRole(r)} aria-pressed={newRole===r} style={{
                    padding:"14px", cursor:"pointer", transition:"all 0.15s",
                    background:newRole===r?roleBg(r):"var(--bg)",
                    border:`1px solid ${newRole===r?roleColor(r)+"55":"var(--border)"}`,
                  }}>
                    <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, color:roleColor(r), fontWeight:700, marginBottom:4, letterSpacing:1 }}>
                      {newRole===r?"* ":"o "}{r.toUpperCase()}
                    </div>
                    <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, color:"var(--muted)", lineHeight:1.4 }}>{desc}</div>
                  </button>
                ))}
              </div>
              <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                <Btn label={busy==="role"?"UPDATING...":` SET -> ${newRole.toUpperCase()}`}
                  color={roleColor(newRole)} disabled={newRole===(u.role||"user")||!!busy}
                  onClick={() => run("role",`users/${u._id}/role`,{role:newRole})} />
                {newRole===(u.role||"user") && <span style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, color:"var(--muted)" }}>Already has this role</span>}
              </div>
            </div>
          )}

          {tab==="email" && (
            <div style={{ background:"var(--bg2)", border:"1px solid #0f1a26", padding:16 }}>
              <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, letterSpacing:3, color:"var(--muted)", marginBottom:12 }}>SEND EMAIL TO {u.email}</div>
              <input value={emailSubject} onChange={e => setEmailSubject(e.target.value)} placeholder="Subject" aria-label="Email subject" style={{...inp, marginBottom:10}} />
              <textarea value={emailBody} onChange={e => setEmailBody(e.target.value)} placeholder="Message body..." rows={6} aria-label="Email body"
                style={{...inp, resize:"vertical", marginBottom:12, lineHeight:1.6}} />
              <Btn label={busy==="send-email"?"SENDING...":` EMAIL SEND EMAIL`} color="var(--cyan,var(--cyan))"
                disabled={!emailSubject.trim()||!emailBody.trim()||!!busy}
                onClick={() => run("send-email",`users/${u._id}/send-email`,{subject:emailSubject,message:emailBody})} />
            </div>
          )}

          {tab==="data" && (
            <div style={{ background:"var(--bg2)", border:"1px solid #0f1a26", padding:16 }}>
              <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, letterSpacing:3, color:"var(--muted)", marginBottom:14 }}>RAW USER DATA</div>
              {Object.entries(u).filter(([k]) => !["__v","password","verifyToken","resetToken","chatToken"].includes(k)).map(([k, v]) => (
                <div key={k} style={{ display:"grid", gridTemplateColumns:"130px 1fr", gap:12, padding:"8px 0", borderBottom:"1px solid #0a1016" }}>
                  <span style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, color:"var(--muted)", letterSpacing:1 }}>{k.toUpperCase()}</span>
                  <span style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, wordBreak:"break-all", lineHeight:1.5,
                    color:k==="role"?roleColor(v):typeof v==="boolean"?(v?"var(--green,var(--green))":"var(--red,var(--red))"):(k.includes("At")&&v)?"var(--muted)":"var(--muted)" }}>
                    {v===null||v===undefined?"-":typeof v==="boolean"?(v?"true YES":"false NO"):(k.includes("At")&&v)?`${new Date(v).toLocaleString()} · ${ago(v)}`:typeof v==="object"?JSON.stringify(v).slice(0,120):String(v)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ------------------------- E -------------------------DIT MODAL ----------
function EditModal({ doc, coll, token, onClose, onSaved }) {
  const READONLY = ["_id","createdAt","updatedAt","password","verifyToken","resetToken","chatToken"];
  const [fields, setFields] = useState(() => {
    const f = {};
    Object.entries(doc).forEach(([k, v]) => { if (k!=="__v") f[k] = typeof v==="object"&&v!==null ? JSON.stringify(v,null,2) : String(v??''); });
    return f;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");

  const save = async () => {
    setSaving(true); setError("");
    const payload = {};
    for (const [k, v] of Object.entries(fields)) {
      if (READONLY.includes(k)) continue;
      try { payload[k] = JSON.parse(v); } catch { payload[k] = v; }
    }
    try {
      await api.patch(ap(`/api/admin/collection/${coll}/${doc._id}`), payload, authCfg(token));
      onSaved(); onClose();
    } catch(e) { setError(e?.response?.data?.error || e.message); }
    finally { setSaving(false); }
  };

  const inp = { background:"var(--bg)", border:"1px solid #1e2d45", color:"var(--text)", fontFamily:"var(--font-mono,monospace)", fontSize:11, padding:"8px 10px", outline:"none", width:"100%", boxSizing:"border-box" };

  return (
    <div style={{ position:"fixed", inset:0, zIndex:9999, background:"rgba(0,0,0,0.92)", display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}
      onClick={e => e.target===e.currentTarget && onClose()}>
      <div style={{ background:"var(--bg)", border:"1px solid var(--green)22", width:"100%", maxWidth:660, maxHeight:"90vh", display:"flex", flexDirection:"column", boxShadow:"0 0 60px color-mix(in srgb, var(--green) 6%, transparent)" }}>
        <div style={{ padding:"14px 20px", background:"var(--bg2)", borderBottom:"1px solid #0f1a26", display:"flex", justifyContent:"space-between", alignItems:"center", flexShrink:0 }}>
          <div>
            <span style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, letterSpacing:3, color:"var(--green,var(--green))" }}>EDIT · {coll.toUpperCase()}</span>
            <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, color:"var(--muted)", marginTop:3 }}>{String(doc._id)}</div>
          </div>
          <button onClick={onClose} style={{ background:"none", border:"none", color:"var(--muted)", cursor:"pointer", fontSize:18 }} aria-label="Close">x</button>
        </div>
        <div style={{ flex:1, overflowY:"auto", padding:"18px 20px", display:"flex", flexDirection:"column", gap:12 }}>
          {Object.entries(fields).filter(([k]) => k!=="__v").map(([key, val]) => {
            const isRO = READONLY.includes(key);
            const isLong = val.length>80||val.includes("\n");
            return (
              <div key={key}>
                <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, letterSpacing:2, color:isRO?"var(--border)":"var(--cyan,var(--cyan))", marginBottom:5 }}>
                  {key.toUpperCase()}{isRO&&<span style={{color:"var(--border)"}}> (READ-ONLY)</span>}
                </div>
                {isLong
                  ? <textarea value={val} onChange={e => setFields(f=>({...f,[key]:e.target.value}))} readOnly={isRO} rows={Math.min(8,val.split("\n").length+1)} style={{...inp, border:`1px solid ${isRO?"var(--border)":"var(--border)"}`, color:isRO?"var(--border)":"var(--text)", resize:"vertical"}} />
                  : <input    value={val} onChange={e => setFields(f=>({...f,[key]:e.target.value}))} readOnly={isRO}                                                 style={{...inp, border:`1px solid ${isRO?"var(--border)":"var(--border)"}`, color:isRO?"var(--border)":"var(--text)"}} />
                }
              </div>
            );
          })}
        </div>
        <div style={{ padding:"14px 20px", borderTop:"1px solid #0f1a26", display:"flex", gap:10, alignItems:"center", flexShrink:0 }}>
          {error && <div style={{ flex:1, fontFamily:"var(--font-mono,monospace)", fontSize: 11, color:"var(--red,var(--red))" }}>WARN {error}</div>}
          {!error && <div style={{ flex:1 }} />}
          <button onClick={onClose} style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, letterSpacing:2, padding:"8px 16px", background:"transparent", color:"var(--muted)", border:"1px solid #1e2d45", cursor:"pointer" }}>CANCEL</button>
          <button onClick={save} disabled={saving} style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, letterSpacing:2, padding:"8px 22px", background:"var(--green,var(--green))", color:"#000", border:"none", cursor:"pointer", fontWeight:700 }}>
            {saving?"SAVING...":"SAVE"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ------------------------- C -------------------------OLLECTION BROWSER ----------
function CollectionBrowser({ token, toast }) {
  const [coll, setColl]     = useState("users");
  const [data, setData]     = useState(null);
  const [page, setPage]     = useState(1);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState(""); // committed search term actually sent to the backend
  const [editDoc, setEditDoc] = useState(null);
  const [userDoc, setUserDoc] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy]     = useState("");
  const [selected, setSelected] = useState(new Set());
  const { confirm } = useDialog();

  const COLLS = ["users","posts","threads","replies","contacts","messages","media","staff","newsletter"];

  const COL_PRIORITY = {
    users:      ["username","email","role","emailVerified","banned","createdAt"],
    posts:      ["title","category","published","views","createdAt"],
    threads:    ["title","category","pinned","locked","views","replyCount","createdAt"],
    replies:    ["content","thread","createdAt"],
    contacts:   ["name","email","subject","createdAt"],
    messages:   ["sender","content","room","type","createdAt"],
    media:      ["filename","url","size","createdAt"],
    staff:      ["username","email","role","createdAt"],
    newsletter: ["email","active","createdAt"],
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = query ? `&search=${encodeURIComponent(query)}` : "";
      const res = await api.get(ap(`/api/admin/stats/collection/${coll}?page=${page}&limit=20${q}`), authCfg(token));
      const d = res.data;
      const docs = coll === "users" ? (d.docs || []).map(normalizeUserDoc) : (d.docs || []);
      setData({ ...d, docs }); setSelected(new Set());
    } catch { setData(null); }
    finally { setLoading(false); }
  }, [coll, page, token, query]);

  // Debounce typing into the committed query (300ms); clearing reloads page 1
  useEffect(() => {
    const t = setTimeout(() => { setPage(1); setQuery(search); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const [prevColl, setPrevColl] = useState(coll);
  if (prevColl !== coll) {
    setPrevColl(coll);
    setPage(1);
    setSearch("");
    setQuery("");
  }

  useEffect(() => { void (async () => { await load() })() }, [load]);

  const del = async (id) => {
    const ok = await confirm({ title: 'Delete Document', message: 'This document will be permanently deleted. This cannot be undone.', variant: 'danger', confirmLabel: 'DELETE' });
    if (!ok) return;
    setDeleting(id);
    try {
      await api.delete(ap(`/api/admin/collection/${coll}/${id}`), authCfg(token));
      toast.add("Deleted"); load();
    } catch(e) { toast.add("Delete failed: "+e.message,"error"); }
    finally { setDeleting(null); }
  };

  const qa = async (label, path) => {
    setBusy(label);
    try { const r = await adminAction(token, path); toast.add(r.message); load(); }
    catch(e) { toast.add(e.message,"error"); }
    finally { setBusy(""); }
  };

  const toggle = (id) => setSelected(s => { const n=new Set(s); n.has(id)?n.delete(id):n.add(id); return n; });
  const allSelected = data?.docs?.length > 0 && selected.size === data.docs.length;

  const keys = data?.docs?.[0] ? Object.keys(data.docs[0]).filter(k => !["__v","password","verifyToken","resetToken","chatToken"].includes(k)) : [];
  const pri  = COL_PRIORITY[coll] || keys;
  const cols = keys.filter(k => pri.includes(k)).sort((a,b) => pri.indexOf(a)-pri.indexOf(b)).slice(0,7);

  const cell = (key, val) => {
    if (val===null||val===undefined) return <span style={{color:"var(--border)"}}>-</span>;
    if (key==="role") return <span style={{color:roleColor(val),fontSize: 11,letterSpacing:1,fontFamily:"var(--font-mono,monospace)"}}>{(val).toUpperCase()}</span>;
    if (typeof val==="boolean") return <span style={{color:val?"var(--green,var(--green))":"var(--red,var(--red))"}}>{val?"YES":"NO"}</span>;
    if ((key.includes("At")||key.includes("date"))&&val) return <span style={{color:"var(--muted)"}} title={new Date(val).toLocaleString()}>{ago(val)}</span>;
    if (key==="views"||key==="replyCount") return <span style={{color:"var(--cyan,var(--cyan))"}}>{fmt(val)}</span>;
    const str = typeof val==="object" ? JSON.stringify(val).slice(0,40) : String(val).slice(0,55);
    return <span style={{color:"var(--muted)"}}>{str}{str.length>=55?"...":""}</span>;
  };

  return (
    <div>
      {editDoc && <EditModal doc={editDoc} coll={coll} token={token} onClose={()=>setEditDoc(null)} onSaved={()=>{toast.add("Saved");load();}} />}
      {userDoc && <UserActionsModal user={userDoc} token={token} onClose={()=>setUserDoc(null)} onRefresh={load} toast={toast} />}

      {/* Collection tabs */}
      <div style={{ display:"flex", gap:4, flexWrap:"wrap", marginBottom:14 }}>
        {COLLS.map(c => (
          <button key={c} onClick={()=>setColl(c)} style={{
            fontFamily:"var(--font-mono,monospace)", fontSize: 11, letterSpacing:2, padding:"5px 12px",
            background:coll===c?"var(--green,var(--green))":"var(--bg)", color:coll===c?"#000":"var(--muted)",
            border:`1px solid ${coll===c?"var(--green,var(--green))":"var(--border)"}`, cursor:"pointer",
          }}>{c.toUpperCase()}</button>
        ))}
        <button onClick={load} style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, padding:"5px 10px", background:"transparent", color:"var(--cyan,var(--cyan))", border:"1px solid #1e2d45", cursor:"pointer" }}>REFRESH</button>
      </div>

      {/* Search */}
      <div style={{ display:"flex", gap:8, marginBottom:14 }}>
        <input value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){setPage(1);setQuery(search);}}}
          placeholder={`Search ${coll}...`} aria-label={`Search ${coll}`}
          style={{ flex:1, background:"var(--bg)", border:"1px solid #1e2d45", color:"var(--text)", fontFamily:"var(--font-mono,monospace)", fontSize:11, padding:"8px 12px", outline:"none" }} />
        <button onClick={()=>{setPage(1);setQuery(search);}} style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, padding:"8px 14px", background:"color-mix(in srgb, var(--cyan) 6%, transparent)", color:"var(--cyan,var(--cyan))", border:"1px solid var(--cyan)33", cursor:"pointer" }}>SEARCH</button>
        {search && <button aria-label="Clear search" onClick={()=>{setSearch("");setPage(1);setQuery("");}} style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, padding:"8px 12px", background:"transparent", color:"var(--muted)", border:"1px solid #1e2d45", cursor:"pointer" }}>x</button>}
      </div>

      {loading && <div style={{ textAlign:"center", padding:40, fontFamily:"var(--font-mono,monospace)", fontSize: 11, color:"var(--border)", letterSpacing:3 }}>LOADING...</div>}

      {data && !loading && (
        <>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
            <div style={{ fontSize: 11, fontFamily:"var(--font-mono,monospace)", color:"var(--border)", letterSpacing:2 }}>
              {fmt(data.total)} DOCS · PAGE {data.page}/{data.pages}
              {selected.size>0 && <span style={{color:"var(--yellow,#ffd700)",marginLeft:10}}>{selected.size} SELECTED</span>}
            </div>
            {selected.size>0 && (
              <button onClick={async ()=>{
                const ok = await confirm({ title: `Delete ${selected.size} Documents`, message: `Permanently delete ${selected.size} selected documents? This cannot be undone.`, variant: 'danger', confirmLabel: `DELETE ${selected.size}` });
                if (!ok) return;
                Promise.all([...selected].map(id => api.delete(ap(`/api/admin/collection/${coll}/${id}`), authCfg(token))))
                  .then(()=>{toast.add(`Deleted ${selected.size} docs`);load();})
                  .catch(()=>toast.add("Bulk delete failed","error"));
              }} style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, padding:"4px 10px", background:"color-mix(in srgb, var(--red) 8%, transparent)", color:"var(--red,var(--red))", border:"1px solid color-mix(in srgb, var(--red) 25%, transparent)", cursor:"pointer" }}>
                DELETE ({selected.size})
              </button>
            )}
          </div>

          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontFamily:"var(--font-mono,monospace)", fontSize:11 }}>
              <thead>
                <tr style={{ borderBottom:"1px solid #1e2d45" }}>
                  <th style={{ padding:"8px 10px", width:28 }}>
                    <Checkbox checked={allSelected} onChange={()=>setSelected(allSelected?new Set():new Set(data.docs.map(d=>d._id)))} style={{ width:24, height:24, padding:0, justifyContent:"center" }} />
                  </th>
                  {cols.map(k => <th key={k} style={{ padding:"8px 10px", textAlign:"left", color:"var(--muted)", fontSize: 11, letterSpacing:2, whiteSpace:"nowrap" }}>{k.toUpperCase()}</th>)}
                  <th style={{ padding:"8px 10px", color:"var(--muted)", fontSize: 11, textAlign:"right" }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {data.docs.map((doc, i) => (
                  <tr key={i} style={{ borderBottom:"1px solid #0a1016", background:selected.has(doc._id)?"color-mix(in srgb, var(--green) 2%, transparent)":"transparent", transition:"background 0.1s" }}
                    onMouseEnter={e=>{if(!selected.has(doc._id))e.currentTarget.style.background="rgba(255,255,255,0.01)"}}
                    onMouseLeave={e=>{if(!selected.has(doc._id))e.currentTarget.style.background="transparent"}}>
                    <td style={{ padding:"8px 10px" }}>
                      <Checkbox checked={selected.has(doc._id)} onChange={()=>toggle(doc._id)} style={{ width:24, height:24, padding:0, justifyContent:"center" }} />
                    </td>
                    {cols.map(k => (
                      <td key={k} title={String(doc[k])} style={{ padding:"8px 10px", maxWidth:180, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                        {cell(k, doc[k])}
                      </td>
                    ))}
                    <td style={{ padding:"8px 10px", whiteSpace:"nowrap" }}>
                      <div style={{ display:"flex", gap:4, justifyContent:"flex-end" }}>
                        <Btn tiny label="EDIT"     color="var(--cyan,var(--cyan))" onClick={()=>setEditDoc(doc)} />
                        {coll==="users"      && <Btn tiny label="MANAGE"                             color="var(--yellow,#ffd700)"  onClick={()=>setUserDoc(normalizeUserDoc(doc))} />}
                        {coll==="posts"      && <Btn tiny label={doc.published?"UNPUBLISH":"PUBLISH"} color={doc.published?"var(--orange,var(--orange))":"var(--green,var(--green))"} disabled={busy===`p${doc._id}`} onClick={()=>qa(`p${doc._id}`,`posts/${doc._id}/toggle-publish`)} />}
                        {coll==="threads"    && <Btn tiny label={doc.pinned?"UNPIN":"PIN"}            color="var(--yellow,#ffd700)"  disabled={busy===`pi${doc._id}`} onClick={()=>qa(`pi${doc._id}`,`threads/${doc._id}/toggle-pin`)} />}
                        {coll==="threads"    && <Btn tiny label={doc.locked?"UNLOCK":"LOCK"}          color={doc.locked?"var(--green,var(--green))":"var(--red,var(--red))"} disabled={busy===`lo${doc._id}`} onClick={()=>qa(`lo${doc._id}`,`threads/${doc._id}/toggle-lock`)} />}
                        {coll==="newsletter" && <Btn tiny label={doc.active?"DEACTIVATE":"ACTIVATE"}  color={doc.active?"var(--red,var(--red))":"var(--green,var(--green))"}  disabled={busy===`n${doc._id}`} onClick={()=>qa(`n${doc._id}`,`newsletter/${doc._id}/toggle-active`)} />}
                        <Btn tiny label={deleting===doc._id?"...":"DEL"} danger disabled={deleting===doc._id} onClick={()=>del(doc._id)} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div style={{ display:"flex", gap:8, marginTop:16, alignItems:"center", justifyContent:"space-between" }}>
            <div style={{ display:"flex", gap:6 }}>
              <button disabled={page<=1} onClick={()=>setPage(1)}        style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, padding:"5px 10px", background:"var(--bg)", color:page<=1?"var(--border)":"var(--muted)", border:"1px solid #1e2d45", cursor:page<=1?"not-allowed":"pointer" }}>FIRST</button>
              <button disabled={page<=1} onClick={()=>setPage(p=>p-1)} style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, padding:"5px 14px", background:"var(--bg)", color:page<=1?"var(--border)":"var(--cyan,var(--cyan))", border:"1px solid #1e2d45", cursor:page<=1?"not-allowed":"pointer" }}>PREV</button>
            </div>
            <span style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, color:"var(--border)" }}>Page {page} / {data.pages} · {fmt(data.total)} total</span>
            <div style={{ display:"flex", gap:6 }}>
              <button disabled={page>=data.pages} onClick={()=>setPage(p=>p+1)}       style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, padding:"5px 14px", background:"var(--bg)", color:page>=data.pages?"var(--border)":"var(--cyan,var(--cyan))", border:"1px solid #1e2d45", cursor:page>=data.pages?"not-allowed":"pointer" }}>NEXT</button>
              <button disabled={page>=data.pages} onClick={()=>setPage(data.pages)} style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, padding:"5px 10px", background:"var(--bg)", color:page>=data.pages?"var(--border)":"var(--muted)", border:"1px solid #1e2d45", cursor:page>=data.pages?"not-allowed":"pointer" }}>LAST</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ------------------------- E -------------------------XPORT PANEL ----------
function ExportPanel({ token, toast, stats }) {
  const [collection, setCollection] = useState("users");
  const [format, setFormat]         = useState("json");
  const [loading, setLoading]       = useState(false);
  const [limit, setLimit]           = useState(1000);
  const COLLS = ["users","posts","threads","replies","contacts","messages","media","staff","newsletter"];

  const csvEscape = (v) => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const doExport = async () => {
    setLoading(true);
    try {
      const perPage = 500;
      let docs = [];
      let total = Infinity;
      let page = 1;
      while (docs.length < limit && docs.length < total) {
        const res = await api.get(ap(`/api/admin/stats/collection/${collection}?page=${page}&limit=${Math.min(perPage, limit)}`), authCfg(token));
        const data = res.data;
        const batch = data.docs || [];
        if (page === 1) total = data.total ?? batch.length;
        if (batch.length === 0) break;
        docs = docs.concat(batch);
        if (docs.length >= total || batch.length < perPage) break;
        page += 1;
      }
      docs = docs.slice(0, limit);
      total = total === Infinity ? docs.length : total;
      let blob, filename;
      if (format === "json") {
        blob = new Blob([JSON.stringify(docs, null, 2)], { type: "application/json" });
        filename = `${collection}_export_${new Date().toISOString().slice(0,10)}.json`;
      } else {
        if (!docs.length) { toast.add("No data to export","error"); setLoading(false); return; }
        const keys = Object.keys(docs[0]).filter(k => k !== "__v");
        const rows = [keys.map(csvEscape).join(","), ...docs.map(d => keys.map(k => csvEscape(d[k])).join(","))];
        blob = new Blob([rows.join("\n")], { type: "text/csv" });
        filename = `${collection}_export_${new Date().toISOString().slice(0,10)}.csv`;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
      toast.add(`Exported ${docs.length} of ${total.toLocaleString()} ${collection} records as ${format.toUpperCase()}`);
    } catch(e) { toast.add("Export failed: " + e.message, "error"); }
    finally { setLoading(false); }
  };

  const inp = { background:"var(--bg)", border:"1px solid #1e2d45", color:"var(--text)", fontFamily:"var(--font-mono,monospace)", fontSize:12, padding:"10px 12px", outline:"none", width:"100%", boxSizing:"border-box" };

  return (
    <div style={{ maxWidth: 600 }}>
      <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, letterSpacing:3, color:"var(--border)", marginBottom:20 }}>D⬇ EXPORT</div>
      <div style={{ background:"var(--bg2)", border:"1px solid #0f1a26", padding:24, display:"flex", flexDirection:"column", gap:16 }}>
        <div>
          <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, letterSpacing:2, color:"var(--muted)", marginBottom:8 }}>COLLECTION</div>
          <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
            {COLLS.map(c => (
              <button key={c} onClick={() => setCollection(c)} style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, letterSpacing:2, padding:"5px 12px", background:collection===c?"var(--green,var(--green))":"var(--bg)", color:collection===c?"#000":"var(--muted)", border:`1px solid ${collection===c?"var(--green,var(--green))":"var(--border)"}`, cursor:"pointer" }}>{c.toUpperCase()}</button>
            ))}
          </div>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          <div>
            <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, letterSpacing:2, color:"var(--muted)", marginBottom:8 }}>FORMAT</div>
            <div style={{ display:"flex", gap:8 }}>
              {["json","csv"].map(f => (
                <button key={f} onClick={() => setFormat(f)} style={{ flex:1, padding:"10px", fontFamily:"var(--font-mono,monospace)", fontSize: 11, background:format===f?"var(--cyan,var(--cyan))":"var(--bg)", color:format===f?"#000":"var(--muted)", border:`1px solid ${format===f?"var(--cyan,var(--cyan))":"var(--border)"}`, cursor:"pointer", fontWeight:format===f?700:400 }}>
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, letterSpacing:2, color:"var(--muted)", marginBottom:8 }}>MAX RECORDS</div>
            <input type="number" value={limit} onChange={e => setLimit(Math.max(1, Math.min(10000, Number(e.target.value))))} style={inp} min={1} max={10000} />
          </div>
        </div>
        <div style={{ padding:"12px 14px", background:"color-mix(in srgb, var(--green) 3%, transparent)", border:"1px solid var(--green)20", fontFamily:"var(--font-mono,monospace)", fontSize:11, color:"var(--muted)", lineHeight:1.6 }}>
          Exporting <span style={{color:"var(--green,var(--green))"}}>{collection}</span> collection as <span style={{color:"var(--cyan,var(--cyan))"}}>{format.toUpperCase()}</span> (up to {limit.toLocaleString()} records)
        </div>
        <button onClick={doExport} disabled={loading} style={{ padding:"13px", background:loading?"var(--border)":"var(--green,var(--green))", color:loading?"var(--muted)":"#000", fontFamily:"var(--font-mono,monospace)", fontSize:11, letterSpacing:3, fontWeight:700, border:"none", cursor:loading?"not-allowed":"pointer" }}>
          {loading ? "⬇ EXPORTING..." : `⬇ EXPORT ${format.toUpperCase()}`}
        </button>
      </div>
      {/* Quick stats */}
      {stats?.counts && (
        <div style={{ marginTop:20, background:"var(--bg2)", border:"1px solid #0f1a26", padding:20 }}>
          <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, letterSpacing:3, color:"var(--border)", marginBottom:14 }}>COLLECTION SIZES</div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))", gap:8 }}>
            {Object.entries({ users: stats.counts?.users?.total, posts: stats.counts?.posts?.total, threads: stats.counts?.forum?.threads, replies: stats.counts?.forum?.replies, contacts: stats.counts?.contacts, media: stats.counts?.media, staff: stats.counts?.staff, newsletter: stats.counts?.newsletter?.total }).map(([k,v]) => (
              <Clickable key={k} label={`Collection ${k}`} onClick={() => setCollection(k)} style={{ padding:"12px", background:collection===k?"color-mix(in srgb, var(--green) 3%, transparent)":"var(--bg)", border:`1px solid ${collection===k?"color-mix(in srgb, var(--green) 20%, transparent)":"var(--border)"}`, cursor:"pointer" }}>
                <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, letterSpacing:2, color:"var(--muted)", marginBottom:4 }}>{k.toUpperCase()}</div>
                <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize:18, fontWeight:700, color:"var(--green,var(--green))" }}>{(v||0).toLocaleString()}</div>
              </Clickable>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ------------------------- Q -------------------------UERY PANEL ----------
function QueryPanel({ token, toast }) {
  const [collection, setCollection] = useState("users");
  const [filterKey, setFilterKey]   = useState("");
  const [filterVal, setFilterVal]   = useState("");
  const [sortKey, setSortKey]       = useState("createdAt");
  const [sortDir, setSortDir]       = useState("-1");
  const [limit, setLimit]           = useState(20);
  const [results, setResults]       = useState(null);
  const [loading, setLoading]       = useState(false);
  const COLLS = ["users","posts","threads","replies","contacts","messages","media","staff","newsletter"];

  const inp = { background:"var(--bg)", border:"1px solid #1e2d45", color:"var(--text)", fontFamily:"var(--font-mono,monospace)", fontSize:12, padding:"10px 12px", outline:"none", width:"100%", boxSizing:"border-box" };

  const runQuery = async () => {
    setLoading(true);
    try {
      const q = filterKey && filterVal ? `&search=${encodeURIComponent(filterVal)}` : "";
      const res = await api.get(ap(`/api/admin/stats/collection/${collection}?page=1&limit=${limit}${q}`), authCfg(token));
      const data = res.data;
      setResults(data);
      toast.add(`Found ${data.total} records`);
    } catch(e) { toast.add("Query failed: "+e.message, "error"); }
    finally { setLoading(false); }
  };

  return (
    <div>
      <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, letterSpacing:3, color:"var(--border)", marginBottom:20 }}>COLLECTION QUERY BUILDER</div>
      <div style={{ background:"var(--bg2)", border:"1px solid #0f1a26", padding:24, marginBottom:16 }}>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))", gap:12, marginBottom:16 }}>
          <div>
            <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, letterSpacing:2, color:"var(--muted)", marginBottom:6 }}>COLLECTION</div>
            <Select value={collection} onChange={setCollection} options={COLLS.map(c => [c, c])} />
          </div>
          <div>
            <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, letterSpacing:2, color:"var(--muted)", marginBottom:6 }}>SEARCH FIELD</div>
            <input value={filterKey} onChange={e => setFilterKey(e.target.value)} placeholder="e.g. email, username" style={inp} />
          </div>
          <div>
            <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, letterSpacing:2, color:"var(--muted)", marginBottom:6 }}>SEARCH VALUE</div>
            <input value={filterVal} onChange={e => setFilterVal(e.target.value)} placeholder="search text..." style={inp} onKeyDown={e => e.key==="Enter" && runQuery()} />
          </div>
          <div>
            <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, letterSpacing:2, color:"var(--muted)", marginBottom:6 }}>LIMIT</div>
            <input type="number" value={limit} onChange={e => setLimit(Math.max(1,Math.min(100,Number(e.target.value))))} style={inp} min={1} max={100} />
          </div>
        </div>
        <button onClick={runQuery} disabled={loading} style={{ padding:"11px 28px", background:"var(--cyan,var(--cyan))", color:"#000", fontFamily:"var(--font-mono,monospace)", fontSize: 11, letterSpacing:2, fontWeight:700, border:"none", cursor:"pointer" }}>
          {loading ? "RUNNING..." : "RUN QUERY"}
        </button>
      </div>

      {results && (
        <div style={{ background:"var(--bg2)", border:"1px solid #0f1a26", padding:20 }}>
          <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, color:"var(--border)", marginBottom:14 }}>
            RESULTS - {results.total?.toLocaleString()} total · showing {results.docs?.length}
          </div>
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontFamily:"var(--font-mono,monospace)", fontSize:11 }}>
              <thead>
                <tr style={{ borderBottom:"1px solid #1e2d45" }}>
                  {results.docs?.[0] && Object.keys(results.docs[0]).filter(k => !["__v","password","verifyToken","resetToken"].includes(k)).slice(0,6).map(k => (
                    <th key={k} style={{ padding:"8px 10px", textAlign:"left", color:"var(--muted)", fontSize: 11, letterSpacing:2 }}>{k.toUpperCase()}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(results.docs||[]).map((doc,i) => (
                  <tr key={i} style={{ borderBottom:"1px solid #0a1016" }}
                    onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.01)"}
                    onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    {Object.entries(doc).filter(([k]) => !["__v","password","verifyToken","resetToken"].includes(k)).slice(0,6).map(([k,v]) => (
                      <td key={k} style={{ padding:"8px 10px", color:"var(--muted)", maxWidth:200, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                        {typeof v==="boolean"? (v?"YES":"NO") : v===null||v===undefined?"-" : String(v).slice(0,60)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ------------------------- M -------------------------AINTENANCE PANEL ----------
function MaintenancePanel({ token, toast, onRefresh }) {
  const [busy, setBusy] = useState("");
  const { confirm } = useDialog();

  const run = async (label, path, method="POST") => {
    const ok = await confirm({ title: label, message: 'This maintenance operation may be irreversible. Proceed?', variant: 'warning', confirmLabel: 'RUN' });
    if (!ok) return;
    setBusy(label);
    try {
      const data = await adminAction(token, path);
      void method;
      toast.add(data.message || label + " completed");
      onRefresh?.();
    } catch(e) { toast.add(e.message, "error"); }
    finally { setBusy(""); }
  };

  const actions = [
    { group:"DATABASE", items:[
      { label:"Clear Old Sessions",    path:"db/clear-sessions",    color:"var(--orange,var(--orange))", desc:"Remove expired auth sessions from DB" },
      { label:"Remove Unverified Users", path:"db/purge-unverified", color:"var(--red,var(--red))", desc:"Delete accounts unverified after 7+ days" },
      { label:"Compact Collections",   path:"db/compact",           color:"var(--cyan,var(--cyan))", desc:"Optimize storage for all collections" },
    ]},
    { group:"CONTENT", items:[
      { label:"Recalculate View Counts", path:"posts/recalculate-views", color:"var(--green,var(--green))", desc:"Recount views across all blog posts" },
      { label:"Clear Chat History",    path:"chat/clear-all",       color:"var(--red,var(--red))", desc:"WARN Permanently deletes all chat messages" },
      { label:"Rebuild Search Index",  path:"search/rebuild",       color:"var(--purple,#a78bfa)", desc:"Rebuild full-text search indexes" },
    ]},
    { group:"CACHE", items:[
      { label:"Flush API Cache",       path:"cache/flush",          color:"var(--yellow,#ffd700)", desc:"Clear all server-side caches" },
      { label:"Refresh Stats",         path:"stats/refresh",        color:"var(--green,var(--green))", desc:"Force refresh of dashboard statistics" },
    ]},
  ];

  return (
    <div style={{ maxWidth:700 }}>
      <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, letterSpacing:3, color:"var(--border)", marginBottom:20 }}>DATABASE MAINTENANCE</div>
      <div style={{ background:"color-mix(in srgb, var(--red) 8%, transparent)", border:"1px solid color-mix(in srgb, var(--red) 25%, transparent)", padding:"12px 16px", marginBottom:20, fontFamily:"var(--font-mono,monospace)", fontSize:11, color:"var(--red,var(--red))", lineHeight:1.6 }}>
        WARN Maintenance operations may be irreversible. Make sure you have a backup before proceeding.
      </div>
      {actions.map(({group, items}) => (
        <div key={group} style={{ marginBottom:20 }}>
          <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, letterSpacing:3, color:"var(--border)", marginBottom:10 }}>{group}</div>
          <div style={{ display:"grid", gap:8 }}>
            {items.map(({label, path, color, desc}) => (
              <div key={label} style={{ background:"var(--bg2)", border:"1px solid #0f1a26", padding:"16px 20px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:20 }}>
                <div>
                  <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize:12, color:"var(--text)", marginBottom:4 }}>{label}</div>
                  <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, color:"var(--muted)", lineHeight:1.5 }}>{desc}</div>
                </div>
                <button disabled={!!busy} onClick={() => run(label, path)} style={{
                  padding:"8px 18px", background:`${color}15`, color, border:`1px solid ${color}44`,
                  fontFamily:"var(--font-mono,monospace)", fontSize: 11, letterSpacing:1, cursor:busy?"not-allowed":"pointer",
                  whiteSpace:"nowrap", opacity:busy===label?0.5:1, flexShrink:0,
                }}>{busy===label?"RUNNING...":"RUN"}</button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ------------------------- D -------------------------B HEALTH TAB ----------

export {
  ROLE_META, useToasts, ToastContainer, Btn, StatCard, MiniChart, FeedRow,
  UserActionsModal, EditModal, CollectionBrowser, ExportPanel, QueryPanel, MaintenancePanel,
  ago, fmt, ap, authCfg,
}
