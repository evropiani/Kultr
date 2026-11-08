import type { Album, Artist, Genre, Song } from '@/api/types'
import { md5 } from '@/lib/md5'

/**
 * One audio file found in a music folder, with what its tags say. Everything
 * from the tags is optional: untagged files still get a title from their file
 * name and an album from their folder.
 */
export interface LocalTrack {
  /** Where the file is: the folder's id and the path inside it. Also what identifies it. */
  path: string
  fileName: string
  /** The directory the file is in (folder id and sub-path), and that directory's name. */
  folderKey: string
  folderName: string
  /** Last modified, in milliseconds since the epoch. */
  modified: number
  size: number
  title?: string
  artist?: string
  albumArtist?: string
  album?: string
  track?: number
  disc?: number
  year?: number
  genre?: string
  durationMs?: number
  /** Bits per second. */
  bitRate?: number
  sampleRate?: number
  mimeType?: string
  lyrics?: string
  /** The cover found for this file: a picture inside it or one beside it. */
  coverId?: string
}

/** What a server would know about a song that its file cannot say. */
export interface LocalUserData {
  playCount?: number
  played?: string
  starred?: string
  userRating?: number
}

/** A local library in the shapes the rest of Kultr knows from a server. */
export interface LocalCatalog {
  songs: Song[]
  albums: Album[]
  artists: Artist[]
  genres: Genre[]
}

export const SONG_PREFIX = 'local:'
export const ALBUM_PREFIX = 'local-album:'
export const ARTIST_PREFIX = 'local-artist:'
const UNKNOWN_ARTIST = 'Unknown artist'
const VARIOUS_ARTISTS = 'Various artists'

export const isLocalId = (id: string | undefined) => Boolean(id?.startsWith('local'))

export const songId = (path: string) => SONG_PREFIX + md5(path).slice(0, 24)

export const artistId = (name: string) => ARTIST_PREFIX + md5(name.trim().toLowerCase()).slice(0, 16)

/** The album a track belongs to: by name and album artist when the file names one, otherwise by name within its folder. */
export function albumId(albumName: string, albumArtist: string | undefined, folderKey: string): string {
  const key = albumArtist
    ? `a|${albumName.toLowerCase()}|${albumArtist.toLowerCase()}`
    : `f|${albumName.toLowerCase()}|${folderKey}`
  return ALBUM_PREFIX + md5(key).slice(0, 16)
}

function clean(text: string | undefined): string | undefined {
  const trimmed = text?.trim()
  return trimmed ? trimmed : undefined
}

export const albumNameOf = (track: LocalTrack) => clean(track.album) ?? track.folderName

const iso = (ms: number) => new Date(ms).toISOString()

/**
 * Turns the tracks found in the chosen folders into songs, albums, artists
 * and genres, as a Subsonic server would list them, so the library pages,
 * home shelves, search, InjeKt and Karousel work the same on local music.
 * The same rules as Kultr for iOS.
 *
 * Albums are grouped the way most players do it: by album name and album
 * artist when the files say who the album is by, otherwise by album name
 * within one folder, so two different "Greatest Hits" in two folders stay
 * apart while a two-disc album in CD1 and CD2 folders stays together.
 */
