import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Album, Artist, Genre, Playlist, Song } from '@/api/types'
import type { TrackAnalysis } from '@/audio/analysis'

/**
 * Kultr keeps a full local mirror of the Navidrome library in IndexedDB.
 *
 * That is what makes the "Sync library" button meaningful: browsing, sorting,
 * filtering and searching all run locally and instantly, and the app stays
 * usable when the server is unreachable. Audio still streams from Navidrome
 * unless a track has been explicitly downloaded for offline playback.
 */

export const DB_NAME = 'kultr'
export const DB_VERSION = 3

export interface PlayHistoryEntry {
  id?: number
  songId: string
  playedAt: number
  /** Seconds actually listened to; used for taste profiling. */
  seconds: number
  completed: boolean
  source: string
}

export interface OfflineTrack {
  songId: string
  size: number
  contentType: string
  savedAt: number
  blob: Blob
}

export interface SyncState {
  lastFullSync: number | null
  lastCheck: number | null
  counts: { artists: number; albums: number; songs: number; playlists: number; genres: number }
  serverVersion?: string
  serverType?: string
  /** Newest album `created` timestamp seen, used for cheap delta checks. */
  newestAlbumCreated?: string
}

interface KultrDB extends DBSchema {
  songs: {
    key: string
    value: Song
    indexes: {
      albumId: string
      artistId: string
      genre: string
      starred: string
      created: string
      title: string
    }
  }
  albums: {
    key: string
    value: Album
    indexes: {
      artistId: string
      name: string
      genre: string
      starred: string
      created: string
      year: number
    }
  }
  artists: {
    key: string
    value: Artist
    indexes: { name: string; starred: string }
  }
  playlists: { key: string; value: Playlist }
  genres: { key: string; value: Genre }
  analysis: { key: string; value: TrackAnalysis }
  meta: { key: string; value: unknown }
  history: { key: number; value: PlayHistoryEntry; indexes: { songId: string; playedAt: number } }
  offline: { key: string; value: OfflineTrack }
}

let dbPromise: Promise<IDBPDatabase<KultrDB>> | null = null

export function db(): Promise<IDBPDatabase<KultrDB>> {
  if (!dbPromise) {
    dbPromise = openDB<KultrDB>(DB_NAME, DB_VERSION, {
      upgrade(database, oldVersion) {
        if (oldVersion < 1) {
          const songs = database.createObjectStore('songs', { keyPath: 'id' })
          songs.createIndex('albumId', 'albumId')
          songs.createIndex('artistId', 'artistId')
          songs.createIndex('genre', 'genre')
          songs.createIndex('starred', 'starred')
          songs.createIndex('created', 'created')
          songs.createIndex('title', 'title')

          const albums = database.createObjectStore('albums', { keyPath: 'id' })
          albums.createIndex('artistId', 'artistId')
          albums.createIndex('name', 'name')
          albums.createIndex('genre', 'genre')
          albums.createIndex('starred', 'starred')
          albums.createIndex('created', 'created')
          albums.createIndex('year', 'year')

          const artists = database.createObjectStore('artists', { keyPath: 'id' })
          artists.createIndex('name', 'name')
          artists.createIndex('starred', 'starred')

          database.createObjectStore('playlists', { keyPath: 'id' })
          database.createObjectStore('genres', { keyPath: 'value' })
          database.createObjectStore('meta')
        }
        if (oldVersion < 2) {
          database.createObjectStore('analysis', { keyPath: 'songId' })
          const history = database.createObjectStore('history', {
            keyPath: 'id',
            autoIncrement: true,
          })
          history.createIndex('songId', 'songId')
          history.createIndex('playedAt', 'playedAt')
        }
        if (oldVersion < 3) {
          database.createObjectStore('offline', { keyPath: 'songId' })
        }
      },
    })
  }
  return dbPromise
}

// ------------------------------------------------------------------- meta --

export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const value = (await (await db()).get('meta', key)) as T | undefined
  return value === undefined ? fallback : value
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await (await db()).put('meta', value, key)
}

