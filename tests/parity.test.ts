import type { Song } from '@/api/types'
import type { TrackAnalysis } from '@/audio/analysis'
import { CURVES, curve, planSet, valueAt } from '@/audio/energyPlan'
import { decade, decadeStations, matches, readStation, STATION_PRESETS, stationPicks, summary, type Station } from '@/audio/stations'
import { parseCommand } from '@/lib/commands'
import { monthRecap, recapMonths, UTC } from '@/lib/recap'
import { isNewer, parseChangelog, releasesSince } from '@/lib/changelog'
import { addTag, albumKey, artistKey, crateContents, readCrates, removeTag, tagCounts, toggleIn, type Annotation, type Crate } from '@/lib/collection'
import { addedSinceDay, calmestFirst, calmness } from '@/audio/stations'
import { readStyle, renderTemplate, styleFrom, styleLink, styleMatches, stylePatch, studioPresets } from '@/lib/studio'
import { widgetRows, type HomeWidget } from '@/lib/widgets'

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
assert('spiele Nachtfahrt', eq(cmd('spiele Nachtfahrt', ['Nachtfahrt']), { kind: 'station', name: 'Nachtfahrt' }))
assert('zufällig and an artist', eq(cmd('zufällig Daft Punk'), { kind: 'shuffle', what: 'daft punk' }))
assert('schlaf in 30 Minuten', eq(cmd('schlaf in 30 Minuten'), { kind: 'sleep', minutes: 30 }))
assert('stopp in einer Stunde', eq(cmd('stopp in einer Stunde'), { kind: 'sleep', minutes: 60 }))
assert('schlaftimer 2 Stunden', eq(cmd('schlaftimer 2 Stunden'), { kind: 'sleep', minutes: 120 }))
assert('nach diesem Titel stoppen', eq(cmd('nach diesem Titel stoppen'), { kind: 'sleepAfterTrack' }))
assert('weiter, zurück, jetzt mischen', eq([cmd('weiter'), cmd('zurück'), cmd('jetzt mischen')], [{ kind: 'next' }, { kind: 'previous' }, { kind: 'mixNow' }]))
assert('öffne Einstellungen', eq(cmd('öffne Einstellungen'), { kind: 'open', place: 'settings' }))
assert('zeig meine Kisten', eq(cmd('zeig meine Kisten'), { kind: 'open', place: 'crates' }))
assert('plane eine Stunde', eq(cmd('plane eine Stunde'), { kind: 'plan', minutes: 60 }))
assert('spiele Radiohead ab', eq(cmd('spiele Radiohead ab'), { kind: 'play', what: 'radiohead' }))
assert('spiele etwas von Bach', eq(cmd('spiele etwas von Bach'), { kind: 'play', what: 'bach' }))
assert('a name alone is a search', cmd('radiohead') === null)
assert('so is a word', cmd('love') === null)

console.log('\n== A month recap counts one month ==')
const play = (songId: string, at: string, seconds: number) => ({ songId, playedAt: Date.parse(at), seconds, completed: true, source: '' })
const recapSongs = new Map<string, Song>([
  ['a', song('a', { album: 'One', artist: 'Ann', albumId: 'al1', artistId: 'ar1' })],
  ['b', song('b', { album: 'One', artist: 'Ann', albumId: 'al1', artistId: 'ar1' })],
  ['c', song('c', { album: 'Two', artist: 'Bo', albumId: 'al2', artistId: 'ar2' })],
])
const history = [
  play('a', '2026-09-20T10:00:00Z', 100),
  play('a', '2026-10-01T09:00:00Z', 200),
  play('a', '2026-10-03T09:00:00Z', 200),
  play('b', '2026-10-03T12:00:00Z', 180),
  play('c', '2026-10-15T12:00:00Z', 240),
  play('gone', '2026-10-16T12:00:00Z', 60),
  play('c', '2026-11-01T00:00:00Z', 240),
]
assert('months with listening, newest first', eq(recapMonths(history, UTC).map((ms) => new Date(ms).toISOString()), ['2026-11-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z']))
const october = monthRecap(history, recapSongs, Date.parse('2026-10-20T00:00:00Z'), UTC)
assert('plays', october.plays === 5)
assert('time', october.seconds === 880)
assert('tracks', october.tracks === 4)
assert('artists', october.artists === 2)
assert('top songs', eq(october.topSongs.map((e) => e.item.id), ['a', 'c', 'b']) && october.topSongs[0].plays === 2)
assert('top artists', eq(october.topArtists.map((e) => e.item.name), ['Ann', 'Bo']))
assert('top albums', eq(october.topAlbums.map((e) => e.item.id), ['al1', 'al2']))
assert('busiest day', october.busiestDay?.seconds === 380)
assert('first listens', october.firstListens === 3)
assert('the month before', october.previousSeconds === 100)
assert('an empty month', monthRecap(history, recapSongs, 0, UTC).plays === 0)

