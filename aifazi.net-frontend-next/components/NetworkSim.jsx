'use client'
import { useState, useEffect, useRef } from 'react'
import api, { getAuthToken } from '@/lib/api'

const BANNER = [
  '╔══════════════════════════════════════════════════════╗',
  '║        Cisco IOS Simulator — v15.9(3)M6              ║',
  '║   Network Device Command Learning Environment         ║',
  '╚══════════════════════════════════════════════════════╝',
  '',
  'Type "?" or "help" for available commands.',
  'Modes: User Exec >  Privileged #  Global Config (config)#',
  '',
]

const DEVICE = {
  hostname: 'Router',
  model: 'ISR 4451-X',
  version: 'Cisco IOS XE 17.3',
  interfaces: [
    { name: 'GigabitEthernet0/0', ip: '192.168.1.1', mask: '255.255.255.0', status: 'up', protocol: 'up', desc: 'WAN Link' },
    { name: 'GigabitEthernet0/1', ip: '10.0.0.1', mask: '255.255.255.0', status: 'up', protocol: 'up', desc: 'LAN Segment A' },
    { name: 'GigabitEthernet0/2', ip: '172.16.0.1', mask: '255.255.240.0', status: 'up', protocol: 'up', desc: 'DMZ' },
    { name: 'Serial0/0/0', ip: '203.0.113.1', mask: '255.255.255.252', status: 'up', protocol: 'up', desc: 'WAN Circuit #1' },
    { name: 'Serial0/0/1', ip: '198.51.100.1', mask: '255.255.255.252', status: 'admin down', protocol: 'down', desc: 'Backup Link' },
    { name: 'Loopback0', ip: '1.1.1.1', mask: '255.255.255.255', status: 'up', protocol: 'up', desc: 'Router ID' },
  ],
  vlans: [
    { id: 1, name: 'default', interfaces: ['Gi0/1'], status: 'active' },
    { id: 10, name: 'Management', interfaces: ['Gi0/0'], status: 'active' },
    { id: 20, name: 'Users', interfaces: ['Gi0/1'], status: 'active' },
    { id: 30, name: 'Servers', interfaces: ['Gi0/2'], status: 'active' },
    { id: 99, name: 'Native', interfaces: [], status: 'active' },
  ],
  routes: [
    { network: '0.0.0.0', mask: '0.0.0.0', nextHop: '203.0.113.2', metric: 1, type: 'S*' },
    { network: '192.168.1.0', mask: '255.255.255.0', nextHop: 'direct', metric: 0, type: 'C' },
    { network: '10.0.0.0', mask: '255.255.255.0', nextHop: 'direct', metric: 0, type: 'C' },
    { network: '172.16.0.0', mask: '255.255.240.0', nextHop: 'direct', metric: 0, type: 'C' },
    { network: '203.0.113.0', mask: '255.255.255.252', nextHop: 'direct', metric: 0, type: 'C' },
    { network: '10.10.10.0', mask: '255.255.255.0', nextHop: '192.168.1.100', metric: 2, type: 'O' },
    { network: '192.168.100.0', mask: '255.255.255.0', nextHop: '10.0.0.254', metric: 1, type: 'D' },
    { network: '172.20.0.0', mask: '255.255.255.0', nextHop: '203.0.113.2', metric: 3, type: 'O E2' },
  ],
  configLines: [
    'hostname Router',
    '!',
    'interface GigabitEthernet0/0',
    ' description WAN Link',
    ' ip address 192.168.1.1 255.255.255.0',
    ' no shutdown',
    '!',
    'interface GigabitEthernet0/1',
    ' description LAN Segment A',
    ' ip address 10.0.0.1 255.255.255.0',
    ' no shutdown',
    '!',
    'interface Serial0/0/0',
    ' description WAN Circuit #1',
    ' ip address 203.0.113.1 255.255.255.252',
    ' encapsulation ppp',
    ' no shutdown',
    '!',
    'router ospf 1',
    ' network 10.0.0.0 0.0.0.255 area 0',
    ' network 192.168.1.0 0.0.0.255 area 0',
    '!',
    'ip route 0.0.0.0 0.0.0.0 203.0.113.2',
    '!',
    'access-list 100 permit ip 10.0.0.0 0.0.0.255 any',
    'access-list 100 deny ip any any log',
    '!',
    'snmp-server community public RO',
    '!',
    'line vty 0 4',
    ' password cisco',
    ' login',
    '!',
    'end',
  ],
}

