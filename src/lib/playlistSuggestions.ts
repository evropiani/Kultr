import type { Song } from '@/api/types'
import { artistKey, karouselKey, pickKarousel, type KarouselSources } from '@/audio/karousel'

/**
 * Suggested songs under a playlist, as on Spotify: a few songs that would
 * fit, each with a + to add it. Add one and the next suggestions are songs
 * like the one just added. They come from Karousel's picker, so the server's
 * similar songs and artists lead when it has them, and the library carries
 * on when it does not. The same rules as Kultr for iOS and Android.
 */

/** How many suggestions show at a time. */
export const SUGGESTION_COUNT = 5

/** Songs from the playlist, or a favourite, that suggestions start from. */
const SEEDS = 3

function shuffled<T>(items: T[], random: () => number): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * What suggestions are drawn from: the song just added first, so what comes
 * next is like it, then songs from the playlist by other artists, picked at
 * random so that refreshing gives something new.
 */
export function suggestionSeeds(playlist: Song[], added: Song | null, random: () => number = Math.random): Song[] {
  const seeds: Song[] = []
  const artists = new Set<string>()
  const push = (song: Song) => {
    const artist = artistKey(song.artist)
    if (!artist || artists.has(artist)) return
    artists.add(artist)
    seeds.push(song)
  }
  if (added) push(added)
  for (const song of shuffled(playlist, random)) {
    if (seeds.length >= SEEDS) break
    if (song.id !== added?.id) push(song)
  }
  return seeds
}

/** Ids and keys of what not to suggest: the playlist (the same song on another album too), and anything shown already. */
export function suggestionExclude(playlist: Song[], leaveOut: Song[] = []): Set<string> {
  const out = new Set<string>()
  for (const song of [...playlist, ...leaveOut]) {
    out.add(song.id)
    out.add(karouselKey(song))
  }
  return out
}

export interface SuggestionInput {
  /** The playlist's songs as they are now, the one just added included. */
  playlist: Song[]
  /** The song just added from the suggestions, if any. */
  added?: Song | null
  /** Songs not to offer again, such as the ones showing when Refresh is pressed. */
  leaveOut?: Song[]
  count?: number
  random?: () => number
}

/**
 * Songs to suggest for a playlist. An empty playlist starts from what the
 * user plays most and has hearted.
 */
export async function suggestSongs(sources: KarouselSources, input: SuggestionInput): Promise<Song[]> {
  const random = input.random ?? Math.random
  const count = input.count ?? SUGGESTION_COUNT
  let seeds = suggestionSeeds(input.playlist, input.added ?? null, random)
  if (!seeds.length) {
    const favourites = await sources.favourites(40).catch(() => [] as Song[])
    seeds = suggestionSeeds(favourites.slice(0, 40), null, random)
  }
  if (!seeds.length || count <= 0) return []
  return pickKarousel(sources, {
    seeds,
    exclude: suggestionExclude(input.playlist, input.leaveOut),
    count,
    random,
  })
}
