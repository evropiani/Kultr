import type { Song } from '@/api/types'
import { allAlbums, allArtists, allSongs, songsByAlbum, songsByArtist } from '@/db'
import { decadeStations } from '@/audio/stations'
import { usePlayer } from '@/store/player'
import { settings } from '@/store/settings'
import { useToast } from '@/store/ui'
import { describeCommand, parseCommand, type CommandPlace, type KultrCommand } from './commands'
import { crateSongs } from './crates'

/**
 * Runs what the command bar understood. The rules live in commands.ts; this
 * is the part that touches the player, the library and the router.
 */

let decadeNames: string[] = []
/** The decade stations' names, so "play 1990s" finds them; refreshed in the background. */
export function refreshCommandNames(): void {
  void allSongs()
    .then((songs) => {
      decadeNames = decadeStations(songs.map((song) => song.year)).map((station) => station.name)
    })
    .catch(() => {})
}

export function commandFor(text: string): KultrCommand | null {
  const s = settings()
  return parseCommand(text, [...s.stations.map((station) => station.name), ...decadeNames], s.crates.map((crate) => crate.name))
}

export { describeCommand }

const PLACE_ROUTES: Record<CommandPlace, string> = {
  home: '/',
  library: '/albums',
  settings: '/settings',
  listening: '/stats',
  recap: '/recap',
  stations: '/stations',
  crates: '/crates',
  downloads: '/downloads',
  planner: '/planner',
  search: '/search',
}

const shuffled = <T>(items: T[]): T[] => {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** The music `what` names: an artist, then an album, then tracks. */
async function music(what: string): Promise<Song[]> {
  const wanted = what.toLowerCase().trim()
  const [artists, albums] = await Promise.all([allArtists(), allAlbums()])
  const artist = artists.find((a) => a.name.toLowerCase() === wanted)
  if (artist) return songsByArtist(artist.id)
  const album = albums.find((a) => a.name.toLowerCase() === wanted)
  if (album) return songsByAlbum(album.id)
  const songs = (await allSongs()).filter((song) => song.title.toLowerCase().includes(wanted))
  if (songs.length) return songs.slice(0, 100)
  const partialArtist = artists.find((a) => a.name.toLowerCase().includes(wanted))
  if (partialArtist) return songsByArtist(partialArtist.id)
  const partialAlbum = albums.find((a) => a.name.toLowerCase().includes(wanted))
  if (partialAlbum) return songsByAlbum(partialAlbum.id)
  return []
}

export async function runCommand(command: KultrCommand, navigate: (to: string) => void): Promise<void> {
  const player = usePlayer.getState()
  const toast = useToast.getState()
  switch (command.kind) {
    case 'play':
    case 'shuffle': {
      const songs = await music(command.what)
      if (!songs.length) {
        toast.show(`Nothing in your library matches “${command.what}”.`, 'warning')
        return
      }
      await player.playNow(command.kind === 'shuffle' ? shuffled(songs) : songs, 0, command.what)
      return
    }
    case 'shuffleAll': {
      const songs = await allSongs()
      if (!songs.length) return
      await player.playNow(shuffled(songs).slice(0, 200), 0, 'Shuffle all')
      return
    }
    case 'station': {
      const all = [...settings().stations, ...decadeStations((await allSongs()).map((song) => song.year))]
      const station = all.find((entry) => entry.name.toLowerCase() === command.name.toLowerCase())
      if (!station) {
        toast.show(`There’s no station called “${command.name}”. Stations has the list.`, 'warning')
        return
      }
      if (player.station && player.playback === 'playing') await player.switchStation(station)
      else await player.playStation(station)
      return
    }
    case 'sleep':
      player.setSleepTimer(command.minutes)
      toast.show(`Sleep timer: ${command.minutes} minutes.`, 'info')
      return
    case 'sleepAfterTrack':
      player.setSleepTimer(null, true)
      toast.show('Stopping after this track.', 'info')
      return
    case 'pause':
      if (player.playback === 'playing') await player.toggle()
      return
    case 'resume':
      if (player.playback !== 'playing') await player.toggle()
      return
    case 'next':
      await player.next(true)
      return
    case 'previous':
      await player.previous()
      return
    case 'mixNow':
      if (!(await player.mixNow())) toast.show('Nothing to mix into: this is the last track', 'info')
      return
    case 'plan':
      navigate(command.minutes ? `/planner?minutes=${command.minutes}` : '/planner')
      return
    case 'open':
      navigate(PLACE_ROUTES[command.place])
      return
    case 'crate':
    case 'playCrate': {
      const crate = settings().crates.find((entry) => entry.name.toLowerCase() === command.name.toLowerCase())
      if (!crate) return
      if (command.kind === 'crate') {
        navigate(`/crate/${encodeURIComponent(crate.id)}`)
        return
      }
      const songs = await crateSongs(crate)
      if (!songs.length) toast.show(`“${crate.name}” is empty.`, 'info')
      else await player.playNow(songs, 0, crate.name)
      return
    }
  }
}

