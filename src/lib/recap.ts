import type { Song } from '@/api/types'
import type { PlayHistoryEntry } from '@/db'

/**
 * One month of listening in this browser, for the recap in Listening. Built
 * from this browser's own history, because the server only keeps a play
 * count and the last time per track, not each play. Ported from Kultr for
 * iOS (Recap.swift).
 */

export interface RecapEntry<T> {
  item: T
  plays: number
  seconds: number
}

/** An artist or an album, as far as the tracks played know it. */
export interface RecapName {
  id?: string
  name: string
  artist?: string
  coverArt?: string
}

export interface MonthRecap {
  /** The first moment of the month, in ms. */
  month: number
  seconds: number
  plays: number
  tracks: number
  artists: number
  /** Most played first; ties go to more time listened. */
  topSongs: RecapEntry<Song>[]
  topArtists: RecapEntry<RecapName>[]
  topAlbums: RecapEntry<RecapName>[]
  /** The day with the most listening. */
  busiestDay: { date: number; seconds: number } | null
  /** Tracks played for the first time in this browser this month. */
  firstListens: number
  /** Time listened the month before, to compare with. */
  previousSeconds: number
}

/** Month and day boundaries, in local time or (for tests) UTC. */
export interface Calendar {
  monthStart(ms: number): number
  addMonths(ms: number, months: number): number
  dayStart(ms: number): number
}

export const LOCAL: Calendar = {
  monthStart: (ms) => {
    const d = new Date(ms)
    return new Date(d.getFullYear(), d.getMonth(), 1).getTime()
  },
  addMonths: (ms, months) => {
    const d = new Date(ms)
    return new Date(d.getFullYear(), d.getMonth() + months, 1).getTime()
  },
  dayStart: (ms) => {
    const d = new Date(ms)
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  },
}

export const UTC: Calendar = {
  monthStart: (ms) => {
    const d = new Date(ms)
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)
  },
  addMonths: (ms, months) => {
    const d = new Date(ms)
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1)
  },
  dayStart: (ms) => {
    const d = new Date(ms)
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  },
}

/** The months with any listening in `history`, newest first. */
export function recapMonths(history: PlayHistoryEntry[], calendar: Calendar = LOCAL): number[] {
  return [...new Set(history.map((entry) => calendar.monthStart(entry.playedAt)))].sort((a, b) => b - a)
}

/**
 * The recap of the month that `month` falls in. `songs` resolves the ids in
 * `history`; a track no longer in the library still counts towards the time
 * and the plays, it just can't be listed.
 */
export function monthRecap(
  history: PlayHistoryEntry[],
  songs: Map<string, Song>,
  month: number,
  calendar: Calendar = LOCAL,
  top = 10,
): MonthRecap {
  const start = calendar.monthStart(month)
  const end = calendar.addMonths(start, 1)
  const previousStart = calendar.addMonths(start, -1)

  let seconds = 0
  let previousSeconds = 0
  let plays = 0
  const bySong = new Map<string, { plays: number; seconds: number }>()
  const byArtist = new Map<string, { name: RecapName; plays: number; seconds: number }>()
  const byAlbum = new Map<string, { name: RecapName; plays: number; seconds: number }>()
  const byDay = new Map<number, number>()
  const heardBefore = new Set<string>()

  for (const entry of history) {
    const date = entry.playedAt
    if (date < start) heardBefore.add(entry.songId)
    if (date >= previousStart && date < start) previousSeconds += entry.seconds
    if (date < start || date >= end) continue
    const time = entry.seconds
    seconds += time
    plays++
    const s = bySong.get(entry.songId) ?? { plays: 0, seconds: 0 }
    s.plays++
    s.seconds += time
    bySong.set(entry.songId, s)
    const day = calendar.dayStart(date)
    byDay.set(day, (byDay.get(day) ?? 0) + time)
    const song = songs.get(entry.songId)
    if (!song) continue
    const artist = song.artist ?? song.artistId
    if (artist) {
      const key = song.artistId ?? artist
      const a = byArtist.get(key) ?? { name: { id: song.artistId, name: artist }, plays: 0, seconds: 0 }
      a.plays++
      a.seconds += time
      byArtist.set(key, a)
    }
    const album = song.album ?? song.albumId
    if (album) {
      const key = song.albumId ?? album
      const al = byAlbum.get(key) ?? { name: { id: song.albumId, name: album, artist: song.artist, coverArt: song.coverArt }, plays: 0, seconds: 0 }
      al.plays++
      al.seconds += time
      byAlbum.set(key, al)
    }
  }

  const ranked = <T>(items: [T, number, number, string][]): RecapEntry<T>[] =>
    items
      .sort((a, b) => (a[1] !== b[1] ? b[1] - a[1] : a[2] !== b[2] ? b[2] - a[2] : a[3] < b[3] ? -1 : a[3] > b[3] ? 1 : 0))
      .slice(0, top)
      .map(([item, p, s]) => ({ item, plays: p, seconds: s }))

  let busiestDay: MonthRecap['busiestDay'] = null
  for (const [date, time] of byDay) {
    if (!busiestDay || time > busiestDay.seconds || (time === busiestDay.seconds && date < busiestDay.date)) busiestDay = { date, seconds: time }
  }

  return {
    month: start,
    seconds,
    plays,
    tracks: bySong.size,
    artists: new Set([...byArtist.values()].map((a) => a.name.id ?? a.name.name)).size,
    topSongs: ranked(
      [...bySong].flatMap(([id, count]) => {
        const song = songs.get(id)
        return song ? [[song, count.plays, count.seconds, id] as [Song, number, number, string]] : []
      }),
    ),
    topArtists: ranked([...byArtist].map(([key, v]) => [v.name, v.plays, v.seconds, key] as [RecapName, number, number, string])),
    topAlbums: ranked([...byAlbum].map(([key, v]) => [v.name, v.plays, v.seconds, key] as [RecapName, number, number, string])),
    busiestDay,
    firstListens: [...bySong.keys()].filter((id) => !heardBefore.has(id)).length,
    previousSeconds,
  }
}
