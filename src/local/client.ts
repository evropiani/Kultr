import { SubsonicApiError, SubsonicClient, type Params } from '@/api/subsonic'
import type { Album, Artist, Playlist, Song } from '@/api/types'
import { buildCatalog, isLocalId, type LocalCatalog, type LocalUserData } from './catalog'
import {
  allCovers,
  allPlaylists,
  allTracks,
  allUserData,
  deletePlaylist,
  patchUserData,
  putPlaylist,
  type LocalPlaylist,
  type StoredTrack,
} from './db'
import { scanFolders, type ScanProgress, type ScanResult } from './scan'
import { t } from '@/i18n'

/** The label a profile for music on this computer goes by. */
export const LOCAL_PROFILE_ID = 'local'
export const LOCAL_LABEL = 'This computer'

interface Built {
  catalog: LocalCatalog
  songs: Map<string, Song>
  albums: Map<string, Album>
  artists: Map<string, Artist>
  albumSongs: Map<string, Song[]>
  artistAlbums: Map<string, Album[]>
  tracks: Map<string, StoredTrack>
  playlists: LocalPlaylist[]
}

/**
 * Music on this computer, as if it were a Subsonic server.
 *
 * Every call the rest of Kultr makes — the library sync, album and artist
 * pages, search, favourites, ratings, play counts, playlists, Karousel's
 * sources — is answered here from the files found in the music folders and
 * from what Kultr keeps alongside them. So the whole app works on local music
 * without a second code path, the way Kultr for iOS and Android do it.
 */
export class LocalClient extends SubsonicClient {
  private built: Built | null = null
  private building: Promise<Built> | null = null
  private covers = new Map<string, string>()
  private scanning: Promise<ScanResult> | null = null

  constructor() {
    super({ serverUrl: '', username: LOCAL_LABEL, password: '', authMode: 'plain' })
  }

  get isLocal(): true {
    return true
  }

  /** Read the folders again, then forget the catalogue so the next call builds it afresh. */
  scan(onProgress?: (progress: ScanProgress) => void, signal?: AbortSignal): Promise<ScanResult> {
    this.scanning ??= scanFolders(onProgress, signal).finally(() => {
      this.scanning = null
      this.invalidate()
    })
    return this.scanning
  }

  invalidate(): void {
    this.built = null
  }

  private async catalog(): Promise<Built> {
    if (this.built) return this.built
    this.building ??= (async () => {
      const [tracks, user, playlists, covers] = await Promise.all([allTracks(), allUserData(), allPlaylists(), allCovers()])
      // Covers keep their URLs from one build to the next (a play or a star
      // rebuilds the catalogue); only ones that are gone are let go.
      const next = new Map<string, string>()
      for (const cover of covers) next.set(cover.id, this.covers.get(cover.id) ?? URL.createObjectURL(cover.blob))
      for (const [id, url] of this.covers) if (!next.has(id)) URL.revokeObjectURL(url)
      this.covers = next
      const data = (id: string) => user.get(id)
      const catalog = buildCatalog(tracks, data, data, data)
      const built: Built = {
        catalog,
        songs: new Map(catalog.songs.map((song) => [song.id, song])),
        albums: new Map(catalog.albums.map((album) => [album.id, album])),
        artists: new Map(catalog.artists.map((artist) => [artist.id, artist])),
        albumSongs: new Map(),
        artistAlbums: new Map(),
        tracks: new Map(tracks.map((track) => [track.path, track])),
        playlists,
      }
      for (const song of catalog.songs) {
        const list = built.albumSongs.get(song.albumId ?? '') ?? []
        list.push(song)
        built.albumSongs.set(song.albumId ?? '', list)
      }
      for (const album of catalog.albums) {
        const list = built.artistAlbums.get(album.artistId ?? '') ?? []
        list.push(album)
        built.artistAlbums.set(album.artistId ?? '', list)
      }
      this.built = built
      return built
    })().finally(() => {
      this.building = null
    })
    return this.building
  }

  // ------------------------------------------------------------ media URLs --

  /** Local songs are played through `localPlayable`; this only marks them. */
  streamUrl(id: string): string {
    return `kultr-local:${id}`
  }

  downloadUrl(): string {
    return ''
  }

