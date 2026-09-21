import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  HardDrive,
  Heart,
  ListMusic,
  Play,
  Plus,
  RefreshCw,
  Shuffle,
  Trash2,
} from 'lucide-react'
import type { Album, Playlist, Song } from '@/api/types'
import { getClient, describeError } from '@/api/subsonic'
import {
  allAlbums,
  allPlaylists,
  allSongs,
  getSongs,
  offlineIds,
  offlineUsage,
  putPlaylists,
} from '@/db'
import { artUrl } from '@/lib/artwork'
import { formatBytes, formatCount, formatDuration } from '@/lib/format'
import { useAsync } from '@/lib/hooks'
import { createPlaylistWith, removeOffline } from '@/lib/actions'
import { usePlayer } from '@/store/player'
import { useSync } from '@/store/sync'
import { useToast } from '@/store/ui'
import { useOffline } from '@/store/offline'
import { useSettings } from '@/store/settings'
import { Grid, AlbumCard, PlaylistCard } from '@/components/Cards'
import { TrackList } from '@/components/TrackList'
import { Art, Empty, Modal, SkeletonGrid, Spinner } from '@/components/ui'
import { OfflineButton, RemoveOfflineButton } from '@/components/Offline'

/* --------------------------------------------------------------- playlists -- */

export function Playlists() {
  const lastCheck = useSync((state) => state.state.lastCheck)
  const { data: playlists, loading, reload } = useAsync(
    async () => allPlaylists(),
    [lastCheck],
    [] as Playlist[],
  )
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  const refreshFromServer = useCallback(async () => {
    try {
      const fresh = await getClient().getPlaylists()
      await putPlaylists(fresh)
      reload()
    } catch (err) {
      useToast.getState().show(describeError(err), 'error')
    }
  }, [reload])

  const create = async () => {
    if (!name.trim()) return
    setBusy(true)
    await createPlaylistWith(name.trim(), [])
    setBusy(false)
    setCreating(false)
    setName('')
    await refreshFromServer()
  }

  return (
    <>
      <div className="page-head">
        <div className="page-head__title">
          <h1>Playlists</h1>
          <span className="page-head__sub">{formatCount(playlists.length, 'playlist')}</span>
        </div>
        <div className="page-actions">
          <button className="pill" onClick={() => void refreshFromServer()}>
            <RefreshCw size={14} />
            Refresh
          </button>
          <button className="pill pill-accent" onClick={() => setCreating(true)}>
            <Plus size={14} />
            New playlist
          </button>
        </div>
      </div>

      {loading ? (
        <SkeletonGrid count={8} />
      ) : playlists.length === 0 ? (
        <Empty icon={<ListMusic size={24} />} title="No playlists yet">
          Playlists live on your Navidrome server, so anything you create here shows up in every other
          client too.
        </Empty>
      ) : (
        <Grid>
          {playlists.map((playlist) => (
            <PlaylistCard key={playlist.id} playlist={playlist} />
          ))}
        </Grid>
      )}

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="New playlist"
        footer={
          <>
            <button className="pill" onClick={() => setCreating(false)}>
              Cancel
            </button>
            <button className="pill pill-accent" disabled={!name.trim() || busy} onClick={create}>
              {busy ? <Spinner /> : null}
              Create
            </button>
          </>
        }
      >
        <div className="field">
          <input
            value={name}
            placeholder="Playlist name"
            autoFocus
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void create()
            }}
          />
        </div>
      </Modal>
    </>
  )
}

