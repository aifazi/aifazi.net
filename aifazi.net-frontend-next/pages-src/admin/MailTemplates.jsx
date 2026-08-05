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

const THEME_VARS = ['{{theme_bg}}','{{theme_bg2}}','{{theme_bg3}}','{{theme_primary}}','{{theme_secondary}}','{{theme_orange}}','{{theme_text}}','{{theme_muted}}','{{theme_border}}']
PURPOSES.forEach(p => { p.vars = [...p.vars, ...THEME_VARS] })

/* ── Default template HTML per purpose ─────────────────────────────────────── */
// Theme-aware: uses {{theme_bg}}, {{theme_primary}} ... placeholders that the
// backend injects from site_config.globalTheme, so previews match sent emails.
const _themeShell = (title, body, btnLabel, btnUrl, icon='', footnote='') => `
<div style="background:{{theme_bg}};padding:32px 16px;font-family:Inter,'Segoe UI',sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:{{theme_bg2}};border:1px solid {{theme_border}};border-radius:14px;overflow:hidden;">
    <div style="height:6px;background:linear-gradient(90deg,{{theme_primary}},{{theme_secondary}});"></div>
    <div style="padding:36px 38px;">
      <div style="text-align:center;margin-bottom:24px;">
        <span style="font-family:Outfit,Inter,sans-serif;font-size:13px;font-weight:800;letter-spacing:4px;color:{{theme_primary}};">{{site_name}}</span>
      </div>
      <h1 style="color:{{theme_text}};font-family:Outfit,Inter,sans-serif;font-size:24px;font-weight:700;margin:0 0 18px;text-align:center;">${icon} ${title}</h1>
      ${body}
      ${btnLabel && btnUrl ? `<div style="text-align:center;margin:28px 0 8px;">
        <a href="${btnUrl}" style="display:inline-block;background:{{theme_primary}};color:#062a1a;font-family:Inter,'Segoe UI',sans-serif;font-size:14px;font-weight:700;letter-spacing:1.5px;text-decoration:none;padding:14px 34px;border-radius:8px;">${btnLabel}</a></div>
        <p style="color:{{theme_muted}};font-size:11px;text-align:center;margin:12px 0 0;">If the button doesn't work, open the link directly from your browser.</p>` : ''}
    </div>
    <div style="padding:16px 38px;background:{{theme_bg3}};border-top:1px solid {{theme_border}};text-align:center;">
      <span style="color:{{theme_muted}};font-size:11px;line-height:1.7;">${footnote || 'You are receiving this email because you have an account at {{site_name}}.'}</span>
    </div>
  </div>
