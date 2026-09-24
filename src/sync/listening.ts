import { maybeClient, NetworkError } from '@/api/subsonic'
import type { Album, Song } from '@/api/types'
import { getAlbum, getMeta, patchAlbum, pendingHistory, putSongs, setMeta, settleHistory } from '@/db'

/**
 * Listening data, kept where every device can see it.
 *
 * Navidrome already stores what matters across devices: every track's play
 * count and when it was last played, fed by scrobbles. That is what its own
 * "recently played" and "most played" are built from. So rather than keep a
 * second, private copy that dies with the browser's storage, Kultr sends
 * every play there and reads the numbers back:
 *
 *  - **Push.** A play is written to the local history marked `pending`, then
 *    scrobbled with the time it actually happened. If that fails (offline,
 *    server down) it stays pending and is retried later with the original
 *    time, so nothing played on a train is lost.
 *  - **Pull.** Albums come back from the server with their own play count and
 *    last-played time. When those differ from the mirror, the album was played
 *    somewhere — here or on another device — and its tracks are re-read, which
 *    brings their play counts and last-played times up to date.
 *
 * After clearing the browser's data, a sync brings all of it back: counts and
 * last-played times arrive with the library.
 */

const WATERMARK_KEY = 'listeningPulledThrough'
const RECENT_PAGE = 100
const MAX_PAGES = 5
const MAX_ALBUM_REFRESH = 120
/**
 * A play this fresh may still have its own scrobble in flight from another
 * tab (a request gives up after 30 seconds); leave it to that tab.
 */
const IN_FLIGHT_MS = 35_000

/** History entries this tab is sending right now, never to be sent twice. */
const inFlight = new Set<number>()

/** Send one play now, as it happens, keeping it out of the retry queue meanwhile. */
export async function sendPlay(entryId: number | undefined, songId: string, playedAt: number): Promise<void> {
  const client = maybeClient()
  if (!client) return
  if (entryId !== undefined) inFlight.add(entryId)
  try {
    await client.scrobble(songId, true, playedAt)
    if (entryId !== undefined) await settleHistory([entryId])
  } finally {
    if (entryId !== undefined) inFlight.delete(entryId)
  }
}

let pushing: Promise<number> | null = null
let pulling: Promise<ListeningPull> | null = null

/** Send plays that have not reached the server yet. Returns how many went. */
export function flushPendingScrobbles(): Promise<number> {
  if (!pushing) {
    pushing = pushPending().finally(() => {
      pushing = null
    })
  }
  return pushing
}

async function pushPending(): Promise<number> {
  const client = maybeClient()
  if (!client) return 0
  const pending = await pendingHistory()
  const cutoff = Date.now() - IN_FLIGHT_MS
  let sent = 0
  for (const entry of pending) {
    if (entry.id === undefined || entry.playedAt > cutoff || inFlight.has(entry.id)) continue
    try {
      await client.scrobble(entry.songId, true, entry.playedAt)
      await settleHistory([entry.id])
      sent++
    } catch (err) {
      // Still unreachable: stop, keep the rest queued, try again later.
      if (err instanceof NetworkError) break
      // The server answered and refused — most likely the track no longer
      // exists. Retrying would fail forever, so let it go.
      await settleHistory([entry.id])
    }
  }
  return sent
}

export interface ListeningPull {
  albumsChanged: number
  songsRefreshed: number
}

/** Bring play counts and last-played times in from the server. */
export function pullListening(): Promise<ListeningPull> {
  if (!pulling) {
    pulling = pullRecent().finally(() => {
      pulling = null
    })
  }
  return pulling
}

async function pullRecent(): Promise<ListeningPull> {
  const client = maybeClient()
  if (!client) return { albumsChanged: 0, songsRefreshed: 0 }

  const watermark = await getMeta<string>(WATERMARK_KEY, '')
  let newest = watermark
  const changed: Album[] = []

  // Most recently played first. Once a page reaches plays older than the last
  // pull, everything after it is already known.
  for (let page = 0; page < MAX_PAGES; page++) {
    const albums = await client.getAlbumList2({ type: 'recent', size: RECENT_PAGE, offset: page * RECENT_PAGE })
    for (const album of albums) {
      if (album.played && album.played > newest) newest = album.played
      const local = await getAlbum(album.id)
      // Albums the mirror does not have yet are the library sync's job.
      if (!local) continue
      if ((local.playCount ?? 0) !== (album.playCount ?? 0) || (local.played ?? '') !== (album.played ?? '')) {
        changed.push(album)
      }
    }
    const oldest = albums[albums.length - 1]?.played
    if (albums.length < RECENT_PAGE || (watermark && oldest && oldest <= watermark)) break
  }

  let songsRefreshed = 0
  const queue = changed.slice(0, MAX_ALBUM_REFRESH)
  const worker = async () => {
    for (let album = queue.shift(); album; album = queue.shift()) {
      try {
        const detail = await client.getAlbum(album.id)
        const songs: Song[] = detail?.song ?? []
        await putSongs(songs)
        await patchAlbum(album.id, { playCount: album.playCount, played: album.played })
        songsRefreshed += songs.length
      } catch {
        /* next time */
      }
    }
  }
  await Promise.all([worker(), worker(), worker()])

  if (newest && newest !== watermark) await setMeta(WATERMARK_KEY, newest)
  return { albumsChanged: changed.length, songsRefreshed }
}

/** Both directions: send what is queued, then read back what changed. */
export async function syncListening(): Promise<ListeningPull & { sent: number }> {
  const sent = await flushPendingScrobbles().catch(() => 0)
  const pulled = await pullListening().catch(() => ({ albumsChanged: 0, songsRefreshed: 0 }))
  return { sent, ...pulled }
}
