/**
 * data/cloud-infra.ts — content model for the second /hybrid-infra seed.
 *
 * Plan C (cloud-native): the same organization fully on cloud — edge WAF,
 * Azure network hub, Entra ID identity, M365 + AVD productivity, XDR/SIEM
 * security, and vault-based immutable backup. No on-premises footprint.
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

export const CLOUD_COMPONENTS: InfraComponent[] = [
  N('cdn-edge', 'Cloud Edge WAF', 'security', 'edge', 40, 30, 170, 60, 'Edge protection',
    'Cloud WAF and CDN in front of every public endpoint. Absorbs DDoS and filters OWASP threats before traffic reaches the hub.',
    ['WAF', 'CDN', 'DDoS'], ['azfw'], 'chip'),
  N('azfw', 'Azure Firewall', 'security', 'edge', 40, 110, 170, 60, 'Security Edge',
    'Hub firewall for all virtual networks. TLS inspection, IDPS, and forced tunneling for regulated workloads.',
    ['Egress filter', 'IDPS', 'DNS proxy'], ['vpn-gw'], 'firewall'),
  N('vpn-gw', 'VPN Gateway', 'security', 'edge', 40, 190, 170, 60, 'Hybrid link',
    'Site-to-site and point-to-site VPN for branch offices and break-glass admin access.',
    ['S2S tunnels', 'P2S VPN'], ['azfw'], 'chip'),
  N('entra', 'Entra ID', 'identity', 'cloud', 270, 30, 180, 60, 'Cloud Identity',
    'Single identity plane for users, devices, and workloads. Conditional Access gates every sign-in.',
    ['SSO', 'MFA', 'Conditional Access'], ['intune'], 'cloud'),
  N('intune', 'Intune', 'identity', 'cloud', 270, 110, 180, 60, 'Device management',
    'Compliance policies and autopilot provisioning for all managed endpoints.',
    ['Compliance', 'Autopilot'], ['entra'], 'chip'),
  N('defender', 'Defender XDR', 'security', 'cloud', 270, 190, 180, 60, 'Endpoint & Email Security',
    'Extended detection across endpoints, mailboxes, and identities with automated response.',
    ['EDR', 'Email ATP'], ['sentinel'], 'chip'),
  N('sentinel', 'Microsoft Sentinel', 'security', 'cloud', 270, 270, 180, 60, 'SIEM / SOAR',
    'Cloud SIEM collecting every signal. Playbooks isolate hosts and revoke sessions on incident.',
    ['Log analytics', 'Playbooks'], [], 'chip'),
  N('avd', 'Azure Virtual Desktop', 'compute', 'cloud', 480, 30, 190, 60, 'Virtual desktops',
    'Pooled session hosts for task workers and contractors. No data ever lands on the endpoint.',
    ['Session hosts', 'FSLogix'], ['entra', 'files'], 'cloud'),
  N('app-svc', 'App Services', 'compute', 'cloud', 480, 110, 190, 60, 'PaaS compute',
    'Line-of-business apps on managed app services with private endpoints and Key Vault references.',
    ['Web apps', 'APIs'], ['sql', 'keyvault'], 'chip'),
  N('sql', 'Azure SQL Managed', 'storage', 'cloud', 480, 190, 190, 60, 'Managed database',
    'Business databases with point-in-time restore and long-term retention to the vault.',
    ['OLTP', 'PITR'], ['backup-vault'], 'chip'),
  N('files', 'Azure Files', 'storage', 'cloud', 480, 270, 190, 60, 'Managed file shares',
    'SMB shares with identity-based access replacing the last on-premises file server.',
    ['SMB shares', 'Sync'], ['backup-vault'], 'chip'),
  N('monitor', 'Azure Monitor', 'network', 'cloud', 700, 30, 180, 60, 'Observability',
    'Metrics, logs, and availability tests with alerting into Sentinel and the on-call rotation.',
    ['Metrics', 'Alerts'], [], 'chip'),
  N('keyvault', 'Key Vault', 'security', 'cloud', 700, 110, 180, 60, 'Secrets management',
    'Keys, certificates, and connection strings with managed identities — no secrets in code.',
    ['Keys', 'Certificates'], [], 'chip'),
  N('backup-vault', 'Recovery Vault', 'backup', 'cloud', 700, 190, 190, 64, 'Backup control plane',
    'Policy-driven backup for VMs, SQL, and file shares with soft-delete and immutability locks.',
    ['Policies', 'Soft-delete'], ['blob-immutable'], 'cloud'),
  N('blob-immutable', 'Immutable Blob', 'backup', 'cloud', 700, 274, 190, 64, 'Off-site immutable copy',
    'Time-locked blob copy in a paired region. Ransomware cannot alter or early-delete it.',
    ['Time locks', 'Cross-region'], [], 'chip'),
  N('hq-users', 'HQ Endpoints', 'endpoint', 'users', 950, 60, 190, 80, 'User Devices',
    'Intune-managed laptops and phones. Conditional Access requires compliant, hybrid-joined devices.',
    ['Intune', 'Defender'], ['intune', 'avd'], 'chip'),
  N('remote-office', 'Branch Office', 'endpoint', 'users', 950, 170, 190, 80, 'Branch site',
    'Small branch on S2S VPN with local internet breakout behind the hub firewall policy.',
    ['S2S VPN', 'Local breakout'], ['vpn-gw'], 'chip'),
  N('old-nas', 'Legacy NAS', 'backup', 'legacy', 950, 280, 190, 64, 'Decommissioning',
    'Last on-premises box. Syncs to Azure Files, then powers off. Kept read-only until sign-off.',
    ['Final sync'], ['blob-immutable'], 'chip'),
]

const F = (id: string, from: string, to: string, cat: InfraFlow['cat']): InfraFlow => ({ id, from, to, cat })

export const CLOUD_FLOWS: InfraFlow[] = [
  F('cf1', 'cdn-edge', 'azfw', 'security'),
  F('cf2', 'azfw', 'vpn-gw', 'security'),
  F('cf3', 'entra', 'intune', 'identity'),
  F('cf4', 'entra', 'avd', 'identity'),
  F('cf5', 'avd', 'files', 'storage'),
  F('cf6', 'app-svc', 'sql', 'storage'),
  F('cf7', 'sql', 'backup-vault', 'backup'),
  F('cf8', 'files', 'backup-vault', 'backup'),
  F('cf9', 'backup-vault', 'blob-immutable', 'backup'),
  F('cf10', 'defender', 'sentinel', 'security'),
  F('cf11', 'vpn-gw', 'remote-office', 'security'),
  F('cf12', 'hq-users', 'avd', 'compute'),
]

/** The built-in Plan C document (read-only seed, like planADoc). */
export function cloudInfraDoc(): DiagramDoc {
  return {
    id: 'cloud-infra',
    slug: 'cloud-infra',
    title: 'Plan C — Cloud-Native Infrastructure',
    updatedAt: new Date(0).toISOString(),
    published: true,
    nodes: CLOUD_COMPONENTS.map((c) => ({ ...c, deps: [...c.deps], workloads: [...c.workloads] })),
    flows: CLOUD_FLOWS.map((f) => ({ ...f })),
  }
}

/** Built-in studies shown in the library above backend diagrams. */
export const BUILTIN_STUDIES: { slug: string; title: string; blurb: string }[] = [
  {
    slug: 'plan-a',
    title: 'Plan A — Hybrid Infrastructure',
    blurb: 'On-premises Proxmox core with Microsoft 365 identity, security, and immutable backup.',
  },
  {
    slug: 'cloud-infra',
    title: 'Plan C — Cloud-Native Infrastructure',
    blurb: 'Fully cloud: edge WAF, hub firewall, Entra ID, AVD, XDR/SIEM, and vault-based immutable backup.',
  },
  {
    slug: 'multi-site',
    title: 'Multi-Site Hybrid Network',
    blurb: 'HQ datacenter over SD-WAN with branch offices, cloud identity, and an off-site immutable copy.',
  },
  {
    slug: 'dr-site',
    title: 'Disaster Recovery Site',
    blurb: 'Warm standby site with async replication, a promotable standby database, and WORM backups.',
  },
  {
    slug: 'hybrid-join',
    title: 'Hybrid Identity Join',
    blurb: 'AD DS synced to Entra ID: hybrid-joined devices, conditional access, and Intune Autopilot.',
  },
]
