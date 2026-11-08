import { blobSource, type ByteSource } from './tags'

/**
 * Where music on this computer comes from. Three kinds, one interface:
 *
 * - `handle`: a folder picked with the File System Access API (Chrome, Edge
 *   and the desktop app). Read in place; nothing is copied. The browser keeps
 *   the folder, but may ask again for permission after a restart.
 * - `opfs`: music imported into Kultr's own storage in the browser (the
 *   origin-private file system). For Firefox and Safari, which cannot open a
 *   folder for good; the files are copied in once and stay.
 * - `desktop`: a folder on disk, read by the desktop app for Windows and
 *   Linux through its own bridge, with no permission prompts at all.
 */
export interface MusicFolder {
  id: string
  name: string
  kind: 'handle' | 'opfs' | 'desktop'
  /** For `handle`: the folder, kept by the browser. (`opfs` looks its own up each time.) */
  handle?: Dir
  /** For `desktop`: the folder's absolute path. */
  path?: string
  added: number
}

/** A file found in a music folder. */
export interface FoundFile {
  /** The folder's id, then the path inside it: what identifies the file. */
  path: string
  /** The path inside the folder. */
  rel: string
  name: string
  size: number
  modified: number
}

// Minimal shapes for the File System Access API; not in TypeScript's DOM library yet.
type Mode = { mode?: 'read' | 'readwrite' }
export interface Dir {
  kind: 'directory'
  name: string
  values(): AsyncIterableIterator<Dir | FileH>
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<Dir>
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileH>
  removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>
  queryPermission?(options?: Mode): Promise<PermissionState>
  requestPermission?(options?: Mode): Promise<PermissionState>
}
export interface FileH {
  kind: 'file'
  name: string
  getFile(): Promise<File>
  createWritable(): Promise<{ write(data: Blob | BufferSource | string): Promise<void>; close(): Promise<void> }>
}

/** What the desktop app adds to the page, for folders on disk. */
export interface DesktopBridge {
  version: string
  platform: string
  pickFolder(): Promise<{ path: string; name: string } | null>
  listFiles(root: string, extensions: string[]): Promise<{ rel: string; size: number; modified: number }[]>
  /** A URL the page can play or fetch (with ranges) for a file in a folder. */
  fileUrl(root: string, rel: string): string
  openExternal?(url: string): void
}

export function desktop(): DesktopBridge | null {
  return (window as unknown as { kultrDesktop?: DesktopBridge }).kultrDesktop ?? null
}

/** The file types a browser can play, by extension, and what to call them. */
export const AUDIO_TYPES: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  aac: 'audio/aac',
  flac: 'audio/flac',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg; codecs=opus',
  wav: 'audio/wav',
  wave: 'audio/wav',
  aif: 'audio/aiff',
  aiff: 'audio/aiff',
  webm: 'audio/webm',
}
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp']
const extensionOf = (name: string) => (name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : '')
export const isAudio = (name: string) => extensionOf(name) in AUDIO_TYPES
export const isImage = (name: string) => IMAGE_EXTENSIONS.includes(extensionOf(name))

interface PickerWindow {
  showDirectoryPicker?: (options?: Mode & { id?: string }) => Promise<Dir>
}

/** Whether a folder can be opened and read in place (Chrome, Edge, the desktop app). */
export function canOpenFolders(): boolean {
  return Boolean(desktop()) || typeof (window as unknown as PickerWindow).showDirectoryPicker === 'function'
}

/** Whether music can be imported into the browser's own storage (every current browser). */
export function canImport(): boolean {
  return typeof navigator.storage?.getDirectory === 'function'
}

