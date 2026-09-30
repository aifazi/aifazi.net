/**
 * data/hybrid-infra.ts — content model for the /hybrid-infra showcase.
 *
 * Interactive case study: Al Qattara IT modernization, Plan A (hybrid).
 * The renderer (components/HybridInfra*) takes this data as props, so future
 * plans reuse the same component. Copy here is client-safe (no PII, no creds).
 */

/** Built-in category ids (closed set — CATEGORY_META is keyed by these). */
export type BuiltinCategory =
  | 'network'
  | 'compute'
  | 'storage'
  | 'identity'
  | 'security'
  | 'backup'
  | 'endpoint'
  | 'power'

/**
 * Category id: built-ins keep autocomplete, doc-defined custom ids
 * (see DiagramDoc.customCategories) are also accepted.
 */
export type InfraCategory = BuiltinCategory | (string & {})

export type InfraLayer = 'edge' | 'cloud' | 'rack' | 'vm' | 'users' | 'legacy'

export interface InfraComponent {
  id: string
  name: string
  category: InfraCategory
  layer: InfraLayer
  role: string
  desc: string
  workloads: string[]
  /** Component IDs (resolved to names at render time). */
  deps: string[]
  /** Free-form operator note (per-item notes feature). */
  notes?: string
  /** Custom accent color (#rrggbb) overriding the category color. */
  accent?: string
  /** Animated attention ring (paused for reduced-motion users). */
  pulse?: boolean
  /** Rack placement (1-based U) — rack-layer only. */
  rackU?: number
  rackH?: number
  /** Design-space box (1280x920) — edge/cloud/users/legacy layers. */
  x?: number
  y?: number
  w?: number
  h?: number
  shape?: 'chip' | 'cloud' | 'firewall'
}

export interface InfraFlow {
  id: string
  from: string
  to: string
  cat: InfraCategory
  /** Optional custom label drawn at the path midpoint. */
  label?: string
  /** Dashed line style (default solid). */
  dashed?: boolean
  /** Line color override (#rrggbb) instead of the category color. */
  color?: string
}

export interface TimelineStep {
  id: string
  num: string
  label: string
}

export const CATEGORY_META: Record<BuiltinCategory, { label: string; color: string }> = {
  network: { label: 'Network', color: '#35a7ff' },
  compute: { label: 'Compute', color: '#b08cff' },
  storage: { label: 'Storage / Data', color: '#43d19e' },
  identity: { label: 'Identity', color: '#36d7e8' },
  security: { label: 'Security', color: '#ffb454' },
  backup: { label: 'Backup / DR', color: '#ff6b78' },
  endpoint: { label: 'Endpoints', color: '#43d19e' },
  power: { label: 'Power', color: '#f0c75e' },
}

