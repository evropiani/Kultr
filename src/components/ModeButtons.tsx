import { Infinity as InfinityIcon, Repeat, Repeat1, Shuffle } from 'lucide-react'
import { shuffleModeOf, usePlayer } from '@/store/player'
import { useSettings } from '@/store/settings'

const SHUFFLE_LABEL = {
  off: 'Shuffle off',
  shuffle: 'Shuffle on',
  karousel: 'Karousel on',
} as const

const REPEAT_LABEL = {
  off: 'Repeat off',
  all: 'Repeat the queue',
  one: 'Repeat this track',
} as const

/**
 * Shuffle, and a second tap for Karousel: off → shuffle → Karousel → off.
 * Sits on a tinted disc while either is on, so it reads at a glance.
 */
export function ShuffleButton({ size }: { size: number }) {
  const shuffle = usePlayer((state) => state.shuffle)
  const cycleShuffle = usePlayer((state) => state.cycleShuffle)
  const karousel = useSettings((state) => state.injektAutoQueue)
  const mode = shuffleModeOf(shuffle, karousel)
  return (
    <button
      className="iconbtn iconbtn--mode"
      data-active={mode !== 'off'}
      data-mode={mode}
      aria-label={SHUFFLE_LABEL[mode]}
      title={`${SHUFFLE_LABEL[mode]} (tap to change)`}
      onClick={() => cycleShuffle()}
    >
      {mode === 'karousel' ? <InfinityIcon size={size + 2} /> : <Shuffle size={size} />}
    </button>
  )
}

/** Repeat: off → the queue → this track. On a tinted disc while on. */
export function RepeatButton({ size }: { size: number }) {
  const repeat = usePlayer((state) => state.repeat)
  const cycleRepeat = usePlayer((state) => state.cycleRepeat)
  return (
    <button
      className="iconbtn iconbtn--mode"
      data-active={repeat !== 'off'}
      aria-label={REPEAT_LABEL[repeat]}
      title={REPEAT_LABEL[repeat]}
      onClick={cycleRepeat}
    >
      {repeat === 'one' ? <Repeat1 size={size} /> : <Repeat size={size} />}
    </button>
  )
}
