import type { Song } from '@/api/types'
import type { TrackAnalysis } from './analysis'
import { affinity } from './affinity'
import { t } from '@/i18n'

/**
 * Stations: rules over the library, played as an endless mix. Kultr picks
 * what fits the rules and InjeKt mixes from one track to the next. Ported
 * from Kultr for iOS (Stations.swift), with the same JSON shape, so stations
 * travel between the apps in a settings file.
 *
 * Rules about energy and key need InjeKt's analysis, so they only match
 * tracks it has analysed; a tempo rule is also happy with a file's BPM tag.
 */

/** A range with either end left open. */
export interface Bounds {
  min?: number | null
  max?: number | null
}

export interface Station {
  id: string
  name: string
  /** An SF Symbol name, as on iOS; the web draws its own icon for it. */
  icon: string
  /** Beats per minute. */
  bpm?: Bounds | null
  /** 0 to 1, as InjeKt measures it; shown as 1 to 10. */
  energy?: Bounds | null
  /** Camelot keys, like "8A"; empty for any. */
  keys?: string[] | null
  /** Any of these genres; empty for any. */
  genres?: string[] | null
  years?: Bounds | null
  unplayed?: boolean
  favourites?: boolean
  /** At least this many stars. */
  minRating?: number | null
  /** Albums or artists you gave any of these tags. */
  tags?: string[] | null
  /** Added to the library in the last this many days. */
  addedDays?: number | null
}

export const isOpen = (bounds: Bounds | null | undefined): boolean =>
  !bounds || ((bounds.min === undefined || bounds.min === null) && (bounds.max === undefined || bounds.max === null))

export function contains(bounds: Bounds, value: number): boolean {
  if (bounds.min !== undefined && bounds.min !== null && value < bounds.min) return false
  if (bounds.max !== undefined && bounds.max !== null && value > bounds.max) return false
  return true
}

/** Rules that only InjeKt's analysis can answer. */
export const needsAnalysis = (station: Station): boolean => !isOpen(station.energy) || Boolean(station.keys?.length)

const isRadio = (song: Song) => Boolean(song.kultrStreamUrl)

/**
 * Whether `song` fits, given what InjeKt knows about it. `tagged` holds the
 * album and artist ids with any of the station's tags; `addedSince` is the
 * day ("2026-01-31") a track must have been added on or after.
 */
export function matches(
  station: Station,
  song: Song,
  analysis: Pick<TrackAnalysis, 'bpm' | 'energy' | 'camelot'> | null | undefined,
  tagged: Set<string> = new Set(),
  addedSince?: string | null,
): boolean {
  if (isRadio(song)) return false
  if (station.tags?.length) {
    if (!(song.albumId && tagged.has(song.albumId)) && !(song.artistId && tagged.has(song.artistId))) return false
  }
  if (addedSince && station.addedDays) {
    if (!song.created || song.created.slice(0, 10) < addedSince) return false
  }
  if (!isOpen(station.bpm)) {
    const tempo = analysis?.bpm && analysis.bpm > 0 ? analysis.bpm : song.bpm && song.bpm > 0 ? song.bpm : null
    if (tempo === null || !contains(station.bpm!, tempo)) return false
  }
  if (!isOpen(station.energy)) {
    if (analysis?.energy === undefined || analysis?.energy === null || !contains(station.energy!, analysis.energy)) return false
  }
  if (station.keys?.length) {
    if (!analysis?.camelot || !station.keys.includes(analysis.camelot)) return false
  }
  if (station.genres?.length) {
    const genre = song.genre?.toLowerCase()
    if (!genre) return false
    if (!station.genres.some((wanted) => genre === wanted.toLowerCase() || genre.includes(wanted.toLowerCase()))) return false
  }
  if (!isOpen(station.years)) {
    if (!song.year || !contains(station.years!, song.year)) return false
  }
  if (station.unplayed && (song.playCount ?? 0) > 0) return false
  if (station.favourites && !song.starred) return false
  if (station.minRating && station.minRating > 0 && (song.userRating ?? 0) < station.minRating) return false
  return true
}

function range(bounds: Bounds, text: (value: number) => string, unit = ''): string {
  const low = bounds.min ?? null
  const high = bounds.max ?? null
  if (low !== null && high !== null) return `${text(low)}–${text(high)}${unit}`
  if (low !== null) return t('%@ and up', `${text(low)}${unit}`)
  if (high !== null) return t('up to %@', `${text(high)}${unit}`)
  return t('any')
}