export const COMPONENTS: InfraComponent[] = [
  // ── Internet edge ──────────────────────────────────────────────
  {
    id: 'isp1', name: 'ISP 1', category: 'security', layer: 'edge',
    x: 300, y: 28, w: 145, h: 50, shape: 'chip',
    role: 'Internet',
    desc: 'Primary internet circuit for Microsoft 365, remote access, cloud backup, and outbound traffic.',
    workloads: ['Internet uplink'], deps: ['firewall'],
  },
  {
    id: 'isp2', name: 'ISP 2', category: 'security', layer: 'edge',
    x: 465, y: 28, w: 145, h: 50, shape: 'chip',
    role: 'Internet Resilience',
    desc: 'Secondary internet circuit providing failover and dual-path connectivity for internet edge resilience.',
    workloads: ['Failover uplink'], deps: ['firewall'],
  },
  {
    id: 'firewall', name: 'HA FIREWALL PAIR', category: 'security', layer: 'edge',
    x: 285, y: 98, w: 340, h: 90, shape: 'firewall',
    role: 'Security Edge',
    desc: 'High-availability next-generation firewall pair. Provides internet security, NAT, VPN, segmentation, threat prevention, HA failover, and remote access.',
    workloads: ['NAT', 'VPN', 'IPS/IDS', 'Segmentation', 'HA failover'],
    deps: ['isp1', 'isp2', 'nexus'],
  },
  {
    id: 'remote', name: 'Secure Remote Access', category: 'security', layer: 'edge',
    x: 655, y: 115, w: 185, h: 52, shape: 'chip',
    role: 'Remote Access',
    desc: 'Remote access is controlled at the edge with authentication, policy enforcement, and network segmentation.',
    workloads: ['VPN', 'Policy controls'], deps: ['firewall', 'entra'],
  },

  // ── Microsoft 365 / cloud ──────────────────────────────────────
  {
    id: 'entra', name: 'Entra ID', category: 'identity', layer: 'cloud',
    x: 870, y: 28, w: 220, h: 62, shape: 'cloud',
    role: 'Cloud Identity',
    desc: 'Cloud identity layer. On-prem AD identities synchronize through Entra Connect using password hash synchronization. Provides SSO, MFA, Conditional Access, hybrid Entra Join, and identity lifecycle controls.',
    workloads: ['Entra ID P1', 'MFA', 'Conditional Access', 'SSO', 'Hybrid Join'],
    deps: ['dc1', 'dc2', 'entraconnect', 'm365'],
  },
  {
    id: 'm365', name: 'Microsoft 365', category: 'identity', layer: 'cloud',
    x: 870, y: 102, w: 220, h: 62, shape: 'cloud',
    role: 'Productivity & Security Suite',
    desc: 'Microsoft 365 Business Premium baseline providing collaboration, endpoint management, and layered security services.',
    workloads: ['Business Premium', 'Intune', 'Defender', 'Purview'],
    deps: ['entra', 'endpoints'],
  },
  {
    id: 'defender', name: 'Defender for Business', category: 'security', layer: 'cloud',
    x: 870, y: 176, w: 220, h: 62, shape: 'cloud',
    role: 'Endpoint & Email Security',
    desc: 'Protects managed endpoints with Defender for Business and email with Defender for Office 365. Security events flow into the Microsoft security cloud.',
    workloads: ['Defender for Business', 'Defender for Office 365'],
    deps: ['endpoints', 'entra', 'm365'],
  },
  {
    id: 'purview', name: 'Microsoft Purview', category: 'security', layer: 'cloud',
    x: 870, y: 250, w: 220, h: 62, shape: 'cloud',
    role: 'Information Protection',
    desc: 'Sensitivity labels, DLP, retention, audit, and information protection. On-premises file shares can be covered via Information Protection Scanner — coverage is not identical to native SharePoint/OneDrive controls.',
    workloads: ['Sensitivity Labels', 'DLP', 'Retention', 'Audit', 'IP Scanner'],
    deps: ['sharepoint', 'synology', 'm365'],
  },
  {
    id: 'sharepoint', name: 'SharePoint / OneDrive', category: 'storage', layer: 'cloud',
    x: 870, y: 600, w: 220, h: 62, shape: 'cloud',
    role: 'Active Collaboration Data',
    desc: 'Active team documents, collaboration, remote access, and Office documents. Bulk / large / legacy data remains on Synology / on-prem SMB.',
    workloads: ['Team documents', 'Collaboration', 'Remote access'],
    deps: ['entra', 'm365', 'purview'],
  },
  {
    id: 'cloudbackup', name: 'Immutable Cloud Copy', category: 'backup', layer: 'cloud',
    x: 870, y: 674, w: 220, h: 62, shape: 'cloud',
    role: 'Off-Site Immutable Recovery',
    desc: 'Off-site immutable backup copy using Azure Blob or Wasabi as a second recovery location for site-level failure and ransomware resilience.',
    workloads: ['Azure Blob / Wasabi', 'Immutable copy'],
    deps: ['qnap', 'veeam'],
  },

  // ── Rack units ─────────────────────────────────────────────────
  {
    id: 'patch', name: 'PATCH / NETWORK AREA', category: 'network', layer: 'rack',
    rackU: 1, rackH: 2,
    role: 'Physical Connectivity',
    desc: 'Patch panel and network connectivity area at the top of the rack. Provides structured cabling and uplink termination toward core switching.',
    workloads: ['Patch panel', 'Uplinks', 'Structured cabling'], deps: ['nexus'],
  },
  {
    id: 'nexus', name: 'CISCO NEXUS CORE-01 / CORE-02', category: 'network', layer: 'rack',
    rackU: 3, rackH: 2,
    role: 'Redundant Network Core',
    desc: 'Existing Cisco Nexus core pair retained as the redundant network core using vPC, subject to supportability and capacity validation.',
    workloads: ['vPC core', 'L2/L3 switching', 'Redundant pathing'],
    deps: ['firewall', 'wlc', 'px1', 'synology'],
  },
  {
    id: 'wlc', name: 'WIRELESS LAN CONTROLLER', category: 'network', layer: 'rack',
    rackU: 5, rackH: 1,
    role: 'Wireless Control Plane',
    desc: 'Existing Wireless LAN Controller retained with the Wi-Fi access point estate, subject to support and capacity validation.',
    workloads: ['WLAN control', 'AP management'], deps: ['nexus'],
  },
  {
    id: 'px1', name: 'PROXMOX NODE 01', category: 'compute', layer: 'rack',
    rackU: 7, rackH: 2,
    role: 'Virtualization Node',
    desc: 'Proxmox node 01 of the three-node virtualization cluster. Hosts Windows Server domain controllers, file services, and legacy application workloads with VM HA / cluster resilience.',
    workloads: ['DC-01', 'File Server VM', 'Legacy Application VMs'],
    deps: ['nexus', 'synology', 'veeam'],
  },
  {
    id: 'px2', name: 'PROXMOX NODE 02', category: 'compute', layer: 'rack',
    rackU: 9, rackH: 2,
    role: 'Virtualization Node',
    desc: 'Proxmox node 02 of the three-node virtualization cluster. Participates in cluster HA and workload placement for core Windows Server services.',
    workloads: ['DC-02', 'Cluster HA', 'Workload mobility'],
    deps: ['nexus', 'synology', 'veeam'],
  },
  {
    id: 'px3', name: 'PROXMOX NODE 03', category: 'compute', layer: 'rack',
    rackU: 11, rackH: 2,
    role: 'Virtualization Node',
    desc: 'Proxmox node 03 of the three-node virtualization cluster. Provides capacity and resilience for the virtualization platform.',
    workloads: ['Cluster capacity', 'HA quorum', 'Legacy Apps'],
    deps: ['nexus', 'synology', 'veeam'],
  },
  {
    id: 'synology', name: 'SYNOLOGY STORAGE', category: 'storage', layer: 'rack',
    rackU: 14, rackH: 2,
    role: 'On-Prem File & Datastore',
    desc: 'Primary on-premises storage for SMB file shares and VM datastore. Keeps large-file access on the LAN (CAD, facility images, scanned documents, large files, legacy application data).',
    workloads: ['SMB File Shares', 'VM Datastore', 'Large-file LAN access'],
    deps: ['nexus', 'px1', 'purview'],
  },
  {
    id: 'veeam', name: 'VEEAM BACKUP', category: 'backup', layer: 'rack',
    rackU: 17, rackH: 2,
    role: 'Backup Orchestration',
    desc: 'Veeam protects VMs and on-prem data. Backup credentials and management remain isolated from production. Feeds the local immutable repository and off-site copy. Note: single backup server — a second console or configuration backup is recommended.',
    workloads: ['VM backup', 'File backup', 'Job orchestration'],
    deps: ['px1', 'synology', 'qnap'],
  },
  {
    id: 'qnap', name: 'QNAP IMMUTABLE REPOSITORY', category: 'backup', layer: 'rack',
    rackU: 19, rackH: 2,
    role: 'Local Immutable Recovery',
    desc: 'Dedicated immutable QNAP backup repository for fast local restore and ransomware resilience.',
    workloads: ['Immutable repo', 'Fast local restore'], deps: ['veeam', 'cloudbackup'],
  },
  {
    id: 'ups', name: 'UPS / POWER PROTECTION', category: 'power', layer: 'rack',
    rackU: 22, rackH: 2,
    role: 'Power Continuity',
    desc: 'Suitable UPS infrastructure retained for power protection of core rack equipment and graceful shutdown / ride-through during utility events.',
    workloads: ['Power protection', 'Ride-through', 'Graceful shutdown'], deps: [],
  },

  // ── Virtual machines ───────────────────────────────────────────
  {
    id: 'dc1', name: 'DC-01', category: 'identity', layer: 'vm',
    role: 'Windows Domain Controller',
    desc: 'Windows Server domain controller providing AD DS, DNS, GPO, Kerberos, and LDAP services for on-premises identity.',
    workloads: ['AD DS', 'DNS', 'GPO', 'Kerberos', 'LDAP'],
    deps: ['px1', 'entraconnect'],
  },
  {
    id: 'dc2', name: 'DC-02', category: 'identity', layer: 'vm',
    role: 'Windows Domain Controller',
    desc: 'Second Windows Server domain controller providing redundancy for AD DS, DNS, GPO, Kerberos, and LDAP.',
    workloads: ['AD DS', 'DNS', 'GPO', 'Kerberos', 'LDAP'],
    deps: ['px2', 'entraconnect'],
  },
  {
    id: 'filevm', name: 'FILE SERVER VM', category: 'storage', layer: 'vm',
    role: 'File Services',
    desc: 'Windows file services VM providing SMB access patterns and application-facing file services hosted on the Proxmox cluster.',
    workloads: ['SMB services', 'Application data'], deps: ['px1', 'synology'],
  },
  {
    id: 'legacyvm', name: 'LEGACY APPLICATION VM(s)', category: 'compute', layer: 'vm',
    role: 'Application Compatibility',
    desc: 'Legacy application virtual machines preserved for workload compatibility under the modernization plan.',
    workloads: ['Legacy apps', 'Kerberos / LDAP auth'], deps: ['px3', 'dc1'],
  },
  {
    id: 'entraconnect', name: 'ENTRA CONNECT', category: 'identity', layer: 'vm',
    role: 'Identity Synchronization',
    desc: 'Synchronizes on-premises AD identities to Entra ID (password hash synchronization). Single sync server — deploy a staging-mode standby and monitor sync health.',
    workloads: ['Password hash sync', 'Identity sync'], deps: ['dc1', 'dc2', 'entra'],
  },

  // ── Users / legacy ─────────────────────────────────────────────
  {
    id: 'endpoints', name: 'MANAGED ENDPOINTS', category: 'endpoint', layer: 'users',
    x: 28, y: 655, w: 195, h: 100,
    role: 'User Devices',
    desc: 'Laptops, desktops, and mobile devices managed with Microsoft Intune and protected with Microsoft Defender for Business.',
    workloads: ['Intune management', 'Defender for Business', 'Hybrid Entra Join'],
    deps: ['entra', 'm365', 'defender'],
  },
  {
    id: 'smbaccess', name: 'LOCAL SMB ACCESS', category: 'storage', layer: 'users',
    x: 28, y: 775, w: 195, h: 80,
    role: 'Bulk / Large File Access',
    desc: 'Users access large local files over LAN SMB: CAD, facility images, scanned documents, and legacy application data. Active collaboration data moves to SharePoint / OneDrive.',
    workloads: ['CAD', 'Facility images', 'Scanned documents', 'Large files'],
    deps: ['nexus', 'synology'],
  },
  {
    id: 'legacy', name: 'LEGACY / DECOMMISSIONED', category: 'backup', layer: 'legacy',
    x: 28, y: 520, w: 195, h: 115,
    role: 'Scheduled for Replacement',
    desc: 'Existing legacy infrastructure scheduled for replacement: EOL physical servers, NetApp storage, Quantum DXi, and legacy firewalls. Not active production in Plan A.',
    workloads: ['EOL servers', 'NetApp', 'Quantum DXi', 'Legacy firewalls'], deps: [],
  },
]