function generateMac() {
  const h = () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')
  return `a.b.c.d.e.f`
}

export default function NetworkSim({ embedded }) {
  const [lines, setLines] = useState([...BANNER])
  const [input, setInput] = useState('')
  const [history, setHistory] = useState([])
  const [histIdx, setHistIdx] = useState(-1)
  const [mode, setMode] = useState('user')
  const [configMode, setConfigMode] = useState(null)
  const [savedHistory, setSavedHistory] = useState(() => {
    if (typeof window === 'undefined') return []
    const token = getAuthToken()
    if (token) {
      try {
        const stored = localStorage.getItem('network-sim-history')
        if (stored) return JSON.parse(stored)
      } catch {}
    }
    return []
  })
  const inputRef = useRef(null)
  const bottomRef = useRef(null)

  const hostname = DEVICE.hostname

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines])

  useEffect(() => {
    if (savedHistory.length > 0) {
      localStorage.setItem('network-sim-history', JSON.stringify(savedHistory.slice(0, 200)))
    }
  }, [savedHistory])

  const getPrompt = () => {
    const h = hostname
    if (configMode) return `${h}(config-if)#`
    if (mode === 'priv') return `${h}#`
    return `${h}>`
  }

  const saveCommand = (cmd) => {
    const entry = { cmd, ts: new Date().toISOString(), mode: getPrompt() }
    setSavedHistory(p => [entry, ...p].slice(0, 200))
    try {
      const token = getAuthToken()
      if (token) {
        api.post('/network-sim/history', { command: cmd, mode: getPrompt() }).catch(() => {})
      }
    } catch {}
  }

  const runCommand = (raw) => {
    const cmd = raw.trim()
    const prompt = getPrompt()
    const echo = `${prompt} ${raw}`

    if (!cmd) { setLines(p => [...p, echo, '']); return }

    setHistory(h => [raw, ...h])
    setHistIdx(-1)
    saveCommand(cmd)

    const lower = cmd.toLowerCase()

    if (lower === '?' || lower === 'help') {
      setLines(p => [...p, echo,
        '',
        '  USER EXEC (> )',
        '  ─────────────────────────────────',
        '  enable             Enter privileged mode',
        '  show               Various show commands',
        '  ping <ip>          Send ICMP echo',
        '  traceroute <ip>    Trace route to host',
        '  telnet <ip>        Telnet to device',
        '  ssh <ip>           SSH to device',
        '  ?, help            Show this help',
        '',
        '  PRIVILEGED (#)',
        '  ─────────────────────────────────',
        '  configure terminal  Enter global config',
        '  show running-config  Display running config',
        '  show interfaces     Display interface status',
        '  show ip route       Display routing table',
        '  show vlan           Display VLAN info',
        '  show version        Show device version',
        '  write memory        Save configuration',
        '  reload              Reboot the device',
        '  disable             Return to user exec',
        '',
        '  GLOBAL CONFIG ((config)#)',
        '  ─────────────────────────────────',
        '  hostname <name>     Set device hostname',
        '  interface <type/b>  Enter interface config',
        '  router ospf <pid>   Enter OSPF config',
        '  ip route <net> <mask> <nh>  Static route',
        '  exit                Exit current mode',
        '  end                 Return to privileged exec',
        '',
        '  INTERFACE CONFIG ((config-if)#)',
        '  ─────────────────────────────────',
        '  ip address <ip> <mask>  Set IP on interface',
        '  description <text>  Set description',
        '  no shutdown         Enable interface',
        '  shutdown            Disable interface',
        '  exit                Exit to global config',
        '  end                 Return to privileged exec',
        '',
        '  TIPS',
        '  ─────────────────────────────────',
        '  Arrow up/down to recall commands.',
        '  Tab to autocomplete.',
        '  Commands are saved to your account.',
        '',
      ])
      return
    }

    if (lower === 'enable') {
      setMode('priv')
      setLines(p => [...p, echo, ''])
      return
    }

    if (lower === 'disable') {
      setMode('user')
      setLines(p => [...p, echo, ''])
      return
    }

    if (lower === 'exit' || lower === 'end') {
      if (configMode) {
        if (configMode === 'if') {
          setConfigMode('global')
          setLines(p => [...p, echo, `${hostname}(config)#`])
          return
        }
        setConfigMode(null)
        setMode('priv')
        setLines(p => [...p, echo, `${hostname}#`])
        return
      }
      setLines(p => [...p, echo, ''])
      return
    }

    if (lower === 'clear' || lower === 'cls') {
      setLines([...BANNER])
      return
    }

    if (lower.startsWith('configure terminal') || lower === 'conf t') {
      setMode('priv')
      setConfigMode('global')
      setLines(p => [...p, echo, '', `${hostname}(config)#`])
      return
    }

    if (lower === 'write memory' || lower === 'wr' || lower === 'copy running-config startup-config') {
      setLines(p => [...p, echo,
        '  Building configuration...',
        '  [OK]',
        '  Written to: startup-config (size: 2847 bytes)',
        '',
      ])
      return
    }

    if (lower === 'reload') {
      setLines(p => [...p, echo,
        '  System configuration has been modified. Save? [yes/no]: yes',
        '  Proceed with reload? [confirm]',
        '  *Jun  3 14:22:15.847: %SYS-5-RELOAD: Reload requested by console.',
        '  System reload in progress...',
        '',
        '  ╔══════════════════════════════════╗',
        '  ║    Simulated: Device rebooted.    ║',
        '  ╚══════════════════════════════════╝',
        '',
      ])
      return
    }

    if (configMode === 'global') {
      if (lower.startsWith('hostname ')) {
        const newName = cmd.slice(9).trim().toUpperCase()
        if (newName) DEVICE.hostname = newName
        setLines(p => [...p, echo, `${hostname}(config)#`])
        return
      }
      if (lower.startsWith('interface ')) {
        setConfigMode('if')
        setLines(p => [...p, echo, `${hostname}(config-if)#`])
        return
      }
      if (lower.startsWith('router ospf ')) {
        setLines(p => [...p, echo, `${hostname}(config-router)#`])
        return
      }
      if (lower.startsWith('ip route ')) {
        setLines(p => [...p, echo, ''])
        return
      }
      if (lower.startsWith('no ')) {
        setLines(p => [...p, echo, ''])
        return
      }
    }

    if (configMode === 'if') {
      if (lower.startsWith('ip address ')) {
        setLines(p => [...p, echo, `${hostname}(config-if)#`])
        return
      }
      if (lower.startsWith('description ')) {
        setLines(p => [...p, echo, `${hostname}(config-if)#`])
        return
      }
      if (lower === 'no shutdown') {
        setLines(p => [...p, echo, `${hostname}(config-if)#`])
        return
      }
      if (lower === 'shutdown') {
        setLines(p => [...p, echo, `${hostname}(config-if)#`])
        return
      }
    }

    if (lower.startsWith('show ')) {
      const arg = lower.slice(5).trim()

      if (!arg || arg === '?' || arg === 'help') {
        setLines(p => [...p, echo,
          '',
          '  show running-config          Running configuration',
          '  show startup-config          Startup configuration',
          '  show interfaces              Interface status & stats',
          '  show interfaces <int>        Specific interface',
          '  show ip interface brief      IP interface summary',
          '  show ip route                IP routing table',
          '  show ip route <network>      Route to specific network',
          '  show vlan                    VLAN database',
          '  show vlan brief              VLAN summary',
          '  show version                 System version & hardware',
          '  show mac-address-table       MAC address table',
          '  show cdp neighbors           CDP neighbor info',
          '  show running-config | section <section>',
          '  show log                     System log messages',
          '  show clock                   System clock',
          '  show users                   Active users',
          '  show flash                   Flash file system',
          '  show processes cpu           CPU utilization',
          '  show ip ospf neighbor        OSPF neighbors',
          '  show ip bgp summary          BGP summary',
          '',
        ])
        return
      }

      if (arg === 'running-config' || arg === 'run') {
        setLines(p => [...p, echo, '', ...DEVICE.configLines.map(l => `  ${l}`), ''])
        return
      }

      if (arg === 'startup-config') {
        setLines(p => [...p, echo,
          '',
          '  Using 2847 out of 524288 bytes',
          '  ! Last modified at 14:00:00 UTC Jun 3 2026',
          ...DEVICE.configLines.map(l => `  ${l}`),
          '',
        ])
        return
      }

      if (arg === 'interfaces' || arg === 'interface') {
        const out = ['']
        DEVICE.interfaces.forEach(intf => {
          out.push(`  ${intf.name} is ${intf.status}, line protocol is ${intf.protocol}`)
          out.push(`    Internet address is ${intf.ip}/${intf.mask}`)
          out.push(`    Description: ${intf.desc}`)
          out.push(`    Hardware: ISR4451, address: ${generateMac()}`)
          out.push(`    MTU 1500 bytes, BW 1000000 Kbit, DLY 10 usec`)
          out.push('')
        })
        setLines(p => [...p, echo, ...out])
        return
      }

      const intfMatch = arg.match(/^interfaces?\s+(\S+)/i) || arg.match(/^interfaces?\s+(\S+\/\d+)/i)
      if (intfMatch) {
        const name = intfMatch[1]
        const intf = DEVICE.interfaces.find(i => i.name.toLowerCase() === name.toLowerCase())
        if (intf) {
          setLines(p => [...p, echo,
            '',
            `  ${intf.name} is ${intf.status}, line protocol is ${intf.protocol}`,
            `  Hardware: ISR4451, address: ${generateMac()} (bia ${generateMac()})`,
            `  Description: ${intf.desc}`,
            `  Internet address is ${intf.ip}/${intf.mask}`,
            `  MTU 1500 bytes, BW 1000000 Kbit, DLY 10 usec`,
            `  reliability 255/255, txload 1/255, rxload 1/255`,
            `  Encapsulation ARPA, loopback not set`,
            `  Keepalive set (10 sec)`,
            `  Full-duplex, 1000Mb/s, media type is RJ45`,
            `  output flow-control is unsupported, input flow-control is unsupported`,
            `  Input queue: 0/2000/0/0 (size/max/drops/flushes); Total output drops: 0`,
            `  5 minute input rate 1200 bits/sec, 2 packets/sec`,
            `  5 minute output rate 3400 bits/sec, 4 packets/sec`,
            `     packets input 154283, bytes 48729101`,
            `     packets output 98721, bytes 28177300`,
            '',
          ])
        } else {
          setLines(p => [...p, echo, `  % Invalid interface. Valid: ${DEVICE.interfaces.map(i => i.name).join(', ')}`, ''])
        }
        return
      }

      if (arg === 'ip interface brief' || arg === 'ip int brief') {
        const out = ['', '  Interface                  IP-Address      Status              Protocol']
        DEVICE.interfaces.forEach(intf => {
          const pad = '  ' + intf.name.padEnd(25) + (intf.ip || 'unassigned').padEnd(16) + intf.status.padEnd(20) + intf.protocol
          out.push(pad)
        })
        out.push('')
        setLines(p => [...p, echo, ...out])
        return
      }

      if (arg.startsWith('ip route ')) {
        const target = arg.slice(9).trim()
        const out = ['']
        DEVICE.routes.forEach(r => {
          if (!target || r.network === target || r.nextHop === target) {
            out.push(`  ${r.type.padEnd(5)} ${r.network.padEnd(18)} ${r.mask.padEnd(18)} via ${r.nextHop.padEnd(18)} [1/${r.metric}]`)
          }
        })
        if (out.length === 1) out.push(`  % Network not in routing table`)
        out.push('')
        setLines(p => [...p, echo, ...out])
        return
      }

      if (arg === 'ip route' || arg === 'ip route ?') {
        const out = ['', '  Codes: C - connected, S - static, D - EIGRP, O - OSPF, O E2 - OSPF ext']
        DEVICE.routes.forEach(r => {
          out.push(`  ${r.type.padEnd(5)} ${r.network.padEnd(18)} ${r.mask.padEnd(18)} via ${r.nextHop.padEnd(18)} [1/${r.metric}]`)
        })
        out.push('')
        setLines(p => [...p, echo, ...out])
        return
      }

      if (arg === 'vlan' || arg === 'vlan brief') {
        const out = ['', '  VLAN Name                             Status    Ports', '  ---- -------------------------------- --------- -------------------------------']
        DEVICE.vlans.forEach(v => {
          out.push(`  ${String(v.id).padEnd(5)} ${v.name.padEnd(35)} ${v.status.padEnd(10)} ${v.interfaces.join(', ')}`)
        })
        out.push('')
        setLines(p => [...p, echo, ...out])
        return
      }

      if (arg === 'version') {
        setLines(p => [...p, echo,
          '',
          `  ${DEVICE.model} (1Gb) processor with 4194304K bytes of memory.`,
          `  ${DEVICE.version}, Version ${DEVICE.version.split(' ').pop()}`,
          `  ROM: System Bootstrap, Version 17.3`,
          `  BOOTLDR: System Bootstrap, Version 17.3`,
          '',
          `  ${hostname} uptime is ${Math.floor(Math.random() * 365)} days, ${Math.floor(Math.random() * 24)} hours, ${Math.floor(Math.random() * 60)} minutes`,
          `  System returned to ROM by power-on`,
          `  System image file is "flash:isr4400-universalk9.17.03.01.SPA.bin"`,
          '',
          '  License Level: network-advantage',
          '  License Type: Permanent',
          '  Next reload license level: network-advantage',
          '',
          '  Configuration register is 0x2102',
          '',
        ])
        return
      }

      if (arg === 'clock') {
        const now = new Date()
        const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
        const tz = 'UTC'
        setLines(p => [...p, echo, `  *${days[now.getDay()]} ${months[now.getMonth()]} ${now.getDate()} ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')}.000: ${tz}`, ''])
        return
      }

      if (arg === 'users') {
        setLines(p => [...p, echo,
          '',
          '    Line       User             Host(s)              Idle       Location',
          '   0 con 0    admin            idle                 00:00:00   console',
          '   2 vty 0    tanvir           idle                 00:12:34   10.0.0.100',
          '   3 vty 1    operator         idle                 00:05:22   10.0.0.101',
          '',
        ])
        return
      }

      if (arg === 'flash' || arg === 'flash:') {
        setLines(p => [...p, echo,
          '',
          '  Directory of flash:/',
          '',
          '    1  drw-      0   Jan 1 2026 00:00:00  core/',
          `    2  -rw-  44040192   Jan 1 2026 00:00:00  isr4400-universalk9.17.03.01.SPA.bin`,
          `    3  -rw-     32768   Jan 1 2026 00:00:00  startup-config`,
          `    4  -rw-      1126   Jun 3 2026 14:00:00  ${hostname}-config.txt`,
          '',
          `  268435456 bytes total (219820032 bytes free)`,
          '',
        ])
        return
      }

      if (arg === 'processes cpu' || arg === 'proc cpu') {
        const cpu = Math.floor(Math.random() * 30) + 2
        setLines(p => [...p, echo,
          '',
          `  CPU utilization for five seconds: ${cpu}%/0%; one minute: ${Math.max(1, cpu - 5)}%; five minutes: ${Math.max(1, cpu - 10)}%`,
          '  PID   Runtime(ms)  Invoked      uSecs   5Sec   1Min   5Min  TTY Process',
          `    1        8423     98721         85   0.00%  0.01%  0.00%    0 Load Meter`,
          `    2           0         1          0   0.00%  0.00%  0.00%    0 OSPF-1 Hello`,
          `    3       12045    102384        117   0.12%  0.08%  0.05%    0 SSH Server`,
          `    4         823      4092        201   0.01%  0.00%  0.00%    0 SNMP Timer`,
          '',
        ])
        return
      }

      if (arg === 'log' || arg === 'logging') {
        setLines(p => [...p, echo,
          '',
          '  Syslog logging: enabled',
          '  Console logging: level debugging, 32 messages logged',
          '  Monitor logging: level debugging, 0 messages logged',
          '  Buffer logging: level informational, 128 messages logged',
          '  Trap logging: level informational, 24 message lines logged',
          '',
          `  Jun  3 14:20:01: %LINEPROTO-5-UPDOWN: Line protocol on Interface GigabitEthernet0/0, changed state to up`,
          `  Jun  3 14:20:01: %LINK-3-UPDOWN: Interface GigabitEthernet0/0, changed state to up`,
          `  Jun  3 14:19:58: %SYS-5-CONFIG_I: Configured from console by admin on vty0`,
          '',
        ])
        return
      }

      if (arg === 'mac-address-table' || arg === 'mac') {
        const out = ['', '          Mac Address Table', '  ───────────────────────────────────────────', '  Vlan    Mac Address       Type        Ports', '  ──  ─────────────────  ────────  ───────']
        for (let i = 0; i < 6; i++) {
          const hex = () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')
          const mac = `${hex()}${hex()}.${hex()}${hex()}.${hex()}${hex()}`
          const vlan = [1, 10, 10, 20, 30, 99][i]
          const port = ['Gi0/0', 'Gi0/1', 'Gi0/1', 'Gi0/1', 'Gi0/2', 'Gi0/0'][i]
          const type = ['DYNAMIC', 'DYNAMIC', 'STATIC', 'DYNAMIC', 'DYNAMIC', 'STATIC'][i]
          out.push(`  ${String(vlan).padEnd(6)} ${mac.padEnd(18)} ${type.padEnd(9)} ${port}`)
        }
        out.push('')
        setLines(p => [...p, echo, ...out])
        return
      }

      if (arg === 'cdp neighbors') {
        setLines(p => [...p, echo,
          '',
          '  Capability Codes: R - Router, T - Trans Bridge, S - Switch, H - Host, I - IGMP',
          '',
          '  Device ID        Local Intrfce     Holdtme    Capability  Platform        Port ID',
          '  SW-Distribution  Gig 0/0           151        S I WS-C3750X     Gig 1/0/1',
          '  FW-Primary       Gig 0/2           172        R I            FortiGate-600E  port1',
          '  RTR-EDGE         Ser 0/0/0         165        R              ISR4331         Ser 0/0/0',
          '',
        ])
        return
      }

      if (arg === 'ip ospf neighbor') {
        setLines(p => [...p, echo,
          '',
          '  Neighbor ID     Pri   State           Dead Time   Address         Interface',
          '  10.10.10.1       1   FULL/DR         00:00:34    10.0.0.2        GigabitEthernet0/0',
          '  192.168.100.1    1   FULL/BDR        00:00:38    192.168.1.100   GigabitEthernet0/1',
          '',
        ])
        return
      }

      if (arg === 'ip bgp summary') {
        setLines(p => [...p, echo,
          '',
          '  BGP router identifier 1.1.1.1, local AS number 65001',
          '  BGP table version: 142, main routing table version 142',
          '  12 network entries using 1404 bytes of memory',
          '  14 path entries using 728 bytes of memory',
          '',
          '  Neighbor        V           AS MsgRcvd MsgSent   TblVer  InQ OutQ Up/Down  State/PfxRcd',
          '  203.0.113.2     4        65002   12452    12484      142    0    0 2w0d          8',
          '',
        ])
        return
      }

      setLines(p => [...p, echo,
        `  % Invalid input detected at '^' marker.`,
        `  Type 'show ?' for available show commands.`,
        '',
      ])
      return
    }

    if (lower.startsWith('ping ')) {
      const target = cmd.slice(5).trim()
      if (!target) {
        setLines(p => [...p, echo, '  Target IP address required.', ''])
        return
      }
      const sent = 5
      const recv = Math.floor(Math.random() * 2) + 4
      const loss = ((sent - recv) / sent) * 100
      const times = Array.from({ length: recv }, () => (Math.random() * 20 + 1).toFixed(2))
      const out = [
        '',
        `  Type escape sequence to abort.`,
        `  Sending ${sent}, 100-byte ICMP Echos to ${target}, timeout is 2 seconds:`,
        '',
      ]
      times.forEach((t, i) => out.push(`  !!!  Reply from ${target}: bytes=100 time=${t}ms TTL=63`))
      if (recv < sent) {
        for (let i = 0; i < sent - recv; i++) out.push(`  ...  Request timed out.`)
      }
      out.push('')
      out.push(`  Success rate is ${((recv / sent) * 100).toFixed(0)} percent (${recv}/${sent}), round-trip min/avg/max = ${Math.min(...times)}/${(times.reduce((a, b) => a + parseFloat(b), 0) / times.length).toFixed(2)}/${Math.max(...times)} ms`)
      out.push('')
      setLines(p => [...p, echo, ...out])
      return
    }

    if (lower.startsWith('traceroute ')) {
      const target = cmd.slice(11).trim()
      if (!target) {
        setLines(p => [...p, echo, '  Target IP address required.', ''])
        return
      }
      const hops = [
        `${hostname} (${DEVICE.interfaces[0].ip})`,
        ' 1  10.0.0.254  2 ms  1 ms  2 ms',
        ' 2  203.0.113.2  5 ms  4 ms  5 ms',
        ' 3  72.14.237.1  12 ms  11 ms  13 ms',
        ` 4  ${target}  18 ms  17 ms  19 ms`,
      ]
      setLines(p => [...p, echo, '', `  Tracing route to ${target}`, `  over a maximum of 30 hops:`, '', ...hops, ''])
      return
    }

    if (lower.startsWith('telnet ') || lower.startsWith('ssh ')) {
      const target = cmd.split(' ')[1]
      setLines(p => [...p, echo, `  Trying ${target || 'host'} ...`, '  % Connection refused by remote host', ''])
      return
    }

    setLines(p => [...p, echo, `  % Invalid input detected at '^' marker.`, `  Type '?' or 'help' for available commands.`, ''])
  }

  const handleKey = (e) => {
    if (e.key === 'Enter') {
      runCommand(input)
      setInput('')
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      const newIdx = Math.min(histIdx + 1, history.length - 1)
      setHistIdx(newIdx)
      setInput(history[newIdx] || '')
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const newIdx = Math.max(histIdx - 1, -1)
      setHistIdx(newIdx)
      setInput(newIdx === -1 ? '' : history[newIdx])
    }
    if (e.key === 'Tab') {
      e.preventDefault()
      const cmds = [
        'enable', 'disable', 'configure terminal', 'conf t',
        'show running-config', 'show interfaces', 'show ip interface brief',
        'show ip route', 'show vlan', 'show version', 'show clock',
        'show users', 'show flash', 'show processes cpu', 'show log',
        'show mac-address-table', 'show cdp neighbors', 'show ip ospf neighbor',
        'show ip bgp summary', 'write memory', 'reload', 'clear',
        'show startup-config', 'ping', 'traceroute',
      ]
      const matches = cmds.filter(k => k.startsWith(input))
      if (matches.length === 1) setInput(matches[0])
    }
  }

  return (
    <div className="terminal-panel network-terminal" style={{
      overflow: 'hidden', fontFamily: 'var(--font-mono)',
    }}>
      <div className="terminal-panel-header" style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 6 }}>
        {['#ff5f57','#ffbd2e','#28c840'].map((c, i) => (
          <div key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: c }} />
        ))}
        <span style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: 2, marginLeft: 8 }}>
          {hostname} — Cisco IOS Simulator
        </span>
      </div>

      <div
        className="terminal-panel-body"
        onClick={() => inputRef.current?.focus()}
        style={{
          padding: '16px 20px', fontSize: 12, lineHeight: 1.6,
          maxHeight: 400, overflowY: 'auto', cursor: 'text',
        }}
      >
        {lines.map((line, i) => (
          <div key={i} style={{
            whiteSpace: 'pre',
            color: line.startsWith(`${hostname}>`) || line.startsWith(`${hostname}#`) || line.startsWith(`${hostname}(config)`)
                  ? 'var(--cyan)'
                  : line.startsWith('  %') ? 'var(--red)'
                  : line.startsWith('  ╔') || line.startsWith('  ║') || line.startsWith('  ╚') ? 'var(--cyan)'
                  : line.startsWith('  ---') ? 'var(--text)'
                  : line.startsWith('  !!!') ? 'var(--green)'
                  : line.startsWith('  ...') ? 'var(--muted)'
                  : line.startsWith('  !') ? 'var(--muted)'
                  : 'var(--green)',
          }}>{line}</div>
        ))}

        <div className="terminal-prompt-row" style={{ display: 'flex', alignItems: 'center', gap: 0, marginTop: 2 }}>
          <span className="terminal-prompt-label" style={{ color: 'var(--cyan)', whiteSpace: 'nowrap', fontSize: 12 }}>{getPrompt()} </span>
          <input
            className="terminal-command-input"
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            autoFocus
            spellCheck={false}
            style={{
              color: 'var(--green)', fontFamily: 'var(--font-mono)', fontSize: 12,
              width: '100%', caretColor: 'var(--green)',
            }}
          />
          <span className="terminal-cursor" style={{ display: 'inline-block', width: 7, height: 13, background: 'var(--green)', marginLeft: 2, animation: 'nblink 1s step-end infinite' }} />
        </div>
        <div ref={bottomRef} />
      </div>

      <style>{`@keyframes nblink { 0%,100%{opacity:1} 50%{opacity:0} }`}</style>
    </div>
  )
}
