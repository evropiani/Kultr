import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Disc3, Music2, Play, Shuffle, Tags, Users } from 'lucide-react'
import type { Album, Artist, Genre, Song } from '@/api/types'
import { allAlbums, allArtists, allGenres, allSongs } from '@/db'
import { useAsync, useDebounced } from '@/lib/hooks'
import { formatCount, sortKey } from '@/lib/format'
import { usePlayer } from '@/store/player'
import { useSync } from '@/store/sync'
import { AlbumCard, ArtistCard, Grid } from '@/components/Cards'
import { TrackList } from '@/components/TrackList'
import { Empty, Segmented, SkeletonGrid } from '@/components/ui'

/** Render a long list a chunk at a time, growing as the user scrolls. */
function useIncremental<T>(items: T[], step = 120) {
  const [limit, setLimit] = useState(step)
  const sentinel = useRef<HTMLDivElement>(null)

  useEffect(() => setLimit(step), [items, step])

  useEffect(() => {
    const element = sentinel.current
    if (!element) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setLimit((value) => Math.min(items.length, value + step))
        }
      },
      { rootMargin: '600px' },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [items.length, step])

  return { visible: items.slice(0, limit), sentinel, hasMore: limit < items.length }
}

function FilterBar({
  value,
  onChange,
  placeholder,
  children,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  children?: React.ReactNode
}) {
  return (
    <div className="page-actions" style={{ marginBottom: 18 }}>
      <div className="field" style={{ minWidth: 220, height: 34 }}>
        <input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
      </div>
      {children}
    </div>
  )
}

/* ------------------------------------------------------------------ albums -- */

type AlbumSort = 'name' | 'artist' | 'year' | 'added' | 'plays'

export function Albums() {
  const lastCheck = useSync((state) => state.state.lastCheck)
  const { data: albums, loading } = useAsync(async () => allAlbums(), [lastCheck], [] as Album[])
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<AlbumSort>('name')
  const search = useDebounced(query, 200)

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    const list = needle
      ? albums.filter(
          (album) =>
            album.name.toLowerCase().includes(needle) ||
            (album.artist ?? '').toLowerCase().includes(needle),
        )
      : [...albums]
    list.sort((a, b) => {
      switch (sort) {
        case 'artist':
          return sortKey(a.artist).localeCompare(sortKey(b.artist)) || (a.year ?? 0) - (b.year ?? 0)
        case 'year':
          return (b.year ?? 0) - (a.year ?? 0)
        case 'added':
          return (b.created ?? '').localeCompare(a.created ?? '')
        case 'plays':
          return (b.playCount ?? 0) - (a.playCount ?? 0)
        default:
          return sortKey(a.name).localeCompare(sortKey(b.name))
      }
    })
    return list
  }, [albums, search, sort])

  const { visible, sentinel, hasMore } = useIncremental(filtered)

  return (
    <>
      <div className="page-head">
        <div className="page-head__title">
          <h1>Albums</h1>
          <span className="page-head__sub">{formatCount(filtered.length, 'album')}</span>
        </div>
      </div>

      <FilterBar value={query} onChange={setQuery} placeholder="Filter albums…">
        <Segmented
          value={sort}
          onChange={setSort}
          options={[
            { value: 'name', label: 'Name' },
            { value: 'artist', label: 'Artist' },
            { value: 'year', label: 'Year' },
            { value: 'added', label: 'Added' },
            { value: 'plays', label: 'Plays' },
          ]}
        />
      </FilterBar>

      {loading ? (
        <SkeletonGrid />
      ) : filtered.length === 0 ? (
        <Empty icon={<Disc3 size={24} />} title="No albums match">
          Try a different filter, or sync the library from the Sync page.
        </Empty>
      ) : (
        <>
          <Grid>
            {visible.map((album) => (
              <AlbumCard key={album.id} album={album} />
            ))}
          </Grid>
          {hasMore ? <div ref={sentinel} style={{ height: 40 }} /> : null}
        </>
      )}
    </>
  )
}

/* ----------------------------------------------------------------- artists -- */

export function Artists() {
  const lastCheck = useSync((state) => state.state.lastCheck)
  const { data: artists, loading } = useAsync(async () => allArtists(), [lastCheck], [] as Artist[])
  const [query, setQuery] = useState('')
  const search = useDebounced(query, 200)

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    const list = needle
      ? artists.filter((artist) => artist.name.toLowerCase().includes(needle))
      : [...artists]
    list.sort((a, b) => sortKey(a.name).localeCompare(sortKey(b.name)))
    return list
  }, [artists, search])

  const { visible, sentinel, hasMore } = useIncremental(filtered)

  return (
    <>
      <div className="page-head">
        <div className="page-head__title">
          <h1>Artists</h1>
          <span className="page-head__sub">{formatCount(filtered.length, 'artist')}</span>
        </div>
      </div>
      <FilterBar value={query} onChange={setQuery} placeholder="Filter artists…" />

      {loading ? (
        <SkeletonGrid />
      ) : filtered.length === 0 ? (
        <Empty icon={<Users size={24} />} title="No artists match" />
      ) : (
        <>
          <Grid>
            {visible.map((artist) => (
              <ArtistCard key={artist.id} artist={artist} />
            ))}
          </Grid>
          {hasMore ? <div ref={sentinel} style={{ height: 40 }} /> : null}
        </>
      )}
    </>
  )
}

