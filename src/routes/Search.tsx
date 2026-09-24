import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search as SearchIcon, Server } from 'lucide-react'
import type { Album, Artist, Song } from '@/api/types'
import { maybeClient } from '@/api/subsonic'
import { allAlbums, allArtists, allSongs } from '@/db'
import { useAsync, useDebounced } from '@/lib/hooks'
import { formatCount, sortKey } from '@/lib/format'
import { AlbumCard, ArtistCard, Grid } from '@/components/Cards'
import { TrackList } from '@/components/TrackList'
import { Empty, Spinner } from '@/components/ui'

/** Rank a match: exact beats prefix beats "contains". */
function score(haystack: string | undefined, needle: string): number {
  if (!haystack) return 0
  const value = haystack.toLowerCase()
  if (value === needle) return 100
  if (value.startsWith(needle)) return 60
  const index = value.indexOf(needle)
  if (index >= 0) return 30 - Math.min(20, index)
  return 0
}

/**
 * Search results. The input is the field in the top bar, which keeps the
 * query in the address (`?q=`); this page only reads it.
 */
export function Search() {
  const [params] = useSearchParams()
  const query = params.get('q') ?? ''
  const search = useDebounced(query.trim().toLowerCase(), 180)
  const [serverResults, setServerResults] = useState<{
    artist: Artist[]
    album: Album[]
    song: Song[]
  } | null>(null)
  const [serverBusy, setServerBusy] = useState(false)

  const { data: library, loading } = useAsync(
    async () => {
      const [songs, albums, artists] = await Promise.all([allSongs(), allAlbums(), allArtists()])
      return { songs, albums, artists }
    },
    [],
    { songs: [] as Song[], albums: [] as Album[], artists: [] as Artist[] },
  )

  const results = useMemo(() => {
    if (!search) return { songs: [], albums: [], artists: [] }
    const songs = library.songs
      .map((song) => ({
        song,
        rank:
          score(song.title, search) * 2 + score(song.artist, search) + score(song.album, search) * 0.5,
      }))
      .filter((entry) => entry.rank > 0)
      .sort((a, b) => b.rank - a.rank)
      .slice(0, 100)
      .map((entry) => entry.song)

    const albums = library.albums
      .map((album) => ({
        album,
        rank: score(album.name, search) * 2 + score(album.artist, search),
      }))
      .filter((entry) => entry.rank > 0)
      .sort((a, b) => b.rank - a.rank)
      .slice(0, 24)
      .map((entry) => entry.album)

    const artists = library.artists
      .filter((artist) => score(artist.name, search) > 0)
      .sort((a, b) => sortKey(a.name).localeCompare(sortKey(b.name)))
      .slice(0, 18)

    return { songs, albums, artists }
  }, [library, search])

  const askServer = async () => {
    const client = maybeClient()
    if (!client || !search) return
    setServerBusy(true)
    try {
      const found = await client.search3({
        query: search,
        artistCount: 20,
        albumCount: 24,
        songCount: 100,
      })
      setServerResults({
        artist: found.artist ?? [],
        album: found.album ?? [],
        song: found.song ?? [],
      })
    } catch {
      setServerResults({ artist: [], album: [], song: [] })
    } finally {
      setServerBusy(false)
    }
  }

  useEffect(() => setServerResults(null), [search])

  const nothingLocal =
    Boolean(search) && !results.songs.length && !results.albums.length && !results.artists.length

  return (
    <>
      <div className="page-head">
        <div className="page-head__title">
          <h1>{query.trim() ? `Results for “${query.trim()}”` : 'Search'}</h1>
          <span className="page-head__sub">
            Searches your local mirror instantly. Ask the server if something is missing.
          </span>
        </div>
      </div>

      {loading ? (
        <Spinner />
      ) : !search ? (
        <Empty icon={<SearchIcon size={24} />} title="Type in the search bar above">
          Results appear here as you type. Everything comes from the copy of your library stored in
          this browser, so it is instant even over a slow connection. Press <strong>/</strong> from
          anywhere to jump to it.
        </Empty>
      ) : (
        <>
          {results.artists.length ? (
            <section style={{ marginBottom: 30 }}>
              <h2 style={{ marginBottom: 12 }}>Artists</h2>
              <Grid>
                {results.artists.map((artist) => (
                  <ArtistCard key={artist.id} artist={artist} />
                ))}
              </Grid>
            </section>
          ) : null}

          {results.albums.length ? (
            <section style={{ marginBottom: 30 }}>
              <h2 style={{ marginBottom: 12 }}>Albums</h2>
              <Grid>
                {results.albums.map((album) => (
                  <AlbumCard key={album.id} album={album} />
                ))}
              </Grid>
            </section>
          ) : null}

          {results.songs.length ? (
            <section style={{ marginBottom: 30 }}>
              <h2 style={{ marginBottom: 12 }}>
                Tracks <span className="page-head__sub">{formatCount(results.songs.length, 'result')}</span>
              </h2>
              <TrackList songs={results.songs} source={`Search: ${search}`} sortable={false} />
            </section>
          ) : null}

          {nothingLocal ? (
            <Empty icon={<SearchIcon size={24} />} title={`Nothing local for “${query}”`}>
              Your mirror may be out of date. Ask the server directly, or run a sync.
            </Empty>
          ) : null}

          <div style={{ marginTop: 10 }}>
            <button className="pill" onClick={() => void askServer()} disabled={serverBusy}>
              {serverBusy ? <Spinner /> : <Server size={14} />}
              Search the server directly
            </button>
          </div>

          {serverResults ? (
            <section style={{ marginTop: 26 }}>
              <h2 style={{ marginBottom: 12 }}>From the server</h2>
              {serverResults.album.length ? (
                <Grid>
                  {serverResults.album.map((album) => (
                    <AlbumCard key={`s-${album.id}`} album={album} />
                  ))}
                </Grid>
              ) : null}
              {serverResults.song.length ? (
                <div style={{ marginTop: 16 }}>
                  <TrackList
                    songs={serverResults.song}
                    source={`Server search: ${search}`}
                    sortable={false}
                  />
                </div>
              ) : null}
              {!serverResults.album.length && !serverResults.song.length ? (
                <p className="row__hint">The server found nothing either.</p>
              ) : null}
            </section>
          ) : null}
        </>
      )}
    </>
  )
}
