import React from 'react'

/**
 * Orbital loader — three nested rings + three orbiting dots + pulsing core.
 * Uses only CSS classes defined in index.css, no inline styles needed.
 */
export default function Loader({ style = {} }) {
  return (
    <div className="loader" style={style}>
      <span className="loader-dot" />
      <span className="loader-dot" />
      <span className="loader-dot" />
      <span className="loader-core" />
    </div>
  )
}