/* ------------------------------------------------------------------- songs -- */

export function Songs() {
  const lastCheck = useSync((state) => state.state.lastCheck)
  const { data: songs, loading } = useAsync(async () => allSongs(), [lastCheck], [] as Song[])
  const [query, setQuery] = useState('')
  const search = useDebounced(query, 220)

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return songs
    return songs.filter(
      (song) =>
        song.title.toLowerCase().includes(needle) ||
        (song.artist ?? '').toLowerCase().includes(needle) ||
        (song.album ?? '').toLowerCase().includes(needle),
    )
  }, [songs, search])

  return (
    <>
      <div className="page-head">
        <div className="page-head__title">
          <h1>Songs</h1>
          <span className="page-head__sub">{formatCount(filtered.length, 'track')}</span>
        </div>
        <div className="page-actions">
          <button
            className="pill"
            disabled={!filtered.length}
            onClick={() => {
              const picks = [...filtered].sort(() => Math.random() - 0.5)
              void usePlayer.getState().playNow(picks, 0, 'All songs')
            }}
          >
            <Shuffle size={14} />
            Shuffle
          </button>
          <button
            className="pill pill-accent"
            disabled={!filtered.length}
            onClick={() => void usePlayer.getState().playNow(filtered, 0, 'All songs')}
          >
            <Play size={14} fill="currentColor" />
            Play all
          </button>
        </div>
      </div>

      <FilterBar value={query} onChange={setQuery} placeholder="Filter songs…" />

      {loading ? (
        <div className="skeleton" style={{ height: 320 }} />
      ) : filtered.length === 0 ? (
        <Empty icon={<Music2 size={24} />} title="No songs match" />
      ) : (
        <TrackList songs={filtered} source="All songs" />
      )}
    </>
  )
}

/* ------------------------------------------------------------------ genres -- */

export function Genres() {
  const lastCheck = useSync((state) => state.state.lastCheck)
  const { data: genres, loading } = useAsync(async () => allGenres(), [lastCheck], [] as Genre[])

  const sorted = useMemo(
    () => [...genres].sort((a, b) => (b.songCount ?? 0) - (a.songCount ?? 0)),
    [genres],
  )

  return (
    <>
      <div className="page-head">
        <div className="page-head__title">
          <h1>Genres</h1>
          <span className="page-head__sub">{formatCount(sorted.length, 'genre')}</span>
        </div>
      </div>

      {loading ? (
        <SkeletonGrid count={8} />
      ) : sorted.length === 0 ? (
        <Empty icon={<Tags size={24} />} title="No genres yet">
          Navidrome builds genres from your file tags. Sync the library once they are in place.
        </Empty>
      ) : (
        <div className="stats" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
          {sorted.map((genre) => (
            <Link key={genre.value} to={`/genre/${encodeURIComponent(genre.value)}`} className="stat glass glass-hit">
              <span className="stat__value" style={{ fontSize: 17 }}>
                {genre.value}
              </span>
              <span className="stat__label">
                {formatCount(genre.songCount, 'track')} · {formatCount(genre.albumCount, 'album')}
              </span>
            </Link>
          ))}
        </div>
      )}
    </>
  )
}

export function GenrePage() {
  const { name = '' } = useParams()
  const genre = decodeURIComponent(name)
  const { data: songs, loading } = useAsync(
    async () => (await allSongs()).filter((song) => song.genre === genre),
    [genre],
    [] as Song[],
  )

  return (
    <>
      <div className="page-head">
        <div className="page-head__title">
          <span className="hero__kicker">Genre</span>
          <h1>{genre}</h1>
          <span className="page-head__sub">{formatCount(songs.length, 'track')}</span>
        </div>
        <div className="page-actions">
          <button
            className="pill"
            disabled={!songs.length}
            onClick={() =>
              void usePlayer
                .getState()
                .playNow([...songs].sort(() => Math.random() - 0.5), 0, genre)
            }
          >
            <Shuffle size={14} />
            Shuffle
          </button>
          <button
            className="pill pill-accent"
            disabled={!songs.length}
            onClick={() => void usePlayer.getState().playNow(songs, 0, genre)}
          >
            <Play size={14} fill="currentColor" />
            Play
          </button>
        </div>
      </div>

      {loading ? <div className="skeleton" style={{ height: 300 }} /> : <TrackList songs={songs} source={genre} />}
    </>
  )
}
