import type { Song } from '@/api/types'
import type { TrackAnalysis } from '@/audio/analysis'
import { CURVES, curve, planSet, valueAt } from '@/audio/energyPlan'
import { decade, decadeStations, matches, readStation, STATION_PRESETS, stationPicks, summary, type Station } from '@/audio/stations'
import { parseCommand } from '@/lib/commands'

// Kultr for iOS's tests for stations, the energy planner and the command
// bar (CoreTests.swift), ported, so the apps agree.

let failures = 0
function assert(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`  PASS  ${name} ${detail}`)
  else {
    failures++
    console.log(`  FAIL  ${name} ${detail}`)
  }
}
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

const song = (id: string, o: Partial<Song> = {}): Song => ({ id, title: id, ...o }) as Song
function analysis(id: string, bpm: number, o: Partial<TrackAnalysis> = {}): TrackAnalysis {
  return {
    songId: id,
    version: 4,
    analysedAt: 0,
    bpmSource: 'dsp',
    duration: 240,
    bpm,
    bpmConfidence: 0.8,
    beatOffset: 0,
    downbeatOffset: 0,
    outroDownbeat: 0,
    key: 9,
    keyName: 'Am',
    mode: 'minor',
    keyConfidence: 0.5,
    camelot: '8A',
    energy: 0.5,
    brightness: 0.3,
    peak: 0.9,
    introEnd: 0,
    outroStart: 200,
    ...o,
  }
}

console.log('\n== Stations match their rules ==')
const drive = STATION_PRESETS.find((s) => s.id === 'night-drive')!
assert('fits Night Drive', matches(drive, song('a'), analysis('a', 100, { energy: 0.5 })))
assert('too fast for it', !matches(drive, song('b'), analysis('b', 128, { energy: 0.5 })))
assert('energy needs analysis', !matches(drive, song('c'), null))
const tempoOnly: Station = { id: 't', name: 'Tempo only', icon: '', bpm: { min: 90, max: 110 } }
assert('a tempo tag is enough', matches(tempoOnly, song('d', { bpm: 100 }), null))
const nineties = decade(1990)
assert('1994 is in the 1990s', matches(nineties, song('e', { year: 1994 }), null))
assert('2001 is not', !matches(nineties, song('f', { year: 2001 }), null))
const rock: Station = { id: 'r', name: 'Rock', icon: '', genres: ['Rock'] }
assert('Indie Rock is rock', matches(rock, song('g', { genre: 'Indie Rock' }), null))
assert('Jazz is not', !matches(rock, song('h', { genre: 'Jazz' }), null))
assert('played is not unplayed', !matches({ id: 'n', name: 'New', icon: '', unplayed: true }, song('i', { playCount: 3 }), null))
assert('radio never fits', !matches({ id: 'all', name: 'All', icon: '' }, song('radio', { kultrStreamUrl: 'http://x' }), null))
assert('summary', summary(drive) === '88–112 BPM · energy 4–7', `-> ${summary(drive)}`)
assert('whole library', summary({ id: 'x', name: 'All', icon: '' }) === 'Your whole library')
assert('open-ended summary', summary(STATION_PRESETS.find((s) => s.id === 'peak-hour')!) === '120–135 BPM · energy 8 and up')
assert('decades with enough music', eq(decadeStations([...Array(25).fill(1995), 2004, 2005]).map((s) => s.name), ['1990s']))
const tagged: Station = { id: 'tg', name: 'Tagged', icon: '', tags: ['gym'] }
assert('tags: album tagged', matches(tagged, song('j', { albumId: 'al1' }), null, new Set(['al1'])))
assert('tags: not tagged', !matches(tagged, song('k', { albumId: 'al2' }), null, new Set(['al1'])))
const recent: Station = { id: 'nw', name: 'New', icon: '', addedDays: 30 }
assert('added lately', matches(recent, song('l', { created: '2026-11-01T10:00:00Z' }), null, new Set(), '2026-10-09'))
assert('added long ago', !matches(recent, song('m', { created: '2025-01-01T10:00:00Z' }), null, new Set(), '2026-10-09'))

