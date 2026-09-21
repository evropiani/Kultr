import { getClient, describeError } from '@/api/subsonic'
import type { Song } from '@/api/types'
import { allOffline, deleteOffline, getOffline, saveOffline, type OfflineTrack } from '@/db'
import {
  deleteFromFolder,
  ensureFolderPermission,
  fileNameFor,
  getStoredFolder,
  listFolder,
  writeToFolder,
  type DirectoryHandle,
} from '@/lib/filesystem'
import { settings } from '@/store/settings'

/**
 * Offline sync.
 *
 * The important property is that it is *incremental*: running it again over
 * the same albums downloads nothing. What counts as "already downloaded"
 * depends on where the audio went — a row in IndexedDB for browser storage, or
 * an actual file still present for a chosen folder, since the person may have
 * deleted files behind our back.
 */

export interface OfflineProgress {
  done: number
  total: number
  downloaded: number
  skipped: number
  failed: number
  bytes: number
  current: string
}

export interface OfflineSummary extends OfflineProgress {
  errors: string[]
  cancelled: boolean
  destination: 'browser' | 'folder'
}

export interface OfflineOptions {
  signal?: AbortSignal
  onProgress?: (progress: OfflineProgress) => void
  /** Re-download even if we already have the track. */
  force?: boolean
}

export class NoFolderChosenError extends Error {
  constructor() {
    super('No download folder has been chosen yet.')
    this.name = 'NoFolderChosenError'
  }
}

/**
 * Work out what still needs downloading.
 *
 * Exported because the UI uses it to label buttons ("Download 12 missing")
 * without starting anything.
 */
export async function pendingDownloads(songs: Song[]): Promise<Song[]> {
  const known = new Map((await allOffline()).map((row) => [row.songId, row]))
  const destination = settings().offlineDestination

  let filesOnDisk: Set<string> | null = null
  if (destination === 'folder') {
    const handle = await getStoredFolder()
    if (handle && (await ensureFolderPermission(handle))) {
      filesOnDisk = await listFolder(handle)
    }
  }

  return songs.filter((song) => {
    const row = known.get(song.id)
    if (!row) return true
    const where = row.destination ?? 'browser'
    if (where !== destination) return true
    if (where === 'browser') return !row.blob
    // Folder: trust the filesystem, not our own bookkeeping.
    if (!row.fileName) return true
    return filesOnDisk ? !filesOnDisk.has(row.fileName) : false
  })
}

/** Download the tracks that are not already available offline. */
export async function downloadForOfflineBatch(
  songs: Song[],
  options: OfflineOptions = {},
): Promise<OfflineSummary> {
  const config = settings()
  const destination = config.offlineDestination
  const errors: string[] = []

  let folder: DirectoryHandle | null = null
  if (destination === 'folder') {
    folder = await getStoredFolder()
    if (!folder) throw new NoFolderChosenError()
    if (!(await ensureFolderPermission(folder))) throw new NoFolderChosenError()
  }

  const queue = options.force ? songs : await pendingDownloads(songs)
  const skipped = songs.length - queue.length

  const progress: OfflineProgress = {
    done: 0,
    total: songs.length,
    downloaded: 0,
    skipped,
    failed: 0,
    bytes: 0,
    current: '',
  }
  // Skipped tracks are already accounted for.
  progress.done = skipped
  options.onProgress?.({ ...progress })

  const client = getClient()
  const concurrency = Math.max(1, Math.min(8, config.offlineConcurrency || 3))
  let cursor = 0
  let cancelled = false

  const worker = async (): Promise<void> => {
    while (cursor < queue.length) {
      if (options.signal?.aborted) {
        cancelled = true
        return
      }
      const song = queue[cursor++]
      progress.current = song.title
      options.onProgress?.({ ...progress })

      try {
        const response = await fetch(client.downloadUrl(song.id), {
          credentials: 'omit',
          signal: options.signal,
        })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const blob = await response.blob()

        const record: OfflineTrack = {
          songId: song.id,
          size: blob.size,
          contentType: blob.type || song.contentType || 'audio/mpeg',
          savedAt: Date.now(),
          destination,
        }

        if (destination === 'folder' && folder) {
          const name = fileNameFor(song)
          await writeToFolder(folder, name, blob)
          record.fileName = name
        } else {
          record.blob = blob
        }

        await saveOffline(record)
        progress.downloaded++
        progress.bytes += blob.size
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') {
          cancelled = true
          return
        }
        progress.failed++
        errors.push(`${song.title}: ${describeError(err)}`)
      } finally {
        progress.done++
        options.onProgress?.({ ...progress })
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length || 1) }, worker))

  return { ...progress, errors, cancelled, destination }
}

/** Remove downloaded audio, from wherever it was stored. */
export async function removeOfflineBatch(songIds: string[]): Promise<number> {
  let removed = 0
  let folder: DirectoryHandle | null = null

  for (const id of songIds) {
    const row = await getOffline(id)
    if (!row) continue
    if ((row.destination ?? 'browser') === 'folder' && row.fileName) {
      if (!folder) folder = await getStoredFolder()
      if (folder && (await ensureFolderPermission(folder))) {
        await deleteFromFolder(folder, row.fileName)
      }
    }
    await deleteOffline(id)
    removed++
  }
  return removed
}