export function PlaylistPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const { data, loading, reload } = useAsync(
    async () => {
      const local = (await allPlaylists()).find((item) => item.id === id)
      if (local?.entry?.length) return local
      return (await getClient().getPlaylist(id)) ?? local ?? null
    },
    [id],
    null as Playlist | null,
  )

  const songs = data?.entry ?? []

  const remove = async (_song: Song, index: number) => {
    try {
      await getClient().updatePlaylist({ playlistId: id, songIndexToRemove: [index] })
      const fresh = await getClient().getPlaylists()
      await putPlaylists(fresh)
      reload()
      useToast.getState().show('Removed from the playlist.', 'success')
    } catch (err) {
      useToast.getState().show(describeError(err), 'error')
    }
  }

  const destroy = async () => {
    try {
      await getClient().deletePlaylist(id)
      const fresh = await getClient().getPlaylists()
      await putPlaylists(fresh)
      navigate('/playlists')
    } catch (err) {
      useToast.getState().show(describeError(err), 'error')
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', padding: 80 }}>
        <Spinner />
      </div>
    )
  }
  if (!data) return <Empty icon={<ListMusic size={24} />} title="Playlist not found" />

  return (
    <>
      <header className="hero glass">
        <div className="hero__art">
          <Art src={artUrl(data, 600)} alt={data.name} />
        </div>
        <div className="hero__body">
          <span className="hero__kicker">Playlist</span>
          <h1 className="hero__title">{data.name}</h1>
          {data.comment ? <p style={{ color: 'var(--ink-2)' }}>{data.comment}</p> : null}
          <div className="hero__meta">
            <span>{formatCount(songs.length, 'track')}</span>
            <span className="sep">{formatDuration(data.duration)}</span>
            {data.owner ? <span className="sep">by {data.owner}</span> : null}
            {data.public ? <span className="badge">Public</span> : null}
          </div>
          <div className="hero__actions">
            <button
              className="pill pill-accent pill-lg"
              disabled={!songs.length}
              onClick={() => void usePlayer.getState().playNow(songs, 0, data.name)}
            >
              <Play size={15} fill="currentColor" />
              Play
            </button>
            <button
              className="pill pill-lg"
              disabled={!songs.length}
              onClick={() =>
                void usePlayer.getState().playNow([...songs].sort(() => Math.random() - 0.5), 0, data.name)
              }
            >
              <Shuffle size={15} />
              Shuffle
            </button>
            <OfflineButton songs={songs} label={data.name} className="pill pill-lg" />
            <RemoveOfflineButton songs={songs} />
            <button className="pill pill-lg" onClick={() => setConfirmDelete(true)}>
              <Trash2 size={15} />
              Delete
            </button>
          </div>
        </div>
      </header>

      <div style={{ padding: '22px 26px 0' }}>
        <TrackList
          songs={songs}
          source={data.name}
          numbering="index"
          onRemove={(song, index) => void remove(song, index)}
          emptyMessage="This playlist is empty. Add tracks from any track menu."
        />
      </div>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Delete “${data.name}”?`}
        footer={
          <>
            <button className="pill" onClick={() => setConfirmDelete(false)}>
              Cancel
            </button>
            <button className="pill" style={{ color: 'var(--danger)' }} onClick={() => void destroy()}>
              Delete playlist
            </button>
          </>
        }
      >
        <p className="row__hint">
          This removes the playlist from your Navidrome server for every client. The tracks
          themselves are not touched.
        </p>
      </Modal>
    </>
  )
}

/* -------------------------------------------------------------- favourites -- */

export function Favourites() {
  const lastCheck = useSync((state) => state.state.lastCheck)
  const { data, loading } = useAsync(
    async () => {
      const [songs, albums] = await Promise.all([allSongs(), allAlbums()])
      return {
        songs: songs.filter((song) => song.starred),
        albums: albums.filter((album) => album.starred),
      }
    },
    [lastCheck],
    { songs: [] as Song[], albums: [] as Album[] },
  )

  return (
    <>
      <div className="page-head">
        <div className="page-head__title">
          <h1>Favourites</h1>
          <span className="page-head__sub">
            {formatCount(data.songs.length, 'track')} · {formatCount(data.albums.length, 'album')}
          </span>
        </div>
        <div className="page-actions">
          <button
            className="pill pill-accent"
            disabled={!data.songs.length}
            onClick={() => void usePlayer.getState().playNow(data.songs, 0, 'Favourites')}
          >
            <Play size={14} fill="currentColor" />
            Play favourites
          </button>
          <OfflineButton songs={data.songs} label="Favourites" />
          <RemoveOfflineButton songs={data.songs} />
        </div>
      </div>

      {loading ? (
        <SkeletonGrid count={6} />
      ) : data.songs.length === 0 && data.albums.length === 0 ? (
        <Empty icon={<Heart size={24} />} title="Nothing favourited yet">
          Tap the heart on any track, album or artist. Favourites are stored on your server, so they
          follow you to every client.
        </Empty>
      ) : (
        <>
          {data.albums.length ? (
            <section style={{ marginBottom: 32 }}>
              <h2 style={{ marginBottom: 12 }}>Albums</h2>
              <Grid>
                {data.albums.map((album) => (
                  <AlbumCard key={album.id} album={album} />
                ))}
              </Grid>
            </section>
          ) : null}
          {data.songs.length ? (
            <section>
              <h2 style={{ marginBottom: 12 }}>Tracks</h2>
              <TrackList songs={data.songs} source="Favourites" />
            </section>
          ) : null}
        </>
      )}
    </>
  )
}

/* ---------------------------------------------------------------- downloads -- */

export function Downloads() {
  const [usage, setUsage] = useState({ count: 0, bytes: 0 })
  const [songs, setSongs] = useState<Song[]>([])
  const [library, setLibrary] = useState<Song[]>([])
  const [loading, setLoading] = useState(true)
  const offlineIdSet = useOffline((state) => state.ids)
  const destination = useSettings((state) => state.offlineDestination)
  const folderName = useSettings((state) => state.offlineFolderName)

  const load = useCallback(async () => {
    setLoading(true)
    const [ids, stats, everything] = await Promise.all([offlineIds(), offlineUsage(), allSongs()])
    setSongs(await getSongs(ids))
    setLibrary(everything)
    setUsage(stats)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load, offlineIdSet])

  const quota = useAsync(
    async () => {
      if (!navigator.storage?.estimate) return null
      return navigator.storage.estimate()
    },
    [],
    null as StorageEstimate | null,
  )

  return (
    <>
      <div className="page-head">
        <div className="page-head__title">
          <h1>Offline</h1>
          <span className="page-head__sub">
            {formatCount(usage.count, 'track')} · {formatBytes(usage.bytes)} stored in this browser
          </span>
        </div>
        <div className="page-actions">
          <button
            className="pill"
            disabled={!songs.length}
            onClick={() => void usePlayer.getState().playNow(songs, 0, 'Offline')}
          >
            <Play size={14} fill="currentColor" />
            Play offline tracks
          </button>
          <OfflineButton songs={library} label="Your whole library" className="pill pill-accent" />
        </div>
      </div>

      <p className="row__hint" style={{ marginBottom: 16 }}>
        {destination === 'folder'
          ? `Downloads go to the folder “${folderName || 'not chosen yet'}”. Change it in Settings → Offline.`
          : 'Downloads are stored inside this browser. Settings → Offline can point them at a real folder instead.'}
        {' '}Syncing again only fetches tracks you do not already have.
      </p>

      {quota.data?.quota ? (
        <p className="row__hint" style={{ marginBottom: 16 }}>
          This browser has offered roughly {formatBytes(quota.data.quota)} of storage, of which about{' '}
          {formatBytes(quota.data.usage ?? 0)} is in use (Kultr's library mirror included).
        </p>
      ) : null}

      {loading ? (
        <div className="skeleton" style={{ height: 240 }} />
      ) : songs.length === 0 ? (
        <Empty icon={<HardDrive size={24} />} title="Nothing saved offline">
          Use “Save for offline” from any track menu. Files are stored inside this browser, so they
          play with no server connection at all — useful on a laptop, on a plane, or when your NAS is
          asleep.
        </Empty>
      ) : (
        <TrackList
          songs={songs}
          source="Offline"
          onRemove={async (song) => {
            await removeOffline(song)
            void load()
          }}
        />
      )}
    </>
  )
}

/* -------------------------------------------------------------------- radio -- */

export function Radio() {
  const { data: stations, loading } = useAsync(
    async () => getClient().getInternetRadioStations(),
    [],
    [] as Awaited<ReturnType<ReturnType<typeof getClient>['getInternetRadioStations']>>,
  )

  const songs = useMemo<Song[]>(
    () =>
      stations.map((station) => ({
        id: station.id,
        title: station.name,
        artist: 'Internet radio',
        album: station.homePageUrl ?? '',
        duration: 0,
        kultrStreamUrl: station.streamUrl,
      })),
    [stations],
  )

  return (
    <>
      <div className="page-head">
        <div className="page-head__title">
          <h1>Radio</h1>
          <span className="page-head__sub">
            Internet radio stations configured on your Navidrome server
          </span>
        </div>
      </div>

      {loading ? (
        <div className="skeleton" style={{ height: 200 }} />
      ) : stations.length === 0 ? (
        <Empty icon={<ListMusic size={24} />} title="No stations configured">
          Add internet radio stations in Navidrome's web interface and they will appear here.
        </Empty>
      ) : (
        <div className="stats" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))' }}>
          {stations.map((station, index) => (
            <button
              key={station.id}
              className="stat glass glass-hit"
              style={{ textAlign: 'left' }}
              onClick={() => void usePlayer.getState().playNow(songs, index, 'Radio')}
            >
              <span className="stat__value" style={{ fontSize: 16 }}>
                {station.name}
              </span>
              <span className="stat__label">{station.streamUrl}</span>
            </button>
          ))}
        </div>
      )}
    </>
  )
}
