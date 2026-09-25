import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Heart, ListPlus, Play, Shuffle, Sparkles } from 'lucide-react'
import type { Album, Artist, ArtistInfo, Song } from '@/api/types'
import { getClient, maybeClient } from '@/api/subsonic'
import { albumsByArtist, getAlbum, getArtist, songsByAlbum, songsByArtist } from '@/db'
import { artUrl } from '@/lib/artwork'
import { formatCount, formatDuration } from '@/lib/format'
import { useAsync } from '@/lib/hooks'
import { toggleStarAlbum, toggleStarArtist } from '@/lib/actions'
import { usePlayer } from '@/store/player'
import { buildAutoQueue } from '@/audio/injekt'
import { AlbumCard, ArtistCard, Grid } from '@/components/Cards'
import { TrackList } from '@/components/TrackList'
import { Art, Empty, Spinner } from '@/components/ui'
import { usePlaylistPicker } from '@/components/AddToPlaylist'
import { OfflineButton, RemoveOfflineButton } from '@/components/Offline'

/* ------------------------------------------------------------------- album -- */

export function AlbumPage() {
  const { id = '' } = useParams()
  const [starred, setStarred] = useState(false)

  const { data, loading } = useAsync(
    async () => {
      // Prefer the local mirror; fall back to the server for anything missing.
      let album = await getAlbum(id)
      let songs = await songsByAlbum(id)
      if (!album || songs.length === 0) {
        const detail = await getClient().getAlbum(id)
        album = detail ?? album
        songs = detail?.song ?? songs
      }
      return { album: album ?? null, songs }
    },
    [id],
    { album: null as Album | null, songs: [] as Song[] },
  )

  useEffect(() => setStarred(Boolean(data.album?.starred)), [data.album?.starred])

  const discs = useMemo(() => {
    const groups = new Map<number, Song[]>()
    for (const song of data.songs) {
      const disc = song.discNumber ?? 1
      const list = groups.get(disc) ?? []
      list.push(song)
      groups.set(disc, list)
    }
    return [...groups.entries()].sort((a, b) => a[0] - b[0])
  }, [data.songs])

  if (loading) return <Loading />
  if (!data.album) return <Empty icon={<Play size={24} />} title="Album not found" />

  const album = data.album
  const totalDuration = data.songs.reduce((sum, song) => sum + (song.duration ?? 0), 0)

  return (
    <>
      <header className="hero glass">
        <div className="hero__art">
          <Art src={artUrl(album, 600)} alt={album.name} />
        </div>
        <div className="hero__body">
          <span className="hero__kicker">Album</span>
          <h1 className="hero__title">{album.name}</h1>
          <div className="hero__meta">
            {album.artistId ? (
              <Link to={`/artist/${encodeURIComponent(album.artistId)}`} style={{ fontWeight: 600 }}>
                {album.artist}
              </Link>
            ) : (
              <span style={{ fontWeight: 600 }}>{album.artist}</span>
            )}
            {album.year ? <span className="sep">{album.year}</span> : null}
            <span className="sep">{formatCount(data.songs.length, 'track')}</span>
            <span className="sep">{formatDuration(totalDuration)}</span>
            {album.genre ? <span className="badge">{album.genre}</span> : null}
          </div>
          <div className="hero__actions">
            <button
              className="pill pill-accent pill-lg"
              onClick={() => void usePlayer.getState().playNow(data.songs, 0, album.name)}
            >
              <Play size={15} fill="currentColor" />
              Play
            </button>
            <button
              className="pill pill-lg"
              onClick={() =>
                void usePlayer
                  .getState()
                  .playNow([...data.songs].sort(() => Math.random() - 0.5), 0, album.name)
              }
            >
              <Shuffle size={15} />
              Shuffle
            </button>
            <button
              className="pill pill-lg"
              data-active={starred}
              onClick={async () => setStarred(await toggleStarAlbum(album, starred))}
            >
              <Heart size={15} fill={starred ? 'currentColor' : 'none'} />
              {starred ? 'Favourited' : 'Favourite'}
            </button>
            <button
              className="pill pill-lg"
              onClick={() => usePlayer.getState().enqueue(data.songs, 'end')}
            >
              <ListPlus size={15} />
              Queue
            </button>
            <button
              className="pill pill-lg"
              onClick={() => usePlaylistPicker.getState().show(data.songs.map((song) => song.id))}
            >
              <ListPlus size={15} />
              Add to playlist
            </button>
            <OfflineButton songs={data.songs} label={album.name} className="pill pill-lg" />
            <RemoveOfflineButton songs={data.songs} />
          </div>
        </div>
      </header>

      <div style={{ padding: '22px 26px 0' }}>
        {discs.length > 1
          ? discs.map(([disc, songs]) => (
              <section key={disc} style={{ marginBottom: 26 }}>
                <h3 style={{ margin: '0 0 8px 12px', color: 'var(--ink-3)' }}>
                  {album.discTitles?.find((entry) => entry.disc === disc)?.title ?? `Disc ${disc}`}
                </h3>
                <TrackList
                  songs={songs}
                  source={album.name}
                  hideAlbum
                  showArt={false}
                  numbering="track"
                  sortable={false}
                />
              </section>
            ))
          : (
            <TrackList
              songs={data.songs}
              source={album.name}
              hideAlbum
              showArt={false}
              numbering="track"
              sortable={false}
            />
          )}
      </div>
    </>
  )
}

/* ------------------------------------------------------------------ artist -- */

