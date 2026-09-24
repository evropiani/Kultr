/**
 * Subsonic API shapes, narrowed to what Navidrome actually returns and what
 * Kultr actually uses. Everything optional is genuinely optional — Navidrome
 * omits empty fields rather than sending nulls.
 */

export interface SubsonicError {
  code: number
  message: string
}

export interface Song {
  id: string
  parent?: string
  title: string
  album?: string
  artist?: string
  albumId?: string
  artistId?: string
  track?: number
  discNumber?: number
  year?: number
  genre?: string
  genres?: { name: string }[]
  coverArt?: string
  size?: number
  contentType?: string
  suffix?: string
  transcodedContentType?: string
  transcodedSuffix?: string
  duration?: number
  bitRate?: number
  samplingRate?: number
  channelCount?: number
  path?: string
  playCount?: number
  played?: string
  created?: string
  starred?: string
  userRating?: number
  averageRating?: number
  bpm?: number
  comment?: string
  sortName?: string
  musicBrainzId?: string
  isVideo?: boolean
  type?: string
  replayGain?: {
    trackGain?: number
    albumGain?: number
    trackPeak?: number
    albumPeak?: number
  }
  /**
   * Kultr-only: play this exact URL instead of building a Subsonic stream URL.
   * Used for internet radio stations, which are not library tracks.
   */
  kultrStreamUrl?: string
}

export interface Album {
  id: string
  name: string
  artist?: string
  artistId?: string
  coverArt?: string
  songCount?: number
  duration?: number
  playCount?: number
  /** When any of its tracks was last played (OpenSubsonic; Navidrome sends it). */
  played?: string
  created?: string
  changed?: string
  starred?: string
  year?: number
  genre?: string
  genres?: { name: string }[]
  userRating?: number
  sortName?: string
  musicBrainzId?: string
  /** Present on getAlbum, absent on getAlbumList2. */
  song?: Song[]
  isCompilation?: boolean
  discTitles?: { disc: number; title: string }[]
}

export interface Artist {
  id: string
  name: string
  coverArt?: string
  artistImageUrl?: string
  albumCount?: number
  starred?: string
  userRating?: number
  sortName?: string
  musicBrainzId?: string
  album?: Album[]
}

export interface ArtistIndex {
  name: string
  artist: Artist[]
}

export interface ArtistInfo {
  biography?: string
  musicBrainzId?: string
  lastFmUrl?: string
  smallImageUrl?: string
  mediumImageUrl?: string
  largeImageUrl?: string
  similarArtist?: Artist[]
}

export interface Playlist {
  id: string
  name: string
  comment?: string
  owner?: string
  public?: boolean
  songCount?: number
  duration?: number
  created?: string
  changed?: string
  coverArt?: string
  entry?: Song[]
}

export interface Genre {
  value: string
  songCount?: number
  albumCount?: number
}

export interface ScanStatus {
  scanning: boolean
  count?: number
  folderCount?: number
  lastScan?: string
}

export interface SubsonicUser {
  username: string
  email?: string
  scrobblingEnabled?: boolean
  adminRole?: boolean
  streamRole?: boolean
  downloadRole?: boolean
  playlistRole?: boolean
  shareRole?: boolean
  jukeboxRole?: boolean
}

export interface RadioStation {
  id: string
  name: string
  streamUrl: string
  homePageUrl?: string
}

export interface Share {
  id: string
  url: string
  description?: string
  username?: string
  created?: string
  expires?: string
  visitCount?: number
  entry?: Song[]
}

export interface Lyrics {
  artist?: string
  title?: string
  value?: string
}

export interface StructuredLyricLine {
  start?: number
  value: string
}

export interface StructuredLyrics {
  lang?: string
  synced?: boolean
  displayArtist?: string
  displayTitle?: string
  offset?: number
  line?: StructuredLyricLine[]
}

export interface SearchResult3 {
  artist?: Artist[]
  album?: Album[]
  song?: Song[]
}

export interface Credentials {
  /** Base URL of the Navidrome server, no trailing slash. Empty means same-origin. */
  serverUrl: string
  username: string
  password: string
  /** Token auth is the default; plain is only for exotic reverse proxies. */
  authMode: 'token' | 'plain'
}

export interface ServerInfo {
  version?: string
  type?: string
  serverVersion?: string
  openSubsonic?: boolean
}
