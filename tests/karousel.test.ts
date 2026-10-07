import {
  MAX_PER_ARTIST,
  artistKey,
  karouselKey,
  pickKarousel,
  spread,
  type ArtistRef,
  type KarouselSources,
} from '@/audio/karousel'
import type { Song } from '@/api/types'

// The same cases as Kultr for Android's KarouselTest, so the apps pick alike.

let failures = 0
function assert(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`  PASS  ${name} ${detail}`)
  else {
    failures++
    console.log(`  FAIL  ${name} ${detail}`)
  }
}

/** A seeded source of numbers in [0, 1), so every run picks the same songs. */
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

const song = (artist: string, title: string, genre?: string, id = `${artist}-${title}`): Song => ({
  id,
  title,
  artist,
  artistId: `ar-${artist}`,
  genre,
})

/** A server with Last.fm: similar songs, similar artists and their best-known songs. */
function server(offline = false, library: Song[] = []): KarouselSources {
  const station: Song[] = [
    ...Array.from({ length: 12 }, (_, i) => ({
      id: `st-${i + 1}`,
      title: `Station song ${i + 1}`,
      artist: ['Phoenix', 'Air', 'Justice', 'Daft Punk'][(i + 1) % 4],
    })),
    { id: 'st-omt', title: 'One More Time (Remastered 2021)', artist: 'Daft Punk' },
  ]
  const online = () => {
    if (offline) throw new Error('offline')
  }
  return {
    async station() {
      online()
      return station
    },
    async similarArtists(artist: ArtistRef) {
      online()
      return artist.name === 'Daft Punk'
        ? ['Justice', 'Cassius', 'Air'].map((name) => ({ name, id: `ar-${name}` }))
        : []
    },
    async topSongs(artist: ArtistRef, count: number) {
      online()
      return Array.from({ length: 6 }, (_, i) => ({
        id: `top-${artist.name}-${i + 1}`,
        title: `${artist.name} hit ${i + 1}`,
        artist: artist.name,
      })).slice(0, count)
    },
    async byArtists(artists: ArtistRef[]) {
      const names = new Set(artists.map((a) => artistKey(a.name)))
      return library.filter((s) => names.has(artistKey(s.artist)))
    },
    async inGenres(genres: Set<string>, count: number) {
      return library.filter((s) => s.genre && genres.has(s.genre)).slice(0, count)
    },
    async favourites(count: number) {
      return library.slice(0, count)
    },
  }
}

const playing = song('Daft Punk', 'One More Time')