/** One line saying what the rules are, like "96–110 BPM · energy 4–6 · 6A, 7A". */
export function summary(station: Station): string {
  const parts: string[] = []
  if (!isOpen(station.bpm)) parts.push(range(station.bpm!, (v) => String(Math.round(v)), ' BPM'))
  if (!isOpen(station.energy)) parts.push(t('energy %@', range(station.energy!, (v) => String(Math.round(v * 10)))))
  if (station.keys?.length) parts.push(station.keys.length <= 3 ? station.keys.join(', ') : t('%@ keys', station.keys.length))
  if (station.genres?.length) parts.push(station.genres.length <= 2 ? station.genres.join(', ') : t('%@ genres', station.genres.length))
  if (!isOpen(station.years)) parts.push(range(station.years!, (v) => String(Math.trunc(v))))
  if (station.unplayed) parts.push(t('never played'))
  if (station.favourites) parts.push(t('favourites'))
  if (station.minRating && station.minRating > 0) parts.push(t('%@★ and up', station.minRating))
  if (station.tags?.length) parts.push(t('tagged %@', station.tags.join(', ')))
  if (station.addedDays) parts.push(station.addedDays === 365 ? t('added this year') : t('added in the last %@ days', station.addedDays))
  return parts.length ? parts.join(' · ') : t('Your whole library')
}

/**
 * A station's name as shown: the starting stations in the language in use
 * (Night Drive is Nachtfahrt in German), stations you made or renamed as you
 * named them.
 */
export function stationName(station: Station): string {
  const preset = STATION_PRESETS.find((entry) => entry.id === station.id)
  return preset && preset.name === station.name ? t(station.name) : station.name
}

/** A station per decade, made from the years in the library. */
export const decade = (start: number): Station => ({
  id: `decade-${start}`,
  name: `${start}s`,
  icon: 'calendar',
  years: { min: start, max: start + 9 },
})

/** The first day a track must have been added on to fit `addedDays`, as "2026-01-31". */
export function addedSinceDay(addedDays: number | null | undefined, now = Date.now()): string | null {
  if (!addedDays) return null
  return new Date(now - addedDays * 86_400_000).toISOString().slice(0, 10)
}

/** The stations Kultr starts with; each can be changed or removed. */
export const STATION_PRESETS: Station[] = [
  { id: 'warm-up', name: 'Warm Up', icon: 'sunrise.fill', bpm: { min: 112, max: 124 }, energy: { min: 0.5, max: 0.85 } },
  { id: 'night-drive', name: 'Night Drive', icon: 'car.fill', bpm: { min: 88, max: 112 }, energy: { min: 0.35, max: 0.7 } },
  { id: 'peak-hour', name: 'Peak Hour', icon: 'flame.fill', bpm: { min: 120, max: 135 }, energy: { min: 0.8 } },
  { id: 'deep-focus', name: 'Deep Focus', icon: 'brain.head.profile', bpm: { min: 60, max: 100 }, energy: { max: 0.5 } },
  { id: 'wind-down', name: 'Wind Down', icon: 'moon.stars.fill', bpm: { min: 50, max: 95 }, energy: { max: 0.35 } },
  { id: 'unplayed', name: 'Unplayed gems', icon: 'sparkle', unplayed: true },
  { id: 'favourites', name: 'Favourites', icon: 'heart.fill', favourites: true },
]

/** Decades with at least `minimum` tracks in `years`, oldest first. */
export function decadeStations(years: (number | undefined)[], minimum = 20): Station[] {
  const counts = new Map<number, number>()
  for (const year of years) {
    if (!year || year < 1900 || year > 2100) continue
    const start = Math.floor(year / 10) * 10
    counts.set(start, (counts.get(start) ?? 0) + 1)
  }
  return [...counts]
    .filter(([, count]) => count >= minimum)
    .map(([start]) => start)
    .sort((a, b) => a - b)
    .map(decade)
}

