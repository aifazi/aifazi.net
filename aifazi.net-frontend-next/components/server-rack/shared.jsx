'use client'
const SHARED_CSS = `
  .rk-chassis { fill:var(--bg2); stroke:var(--border); stroke-width:1.5; }
  .rk-lip     { fill:var(--bg3); }
  .rk-rail    { fill:var(--bg4,var(--bg3)); }
  .sv-body    { fill:var(--bg3); stroke:var(--border2,var(--border)); stroke-width:0.7; }
  .sv-face    { fill:var(--bg4,var(--bg3)); }
  .sv-lbl     { fill:var(--muted); font-family:monospace; }
  .sv-port    { fill:var(--bg3); stroke:var(--border2,var(--border)); stroke-width:0.5; }
  .led-g-on   { fill:var(--green);  filter:drop-shadow(0 0 3px var(--green)); }
  .led-c-on   { fill:var(--cyan);   filter:drop-shadow(0 0 3px var(--cyan)); }
  .led-o-on   { fill:var(--orange); filter:drop-shadow(0 0 3px var(--orange)); }
  .led-r-on   { fill:#ff4757;       filter:drop-shadow(0 0 3px #ff4757); }
  .led-off    { fill:var(--bg3); }
  .lbl-g      { fill:var(--green);  font-family:monospace; }
  .lbl-c      { fill:var(--cyan);   font-family:monospace; }
  .lbl-m      { fill:var(--muted);  font-family:monospace; }
  .lbl-o      { fill:var(--orange); font-family:monospace; }
  .lbl-p      { fill:var(--purple,var(--cyan)); font-family:monospace; }
  .scr-bg     { fill:var(--bg4,var(--bg3)); stroke:var(--green); stroke-width:1; stroke-opacity:0.4; }
  .scr-scan   { stroke:var(--green); stroke-opacity:0.03; stroke-width:1; }
  .scr-on     { fill:var(--green); font-family:monospace; filter:drop-shadow(0 0 2px var(--green)); }
  .scr-dim    { fill:var(--muted); font-family:monospace; }
  .hud-bg     { fill:var(--bg3); fill-opacity:0.92; stroke:var(--border); stroke-width:0.8; }
  .bracket    { stroke:var(--cyan); stroke-opacity:0.3; stroke-width:1; fill:none; }
  .cable-g    { stroke:var(--green);  stroke-opacity:0.45; stroke-width:1.5; fill:none; }
  .cable-c    { stroke:var(--cyan);   stroke-opacity:0.45; stroke-width:1.5; fill:none; }
  .cable-o    { stroke:var(--orange); stroke-opacity:0.45; stroke-width:1.5; fill:none; }
  .shadow-el  { fill:var(--bg); fill-opacity:0.15; }
  .hud-title  { fill:var(--cyan); fill-opacity:0.35; font-family:monospace; letter-spacing:2px; font-size:7px; }
`

function SvgWrap({ viewBox = "0 0 900 460", children }) {
  return (
    <svg viewBox={viewBox} width="100%" height="100%"
      style={{ maxHeight: 520 }} xmlns="http://www.w3.org/2000/svg">
      <style>{SHARED_CSS}</style>
      <defs>
        <filter id="gf-led" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="2" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      {children}
    </svg>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  MODE 1: DATACENTER (enhanced original)
// ─────────────────────────────────────────────────────────────────────────────

export { SHARED_CSS, SvgWrap }
