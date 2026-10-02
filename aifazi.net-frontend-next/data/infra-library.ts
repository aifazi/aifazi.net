/**
 * data/infra-library.ts — palette templates for the infra diagram builder.
 * Each template stamps a new node; placement/sizing is adjusted on canvas.
 */
import type { InfraCategory, InfraLayer } from './hybrid-infra'

export interface LibraryItem {
  key: string
  name: string
  category: InfraCategory
  layer: InfraLayer
  role: string
  desc: string
  workloads: string[]
  shape: 'chip' | 'cloud' | 'firewall'
  defaultW: number
  defaultH: number
  /** Rack templates carry a U height instead of a free box. */
  rackH?: number
}

export interface LibraryGroup {
  id: string
  title: string
  items: LibraryItem[]
}

const chip = (
  key: string, name: string, category: InfraCategory, role: string,
  desc: string, workloads: string[], defaultW = 180, defaultH = 56,
): LibraryItem => ({ key, name, category, layer: 'cloud', role, desc, workloads, shape: 'chip', defaultW, defaultH })

const rack = (
  key: string, name: string, category: InfraCategory, role: string,
  desc: string, workloads: string[], rackH = 2,
): LibraryItem => ({ key, name, category, layer: 'rack', role, desc, workloads, shape: 'chip', defaultW: 430, defaultH: 40, rackH })

