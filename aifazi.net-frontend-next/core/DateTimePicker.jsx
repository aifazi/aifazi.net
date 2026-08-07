'use client'
import { useState, useRef, useEffect } from 'react'

const pad = n => String(n).padStart(2, '0')
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAYS   = ['Su','Mo','Tu','We','Th','Fr','Sa']
const HOURS  = Array.from({ length: 12 }, (_, i) => i + 1)
const MINS   = [0,5,10,15,20,25,30,35,40,45,50,55]
const mono   = { fontFamily: 'var(--font-mono)' }

function parseValue(value) {
  if (!value) return null
  const d = new Date(value)
  return isNaN(d) ? null : d
}

function toLocalString(d) {
  if (!d) return ''
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatDisplay(value) {
  const d = parseValue(value)
  if (!d) return ''
  const ap = d.getHours() >= 12 ? 'PM' : 'AM'
  const h  = d.getHours() % 12 || 12
  return `${MONTHS[d.getMonth()].slice(0,3)} ${d.getDate()}, ${d.getFullYear()}  ${pad(h)}:${pad(d.getMinutes())} ${ap}`
}

export default function DateTimePicker({
  value,
  onChange,
  placeholder = 'Pick date & time…',
  style = {},
  label,
  dropdownAlign = 'left',
  disabled = false,
}) {
  const ref      = useRef(null)
  const hourRef  = useRef(null)
  const minRef   = useRef(null)
  const [open, setOpen] = useState(false)

  const parsed = parseValue(value)
  const [month, setMonth] = useState(parsed ? parsed.getMonth()    : new Date().getMonth())
  const [year,  setYear]  = useState(parsed ? parsed.getFullYear() : new Date().getFullYear())
  const [selDate, setSelDate] = useState(parsed || null)
  const [hour,  setHour]  = useState(parsed ? (parsed.getHours() % 12 || 12) : 12)
  const [min,   setMin]   = useState(parsed ? parsed.getMinutes() : 0)
  const [ampm,  setAmpm]  = useState(parsed ? (parsed.getHours() >= 12 ? 'PM' : 'AM') : 'AM')
  const [prevValue, setPrevValue] = useState(value)

  if (prevValue !== value) {
    setPrevValue(value)
    if (parsed) {
      setMonth(parsed.getMonth()); setYear(parsed.getFullYear()); setSelDate(parsed)
      setHour(parsed.getHours() % 12 || 12); setMin(parsed.getMinutes())
      setAmpm(parsed.getHours() >= 12 ? 'PM' : 'AM')
    } else {
      setSelDate(null)
    }
  }

  // Close on outside click
  useEffect(() => {
    const fn = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [])

  // Scroll selected hour/min into view
  useEffect(() => {
    if (!open) return
    const hEl = hourRef.current?.querySelector('[data-sel="1"]')
    const mEl = minRef.current?.querySelector('[data-sel="1"]')
    hEl?.scrollIntoView({ block: 'nearest' })
    mEl?.scrollIntoView({ block: 'nearest' })
  }, [open])

  const emit = (date, h, m, ap) => {
    if (!date) return
    const d = new Date(date)
    let hrs = h % 12; if (ap === 'PM') hrs += 12
    d.setHours(hrs, m, 0, 0)
    onChange(toLocalString(d))
  }

  const today = new Date()
  const firstDay    = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]

  const isSel   = d => selDate && selDate.getFullYear()===year && selDate.getMonth()===month && selDate.getDate()===d
  const isToday = d => today.getFullYear()===year && today.getMonth()===month && today.getDate()===d

  const selectDay = d => {
    const nd = new Date(year, month, d)
    setSelDate(nd); emit(nd, hour, min, ampm)
  }

  const prevMonth = () => { if (month===0){setMonth(11);setYear(y=>y-1)} else setMonth(m=>m-1) }
  const nextMonth = () => { if (month===11){setMonth(0);setYear(y=>y+1)} else setMonth(m=>m+1) }

  const clear = () => { setSelDate(null); onChange(''); setOpen(false) }
  const jumpToday = () => {
    const t = new Date()
    setMonth(t.getMonth()); setYear(t.getFullYear())
    setSelDate(t); emit(t, hour, min, ampm)
  }

  const btnBase = (active) => ({
    ...mono, fontSize: 12, padding: '5px 8px', border: 'none', borderRadius: 5,
    cursor: 'pointer', minWidth: 34, textAlign: 'center', transition: 'all 0.12s',
    background: active ? 'var(--cyan)' : 'transparent',
    color:      active ? '#000' : 'var(--text)',
    fontWeight: active ? 700 : 400,
  })
  const panelEdge = dropdownAlign === 'right' ? { right: 0 } : { left: 0 }

  return (
    <div ref={ref} style={{ position: 'relative', ...style }}>
      {/* ── Trigger ── */}
      <div
        role="button" tabIndex={0}
        onClick={() => !disabled && setOpen(o => !o)}
        onKeyDown={e => !disabled && e.key === 'Enter' && setOpen(o => !o)}
        aria-disabled={disabled}
        style={{
          width: '100%', background: 'var(--bg)', borderRadius: 6, cursor: disabled ? 'not-allowed' : 'pointer',
          border: '1px solid ' + (open ? 'var(--cyan)' : 'var(--border)'),
          color: value ? 'var(--text)' : 'var(--muted)',
          padding: '10px 13px', ...mono, fontSize: 11,
          boxSizing: 'border-box', transition: 'border-color 0.15s, box-shadow 0.15s',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          boxShadow: open ? '0 0 0 2px rgba(0,212,255,0.12)' : 'none',
          userSelect: 'none',
          opacity: disabled ? 0.55 : 1,
        }}
      >
        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {formatDisplay(value) || placeholder}
        </span>
        <span style={{ color: 'var(--cyan)', fontSize: 14, flexShrink: 0 }}>📅</span>
      </div>

      {/* ── Dropdown ── */}
      {open && (
        <div className="dtp-popover" style={{
          position: 'absolute', top: 'calc(100% + 8px)', ...panelEdge, zIndex: 9999,
          background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10,
          boxShadow: '0 16px 48px rgba(0,0,0,0.65), 0 0 0 1px rgba(0,212,255,0.06)',
          display: 'flex', overflow: 'hidden', width: 'max-content', maxWidth: 'calc(100vw - 28px)',
          animation: 'dtpIn 0.18s cubic-bezier(0.16,1,0.3,1)',
        }}>
          <style>{`
            @keyframes dtpIn { from{opacity:0;transform:translateY(-6px)} to{opacity:1;transform:translateY(0)} }
            .dtp-day:hover { background: var(--bg3) !important; }
            .dtp-timeBtn:hover { background: rgba(0,212,255,0.08) !important; }
            .dtp-scroll::-webkit-scrollbar { width: 3px; }
            .dtp-scroll::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
            @media (max-width: 560px) {
              .dtp-popover { flex-direction: column !important; max-height: 72vh; overflow: auto !important; }
            }
          `}</style>

          {/* ── Calendar ── */}
          <div style={{ padding: 16, width: 216 }}>
            {/* Month nav */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
              <button type="button" onClick={prevMonth}
                style={{ background:'none', border:'none', color:'var(--cyan)', cursor:'pointer', fontSize:18, padding:'2px 8px', lineHeight:1 }}>‹</button>
              <span style={{ ...mono, fontSize:10, letterSpacing:1.5, color:'var(--text)' }}>
                {MONTHS[month]} {year}
              </span>
              <button type="button" onClick={nextMonth}
                style={{ background:'none', border:'none', color:'var(--cyan)', cursor:'pointer', fontSize:18, padding:'2px 8px', lineHeight:1 }}>›</button>
            </div>

            {/* Day headers */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', marginBottom:4 }}>
              {DAYS.map(d => (
                <div key={d} style={{ ...mono, fontSize:8, letterSpacing:1, color:'var(--muted)', textAlign:'center', padding:'2px 0' }}>{d}</div>
              ))}
            </div>

            {/* Day cells */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:2 }}>
              {cells.map((d, i) => (
                <button key={i} type="button" className="dtp-day"
                  disabled={!d}
                  onClick={() => d && selectDay(d)}
                  style={{
                    ...mono, fontSize:11, padding:'5px 2px', textAlign:'center', border:'none', borderRadius:5,
                    cursor: d ? 'pointer' : 'default',
                    background: isSel(d) ? 'var(--cyan)' : isToday(d) ? 'rgba(0,212,255,0.1)' : 'transparent',
                    color: !d ? 'transparent' : isSel(d) ? '#000' : isToday(d) ? 'var(--cyan)' : 'var(--text)',
                    fontWeight: isSel(d) || isToday(d) ? 700 : 400,
                    outline: isToday(d) && !isSel(d) ? '1px solid rgba(0,212,255,0.3)' : 'none',
                    transition: 'all 0.1s',
                  }}
                >{d || ''}</button>
              ))}
            </div>

            {/* Footer actions */}
            <div style={{ display:'flex', justifyContent:'space-between', marginTop:12, gap:6 }}>
              <button type="button" onClick={clear} style={{
                ...mono, fontSize:8, letterSpacing:1, padding:'5px 10px', borderRadius:4, cursor:'pointer',
                background:'transparent', border:'1px solid rgba(255,71,87,0.35)', color:'#ff4757',
              }}>CLEAR</button>
              <button type="button" onClick={jumpToday} style={{
                ...mono, fontSize:8, letterSpacing:1, padding:'5px 10px', borderRadius:4, cursor:'pointer',
                background:'rgba(0,212,255,0.08)', border:'1px solid rgba(0,212,255,0.3)', color:'var(--cyan)',
              }}>TODAY</button>
            </div>
          </div>

          {/* ── Divider ── */}
          <div style={{ width:1, background:'var(--border)', flexShrink:0 }} />

          {/* ── Time picker ── */}
          <div style={{ padding:'14px 12px', display:'flex', flexDirection:'column', alignItems:'center', gap:8 }}>
            <div style={{ ...mono, fontSize:7, letterSpacing:2, color:'var(--muted)' }}>TIME</div>

            <div style={{ display:'flex', gap:4, alignItems:'flex-start' }}>
              {/* Hours */}
              <div ref={hourRef} className="dtp-scroll"
                style={{ maxHeight:180, overflowY:'auto', display:'flex', flexDirection:'column', gap:2, scrollbarWidth:'thin' }}>
                {HOURS.map(h => (
                  <button key={h} type="button" data-sel={hour===h?'1':undefined}
                    className="dtp-timeBtn"
                    onClick={() => { setHour(h); emit(selDate, h, min, ampm) }}
                    style={btnBase(hour===h)}>{pad(h)}</button>
                ))}
              </div>

              <span style={{ ...mono, fontSize:16, color:'var(--muted)', padding:'4px 1px' }}>:</span>

              {/* Minutes */}
              <div ref={minRef} className="dtp-scroll"
                style={{ maxHeight:180, overflowY:'auto', display:'flex', flexDirection:'column', gap:2, scrollbarWidth:'thin' }}>
                {MINS.map(m => (
                  <button key={m} type="button" data-sel={min===m?'1':undefined}
                    className="dtp-timeBtn"
                    onClick={() => { setMin(m); emit(selDate, hour, m, ampm) }}
                    style={btnBase(min===m)}>{pad(m)}</button>
                ))}
              </div>

              {/* AM / PM */}
              <div style={{ display:'flex', flexDirection:'column', gap:4, paddingTop:2 }}>
                {['AM','PM'].map(ap => (
                  <button key={ap} type="button"
                    onClick={() => { setAmpm(ap); emit(selDate, hour, min, ap) }}
                    style={{
                      ...mono, fontSize:9, padding:'6px 7px', borderRadius:5, cursor:'pointer',
                      background: ampm===ap ? 'rgba(0,212,255,0.12)' : 'transparent',
                      color:      ampm===ap ? 'var(--cyan)' : 'var(--muted)',
                      fontWeight: ampm===ap ? 700 : 400,
                      border:     ampm===ap ? '1px solid rgba(0,212,255,0.35)' : '1px solid transparent',
                      transition: 'all 0.12s',
                    }}>{ap}</button>
                ))}
              </div>
            </div>

            {/* Selected time display */}
            {selDate && (
              <div style={{ ...mono, fontSize:14, color:'var(--cyan)', marginTop:4, letterSpacing:1, fontWeight:700 }}>
                {pad(hour)}:{pad(min)} {ampm}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
