import { useEffect, useState } from 'react'
import { FolderDown, Heart, ListPlus, Play, Trash2 } from 'lucide-react'
import type { Song } from '@/api/types'
import { toggleStarSong } from '@/lib/actions'
import { useOffline } from '@/store/offline'
import { usePlayer } from '@/store/player'
import { useSelection } from '@/store/selection'
import { useToast } from '@/store/ui'

/**
 * Drop targets for dragging tracks, albums and artists.
 *
 * The bar only exists while something is being dragged, so it costs nothing
 * the rest of the time. Targets are ordered by how often they get used:
 * queueing is the common case, deleting is the one you want furthest from
 * your cursor.
 */

interface Target {
  id: string
  label: string
  hint: string
  icon: React.ReactNode
  tone?: 'accent' | 'danger'
  run: (songs: Song[], label: string) => void | Promise<void>
}

const TARGETS: Target[] = [
  {
    id: 'next',
    label: 'Play next',
    hint: 'Jump the queue',
    icon: <Play size={18} fill="currentColor" />,
    tone: 'accent',
    run: (songs) => usePlayer.getState().enqueue(songs, 'next'),
  },
  {
    id: 'queue',
    label: 'Add to queue',
    hint: 'Play after everything else',
    icon: <ListPlus size={18} />,
    run: (songs) => usePlayer.getState().enqueue(songs, 'end'),
  },
  {
    id: 'favourite',
    label: 'Favourite',
    hint: 'Star on your server',
    icon: <Heart size={18} />,
    run: async (songs) => {
      for (const song of songs) {
        if (!song.starred) await toggleStarSong(song)
      }
      useToast.getState().show(`Favourited ${songs.length} track(s).`, 'success')
    },
  },
  {
    id: 'download',
    label: 'Sync offline',
    hint: 'Download for offline play',
    icon: <FolderDown size={18} />,
    run: (songs, label) => void useOffline.getState().download(songs, label),
  },
  {
    id: 'remove',
    label: 'Delete downloads',
    hint: 'Remove the local copies',
    icon: <Trash2 size={18} />,
    tone: 'danger',
    run: (songs) => void useOffline.getState().remove(songs.map((song) => song.id)),
  },
]

export function DropZone() {
  const dragging = useSelection((state) => state.dragging)
  const dropTarget = useSelection((state) => state.dropTarget)
  const setDropTarget = useSelection((state) => state.setDropTarget)
  const endDrag = useSelection((state) => state.endDrag)
  const [visible, setVisible] = useState(false)

  // Keep the bar mounted for the exit transition.
  useEffect(() => {
    if (dragging) setVisible(true)
    else {
      const timer = window.setTimeout(() => setVisible(false), 200)
      return () => window.clearTimeout(timer)
    }
  }, [dragging])

  // A drag that ends anywhere else must still clear the state.
  useEffect(() => {
    if (!dragging) return
    const onEnd = () => endDrag()
    window.addEventListener('dragend', onEnd)
    window.addEventListener('drop', onEnd)
    return () => {
      window.removeEventListener('dragend', onEnd)
      window.removeEventListener('drop', onEnd)
    }
  }, [dragging, endDrag])

  if (!visible) return null

  return (
    <div className="dropzone" data-open={Boolean(dragging)} aria-hidden={!dragging}>
      <div className="dropzone__label">
        Drop “{dragging?.label ?? ''}” on…
      </div>
      <div className="dropzone__targets">
        {TARGETS.map((target) => (
          <div
            key={target.id}
            className="dropzone__target glass"
            data-over={dropTarget === target.id}
            data-tone={target.tone}
            onDragOver={(event) => {
              event.preventDefault()
              event.dataTransfer.dropEffect = 'copy'
              if (dropTarget !== target.id) setDropTarget(target.id)
            }}
            onDragLeave={() => setDropTarget(null)}
            onDrop={(event) => {
              event.preventDefault()
              const payload = useSelection.getState().dragging
              endDrag()
              if (payload?.songs.length) void target.run(payload.songs, payload.label)
            }}
          >
            {target.icon}
            <strong>{target.label}</strong>
            <small>{target.hint}</small>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Props that make anything draggable as a set of tracks.
 *
 * `resolve` is async so an album card does not have to load its track list
 * until the moment someone actually drags it.
 */
export function draggableProps(
  label: string,
  kind: 'songs' | 'album' | 'artist' | 'playlist',
  resolve: () => Song[] | Promise<Song[]>,
) {
  return {
    draggable: true,
    onDragStart: (event: React.DragEvent) => {
      event.dataTransfer.effectAllowed = 'copy'
      event.dataTransfer.setData('text/plain', label)
      // Start with whatever we have; fill in async results as they arrive.
      const immediate = resolve()
      if (Array.isArray(immediate)) {
        useSelection.getState().startDrag({ kind, songs: immediate, label })
      } else {
        useSelection.getState().startDrag({ kind, songs: [], label })
        void immediate.then((songs) => {
          const current = useSelection.getState().dragging
          if (current && current.label === label) {
            useSelection.getState().startDrag({ ...current, songs })
          }
        })
      }
    },
    onDragEnd: () => useSelection.getState().endDrag(),
  }
}