export const INFRA_LIBRARY: LibraryGroup[] = [
  {
    id: 'network', title: 'Network',
    items: [
      rack('tpl-l3-switch', 'L3 SWITCH', 'network', 'Core / Access Switching',
        'Managed layer-3 switch for core or access-layer switching.', ['VLANs', 'LACP', 'STP'], 2),
      rack('tpl-router', 'ROUTER', 'network', 'Routing & WAN',
        'Edge or branch router for WAN termination and inter-VLAN routing.', ['BGP/OSPF', 'NAT', 'VPN'], 2),
      rack('tpl-firewall-1u', 'FIREWALL (1U)', 'network', 'Security Edge',
        'Next-generation firewall appliance for edge security and segmentation.', ['IPS/IDS', 'VPN', 'NAT'], 1),
      rack('tpl-wlc', 'WIRELESS CONTROLLER', 'network', 'Wireless Control Plane',
        'Centralized controller for Wi-Fi access point management.', ['WLAN control', 'AP management'], 1),
      chip('tpl-isp', 'ISP UPLINK', 'network', 'Internet', 'Internet circuit uplink for cloud, VPN, and outbound traffic.', ['Internet uplink'], 145, 50),
      chip('tpl-lb', 'LOAD BALANCER', 'network', 'Traffic Distribution',
        'Layer-4/7 load balancer spreading traffic across service backends.', ['Health checks', 'TLS offload'], 195, 56),
      chip('tpl-vpn-gw', 'VPN GATEWAY', 'network', 'Site Connectivity',
        'IPsec/SSL VPN gateway for site-to-site and remote connectivity.', ['IPsec VPN', 'Tunnel monitoring'], 185, 56),
      chip('tpl-dns', 'DNS SERVER', 'network', 'Name Resolution',
        'Internal DNS resolver for domain and service name resolution.', ['Recursive DNS', 'Split horizon'], 175, 50),
      chip('tpl-dhcp', 'DHCP SERVER', 'network', 'Address Management',
        'DHCP service issuing and reserving IP addresses on the LAN.', ['Scopes', 'Reservations'], 175, 50),
      chip('tpl-ntp', 'NTP SERVER', 'network', 'Time Synchronization',
        'Stratum time source keeping every device clock aligned.', ['NTP', 'Audit timestamps'], 165, 46),
      chip('tpl-reverse-proxy', 'REVERSE PROXY', 'network', 'Application Front End',
        'Reverse proxy terminating TLS and routing to internal apps.', ['TLS termination', 'URL routing'], 195, 56),
      chip('tpl-waf', 'WEB APPLICATION FW', 'network', 'HTTP Protection',
        'Web application firewall shielding public sites from OWASP threats.', ['OWASP rules', 'Bot control'], 195, 56),
      chip('tpl-proxy', 'FORWARD PROXY', 'network', 'Egress Control',
        'Forward proxy controlling and logging outbound web access.', ['URL filtering', 'Egress logging'], 185, 50),
    ],
  },
  {
    id: 'compute', title: 'Compute',
    items: [
      rack('tpl-hypervisor', 'HYPERVISOR NODE', 'compute', 'Virtualization Node',
        'Virtualization host (Proxmox / ESXi) for guest VMs and containers.', ['VMs', 'HA', 'Live migration'], 2),
      rack('tpl-rack-server', 'RACK SERVER 1U', 'compute', 'Bare-Metal Server',
        'General-purpose 1U rack server for dedicated workloads.', ['Bare metal', 'Apps'], 1),
      rack('tpl-hyperv-host', 'HYPER-V HOST', 'compute', 'Windows Virtualization',
        'Windows Server Hyper-V host clustering workloads with live migration.', ['VMs', 'Failover clustering'], 2),
      chip('tpl-vm', 'VIRTUAL MACHINE', 'compute', 'Guest Workload',
        'Virtual machine running an application or service role.', ['App VM'], 155, 34),
      chip('tpl-cluster', 'CLUSTER', 'compute', 'HA Group',
        'High-availability cluster grouping several nodes.', ['HA quorum', 'Failover'], 200, 60),
      chip('tpl-k8s', 'KUBERNETES CLUSTER', 'compute', 'Container Platform',
        'Container orchestration platform running podized services.', ['Pods', 'Ingress', 'Autoscaling'], 210, 62),
      chip('tpl-docker-host', 'DOCKER HOST', 'compute', 'Container Runtime',
        'Single-host container runtime for services and side loads.', ['Containers', 'Compose stacks'], 180, 52),
      chip('tpl-jump-box', 'JUMP BOX', 'compute', 'Privileged Access Host',
        'Hardened bastion used as the only admin path into the estate.', ['Bastion', 'Just-in-time access'], 170, 50),
      chip('tpl-terminal-server', 'TERMINAL SERVER', 'compute', 'Shared Desktops',
        'Remote desktop host serving published apps and session hosts.', ['RDS sessions', 'Published apps'], 195, 56),
    ],
  },
  {
    id: 'storage', title: 'Storage',
    items: [
      rack('tpl-nas', 'NAS STORAGE', 'storage', 'File & Datastore',
        'Network-attached storage for SMB shares and VM datastores.', ['SMB shares', 'Datastore'], 2),
      rack('tpl-backup-repo', 'BACKUP REPOSITORY', 'storage', 'Immutable Recovery',
        'Dedicated immutable repository for fast local restore.', ['Immutable repo', 'Restore'], 2),
      rack('tpl-san', 'SAN / iSCSI', 'storage', 'Block Storage',
        'Block storage array presenting iSCSI LUNs to hosts.', ['iSCSI LUNs', 'Multipath'], 2),
      rack('tpl-nvme-cache', 'NVMe CACHE TIER', 'storage', 'Acceleration Tier',
        'NVMe cache tier accelerating hot reads on the storage array.', ['Read cache', 'Tiering'], 1),
      chip('tpl-object-storage', 'OBJECT STORAGE', 'storage', 'S3-Compatible Blob',
        'Object store for backups, archives, and application artifacts.', ['S3 API', 'Lifecycle rules'], 205, 58),
      chip('tpl-cloud-share', 'CLOUD SHARE', 'storage', 'Collaboration Data',
        'Cloud-hosted team documents and collaboration data.', ['Team docs', 'Sync'], 220, 62),
    ],
  },
  {
    id: 'identity', title: 'Identity',
    items: [
      chip('tpl-dc', 'DOMAIN CONTROLLER', 'identity', 'Directory Services',
        'Domain controller providing directory, DNS, and policy services.', ['AD DS', 'DNS', 'GPO'], 155, 34),
      chip('tpl-idp', 'IDENTITY PROVIDER', 'identity', 'Cloud Identity',
        'Cloud identity layer with SSO, MFA, and conditional access.', ['SSO', 'MFA', 'Conditional Access'], 220, 62),
      chip('tpl-sync', 'DIRECTORY SYNC', 'identity', 'Identity Synchronization',
        'Synchronizes on-premises identities to the cloud directory.', ['Sync', 'Password hash sync'], 165, 34),
    ],
  },
  {
    id: 'security', title: 'Security',
    items: [
      {
        key: 'tpl-fw-ha', name: 'HA FIREWALL PAIR', category: 'security', layer: 'edge',
        role: 'Security Edge', shape: 'firewall', defaultW: 340, defaultH: 90,
        desc: 'High-availability firewall pair for edge security, NAT, VPN, and segmentation.',
        workloads: ['NAT', 'VPN', 'IPS/IDS', 'HA failover'],
      },
      chip('tpl-vpn', 'REMOTE ACCESS VPN', 'security', 'Remote Access',
        'VPN gateway for secure remote workforce connectivity.', ['VPN', 'Policy controls'], 185, 52),
      chip('tpl-edr', 'ENDPOINT PROTECTION', 'security', 'Endpoint & Email Security',
        'Endpoint detection and email protection suite.', ['EDR', 'Email security'], 220, 62),
      chip('tpl-dlp', 'DATA PROTECTION', 'security', 'Information Protection',
        'Labels, DLP, retention, and audit for regulated data.', ['Labels', 'DLP', 'Audit'], 220, 62),
      chip('tpl-badge-access', 'BADGE ACCESS', 'security', 'Physical Access Control',
        'Door controller and badge system securing entrances and mantraps.', ['Card readers', 'Anti-passback'], 190, 52),
    ],
  },
  {
    id: 'continuity', title: 'Backup & Power',
    items: [
      rack('tpl-backup-srv', 'BACKUP SERVER', 'backup', 'Backup Orchestration',
        'Backup server orchestrating protection jobs and retention.', ['Jobs', 'Retention'], 2),
      rack('tpl-tape', 'TAPE LIBRARY', 'backup', 'Air-Gapped Archive',
        'Tape library providing offline, air-gapped long-term retention.', ['Tape rotation', 'WORM'], 4),
      rack('tpl-repl-target', 'REPLICATION TARGET', 'backup', 'Recovery Replica',
        'Storage replica kept current for site-failure failover.', ['Async replication', 'Failover'], 2),
      rack('tpl-offsite-nas', 'OFF-SITE NAS', 'backup', 'Remote File Copy',
        'Secondary NAS at another site holding replicated file services.', ['Replication', 'SMB shares'], 2),
      chip('tpl-cloud-archive', 'CLOUD ARCHIVE', 'backup', 'Long-Term Retention',
        'Cloud archive tier for compliance retention and deep restore.', ['Glacier tier', 'Object lock'], 210, 58),
      chip('tpl-offsite', 'OFF-SITE COPY', 'backup', 'Disaster Recovery',
        'Off-site immutable copy for site-level failure and ransomware resilience.', ['Immutable copy'], 220, 62),
      rack('tpl-ups', 'UPS', 'power', 'Power Continuity',
        'Uninterruptible power supply for ride-through and graceful shutdown.', ['Ride-through', 'Shutdown'], 2),
      rack('tpl-patch', 'PATCH PANEL', 'network', 'Physical Connectivity',
        'Structured cabling termination and uplink patching.', ['Patching', 'Uplinks'], 1),
    ],
  },
  {
    id: 'endpoints', title: 'Endpoints & Users',
    items: [
      chip('tpl-laptop', 'MANAGED LAPTOP', 'endpoint', 'User Device',
        'Managed end-user device enrolled in device management.', ['MDM', 'EDR'], 150, 48),
      chip('tpl-printer', 'NETWORK PRINTER', 'endpoint', 'Shared Peripheral',
        'Shared network printer on the office LAN.', ['Print', 'Scan'], 150, 48),
      chip('tpl-nvr', 'IP CAMERA / NVR', 'endpoint', 'Video Surveillance',
        'IP cameras recording to a network video recorder for retention.', ['RTSP', 'Motion alerts'], 185, 52),
      chip('tpl-voip', 'VOIP PBX', 'endpoint', 'Telephony',
        'On-prem or hosted PBX serving desk phones and call queues.', ['SIP trunks', 'Call queues'], 180, 52),
      chip('tpl-signage', 'DIGITAL SIGNAGE', 'endpoint', 'Displays & Kiosks',
        'Managed display pushing announcements and dashboards.', ['CMS push', 'Scheduling'], 180, 50),
      chip('tpl-generic', 'CUSTOM NODE', 'network', 'Custom Component',
        'Blank node — rename and describe any gear not in the library.', ['Custom'], 180, 56),
    ],
  },
  {
    id: 'cloud', title: 'Cloud & SaaS',
    items: [
      chip('tpl-azure-vm', 'AZURE VM', 'compute', 'Cloud Compute',
        'Azure virtual machine running IaaS workloads.', ['IaaS', 'Availability set'], 185, 56),
      chip('tpl-aws-ec2', 'AWS EC2', 'compute', 'Cloud Compute',
        'Amazon EC2 instance for elastic compute capacity.', ['IaaS', 'Auto scaling'], 185, 56),
      chip('tpl-azure-sql', 'AZURE SQL', 'storage', 'Managed Database',
        'Managed SQL database with automated backups and HA.', ['PaaS DB', 'Geo-replication'], 200, 58),
      chip('tpl-aws-s3', 'AWS S3', 'storage', 'Object Storage',
        'S3 bucket for artifacts, backups, and static assets.', ['Object storage', 'Versioning'], 195, 56),
      chip('tpl-teams', 'TEAMS / EXCHANGE', 'storage', 'Collaboration & Mail',
        'Microsoft 365 collaboration, chat, and mailbox services.', ['Mailboxes', 'Chat', 'Meetings'], 220, 62),
      chip('tpl-power-platform', 'POWER PLATFORM', 'compute', 'Low-Code Apps',
        'Low-code apps and automated flows on the Power Platform.', ['Apps', 'Automated flows'], 205, 58),
    ],
  },
  {
    id: 'ops', title: 'Monitoring & Ops',
    items: [
      chip('tpl-prometheus', 'PROMETHEUS', 'compute', 'Metrics Pipeline',
        'Scrapes and stores time-series metrics with alerting rules.', ['Scrapes', 'Alert rules'], 195, 56),
      chip('tpl-grafana', 'GRAFANA', 'compute', 'Observability Dashboards',
        'Dashboards visualizing metrics, logs, and traces.', ['Dashboards', 'Data sources'], 195, 56),
      chip('tpl-zabbix', 'ZABBIX', 'compute', 'Infrastructure Monitoring',
        'Agent-based monitoring of hosts, services, and thresholds.', ['Agent checks', 'Threshold alerts'], 195, 56),
      chip('tpl-elk', 'ELK / GRAYLOG', 'compute', 'Log Management',
        'Central log pipeline for search, correlation, and retention.', ['Log ingest', 'Index retention'], 210, 58),
      chip('tpl-uptime', 'UPTIME PROBE', 'compute', 'Synthetic Checks',
        'External probe checking service availability from outside.', ['HTTP checks', 'SLA reporting'], 185, 50),
      chip('tpl-siem', 'SIEM', 'security', 'Security Analytics',
        'Correlates security events into incidents with retention.', ['Event correlation', 'Incident alerts'], 200, 58),
    ],
  },
]

/** Stamp a library template into a new node at design coords. */
export function stampFromLibrary(
  item: LibraryItem,
  at: { x: number; y: number },
  n: number,
): import('./hybrid-infra').InfraComponent {
  const id = `${item.key.replace(/^tpl-/, '')}-${Date.now().toString(36)}${n}`
  if (item.layer === 'rack') {
    return {
      id, name: item.name, category: item.category, layer: 'rack',
      role: item.role, desc: item.desc,
      workloads: [...item.workloads], deps: [],
      rackU: 1, rackH: item.rackH ?? 2,
    }
  }
  return {
    id, name: item.name, category: item.category, layer: 'cloud',
    role: item.role, desc: item.desc,
    workloads: [...item.workloads], deps: [],
    x: Math.round(at.x - item.defaultW / 2),
    y: Math.round(at.y - item.defaultH / 2),
    w: item.defaultW, h: item.defaultH, shape: item.shape,
  }
}
