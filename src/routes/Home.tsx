import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Clock, Disc3, Heart, Play, RefreshCw, Shuffle, Sparkles } from 'lucide-react'
import type { Album, Song } from '@/api/types'
import { allAlbums, allSongs, recentHistory } from '@/db'
import { useAsync } from '@/lib/hooks'
import { formatCount, formatRelative } from '@/lib/format'
import { usePlayer } from '@/store/player'
import { useSync } from '@/store/sync'
import { buildAutoQueue } from '@/audio/automix'
import { AlbumCard, Grid } from '@/components/Cards'
import { Empty, SkeletonGrid } from '@/components/ui'
import { TrackList } from '@/components/TrackList'

function greeting(): string {
  const hour = new Date().getHours()
  if (hour < 5) return 'Still up?'
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export function Home() {
  const navigate = useNavigate()
  const syncState = useSync((state) => state.state)
  const running = useSync((state) => state.running)
  const run = useSync((state) => state.run)

  const { data, loading } = useAsync(
    async () => {
      const [albums, songs, history] = await Promise.all([allAlbums(), allSongs(), recentHistory(60)])
      return { albums, songs, history }
    },
    [syncState.lastCheck],
    { albums: [] as Album[], songs: [] as Song[], history: [] as Awaited<ReturnType<typeof recentHistory>> },
  )

  const recentlyAdded = useMemo(
    () =>
      [...data.albums]
        .sort((a, b) => (b.created ?? '').localeCompare(a.created ?? ''))
        .slice(0, 12),
    [data.albums],
  )

  const mostPlayed = useMemo(
    () => [...data.albums].filter((a) => a.playCount).sort((a, b) => (b.playCount ?? 0) - (a.playCount ?? 0)).slice(0, 12),
    [data.albums],
  )

  const recentTracks = useMemo(() => {
    const byId = new Map(data.songs.map((song) => [song.id, song]))
    const seen = new Set<string>()
    const out: Song[] = []
    for (const entry of data.history) {
      if (seen.has(entry.songId)) continue
      const song = byId.get(entry.songId)
      if (!song) continue
      seen.add(entry.songId)
      out.push(song)
      if (out.length >= 10) break
    }
    return out
  }, [data.history, data.songs])

  const favourites = useMemo(
    () => data.songs.filter((song) => song.starred).slice(0, 10),
    [data.songs],
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

  const startAutoMix = async () => {
    if (!data.songs.length) return
    const seed = data.songs[Math.floor(Math.random() * data.songs.length)]
    const rest = await buildAutoQueue(seed, { count: 24 })
    void usePlayer.getState().playNow([seed, ...rest], 0, 'AutoMix radio')
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
          <button className="pill pill-accent" onClick={() => void startAutoMix()}>
            <Sparkles size={14} />
            Start an AutoMix set
          </button>
        </div>
      </div>

      {loading ? (
        <SkeletonGrid count={8} />
      ) : (
        <>
          {recentTracks.length ? (
            <Shelf title="Jump back in" icon={<Clock size={16} />}>
              <TrackList
                songs={recentTracks}
                source="Recently played"
                numbering="none"
                sortable={false}
              />
            </Shelf>
          ) : null}

          <Shelf
            title="Recently added"
            icon={<Disc3 size={16} />}
            action={<Link className="pill" to="/albums">See all</Link>}
          >
            <Grid>
              {recentlyAdded.map((album) => (
                <AlbumCard key={album.id} album={album} />
              ))}
            </Grid>
          </Shelf>

          {favourites.length ? (
            <Shelf
              title="Favourites"
              icon={<Heart size={16} />}
              action={<Link className="pill" to="/favourites">See all</Link>}
            >
              <TrackList songs={favourites} source="Favourites" numbering="none" sortable={false} />
            </Shelf>
          ) : null}

          {mostPlayed.length ? (
            <Shelf title="Played the most" icon={<Play size={16} />}>
              <Grid>
                {mostPlayed.map((album) => (
                  <AlbumCard key={album.id} album={album} />
                ))}
              </Grid>
            </Shelf>
          ) : null}

          <div style={{ marginTop: 32 }}>
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