/** A station read from a settings file or another app: anything missing is "any". */
export function readStation(raw: unknown): Station | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const bounds = (value: unknown): Bounds | null => {
    if (!value || typeof value !== 'object') return null
    const v = value as Record<string, unknown>
    const min = typeof v.min === 'number' && Number.isFinite(v.min) ? v.min : null
    const max = typeof v.max === 'number' && Number.isFinite(v.max) ? v.max : null
    return min === null && max === null ? null : { ...(min !== null ? { min } : {}), ...(max !== null ? { max } : {}) }
  }
  const strings = (value: unknown) => (Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : null)
  const number = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null)
  const station: Station = {
    id: typeof r.id === 'string' && r.id ? r.id : `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name: typeof r.name === 'string' && r.name.trim() ? r.name.trim().slice(0, 80) : 'Station',
    icon: typeof r.icon === 'string' ? r.icon : 'dot.radiowaves.left.and.right',
  }
  const bpm = bounds(r.bpm)
  const energy = bounds(r.energy)
  const years = bounds(r.years)
  if (bpm) station.bpm = bpm
  if (energy) station.energy = energy
  if (years) station.years = years
  const keys = strings(r.keys)
  const genres = strings(r.genres)
  const tags = strings(r.tags)
  if (keys?.length) station.keys = keys
  if (genres?.length) station.genres = genres
  if (tags?.length) station.tags = tags
  if (r.unplayed === true) station.unplayed = true
  if (r.favourites === true) station.favourites = true
  const minRating = number(r.minRating)
  const addedDays = number(r.addedDays)
  if (minRating) station.minRating = Math.max(0, Math.min(5, Math.round(minRating)))
  if (addedDays) station.addedDays = Math.max(1, Math.round(addedDays))
  return station
}

/**
 * Rank candidates by how well each mixes out of `seed`, then take a light
 * shuffle of the best, so a station never plays the same order twice. With
 * no analysis for the seed, the pick is random.
 */
export function rankAutoQueue(
  seed: TrackAnalysis | null | undefined,
  candidates: [Song, TrackAnalysis | null | undefined][],
  count: number,
  random: () => number = Math.random,
): Song[] {
  if (!candidates.length) return []
  const shuffle = <T>(items: T[]): T[] => {
    const out = [...items]
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1))
      ;[out[i], out[j]] = [out[j], out[i]]
    }
    return out
  }
  if (!seed) return shuffle(candidates.map(([song]) => song)).slice(0, count)
  const ranked = candidates
    .map(([song, analysis], index) => ({ song, index, score: analysis ? affinity(seed, analysis) : 0.45 + random() * 0.1 }))
    .sort((a, b) => (b.score !== a.score ? b.score - a.score : a.index - b.index))
    .map((entry) => entry.song)
  return shuffle(ranked.slice(0, Math.max(count, count * 3))).slice(0, count)
}

/**
 * The next songs for a station: what fits `pool`, leaving out `exclude`
 * (played lately) and `queued`, ranked by how well each mixes out of `seed`.
 * When everything has been played it starts over rather than stopping.
 */
export function stationPicks(
  pool: [Song, TrackAnalysis | null | undefined][],
  seed: TrackAnalysis | null | undefined,
  exclude: Set<string>,
  queued: Set<string>,
  count: number,
  random: () => number = Math.random,
): Song[] {
  let fresh = pool.filter(([song]) => !exclude.has(song.id) && !queued.has(song.id))
  if (!fresh.length) fresh = pool.filter(([song]) => !queued.has(song.id))
  return rankAutoQueue(seed, fresh, count, random)
}

/** How calm a track is, 0 to 1: mostly its energy, a little its tempo; unknown is middling. As on iOS. */
export function calmness(analysis: Pick<TrackAnalysis, 'bpm' | 'energy'> | null | undefined): number {
  if (!analysis) return 0.5
  const tempo = analysis.bpm > 0 ? Math.min(1, analysis.bpm / 180) : 0.5
  return Math.min(1, Math.max(0, analysis.energy)) * 0.7 + tempo * 0.3
}

/** Songs calmest first; equally calm ones keep their order. */
export function calmestFirst<T extends { id: string }>(songs: T[], analysis: (song: T) => Pick<TrackAnalysis, 'bpm' | 'energy'> | null | undefined): T[] {
  return songs
    .map((song, offset) => ({ song, offset, score: calmness(analysis(song)) }))
    .sort((a, b) => (a.score !== b.score ? a.score - b.score : a.offset - b.offset))
    .map((entry) => entry.song)
}
