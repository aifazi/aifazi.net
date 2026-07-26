'use client'
import { Component } from 'react'

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 16,
          padding: 24,
          background: '#060a0f',
          fontFamily: 'monospace',
          color: '#94a3b8',
        }}>
          <h2 style={{ color: '#ff4757', fontSize: 20, margin: 0 }}>Something went wrong</h2>
          <p style={{ fontSize: 13, maxWidth: 480, textAlign: 'center', lineHeight: 1.6, margin: 0 }}>
            An unexpected error occurred. Try refreshing the page.
          </p>
          <button
            onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload() }}
            style={{
              background: '#00ff88',
              color: '#000',
              border: 'none',
              padding: '10px 24px',
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: 2,
              cursor: 'pointer',
              borderRadius: 4,
              fontFamily: 'monospace',
            }}
          >
            REFRESH PAGE
          </button>
          {process.env.NODE_ENV === 'development' && this.state.error && (
            <pre style={{ fontSize: 11, maxWidth: 600, overflow: 'auto', color: '#ff6b35', background: '#0f1520', padding: 12, borderRadius: 4, border: '1px solid #1a2030' }}>
              {this.state.error.message}
              {'\n'}
              {this.state.error.stack}
            </pre>
          )}
        </div>
      )
    }
    return this.props.children
  }
}