/**
 * Reads the tags of music files: ID3 (MP3, and ID3 before or inside other
 * formats), FLAC's Vorbis comments and pictures, MP4/M4A (AAC, ALAC) item
 * lists, WAV and AIFF, and Ogg Vorbis and Opus comments, plus each format's
 * length where it says it. A port of Kultr for iOS's reader (AudioTags.swift)
 * with the formats a browser plays and an iPhone does not added.
 *
 * Only the bytes that are needed are read, through a ByteSource, so scanning a
 * folder of large FLAC files does not read the audio itself.
 */

export interface AudioTags {
  title?: string
  artist?: string
  albumArtist?: string
  album?: string
  track?: number
  disc?: number
  year?: number
  genre?: string
  durationMs?: number
  sampleRate?: number
  /** Unsynchronised lyrics embedded in the file. */
  lyrics?: string
  /** The cover picture inside the file (the front cover if one is marked), when asked for. */
  picture?: Uint8Array
}

/** Random access to a file's bytes. */
export interface ByteSource {
  size: number
  /** Up to `count` bytes from `offset`; fewer at the end. */
  read(offset: number, count: number): Promise<Uint8Array>
}

/** Bytes already in memory. */
export function bytesSource(data: Uint8Array): ByteSource {
  return {
    size: data.length,
    async read(offset, count) {
      if (offset < 0 || offset >= data.length || count <= 0) return new Uint8Array(0)
      return data.subarray(offset, Math.min(data.length, offset + count))
    },
  }
}

const BLOCK = 64 * 1024

/**
 * A file (or any Blob), read in 64 KB blocks that are kept for the rest of
 * the read, so the many small reads of a tag parser cost few disk reads.
 */
export function blobSource(blob: Blob): ByteSource {
  const blocks = new Map<number, Promise<Uint8Array>>()
  const block = (index: number) => {
    let got = blocks.get(index)
    if (!got) {
      const start = index * BLOCK
      got = blob
        .slice(start, Math.min(blob.size, start + BLOCK))
        .arrayBuffer()
        .then((buffer) => new Uint8Array(buffer))
      blocks.set(index, got)
      if (blocks.size > 96) blocks.delete(blocks.keys().next().value as number)
    }
    return got
  }
  return {
    size: blob.size,
    async read(offset, count) {
      if (offset < 0 || offset >= blob.size || count <= 0) return new Uint8Array(0)
      const end = Math.min(blob.size, offset + count)
      // Big reads (a picture, a whole tag) go straight to the file.
      if (end - offset > BLOCK * 4) return new Uint8Array(await blob.slice(offset, end).arrayBuffer())
      const first = Math.floor(offset / BLOCK)
      const last = Math.floor((end - 1) / BLOCK)
      const parts = await Promise.all(Array.from({ length: last - first + 1 }, (_, i) => block(first + i)))
      const out = new Uint8Array(end - offset)
      let written = 0
      parts.forEach((part, i) => {
        const partStart = (first + i) * BLOCK
        const from = Math.max(0, offset - partStart)
        const to = Math.min(part.length, end - partStart)
        out.set(part.subarray(from, to), written)
        written += to - from
      })
      return out
    },
  }
}

/** A window of another source, as if it were a file of its own. */
function offsetSource(base: ByteSource, start: number, length: number): ByteSource {
  const size = Math.max(0, Math.min(length, base.size - start))
  return {
    size,
    async read(offset, count) {
      if (offset < 0 || offset >= size) return new Uint8Array(0)
      return base.read(start + offset, Math.min(count, size - offset))
    },
  }
}

/** Fills what `tags` has not got from `other`. */
function fill(tags: AudioTags, other: AudioTags): AudioTags {
  for (const key of Object.keys(other) as (keyof AudioTags)[]) {
    if (tags[key] === undefined && other[key] !== undefined) (tags as Record<string, unknown>)[key] = other[key]
  }
  return tags
}

