import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { ListMusic, Plus } from 'lucide-react'
import type { Playlist } from '@/api/types'
import { allPlaylists } from '@/db'
import { addToPlaylist, createPlaylistWith } from '@/lib/actions'
import { formatCount } from '@/lib/format'
import { Modal } from './ui'

interface PickerState {
  songIds: string[]
  open: boolean
  show: (songIds: string[]) => void
  close: () => void
}

export const usePlaylistPicker = create<PickerState>((set) => ({
  songIds: [],
  open: false,
  show: (songIds) => set({ songIds, open: songIds.length > 0 }),
  close: () => set({ open: false, songIds: [] }),
}))

/** Rendered once in the shell; any track menu can open it. */
export function AddToPlaylistModal() {
  const { open, songIds, close } = usePlaylistPicker()
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setName('')
    void allPlaylists().then(setPlaylists)
  }, [open])

  const handleAdd = async (playlistId: string) => {
    setBusy(true)
    await addToPlaylist(playlistId, songIds)
    setBusy(false)
    close()
  }

  const handleCreate = async () => {
    if (!name.trim()) return
    setBusy(true)
    await createPlaylistWith(name.trim(), songIds)
    setBusy(false)
    close()
  }

  return (
    <Modal open={open} onClose={close} title={`Add ${formatCount(songIds.length, 'track')} to…`}>
      <div className="login__field" style={{ marginBottom: 16 }}>
        <label htmlFor="new-playlist">New playlist</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <div className="field" style={{ flex: 1 }}>
            <Plus size={16} />
            <input
              id="new-playlist"
              value={name}
              placeholder="Name your playlist"
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void handleCreate()
              }}
            />
          </div>
          <button className="pill pill-accent pill-lg" disabled={!name.trim() || busy} onClick={handleCreate}>
            Create
          </button>
        </div>
      </div>

      <div className="hairline" style={{ margin: '4px 0 12px' }} />

      {playlists.length === 0 ? (
        <p className="row__hint">
          You have no playlists yet. Create one above — it is saved on your Navidrome server, so every
          client sees it.
        </p>
      ) : (
        <div style={{ display: 'grid', gap: 4 }}>
          {playlists.map((playlist) => (
            <button
              key={playlist.id}
              className="login__profile"
              disabled={busy}
              onClick={() => void handleAdd(playlist.id)}
            >
              <ListMusic size={16} />
              <span style={{ flex: 1, minWidth: 0 }}>
                {playlist.name}
                <small>{formatCount(playlist.songCount, 'track')}</small>
              </span>
            </button>
          ))}
        </div>
      )}
    </Modal>
  )
}