export const FLOWS: InfraFlow[] = [
  { id: 'f-isp-fw', from: 'isp1', to: 'firewall', cat: 'security' },
  { id: 'f-isp2-fw', from: 'isp2', to: 'firewall', cat: 'security' },
  { id: 'f-fw-nexus', from: 'firewall', to: 'nexus', cat: 'network' },
  { id: 'f-fw-remote', from: 'firewall', to: 'remote', cat: 'security' },
  { id: 'f-nexus-px', from: 'nexus', to: 'px1', cat: 'network' },
  { id: 'f-px-syn', from: 'px1', to: 'synology', cat: 'storage' },
  { id: 'f-syn-smb', from: 'synology', to: 'smbaccess', cat: 'storage' },
  { id: 'f-dc-entra', from: 'dc1', to: 'entraconnect', cat: 'identity' },
  { id: 'f-connect-entra', from: 'entraconnect', to: 'entra', cat: 'identity' },
  { id: 'f-entra-m365', from: 'entra', to: 'm365', cat: 'identity' },
  { id: 'f-m365-sp', from: 'm365', to: 'sharepoint', cat: 'storage' },
  { id: 'f-ep-def', from: 'endpoints', to: 'defender', cat: 'security' },
  { id: 'f-ep-intune', from: 'endpoints', to: 'm365', cat: 'identity' },
  { id: 'f-px-veeam', from: 'px1', to: 'veeam', cat: 'backup' },
  { id: 'f-veeam-qnap', from: 'veeam', to: 'qnap', cat: 'backup' },
  { id: 'f-qnap-cloud', from: 'qnap', to: 'cloudbackup', cat: 'backup' },
  { id: 'f-syn-purview', from: 'synology', to: 'purview', cat: 'security' },
  { id: 'f-wlc-nexus', from: 'wlc', to: 'nexus', cat: 'network' },
]

