import { FolderDown, Heart, ListPlus, Play, Trash2, X } from 'lucide-react'
import { toggleStarSong } from '@/lib/actions'
import { formatCount } from '@/lib/format'
import { useOffline } from '@/store/offline'
import { usePlayer } from '@/store/player'
import { useSelection } from '@/store/selection'
import { usePlaylistPicker } from './AddToPlaylist'

/**
 * Floating bar that appears whenever anything is ticked. Everything it offers
 * works on the whole selection at once.
 */
export function SelectionBar() {
  const selected = useSelection((state) => state.selected)
  const clear = useSelection((state) => state.clear)
  const selectedSongs = useSelection((state) => state.selectedSongs)
  const download = useOffline((state) => state.download)
  const removeOffline = useOffline((state) => state.remove)
  const offlineIds = useOffline((state) => state.ids)

  if (!selected.length) return null
  const songs = selectedSongs()
  const storedCount = songs.filter((song) => offlineIds.has(song.id)).length

  return (
    <div className="selbar glass glass-strong" role="toolbar" aria-label="Selection actions">
      <button className="iconbtn" aria-label="Clear selection" onClick={clear}>
        <X size={16} />
      </button>
      <strong style={{ fontSize: 13 }}>{formatCount(selected.length, 'track')} selected</strong>

      <div className="selbar__actions">
        <button
          className="pill"
          onClick={() => {
            void usePlayer.getState().playNow(songs, 0, 'Selection')
            clear()
          }}
        >
          <Play size={14} fill="currentColor" />
          Play
        </button>
        <button className="pill" onClick={() => usePlayer.getState().enqueue(songs, 'next')}>
          <ListPlus size={14} />
          Play next
        </button>
        <button
          className="pill"
          onClick={() => usePlaylistPicker.getState().show(songs.map((song) => song.id))}
        >
          <ListPlus size={14} />
          Playlist
        </button>
        <button
          className="pill"
          onClick={async () => {
            for (const song of songs) await toggleStarSong(song)
          }}
        >
          <Heart size={14} />
          Favourite
        </button>
        <button className="pill pill-accent" onClick={() => void download(songs, 'Selection')}>
          <FolderDown size={14} />
          Sync offline
        </button>
        {storedCount > 0 ? (
          <button
            className="pill"
            title={`Delete ${storedCount} downloaded track(s)`}
            onClick={() => void removeOffline(songs.map((song) => song.id))}
          >
            <Trash2 size={14} />
            Delete downloads
          </button>
        ) : null}
      </div>
    </div>
  )
}
