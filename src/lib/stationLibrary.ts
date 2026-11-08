import type { Song } from '@/api/types'
import type { TrackAnalysis } from '@/audio/analysis'
import { addedSinceDay, decadeStations, matches, type Station } from '@/audio/stations'
import { allAnalyses, allSongs, offlineIdSet } from '@/db'
import { settings } from '@/store/settings'

/**
 * Stations over the library: yours (from Settings) plus one per decade the
 * library has enough music from, and the tracks that fit each.
 */

/** Album and artist ids carrying any of `tags` (notes and tags, from Settings). */
export function taggedIds(tags: string[] | null | undefined): Set<string> {
  const out = new Set<string>()
  if (!tags?.length) return out
  const wanted = new Set(tags.map((tag) => tag.toLowerCase()))
  for (const [key, annotation] of Object.entries(settings().annotations ?? {})) {
    if (!annotation?.tags?.some((tag) => wanted.has(tag.toLowerCase()))) continue
    const id = key.slice(key.indexOf(':') + 1)
    if (id) out.add(id)
  }
  return out
}

/** The decades the library has enough music from, as stations. */
export async function libraryDecades(songs?: Song[]): Promise<Station[]> {
  return decadeStations((songs ?? (await allSongs())).map((song) => song.year))
}

/** Every station, yours first, then the decades. */
export async function allStations(): Promise<Station[]> {
  return [...settings().stations, ...(await libraryDecades())]
}

/**
 * The tracks that fit `station`, each with InjeKt's analysis if there is one.
 * With no connection to a server, only the tracks that can play offline.
 */
export async function stationPool(
  station: Station,
  options: { playableOnly?: boolean; songs?: Song[]; analyses?: Map<string, TrackAnalysis> } = {},
): Promise<[Song, TrackAnalysis | undefined][]> {
  const [songs, analyses] = await Promise.all([options.songs ?? allSongs(), options.analyses ?? allAnalyses()])
  const tagged = taggedIds(station.tags)
  const since = addedSinceDay(station.addedDays)
  const pool: [Song, TrackAnalysis | undefined][] = []
  for (const song of songs) {
    const analysis = analyses.get(song.id)
    if (matches(station, song, analysis, tagged, since)) pool.push([song, analysis])
  }
  const offline = options.playableOnly !== false && typeof navigator !== 'undefined' && !navigator.onLine
  if (!offline) return pool
  const stored = await offlineIdSet()
  return pool.filter(([song]) => stored.has(song.id) || song.id.startsWith('local:'))
}

/** How many tracks fit each station, by id. One read of the library for all of them. */
export async function stationCounts(stations: Station[]): Promise<Record<string, number>> {
  const [songs, analyses] = await Promise.all([allSongs(), allAnalyses()])
  const out: Record<string, number> = {}
  for (const station of stations) {
    out[station.id] = (await stationPool(station, { songs, analyses, playableOnly: false })).length
  }
  return out
}
