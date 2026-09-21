import { useState } from 'react'
import { ListX, Sparkles, Trash2, X } from 'lucide-react'
import { artUrl } from '@/lib/artwork'
import { formatTime } from '@/lib/format'
import { usePlayer } from '@/store/player'
import { useSettings } from '@/store/settings'
import { useUi } from '@/store/ui'
import { useDismiss } from '@/lib/hooks'
import { Art } from './ui'

export function QueuePanel() {
  const open = useUi((state) => state.queueOpen)
  const setQueue = useUi((state) => state.setQueue)
  const player = usePlayer()
  const injektAutoQueue = useSettings((state) => state.injektAutoQueue)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const ref = useDismiss<HTMLElement>(open, () => setQueue(false))

  if (!open) return null

  const upcoming = player.queue.slice(player.index + 1)

  return (
    <aside className="queue glass glass-strong" ref={ref} aria-label="Play queue">
      <header className="queue__head">
        <h3>Queue</h3>
        <span className="badge">{player.queue.length}</span>
        <button
          className="iconbtn"
          aria-label="Clear everything except the current track"
          title="Clear the queue"
          onClick={player.clearQueue}
        >
          <ListX size={16} />
        </button>
        <button className="iconbtn" aria-label="Close the queue" onClick={() => setQueue(false)}>
          <X size={16} />
        </button>
      </header>

      <div className="queue__list">
        {player.index >= 0 && player.queue[player.index] ? (
          <>
            <div className="queue__label">Now playing</div>
            <QueueItem index={player.index} current />
          </>
        ) : null}

        <div className="queue__label">
          Up next
          {injektAutoQueue ? (
            <span className="badge" data-tone="accent" style={{ marginLeft: 8, height: 18 }}>
              <Sparkles size={10} />
              auto-extends
            </span>
          ) : null}
        </div>

        {upcoming.length === 0 ? (
          <p className="row__hint" style={{ padding: '6px 10px' }}>
            {injektAutoQueue
              ? 'Nothing queued — InjeKt will pick tracks that mix well with this one when it ends.'
              : 'Nothing queued. Turn on “Keep playing similar music” in Settings to have Kultr continue for you.'}
          </p>
        ) : (
          upcoming.map((_, offset) => {
            const index = player.index + 1 + offset
            return (
              <QueueItem
                key={`${player.queue[index]?.id}-${index}`}
                index={index}
                draggable
                dragging={dragIndex === index}
                dropBefore={dropIndex === index}
                onDragStart={() => setDragIndex(index)}
                onDragOver={() => setDropIndex(index)}
                onDrop={() => {
                  if (dragIndex !== null) player.move(dragIndex, index)
                  setDragIndex(null)
                  setDropIndex(null)
                }}
                onDragEnd={() => {
                  setDragIndex(null)
                  setDropIndex(null)
                }}
              />
            )
          })
        )}
      </div>
    </aside>
  )
}

function QueueItem({
  index,
  current,
  draggable,
  dragging,
  dropBefore,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  index: number
  current?: boolean
  draggable?: boolean
  dragging?: boolean
  dropBefore?: boolean
  onDragStart?: () => void
  onDragOver?: () => void
  onDrop?: () => void
  onDragEnd?: () => void
}) {
  const player = usePlayer()
  const song = player.queue[index]
  if (!song) return null

  return (
    <div
      className="queue__item"
      data-current={current}
      data-dragging={dragging}
      data-dropbefore={dropBefore}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={(event) => {
        event.preventDefault()
        onDragOver?.()
      }}
      onDrop={(event) => {
        event.preventDefault()
        onDrop?.()
      }}
      onDragEnd={onDragEnd}
      onDoubleClick={() => void player.jumpTo(index)}
    >
      <div className="queue__art">
        <Art src={artUrl(song, 80)} alt={song.album ?? song.title} />
      </div>
      <div className="trackrow__text" style={{ flex: 1, minWidth: 0 }}>
        <span className="trackrow__title">{song.title}</span>
        <span className="trackrow__artist">{song.artist}</span>
      </div>
      <span style={{ fontSize: 12, color: 'var(--ink-3)', fontVariantNumeric: 'tabular-nums' }}>
        {formatTime(song.duration)}
      </span>
      {!current ? (
        <button
          className="iconbtn"
          style={{ width: 28, height: 28 }}
          aria-label={`Remove ${song.title} from the queue`}
          onClick={() => player.removeAt(index)}
        >
          <Trash2 size={14} />
        </button>
      ) : null}
    </div>
  )
}