export const TIMELINE: TimelineStep[] = [
  { id: 't-internet', num: '01', label: 'Internet' },
  { id: 't-edge', num: '02', label: 'Security Edge' },
  { id: 't-core', num: '03', label: 'Core Network' },
  { id: 't-compute', num: '04', label: 'Compute' },
  { id: 't-storage', num: '05', label: 'Storage' },
  { id: 't-identity', num: '06', label: 'Identity' },
  { id: 't-secops', num: '07', label: 'Security Services' },
  { id: 't-backup', num: '08', label: 'Backup' },
  { id: 't-offsite', num: '09', label: 'Off-Site Recovery' },
]

/** Timeline step → categories highlighted while playing. */
export const TIMELINE_CATS: InfraCategory[][] = [
  ['security'],
  ['security'],
  ['network'],
  ['network', 'compute'],
  ['storage'],
  ['identity'],
  ['security'],
  ['backup'],
  ['backup'],
]

export interface DesignNoteGroup {
  id: string
  title: string
  tone: 'retain' | 'replace' | 'new'
  items: string[]
}

export const DESIGN_NOTES: DesignNoteGroup[] = [
  {
    id: 'retain', title: 'Retain', tone: 'retain',
    items: [
      'Cisco Nexus core pair (CORE-01 / CORE-02)',
      'Wireless LAN Controller',
      'Existing Wi-Fi access points',
      'Suitable UPS infrastructure',
    ],
  },
  {
    id: 'replace', title: 'Replace', tone: 'replace',
    items: [
      'EOL physical servers',
      'NetApp storage',
      'Quantum DXi',
      'Legacy firewalls',
    ],
  },
  {
    id: 'new', title: 'New', tone: 'new',
    items: [
      'HA firewall pair (FortiGate preferred)',
      '3-node Proxmox cluster',
      'Synology storage',
      'Veeam + QNAP immutable repository',
      'Off-site immutable copy',
      'Microsoft 365 security stack',
    ],
  },
]

