import { useCallback, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Clock,
  Download,
  Heart,
  HardDrive,
  ListPlus,
  MoreHorizontal,
  Play,
  Share2,
  Sparkles,
  Trash2,
} from 'lucide-react'
import type { Song } from '@/api/types'
import { artUrl } from '@/lib/artwork'
import { formatTime, sortKey } from '@/lib/format'
import { useVirtualWindow } from '@/lib/hooks'
import {
  downloadForOffline,
  removeOffline,
  saveToDisk,
  shareSong,
  toggleStarSong,
} from '@/lib/actions'
import { usePlayer } from '@/store/player'
import { analyseTrack } from '@/audio/analysis'
import { useToast } from '@/store/ui'
import { Art, Menu, useMenu, type MenuItem } from './ui'
import { usePlaylistPicker } from './AddToPlaylist'

export type SortField = 'none' | 'title' | 'artist' | 'album' | 'duration' | 'year' | 'added' | 'plays'

const ROW_HEIGHT = 52

export interface TrackListProps {
  songs: Song[]
  source: string
  /** Hide the album column (album pages already say which album it is). */
  hideAlbum?: boolean
  /** Show artwork thumbnails per row. */
  showArt?: boolean
  /** Numbering: track numbers on album pages, running index elsewhere. */
  numbering?: 'track' | 'index' | 'none'
  sortable?: boolean
  onRemove?: (song: Song, index: number) => void
  emptyMessage?: string
}

