import { readStation, type Station } from '@/audio/stations'

/**
 * Crates, notes and tags, as in Kultr for iOS (Collection.swift), with the
 * same JSON shape so they travel between the apps in a settings file. Kept
 * with your settings; never sent to the server.
 */

/** Your own note and tags on an album or an artist. */
export interface Annotation {
  note: string
  tags: string[]
}

export const albumKey = (id: string) => `album:${id}`
export const artistKey = (id: string) => `artist:${id}`

export const isEmptyAnnotation = (annotation: Annotation | undefined): boolean =>
  !annotation || (!annotation.note.trim() && !annotation.tags.length)

/** Adds `tag` unless it is there already, in any case. */
export function addTag(annotation: Annotation, tag: string): Annotation {
  const clean = tag.trim()
  if (!clean || annotation.tags.some((t) => t.toLowerCase() === clean.toLowerCase())) return annotation
  return { ...annotation, tags: [...annotation.tags, clean] }
}

export function removeTag(annotation: Annotation, tag: string): Annotation {
  return { ...annotation, tags: annotation.tags.filter((t) => t.toLowerCase() !== tag.toLowerCase()) }
}

/** Every tag in use and how often, most used first, then by name. */
export function tagCounts(annotations: Record<string, Annotation>): { tag: string; count: number }[] {
  const counts = new Map<string, { tag: string; count: number }>()
  for (const annotation of Object.values(annotations)) {
    for (const tag of annotation.tags) {
      const key = tag.toLowerCase()
      const entry = counts.get(key) ?? { tag, count: 0 }
      entry.count++
      counts.set(key, entry)
    }
  }
  return [...counts.values()].sort((a, b) => (a.count !== b.count ? b.count - a.count : a.tag.localeCompare(b.tag, undefined, { sensitivity: 'base' })))
}

/**
 * A crate: a folder of albums, artists and tracks, filled by hand, or by
 * rules like "4 stars and up, added this year". It can be kept in step with
 * a playlist on the server.
 */
export interface Crate {
  id: string
  name: string
  icon: string
  albums: string[]
  artists: string[]
  songs: string[]
  /** Filled by these rules instead of by hand; absent for a crate filled by hand. */
  rules?: Station | null
  /** Kept in step with a playlist of the same name on the server. */
  syncPlaylist?: boolean
  /** That playlist, once made. */
  playlistId?: string | null
}

export const newId = (prefix = '') => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`

export function crateContents(crate: Crate): string {
  const count = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
  const parts = [
    crate.albums.length ? count(crate.albums.length, 'album') : null,
    crate.artists.length ? count(crate.artists.length, 'artist') : null,
    crate.songs.length ? count(crate.songs.length, 'track') : null,
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : 'Empty'
}

/** In if it was out, out if it was in. */
export function toggleIn(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((entry) => entry !== id) : [...list, id]
}

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [])

/** Annotations from a settings file or another app; anything unreadable is left out. */
export function readAnnotations(raw: unknown): Record<string, Annotation> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const out: Record<string, Annotation> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^(album|artist):./.test(key) || !value || typeof value !== 'object') continue
    const v = value as Record<string, unknown>
    const annotation: Annotation = { note: typeof v.note === 'string' ? v.note.slice(0, 5000) : '', tags: strings(v.tags).slice(0, 50) }
    if (!isEmptyAnnotation(annotation)) out[key] = annotation
  }
  return out
}

/** Crates from a settings file or another app. */
export function readCrates(raw: unknown): Crate[] | null {
  if (!Array.isArray(raw)) return null
  const out: Crate[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const r = entry as Record<string, unknown>
    out.push({
      id: typeof r.id === 'string' && r.id ? r.id : newId('c'),
      name: typeof r.name === 'string' && r.name.trim() ? r.name.trim().slice(0, 80) : 'Crate',
      icon: typeof r.icon === 'string' ? r.icon : 'shippingbox.fill',
      albums: strings(r.albums),
      artists: strings(r.artists),
      songs: strings(r.songs),
      rules: r.rules ? readStation(r.rules) : null,
      syncPlaylist: r.syncPlaylist === true,
      playlistId: typeof r.playlistId === 'string' ? r.playlistId : null,
    })
  }
  return out
}

/** Stations from a settings file or another app. */
export function readStations(raw: unknown): Station[] | null {
  if (!Array.isArray(raw)) return null
  return raw.map(readStation).filter((station): station is Station => station !== null)
}
