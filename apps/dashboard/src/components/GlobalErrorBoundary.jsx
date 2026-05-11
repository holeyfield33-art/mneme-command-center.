import React from 'react'

export default class GlobalErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = {
      hasError: false,
      errorMessage: '',
    }
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      errorMessage: error?.message || 'Unexpected UI failure',
    }
  }

  componentDidCatch(error, errorInfo) {
    console.error('GlobalErrorBoundary caught:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', backgroundColor: '#f5f5f5', padding: '2rem' }}>
          <div className="mneme-surface" style={{ maxWidth: '720px', margin: '0 auto', padding: '1.25rem' }}>
            <h2 style={{ marginBottom: '0.55rem', color: '#9e2222' }}>Something went wrong</h2>
            <p style={{ marginBottom: '0.65rem', color: '#334455' }}>
              The dashboard hit an unexpected error. Refresh to recover.
            </p>
            <p style={{ marginBottom: '1rem', fontSize: '0.85rem', color: '#556677' }}>
              Details: {this.state.errorMessage}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                padding: '0.5rem 0.9rem',
                border: 'none',
                borderRadius: '6px',
                backgroundColor: '#2c3e50',
                color: 'white',
                cursor: 'pointer',
                fontWeight: 700,
              }}
            >
              Reload Dashboard
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
