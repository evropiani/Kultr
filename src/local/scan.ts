import { md5 } from '@/lib/md5'
import type { LocalTrack } from './catalog'
import {
  allFolders,
  coverIds,
  deleteCovers,
  putCover,
  tracksIn,
  writeTracks,
  allTracks,
  setLocalMeta,
  type StoredTrack,
} from './db'
import { AUDIO_TYPES, fileBlob, fileSource, folderAccess, isAudio, isImage, listFiles, type MusicFolder } from './folders'
import { readTags } from './tags'

export interface ScanProgress {
  message: string
  current: number
  total: number
}

export interface ScanResult {
  tracks: number
  added: number
  updated: number
  removed: number
  /** Folders that could not be read this time (permission withdrawn, drive unplugged). */
  unavailable: MusicFolder[]
}

/** Picture files that name themselves as the album's cover, best first. */
const COVER_NAMES = /^(cover|folder|front|album|albumart(small|large)?|albumartwork|thumb)\.(jpe?g|png|webp)$/i

const dirOf = (rel: string) => (rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '')

/**
 * Look through every music folder and bring the stored tracks up to date.
 * Only new or changed files have their tags read, so a second scan of a big
 * library takes seconds. A folder that cannot be read right now keeps its
 * tracks, so unplugging a drive does not empty the library.
 */
export async function scanFolders(
  onProgress: (progress: ScanProgress) => void = () => {},
  signal?: AbortSignal,
): Promise<ScanResult> {
  const folders = await allFolders()
  const result: ScanResult = { tracks: 0, added: 0, updated: 0, removed: 0, unavailable: [] }
  const knownCovers = await coverIds()
  const usedCovers = new Set<string>()

  for (const folder of folders) {
    if (signal?.aborted) throw new DOMException('Scan cancelled', 'AbortError')
    if ((await folderAccess(folder)) !== 'granted') {
      result.unavailable.push(folder)
      for (const track of await tracksIn(folder.id)) if (track.coverId) usedCovers.add(track.coverId)
      continue
    }
    onProgress({ message: `Looking through ${folder.name}…`, current: 0, total: 0 })
    let files
    try {
      files = await listFiles(folder)
    } catch (err) {
      console.warn('[kultr] could not read', folder.name, err)
      result.unavailable.push(folder)
      for (const track of await tracksIn(folder.id)) if (track.coverId) usedCovers.add(track.coverId)
      continue
    }

    const audio = files.filter((file) => isAudio(file.name))
    const pictures = files.filter((file) => isImage(file.name))
    const existing = new Map((await tracksIn(folder.id)).map((track) => [track.path, track]))

    // The cover beside each directory's files: one that names itself, or the only picture there.
    const coverFileFor = new Map<string, (typeof pictures)[number]>()
    const byDir = new Map<string, typeof pictures>()
    for (const picture of pictures) {
      const dir = dirOf(picture.rel)
      if (!byDir.has(dir)) byDir.set(dir, [])
      byDir.get(dir)!.push(picture)
    }
    for (const [dir, list] of byDir) {
      const named = list.find((picture) => COVER_NAMES.test(picture.name))
      const chosen = named ?? (list.length === 1 ? list[0] : undefined)
      if (chosen) coverFileFor.set(dir, chosen)
    }
    // Covers from picture files, made once per picture (and again when it changes).
    const dirCover = new Map<string, string>()
    for (const [dir, picture] of coverFileFor) {
      const id = `local-cover:${md5(`${picture.path}|${picture.size}|${picture.modified}`).slice(0, 20)}`
      if (!knownCovers.has(id)) {
        try {
          await putCover({ id, blob: await shrink(await fileBlob(folder, picture.rel)) })
          knownCovers.add(id)
        } catch {
          continue
        }
      }
      dirCover.set(dir, id)
    }

    const keep: StoredTrack[] = []
    const changed: StoredTrack[] = []
    // A directory with no picture file takes the picture inside its first file that has one.
    const embeddedFor = new Map<string, string>()
    let done = 0
    const queue = [...audio]
    const worker = async () => {
      for (let file = queue.shift(); file; file = queue.shift()) {
        if (signal?.aborted) return
        const dir = dirOf(file.rel)
        const before = existing.get(file.path)
        if (before && before.size === file.size && before.modified === file.modified) {
          const coverId = dirCover.get(dir) ?? before.coverId
          keep.push(coverId === before.coverId ? before : { ...before, coverId })
          if (before.coverId && !dirCover.has(dir)) embeddedFor.set(dir, before.coverId)
        } else {
          const wantPicture = !dirCover.has(dir) && !embeddedFor.has(dir)
          const track = await readTrack(folder, file, wantPicture, knownCovers)
          if (!track.coverId && dirCover.has(dir)) track.coverId = dirCover.get(dir)
          if (track.coverId && !dirCover.has(dir)) embeddedFor.set(dir, track.coverId)
          changed.push(track)
          if (before) result.updated++
          else result.added++
        }
        done++
        if (done % 10 === 0 || done === audio.length) {
          onProgress({ message: `Reading tags in ${folder.name}… ${done} of ${audio.length}`, current: done, total: audio.length })
        }
      }
    }
    await Promise.all(Array.from({ length: 4 }, worker))
    if (signal?.aborted) throw new DOMException('Scan cancelled', 'AbortError')

    // Tracks in a directory with an embedded cover found later share it.
    for (const list of [keep, changed]) {
      for (let i = 0; i < list.length; i++) {
        const dir = dirOf(list[i].path.slice(folder.id.length + 1))
        if (!list[i].coverId && embeddedFor.has(dir)) list[i] = { ...list[i], coverId: embeddedFor.get(dir) }
      }
    }
    const present = new Set(audio.map((file) => file.path))
    const gone = [...existing.keys()].filter((path) => !present.has(path))
    result.removed += gone.length
    // Unchanged tracks are only written again when their cover changed.
    await writeTracks([...changed, ...keep.filter((track) => track !== existing.get(track.path))], gone)
    for (const track of [...keep, ...changed]) if (track.coverId) usedCovers.add(track.coverId)
  }

  // Covers nothing uses any more.
  await deleteCovers([...knownCovers].filter((id) => !usedCovers.has(id)))
  result.tracks = (await allTracks()).length
  await setLocalMeta('lastScan', Date.now())
  return result
}

