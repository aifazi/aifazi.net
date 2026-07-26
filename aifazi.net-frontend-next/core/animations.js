/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  ANIMATION UTILITIES — All motion from one place.           ║
 * ║  Durations read from --t and --ease CSS vars                ║
 * ║  (controlled by data-animation="smooth|snappy|bouncy|none") ║
 * ║                                                              ║
 * ║  Usage:                                                      ║
 * ║    import * as anim from '@/core/ui'                        ║
 * ║    style={{ transition: anim.t('opacity, transform') }}      ║
 * ║    style={anim.reveal(visible, leaving, { dir: 'up' })}      ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

// ── Transition builder ────────────────────────────────────────────────────────
// Reads --t (duration) and --ease from the active animation preset.
// Call with property names: anim.t('opacity', 'transform')
// Call with no args for 'all' transition.
export function t(...props) {
  const dur  = 'var(--t, 0.35s)'
  const ease = 'var(--ease, cubic-bezier(0.16,1,0.3,1))'
  if (!props.length) return `all ${dur} ${ease}`
  return props.map(p => `${p} ${dur} ${ease}`).join(', ')
}

// ── Enter/exit animation state ────────────────────────────────────────────────
// Returns inline styles for an element that mounts (visible=false→true)
// and unmounts (leaving=false→true).
//
// dir:      'up' | 'down' | 'left' | 'right' | 'scale' | 'none'
// distance: px to slide (default 32)
// scaleFrom: starting scale for 'scale' direction (default 0.88)
export function reveal(visible, leaving, options = {}) {
  const { dir = 'up', distance = 32, scaleFrom = 0.88 } = options
  const show = visible && !leaving
  const transforms = {
    up:    () => `translateY(${show ? 0 : distance}px)`,
    down:  () => `translateY(${show ? 0 : -distance}px)`,
    left:  () => `translateX(${show ? 0 : distance}px)`,
    right: () => `translateX(${show ? 0 : -distance}px)`,
    scale: () => `scale(${show ? 1 : scaleFrom}) translateY(${show ? 0 : 20}px)`,
    none:  () => 'none',
  }
  return {
    transform: (transforms[dir] || transforms.up)(),
    opacity:   show ? 1 : 0,
    transition: leaving
      ? 'transform 0.3s cubic-bezier(0.4,0,1,1), opacity 0.3s ease'
      : 'transform var(--t,0.4s) var(--ease,cubic-bezier(0.16,1,0.3,1)), opacity 0.3s ease',
  }
}

// ── Stagger delay ─────────────────────────────────────────────────────────────
// Returns animationDelay string for list items.
// Usage: style={{ animationDelay: anim.stagger(index) }}
export function stagger(index, baseDelay = 0.06) {
  return `${(index * baseDelay).toFixed(2)}s`
}

// ── Named keyframe animation strings ─────────────────────────────────────────
// Use with style={{ animation: anim.keyframe.fadeUp }}
export const keyframe = {
  fadeUp:    'fadeUp var(--t,0.4s) var(--ease,cubic-bezier(0.16,1,0.3,1)) both',
  fadeIn:    'fadeIn var(--t,0.3s) ease both',
  fadeDown:  'fadeDown var(--t,0.4s) var(--ease,cubic-bezier(0.16,1,0.3,1)) both',
  fadeLeft:  'fadeLeft var(--t,0.4s) var(--ease,cubic-bezier(0.16,1,0.3,1)) both',
  fadeRight: 'fadeRight var(--t,0.4s) var(--ease,cubic-bezier(0.16,1,0.3,1)) both',
  pulse:     'pulse 1.4s ease-in-out infinite',
  blink:     'blink 1s step-end infinite',
  float:     'float 4s ease-in-out infinite',
  glowPulse: 'glow-pulse 2s ease-in-out infinite',
  skeleton:  'skeleton-shimmer 2s linear infinite',
  scanline:  'scanline 8s linear infinite',
}

// ── Hover lift helper ─────────────────────────────────────────────────────────
// Returns CSS for lifting an element on hover (respects animation preset)
export const hoverLift = {
  style: {
    transition: t('transform', 'box-shadow'),
  },
  hover: {
    transform: 'translateY(var(--hover-lift, -3px))',
  },
}