export function TrackList({
  songs,
  source,
  hideAlbum,
  showArt = true,
  numbering = 'index',
  sortable = true,
  onRemove,
  emptyMessage,
}: TrackListProps) {
  const [sort, setSort] = useState<{ field: SortField; desc: boolean }>({ field: 'none', desc: false })
  const containerRef = useRef<HTMLDivElement>(null)

  const sorted = useMemo(() => {
    if (sort.field === 'none') return songs
    const direction = sort.desc ? -1 : 1
    const copy = [...songs]
    copy.sort((a, b) => {
      switch (sort.field) {
        case 'title':
          return sortKey(a.title).localeCompare(sortKey(b.title)) * direction
        case 'artist':
          return sortKey(a.artist).localeCompare(sortKey(b.artist)) * direction
        case 'album':
          return sortKey(a.album).localeCompare(sortKey(b.album)) * direction
        case 'duration':
          return ((a.duration ?? 0) - (b.duration ?? 0)) * direction
        case 'year':
          return ((a.year ?? 0) - (b.year ?? 0)) * direction
        case 'plays':
          return ((a.playCount ?? 0) - (b.playCount ?? 0)) * direction
        case 'added':
          return (a.created ?? '').localeCompare(b.created ?? '') * direction
        default:
          return 0
      }
    })
    return copy
  }, [songs, sort])

  const toggleSort = useCallback((field: SortField) => {
    setSort((previous) =>
      previous.field === field ? { field, desc: !previous.desc } : { field, desc: false },
    )
  }, [])

  // Virtualise long lists; short ones render in full so the page can scroll.
  const virtualise = sorted.length > 120
  const { start, end, offsetTop, totalHeight } = useVirtualWindow(
    virtualise ? sorted.length : 0,
    ROW_HEIGHT,
    containerRef,
  )
  const visible = virtualise ? sorted.slice(start, end) : sorted

  const playFrom = useCallback(
    (index: number) => {
      void usePlayer.getState().playNow(sorted, index, source)
    },
    [sorted, source],
  )

  if (!songs.length) {
    return <p className="row__hint" style={{ padding: '18px 12px' }}>{emptyMessage ?? 'No tracks here yet.'}</p>
  }

  const header = (
    <div className="tracks__header">
      <span>#</span>
      <span>
        {sortable ? (
          <button onClick={() => toggleSort('title')}>Title</button>
        ) : (
          'Title'
        )}
      </span>
      <span className="col-album">
        {hideAlbum ? (
          sortable ? (
            <button onClick={() => toggleSort('artist')}>Artist</button>
          ) : (
            'Artist'
          )
        ) : sortable ? (
          <button onClick={() => toggleSort('album')}>Album</button>
        ) : (
          'Album'
        )}
      </span>
      <span style={{ textAlign: 'right' }}>
        {sortable ? (
          <button onClick={() => toggleSort('duration')}>
            <Clock size={13} />
          </button>
        ) : (
          <Clock size={13} />
        )}
      </span>
      <span />
    </div>
  )

  if (!virtualise) {
    return (
      <div className="tracks">
        {header}
        {visible.map((song, index) => (
          <TrackRow
            key={`${song.id}-${index}`}
            song={song}
            position={index}
            numbering={numbering}
            showArt={showArt}
            hideAlbum={hideAlbum}
            onPlay={() => playFrom(index)}
            onRemove={onRemove ? () => onRemove(song, index) : undefined}
          />
        ))}
      </div>
    )
  }

  return (
    <div className="tracks">
      {header}
      <div ref={containerRef} style={{ maxHeight: '62vh', overflow: 'auto' }}>
        <div style={{ height: totalHeight, position: 'relative' }}>
          <div style={{ transform: `translateY(${offsetTop}px)` }}>
            {visible.map((song, index) => (
              <TrackRow
                key={`${song.id}-${start + index}`}
                song={song}
                position={start + index}
                numbering={numbering}
                showArt={showArt}
                hideAlbum={hideAlbum}
                onPlay={() => playFrom(start + index)}
                onRemove={onRemove ? () => onRemove(song, start + index) : undefined}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function TrackRow({
  song,
  position,
  numbering,
  showArt,
  hideAlbum,
  onPlay,
  onRemove,
}: {
  song: Song
  position: number
  numbering: 'track' | 'index' | 'none'
  showArt: boolean
  hideAlbum?: boolean
  onPlay: () => void
  onRemove?: () => void
}) {
  const currentId = usePlayer((state) => state.current()?.id)
  const playback = usePlayer((state) => state.playback)
  const [starred, setStarred] = useState(Boolean(song.starred))
  const menu = useMenu()
  const isCurrent = currentId === song.id

  const items: MenuItem[] = [
    {
      label: 'Play next',
      icon: <Play size={15} />,
      onSelect: () => usePlayer.getState().enqueue([song], 'next'),
    },
    {
      label: 'Add to queue',
      icon: <ListPlus size={15} />,
      onSelect: () => usePlayer.getState().enqueue([song], 'end'),
    },
    {
      label: 'Add to playlist…',
      icon: <ListPlus size={15} />,
      onSelect: () => usePlaylistPicker.getState().show([song.id]),
      separatorBefore: true,
    },
    {
      label: starred ? 'Remove from favourites' : 'Add to favourites',
      icon: <Heart size={15} />,
      onSelect: async () => setStarred(await toggleStarSong(song)),
    },
    {
      label: 'Analyse for AutoMix',
      icon: <Sparkles size={15} />,
      separatorBefore: true,
      onSelect: async () => {
        useToast.getState().show(`Analysing “${song.title}”…`, 'info')
        const result = await analyseTrack(song, { force: true })
        useToast
          .getState()
          .show(
            result
              ? `${song.title}: ${result.bpm.toFixed(0)} BPM, key ${result.keyName} (${result.camelot})`
              : 'Analysis failed — check the connection to your server.',
            result ? 'success' : 'error',
          )
      },
    },
    {
      label: 'Save for offline',
      icon: <HardDrive size={15} />,
      onSelect: () => void downloadForOffline(song),
    },
    {
      label: 'Remove from offline',
      icon: <Trash2 size={15} />,
      onSelect: () => void removeOffline(song),
    },
    {
      label: 'Download file',
      icon: <Download size={15} />,
      onSelect: () => saveToDisk(song),
      separatorBefore: true,
    },
    { label: 'Copy share link', icon: <Share2 size={15} />, onSelect: () => void shareSong(song) },
  ]

  if (onRemove) {
    items.push({
      label: 'Remove from this list',
      icon: <Trash2 size={15} />,
      danger: true,
      separatorBefore: true,
      onSelect: onRemove,
    })
  }

  const number = numbering === 'track' ? song.track ?? position + 1 : position + 1

  return (
    <div
      className="trackrow"
      data-current={isCurrent}
      onDoubleClick={onPlay}
      onContextMenu={menu.open}
    >
      <div className="trackrow__index" style={{ position: 'relative' }}>
        {isCurrent ? (
          <span className="playingbars" data-paused={playback !== 'playing'}>
            <span />
            <span />
            <span />
          </span>
        ) : (
          <>
            {numbering !== 'none' ? <span data-playable="true">{number}</span> : null}
            <button
              className="trackrow__indexplay"
              onClick={onPlay}
              aria-label={`Play ${song.title}`}
              style={numbering === 'none' ? { display: 'block', position: 'static' } : undefined}
            >
              <Play size={14} fill="currentColor" />
            </button>
          </>
        )}
      </div>

      <div className="trackrow__main">
        {showArt ? (
          <div className="trackrow__art">
            <Art src={artUrl(song, 80)} alt={song.album ?? song.title} />
          </div>
        ) : null}
        <div className="trackrow__text">
          <span className="trackrow__title">{song.title}</span>
          {song.artistId ? (
            <Link className="trackrow__artist" to={`/artist/${encodeURIComponent(song.artistId)}`}>
              {song.artist}
            </Link>
          ) : (
            <span className="trackrow__artist">{song.artist}</span>
          )}
        </div>
      </div>

      <span className="col-album trackrow__album">
        {hideAlbum ? (
          song.artist
        ) : song.albumId ? (
          <Link className="trackrow__album" to={`/album/${encodeURIComponent(song.albumId)}`}>
            {song.album}
          </Link>
        ) : (
          song.album
        )}
      </span>

      <span className="trackrow__badges">
        <button
          className="iconbtn"
          data-active={starred}
          aria-label={starred ? 'Remove from favourites' : 'Add to favourites'}
          onClick={async () => setStarred(await toggleStarSong(song))}
          style={{ width: 28, height: 28, opacity: starred ? 1 : undefined }}
        >
          <Heart size={14} fill={starred ? 'currentColor' : 'none'} />
        </button>
        {formatTime(song.duration)}
      </span>

      <div className="trackrow__actions">
        <button
          className="iconbtn"
          aria-label={`More options for ${song.title}`}
          onClick={(event) => menu.open(event)}
        >
          <MoreHorizontal size={16} />
        </button>
      </div>

      <Menu anchor={menu.anchor} items={items} onClose={menu.close} />
    </div>
  )
}
