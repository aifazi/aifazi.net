/**
 * data/infra-templates.ts — additional built-in architecture templates for
 * /hybrid-infra (round-2 plan B3).
 *
 * Same contract as planADoc()/cloudInfraDoc(): read-only seeds registered in
 * BUILTIN_DOCS (editor loader) + BUILTIN_STUDIES (library cards); editing one
 * saves as a copy. Slugs are reserved server-side (RESERVED_SLUGS).
 * Copy is client-safe (no PII, no creds).
 */
import type { DiagramDoc, InfraComponent, InfraFlow } from './hybrid-infra'

const N = (
  id: string,
  name: string,
  category: InfraComponent['category'],
  layer: InfraComponent['layer'],
  x: number,
  y: number,
  w: number,
  h: number,
  role: string,
  desc: string,
  workloads: string[],
  deps: string[],
  shape?: InfraComponent['shape'],
): InfraComponent => ({ id, name, category, layer, x, y, w, h, role, desc, workloads, deps, shape })

const F = (id: string, from: string, to: string, cat: InfraFlow['cat']): InfraFlow => ({ id, from, to, cat })

function doc(slug: string, title: string, nodes: InfraComponent[], flows: InfraFlow[]): DiagramDoc {
  return {
    id: slug,
    slug,
    title,
    updatedAt: new Date(0).toISOString(),
    published: true,
    nodes: nodes.map((n) => ({ ...n, deps: [...n.deps], workloads: [...n.workloads] })),
    flows: flows.map((f) => ({ ...f })),
  }
}

// ── Multi-site hybrid ───────────────────────────────────────────────────────

const MULTI_SITE_NODES: InfraComponent[] = [
  N('ms-sdwan', 'SD-WAN Hub', 'security', 'edge', 40, 40, 170, 60, 'Site interconnect',
    'Single policy plane bridging HQ and every branch over broadband with LTE failover.',
    ['IPsec', 'QoS'], ['ms-hq-fw'], 'firewall'),
  N('ms-branch-a', 'Branch — Site A', 'network', 'edge', 40, 140, 170, 60, 'Branch office',
    'Local switching and Wi-Fi with default-route break-out through the SD-WAN hub.',
    ['Access', 'Wi-Fi 6'], ['ms-sdwan'], 'chip'),
  N('ms-branch-b', 'Branch — Site B', 'network', 'edge', 40, 230, 170, 60, 'Branch office',
    'Second branch on the same hub policy with local internet breakout.',
    ['Access', 'VoIP'], ['ms-sdwan'], 'chip'),
  N('ms-branch-c', 'Remote Kiosk', 'network', 'edge', 40, 320, 170, 60, 'Unattended site',
    'Kiosk endpoints with captive policy — no local data, everything stays in the hub.',
    ['Kiosk mode'], ['ms-sdwan'], 'chip'),
  N('ms-hq-fw', 'HQ Security Edge', 'security', 'edge', 270, 40, 180, 60, 'Perimeter control',
    'Hub firewall in front of the datacenter: TLS inspection, IDPS, and per-site segmentation.',
    ['IDPS', 'TLS inspect'], ['ms-core'], 'firewall'),
  N('ms-core', 'HQ Core Switch', 'network', 'edge', 270, 140, 180, 60, 'Network core',
    'Redundant L3 core with VXLAN segmentation between user, compute, and storage VLANs.',
    ['L3', 'VXLAN'], ['ms-compute', 'ms-storage'], 'chip'),
  N('ms-storage', 'HQ Storage', 'storage', 'edge', 270, 240, 180, 60, 'Shared storage',
    'All-flash array backing VM disks with snapshots and nightly immutable replication.',
    ['iSCSI', 'Snapshots'], ['ms-backup'], 'chip'),
  N('ms-compute', 'Proxmox Cluster', 'compute', 'cloud', 500, 40, 190, 64, 'Virtualization core',
    'HA cluster running the branch services, file services, and line-of-business VMs.',
    ['HA', 'Live migrate'], ['ms-lob'], 'cloud'),
  N('ms-lob', 'Line-of-Business VMs', 'compute', 'cloud', 500, 140, 190, 60, 'Applications',
    'ERP, intranet, and print services — pinned to the HQ site, backed up per-VM.',
    ['ERP', 'Intranet'], ['ms-backup'], 'chip'),
  N('ms-backup', 'Backup Appliance', 'backup', 'cloud', 500, 240, 190, 64, 'Data protection',
    'Immutable backup target with per-VM policies and a monthly restore test.',
    ['Immutable', 'Policies'], ['ms-offsite'], 'cloud'),
  N('ms-offsite', 'Off-site Copy', 'backup', 'legacy', 960, 320, 190, 64, 'Air-gapped copy',
    'Time-locked copy outside the HQ blast radius — ransomware cannot alter or delete it.',
    ['Time lock'], [], 'chip'),
  N('ms-entra', 'Entra ID + Intune', 'identity', 'cloud', 730, 40, 190, 60, 'Cloud identity',
    'Single identity plane for staff at every site; Intune pushes config to all endpoints.',
    ['SSO', 'Compliance'], ['ms-endpoints'], 'cloud'),
  N('ms-m365', 'Microsoft 365', 'identity', 'cloud', 730, 140, 190, 60, 'Productivity',
    'Mail, Teams, and SharePoint with DLP labels — no data lands on branch file shares.',
    ['Exchange', 'Teams'], ['ms-entra'], 'cloud'),
  N('ms-soc', 'Defender + Sentinel', 'security', 'cloud', 730, 240, 190, 64, 'Detection & response',
    'Cloud SIEM correlating branch, HQ, and identity signals into one incident timeline.',
    ['EDR', 'Playbooks'], [], 'cloud'),
  N('ms-endpoints', 'Staff Endpoints', 'endpoint', 'users', 960, 60, 190, 80, 'Managed devices',
    'Laptops and phones at HQ and branches — compliant devices only pass conditional access.',
    ['Autopilot', 'Defender'], ['ms-m365'], 'chip'),
  N('ms-guests', 'Guest Wi-Fi', 'endpoint', 'users', 960, 170, 190, 64, 'Isolated access',
    'Captive portal for visitors, firewalled from every internal VLAN by default.',
    ['Captive portal'], ['ms-sdwan'], 'chip'),
]

