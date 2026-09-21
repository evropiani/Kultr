import { hexEncode, md5, randomSalt } from '@/lib/md5'
import type {
  Album,
  Artist,
  ArtistIndex,
  ArtistInfo,
  Credentials,
  Genre,
  Lyrics,
  Playlist,
  RadioStation,
  ScanStatus,
  SearchResult3,
  ServerInfo,
  Share,
  Song,
  StructuredLyrics,
  SubsonicUser,
} from './types'

/** Protocol version we speak. 1.16.1 is what Navidrome implements. */
export const API_VERSION = '1.16.1'
export const CLIENT_NAME = 'Kultr'

export class SubsonicApiError extends Error {
  code: number
  constructor(code: number, message: string) {
    super(message)
    this.name = 'SubsonicApiError'
    this.code = code
  }
}

export class NetworkError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message)
    this.name = 'NetworkError'
  }
}

/** Human-readable explanations for the Subsonic error codes Navidrome uses. */
export function describeError(err: unknown): string {
  if (err instanceof SubsonicApiError) {
    switch (err.code) {
      case 0:
        return err.message || 'The server reported a generic error.'
      case 10:
        return 'The server is missing a required parameter.'
      case 20:
        return 'Your server is too old for this client.'
      case 30:
        return 'This client is too old for your server.'
      case 40:
        return 'Wrong username or password.'
      case 41:
        return 'Token authentication is disabled on this server. Switch to "Plain password" in advanced settings (use HTTPS!).'
      case 50:
        return 'Your account is not allowed to do that.'
      case 60:
        return 'This feature needs a Subsonic Premium subscription (not applicable to Navidrome).'
      case 70:
        return 'Not found.'
      default:
        return err.message || `Server error ${err.code}.`
    }
  }
  if (err instanceof NetworkError) return err.message
  if (err instanceof Error) return err.message
  return String(err)
}

function normalizeServerUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '')
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

type ParamValue = string | number | boolean | undefined | null
type Params = Record<string, ParamValue | ParamValue[]>

export class SubsonicClient {
  private creds: Credentials

  constructor(creds: Credentials) {
    this.creds = { ...creds, serverUrl: normalizeServerUrl(creds.serverUrl) }
  }

  get credentials(): Credentials {
    return this.creds
  }

  get baseUrl(): string {
    return this.creds.serverUrl
  }

  /** True when the API lives on the page's own origin (reverse-proxy setup). */
  get isSameOrigin(): boolean {
    if (!this.creds.serverUrl) return true
    try {
      return new URL(this.creds.serverUrl, location.href).origin === location.origin
    } catch {
      return false
    }
  }

  /**
   * Auth query parameters.
   *
   * API calls get a fresh salt every time, which is the point of the scheme.
   * URLs that end up in `<img src>` or `<audio src>` must NOT — a URL that
   * changes on every render is a different URL to the browser, so the image
   * cache never hits, artwork is re-downloaded constantly, and any effect
   * depending on that URL re-runs forever. Those use one salt per session.
   */
  private authParams(stable = false): Record<string, string> {
    const { username, password, authMode } = this.creds
    const base: Record<string, string> = {
      u: username,
      v: API_VERSION,
      c: CLIENT_NAME,
      f: 'json',
    }
    if (authMode === 'plain') {
      base.p = `enc:${hexEncode(password)}`
      return base
    }
    if (stable) {
      if (!this.stableAuth) {
        const s = randomSalt()
        this.stableAuth = { s, t: md5(password + s) }
      }
      return { ...base, ...this.stableAuth }
    }
    const s = randomSalt()
    return { ...base, s, t: md5(password + s) }
  }

  private stableAuth: { s: string; t: string } | null = null

