import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { BarChart3, GitMerge, Package, Pause, Play, SkipForward, Zap } from 'lucide-react'
import type { Album } from '@/api/types'
import { allAlbums, recentHistory } from '@/db'
import { artUrl } from '@/lib/artwork'
import { commandFor, describeCommand, runCommand } from '@/lib/commandRunner'
import { crateSongs } from '@/lib/crates'
import { useAsync } from '@/lib/hooks'
import { libraryDecades } from '@/lib/stationLibrary'
import { widgetRows, type HomeWidget } from '@/lib/widgets'
import { stationName, summary, type Station } from '@/audio/stations'
import { usePlayer } from '@/store/player'
import { useSettings } from '@/store/settings'
import { useSync } from '@/store/sync'
import { useUi } from '@/store/ui'
import { StationIcon } from './StationIcon'
import { Art } from './ui'
import { t } from '@/i18n'

/** The widgets at the top of Home, in rows: small ones side by side. As in Kultr for iOS. */
export function HomeWidgets() {
  const widgets = useSettings((state) => state.homeWidgets)
  const show = useSettings((state) => state.showHomeWidgets)
  if (!show || !widgets.length) return null
  return (
    <div className="widgets">
      {widgetRows(widgets).map((row) => (
        <div key={row.join('-')} className="widgets__row" data-pair={row.length === 2 || undefined}>
          {row.map((index) => (
            <Widget key={widgets[index].id} widget={widgets[index]} />
          ))}
        </div>
      ))}
    </div>
  )
}

function Widget({ widget }: { widget: HomeWidget }) {
  switch (widget.kind) {
    case 'nowPlaying':
      return <NowPlayingWidget widget={widget} />
    case 'listening':
      return <ListeningWidget widget={widget} />
    case 'nextMix':
      return <NextMixWidget widget={widget} />
    case 'station':
      return <StationWidget widget={widget} />
    case 'crate':
      return <CrateWidget widget={widget} />
    case 'shortcut':
      return <ShortcutWidget widget={widget} />
  }
}