const MULTI_SITE_FLOWS: InfraFlow[] = [
  F('msf1', 'ms-branch-a', 'ms-sdwan', 'network'),
  F('msf2', 'ms-branch-b', 'ms-sdwan', 'network'),
  F('msf3', 'ms-branch-c', 'ms-sdwan', 'network'),
  F('msf4', 'ms-sdwan', 'ms-hq-fw', 'security'),
  F('msf5', 'ms-hq-fw', 'ms-core', 'network'),
  F('msf6', 'ms-core', 'ms-compute', 'compute'),
  F('msf7', 'ms-core', 'ms-storage', 'storage'),
  F('msf8', 'ms-storage', 'ms-compute', 'storage'),
  F('msf9', 'ms-compute', 'ms-lob', 'compute'),
  F('msf10', 'ms-lob', 'ms-backup', 'backup'),
  F('msf11', 'ms-backup', 'ms-offsite', 'backup'),
  F('msf12', 'ms-entra', 'ms-endpoints', 'identity'),
  F('msf13', 'ms-entra', 'ms-m365', 'identity'),
  F('msf14', 'ms-m365', 'ms-soc', 'security'),
  F('msf15', 'ms-hq-fw', 'ms-guests', 'network'),
]

export function multiSiteDoc(): DiagramDoc {
  return doc('multi-site', 'Multi-Site Hybrid Network', MULTI_SITE_NODES, MULTI_SITE_FLOWS)
}

// ── Disaster recovery ───────────────────────────────────────────────────────

