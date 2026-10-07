import type { Song } from '@/api/types'

/**
 * Karousel: when the queue runs out, more music like what has been playing,
 * so it never stops. Ported from KultrDL, by way of Kultr for Android.
 *
 * It draws on a station started from the song now playing (the server's
 * similar songs), on the best-known songs of artists like the ones playing and
 * of those artists themselves, and on the library's songs by any of them.
 * Short of those (with no connection, say) it carries on with the library:
 * the same genres first, then what the user plays most.
 *
 * This file only picks; where the songs come from is up to the
 * `KarouselSources` it is given (see karouselMusic.ts).
 */

/** An artist as the library knows them: the name, and their id where there is one. */
export interface ArtistRef {
  name: string
  id?: string
}

/**
 * Where Karousel finds music. Any of these may come up empty or fail (no
 * connection, a server without Last.fm), and Karousel carries on with the
 * rest. Every song offered must be one that can play right now.
 */
export interface KarouselSources {
  /** Songs like `seed`, by any artist: a station started from it. */
  station(seed: Song): Promise<Song[]>
  /** Artists like `artist` that are in the library. */
  similarArtists(artist: ArtistRef): Promise<ArtistRef[]>
  /** `artist`'s best-known songs in the library. */
  topSongs(artist: ArtistRef, count: number): Promise<Song[]>
  /** The library's songs by any of `artists`. */
  byArtists(artists: ArtistRef[]): Promise<Song[]>
  /** Some of the library's songs in any of `genres`. */
  inGenres(genres: Set<string>, count: number): Promise<Song[]>
  /** What the user plays most and has hearted, most played first. */
  favourites(count: number): Promise<Song[]>
}

export interface KarouselInput {
  /** What has been playing, the song now playing first. */
  seeds: Song[]
  /** Song ids and `karouselKey`s not to play: what is queued and what played lately. */
  exclude?: Set<string>
  count?: number
  /** A source of numbers in [0, 1), for tests that need the same picks every time. */
  random?: () => number
}

/** No more than this many songs by one artist in a batch. */
export const MAX_PER_ARTIST = 2

/** Which pool each pick comes from first: 0 the station, 1 similar artists, 2 the same artists, 3 the library's own. */
const MIX = [0, 1, 0, 2, 0, 1, 3, 0, 1, 2]

const FEATURING = /\s+(?:feat\.?|ft\.?|featuring|with|vs\.?|x)\s+|\s*[,;/&+]\s*/i
const TITLE_NOISE =
  /\s*[([][^)\]]*(?:feat|remaster|version|edit|mono|stereo|explicit|clean|bonus|deluxe)[^)\]]*[)\]]|\s+-\s+[^-]*(?:remaster|version|edit|mono|stereo)[^-]*$/gi
const MARKS = /\p{M}+/gu
const NOT_WORDS = /[^\p{L}\p{N}]+/gu

const isRadio = (song: Song) => Boolean(song.kultrStreamUrl)

/** The first-named artist of a credit like "A feat. B" or "A, B & C". */
export function primaryArtist(artist: string | undefined): string {
  const whole = (artist ?? '').trim()
  return (
    whole
      .split(FEATURING)
      .find((part) => part.trim())
      ?.trim() ?? whole
  )
}

function fold(text: string): string {
  return text.normalize('NFD').replace(MARKS, '').toLowerCase().replace(NOT_WORDS, ' ').trim()
}

/** What artists are compared by: the first-named artist, lower case, without accents or punctuation. */
export function artistKey(artist: string | undefined): string {
  return fold(primaryArtist(artist))
}

/** The same song wherever it appears: on another album, remastered, or credited differently. */
export function karouselKey(song: Song): string {
  return `song:${artistKey(song.artist)}|${fold(song.title.replace(TITLE_NOISE, ''))}`
}

/**
 * Reorders so the same artist doesn't play twice in a row, where another can
 * go between, keeping the order otherwise. Each pick is the earliest song
 * that still leaves the rest a way to be ordered like that: taking simply the
 * earliest other artist can leave two songs by one artist for the end.
 */
export function spread(songs: Song[]): Song[] {
  const left = songs.map((song) => ({ song, artist: artistKey(song.artist) }))
  const counts = new Map<string, number>()
  for (const { artist } of left) counts.set(artist, (counts.get(artist) ?? 0) + 1)

  /** With `artist`'s next song played, can the other `n` still go without a repeat? */
  const leavesAWay = (artist: string, n: number): boolean => {
    counts.set(artist, counts.get(artist)! - 1)
    const most = Math.max(0, ...counts.values())
    // An artist with half of an odd number has to go first, and can't.
    const ok = most <= Math.ceil(n / 2) && !(n % 2 === 1 && counts.get(artist) === (n + 1) / 2)
    counts.set(artist, counts.get(artist)! + 1)
    return ok
  }

  const out: Song[] = []
  let last: string | null = null
  while (left.length) {
    let pick = -1
    let fallback = -1
    for (let i = 0; i < left.length && pick < 0; i++) {
      if (left[i].artist === last) continue
      if (fallback < 0) fallback = i
      if (leavesAWay(left[i].artist, left.length - 1)) pick = i
    }
    const [next] = left.splice(pick >= 0 ? pick : Math.max(0, fallback), 1)
    counts.set(next.artist, counts.get(next.artist)! - 1)
    out.push(next.song)
    last = next.artist
  }
  return out
}

function roundRobin<T>(lists: T[][]): T[] {
  const out: T[] = []
  const longest = Math.max(0, ...lists.map((list) => list.length))
  for (let i = 0; i < longest; i++) {
    for (const list of lists) if (i < list.length) out.push(list[i])
  }
  return out
}

