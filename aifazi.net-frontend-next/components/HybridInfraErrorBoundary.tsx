'use client'

/**
 * HybridInfraErrorBoundary — island-level crash containment for /hybrid-infra.
 *
 * The canvas + editor run heavy imperative code (rAF, observers, JSON import).
 * A throw there must not blank the whole case-study page: this boundary keeps
 * the header, library, and explainer copy mounted and offers a reset that
 * drops back to the built-in Plan A seed.
 */
import { Component, type ReactNode } from 'react'

interface State {
  error: Error | null
}

export default class HybridInfraErrorBoundary extends Component<
  { children: ReactNode; onReset?: () => void },
  State
> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error): void {
    try {
      console.error('[hybrid-infra] island crashed:', error)
    } catch {
      /* noop */
    }
  }

  private reset = () => {
    try {
      const url = new URL(window.location.href)
      url.searchParams.delete('diagram')
      url.searchParams.delete('node')
      window.history.replaceState(null, '', url.toString())
    } catch {
      /* noop */
    }
    this.props.onReset?.()
    this.setState({ error: null })
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children
    return (
      <div
        role="alert"
        style={{
          border: '1px solid var(--red, #c81e2e)',
          borderRadius: 14,
          padding: 20,
          background: 'var(--card, transparent)',
          fontFamily: 'var(--font-mono)',
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
          The interactive diagram hit an error — the rest of this page is unaffected.
        </div>
        <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 14px', lineHeight: 1.6 }}>
          Your saved diagrams are untouched. Resetting reloads the built-in Plan A study.
        </p>
        <button
          type="button"
          onClick={this.reset}
          style={{
            fontSize: 12,
            fontWeight: 700,
            fontFamily: 'var(--font-mono)',
            letterSpacing: 1,
            padding: '9px 16px',
            borderRadius: 8,
            cursor: 'pointer',
            color: '#ffffff',
            background: 'var(--cyan, #0b7d99)',
            border: 0,
          }}
        >
          RESET DIAGRAM
        </button>
      </div>
    )
  }
}
