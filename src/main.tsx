import { StrictMode, useMemo } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import { App } from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { useToast } from './store/ui'
import { useSettings } from './store/settings'
import './styles/tokens.css'
import './styles/glass.css'
import './styles/app.css'
import { setLanguage, t } from '@/i18n'

/**
 * Serve Kultr from a sub-path (GitHub Pages project sites, for example) and
 * Vite bakes that path into BASE_URL. The router has to know about it too.
 */
const basename = import.meta.env.BASE_URL.replace(/\/$/, '')

const container = document.getElementById('root')
if (!container) throw new Error('Missing #root element')

/**
 * The app in the chosen language. Changing it draws everything again from
 * the top, so every line — lists made once included — comes out in it.
 */
function InLanguage() {
  const setting = useSettings((state) => state.language)
  const code = useMemo(() => setLanguage(setting), [setting])
  return <App key={code} />
}

setLanguage(useSettings.getState().language)

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter basename={basename || undefined}>
        <InLanguage />
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)

// Remove the pre-bundle placeholder once React has painted.
requestAnimationFrame(() => document.getElementById('kultr-boot')?.remove())

// Offer an update rather than reloading under someone's feet mid-track. The
// desktop app has no service worker: the app is on disk already, and it
// checks GitHub for new versions itself.
const desktopApp = Boolean((window as unknown as { kultrDesktop?: unknown }).kultrDesktop)
const updateSW = desktopApp
  ? () => Promise.resolve()
  : registerSW({
      onNeedRefresh() {
        useToast
          .getState()
          .show(t("A new version of Kultr is ready. Reload when you are between tracks."), 'info', 15000)
        // Apply on the next full page load.
        void updateSW(false)
      },
      onOfflineReady() {
        useToast.getState().show(t("Kultr is ready to work offline."), 'success')
      },
    })
