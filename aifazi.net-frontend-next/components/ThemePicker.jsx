'use client'
import { useState, useEffect } from 'react'
import { useTheme } from '@/app/providers'
import api from '@/lib/api'
import { clearSiteSettingsCache } from '@/lib/siteSettings'
import { HEADER_PRESETS, FOOTER_PRESETS, HeaderPreviewSVG, FooterPreviewSVG } from '../pages-src/admin/SiteSettings'
import { THEME_PACKAGES } from '../core/framework-styles.js'
import { notify } from '../core/notify.jsx'

// ── All themes (one card per family — toggle switches dark↔light within family) ─
const THEMES = [
  // ── COLOR VARIANTS ───────────────────────────────────────────────────────
  {
    id: 'cyber-dark', name: 'Cyber', tag: 'DARK', type: 'color', style: 'cyber',
    desc: 'Default hacker green',
    bg: '#060a0f', bg2: '#0b1118', bg3: '#111a24', primary: '#00ff88', secondary: '#00d4ff',
    text: '#c8d8e8', muted: '#6b8296', border: 'color-mix(in srgb, var(--cyan) 15%, transparent)',
  },
  {
    id: 'midnight', name: 'Midnight', tag: 'DARK', type: 'color', style: 'cyber',
    desc: 'Deep violet & pink',
    bg: '#08051a', bg2: '#0e0a24', bg3: '#16102e', primary: '#a855f7', secondary: '#ec4899',
    text: '#e2d9f3', muted: '#6b5a8a', border: 'rgba(168,85,247,0.18)',
  },
  {
    id: 'crimson', name: 'Crimson', tag: 'DARK', type: 'color', style: 'cyber',
    desc: 'Blood red & amber',
    bg: '#0f0608', bg2: '#1a0b0e', bg3: '#241014', primary: '#ef4444', secondary: '#f97316',
    text: '#f0d0d4', muted: '#8a6068', border: 'rgba(239,68,68,0.18)',
  },
  {
    id: 'ocean', name: 'Ocean', tag: 'DARK', type: 'color', style: 'cyber',
    desc: 'Electric blue & teal',
    bg: '#020d1a', bg2: '#061525', bg3: '#0b1f33', primary: '#3b82f6', secondary: '#06b6d4',
    text: '#c0d8f0', muted: '#4a6880', border: 'rgba(59,130,246,0.18)',
  },
  {
    id: 'amber', name: 'Amber', tag: 'DARK', type: 'color', style: 'cyber',
    desc: 'Warm gold & orange',
    bg: '#0f0a02', bg2: '#1a1405', bg3: '#241c08', primary: '#f59e0b', secondary: '#f97316',
    text: '#fef3c7', muted: '#927040', border: 'rgba(245,158,11,0.18)',
  },
  {
    id: 'rose', name: 'Rose', tag: 'DARK', type: 'color', style: 'cyber',
    desc: 'Soft pink & coral',
    bg: '#0f0609', bg2: '#1a0c12', bg3: '#24121a', primary: '#f472b6', secondary: '#fb7185',
    text: '#fde8f0', muted: '#8a6070', border: 'rgba(244,114,182,0.18)',
  },
  {
    id: 'forest', name: 'Forest', tag: 'DARK', type: 'color', style: 'cyber',
    desc: 'Jungle green & lime',
    bg: '#020b04', bg2: '#051508', bg3: '#091f0d', primary: '#4ade80', secondary: '#a3e635',
    text: '#d1fae5', muted: '#4a7858', border: 'rgba(74,222,128,0.15)',
  },
  {
    id: 'lava', name: 'Lava', tag: 'DARK', type: 'color', style: 'cyber',
    desc: 'Molten magma',
    bg: '#0a0502', bg2: '#140a04', bg3: '#1e0f06', primary: '#ff3d00', secondary: '#ff9100',
    text: '#ffe8d6', muted: '#8a5a40', border: 'rgba(255,61,0,0.2)',
  },
  {
    id: 'toxic', name: 'Toxic', tag: 'DARK', type: 'color', style: 'cyber',
    desc: 'Hazard acid',
    bg: '#060803', bg2: '#0b1005', bg3: '#121a08', primary: '#a3e635', secondary: '#ccff00',
    text: '#ecffc8', muted: '#6a7a3a', border: 'rgba(163,230,53,0.2)',
  },
  {
    id: 'ice', name: 'Ice', tag: 'LIGHT', type: 'color', style: 'cyber',
    desc: 'Arctic frost',
    bg: '#eef4fa', bg2: '#e3edf7', bg3: '#d8e6f2', primary: '#0284c7', secondary: '#0891b2',
    text: '#0b1a2a', muted: '#4a6a86', border: 'rgba(2,132,199,0.22)',
  },
  // ── DESIGN STYLE THEMES ──────────────────────────────────────────────────
  {
    id: 'glass-dark', name: 'Glass', tag: 'STYLE', type: 'design', style: 'glass',
    desc: 'Frosted glassmorphism',
    bg: '#04080f', bg2: 'rgba(10,18,32,0.45)', bg3: 'rgba(16,26,46,0.55)', primary: '#00e5ff', secondary: '#7b61ff',
    text: '#d0e8ff', muted: '#5a7898', border: 'rgba(0,229,255,0.22)',
  },
  {
    id: 'brutalist', name: 'Brutal', tag: 'LIGHT', type: 'design', style: 'brutalist',
    desc: 'Raw bold brutalism',
    bg: '#f2f0ec', bg2: '#e8e5df', bg3: '#dedad2', primary: '#e8000d', secondary: '#000000',
    text: '#000000', muted: '#555555', border: '#000000',
  },
  {
    id: 'synthwave', name: 'Synth', tag: 'STYLE', type: 'design', style: 'synthwave',
    desc: 'Retro 80s arcade',
    bg: '#0d0618', bg2: '#130828', bg3: '#180a30', primary: '#ff2d8b', secondary: '#00f0ff',
    text: '#f0d8ff', muted: '#7858a0', border: 'rgba(255,45,139,0.28)',
  },
  {
    id: 'paper', name: 'Paper', tag: 'LIGHT', type: 'design', style: 'paper',
    desc: 'Minimal editorial',
    bg: '#f5f0e8', bg2: '#ede8df', bg3: '#e4ddd3', primary: '#c41a1a', secondary: '#1a3a6c',
    text: '#1a1a1a', muted: '#6b6060', border: 'rgba(0,0,0,0.18)',
  },
  {
    id: 'neumorph', name: 'Neumorph', tag: 'STYLE', type: 'design', style: 'neumorph',
    desc: 'Soft 3D neumorphism',
    bg: '#e0e5ec', bg2: '#e8edf4', bg3: '#d6dbe4', primary: '#6c63ff', secondary: '#4ecdc4',
    text: '#2d3748', muted: '#718096', border: 'rgba(108,99,255,0.15)',
  },
  {
    id: 'terminal', name: 'Terminal', tag: 'STYLE', type: 'design', style: 'terminal',
    desc: 'Old-school DOS/CRT',
    bg: '#0a0a0a', bg2: '#0f0f0f', bg3: '#141414', primary: '#33ff33', secondary: '#ffcc00',
    text: '#33ff33', muted: '#228822', border: 'rgba(51,255,51,0.25)',
  },
  {
    id: 'macos', name: 'macOS', tag: 'LIGHT', type: 'design', style: 'macos',
    desc: 'Apple-inspired minimal',
    bg: '#f5f5f7', bg2: '#ffffff', bg3: '#ebebed', primary: '#0071e3', secondary: '#34aadc',
    text: '#1d1d1f', muted: '#86868b', border: 'rgba(0,0,0,0.12)',
  },
  {
    id: 'neon-noir', name: 'Neon Noir', tag: 'DARK', type: 'design', style: 'neon-noir',
    desc: 'Cinematic dark neon',
    bg: '#0a0a0e', bg2: '#10101a', bg3: '#16161f', primary: '#ff6b35', secondary: '#cc44ff',
    text: '#d8d0e0', muted: '#6a5a7a', border: 'rgba(204,68,255,0.2)',
  },
  {
    id: 'pastel', name: 'Pastel', tag: 'LIGHT', type: 'design', style: 'pastel',
    desc: 'Soft dreamy pastels',
    bg: '#fdf4ff', bg2: '#fff0fb', bg3: '#f5e8ff', primary: '#c084fc', secondary: '#f9a8d4',
    text: '#3d1f5c', muted: '#9d6db8', border: 'rgba(192,132,252,0.3)',
  },
  {
    id: 'win95', name: 'Win95', tag: 'STYLE', type: 'design', style: 'win95',
    desc: 'Classic Windows 95',
    bg: '#008080', bg2: '#c0c0c0', bg3: '#d4d0c8', primary: '#000080', secondary: '#ffffff',
    text: '#000000', muted: '#444444', border: '#808080',
  },
  {
    id: 'aurora', name: 'Aurora', tag: 'DARK', type: 'design', style: 'aurora',
    desc: 'Northern lights gradient',
    bg: '#050d1a', bg2: '#08142a', bg3: '#0c1c38', primary: '#64ffda', secondary: '#ff6fd8',
    text: '#cce8ff', muted: '#5a8099', border: 'rgba(100,255,218,0.2)',
  },
  // ── GAME THEMES ────────────────────────────────────────────────────────────
  {
    id: 'mario', name: 'Mario', tag: 'GAME', type: 'design', style: 'mario',
    desc: 'Warp-pipe red & coin gold',
    bg: '#0a0d1c', bg2: '#10142a', bg3: '#161a36', primary: '#e52521', secondary: '#ffd700',
    text: '#fdf6e3', muted: '#8a7f66', border: 'rgba(229,37,33,0.3)',
  },
  {
    id: 'minecraft', name: 'Minecraft', tag: 'GAME', type: 'design', style: 'minecraft',
    desc: 'Creeper green & blocky depth',
    bg: '#141210', bg2: '#1d1a17', bg3: '#262219', primary: '#5ad427', secondary: '#2a9dd6',
    text: '#d8d5c8', muted: '#6f6a5a', border: 'rgba(90,212,39,0.28)',
  },
  {
    id: 'sonic', name: 'Sonic', tag: 'GAME', type: 'design', style: 'sonic',
    desc: 'Speed blue & ring gold',
    bg: '#070d2b', bg2: '#0c1440', bg3: '#111a54', primary: '#1e6fd9', secondary: '#f5d200',
    text: '#e8f0ff', muted: '#5a6a9a', border: 'rgba(30,111,217,0.3)',
  },
  {
    id: 'pacman', name: 'Pac-Man', tag: 'GAME', type: 'design', style: 'pacman',
    desc: 'Arcade maze yellow & cyan',
    bg: '#05030f', bg2: '#0a0718', bg3: '#100b24', primary: '#ffe000', secondary: '#00cfff',
    text: '#f4f0ff', muted: '#5a5078', border: 'rgba(255,224,0,0.3)',
  },
  // ── THEME PACKAGES ────────────────────────────────────────────────────────
  {
    id: 'pkg:holo-deck', name: 'Holo Deck', tag: 'STYLE', type: 'package', style: 'holo',
    desc: 'Holographic command surface — layered cyan glow, corner dialogs, holo boot.',
    bg: '#08121c', bg2: '#0c1a28', bg3: '#112236', primary: '#00e5ff', secondary: '#7b61ff',
    text: '#d0e8ff', muted: '#5a7898', border: 'rgba(0,229,255,0.22)',
    packageId: 'holo-deck',
  },
  {
    id: 'pkg:phosphor-terminal', name: 'Phosphor CRT', tag: 'STYLE', type: 'package', style: 'crt',
    desc: 'Green phosphor mainframe — CRT scanlines, matrix menus, blink-cursor boot.',
    bg: '#020604', bg2: '#04100a', bg3: '#071a0e', primary: '#33ff33', secondary: '#ccff00',
    text: '#c8ffc8', muted: '#2f7a3a', border: 'rgba(51,255,51,0.25)',
    packageId: 'phosphor-terminal',
  },
]

// ── Package lookup (settings sourced from THEME_PACKAGES registry) ────────────
const PACKAGE_LOOKUP = Object.fromEntries(THEME_PACKAGES.map(p => [p.id, p]))

const CATEGORIES = [
  { id: 'overview',      icon: '⊞', label: 'OVERVIEW' },
  { id: 'header',        icon: '▬', label: 'HEADER'   },
  { id: 'footer',        icon: '▤', label: 'FOOTER'   },
  { id: 'loading',       icon: '◌', label: 'LOADING'  },
  { id: 'input',         icon: '■', label: 'INPUT'    },
  { id: 'notification',  icon: '◉', label: 'NOTIFY'   },
  { id: 'dialog',        icon: '⬜', label: 'DIALOG'   },
  { id: 'buttons',       icon: '▶', label: 'BUTTONS'  },
]

// ── Helper: style flags ───────────────────────────────────────────────────────
function flags(t) {
  return {
    isBrut:     t.style === 'brutalist',
    isGlass:    t.style === 'glass',
    isSynth:    t.style === 'synthwave',
    isPaper:    t.style === 'paper',
    isNeumorph: t.style === 'neumorph',
    isTerm:     t.style === 'terminal',
    isMacos:    t.style === 'macos',
    isNoir:     t.style === 'neon-noir',
    isPastel:   t.style === 'pastel',
    isWin95:    t.style === 'win95',
    isAurora:   t.style === 'aurora',
    isCyber:    t.style === 'cyber',
    isHolo:     t.style === 'holo',
    isCrt:      t.style === 'crt',
  }
}

function radius(t) {
  const f = flags(t)
  if (f.isBrut || f.isTerm || f.isWin95 || f.isCrt) return '0px'
  if (f.isGlass || f.isNeumorph || f.isPastel || f.isHolo) return '14px'
  if (f.isMacos) return '10px'
  if (f.isAurora) return '12px'
  return '6px'
}

