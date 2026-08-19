import React from 'react'

export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[Brevity] Unhandled render error', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <main style={{ minHeight: '100vh', background: '#050505', color: '#f7f3ea', padding: 32, fontFamily: 'Inter, system-ui, sans-serif' }}>
        <div style={{ maxWidth: 720, margin: '10vh auto', border: '1px solid rgba(197,164,109,.35)', borderRadius: 18, padding: 28, background: 'rgba(255,255,255,.035)' }}>
          <p style={{ color: '#c5a46d', fontSize: 11, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase' }}>Brevity Recovery Mode</p>
          <h1 style={{ margin: '8px 0 12px', fontSize: 30, fontWeight: 500 }}>The app hit a display error.</h1>
          <p style={{ color: 'rgba(247,243,234,.66)', lineHeight: 1.6 }}>Your data has not been deleted. Refresh the page. If this message returns, the technical detail below identifies the component failure instead of leaving a blank screen.</p>
          <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', marginTop: 20, padding: 16, borderRadius: 12, background: '#000', color: 'rgba(247,243,234,.72)', fontSize: 12 }}>{String(this.state.error?.message || this.state.error)}</pre>
          <button onClick={() => window.location.reload()} style={{ marginTop: 18, padding: '10px 16px', borderRadius: 10, border: '1px solid rgba(197,164,109,.35)', background: 'rgba(197,164,109,.12)', color: '#c5a46d', cursor: 'pointer' }}>Reload Brevity</button>
        </div>
      </main>
    )
  }
}
