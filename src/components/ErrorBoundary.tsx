import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Logo } from './Logo'

/**
 * Last line of defence.
 *
 * Without this, one thrown error anywhere in the tree unmounts everything and
 * leaves a blank page with no way out. Here the person at least gets told what
 * happened and offered the two things that actually fix it.
 */
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null; info: string }
> {
  state = { error: null as Error | null, info: '' }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[kultr] uncaught error', error, info)
    this.setState({ info: info.componentStack ?? '' })
  }

  render() {
    const { error, info } = this.state
    if (!error) return this.props.children

    return (
      <div className="login">
        <div className="login__card glass glass-strong">
          <div className="login__brand">
            <Logo size={64} />
          </div>
          <h2 style={{ textAlign: 'center' }}>Something broke</h2>
          <p className="login__tagline">
            Kultr hit an error it could not recover from. Reloading usually sorts it out — your
            library and settings are stored locally and will still be there.
          </p>

          <div className="login__error" style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5 }}>
            {error.message || String(error)}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="pill pill-accent pill-lg" onClick={() => location.reload()}>
              Reload
            </button>
            <button
              className="pill pill-lg"
              onClick={() => {
                // A corrupt cached page is a common cause; clear it and retry.
                void caches
                  ?.keys()
                  .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
                  .catch(() => {})
                  .finally(() => location.reload())
              }}
            >
              Clear cache and reload
            </button>
          </div>

          <details style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>
            <summary style={{ cursor: 'pointer' }}>Technical details</summary>
            <pre
              style={{
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                maxHeight: 220,
                overflow: 'auto',
                marginTop: 8,
              }}
            >
              {error.stack}
              {info}
            </pre>
          </details>

          <p className="login__hint">
            If it keeps happening, please report it with these details at{' '}
            <a href="https://github.com/evropiani/Kultr/issues" target="_blank" rel="noreferrer">
              github.com/evropiani/Kultr/issues
            </a>
            .
          </p>
        </div>
      </div>
    )
  }
}
