'use client'

/* ─────────────────────────────────────────────────────────────────────────────
   Lightweight inline SVG icon set (stroke-based, currentColor).
   No external icon dependency — keeps the admin bundle lean.
───────────────────────────────────────────────────────────────────────────── */
const PATHS = {
  grid:      <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/></>,
  file:      <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/></>,
  image:     <><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></>,
  layout:    <><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></>,
  palette:   <><circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></>,
  mail:      <><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></>,
  users:     <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
  chat:      <><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></>,
  database:  <><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></>,
  send:      <><path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/></>,
  lifebuoy:  <><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><path d="m4.93 4.93 4.24 4.24"/><path d="m14.83 14.83 4.24 4.24"/><path d="m14.83 9.17 4.24-4.24"/><path d="m4.93 19.07 4.24-4.24"/></>,
  cart:      <><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></>,
  gamepad:   <><path d="M6 12h4"/><path d="M8 10v4"/><path d="M15 13h.01"/><path d="M18 11h.01"/><rect x="2" y="6" width="20" height="12" rx="2"/></>,
  clipboard: <><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/></>,
  search:    <><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></>,
  bell:      <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></>,
  logout:    <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></>,
  external:  <><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="m15 3 6 0 0 6"/><path d="M10 14 21 3"/></>,
  chevrons:  <><path d="m7 8-4 4 4 4"/><path d="m17 8 4 4-4 4"/></>,
  panelOpen: <><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/><path d="M13 9 11 12l2 3"/></>,
  panelClose:<><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M15 3v18"/><path d="M11 9l2 3-2 3"/></>,
  clock:     <><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></>,
  zap:       <><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></>,
  shield:    <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></>,
  refresh:   <><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></>,
  plus:      <><path d="M12 5v14"/><path d="M5 12h14"/></>,
  dots:      <><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></>,
  eye:       <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>,
  activity:  <><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></>,
  trending:  <><path d="M23 6l-9.5 9.5-5-5L1 18"/><path d="M17 6h6v6"/></>,
}

/* Map admin nav keys → icon name (falls back to 'grid') */
export const NAV_ICONS = {
  home: 'grid',
  content: 'file',
  posts: 'file',
  editor: 'plus',
  media: 'image',
  pages: 'layout',
  themes: 'palette',
  theme: 'palette',
  framework: 'palette',
  communications: 'mail',
  contacts: 'mail',
  newsletter: 'send',
  staff: 'users',
  forum: 'chat',
  chat: 'chat',
  db: 'database',
  delivery: 'send',
  mail: 'mail',
  cdn: 'database',
  backup: 'database',
  audit: 'activity',
  settings: 'dots',
  siteSettings: 'dots',
  announcements: 'bell',
  helpdesk: 'lifebuoy',
  store: 'cart',
  fivem: 'gamepad',
  changelog: 'clipboard',
}

export function Icon({ name = 'grid', size = 18, strokeWidth = 1.8, filled = false, style, className }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0, ...style }} className={className} aria-hidden="true">
      {PATHS[name] || PATHS.grid}
    </svg>
  )
}

export default Icon