const newId = () => `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

/** Ask for a folder of music. Must be called from a click. Null if the person cancelled. */
export async function pickFolder(): Promise<MusicFolder | null> {
  const bridge = desktop()
  if (bridge) {
    const picked = await bridge.pickFolder()
    return picked ? { id: newId(), name: picked.name, kind: 'desktop', path: picked.path, added: Date.now() } : null
  }
  const picker = (window as unknown as PickerWindow).showDirectoryPicker
  if (!picker) return null
  try {
    const handle = await picker({ mode: 'read', id: 'kultr-library' })
    return { id: newId(), name: handle.name, kind: 'handle', handle, added: Date.now() }
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') return null
    throw err
  }
}

/** Kultr's own music folder in the browser's storage, made on first use. */
export function importedFolder(): MusicFolder {
  return { id: 'imported', name: 'Imported into Kultr', kind: 'opfs', added: Date.now() }
}

/**
 * The directory behind a folder. Imported music is looked up afresh rather
 * than kept as a handle: it is always in the same place, and a stored handle
 * to the browser's own storage is one more thing that can go stale.
 */
async function rootOf(folder: MusicFolder): Promise<Dir | null> {
  if (folder.kind === 'opfs') {
    const root = (await navigator.storage.getDirectory()) as unknown as Dir
    return root.getDirectoryHandle('music', { create: true })
  }
  return folder.handle ?? null
}

/** Delete everything imported into Kultr's own storage. */
export async function clearImported(): Promise<void> {
  try {
    const root = (await navigator.storage.getDirectory()) as unknown as Dir
    await root.removeEntry('music', { recursive: true })
  } catch {
    /* nothing imported, or already gone */
  }
}

/**
 * Copy files into Kultr's own storage, keeping the folders they came in (a
 * folder picked with webkitdirectory gives each file its relative path).
 */
export async function importFiles(files: File[], onProgress?: (done: number, total: number) => void): Promise<number> {
  const root = (await rootOf(importedFolder()))!
  const audio = files.filter((file) => isAudio(file.name) || isImage(file.name))
  // Ask the browser not to clear these under storage pressure.
  void navigator.storage.persist?.()
  let done = 0
  for (const file of audio) {
    const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
    const parts = rel.split('/').filter(Boolean)
    let dir = root
    for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(safeName(part), { create: true })
    const target = await dir.getFileHandle(safeName(parts[parts.length - 1]), { create: true })
    const writable = await target.createWritable()
    await writable.write(file)
    await writable.close()
    onProgress?.(++done, audio.length)
  }
  return done
}

const safeName = (part: string) => part.replace(/[\\/:*?"<>|]/g, '-').slice(0, 200) || 'untitled'

/** Whether Kultr may read the folder right now; `prompt` means a click can bring it back. */
export async function folderAccess(folder: MusicFolder): Promise<PermissionState> {
  if (folder.kind !== 'handle' || !folder.handle) return 'granted'
  try {
    return (await folder.handle.queryPermission?.({ mode: 'read' })) ?? 'granted'
  } catch {
    return 'denied'
  }
}

/** Ask again for a folder the browser has stopped letting Kultr read. Must be called from a click. */
export async function requestFolderAccess(folder: MusicFolder): Promise<boolean> {
  if (folder.kind !== 'handle' || !folder.handle) return true
  try {
    return ((await folder.handle.requestPermission?.({ mode: 'read' })) ?? 'granted') === 'granted'
  } catch {
    return false
  }
}

/** Every file in the folder and the folders inside it (audio and cover pictures). */
export async function listFiles(folder: MusicFolder): Promise<FoundFile[]> {
  if (folder.kind === 'desktop') {
    const bridge = desktop()
    if (!bridge || !folder.path) return []
    const rows = await bridge.listFiles(folder.path, [...Object.keys(AUDIO_TYPES), ...IMAGE_EXTENSIONS])
    return rows.map((row) => ({
      path: `${folder.id}/${row.rel}`,
      rel: row.rel,
      name: row.rel.split('/').pop() ?? row.rel,
      size: row.size,
      modified: row.modified,
    }))
  }
  const out: FoundFile[] = []
  const walk = async (dir: Dir, prefix: string, depth: number) => {
    if (depth > 24) return
    for await (const entry of dir.values()) {
      if (entry.name.startsWith('.')) continue
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.kind === 'directory') await walk(entry, rel, depth + 1)
      else if (isAudio(entry.name) || isImage(entry.name)) {
        try {
          const file = await entry.getFile()
          out.push({ path: `${folder.id}/${rel}`, rel, name: entry.name, size: file.size, modified: file.lastModified })
        } catch {
          /* gone or unreadable since it was listed */
        }
      }
    }
  }
  const root = await rootOf(folder)
  if (root) await walk(root, '', 0)
  return out
}

async function fileHandle(folder: MusicFolder, rel: string): Promise<FileH> {
  const parts = rel.split('/')
  let dir = await rootOf(folder)
  if (!dir) throw new Error(`${folder.name} cannot be read`)
  for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part)
  return dir.getFileHandle(parts[parts.length - 1])
}

/** Random access to a file's bytes, for reading its tags. */
export async function fileSource(folder: MusicFolder, rel: string, size: number): Promise<ByteSource> {
  if (folder.kind === 'desktop') return rangeSource(desktop()!.fileUrl(folder.path!, rel), size)
  return blobSource(await (await fileHandle(folder, rel)).getFile())
}

/** The whole file, for playing it, analysing it or reading a picture. */
export async function fileBlob(folder: MusicFolder, rel: string): Promise<Blob> {
  if (folder.kind === 'desktop') {
    const response = await fetch(desktop()!.fileUrl(folder.path!, rel))
    if (!response.ok) throw new Error(`Could not read ${rel}`)
    return response.blob()
  }
  return (await fileHandle(folder, rel)).getFile()
}

/**
 * Something an <audio> element can play: the desktop app's file URL, or an
 * object URL for the file (which the caller revokes when done).
 */
export async function playableUrl(folder: MusicFolder, rel: string): Promise<{ url: string; objectUrl: string | null }> {
  if (folder.kind === 'desktop') return { url: desktop()!.fileUrl(folder.path!, rel), objectUrl: null }
  const file = await (await fileHandle(folder, rel)).getFile()
  const objectUrl = URL.createObjectURL(file)
  return { url: objectUrl, objectUrl }
}

/** Remove a file from Kultr's own storage (imported music only). */
export async function removeImported(folder: MusicFolder, rel: string): Promise<void> {
  if (folder.kind !== 'opfs') return
  const parts = rel.split('/')
  let dir = (await rootOf(folder))!
  for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part)
  await dir.removeEntry(parts[parts.length - 1])
}

/** A file over HTTP, read with range requests in 64 KB blocks. */
function rangeSource(url: string, size: number): ByteSource {
  const BLOCK = 64 * 1024
  const blocks = new Map<number, Promise<Uint8Array>>()
  const block = (index: number) => {
    let got = blocks.get(index)
    if (!got) {
      const start = index * BLOCK
      const end = Math.min(size, start + BLOCK) - 1
      got = fetch(url, { headers: { Range: `bytes=${start}-${end}` } })
        .then((response) => response.arrayBuffer())
        .then((buffer) => new Uint8Array(buffer))
      blocks.set(index, got)
      if (blocks.size > 96) blocks.delete(blocks.keys().next().value as number)
    }
    return got
  }
  return {
    size,
    async read(offset, count) {
      if (offset < 0 || offset >= size || count <= 0) return new Uint8Array(0)
      const end = Math.min(size, offset + count)
      const first = Math.floor(offset / BLOCK)
      const last = Math.floor((end - 1) / BLOCK)
      const parts = await Promise.all(Array.from({ length: last - first + 1 }, (_, i) => block(first + i)))
      const out = new Uint8Array(end - offset)
      let written = 0
      parts.forEach((part, i) => {
        const partStart = (first + i) * BLOCK
        const from = Math.max(0, offset - partStart)
        const to = Math.min(part.length, end - partStart)
        if (to > from) out.set(part.subarray(from, to), written)
        written += Math.max(0, to - from)
      })
      return out
    },
  }
}
