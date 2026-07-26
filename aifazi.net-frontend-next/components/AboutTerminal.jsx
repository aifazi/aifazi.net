'use client'
import { useState, useEffect, useRef } from 'react'

const COMMANDS = {
  help: {
    desc: 'List available commands',
    run: () => [
      '',
      '  COMMANDS',
      '  ─────────────────────────',
      '  whoami        About Tanvir',
      '  skills        Technical skills',
      '  certs         Certifications',
      '  contact       Contact info',
      '  ls            List sections',
      '  date          Current date/time',
      '  ping          Ping the server',
      '  uptime        Site uptime',
      '  clear         Clear terminal',
      '  help          Show this help',
      '',
    ],
  },
  whoami: {
    desc: 'About Tanvir',
    run: () => [
      '',
      '  Tanvir — Network Engineer & IT Specialist',
      '  Dedicated to building robust, scalable,',
      '  and secure infrastructure.',
      '  Location: UAE / Remote',
      '',
    ],
  },
  skills: {
    desc: 'Technical skills',
    run: () => [
      '',
      '  NETWORKING',
      '  ├─ Routing & Switching (Cisco/Juniper)',
      '  ├─ BGP, OSPF, EIGRP, VLANs, STP',
      '  └─ SD-WAN, MPLS, VPN (IPsec/SSL)',
      '',
      '  SECURITY',
      '  ├─ Firewalls: FortiGate, Palo Alto',
      '  ├─ IDS/IPS, SIEM, Zero Trust',
      '  └─ Pentesting, Hardening, Compliance',
      '',
      '  CLOUD & INFRA',
      '  ├─ AWS, Azure, GCP',
      '  ├─ Docker, Kubernetes, Terraform',
      '  └─ CI/CD, Monitoring, Automation',
      '',
      '  SYSTEMS',
      '  ├─ Linux (Debian/RHEL), Windows Server',
      '  ├─ Active Directory, DNS, DHCP',
      '  └─ Scripting: Python, Bash, PowerShell',
      '',
    ],
  },
  certs: {
    desc: 'Certifications',
    run: () => [
      '',
      '  ┌──────────────────────────────────────┐',
      '  │  CCNA      Cisco Certified Network Associate │',
      '  │  CCNP      Cisco Certified Network Professional (in progress) │',
      '  │  FortiGate NSE 4                       │',
      '  │  AWS SAA   Solutions Architect         │',
      '  │  CompTIA Security+                     │',
      '  │  ITIL v4   Foundation                  │',
      '  └──────────────────────────────────────┘',
      '',
    ],
  },
  contact: {
    desc: 'Contact info',
    run: () => [
      '',
      '  Email  : tanvir@aifazi.net',
      '  GitHub : github.com/tanviraifazi',
      '  LinkedIn: linkedin.com/in/tanviraifazi',
      '',
    ],
  },
  ls: {
    desc: 'List sections',
    run: () => [
      '',
      '  about/',
      '  experience/',
      '  skills/',
      '  services/',
      '  projects/',
      '  contact/',
      '',
    ],
  },
  date: {
    desc: 'Current date/time',
    run: () => ['', `  ${new Date().toString()}`, ''],
  },
  uptime: {
    desc: 'Show uptime',
    run: () => {
      const days = Math.floor((Date.now() - new Date('2024-01-01').getTime()) / 86400000)
      return ['', `  up ${days} days, load average: 0.02, 0.01, 0.00`, '  STATUS: ✅ All systems operational', '']
    },
  },
  ping: {
    desc: 'Ping server',
    run: () => [
      '',
      '  PING aifazi.net (127.0.0.1): 56 bytes',
      `  64 bytes from aifazi.net: icmp_seq=0 ttl=64 time=${(Math.random() * 3 + 1).toFixed(2)} ms`,
      `  64 bytes from aifazi.net: icmp_seq=1 ttl=64 time=${(Math.random() * 3 + 1).toFixed(2)} ms`,
      `  64 bytes from aifazi.net: icmp_seq=2 ttl=64 time=${(Math.random() * 3 + 1).toFixed(2)} ms`,
      '',
      '  3 packets tx, 3 received, 0% packet loss',
      '',
    ],
  },
  clear: { desc: 'Clear terminal', run: () => null },
}

