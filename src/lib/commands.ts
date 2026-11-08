import { t } from '@/i18n'

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
// English and German, as in Kultr for iOS and Android.
simple({ kind: 'pause' }, 'pause', 'stop', 'stop the music', 'be quiet', 'stopp', 'stopp die musik', 'anhalten', 'ruhe', 'pausieren', 'pausiere')
simple({ kind: 'resume' }, 'play', 'resume', 'continue', 'go on', 'unpause', 'fortsetzen', 'weiterspielen', 'spiel weiter', 'spiele weiter', 'abspielen', 'wiedergeben')
simple(
  { kind: 'next' },
  'next',
  'skip',
  'next track',
  'next song',
  'skip this',
  'weiter',
  'nächster',
  'nächstes',
  'nächster titel',
  'nächstes lied',
  'nächster song',
  'überspringen',
  'skippen',
)
simple(
  { kind: 'previous' },
  'previous',
  'back',
  'go back',
  'previous track',
  'previous song',
  'last song',
  'zurück',
  'vorheriger',
  'vorheriger titel',
  'voriger titel',
  'vorheriges lied',
  'letzter titel',
  'letztes lied',
)
simple({ kind: 'mixNow' }, 'mix', 'mix now', 'mix it', 'blend', 'mix into the next one', 'mischen', 'jetzt mischen', 'mixen', 'jetzt mixen', 'überblenden', 'in den nächsten mischen')
simple(
  { kind: 'shuffleAll' },
  'shuffle',
  'shuffle all',
  'shuffle everything',
  'shuffle my library',
  'surprise me',
  'zufällig',
  'zufall',
  'alles zufällig',
  'zufallswiedergabe',
  'überrasch mich',
  'überrasche mich',
)
simple(
  { kind: 'sleepAfterTrack' },
  'sleep after this',
  'sleep after this song',
  'sleep after this track',
  'stop after this song',
  'stop after this track',
  'nach diesem titel stoppen',
  'nach diesem lied stoppen',
  'stopp nach diesem titel',
  'stopp nach diesem lied',
  'schlafen nach diesem titel',
  'schlafen nach diesem lied',
)

const SLEEP = new Set(['sleep', 'timer', 'stop', 'schlaf', 'schlafe', 'schlafen', 'schlaftimer', 'stopp', 'stoppe'])
const OPEN = new Set(['open', 'show', 'go', 'öffne', 'öffnen', 'zeig', 'zeige', 'geh', 'gehe'])
const CRATE = new Set(['crate', 'kiste'])
const PLAN_LINES = ['build a set', 'make a set', 'set planen', 'ein set planen', 'bau ein set', 'baue ein set']
const STATION_LINES = ['play the station ', 'spiel die station ', 'spiele die station ']
const FILLERS = ['some ', 'etwas von ', 'was von ', 'etwas ', 'was ']

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
  start: 'home',
  startseite: 'home',
  mediathek: 'library',
  bibliothek: 'library',
  einstellungen: 'settings',
  hörstatistik: 'listening',
  statistik: 'listening',
  verlauf: 'listening',
  rückblick: 'recap',
  monatsrückblick: 'recap',
  stationen: 'stations',
  regler: 'stations',
  kisten: 'crates',
  planer: 'planner',
  energieplaner: 'planner',
  suche: 'search',
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
  eins: 1,
  zwei: 2,
  drei: 3,
  fünf: 5,
  zehn: 10,
  fünfzehn: 15,
  zwanzig: 20,
  dreißig: 30,
  vierzig: 40,
  fünfzig: 50,
  sechzig: 60,
  neunzig: 90,
}

