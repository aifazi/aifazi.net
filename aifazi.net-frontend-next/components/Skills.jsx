'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { useReveal } from '../hooks/useReveal'
import { useSplitTextReveal } from '../hooks/useSplitTextReveal'
import { EditableNumber, EditableText, AnimatableWrapper, useInlineEdit, useEdit } from '../context/EditContext'
import { IconDisplay, useLordiconScript } from './IconPicker'
import { IconPickerModal } from './IconPicker'
import api from '@/lib/api'

const DEFAULT_SKILLS = [
  {
    icon: '🌐', title: 'Networking & Infrastructure', tagline: 'Router, switch, server, and wireless deployment across enterprise environments',
    items: [
      { name: 'Router / Switch / Server Config', pct: 90 },
      { name: 'Wireless AP & Controller', pct: 85 },
      { name: 'NAS Storage Management', pct: 82 },
      { name: 'Network Fault Diagnosis', pct: 88 },
    ],
    proven: 'Multi-site deployments · Wireless controller setups · NAS configuration',
  },
  {
    icon: '🧠', title: 'Systems & Hardware', tagline: 'End-to-end hardware troubleshooting, OS deployment, and server administration',
    items: [
      { name: 'Hardware Troubleshooting', pct: 92 },
      { name: 'OS & Application Install', pct: 90 },
      { name: 'Server Backup & Restore', pct: 85 },
      { name: 'System Failure Recovery', pct: 86 },
    ],
    proven: 'Server backup/restore · Desktop/Laptop setup · OS deployments',
  },
  {
    icon: '🔒', title: 'Security & User Management', tagline: 'Account provisioning, access control, and endpoint security enforcement',
    items: [
      { name: 'Antivirus / Anti-Malware', pct: 88 },
      { name: 'User Account Management', pct: 90 },
      { name: 'Password Management', pct: 88 },
      { name: 'Etisalat Account Admin', pct: 85 },
    ],
    proven: 'Etisalat accounts · Role-based provisioning · Security enforcement',
  },
  {
    icon: '🛠️', title: 'IT Support & Operations', tagline: '24×7 helpdesk, service request management, and end-user support',
    items: [
      { name: '24×7 Helpdesk Support', pct: 90 },
      { name: 'Service Request Management', pct: 88 },
      { name: 'End-User Training', pct: 82 },
      { name: 'Vendor Communication', pct: 80 },
    ],
    proven: '24/7 incident response · Store & office setups · Supplier coordination',
  },
]

const SKILL_FIELDS = [
  { key: 'name', label: 'Skill Name' },
  { key: 'pct', label: 'Proficiency %', type: 'number' },
]

// ── Animated skill bar — triggers on intersection ────────────────────────────
function SkillBar({ pct }) {
  const barRef = useRef()
  const [active, setActive] = useState(false)

  // Re-trigger animation whenever pct changes (e.g. after admin saves)
  useEffect(() => {
    setActive(false)
    const el = barRef.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        // Double rAF ensures the browser has painted the reset before animating
        requestAnimationFrame(() => requestAnimationFrame(() => setActive(true)))
        io.disconnect()
      }
    }, { threshold: 0.3 })
    io.observe(el)
    return () => io.disconnect()
  }, [pct])

  const color = pct >= 85
    ? 'linear-gradient(90deg,#00ff88,#00d4ff)'
    : pct >= 70
      ? 'linear-gradient(90deg,#00d4ff,#7c5cbf)'
      : 'linear-gradient(90deg,#ff6b35,#ff4757)'
  const glow = pct >= 85
    ? '0 0 10px rgba(0,255,136,0.55)'
    : pct >= 70
      ? '0 0 10px rgba(0,212,255,0.45)'
      : '0 0 10px rgba(255,107,53,0.45)'

  return (
    <div
      ref={barRef}
      style={{ height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden', position: 'relative' }}
    >
      <div style={{
        position: 'absolute', inset: 0, background: color, borderRadius: 4,
        boxShadow: glow,
        transform: `scaleX(${active ? pct / 100 : 0})`,
        transformOrigin: 'left center',
        transition: 'transform 1.2s cubic-bezier(0.16,1,0.3,1)',
        willChange: 'transform',
        overflow: 'hidden',
      }}>
        {active && (
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(90deg,transparent 0%,rgba(255,255,255,0.55) 50%,transparent 100%)',
            animation: 'skillShimmer 1.6s ease-out 0.4s both',
            willChange: 'transform',
          }} />
        )}
      </div>
      <style>{`@keyframes skillShimmer{0%{transform:translateX(-100%)}100%{transform:translateX(200%)}}`}</style>
    </div>
  )
}

