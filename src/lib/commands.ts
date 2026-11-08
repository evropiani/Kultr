/**
 * The command bar: words typed into search that Kultr can do rather than
 * look for — "play night drive", "shuffle radiohead", "sleep in 30 minutes",
 * "next", "open settings", "plan an hour". Ported from Kultr for iOS
 * (Commands.swift), phrase for phrase.
 */

export type CommandPlace = 'home' | 'library' | 'settings' | 'listening' | 'recap' | 'stations' | 'crates' | 'downloads' | 'planner' | 'search'

export type KultrCommand =
  | { kind: 'play'; what: string }
  | { kind: 'shuffle'; what: string }
  | { kind: 'shuffleAll' }
  | { kind: 'station'; name: string }
  | { kind: 'sleep'; minutes: number }
  | { kind: 'sleepAfterTrack' }
  | { kind: 'pause' }
  | { kind: 'resume' }
  | { kind: 'next' }
  | { kind: 'previous' }
  | { kind: 'mixNow' }
  | { kind: 'plan'; minutes: number | null }
  | { kind: 'open'; place: CommandPlace }
  | { kind: 'crate'; name: string }
  | { kind: 'playCrate'; name: string }

const SIMPLE: Record<string, KultrCommand> = {}
const simple = (command: KultrCommand, ...phrases: string[]) => {
  for (const phrase of phrases) SIMPLE[phrase] = command
}
simple({ kind: 'pause' }, 'pause', 'stop', 'stop the music', 'be quiet')
simple({ kind: 'resume' }, 'play', 'resume', 'continue', 'go on', 'unpause')
simple({ kind: 'next' }, 'next', 'skip', 'next track', 'next song', 'skip this')
simple({ kind: 'previous' }, 'previous', 'back', 'go back', 'previous track', 'previous song', 'last song')
simple({ kind: 'mixNow' }, 'mix', 'mix now', 'mix it', 'blend', 'mix into the next one')
simple({ kind: 'shuffleAll' }, 'shuffle', 'shuffle all', 'shuffle everything', 'shuffle my library', 'surprise me')
simple(
  { kind: 'sleepAfterTrack' },
  'sleep after this',
  'sleep after this song',
  'sleep after this track',
  'stop after this song',
  'stop after this track',
)

const PLACES: Record<string, CommandPlace> = {
  home: 'home',
  library: 'library',
  settings: 'settings',
  preferences: 'settings',
  listening: 'listening',
  stats: 'listening',
  statistics: 'listening',
  history: 'listening',
  recap: 'recap',
  'monthly recap': 'recap',
  month: 'recap',
  stations: 'stations',
  dial: 'stations',
  crates: 'crates',
  downloads: 'downloads',
  planner: 'planner',
  'energy planner': 'planner',
  search: 'search',
}

const NUMBERS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  five: 5,
  ten: 10,
  fifteen: 15,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  ninety: 90,
}

/** "30", "30 minutes", "half an hour", "an hour", "2 hours", "1h", "90min". */
function minutesIn(input: string[]): number | null {
  const words = [...input]
  if (['in', 'for', 'after'].includes(words[0] ?? '')) words.shift()
  const line = words.join(' ')
  if (line.startsWith('half an hour') || line.startsWith('half hour')) return 30
  if (line.startsWith('an hour and a half') || line.startsWith('one and a half hours')) return 90
  if (line.startsWith('an hour') || line.startsWith('one hour') || line === 'hour') return 60
  const first = words[0]
  if (!first) return null
  const digits = /^\d*/.exec(first)![0]
  const unitInline = first.slice(digits.length)
  const value = digits ? Number(digits) : NUMBERS[first]
  if (value === undefined || !Number.isFinite(value)) return null
  const unit = unitInline || (words.length > 1 ? words[1] : 'min')
  const minutes = unit.startsWith('h') ? value * 60 : value
  return minutes >= 1 && minutes <= 24 * 60 ? minutes : null
}

/**
 * Reads plain words as a command. `stations` and `crates` are their names,
 * so "play night drive" starts the station rather than searching for a song.
 * Null when the words are not a command (then they are a search).
 */