/** "30", "30 minutes", "half an hour", "an hour", "2 hours", "1h", "90min"; "eine Stunde", "30 Minuten". */
function minutesIn(input: string[]): number | null {
  const words = [...input]
  if (['in', 'for', 'after', 'nach', 'für'].includes(words[0] ?? '')) words.shift()
  const line = words.join(' ')
  const starts = (...phrases: string[]) => phrases.some((phrase) => line.startsWith(phrase))
  if (starts('half an hour', 'half hour', 'einer halben stunde', 'eine halbe stunde', 'halbe stunde')) return 30
  if (starts('an hour and a half', 'one and a half hours', 'anderthalb stunden', 'eineinhalb stunden')) return 90
  if (starts('an hour', 'one hour', 'einer stunde', 'eine stunde') || line === 'hour' || line === 'stunde') return 60
  const first = words[0]
  if (!first) return null
  const digits = /^\d*/.exec(first)![0]
  const unitInline = first.slice(digits.length)
  const value = digits ? Number(digits) : NUMBERS[first]
  if (value === undefined || !Number.isFinite(value)) return null
  const unit = unitInline || (words.length > 1 ? words[1] : 'min')
  const minutes = unit.startsWith('h') || unit.startsWith('stund') || unit.startsWith('std') ? value * 60 : value
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

  const first = words[0]
  // Sleep in 30 minutes, stop in an hour, timer 45; schlaf in 30 Minuten.
  if (SLEEP.has(first) || line.startsWith('sleep timer')) {
    const minutes = minutesIn(words.slice(line.startsWith('sleep timer') ? 2 : 1))
    if (minutes) return { kind: 'sleep', minutes }
  }
  // Plan a set, plan an hour, plan 90 minutes; plane eine Stunde, Set planen.
  if (['plan', 'plane', 'planen'].includes(first) || PLAN_LINES.some((phrase) => line.startsWith(phrase))) {
    return { kind: 'plan', minutes: minutesIn(words.slice(1)) }
  }
  // Open settings, show my stations, go to listening; öffne Einstellungen, zeig meine Kisten.
  if (OPEN.has(first)) {
    const target = words.slice(1)
    if (['to', 'zu', 'zur', 'zum', 'in', 'ins'].includes(target[0] ?? '')) target.shift()
    if (['my', 'the', 'mein', 'meine', 'meinen', 'die', 'den', 'das', 'der'].includes(target[0] ?? '')) target.shift()
    if (['an', 'auf'].includes(target[target.length - 1] ?? '')) target.pop()
    const place = target.join(' ')
    if (PLACES[place]) return { kind: 'open', place: PLACES[place] }
    if (CRATE.has(target[0] ?? '')) {
      const crate = named(target.slice(1).join(' '), crates)
      if (crate) return { kind: 'crate', name: crate }
    }
    const crate = named(place, crates)
    if (crate) return { kind: 'crate', name: crate }
  }
  if (CRATE.has(first)) {
    const crate = named(rest(1), crates)
    if (crate) return { kind: 'crate', name: crate }
  }
  // Station night drive, tune in to warm up, play the station peak hour; spiele die Station Nachtfahrt.
  if (first === 'station') return { kind: 'station', name: named(rest(1), stations) ?? rest(1) }
  if (words.length > 2 && first === 'tune' && (words[1] === 'in' || words[1] === 'to')) {
    const name = words[1] === 'in' && words.length > 3 && words[2] === 'to' ? rest(3) : rest(2)
    return { kind: 'station', name: named(name, stations) ?? name }
  }
  if (STATION_LINES.some((phrase) => line.startsWith(phrase))) return { kind: 'station', name: named(rest(3), stations) ?? rest(3) }
  if ((first === 'shuffle' || first === 'zufällig') && words.length > 1) return { kind: 'shuffle', what: rest(1) }
  if (['play', 'spiel', 'spiele'].includes(first) && words.length > 1) {
    let what = rest(1)
    // "spiele Radiohead ab"
    if (first !== 'play' && what.endsWith(' ab')) what = what.slice(0, -3)
    const station = named(what, stations)
    if (station) return { kind: 'station', name: station }
    const crate = named(what, crates)
    if (crate) return { kind: 'playCrate', name: crate }
    const filler = FILLERS.find((prefix) => what.startsWith(prefix) && what.length > prefix.length)
    return { kind: 'play', what: filler ? what.slice(filler.length) : what }
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
      return t('Play “%@”', command.what)
    case 'shuffle':
      return t('Shuffle “%@”', command.what)
    case 'shuffleAll':
      return t('Shuffle your whole library')
    case 'station':
      return t('Play the station %@', command.name)
    case 'sleep':
      return t('Sleep timer: %@ min', command.minutes)
    case 'sleepAfterTrack':
      return t('Stop after this track')
    case 'pause':
      return t('Pause')
    case 'resume':
      return t('Play')
    case 'next':
      return t('Next track')
    case 'previous':
      return t('Previous track')
    case 'mixNow':
      return t('Mix into the next track')
    case 'plan':
      return command.minutes ? t('Plan a set of %@ min', command.minutes) : t('Plan a set')
    case 'open':
      return t('Open %@', t(PLACE_LABEL[command.place]))
    case 'crate':
      return t('Open the crate %@', command.name)
    case 'playCrate':
      return t('Play the crate %@', command.name)
  }
}
