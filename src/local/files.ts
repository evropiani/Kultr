import type { Song } from '@/api/types'
import { isLocalId } from './catalog'
import { allFolders } from './db'
import { fileBlob, playableUrl, type MusicFolder } from './folders'

/**
 * The files behind songs on this computer, for the player and the analyser.
 * Kept apart from the local client so that playing a file does not pull the
 * whole pretend server into every module that plays something.
 */

export { isLocalId }

let folderCache: Map<string, MusicFolder> | null = null

/** Forget the folders read so far, after one is added, removed or granted again. */
export function forgetFolders(): void {
  folderCache = null
}

async function locate(song: Song): Promise<{ folder: MusicFolder; rel: string }> {
  folderCache ??= new Map((await allFolders()).map((folder) => [folder.id, folder]))
  const path = song.path ?? ''
  const slash = path.indexOf('/')
  const folder = slash > 0 ? folderCache.get(path.slice(0, slash)) : undefined
  if (!folder) throw new Error(`“${song.title}” is not in any of your music folders any more.`)
  return { folder, rel: path.slice(slash + 1) }
}

/** Something the player can play for a song on this computer. */
export async function localPlayable(song: Song): Promise<{ url: string; objectUrl: string | null }> {
  const { folder, rel } = await locate(song)
  return playableUrl(folder, rel)
}

/** The whole file of a song on this computer, for analysis or saving. */
export async function localBlob(song: Song): Promise<Blob> {
  const { folder, rel } = await locate(song)
  return fileBlob(folder, rel)
}