export function parseCommand(text: string, stations: string[] = [], crates: string[] = []): KultrCommand | null {
  const words = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}' ]/gu, ' ')
    .split(' ')
    .filter(Boolean)
  if (!words.length) return null
  const line = words.join(' ')
  const rest = (count: number) => words.slice(count).join(' ')
  const named = (name: string, names: string[]): string | null => {
    const wanted = name.trim()
    if (!wanted) return null
    return (
      names.find((n) => n.toLowerCase() === wanted) ??
      (wanted.length >= 3 ? names.find((n) => n.toLowerCase().startsWith(wanted)) : undefined) ??
      null
    )
  }

  if (SIMPLE[line]) return SIMPLE[line]

  // Sleep in 30 minutes, stop in an hour, timer 45.
  if (['sleep', 'timer', 'stop'].includes(words[0]) || line.startsWith('sleep timer')) {
    const minutes = minutesIn(words.slice(words[0] === 'sleep' && words[1] === 'timer' ? 2 : 1))
    if (minutes) return { kind: 'sleep', minutes }
  }
  // Plan a set, plan an hour, plan 90 minutes.
  if (words[0] === 'plan' || line.startsWith('build a set') || line.startsWith('make a set')) {
    return { kind: 'plan', minutes: minutesIn(words.slice(1)) }
  }
  // Open settings, show my stations, go to listening.
  if (['open', 'show', 'go'].includes(words[0])) {
    const target = words.slice(1)
    if (target[0] === 'to') target.shift()
    if (['my', 'the'].includes(target[0] ?? '')) target.shift()
    const place = target.join(' ')
    if (PLACES[place]) return { kind: 'open', place: PLACES[place] }
    if (target[0] === 'crate') {
      const crate = named(target.slice(1).join(' '), crates)
      if (crate) return { kind: 'crate', name: crate }
    }
    const crate = named(place, crates)
    if (crate) return { kind: 'crate', name: crate }
  }
  if (words[0] === 'crate') {
    const crate = named(rest(1), crates)
    if (crate) return { kind: 'crate', name: crate }
  }
  // Station night drive, tune in to warm up, play the station peak hour.
  if (words[0] === 'station') return { kind: 'station', name: named(rest(1), stations) ?? rest(1) }
  if (words.length > 2 && words[0] === 'tune' && (words[1] === 'in' || words[1] === 'to')) {
    const name = words[1] === 'in' && words.length > 3 && words[2] === 'to' ? rest(3) : rest(2)
    return { kind: 'station', name: named(name, stations) ?? name }
  }
  if (line.startsWith('play the station ')) return { kind: 'station', name: named(rest(3), stations) ?? rest(3) }
  if (words[0] === 'shuffle' && words.length > 1) return { kind: 'shuffle', what: rest(1) }
  if (words[0] === 'play' && words.length > 1) {
    const what = rest(1)
    const station = named(what, stations)
    if (station) return { kind: 'station', name: station }
    const crate = named(what, crates)
    if (crate) return { kind: 'playCrate', name: crate }
    return { kind: 'play', what: what.startsWith('some ') ? what.slice(5) : what }
  }
  return null
}

const PLACE_LABEL: Record<CommandPlace, string> = {
  home: 'Home',
  library: 'Library',
  settings: 'Settings',
  listening: 'Listening',
  recap: 'the monthly recap',
  stations: 'Stations',
  crates: 'Crates',
  downloads: 'Offline',
  planner: 'the energy planner',
  search: 'Search',
}

/** What the command will do, for the row above the search results. */
export function describeCommand(command: KultrCommand): string {
  switch (command.kind) {
    case 'play':
      return `Play “${command.what}”`
    case 'shuffle':
      return `Shuffle “${command.what}”`
    case 'shuffleAll':
      return 'Shuffle your whole library'
    case 'station':
      return `Play the station ${command.name}`
    case 'sleep':
      return `Sleep timer: ${command.minutes} min`
    case 'sleepAfterTrack':
      return 'Stop after this track'
    case 'pause':
      return 'Pause'
    case 'resume':
      return 'Play'
    case 'next':
      return 'Next track'
    case 'previous':
      return 'Previous track'
    case 'mixNow':
      return 'Mix into the next track'
    case 'plan':
      return command.minutes ? `Plan a set of ${command.minutes} min` : 'Plan a set'
    case 'open':
      return `Open ${PLACE_LABEL[command.place]}`
    case 'crate':
      return `Open the crate ${command.name}`
    case 'playCrate':
      return `Play the crate ${command.name}`
  }
}
