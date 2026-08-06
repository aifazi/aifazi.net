'use client'
import { useState } from 'react'
import { S } from './shared.jsx'
import PDFEditor from './PDFEditor.jsx'
import {
  MergePDFB, SplitPDFB, CompressPDFB, RotatePDFB, RemovePagesPDFB,
  WatermarkPDFB, PageNumbersPDFB, ImagesToPDFB, PDFToImagesB,
  ProtectPDFB, UnlockPDFB, OrganizePDFB, CropPDFB, EditPDFMetaB,
  PDFInfoB, GrayscalePDFB, HeaderFooterPDFB, FlattenPDFB, SignPDFB, RepairPDFB,
  PDFToWordB, PDFToExcelB, PDFToJPGB,
  WordToPDFB, ExcelToPDFB, CSVToPDFB, JPGToPDFB, HTMLToPDFB, TextToPDFB,
  CompressImageB, ResizeImageB, ConvertImageB, FlipImageB, ImageWatermarkB, ImageOCRB,
  DocxToTextB, XlsxToCsvB, CsvToXlsxB,
  TextStatsB, CompareTextB, Base64ToolB, JsonFormatterB,
} from './BackendTools.jsx'

const TOOLS = [
  // â”€â”€ PDF Editor â”€â”€
  { id:'pdf-editor',     cat:'pdf',     icon:'âœï¸', name:'PDF Editor',         desc:'Full Foxit-like editor: draw, annotate, add text, export',  color:'#ff6b35', component: PDFEditor,      badge:'NEW', fullBleed: true },
  // â”€â”€ PDF â”€â”€
  { id:'merge-pdf',      cat:'pdf',     icon:'ðŸ”—', name:'Merge PDF',          desc:'Combine multiple PDFs into one',                            color:'#ff6b35', component: MergePDFB },
  { id:'split-pdf',      cat:'pdf',     icon:'âœ‚ï¸', name:'Split PDF',          desc:'Extract specific pages from PDF',                           color:'#ff6b35', component: SplitPDFB },
  { id:'compress-pdf',   cat:'pdf',     icon:'ðŸ—œï¸', name:'Compress PDF',       desc:'Reduce PDF file size',                                      color:'#ff6b35', component: CompressPDFB },
  { id:'rotate-pdf',     cat:'pdf',     icon:'ðŸ”„', name:'Rotate PDF',         desc:'Rotate pages in any direction',                             color:'#ff6b35', component: RotatePDFB },
  { id:'remove-pages',   cat:'pdf',     icon:'ðŸ—‘ï¸', name:'Remove Pages',       desc:'Delete pages from a PDF',                                   color:'#ff6b35', component: RemovePagesPDFB },
  { id:'watermark',      cat:'pdf',     icon:'ðŸ’§', name:'Watermark PDF',      desc:'Add text watermark to all pages',                           color:'#ff6b35', component: WatermarkPDFB },
  { id:'page-numbers',   cat:'pdf',     icon:'ðŸ”¢', name:'Page Numbers',       desc:'Stamp page numbers on PDF',                                 color:'#ff6b35', component: PageNumbersPDFB },
  { id:'img-to-pdf',     cat:'pdf',     icon:'ðŸ–¼ï¸', name:'Images â†’ PDF',      desc:'Combine JPG/PNG into one PDF',                              color:'#ff6b35', component: ImagesToPDFB },
  { id:'pdf-to-img',     cat:'pdf',     icon:'ðŸ“¸', name:'PDF â†’ Images',      desc:'Export each page as PNG',                                   color:'#ff6b35', component: PDFToImagesB },
  { id:'protect-pdf',    cat:'pdf',     icon:'ðŸ”’', name:'Protect PDF',        desc:'Password-encrypt your PDF',                                 color:'#ff6b35', component: ProtectPDFB },
  { id:'unlock-pdf',     cat:'pdf',     icon:'ðŸ”“', name:'Unlock PDF',         desc:'Remove PDF password & restrictions',                        color:'#ff6b35', component: UnlockPDFB },
  { id:'organize-pdf',   cat:'pdf',     icon:'ðŸ—‚ï¸', name:'Organize PDF',      desc:'Reorder, rearrange or delete pages',                        color:'#ff6b35', component: OrganizePDFB },
  { id:'crop-pdf',       cat:'pdf',     icon:'ðŸ”²', name:'Crop PDF',           desc:'Trim margins on all pages',                                 color:'#ff6b35', component: CropPDFB },
  { id:'edit-pdf-meta',  cat:'pdf',     icon:'ðŸ·ï¸', name:'Edit Metadata',     desc:'Set title, author, keywords',                               color:'#ff6b35', component: EditPDFMetaB },
  { id:'pdf-info',       cat:'pdf',     icon:'ðŸ”Ž', name:'PDF Inspector',      desc:'View file info, page size, metadata',                       color:'#ff6b35', component: PDFInfoB },
  { id:'grayscale-pdf',  cat:'pdf',     icon:'â¬›', name:'Grayscale PDF',      desc:'Convert color PDF to black & white',                        color:'#ff6b35', component: GrayscalePDFB },
  { id:'header-footer',  cat:'pdf',     icon:'ðŸ“‹', name:'Header & Footer',   desc:'Stamp custom text top/bottom of pages',                     color:'#ff6b35', component: HeaderFooterPDFB },
  { id:'flatten-pdf',    cat:'pdf',     icon:'ðŸ“„', name:'Flatten PDF',        desc:'Lock form fields into static content',                      color:'#ff6b35', component: FlattenPDFB },
  { id:'sign-pdf',       cat:'pdf',     icon:'âœï¸', name:'Sign PDF',          desc:'Draw or type signature onto PDF',                           color:'#ff6b35', component: SignPDFB },
  { id:'repair-pdf',     cat:'pdf',     icon:'ðŸ”§', name:'Repair PDF',         desc:'Fix corrupted or broken PDF files',                         color:'#ff6b35', component: RepairPDFB },
  // â”€â”€ Convert â”€â”€
  { id:'pdf-to-word',    cat:'convert', icon:'ðŸ“„', name:'PDF â†’ Word',        desc:'Extract PDF text as editable DOCX',                         color:'#2b5cce', component: PDFToWordB },
  { id:'pdf-to-excel',   cat:'convert', icon:'ðŸ“Š', name:'PDF â†’ Excel',       desc:'Extract PDF table data to spreadsheet',                     color:'#1d7044', component: PDFToExcelB },
  { id:'pdf-to-jpg',     cat:'convert', icon:'ðŸ–¼ï¸', name:'PDF â†’ JPG',        desc:'Export PDF pages as JPEG images',                           color:'#ff6b35', component: PDFToJPGB },
  { id:'word-to-pdf',    cat:'convert', icon:'ðŸ“', name:'Word â†’ PDF',        desc:'Convert DOCX to PDF document',                              color:'#2b5cce', component: WordToPDFB },
  { id:'excel-to-pdf',   cat:'convert', icon:'ðŸ“ˆ', name:'Excel â†’ PDF',       desc:'Convert Excel spreadsheet to PDF',                          color:'#1d7044', component: ExcelToPDFB },
  { id:'csv-to-pdf',     cat:'convert', icon:'ðŸ“‹', name:'CSV â†’ PDF',         desc:'Convert CSV data table to PDF',                             color:'#1d7044', component: CSVToPDFB },
  { id:'jpg-to-pdf',     cat:'convert', icon:'ðŸ“¸', name:'JPG â†’ PDF',        desc:'Convert JPG images to PDF document',                        color:'#7c5cbf', component: JPGToPDFB },
  { id:'html-to-pdf',    cat:'convert', icon:'ðŸŒ', name:'HTML â†’ PDF',        desc:'Convert HTML code to PDF',                                  color:'#00d4ff', component: HTMLToPDFB },
  { id:'text-to-pdf',    cat:'convert', icon:'ðŸ“ƒ', name:'Text â†’ PDF',        desc:'Convert plain text or Markdown to PDF',                     color:'#ff6b35', component: TextToPDFB },
  { id:'csv-to-xlsx',    cat:'convert', icon:'ðŸ“ˆ', name:'CSV â†’ Excel',       desc:'Convert CSV to XLSX spreadsheet',                           color:'#1d7044', component: CsvToXlsxB },
  { id:'xlsx-to-csv',    cat:'convert', icon:'ðŸ“Š', name:'Excel â†’ CSV',       desc:'Convert spreadsheet sheet to CSV',                          color:'#1d7044', component: XlsxToCsvB },
  // â”€â”€ Word â”€â”€
  { id:'docx-to-text',   cat:'word',    icon:'ðŸ“', name:'DOCX â†’ Text',       desc:'Extract plain text from Word document',                     color:'#2b5cce', component: DocxToTextB },
  // â”€â”€ Image â”€â”€
  { id:'compress-img',   cat:'image',   icon:'ðŸ—œï¸', name:'Compress Image',    desc:'Reduce image file size',                                    color:'#7c5cbf', component: CompressImageB },
  { id:'resize-img',     cat:'image',   icon:'â†”ï¸', name:'Resize Image',      desc:'Change image dimensions',                                   color:'#7c5cbf', component: ResizeImageB },
  { id:'convert-img',    cat:'image',   icon:'ðŸ”€', name:'Convert Format',    desc:'JPG â†” PNG â†” WebP batch convert',                            color:'#7c5cbf', component: ConvertImageB },
  { id:'flip-img',       cat:'image',   icon:'ðŸªž', name:'Flip / Mirror',     desc:'Flip image horizontally or vertically',                     color:'#7c5cbf', component: FlipImageB },
  { id:'watermark-img',  cat:'image',   icon:'ðŸ’§', name:'Image Watermark',   desc:'Add text watermark to images',                              color:'#7c5cbf', component: ImageWatermarkB },
  // â”€â”€ OCR â”€â”€
  { id:'ocr',            cat:'ocr',     icon:'ðŸ”', name:'Image OCR',          desc:'Extract text from images (server-side)',                    color:'#00d4ff', component: ImageOCRB },
  // â”€â”€ Text / Dev â”€â”€
  { id:'compare-text',   cat:'text',    icon:'âš–ï¸', name:'Compare Files',     desc:'Diff two text files side-by-side',                          color:'#ffd700', component: CompareTextB },
  { id:'json-format',    cat:'text',    icon:'{}', name:'JSON Formatter',    desc:'Format, validate and minify JSON',                           color:'#ffd700', component: JsonFormatterB },
  { id:'base64',         cat:'text',    icon:'ðŸ”£', name:'Base64 Encode',     desc:'Encode or decode Base64 strings',                           color:'#ffd700', component: Base64ToolB },
  { id:'text-stats',     cat:'text',    icon:'ðŸ“Š', name:'Text Statistics',   desc:'Word count, reading time, top words',                       color:'#ffd700', component: TextStatsB },
]