function synthBg(t) {
  return {
    backgroundImage: `linear-gradient(rgba(255,45,139,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(0,240,255,0.07) 1px, transparent 1px)`,
    backgroundSize: '20px 20px',
  }
}

function auroraBg(t) {
  return {
    backgroundImage: `radial-gradient(ellipse at 20% 50%, rgba(100,255,218,0.08) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(255,111,216,0.08) 0%, transparent 60%)`,
  }
}

function noirBg(t) {
  return {
    backgroundImage: `radial-gradient(ellipse at top, rgba(204,68,255,0.06) 0%, transparent 70%), radial-gradient(ellipse at bottom, rgba(255,107,53,0.06) 0%, transparent 70%)`,
  }
}

function pastelBg(t) {
  return {
    backgroundImage: `radial-gradient(circle at 30% 30%, rgba(192,132,252,0.12) 0%, transparent 50%), radial-gradient(circle at 70% 70%, rgba(249,168,212,0.12) 0%, transparent 50%)`,
  }
}

function getExtraBg(t) {
  const f = flags(t)
  if (f.isSynth)  return synthBg(t)
  if (f.isAurora) return auroraBg(t)
  if (f.isNoir)   return noirBg(t)
  if (f.isPastel) return pastelBg(t)
  return {}
}

function getCardStyle(t, override = {}) {
  const f = flags(t)
  const r = radius(t)
  let base = {
    background: t.bg2,
    border: `${f.isBrut || f.isWin95 ? '2' : '1'}px solid ${t.border}`,
    borderRadius: r,
    ...override,
  }
  if (f.isGlass)    { base.backdropFilter = 'blur(14px)'; base.WebkitBackdropFilter = 'blur(14px)'; base.background = 'rgba(10,20,40,0.45)' }
  if (f.isNeumorph) { base.background = t.bg2; base.boxShadow = '5px 5px 12px #b8bec8, -5px -5px 12px #ffffff'; base.border = 'none' }
  if (f.isMacos)    { base.background = t.bg2; base.border = `1px solid rgba(0,0,0,0.1)`; base.boxShadow = '0 2px 12px rgba(0,0,0,0.08)' }
  if (f.isBrut)     { base.boxShadow = `3px 3px 0 ${t.secondary}` }
  if (f.isWin95)    { base.background = t.bg3; base.border = 'none'; base.boxShadow = 'inset -1px -1px 0 #808080, inset 1px 1px 0 #ffffff, inset -2px -2px 0 #404040, inset 2px 2px 0 #dfdfdf' }
  if (f.isSynth)    { base.boxShadow = `0 0 12px ${t.primary}33` }
  if (f.isNoir)     { base.boxShadow = `0 4px 20px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.04)` }
  if (f.isPastel)   { base.background = t.bg2; base.border = `1px solid rgba(192,132,252,0.3)`; base.boxShadow = '0 4px 20px rgba(192,132,252,0.1)' }
  if (f.isAurora)   { base.boxShadow = `0 4px 24px rgba(100,255,218,0.08)` }
  if (f.isTerm)     { base.background = '#0f0f0f'; base.border = `1px solid #33ff3333`; base.boxShadow = 'none' }
  if (f.isCrt)      { base.background = '#020604'; base.border = `1px solid #33ff3333`; base.boxShadow = '0 0 0 1px #33ff3322' }
  if (f.isHolo)     { base.background = 'rgba(8,18,32,0.72)'; base.border = `1px solid rgba(0,229,255,0.3)`; base.backdropFilter = 'blur(12px)'; base.WebkitBackdropFilter = 'blur(12px)'; base.boxShadow = '0 0 14px rgba(0,229,255,0.12)' }
  return base
}

// ── Overview Preview ─────────────────────────────────────────────────────────
function OverviewPreview({ t }) {
  const f = flags(t)
  const r = radius(t)
  const cs = getCardStyle(t)
  const xBg = getExtraBg(t)
  return (
    <div style={{ padding: 14, background: t.bg, borderRadius: 8, height: 148, overflow: 'hidden', ...xBg,
      ...(f.isWin95 ? { background: t.bg } : {}),
    }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <div style={{ flex: 1, ...cs, padding: '8px 10px' }}>
          <div style={{ height: 3, background: t.primary, borderRadius: 2, marginBottom: 6, width: '70%',
            ...(f.isSynth ? { boxShadow: `0 0 6px ${t.primary}` } : {}),
            ...(f.isAurora ? { background: `linear-gradient(90deg, ${t.primary}, ${t.secondary})` } : {}),
          }}/>
          <div style={{ height: 2, background: t.muted, borderRadius: 2, marginBottom: 3, width: '90%', opacity: 0.5 }}/>
          <div style={{ height: 2, background: t.muted, borderRadius: 2, width: '60%', opacity: 0.3 }}/>
          {f.isTerm && <div style={{ height: 2, background: t.primary, width: '40%', marginTop: 3, opacity: 0.7 }}/>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 52 }}>
          {[t.primary, t.secondary].map((c, i) => (
            <div key={i} style={{ ...getCardStyle(t), padding: '5px 7px' }}>
              <div style={{ height: 8, width: '100%', background: c, borderRadius: f.isBrut||f.isWin95 ? 0 : 3,
                ...(f.isSynth ? { boxShadow: `0 0 6px ${c}` } : {}),
              }}/>
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {/* Primary btn */}
        <div style={{ flex: 1, height: 22, borderRadius: f.isBrut||f.isWin95 ? 0 : f.isPastel ? 20 : f.isMacos ? 6 : 4,
          background: f.isWin95 ? t.bg3 : t.primary,
          border: f.isWin95 ? 'none' : f.isBrut ? `2px solid ${t.secondary}` : 'none',
          boxShadow: f.isWin95 ? 'inset -1px -1px 0 #808080, inset 1px 1px 0 #ffffff, inset -2px -2px 0 #404040, inset 2px 2px 0 #dfdfdf' : f.isSynth ? `0 0 10px ${t.primary}88` : f.isNeumorph ? '2px 2px 5px #b8bec8, -1px -1px 4px #ffffff' : 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: 7, fontWeight: 800, color: f.isWin95 ? '#000' : f.isBrut ? t.bg : '#000', letterSpacing: 1 }}>APPLY</span>
        </div>
        <div style={{ padding: '4px 8px', background: 'transparent', borderRadius: f.isBrut||f.isWin95 ? 0 : 4,
          border: f.isWin95 ? 'none' : `1px solid ${t.primary}`,
          boxShadow: f.isWin95 ? 'inset -1px -1px 0 #808080, inset 1px 1px 0 #ffffff' : 'none',
        }}>
          <span style={{ fontSize: 7, color: f.isWin95 ? '#000' : t.primary }}>CANCEL</span>
        </div>
        <div style={{ padding: '3px 7px', background: `${t.primary}20`,
          border: `1px solid ${t.border}`, borderRadius: f.isBrut||f.isWin95 ? 0 : f.isPastel ? 20 : 10,
        }}>
          <span style={{ fontSize: 7, color: t.primary }}>TAG</span>
        </div>
      </div>
    </div>
  )
}

// ── Loading Preview ───────────────────────────────────────────────────────────
function LoadingPreview({ t }) {
  const f = flags(t)
  const xBg = getExtraBg(t)
  return (
    <div style={{ padding: 14, background: t.bg, borderRadius: 8, height: 148, overflow: 'hidden',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, ...xBg,
    }}>
      {/* Style-specific spinner */}
      {f.isTerm ? (
        <div style={{ fontFamily: 'monospace', fontSize: 14, color: t.primary, letterSpacing: 2, textShadow: `0 0 8px ${t.primary}` }}>
          {'>_'}<span style={{ animation: 'tpBlink 0.8s infinite' }}>█</span>
        </div>
      ) : f.isWin95 ? (
        <div style={{ display: 'flex', gap: 3 }}>
          {[...Array(5)].map((_,i) => (
            <div key={i} style={{ width: 12, height: 12, background: i < 3 ? t.primary : t.bg3,
              border: '1px solid #808080', boxShadow: 'inset 1px 1px 0 #fff' }}/>
          ))}
        </div>
      ) : f.isNeumorph ? (
        <div style={{ width: 38, height: 38, borderRadius: '50%',
          background: t.bg, boxShadow: '5px 5px 12px #b8bec8, -5px -5px 12px #ffffff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ width: 24, height: 24, borderRadius: '50%',
            background: t.bg, boxShadow: `inset 3px 3px 6px #b8bec8, inset -3px -3px 6px #ffffff`,
            border: `2px solid ${t.primary}44`,
          }}/>
        </div>
      ) : f.isMacos ? (
        <div style={{ width: 28, height: 28, borderRadius: '50%',
          background: `conic-gradient(${t.primary} 0%, ${t.primary} 30%, transparent 30%, transparent 100%)`,
          animation: 'tpSpin 0.8s linear infinite',
        }}/>
      ) : f.isPastel ? (
        <div style={{ display: 'flex', gap: 5 }}>
          {[t.primary, t.secondary, '#a78bfa'].map((c,i) => (
            <div key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: c,
              animation: `tpBounce 0.8s ease-in-out ${i*0.15}s infinite alternate`,
              boxShadow: `0 0 8px ${c}88`,
            }}/>
          ))}
        </div>
      ) : (
        <div style={{ position: 'relative', width: 38, height: 38 }}>
          <div style={{ position: 'absolute', inset: 0, borderRadius: '50%',
            border: '2px solid transparent', borderTopColor: t.primary, borderBottomColor: t.secondary,
            animation: 'tpSpin 1.1s linear infinite',
            boxShadow: f.isSynth || f.isNoir || f.isAurora ? `0 0 8px ${t.primary}` : 'none',
          }}/>
          <div style={{ position: 'absolute', inset: 7, borderRadius: '50%',
            border: '1.5px solid transparent', borderLeftColor: t.secondary,
            animation: 'tpSpinR 0.7s linear infinite',
          }}/>
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            width: 6, height: 6, borderRadius: f.isBrut ? 0 : '50%',
            background: t.primary, boxShadow: `0 0 6px ${t.primary}`,
          }}/>
        </div>
      )}
      {/* Skeleton bars */}
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 5 }}>
        {[85, 65, 45].map((w, i) => (
          <div key={i} style={{
            height: f.isTerm ? 7 : 6, width: `${w}%`,
            borderRadius: f.isBrut || f.isWin95 || f.isTerm ? 0 : f.isPastel ? 10 : 3,
            background: f.isTerm
              ? `rgba(51,255,51,${0.3 - i*0.05})`
              : f.isWin95
              ? `linear-gradient(90deg, ${t.bg3}, #a8a8a8, ${t.bg3})`
              : `linear-gradient(90deg, ${t.bg2}, ${t.primary}44, ${t.bg2})`,
            backgroundSize: '200% 100%',
            animation: `tpShimmer 1.8s ease-in-out ${i * 0.2}s infinite`,
            border: f.isBrut ? `1px solid ${t.border}` : f.isNeumorph ? 'none' : 'none',
            boxShadow: f.isNeumorph ? `2px 2px 4px #b8bec8, -1px -1px 3px #ffffff` : 'none',
          }}/>
        ))}
      </div>
    </div>
  )
}

