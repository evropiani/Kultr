import { getClient } from '@/api/subsonic'
import type { Album, Song } from '@/api/types'
import {
  allAlbums,
  counts,
  db,
  deleteMissing,
  getSyncState,
  putAlbums,
  putArtists,
  putGenres,
  putPlaylists,
  putSongs,
  setSyncState,
  type SyncState,
} from '@/db'

export type SyncPhase =
  | 'idle'
  | 'connecting'
  | 'artists'
  | 'albums'
  | 'songs'
  | 'playlists'
  | 'genres'
  | 'cleanup'
  | 'done'
  | 'error'
  | 'cancelled'

export interface SyncProgress {
  phase: SyncPhase
  message: string
  current: number
  total: number
  /** 0..1 across the whole run, so a single progress bar can show it. */
  percent: number
}

export interface SyncSummary {
  mode: 'full' | 'check'
  startedAt: number
  finishedAt: number
  artists: number
  albums: number
  songs: number
  playlists: number
  genres: number
  albumsAdded: number
  albumsUpdated: number
  albumsRemoved: number
  songsRemoved: number
  upToDate: boolean
  errors: string[]
}

export interface SyncOptions {
  mode: 'full' | 'check'
  includePlaylistContents?: boolean
  concurrency?: number
  signal?: AbortSignal
  onProgress?: (progress: SyncProgress) => void
}

const ALBUM_PAGE = 500

class Cancelled extends Error {
  constructor() {
    super('Sync cancelled')
    this.name = 'Cancelled'
  }
}

function checkAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Cancelled()
}

/** Run `task` over `items` with a bounded number of parallel requests. */
async function pooled<T>(
  items: T[],
  limit: number,
  task: (item: T, index: number) => Promise<void>,
  signal?: AbortSignal,
): Promise<void> {
  let cursor = 0
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length || 1)) }, async () => {
    while (cursor < items.length) {
      checkAborted(signal)
      const index = cursor++
      await task(items[index], index)
    }
  })
  await Promise.all(workers)
}

/** Enumerate every album on the server, page by page. */
async function fetchAllAlbums(
  report: (current: number) => void,
  signal?: AbortSignal,
): Promise<Album[]> {
  const client = getClient()
  const out: Album[] = []
  for (let offset = 0; ; offset += ALBUM_PAGE) {
    checkAborted(signal)
    const page = await client.getAlbumList2({
      type: 'alphabeticalByName',
      size: ALBUM_PAGE,
      offset,
    })
    out.push(...page)
    report(out.length)
    if (page.length < ALBUM_PAGE) break
    // Safety valve: a misbehaving server that always returns a full page
    // should not spin forever.
    if (offset > 200_000) break
  }
  return out
}

/**
 * Sync the local mirror with the server.
 *
 * `full`  — re-read every album's track list. Slow but exhaustive.
 * `check` — re-read the album index (cheap) and only pull tracks for albums
 *           that are new, whose `changed`/`songCount` moved, or that have been
 *           played since. This is the "is everything up to date?" button.
 */
