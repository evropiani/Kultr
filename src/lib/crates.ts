import type { Song } from '@/api/types'
import { getSongs, songsByAlbum, songsByArtist } from '@/db'
import type { Crate } from './collection'
import { stationPool } from './stationLibrary'

/**
 * The songs in a crate: what its rules match, or the albums, artists and
 * tracks put in it by hand, in that order, each song once.
 */
export async function crateSongs(crate: Crate): Promise<Song[]> {
  if (crate.rules) return (await stationPool(crate.rules, { playableOnly: false })).map(([song]) => song)
  const seen = new Set<string>()
  const out: Song[] = []
  const add = (songs: Song[]) => {
    for (const song of songs) {
      if (seen.has(song.id)) continue
      seen.add(song.id)
      out.push(song)
    }
  }
  for (const id of crate.albums) add(await songsByAlbum(id))
  for (const id of crate.artists) add(await songsByArtist(id))
  add(await getSongs(crate.songs))
  return out
}
