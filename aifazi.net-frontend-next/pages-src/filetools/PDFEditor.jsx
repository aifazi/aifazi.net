'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Checkbox, Slider } from '../../core/ui.jsx'

const RS = 1.5 // render scale for backend page images
const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3]
const COLORS = ['#000000','#ffffff','#ef4444','#f97316','#eab308',
  '#22c55e','#3b82f6','#8b5cf6','#ec4899','#FFFF00','#00d4ff','#ff4500']
const TOOL_GROUPS = [
  {
    label: 'NAVIGATE', tools: [
      { id:'hand',   icon:'✋', label:'Hand Tool' },
      { id:'select', icon:'↖',  label:'Select'    },
    ]
  },
  {
    label: 'INSERT', tools: [
      { id:'text',  icon:'T',  label:'Add Text'  },
      { id:'image', icon:'🖼', label:'Add Image' },
      { id:'note',  icon:'📌', label:'Note'      },
    ]
  },
  {
    label: 'ANNOTATE', tools: [
      { id:'highlight',    icon:'▬',  label:'Highlight'     },
      { id:'underline',    icon:'U̲',  label:'Underline'     },
      { id:'strikethrough',icon:'S̶', label:'Strikethrough' },
    ]
  },
  {
    label: 'DRAW', tools: [
      { id:'freehand', icon:'✏', label:'Draw'      },
      { id:'rect',     icon:'▭',  label:'Rectangle', hasMenu: true },
      { id:'line',     icon:'╱',  label:'Line'      },
      { id:'arrow',    icon:'↗',  label:'Arrow'     },
    ]
  },
]
// Flat list for backwards compat
const TOOLS = TOOL_GROUPS.flatMap(g => g.tools)

// Shape submenu options (only shapes with full draw+export support)
const SHAPE_TOOLS = [
  { id:'rect',     icon:'▭', label:'Rectangle' },
  { id:'circle',   icon:'○', label:'Ellipse'   },
  { id:'line',     icon:'╱', label:'Line'      },
  { id:'arrow',    icon:'↗', label:'Arrow'     },
]
const C = { bg:'#0d0d1a', bg2:'#131328', bg3:'#1a1a35',
  border:'rgba(255,255,255,0.08)', text:'#e4e4f0', muted:'#6060a0',
  green:'#00ff88', cyan:'#22d3ee', accent:'#7c3aed', red:'#f87171',
  mono:"'JetBrains Mono','Fira Code',monospace" }
const toRgba = (hex='#000000', a=1) => {
  const h = hex.replace('#','').padEnd(6,'0')
  return `rgba(${parseInt(h.slice(0,2),16)},${parseInt(h.slice(2,4),16)},${parseInt(h.slice(4,6),16)},${a})`
}

/* ── Upload phase ───────────────────────────────────────────────── */
function UploadPhase({ onFile, loading, error }) {
  const [over, setOver] = useState(false)
  const inp = useRef()
  const handle = f => { if (f && f.type === 'application/pdf') onFile(f) }
  const FEATURES = [
    { icon:'T',   label:'Add Text',       desc:'Place text anywhere on any page' },
    { icon:'✏',   label:'Draw',           desc:'Freehand pen, shapes, arrows' },
    { icon:'▬',   label:'Highlight',      desc:'Highlight, underline, strikethrough' },
    { icon:'📌',  label:'Sticky Notes',   desc:'Anchored comments on any page' },
    { icon:'🖼',  label:'Insert Images',  desc:'Drop images onto any page' },
    { icon:'🔗',  label:'Links',          desc:'Web links and internal anchors' },
    { icon:'🔍',  label:'Search',         desc:'Find & replace text in PDF' },
    { icon:'📤',  label:'Export PDF',     desc:'Download edited PDF instantly' },
  ]
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
      minHeight:'70vh', gap:28, padding:'40px 24px', background:C.bg }}>

      {/* Header */}
      <div style={{ textAlign:'center' }}>
        <div style={{ fontFamily:C.mono, fontSize:9, letterSpacing:4, color:C.cyan, marginBottom:10,
          display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
          <span style={{ display:'inline-block', width:6, height:6, background:C.green, borderRadius:'50%',
            boxShadow:`0 0 8px ${C.green}` }} />
          PDF EDITOR — FULL CANVAS
        </div>
        <h2 style={{ fontFamily:C.mono, fontSize:32, fontWeight:800, color:C.text, margin:'0 0 8px', letterSpacing:-1 }}>
          Open a PDF to Edit
        </h2>
        <p style={{ fontFamily:C.mono, fontSize:11, color:C.muted, margin:0 }}>
          Annotate, draw, add text, insert images and export — all in your browser.
        </p>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={e=>{e.preventDefault();setOver(true)}}
        onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget))setOver(false)}}
        onDrop={e=>{e.preventDefault();setOver(false);handle(e.dataTransfer.files[0])}}
        onClick={()=>!loading&&inp.current.click()}
        style={{ width:'100%', maxWidth:520,
          border:`2px dashed ${over?C.green:loading?C.cyan:C.border}`,
          borderRadius:16, padding:'52px 40px', textAlign:'center',
          cursor:loading?'wait':'pointer',
          background:over?'color-mix(in srgb, var(--green) 5%, transparent)':loading?'rgba(34,211,238,0.03)':'rgba(255,255,255,0.015)',
          transition:'all .22s cubic-bezier(.34,1.56,.64,1)',
          boxShadow:over?`0 0 40px color-mix(in srgb, var(--green) 14%, transparent), inset 0 0 40px color-mix(in srgb, var(--green) 3%, transparent)`:undefined,
          transform:over?'scale(1.01)':'scale(1)',
        }}>
        <input ref={inp} type="file" accept=".pdf" style={{display:'none'}}
          onChange={e=>handle(e.target.files[0])} />
        <div style={{ fontSize:52, marginBottom:16, filter:over?'drop-shadow(0 0 12px #00ff88)':undefined,
          transition:'filter .2s' }}>{loading ? '⏳' : over ? '📂' : '📄'}</div>
        <div style={{ fontFamily:C.mono, fontSize:14, fontWeight:700,
          color:over?C.green:loading?C.cyan:C.text, marginBottom:6, transition:'color .2s' }}>
          {loading ? 'Opening PDF…' : over ? 'Release to open' : 'Drop PDF here'}
        </div>
        <div style={{ fontFamily:C.mono, fontSize:10, color:C.muted }}>
          {loading ? 'Rendering pages…' : 'or click to browse · .pdf files only'}
        </div>
        {loading && (
          <div style={{ marginTop:16, height:2, background:C.bg3, borderRadius:2, overflow:'hidden', maxWidth:200, margin:'16px auto 0' }}>
            <div style={{ height:'100%', background:`linear-gradient(90deg,${C.green},${C.cyan})`,
              animation:'pdfLoadBar 1.4s ease-in-out infinite', borderRadius:2 }} />
          </div>
        )}
      </div>

      {error && (
        <div style={{ fontFamily:C.mono, fontSize:11, color:C.red, padding:'10px 18px',
          background:'rgba(248,113,113,0.08)', border:`1px solid ${C.red}55`, borderRadius:8,
          display:'flex', alignItems:'center', gap:8 }}>
          <span>⚠</span> {error}
        </div>
      )}

      {/* Feature grid */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(130px, 1fr))',
        gap:10, width:'100%', maxWidth:680 }}>
        {FEATURES.map(f => (
          <div key={f.label} style={{ background:C.bg2, border:`1px solid ${C.border}`,
            borderRadius:8, padding:'14px 12px', textAlign:'center',
            transition:'border-color .18s, background .18s' }}
            onMouseEnter={e=>{e.currentTarget.style.borderColor=C.cyan+'55';e.currentTarget.style.background=C.bg3}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.background=C.bg2}}>
            <div style={{ fontSize:22, marginBottom:8 }}>{f.icon}</div>
            <div style={{ fontFamily:C.mono, fontSize:9, letterSpacing:1, color:C.text, marginBottom:4 }}>{f.label.toUpperCase()}</div>
            <div style={{ fontFamily:C.mono, fontSize:8, color:C.muted, lineHeight:1.5 }}>{f.desc}</div>
          </div>
        ))}
      </div>

      <style>{`@keyframes pdfLoadBar{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}`}</style>
    </div>
  )
}