export async function syncLibrary(options: SyncOptions): Promise<SyncSummary> {
  const { mode, signal } = options
  const concurrency = Math.max(1, Math.min(12, options.concurrency ?? 6))
  const onProgress = options.onProgress ?? (() => {})
  const client = getClient()
  const startedAt = Date.now()
  const errors: string[] = []

  // Rough weights so one progress bar moves smoothly across phases.
  const weights = { artists: 0.05, albums: 0.15, songs: 0.65, playlists: 0.1, genres: 0.05 }
  let base = 0
  const emit = (phase: SyncPhase, message: string, current: number, total: number, weight: number) => {
    const fraction = total > 0 ? Math.min(1, current / total) : 0
    onProgress({
      phase,
      message,
      current,
      total,
      percent: Math.min(1, base + fraction * weight),
    })
  }

  try {
    emit('connecting', 'Contacting your server…', 0, 1, 0)
    const info = await client.ping()

    // ---------------------------------------------------------- artists --
    emit('artists', 'Reading artists…', 0, 1, weights.artists)
    const artists = await client.getArtists()
    await putArtists(artists)
    emit('artists', `${artists.length.toLocaleString()} artists`, 1, 1, weights.artists)
    base += weights.artists

    // ----------------------------------------------------------- albums --
    emit('albums', 'Reading albums…', 0, 1, weights.albums)
    const albums = await fetchAllAlbums((current) => {
      emit('albums', `Reading albums… ${current.toLocaleString()}`, current, current + ALBUM_PAGE, weights.albums)
    }, signal)
    const localAlbums = await allAlbums()
    const localById = new Map(localAlbums.map((album) => [album.id, album]))
    await putAlbums(albums)
    base += weights.albums

    // ------------------------------------------------------------ songs --
    const stale = albums.filter((album) => {
      if (mode === 'full') return true
      const previous = localById.get(album.id)
      if (!previous) return true
      if ((previous.songCount ?? -1) !== (album.songCount ?? -1)) return true
      if ((previous.changed ?? '') !== (album.changed ?? '')) return true
      if ((previous.duration ?? -1) !== (album.duration ?? -1)) return true
      // Played since the last look — here or on another device. Re-reading
      // the tracks is what brings their play counts and last-played times
      // across, which is what "Jump back in" and "Played the most" use.
      if ((previous.playCount ?? 0) !== (album.playCount ?? 0)) return true
      if ((previous.played ?? '') !== (album.played ?? '')) return true
      return false
    })

    const albumsAdded = albums.filter((album) => !localById.has(album.id)).length
    const albumsUpdated = stale.length - albumsAdded

    let processed = 0
    let songsSeen = 0
    const keepSongIds = new Set<string>()
    const buffer: Song[] = []

    const flush = async () => {
      if (!buffer.length) return
      const batch = buffer.splice(0, buffer.length)
      await putSongs(batch)
    }

    emit('songs', stale.length ? 'Reading tracks…' : 'Tracks already up to date', 0, stale.length || 1, weights.songs)

    await pooled(
      stale,
      concurrency,
      async (album) => {
        try {
          const detail = await client.getAlbum(album.id)
          const songs = detail?.song ?? []
          for (const song of songs) {
            keepSongIds.add(song.id)
            buffer.push(song)
          }
          songsSeen += songs.length
        } catch (err) {
          errors.push(`${album.name}: ${err instanceof Error ? err.message : String(err)}`)
        } finally {
          processed++
          if (buffer.length >= 400) await flush()
          if (processed % 5 === 0 || processed === stale.length) {
            emit(
              'songs',
              `Reading tracks… ${songsSeen.toLocaleString()} from ${processed.toLocaleString()}/${stale.length.toLocaleString()} albums`,
              processed,
              stale.length || 1,
              weights.songs,
            )
          }
        }
      },
      signal,
    )
    await flush()
    base += weights.songs

    // -------------------------------------------------------- playlists --
    emit('playlists', 'Reading playlists…', 0, 1, weights.playlists)
    let playlists = await client.getPlaylists()
    if (options.includePlaylistContents !== false && playlists.length) {
      const detailed = [...playlists]
      await pooled(
        playlists,
        Math.min(4, concurrency),
        async (playlist, index) => {
          try {
            const full = await client.getPlaylist(playlist.id)
            if (full) detailed[index] = full
          } catch (err) {
            errors.push(`Playlist ${playlist.name}: ${err instanceof Error ? err.message : String(err)}`)
          }
          emit(
            'playlists',
            `Reading playlists… ${index + 1}/${playlists.length}`,
            index + 1,
            playlists.length,
            weights.playlists,
          )
        },
        signal,
      )
      playlists = detailed
    }
    await putPlaylists(playlists)
    base += weights.playlists

    // ----------------------------------------------------------- genres --
    emit('genres', 'Reading genres…', 0, 1, weights.genres)
    const genres = await client.getGenres()
    await putGenres(genres)
    base += weights.genres

    // ---------------------------------------------------------- cleanup --
    emit('cleanup', 'Tidying up…', 1, 1, 0)
    const albumIds = new Set(albums.map((album) => album.id))
    const artistIds = new Set(artists.map((artist) => artist.id))
    const albumsRemoved = await deleteMissing('albums', albumIds)
    await deleteMissing('artists', artistIds)

    // Songs whose album disappeared are gone too. On a full sync we also know
    // every surviving song id, so we can prune precisely.
    let songsRemoved = 0
    if (mode === 'full') {
      songsRemoved = await deleteMissing('songs', keepSongIds)
    } else if (albumsRemoved > 0) {
      const database = await db()
      const survivors = new Set<string>()
      for (const id of albumIds) {
        const ids = await database.getAllKeysFromIndex('songs', 'albumId', id)
        for (const songId of ids) survivors.add(songId as string)
      }
      songsRemoved = await deleteMissing('songs', survivors)
    }

    const finalCounts = await counts()
    const newest = albums.reduce<string | undefined>(
      (max, album) => (album.created && (!max || album.created > max) ? album.created : max),
      undefined,
    )

    const previous = await getSyncState()
    const state: SyncState = {
      lastFullSync: mode === 'full' ? startedAt : previous.lastFullSync,
      lastCheck: startedAt,
      counts: finalCounts,
      serverVersion: info.serverVersion ?? info.version,
      serverType: info.type,
      newestAlbumCreated: newest,
    }
    await setSyncState(state)

    onProgress({ phase: 'done', message: 'Library up to date', current: 1, total: 1, percent: 1 })

    return {
      mode,
      startedAt,
      finishedAt: Date.now(),
      artists: finalCounts.artists,
      albums: finalCounts.albums,
      songs: finalCounts.songs,
      playlists: finalCounts.playlists,
      genres: finalCounts.genres,
      albumsAdded,
      albumsUpdated: Math.max(0, albumsUpdated),
      albumsRemoved,
      songsRemoved,
      upToDate: mode === 'check' && albumsAdded === 0 && albumsUpdated <= 0 && albumsRemoved === 0,
      errors,
    }
  } catch (err) {
    if (err instanceof Cancelled || (err as Error)?.name === 'AbortError') {
      onProgress({ phase: 'cancelled', message: 'Sync cancelled', current: 0, total: 1, percent: 0 })
      throw err
    }
    const message = err instanceof Error ? err.message : String(err)
    onProgress({ phase: 'error', message, current: 0, total: 1, percent: 0 })
    throw err
  }
}

/**
 * Cheap "does the server have anything new?" probe — two requests, no writes.
 * Used for the periodic background check so we do not page the whole index.
 */
export async function quickCheck(): Promise<{ changed: boolean; reason: string }> {
  const client = getClient()
  const state = await getSyncState()
  const newest = await client.getAlbumList2({ type: 'newest', size: 1 })
  const newestCreated = newest[0]?.created
  if (newestCreated && state.newestAlbumCreated && newestCreated > state.newestAlbumCreated) {
    return { changed: true, reason: 'New albums were added to your server.' }
  }
  if (newestCreated && !state.newestAlbumCreated) {
    return { changed: true, reason: 'Local library has never been synced.' }
  }
  try {
    const scan = await client.getScanStatus()
    if (scan.count && state.counts.songs && scan.count !== state.counts.songs) {
      return {
        changed: true,
        reason: `Server reports ${scan.count.toLocaleString()} tracks, you have ${state.counts.songs.toLocaleString()}.`,
      }
    }
  } catch {
    /* getScanStatus needs admin rights on some setups; ignore. */
  }
  return { changed: false, reason: 'Everything matches.' }
}
