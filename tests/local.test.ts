import { buildCatalog, songId, type LocalTrack } from '@/local/catalog'
import { bytesSource, genreOf, leadingNumber, readTags, yearOf } from '@/local/tags'

// Kultr for iOS's LocalLibraryTests, ported, so the apps read files and build
// albums alike; then the formats only the web reads (Ogg, AIFF) and lyrics.

let failures = 0
function assert(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`  PASS  ${name} ${detail}`)
  else {
    failures++
    console.log(`  FAIL  ${name} ${detail}`)
  }
}
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

// --------------------------------------------------------------- catalog --

function track(
  name: string,
  folder: string,
  o: Partial<LocalTrack> = {},
): LocalTrack {
  return {
    path: `folder|${folder}/${name}`,
    fileName: name,
    folderKey: folder,
    folderName: folder.split('/').pop()!,
    modified: 1_700_000_000_000,
    size: 1_000,
    durationMs: 200_400,
    ...o,
  }
}

const u32 = (v: number) => [(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff]
const le32 = (v: number) => u32(v).reverse()
const le16 = (v: number) => [v & 0xff, (v >> 8) & 0xff]
const syncsafe = (v: number) => [(v >> 21) & 0x7f, (v >> 14) & 0x7f, (v >> 7) & 0x7f, v & 0x7f]
const ascii = (text: string) => [...new TextEncoder().encode(text)]
const id3Frame = (id: string, body: number[], v4: boolean) => [...ascii(id), ...(v4 ? syncsafe(body.length) : u32(body.length)), 0, 0, ...body]
const latin = (text: string) => [0, ...ascii(text)]
const id3 = (frames: number[][], v4: boolean) => {
  const body = frames.flat()
  return [...ascii('ID3'), v4 ? 4 : 3, 0, 0, ...syncsafe(body.length), ...body]
}
/** An MPEG-1 Layer III frame at 44.1 kHz, stereo, with a Xing header counting `frames`. */
function mp3Frame(frames: number): number[] {
  const frame = new Array(417).fill(0)
  frame[0] = 0xff
  frame[1] = 0xfb
  frame[2] = 0x90
  const xing = 4 + 32
  frame.splice(xing, 12, ...ascii('Xing'), ...u32(1), ...u32(frames))
  return frame
}
const read = (bytes: number[], ext: string, picture = false) => readTags(bytesSource(Uint8Array.from(bytes)), ext, picture)

async function main() {
  console.log('\n== Untagged files take their names from the file and folder ==')
  let catalog = buildCatalog([track('01 Intro.mp3', 'Music/Demo Tape')])
  let song = catalog.songs[0]
  assert('title from the file name', song.title === '01 Intro')
  assert('album from the folder', song.album === 'Demo Tape')
  assert('unknown artist', catalog.albums[0].artist === 'Unknown artist')
  assert('length rounded to seconds', song.duration === 200)
  assert('suffix', song.suffix === 'mp3')
  assert('id from the path', song.id === songId(song.path!) && song.id.startsWith('local:'))
  assert('added when the file was', song.created === '2023-11-14T22:13:20.000Z', `-> ${song.created}`)

  console.log('\n== Albums with the same name stay apart unless their artist says otherwise ==')
  catalog = buildCatalog([
    track('a.mp3', 'Music/A', { album: 'Greatest Hits', artist: 'A' }),
    track('b.mp3', 'Music/B', { album: 'Greatest Hits', artist: 'B' }),
    track('1.flac', 'Music/Big/CD1', { album: 'Big', artist: 'C', albumArtist: 'C', track: 1, disc: 1 }),
    track('2.flac', 'Music/Big/CD2', { album: 'Big', artist: 'C', albumArtist: 'C', track: 1, disc: 2 }),
  ])
  assert('three albums', catalog.albums.length === 3, `-> ${catalog.albums.length}`)
  const big = catalog.albums.find((album) => album.name === 'Big')
  assert('the two-disc album is one', big?.songCount === 2)
  assert('in disc order', eq(catalog.songs.filter((s) => s.albumId === big?.id).map((s) => s.discNumber), [1, 2]))
  assert('three artists', eq(catalog.artists.map((a) => a.name).sort(), ['A', 'B', 'C']))

  console.log('\n== Compilations without an album artist are by Various artists ==')
  catalog = buildCatalog([
    track('1.mp3', 'Music/Mix', { album: 'Mix', artist: 'X', genre: 'House' }),
    track('2.mp3', 'Music/Mix', { album: 'Mix', artist: 'Y', genre: 'House' }),
  ])
  assert('various artists', catalog.albums[0].artist === 'Various artists' && catalog.albums[0].isCompilation === true)
  assert('each track keeps its artist', eq(catalog.songs.map((s) => s.artist), ['X', 'Y']))
  assert('the album genre', catalog.albums[0].genre === 'House' && catalog.genres.length === 1 && catalog.genres[0].songCount === 2)

  console.log('\n== The cover and your own data carry over ==')
  const t = track('1.mp3', 'Music/Album', { album: 'Album', artist: 'Z', coverId: 'local-cover:abc' })
  const id = songId(t.path)
  catalog = buildCatalog([t], (sid) => (sid === id ? { playCount: 7, played: '2026-09-01T10:00:00Z', starred: '2026-08-01T00:00:00Z', userRating: 4 } : undefined))
  song = catalog.songs[0]
  assert('cover on the song and album', song.coverArt === 'local-cover:abc' && catalog.albums[0].coverArt === 'local-cover:abc')
  assert('plays, rating, favourite', song.playCount === 7 && song.userRating === 4 && song.starred === '2026-08-01T00:00:00Z')
  assert('album plays add up', catalog.albums[0].playCount === 7)

  console.log('\n== Tracks are in disc and track order ==')
  catalog = buildCatalog([
    track('b.mp3', 'Music/X', { album: 'X', artist: 'X', track: 2 }),
    track('c.mp3', 'Music/X', { album: 'X', artist: 'X' }),
    track('a.mp3', 'Music/X', { album: 'X', artist: 'X', track: 1 }),
  ])
  assert('1, 2, then untracked', eq(catalog.songs.map((s) => s.track ?? null), [1, 2, null]))
  assert('no cover', catalog.albums[0].coverArt === undefined)

  // ----------------------------------------------------------------- tags --

  console.log('\n== ID3v2.3 tags, and the length from Xing ==')
  const picture = [0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]
  const apic = [0, ...ascii('image/jpeg'), 0, 3, ...ascii('front'), 0, ...picture]
  const tag = id3(
    [
      id3Frame('TIT2', latin('Daniel'), false),
      id3Frame('TPE1', latin('Natasha Beller'), false),
      id3Frame('TPE2', latin('Natasha Beller'), false),
      id3Frame('TALB', latin('Fairytale'), false),
      id3Frame('TRCK', latin('3/12'), false),
      id3Frame('TPOS', latin('1/2'), false),
      id3Frame('TYER', latin('2018'), false),
      id3Frame('TCON', latin('(27)'), false),
      id3Frame('USLT', [0, ...ascii('eng'), 0, ...ascii('Line one\nLine two')], false),
      id3Frame('APIC', apic, false),
    ],
    false,
  )
  let tags = await read([...tag, ...mp3Frame(1000)], 'mp3', true)
  assert('title, artist, album artist, album', tags.title === 'Daniel' && tags.artist === 'Natasha Beller' && tags.albumArtist === 'Natasha Beller' && tags.album === 'Fairytale')
  assert('track 3, disc 1, 2018, Trip-Hop', tags.track === 3 && tags.disc === 1 && tags.year === 2018 && tags.genre === 'Trip-Hop')
  assert('length from Xing', tags.sampleRate === 44100 && tags.durationMs === Math.floor((1000 * 1152 * 1000) / 44100), `-> ${tags.durationMs}`)
  assert('the picture', eq([...(tags.picture ?? [])], picture))
  assert('the lyrics', tags.lyrics === 'Line one\nLine two', `-> ${JSON.stringify(tags.lyrics)}`)
  tags = await read([...tag, ...mp3Frame(1000)], 'mp3')
  assert('no picture unless asked', tags.picture === undefined)

  console.log('\n== ID3v2.4 with UTF-8 and UTF-16 text ==')
  const utf16 = [1, 0xff, 0xfe]
  for (const unit of 'Café') {
    const code = unit.charCodeAt(0)
    utf16.push(code & 0xff, code >> 8)
  }
  tags = await read(
    [
      ...id3(
        [
          id3Frame('TIT2', [3, ...ascii('Ünïcode ♫')], true),
          id3Frame('TPE1', utf16, true),
          id3Frame('TDRC', [3, ...ascii('2004-05-01')], true),
          id3Frame('TCON', [3, ...ascii('Drum & Bass')], true),
        ],
        true,
      ),
      ...mp3Frame(10),
    ],
    'mp3',
  )
  assert('UTF-8 title', tags.title === 'Ünïcode ♫', `-> ${tags.title}`)
  assert('UTF-16 artist', tags.artist === 'Café', `-> ${tags.artist}`)
  assert('year from a date', tags.year === 2004)
  assert('genre as written', tags.genre === 'Drum & Bass')

  console.log('\n== FLAC comments, length and picture ==')
  const info = new Array(34).fill(0)
  const rate = 44100
  info[10] = (rate >> 12) & 0xff
  info[11] = (rate >> 4) & 0xff
  info[12] = ((rate & 0x0f) << 4) | 0x02
  info.splice(14, 4, ...u32(441_000))
  const comments = ['TITLE=Lonely', 'ARTIST=Back On Earth', 'ALBUMARTIST=Back On Earth', 'ALBUM=Love', 'TRACKNUMBER=4', 'DISCNUMBER=1/1', 'DATE=2010', 'GENRE=Ambient']
  const vorbis = (list: string[]) => {
    const vendor = ascii('kultr')
    const out = [...le32(vendor.length), ...vendor, ...le32(list.length)]
    for (const comment of list) out.push(...le32(ascii(comment).length), ...ascii(comment))
    return out
  }
  const png = [0x89, 0x50, 0x4e, 0x47]
  const mime = ascii('image/png')
  const pictureBlock = [...u32(3), ...u32(mime.length), ...mime, ...u32(0), ...u32(500), ...u32(500), ...u32(24), ...u32(0), ...u32(png.length), ...png]
  const block = (type: number, body: number[], last = false) => [type | (last ? 0x80 : 0), (body.length >> 16) & 0xff, (body.length >> 8) & 0xff, body.length & 0xff, ...body]
  tags = await read([...ascii('fLaC'), ...block(0, info), ...block(4, vorbis(comments)), ...block(6, pictureBlock, true), 0xff, 0xf8], 'flac', true)
  assert('title, artist, album', tags.title === 'Lonely' && tags.artist === 'Back On Earth' && tags.albumArtist === 'Back On Earth' && tags.album === 'Love')
  assert('track 4, disc 1, 2010, Ambient', tags.track === 4 && tags.disc === 1 && tags.year === 2010 && tags.genre === 'Ambient')
  assert('ten seconds at 44.1 kHz', tags.sampleRate === 44100 && tags.durationMs === 10_000, `-> ${tags.durationMs}`)
  assert('the picture', eq([...(tags.picture ?? [])], png))

  console.log('\n== MP4 items and length ==')
  const atom = (type: number[] | string, body: number[]) => [...u32(8 + body.length), ...(typeof type === 'string' ? ascii(type) : type), ...body]
  const data = (kind: number, value: number[]) => atom('data', [...u32(kind), ...u32(0), ...value])
  const C = 0xa9
  const ilst = atom('ilst', [
    ...atom([C, ...ascii('nam')], data(1, ascii('Feijão'))),
    ...atom([C, ...ascii('ART')], data(1, ascii('Dr. Quandary'))),
    ...atom('aART', data(1, ascii('Various'))),
    ...atom([C, ...ascii('alb')], data(1, ascii('netBloc Vol. 42'))),
    ...atom('trkn', data(0, [0, 0, 0, 1, 0, 11, 0, 0])),
    ...atom('disk', data(0, [0, 0, 0, 2, 0, 2])),
    ...atom([C, ...ascii('day')], data(1, ascii('2013-01-01T00:00:00Z'))),
    ...atom('gnre', data(0, [0, 9])),
    ...atom('covr', data(13, [0xff, 0xd8, 9])),
  ])
  const meta = atom('meta', [...u32(0), ...atom('hdlr', new Array(25).fill(0)), ...ilst])
  const mvhd = [...u32(0), ...u32(0), ...u32(0), ...u32(1000), ...u32(218_000), ...new Array(80).fill(0)]
  const moov = atom('moov', [...atom('mvhd', mvhd), ...atom('udta', meta)])
  tags = await read([...atom('ftyp', [...ascii('M4A '), ...u32(0)]), ...atom('mdat', [1, 2, 3]), ...moov], 'm4a', true)
  assert('title, artist, album artist, album', tags.title === 'Feijão' && tags.artist === 'Dr. Quandary' && tags.albumArtist === 'Various' && tags.album === 'netBloc Vol. 42')
  assert('track 1, disc 2, 2013, Jazz', tags.track === 1 && tags.disc === 2 && tags.year === 2013 && tags.genre === 'Jazz')
  assert('length', tags.durationMs === 218_000)
  assert('the picture', eq([...(tags.picture ?? [])], [0xff, 0xd8, 9]))

  console.log('\n== WAV with an ID3 chunk and a LIST INFO chunk ==')
  const fmt = [...le16(1), ...le16(2), ...le32(48000), ...le32(48000 * 4), ...le16(4), ...le16(16)]
  const chunk = (id: string, body: number[]) => [...ascii(id), ...le32(body.length), ...body, ...(body.length & 1 ? [0] : [])]
  const listInfo = [...ascii('INFO'), ...chunk('INAM', ascii('Field Notes\0')), ...chunk('IART', ascii('Lumen Atlas\0'))]
  const wavBody = [...ascii('WAVE'), ...chunk('fmt ', fmt), ...chunk('data', new Array(48000 * 4 * 2).fill(0)), ...chunk('LIST', listInfo), ...chunk('id3 ', id3([id3Frame('TALB', latin('Northern Glass'), false)], false))]
  tags = await read([...ascii('RIFF'), ...le32(wavBody.length), ...wavBody], 'wav')
  assert('two seconds at 48 kHz', tags.sampleRate === 48000 && tags.durationMs === 2000, `-> ${tags.durationMs}`)
  assert('title and artist from LIST INFO', tags.title === 'Field Notes' && tags.artist === 'Lumen Atlas', `-> ${tags.title} / ${tags.artist}`)
  assert('album from the ID3 chunk', tags.album === 'Northern Glass')

  console.log('\n== AIFF ==')
  // 44100 as an 80-bit extended float: exponent 16398, mantissa 0xAC44 << 48.
  const rate80 = [0x40, 0x0e, 0xac, 0x44, 0, 0, 0, 0, 0, 0]
  const comm = [...le16(0).reverse(), 0, 2, ...u32(88200), 0, 16, ...rate80]
  const aiffChunk = (id: string, body: number[]) => [...ascii(id), ...u32(body.length), ...body, ...(body.length & 1 ? [0] : [])]
  const aiffBody = [...ascii('AIFF'), ...aiffChunk('COMM', comm.slice(2)), ...aiffChunk('ID3 ', id3([id3Frame('TIT2', latin('Polar Night'), false)], false))]
  tags = await read([...ascii('FORM'), ...u32(aiffBody.length), ...aiffBody], 'aiff')
  assert('two seconds at 44.1 kHz', tags.sampleRate === 44100 && tags.durationMs === 2000, `-> ${tags.sampleRate} ${tags.durationMs}`)
  assert('title from the ID3 chunk', tags.title === 'Polar Night')

  console.log('\n== Ogg Vorbis and Opus ==')
  const page = (packet: number[], granule: number, flags = 0) => {
    const segments: number[] = []
    let left = packet.length
    while (left >= 255) {
      segments.push(255)
      left -= 255
    }
    segments.push(left)
    return [...ascii('OggS'), 0, flags, ...le32(granule), ...le32(0), ...le32(1), ...le32(0), ...le32(0), segments.length, ...segments, ...packet]
  }
  const vorbisId = [1, ...ascii('vorbis'), ...le32(0), 2, ...le32(44100), ...new Array(16).fill(0)]
  const vorbisTags = [3, ...ascii('vorbis'), ...vorbis(['TITLE=Aurora', 'ARTIST=Lumen Atlas', 'LYRICS=la la la']), 1]
  tags = await read([...page(vorbisId, 0, 2), ...page(vorbisTags, 0), ...page([0, 1, 2], 441000, 4)], 'ogg')
  assert('Vorbis comments', tags.title === 'Aurora' && tags.artist === 'Lumen Atlas' && tags.lyrics === 'la la la')
  assert('Vorbis length from the last granule', tags.durationMs === 10_000, `-> ${tags.durationMs}`)
  const opusHead = [...ascii('OpusHead'), 1, 2, ...le16(312), ...le32(48000), 0, 0, 0]
  const opusTags = [...ascii('OpusTags'), ...vorbis(['TITLE=Meridian', 'ALBUM=Northern Glass'])]
  tags = await read([...page(opusHead, 0, 2), ...page(opusTags, 0), ...page([0], 312 + 48000 * 3, 4)], 'opus')
  assert('Opus comments', tags.title === 'Meridian' && tags.album === 'Northern Glass')
  assert('Opus length, less the pre-skip', tags.durationMs === 3000, `-> ${tags.durationMs}`)

  console.log('\n== Files without tags give nothing, and do not fail ==')
  assert('empty file', eq(await read([], 'mp3'), {}))
  assert('not a FLAC after all', (await read([1, 2, 3, 4, 5, 6, 7, 8, 9], 'flac')).title === undefined)

  console.log('\n== Genres and numbers are cleaned up ==')
  assert('(17)', genreOf('(17)') === 'Rock')
  assert("(17)Rock 'n' Roll", genreOf("(17)Rock 'n' Roll") === "Rock 'n' Roll")
  assert('13', genreOf('13') === 'Pop')
  assert('Shoegaze', genreOf('Shoegaze') === 'Shoegaze')
  assert('07/12', leadingNumber('07/12') === 7)
  assert('0 is no number', leadingNumber('0') === undefined)
  assert('1999-12-31', yearOf('1999-12-31') === 1999)

  if (failures) {
    console.log(`\n${failures} failure(s)`)
    process.exit(1)
  }
  console.log('\nAll local-library tests passed.')
}

void main()