export default function AboutTerminal() {
  const [lines, setLines]     = useState([
    '╔══════════════════════════════════════╗',
    '║   TANVIR SYSTEMS — Interactive Shell  ║',
    '╚══════════════════════════════════════╝',
    '',
    "Type 'help' for available commands.",
    '',
  ])
  const [input, setInput]     = useState('')
  const [history, setHistory] = useState([])
  const [histIdx, setHistIdx] = useState(-1)
  const inputRef              = useRef(null)
  const bottomRef             = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines])

  const runCommand = (raw) => {
    const cmd = raw.trim().toLowerCase()
    const echo = `tanvir@about:~$ ${raw}`

    if (!cmd) { setLines(p => [...p, echo, '']); return }

    setHistory(h => [raw, ...h])
    setHistIdx(-1)

    const def = COMMANDS[cmd]
    if (!def) {
      setLines(p => [...p, echo, `  bash: ${cmd}: command not found. Type 'help'`, ''])
      return
    }

    const result = def.run()
    if (result === null) {
      setLines([
        '╔══════════════════════════════════════╗',
        '║   TANVIR SYSTEMS — Interactive Shell  ║',
        '╚══════════════════════════════════════╝',
        '',
        "Type 'help' for available commands.",
        '',
      ])
      return
    }

    setLines(p => [...p, echo, ...result])
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
      const matches = Object.keys(COMMANDS).filter(k => k.startsWith(input))
      if (matches.length === 1) setInput(matches[0])
    }
  }

  return (
    <div className="terminal-panel about-terminal" style={{
      overflow: 'hidden', fontFamily: 'var(--font-mono)',
    }}>
      <div className="terminal-panel-header" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
        {['#ff5f56','#ffbd2e','#27c93f'].map(c => <div key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c }} />)}
        <div style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: 2, margin: '0 auto' }}>tanvir@about:~$</div>
      </div>
      <div
        className="terminal-panel-body"
        onClick={() => inputRef.current?.focus()}
        style={{
          padding: 24, fontSize: 13, lineHeight: 1.8,
          maxHeight: 320, overflowY: 'auto', cursor: 'text',
        }}
      >
        {lines.map((line, i) => (
          <div key={i} style={{
            whiteSpace: 'pre',
            color: line.startsWith('tanvir@') ? 'var(--text)'
                 : line.startsWith('  bash:') ? 'var(--red)'
                 : line.startsWith('  ╔') || line.startsWith('  ║') || line.startsWith('  ╚') ? 'var(--cyan)'
                 : line.startsWith('  ─') || line.startsWith('  ├') || line.startsWith('  └') || line.startsWith('  ┌') || line.startsWith('  │') || line.startsWith('  ┐') || line.startsWith('  ┘') ? 'var(--cyan)'
                 : 'var(--green)',
          }}>{line}</div>
        ))}

        <div className="terminal-prompt-row" style={{ display: 'flex', alignItems: 'center', gap: 0, marginTop: 2 }}>
          <span className="terminal-prompt-label" style={{ color: 'var(--cyan)', whiteSpace: 'nowrap', fontSize: 13 }}>tanvir@about:~$ </span>
          <input
            className="terminal-command-input"
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            autoFocus
            spellCheck={false}
            style={{
              color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: 13,
              width: '100%', caretColor: 'var(--green)',
            }}
          />
          <span className="terminal-cursor" style={{ display: 'inline-block', width: 7, height: 13, background: 'var(--green)', marginLeft: 2, animation: 'ablink 1s step-end infinite' }} />
        </div>
        <div ref={bottomRef} />
      </div>
      <style>{`@keyframes ablink { 0%,100%{opacity:1} 50%{opacity:0} }`}</style>
    </div>
  )
}
