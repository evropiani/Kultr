import type { Song } from '@/api/types'
import { maybeClient } from '@/api/subsonic'
import {
  allSongIds,
  allSongs,
  artistIdsNamed,
  getAnalysis,
  getSongs,
  offlineIdSet,
  songIdsInGenre,
  songIdsPlayedSince,
  songsByArtist,
  starredSongs,
} from '@/db'
import { mostPlayed } from '@/lib/listening'
import { settings } from '@/store/settings'
import { affinity } from './injekt'
import { karouselKey, pickKarousel, type ArtistRef, type KarouselSources } from './karousel'

/** Songs played this recently are not offered again. */
const RECENT_MS = 3 * 60 * 60 * 1000

/** Where a song not analysed yet sits among analysed ones: in the middle. */
const UNKNOWN_AFFINITY = 0.5

function sample<T>(items: T[], count: number): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out.slice(0, count)
}

/**
 * Karousel's music, from the server and the library mirrored in this browser.
 * The server offers its similar songs, similar artists and their best-known
 * songs (when it has Last.fm set up); the library carries on from there.
 * Offline, only downloaded songs are offered, since nothing else would play.
 */
class KarouselMusic implements KarouselSources {
  private constructor(private readonly downloaded: Set<string>) {}

  static async create(): Promise<KarouselMusic> {
    return new KarouselMusic(await offlineIdSet().catch(() => new Set<string>()))
  }

  /** Whether the server can be asked right now. */
  private get online(): boolean {
    return Boolean(maybeClient()) && navigator.onLine
  }

  private playable = (song: Song): boolean =>
    !song.kultrStreamUrl && (this.online || (settings().offlineFirst && this.downloaded.has(song.id)))

  async station(seed: Song): Promise<Song[]> {
    const client = maybeClient()
    if (!client || !this.online) return []
    return this.mixingWell(seed, (await client.getSimilarSongs2(seed.id, 50)).filter(this.playable))
  }

  /**
   * With InjeKt on, the songs that mix best out of `seed` come first, as far
   * as analyses already made can tell; the rest keep the server's order.
   */
  private async mixingWell(seed: Song, songs: Song[]): Promise<Song[]> {
    if (!settings().injektEnabled || !songs.length) return songs
    const from = await getAnalysis(seed.id)
    if (!from) return songs
    const scores = new Map<string, number>()
    for (const song of songs) {
      const analysis = await getAnalysis(song.id)
      scores.set(song.id, analysis ? affinity(from, analysis) : UNKNOWN_AFFINITY)
    }
    return [...songs].sort((a, b) => scores.get(b.id)! - scores.get(a.id)!)
  }

  async similarArtists(artist: ArtistRef): Promise<ArtistRef[]> {
    const client = maybeClient()
    if (!client || !this.online || !artist.id) return []
    const info = await client.getArtistInfo2(artist.id, 20)
    return (info?.similarArtist ?? []).map((other) => ({ name: other.name, id: other.id }))
  }

  async topSongs(artist: ArtistRef, count: number): Promise<Song[]> {
    const client = maybeClient()
    if (!client || !this.online) return []
    return (await client.getTopSongs(artist.name, 20)).filter(this.playable).slice(0, count)
  }

  async byArtists(artists: ArtistRef[]): Promise<Song[]> {
    const ids = new Set(artists.flatMap((artist) => (artist.id ? [artist.id] : [])))
    for (const artist of artists) {
      if (!artist.id) for (const id of await artistIdsNamed(artist.name)) ids.add(id)
    }
    const songs = await Promise.all([...ids].slice(0, 40).map((id) => songsByArtist(id)))
    return songs.flat().filter(this.playable)
  }

  async inGenres(genres: Set<string>, count: number): Promise<Song[]> {
    const each = Math.max(10, Math.floor(count / Math.max(1, genres.size)))
    const ids = await Promise.all([...genres].slice(0, 3).map(async (genre) => sample(await songIdsInGenre(genre), each)))
    return (await getSongs(ids.flat())).filter(this.playable)
  }

  async favourites(count: number): Promise<Song[]> {
    const [played, hearted] = await Promise.all([
      allSongs().then((songs) => mostPlayed(songs, count)),
      starredSongs().then((songs) => sample(songs, Math.floor(count / 2))),
    ])
    const downloaded = this.online ? [] : await getSongs(sample([...this.downloaded], count))
    // Anything at all from the library last, for a library with no plays or hearts yet.
    const any = await getSongs(sample(await allSongIds(), count))
    const seen = new Set<string>()
    return [...played, ...hearted, ...downloaded, ...any].filter((song) => {
      if (seen.has(song.id) || !this.playable(song)) return false
      seen.add(song.id)
      return true
    })
  }
}

/**
 * Songs like `seeds` (the track playing first) to follow `queued`, leaving
 * out anything queued already or played in the last few hours.
 */
export async function karouselNext(seeds: Song[], queued: Song[], count = 10): Promise<Song[]> {
  const exclude = new Set<string>()
  const recentIds = await songIdsPlayedSince(Date.now() - RECENT_MS).catch(() => [] as string[])
  const recent = await getSongs(recentIds).catch(() => [] as Song[])
  for (const id of recentIds) exclude.add(id)
  for (const song of [...queued, ...recent]) {
    exclude.add(song.id)
    exclude.add(karouselKey(song))
  }
  return pickKarousel(await KarouselMusic.create(), { seeds, exclude, count }, (message) =>
    console.info(`[kultr] Karousel: ${message}`),
  )
}