function NowPlayingWidget({ widget }: { widget: HomeWidget }) {
  const song = usePlayer((state) => state.current())
  const playing = usePlayer((state) => state.playback === 'playing')
  const setNowPlaying = useUi((state) => state.setNowPlaying)
  return (
    <div className="widget glass" data-size={widget.size}>
      <button className="widget__main" onClick={() => song && setNowPlaying(true)} disabled={!song}>
        <Art src={song ? artUrl(song, 200) : ''} alt={song?.album ?? t("Nothing playing")} className="widget__art" />
        <span className="widget__text">
          <small>{t("Now playing")}</small>
          <strong>{song?.title ?? t("Nothing yet")}</strong>
          <span>{song ? song.artist : t("Pick something, or start a station")}</span>
        </span>
      </button>
      {song ? (
        <span className="widget__buttons">
          <button className="iconbtn" aria-label={playing ? t("Pause") : t("Play")} onClick={() => void usePlayer.getState().toggle()}>
            {playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
          </button>
          {widget.size !== 'small' ? (
            <button className="iconbtn" aria-label={t("Next track")} onClick={() => void usePlayer.getState().next(true)}>
              <SkipForward size={18} fill="currentColor" />
            </button>
          ) : null}
        </span>
      ) : null}
    </div>
  )
}

function ListeningWidget({ widget }: { widget: HomeWidget }) {
  const listeningAt = useSync((state) => state.listeningAt)
  const navigate = useNavigate()
  const { data } = useAsync(
    async () => {
      const history = await recentHistory(20_000)
      const week = 7 * 86_400_000
      const now = Date.now()
      let thisWeek = 0
      let before = 0
      for (const entry of history) {
        const age = now - entry.playedAt
        if (age < week) thisWeek += entry.seconds
        else if (age < week * 5) before += entry.seconds
      }
      return { thisWeek, usual: before / 4 }
    },
    [listeningAt],
    { thisWeek: 0, usual: 0 },
  )
  const hours = data.thisWeek / 3600
  const ratio = data.usual > 0 ? data.thisWeek / data.usual : null
  return (
    <button className="widget glass" data-size={widget.size} onClick={() => navigate('/recap')}>
      <span className="widget__icon">
        <BarChart3 size={18} />
      </span>
      <span className="widget__text">
        <small>{t("This week")}</small>
        <strong>{hours >= 1 ? `${hours.toFixed(hours < 10 ? 1 : 0)} h` : t("%@ min", Math.round(data.thisWeek / 60))}</strong>
        <span>{ratio === null ? t("of listening") : ratio >= 1.05 ? t("%@% more than usual", Math.round((ratio - 1) * 100)) : ratio <= 0.95 ? t("%@% less than usual", Math.round((1 - ratio) * 100)) : t("about as usual")}</span>
      </span>
    </button>
  )
}

const MIX_WORDS: Record<string, string> = {
  gapless: 'straight on',
  crossfade: 'a crossfade',
  blend: 'a blend',
  sweep: 'a sweep',
  cut: 'a cut',
}

function NextMixWidget({ widget }: { widget: HomeWidget }) {
  const next = usePlayer((state) => state.peekNext())
  const plan = usePlayer((state) => state.currentPlan())
  return (
    <div className="widget glass" data-size={widget.size}>
      <span className="widget__icon">
        <GitMerge size={18} />
      </span>
      <span className="widget__text">
        <small>{t("Next mix")}</small>
        <strong>{next?.title ?? t("Nothing next")}</strong>
        <span>
          {next
            ? plan
              ? plan.duration > 0.5
                ? t('%@ over %@ s', t(MIX_WORDS[plan.type] ?? 'a mix'), Math.round(plan.duration))
                : t(MIX_WORDS[plan.type] ?? 'a mix')
              : next.artist
            : t("Karousel or a station keeps it going")}
        </span>
      </span>
    </div>
  )
}

function StationWidget({ widget }: { widget: HomeWidget }) {
  const mine = useSettings((state) => state.stations)
  const { data: decades } = useAsync(() => libraryDecades(), [], [] as Station[])
  const station = [...mine, ...decades].find((entry) => entry.id === widget.ref) ?? mine[0]
  const playing = usePlayer((state) => state.station?.id === station?.id)
  if (!station) return null
  return (
    <button
      className="widget glass"
      data-size={widget.size}
      data-active={playing || undefined}
      onClick={() => void usePlayer.getState().playStation(station)}
    >
      <span className="widget__icon">
        <StationIcon symbol={station.icon} size={18} />
      </span>
      <span className="widget__text">
        <small>{playing ? t("Playing") : t("Station")}</small>
        <strong>{stationName(station)}</strong>
        <span>{summary(station)}</span>
      </span>
    </button>
  )
}

function CrateWidget({ widget }: { widget: HomeWidget }) {
  const crates = useSettings((state) => state.crates)
  const crate = crates.find((entry) => entry.id === widget.ref) ?? crates[0]
  const { data: albums } = useAsync(async () => (await allAlbums()) as Album[], [], [] as Album[])
  const covers = useMemo(() => (crate ? albums.filter((album) => crate.albums.includes(album.id)).slice(0, 4) : []), [albums, crate])
  if (!crate) return null
  return (
    <button
      className="widget glass"
      data-size={widget.size}
      onClick={async () => {
        const songs = await crateSongs(crate)
        if (songs.length) void usePlayer.getState().playNow(songs, 0, crate.name)
      }}
    >
      {covers.length ? (
        <span className="widget__covers">
          {covers.map((album) => (
            <Art key={album.id} src={artUrl(album, 120)} alt={album.name} />
          ))}
        </span>
      ) : (
        <span className="widget__icon">
          <Package size={18} />
        </span>
      )}
      <span className="widget__text">
        <small>{t("Crate")}</small>
        <strong>{crate.name}</strong>
        <span>{t("Click to play it")}</span>
      </span>
    </button>
  )
}

function ShortcutWidget({ widget }: { widget: HomeWidget }) {
  const navigate = useNavigate()
  const words = widget.ref || 'shuffle all'
  const command = commandFor(words)
  return (
    <button className="widget glass" data-size={widget.size} disabled={!command} onClick={() => command && void runCommand(command, (to) => navigate(to))}>
      <span className="widget__icon">
        <Zap size={18} />
      </span>
      <span className="widget__text">
        <small>{t("Shortcut")}</small>
        <strong>{command ? describeCommand(command) : words}</strong>
        <span>“{words}”</span>
      </span>
    </button>
  )
}
