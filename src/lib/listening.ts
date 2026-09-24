import type { Song } from '@/api/types'
import type { PlayHistoryEntry } from '@/db'

/**
 * What was played last, newest first, one entry per track.
 *
 * Two sources, merged: each track's last-played time as the server keeps it
 * (every device's plays, and it survives clearing this browser), and this
 * browser's own history (exact, and all a server without last-played times
 * can offer). Whichever is later wins for each track.
 */
export function recentPlays(
  songs: Song[],
  history: PlayHistoryEntry[],
  limit: number,
): { song: Song; at: number }[] {
  const latest = new Map<string, number>()
  for (const song of songs) {
    if (!song.played) continue
    const at = Date.parse(song.played)
    if (Number.isFinite(at)) latest.set(song.id, at)
  }
  for (const entry of history) {
    if ((latest.get(entry.songId) ?? 0) < entry.playedAt) latest.set(entry.songId, entry.playedAt)
  }

  const byId = new Map(songs.map((song) => [song.id, song]))
  return [...latest.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, at]) => ({ song: byId.get(id), at }))
    .filter((entry): entry is { song: Song; at: number } => Boolean(entry.song))
    .slice(0, limit)
}

/** Tracks by play count, as the server counts them. */
export function mostPlayed(songs: Song[], limit: number): Song[] {
  return songs
    .filter((song) => (song.playCount ?? 0) > 0)
    .sort((a, b) => (b.playCount ?? 0) - (a.playCount ?? 0))
    .slice(0, limit)
}

/** Artists by the summed play counts of their tracks. */
export function artistPlays(songs: Song[], limit: number): { artist: string; artistId?: string; plays: number }[] {
  const totals = new Map<string, { artist: string; artistId?: string; plays: number }>()
  for (const song of songs) {
    if (!song.playCount || !song.artist) continue
    const key = song.artistId ?? song.artist
    const entry = totals.get(key) ?? { artist: song.artist, artistId: song.artistId, plays: 0 }
    entry.plays += song.playCount
    totals.set(key, entry)
  }
  return [...totals.values()].sort((a, b) => b.plays - a.plays).slice(0, limit)
}