export interface MgmtCard {
  title: string
  desc: string
}

export const MGMT_CARDS: MgmtCard[] = [
  { title: 'Security', desc: 'HA edge, MFA/CA, Defender, Purview DLP' },
  { title: 'Resilience', desc: 'Nexus vPC, dual ISP, UPS, cluster HA' },
  { title: 'Identity', desc: 'On-prem AD + Entra ID hybrid' },
  { title: 'Backup', desc: 'Veeam → QNAP immutable → off-site' },
  { title: 'Business Continuity', desc: 'Local restore + site-level recovery' },
  { title: 'Reduced Legacy', desc: 'Modern platform replaces EOL estate' },
]

export const EDGE_COPY: Record<'fortigate' | 'unifi', { label: string; note: string }> = {
  fortigate: {
    label: 'FORTIGATE HA · PREFERRED SECURITY EDGE',
    note: 'FortiGate HA is the preferred security edge: stateful failover, IPS/IDS, VPN, and segmentation.',
  },
  unifi: {
    label: 'UNIFI EFG · BUDGET SINGLE-BOX OPTION',
    note: 'Budget alternative: UniFi EFG as a single box with no stateful HA failover — acceptable only where edge downtime is tolerable. Not equivalent to FortiGate HA.',
  },
}

/** Resolve a dep id to its display name (falls back to the raw id). */
export function depName(id: string): string {
  return COMPONENTS.find((c) => c.id === id)?.name ?? id
}

/** Transitive upstream (dependencies) + downstream (dependents) of a node. */
export function dependencyChain(id: string): { up: Set<string>; down: Set<string> } {
  return dependencyChainIn(COMPONENTS, id)
}

/** Same as dependencyChain but over an explicit component list (editor docs). */
export function dependencyChainIn(
  list: InfraComponent[],
  id: string,
): { up: Set<string>; down: Set<string> } {
  const byId = new Map(list.map((c) => [c.id, c]))
  const up = new Set<string>()
  const down = new Set<string>()
  const walkUp = (cid: string) => {
    for (const d of byId.get(cid)?.deps ?? []) {
      if (!up.has(d)) {
        up.add(d)
        walkUp(d)
      }
    }
  }
  walkUp(id)
  for (const c of list) {
    if (c.deps.includes(id)) down.add(c.id)
  }
  // One more downstream level so chains read both ways.
  for (const d of [...down]) {
    for (const c of list) {
      if (c.deps.includes(d)) down.add(c.id)
    }
  }
  up.delete(id)
  down.delete(id)
  return { up, down }
}

