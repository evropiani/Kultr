import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Play } from 'lucide-react'
import type { Album, Artist, Playlist, Song } from '@/api/types'
import { artUrl } from '@/lib/artwork'
import { formatCount } from '@/lib/format'
import { songsByAlbum, songsByArtist, allPlaylists } from '@/db'
import { usePlayer } from '@/store/player'
import { useSelection } from '@/store/selection'
import { getClient } from '@/api/subsonic'
import { Art } from './ui'
import { draggableProps } from './DropZone'

/** Tracks of an album, from the local mirror or the server if not synced. */
async function albumSongs(albumId: string): Promise<Song[]> {
  const local = await songsByAlbum(albumId)
  if (local.length) return local
  const detail = await getClient().getAlbum(albumId)
  return detail?.song ?? []
}

async function playlistSongs(playlistId: string): Promise<Song[]> {
  const local = (await allPlaylists()).find((item) => item.id === playlistId)
  if (local?.entry?.length) return local.entry
  return (await getClient().getPlaylist(playlistId))?.entry ?? []
}

/**
 * Tick box drawn over artwork. Selecting a container selects everything in it,
 * so the selection is always a flat set of tracks whatever you clicked.
 */
function CardCheck({ resolve, label }: { resolve: () => Promise<Song[]>; label: string }) {
  const selected = useSelection((state) => state.selected)
  const selectMany = useSelection((state) => state.selectMany)
  const deselectMany = useSelection((state) => state.deselectMany)
  const [mine, setMine] = useState<Song[]>([])

  const checked = mine.length > 0 && mine.every((song) => selected.includes(song.id))

  return (
    <button
      className="checkbox card__check"
      role="checkbox"
      aria-checked={checked}
      aria-label={`Select ${label}`}
      data-checked={checked}
      onClick={async (event) => {
        event.stopPropagation()
        const songs = mine.length ? mine : await resolve()
        setMine(songs)
        if (songs.every((song) => selected.includes(song.id))) deselectMany(songs)
        else selectMany(songs)
      }}
    >
      <Check size={12} strokeWidth={3.5} />
    </button>
  )
}

export function AlbumCard({ album }: { album: Album }) {
  const navigate = useNavigate()
  const selected = useSelection((state) => state.selected)
  const [songIds, setSongIds] = useState<string[]>([])
  const isSelected = songIds.length > 0 && songIds.every((id) => selected.includes(id))

  const play = async (event: React.MouseEvent) => {
    event.stopPropagation()
    const songs = await albumSongs(album.id)
    if (songs.length) void usePlayer.getState().playNow(songs, 0, album.name)
  }

  const resolve = async () => {
    const songs = await albumSongs(album.id)
    setSongIds(songs.map((song) => song.id))
    return songs
  }

  return (
    <article
      className="card"
      data-selected={isSelected || undefined}
      onClick={() => navigate(`/album/${encodeURIComponent(album.id)}`)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') navigate(`/album/${encodeURIComponent(album.id)}`)
      }}
      tabIndex={0}
      role="button"
      {...draggableProps(album.name, 'album', resolve)}
    >
      <div className="card__art">
        <CardCheck resolve={resolve} label={album.name} />
        <Art src={artUrl(album, 400)} alt={album.name} />
        <button className="card__play" onClick={play} aria-label={`Play ${album.name}`}>
          <Play size={18} fill="currentColor" />
        </button>
      </div>
      <div>
        <div className="card__title">{album.name}</div>
        <div className="card__sub">
          {album.artist}
          {album.year ? ` · ${album.year}` : ''}
        </div>
      </div>
    </article>
  )
}

export function ArtistCard({ artist }: { artist: Artist }) {
  const navigate = useNavigate()
  const resolve = () => songsByArtist(artist.id)

  return (
    <article
      className="card card--artist"
      onClick={() => navigate(`/artist/${encodeURIComponent(artist.id)}`)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') navigate(`/artist/${encodeURIComponent(artist.id)}`)
      }}
      tabIndex={0}
      role="button"
      {...draggableProps(artist.name, 'artist', resolve)}
    >
      <div className="card__art card__art--round">
        <CardCheck resolve={resolve} label={artist.name} />
        <Art src={artUrl(artist, 400)} alt={artist.name} round />
      </div>
      <div>
        <div className="card__title">{artist.name}</div>
        <div className="card__sub">{formatCount(artist.albumCount, 'album')}</div>
      </div>
    </article>
  )
}

export function PlaylistCard({ playlist }: { playlist: Playlist }) {
  const navigate = useNavigate()
  const resolve = () => playlistSongs(playlist.id)

  const play = async (event: React.MouseEvent) => {
    event.stopPropagation()
    const songs = await playlistSongs(playlist.id)
    if (songs.length) void usePlayer.getState().playNow(songs, 0, playlist.name)
  }

  return (
    <article
      className="card"
      onClick={() => navigate(`/playlist/${encodeURIComponent(playlist.id)}`)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') navigate(`/playlist/${encodeURIComponent(playlist.id)}`)
      }}
      tabIndex={0}
      role="button"
      {...draggableProps(playlist.name, 'playlist', resolve)}
    >
      <div className="card__art">
        <CardCheck resolve={resolve} label={playlist.name} />
        <Art src={artUrl(playlist, 400)} alt={playlist.name} />
        <button className="card__play" onClick={play} aria-label={`Play ${playlist.name}`}>
          <Play size={18} fill="currentColor" />
        </button>
      </div>
      <div>
        <div className="card__title">{playlist.name}</div>
        <div className="card__sub">{formatCount(playlist.songCount, 'track')}</div>
      </div>
    </article>
  )
}

export function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid">{children}</div>
}