export async function readTags(source: ByteSource, fileExtension: string, wantPicture = false): Promise<AudioTags> {
  const tags: AudioTags = {}
  let offset = 0
  // ID3v2 comes first in an MP3, and sometimes before a FLAC stream as well.
  for (let guard = 0; guard < 4; guard++) {
    const found = await readID3v2(source, offset, wantPicture)
    if (!found) break
    fill(tags, found.tags)
    offset += found.length
  }
  const magic = await source.read(offset, 12)
  const ascii = (from: number, to: number) => latin1(magic.subarray(from, to))
  const ext = fileExtension.toLowerCase()
  if (ascii(0, 4) === 'fLaC') {
    fill(tags, await readFLAC(source, offset + 4, wantPicture))
  } else if (ascii(4, 8) === 'ftyp') {
    fill(tags, await readMP4(source, wantPicture))
  } else if (ascii(0, 4) === 'RIFF') {
    fill(tags, await readWAV(source, wantPicture))
  } else if (ascii(0, 4) === 'FORM' && (ascii(8, 12) === 'AIFF' || ascii(8, 12) === 'AIFC')) {
    fill(tags, await readAIFF(source, wantPicture))
  } else if (ascii(0, 4) === 'OggS') {
    fill(tags, await readOgg(source, wantPicture))
  } else if (['mp3', 'mp2', 'mpga'].includes(ext) || (magic[0] === 0xff && (magic[1] & 0xe0) === 0xe0)) {
    fill(tags, await readMPEGLength(source, offset))
    fill(tags, await readID3v1(source))
  }
  return tags
}

// ------------------------------------------------------------------ ID3v2 --

async function readID3v2(
  source: ByteSource,
  offset: number,
  wantPicture: boolean,
): Promise<{ tags: AudioTags; length: number } | null> {
  const header = await source.read(offset, 10)
  if (header.length !== 10 || header[0] !== 0x49 || header[1] !== 0x44 || header[2] !== 0x33) return null
  const version = header[3]
  if (version < 2 || version > 4) return null
  const flags = header[5]
  const tagSize = syncsafe(header, 6)
  const length = 10 + tagSize + (flags & 0x10 ? 10 : 0)
  const tags: AudioTags = {}

  // A tag unsynchronised as a whole (ID3v2.2/2.3) has to be read in full and undone first.
  let body: ByteSource = offsetSource(source, offset + 10, tagSize)
  if (flags & 0x80 && version < 4) body = bytesSource(unsynchronise(await source.read(offset + 10, tagSize)))
  let position = 0
  if (flags & 0x40 && version >= 3) {
    const ext = await body.read(0, 4)
    if (ext.length !== 4) return { tags, length }
    position = version === 4 ? syncsafe(ext, 0) : bigEndian(ext, 0, 4) + 4
  }

  const idLength = version === 2 ? 3 : 4
  const headerLength = version === 2 ? 6 : 10
  let pictureType: number | undefined
  while (position + headerLength <= body.size) {
    const frame = await body.read(position, headerLength)
    if (frame.length !== headerLength || frame[0] === 0) break
    const id = latin1(frame.subarray(0, idLength))
    const size = version === 2 ? bigEndian(frame, 3, 3) : version === 3 ? bigEndian(frame, 4, 4) : syncsafe(frame, 4)
    const formatFlags = version === 4 ? frame[9] : 0
    const start = position + headerLength
    position = start + size
    if (size <= 0) continue
    if (position > body.size) break
    const isPicture = id === 'APIC' || id === 'PIC'
    const isLyrics = id === 'USLT' || id === 'ULT'
    if (isPicture && !wantPicture) continue
    // Compressed or encrypted frames are not worth undoing for a tag reader.
    if (version === 4 && formatFlags & 0x0c) continue
    if (version === 3 && frame[9] & 0xc0) continue
    if (!isPicture && !isLyrics && !id.startsWith('T')) continue
    let content = await body.read(start, size)
    if (version === 4 && formatFlags & 0x01) content = content.subarray(4)
    if (version === 4 && formatFlags & 0x02) content = unsynchronise(content)

    if (isPicture) {
      const picture = id3Picture(content, id === 'PIC')
      if (picture && pictureType !== 3 && (!tags.picture || picture.type === 3)) {
        tags.picture = picture.data
        pictureType = picture.type
      }
      continue
    }
    if (isLyrics) {
      tags.lyrics ??= id3Lyrics(content)
      continue
    }
    const text = id3Text(content)
    if (!text) continue
    switch (id) {
      case 'TIT2':
      case 'TT2':
        tags.title ??= text
        break
      case 'TPE1':
      case 'TP1':
        tags.artist ??= text
        break
      case 'TPE2':
      case 'TP2':
        tags.albumArtist ??= text
        break
      case 'TALB':
      case 'TAL':
        tags.album ??= text
        break
      case 'TRCK':
      case 'TRK':
        tags.track ??= leadingNumber(text)
        break
      case 'TPOS':
      case 'TPA':
        tags.disc ??= leadingNumber(text)
        break
      case 'TYER':
      case 'TYE':
      case 'TDRC':
      case 'TDOR':
      case 'TORY':
        tags.year ??= yearOf(text)
        break
      case 'TCON':
      case 'TCO':
        tags.genre ??= genreOf(text)
        break
      case 'TLEN':
      case 'TLE': {
        const ms = Number(text)
        if (Number.isFinite(ms) && ms > 0) tags.durationMs ??= ms
        break
      }
    }
  }
  return { tags, length }
}