// ── Input Preview ─────────────────────────────────────────────────────────────
function InputPreview({ t }) {
  const f = flags(t)
  const r = radius(t)
  const cs = getCardStyle(t)
  return (
    <div style={{ padding: 14, background: t.bg, borderRadius: 8, height: 148, overflow: 'hidden', ...getExtraBg(t) }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div>
          <div style={{ fontSize: 7, color: t.muted, letterSpacing: 2, marginBottom: 4, fontWeight: 600,
            fontFamily: f.isTerm ? 'monospace' : 'inherit',
          }}>{f.isTerm ? '> USERNAME:' : 'USERNAME'}</div>
          <div style={{ ...cs, padding: '7px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ fontSize: 8, color: t.primary, opacity: 0.5 }}>{f.isTerm ? '>' : f.isMacos ? '' : '▶'}</div>
            <div style={{ height: 8, width: 60, background: t.primary, opacity: 0.6, borderRadius: f.isBrut||f.isWin95 ? 0 : 2 }}/>
            <div style={{ width: 1, height: 12, background: t.primary, animation: 'tpBlink 1s infinite' }}/>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 7, color: t.muted, letterSpacing: 2, marginBottom: 4, fontWeight: 600 }}>
            {f.isTerm ? '> CATEGORY:' : 'CATEGORY'}
          </div>
          <div style={{ ...cs, padding: '7px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ height: 6, width: 50, background: t.muted, opacity: 0.4, borderRadius: 2 }}/>
            <div style={{ fontSize: 8, color: t.muted }}>{f.isWin95 ? '▼' : '▾'}</div>
          </div>
        </div>
        <div style={{ background: `#ff475711`, borderRadius: f.isBrut||f.isWin95 ? 0 : 4,
          border: f.isWin95 ? '1px solid #808080' : `1px solid #ff475744`,
          padding: '5px 10px', display: 'flex', gap: 5, alignItems: 'center',
          boxShadow: f.isNeumorph ? 'inset 2px 2px 4px #b8bec8, inset -1px -1px 3px #ffffff' : 'none',
        }}>
          <span style={{ fontSize: 8, color: '#ff4757' }}>✕</span>
          <span style={{ fontSize: 8, color: '#ff4757', letterSpacing: 1 }}>FIELD REQUIRED</span>
        </div>
      </div>
    </div>
  )
}

// ── Notification Preview ──────────────────────────────────────────────────────
function NotificationPreview({ t }) {
  const f = flags(t)
  const types = [
    { icon: '✓', label: 'SUCCESS', accent: '#22c55e' },
    { icon: '⚠', label: 'WARNING', accent: '#f59e0b' },
    { icon: '✕', label: 'ERROR',   accent: '#ef4444' },
  ]
  return (
    <div style={{ padding: 14, background: t.bg, borderRadius: 8, height: 148, overflow: 'hidden', ...getExtraBg(t) }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {types.map(({ icon, label, accent }) => (
          <div key={label} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: f.isNeumorph ? t.bg2 : f.isWin95 ? t.bg3 : `${accent}10`,
            border: f.isBrut || f.isWin95 ? `2px solid ${t.secondary}` : `1px solid ${accent}44`,
            borderRadius: f.isBrut || f.isWin95 || f.isTerm ? 0 : f.isPastel ? 12 : 4,
            padding: '6px 9px', position: 'relative', overflow: 'hidden',
            boxShadow: f.isBrut ? `2px 2px 0 ${t.secondary}` : f.isNeumorph ? '3px 3px 6px #b8bec8, -2px -2px 4px #ffffff' : f.isWin95 ? 'inset -1px -1px 0 #808080, inset 1px 1px 0 #fff' : f.isSynth ? `0 0 8px ${accent}33` : 'none',
            ...(f.isGlass ? { backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', background: `rgba(${accent === '#22c55e' ? '34,197,94' : accent === '#f59e0b' ? '245,158,11' : '239,68,68'},0.08)` } : {}),
          }}>
            <div style={{ width: f.isBrut ? 4 : 2, position: 'absolute', left: 0, top: 0, bottom: 0, background: accent }}/>
            <span style={{ fontSize: 9, color: accent, fontWeight: 800, marginLeft: 5 }}>{icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ height: 5, background: accent, borderRadius: 2, width: '40%', marginBottom: 3 }}/>
              <div style={{ height: 4, background: t.muted, borderRadius: 2, width: '70%', opacity: 0.4 }}/>
            </div>
            <span style={{ fontSize: 7, color: t.muted }}>✕</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Dialog Preview ────────────────────────────────────────────────────────────
function DialogPreview({ t }) {
  const f = flags(t)
  const r = radius(t)
  const cs = getCardStyle(t)
  return (
    <div style={{ padding: 14, background: t.bg, borderRadius: 8, height: 148, overflow: 'hidden',
      display: 'flex', alignItems: 'center', justifyContent: 'center', ...getExtraBg(t),
    }}>
      {f.isWin95 ? (
        /* Win95 dialog */
        <div style={{ width: '100%', background: t.bg3,
          boxShadow: 'inset -1px -1px 0 #808080, inset 1px 1px 0 #ffffff, inset -2px -2px 0 #404040, inset 2px 2px 0 #dfdfdf',
          border: '2px solid #000',
        }}>
          <div style={{ background: t.primary, padding: '3px 6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 8, color: '#fff', fontWeight: 700, letterSpacing: 0.5 }}>⚠ Confirm</span>
            <div style={{ display: 'flex', gap: 2 }}>
              {['─','□','✕'].map(c => (
                <div key={c} style={{ width: 14, height: 12, background: t.bg3, border: '1px solid #808080',
                  boxShadow: 'inset -1px -1px 0 #404040, inset 1px 1px 0 #fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, color: '#000' }}>{c}</div>
              ))}
            </div>
          </div>
          <div style={{ padding: '10px 12px 8px' }}>
            <div style={{ height: 5, background: '#000', borderRadius: 0, width: '75%', marginBottom: 4, opacity: 0.8 }}/>
            <div style={{ height: 4, background: '#444', borderRadius: 0, width: '90%', marginBottom: 2, opacity: 0.6 }}/>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: '4px 12px 10px' }}>
            {['OK', 'Cancel'].map(lbl => (
              <div key={lbl} style={{ padding: '4px 14px', background: t.bg3,
                boxShadow: 'inset -1px -1px 0 #808080, inset 1px 1px 0 #ffffff, inset -2px -2px 0 #404040, inset 2px 2px 0 #dfdfdf',
                border: lbl === 'OK' ? '2px solid #000' : '1px solid #808080',
              }}>
                <span style={{ fontSize: 8, color: '#000', fontWeight: lbl === 'OK' ? 700 : 400 }}>{lbl}</span>
              </div>
            ))}
          </div>
        </div>
      ) : f.isMacos ? (
        /* macOS dialog */
        <div style={{ width: '100%', background: 'rgba(255,255,255,0.92)',
          borderRadius: 12, overflow: 'hidden',
          boxShadow: '0 20px 40px rgba(0,0,0,0.2), 0 0 0 0.5px rgba(0,0,0,0.1)',
          backdropFilter: 'blur(20px)',
        }}>
          <div style={{ padding: '14px 16px 10px', textAlign: 'center' }}>
            <div style={{ fontSize: 20, marginBottom: 5 }}>⚠️</div>
            <div style={{ height: 6, background: '#1d1d1f', borderRadius: 3, width: '60%', margin: '0 auto 4px' }}/>
            <div style={{ height: 4, background: '#86868b', borderRadius: 2, width: '80%', margin: '0 auto', opacity: 0.6 }}/>
          </div>
          <div style={{ borderTop: '0.5px solid rgba(0,0,0,0.1)', display: 'flex' }}>
            <div style={{ flex: 1, padding: '8px', textAlign: 'center', borderRight: '0.5px solid rgba(0,0,0,0.1)' }}>
              <span style={{ fontSize: 8, color: t.primary, fontWeight: 600, letterSpacing: 0.3 }}>Cancel</span>
            </div>
            <div style={{ flex: 1, padding: '8px', textAlign: 'center', background: `${t.primary}08` }}>
              <span style={{ fontSize: 8, color: t.primary, fontWeight: 700, letterSpacing: 0.3 }}>OK</span>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ width: '100%', ...cs, overflow: 'hidden' }}>
          <div style={{ height: f.isBrut ? 5 : 3, background: `linear-gradient(90deg, ${t.primary}, ${t.secondary})` }}/>
          <div style={{ padding: '10px 12px 8px' }}>
            <div style={{ fontSize: 7, color: t.primary, letterSpacing: 2, marginBottom: 5, opacity: 0.8 }}>⚠ CONFIRM ACTION</div>
            <div style={{ height: 6, background: t.text, borderRadius: 2, width: '75%', marginBottom: 4, opacity: 0.8 }}/>
            <div style={{ height: 4, background: t.muted, borderRadius: 2, width: '90%', marginBottom: 2, opacity: 0.4 }}/>
            <div style={{ height: 4, background: t.muted, borderRadius: 2, width: '65%', opacity: 0.3 }}/>
          </div>
          <div style={{ display: 'flex', borderTop: `1px solid ${t.border}` }}>
            <div style={{ flex: 1, padding: '7px', textAlign: 'center', borderRight: `1px solid ${t.border}` }}>
              <span style={{ fontSize: 7, color: t.muted, letterSpacing: 1 }}>CANCEL</span>
            </div>
            <div style={{ flex: 1, padding: '7px', textAlign: 'center', background: `${t.primary}18` }}>
              <span style={{ fontSize: 7, color: t.primary, letterSpacing: 1, fontWeight: 700 }}>CONFIRM</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Buttons Preview ───────────────────────────────────────────────────────────
function ButtonsPreview({ t }) {
  const f = flags(t)
  const isCyberish = f.isCyber || f.isSynth || f.isNoir || f.isAurora
  const clip = isCyberish
    ? 'polygon(0 0,calc(100% - 8px) 0,100% 8px,100% 100%,8px 100%,0 calc(100% - 8px))'
    : 'none'
  const r = radius(t)
  return (
    <div style={{ padding: 14, background: t.bg, borderRadius: 8, height: 148, overflow: 'hidden', ...getExtraBg(t) }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* Primary */}
        {f.isWin95 ? (
          <div style={{ padding: '6px 14px', background: t.bg3,
            boxShadow: 'inset -1px -1px 0 #808080, inset 1px 1px 0 #ffffff, inset -2px -2px 0 #404040, inset 2px 2px 0 #dfdfdf',
            display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #000',
          }}>
            <span style={{ fontSize: 9, color: '#000', fontWeight: 700 }}>Primary Button</span>
          </div>
        ) : f.isMacos ? (
          <div style={{ padding: '7px 14px', background: t.primary, borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 1px 3px rgba(0,0,0,0.2), 0 0 0 0.5px rgba(0,0,0,0.1)`,
          }}>
            <span style={{ fontSize: 9, fontWeight: 600, color: '#fff', letterSpacing: 0.3 }}>Primary Button</span>
          </div>
        ) : f.isNeumorph ? (
          <div style={{ padding: '8px 14px', background: t.bg, borderRadius: 8,
            boxShadow: '4px 4px 8px #b8bec8, -3px -3px 6px #ffffff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: t.primary, letterSpacing: 1 }}>PRIMARY BUTTON</span>
          </div>
        ) : f.isPastel ? (
          <div style={{ padding: '8px 14px', borderRadius: 20,
            background: `linear-gradient(135deg, ${t.primary}, ${t.secondary})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 4px 14px ${t.primary}55`,
          }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: '#fff', letterSpacing: 1 }}>Primary Button ✨</span>
          </div>
        ) : (
          <div style={{ padding: '8px 14px', clipPath: clip, borderRadius: r,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            border: f.isBrut ? `2px solid ${t.secondary}` : f.isTerm ? `1px solid ${t.primary}` : 'none',
            background: f.isTerm ? 'transparent' : t.primary,
            boxShadow: f.isBrut ? `3px 3px 0 ${t.secondary}` : f.isSynth || f.isNoir ? `0 0 14px ${t.primary}88` : f.isAurora ? `0 0 16px ${t.primary}66` : `0 0 12px ${t.primary}44`,
          }}>
            <span style={{ fontSize: 9, fontWeight: 800, color: f.isBrut ? t.bg : f.isTerm ? t.primary : '#000', letterSpacing: 2 }}>PRIMARY BUTTON</span>
          </div>
        )}
        {/* Outline */}
        <div style={{ padding: '7px 14px', background: 'transparent',
          borderRadius: f.isWin95 ? 0 : f.isMacos ? 8 : f.isPastel ? 20 : r,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: f.isWin95 ? 'none' : `${f.isBrut ? '2' : '1'}px solid ${t.secondary}`,
          boxShadow: f.isWin95 ? 'inset -1px -1px 0 #808080, inset 1px 1px 0 #fff' : f.isNeumorph ? '3px 3px 8px #b8bec8, -2px -2px 6px #ffffff' : f.isSynth ? `0 0 8px ${t.secondary}44` : 'none',
        }}>
          <span style={{ fontSize: 9, color: f.isWin95 ? '#000' : t.secondary, letterSpacing: f.isMacos ? 0.3 : 2,
            fontWeight: f.isMacos ? 500 : 400,
          }}>Outline Button</span>
        </div>
        {/* Tags row */}
        <div style={{ display: 'flex', gap: 5 }}>
          {['DEFAULT', 'ACTIVE', 'DANGER'].map((lbl, i) => (
            <div key={lbl} style={{
              padding: '3px 7px',
              borderRadius: f.isBrut || f.isWin95 || f.isTerm ? 0 : f.isPastel ? 20 : 12,
              background: i === 1 ? `${t.primary}22` : 'transparent',
              border: f.isWin95 ? 'none' : f.isNeumorph ? 'none' : i === 1 ? `1px solid ${t.primary}` : `1px solid ${t.border}`,
              boxShadow: f.isBrut ? `1px 1px 0 ${t.secondary}` : f.isNeumorph ? (i===1 ? `inset 2px 2px 4px #b8bec8, inset -1px -1px 3px #ffffff` : `2px 2px 4px #b8bec8, -1px -1px 3px #ffffff`) : f.isWin95 ? 'inset -1px -1px 0 #808080, inset 1px 1px 0 #fff' : 'none',
            }}>
              <span style={{ fontSize: 7, color: i === 1 ? t.primary : i === 2 ? '#ef4444' : f.isWin95 ? '#000' : t.muted, letterSpacing: f.isMacos ? 0 : 1 }}>{lbl}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Header Preview ────────────────────────────────────────────────────────────
function HeaderPreview({ t }) {
  const f = flags(t)
  const isLight = t.style === 'paper' || t.style === 'neumorph' || t.style === 'macos' || t.style === 'brutalist' || t.style === 'pastel' || t.style === 'win95' || t.tag === 'LIGHT'

  // Per-theme nav bar style
  const navBg = f.isWin95     ? '#c0c0c0'
    : f.isNeumorph             ? '#e0e5ec'
    : f.isMacos                ? 'rgba(245,245,247,0.85)'
    : f.isPaper                ? '#f5f0e8'
    : f.isBrut                 ? '#f2f0ec'
    : f.isPastel               ? 'rgba(253,244,255,0.9)'
    : f.isGlass                ? 'rgba(4,8,15,0.4)'
    : t.bg

  const navBorder = f.isWin95  ? 'none'
    : f.isNeumorph             ? 'none'
    : f.isMacos                ? '0.5px solid rgba(0,0,0,0.1)'
    : f.isBrut                 ? '4px solid #000'
    : f.isPaper                ? '2px solid #1a1a1a'
    : `1px solid ${t.border}`

  const navShadow = f.isWin95  ? 'inset 0 1px 0 #fff, 0 2px 0 #808080, 0 3px 0 #404040'
    : f.isNeumorph             ? '0 4px 14px #b8bec8, 0 -1px 0 #fff'
    : f.isMacos                ? '0 1px 0 rgba(0,0,0,0.08)'
    : f.isBrut                 ? '0 4px 0 #000'
    : f.isSynth                ? `0 2px 20px ${t.primary}22, 0 1px 0 ${t.primary}55`
    : f.isAurora               ? `0 2px 20px ${t.primary}15, 0 1px 0 ${t.primary}44`
    : f.isPastel               ? `0 2px 0 ${t.primary}44, 0 4px 16px ${t.primary}15`
    : `0 2px 16px rgba(0,0,0,0.3)`

  const textColor   = isLight ? t.text   : t.text2
  const mutedColor  = t.muted
  const accentColor = t.primary

  // Bottom border accent line
  const accentLine = f.isSynth  ? `linear-gradient(90deg, transparent, ${t.primary}, ${t.secondary}, ${t.primary}, transparent)`
    : f.isAurora                ? `linear-gradient(90deg, transparent, ${t.primary} 30%, ${t.secondary} 70%, transparent)`
    : f.isPastel                ? `linear-gradient(90deg, ${t.primary}, ${t.secondary}, #a78bfa, ${t.primary})`
    : f.isBrut                  ? null
    : f.isWin95                 ? null
    : `linear-gradient(90deg, ${t.primary}, ${t.secondary})`

  const navLinks = ['ABOUT', 'WORK', 'BLOG', 'CONTACT']

  return (
    <div style={{ padding: 0, background: t.bg, height: 148, overflow: 'hidden',
      backgroundImage: f.isSynth
        ? `linear-gradient(rgba(255,45,139,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(0,240,255,0.04) 1px,transparent 1px)`
        : f.isAurora
        ? `radial-gradient(ellipse at 20% 50%,${t.primary}08 0%,transparent 60%),radial-gradient(ellipse at 80% 20%,${t.secondary}08 0%,transparent 60%)`
        : 'none',
      backgroundSize: f.isSynth ? '18px 18px' : 'auto',
    }}>
      {/* Nav bar */}
      <div style={{ position: 'relative', background: navBg, border: navBorder, boxShadow: navShadow,
        padding: '0 14px', height: 40, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        backdropFilter: f.isMacos || f.isGlass ? 'blur(14px)' : 'none',
        overflow: 'hidden',
      }}>
        {/* Scan overlay for terminal */}
        {f.isTerm && (
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
            background: 'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(51,255,51,0.015) 2px,rgba(51,255,51,0.015) 4px)'
          }}/>
        )}
        {/* Accent bottom line */}
        {accentLine && !f.isWin95 && !f.isBrut && (
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2,
            background: accentLine, backgroundSize: '200% 100%', opacity: 0.9 }}/>
        )}
        {/* Progress line */}
        <div style={{ position: 'absolute', bottom: f.isBrut || f.isWin95 ? 0 : 2, left: 0, width: '38%', height: 2,
          background: `linear-gradient(90deg, ${t.primary}, ${t.secondary})`,
          boxShadow: f.isSynth || f.isAurora || f.isNoir ? `0 0 6px ${t.primary}` : 'none',
        }}/>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {f.isWin95 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 18, height: 18, background: t.primary,
                boxShadow: 'inset -1px -1px 0 rgba(0,0,0,0.3), inset 1px 1px 0 rgba(255,255,255,0.5)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }}>T</div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: '#000' }}>TANVIR</span>
            </div>
          ) : f.isBrut ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 18, height: 18, background: t.primary, border: '2px solid #000',
                display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 10, fontWeight: 900, color: '#fff' }}>T</span>
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 900, color: t.text, letterSpacing: 2 }}>TANVIR</span>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <svg width="18" height="18" viewBox="0 0 36 36" fill="none">
                <polygon points="18,1 33,9.5 33,26.5 18,35 3,26.5 3,9.5" fill="none"
                  stroke={t.primary} strokeWidth="2" opacity="0.7"/>
                <line x1="11" y1="13" x2="25" y2="13" stroke={t.primary} strokeWidth="3" strokeLinecap="round"/>
                <line x1="18" y1="13" x2="18" y2="25" stroke={t.primary} strokeWidth="3" strokeLinecap="round"/>
              </svg>
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700,
                  letterSpacing: 2, color: textColor, lineHeight: 1 }}>TANVIR</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 5, letterSpacing: 3,
                  color: accentColor, opacity: 0.8, lineHeight: 1 }}>.DEV</div>
              </div>
            </div>
          )}
        </div>

        {/* Nav links */}
        <div style={{ display: 'flex', gap: f.isBrut ? 2 : f.isWin95 ? 0 : 10, alignItems: 'center' }}>
          {navLinks.map((lbl, i) => (
            <span key={lbl} style={{
              fontFamily: f.isTerm || f.isBrut ? 'monospace' : 'var(--font-mono)',
              fontSize: f.isBrut ? 9 : 8, letterSpacing: f.isMacos ? 0.3 : 2,
              color: i === 1 ? accentColor : mutedColor, fontWeight: i === 1 ? 700 : 400,
              padding: f.isWin95 ? '2px 8px' : '2px 0',
              background: f.isWin95 && i === 1 ? t.primary : 'transparent',
              border: f.isWin95 && i === 1 ? 'none' : 'none',
              boxShadow: f.isWin95 ? 'none' : 'none',
              borderBottom: i === 1 && !f.isWin95 && !f.isBrut
                ? `1px solid ${accentColor}` : 'none',
              textShadow: (f.isSynth || f.isNoir || f.isAurora) && i === 1
                ? `0 0 8px ${accentColor}` : 'none',
            }}>{lbl}</span>
          ))}
        </div>

        {/* Right controls */}
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {/* Theme pill mockup */}
          <div style={{ width: 28, height: 14, borderRadius: f.isBrut||f.isWin95 ? 0 : 7,
            background: f.isNeumorph ? t.bg : t.bg3||t.bg2,
            border: f.isWin95 ? 'none' : `1px solid ${t.border}`,
            boxShadow: f.isNeumorph ? '2px 2px 4px #b8bec8,-1px -1px 3px #fff'
              : f.isWin95 ? 'inset -1px -1px 0 #808080,inset 1px 1px 0 #fff' : 'none',
            position: 'relative', overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', top: 2, left: 2, width: 10, height: 10,
              borderRadius: f.isBrut ? 0 : '50%',
              background: accentColor, opacity: 0.7,
            }}/>
          </div>
          {/* Sign in button */}
          <div style={{
            padding: '2px 6px', fontSize: 7,
            fontFamily: 'var(--font-mono)', letterSpacing: 1,
            color: f.isWin95 ? '#000' : accentColor,
            border: f.isWin95 ? 'none' : f.isBrut ? `2px solid #000` : `1px solid ${accentColor}55`,
            borderRadius: f.isBrut||f.isWin95 ? 0 : f.isPastel ? 10 : 3,
            background: f.isWin95 ? t.bg3 : f.isPastel ? `${accentColor}15` : 'transparent',
            boxShadow: f.isWin95 ? 'inset -1px -1px 0 #808080,inset 1px 1px 0 #fff' : 'none',
          }}>SIGN IN</div>
        </div>
      </div>

      {/* Page mockup below nav */}
      <div style={{ padding: '14px 14px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* Hero text lines */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <div style={{ height: 12, background: textColor, opacity: 0.85, borderRadius: f.isBrut ? 0 : 2,
              width: '60%', marginBottom: 6,
              boxShadow: (f.isSynth||f.isNoir||f.isAurora||f.isTerm) ? `0 0 8px ${accentColor}33` : 'none',
            }}/>
            <div style={{ height: 7, background: accentColor, borderRadius: f.isBrut ? 0 : 2,
              width: '45%', marginBottom: 5,
              boxShadow: (f.isSynth||f.isNoir||f.isAurora) ? `0 0 6px ${accentColor}55` : 'none',
            }}/>
            <div style={{ height: 4, background: mutedColor, opacity: 0.4, borderRadius: 2, width: '80%', marginBottom: 3 }}/>
            <div style={{ height: 4, background: mutedColor, opacity: 0.3, borderRadius: 2, width: '65%' }}/>
          </div>
          {/* Mini hero badge */}
          <div style={{ width: 40, height: 40, borderRadius: f.isBrut ? 0 : f.isPastel ? 20 : 6,
            background: `${accentColor}15`, border: `1px solid ${accentColor}44`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            boxShadow: (f.isSynth||f.isAurora||f.isNoir) ? `0 0 12px ${accentColor}22` : 'none',
          }}>
            <div style={{ width: 20, height: 20, borderRadius: f.isBrut ? 0 : '50%',
              background: `linear-gradient(135deg, ${accentColor}, ${t.secondary})`, opacity: 0.7 }}/>
          </div>
        </div>
        {/* CTA row */}
        <div style={{ display: 'flex', gap: 6 }}>
          <div style={{ height: 16, flex: 1, background: accentColor, borderRadius: f.isBrut ? 0 : f.isPastel ? 8 : 3,
            boxShadow: (f.isSynth||f.isAurora||f.isNoir) ? `0 0 8px ${accentColor}66` : 'none',
            clipPath: (!f.isBrut && !f.isWin95 && !f.isPastel && !f.isNeumorph && !f.isMacos && !f.isPaper)
              ? 'polygon(0 0,calc(100% - 6px) 0,100% 6px,100% 100%,6px 100%,0 calc(100% - 6px))' : 'none',
          }}/>
          <div style={{ height: 16, flex: 1, borderRadius: f.isBrut ? 0 : f.isPastel ? 8 : 3,
            border: `1px solid ${t.secondary}`,
            boxShadow: f.isNeumorph ? '2px 2px 5px #b8bec8,-1px -1px 4px #fff' : 'none',
          }}/>
        </div>
      </div>
    </div>
  )
}

// ── Footer Preview ─────────────────────────────────────────────────────────────
function FooterPreview({ t }) {
  const f = flags(t)
  const isLight = t.tag === 'LIGHT' || f.isBrut || f.isNeumorph || f.isMacos || f.isPaper || f.isPastel || f.isWin95

  const footerBg = f.isWin95 ? '#c0c0c0' : f.isNeumorph ? '#e0e5ec'
    : f.isMacos ? 'rgba(245,245,247,0.97)' : f.isPaper ? '#f5f0e8'
    : f.isBrut ? '#f2f0ec' : f.isPastel ? 'rgba(253,244,255,0.97)' : t.bg2

  const topBorder = f.isWin95 ? 'none'
    : f.isNeumorph ? 'none'
    : f.isMacos    ? '0.5px solid rgba(0,0,0,0.1)'
    : f.isBrut     ? '5px solid #000'
    : f.isPaper    ? '3px double #1a1a1a'
    : `1px solid ${t.border}`

  const topShadow = f.isWin95 ? 'inset 0 1px 0 #fff,0 -2px 0 #808080'
    : f.isNeumorph ? '0 -4px 14px #b8bec8, 0 -1px 0 #fff'
    : f.isBrut ? `0 -4px 0 #e8000d`
    : f.isSynth ? `0 -2px 20px ${t.primary}22`
    : f.isAurora  ? `0 -1px 20px ${t.primary}18`
    : f.isPastel  ? `0 -2px 0 ${t.primary}44`
    : 'none'

  const textColor   = isLight ? t.text   : t.text2
  const mutedColor  = t.muted
  const accentColor = t.primary
  const accentColor2 = t.secondary

  const cols = [
    { head: 'NAVIGATE', links: ['About', 'Projects', 'Blog', 'Contact'] },
    { head: 'PLATFORM', links: ['Forum', 'Tools', 'Files', 'Chat'] },
  ]

  return (
    <div style={{ padding: 0, background: t.bg, height: 148, overflow: 'hidden',
      display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
    }}>
      {/* Page content above footer (dimmed) */}
      <div style={{ flex: 1, padding: '8px 14px', display: 'flex', alignItems: 'flex-end', gap: 10, opacity: 0.25 }}>
        {[70,50,85,40].map((w, i) => (
          <div key={i} style={{ height: 4, width: `${w}%`, background: t.muted, borderRadius: 2 }}/>
        ))}
      </div>

      {/* Footer itself */}
      <div style={{ background: footerBg, borderTop: topBorder, boxShadow: topShadow, position: 'relative' }}>
        {/* Pastel / aurora gradient top line */}
        {(f.isPastel || f.isAurora) && (
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2,
            background: f.isPastel
              ? `linear-gradient(90deg, ${accentColor}, ${accentColor2}, #a78bfa, ${accentColor})`
              : `linear-gradient(90deg, transparent, ${accentColor} 30%, ${accentColor2} 70%, transparent)`,
            opacity: 0.7,
          }}/>
        )}
        {/* Synth gradient top */}
        {f.isSynth && (
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2,
            background: `linear-gradient(90deg, transparent, ${accentColor}, ${accentColor2}, ${accentColor}, transparent)`,
            opacity: 0.8,
          }}/>
        )}
        {/* Terminal scanlines */}
        {f.isTerm && (
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
            background: 'repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(51,255,51,0.015) 3px,rgba(51,255,51,0.015) 4px)'
          }}/>
        )}

        {/* Main footer grid */}
        <div style={{ padding: '12px 14px 8px', display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>
          {/* Brand col */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
              {f.isWin95 ? (
                <div style={{ width: 14, height: 14, background: accentColor,
                  boxShadow: 'inset -1px -1px 0 rgba(0,0,0,0.3),inset 1px 1px 0 rgba(255,255,255,0.5)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8 }}>T</div>
              ) : (
                <svg width="14" height="14" viewBox="0 0 36 36" fill="none">
                  <polygon points="18,1 33,9.5 33,26.5 18,35 3,26.5 3,9.5"
                    fill="none" stroke={accentColor} strokeWidth="2.5" opacity="0.7"/>
                  <line x1="11" y1="13" x2="25" y2="13" stroke={accentColor} strokeWidth="3.5" strokeLinecap="round"/>
                  <line x1="18" y1="13" x2="18" y2="25" stroke={accentColor} strokeWidth="3.5" strokeLinecap="round"/>
                </svg>
              )}
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700,
                letterSpacing: 2, color: textColor }}>TANVIR.DEV</span>
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 7, color: mutedColor,
              lineHeight: 1.8, marginBottom: 8 }}>
              Network Engineer<br/>UAE · Remote
            </div>
            {/* Social icons */}
            <div style={{ display: 'flex', gap: 4 }}>
              {['GH', 'LI', 'X'].map((s, i) => (
                <div key={s} style={{ width: 18, height: 18,
                  border: f.isWin95 ? 'none' : f.isBrut ? `2px solid #000` : `1px solid ${t.border}`,
                  borderRadius: f.isBrut || f.isWin95 ? 0 : f.isPastel ? 9 : 3,
                  background: f.isWin95 ? t.bg3 : 'transparent',
                  boxShadow: f.isWin95 ? 'inset -1px -1px 0 #808080,inset 1px 1px 0 #fff'
                    : f.isNeumorph ? '2px 2px 4px #b8bec8,-1px -1px 3px #fff' : 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 8, color: mutedColor, fontFamily: 'var(--font-mono)',
                }}>{s}</div>
              ))}
            </div>
          </div>

          {/* Nav cols */}
          {cols.map(col => (
            <div key={col.head}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 7, letterSpacing: 2,
                color: accentColor2, marginBottom: 6, paddingBottom: 4,
                borderBottom: f.isWin95 ? '1px solid #808080' : f.isBrut ? '2px solid #000'
                  : `1px solid ${t.border}`,
              }}>{col.head}</div>
              {col.links.map(lk => (
                <div key={lk} style={{ fontFamily: 'var(--font-mono)', fontSize: 7,
                  color: mutedColor, lineHeight: 1.9 }}>{lk}</div>
              ))}
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div style={{ padding: '6px 14px', borderTop: f.isWin95
            ? '1px solid #808080' : f.isBrut ? '2px solid #000' : `1px solid ${t.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: accentColor,
              boxShadow: (f.isSynth||f.isAurora||f.isTerm) ? `0 0 5px ${accentColor}` : 'none',
            }}/>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: mutedColor, letterSpacing: 1 }}>
              ALL SYSTEMS OK
            </span>
          </div>
          <span suppressHydrationWarning style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: mutedColor }}>
            © {new Date().getFullYear()} tanvir@aifazi.net
          </span>
        </div>
      </div>
    </div>
  )
}

function CategoryPreview({ t, category }) {
  switch (category) {
    case 'header':       return <HeaderPreview t={t} />
    case 'footer':       return <FooterPreview t={t} />
    case 'loading':      return <LoadingPreview t={t} />
    case 'input':        return <InputPreview t={t} />
    case 'notification': return <NotificationPreview t={t} />
    case 'dialog':       return <DialogPreview t={t} />
    case 'buttons':      return <ButtonsPreview t={t} />
    default:             return <OverviewPreview t={t} />
  }
}

// ── Map any theme variant back to its canonical family card ID ────────────────
function getThemeFamily(id) {
  const map = {
    'light':'cyber-dark', 'cyber-light':'cyber-dark',
    'midnight-light':'midnight', 'crimson-light':'crimson',
    'ocean-light':'ocean',       'amber-light':'amber',
    'rose-light':'rose',         'forest-light':'forest',
    'glass-light':'glass-dark',  'brutalist-dark':'brutalist',
    'synthwave-light':'synthwave','paper-dark':'paper',
    'neumorph-dark':'neumorph',  'terminal-light':'terminal',
    'macos-dark':'macos',        'neon-noir-light':'neon-noir',
    'pastel-dark':'pastel',      'win95-dark':'win95',
    'aurora-light':'aurora',
  }
  return map[id] || id
}

// ── Theme Card ────────────────────────────────────────────────────────────────
function ThemeCard({ t, isActive, isSelected, onSelect }) {
  const [hover, setHover] = useState(false)
  const f = flags(t)

  const borderColor = isSelected
    ? t.primary
    : isActive
    ? `${t.primary}88`
    : hover
    ? `${t.primary}55`
    : f.isBrut || f.isWin95
    ? t.secondary
    : 'rgba(255,255,255,0.07)'

  const cardBg = f.isGlass ? 'rgba(10,18,32,0.5)' : f.isHolo ? 'rgba(8,18,32,0.72)' : f.isCrt ? '#020604' : t.bg
  const cardShadow = isSelected
    ? `0 0 16px ${t.primary}55, 0 4px 24px rgba(0,0,0,0.5)`
    : f.isBrut || f.isWin95
    ? `3px 3px 0 ${t.secondary}`
    : f.isNeumorph
    ? '5px 5px 12px #b8bec8, -5px -5px 12px #ffffff'
    : f.isGlass && hover
    ? `0 8px 32px rgba(0,229,255,0.2)`
    : hover
    ? `0 4px 20px rgba(0,0,0,0.35)`
    : '0 2px 8px rgba(0,0,0,0.2)'

  // Style badge colors
  const tagColors = {
    'DARK':  { bg: 'color-mix(in srgb, var(--green) 12%, transparent)',  border: 'color-mix(in srgb, var(--green) 30%, transparent)',  color: '#00ff88' },
    'LIGHT': { bg: 'rgba(255,220,50,0.12)', border: 'rgba(255,220,50,0.3)', color: '#ffd700' },
    'STYLE': { bg: 'rgba(168,85,247,0.12)', border: 'rgba(168,85,247,0.3)', color: '#c084fc' },
  }
  const tagColor = tagColors[t.tag] || tagColors['DARK']

  return (
    <button
      onClick={() => onSelect(t.id)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative', background: cardBg,
        border: `${f.isBrut || f.isWin95 ? '2' : '1.5'}px solid ${borderColor}`,
        borderRadius: f.isBrut || f.isTerm || f.isWin95 ? '0' : f.isGlass || f.isNeumorph || f.isPastel ? '12px' : '10px',
        padding: '11px', cursor: 'pointer', textAlign: 'left', width: '100%',
        transition: 'border-color 0.2s, transform 0.15s, box-shadow 0.2s',
        transform: hover && !isSelected ? 'translateY(-2px)' : 'none',
        boxShadow: cardShadow,
        ...(f.isGlass ? { backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' } : {}),
        ...(f.isSynth && isSelected ? { backgroundImage: `linear-gradient(135deg, ${t.bg}, ${t.bg2})` } : {}),
        ...(f.isAurora && isSelected ? { backgroundImage: auroraBg(t).backgroundImage } : {}),
      }}
    >
      {/* Selected checkmark */}
      {isSelected && (
        <div style={{ position: 'absolute', top: 7, right: 7, width: 16, height: 16,
          borderRadius: f.isBrut || f.isWin95 ? '0' : '50%',
          background: t.primary, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 9, color: '#000', fontWeight: 900,
        }}>✓</div>
      )}
      {isActive && !isSelected && (
        <div style={{ position: 'absolute', top: 7, right: 7, width: 6, height: 6, borderRadius: '50%',
          background: t.primary, boxShadow: `0 0 6px ${t.primary}`, animation: 'tpBlink 1.8s infinite',
        }}/>
      )}
      {/* Color swatches */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 9 }}>
        {[t.bg2, t.primary, t.secondary].map((c, i) => (
          <div key={i} style={{ width: 20, height: 20,
            borderRadius: f.isBrut || f.isWin95 || f.isTerm ? 0 : f.isPastel ? 10 : 5,
            background: c,
            border: f.isNeumorph ? 'none' : '1px solid rgba(255,255,255,0.08)',
            boxShadow: f.isSynth || f.isNoir || f.isAurora ? `0 0 6px ${c}55` : f.isNeumorph ? '2px 2px 4px #b8bec8, -1px -1px 3px #fff' : 'none',
          }}/>
        ))}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 3, paddingLeft: 3 }}>
          <div style={{ height: 3, borderRadius: 2, background: t.primary, width: '80%' }}/>
          <div style={{ height: 2, borderRadius: 2, background: 'rgba(255,255,255,0.12)', width: '55%' }}/>
        </div>
      </div>
      {/* Name + tags */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, letterSpacing: 1,
          color: isSelected ? t.primary : 'rgba(255,255,255,0.82)',
        }}>{t.name}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 7, letterSpacing: 1, padding: '1px 5px',
          borderRadius: f.isBrut || f.isWin95 ? 0 : 3,
          background: tagColor.bg, border: `1px solid ${tagColor.border}`, color: tagColor.color,
        }}>{t.tag}</span>
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'rgba(255,255,255,0.3)', lineHeight: 1.3 }}>{t.desc}</div>
    </button>
  )
}

// ── Main ThemePicker Drawer ───────────────────────────────────────────────────
export default function ThemePicker({ open, onClose }) {
  const { theme, setTheme, siteConfig, refreshSiteConfig, isAdmin, userPackage, applyUserPackage, clearUserPackage } = useTheme()
  const isThemeLocked = !!(siteConfig?.lockTheme && siteConfig?.globalTheme)
  const [mounted, setMounted] = useState(() => open)
  const [pending, setPending] = useState(null)
  const [activeCategory, setActiveCategory] = useState('overview')
  const [filter, setFilter] = useState('ALL')
  const [styleFilter, setStyleFilter] = useState('ALL')

  // ── Admin global panel state ─────────────────────────────────────────────
  const [showAdminPanel, setShowAdminPanel] = useState(false)
  const [globalDraft, setGlobalDraft] = useState({
    globalTheme: '', lockTheme: false,
    loadingScreenStyle: 'terminal', animationPreset: 'smooth',
    maintenanceMode: false, maintenanceMessage: '',
    maintenanceStyle: 'terminal',
    maintenanceStatus: 'MAINTENANCE',
    maintenanceIcon: '⚙️',
    maintenanceReturnTime: '',
    maintenanceShowProgress: false,
    maintenanceProgress: 65,
    maintenanceShowSocial: false,
    maintenanceBgStyle: 'grid',
    headerStyle: 'cyber',
    footerStyle: 'cyber',
  })
  const [savingGlobal, setSavingGlobal] = useState(false)
  const [savedGlobal, setSavedGlobal] = useState(false)

  // Sync globalDraft with siteConfig whenever panel opens
  const [prevPanelOpen, setPrevPanelOpen] = useState(showAdminPanel)
  const [prevDraftCfg, setPrevDraftCfg] = useState(siteConfig)
  if ((prevPanelOpen !== showAdminPanel || prevDraftCfg !== siteConfig) && showAdminPanel && siteConfig) {
    setPrevPanelOpen(showAdminPanel)
    setPrevDraftCfg(siteConfig)
    setGlobalDraft({
        globalTheme:             siteConfig.globalTheme             || '',
        lockTheme:               siteConfig.lockTheme               || false,
        loadingScreenStyle:      siteConfig.loadingScreenStyle      || 'terminal',
        animationPreset:         siteConfig.animationPreset         || 'smooth',
        maintenanceMode:         siteConfig.maintenanceMode         || false,
        maintenanceMessage:      siteConfig.maintenanceMessage      || '',
        maintenanceStyle:        siteConfig.maintenanceStyle        || 'terminal',
        maintenanceStatus:       siteConfig.maintenanceStatus       || 'MAINTENANCE',
        maintenanceIcon:         siteConfig.maintenanceIcon         || '⚙️',
        maintenanceReturnTime:   siteConfig.maintenanceReturnTime   || '',
        maintenanceShowProgress: siteConfig.maintenanceShowProgress || false,
        maintenanceProgress:     siteConfig.maintenanceProgress     ?? 65,
        maintenanceShowSocial:   siteConfig.maintenanceShowSocial   || false,
        maintenanceBgStyle:      siteConfig.maintenanceBgStyle      || 'grid',
        headerStyle:             siteConfig.headerStyle             || 'cyber',
        footerStyle:             siteConfig.footerStyle             || 'cyber',
      })
  }

  const saveGlobalSettings = async () => {
    setSavingGlobal(true); setSavedGlobal(false)
    try {
      await api.put('/admin/site-settings', globalDraft)
      clearSiteSettingsCache()
      await refreshSiteConfig()
      // Dispatch event so Navbar/Footer re-fetch their styles immediately
      window.dispatchEvent(new CustomEvent('site-settings-updated', { detail: globalDraft }))
      setSavedGlobal(true)
      setTimeout(() => setSavedGlobal(false), 2500)
    } catch (e) { notify.error('Failed to save: ' + (e.response?.data?.error || e.message)) }
    finally { setSavingGlobal(false) }
  }

  const [prevOpen, setPrevOpen] = useState(open)
  if (prevOpen !== open) {
    setPrevOpen(open)
    if (open) {
      setMounted(true)
      setPending(null)
    }
  }

  useEffect(() => {
    if (open || !mounted) return
    const t = setTimeout(() => setMounted(false), 380)
    return () => clearTimeout(t)
  }, [open, mounted])

  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  if (!mounted) return null

  const activeTheme  = userPackage
    ? (THEMES.find(t => t.type === 'package' && t.packageId === userPackage.id) || THEMES.find(t => t.id === theme) || THEMES[0])
    : (THEMES.find(t => t.id === theme) || THEMES[0])
  const pendingTheme = THEMES.find(t => t.id === pending)
  const previewTheme = pendingTheme || activeTheme

  const colorThemes  = THEMES.filter(t => t.type === 'color')
  const designThemes = THEMES.filter(t => t.type === 'design')
  const packageThemes = THEMES.filter(t => t.type === 'package')

  const filteredThemes = THEMES.filter(t => {
    if (styleFilter === 'COLOR')   return t.type === 'color'
    if (styleFilter === 'DESIGN')  return t.type === 'design'
    if (styleFilter === 'PACKAGES') return t.type === 'package'
    if (filter === 'DARK')  return t.tag === 'DARK'
    if (filter === 'LIGHT') return t.tag === 'LIGHT'
    return true
  })

  const handleSelect = id => setPending(prev => prev === id ? null : id)
  const handleApply  = () => {
    if (!pending) return
    const item = THEMES.find(t => t.id === pending)
    if (item?.type === 'package') {
      const pkg = PACKAGE_LOOKUP[item.packageId]
      if (pkg) {
        applyUserPackage({ id: pkg.id, settings: pkg.settings })
        notify.success(`${pkg.name} applied for this browser. Admin global settings are untouched.`, { title: 'Theme Package' })
      }
    } else {
      if (userPackage) clearUserPackage()
      setTheme(pending)
    }
    setPending(null)
  }
  const handleCancel = () => setPending(null)

  return (
    <>
      <style>{`
        @keyframes tpBlink   { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes tpSpin    { to{transform:rotate(360deg)} }
        @keyframes tpSpinR   { to{transform:rotate(-360deg)} }
        @keyframes tpBounce  { from{transform:translateY(0)} to{transform:translateY(-6px)} }
        @keyframes tpShimmer {
          0%   { background-position: -200% 0; }
          100% { background-position:  200% 0; }
        }
        .tp-filter-btn:hover { border-color: var(--green) !important; color: var(--text) !important; }
        .tp-cat-btn:hover    { border-color: var(--green) !important; color: var(--text) !important; }
        .tp-close:hover      { border-color: var(--green) !important; color: var(--green) !important; }
        /*
         * .tp-drawer-chrome uses the active theme's CSS variables so the theme
         * library background and colors sync with whatever theme is applied.
         */
      `}</style>

      {/* Backdrop */}
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, zIndex: 998,
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
        opacity: open ? 1 : 0, transition: 'opacity 0.3s ease',
      }}/>

      {/* Drawer
           CSS variables are set as INLINE styles so they win over any [data-theme="..."]
           cascade rule regardless of specificity — !important on custom props is unreliable. */}
      <div className="tp-drawer-chrome" style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 999,
        width: 380, borderLeft: '1px solid color-mix(in srgb, var(--cyan) 15%, transparent)',
        boxShadow: '-24px 0 60px rgba(0,0,0,0.7)',
        display: 'flex', flexDirection: 'column',
        transform: open ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.38s cubic-bezier(0.16,1,0.3,1)',
        /* ── Drawer follows the active theme's CSS variables (data-theme cascade) ── */
        background: 'var(--bg2)',
      }}>

        {/* ── Header ── */}
        <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="13.5" cy="6.5" r=".5" fill="var(--green)"/>
                <circle cx="17.5" cy="10.5" r=".5" fill="var(--green)"/>
                <circle cx="8.5" cy="7.5" r=".5" fill="var(--green)"/>
                <circle cx="6.5" cy="12.5" r=".5" fill="var(--green)"/>
                <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>
              </svg>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 4, color: 'var(--green)' }}>THEME LIBRARY</span>
            </div>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 1, color: 'var(--muted)', margin: 0 }}>
              {isThemeLocked ? '🔒 THEME LOCKED BY ADMIN' : `${THEMES.filter(t => t.type !== 'package').length} THEMES + ${packageThemes.length} PACKAGES — SELECT THEN APPLY`}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {/* ── ADMIN ONLY: link to Admin Portal global settings ── */}
            {isAdmin && (
              <a href="/admin" onClick={onClose} title="Manage global theme & site settings in Admin Portal"
                style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer', padding: '4px 8px', borderRadius: 6, fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 1, transition: 'all .15s', display: 'flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#f59e0b'; e.currentTarget.style.color = '#f59e0b' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted)' }}
              >
                ⚙ GLOBAL
                <span style={{ fontSize: 7, background: 'rgba(245,158,11,0.15)', color: '#f59e0b', padding: '1px 4px', borderRadius: 3, letterSpacing: 1 }}>ADMIN ↗</span>
              </a>
            )}
            <button className="tp-close" onClick={onClose}
              style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--muted)',
                cursor: 'pointer', width: 28, height: 28, borderRadius: 6,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, transition: 'all 0.15s' }}>✕</button>
          </div>
        </div>

        {/* ── Component Category Tabs ── */}
        <div style={{ padding: '10px 14px 0', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 7, letterSpacing: 2, color: 'var(--muted)', marginBottom: 6 }}>PREVIEW CATEGORY</div>
          <div style={{ display: 'flex', gap: 3, overflowX: 'auto', paddingBottom: 10 }}>
            {CATEGORIES.map(cat => {
              const active = activeCategory === cat.id
              return (
                <button key={cat.id} className={active ? '' : 'tp-cat-btn'} onClick={() => setActiveCategory(cat.id)}
                  style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, padding: '5px 8px',
                    background: active ? 'var(--green)' : 'var(--bg3)',
                    border: `1px solid ${active ? 'var(--green)' : 'var(--border)'}`,
                    borderRadius: 6, cursor: 'pointer', transition: 'all 0.15s',
                    color: active ? '#000' : 'var(--muted)',
                  }}>
                  <span style={{ fontSize: 9 }}>{cat.icon}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 1, fontWeight: active ? 700 : 400 }}>{cat.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Live Preview Panel ── */}
        <div style={{ margin: '10px 14px 0', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 2, color: 'var(--muted)' }}>
              PREVIEW — {previewTheme.name.toUpperCase()} ({previewTheme.style.toUpperCase()})
            </span>
            <div style={{ display: 'flex', gap: 4 }}>
              {[previewTheme.primary, previewTheme.secondary, previewTheme.bg].map((c, i) => (
                <div key={i} style={{ width: 10, height: 10, borderRadius: 3, background: c, border: '1px solid rgba(255,255,255,0.1)' }}/>
              ))}
            </div>
          </div>
          <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
            <CategoryPreview t={previewTheme} category={activeCategory} />
          </div>
        </div>

        {/* ── Type + Tag Filters ── */}
        <div style={{ padding: '10px 14px 0', flexShrink: 0 }}>
          {/* Type row */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 7, letterSpacing: 2, color: 'var(--muted)',
              display: 'flex', alignItems: 'center', marginRight: 2 }}>TYPE:</div>
            {['ALL', 'COLOR', 'DESIGN', 'PACKAGES'].map(f => {
              const active = styleFilter === f
              const countMap = { ALL: THEMES.length, COLOR: colorThemes.length, DESIGN: designThemes.length, PACKAGES: packageThemes.length }
              return (
                <button key={f} className={active ? '' : 'tp-filter-btn'}
                  onClick={() => { setStyleFilter(f); setFilter('ALL') }}
                  style={{ flex: 1, padding: '4px 4px',
                    background: active ? 'rgba(168,85,247,0.18)' : 'transparent',
                    border: `1px solid ${active ? '#c084fc' : 'var(--border)'}`,
                    borderRadius: 5, cursor: 'pointer', transition: 'all 0.15s',
                    fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 1,
                    color: active ? '#c084fc' : 'var(--muted)', fontWeight: active ? 700 : 400,
                  }}>
                  {f} <span style={{ opacity: 0.5, fontSize: 7 }}>({countMap[f]})</span>
                </button>
              )
            })}
          </div>
          {/* Tag filter (hide in DESIGN / PACKAGES mode since those span all tags) */}
          {styleFilter !== 'DESIGN' && styleFilter !== 'PACKAGES' && (
            <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 7, letterSpacing: 2, color: 'var(--muted)',
                display: 'flex', alignItems: 'center', marginRight: 2 }}>TAG:</div>
              {['ALL', 'DARK', 'LIGHT'].map(f => {
                const active = filter === f
                return (
                  <button key={f} className={active ? '' : 'tp-filter-btn'} onClick={() => setFilter(f)}
                    style={{ flex: 1, padding: '4px 4px',
                      background: active ? `${activeTheme.primary}18` : 'transparent',
                      border: `1px solid ${active ? activeTheme.primary : 'var(--border)'}`,
                      borderRadius: 5, cursor: 'pointer', transition: 'all 0.15s',
                      fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 1,
                      color: active ? 'var(--green)' : 'var(--muted)', fontWeight: active ? 700 : 400,
                    }}>{f}</button>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Theme Grid ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 14px 8px',
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, alignContent: 'start' }}>
          {filteredThemes.map(t => (
            <ThemeCard key={t.id} t={t}
              isActive={t.type === 'package'
                ? userPackage?.id === t.packageId
                : getThemeFamily(theme) === getThemeFamily(t.id)}
              isSelected={pending === t.id}
              onSelect={handleSelect}
            />
          ))}
          {filteredThemes.length === 0 && (
            <div style={{ gridColumn: '1/-1', padding: 24, textAlign: 'center',
              fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', letterSpacing: 2 }}>
              NO THEMES IN THIS FILTER
            </div>
          )}
        </div>

        {/* ── Footer: Status + Apply ── */}
        <div style={{ borderTop: '1px solid var(--border)', padding: '12px 14px', flexShrink: 0,
          display: 'flex', flexDirection: 'column', gap: 8 }}>

          {/* Active → Pending status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8,
            background: 'var(--bg3)', borderRadius: 8, padding: '8px 10px', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', gap: 3 }}>
              {[activeTheme.bg, activeTheme.primary, activeTheme.secondary].map((c, i) => (
                <div key={i} style={{ width: 10, height: 10, borderRadius: 3, background: c, border: '1px solid rgba(255,255,255,0.08)' }}/>
              ))}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text)', letterSpacing: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {activeTheme.name}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 7, color: 'var(--muted)', letterSpacing: 1 }}>ACTIVE</div>
            </div>
            {pending && pendingTheme ? (
              <>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--green)', flexShrink: 0 }}>→</span>
                <div style={{ display: 'flex', gap: 3 }}>
                  {[pendingTheme.bg, pendingTheme.primary, pendingTheme.secondary].map((c, i) => (
                    <div key={i} style={{ width: 10, height: 10, borderRadius: 3, background: c, border: '1px solid rgba(255,255,255,0.08)' }}/>
                  ))}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: pendingTheme.primary, letterSpacing: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {pendingTheme.name}
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 7, color: 'var(--muted)', letterSpacing: 1 }}>SELECTED</div>
                </div>
              </>
            ) : (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--muted)', letterSpacing: 1, opacity: 0.6 }}>
                ← pick a theme
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 8 }}>
            {pending && (
              <button onClick={handleCancel}
                style={{ flex: '0 0 72px', padding: '10px 0',
                  background: 'transparent', border: '1px solid var(--border)', borderRadius: 6,
                  fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 2, color: 'var(--muted)', cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor='var(--text)'; e.currentTarget.style.color='var(--text)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.color='var(--muted)' }}
              >CANCEL</button>
            )}
            <button onClick={(!pending || isThemeLocked) ? undefined : handleApply}
              style={{
                flex: 1, padding: '11px 0',
                background: (pending && !isThemeLocked)
                  ? `linear-gradient(135deg, ${pendingTheme?.primary || 'var(--green)'}, ${pendingTheme?.secondary || 'var(--cyan)'})`
                  : 'var(--bg3)',
                border: (pending && !isThemeLocked) ? 'none' : '1px solid var(--border)',
                borderRadius: 7, cursor: (pending && !isThemeLocked) ? 'pointer' : 'default',
                fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 3,
                color: (pending && !isThemeLocked) ? '#000' : 'var(--muted)', fontWeight: 800,
                transition: 'all 0.2s',
                boxShadow: (pending && !isThemeLocked) ? `0 0 24px ${pendingTheme?.primary || 'var(--green)'}55` : 'none',
                opacity: (pending && !isThemeLocked) ? 1 : 0.4,
              }}
              onMouseEnter={e => { if (pending && !isThemeLocked) e.currentTarget.style.transform = 'translateY(-1px)' }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'none' }}
            >
              {isThemeLocked
                ? '🔒 THEME LOCKED BY ADMIN'
                : pending
                ? `✓ APPLY ${pendingTheme?.name?.toUpperCase() || ''}`
                : 'SELECT A THEME ABOVE'}
            </button>
          </div>
        </div>

        {/* ── ADMIN GLOBAL SETTINGS PANEL ─────────────────────────────── */}
        {showAdminPanel && isAdmin && (
          <div className="tp-drawer-chrome" style={{
            position: 'fixed', top: 0, right: 0, bottom: 0,
            width: 380, zIndex: 1001,
            background: 'var(--bg)', display: 'flex', flexDirection: 'column',
            borderLeft: '2px solid rgba(245,158,11,0.4)',
            boxShadow: '-24px 0 60px rgba(0,0,0,0.85)',
            animation: 'tp-slide-in .25s cubic-bezier(0.16,1,0.3,1)',
          }}>
            <style>{`@keyframes tp-slide-in { from{opacity:0;transform:translateX(32px)} to{opacity:1;transform:none} }`}</style>

            {/* Panel header */}
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              <span style={{ fontSize: 16 }}>⚙</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, letterSpacing: 3, color: '#f59e0b' }}>GLOBAL SETTINGS</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--muted)', letterSpacing: 1 }}>APPLIED TO ALL SITE VISITORS</div>
              </div>
              <button onClick={() => setShowAdminPanel(false)} style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer', borderRadius: 6, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>✕</button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '14px' }}>

              {/* ── 1. Global Theme ── */}
              <Section label="🎨 GLOBAL THEME" desc="Force a theme for all users visiting the site">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
                  <AdminThemeBtn id="" label="User's Choice" active={globalDraft.globalTheme === ''} onClick={() => setGlobalDraft(d => ({ ...d, globalTheme: '' }))} color="var(--muted)" />
                  {THEMES.filter(t => t.type !== 'package').map(t => (
                    <AdminThemeBtn key={t.id} id={t.id} label={t.name} active={globalDraft.globalTheme === t.id} onClick={() => setGlobalDraft(d => ({ ...d, globalTheme: t.id }))} color={t.primary} bg={t.bg2} />
                  ))}
                </div>
                <Toggle label="Lock theme (prevent user overrides)" checked={globalDraft.lockTheme} onChange={v => setGlobalDraft(d => ({ ...d, lockTheme: v }))} />
              </Section>

              {/* ── 2. Loading Screen Style ── */}
              <Section label="⏳ LOADING SCREEN" desc="Choose the loading animation users see on first visit">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {[
                    { id: 'terminal', label: 'Terminal', desc: 'Boot sequence'     },
                    { id: 'minimal',  label: 'Minimal',  desc: 'Clean spinner'     },
                    { id: 'glitch',   label: 'Glitch',   desc: 'Glitch text'       },
                    { id: 'matrix',   label: 'Matrix',   desc: 'Matrix rain'       },
                    { id: 'splash',   label: 'Splash',   desc: 'Brand reveal'      },
                    { id: 'pulse',    label: 'Pulse',    desc: 'Breathing ring'    },
                    { id: 'cyber',    label: 'Cyber',    desc: 'Hex grid boot'     },
                    { id: 'bars',     label: 'Bars',     desc: 'Progress bars'     },
                    { id: 'wave',     label: 'Wave',     desc: 'Wave sweep'        },
                    { id: 'neon',     label: 'Neon',     desc: 'Neon sign flicker' },
                  ].map(s => {
                    const active = globalDraft.loadingScreenStyle === s.id
                    return (
                      <button key={s.id} onClick={() => setGlobalDraft(d => ({ ...d, loadingScreenStyle: s.id }))}
                        style={{ padding: 0, display: 'flex', flexDirection: 'column', alignItems: 'stretch', background: active ? 'color-mix(in srgb, var(--green) 10%, transparent)' : 'var(--bg3)', border: `1px solid ${active ? 'var(--green)' : 'var(--border)'}`, borderRadius: 8, cursor: 'pointer', transition: 'all .15s', overflow: 'hidden', boxShadow: active ? '0 0 10px color-mix(in srgb, var(--green) 15%, transparent)' : 'none' }}>
                        {/* Mini animated preview */}
                        <div style={{ height: 48, background: '#060a0f', display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: `1px solid ${active ? 'color-mix(in srgb, var(--green) 30%, transparent)' : 'var(--border)'}`, overflow: 'hidden', position: 'relative' }}>
                          {s.id === 'terminal' && <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#33ff33' }}>&gt;_<span style={{ borderRight: '2px solid #33ff33', animation: 'tpBlink 1s step-end infinite', marginLeft: 2 }} /></span>}
                          {s.id === 'minimal'  && <div style={{ width: 22, height: 22, border: '3px solid #0a1118', borderTopColor: '#00ff88', borderRadius: '50%', animation: 'tpSpin 0.8s linear infinite' }} />}
                          {s.id === 'glitch'   && <span style={{ fontFamily: 'monospace', fontWeight: 900, fontSize: 15, color: '#fff', textShadow: '2px 0 #ff003c, -2px 0 #00eaff', animation: 'miniGlitch 2.5s infinite' }}>AI</span>}
                          {s.id === 'splash'   && <div style={{ textAlign: 'center' }}><div style={{ fontSize: 14, animation: 'miniZoomIn 1.8s ease-out infinite alternate' }}>⬡</div><div style={{ fontFamily: 'monospace', fontSize: 8, letterSpacing: 3, color: '#00ff88', marginTop: 1 }}>AIFAZI</div></div>}
                          {s.id === 'matrix'   && <div style={{ display: 'flex', gap: 3, fontFamily: 'monospace', fontSize: 10, color: '#00ff88' }}>{['1','0','1','0','1'].map((c,i) => <span key={i} style={{ animation: `miniDotBounce 1.2s ${i*0.15}s ease-in-out infinite`, display: 'inline-block' }}>{c}</span>)}</div>}
                          {s.id === 'pulse'    && <div style={{ position: 'relative', width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid #00ff88', animation: 'lsPulse 1.4s ease-in-out infinite' }} /><div style={{ position: 'absolute', inset: 7, borderRadius: '50%', border: '1px solid #00d4ff', animation: 'lsPulse 1.4s 0.3s ease-in-out infinite' }} /><div style={{ width: 5, height: 5, borderRadius: '50%', background: '#00ff88' }} /></div>}
                          {s.id === 'cyber'    && <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', width: 40, justifyContent: 'center' }}>{[...Array(9)].map((_,i) => <div key={i} style={{ width: 10, height: 10, border: '1px solid #00d4ff', borderRadius: 2, animation: `lsCyberHex 1.8s ${i*0.12}s ease-in-out infinite` }} />)}</div>}
                          {s.id === 'bars'     && <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 26 }}>{[0,0.15,0.3,0.45,0.6].map((d,i) => <div key={i} style={{ width: 4, borderRadius: 2, background: i%2===0?'#00ff88':'#00d4ff', animation: `lsBars 1.1s ${d}s ease-in-out infinite` }} />)}</div>}
                          {s.id === 'wave'     && <div style={{ width: 46, height: 4, background: '#0b1118', borderRadius: 3, overflow: 'hidden', position: 'relative' }}><div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg,transparent,#00ff88,#00d4ff,transparent)', animation: 'lsWave 1.4s linear infinite' }} /></div>}
                          {s.id === 'neon'     && <span style={{ fontFamily: 'monospace', fontWeight: 900, fontSize: 12, letterSpacing: 3, color: '#00ff88', animation: 'lsNeon 3s infinite' }}>NET</span>}
                        </div>
                        <div style={{ padding: '6px 6px 7px', textAlign: 'center' }}>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, color: active ? 'var(--green)' : 'var(--text)', letterSpacing: 1, marginBottom: 2 }}>{s.label}</div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 7, color: 'var(--muted)' }}>{s.desc}</div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </Section>

              {/* ── 3. Animation Preset ── */}
              <Section label="✨ ANIMATION PRESET" desc="Controls transition speed and easing across the whole site">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {[
                    { id: 'smooth',     label: 'Smooth',     desc: '0.35s elegant ease',   anim: 'apSmooth 1.8s ease infinite alternate' },
                    { id: 'snappy',     label: 'Snappy',     desc: '0.12s fast & crisp',   anim: 'apSnappy 0.8s ease infinite alternate' },
                    { id: 'bouncy',     label: 'Bouncy',     desc: '0.45s spring effect',  anim: 'apBouncy 1.4s ease infinite alternate' },
                    { id: 'expressive', label: 'Expressive', desc: 'Bold dramatic motion', anim: 'apExpressive 2s ease infinite alternate' },
                    { id: 'reduced',    label: 'Reduced',    desc: 'Subtle, accessible',   anim: 'apReduced 1.5s ease infinite alternate' },
                    { id: 'elastic',    label: 'Elastic',    desc: 'Overshoot & snap back',anim: 'apElastic 1.6s ease infinite alternate' },
                    { id: 'cinematic',  label: 'Cinematic',  desc: 'Slow dramatic ease',   anim: 'apCinematic 2.4s ease infinite alternate' },
                    { id: 'none',       label: 'None',       desc: 'No animations',        anim: null },
                  ].map(a => {
                    const active = globalDraft.animationPreset === a.id
                    return (
                      <button key={a.id} onClick={() => setGlobalDraft(d => ({ ...d, animationPreset: a.id }))}
                        style={{ padding: 0, display: 'flex', flexDirection: 'column', alignItems: 'stretch', background: active ? 'color-mix(in srgb, var(--cyan) 10%, transparent)' : 'var(--bg3)', border: `1px solid ${active ? 'var(--cyan)' : 'var(--border)'}`, borderRadius: 8, cursor: 'pointer', transition: 'all .15s', overflow: 'hidden', boxShadow: active ? '0 0 10px color-mix(in srgb, var(--cyan) 15%, transparent)' : 'none' }}>
                        <div style={{ height: 48, background: '#060a0f', display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: `1px solid ${active ? 'color-mix(in srgb, var(--cyan) 30%, transparent)' : 'var(--border)'}`, overflow: 'hidden' }}>
                          {a.id === 'none' ? (
                            <span style={{ fontFamily: 'monospace', fontSize: 18, color: '#6b8296' }}>—</span>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: 48, animation: a.anim }}>
                              <div style={{ height: 6, background: active ? '#00d4ff' : '#00ff88', borderRadius: 3, width: '100%', opacity: 0.85 }} />
                              <div style={{ height: 4, background: '#6b8296', borderRadius: 3, width: '75%', opacity: 0.5 }} />
                              <div style={{ height: 4, background: '#6b8296', borderRadius: 3, width: '50%', opacity: 0.35 }} />
                            </div>
                          )}
                        </div>
                        <div style={{ padding: '6px 6px 7px', textAlign: 'center' }}>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, color: active ? 'var(--cyan)' : 'var(--text)', letterSpacing: 1, marginBottom: 2 }}>{a.label}</div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 7, color: 'var(--muted)' }}>{a.desc}</div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </Section>

              {/* ── 4. Maintenance Mode ── */}
              <Section label="🔧 MAINTENANCE MODE" desc="Hides the site for all non-admin visitors">

                {/* Master toggle */}
                <div style={{ background: globalDraft.maintenanceMode ? 'rgba(245,158,11,0.06)' : 'var(--bg3)', border: `1px solid ${globalDraft.maintenanceMode ? 'rgba(245,158,11,0.35)' : 'var(--border)'}`, borderRadius: 8, padding: '10px 12px', marginBottom: 10, transition: 'all .2s' }}>
                  <Toggle label="Enable maintenance mode" checked={globalDraft.maintenanceMode} onChange={v => setGlobalDraft(d => ({ ...d, maintenanceMode: v }))} accent="#f59e0b" />
                  {globalDraft.maintenanceMode && (
                    <div style={{ marginTop: 8, fontFamily: 'var(--font-mono)', fontSize: 8, color: '#f59e0b', letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#f59e0b', display: 'inline-block', animation: 'tpBlink 1s infinite' }}/>
                      LIVE — VISITORS SEE MAINTENANCE PAGE
                    </div>
                  )}
                </div>

                {globalDraft.maintenanceMode && (<>

                  {/* ── Page Style ── */}
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 2, color: 'var(--muted)', marginBottom: 6 }}>PAGE STYLE</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 5, marginBottom: 12 }}>
                    {[
                      { id: 'terminal',    icon: '>_',  label: 'Terminal',    desc: 'Boot console' },
                      { id: 'cyber',       icon: '⬡',   label: 'Cyber',       desc: 'Grid & glow' },
                      { id: 'glitch',      icon: '▓',   label: 'Glitch',      desc: 'Corrupted fx' },
                      { id: 'minimal',     icon: '◌',   label: 'Minimal',     desc: 'Clean & quiet' },
                      { id: 'coming-soon', icon: '🚀',  label: 'Launch',      desc: 'Coming soon' },
                      { id: 'retro',       icon: '▶',   label: 'Retro',       desc: 'Pixel / 8-bit' },
                    ].map(s => {
                      const active = globalDraft.maintenanceStyle === s.id
                      return (
                        <button key={s.id} onClick={() => setGlobalDraft(d => ({ ...d, maintenanceStyle: s.id }))}
                          style={{ padding: '8px 6px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                            background: active ? 'rgba(245,158,11,0.12)' : 'var(--bg3)',
                            border: `1px solid ${active ? '#f59e0b' : 'var(--border)'}`,
                            borderRadius: 7, cursor: 'pointer', transition: 'all .15s' }}>
                          <span style={{ fontSize: 16, fontFamily: 'monospace' }}>{s.icon}</span>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700, color: active ? '#f59e0b' : 'var(--text)', letterSpacing: 1 }}>{s.label}</span>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 7, color: 'var(--muted)' }}>{s.desc}</span>
                        </button>
                      )
                    })}
                  </div>

                  {/* ── Status Badge Type ── */}
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 2, color: 'var(--muted)', marginBottom: 6 }}>STATUS BADGE</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 12 }}>
                    {['MAINTENANCE', 'UPDATING', 'COMING SOON', 'OFFLINE', 'UPGRADING'].map(s => {
                      const active = globalDraft.maintenanceStatus === s
                      const colors = { MAINTENANCE: '#f59e0b', UPDATING: '#3b82f6', 'COMING SOON': '#a855f7', OFFLINE: '#ef4444', UPGRADING: '#06b6d4' }
                      const c = colors[s]
                      return (
                        <button key={s} onClick={() => setGlobalDraft(d => ({ ...d, maintenanceStatus: s }))}
                          style={{ padding: '4px 9px', background: active ? `${c}18` : 'transparent',
                            border: `1px solid ${active ? c : 'var(--border)'}`,
                            borderRadius: 4, cursor: 'pointer', transition: 'all .15s',
                            fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 1,
                            color: active ? c : 'var(--muted)', fontWeight: active ? 700 : 400 }}>
                          {s}
                        </button>
                      )
                    })}
                  </div>

                  {/* ── Icon picker ── */}
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 2, color: 'var(--muted)', marginBottom: 6 }}>PAGE ICON</div>
                  <div style={{ display: 'flex', gap: 5, marginBottom: 12 }}>
                    {['⚙️','🔧','🚀','🛠️','⚡','🔒','🌐','💻'].map(ic => (
                      <button key={ic} onClick={() => setGlobalDraft(d => ({ ...d, maintenanceIcon: ic }))}
                        style={{ width: 32, height: 32, fontSize: 16, borderRadius: 6, cursor: 'pointer',
                          background: globalDraft.maintenanceIcon === ic ? 'rgba(245,158,11,0.15)' : 'var(--bg3)',
                          border: `1px solid ${globalDraft.maintenanceIcon === ic ? '#f59e0b' : 'var(--border)'}`,
                          transition: 'all .15s', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {ic}
                      </button>
                    ))}
                  </div>

                  {/* ── Background Style ── */}
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 2, color: 'var(--muted)', marginBottom: 6 }}>BACKGROUND PATTERN</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 5, marginBottom: 12 }}>
                    {[
                      { id: 'grid',   label: 'Grid',   preview: 'repeating-linear-gradient(0deg,#0d0 1px,transparent 20px),repeating-linear-gradient(90deg,#0d0 1px,transparent 20px)' },
                      { id: 'radial', label: 'Radial', preview: 'radial-gradient(circle at 50% 50%,#f59e0b22,transparent 70%)' },
                      { id: 'dots',   label: 'Dots',   preview: 'radial-gradient(circle,#fff2 1px,transparent 1px)' },
                      { id: 'clean',  label: 'Clean',  preview: 'none' },
                      { id: 'matrix', label: 'Matrix', preview: 'repeating-linear-gradient(180deg,#00ff0008 0px,#00ff0008 2px,transparent 2px,transparent 20px)' },
                    ].map(bg => {
                      const active = globalDraft.maintenanceBgStyle === bg.id
                      return (
                        <button key={bg.id} onClick={() => setGlobalDraft(d => ({ ...d, maintenanceBgStyle: bg.id }))}
                          style={{ padding: '0', height: 44, borderRadius: 6, cursor: 'pointer', overflow: 'hidden', position: 'relative',
                            border: `1.5px solid ${active ? '#f59e0b' : 'var(--border)'}`,
                            transition: 'all .15s' }}>
                          <div style={{ position: 'absolute', inset: 0, background: '#0a0f18', backgroundImage: bg.preview, backgroundSize: '20px 20px' }}/>
                          <span style={{ position: 'relative', fontFamily: 'var(--font-mono)', fontSize: 7, color: active ? '#f59e0b' : 'var(--muted)', letterSpacing: 1, display: 'block', textAlign: 'center', paddingTop: 26 }}>{bg.label}</span>
                        </button>
                      )
                    })}
                  </div>

                  {/* ── Progress bar ── */}
                  <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', marginBottom: 10 }}>
                    <Toggle label="Show progress bar" checked={globalDraft.maintenanceShowProgress} onChange={v => setGlobalDraft(d => ({ ...d, maintenanceShowProgress: v }))} accent="#f59e0b" />
                    {globalDraft.maintenanceShowProgress && (
                      <div style={{ marginTop: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--muted)', letterSpacing: 2 }}>PROGRESS</span>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#f59e0b', fontWeight: 700 }}>{globalDraft.maintenanceProgress}%</span>
                        </div>
                        <input type="range" min={0} max={100} value={globalDraft.maintenanceProgress}
                          onChange={e => setGlobalDraft(d => ({ ...d, maintenanceProgress: +e.target.value }))}
                          style={{ width: '100%', accentColor: '#f59e0b', cursor: 'pointer' }} />
                        <div style={{ height: 4, borderRadius: 2, background: 'var(--border)', marginTop: 4, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${globalDraft.maintenanceProgress}%`, background: 'linear-gradient(90deg,#f59e0b,#00d4ff)', borderRadius: 2, transition: 'width .2s' }}/>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* ── Expected return time ── */}
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--muted)', letterSpacing: 2, marginBottom: 5 }}>EXPECTED RETURN TIME</div>
                    <input value={globalDraft.maintenanceReturnTime} onChange={e => setGlobalDraft(d => ({ ...d, maintenanceReturnTime: e.target.value }))}
                      placeholder="e.g. Today at 6:00 PM UTC"
                      style={{ width: '100%', background: 'var(--bg3)', border: '1px solid rgba(245,158,11,0.3)', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: 11, padding: '8px 10px', borderRadius: 6, outline: 'none', boxSizing: 'border-box' }} />
                  </div>

                  {/* ── Social links visibility ── */}
                  <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', marginBottom: 10 }}>
                    <Toggle label="Show social links on maintenance page" checked={globalDraft.maintenanceShowSocial} onChange={v => setGlobalDraft(d => ({ ...d, maintenanceShowSocial: v }))} accent="#f59e0b" />
                  </div>

                  {/* ── Message ── */}
                  <div style={{ marginBottom: 4 }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--muted)', letterSpacing: 2, marginBottom: 5 }}>MAINTENANCE MESSAGE</div>
                    <textarea value={globalDraft.maintenanceMessage} onChange={e => setGlobalDraft(d => ({ ...d, maintenanceMessage: e.target.value }))} rows={3} placeholder="We are currently performing maintenance..."
                      style={{ width: '100%', background: 'var(--bg3)', border: '1px solid rgba(245,158,11,0.4)', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: 11, padding: '8px 10px', borderRadius: 6, resize: 'vertical', outline: 'none', boxSizing: 'border-box' }} />
                  </div>

                  {/* ── Live preview strip ── */}
                  <MaintenancePreviewStrip draft={globalDraft} />

                </>)}
              </Section>

              {/* ── 5. Header Style ── */}
              <Section label="▬ HEADER STYLE" desc="Navigation bar design applied to all site visitors">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {HEADER_PRESETS.map(p => {
                    const active = globalDraft.headerStyle === p.id
                    return (
                      <button key={p.id} onClick={() => setGlobalDraft(d => ({ ...d, headerStyle: p.id }))}
                        style={{
                          padding: 0, overflow: 'hidden', cursor: 'pointer', textAlign: 'left',
                          background: active ? 'color-mix(in srgb, var(--green) 7%, transparent)' : 'var(--bg3)',
                          border: `2px solid ${active ? 'var(--green)' : 'var(--border)'}`,
                          borderRadius: 8, transition: 'all .15s',
                          boxShadow: active ? '0 0 10px color-mix(in srgb, var(--green) 18%, transparent)' : 'none',
                        }}>
                        <div style={{ background: '#000', borderBottom: `1px solid ${active ? 'color-mix(in srgb, var(--green) 25%, transparent)' : 'var(--border)'}` }}>
                          <HeaderPreviewSVG id={p.id} />
                        </div>
                        <div style={{ padding: '5px 8px', display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, color: active ? 'var(--green)' : 'var(--text)', letterSpacing: 1 }}>{p.name}</span>
                          {active && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--green)', padding: '1px 4px', background: 'color-mix(in srgb, var(--green) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--green) 25%, transparent)' }}>✓ ACTIVE</span>}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </Section>

              {/* ── 6. Footer Style ── */}
              <Section label="▤ FOOTER STYLE" desc="Footer layout applied site-wide to all visitors">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {FOOTER_PRESETS.map(p => {
                    const active = globalDraft.footerStyle === p.id
                    return (
                      <button key={p.id} onClick={() => setGlobalDraft(d => ({ ...d, footerStyle: p.id }))}
                        style={{
                          padding: 0, overflow: 'hidden', cursor: 'pointer', textAlign: 'left',
                          background: active ? 'color-mix(in srgb, var(--green) 7%, transparent)' : 'var(--bg3)',
                          border: `2px solid ${active ? 'var(--green)' : 'var(--border)'}`,
                          borderRadius: 8, transition: 'all .15s',
                          boxShadow: active ? '0 0 10px color-mix(in srgb, var(--green) 18%, transparent)' : 'none',
                        }}>
                        <div style={{ background: '#000', borderBottom: `1px solid ${active ? 'color-mix(in srgb, var(--green) 25%, transparent)' : 'var(--border)'}` }}>
                          <FooterPreviewSVG id={p.id} />
                        </div>
                        <div style={{ padding: '5px 8px', display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, color: active ? 'var(--green)' : 'var(--text)', letterSpacing: 1 }}>{p.name}</span>
                          {active && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--green)', padding: '1px 4px', background: 'color-mix(in srgb, var(--green) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--green) 25%, transparent)' }}>✓ ACTIVE</span>}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </Section>
            </div>

            {/* Save button */}
            <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
              <button onClick={saveGlobalSettings} disabled={savingGlobal}
                style={{ width: '100%', padding: '12px', background: savedGlobal ? 'color-mix(in srgb, var(--green) 15%, transparent)' : 'rgba(245,158,11,0.15)', border: `1px solid ${savedGlobal ? 'var(--green)' : 'rgba(245,158,11,0.5)'}`, color: savedGlobal ? 'var(--green)' : '#f59e0b', borderRadius: 8, cursor: savingGlobal ? 'default' : 'pointer', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2, fontWeight: 700, transition: 'all .2s' }}>
                {savingGlobal ? '⏳ SAVING...' : savedGlobal ? '✓ SAVED GLOBALLY' : '💾 SAVE FOR ALL USERS'}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

// ── Helpers for admin panel ───────────────────────────────────────────────────
function Section({ label, desc, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 3, color: 'var(--muted)', marginBottom: 3 }}>{label}</div>
      {desc && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--muted)', opacity: 0.6, marginBottom: 8, lineHeight: 1.5 }}>{desc}</div>}
      {children}
    </div>
  )
}

function Toggle({ label, checked, onChange, accent = 'var(--green)' }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
      <div onClick={() => onChange(!checked)}
        style={{ width: 36, height: 20, borderRadius: 10, background: checked ? accent : 'var(--bg3)', border: `1px solid ${checked ? accent : 'var(--border)'}`, position: 'relative', flexShrink: 0, cursor: 'pointer', transition: 'all .2s' }}>
        <div style={{ position: 'absolute', top: 2, left: checked ? 18 : 2, width: 14, height: 14, borderRadius: '50%', background: checked ? '#000' : 'var(--muted)', transition: 'left .2s' }} />
      </div>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: checked ? accent : 'var(--muted)', transition: 'color .2s' }}>{label}</span>
    </label>
  )
}

// ── Maintenance preview strip (mini mockup inside admin panel) ────────────────
function MaintenancePreviewStrip({ draft }) {
  const statusColors = {
    MAINTENANCE: '#f59e0b', UPDATING: '#3b82f6', 'COMING SOON': '#a855f7',
    OFFLINE: '#ef4444', UPGRADING: '#06b6d4',
  }
  const sc = statusColors[draft.maintenanceStatus] || '#f59e0b'

  const bgPatterns = {
    grid:   { backgroundImage: 'linear-gradient(color-mix(in srgb, var(--cyan) 4%, transparent) 1px,transparent 1px),linear-gradient(90deg,color-mix(in srgb, var(--cyan) 4%, transparent) 1px,transparent 1px)', backgroundSize: '16px 16px' },
    radial: { backgroundImage: `radial-gradient(ellipse at 50% 50%, ${sc}12 0%, transparent 70%)` },
    dots:   { backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)', backgroundSize: '10px 10px' },
    clean:  {},
    matrix: { backgroundImage: 'repeating-linear-gradient(180deg,rgba(0,255,0,0.04) 0px,rgba(0,255,0,0.04) 2px,transparent 2px,transparent 14px)' },
  }
  const bgPat = bgPatterns[draft.maintenanceBgStyle] || {}

  return (
    <div style={{ marginTop: 10, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 7, letterSpacing: 2, color: 'var(--muted)', padding: '5px 8px', background: 'var(--bg3)', borderBottom: '1px solid var(--border)' }}>
        ◉ LIVE PREVIEW
      </div>
      <div style={{ height: 120, background: '#060a0f', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', ...bgPat }}>
        <div style={{ textAlign: 'center', zIndex: 1, padding: '0 12px' }}>
          {/* icon */}
          <div style={{ fontSize: 22, marginBottom: 5 }}>{draft.maintenanceIcon}</div>
          {/* status badge */}
          <div style={{ display: 'inline-block', padding: '2px 8px', background: `${sc}15`, border: `1px solid ${sc}44`,
            borderRadius: 3, marginBottom: 6 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 7, letterSpacing: 2, color: sc }}>{draft.maintenanceStatus}</span>
          </div>
          {/* title bars */}
          <div style={{ height: 5, background: 'rgba(255,255,255,0.7)', borderRadius: 2, width: 100, margin: '0 auto 4px' }}/>
          <div style={{ height: 3, background: 'rgba(255,255,255,0.2)', borderRadius: 2, width: 140, margin: '0 auto 8px' }}/>
          {/* progress bar */}
          {draft.maintenanceShowProgress && (
            <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.1)', width: 140, margin: '0 auto 6px', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${draft.maintenanceProgress}%`, background: `linear-gradient(90deg,${sc},#00d4ff)`, borderRadius: 2 }}/>
            </div>
          )}
          {/* return time */}
          {draft.maintenanceReturnTime && (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 7, color: 'rgba(255,255,255,0.3)', letterSpacing: 1 }}>
              ⏱ {draft.maintenanceReturnTime}
            </div>
          )}
        </div>
        {/* style label badge */}
        <div style={{ position: 'absolute', top: 6, right: 6, padding: '2px 6px', background: 'rgba(0,0,0,0.6)',
          border: '1px solid var(--border)', borderRadius: 3 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase' }}>{draft.maintenanceStyle}</span>
        </div>
      </div>
    </div>
  )
}

function AdminThemeBtn({ id, label, active, onClick, color, bg }) {
  return (
    <button onClick={onClick} style={{ padding: '6px 8px', display: 'flex', alignItems: 'center', gap: 6, background: active ? `${color}15` : 'var(--bg3)', border: `1px solid ${active ? color : 'var(--border)'}`, borderRadius: 6, cursor: 'pointer', transition: 'all .15s', textAlign: 'left' }}>
      {bg && <div style={{ width: 12, height: 12, borderRadius: 3, background: bg, border: `2px solid ${color}`, flexShrink: 0 }} />}
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: active ? color : 'var(--muted)', fontWeight: active ? 700 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      {active && <span style={{ marginLeft: 'auto', color, fontSize: 10 }}>✓</span>}
    </button>
  )
}
