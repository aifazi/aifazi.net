'use client'
import { useState, useEffect, useRef } from 'react'
import { notify } from '../core/notify.jsx'
import NetworkSim from '@/components/NetworkSim'

// ── Helpers ───────────────────────────────────────────────────────────────────
function ipToLong(ip) {
  return ip.split('.').reduce((acc, oct) => (acc << 8) + parseInt(oct, 10), 0) >>> 0
}
function longToIp(long) {
  return [(long >>> 24) & 255, (long >>> 16) & 255, (long >>> 8) & 255, long & 255].join('.')
}
function cidrToMask(cidr) {
  return longToIp(cidr === 0 ? 0 : (0xffffffff << (32 - cidr)) >>> 0)
}
function maskToCidr(mask) {
  return mask.split('.').reduce((acc, oct) => acc + (parseInt(oct, 10).toString(2).match(/1/g) || []).length, 0)
}
function isValidIp(ip) {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(ip) && ip.split('.').every(o => parseInt(o) <= 255)
}

// ── Subnet Calculator ─────────────────────────────────────────────────────────
function SubnetCalc() {
  const [input, setInput] = useState('192.168.1.0/24')
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  const calculate = () => {
    setError(''); setResult(null)
    const parts = input.trim().split('/')
    if (parts.length !== 2) return setError('Format: IP/CIDR  e.g. 192.168.1.0/24')
    const [ip, cidrStr] = parts
    const cidr = parseInt(cidrStr)
    if (!isValidIp(ip)) return setError('Invalid IP address')
    if (isNaN(cidr) || cidr < 0 || cidr > 32) return setError('CIDR must be 0–32')

    const ipLong    = ipToLong(ip)
    const mask      = cidrToMask(cidr)
    const maskLong  = ipToLong(mask)
    const netLong   = (ipLong & maskLong) >>> 0
    const wildLong  = (~maskLong) >>> 0
    const bcastLong = (netLong | wildLong) >>> 0
    const firstHost = cidr < 31 ? netLong + 1 : netLong
    const lastHost  = cidr < 31 ? bcastLong - 1 : bcastLong
    const hosts     = cidr >= 31 ? Math.pow(2, 32 - cidr) : Math.pow(2, 32 - cidr) - 2

    const ipBin = ipToLong(ip).toString(2).padStart(32, '0')
    const netBin = netLong.toString(2).padStart(32, '0')

    setResult({
      network:    longToIp(netLong),
      broadcast:  longToIp(bcastLong),
      mask,
      wildcard:   longToIp(wildLong),
      firstHost:  longToIp(firstHost),
      lastHost:   longToIp(lastHost),
      hosts:      hosts.toLocaleString(),
      cidr,
      ipClass:    cidr <= 8 ? 'A' : cidr <= 16 ? 'B' : cidr <= 24 ? 'C' : 'D/E',
      ipBin:      ipBin.match(/.{8}/g).join('.'),
      netBin:     netBin.match(/.{8}/g).join('.'),
      netPart:    ipBin.slice(0, cidr),
      hostPart:   ipBin.slice(cidr),
    })
  }

  const Row = ({ label, value, mono = true, color }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2, color: 'var(--muted)', flexShrink: 0 }}>{label}</span>
      <span style={{ fontFamily: mono ? 'var(--font-mono)' : 'var(--font-display)', fontSize: 13, color: color || 'var(--green)', letterSpacing: mono ? 1 : 0, wordBreak: 'break-all', textAlign: 'right' }}>{value}</span>
    </div>
  )

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && calculate()}
          placeholder="e.g. 192.168.1.0/24"
          style={{ ...S.input, minWidth: 160 }}
        />
        <button onClick={calculate} style={S.btn}>CALCULATE</button>
      </div>
      {error && <div style={{ color: 'var(--red)', fontFamily: 'var(--font-mono)', fontSize: 11, marginBottom: 12 }}>⚠ {error}</div>}
      {result && (
        <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', padding: '0 20px' }}>
          <Row label="NETWORK ADDRESS"   value={result.network + '/' + result.cidr} />
          <Row label="SUBNET MASK"       value={result.mask} />
          <Row label="WILDCARD MASK"     value={result.wildcard} color="var(--cyan)" />
          <Row label="BROADCAST"         value={result.broadcast} color="var(--orange)" />
          <Row label="FIRST HOST"        value={result.firstHost} color="var(--cyan)" />
          <Row label="LAST HOST"         value={result.lastHost} color="var(--cyan)" />
          <Row label="USABLE HOSTS"      value={result.hosts} color="var(--green)" />
          <Row label="IP CLASS"          value={`Class ${result.ipClass}`} color="var(--muted)" />
          <div style={{ padding: '12px 0' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', letterSpacing: 2, marginBottom: 8 }}>BINARY BREAKDOWN</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1 }}>
              IP:  {result.ipBin.split('.').map((b, i) => (
                <span key={i}>{i > 0 && <span style={{ color: 'var(--border)' }}>.</span>}
                  <span style={{ color: 'var(--green)' }}>{b.slice(0, Math.max(0, result.cidr - i * 8))}</span>
                  <span style={{ color: 'var(--muted)' }}>{b.slice(Math.max(0, result.cidr - i * 8))}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── CIDR Reference Table ───────────────────────────────────────────────────────
function CidrTable() {
  const rows = [8,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32].map(cidr => ({
    cidr,
    mask: cidrToMask(cidr),
    hosts: cidr >= 31 ? Math.pow(2, 32 - cidr) : Math.max(0, Math.pow(2, 32 - cidr) - 2),
    subnets: cidr >= 16 ? Math.pow(2, cidr - 16) : 1,
  }))

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--green)' }}>
            {['CIDR','SUBNET MASK','USABLE HOSTS','/16 SUBNETS'].map(h => (
              <th key={h} style={{ padding: '8px 16px', textAlign: 'left', color: 'var(--green)', fontSize: 9, letterSpacing: 2 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.cidr} style={{ borderBottom: '1px solid var(--border)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'color-mix(in srgb, var(--green) 4%, transparent)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <td style={{ padding: '8px 16px', color: 'var(--cyan)' }}>/{r.cidr}</td>
              <td style={{ padding: '8px 16px', color: 'var(--text)' }}>{r.mask}</td>
              <td style={{ padding: '8px 16px', color: 'var(--green)' }}>{r.hosts.toLocaleString()}</td>
              <td style={{ padding: '8px 16px', color: 'var(--muted)' }}>{r.subnets}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── IP Info / Lookup with Globe Map ──────────────────────────────────────────
function GlobeMap({ lat, lon, city, mapId }) {
  const mapRef = useRef(null)
  const leafletRef = useRef(null)
  const markerRef = useRef(null)

  useEffect(() => {
    if (!lat || !lon || !mapRef.current) return

    const initMap = () => {
      if (!window.L) return

      // Destroy previous map instance if exists
      if (leafletRef.current) {
        leafletRef.current.remove()
        leafletRef.current = null
      }

      const map = window.L.map(mapRef.current, {
        center: [lat, lon],
        zoom: 11,
        zoomControl: true,
        scrollWheelZoom: false,
      })

      window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map)

      // Custom green marker icon
      const greenIcon = window.L.divIcon({
        className: '',
        html: `<div style="
          width:18px;height:18px;
          background:var(--green,#00ff88);
          border:3px solid #000;
          border-radius:50%;
          box-shadow:0 0 0 2px var(--green,#00ff88),0 0 16px var(--green,#00ff88);
        "></div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      })

      const marker = window.L.marker([lat, lon], { icon: greenIcon }).addTo(map)
      marker.bindPopup(`<b style="font-family:monospace">${city || 'Location'}</b><br/>${lat.toFixed(4)}, ${lon.toFixed(4)}`)
      leafletRef.current = map
      markerRef.current = marker
    }

    if (window.L) {
      initMap()
    } else {
      // Load Leaflet CSS + JS dynamically
      if (!document.getElementById('leaflet-css')) {
        const link = document.createElement('link')
        link.id = 'leaflet-css'
        link.rel = 'stylesheet'
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
        document.head.appendChild(link)
      }
      if (!document.getElementById('leaflet-js')) {
        const script = document.createElement('script')
        script.id = 'leaflet-js'
        script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
        script.onload = initMap
        document.head.appendChild(script)
      } else {
        const checkL = setInterval(() => {
          if (window.L) { clearInterval(checkL); initMap() }
        }, 100)
      }
    }

    return () => {
      if (leafletRef.current) {
        leafletRef.current.remove()
        leafletRef.current = null
      }
    }
  }, [lat, lon, city, mapId])

  return (
    <div style={{ position: 'relative', marginTop: 24 }}>
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 3,
        color: 'var(--green)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8
      }}>
        <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'var(--green)', boxShadow: '0 0 6px var(--green)' }} />
        LIVE LOCATION MAP
      </div>
      <div
        ref={mapRef}
        id={mapId}
        style={{
          width: '100%', height: 300,
          border: '1px solid var(--border)',
          background: 'var(--bg3)',
          borderRadius: 0,
        }}
      />
    </div>
  )
}

function IpInfo() {
  const [ip, setIp]         = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState('')
  const [mapId, setMapId]   = useState('ipmap-0')
  const lookupCount = useRef(0)

  // Auto-load visitor IP on mount
  useEffect(() => { doLookup('') }, [])

  const doLookup = async (target) => {
    setError(''); setResult(null)
    setLoading(true)
    try {
      const url = target ? `https://ipapi.co/${target}/json/` : 'https://ipapi.co/json/'
      const res = await fetch(url)
      const data = await res.json()
      if (data.error) throw new Error(data.reason || 'Lookup failed')
      setResult(data)
      lookupCount.current += 1
      setMapId('ipmap-' + lookupCount.current)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleLookup = () => doLookup(ip.trim())

  const copy = (val) => navigator.clipboard.writeText(String(val)).then(() => notify.success('Copied!'))

  const InfoCard = ({ icon, label, value, color, onClick }) => (
    <div
      onClick={onClick}
      title={onClick ? 'Click to copy' : undefined}
      style={{
        background: 'var(--bg3)', border: '1px solid var(--border)',
        padding: '14px 16px', cursor: onClick ? 'pointer' : 'default',
        transition: 'border-color 0.15s',
      }}
      onMouseEnter={e => onClick && (e.currentTarget.style.borderColor = 'var(--green)')}
      onMouseLeave={e => onClick && (e.currentTarget.style.borderColor = 'var(--border)')}
    >
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 2, color: 'var(--muted)', marginBottom: 6 }}>
        {icon} {label}
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: color || 'var(--text)', wordBreak: 'break-all', letterSpacing: 1 }}>
        {value || '—'}
      </div>
    </div>
  )

  return (
    <div>
      {/* Search bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <input
          value={ip} onChange={e => setIp(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleLookup()}
          placeholder="Enter IP address (blank = your IP)"
          style={{ ...S.input, minWidth: 180 }}
        />
        <button onClick={handleLookup} disabled={loading} style={{ ...S.btn, opacity: loading ? 0.6 : 1 }}>
          {loading ? '…' : 'LOOKUP'}
        </button>
      </div>
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', marginBottom: 20 }}>
        Leave blank to auto-detect your public IP address
      </p>

      {loading && (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--green)', padding: '20px 0', letterSpacing: 2 }}>
          ◉ DETECTING IP LOCATION…
        </div>
      )}

      {error && (
        <div style={{ color: 'var(--red)', fontFamily: 'var(--font-mono)', fontSize: 11, marginBottom: 12 }}>⚠ {error}</div>
      )}

      {result && !loading && (
        <>
          {/* IP Hero */}
          <div style={{
            background: 'linear-gradient(135deg,color-mix(in srgb, var(--green) 8%, transparent) 0%,rgba(0,200,255,0.04) 100%)',
            border: '1px solid var(--green)', padding: '20px 24px', marginBottom: 20,
            display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
          }}>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 3, color: 'var(--muted)', marginBottom: 4 }}>
                {ip.trim() ? 'QUERIED IP ADDRESS' : 'YOUR PUBLIC IP ADDRESS'}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 32, color: 'var(--green)', letterSpacing: 3, fontWeight: 700 }}>
                {result.ip}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
                {[result.city, result.region, result.country_name].filter(Boolean).join(', ')}
              </div>
            </div>
            <button
              onClick={() => copy(result.ip)}
              style={{ ...S.btn, marginLeft: 'auto', fontSize: 9, padding: '8px 14px' }}
            >COPY IP</button>
          </div>

          {/* Info Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 8, marginBottom: 8 }}>
            <InfoCard icon="🌐" label="IP ADDRESS"    value={result.ip}                              color="var(--green)"  onClick={() => copy(result.ip)} />
            <InfoCard icon="🏠" label="HOSTNAME"      value={result.hostname}                        color="var(--cyan)"   onClick={result.hostname ? () => copy(result.hostname) : null} />
            <InfoCard icon="🏙" label="CITY"          value={result.city}                            color="var(--text)" />
            <InfoCard icon="🗺" label="REGION"        value={result.region}                          color="var(--text)" />
            <InfoCard icon="🌍" label="COUNTRY"       value={result.country_name ? `${result.country_name} (${result.country_code})` : null} color="var(--text)" />
            <InfoCard icon="📮" label="POSTAL CODE"   value={result.postal}                          color="var(--muted)" />
            <InfoCard icon="🕐" label="TIMEZONE"      value={result.timezone}                        color="var(--orange)" />
            <InfoCard icon="🔌" label="ISP / ORG"     value={result.org}                             color="var(--cyan)"   onClick={result.org ? () => copy(result.org) : null} />
            <InfoCard icon="📡" label="ASN"           value={result.asn}                             color="var(--purple)" onClick={result.asn ? () => copy(result.asn) : null} />
            <InfoCard icon="💬" label="CALLING CODE"  value={result.country_calling_code}            color="var(--muted)" />
            <InfoCard icon="💰" label="CURRENCY"      value={result.currency ? `${result.currency} (${result.currency_name})` : null} color="var(--muted)" />
            <InfoCard icon="🌐" label="LANGUAGES"     value={result.languages}                       color="var(--muted)" />
          </div>

          {/* Coordinates row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 4 }}>
            <InfoCard icon="📍" label="LATITUDE"  value={result.latitude  != null ? result.latitude.toFixed(6)  : null} color="var(--yellow)" onClick={result.latitude  != null ? () => copy(result.latitude)  : null} />
            <InfoCard icon="📍" label="LONGITUDE" value={result.longitude != null ? result.longitude.toFixed(6) : null} color="var(--yellow)" onClick={result.longitude != null ? () => copy(result.longitude) : null} />
          </div>

          {/* Globe / Map */}
          {result.latitude != null && result.longitude != null && (
            <GlobeMap
              lat={result.latitude}
              lon={result.longitude}
              city={result.city}
              mapId={mapId}
            />
          )}
        </>
      )}
    </div>
  )
}

// ── Binary / Decimal / Hex Converter ─────────────────────────────────────────
function IpConverter() {
  const [decimal, setDecimal] = useState('')
  const [binary, setBinary]   = useState('')
  const [hex, setHex]         = useState('')
  const [ipAddr, setIpAddr]   = useState('')
  const [long, setLong]       = useState('')

  const fromDecimal = (v) => {
    setDecimal(v)
    const n = parseInt(v)
    if (!isNaN(n) && n >= 0 && n <= 4294967295) {
      setBinary(n.toString(2).padStart(32, '0').match(/.{8}/g).join('.'))
      setHex('0x' + n.toString(16).toUpperCase().padStart(8, '0'))
      setIpAddr(longToIp(n))
      setLong(n.toString())
    }
  }

  const fromIp = (v) => {
    setIpAddr(v)
    if (isValidIp(v)) {
      const n = ipToLong(v)
      setDecimal(n.toString())
      setBinary(n.toString(2).padStart(32, '0').match(/.{8}/g).join('.'))
      setHex('0x' + n.toString(16).toUpperCase().padStart(8, '0'))
      setLong(n.toString())
    }
  }

  const Field = ({ label, value, onChange, placeholder, color }) => (
    <div style={{ marginBottom: 12 }}>
      <label style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 2, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ ...S.input, color: color || 'var(--text)', fontFamily: 'var(--font-mono)' }} />
    </div>
  )

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
      <Field label="IP ADDRESS (DOT-DECIMAL)" value={ipAddr} onChange={fromIp} placeholder="192.168.1.1" color="var(--green)" />
      <Field label="INTEGER (LONG)" value={decimal} onChange={fromDecimal} placeholder="3232235777" color="var(--cyan)" />
      <Field label="BINARY" value={binary} onChange={() => {}} placeholder="—" color="var(--orange)" />
      <Field label="HEXADECIMAL" value={hex} onChange={() => {}} placeholder="—" color="var(--purple)" />
    </div>
  )
}

// ── Wildcard / ACL Helper ─────────────────────────────────────────────────────
function WildcardCalc() {
  const [network, setNetwork] = useState('192.168.1.0')
  const [cidr, setCidr]       = useState('24')
  const [result, setResult]   = useState(null)

  const calculate = () => {
    const c = parseInt(cidr)
    if (!isValidIp(network) || isNaN(c) || c < 0 || c > 32) return
    const mask     = cidrToMask(c)
    const maskLong = ipToLong(mask)
    const wildLong = (~maskLong) >>> 0
    const wildcard = longToIp(wildLong)
    const netLong  = (ipToLong(network) & maskLong) >>> 0
    const netAddr  = longToIp(netLong)
    setResult({
      cisco:      `access-list 10 permit ${netAddr} ${wildcard}`,
      iosRouting: `ip route 0.0.0.0 0.0.0.0 [next-hop]`,
      ospf:       `network ${netAddr} ${wildcard} area 0`,
      acl:        `permit ip ${netAddr} ${wildcard} any`,
      netAddr, wildcard, mask,
    })
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <input value={network} onChange={e => setNetwork(e.target.value)} placeholder="Network IP" style={{ ...S.input, flex: '2 1 140px' }} />
        <input value={cidr} onChange={e => setCidr(e.target.value)} placeholder="CIDR" style={{ ...S.input, flex: '1 1 60px', maxWidth: 90 }} />
        <button onClick={calculate} style={S.btn}>GENERATE</button>
      </div>
      {result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { label: 'SUBNET MASK',    value: result.mask,    color: 'var(--cyan)' },
            { label: 'WILDCARD MASK',  value: result.wildcard, color: 'var(--green)' },
            { label: 'CISCO ACL',      value: result.cisco,   color: 'var(--orange)' },
            { label: 'OSPF STATEMENT', value: result.ospf,    color: 'var(--cyan)' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', padding: '12px 16px' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', letterSpacing: 2, marginBottom: 6 }}>{label}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color, letterSpacing: 1, cursor: 'pointer' }}
                onClick={() => navigator.clipboard.writeText(value).then(() => notify.success('Copied!'))}
                title="Click to copy"
              >{value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const S = {
  input: {
    background: 'var(--bg3)', border: '1px solid var(--border)',
    color: 'var(--text)', fontFamily: 'var(--font-display)',
    fontSize: 14, padding: '10px 14px', outline: 'none', flex: 1,
    minWidth: 0,
  },
  btn: {
    fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2,
    padding: '10px 18px', background: 'var(--green)', color: '#000',
    border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: 700,
    flexShrink: 0,
  },
}

const TABS = [
  { id: 'subnet',   label: 'Subnet Calc',   icon: '🌐', component: SubnetCalc },
  { id: 'cidr',     label: 'CIDR Table',    icon: '📋', component: CidrTable },
  { id: 'ipinfo',   label: 'IP Lookup',     icon: '🔍', component: IpInfo },
  { id: 'convert',  label: 'IP Converter',  icon: '🔄', component: IpConverter },
  { id: 'wildcard', label: 'Wildcard/ACL',  icon: '🛡️', component: WildcardCalc },
  { id: 'cli',      label: 'CLI Sim',       icon: '⌨',  component: NetworkSim },
]

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function NetworkTools() {
  const [tab, setTab] = useState('subnet')
  const Active = TABS.find(t => t.id === tab)?.component || SubnetCalc

  return (
    <div style={{ minHeight: '100vh', paddingTop: 80 }}>
      <style>{`
        .nt-container { max-width: 860px; margin: 0 auto; padding: 60px 24px; }
        .nt-title { font-family: var(--font-display); font-size: 48px; font-weight: 700; margin-bottom: 12px; }
        .nt-tabs { display: flex; gap: 2; margin-bottom: 32px; overflow-x: auto; padding-bottom: 4px; scrollbar-width: none; }
        .nt-tabs::-webkit-scrollbar { display: none; }
        .nt-panel { background: var(--bg2); border: 1px solid var(--border); padding: 32px; }
        .leaflet-container { font-family: var(--font-mono) !important; }
        .leaflet-popup-content-wrapper { background: var(--bg2,#111) !important; color: var(--text,#eee) !important; border: 1px solid var(--green,#00ff88) !important; border-radius: 0 !important; box-shadow: 0 0 16px color-mix(in srgb, var(--green) 20%, transparent) !important; }
        .leaflet-popup-tip { background: var(--bg2,#111) !important; }
        .leaflet-popup-content { color: var(--text,#eee) !important; font-size: 12px; }
        .leaflet-control-zoom a { background: var(--bg2,#111) !important; color: var(--green,#00ff88) !important; border-color: var(--border,#333) !important; }
        .leaflet-control-attribution { background: rgba(0,0,0,0.5) !important; color: var(--muted,#666) !important; font-size: 9px !important; }
        @media (max-width: 600px) {
          .nt-container { padding: 32px 16px; }
          .nt-title { font-size: 32px; }
          .nt-panel { padding: 18px 14px; }
        }
      `}</style>
      <div className="nt-container">

        {/* Header */}
        <div style={{ marginBottom: 48 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--cyan)', letterSpacing: 4, marginBottom: 12 }}>
            NETWORK UTILITIES
          </div>
          <h1 className="nt-title">Network Tools</h1>
          <p style={{ color: 'var(--muted)', fontSize: 15, lineHeight: 1.7 }}>
            Essential utilities for network engineers — subnet calculations, CIDR references, IP lookups and more.
          </p>
        </div>

        {/* Tabs */}
        <div className="nt-tabs">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2,
              padding: '10px 14px', whiteSpace: 'nowrap',
              background: tab === t.id ? 'var(--green)' : 'var(--bg2)',
              color: tab === t.id ? '#000' : 'var(--muted)',
              border: tab === t.id ? '1px solid var(--green)' : '1px solid var(--border)',
              cursor: 'pointer', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 5,
              flexShrink: 0,
            }}>
              <span>{t.icon}</span> {t.label.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Tool Panel */}
        <div className="nt-panel">
          <Active />
        </div>

      </div>
    </div>
  )
}