/** The text of an ID3 text frame: its first value, in its encoding. */
function id3Text(bytes: Uint8Array): string | undefined {
  if (!bytes.length) return undefined
  // Several values are separated by nulls; the first is the one to show.
  return clean(decode(bytes.subarray(1), bytes[0]).split('\u0000')[0])
}

/** USLT: encoding, a language, a description ended by a null, then the lyrics. */
function id3Lyrics(bytes: Uint8Array): string | undefined {
  if (bytes.length < 5) return undefined
  const encoding = bytes[0]
  let i = 4
  i = skipTerminated(bytes, i, encoding)
  return clean(decode(bytes.subarray(i), encoding))
}

function skipTerminated(bytes: Uint8Array, start: number, encoding: number): number {
  let i = start
  if (encoding === 1 || encoding === 2) {
    while (i + 1 < bytes.length && !(bytes[i] === 0 && bytes[i + 1] === 0)) i += 2
    return i + 2
  }
  while (i < bytes.length && bytes[i] !== 0) i++
  return i + 1
}

function id3Picture(bytes: Uint8Array, v22: boolean): { type: number; data: Uint8Array } | undefined {
  if (bytes.length <= 4) return undefined
  const encoding = bytes[0]
  let i = 1
  if (v22) i += 3
  else {
    while (i < bytes.length && bytes[i] !== 0) i++
    i++
  }
  if (i >= bytes.length) return undefined
  const type = bytes[i++]
  // The description ends with one null, or two in UTF-16.
  i = skipTerminated(bytes, i, encoding)
  if (i >= bytes.length) return undefined
  return { type, data: bytes.slice(i) }
}

function decode(bytes: Uint8Array, encoding: number): string {
  try {
    switch (encoding) {
      case 1:
        if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2))
        if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2))
        return new TextDecoder('utf-16le').decode(bytes)
      case 2:
        return new TextDecoder('utf-16be').decode(bytes)
      case 3:
        return new TextDecoder('utf-8').decode(bytes)
      default:
        return latin1(bytes)
    }
  } catch {
    return ''
  }
}

function unsynchronise(data: Uint8Array): Uint8Array {
  const out = new Uint8Array(data.length)
  let n = 0
  let previous = 0
  for (const byte of data) {
    if (previous === 0xff && byte === 0x00) {
      previous = 0
      continue
    }
    out[n++] = byte
    previous = byte
  }
  return out.subarray(0, n)
}

// ------------------------------------------------------------------ ID3v1 --

async function readID3v1(source: ByteSource): Promise<AudioTags> {
  if (source.size < 128) return {}
  const b = await source.read(source.size - 128, 128)
  if (b.length !== 128 || latin1(b.subarray(0, 3)) !== 'TAG') return {}
  const field = (start: number, length: number) => {
    const slice = b.subarray(start, start + length)
    const end = slice.indexOf(0)
    return clean(latin1(end >= 0 ? slice.subarray(0, end) : slice))
  }
  const year = field(93, 4)
  const tags: AudioTags = { title: field(3, 30), artist: field(33, 30), album: field(63, 30), year: year ? yearOf(year) : undefined }
  if (b[125] === 0 && b[126] !== 0) tags.track = b[126]
  if (b[127] < GENRES.length) tags.genre = GENRES[b[127]]
  for (const key of Object.keys(tags) as (keyof AudioTags)[]) if (tags[key] === undefined) delete tags[key]
  return tags
}