const DR_NODES: InfraComponent[] = [
  N('dr-fw', 'Production Firewall', 'security', 'edge', 40, 40, 170, 60, 'Perimeter',
    'Active/standby pair guarding the production site; health state feeds the DR monitor.',
    ['HA pair'], ['dr-core'], 'firewall'),
  N('dr-core', 'Prod Core Switch', 'network', 'edge', 40, 140, 170, 60, 'Network core',
    'Production L3 core; mirrored VLANs keep DR re-cabling a config push, not a project.',
    ['L3', 'VLAN mirror'], ['dr-prod-cluster', 'dr-prod-db'], 'chip'),
  N('dr-prod-cluster', 'Production Cluster', 'compute', 'cloud', 270, 40, 190, 64, 'Primary compute',
    'Live production workloads with anti-affinity and N+1 headroom for node loss.',
    ['HA', 'N+1'], ['dr-repl'], 'cloud'),
  N('dr-prod-db', 'Primary Database', 'storage', 'cloud', 270, 150, 190, 60, 'System of record',
    'Transactional database with WAL archiving and point-in-time recovery enabled.',
    ['OLTP', 'PITR'], ['dr-repl'], 'chip'),
  N('dr-repl', 'Async Replication', 'storage', 'cloud', 500, 95, 190, 60, 'Data movement',
    'Encrypted async replication to the DR site — seconds of RPO, no shared storage.',
    ['RPO seconds', 'TLS'], ['dr-dr-cluster', 'dr-standby-db'], 'chip'),
  N('dr-monitor', 'Replication Monitor', 'network', 'cloud', 500, 210, 190, 60, 'DR observability',
    'Lag and consistency checks page the on-call before a failover is ever needed.',
    ['Lag alerts', 'Drills'], [], 'chip'),
  N('dr-dr-cluster', 'DR Cluster (Warm)', 'compute', 'cloud', 730, 40, 190, 64, 'Standby compute',
    'Powered-on warm standby sized like production; failover is a start, not a rebuild.',
    ['Warm start'], ['dr-runbook'], 'cloud'),
  N('dr-standby-db', 'Standby Database', 'storage', 'cloud', 730, 150, 190, 60, 'Standby data',
    'Read-only replica promoted to primary on failover with one controlled cut-over.',
    ['Promote', 'Read-only'], ['dr-runbook'], 'chip'),
  N('dr-immutable', 'Immutable Backup', 'backup', 'cloud', 500, 320, 190, 64, 'Last line',
    'WORM-locked backups independent of both sites — recovery without either production host.',
    ['WORM', '3-2-1'], ['dr-vault'], 'cloud'),
  N('dr-vault', 'Off-site Vault', 'backup', 'legacy', 960, 320, 190, 64, 'Geographic copy',
    'Second-region vault with time locks; early deletion is impossible while locked.',
    ['Time lock', 'Second region'], [], 'chip'),
  N('dr-runbook', 'Failover Runbook', 'endpoint', 'users', 960, 95, 190, 80, 'Procedure',
    'Documented, rehearsed steps: DNS cut-over, promotion, validation, fail-back.',
    ['DNS cut-over', 'Quarterly drill'], [], 'chip'),
  N('dr-clients', 'Clients / Users', 'endpoint', 'users', 960, 210, 190, 64, 'Service consumers',
    'Apps keep working through the same names — DNS TTLs pre-lowered before any drill.',
    ['Same DNS'], ['dr-dr-cluster'], 'chip'),
]

const DR_FLOWS: InfraFlow[] = [
  F('drf1', 'dr-fw', 'dr-core', 'security'),
  F('drf2', 'dr-core', 'dr-prod-cluster', 'compute'),
  F('drf3', 'dr-core', 'dr-prod-db', 'storage'),
  F('drf4', 'dr-prod-cluster', 'dr-repl', 'storage'),
  F('drf5', 'dr-prod-db', 'dr-repl', 'storage'),
  F('drf6', 'dr-repl', 'dr-dr-cluster', 'compute'),
  F('drf7', 'dr-repl', 'dr-standby-db', 'storage'),
  F('drf8', 'dr-repl', 'dr-monitor', 'network'),
  F('drf9', 'dr-prod-cluster', 'dr-immutable', 'backup'),
  F('drf10', 'dr-immutable', 'dr-vault', 'backup'),
  F('drf11', 'dr-dr-cluster', 'dr-runbook', 'security'),
  F('drf12', 'dr-standby-db', 'dr-runbook', 'storage'),
  F('drf13', 'dr-runbook', 'dr-clients', 'network'),
]

export function drSiteDoc(): DiagramDoc {
  return doc('dr-site', 'Disaster Recovery Site', DR_NODES, DR_FLOWS)
}

// ── Hybrid identity join ────────────────────────────────────────────────────