/* ── Toolbar ────────────────────────────────────────────────────── */
function Toolbar({ tool, setTool, color, setColor, opacity, setOpacity,
  lineWidth, setLineWidth, fontSize, setFontSize,
  onUndo, canUndo, onRedo, canRedo, zoomIdx, setZoomIdx,
  onExport, exporting, opsCount, onClose }) {

  const [shapeMenuOpen, setShapeMenuOpen] = useState(false)

  const needsColor = !['select','hand','note'].includes(tool)
  const needsSize  = ['freehand','rect','circle','line','arrow'].includes(tool)
  const needsFont  = ['text'].includes(tool)
  const needsOpac  = ['highlight','underline','strikethrough','rect','circle'].includes(tool)

  const Btn = ({ t, active }) => (
    <button onClick={() => setTool(t.id)} title={t.label}
      style={{ height: 32, minWidth: 32, padding: '0 7px', border: 'none', borderRadius: 5, cursor: 'pointer',
        fontSize: 13, background: active ? C.accent : 'transparent',
        color: active ? '#fff' : C.muted, transition: 'all .15s',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, flexShrink: 0,
        boxShadow: active ? `0 0 10px ${C.accent}55` : 'none' }}>
      <span>{t.icon}</span>
      <span style={{ fontFamily: C.mono, fontSize: 8, letterSpacing: 0.5 }}>{t.label.toUpperCase()}</span>
    </button>
  )

  return (
    <div style={{ background: C.bg2, borderBottom: `1px solid ${C.border}`, userSelect: 'none' }}>
      {/* ── Group row ── */}
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 0, overflowX: 'auto',
        padding: '6px 10px', flexWrap: 'nowrap' }}>

        {TOOL_GROUPS.map((group, gi) => (
          <div key={gi} style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch',
            borderRight: `1px solid ${C.border}`, paddingRight: 8, marginRight: 8, flexShrink: 0 }}>
            {/* group label */}
            <div style={{ fontFamily: C.mono, fontSize: 6, letterSpacing: 2, color: C.muted,
              textAlign: 'center', marginBottom: 4 }}>{group.label}</div>
            {/* group buttons */}
            <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
              {group.tools.map(t => {
                const active = tool === t.id || (t.id === 'rect' && SHAPE_TOOLS.some(s=>s.id===tool && s.id!=='rect') ? false : tool===t.id)

                /* Shape dropdown */
                if (t.id === 'rect' && t.hasMenu) return (
                  <div key={t.id} style={{ position: 'relative' }}>
                    <div style={{ display: 'flex', border: `1px solid ${SHAPE_TOOLS.some(s=>s.id===tool)?C.accent:C.border}`, borderRadius: 5, overflow: 'hidden' }}>
                      <button onClick={() => setTool(tool && SHAPE_TOOLS.some(s=>s.id===tool) ? tool : 'rect')}
                        title="Shape" style={{ height: 30, minWidth: 28, padding: '0 6px', border: 'none', cursor: 'pointer',
                          background: SHAPE_TOOLS.some(s=>s.id===tool) ? C.accent+'33' : 'transparent',
                          color: SHAPE_TOOLS.some(s=>s.id===tool) ? C.accent : C.muted, fontSize: 13,
                          display:'flex', alignItems:'center', gap:3 }}>
                        <span>{SHAPE_TOOLS.find(s=>s.id===tool)?.icon || '▭'}</span>
                        <span style={{ fontFamily:C.mono, fontSize:7 }}>{SHAPE_TOOLS.find(s=>s.id===tool)?.label.toUpperCase() || 'SHAPES'}</span>
                      </button>
                      <button onClick={() => setShapeMenuOpen(v=>!v)}
                        style={{ width:16, border:'none', borderLeft:`1px solid ${C.border}`, background:'transparent',
                          color:C.muted, cursor:'pointer', fontSize:8, padding:0 }}>▾</button>
                    </div>
                    {shapeMenuOpen && (
                      <div style={{ position:'absolute', top:'100%', left:0, zIndex:999, marginTop:2,
                        background:C.bg3, border:`1px solid ${C.border}`, borderRadius:6, overflow:'hidden', minWidth:110,
                        boxShadow:'0 8px 24px rgba(0,0,0,0.5)' }}>
                        {SHAPE_TOOLS.map(s=>(
                          <button key={s.id} onClick={()=>{setTool(s.id);setShapeMenuOpen(false)}}
                            style={{ display:'flex', alignItems:'center', gap:8, width:'100%', padding:'8px 12px',
                              border:'none', background: tool===s.id?C.accent+'22':'transparent',
                              color: tool===s.id?C.accent:C.text, cursor:'pointer', fontFamily:C.mono, fontSize:10,
                              textAlign:'left' }}>
                            <span style={{fontSize:13}}>{s.icon}</span>{s.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )

                return <Btn key={t.id} t={t} active={tool === t.id} />
              })}
            </div>
          </div>
        ))}

        {/* ── Right: options + actions ── */}
        <div style={{ marginLeft:'auto', display:'flex', gap:6, alignItems:'flex-end', flexShrink:0, paddingBottom:2 }}>
          {/* Contextual options */}
          <div style={{ display:'flex', gap:6, alignItems:'center' }}>
            {needsColor && (
              <div style={{ display:'flex', gap:3, alignItems:'center', padding:'4px 6px',
                background:C.bg3, borderRadius:6, border:`1px solid ${C.border}` }}>
                {COLORS.map(c=>(
                  <button key={c} onClick={()=>setColor(c)}
                    style={{ width:14, height:14, borderRadius:'50%', background:c,
                      border:`2px solid ${color===c?'#fff':C.border}`, cursor:'pointer', flexShrink:0,
                      transform: color===c?'scale(1.3)':'scale(1)', transition:'transform .1s' }} />
                ))}
                <input type="color" value={color} onChange={e=>setColor(e.target.value)}
                  style={{ width:18, height:18, border:'none', background:'none', cursor:'pointer', padding:0 }} />
              </div>
            )}
            {needsOpac && (
              <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                <span style={{ fontFamily:C.mono, fontSize:8, color:C.muted }}>OPACITY</span>
                <Slider min={0.1} max={1} step={0.05} value={opacity} onChange={setOpacity}
                  style={{ width:60 }} />
                <span style={{ fontFamily:C.mono, fontSize:9, color:C.text, width:28 }}>{Math.round(opacity*100)}%</span>
              </div>
            )}
            {needsSize && (
              <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                <span style={{ fontFamily:C.mono, fontSize:8, color:C.muted }}>SIZE</span>
                <Slider min={1} max={20} value={lineWidth} onChange={setLineWidth}
                  style={{ width:60 }} />
                <span style={{ fontFamily:C.mono, fontSize:9, color:C.text, width:16 }}>{lineWidth}</span>
              </div>
            )}
            {needsFont && (
              <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                <span style={{ fontFamily:C.mono, fontSize:8, color:C.muted }}>SIZE</span>
                <input type="number" min={8} max={96} value={fontSize} onChange={e=>setFontSize(+e.target.value)}
                  style={{ width:46, fontFamily:C.mono, fontSize:11, background:C.bg3, border:`1px solid ${C.border}`,
                    color:C.text, padding:'3px 6px', borderRadius:4, outline:'none' }} />
              </div>
            )}
          </div>

          <div style={{ width:1, height:28, background:C.border }} />

          {/* Undo/Redo */}
          <button onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)"
            style={{ padding:'5px 10px', fontFamily:C.mono, fontSize:9, background:C.bg3,
              border:`1px solid ${C.border}`, color:canUndo?C.text:C.muted, cursor:canUndo?'pointer':'not-allowed', borderRadius:6 }}>↩ UNDO</button>
          <button onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl+Y)"
            style={{ padding:'5px 10px', fontFamily:C.mono, fontSize:9, background:C.bg3,
              border:`1px solid ${C.border}`, color:canRedo?C.text:C.muted, cursor:canRedo?'pointer':'not-allowed', borderRadius:6 }}>↪ REDO</button>

          {/* Zoom */}
          <div style={{ display:'flex', alignItems:'center', gap:2, background:C.bg3,
            border:`1px solid ${C.border}`, borderRadius:6, padding:'2px' }}>
            <button onClick={()=>setZoomIdx(i=>Math.max(0,i-1))} disabled={zoomIdx===0}
              style={{ width:24, height:24, border:'none', background:'none', color:C.text, cursor:'pointer', fontSize:14 }}>−</button>
            <span style={{ fontFamily:C.mono, fontSize:9, color:C.cyan, minWidth:38, textAlign:'center' }}>
              {Math.round(ZOOM_STEPS[zoomIdx]*100)}%
            </span>
            <button onClick={()=>setZoomIdx(i=>Math.min(ZOOM_STEPS.length-1,i+1))} disabled={zoomIdx===ZOOM_STEPS.length-1}
              style={{ width:24, height:24, border:'none', background:'none', color:C.text, cursor:'pointer', fontSize:14 }}>+</button>
          </div>

          {/* Export */}
          <button onClick={onExport} disabled={exporting}
            style={{ padding:'6px 14px', fontFamily:C.mono, fontSize:9, letterSpacing:1, fontWeight:700,
              background:exporting?C.bg3:'color-mix(in srgb, var(--green) 12%, transparent)', border:`1px solid ${exporting?C.border:'color-mix(in srgb, var(--green) 50%, transparent)'}`,
              color:exporting?C.muted:C.green, cursor:exporting?'not-allowed':'pointer', borderRadius:6,
              display:'flex', alignItems:'center', gap:6, whiteSpace:'nowrap' }}>
            {exporting ? '⏳ SAVING…' : `📤 EXPORT PDF${opsCount?' ('+opsCount+')':''}`}
          </button>
          <button onClick={onClose} title="Close"
            style={{ padding:'6px 10px', fontFamily:C.mono, fontSize:10, background:'transparent',
              border:`1px solid ${C.border}`, color:C.muted, cursor:'pointer', borderRadius:6 }}>✕</button>
        </div>
      </div>
    </div>
  )
}