// ------------------------------------------------------------------- MPEG --

/** Sample rate and length of an MP3, from its first frame (and the Xing/Info or VBRI header in it, if any). */
async function readMPEGLength(source: ByteSource, offset: number): Promise<AudioTags> {
  // The first frame is usually right after the tag; allow a little padding.
  const window = await source.read(offset, 64 * 1024)
  for (let i = 0; i + 4 <= window.length; i++) {
    if (window[i] !== 0xff || (window[i + 1] & 0xe0) !== 0xe0) continue
    const frame = mpegFrame(window, i)
    if (!frame) continue
    const frameStart = offset + i
    const header = await source.read(frameStart, 200)
    let frames: number | undefined
    const xing = frame.xingOffset
    if (header.length >= xing + 12) {
      const tag = latin1(header.subarray(xing, xing + 4))
      if ((tag === 'Xing' || tag === 'Info') && header[xing + 7] & 0x01) frames = bigEndian(header, xing + 8, 4)
    }
    if (frames === undefined && header.length >= 36 + 18 && latin1(header.subarray(36, 40)) === 'VBRI') {
      frames = bigEndian(header, 36 + 14, 4)
    }
    const tags: AudioTags = { sampleRate: frame.sampleRate }
    if (frames && frames > 0) {
      tags.durationMs = Math.floor((frames * frame.samplesPerFrame * 1000) / frame.sampleRate)
    } else if (frame.bitRate > 0) {
      // Constant bit rate: the length follows from the size.
      let audio = source.size - frameStart
      if (source.size >= 128 && latin1(await source.read(source.size - 128, 3)) === 'TAG') audio -= 128
      tags.durationMs = Math.floor((audio * 8 * 1000) / frame.bitRate)
    }
    return tags
  }
  return {}
}

function mpegFrame(b: Uint8Array, i: number) {
  const versionBits = (b[i + 1] >> 3) & 0x03 // 3 = MPEG 1, 2 = MPEG 2, 0 = MPEG 2.5
  const layerBits = (b[i + 1] >> 1) & 0x03 // 1 = Layer III
  const bitrateIndex = b[i + 2] >> 4
  const rateIndex = (b[i + 2] >> 2) & 0x03
  if (versionBits === 1 || layerBits !== 1 || bitrateIndex === 0 || bitrateIndex === 15 || rateIndex === 3) return null
  const mpeg1 = versionBits === 3
  const sampleRate = [44100, 48000, 32000][rateIndex] / (mpeg1 ? 1 : versionBits === 2 ? 2 : 4)
  const rates1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
  const rates2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160]
  const bitRate = (mpeg1 ? rates1 : rates2)[bitrateIndex] * 1000
  const mono = b[i + 3] >> 6 === 3
  const side = mpeg1 ? (mono ? 17 : 32) : mono ? 9 : 17
  return { sampleRate, bitRate, samplesPerFrame: mpeg1 ? 1152 : 576, xingOffset: 4 + side }
}

// ------------------------------------------------------------------- FLAC --

async function readFLAC(source: ByteSource, start: number, wantPicture: boolean): Promise<AudioTags> {
  const tags: AudioTags = {}
  let offset = start
  let pictureType: number | undefined
  for (let n = 0; n < 64; n++) {
    const header = await source.read(offset, 4)
    if (header.length !== 4) break
    const last = (header[0] & 0x80) !== 0
    const type = header[0] & 0x7f
    const length = bigEndian(header, 1, 3)
    const body = offset + 4
    if (type === 0) {
      const info = await source.read(body, 18)
      if (info.length === 18) {
        const rate = (info[10] << 12) | (info[11] << 4) | (info[12] >> 4)
        const samples = (info[13] & 0x0f) * 2 ** 32 + bigEndian(info, 14, 4)
        if (rate > 0) {
          tags.sampleRate = rate
          if (samples > 0) tags.durationMs = Math.floor((samples * 1000) / rate)
        }
      }
    } else if (type === 4) {
      fill(tags, vorbisComments(await source.read(body, length), wantPicture))
    } else if (type === 6 && wantPicture) {
      const picture = flacPicture(await source.read(body, length))
      if (picture && pictureType !== 3 && (!tags.picture || picture.type === 3)) {
        tags.picture = picture.data
        pictureType = picture.type
      }
    }
    offset = body + length
    if (last) break
  }
  return tags
}

