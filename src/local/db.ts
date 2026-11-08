import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { LocalTrack, LocalUserData } from './catalog'
import type { MusicFolder } from './folders'

/**
 * The music on this computer, kept apart from the library mirror: the mirror
 * is what a sync copies from whichever library is in use (and is cleared when
 * you switch), while this is the library itself — the files found, their
 * covers, and what the files cannot hold: play counts, favourites, ratings
 * and playlists. A server keeps those; here Kultr does.
 */

export interface LocalPlaylist {
  id: string
  name: string
  comment?: string
  songIds: string[]
  created: string
  changed: string
}

export interface LocalCover {
  id: string
  blob: Blob
}

interface LocalDB extends DBSchema {
  folders: { key: string; value: MusicFolder }
  tracks: { key: string; value: LocalTrack; indexes: { folder: string } }
  covers: { key: string; value: LocalCover }
  /** Play counts, favourites and ratings, for songs, albums and artists alike, by id. */
  user: { key: string; value: LocalUserData & { id: string } }
  playlists: { key: string; value: LocalPlaylist }
  meta: { key: string; value: unknown }
}

let dbPromise: Promise<IDBPDatabase<LocalDB>> | null = null

export function localDb(): Promise<IDBPDatabase<LocalDB>> {
  dbPromise ??= openDB<LocalDB>('kultr-local', 1, {
    upgrade(database) {
      database.createObjectStore('folders', { keyPath: 'id' })
      const tracks = database.createObjectStore('tracks', { keyPath: 'path' })
      tracks.createIndex('folder', 'folderId')
      database.createObjectStore('covers', { keyPath: 'id' })
      database.createObjectStore('user', { keyPath: 'id' })
      database.createObjectStore('playlists', { keyPath: 'id' })
      database.createObjectStore('meta')
    },
  })
  return dbPromise
}

export type StoredTrack = LocalTrack & { folderId: string }

export async function allFolders(): Promise<MusicFolder[]> {
  return (await (await localDb()).getAll('folders')).sort((a, b) => a.added - b.added)
}
export async function putFolder(folder: MusicFolder): Promise<void> {
  await (await localDb()).put('folders', folder)
}
export async function deleteFolder(id: string): Promise<void> {
  const database = await localDb()
  const tx = database.transaction(['folders', 'tracks'], 'readwrite')
  await tx.objectStore('folders').delete(id)
  let cursor = await tx.objectStore('tracks').index('folder').openCursor(id)
  while (cursor) {
    await cursor.delete()
    cursor = await cursor.continue()
  }
  await tx.done
}

export async function allTracks(): Promise<StoredTrack[]> {
  return (await (await localDb()).getAll('tracks')) as StoredTrack[]
}
export async function tracksIn(folderId: string): Promise<StoredTrack[]> {
  return (await (await localDb()).getAllFromIndex('tracks', 'folder', folderId)) as StoredTrack[]
}
export async function getTrack(path: string): Promise<StoredTrack | undefined> {
  return (await (await localDb()).get('tracks', path)) as StoredTrack | undefined
}
export async function writeTracks(put: StoredTrack[], remove: string[]): Promise<void> {
  const database = await localDb()
  const tx = database.transaction('tracks', 'readwrite')
  for (const track of put) await tx.store.put(track)
  for (const path of remove) await tx.store.delete(path)
  await tx.done
}

export async function allCovers(): Promise<LocalCover[]> {
  return (await localDb()).getAll('covers')
}
export async function coverIds(): Promise<Set<string>> {
  return new Set((await (await localDb()).getAllKeys('covers')) as string[])
}
export async function putCover(cover: LocalCover): Promise<void> {
  await (await localDb()).put('covers', cover)
}
export async function deleteCovers(ids: string[]): Promise<void> {
  const database = await localDb()
  const tx = database.transaction('covers', 'readwrite')
  for (const id of ids) await tx.store.delete(id)
  await tx.done
}

export async function allUserData(): Promise<Map<string, LocalUserData>> {
  const rows = await (await localDb()).getAll('user')
  return new Map(rows.map(({ id, ...data }) => [id, data]))
}
export async function patchUserData(id: string, patch: Partial<LocalUserData>): Promise<void> {
  const database = await localDb()
  const tx = database.transaction('user', 'readwrite')
  const current = (await tx.store.get(id)) ?? { id }
  const next: LocalUserData & { id: string } = { ...current, ...patch, id }
  for (const key of Object.keys(next) as (keyof typeof next)[]) if (next[key] === undefined) delete next[key]
  await tx.store.put(next)
  await tx.done
}

export async function allPlaylists(): Promise<LocalPlaylist[]> {
  return (await localDb()).getAll('playlists')
}
export async function putPlaylist(playlist: LocalPlaylist): Promise<void> {
  await (await localDb()).put('playlists', playlist)
}
export async function deletePlaylist(id: string): Promise<void> {
  await (await localDb()).delete('playlists', id)
}

export async function getLocalMeta<T>(key: string, fallback: T): Promise<T> {
  return ((await (await localDb()).get('meta', key)) as T | undefined) ?? fallback
}
export async function setLocalMeta(key: string, value: unknown): Promise<void> {
  await (await localDb()).put('meta', value, key)
}

/** Forget the music on this computer entirely, for "Reset Kultr". The files themselves are never touched. */
export async function forgetLocalLibrary(): Promise<void> {
  const folders = await allFolders().catch(() => [] as MusicFolder[])
  const bridge = (window as unknown as { kultrDesktop?: { forgetFolder?: (root: string) => Promise<void> } }).kultrDesktop
  for (const folder of folders) if (folder.kind === 'desktop' && folder.path) await bridge?.forgetFolder?.(folder.path)
  if (dbPromise) {
    ;(await dbPromise).close()
    dbPromise = null
  }
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase('kultr-local')
    request.onsuccess = request.onerror = request.onblocked = () => resolve()
  })
  try {
    const root = (await navigator.storage.getDirectory()) as unknown as { removeEntry(name: string, o?: { recursive?: boolean }): Promise<void> }
    await root.removeEntry('music', { recursive: true })
  } catch {
    /* nothing was imported */
  }
}
