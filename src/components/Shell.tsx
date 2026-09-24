import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Disc3,
  HardDrive,
  Heart,
  Home,
  Info,
  Keyboard,
  ListMusic,
  LogOut,
  Menu as MenuIcon,
  Moon,
  Music2,
  Radio,
  RefreshCw,
  Search,
  Server,
  Settings as SettingsIcon,
  Sun,
  Tags,
  Users,
  X,
} from 'lucide-react'
import { artUrl, dominantColor, hexToRgb } from '@/lib/artwork'
import { usePlayer } from '@/store/player'
import { useAuth } from '@/store/auth'
import { useSettings } from '@/store/settings'
import { useSync } from '@/store/sync'
import { useToast, useUi } from '@/store/ui'
import { Menu, useMenu, type MenuItem } from './ui'
import { OfflineProgressBar } from './Offline'
import { afterNextPaint, usePresence, useSlidingIndicator } from '@/lib/motion'
import { Logo } from './Logo'

/* ------------------------------------------------------------------ backdrop */

/**
 * Two stacked layers cross-fade between artworks so the background never
 * flickers when the track changes.
 */
export function Backdrop() {
  const song = usePlayer((state) => state.current())
  const backdropArtwork = useSettings((state) => state.backdropArtwork)
  const accentMode = useSettings((state) => state.accentMode)
  const accent = useSettings((state) => state.accent)
  const accentBlend = useSettings((state) => state.accentBlend)
  const setAccent = useUi((state) => state.setAccent)
  const [layers, setLayers] = useState<{ a: string; b: string; showA: boolean }>({
    a: '',
    b: '',
    showA: true,
  })

  const url = song ? artUrl(song, 600) : ''
  const songId = song?.id ?? ''

  // Keyed on the track, not the URL: a URL is a derived string and keying on
  // it makes this effect a render loop the moment it is not perfectly stable.
  useEffect(() => {
    if (!songId || !url) return
    setLayers((previous) =>
      previous.showA ? { ...previous, b: url, showA: false } : { ...previous, a: url, showA: true },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songId])

  // Drive the accent colour from the artwork, or from the fixed colour.
  useEffect(() => {
    let cancelled = false
    const apply = (rgb: [number, number, number] | null) => {
      if (cancelled || !rgb) return
      const root = document.documentElement
      root.style.setProperty('--accent-r', String(rgb[0]))
      root.style.setProperty('--accent-g', String(rgb[1]))
      root.style.setProperty('--accent-b', String(rgb[2]))
      setAccent(rgb)
    }

    const chosen = hexToRgb(accent) ?? [124, 140, 255]
    if (accentMode === 'fixed' || !url) {
      apply(chosen)
      return
    }
    // Your colour is laid over the artwork's at `accentBlend` opacity, so
    // "colour from artwork" and "my accent" stop being an either/or: at 0 the
    // artwork wins outright, at 100 your colour does, and in between the UI
    // still shifts with the album while staying recognisably yours.
    const mix = Math.min(1, Math.max(0, accentBlend / 100))
    void dominantColor(url).then((rgb) =>
      apply(rgb ? (rgb.map((c, i) => Math.round(c + (chosen[i] - c) * mix)) as [number, number, number]) : chosen),
    )
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songId, accentMode, accent, accentBlend, setAccent])

  return (
    <div className="backdrop" aria-hidden="true">
      {backdropArtwork ? (
        <>
          <div
            className="backdrop__layer"
            data-visible={layers.showA && Boolean(layers.a)}
            style={layers.a ? { backgroundImage: `url("${layers.a}")` } : undefined}
          />
          <div
            className="backdrop__layer"
            data-visible={!layers.showA && Boolean(layers.b)}
            style={layers.b ? { backgroundImage: `url("${layers.b}")` } : undefined}
          />
        </>
      ) : null}
      <div className="backdrop__mesh" />
      <div className="backdrop__vignette" />
    </div>
  )
}

/* ------------------------------------------------------------------- sidebar */

// No Search entry: the field in the top bar is always there and shows its
// results as you type, so a page that only held a second copy of it was
// just a detour.
const NAV_MAIN = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/radio', label: 'Radio', icon: Radio },
]

