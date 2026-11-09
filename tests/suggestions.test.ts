import { artistKey, type ArtistRef, type KarouselSources } from '@/audio/karousel'
import { SUGGESTION_COUNT, suggestSongs, suggestionExclude, suggestionSeeds } from '@/lib/playlistSuggestions'
import type { Song } from '@/api/types'

// Suggested songs under a playlist: the same cases as Kultr for iOS and Android.

let failures = 0
function assert(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`  PASS  ${name} ${detail}`)
  else {
    failures++
    console.log(`  FAIL  ${name} ${detail}`)
  }
}

function seeded(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const song = (artist: string, title: string, id = `${artist}-${title}`): Song => ({ id, title, artist, artistId: `ar-${artist}` })

/**
 * A server whose station for a song is ten songs "like" it, each by its own
 * artist, so a suggestion shows which song it came from.
 */
function sources(library: Song[] = [], favourites: Song[] = []): KarouselSources & { stations: string[] } {
  const stations: string[] = []
  return {
    stations,
    async station(seed: Song) {
      stations.push(seed.id)
      return Array.from({ length: 10 }, (_, i) => song(`${seed.title} artist ${i + 1}`, `Like ${seed.title} ${i + 1}`))
    },
    async similarArtists() {
      return [] as ArtistRef[]
    },
    async topSongs() {
      return [] as Song[]
    },
    async byArtists(artists: ArtistRef[]) {
      const names = new Set(artists.map((a) => artistKey(a.name)))
      return library.filter((s) => names.has(artistKey(s.artist)))
    },
    async inGenres() {
      return [] as Song[]
    },
    async favourites(count: number) {
      return favourites.slice(0, count)
    },
  }
}

const playlist = [
  song('Yll Limani', 'Faaaj'),
  song('Yll Limani', 'Taxi'),
  song('Majk', 'Kcen'),
  song('Era Istrefi', 'Bonbon'),
]

async function main() {
  console.log('\nSeeds')
  const seeds = suggestionSeeds(playlist, null, seeded(1))
  assert('three seeds from the playlist', seeds.length === 3, seeds.map((s) => s.title).join(', '))
  assert('each by a different artist', new Set(seeds.map((s) => s.artist)).size === seeds.length)
  const added = song('Dhurata Dora', 'NRVZ')
  const afterAdd = suggestionSeeds([...playlist, added], added, seeded(1))
  assert('the song just added comes first', afterAdd[0].id === added.id)
  assert('then others from the playlist, not it again', afterAdd.slice(1).every((s) => s.id !== added.id && s.artist !== added.artist))

  console.log('\nExclusions')
  const exclude = suggestionExclude(playlist)
  assert('leaves out the playlist by id', playlist.every((s) => exclude.has(s.id)))
  const elsewhere = { ...song('Majk', 'Kcen (Remastered 2024)'), id: 'other-album' }
  const withRemaster = sources()
  const station = withRemaster.station
  withRemaster.station = async (seed: Song) => [elsewhere, ...(await station(seed))]
  const picks0 = await suggestSongs(withRemaster, { playlist, random: seeded(2) })
  assert('and the same song from another album', !picks0.some((s) => s.id === 'other-album'), picks0.map((s) => s.title).join(', '))

  console.log('\nSuggestions')
  const fake = sources()
  const picks = await suggestSongs(fake, { playlist, random: seeded(3) })
  assert(`${SUGGESTION_COUNT} suggestions`, picks.length === SUGGESTION_COUNT, String(picks.length))
  assert('none already in the playlist', picks.every((s) => !playlist.some((p) => p.id === s.id)))

  const fake2 = sources()
  const more = await suggestSongs(fake2, { playlist: [...playlist, added], added, random: seeded(4) })
  assert('after an add, it starts from the song added', fake2.stations[0] === added.id, fake2.stations.join(', '))
  const likeAdded = more.filter((s) => s.title.startsWith(`Like ${added.title}`)).length
  assert('and most suggestions are like it', likeAdded >= 3, `${likeAdded} of ${more.length}`)

  const refreshed = await suggestSongs(sources(), { playlist, leaveOut: picks, random: seeded(3) })
  assert('Refresh offers different songs', refreshed.length > 0 && refreshed.every((s) => !picks.some((p) => p.id === s.id)))

  console.log('\nAn empty playlist')
  const favourites = [song('Capital T', 'Bongo'), song('Tayna', 'OMG'), song('Lluni', 'Ditari')]
  const fake3 = sources([], favourites)
  const fromFavourites = await suggestSongs(fake3, { playlist: [], random: seeded(5) })
  assert('starts from what is played most', fake3.stations.length > 0 && favourites.some((f) => f.id === fake3.stations[0]), fake3.stations.join(', '))
  assert('and suggests songs', fromFavourites.length === SUGGESTION_COUNT, String(fromFavourites.length))
  const nothing = await suggestSongs(sources(), { playlist: [], random: seeded(6) })
  assert('nothing to go on gives nothing', nothing.length === 0)

  if (failures) {
    console.log(`\n${failures} suggestion test(s) failed.`)
    process.exit(1)
  }
  console.log('\nAll suggestion tests passed.')
}

void main()