async function main() {
  console.log('\n== Keeps the music going with music like what is playing ==')
  let next = await pickKarousel(server(), {
    seeds: [playing],
    exclude: new Set(['st-1', playing.id, karouselKey(playing)]),
    count: 10,
    random: seeded(7),
  })
  assert('ten songs', next.length === 10, `-> ${next.length}`)
  assert('no song twice', new Set(next.map((s) => s.id)).size === next.length)
  assert('what is queued is not picked again', !next.some((s) => s.id === 'st-1'))
  assert('nor the same song remastered', !next.some((s) => s.title.startsWith('One More Time')))
  assert('mostly the station', next.filter((s) => s.id.startsWith('st-')).length >= 4)
  assert('songs by similar artists', next.some((s) => s.id.startsWith('top-') && s.artist !== 'Daft Punk'))
  assert('and by the artist playing', next.some((s) => s.id.startsWith('top-Daft Punk')))
  const perArtist = new Map<string, number>()
  for (const s of next) perArtist.set(s.artist!, (perArtist.get(s.artist!) ?? 0) + 1)
  assert(`at most ${MAX_PER_ARTIST} by one artist`, [...perArtist.values()].every((n) => n <= MAX_PER_ARTIST))
  assert('never the same artist twice in a row', next.every((s, i) => i === 0 || s.artist !== next[i - 1].artist))

  console.log('\n== With no connection it carries on with the library ==')
  const library = [
    song('Daft Punk', 'Aerodynamic'),
    song('Massive Attack', 'Teardrop', 'Trip Hop'),
    song('Portishead', 'Roads', 'Trip Hop'),
    song('Air', 'Sexy Boy'),
    song('Massive Attack', 'Angel', 'Trip Hop'),
    song('Massive Attack', 'Unfinished Sympathy', 'Trip Hop'),
  ]
  const seed = song('Massive Attack', 'Angel', 'Trip Hop')
  next = await pickKarousel(server(true, library), {
    seeds: [seed],
    exclude: new Set([seed.id]),
    count: 4,
    random: seeded(1),
  })
  assert('four songs', next.length === 4, `-> ${next.map((s) => s.title).join(', ')}`)
  const sameArtist = new Set(next.filter((s) => s.artist === 'Massive Attack').map((s) => s.title))
  assert(
    'the same artist first, no more than two',
    sameArtist.size === 2 && sameArtist.has('Teardrop') && sameArtist.has('Unfinished Sympathy'),
  )
  assert('then the same genre', next.some((s) => s.title === 'Roads'))
  assert('not what is playing', !next.some((s) => s.title === 'Angel'))

  console.log('\n== Nothing to go on means nothing added ==')
  const offline = server(true)
  assert('offline with an empty library', (await pickKarousel(offline, { seeds: [playing] })).length === 0)
  assert('no seeds', (await pickKarousel(offline, { seeds: [] })).length === 0)
  assert(
    'internet radio has nothing to be like',
    (await pickKarousel(server(), { seeds: [{ id: 'r', title: 'FM', kultrStreamUrl: 'https://radio' }] })).length === 0,
  )

  console.log('\n== Songs are known by their first artist and title ==')
  assert('feat.', artistKey('Daft Punk feat. Pharrell Williams') === 'daft punk')
  assert('accents and a second artist', artistKey('Beyoncé, JAY-Z') === 'beyonce', `-> ${artistKey('Beyoncé, JAY-Z')}`)
  assert(
    'a radio edit by "A ft. B" is the same song',
    karouselKey(song('Daft Punk', 'Get Lucky')) === karouselKey(song('Daft Punk ft. Pharrell', 'Get Lucky (Radio Edit)')),
  )
  assert(
    'a remaster is the same song',
    karouselKey(song('Queen', 'Bohemian Rhapsody')) === karouselKey(song('Queen', 'Bohemian Rhapsody - Remastered 2011')),
  )
  assert(
    'another title is not',
    karouselKey(song('Queen', 'Bohemian Rhapsody')) !== karouselKey(song('Queen', 'Somebody to Love')),
  )

  console.log('\n== Spread keeps an artist from playing twice in a row ==')
  const spreadOut = spread([song('A', '1'), song('A', '2'), song('B', '1'), song('C', '1')])
  assert('nobody twice in a row', spreadOut.every((s, i) => i === 0 || s.artist !== spreadOut[i - 1].artist))
  assert('nothing lost', spreadOut.length === 4)
  // Taking the earliest other artist each time would play A and be left with B, B.
  const cornered = spread([song('A', '1'), song('B', '1'), song('B', '2')])
  assert('looks ahead', cornered.map((s) => s.artist).join('') === 'BAB', `-> ${cornered.map((s) => s.artist).join('')}`)
  const kept = spread([song('A', '1'), song('B', '1'), song('A', '2'), song('C', '1')])
  assert('keeps the order where it can', kept.map((s) => s.title + s.artist).join(' ') === '1A 1B 2A 1C')
  const onlyOne = spread([song('A', '1'), song('A', '2')])
  assert('one artist only: nothing to put between', onlyOne.length === 2)

  // Every seed, not just one: no artist twice in a row in any batch.
  let repeats = 0
  for (let seed = 1; seed <= 300; seed++) {
    const batch = await pickKarousel(server(), {
      seeds: [playing],
      exclude: new Set([playing.id, karouselKey(playing)]),
      count: 10,
      random: seeded(seed),
    })
    if (batch.some((s, i) => i > 0 && artistKey(s.artist) === artistKey(batch[i - 1].artist))) repeats++
  }
  assert('no repeats across 300 random batches', repeats === 0, `-> ${repeats} with a repeat`)

  if (failures) {
    console.log(`\n${failures} failure(s)`)
    process.exit(1)
  }
  console.log('\nAll Karousel tests passed.')
}

void main()