// ── Per-skill row (name + bar) ────────────────────────────────────────────────
function SkillItem({ skill, catIdx, skillIdx }) {
  const { value: livePct } = useInlineEdit(`skills.cat.${catIdx}.item.${skillIdx}.pct`, skill.pct)
  const pct = Number(livePct) || skill.pct
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, fontSize: 15 }}>
        <span style={{ color: 'var(--text)', flex: 1, minWidth: 0, paddingRight: 8 }}>
          <EditableText contentKey={`skills.cat.${catIdx}.item.${skillIdx}.name`} defaultValue={skill.name} />
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--green)', flexShrink: 0 }}>
          <EditableNumber contentKey={`skills.cat.${catIdx}.item.${skillIdx}.pct`} defaultValue={skill.pct} suffix="%" />
        </span>
      </div>
      <SkillBar pct={pct} />
    </div>
  )
}

// ── Skills list inside a category card ───────────────────────────────────────
function SkillList({ catIdx, items, isAdmin, onUpdate }) {
  const [editIdx, setEditIdx] = useState(null)
  const [draft, setDraft]     = useState({})

  const openEdit   = (idx) => { setEditIdx(idx); setDraft(idx === -1 ? { name: '', pct: 80 } : { ...items[idx] }) }
  const commitEdit = () => { const next = editIdx === -1 ? [...items, draft] : items.map((it, i) => i === editIdx ? draft : it); onUpdate(next); setEditIdx(null) }
  const deleteItem = (idx) => onUpdate(items.filter((_, i) => i !== idx))
  const moveItem   = (idx, dir) => {
    const next = [...items]; const t = idx + dir
    if (t < 0 || t >= next.length) return
    ;[next[idx], next[t]] = [next[t], next[idx]]; onUpdate(next)
  }

  return (
    <>
      {items.map((skill, si) => (
        <div key={si} style={{ position: 'relative' }} className="sk-item-row">
          <SkillItem skill={skill} catIdx={catIdx} skillIdx={si} />
          {isAdmin && (
            <div className="sk-item-toolbar" style={{ position: 'absolute', top: 0, right: 0, display: 'flex', gap: 3, opacity: 0, transition: 'opacity 0.2s', zIndex: 5 }}>
              {['↑','↓'].map((a, di) => <button key={a} onClick={() => moveItem(si, di === 0 ? -1 : 1)} style={toolBtn}>{a}</button>)}
              <button onClick={() => openEdit(si)} style={{ ...toolBtn, color: 'var(--cyan)' }}>✎</button>
              <button onClick={() => deleteItem(si)} style={{ ...toolBtn, color: 'var(--red)' }}>✕</button>
            </div>
          )}
        </div>
      ))}
      {isAdmin && (
        <button
          onClick={() => openEdit(-1)}
          style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2, padding: '7px 14px', marginTop: 8, background: 'rgba(0,255,136,0.07)', border: '1px dashed rgba(0,255,136,0.4)', color: 'var(--green)', cursor: 'pointer', width: '100%', transition: 'all 0.2s', borderRadius: 2 }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,255,136,0.14)'}
          onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,255,136,0.07)'}
        >+ Add Skill</button>
      )}
      {editIdx !== null && (
        <>
          <div onClick={() => setEditIdx(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', zIndex: 99995 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: 'var(--bg2)', border: '1px solid var(--green)', boxShadow: '0 0 60px rgba(0,255,136,0.15)', padding: 32, width: '100%', maxWidth: 420, zIndex: 99996 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 3, color: 'var(--green)', marginBottom: 20 }}>{editIdx === -1 ? '+ ADD SKILL' : '✎ EDIT SKILL'}</div>
            {SKILL_FIELDS.map(f => (
              <div key={f.key} style={{ marginBottom: 16 }}>
                <label style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>{f.label}</label>
                <input type={f.type || 'text'} value={draft[f.key] ?? ''} onChange={e => setDraft(d => ({ ...d, [f.key]: f.type === 'number' ? Number(e.target.value) : e.target.value }))} style={modalInput} />
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button onClick={commitEdit} style={modalSaveBtn}>SAVE</button>
              <button onClick={() => setEditIdx(null)} style={modalCancelBtn}>CANCEL</button>
            </div>
          </div>
        </>
      )}
      <style>{`.sk-item-row:hover .sk-item-toolbar { opacity: 1 !important; }`}</style>
    </>
  )
}

// ── Category card ─────────────────────────────────────────────────────────────
function SkillCategory({ cat, i, isAdmin, cats, onCatsChange }) {
  const ref     = useReveal()
  const cardRef = useRef(null)
  useLordiconScript()

  const handleMouseMove  = useCallback((e) => {
    const el = cardRef.current; if (!el) return
    const rect = el.getBoundingClientRect()
    el.style.setProperty('--mx', `${((e.clientX - rect.left) / rect.width) * 100}%`)
    el.style.setProperty('--my', `${((e.clientY - rect.top) / rect.height) * 100}%`)
  }, [])
  const handleMouseEnter = useCallback(() => {
    const el = cardRef.current; if (!el) return
    el.style.borderColor = 'rgba(0,255,136,0.4)'
    el.style.transform   = 'translateY(-6px) scale(1.01)'
    el.style.boxShadow   = '0 20px 60px rgba(0,0,0,0.4),0 0 0 1px rgba(0,255,136,0.15),inset 0 1px 0 rgba(0,255,136,0.08)'
    el.querySelector('.sk-scan')?.classList.add('sk-scan--active')
  }, [])
  const handleMouseLeave = useCallback(() => {
    const el = cardRef.current; if (!el) return
    el.style.borderColor = 'var(--border)'; el.style.transform = ''; el.style.boxShadow = ''
    el.querySelector('.sk-scan')?.classList.remove('sk-scan--active')
  }, [])

  const updateItems = (newItems) => {
    onCatsChange(cats.map((c, ci) => ci === i ? { ...c, items: newItems } : c))
  }

  return (
    // AnimatableWrapper: wraps the whole card so admin can pick entrance/loop animations
    // from the AnimationPicker drawer and they will persist via content_blocks anim.skills.cat.<i>
    <AnimatableWrapper
      animKey={`skills.cat.${i}`}
      label={`Skills Card: ${cat.title || `Category ${i + 1}`}`}
      currentAnim="fadeUp 0.75s both"
      style={{ display: 'flex', flexDirection: 'column', flex: 1, height: '100%' }}
    >
      <div ref={ref} className="fade-up sk-card-wrapper" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div
          ref={cardRef}
          className="sk-card"
          onMouseMove={handleMouseMove}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <div className="sk-spotlight" />
          <div className="sk-scan" />
          <span className="sk-corner sk-corner--tl" />
          <span className="sk-corner sk-corner--br" />

          {/* Icon — editable via EditableIcon or IconPickerModal in CatEditModal */}
          <div style={{ fontSize: 28, marginBottom: 16, position: 'relative', zIndex: 1 }}>
            <IconDisplay value={cat.icon} size={28} />
          </div>

          {/* Category title — admin-editable inline */}
          <div style={{ fontFamily: 'var(--font-code)', fontSize: 12, letterSpacing: 3, color: 'var(--cyan)', textTransform: 'uppercase', marginBottom: 8, position: 'relative', zIndex: 1 }}>
            <EditableText contentKey={`skills.cat.${i}.title`} defaultValue={cat.title} />
          </div>

          {/* Tagline — admin-editable inline */}
          {cat.tagline !== undefined && (
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 24, opacity: 0.8, position: 'relative', zIndex: 1 }}>
              <EditableText contentKey={`skills.cat.${i}.tagline`} defaultValue={cat.tagline} />
            </div>
          )}

          {/* Skill bars */}
          <div style={{ flex: 1, position: 'relative', zIndex: 1 }}>
            <SkillList catIdx={i} items={cat.items || []} isAdmin={isAdmin} onUpdate={updateItems} />
          </div>

          {/* Proof tags — each tag is individually editable */}
          {cat.proven && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.04)', display: 'flex', flexWrap: 'wrap', gap: 6, position: 'relative', zIndex: 1 }}>
              {cat.proven.split('·').map(p => p.trim()).filter(Boolean).map((p, pi) => (
                <span key={pi} className="sk-tag">
                  <EditableText contentKey={`skills.cat.${i}.tag.${pi}`} defaultValue={p} />
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </AnimatableWrapper>
  )
}

// ── Category editor modal ─────────────────────────────────────────────────────
function CatEditModal({ cat, onSave, onClose }) {
  const [draft, setDraft]   = useState(cat ? { ...cat } : { icon: '🌐', title: '', tagline: '', proven: '' })
  const [iconOpen, setIconOpen] = useState(false)
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', zIndex: 99995 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: 'var(--bg2)', border: '1px solid var(--green)', boxShadow: '0 0 60px rgba(0,255,136,0.15)', padding: 32, width: '100%', maxWidth: 520, zIndex: 99996, maxHeight: '85vh', overflowY: 'auto' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 3, color: 'var(--green)', marginBottom: 20 }}>{cat ? '✎ EDIT CATEGORY' : '+ ADD CATEGORY'}</div>

        {/* Icon */}
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>ICON</label>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div onClick={() => setIconOpen(true)} style={{ width: 52, height: 52, fontSize: 28, background: 'var(--bg3)', border: '1px solid rgba(0,212,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', borderRadius: 4 }}>
              <IconDisplay value={draft.icon} size={36} />
            </div>
            <input value={draft.icon || ''} onChange={e => setDraft(d => ({ ...d, icon: e.target.value }))} placeholder="or paste emoji / lordicon URL" style={{ ...modalInput, marginBottom: 0, flex: 1 }} />
          </div>
        </div>

        {/* Title, tagline, proven */}
        {[
          { key: 'title',   label: 'CATEGORY TITLE' },
          { key: 'tagline', label: 'SHORT DESCRIPTION' },
          { key: 'proven',  label: 'PROOF POINTS (· separated)' },
        ].map(f => (
          <div key={f.key} style={{ marginBottom: 16 }}>
            <label style={labelStyle}>{f.label}</label>
            <input value={draft[f.key] || ''} onChange={e => setDraft(d => ({ ...d, [f.key]: e.target.value }))} style={modalInput} />
          </div>
        ))}

        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button onClick={() => onSave(draft)} style={modalSaveBtn}>SAVE</button>
          <button onClick={onClose} style={modalCancelBtn}>CANCEL</button>
        </div>
        {iconOpen && <IconPickerModal currentValue={draft.icon} onSave={v => { setDraft(d => ({ ...d, icon: v })); setIconOpen(false) }} onClose={() => setIconOpen(false)} />}
      </div>
    </>
  )
}

// ── Main Skills section ───────────────────────────────────────────────────────
export default function Skills() {
  const headerRef = useReveal()
  const titleRef  = useSplitTextReveal({ staggerMs: 40, fromY: 28 })
  const ctx       = useEdit()
  const isAdmin   = !!(ctx?.isAdmin && ctx?.editingEnabled)

  // categories: live state driven by DB or defaults
  const { value: rawCats, save: saveCats } = useInlineEdit('skills.categories', DEFAULT_SKILLS)
  const [cats, setCats] = useState(Array.isArray(rawCats) ? rawCats : DEFAULT_SKILLS)

  // Sync when rawCats changes (e.g. after admin saves or page loads content from API)
  useEffect(() => {
    if (Array.isArray(rawCats) && rawCats.length) setCats(rawCats)
  }, [rawCats])

  // Fallback: also try loading from dedicated /portfolio/skills endpoint
  useEffect(() => {
    api.get('/portfolio/skills').then(r => { if (r.data?.length) setCats(r.data) }).catch(() => {})
  }, [])

  const [catModal, setCatModal] = useState(null)

  const handleCatsChange = (next) => { setCats(next); saveCats(next) }
  const openAddCat       = () => setCatModal({ idx: -1, data: null })
  const openEditCat      = (i) => setCatModal({ idx: i, data: cats[i] })
  const deleteCat        = (i) => handleCatsChange(cats.filter((_, ci) => ci !== i))
  const moveCat          = (i, dir) => {
    const next = [...cats]; const t = i + dir
    if (t < 0 || t >= next.length) return
    ;[next[i], next[t]] = [next[t], next[i]]; handleCatsChange(next)
  }
  const saveCatModal = (draft) => {
    const i    = catModal.idx
    const next = i === -1
      ? [...cats, { ...draft, items: draft.items || [] }]
      : cats.map((c, ci) => ci === i ? { ...c, ...draft } : c)
    handleCatsChange(next); setCatModal(null)
  }

  return (
    <section id="skills" style={{ padding: '120px 60px', position: 'relative', zIndex: 1, borderTop: '1px solid var(--border)' }} className="skills-section">

      {/* Section header — AnimatableWrapper lets admin pick entrance animation */}
      <AnimatableWrapper animKey="skills.header" label="Skills Section Header" currentAnim="fadeUp 0.8s both">
        <div ref={headerRef} className="fade-up section-header">
          <span className="section-tag">03 /</span>
          <h2 ref={titleRef} className="section-title">Skills</h2>
          <div className="section-line" />
        </div>
      </AnimatableWrapper>

      {/*
        Auto-grid: repeat(auto-fit, minmax(...))
        - Automatically wraps to new rows when new categories are added by admin
        - Used tracks stay centered instead of stretching across the whole page
        - align-items: stretch ensures all cards in a row are the same height
      */}
      <div className="skills-grid">
        {cats.map((cat, i) => (
          <div key={i} className="sk-cell" style={{ position: 'relative' }}>
            <SkillCategory cat={cat} i={i} isAdmin={isAdmin} cats={cats} onCatsChange={handleCatsChange} />
            {isAdmin && (
              <div className="sk-cat-toolbar" style={{ position: 'absolute', top: 8, right: 8, zIndex: 20, display: 'flex', gap: 4, opacity: 0, transition: 'opacity 0.2s' }}>
                {['↑','↓'].map((a, di) => <button key={a} onClick={() => moveCat(i, di === 0 ? -1 : 1)} style={toolBtn}>{a}</button>)}
                <button onClick={() => openEditCat(i)} style={{ ...toolBtn, color: 'var(--cyan)' }}>✎</button>
                <button onClick={() => deleteCat(i)}   style={{ ...toolBtn, color: 'var(--red)' }}>✕</button>
              </div>
            )}
          </div>
        ))}

        {/* Add Category — sits in the grid as an extra cell, auto-positioned */}
        {isAdmin && (
          <div className="sk-add-cell">
            <button onClick={openAddCat} className="sk-add-btn">
              <span style={{ fontSize: 22, marginBottom: 8, display: 'block' }}>+</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2 }}>ADD CATEGORY</span>
            </button>
          </div>
        )}
      </div>

      {catModal && (
        <CatEditModal
          cat={catModal.data}
          onSave={saveCatModal}
          onClose={() => setCatModal(null)}
        />
      )}

      <style>{`
        /* ── Grid ──────────────────────────────────────────────────────────────
           auto-fill + minmax: cards wrap automatically when new ones are added.
           No fixed column count — works for 1 card or 20 cards.
        ────────────────────────────────────────────────────────────────────── */
        .skills-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 340px));
          gap: 24px;
          align-items: stretch;
          justify-content: center;
          width: min(100%, 1500px);
          margin: 48px auto 0;
        }

        /* Each cell is a flex column so the card fills its grid area */
        .sk-cell {
          display: flex;
          flex-direction: column;
        }
        .sk-cell:hover .sk-cat-toolbar { opacity: 1 !important; }

        /* Card wrapper stretches to fill its cell */
        .sk-card-wrapper {
          display: flex;
          flex-direction: column;
          flex: 1;
          height: 100%;
        }

        /* Card: flex column so proof-tag footer sticks to bottom */
        .sk-card {
          position: relative;
          display: flex;
          flex-direction: column;
          flex: 1;
          padding: 32px;
          background: var(--bg2);
          border: 1px solid var(--border);
          border-radius: 4px;
          overflow: hidden;
          transition: border-color .35s ease, transform .35s cubic-bezier(.34,1.56,.64,1), box-shadow .35s ease;
          cursor: default;
          --mx: 50%; --my: 50%;
        }

        /* Add-category placeholder cell */
        .sk-add-cell {
          display: flex;
          min-height: 160px;
          width: 100%;
        }
        .sk-add-btn {
          flex: 1;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          background: transparent;
          border: 2px dashed rgba(0,255,136,0.25);
          color: var(--green);
          cursor: pointer;
          border-radius: 4px;
          transition: all 0.25s;
          padding: 32px;
        }
        .sk-add-btn:hover {
          background: rgba(0,255,136,0.05);
          border-color: rgba(0,255,136,0.55);
        }

        /* Spotlight */
        .sk-spotlight {
          position: absolute; inset: 0; pointer-events: none; border-radius: inherit;
          opacity: 0; background: radial-gradient(200px circle at var(--mx) var(--my), rgba(0,255,136,0.07) 0%, transparent 70%);
          transition: opacity .3s ease; z-index: 0;
        }
        .sk-card:hover .sk-spotlight { opacity: 1; }

        /* Scan line */
        .sk-scan {
          position: absolute; left: 0; right: 0; height: 2px;
          background: linear-gradient(90deg,transparent,rgba(0,255,136,0.5),transparent);
          top: -2px; pointer-events: none; z-index: 2; opacity: 0;
        }
        .sk-scan--active { opacity: 1; animation: scanLine 1.4s ease-out forwards; }
        @keyframes scanLine { 0%{top:0%;opacity:1} 80%{top:96%;opacity:1} 100%{top:100%;opacity:0} }

        /* Corner accents */
        .sk-corner { position:absolute; width:14px; height:14px; pointer-events:none; transition:border-color .35s,width .35s,height .35s; z-index:3; }
        .sk-corner--tl { top:8px;left:8px; border-top:1.5px solid rgba(0,255,136,0); border-left:1.5px solid rgba(0,255,136,0); }
        .sk-corner--br { bottom:8px;right:8px; border-bottom:1.5px solid rgba(0,255,136,0); border-right:1.5px solid rgba(0,255,136,0); }
        .sk-card:hover .sk-corner--tl,.sk-card:hover .sk-corner--br { width:20px;height:20px; border-color:rgba(0,255,136,0.7); }

        /* Proof tags */
        .sk-tag { font-family:var(--font-mono);font-size:9px;letter-spacing:1px;padding:3px 8px; background:rgba(0,255,136,0.06);border:1px solid rgba(0,255,136,0.15);color:var(--muted);border-radius:2px;transition:all .25s; }
        .sk-card:hover .sk-tag { background:rgba(0,255,136,0.10);border-color:rgba(0,255,136,0.30);color:var(--cyan); }

        /* responsive handled by globals.css */
      `}</style>
    </section>
  )
}

const toolBtn      = { fontFamily:'monospace',fontSize:11,padding:'4px 8px',background:'rgba(0,0,0,0.85)',border:'1px solid var(--border)',color:'var(--muted)',cursor:'pointer',backdropFilter:'blur(4px)',borderRadius:2 }
const labelStyle   = { fontFamily:'var(--font-mono)',fontSize:10,letterSpacing:2,color:'var(--muted)',display:'block',marginBottom:6 }
const modalInput   = { width:'100%',background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',fontFamily:'var(--font-display)',fontSize:15,padding:'10px 14px',outline:'none',boxSizing:'border-box' }
const modalSaveBtn   = { flex:1,padding:'12px',background:'rgba(0,255,136,0.15)',border:'1px solid rgba(0,255,136,0.4)',color:'var(--green)',fontFamily:'var(--font-mono)',fontSize:11,letterSpacing:2,cursor:'pointer' }
const modalCancelBtn = { flex:1,padding:'12px',background:'transparent',border:'1px solid var(--border)',color:'var(--muted)',fontFamily:'var(--font-mono)',fontSize:11,letterSpacing:2,cursor:'pointer' }