export const EMPTY_SYNC_STATE: SyncState = {
  lastFullSync: null,
  lastCheck: null,
  counts: { artists: 0, albums: 0, songs: 0, playlists: 0, genres: 0 },
}

export function getSyncState(): Promise<SyncState> {
  return getMeta<SyncState>('syncState', EMPTY_SYNC_STATE)
}

export function setSyncState(state: SyncState): Promise<void> {
  return setMeta('syncState', state)
}

// ------------------------------------------------------------ bulk writes --

export async function putSongs(songs: Song[]): Promise<void> {
  if (!songs.length) return
  const database = await db()
  const tx = database.transaction('songs', 'readwrite')
  await Promise.all(songs.map((song) => tx.store.put(song)))
  await tx.done
}

export async function putAlbums(albums: Album[]): Promise<void> {
  if (!albums.length) return
  const database = await db()
  const tx = database.transaction('albums', 'readwrite')
  // getAlbum returns the track list too; we store songs separately to keep
  // album records small, so strip it here.
  await Promise.all(albums.map(({ song: _song, ...album }) => tx.store.put(album as Album)))
  await tx.done
}

export async function putArtists(artists: Artist[]): Promise<void> {
  if (!artists.length) return
  const database = await db()
  const tx = database.transaction('artists', 'readwrite')
  await Promise.all(artists.map(({ album: _album, ...artist }) => tx.store.put(artist as Artist)))
  await tx.done
}

export async function putPlaylists(playlists: Playlist[]): Promise<void> {
  const database = await db()
  const tx = database.transaction('playlists', 'readwrite')
  await tx.store.clear()
  await Promise.all(playlists.map((playlist) => tx.store.put(playlist)))
  await tx.done
}

export async function putGenres(genres: Genre[]): Promise<void> {
  const database = await db()
  const tx = database.transaction('genres', 'readwrite')
  await tx.store.clear()
  await Promise.all(genres.map((genre) => tx.store.put(genre)))
  await tx.done
}

export async function deleteMissing(
  store: 'songs' | 'albums' | 'artists',
  keepIds: Set<string>,
): Promise<number> {
  const database = await db()
  const existing = await database.getAllKeys(store)
  const stale = existing.filter((id) => !keepIds.has(id as string))
  if (!stale.length) return 0
  const tx = database.transaction(store, 'readwrite')
  await Promise.all(stale.map((id) => tx.store.delete(id)))
  await tx.done
  return stale.length
}

// -------------------------------------------------------------- bulk reads --

export async function allSongs(): Promise<Song[]> {
  return (await db()).getAll('songs')
}
export async function allAlbums(): Promise<Album[]> {
  return (await db()).getAll('albums')
}
export async function allArtists(): Promise<Artist[]> {
  return (await db()).getAll('artists')
}
export async function allPlaylists(): Promise<Playlist[]> {
  return (await db()).getAll('playlists')
}
export async function allGenres(): Promise<Genre[]> {
  return (await db()).getAll('genres')
}

export async function songsByAlbum(albumId: string): Promise<Song[]> {
  const songs = await (await db()).getAllFromIndex('songs', 'albumId', albumId)
  return songs.sort(
    (a, b) => (a.discNumber ?? 1) - (b.discNumber ?? 1) || (a.track ?? 0) - (b.track ?? 0),
  )
}

export async function songsByArtist(artistId: string): Promise<Song[]> {
  return (await db()).getAllFromIndex('songs', 'artistId', artistId)
}

export async function albumsByArtist(artistId: string): Promise<Album[]> {
  const albums = await (await db()).getAllFromIndex('albums', 'artistId', artistId)
  return albums.sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || a.name.localeCompare(b.name))
}