const decoded = readStation(JSON.parse('{"id":"x","name":"Old","bpm":{"min":100}}'))
assert('reads a station from another app', decoded?.bpm?.min === 100 && !decoded.unplayed && decoded.bpm.max === undefined)
assert('junk is no station', readStation('nope') === null)

console.log('\n== Station picks skip what played until nothing is left ==')
const pool: [Song, TrackAnalysis | null][] = [
  [song('a'), null],
  [song('b'), null],
]
assert('leaves out what played', eq(stationPicks(pool, null, new Set(['a']), new Set(), 5).map((s) => s.id), ['b']))
assert('starts over, but not with what is queued', eq(stationPicks(pool, null, new Set(['a', 'b']), new Set(['b']), 5).map((s) => s.id), ['a']))

console.log('\n== The energy plan follows the line ==')
const candidates: [Song, TrackAnalysis][] = Array.from({ length: 20 }, (_, i) => [song(`t${i}`, { artistId: `ar${i}` }), analysis(`t${i}`, 120, { energy: i / 20 })])
const build = CURVES.find((c) => c.id === 'build')!.points
const set = planSet(build, 40, candidates)
assert('enough tracks for 40 minutes', set.length >= 9, `-> ${set.length}`)
assert('calm to peak', set[0].energy < set[set.length - 1].energy)
assert('no track twice', new Set(set.map((t) => t.song.id)).size === set.length)
assert('halfway up the build', Math.abs(valueAt(build, 0.5) - 0.625) < 0.001)
assert('one point is no curve', eq(curve([0.2]), [0.5, 0.5]))
assert('starts at zero', set[0].startsAt === 0 && set[1].startsAt === 232)

console.log('\n== Commands from plain words ==')
const stations = ['Night Drive', 'Warm Up']
const cmd = (text: string, s: string[] = [], c: string[] = []) => parseCommand(text, s, c)
assert('play a station', eq(cmd('Play Night Drive', stations), { kind: 'station', name: 'Night Drive' }))
assert('play an artist', eq(cmd('play radiohead'), { kind: 'play', what: 'radiohead' }))
assert('shuffle an artist', eq(cmd('Shuffle Daft Punk!'), { kind: 'shuffle', what: 'daft punk' }))
assert('sleep in 30 minutes', eq(cmd('sleep in 30 minutes'), { kind: 'sleep', minutes: 30 }))
assert('stop in an hour', eq(cmd('stop in an hour'), { kind: 'sleep', minutes: 60 }))
assert('timer 1h', eq(cmd('timer 1h'), { kind: 'sleep', minutes: 60 }))
assert('sleep timer 45', eq(cmd('sleep timer 45'), { kind: 'sleep', minutes: 45 }))
assert('sleep after this song', eq(cmd('sleep after this song'), { kind: 'sleepAfterTrack' }))
assert('next', eq(cmd('next'), { kind: 'next' }))
assert('shuffle all', eq(cmd('Shuffle all'), { kind: 'shuffleAll' }))
assert('pause', eq(cmd('pause'), { kind: 'pause' }))
assert('open settings', eq(cmd('open settings'), { kind: 'open', place: 'settings' }))
assert('show my stations', eq(cmd('show my stations'), { kind: 'open', place: 'stations' }))
assert('plan an hour', eq(cmd('plan an hour'), { kind: 'plan', minutes: 60 }))
assert('plan a set', eq(cmd('plan a set'), { kind: 'plan', minutes: null }))
assert('tune in to warm up', eq(cmd('tune in to warm up', stations), { kind: 'station', name: 'Warm Up' }))
assert('open a crate', eq(cmd('open gym', [], ['Gym']), { kind: 'crate', name: 'Gym' }))
assert('play a crate', eq(cmd('play gym', [], ['Gym']), { kind: 'playCrate', name: 'Gym' }))
assert('a name alone is a search', cmd('radiohead') === null)
assert('so is a word', cmd('love') === null)

if (failures) {
  console.log(`\n${failures} failure(s)`)
  process.exit(1)
}
console.log('\nAll parity tests passed.')
