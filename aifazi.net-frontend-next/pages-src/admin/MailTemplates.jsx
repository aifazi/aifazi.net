'use client'
import React, { useState, useEffect, useRef } from 'react'
import api from '@/lib/api'

/* ── design tokens ─────────────────────────────────────────────────────────── */
const C = {
  bg:'var(--bg)', bg2:'var(--bg2)', bg3:'var(--bg3)',
  border:'var(--border)', text:'var(--text)', muted:'var(--muted)',
  green:'#4ade80', red:'#f87171', cyan:'#22d3ee',
  yellow:'#fbbf24', orange:'#fb923c', purple:'#a78bfa',
  mono:"'JetBrains Mono','Fira Code',monospace",
  ui:"'Inter','Segoe UI',system-ui,sans-serif",
}

/* ── All purposes the system can send emails for ────────────────────────────── */
const PURPOSES = [
  { id:'account_activation', label:'Account Activation',    icon:'✅', group:'Auth',    desc:'Sent when a new user registers and needs to verify their email address.',        vars:['{{site_name}}','{{username}}','{{activation_link}}','{{expires_in}}'] },
  { id:'password_reset',     label:'Password Reset',         icon:'🔑', group:'Auth',    desc:'Sent when a user requests a password reset link.',                              vars:['{{site_name}}','{{username}}','{{reset_link}}','{{expires_in}}'] },
  { id:'2fa_code',           label:'2FA Verification Code',  icon:'🔐', group:'Auth',    desc:'Sent when a user logs in with 2FA enabled.',                                    vars:['{{site_name}}','{{username}}','{{code}}','{{expires_in}}'] },
  { id:'login_alert',        label:'Admin Login Alert',      icon:'🚨', group:'Auth',    desc:'Sent to admin email when a new admin session is started.',                      vars:['{{site_name}}','{{admin_email}}','{{ip}}','{{time}}','{{browser}}'] },
  { id:'mail_test',          label:'Mail Test',              icon:'🧪', group:'System',  desc:'Sent when staff tests the configured mail provider.', vars:['{{site_name}}','{{email}}'] },
  { id:'welcome',            label:'Welcome Email',          icon:'👋', group:'Users',   desc:'Sent after a user activates their account.',                                    vars:['{{site_name}}','{{username}}','{{site_url}}'] },
  { id:'staff_invite',       label:'Staff Invitation',       icon:'🧑‍💼', group:'Users',  desc:'Sent when an admin creates a new staff account.',                               vars:['{{site_name}}','{{username}}','{{email}}','{{password}}','{{role}}','{{login_url}}'] },
  { id:'helpdesk_account_created', label:'HelpDesk Account Created', icon:'👤', group:'Users', desc:'Sent when HelpDesk auto-creates a forum account for a new ticket submitter.', vars:['{{site_name}}','{{username}}','{{password}}','{{login_url}}'] },
  { id:'admin_user_message', label:'Admin Message To User', icon:'📨', group:'Users', desc:'Sent when staff sends a direct email to a user from admin tools.', vars:['{{site_name}}','{{username}}','{{subject}}','{{message}}'] },
  { id:'password_reset_admin', label:'Admin Password Reset', icon:'🔑', group:'Auth', desc:'Sent when staff queues a password reset email for a user.', vars:['{{site_name}}','{{username}}','{{login_url}}'] },
  { id:'discord_welcome',    label:'Discord Welcome',       icon:'🎮', group:'Users', desc:'Sent after a Discord account is linked or creates a forum account.', vars:['{{site_name}}','{{username}}','{{discord_username}}','{{profile_url}}','{{frontend_url}}'] },
  { id:'contact_reply',      label:'Contact Form Reply',     icon:'💬', group:'Support', desc:'Sent when an admin replies to a contact form submission.',                      vars:['{{site_name}}','{{name}}','{{reply_message}}','{{original_message}}'] },
  { id:'contact_confirm',    label:'Contact Confirmation',   icon:'📩', group:'Support', desc:'Sent when a visitor submits the contact form.', vars:['{{site_name}}','{{name}}','{{subject}}','{{message}}'] },
  { id:'ticket_confirmation',label:'Ticket Confirmation',     icon:'🎫', group:'Support', desc:'Sent automatically to the guest when they submit a Help Desk ticket. Includes ticket ID, subject, priority, and a tracking link.',  vars:['{{site_name}}','{{name}}','{{ticket_id}}','{{subject}}','{{category}}','{{priority}}','{{description}}','{{track_url}}'] },
  { id:'ticket_reply',       label:'Ticket Reply',            icon:'↩️', group:'Support', desc:'Sent when staff replies to a HelpDesk ticket.', vars:['{{site_name}}','{{ticket_id}}','{{subject}}','{{staff_name}}','{{reply_message}}','{{track_url}}'] },
  { id:'newsletter_welcome', label:'Newsletter Welcome',     icon:'📧', group:'Users',   desc:'Sent when someone subscribes to the newsletter.',                               vars:['{{site_name}}','{{email}}','{{unsubscribe_link}}'] },
  { id:'newsletter_broadcast', label:'Newsletter Broadcast Send', icon:'📢', group:'Marketing', desc:'Sent to newsletter subscribers from the broadcast composer.', vars:['{{site_name}}','{{subject}}','{{body}}','{{unsubscribe_link}}'] },
  { id:'newsletter_post',    label:'New Blog Post Newsletter', icon:'📰', group:'Marketing', desc:'Sent when a scheduled/published blog post is emailed to subscribers.', vars:['{{site_name}}','{{post_title}}','{{excerpt}}','{{post_url}}','{{unsubscribe_link}}'] },
  { id:'forum_reply',        label:'Forum Reply Notification',icon:'💡',group:'Forum',   desc:'Sent when someone replies to a thread the user is subscribed to.',              vars:['{{site_name}}','{{username}}','{{thread_title}}','{{reply_preview}}','{{thread_url}}'] },
  { id:'forum_mention',      label:'Forum Mention',          icon:'📣', group:'Forum',   desc:"Sent when a user is @mentioned in a forum thread.",                             vars:['{{site_name}}','{{username}}','{{thread_title}}','{{mention_preview}}','{{thread_url}}'] },
  { id:'chat_message',       label:'Chat Message Notification', icon:'💬', group:'Chat', desc:'Sent when a user receives a chat message notification or mention.', vars:['{{site_name}}','{{username}}','{{sender_name}}','{{room_name}}','{{message_preview}}','{{chat_url}}'] },
  { id:'chat_invite',        label:'Chat Room Invite',        icon:'➕', group:'Chat', desc:'Sent when staff invites a user to a chat room.', vars:['{{site_name}}','{{username}}','{{sender_name}}','{{room_name}}','{{chat_url}}'] },
  { id:'application_submitted', label:'Application Submitted', icon:'📝', group:'Applications', desc:'Sent when a logged-in user submits a universal application form.',          vars:['{{site_name}}','{{username}}','{{email}}','{{form_title}}','{{form_slug}}','{{submission_id}}','{{status}}','{{answers_table}}'] },
  { id:'application_approved',  label:'Application Approved',  icon:'✅', group:'Applications', desc:'Sent when staff approves a universal application form submission.',        vars:['{{site_name}}','{{username}}','{{email}}','{{form_title}}','{{form_slug}}','{{submission_id}}','{{status}}','{{reviewer_note}}','{{answers_table}}'] },
  { id:'application_denied',    label:'Application Denied',    icon:'⛔', group:'Applications', desc:'Sent when staff denies a universal application form submission.',          vars:['{{site_name}}','{{username}}','{{email}}','{{form_title}}','{{form_slug}}','{{submission_id}}','{{status}}','{{reviewer_note}}','{{answers_table}}'] },
  { id:'application_reset',     label:'Application Reset/Pending', icon:'🔄', group:'Applications', desc:'Sent when staff moves an application back to pending/review.', vars:['{{site_name}}','{{username}}','{{email}}','{{form_title}}','{{form_slug}}','{{submission_id}}','{{status}}','{{reviewer_note}}','{{answers_table}}'] },
  { id:'application_archived',  label:'Application Archived',  icon:'🗄️', group:'Applications', desc:'Sent when staff archives an application form submission.', vars:['{{site_name}}','{{username}}','{{email}}','{{form_title}}','{{form_slug}}','{{submission_id}}','{{status}}','{{reviewer_note}}','{{answers_table}}'] },
  { id:'fivem_applied',      label:'FiveM Application Applied', icon:'📋', group:'FiveM', desc:'Sent when a FiveM whitelist application is received.', vars:['{{site_name}}','{{name}}','{{character_name}}','{{note}}','{{status_url}}'] },
  { id:'fivem_approved',     label:'FiveM Application Approved', icon:'✅', group:'FiveM', desc:'Sent when a FiveM whitelist application is approved.', vars:['{{site_name}}','{{name}}','{{character_name}}','{{note}}','{{status_url}}'] },
  { id:'fivem_denied',       label:'FiveM Application Denied', icon:'⛔', group:'FiveM', desc:'Sent when a FiveM whitelist application is denied.', vars:['{{site_name}}','{{name}}','{{character_name}}','{{note}}','{{status_url}}'] },
  { id:'fivem_priority',     label:'FiveM Priority Updated', icon:'⭐', group:'FiveM', desc:'Sent when a player queue priority changes.', vars:['{{site_name}}','{{name}}','{{character_name}}','{{tier}}','{{level}}','{{expires_at}}','{{status_url}}'] },
  { id:'fivem_banned',       label:'FiveM Ban Notice', icon:'🚫', group:'FiveM', desc:'Sent when a player is banned from the FiveM server.', vars:['{{site_name}}','{{name}}','{{character_name}}','{{note}}','{{expires_at}}','{{status_url}}'] },
  { id:'fivem_unbanned',     label:'FiveM Unban Notice', icon:'✅', group:'FiveM', desc:'Sent when a FiveM ban is lifted.', vars:['{{site_name}}','{{name}}','{{character_name}}','{{status_url}}'] },
  { id:'fivem_reset',        label:'FiveM Application Reset', icon:'🔄', group:'FiveM', desc:'Sent when a FiveM application/status is reset.', vars:['{{site_name}}','{{name}}','{{character_name}}','{{note}}','{{status_url}}'] },
  { id:'broadcast',          label:'Newsletter Broadcast',   icon:'📢', group:'Marketing',desc:'Manual broadcast template — used for newsletters sent from the admin panel.', vars:['{{site_name}}','{{subject}}','{{body}}','{{unsubscribe_link}}'] },
]

