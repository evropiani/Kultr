import { useEffect, useRef } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Backdrop, Sidebar, TopBar, Toasts } from '@/components/Shell'
import { PlayerBar } from '@/components/PlayerBar'
import { NowPlaying } from '@/components/NowPlaying'
import { QueuePanel } from '@/components/QueuePanel'
import { AddToPlaylistModal } from '@/components/AddToPlaylist'
import { SelectionBar } from '@/components/SelectionBar'
import { DropZone } from '@/components/DropZone'
import { OfflineDestinationPrompt } from '@/components/Offline'
import { ShortcutsModal, useKeyboardShortcuts } from '@/components/Shortcuts'
import { Spinner } from '@/components/ui'
import { Login } from '@/routes/Login'
import { Home } from '@/routes/Home'
import { Albums, Artists, Genres, GenrePage, Songs } from '@/routes/Library'
import { AlbumPage, ArtistPage } from '@/routes/Detail'
import { Downloads, Favourites, Playlists, PlaylistPage, Radio } from '@/routes/Collections'
import { Search } from '@/routes/Search'
import { Settings } from '@/routes/Settings'
import { Stats } from '@/routes/Stats'
import { SyncPage } from '@/routes/Sync'
import { useAuth } from '@/store/auth'
import { usePlayer } from '@/store/player'
import { useSettings } from '@/store/settings'
import { useSync } from '@/store/sync'
import { useOffline } from '@/store/offline'
import { useSelection } from '@/store/selection'

/** Keep the document's data-* attributes in step with the settings store. */
function useThemeEffects(): void {
  const {
    theme,
    glass,
    gridSize,
    compactRows,
    reduceMotion,
    corners,
    surfaceBorder,
    borderOpacity,
    surfaceOpacity,
    customCss,
  } = useSettings()

  useEffect(() => {
    const root = document.documentElement
    const applyTheme = () => {
      const resolved =
        theme === 'system'
          ? window.matchMedia('(prefers-color-scheme: light)').matches
            ? 'light'
            : 'dark'
          : theme
      root.dataset.theme = resolved
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', resolved === 'light' ? '#eceef4' : '#0b0b0f')
    }
    applyTheme()

    if (theme !== 'system') return
    const media = window.matchMedia('(prefers-color-scheme: light)')
    media.addEventListener('change', applyTheme)
    return () => media.removeEventListener('change', applyTheme)
  }, [theme])

  useEffect(() => {
    const root = document.documentElement
    root.dataset.glass = glass
    root.dataset.grid = gridSize
    root.dataset.rows = compactRows ? 'compact' : 'normal'
    root.dataset.motion = reduceMotion ? 'reduced' : 'full'
    root.dataset.corners = corners
    root.dataset.border = surfaceBorder
    root.style.setProperty('--surface-scale', String(surfaceOpacity / 100))
    // Written inline so it beats the per-theme value whatever the source
    // order of the stylesheets turns out to be; removed again in neutral
    // mode so each theme keeps its own hairline.
    if (surfaceBorder === 'accent') {
      root.style.setProperty('--edge-a', String(borderOpacity / 100))
    } else {
      root.style.removeProperty('--edge-a')
    }
  }, [glass, gridSize, compactRows, reduceMotion, corners, surfaceBorder, borderOpacity, surfaceOpacity])

  // Whatever is in the box, last, so it can override anything above it. It is
  // injected as a stylesheet rather than interpolated anywhere, so the worst a
  // bad rule can do is make the app look wrong.
  useEffect(() => {
    const id = 'kultr-custom-css'
    let node = document.getElementById(id) as HTMLStyleElement | null
    if (!customCss.trim()) {
      node?.remove()
      return
    }
    if (!node) {
      node = document.createElement('style')
      node.id = id
      document.head.append(node)
    }
    node.textContent = customCss
  }, [customCss])
}