function vorbisComments(b: Uint8Array, wantPicture: boolean): AudioTags {
  const tags: AudioTags = {}
  if (b.length < 8) return tags
  let i = 4 + littleEndian(b, 0, 4)
  if (i + 4 > b.length) return tags
  const count = littleEndian(b, i, 4)
  i += 4
  const utf8 = new TextDecoder('utf-8')
  for (let n = 0; n < Math.min(count, 1000); n++) {
    if (i + 4 > b.length) break
    const length = littleEndian(b, i, 4)
    i += 4
    if (length < 0 || i + length > b.length) break
    const comment = utf8.decode(b.subarray(i, i + length))
    i += length
    const equals = comment.indexOf('=')
    if (equals < 0) continue
    const key = comment.slice(0, equals).toUpperCase()
    const raw = comment.slice(equals + 1)
    if (key === 'METADATA_BLOCK_PICTURE') {
      if (wantPicture && !tags.picture) {
        try {
          const picture = flacPicture(Uint8Array.from(atob(raw.trim()), (c) => c.charCodeAt(0)))
          if (picture) tags.picture = picture.data
        } catch {
          /* not base64; ignore */
        }
      }
      continue
    }
    const value = clean(raw)
    if (!value) continue
    switch (key) {
      case 'TITLE':
        tags.title ??= value
        break
      case 'ARTIST':
        tags.artist ??= value
        break
      case 'ALBUMARTIST':
      case 'ALBUM ARTIST':
      case 'ALBUM_ARTIST':
        tags.albumArtist ??= value
        break
      case 'ALBUM':
        tags.album ??= value
        break
      case 'TRACKNUMBER':
        tags.track ??= leadingNumber(value)
        break
      case 'DISCNUMBER':
        tags.disc ??= leadingNumber(value)
        break
      case 'DATE':
      case 'YEAR':
      case 'ORIGINALDATE':
        tags.year ??= yearOf(value)
        break
      case 'GENRE':
        tags.genre ??= genreOf(value)
        break
      case 'LYRICS':
      case 'UNSYNCEDLYRICS':
        tags.lyrics ??= value
        break
    }
  }
  return tags
}

function flacPicture(b: Uint8Array): { type: number; data: Uint8Array } | undefined {
  if (b.length < 32) return undefined
  const type = bigEndian(b, 0, 4)
  let i = 4
  i += 4 + bigEndian(b, i, 4)
  if (i + 4 > b.length) return undefined
  i += 4 + bigEndian(b, i, 4) + 16
  if (i + 4 > b.length) return undefined
  const length = bigEndian(b, i, 4)
  i += 4
  if (length <= 0 || i + length > b.length) return undefined
  return { type, data: b.slice(i, i + length) }
}

// -------------------------------------------------------------------- MP4 --

async function readMP4(source: ByteSource, wantPicture: boolean): Promise<AudioTags> {
  const tags: AudioTags = {}
  for (const moov of await atoms(source, 0, source.size)) {
    if (moov.type !== 'moov') continue
    for (const child of await atoms(source, moov.start, moov.start + moov.length)) {
      if (child.type === 'mvhd') {
        const b = await source.read(child.start, 32)
        if (b.length < 24) continue
        const v1 = b[0] === 1
        const timescale = v1 ? bigEndian(b, 20, 4) : bigEndian(b, 12, 4)
        const duration = v1 && b.length >= 32 ? bigEndian(b, 24, 4) * 2 ** 32 + bigEndian(b, 28, 4) : bigEndian(b, 16, 4)
        if (timescale > 0 && duration > 0) tags.durationMs = Math.floor((duration * 1000) / timescale)
      } else if (child.type === 'udta') {
        for (const meta of await atoms(source, child.start, child.start + child.length)) {
          if (meta.type !== 'meta') continue
          // "meta" is a full atom: a version and flags before its children.
          for (const list of await atoms(source, meta.start + 4, meta.start + meta.length)) {
            if (list.type === 'ilst') fill(tags, await itemList(source, list.start, list.start + list.length, wantPicture))
          }
        }
      }
    }
  }
  return tags
}

