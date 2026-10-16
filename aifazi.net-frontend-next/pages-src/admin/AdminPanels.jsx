'use client'
// Barrel for the admin panels. The panels themselves live in ./panels/*.jsx
// (split out of this file, no behaviour change). Dashboard.jsx and ThemeHub.jsx
// keep importing from './AdminPanels'.

export { PageContentPanel } from './panels/PageContentPanel'
export { ActiveSessionsPanel } from './panels/ActiveSessionsPanel'
export { AdminProfilePanel } from './panels/AdminProfilePanel'
export { AnnouncementsPanel } from './panels/AnnouncementsPanel'
export { NewsletterPanel } from './panels/NewsletterPanel'
export { StatsPanel } from './panels/StatsPanel'
export { AuditPanel } from './panels/AuditPanel'
export { BackupPanel } from './panels/BackupPanel'
