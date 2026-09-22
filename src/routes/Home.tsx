import { useMemo, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Clock,
  Disc3,
  Heart,
  ListMusic,
  Play,
  Radio as RadioIcon,
  RefreshCw,
  Settings as SettingsIcon,
  Shuffle,
  Sparkles,
} from 'lucide-react'
import type { Album, Artist, Playlist, RadioStation, Song } from '@/api/types'
import { maybeClient } from '@/api/subsonic'
import { allAlbums, allArtists, allPlaylists, allSongs, recentHistory } from '@/db'
import { useAsync } from '@/lib/hooks'
import { formatCount, formatRelative } from '@/lib/format'
import { HOME_TILES, resolveHomeTiles, type HomeTile } from '@/lib/homeTiles'
import { usePlayer } from '@/store/player'
import { useSettings, type GridSize } from '@/store/settings'
import { useSync } from '@/store/sync'
import { buildAutoQueue } from '@/audio/injekt'
import { AlbumCard, ArtistCard, Grid, PlaylistCard } from '@/components/Cards'
import { Empty, SkeletonGrid } from '@/components/ui'
import { TrackList } from '@/components/TrackList'
import { RadioGrid, radioSongs } from '@/components/Radio'

function greeting(): string {
  const hour = new Date().getHours()
  if (hour < 5) return 'Still up?'
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

const TILE_ICONS: Record<string, React.ReactNode> = {
  recentlyPlayed: <Clock size={16} />,
  mostPlayedSongs: <Play size={16} />,
  mostPlayedAlbums: <Play size={16} />,
  mostPlayedArtists: <Play size={16} />,
  mostPlayedPlaylists: <Play size={16} />,
  randomSongs: <Shuffle size={16} />,
  randomAlbums: <Shuffle size={16} />,
  randomArtists: <Shuffle size={16} />,
  recentlyAdded: <Disc3 size={16} />,
  favouriteSongs: <Heart size={16} />,
  favouriteAlbums: <Heart size={16} />,
  favouriteArtists: <Heart size={16} />,
  favouritePlaylists: <ListMusic size={16} />,
  favouriteRadios: <Heart size={16} />,
  radios: <RadioIcon size={16} />,
}

const SONG_LIMIT = 10

/**
 * How many cards fill a shelf, per grid size.
 *
 * Small and medium cards pack more per row, so a fixed count left a ragged
 * gap on the last line. These are the lowest common multiples that come out
 * even at the column counts each size produces on a normal window.
 */
const CARD_LIMITS: Record<GridSize, number> = { large: 12, medium: 16, small: 20 }

export function Home() {
  const navigate = useNavigate()
  const syncState = useSync((state) => state.state)
  const running = useSync((state) => state.running)
  const run = useSync((state) => state.run)
  const tileIds = useSettings((state) => state.homeTiles)
  const favouriteRadios = useSettings((state) => state.favouriteRadios)
  const gridSize = useSettings((state) => state.gridSize)
  const openSections = useSettings((state) => state.openSettingsSections)
  const setSetting = useSettings((state) => state.set)
  const cardLimit = CARD_LIMITS[gridSize] ?? 12

  const tiles = useMemo(() => resolveHomeTiles(tileIds), [tileIds])
  const wantsRadio = tiles.some((tile) => tile.kind === 'radios')

  const { data, loading } = useAsync(
    async () => {
      const [albums, songs, artists, playlists, history] = await Promise.all([
        allAlbums(),
        allSongs(),
        allArtists(),
        allPlaylists(),
        recentHistory(60),
      ])
      return { albums, songs, artists, playlists, history }
    },
    [syncState.lastCheck],
    {
      albums: [] as Album[],
      songs: [] as Song[],
      artists: [] as Artist[],
      playlists: [] as Playlist[],
      history: [] as Awaited<ReturnType<typeof recentHistory>>,
    },
  )

  // Stations are not part of the local mirror, so they are only fetched when a
  // tile actually needs them.
  const { data: stations } = useAsync(
    async () => (wantsRadio ? ((await maybeClient()?.getInternetRadioStations()) ?? []) : []),
    [wantsRadio],
    [] as RadioStation[],
  )

  // Reshuffled when the library changes, not on every render — otherwise the
  // "random" shelves would reorder themselves under the pointer.
  const shuffleSeed = useRef(Math.random())
  const randomKey = `${data.songs.length}:${data.albums.length}:${shuffleSeed.current}`

  const content = useMemo(
    () => buildShelves(tiles, data, stations, favouriteRadios, cardLimit),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tiles, data, stations, favouriteRadios, cardLimit, randomKey],
  )

  if (!loading && data.albums.length === 0) {
    return (
      <Empty
        icon={<Disc3 size={26} />}
        title="Your library is not synced yet"
        action={
          <button className="pill pill-accent pill-lg" disabled={running} onClick={() => void run('full')}>
            <RefreshCw size={15} className={running ? 'spin' : undefined} />
            {running ? 'Syncing…' : 'Sync my library'}
          </button>
        }
      >
        Kultr keeps a local copy of your Navidrome library so browsing is instant and works even when
        the server is unreachable. This is a one-time job — after that, “Check for updates” only
        pulls what changed.
      </Empty>
    )
  }

  const shuffleEverything = () => {
    if (!data.songs.length) return
    const picks = [...data.songs].sort(() => Math.random() - 0.5).slice(0, 100)
    void usePlayer.getState().playNow(picks, 0, 'Shuffle all')
  }

  const startInjeKt = async () => {
    if (!data.songs.length) return
    const seed = data.songs[Math.floor(Math.random() * data.songs.length)]
    const rest = await buildAutoQueue(seed, { count: 24 })
    void usePlayer.getState().playNow([seed, ...rest], 0, 'InjeKt radio')
  }

  return (
    <>
      <div className="page-head">
        <div className="page-head__title">
          <h1>{greeting()}</h1>
          <span className="page-head__sub">
            {formatCount(syncState.counts.songs, 'track')} · {formatCount(syncState.counts.albums, 'album')} ·
            last checked {formatRelative(syncState.lastCheck)}
          </span>
        </div>
        <div className="page-actions">
          <button className="pill" onClick={shuffleEverything}>
            <Shuffle size={14} />
            Shuffle all
          </button>
          <button className="pill pill-accent" onClick={() => void startInjeKt()}>
            <Sparkles size={14} />
            Start an InjeKt set
          </button>
        </div>
      </div>

      {loading ? (
        <SkeletonGrid count={8} />
      ) : (
        <>
          {content.map(({ tile, body }) => (
            <Shelf
              key={tile.id}
              title={tile.title}
              icon={TILE_ICONS[tile.id]}
              action={
                tile.seeAll ? (
                  <Link className="pill" to={tile.seeAll}>
                    See all
                  </Link>
                ) : null
              }
            >
              {body}
            </Shelf>
          ))}

          {content.length === 0 ? (
            <Empty icon={<SettingsIcon size={24} />} title="Nothing on the home page yet">
              Every shelf is switched off, or none of them has anything to show. Choose what appears
              here — and in what order — in Settings → Home page.
            </Empty>
          ) : null}

          <div style={{ marginTop: 32, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              className="pill"
              onClick={() => {
                // Settings sections start collapsed, so open the relevant one
                // rather than landing on a page of shut headings.
                if (!openSections.includes('Home page')) {
                  setSetting('openSettingsSections', [...openSections, 'Home page'])
                }
                navigate('/settings')
              }}
            >
              <SettingsIcon size={14} />
              Customise this page
            </button>
            <button className="pill" onClick={() => navigate('/sync')}>
              <RefreshCw size={14} />
              Library and sync options
            </button>
          </div>
        </>
      )}
    </>
  )
}

/* ------------------------------------------------------------------ shelves */

interface LibraryData {
  albums: Album[]
  songs: Song[]
  artists: Artist[]
  playlists: Playlist[]
  history: Awaited<ReturnType<typeof recentHistory>>
}

/** Take `count` items at random without disturbing the source array. */
function sample<T>(items: T[], count: number): T[] {
  if (items.length <= count) return [...items]
  const picked = new Set<number>()
  const out: T[] = []
  // The library is always far larger than `count` here, so rejection sampling
  // finishes quickly and avoids copying the whole array to shuffle it.
  while (out.length < count && picked.size < items.length) {
    const index = Math.floor(Math.random() * items.length)
    if (picked.has(index)) continue
    picked.add(index)
    out.push(items[index])
  }
  return out
}

function byPlayCount<T extends { playCount?: number }>(items: T[], count: number): T[] {
  return items
    .filter((item) => (item.playCount ?? 0) > 0)
    .sort((a, b) => (b.playCount ?? 0) - (a.playCount ?? 0))
    .slice(0, count)
}

function buildShelves(
  tiles: HomeTile[],
  data: LibraryData,
  stations: RadioStation[],
  favouriteRadios: string[],
  cardLimit: number,
): { tile: HomeTile; body: React.ReactNode }[] {
  const out: { tile: HomeTile; body: React.ReactNode }[] = []

  const songList = (songs: Song[], source: string) =>
    songs.length ? (
      <TrackList songs={songs} source={source} numbering="none" sortable={false} />
    ) : null
  const albumGrid = (albums: Album[]) =>
    albums.length ? (
      <Grid>
        {albums.map((album) => (
          <AlbumCard key={album.id} album={album} />
        ))}
      </Grid>
    ) : null
  const artistGrid = (artists: Artist[]) =>
    artists.length ? (
      <Grid>
        {artists.map((artist) => (
          <ArtistCard key={artist.id} artist={artist} />
        ))}
      </Grid>
    ) : null
  const playlistGrid = (playlists: Playlist[]) =>
    playlists.length ? (
      <Grid>
        {playlists.map((playlist) => (
          <PlaylistCard key={playlist.id} playlist={playlist} />
        ))}
      </Grid>
    ) : null

  for (const tile of tiles) {
    let body: React.ReactNode = null

    switch (tile.id) {
      case 'recentlyPlayed': {
        const byId = new Map(data.songs.map((song) => [song.id, song]))
        const seen = new Set<string>()
        const picks: Song[] = []
        for (const entry of data.history) {
          if (seen.has(entry.songId)) continue
          const song = byId.get(entry.songId)
          if (!song) continue
          seen.add(entry.songId)
          picks.push(song)
          if (picks.length >= SONG_LIMIT) break
        }
        body = songList(picks, 'Recently played')
        break
      }
      case 'mostPlayedSongs':
        body = songList(byPlayCount(data.songs, SONG_LIMIT), 'Played the most')
        break
      case 'mostPlayedAlbums':
        body = albumGrid(byPlayCount(data.albums, cardLimit))
        break
      case 'mostPlayedArtists': {
        // Artists carry no play count of their own, so it is summed from the
        // tracks we already have locally.
        const totals = new Map<string, number>()
        for (const song of data.songs) {
          if (!song.artistId || !song.playCount) continue
          totals.set(song.artistId, (totals.get(song.artistId) ?? 0) + song.playCount)
        }
        const ranked = data.artists
          .filter((artist) => totals.has(artist.id))
          .sort((a, b) => (totals.get(b.id) ?? 0) - (totals.get(a.id) ?? 0))
          .slice(0, cardLimit)
        body = artistGrid(ranked)
        break
      }
      case 'mostPlayedPlaylists': {
        // Same again for playlists, from the entries the sync stored.
        const totals = new Map<string, number>()
        for (const playlist of data.playlists) {
          const played = (playlist.entry ?? []).reduce((sum, song) => sum + (song.playCount ?? 0), 0)
          if (played > 0) totals.set(playlist.id, played)
        }
        const ranked = data.playlists
          .filter((playlist) => totals.has(playlist.id))
          .sort((a, b) => (totals.get(b.id) ?? 0) - (totals.get(a.id) ?? 0))
          .slice(0, cardLimit)
        body = playlistGrid(ranked)
        break
      }
      case 'randomSongs':
        body = songList(sample(data.songs, SONG_LIMIT), 'Something else')
        break
      case 'randomAlbums':
        body = albumGrid(sample(data.albums, cardLimit))
        break
      case 'randomArtists':
        body = artistGrid(sample(data.artists, cardLimit))
        break
      case 'recentlyAdded':
        body = albumGrid(
          [...data.albums]
            .sort((a, b) => (b.created ?? '').localeCompare(a.created ?? ''))
            .slice(0, cardLimit),
        )
        break
      case 'favouriteSongs':
        body = songList(
          data.songs.filter((song) => song.starred).slice(0, SONG_LIMIT),
          'Favourites',
        )
        break
      case 'favouriteAlbums':
        body = albumGrid(data.albums.filter((album) => album.starred).slice(0, cardLimit))
        break
      case 'favouriteArtists':
        body = artistGrid(data.artists.filter((artist) => artist.starred).slice(0, cardLimit))
        break
      case 'favouritePlaylists':
        body = playlistGrid(
          [...data.playlists]
            .sort((a, b) => (b.changed ?? b.created ?? '').localeCompare(a.changed ?? a.created ?? ''))
            .slice(0, cardLimit),
        )
        break
      case 'favouriteRadios': {
        const picks = stations.filter((station) => favouriteRadios.includes(station.id))
        body = picks.length ? <RadioGrid stations={picks} songs={radioSongs(picks)} /> : null
        break
      }
      case 'radios':
        body = stations.length ? (
          <RadioGrid stations={stations} songs={radioSongs(stations)} />
        ) : null
        break
      default:
        body = null
    }

    if (body) out.push({ tile, body })
  }

  return out
}

function Shelf({
  title,
  icon,
  action,
  children,
}: {
  title: string
  icon: React.ReactNode
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section style={{ marginBottom: 34 }}>
      <div className="page-head" style={{ marginBottom: 12, alignItems: 'center' }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {icon}
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  )
}

/** Exported so Settings can show the same names without duplicating them. */
export { HOME_TILES }