  coverArtUrl(coverArtId: string | undefined): string {
    return (coverArtId && this.covers.get(coverArtId)) || ''
  }

  // ------------------------------------------------------------- the calls --

  protected async request<T = Record<string, unknown>>(endpoint: string, params: Params = {}): Promise<T> {
    return (await this.answer(endpoint, params)) as T
  }

  private async answer(endpoint: string, params: Params): Promise<Record<string, unknown>> {
    const one = (key: string) => {
      const value = params[key]
      return Array.isArray(value) ? value[0] : value
    }
    const many = (key: string) => {
      const value = params[key]
      return (Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]).map(String)
    }
    const text = (key: string) => (one(key) === undefined || one(key) === null ? undefined : String(one(key)))
    const number = (key: string, fallback: number) => {
      const value = Number(one(key))
      return Number.isFinite(value) && one(key) !== undefined && one(key) !== '' ? value : fallback
    }
    const ok = (body: Record<string, unknown> = {}) => ({ status: 'ok', version: '1.16.1', type: 'kultr', serverVersion: 'local', openSubsonic: true, ...body })

    switch (endpoint) {
      case 'ping':
        // Built now, so covers have their URLs before the first page draws.
        await this.catalog()
        return ok()
      case 'getLicense':
        return ok({ license: { valid: true } })
      case 'getUser':
        return ok({
          user: { username: LOCAL_LABEL, scrobblingEnabled: true, adminRole: false, streamRole: true, downloadRole: false, playlistRole: true, shareRole: false },
        })
      case 'getScanStatus':
        return ok({ scanStatus: { scanning: Boolean(this.scanning), count: (await this.catalog()).catalog.songs.length } })
      case 'startScan':
        await this.scan()
        return ok({ scanStatus: { scanning: false, count: (await this.catalog()).catalog.songs.length } })
    }