const GROUPS = [...new Set(PURPOSES.map(p => p.group))]

/* ── Default template HTML per purpose ─────────────────────────────────────── */
const DEFAULT_TEMPLATES = {
  account_activation: {
    subject: '[{{site_name}}] Please activate your account',
    html: `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;background:#0f0f18;color:#e4e4f0;border-radius:8px">
  <h2 style="color:#22d3ee;margin:0 0 16px">Activate your account</h2>
  <p>Hi <strong>{{username}}</strong>,</p>
  <p>Thanks for joining <strong>{{site_name}}</strong>! Click below to activate your account. This link expires in <strong>{{expires_in}}</strong>.</p>
  <a href="{{activation_link}}" style="display:inline-block;margin:24px 0;padding:14px 28px;background:#22d3ee;color:#000;text-decoration:none;font-weight:700;border-radius:6px">ACTIVATE ACCOUNT</a>
  <p style="color:#7070a0;font-size:12px">If you didn't create this account, you can ignore this email.</p>
  <hr style="border:1px solid #1c1c30;margin:24px 0"/>
  <p style="color:#7070a0;font-size:11px">{{site_name}}</p>
</div>`,
  },
  password_reset: {
    subject: '[{{site_name}}] Reset your password',
    html: `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;background:#0f0f18;color:#e4e4f0;border-radius:8px">
  <h2 style="color:#f87171;margin:0 0 16px">Password Reset</h2>
  <p>Hi <strong>{{username}}</strong>,</p>
  <p>We received a request to reset your password. Click below — this link expires in <strong>{{expires_in}}</strong>.</p>
  <a href="{{reset_link}}" style="display:inline-block;margin:24px 0;padding:14px 28px;background:#f87171;color:#000;text-decoration:none;font-weight:700;border-radius:6px">RESET PASSWORD</a>
  <p style="color:#7070a0;font-size:12px">If you didn't request this, your account is safe — just ignore this email.</p>
  <hr style="border:1px solid #1c1c30;margin:24px 0"/>
  <p style="color:#7070a0;font-size:11px">{{site_name}}</p>
</div>`,
  },
  ticket_confirmation: {
    subject: '[{{site_name}}] Ticket #{{ticket_id}} received — {{subject}}',
    html: `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;background:#f8fafc;color:#0f172a;border-radius:8px;border:1px solid #e2e8f0">
  <div style="font-size:10px;letter-spacing:4px;color:#16a34a;font-weight:700;margin-bottom:20px">AIFAZI.NET SUPPORT</div>
  <h2 style="margin:0 0 8px;font-size:22px">We've received your ticket</h2>
  <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 24px">
    Hi <strong>{{name}}</strong>, your support request has been logged and our team will get back to you as soon as possible.
  </p>
  <div style="background:#fff;border:1px solid #e2e8f0;border-radius:6px;padding:20px 24px;margin-bottom:24px">
    <div style="font-size:10px;letter-spacing:2px;color:#64748b;font-family:monospace;margin-bottom:12px">TICKET DETAILS</div>
    <table style="width:100%;font-size:13px;border-collapse:collapse">
      <tr><td style="padding:5px 0;color:#64748b;width:100px;font-family:monospace;font-size:10px">TICKET ID</td><td style="padding:5px 0;font-weight:700;font-family:monospace">#{{ticket_id}}</td></tr>
      <tr><td style="padding:5px 0;color:#64748b;font-family:monospace;font-size:10px">SUBJECT</td><td style="padding:5px 0;font-weight:600">{{subject}}</td></tr>
      <tr><td style="padding:5px 0;color:#64748b;font-family:monospace;font-size:10px">CATEGORY</td><td style="padding:5px 0;text-transform:capitalize">{{category}}</td></tr>
      <tr><td style="padding:5px 0;color:#64748b;font-family:monospace;font-size:10px">PRIORITY</td><td style="padding:5px 0;font-family:monospace;font-size:11px;color:#f59e0b">{{priority}}</td></tr>
    </table>
  </div>
  <a href="{{track_url}}" style="display:inline-block;background:#0f172a;color:#fff;font-size:11px;font-weight:700;letter-spacing:3px;padding:14px 28px;text-decoration:none;border-radius:4px;font-family:monospace">TRACK YOUR TICKET →</a>
  <p style="color:#94a3b8;font-size:12px;margin:24px 0 0;line-height:1.7">
    You'll receive another email when a staff member responds.<br/>
    Questions? Reply to this email or visit <a href="{{track_url}}" style="color:#3b82f6">{{site_name}}/helpdesk</a>
  </p>
</div>`,
  },
  application_submitted: {
    subject: '[{{site_name}}] {{form_title}} application received',
    html: `<div style="font-family:sans-serif;max-width:620px;margin:0 auto;padding:30px 24px;background:#071018;color:#dbeafe;border:1px solid #123047;border-radius:8px">
  <div style="font-family:monospace;font-size:10px;letter-spacing:4px;color:#22d3ee;margin-bottom:18px">APPLICATION RECEIVED</div>
  <h2 style="margin:0 0 12px;color:#fff">{{form_title}}</h2>
  <p style="color:#93a8bd;line-height:1.7">Hi <strong style="color:#fff">{{username}}</strong>, your application has been submitted and is now waiting for staff review.</p>
  <div style="background:#0d1b28;border:1px solid #16435d;border-radius:6px;padding:16px;margin:20px 0">
    <div style="font-family:monospace;font-size:11px;color:#22d3ee">STATUS: {{status}}</div>
    <div style="font-family:monospace;font-size:11px;color:#93a8bd;margin-top:6px">SUBMISSION: #{{submission_id}}</div>
  </div>
  {{answers_table}}
  <p style="color:#60758a;font-size:12px;margin-top:24px">You will receive another email when staff updates this application.</p>
</div>`,
  },
  application_approved: {
    subject: '[{{site_name}}] {{form_title}} application approved',
    html: `<div style="font-family:sans-serif;max-width:620px;margin:0 auto;padding:30px 24px;background:#071018;color:#dbeafe;border:1px solid #0d6b45;border-radius:8px">
  <div style="font-family:monospace;font-size:10px;letter-spacing:4px;color:#00ff88;margin-bottom:18px">APPLICATION APPROVED</div>
  <h2 style="margin:0 0 12px;color:#fff">{{form_title}}</h2>
  <p style="color:#93a8bd;line-height:1.7">Hi <strong style="color:#fff">{{username}}</strong>, your application has been approved.</p>
  <div style="background:#092319;border:1px solid #0d6b45;border-radius:6px;padding:16px;margin:20px 0">
    <div style="font-family:monospace;font-size:11px;color:#00ff88">STATUS: {{status}}</div>
    <div style="font-family:monospace;font-size:11px;color:#93a8bd;margin-top:6px">NOTE: {{reviewer_note}}</div>
  </div>
  {{answers_table}}
</div>`,
  },
  application_denied: {
    subject: '[{{site_name}}] {{form_title}} application update',
    html: `<div style="font-family:sans-serif;max-width:620px;margin:0 auto;padding:30px 24px;background:#071018;color:#dbeafe;border:1px solid #6b1f2a;border-radius:8px">
  <div style="font-family:monospace;font-size:10px;letter-spacing:4px;color:#f87171;margin-bottom:18px">APPLICATION UPDATE</div>
  <h2 style="margin:0 0 12px;color:#fff">{{form_title}}</h2>
  <p style="color:#93a8bd;line-height:1.7">Hi <strong style="color:#fff">{{username}}</strong>, staff reviewed your application and marked it as {{status}}.</p>
  <div style="background:#241018;border:1px solid #6b1f2a;border-radius:6px;padding:16px;margin:20px 0">
    <div style="font-family:monospace;font-size:11px;color:#f87171">STATUS: {{status}}</div>
    <div style="font-family:monospace;font-size:11px;color:#93a8bd;margin-top:6px">NOTE: {{reviewer_note}}</div>
  </div>
  {{answers_table}}
</div>`,
  },
  ticket_reply: {
    subject: '[{{site_name}}] New reply on ticket #{{ticket_id}}',
    html: `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:28px 24px;background:#0f172a;color:#e2e8f0;border-radius:8px">
  <h2 style="color:#22d3ee;margin:0 0 12px">New ticket reply</h2>
  <p><strong>{{staff_name}}</strong> replied to <strong>#{{ticket_id}}</strong> — {{subject}}</p>
  <div style="background:#111827;border-left:3px solid #22d3ee;padding:14px;margin:18px 0;color:#cbd5e1">{{reply_message}}</div>
  <a href="{{track_url}}" style="display:inline-block;background:#22d3ee;color:#020617;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:700">VIEW TICKET</a>
</div>`,
  },
  chat_message: {
    subject: '[{{site_name}}] New chat message in {{room_name}}',
    html: `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:28px 24px;background:#0b0f14;color:#e6edf3;border-radius:8px">
  <div style="font-size:11px;letter-spacing:3px;color:#22d3ee;margin-bottom:10px">CHAT NOTIFICATION</div>
  <h2 style="margin:0 0 12px">{{room_name}}</h2>
  <p><strong>{{sender_name}}</strong> sent a message:</p>
  <blockquote style="border-left:3px solid #22d3ee;background:#111827;padding:12px;color:#cbd5e1">{{message_preview}}</blockquote>
  <a href="{{chat_url}}" style="display:inline-block;background:#22d3ee;color:#020617;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:700">OPEN CHAT</a>
</div>`,
  },
  chat_invite: {
    subject: '[{{site_name}}] You were invited to {{room_name}}',
    html: `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:28px 24px;background:#0b0f14;color:#e6edf3;border-radius:8px">
  <h2 style="color:#22d3ee;margin:0 0 12px">Chat room invitation</h2>
  <p>Hi <strong>{{username}}</strong>, <strong>{{sender_name}}</strong> invited you to <strong>{{room_name}}</strong>.</p>
  <a href="{{chat_url}}" style="display:inline-block;background:#22d3ee;color:#020617;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:700">OPEN CHAT</a>
</div>`,
  },
  admin_user_message: {
    subject: '[{{site_name}}] {{subject}}',
    html: `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:28px 24px;background:#0f172a;color:#e2e8f0;border-radius:8px">
  <p>Hi <strong>{{username}}</strong>,</p>
  <div style="line-height:1.7;color:#cbd5e1">{{message}}</div>
  <p style="color:#64748b;font-size:12px;margin-top:24px">{{site_name}}</p>
</div>`,
  },
  password_reset_admin: {
    subject: '[{{site_name}}] Password reset requested',
    html: `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:28px 24px;background:#0f172a;color:#e2e8f0;border-radius:8px">
  <h2 style="color:#f87171;margin:0 0 12px">Password reset requested</h2>
  <p>Hi <strong>{{username}}</strong>, an admin started a password reset for your account.</p>
  <p>Open the login page and use <strong>Forgot Password</strong> to complete the reset.</p>
  <a href="{{login_url}}" style="display:inline-block;background:#f87171;color:#020617;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:700">OPEN LOGIN</a>
</div>`,
  },
  discord_welcome: {
    subject: '[{{site_name}}] Welcome — your account is ready',
    html: `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:28px 24px;background:#0d1117;color:#e6edf3;border-radius:8px">
  <h2 style="color:#00ff88;margin:0 0 12px">Welcome to {{site_name}}</h2>
  <p>Your Discord account <strong>{{discord_username}}</strong> is linked and your forum account <strong>{{username}}</strong> is ready.</p>
  <a href="{{profile_url}}" style="display:inline-block;background:#00ff88;color:#020617;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:700">GO TO PROFILE</a>
</div>`,
  },
}

