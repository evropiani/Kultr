import { getClient, maybeClient, describeError } from '@/api/subsonic'
import type { Album, Artist, Song } from '@/api/types'
import { patchAlbum, patchArtist, patchSong } from '@/db'
import { usePlayer } from '@/store/player'
import { useToast } from '@/store/ui'

/**
 * Keep the in-memory queue in step with a write.
 *
 * Without this the queue still holds the pre-toggle copy of the song, so the
 * player bar and the queue panel disagree with the rest of the app until the
 * next sync — and any component deriving its state from `song.starred` snaps
 * back the moment it re-reads it.
 */
function patchQueue(songId: string, patch: Partial<Song>): void {
  const state = usePlayer.getState()
  if (!state.queue.some((song) => song.id === songId)) return
  usePlayer.setState({
    queue: state.queue.map((song) => (song.id === songId ? { ...song, ...patch } : song)),
    unshuffled:
      state.unshuffled?.map((song) => (song.id === songId ? { ...song, ...patch } : song)) ?? null,
  })
}

/** Star/unstar, writing through to the server and the local mirror. */
export async function toggleStarSong(song: Song): Promise<boolean> {
  const starred = Boolean(song.starred)
  try {
    const client = getClient()
    if (starred) await client.unstar({ id: song.id })
    else await client.star({ id: song.id })
    const value = starred ? undefined : new Date().toISOString()
    await patchSong(song.id, { starred: value })
    patchQueue(song.id, { starred: value })
    return !starred
  } catch (err) {
    useToast.getState().show(describeError(err), 'error')
    return starred
  }
}

export async function toggleStarAlbum(album: Album): Promise<boolean> {
  const starred = Boolean(album.starred)
  try {
    const client = getClient()
    if (starred) await client.unstar({ albumId: album.id })
    else await client.star({ albumId: album.id })
    await patchAlbum(album.id, { starred: starred ? undefined : new Date().toISOString() })
    return !starred
  } catch (err) {
    useToast.getState().show(describeError(err), 'error')
    return starred
  }
}

export async function toggleStarArtist(artist: Artist): Promise<boolean> {
  const starred = Boolean(artist.starred)
  try {
    const client = getClient()
    if (starred) await client.unstar({ artistId: artist.id })
    else await client.star({ artistId: artist.id })
    await patchArtist(artist.id, { starred: starred ? undefined : new Date().toISOString() })
    return !starred
  } catch (err) {
    useToast.getState().show(describeError(err), 'error')
    return starred
  }
}

/** Save the original file to the user's disk. */
export function saveToDisk(song: Song): void {
  const client = maybeClient()
  if (!client) return
  const anchor = document.createElement('a')
  anchor.href = client.downloadUrl(song.id)
  anchor.download = `${song.artist ?? 'Unknown'} - ${song.title}`
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

export async function addToPlaylist(playlistId: string, songIds: string[]): Promise<boolean> {
  try {
    await getClient().updatePlaylist({ playlistId, songIdToAdd: songIds })
    useToast
      .getState()
      .show(
        songIds.length === 1 ? 'Added to playlist.' : `Added ${songIds.length} tracks to playlist.`,
        'success',
      )
    return true
  } catch (err) {
    useToast.getState().show(describeError(err), 'error')
    return false
  }
}

export async function createPlaylistWith(name: string, songIds: string[]): Promise<string | null> {
  try {
    const playlist = await getClient().createPlaylist(name, songIds)
    useToast.getState().show(`Created “${name}”.`, 'success')
    return playlist?.id ?? null
  } catch (err) {
    useToast.getState().show(describeError(err), 'error')
    return null
  }
}

/** Copy a shareable link if the server allows sharing, otherwise the app URL. */
export async function shareSong(song: Song): Promise<void> {
  try {
    const share = await getClient().createShare([song.id], song.title)
    if (share?.url) {
      await navigator.clipboard.writeText(share.url)
      useToast.getState().show('Share link copied to the clipboard.', 'success')
      return
    }
    throw new Error('no share url')
  } catch {
    useToast
      .getState()
      .show('Sharing is not enabled on this server. Ask your admin to turn it on in Navidrome.', 'warning')
  }
}
