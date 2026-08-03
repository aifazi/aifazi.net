'use client'
import React, { useState, useEffect, useRef, useCallback } from 'react'
import api from '@/lib/api'
import { useToast } from '../../components/Toast'
import { Slider } from '../../core/ui.jsx'
import { S, useIsMobile } from './shared'
import { useTheme } from '@/app/providers'
import { clearSiteSettingsCache, getSiteSettings } from '@/lib/siteSettings'

// -- Header presets -------------------------------------------------------------
const HEADER_PRESETS = [
  { id: 'cyber',     name: 'Cyber',     desc: 'Neon hacker  current default' },
  { id: 'glass',     name: 'Glass',     desc: 'Frosted glassmorphism + blur' },
  { id: 'editorial', name: 'Editorial', desc: 'Bold typographic + red accent bar' },
  { id: 'minimal',   name: 'Minimal',   desc: 'Ultra-clean, no distractions' },
  { id: 'neon-band', name: 'Neon Band', desc: 'Vivid gradient stripe + dark base' },
  { id: 'terminal',  name: 'Terminal',  desc: 'Phosphor green CRT aesthetic' },
  { id: 'command',   name: 'Command',   desc: 'Search-first command palette bar' },
  { id: 'dashboard', name: 'Dashboard', desc: 'Dense app shell with status tools' },
  { id: 'magazine',  name: 'Magazine',  desc: 'Editorial masthead and sections' },
  { id: 'brutal',    name: 'Brutal',    desc: 'Hard blocks, black rules, no blur' },
  { id: 'mobile-dock', name: 'Mobile Dock', desc: 'Centered brand with icon actions' },
  { id: 'studio',    name: 'Studio',    desc: 'Portfolio studio with split nav' },
]

// -- Footer presets -------------------------------------------------------------
const FOOTER_PRESETS = [
  { id: 'cyber',        name: 'Cyber Grid',   desc: 'Default  4-col with system status' },
  { id: 'minimal',      name: 'Minimal',      desc: 'Single row  clean & light' },
  { id: 'magazine',     name: 'Magazine',     desc: 'Bold editorial with serif wordmark' },
  { id: 'glass',        name: 'Glass',        desc: 'Frosted 2-col with glow accents' },
  { id: 'synthwave',    name: 'Synthwave',    desc: 'Retro 80s neon pink & cyan' },
  { id: 'dark-compact', name: 'Dark Compact', desc: 'Two-row compact with bottom bar' },
  { id: 'command',      name: 'Command Hub',  desc: 'Utility links plus command strip' },
  { id: 'dashboard',    name: 'Dashboard',    desc: 'Metrics, status, dense link groups' },
  { id: 'paper',        name: 'Paper Index',  desc: 'Editorial site map on paper' },
  { id: 'brutal',       name: 'Brutal Block', desc: 'Heavy rules and high contrast' },
  { id: 'dock',         name: 'Dock',         desc: 'Bottom app dock and shortcuts' },
  { id: 'terminal',     name: 'Terminal Log', desc: 'Console footer with system output' },
]