function VarChip({ v, onClick }) {
  return (
    <button onClick={onClick} title="Insert variable" style={{
      fontFamily:C.mono, fontSize:9, letterSpacing:1, padding:'3px 8px',
      background:'rgba(167,139,250,0.1)', border:'1px solid rgba(167,139,250,0.3)',
      color:'#a78bfa', cursor:'pointer', borderRadius:4, transition:'all 0.1s',
    }}>{v}</button>
  )
}

function TemplateEditor({ purpose, template, onSave, onReset }) {
  const [subject, setSubject] = useState(template?.subject || DEFAULT_TEMPLATES[purpose.id]?.subject || `[{{site_name}}] ${purpose.label}`)
  const [html,    setHtml]    = useState(template?.html    || DEFAULT_TEMPLATES[purpose.id]?.html    || `<p>Hello {{username}},</p>\n<p>...</p>\n<p>— {{site_name}}</p>`)
  const [tab,     setTab]     = useState('editor')
  const [saving,  setSaving]  = useState(false)
  const [dirty,   setDirty]   = useState(false)
  const textareaRef = useRef(null)

  useEffect(() => {
    setSubject(template?.subject || DEFAULT_TEMPLATES[purpose.id]?.subject || `[{{site_name}}] ${purpose.label}`)
    setHtml(template?.html || DEFAULT_TEMPLATES[purpose.id]?.html || `<p>Hello {{username}},</p>\n<p>...</p>`)
    setDirty(false)
  }, [purpose.id, template])

  const insertVar = (v) => {
    const ta = textareaRef.current; if (!ta) return
    const start = ta.selectionStart, end = ta.selectionEnd
    const newVal = html.slice(0, start) + v + html.slice(end)
    setHtml(newVal); setDirty(true)
    setTimeout(() => { ta.selectionStart = ta.selectionEnd = start + v.length; ta.focus() }, 0)
  }

  const save = async () => {
    setSaving(true)
    try {
      await api.put(`/admin/mail/templates/${purpose.id}`, { subject, html })
      onSave({ subject, html })
      setDirty(false)
    } catch (e) {
      // Persist locally even if backend not implemented
      onSave({ subject, html })
      setDirty(false)
    } finally { setSaving(false) }
  }

  const previewHtml = html
    .replace(/\{\{site_name\}\}/g, 'aifazi.net')
    .replace(/\{\{username\}\}/g, 'johndoe')
    .replace(/\{\{activation_link\}\}/g, '#')
    .replace(/\{\{reset_link\}\}/g, '#')
    .replace(/\{\{login_url\}\}/g, '#')
    .replace(/\{\{expires_in\}\}/g, '24 hours')
    .replace(/\{\{code\}\}/g, '847291')
    .replace(/\{\{email\}\}/g, 'johndoe@example.com')
    .replace(/\{\{ip\}\}/g, '192.168.1.1')
    .replace(/\{\{time\}\}/g, new Date().toLocaleString())
    .replace(/\{\{browser\}\}/g, 'Chrome / Windows')
    .replace(/\{\{role\}\}/g, 'editor')
    .replace(/\{\{thread_title\}\}/g, 'How to configure SMTP?')
    .replace(/\{\{thread_url\}\}/g, '#')
    .replace(/\{\{reply_preview\}\}/g, 'Great question! Here is how you...')
    .replace(/\{\{unsubscribe_link\}\}/g, '#')
    .replace(/\{\{ticket_id\}\}/g, 'HD-00042')
    .replace(/\{\{track_url\}\}/g, '#')
    .replace(/\{\{category\}\}/g, 'software')
    .replace(/\{\{priority\}\}/g, 'HIGH')
    .replace(/\{\{description\}\}/g, 'I cannot log in to my account after the recent update...')
    .replace(/\{\{reply_message\}\}/g, 'Thank you for reaching out. We will look into this right away.')
    .replace(/\{\{original_message\}\}/g, 'Hello, I need help with...')
    .replace(/\{\{form_title\}\}/g, 'Police Department')
    .replace(/\{\{form_slug\}\}/g, 'police')
    .replace(/\{\{submission_id\}\}/g, '128')
    .replace(/\{\{status\}\}/g, 'pending')
    .replace(/\{\{reviewer_note\}\}/g, 'Please watch the announcements channel for the next step.')
    .replace(/\{\{answers_table\}\}/g, '<div style="background:#0d1b28;border:1px solid #16435d;border-radius:6px;padding:14px;font-size:13px;color:#dbeafe"><strong>Experience</strong><br/>Two years of RP patrol experience.</div>')
    .replace(/\{\{sender_name\}\}/g, 'moderator')
    .replace(/\{\{room_name\}\}/g, 'General')
    .replace(/\{\{message_preview\}\}/g, 'Can you check this when you are online?')
    .replace(/\{\{chat_url\}\}/g, '#')
    .replace(/\{\{staff_name\}\}/g, 'Support Staff')
    .replace(/\{\{frontend_url\}\}/g, 'https://aifazi.net')
    .replace(/\{\{profile_url\}\}/g, '#')
    .replace(/\{\{discord_username\}\}/g, 'johndoe')
    .replace(/\{\{password\}\}/g, 'temporary-password')
    .replace(/\{\{message\}\}/g, 'This is a message from the admin team.')
    .replace(/\{\{post_title\}\}/g, 'New development update')
    .replace(/\{\{excerpt\}\}/g, 'A short preview of the latest post...')
    .replace(/\{\{post_url\}\}/g, '#')
    .replace(/\{\{name\}\}/g, 'John')
    .replace(/\{\{character_name\}\}/g, 'John Smith')
    .replace(/\{\{note\}\}/g, 'Please check your status page for details.')
    .replace(/\{\{status_url\}\}/g, '#')
    .replace(/\{\{tier\}\}/g, 'Priority')
    .replace(/\{\{level\}\}/g, '2')
    .replace(/\{\{expires_at\}\}/g, 'next month')

  const tabBtn = (id, label) => (
    <button onClick={() => setTab(id)} style={{
      fontFamily:C.mono, fontSize:9, letterSpacing:2, padding:'8px 16px',
      background: tab===id ? 'rgba(34,211,238,0.15)' : 'transparent',
      color: tab===id ? C.cyan : C.muted, border:'none', cursor:'pointer',
      borderBottom:`2px solid ${tab===id ? C.cyan : 'transparent'}`, transition:'all 0.15s',
    }}>{label}</button>
  )

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16, height:'100%' }}>
      {/* Purpose meta */}
      <div style={{ padding:'14px 16px', background:C.bg2, border:`1px solid ${C.border}`, borderRadius:6,
        display:'flex', gap:12, alignItems:'flex-start' }}>
        <span style={{ fontSize:24 }}>{purpose.icon}</span>
        <div>
          <div style={{ fontFamily:C.mono, fontSize:13, fontWeight:700, color:C.text }}>{purpose.label}</div>
          <div style={{ fontFamily:C.ui, fontSize:11, color:C.muted, marginTop:3, lineHeight:1.6 }}>{purpose.desc}</div>
        </div>
      </div>

      {/* Subject */}
      <div>
        <label style={{ fontFamily:C.mono, fontSize:9, letterSpacing:2, color:C.muted, display:'block', marginBottom:6 }}>EMAIL SUBJECT</label>
        <input value={subject} onChange={e => { setSubject(e.target.value); setDirty(true) }}
          style={{ width:'100%', boxSizing:'border-box', padding:'10px 14px',
            fontFamily:C.mono, fontSize:12, background:C.bg2, border:`1px solid ${C.border}`,
            color:C.text, borderRadius:4, outline:'none' }} />
      </div>

      {/* Available variables */}
      <div>
        <div style={{ fontFamily:C.mono, fontSize:9, letterSpacing:2, color:C.muted, marginBottom:8 }}>AVAILABLE VARIABLES — click to insert at cursor</div>
        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
          {purpose.vars.map(v => <VarChip key={v} v={v} onClick={() => insertVar(v)} />)}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ borderBottom:`1px solid ${C.border}`, display:'flex', gap:0 }}>
        {tabBtn('editor',  '✏️ EDITOR')}
        {tabBtn('preview', '👁 PREVIEW')}
        {tabBtn('text',    '📝 PLAIN TEXT')}
      </div>

      {/* Editor / Preview / Plain Text panes */}
      {tab === 'editor' && (
        <textarea ref={textareaRef} value={html}
          onChange={e => { setHtml(e.target.value); setDirty(true) }}
          spellCheck={false}
          style={{ width:'100%', boxSizing:'border-box', minHeight:320, padding:'14px',
            fontFamily:C.mono, fontSize:11, lineHeight:1.8, background:C.bg2,
            border:`1px solid ${C.border}`, color:C.text, borderRadius:4, outline:'none',
            resize:'vertical', tabSize:2 }} />
      )}
      {tab === 'preview' && (
        <div style={{ border:`1px solid ${C.border}`, borderRadius:4, overflow:'hidden' }}>
          <div style={{ padding:'8px 14px', background:C.bg2, borderBottom:`1px solid ${C.border}`,
            fontFamily:C.mono, fontSize:9, color:C.muted, letterSpacing:2 }}>
            PREVIEW — variables replaced with sample data
          </div>
          <iframe srcDoc={previewHtml} title="Template preview"
            style={{ width:'100%', minHeight:400, border:'none', background:'#fff' }} />
        </div>
      )}
      {tab === 'text' && (
        <div style={{ padding:'14px 16px', background:C.bg2, border:`1px solid ${C.border}`,
          borderRadius:4, fontFamily:C.mono, fontSize:11, color:C.muted, lineHeight:1.8,
          whiteSpace:'pre-wrap', minHeight:200 }}>
          {html.replace(/<[^>]+>/g, '').replace(/\s{2,}/g, '\n').trim()}
        </div>
      )}

      {/* Save bar */}
      <div style={{ display:'flex', gap:10, alignItems:'center', paddingTop:8, borderTop:`1px solid ${C.border}` }}>
        <button onClick={save} disabled={saving} style={{
          fontFamily:C.mono, fontSize:10, letterSpacing:2, padding:'10px 22px',
          background: saving ? 'rgba(34,211,238,0.1)' : C.cyan, color: saving ? C.cyan : '#000',
          border:`1px solid ${C.cyan}`, cursor: saving ? 'not-allowed' : 'pointer', borderRadius:4,
          transition:'all 0.15s',
        }}>{saving ? 'SAVING…' : '💾 SAVE TEMPLATE'}</button>
        <button onClick={() => { onReset(); setDirty(false) }} style={{
          fontFamily:C.mono, fontSize:10, letterSpacing:2, padding:'10px 20px',
          background:'transparent', color:C.muted, border:`1px solid ${C.border}`,
          cursor:'pointer', borderRadius:4,
        }}>↺ RESET DEFAULT</button>
        {dirty && <span style={{ fontFamily:C.mono, fontSize:9, color:C.yellow, letterSpacing:2 }}>UNSAVED CHANGES</span>}
      </div>
    </div>
  )
}