const JOIN_NODES: InfraComponent[] = [
  N('hj-adds', 'Active Directory DS', 'identity', 'edge', 40, 40, 180, 60, 'On-prem identity',
    'Domain controllers holding group policy, Kerberos, and legacy app bindings.',
    ['Kerberos', 'Group Policy'], ['hj-sync', 'hj-shares'], 'cloud'),
  N('hj-sync', 'AD Connect Sync', 'identity', 'edge', 40, 150, 180, 60, 'Hybrid bridge',
    'One-way hash sync of accounts and groups into the cloud tenant — passwords match both sides.',
    ['Hash sync', 'OU filter'], ['hj-entra'], 'chip'),
  N('hj-legacy-mdm', 'Legacy MDM', 'security', 'legacy', 40, 270, 180, 60, 'Decommissioning',
    'Old device management being retired — every policy re-created in Intune first.',
    ['Final export'], ['hj-intune'], 'chip'),
  N('hj-entra', 'Entra ID', 'identity', 'cloud', 270, 40, 180, 60, 'Cloud identity',
    'Cloud identity plane for every account synced from AD — MFA and sign-in risk live here.',
    ['MFA', 'Risk policy'], ['hj-ca', 'hj-intune'], 'cloud'),
  N('hj-ca', 'Conditional Access', 'security', 'cloud', 270, 150, 180, 60, 'Access gate',
    'Device location, compliance, and risk decide every sign-in — legacy auth is blocked outright.',
    ['Compliant device', 'Block legacy'], ['hj-join'], 'cloud'),
  N('hj-intune', 'Intune / Autopilot', 'identity', 'cloud', 270, 270, 180, 60, 'Device management',
    'Autopilot ships devices straight from the vendor; Intune owns config from first boot.',
    ['Autopilot', 'Compliance'], ['hj-devices'], 'cloud'),
  N('hj-join', 'Hybrid Joined Devices', 'endpoint', 'users', 500, 40, 190, 64, 'Joined endpoints',
    'Devices exist in both directories — single sign-in works on-prem and in the cloud.',
    ['Device cert', 'SSO'], ['hj-apps', 'hj-defender'], 'chip'),
  N('hj-defender', 'Defender for Endpoint', 'security', 'cloud', 500, 150, 190, 60, 'Endpoint security',
    'EDR sensor on every joined device, alerting into the same identity timeline.',
    ['EDR', 'Sensor'], ['hj-soc'], 'chip'),
  N('hj-soc', 'Security Operations', 'security', 'cloud', 500, 270, 190, 60, 'Triage',
    'Identity + device signals correlate here; risky sign-ins trigger session revocation.',
    ['Triage', 'Revocation'], [], 'cloud'),
  N('hj-shares', 'On-prem File Shares', 'storage', 'edge', 730, 270, 190, 60, 'Legacy data',
    'Shares still served from AD-joined storage while workloads migrate to the cloud.',
    ['SMB', 'ACLs'], ['hj-adds'], 'chip'),
  N('hj-devices', 'Staff Endpoints', 'endpoint', 'users', 960, 150, 190, 80, 'User devices',
    'Laptops and phones joined to both directories — one identity, one password, everywhere.',
    ['Windows', 'iOS'], ['hj-join'], 'chip'),
  N('hj-apps', 'Microsoft 365 Apps', 'identity', 'cloud', 730, 40, 190, 60, 'Cloud apps',
    'Exchange, Teams, and SharePoint authenticated by the same hybrid identity.',
    ['Exchange', 'Teams'], ['hj-entra'], 'cloud'),
]

const JOIN_FLOWS: InfraFlow[] = [
  F('hjf1', 'hj-adds', 'hj-sync', 'identity'),
  F('hjf2', 'hj-sync', 'hj-entra', 'identity'),
  F('hjf3', 'hj-entra', 'hj-ca', 'security'),
  F('hjf4', 'hj-entra', 'hj-intune', 'identity'),
  F('hjf5', 'hj-ca', 'hj-join', 'security'),
  F('hjf6', 'hj-intune', 'hj-devices', 'identity'),
  F('hjf7', 'hj-join', 'hj-apps', 'identity'),
  F('hjf8', 'hj-join', 'hj-defender', 'security'),
  F('hjf9', 'hj-defender', 'hj-soc', 'security'),
  F('hjf10', 'hj-adds', 'hj-shares', 'storage'),
  F('hjf11', 'hj-legacy-mdm', 'hj-intune', 'security'),
  F('hjf12', 'hj-apps', 'hj-entra', 'identity'),
]

export function hybridJoinDoc(): DiagramDoc {
  return doc('hybrid-join', 'Hybrid Identity Join', JOIN_NODES, JOIN_FLOWS)
}

/** All extra built-in seeds, keyed by slug (merged into BUILTIN_DOCS). */
export const TEMPLATE_SEEDS: Record<string, () => DiagramDoc> = {
  'multi-site': multiSiteDoc,
  'dr-site': drSiteDoc,
  'hybrid-join': hybridJoinDoc,
}
