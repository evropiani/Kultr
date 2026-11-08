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
import { Stations } from '@/routes/Stations'
import { Planner } from '@/routes/Planner'
import { Recap } from '@/routes/Recap'
import { UpdateLog, WhatsNew } from '@/components/WhatsNew'
import { Welcome } from '@/components/Welcome'
import { CratePickerModal } from '@/components/Crates'
import { CratePage, Crates } from '@/routes/Crates'
import { Studio } from '@/routes/Studio'
import { useAuth } from '@/store/auth'
import { usePlayer } from '@/store/player'
import { useSettings } from '@/store/settings'
import { useUi } from '@/store/ui'
import { useSync } from '@/store/sync'
import { useOffline } from '@/store/offline'
import { useSelection } from '@/store/selection'
import { prefersReducedMotion } from '@/lib/motion'
import { FolderAccessBanner } from '@/components/LocalMusic'
import { getSyncState } from '@/db'

/** Keep the document's data-* attributes in step with the settings store. */
function useThemeEffects(): void {
  const {
    theme,
    nightMode,
    glass,
    gridSize,
    compactRows,
    reduceMotion,
    corners,
    surfaceBorder,
    borderOpacity,
    surfaceOpacity,
    backdropArtwork,
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
      useUi.getState().setResolvedTheme(resolved)
      // Night mode is a variant of dark, so it switches off with it — and
      // comes back with it when the system goes dark again.
      const night = nightMode && resolved === 'dark'
      if (night) root.dataset.night = 'true'
      else delete root.dataset.night
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', resolved === 'light' ? '#f6f0e5' : night ? '#000000' : '#1c1a17')
    }
    applyTheme()

    if (theme !== 'system') return
    const media = window.matchMedia('(prefers-color-scheme: light)')
    media.addEventListener('change', applyTheme)
    return () => media.removeEventListener('change', applyTheme)
  }, [theme, nightMode])

  useEffect(() => {
    const root = document.documentElement
    root.dataset.glass = glass
    root.dataset.grid = gridSize
    root.dataset.rows = compactRows ? 'compact' : 'normal'
    root.dataset.motion = reduceMotion ? 'reduced' : 'full'
    root.dataset.corners = corners
    root.dataset.border = surfaceBorder
    root.dataset.backdrop = backdropArtwork ? 'artwork' : 'plain'
    root.style.setProperty('--surface-scale', String(surfaceOpacity / 100))
    // Each theme scales it (borders show more on charcoal than on cream), so
    // one slider means the same in both, neutral or accent.
    root.style.setProperty('--border-opacity', String(borderOpacity / 100))
  }, [glass, gridSize, compactRows, reduceMotion, corners, surfaceBorder, borderOpacity, surfaceOpacity, backdropArtwork])

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

  // Each library keeps its own mirror: connecting to a different one than the
  // mirror holds clears it and reads the new one from the start.
  useEffect(
    () =>
      useAuth.subscribe((state, previous) => {
        if (state.status !== 'connected' || !state.activeId) return
        if (previous.status === 'connected' && previous.activeId === state.activeId) return
        const owner = state.activeId
        void (async () => {
          const sync = useSync.getState()
          const fresh = await sync.adopt(owner)
          // A library never read in full (a first sign-in, or a switch cut
          // short by a reload) is read now rather than waiting for a click.
          const neverRead = (await getSyncState()).lastFullSync === null
          if (fresh || neverRead) void useSync.getState().run('full')
        })()
      }),
    [],
  )

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
      // Listening data is cheap to bring across, so it does not wait for the
      // library check (which does it too, when it runs).
      if (!autoSyncOnStart) void useSync.getState().refreshListening()
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

  // Coming back to the tab is usually coming back from another device, so
  // that is when to look for plays made elsewhere; and back online is when
  // plays queued offline can finally go.
  useEffect(() => {
    let last = 0
    const refresh = () => {
      if (useAuth.getState().status !== 'connected' || useSync.getState().running) return
      if (Date.now() - last < 90_000) return
      last = Date.now()
      void useSync.getState().refreshListening()
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    const onOnline = () => {
      last = 0
      refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onOnline)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onOnline)
    }
  }, [])

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
  const pageRef = useRef<HTMLDivElement>(null)

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
    // The new page rises into place rather than replacing the old one in a
    // single frame. Short enough that it never feels like waiting.
    if (!prefersReducedMotion()) {
      pageRef.current?.animate(
        [
          { opacity: 0, transform: 'translateY(10px)' },
          { opacity: 1, transform: 'none' },
        ],
        { duration: 260, easing: 'cubic-bezier(0.25, 1, 0.5, 1)' },
      )
    }
  }, [location.pathname])

  const flush = /^\/(album|artist|playlist)\//.test(location.pathname)

  return (
    <div className="app">
      <Sidebar />
      <main className="main glass">
        <TopBar />
        <div className={flush ? 'content content--flush' : 'content'} ref={contentRef}>
          <div className="page" ref={pageRef}>
            <FolderAccessBanner />
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
              <Route path="/stations" element={<Stations />} />
              <Route path="/planner" element={<Planner />} />
              <Route path="/recap" element={<Recap />} />
              <Route path="/updates" element={<UpdateLog />} />
              <Route path="/crates" element={<Crates />} />
              <Route path="/crate/:id" element={<CratePage />} />
              <Route path="/studio" element={<Studio />} />
              <Route path="/sync" element={<SyncPage />} />
              <Route path="/stats" element={<Stats />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </div>
      </main>
      <PlayerBar />
      <QueuePanel />
      <SelectionBar />
      <Welcome />
      <WhatsNew />
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
      <CratePickerModal />
      <OfflineDestinationPrompt />
      <ShortcutsModal />
      <DropZone />
      <Toasts />
    </>
  )
}
