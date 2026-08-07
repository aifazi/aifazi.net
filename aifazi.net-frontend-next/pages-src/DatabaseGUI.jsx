'use client'
import React, { useState, useEffect, useCallback, useRef } from "react";
import { useDialog } from "../core/dialog.jsx";
import { useNotify } from "../core/notify.jsx";
import { Checkbox, Select } from "../core/ui.jsx";
import { getRole, getAuthToken } from "../lib/api";
import api from "../lib/api";  // <- use the internal axios proxy (handles /api prefix + auth token)

// API_URL is intentionally empty - all requests go through the Next.js /api proxy
// which stamps X-Internal-Token and injects the Authorization header automatically.
const API_URL = "";

const ago = (d) => {
  const s = Math.floor((Date.now() - new Date(d)) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};
const fmt = (n) => (n ?? 0).toLocaleString();

const ROLE_META = {
  admin:     { color: "var(--green,#00ff88)", bg: "color-mix(in srgb, var(--green) 8%, transparent)", label: "ADMIN" },
  moderator: { color: "var(--cyan,#00d4ff)", bg: "color-mix(in srgb, var(--cyan) 8%, transparent)", label: "MOD" },
  editor:    { color: "var(--orange,#ff6b35)", bg: "rgba(255,107,53,0.08)", label: "EDITOR" },
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
  const res = await fetch(`/api/admin/stats/actions/${path}`, {
    method:"POST",
    headers:{"Content-Type":"application/json", Authorization:`Bearer ${token}`},
    ...(body ? {body:JSON.stringify(body)} : {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

function Btn({ label, color="var(--cyan,#00d4ff)", onClick, disabled, tiny, danger }) {
  const c = danger ? "var(--red,#ff4757)" : color;
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

function StatCard({ label, value, sub, color="var(--green,#00ff88)", icon, trend }) {
  return (
    <div style={{ background:"var(--bg)", border:`1px solid ${color}1a`, padding:"18px 20px", position:"relative", overflow:"hidden" }}>
      <div style={{ position:"absolute", top:0, left:0, right:0, height:2, background:`linear-gradient(90deg,${color},transparent)` }} />
      <div style={{ fontSize:9, fontFamily:"var(--font-mono,monospace)", letterSpacing:3, color:"var(--muted)", marginBottom:10 }}>{icon} {label}</div>
      <div style={{ fontSize:30, fontWeight:900, color, fontFamily:"var(--font-mono,monospace)", lineHeight:1 }}>{fmt(value)}</div>
      {sub && <div style={{ fontSize:10, fontFamily:"var(--font-mono,monospace)", color:"var(--muted)", marginTop:6, lineHeight:1.5 }}>{sub}</div>}
      {trend !== undefined && (
        <div style={{ position:"absolute", top:14, right:14, fontFamily:"var(--font-mono,monospace)", fontSize:9, color:trend>0?"var(--green,#00ff88)":trend<0?"var(--red,#ff4757)":"var(--muted)" }}>
          {trend>0?`+${trend}`:trend<0?`-${Math.abs(trend)}`:"-"} today
        </div>
      )}
    </div>
  );
}

function MiniChart({ data=[], color="var(--green,#00ff88)", label="" }) {
  if (!data.length) return <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize:10, color:"var(--border)", padding:"20px 0", textAlign:"center" }}>NO DATA YET</div>;
  const max = Math.max(...data.map(d => d.count), 1);
  return (
    <div>
      <div style={{ fontSize:9, fontFamily:"var(--font-mono,monospace)", letterSpacing:2, color:"var(--muted)", marginBottom:10 }}>{label}</div>
      <div style={{ display:"flex", alignItems:"flex-end", gap:2, height:56 }}>
        {data.slice(-30).map((d, i) => (
          <div key={i} title={`${d._id}: ${d.count}`} style={{
            flex:1, height:`${Math.max(4,(d.count/max)*100)}%`,
            background:`linear-gradient(180deg,${color},${color}66)`,
            opacity:0.4+(i/data.length)*0.6, minWidth:3, borderRadius:"2px 2px 0 0", transition:"height 0.3s",
          }} />
        ))}
      </div>
      <div style={{ display:"flex", justifyContent:"space-between", marginTop:4, fontFamily:"var(--font-mono,monospace)", fontSize:8, color:"var(--border)" }}>
        <span>{data[0]?._id}</span><span>{data[data.length-1]?._id}</span>
      </div>
    </div>
  );
}

function FeedRow({ icon, title, sub, time, color="var(--green,#00ff88)" }) {
  return (
    <div style={{ display:"flex", gap:10, padding:"9px 0", borderBottom:"1px solid #0a1016", alignItems:"flex-start" }}>
      <div style={{ width:26, height:26, background:`${color}12`, border:`1px solid ${color}30`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, flexShrink:0 }}>{icon}</div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize:11, color:"var(--text)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{title}</div>
        {sub && <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize:9, color:"var(--muted)", marginTop:2, lineHeight:1.4 }}>{sub}</div>}
      </div>
      <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize:9, color:"var(--border)", flexShrink:0 }}>{time}</div>
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
      <div style={{ background:"var(--bg)", border:"1px solid #00d4ff22", width:"100%", maxWidth:600, maxHeight:"92vh", display:"flex", flexDirection:"column", boxShadow:"0 0 80px color-mix(in srgb, var(--cyan) 8%, transparent)" }}>

        {/* Header */}
        <div style={{ padding:"20px 24px", background:"var(--bg2)", borderBottom:"1px solid #0f1a26", flexShrink:0 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
            <div style={{ display:"flex", alignItems:"center", gap:14 }}>
              <div style={{ width:46, height:46, background:roleBg(u.role), border:`1px solid ${roleColor(u.role)}44`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, fontWeight:700, color:roleColor(u.role) }}>
                {u.username?.[0]?.toUpperCase()||"?"}
              </div>
              <div>
                <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize:9, letterSpacing:3, color:"var(--cyan,#00d4ff)", marginBottom:4 }}>USER MANAGEMENT</div>
                <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize:18, fontWeight:700, color:"var(--text)", lineHeight:1 }}>{u.username}</div>
                <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize:10, color:"var(--muted)", marginTop:3 }}>{u.email}</div>
              </div>
            </div>
            <button onClick={onClose} style={{ background:"none", border:"none", color:"var(--muted)", cursor:"pointer", fontSize:20, padding:4, lineHeight:1 }}>x</button>
          </div>
          <div style={{ display:"flex", gap:6, marginTop:14, flexWrap:"wrap", alignItems:"center" }}>
            <span style={{ fontFamily:"var(--font-mono,monospace)", fontSize:8, letterSpacing:2, padding:"4px 10px", background:roleBg(u.role), color:roleColor(u.role), border:`1px solid ${roleColor(u.role)}33` }}>
              {(ROLE_META[u.role]?.label||"USER")}
            </span>
            <span style={{ fontFamily:"var(--font-mono,monospace)", fontSize:8, padding:"4px 10px", background:u.emailVerified?"color-mix(in srgb, var(--green) 6%, transparent)":"rgba(255,71,87,0.06)", color:u.emailVerified?"var(--green,#00ff88)":"var(--red,#ff4757)", border:`1px solid ${u.emailVerified?"color-mix(in srgb, var(--green) 19%, transparent)":"rgba(255,71,87,0.25)"}` }}>
              {u.emailVerified?"YES VERIFIED":"NO UNVERIFIED"}
            </span>
            {u.banned && <span style={{ fontFamily:"var(--font-mono,monospace)", fontSize:8, padding:"4px 10px", background:"rgba(255,71,87,0.06)", color:"var(--red,#ff4757)", border:"1px solid #ff475730" }}>BAN BANNED</span>}
            {u.createdAt && <span style={{ fontFamily:"var(--font-mono,monospace)", fontSize:8, color:"var(--muted)" }}>Joined {ago(u.createdAt)}</span>}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display:"flex", borderBottom:"1px solid #0f1a26", flexShrink:0 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              flex:1, padding:"11px 6px", fontFamily:"var(--font-mono,monospace)", fontSize:8, letterSpacing:1,
              background:tab===t.id?"color-mix(in srgb, var(--cyan) 3%, transparent)":"transparent",
              borderBottom:tab===t.id?"2px solid #00d4ff":"2px solid transparent",
              border:"none", color:tab===t.id?"var(--cyan,#00d4ff)":"var(--muted)", cursor:"pointer",
            }}>{t.label}</button>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex:1, overflowY:"auto", padding:"20px 24px" }}>

          {tab==="quick" && (
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              <div style={{ background:"var(--bg2)", border:"1px solid #0f1a26", padding:16 }}>
                <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize:8, letterSpacing:3, color:"var(--muted)", marginBottom:12 }}>EMAIL VERIFICATION</div>
                <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                  <Btn label={busy==="verify"?"WORKING...":"YES FORCE VERIFY"} color="var(--green,#00ff88)"
                    disabled={u.emailVerified||!!busy} onClick={() => run("verify",`users/${u._id}/verify`)} />
                  <Btn label={busy==="send-ver"?"SENDING...":"EMAIL SEND VERIFICATION"} color="var(--cyan,#00d4ff)"
                    disabled={u.emailVerified||!!busy} onClick={() => run("send-ver",`users/${u._id}/send-verification`)} />
                </div>
                {u.emailVerified && <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize:9, color:"var(--green,#00ff88)", marginTop:8 }}>YES Already verified</div>}
              </div>

              <div style={{ background:"var(--bg2)", border:"1px solid #0f1a26", padding:16 }}>
                <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize:8, letterSpacing:3, color:"var(--muted)", marginBottom:12 }}>BAN MANAGEMENT</div>
                {u.banned ? (
                  <div>
                    <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize:10, color:"var(--red,#ff4757)", marginBottom:10, padding:"8px 10px", background:"rgba(255,71,87,0.03)", border:"1px solid #ff475720", lineHeight:1.5 }}>
                      BAN Reason: {u.banReason||"No reason given"}
                    </div>
                    <Btn label={busy==="unban"?"WORKING...":"YES UNBAN USER"} color="var(--green,#00ff88)" disabled={!!busy} onClick={() => run("unban",`users/${u._id}/unban`)} />
                  </div>
                ) : (
                  <div>
                    <input value={banReason} onChange={e => setBanReason(e.target.value)} placeholder="Ban reason (optional)" style={{...inp, marginBottom:10}} />
                    <Btn label={busy==="ban"?"BANNING...":"BAN BAN USER"} danger disabled={!!busy} onClick={() => run("ban",`users/${u._id}/ban`,{reason:banReason})} />
                  </div>
                )}
              </div>

              <div style={{ background:"var(--bg2)", border:"1px solid #0f1a26", padding:16 }}>
                <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize:8, letterSpacing:3, color:"var(--muted)", marginBottom:12 }}>PASSWORD RESET LINK</div>
                <Btn label={busy==="send-reset"?"SENDING...":"LINK SEND RESET EMAIL"} color="var(--cyan,#00d4ff)" disabled={!!busy} onClick={() => run("send-reset",`users/${u._id}/send-reset`)} />
                <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize:9, color:"var(--muted)", marginTop:8 }}>1-hour link sent to {u.email}</div>
              </div>
            </div>
          )}

          {tab==="password" && (
            <div style={{ background:"var(--bg2)", border:"1px solid #0f1a26", padding:16 }}>
              <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize:8, letterSpacing:3, color:"var(--muted)", marginBottom:12 }}>SET PASSWORD DIRECTLY</div>
              <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize:10, color:"var(--red,#ff4757)", marginBottom:14, padding:"10px 12px", background:"rgba(255,71,87,0.03)", border:"1px solid #ff475720", lineHeight:1.6 }}>
                WARN Immediately changes the password with no notification to the user.
              </div>
              <div style={{ position:"relative", marginBottom:10 }}>
                <input type={showPass?"text":"password"} value={newPass} onChange={e => setNewPass(e.target.value)}
                  placeholder="New password (min 8 chars)" style={{...inp, paddingRight:40}} />
                <button onClick={() => setShowPass(p=>!p)} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", color:"var(--muted)", cursor:"pointer", fontSize:13 }}>{showPass?"HIDE":"SHOW"}</button>
              </div>
              {newPass.length>0 && newPass.length<8 && <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize:9, color:"var(--red,#ff4757)", marginBottom:8 }}>Min 8 characters ({newPass.length}/8)</div>}
              <div style={{ display:"flex", gap:8 }}>
                <Btn label={busy==="set-pass"?"UPDATING...":"KEY SET PASSWORD"} color="var(--orange,#ff6b35)"
                  disabled={newPass.length<8||!!busy} onClick={() => run("set-pass",`users/${u._id}/set-password`,{password:newPass})} />
                <Btn label="SEND RESET LINK" color="var(--cyan,#00d4ff)" disabled={!!busy} onClick={() => run("send-reset",`users/${u._id}/send-reset`)} />
              </div>
            </div>
          )}

          {tab==="role" && (
            <div style={{ background:"var(--bg2)", border:"1px solid #0f1a26", padding:16 }}>
              <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize:8, letterSpacing:3, color:"var(--muted)", marginBottom:16 }}>CHANGE ROLE</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:16 }}>
                {[
                  {r:"user",      desc:"Forum member. No admin access."},
                  {r:"moderator", desc:"Forum moderation and user management."},
                  {r:"editor",    desc:"Can create and edit blog posts."},
                  {r:"chat",      desc:"Private chat system access only."},
                  {r:"admin",     desc:"Full admin panel. All permissions."},
                ].map(({r, desc}) => (
                  <div key={r} onClick={() => setNewRole(r)} style={{
                    padding:"14px", cursor:"pointer", transition:"all 0.15s",
                    background:newRole===r?roleBg(r):"var(--bg)",
                    border:`1px solid ${newRole===r?roleColor(r)+"55":"var(--border)"}`,
                  }}>
                    <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize:10, color:roleColor(r), fontWeight:700, marginBottom:4, letterSpacing:1 }}>
                      {newRole===r?"* ":"o "}{r.toUpperCase()}
                    </div>
                    <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize:9, color:"var(--muted)", lineHeight:1.4 }}>{desc}</div>
                  </div>
                ))}
              </div>
              <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                <Btn label={busy==="role"?"UPDATING...":` SET -> ${newRole.toUpperCase()}`}
                  color={roleColor(newRole)} disabled={newRole===(u.role||"user")||!!busy}
                  onClick={() => run("role",`users/${u._id}/role`,{role:newRole})} />
                {newRole===(u.role||"user") && <span style={{ fontFamily:"var(--font-mono,monospace)", fontSize:9, color:"var(--muted)" }}>Already has this role</span>}
              </div>
            </div>
          )}

          {tab==="email" && (
            <div style={{ background:"var(--bg2)", border:"1px solid #0f1a26", padding:16 }}>
              <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize:8, letterSpacing:3, color:"var(--muted)", marginBottom:12 }}>SEND EMAIL TO {u.email}</div>
              <input value={emailSubject} onChange={e => setEmailSubject(e.target.value)} placeholder="Subject" style={{...inp, marginBottom:10}} />
              <textarea value={emailBody} onChange={e => setEmailBody(e.target.value)} placeholder="Message body..." rows={6}
                style={{...inp, resize:"vertical", marginBottom:12, lineHeight:1.6}} />
              <Btn label={busy==="send-email"?"SENDING...":` EMAIL SEND EMAIL`} color="var(--cyan,#00d4ff)"
                disabled={!emailSubject.trim()||!emailBody.trim()||!!busy}
                onClick={() => run("send-email",`users/${u._id}/send-email`,{subject:emailSubject,message:emailBody})} />
            </div>
          )}

          {tab==="data" && (
            <div style={{ background:"var(--bg2)", border:"1px solid #0f1a26", padding:16 }}>
              <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize:8, letterSpacing:3, color:"var(--muted)", marginBottom:14 }}>RAW USER DATA</div>
              {Object.entries(u).filter(([k]) => !["__v","password","verifyToken","resetToken","chatToken"].includes(k)).map(([k, v]) => (
                <div key={k} style={{ display:"grid", gridTemplateColumns:"130px 1fr", gap:12, padding:"8px 0", borderBottom:"1px solid #0a1016" }}>
                  <span style={{ fontFamily:"var(--font-mono,monospace)", fontSize:9, color:"var(--muted)", letterSpacing:1 }}>{k.toUpperCase()}</span>
                  <span style={{ fontFamily:"var(--font-mono,monospace)", fontSize:10, wordBreak:"break-all", lineHeight:1.5,
                    color:k==="role"?roleColor(v):typeof v==="boolean"?(v?"var(--green,#00ff88)":"var(--red,#ff4757)"):(k.includes("At")&&v)?"var(--muted)":"var(--muted)" }}>
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
      const res = await fetch(`/api/admin/collection/${coll}/${doc._id}`, {
        method:"PATCH", headers:{"Content-Type":"application/json", Authorization:`Bearer ${token}`}, body:JSON.stringify(payload),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error||res.statusText); }
      onSaved(); onClose();
    } catch(e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const inp = { background:"var(--bg)", border:"1px solid #1e2d45", color:"var(--text)", fontFamily:"var(--font-mono,monospace)", fontSize:11, padding:"8px 10px", outline:"none", width:"100%", boxSizing:"border-box" };

  return (
    <div style={{ position:"fixed", inset:0, zIndex:9999, background:"rgba(0,0,0,0.92)", display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}
      onClick={e => e.target===e.currentTarget && onClose()}>
      <div style={{ background:"var(--bg)", border:"1px solid #00ff8822", width:"100%", maxWidth:660, maxHeight:"90vh", display:"flex", flexDirection:"column", boxShadow:"0 0 60px color-mix(in srgb, var(--green) 6%, transparent)" }}>
        <div style={{ padding:"14px 20px", background:"var(--bg2)", borderBottom:"1px solid #0f1a26", display:"flex", justifyContent:"space-between", alignItems:"center", flexShrink:0 }}>
          <div>
            <span style={{ fontFamily:"var(--font-mono,monospace)", fontSize:8, letterSpacing:3, color:"var(--green,#00ff88)" }}>EDIT · {coll.toUpperCase()}</span>
            <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize:9, color:"var(--muted)", marginTop:3 }}>{String(doc._id)}</div>
          </div>
          <button onClick={onClose} style={{ background:"none", border:"none", color:"var(--muted)", cursor:"pointer", fontSize:18 }}>x</button>
        </div>
        <div style={{ flex:1, overflowY:"auto", padding:"18px 20px", display:"flex", flexDirection:"column", gap:12 }}>
          {Object.entries(fields).filter(([k]) => k!=="__v").map(([key, val]) => {
            const isRO = READONLY.includes(key);
            const isLong = val.length>80||val.includes("\n");
            return (
              <div key={key}>
                <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize:8, letterSpacing:2, color:isRO?"var(--border)":"var(--cyan,#00d4ff)", marginBottom:5 }}>
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
          {error && <div style={{ flex:1, fontFamily:"var(--font-mono,monospace)", fontSize:10, color:"var(--red,#ff4757)" }}>WARN {error}</div>}
          {!error && <div style={{ flex:1 }} />}
          <button onClick={onClose} style={{ fontFamily:"var(--font-mono,monospace)", fontSize:9, letterSpacing:2, padding:"8px 16px", background:"transparent", color:"var(--muted)", border:"1px solid #1e2d45", cursor:"pointer" }}>CANCEL</button>
          <button onClick={save} disabled={saving} style={{ fontFamily:"var(--font-mono,monospace)", fontSize:9, letterSpacing:2, padding:"8px 22px", background:"var(--green,#00ff88)", color:"#000", border:"none", cursor:"pointer", fontWeight:700 }}>
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
      const q = search ? `&search=${encodeURIComponent(search)}` : "";
      const res = await fetch(`/api/admin/stats/collection/${coll}?page=${page}&limit=20${q}`, {
        headers:{Authorization:`Bearer ${token}`},
      });
      const d = await res.json();
      const docs = coll === "users" ? (d.docs || []).map(normalizeUserDoc) : (d.docs || []);
      setData({ ...d, docs }); setSelected(new Set());
    } catch { setData(null); }
    finally { setLoading(false); }
  }, [coll, page, token, search]);

  const [prevColl, setPrevColl] = useState(coll);
  if (prevColl !== coll) {
    setPrevColl(coll);
    setPage(1);
    setSearch("");
  }

  useEffect(() => { void (async () => { await load() })() }, [load]);

  const del = async (id) => {
    const ok = await confirm({ title: 'Delete Document', message: 'This document will be permanently deleted. This cannot be undone.', variant: 'danger', confirmLabel: 'DELETE' });
    if (!ok) return;
    setDeleting(id);
    try {
      await fetch(`/api/admin/collection/${coll}/${id}`, { method:"DELETE", headers:{Authorization:`Bearer ${token}`} });
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
    if (key==="role") return <span style={{color:roleColor(val),fontSize:9,letterSpacing:1,fontFamily:"var(--font-mono,monospace)"}}>{(val).toUpperCase()}</span>;
    if (typeof val==="boolean") return <span style={{color:val?"var(--green,#00ff88)":"var(--red,#ff4757)"}}>{val?"YES":"NO"}</span>;
    if ((key.includes("At")||key.includes("date"))&&val) return <span style={{color:"var(--muted)"}} title={new Date(val).toLocaleString()}>{ago(val)}</span>;
    if (key==="views"||key==="replyCount") return <span style={{color:"var(--cyan,#00d4ff)"}}>{fmt(val)}</span>;
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
            fontFamily:"var(--font-mono,monospace)", fontSize:8, letterSpacing:2, padding:"5px 12px",
            background:coll===c?"var(--green,#00ff88)":"var(--bg)", color:coll===c?"#000":"var(--muted)",
            border:`1px solid ${coll===c?"var(--green,#00ff88)":"var(--border)"}`, cursor:"pointer",
          }}>{c.toUpperCase()}</button>
        ))}
        <button onClick={load} style={{ fontFamily:"var(--font-mono,monospace)", fontSize:9, padding:"5px 10px", background:"transparent", color:"var(--cyan,#00d4ff)", border:"1px solid #1e2d45", cursor:"pointer" }}>REFRESH</button>
      </div>

      {/* Search */}
      <div style={{ display:"flex", gap:8, marginBottom:14 }}>
        <input value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={e=>e.key==="Enter"&&load()}
          placeholder={`Search ${coll}...`}
          style={{ flex:1, background:"var(--bg)", border:"1px solid #1e2d45", color:"var(--text)", fontFamily:"var(--font-mono,monospace)", fontSize:11, padding:"8px 12px", outline:"none" }} />
        <button onClick={load} style={{ fontFamily:"var(--font-mono,monospace)", fontSize:9, padding:"8px 14px", background:"color-mix(in srgb, var(--cyan) 6%, transparent)", color:"var(--cyan,#00d4ff)", border:"1px solid #00d4ff33", cursor:"pointer" }}>SEARCH</button>
        {search && <button onClick={()=>{setSearch("");}} style={{ fontFamily:"var(--font-mono,monospace)", fontSize:9, padding:"8px 12px", background:"transparent", color:"var(--muted)", border:"1px solid #1e2d45", cursor:"pointer" }}>x</button>}
      </div>

      {loading && <div style={{ textAlign:"center", padding:40, fontFamily:"var(--font-mono,monospace)", fontSize:10, color:"var(--border)", letterSpacing:3 }}>LOADING...</div>}

      {data && !loading && (
        <>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
            <div style={{ fontSize:9, fontFamily:"var(--font-mono,monospace)", color:"var(--border)", letterSpacing:2 }}>
              {fmt(data.total)} DOCS · PAGE {data.page}/{data.pages}
              {selected.size>0 && <span style={{color:"var(--yellow,#ffd700)",marginLeft:10}}>{selected.size} SELECTED</span>}
            </div>
            {selected.size>0 && (
              <button onClick={async ()=>{
                const ok = await confirm({ title: `Delete ${selected.size} Documents`, message: `Permanently delete ${selected.size} selected documents? This cannot be undone.`, variant: 'danger', confirmLabel: `DELETE ${selected.size}` });
                if (!ok) return;
                Promise.all([...selected].map(id => fetch(`/api/admin/collection/${coll}/${id}`,{method:"DELETE",headers:{Authorization:`Bearer ${token}`}})))
                  .then(()=>{toast.add(`Deleted ${selected.size} docs`);load();})
                  .catch(()=>toast.add("Bulk delete failed","error"));
              }} style={{ fontFamily:"var(--font-mono,monospace)", fontSize:8, padding:"4px 10px", background:"rgba(255,71,87,0.06)", color:"var(--red,#ff4757)", border:"1px solid #ff475730", cursor:"pointer" }}>
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
                  {cols.map(k => <th key={k} style={{ padding:"8px 10px", textAlign:"left", color:"var(--muted)", fontSize:8, letterSpacing:2, whiteSpace:"nowrap" }}>{k.toUpperCase()}</th>)}
                  <th style={{ padding:"8px 10px", color:"var(--muted)", fontSize:8, textAlign:"right" }}>ACTIONS</th>
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
                        <Btn tiny label="EDIT"     color="var(--cyan,#00d4ff)" onClick={()=>setEditDoc(doc)} />
                        {coll==="users"      && <Btn tiny label="MANAGE"                             color="var(--yellow,#ffd700)"  onClick={()=>setUserDoc(normalizeUserDoc(doc))} />}
                        {coll==="posts"      && <Btn tiny label={doc.published?"UNPUBLISH":"PUBLISH"} color={doc.published?"var(--orange,#ff6b35)":"var(--green,#00ff88)"} disabled={busy===`p${doc._id}`} onClick={()=>qa(`p${doc._id}`,`posts/${doc._id}/toggle-publish`)} />}
                        {coll==="threads"    && <Btn tiny label={doc.pinned?"UNPIN":"PIN"}            color="var(--yellow,#ffd700)"  disabled={busy===`pi${doc._id}`} onClick={()=>qa(`pi${doc._id}`,`threads/${doc._id}/toggle-pin`)} />}
                        {coll==="threads"    && <Btn tiny label={doc.locked?"UNLOCK":"LOCK"}          color={doc.locked?"var(--green,#00ff88)":"var(--red,#ff4757)"} disabled={busy===`lo${doc._id}`} onClick={()=>qa(`lo${doc._id}`,`threads/${doc._id}/toggle-lock`)} />}
                        {coll==="newsletter" && <Btn tiny label={doc.active?"DEACTIVATE":"ACTIVATE"}  color={doc.active?"var(--red,#ff4757)":"var(--green,#00ff88)"}  disabled={busy===`n${doc._id}`} onClick={()=>qa(`n${doc._id}`,`newsletter/${doc._id}/toggle-active`)} />}
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
              <button disabled={page<=1} onClick={()=>setPage(1)}        style={{ fontFamily:"var(--font-mono,monospace)", fontSize:9, padding:"5px 10px", background:"var(--bg)", color:page<=1?"var(--border)":"var(--muted)", border:"1px solid #1e2d45", cursor:page<=1?"not-allowed":"pointer" }}>FIRST</button>
              <button disabled={page<=1} onClick={()=>setPage(p=>p-1)} style={{ fontFamily:"var(--font-mono,monospace)", fontSize:9, padding:"5px 14px", background:"var(--bg)", color:page<=1?"var(--border)":"var(--cyan,#00d4ff)", border:"1px solid #1e2d45", cursor:page<=1?"not-allowed":"pointer" }}>PREV</button>
            </div>
            <span style={{ fontFamily:"var(--font-mono,monospace)", fontSize:9, color:"var(--border)" }}>Page {page} / {data.pages} · {fmt(data.total)} total</span>
            <div style={{ display:"flex", gap:6 }}>
              <button disabled={page>=data.pages} onClick={()=>setPage(p=>p+1)}       style={{ fontFamily:"var(--font-mono,monospace)", fontSize:9, padding:"5px 14px", background:"var(--bg)", color:page>=data.pages?"var(--border)":"var(--cyan,#00d4ff)", border:"1px solid #1e2d45", cursor:page>=data.pages?"not-allowed":"pointer" }}>NEXT</button>
              <button disabled={page>=data.pages} onClick={()=>setPage(data.pages)} style={{ fontFamily:"var(--font-mono,monospace)", fontSize:9, padding:"5px 10px", background:"var(--bg)", color:page>=data.pages?"var(--border)":"var(--muted)", border:"1px solid #1e2d45", cursor:page>=data.pages?"not-allowed":"pointer" }}>LAST</button>
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

  const doExport = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/stats/collection/${collection}?page=1&limit=${limit}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      const docs = data.docs || [];
      let blob, filename;
      if (format === "json") {
        blob = new Blob([JSON.stringify(docs, null, 2)], { type: "application/json" });
        filename = `${collection}_export_${new Date().toISOString().slice(0,10)}.json`;
      } else {
        if (!docs.length) { toast.add("No data to export","error"); setLoading(false); return; }
        const keys = Object.keys(docs[0]).filter(k => k !== "__v");
        const rows = [keys.join(","), ...docs.map(d => keys.map(k => JSON.stringify(d[k] ?? "")).join(","))];
        blob = new Blob([rows.join("\n")], { type: "text/csv" });
        filename = `${collection}_export_${new Date().toISOString().slice(0,10)}.csv`;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
      toast.add(`Exported ${docs.length} ${collection} records as ${format.toUpperCase()}`);
    } catch(e) { toast.add("Export failed: " + e.message, "error"); }
    finally { setLoading(false); }
  };

  const inp = { background:"var(--bg)", border:"1px solid #1e2d45", color:"var(--text)", fontFamily:"var(--font-mono,monospace)", fontSize:12, padding:"10px 12px", outline:"none", width:"100%", boxSizing:"border-box" };

  return (
    <div style={{ maxWidth: 600 }}>
      <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize:9, letterSpacing:3, color:"var(--border)", marginBottom:20 }}>D⬇ EXPORT</div>
      <div style={{ background:"var(--bg2)", border:"1px solid #0f1a26", padding:24, display:"flex", flexDirection:"column", gap:16 }}>
        <div>
          <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize:8, letterSpacing:2, color:"var(--muted)", marginBottom:8 }}>COLLECTION</div>
          <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
            {COLLS.map(c => (
              <button key={c} onClick={() => setCollection(c)} style={{ fontFamily:"var(--font-mono,monospace)", fontSize:8, letterSpacing:2, padding:"5px 12px", background:collection===c?"var(--green,#00ff88)":"var(--bg)", color:collection===c?"#000":"var(--muted)", border:`1px solid ${collection===c?"var(--green,#00ff88)":"var(--border)"}`, cursor:"pointer" }}>{c.toUpperCase()}</button>
            ))}
          </div>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          <div>
            <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize:8, letterSpacing:2, color:"var(--muted)", marginBottom:8 }}>FORMAT</div>
            <div style={{ display:"flex", gap:8 }}>
              {["json","csv"].map(f => (
                <button key={f} onClick={() => setFormat(f)} style={{ flex:1, padding:"10px", fontFamily:"var(--font-mono,monospace)", fontSize:10, background:format===f?"var(--cyan,#00d4ff)":"var(--bg)", color:format===f?"#000":"var(--muted)", border:`1px solid ${format===f?"var(--cyan,#00d4ff)":"var(--border)"}`, cursor:"pointer", fontWeight:format===f?700:400 }}>
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize:8, letterSpacing:2, color:"var(--muted)", marginBottom:8 }}>MAX RECORDS</div>
            <input type="number" value={limit} onChange={e => setLimit(Math.max(1, Math.min(10000, Number(e.target.value))))} style={inp} min={1} max={10000} />
          </div>
        </div>
        <div style={{ padding:"12px 14px", background:"color-mix(in srgb, var(--green) 3%, transparent)", border:"1px solid #00ff8820", fontFamily:"var(--font-mono,monospace)", fontSize:11, color:"var(--muted)", lineHeight:1.6 }}>
          Exporting <span style={{color:"var(--green,#00ff88)"}}>{collection}</span> collection as <span style={{color:"var(--cyan,#00d4ff)"}}>{format.toUpperCase()}</span> (up to {limit.toLocaleString()} records)
        </div>
        <button onClick={doExport} disabled={loading} style={{ padding:"13px", background:loading?"var(--border)":"var(--green,#00ff88)", color:loading?"var(--muted)":"#000", fontFamily:"var(--font-mono,monospace)", fontSize:11, letterSpacing:3, fontWeight:700, border:"none", cursor:loading?"not-allowed":"pointer" }}>
          {loading ? "⬇ EXPORTING..." : `⬇ EXPORT ${format.toUpperCase()}`}
        </button>
      </div>
      {/* Quick stats */}
      {stats?.counts && (
        <div style={{ marginTop:20, background:"var(--bg2)", border:"1px solid #0f1a26", padding:20 }}>
          <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize:8, letterSpacing:3, color:"var(--border)", marginBottom:14 }}>COLLECTION SIZES</div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))", gap:8 }}>
            {Object.entries({ users: stats.counts?.users?.total, posts: stats.counts?.posts?.total, threads: stats.counts?.forum?.threads, replies: stats.counts?.forum?.replies, contacts: stats.counts?.contacts, media: stats.counts?.media, staff: stats.counts?.staff, newsletter: stats.counts?.newsletter?.total }).map(([k,v]) => (
              <div key={k} onClick={() => setCollection(k.replace("replies","replies"))} style={{ padding:"12px", background:collection===k?"color-mix(in srgb, var(--green) 3%, transparent)":"var(--bg)", border:`1px solid ${collection===k?"color-mix(in srgb, var(--green) 20%, transparent)":"var(--border)"}`, cursor:"pointer" }}>
                <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize:8, letterSpacing:2, color:"var(--muted)", marginBottom:4 }}>{k.toUpperCase()}</div>
                <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize:18, fontWeight:700, color:"var(--green,#00ff88)" }}>{(v||0).toLocaleString()}</div>
              </div>
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
      const res = await fetch(`/api/admin/stats/collection/${collection}?page=1&limit=${limit}${q}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setResults(data);
      toast.add(`Found ${data.total} records`);
    } catch(e) { toast.add("Query failed: "+e.message, "error"); }
    finally { setLoading(false); }
  };

  return (
    <div>
      <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize:9, letterSpacing:3, color:"var(--border)", marginBottom:20 }}>COLLECTION QUERY BUILDER</div>
      <div style={{ background:"var(--bg2)", border:"1px solid #0f1a26", padding:24, marginBottom:16 }}>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))", gap:12, marginBottom:16 }}>
          <div>
            <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize:8, letterSpacing:2, color:"var(--muted)", marginBottom:6 }}>COLLECTION</div>
            <Select value={collection} onChange={setCollection} options={COLLS.map(c => [c, c])} />
          </div>
          <div>
            <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize:8, letterSpacing:2, color:"var(--muted)", marginBottom:6 }}>SEARCH FIELD</div>
            <input value={filterKey} onChange={e => setFilterKey(e.target.value)} placeholder="e.g. email, username" style={inp} />
          </div>
          <div>
            <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize:8, letterSpacing:2, color:"var(--muted)", marginBottom:6 }}>SEARCH VALUE</div>
            <input value={filterVal} onChange={e => setFilterVal(e.target.value)} placeholder="search text..." style={inp} onKeyDown={e => e.key==="Enter" && runQuery()} />
          </div>
          <div>
            <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize:8, letterSpacing:2, color:"var(--muted)", marginBottom:6 }}>LIMIT</div>
            <input type="number" value={limit} onChange={e => setLimit(Math.max(1,Math.min(100,Number(e.target.value))))} style={inp} min={1} max={100} />
          </div>
        </div>
        <button onClick={runQuery} disabled={loading} style={{ padding:"11px 28px", background:"var(--cyan,#00d4ff)", color:"#000", fontFamily:"var(--font-mono,monospace)", fontSize:10, letterSpacing:2, fontWeight:700, border:"none", cursor:"pointer" }}>
          {loading ? "RUNNING..." : "RUN QUERY"}
        </button>
      </div>

      {results && (
        <div style={{ background:"var(--bg2)", border:"1px solid #0f1a26", padding:20 }}>
          <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize:9, color:"var(--border)", marginBottom:14 }}>
            RESULTS - {results.total?.toLocaleString()} total · showing {results.docs?.length}
          </div>
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontFamily:"var(--font-mono,monospace)", fontSize:11 }}>
              <thead>
                <tr style={{ borderBottom:"1px solid #1e2d45" }}>
                  {results.docs?.[0] && Object.keys(results.docs[0]).filter(k => !["__v","password","verifyToken","resetToken"].includes(k)).slice(0,6).map(k => (
                    <th key={k} style={{ padding:"8px 10px", textAlign:"left", color:"var(--muted)", fontSize:8, letterSpacing:2 }}>{k.toUpperCase()}</th>
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
      const res = await fetch(`/api/admin/actions/${path}`, { method, headers:{ Authorization:`Bearer ${token}`, "Content-Type":"application/json" } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      toast.add(data.message || label + " completed");
      onRefresh?.();
    } catch(e) { toast.add(e.message, "error"); }
    finally { setBusy(""); }
  };

  const actions = [
    { group:"DATABASE", items:[
      { label:"Clear Old Sessions",    path:"db/clear-sessions",    color:"var(--orange,#ff6b35)", desc:"Remove expired auth sessions from DB" },
      { label:"Remove Unverified Users", path:"db/purge-unverified", color:"var(--red,#ff4757)", desc:"Delete accounts unverified after 7+ days" },
      { label:"Compact Collections",   path:"db/compact",           color:"var(--cyan,#00d4ff)", desc:"Optimize storage for all collections" },
    ]},
    { group:"CONTENT", items:[
      { label:"Recalculate View Counts", path:"posts/recalculate-views", color:"var(--green,#00ff88)", desc:"Recount views across all blog posts" },
      { label:"Clear Chat History",    path:"chat/clear-all",       color:"var(--red,#ff4757)", desc:"WARN Permanently deletes all chat messages" },
      { label:"Rebuild Search Index",  path:"search/rebuild",       color:"var(--purple,#a78bfa)", desc:"Rebuild full-text search indexes" },
    ]},
    { group:"CACHE", items:[
      { label:"Flush API Cache",       path:"cache/flush",          color:"var(--yellow,#ffd700)", desc:"Clear all server-side caches" },
      { label:"Refresh Stats",         path:"stats/refresh",        color:"var(--green,#00ff88)", desc:"Force refresh of dashboard statistics" },
    ]},
  ];

  return (
    <div style={{ maxWidth:700 }}>
      <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize:9, letterSpacing:3, color:"var(--border)", marginBottom:20 }}>DATABASE MAINTENANCE</div>
      <div style={{ background:"rgba(255,71,87,0.06)", border:"1px solid #ff475730", padding:"12px 16px", marginBottom:20, fontFamily:"var(--font-mono,monospace)", fontSize:11, color:"var(--red,#ff4757)", lineHeight:1.6 }}>
        WARN Maintenance operations may be irreversible. Make sure you have a backup before proceeding.
      </div>
      {actions.map(({group, items}) => (
        <div key={group} style={{ marginBottom:20 }}>
          <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize:8, letterSpacing:3, color:"var(--border)", marginBottom:10 }}>{group}</div>
          <div style={{ display:"grid", gap:8 }}>
            {items.map(({label, path, color, desc}) => (
              <div key={label} style={{ background:"var(--bg2)", border:"1px solid #0f1a26", padding:"16px 20px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:20 }}>
                <div>
                  <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize:12, color:"var(--text)", marginBottom:4 }}>{label}</div>
                  <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize:9, color:"var(--muted)", lineHeight:1.5 }}>{desc}</div>
                </div>
                <button disabled={!!busy} onClick={() => run(label, path)} style={{
                  padding:"8px 18px", background:`${color}15`, color, border:`1px solid ${color}44`,
                  fontFamily:"var(--font-mono,monospace)", fontSize:9, letterSpacing:1, cursor:busy?"not-allowed":"pointer",
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
function DbHealthTab({ token, toast }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState("");
  const { confirm } = useDialog();

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/stats/db-health`, { headers:{ Authorization:`Bearer ${token}` } });
      if (!res.ok) throw new Error(res.statusText);
      setData(await res.json());
    } catch(e) {
      // Fallback: pull what we can from /api/admin/stats
      try {
        const r2 = await fetch(`/api/admin/stats`, { headers:{ Authorization:`Bearer ${token}` } });
        const s = await r2.json();
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
      const res = await fetch(`/api/admin/actions/${path}`, { method:"POST", headers:{ Authorization:`Bearer ${token}` } });
      const d = await res.json();
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
        <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize:9, letterSpacing:3, color:"var(--border)" }}>DATABASE HEALTH &amp; METRICS</div>
        <button onClick={load} disabled={loading} style={{ fontFamily:"var(--font-mono,monospace)", fontSize:9, padding:"6px 14px", background:"transparent", color:"var(--cyan,#00d4ff)", border:"1px solid #1e2d45", cursor:"pointer" }}>
          {loading ? "LOADING..." : "REFRESH"}
        </button>
      </div>

      {loading && !data && <div style={{ textAlign:"center", padding:60, fontFamily:"var(--font-mono,monospace)", fontSize:10, color:"var(--border)", letterSpacing:3 }}>FETCHING METRICS...</div>}

      {data && (
        <div style={{ display:"grid", gap:16 }}>

          {/* Storage */}
          {(data.storage || data.counts) && (
            <div style={{ background:"var(--bg2)", border:"1px solid #0f1a26", padding:24 }}>
              <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize:8, letterSpacing:3, color:"var(--border)", marginBottom:16 }}>STORAGE</div>
              {data.storage ? (
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))", gap:12 }}>
                  {[
                    { label:"DATA SIZE",    value: bytes(data.storage.dataSize),     color:"var(--green,#00ff88)" },
                    { label:"STORAGE SIZE", value: bytes(data.storage.storageSize),  color:"var(--cyan,#00d4ff)" },
                    { label:"INDEX SIZE",   value: bytes(data.storage.indexSize),    color:"var(--yellow,#ffd700)" },
                    { label:"TOTAL SIZE",   value: bytes(data.storage.totalSize),    color:"var(--purple,#a78bfa)" },
                  ].map(({ label, value, color }) => (
                    <div key={label} style={{ background:"var(--bg)", border:`1px solid ${color}18`, padding:"16px" }}>
                      <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize:8, letterSpacing:2, color:"var(--muted)", marginBottom:6 }}>{label}</div>
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
                        <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize:8, letterSpacing:2, color:"var(--muted)", marginBottom:4 }}>{k.toUpperCase()}</div>
                        <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize:20, fontWeight:700, color:"var(--green,#00ff88)" }}>{(v||0).toLocaleString()}</div>
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
              <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize:8, letterSpacing:3, color:"var(--border)", marginBottom:16 }}>INDEXES</div>
              <div style={{ overflowX:"auto" }}>
                <table style={{ width:"100%", borderCollapse:"collapse", fontFamily:"var(--font-mono,monospace)", fontSize:11 }}>
                  <thead>
                    <tr style={{ borderBottom:"1px solid #1e2d45" }}>
                      {["COLLECTION","INDEX","SIZE","USAGE"].map(h => <th key={h} style={{ padding:"7px 10px", textAlign:"left", color:"var(--muted)", fontSize:8, letterSpacing:2 }}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {data.indexes.map((idx, i) => (
                      <tr key={i} style={{ borderBottom:"1px solid #0a1016" }}>
                        <td style={{ padding:"8px 10px", color:"var(--text)" }}>{idx.collection}</td>
                        <td style={{ padding:"8px 10px", color:"var(--cyan,#00d4ff)" }}>{idx.name}</td>
                        <td style={{ padding:"8px 10px", color:"var(--muted)" }}>{bytes(idx.size)}</td>
                        <td style={{ padding:"8px 10px" }}>
                          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                            <div style={{ flex:1, height:4, background:"var(--border)", borderRadius:2 }}>
                              <div style={{ height:"100%", width:`${Math.min(100, idx.usagePct||0)}%`, background:"var(--green,#00ff88)", borderRadius:2 }} />
                            </div>
                            <span style={{ color:"var(--green,#00ff88)", fontSize:9 }}>{idx.usagePct||0}%</span>
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
            <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize:8, letterSpacing:3, color:"var(--border)", marginBottom:16 }}>QUICK MAINTENANCE</div>
            <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
              {[
                { label:"Compact DB",          path:"db/compact",           color:"var(--cyan,#00d4ff)" },
                { label:"Clear Old Sessions",  path:"db/clear-sessions",    color:"var(--orange,#ff6b35)" },
                { label:"Purge Unverified",    path:"db/purge-unverified",  color:"var(--red,#ff4757)" },
                { label:"Rebuild Search Index",path:"search/rebuild",       color:"var(--purple,#a78bfa)" },
              ].map(({ label, path, color }) => (
                <button key={label} disabled={!!busy} onClick={() => runAction(label, path)} style={{ padding:"9px 18px", background:`${color}12`, color, border:`1px solid ${color}33`, fontFamily:"var(--font-mono,monospace)", fontSize:9, letterSpacing:1, cursor:busy?"not-allowed":"pointer", opacity:busy===label?0.5:1 }}>
                  {busy===label?"RUNNING...":"RUN "+label.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Slow query log placeholder */}
          {data.slowQueries && data.slowQueries.length > 0 && (
            <div style={{ background:"var(--bg2)", border:"1px solid #ff475520", padding:24 }}>
              <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize:8, letterSpacing:3, color:"var(--red,#ff4757)", marginBottom:16 }}>WARN SLOW QUERIES</div>
              {data.slowQueries.map((q, i) => (
                <div key={i} style={{ display:"grid", gridTemplateColumns:"1fr 80px 120px", gap:12, padding:"8px 0", borderBottom:"1px solid #0a1016", fontFamily:"var(--font-mono,monospace)", fontSize:10 }}>
                  <span style={{ color:"var(--muted)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{q.query}</span>
                  <span style={{ color:"var(--red,#ff4757)" }}>{q.ms}ms</span>
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
      const res = await fetch(`/api/admin/stats/collection/newsletter?page=${p}&limit=${PER}${qs}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setSubs(data.docs || []); setTotal(data.total || 0);
    } catch {}
    finally { setLoading(false); }
  }, [page, search, token]);

  useEffect(() => { void (async () => { await load(page, search) })() }, [page]);

  const toggle = async (sub) => {
    setBusy(sub._id);
    try {
      const r = await fetch(`/api/admin/actions/newsletter/${sub._id}/toggle-active`, {
        method:"POST", headers:{ Authorization:`Bearer ${token}` }
      });
      const d = await r.json();
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
      await fetch(`/api/admin/collection/newsletter/${id}`, { method:"DELETE", headers:{ Authorization:`Bearer ${token}` } });
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
          <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize:9, letterSpacing:3, color:"var(--border)" }}>NEWSLETTER SUBSCRIBERS</div>
          <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize:11, color:"var(--text)", marginTop:4 }}>
            <span style={{ color:"var(--green,#00ff88)" }}>{total.toLocaleString()}</span> total · <span style={{ color:"var(--cyan,#00d4ff)" }}>{active}</span> active
          </div>
        </div>
        <button onClick={exportCsv} disabled={!subs.length} style={{ fontFamily:"var(--font-mono,monospace)", fontSize:9, letterSpacing:1, padding:"7px 14px", background:"color-mix(in srgb, var(--green) 6%, transparent)", color:"var(--green,#00ff88)", border:"1px solid #00ff8833", cursor:"pointer" }}>
          ⬇ EXPORT CSV
        </button>
      </div>

      <div style={{ display:"flex", gap:8, marginBottom:16 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key==="Enter" && (setPage(1), load(1, search))}
          placeholder="Search by email..." style={{ flex:1, background:"var(--bg)", border:"1px solid #1e2d45", color:"var(--text)", fontFamily:"var(--font-mono,monospace)", fontSize:11, padding:"9px 12px", outline:"none" }} />
        <button onClick={() => { setPage(1); load(1, search); }} style={{ fontFamily:"var(--font-mono,monospace)", fontSize:9, padding:"9px 14px", background:"color-mix(in srgb, var(--cyan) 6%, transparent)", color:"var(--cyan,#00d4ff)", border:"1px solid #00d4ff33", cursor:"pointer" }}>SEARCH</button>
        {search && <button onClick={() => { setSearch(""); setPage(1); load(1, ""); }} style={{ fontFamily:"var(--font-mono,monospace)", fontSize:9, padding:"9px 12px", background:"transparent", color:"var(--muted)", border:"1px solid #1e2d45", cursor:"pointer" }}>x</button>}
      </div>

      {loading ? <div style={{ textAlign:"center", padding:40, fontFamily:"var(--font-mono,monospace)", fontSize:10, color:"var(--border)", letterSpacing:3 }}>LOADING...</div> : (
        <>
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontFamily:"var(--font-mono,monospace)", fontSize:11 }}>
              <thead>
                <tr style={{ borderBottom:"1px solid #1e2d45" }}>
                  <th style={{ padding:"8px 12px", textAlign:"left", color:"var(--muted)", fontSize:8, letterSpacing:2 }}>EMAIL</th>
                  <th style={{ padding:"8px 12px", textAlign:"left", color:"var(--muted)", fontSize:8, letterSpacing:2 }}>STATUS</th>
                  <th style={{ padding:"8px 12px", textAlign:"left", color:"var(--muted)", fontSize:8, letterSpacing:2 }}>JOINED</th>
                  <th style={{ padding:"8px 12px", textAlign:"right", color:"var(--muted)", fontSize:8, letterSpacing:2 }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {subs.map((s, i) => (
                  <tr key={i} style={{ borderBottom:"1px solid #0a1016" }}
                    onMouseEnter={e => e.currentTarget.style.background="rgba(255,255,255,0.01)"}
                    onMouseLeave={e => e.currentTarget.style.background="transparent"}>
                    <td style={{ padding:"9px 12px", color:"var(--text)" }}>{s.email}</td>
                    <td style={{ padding:"9px 12px" }}>
                      <span style={{ fontFamily:"var(--font-mono,monospace)", fontSize:9, letterSpacing:1, padding:"2px 8px", background:s.active?"color-mix(in srgb, var(--green) 7%, transparent)":"rgba(255,71,87,0.07)", color:s.active?"var(--green,#00ff88)":"var(--red,#ff4757)", border:`1px solid ${s.active?"color-mix(in srgb, var(--green) 19%, transparent)":"rgba(255,71,87,0.25)"}` }}>
                        {s.active ? "YES ACTIVE" : "NO UNSUB"}
                      </span>
                    </td>
                    <td style={{ padding:"9px 12px", color:"var(--muted)", fontSize:10 }}>{s.createdAt ? ago(s.createdAt) : "-"}</td>
                    <td style={{ padding:"9px 12px", whiteSpace:"nowrap" }}>
                      <div style={{ display:"flex", gap:4, justifyContent:"flex-end" }}>
                        <Btn tiny label={busy===s._id?"...":s.active?"DEACTIVATE":"ACTIVATE"} color={s.active?"var(--red,#ff4757)":"var(--green,#00ff88)"} disabled={!!busy} onClick={() => toggle(s)} />
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
              <button disabled={page<=1} onClick={() => setPage(p=>p-1)} style={{ fontFamily:"var(--font-mono,monospace)", fontSize:9, padding:"6px 14px", background:"var(--bg)", color:page<=1?"var(--border)":"var(--cyan,#00d4ff)", border:"1px solid #1e2d45", cursor:page<=1?"not-allowed":"pointer" }}>PREV</button>
              <span style={{ fontFamily:"var(--font-mono,monospace)", fontSize:9, color:"var(--border)" }}>Page {page} / {pages} · {total.toLocaleString()} total</span>
              <button disabled={page>=pages} onClick={() => setPage(p=>p+1)} style={{ fontFamily:"var(--font-mono,monospace)", fontSize:9, padding:"6px 14px", background:"var(--bg)", color:page>=pages?"var(--border)":"var(--cyan,#00d4ff)", border:"1px solid #1e2d45", cursor:page>=pages?"not-allowed":"pointer" }}>NEXT</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ------------------------- A -------------------------UDIT LOG TAB ----------
function AuditLogTab({ token }) {
  const [logs, setLogs]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage]       = useState(1);
  const [total, setTotal]     = useState(0);
  const [filter, setFilter]   = useState("");

  const load = useCallback(async (p = page) => {
    setLoading(true);
    try {
      const q = filter ? `&event=${encodeURIComponent(filter)}` : "";
      const res = await fetch(`/api/admin/audit?page=${p}&limit=30${q}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setLogs(data.logs || []);
      setTotal(data.total || 0);
    } catch {}
    finally { setLoading(false); }
  }, [page, filter, token]);

  const [prevFilter, setPrevFilter] = useState(filter);
  if (prevFilter !== filter) {
    setPrevFilter(filter);
    setPage(1);
  }

  useEffect(() => { void (async () => { await load(page) })() }, [page]);
  useEffect(() => { void (async () => { await load(1) })() }, [filter]);

  const pages = Math.ceil(total / 30) || 1;
  const ACTION_COLOR = { login:"var(--green,#00ff88)", logout:"var(--orange,#ff6b35)", create:"var(--cyan,#00d4ff)", delete:"var(--red,#ff4757)", ban:"var(--red,#ff4757)", unban:"var(--green,#00ff88)", role:"var(--yellow,#ffd700)", update:"var(--purple,#a78bfa)", verify:"var(--green,#00ff88)", password:"var(--orange,#ff6b35)", fail:"var(--red,#ff4757)", upload:"var(--cyan,#00d4ff)" };
  const getColor = (a = "") => { for (const [k, c] of Object.entries(ACTION_COLOR)) if (a.includes(k)) return c; return "var(--muted)"; };
  const ACTION_ICONS = { login:"[IN]", logout:"[OUT]", create:"[+]", delete:"[X]", ban:"[BAN]", unban:"[OK]", role:"[R]", update:"[E]", verify:"[V]", password:"[PW]", fail:"[FAIL]", upload:"[UP]" };
  const getIcon = (a = "") => { for (const [k, c] of Object.entries(ACTION_ICONS)) if (a.includes(k)) return c; return "[*]"; };

  return (
    <div>
      <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize:9, letterSpacing:3, color:"var(--border)", marginBottom:20 }}>AUDIT LOG</div>
      <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" }}>
        <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter by action keyword (e.g. login, ban, create)..."
          style={{ flex:1, minWidth:220, background:"var(--bg)", border:"1px solid #1e2d45", color:"var(--text)", fontFamily:"var(--font-mono,monospace)", fontSize:11, padding:"9px 12px", outline:"none" }} />
        {filter && <button onClick={() => { setFilter(""); setPage(1); }} style={{ fontFamily:"var(--font-mono,monospace)", fontSize:9, padding:"9px 12px", background:"transparent", color:"var(--muted)", border:"1px solid #1e2d45", cursor:"pointer" }}>x</button>}
        <a href="/api/admin/audit/export" download
          style={{ fontFamily:"var(--font-mono,monospace)", fontSize:9, letterSpacing:1, padding:"9px 14px", background:"transparent", color:"var(--green)", border:"1px solid rgba(0,255,136,0.35)", cursor:"pointer", textDecoration:"none" }}>
          ⬇ EXPORT CSV
        </a>
      </div>
      {loading ? (
        <div style={{ textAlign:"center", padding:40, fontFamily:"var(--font-mono,monospace)", fontSize:10, color:"var(--border)", letterSpacing:3 }}>LOADING...</div>
      ) : (
        <>
          <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize:9, color:"var(--border)", marginBottom:10, letterSpacing:2 }}>
            {total.toLocaleString()} EVENTS{filter ? ` · filter: "${filter}"` : ""}
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
            {logs.length === 0 ? (
              <div style={{ textAlign:"center", padding:60, fontFamily:"var(--font-mono,monospace)", fontSize:10, color:"var(--border)" }}>No audit events found</div>
            ) : logs.map((log, i) => (
              <div key={i} style={{ display:"grid", gridTemplateColumns:"22px 160px 130px 1fr auto", gap:12, padding:"10px 14px", background:"var(--bg2)", border:"1px solid #0a1016", alignItems:"center" }}>
                <span style={{ fontSize:13 }}>{getIcon(log.event)}</span>
                <span style={{ fontFamily:"var(--font-mono,monospace)", fontSize:9, color:getColor(log.event), letterSpacing:1 }}>{(log.event || "").replace(/_/g," ").toUpperCase()}</span>
                <span style={{ fontFamily:"var(--font-mono,monospace)", fontSize:10, color:"var(--text)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{log.username || "system"}</span>
                <span style={{ fontFamily:"var(--font-mono,monospace)", fontSize:10, color:"var(--muted)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                  {log.role && <span style={{ color:roleColor(log.role), marginRight:8, fontSize:9 }}>{log.role.toUpperCase()}</span>}
                  {log.meta?.target ? `-> ${log.meta.target}` : ""}
                  {log.meta?.oldRole ? ` (${log.meta.oldRole} -> ${log.meta.newRole})` : ""}
                  {log.ip && <span style={{ color:"var(--muted)", marginLeft:8 }}>IP: {log.ip}</span>}
                </span>
                <span style={{ fontFamily:"var(--font-mono,monospace)", fontSize:9, color:"var(--border)", whiteSpace:"nowrap" }}>{log.createdAt ? new Date(log.createdAt).toLocaleString() : "-"}</span>
              </div>
            ))}
          </div>
          {pages > 1 && (
            <div style={{ display:"flex", gap:8, marginTop:16, justifyContent:"center", alignItems:"center" }}>
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} style={{ fontFamily:"var(--font-mono,monospace)", fontSize:9, padding:"6px 14px", background:"var(--bg)", color:page<=1?"var(--border)":"var(--cyan,#00d4ff)", border:"1px solid #1e2d45", cursor:page<=1?"not-allowed":"pointer" }}>PREV</button>
              <span style={{ fontFamily:"var(--font-mono,monospace)", fontSize:9, color:"var(--border)" }}>Page {page} / {pages}</span>
              <button disabled={page >= pages} onClick={() => setPage(p => p + 1)} style={{ fontFamily:"var(--font-mono,monospace)", fontSize:9, padding:"6px 14px", background:"var(--bg)", color:page>=pages?"var(--border)":"var(--cyan,#00d4ff)", border:"1px solid #1e2d45", cursor:page>=pages?"not-allowed":"pointer" }}>NEXT</button>
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
        fetch(`/api/admin/sessions`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/admin/ip-bans`,   { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (sRes.status === "fulfilled" && sRes.value.ok) setSessions(await sRes.value.json().then(d => d.sessions || d || []));
      if (bRes.status === "fulfilled" && bRes.value.ok) setIpBans(await bRes.value.json().then(d => d.bans || d || []));
    } catch {}
    finally { setLoading(false); }
  };

  useEffect(() => { void (async () => { await load() })() }, []);

  const revokeSession = async (id) => {
    setBusy(id);
    try {
      await fetch(`/api/admin/sessions/${id}`, { method:"DELETE", headers: { Authorization: `Bearer ${token}` } });
      toast.add("Session revoked"); setSessions(s => s.filter(x => (x._id || x.id) !== id));
    } catch(e) { toast.add(e.message,"error"); }
    finally { setBusy(""); }
  };

  const addBan = async () => {
    if (!newIp.trim()) return;
    setBusy("add");
    try {
      const res = await fetch(`/api/admin/ip-bans`, {
        method:"POST", headers:{"Content-Type":"application/json", Authorization: `Bearer ${token}`},
        body: JSON.stringify({ ip: newIp.trim(), reason: banReason })
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      const data = await res.json();
      setIpBans(b => [...b, data.ban || data]); setNewIp(""); setBanReason("");
      toast.add("IP banned");
    } catch(e) { toast.add(e.message,"error"); }
    finally { setBusy(""); }
  };

  const removeBan = async (id) => {
    setBusy(id);
    try {
      await fetch(`/api/admin/ip-bans/${id}`, { method:"DELETE", headers:{ Authorization:`Bearer ${token}` } });
      toast.add("Ban removed"); setIpBans(b => b.filter(x => (x._id||x.id) !== id));
    } catch(e) { toast.add(e.message,"error"); }
    finally { setBusy(""); }
  };

  const inp = { background:"var(--bg)", border:"1px solid #1e2d45", color:"var(--text)", fontFamily:"var(--font-mono,monospace)", fontSize:12, padding:"10px 12px", outline:"none", width:"100%", boxSizing:"border-box" };

  return (
    <div>
      <div style={{ display:"flex", gap:0, borderBottom:"1px solid #1e2d45", marginBottom:20 }}>
        {[["sessions","LIVE Sessions"], ["ipbans","BAN IP Bans"]].map(([id, label]) => (
          <button key={id} onClick={() => setSubTab(id)} style={{ fontFamily:"var(--font-mono,monospace)", fontSize:9, letterSpacing:2, padding:"10px 18px", background:"transparent", color:subTab===id?"var(--cyan,#00d4ff)":"var(--muted)", borderBottom:subTab===id?"2px solid #00d4ff":"2px solid transparent", border:"none", cursor:"pointer" }}>{label.toUpperCase()}</button>
        ))}
      </div>

      {loading ? <div style={{ textAlign:"center", padding:40, fontFamily:"var(--font-mono,monospace)", fontSize:10, color:"var(--border)" }}>LOADING...</div> : (

        subTab === "sessions" ? (
          <div>
            <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize:9, color:"var(--border)", marginBottom:14, letterSpacing:2 }}>{sessions.length} ACTIVE SESSION{sessions.length !== 1 ? "S" : ""}</div>
            {sessions.length === 0 ? (
              <div style={{ textAlign:"center", padding:60, fontFamily:"var(--font-mono,monospace)", fontSize:10, color:"var(--border)" }}>No active sessions data available</div>
            ) : sessions.map((s, i) => (
              <div key={i} style={{ display:"grid", gridTemplateColumns:"1fr auto auto auto", gap:12, padding:"12px 16px", background:"var(--bg2)", border:"1px solid #0a1016", marginBottom:4, alignItems:"center" }}>
                <div>
                  <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize:11, color:"var(--text)" }}>{s.username || s.user || "unknown"}</div>
                  <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize:9, color:"var(--muted)", marginTop:2 }}>
                    {s.ip || "-"} · {s.userAgent ? s.userAgent.slice(0, 60) : "-"}
                  </div>
                </div>
                <span style={{ fontFamily:"var(--font-mono,monospace)", fontSize:9, color:"var(--muted)" }}>{s.role || "user"}</span>
                <span style={{ fontFamily:"var(--font-mono,monospace)", fontSize:9, color:"var(--muted)" }}>{s.createdAt || s.lastSeen ? ago(s.createdAt || s.lastSeen) : "-"}</span>
                <Btn tiny danger label={busy === (s._id||s.id) ? "..." : "REVOKE"} disabled={!!busy} onClick={() => revokeSession(s._id || s.id)} />
              </div>
            ))}
          </div>
        ) : (
          <div>
            <div style={{ background:"var(--bg2)", border:"1px solid #0f1a26", padding:20, marginBottom:20 }}>
              <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize:8, letterSpacing:3, color:"var(--border)", marginBottom:14 }}>ADD IP BAN</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr auto", gap:10, alignItems:"end" }}>
                <div>
                  <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize:8, letterSpacing:2, color:"var(--muted)", marginBottom:6 }}>IP ADDRESS</div>
                  <input value={newIp} onChange={e => setNewIp(e.target.value)} placeholder="192.168.1.1" style={inp} />
                </div>
                <div>
                  <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize:8, letterSpacing:2, color:"var(--muted)", marginBottom:6 }}>REASON (OPTIONAL)</div>
                  <input value={banReason} onChange={e => setBanReason(e.target.value)} placeholder="Spam, abuse..." style={inp} />
                </div>
                <button onClick={addBan} disabled={!newIp.trim() || !!busy} style={{ padding:"10px 18px", background:"rgba(255,71,87,0.06)", color:"var(--red,#ff4757)", border:"1px solid #ff475533", fontFamily:"var(--font-mono,monospace)", fontSize:9, letterSpacing:1, cursor:newIp.trim()?"pointer":"not-allowed" }}>
                  {busy === "add" ? "BANNING..." : "BAN BAN IP"}
                </button>
              </div>
            </div>
            <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize:9, color:"var(--border)", marginBottom:10, letterSpacing:2 }}>{ipBans.length} BANNED IP{ipBans.length !== 1 ? "S" : ""}</div>
            {ipBans.length === 0 ? (
              <div style={{ textAlign:"center", padding:60, fontFamily:"var(--font-mono,monospace)", fontSize:10, color:"var(--border)" }}>No IP bans configured</div>
            ) : ipBans.map((ban, i) => (
              <div key={i} style={{ display:"grid", gridTemplateColumns:"1fr 1fr auto auto", gap:12, padding:"12px 16px", background:"var(--bg2)", border:"1px solid #0a1016", marginBottom:4, alignItems:"center" }}>
                <span style={{ fontFamily:"var(--font-mono,monospace)", fontSize:12, color:"var(--red,#ff4757)" }}>{ban.ip}</span>
                <span style={{ fontFamily:"var(--font-mono,monospace)", fontSize:10, color:"var(--muted)" }}>{ban.reason || "-"}</span>
                <span style={{ fontFamily:"var(--font-mono,monospace)", fontSize:9, color:"var(--muted)" }}>{ban.createdAt ? ago(ban.createdAt) : "-"}</span>
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
export default function DatabaseGUI({ _preloadToken = "", readOnly: readOnlyProp = undefined }) {
  // #19 - Auto read-only for editor/moderator roles
  const role = getRole()
  const readOnly = readOnlyProp ?? (role === 'editor' || role === 'moderator')
  const [token, setToken]           = useState(_preloadToken || getAuthToken());
  const [tokenInput, setTokenInput] = useState("");
  const [stats, setStats]           = useState(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState("");
  const [lastUpdate, setLastUpdate] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [activeTab, setActiveTab]   = useState("overview");
  const [pulse, setPulse]           = useState(false);
  const intervalRef                 = useRef(null);
  const toast                       = useToasts();

  const fetchStats = useCallback(async (t = token) => {
    if (!t) return;
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/admin/stats`, { headers:{Authorization:`Bearer ${t}`} });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const data = await res.json();
      setStats(data); setLastUpdate(new Date());
      setPulse(true); setTimeout(()=>setPulse(false), 600);
    } catch(e) { setError(e.message); }
    finally { setLoading(false); }
  }, [token, setStats]);

  useEffect(()=>{ if(token) void (async () => { await fetchStats() })() }, [token]);
  useEffect(()=>{
    clearInterval(intervalRef.current);
    if (autoRefresh && token) intervalRef.current = setInterval(()=>fetchStats(), 30000);
    return ()=>clearInterval(intervalRef.current);
  }, [autoRefresh, token, fetchStats]);

  if (!token) return (
    <div style={{ minHeight: _preloadToken ? "auto" : "100vh", background: _preloadToken ? "transparent" : "var(--bg)", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"var(--font-mono,monospace)", padding: 24 }}>
      <div style={{ background:"var(--bg2)", border:"1px solid var(--border)", borderRadius:10, padding:"44px 40px", width:"100%", maxWidth:400 }}>
        <div style={{ fontSize:9, letterSpacing:4, color:"var(--green,#00ff88)", marginBottom:10 }}>{'// AIFAZI.NET'}</div>
        <div style={{ fontSize:24, fontWeight:700, color:"var(--text)", marginBottom:6 }}>DB Monitor</div>
        <div style={{ fontSize:11, color:"var(--muted)", marginBottom:28, lineHeight:1.7 }}>Paste your admin JWT token to connect. Stored in memory only - clears on refresh.</div>
        <input type="password" value={tokenInput} onChange={e=>setTokenInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&tokenInput&&setToken(tokenInput)}
          placeholder="eyJhbGciOiJIUzI1NiIs..." autoFocus
          style={{ width:"100%", background:"var(--bg)", border:"1px solid var(--border)", borderRadius:5, color:"var(--text)", fontFamily:"var(--font-mono,monospace)", fontSize:12, padding:"12px 14px", outline:"none", marginBottom:14, boxSizing:"border-box" }} />
        <button onClick={()=>tokenInput&&setToken(tokenInput)} disabled={!tokenInput}
          style={{ width:"100%", padding:13, background:tokenInput?"var(--green,#00ff88)":"var(--bg2)", color:tokenInput?"#000":"var(--border)", fontFamily:"var(--font-mono,monospace)", fontSize:11, letterSpacing:3, fontWeight:700, border:"none", cursor:tokenInput?"pointer":"not-allowed" }}>
          CONNECT
        </button>
      </div>
    </div>
  );

  const s = stats;
  const ALL_TABS = [
    {id:"overview",   label:"[=] Overview"},
    {id:"activity",   label:"[*] Activity"},
    {id:"browser",    label:"[B] Browser"},
    {id:"charts",     label:"[C] Charts"},
    {id:"export",     label:"[E] Export",     writeOnly: true},
    {id:"query",      label:"[Q] Query",      writeOnly: true},
    {id:"maintenance",label:"[M] Maintenance",writeOnly: true},
    {id:"sessions",   label:"[S] Sessions"},
    {id:"newsletter", label:"[N] Newsletter"},
    {id:"dbhealth",   label:"[H] DB Health"},
    {id:"system",     label:"[~] System"},
    {id:"audit",      label:"[A] Audit Log"},
  ];
  const TABS = readOnly ? ALL_TABS.filter(t => !t.writeOnly) : ALL_TABS;

  return (
    <div style={{ minHeight: _preloadToken ? "auto" : "100vh", background: _preloadToken ? "transparent" : "var(--bg)", color:"var(--text)", fontFamily:"var(--font-mono,monospace)" }}>

      {/* #19 - Read-only mode banner */}
      {readOnly && (
        <div style={{
          padding: '8px 24px', background: 'color-mix(in srgb, var(--cyan) 7%, transparent)',
          borderBottom: '1px solid color-mix(in srgb, var(--cyan) 20%, transparent)',
          display: 'flex', alignItems: 'center', gap: 10,
          fontFamily: 'monospace', fontSize: 10, color: '#00d4ff', letterSpacing: 2,
        }}>
          <span>LOCK</span>
          <span>READ-ONLY MODE - Query, Maintenance and Export tabs are hidden for your role ({role?.toUpperCase()}). Contact an admin for write access.</span>
        </div>
      )}

      {/* Header - hidden when embedded inside Admin panel */}
      {!_preloadToken && (
      <div style={{ background:"var(--bg)", borderBottom:"1px solid #0f1a26", padding:"12px 24px", display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:10 }}>
        <div style={{ display:"flex", alignItems:"center", gap:18 }}>
          <div>
            <span style={{ fontSize:8, letterSpacing:4, color:"var(--green,#00ff88)" }}>AIFAZI.NET</span>
            <span style={{ marginLeft:12, fontSize:13, fontWeight:700, color:"var(--text)", letterSpacing:2 }}>DATABASE MONITOR</span>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
            <div style={{
              width:7, height:7, borderRadius:"50%",
              background:loading?"var(--orange,#ff6b35)":error?"var(--red,#ff4757)":"var(--green,#00ff88)",
              boxShadow:`0 0 ${pulse?"10px":"4px"} ${loading?"var(--orange,#ff6b35)":error?"var(--red,#ff4757)":"var(--green,#00ff88)"}`,
              transition:"all 0.3s",
            }} />
            <span style={{ fontSize:8, color:"var(--border)" }}>
              {loading?"SYNCING...":error?"ERROR":lastUpdate?`SYNCED ${ago(lastUpdate)}`:"IDLE"}
            </span>
          </div>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <Checkbox checked={autoRefresh} onChange={setAutoRefresh} label="AUTO 30s"
            style={{ fontSize:8, color:"var(--border)", padding:"5px 8px" }} />
          <button onClick={()=>fetchStats()} disabled={loading}
            style={{ padding:"5px 12px", background:"transparent", color:"var(--cyan,#00d4ff)", border:"1px solid #1e2d45", cursor:loading?"not-allowed":"pointer", fontSize:8, letterSpacing:2 }}>REFRESH</button>
          <button onClick={()=>{setToken("");setStats(null);}}
            style={{ padding:"5px 12px", background:"transparent", color:"var(--red,#ff4757)", border:"1px solid #1e2d45", cursor:"pointer", fontSize:8, letterSpacing:2 }}>DISCONNECT</button>
        </div>
      </div>
      )}

      {/* Compact status bar when embedded */}
      {_preloadToken && (
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 16px", borderBottom:"1px solid #0f1a26", background:"var(--bg)" }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <div style={{ width:6, height:6, borderRadius:"50%", background:loading?"var(--orange,#ff6b35)":error?"var(--red,#ff4757)":"var(--green,#00ff88)", boxShadow:`0 0 6px ${loading?"var(--orange,#ff6b35)":error?"var(--red,#ff4757)":"var(--green,#00ff88)"}`, transition:"all 0.3s" }} />
            <span style={{ fontSize:9, fontFamily:"var(--font-mono,monospace)", color:"var(--muted)", letterSpacing:2 }}>
              {loading?"SYNCING...":error?"ERROR":lastUpdate?`LAST SYNC ${ago(lastUpdate)}`:"IDLE"}
            </span>
          </div>
          <div style={{ display:"flex", gap:6, alignItems:"center" }}>
            <Checkbox checked={autoRefresh} onChange={setAutoRefresh} label="AUTO"
              style={{ fontSize:8, color:"var(--border)", padding:"4px 7px" }} />
            <button onClick={()=>fetchStats()} disabled={loading} style={{ padding:"3px 10px", background:"transparent", color:"var(--cyan,#00d4ff)", border:"1px solid #1e2d45", cursor:loading?"not-allowed":"pointer", fontSize:8, letterSpacing:1, fontFamily:"var(--font-mono,monospace)" }}>REFRESH</button>
          </div>
        </div>
      )}

      {error && <div style={{ background:"rgba(255,71,87,0.06)", borderBottom:"1px solid #ff475730", color:"var(--red,#ff4757)", padding:"10px 24px", fontSize:11 }}>WARN {error}</div>}

      {/* Tabs */}
      <div style={{ display:"flex", borderBottom:"1px solid var(--border)", padding:"0 20px", overflowX:"auto" }}>
        {TABS.map(t => (
          <button key={t.id} onClick={()=>setActiveTab(t.id)} style={{
            padding:"11px 16px", background:"transparent",
            color:activeTab===t.id?"var(--primary,var(--cyan,#00d4ff))":"var(--muted)",
            borderBottom:activeTab===t.id?"2px solid var(--primary,var(--cyan,#00d4ff))":"2px solid transparent",
            border:"none", cursor:"pointer", fontSize:9, letterSpacing:2, fontFamily:"var(--font-mono,monospace)",
            marginBottom:-1, whiteSpace:"nowrap",
          }}>{t.label.toUpperCase()}</button>
        ))}
      </div>

      <div style={{ padding:24, maxWidth:1500 }}>

        {/* -- OVERVIEW -- */}
        {activeTab==="overview" && s && (
          <div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))", gap:10, marginBottom:28 }}>
              <StatCard icon="[P]" label="POSTS"       value={s.counts?.posts?.total}       sub={`${s.counts?.posts?.published||0} published · ${s.counts?.posts?.drafts||0} drafts`}       color="var(--green,#00ff88)" trend={s.today?.posts} />
              <StatCard icon="[U]" label="USERS"        value={s.counts?.users?.total}       sub={`${s.counts?.users?.verified||0} verified · ${s.counts?.users?.banned||0} banned`}         color="var(--cyan,#00d4ff)" trend={s.today?.users} />
              <StatCard icon="[T]" label="THREADS"      value={s.counts?.forum?.threads}     sub={`${fmt(s.counts?.forum?.replies||0)} replies`}                                              color="var(--orange,#ff6b35)" trend={s.today?.threads} />
              <StatCard icon="[C]" label="CHAT MSGS"    value={s.counts?.chat?.messages}     sub={`${s.counts?.chat?.rooms||0} rooms`}                                                        color="var(--yellow,#ffd700)" trend={s.today?.messages} />
              <StatCard icon="[@]" label="CONTACTS"     value={s.counts?.contacts}           sub="Contact form submissions"                                                                   color="var(--purple,#a78bfa)" trend={s.today?.contacts} />
              <StatCard icon="[N]" label="NEWSLETTER"   value={s.counts?.newsletter?.total}  sub={`${s.counts?.newsletter?.active||0} active`}                                                color="var(--green,#00ff88)" />
              <StatCard icon="[M]" label="MEDIA FILES"  value={s.counts?.media}              sub="Uploaded files"                                                                             color="var(--muted)" />
              <StatCard icon="[S]" label="STAFF"        value={s.counts?.staff}              sub="Team members"                                                                               color="var(--cyan,#00d4ff)" />
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
              <div style={{ background:"var(--bg2)", border:"1px solid #0f1a26", padding:20 }}>
                <div style={{ fontSize:8, letterSpacing:3, color:"var(--border)", marginBottom:14 }}>TOP POSTS BY VIEWS</div>
                {(s.topPosts||[]).length===0
                  ? <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize:10, color:"var(--border)" }}>No posts yet</div>
                  : (s.topPosts||[]).map((p,i) => (
                    <div key={i} style={{ display:"flex", justifyContent:"space-between", padding:"9px 0", borderBottom:"1px solid #0a1016", gap:12 }}>
                      <div style={{ flex:1, overflow:"hidden" }}>
                        <div style={{ color:"var(--muted)", fontSize:12, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{p.title}</div>
                        <div style={{ color:"var(--border)", fontSize:9, marginTop:2 }}>{p.category}</div>
                      </div>
                      <span style={{ color:"var(--green,#00ff88)", fontSize:11, flexShrink:0 }}>{fmt(p.views)}v</span>
                    </div>
                  ))
                }
              </div>
              <div style={{ background:"var(--bg2)", border:"1px solid #0f1a26", padding:20 }}>
                <div style={{ fontSize:8, letterSpacing:3, color:"var(--border)", marginBottom:14 }}>FORUM CATEGORIES</div>
                {(s.categories||[]).length===0
                  ? <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize:10, color:"var(--border)" }}>No categories yet</div>
                  : (s.categories||[]).map((c,i) => (
                    <div key={i} style={{ display:"flex", justifyContent:"space-between", padding:"9px 0", borderBottom:"1px solid #0a1016" }}>
                      <span style={{ color:"var(--muted)", fontSize:12 }}>{c.icon} {c.name}</span>
                      <span style={{ color:"var(--cyan,#00d4ff)", fontSize:11 }}>{fmt(c.threadCount)} threads</span>
                    </div>
                  ))
                }
              </div>
            </div>
          </div>
        )}

        {/* -- ACTIVITY -- */}
        {activeTab==="activity" && s && (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))", gap:16 }}>
            {[
              {title:"LATEST POSTS",     key:"posts",      icon:"[P]", color:"var(--green,#00ff88)",
               render:p=><FeedRow icon="[P]" title={p.title} sub={`${p.published?"YES":"DRAFT"} · ${p.views||0}v · ${p.category||""}`} time={ago(p.createdAt)} color="var(--green,#00ff88)" />},
              {title:"NEW USERS",        key:"users",      icon:"[U]", color:"var(--cyan,#00d4ff)",
               render:u=><FeedRow icon="[U]" title={u.username} sub={`${u.email} · ${u.role} · ${u.emailVerified?"YES":"NO"}`} time={ago(u.createdAt)} color="var(--cyan,#00d4ff)" />},
              {title:"LATEST THREADS",   key:"threads",    icon:"[T]", color:"var(--orange,#ff6b35)",
               render:t=><FeedRow icon="[T]" title={t.title} sub={`by ${t.author?.username||"?"} · ${t.views||0}v · ${t.replyCount||0} replies`} time={ago(t.createdAt)} color="var(--orange,#ff6b35)" />},
              {title:"CHAT MESSAGES",    key:"messages",   icon:"[C]", color:"var(--yellow,#ffd700)",
               render:m=><FeedRow icon="[C]" title={`${m.sender}: ${(m.content||"[file]").slice(0,50)}`} sub={`in ${m.room?.name||"?"}`} time={ago(m.createdAt)} color="var(--yellow,#ffd700)" />},
              {title:"CONTACT FORMS",    key:"contacts",   icon:"[@]", color:"var(--purple,#a78bfa)",
               render:c=><FeedRow icon="[@]" title={`${c.name} - ${c.subject||"No subject"}`} sub={c.email} time={ago(c.createdAt)} color="var(--purple,#a78bfa)" />},
              {title:"NEWSLETTER SUBS",  key:"newsletter", icon:"[N]", color:"var(--green,#00ff88)",
               render:s=><FeedRow icon="[N]" title={s.email} sub={s.active?"YES Active":"NO Unsubscribed"} time={ago(s.createdAt)} color="var(--green,#00ff88)" />},
            ].map(({title, key, render}) => (
              <div key={key} style={{ background:"var(--bg2)", border:"1px solid #0f1a26", padding:"18px 16px" }}>
                <div style={{ fontSize:8, letterSpacing:3, color:"var(--border)", marginBottom:12 }}>{title}</div>
                {(s.recent?.[key]||[]).length===0
                  ? <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize:9, color:"var(--border)", padding:"12px 0" }}>NO DATA YET</div>
                  : (s.recent?.[key]||[]).map((item, i) => <div key={i}>{render(item)}</div>)
                }
              </div>
            ))}
          </div>
        )}

        {activeTab==="browser" && (
          <div style={{ background:"var(--bg)", border:"1px solid #0f1a26", padding:24 }}>
            <CollectionBrowser token={token} toast={toast} />
          </div>
        )}

        {/* -- CHARTS -- */}
        {activeTab==="charts" && s && (
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
            <div style={{ background:"var(--bg2)", border:"1px solid #0f1a26", padding:24 }}>
              <MiniChart data={s.charts?.dailyPosts||[]} color="var(--green,#00ff88)" label="POSTS - LAST 30 DAYS" />
            </div>
            <div style={{ background:"var(--bg2)", border:"1px solid #0f1a26", padding:24 }}>
              <MiniChart data={s.charts?.dailyUsers||[]} color="var(--cyan,#00d4ff)" label="NEW USERS - LAST 30 DAYS" />
            </div>
            <div style={{ background:"var(--bg2)", border:"1px solid #0f1a26", padding:24, gridColumn:"1/-1" }}>
              <div style={{ fontSize:8, letterSpacing:3, color:"var(--border)", marginBottom:16 }}>THIS WEEK</div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12 }}>
                {[
                  {label:"POSTS",    value:s.week?.posts,    color:"var(--green,#00ff88)"},
                  {label:"NEW USERS",value:s.week?.users,    color:"var(--cyan,#00d4ff)"},
                  {label:"THREADS",  value:s.week?.threads,  color:"var(--orange,#ff6b35)"},
                  {label:"CHAT MSG", value:s.week?.messages, color:"var(--yellow,#ffd700)"},
                ].map(({label,value,color}) => (
                  <div key={label} style={{ textAlign:"center", padding:"20px 12px", background:"var(--bg)", border:`1px solid ${color}18` }}>
                    <div style={{ fontSize:32, fontWeight:900, color, marginBottom:6 }}>{fmt(value)}</div>
                    <div style={{ fontSize:8, color:"var(--border)", letterSpacing:2 }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* -⬇ EXPORT -- */}
        {activeTab==="export" && (
          <ExportPanel token={token} toast={toast} stats={s} />
        )}

        {/* -- QUERY -- */}
        {activeTab==="query" && (
          <QueryPanel token={token} toast={toast} />
        )}

        {/* -- MAINTENANCE -- */}
        {activeTab==="maintenance" && (
          <MaintenancePanel token={token} toast={toast} onRefresh={() => fetchStats()} />
        )}

        {/* -- SESSIONS & IP BANS -- */}
        {activeTab==="sessions" && (
          <SessionsTab token={token} toast={toast} />
        )}

        {/* -- NEWSLETTER -- */}
        {activeTab==="newsletter" && (
          <NewsletterTab token={token} toast={toast} />
        )}

        {/* -- DB HEALTH -- */}
        {activeTab==="dbhealth" && (
          <DbHealthTab token={token} toast={toast} />
        )}

        {/* -- SYSTEM -- */}
        {activeTab==="system" && (
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
            <div style={{ background:"var(--bg2)", border:"1px solid #0f1a26", padding:24 }}>
              <div style={{ fontSize:8, letterSpacing:3, color:"var(--border)", marginBottom:16 }}>CONNECTION</div>
              {[
                ["API URL",       API_URL||"(same origin)"],
                ["Auto Refresh",  autoRefresh?"Every 30s":"Disabled"],
                ["Last Sync",     lastUpdate?lastUpdate.toLocaleTimeString():"Never"],
                ["Status",        error?"WARN Error":loading?"Syncing...":"* Connected"],
              ].map(([label,val]) => (
                <div key={label} style={{ display:"flex", justifyContent:"space-between", padding:"8px 0", borderBottom:"1px solid #0a1016" }}>
                  <span style={{ fontSize:9, color:"var(--muted)", letterSpacing:1 }}>{label.toUpperCase()}</span>
                  <span style={{ fontSize:10, color:"var(--muted)" }}>{val}</span>
                </div>
              ))}
            </div>
            <div style={{ background:"var(--bg2)", border:"1px solid #0f1a26", padding:24 }}>
              <div style={{ fontSize:8, letterSpacing:3, color:"var(--border)", marginBottom:16 }}>DATABASE TOTALS</div>
              {s && Object.entries({
                "Forum Users":   s.counts?.users?.total||0,
                "Posts":         s.counts?.posts?.total||0,
                "Threads":       s.counts?.forum?.threads||0,
                "Replies":       s.counts?.forum?.replies||0,
                "Chat Messages": s.counts?.chat?.messages||0,
                "Newsletter":    s.counts?.newsletter?.total||0,
                "Media Files":   s.counts?.media||0,
                "Contacts":      s.counts?.contacts||0,
                "Staff":         s.counts?.staff||0,
              }).map(([label,count]) => (
                <div key={label} style={{ display:"flex", justifyContent:"space-between", padding:"7px 0", borderBottom:"1px solid #0a1016" }}>
                  <span style={{ fontSize:9, color:"var(--muted)", letterSpacing:1 }}>{label.toUpperCase()}</span>
                  <span style={{ fontSize:11, color:"var(--green,#00ff88)", fontWeight:700 }}>{fmt(count)}</span>
                </div>
              ))}
            </div>
            <div style={{ background:"var(--bg2)", border:"1px solid #0f1a26", padding:24, gridColumn:"1/-1" }}>
              <div style={{ fontSize:8, letterSpacing:3, color:"var(--border)", marginBottom:16 }}>QUICK ACTIONS</div>
              <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                <Btn label="[R] REFRESH STATS"  color="var(--cyan,#00d4ff)" onClick={()=>fetchStats()} disabled={loading} />
                <Btn label={autoRefresh?"LIVE PAUSE AUTO-REFRESH":"[>] ENABLE AUTO-REFRESH"} color="var(--yellow,#ffd700)" onClick={()=>setAutoRefresh(p=>!p)} />
                <Btn label="[X] DISCONNECT" danger onClick={()=>{setToken("");setStats(null);}} />
              </div>
            </div>
          </div>
        )}

        {!s && !loading && !error && (
          <div style={{ textAlign:"center", padding:80, color:"var(--border)", fontSize:11, letterSpacing:3 }}>LOADING DATA...</div>
        )}

        {/* -- AUDIT LOG -- */}
        {activeTab==="audit" && (
          <AuditLogTab token={token} />
        )}
      </div>
    </div>
  );
}
export { CollectionBrowser, SessionsTab, MaintenancePanel, AuditLogTab, DbHealthTab }