async function itemList(source: ByteSource, start: number, end: number, wantPicture: boolean): Promise<AudioTags> {
  const tags: AudioTags = {}
  for (const item of await atoms(source, start, end)) {
    if (item.type === 'covr' && !wantPicture) continue
    if (item.length >= 16 * 1024 * 1024) continue
    for (const data of await atoms(source, item.start, item.start + item.length)) {
      if (data.type !== 'data' || data.length < 8) continue
      const b = await source.read(data.start, data.length)
      if (b.length !== data.length) continue
      const value = b.subarray(8)
      const text = () => clean(new TextDecoder('utf-8').decode(value))
      switch (item.type) {
        case '©nam':
          tags.title ??= text()
          break
        case '©ART':
          tags.artist ??= text()
          break
        case 'aART':
          tags.albumArtist ??= text()
          break
        case '©alb':
          tags.album ??= text()
          break
        case '©day': {
          const t = text()
          if (t) tags.year ??= yearOf(t)
          break
        }
        case '©gen': {
          const t = text()
          if (t) tags.genre ??= genreOf(t)
          break
        }
        case '©lyr':
          tags.lyrics ??= text()
          break
        case 'gnre':
          if (value.length >= 2 && !tags.genre) {
            const index = bigEndian(value, 0, 2) - 1
            if (index >= 0 && index < GENRES.length) tags.genre = GENRES[index]
          }
          break
        case 'trkn':
          if (value.length >= 4 && bigEndian(value, 2, 2) > 0) tags.track ??= bigEndian(value, 2, 2)
          break
        case 'disk':
          if (value.length >= 4 && bigEndian(value, 2, 2) > 0) tags.disc ??= bigEndian(value, 2, 2)
          break
        case 'covr':
          if (!tags.picture && value.length) tags.picture = value.slice()
          break
      }
      break
    }
  }
  return tags
}

/** The atoms between `start` and `end`: their type, where their content starts, and its length. */
async function atoms(source: ByteSource, start: number, end: number) {
  const out: { type: string; start: number; length: number }[] = []
  let offset = start
  while (offset + 8 <= end && out.length < 512) {
    const header = await source.read(offset, 16)
    if (header.length < 8) break
    let size = bigEndian(header, 0, 4)
    let headerLength = 8
    if (size === 1 && header.length === 16) {
      size = bigEndian(header, 8, 4) * 2 ** 32 + bigEndian(header, 12, 4)
      headerLength = 16
    } else if (size === 0) {
      size = end - offset
    }
    if (size < headerLength || offset + size > end) break
    out.push({ type: latin1(header.subarray(4, 8)), start: offset + headerLength, length: size - headerLength })
    offset += size
  }
  return out
}

// -------------------------------------------------------------- WAV, AIFF --

async function readWAV(source: ByteSource, wantPicture: boolean): Promise<AudioTags> {
  const tags: AudioTags = {}
  let byteRate = 0
  let offset = 12
  for (let n = 0; n < 64; n++) {
    const header = await source.read(offset, 8)
    if (header.length !== 8) break
    const id = latin1(header.subarray(0, 4))
    const length = littleEndian(header, 4, 4)
    if (id === 'fmt ') {
      const fmt = await source.read(offset + 8, 16)
      if (fmt.length === 16) {
        tags.sampleRate = littleEndian(fmt, 4, 4)
        byteRate = littleEndian(fmt, 8, 4)
      }
    } else if (id === 'data' && byteRate > 0) {
      tags.durationMs = Math.floor((Math.min(length, source.size - offset - 8) * 1000) / byteRate)
    } else if (id === 'id3 ' || id === 'ID3 ') {
      const found = await readID3v2(offsetSource(source, offset + 8, length), 0, wantPicture)
      if (found) fill(tags, found.tags)
    } else if (id === 'LIST') {
      fill(tags, await riffInfo(offsetSource(source, offset + 8, length)))
    }
    offset += 8 + length + (length & 1)
  }
  return tags
}