async function readTrack(
  folder: MusicFolder,
  file: { path: string; rel: string; name: string; size: number; modified: number },
  wantPicture: boolean,
  knownCovers: Set<string>,
): Promise<StoredTrack> {
  const dir = dirOf(file.rel)
  const extension = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.') + 1).toLowerCase() : ''
  const track: StoredTrack = {
    path: file.path,
    fileName: file.name,
    folderId: folder.id,
    folderKey: `${folder.id}/${dir}`,
    folderName: dir ? dir.split('/').pop()! : folder.name,
    modified: file.modified,
    size: file.size,
    mimeType: AUDIO_TYPES[extension],
  }
  try {
    const tags = await readTags(await fileSource(folder, file.rel, file.size), extension, wantPicture)
    Object.assign(track, {
      title: tags.title,
      artist: tags.artist,
      albumArtist: tags.albumArtist,
      album: tags.album,
      track: tags.track,
      disc: tags.disc,
      year: tags.year,
      genre: tags.genre,
      durationMs: tags.durationMs,
      sampleRate: tags.sampleRate,
      lyrics: tags.lyrics,
    } satisfies Partial<LocalTrack>)
    if (tags.durationMs && tags.durationMs > 0 && file.size > 0) {
      track.bitRate = Math.round((file.size * 8) / (tags.durationMs / 1000))
    }
    if (tags.picture?.length) {
      const id = `local-cover:${md5(`${file.path}|${file.modified}`).slice(0, 20)}`
      if (!knownCovers.has(id)) {
        try {
          await putCover({ id, blob: await shrink(new Blob([new Uint8Array(tags.picture)])) })
          knownCovers.add(id)
        } catch {
          /* not a picture the browser can read */
        }
      }
      if (knownCovers.has(id)) track.coverId = id
    }
  } catch (err) {
    // Unreadable tags: the file still plays, with its name as the title.
    console.warn('[kultr] could not read tags of', file.rel, err)
  }
  for (const key of Object.keys(track) as (keyof StoredTrack)[]) if (track[key] === undefined) delete track[key]
  return track
}

/**
 * A cover small enough to keep for every album: at most 600 pixels across,
 * as JPEG. Where the browser cannot draw off-screen, the picture is kept as
 * it is.
 */
async function shrink(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob)
  try {
    const scale = Math.min(1, 600 / Math.max(bitmap.width, bitmap.height))
    if (typeof OffscreenCanvas === 'undefined') return blob
    const canvas = new OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d')
    if (!context) return blob
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    return await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.86 })
  } finally {
    bitmap.close()
  }
}