function shuffled<T>(items: T[], random: () => number): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

function distinctBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const k = key(item)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

interface Around {
  same: Song[]
  similar: Song[]
  similarArtists: ArtistRef[]
}

/** Songs to follow what has been playing; empty when there is nothing to go on. */
export async function pickKarousel(
  sources: KarouselSources,
  input: KarouselInput,
  log: (message: string) => void = () => {},
): Promise<Song[]> {
  const count = input.count ?? 10
  const random = input.random ?? Math.random
  const seeds = input.seeds.filter((song) => !isRadio(song) && song.artist?.trim())
  if (!seeds.length || count <= 0) return []

  async function safe<T>(what: string, empty: T, task: () => Promise<T>): Promise<T> {
    try {
      return await task()
    } catch (err) {
      log(`${what} failed: ${(err as Error)?.message ?? err}`)
      return empty
    }
  }

  /** The artist's best-known songs, and songs by artists like them. */
  async function around(artist: ArtistRef, similarArtists: number): Promise<Around> {
    const top = safe(`top songs of ${artist.name}`, [] as Song[], () => sources.topSongs(artist, 6))
    const related = (
      await safe(`artists like ${artist.name}`, [] as ArtistRef[], () => sources.similarArtists(artist))
    )
      .filter((other) => artistKey(other.name) !== artistKey(artist.name))
      .slice(0, 8)
    const chosen = shuffled(related, random).slice(0, similarArtists)
    const theirs = await Promise.all(
      chosen.map(async (other) =>
        shuffled(await safe(`top songs of ${other.name}`, [] as Song[], () => sources.topSongs(other, 5)), random).slice(0, 3),
      ),
    )
    return { same: shuffled(await top, random).slice(0, 3), similar: roundRobin(theirs), similarArtists: related }
  }

  const artists = distinctBy(
    seeds.map((song) => ({ name: primaryArtist(song.artist), id: song.artistId })),
    (artist) => artistKey(artist.name),
  ).slice(0, 3)

  const station = (async () => {
    for (const seed of seeds.slice(0, 2)) {
      const found = await safe(`songs like ${seed.title}`, [] as Song[], () => sources.station(seed))
      if (found.length) return found
    }
    return [] as Song[]
  })()
  const arounds = Promise.all(artists.map((artist, i) => around(artist, i === 0 ? 4 : 2)))

  const fromStation = await station
  const found = await arounds
  const near = distinctBy([...artists, ...found.flatMap((a) => a.similarArtists)], (artist) => artistKey(artist.name))
  const nearKeys = new Set(near.map((artist) => artistKey(artist.name)))
  const theirs = await safe(`songs by ${near.length} artists`, [] as Song[], () => sources.byArtists(near))

  // In order of preference: the station, artists like these, these artists, the library's songs by any of them.
  const pools = [
    fromStation,
    roundRobin(found.map((a) => a.similar)),
    roundRobin(found.map((a) => a.same)),
    shuffled(
      theirs.filter((song) => nearKeys.has(artistKey(song.artist))),
      random,
    ),
  ].map((pool) => [...pool])

  const picked: Song[] = []
  const taken = new Set(input.exclude ?? [])
  const perArtist = new Map<string, number>()
  const take = (pool: Song[]): boolean => {
    while (pool.length) {
      const song = pool.shift()!
      const key = karouselKey(song)
      const artist = artistKey(song.artist)
      if (isRadio(song) || taken.has(song.id) || taken.has(key) || (perArtist.get(artist) ?? 0) >= MAX_PER_ARTIST) {
        continue
      }
      taken.add(song.id)
      taken.add(key)
      perArtist.set(artist, (perArtist.get(artist) ?? 0) + 1)
      picked.push(song)
      return true
    }
    return false
  }

  // Mostly the station, with artists like these, these artists and the library's own mixed in.
  let turn = 0
  while (picked.length < count) {
    const first = MIX[turn++ % MIX.length]
    if (take(pools[first])) continue
    if (!pools.some(take)) break
  }
  // Short of those, the same genres, then what the user plays most. Only
  // asked for now: the second can mean reading the whole library.
  if (picked.length < count) {
    const seedGenres = new Set(
      seeds.map((song) => song.genre?.trim()).filter((genre): genre is string => Boolean(genre)),
    )
    const [genres, favourites] = await Promise.all([
      seedGenres.size
        ? safe(`songs in ${[...seedGenres].join(', ')}`, [] as Song[], () => sources.inGenres(seedGenres, 200))
        : Promise.resolve([] as Song[]),
      safe('favourites', [] as Song[], () => sources.favourites(200)),
    ])
    const backups = [
      shuffled(
        genres.filter((song) => !nearKeys.has(artistKey(song.artist))),
        random,
      ),
      shuffled(favourites.slice(0, 200), random),
    ]
    while (picked.length < count) {
      if (!backups.some(take)) break
    }
  }

  const sourceIds = [fromStation, found.flatMap((a) => a.similar), found.flatMap((a) => a.same)].map(
    (list) => new Set(list.map((song) => song.id)),
  )
  // Each song counted once, under the first of these it came from.
  const counts = [0, 0, 0, 0]
  for (const song of picked) {
    const from = sourceIds.findIndex((ids) => ids.has(song.id))
    counts[from >= 0 ? from : 3]++
  }
  log(
    `${picked.length} songs like ${artists.map((a) => a.name).join(', ')}: ${counts[0]} from the station, ` +
      `${counts[1]} by similar artists, ${counts[2]} by the same artists, ${counts[3]} more from the library`,
  )
  return spread(picked)
}