  /**
   * Build a fully-qualified, authenticated URL for any endpoint.
   *
   * Pass `stable` for anything a DOM element will hold onto, so the URL stays
   * byte-identical between renders and the browser can cache it.
   */
  buildUrl(endpoint: string, params: Params = {}, stable = false): string {
    const prefix = this.creds.serverUrl || ''
    const url = new URL(`${prefix}/rest/${endpoint}`, location.href)
    for (const [key, value] of Object.entries(this.authParams(stable))) {
      url.searchParams.set(key, value)
    }
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === '') continue
      if (Array.isArray(value)) {
        for (const v of value) {
          if (v === undefined || v === null || v === '') continue
          url.searchParams.append(key, String(v))
        }
      } else {
        url.searchParams.set(key, String(value))
      }
    }
    return url.toString()
  }

  private async request<T = Record<string, unknown>>(
    endpoint: string,
    params: Params = {},
    init: { signal?: AbortSignal; timeoutMs?: number } = {},
  ): Promise<T> {
    const url = this.buildUrl(endpoint, params)
    const controller = new AbortController()
    const timeoutMs = init.timeoutMs ?? 30_000
    const timer = setTimeout(() => controller.abort(new DOMException('Timeout', 'TimeoutError')), timeoutMs)
    const onExternalAbort = () => controller.abort(init.signal?.reason)
    init.signal?.addEventListener('abort', onExternalAbort, { once: true })

    let response: Response
    try {
      response = await fetch(url, {
        signal: controller.signal,
        credentials: 'omit',
        headers: { Accept: 'application/json' },
      })
    } catch (err) {
      if (init.signal?.aborted) throw err
      if ((err as Error)?.name === 'TimeoutError' || controller.signal.reason instanceof DOMException) {
        throw new NetworkError(`The server did not answer within ${Math.round(timeoutMs / 1000)}s.`, err)
      }
      throw new NetworkError(
        'Could not reach the server. Check the address, that it is running, and that cross-origin requests are allowed (see the Kultr docs on reverse proxies).',
        err,
      )
    } finally {
      clearTimeout(timer)
      init.signal?.removeEventListener('abort', onExternalAbort)
    }

    if (!response.ok) {
      throw new NetworkError(`Server responded with HTTP ${response.status} ${response.statusText}.`)
    }

    let payload: { 'subsonic-response'?: Record<string, unknown> }
    try {
      payload = await response.json()
    } catch (err) {
      throw new NetworkError(
        'The server sent something that is not a Subsonic JSON response. Is the address pointing at Navidrome?',
        err,
      )
    }

    const body = payload['subsonic-response']
    if (!body) throw new NetworkError('Malformed response: no "subsonic-response" envelope.')
    if (body.status === 'failed') {
      const error = body.error as { code?: number; message?: string } | undefined
      throw new SubsonicApiError(error?.code ?? 0, error?.message ?? 'Unknown error')
    }
    return body as T
  }

  // ---------------------------------------------------------------- system --

  async ping(signal?: AbortSignal): Promise<ServerInfo> {
    const res = await this.request<ServerInfo>('ping', {}, { signal, timeoutMs: 15_000 })
    return res
  }

  async getLicense() {
    return this.request<{ license?: { valid?: boolean } }>('getLicense')
  }

  async getUser(username?: string): Promise<SubsonicUser | undefined> {
    const res = await this.request<{ user?: SubsonicUser }>('getUser', {
      username: username ?? this.creds.username,
    })
    return res.user
  }

  async getScanStatus(): Promise<ScanStatus> {
    const res = await this.request<{ scanStatus?: ScanStatus }>('getScanStatus')
    return res.scanStatus ?? { scanning: false }
  }

  async startScan(fullScan = false): Promise<ScanStatus> {
    const res = await this.request<{ scanStatus?: ScanStatus }>('startScan', { fullScan })
    return res.scanStatus ?? { scanning: true }
  }

  // --------------------------------------------------------------- browsing --

  async getArtists(): Promise<Artist[]> {
    const res = await this.request<{ artists?: { index?: ArtistIndex[]; ignoredArticles?: string } }>(
      'getArtists',
      {},
      { timeoutMs: 60_000 },
    )
    const indexes = res.artists?.index ?? []
    return indexes.flatMap((entry) => entry.artist ?? [])
  }

  async getArtist(id: string): Promise<Artist | undefined> {
    const res = await this.request<{ artist?: Artist }>('getArtist', { id })
    return res.artist
  }

  async getArtistInfo2(id: string, count = 20): Promise<ArtistInfo | undefined> {
    const res = await this.request<{ artistInfo2?: ArtistInfo }>('getArtistInfo2', {
      id,
      count,
      includeNotPresent: false,
    })
    return res.artistInfo2
  }

  async getAlbum(id: string): Promise<Album | undefined> {
    const res = await this.request<{ album?: Album }>('getAlbum', { id })
    return res.album
  }

  async getAlbumInfo2(id: string) {
    const res = await this.request<{ albumInfo?: { notes?: string; lastFmUrl?: string } }>(
      'getAlbumInfo2',
      { id },
    )
    return res.albumInfo
  }

  async getSong(id: string): Promise<Song | undefined> {
    const res = await this.request<{ song?: Song }>('getSong', { id })
    return res.song
  }

  async getAlbumList2(options: {
    type:
      | 'random'
      | 'newest'
      | 'highest'
      | 'frequent'
      | 'recent'
      | 'alphabeticalByName'
      | 'alphabeticalByArtist'
      | 'starred'
      | 'byYear'
      | 'byGenre'
    size?: number
    offset?: number
    fromYear?: number
    toYear?: number
    genre?: string
  }): Promise<Album[]> {
    const res = await this.request<{ albumList2?: { album?: Album[] } }>(
      'getAlbumList2',
      {
        type: options.type,
        size: options.size ?? 100,
        offset: options.offset ?? 0,
        fromYear: options.fromYear,
        toYear: options.toYear,
        genre: options.genre,
      },
      { timeoutMs: 60_000 },
    )
    return res.albumList2?.album ?? []
  }

  async getGenres(): Promise<Genre[]> {
    const res = await this.request<{ genres?: { genre?: Genre[] } }>('getGenres')
    return res.genres?.genre ?? []
  }

  async getRandomSongs(options: {
    size?: number
    genre?: string
    fromYear?: number
    toYear?: number
  } = {}): Promise<Song[]> {
    const res = await this.request<{ randomSongs?: { song?: Song[] } }>('getRandomSongs', {
      size: options.size ?? 50,
      genre: options.genre,
      fromYear: options.fromYear,
      toYear: options.toYear,
    })
    return res.randomSongs?.song ?? []
  }

  async getSongsByGenre(genre: string, count = 200, offset = 0): Promise<Song[]> {
    const res = await this.request<{ songsByGenre?: { song?: Song[] } }>('getSongsByGenre', {
      genre,
      count,
      offset,
    })
    return res.songsByGenre?.song ?? []
  }

  async getStarred2(): Promise<{ artist: Artist[]; album: Album[]; song: Song[] }> {
    const res = await this.request<{
      starred2?: { artist?: Artist[]; album?: Album[]; song?: Song[] }
    }>('getStarred2', {}, { timeoutMs: 60_000 })
    return {
      artist: res.starred2?.artist ?? [],
      album: res.starred2?.album ?? [],
      song: res.starred2?.song ?? [],
    }
  }

  async search3(options: {
    query: string
    artistCount?: number
    artistOffset?: number
    albumCount?: number
    albumOffset?: number
    songCount?: number
    songOffset?: number
    signal?: AbortSignal
  }): Promise<SearchResult3> {
    const res = await this.request<{ searchResult3?: SearchResult3 }>(
      'search3',
      {
        query: options.query,
        artistCount: options.artistCount ?? 20,
        artistOffset: options.artistOffset ?? 0,
        albumCount: options.albumCount ?? 20,
        albumOffset: options.albumOffset ?? 0,
        songCount: options.songCount ?? 40,
        songOffset: options.songOffset ?? 0,
      },
      { signal: options.signal, timeoutMs: 60_000 },
    )
    return res.searchResult3 ?? {}
  }

  async getSimilarSongs2(id: string, count = 50): Promise<Song[]> {
    const res = await this.request<{ similarSongs2?: { song?: Song[] } }>('getSimilarSongs2', {
      id,
      count,
    })
    return res.similarSongs2?.song ?? []
  }

  async getTopSongs(artist: string, count = 50): Promise<Song[]> {
    const res = await this.request<{ topSongs?: { song?: Song[] } }>('getTopSongs', { artist, count })
    return res.topSongs?.song ?? []
  }

  // -------------------------------------------------------------- playlists --

  async getPlaylists(): Promise<Playlist[]> {
    const res = await this.request<{ playlists?: { playlist?: Playlist[] } }>('getPlaylists')
    return res.playlists?.playlist ?? []
  }

  async getPlaylist(id: string): Promise<Playlist | undefined> {
    const res = await this.request<{ playlist?: Playlist }>('getPlaylist', { id }, { timeoutMs: 60_000 })
    return res.playlist
  }

  async createPlaylist(name: string, songIds: string[] = []): Promise<Playlist | undefined> {
    const res = await this.request<{ playlist?: Playlist }>('createPlaylist', {
      name,
      songId: songIds,
    })
    return res.playlist
  }

  async updatePlaylist(options: {
    playlistId: string
    name?: string
    comment?: string
    public?: boolean
    songIdToAdd?: string[]
    songIndexToRemove?: number[]
  }): Promise<void> {
    await this.request('updatePlaylist', {
      playlistId: options.playlistId,
      name: options.name,
      comment: options.comment,
      public: options.public,
      songIdToAdd: options.songIdToAdd,
      songIndexToRemove: options.songIndexToRemove,
    })
  }

  async deletePlaylist(id: string): Promise<void> {
    await this.request('deletePlaylist', { id })
  }

  // ------------------------------------------------------------ annotations --

  async star(options: { id?: string; albumId?: string; artistId?: string }): Promise<void> {
    await this.request('star', options)
  }

  async unstar(options: { id?: string; albumId?: string; artistId?: string }): Promise<void> {
    await this.request('unstar', options)
  }

  async setRating(id: string, rating: number): Promise<void> {
    await this.request('setRating', { id, rating })
  }

  async scrobble(id: string, submission: boolean, time?: number): Promise<void> {
    await this.request('scrobble', { id, submission, time: time ?? Date.now() })
  }

  // ------------------------------------------------------------------ media --

  /** Streaming URL for an <audio> element. Stable across renders. */
  streamUrl(
    id: string,
    options: { maxBitRate?: number; format?: string; estimateContentLength?: boolean } = {},
  ): string {
    return this.buildUrl(
      'stream',
      {
        id,
        maxBitRate: options.maxBitRate,
        format: options.format,
        estimateContentLength: options.estimateContentLength,
      },
      true,
    )
  }

  /** Original-file download URL (never transcoded). */
  downloadUrl(id: string): string {
    return this.buildUrl('download', { id }, true)
  }

  /** Artwork URL. Stable, so the browser cache and React both behave. */
  coverArtUrl(coverArtId: string | undefined, size?: number): string {
    if (!coverArtId) return ''
    return this.buildUrl('getCoverArt', { id: coverArtId, size }, true)
  }

  async getLyrics(artist?: string, title?: string): Promise<Lyrics | undefined> {
    const res = await this.request<{ lyrics?: Lyrics }>('getLyrics', { artist, title })
    return res.lyrics
  }

  /** OpenSubsonic extension; Navidrome supports it and it can return synced lyrics. */
  async getLyricsBySongId(id: string): Promise<StructuredLyrics[]> {
    const res = await this.request<{
      lyricsList?: { structuredLyrics?: StructuredLyrics[] }
    }>('getLyricsBySongId', { id })
    return res.lyricsList?.structuredLyrics ?? []
  }

  async getInternetRadioStations(): Promise<RadioStation[]> {
    const res = await this.request<{
      internetRadioStations?: { internetRadioStation?: RadioStation[] }
    }>('getInternetRadioStations')
    return res.internetRadioStations?.internetRadioStation ?? []
  }

  async getShares(): Promise<Share[]> {
    const res = await this.request<{ shares?: { share?: Share[] } }>('getShares')
    return res.shares?.share ?? []
  }

  async createShare(ids: string[], description?: string): Promise<Share | undefined> {
    const res = await this.request<{ shares?: { share?: Share[] } }>('createShare', {
      id: ids,
      description,
    })
    return res.shares?.share?.[0]
  }

  async getNowPlaying(): Promise<Song[]> {
    const res = await this.request<{ nowPlaying?: { entry?: Song[] } }>('getNowPlaying')
    return res.nowPlaying?.entry ?? []
  }
}

/** Process-wide client, swapped on login/logout. */
let current: SubsonicClient | null = null

export function setClient(client: SubsonicClient | null): void {
  current = client
}

export function getClient(): SubsonicClient {
  if (!current) throw new Error('Not connected to a server yet.')
  return current
}

export function maybeClient(): SubsonicClient | null {
  return current
}