export async function getSong(id: string): Promise<Song | undefined> {
  return (await db()).get('songs', id)
}
export async function getSongs(ids: string[]): Promise<Song[]> {
  const database = await db()
  const tx = database.transaction('songs')
  const results = await Promise.all(ids.map((id) => tx.store.get(id)))
  await tx.done
  return results.filter((song): song is Song => Boolean(song))
}
export async function getAlbum(id: string): Promise<Album | undefined> {
  return (await db()).get('albums', id)
}
export async function getArtist(id: string): Promise<Artist | undefined> {
  return (await db()).get('artists', id)
}

export async function counts(): Promise<SyncState['counts']> {
  const database = await db()
  const [artists, albums, songs, playlists, genres] = await Promise.all([
    database.count('artists'),
    database.count('albums'),
    database.count('songs'),
    database.count('playlists'),
    database.count('genres'),
  ])
  return { artists, albums, songs, playlists, genres }
}

/** Patch one song in place (used after star/rating/scrobble). */
export async function patchSong(id: string, patch: Partial<Song>): Promise<Song | undefined> {
  const database = await db()
  const existing = await database.get('songs', id)
  if (!existing) return undefined
  const merged = { ...existing, ...patch }
  await database.put('songs', merged)
  return merged
}

export async function patchAlbum(id: string, patch: Partial<Album>): Promise<void> {
  const database = await db()
  const existing = await database.get('albums', id)
  if (existing) await database.put('albums', { ...existing, ...patch })
}

export async function patchArtist(id: string, patch: Partial<Artist>): Promise<void> {
  const database = await db()
  const existing = await database.get('artists', id)
  if (existing) await database.put('artists', { ...existing, ...patch })
}

// ----------------------------------------------------------------- history --

export async function addHistory(entry: PlayHistoryEntry): Promise<void> {
  await (await db()).add('history', entry)
}

export async function recentHistory(limit = 200): Promise<PlayHistoryEntry[]> {
  const database = await db()
  const out: PlayHistoryEntry[] = []
  let cursor = await database.transaction('history').store.index('playedAt').openCursor(null, 'prev')
  while (cursor && out.length < limit) {
    out.push(cursor.value)
    cursor = await cursor.continue()
  }
  return out
}

export async function clearHistory(): Promise<void> {
  await (await db()).clear('history')
}

// ----------------------------------------------------------------- offline --

export async function saveOffline(track: OfflineTrack): Promise<void> {
  await (await db()).put('offline', track)
}
export async function getOffline(songId: string): Promise<OfflineTrack | undefined> {
  return (await db()).get('offline', songId)
}
export async function deleteOffline(songId: string): Promise<void> {
  await (await db()).delete('offline', songId)
}
export async function offlineIds(): Promise<string[]> {
  return (await (await db()).getAllKeys('offline')) as string[]
}
export async function offlineUsage(): Promise<{ count: number; bytes: number }> {
  const all = await (await db()).getAll('offline')
  return { count: all.length, bytes: all.reduce((sum, item) => sum + (item.size || 0), 0) }
}

// ---------------------------------------------------------------- analysis --

export async function getAnalysis(songId: string): Promise<TrackAnalysis | undefined> {
  return (await db()).get('analysis', songId)
}
export async function putAnalysis(analysis: TrackAnalysis): Promise<void> {
  await (await db()).put('analysis', analysis)
}
export async function analysisCount(): Promise<number> {
  return (await db()).count('analysis')
}
export async function clearAnalysis(): Promise<void> {
  await (await db()).clear('analysis')
}
export async function analysedIds(): Promise<Set<string>> {
  return new Set((await (await db()).getAllKeys('analysis')) as string[])
}

/** Wipe the mirrored library (keeps settings, offline files and history). */
export async function clearLibrary(): Promise<void> {
  const database = await db()
  await Promise.all([
    database.clear('songs'),
    database.clear('albums'),
    database.clear('artists'),
    database.clear('playlists'),
    database.clear('genres'),
  ])
  await setSyncState(EMPTY_SYNC_STATE)
}

/** Nuke everything, for "Reset Kultr" in settings. */
export async function destroyDatabase(): Promise<void> {
  const database = await db()
  database.close()
  dbPromise = null
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    request.onblocked = () => resolve()
  })
}