export function depNameIn(list: InfraComponent[], id: string): string {
  return list.find((c) => c.id === id)?.name ?? id
}

// ── Editable diagram documents ───────────────────────────────────

/** A doc-defined category (label + default color), keyed by a slug id. */
export interface CustomCategory {
  label: string
  color: string
}

/** A saved diagram: nodes + links (+ optional timeline override). */
export interface DiagramDoc {
  id: string
  slug: string
  title: string
  /** ISO timestamp. */
  updatedAt: string
  published: boolean
  nodes: InfraComponent[]
  flows: InfraFlow[]
  /** Per-category color overrides (#rrggbb) keyed by category id. */
  categoryColors?: Record<string, string>
  /** User-defined categories (label + color) beyond the built-ins. */
  customCategories?: Record<string, CustomCategory>
}

/** Display label for any category: custom → built-in → uppercase id. */
export function catLabel(
  category: string,
  custom?: Record<string, CustomCategory> | null,
): string {
  const c = custom?.[category]?.label
  if (c) return c
  const meta = (CATEGORY_META as Record<string, { label: string; color: string } | undefined>)[category]
  return meta?.label ?? category.toUpperCase()
}

/**
 * Effective color map for canvas/legend: custom category default colors
 * overlaid by palette overrides. Null when nothing is overridden.
 */
export function mergedCatColors(
  doc: Pick<DiagramDoc, 'categoryColors' | 'customCategories'> | null | undefined,
): Record<string, string> | null {
  const custom = doc?.customCategories
  const pal = doc?.categoryColors
  if (!custom && !pal) return null
  return {
    ...(custom ? Object.fromEntries(Object.entries(custom).map(([k, m]) => [k, m.color])) : {}),
    ...(pal ?? {}),
  }
}

/** The built-in Plan A document (read-only seed). */
export function planADoc(): DiagramDoc {
  return {
    id: 'plan-a',
    slug: 'plan-a',
    title: 'Plan A — Hybrid Infrastructure',
    updatedAt: new Date(0).toISOString(),
    published: true,
    nodes: COMPONENTS.map((c) => ({ ...c, deps: [...c.deps], workloads: [...c.workloads] })),
    flows: FLOWS.map((f) => ({ ...f })),
  }
}