</div>`

const DEFAULT_TEMPLATES = {
  account_activation: {
    subject: '[{{site_name}}] Verify your email',
    html: _themeShell('Verify your email',
      `<p style="color:{{theme_text}};font-size:14px;line-height:1.75;margin:0 0 16px;">Hi <strong>{{username}}</strong>, welcome to <strong>{{site_name}}</strong>. Please confirm your email address to activate your account.</p>`,
      'VERIFY EMAIL', '{{activation_link}}',
      '✅', `This link expires in {{expires_in}}. If you didn't create this account, you can safely ignore this email.`),
  },
  password_reset: {
    subject: '[{{site_name}}] Reset your password',
    html: _themeShell('Reset your password',
      `<p style="color:{{theme_text}};font-size:14px;line-height:1.75;margin:0 0 16px;">Hi <strong>{{username}}</strong>, we received a request to reset your password for <strong>{{site_name}}</strong>. Click below to choose a new one.</p>`,
      'RESET PASSWORD', '{{reset_link}}',
      '🔑', `This link expires in {{expires_in}}. If you didn't request this, you can safely ignore this email.`),
  },
  ticket_confirmation: {
    subject: '[{{site_name}}] Ticket #{{ticket_id}} received',
    html: _themeShell('Ticket received',
      `<p style="color:{{theme_text}};font-size:14px;line-height:1.75;margin:0 0 16px;">Hi <strong>{{name}}</strong>, your support request has been logged and our team will get back to you shortly.</p>
       <div style="background:{{theme_bg3}};border:1px solid {{theme_border}};border-radius:8px;padding:16px 18px;margin:0 0 16px;font-size:13px;">
         <div style="color:{{theme_muted}};font-size:11px;letter-spacing:2px;margin-bottom:8px;">TICKET DETAILS</div>
         <div style="color:{{theme_text}};margin:2px 0;"><strong>#</strong>{{ticket_id}} — {{subject}}</div>
         <div style="color:{{theme_text}};margin:2px 0;">Category: {{category}} · Priority: {{priority}}</div>
         <div style="color:{{theme_muted}};margin:6px 0 0;">{{description}}</div>
       </div>`,
      'TRACK YOUR TICKET', '{{track_url}}', '🎫'),
  },
  application_submitted: {
    subject: '[{{site_name}}] {{form_title}} application received',
    html: _themeShell('Application received',
      `<p style="color:{{theme_text}};font-size:14px;line-height:1.75;margin:0 0 16px;">Hi <strong>{{username}}</strong>, your application has been submitted and is now waiting for staff review.</p>
       <div style="background:{{theme_bg3}};border:1px solid {{theme_border}};border-radius:8px;padding:16px 18px;margin:0 0 16px;font-size:13px;">
         <div style="color:{{theme_muted}};font-size:11px;letter-spacing:2px;margin-bottom:8px;">STATUS: {{status}} · #{{submission_id}}</div>
       </div>
       {{answers_table}}`,
      '', '', '📝'),
  },
  application_approved: {
    subject: '[{{site_name}}] {{form_title}} application approved',
    html: _themeShell('Application approved',
      `<p style="color:{{theme_text}};font-size:14px;line-height:1.75;margin:0 0 16px;">Hi <strong>{{username}}</strong>, congratulations — your application has been approved.</p>
       <div style="background:{{theme_bg3}};border:1px solid {{theme_border}};border-radius:8px;padding:16px 18px;margin:0 0 16px;font-size:13px;">
         <div style="color:{{theme_muted}};font-size:11px;letter-spacing:2px;margin-bottom:8px;">STATUS: {{status}} · #{{submission_id}}</div>
         <div style="color:{{theme_text}};margin-top:6px;">Note: {{reviewer_note}}</div>
       </div>
       {{answers_table}}`,
      '', '', '✅'),
  },
  application_denied: {
    subject: '[{{site_name}}] {{form_title}} application update',
    html: _themeShell('Application update',
      `<p style="color:{{theme_text}};font-size:14px;line-height:1.75;margin:0 0 16px;">Hi <strong>{{username}}</strong>, staff reviewed your application and marked it as <strong>{{status}}</strong>.</p>
       <div style="background:{{theme_bg3}};border:1px solid {{theme_border}};border-radius:8px;padding:16px 18px;margin:0 0 16px;font-size:13px;">
         <div style="color:{{theme_muted}};font-size:11px;letter-spacing:2px;margin-bottom:8px;">STATUS: {{status}} · #{{submission_id}}</div>
         <div style="color:{{theme_text}};margin-top:6px;">Note: {{reviewer_note}}</div>
       </div>
       {{answers_table}}`,
      '', '', '⛔'),
  },
  ticket_reply: {
    subject: '[{{site_name}}] New reply on ticket #{{ticket_id}}',
    html: _themeShell('New reply on your ticket',
      `<p style="color:{{theme_text}};font-size:14px;line-height:1.75;margin:0 0 16px;"><strong>{{staff_name}}</strong> replied to <strong>#{{ticket_id}}</strong> — {{subject}}:</p>
       <blockquote style="margin:0 0 16px;padding:14px 18px;background:{{theme_bg3}};border-left:3px solid {{theme_primary}};color:{{theme_text}};font-size:13px;line-height:1.7;">{{reply_message}}</blockquote>`,
      'VIEW TICKET', '{{track_url}}', '↩️'),
  },
  chat_message: {
    subject: '[{{site_name}}] New chat message in {{room_name}}',
    html: _themeShell('New chat message',
      `<p style="color:{{theme_text}};font-size:14px;line-height:1.75;margin:0 0 16px;"><strong>{{sender_name}}</strong> sent a message in <strong>{{room_name}}</strong>:</p>
       <blockquote style="margin:0 0 16px;padding:14px 18px;background:{{theme_bg3}};border-left:3px solid {{theme_primary}};color:{{theme_text}};font-size:13px;line-height:1.7;">{{message_preview}}</blockquote>`,
      'OPEN CHAT', '{{chat_url}}', '💬'),
  },
  chat_invite: {
    subject: '[{{site_name}}] You were invited to {{room_name}}',
    html: _themeShell("You're invited",
      `<p style="color:{{theme_text}};font-size:14px;line-height:1.75;margin:0 0 16px;">Hi <strong>{{username}}</strong>, <strong>{{sender_name}}</strong> invited you to join <strong>{{room_name}}</strong>.</p>`,
      'JOIN THE CHAT', '{{chat_url}}', '➕'),
  },
  admin_user_message: {
    subject: '[{{site_name}}] {{subject}}',
    html: _themeShell('Message from the team',
      `<p style="color:{{theme_text}};font-size:14px;line-height:1.75;margin:0 0 16px;">Hi <strong>{{username}}</strong>,</p>
       <div style="color:{{theme_text}};font-size:14px;line-height:1.8;">{{message}}</div>`,
      '', '', '📨'),
  },
  password_reset_admin: {
    subject: '[{{site_name}}] Password reset requested',
    html: _themeShell('Password reset requested',
      `<p style="color:{{theme_text}};font-size:14px;line-height:1.75;margin:0 0 16px;">Hi <strong>{{username}}</strong>, an administrator started a password reset for your account. Open the login page and use <strong>Forgot Password</strong> to complete the reset.</p>`,
      'OPEN LOGIN', '{{login_url}}', '🔑'),
  },
  discord_welcome: {
    subject: '[{{site_name}}] Welcome — your account is ready',
    html: _themeShell("You're all set!",
      `<p style="color:{{theme_text}};font-size:14px;line-height:1.75;margin:0 0 16px;">Your Discord account <strong>{{discord_username}}</strong> is linked and your account <strong>{{username}}</strong> is ready. Head to your profile to continue.</p>`,
      'GO TO PROFILE', '{{profile_url}}', '🎮'),
  },
  mail_test: {
    subject: '[{{site_name}}] Test email',
    html: _themeShell('Mail test',
      `<p style="color:{{theme_text}};font-size:14px;line-height:1.75;margin:0;">This is a test email to <strong>{{email}}</strong>. Your email provider is configured and working correctly.</p>`,
      '', '', '🧪'),
  },
  contact_confirm: {
    subject: 'Thanks for contacting {{site_name}}',
    html: _themeShell('Message received',
      `<p style="color:{{theme_text}};font-size:14px;line-height:1.75;margin:0 0 16px;">Hi <strong>{{name}}</strong>, we received your message:</p>
       <blockquote style="margin:0 0 16px;padding:14px 18px;background:{{theme_bg3}};border-left:3px solid {{theme_primary}};color:{{theme_text}};font-size:13px;line-height:1.7;">{{message}}</blockquote>
       <p style="color:{{theme_muted}};font-size:13px;">We'll get back to you as soon as possible.</p>`,
      '', '', '📩'),
  },
  contact_reply: {
    subject: 'Re: {{subject}} — {{site_name}}',
    html: _themeShell('A reply from our team',
      `<p style="color:{{theme_text}};font-size:14px;line-height:1.75;margin:0 0 16px;">Hi <strong>{{name}}</strong>,</p>
       <blockquote style="margin:0 0 16px;padding:14px 18px;background:{{theme_bg3}};border-left:3px solid {{theme_primary}};color:{{theme_text}};font-size:13px;line-height:1.7;">{{reply_message}}</blockquote>
       <p style="color:{{theme_muted}};font-size:13px;">— The {{site_name}} team</p>`,
      '', '', '💬'),
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
const [saveError, setSaveError] = useState('')
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
    setSaveError('')
    try {
      await api.put(`/admin/mail/templates/${purpose.id}`, { subject, html })
      onSave({ subject, html })
      setDirty(false)
    } catch (e) {
      // Do NOT report a failed save as success — keep the template dirty and
      // surface the real error so the editor isn't silently lost.
      setSaveError(e?.response?.data?.detail || e?.message || 'Failed to save template')
      setDirty(true)
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
    .replace(/\{\{theme_bg\}\}/g, 'var(--bg, #060a0f)')
    .replace(/\{\{theme_bg2\}\}/g, 'var(--bg2, #0b1118)')
    .replace(/\{\{theme_bg3\}\}/g, 'var(--bg3, #111a24)')
    .replace(/\{\{theme_primary\}\}/g, 'var(--accent, #00ff88)')
    .replace(/\{\{theme_secondary\}\}/g, 'var(--cyan, #00d4ff)')
    .replace(/\{\{theme_orange\}\}/g, 'var(--orange, #ff6b35)')
    .replace(/\{\{theme_text\}\}/g, 'var(--text, #c8d8e8)')
    .replace(/\{\{theme_muted\}\}/g, 'var(--muted, #6b8296)')
    .replace(/\{\{theme_border\}\}/g, 'var(--border, rgba(0,212,255,0.15))')

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
        {saveError && <span style={{ fontFamily:C.mono, fontSize:9, color:'#f87171', letterSpacing:1 }}>⚠ {saveError}</span>}
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
        <div style={{ display:'flex', alignItems:'center', gap:8, fontFamily:C.mono, fontSize:9, color:C.cyan, letterSpacing:4, marginBottom:8, textTransform:'uppercase' }}>
          <span style={{ width:14, height:2, background:'linear-gradient(90deg,#22d3ee,transparent)', borderRadius:2 }} />
          ADMIN · MAIL
        </div>
        <h2 style={{ fontFamily:'var(--font-display)', fontSize:26, fontWeight:700, margin:0, color:C.text, letterSpacing:-0.5, lineHeight:1.2 }}>Mail Templates</h2>
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