export function buildCatalog(
  tracks: LocalTrack[],
  userData: (songId: string) => LocalUserData | undefined = () => undefined,
  albumData: (albumId: string) => LocalUserData | undefined = () => undefined,
  artistData: (artistId: string) => LocalUserData | undefined = () => undefined,
): LocalCatalog {
  const order: string[] = []
  const groups = new Map<string, LocalTrack[]>()
  const seen = new Set<string>()
  for (const track of tracks) {
    if (seen.has(track.path)) continue
    seen.add(track.path)
    const id = albumId(albumNameOf(track), clean(track.albumArtist), track.folderKey)
    if (!groups.has(id)) {
      order.push(id)
      groups.set(id, [])
    }
    groups.get(id)!.push(track)
  }

  const songs: Song[] = []
  const albums: Album[] = []
  for (const id of order) {
    const group = groups.get(id)!
    const first = group[0]
    const name = albumNameOf(first)
    const trackArtists: string[] = []
    for (const track of group) {
      const artist = clean(track.artist)
      if (artist && !trackArtists.includes(artist)) trackArtists.push(artist)
    }
    const albumArtist =
      clean(first.albumArtist) ??
      (trackArtists.length === 0 ? UNKNOWN_ARTIST : trackArtists.length === 1 ? trackArtists[0] : VARIOUS_ARTISTS)
    const albumArtistId = artistId(albumArtist)
    const cover = group.find((track) => track.coverId)?.coverId

    const albumSongs = group
      .map((track): Song => {
        const sid = songId(track.path)
        const before = userData(sid)
        const dot = track.fileName.lastIndexOf('.')
        const fileTitle = dot > 0 ? track.fileName.slice(0, dot) : track.fileName
        const suffix = dot > 0 ? track.fileName.slice(dot + 1).toLowerCase() : ''
        return {
          id: sid,
          parent: id,
          title: clean(track.title) ?? fileTitle,
          album: name,
          artist: clean(track.artist) ?? albumArtist,
          albumId: id,
          // Artist pages list album artists, so every track links to its album's.
          artistId: albumArtistId,
          track: track.track,
          discNumber: track.disc,
          year: track.year,
          genre: clean(track.genre),
          coverArt: track.coverId ?? cover,
          size: track.size,
          contentType: track.mimeType,
          suffix: suffix || undefined,
          duration: track.durationMs !== undefined ? Math.round(track.durationMs / 1000) : undefined,
          bitRate: track.bitRate !== undefined ? Math.round(track.bitRate / 1000) : undefined,
          samplingRate: track.sampleRate,
          path: track.path,
          created: iso(track.modified),
          playCount: before?.playCount,
          played: before?.played,
          starred: before?.starred,
          userRating: before?.userRating,
          type: 'music',
        }
      })
      .sort(
        (a, b) =>
          (a.discNumber ?? 1) - (b.discNumber ?? 1) ||
          (a.track ?? Number.MAX_SAFE_INTEGER) - (b.track ?? Number.MAX_SAFE_INTEGER) ||
          a.title.toLowerCase().localeCompare(b.title.toLowerCase()),
      )
    for (const song of albumSongs) {
      for (const key of Object.keys(song) as (keyof Song)[]) if (song[key] === undefined) delete song[key]
    }
    songs.push(...albumSongs)

    const genreCounts = new Map<string, number>()
    for (const song of albumSongs) if (song.genre) genreCounts.set(song.genre, (genreCounts.get(song.genre) ?? 0) + 1)
    const genre = [...genreCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0]
    const plays = albumSongs.reduce((sum, song) => sum + (song.playCount ?? 0), 0)
    const maxOf = (values: (string | undefined)[]) => values.filter(Boolean).sort().pop()
    const own = albumData(id)
    const album: Album = {
      id,
      name,
      artist: albumArtist,
      artistId: albumArtistId,
      coverArt: cover,
      songCount: albumSongs.length,
      duration: albumSongs.reduce((sum, song) => sum + (song.duration ?? 0), 0),
      playCount: plays > 0 ? plays : undefined,
      played: maxOf(albumSongs.map((song) => song.played)),
      created: maxOf(albumSongs.map((song) => song.created)),
      // A sync compares this to notice an album whose files changed.
      changed: iso(Math.max(...group.map((track) => track.modified))),
      year: Math.max(0, ...albumSongs.map((song) => song.year ?? 0)) || undefined,
      genre,
      isCompilation: albumArtist === VARIOUS_ARTISTS,
      starred: own?.starred,
      userRating: own?.userRating,
    }
    for (const key of Object.keys(album) as (keyof Album)[]) if (album[key] === undefined) delete album[key]
    albums.push(album)
  }

  const artistOrder: string[] = []
  const byArtist = new Map<string, Album[]>()
  for (const album of albums) {
    const id = album.artistId ?? ''
    if (!byArtist.has(id)) {
      artistOrder.push(id)
      byArtist.set(id, [])
    }
    byArtist.get(id)!.push(album)
  }
  const artists = artistOrder.map((id): Artist => {
    const own = byArtist.get(id)!
    const artist: Artist = {
      id,
      name: own[0]?.artist ?? '',
      coverArt: own.find((album) => album.coverArt)?.coverArt,
      albumCount: own.length,
      starred: artistData(id)?.starred,
    }
    for (const key of Object.keys(artist) as (keyof Artist)[]) if (artist[key] === undefined) delete artist[key]
    return artist
  })

  const genreSongs = new Map<string, number>()
  const genreAlbums = new Map<string, Set<string>>()
  for (const song of songs) {
    if (!song.genre) continue
    genreSongs.set(song.genre, (genreSongs.get(song.genre) ?? 0) + 1)
    if (song.albumId) {
      if (!genreAlbums.has(song.genre)) genreAlbums.set(song.genre, new Set())
      genreAlbums.get(song.genre)!.add(song.albumId)
    }
  }
  const genres = [...genreSongs.entries()]
    .map(([value, songCount]): Genre => ({ value, songCount, albumCount: genreAlbums.get(value)?.size ?? 0 }))
    .sort((a, b) => (b.songCount ?? 0) - (a.songCount ?? 0) || a.value.localeCompare(b.value))

  return { songs, albums, artists, genres }
}