/** A WAV's LIST INFO chunk: INAM, IART, IPRD, ICRD, IGNR, ITRK. */
async function riffInfo(source: ByteSource): Promise<AudioTags> {
  const tags: AudioTags = {}
  const b = await source.read(0, Math.min(source.size, 64 * 1024))
  if (latin1(b.subarray(0, 4)) !== 'INFO') return tags
  let i = 4
  while (i + 8 <= b.length) {
    const id = latin1(b.subarray(i, i + 4))
    const length = littleEndian(b, i + 4, 4)
    const value = clean(latin1(b.subarray(i + 8, i + 8 + length)).split('\u0000')[0])
    if (value) {
      if (id === 'INAM') tags.title ??= value
      else if (id === 'IART') tags.artist ??= value
      else if (id === 'IPRD') tags.album ??= value
      else if (id === 'ICRD') tags.year ??= yearOf(value)
      else if (id === 'IGNR') tags.genre ??= genreOf(value)
      else if (id === 'ITRK' || id === 'IPRT') tags.track ??= leadingNumber(value)
    }
    i += 8 + length + (length & 1)
  }
  return tags
}

async function readAIFF(source: ByteSource, wantPicture: boolean): Promise<AudioTags> {
  const tags: AudioTags = {}
  let offset = 12
  for (let n = 0; n < 64; n++) {
    const header = await source.read(offset, 8)
    if (header.length !== 8) break
    const id = latin1(header.subarray(0, 4))
    const length = bigEndian(header, 4, 4)
    if (id === 'COMM') {
      const c = await source.read(offset + 8, 18)
      if (c.length === 18) {
        const frames = bigEndian(c, 2, 4)
        const rate = extended80(c.subarray(8, 18))
        if (rate > 0) {
          tags.sampleRate = Math.round(rate)
          tags.durationMs = Math.floor((frames * 1000) / rate)
        }
      }
    } else if (id === 'ID3 ' || id === 'id3 ') {
      const found = await readID3v2(offsetSource(source, offset + 8, length), 0, wantPicture)
      if (found) fill(tags, found.tags)
    }
    offset += 8 + length + (length & 1)
  }
  return tags
}

/** An IEEE 754 80-bit extended float, as AIFF stores its sample rate. */
function extended80(b: Uint8Array): number {
  const exponent = ((b[0] & 0x7f) << 8) | b[1]
  const mantissa = bigEndian(b, 2, 4) * 2 ** 32 + bigEndian(b, 6, 4)
  if (exponent === 0 && mantissa === 0) return 0
  return mantissa * 2 ** (exponent - 16383 - 63)
}

// -------------------------------------------------------------------- Ogg --

/** Ogg Vorbis and Opus: the comment header, and the length from the last page's granule position. */
async function readOgg(source: ByteSource, wantPicture: boolean): Promise<AudioTags> {
  const tags: AudioTags = {}
  // The headers come first; gather the first two packets from the opening pages.
  const packets: Uint8Array[] = []
  let current: number[] = []
  let offset = 0
  for (let page = 0; page < 64 && packets.length < 2; page++) {
    const header = await source.read(offset, 27)
    if (header.length < 27 || latin1(header.subarray(0, 4)) !== 'OggS') break
    const segments = header[26]
    const table = await source.read(offset + 27, segments)
    let dataOffset = offset + 27 + segments
    const total = table.reduce((sum, value) => sum + value, 0)
    const data = await source.read(dataOffset, total)
    let at = 0
    for (const lacing of table) {
      for (let k = 0; k < lacing; k++) current.push(data[at + k])
      at += lacing
      if (lacing < 255) {
        packets.push(Uint8Array.from(current))
        current = []
        if (packets.length >= 2) break
      }
      if (current.length > 16 * 1024 * 1024) return tags
    }
    dataOffset += total
    offset = dataOffset
  }
  if (packets.length < 2) return tags
  const [first, second] = packets
  let rate = 0
  let preSkip = 0
  let opus = false
  if (latin1(first.subarray(1, 7)) === 'vorbis') {
    rate = littleEndian(first, 12, 4)
    if (latin1(second.subarray(1, 7)) === 'vorbis') fill(tags, vorbisComments(second.subarray(7), wantPicture))
  } else if (latin1(first.subarray(0, 8)) === 'OpusHead') {
    opus = true
    rate = 48000
    preSkip = littleEndian(first, 10, 2)
    if (latin1(second.subarray(0, 8)) === 'OpusTags') fill(tags, vorbisComments(second.subarray(8), wantPicture))
  }
  if (rate > 0) {
    tags.sampleRate = opus ? littleEndian(first, 12, 4) || 48000 : rate
    // The last page says how many samples came before its end.
    const tailSize = Math.min(source.size, 64 * 1024)
    const tail = await source.read(source.size - tailSize, tailSize)
    for (let i = tail.length - 27; i >= 0; i--) {
      if (tail[i] === 0x4f && tail[i + 1] === 0x67 && tail[i + 2] === 0x67 && tail[i + 3] === 0x53) {
        const granule = littleEndian(tail, i + 6, 4) + littleEndian(tail, i + 10, 4) * 2 ** 32
        const samples = granule - preSkip
        if (samples > 0) tags.durationMs = Math.floor((samples * 1000) / rate)
        break
      }
    }
  }
  return tags
}

