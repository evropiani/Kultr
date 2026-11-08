import type { Song } from '@/api/types'
import { maybeClient } from '@/api/subsonic'
import { getSongs, putPlaylist, songsByAlbum, songsByArtist } from '@/db'
import { settings } from '@/store/settings'
import { useToast } from '@/store/ui'
import type { Annotation, Crate } from './collection'
import { isEmptyAnnotation, toggleIn } from './collection'
import { sortKey } from './format'
import { stationPool } from './stationLibrary'

/**
 * Crates and notes: kept with the settings (so a settings backup keeps
 * them), resolved to tracks from the library, and, for a crate that asks for
 * it, kept in step with a playlist on the server. As in Kultr for iOS
 * (CrateLibrary.swift).
 */

/** Something that can go into a crate. */
export type CrateItem =
  | { kind: 'album'; id: string; name: string }
  | { kind: 'artist'; id: string; name: string }
  | { kind: 'songs'; songs: Song[] }

export const itemTitle = (item: CrateItem) =>
  item.kind === 'songs' ? (item.songs.length === 1 ? item.songs[0].title : `${item.songs.length} tracks`) : item.name

export function crateById(id: string): Crate | undefined {
  return settings().crates.find((crate) => crate.id === id)
}

export function saveCrate(crate: Crate): void {
  const crates = settings().crates
  const at = crates.findIndex((entry) => entry.id === crate.id)
  settings().set('crates', at >= 0 ? crates.map((entry) => (entry.id === crate.id ? crate : entry)) : [...crates, crate])
  if (crate.syncPlaylist) scheduleCrateSync(crate.id)
}

export function deleteCrate(id: string): void {
  settings().set(
    'crates',
    settings().crates.filter((crate) => crate.id !== id),
  )
}

/** Whether `item` is in `crate`; songs count as in when all of them are. */
export function crateContains(crate: Crate, item: CrateItem): boolean {
  if (item.kind === 'album') return crate.albums.includes(item.id)
  if (item.kind === 'artist') return crate.artists.includes(item.id)
  return item.songs.length > 0 && item.songs.every((song) => crate.songs.includes(song.id))
}

/** Puts `item` in the crate, or takes it out if it is in. */
export function toggleInCrate(item: CrateItem, crateId: string): void {
  const crate = crateById(crateId)
  if (!crate) return
  const wasIn = crateContains(crate, item)
  const next: Crate = { ...crate }
  if (item.kind === 'album') next.albums = toggleIn(crate.albums, item.id)
  else if (item.kind === 'artist') next.artists = toggleIn(crate.artists, item.id)
  else {
    let songs = [...crate.songs]
    for (const song of item.songs) if (songs.includes(song.id) === wasIn) songs = toggleIn(songs, song.id)
    next.songs = songs
  }
  saveCrate(next)
  useToast.getState().show(wasIn ? `Taken out of “${crate.name}”` : `Added to “${crate.name}”`, 'success')
}

/** Every track in a crate: its albums, its artists' tracks and its own tracks, or what fits its rules. */
export async function crateSongs(crate: Crate): Promise<Song[]> {
  if (crate.rules) {
    const songs = (await stationPool(crate.rules, { playableOnly: false })).map(([song]) => song)
    return songs.sort((a, b) => {
      const x = sortKey(a.artist ?? '').localeCompare(sortKey(b.artist ?? ''))
      if (x) return x
      const y = (a.album ?? '').localeCompare(b.album ?? '')
      if (y) return y
      return (a.discNumber ?? 1) - (b.discNumber ?? 1) || (a.track ?? 0) - (b.track ?? 0)
    })
  }
  const seen = new Set<string>()
  const out: Song[] = []
  const add = (songs: Song[]) => {
    for (const song of songs) {
      if (seen.has(song.id)) continue
      seen.add(song.id)
      out.push(song)
    }
  }
  for (const id of crate.albums) add(await songsByAlbum(id))
  for (const id of crate.artists) add(await songsByArtist(id))
  add(await getSongs(crate.songs))
  return out
}

// ------------------------------------------------------------- playlists --

const pending = new Map<string, number>()

/** Bring the crate's playlist in step soon; several changes in a row make one sync. */
export function scheduleCrateSync(crateId: string): void {
  window.clearTimeout(pending.get(crateId))
  pending.set(
    crateId,
    window.setTimeout(() => {
      pending.delete(crateId)
      void syncCrateNow(crateId)
    }, 1500),
  )
}

/** Makes the crate's playlist hold exactly its tracks, creating it the first time. */
export async function syncCrateNow(crateId: string): Promise<string | null> {
  const crate = crateById(crateId)
  const client = maybeClient()
  if (!crate?.syncPlaylist || !client) return null
  try {
    const ids = (await crateSongs(crate)).filter((song) => !song.kultrStreamUrl).map((song) => song.id)
    let playlist = await client.createPlaylist(crate.name, ids, crate.playlistId ?? undefined).catch(async (err) => {
      // The playlist was deleted on the server: make a new one.
      if (crate.playlistId) return client.createPlaylist(crate.name, ids)
      throw err
    })
    const id = playlist?.id ?? crate.playlistId ?? null
    if (id) {
      playlist = (await client.getPlaylist(id).catch(() => null)) ?? playlist
      if (playlist) await putPlaylist(playlist)
    }
    if (id && id !== crate.playlistId) {
      const fresh = crateById(crateId)
      if (fresh) settings().set('crates', settings().crates.map((entry) => (entry.id === crateId ? { ...fresh, playlistId: id } : entry)))
    }
    return null
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    useToast.getState().show(`“${crate.name}” could not be kept as a playlist: ${message}`, 'error')
    return message
  }
}

// ---------------------------------------------------------------- notes --

export function annotationFor(key: string): Annotation {
  return settings().annotations[key] ?? { note: '', tags: [] }
}

export function setAnnotation(key: string, annotation: Annotation): void {
  const next = { ...settings().annotations }
  if (isEmptyAnnotation(annotation)) delete next[key]
  else next[key] = annotation
  settings().set('annotations', next)
}