// -- Preset SVG preview renderers ----------------------------------------------
function HeaderPreviewSVG({ id }) {
  const defs = {
    cyber: (
      <svg viewBox="0 0 160 44" width="100%" height="100%">
        <rect width="160" height="44" fill="#060a0f"/>
        <rect width="160" height="1" y="43" fill="#00ff8844"/>
        <polygon points="14,6 22,10 22,20 14,24 6,20 6,10" fill="none" stroke="#00ff88" strokeWidth="1.2" opacity="0.7"/>
        <line x1="10" y1="15" x2="18" y2="15" stroke="#00ff88" strokeWidth="1.5" strokeLinecap="round"/>
        <line x1="14" y1="15" x2="14" y2="21" stroke="#00ff88" strokeWidth="1.5" strokeLinecap="round"/>
        <text x="26" y="14" fontFamily="monospace" fontSize="6" fill="#e8eaed" letterSpacing="2">TANVIR</text>
        <text x="26" y="21" fontFamily="monospace" fontSize="4" fill="#00ff88" opacity="0.7" letterSpacing="3">.DEV</text>
        {['About','Blog','Forum','Tools'].map((l,i)=><text key={l} x={60+i*25} y="16" fontFamily="monospace" fontSize="5" fill="#6b8296" letterSpacing="1">{l}</text>)}
        <defs><linearGradient id="hcg" x1="0" x2="1"><stop offset="0%" stopColor="#00ff88"/><stop offset="100%" stopColor="#00d4ff"/></linearGradient></defs>
        <rect x="0" y="42" width="90" height="1.5" fill="url(#hcg)"/>
        <rect x="128" y="10" width="26" height="12" rx="1" fill="none" stroke="#00ff8855" strokeWidth="1"/>
        <text x="133" y="19" fontFamily="monospace" fontSize="5" fill="#00ff88" letterSpacing="1">LOGIN</text>
        <rect x="104" y="11" width="20" height="10" rx="5" fill="none" stroke="#ffffff18" strokeWidth="1"/>
        <circle cx="110" cy="16" r="3.5" fill="#00ff8822" stroke="#00ff8866" strokeWidth="0.8"/>
      </svg>
    ),
    glass: (
      <svg viewBox="0 0 160 44" width="100%" height="100%">
        <rect width="160" height="44" fill="#04080f"/>
        <rect width="160" height="44" fill="rgba(255,255,255,0.03)"/>
        <rect width="160" height="1" y="43" fill="rgba(0,229,255,0.3)"/>
        <rect width="160" height="0.5" fill="rgba(255,255,255,0.1)"/>
        <circle cx="14" cy="22" r="9" fill="rgba(0,229,255,0.08)" stroke="rgba(0,229,255,0.4)" strokeWidth="1"/>
        <text x="10" y="26" fontFamily="monospace" fontSize="7" fill="#00e5ff" fontWeight="bold">A</text>
        <text x="28" y="20" fontFamily="monospace" fontSize="6.5" fill="#d0e8ff" letterSpacing="1">AIFAZI</text>
        <text x="28" y="28" fontFamily="monospace" fontSize="4" fill="#7b61ff" opacity="0.8" letterSpacing="2">.NET</text>
        {['Home','Blog','Tools','Forum'].map((l,i)=><text key={l} x={64+i*24} y="24" fontFamily="monospace" fontSize="5" fill="#5a7898" letterSpacing="1">{l}</text>)}
        <rect x="130" y="13" width="24" height="12" rx="6" fill="rgba(0,229,255,0.15)" stroke="rgba(0,229,255,0.5)" strokeWidth="1"/>
        <text x="135" y="22" fontFamily="monospace" fontSize="5" fill="#00e5ff">Sign</text>
        <ellipse cx="80" cy="0" rx="40" ry="6" fill="rgba(123,97,255,0.12)"/>
      </svg>
    ),
    editorial: (
      <svg viewBox="0 0 160 44" width="100%" height="100%">
        <rect width="160" height="44" fill="#0f0e0c"/>
        <rect width="160" height="3" fill="#e8000d"/>
        <text x="8" y="32" fontFamily="serif" fontSize="17" fill="#f2f0ec" fontWeight="900" letterSpacing="-1">AIFAZI</text>
        {['Work','Blog','Contact'].map((l,i)=><text key={l} x={96+i*22} y="28" fontFamily="monospace" fontSize="5.5" fill="#888" letterSpacing="1">{l}</text>)}
        <rect x="148" y="16" width="8" height="8" fill="#e8000d"/>
        <rect x="0" y="43" width="160" height="1" fill="#333"/>
      </svg>
    ),
    minimal: (
      <svg viewBox="0 0 160 44" width="100%" height="100%">
        <rect width="160" height="44" fill="#fafafa"/>
        <rect x="0" y="43" width="160" height="1" fill="#e8e8e8"/>
        <text x="12" y="26" fontFamily="monospace" fontSize="8" fill="#111" fontWeight="700" letterSpacing="2">TANVIR</text>
        {['About','Work','Blog','Contact'].map((l,i)=><text key={l} x={68+i*22} y="26" fontFamily="monospace" fontSize="5" fill="#888" letterSpacing="1">{l}</text>)}
        <text x="150" y="26" fontFamily="monospace" fontSize="8" fill="#111">?</text>
      </svg>
    ),
    'neon-band': (
      <svg viewBox="0 0 160 44" width="100%" height="100%">
        <defs><linearGradient id="hnb" x1="0" x2="1"><stop offset="0%" stopColor="#ff2d8b"/><stop offset="50%" stopColor="#7b61ff"/><stop offset="100%" stopColor="#00f0ff"/></linearGradient></defs>
        <rect width="160" height="44" fill="#0d0618"/>
        <rect width="160" height="3" fill="url(#hnb)"/>
        <rect x="6" y="12" width="28" height="16" rx="8" fill="rgba(255,45,139,0.12)" stroke="rgba(255,45,139,0.5)" strokeWidth="1"/>
        <text x="12" y="23" fontFamily="monospace" fontSize="7" fill="#ff2d8b" fontWeight="bold">AF</text>
        {['Home','Blog','Tools'].map((l,i)=><text key={l} x={52+i*28} y="24" fontFamily="monospace" fontSize="5.5" fill="#7858a0" letterSpacing="1">{l}</text>)}
        <rect x="130" y="13" width="24" height="13" rx="2" fill="rgba(255,45,139,0.2)" stroke="rgba(255,45,139,0.6)" strokeWidth="1"/>
        <text x="134" y="22" fontFamily="monospace" fontSize="5" fill="#ff2d8b" letterSpacing="1">LOGIN</text>
      </svg>
    ),
    terminal: (
      <svg viewBox="0 0 160 44" width="100%" height="100%">
        <rect width="160" height="44" fill="#0a0a0a"/>
        <rect x="0" y="43" width="160" height="1" fill="#33ff3344"/>
        <text x="8" y="16" fontFamily="monospace" fontSize="5" fill="#228822" letterSpacing="1">root@aifazi:~$</text>
        <text x="8" y="28" fontFamily="monospace" fontSize="7" fill="#33ff33" fontWeight="bold" letterSpacing="2">AIFAZI.NET</text>
        <rect x="88" y="8" width="1.5" height="10" fill="#33ff33" opacity="0.9"/>
        {['about','blog','tools'].map((l,i)=><text key={l} x={104+i*18} y="24" fontFamily="monospace" fontSize="5" fill="#228822">{l}</text>)}
      </svg>
    ),
    command: (
      <svg viewBox="0 0 160 44" width="100%" height="100%">
        <rect width="160" height="44" fill="#070b12"/>
        <rect x="6" y="8" width="28" height="28" rx="7" fill="#0e1724" stroke="#38bdf855"/>
        <text x="15" y="26" fontFamily="monospace" fontSize="8" fill="#38bdf8">⌘</text>
        <rect x="42" y="10" width="70" height="24" rx="8" fill="#0b1220" stroke="#38bdf844"/>
        <text x="50" y="25" fontFamily="monospace" fontSize="5" fill="#64748b">Search / jump to...</text>
        {['Blog','Tools'].map((l,i)=><text key={l} x={120+i*18} y="25" fontFamily="monospace" fontSize="5" fill="#94a3b8">{l}</text>)}
      </svg>
    ),
    dashboard: (
      <svg viewBox="0 0 160 44" width="100%" height="100%">
        <rect width="160" height="44" fill="#07111a"/>
        <rect x="0" y="0" width="34" height="44" fill="#0d1722"/>
        <text x="8" y="14" fontFamily="monospace" fontSize="6" fill="#38bdf8">T.DEV</text>
        {[10,21,32].map((y,i)=><rect key={i} x="10" y={y+10} width="14" height="2" rx="1" fill="#38bdf855"/>)}
        <rect x="44" y="10" width="36" height="12" rx="3" fill="#0d1722" stroke="#38bdf833"/>
        <rect x="86" y="10" width="28" height="12" rx="3" fill="#0d1722" stroke="#00ff8833"/>
        <rect x="120" y="10" width="30" height="12" rx="3" fill="#0d1722" stroke="#ff6b3533"/>
        <text x="46" y="31" fontFamily="monospace" fontSize="5" fill="#94a3b8">ADMIN</text>
        <circle cx="146" cy="31" r="4" fill="#00ff88"/>
      </svg>
    ),
    magazine: (
      <svg viewBox="0 0 160 44" width="100%" height="100%">
        <rect width="160" height="44" fill="#f7f1e8"/>
        <rect x="0" y="8" width="160" height="1" fill="#111"/>
        <rect x="0" y="35" width="160" height="1" fill="#111"/>
        <text x="8" y="30" fontFamily="serif" fontSize="20" fill="#111" fontWeight="900" letterSpacing="-1">TANVIR</text>
        {['WORK','BLOG','CONTACT'].map((l,i)=><text key={l} x={88+i*22} y="25" fontFamily="monospace" fontSize="4.5" fill="#111">{l}</text>)}
      </svg>
    ),
    brutal: (
      <svg viewBox="0 0 160 44" width="100%" height="100%">
        <rect width="160" height="44" fill="#f2f0ec"/>
        <rect x="0" y="0" width="160" height="5" fill="#111"/>
        <rect x="7" y="12" width="48" height="22" fill="#fff" stroke="#111" strokeWidth="2"/>
        <text x="14" y="27" fontFamily="monospace" fontSize="8" fill="#111" fontWeight="900">AIFAZI</text>
        {['01','02','03'].map((l,i)=><rect key={l} x={70+i*24} y="14" width="18" height="16" fill={i===1?'#111':'#fff'} stroke="#111" strokeWidth="1.5"/>)}
      </svg>
    ),
    'mobile-dock': (
      <svg viewBox="0 0 160 44" width="100%" height="100%">
        <rect width="160" height="44" fill="#061018"/>
        <text x="62" y="16" fontFamily="monospace" fontSize="7" fill="#c8d8e8" letterSpacing="2">TANVIR</text>
        <rect x="34" y="24" width="92" height="14" rx="7" fill="#0b1118" stroke="#00d4ff44"/>
        {['⌂','⌕','⚙','☰'].map((l,i)=><text key={l} x={47+i*21} y="34" fontFamily="monospace" fontSize="6" fill={i===1?'#00d4ff':'#6b8296'}>{l}</text>)}
      </svg>
    ),
    studio: (
      <svg viewBox="0 0 160 44" width="100%" height="100%">
        <rect width="160" height="44" fill="#090909"/>
        <text x="10" y="26" fontFamily="sans-serif" fontSize="9" fill="#fff" fontWeight="700">TANVIR</text>
        <line x1="60" y1="8" x2="60" y2="36" stroke="#ffffff22"/>
        {['Selected','Work','Journal'].map((l,i)=><text key={l} x={72+i*25} y="25" fontFamily="monospace" fontSize="4.8" fill={i===0?'#fff':'#777'}>{l}</text>)}
        <circle cx="148" cy="22" r="5" fill="none" stroke="#fff"/>
      </svg>
    ),
  }
  return defs[id] || defs['cyber']
}