/** Validate an imported doc just enough to render safely. */
export function sanitizeDoc(raw: unknown): DiagramDoc | null {
  if (!raw || typeof raw !== 'object') return null
  const d = raw as Record<string, unknown>
  if (!Array.isArray(d.nodes) || !Array.isArray(d.flows)) return null
  const cats: BuiltinCategory[] = ['network', 'compute', 'storage', 'identity', 'security', 'backup', 'endpoint', 'power']
  const layers = ['edge', 'cloud', 'rack', 'vm', 'users', 'legacy']
  // Custom categories: { slug: { label, color } } with caps; can't shadow built-ins.
  let customCategories: Record<string, CustomCategory> | undefined
  if (d.customCategories && typeof d.customCategories === 'object' && !Array.isArray(d.customCategories)) {
    customCategories = {}
    let cn = 0
    for (const [k, v] of Object.entries(d.customCategories as Record<string, unknown>)) {
      if (cn >= 16) break
      if (!/^[a-z0-9-]{1,32}$/.test(k) || cats.includes(k as BuiltinCategory)) continue
      if (!v || typeof v !== 'object') continue
      const o = v as Record<string, unknown>
      const color = typeof o.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(o.color) ? o.color : null
      if (!color) continue
      customCategories[k] = {
        label: typeof o.label === 'string' && o.label.trim() ? o.label.trim().slice(0, 24) : k,
        color,
      }
      cn += 1
    }
    if (Object.keys(customCategories).length === 0) customCategories = undefined
  }
  const customKeys = customCategories ? new Set(Object.keys(customCategories)) : new Set<string>()
  const knownCat = (c: unknown): c is InfraCategory =>
    (typeof c === 'string' && (cats.includes(c as BuiltinCategory) || customKeys.has(c))) as boolean
  const nodes: InfraComponent[] = []
  for (const n of d.nodes as unknown[]) {
    if (!n || typeof n !== 'object') continue
    const c = n as Record<string, unknown>
    if (typeof c.id !== 'string' || !c.id || typeof c.name !== 'string') continue
    nodes.push({
      id: c.id.slice(0, 64),
      name: String(c.name).slice(0, 80),
      category: knownCat(c.category) ? c.category : 'network',
      layer: (layers as string[]).includes(c.layer as string) ? (c.layer as InfraLayer) : 'cloud',
      role: String(c.role ?? '').slice(0, 80),
      desc: String(c.desc ?? '').slice(0, 2000),
      workloads: Array.isArray(c.workloads) ? c.workloads.filter((w): w is string => typeof w === 'string').slice(0, 12).map((w) => w.slice(0, 60)) : [],
      deps: Array.isArray(c.deps) ? c.deps.filter((x): x is string => typeof x === 'string').slice(0, 24) : [],
      notes: typeof c.notes === 'string' ? c.notes.slice(0, 2000) : undefined,
      ...(typeof c.accent === 'string' && /^#[0-9a-fA-F]{6}$/.test(c.accent) ? { accent: c.accent } : {}),
      ...(c.pulse === true ? { pulse: true as const } : {}),
      rackU: typeof c.rackU === 'number' ? Math.max(1, Math.min(42, Math.floor(c.rackU))) : undefined,
      rackH: typeof c.rackH === 'number' ? Math.max(1, Math.min(8, Math.floor(c.rackH))) : undefined,
      x: typeof c.x === 'number' ? c.x : undefined,
      y: typeof c.y === 'number' ? c.y : undefined,
      w: typeof c.w === 'number' ? Math.max(40, Math.min(1280, c.w)) : undefined,
      h: typeof c.h === 'number' ? Math.max(20, Math.min(920, c.h)) : undefined,
      shape: c.shape === 'chip' || c.shape === 'cloud' || c.shape === 'firewall' ? c.shape : undefined,
    })
  }
  if (nodes.length === 0) return null
  const ids = new Set(nodes.map((n) => n.id))
  const flows: InfraFlow[] = []
  for (const f of d.flows as unknown[]) {
    if (!f || typeof f !== 'object') continue
    const r = f as Record<string, unknown>
    if (typeof r.from !== 'string' || typeof r.to !== 'string') continue
    if (!ids.has(r.from) || !ids.has(r.to) || r.from === r.to) continue
    flows.push({
      id: typeof r.id === 'string' && r.id ? r.id.slice(0, 64) : `f-${r.from}-${r.to}`,
      from: r.from,
      to: r.to,
      cat: knownCat(r.cat) ? r.cat : 'network',
      ...(typeof r.label === 'string' && r.label.trim()
        ? { label: r.label.trim().slice(0, 40) }
        : {}),
      ...(r.dashed === true ? { dashed: true as const } : {}),
      ...(typeof r.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(r.color)
        ? { color: r.color }
        : {}),
    })
    if (flows.length >= 200) break
  }
  const slugBase = typeof d.slug === 'string' && d.slug ? d.slug : 'diagram'
  // Category palette overrides: { id: '#rrggbb' } with tight key/value caps.
  let categoryColors: Record<string, string> | undefined
  if (d.categoryColors && typeof d.categoryColors === 'object' && !Array.isArray(d.categoryColors)) {
    categoryColors = {}
    let n = 0
    for (const [k, v] of Object.entries(d.categoryColors as Record<string, unknown>)) {
      if (n >= 32) break
      if (!/^[a-z0-9-]{1,32}$/.test(k)) continue
      if (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)) {
        categoryColors[k] = v
        n += 1
      }
    }
    if (Object.keys(categoryColors).length === 0) categoryColors = undefined
  }
  return {
    id: typeof d.id === 'string' && d.id ? d.id.slice(0, 64) : `doc-${Date.now()}`,
    slug: slugBase.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'diagram',
    title: typeof d.title === 'string' && d.title ? d.title.slice(0, 120) : 'Untitled diagram',
    updatedAt: typeof d.updatedAt === 'string' ? d.updatedAt : new Date().toISOString(),
    published: d.published !== false,
    nodes,
    flows,
    ...(categoryColors ? { categoryColors } : {}),
    ...(customCategories ? { customCategories } : {}),
  }
}