// ---------------------------------------------------------------- helpers --

function latin1(bytes: Uint8Array): string {
  let out = ''
  for (const byte of bytes) out += String.fromCharCode(byte)
  return out
}

function syncsafe(b: Uint8Array, i: number): number {
  return ((b[i] & 0x7f) << 21) | ((b[i + 1] & 0x7f) << 14) | ((b[i + 2] & 0x7f) << 7) | (b[i + 3] & 0x7f)
}

function bigEndian(b: Uint8Array, i: number, count: number): number {
  let value = 0
  for (let k = 0; k < count && i + k < b.length; k++) value = value * 256 + b[i + k]
  return value
}

function littleEndian(b: Uint8Array, i: number, count: number): number {
  let value = 0
  for (let k = count - 1; k >= 0; k--) if (i + k < b.length) value = value * 256 + b[i + k]
  return value
}

function clean(text: string | undefined): string | undefined {
  const trimmed = text?.replace(/^[\s\u0000]+|[\s\u0000]+$/g, '')
  return trimmed ? trimmed : undefined
}

/** "3/12" → 3. */
export function leadingNumber(text: string): number | undefined {
  const match = /^\s*(\d+)/.exec(text)
  const value = match ? Number(match[1]) : 0
  return value > 0 ? value : undefined
}

/** "1999", "2004-05-01" → the year. */
export function yearOf(text: string): number | undefined {
  const digits = text.trim().slice(0, 4)
  if (!/^\d{4}$/.test(digits)) return undefined
  const value = Number(digits)
  return value > 1000 ? value : undefined
}

/** "(17)", "(17)Rock", "17" and "Rock" from ID3 → the genre's name. */
export function genreOf(raw: string): string | undefined {
  const text = raw.trim()
  const paren = /^\((\d+)\)(.*)$/.exec(text)
  if (paren) {
    const rest = paren[2].trim()
    if (rest) return rest
    const number = Number(paren[1])
    return number < GENRES.length ? GENRES[number] : undefined
  }
  if (/^\d+$/.test(text)) {
    const number = Number(text)
    return number < GENRES.length ? GENRES[number] : undefined
  }
  return clean(text)
}

/** The ID3v1 genres, by number. */
export const GENRES = [
  'Blues', 'Classic Rock', 'Country', 'Dance', 'Disco', 'Funk', 'Grunge', 'Hip-Hop', 'Jazz', 'Metal',
  'New Age', 'Oldies', 'Other', 'Pop', 'R&B', 'Rap', 'Reggae', 'Rock', 'Techno', 'Industrial',
  'Alternative', 'Ska', 'Death Metal', 'Pranks', 'Soundtrack', 'Euro-Techno', 'Ambient', 'Trip-Hop', 'Vocal', 'Jazz+Funk',
  'Fusion', 'Trance', 'Classical', 'Instrumental', 'Acid', 'House', 'Game', 'Sound Clip', 'Gospel', 'Noise',
  'Alternative Rock', 'Bass', 'Soul', 'Punk', 'Space', 'Meditative', 'Instrumental Pop', 'Instrumental Rock', 'Ethnic', 'Gothic',
  'Darkwave', 'Techno-Industrial', 'Electronic', 'Pop-Folk', 'Eurodance', 'Dream', 'Southern Rock', 'Comedy', 'Cult', 'Gangsta',
  'Top 40', 'Christian Rap', 'Pop/Funk', 'Jungle', 'Native American', 'Cabaret', 'New Wave', 'Psychedelic', 'Rave', 'Showtunes',
  'Trailer', 'Lo-Fi', 'Tribal', 'Acid Punk', 'Acid Jazz', 'Polka', 'Retro', 'Musical', 'Rock & Roll', 'Hard Rock',
]