function FooterPreviewSVG({ id }) {
  const defs = {
    cyber: (
      <svg viewBox="0 0 160 80" width="100%" height="100%">
        <rect width="160" height="80" fill="#0b1118"/>
        <rect width="160" height="1" fill="#ffffff0a"/>
        {[...Array(8)].map((_,i)=>[...Array(5)].map((_,j)=><circle key={`${i}${j}`} cx={10+i*20} cy={10+j*16} r="0.8" fill="#00ff8818"/>))}
        <polygon points="14,8 20,11 20,18 14,21 8,18 8,11" fill="none" stroke="#00ff88" strokeWidth="1" opacity="0.6"/>
        <text x="24" y="14" fontFamily="monospace" fontSize="6" fill="#c8d8e8" fontWeight="bold">TANVIR</text>
        <text x="24" y="20" fontFamily="monospace" fontSize="3.5" fill="#00ff88" opacity="0.7">.DEV</text>
        <text x="8" y="32" fontFamily="monospace" fontSize="4" fill="#6b8296">Network Engineer</text>
        <text x="62" y="11" fontFamily="monospace" fontSize="4" fill="#00d4ff" letterSpacing="2">NAVIGATE</text>
        <rect x="62" y="13" width="28" height="0.5" fill="#00d4ff44"/>
        {['About','Blog','Projects','Contact'].map((l,i)=><text key={l} x="62" y={21+i*8} fontFamily="monospace" fontSize="4.5" fill="#6b8296">{l}</text>)}
        <text x="102" y="11" fontFamily="monospace" fontSize="4" fill="#00d4ff" letterSpacing="2">PLATFORM</text>
        <rect x="102" y="13" width="28" height="0.5" fill="#00d4ff44"/>
        {['Forum','Tools','Chat'].map((l,i)=><text key={l} x="102" y={21+i*8} fontFamily="monospace" fontSize="4.5" fill="#6b8296">{l}</text>)}
        <text x="136" y="11" fontFamily="monospace" fontSize="4" fill="#00d4ff" letterSpacing="2">STATUS</text>
        <rect x="136" y="13" width="20" height="0.5" fill="#00d4ff44"/>
        {['API','DB','CDN'].map((l,i)=><g key={l}><circle cx="138" cy={20+i*8} r="2" fill="#00ff88"/><text x="143" y={22+i*8} fontFamily="monospace" fontSize="4" fill="#6b8296">{l}</text></g>)}
        <rect x="0" y="72" width="160" height="8" fill="#060a0f"/>
        <circle cx="10" cy="76" r="2" fill="#00ff88"/>
        <text x="16" y="78" fontFamily="monospace" fontSize="4" fill="#6b8296">ALL SYSTEMS OK</text>
        <text x="108" y="78" fontFamily="monospace" fontSize="4" fill="#6b8296"> 2025</text>
      </svg>
    ),
    minimal: (
      <svg viewBox="0 0 160 40" width="100%" height="100%">
        <rect width="160" height="40" fill="#fafafa"/>
        <rect width="160" height="1" fill="#e8e8e8"/>
        <text x="10" y="24" fontFamily="monospace" fontSize="7" fill="#111" fontWeight="700" letterSpacing="2">TANVIR</text>
        {['About','Blog','Tools','Contact'].map((l,i)=><text key={l} x={58+i*24} y="24" fontFamily="monospace" fontSize="5" fill="#888">{l}</text>)}
        <text x="108" y="24" fontFamily="monospace" fontSize="4.5" fill="#aaa"> 2025 aifazi.net</text>
      </svg>
    ),
    magazine: (
      <svg viewBox="0 0 160 80" width="100%" height="100%">
        <rect width="160" height="80" fill="#0f0e0c"/>
        <rect width="160" height="2" fill="#e8000d"/>
        <text x="8" y="38" fontFamily="serif" fontSize="22" fill="#f2f0ec" fontWeight="900" letterSpacing="-1" opacity="0.9">AIFAZI</text>
        <rect x="8" y="46" width="144" height="0.5" fill="#333"/>
        <text x="8" y="56" fontFamily="monospace" fontSize="4.5" fill="#666">Network Engineer  UAE</text>
        {['Blog','Forum','Tools','GitHub'].map((l,i)=><text key={l} x={74+i*22} y="56" fontFamily="monospace" fontSize="4.5" fill="#555">{l}</text>)}
        <text x="8" y="68" fontFamily="monospace" fontSize="4" fill="#444"> 2025  All rights reserved</text>
        <rect x="150" y="60" width="6" height="6" fill="#e8000d"/>
      </svg>
    ),
    glass: (
      <svg viewBox="0 0 160 80" width="100%" height="100%">
        <rect width="160" height="80" fill="#04080f"/>
        <rect width="160" height="1" fill="rgba(0,229,255,0.2)"/>
        <ellipse cx="80" cy="80" rx="80" ry="20" fill="rgba(0,229,255,0.04)"/>
        <circle cx="14" cy="18" r="8" fill="rgba(0,229,255,0.07)" stroke="rgba(0,229,255,0.3)" strokeWidth="0.8"/>
        <text x="10" y="22" fontFamily="monospace" fontSize="8" fill="#00e5ff" fontWeight="bold">A</text>
        <text x="26" y="16" fontFamily="monospace" fontSize="6.5" fill="#d0e8ff">AIFAZI</text>
        <text x="26" y="23" fontFamily="monospace" fontSize="4" fill="#7b61ff">.NET</text>
        <text x="8" y="34" fontFamily="monospace" fontSize="4" fill="#5a7898">Network Engineer  UAE</text>
        {['#00e5ff','#7b61ff','#ff6fd8'].map((c,i)=><circle key={c} cx={10+i*12} cy="44" r="4" fill={`${c}15`} stroke={`${c}55`} strokeWidth="0.8"/>)}
        {[['NAVIGATE',80],['PLATFORM',120]].map(([h,x])=>(
          <g key={h}><text x={x} y="12" fontFamily="monospace" fontSize="4" fill="#00e5ff" letterSpacing="2">{h}</text><rect x={x} y="14" width="22" height="0.5" fill="#00e5ff33"/>{['Link 1','Link 2','Link 3'].map((l,i)=><text key={l} x={x} y={22+i*8} fontFamily="monospace" fontSize="4.5" fill="#5a7898">{l}</text>)}</g>
        ))}
        <rect x="0" y="68" width="160" height="12" fill="rgba(0,0,0,0.3)"/>
        <rect x="0" y="68" width="160" height="0.5" fill="rgba(0,229,255,0.15)"/>
        <text x="8" y="77" fontFamily="monospace" fontSize="3.8" fill="#5a7898"> 2025 aifazi.net</text>
      </svg>
    ),
    synthwave: (
      <svg viewBox="0 0 160 80" width="100%" height="100%">
        <defs><linearGradient id="swBg2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0d0618"/><stop offset="100%" stopColor="#180a30"/></linearGradient><linearGradient id="swG2" x1="0" x2="1"><stop offset="0%" stopColor="#ff2d8b"/><stop offset="100%" stopColor="#00f0ff"/></linearGradient></defs>
        <rect width="160" height="80" fill="url(#swBg2)"/>
        <rect width="160" height="2" fill="url(#swG2)"/>
        {[0,1,2,3].map(i=><line key={i} x1="80" y1="72" x2={i*53} y2="50" stroke="rgba(255,45,139,0.15)" strokeWidth="0.5"/>)}
        {[56,62,68].map(y=><line key={y} x1="0" y1={y} x2="160" y2={y} stroke="rgba(255,45,139,0.1)" strokeWidth="0.5"/>)}
        <text x="8" y="26" fontFamily="monospace" fontSize="14" fill="url(#swG2)" fontWeight="900">AIFAZI</text>
        <text x="8" y="34" fontFamily="monospace" fontSize="4" fill="#7858a0" letterSpacing="3">NETWORK ENGINEER</text>
        {['Blog','Forum','Tools'].map((l,i)=><g key={l}><rect x={82+i*26} y="16" width="22" height="10" rx="5" fill="rgba(255,45,139,0.1)" stroke="rgba(255,45,139,0.35)" strokeWidth="0.7"/><text x={88+i*26} y="23.5" fontFamily="monospace" fontSize="5" fill="#ff2d8b">{l}</text></g>)}
        <rect x="0" y="70" width="160" height="10" fill="rgba(0,0,0,0.4)"/>
        <text x="8" y="77" fontFamily="monospace" fontSize="3.8" fill="#7858a0"> 2025  aifazi.net</text>
      </svg>
    ),
    'dark-compact': (
      <svg viewBox="0 0 160 56" width="100%" height="100%">
        <rect width="160" height="56" fill="#090e14"/>
        <rect width="160" height="1" fill="#ffffff0d"/>
        <text x="10" y="18" fontFamily="monospace" fontSize="7" fill="#c8d8e8" fontWeight="bold" letterSpacing="2">TANVIR</text>
        <text x="10" y="24" fontFamily="monospace" fontSize="3.5" fill="#00ff88" opacity="0.7" letterSpacing="2">.DEV</text>
        {['About','Skills','Projects','Blog','Tools','Contact'].map((l,i)=><text key={l} x={52+i*17} y="20" fontFamily="monospace" fontSize="4" fill="#4a6478">{l}</text>)}
        <rect x="8" y="32" width="144" height="0.5" fill="#ffffff0a"/>
        <circle cx="12" cy="44" r="2.5" fill="#00ff88"/>
        <text x="18" y="46" fontFamily="monospace" fontSize="4" fill="#4a6478" letterSpacing="1">ALL SYSTEMS OK</text>
        <text x="100" y="46" fontFamily="monospace" fontSize="4" fill="#4a6478"> 2025 tanvir@aifazi.net</text>
      </svg>
    ),
    command: (
      <svg viewBox="0 0 160 64" width="100%" height="100%">
        <rect width="160" height="64" fill="#070b12"/>
        <rect x="8" y="8" width="144" height="18" rx="7" fill="#0b1220" stroke="#38bdf844"/>
        <text x="16" y="20" fontFamily="monospace" fontSize="5" fill="#64748b">⌘ quick links, search docs, contact...</text>
        {['Status','Docs','Forum','Contact'].map((l,i)=><text key={l} x={14+i*34} y="43" fontFamily="monospace" fontSize="5" fill="#94a3b8">{l}</text>)}
        <rect x="8" y="54" width="144" height="1" fill="#38bdf833"/>
      </svg>
    ),
    dashboard: (
      <svg viewBox="0 0 160 80" width="100%" height="100%">
        <rect width="160" height="80" fill="#07111a"/>
        <rect x="8" y="10" width="34" height="24" rx="3" fill="#0d1722" stroke="#38bdf833"/>
        <rect x="48" y="10" width="34" height="24" rx="3" fill="#0d1722" stroke="#00ff8833"/>
        <rect x="88" y="10" width="34" height="24" rx="3" fill="#0d1722" stroke="#ff6b3533"/>
        <text x="12" y="25" fontFamily="monospace" fontSize="9" fill="#38bdf8">99</text>
        <text x="52" y="25" fontFamily="monospace" fontSize="9" fill="#00ff88">OK</text>
        <text x="92" y="25" fontFamily="monospace" fontSize="9" fill="#ff6b35">24</text>
        {['API','DATABASE','SUPPORT','TOOLS'].map((l,i)=><text key={l} x={10+i*36} y="55" fontFamily="monospace" fontSize="4.5" fill="#6b8296">{l}</text>)}
      </svg>
    ),
    paper: (
      <svg viewBox="0 0 160 80" width="100%" height="100%">
        <rect width="160" height="80" fill="#f4eadc"/>
        <text x="8" y="22" fontFamily="serif" fontSize="16" fill="#1f2937" fontWeight="900">Index</text>
        <line x1="8" y1="30" x2="152" y2="30" stroke="#1f2937" strokeWidth="1"/>
        {['About','Work','Blog','Contact'].map((l,i)=><text key={l} x="10" y={42+i*8} fontFamily="monospace" fontSize="5" fill="#5b4636">{String(i+1).padStart(2,'0')}  {l}</text>)}
        <text x="108" y="68" fontFamily="serif" fontSize="9" fill="#1f2937">AIFAZI</text>
      </svg>
    ),
    brutal: (
      <svg viewBox="0 0 160 72" width="100%" height="100%">
        <rect width="160" height="72" fill="#f2f0ec"/>
        <rect x="0" y="0" width="160" height="6" fill="#111"/>
        <text x="8" y="28" fontFamily="monospace" fontSize="13" fill="#111" fontWeight="900">TANVIR</text>
        <rect x="8" y="38" width="50" height="18" fill="#fff" stroke="#111" strokeWidth="2"/>
        <rect x="68" y="38" width="36" height="18" fill="#111"/>
        <rect x="114" y="38" width="36" height="18" fill="#fff" stroke="#111" strokeWidth="2"/>
      </svg>
    ),
    dock: (
      <svg viewBox="0 0 160 58" width="100%" height="100%">
        <rect width="160" height="58" fill="#061018"/>
        <text x="12" y="20" fontFamily="monospace" fontSize="6" fill="#c8d8e8">TANVIR.DEV</text>
        <rect x="38" y="30" width="84" height="18" rx="9" fill="#0b1118" stroke="#00d4ff55"/>
        {['⌂','✉','⌕','⚙'].map((l,i)=><circle key={l} cx={52+i*18} cy="39" r="6" fill={i===0?'#00d4ff33':'#ffffff08'} stroke="#00d4ff44"/>)}
      </svg>
    ),
    terminal: (
      <svg viewBox="0 0 160 70" width="100%" height="100%">
        <rect width="160" height="70" fill="#050805"/>
        <text x="8" y="14" fontFamily="monospace" fontSize="5" fill="#228822">tail -f footer.log</text>
        {['[OK] api connected','[OK] db connected','[RUN] jobs idle','[EOF] aifazi.net'].map((l,i)=><text key={l} x="8" y={27+i*9} fontFamily="monospace" fontSize="5" fill={i===3?'#ffcc00':'#33ff33'}>{l}</text>)}
        <rect x="0" y="68" width="160" height="1" fill="#33ff3344"/>
      </svg>
    ),
  }
  return defs[id] || defs['cyber']
}