/* ── Page sidebar ───────────────────────────────────────────────── */
function PageSidebar({ session, currentPage, setCurrentPage, onDelete, onRotate }) {
  return (
    <div style={{ width:130, flexShrink:0, background:C.bg2, borderRight:`1px solid ${C.border}`,
      overflowY:'auto', display:'flex', flexDirection:'column', gap:4, padding:8 }}>
      {Array.from({length:session.page_count}).map((_,i)=>(
        <div key={i}
          onClick={()=>setCurrentPage(i)}
          style={{ cursor:'pointer', border:`2px solid ${i===currentPage?C.accent:C.border}`,
            borderRadius:6, overflow:'hidden', background:C.bg3, position:'relative',
            transition:'border-color .15s', flexShrink:0 }}>
          <img src={`/api/pdf-editor/thumb/${session.session_id}/${i}`}
            alt={`Page ${i+1}`}
            style={{ width:'100%', display:'block' }} />
          <div style={{ position:'absolute', bottom:0, left:0, right:0, background:'rgba(0,0,0,0.7)',
            fontFamily:C.mono, fontSize:8, color: i===currentPage?C.accent:C.muted,
            textAlign:'center', padding:'3px 0', letterSpacing:1 }}>
            {i+1}
          </div>
          {i===currentPage && (
            <div style={{ position:'absolute', top:3, right:3, display:'flex', flexDirection:'column', gap:2 }}>
              <button onClick={e=>{e.stopPropagation();onRotate(i)}} title="Rotate 90°"
                style={{ width:20, height:20, border:'none', borderRadius:3, background:'rgba(34,211,238,0.8)',
                  color:'#000', cursor:'pointer', fontSize:10, display:'flex', alignItems:'center', justifyContent:'center' }}>↻</button>
              {session.page_count > 1 && (
                <button onClick={e=>{e.stopPropagation();onDelete(i)}} title="Delete page"
                  style={{ width:20, height:20, border:'none', borderRadius:3, background:'rgba(248,113,113,0.8)',
                    color:'#fff', cursor:'pointer', fontSize:12, display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

/* ── Search & Replace panel ─────────────────────────────────────── */
function SearchPanel({ onClose, onSearch, onReplace, onReplaceAll, results, current }) {
  const [find, setFind]         = useState('')
  const [replace, setReplace]   = useState('')
  const [matchCase, setMatchCase] = useState(false)
  return (
    <div style={{ position:'absolute', top:8, right:8, zIndex:200, width:320,
      background:C.bg2, border:`1px solid ${C.border}`, borderRadius:10,
      boxShadow:'0 12px 40px rgba(0,0,0,0.6)', overflow:'hidden' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'10px 14px', borderBottom:`1px solid ${C.border}`, background:C.bg3 }}>
        <span style={{ fontFamily:C.mono, fontSize:9, letterSpacing:3, color:C.cyan }}>SEARCH & REPLACE</span>
        <button onClick={onClose} style={{ background:'none', border:'none', color:C.muted, cursor:'pointer', fontSize:14 }}>✕</button>
      </div>
      <div style={{ padding:14, display:'flex', flexDirection:'column', gap:10 }}>
        <div>
          <label style={{ fontFamily:C.mono, fontSize:8, letterSpacing:2, color:C.muted, display:'block', marginBottom:5 }}>FIND</label>
          <div style={{ display:'flex', gap:6 }}>
            <input value={find} onChange={e=>setFind(e.target.value)}
              placeholder="Search text…"
              onKeyDown={e=>e.key==='Enter'&&onSearch(find,matchCase)}
              style={{ flex:1, background:C.bg3, border:`1px solid ${C.border}`, color:C.text,
                fontFamily:C.mono, fontSize:11, padding:'7px 10px', borderRadius:5, outline:'none' }} />
            <button onClick={()=>onSearch(find,matchCase)}
              style={{ padding:'7px 12px', background:C.accent+'22', border:`1px solid ${C.accent}55`,
                color:C.accent, fontFamily:C.mono, fontSize:9, cursor:'pointer', borderRadius:5 }}>GO</button>
          </div>
        </div>
        <div>
          <label style={{ fontFamily:C.mono, fontSize:8, letterSpacing:2, color:C.muted, display:'block', marginBottom:5 }}>REPLACE WITH</label>
          <input value={replace} onChange={e=>setReplace(e.target.value)}
            placeholder="Replacement text…"
            style={{ width:'100%', boxSizing:'border-box', background:C.bg3, border:`1px solid ${C.border}`, color:C.text,
              fontFamily:C.mono, fontSize:11, padding:'7px 10px', borderRadius:5, outline:'none' }} />
        </div>
        <Checkbox checked={matchCase} onChange={setMatchCase} label="Match case"
          style={{ fontSize:9, color:C.muted, padding:'7px 10px' }} />
        {results > 0 && (
          <div style={{ fontFamily:C.mono, fontSize:9, color:C.cyan }}>
            {current+1} / {results} match{results!==1?'es':''}
          </div>
        )}
        <div style={{ display:'flex', gap:6 }}>
          <button onClick={()=>onReplace(find,replace,matchCase)}
            style={{ flex:1, padding:'8px', background:C.bg3, border:`1px solid ${C.border}`,
              color:C.text, fontFamily:C.mono, fontSize:9, cursor:'pointer', borderRadius:5 }}>Replace</button>
          <button onClick={()=>onReplaceAll(find,replace,matchCase)}
            style={{ flex:1, padding:'8px', background:'color-mix(in srgb, var(--green) 10%, transparent)', border:`1px solid color-mix(in srgb, var(--green) 40%, transparent)`,
              color:C.green, fontFamily:C.mono, fontSize:9, cursor:'pointer', borderRadius:5 }}>Replace All</button>
        </div>
      </div>
    </div>
  )
}

/* ── Link dialog ────────────────────────────────────────────────── */
function LinkDialog({ pos, onConfirm, onClose }) {
  const [url, setUrl]     = useState('https://')
  const [label, setLabel] = useState('')
  return (
    <div style={{ position:'absolute', left:pos.x, top:pos.y, zIndex:300, width:280,
      background:C.bg2, border:`1px solid ${C.cyan}44`, borderRadius:8,
      boxShadow:'0 8px 32px rgba(0,0,0,0.6)', padding:14 }}>
      <div style={{ fontFamily:C.mono, fontSize:8, letterSpacing:3, color:C.cyan, marginBottom:10 }}>ADD LINK</div>
      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        <input autoFocus value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://..."
          style={{ background:C.bg3, border:`1px solid ${C.border}`, color:C.text,
            fontFamily:C.mono, fontSize:11, padding:'7px 10px', borderRadius:5, outline:'none' }} />
        <input value={label} onChange={e=>setLabel(e.target.value)} placeholder="Label (optional)"
          style={{ background:C.bg3, border:`1px solid ${C.border}`, color:C.text,
            fontFamily:C.mono, fontSize:11, padding:'7px 10px', borderRadius:5, outline:'none' }} />
        <div style={{ display:'flex', gap:6 }}>
          <button onClick={()=>onConfirm(url,label)} style={{ flex:1, padding:'8px', background:'color-mix(in srgb, var(--green) 10%, transparent)',
            border:`1px solid color-mix(in srgb, var(--green) 40%, transparent)`, color:C.green, fontFamily:C.mono, fontSize:9, cursor:'pointer', borderRadius:5 }}>
            ADD LINK
          </button>
          <button onClick={onClose} style={{ padding:'8px 12px', background:'transparent',
            border:`1px solid ${C.border}`, color:C.muted, fontFamily:C.mono, fontSize:9, cursor:'pointer', borderRadius:5 }}>
            CANCEL
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Attachment dialog ──────────────────────────────────────────── */
function AttachmentMarker({ op, zoom, RS }) {
  const x = op.x * RS * zoom, y = op.y * RS * zoom
  return (
    <div title={op.filename || 'Attachment'} style={{ position:'absolute', left:x-10, top:y-10,
      width:20, height:20, background:'color-mix(in srgb, var(--cyan) 15%, transparent)', border:`1px solid ${C.cyan}`,
      borderRadius:4, display:'flex', alignItems:'center', justifyContent:'center',
      fontSize:12, cursor:'pointer', zIndex:10 }}>📎</div>
  )
}

/* ── Main PDFEditor component ───────────────────────────────────── */
export default function PDFEditor() {
  // ── Phase / session ──
  const [phase, setPhase]       = useState('upload') // upload | editor
  const [session, setSession]   = useState(null)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  // ── Page / zoom ──
  const [currentPage, setCurrentPageRaw] = useState(0)
  const [zoomIdx, setZoomIdx]   = useState(2) // index into ZOOM_STEPS (default 1.0)
  // ── Tools / style ──
  const [tool, setTool]         = useState('select')
  const [color, setColor]       = useState('#000000')
  const [opacity, setOpacity]   = useState(0.45)
  const [lineWidth, setLineWidth] = useState(2)
  const [fontSize, setFontSize] = useState(16)
  // ── Link dialog (web links) ──
  const [linkPos, setLinkPos]   = useState(null)
  const [linkPdf, setLinkPdf]   = useState(null)
  // ── Pan (hand tool) ──
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart]   = useState(null)
  const canvasWrapRef = useRef()
  // ── Operations (undo/redo) ──
  const [ops, setOps]           = useState([])    // committed
  const [redoStack, setRedoStack] = useState([])
  // ── Drawing state ──
  const [isDrawing, setIsDrawing] = useState(false)
  const [drawStart, setDrawStart] = useState(null)   // canvas px {x,y}
  const [livePoints, setLivePoints] = useState([])   // freehand points
  // ── Text input overlay ──
  const [textPos, setTextPos]   = useState(null)   // {canvasX, canvasY, pdfX, pdfY}
  const [pendingText, setPendingText] = useState('')
  // ── Export / status ──
  const [exporting, setExporting] = useState(false)
  const [status, setStatus]     = useState('')
  // ── Refs ──
  const canvasRef  = useRef()
  const imgRef     = useRef()
  const imgInputRef = useRef()  // for image tool
  const zoom = ZOOM_STEPS[zoomIdx]
  const page = session?.pages?.[currentPage] || {width:612, height:792}

  // ── Derived ──
  const canvasW = Math.round(page.width  * RS)
  const canvasH = Math.round(page.height * RS)

  const setCurrentPage = useCallback(n => {
    setCurrentPageRaw(n)
    setTextPos(null)
    setPendingText('')
  }, [])

  // Convert canvas-internal pixels → PDF points
  const toPdf = (cx, cy) => ({ x: cx / RS, y: cy / RS })
  // Convert PDF points → canvas-internal pixels
  const toCanvas = (px, py) => ({ x: px * RS, y: py * RS })

  // Get canvas-internal coords from mouse event
  const getCoord = useCallback(e => {
    const canvas = canvasRef.current
    if (!canvas) return {x:0,y:0}
    const rect = canvas.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left) * (canvas.width  / rect.width),
      y: (e.clientY - rect.top)  * (canvas.height / rect.height),
    }
  }, [])

  // Add operation, clear redo
  const addOp = useCallback(op => {
    setOps(prev => [...prev, op])
    setRedoStack([])
  }, [])

  const undo = useCallback(() => {
    setOps(prev => { if (!prev.length) return prev; setRedoStack(r=>[...r, prev[prev.length-1]]); return prev.slice(0,-1) })
  }, [])
  const redo = useCallback(() => {
    setRedoStack(prev => { if (!prev.length) return prev; const op=prev[prev.length-1]; setOps(o=>[...o,op]); return prev.slice(0,-1) })
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = e => {
      if ((e.ctrlKey||e.metaKey) && e.key==='z' && !e.shiftKey) { e.preventDefault(); undo() }
      if ((e.ctrlKey||e.metaKey) && (e.key==='y' || (e.key==='z'&&e.shiftKey))) { e.preventDefault(); redo() }
      if (e.key === 'Escape') { setTextPos(null); setPendingText('') }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [undo, redo])

  /* ── Canvas draw / redraw ─────────────────────────────────────── */
  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const pageOps = ops.filter(o => o.page === currentPage && o.type !== 'delete_page' && o.type !== 'rotate_page')
    pageOps.forEach(op => {
      const {x:cx, y:cy} = toCanvas(op.x, op.y)
      const cw = op.width  * RS
      const ch = op.height * RS
      ctx.save()
      if (op.type === 'add_text') {
        ctx.font = `${op.font_size * RS * 0.67}px sans-serif`
        ctx.fillStyle = op.color || '#000'
        ctx.fillText(op.text, cx, cy)
      } else if (op.type === 'add_highlight') {
        ctx.fillStyle = toRgba(op.color || '#FFFF00', op.opacity ?? 0.45)
        ctx.fillRect(cx, cy, cw, ch)
      } else if (op.type === 'add_rect') {
        ctx.strokeStyle = op.color; ctx.lineWidth = op.line_width * RS * 0.5
        if (op.fill) { ctx.fillStyle = toRgba(op.fill, 0.25); ctx.fillRect(cx,cy,cw,ch) }
        ctx.strokeRect(cx, cy, cw, ch)
      } else if (op.type === 'add_circle') {
        ctx.strokeStyle = op.color; ctx.lineWidth = op.line_width * RS * 0.5
        ctx.beginPath(); ctx.ellipse(cx+cw/2, cy+ch/2, cw/2, ch/2, 0, 0, Math.PI*2)
        if (op.fill) { ctx.fillStyle = toRgba(op.fill,0.25); ctx.fill() }
        ctx.stroke()
      } else if (op.type === 'add_line' && op.points?.length >= 2) {
        ctx.strokeStyle = op.color; ctx.lineWidth = op.line_width * RS * 0.5
        const p0 = toCanvas(op.points[0][0], op.points[0][1])
        const p1 = toCanvas(op.points[1][0], op.points[1][1])
        ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke()
      } else if (op.type === 'add_freehand' && op.points?.length >= 2) {
        ctx.strokeStyle = op.color; ctx.lineWidth = op.line_width * RS * 0.5
        ctx.lineJoin = 'round'; ctx.lineCap = 'round'
        ctx.beginPath()
        op.points.forEach(([px,py], i) => {
          const c = toCanvas(px, py)
          i === 0 ? ctx.moveTo(c.x,c.y) : ctx.lineTo(c.x,c.y)
        })
        ctx.stroke()
      } else if (op.type === 'add_underline') {
        ctx.strokeStyle = op.color; ctx.lineWidth = 1.5
        ctx.beginPath(); ctx.moveTo(cx, cy + ch); ctx.lineTo(cx + cw, cy + ch); ctx.stroke()
        ctx.fillStyle = toRgba(op.color, 0.15)
        ctx.fillRect(cx, cy, cw, ch)
      } else if (op.type === 'add_strikethrough') {
        ctx.strokeStyle = op.color; ctx.lineWidth = 1.5
        const midY = cy + ch / 2
        ctx.beginPath(); ctx.moveTo(cx, midY); ctx.lineTo(cx + cw, midY); ctx.stroke()
        ctx.fillStyle = toRgba(op.color, 0.1)
        ctx.fillRect(cx, cy, cw, ch)
      } else if (op.type === 'add_arrow' && op.points?.length >= 2) {
        const p0 = toCanvas(op.points[0][0], op.points[0][1])
        const p1 = toCanvas(op.points[1][0], op.points[1][1])
        ctx.strokeStyle = op.color; ctx.fillStyle = op.color; ctx.lineWidth = op.line_width * RS * 0.5
        ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke()
        // arrowhead
        const angle = Math.atan2(p1.y - p0.y, p1.x - p0.x)
        const hw = 10
        ctx.beginPath()
        ctx.moveTo(p1.x, p1.y)
        ctx.lineTo(p1.x - hw * Math.cos(angle - 0.4), p1.y - hw * Math.sin(angle - 0.4))
        ctx.lineTo(p1.x - hw * Math.cos(angle + 0.4), p1.y - hw * Math.sin(angle + 0.4))
        ctx.closePath(); ctx.fill()
      } else if (op.type === 'add_weblink' || op.type === 'add_link') {
        ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 1
        ctx.setLineDash([4, 3])
        ctx.strokeRect(cx, cy, cw, ch)
        ctx.setLineDash([])
        ctx.fillStyle = 'rgba(59,130,246,0.08)'; ctx.fillRect(cx, cy, cw, ch)
        ctx.fillStyle = '#3b82f6'; ctx.font = `${9 * RS * 0.5}px monospace`
        ctx.fillText('🔗 ' + (op.url || '').slice(0, 24), cx + 2, cy + ch - 4)
        ctx.font = `bold ${18 * RS * 0.5}px sans-serif`
        ctx.fillText('📌', cx, cy)
        if (op.content) {
          ctx.font = `${11 * RS * 0.5}px sans-serif`
          ctx.fillStyle = '#fff'
          ctx.fillRect(cx+18, cy-12, Math.min(op.content.length*7,200), 18)
          ctx.fillStyle = '#333'; ctx.fillText(op.content.slice(0,30), cx+20, cy)
        }
      }
      ctx.restore()
    })
  }, [ops, currentPage])

  useEffect(() => { redrawCanvas() }, [redrawCanvas])
  // resize canvas when page/zoom changes
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    canvas.width = canvasW; canvas.height = canvasH
    redrawCanvas()
  }, [canvasW, canvasH, redrawCanvas])

  /* ── Mouse event handlers ─────────────────────────────────────── */
  const toRgba2 = (hex,a) => toRgba(hex,a) // alias
  const onMouseDown = useCallback(e => {
    if (e.button !== 0) return
    const {x,y} = getCoord(e)
    if (tool === 'hand') {
      setIsPanning(true); setPanStart({ x: e.clientX, y: e.clientY,
        scrollLeft: canvasWrapRef.current?.scrollLeft || 0,
        scrollTop:  canvasWrapRef.current?.scrollTop  || 0 })
      return
    }
    if (tool === 'text') { setTextPos({canvasX:x, canvasY:y, ...toPdf(x,y)}); return }
    if (tool === 'note') {
      const note = window.prompt('Enter note text:')
      if (note) addOp({type:'add_note', page:currentPage, ...toPdf(x,y), content:note})
      return
    }
    if (tool === 'image') { imgInputRef.current?.click(); return }
    setIsDrawing(true); setDrawStart({x,y}); setLivePoints([[x/RS, y/RS]])
  }, [tool, currentPage, getCoord, addOp])

  const onMouseMove = useCallback(e => {
    // Hand panning
    if (isPanning && panStart && canvasWrapRef.current) {
      canvasWrapRef.current.scrollLeft = panStart.scrollLeft - (e.clientX - panStart.x)
      canvasWrapRef.current.scrollTop  = panStart.scrollTop  - (e.clientY - panStart.y)
      return
    }
    if (!isDrawing || !drawStart) return
    const {x,y} = getCoord(e)
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d')
    redrawCanvas()
    ctx.save()
    ctx.strokeStyle = color; ctx.fillStyle = toRgba(color, opacity); ctx.lineWidth = lineWidth * RS * 0.5
    ctx.lineJoin='round'; ctx.lineCap='round'
    if (tool === 'freehand') {
      setLivePoints(prev => [...prev, [x/RS, y/RS]])
      const pts = [...livePoints, [x/RS,y/RS]]
      ctx.beginPath(); pts.forEach(([px,py],i)=>{ const c=toCanvas(px,py); i===0?ctx.moveTo(c.x,c.y):ctx.lineTo(c.x,c.y) }); ctx.stroke()
    } else if (tool === 'highlight' || tool === 'underline' || tool === 'strikethrough' || tool === 'articlebox') {
      ctx.globalAlpha = tool==='highlight' ? opacity : 0.3
      ctx.fillRect(drawStart.x, drawStart.y, x-drawStart.x, y-drawStart.y)
      ctx.globalAlpha = 1; ctx.strokeRect(drawStart.x, drawStart.y, x-drawStart.x, y-drawStart.y)
    } else if (tool === 'rect') {
      ctx.strokeRect(drawStart.x, drawStart.y, x-drawStart.x, y-drawStart.y)
    } else if (tool === 'circle') {
      const w=x-drawStart.x, h=y-drawStart.y
      ctx.beginPath(); ctx.ellipse(drawStart.x+w/2, drawStart.y+h/2, Math.abs(w)/2, Math.abs(h)/2, 0, 0, Math.PI*2); ctx.stroke()
    } else if (tool === 'line') {
      ctx.beginPath(); ctx.moveTo(drawStart.x, drawStart.y); ctx.lineTo(x,y); ctx.stroke()
    } else if (tool === 'arrow') {
      ctx.beginPath(); ctx.moveTo(drawStart.x, drawStart.y); ctx.lineTo(x,y); ctx.stroke()
      const angle = Math.atan2(y-drawStart.y, x-drawStart.x)
      const hw = 12
      ctx.beginPath()
      ctx.moveTo(x,y)
      ctx.lineTo(x - hw*Math.cos(angle-0.4), y - hw*Math.sin(angle-0.4))
      ctx.lineTo(x - hw*Math.cos(angle+0.4), y - hw*Math.sin(angle+0.4))
      ctx.closePath(); ctx.fill()
    }
    ctx.restore()
  }, [isPanning, panStart, isDrawing, drawStart, tool, color, opacity, lineWidth, livePoints, getCoord, redrawCanvas])

  const onMouseUp = useCallback(e => {
    if (isPanning) { setIsPanning(false); setPanStart(null); return }
    if (!isDrawing) return
    setIsDrawing(false)
    const {x,y} = getCoord(e)
    const {x:sx,y:sy} = drawStart
    const pdfS = toPdf(sx,sy), pdfE = toPdf(x,y)
    const box = { page:currentPage,
      x:Math.min(pdfS.x,pdfE.x), y:Math.min(pdfS.y,pdfE.y),
      width:Math.abs(pdfE.x-pdfS.x), height:Math.abs(pdfE.y-pdfS.y),
      color, line_width:lineWidth, opacity }
    if (tool === 'freehand' && livePoints.length > 1) {
      addOp({type:'add_freehand', ...box, x:pdfS.x, y:pdfS.y, width:0, height:0,
        points:[...livePoints, [x/RS, y/RS]]})
    } else if (tool === 'highlight') {
      addOp({type:'add_highlight', ...box})
    } else if (tool === 'underline') {
      addOp({type:'add_underline', ...box})
    } else if (tool === 'strikethrough') {
      addOp({type:'add_strikethrough', ...box})
    } else if (tool === 'rect') {
      addOp({type:'add_rect', ...box})
    } else if (tool === 'circle') {
      addOp({type:'add_circle', ...box})
    } else if (tool === 'line') {
      addOp({type:'add_line', ...box, x:pdfS.x, y:pdfS.y, width:0, height:0,
        points:[[pdfS.x,pdfS.y],[pdfE.x,pdfE.y]]})
    } else if (tool === 'arrow') {
      addOp({type:'add_arrow', ...box, x:pdfS.x, y:pdfS.y, width:0, height:0,
        points:[[pdfS.x,pdfS.y],[pdfE.x,pdfE.y]]})
    } else if (tool === 'articlebox') {
      const label = window.prompt('Article box label (optional):') || ''
      addOp({type:'add_articlebox', ...box, label, color:'#3b82f6', opacity:0.15})
    }
    setLivePoints([])
  }, [isPanning, isDrawing, drawStart, tool, color, opacity, lineWidth, livePoints, currentPage, getCoord, addOp])

  const commitText = useCallback(() => {
    if (!textPos || !pendingText.trim()) { setTextPos(null); setPendingText(''); return }
    addOp({type:'add_text', page:currentPage, x:textPos.x, y:textPos.y,
      text:pendingText, color, font_size:fontSize, line_width:1, width:0, height:0, opacity:1})
    setTextPos(null); setPendingText('')
  }, [textPos, pendingText, color, fontSize, currentPage, addOp])

  const onImageInsert = useCallback(e => {
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const b64 = ev.target.result
      const w = (page.width * 0.5), h = (page.height * 0.4)
      addOp({type:'add_image', page:currentPage, x:page.width*0.25, y:page.height*0.3,
        width:w, height:h, image_b64:b64, color:'', line_width:0, opacity:1})
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }, [page, currentPage, addOp])

  /* ── Open file / export ────────────────────────────────────────── */
  const openFile = useCallback(async file => {
    setLoading(true); setError('')
    try {
      const fd = new FormData(); fd.append('file', file)
      const r = await fetch('/api/pdf-editor/open', {method:'POST', body:fd})
      if (!r.ok) throw new Error((await r.json()).detail || 'Failed to open PDF')
      const data = await r.json()
      setSession(data); setOps([]); setRedoStack([]); setCurrentPageRaw(0); setPhase('editor')
    } catch(e) { setError(e.message) }
    finally { setLoading(false) }
  }, [])

  const exportPDF = useCallback(async () => {
    if (!session) return
    setExporting(true)
    try {
      const r = await fetch('/api/pdf-editor/export', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({session_id: session.session_id, operations: ops})
      })
      if (!r.ok) throw new Error('Export failed')
      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url
      a.download = `edited_${session.filename || 'document.pdf'}`; a.click()
      URL.revokeObjectURL(url)
    } catch(e) { setStatus('Export failed: ' + e.message) }
    finally { setExporting(false) }
  }, [session, ops])

  const closeEditor = useCallback(async () => {
    if (session) fetch('/api/pdf-editor/close',{method:'POST',
      headers:{'Content-Type':'application/json'}, body:JSON.stringify({session_id:session.session_id})}).catch(()=>{})
    setSession(null); setOps([]); setRedoStack([]); setPhase('upload'); setError('')
  }, [session])

  const deletePage = useCallback(pageIdx => {
    addOp({type:'delete_page', page:pageIdx, x:0,y:0,width:0,height:0,color:'',line_width:0,opacity:1})
    setCurrentPageRaw(p => Math.max(0, p >= pageIdx ? p - 1 : p))
  }, [addOp])

  const rotatePage = useCallback(pageIdx => {
    addOp({type:'rotate_page', page:pageIdx, angle:90, x:0,y:0,width:0,height:0,color:'',line_width:0,opacity:1})
  }, [addOp])

  const deletedPages = new Set(ops.filter(o=>o.type==='delete_page').map(o=>o.page))
  const effectiveSession = session ? {
    ...session,
    page_count: session.page_count - deletedPages.size,
    pages: session.pages?.filter((_,i)=>!deletedPages.has(i)),
  } : null

  /* ── Render: upload phase ─────────────────────────────────────── */
  if (phase === 'upload') return (
    <UploadPhase onFile={openFile} loading={loading} error={error} />
  )

  /* ── Render: editor ───────────────────────────────────────────── */
  const cursorMap = { select:'default', hand:'grab', text:'text',
    highlight:'crosshair', underline:'crosshair', strikethrough:'crosshair',
    freehand:'crosshair', rect:'crosshair', circle:'crosshair', line:'crosshair',
    arrow:'crosshair', note:'cell', image:'copy' }
  return (
    <div style={{ display:'flex', flexDirection:'column',
      /* Fill the parent border container exactly — no gap at top/bottom */
      height:'calc(100vh - 200px)', minHeight:600,
      background:C.bg, overflow:'hidden', borderRadius:'inherit' }}>
      <input ref={imgInputRef} type="file" accept="image/*" style={{display:'none'}} onChange={onImageInsert} />

      {/* Toolbar */}
      <Toolbar tool={tool} setTool={setTool} color={color} setColor={setColor}
        opacity={opacity} setOpacity={setOpacity} lineWidth={lineWidth} setLineWidth={setLineWidth}
        fontSize={fontSize} setFontSize={setFontSize}
        onUndo={undo} canUndo={ops.length>0} onRedo={redo} canRedo={redoStack.length>0}
        zoomIdx={zoomIdx} setZoomIdx={setZoomIdx}
        onExport={exportPDF} exporting={exporting} opsCount={ops.length}
        onClose={closeEditor} />

      {/* Body */}
      <div style={{ display:'flex', flex:1, overflow:'hidden' }}>
        {/* Sidebar */}
        <PageSidebar session={effectiveSession || session}
          currentPage={currentPage} setCurrentPage={setCurrentPage}
          onDelete={deletePage} onRotate={rotatePage} />

        {/* Canvas area */}
        <div ref={canvasWrapRef} style={{ flex:1, overflow:'auto',
          background:'#0a0a14',
          backgroundImage:'radial-gradient(circle at 50% 0%, color-mix(in srgb, var(--cyan) 4%, transparent) 0%, transparent 60%)',
          display:'flex', alignItems:'flex-start', justifyContent:'center', padding:24,
          cursor: isPanning ? 'grabbing' : undefined }}>
          <div style={{ position:'relative', flexShrink:0,
            width: canvasW * zoom, height: canvasH * zoom,
            boxShadow:'0 8px 48px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.06)',
            borderRadius:2 }}>
            {/* PDF page image */}
            <img ref={imgRef}
              src={`/api/pdf-editor/page/${session.session_id}/${currentPage}?scale=${RS}`}
              alt={`Page ${currentPage+1}`}
              style={{ position:'absolute', top:0, left:0, width:'100%', height:'100%',
                display:'block', userSelect:'none', pointerEvents:'none' }} />
            {/* Drawing canvas */}
            <canvas ref={canvasRef} width={canvasW} height={canvasH}
              style={{ position:'absolute', top:0, left:0, width:'100%', height:'100%',
                cursor: isPanning ? 'grabbing' : (cursorMap[tool] || 'crosshair') }}
              onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp}
              onMouseLeave={()=>{ if(isDrawing){setIsDrawing(false);setLivePoints([])} if(isPanning){setIsPanning(false);setPanStart(null)} }} />
            {/* Text input overlay */}
            {textPos && (
              <div style={{ position:'absolute', left: textPos.canvasX*zoom, top: textPos.canvasY*zoom, zIndex:10 }}>
                <input autoFocus value={pendingText} onChange={e=>setPendingText(e.target.value)}
                  onKeyDown={e=>{ if(e.key==='Enter'){e.preventDefault();commitText()} if(e.key==='Escape'){setTextPos(null);setPendingText('')} }}
                  onBlur={commitText}
                  style={{ fontFamily:'sans-serif', fontSize: fontSize*zoom*0.95,
                    color, background:'rgba(255,255,255,0.1)', border:`1px dashed ${color}`,
                    outline:'none', minWidth:120, padding:'2px 4px' }} />
              </div>
            )}

          </div>
        </div>
      </div>

      {/* Status bar */}
      <div style={{ background:C.bg2, borderTop:`1px solid ${C.border}`, padding:'5px 16px',
        display:'flex', alignItems:'center', gap:16, fontFamily:C.mono, fontSize:9, color:C.muted,
        flexWrap:'wrap', rowGap:2 }}>
        <span>📄 <span style={{color:C.cyan}}>{session.filename}</span></span>
        <span style={{color:C.border}}>|</span>
        <span>Page <span style={{color:C.cyan}}>{currentPage+1}</span> / {session.page_count}</span>
        <span style={{color:C.border}}>|</span>
        <span>Zoom <span style={{color:C.cyan}}>{Math.round(zoom*100)}%</span></span>
        <span style={{color:C.border}}>|</span>
        <span>Tool <span style={{color:C.green}}>{TOOLS.find(t=>t.id===tool)?.label}</span></span>
        <span style={{color:C.border}}>|</span>
        <span><span style={{color:ops.length>0?C.green:C.muted}}>{ops.length}</span> annotation{ops.length!==1?'s':''}</span>
        {status && <span style={{color:C.red, marginLeft:'auto'}}>⚠ {status}</span>}
        {/* Keyboard shortcuts hint */}
        <span style={{marginLeft:'auto', color:C.muted, opacity:0.5}}>Ctrl+Z undo · Ctrl+Y redo · Esc cancel</span>
      </div>
    </div>
  )
}