    const c = await this.catalog()
    const songs = c.catalog.songs
    switch (endpoint) {
      case 'getArtists': {
        const index = new Map<string, Artist[]>()
        for (const artist of [...c.catalog.artists].sort((a, b) => a.name.localeCompare(b.name))) {
          const letter = /^[a-z]/i.test(artist.name) ? artist.name[0].toUpperCase() : '#'
          if (!index.has(letter)) index.set(letter, [])
          index.get(letter)!.push(artist)
        }
        return ok({ artists: { ignoredArticles: '', index: [...index].map(([name, artist]) => ({ name, artist })) } })
      }
      case 'getArtist': {
        const artist = c.artists.get(text('id') ?? '')
        if (!artist) throw new SubsonicApiError(70, 'Artist not found')
        return ok({ artist: { ...artist, album: c.artistAlbums.get(artist.id) ?? [] } })
      }
      case 'getArtistInfo2':
        return ok({ artistInfo2: { similarArtist: [] } })
      case 'getAlbum': {
        const album = c.albums.get(text('id') ?? '')
        if (!album) throw new SubsonicApiError(70, 'Album not found')
        return ok({ album: { ...album, song: c.albumSongs.get(album.id) ?? [] } })
      }
      case 'getAlbumInfo2':
        return ok({ albumInfo: {} })
      case 'getSong': {
        const song = c.songs.get(text('id') ?? '')
        if (!song) throw new SubsonicApiError(70, 'Song not found')
        return ok({ song })
      }
      case 'getAlbumList2': {
        const size = number('size', 10)
        const offset = number('offset', 0)
        let list = [...c.catalog.albums]
        switch (text('type')) {
          case 'random':
            list = shuffle(list)
            break
          case 'newest':
            list.sort((a, b) => (b.created ?? '').localeCompare(a.created ?? ''))
            break
          case 'highest':
            list = list.filter((album) => album.userRating).sort((a, b) => (b.userRating ?? 0) - (a.userRating ?? 0))
            break
          case 'frequent':
            list = list.filter((album) => album.playCount).sort((a, b) => (b.playCount ?? 0) - (a.playCount ?? 0))
            break
          case 'recent':
            list = list.filter((album) => album.played).sort((a, b) => (b.played ?? '').localeCompare(a.played ?? ''))
            break
          case 'alphabeticalByArtist':
            list.sort((a, b) => (a.artist ?? '').localeCompare(b.artist ?? '') || a.name.localeCompare(b.name))
            break
          case 'starred':
            list = list.filter((album) => album.starred)
            break
          case 'byYear': {
            const from = number('fromYear', 0)
            const to = number('toYear', 9999)
            const [low, high] = from <= to ? [from, to] : [to, from]
            list = list.filter((album) => (album.year ?? 0) >= low && (album.year ?? 0) <= high)
            list.sort((a, b) => (from <= to ? (a.year ?? 0) - (b.year ?? 0) : (b.year ?? 0) - (a.year ?? 0)))
            break
          }
          case 'byGenre':
            list = list.filter((album) => album.genre === text('genre'))
            break
          default:
            list.sort((a, b) => a.name.localeCompare(b.name))
        }
        return ok({ albumList2: { album: list.slice(offset, offset + size) } })
      }
      case 'getGenres':
        return ok({ genres: { genre: c.catalog.genres } })
      case 'getRandomSongs': {
        const genre = text('genre')
        const from = number('fromYear', 0)
        const to = number('toYear', 9999)
        const pool = songs.filter(
          (song) => (!genre || song.genre === genre) && (song.year === undefined || (song.year >= from && song.year <= to)),
        )
        return ok({ randomSongs: { song: shuffle(pool).slice(0, number('size', 10)) } })
      }
      case 'getSongsByGenre': {
        const offset = number('offset', 0)
        const list = songs.filter((song) => song.genre === text('genre'))
        return ok({ songsByGenre: { song: list.slice(offset, offset + number('count', 10)) } })
      }
      case 'getStarred2':
        return ok({
          starred2: {
            artist: c.catalog.artists.filter((artist) => artist.starred),
            album: c.catalog.albums.filter((album) => album.starred),
            song: songs.filter((song) => song.starred),
          },
        })
      case 'search3': {
        const words = (text('query') ?? '').replace(/"/g, '').toLowerCase().split(/\s+/).filter(Boolean)
        const matches = (fields: (string | undefined)[]) => {
          const haystack = fields.filter(Boolean).join(' ').toLowerCase()
          return words.every((word) => haystack.includes(word))
        }
        const page = <T,>(list: T[], key: string) => list.slice(number(`${key}Offset`, 0), number(`${key}Offset`, 0) + number(`${key}Count`, 20))
        return ok({
          searchResult3: {
            artist: page(c.catalog.artists.filter((artist) => matches([artist.name])), 'artist'),
            album: page(c.catalog.albums.filter((album) => matches([album.name, album.artist])), 'album'),
            song: page(songs.filter((song) => matches([song.title, song.artist, song.album])), 'song'),
          },
        })
      }
      case 'getSimilarSongs2':
      case 'getSimilarSongs':
        // There is no Last.fm here; Karousel and the mixes carry on with the library itself.
        return ok({ similarSongs2: { song: [] } })
      case 'getTopSongs': {
        const name = (text('artist') ?? '').toLowerCase()
        const list = songs
          .filter((song) => song.artist?.toLowerCase() === name || c.albums.get(song.albumId ?? '')?.artist?.toLowerCase() === name)
          .sort((a, b) => (b.playCount ?? 0) - (a.playCount ?? 0) || a.title.localeCompare(b.title))
        return ok({ topSongs: { song: list.slice(0, number('count', 50)) } })
      }
      case 'getPlaylists':
        return ok({ playlists: { playlist: c.playlists.map((playlist) => this.playlistView(playlist, c, false)) } })
      case 'getPlaylist': {
        const playlist = c.playlists.find((entry) => entry.id === text('id'))
        if (!playlist) throw new SubsonicApiError(70, 'Playlist not found')
        return ok({ playlist: this.playlistView(playlist, c, true) })
      }
      case 'createPlaylist': {
        const now = new Date().toISOString()
        const existing = c.playlists.find((entry) => entry.id === text('playlistId'))
        const playlist: LocalPlaylist = existing
          ? { ...existing, songIds: many('songId'), changed: now }
          : { id: `local-playlist:${Date.now().toString(36)}`, name: text('name') || 'New playlist', songIds: many('songId'), created: now, changed: now }
        await putPlaylist(playlist)
        this.invalidate()
        return ok({ playlist: this.playlistView(playlist, await this.catalog(), true) })
      }
      case 'updatePlaylist': {
        const playlist = c.playlists.find((entry) => entry.id === text('playlistId'))
        if (!playlist) throw new SubsonicApiError(70, 'Playlist not found')
        const remove = new Set(many('songIndexToRemove').map(Number))
        const next: LocalPlaylist = {
          ...playlist,
          name: text('name') ?? playlist.name,
          comment: text('comment') ?? playlist.comment,
          songIds: [...playlist.songIds.filter((_, i) => !remove.has(i)), ...many('songIdToAdd')],
          changed: new Date().toISOString(),
        }
        await putPlaylist(next)
        this.invalidate()
        return ok()
      }
      case 'deletePlaylist':
        await deletePlaylist(text('id') ?? '')
        this.invalidate()
        return ok()
      case 'star':
      case 'unstar': {
        const value = endpoint === 'star' ? new Date().toISOString() : undefined
        for (const id of [...many('id'), ...many('albumId'), ...many('artistId')]) await patchUserData(id, { starred: value })
        this.invalidate()
        return ok()
      }
      case 'setRating': {
        const rating = number('rating', 0)
        await patchUserData(text('id') ?? '', { userRating: rating > 0 ? Math.min(5, rating) : undefined })
        this.invalidate()
        return ok()
      }
      case 'scrobble': {
        // "Now playing" notices (submission=false) are not plays.
        if (String(one('submission')) !== 'false') {
          const time = number('time', Date.now())
          for (const id of many('id')) {
            const song = c.songs.get(id)
            if (!song) continue
            await patchUserData(id, { playCount: (song.playCount ?? 0) + 1, played: new Date(time).toISOString() })
          }
          this.invalidate()
        }
        return ok()
      }
      case 'getLyrics': {
        const artist = (text('artist') ?? '').toLowerCase()
        const title = (text('title') ?? '').toLowerCase()
        const song = songs.find((entry) => entry.title.toLowerCase() === title && (!artist || entry.artist?.toLowerCase() === artist))
        const lyrics = song ? c.tracks.get(song.path ?? '')?.lyrics : undefined
        return ok({ lyrics: lyrics ? { artist: song?.artist, title: song?.title, value: lyrics } : {} })
      }
      case 'getLyricsBySongId': {
        const song = c.songs.get(text('id') ?? '')
        const lyrics = song ? c.tracks.get(song.path ?? '')?.lyrics : undefined
        return ok({
          lyricsList: {
            structuredLyrics: lyrics
              ? [{ lang: 'und', synced: false, displayArtist: song?.artist, displayTitle: song?.title, line: lyrics.split(/\r?\n/).map((value) => ({ value })) }]
              : [],
          },
        })
      }
      case 'getInternetRadioStations':
        return ok({ internetRadioStations: { internetRadioStation: [] } })
      case 'getShares':
        return ok({ shares: { share: [] } })
      case 'getNowPlaying':
        return ok({ nowPlaying: { entry: [] } })
      case 'createShare':
        throw new SubsonicApiError(0, t('Share links need a server; music on this computer cannot be shared by link.'))
      default:
        throw new SubsonicApiError(0, t('Not available for music on this computer (%@).', endpoint))
    }
  }

  private playlistView(playlist: LocalPlaylist, c: Built, withSongs: boolean): Playlist {
    const entries = playlist.songIds.map((id) => c.songs.get(id)).filter((song): song is Song => Boolean(song))
    return {
      id: playlist.id,
      name: playlist.name,
      comment: playlist.comment,
      owner: LOCAL_LABEL,
      public: false,
      songCount: entries.length,
      duration: entries.reduce((sum, song) => sum + (song.duration ?? 0), 0),
      created: playlist.created,
      changed: playlist.changed,
      coverArt: entries.find((song) => song.coverArt)?.coverArt,
      ...(withSongs ? { entry: entries } : {}),
    }
  }
}

function shuffle<T>(items: T[]): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export function isLocalClient(client: SubsonicClient | null): client is LocalClient {
  return client instanceof LocalClient
}

export { isLocalId }
export { forgetFolders, localBlob, localPlayable } from './files'

export type { LocalUserData }