export function Sidebar() {
  const open = useUi((state) => state.sidebarOpen)
  const setSidebar = useUi((state) => state.setSidebar)
  const counts = useSync((state) => state.state.counts)
  const status = useAuth((state) => state.status)
  const profile = useAuth((state) => state.activeProfile())
  const location = useLocation()

  useEffect(() => setSidebar(false), [location.pathname, setSidebar])
  const scrim = usePresence(open, 240)

  // One highlight that slides to the page you picked, instead of one item
  // losing its background as another gains it.
  const navRef = useRef<HTMLElement>(null)
  const markRef = useRef<HTMLDivElement>(null)
  const slideTo = useSlidingIndicator(navRef, markRef, '.navitem.is-active', [location.pathname])

  const library = [
    { to: '/albums', label: 'Albums', icon: Disc3, count: counts.albums },
    { to: '/artists', label: 'Artists', icon: Users, count: counts.artists },
    { to: '/songs', label: 'Songs', icon: Music2, count: counts.songs },
    { to: '/genres', label: 'Genres', icon: Tags, count: counts.genres },
    { to: '/playlists', label: 'Playlists', icon: ListMusic, count: counts.playlists },
    { to: '/favourites', label: 'Favourites', icon: Heart },
    { to: '/downloads', label: 'Offline', icon: HardDrive },
  ]

  return (
    <>
      {scrim.present ? (
        <div className="sidebar-scrim" data-leaving={scrim.leaving} onClick={() => setSidebar(false)} />
      ) : null}
      <nav className="sidebar glass" data-open={open} aria-label="Main navigation" ref={navRef}>
        <div className="sidebar__mark" ref={markRef} aria-hidden="true" />
        <div className="sidebar__brand">
          <Logo size={32} />
          <span className="sidebar__name">Kultr</span>
          <button
            className="iconbtn mobile-only"
            style={{ marginLeft: 'auto' }}
            aria-label="Close the menu"
            onClick={() => setSidebar(false)}
          >
            <X size={18} />
          </button>
        </div>

        {NAV_MAIN.map((item) => (
          <NavItem key={item.to} {...item} onPick={slideTo} />
        ))}

        <div className="sidebar__section">Library</div>
        {library.map((item) => (
          <NavItem key={item.to} {...item} onPick={slideTo} />
        ))}

        <div className="sidebar__section">Server</div>
        <NavItem to="/sync" label="Sync" icon={RefreshCw} onPick={slideTo} />
        <NavItem to="/stats" label="Listening" icon={BarChart3} onPick={slideTo} />
        <NavItem to="/settings" label="Settings" icon={SettingsIcon} onPick={slideTo} />

        <div className="sidebar__footer">
          <OfflineProgressBar />
          <div className="sidebar__server">
            <span className="dot" data-state={status === 'connected' ? 'ok' : status} />
            <span style={{ minWidth: 0 }}>
              <strong>{profile?.label ?? 'Not connected'}</strong>
              {profile?.username ?? 'Sign in to start'}
            </span>
          </div>
        </div>
      </nav>
    </>
  )
}

function NavItem({
  to,
  label,
  icon: Icon,
  count,
  end,
  onPick,
}: {
  to: string
  label: string
  icon: typeof Home
  count?: number
  end?: boolean
  onPick?: (element: HTMLElement) => void
}) {
  const navigate = useNavigate()
  const location = useLocation()
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => (isActive ? 'navitem is-active' : 'navitem')}
      onClick={(event) => {
        // Plain clicks only; a new-tab click does not change this page.
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
        event.preventDefault()
        onPick?.(event.currentTarget)
        // Like a plain link: clicking the page you are on does not add a
        // second copy of it to the history.
        afterNextPaint(() => navigate(to, { replace: location.pathname === to && !location.search }))
      }}
    >
      <Icon size={17} />
      {label}
      {count ? <span className="navitem__count">{count.toLocaleString()}</span> : null}
    </NavLink>
  )
}

/* -------------------------------------------------------------------- topbar */