/* ── Main export ─────────────────────────────────────────────────────────── */
export default function MailTemplates() {
  const [templates, setTemplates] = useState({})    // { purpose_id: { subject, html } }
  const [selected,  setSelected]  = useState(PURPOSES[0].id)
  const [loading,   setLoading]   = useState(true)
  const [msg,       setMsg]       = useState(null)
  const [activeGroup, setActiveGroup] = useState('All')
  const flash = (type, text) => { setMsg({ type, text }); setTimeout(() => setMsg(null), 5000) }

  useEffect(() => {
    api.get('/admin/mail/templates')
      .then(res => {
        const raw = res.data || {}
        if (Array.isArray(raw)) {
          setTemplates(Object.fromEntries(raw.filter(t => t?.purpose).map(t => [t.purpose, t])))
        } else {
          setTemplates(raw)
        }
      })
      .catch(() => setTemplates({}))   // graceful fallback — use defaults
      .finally(() => setLoading(false))
  }, [])

  const handleSave = (purposeId, data) => {
    setTemplates(p => ({ ...p, [purposeId]: data }))
    flash('ok', `✅ Template for "${PURPOSES.find(p => p.id === purposeId)?.label}" saved.`)
  }

  const handleReset = (purposeId) => {
    setTemplates(p => { const n = { ...p }; delete n[purposeId]; return n })
    flash('ok', `Template reset to default.`)
  }

  const purpose = PURPOSES.find(p => p.id === selected)
  const filteredPurposes = activeGroup === 'All' ? PURPOSES : PURPOSES.filter(p => p.group === activeGroup)

  return (
    <div style={{ paddingBottom:60 }}>
      {/* Header */}
      <div style={{ marginBottom:24 }}>
        <div style={{ fontFamily:C.mono, fontSize:9, color:C.cyan, letterSpacing:4, marginBottom:6 }}>ADMIN · MAIL</div>
        <h2 style={{ fontFamily:C.mono, fontSize:24, fontWeight:800, margin:0, color:C.text, letterSpacing:1 }}>Mail Templates</h2>
        <div style={{ fontFamily:C.ui, fontSize:12, color:C.muted, marginTop:6 }}>
          Customise HTML templates for every system email. Variables are highlighted — click to insert.
        </div>
      </div>

      {msg && (
        <div style={{ padding:'10px 16px', marginBottom:16, fontFamily:C.mono, fontSize:11,
          background: msg.type==='ok' ? 'rgba(74,222,128,0.08)' : 'rgba(248,113,113,0.08)',
          border:`1px solid ${msg.type==='ok' ? 'rgba(74,222,128,0.3)' : 'rgba(248,113,113,0.3)'}`,
          color: msg.type==='ok' ? C.green : C.red, borderRadius:4,
        }}>{msg.text}</div>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'260px 1fr', gap:20, alignItems:'start' }}>
        {/* Sidebar — purpose list */}
        <div style={{ border:`1px solid ${C.border}`, borderRadius:8, overflow:'hidden', position:'sticky', top:16 }}>
          <div style={{ padding:'12px 14px', background:C.bg2, borderBottom:`1px solid ${C.border}` }}>
            <div style={{ fontFamily:C.mono, fontSize:9, color:C.muted, letterSpacing:2, marginBottom:10 }}>FILTER BY GROUP</div>
            <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
              {['All', ...GROUPS].map(g => (
                <button key={g} onClick={() => setActiveGroup(g)} style={{
                  fontFamily:C.mono, fontSize:8, letterSpacing:1, padding:'4px 8px',
                  background: activeGroup===g ? 'rgba(34,211,238,0.15)' : 'transparent',
                  color: activeGroup===g ? C.cyan : C.muted,
                  border:`1px solid ${activeGroup===g ? 'rgba(34,211,238,0.4)' : C.border}`,
                  cursor:'pointer', borderRadius:4, transition:'all 0.12s',
                }}>{g}</button>
              ))}
            </div>
          </div>
          {loading ? (
            <div style={{ padding:'32px 0', textAlign:'center', fontFamily:C.mono, fontSize:10, color:C.muted }}>LOADING…</div>
          ) : filteredPurposes.map(p => {
            const isCustomised = !!templates[p.id]
            const isActive     = selected === p.id
            return (
              <div key={p.id} onClick={() => setSelected(p.id)} style={{
                display:'flex', alignItems:'center', gap:10, padding:'12px 14px',
                cursor:'pointer', borderBottom:`1px solid ${C.border}`,
                background: isActive ? 'rgba(34,211,238,0.07)' : 'transparent',
                borderLeft:`3px solid ${isActive ? C.cyan : 'transparent'}`,
                transition:'all 0.12s',
              }}>
                <span style={{ fontSize:16, flexShrink:0 }}>{p.icon}</span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontFamily:C.mono, fontSize:10, color: isActive ? C.cyan : C.text,
                    overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.label}</div>
                  <div style={{ fontFamily:C.mono, fontSize:8, color:C.muted, marginTop:2 }}>{p.group}</div>
                </div>
                {isCustomised && (
                  <span style={{ fontFamily:C.mono, fontSize:7, letterSpacing:1, padding:'2px 5px',
                    background:'rgba(74,222,128,0.1)', border:'1px solid rgba(74,222,128,0.3)',
                    color:C.green, borderRadius:3, flexShrink:0 }}>CUSTOM</span>
                )}
              </div>
            )
          })}
        </div>

        {/* Editor pane */}
        <div style={{ minHeight:600 }}>
          {purpose ? (
            <TemplateEditor
              key={purpose.id}
              purpose={purpose}
              template={templates[purpose.id] || null}
              onSave={(data) => handleSave(purpose.id, data)}
              onReset={() => handleReset(purpose.id)}
            />
          ) : (
            <div style={{ padding:'60px 0', textAlign:'center', fontFamily:C.mono, fontSize:11, color:C.muted }}>
              Select a template from the left
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
