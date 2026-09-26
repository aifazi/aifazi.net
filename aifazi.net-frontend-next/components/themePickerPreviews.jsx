'use client'
// themePickerPreviews.jsx — ThemePicker preview panels (extracted for size).

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

const LIGHT_STYLE_IDS = new Set([
  'paper', 'neumorph', 'macos', 'brutalist', 'pastel', 'win95', 'light', 'cyber-light',
])

/** Single source of truth for light-theme detection in previews. */
function isLightTheme(t) {
  if (!t) return false
  if (t.tag === 'LIGHT') return true
  if (t.style && LIGHT_STYLE_IDS.has(t.style)) return true
  // Fallback: luminance of the theme background
  const hex = t.bg
  const m = typeof hex === 'string' && hex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
  if (m) {
    const r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16)
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) > 140
  }
  return false
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
          <span style={{ fontSize: 11, fontWeight: 800, color: f.isWin95 ? '#000' : f.isBrut ? t.bg : '#000', letterSpacing: 1 }}>APPLY</span>
        </div>
        <div style={{ padding: '4px 8px', background: 'transparent', borderRadius: f.isBrut||f.isWin95 ? 0 : 4,
          border: f.isWin95 ? 'none' : `1px solid ${t.primary}`,
          boxShadow: f.isWin95 ? 'inset -1px -1px 0 #808080, inset 1px 1px 0 #ffffff' : 'none',
        }}>
          <span style={{ fontSize: 11, color: f.isWin95 ? '#000' : t.primary }}>CANCEL</span>
        </div>
        <div style={{ padding: '3px 7px', background: `${t.primary}20`,
          border: `1px solid ${t.border}`, borderRadius: f.isBrut||f.isWin95 ? 0 : f.isPastel ? 20 : 10,
        }}>
          <span style={{ fontSize: 11, color: t.primary }}>TAG</span>
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
          <div style={{ fontSize: 11, color: t.muted, letterSpacing: 2, marginBottom: 4, fontWeight: 600,
            fontFamily: f.isTerm ? 'monospace' : 'inherit',
          }}>{f.isTerm ? '> USERNAME:' : 'USERNAME'}</div>
          <div style={{ ...cs, padding: '7px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ fontSize: 11, color: t.primary, opacity: 0.5 }}>{f.isTerm ? '>' : f.isMacos ? '' : '▶'}</div>
            <div style={{ height: 8, width: 60, background: t.primary, opacity: 0.6, borderRadius: f.isBrut||f.isWin95 ? 0 : 2 }}/>
            <div style={{ width: 1, height: 12, background: t.primary, animation: 'tpBlink 1s infinite' }}/>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: t.muted, letterSpacing: 2, marginBottom: 4, fontWeight: 600 }}>
            {f.isTerm ? '> CATEGORY:' : 'CATEGORY'}
          </div>
          <div style={{ ...cs, padding: '7px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ height: 6, width: 50, background: t.muted, opacity: 0.4, borderRadius: 2 }}/>
            <div style={{ fontSize: 11, color: t.muted }}>{f.isWin95 ? '▼' : '▾'}</div>
          </div>
        </div>
        <div style={{ background: `#ff475711`, borderRadius: f.isBrut||f.isWin95 ? 0 : 4,
          border: f.isWin95 ? '1px solid #808080' : `1px solid #ff475744`,
          padding: '5px 10px', display: 'flex', gap: 5, alignItems: 'center',
          boxShadow: f.isNeumorph ? 'inset 2px 2px 4px #b8bec8, inset -1px -1px 3px #ffffff' : 'none',
        }}>
          <span style={{ fontSize: 11, color: '#ff4757' }}>✕</span>
          <span style={{ fontSize: 11, color: '#ff4757', letterSpacing: 1 }}>FIELD REQUIRED</span>
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
            <span style={{ fontSize: 11, color: accent, fontWeight: 800, marginLeft: 5 }}>{icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ height: 5, background: accent, borderRadius: 2, width: '40%', marginBottom: 3 }}/>
              <div style={{ height: 4, background: t.muted, borderRadius: 2, width: '70%', opacity: 0.4 }}/>
            </div>
            <span style={{ fontSize: 11, color: t.muted }}>✕</span>
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
            <span style={{ fontSize: 11, color: '#fff', fontWeight: 700, letterSpacing: 0.5 }}>⚠ Confirm</span>
            <div style={{ display: 'flex', gap: 2 }}>
              {['─','□','✕'].map(c => (
                <div key={c} style={{ width: 14, height: 12, background: t.bg3, border: '1px solid #808080',
                  boxShadow: 'inset -1px -1px 0 #404040, inset 1px 1px 0 #fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#000' }}>{c}</div>
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
                <span style={{ fontSize: 11, color: '#000', fontWeight: lbl === 'OK' ? 700 : 400 }}>{lbl}</span>
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
              <span style={{ fontSize: 11, color: t.primary, fontWeight: 600, letterSpacing: 0.3 }}>Cancel</span>
            </div>
            <div style={{ flex: 1, padding: '8px', textAlign: 'center', background: `${t.primary}08` }}>
              <span style={{ fontSize: 11, color: t.primary, fontWeight: 700, letterSpacing: 0.3 }}>OK</span>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ width: '100%', ...cs, overflow: 'hidden' }}>
          <div style={{ height: f.isBrut ? 5 : 3, background: `linear-gradient(90deg, ${t.primary}, ${t.secondary})` }}/>
          <div style={{ padding: '10px 12px 8px' }}>
            <div style={{ fontSize: 11, color: t.primary, letterSpacing: 2, marginBottom: 5, opacity: 0.8 }}>⚠ CONFIRM ACTION</div>
            <div style={{ height: 6, background: t.text, borderRadius: 2, width: '75%', marginBottom: 4, opacity: 0.8 }}/>
            <div style={{ height: 4, background: t.muted, borderRadius: 2, width: '90%', marginBottom: 2, opacity: 0.4 }}/>
            <div style={{ height: 4, background: t.muted, borderRadius: 2, width: '65%', opacity: 0.3 }}/>
          </div>
          <div style={{ display: 'flex', borderTop: `1px solid ${t.border}` }}>
            <div style={{ flex: 1, padding: '7px', textAlign: 'center', borderRight: `1px solid ${t.border}` }}>
              <span style={{ fontSize: 11, color: t.muted, letterSpacing: 1 }}>CANCEL</span>
            </div>
            <div style={{ flex: 1, padding: '7px', textAlign: 'center', background: `${t.primary}18` }}>
              <span style={{ fontSize: 11, color: t.primary, letterSpacing: 1, fontWeight: 700 }}>CONFIRM</span>
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
            <span style={{ fontSize: 11, color: '#000', fontWeight: 700 }}>Primary Button</span>
          </div>
        ) : f.isMacos ? (
          <div style={{ padding: '7px 14px', background: t.primary, borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 1px 3px rgba(0,0,0,0.2), 0 0 0 0.5px rgba(0,0,0,0.1)`,
          }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#fff', letterSpacing: 0.3 }}>Primary Button</span>
          </div>
        ) : f.isNeumorph ? (
          <div style={{ padding: '8px 14px', background: t.bg, borderRadius: 8,
            boxShadow: '4px 4px 8px #b8bec8, -3px -3px 6px #ffffff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: t.primary, letterSpacing: 1 }}>PRIMARY BUTTON</span>
          </div>
        ) : f.isPastel ? (
          <div style={{ padding: '8px 14px', borderRadius: 20,
            background: `linear-gradient(135deg, ${t.primary}, ${t.secondary})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 4px 14px ${t.primary}55`,
          }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', letterSpacing: 1 }}>Primary Button ✨</span>
          </div>
        ) : (
          <div style={{ padding: '8px 14px', clipPath: clip, borderRadius: r,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            border: f.isBrut ? `2px solid ${t.secondary}` : f.isTerm ? `1px solid ${t.primary}` : 'none',
            background: f.isTerm ? 'transparent' : t.primary,
            boxShadow: f.isBrut ? `3px 3px 0 ${t.secondary}` : f.isSynth || f.isNoir ? `0 0 14px ${t.primary}88` : f.isAurora ? `0 0 16px ${t.primary}66` : `0 0 12px ${t.primary}44`,
          }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: f.isBrut ? t.bg : f.isTerm ? t.primary : '#000', letterSpacing: 2 }}>PRIMARY BUTTON</span>
          </div>
        )}
        {/* Outline */}
        <div style={{ padding: '7px 14px', background: 'transparent',
          borderRadius: f.isWin95 ? 0 : f.isMacos ? 8 : f.isPastel ? 20 : r,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: f.isWin95 ? 'none' : `${f.isBrut ? '2' : '1'}px solid ${t.secondary}`,
          boxShadow: f.isWin95 ? 'inset -1px -1px 0 #808080, inset 1px 1px 0 #fff' : f.isNeumorph ? '3px 3px 8px #b8bec8, -2px -2px 6px #ffffff' : f.isSynth ? `0 0 8px ${t.secondary}44` : 'none',
        }}>
          <span style={{ fontSize: 11, color: f.isWin95 ? '#000' : t.secondary, letterSpacing: f.isMacos ? 0.3 : 2,
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
              <span style={{ fontSize: 11, color: i === 1 ? t.primary : i === 2 ? '#ef4444' : f.isWin95 ? '#000' : t.muted, letterSpacing: f.isMacos ? 0 : 1 }}>{lbl}</span>
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
  const isLight = isLightTheme(t)

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
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}>T</div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: '#000' }}>TANVIR</span>
            </div>
          ) : f.isBrut ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 18, height: 18, background: t.primary, border: '2px solid #000',
                display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: 900, color: '#fff' }}>T</span>
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
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
                  letterSpacing: 2, color: textColor, lineHeight: 1 }}>TANVIR</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 3,
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
            padding: '2px 6px', fontSize: 11,
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
  const isLight = isLightTheme(t)

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
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}>T</div>
              ) : (
                <svg width="14" height="14" viewBox="0 0 36 36" fill="none">
                  <polygon points="18,1 33,9.5 33,26.5 18,35 3,26.5 3,9.5"
                    fill="none" stroke={accentColor} strokeWidth="2.5" opacity="0.7"/>
                  <line x1="11" y1="13" x2="25" y2="13" stroke={accentColor} strokeWidth="3.5" strokeLinecap="round"/>
                  <line x1="18" y1="13" x2="18" y2="25" stroke={accentColor} strokeWidth="3.5" strokeLinecap="round"/>
                </svg>
              )}
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
                letterSpacing: 2, color: textColor }}>TANVIR.DEV</span>
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: mutedColor,
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
                  fontSize: 11, color: mutedColor, fontFamily: 'var(--font-mono)',
                }}>{s}</div>
              ))}
            </div>
          </div>

          {/* Nav cols */}
          {cols.map(col => (
            <div key={col.head}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2,
                color: accentColor2, marginBottom: 6, paddingBottom: 4,
                borderBottom: f.isWin95 ? '1px solid #808080' : f.isBrut ? '2px solid #000'
                  : `1px solid ${t.border}`,
              }}>{col.head}</div>
              {col.links.map(lk => (
                <div key={lk} style={{ fontFamily: 'var(--font-mono)', fontSize: 11,
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
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: mutedColor, letterSpacing: 1 }}>
              ALL SYSTEMS OK
            </span>
          </div>
          <span suppressHydrationWarning style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: mutedColor }}>
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
    'ember-light':'ember-dark',  'cobalt-light':'cobalt-dark',
    'slate-light':'slate-dark',  'honey-light':'honey-dark',
    'violet-light':'violet-dark','teal-light':'teal-dark',
    'mario-light':'mario', 'minecraft-light':'minecraft',
    'sonic-light':'sonic', 'pacman-light':'pacman',
  }
  return map[id] || id
}

// ── Theme Card ────────────────────────────────────────────────────────────────

export {
  flags, isLightTheme, radius, synthBg, auroraBg, noirBg, pastelBg, getExtraBg, getCardStyle,
  OverviewPreview, LoadingPreview, InputPreview, NotificationPreview,
  DialogPreview, ButtonsPreview, HeaderPreview, FooterPreview, CategoryPreview, getThemeFamily,
}