/** Reconnect on load, restore the queue, and run the automatic sync checks. */
function useBootstrap(): void {
  const auth = useAuth()
  const autoSyncOnStart = useSettings((state) => state.autoSyncOnStart)
  const autoSyncMinutes = useSettings((state) => state.autoSyncMinutes)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    if (!auth.hydrated) return
    started.current = true

    void (async () => {
      const connected = await auth.reconnect()
      void useOffline.getState().refresh()
      usePlayer.getState().init()
      await usePlayer.getState().restoreSession()
      if (!connected) return

      await useSync.getState().refreshState()
      if (autoSyncOnStart) {
        // Give the UI a moment to settle before hitting the network.
        window.setTimeout(() => {
          const state = useSync.getState()
          if (state.state.lastFullSync === null) void state.run('full')
          else void state.run('check')
        }, 2500)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.hydrated])

  useEffect(() => {
    if (!autoSyncMinutes || autoSyncMinutes <= 0) return
    const timer = window.setInterval(
      () => {
        if (useAuth.getState().status !== 'connected') return
        if (useSync.getState().running) return
        void useSync.getState().run('check')
      },
      Math.max(5, autoSyncMinutes) * 60_000,
    )
    return () => window.clearInterval(timer)
  }, [autoSyncMinutes])
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const status = useAuth((state) => state.status)
  const hydrated = useAuth((state) => state.hydrated)
  const activeId = useAuth((state) => state.activeId)
  const location = useLocation()

  if (!hydrated || status === 'connecting') {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
        <Spinner />
      </div>
    )
  }

  // An error on a known profile still lets you browse the local mirror; only a
  // completely unknown server sends you to the login screen.
  if (!activeId) return <Navigate to="/login" state={{ from: location }} replace />
  return <>{children}</>
}

function Shell() {
  const location = useLocation()
  const contentRef = useRef<HTMLDivElement>(null)

  // Lets the stylesheet know a player bar exists (toast placement, mostly).
  useEffect(() => {
    document.documentElement.dataset.shell = 'app'
    return () => {
      document.documentElement.dataset.shell = 'login'
    }
  }, [])

  // Every navigation starts at the top of the page, and drops any selection —
  // a tick box left checked on a page you have left is a trap.
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 })
    useSelection.getState().clear()
  }, [location.pathname])

  const flush = /^\/(album|artist|playlist)\//.test(location.pathname)

  return (
    <div className="app">
      <Sidebar />
      <main className="main glass">
        <TopBar />
        <div className={flush ? 'content content--flush' : 'content'} ref={contentRef}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/search" element={<Search />} />
            <Route path="/albums" element={<Albums />} />
            <Route path="/album/:id" element={<AlbumPage />} />
            <Route path="/artists" element={<Artists />} />
            <Route path="/artist/:id" element={<ArtistPage />} />
            <Route path="/songs" element={<Songs />} />
            <Route path="/genres" element={<Genres />} />
            <Route path="/genre/:name" element={<GenrePage />} />
            <Route path="/playlists" element={<Playlists />} />
            <Route path="/playlist/:id" element={<PlaylistPage />} />
            <Route path="/favourites" element={<Favourites />} />
            <Route path="/downloads" element={<Downloads />} />
            <Route path="/radio" element={<Radio />} />
            <Route path="/sync" element={<SyncPage />} />
            <Route path="/stats" element={<Stats />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </main>
      <PlayerBar />
      <QueuePanel />
      <SelectionBar />
    </div>
  )
}

export function App() {
  useThemeEffects()
  useBootstrap()
  useKeyboardShortcuts()

  return (
    <>
      <Backdrop />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="*"
          element={
            <RequireAuth>
              <Shell />
            </RequireAuth>
          }
        />
      </Routes>
      <NowPlaying />
      <AddToPlaylistModal />
      <OfflineDestinationPrompt />
      <ShortcutsModal />
      <DropZone />
      <Toasts />
    </>
  )
}
