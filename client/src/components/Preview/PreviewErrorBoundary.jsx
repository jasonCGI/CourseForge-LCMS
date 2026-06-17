import React from 'react'

/**
 * Wraps the frame preview so a throw in any block renderer (e.g. a 3D viewer
 * failing to load) degrades to an inline message instead of blanking the whole
 * editor. Pass resetKey={activeFrame.id} so navigating to another frame clears
 * a previous error.
 */
export default class PreviewErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error) {
    console.warn('[Preview] render error:', error)
  }

  componentDidUpdate(prevProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null })
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          padding: 24, textAlign: 'center',
          fontFamily: 'var(--forge-font, "IBM Plex Mono", monospace)',
        }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>⚠</div>
          <div style={{ fontSize: 13, color: '#E87070', marginBottom: 6 }}>
            Preview couldn’t render this frame.
          </div>
          <div style={{ fontSize: 11, color: 'var(--cf-text-tertiary, #7a7a90)' }}>
            {String(this.state.error?.message || this.state.error)}
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
