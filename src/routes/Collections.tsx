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
import type { Album, Playlist, RadioStation, Song } from '@/api/types'
import { getClient, describeError } from '@/api/subsonic'
import {
  allAlbums,
  allPlaylists,
  allSongs,
  getSongs,
  offlineIds,
  offlineUsage,
  putPlaylist,
  putPlaylists,
} from '@/db'
import { artUrl } from '@/lib/artwork'
import { formatBytes, formatCount, formatDuration } from '@/lib/format'
import { useAsync } from '@/lib/hooks'
import { createPlaylistWith } from '@/lib/actions'
import { usePlayer } from '@/store/player'
import { useSync } from '@/store/sync'
import { useToast } from '@/store/ui'
import { useOffline } from '@/store/offline'
import { useSettings } from '@/store/settings'
import { Grid, AlbumCard, PlaylistCard } from '@/components/Cards'
import { TrackList } from '@/components/TrackList'
import { Art, Empty, Modal, SkeletonGrid, Spinner } from '@/components/ui'
import { OfflineButton, RemoveOfflineButton } from '@/components/Offline'
import { RadioGrid, radioSongs } from '@/components/Radio'
import { PlaylistSuggestions } from '@/components/PlaylistSuggestions'
import { isLocalProfile, useAuth } from '@/store/auth'
import { t } from '@/i18n'

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
          <h1>{t("Playlists")}</h1>
          <span className="page-head__sub">{formatCount(playlists.length, 'playlist')}</span>
        </div>
        <div className="page-actions">
          <button className="pill" onClick={() => void refreshFromServer()}>
            <RefreshCw size={14} />
            {t("Refresh")}</button>
          <button className="pill pill-accent" onClick={() => setCreating(true)}>
            <Plus size={14} />
            {t("New playlist")}</button>
        </div>
      </div>

      {loading ? (
        <SkeletonGrid count={8} />
      ) : playlists.length === 0 ? (
        <Empty icon={<ListMusic size={24} />} title={t("No playlists yet")}>
          {t("Playlists live on your Navidrome server, so anything you create here shows up in every other client too.")}</Empty>
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
        title={t("New playlist")}
        footer={
          <>
            <button className="pill" onClick={() => setCreating(false)}>
              {t("Cancel")}</button>
            <button className="pill pill-accent" disabled={!name.trim() || busy} onClick={create}>
              {busy ? <Spinner /> : null}
              {t("Create")}</button>
          </>
        }
      >
        <div className="field">
          <input
            value={name}
            placeholder={t("Playlist name")}
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

  // Songs added from the suggestions since the playlist was loaded.
  const [added, setAdded] = useState<Song[]>([])
  useEffect(() => setAdded([]), [data])
  const songs = useMemo(() => [...(data?.entry ?? []), ...added], [data, added])
  const addedDuration = added.reduce((sum, song) => sum + (song.duration ?? 0), 0)

  // Only the owner can change a playlist; anyone's own, and every playlist of the music on this computer.
  const profile = useAuth((state) => state.activeProfile())
  const canEdit = Boolean(data) && (!data?.owner || isLocalProfile(profile) || data.owner === profile?.username)

  const addSong = async (song: Song): Promise<boolean> => {
    if (!data) return false
    try {
      await getClient().updatePlaylist({ playlistId: id, songIdToAdd: [song.id] })
      const entry = [...songs, song]
      setAdded((list) => [...list, song])
      await putPlaylist({
        ...data,
        entry,
        songCount: entry.length,
        duration: entry.reduce((sum, item) => sum + (item.duration ?? 0), 0),
      }).catch(() => {})
      useToast.getState().show(t("Added to “%@”", data.name), 'success')
      return true
    } catch (err) {
      useToast.getState().show(describeError(err), 'error')
      return false
    }
  }

  const remove = async (_song: Song, index: number) => {
    try {
      await getClient().updatePlaylist({ playlistId: id, songIndexToRemove: [index] })
      const fresh = await getClient().getPlaylists()
      await putPlaylists(fresh)
      reload()
      useToast.getState().show(t("Removed from the playlist."), 'success')
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
  if (!data) return <Empty icon={<ListMusic size={24} />} title={t("Playlist not found")} />

  return (
    <>
      <header className="hero glass">
        <div className="hero__art">
          <Art src={artUrl(data, 600)} alt={data.name} />
        </div>
        <div className="hero__body">
          <h1 className="hero__title">{data.name}</h1>
          {data.comment ? <p style={{ color: 'var(--ink-2)' }}>{data.comment}</p> : null}
          <div className="hero__meta">
            <span>{formatCount(songs.length, 'track')}</span>
            <span className="sep">{formatDuration((data.duration ?? 0) + addedDuration)}</span>
            {data.owner ? <span className="sep">{t("by %@", data.owner)}</span> : null}
            {data.public ? <span className="badge">{t("Public")}</span> : null}
          </div>
          <div className="hero__actions">
            <button
              className="pill pill-lg"
              disabled={!songs.length}
              onClick={() => void usePlayer.getState().playNow(songs, 0, data.name)}
            >
              <Play size={15} fill="currentColor" />
              {t("Play")}</button>
            <button
              className="pill pill-lg"
              disabled={!songs.length}
              onClick={() =>
                void usePlayer.getState().playNow([...songs].sort(() => Math.random() - 0.5), 0, data.name)
              }
            >
              <Shuffle size={15} />
              {t("Shuffle")}</button>
            <OfflineButton songs={songs} label={data.name} className="pill pill-lg" />
            <RemoveOfflineButton songs={songs} />
            <button className="pill pill-lg" onClick={() => setConfirmDelete(true)}>
              <Trash2 size={15} />
              {t("Delete")}</button>
          </div>
        </div>
      </header>

      <div style={{ padding: '22px 26px 0' }}>
        <TrackList
          songs={songs}
          source={data.name}
          numbering="index"
          onRemove={(song, index) => void remove(song, index)}
          emptyMessage={
            canEdit
              ? t("This playlist is empty. Add songs from the suggestions below, or from any track menu.")
              : t("This playlist is empty. Add tracks from any track menu.")
          }
        />
        {canEdit ? <PlaylistSuggestions key={id} songs={songs} onAdd={addSong} /> : null}
      </div>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={t("Delete “%@”?", data.name)}
        footer={
          <>
            <button className="pill" onClick={() => setConfirmDelete(false)}>
              {t("Cancel")}</button>
            <button className="pill" style={{ color: 'var(--danger)' }} onClick={() => void destroy()}>
              {t("Delete playlist")}</button>
          </>
        }
      >
        <p className="row__hint">
          {t("This removes the playlist from your Navidrome server for every client. The tracks themselves are not touched.")}</p>
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
          <h1>{t("Favourites")}</h1>
          <span className="page-head__sub">
            {formatCount(data.songs.length, 'track')} · {formatCount(data.albums.length, 'album')}
          </span>
        </div>
        <div className="page-actions">
          <button
            className="pill pill-accent"
            disabled={!data.songs.length}
            onClick={() => void usePlayer.getState().playNow(data.songs, 0, t('Favourites'))}
          >
            <Play size={14} fill="currentColor" />
            {t("Play favourites")}</button>
          <OfflineButton songs={data.songs} label={t("Favourites")} />
          <RemoveOfflineButton songs={data.songs} />
        </div>
      </div>

      {loading ? (
        <SkeletonGrid count={6} />
      ) : data.songs.length === 0 && data.albums.length === 0 ? (
        <Empty icon={<Heart size={24} />} title={t("Nothing favourited yet")}>
          {t("Tap the heart on any track, album or artist. Favourites are stored on your server, so they follow you to every client.")}</Empty>
      ) : (
        <>
          {data.albums.length ? (
            <section style={{ marginBottom: 32 }}>
              <h2 style={{ marginBottom: 12 }}>{t("Albums")}</h2>
              <Grid>
                {data.albums.map((album) => (
                  <AlbumCard key={album.id} album={album} />
                ))}
              </Grid>
            </section>
          ) : null}
          {data.songs.length ? (
            <section>
              <h2 style={{ marginBottom: 12 }}>{t("Tracks")}</h2>
              <TrackList songs={data.songs} source={t("Favourites")} />
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
  const removeFromOffline = useOffline((state) => state.remove)
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
          <h1>{t("Offline")}</h1>
          <span className="page-head__sub">
            {t("%@ · %@ stored in this browser", formatCount(usage.count, 'track'), formatBytes(usage.bytes))}</span>
        </div>
        <div className="page-actions">
          <button
            className="pill"
            disabled={!songs.length}
            onClick={() => void usePlayer.getState().playNow(songs, 0, t('Offline'))}
          >
            <Play size={14} fill="currentColor" />
            {t("Play offline tracks")}</button>
          <OfflineButton songs={library} label={t("Your whole library")} className="pill pill-accent" />
        </div>
      </div>

      <p className="row__hint" style={{ marginBottom: 16 }}>
        {destination === 'folder'
          ? t("Downloads go to the folder “%@”. Change it in Settings → Offline.", folderName || 'not chosen yet')
          : t("Downloads are stored inside this browser. Settings → Offline can point them at a real folder instead.")}
        {' '}{t("Syncing again only fetches tracks you do not already have.")}</p>

      {quota.data?.quota ? (
        <p className="row__hint" style={{ marginBottom: 16 }}>
          {t("This browser has offered roughly %@ of storage, of which about %@ is in use (Kultr's library mirror included).", formatBytes(quota.data.quota), formatBytes(quota.data.usage ?? 0))}</p>
      ) : null}

      {loading ? (
        <div className="skeleton" style={{ height: 240 }} />
      ) : songs.length === 0 ? (
        <Empty icon={<HardDrive size={24} />} title={t("Nothing saved offline")}>
          {t("Use “Save for offline” from any track menu. Files are stored inside this browser, so they play with no server connection at all — useful on a laptop, on a plane, or when your NAS is asleep.")}</Empty>
      ) : (
        <TrackList
          songs={songs}
          source={t("Offline")}
          onRemove={async (song) => {
            // Goes through the offline store so the file on disk is deleted
            // too, not just the bookkeeping row.
            await removeFromOffline([song.id])
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
    [] as RadioStation[],
  )
  const songs = useMemo(() => radioSongs(stations), [stations])

  return (
    <>
      <div className="page-head">
        <div className="page-head__title">
          <h1>{t("Radio")}</h1>
          <span className="page-head__sub">
            {t("Internet radio stations configured on your Navidrome server")}</span>
        </div>
      </div>

      {loading ? (
        <div className="skeleton" style={{ height: 200 }} />
      ) : stations.length === 0 ? (
        <Empty icon={<ListMusic size={24} />} title={t("No stations configured")}>
          {t("Add internet radio stations in Navidrome's web interface and they will appear here.")}</Empty>
      ) : (
        <RadioGrid stations={stations} songs={songs} />
      )}
    </>
  )
}
