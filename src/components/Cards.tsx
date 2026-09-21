import { useNavigate } from 'react-router-dom'
import { Play } from 'lucide-react'
import type { Album, Artist, Playlist } from '@/api/types'
import { artUrl } from '@/lib/artwork'
import { formatCount } from '@/lib/format'
import { songsByAlbum, allPlaylists } from '@/db'
import { usePlayer } from '@/store/player'
import { getClient } from '@/api/subsonic'
import { Art } from './ui'

export function AlbumCard({ album }: { album: Album }) {
  const navigate = useNavigate()

  const play = async (event: React.MouseEvent) => {
    event.stopPropagation()
    let songs = await songsByAlbum(album.id)
    if (!songs.length) {
      // Not synced yet — fall back to a live fetch.
      const detail = await getClient().getAlbum(album.id)
      songs = detail?.song ?? []
    }
    if (songs.length) void usePlayer.getState().playNow(songs, 0, album.name)
  }

  return (
    <article
      className="card"
      onClick={() => navigate(`/album/${encodeURIComponent(album.id)}`)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') navigate(`/album/${encodeURIComponent(album.id)}`)
      }}
      tabIndex={0}
      role="button"
    >
      <div className="card__art">
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
  return (
    <article
      className="card card--artist"
      onClick={() => navigate(`/artist/${encodeURIComponent(artist.id)}`)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') navigate(`/artist/${encodeURIComponent(artist.id)}`)
      }}
      tabIndex={0}
      role="button"
    >
      <div className="card__art card__art--round">
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

  const play = async (event: React.MouseEvent) => {
    event.stopPropagation()
    const local = (await allPlaylists()).find((item) => item.id === playlist.id)
    const songs = local?.entry ?? (await getClient().getPlaylist(playlist.id))?.entry ?? []
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
    >
      <div className="card__art">
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
