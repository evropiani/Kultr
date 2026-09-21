import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import { App } from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { useToast } from './store/ui'
import './styles/tokens.css'
import './styles/glass.css'
import './styles/app.css'

/**
 * Serve Kultr from a sub-path (GitHub Pages project sites, for example) and
 * Vite bakes that path into BASE_URL. The router has to know about it too.
 */
const basename = import.meta.env.BASE_URL.replace(/\/$/, '')

const container = document.getElementById('root')
if (!container) throw new Error('Missing #root element')

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter basename={basename || undefined}>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)

// Remove the pre-bundle placeholder once React has painted.
requestAnimationFrame(() => document.getElementById('kultr-boot')?.remove())

// Offer an update rather than reloading under someone's feet mid-track.
const updateSW = registerSW({
  onNeedRefresh() {
    useToast
      .getState()
      .show('A new version of Kultr is ready. Reload when you are between tracks.', 'info', 15000)
    // Apply on the next full page load.
    void updateSW(false)
  },
  onOfflineReady() {
    useToast.getState().show('Kultr is ready to work offline.', 'success')
  },
})
