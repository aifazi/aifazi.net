'use client'
import { useState, useEffect, useRef } from 'react'
import { useNavigate } from '@/lib/router-compat'
import { getAuthToken } from '@/lib/api'

const BANNER = [
  '╔══════════════════════════════════════════════════╗',
  '║          T.TANVIR SYSTEMS — v2.0.26              ║',
  '║     Network Engineer / IT Specialist             ║',
  '╚══════════════════════════════════════════════════╝',
  '',
  "Type 'help' for available commands.",
  '',
]

const COMMANDS = {
  help: {
    desc: 'List all commands',
    run: () => [
      '',
      '  NAVIGATION',
      '  ──────────────────────────────────────',
      '  home          Go to home page',
      '  blog          Go to blog',
      '  forum         Go to forum',
      '  tools         Go to network tools',
      '  contact       Go to contact page',
      '',
      '  SECTIONS',
      '  ──────────────────────────────────────',
      '  about         Jump to about section',
      '  skills        Jump to skills section',
      '  projects      Jump to projects section',
      '  experience    Jump to experience section',

      '',
      '  INFO',
      '  ──────────────────────────────────────',
      '  whoami        Display user info',
      '  uptime        Show site uptime',
      '  ping          Ping the server',
      '  ls            List site sections',
      '  date          Current date/time',
      '  cv            Download Tanvir\'s CV',
      '  fortune       Get a random fortune',
      '  clear         Clear terminal',
      '  exit          Close terminal',
      '',
      '  💡 Hint: There are hidden commands. Try exploring...',
      '',
    ],
  },
  whoami: {
    desc: 'Display user info',
    run: () => {
      const token = getAuthToken()
      let role = 'guest'
      if (token) {
        try { role = JSON.parse(atob(token.split('.')[1])).role || 'user' } catch {}
      }
      return [
        '',
        `  User  : ${role === 'admin' ? 'Tanvir (Admin)' : 'Visitor'}`,
        `  Role  : ${role}`,
        `  Host  : t.tanvir`,
        `  Shell : /bin/tchat v2.0`,
        '',
      ]
    },
  },
  ls: {
    desc: 'List sections',
    run: () => [
      '',
      '  drwxr-xr-x  about/',
      '  drwxr-xr-x  experience/',
      '  drwxr-xr-x  skills/',
      '  drwxr-xr-x  services/',
      '  drwxr-xr-x  projects/',

      '  drwxr-xr-x  blog/',
      '  drwxr-xr-x  forum/',
      '  drwxr-xr-x  tools/',
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
      return ['', `  up ${days} days, load average: 0.01, 0.02, 0.00`, '  STATUS: ✅ All systems operational', '']
    },
  },
  ping: {
    desc: 'Ping server',
    run: () => {
      const ms = () => (Math.random() * 5 + 1).toFixed(2)
      return [
        '',
        '  PING t.tanvir (127.0.0.1): 56 bytes',
        `  64 bytes from t.tanvir: icmp_seq=0 ttl=64 time=${ms()} ms`,
        `  64 bytes from t.tanvir: icmp_seq=1 ttl=64 time=${ms()} ms`,
        `  64 bytes from t.tanvir: icmp_seq=2 ttl=64 time=${ms()} ms`,
        '',
        '  3 packets tx, 3 received, 0% packet loss',
        '',
      ]
    },
  },
  clear: { desc: 'Clear terminal', run: () => null },
  exit:  { desc: 'Close terminal', run: () => '__exit__' },
  home:        { desc: 'Navigate home',         run: () => '__nav:/' },
  blog:        { desc: 'Navigate to blog',      run: () => '__nav:/blog' },
  forum:       { desc: 'Navigate to forum',     run: () => '__nav:/forum' },
  tools:       { desc: 'Navigate to tools',     run: () => '__nav:/tools' },
  contact:     { desc: 'Navigate to contact',   run: () => '__nav:/contact' },
  about:       { desc: 'Scroll to about',       run: () => '__scroll:about' },
  skills:      { desc: 'Scroll to skills',      run: () => '__scroll:skills' },
  projects:    { desc: 'Scroll to projects',    run: () => '__scroll:projects' },
  experience:  { desc: 'Scroll to experience',  run: () => '__scroll:experience' },


  // ── Easter eggs ──────────────────────────────────────────────────────────────
  'sudo hire tanvir': {
    desc: '?',
    run: () => [
      '',
      '  [sudo] password for recruiter: ••••••••',
      '  Authenticating...',
      '  ✅ Access granted.',
      '',
      '  🎉 Excellent choice! Tanvir is now added to your team.',
      '  📧 Next step: Send an offer to tanvir@aifazi.net',
      '',
      '  "Hire exceptional engineers. Ship exceptional products."',
      '',
    ],
  },
  matrix: {
    desc: '?',
    run: () => {
      const chars = '01アイウエオカキクケコ'
      const line = () => Array.from({ length: 50 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
      return ['', ...Array.from({ length: 8 }, () => `  \x1b[32m${line()}`), '', '  Wake up, Neo...', '  The Matrix has you.', '']
    },
  },
  coffee: {
    desc: '?',
    run: () => [
      '',
      '  ( (',
      '   ) )',
      '  .....',
      '  |   |]',
      '  \\   /',
      '   ---',
      '',
      '  ☕ Brewing... done.',
      '  Fueled by coffee & packets.',
      '',
    ],
  },
  hack: {
    desc: '?',
    run: () => [
      '',
      '  Initializing hack sequence...',
      '  > Bypassing firewall........... ❌ FAILED',
      '  > Trying SQL injection.......... ❌ BLOCKED',
      '  > Social engineering attempt.... ❌ DETECTED',
      '',
      '  SYSTEM: Nice try. This site is secured by Tanvir himself. 😎',
      '  SYSTEM: Try /contact if you want to talk instead.',
      '',
    ],
  },
  'fortune': {
    desc: '?',
    run: () => {
      const fortunes = [
        'The network is always the problem.',
        'There are 10 types of people: those who understand BGP and those who don\'t.',
        'Ping before you panic.',
        'A firewall a day keeps the hackers away.',
        'It\'s always DNS.',
        'Have you tried turning it off and on again?',
        'The best VPN is the friends we made along the way.',
      ]
      return ['', `  🎱 "${fortunes[Math.floor(Math.random() * fortunes.length)]}"`, '']
    },
  },
  cv: {
    desc: 'Download CV',
    run: () => {
      setTimeout(() => { const a = document.createElement('a'); a.href = '/resume.pdf'; a.download = 'Tanvir_Aifazi_CV.pdf'; a.click() }, 500)
      return ['', '  📄 Downloading CV...', '  Tanvir_Aifazi_CV.pdf', '']
    },
  },
}

function TypedLine({ text, onDone, instant = false }) {
  const [shown, setShown] = useState(instant ? text : '')
  useEffect(() => {
    if (instant) { setShown(text); onDone?.(); return }
    if (!text) { onDone?.(); return }
    let i = 0
    const iv = setInterval(() => {
      i++
      setShown(text.slice(0, i))
      if (i >= text.length) { clearInterval(iv); onDone?.() }
    }, 8)
    return () => clearInterval(iv)
  }, [text])
  return <div style={{ whiteSpace: 'pre' }}>{shown}</div>
}

export default function Terminal({ onClose }) {
  const [lines, setLines]     = useState([...BANNER])
  const [input, setInput]     = useState('')
  const [history, setHistory] = useState([])
  const [histIdx, setHistIdx] = useState(-1)
  const inputRef              = useRef(null)
  const bottomRef             = useRef(null)
  const navigate              = useNavigate()

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines])

  const runCommand = (raw) => {
    const cmd = raw.trim().toLowerCase()
    const echo = `visitor@t.tanvir:~$ ${raw}`

    if (!cmd) { setLines(p => [...p, echo, '']); return }

    setHistory(h => [raw, ...h])
    setHistIdx(-1)

    // Support multi-word commands (e.g. "sudo hire tanvir")
    const def = COMMANDS[cmd]
    if (!def) {
      setLines(p => [...p, echo, `  bash: ${cmd}: command not found. Type 'help'`, ''])
      return
    }

    const result = def.run()

    if (result === null) {
      setLines([...BANNER])
      return
    }
    if (result === '__exit__') {
      onClose?.(); return
    }
    if (typeof result === 'string' && result.startsWith('__nav:')) {
      const path = result.replace('__nav:', '')
      setLines(p => [...p, echo, `  → Navigating to ${path}...`, ''])
      setTimeout(() => { navigate(path); onClose?.() }, 600)
      return
    }
    if (typeof result === 'string' && result.startsWith('__scroll:')) {
      const id = result.replace('__scroll:', '')
      setLines(p => [...p, echo, `  → Scrolling to #${id}...`, ''])
      setTimeout(() => {
        onClose?.()
        setTimeout(() => {
          document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }, 300)
      }, 500)
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
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9998,
      background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      animation: 'fadeIn 0.2s ease',
    }}>
      <div style={{
        width: '90%', maxWidth: 720, maxHeight: '80vh',
        background: 'var(--bg)', border: '1px solid var(--green)',
        boxShadow: '0 0 60px color-mix(in srgb, var(--green) 15%, transparent)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Title bar */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 16px', background: 'var(--bg2)',
          borderBottom: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {['#ff5f57','#ffbd2e','#28c840'].map((c,i) => (
              <div key={i} onClick={i === 2 ? onClose : undefined}
                style={{ width: 12, height: 12, borderRadius: '50%', background: c, cursor: i === 2 ? 'pointer' : 'default' }} />
            ))}
          </div>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', letterSpacing: 2 }}>
            visitor@t.tanvir — bash
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 12 }}>✕</button>
        </div>

        {/* Output */}
        <div
          onClick={() => inputRef.current?.focus()}
          style={{
            flex: 1, overflowY: 'auto', padding: '16px 20px',
            fontFamily: 'var(--font-mono)', fontSize: 13, lineHeight: 1.7,
            color: 'var(--green)', cursor: 'text',
          }}
        >
          {lines.map((line, i) => (
            <div key={i} style={{
              whiteSpace: 'pre',
              color: line.startsWith('  →') ? 'var(--cyan)'
                   : line.startsWith('  bash:') ? 'var(--red)'
                   : line.startsWith('visitor@') ? 'var(--text)'
                   : 'var(--green)',
            }}>{line}</div>
          ))}

          {/* Input line */}
          <div className="terminal-prompt-row" style={{ display: 'flex', alignItems: 'center', gap: 0, marginTop: 2 }}>
            <span className="terminal-prompt-label" style={{ color: 'var(--cyan)', whiteSpace: 'nowrap' }}>visitor@t.tanvir:~$ </span>
            <div style={{ position: 'relative', flex: 1 }}>
              <input
                className="terminal-command-input"
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                autoFocus
                spellCheck={false}
                style={{
                  color: 'var(--green)', fontFamily: 'var(--font-mono)', fontSize: 13,
                  width: '100%', caretColor: 'var(--green)',
                }}
              />
            </div>
          </div>
          <div ref={bottomRef} />
        </div>
      </div>

      <style>{`@keyframes fadeIn { from{opacity:0} to{opacity:1} }`}</style>
    </div>
  )
}
