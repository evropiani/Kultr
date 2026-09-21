import { getMeta, setMeta } from '@/db'
import type { Song } from '@/api/types'

/**
 * Downloading to a real folder on disk.
 *
 * A web page cannot write to an arbitrary path — it can only write where the
 * person has explicitly pointed it, through the File System Access API. So
 * "choose a download path" means "pick a folder once"; the browser then hands
 * us a handle we can keep, and Kultr writes into that folder from then on.
 *
 * The handle survives reloads because it is stored in IndexedDB, but the
 * *permission* may not, so it is re-checked (and if necessary re-requested,
 * which needs a user gesture) before every batch.
 *
 * Chromium browsers support this. Firefox and Safari do not, and there fall
 * back to storing audio inside the browser, which works everywhere but is not
 * a folder you can browse.
 */

// Minimal shapes — these are not in TypeScript's DOM library yet.
type PermissionMode = { mode?: 'read' | 'readwrite' }

export interface DirectoryHandle {
  kind: 'directory'
  name: string
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandle>
  removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>
  queryPermission?(options?: PermissionMode): Promise<PermissionState>
  requestPermission?(options?: PermissionMode): Promise<PermissionState>
  values(): AsyncIterableIterator<DirectoryHandle | FileHandle>
}

export interface FileHandle {
  kind: 'file'
  name: string
  getFile(): Promise<File>
  createWritable(): Promise<{
    write(data: Blob | BufferSource | string): Promise<void>
    close(): Promise<void>
  }>
}

const HANDLE_KEY = 'offlineFolderHandle'

interface PickerWindow {
  showDirectoryPicker?: (options?: {
    mode?: 'read' | 'readwrite'
    startIn?: string
    id?: string
  }) => Promise<DirectoryHandle>
}

/** Whether this browser can write to a folder the person chooses. */
export function supportsFolderDownloads(): boolean {
  return typeof (window as unknown as PickerWindow).showDirectoryPicker === 'function'
}

/** Ask the person for a folder. Must be called from a user gesture. */
export async function pickDownloadFolder(): Promise<DirectoryHandle | null> {
  const picker = (window as unknown as PickerWindow).showDirectoryPicker
  if (!picker) return null
  try {
    const handle = await picker({ mode: 'readwrite', id: 'kultr-music' })
    await setMeta(HANDLE_KEY, handle)
    return handle
  } catch (err) {
    // The person cancelled the dialog; not an error worth reporting.
    if ((err as Error)?.name === 'AbortError') return null
    throw err
  }
}

export async function getStoredFolder(): Promise<DirectoryHandle | null> {
  const handle = await getMeta<DirectoryHandle | null>(HANDLE_KEY, null)
  return handle ?? null
}

export async function clearDownloadFolder(): Promise<void> {
  await setMeta(HANDLE_KEY, null)
}

/**
 * Confirm we may still write to the folder.
 *
 * `request` re-prompts, which only works inside a user gesture — so call it
 * from a click, not from the middle of a background download.
 */
export async function ensureFolderPermission(
  handle: DirectoryHandle,
  request = false,
): Promise<boolean> {
  try {
    const current = (await handle.queryPermission?.({ mode: 'readwrite' })) ?? 'granted'
    if (current === 'granted') return true
    if (!request) return false
    const asked = (await handle.requestPermission?.({ mode: 'readwrite' })) ?? 'denied'
    return asked === 'granted'
  } catch {
    return false
  }
}

/** Characters that are unsafe in a file name on at least one common platform. */
function safe(part: string): string {
  return (part || 'Unknown')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
}

/**
 * A stable, readable file name for a track.
 *
 * The song id is appended so two tracks that would otherwise collide (same
 * artist, album and title across different releases) cannot overwrite each
 * other, and so a file can be found again from the id alone.
 */
export function fileNameFor(song: Song, extension?: string): string {
  const ext = (extension || song.suffix || 'mp3').replace(/^\./, '')
  const track = song.track ? String(song.track).padStart(2, '0') + ' ' : ''
  return `${safe(song.artist ?? 'Unknown Artist')} - ${safe(song.album ?? 'Unknown Album')} - ${track}${safe(song.title)} [${song.id}].${ext}`
}

export async function writeToFolder(
  handle: DirectoryHandle,
  name: string,
  blob: Blob,
): Promise<void> {
  const file = await handle.getFileHandle(name, { create: true })
  const writable = await file.createWritable()
  try {
    await writable.write(blob)
  } finally {
    await writable.close()
  }
}

export async function readFromFolder(
  handle: DirectoryHandle,
  name: string,
): Promise<File | null> {
  try {
    const file = await handle.getFileHandle(name)
    return await file.getFile()
  } catch {
    return null
  }
}

export async function deleteFromFolder(handle: DirectoryHandle, name: string): Promise<void> {
  try {
    await handle.removeEntry(name)
  } catch {
    /* already gone */
  }
}

/** Every file name currently in the folder, for reconciling what is downloaded. */
export async function listFolder(handle: DirectoryHandle): Promise<Set<string>> {
  const names = new Set<string>()
  try {
    for await (const entry of handle.values()) {
      if (entry.kind === 'file') names.add(entry.name)
    }
  } catch {
    /* permission withdrawn */
  }
  return names
}