// -- Preset card picker ---------------------------------------------------------
function PresetPicker({ presets, value, onChange, renderPreview, cols = 3 }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 8 }}>
      {presets.map(p => {
        const active = value === p.id
        return (
          <button key={p.id} onClick={() => onChange(p.id)} style={{
            background: active ? 'rgba(0,255,136,0.07)' : 'var(--bg3)',
            border: `2px solid ${active ? 'var(--green)' : 'var(--border)'}`,
            borderRadius: 7, cursor: 'pointer', padding: 0, overflow: 'hidden',
            transition: 'all 0.18s', textAlign: 'left',
            boxShadow: active ? '0 0 12px rgba(0,255,136,0.18)' : 'none',
          }}>
            {/* SVG preview box — compact */}
            <div style={{ width: '100%', height: 52, background: '#000', overflow: 'hidden', borderBottom: `1px solid ${active ? 'rgba(0,255,136,0.3)' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {renderPreview(p.id)}
            </div>
            {/* Label */}
            <div style={{ padding: '6px 8px 7px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, color: active ? 'var(--green)' : 'var(--text)', letterSpacing: 0.5 }}>{p.name}</span>
                {active && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 6, letterSpacing: 2, color: 'var(--green)', padding: '1px 4px', background: 'rgba(0,255,136,0.1)', border: '1px solid rgba(0,255,136,0.3)', borderRadius: 2 }}>ACTIVE</span>}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 7, color: 'var(--muted)', lineHeight: 1.4 }}>{p.desc}</div>
            </div>
          </button>
        )
      })}
    </div>
  )
}

const MAINT_STYLES   = ['terminal','minimal','cyber','glitch','coming-soon','retro']
const MAINT_STATUSES = ['MAINTENANCE','UPDATING','COMING SOON','OFFLINE','UPGRADING']
const MAINT_BG_STYLES = ['grid','dots','radial','matrix','clean']
const STATUS_ACCENT  = { MAINTENANCE:'#f59e0b', UPDATING:'#00d4ff', 'COMING SOON':'#a855f7', OFFLINE:'#ef4444', UPGRADING:'#00ff88' }

function Toggle({ on, onChange, color = '#00ff88' }) {
  return (
    <div onClick={onChange} style={{ width: 40, height: 22, borderRadius: 11, background: on ? color : 'var(--bg3)', border: `1px solid ${on ? color : 'var(--border)'}`, position: 'relative', transition: 'all 0.2s', cursor: 'pointer', flexShrink: 0 }}>
      <div style={{ position: 'absolute', top: 3, left: on ? 20 : 3, width: 14, height: 14, borderRadius: '50%', background: on ? '#fff' : 'var(--muted)', transition: 'left 0.2s' }} />
    </div>
  )
}

function PillPicker({ options, value, onChange, accentFn }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {options.map(opt => {
        const active = value === opt
        const color  = accentFn ? accentFn(opt) : 'var(--green)'
        return (
          <button key={opt} onClick={() => onChange(opt)} style={{ padding: '5px 12px', fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 1, cursor: 'pointer', transition: 'all 0.15s', background: active ? `${color}22` : 'var(--bg3)', border: `1px solid ${active ? color : 'var(--border)'}`, color: active ? color : 'var(--muted)', borderRadius: 4 }}>
            {opt}
          </button>
        )
      })}
    </div>
  )
}

function SiteSettings() {
  const { siteConfig } = useTheme()
  const DEFAULTS = {
    siteName: '', tagline: '', siteUrl: '', logo: '', favicon: '',
    twitter: '', github: '', linkedin: '',
    maintenanceMode: false,
    maintenanceMessage: '',
    maintenanceStyle: 'terminal',
    maintenanceStatus: 'MAINTENANCE',
    maintenanceIcon: '○',
    maintenanceReturnTime: '',
    maintenanceShowProgress: false,
    maintenanceProgress: 0,
    maintenanceShowSocial: true,
    maintenanceBgStyle: 'grid',
    subdomainMaintenance: {},
    headerStyle: 'cyber',
    footerStyle: 'cyber',
    globalTheme: '',
    lockTheme: false,
    loadingScreenStyle: 'terminal',
    animationPreset: 'smooth',
  }
  const [cfg, setCfg]           = useState(DEFAULTS)
  const [loading, setLoading]   = useState(true)
  const [saveStatus, setSaveStatus] = useState('idle') // idle | saving | saved | error
  const toast    = useToast()
  const timerRef = useRef(null)
  const cfgRef   = useRef(cfg)
  const lastLocalEditRef = useRef(0)
  cfgRef.current = cfg

  useEffect(() => {
    getSiteSettings({ fresh: true }).then(data => setCfg(p => ({ ...p, ...data }))).catch(() => {}).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!siteConfig || typeof siteConfig !== 'object' || Array.isArray(siteConfig)) return
    if (Date.now() - lastLocalEditRef.current < 1200) return
    setCfg(p => ({ ...p, ...siteConfig }))
    setLoading(false)
  }, [siteConfig])

  useEffect(() => {
    const applyLiveSettings = (e) => {
      const detail = e?.detail
      if (!detail || typeof detail !== 'object' || Array.isArray(detail)) return
      const settingsDetail = Object.fromEntries(Object.entries(detail).filter(([key]) => !key.startsWith('_')))
      if (Object.keys(settingsDetail).length === 0) return
      if (Date.now() - lastLocalEditRef.current < 1200) return
      setCfg(p => ({ ...p, ...settingsDetail }))
      setLoading(false)
    }
    window.addEventListener('site-settings-updated', applyLiveSettings)
    return () => window.removeEventListener('site-settings-updated', applyLiveSettings)
  }, [])

  // Shared persist function — always uses latest cfg from ref
  const persist = useCallback(async (snapshot) => {
    setSaveStatus('saving')
    try {
      await api.put('/admin/site-settings', snapshot)
      clearSiteSettingsCache()
      window.dispatchEvent(new CustomEvent('site-settings-updated', { detail: snapshot }))
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2000)
    } catch {
      setSaveStatus('error')
      toast.error('Auto-save failed')
      setTimeout(() => setSaveStatus('idle'), 3000)
    }
  }, [toast])

  // Debounced save — used by text inputs (800 ms quiet period)
  const debouncedSave = useCallback((snapshot) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => persist(snapshot), 800)
  }, [persist])

  // Immediate save — used by toggles & pill/preset pickers
  const saveNow = useCallback((snapshot) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    persist(snapshot)
  }, [persist])

  // set for text fields (debounced)
  const set = (k, v) => {
    lastLocalEditRef.current = Date.now()
    const next = { ...cfgRef.current, [k]: v }
    setCfg(next)
    debouncedSave(next)
  }

  // setNow for toggles / pickers (immediate)
  const setNow = (k, v) => {
    lastLocalEditRef.current = Date.now()
    const next = { ...cfgRef.current, [k]: v }
    setCfg(next)
    saveNow(next)
  }

  const T = {
    card:  { background: 'var(--bg2)', border: '1px solid var(--border)', padding: '24px', marginBottom: 20 },
    label: { fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 2, color: 'var(--muted)', marginBottom: 6, display: 'block' },
    inp:   { width: '100%', boxSizing: 'border-box', background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: 12, padding: '10px 12px', outline: 'none' },
    sub:   { fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', marginTop: 4, lineHeight: 1.5 },
    row:   { display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 },
    sec:   { fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 3, color: 'var(--muted)', marginBottom: 16, paddingBottom: 10, borderBottom: '1px solid var(--border)' },
  }

  if (loading) return <div className="loader" />

  const accentColor = STATUS_ACCENT[cfg.maintenanceStatus] || '#f59e0b'

  return (
    <div>
      <style>{`
        @keyframes miniGlitch    { 0%,88%,100%{transform:translate(0)} 20%{transform:translate(-2px,1px)} 22%{transform:translate(2px,-1px)} 24%{transform:translate(-1px,0)} }
        @keyframes miniZoomIn    { from{opacity:0;transform:scale(0.55)} to{opacity:1;transform:scale(1)} }
        @keyframes miniDotBounce { 0%,80%,100%{transform:translateY(0);opacity:0.4} 40%{transform:translateY(-8px);opacity:1} }
        @keyframes tpBlink       { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes tpSpin        { to{transform:rotate(360deg)} }
        @keyframes lsPulse       { 0%,100%{transform:scale(1);opacity:0.5} 50%{transform:scale(1.35);opacity:1} }
        @keyframes lsCyberHex    { 0%{opacity:0.1} 50%{opacity:0.9} 100%{opacity:0.1} }
        @keyframes lsBars        { 0%{height:5px} 50%{height:22px} 100%{height:5px} }
        @keyframes lsWave        { 0%{transform:translateX(-100%)} 100%{transform:translateX(100%)} }
        @keyframes lsNeon        { 0%,100%{opacity:1} 45%{opacity:0.15} 50%{opacity:1} 75%{opacity:0.3} }
        @keyframes apSmooth      { 0%{transform:translateY(12px);opacity:0} 100%{transform:translateY(0);opacity:1} }
        @keyframes apSnappy      { 0%{transform:scale(0.8);opacity:0} 100%{transform:scale(1);opacity:1} }
        @keyframes apBouncy      { 0%{transform:translateY(14px);opacity:0} 55%{transform:translateY(-5px);opacity:1} 75%{transform:translateY(2px)} 100%{transform:translateY(0);opacity:1} }
        @keyframes apExpressive  { 0%{transform:rotate(-8deg) scale(0.7);opacity:0} 100%{transform:rotate(0deg) scale(1);opacity:1} }
        @keyframes apElastic     { 0%{transform:scaleX(0.4);opacity:0} 50%{transform:scaleX(1.15)} 75%{transform:scaleX(0.92)} 100%{transform:scaleX(1);opacity:1} }
        @keyframes apCinematic   { 0%{transform:scale(1.15);opacity:0;filter:blur(4px)} 100%{transform:scale(1);opacity:1;filter:blur(0)} }
        @keyframes apReduced     { 0%{opacity:0} 100%{opacity:1} }
      `}</style>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--cyan)', letterSpacing: 4, marginBottom: 6 }}>SYSTEM</div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 700, margin: 0 }}>Site Settings</h2>
        <p style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: 11, marginTop: 6 }}>Site identity, social links and maintenance page. Theme, layout &amp; animation settings are in <strong style={{ color: 'var(--cyan)' }}>Theme Library → ⚙️ Global Settings</strong>.</p>
      </div>

      {/* -- Identity ------------------------------------------------------- */}
      <div style={T.card}>
        <div style={T.sec}>IDENTITY</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div><label style={T.label}>SITE NAME</label><input value={cfg.siteName || ''} onChange={e => set('siteName', e.target.value)} placeholder="aifazi.net" style={T.inp} /></div>
          <div><label style={T.label}>TAGLINE</label><input value={cfg.tagline || ''} onChange={e => set('tagline', e.target.value)} placeholder="A short description" style={T.inp} /></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div><label style={T.label}>SITE URL</label><input value={cfg.siteUrl || ''} onChange={e => set('siteUrl', e.target.value)} placeholder="https://aifazi.net" style={T.inp} /></div>
          <div><label style={T.label}>LOGO URL</label><input value={cfg.logo || ''} onChange={e => set('logo', e.target.value)} placeholder="https:///logo.png" style={T.inp} /></div>
        </div>
      </div>

      {/* -- Social Links --------------------------------------------------- */}
      <div style={T.card}>
        <div style={T.sec}>SOCIAL LINKS</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          {[['twitter','🐦 Twitter/X'],['github','🐙 GitHub'],['linkedin','in LinkedIn']].map(([key, label]) => (
            <div key={key}><label style={T.label}>{label}</label><input value={cfg[key] || ''} onChange={e => set(key, e.target.value)} placeholder="https://" style={T.inp} /></div>
          ))}
        </div>
      </div>

      {/* -- Maintenance ---------------------------------------------------- */}
      <div style={{ ...T.card, border: `1px solid ${cfg.maintenanceMode ? 'rgba(255,71,87,0.4)' : 'var(--border)'}` }}>
        <div style={{ ...T.sec, color: cfg.maintenanceMode ? '#ff4757' : 'var(--muted)', borderColor: cfg.maintenanceMode ? 'rgba(255,71,87,0.2)' : 'var(--border)' }}>
          MAINTENANCE PAGE
          {cfg.maintenanceMode && <span style={{ marginLeft: 10, padding: '2px 8px', background: 'rgba(255,71,87,0.12)', border: '1px solid rgba(255,71,87,0.3)', color: '#ff4757', fontSize: 8, letterSpacing: 2 }}>ACTIVE</span>}
        </div>

        {/* Master toggle */}
        <div style={T.row}>
          <Toggle on={cfg.maintenanceMode} onChange={() => setNow('maintenanceMode', !cfg.maintenanceMode)} color="#ff4757" />
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: cfg.maintenanceMode ? '#ff4757' : 'var(--text)' }}>Maintenance Mode {cfg.maintenanceMode ? 'ON' : 'OFF'}</div>
            <div style={T.sub}>When ON, visitors see the maintenance page instead of the site. Admins bypass it.</div>
          </div>
        </div>

        {/* Subdomain maintenance toggles */}
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <div style={{ ...T.sub, fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 2, color: 'var(--muted)', marginBottom: 12 }}>PER-SUBDOMAIN MAINTENANCE</div>
          <div style={{ display: 'grid', gap: 12 }}>
            {[
              ['store', 'store.aifazi.net', cfg.subdomainMaintenance?.store?.maintenanceMode, cfg.subdomainMaintenance?.store?.maintenanceMessage || ''],
              ['fivem', 'fivem.aifazi.net', cfg.subdomainMaintenance?.fivem?.maintenanceMode, cfg.subdomainMaintenance?.fivem?.maintenanceMessage || ''],
            ].map(([key, label, active, message]) => (
              <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px', background: 'var(--bg3)', borderRadius: 10, border: `1px solid ${active ? 'rgba(255,71,87,0.3)' : 'var(--border)'}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Toggle
                    on={!!active}
                    onChange={() => {
                      const current = cfg.subdomainMaintenance || {}
                      const sd = { ...current }
                      sd[key] = { ...sd[key], maintenanceMode: !active, maintenanceMessage: sd[key]?.maintenanceMessage || '' }
                      setNow('subdomainMaintenance', JSON.parse(JSON.stringify(sd)))
                    }}
                    color="#ff4757"
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: active ? '#ff4757' : 'var(--text)' }}>
                      {label} {active ? '— MAINTENANCE ON' : '— Normal'}
                    </div>
                  </div>
                  {active && <span style={{ padding: '2px 8px', background: 'rgba(255,71,87,0.12)', border: '1px solid rgba(255,71,87,0.3)', color: '#ff4757', fontSize: 8, letterSpacing: 2 }}>ACTIVE</span>}
                </div>
                {active && (
                  <input
                    value={message}
                    onChange={e => {
                      const current = cfg.subdomainMaintenance || {}
                      const sd = JSON.parse(JSON.stringify(current))
                      sd[key] = { ...sd[key], maintenanceMessage: e.target.value }
                      set('subdomainMaintenance', sd)
                    }}
                    placeholder={`Message for ${label}...`}
                    style={{ ...T.inp, fontFamily: 'var(--font-mono)', fontSize: 10 }}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Design fields  always visible so admin can pre-configure */}
        <div style={{ display: 'grid', gap: 20, marginTop: 8, paddingTop: 16, borderTop: '1px solid var(--border)' }}>

          {/* Message */}
          <div>
            <label style={T.label}>MESSAGE</label>
            <textarea value={cfg.maintenanceMessage || ''} onChange={e => set('maintenanceMessage', e.target.value)} rows={2} placeholder="We're performing scheduled upgrades. We'll be back online shortly." style={{ ...T.inp, resize: 'vertical', lineHeight: 1.6 }} />
          </div>

          {/* Style + Status side-by-side */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div>
              <label style={T.label}>VISUAL STYLE</label>
              <PillPicker options={MAINT_STYLES} value={cfg.maintenanceStyle || 'terminal'} onChange={v => setNow('maintenanceStyle', v)} />
              <div style={T.sub}>Layout used for the maintenance page</div>
            </div>
            <div>
              <label style={T.label}>STATUS BADGE</label>
              <PillPicker options={MAINT_STATUSES} value={cfg.maintenanceStatus || 'MAINTENANCE'} onChange={v => setNow('maintenanceStatus', v)} accentFn={s => STATUS_ACCENT[s] || '#f59e0b'} />
              <div style={T.sub}>Controls heading colour  <span style={{ color: accentColor }}>{cfg.maintenanceStatus}</span></div>
            </div>
          </div>

          {/* Icon + Return time */}
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 16 }}>
            <div>
              <label style={T.label}>ICON / EMOJI</label>
              <input value={cfg.maintenanceIcon || '○'} onChange={e => set('maintenanceIcon', e.target.value)} placeholder="🚧" style={{ ...T.inp, fontSize: 20, textAlign: 'center' }} />
            </div>
            <div>
              <label style={T.label}>ESTIMATED RETURN TIME</label>
              <input value={cfg.maintenanceReturnTime || ''} onChange={e => set('maintenanceReturnTime', e.target.value)} placeholder="e.g.  ~15 MIN  or  3:00 PM UTC" style={T.inp} />
              <div style={T.sub}>Shown on the page. Leave blank to hide.</div>
            </div>
          </div>

          {/* Background + Social row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div>
              <label style={T.label}>BACKGROUND PATTERN</label>
              <PillPicker options={MAINT_BG_STYLES} value={cfg.maintenanceBgStyle || 'grid'} onChange={v => setNow('maintenanceBgStyle', v)} />
            </div>
            <div>
              <label style={T.label}>OPTIONS</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                  <Toggle on={!!cfg.maintenanceShowSocial} onChange={() => setNow('maintenanceShowSocial', !cfg.maintenanceShowSocial)} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text)' }}>Show social links</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                  <Toggle on={!!cfg.maintenanceShowProgress} onChange={() => setNow('maintenanceShowProgress', !cfg.maintenanceShowProgress)} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text)' }}>Show progress bar</span>
                </label>
              </div>
            </div>
          </div>

          {/* Progress bar value */}
          {cfg.maintenanceShowProgress && (
            <div>
              <label style={T.label}>PROGRESS  {cfg.maintenanceProgress ?? 0}%</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Slider min={0} max={100} step={1} value={cfg.maintenanceProgress ?? 0} onChange={v => setNow('maintenanceProgress', v)} style={{ flex: 1 }} />
                <div style={{ width: 120, height: 6, background: 'var(--bg3)', borderRadius: 3, overflow: 'hidden', flexShrink: 0 }}>
                  <div style={{ height: '100%', width: `${cfg.maintenanceProgress ?? 0}%`, background: accentColor, borderRadius: 3, transition: 'width 0.3s' }} />
                </div>
              </div>
            </div>
          )}

          {/* Live mini-preview chip */}
          <div style={{ padding: '10px 14px', background: 'var(--bg)', border: `1px solid ${accentColor}33`, borderRadius: 6, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 18 }}>{cfg.maintenanceIcon || '○'}</span>
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 3, color: accentColor }}>{cfg.maintenanceStatus || 'MAINTENANCE'}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text)', marginTop: 2 }}>{cfg.maintenanceMessage?.slice(0, 60) || 'No message set'}{cfg.maintenanceMessage?.length > 60 ? '' : ''}</div>
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--muted)', textAlign: 'right' }}>
              <div>Style: <span style={{ color: 'var(--cyan)' }}>{cfg.maintenanceStyle || 'terminal'}</span></div>
              <div>BG: <span style={{ color: 'var(--cyan)' }}>{cfg.maintenanceBgStyle || 'grid'}</span></div>
              {cfg.maintenanceReturnTime && <div>ETA: <span style={{ color: accentColor }}>{cfg.maintenanceReturnTime}</span></div>}
            </div>
          </div>

        </div>
      </div>

      {/* -- Header Style --------------------------------------------------- */}
      <div style={T.card}>
        <div style={T.sec}>HEADER STYLE</div>
        <p style={{ ...T.sub, marginBottom: 14 }}>
          Header &amp; Footer styles, Global Theme, Loading Screen and Animation settings have been moved to the{' '}
          <strong style={{ color: 'var(--cyan)' }}>Theme Library → ⚙️ Global Settings</strong> tab.
        </p>
      </div>

      {/* Auto-save status indicator */}
      {saveStatus !== 'idle' && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '9px 18px', borderRadius: 6,
          fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2,
          transition: 'all 0.2s',
          background: saveStatus === 'saved'  ? 'rgba(0,255,136,0.08)'
                    : saveStatus === 'error'  ? 'rgba(248,113,113,0.08)'
                    : 'rgba(255,255,255,0.04)',
          border: `1px solid ${saveStatus === 'saved'  ? 'rgba(0,255,136,0.35)'
                              : saveStatus === 'error'  ? 'rgba(248,113,113,0.35)'
                              : 'var(--border)'}`,
          color: saveStatus === 'saved'  ? 'var(--green)'
               : saveStatus === 'error'  ? '#f87171'
               : 'var(--muted)',
        }}>
          {saveStatus === 'saving' && <span style={{ display: 'inline-block', width: 10, height: 10, border: '2px solid var(--muted)', borderTopColor: 'var(--cyan)', borderRadius: '50%', animation: 'tpSpin 0.7s linear infinite' }} />}
          {saveStatus === 'saved'  && '✓'}
          {saveStatus === 'error'  && '✕'}
          {saveStatus === 'saving' ? 'SAVING…' : saveStatus === 'saved' ? 'SAVED' : 'SAVE FAILED'}
        </div>
      )}
    </div>
  )
}


export { Toggle, PillPicker, SiteSettings, HEADER_PRESETS, FOOTER_PRESETS, HeaderPreviewSVG, FooterPreviewSVG, PresetPicker }