const CAT_META = {
  pdf:     { label:'PDF Tools',     color:'#ff6b35', icon:'ðŸ“•', desc:'21 tools' },
  convert: { label:'Convert',       color:'#00d4ff', icon:'ðŸ”„', desc:'11 tools' },
  word:    { label:'Word',          color:'#2b5cce', icon:'ðŸ“˜', desc:'1 tool'   },
  image:   { label:'Image',         color:'#7c5cbf', icon:'ðŸ–¼ï¸', desc:'5 tools'  },
  ocr:     { label:'OCR',           color:'#00d4ff', icon:'ðŸ”', desc:'1 tool'   },
  text:    { label:'Text & Dev',    color:'#ffd700', icon:'ðŸ“', desc:'4 tools'  },
}

const CATS = [
  { id:'all' },
  ...Object.entries(CAT_META).map(([id, m]) => ({ id, ...m })),
]

// â”€â”€ Tool Card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function ToolCard({ tool, onClick }) {
  const [hover, setHover] = useState(false)
  return (
    <div
      onClick={() => onClick(tool)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: hover ? `${tool.color}08` : 'var(--bg2)',
        border: `1px solid ${hover ? tool.color + '40' : 'var(--border)'}`,
        padding:'20px 18px 16px', cursor:'pointer',
        transition:'all .18s ease',
        transform: hover ? 'translateY(-3px)' : 'none',
        boxShadow: hover ? `0 8px 24px rgba(0,0,0,.35), 0 0 0 1px ${tool.color}20` : 'none',
        position:'relative', overflow:'hidden',
        display:'flex', flexDirection:'column',
      }}
    >
      <div style={{ position:'absolute', top:0, left:0, right:0, height:2,
        background: `linear-gradient(90deg,${tool.color},${tool.color}00)`,
        opacity: hover ? 1 : 0.3, transition:'opacity .18s' }} />
      <div style={{ display:'flex', alignItems:'flex-start', gap:12, marginBottom:10 }}>
        <div style={{
          width:38, height:38, borderRadius:8, flexShrink:0,
          background:`${tool.color}15`, border:`1px solid ${tool.color}30`,
          display:'flex', alignItems:'center', justifyContent:'center', fontSize:18
        }}>{tool.icon}</div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontFamily:'var(--font-display)', fontSize:14, fontWeight:700,
            color: hover ? tool.color : 'var(--text)', lineHeight:1.2, marginBottom:4,
            transition:'color .18s', display:'flex', alignItems:'center', gap:6 }}>
            {tool.name}
            {tool.badge && (
              <span style={{ fontFamily:'var(--font-mono)', fontSize:7, letterSpacing:1.5,
                padding:'1px 5px', background:`${tool.color}25`, border:`1px solid ${tool.color}60`,
                color:tool.color, borderRadius:3, flexShrink:0 }}>{tool.badge}</span>
            )}
          </div>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--muted)',
            lineHeight:1.5, letterSpacing:0.3 }}>{tool.desc}</div>
        </div>
      </div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:'auto' }}>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:8, letterSpacing:2,
          color: tool.color, opacity: hover ? 1 : 0, transition:'opacity .18s' }}>
          OPEN TOOL â†’
        </div>
        <div style={{ width:6, height:6, borderRadius:'50%',
          background: tool.color, opacity: hover ? 0.8 : 0.3, transition:'opacity .18s' }} />
      </div>
    </div>
  )
}