export function TopBar() {
  const navigate = useNavigate()
  const location = useLocation()
  const setSidebar = useUi((state) => state.setSidebar)
  const setShortcuts = useUi((state) => state.setShortcuts)
  const theme = useSettings((state) => state.theme)
  const setSetting = useSettings((state) => state.set)
  const sync = useSync()
  const auth = useAuth()
  const menu = useMenu()
  const profileButton = useRef<HTMLButtonElement>(null)

  // The field is the search page's input. Typing anywhere opens the results
  // and updates them live; the text is kept in the address, so Back and
  // Forward bring a search back with its results.
  const onSearchPage = location.pathname === '/search'
  const urlQuery = onSearchPage ? (new URLSearchParams(location.search).get('q') ?? '') : ''
  const [query, setQuery] = useState(urlQuery)
  useEffect(() => {
    if (onSearchPage) {
      if (urlQuery !== query) setQuery(urlQuery)
    } else if (query) {
      setQuery('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onSearchPage, urlQuery])

  const typeQuery = (value: string) => {
    setQuery(value)
    const target = value ? `/search?q=${encodeURIComponent(value)}` : '/search'
    // The first keystroke is a new page you can go Back from; the rest just
    // refine it, so they replace rather than pile up in the history.
    navigate(target, { replace: onSearchPage })
  }

  const profileItems: MenuItem[] = useMemo(() => {
    const items: MenuItem[] = auth.profiles.map((profile) => ({
      label: `${profile.label} · ${profile.username}`,
      icon: <Server size={15} />,
      onSelect: () => void auth.switchProfile(profile.id),
      disabled: profile.id === auth.activeId,
    }))
    items.push({
      label: 'Add another server…',
      icon: <Server size={15} />,
      separatorBefore: true,
      onSelect: () => {
        auth.logout()
        navigate('/login')
      },
    })
    items.push({
      label: 'Keyboard shortcuts',
      icon: <Keyboard size={15} />,
      onSelect: () => setShortcuts(true),
    })
    items.push({
      label: 'Sign out',
      icon: <LogOut size={15} />,
      danger: true,
      separatorBefore: true,
      onSelect: () => {
        auth.logout()
        navigate('/login')
      },
    })
    return items
  }, [auth, navigate, setShortcuts])

  return (
    <header className="topbar">
      <button
        className="iconbtn mobile-only"
        aria-label="Open the menu"
        onClick={() => setSidebar(true)}
      >
        <MenuIcon size={19} />
      </button>

      <div className="topbar__nav">
        <button className="iconbtn" aria-label="Back" onClick={() => navigate(-1)}>
          <ChevronLeft size={19} />
        </button>
        <button className="iconbtn" aria-label="Forward" onClick={() => navigate(1)}>
          <ChevronRight size={19} />
        </button>
      </div>

      <form
        className="field topbar__search"
        role="search"
        onSubmit={(event) => {
          event.preventDefault()
          if (!onSearchPage) navigate(`/search?q=${encodeURIComponent(query)}`)
          // Dismiss the on-screen keyboard so the results are visible.
          event.currentTarget.querySelector('input')?.blur()
        }}
      >
        <Search size={16} opacity={0.6} />
        <input
          type="search"
          value={query}
          placeholder="Search your library…  (press /)"
          aria-label="Search your library"
          data-search-input="true"
          enterKeyHint="search"
          onChange={(event) => typeQuery(event.target.value)}
        />
      </form>

      <div className="topbar__spacer" />

      <button
        className="pill pill--sync"
        onClick={() => void sync.run('check')}
        disabled={sync.running}
        aria-label="Check for updates"
        title="Check the server for changes and pull in anything new"
      >
        <RefreshCw size={14} className={sync.running ? 'spin' : undefined} />
        {/* The label folds away on a phone; the percentage does not, because
            it is the only sign that a sync is making progress. */}
        {sync.running ? (
          <span>{Math.round(sync.progress.percent * 100)}%</span>
        ) : (
          <span className="pill__label">Check for updates</span>
        )}
      </button>

      <button
        className="iconbtn"
        aria-label="Toggle theme"
        onClick={() => setSetting('theme', theme === 'dark' ? 'light' : 'dark')}
      >
        {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
      </button>

      <button
        ref={profileButton}
        className="iconbtn"
        aria-label="Account and servers"
        onClick={() => menu.openFrom(profileButton.current)}
      >
        <Activity size={17} />
      </button>
      <Menu anchor={menu.anchor} items={profileItems} onClose={menu.close} />
    </header>
  )
}

/* -------------------------------------------------------------------- toasts */

const TOAST_ICONS = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: AlertTriangle,
}

export function Toasts() {
  const { toasts, dismiss } = useToast()
  if (!toasts.length) return null
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((toast) => {
        const Icon = TOAST_ICONS[toast.kind]
        return (
          <div
            key={toast.id}
            className="toast glass glass-strong"
            data-kind={toast.kind}
            data-leaving={Boolean(toast.leaving)}
          >
            <Icon size={16} className="toast__icon" />
            <span>{toast.message}</span>
            <button
              className="iconbtn toast__close"
              style={{ width: 26, height: 26 }}
              aria-label="Dismiss"
              onClick={() => dismiss(toast.id)}
            >
              <X size={14} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
