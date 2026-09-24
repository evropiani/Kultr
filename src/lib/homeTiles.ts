/**
 * The shelves the home page can show.
 *
 * Kept here rather than inside the Home route so the Settings page can list
 * and reorder them without importing the whole page, and so there is exactly
 * one place that knows which ids are valid.
 */

export type TileKind = 'songs' | 'albums' | 'artists' | 'playlists' | 'radios'

export interface HomeTile {
  id: string
  /** Heading on the home page. */
  title: string
  /** One line in Settings, explaining what fills it. */
  note: string
  kind: TileKind
  /** Route the "See all" link points at, when there is a sensible one. */
  seeAll?: string
}

export const HOME_TILES: HomeTile[] = [
  {
    id: 'recentlyPlayed',
    title: 'Jump back in',
    note: 'Tracks you played most recently, on any device.',
    kind: 'songs',
  },
  {
    id: 'mostPlayedSongs',
    title: 'Played the most',
    note: 'Your most-played tracks, by the play count on the server.',
    kind: 'songs',
    seeAll: '/songs',
  },
  {
    id: 'mostPlayedAlbums',
    title: 'Albums you keep coming back to',
    note: 'Albums with the highest play counts.',
    kind: 'albums',
    seeAll: '/albums',
  },
  {
    id: 'mostPlayedArtists',
    title: 'Artists you play most',
    note: 'Worked out by adding up the play counts of each artist’s tracks.',
    kind: 'artists',
    seeAll: '/artists',
  },
  {
    id: 'mostPlayedPlaylists',
    title: 'Playlists on repeat',
    note: 'Ranked by the play counts of the tracks inside them. Needs playlist contents to be synced.',
    kind: 'playlists',
    seeAll: '/playlists',
  },
  {
    id: 'randomSongs',
    title: 'Something else',
    note: 'A different handful of tracks every time you open the page.',
    kind: 'songs',
  },
  {
    id: 'randomAlbums',
    title: 'Albums at random',
    note: 'A different handful of albums every time.',
    kind: 'albums',
  },
  {
    id: 'randomArtists',
    title: 'Artists at random',
    note: 'A different handful of artists every time.',
    kind: 'artists',
  },
  {
    id: 'recentlyAdded',
    title: 'Recently added',
    note: 'The newest albums in your library.',
    kind: 'albums',
    seeAll: '/albums',
  },
  {
    id: 'favouriteSongs',
    title: 'Favourites',
    note: 'Tracks you have hearted.',
    kind: 'songs',
    seeAll: '/favourites',
  },
  {
    id: 'favouriteAlbums',
    title: 'Favourite albums',
    note: 'Albums you have hearted.',
    kind: 'albums',
    seeAll: '/albums',
  },
  {
    id: 'favouriteArtists',
    title: 'Favourite artists',
    note: 'Artists you have hearted.',
    kind: 'artists',
    seeAll: '/artists',
  },
  {
    id: 'favouritePlaylists',
    title: 'Favourite playlists',
    note: 'Playlists you own, newest first.',
    kind: 'playlists',
    seeAll: '/playlists',
  },
  {
    id: 'favouriteRadios',
    title: 'Favourite stations',
    note: 'Internet radio you have hearted on the Radio page.',
    kind: 'radios',
    seeAll: '/radio',
  },
  {
    id: 'radios',
    title: 'Internet radio',
    note: 'Every station configured on your server.',
    kind: 'radios',
    seeAll: '/radio',
  },
]

const BY_ID = new Map(HOME_TILES.map((tile) => [tile.id, tile]))

export function homeTile(id: string): HomeTile | undefined {
  return BY_ID.get(id)
}

/** The enabled tiles, in order, ignoring any id that no longer exists. */
export function resolveHomeTiles(ids: string[]): HomeTile[] {
  const seen = new Set<string>()
  const out: HomeTile[] = []
  for (const id of ids) {
    const tile = BY_ID.get(id)
    if (!tile || seen.has(id)) continue
    seen.add(id)
    out.push(tile)
  }
  return out
}

/** Everything not currently switched on, in catalogue order. */
export function availableHomeTiles(ids: string[]): HomeTile[] {
  const on = new Set(ids)
  return HOME_TILES.filter((tile) => !on.has(tile.id))
}