// â”€â”€ Category header card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function CatSection({ catId, tools, onSelect }) {
  const meta = CAT_META[catId]
  if (!meta || !tools.length) return null
  return (
    <div style={{ marginBottom:40 }}>
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
        <div style={{ width:4, height:20, background:meta.color, borderRadius:2 }} />
        <span style={{ fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:3, color:meta.color }}>
          {meta.icon} {meta.label.toUpperCase()}
        </span>
        <span style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--muted)',
          padding:'2px 8px', border:'1px solid var(--border)' }}>{tools.length} tools</span>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(200px, 1fr))', gap:10 }}>
        {tools.map(t => <ToolCard key={t.id} tool={t} onClick={onSelect} />)}
      </div>
    </div>
  )
}

// â”€â”€ Main Export â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function FileTools() {
  const [activeTool, setActiveTool] = useState(null)
  const [cat, setCat]               = useState('all')
  const [search, setSearch]         = useState('')
  const [view, setView]             = useState('grid') // grid | list

  const filtered = TOOLS.filter(t =>
    (cat === 'all' || t.cat === cat) &&
    (!search || t.name.toLowerCase().includes(search.toLowerCase()) || t.desc.toLowerCase().includes(search.toLowerCase()))
  )

  const grouped = Object.keys(CAT_META).reduce((acc, id) => {
    acc[id] = filtered.filter(t => t.cat === id)
    return acc
  }, {})

  const ActiveComponent = activeTool?.component
  const totalTools = TOOLS.length

  return (
    <div style={{ minHeight:'100vh' }}>
      {/* â”€â”€ Hero Banner â”€â”€ */}
      {!activeTool && (
        <div style={{
          background:'linear-gradient(135deg, var(--bg2) 0%, var(--bg) 50%, var(--bg3) 100%)',
          borderBottom:'1px solid var(--border)', padding:'60px 24px 40px',
          position:'relative', overflow:'hidden',
        }}>
          {/* Background grid pattern */}
          <div style={{ position:'absolute', inset:0, opacity:0.03,
            backgroundImage:'linear-gradient(var(--cyan) 1px, transparent 1px), linear-gradient(90deg, var(--cyan) 1px, transparent 1px)',
            backgroundSize:'40px 40px' }} />

          <div style={{ maxWidth:1100, margin:'0 auto', position:'relative' }}>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--cyan)',
              letterSpacing:4, marginBottom:14, display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ display:'inline-block', width:6, height:6, background:'var(--green)', borderRadius:'50%' }} />
              FILE UTILITIES â€” BROWSER POWERED
            </div>
            <h1 style={{ fontFamily:'var(--font-display)', fontSize:'clamp(40px,5vw,68px)',
              fontWeight:900, letterSpacing:-2, lineHeight:.9, marginBottom:20, margin:'0 0 16px' }}>
              File{' '}
              <span style={{ background:'linear-gradient(135deg,var(--green),var(--cyan))',
                WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>Tools</span>
            </h1>
            <p style={{ color:'var(--muted)', fontSize:15, lineHeight:1.8, maxWidth:520, margin:'0 0 24px' }}>
              {totalTools} powerful tools â€” PDF, Word, Excel, Images, OCR and more.
              Processing powered by <strong style={{ color:'var(--text)' }}>Python backend</strong> (PyMuPDF, Pillow).
              Files are processed server-side and never stored.
            </p>

            {/* Stats row */}
            <div style={{ display:'flex', gap:24, flexWrap:'wrap', marginBottom:0 }}>
              {[
                { n: totalTools, label:'Tools Available', color:'var(--green)' },
                { n:'0', label:'Files Uploaded to Server', color:'var(--cyan)' },
                { n:'âˆž', label:'Files You Can Process', color:'var(--orange)' },
              ].map(({ n, label, color }) => (
                <div key={label} style={{ display:'flex', alignItems:'baseline', gap:8 }}>
                  <span style={{ fontFamily:'var(--font-mono)', fontSize:28, fontWeight:700, color }}>{n}</span>
                  <span style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--muted)', letterSpacing:1 }}>{label.toUpperCase()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div style={{ maxWidth:1100, margin:'0 auto', padding:'32px 24px' }}>

        {/* â”€â”€ Active Tool View â”€â”€ */}
        {activeTool ? (
          <div>
            {/* Breadcrumb */}
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:24,
              fontFamily:'var(--font-mono)', fontSize:10, color:'var(--muted)' }}>
              <button onClick={() => setActiveTool(null)}
                style={{ background:'none', border:'none', color:'var(--cyan)', cursor:'pointer',
                  fontFamily:'var(--font-mono)', fontSize:10, padding:0 }}>
                â† All Tools
              </button>
              <span>/</span>
              <span style={{ color: activeTool.color }}>{CAT_META[activeTool.cat]?.label}</span>
              <span>/</span>
              <span style={{ color:'var(--text)' }}>{activeTool.name}</span>
            </div>

            {/* Tool header */}
            <div style={{ display:'flex', alignItems:'center', gap:20, marginBottom:28,
              padding:'20px 24px', background:'var(--bg2)', border:`1px solid ${activeTool.color}25`,
              position:'relative', overflow:'hidden' }}>
              <div style={{ position:'absolute', top:0, left:0, bottom:0, width:3, background:activeTool.color }} />
              <div style={{
                width:52, height:52, borderRadius:12,
                background:`${activeTool.color}18`, border:`1px solid ${activeTool.color}40`,
                display:'flex', alignItems:'center', justifyContent:'center', fontSize:24, flexShrink:0
              }}>{activeTool.icon}</div>
              <div style={{ flex:1 }}>
                <div style={{ fontFamily:'var(--font-display)', fontSize:24, fontWeight:700,
                  color: activeTool.color, lineHeight:1, marginBottom:6 }}>{activeTool.name}</div>
                <div style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--muted)' }}>{activeTool.desc}</div>
              </div>
              <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                <span style={{ fontFamily:'var(--font-mono)', fontSize:9, letterSpacing:2,
                  padding:'4px 10px', border:'1px solid var(--border)', color:'var(--muted)' }}>
                  ðŸ”’ LOCAL ONLY
                </span>
                <button onClick={() => setActiveTool(null)}
                  style={{ fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:1, padding:'8px 16px',
                    background:'transparent', color:'var(--muted)', border:'1px solid var(--border)', cursor:'pointer' }}>
                  âœ• CLOSE
                </button>
              </div>
            </div>

            <div style={{
              background:'var(--bg2)',
              border:'1px solid var(--border)',
              /* Remove padding for full-bleed tools (e.g. PDF Editor) so the
                 editor canvas fills the border exactly with no inner gap */
              padding: activeTool.fullBleed ? 0 : '28px 32px',
              overflow: activeTool.fullBleed ? 'hidden' : undefined,
            }}>
              <ActiveComponent />
            </div>
          </div>
        ) : (
          <>
            {/* â”€â”€ Search + Filter bar â”€â”€ */}
            <div style={{ display:'flex', gap:10, marginBottom:28, alignItems:'center', flexWrap:'wrap' }}>
              {/* Search */}
              <div style={{ flex:1, minWidth:200, position:'relative' }}>
                <span style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)',
                  fontFamily:'var(--font-mono)', fontSize:12, color:'var(--muted)', pointerEvents:'none' }}>ðŸ”</span>
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search tools..."
                  style={{ ...S.input, paddingLeft:36, fontFamily:'var(--font-mono)', fontSize:11 }} />
              </div>

              {/* Category tabs */}
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                <button onClick={() => { setCat('all'); setSearch('') }}
                  style={{
                    fontFamily:'var(--font-mono)', fontSize:9, letterSpacing:2, padding:'8px 14px',
                    background: cat==='all' ? 'color-mix(in srgb, var(--green) 12%, transparent)' : 'var(--bg2)',
                    color: cat==='all' ? 'var(--green)' : 'var(--muted)',
                    border: `1px solid ${cat==='all' ? 'color-mix(in srgb, var(--green) 50%, transparent)' : 'var(--border)'}`,
                    cursor:'pointer', whiteSpace:'nowrap',
                  }}>âš¡ ALL ({totalTools})</button>
                {Object.entries(CAT_META).map(([id, m]) => {
                  const count = TOOLS.filter(t=>t.cat===id).length
                  return (
                    <button key={id} onClick={() => { setCat(id); setSearch('') }}
                      style={{
                        fontFamily:'var(--font-mono)', fontSize:9, letterSpacing:2, padding:'8px 12px',
                        background: cat===id ? `${m.color}18` : 'var(--bg2)',
                        color: cat===id ? m.color : 'var(--muted)',
                        border: `1px solid ${cat===id ? m.color+'50' : 'var(--border)'}`,
                        cursor:'pointer', whiteSpace:'nowrap', display:'flex', alignItems:'center', gap:5,
                      }}>
                      {m.icon} {m.label.toUpperCase()}
                      <span style={{ fontSize:8, opacity:0.7 }}>({count})</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* â”€â”€ Tool grid / grouped â”€â”€ */}
            {search || cat !== 'all' ? (
              <>
                {filtered.length === 0 ? (
                  <div style={{ textAlign:'center', padding:'80px 24px',
                    fontFamily:'var(--font-mono)', color:'var(--muted)', letterSpacing:2 }}>
                    <div style={{ fontSize:40, marginBottom:16 }}>ðŸ”</div>
                    <div style={{ fontSize:12 }}>NO TOOLS FOUND FOR "{search || cat}"</div>
                  </div>
                ) : (
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(200px, 1fr))', gap:10 }}>
                    {filtered.map(t => <ToolCard key={t.id} tool={t} onClick={setActiveTool} />)}
                  </div>
                )}
              </>
            ) : (
              // Grouped by category
              Object.entries(grouped).map(([id, tools]) =>
                <CatSection key={id} catId={id} tools={tools} onSelect={setActiveTool} />
              )
            )}

            {/* â”€â”€ Feature badges â”€â”€ */}
            {!search && cat === 'all' && (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',
                gap:12, marginTop:40, paddingTop:32, borderTop:'1px solid var(--border)' }}>
                {[
                  { icon:'ðŸ”’', title:'100% Private', desc:'All processing happens in your browser. Files never leave your device.', color:'var(--green)' },
                  { icon:'âš¡', title:'Zero Install', desc:'No downloads, no sign-up. Open and convert instantly.', color:'var(--cyan)' },
                  { icon:'ðŸŒ', title:'Works Offline', desc:'After first load, most tools work without internet.', color:'var(--orange)' },
                  { icon:'â™¾ï¸', title:'No Limits', desc:'No file size caps, no daily limits, no watermarks.', color:'var(--purple)' },
                ].map(({ icon, title, desc, color }) => (
                  <div key={title} style={{ background:'var(--bg2)', border:'1px solid var(--border)',
                    padding:'20px 18px', position:'relative', overflow:'hidden' }}>
                    <div style={{ position:'absolute', top:0, left:0, right:0, height:2,
                      background:`linear-gradient(90deg,${color}80,transparent)` }} />
                    <div style={{ fontSize:22, marginBottom:10 }}>{icon}</div>
                    <div style={{ fontFamily:'var(--font-display)', fontSize:15, fontWeight:700,
                      color:'var(--text)', marginBottom:6 }}>{title}</div>
                    <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--muted)', lineHeight:1.7 }}>{desc}</div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