console.log('\n== The changelog, for What’s new ==')
const log = parseChangelog(`# Changelog

Intro.

---

## 1.11.0 — 2026-11-08

### 2026-11-08 17:12 — Stations, and more

Body **one**.

- a
  wrapped

## 1.10.0 — 2026-11-08

### 2026-11-08 16:50 — Kultr for Windows and Linux

Body two.
`)
assert('versions', eq(log.map((r) => r.version), ['1.11.0', '1.10.0']))
assert('entry title and time', log[0].entries[0].title === 'Stations, and more' && log[0].entries[0].when === '2026-11-08 17:12', JSON.stringify(log[0].entries[0]))
assert('entry body', log[0].entries[0].body.startsWith('Body **one**.') && log[0].entries[0].body.includes('wrapped'))
assert('newer', isNewer('1.11.0', '1.9.9') && !isNewer('1.9.9', '1.11.0') && !isNewer('1.10.0', '1.10.0'))
assert('since the last seen', eq(releasesSince(log, '1.10.0', '1.11.0').map((r) => r.version), ['1.11.0']))

console.log('\n== Tags, crates and their rules ==')
let note: Annotation = { note: '', tags: [] }
note = addTag(note, 'Gym')
note = addTag(note, ' gym ')
note = addTag(note, 'Road trip')
assert('tags without duplicates', eq(note.tags, ['Gym', 'Road trip']))
note = removeTag(note, 'GYM')
assert('removing ignores case', eq(note.tags, ['Road trip']))
const notes: Record<string, Annotation> = { [albumKey('al1')]: { note: '', tags: ['Gym'] }, [artistKey('ar2')]: { note: 'Loud', tags: ['gym', 'Night'] } }
assert('tag counts', tagCounts(notes)[0].tag.toLowerCase() === 'gym' && tagCounts(notes)[0].count === 2)
assert('added since', addedSinceDay(30, Date.parse('2026-11-02T00:00:00Z')) === '2026-10-03')
assert('rules summary', summary({ id: 'y', name: 'Year', icon: '', minRating: 4, addedDays: 365 }) === '4★ and up · added this year')
let crate: Crate = { id: 'c', name: 'Gym', icon: '', albums: [], artists: [], songs: [] }
crate = { ...crate, albums: toggleIn(crate.albums, 'al1') }
crate = { ...crate, songs: toggleIn(toggleIn(toggleIn(crate.songs, 's1'), 's2'), 's1') }
assert('crate contents', crateContents(crate) === '1 album · 1 track' && crate.songs.includes('s2'))
const oldCrate = readCrates([{ id: 'c', name: 'Old' }])![0]
assert('a crate from another app', eq(oldCrate.albums, []) && !oldCrate.rules)

console.log('\n== Calmest first, for winding down ==')
const loud = analysis('loud', 128, { energy: 0.9 })
const quiet = analysis('quiet', 80, { energy: 0.2 })
assert('quiet is calmer', calmness(quiet) < calmness(loud) && calmness(null) === 0.5)
const table: Record<string, TrackAnalysis> = { loud, quiet }
assert('unknown in the middle', eq(calmestFirst([song('loud'), song('unknown'), song('quiet')], (s) => table[s.id]).map((s) => s.id), ['quiet', 'unknown', 'loud']))

console.log('\n== Studio templates, styles and widgets ==')
const values = { year: '2019', genre: '', format: 'FLAC', bitrate: '1024' }
assert('a template with a condition', renderTemplate('{year}{?genre: · {genre}} · {format}{?bitrate: · {bitrate} kbps}', values) === '2019 · FLAC · 1024 kbps')
assert('an empty condition', renderTemplate('{?genre:only {genre}}', values) === '')
assert('unknown names are empty', renderTemplate('plain {unknown}text', values) === 'plain text')
assert('an open brace stays', renderTemplate('open {brace', values) === 'open {brace')
const defaults = { theme: 'system', nightMode: false, accentMode: 'fixed', accent: '#ff7a3d', corners: 'soft', gridSize: 'medium', compactRows: false, playhead: 'minimal', backdropArtwork: false, clearGlass: false, playerBlocks: ['artwork', 'title', 'facts', 'progress', 'transport'], factsTemplate: '' } as const
const presets = studioPresets(defaults as never)
const consoleStyle = presets.find((p) => p.name === 'Console')!
const applied = { ...defaults, ...stylePatch(consoleStyle) }
assert('Console applied', applied.corners === 'sharp' && applied.playerBlocks![0] === 'title')
assert('it matches once applied', styleMatches(consoleStyle, applied as never) && !styleMatches(consoleStyle, defaults as never))
assert('a link round trip', eq(readStyle(styleLink(consoleStyle), styleFrom(defaults as never)), consoleStyle))
const fromFile = readStyle('{"name":"Mine","corners":"round"}', styleFrom(defaults as never))
assert('a file fills in the rest', fromFile?.corners === 'round' && eq(fromFile?.playerBlocks, defaults.playerBlocks))
assert('not a style', readStyle('kultr://style/not-base64!', styleFrom(defaults as never)) === null)
const w = (kind: HomeWidget['kind'], size: HomeWidget['size']): HomeWidget => ({ id: kind, kind, size })
assert('widget rows', eq(widgetRows([w('listening', 'small'), w('nowPlaying', 'medium'), w('nextMix', 'small'), w('station', 'small'), w('crate', 'small')]), [[0], [1], [2, 3], [4]]))

if (failures) {
  console.log(`\n${failures} failure(s)`)
  process.exit(1)
}
console.log('\nAll parity tests passed.')