export function ArtistPage() {
  const { id = '' } = useParams()
  const [starred, setStarred] = useState(false)
  const [info, setInfo] = useState<ArtistInfo | null>(null)
  const [expanded, setExpanded] = useState(false)

  const { data, loading } = useAsync(
    async () => {
      let artist = await getArtist(id)
      let albums = await albumsByArtist(id)
      const songs = await songsByArtist(id)
      if (!artist || albums.length === 0) {
        const detail = await getClient().getArtist(id)
        artist = detail ?? artist
        albums = detail?.album ?? albums
      }
      return { artist: artist ?? null, albums, songs }
    },
    [id],
    { artist: null as Artist | null, albums: [] as Album[], songs: [] as Song[] },
  )

  useEffect(() => setStarred(Boolean(data.artist?.starred)), [data.artist?.starred])

  useEffect(() => {
    let cancelled = false
    void maybeClient()
      ?.getArtistInfo2(id)
      .then((result) => {
        if (!cancelled) setInfo(result ?? null)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [id])

  const topSongs = useMemo(
    () => [...data.songs].sort((a, b) => (b.playCount ?? 0) - (a.playCount ?? 0)).slice(0, 10),
    [data.songs],
  )

  if (loading) return <Loading />
  if (!data.artist) return <Empty icon={<Play size={24} />} title="Artist not found" />

  const artist = data.artist
  const bio = info?.biography?.replace(/<a\b[^>]*>(.*?)<\/a>/gi, '$1').replace(/<[^>]+>/g, '') ?? ''

  const playAll = () => {
    const ordered = data.albums.flatMap((album) =>
      data.songs
        .filter((song) => song.albumId === album.id)
        .sort((a, b) => (a.discNumber ?? 1) - (b.discNumber ?? 1) || (a.track ?? 0) - (b.track ?? 0)),
    )
    void usePlayer.getState().playNow(ordered.length ? ordered : data.songs, 0, artist.name)
  }

  const startMix = async () => {
    const seed = topSongs[0] ?? data.songs[0]
    if (!seed) return
    const rest = await buildAutoQueue(seed, { count: 20 })
    void usePlayer.getState().playNow([seed, ...rest], 0, `${artist.name} mix`)
  }

  return (
    <>
      <header className="hero glass">
        <div className="hero__art hero__art--round">
          <Art src={artUrl(artist, 600)} alt={artist.name} round />
        </div>
        <div className="hero__body">
          <span className="hero__kicker">Artist</span>
          <h1 className="hero__title">{artist.name}</h1>
          <div className="hero__meta">
            <span>{formatCount(data.albums.length, 'album')}</span>
            <span className="sep">{formatCount(data.songs.length, 'track')}</span>
          </div>
          <div className="hero__actions">
            <button className="pill pill-accent pill-lg" onClick={playAll}>
              <Play size={15} fill="currentColor" />
              Play
            </button>
            <button
              className="pill pill-lg"
              onClick={() =>
                void usePlayer
                  .getState()
                  .playNow([...data.songs].sort(() => Math.random() - 0.5), 0, artist.name)
              }
            >
              <Shuffle size={15} />
              Shuffle
            </button>
            <button className="pill pill-lg" onClick={() => void startMix()}>
              <Sparkles size={15} />
              Artist mix
            </button>
            <button
              className="pill pill-lg"
              data-active={starred}
              onClick={async () => setStarred(await toggleStarArtist(artist, starred))}
            >
              <Heart size={15} fill={starred ? 'currentColor' : 'none'} />
              {starred ? 'Following' : 'Follow'}
            </button>
            <OfflineButton songs={data.songs} label={artist.name} className="pill pill-lg" />
            <RemoveOfflineButton songs={data.songs} />
          </div>
        </div>
      </header>

      <div style={{ padding: '22px 26px 0' }}>
        {bio ? (
          <section style={{ marginBottom: 28, maxWidth: 780 }}>
            <p
              style={{
                color: 'var(--ink-2)',
                fontSize: 13.5,
                lineHeight: 1.65,
                display: '-webkit-box',
                WebkitLineClamp: expanded ? 'unset' : 3,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {bio}
            </p>
            {bio.length > 220 ? (
              <button className="pill" style={{ marginTop: 8 }} onClick={() => setExpanded((v) => !v)}>
                {expanded ? 'Show less' : 'Read more'}
              </button>
            ) : null}
          </section>
        ) : null}

        {topSongs.length ? (
          <section style={{ marginBottom: 32 }}>
            <h2 style={{ marginBottom: 10 }}>Popular</h2>
            <TrackList songs={topSongs} source={artist.name} numbering="index" sortable={false} />
          </section>
        ) : null}

        <section style={{ marginBottom: 32 }}>
          <h2 style={{ marginBottom: 12 }}>Albums</h2>
          <Grid>
            {data.albums.map((album) => (
              <AlbumCard key={album.id} album={album} />
            ))}
          </Grid>
        </section>

        {info?.similarArtist?.length ? (
          <section style={{ marginBottom: 32 }}>
            <h2 style={{ marginBottom: 12 }}>Similar artists</h2>
            <Grid>
              {info.similarArtist.slice(0, 12).map((similar) => (
                <ArtistCard key={similar.id} artist={similar} />
              ))}
            </Grid>
          </section>
        ) : null}
      </div>
    </>
  )
}

function Loading() {
  return (
    <div style={{ display: 'grid', placeItems: 'center', padding: 80 }}>
      <Spinner />
    </div>
  )
}
