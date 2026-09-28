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
    ],
  },
  {
    id: 'compute', title: 'Compute',
    items: [
      rack('tpl-hypervisor', 'HYPERVISOR NODE', 'compute', 'Virtualization Node',
        'Virtualization host (Proxmox / ESXi) for guest VMs and containers.', ['VMs', 'HA', 'Live migration'], 2),
      rack('tpl-rack-server', 'RACK SERVER 1U', 'compute', 'Bare-Metal Server',
        'General-purpose 1U rack server for dedicated workloads.', ['Bare metal', 'Apps'], 1),
      chip('tpl-vm', 'VIRTUAL MACHINE', 'compute', 'Guest Workload',
        'Virtual machine running an application or service role.', ['App VM'], 155, 34),
      chip('tpl-cluster', 'CLUSTER', 'compute', 'HA Group',
        'High-availability cluster grouping several nodes.', ['HA quorum', 'Failover'], 200, 60),
    ],
  },
  {
    id: 'storage', title: 'Storage',
    items: [
      rack('tpl-nas', 'NAS STORAGE', 'storage', 'File & Datastore',
        'Network-attached storage for SMB shares and VM datastores.', ['SMB shares', 'Datastore'], 2),
      rack('tpl-backup-repo', 'BACKUP REPOSITORY', 'storage', 'Immutable Recovery',
        'Dedicated immutable repository for fast local restore.', ['Immutable repo', 'Restore'], 2),
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
    ],
  },
  {
    id: 'continuity', title: 'Backup & Power',
    items: [
      rack('tpl-backup-srv', 'BACKUP SERVER', 'backup', 'Backup Orchestration',
        'Backup server orchestrating protection jobs and retention.', ['Jobs', 'Retention'], 2),
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
      chip('tpl-generic', 'CUSTOM NODE', 'network', 'Custom Component',
        'Blank node — rename and describe any gear not in the library.', ['Custom'], 180, 56),
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
